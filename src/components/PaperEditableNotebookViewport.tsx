import {forwardRef,useCallback,useEffect,useImperativeHandle,useLayoutEffect,useMemo,useRef,useState,type PointerEvent as ReactPointerEvent,type ReactNode} from 'react';
import type {PaperCommand,PaperDocument,PaperObject} from '../lib/notebookDocument';
import type {NotebookMediaScope} from './NotebookEditor';
import type {usePaperDocument} from '../hooks/usePaperDocument';
import {PaperPageViewport,type PaperPageViewportHandle} from './PaperPageViewport';
import {PaperEditablePageHost,type PaperEditablePageHostProps} from './PaperEditablePageHost';
import {PaperCanonicalTextHost,type PaperCanonicalTextHostHandle,type PaperCanonicalTextHostActivity,type PaperCanonicalTextPaintCoverage} from './PaperCanonicalTextHost';
import {createPaperPageWriterRegistry,type PaperPageWriterLease} from '../lib/paperPageWriterRegistry';
import {registerNotebookWriter,runNotebookOperation} from '../lib/notebookSession';
import {createNotebookAcceptedWrite} from '../lib/notebookAcceptedWrite';
import {preparePaperInterruptedInk,preservePaperInterruptedInk,type PaperInkRecoveryScope} from '../lib/paperInterruptedInk';
import {createPaperInkPrefixJournal,appendPaperInkPrefixJournal,capturePaperInkPrefixObject,preparePaperInkPrefixCanonical,confirmPaperInkPrefixCanonical,interruptPaperInkPrefixJournal,discardPaperInkPrefixJournal,type PaperInkPrefixJournalHeader} from '../lib/paperInkPrefixJournal';
import {getDraft,putSnapshot} from '../../pwa/src/storage';
import {notebookDocumentId} from '../lib/notebookIdentity';
import {createPaperViewportGesture,type PaperViewportAction} from '../lib/paperViewportGesture';
import {paperObjectsOnPage,reflowPaperText} from '../lib/paperTextFlow';
import {resolvePaperSearchHit} from '../lib/paperSearch';
import type {PaperSearchNavigationRequest} from '../lib/notebookSearchNavigation';
import {compactInk,expandPaperGroups} from '../lib/paperTransforms';
import {createPaperLassoSelection} from '../lib/paperGeometry';
import {effectivePaperDrawingGuide,type PaperStrokeCorrectionOptions} from '../lib/paperDrawingGuide';
import {paperInkAuthoringIntent,type PaperInkIntent,type PaperInkCancellation} from '../lib/paperInkInput';
import type {PaperInkPreviewStyle} from './PaperInkPreview';
import type {PaperPageInkController,PaperPageInkSubmission,PaperPageInkActivity,PaperPageInkInterruption,PaperPageInkSource,PaperPageInkCheckpointChunk} from '../hooks/usePaperPageInkController';
import type {PaperPageViewportMode} from '../lib/paperPageViewport';
import './paper-editable-notebook-viewport.css';

type DocumentWriter=ReturnType<typeof usePaperDocument>;
export interface PaperEditableNotebookViewportHandle {
 navigate:(pageId:string,pageY?:number)=>boolean;
 cancelInputs:()=>void;flush:()=>Promise<boolean>;settled:()=>Promise<boolean>;
 getElement:()=>HTMLDivElement|null;getController:(pageId:string)=>PaperPageInkController|null;
 isInkRecoveryPending:(id:string)=>boolean;
 highlightSearch:(request:PaperSearchNavigationRequest)=>boolean;clearSearch:()=>void;
}
export interface PaperEditableNotebookViewportProps {
 document:PaperDocument;paper:DocumentWriter;media:NotebookMediaScope;ownerKey:string;generation:number;
 current:()=>boolean;authorityReady?:()=>boolean;writable:boolean;mode:PaperPageViewportMode;zoom:number;
 selectedPageId:string;selected:readonly string[];intent:PaperInkIntent|null;textInteractionDisabled?:boolean;
 style:PaperInkPreviewStyle;wholeEraser:boolean;fingerInk:boolean;correction?:PaperStrokeCorrectionOptions;
 onSelect:(pageId:string,ids:string[])=>void;onTool?:(intent:PaperInkIntent|null)=>void;
 onZoom:(zoom:number)=>void;onAuthored?:(ids:string[])=>void;onEraserDone?:()=>void;
 onInkCorrection?:(source:PaperPageInkSubmission,original:PaperObject,expected:PaperObject,document:PaperDocument)=>void;
 onCanonicalLayout?:(before:PaperDocument,after:PaperDocument,objectId:string)=>void;
 onNotice:(message:string)=>void;onUploadImage?:(file:File,current:()=>boolean)=>Promise<string>;
 onSurface?:(pageId:string,controller:PaperPageInkController|null)=>void;
 onPageContact?:(pageId:string,point:{x:number;y:number})=>boolean;
 pdfOptions?:(pageId:string)=>PaperEditablePageHostProps['pdfOptions'];onAudio?:PaperEditablePageHostProps['onAudio'];
 renderOverlay?:(pageId:string,controller:PaperPageInkController,current:()=>boolean)=>ReactNode;
}
interface Authority {serial:number;ownerKey:string;generation:number;api:NotebookMediaScope['api'];revoked:boolean}
interface TextRecovery {objectId:string;pageId:string;baseline:PaperDocument;durable:Promise<unknown>;finalizing:boolean;failed?:boolean}
interface TextEntry {
 key:string;authority:Authority;objectId:string;document:PaperDocument;media:NotebookMediaScope;
 paper:DocumentWriter;lease:PaperPageWriterLease;handle:PaperCanonicalTextHostHandle|null;
 projectionPage:string;suspended:boolean;editorVersions:Map<number,number>;unregister?:()=>void;closing?:Promise<void>;
 recovery?:TextRecovery;recoveryWork?:Promise<void>;
}
const MAX_PINNED_PAGES=16,MAX_CANONICAL_WRITERS=8;
interface InkAdmission {id:string;createdAt:number;scope:PaperInkRecoveryScope;ownerKey:string;generation:string|number;api:object|null|undefined;pageId:string;pointerId:number;pointerType:PaperPageInkSource['pointerType'];journal:PaperInkPrefixJournalHeader;terminal:boolean;discarded?:boolean;unregister:()=>void;work?:Promise<void>;finalize?:()=>Promise<void>;preservation?:ReturnType<typeof createNotebookAcceptedWrite>;}
/** One editable viewport owns all page inputs and one canonical writer per text
 * object. Frames are readers; their removal never tears down the text editor.
 * Old writers remain mounted, hidden, until their explicit preservation succeeds. */
