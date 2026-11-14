import assert from 'node:assert/strict';
import test,{type TestContext} from 'node:test';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {IDBFactory} from 'fake-indexeddb';
import {migratePaper} from '../src/lib/notebookDocument.ts';
import {getDraft,putDraft,putSnapshot,savePaperDraft,type Draft,type Snapshot} from '../pwa/src/storage.ts';

/** Real IndexedDB transactions and key cursors. The observer delegates every
 * request, follows each native terminal and can abort after a successful
 * deletion. It never substitutes the pruning result or the storage API. */
function fixture(t:TestContext){
 const factory=new IDBFactory(),prior=new Map(['indexedDB','IDBKeyRange'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 Object.defineProperty(globalThis,'indexedDB',{configurable:true,writable:true,value:factory});
 // This path must not require a browser-global IDBKeyRange implementation.
 Reflect.deleteProperty(globalThis,'IDBKeyRange');
 const opens=new Set<IDBOpenDBRequest>(),connections=new Set<IDBDatabase>(),transactions=new Set<IDBTransaction>(),terminals:Promise<void>[]=[],ledger={
  active:false,abortAfterDelete:false,aborted:false,snapshotBodies:[] as string[],cursorKeys:[] as IDBValidKey[],continueKeys:[] as IDBValidKey[],deleteKeys:[] as IDBValidKey[],successfulDeletes:[] as IDBValidKey[],snapshotPuts:[] as IDBValidKey[],draftPuts:0,keyCursors:0,saveTransactions:0,saveCompletes:0,saveAborts:0,
 };
 const nativeOpen=factory.open.bind(factory);
 factory.open=((...args:Parameters<typeof factory.open>)=>{
  const request=nativeOpen(...args);opens.add(request);
  request.addEventListener('error',()=>opens.delete(request),{once:true});
  request.addEventListener('success',()=>{
   opens.delete(request);const db=request.result,nativeClose=db.close.bind(db),nativeTransaction=db.transaction.bind(db);connections.add(db);
   db.close=()=>{nativeClose();connections.delete(db);};
   db.transaction=((...args:Parameters<IDBDatabase['transaction']>)=>{
    const tx=nativeTransaction(...args),names=Array.from(tx.objectStoreNames),observed=ledger.active&&tx.mode==='readwrite'&&names.length===2&&names.includes('drafts')&&names.includes('snapshots');
    transactions.add(tx);if(observed)ledger.saveTransactions++;
    terminals.push(new Promise(resolve=>{
     tx.addEventListener('complete',()=>{transactions.delete(tx);if(observed)ledger.saveCompletes++;resolve();},{once:true});
     tx.addEventListener('abort',()=>{transactions.delete(tx);if(observed)ledger.saveAborts++;resolve();},{once:true});
    }));
    if(observed){const objectStore=tx.objectStore.bind(tx),wrapped=new WeakSet<IDBObjectStore>();tx.objectStore=(name:string)=>{
     const store=objectStore(name);if(wrapped.has(store))return store;wrapped.add(store);
     if(name==='drafts'){const put=store.put.bind(store);store.put=((...args:Parameters<IDBObjectStore['put']>)=>{ledger.draftPuts++;return put(...args);}) as IDBObjectStore['put'];}
     if(name==='snapshots'){
      for(const method of ['get','getAll','openCursor'] as const){const read=store[method].bind(store);store[method]=((...args:unknown[])=>{ledger.snapshotBodies.push(method);return Reflect.apply(read,store,args);}) as never;}
      const put=store.put.bind(store),remove=store.delete.bind(store),keys=store.openKeyCursor.bind(store);
      store.put=((...args:Parameters<IDBObjectStore['put']>)=>{const result=put(...args);result.addEventListener('success',()=>ledger.snapshotPuts.push(result.result),{once:true});return result;}) as IDBObjectStore['put'];
      store.delete=((...args:Parameters<IDBObjectStore['delete']>)=>{ledger.deleteKeys.push(args[0] as IDBValidKey);const result=remove(...args);result.addEventListener('success',()=>{
       ledger.successfulDeletes.push(args[0] as IDBValidKey);
       if(ledger.abortAfterDelete&&!ledger.aborted){ledger.aborted=true;tx.abort();}
      },{once:true});return result;}) as IDBObjectStore['delete'];
      store.openKeyCursor=((...args:Parameters<IDBObjectStore['openKeyCursor']>)=>{
       ledger.keyCursors++;const result=keys(...args),cursors=new WeakSet<IDBCursor>();
       result.addEventListener('success',()=>{
        const cursor=result.result;if(!cursor)return;ledger.cursorKeys.push(cursor.key);
        if(!cursors.has(cursor)){cursors.add(cursor);const advance=cursor.continue.bind(cursor);cursor.continue=(target?:IDBValidKey)=>{if(target!==undefined)ledger.continueKeys.push(target);advance(target);};Object.defineProperty(cursor,'value',{configurable:true,get(){ledger.snapshotBodies.push('keyCursor.value');throw Error('A history key cursor must never read a body.');}});}
       });return result;
      }) as IDBObjectStore['openKeyCursor'];
     }return store;
    };}
    return tx;
   }) as IDBDatabase['transaction'];
  },{once:true});return request;
 }) as typeof factory.open;
 const terminal=async()=>{await Promise.all(terminals);assert.equal(opens.size,0);assert.equal(transactions.size,0);assert.equal(connections.size,0);};
 t.after(async()=>{ledger.active=false;await terminal();for(const [name,descriptor] of prior)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);});
 return {factory,ledger,terminal};
}

const exact=(actual:unknown,expected:unknown,label='The entire durable inventory remains exact')=>{if(isDeepStrictEqual(actual,expected))return;const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');assert.fail(label+'; actualSHA256='+digest(actual)+'; expectedSHA256='+digest(expected));};
const key=(draft:Draft)=>[draft.accountId,draft.spaceId,draft.type,draft.documentId].join('|');
const prefix=(draft:Draft)=>'paper-history|'+key(draft)+'|';
const currentDraft=(id:string,revision=50):Draft=>({accountId:'history-'+id+'📝',spaceId:'année-2026',type:'whiteboard',documentId:'paper-v3-'+id,title:'Exact source',content:{...migratePaper(id,'Private synthetic canonical source.',null,'2026-10-15T10:00:00.000Z'),revision},baseVersion:13,updatedAt:123,syncState:'queued'});
const history=(draft:Draft,suffix:string,value:unknown):Snapshot=>({key:prefix(draft)+suffix,accountId:draft.accountId,spaceId:draft.spaceId,value});
const nextDraft=(draft:Draft):Draft=>({...draft,baseVersion:1,updatedAt:456,content:{...(draft.content as object),revision:(draft.content as {revision:number}).revision+1,objects:(draft.content as {objects:{markdown:string}[]}).objects.map(object=>({...object,markdown:'Accepted exact new source.'}))}});

async function inventory(f:ReturnType<typeof fixture>){
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=f.factory.open('dowze-academie-pwa',3);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
 const names=['drafts','snapshots','mutations','scopedBlobs'],rows:Record<string,unknown[]>={};
 await new Promise<void>((resolve,reject)=>{const tx=db.transaction(names,'readonly');for(const name of names){const request=tx.objectStore(name).getAll();request.onsuccess=()=>{rows[name]=request.result;};}tx.oncomplete=()=>{db.close();resolve();};tx.onabort=tx.onerror=()=>{db.close();reject(tx.error??Error('Synthetic inventory interrupted.'));};});
 rows.scopedBlobs=await Promise.all((rows.scopedBlobs as {blob:Blob}[]).map(async({blob,...row})=>({...row,blobType:blob.type,blobSize:blob.size,blobSHA256:createHash('sha256').update(new Uint8Array(await blob.arrayBuffer())).digest('hex')})));
 return rows;
}
/** The old getAll -> stable localeCompare sort is the independent retention
 * oracle. Its input is the actual IDB-order durable rows, never insertion order. */
function expectedSave(before:Awaited<ReturnType<typeof inventory>>,draft:Draft,recovery?:unknown){
 const old=(before.drafts as (Draft&{key:string})[]).find(row=>row.key===key(draft)),all=new Map((before.snapshots as Snapshot[]).map(row=>[row.key,row]));
 if(old)all.set(prefix(draft)+String((old.content as {revision:number}).revision).padStart(12,'0'),history(draft,String((old.content as {revision:number}).revision).padStart(12,'0'),old.content));
 if(recovery!==undefined)all.set('paper-migration|'+key(draft),{key:'paper-migration|'+key(draft),accountId:draft.accountId,spaceId:draft.spaceId,value:recovery});
 const idbRows=[...all.values()].sort((a,b)=>indexedDB.cmp(a.key,b.key));
 const prune=new Set(idbRows.filter(row=>row.key.startsWith(prefix(draft))).sort((a,b)=>a.key.localeCompare(b.key)).slice(0,-20).map(row=>row.key));
 const stored={...draft,key:key(draft),baseVersion:Math.max(draft.baseVersion,old?.baseVersion??0),syncState:'local',...(old?.identityAlias?{identityAlias:old.identityAlias}:{})};
 const drafts=old?before.drafts.map(row=>(row as {key:string}).key===key(draft)?stored:row):[...before.drafts,stored].sort((a,b)=>indexedDB.cmp((a as {key:string}).key,(b as {key:string}).key));
 return {...before,drafts,snapshots:idbRows.filter(row=>!prune.has(row.key))};
}
async function seedExtras(draft:Draft){
 const rows:Snapshot[]=[
  {key:'000-before-entire-history-namespace',accountId:draft.accountId,spaceId:draft.spaceId,value:{bytes:Uint8Array.of(1,2,3),exact:'must not read'}},
  {key:prefix(draft).slice(0,-1),accountId:draft.accountId,spaceId:draft.spaceId,value:{notInNamespace:true}},
  history({...draft,documentId:draft.documentId+'-neighbor'},'999999999999',{sameOwnerOtherNote:true}),
  history({...draft,accountId:draft.accountId+'-foreign'},'999999999999',{foreignAccount:true}),
  history({...draft,spaceId:draft.spaceId+'-foreign'},'999999999999',{foreignSpace:true}),
  {key:'paper-migration|'+key(draft),accountId:draft.accountId,spaceId:draft.spaceId,value:{legacy:'original exact migration'}},
  {key:'paper-resolution|'+key(draft)+'|retained',accountId:draft.accountId,spaceId:draft.spaceId,value:{pendingConflict:'exact'}},
  {key:'paper-archive-pin|'+key(draft),accountId:draft.accountId,spaceId:draft.spaceId,value:{kind:'synthetic-archive-proof',references:[prefix(draft)+'000000000001'],bytes:Uint8Array.of(80,75,3,4)}},
  {key:prefix(draft).slice(0,-1)+'}first-outside',accountId:draft.accountId,spaceId:draft.spaceId,value:{mustNotRead:'outside prefix'}},
  {key:'zzz-after-all-history',accountId:draft.accountId,spaceId:draft.spaceId,value:{mustNotVisit:true}},
 ];
 for(const row of rows)await putSnapshot(row);
 const other=currentDraft('foreign-canonical');await putDraft(other);
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('dowze-academie-pwa',3);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
 await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['scopedBlobs','mutations'],'readwrite');tx.objectStore('mutations').put({...draft,id:'historical-outbox',createdAt:222,status:'pending',content:{historicalPayload:'untouched'}});tx.objectStore('scopedBlobs').put({key:draft.accountId+'|'+draft.spaceId+'|media',accountId:draft.accountId,spaceId:draft.spaceId,id:'media',documentId:draft.documentId,blob:new Blob(['Exact original retained media.'],{type:'application/octet-stream'}),status:'pending',removedFromNote:true,name:'Original.bin',createdAt:222,revision:7,sha256:'historical-proof-field'});tx.oncomplete=()=>{db.close();resolve();};tx.onabort=tx.onerror=()=>{db.close();reject(tx.error);};});
}

