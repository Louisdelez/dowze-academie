import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {putLocalBlob,listLocalBlobs} from '../pwa/src/storage.ts';
globalThis.indexedDB=new IDBFactory();
test('Version-2 media migration keeps originals and separates identical attachment IDs by owner and year',async()=>{
 const old=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('dowze-academie-pwa',2);r.onupgradeneeded=()=>{for(const [name,keyPath] of [['blobs','id'],['drafts','key'],['mutations','id'],['snapshots','key']])r.result.createObjectStore(name,{keyPath});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 const original={id:'same-id',accountId:'A',spaceId:'year1',blob:new Blob(['original-A']),name:'Original',createdAt:1,status:'pending' as const};await new Promise<void>((resolve,reject)=>{const tx=old.transaction('blobs','readwrite');tx.objectStore('blobs').put(original);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});old.close();
 assert.equal(await(await listLocalBlobs('A','year1'))[0].blob.text(),'original-A');await putLocalBlob({...original,accountId:'B',blob:new Blob(['B'])});await putLocalBlob({...original,spaceId:'year2',blob:new Blob(['A-next-year'])});assert.equal(await(await listLocalBlobs('A','year1'))[0].blob.text(),'original-A');assert.equal(await(await listLocalBlobs('B','year1'))[0].blob.text(),'B');assert.equal(await(await listLocalBlobs('A','year2'))[0].blob.text(),'A-next-year');
 const upgraded=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open('dowze-academie-pwa',3);r.onsuccess=()=>resolve(r.result);});const retained=await new Promise<any>(resolve=>{const r=upgraded.transaction('blobs').objectStore('blobs').get('same-id');r.onsuccess=()=>resolve(r.result);});assert.equal(await retained.blob.text(),'original-A');upgraded.close();
});
