/** Candidate-only actual ApiClient/stores/kernel, with a pipe RPC HTTP seam.
 * Python owns cookies and the real Stage6 TestClient. No socket or browser proof. */
import assert from 'node:assert/strict';
import {requireBoundedMountedCheck} from './mounted-cleanup.mjs';
import {createHash} from 'node:crypto';
import {createInterface} from 'node:readline';
import {IDBFactory} from 'fake-indexeddb';
import {ApiClient} from '../pwa/src/api.ts';
import {putDraft,getSnapshot,openNotebookStateDatabase,type Draft} from '../pwa/src/storage.ts';
import {createManagedNotebookStore} from '../pwa/src/managedNotebookStore.ts';
import {createManagedNotebookClient} from '../pwa/src/managedNotebookClient.ts';
import {createManagedNotebookTrashTransport,managedLifecycleOperationKey,type ManagedLifecycleJournal} from '../pwa/src/managedNotebookTrashTransport.ts';
import {createNotebookTrashStorage} from '../pwa/src/notebookTrashStorage.ts';
import {changeNotebookTrash,flushNotebookTrash} from '../src/lib/notebookTrash.ts';
import {notebookDocumentId} from '../src/lib/notebookDocument.ts';
import {emptyNotebookLibrary,isNotebookLibrary,LIBRARY_DOCUMENT_ID} from '../src/lib/notebookLibrary.ts';
requireBoundedMountedCheck();

const MAX_LINE=2*1024*1024,MAX_RPC=64,MAX_TOTAL=16*1024*1024;
const sha=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const lines=createInterface({input:process.stdin,crlfDelay:Infinity});
const iterator=lines[Symbol.asyncIterator]();
const first=await iterator.next();assert.equal(first.done,false,'Missing private RPC configuration');
assert.ok(Buffer.byteLength(first.value)<=MAX_LINE,'Configuration byte budget');
const config=JSON.parse(first.value);assert.equal(config.schema,1);assert.equal(config.kind,'stage8-lifecycle-composed');
let sequence=0,total=0,active=true;
const pending=new Map<number,{resolve:(value:any)=>void;reject:(error:unknown)=>void}>();
const originals=new Set<Promise<unknown>>();
const follow=<T>(promise:Promise<T>)=>{let original:Promise<T>;original=promise.finally(()=>originals.delete(original));originals.add(original);void original.catch(()=>{});return original;};
const pump=(async()=>{try{for(;;){const row=await iterator.next();if(row.done)break;assert.ok(Buffer.byteLength(row.value)<=MAX_LINE,'RPC reply byte budget');const reply=JSON.parse(row.value),held=pending.get(reply.id);assert.ok(held,'Unexpected RPC reply identity');pending.delete(reply.id);held.resolve(reply);}}catch(error){for(const held of pending.values())held.reject(error);pending.clear();throw error;}finally{if(active){for(const held of pending.values())held.reject(Error('RPC input closed before terminal operation'));pending.clear();}}})();void pump.catch(()=>{});
const fetcher:typeof fetch=async(input,init={})=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);assert.equal(url.origin,config.origin);assert.equal(url.hash,'');
 const headers=Object.fromEntries(new Headers(init.headers).entries());assert.equal(init.credentials,'include');assert.equal(init.redirect,'error');
 let bytes:Uint8Array;if(init.body===undefined||init.body===null)bytes=new Uint8Array(0);else if(typeof init.body==='string')bytes=new TextEncoder().encode(init.body);else if(init.body instanceof Blob)bytes=new Uint8Array(await init.body.arrayBuffer());else throw Error('Unapproved RPC request body');
 const id=++sequence;assert.ok(id<=MAX_RPC);const message=JSON.stringify({id,method:init.method??'GET',path:url.pathname+url.search,headers,bodyBase64:Buffer.from(bytes).toString('base64')});total+=Buffer.byteLength(message);assert.ok(Buffer.byteLength(message)<=MAX_LINE&&total<=MAX_TOTAL,'RPC request budget');
 const result=follow(new Promise<any>((resolve,reject)=>pending.set(id,{resolve,reject})));process.stdout.write(message+'\n');const reply=await result;
 if(reply.status===0)throw new TypeError('explicit-reply-loss-after-actual-commit');
 assert.ok(Number.isInteger(reply.status)&&reply.status>=200&&reply.status<=599);assert.equal(typeof reply.bodyBase64,'string');const body=Buffer.from(reply.bodyBase64,'base64');assert.equal(body.toString('base64'),reply.bodyBase64);assert.ok(body.length<=MAX_LINE);
 return new Response(body,{status:reply.status,headers:reply.headers});
};

