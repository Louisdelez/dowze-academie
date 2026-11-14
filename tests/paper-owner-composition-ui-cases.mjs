/** Mounted software integration only: actual Notebook/Crepe/ProseMirror,
 * writer registries, canonical/recovery storage and DeviceCache run unchanged.
 * Composition DOM events and geometry are synthetic; the close receipt is an
 * observed JS callback, not native IPC or physical keyboard/IME evidence.
 * Root adds the two names/call to its existing guarded runner and exports
 * flushNotebookWorkspaceForClose from src/lib/notebookClose in its entry.
 * No product, runner, entry, PM flag, input gate or persistence is replaced.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const OWNER_COMPOSITION_UI_GROUP='Actual Notebook retires owner and API during accepted PM composition, preserves the old final buffer and never reactivates it through ABA';
export const COMPOSITION_CLOSE_UI_GROUP='Actual Notebook PM composition refuses the workspace close receipt and a fresh close waits for canonical storage and the real cache';
export const OWNER_COMPOSITION_UI_GROUPS=[OWNER_COMPOSITION_UI_GROUP,COMPOSITION_CLOSE_UI_GROUP];
const sha=value=>createHash('sha256').update(value).digest('hex');
const jsonSha=value=>sha(JSON.stringify(value));
const identity=(m,media,noteId,type='whiteboard')=>({accountId:media.accountId,spaceId:media.spaceId,type,documentId:type==='whiteboard'?m.notebookDocumentId(noteId):noteId});
const text=(document,id)=>document?.objects.find(object=>object.id===id)?.markdown??'';
const proofSnapshots=new WeakMap();

async function scopeProof(m,media,noteId){
 const files=[];for(const {blob,...metadata} of await m.listLocalBlobs(media.accountId,media.spaceId))files.push({metadata,sha256:sha(new Uint8Array(await blob.arrayBuffer()))});
 const proof={canonical:jsonSha(await m.getDraft(identity(m,media,noteId))),metadata:jsonSha(await m.getDraft(identity(m,media,noteId,'notesMarkdown'))),queue:jsonSha(await m.listMutations(media.accountId,media.spaceId)),files:jsonSha(files)},snapshots=await m.listSnapshots(media.accountId,media.spaceId);proof.snapshots=jsonSha(snapshots);
 proofSnapshots.set(proof,snapshots);return proof;
}

function scopeDifference(actual,expected){
 const changedFields=[...new Set([...Object.keys(expected),...Object.keys(actual)])].filter(key=>actual[key]!==expected[key]);
 if(!changedFields.includes('snapshots'))return {changedFields,changedValueFields:[]};
 const before=new Map((proofSnapshots.get(expected)??[]).map(row=>[row.key,row])),after=new Map((proofSnapshots.get(actual)??[]).map(row=>[row.key,row])),keys=[...new Set([...before.keys(),...after.keys()])],changed=keys.filter(key=>JSON.stringify(before.get(key))!==JSON.stringify(after.get(key)));
 const describe=row=>row?{kind:typeof row.value?.kind==='string'?row.value.kind.slice(0,72):null,observedAt:typeof row.value?.observedAt==='string'?row.value.observedAt.slice(0,40):null,paperRevision:row.value?.paperRevision??null,sha:jsonSha(row).slice(0,16)}:null;
 const snapshots=changed.slice(0,2).map(key=>{const previous=before.get(key),next=after.get(key),fields=[...new Set([...Object.keys(previous?.value??{}),...Object.keys(next?.value??{})])];return {changedValueFields:fields.filter(field=>JSON.stringify(previous?.value?.[field])!==JSON.stringify(next?.value?.[field])).slice(0,16),changedRowFields:[...new Set([...Object.keys(previous??{}),...Object.keys(next??{})])].filter(field=>JSON.stringify(previous?.[field])!==JSON.stringify(next?.[field])),before:describe(previous),after:describe(next),key:key.slice(0,140)};});
 return {changedFields,changedValueFields:[...new Set(snapshots.flatMap(row=>row.changedValueFields))].slice(0,16).map(field=>field.slice(0,40)),snapshots:{beforeCount:before.size,afterCount:after.size,changedCount:changed.length,omitted:Math.max(0,changed.length-snapshots.length),rows:snapshots}};
}

function logScopeDifference(transition,phase,difference){
 const diagnostic={transition,phase,...difference};
 // Keep valid bounded JSON before the assertion, whose message the parent
 // reporter truncates. This never changes the strict hashes or prints a graph.
 while(JSON.stringify(diagnostic).length>1400&&diagnostic.snapshots?.rows.length){diagnostic.snapshots.rows.pop();diagnostic.snapshots.omitted++;}
 console.log('Owner composition scope diff '+JSON.stringify(diagnostic));
}

async function openedForeignScopeProof({m,wait,state,bounded,tick},f,media,noteId){
 const ownerKey=JSON.stringify([media.accountId,media.spaceId,noteId]);
 const matches=value=>!!value&&value.ownerKey===ownerKey&&value.media?.accountId===media.accountId&&value.media?.spaceId===media.spaceId&&value.media?.api===media.api&&value.document?.noteId===noteId&&value.paper?.document===value.document&&value.paper.legacyReady&&value.paper.saved&&!value.paper.reconciling&&!value.paper.blocked&&value.paper.getCurrent()===value.document;
 let proof;
 await wait(async()=>{
  const before=state(f);if(!matches(before))return false;
  const tail=before.paper.whenSaved(),generation=before.generation,handle=before.handle;
  // Only the current foreign B's public canonical tail is awaited. Settling
  // account A here would reject its intentionally still-admitted composition.
  await m.act(async()=>{await bounded(tail,'The opened foreign B must finish its public canonical tail before its baseline');await tick();});
  const settled=state(f);if(!matches(settled)||settled.generation!==generation||settled.handle!==handle||settled.paper.whenSaved()!==tail)return false;
  const captured=await scopeProof(m,media,noteId),after=state(f);
  if(!matches(after)||after.generation!==generation||after.handle!==handle||after.paper.whenSaved()!==tail)return false;
  proof=captured;return true;
 },'The actual foreign B owner/API and its final opened canonical tail must match before capturing its complete scope baseline');
 return proof;
}

async function activateActualText({m,click,wait,state,hasRecord,recordFor,pointer,client,tick},f){
 if(!hasRecord(f,'text-0')){
  const reader=f.container.querySelector('[data-editable-page="page-A"] .paper-editable-page-reader [data-object="text-0"]');
  assert.ok(reader,'The actual Notebook must expose its canonical readonly text reader');
  await m.act(async()=>{reader.dispatchEvent(pointer('pointerdown',{...client(f,'page-A',60,60),timeStamp:18000}));await tick();});
 }
 await wait(()=>hasRecord(f,'text-0'),'The real Notebook text contact must mount its real PM writer');
 const record=recordFor(f,'text-0');assert.equal(record.view.editable,true,'The contacted actual PM must initially be editable');assert.equal(state(f).document.noteId,f.props.noteId,'The contacted writer must belong to the current Notebook note');return record;
}

async function inputEvent(m,record,type,options,tick){
 const view=record.view.dom.ownerDocument.defaultView,event=new view.InputEvent(type,{bubbles:true,cancelable:true,...options});
 await m.act(async()=>{record.view.dom.dispatchEvent(event);await tick();});return event;
}

async function readDeviceCacheRecord(key){
 const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('dowze-academie-device-cache',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('The actual device cache read was blocked'));});
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction('records','readonly'),request=tx.objectStore('records').get(key);let value;request.onsuccess=()=>{value=request.result;};tx.oncomplete=()=>resolve(value);tx.onerror=()=>{};tx.onabort=()=>reject(tx.error??Error('The actual device cache read aborted'));});}
 finally{db.close();}
}

export async function runOwnerCompositionUiGroups(context){
 const {group,m,mount,click,wait,idle,state,stored,seed,hasRecord,recordFor,observedHostHandle,composition,compositionText,edit,flushReady,bounded,tick,pointer,client,delayWrite}=context;
 await group(OWNER_COMPOSITION_UI_GROUP,async()=>{
  let caseName='not-started',phase='mount';
  try{
  for(const transition of ['owner-change','owner-ABA','API-ABA']){
   caseName=transition;phase='mount-and-seed';
   const f=await mount({notebook:true,objects:1,flow:true}),apiA={},apiB={},A={...f.props.media,api:apiA},B={accountId:A.accountId+'-foreign',spaceId:A.spaceId,api:apiB},noteId=f.props.noteId;
   await seed(B,noteId,{objects:1,flow:true});await f.render({media:A});
   const record=await activateActualText(context,f),oldHost=observedHostHandle(record),oldViewport=state(f).handle,oldDom=record.view.dom;
   assert.ok(oldHost,'The exact PM must expose its actual canonical host handle');
   const oldSource=oldHost.source,canonicalBefore=structuredClone(await m.getDraft(identity(m,A,noteId))),metadataBefore=structuredClone(await m.getDraft(identity(m,A,noteId,'notesMarkdown'))),queueBefore=structuredClone(await m.listMutations(A.accountId,A.spaceId));
   const initialMarker=` Initial accepted IME ${transition} 日本.`,finalMarker=` Final old IME ${transition} 語.`,forbidden='FORBIDDEN-FRESH-RETIRED-TEXT';
   phase='admit-initial-composition';
   await composition(record,true);await compositionText(record,initialMarker);
   assert.equal(oldHost.composing(),true,'The captured host must observe the initial active PM composition');assert.equal(await bounded(oldHost.flush(),'Preserve the actual initial composing buffer'),false,'Preserving unconfirmed composing text must not claim canonical confirmation');
   const initialDom=oldDom.textContent;
   const initialRows=await m.listSnapshots(A.accountId,A.spaceId);
   assert.ok(initialRows.some(row=>row.key.startsWith('paper-editor-recovery|')&&row.value?.editorId===oldSource.noteId+'-'+oldSource.objectId&&row.value?.generation===oldSource.generation&&row.value?.composing===true&&row.value?.domText===initialDom),'The raw composing buffer must have a truthful durable old-scope snapshot');
   phase='retire-owner-or-api-while-composing';
   let foreignBefore;
   if(transition==='API-ABA'){
    foreignBefore=await scopeProof(m,B,noteId);await f.render({media:{...A,api:apiB}});await f.render({media:A});
   }else{
    await f.render({media:B});phase='capture-fully-opened-foreign-baseline';foreignBefore=await openedForeignScopeProof(context,f,B,noteId);
    if(transition==='owner-ABA')await f.render({media:A});
   }
   phase='retained-old-dom-and-composition';
   assert.equal(record.destroyed,false,'Authority retirement must not destroy a still-composing PM');
   assert.equal(record.view.dom,oldDom,'Retirement must retain this exact original PM DOM');assert.equal(oldDom.isConnected,true,'The original composing PM DOM must remain connected after authority retirement');assert.equal(record.root.hidden,false,'The admitted composing root must not acquire display:none');assert.equal(oldDom.closest('[inert]'),null,'The admitted old composition may not be made inert before its actual end');
   assert.equal(record.view.composing,true,'Authority retirement must not end the actual old PM composition');assert.equal(oldHost.composing(),true,'The old host must still report its admitted composition after retirement');assert.equal(oldHost.current(),false,'The retained DOM must not regain admission after ABA');
   assert.equal(oldViewport.navigate('page-A'),false,'The old viewport handle must remain revoked');
   assert.equal(await bounded(oldHost.settled(),'The retired composing writer cannot claim settlement'),false,'The old composing host cannot acknowledge settlement');
   phase='refuse-original-account-close';
   await assert.rejects(()=>bounded(m.settleNotebookAccount(A.accountId),'The original account cannot close during its retained composition'),error=>error instanceof Error&&!/timeout/.test(error.message)&&/texte|composition|saisie/i.test(error.message));
   assert.equal(record.destroyed,false,'A denied old-account close must retain the source PM');assert.equal(record.view.composing,true,'A denied old-account close must leave the actual composition active');
   phase='refuse-new-input-on-retired-dom';
   const beforeRejected=oldDom.textContent,rejected=await inputEvent(m,record,'beforeinput',{inputType:'insertText',data:forbidden,isComposing:false},tick);
   assert.equal(rejected.defaultPrevented,true,'Retirement must refuse a fresh input outside the admitted IME chain');assert.equal(oldDom.textContent,beforeRejected,'Refused fresh input must leave the original DOM text unchanged');
   phase='finish-admitted-old-composition';
   const finalAdmission=await inputEvent(m,record,'beforeinput',{inputType:'insertCompositionText',data:finalMarker,isComposing:true},tick);
   assert.equal(finalAdmission.defaultPrevented,false,'The exact already admitted composition must be allowed to finish on its original DOM');
   await compositionText(record,finalMarker);const finalDom=oldDom.textContent;assert.ok(finalDom.includes(initialMarker)&&finalDom.includes(finalMarker),'The actual original DOM must contain both admitted composition fragments');
   assert.equal(record.destroyed,false,'The source PM must remain alive before its final compositionend');assert.equal(record.view.composing,true,'The source PM composition must still be active before its explicit end event');
   await composition(record,false);
   phase='confirm-final-old-scope-recovery';
   let finalRow;
   await wait(async()=>{
    const rows=await m.listSnapshots(A.accountId,A.spaceId);finalRow=rows.find(row=>row.key.startsWith('paper-editor-recovery|')&&row.value?.editorId===oldSource.noteId+'-'+oldSource.objectId&&row.value?.generation===oldSource.generation&&row.value?.composing===false&&row.value?.unconfirmedDOM===false&&typeof row.value?.markdown==='string'&&row.value.markdown.includes(initialMarker)&&row.value.markdown.includes(finalMarker));
    if(!record.destroyed)await bounded(oldHost.flush(),'Retry only the captured old writer after its real compositionend');
    return !!finalRow;
   },'The fully confirmed final composition must be preserved under its original scope, not silently dropped or published into the current note');
   assert.equal(finalRow.accountId,A.accountId,'Final recovery must retain the original account');assert.equal(finalRow.spaceId,A.spaceId,'Final recovery must retain the original year');assert.equal(finalRow.value.noteId,noteId,'Final recovery must retain the original logical note');assert.deepEqual(finalRow.value.baseline,canonicalBefore.content,'Final recovery must retain the exact original baseline');
   if(finalRow.value.domText!==undefined)assert.equal(finalRow.value.domText,finalDom,'Any raw DOM proof must be the final accepted old DOM, never a fabricated approximation');
   await wait(async()=>record.destroyed||await bounded(oldHost.settled(),'The old host must finish its own durable retirement')===true,'The preserved old PM must become safe to release');
   phase='verify-no-canonical-or-foreign-publication';
   assert.equal(oldHost.current(),false,'The old host may not regain authority after preservation');assert.equal(oldViewport.navigate('page-A'),false,'The old viewport may not regain navigation after preservation');
   assert.deepEqual(await m.getDraft(identity(m,A,noteId)),canonicalBefore,'A retired unconfirmed buffer is recovery data, not permission to overwrite a returning A');
   assert.deepEqual(await m.getDraft(identity(m,A,noteId,'notesMarkdown')),metadataBefore,'The old IME recovery must not replace current A metadata');assert.deepEqual(await m.listMutations(A.accountId,A.spaceId),queueBefore,'The old IME recovery must not enqueue any current A mutation');
   const foreignAfter=await scopeProof(m,B,noteId);
   const difference=scopeDifference(foreignAfter,foreignBefore);
   if(difference.changedFields.length)logScopeDifference(transition,phase,difference);
   assert.deepEqual(foreignAfter,foreignBefore,`changedFields=${difference.changedFields.join(',')||'none'} changedValueFields=${difference.changedValueFields.join(',')||'none'}; Finishing the old IME may not mutate B canonical, metadata, queue, files or snapshots`);
   const current=await stored(f);assert.equal(JSON.stringify(current).includes(initialMarker),false,'The current canonical note must not receive the retired initial fragment');assert.equal(JSON.stringify(current).includes(finalMarker),false,'The current canonical note must not receive the retired final fragment');assert.equal(JSON.stringify(current).includes(forbidden),false,'The current canonical note must not receive refused fresh text');
   assert.equal(record.destroyCalls<=1,true,'Old PM retirement may not double-destroy its source');
  }
  }catch(error){throw new Error(`Owner composition transition=${caseName} phase=${phase}: ${String(error?.message??error)}`,{cause:error});}
 });

 await group(COMPOSITION_CLOSE_UI_GROUP,async()=>{
  assert.equal(typeof m.flushNotebookWorkspaceForClose,'function','Root must export the actual workspace close barrier from its entry');
  const f=await mount({notebook:true,objects:1,flow:true}),record=await activateActualText(context,f),host=observedHostHandle(record),A=f.props.media,noteId=f.props.noteId;
  assert.ok(host);const baseline=structuredClone(await stored(f)),marker=' Actual close IME 日本語.',late=' Accepted after composition before close.';
  const events=[],receipts=[],cache=m.appStorage,key='qa-owner-composition-close|'+A.accountId,previousValue=cache.getItem(key),failures=[];
  const proxy={flush:async()=>{events.push('cache:flush');await cache.flush();},freeze:()=>{events.push('cache:freeze');cache.freeze();},unfreeze:()=>{events.push('cache:unfreeze');cache.unfreeze();}};
  let held=null,closing=null,restoreOpen=null;
  const receipt=async success=>{
   if(success){const saved=await m.getDraft(identity(m,A,noteId));assert.ok(text(saved?.content,'text-0').includes(marker)&&text(saved?.content,'text-0').includes(late),'A positive close receipt requires the actual final canonical buffer');assert.equal(await readDeviceCacheRecord(key),'after-confirmed-ime','A positive receipt requires the actual durable cache record');assert.equal(m.hasPendingNotebookWrites(),false);}
   receipts.push(success);events.push('receipt:'+success);
  };
  try{
   await composition(record,true);await compositionText(record,marker);const domText=record.view.dom.textContent;
   await assert.rejects(()=>bounded(m.flushNotebookWorkspaceForClose(proxy,Promise.resolve(),receipt),'The real close barrier must refuse active PM composition'),error=>error instanceof Error&&!/timeout/.test(error.message)&&/texte|composition|saisie/i.test(error.message));
   assert.deepEqual(receipts,[false]);assert.deepEqual(events,['cache:unfreeze','receipt:false']);assert.equal(record.destroyed,false);assert.equal(record.view.composing,true);assert.equal(record.view.dom.isConnected,true);assert.equal(host.pending(),true);
   const recovery=await m.listSnapshots(A.accountId,A.spaceId);assert.ok(recovery.some(row=>row.value?.kind==='paper-editor-buffer'&&row.value.noteId===noteId&&row.value.composing===true&&row.value.domText===domText),'The denied real close must preserve its visible raw composition, not silently call it saved');assert.deepEqual(await stored(f),baseline);
   cache.setItem(key,'resumed-after-refusal');await cache.flush();assert.equal(await readDeviceCacheRecord(key),'resumed-after-refusal','A denied close must unfreeze the real cache');
   await composition(record,false);await flushReady(f);assert.ok(text(await stored(f),'text-0').includes(marker));assert.equal(record.destroyed,false);
   events.length=0;receipts.length=0;restoreOpen=indexedDB.open;held=delayWrite();await edit(record,late);cache.setItem(key,'after-confirmed-ime');
   closing=m.flushNotebookWorkspaceForClose(proxy,Promise.resolve(),receipt);void closing.catch(()=>{});
   await bounded(held.began,'The actual PM close flush must reach its real canonical database open');
   assert.deepEqual(receipts,[]);assert.deepEqual(events,[],'Neither cache freeze nor a positive receipt may precede the actual accepted canonical tail');assert.equal(host.pending(),true);assert.equal(m.hasPendingNotebookWrites(),true);assert.equal(text(await stored(f),'text-0').includes(late),false);
   indexedDB.open=restoreOpen;restoreOpen=null;held.resolve();await m.act(async()=>{await bounded(closing,'The full close barrier must finish only after canonical storage and cache commits');await tick();});
   assert.deepEqual(receipts,[true]);assert.deepEqual(events,['cache:flush','cache:freeze','cache:flush','receipt:true']);assert.equal(host.pending(),false);assert.equal(m.hasPendingNotebookWrites(),false);
   const saved=await stored(f);assert.deepEqual(saved.pages,baseline.pages);assert.ok(text(saved,'text-0').includes(marker)&&text(saved,'text-0').includes(late));
  }catch(error){failures.push(error);}
  finally{
   if(restoreOpen)indexedDB.open=restoreOpen;if(held)held.resolve();
   if(closing)try{await m.act(async()=>{await bounded(closing,'Drain the exact close operation before restoring cache state');});}catch(error){if(!failures.includes(error))failures.push(error);}
   try{m.resumeAllNotebookAccounts();cache.unfreeze();if(previousValue===null)cache.removeItem(key);else cache.setItem(key,previousValue);await cache.flush();}catch(error){failures.push(error);}
  }
  if(failures.length)throw new AggregateError(failures,'Actual composition workspace-close integration or exact cleanup failed');
 });
}
