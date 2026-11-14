import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import type {Draft,DraftKey,Snapshot,NotebookTransferCommit} from '../pwa/src/storage.ts';
import type {InkPoint,PaperDocument,PaperObject} from '../src/lib/notebookDocument.ts';
import {notebookDocumentId} from '../src/lib/notebookIdentity.ts';
import {
 PAPER_INK_PREFIX_CHUNK_POINTS,PAPER_INK_PREFIX_MAX_POINTS,
 createPaperInkPrefixJournal,appendPaperInkPrefixJournal,capturePaperInkPrefixObject,
 preparePaperInkPrefixCanonical,interruptPaperInkPrefixJournal,discardPaperInkPrefixJournal,
 confirmPaperInkPrefixCanonical,readPaperInkPrefixJournal,listPaperInkPrefixJournals,
 isPaperInkPrefixJournalHeader,paperInkPrefixJournalPrefix,paperInkPrefixJournalKey,paperInkPrefixJournalChunkKey,
 type PaperInkPrefixJournalStorage,type PaperInkPrefixMetadata,type PaperInkPrefixJournalHeader,
 type PaperInkPrefixScope,
} from '../src/lib/paperInkPrefixJournal.ts';
// The real SHA-256 primitive, for Node versions without its browser-compatible
// global. No hash, storage, DOM or device API is replaced with a fake result.
if(!globalThis.crypto?.subtle)Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});

const scope:PaperInkPrefixScope={accountId:'synthetic-owner-A',spaceId:'year|2026',noteId:'note-[A]'};
const meta=():PaperInkPrefixMetadata=>({ownerKey:'A|year|note',generation:2,pageId:'page-A',pointerType:'pen',pen:'calligraphy',createdAt:100,
 geometry:{width:800,height:1200,rotation:0,geometryKey:'pdf:0:crop'},style:{color:'#123456',width:3,opacity:.7,strokeStyle:'dotted'}});