const previous=Object.getOwnPropertyDescriptor(globalThis,'indexedDB'),factory=new IDBFactory();
const connections=new Set<IDBDatabase>(),transactions=new Set<IDBTransaction>(),opens=new Set<IDBOpenDBRequest>();
let starts=0,completes=0,aborts=0;
const nativeOpen=factory.open.bind(factory);
factory.open=((...args:Parameters<IDBFactory['open']>)=>{const request=nativeOpen(...args);opens.add(request);request.addEventListener('error',()=>opens.delete(request),{once:true});request.addEventListener('success',()=>{opens.delete(request);const db=request.result,close=db.close.bind(db),transaction=db.transaction.bind(db);connections.add(db);db.close=()=>{close();connections.delete(db);};db.transaction=((...values:Parameters<IDBDatabase['transaction']>)=>{const tx=transaction(...values);transactions.add(tx);starts++;tx.addEventListener('complete',()=>{transactions.delete(tx);completes++;},{once:true});tx.addEventListener('abort',()=>{transactions.delete(tx);aborts++;},{once:true});return tx;})as IDBDatabase['transaction'];},{once:true});return request;})as IDBFactory['open'];
Object.defineProperty(globalThis,'indexedDB',{configurable:true,writable:true,value:factory});
const scope={accountId:config.actorAccountId,spaceId:config.identity.spaceId};
const identity={...scope,noteId:config.identity.noteId,canonicalDocumentId:notebookDocumentId(config.identity.noteId),metadataDocumentId:config.identity.noteId,lineage:config.identity.lineage};
assert.equal(identity.canonicalDocumentId,config.identity.canonicalDocumentId);assert.equal(identity.metadataDocumentId,config.identity.metadataDocumentId);
assert.equal(config.metadata.id,identity.noteId);assert.equal(config.canonical.noteId,identity.noteId);assert.equal(config.canonical.collaboration.lineage,identity.lineage);
const current=()=>active;
async function writeBlob(row:any){const db=await openNotebookStateDatabase();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('scopedBlobs','readwrite');tx.objectStore('scopedBlobs').put(row);tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??Error('Fixture blob TX aborted'));});}finally{db.close();}}
async function inventory(){const db=await openNotebookStateDatabase(),rows:Record<string,any[]>={};try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['drafts','mutations','snapshots','scopedBlobs'],'readonly');for(const store of ['drafts','mutations','snapshots','scopedBlobs']){const request=tx.objectStore(store).getAll();request.onsuccess=()=>{rows[store]=request.result;};}tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??Error('Inventory TX aborted'));});}finally{db.close();}rows.scopedBlobs=await Promise.all(rows.scopedBlobs.map(async({blob,...row})=>({...row,bytes:blob.size,mediaType:blob.type,actualSHA256:sha(new Uint8Array(await blob.arrayBuffer()))})));return rows;}
let failure:unknown,summary:Record<string,unknown>={},phase='local-seed';
try{
 const canonical:Draft={...scope,type:'whiteboard',documentId:identity.canonicalDocumentId,title:config.metadata.title,content:config.canonical,baseVersion:1,updatedAt:1,syncState:'synced'};
 const metadata:Draft={...scope,type:'notesMarkdown',documentId:identity.metadataDocumentId,title:config.metadata.title,content:config.metadata,baseVersion:1,updatedAt:1,syncState:'synced'};
 const library={...emptyNotebookLibrary(),updatedAt:config.now,folders:[{id:'original-folder',parentId:null,title:'Original folder',color:'#123456',order:0}],notes:{[identity.noteId]:{folderId:'original-folder',favorite:true,deletedAt:null,cover:{color:'#abcdef',pattern:'grid' as const}}}};
 await putDraft(canonical);await putDraft(metadata);await putDraft({...scope,type:'preferences',documentId:LIBRARY_DOCUMENT_ID,title:'Library',content:library,baseVersion:0,updatedAt:1,syncState:'local'});
 const foreign:Draft={...metadata,accountId:config.foreignAccountId,content:{id:identity.noteId,title:'Foreign exact original'},title:'Foreign exact original'};await putDraft(foreign);
 for(const file of config.files){const bytes=Buffer.from(file.bodyBase64,'base64');assert.equal(sha(bytes),file.sha256);await writeBlob({...scope,key:[scope.accountId,scope.spaceId,file.id].join('|'),id:file.id,documentId:identity.canonicalDocumentId,blob:new Blob([bytes],{type:file.mediaType}),name:file.name,createdAt:1,status:'uploaded',serverId:file.serverId,revision:1,sha256:file.sha256});}
 phase='actual-admission';const before=await inventory(),api=new ApiClient(config.origin,fetcher,undefined,{managedRawFetch:true});api.bindAccount(scope.accountId);const port=api.createManagedNotebookPort({current}),managed=createManagedNotebookStore(openNotebookStateDatabase),reader=createManagedNotebookClient({port,actorAccountId:scope.accountId,current,currentPort:()=>port});
 await managed.beginAdmission(identity,{serverKey:port.serverKey,resourceId:config.resourceId,incarnation:config.incarnation,admissionKey:'composed-stage8-admission'},current);await reader.admit(managed,identity);
 const trashStore=createNotebookTrashStorage(openNotebookStateDatabase),transport=createManagedNotebookTrashTransport({enabled:true,scope,port,current,currentPort:()=>port,openDatabase:openNotebookStateDatabase});
 const preservedBefore=await inventory(),preparedHashes:string[]=[],receivedHashes:string[]=[];
 for(const [intent,now]of [['trash',Date.parse(config.now)],['restore',Date.parse(config.now)+1]]as const){
  phase=intent+'-prepare';
  assert.equal((await changeNotebookTrash({scope,noteId:identity.noteId,intent,store:trashStore,current,now})).changed,true);
  const local=await trashStore.read(scope,identity.noteId),op=local.operations.at(-1)!;
  phase=intent+'-reply-loss';await assert.rejects(flushNotebookTrash({scope,noteId:identity.noteId,store:trashStore,transport,current}),error=>error instanceof TypeError&&error.message==='explicit-reply-loss-after-actual-commit');
  const key=managedLifecycleOperationKey(scope,port.serverKey,config.resourceId,config.incarnation,op.id),staged=(await getSnapshot(key))?.value as ManagedLifecycleJournal;
  assert.equal(staged.status,'prepared');assert.equal(staged.prepared.key,op.id);assert.equal(sha(staged.prepared.body),staged.prepared.bodySha256);preparedHashes.push(staged.prepared.bodySha256);
  assert.equal((await trashStore.read(scope,identity.noteId)).operations.at(-1)?.status,'pending');
  phase=intent+'-replay';assert.equal(await flushNotebookTrash({scope,noteId:identity.noteId,store:trashStore,transport,current}),1);
  const received=(await getSnapshot(key))?.value as ManagedLifecycleJournal;assert.equal(received.status,'received');assert.equal(received.prepared.body,staged.prepared.body);assert.equal(received.prepared.key,staged.prepared.key);assert.equal(typeof received.rawReceipt,'string');receivedHashes.push(sha(received.rawReceipt!));
 }
 phase='preservation-oracles';const view=await trashStore.read(scope,identity.noteId),after=await inventory();assert.equal(view.head?.state,'restored');assert.equal(view.head?.server?.state,'restored');assert.equal(view.operations.length,2);assert.ok(view.operations.every(op=>op.status==='acknowledged'));
 assert.deepEqual(after.scopedBlobs,preservedBefore.scopedBlobs);assert.deepEqual(after.drafts.filter(row=>row.accountId===config.foreignAccountId),before.drafts.filter(row=>row.accountId===config.foreignAccountId));
 assert.deepEqual(after.mutations,preservedBefore.mutations);for(const row of preservedBefore.snapshots)assert.deepEqual(after.snapshots.find(value=>value.key===row.key),row);
 for(const type of ['whiteboard','notesMarkdown'])assert.deepEqual(after.drafts.find(row=>row.accountId===scope.accountId&&row.type===type),preservedBefore.drafts.find(row=>row.accountId===scope.accountId&&row.type===type));
 const finalLibrary=view.library?.content;assert.ok(isNotebookLibrary(finalLibrary));assert.deepEqual(finalLibrary.folders,library.folders);assert.deepEqual(finalLibrary.notes,library.notes);assert.ok(view.source);
 summary={ok:true,kind:'summary',preparedBodySHA256:preparedHashes,rawReceiptSHA256:receivedHashes,localSourceSHA256:sha(JSON.stringify(view.source)),mediaInventorySHA256:sha(JSON.stringify(after.scopedBlobs)),foreignInventorySHA256:sha(JSON.stringify(after.drafts.filter(row=>row.accountId===config.foreignAccountId))),operations:2};
}catch(error){failure=error;summary={ok:false,kind:'summary',code:'composed_failure',phase,errorCodeSHA256:sha(String((error as any)?.code??'no-code'))};}
finally{
 active=false;
 if(pending.size||originals.size||opens.size||transactions.size||connections.size){failure??=Error('Nonterminal RPC/IDB work');summary={ok:false,kind:'summary',code:'FATAL_STOP_NONTERMINAL'};}
 summary.cleanup={rpcPending:pending.size,originals:originals.size,opens:opens.size,transactions:transactions.size,connections:connections.size,starts,completes,aborts};
 if(!failure){assert.equal(starts,completes+aborts);await new Promise<void>((resolve,reject)=>{const request=factory.deleteDatabase('dowze-academie-pwa');request.onsuccess=()=>resolve();request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Database remained open'));});if(previous)Object.defineProperty(globalThis,'indexedDB',previous);else Reflect.deleteProperty(globalThis,'indexedDB');}
 lines.close();process.stdin.pause();await pump.catch(()=>{});process.stdout.write(JSON.stringify(summary)+'\n');if(failure)process.exitCode=1;
}
