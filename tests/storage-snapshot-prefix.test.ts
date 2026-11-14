import assert from 'node:assert/strict';
import test,{type TestContext} from 'node:test';
import {IDBFactory,IDBKeyRange as FakeKeyRange} from 'fake-indexeddb';
import {listSnapshotsByPrefix,putSnapshot,type Snapshot} from '../pwa/src/storage.ts';

/** Real fakeIndexedDB requests/transactions. Instance instrumentation counts
 * cursor.value accesses and injects explicit error seams; it never replaces
 * the cursor traversal, transaction completion, database or storage API. */
function fixture(t:TestContext){
 const factory=new IDBFactory(),prior=new Map(['indexedDB','IDBKeyRange'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 Object.defineProperty(globalThis,'indexedDB',{configurable:true,writable:true,value:factory});
 Object.defineProperty(globalThis,'IDBKeyRange',{configurable:true,writable:true,value:FakeKeyRange});
 t.after(()=>{for(const [name,descriptor] of prior){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);}});
 const seed=async(rows:Snapshot[])=>{for(const row of rows)await putSnapshot(row);};
 const observe=(options:{abortAfterFirstCursor?:boolean;valueError?:Error;setupError?:Error}={})=>{
  const ledger={versions:[] as (number|undefined)[],modes:[] as IDBTransactionMode[],ranges:[] as IDBKeyRange[],keys:[] as IDBValidKey[],valueKeys:[] as IDBValidKey[],closes:0,events:[] as string[],terminals:[] as Promise<string>[]};
  const open=factory.open.bind(factory),instrumented=new WeakSet<object>();let abortScheduled=false;
  factory.open=((...args:Parameters<typeof factory.open>)=>{
   ledger.versions.push(args[1]);const request=open(...args);
   request.addEventListener('success',()=>{
    const db=request.result,close=db.close.bind(db),transaction=db.transaction.bind(db);
    db.close=()=>{ledger.closes++;close();};
    db.transaction=((...parameters:Parameters<IDBDatabase['transaction']>)=>{
     const tx=transaction(...parameters);ledger.modes.push(parameters[1]??'readonly');
     ledger.terminals.push(new Promise(resolve=>{
      tx.addEventListener('complete',()=>{ledger.events.push('complete');resolve('complete');},{once:true});
      tx.addEventListener('abort',()=>{ledger.events.push('abort');resolve('abort');},{once:true});
     }));
     const objectStore=tx.objectStore.bind(tx);
     tx.objectStore=(name:string)=>{
      const store=objectStore(name);if(name!=='snapshots'||instrumented.has(store))return store;instrumented.add(store);
      store.getAll=(()=>{throw Error('Prefix listing must not call getAll');}) as IDBObjectStore['getAll'];
      const cursor=store.openCursor.bind(store);
      store.openCursor=((...parameters:Parameters<IDBObjectStore['openCursor']>)=>{
       if(options.setupError)throw options.setupError;
       ledger.ranges.push(parameters[0] as IDBKeyRange);const read=cursor(...parameters);
       read.addEventListener('success',()=>{
        const row=read.result;if(!row)return;ledger.keys.push(row.key);
        if(!instrumented.has(row)){
         instrumented.add(row);const descriptor=Object.getOwnPropertyDescriptor(row,'value');assert.ok(descriptor&&'value' in descriptor);
         let value=descriptor.value;
         Object.defineProperty(row,'value',{configurable:true,get(){ledger.valueKeys.push(row.key);if(options.valueError)throw options.valueError;return value;},set(next){value=next;}});
        }
        if(options.abortAfterFirstCursor&&!abortScheduled){abortScheduled=true;queueMicrotask(()=>tx.abort());}
       });
       return read;
      }) as IDBObjectStore['openCursor'];
      return store;
     };
     return tx;
    }) as IDBDatabase['transaction'];
   },{once:true});
   return request;
  }) as typeof factory.open;
  return ledger;
 };
 return {seed,observe};
}

test('Unicode prefix listing reads matching headers only, filters row scopes and stops before the first outside value',async t=>{
 const f=fixture(t),prefix='paper-ink-prefix-header|année📝|\uffff|',accountId='owner-A',spaceId='year-é';
 const header=(key:string,patch:Partial<Snapshot>={}):Snapshot=>({key,accountId,spaceId,value:{kind:'header',small:true},...patch});
 const inside=[prefix,prefix+'a',prefix+'é',prefix+'🧪'];
 const foreign=[header(prefix+'foreign-account',{accountId:'owner-B'}),header(prefix+'foreign-space',{spaceId:'year-B'})];
 const rawBefore=prefix.replace('header','chunks')+'raw',outside=prefix.slice(0,-1)+'}raw';
 await f.seed([header(rawBefore,{value:{kind:'raw',points:Array.from({length:4096},(_,i)=>({x:i,y:i,time:i}))}}),...inside.map(key=>header(key)),...foreign,header(outside,{value:{kind:'raw',mustNotRead:true}})]);
 const read=f.observe(),rows=await listSnapshotsByPrefix(accountId,spaceId,prefix);
 assert.deepEqual(rows.map(row=>row.key),inside.sort());assert.ok(rows.every(row=>row.accountId===accountId&&row.spaceId===spaceId));
 assert.deepEqual(read.valueKeys,[...inside,...foreign.map(row=>row.key)].sort());
 assert.equal(read.keys.at(-1),outside);assert.equal(read.valueKeys.includes(outside),false);assert.equal(read.keys.includes(rawBefore),false);
 assert.equal(read.ranges.length,1);assert.equal(read.ranges[0].lower,prefix);assert.equal(read.ranges[0].lowerOpen,false);assert.equal(read.ranges[0].upper,undefined);
 assert.deepEqual(read.versions,[3]);assert.deepEqual(read.modes,['readonly']);assert.equal(read.closes,1);assert.deepEqual(read.events,['complete']);
});

test('Empty and non-string prefixes reject before opening a database; a valid empty namespace completes and closes',async t=>{
 const f=fixture(t),read=f.observe();
 for(const prefix of ['',undefined,null,12])await assert.rejects(()=>listSnapshotsByPrefix('A','S',prefix as string),TypeError);
 assert.equal(read.versions.length,0);
 assert.deepEqual(await listSnapshotsByPrefix('A','S','no-match-\uffff'),[]);
 assert.deepEqual(read.modes,['readonly']);assert.equal(read.valueKeys.length,0);assert.equal(read.closes,1);assert.deepEqual(read.events,['complete']);
});

test('A real readonly transaction abort rejects instead of returning its partial headers and closes the connection',async t=>{
 const f=fixture(t),prefix='abort-prefix|';await f.seed([{key:prefix+'a',accountId:'A',spaceId:'S',value:'a'},{key:prefix+'b',accountId:'A',spaceId:'S',value:'b'}]);
 const read=f.observe({abortAfterFirstCursor:true});
 await assert.rejects(()=>listSnapshotsByPrefix('A','S',prefix));await Promise.all(read.terminals);
 assert.equal(read.closes,1);assert.deepEqual(read.events,['abort']);assert.deepEqual(read.modes,['readonly']);
});

test('An exception in cursor value processing aborts and propagates the original error without a partial result',async t=>{
 const f=fixture(t),prefix='value-error|';await f.seed([{key:prefix+'a',accountId:'A',spaceId:'S',value:'a'}]);
 const failure=Error('Synthetic cursor value processing failure'),read=f.observe({valueError:failure});
 await assert.rejects(()=>listSnapshotsByPrefix('A','S',prefix),error=>error===failure);await Promise.all(read.terminals);
 assert.equal(read.closes,1);assert.deepEqual(read.events,['abort']);assert.deepEqual(read.valueKeys,[prefix+'a']);
});

test('A synchronous cursor setup error closes the database and aborts its created transaction',async t=>{
 const f=fixture(t);await f.seed([{key:'setup|a',accountId:'A',spaceId:'S',value:'a'}]);
 const failure=Error('Synthetic cursor setup failure'),read=f.observe({setupError:failure});
 await assert.rejects(()=>listSnapshotsByPrefix('A','S','setup|'),error=>error===failure);await Promise.all(read.terminals);
 assert.equal(read.closes,1);assert.deepEqual(read.events,['abort']);assert.equal(read.valueKeys.length,0);
});