const header=(id='stroke-1',captured:PaperInkPrefixScope=scope)=>createPaperInkPrefixJournal(captured,id,meta());
const points=(count:number,start=0):InkPoint[]=>Array.from({length:count},(_,i)=>i+start===0?{x:-1,y:30,time:10}:{x:i+start,y:i+start+30,time:i+start+10,pressure:.2,tiltX:12,tiltY:-20,twist:42});
const range=(raw:InkPoint[],from=0,to=raw.length,total=raw.length)=>({from,to,total,points:raw.slice(from,to)});
const draftKey=(id:DraftKey)=>JSON.stringify([id.accountId,id.spaceId,id.type??'note',id.documentId]);
function adapter(){
 const rows=new Map<string,Snapshot>(),drafts=new Map<string,Draft>(),plans:NotebookTransferCommit[]=[],reads:string[]=[],listRequests:string[]=[];
 let quota=false,beforeCommit:(()=>void)|undefined,onRead:((key:string)=>void)|undefined,onCommit:(()=>void)|undefined,gate:Promise<void>|undefined;
 const store:PaperInkPrefixJournalStorage={
  read:async key=>{reads.push(key);const copy=structuredClone(rows.get(key));onRead?.(key);return copy;},
  list:async(a,s,prefix)=>{listRequests.push(prefix);return [...rows.values()].filter(r=>r.accountId===a&&r.spaceId===s&&r.key.startsWith(prefix)).map(r=>structuredClone(r));},
  deletionKey:id=>`synthetic-deletion|${draftKey(id)}`,
  commit:async(plan,current)=>{
   assert.equal(plan.drafts.length,0,'The journal never publishes or recreates a canonical note');
   assert.equal(plan.blobs.length,0);assert.equal(plan.sources.length,0);
   assert.ok(current(),'A revoked current source cannot commit a canonical confirmation');
   onCommit?.();if(gate)await gate;beforeCommit?.();assert.ok(current());if(quota)throw Error('Synthetic persistent quota');
   // These checks all precede writes, as in the real atomic transfer adapter.
   for(const check of plan.draftChecks)assert.deepEqual(drafts.get(draftKey(check.identity)),check.expected,'Canonical draft changed during CAS');
   for(const check of plan.snapshotChecks)assert.deepEqual(rows.get(check.key),check.expected,'Journal destination changed during CAS');
   for(const row of plan.snapshots){assert.equal(row.accountId,plan.target.accountId);assert.equal(row.spaceId,plan.target.spaceId);assert.ok(plan.snapshotChecks.some(c=>c.key===row.key));}
   for(const row of plan.snapshots)rows.set(row.key,structuredClone(row));plans.push(structuredClone(plan));
  },
 };
 return {rows,drafts,store,plans,reads,listRequests,setQuota:(v:boolean)=>{quota=v;},race:(fn?:()=>void)=>{beforeCommit=fn;},afterRead:(fn?:((key:string)=>void))=>{onRead=fn;},observeCommit:(fn?:()=>void)=>{onCommit=fn;},hold:(promise?:Promise<void>)=>{gate=promise;}};
}
function ink(h:PaperInkPrefixJournalHeader,raw=points(h.confirmedCursor)):PaperObject{return {
 id:h.id,pageId:h.pageId,kind:'ink',x:0,y:0,width:50,height:60,rotation:0,z:1,locked:false,createdAt:h.createdAt,
 points:raw,color:h.style.color,strokeWidth:h.style.width,opacity:h.style.opacity,strokeStyle:h.style.strokeStyle,pen:h.pen,
};}
function proof(h:PaperInkPrefixJournalHeader,object=ink(h)):Draft{
 const document:PaperDocument={notebookSchema:3,noteId:h.noteId,revision:1,pages:[{id:h.pageId,...h.geometry,pattern:'plain',color:'#fff',bookmark:false}],objects:[object],assets:[],audio:[],updatedAt:'2026-10-15T10:00:00Z',legacy:{markdown:'',boardId:'legacy-synthetic',migratedAt:'2026-10-15T10:00:00Z'}};
 return {accountId:h.accountId,spaceId:h.spaceId,type:'whiteboard',documentId:notebookDocumentId(h.noteId),title:'Synthetic prefix proof',content:document,baseVersion:1,updatedAt:1,syncState:'local'};
}
async function prepared(a:ReturnType<typeof adapter>,id='prepared'){
 const source=header(id),raw=points(3),ack=await appendPaperInkPrefixJournal(source,range(raw),a.store),object=ink(ack.header,raw),descriptor=await capturePaperInkPrefixObject(object);
 const ready=await preparePaperInkPrefixCanonical(ack.header,raw.length,descriptor,a.store),saved=proof(ready,object);a.drafts.set(draftKey(saved),structuredClone(saved));return {source,raw,object,descriptor,ready,saved};
}

test('Admission captures immutable old scope/style and excludes live API, token and callbacks',()=>{
 const input=meta(),h=createPaperInkPrefixJournal({...scope,api:{private:true}} as PaperInkPrefixScope,'identity',input);
 (input.geometry as {width:number}).width=900;(input.style as {color:string}).color='red';
 assert.equal(h.geometry.width,800);assert.equal(h.style.color,'#123456');assert.equal(h.accountId,scope.accountId);
 assert.ok(Object.isFrozen(h)&&Object.isFrozen(h.geometry)&&Object.isFrozen(h.style));
 assert.equal(Object.hasOwn(h,'api'),false);assert.equal(Object.hasOwn(h,'token'),false);
 assert.equal(isPaperInkPrefixJournalHeader({...h,onCommit:()=>{}}),false);
});

test('A cursor is acknowledged only after commit; totalSeen never manufactures unconfirmed samples',async()=>{
 const a=adapter(),h=header('await-commit'),raw=points(7);let release!:()=>void,enter!:()=>void,acknowledged=false;
 raw[2].time=raw[1].time;const entered=new Promise<void>(resolve=>{enter=resolve;});a.observeCommit(()=>{enter();});
 a.hold(new Promise<void>(resolve=>{release=resolve;}));
 const work=appendPaperInkPrefixJournal(h,range(raw,0,3,7),a.store).then(ack=>{acknowledged=true;return ack;});
 await entered;assert.equal(acknowledged,false);assert.equal(a.rows.size,0);
 release();const ack=await work;a.hold();assert.equal(ack.confirmedCursor,3);assert.equal(ack.header.totalSeen,7);
 raw[1].pressure=.99;const read=await readPaperInkPrefixJournal(scope,h.id,()=>true,a.store);
 assert.equal(read.points.length,3);assert.equal(read.points[1].pressure,.2);assert.equal(Object.hasOwn(read.points[0],'pressure'),false);
 assert.equal(Object.hasOwn(read.points[0],'tiltX'),false);assert.equal(read.points[2].twist,42);assert.equal(read.points[2].time,read.points[1].time);
});

