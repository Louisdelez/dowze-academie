/** Real duplicate/activation/storage/CRDT with fake-indexeddb transactions.
 * Injected native transaction ordering/quota seams; no browser/OS/cloud claim. */
import {mountedCleanup,mountedAuditPath,requireBoundedMountedCheck} from './mounted-cleanup.mjs';
requireBoundedMountedCheck();
import {build} from 'vite';
import {IDBFactory,IDBKeyRange} from 'fake-indexeddb';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {mkdtemp,rm,readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {join,dirname} from 'node:path';
const descriptors=new Map(['indexedDB','IDBKeyRange','crypto','navigator','dispatchEvent','CustomEvent'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
const stamp='2026-10-15T12:00:00.000Z',bytes=new Uint8Array([11,29,43,77]),out=await mkdtemp(join(process.cwd(),'tests/.duplicate-activation-'));
const hash=value=>createHash('sha256').update(JSON.stringify(value)??'undefined').digest('hex'),key=row=>`${row.accountId}|${row.spaceId}|${row.type}|${row.documentId}`;
const pendingOperations=new Map(),operationRecords=new WeakMap(),lateErrors=[],timedOutOperations=[];let currentSeams=[];
function tracked(promise,label){
 if(operationRecords.has(promise))return promise;
 const record={label,timedOut:false};let complete;
 complete=Promise.resolve(promise).catch(error=>{if(record.timedOut)lateErrors.push({label,error:brief(error)});throw error;}).finally(()=>pendingOperations.delete(complete));
 operationRecords.set(complete,record);pendingOperations.set(complete,record);void complete.catch(()=>{});return complete;
}
const bounded=async(promise,label)=>{const complete=tracked(promise,label);let timer;try{return await Promise.race([complete,new Promise((_,reject)=>{timer=setTimeout(()=>{const record=operationRecords.get(complete);if(!record.timedOut)timedOutOperations.push({label});record.timedOut=true;reject(Error(label+': timeout'));},5000);})]);}finally{clearTimeout(timer);}};
async function drainOperations(label,timeoutMs=5000){
 const until=Date.now()+timeoutMs;
 while(pendingOperations.size){
  const remaining=until-Date.now();if(remaining<=0)throw Error(label+': still active '+JSON.stringify([...pendingOperations.values()].map(row=>row.label).slice(0,8)));
  let timer;try{const settled=await Promise.race([Promise.allSettled([...pendingOperations.keys()]).then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),remaining);})]);if(!settled)throw Error(label+': still active '+JSON.stringify([...pendingOperations.values()].map(row=>row.label).slice(0,8)));}finally{clearTimeout(timer);}
 }
}
let m,sequence=0,passed=0,failed=0,restore=()=>{},events=[],eventTerminals=[],activeLog=null;
const report={schema:1,kind:'notebook-duplicate-activation',startedAt:new Date().toISOString(),proofScope:'Actual duplicate/storage/CRDT; fake-indexeddb and injected transaction ordering/quota seams. No browser/native/cloud claim.',declaredGroups:22,groups:[],passed:0,failed:0,fatal:null,cleanupFinal:{status:'NOTRUN'},fullSuite:false};
const sourcePaths=['src/lib/duplicateNotebook.ts','src/hooks/usePaperDocument.ts','pwa/src/storage.ts','tests/notebook-duplicate-activation-entry.ts','tests/run-notebook-duplicate-activation.mjs','tests/mounted-cleanup.mjs'];
const sourceHashes=async()=>Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')])));
const brief=error=>({name:error?.name,operator:error?.operator,message:String(error?.message??error).split('\n')[0].slice(0,220),actualSha:error&&'actual' in error?hash(error.actual):undefined,expectedSha:error&&'expected' in error?hash(error.expected):undefined,at:String(error?.stack??'').split('\n').filter(row=>/^\s+at /.test(row)).slice(0,4)});
async function inventory(owner){return {drafts:await m.listDrafts(owner.accountId,owner.spaceId),snapshots:await m.listSnapshots(owner.accountId,owner.spaceId),queue:await m.listMutations(owner.accountId,owner.spaceId),files:await Promise.all((await m.listLocalBlobs(owner.accountId,owner.spaceId)).map(async({blob,...row})=>({...row,bytes:Buffer.from(await blob.arrayBuffer()).toString('hex')})))};}
async function fixture(label,{metadata=true}={}){
 const factory=new IDBFactory();Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:factory});events=[];eventTerminals=[];activeLog=null;
 const owner={accountId:'synthetic-activation-'+label+'-'+(++sequence),spaceId:'year'},foreign={accountId:owner.accountId+'-foreign',spaceId:owner.spaceId},sourceId='source',noteId='copy';
 const identity={...owner,type:'whiteboard',documentId:m.notebookDocumentId(noteId)},sourceIdentity={...identity,documentId:m.notebookDocumentId(sourceId)},libraryIdentity={...owner,type:'preferences',documentId:m.LIBRARY_DOCUMENT_ID},metadataIdentity={...owner,type:'notesMarkdown',documentId:noteId};
 let plain=m.migratePaper(sourceId,'Preserved original',null,stamp);plain=m.applyPaperCommand(plain,{type:'add-asset',asset:{id:'original-image',name:'Original.bin',mediaType:'application/octet-stream',size:bytes.length}},stamp);const document=m.amendPaperCollaboration(plain,plain);
 const source={...sourceIdentity,title:'Original',content:document,baseVersion:4,updatedAt:1,syncState:'synced'};await m.putDraft(source);await m.putLocalBlob({...owner,id:'original-image',documentId:sourceIdentity.documentId,blob:new Blob([bytes]),name:'Original.bin',createdAt:1,status:'uploaded',serverId:'remote-original'});
 let library=m.updateNotebookLibrary(m.emptyNotebookLibrary(),{folder:{id:'folder',parentId:null,title:'Original folder',color:'#4461dc',order:0}},stamp);library=m.updateNotebookLibrary(library,{note:{id:sourceId,patch:{folderId:'folder',favorite:true,cover:{color:'#fff4d8',pattern:'grid'}}}},stamp);library=m.amendNotebookLibrary(library,library,owner.accountId+'|'+owner.spaceId);
 await m.putDraft({...libraryIdentity,title:'Preserved library title',content:library,baseVersion:3,updatedAt:1,syncState:'synced'});
 const copied=await m.stageNotebookDuplicate(sourceId,noteId,'Preserved original',owner);if(metadata)await m.putDraft({...metadataIdentity,title:'Copied metadata',content:{id:noteId,markdown:'Preserved original'},baseVersion:0,updatedAt:1,syncState:'local',paperDependency:identity.documentId});
 const copy=await m.getDraft(identity);await m.putDraft({...copy,...foreign,staged:true});await m.putDraft({...await m.getDraft(libraryIdentity),...foreign});await m.putLocalBlob({...foreign,id:copied.assets[0].id,documentId:identity.documentId,blob:new Blob([new Uint8Array([99,88,77])]),name:'Foreign.bin',createdAt:2,status:'pending'});
 const baseline=await inventory(owner),foreignBefore=hash(await inventory(foreign));
 return {factory,owner,foreign,noteId,sourceId,identity,sourceIdentity,libraryIdentity,metadataIdentity,copy,copied,source:await m.getDraft(sourceIdentity),library,baseline,foreignExact:async()=>assert.equal(hash(await inventory(foreign)),foreignBefore,'All foreign drafts/receipts/media/outbox must remain exact')};
}
function nativeSeam(f,{beforeTransfer,races=1,quotaKey,onOpen,onRead,quotaPrimitive=false}={}){
 const nativeOpen=f.factory.open.bind(f.factory),log=[],errors=[],terminals=[];activeLog=log;let attempt=0,injections=0,seq=0,successfulWrites=0,writeTransactions=0;
 currentSeams.push({errors});
 const mark=value=>log.push({seq:++seq,...value});
 f.factory.open=(...args)=>{const request=nativeOpen(...args);request.addEventListener('success',()=>{
  onOpen?.();const db=request.result,nativeTransaction=db.transaction.bind(db);
  db.transaction=(...args)=>{
   const names=typeof args[0]==='string'?[args[0]]:Array.from(args[0]),transfer=args[1]==='readwrite'&&names.length===3&&['drafts','scopedBlobs','snapshots'].every(name=>names.includes(name));
   if(transfer&&beforeTransfer&&injections<races){
    const prior=nativeTransaction(['drafts','snapshots'],'readwrite'),n=++injections,store=prior.objectStore('drafts'),read=store.get(key(f.libraryIdentity));
    read.onsuccess=()=>{try{beforeTransfer({tx:prior,store,row:read.result,attempt:n});}catch(error){errors.push(error);prior.abort();}};
    terminals.push(tracked(new Promise(resolve=>{prior.addEventListener('complete',()=>{mark({kind:'prior-complete',attempt:n});resolve();},{once:true});prior.addEventListener('abort',()=>{errors.push(prior.error??Error('Prior fixture transaction aborted'));resolve();},{once:true});}),'Real preceding transaction '+n));
   }
   const tx=nativeTransaction(...args),n=transfer?++attempt:undefined;if(tx.mode==='readwrite')writeTransactions++;if(transfer)mark({kind:'transfer-created',attempt:n});
   terminals.push(tracked(new Promise(resolve=>{tx.addEventListener('complete',()=>{mark({kind:'complete',attempt:n,mode:tx.mode,stores:names});resolve();},{once:true});tx.addEventListener('abort',()=>{mark({kind:'abort',attempt:n,mode:tx.mode,stores:names});resolve();},{once:true});}),'Real '+tx.mode+' transaction '+names.join(',')));
   const nativeObjectStore=tx.objectStore.bind(tx),seen=new WeakSet();tx.objectStore=name=>{
    const store=nativeObjectStore(name);if(seen.has(store))return store;seen.add(store);const get=store.get.bind(store);store.get=value=>{const read=get(value);read.addEventListener('success',()=>{mark({kind:'read',mode:tx.mode,store:name,key:String(value)});onRead?.({tx,store:name,key:String(value),row:read.result});},{once:true});return read;};
    if((transfer&&quotaKey||quotaPrimitive&&tx.mode==='readwrite')&&name==='drafts'){
     const put=store.put.bind(store);store.put=(value,...args)=>{const req=put(value,...args);if(quotaPrimitive||key(value)===quotaKey)req.addEventListener('success',()=>{successfulWrites++;throw new DOMException('Synthetic quota after a real native put','QuotaExceededError');},{once:true});return req;};
    }return store;
   };return tx;
  };
 },{once:true});return request;};
 restore=()=>{f.factory.open=nativeOpen;activeLog=null;};
 return {log,errors,get attempts(){return attempt;},get injections(){return injections;},get successfulWrites(){return successfulWrites;},get writeTransactions(){return writeTransactions;},settled:()=>bounded(Promise.all(terminals),'Every real transaction must reach terminal')};
}
async function activate(f,current=()=>true,options){return bounded(m.activateNotebookDuplicate(f.noteId,f.owner,current,options),'Actual captured duplicate activation');}
async function assertHistory(f,expected){
 const after=await m.listSnapshots(f.owner.accountId,f.owner.spaceId),before=new Map(f.baseline.snapshots.map(row=>[row.key,row]));
 for(const previous of before.values())assert.deepEqual(after.find(row=>row.key===previous.key),previous,'No existing recovery/history source may be replaced');
 const added=after.filter(row=>!before.has(row.key));
 if(!expected){assert.deepEqual(added,[]);return;}
 const standard='paper-history|'+f.owner.accountId+'|'+f.owner.spaceId+'|preferences|'+m.LIBRARY_DOCUMENT_ID+'|'+String(expected.revision).padStart(12,'0'),old=before.get(standard),identical=old&&old.accountId===f.owner.accountId&&old.spaceId===f.owner.spaceId&&JSON.stringify(old.value)===JSON.stringify(expected);
 assert.equal(added.length,identical?0:1,'Only the exact previous classification may join history');
 if(added.length){assert.equal(old?added[0].key.startsWith(standard+'-copy-'):added[0].key===standard,true,'Both history originals stay visible under the real library.history prefix');assert.deepEqual(added[0].value,expected);assert.equal(added[0].accountId,f.owner.accountId);assert.equal(added[0].spaceId,f.owner.spaceId);}
}
async function assertPreserved(f,{libraryMayChange=false}={}){const after=await inventory(f.owner);assert.deepEqual(after.files,f.baseline.files,'No media bytes/properties may change');await assertHistory(f,libraryMayChange?f.library:null);assert.deepEqual(after.queue,f.baseline.queue,'No uploader mutation may be fabricated');assert.deepEqual(await m.getDraft(f.sourceIdentity),f.source,'The original source remains exact');if(!libraryMayChange)assert.deepEqual(await m.getDraft(f.libraryIdentity),f.baseline.drafts.find(row=>row.documentId===m.LIBRARY_DOCUMENT_ID));await f.foreignExact();}
async function group(name,work){
 const row={name,status:'RUNNING',cleanup:'NOTRUN'},lateStart=lateErrors.length,timeoutStart=timedOutOperations.length;currentSeams=[];report.groups.push(row);
 try{await tracked(Promise.resolve().then(work),'Complete group '+name);row.status='PASS';passed++;console.log(name+': PASS');}catch(error){row.status='FAIL';row.error=brief(error);failed++;console.error(name+': FAIL');console.error(JSON.stringify(row.error));}
 finally{
  try{await drainOperations('Group settlement before restore/next');const seamErrors=currentSeams.flatMap(seam=>seam.errors);if(seamErrors.length)throw new AggregateError(seamErrors,'Native fixture transaction failed');row.timeouts=timedOutOperations.slice(timeoutStart);if(row.timeouts.length)throw Error('A timeout cannot satisfy an expected business rejection: '+JSON.stringify(row.timeouts));row.lateErrors=lateErrors.slice(lateStart);restore();restore=()=>{};row.cleanup='PASS';row.pendingOperations=0;}
  catch(error){row.cleanup='FAIL';row.cleanupError=brief(error);row.pendingOperations=pendingOperations.size;row.pendingLabels=[...pendingOperations.values()].map(value=>value.label).slice(0,8);row.lateErrors=lateErrors.slice(lateStart);row.timeouts=timedOutOperations.slice(timeoutStart);if(row.status==='PASS'){passed--;failed++;row.status='FAIL';}throw error;}
 }
}
try{
 report.sourceHashes=await sourceHashes();
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:false}});Object.defineProperty(globalThis,'IDBKeyRange',{configurable:true,value:IDBKeyRange});if(!globalThis.crypto?.subtle)Object.defineProperty(globalThis,'crypto',{configurable:true,value:webcrypto});
 const target=new EventTarget(),Custom=globalThis.CustomEvent??class extends Event{constructor(type,options){super(type);this.detail=options?.detail;}};Object.defineProperty(globalThis,'CustomEvent',{configurable:true,value:Custom});Object.defineProperty(globalThis,'dispatchEvent',{configurable:true,value:target.dispatchEvent.bind(target)});target.addEventListener('dowze:notebook-library-changed',event=>{events.push(structuredClone(event.detail));eventTerminals.push(activeLog?.some(row=>row.kind==='complete'&&row.attempt!==undefined)??false);});
 await build({configFile:false,ssr:{noExternal:['yjs','lib0','fflate']},build:{ssr:'tests/notebook-duplicate-activation-entry.ts',outDir:out,copyPublicDir:false,minify:false,sourcemap:false,reportCompressedSize:false,rollupOptions:{output:{entryFileNames:'activation.mjs'}}},logLevel:'error'});m=await import(pathToFileURL(join(out,'activation.mjs')));
 await group('Classification and activation share one real terminal commit; replay cannot reset later classification',async()=>{
  const f=await fixture('atomic'),seam=nativeSeam(f);await activate(f);await seam.settled();assert.equal(seam.attempts,1);assert.equal(seam.log.filter(row=>row.kind==='complete'&&row.attempt===1).length,1);assert.equal((await m.getDraft(f.identity)).staged,undefined);assert.deepEqual((await m.getDraft(f.identity)).content,f.copied);const classified=await m.getDraft(f.libraryIdentity);assert.deepEqual(classified.content.notes[f.noteId],f.library.notes[f.sourceId]);assert.deepEqual(events,[f.owner]);assert.deepEqual(eventTerminals,[true],'The public event must follow its real terminal commit');assert.equal(classified.title,'Preserved library title');await assertPreserved(f,{libraryMayChange:true});
  const edited=m.amendNotebookLibrary(classified.content,m.updateNotebookLibrary(classified.content,{note:{id:f.noteId,patch:{favorite:false,cover:{color:'#123456',pattern:'dots'}}}}),f.owner.accountId+'|'+f.owner.spaceId);await m.putDraft({...classified,content:edited});const before=await inventory(f.owner);await activate(f);assert.deepEqual(await inventory(f.owner),before,'Already activated must be absorbing');assert.deepEqual(events,[f.owner],'Replay may not announce another activation');
 });
 await group('External durable metadata remains compatible when no notesMarkdown IDB row exists',async()=>{const f=await fixture('external',{metadata:false});await activate(f);assert.equal((await m.getDraft(f.identity)).staged,undefined);assert.equal(await m.getDraft(f.metadataIdentity),undefined);await assertPreserved(f,{libraryMayChange:true});});
 await group('Explicit IndexedDB metadata authority refuses absence without partial classification',async()=>{const f=await fixture('metadata-required',{metadata:false}),before=await inventory(f.owner);await assert.rejects(activate(f,()=>true,{metadataAuthority:'indexeddb'}));assert.deepEqual(await inventory(f.owner),before);assert.deepEqual(events,[]);await f.foreignExact();});
 for(const invalid of ['copy-alias','copy-conflict','library-conflict','tombstone','target-trash'])await group('Activation refuses '+invalid+' and leaves all admitted sources exact',async()=>{
  const f=await fixture(invalid);if(invalid==='copy-alias')await m.putDraft({...f.copy,identityAlias:'another-copy'});if(invalid==='copy-conflict')await m.putDraft({...f.copy,syncState:'conflict',conflict:{preserved:true}});if(invalid==='library-conflict')await m.putDraft({...await m.getDraft(f.libraryIdentity),syncState:'conflict'});if(invalid==='tombstone')await m.putSnapshot({key:m.notebookDeletionKey(f.identity),...f.owner,value:{schema:1,kind:'paper-canonical-deletion',...f.owner,documentId:f.identity.documentId,noteId:f.noteId,version:2,deletedAt:1}});if(invalid==='target-trash'){const row=await m.getDraft(f.libraryIdentity);await m.putDraft({...row,content:m.amendNotebookLibrary(row.content,m.updateNotebookLibrary(row.content,{note:{id:f.noteId,patch:{deletedAt:stamp}}}),f.owner.accountId+'|'+f.owner.spaceId)});}
  const before=await inventory(f.owner);await assert.rejects(activate(f));assert.deepEqual(await inventory(f.owner),before);assert.deepEqual(events,[]);await f.foreignExact();
 });
 await group('Native library CAS collision rereads classification and preserves the independent original edit',async()=>{
  const f=await fixture('cas');let latestLibrary,latestSource;const seam=nativeSeam(f,{beforeTransfer:({store,row})=>{latestLibrary=m.amendNotebookLibrary(row.content,m.updateNotebookLibrary(row.content,{note:{id:f.sourceId,patch:{favorite:false,cover:{color:'#123456',pattern:'dots'}}}}),f.owner.accountId+'|'+f.owner.spaceId);store.put({...row,content:latestLibrary});const read=store.get(key(f.sourceIdentity));read.onsuccess=()=>{const previous=read.result;latestSource={...previous,content:m.amendPaperCollaboration(previous.content,m.applyPaperCommand(previous.content,{type:'patch-object',id:previous.content.objects[0].id,patch:{markdown:'Original later edited independently'}}))};store.put(latestSource);};}});
  await activate(f);await seam.settled();assert.deepEqual(seam.errors,[]);assert.equal(seam.attempts,2);const abort=seam.log.find(row=>row.kind==='abort'&&row.attempt===1),next=seam.log.find(row=>row.kind==='transfer-created'&&row.attempt===2);assert.ok(abort&&next&&abort.seq<next.seq);for(const id of [f.identity,f.libraryIdentity,f.metadataIdentity])assert.ok(seam.log.some(row=>row.kind==='read'&&row.key===key(id)&&row.seq>abort.seq&&row.seq<next.seq),'Every scoped source must be freshly read');assert.deepEqual((await m.getDraft(f.libraryIdentity)).content.notes[f.noteId],latestLibrary.notes[f.sourceId]);assert.deepEqual((await m.getDraft(f.identity)).content,f.copied);assert.deepEqual(await m.getDraft(f.sourceIdentity),latestSource);await assertHistory(f,latestLibrary);assert.deepEqual((await inventory(f.owner)).files,f.baseline.files);assert.deepEqual((await inventory(f.owner)).queue,f.baseline.queue);await f.foreignExact();
 });
 await group('Three actual CAS collisions exhaust the budget without advertising or partially classifying copy',async()=>{
  const f=await fixture('budget'),seam=nativeSeam(f,{races:3,beforeTransfer:({store,row})=>store.put({...row,baseVersion:row.baseVersion+1})});await assert.rejects(activate(f));await seam.settled();assert.equal(seam.attempts,3);assert.equal(seam.log.filter(row=>row.kind==='abort'&&row.attempt).length,3);assert.equal((await m.getDraft(f.identity)).staged,true);assert.equal((await m.getDraft(f.libraryIdentity)).content.notes[f.noteId],undefined);assert.deepEqual(events,[]);assert.deepEqual((await inventory(f.owner)).files,f.baseline.files);assert.deepEqual((await inventory(f.owner)).queue,f.baseline.queue);await f.foreignExact();
 });
 await group('Quota after real library put rolls back classification and staged activation together without retry',async()=>{
  const f=await fixture('quota'),seam=nativeSeam(f,{quotaKey:key(f.libraryIdentity)});await assert.rejects(activate(f));await seam.settled();assert.equal(seam.attempts,1);assert.equal(seam.successfulWrites,1);assert.deepEqual(await inventory(f.owner),f.baseline);assert.deepEqual(events,[]);await f.foreignExact();
 });
 await group('Owner ABA during the real preceding transaction refuses old activation and event',async()=>{
  const f=await fixture('aba');let epoch=1;const seam=nativeSeam(f,{beforeTransfer:({store,row})=>{store.put({...row,baseVersion:row.baseVersion+1});epoch=2;epoch=3;}});await assert.rejects(activate(f,()=>epoch===1));await seam.settled();assert.equal(seam.attempts,1);assert.equal((await m.getDraft(f.identity)).staged,true);assert.equal((await m.getDraft(f.libraryIdentity)).content.notes[f.noteId],undefined);assert.deepEqual(events,[]);assert.deepEqual((await inventory(f.owner)).files,f.baseline.files);assert.deepEqual((await inventory(f.owner)).queue,f.baseline.queue);await f.foreignExact();
 });
 await group('Default accepted operation captures IDs even if its caller media object later mutates',async()=>{
  const f=await fixture('captured'),media={...f.owner},seam=nativeSeam(f,{onOpen:()=>{media.accountId=f.foreign.accountId;}});await bounded(m.activateNotebookDuplicate(f.noteId,media),'Captured default activation');await seam.settled();assert.equal((await m.getDraft(f.identity)).staged,undefined);assert.deepEqual(events,[f.owner]);await f.foreignExact();
 });
 await group('Primitive guards source before openDB and after the awaited DB open',async()=>{
  const f=await fixture('primitive-open');let epoch=1,opens=0;const seam=nativeSeam(f,{onOpen:()=>{opens++;epoch=2;}});await assert.rejects(bounded(m.activateStagedDraft(f.identity,()=>false),'Primitive preopen refusal'));assert.equal(opens,0,'A refused admission must not even open DB');await assert.rejects(bounded(m.activateStagedDraft(f.identity,()=>epoch===1),'Primitive postopen refusal'));await seam.settled();assert.equal(seam.writeTransactions,0);assert.deepEqual(await inventory(f.owner),f.baseline);await f.foreignExact();
 });
 await group('Primitive native transaction refuses retired source and waits for terminal rollback',async()=>{
  const f=await fixture('primitive-tx');let epoch=1;const seam=nativeSeam(f,{onRead:({tx,store,key:readKey})=>{if(tx.mode==='readwrite'&&store==='drafts'&&readKey===key(f.identity))epoch=2;}});await assert.rejects(bounded(m.activateStagedDraft(f.identity,()=>epoch===1),'Primitive native owner refusal'));assert.ok(seam.log.some(row=>row.kind==='abort'&&row.mode==='readwrite'),'Promise rejection follows a real native abort');assert.deepEqual(await inventory(f.owner),f.baseline);await f.foreignExact();
 });
 await group('Primitive quota after real activation put preserves staged draft and originals exactly',async()=>{
  const f=await fixture('primitive-quota'),seam=nativeSeam(f,{quotaPrimitive:true});await assert.rejects(bounded(m.activateStagedDraft(f.identity,()=>true),'Primitive native quota'));assert.equal(seam.successfulWrites,1);assert.ok(seam.log.some(row=>row.kind==='abort'&&row.mode==='readwrite'));assert.deepEqual(await inventory(f.owner),f.baseline);await f.foreignExact();
 });
 for(const mode of ['identical','divergent'])await group('Classification history '+mode+' original is retained atomically without overwrite',async()=>{
  const f=await fixture('history-'+mode),historyKey='paper-history|'+f.owner.accountId+'|'+f.owner.spaceId+'|preferences|'+m.LIBRARY_DOCUMENT_ID+'|'+String(f.library.revision).padStart(12,'0');
  const previous={key:historyKey,...f.owner,value:mode==='identical'?f.library:m.amendNotebookLibrary(f.library,{...f.library,notes:{...f.library.notes,[f.sourceId]:{...f.library.notes[f.sourceId],favorite:false}}},f.owner.accountId+'|'+f.owner.spaceId)};await m.putSnapshot(previous);f.baseline=await inventory(f.owner);await activate(f);assert.deepEqual(await m.getSnapshot(historyKey),previous);await assertPreserved(f,{libraryMayChange:true});
 });
 for(const changed of ['body','receipt'])await group('Legacy staged incarnation '+changed+' change after real CAS is preserved and never activated by retry',async()=>{
  const f=await fixture('legacy-'+changed),{collaboration:_collaboration,...legacy}=f.copy.content;await m.putDraft({...f.copy,content:legacy});f.copy=await m.getDraft(f.identity);f.baseline=await inventory(f.owner);let replacement;
  const seam=nativeSeam(f,{beforeTransfer:({tx,store,row})=>{store.put({...row,baseVersion:row.baseVersion+1});if(changed==='body'){const read=store.get(key(f.identity));read.onsuccess=()=>{replacement={...read.result,content:m.applyPaperCommand(read.result.content,{type:'patch-object',id:read.result.content.objects[0].id,patch:{markdown:'Another retained legacy body'}})};store.put(replacement);};}else{const snapshots=tx.objectStore('snapshots'),migrationKey='paper-migration|'+key(f.copy),read=snapshots.get(migrationKey);read.onsuccess=()=>{replacement={...read.result,value:{...read.result.value,extraRetainedOriginal:'Another incarnation receipt'}};snapshots.put(replacement);};}}});
  await assert.rejects(activate(f));await seam.settled();assert.deepEqual(seam.errors,[]);assert.equal(seam.attempts,1,'A different legacy body/receipt cannot receive a fresh activation plan');assert.equal((await m.getDraft(f.identity)).staged,true);if(changed==='body')assert.deepEqual(await m.getDraft(f.identity),replacement);else assert.deepEqual(await m.getSnapshot('paper-migration|'+key(f.copy)),replacement);assert.equal((await m.getDraft(f.libraryIdentity)).content.notes[f.noteId],undefined);assert.deepEqual(events,[]);assert.deepEqual((await inventory(f.owner)).files,f.baseline.files);assert.deepEqual((await inventory(f.owner)).queue,f.baseline.queue);await f.foreignExact();
 });
 await group('Unchanged legacy incarnation may retry a classification-only native collision',async()=>{
  const f=await fixture('legacy-classification'),{collaboration:_collaboration,...legacy}=f.copy.content;await m.putDraft({...f.copy,content:legacy});f.copy=await m.getDraft(f.identity);f.baseline=await inventory(f.owner);const seam=nativeSeam(f,{beforeTransfer:({store,row})=>store.put({...row,baseVersion:row.baseVersion+1})});await activate(f);await seam.settled();assert.equal(seam.attempts,2);assert.deepEqual((await m.getDraft(f.identity)).content,legacy);assert.equal((await m.getDraft(f.identity)).staged,undefined);await assertPreserved(f,{libraryMayChange:true});
 });
 await group('A newer autonomous copy edit with the same real lineage survives activation retry',async()=>{
  const f=await fixture('autonomous-edit');let edited;const seam=nativeSeam(f,{beforeTransfer:({store,row})=>{store.put({...row,baseVersion:row.baseVersion+1});const read=store.get(key(f.identity));read.onsuccess=()=>{const original=read.result;edited=m.amendPaperCollaboration(original.content,m.applyPaperCommand(original.content,{type:'patch-object',id:original.content.objects[0].id,patch:{markdown:'Accepted newer copy edit'}}));store.put({...original,content:edited});};}});await activate(f);await seam.settled();assert.equal(seam.attempts,2);assert.equal(edited.collaboration.lineage,f.copy.content.collaboration.lineage);assert.deepEqual((await m.getDraft(f.identity)).content,edited);assert.equal((await m.getDraft(f.identity)).staged,undefined);m.verifyPaperCollaboration(edited);await assertPreserved(f,{libraryMayChange:true});
 });
 console.log(`Duplicate activation groups: ${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
}catch(error){report.fatal=brief(error);process.exitCode=1;}
finally{
 try{await drainOperations('Final settlement before restoring globals');await mountedCleanup([['restore-native-seam',()=>restore()],['remove-private-SSR-output',()=>rm(out,{recursive:true,force:true})],['restore-exact-globals',()=>{for(const [name,descriptor] of descriptors){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);}}]]);report.cleanupFinal={status:'PASS',pendingOperations:0,lateErrors:lateErrors.slice(),steps:['drain-original-work-and-real-terminals','restore-native-seam','remove-private-SSR-output','restore-exact-globals']};}catch(error){report.cleanupFinal={status:'FAIL',error:brief(error),pendingOperations:pendingOperations.size,pendingLabels:[...pendingOperations.values()].map(value=>value.label).slice(0,8),lateErrors:lateErrors.slice()};process.exitCode=1;}
 try{report.finalSourceHashes=await sourceHashes();assert.deepEqual(report.finalSourceHashes,report.sourceHashes,'Sources must remain frozen through final cleanup');report.finalFreeze='PASS';}catch(error){report.finalFreeze='FAIL';report.freezeError=brief(error);process.exitCode=1;}
 report.passed=passed;report.failed=failed;report.groupsStarted=report.groups.length;report.notRun=report.declaredGroups-report.groupsStarted;report.allGroupsAttempted=report.groupsStarted===report.declaredGroups;report.timedOutOperations=timedOutOperations.slice();report.fullSuite=report.allGroupsAttempted&&passed===report.declaredGroups&&failed===0&&!report.fatal&&timedOutOperations.length===0&&report.cleanupFinal.status==='PASS'&&report.finalFreeze==='PASS'&&report.groups.every(row=>row.status==='PASS'&&row.cleanup==='PASS');report.finishedAt=new Date().toISOString();if(!report.fullSuite)process.exitCode=1;
 const path=mountedAuditPath('t-x02-duplicate-activation-tests-20261015.json');await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(report,null,2)+'\n');
}
