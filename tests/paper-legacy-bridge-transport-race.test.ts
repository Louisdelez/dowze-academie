/** Desired regression: the two transport-only cases intentionally fail before
 * the bounded fresh-preflight fix. All calls below are the real bridge/storage
 * against fake-indexeddb; the seam only schedules an earlier real transaction. */
import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {IDBFactory,IDBKeyRange as FakeKeyRange} from 'fake-indexeddb';
import {getDraft,getSnapshot,listDrafts,listLocalBlobs,listMutations,listSnapshots,putDraft,putLocalBlob,savePaperDraft,NotebookTransferChangedError,notebookDeletionKey,type Draft,type Snapshot} from '../pwa/src/storage.ts';
import {applyPaperCommand,migratePaper,notebookDocumentId,type PaperDocument} from '../src/lib/notebookDocument.ts';
import {amendPaperCollaboration,verifyPaperCollaboration} from '../src/lib/paperCollaboration.ts';
import {paperMarkdown} from '../src/lib/paperArchiveMetadata.ts';
import {paperLegacyReceiptKey,reconcilePaperLegacy,stagePaperLegacyMirror,publishPaperLegacyMirror} from '../src/lib/paperLegacyBridge.ts';
import {paperLegacyOwnerKey} from '../src/lib/paperLegacyMigration.ts';