test('Long strokes use bounded chunks and do not reread or rewrite the full old prefix per checkpoint',async()=>{
 const a=adapter(),raw=points(PAPER_INK_PREFIX_CHUNK_POINTS*3+7);let h=header('bounded');
 for(let from=0;from<raw.length;from+=733){
  const before=a.reads.length,to=Math.min(raw.length,from+733);h=(await appendPaperInkPrefixJournal(h,range(raw,from,to),a.store)).header;
  const chunkReads=a.reads.slice(before).filter(key=>key.includes('|chunk-'));
  assert.ok(chunkReads.length<=2,'Checkpoint reads at most the tail and next chunk, independent of old prefix length');
  assert.ok(a.plans.at(-1)!.snapshots.length<=3,'Checkpoint writes only touched chunks and header');
 }
 assert.equal(h.chunkCount,4);assert.equal(h.confirmedCursor,raw.length);
 const loaded=await readPaperInkPrefixJournal(scope,h.id,()=>true,a.store);assert.deepEqual(loaded.points,raw);
 const firstWrites=a.plans.flatMap(p=>p.snapshots).filter(r=>r.key===paperInkPrefixJournalChunkKey(scope,h.id,0));
 assert.ok(firstWrites.length>1&&firstWrites.length<10,'A full chunk stops being rewritten once its tail closes');
});

test('Identical packets retry without writes; a divergent suffix or cursor gap cannot overwrite raw points',async()=>{
 const a=adapter(),h=header('retry'),raw=points(5);const first=await appendPaperInkPrefixJournal(h,range(raw,0,3),a.store);
 const repeated=await appendPaperInkPrefixJournal(h,range(raw,0,3),a.store);assert.equal(repeated.confirmedCursor,3);assert.equal(a.plans.length,1);
 const changed=range(raw,0,3);changed.points[1]={...changed.points[1],x:999};await assert.rejects(appendPaperInkPrefixJournal(h,changed,a.store));
 await assert.rejects(appendPaperInkPrefixJournal(first.header,range(raw,4,5),a.store));
 const last=await appendPaperInkPrefixJournal(first.header,range(raw,3,5),a.store);assert.equal(last.confirmedCursor,5);assert.equal(a.plans.length,2);
 assert.deepEqual((await readPaperInkPrefixJournal(scope,h.id,()=>true,a.store)).points,raw);
});

test('Persistent quota rejects promptly without an ACK; exact old-scope retry resumes the confirmed prefix',async()=>{
 const a=adapter(),h=header('quota'),raw=points(4);a.setQuota(true);
 await assert.rejects(appendPaperInkPrefixJournal(h,range(raw,0,2),a.store),/quota/);assert.equal(a.rows.size,0);
 a.setQuota(false);const initial=await appendPaperInkPrefixJournal(h,range(raw,0,2),a.store);a.setQuota(true);
 await assert.rejects(appendPaperInkPrefixJournal(initial.header,range(raw,2,4),a.store),/quota/);
 assert.equal((await readPaperInkPrefixJournal(scope,h.id,()=>true,a.store)).points.length,2);
 a.setQuota(false);const end=await appendPaperInkPrefixJournal(initial.header,range(raw,2,4),a.store);
 assert.equal(end.confirmedCursor,4);assert.equal(end.header.accountId,scope.accountId);assert.equal(a.plans.length,2);
 assert.equal((await listPaperInkPrefixJournals({...scope,accountId:'synthetic-owner-B'},()=>true,a.store)).length,0);
});