test('History pruning keeps exactly the old locale-sorted twenty rows and every neighboring history, archive, conflict and media proof',async t=>{
 const f=fixture(t),draft=currentDraft('mixed'),suffixes=[...Array.from({length:34},(_,i)=>String(i).padStart(12,'0')),'é','e\u0301','Å','A\u030a','同','🦉','\uffff','|identity-extra|saved'];
 await putDraft(draft);await seedExtras(draft);for(const [i,suffix] of [...suffixes].reverse().entries())await putSnapshot(history(draft,suffix,{originalIndex:i,exact:suffix,largeBody:'Retained bytes '.repeat(512)}));
 const before=await inventory(f),next=nextDraft(draft),recovery={markdown:'Original raw source',legacy:{full:'original historical input'},migratedAt:'2026-10-15T10:00:00.000Z'},expected=expectedSave(before,next,recovery);
 f.ledger.active=true;await savePaperDraft(next,50,recovery);await f.terminal();f.ledger.active=false;
 exact(await inventory(f),expected,'The entire store inventory must match the previous retention policy, not only its row count');assert.equal((expected.snapshots as Snapshot[]).filter(row=>row.key.startsWith(prefix(draft))).length,20);
 assert.equal(f.ledger.saveTransactions,1);assert.equal(f.ledger.saveCompletes,1);assert.equal(f.ledger.saveAborts,0);assert.equal((await getDraft(draft))?.baseVersion,13);assert.deepEqual(next,nextDraft(draft),'Pruning must not mutate the caller\'s accepted source');
});

