/** Source-only until Root executes. Actual reader/builder and fakeIndexedDB;
 * instrumentation delegates native requests/values and observes reader TX only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {IDBFactory,IDBObjectStore} from 'fake-indexeddb';
import {readPrivateNotebookSyncPolicy} from '../pwa/src/privateNotebookSyncStorage.ts';
import {PrivateNotebookSyncPolicyError,type Policy,type SnapshotLike} from '../src/lib/privateNotebookSyncPolicy.ts';
import {notebookDocumentId} from '../src/lib/notebookIdentity.ts';
import {noteMetadataTransportId} from '../src/lib/noteMetadataIdentity.ts';

const scope={accountId:'reader-actor-A',spaceId:'year-one'},other={accountId:'reader-actor-B',spaceId:'year-one'};
const resourceId='10000000-0000-4000-8000-000000000001',incarnation='20000000-0000-4000-8000-000000000002',deletionId='30000000-0000-4000-8000-000000000003',operationId='40000000-0000-4000-8000-000000000004';
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const row=(key:string,value:unknown,owner=scope):SnapshotLike=>({key,...owner,value});
const bindingKey=(noteId:string)=>'managed-notebook-binding|'+JSON.stringify([scope.accountId,scope.spaceId,noteId]);
const resourceKey=(id=resourceId,server='private-server')=>'managed-notebook-resource|'+JSON.stringify([server,scope.accountId,id]);
function resource(noteId:string,id=resourceId,server='private-server'):SnapshotLike {
 return row(resourceKey(id,server),{bindingKey:bindingKey(noteId),identity:{...scope,noteId,canonicalDocumentId:notebookDocumentId(noteId),metadataDocumentId:noteId,lineage:'lineage'},resourceId:id,incarnation});
}
function trash(noteId:string):SnapshotLike {
 return row('notebook-trash-head|'+JSON.stringify([scope.accountId,scope.spaceId,noteId]),{schema:1,kind:'notebook-trash-head',...scope,noteId,lineage:'lineage',state:'trashed',sequence:1,deletionId,sourceKey:'unread-original-source',localDeletedAt:1,localRetainUntil:2,operationIds:[operationId]});
}
const deletionKey=(noteId:string)=>`paper-canonical-deletion|${scope.accountId}|${scope.spaceId}|whiteboard|${notebookDocumentId(noteId)}`;
function alias(noteId:string):SnapshotLike {
 const documentId=noteMetadataTransportId(noteId);return row(`paper-metadata-transport|${scope.accountId}|${scope.spaceId}|${documentId}`,{schema:1,kind:'paper-metadata-transport',...scope,logicalId:noteId,documentId,graphId:notebookDocumentId(noteId),confirmedVersion:2});
}
let fatal=false,serial=0;
async function fixture(){
 if(fatal)throw Error('FATAL_STOP: a prior original reader actor did not settle');
 const factory=new IDBFactory(),prior=Object.getOwnPropertyDescriptor(globalThis,'indexedDB');
 Object.defineProperty(globalThis,'indexedDB',{configurable:true,writable:true,value:factory});
 const original={get:IDBObjectStore.prototype.get,getAll:IDBObjectStore.prototype.getAll,openCursor:IDBObjectStore.prototype.openCursor,openKeyCursor:IDBObjectStore.prototype.openKeyCursor};
 const cursorValues=new Map<object,{descriptor:PropertyDescriptor;value:unknown}>();
 const observed=new WeakSet<IDBTransaction>(),pending=new Set<Promise<unknown>>(),txs=new Set<IDBTransaction>(),opens=new Set<IDBOpenDBRequest>(),connections=new Set<IDBDatabase>(),timeouts:string[]=[],events:string[]=[];
 const reads={get:[] as string[],getAll:0,openCursor:0,keyCursors:0,cursorValue:0};let complete=0,aborted=0;
 const follow=<T>(work:Promise<T>)=>{pending.add(work);void work.then(()=>pending.delete(work),()=>pending.delete(work));return work;};
 async function bounded<T>(work:Promise<T>,label:string){const original=follow(work);let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([original,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{timeouts.push(label);reject(Error('Timeout retains original: '+label));},4000);})]);}finally{clearTimeout(timer);}}
 const monitor=(tx:IDBTransaction)=>{if(txs.has(tx))return tx;txs.add(tx);follow(new Promise<void>(resolve=>{const terminal=(kind:string)=>{events.push(kind);txs.delete(tx);if(kind==='complete')complete++;else aborted++;resolve();};tx.addEventListener('complete',()=>terminal('complete'),{once:true});tx.addEventListener('abort',()=>terminal('abort'),{once:true});}));return tx;};
 IDBObjectStore.prototype.get=function(...args){if(observed.has(this.transaction))reads.get.push(String(args[0]));return Reflect.apply(original.get,this,args);};
 IDBObjectStore.prototype.getAll=function(...args){if(observed.has(this.transaction))reads.getAll++;return Reflect.apply(original.getAll,this,args);};
 IDBObjectStore.prototype.openCursor=function(...args){const request=Reflect.apply(original.openCursor,this,args);if(observed.has(this.transaction)){reads.openCursor++;request.addEventListener('success',()=>{const cursor=request.result;if(!cursor||cursorValues.has(cursor))return;const descriptor=Object.getOwnPropertyDescriptor(cursor,'value');if(!descriptor||!Object.hasOwn(descriptor,'value')||!descriptor.configurable)throw Error('Unexpected native fakeIndexedDB value descriptor');const savedValue={descriptor,value:descriptor.value};cursorValues.set(cursor,savedValue);Object.defineProperty(cursor,'value',{configurable:true,enumerable:descriptor.enumerable,get(){reads.cursorValue++;return savedValue.value;},set(value){savedValue.value=value;}});});}return request;};
 IDBObjectStore.prototype.openKeyCursor=function(...args){if(observed.has(this.transaction))reads.keyCursors++;return Reflect.apply(original.openKeyCursor,this,args);};
 let db:IDBDatabase|undefined;
 const opening=new Promise<IDBDatabase>((resolve,reject)=>{const request=factory.open('private-sync-reader-'+(++serial),1);opens.add(request);request.addEventListener('upgradeneeded',()=>{monitor(request.transaction!);request.result.createObjectStore('snapshots',{keyPath:'key'});});request.addEventListener('success',()=>{opens.delete(request);const value=request.result;connections.add(value);const transaction=value.transaction.bind(value);value.transaction=((...args:Parameters<IDBDatabase['transaction']>)=>monitor(transaction(...args))) as IDBDatabase['transaction'];resolve(value);});request.addEventListener('error',()=>{opens.delete(request);reject(request.error);});});
 async function write(rows:readonly SnapshotLike[]){const tx=db!.transaction('snapshots','readwrite');const done=new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??Error('Native seed aborted'));});for(const value of rows)tx.objectStore('snapshots').put(value);return bounded(done,'original native write');}
 async function inventory(){const tx=db!.transaction('snapshots','readonly'),request=tx.objectStore('snapshots').getAll();return bounded(new Promise<SnapshotLike[]>((resolve,reject)=>{tx.oncomplete=()=>resolve(request.result);tx.onabort=()=>reject(tx.error);}), 'original native inventory');}
 function read(current:()=>boolean=()=>true){const tx=db!.transaction('snapshots','readonly');observed.add(tx);let policy:Policy|undefined,failure:unknown,published=0;const done=new Promise<Policy>((resolve,reject)=>{tx.oncomplete=()=>{events.push('reader-published');published++;if(!policy){reject(Error('Reader completed without a policy'));return;}resolve(policy);};tx.onabort=()=>reject(failure??tx.error??Error('Native reader aborted'));});
  try{readPrivateNotebookSyncPolicy(tx,scope,current,value=>{policy=value;},error=>{failure=error;tx.abort();});}catch(error){failure=error;tx.abort();}
  return {promise:bounded(done,'original native policy reader'),tx,published:()=>published};
 }
 async function close(){
  let timer:ReturnType<typeof setTimeout>|undefined;try{
   if(!await Promise.race([Promise.allSettled([...pending]).then(()=>true),new Promise<boolean>(resolve=>{timer=setTimeout(()=>resolve(false),4500);})])||pending.size||opens.size||txs.size){fatal=true;throw Error('FATAL_STOP: original requests/transactions remain; globals are retained');}
   // Every connection belongs to this exact isolated factory, including a
   // native open which may have completed after a wrapper timeout.
   try{for(const connection of [...connections]){connection.close();connections.delete(connection);}}catch(error){fatal=true;throw error;}
   if(connections.size){fatal=true;throw Error('FATAL_STOP: an original native connection remains');}assert.equal(timeouts.length,0,'No timeout may satisfy an expected refusal');
  }finally{clearTimeout(timer);if(!fatal){IDBObjectStore.prototype.get=original.get;IDBObjectStore.prototype.getAll=original.getAll;IDBObjectStore.prototype.openCursor=original.openCursor;IDBObjectStore.prototype.openKeyCursor=original.openKeyCursor;for(const [cursor,savedValue]of cursorValues)Object.defineProperty(cursor,'value',{...savedValue.descriptor,value:savedValue.value});if(prior)Object.defineProperty(globalThis,'indexedDB',prior);else Reflect.deleteProperty(globalThis,'indexedDB');}}
 }
 try{db=await bounded(opening,'original native open');}catch(error){await close();throw error;}
 return {write,inventory,read,close,reads,events,stats:()=>({pending:pending.size,opens:opens.size,transactions:txs.size,connections:connections.size,complete,aborted})};
}

test('The real reader uses only key cursors and exact light headers, preserving every heavy/foreign original',async()=>{
 const f=await fixture();try{
  const heavy='x'.repeat(512*1024),managed='managed-note',deleted='École / deleted',aliasRow=alias(deleted),resourceRow=resource(managed),trashRow=trash('trashed-note');
  const forbidden=[row(bindingKey(managed),{binding:{phase:'admitting'},original:{canonical:{content:heavy}},pending:{body:heavy}}),row(deletionKey(deleted),{source:{content:heavy},malformedBodyIsIrrelevant:true}),row('paper-history|'+scope.accountId+'|'+scope.spaceId+'|heavy',{body:heavy}),row('managed-notebook-operation|heavy',{body:heavy}),row('paper-sticker-library|heavy',{body:heavy}),row(aliasRow.key+'|proof-heavy',{body:heavy}),row('foreign-heavy',{body:heavy},other),row('managed-notebook-resource|'+JSON.stringify(['private-server',other.accountId,resourceId]),{body:heavy},other),row('managed-notebook-binding|'+JSON.stringify([other.accountId,other.spaceId,managed]),{original:{body:heavy}},other)];
  await f.write([...forbidden,resourceRow,trashRow,aliasRow]);const before=await f.inventory(),r=f.read(),policy=await r.promise;
  assert.equal(r.published(),1);assert.equal(policy.blockDocument('notesMarkdown',managed),true);assert.equal(policy.blockDocument('notesMarkdown','trashed-note'),true);assert.equal(policy.blockDocument('notesMarkdown',noteMetadataTransportId(deleted)),true);assert.equal(policy.blockBlob(),true);assert.equal(policy.blockDocument('notesMarkdown','ordinary'),false);
  assert.deepEqual([...f.reads.get].sort(),[resourceRow.key,trashRow.key,aliasRow.key].sort(),'Only the exact projected header rows may be loaded');assert.equal(f.reads.keyCursors,5);assert.equal(f.reads.getAll,0);assert.equal(f.reads.openCursor,0);assert.equal(f.reads.cursorValue,0,'No value-bearing cursor is opened or read');
  const after=await f.inventory();assert.equal(digest(after),digest(before),'Every row, heavy body and foreign scope must remain byte-for-byte JSON exact');assert.deepEqual(after.map(x=>x.key),before.map(x=>x.key));
 }finally{await f.close();}
});

test('Missing/ambiguous resource indexes and malformed current headers abort the real transaction conservatively',async()=>{
 for(const scenario of ['missing','ambiguous','malformed']as const){const f=await fixture();try{
  const rows=[row(bindingKey('note-A'),{original:'unread body'})];if(scenario!=='missing')rows.push(resource('note-A'));if(scenario==='ambiguous')rows.push(resource('note-A','50000000-0000-4000-8000-000000000005','another-server'));if(scenario==='malformed')(rows[1].value as any).identity.accountId='foreign';
  await f.write(rows);const before=await f.inventory(),initial=f.stats().aborted,r=f.read();await assert.rejects(r.promise,PrivateNotebookSyncPolicyError);assert.equal(r.published(),0);assert.equal(f.stats().aborted,initial+1,'Refusal settles only at the real native abort');assert.equal(f.stats().transactions,0);assert.equal(digest(await f.inventory()),digest(before));assert.equal(f.reads.get.includes(bindingKey('note-A')),false);assert.equal(f.reads.getAll,0);assert.equal(f.reads.cursorValue,0);
 }finally{await f.close();}}
 for(const server of [null,false,0,'']){const f=await fixture();try{
  const head=trash('restored-note');(head.value as any).state='restored';(head.value as any).server=server;
  await f.write([head]);const before=await f.inventory(),initial=f.stats().aborted,r=f.read();
  await assert.rejects(r.promise,/Les marqueurs de synchronisation/,'A present malformed server attestation must never become an absent local-only receipt');assert.equal(r.published(),0);assert.equal(f.stats().aborted,initial+1);assert.equal(f.stats().transactions,0);assert.equal(digest(await f.inventory()),digest(before),'Malformed server receipt refusal preserves every original');assert.equal(f.reads.getAll,0);assert.equal(f.reads.cursorValue,0);
 }finally{await f.close();}}
});

test('A preceding real write is visible before policy publication, and revoked current aborts without publishing or mutating',async()=>{
 const f=await fixture();try{
  const initial=f.stats().complete,write=f.write([trash('newly-trashed')]),reader=f.read();assert.equal(f.stats().complete,initial,'The native write has not completed when the reader transaction is queued');
  const [policy]=await Promise.all([reader.promise,write]);assert.equal(policy.blockDocument('notesMarkdown','newly-trashed'),true);assert.equal(reader.published(),1);assert.equal(f.events.lastIndexOf('complete')<f.events.lastIndexOf('reader-published'),true,'The policy becomes externally visible only after its native terminal');
  const before=await f.inventory(),abortBefore=f.stats().aborted,revoked=f.read(()=>false);await assert.rejects(revoked.promise);assert.equal(revoked.published(),0);assert.equal(f.stats().aborted,abortBefore+1);assert.equal(f.stats().transactions,0);assert.equal(digest(await f.inventory()),digest(before),'Revoked reads cannot alter any current or foreign row');
 }finally{await f.close();}
});
