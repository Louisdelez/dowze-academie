/** Private Chromium recipe. The shell chooses synthetic source identities;
 * Notebook/Crepe/PM, native DOM/IDB and scoped durable metadata run unchanged.
 * It is not the App authentication UI or a physical keyboard/OS IME proof. */
import {createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {PaperNotebook} from '../src/components/PaperNotebook';
import {WorkspaceTabVisibility} from '../src/lib/workspaceTabVisibility';
import {installRealPaperEditorProbe,type RealPaperEditorRecord} from './paper-real-editor-probe';
import {appStorage} from '../src/lib/appStorage';
import {migratePaper,notebookDocumentId,isPaperDocument,type PaperDocument} from '../src/lib/notebookDocument';
import {amendPaperCollaboration} from '../src/lib/paperCollaboration';
import {textFlowFingerprint} from '../src/lib/paperTextFlow';
import {ApiClient} from '../pwa/src/api';
import {synchronizeSpace} from '../pwa/src/sync';
import {putDraft,getDraft,putEditedDraft,putSnapshot,listMutations,listLocalBlobs,listSnapshots,queueLocalDrafts,type Draft} from '../pwa/src/storage';
import {settleAllNotebookAccounts,resumeAllNotebookAccounts,hasPendingNotebookWrites} from '../src/lib/notebookSession';
import {flushNotebookWorkspaceForClose} from '../src/lib/notebookClose';
import type {NotebookMirrorExpectation} from '../src/components/NotebookEditor';

type Selection='a1'|'a2'|'b1';
type Scope={accountId:string;spaceId:string;noteId:string};
type Authority={selection:Selection;scope:Scope;epoch:number};
type Viewport={ownerKey:string;generation:number;media:Scope&{api?:unknown};document:PaperDocument;paper:{document:PaperDocument|null;legacyReady:boolean;saved:boolean;blocked:boolean;reconciling:boolean;notice:string;whenSaved:()=>Promise<unknown>;getCurrent:()=>PaperDocument|null};handle:{flush:()=>Promise<boolean>;settled:()=>Promise<boolean>;navigate:(id:string)=>boolean}};
type Host={source:{accountId:string;spaceId:string;noteId:string;objectId:string;generation:number};current:()=>boolean;composing:()=>boolean;flush:()=>Promise<boolean>;settled:()=>Promise<boolean>;activity:()=>{editor:{version:number;dirty:boolean;composing:boolean;unconfirmedDOM:boolean;focused:boolean;retired:boolean;pendingOperations:number;error:string|null}}|null};
function check(value:unknown,message:string):asserts value{if(!value)throw Error(message);}
const nextFrame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
const wait=async(checking:()=>unknown|Promise<unknown>,label:string)=>{const until=performance.now()+10000;while(performance.now()<until){if(await checking())return;await new Promise(resolve=>setTimeout(resolve,20));}throw Error(label+' fixture timeout');};
const digest=async(value:unknown)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))).map(x=>x.toString(16).padStart(2,'0')).join('');
const identity=(scope:Scope,type='whiteboard')=>({accountId:scope.accountId,spaceId:scope.spaceId,type:type as 'whiteboard'|'notesMarkdown',documentId:type==='whiteboard'?notebookDocumentId(scope.noteId):scope.noteId});
const sourceText='Opening browser paragraph.\n\nSecond browser paragraph.';
let root:Root|null=null,node:HTMLDivElement|null=null,authority:Authority|null=null,scopes:Record<Selection,Scope>|null=null,epoch=0,started=false,probe:ReturnType<typeof installRealPaperEditorProbe>|null=null;
const captures=new Map<number,{record:RealPaperEditorRecord;host:Host;viewport:Viewport;scope:Scope;epoch:number}>();
type ObservedEvent={seq:number;editor:number|null;type:string;inputType:string|null;composing:boolean|null;trusted:boolean;connected:boolean;length:number;cancelable:boolean;defaultPrevented:boolean;ranges:{startOffset:number;endOffset:number;sameContainer:boolean;from:number|null;to:number|null}[];after?:{defaultPrevented:boolean;PMComposing:boolean|null;PMFrom:number|null;PMTo:number|null;DOMLength:number|null}};
const events:ObservedEvent[]=[];let eventSerial=0;
const metadataEvents:{seq:number;reason:string;scope:Scope;epoch:number;current:boolean;hashes?:{requested:string;expected:string;stored:string};error?:string}[]=[];let metadataSerial=0;
interface MetadataAttempt {serial:number;ticket:Authority;requested:string;status:'pending'|'accepted'|'refused'|'rejected';work:Promise<boolean>;error?:unknown}
const metadataAttempts:MetadataAttempt[]=[];let metadataAttemptSerial=0;
const metadataJoined=new Map<Authority,number>();
interface FlushBarrier {serial:number;epoch:number;phase:'observer'|'canonical'|'mirror'|'done'|'failed';observerRecords:number;mirrorSerial?:number;error?:string}
const flushBarriers:FlushBarrier[]=[];let flushBarrierSerial=0;
function metadataDiagnostic(ticket:Authority,reason:string,requested:string,expected:string|undefined,stored:string|undefined,error?:unknown){
 const row:typeof metadataEvents[number]={seq:++metadataSerial,reason,scope:{...ticket.scope},epoch:ticket.epoch,current:authority===ticket,...(error?{error:String(error instanceof Error?error.message:error).slice(0,240)}:{})};metadataEvents.push(row);if(metadataEvents.length>24)metadataEvents.shift();
 // Observe immutable strings without inserting any new await into admission,
 // native storage or publication. Reports never include the Markdown itself.
 void Promise.all([digest(requested),digest(expected??null),digest(stored??null)]).then(([requested,expected,stored])=>{row.hashes={requested,expected,stored};});
}
const observe=(event:Event)=>{const target=event.target,pm=target instanceof Element?target.closest('.ProseMirror'):target instanceof Node?target.parentElement?.closest('.ProseMirror'):null;if(!(target instanceof Node)||!pm)return;const input=event as InputEvent,record=probe?.records.find(record=>record.view?.dom===pm),view=record?.view;
 const ranges:ObservedEvent['ranges']=typeof input.getTargetRanges==='function'?Array.from(input.getTargetRanges()).slice(0,4).map(range=>{let from:number|null=null,to:number|null=null;try{if(view){from=view.posAtDOM(range.startContainer,range.startOffset);to=view.posAtDOM(range.endContainer,range.endOffset);}}catch{}return {startOffset:range.startOffset,endOffset:range.endOffset,sameContainer:range.startContainer===range.endContainer,from,to};}):[];
 const row:ObservedEvent={seq:++eventSerial,editor:record?probe!.records.indexOf(record)+1:null,type:event.type,inputType:input.inputType??null,composing:typeof input.isComposing==='boolean'?input.isComposing:null,trusted:event.isTrusted,connected:target.isConnected,length:typeof input.data==='string'?input.data.length:0,cancelable:event.cancelable,defaultPrevented:event.defaultPrevented,ranges};events.push(row);if(events.length>80)events.shift();
 // A microtask checkpoint can run between native event listeners. Read the
 // final cancellation flag in the next task, after all capture/target guards.
 setTimeout(()=>{row.defaultPrevented=event.defaultPrevented;row.after={defaultPrevented:event.defaultPrevented,PMComposing:view&&!record?.destroyed?view.composing:null,PMFrom:view&&!record?.destroyed?view.state.selection.from:null,PMTo:view&&!record?.destroyed?view.state.selection.to:null,DOMLength:view?.dom.textContent?.length??null};},0);
};
const observedTypes=['beforeinput','input','compositionstart','compositionupdate','compositionend'];
function fibers(){const internal=(root as unknown as {_internalRoot?:{current?:any}})?._internalRoot?.current;if(!internal)return [];const rows:any[]=[],pending=[internal];while(pending.length){const row=pending.pop()!;rows.push(row);if(row.sibling)pending.push(row.sibling);if(row.child)pending.push(row.child);}return rows;}
function viewport():Viewport|null{const row=fibers().find(row=>row.memoizedProps?.paper&&row.memoizedProps?.document&&row.memoizedProps?.media&&typeof row.memoizedProps?.ownerKey==='string');return row?{...row.memoizedProps,handle:(row.ref??row.memoizedProps.ref)?.current}:null;}
function hostFor(record:RealPaperEditorRecord):Host{
 const element=record.root?.closest('[data-canonical-text-object]'),row=fibers().find(row=>row.stateNode===element);check(row,'Actual canonical host DOM fibre missing');
 for(let parent=row;parent;parent=parent.return){if(!parent.memoizedProps?.objectId||typeof parent.memoizedProps?.handleReady!=='function')continue;let hook=parent.memoizedState,remaining=40;while(hook&&remaining--){const value=Array.isArray(hook.memoizedState)?hook.memoizedState[0]:hook.memoizedState?.current;if(value?.source?.objectId&&typeof value.flush==='function'&&typeof value.current==='function')return value;hook=hook.next;}}
 throw Error('Actual canonical host handle missing');
}
async function seed(scope:Scope){
 const plain=migratePaper(scope.noteId,sourceText,null,'2026-10-15T10:00:00.000Z'),page={...plain.pages[0],id:'browser-page',width:800,height:1100};
 plain.pages=[page];plain.objects=[{id:'browser-text',pageId:page.id,kind:'text',x:40,y:40,width:700,height:900,rotation:0,z:1,locked:false,color:'#20343b',createdAt:1,markdown:sourceText,textFlow:{schema:1,pageIds:[page.id],breaks:[0,900],source:textFlowFingerprint(sourceText,700,900),sourceOffsets:[0,sourceText.length]}}];
 const content=amendPaperCollaboration(plain,plain),metadata={...identity(scope,'notesMarkdown'),title:'Private browser '+scope.noteId,content:{id:scope.noteId,title:'Private browser '+scope.noteId,markdown:sourceText,tags:['synthetic'],createdAt:'2026-10-15T10:00:00.000Z',updatedAt:'2026-10-15T10:00:00.000Z'},baseVersion:1,updatedAt:1,syncState:'synced' as const};check(isPaperDocument(content),'Private writing seed must be a valid canonical source');
 await putDraft(metadata);await putDraft({...identity(scope),title:metadata.title,content,baseVersion:1,updatedAt:1,syncState:'synced'});
 await putSnapshot({key:`paper-migration|${scope.accountId}|${scope.spaceId}|whiteboard|${notebookDocumentId(scope.noteId)}`,accountId:scope.accountId,spaceId:scope.spaceId,value:{markdown:sourceText,legacy:null,migratedAt:'2026-10-15T10:00:00.000Z'}});
}
function paint(ticket:Authority,metadata:Draft){
 check(root&&authority===ticket,'Render only the current admitted shell');
 const current=()=>authority===ticket;
 const onChange=(markdown:string,expected?:NotebookMirrorExpectation)=>{
  // Observe the actual callback chosen by the parent effect. Never invoke that
  // effect/helper ourselves, rewrite metadata, or retry a refused publication.
  const attempt:MetadataAttempt={serial:++metadataAttemptSerial,ticket,requested:markdown,status:'pending',work:Promise.resolve(false)};metadataAttempts.push(attempt);
  metadataDiagnostic(ticket,'on-change-start',markdown,expected?.expectedMarkdown,undefined);
  const operation=(async()=>{
  if(!current()){metadataDiagnostic(ticket,'current-before-read',markdown,expected?.expectedMarkdown,undefined);return false;}const before=await getDraft(identity(ticket.scope,'notesMarkdown'));if(!current()||!before){metadataDiagnostic(ticket,!current()?'current-after-read':'before-missing',markdown,expected?.expectedMarkdown,undefined);return false;}
  const body=before.content as {markdown?:string};if(expected?.expectedMarkdown!==undefined&&body.markdown!==expected.expectedMarkdown){metadataDiagnostic(ticket,'expected-markdown-mismatch',markdown,expected.expectedMarkdown,body.markdown);return false;}
  const after={...before,content:{...body,markdown},updatedAt:Date.now(),syncState:'local' as const};
  // Use the actual Notebook atomic mirror when supplied, just as its PWA
  // caller does; ordinary metadata still uses the real scoped native CAS.
  let confirmed:Draft;try{confirmed=expected?.commitMetadata?await expected.commitMetadata(after):(await putEditedDraft(after,before.content,current),after);}catch(error){metadataDiagnostic(ticket,'commit-metadata-rejected',markdown,expected?.expectedMarkdown,body.markdown,error);throw error;}
  if(!current()){metadataDiagnostic(ticket,'current-after-commit',markdown,expected?.expectedMarkdown,body.markdown);return false;}metadataDiagnostic(ticket,'accepted',markdown,expected?.expectedMarkdown,body.markdown);paint(ticket,confirmed);return true;
  })();
  attempt.work=operation.then(accepted=>{attempt.status=accepted?'accepted':'refused';return accepted;},error=>{attempt.status='rejected';attempt.error=error;throw error;});
  // Keep rejection observed even when owner retirement stops the parent. The
  // exact rejection still reaches that parent's actual callback unchanged.
  void attempt.work.catch(()=>{});return attempt.work;
 };
 root.render(createElement(WorkspaceTabVisibility.Provider,{value:true},createElement(PaperNotebook,{noteId:ticket.scope.noteId,markdown:(metadata.content as {markdown:string}).markdown,metadata:{title:metadata.title},onChange,media:{accountId:ticket.scope.accountId,spaceId:ticket.scope.spaceId}})));
}
async function show(selection:Selection){
 check(root&&node&&scopes,'Start private writing fixture first');const ticket:Authority={selection,scope:{...scopes[selection]},epoch:++epoch};authority=ticket;
 const metadata=await getDraft(identity(ticket.scope,'notesMarkdown'));check(authority===ticket&&metadata,'Exact scoped metadata missing');paint(ticket,metadata);await ready();check(authority===ticket,'Source changed during its opened acknowledgement');return state();
}
async function ready(){
 await wait(async()=>{const value=viewport(),ticket=authority;if(!value||!ticket||value.ownerKey!==JSON.stringify([ticket.scope.accountId,ticket.scope.spaceId,ticket.scope.noteId])||value.document?.noteId!==ticket.scope.noteId||!value.handle||!value.paper.legacyReady||!value.paper.saved||value.paper.blocked||value.paper.reconciling||value.paper.getCurrent()!==value.document)return false;
  const tail=value.paper.whenSaved(),generation=value.generation,handle=value.handle;await tail;await nextFrame();const after=viewport();return authority===ticket&&after?.ownerKey===value.ownerKey&&after.generation===generation&&after.handle===handle&&after.paper.whenSaved()===tail&&after.paper.saved&&!after.paper.reconciling;
 },'Actual Notebook owner and opened canonical tail');
}
async function start(runId:string,reopen=false){
 check(!started&&/^[a-zA-Z0-9-]{1,80}$/.test(runId),'Private writing fixture already started or invalid run');started=true;
 scopes={a1:{accountId:'writing-A-'+runId,spaceId:'year',noteId:'note-one'},a2:{accountId:'writing-A-'+runId,spaceId:'year',noteId:'note-two'},b1:{accountId:'writing-B-'+runId,spaceId:'year',noteId:'note-one'}};
 await appStorage.initialize(localStorage,indexedDB);if(!reopen)for(const scope of Object.values(scopes))await seed(scope);else for(const scope of Object.values(scopes))check(await getDraft(identity(scope)),'Reopen must never seed missing canonical data');
 probe=installRealPaperEditorProbe();for(const type of observedTypes)document.addEventListener(type,observe,true);node=document.createElement('div');node.id='actual-writing-notebook';document.body.append(node);root=createRoot(node);
 const controls=document.createElement('nav');controls.id='private-source-controls';controls.setAttribute('aria-label','Private recipe sources');for(const selection of ['a1','a2','b1'] as const){const button=document.createElement('button');button.textContent='Recipe '+selection;button.dataset.recipeSource=selection;button.addEventListener('click',()=>{void show(selection).catch(error=>{controls.dataset.error=String(error instanceof Error?error.message:error);});});controls.append(button);}document.body.prepend(controls);
 await show('a1');return state();
}
function activeRecord(){const records=probe?.records.filter(record=>{if(!record.created||record.destroyed||!record.view||!record.root||!node?.contains(record.root)||!authority)return false;try{const host=hostFor(record),scope=authority.scope;return host.current()&&host.source.accountId===scope.accountId&&host.source.spaceId===scope.spaceId&&host.source.noteId===scope.noteId;}catch{return false;}})??[];check(records.length===1,'Exactly one actual current Crepe/PM is required');return records[0];}
function capture(){const record=activeRecord(),host=hostFor(record),value=viewport();check(authority&&value?.handle&&host.current(),'Capture requires the exact current admitted canonical host');const id=(probe!.records.indexOf(record)+1);captures.set(id,{record,host,viewport:value,scope:{...authority.scope},epoch:authority.epoch});return recordState(id);}
function recordState(id:number){const captured=captures.get(id);check(captured,'Captured PM source missing');const {record,host,scope}=captured,view=record.view;check(view,'Actual PM view missing');let selection:null|{from:number;to:number;nativeFrom:number|null;nativeTo:number|null;inside:boolean;rects:number;caretFinite:boolean}=null;
 if(!record.destroyed){const native=window.getSelection(),inside=!!native?.anchorNode&&view.dom.contains(native.anchorNode)&&!!native.focusNode&&view.dom.contains(native.focusNode);let nativeFrom:null|number=null,nativeTo:null|number=null;try{if(inside){nativeFrom=view.posAtDOM(native!.anchorNode!,native!.anchorOffset);nativeTo=view.posAtDOM(native!.focusNode!,native!.focusOffset);}}catch{}const rects=native?.rangeCount?Array.from(native.getRangeAt(0).getClientRects()):[];selection={from:view.state.selection.from,to:view.state.selection.to,nativeFrom,nativeTo,inside,rects:rects.length,caretFinite:rects.some(rect=>Number.isFinite(rect.x)&&Number.isFinite(rect.y)&&rect.height>0)};}
 const activity=host.activity()?.editor;return {id,scope,source:structuredClone(host.source),epoch:captured.epoch,connected:view.dom.isConnected,rootHidden:record.root?.hidden??null,inert:!!view.dom.closest('[inert]'),destroyed:record.destroyed,destroyCalls:record.destroyCalls,composing:!record.destroyed&&view.composing,hostCurrent:host.current(),hostComposing:host.composing(),activity:activity?{version:activity.version,dirty:activity.dirty,composing:activity.composing,unconfirmedDOM:activity.unconfirmedDOM,focused:activity.focused,retired:activity.retired,pendingOperations:activity.pendingOperations,error:activity.error?.slice(0,240)??null}:null,text:!record.destroyed?view.dom.textContent:null,selection};
}
async function selectionReady(id:number){
 const captured=captures.get(id),ticket=authority;check(captured&&ticket&&captured.epoch===ticket.epoch,'Selection observation requires its captured current source');
 const {record,host}=captured,view=record.view,value=viewport();check(view&&value,'Actual selection source missing');const ownerKey=value.ownerKey,generation=value.generation,api=value.media.api,handle=value.handle;
 const owned=()=>{const latest=viewport();check(authority===ticket&&latest?.ownerKey===ownerKey&&latest.generation===generation&&latest.media.api===api&&latest.handle===handle&&!record.destroyed&&record.view===view&&host.current()&&view.dom.isConnected,'Selection source/API/epoch changed before its native observer acknowledgement');};
 // Ctrl+End is a native browser action. PM consumes the later selectionchange;
 // observe its own cached DOM selection without calling flush/dispatch/focus or
 // waiting for the PM position asserted by the runner to become a wanted value.
 await wait(()=>{owned();const observer=(view as unknown as {domObserver?:{queue:unknown[];flushingSoon:number;currentSelection:{anchorNode:Node|null;anchorOffset:number;focusNode:Node|null;focusOffset:number}}}).domObserver,native=window.getSelection();check(observer&&Array.isArray(observer.queue)&&Number.isFinite(observer.flushingSoon)&&observer.currentSelection,'Installed PM selection observer must be observable');
  return !view.composing&&view.hasFocus()&&observer.queue.length===0&&observer.flushingSoon<0&&!!native?.anchorNode&&!!native.focusNode&&view.dom.contains(native.anchorNode)&&view.dom.contains(native.focusNode)&&observer.currentSelection.anchorNode===native.anchorNode&&observer.currentSelection.anchorOffset===native.anchorOffset&&observer.currentSelection.focusNode===native.focusNode&&observer.currentSelection.focusOffset===native.focusOffset;
 },'Actual PM acknowledgement of the native selection');owned();return recordState(id);
}
async function flush(){
 const ticket=authority,value=viewport();check(ticket&&value?.handle&&value.ownerKey===JSON.stringify([ticket.scope.accountId,ticket.scope.spaceId,ticket.scope.noteId]),'Current actual viewport missing');
 const ownerKey=value.ownerKey,generation=value.generation,api=value.media.api,handle=value.handle;
 const owned=()=>{const live=viewport();check(authority===ticket&&live?.ownerKey===ownerKey&&live.generation===generation&&live.media.api===api&&live.handle===handle,'Source/API/epoch changed during the admitted writing barrier');return live;};
 const barrier:FlushBarrier={serial:++flushBarrierSerial,epoch:ticket.epoch,phase:'observer',observerRecords:0};flushBarriers.push(barrier);if(flushBarriers.length>12)flushBarriers.shift();
 const firstFailure=()=>{const failed=metadataAttempts.find(attempt=>attempt.ticket===ticket&&attempt.serial>(metadataJoined.get(ticket)??0)&&(attempt.status==='refused'||attempt.status==='rejected'));if(failed)throw failed.error??Error('Actual parent metadata callback refused publication at attempt '+failed.serial);};
 try{
  // Native input dispatch is not the end of PM's scheduled observer/verifyDOM.
  // Read their actual state; never flush the observer or manufacture an input
  // or composition event. The writer must not be called before confirmation.
  await wait(()=>{
   owned();firstFailure();const records=probe?.records.filter(record=>record.created&&!record.destroyed&&record.view&&record.root&&node?.contains(record.root)&&hostFor(record).current())??[];barrier.observerRecords=records.length;
   for(const record of records){const view=record.view!,activity=hostFor(record).activity()?.editor,observer=(view as unknown as {domObserver?:{queue:unknown[];flushingSoon:number}}).domObserver;
    check(observer&&Array.isArray(observer.queue)&&Number.isFinite(observer.flushingSoon),'Installed real PM DOMObserver must be observable');
    if(view.composing||!activity||activity.composing||activity.unconfirmedDOM||observer.flushingSoon>=0||observer.queue.length)return false;
   }owned();return true;
  },'Actual DOM observer and accepted input confirmation');owned();firstFailure();
  barrier.phase='canonical';const confirmed=await handle.flush();owned();firstFailure();check(confirmed,'Actual canonical writer refused confirmation');const settled=await handle.settled();owned();firstFailure();check(settled,'Actual canonical writer not settled');await owned().paper.whenSaved();owned();await ready();owned();firstFailure();
  const canonical=owned().paper.getCurrent(),object=canonical?.objects.find(object=>object.id==='browser-text');check(typeof object?.markdown==='string','The actual single canonical text source must be present');const wanted=object.markdown;
  const beforeMirror=await getDraft(identity(ticket.scope,'notesMarkdown'));owned();firstFailure();check(beforeMirror,'The actual scoped metadata source must exist');
  const afterJoined=metadataJoined.get(ticket)??0;
  let attempt=metadataAttempts.find(attempt=>attempt.ticket===ticket&&attempt.serial>afterJoined&&attempt.requested===wanted);
  if(attempt||(beforeMirror.content as {markdown?:string}).markdown!==wanted){
   barrier.phase='mirror';await wait(()=>{owned();firstFailure();attempt=metadataAttempts.find(attempt=>attempt.ticket===ticket&&attempt.serial>afterJoined&&attempt.requested===wanted);return !!attempt;},'First actual parent metadata callback for the captured canonical buffer');owned();firstFailure();check(attempt,'The actual parent callback must have been admitted');const admitted=attempt;barrier.mirrorSerial=admitted.serial;
   // One exact real call, one terminal result. False/rejection immediately
   // fails, including G4's real CAS refusal. No output polling, explicit mirror
   // call, publication retry or sync suppression may make that failure pass.
   await wait(()=>{owned();firstFailure();return admitted.status!=='pending';},'The first actual parent metadata callback must settle');owned();firstFailure();const accepted=await admitted.work;owned();firstFailure();check(accepted,'The first actual parent metadata callback refused publication');metadataJoined.set(ticket,admitted.serial);await owned().paper.whenSaved();owned();await ready();owned();firstFailure();
  }
  const saved=await stores();owned();firstFailure();barrier.phase='done';return saved;
 }catch(error){barrier.phase='failed';barrier.error=String(error instanceof Error?error.message:error).slice(0,240);throw error;}
}
async function stores(){check(scopes,'Fixture scopes absent');const rows=[];for(const selection of ['a1','a2','b1'] as const){const scope=scopes[selection];rows.push({selection,scope,canonical:await getDraft(identity(scope)),metadata:await getDraft(identity(scope,'notesMarkdown')),queue:(await listMutations(scope.accountId,scope.spaceId)).filter(row=>row.documentId===scope.noteId||row.documentId===notebookDocumentId(scope.noteId)),files:(await listLocalBlobs(scope.accountId,scope.spaceId)).map(({blob,...row})=>({...row,size:blob.size,mediaType:blob.type})),snapshots:(await listSnapshots(scope.accountId,scope.spaceId)).filter(row=>(row.value as {noteId?:string})?.noteId===scope.noteId||row.key.includes('|'+notebookDocumentId(scope.noteId)))});}return rows;}
async function preserve(id:number){const captured=captures.get(id);check(captured,'Captured source absent');const confirmed=await captured.host.flush();return {confirmed,record:recordState(id),stores:await stores()};}
async function finishRetired(id:number){const captured=captures.get(id);check(captured,'Captured source absent');await wait(async()=>{if(captured.record.destroyed)return true;await captured.host.flush();return await captured.host.settled();},'The retired actual PM must preserve its confirmed final source');return {record:recordState(id),stores:await stores()};}
async function checkpoint(label:string,id:number){const captured=captures.get(id);check(captured,'Captured diagnostic source absent');const {text,...state}=recordState(id),document=captured.record.destroyed?null:captured.record.view?.state.doc.toJSON(),focused=document&&captured.record.view?.dom.contains(window.document.activeElement);return {label:label.slice(0,80),...state,focused:!!focused,parked:!!captured.record.view?.dom.closest('.markdown-editor-retained'),moveBeforeAvailable:typeof (Element.prototype as unknown as {moveBefore?:unknown}).moveBefore==='function',DOMLength:text?.length??null,DOMSha256:await digest(text),PMDocSha256:await digest(document??null),events:events.slice(-6)};}
async function sync(){const ticket=authority;check(ticket,'Current source missing');const scope={...ticket.scope},current=()=>authority===ticket;await flush();check(current(),'Source changed before queuing its accepted edits');await queueLocalDrafts(scope.accountId,scope.spaceId);check(current(),'Source changed after its captured local queue');const queued=await listMutations(scope.accountId,scope.spaceId);check(current(),'Source changed before synchronizing its captured queue');const api=new ApiClient('/qa');api.bindAccount(scope.accountId);await synchronizeSpace(api,scope.accountId,scope.spaceId,current);check(current(),'Source changed before its captured sync acknowledgement');const remaining=await listMutations(scope.accountId,scope.spaceId),saved=await stores();check(current(),'Source changed during its captured sync inventory');return {queued:queued.map(row=>({id:row.id,documentId:row.documentId,type:row.type})),remaining,stores:saved};}
async function queue(){const ticket=authority;check(ticket,'Current source missing');const scope={...ticket.scope};await flush();check(authority===ticket,'Source changed before its captured local queue');await queueLocalDrafts(scope.accountId,scope.spaceId);check(authority===ticket,'Source changed before its captured queue acknowledgement');const saved=await stores();check(authority===ticket,'Source changed during its captured queue inventory');return saved;}
async function close(){const receipts:boolean[]=[];let error:string|null=null;try{await flushNotebookWorkspaceForClose(appStorage,Promise.resolve(),async success=>{receipts.push(success);});}catch(caught){error=String(caught instanceof Error?caught.message:caught);}finally{resumeAllNotebookAccounts();appStorage.unfreeze();}return {receipts,error,pending:hasPendingNotebookWrites()};}
function state(){const value=viewport(),scope=authority?.scope,ready=!!scope&&value?.ownerKey===JSON.stringify([scope.accountId,scope.spaceId,scope.noteId])&&value.paper.document===value.document&&value.paper.getCurrent()===value.document&&value.paper.legacyReady&&!value.paper.reconciling&&value.paper.saved&&!value.paper.blocked;return {authority:authority?structuredClone(authority):null,ready,online:navigator.onLine,events:events.slice(),metadata:metadataEvents.slice(),metadataAttempts:metadataAttempts.map(attempt=>({serial:attempt.serial,epoch:attempt.ticket.epoch,current:attempt.ticket===authority,status:attempt.status})).slice(-12),flushBarriers:flushBarriers.slice(),paper:value?{saved:value.paper.saved,legacyReady:value.paper.legacyReady,blocked:value.paper.blocked,reconciling:value.paper.reconciling,notice:value.paper.notice?.slice(0,240)??null}:null,liveEditors:probe?.records.filter(record=>!record.destroyed).length??0,captures:[...captures.keys()].slice(-4).map(id=>{const {text,...record}=recordState(id);return {...record,textLength:text?.length??null};}),inspectionErrors:probe?.records.flatMap(record=>record.inspectionError?[record.inspectionError.slice(0,240)]:[])??[]};}
async function cleanup(){authority=null;root?.unmount();root=null;await settleAllNotebookAccounts();await Promise.allSettled(metadataAttempts.map(attempt=>attempt.work));resumeAllNotebookAccounts();await appStorage.flush();const live=probe?.records.filter(record=>!record.destroyed).length??0;check(live===0,'Actual editor retention must settle before cleanup');probe?.restore();for(const type of observedTypes)document.removeEventListener(type,observe,true);await appStorage.close();node?.remove();document.getElementById('private-source-controls')?.remove();return {liveEditors:live,pending:hasPendingNotebookWrites()};}
const api={start,show,ready,state,capture,recordState,selectionReady,flush,stores,preserve,finishRetired,checkpoint,sync,queue,close,cleanup,sourceText,digest};
declare global{interface Window{__paperWriting:typeof api}}
window.__paperWriting=api;
