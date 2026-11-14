/** Real mounted hook/bridge/native IDB cases. Compile seam only observes the real
 * reconcile promise, and may hold its fulfilled return; it never replaces it. */
import assert from 'node:assert/strict';
export const INITIAL_RECONCILE_GROUPS=[
 'Initial metadata tail rechecks the exact committed opening without planning a second reconciliation',
 'Native canonical RW between opening and metadata validation aborts the proof then fully reconciles',
 'Markdown changed while a real committed opening return is held still fully reconciles the new source',
 'Markdown A-B-A during opening cannot reuse its first source observation',
 'Explicit reopen reads a changed canonical revision and permanently retires an old API opening proof'
];
const observerKey='__DOWZE_INITIAL_RECONCILE_FIXTURE__';
function deferred(){let release;const promise=new Promise(resolve=>{release=resolve;});return {promise,release};}
function observe(h,{holdFirstOpening=false}={}){
 const previous=Object.getOwnPropertyDescriptor(globalThis,observerKey),gate=deferred(),rows=[];let held=false;
 const observer=(input,original)=>{
  const row={incoming:input.incomingMarkdown,opening:input.retryTransport===false,scope:{...input.scope},settled:false,result:undefined};rows.push(row);
  const real=h.tracked(original,'Real legacy reconcile '+rows.length);
  return h.tracked((async()=>{const result=await real;row.result=result;row.settled=true;if(holdFirstOpening&&row.opening&&!held){held=true;await gate.promise;}return result;})(),'Observed real legacy return '+rows.length);
 };
 Object.defineProperty(globalThis,observerKey,{configurable:true,value:observer});
 return {rows,get held(){return held;},release:()=>gate.release(),restore:()=>{gate.release();if(previous)Object.defineProperty(globalThis,observerKey,previous);else Reflect.deleteProperty(globalThis,observerKey);}};
}
export async function runInitialReconcileCases(h){
 const {group,m,seed,inventory,beforeTransfer,mount,ready,waitFor,render}=h;
 await group(INITIAL_RECONCILE_GROUPS[0],async()=>{
  const f=await seed('initial-proof',{image:false}),before=await inventory(f.owner),puts=[],seen=observe(h),seam=beforeTransfer(f,null,{races:0,onPut:(attempt,store,value)=>puts.push({attempt,store,key:value.key})});
  try{
   await mount(f);await ready();await seam.settled();
   assert.equal(seen.rows.length,1,'The same real initial Markdown must invoke the actual bridge planner only once');
   const proof=seen.rows[0].result.postcondition;assert.ok(proof,'Only the real successful bridge may produce the committed postcondition');
   assert.deepEqual([proof.drafts,proof.blobs,proof.snapshots],[[],[],[]]);assert.ok(Object.isFrozen(proof)&&Object.isFrozen(proof.draftChecks)&&proof.draftChecks.every(row=>Object.isFrozen(row)));
   assert.equal(seam.attempts,2,'The second operation is still a real native three-store whole-row CAS');
   assert.equal(puts.filter(row=>row.attempt===2).length,0,'No receipt, body or file may be rewritten by the exact-observation validation');
   const first=seam.events.find(row=>row.kind==='transfer-complete'&&row.attempt===1),second=seam.events.find(row=>row.kind==='transfer-created'&&row.attempt===2),last=seam.events.find(row=>row.kind==='transfer-complete'&&row.attempt===2);assert.ok(first&&second&&last&&first.seq<second.seq&&second.seq<last.seq);
   const read=(store,key)=>seam.events.some(row=>row.kind==='read'&&row.store===store&&row.key===key&&row.seq>second.seq&&row.seq<last.seq);
   assert.ok(read('drafts',`${f.owner.accountId}|${f.owner.spaceId}|whiteboard|${f.identity.documentId}`));
   for(const key of [m.paperLegacyReceiptKey(f.owner,f.noteId),m.notebookDeletionKey(f.identity),m.paperLegacyOwnerKey(f.noteId,f.owner)])assert.ok(read('snapshots',key),'The native validation must recheck every scoped authority row');
   assert.deepEqual(h.paper().document,f.document);assert.deepEqual((await m.getDraft(f.identity)).content,f.document);
   const after=await inventory(f.owner);assert.deepEqual(after.drafts,before.drafts);assert.deepEqual(after.files,before.files);assert.deepEqual(after.outbox,before.outbox);for(const old of before.snapshots)assert.deepEqual(after.snapshots.find(row=>row.key===old.key),old);await f.foreignExact();
  }finally{seen.restore();}
 });
 await group(INITIAL_RECONCILE_GROUPS[1],async()=>{
  const f=await seed('proof-native-canonical',{image:false}),before=await inventory(f.owner),puts=[],seen=observe(h);let replacement;
  const seam=beforeTransfer(f,({store,row})=>{replacement=m.amendPaperCollaboration(row.content,m.applyPaperCommand(row.content,{type:'update-page',page:{...row.content.pages[0],color:'#dceefa'}}));store.put({...row,content:replacement,syncState:'local'});},{races:1,injectWhen:attempt=>attempt===2,onPut:(attempt,store)=>puts.push({attempt,store})});
  try{
   await mount(f);await ready();await seam.settled();assert.deepEqual(seam.errors,[]);assert.equal(seam.injections,1);assert.ok(replacement);
   assert.ok(seam.events.some(row=>row.kind==='prior-complete'&&row.attempt===1));assert.ok(seam.events.some(row=>row.kind==='transfer-abort'&&row.attempt===2),'The real same-ref memory proof must be refused by a fresh native CAS');
   assert.equal(puts.filter(row=>row.attempt===2).length,0);assert.equal(seen.rows.length,2,'Changed canonical storage must use the full real bridge after validation abort');assert.equal(seen.rows[1].opening,false);
   assert.deepEqual(h.paper().document,replacement);assert.deepEqual((await m.getDraft(f.identity)).content,replacement);m.verifyPaperCollaboration(h.paper().document);
   const after=await inventory(f.owner);assert.deepEqual(after.files,before.files);assert.deepEqual(after.outbox,before.outbox);for(const old of before.snapshots)assert.deepEqual(after.snapshots.find(row=>row.key===old.key),old);await f.foreignExact();
  }finally{seen.restore();}
 });
 for(const [index,aba]of [[2,false],[3,true]])await group(INITIAL_RECONCILE_GROUPS[index],async()=>{
  const f=await seed(aba?'proof-source-aba':'proof-source-b',{image:false}),before=await inventory(f.owner),seen=observe(h,{holdFirstOpening:true}),seam=beforeTransfer(f,null,{races:0});
  try{
   await mount(f);await waitFor(()=>seen.held,'The original bridge commit must be terminal before its return is held');assert.equal(seen.rows.length,1);assert.equal(seen.rows[0].settled,true);
   const changed='A new external source accepted during initial opening.';await render({noteId:f.noteId,markdown:changed,media:f.owner});if(aba)await render({noteId:f.noteId,markdown:seen.rows[0].incoming,media:f.owner});
   seen.release();await ready();await seam.settled();assert.equal(seen.rows.length,2,'A changed or returned source must perform its own complete reconciliation');assert.equal(seen.rows[1].opening,false);assert.equal(seen.rows[1].incoming,aba?seen.rows[0].incoming:changed);
   const durable=await m.getDraft(f.identity);assert.deepEqual(h.paper().document,durable.content);assert.equal(m.paperMarkdown(durable.content),aba?seen.rows[0].incoming:changed);m.verifyPaperCollaboration(durable.content);
   const after=await inventory(f.owner);assert.deepEqual(after.files,before.files);assert.deepEqual(after.outbox,before.outbox);for(const old of before.snapshots)assert.deepEqual(after.snapshots.find(row=>row.key===old.key),old);await f.foreignExact();
  }finally{seen.restore();}
 });
 await group(INITIAL_RECONCILE_GROUPS[4],async()=>{
  const f=await seed('proof-reopen-api',{image:false}),apiA={},apiB={},media={...f.owner,api:apiA},seen=observe(h,{holdFirstOpening:true}),seam=beforeTransfer(f,null,{races:0});
  try{
   await mount(f,media);await waitFor(()=>seen.held,'Hold the real opening result before API retirement');const old=h.paper();
   await render({noteId:f.noteId,markdown:seen.rows[0].incoming,media:{...f.owner,api:apiB}});await render({noteId:f.noteId,markdown:seen.rows[0].incoming,media});
   assert.equal(old.getCurrent(),null,'An old opening closure must remain retired through API A-B-A');seen.release();await ready();await seam.settled();
   assert.ok(seen.rows.filter(row=>row.opening).length>=2);assert.deepEqual(h.paper().document,f.document);assert.equal(old.getCurrent(),null);
   const before=await m.getDraft(f.identity),replacement=m.amendPaperCollaboration(before.content,m.applyPaperCommand(before.content,{type:'update-page',page:{...before.content.pages[0],color:'#eeddbc'}}));await m.savePaperDraft({...before,content:replacement},before.content.revision);
   const previousCount=seen.rows.length;dispatchEvent(new CustomEvent('dowze:paper-import-ready',{detail:{...f.owner,noteId:f.noteId}}));
   await waitFor(()=>h.paper()?.document?.revision===replacement.revision&&!h.paper().reconciling&&h.paper().saved,'Explicit reopen must adopt the freshly stored canonical revision');await m.act(async()=>{await h.paper().whenSaved();});await seam.settled();
   assert.equal(seen.rows.length,previousCount+1);assert.equal(seen.rows.at(-1).opening,true);assert.equal(seen.rows.at(-1).result.postcondition,undefined,'Explicit import retries must not create reusable initial proofs');
   assert.deepEqual(h.paper().document,replacement);assert.deepEqual((await m.getDraft(f.identity)).content,replacement);await f.foreignExact();
  }finally{seen.restore();}
 });
}