test('Canonical-equivalent Unicode key ties retain the last IDB-order rows of the old stable sort',async t=>{
 const f=fixture(t),draft=currentDraft('unicode'),marks=['\u0301','\u0327','\u0315','\u0323'];
 const permutations=(items:string[]):string[][]=>items.length?items.flatMap((item,i)=>permutations(items.filter((_,n)=>i!==n)).map(rest=>[item,...rest])):[[]];
 const suffixes=permutations(marks).map(order=>'a'+order.join(''));
 assert.equal(new Set(suffixes).size,24);assert.equal(new Set(suffixes.map(value=>value.normalize('NFD'))).size,1);assert.ok(suffixes.every(value=>value.localeCompare(suffixes[0])===0),'The fixture must exercise real localeCompare equality');
 await putDraft(draft);await seedExtras(draft);for(const suffix of [...suffixes].reverse())await putSnapshot(history(draft,suffix,{originalKey:suffix,exact:'Each IDB tie body stays paired with its key'}));
 const before=await inventory(f),expected=expectedSave(before,nextDraft(draft));f.ledger.active=true;await savePaperDraft(nextDraft(draft),50);await f.terminal();f.ledger.active=false;
 exact(await inventory(f),expected);
 const idbTies=(before.snapshots as Snapshot[]).filter(row=>suffixes.some(suffix=>row.key===prefix(draft)+suffix));assert.deepEqual((expected.snapshots as Snapshot[]).filter(row=>row.key.startsWith(prefix(draft))).map(row=>row.key),idbTies.slice(-20).map(row=>row.key),'Equal locale keys retain the latest native IDB keys rather than the first twenty');
});

