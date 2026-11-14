import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {DeviceCache} from '../src/lib/appStorage.ts';
const legacy={length:0,key:()=>null,getItem:()=>null} as unknown as Storage;
test('Two independent views cannot replace unseen measured work; fresh durable read sees the winning checkpoint',async()=>{
 const factory=new IDBFactory(),a=new DeviceCache(),b=new DeviceCache();await a.initialize(legacy,factory);await b.initialize(legacy,factory);
 try{
  const key='dowze.notebook.work-timer.["A","year","note"]';
  assert.equal(await a.compareAndSetItem(key,null,'0'),true);assert.equal(await b.readCurrentItem(key),'0');
  assert.equal(await a.compareAndSetItem(key,'0','30000'),true);assert.equal(await b.compareAndSetItem(key,'0','0'),false);
  assert.equal(await a.readCurrentItem(key),'30000');assert.equal(b.getItem(key),'30000');await b.flush();
  assert.equal(await b.compareAndSetItem(key,'30000','35000'),true);assert.equal(await a.readCurrentItem(key),'35000');
 }finally{a.close();b.close();}
});
test('Different exact account/space/note keys and failed expected revisions stay independent',async()=>{
 const factory=new IDBFactory(),a=new DeviceCache();await a.initialize(legacy,factory);
 try{
  const keys=['dowze.notebook.work-timer.["A|B","year","note"]','dowze.notebook.work-timer.["A","B|year","note"]','dowze.notebook.work-timer.["A|B","other","note"]'];
  for(const [i,key] of keys.entries())assert.equal(await a.compareAndSetItem(key,null,String(i)),true);
  assert.equal(await a.compareAndSetItem(keys[0],'incorrect','new'),false);
  for(const [i,key] of keys.entries())assert.equal(await a.readCurrentItem(key),String(i));
 }finally{a.close();}
});
test('Queued ordinary cache writes precede compare-and-set and the commit barrier; a frozen cache does not mutate',async()=>{
 const factory=new IDBFactory(),a=new DeviceCache();await a.initialize(legacy,factory);
 try{
  a.setItem('dowze.qa.timer','prior');assert.equal(await a.compareAndSetItem('dowze.qa.timer','prior','new'),true);await a.flush();
  assert.equal(await a.readCurrentItem('dowze.qa.timer'),'new');a.freeze();await assert.rejects(a.compareAndSetItem('dowze.qa.timer','new','forbidden'),/Fermeture/);
  assert.equal(await a.readCurrentItem('dowze.qa.timer'),'new');
 }finally{a.close();}
});
