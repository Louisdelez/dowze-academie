import {forwardRef,lazy,Suspense,useCallback,useImperativeHandle,useLayoutEffect,useMemo,useRef,useState} from 'react';
import type {MarkdownNoteEditorActivity,MarkdownNoteEditorHandle,MarkdownNoteEditorSource} from './MarkdownNoteEditor';
import {PaperTextFlowView} from './PaperTextFlowView';
import type {NotebookMediaScope} from './NotebookEditor';
import type {PaperDocument,PaperObject} from '../lib/notebookDocument';
import type {PaperSearchNavigationRequest} from '../lib/notebookSearchNavigation';
import {paperObjectCssTransform} from '../lib/paperInkStyles';
import {MAX_PAPER_VIEWPORT_PAGE_EXTENT,MAX_PAPER_VIEWPORT_PHYSICAL_EXTENT} from '../lib/paperPageViewport';
import './paper-canonical-text-host.css';

const MarkdownNoteEditor=lazy(()=>import('./MarkdownNoteEditor'));
export interface PaperCanonicalTextHostSource {
 readonly ownerKey:string;readonly generation:string|number;readonly api:NotebookMediaScope['api'];
 readonly accountId:string;readonly spaceId:string;readonly noteId:string;readonly objectId:string;readonly kind:'text'|'sticky';readonly token:object;
}
/** Coordinates in the bounded viewport window, not scrollTop or a logical page prefix. */
export interface PaperCanonicalTextPageProjection {
 readonly pageId:string;readonly physicalTop:number|null;readonly pageWidth:number;readonly pageHeight:number;
 readonly zoom:number;readonly parked?:boolean;
}
export type PaperCanonicalTextPinReason='dirty'|'composition'|'focus'|'dom-input'|'operation';
export interface PaperCanonicalTextPin {
 readonly source:PaperCanonicalTextHostSource;readonly editorSource:MarkdownNoteEditorSource;
 readonly pageId:string;readonly token:object;readonly reasons:readonly PaperCanonicalTextPinReason[];
}
export interface PaperCanonicalTextHostActivity {
 readonly source:PaperCanonicalTextHostSource;readonly editor:Readonly<MarkdownNoteEditorActivity>;
 readonly pinnedPageIds:readonly string[];
}
/** One ready writer covers only its projected object/page reader. */
export interface PaperCanonicalTextPaintCoverage {
 readonly source:PaperCanonicalTextHostSource;readonly objectId:string;readonly pageId:string;readonly current:()=>boolean;
}
export interface PaperCanonicalTextHostHandle {
 readonly source:PaperCanonicalTextHostSource;
 current:()=>boolean;flush:()=>Promise<boolean>;settled:()=>Promise<boolean>;pending:()=>boolean;composing:()=>boolean;
 activity:()=>PaperCanonicalTextHostActivity|null;
 highlightSearch:(request:PaperSearchNavigationRequest)=>boolean;clearSearch:()=>void;
}
export interface PaperCanonicalTextHostProps {
 document:PaperDocument;objectId:string;media:NotebookMediaScope;ownerKey:string;generation:string|number;
 /** Independent of the toolbar page, document revision and viewport projection. False revokes this incarnation. */
 current:()=>boolean;readOnly?:boolean;
 /** Locks the visible editor for ink/selection without retiring its buffer or persistence authority. */
 interactionDisabled?:boolean;pageProjection:PaperCanonicalTextPageProjection|null;
 onChange:(objectId:string,markdown:string,baseline:PaperDocument|undefined,current:()=>boolean)=>unknown;
 onLayout?:(objectId:string,fingerprint:string,breaks:number[],sourceOffsets:number[]|undefined,current:()=>boolean)=>boolean;
 onCaret?:(objectId:string,y:number,pageId:string,source:PaperCanonicalTextHostSource)=>void;
 onUploadImage?:(file:File,source:PaperCanonicalTextHostSource)=>Promise<string>;
 whenSaved:()=>Promise<unknown>;
 /** A distinct release per pin. These callbacks may retire an old editor source after an asynchronous recovery. */
 pins?:(pin:PaperCanonicalTextPin)=>()=>void;
 onActivity?:(activity:PaperCanonicalTextHostActivity)=>void;
 onPaintCoverage?:(coverage:PaperCanonicalTextPaintCoverage,covered:boolean)=>void;
 handleReady?:(handle:PaperCanonicalTextHostHandle|null,source:PaperCanonicalTextHostSource)=>void;
 onNotice?:(message:string)=>void;
}
interface PinBucket {source:MarkdownNoteEditorSource;activity:Readonly<MarkdownNoteEditorActivity>;pins:Map<string,()=>void>;report?:string}
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const reasonsFor=(activity:Readonly<MarkdownNoteEditorActivity>):PaperCanonicalTextPinReason[]=>[
 ...(activity.dirty?['dirty' as const]:[]),...(activity.composing?['composition' as const]:[]),
 ...(activity.focused&&!activity.retired?['focus' as const]:[]),...(activity.unconfirmedDOM?['dom-input' as const]:[]),
 ...(activity.pendingOperations>0?['operation' as const]:[])
];
const caretPage=(object:PaperObject,y:number)=>{
 const flow=object.textFlow;if(!flow)return object.pageId;
 const boundary=flow.breaks.findIndex((end,index)=>index>0&&y<end);
 return flow.pageIds[boundary<0?flow.pageIds.length-1:Math.max(0,boundary-1)]??object.pageId;
};
function projectionFor(value:PaperCanonicalTextPageProjection|null,document:PaperDocument,object:PaperObject):PaperCanonicalTextPageProjection|null {
 if(!value||!finite(value.zoom)||value.zoom<=0)return null;
 const page=document.pages.find(page=>page.id===value.pageId);
 if(!page||page.width!==value.pageWidth||page.height!==value.pageHeight||!(object.pageId===page.id||object.textFlow?.pageIds.includes(page.id)))return null;
 if(![value.pageWidth,value.pageHeight].every(size=>finite(size)&&size>0&&size*value.zoom<=MAX_PAPER_VIEWPORT_PAGE_EXTENT))return null;
 if(value.physicalTop!==null&&(!finite(value.physicalTop)||value.physicalTop<0||value.physicalTop+value.pageHeight*value.zoom>MAX_PAPER_VIEWPORT_PHYSICAL_EXTENT))return null;
 return {...value,parked:value.parked===true||value.physicalTop===null};
}