export const PaperEditableNotebookViewport=forwardRef<PaperEditableNotebookViewportHandle,PaperEditableNotebookViewportProps>(function PaperEditableNotebookViewport(props,ref){
 const latest=useRef(props);latest.current=props;
 const viewIdentity=useMemo(()=>Object.freeze({}),[props.ownerKey,props.media.api,props.document.noteId,props.document.collaboration?.lineage]);
 const controllerRecords=useRef(new Set<{authority:Authority;controller:PaperPageInkController}>());
 const mounted=useRef(true),viewport=useRef<PaperPageViewportHandle>(null),controllers=useRef(new Map<string,PaperPageInkController>());
 const authorityRef=useRef<Authority|null>(null),registry=useRef(createPaperPageWriterRegistry()),entries=useRef(new Map<string,TextEntry>());
 const paintCoverage=useRef(new Map<TextEntry,PaperCanonicalTextPaintCoverage>());
 const pins=useRef(new Map<object,{pageId:string;serial:number}>()),contacts=useRef(new Map<object,PaperPageInkActivity>()),selectionContacts=useRef(new Map<object,{objects:PaperObject[];point:{x:number;y:number}}>());
 const inkAdmissions=useRef(new Map<object,InkAdmission>());
 const gesture=useRef(createPaperViewportGesture()),[version,refresh]=useState(0);
 const recoveryNavigation=useRef<{authority:Authority;pageId:string}|null>(null);
 const suspendedScope=useRef<Authority|null>(null);
 if(!authorityRef.current||authorityRef.current.ownerKey!==props.ownerKey||authorityRef.current.generation!==props.generation||authorityRef.current.api!==props.media.api){
  if(authorityRef.current)authorityRef.current.revoked=true;
  authorityRef.current={serial:(authorityRef.current?.serial??0)+1,ownerKey:props.ownerKey,generation:props.generation,api:props.media.api,revoked:false};
 }
 const authority=authorityRef.current,suspended=suspendedScope.current===authority;
 const ready=()=>mounted.current&&(latest.current.authorityReady?.()??true);
 const owner=registry.current.activate({accountId:props.media.accountId,spaceId:props.media.spaceId,noteId:props.document.noteId,api:props.media.api,generation:props.generation});
 const current=(source:Authority=authority)=>{
  if(!ready()||source.revoked||authorityRef.current!==source)return false;
  let allowed=false;try{allowed=latest.current.current()&&latest.current.media.api===source.api&&latest.current.ownerKey===source.ownerKey&&latest.current.generation===source.generation;}catch{}
  if(!allowed)source.revoked=true;return allowed;
 };
 const writable=(source:Authority=authority)=>current(source)&&latest.current.writable&&suspendedScope.current!==source;
 const redraw=()=>{if(mounted.current)refresh(value=>value+1);};
 const pin=useCallback((pageId:string,token:object,serial=authorityRef.current?.serial??-1)=>{
  const distinct=new Set([...pins.current.values()].filter(value=>value.serial===serial).map(value=>value.pageId));if(!distinct.has(pageId)&&distinct.size>=MAX_PINNED_PAGES)throw Error('Terminez la saisie ou le dessin sur une page avant d’en ouvrir une autre.');
  const value={pageId,serial};pins.current.set(token,value);redraw();let held=true;return()=>{if(!held)return;held=false;if(pins.current.get(token)===value){pins.current.delete(token);redraw();}};
 },[]);
 const cancelInputs=(cancellation:PaperInkCancellation={cause:'tool-change',disposition:'preserve-ink'})=>{for(const controller of controllers.current.values())controller.cancel('cancelled',cancellation);selectionContacts.current.clear();gesture.current.cancel();};
 const preserve=async(entry:TextEntry,cause:'viewport'|'scope-change'='scope-change')=>{
  if(entry.closing)return entry.closing;
  entry.closing=Promise.resolve().then(async()=>{
   // A current dirty writer publishes to its captured canonical source before
   // losing interactive authority. Retired owners use their recovery barrier.
   if(cause==='viewport'&&(!entry.handle||await entry.handle.flush()!==true||await entry.handle.settled()!==true))return {status:'pinned' as const};
   // A flush can create a recovery target. Its own durable barrier must finish
   // before the old immutable source lease is retired.
   if(cause==='viewport'&&entry.recovery&&!entry.recovery.finalizing)return {status:'pinned' as const};
   if(cause==='viewport'&&!latest.current.document.objects.some(object=>object.id===entry.objectId))entry.lease.activity({caretPageId:null});
   return entry.lease.evict(cause);
  }).then(result=>{
   if(result.status==='released'){entry.unregister?.();entries.current.delete(entry.key);redraw();}
   else if(cause!=='viewport'&&current())latest.current.onNotice('Le texte en cours reste conservé dans son éditeur. Terminez la composition ou réessayez son enregistrement avant de fermer.');
  }).finally(()=>{entry.closing=undefined;});return entry.closing;
 };
 const finishRecovery=(entry:TextEntry)=>{
  const recovery=entry.recovery;if(!recovery||recovery.failed||entry.recoveryWork||!entry.handle||!writable(entry.authority)||!entry.lease.current())return;
  // Never drain from inside onChange: that publication owns the writer's current
  // flush promise. Schedule independently and wait for the exact captured tail.
  entry.recoveryWork=Promise.resolve().then(async()=>{
   await recovery.durable;
   if(entry.closing)await entry.closing;
   if(entry.recovery!==recovery||!writable(entry.authority)||!entry.lease.current()||!entry.handle)return;
   if(await entry.handle.flush()!==true||await entry.handle.settled()!==true||entry.handle.pending()||entry.handle.composing())return;
   if(entry.recovery!==recovery||!writable(entry.authority)||!entry.lease.current())return;
   const document=entry.paper.getCurrent(),object=document?.objects.find(object=>object.id===recovery.objectId);
   if(!document)return;
   if(!object){
    // This buffer is already confirmed. A later Delete/Undo must not reinsert it
    // into the canonical note; keep its exact accepted version privately instead.
    const saved=recovery.baseline.objects.find(object=>object.id===recovery.objectId);
    if(!saved)return;
    const editorId=`${entry.document.noteId}-${entry.objectId}`;
    await putSnapshot({key:`paper-editor-recovery|${entry.media.accountId}|${entry.media.spaceId}|${editorId}|retarget|${crypto.randomUUID()}`,accountId:entry.media.accountId,spaceId:entry.media.spaceId,value:{schema:2,kind:'paper-editor-buffer',noteId:entry.document.noteId,editorId,markdown:saved.markdown??'',baseline:recovery.baseline,composing:false,unconfirmedDOM:false,generation:entry.authority.generation,createdAt:new Date().toISOString()}});
    if(entry.recovery!==recovery||!writable(entry.authority)||!entry.lease.current())return;
    latest.current.onNotice('La zone récupérée a été supprimée. Sa version sauvegardée reste conservée dans les versions de récupération.');
   }
   if(object&&!document.pages.some(page=>page.id===object.pageId))return;
   recovery.finalizing=true;entry.lease.activity({dirty:false,composing:false,caretPageId:null});
   const follow=object&&(latest.current.selected.includes(entry.objectId)||latest.current.selected.includes(recovery.objectId));
   if(follow&&object){recoveryNavigation.current={authority:entry.authority,pageId:object.pageId};latest.current.onSelect(object.pageId,[recovery.objectId]);}
   await preserve(entry,'viewport');
   if(entries.current.get(entry.key)===entry){recovery.finalizing=false;return;}
   redraw();
  }).catch(error=>{recovery.failed=true;if(current(entry.authority))latest.current.onNotice(String(error instanceof Error?error.message:error));}).finally(()=>{
   entry.recoveryWork=undefined;if(entry.recovery!==recovery)redraw();
  });
 };
 const lifetime=useRef(0);
 useLayoutEffect(()=>{mounted.current=true;const incarnation=++lifetime.current;return()=>{
  mounted.current=false;cancelInputs({cause:'unmount',disposition:'preserve-ink'});
  // Strict replay reappears synchronously with the same live registry. Its
  // artificial cleanup must not permanently retire that registry's leases.
  // A real unmount still revokes admission immediately and preserves its
  // captured writers in the next microtask, before their account can close.
  queueMicrotask(()=>{if(mounted.current||lifetime.current!==incarnation)return;for(const entry of entries.current.values())void preserve(entry);});
 };},[]);
 useLayoutEffect(()=>{const pending=recoveryNavigation.current;if(!pending)return;if(!current(pending.authority)){recoveryNavigation.current=null;return;}if(viewport.current?.scrollToAnchor({pageId:pending.pageId,pageY:0,viewportOffset:0}))recoveryNavigation.current=null;},[props.document,props.selectedPageId,version]);
 useEffect(()=>{
  for(const entry of entries.current.values()){
   // Opening a replacement document can retain this exact viewport with its
   // captured props. Its source current() still retires immediately, even
   // before replacement props arrive, and must drain/release old writers.
   if(entry.authority!==authority||!current(entry.authority))void preserve(entry);
   else if(entry.recovery)finishRecovery(entry);
   else if(!props.document.objects.some(object=>object.id===entry.objectId))void preserve(entry,'viewport');
   else if(!props.selected.includes(entry.objectId)&&entry.handle&&!entry.handle.pending()&&!entry.handle.composing()&&!entry.handle.activity()?.editor.focused)void preserve(entry,'viewport');
  }
  const object=props.intent===null&&props.writable?props.document.objects.find(object=>props.selected.includes(object.id)&&(object.kind==='text'||object.kind==='sticky')&&!object.locked):undefined;
  if(!object||!current())return;
  if([...entries.current.values()].some(entry=>entry.authority===authority&&entry.recovery?.objectId===object.id))return;
  const key=`${owner.serial}|${object.id}`;
  if(entries.current.has(key))return;
  if(entries.current.size>=MAX_CANONICAL_WRITERS){if(current())props.onNotice('Des saisies restent ouvertes. Terminez leur composition ou leur enregistrement avant d’ouvrir une autre zone de texte.');return;}
  let entry:TextEntry;
  const acquired=owner.acquire({objectId:object.id,sourcePageId:object.pageId,pageId:object.pageId,pageIds:object.textFlow?.pageIds??[object.pageId],writer:{flush:async()=>entry.handle?entry.handle.flush():false,settled:async()=>entry.handle?entry.handle.settled():false}});
  if(acquired.status!=='acquired')return;
  entry={key,authority,objectId:object.id,document:props.document,media:props.media,paper:props.paper,lease:acquired.lease,handle:null,projectionPage:props.selectedPageId,suspended:false,editorVersions:new Map()};
  entry.unregister=registerNotebookWriter(entry.media.accountId,{flush:async()=>{if(!entry.handle||await entry.handle.flush()!==true)throw Error('Le texte d’origine attend sa conservation.');},settled:async()=>{if(!entry.handle||await entry.handle.settled()!==true)throw Error('Le texte d’origine attend la fin de sa composition ou un enregistrement confirmé.');},pending:()=>!entry.handle||entry.handle.pending(),suspend:()=>{entry.suspended=true;redraw();},resume:()=>{entry.suspended=false;redraw();}});
  entries.current.set(key,entry);redraw();
 },[authority,owner,props.selected.join('|'),props.intent,props.writable,props.document,version]);
 // Preserve offscreen editors without retiring their interactive lease when a
 // native close merely flushes. Composition refuses close instead of guessing.
 const flushEntries=async(source:Authority=authorityRef.current!)=>{
  for(const entry of entries.current.values())if(entry.authority===source&&(!entry.handle||await entry.handle.flush()!==true))return false;
  return true;
 };
 const settledEntries=async(source:Authority=authorityRef.current!)=>{
  for(const entry of entries.current.values())if(entry.authority===source&&(!entry.handle||await entry.handle.settled()!==true))return false;
  await Promise.all([...controllerRecords.current].filter(record=>record.authority===source).map(record=>record.controller.whenSettled()));return true;
 };
 const clearSearch=()=>{if(!current(authority))return;for(const entry of entries.current.values())if(entry.authority===authority)entry.handle?.clearSearch();};
 const highlightSearch=(request:PaperSearchNavigationRequest)=>{
  if(!current(authority)||latest.current.document!==request.document||latest.current.paper.getCurrent()!==request.document||request.current()!==true)return false;
  const resolved=resolvePaperSearchHit(request.document,request.hit);if(!resolved?.objectId||resolved.kind!=='text'||latest.current.selectedPageId!==resolved.pageId)return false;
  const entry=[...entries.current.values()].find(value=>value.authority===authority&&!value.recovery&&!value.suspended&&value.objectId===resolved.objectId&&value.lease.current());
  if(!entry?.handle||!entry.handle.highlightSearch({...request,scroll:false,current:()=>current(authority)&&entry.lease.current()&&!entry.recovery&&latest.current.document===request.document&&request.current()===true}))return false;
  if(request.scroll!==false){
   const container=viewport.current?.getElement(),host=[...container?.querySelectorAll<HTMLElement>('[data-canonical-text-object]')??[]].find(node=>node.dataset.canonicalTextObject===resolved.objectId&&node.dataset.canonicalTextPage===resolved.pageId&&node.dataset.textHostParked==='false'&&node.dataset.textHostRevoked==='false');
   const frame=host?.getBoundingClientRect();if(frame){const rect=[...host!.querySelectorAll<HTMLElement>('[data-paper-editor-search]')].flatMap(node=>[...node.getClientRects()]).find(rect=>rect.height>0&&rect.bottom>frame.top&&rect.top<frame.bottom);if(rect&&current(authority)&&request.current())viewport.current?.scrollToAnchor({pageId:resolved.pageId,pageY:Math.max(0,(Math.max(rect.top,frame.top)-frame.top)/latest.current.zoom-12),viewportOffset:80});}
  }
  return current(authority)&&request.current();
 };
 const operations=useRef({flushEntries,settledEntries,cancelInputs,current,highlightSearch,clearSearch});operations.current={flushEntries,settledEntries,cancelInputs,current,highlightSearch,clearSearch};
 useEffect(()=>registerNotebookWriter(props.media.accountId,{flush:async()=>{if([...contacts.current.values()].some(contact=>contact.generation===authority.generation&&contact.api===authority.api&&contact.ownerKey===authority.ownerKey&&contact.phase==='capturing'))throw Error('Terminez le dessin en cours avant de fermer le carnet.');if(await flushEntries(authority)!==true)throw Error('Une saisie attend sa conservation.');},settled:async()=>{if(await settledEntries(authority)!==true)throw Error('Une saisie est encore en composition ou son enregistrement n’est pas confirmé.');},pending:()=>[...entries.current.values()].some(entry=>entry.authority===authority&&(!entry.handle||entry.handle.pending()))||[...contacts.current.values()].some(contact=>contact.ownerKey===authority.ownerKey&&contact.generation===authority.generation&&contact.api===authority.api&&contact.phase!=='idle'),suspend:()=>{if(!current(authority))return;suspendedScope.current=authority;for(const record of controllerRecords.current)if(record.authority===authority)record.controller.cancel('cancelled',{cause:'authority-revoked',disposition:'preserve-ink'});redraw();},resume:()=>{if(suspendedScope.current===authority){suspendedScope.current=null;redraw();}}}),[props.media.accountId,authority]);
 useImperativeHandle(ref,()=>({highlightSearch:request=>operations.current.highlightSearch(request),clearSearch:()=>operations.current.clearSearch(),navigate:(pageId,pageY=0)=>current(authority)&&latest.current.document.pages.some(page=>page.id===pageId)&&viewport.current?.scrollToAnchor({pageId,pageY,viewportOffset:0})===true,cancelInputs:()=>{if(current(authority))cancelInputs();},flush:()=>flushEntries(authority),settled:()=>settledEntries(authority),getElement:()=>current(authority)?viewport.current?.getElement()??null:null,getController:pageId=>current(authority)?controllers.current.get(pageId)??null:null,isInkRecoveryPending:id=>[...inkAdmissions.current.values()].some(admission=>admission.id===id&&!admission.terminal)}),[authority]);
 const command=(value:PaperCommand,valid:()=>boolean)=>{
  if(!writable()||!valid())return false;
  const accepted=latest.current.paper.command(value);if(accepted&&writable()){
   const ids=(value:PaperCommand):string[]=>value.type==='upsert-object'?[value.object.id]:value.type==='patch-object'?[value.id]:value.type==='batch'?value.commands.flatMap(ids):[];
   latest.current.onAuthored?.(ids(value));
  }return accepted;
 };
 const strokeCurrent=(source:PaperPageInkSubmission)=>writable()&&source.current()&&source.ownerKey===authority.ownerKey&&source.generation===authority.generation&&source.api===authority.api;
 const sameInkAdmission=(admission:InkAdmission,source:PaperPageInkSource)=>admission.ownerKey===source.ownerKey&&admission.generation===source.generation&&admission.api===source.api&&admission.pageId===source.pageId&&admission.pointerId===source.pointerId&&admission.pointerType===source.pointerType;
 // A prefix ACK is not a final save. Retain this captured writer until a
 // canonical proof, a complete recovery receipt or a durable discard exists.
 const finishInk=(admission:InkAdmission)=>{admission.terminal=true;admission.unregister();};
 const inkWork=(admission:InkAdmission,operation:()=>Promise<void>)=>{
  const previous=admission.work,work=(previous?previous.catch(()=>{}):Promise.resolve()).then(operation);admission.work=work;
  void work.catch(()=>{});const clear=()=>{if(admission.work===work)admission.work=undefined;};void work.then(clear,clear);return work;
 };
 const rememberInk=(source:PaperPageInkSubmission)=>{
  if(!paperInkAuthoringIntent(source.stroke.intent)||inkAdmissions.current.has(source.token))return;
  const id=crypto.randomUUID(),createdAt=Date.now(),scope=Object.freeze({accountId:props.media.accountId,spaceId:props.media.spaceId,noteId:props.document.noteId});
  const admission:InkAdmission={id,createdAt,scope,ownerKey:source.ownerKey,generation:source.generation,api:source.api,pageId:source.pageId,pointerId:source.pointerId,pointerType:source.pointerType,terminal:false,unregister:()=>{},journal:createPaperInkPrefixJournal(scope,id,{ownerKey:source.ownerKey,generation:source.generation,pageId:source.pageId,pointerType:source.pointerType,pen:source.stroke.intent as 'pen'|'pencil'|'calligraphy'|'highlighter',createdAt,geometry:source.geometry,style:source.style})};
  inkAdmissions.current.set(source.token,admission);
  const settle=async()=>{if(admission.terminal)return;if(admission.work)await admission.work.catch(error=>{if(!admission.finalize)throw error;});if(admission.terminal)return;if(admission.finalize)await inkWork(admission,admission.finalize);if(!admission.terminal)throw Error('Terminez le trait ou conservez sa récupération avant de fermer le carnet.');};
  admission.unregister=registerNotebookWriter(scope.accountId,{flush:settle,settled:settle,pending:()=>!admission.terminal,suspend:()=>{},resume:()=>{}});
 };
 const checkpointInk=async(packet:PaperPageInkCheckpointChunk)=>{
  const admission=inkAdmissions.current.get(packet.token);if(!admission||!sameInkAdmission(admission,packet))throw Error('Le préfixe attend son contact d’origine.');let confirmedCursor=packet.from;
  await inkWork(admission,async()=>{const result=await appendPaperInkPrefixJournal(admission.journal,packet);admission.journal=result.header;confirmedCursor=result.confirmedCursor;});
  return {confirmedCursor};
 };
 const conserveInk=async(input:PaperPageInkInterruption)=>{
  const admission=inkAdmissions.current.get(input.token);
  if(!input.admitted||!input.stroke||!paperInkAuthoringIntent(input.stroke.intent))return;
  if(!admission||!sameInkAdmission(admission,input))throw Error('Le trait interrompu attend la conservation de son contact d’origine.');
  if(admission.terminal)return;
  if(input.cancellation.disposition==='discard'||admission.discarded){
   if(!admission.discarded){admission.discarded=true;const cause=input.cancellation.cause;admission.finalize=async()=>{admission.journal=await discardPaperInkPrefixJournal(admission.journal,cause);finishInk(admission);};}
   await inkWork(admission,admission.finalize!);return;
  }
  if(!admission.preservation){
   const prepared=preparePaperInterruptedInk(admission.scope,admission.id,input,admission.createdAt);
   admission.preservation=createNotebookAcceptedWrite({source:admission.scope,value:prepared,save:async(_source,value)=>preservePaperInterruptedInk(value),preserve:async(_source,value)=>preservePaperInterruptedInk(value)});
   const points=input.stroke.points,cause=input.cancellation.cause;
   const finalize=async()=>{
    await admission.preservation!.flush();
    // Complete raw receipt is an independent durable fallback even if the
    // prefix storage failed. A leftover prefix is deduplicated by receipt ID.
    try{while(admission.journal.state==='active'&&admission.journal.confirmedCursor<points.length){const from=admission.journal.confirmedCursor,to=Math.min(points.length,from+4096),result=await appendPaperInkPrefixJournal(admission.journal,{from,to,total:points.length,points:points.slice(from,to)});admission.journal=result.header;}if(admission.journal.confirmedCursor===points.length)admission.journal=await interruptPaperInkPrefixJournal(admission.journal,cause,points.length);}catch{/* Complete old-owner receipt remains the durability proof. */}
    if(admission.finalize===finalize&&!admission.discarded){finishInk(admission);if(current())props.onNotice('Un trait interrompu a été conservé. Retrouvez-le dans les traits récupérables de cette note.');}
   };
   admission.finalize=finalize;
  }
  await inkWork(admission,admission.finalize!);
 };
 const commitStroke=async(source:PaperPageInkSubmission)=>runNotebookOperation(props.media.accountId,async()=>{
  const valid=()=>strokeCurrent(source);if(!valid())return false;
  // A laser is a transient preview. It must not wait for or alter a text save.
  if(source.stroke.intent==='laser')return true;
  if(await operations.current.flushEntries()!==true){if(valid())props.onNotice('Terminez la composition du texte avant de modifier cette page.');return false;}
  await props.paper.whenSaved();if(!valid())return false;
  const baseline=props.paper.getCurrent();if(!baseline)return false;
  const target=baseline.pages.find(page=>page.id===source.pageId),pts=source.corrected?.points??source.stroke.points;
  if(!target)return false;
  const exact=()=>valid()&&props.paper.getCurrent()===baseline;
  const objects=paperObjectsOnPage(baseline,target.id);
  if(source.stroke.intent==='lasso'){
   if(!exact())return false;const contains=createPaperLassoSelection(pts);props.onSelect(target.id,expandPaperGroups(objects,objects.filter(contains).map(object=>object.id)));props.onTool?.('select');return true;
  }
  if(source.stroke.intent==='select'){
   const held=selectionContacts.current.get(source.token);selectionContacts.current.delete(source.token);if(!held||!pts.length)return false;
   const end=pts.at(-1)!,dx=end.x-held.point.x,dy=end.y-held.point.y;
   if(Math.hypot(dx,dy)<.1)return true;
   // Metadata and geometry edited concurrently must not be overwritten by drag.
   const commands:PaperCommand[]=held.objects.flatMap(object=>{const fresh=baseline.objects.find(value=>value.id===object.id);return fresh&&!fresh.locked&&JSON.stringify(fresh)===JSON.stringify(object)?[{type:'patch-object',id:fresh.id,patch:{x:fresh.x+dx,y:fresh.y+dy}}]:[];});
   return commands.length>0&&command({type:'batch',commands},exact);
  }
  if(source.stroke.intent==='eraser'){
   const {planPaperInkGestureErase}=await import('../lib/paperInkGestureErase');if(!exact())return false;
   const plan=await planPaperInkGestureErase({objects:baseline.objects,pages:baseline.pages,pageId:target.id,path:pts,radius:source.style.width*3,whole:source.wholeEraser,current:exact,maxGeneratedPoints:200000});
   if(!exact()||plan.status==='cancelled')return false;
   if(plan.status==='refused'){props.onNotice('La géométrie de ce geste ne peut pas être conservée exactement. Effacez une zone plus petite.');return false;}
   const accepted=plan.status==='ready'?command({type:'batch',commands:plan.commands},()=>exact()&&plan.current()):true;
   if(accepted&&valid())props.onEraserDone?.();return accepted;
  }
  const admitted=inkAdmissions.current.get(source.token);
  if(!admitted||admitted.discarded||!sameInkAdmission(admitted,source))return false;
  const original:PaperObject={id:admitted?.id??crypto.randomUUID(),kind:'ink',pageId:target.id,x:0,y:0,width:target.width,height:target.height,rotation:0,z:Math.max(0,...baseline.objects.filter(object=>object.pageId===target.id).map(object=>object.z))+1,locked:false,createdAt:admitted?.createdAt??Date.now(),points:source.stroke.points.map(point=>({...point})),color:source.style.color,strokeWidth:source.style.width,opacity:source.style.opacity,strokeStyle:source.style.strokeStyle,pen:source.stroke.intent==='pencil'||source.stroke.intent==='calligraphy'||source.stroke.intent==='highlighter'?source.stroke.intent:'pen'};
  const expected=compactInk({...original,points:pts.map(point=>({...point}))});
  // Persist the expectation BEFORE publication, so a killed process between
  // the canonical write and its marker can verify that exact object later.
  await inkWork(admitted,async()=>{const descriptor=await capturePaperInkPrefixObject(expected);if(!exact())throw Error('La page a changé avant la préparation du trait.');admitted.journal=await preparePaperInkPrefixCanonical(admitted.journal,source.stroke.points.length,descriptor);});
  if(!exact()||admitted.discarded)return false;
  const accepted=command({type:'upsert-object',object:expected},exact),saved=props.paper.getCurrent();
  const canonicalSave=accepted?props.paper.whenSaved():null;
  if(accepted&&valid()&&saved&&source.corrected)props.onInkCorrection?.(source,original,expected,saved);
  if(accepted){
   await canonicalSave;
   const unchanged=()=>valid()&&JSON.stringify(props.paper.getCurrent()?.objects.find(object=>object.id===expected.id))===JSON.stringify(expected);
   const proof=await getDraft({...admitted.scope,type:'whiteboard',documentId:notebookDocumentId(admitted.scope.noteId)});
   if(!proof||!unchanged())throw Error('La copie enregistrée du trait attend sa confirmation.');
   await inkWork(admitted,async()=>{admitted.journal=await confirmPaperInkPrefixCanonical(admitted.journal,proof,unchanged);finishInk(admitted);});
  }
  return accepted;
 });
 const onStroke=async(source:PaperPageInkSubmission)=>{
  const interrupted=(cause:'publication-refused'|'save-failed'):PaperPageInkInterruption=>({...source,geometry:source.geometry,cancellation:{cause,disposition:'preserve-ink'},admitted:true});
  let accepted:boolean;
  try{accepted=await commitStroke(source);}catch(error){if(paperInkAuthoringIntent(source.stroke.intent))try{await conserveInk(interrupted('save-failed'));}catch{/* The retained writer and controller cancellation expose the recovery failure separately. */}throw error;}
  if(paperInkAuthoringIntent(source.stroke.intent)){
   if(!accepted)await conserveInk(interrupted('publication-refused'));
  }
  return accepted;
 };
 const onActivity=(activity:PaperPageInkActivity)=>{
  if(activity.phase==='idle'){contacts.current.delete(activity.token);selectionContacts.current.delete(activity.token);const admission=inkAdmissions.current.get(activity.token);if(!admission||admission.terminal)inkAdmissions.current.delete(activity.token);}else contacts.current.set(activity.token,activity);
 };
 const objectContact=(id:string|undefined,source:PaperPageInkSubmission,event:ReactPointerEvent<SVGSVGElement>)=>{
  if(source.stroke.intent!=='select'||!strokeCurrent(source))return;
  const document=props.paper.getCurrent();if(!document)return;const objects=paperObjectsOnPage(document,source.pageId),group=id?expandPaperGroups(objects,[id]):[],previous=latest.current.selected,ids=id?(event.shiftKey?(previous.includes(id)?previous.filter(value=>!group.includes(value)):[...new Set([...previous,...group])]):previous.includes(id)?[...previous]:group):[];
  selectionContacts.current.set(source.token,{objects:document.objects.filter(object=>ids.includes(object.id)&&!object.locked),point:source.stroke.points[0]});props.onSelect(source.pageId,ids);
 };
 const activateText=(objectId:string,pageId:string,valid:()=>boolean)=>{if(!writable()||!valid())return;const held=[...entries.current.values()].find(entry=>entry.authority===authority&&entry.recovery&&(entry.objectId===objectId||entry.recovery.objectId===objectId));if(held){if(held.recovery?.failed&&!held.recoveryWork&&held.handle){held.recovery.failed=false;void held.handle.flush().then(()=>finishRecovery(held)).catch(error=>{if(current(held.authority))latest.current.onNotice(String(error instanceof Error?error.message:error));});}else finishRecovery(held);return;}const entry=[...entries.current.values()].find(entry=>entry.authority===authority&&entry.objectId===objectId);if(entry)entry.projectionPage=pageId;props.onSelect(pageId,[objectId]);redraw();};
 const blankText=(pageId:string,at:{x:number;y:number},valid:()=>boolean)=>{
  if(!writable()||!valid())return;const baseline=props.paper.getCurrent(),page=baseline?.pages.find(page=>page.id===pageId);if(!baseline||!page)return;
  const object:PaperObject={id:crypto.randomUUID(),pageId,kind:'text',x:at.x,y:at.y,width:Math.max(24,Math.min(450,page.width-at.x)),height:Math.max(24,Math.min(260,page.height-at.y)),rotation:0,z:Math.max(0,...baseline.objects.map(object=>object.z))+1,locked:false,createdAt:Date.now(),markdown:''};
  if(command({type:'upsert-object',object},()=>valid()&&props.paper.getCurrent()===baseline))props.onSelect(pageId,[object.id]);
 };
 const context=()=>({owner:`${authority.ownerKey}|${authority.generation}`,pageId:'viewport',zoom:latest.current.zoom,scrollLeft:viewport.current?.getElement()?.scrollLeft??0,scrollTop:viewport.current?.getElement()?.scrollTop??0,fingerInk:latest.current.fingerInk});
 const pinchAnchor=useRef<{authority:Authority;anchor:{pageId:string;pageY:number;viewportOffset:number};x:number}|null>(null),pendingPinch=useRef<{authority:Authority;anchor:{pageId:string;pageY:number;viewportOffset:number};x:number;clientX:number;clientY:number;zoom:number}|null>(null),[pinchVersion,setPinchVersion]=useState(0);
 const navigation=(action:PaperViewportAction)=>{
  const node=viewport.current?.getElement();if(!node)return;
  if(action.mode==='pan'){for(const controller of controllers.current.values())controller.cancel('navigation',{cause:'navigation',disposition:'discard'});selectionContacts.current.clear();node.scrollLeft=action.scrollLeft??node.scrollLeft;node.scrollTop=action.scrollTop??node.scrollTop;node.dispatchEvent(new Event('scroll'));}
  if(action.mode==='pinch'&&action.center&&action.zoom){for(const controller of controllers.current.values())controller.cancel('navigation',{cause:'navigation',disposition:'discard'});selectionContacts.current.clear();
   if(action.start){const box=node.getBoundingClientRect(),anchor=viewport.current?.captureAnchorAt(action.center.y-box.top),page=props.document.pages.find(page=>page.id===anchor?.pageId),extent=Math.max(node.clientWidth,...props.document.pages.map(page=>page.width*props.zoom));
    pinchAnchor.current=anchor&&page?{authority,anchor,x:(node.scrollLeft+action.center.x-box.left-(extent-page.width*props.zoom)/2)/props.zoom}:null;}
   if(pinchAnchor.current){pendingPinch.current={...pinchAnchor.current,clientX:action.center.x,clientY:action.center.y,zoom:action.zoom};setPinchVersion(value=>value+1);props.onZoom(action.zoom);}
  }
  if(action.mode==='cancelled'||action.mode==='ended')pinchAnchor.current=null;if(action.mode==='cancelled')pendingPinch.current=null;
 };
 useLayoutEffect(()=>{const held=pendingPinch.current;pendingPinch.current=null;const node=viewport.current?.getElement();if(!held||held.authority!==authority||!node||!current())return;const page=props.document.pages.find(page=>page.id===held.anchor.pageId);if(!page)return;const box=node.getBoundingClientRect(),extent=Math.max(node.clientWidth,...props.document.pages.map(page=>page.width*props.zoom));
  viewport.current?.scrollToAnchor({...held.anchor,viewportOffset:held.clientY-box.top});node.scrollLeft=Math.max(0,(extent-page.width*props.zoom)/2+held.x*props.zoom-(held.clientX-box.left));
 },[props.zoom,pinchVersion]);
 const touchDown=(event:ReactPointerEvent<HTMLDivElement>)=>{
  if(event.pointerType==='pen'){gesture.current.observePen(event.timeStamp);gesture.current.cancel();for(const contact of contacts.current.values())if(contact.pointerType==='touch'&&contact.phase==='capturing')controllers.current.get(contact.pageId)?.cancel('multitouch',{cause:'gesture-arbitration',disposition:'discard'});return;}
  if(props.onPageContact&&(event.target as Element).closest('[data-editable-page]'))return;
  if(event.pointerType!=='touch'||!writable()||props.intent===null||(event.target as Element).closest('button,input,select,textarea,[contenteditable="true"]'))return;
  const action=gesture.current.begin(event.nativeEvent,context(),[...contacts.current.values()].some(contact=>contact.pointerType==='pen'&&contact.phase==='capturing'));
  if(action.reason==='palm'){event.preventDefault();event.stopPropagation();return;}
  if(action.handled){event.preventDefault();event.stopPropagation();for(const controller of controllers.current.values())controller.cancel('navigation',{cause:'navigation',disposition:'discard'});try{event.currentTarget.setPointerCapture(event.pointerId);}catch{}navigation(action);}
 };
 const touchMove=(event:ReactPointerEvent<HTMLDivElement>)=>{if(event.pointerType==='pen'){gesture.current.observePen(event.timeStamp);return;}const action=gesture.current.move(event.nativeEvent,context());if(action.handled){event.preventDefault();event.stopPropagation();navigation(action);}};
 const touchEnd=(event:ReactPointerEvent<HTMLDivElement>,cancel=false)=>{if(event.pointerType==='pen'){gesture.current.observePen(event.timeStamp);return;}const action=gesture.current.end(event.nativeEvent,context(),cancel);if(action.handled){event.preventDefault();event.stopPropagation();navigation(action);try{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}catch{}}};
 const controllerCallbacks=useRef(new Map<string,(controller:PaperPageInkController|null)=>void>());
 const controllerReady=(pageId:string)=>{
  const key=`${authority.serial}|${pageId}`;let callback=controllerCallbacks.current.get(key);if(!callback){let own:PaperPageInkController|null=null,record:{authority:Authority;controller:PaperPageInkController}|null=null;callback=controller=>{if(controller){own=controller;record={authority,controller};controllerRecords.current.add(record);if(authorityRef.current===authority&&!authority.revoked)controllers.current.set(pageId,controller);}else{if(controllers.current.get(pageId)===own)controllers.current.delete(pageId);if(record){const held=record;void held.controller.whenSettled().then(()=>{controllerRecords.current.delete(held);if((authorityRef.current!==authority||!controllers.current.has(pageId))&&controllerCallbacks.current.get(key)===callback)controllerCallbacks.current.delete(key);},()=>{controllerRecords.current.delete(held);});record=null;}}
   if(current(authority))latest.current.onSurface?.(pageId,controller);else if(controller)queueMicrotask(()=>{if(own===controller&&controllers.current.get(pageId)===controller&&current(authority))latest.current.onSurface?.(pageId,controller);});};controllerCallbacks.current.set(key,callback);}return callback;
 };
 const textActivity=(entry:TextEntry,activity:PaperCanonicalTextHostActivity)=>{
  if(activity.source.objectId!==entry.objectId)return;const editor=activity.editor;
  const previous=entry.editorVersions.get(editor.source.serial),changed=previous===undefined||previous!==editor.version;entry.editorVersions.set(editor.source.serial,editor.version);
  entry.lease.activity({...(!editor.dirty?{dirty:false}:changed?{dirty:true}:{}),composing:editor.composing,caretPageId:editor.focused&&!editor.retired&&!entry.recovery?.finalizing?entry.projectionPage:null});
 };
 // Canonical source writers are outside frames. Only their displayed/caret
 // pages and actual contacts need physical frame residency; registry source
 // pins preserve writers without growing the bounded 16-frame input window.
 const pinnedPageIds=[...new Set([...pins.current.values()].filter(value=>value.serial===authority.serial&&props.document.pages.some(page=>page.id===value.pageId)).map(value=>value.pageId))];
 return <div className="paper-editable-notebook-viewport" data-page-input={props.intent!==null?'ink':props.textInteractionDisabled?'reading':'text'} onPointerDownCapture={touchDown} onPointerMoveCapture={touchMove} onPointerUpCapture={event=>touchEnd(event)} onPointerCancelCapture={event=>touchEnd(event,true)}>
  <PaperPageViewport ref={viewport} ownerKey={props.ownerKey} generation={props.generation} api={props.media.api} viewIdentity={viewIdentity} current={()=>current()} authorityReady={ready} pages={props.document.pages} mode={props.mode} zoom={props.zoom} selectedPageId={props.selectedPageId} pinnedPageIds={pinnedPageIds} onNotice={props.onNotice}
   renderPage={(slot,pageCurrent)=>{const page=props.document.pages.find(page=>page.id===slot.pageId)!;const baseline=props.document,readerCurrent=()=>current()&&pageCurrent()&&latest.current.document===baseline;
    const hiddenTextObjectIds=slot.mounted&&!slot.parked?[...paintCoverage.current].filter(([entry,coverage])=>entry.authority===authority&&entry.projectionPage===page.id&&coverage.pageId===page.id&&coverage.objectId===entry.objectId&&entry.lease.current()&&current(entry.authority)&&coverage.current()).map(([,coverage])=>coverage.objectId):[];
    return <PaperEditablePageHost hiddenTextObjectIds={hiddenTextObjectIds} document={baseline} page={page} media={props.media} ownerKey={props.ownerKey} generation={props.generation} mountedContent={slot.mounted} pixelWidth={slot.scaledWidth} writable={props.writable&&!suspended} current={()=>current()&&pageCurrent()} readerCurrent={readerCurrent} textInteractionDisabled={props.textInteractionDisabled} onPageContact={point=>props.onPageContact?.(page.id,point)===true} pdfOptions={props.pdfOptions?.(page.id)} onAudio={props.onAudio} intent={props.intent} style={props.style} wholeEraser={props.wholeEraser} fingerInk={props.fingerInk} correction={props.correction?{...props.correction,guide:effectivePaperDrawingGuide(props.correction.guide,page.calibration)}:undefined} pinPage={value=>pin(page.id,value)} canBegin={()=>!gesture.current.active()&&![...contacts.current.values()].some(contact=>contact.pointerType==='pen'&&contact.phase==='capturing')} onStroke={onStroke} onCheckpointChunk={checkpointInk} onCancelled={(_result,_source,interruption)=>conserveInk(interruption)} onActivity={onActivity} onObjectContact={objectContact} onPageFocus={()=>{if(current()&&pageCurrent())props.onSelect(page.id,props.selected.filter(id=>paperObjectsOnPage(props.document,page.id).some(object=>object.id===id)));}} onAccepted={source=>{rememberInk(source);if(source.stroke.intent!=='select'&&strokeCurrent(source))props.onSelect(source.pageId,[]);}} onActivateText={activateText} onBlankText={blankText} onNotice={props.onNotice} onController={controllerReady(page.id)} selected={props.selected} renderOverlay={controller=>props.renderOverlay?.(page.id,controller,pageCurrent)}/>;
   }}
   renderWindow={rows=>[...entries.current.values()].map(entry=>{
    const live=entry.authority===authority&&entry.lease.current()&&current();
    if(live){entry.paper=props.paper;const object=props.document.objects.find(object=>object.id===entry.objectId);if(object&&!entry.recovery){entry.document=props.document;try{entry.lease.updatePages(object.textFlow?.pageIds??[object.pageId]);}catch{}}}
    const row=live?rows.find(row=>row.pageId===entry.projectionPage):undefined;
    const projection=row?{pageId:row.pageId,physicalTop:row.physicalTop,pageWidth:row.pageWidth,pageHeight:row.pageHeight,zoom:props.zoom,parked:row.parked}:null;
    const onPaintCoverage=(coverage:PaperCanonicalTextPaintCoverage,covered:boolean)=>{
     const source=coverage.source,previous=paintCoverage.current.get(entry);if(source.objectId!==entry.objectId||source.ownerKey!==entry.authority.ownerKey||source.generation!==entry.authority.generation||source.api!==entry.media.api||source.accountId!==entry.media.accountId||source.spaceId!==entry.media.spaceId||source.noteId!==entry.document.noteId)return;
     if(!covered){if(previous===coverage){paintCoverage.current.delete(entry);redraw();}return;}
     if(coverage.source!==source||coverage.objectId!==entry.objectId||coverage.pageId!==entry.projectionPage||!current(entry.authority)||!entry.lease.current()||!coverage.current())return;
     if(previous!==coverage){paintCoverage.current.set(entry,coverage);redraw();}
    };
    return <PaperCanonicalTextHost onPaintCoverage={onPaintCoverage} key={entry.key} document={entry.document} objectId={entry.objectId} media={entry.media} ownerKey={entry.authority.ownerKey} generation={entry.authority.generation} current={()=>current(entry.authority)&&entry.lease.current()} readOnly={!props.writable||entry.document.objects.find(object=>object.id===entry.objectId)?.locked===true} interactionDisabled={!!entry.recovery||!props.document.objects.some(object=>object.id===entry.objectId)||props.intent!==null||props.textInteractionDisabled===true||entry.suspended||suspended||!props.selected.includes(entry.objectId)} pageProjection={projection} whenSaved={entry.paper.whenSaved} handleReady={handle=>{if(handle)entry.handle=handle;}} onActivity={activity=>{textActivity(entry,activity);if(entry.recovery){finishRecovery(entry);return;}if(entry.authority===authority&&!latest.current.selected.includes(entry.objectId)&&!activity.editor.dirty&&!activity.editor.composing&&!activity.editor.focused&&activity.editor.pendingOperations===0)void preserve(entry,'viewport');}} pins={value=>pin(value.pageId,value.token,entry.authority.serial)} onNotice={props.onNotice}
     onChange={(objectId,markdown,baseline,valid)=>{if(!writable(entry.authority)||!valid()||!entry.lease.current())return false;const previous=entry.recovery,changed=entry.paper.textChange(previous?.objectId??objectId,markdown,previous?.baseline??baseline);if(!changed)return false;const durable=entry.paper.whenSaved();if(previous||changed.recovered){entry.recovery={objectId:changed.objectId,pageId:changed.pageId,baseline:changed.editorBaseline,durable,finalizing:false};redraw();finishRecovery(entry);}props.onAuthored?.([changed.objectId]);return changed.editorBaseline;}}
     onLayout={(objectId,fingerprint,breaks,offsets,valid)=>{if(entry.recovery||!writable(entry.authority)||!valid()||entry.handle?.pending()||entry.handle?.composing())return false;const baseline=entry.paper.getCurrent();if(!baseline)return false;const value=reflowPaperText(baseline,objectId,fingerprint,breaks,offsets);if(!value)return true;if(!valid()||entry.paper.getCurrent()!==baseline||!entry.paper.layout(value))return false;const after=entry.paper.getCurrent();if(after&&current(entry.authority)&&entry.lease.current())latest.current.onCanonicalLayout?.(baseline,after,objectId);return true;}}
     onCaret={(objectId,y,pageId,source)=>{if(entry.recovery||source.generation!==entry.authority.generation||!writable(entry.authority)||!entry.lease.current())return;entry.projectionPage=pageId;entry.lease.activity({caretPageId:pageId});props.onSelect(pageId,[objectId]);const object=entry.paper.getCurrent()?.objects.find(object=>object.id===objectId),index=object?.textFlow?.pageIds.indexOf(pageId)??0,offset=object?.textFlow?.breaks[index]??0;viewport.current?.scrollToAnchor({pageId,pageY:(object?.y??0)+y-offset,viewportOffset:100});redraw();}}
     onUploadImage={props.onUploadImage?(file,source)=>{if(entry.recovery||source.generation!==entry.authority.generation||!writable(entry.authority)||!entry.lease.current())return Promise.reject(Error('Le carnet a changé.'));return props.onUploadImage!(file,()=>!entry.recovery&&writable(entry.authority)&&entry.lease.current());}:undefined}/>;
   })}/>
 </div>;
});
