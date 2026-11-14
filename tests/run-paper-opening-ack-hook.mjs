/** Real hook + real bridge/storage on fake-indexeddb. No product method/result is replaced.
 * The race seam schedules a prior native RW transaction on the same DB.
 * NOT a real-browser/physical-IME recipe. Run only under the repository full guard. */
import {build} from 'vite';
import {IDBFactory,IDBKeyRange} from 'fake-indexeddb';
import {JSDOM} from 'jsdom';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {mkdtemp,rm,mkdir,writeFile,readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {join,dirname} from 'node:path';
import {mountedAuditPath} from './mounted-cleanup.mjs';
import {INITIAL_RECONCILE_GROUPS,runInitialReconcileCases} from './paper-initial-opening-reconcile-cases.mjs';
import {ASSET_LOST_ACK_GROUP,runPaperOpeningAssetLostAckCase} from './paper-opening-asset-lost-ack-case.mjs';
import {PAPER_PREPARED_GROUPS,runPaperPreparedMutationCases} from './paper-prepared-mutation-cases.mjs';
const declaredNames=["No-op attachment ACK preserves exact Yjs/body and retry idempotency after a lost response", "Actual uploaded attachment ACK changes only proved mapping and produces valid collaborative graph", "Mounted initial opening fully rereads after real ACK graph/blob rewrite and preserves the new contribution", "Mounted fresh opening refuses alias after a real colliding transaction", "Mounted fresh opening refuses conflict after a real colliding transaction", "Mounted fresh opening refuses tombstone after a real colliding transaction", "Three consecutive real collisions exhaust the global opening budget without stale publication", "Real terminal QuotaExceededError after receipt write rolls back without retry, even with a new Markdown source", "Real terminal UnknownError after receipt write rolls back without retry, even with a new Markdown source", "Mounted owner-ABA permanently retires the old attempt before exposing or retrying it", "Mounted API-ABA permanently retires the old attempt before exposing or retrying it", "Noncollaborative seed preserves absent history without overwriting an original", "Noncollaborative seed preserves identical history without overwriting an original", "Noncollaborative seed preserves divergent history without overwriting an original", "Divergent seed history remains intact through a real CAS collision and fresh retry", "Quota after a real divergent seed recovery write rolls back draft and recovery together"].concat(ASSET_LOST_ACK_GROUP,PAPER_PREPARED_GROUPS,INITIAL_RECONCILE_GROUPS);
const report={schema:1,kind:'paper-opening-ack-mounted-hook',startedAt:new Date().toISOString(),proofScope:'Actual usePaperDocument/ApiClient/bridge/storage/Yjs; React JSDOM and fake-indexeddb. Injected fetch oracle, no native-browser/process-restart claim.',declaredGroups:declaredNames.length,declaredNames,groupsStarted:0,groups:[],passed:0,failed:0,allGroupsAttempted:false,fullSuiteAttempted:false,fullSuite:false,notRun:[],fatal:null,cleanupFinal:{status:'NOTRUN'}};
const reportPath=mountedAuditPath('t-native-initial-opening-reconcile-tests-20261016.json');
const out=await mkdtemp(join(process.cwd(),'tests/.paper-opening-ack-'));
const globals=['indexedDB','IDBKeyRange','crypto','window','document','HTMLElement','Element','Node','CustomEvent','Event','navigator','addEventListener','removeEventListener','dispatchEvent','IS_REACT_ACT_ENVIRONMENT'];
const descriptors=new Map(globals.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
const previousEnv=process.env.NODE_ENV;process.env.NODE_ENV='development';
const stamp='2026-10-15T12:00:00.000Z',text='Accepted original paragraph.';
const bytes=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==','base64'));
const sha=value=>createHash('sha256').update(JSON.stringify(value)??'undefined').digest('hex');
const key=row=>`${row.accountId}|${row.spaceId}|${row.type}|${row.documentId}`;
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
// Keep the complete original operation after a deadline. A timeout is a failed
// assertion, never permission to restore IDB/globals under a live continuation.
const pendingOperations=new Map(),operationRecords=new WeakMap(),lateErrors=[],timedOutOperations=[];
function tracked(promise,label,kind='operation'){
 if(operationRecords.has(promise))return promise;
 const record={label,kind,timedOut:false};let complete;
 complete=Promise.resolve(promise).catch(error=>{if(record.timedOut)lateErrors.push({label,error:errorDetail(error)});throw error;}).finally(()=>pendingOperations.delete(complete));
 operationRecords.set(complete,record);pendingOperations.set(complete,record);void complete.catch(()=>{});return complete;
}
const bounded=async(promise,label)=>{const complete=tracked(promise,label);let timer;try{return await Promise.race([complete,new Promise((_,reject)=>{timer=setTimeout(()=>{const record=operationRecords.get(complete);record.timedOut=true;timedOutOperations.push({label:record.label,kind:record.kind});reject(Error(label+': timeout'));},6500);})]);}finally{clearTimeout(timer);}};
async function drainOperations(label,{excludeGroups=false}={}){
 const deadline=Date.now()+6500,remaining=()=>[...pendingOperations].filter(([,record])=>!excludeGroups||record.kind!=='group');
 while(remaining().length){
  const milliseconds=deadline-Date.now(),labels=()=>remaining().map(([,record])=>record.label).slice(0,8);
  if(milliseconds<=0)throw Error(label+': still active '+JSON.stringify(labels()));
  let timer;try{const settled=await Promise.race([Promise.allSettled(remaining().map(([promise])=>promise)).then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),milliseconds);})]);if(!settled)throw Error(label+': still active '+JSON.stringify(labels()));}finally{clearTimeout(timer);}
 }
}
const sourcePaths=['pwa/src/api.ts','pwa/src/sync.ts','pwa/src/storage.ts','src/hooks/usePaperDocument.ts','src/lib/paperLegacyBridge.ts','src/lib/notebookSession.ts','tests/paper-opening-ack-hook-entry.ts','tests/run-paper-opening-ack-hook.mjs','tests/paper-opening-asset-lost-ack-case.mjs','tests/paper-prepared-mutation-cases.mjs','tests/paper-initial-opening-reconcile-cases.mjs','tests/mounted-cleanup.mjs'];
const sourceHashes=async()=>Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')])));
let dom,m,root,paper,props,sequence=0,passed=0,failed=0,restoreSeam=()=>{},reports=[],groupAccounts=new Set(),currentSeams=[];
const waitFor=async(predicate,label)=>{const deadline=Date.now()+6500;while(!predicate()){if(Date.now()>=deadline)throw Error(label+': timeout');await m.act(async()=>{await tick();});}};
const render=async(next)=>{props=next;await m.act(async()=>{m.flushSync(()=>root.render(m.createElement(m.HookRecipe,{...props,report:value=>{paper=value;reports.push({paper:value,document:value.document,current:value.getCurrent()});}})));});};
async function inventory(owner){
 const files=await Promise.all((await m.listLocalBlobs(owner.accountId,owner.spaceId)).map(async({blob,...row})=>({...row,bytes:Buffer.from(await blob.arrayBuffer()).toString('hex')})));
 return {drafts:await m.listDrafts(owner.accountId,owner.spaceId),snapshots:await m.listSnapshots(owner.accountId,owner.spaceId),files,outbox:await m.listMutations(owner.accountId,owner.spaceId)};
}
async function seed(label,{image=true,collaboration=true}={}){
 const factory=new IDBFactory();Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:factory});
 const owner={accountId:'synthetic-opening-'+label+'-'+(++sequence),spaceId:'year-one'},foreign={accountId:owner.accountId+'-foreign',spaceId:owner.spaceId},noteId='same-note';
 groupAccounts.add(owner.accountId);groupAccounts.add(foreign.accountId);
 const identity={...owner,type:'whiteboard',documentId:m.notebookDocumentId(noteId)},metadataIdentity={...owner,type:'notesMarkdown',documentId:noteId};
 let plain=m.migratePaper(noteId,text,null,stamp);
 if(image)plain=m.applyPaperCommand(plain,{type:'batch',commands:[{type:'add-asset',asset:{id:'original-image',name:'Original.png',mediaType:'image/png',size:bytes.length}},{type:'upsert-object',object:{id:'original-image-object',pageId:plain.pages[0].id,kind:'image',assetId:'original-image',x:20,y:30,width:40,height:50,rotation:0,z:2,locked:false,createdAt:1}}]},stamp);
 const document=collaboration?m.amendPaperCollaboration(plain,plain):plain;
 const draft={...identity,title:'Original title',content:document,baseVersion:4,updatedAt:1,syncState:'local'},metadata={...metadataIdentity,title:'Original title',content:{id:noteId,title:'Original title',markdown:text,tags:['preserved']},paperDependency:identity.documentId,baseVersion:7,updatedAt:2,syncState:'synced'};
 await m.putDraft(draft);await m.putDraft(metadata);await m.putSnapshot({key:'paper-migration|'+key(draft),...owner,value:{markdown:text,legacy:null,migratedAt:stamp}});
 if(image)await m.putLocalBlob({...owner,id:'original-image',documentId:identity.documentId,name:'Original.png',blob:new Blob([bytes],{type:'image/png'}),createdAt:1,status:'pending',revision:1});
 await m.putDraft({...draft,...foreign,syncState:'synced'});await m.putDraft({...metadata,...foreign});
 if(image)await m.putLocalBlob({...foreign,id:'original-image',documentId:identity.documentId,name:'Foreign.png',blob:new Blob([bytes],{type:'image/png'}),createdAt:3,status:'uploaded',serverId:'foreign-original',revision:4});
 const foreignBefore=sha(await inventory(foreign));
 return {factory,owner,foreign,noteId,identity,metadataIdentity,draft,metadata,document,foreignBefore,foreignExact:async()=>assert.equal(sha(await inventory(foreign)),foreignBefore,'Foreign drafts/receipts/files/outbox must remain exact')};
}
function beforeTransfer(f,change,{races=1,failAfterReceipt,failAfterSnapshot,onCreated,onAbort,injectWhen,onPut}={}){
 const nativeOpen=f.factory.open.bind(f.factory),events=[],errors=[],terminals=[];let attempts=0,injections=0,seq=0,successfulReceiptWrites=0;
 currentSeams.push({errors});
 const mark=row=>events.push({seq:++seq,...row});
 f.factory.open=(...args)=>{const request=nativeOpen(...args);request.addEventListener('success',()=>{
  const db=request.result,nativeTransaction=db.transaction.bind(db);
  db.transaction=(...args)=>{
   const names=typeof args[0]==='string'?[args[0]]:Array.from(args[0]),transfer=args[1]==='readwrite'&&names.length===3&&['drafts','scopedBlobs','snapshots'].every(name=>names.includes(name));
   if(transfer&&injections<races&&change&&(!injectWhen||injectWhen(attempts+1))){
    const attempt=++injections,prior=nativeTransaction(['drafts','scopedBlobs','snapshots'],'readwrite'),store=prior.objectStore('drafts');
    terminals.push(tracked(new Promise(resolve=>{prior.addEventListener('complete',()=>{mark({kind:'prior-complete',attempt});resolve();},{once:true});prior.addEventListener('abort',()=>{errors.push(prior.error??Error('Prior native transaction aborted'));resolve();},{once:true});}),'Real preceding transfer transaction '+attempt));
    const read=store.get(key(f.identity));read.addEventListener('success',()=>{try{assert.ok(read.result,'The native source must exist');change({tx:prior,store,row:read.result,attempt});}catch(error){errors.push(error);prior.abort();}},{once:true});
   }
   const tx=nativeTransaction(...args),attempt=transfer?++attempts:undefined;
   if(transfer){mark({kind:'transfer-created',attempt});onCreated?.(attempt);if(onAbort){const abort=tx.abort.bind(tx);tx.abort=()=>{abort();onAbort(attempt);};}}
   terminals.push(tracked(new Promise(resolve=>{tx.addEventListener('complete',()=>{if(transfer)mark({kind:'transfer-complete',attempt});resolve();},{once:true});tx.addEventListener('abort',()=>{if(transfer)mark({kind:'transfer-abort',attempt});resolve();},{once:true});}),'Real '+tx.mode+' transaction '+names.join(',')));
   const nativeObjectStore=tx.objectStore.bind(tx),wrapped=new WeakSet();tx.objectStore=name=>{
    const store=nativeObjectStore(name);if(wrapped.has(store))return store;wrapped.add(store);
    if(tx.mode==='readonly'||transfer&&onPut){
     const get=store.get.bind(store);store.get=(value)=>{const req=get(value);req.addEventListener('success',()=>mark({kind:'read',store:name,key:String(value)}),{once:true});return req;};
     const getAll=store.getAll.bind(store);store.getAll=(...args)=>{const req=getAll(...args);req.addEventListener('success',()=>mark({kind:'all',store:name}),{once:true});return req;};
    }
    if(transfer&&onPut){const put=store.put.bind(store);store.put=(value,...args)=>{const req=put(value,...args);req.addEventListener('success',()=>onPut(attempt,name,value),{once:true});return req;};}
    if(transfer&&(failAfterReceipt||failAfterSnapshot)&&name==='snapshots'){
     const put=store.put.bind(store);store.put=(value,...args)=>{const req=put(value,...args);if(value.key===m.paperLegacyReceiptKey(f.owner,f.noteId)&&failAfterReceipt||failAfterSnapshot?.matches(value))req.addEventListener('success',()=>{successfulReceiptWrites++;if(failAfterSnapshot?.matches(value))failAfterSnapshot.fail(attempt);else failAfterReceipt(attempt);},{once:true});return req;};
    }
    return store;
   };return tx;
  };
 },{once:true});return request;};
 restoreSeam=()=>{f.factory.open=nativeOpen;};
 return {events,errors,get attempts(){return attempts;},get injections(){return injections;},get successfulReceiptWrites(){return successfulReceiptWrites;},settled:()=>bounded(Promise.all(terminals),'Native transaction terminals')};
}
async function mount(f,media=f.owner){paper=null;reports=[];root=m.createRoot(document.getElementById('root'));await render({noteId:f.noteId,markdown:text,media});}
async function ready(){await waitFor(()=>paper?.document&&paper.legacyReady&&!paper.reconciling&&paper.saved&&!paper.blocked,'Mounted opening must reach a durable ready state');await m.act(async()=>{await paper.whenSaved();});}
function assertFreshSources(f,seam,attempt=2){
 const aborted=seam.events.find(row=>row.kind==='transfer-abort'&&row.attempt===attempt-1),created=seam.events.find(row=>row.kind==='transfer-created'&&row.attempt===attempt);assert.ok(aborted&&created,'A real abort must precede a later commit attempt');
 const read=(store,key)=>seam.events.some(row=>row.kind==='read'&&row.store===store&&row.key===key&&row.seq>aborted.seq&&row.seq<created.seq);
 for(const id of [f.identity,f.metadataIdentity])assert.ok(read('drafts',key(id)),'Fresh source draft read required: '+key(id));
 for(const id of [m.paperLegacyReceiptKey(f.owner,f.noteId),m.paperLegacyOwnerKey(f.noteId,f.owner),m.notebookDeletionKey(f.identity),'paper-migration|'+key(f.identity)])assert.ok(read('snapshots',id),'Fresh scoped receipt read required: '+id);
 assert.ok(seam.events.some(row=>row.kind==='all'&&row.store==='scopedBlobs'&&row.seq>aborted.seq&&row.seq<created.seq),'Original bytes must be freshly inventoried');
}
async function noPublication(f,seam){await waitFor(()=>paper?.blocked,'Refusal must remain visible');await m.act(async()=>{await paper.whenSaved();});await seam.settled();assert.equal(paper.document,null,'No rejected draft may be exposed');assert.deepEqual(seam.errors,[]);assert.equal(await m.getSnapshot(m.paperLegacyReceiptKey(f.owner,f.noteId)),undefined,'No observation receipt may survive rollback');await f.foreignExact();}
const errorDetail=error=>({name:error?.name,code:error?.code,operator:error?.operator,message:String(error?.message??error).split('\n')[0].slice(0,220),actualSha:error&&'actual' in error?sha(error.actual):undefined,expectedSha:error&&'expected' in error?sha(error.expected):undefined,at:String(error?.stack??'').split('\n').filter(line=>/^\s+at /.test(line)).slice(0,4)});
async function cleanupSteps(steps){const completed=[];try{for(const step of steps){await step.run();completed.push(step.name);}return {status:'PASS',steps:completed,pendingOperations:pendingOperations.size};}catch(error){return {status:'FAIL',steps:completed,error:errorDetail(error),pendingOperations:pendingOperations.size,pendingLabels:[...pendingOperations.values()].map(row=>row.label).slice(0,8)};}}
async function group(name,work){
 if(!declaredNames.includes(name)||report.groups.some(row=>row.name===name))throw Error('Unknown or duplicate opening ACK group: '+name);
 const record={name,status:'RUNNING',cleanup:{status:'NOTRUN'}},lateStart=lateErrors.length,timeoutStart=timedOutOperations.length;report.groups.push(record);report.groupsStarted++;groupAccounts=new Set();currentSeams=[];
 try{await tracked(Promise.resolve().then(work),'Complete group '+name,'group');passed++;record.status='PASS';console.log(name+': PASS');}
 catch(error){failed++;record.status='FAIL';record.error=errorDetail(error);console.error(name+': FAIL');console.error(JSON.stringify(record.error));}
 finally{
  const cleanup=await cleanupSteps([
   {name:'drain-complete-originals-before-hook-cleanup',run:()=>drainOperations('Original operations before hook cleanup')},
   {name:'settle-actual-mounted-writers',run:async()=>{for(const accountId of groupAccounts)await bounded(m.settleNotebookAccount(accountId),'Actual mounted writer settlement '+accountId);}},
   {name:'actual-hook-unmount',run:async()=>{if(root){await bounded(m.act(async()=>root.unmount()),'Actual mounted hook unmount');root=null;}}},
   {name:'drain-native-terminals-before-seam-restore',run:async()=>{await drainOperations('Native terminals before seam restore');const errors=currentSeams.flatMap(seam=>seam.errors);if(errors.length)throw new AggregateError(errors,'Native fixture transaction failed');if(timedOutOperations.length>timeoutStart)throw Error('A timed-out original operation is never an accepted refusal');}},
   {name:'resume-settled-notebook-accounts',run:()=>m.resumeAllNotebookAccounts()},
   {name:'restore-native-IDB-seam',run:()=>{restoreSeam();restoreSeam=()=>{};paper=null;}}
  ]);record.cleanup=cleanup;record.lateErrors=lateErrors.slice(lateStart);record.timedOutOperations=timedOutOperations.slice(timeoutStart);if(cleanup.status!=='PASS'){if(record.status==='PASS'){passed--;failed++;}record.status='FAIL';throw Error('Opening ACK cleanup failed; subsequent groups are NOTRUN');}
 }
}
try{
 report.sourceHashes=await sourceHashes();
 // Compile-only observation of the actual bridge operation. The same injection
 // is applied to baseline and candidate; no product result or current guard is replaced.
 let bridgeSeams=0;
 const bridgeObserver={name:'observe-real-initial-legacy-reconcile',enforce:'pre',transform(code,id){
  if(id.split('?')[0].replaceAll('\\','/').endsWith('/src/lib/paperLegacyBridge.ts')){
   const marker='export async function reconcilePaperLegacy(input:PaperLegacyBridgeInput){';assert.equal(code.split(marker).length-1,1,'The real bridge entry must have one exact declaration');bridgeSeams++;
   return code.replace(marker,`export async function reconcilePaperLegacy(input:PaperLegacyBridgeInput){
 const original=reconcilePaperLegacyFixtureOriginal(input),observe=(globalThis as any).__DOWZE_INITIAL_RECONCILE_FIXTURE__;
 return observe?await observe(input,original):await original;
}
async function reconcilePaperLegacyFixtureOriginal(input:PaperLegacyBridgeInput){`);
  }
 }};
 await build({configFile:false,plugins:[bridgeObserver],ssr:{noExternal:['yjs','lib0']},build:{ssr:'tests/paper-opening-ack-hook-entry.ts',outDir:out,copyPublicDir:false,minify:false,sourcemap:false,reportCompressedSize:false,rollupOptions:{output:{entryFileNames:'opening-ack.mjs'}}},logLevel:'error'});
 assert.equal(bridgeSeams,1,'The real bridge compile observation must be installed exactly once');
 dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://qa.invalid/'});
 for(const [name,value] of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,CustomEvent:dom.window.CustomEvent,Event:dom.window.Event,navigator:dom.window.navigator,IDBKeyRange,crypto:webcrypto,IS_REACT_ACT_ENVIRONMENT:true,addEventListener:dom.window.addEventListener.bind(dom.window),removeEventListener:dom.window.removeEventListener.bind(dom.window),dispatchEvent:dom.window.dispatchEvent.bind(dom.window)}))Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});
 m=await import(pathToFileURL(join(out,'opening-ack.mjs')));
 await group('No-op attachment ACK preserves exact Yjs/body and retry idempotency after a lost response',async()=>{
  const f=await seed('noop',{image:false}),before=await m.getDraft(f.identity),calls=[];assert.equal(Object.hasOwn(before.content,'blob_ids'),false);assert.equal(m.resolvePaperAssets(before.content,[]),before.content,'No-op resolution must preserve identity');
  await m.queueLocalDrafts(f.owner.accountId,f.owner.spaceId,(type,id)=>type==='whiteboard'&&id===f.identity.documentId);
  const queued=await m.listMutations(f.owner.accountId,f.owner.spaceId);assert.equal(queued.length,1);let lost=true;
  const api={bindAccount:()=>{},syncDocumentFilter:(type,id)=>type==='whiteboard'&&id===f.identity.documentId,putDocument:async(space,type,id,base,content,mutationId)=>{calls.push({space,type,id,base,content:structuredClone(content),mutationId});if(lost){lost=false;throw new TypeError('Synthetic lost ACK');}return {version:base+1};}};
  await assert.rejects(m.flushMutations(api,f.owner.accountId,f.owner.spaceId,()=>true),/Synthetic lost ACK/);await m.flushMutations(api,f.owner.accountId,f.owner.spaceId,()=>true);
  assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1],'The exact same durable mutation must retain the exact no-op body');assert.deepEqual(calls[1].content,before.content);assert.deepEqual((await m.getDraft(f.identity)).content,before.content);assert.equal((await m.listMutations(f.owner.accountId,f.owner.spaceId)).length,0);await f.foreignExact();
 });
 await group('Actual uploaded attachment ACK changes only proved mapping and produces valid collaborative graph',async()=>{
  const f=await seed('asset'),before=await inventory(f.owner),file=(await m.listLocalBlobs(f.owner.accountId,f.owner.spaceId))[0];await m.putLocalBlob({...file,status:'uploaded',serverId:'server-original'});
  await m.queueLocalDrafts(f.owner.accountId,f.owner.spaceId,(type,id)=>type==='whiteboard'&&id===f.identity.documentId);let sent;
  await m.flushMutations({bindAccount:()=>{},syncDocumentFilter:(type,id)=>type==='whiteboard'&&id===f.identity.documentId,putDocument:async(_space,_type,_id,base,content)=>{sent=structuredClone(content);return {version:base+1};}},f.owner.accountId,f.owner.spaceId,()=>true);
  assert.ok(sent,'The actual uploader must publish a body');m.verifyPaperCollaboration(sent);assert.equal(sent.assets[0].serverId,'server-original');assert.deepEqual(sent.blob_ids,['server-original']);assert.deepEqual(sent.pages,f.document.pages);assert.deepEqual(sent.objects,f.document.objects);assert.deepEqual((await m.getDraft(f.identity)).content,sent);assert.equal((await inventory(f.owner)).files[0].bytes,before.files[0].bytes);assert.equal((await m.listMutations(f.owner.accountId,f.owner.spaceId)).length,0);await f.foreignExact();
 });
 await group('Mounted initial opening fully rereads after real ACK graph/blob rewrite and preserves the new contribution',async()=>{
  const f=await seed('fresh-graph');let acknowledged;
  const seam=beforeTransfer(f,({store,row,tx})=>{const source=row.content,resolved={...source,assets:source.assets.map(asset=>({...asset,serverId:'server-original'})),blob_ids:['server-original']};acknowledged=m.amendPaperCollaboration(source,resolved);store.put({...row,content:acknowledged,baseVersion:row.baseVersion+1,syncState:'synced'});const files=tx.objectStore('scopedBlobs'),read=files.get(`${f.owner.accountId}|${f.owner.spaceId}|original-image`);read.onsuccess=()=>files.put({...read.result,status:'uploaded',serverId:'server-original'});});
  await mount(f);await ready();await seam.settled();assert.deepEqual(seam.errors,[]);assert.equal(seam.injections,1);assert.ok(seam.events.some(row=>row.kind==='transfer-abort'&&row.attempt===1));assert.ok(seam.events.some(row=>row.kind==='transfer-complete'&&row.attempt===2));assertFreshSources(f,seam);
  assert.deepEqual(paper.document,acknowledged);assert.deepEqual((await m.getDraft(f.identity)).content,acknowledged);m.verifyPaperCollaboration(paper.document);const receipt=await m.getSnapshot(m.paperLegacyReceiptKey(f.owner,f.noteId));assert.ok(receipt);assert.equal(receipt.value.paperRevision,acknowledged.revision);assert.deepEqual(receipt.value.sourceMetadata,await m.getDraft(f.metadataIdentity));assert.equal((await m.listLocalBlobs(f.owner.accountId,f.owner.spaceId))[0].serverId,'server-original');assert.deepEqual(new Uint8Array(await (await m.listLocalBlobs(f.owner.accountId,f.owner.spaceId))[0].blob.arrayBuffer()),bytes);assert.equal((await m.listMutations(f.owner.accountId,f.owner.spaceId)).length,0);await f.foreignExact();
 });
 for(const mode of ['alias','conflict','tombstone'])await group('Mounted fresh opening refuses '+mode+' after a real colliding transaction',async()=>{
  const f=await seed(mode),before=await inventory(f.owner);const seam=beforeTransfer(f,({store,row,tx})=>{if(mode==='alias')store.put({...row,identityAlias:'other-canonical-owner'});if(mode==='conflict')store.put({...row,syncState:'conflict',conflict:{preserved:true}});if(mode==='tombstone')tx.objectStore('snapshots').put({key:m.notebookDeletionKey(f.identity),...f.owner,value:{schema:1,kind:'paper-canonical-deletion',...f.owner,documentId:f.identity.documentId,noteId:f.noteId,version:9,deletedAt:2}});});
  await mount(f);if(mode==='conflict'){await waitFor(()=>paper?.blocked,'Conflict must block editing');await m.act(async()=>{await paper.whenSaved();});await seam.settled();assert.equal(paper.blocked,true);assert.deepEqual(paper.document,f.document,'An explicit conflict may show only its unchanged preserved branch');assert.equal(await m.getSnapshot(m.paperLegacyReceiptKey(f.owner,f.noteId)),undefined);}else await noPublication(f,seam);
  assert.equal(seam.attempts,1,'Fresh validation must refuse before another transfer');assert.equal(sha((await inventory(f.owner)).files),sha(before.files));assert.deepEqual((await inventory(f.owner)).outbox,before.outbox);await f.foreignExact();
 });
 await group('Three consecutive real collisions exhaust the global opening budget without stale publication',async()=>{
  const f=await seed('budget'),before=await inventory(f.owner);const seam=beforeTransfer(f,({store,row})=>store.put({...row,baseVersion:row.baseVersion+1,syncState:'synced'}),{races:3});await mount(f);await noPublication(f,seam);assert.equal(seam.attempts,3,'The entire opening owns three commits, never 3×3');assert.equal(seam.injections,3);assert.equal(seam.events.filter(row=>row.kind==='transfer-abort').length,3);assert.equal(seam.events.filter(row=>row.kind==='transfer-complete').length,0);assertFreshSources(f,seam,2);assertFreshSources(f,seam,3);assert.deepEqual((await m.getDraft(f.identity)).content,f.document);assert.deepEqual((await inventory(f.owner)).files,before.files);assert.deepEqual((await inventory(f.owner)).outbox,before.outbox);
 });
 for(const errorName of ['QuotaExceededError','UnknownError'])await group('Real terminal '+errorName+' after receipt write rolls back without retry, even with a new Markdown source',async()=>{
  const f=await seed(errorName),before=await inventory(f.owner);const seam=beforeTransfer(f,null,{races:0,failAfterReceipt:()=>{if(errorName==='QuotaExceededError'){m.flushSync(()=>root.render(m.createElement(m.HookRecipe,{...props,markdown:text+' New external source.',report:value=>{paper=value;reports.push({paper:value,document:value.document,current:value.getCurrent()});}})));}throw new DOMException('Synthetic terminal '+errorName,errorName);}});await mount(f);await noPublication(f,seam);assert.equal(seam.attempts,1);assert.equal(seam.successfulReceiptWrites,1,'A real successful write must precede the native rollback');assert.deepEqual(await inventory(f.owner),before,'Every draft/file/receipt/outbox must roll back exactly');
 });
 for(const mode of ['owner-ABA','API-ABA'])await group('Mounted '+mode+' permanently retires the old attempt before exposing or retrying it',async()=>{
  const f=await seed(mode),apiA={},apiB={},baseMedia=mode==='API-ABA'?{...f.owner,api:apiA}:f.owner;let changed=false,returnedReport;
  const seam=beforeTransfer(f,({store,row})=>store.put({...row,baseVersion:row.baseVersion+1,syncState:'queued'}),{onAbort:attempt=>{
   if(attempt!==1)return;changed=true;const temporary=mode==='API-ABA'?{...f.owner,api:apiB}:f.foreign;
   // Both real React transitions finish before the rejected old IDB await can
   // resume. Waiting for B.ready here would not test a suspended ABA attempt.
   m.flushSync(()=>root.render(m.createElement(m.HookRecipe,{noteId:f.noteId,markdown:text,media:temporary,report:value=>{paper=value;reports.push({paper:value,document:value.document,current:value.getCurrent()});}})));
   m.flushSync(()=>root.render(m.createElement(m.HookRecipe,{noteId:f.noteId,markdown:text,media:baseMedia,report:value=>{paper=value;const report={paper:value,document:value.document,current:value.getCurrent()};returnedReport??=report;reports.push(report);}})));
  }});
  await mount(f,baseMedia);await waitFor(()=>changed&&returnedReport,'The native abort must introduce both committed ABA renders');assert.equal(returnedReport.document,null,'Returning to A must not expose an old epoch document in render');assert.equal(returnedReport.current,null,'The new closure must not admit the old document');await ready();await seam.settled();assert.deepEqual(seam.errors,[]);assert.ok(seam.events.some(row=>row.kind==='transfer-abort'&&row.attempt===1));assert.equal(paper.document.noteId,f.noteId);assert.deepEqual((await m.getDraft(f.identity)).content,f.document);assert.equal((await m.listMutations(f.owner.accountId,f.owner.spaceId)).length,0);await f.foreignExact();
 });
 for(const mode of ['absent','identical','divergent'])await group('Noncollaborative seed preserves '+mode+' history without overwriting an original',async()=>{
  const f=await seed('seed-'+mode,{collaboration:false}),historyKey='paper-history|'+key(f.draft)+'|'+String(f.document.revision).padStart(12,'0');
  let previous;
  if(mode!=='absent'){previous={key:historyKey,...f.owner,value:mode==='identical'?f.document:{...f.document,legacy:{...f.document.legacy,markdown:'A distinct historical original'}}};await m.putSnapshot(previous);}
  await mount(f);await ready();const history=await m.getSnapshot(historyKey);assert.deepEqual(history,previous??{key:historyKey,...f.owner,value:f.document},'The existing historical original must never be rewritten');
  const recovered=(await m.listSnapshots(f.owner.accountId,f.owner.spaceId)).filter(row=>row.key.startsWith('paper-seed-recovery|'));assert.equal(recovered.length,mode==='divergent'?1:0);if(recovered.length)assert.deepEqual(recovered[0].value,f.document);m.verifyPaperCollaboration((await m.getDraft(f.identity)).content);await f.foreignExact();
 });
 await group('Divergent seed history remains intact through a real CAS collision and fresh retry',async()=>{
  const f=await seed('seed-cas',{collaboration:false}),historyKey='paper-history|'+key(f.draft)+'|'+String(f.document.revision).padStart(12,'0'),old={key:historyKey,...f.owner,value:{preserved:'first historical original'}};await m.putSnapshot(old);
  const next={...old,value:{preserved:'newer historical original'}},seam=beforeTransfer(f,({tx})=>tx.objectStore('snapshots').put(next));await mount(f);await ready();await seam.settled();assert.deepEqual(seam.errors,[]);assert.ok(seam.events.some(row=>row.kind==='transfer-abort'&&row.attempt===1),'The first seed must actually roll back');assert.ok(seam.events.some(row=>row.kind==='transfer-complete'&&row.attempt===2));assert.deepEqual(await m.getSnapshot(historyKey),next);const recovered=(await m.listSnapshots(f.owner.accountId,f.owner.spaceId)).filter(row=>row.key.startsWith('paper-seed-recovery|'));assert.equal(recovered.length,1,'Only the committed seed may create a recovery original');assert.deepEqual(recovered[0].value,f.document);await f.foreignExact();
 });
 await group('Quota after a real divergent seed recovery write rolls back draft and recovery together',async()=>{
  const f=await seed('seed-quota',{collaboration:false}),historyKey='paper-history|'+key(f.draft)+'|'+String(f.document.revision).padStart(12,'0'),old={key:historyKey,...f.owner,value:{preserved:'historical original'}};await m.putSnapshot(old);const before=await inventory(f.owner);
  const seam=beforeTransfer(f,null,{races:0,failAfterSnapshot:{matches:value=>value.key.startsWith('paper-seed-recovery|'),fail:()=>{throw new DOMException('Synthetic seed quota','QuotaExceededError');}}});await mount(f);await noPublication(f,seam);assert.equal(seam.attempts,1);assert.equal(seam.successfulReceiptWrites,1);assert.deepEqual(await inventory(f.owner),before,'The divergent historical row and plain canonical draft must survive the real terminal rollback exactly');
 });
 await runPaperOpeningAssetLostAckCase({group,m,seed,inventory});
 await runPaperPreparedMutationCases({group,m,seed,inventory,tracked,bounded,drainOperations,currentSeams:()=>currentSeams});
 await runInitialReconcileCases({group,m,seed,inventory,beforeTransfer,mount,ready,waitFor,render,tracked,bounded,paper:()=>paper});
 console.log(`Opening ACK hook groups: ${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
}catch(error){report.fatal=errorDetail(error);process.exitCode=1;}
finally{
 report.cleanupFinal=await cleanupSteps([
  {name:'drain-final-complete-originals',run:()=>drainOperations('Final complete original operations')},
  {name:'settle-final-mounted-writers',run:async()=>{if(m)for(const accountId of groupAccounts)await bounded(m.settleNotebookAccount(accountId),'Actual mounted writer settlement '+accountId);}},
  {name:'actual-final-hook-unmount',run:async()=>{if(root&&m){await bounded(m.act(async()=>root.unmount()),'Actual mounted hook unmount');root=null;}}},
  {name:'drain-final-native-terminals',run:()=>drainOperations('Final native terminals before globals')},
  {name:'resume-final-notebook-accounts',run:()=>m?.resumeAllNotebookAccounts()},
  {name:'restore-final-native-IDB-seam',run:()=>{restoreSeam();restoreSeam=()=>{};}},
  {name:'close-JSDOM-window',run:()=>{dom?.window.close();}},
  {name:'remove-private-SSR-output',run:()=>rm(out,{recursive:true,force:true})},
  {name:'restore-globals-and-environment',run:()=>{for(const [name,descriptor] of descriptors){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);}if(previousEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previousEnv;}}
 ]);
 report.pendingOperations=pendingOperations.size;report.pendingLabels=[...pendingOperations.values()].map(row=>row.label).slice(0,8);report.lateErrors=lateErrors;report.timedOutOperations=timedOutOperations;
 try{report.sourceHashesAfter=await sourceHashes();assert.deepEqual(report.sourceHashesAfter,report.sourceHashes,'Every tested source must remain frozen through cleanup');report.sourceHashesStable=true;}catch(error){report.sourceHashesStable=false;report.sourceHashError=errorDetail(error);}
 report.passed=passed;report.failed=failed;report.notRun=declaredNames.filter(name=>!report.groups.some(row=>row.name===name));
 report.allGroupsAttempted=report.groupsStarted===report.declaredGroups&&report.groups.length===report.declaredGroups&&report.notRun.length===0&&report.groups.every(row=>row.status==='PASS'||row.status==='FAIL');report.fullSuiteAttempted=report.allGroupsAttempted;
 report.fullSuite=report.allGroupsAttempted&&failed===0&&timedOutOperations.length===0&&report.sourceHashesStable===true&&!report.fatal&&report.cleanupFinal.status==='PASS'&&report.groups.every(row=>row.status==='PASS'&&row.cleanup.status==='PASS');
 report.finishedAt=new Date().toISOString();if(!report.fullSuite||failed||report.fatal||report.cleanupFinal.status!=='PASS')process.exitCode=1;
 await mkdir(dirname(reportPath),{recursive:true});await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
}
