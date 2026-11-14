import test from 'node:test';
import assert from 'node:assert/strict';
import {notebookDocumentId} from '../src/lib/notebookIdentity.ts';
import {preparePaperInterruptedInk,preservePaperInterruptedInk,readPaperInterruptedInk,listPaperInterruptedInk,markPaperInterruptedInkRestored,paperInkRecoveryReceiptKey,recoveredInkObject,planPaperInterruptedInkRestore,PAPER_INK_RECOVERY_CHUNK_POINTS,type PaperInkRecoveryStorage,type PaperInkRecoveryScope} from '../src/lib/paperInterruptedInk.ts';
import type {PaperPageInkInterruption} from '../src/hooks/usePaperPageInkController.ts';
const scope={accountId:'owner-A',spaceId:'year|2026',noteId:'note-[A]'};
function input(count=2):PaperPageInkInterruption{return {ownerKey:'A|year|note',generation:1,api:{},pageId:'page-B',token:{},pointerId:9,pointerType:'pen',admitted:true,wholeEraser:false,cancellation:{cause:'pointercancel',disposition:'preserve-ink'},geometry:{id:'page-B',width:800,height:1200,rotation:0,geometryKey:'pdf:0:crop'},style:{color:'#123456',width:3,opacity:.7,strokeStyle:'dotted'},stroke:{pointerId:9,pointerType:'pen',intent:'calligraphy',eraserButton:false,context:{ownershipKey:'A|year|note',generation:1,pageId:'page-B',pageWidth:800,pageHeight:1200,pageRotation:0,clientRect:{left:10,top:20,width:400,height:600},intent:'calligraphy'},points:Array.from({length:count},(_,i)=>i===0?{x:-1,y:30,time:10}:{x:i,y:i+30,time:i+10,pressure:.2,tiltX:12,tiltY:-20,twist:42})}};}
function adapter(){
 const rows=new Map<string,any>();let commits=0,quota=false,mutate:undefined|(()=>void);const drafts=new Map<string,any>();
 const store:PaperInkRecoveryStorage={read:async key=>structuredClone(rows.get(key)),list:async(a,s)=>[...rows.values()].filter(r=>r.accountId===a&&r.spaceId===s).map(r=>structuredClone(r)),commit:async(plan,current)=>{
  assert.equal(plan.drafts.length,0);assert.equal(plan.blobs.length,0);assert.ok(current());mutate?.();if(quota)throw Error('quota');
  for(const check of plan.draftChecks)assert.deepEqual(drafts.get(check.identity.documentId),check.expected,'Canonical copy must remain the same in receipt CAS');
  for(const check of plan.snapshotChecks)assert.deepEqual(rows.get(check.key),check.expected,'CAS checks must cover each receipt destination');
  for(const row of plan.snapshots)assert.equal(row.accountId,plan.target.accountId);for(const row of plan.snapshots)rows.set(row.key,structuredClone(row));commits++;
 }};
 return {rows,drafts,store,commits:()=>commits,setQuota:(value:boolean)=>{quota=value;},race:(fn:()=>void)=>{mutate=fn;}};
}
test('A receipt consumed while chunks are read is refused instead of returning a stale available copy',async()=>{
 const a=adapter(),prepared=preparePaperInterruptedInk(scope,'read-race',input(),100);await preservePaperInterruptedInk(prepared,a.store);
 const read=a.store.read;a.store.read=async key=>{const value=await read(key);if(key.includes('|chunk-')){const header=a.rows.get(paperInkRecoveryReceiptKey(scope,'read-race'));header.value={...header.value,state:'restored',restoredObjectId:'read-race-recovered'};}return value;};
 await assert.rejects(readPaperInterruptedInk(scope,'read-race',()=>true,a.store),/changé pendant sa lecture/);
 assert.equal(a.rows.get(paperInkRecoveryReceiptKey(scope,'read-race')).value.state,'restored');assert.equal(a.rows.size,2);
});
test('Materializing a prefix receipt atomically refuses a concurrent terminal source before any new chunk is written',async()=>{
 const a=adapter(),prepared=preparePaperInterruptedInk(scope,'prefix-race',input(),100),source={key:'synthetic-prefix-source',accountId:scope.accountId,spaceId:scope.spaceId,value:{revision:1,state:'active'}};a.rows.set(source.key,structuredClone(source));
 a.race(()=>{a.rows.get(source.key).value={revision:2,state:'discarded'};});
 await assert.rejects(preservePaperInterruptedInk(prepared,a.store,{current:()=>true,snapshotChecks:[{key:source.key,expected:source}]}),/CAS/);
 assert.equal(a.commits(),0);assert.equal(a.rows.size,1);assert.equal(a.rows.get(source.key).value.state,'discarded');assert.equal(a.rows.has(paperInkRecoveryReceiptKey(scope,'prefix-race')),false);
});
test('Interruption captures old ownership, raw absent sensors and immutable styles without API/callbacks',()=>{
 const source=input(),p=preparePaperInterruptedInk(scope,'stroke-1',source,100);source.stroke!.points[1].pressure=.9;(source as {style:{color:string;width:number;opacity:number}}).style={color:'red',width:8,opacity:1};
 assert.equal(p.chunks[0].points[1].pressure,.2);assert.equal(Object.hasOwn(p.chunks[0].points[0],'pressure'),false);assert.equal(p.receipt.style.color,'#123456');assert.equal(p.receipt.geometry.geometryKey,'pdf:0:crop');assert.equal(p.receipt.accountId,'owner-A');assert.equal(p.receipt.cause,'pointercancel');assert.equal(Object.hasOwn(p.receipt,'api'),false);assert.equal(Object.hasOwn(p.receipt,'token'),false);assert.ok(Object.isFrozen(p.chunks[0].points[0]));
});
test('No recovery body is manufactured for rejected palm/initial admission or deliberate discard and non-ink gestures',()=>{
 for(const patch of [{admitted:false},{cancellation:{cause:'navigation',disposition:'discard'}},...['eraser','lasso','select','laser'].map(intent=>({stroke:{...input().stroke!,intent}}))])assert.throws(()=>preparePaperInterruptedInk(scope,'bad',{...input(),...patch} as PaperPageInkInterruption));
});
test('Raw long strokes are chunked exactly and atomically, with no arbitrary simplification or canonical mutation',async()=>{
 const a=adapter(),source=input(PAPER_INK_RECOVERY_CHUNK_POINTS*2+3),p=preparePaperInterruptedInk(scope,'long',source,100);assert.equal(p.chunks.length,3);assert.equal(p.chunks[2].points.length,3);
 await preservePaperInterruptedInk(p,a.store);const loaded=await readPaperInterruptedInk(scope,'long',()=>true,a.store);assert.deepEqual(loaded.points,source.stroke!.points);assert.equal(a.rows.size,4);assert.equal(a.commits(),1);
});
test('Same interrupted admission retries idempotently; a same-ID different body or account is refused',async()=>{
 const a=adapter(),p=preparePaperInterruptedInk(scope,'one',input(),100);await preservePaperInterruptedInk(p,a.store);await preservePaperInterruptedInk(p,a.store);assert.equal(a.commits(),1);
 const changed=input();changed.stroke!.points[1].x=999;await assert.rejects(preservePaperInterruptedInk(preparePaperInterruptedInk(scope,'one',changed,100),a.store));assert.equal(a.commits(),1);
 a.rows.get(paperInkRecoveryReceiptKey(scope,'one')).accountId='owner-B';await assert.rejects(preservePaperInterruptedInk(p,a.store));
});
test('Quota or a concurrent destination change leaves all writes absent; retry keeps captured old scope',async()=>{
 const a=adapter(),p=preparePaperInterruptedInk(scope,'retry',input(),100);a.setQuota(true);await assert.rejects(preservePaperInterruptedInk(p,a.store));assert.equal(a.rows.size,0);a.setQuota(false);await preservePaperInterruptedInk(p,a.store);assert.equal(a.rows.size,2);assert.equal((await listPaperInterruptedInk({...scope,accountId:'owner-B'},()=>true,a.store)).length,0);
 const b=adapter();b.race(()=>{b.rows.set(paperInkRecoveryReceiptKey(scope,'retry'),{key:paperInkRecoveryReceiptKey(scope,'retry'),accountId:scope.accountId,spaceId:scope.spaceId,value:{foreign:true}});});await assert.rejects(preservePaperInterruptedInk(p,b.store));assert.equal(b.rows.size,1);
});
test('Late reads after note change and missing/corrupt chunks cannot restore or replace another scope',async()=>{
 const a=adapter(),p=preparePaperInterruptedInk(scope,'read',input(),100);await preservePaperInterruptedInk(p,a.store);await assert.rejects(readPaperInterruptedInk({...scope,noteId:'B'},'read',()=>true,a.store));await assert.rejects(readPaperInterruptedInk(scope,'read',()=>false,a.store));
 const key=[...a.rows.keys()].find(k=>k.includes('chunk-'))!;a.rows.get(key).value.points.pop();await assert.rejects(readPaperInterruptedInk(scope,'read',()=>true,a.store));a.rows.delete(key);await assert.rejects(readPaperInterruptedInk(scope,'read',()=>true,a.store));
});
test('Explicit restored marker hides the receipt but preserves exact raw chunks and retry identity',async()=>{
 const a=adapter(),source=input(),p=preparePaperInterruptedInk(scope,'recover',source,100);await preservePaperInterruptedInk(p,a.store);const read=await readPaperInterruptedInk(scope,'recover',()=>true,a.store),object=recoveredInkObject(read.receipt,read.points,'page-B',3);assert.equal(object.id,'recover');assert.deepEqual(object.points,source.stroke!.points);const proof={...scope,type:'whiteboard' as const,documentId:notebookDocumentId(scope.noteId),title:'Recovery fixture',content:{...restoreDocument(),objects:[object]},baseVersion:1,updatedAt:1,syncState:'local' as const};a.drafts.set(proof.documentId,proof);
 await assert.rejects(markPaperInterruptedInkRestored(scope,'recover',object,proof,()=>false,a.store));assert.equal((await listPaperInterruptedInk(scope,()=>true,a.store)).length,1);await markPaperInterruptedInkRestored(scope,'recover',object,proof,()=>true,a.store);await markPaperInterruptedInkRestored(scope,'recover',object,proof,()=>true,a.store);assert.equal((await listPaperInterruptedInk(scope,()=>true,a.store)).length,0);assert.deepEqual((await readPaperInterruptedInk(scope,'recover',()=>true,a.store)).points,source.stroke!.points);assert.equal(a.rows.size,2);await preservePaperInterruptedInk(p,a.store);assert.equal((await listPaperInterruptedInk(scope,()=>true,a.store)).length,0);a.rows.delete([...a.rows.keys()].find(k=>k.includes('chunk-'))!);await preservePaperInterruptedInk(p,a.store);assert.equal(a.rows.get(paperInkRecoveryReceiptKey(scope,'recover')).value.state,'restored');assert.equal((await listPaperInterruptedInk(scope,()=>true,a.store)).length,0);
});