test('The real prune traverses only keys, jumps to the exact prefix and stops on its first outside key without history body reads',async t=>{
 const f=fixture(t),draft=currentDraft('key-only');await putDraft(draft);await seedExtras(draft);for(let i=0;i<45;i++)await putSnapshot(history(draft,String(i).padStart(12,'0'),{largePrivateBody:'Canonical historical media graph '.repeat(4096),i}));
 const before=await inventory(f),expected=expectedSave(before,nextDraft(draft));f.ledger.active=true;await savePaperDraft(nextDraft(draft),50);await f.terminal();f.ledger.active=false;
 exact(await inventory(f),expected);assert.deepEqual(f.ledger.snapshotBodies,[],'No getAll, get, value cursor or key-cursor value may clone a history body');assert.equal(f.ledger.keyCursors,1);assert.deepEqual(f.ledger.continueKeys,[prefix(draft)],'One native continue(prefix) skips every preceding namespace');
 assert.equal(f.ledger.cursorKeys[0],'000-before-entire-history-namespace');const inside=f.ledger.cursorKeys.slice(1,-1);assert.ok(inside.every(value=>typeof value==='string'&&value.startsWith(prefix(draft))));assert.equal(inside.length,46,'Every target history key, including this save\'s new history, is considered once');assert.equal(f.ledger.cursorKeys.at(-1),prefix(draft).slice(0,-1)+'}first-outside');assert.equal(f.ledger.cursorKeys.includes('zzz-after-all-history'),false);assert.equal(globalThis.IDBKeyRange,undefined);
});

