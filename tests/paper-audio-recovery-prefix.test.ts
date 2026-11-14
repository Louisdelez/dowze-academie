/** Actual paperAudio/storage over fakeIndexedDB, not Chromium or a microphone.
 * Build separately with build-paper-audio-recovery-prefix.mjs; no auto-build. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {IDBFactory,IDBKeyRange as FakeKeyRange} from 'fake-indexeddb';
import {recoverableRecordings} from '../src/lib/paperAudio';
import {putSnapshot,type Snapshot,type AudioRecordingJournal} from '../pwa/src/storage';
import {migratePaper} from '../src/lib/notebookDocument';
import {notebookDocumentId} from '../src/lib/notebookIdentity';
import {requireBoundedMountedCheck} from './mounted-cleanup.mjs';
requireBoundedMountedCheck();

const sha=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const manifestPath='tests/.paper-audio-recovery-prefix-build/build-manifest.json';
let manifest:{sourceHashes:Record<string,string>;bundle:{sha256:string}},fatal=false;
async function sourceProof(){return Object.fromEntries(await Promise.all(Object.keys(manifest.sourceHashes).map(async path=>[path,sha(await readFile(path))])));}
before(async()=>{manifest=JSON.parse(await readFile(manifestPath,'utf8'));assert.deepEqual(await sourceProof(),manifest.sourceHashes);assert.equal(sha(await readFile(new URL(import.meta.url))),manifest.bundle.sha256);});
after(async()=>{assert.equal(fatal,false,'No later suite acceptance after incomplete cleanup');assert.deepEqual(await sourceProof(),manifest.sourceHashes);});
const exact=(actual:unknown,expected:unknown,label:string)=>{if(!isDeepStrictEqual(actual,expected))assert.fail(label+'; actualSHA256='+sha(JSON.stringify(actual))+' expectedSHA256='+sha(JSON.stringify(expected)));};
const stores=['drafts','snapshots','mutations','scopedBlobs'];
const scope={accountId:'audio-owner-é📝',spaceId:'année-2026'},other={accountId:'audio-owner-B',spaceId:'année-B'},noteId='note-e\u0301-🧪';
const prefix='audio-recording|'+scope.accountId+'|'+scope.spaceId+'|'+noteId+'|';
function journal(id:string,patch:Partial<AudioRecordingJournal>={}):AudioRecordingJournal{return {id,noteId,mimeType:'audio/webm;codecs=opus',name:'Original '+id,startedAt:12,chunkIds:['raw-'+id],size:123,duration:4,status:'recoverable',...patch};}
const row=(key:string,value:unknown,owner=scope):Snapshot=>({...owner,key,value});

function fixture(){
 if(fatal)throw Error('FATAL_STOP: previous accepted originals are not terminal');
 const factory=new IDBFactory(),prior=new Map(['indexedDB','IDBKeyRange'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 Object.defineProperty(globalThis,'indexedDB',{value:factory,configurable:true,writable:true});
 Object.defineProperty(globalThis,'IDBKeyRange',{value:FakeKeyRange,configurable:true,writable:true});
 const pending=new Set<Promise<unknown>>(),opens=new Set<IDBOpenDBRequest>(),connections=new Set<IDBDatabase>(),txs=new Set<IDBTransaction>(),timeouts:string[]=[];
 let body:Promise<unknown>|undefined;
 const ledger={active:false,getAll:0,valueKeys:[] as IDBValidKey[],keys:[] as IDBValidKey[],ranges:[] as IDBKeyRange[],complete:0,abort:0,writes:0,abortFirst:false,abortTriggered:false};
 const follow=<T>(original:Promise<T>)=>{pending.add(original);void original.then(()=>pending.delete(original),()=>pending.delete(original));return original;};
 async function wait<T>(original:Promise<T>,label:string,budget=6500){follow(original);let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([original,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{timeouts.push(label);reject(Error('Timeout keeps accepted original: '+label));},budget);})]);}finally{clearTimeout(timer);}}
 const nativeOpen=factory.open.bind(factory);
 factory.open=((...args:Parameters<IDBFactory['open']>)=>{
  const request=nativeOpen(...args);opens.add(request);follow(new Promise<void>(resolve=>{request.addEventListener('success',()=>{opens.delete(request);resolve();},{once:true});request.addEventListener('error',()=>{opens.delete(request);resolve();},{once:true});}));
  request.addEventListener('success',()=>{
   const db=request.result,close=db.close.bind(db),transaction=db.transaction.bind(db);connections.add(db);db.close=()=>{close();connections.delete(db);};
   db.transaction=((...args:Parameters<IDBDatabase['transaction']>)=>{
    const tx=transaction(...args),observed=ledger.active&&tx.objectStoreNames.contains('snapshots');txs.add(tx);
    follow(new Promise<void>(resolve=>{tx.addEventListener('complete',()=>{txs.delete(tx);if(observed)ledger.complete++;resolve();},{once:true});tx.addEventListener('abort',()=>{txs.delete(tx);if(observed)ledger.abort++;resolve();},{once:true});}));
    if(observed){
     const objectStore=tx.objectStore.bind(tx),wrapped=new WeakSet<IDBObjectStore>();
     tx.objectStore=(name:string)=>{
      const store=objectStore(name);if(name!=='snapshots'||wrapped.has(store))return store;wrapped.add(store);
      for(const method of ['put','add','delete','clear'] as const){const native=store[method].bind(store);store[method]=((...parameters:unknown[])=>{ledger.writes++;return Reflect.apply(native,store,parameters);}) as never;}
      const all=store.getAll.bind(store);store.getAll=((...parameters:Parameters<IDBObjectStore['getAll']>)=>{ledger.getAll++;const read=all(...parameters);read.addEventListener('success',()=>{for(const item of read.result as Snapshot[])ledger.valueKeys.push(item.key);},{once:true});return read;}) as IDBObjectStore['getAll'];
      const cursor=store.openCursor.bind(store),seen=new WeakSet<object>();
      store.openCursor=((...parameters:Parameters<IDBObjectStore['openCursor']>)=>{
       ledger.ranges.push(parameters[0] as IDBKeyRange);const read=cursor(...parameters);
       read.addEventListener('success',()=>{const value=read.result;if(!value)return;ledger.keys.push(value.key);
        if(!seen.has(value)){seen.add(value);const descriptor=Object.getOwnPropertyDescriptor(value,'value');assert.ok(descriptor&&'value' in descriptor);let real=descriptor.value;Object.defineProperty(value,'value',{configurable:true,get(){ledger.valueKeys.push(value.key);return real;},set(next){real=next;}});}
        if(ledger.abortFirst&&!ledger.abortTriggered){ledger.abortTriggered=true;queueMicrotask(()=>tx.abort());}
       });return read;
      }) as IDBObjectStore['openCursor'];
      return store;
     };
    }
    return tx;
   }) as IDBDatabase['transaction'];
  },{once:true});return request;
 }) as IDBFactory['open'];
 async function open(){return wait(new Promise<IDBDatabase>((resolve,reject)=>{const request=factory.open('dowze-academie-pwa',3);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);}), 'native inventory open');}
 async function inventory(){const db=await open();try{const rows:Record<string,unknown[]>={},tx=db.transaction(stores,'readonly');for(const name of stores){const request=tx.objectStore(name).getAll();request.onsuccess=()=>{rows[name]=request.result;};}await wait(new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);}), 'whole native inventory terminal');rows.scopedBlobs=await Promise.all((rows.scopedBlobs as {blob:Blob}[]).map(async({blob,...fields})=>({...fields,blobType:blob.type,blobSize:blob.size,blobSHA256:sha(new Uint8Array(await blob.arrayBuffer()))})));return rows;}finally{db.close();}}
 async function seed(){
  const expected=[journal('é',{status:'recording',pcm:{schema:1,sampleRate:8000,channels:1,frames:16000},parts:[{assetId:'sealed-original',chunkIds:['raw-é'],frames:16000,offset:0,duration:2}],spans:[{start:12,end:14,offset:0}],writeRevision:17,objectMarks:{'ink-original':2}}),journal('A'),journal('📝')];
  const valid=expected.map(value=>row(prefix+value.id,value)),invalid=[row(prefix+'null',null),row(prefix+'primitive',13),row(prefix+'empty',journal('empty',{chunkIds:[]})),row(prefix+'completed',journal('completed',{status:'completed'})),row(prefix+'bad-id',{...journal('bad-id'),id:7}),row(prefix+'bad-chunks',{...journal('bad-chunks'),chunkIds:'raw'}),row(prefix+'bad-note',journal('bad-note',{noteId:noteId+'-other'})),row(prefix+'foreign-account',journal('foreign-account'),{...scope,accountId:other.accountId}),row(prefix+'foreign-space',journal('foreign-space'),{...scope,spaceId:other.spaceId})];
  const outside=prefix.slice(0,-1)+'}first-outside';
  const rows=[...valid,...invalid,row('000-original-history',{payload:'Private retained source '.repeat(32768)}),row(outside,{payload:'Outside note namespace '.repeat(32768)})];
  for(let index=0;index<12;index++)rows.push(row('paper-history|'+scope.accountId+'|'+scope.spaceId+'|whiteboard|'+notebookDocumentId(noteId)+'|'+String(index).padStart(12,'0'),{revision:index,payload:'Immutable canonical history '.repeat(16384)}));
  rows.push(row('audio-recording|'+scope.accountId+'|'+scope.spaceId+'|'+noteId+'-neighbour|x',journal('neighbour',{noteId:noteId+'-neighbour'})),row('audio-recording|'+other.accountId+'|'+other.spaceId+'|'+noteId+'|other',journal('other'),other));
  for(const value of [...rows].reverse())await wait(putSnapshot(value),'real snapshot seed');
  const db=await open();try{const tx=db.transaction(['drafts','mutations','scopedBlobs'],'readwrite'),doc=migratePaper(noteId,'# Exact note\n\nOriginal text and ink remain independent.',null,'2026-10-16T00:00:00.000Z');
   tx.objectStore('drafts').put({...scope,key:[scope.accountId,scope.spaceId,'whiteboard',notebookDocumentId(noteId)].join('|'),documentId:notebookDocumentId(noteId),type:'whiteboard',title:'Original note',content:doc,baseVersion:3,updatedAt:12,syncState:'local'});
   tx.objectStore('drafts').put({...other,key:[other.accountId,other.spaceId,'whiteboard',notebookDocumentId('foreign-note')].join('|'),documentId:notebookDocumentId('foreign-note'),type:'whiteboard',title:'Foreign note',content:migratePaper('foreign-note','Foreign source.',null,'2026-10-16T00:00:00.000Z'),baseVersion:7,updatedAt:15,syncState:'synced'});
   tx.objectStore('mutations').put({...scope,id:'pending-original',documentId:notebookDocumentId(noteId),type:'whiteboard',status:'pending',createdAt:5,content:{exact:'Original outbox stays pending'}});
   tx.objectStore('scopedBlobs').put({...scope,key:scope.accountId+'|'+scope.spaceId+'|raw-A',id:'raw-A',documentId:notebookDocumentId(noteId),blob:new Blob([new Uint8Array(65536).fill(37)],{type:'audio/webm'}),name:'Original.webm',createdAt:12,status:'pending',removedFromNote:true,revision:8,sha256:'stored-proof-not-recomputed'});
   await wait(new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);}), 'seed draft/media native terminal');
  }finally{db.close();}
  return {expected:expected.sort((a,b)=>factory.cmp(prefix+a.id,prefix+b.id)),insideKeys:[...valid,...invalid].map(value=>value.key).sort((a,b)=>factory.cmp(a,b)),outside};
 }
 async function drain(includeBody=false){const deadline=Date.now()+6500;for(;;){const originals=[...pending].filter(value=>includeBody||value!==body);if(!originals.length&&!opens.size&&!txs.size)break;if(Date.now()>=deadline){fatal=true;throw Error('FATAL_STOP: accepted audio-prefix originals/native actors remain');}let timer:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([originals.length?Promise.allSettled(originals):new Promise(()=>{}),new Promise(resolve=>{timer=setTimeout(resolve,10);})]);}finally{clearTimeout(timer);}}assert.equal(connections.size,0);}
 async function cleanup(){ledger.active=false;try{await drain(true);for(const [name,descriptor] of prior)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);assert.deepEqual(timeouts,[],'A timed-out operation remains a failure even if it later settles');}catch(error){fatal=true;throw error;}}
 return {ledger,wait,follow,seed,inventory,drain,cleanup,setBody:(original:Promise<unknown>)=>{body=original;}};
}
async function using(work:(f:ReturnType<typeof fixture>)=>Promise<void>){const f=fixture(),original=f.follow(work(f));f.setBody(original);try{await f.wait(original,'whole actual audio recovery case',30000);}finally{await f.cleanup();}}

test('Recoverable audio preserves exact native order/fields while reading only its note prefix, never heavy retained histories',()=>using(async f=>{
 const seeded=await f.seed(),before=await f.inventory();f.ledger.active=true;
 const recovered=await f.wait(recoverableRecordings(noteId,scope),'actual scoped recoverable recordings');await f.drain();f.ledger.active=false;
 exact(recovered,seeded.expected,'All accepted journal fields, parts, spans and raw chunk IDs match the independent expected sources');
 assert.equal(f.ledger.getAll,0,'Recovery polling must not request the global snapshots body store');
 assert.deepEqual(f.ledger.valueKeys,seeded.insideKeys,'Production cursor.value accesses stay inside the target prefix; getAll deliveries are also counted');
 assert.equal(f.ledger.keys.at(-1),seeded.outside,'The first outside key is checked before touching its value');
 assert.equal(f.ledger.valueKeys.includes(seeded.outside),false);assert.equal(f.ledger.ranges.length,1);assert.equal(f.ledger.ranges[0].lower,prefix);
 assert.equal(f.ledger.complete,1);assert.equal(f.ledger.abort,0);assert.equal(f.ledger.writes,0);
 exact(await f.inventory(),before,'Every draft/history/audio proof/media byte/outbox/foreign row is unchanged');
 f.ledger.active=true;const empty=await f.wait(recoverableRecordings('no-recording-note',scope),'empty native prefix');await f.drain();f.ledger.active=false;assert.deepEqual(empty,[]);assert.equal(f.ledger.getAll,0);assert.equal(f.ledger.writes,0);exact(await f.inventory(),before,'An empty namespace changes no source');
}));

test('A real partial readonly prefix abort rejects instead of publishing recoveries and preserves every original for fresh retry',()=>using(async f=>{
 const seeded=await f.seed(),before=await f.inventory();f.ledger.active=true;f.ledger.abortFirst=true;let published=false;
 const original=f.follow(recoverableRecordings(noteId,scope).then(value=>{published=true;return value;}));
 await assert.rejects(()=>f.wait(original,'actual recovery aborted transaction'),error=>error instanceof Error&&!/Timeout/.test(error.message));
 // Join the actual abort, not only the rejected storage Promise.
 f.ledger.active=false;await f.drain();assert.equal(published,false);assert.equal(f.ledger.abortTriggered,true);assert.equal(f.ledger.abort,1);assert.equal(f.ledger.complete,0);assert.equal(f.ledger.writes,0);
 exact(await f.inventory(),before,'A partial read must retain every complete original and historical byte');
 f.ledger.abortFirst=false;const fresh=await f.wait(recoverableRecordings(noteId,scope),'fresh exact retry after native abort');await f.drain();exact(fresh,seeded.expected,'Fresh retry returns precisely the retained journals');exact(await f.inventory(),before,'Retry remains readonly with unchanged unrelated scopes');
}));