const restoreDocument=()=>({notebookSchema:3 as const,noteId:scope.noteId,revision:1,pages:[{id:'page-B',width:800,height:1200,rotation:0,pattern:'plain' as const,color:'#fff',bookmark:false}],objects:[],assets:[],audio:[],updatedAt:'2026-10-14T10:00:00Z'});
test('Explicit restoration uses a stable copy and never recreates a deleted original page silently',()=>{
 const p=preparePaperInterruptedInk(scope,'restore',input(),100),points=input().stroke!.points,document=restoreDocument(),original=planPaperInterruptedInkRestore(document,p.receipt,points,'original');
 assert.equal(original.object.id,'restore-recovered');assert.equal(original.pageId,'page-B');assert.deepEqual(original.object.points,points);assert.equal(document.objects.length,0);
 assert.throws(()=>planPaperInterruptedInkRestore({...document,noteId:'other'},p.receipt,points,'original'));
 const removed={...document,pages:[]};assert.throws(()=>planPaperInterruptedInkRestore(removed,p.receipt,points,'original'));
 const copy=planPaperInterruptedInkRestore(removed,p.receipt,points,'new-page');assert.equal(copy.pageId,'restore-recovered-page');assert.equal(copy.command!.type,'batch');assert.equal((copy.command as any).commands[0].type,'insert-page');assert.equal((copy.command as any).commands[0].page.height,1200);assert.throws(()=>planPaperInterruptedInkRestore({...document,pages:[{...document.pages[0],id:copy.pageId}]},p.receipt,points,'new-page'));
});
test('Retry after canonical restore does not duplicate or overwrite an edited recovery object',()=>{
 const p=preparePaperInterruptedInk(scope,'retry-restore',input(),100),points=input().stroke!.points,document=restoreDocument(),first=planPaperInterruptedInkRestore(document,p.receipt,points,'original');
 const restored={...document,objects:[first.object]};assert.equal(planPaperInterruptedInkRestore(restored,p.receipt,points,'original').command,null);
 assert.throws(()=>planPaperInterruptedInkRestore({...restored,objects:[{...first.object,x:10}]},p.receipt,points,'original'));
 assert.throws(()=>planPaperInterruptedInkRestore({...document,pages:[{...document.pages[0],rotation:90}]},p.receipt,points,'original'));
});
test('A miskeyed receipt is neither listed nor restored and cannot acquire another identity',async()=>{
 const a=adapter(),p=preparePaperInterruptedInk(scope,'miskey',input(),100);await preservePaperInterruptedInk(p,a.store);a.rows.get(paperInkRecoveryReceiptKey(scope,'miskey')).value.id='foreign';
 assert.equal((await listPaperInterruptedInk(scope,()=>true,a.store)).length,0);await assert.rejects(readPaperInterruptedInk(scope,'miskey',()=>true,a.store));await assert.rejects(markPaperInterruptedInkRestored(scope,'miskey',{id:'object'} as any,{accountId:scope.accountId} as any,()=>true,a.store));
});