/** Mount once per canonical text object directly in PaperPageViewport's window,
 * as a sibling of page frames. Sticky notes use the same writer without flow
 * pagination. Other pages render readonly mirrors. Page/caret,
 * mode, zoom and rebase updates only project this same child tree with CSS.
 * No writer is registered here or by the hosted Markdown editor: the parent
 * must register this handle exactly once, retain it while settled() is false,
 * and drain/retain the old host BEFORE owner/API/permission retirement or removal.
 * Revocation hides the old tree but preserves its buffer and composition. It
 * does not admit a new owner or create a replacement editor in that tree. */
export const PaperCanonicalTextHost=forwardRef<PaperCanonicalTextHostHandle,PaperCanonicalTextHostProps>(function PaperCanonicalTextHost(props,ref){
 const root=useRef<HTMLDivElement>(null),editor=useRef<MarkdownNoteEditorHandle|null>(null),mounted=useRef(true),revoked=useRef(false);
 const initialObject=props.document.objects.find(object=>object.id===props.objectId&&(object.kind==='text'||object.kind==='sticky'));
 const source=useRef<PaperCanonicalTextHostSource>(Object.freeze({ownerKey:props.ownerKey,generation:props.generation,api:props.media.api,accountId:props.media.accountId,spaceId:props.media.spaceId,noteId:props.document.noteId,objectId:props.objectId,kind:initialObject?.kind==='sticky'?'sticky':'text',token:Object.freeze({})})).current;
 const editorId=`${source.noteId}-${source.objectId}`,latest=useRef(props);latest.current=props;
 const sameSource=(value:PaperCanonicalTextHostProps)=>value.ownerKey===source.ownerKey&&value.generation===source.generation&&value.media.api===source.api&&value.media.accountId===source.accountId&&value.media.spaceId===source.spaceId&&value.document.noteId===source.noteId&&value.objectId===source.objectId;
 const current=()=>{
  // StrictMode replays layout cleanup/setup while the same tree is connected.
  // A real detached host cannot regain authority through that exception.
  if(!mounted.current&&!root.current?.isConnected||revoked.current)return false;const value=latest.current;
  let allowed=false;try{allowed=sameSource(value)&&value.current()===true&&value.document.objects.some(object=>object.id===source.objectId&&object.kind===source.kind);}catch{}
  if(!allowed)revoked.current=true;return allowed;
 };
 const retained=useRef({props,object:initialObject}),buckets=useRef(new Map<number,PinBucket>()),writers=useRef(new Map<number,MarkdownNoteEditorHandle>()),confirmedRetirement=useRef(false),activeActivity=useRef<Readonly<MarkdownNoteEditorActivity>|null>(null),lastProjection=useRef<PaperCanonicalTextPageProjection|null>(null),readyCallback=useRef(props.handleReady);
 const [,refresh]=useState(0),live=current();
 if(live){retained.current={props,object:initialObject};readyCallback.current=props.handleReady;}
 const safe=retained.current,object=safe.object;
 const proposed=object&&live?projectionFor(props.pageProjection,safe.props.document,object):null;
 if(proposed)lastProjection.current=proposed;
 const projection=proposed??lastProjection.current,parked=!live||!proposed||projection?.parked===true;
 const notice=(message:string)=>{if(current())retained.current.props.onNotice?.(message);};
 const release=(bucket:PinBucket)=>{for(const remove of bucket.pins.values())try{remove();}catch{}bucket.pins.clear();};
 const readActivity=(child=editor.current)=>{try{return child?.activity()??null;}catch{return null;}};
 const sourceMatches=(value:MarkdownNoteEditorSource)=>value.accountId===source.accountId&&value.spaceId===source.spaceId&&value.noteId===source.noteId&&value.editorId===editorId&&value.generation===source.generation&&value.api===source.api;
 const pinPages=(activity:Readonly<MarkdownNoteEditorActivity>)=>{
  const held=retained.current.object;if(!held||!reasonsFor(activity).length)return [];
  const pages=[lastProjection.current?.pageId??held.pageId];if(finite(activity.caretY))pages.push(caretPage(held,activity.caretY));
  return [...new Set(pages)].filter(id=>retained.current.props.document.pages.some(page=>page.id===id));
 };
 const reconcile=(activity:Readonly<MarkdownNoteEditorActivity>,publish=true)=>{
  if(!sourceMatches(activity.source))return;let bucket=buckets.current.get(activity.source.serial);
  if(activity.dirty||activity.composing||activity.unconfirmedDOM||activity.pendingOperations>0||activity.error!==null)confirmedRetirement.current=false;
  if(!bucket){bucket={source:activity.source,activity,pins:new Map()};buckets.current.set(activity.source.serial,bucket);}bucket.activity=activity;
  const child=readActivity(),isActive=!!child&&child.source.serial===activity.source.serial&&sourceMatches(child.source);
  if(isActive){activeActivity.current=activity;if(editor.current)writers.current.set(activity.source.serial,editor.current);}
  else if(activeActivity.current?.source.serial===activity.source.serial)activeActivity.current=activity;
  const pages=pinPages(activity),reasons=Object.freeze(reasonsFor(activity));
  // Acquire the new page before releasing the old projection's pin.
  for(const pageId of pages)if(!bucket.pins.has(pageId)&&retained.current.props.pins){try{const remove=retained.current.props.pins({source,editorSource:bucket.source,pageId,token:Object.freeze({}),reasons});if(typeof remove!=='function')throw Error('Une page de texte doit disposer de sa propre libération.');bucket.pins.set(pageId,remove);}catch(error){notice(String(error instanceof Error?error.message:error));}}
  for(const [pageId,remove] of bucket.pins)if(!pages.includes(pageId)){try{remove();}catch{}bucket.pins.delete(pageId);}
  // A clean retired activity is not confirmation that destroy/recovery settled.
  // Keep its handle until an explicit settled() call succeeds.
  if(!reasons.length){release(bucket);if(!isActive)buckets.current.delete(activity.source.serial);}
  const pageIds=Object.freeze([...bucket.pins.keys()]),signature=JSON.stringify([activity.version,activity.dirty,activity.composing,activity.unconfirmedDOM,activity.focused,activity.caretY,activity.pendingOperations,activity.retired,activity.error,pageIds]);
  if(publish&&bucket.report!==signature){bucket.report=signature;try{retained.current.props.onActivity?.({source,editor:activity,pinnedPageIds:pageIds});}catch{}}
 };
 const allWriters=()=>[...new Set([...writers.current.values(),...(editor.current?[editor.current]:[])])];
 const unsettled=()=>[...buckets.current.values()].some(bucket=>bucket.activity.dirty||bucket.activity.composing||bucket.activity.unconfirmedDOM||bucket.activity.pendingOperations>0||bucket.activity.error!==null);
 const drain=async(method:'flush'|'settled')=>{
  const children=allWriters();if(!children.length)return confirmedRetirement.current&&!unsettled()&&!editor.current;const results=await Promise.all(children.map(async child=>{const accepted=await child[method](),activity=readActivity(child);if(activity)reconcile(activity);return accepted===true;}));
  // Retry/retirement can expose another writer while one was awaiting storage.
  const complete=results.every(Boolean)&&!unsettled()&&allWriters().every(child=>children.includes(child));
  if(complete&&method==='settled'){
   for(const [serial,child] of writers.current)if(child!==editor.current&&children.includes(child)&&readActivity(child)?.retired){writers.current.delete(serial);buckets.current.delete(serial);}
   if(!allWriters().length)confirmedRetirement.current=true;
  }return complete;
 };
 const highlightSearch=(request:PaperSearchNavigationRequest)=>{
  const value=retained.current.props;
  if(!current()||root.current?.dataset.textHostParked!=='false'||value.interactionDisabled||value.document!==request.document||request.hit.objectId!==source.objectId||request.current()!==true)return false;
  return editor.current?.highlightSearch({...request,scroll:false,current:()=>current()&&!retained.current.props.interactionDisabled&&retained.current.props.document===request.document&&request.current()===true})===true;
 };
 const clearSearch=()=>editor.current?.clearSearch();
 const operations=useRef({current,reconcile,readActivity,allWriters,unsettled,drain,highlightSearch,clearSearch});operations.current={current,reconcile,readActivity,allWriters,unsettled,drain,highlightSearch,clearSearch};
 const handle=useMemo<PaperCanonicalTextHostHandle>(()=>({source,highlightSearch:request=>operations.current.highlightSearch(request),clearSearch:()=>operations.current.clearSearch(),current:()=>operations.current.current(),flush:()=>operations.current.drain('flush'),settled:()=>operations.current.drain('settled'),pending:()=>{try{const children=operations.current.allWriters();return !children.length&&!confirmedRetirement.current||operations.current.unsettled()||children.some(child=>child.pending());}catch{return true;}},composing:()=>{try{return operations.current.allWriters().some(child=>child.composing());}catch{return true;}},activity:()=>{const activity=activeActivity.current;if(!activity)return null;const bucket=buckets.current.get(activity.source.serial);return {source,editor:activity,pinnedPageIds:Object.freeze([...bucket?.pins.keys()??[]])};}}),[source]);
 useImperativeHandle(ref,()=>handle,[handle]);
 const onEditorActivity=useCallback((activity:Readonly<MarkdownNoteEditorActivity>)=>{operations.current.reconcile(activity);},[]);
 const inspectPaintOnRef=useRef<()=>void>(()=>{});
 const setEditor=useCallback((value:MarkdownNoteEditorHandle|null)=>{const changed=editor.current!==value;editor.current=value;if(value)confirmedRetirement.current=false;const activity=operations.current.readActivity(value);if(activity)operations.current.reconcile(activity);if(changed)inspectPaintOnRef.current();},[]);
 useLayoutEffect(()=>{mounted.current=true;readyCallback.current?.(handle,source);return()=>{
  mounted.current=false;readyCallback.current?.(null,source);
  // An unexpected unmount is not proof that a pending buffer was saved. The
  // parent keeps its old handle/pins until the editor's real recovery settles.
  for(const [serial,bucket] of buckets.current)if(!bucket.activity.dirty&&!bucket.activity.composing&&!bucket.activity.unconfirmedDOM&&bucket.activity.pendingOperations===0){release(bucket);buckets.current.delete(serial);}
 };},[handle,source]);
 useLayoutEffect(()=>{let stopped=false;const inspect=()=>{if(stopped||operations.current.current())return;stopped=true;clearInterval(timer);if(root.current){root.current.style.opacity='0';root.current.style.pointerEvents='none';}refresh(value=>value+1);};const timer=setInterval(inspect,50);return()=>{stopped=true;clearInterval(timer);};},[]);
 useLayoutEffect(()=>{const activity=operations.current.readActivity();if(activity)operations.current.reconcile(activity);},[props.pageProjection,props.document]);
 const writerCurrent=()=>current()&&!retained.current.props.readOnly;
 const change=(markdown:string,baseline?:PaperDocument)=>{if(!writerCurrent()||baseline&&baseline.noteId!==source.noteId)return false;const result=retained.current.props.onChange(source.objectId,markdown,baseline,writerCurrent);return writerCurrent()?result:false;};
 const layout=(fingerprint:string,breaks:number[],offsets?:number[])=>{
  if(!writerCurrent()||retained.current.props.interactionDisabled||!editor.current||editor.current.pending()||editor.current.composing())return false;
  return retained.current.props.onLayout?.(source.objectId,fingerprint,breaks,offsets,writerCurrent)??true;
 };
 const caret=(y:number)=>{if(!writerCurrent()||retained.current.props.interactionDisabled||!finite(y)||y<0||!retained.current.object)return;retained.current.props.onCaret?.(source.objectId,y,caretPage(retained.current.object,y),source);};
 const upload=async(file:File)=>{if(!writerCurrent()||retained.current.props.interactionDisabled||!retained.current.props.onUploadImage)throw Error('L’ajout d’image attend le carnet et son éditeur d’origine.');const value=await retained.current.props.onUploadImage(file,source);if(!writerCurrent()||retained.current.props.interactionDisabled)throw Error('Le carnet a changé. Le fichier original reste conservé.');return value;};
 const width=projection?.pageWidth??1,height=projection?.pageHeight??1,zoom=projection?.zoom??1,pageId=projection?.pageId??object?.pageId??'';
 const paint=useRef<{value:PaperCanonicalTextPaintCoverage;pm:HTMLElement;revoke:()=>void}|null>(null),paintInspection=useRef<()=>void>(()=>{}),paintMounted=useRef(false),paintQueued=useRef(false);
 const clearPaint=()=>{const held=paint.current;if(!held)return;held.revoke();paint.current=null;try{latest.current.onPaintCoverage?.(held.value,false);}catch{}};
 paintInspection.current=()=>{
  const node=root.current,pm=node?.querySelector<HTMLElement>('.ProseMirror');
  let prepared=false;try{const rect=pm?.getBoundingClientRect();prepared=!!node&&!!pm?.isConnected&&!!rect&&rect.width>0&&rect.height>0&&!node.querySelector('.markdown-editor-loading,[data-code-ready="false"]')&&editor.current?.current()===true;}catch{}
  if(!live||parked||!pageId||!current()||!prepared||!pm){clearPaint();return;}
  if(paint.current?.pm===pm&&paint.current.value.pageId===pageId)return;
  clearPaint();const coveredPage=pageId,coveredPM=pm;let covered=true;
  const value:PaperCanonicalTextPaintCoverage=Object.freeze({source,objectId:source.objectId,pageId:coveredPage,current:()=>{
   const held=root.current;return covered&&current()&&held?.dataset.textHostParked==='false'&&held.dataset.canonicalTextPage===coveredPage&&held.contains(coveredPM)&&coveredPM.isConnected&&editor.current?.current()===true;
  }});paint.current={value,pm,revoke:()=>{covered=false;}};try{latest.current.onPaintCoverage?.(value,true);}catch{}
 };
 const inspectPaintSoon=()=>{if(paintQueued.current)return;paintQueued.current=true;queueMicrotask(()=>{paintQueued.current=false;if(paintMounted.current)paintInspection.current();});};
 // A ref can expose several preparing/retired handles during Strict commits.
 // Readiness only needs an inspection after that commit, never a Host render.
 inspectPaintOnRef.current=inspectPaintSoon;
 // A Strict replay reappears children before their parent's readiness setup.
 // Retire coverage synchronously, but evaluate fresh readiness after the whole
 // layout commit, without reading a transient parent false as source revocation.
 useLayoutEffect(()=>{if(!live||parked)clearPaint();else inspectPaintSoon();});
 useLayoutEffect(()=>{
  paintMounted.current=true;const node=root.current;if(!node)return()=>{paintMounted.current=false;clearPaint();};const mutation=new MutationObserver(inspectPaintSoon),resize=new ResizeObserver(inspectPaintSoon);
  mutation.observe(node,{subtree:true,childList:true,attributes:true,attributeFilter:['data-code-ready','contenteditable']});resize.observe(node);inspectPaintSoon();return()=>{paintMounted.current=false;mutation.disconnect();resize.disconnect();clearPaint();};
 },[]);
 const markdown=object&&<Suspense fallback={<p className="markdown-editor-loading" role="status">Ouverture du texte…</p>}>
  <MarkdownNoteEditor ref={setEditor} key={source.objectId} noteId={editorId} generation={source.generation} current={current} registerSession={false} whenSaved={safe.props.whenSaved} flowEditing={source.kind==='text'} initialMarkdown={object.markdown??''} externalMarkdown={object.markdown??''} documentSnapshot={safe.props.document} media={safe.props.media} readOnly={!live||safe.props.readOnly===true||safe.props.interactionDisabled===true} onChange={change} onActivity={onEditorActivity} onCaretPosition={source.kind==='text'?caret:undefined} onUploadImage={upload}/>
 </Suspense>;
 return <div ref={root} className="paper-canonical-text-host" data-canonical-text-object={source.objectId} data-canonical-text-page={pageId} data-text-host-revoked={String(!live)} data-text-host-parked={String(parked)} aria-hidden={parked||undefined} style={{top:parked?0:projection!.physicalTop!,left:parked?-600001:'50%',width:width*zoom,height:height*zoom,opacity:parked?0:1}}>
  <div className="paper-page paper-canonical-text-page" style={{width,height,transform:`scale(${zoom})`}}>
   {object&&<div className={`paper-object paper-${source.kind} ${source.kind==='text'?'has-text-flow ':''}paper-canonical-text-object`} style={{left:object.x,top:object.y,width:object.width,minHeight:0,color:source.kind==='text'?object.color:undefined,backgroundColor:source.kind==='sticky'?object.color:undefined,zIndex:object.z+1,transform:paperObjectCssTransform(object),transformOrigin:`${object.width/2}px ${object.height/2}px`,pointerEvents:parked?'none':'auto'}}>
    {/* PaperTextFlowView.current=false removes its child. Keep the writer tree
        mounted here; guard layout/Markdown independently and hide its ancestor. */}
    {source.kind==='text'?<PaperTextFlowView key={source.objectId} object={object} document={safe.props.document} media={safe.props.media} pageId={pageId} onLayout={live&&!safe.props.readOnly&&!safe.props.interactionDisabled&&safe.props.onLayout?layout:undefined} onNotice={notice}>{markdown}</PaperTextFlowView>:markdown}
   </div>}
  </div>
 </div>;
});
