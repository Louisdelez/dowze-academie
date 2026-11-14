/** The imported five groups/thirteen tests stay registered and unchanged. This
 * extra bounded loader case observes exact native keys, never a timing budget. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './managed-notebook-media.test.ts';
import {exact} from './managed-notebook-application-fixture.ts';
import {getSnapshot} from '../pwa/src/storage.ts';
import {managedNotebookUploadKey,managedNotebookUploadAppliedKey} from '../pwa/src/managedNotebookMedia.ts';

test('Already applied uploads use compact exact proofs without reading any retained payload or source-history body',async t=>{
 const u=await setup(t);await u.add();await u.run();const key=u.requests[0].key,fullKey=managedNotebookUploadKey(u.f.identity,u.state.serverKey,key),headerKey=managedNotebookUploadAppliedKey(u.f.identity,u.state.serverKey,key),full=(await getSnapshot(fullKey))!,header=(await getSnapshot(headerKey))!;
 assert.ok(header);assert.equal((header.value as any).kind,'managed-notebook-upload-applied');assert.equal(Object.hasOwn((header.value as any).prepared,'payloadBase64'),false);const op=full.value as any;const {payloadBase64:bytes,...preparedHeader}=op.prepared;exact((header.value as any).prepared,preparedHeader);exact((header.value as any).receipt,op.receipt);
 // Explicit stress seam: a retained opaque original is deliberately large but
 // never parsed or cloned by the repeated loader. All earlier payload bytes,
 // fields and receipt remain present, and its full row is compared afterward.
 await u.f.write('snapshots',{...full,value:{...op,retainedOpaqueOriginal:'original-'.repeat(512*1024)}});const before=await u.f.inventory(),factory=indexedDB,previous=factory.open;let fullReads=0,historyReads=0,headerReads=0,scanReads=0;
 factory.open=((...args:Parameters<IDBFactory['open']>)=>{const request=previous.apply(factory,args);request.addEventListener('success',()=>{const db=request.result,transaction=db.transaction.bind(db);db.transaction=((...values:Parameters<IDBDatabase['transaction']>)=>{const tx=transaction(...values);if(tx.objectStoreNames.contains('snapshots')){const objectStore=tx.objectStore.bind(tx),seen=new WeakSet<IDBObjectStore>();tx.objectStore=(name:string)=>{const store=objectStore(name);if(name==='snapshots'&&!seen.has(store)){seen.add(store);
 // Refuse every available broad-read API before it can clone a retained body.
 const scanMethods=store as unknown as Record<string,unknown>;
 for(const method of ['getAll','getAllKeys','openCursor','openKeyCursor','getAllRecords'])if(typeof scanMethods[method]==='function')scanMethods[method]=()=>{scanReads++;throw Error('A snapshots scan must never load retained upload payload/history to list compact proofs: '+method);};
 const get=store.get.bind(store);store.get=((id:IDBValidKey|IDBKeyRange)=>{if(typeof id!=='string'){scanReads++;throw Error('Only exact string snapshot keys may list compact upload proofs');}if(typeof id==='string'&&id.startsWith('managed-notebook-upload|')){fullReads++;throw Error('A retained payload must never be read to list applied upload proofs');}if(typeof id==='string'&&id.startsWith('managed-notebook-upload-history|')){historyReads++;throw Error('An inactive source history must never be loaded');}if(id===headerKey)headerReads++;return get(id);})as IDBObjectStore['get'];}return store;};}return tx;})as IDBDatabase['transaction'];},{once:true});return request;})as IDBFactory['open'];
 try{const result=await u.run();assert.equal(result.remainingChanges,false);assert.equal(result.uploadReceipts.length,1);assert.equal(u.requests.length,1);assert.equal(fullReads,0);assert.equal(historyReads,0);assert.equal(scanReads,0,'No snapshots scan may bypass the exact-key payload/history oracle');assert.ok(headerReads>0,'Actual compact proof is still validated');}finally{factory.open=previous;}
 exact(await u.f.inventory(),before,'Every old raw payload/history/source remains exact; bounded reads are not deletion');
});