const stamp='2026-10-15T12:00:00.000Z',text='Accepted original paragraph.';
const imageBytes=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==','base64'));
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)??'undefined').digest('hex');
const draftKey=(row:Draft)=>`${row.accountId}|${row.spaceId}|${row.type}|${row.documentId}`;
const bounded=async<T>(promise:Promise<T>,label:string)=>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error(label+': timeout')),5000);})]);}finally{if(timer)clearTimeout(timer);}
};
type RowChange=(rows:ReadonlyMap<string,Draft>)=>readonly Draft[];
type Event={seq:number;kind:'transfer-created'|'transfer-complete'|'transfer-abort'|'prior-complete'|'readonly-get'|'readonly-all';attempt?:number;key?:string;store?:string};
function fixture(t:TestContext){
 const factory=new IDBFactory(),descriptors=new Map(['indexedDB','IDBKeyRange','crypto'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 Object.defineProperty(globalThis,'indexedDB',{configurable:true,writable:true,value:factory});
 Object.defineProperty(globalThis,'IDBKeyRange',{configurable:true,writable:true,value:FakeKeyRange});
 if(!globalThis.crypto?.subtle)Object.defineProperty(globalThis,'crypto',{configurable:true,value:webcrypto});
 t.after(()=>{for(const [name,descriptor] of descriptors){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);}});
 const scope={accountId:'synthetic-bridge-transport',spaceId:'year-one'},foreign={accountId:'synthetic-bridge-foreign',spaceId:scope.spaceId},noteId='same-note';
 const identity={...scope,type:'whiteboard' as const,documentId:notebookDocumentId(noteId)},metadataIdentity={...scope,type:'notesMarkdown' as const,documentId:noteId};
 async function seed(status:Draft['syncState']='local'){
  const plain=migratePaper(noteId,text,null,stamp),withImage=applyPaperCommand(plain,{type:'batch',commands:[
   {type:'add-asset',asset:{id:'original-image',name:'Original.png',mediaType:'image/png',size:imageBytes.length}},
   {type:'upsert-object',object:{id:'original-image-object',pageId:plain.pages[0].id,kind:'image',assetId:'original-image',x:20,y:30,width:40,height:50,rotation:0,z:2,locked:false,createdAt:1}}
  ]},stamp),document=amendPaperCollaboration(withImage,withImage);
  verifyPaperCollaboration(document);
  const paper:Draft={...identity,title:'Original title',content:document,baseVersion:4,updatedAt:1,syncState:'local'};
  await savePaperDraft(paper,null,{markdown:text,legacy:null,migratedAt:stamp});
  const stored=(await getDraft(identity))!;if(status!=='local')await putDraft({...stored,syncState:status});
  const metadata:Draft={...metadataIdentity,title:paper.title,content:{id:noteId,title:paper.title,markdown:text,tags:['preserved']},paperDependency:paper.documentId,baseVersion:7,updatedAt:2,syncState:status};await putDraft(metadata);
  await putLocalBlob({...scope,id:'original-image',documentId:paper.documentId,name:'Original.png',blob:new Blob([imageBytes],{type:'image/png'}),createdAt:1,status:'pending',revision:1});
  await putDraft({...paper,...foreign,syncState:'synced'});await putDraft({...metadata,...foreign,syncState:'synced'});await putLocalBlob({...foreign,id:'original-image',documentId:paper.documentId,name:'Foreign original.png',blob:new Blob([imageBytes],{type:'image/png'}),createdAt:3,status:'uploaded',serverId:'foreign-original',revision:4});
  return {paper:(await getDraft(identity))!,metadata:(await getDraft(metadataIdentity))!,document};
 }
 async function inventory(){
  const drafts=await listDrafts(scope.accountId,scope.spaceId),snapshots=await listSnapshots(scope.accountId,scope.spaceId),files=async(owner:typeof scope)=>Promise.all((await listLocalBlobs(owner.accountId,owner.spaceId)).map(async({blob,...row})=>[row.id,hash({...row,bytes:Buffer.from(await blob.arrayBuffer()).toString('hex')})] as const));
  return {drafts:new Map(drafts.map(row=>[draftKey(row),hash(row)])),snapshots:new Map(snapshots.map(row=>[row.key,hash(row)])),files:await files(scope),queue:hash(await listMutations(scope.accountId,scope.spaceId)),foreign:hash({drafts:await listDrafts(foreign.accountId,foreign.spaceId),snapshots:await listSnapshots(foreign.accountId,foreign.spaceId),files:await files(foreign),queue:await listMutations(foreign.accountId,foreign.spaceId)})};
 }
 /** This wrapper never changes an IDB result, expected value or product method.
  * At creation of the first actual 3-store transfer, a genuine drafts RW tx is
  * created first on the same connection/database. IndexedDB's overlap ordering
  * makes its real puts complete before the transfer's real CAS reads execute. */
 function beforeTransfer(change:RowChange,options:{quotaAfterReceiptWrite?:boolean;raceAttempts?:number;onTransferAbort?:()=>void}={}){
  const open=factory.open.bind(factory),events:Event[]=[],expectedChanges=new Map<string,Draft>(),terminals:Promise<void>[]=[],errors:unknown[]=[],seenStores=new WeakSet<object>();let seq=0,injections=0,attempts=0,quotaWrites=0,quotaThrows=0,priorCompleted=false;
  const mark=(event:Omit<Event,'seq'>)=>{events.push({seq:++seq,...event});};
  factory.open=((...args:Parameters<typeof factory.open>)=>{
   const request=open(...args);request.addEventListener('success',()=>{
    const db=request.result,transaction=db.transaction.bind(db);
    db.transaction=((...args:Parameters<IDBDatabase['transaction']>)=>{
     const names=typeof args[0]==='string'?[args[0]]:Array.from(args[0]),transfer=args[1]==='readwrite'&&names.length===3&&['drafts','scopedBlobs','snapshots'].every(name=>names.includes(name));
     if(transfer&&injections<(options.raceAttempts??1)){
      injections++;const priorAttempt=attempts+1,prior=transaction('drafts','readwrite'),store=prior.objectStore('drafts'),rows=new Map<string,Draft>();let left=2;
      const terminal=new Promise<void>(resolve=>{prior.addEventListener('complete',()=>{priorCompleted=true;mark({kind:'prior-complete',attempt:priorAttempt});resolve();},{once:true});prior.addEventListener('abort',()=>{errors.push(prior.error??Error('The preceding fixture transaction aborted'));resolve();},{once:true});});terminals.push(terminal);
      for(const target of [identity,metadataIdentity]){const key=`${target.accountId}|${target.spaceId}|${target.type}|${target.documentId}`,read=store.get(key);read.onsuccess=()=>{
       try{assert.ok(read.result,'The preceding real transaction needs the admitted row');rows.set(key,read.result as Draft);if(--left)return;for(const row of change(rows)){const next={...row,key:draftKey(row)};expectedChanges.set(next.key,next);store.put(next);}}catch(error){errors.push(error);prior.abort();}
      };}
     }
     const tx=transaction(...args),attempt=transfer?++attempts:undefined;
     if(transfer)mark({kind:'transfer-created',attempt});
     if(transfer&&options.onTransferAbort){const abort=tx.abort.bind(tx);tx.abort=()=>{abort();options.onTransferAbort!();};}
     const terminal=new Promise<void>(resolve=>{tx.addEventListener('complete',()=>{if(transfer)mark({kind:'transfer-complete',attempt});resolve();},{once:true});tx.addEventListener('abort',()=>{if(transfer)mark({kind:'transfer-abort',attempt});resolve();},{once:true});});terminals.push(terminal);
     const objectStore=tx.objectStore.bind(tx);tx.objectStore=(name:string)=>{
      const store=objectStore(name);if(seenStores.has(store))return store;seenStores.add(store);
      if(tx.mode==='readonly'){
       const get=store.get.bind(store);store.get=((key:IDBValidKey|IDBKeyRange)=>{const read=get(key);read.addEventListener('success',()=>mark({kind:'readonly-get',store:name,key:String(key)}),{once:true});return read;}) as IDBObjectStore['get'];
       const getAll=store.getAll.bind(store);store.getAll=((...args:Parameters<IDBObjectStore['getAll']>)=>{const read=getAll(...args);read.addEventListener('success',()=>mark({kind:'readonly-all',store:name}),{once:true});return read;}) as IDBObjectStore['getAll'];
      }
      if(transfer&&options.quotaAfterReceiptWrite&&name==='snapshots'){const put=store.put.bind(store);store.put=((value:Snapshot,key?:IDBValidKey)=>{
       const write=key===undefined?put(value):put(value,key);if(value.key===paperLegacyReceiptKey(scope,noteId))write.addEventListener('success',()=>{quotaWrites++;if(!quotaThrows){quotaThrows++;throw new DOMException('Synthetic quota after a real successful receipt write','QuotaExceededError');}},{once:true});return write;
      }) as IDBObjectStore['put'];}
      return store;
     };return tx;
    }) as IDBDatabase['transaction'];
   },{once:true});return request;
  }) as typeof factory.open;
  const restore=()=>{factory.open=open;};t.after(restore);
  return {events,expectedChanges,errors,get attempts(){return attempts;},get injected(){return injections>0;},get priorCompleted(){return priorCompleted;},get quotaWrites(){return quotaWrites;},get quotaThrows(){return quotaThrows;},restore,settled:()=>bounded(Promise.all(terminals).then(()=>undefined),'All actual fixture transactions must reach a terminal event')};
 }
 const reconcile=(current=()=>true)=>bounded(reconcilePaperLegacy({noteId,scope,incomingMarkdown:text,metadataAuthority:'indexeddb',current,now:stamp}),'Actual bridge reconciliation');
 return {scope,foreign,noteId,identity,metadataIdentity,seed,inventory,beforeTransfer,reconcile};
}
function assertFreshRetry(seam:ReturnType<ReturnType<typeof fixture>['beforeTransfer']>,paper:Draft,metadata:Draft,fullPreflight=true){
 assert.equal(seam.injected,true,'The race must have been introduced by a real preceding transaction');assert.equal(seam.priorCompleted,true,'That transaction must have committed');assert.deepEqual(seam.errors,[]);assert.equal(seam.attempts,2,'One stale CAS and one freshly prepared commit are enough for the single transport transition');
 const firstAbort=seam.events.find(row=>row.kind==='transfer-abort'&&row.attempt===1),secondCreate=seam.events.find(row=>row.kind==='transfer-created'&&row.attempt===2),complete=seam.events.find(row=>row.kind==='transfer-complete'&&row.attempt===2),prior=seam.events.find(row=>row.kind==='prior-complete');assert.ok(firstAbort&&secondCreate&&complete&&prior,'A real abort and successful later native commit are required');assert.ok(prior.seq<firstAbort.seq&&firstAbort.seq<secondCreate.seq&&secondCreate.seq<complete.seq);
 assertFreshSources(seam,2,paper,metadata,fullPreflight);
}
function assertFreshSources(seam:ReturnType<ReturnType<typeof fixture>['beforeTransfer']>,attempt:number,paper:Draft,metadata:Draft,fullPreflight=true){
 const aborted=seam.events.find(row=>row.kind==='transfer-abort'&&row.attempt===attempt-1),created=seam.events.find(row=>row.kind==='transfer-created'&&row.attempt===attempt);assert.ok(aborted&&created);
 const read=(store:string,key:string)=>seam.events.some(row=>row.kind==='readonly-get'&&row.store===store&&row.key===key&&row.seq>aborted.seq&&row.seq<created.seq);
 for(const key of [draftKey(paper),draftKey(metadata)])assert.ok(read('drafts',key),'A fresh native read of each source must precede retry: '+key);
 const scope={accountId:paper.accountId,spaceId:paper.spaceId},noteId=(paper.content as PaperDocument).noteId;
 for(const key of [paperLegacyReceiptKey(scope,noteId),paperLegacyOwnerKey(noteId,scope),notebookDeletionKey(paper),...(fullPreflight?['paper-migration|'+draftKey(paper)]:[])])assert.ok(read('snapshots',key),'Every relevant receipt/owner/deletion/baseline must be natively reread: '+key);
 if(fullPreflight)assert.ok(seam.events.some(row=>row.kind==='readonly-all'&&row.store==='scopedBlobs'&&row.seq>aborted.seq&&row.seq<created.seq),'All original files must be freshly read before reconciliation retry');
}
async function assertNoPublication(f:ReturnType<typeof fixture>,before:Awaited<ReturnType<ReturnType<typeof fixture>['inventory']>>,seam:ReturnType<ReturnType<typeof fixture>['beforeTransfer']>,attempts=1){
 await seam.settled();assert.equal(seam.injected,true);assert.equal(seam.priorCompleted,true);assert.deepEqual(seam.errors,[]);assert.equal(seam.attempts,attempts,'Only the explicitly bounded transport attempts may run');
 const after=await f.inventory(),wanted=new Map(before.drafts);for(const [key,row] of seam.expectedChanges)wanted.set(key,hash(row));assert.deepEqual(after.drafts,wanted,'Only the deliberate prior transaction may change a source row');assert.deepEqual(after.snapshots,before.snapshots,'A refused opening cannot publish or consume any receipt');assert.deepEqual(after.files,before.files,'Every original media byte/property remains intact');assert.equal(after.queue,before.queue);assert.equal(after.foreign,before.foreign);
}

test('Desired: a real local-to-queued race is re-prepared from fresh durable sources without changing any graph or original', {concurrency:false,timeout:12000},async t=>{
 const f=fixture(t),source=await f.seed(),before=await f.inventory(),seam=f.beforeTransfer(rows=>[{...rows.get(draftKey(source.paper))!,syncState:'queued'}]);
 try{
  const result=await f.reconcile();await seam.settled();assertFreshRetry(seam,source.paper,source.metadata);const after=await f.inventory(),wanted=new Map(before.drafts);for(const [key,row] of seam.expectedChanges)wanted.set(key,hash(row));assert.deepEqual(after.drafts,wanted);assert.deepEqual(after.files,before.files);assert.equal(after.queue,before.queue);assert.equal(after.foreign,before.foreign);assert.equal(hash(result.draft.content),hash(source.document));assert.equal(result.draft.syncState,'queued');assert.equal(result.changed,false);assert.equal(result.recovered,false);assert.equal(paperMarkdown(result.draft.content as PaperDocument),text);verifyPaperCollaboration(result.draft.content as PaperDocument);
  for(const [key,sha] of before.snapshots)assert.equal(after.snapshots.get(key),sha);assert.equal([...after.snapshots.keys()].filter(key=>key.startsWith('paper-legacy-recovery|')).length,1);const savedReceipt=await getSnapshot(paperLegacyReceiptKey(f.scope,f.noteId));assert.ok(savedReceipt,'The acknowledged observation must actually exist in native IDB');assert.equal(savedReceipt.accountId,f.scope.accountId);assert.equal(savedReceipt.spaceId,f.scope.spaceId);assert.equal(hash(savedReceipt.value),hash(result.receipt),'The entire durable receipt must equal the fresh returned observation');assert.equal(hash((savedReceipt.value as typeof result.receipt).sourceMetadata),hash(source.metadata));
 }finally{await seam.settled();seam.restore();}
});
test('Desired: monotone canonical and metadata ACKs between preflight and CAS keep their exact envelopes in the fresh receipt', {concurrency:false,timeout:12000},async t=>{
 const f=fixture(t),source=await f.seed('queued'),before=await f.inventory(),seam=f.beforeTransfer(rows=>[source.paper,source.metadata].map(row=>({...rows.get(draftKey(row))!,baseVersion:row.baseVersion+1,syncState:'synced'})));
 try{
  const result=await f.reconcile();await seam.settled();assertFreshRetry(seam,source.paper,source.metadata);const after=await f.inventory(),wanted=new Map(before.drafts);for(const [key,row] of seam.expectedChanges)wanted.set(key,hash(row));assert.deepEqual(after.drafts,wanted);assert.equal(result.draft.baseVersion,source.paper.baseVersion+1);assert.equal(result.draft.syncState,'synced');assert.equal(hash(result.draft.content),hash(source.document));assert.equal(hash(result.receipt.sourceMetadata),hash(seam.expectedChanges.get(draftKey(source.metadata))));assert.equal(result.receipt.paperRevision,source.document.revision);assert.equal(result.receipt.observed.markdown,text);assert.deepEqual(after.files,before.files);assert.equal(after.queue,before.queue);assert.equal(after.foreign,before.foreign);for(const [key,sha] of before.snapshots)assert.equal(after.snapshots.get(key),sha);assert.equal([...after.snapshots.keys()].filter(key=>key.startsWith('paper-legacy-recovery|')).length,1);const savedReceipt=await getSnapshot(paperLegacyReceiptKey(f.scope,f.noteId));assert.ok(savedReceipt,'The acknowledged observation must actually exist in native IDB');assert.equal(savedReceipt.accountId,f.scope.accountId);assert.equal(savedReceipt.spaceId,f.scope.spaceId);assert.equal(hash(savedReceipt.value),hash(result.receipt),'The entire durable receipt must equal the fresh returned observation');assert.equal(hash((savedReceipt.value as typeof result.receipt).sourceMetadata),hash(seam.expectedChanges.get(draftKey(source.metadata))),'The durable receipt must contain the freshly acknowledged metadata, never the stale preflight copy');
 }finally{await seam.settled();seam.restore();}
});
test('A concurrent accepted graph edit is refused without retry or stale receipt publication', {concurrency:false,timeout:12000},async t=>{
 const f=fixture(t),source=await f.seed(),before=await f.inventory(),next=amendPaperCollaboration(source.document,applyPaperCommand(source.document,{type:'patch-object',id:source.document.objects.find(row=>row.kind==='text')!.id,patch:{markdown:'A newer actual contribution.'}},stamp)),seam=f.beforeTransfer(rows=>[{...rows.get(draftKey(source.paper))!,content:next,updatedAt:20}]);
 await assert.rejects(f.reconcile());await assertNoPublication(f,before,seam);assert.equal(paperMarkdown((await getDraft(f.identity))!.content as PaperDocument),'A newer actual contribution.');
});
test('A newly retired canonical identity is refused without retry or reactivation', {concurrency:false,timeout:12000},async t=>{
 const f=fixture(t),source=await f.seed(),before=await f.inventory(),seam=f.beforeTransfer(rows=>[{...rows.get(draftKey(source.paper))!,identityAlias:'paper-v3-note-another-incarnation'}]);await assert.rejects(f.reconcile());await assertNoPublication(f,before,seam);
});
test('A valid replacement collaboration lineage cannot become a transport-only retry', {concurrency:false,timeout:12000},async t=>{
 const f=fixture(t),source=await f.seed(),before=await f.inventory(),{collaboration,...bare}=source.document,replacement=amendPaperCollaboration(bare,bare);verifyPaperCollaboration(replacement);assert.notEqual(replacement.collaboration!.lineage,collaboration!.lineage);const seam=f.beforeTransfer(rows=>[{...rows.get(draftKey(source.paper))!,content:replacement}]);await assert.rejects(f.reconcile());await assertNoPublication(f,before,seam);
});
test('Owner epoch A-to-B-to-A before the real commit stays revoked and never retries', {concurrency:false,timeout:12000},async t=>{
 const f=fixture(t);await f.seed();const before=await f.inventory();let epoch=1;const admitted=epoch,seam=f.beforeTransfer(()=>{epoch++;epoch++;return [];});await assert.rejects(f.reconcile(()=>epoch===admitted));await assertNoPublication(f,before,seam);assert.equal(epoch,3);assert.equal(epoch===admitted,false);
});
test('A conflict envelope appearing during preflight is refused even when its payload is unchanged', {concurrency:false,timeout:12000},async t=>{
 const f=fixture(t),source=await f.seed('queued'),before=await f.inventory(),seam=f.beforeTransfer(rows=>[{...rows.get(draftKey(source.paper))!,syncState:'conflict',conflict:{serverVersion:19}}]);await assert.rejects(f.reconcile());await assertNoPublication(f,before,seam);
});
test('A regressing base version is refused rather than classified as an acknowledgement', {concurrency:false,timeout:12000},async t=>{
 const f=fixture(t),source=await f.seed('queued'),before=await f.inventory(),seam=f.beforeTransfer(rows=>[{...rows.get(draftKey(source.paper))!,baseVersion:source.paper.baseVersion-1,syncState:'synced'}]);await assert.rejects(f.reconcile());await assertNoPublication(f,before,seam);
});
test('Quota after a real successful receipt put rolls back the whole transfer and cannot trigger a CAS retry', {concurrency:false,timeout:12000},async t=>{
 const f=fixture(t);await f.seed();const before=await f.inventory(),seam=f.beforeTransfer(()=>[],{quotaAfterReceiptWrite:true});await assert.rejects(f.reconcile());await assertNoPublication(f,before,seam);assert.equal(seam.quotaWrites,1,'The quota seam must run after a real successful native write');assert.equal(seam.quotaThrows,1);assert.equal(seam.events.filter(row=>row.kind==='transfer-abort').length,1);
});

async function mirrorSource(f:ReturnType<typeof fixture>){
 const source=await f.seed('queued');await f.reconcile();const desired='Accepted current canonical text.',graph=amendPaperCollaboration(source.document,applyPaperCommand(source.document,{type:'patch-object',id:source.document.objects.find(row=>row.kind==='text')!.id,patch:{markdown:desired}},stamp));
 await savePaperDraft({...source.paper,content:graph},source.document.revision);const paper=(await getDraft(f.identity))!;await putDraft({...paper,syncState:'queued'});return {paper:(await getDraft(f.identity))!,metadata:(await getDraft(f.metadataIdentity))!,graph,desired};
}
const ackBoth=(rows:ReadonlyMap<string,Draft>)=>[...rows.values()].map(row=>({...row,baseVersion:row.baseVersion+1,syncState:'synced' as const}));
test('Mirror staging survives an actual queued-to-ACK race only after fresh graph, metadata and exact source receipts are reread', {concurrency:false,timeout:12000},async t=>{
 const f=fixture(t),source=await mirrorSource(f),before=await f.inventory(),seam=f.beforeTransfer(ackBoth);
 const ticket=await bounded(stagePaperLegacyMirror({noteId:f.noteId,scope:f.scope,expectedMarkdown:text,desiredMarkdown:source.desired,metadataAuthority:'indexeddb',current:()=>true,now:stamp}),'Actual mirror staging');await seam.settled();assertFreshRetry(seam,source.paper,source.metadata,false);
 const receipt=await getSnapshot(paperLegacyReceiptKey(f.scope,f.noteId));assert.ok(receipt);assert.equal(hash(receipt),hash(ticket.receiptRow),'The complete staged receipt must be durably written');assert.equal(ticket.receipt.mirror?.status,'staged');assert.equal(hash(ticket.paper),hash(seam.expectedChanges.get(draftKey(source.paper))));assert.equal(hash(ticket.metadata),hash(seam.expectedChanges.get(draftKey(source.metadata))));
 const after=await f.inventory(),wanted=new Map(before.drafts);for(const [key,row] of seam.expectedChanges)wanted.set(key,hash(row));assert.deepEqual(after.drafts,wanted);assert.equal(hash(ticket.paper.content),hash(source.graph));assert.deepEqual(after.files,before.files);assert.equal(after.queue,before.queue);assert.equal(after.foreign,before.foreign);assert.equal(after.snapshots.size,before.snapshots.size);for(const [key,sha] of before.snapshots)if(key!==receipt.key)assert.equal(after.snapshots.get(key),sha);
});
test('Mirror publication rebuilds its metadata update after a real transport ACK without overwriting its newer base or original fields', {concurrency:false,timeout:12000},async t=>{
 const f=fixture(t),source=await mirrorSource(f),ticket=await stagePaperLegacyMirror({noteId:f.noteId,scope:f.scope,expectedMarkdown:text,desiredMarkdown:source.desired,metadataAuthority:'indexeddb',current:()=>true,now:stamp}),before=await f.inventory(),wanted={...source.metadata,content:{...(source.metadata.content as object),markdown:source.desired}},wantedSHA=hash(wanted),seam=f.beforeTransfer(ackBoth);
 const result=await bounded(publishPaperLegacyMirror(ticket,{current:()=>true,confirmedMarkdown:source.desired,metadataDraft:wanted,now:stamp}),'Actual mirror publication');await seam.settled();assertFreshRetry(seam,source.paper,source.metadata,false);
 const receipt=await getSnapshot(paperLegacyReceiptKey(f.scope,f.noteId)),metadata=(await getDraft(f.metadataIdentity))!,paper=(await getDraft(f.identity))!;assert.ok(receipt);assert.equal(hash(receipt),hash(result.receiptRow),'The returned publication must equal the exact durable row');assert.equal(hash((receipt.value as typeof result.receipt).sourceMetadata),hash(metadata),'The receipt must contain the actually committed fresh metadata');assert.equal(result.receipt.mirror?.status,'published');assert.equal(result.receipt.observed.markdown,source.desired);assert.equal(hash(paper),hash(seam.expectedChanges.get(draftKey(source.paper))));assert.equal(metadata.baseVersion,source.metadata.baseVersion+1);assert.equal(metadata.syncState,'local');assert.equal(metadata.paperDependency,paper.documentId);assert.equal(hash(metadata.content),hash({...source.metadata.content as object,markdown:source.desired,updatedAt:stamp}));assert.equal(metadata.title,source.metadata.title);assert.equal(hash(wanted),wantedSHA,'The caller metadata proposal must remain untouched');
 const after=await f.inventory();assert.equal(after.drafts.size,before.drafts.size);assert.deepEqual(after.files,before.files);assert.equal(after.queue,before.queue);assert.equal(after.foreign,before.foreign);assert.equal(after.snapshots.size,before.snapshots.size);for(const [key,sha] of before.snapshots)if(key!==receipt.key)assert.equal(after.snapshots.get(key),sha);
});
test('Successive real transport changes exhaust exactly three commits and publish no stale or partial receipt', {concurrency:false,timeout:12000},async t=>{
 const f=fixture(t),source=await f.seed('queued'),before=await f.inventory(),seam=f.beforeTransfer(ackBoth,{raceAttempts:3});await assert.rejects(f.reconcile(),NotebookTransferChangedError);await assertNoPublication(f,before,seam,3);assert.equal(seam.events.filter(row=>row.kind==='prior-complete').length,3);assert.equal(seam.events.filter(row=>row.kind==='transfer-abort').length,3);assert.equal(seam.events.filter(row=>row.kind==='transfer-complete').length,0);assertFreshSources(seam,2,source.paper,source.metadata);assertFreshSources(seam,3,source.paper,source.metadata);
});
test('Authority retirement after the genuine CAS abort starts takes priority over its simultaneous transport mismatch', {concurrency:false,timeout:12000},async t=>{
 const f=fixture(t);await f.seed('queued');const before=await f.inventory();let epoch=1;const captured=epoch,seam=f.beforeTransfer(ackBoth,{onTransferAbort:()=>{epoch++;epoch++;}});let failure:unknown;
 try{await f.reconcile(()=>epoch===captured);}catch(error){failure=error;}assert.ok(failure instanceof Error);assert.equal(failure instanceof NotebookTransferChangedError,false,'An old owner must never receive a retryable CAS result');await assertNoPublication(f,before,seam);assert.equal(epoch,3);assert.equal(epoch===captured,false);
});