test('Conflict and revision CAS refusals do not start pruning or change any durable source',async t=>{
 const f=fixture(t);let aborted=0;for(const variant of ['conflict','revision'] as const){const draft={...currentDraft(variant),...(variant==='conflict'?{syncState:'conflict' as const,conflict:{version:14,exact:'server contribution'}}:{})};await putDraft(draft);await seedExtras(draft);for(let i=0;i<24;i++)await putSnapshot(history(draft,String(i),{exact:i}));const before=await inventory(f);f.ledger.active=true;
  await assert.rejects(()=>savePaperDraft(nextDraft(draft),variant==='revision'?49:50),/modifiée ailleurs/);await f.terminal();f.ledger.active=false;exact(await inventory(f),before);assert.equal(f.ledger.keyCursors,0);assert.deepEqual(f.ledger.snapshotBodies,[]);assert.deepEqual(f.ledger.deleteKeys,[]);assert.equal(f.ledger.draftPuts,0);assert.equal(f.ledger.saveAborts,++aborted);
 }
});

test('A native abort after a successful history deletion rolls back the new draft, migration, inserted history and every prune together',async t=>{
 const f=fixture(t),draft=currentDraft('abort');await putDraft(draft);await seedExtras(draft);for(let i=0;i<45;i++)await putSnapshot(history(draft,String(i).padStart(12,'0'),{original:i}));const before=await inventory(f),next=nextDraft(draft);f.ledger.active=true;f.ledger.abortAfterDelete=true;
 await assert.rejects(()=>savePaperDraft(next,50,{exact:'Synthetic new migration must roll back'}));await f.terminal();f.ledger.active=false;
 assert.equal(f.ledger.aborted,true);assert.ok(f.ledger.successfulDeletes.length>0,'A real deletion request succeeded before the native transaction was aborted');assert.ok(f.ledger.snapshotPuts.includes(prefix(draft)+'000000000050'));assert.ok(f.ledger.snapshotPuts.includes('paper-migration|'+key(draft)));assert.equal(f.ledger.draftPuts,1);assert.equal(f.ledger.saveAborts,1);assert.equal(f.ledger.saveCompletes,0);exact(await inventory(f),before,'No accepted draft/history/recovery/media/outbox contribution is lost to partial pruning');
});

test('A first save with no previous draft still prunes its exact existing namespace without creating an invented previous revision',async t=>{
 const f=fixture(t),draft=currentDraft('first-save',0);await seedExtras(draft);for(let i=0;i<23;i++)await putSnapshot(history(draft,String(i).padStart(12,'0'),{retained:i}));const before=await inventory(f),expected=expectedSave(before,draft);f.ledger.active=true;await savePaperDraft(draft,null);await f.terminal();f.ledger.active=false;
 exact(await inventory(f),expected);assert.equal(f.ledger.snapshotPuts.length,0);assert.deepEqual(f.ledger.snapshotBodies,[]);assert.equal(f.ledger.saveCompletes,1);
});