test('Competing tail writers commit one atomic winner and refuse the conflicting payload',async()=>{
 const a=adapter(),h=header('competing'),left=points(2),right=points(2);right[1].x=200;
 const results=await Promise.allSettled([appendPaperInkPrefixJournal(h,range(left),a.store),appendPaperInkPrefixJournal(h,range(right),a.store)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);assert.equal(a.plans.length,1);
 const loaded=await readPaperInkPrefixJournal(scope,h.id,()=>true,a.store);assert.ok(loaded.points[1].x===left[1].x||loaded.points[1].x===right[1].x);
 assert.equal(loaded.points.length,2);assert.equal(a.rows.size,2);
});

test('Malformed sensors, time order, noninteger ranges and excessive transport/capture sizes are refused',async()=>{
 const a=adapter(),h=header('malformed'),raw=points(3),bad=[
  {...range(raw),from:.5},range(raw,0,0),{...range(raw),to:4},{...range(raw),total:PAPER_INK_PREFIX_MAX_POINTS+1},
  range(points(PAPER_INK_PREFIX_CHUNK_POINTS+1)),
  {...range(raw),points:[{...raw[0],pressure:1.1},raw[1],raw[2]]},
  {...range(raw),points:[{...raw[0],x:NaN},raw[1],raw[2]]},
  {...range(raw),points:[raw[0],{...raw[1],time:9},raw[2]]},
  {...range(raw),points:[{...raw[0],deviceSecret:'no'} as InkPoint,raw[1],raw[2]]},
 ];
 for(const packet of bad)await assert.rejects(appendPaperInkPrefixJournal(h,packet,a.store));assert.equal(a.rows.size,0);
 const committed=await appendPaperInkPrefixJournal(h,range(raw),a.store);
 await assert.rejects(appendPaperInkPrefixJournal(committed.header,{from:3,to:4,total:4,points:[{x:1,y:1,time:9}]},a.store));
 assert.equal(a.plans.length,1);
});

test('Malformed metadata/header/chunks are rejected rather than loaded as a recoverable stroke',async()=>{
 for(const patch of [{pen:'laser'},{createdAt:8640000000000001},{geometry:{...meta().geometry,width:0}},{style:{...meta().style,opacity:2}}])assert.throws(()=>createPaperInkPrefixJournal(scope,'bad',{...meta(),...patch} as PaperInkPrefixMetadata));
 const a=adapter(),h=header('bad-disk'),ack=await appendPaperInkPrefixJournal(h,range(points(2)),a.store),key=paperInkPrefixJournalKey(scope,h.id);
 const good=structuredClone(a.rows.get(key)!);(a.rows.get(key)!.value as Record<string,unknown>).token={};
 assert.equal((await listPaperInkPrefixJournals(scope,()=>true,a.store)).length,0);await assert.rejects(readPaperInkPrefixJournal(scope,h.id,()=>true,a.store));a.rows.set(key,good);
 const part=a.rows.get(paperInkPrefixJournalChunkKey(scope,h.id,0))!;const goodPart=structuredClone(part);
 (part.value as Record<string,unknown>).noteId='different-note';await assert.rejects(readPaperInkPrefixJournal(scope,h.id,()=>true,a.store));a.rows.set(goodPart.key,goodPart);
 (a.rows.get(goodPart.key)!.value as {points:InkPoint[]}).points.pop();await assert.rejects(appendPaperInkPrefixJournal(ack.header,{from:2,to:3,total:3,points:points(1,2)},a.store));
});

test('Reads and mutations reject foreign note/account/incarnation; delayed current=false reads return no body',async()=>{
 const a=adapter(),h=header('scope');await appendPaperInkPrefixJournal(h,range(points(2)),a.store);
 await assert.rejects(readPaperInkPrefixJournal({...scope,noteId:'B'},h.id,()=>true,a.store));
 await assert.rejects(appendPaperInkPrefixJournal({...h,generation:3},range(points(3),2,3),a.store));
 const snapshot=a.rows.get(paperInkPrefixJournalKey(scope,h.id))!;snapshot.accountId='synthetic-owner-B';await assert.rejects(readPaperInkPrefixJournal(scope,h.id,()=>true,a.store));snapshot.accountId=scope.accountId;
 let current=true;a.afterRead(()=>{current=false;});await assert.rejects(readPaperInkPrefixJournal(scope,h.id,()=>current,a.store));
 assert.deepEqual(await listPaperInkPrefixJournals(scope,()=>false,a.store),[]);assert.equal(a.plans.length,1);
});

test('Preparation requires a fully confirmed final cursor and immutable expected object; it never authors a note',async()=>{
 const a=adapter(),raw=points(3),ack=await appendPaperInkPrefixJournal(header('prepare'),range(raw,0,2),a.store),object=ink(ack.header,raw),descriptor=await capturePaperInkPrefixObject(object);
 object.x=900;assert.notEqual((await capturePaperInkPrefixObject(object)).fingerprint,descriptor.fingerprint);assert.ok(Object.isFrozen(descriptor)&&Object.isFrozen(descriptor.style));
 await assert.rejects(preparePaperInkPrefixCanonical(ack.header,3,descriptor,a.store));
 const end=await appendPaperInkPrefixJournal(ack.header,range(raw,2,3),a.store),ready=await preparePaperInkPrefixCanonical(end.header,3,descriptor,a.store);
 assert.equal(ready.state,'prepared');assert.equal(a.drafts.size,0);const writes=a.plans.length;
 await preparePaperInkPrefixCanonical(end.header,3,descriptor,a.store);assert.equal(a.plans.length,writes);
 await assert.rejects(preparePaperInkPrefixCanonical(end.header,3,await capturePaperInkPrefixObject({...ink(end.header,raw),color:'red'}),a.store));
 await assert.rejects(capturePaperInkPrefixObject({...ink(end.header,raw),createdAt:Infinity}));
});

test('Interruption is terminal for appends and preserves a prepared expectation across a crash gap',async()=>{
 const a=adapter(),h=header('interrupt'),raw=points(3),ack=await appendPaperInkPrefixJournal(h,range(raw),a.store);
 await assert.rejects(interruptPaperInkPrefixJournal(ack.header,'pointercancel',2,a.store));
 const stopped=await interruptPaperInkPrefixJournal(ack.header,'pointercancel',3,a.store);assert.equal(stopped.state,'interrupted');
 await assert.rejects(appendPaperInkPrefixJournal(h,range(points(4),3,4),a.store));
 assert.equal((await appendPaperInkPrefixJournal(h,range(raw),a.store)).confirmedCursor,3);
 await assert.rejects(preparePaperInkPrefixCanonical(stopped,3,await capturePaperInkPrefixObject(ink(stopped,raw)),a.store));
 const b=adapter(),p=await prepared(b,'prepared-gap'),kept=await interruptPaperInkPrefixJournal(p.ready,'save-failed',3,b.store);
 assert.equal(kept.state,'prepared');assert.equal(kept.prepared!.fingerprint,p.descriptor.fingerprint);assert.equal(b.plans.length,2);
});

test('Explicit discard persists even before the first point and absorbs every late prefix without deleting raw',async()=>{
 const a=adapter(),empty=header('empty-discard'),terminal=await discardPaperInkPrefixJournal(empty,'navigation',a.store);
 assert.equal(terminal.state,'discarded');assert.equal(terminal.confirmedCursor,0);assert.equal(a.rows.size,1);
 await assert.rejects(appendPaperInkPrefixJournal(empty,range(points(1)),a.store));
 const h=header('discard-with-raw'),raw=points(2),ack=await appendPaperInkPrefixJournal(h,range(raw),a.store),before=a.rows.size;
 await discardPaperInkPrefixJournal(ack.header,'voluntary-cancel',a.store);const writes=a.plans.length;
 assert.equal(a.rows.size,before);assert.equal((await readPaperInkPrefixJournal(scope,h.id,()=>true,a.store)).points.length,2);
 assert.equal((await listPaperInkPrefixJournals(scope,()=>true,a.store)).length,0);
 await appendPaperInkPrefixJournal(h,range(raw),a.store);await discardPaperInkPrefixJournal(h,'navigation',a.store);assert.equal(a.plans.length,writes);
 const altered=points(2);altered[1].x=88;await assert.rejects(appendPaperInkPrefixJournal(h,range(altered),a.store));
 await assert.rejects(appendPaperInkPrefixJournal(h,range(points(3),2,3),a.store));
});

test('Canonical confirmation needs the exact scoped durable object/page; no late callback may recreate a note',async()=>{
 const a=adapter(),p=await prepared(a,'canonical');const before=a.plans.length;
 for(const invalid of [{...p.saved,accountId:'B'},{...p.saved,documentId:'legacy-id'},{...p.saved,identityAlias:'legacy-id'},{...p.saved,syncState:'conflict' as const},proof(p.ready,{...p.object,x:100}),{...p.saved,content:{...(p.saved.content as PaperDocument),pages:[{...(p.saved.content as PaperDocument).pages[0],width:900}]}}])await assert.rejects(confirmPaperInkPrefixCanonical(p.ready,invalid,()=>true,a.store));
 await assert.rejects(confirmPaperInkPrefixCanonical(p.ready,p.saved,()=>false,a.store));assert.equal(a.plans.length,before);
 const terminal=await confirmPaperInkPrefixCanonical(p.ready,p.saved,()=>true,a.store);assert.equal(terminal.state,'canonical');assert.equal(terminal.canonicalObjectId,p.object.id);
 const plan=a.plans.at(-1)!;assert.equal(plan.draftChecks.length,1);assert.equal(plan.snapshotChecks.length,2);assert.equal(plan.drafts.length,0);
 assert.deepEqual(a.drafts.get(draftKey(p.saved)),p.saved);assert.equal((await listPaperInkPrefixJournals(scope,()=>true,a.store)).length,0);
 const count=a.plans.length;await confirmPaperInkPrefixCanonical(p.ready,p.saved,()=>true,a.store);await discardPaperInkPrefixJournal(p.source,'late-cancel',a.store);await appendPaperInkPrefixJournal(p.source,range(p.raw),a.store);assert.equal(a.plans.length,count);
 await assert.rejects(appendPaperInkPrefixJournal(p.source,range(points(4),3,4),a.store));
});

test('Draft replacement and tombstones racing confirmation reject atomically, retaining the prepared prefix',async()=>{
 for(const mode of ['replace','delete','tombstone','revoke']){
  const a=adapter(),p=await prepared(a,`race-${mode}`);let current=true;const before=a.plans.length;
  a.race(()=>{
   if(mode==='replace')a.drafts.set(draftKey(p.saved),{...p.saved,updatedAt:2});
   if(mode==='delete')a.drafts.delete(draftKey(p.saved));
   if(mode==='tombstone'){const key=a.store.deletionKey(p.saved);a.rows.set(key,{key,accountId:scope.accountId,spaceId:scope.spaceId,value:{kind:'deleted'}});}
   if(mode==='revoke')current=false;
  });
  await assert.rejects(confirmPaperInkPrefixCanonical(p.ready,p.saved,()=>current,a.store));assert.equal(a.plans.length,before);
  assert.equal((a.rows.get(paperInkPrefixJournalKey(scope,p.ready.id))!.value as PaperInkPrefixJournalHeader).state,'prepared');
  a.race();assert.equal((await listPaperInkPrefixJournals(scope,()=>true,a.store)).length,1);
  if(mode==='tombstone')await assert.rejects(confirmPaperInkPrefixCanonical(p.ready,p.saved,()=>true,a.store));
 }
});

test('Discard wins a concurrent terminal CAS; a later valid proof cannot revive or remove that journal',async()=>{
 const a=adapter(),p=await prepared(a,'discard-race'),key=paperInkPrefixJournalKey(scope,p.ready.id);let release!:()=>void,enter!:()=>void;
 const entered=new Promise<void>(resolve=>{enter=resolve;});a.observeCommit(()=>{enter();});
 a.hold(new Promise<void>(resolve=>{release=resolve;}));const pending=confirmPaperInkPrefixCanonical(p.ready,p.saved,()=>true,a.store);
 // Wait for the real journal call to enter its held transaction. The competing
 // state models a separate transaction winning the header CAS, not a fake note.
 await entered;
 const discarded={...p.ready,revision:p.ready.revision+1,state:'discarded' as const,cause:'navigation',finalPointCount:p.ready.confirmedCursor};a.rows.set(key,{key,accountId:scope.accountId,spaceId:scope.spaceId,value:discarded});
 release();await assert.rejects(pending);a.hold();const count=a.plans.length;
 const stillDiscarded=await confirmPaperInkPrefixCanonical(p.ready,p.saved,()=>true,a.store);assert.equal(stillDiscarded.state,'discarded');assert.equal(a.plans.length,count);
 assert.deepEqual((await readPaperInkPrefixJournal(scope,p.ready.id,()=>true,a.store)).points,p.raw);
});

test('Read-only recovery refuses a header that changes while chunks are being read',async()=>{
 const a=adapter(),h=header('read-race');await appendPaperInkPrefixJournal(h,range(points(2)),a.store);const key=paperInkPrefixJournalKey(scope,h.id);
 a.afterRead(readKey=>{if(readKey.includes('|chunk-')){const value=a.rows.get(key)!.value as PaperInkPrefixJournalHeader;a.rows.set(key,{key,accountId:scope.accountId,spaceId:scope.spaceId,value:{...value,revision:value.revision+1,state:'discarded',cause:'navigation',finalPointCount:value.confirmedCursor}});a.afterRead();}});
 await assert.rejects(readPaperInkPrefixJournal(scope,h.id,()=>true,a.store),/changé/);assert.equal(a.plans.length,1);
 assert.equal((await listPaperInkPrefixJournals(scope,()=>true,a.store)).length,0);
});

test('Final SHA-256 is property-order independent while geometry, sensors, pen and style changes differ',async()=>{
 const h=header('fingerprint'),object=ink({...h,confirmedCursor:2},points(2));
 const reordered=Object.fromEntries(Object.entries(object).reverse()) as unknown as PaperObject;
 reordered.points=object.points!.map(p=>Object.fromEntries(Object.entries(p).reverse()) as unknown as InkPoint);
 const original=await capturePaperInkPrefixObject(object),same=await capturePaperInkPrefixObject(reordered);
 assert.match(original.fingerprint,/^[a-f0-9]{64}$/);assert.equal(same.fingerprint,original.fingerprint);
 for(const changed of [{...object,x:object.x+1},{...object,color:'#abcdef'},{...object,pen:'pencil' as const},{...object,points:[object.points![0],{...object.points![1],pressure:.9}]}])assert.notEqual((await capturePaperInkPrefixObject(changed)).fingerprint,original.fingerprint);
 const work=capturePaperInkPrefixObject(object);object.color='red';object.points![1].x=99;
 const captured=await work;assert.equal(captured.fingerprint,original.fingerprint);assert.equal(captured.style.color,'#123456');
 assert.equal(Object.hasOwn(captured,'points'),false);assert.equal(Object.hasOwn(captured,'expectedObjectJSON'),false);
 const a=adapter(),p=await prepared(a,'invalid-hash');
 await assert.rejects(preparePaperInkPrefixCanonical(p.ready,3,{...p.descriptor,fingerprint:'g'.repeat(64)},a.store));
 assert.equal(isPaperInkPrefixJournalHeader({...p.ready,prepared:{...p.descriptor,style:{...p.descriptor.style,width:100}}}),false);
});

test('Append captures range scalars, raw values and source metadata before the first awaited read',async()=>{
 const a=adapter(),initial=header('mutable-source'),mutable={...initial,geometry:{...initial.geometry},style:{...initial.style}},raw=points(2),packet=range(raw);
 const before=structuredClone(raw),key=paperInkPrefixJournalKey(scope,initial.id);
 a.afterRead(readKey=>{if(readKey===key){
  mutable.accountId='synthetic-owner-B';mutable.noteId='B';mutable.generation=500;mutable.geometry.width=900;mutable.style.color='red';
  packet.from=55;packet.to=88;packet.total=PAPER_INK_PREFIX_MAX_POINTS;packet.points[1].x=700;a.afterRead();
 }});
 const ack=await appendPaperInkPrefixJournal(mutable,packet,a.store);
 assert.equal(ack.confirmedCursor,2);assert.equal(ack.header.accountId,scope.accountId);assert.equal(ack.header.noteId,scope.noteId);assert.equal(ack.header.totalSeen,2);assert.equal(ack.header.geometry.width,800);
 assert.deepEqual((await readPaperInkPrefixJournal(scope,initial.id,()=>true,a.store)).points,before);
 assert.equal((await listPaperInkPrefixJournals({...scope,accountId:'synthetic-owner-B'},()=>true,a.store)).length,0);
});

test('Draft proof is captured before awaits; a caller mutation plus matching real draft change cannot consume recovery',async()=>{
 const a=adapter(),p=await prepared(a,'mutable-proof'),key=a.store.deletionKey(p.saved),count=a.plans.length;
 a.afterRead(readKey=>{if(readKey===key){
  (p.saved.content as PaperDocument).objects[0].x=400;a.drafts.set(draftKey(p.saved),structuredClone(p.saved));a.afterRead();
 }});
 await assert.rejects(confirmPaperInkPrefixCanonical(p.ready,p.saved,()=>true,a.store));
 assert.equal(a.plans.length,count);assert.equal((a.rows.get(paperInkPrefixJournalKey(scope,p.ready.id))!.value as PaperInkPrefixJournalHeader).state,'prepared');
 assert.equal((await listPaperInkPrefixJournals(scope,()=>true,a.store)).length,1);
 await assert.rejects(confirmPaperInkPrefixCanonical(p.ready,p.saved,()=>true,a.store),/attendu/);
});

test('Listing requests only the separate header namespace and its small fingerprints, never raw chunks',async()=>{
 const a=adapter(),p=await prepared(a,'header-list'),raw=points(PAPER_INK_PREFIX_CHUNK_POINTS+3),long=header('long-list');
 const first=await appendPaperInkPrefixJournal(long,range(raw,0,PAPER_INK_PREFIX_CHUNK_POINTS),a.store);
 await appendPaperInkPrefixJournal(first.header,range(raw,PAPER_INK_PREFIX_CHUNK_POINTS,raw.length),a.store);
 assert.equal(paperInkPrefixJournalChunkKey(scope,long.id,0).startsWith(paperInkPrefixJournalPrefix(scope)),false);
 const reads=a.reads.length,listed=await listPaperInkPrefixJournals(scope,()=>true,a.store);
 assert.equal(listed.length,2);assert.deepEqual(a.listRequests,[paperInkPrefixJournalPrefix(scope)]);assert.equal(a.reads.length,reads);
 assert.ok(JSON.stringify(listed.find(h=>h.id===p.ready.id)).length<2000,'Prepared header size does not scale with its raw points');
 assert.equal(Object.hasOwn(listed.find(h=>h.id===p.ready.id)!.prepared!,'expectedObjectJSON'),false);
 assert.deepEqual((await readPaperInkPrefixJournal(scope,long.id,()=>true,a.store)).points,raw);
});

test('A discard transaction winning before the first ACK rejects the late append atomically without resurrection',async()=>{
 const a=adapter(),h=header('discard-first-race');let enter!:()=>void,release!:()=>void;
 const entered=new Promise<void>(resolve=>{enter=resolve;});a.observeCommit(()=>{enter();});
 a.hold(new Promise<void>(resolve=>{release=resolve;}));const prefix=appendPaperInkPrefixJournal(h,range(points(2)),a.store);
 await entered;a.hold();a.observeCommit();const terminal=await discardPaperInkPrefixJournal(h,'navigation',a.store);
 release();await assert.rejects(prefix);assert.equal(terminal.state,'discarded');assert.equal(a.rows.size,1);assert.equal(a.plans.length,1);
 const recovered=await readPaperInkPrefixJournal(scope,h.id,()=>true,a.store);assert.equal(recovered.header.state,'discarded');assert.deepEqual(recovered.points,[]);
 assert.equal((await listPaperInkPrefixJournals(scope,()=>true,a.store)).length,0);
});

test('Normal publication cannot prepare or consume a different page even with identical page geometry',async()=>{
 const a=adapter(),h=header('same-geometry-other-page'),raw=points(2),ack=await appendPaperInkPrefixJournal(h,range(raw),a.store);
 const otherPage={...ack.header,pageId:'page-B'},object=ink(otherPage,raw),descriptor=await capturePaperInkPrefixObject(object),saved=proof(otherPage,object);
 const target=(saved.content as PaperDocument).pages[0];assert.equal(target.width,ack.header.geometry.width);assert.equal(target.height,ack.header.geometry.height);assert.equal(target.rotation,ack.header.geometry.rotation);
 await assert.rejects(preparePaperInkPrefixCanonical(ack.header,2,descriptor,a.store),/page/);
 assert.equal(a.plans.length,1);assert.equal((a.rows.get(paperInkPrefixJournalKey(scope,h.id))!.value as PaperInkPrefixJournalHeader).state,'active');
 const malformed={...ack.header,state:'prepared' as const,prepared:descriptor,finalPointCount:2};assert.equal(isPaperInkPrefixJournalHeader(malformed),false);
 a.drafts.set(draftKey(saved),saved);await assert.rejects(confirmPaperInkPrefixCanonical(malformed,saved,()=>true,a.store));assert.equal(a.plans.length,1);
});
