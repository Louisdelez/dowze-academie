/** Actual flush -> durable repair -> actual managed admission over bounded pipe
 * RPC. Python owns TestClient cookies and exact after-commit ACK loss. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createInterface} from 'node:readline';
import {IDBFactory} from 'fake-indexeddb';
import {requireBoundedMountedCheck} from './mounted-cleanup.mjs';
import {ApiClient} from '../pwa/src/api.ts';
import {flushMutations} from '../pwa/src/sync.ts';
import {putDraft,putLocalBlob,saveDraftAndQueue,getDraft,getSnapshot,listLocalBlobs,openNotebookStateDatabase,type Draft,type Snapshot} from '../pwa/src/storage.ts';
import {applyPaperCommand,notebookDocumentId} from '../src/lib/notebookDocument.ts';
import {amendPaperCollaboration,verifyPaperCollaboration} from '../src/lib/paperCollaboration.ts';
import {createManagedNotebookClient} from '../pwa/src/managedNotebookClient.ts';
import {createManagedNotebookStore} from '../pwa/src/managedNotebookStore.ts';
requireBoundedMountedCheck();
const MAX_LINE=2*1024*1024,MAX_TOTAL=16*1024*1024,MAX_RPC=64,sha=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
const lines=createInterface({input:process.stdin,crlfDelay:Infinity}),iterator=lines[Symbol.asyncIterator](),first=await iterator.next();assert.equal(first.done,false);assert.ok(Buffer.byteLength(first.value)<=MAX_LINE);const c=JSON.parse(first.value);assert.equal(c.schema,1);assert.equal(c.kind,'private-original-media-reconciliation-rpc');
let active=true,sequence=0,total=0;const pending=new Map<number,{resolve:(v:any)=>void;reject:(e:unknown)=>void}>(),originals=new Set<Promise<unknown>>();
const follow=<T>(p:Promise<T>)=>{let tracked:Promise<T>;tracked=p.finally(()=>originals.delete(tracked));originals.add(tracked);void tracked.catch(()=>{});return tracked;};
const pump=(async()=>{try{for(;;){const line=await iterator.next();if(line.done)break;assert.ok(Buffer.byteLength(line.value)<=MAX_LINE);const r=JSON.parse(line.value),held=pending.get(r.id);assert.ok(held);pending.delete(r.id);held.resolve(r);}}catch(error){for(const p of pending.values())p.reject(error);pending.clear();throw error;}finally{if(active){for(const p of pending.values())p.reject(Error('RPC closed before terminal'));pending.clear();}}})();void pump.catch(()=>{});
const fetcher:typeof fetch=async(input,init={})=>{const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);assert.equal(url.origin,c.origin);assert.equal(url.hash,'');assert.equal(init.credentials,'include');
 const body=init.body===undefined||init.body===null?new Uint8Array(0):typeof init.body==='string'?new TextEncoder().encode(init.body):init.body instanceof Blob?new Uint8Array(await init.body.arrayBuffer()):(()=>{throw Error('Unapproved RPC body');})();
 const id=++sequence;assert.ok(id<=MAX_RPC);const request=JSON.stringify({id,method:init.method??'GET',path:url.pathname+url.search,headers:Object.fromEntries(new Headers(init.headers).entries()),bodyBase64:Buffer.from(body).toString('base64')});total+=Buffer.byteLength(request);assert.ok(Buffer.byteLength(request)<=MAX_LINE&&total<=MAX_TOTAL);
 const waiting=follow(new Promise<any>((resolve,reject)=>pending.set(id,{resolve,reject})));process.stdout.write(request+'\n');const r=await waiting;if(r.status===0)throw new TypeError('explicit-reply-loss-after-actual-commit');const bytes=Buffer.from(r.bodyBase64,'base64');assert.equal(bytes.toString('base64'),r.bodyBase64);assert.ok(bytes.length<=MAX_LINE);return new Response(bytes,{status:r.status,headers:r.headers});};
const oldIDB=Object.getOwnPropertyDescriptor(globalThis,'indexedDB'),oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator'),factory=new IDBFactory(),connections=new Set<IDBDatabase>(),opens=new Set<IDBOpenDBRequest>(),transactions=new Set<IDBTransaction>();
let starts=0,completes=0,aborts=0;
function track(tx:IDBTransaction){if(transactions.has(tx))return;transactions.add(tx);starts++;tx.addEventListener('complete',()=>{transactions.delete(tx);completes++;},{once:true});tx.addEventListener('abort',()=>{transactions.delete(tx);aborts++;},{once:true});}
const nativeOpen=factory.open.bind(factory);factory.open=((...args:Parameters<IDBFactory['open']>)=>{const r=nativeOpen(...args);opens.add(r);r.addEventListener('upgradeneeded',()=>track(r.transaction!),{once:true});r.addEventListener('error',()=>opens.delete(r),{once:true});r.addEventListener('success',()=>{opens.delete(r);const db=r.result,close=db.close.bind(db),transaction=db.transaction.bind(db);connections.add(db);db.close=()=>{close();connections.delete(db);};db.transaction=((...v:Parameters<IDBDatabase['transaction']>)=>{const tx=transaction(...v);track(tx);return tx;}) as IDBDatabase['transaction'];},{once:true});return r;}) as IDBFactory['open'];
Object.defineProperty(globalThis,'indexedDB',{configurable:true,writable:true,value:factory});Object.defineProperty(globalThis,'navigator',{configurable:true,writable:true,value:{onLine:true}});
const current=()=>active,scope={accountId:c.actorAccountId,spaceId:c.spaceId},id=notebookDocumentId(c.canonical.noteId);assert.equal(id,c.canonicalDocumentId);assert.equal(c.metadata.id,c.canonical.noteId);const bytes=Buffer.from(c.bodyBase64,'base64');assert.equal(sha(bytes),c.sha256);
let failure:unknown,phase='seed',summary:Record<string,unknown>={};
try{
 const canonical:Draft={...scope,type:'whiteboard',documentId:id,title:c.metadata.title,content:c.canonical,baseVersion:0,updatedAt:1,syncState:'synced'},metadata:Draft={...scope,type:'notesMarkdown',documentId:c.metadata.id,title:c.metadata.title,content:c.metadata,baseVersion:0,updatedAt:1,syncState:'synced'};
 await putDraft(canonical);await putDraft(metadata);await putLocalBlob({...scope,id:c.oldKey,documentId:id,blob:new Blob([bytes],{type:c.mime}),name:'Original encoded audio',createdAt:1,status:'pending'});
 let graph=applyPaperCommand(c.canonical,{type:'add-asset',asset:{id:c.oldKey,name:'Original encoded audio',mediaType:c.mime,size:bytes.length}});
 graph=c.mime.startsWith('audio/')?applyPaperCommand(graph,{type:'add-audio',audio:{id:'first-audio',assetId:c.oldKey,name:'Original encoded audio',duration:1,startedAt:1}}):applyPaperCommand(graph,{type:'upsert-object',object:{id:'first-gif',kind:'image',assetId:c.oldKey,pageId:graph.pages[0].id,x:20,y:20,width:40,height:40,rotation:0,z:2,locked:false,createdAt:1}});graph=amendPaperCollaboration(c.canonical,graph);verifyPaperCollaboration(graph);
 const queued={...canonical,content:graph,updatedAt:2,syncState:'queued' as const};await saveDraftAndQueue(queued,{...queued,id:'rpc-canonical-publication',createdAt:2,status:'pending'},canonical.content);
 const note={...metadata,updatedAt:2,syncState:'queued' as const};await saveDraftAndQueue(note,{...note,id:'rpc-metadata-publication',createdAt:2,status:'pending'},metadata.content);
 const api=new ApiClient(c.origin,fetcher,undefined,{managedRawFetch:true});api.bindAccount(scope.accountId);
 phase='actual-flush-lost-replacement-ack';await assert.rejects(follow(flushMutations(api,scope.accountId,scope.spaceId,current)),error=>error instanceof TypeError&&error.message==='explicit-reply-loss-after-actual-commit');
 const key='private-original-media-reconciliation|'+JSON.stringify([c.origin,scope.accountId,scope.spaceId,c.oldKey]),prepared=(await getSnapshot(key))?.value as {phase:string;newKey:string};assert.equal(prepared.phase,'replacement-prepared');assert.notEqual(prepared.newKey,c.oldKey);
 phase='actual-flush-durable-retry';await follow(flushMutations(api,scope.accountId,scope.spaceId,current));const applied=(await getSnapshot(key))?.value as {phase:string;newKey:string;legacy:{receipt:unknown};receipt:{id:string;media_type:string;sha256:string;size:number}};
 assert.equal(applied.phase,'applied');assert.equal(applied.newKey,prepared.newKey);assert.equal(applied.receipt.media_type,c.mime);assert.equal(applied.receipt.sha256,c.sha256);assert.deepEqual(applied.legacy.receipt,c.oldReceipt);
 const local=(await listLocalBlobs(scope.accountId,scope.spaceId)).find(v=>v.id===c.oldKey)!;assert.equal(local.status,'uploaded');assert.equal(local.serverId,applied.receipt.id);assert.equal(local.blob.type,c.mime);assert.equal(sha(new Uint8Array(await local.blob.arrayBuffer())),c.sha256);
 const durable=(await getDraft({...scope,type:'whiteboard',documentId:id}))!;assert.equal(durable.syncState,'synced');verifyPaperCollaboration(durable.content as typeof graph);
 const history=(await getSnapshot(key+'|original'))!.value as {file:{blob:Blob};draft:Draft};assert.equal(sha(new Uint8Array(await history.file.blob.arrayBuffer())),c.sha256);assert.deepEqual(history.draft.content,graph);
 phase='actual-managed-admission';const identity={...scope,noteId:c.canonical.noteId,canonicalDocumentId:id,metadataDocumentId:c.metadata.id,lineage:graph.collaboration!.lineage},port=api.createManagedNotebookPort({current}),store=createManagedNotebookStore(openNotebookStateDatabase),reader=createManagedNotebookClient({port,actorAccountId:scope.accountId,current,currentPort:()=>port});
 await store.beginAdmission(identity,{serverKey:port.serverKey,resourceId:c.resourceId,incarnation:c.incarnation,admissionKey:'rpc-original-admission'},current);await follow(reader.admit(store,identity));
 const intent=await store.admission(identity,current);assert.equal(intent?.binding.phase,'managed');
 summary={ok:true,kind:'summary',replacementBlobId:applied.receipt.id,replacementKeySHA256:sha(applied.newKey),journalSHA256:sha(JSON.stringify(applied)),originalSHA256:c.sha256,canonicalSHA256:sha(JSON.stringify(durable.content))};
}catch(error){failure=error;summary={ok:false,kind:'summary',phase,errorCodeSHA256:sha(String((error as {code?:unknown})?.code??'none'))};}
finally{active=false;if(pending.size||originals.size||opens.size||transactions.size||connections.size){failure??=Error('Nonterminal work');summary={ok:false,kind:'summary',phase,code:'FATAL_STOP_NONTERMINAL'};}summary.cleanup={rpcPending:pending.size,originals:originals.size,opens:opens.size,transactions:transactions.size,connections:connections.size,starts,completes,aborts};
 if(!failure){assert.equal(starts,completes+aborts);await new Promise<void>((resolve,reject)=>{const r=factory.deleteDatabase('dowze-academie-pwa');r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Owned database still open'));});if(oldIDB)Object.defineProperty(globalThis,'indexedDB',oldIDB);else Reflect.deleteProperty(globalThis,'indexedDB');if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else Reflect.deleteProperty(globalThis,'navigator');}
 lines.close();process.stdin.pause();await pump.catch(()=>{});process.stdout.write(JSON.stringify(summary)+'\n');if(failure)process.exitCode=1;
}