test('Recovery consumption CAS protects against a concurrent deletion or replacement of the durable canonical copy',async()=>{
 const a=adapter(),source=input(),p=preparePaperInterruptedInk(scope,'cross-tab',source,100);await preservePaperInterruptedInk(p,a.store);
 const object=planPaperInterruptedInkRestore(restoreDocument(),p.receipt,source.stroke!.points,'original').object,proof={...scope,type:'whiteboard' as const,documentId:notebookDocumentId(scope.noteId),title:'Recovery fixture',content:{...restoreDocument(),objects:[object]},baseVersion:1,updatedAt:1,syncState:'local' as const};
 a.drafts.set(proof.documentId,proof);a.race(()=>a.drafts.delete(proof.documentId));await assert.rejects(markPaperInterruptedInkRestored(scope,p.receipt.id,object,proof,()=>true,a.store));assert.equal((await listPaperInterruptedInk(scope,()=>true,a.store)).length,1);a.race(()=>{});a.drafts.set(proof.documentId,proof);await markPaperInterruptedInkRestored(scope,p.receipt.id,object,proof,()=>true,a.store);assert.equal((await listPaperInterruptedInk(scope,()=>true,a.store)).length,0);
});

test('A note tombstone appearing before receipt consumption leaves the recovery available without resurrection',async()=>{
 const a=adapter(),source=input(),p=preparePaperInterruptedInk(scope,'tombstone',source,100);await preservePaperInterruptedInk(p,a.store);
 const object=planPaperInterruptedInkRestore(restoreDocument(),p.receipt,source.stroke!.points,'original').object,proof={...scope,type:'whiteboard' as const,documentId:notebookDocumentId(scope.noteId),title:'Recovery fixture',content:{...restoreDocument(),objects:[object]},baseVersion:1,updatedAt:1,syncState:'local' as const};a.drafts.set(proof.documentId,proof);
 const key=`paper-canonical-deletion|${scope.accountId}|${scope.spaceId}|whiteboard|${proof.documentId}`;a.race(()=>a.rows.set(key,{key,accountId:scope.accountId,spaceId:scope.spaceId,value:{kind:'server-deletion'}}));await assert.rejects(markPaperInterruptedInkRestored(scope,p.receipt.id,object,proof,()=>true,a.store));assert.equal((await listPaperInterruptedInk(scope,()=>true,a.store)).length,1);a.race(()=>{});await assert.rejects(markPaperInterruptedInkRestored(scope,p.receipt.id,object,proof,()=>true,a.store));
});
