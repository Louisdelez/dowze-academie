import test from 'node:test';
import assert from 'node:assert/strict';
import {createPaperPageInputSession,type PaperPageInputAuthority,type PaperPageInputCaptureTarget,type PaperPageInputPin,type PaperPageInputView} from '../src/lib/paperPageInputSession.ts';
import type {PaperInkEvent} from '../src/lib/paperInkInput.ts';

const event=(patch:Partial<PaperInkEvent>={}):PaperInkEvent=>({pointerId:9,pointerType:'pen',isPrimary:true,clientX:120,clientY:230,timeStamp:100,pressure:.2,tiltX:10,tiltY:-20,twist:45,button:0,buttons:1,...patch});
const view=():PaperPageInputView=>({clientRect:{left:100,top:200,width:400,height:550}});
const deferred=()=>{let resolve!:()=>void,reject!:(error:Error)=>void;const promise=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function fixture(onCancelled?:(result:import('../src/lib/paperPageInputSession.ts').PaperPageInputResult)=>void|PromiseLike<void>,onCancellationState?:import('../src/lib/paperPageInputSession.ts').PaperPageInputSessionOptions['onCancellationState']){
 const api={},authority:PaperPageInputAuthority={ownershipKey:'account|space|note',generation:1,api,writable:true,page:{id:'page-B',width:800,height:1100,rotation:0,geometryKey:'pdf:0:crop:full'}};
 const log:string[]=[],pins=new Set<PaperPageInputPin>(),captures=new Set<number>();let cancels=0;
 const captureTarget:PaperPageInputCaptureTarget={setPointerCapture:id=>{captures.add(id);log.push(`capture:${id}`);},releasePointerCapture:id=>{captures.delete(id);log.push(`release:${id}`);}};
 const session=createPaperPageInputSession({pageId:'page-B',getAuthority:()=>authority,pinPage:pin=>{pins.add(pin);log.push(`pin:${pin.pageId}`);return()=>{assert.equal(pins.delete(pin),true);log.push(`unpin:${pin.pageId}`);};},onCancelled:result=>{cancels++;return onCancelled?.(result);},onCancellationState});
 const begin=(patch:Partial<PaperInkEvent>={})=>session.begin(event(patch),{view:view(),intent:'pen',captureTarget});
 return {api,authority,log,pins,captures,captureTarget,session,begin,cancels:()=>cancels};
}

test('First sample belongs to touched page B before toolbar selection and survives unrelated document revisions',async()=>{
 const f=fixture(),canonical={revision:1,toolbarPage:'page-A',objects:[] as object[]},before=structuredClone(canonical);
 const start=f.begin();assert.equal(start.status,'started');assert.equal(start.stroke!.context.pageId,'page-B');assert.deepEqual(f.log,['pin:page-B','capture:9']);
 canonical.toolbarPage='page-B';canonical.revision++;f.log.push('toolbar:page-B');
 // Cloning this page after another page changes must not make its authority stale.
 f.authority.page={...f.authority.page!};assert.equal(f.session.syncAuthority(),null);
 assert.equal(f.session.append(event({clientX:140,timeStamp:120}),view()).status,'updated');
 const result=f.session.finish(event({clientX:150,timeStamp:130,buttons:0}),view());assert.equal(result.status,'finished');assert.deepEqual(result.stroke!.points.map(p=>[p.x,p.y,p.time]),[[40,60,100],[80,60,120],[100,60,130]]);
 assert.equal(f.captures.size,0);assert.equal(f.pins.size,1);assert.equal(f.session.state().phase,'finished');
 const gate=deferred();let committedPage='';const settling=result.lease!.settle(async current=>{assert.equal(current(),true);committedPage=result.stroke!.context.pageId;await gate.promise;});
 assert.equal(committedPage,'page-B');assert.equal(f.session.state().phase,'settling');assert.equal(f.pins.size,1);assert.equal(f.begin().reason,'settling');gate.resolve();assert.equal(await settling,true);
 assert.equal(f.pins.size,0);assert.equal(f.session.state().phase,'idle');assert.equal(result.lease!.current(),false);assert.deepEqual(canonical.objects,before.objects);
});

test('An exact operation reader remains usable for old-owner recovery and closes before a new operation can be read',async()=>{
 const gate=deferred(),f=fixture(()=>gate.promise);assert.equal(f.session.capturePointReader(),null);f.begin();
 const reader=f.session.capturePointReader()!;f.session.append(event({clientX:140,timeStamp:120}),view());
 f.authority.ownershipKey='new-owner';f.authority.api={};f.authority.generation=2;f.session.syncAuthority();
 assert.equal(f.session.state().phase,'preserving');assert.equal(reader.totalCapturedCount(),2);
 assert.equal(reader.context.ownershipKey,'account|space|note');assert.deepEqual(reader.readPointRange(0,4096)!.points.map(p=>p.x),[40,80]);
 assert.equal(f.begin({timeStamp:300}).reason,'settling');
 gate.resolve();await f.session.whenCancelled();assert.equal(reader.totalCapturedCount(),null);assert.equal(reader.readPointRange(0,1),null);
 assert.equal(f.begin({timeStamp:400,clientX:180}).accepted,true);const fresh=f.session.capturePointReader()!;
 assert.equal(fresh.totalCapturedCount(),1);assert.equal(fresh.context.ownershipKey,'new-owner');assert.equal(reader.readPointRange(0,4096),null);f.session.cancel();
});

test('Finished operation readers retain the final endpoint only until settlement; unadmitted captures expose no reader',async()=>{
 const f=fixture();f.begin();const reader=f.session.capturePointReader()!,result=f.session.finish(event({clientX:150,timeStamp:140,buttons:0}),view());
 assert.equal(reader.totalCapturedCount(),2);assert.deepEqual(reader.readPointRange(1,4096)!.points.map(p=>[p.x,p.time]),[[100,140]]);
 const gate=deferred(),pending=result.lease!.settle(()=>gate.promise);assert.equal(reader.totalCapturedCount(),2);
 gate.resolve();assert.equal(await pending,true);assert.equal(reader.totalCapturedCount(),null);assert.equal(reader.readPointRange(0,4096),null);
 const failed=fixture();failed.captureTarget.setPointerCapture=()=>{throw Error('Capture failed');};failed.begin();assert.equal(failed.session.capturePointReader(),null);
});

test('A thrown accepted work rejects with its original error only after the complete old-owner buffer is preserved',async()=>{
 const durable=deferred(),rows:import('../src/lib/paperPageInputSession.ts').PaperPageInputResult[]=[];
 const f=fixture(result=>{rows.push(result);return durable.promise;});f.begin();const reader=f.session.capturePointReader()!;
 f.session.append(event({clientX:140,timeStamp:120,pressure:.8}),view());
 const result=f.session.finish(event({clientX:150,timeStamp:140,buttons:0}),view()),failure=Error('Original canonical failure');
 let settled=false;const task=result.lease!.settle(()=>{throw failure;}),observed=task.then(()=>assert.fail('A rejected canonical work cannot become a successful lease'),error=>{settled=true;assert.equal(error,failure);});
 assert.equal(rows.length,1);assert.deepEqual(rows[0].cancellation,{cause:'save-failed',disposition:'preserve-ink'});assert.equal(rows[0].admitted,true);
 assert.deepEqual(rows[0].stroke!.points.map(p=>[p.x,p.time,p.pressure]),[[40,100,.2],[80,120,.8],[100,140,.2]]);
 assert.equal(f.pins.size,1);assert.equal(f.session.state().phase,'preserving');assert.equal(reader.totalCapturedCount(),3);assert.equal(settled,false);
 f.authority.ownershipKey='owner-B';f.authority.api={};f.authority.generation=2;f.session.syncAuthority();
 assert.equal(result.lease!.current(),false);assert.equal(f.begin({timeStamp:300}).reason,'settling');assert.equal(rows.length,1);
 assert.equal(reader.context.ownershipKey,'account|space|note');assert.equal(reader.readPointRange(1,4096)!.points.length,2);
 durable.resolve();await observed;assert.equal(settled,true);assert.equal(f.pins.size,0);assert.equal(reader.totalCapturedCount(),null);assert.equal(reader.readPointRange(0,1),null);
 assert.equal(f.begin({timeStamp:400,clientX:180}).accepted,true);assert.equal(f.session.capturePointReader()!.context.ownershipKey,'owner-B');assert.equal(reader.readPointRange(0,4096),null);f.session.cancel();
});

test('Rejected accepted work and failed preservation retain the exact reader and pin through ABA until explicit durable retry',async()=>{
 const child=deferred(),first=deferred(),retry=deferred(),rows:import('../src/lib/paperPageInputSession.ts').PaperPageInputResult[]=[];
 const f=fixture(result=>{rows.push(result);return rows.length===1?first.promise:retry.promise;});const oldOwner=f.authority.ownershipKey,oldApi=f.authority.api;
 f.begin();const reader=f.session.capturePointReader()!,result=f.session.finish(event({clientX:150,timeStamp:140,buttons:0}),view());
 const workFailure=Error('Accepted write rejected'),quota=Error('Recovery quota failure'),task=result.lease!.settle(()=>child.promise),rejected=assert.rejects(task,error=>error===workFailure);
 child.reject(workFailure);await Promise.resolve();await Promise.resolve();assert.equal(rows.length,1);assert.equal(reader.totalCapturedCount(),2);assert.equal(f.pins.size,1);
 first.reject(quota);await rejected;await assert.rejects(f.session.whenCancelled(),error=>error===quota);
 assert.equal(f.session.state().phase,'blocked');assert.equal(f.session.state().cancellationError,quota);assert.equal(f.pins.size,1);assert.equal(reader.totalCapturedCount(),2);
 f.authority.ownershipKey='owner-B';f.authority.api={};f.authority.generation=2;f.session.syncAuthority();f.authority.ownershipKey=oldOwner;f.authority.api=oldApi;f.authority.generation=3;f.session.syncAuthority();
 assert.equal(result.lease!.current(),false);assert.equal(f.begin({timeStamp:300}).reason,'settling');assert.equal(result.lease!.settle(),task);
 assert.deepEqual(reader.readPointRange(0,4096)!.points.map(p=>[p.x,p.time]),[[40,100],[100,140]]);
 const preserving=f.session.retryCancellation();assert.equal(rows.length,2);assert.equal(rows[1],rows[0]);assert.equal(rows[1].stroke!.context.generation,1);assert.equal(reader.totalCapturedCount(),2);assert.equal(f.pins.size,1);
 retry.resolve();assert.equal(await preserving,false);assert.equal(f.pins.size,0);assert.equal(reader.totalCapturedCount(),null);assert.equal(reader.readPointRange(0,4096),null);
 assert.equal(f.begin({timeStamp:400,clientX:180}).accepted,true);assert.equal(f.session.capturePointReader()!.totalCapturedCount(),1);assert.equal(f.session.capturePointReader()!.context.generation,3);assert.equal(reader.readPointRange(0,1),null);f.session.cancel();
});

test('An interrupted admitted prefix keeps its original pin until asynchronous preservation resolves',async()=>{
 const gate=deferred();let captured:import('../src/lib/paperPageInputSession.ts').PaperPageInputResult|undefined;
 const f=fixture(result=>{captured=result;return gate.promise;});f.begin();f.session.append(event({clientX:140,timeStamp:120,pressure:.8}),view());
 const result=f.session.finish(event({clientX:900,timeStamp:140,buttons:0}),view(),true);
 assert.equal(result.accepted,false);assert.equal(result.admitted,true);assert.deepEqual(result.cancellation,{cause:'pointercancel',disposition:'preserve-ink'});
 assert.equal(captured,result);assert.equal(captured!.stroke!.points.length,2);assert.equal(f.captures.size,0);assert.equal(f.pins.size,1);
 assert.equal(Object.isFrozen(result),true);assert.equal(Object.isFrozen(result.stroke!.points),true);assert.throws(()=>{result.stroke!.points[0].x=900;},TypeError);
 assert.equal(f.session.state().phase,'preserving');assert.equal(f.begin({timeStamp:200}).reason,'settling');
 const preserving=f.session.whenCancelled();gate.resolve();assert.equal(await preserving,false);assert.equal(f.pins.size,0);assert.equal(f.session.state().phase,'idle');
});

test('Failed preservation stays blocked through owner ABA and retry consumes the exact original payload once',async()=>{
 const first=deferred(),retry=deferred(),seen:import('../src/lib/paperPageInputSession.ts').PaperPageInputResult[]=[];
 const f=fixture(result=>{seen.push(result);return seen.length===1?first.promise:retry.promise;});f.begin();const result=f.session.cancel('geometry-changed');
 const failed=f.session.whenCancelled();first.reject(Error('quota'));await assert.rejects(failed,/quota/);
 assert.equal(f.session.state().phase,'blocked');assert.equal(f.pins.size,1);f.authority.ownershipKey='B';f.session.syncAuthority();f.authority.ownershipKey='account|space|note';
 assert.equal(f.begin({timeStamp:300}).reason,'settling');assert.equal(seen.length,1);
 const retried=f.session.retryCancellation();assert.equal(seen.length,2);assert.equal(seen[0],result);assert.equal(seen[1],result);assert.equal(f.session.state().phase,'preserving');
 retry.resolve();assert.equal(await retried,false);assert.equal(f.pins.size,0);assert.equal(f.session.state().phase,'idle');assert.equal(f.begin({timeStamp:400}).status,'started');f.session.cancel();
});

test('Revoked settlement waits both its accepted child and the old-scope cancellation writer',async()=>{
 const child=deferred(),preservation=deferred();const f=fixture(()=>preservation.promise);f.begin();const result=f.session.finish(event({timeStamp:140,buttons:0}),view());
 const task=result.lease!.settle(()=>child.promise);f.authority.api={};f.session.syncAuthority();assert.equal(f.pins.size,1);child.resolve();
 await Promise.resolve();await Promise.resolve();assert.equal(f.pins.size,1);preservation.resolve();assert.equal(await task,false);assert.equal(f.pins.size,0);
});

test('Unadmitted capture failure and eraser-button interruption discard rather than creating recovered ink',()=>{
 const rows:import('../src/lib/paperPageInputSession.ts').PaperPageInputResult[]=[];const f=fixture(result=>{rows.push(result);});f.captureTarget.setPointerCapture=()=>{throw Error('capture');};
 const failed=f.begin();assert.equal(failed.admitted,false);assert.deepEqual(failed.cancellation,{cause:'capture-failed',disposition:'discard'});assert.equal(f.pins.size,0);
 const g=fixture(result=>{rows.push(result);});g.begin({button:5,buttons:32});g.authority.writable=false;const cancelled=g.session.syncAuthority()!;
 assert.equal(cancelled.stroke!.intent,'eraser');assert.equal(cancelled.cancellation?.disposition,'discard');assert.equal(g.pins.size,0);
});

test('A reentrant retry replaces the failed preservation tail before an older child can release its pin',async()=>{
 const first=deferred(),second=deferred();let calls=0,retry:Promise<boolean>|undefined;
 const f=fixture(()=>++calls===1?first.promise:second.promise,(_result,phase)=>{if(phase==='blocked')retry=f.session.retryCancellation();});
 f.begin();const result=f.session.finish(event({timeStamp:140,buttons:0}),view());const task=result.lease!.settle(()=>Promise.resolve());f.session.cancel('geometry-changed');
 await Promise.resolve();await Promise.resolve();first.reject(Error('first attempt'));await Promise.resolve();await Promise.resolve();
 assert.equal(calls,2);assert.equal(f.pins.size,1);assert.equal(f.session.state().phase,'preserving');second.resolve();assert.equal(await task,false);assert.equal(await retry,false);assert.equal(f.pins.size,0);
});

test('Same-page geometry changes, source geometry changes and removal cancel without releasing a newer pin',()=>{
 for(const patch of [{width:900},{height:1200},{rotation:90},{geometryKey:'pdf:1:crop:full'}]){
  const f=fixture();f.begin();Object.assign(f.authority.page!,patch);const cancelled=f.session.syncAuthority();assert.equal(cancelled?.reason,'geometry-changed');assert.equal(cancelled?.accepted,false);assert.equal(f.pins.size,0);assert.equal(f.captures.size,0);assert.equal(f.session.snapshot(),null);assert.equal(f.cancels(),1);
 }
 const f=fixture();f.begin();f.authority.page=null;assert.equal(f.session.finish(event({buttons:0,timeStamp:120}),view()).reason,'page-removed');assert.equal(f.pins.size,0);assert.equal(f.captures.size,0);
});

test('Owner, generation, API and permission ABA revoke finished leases permanently',async()=>{
 for(const field of ['ownershipKey','generation','api','writable'] as const){
  const f=fixture();f.begin();const result=f.session.finish(event({buttons:0,timeStamp:120}),view()),original=f.authority[field];
  if(field==='ownershipKey')f.authority.ownershipKey='another-note';else if(field==='generation')f.authority.generation=2;else if(field==='api')f.authority.api={};else f.authority.writable=false;
  const cancelled=f.session.syncAuthority();assert.equal(cancelled?.status,'cancelled');Object.assign(f.authority,{[field]:original});assert.equal(f.session.syncAuthority(),null);assert.equal(result.lease!.current(),false);
  let writes=0;assert.equal(await result.lease!.settle(()=>{writes++;}),false);assert.equal(writes,0);assert.equal(f.pins.size,0);assert.equal(f.cancels(),1);
 }
});

test('An absent API keeps local writing available and absence-to-client ABA still revokes its old lease',async()=>{
 for(const absent of [undefined,null]){
  const f=fixture();f.authority.api=absent;assert.equal(f.begin().status,'started');const result=f.session.finish(event({timeStamp:120,buttons:0}),view());assert.equal(result.lease!.current(),true);assert.equal(await result.lease!.settle(),true);assert.equal(f.pins.size,0);
  assert.equal(f.begin({timeStamp:200}).status,'started');const next=f.session.finish(event({timeStamp:220,buttons:0}),view());f.authority.api={};assert.equal(f.session.syncAuthority()?.reason,'api-changed');f.authority.api=absent;assert.equal(next.lease!.current(),false);assert.equal(await next.lease!.settle(),false);assert.equal(f.pins.size,0);
 }
});

test('A wrong pointer or lost capture after normal finish cannot cancel the owned stroke or its settlement',async()=>{
 const f=fixture();f.begin();assert.equal(f.session.append(event({pointerId:10,timeStamp:120}),view()).reason,'other-pointer');assert.equal(f.session.lostPointerCapture(10).reason,'other-pointer');assert.equal(f.session.state().phase,'capturing');
 const result=f.session.finish(event({timeStamp:130,buttons:0}),view());assert.equal(f.session.lostPointerCapture(9).reason,'other-pointer');assert.equal(result.lease!.current(),true);assert.equal(await result.lease!.settle(),true);assert.equal(f.cancels(),0);
 const g=fixture();g.begin();assert.equal(g.session.lostPointerCapture(9).reason,'capture-lost');assert.equal(g.captures.size,0);assert.equal(g.pins.size,0);assert.equal(g.session.lostPointerCapture(9).accepted,false);assert.equal(g.cancels(),1);
});

test('Capture failure or pin allocation failure leaves no pending first sample or held resource',()=>{
 const f=fixture();f.captureTarget.setPointerCapture=()=>{throw Error('capture refused');};assert.equal(f.begin().reason,'capture-lost');assert.equal(f.pins.size,0);assert.equal(f.session.snapshot(),null);assert.equal(f.cancels(),1);
 let captures=0;const g=fixture(),session=createPaperPageInputSession({pageId:'page-B',getAuthority:()=>g.authority,pinPage:()=>{throw Error('pin refused');}});
 assert.equal(session.begin(event(),{view:view(),intent:'pen',captureTarget:{setPointerCapture:()=>{captures++;},releasePointerCapture:()=>{}}}).reason,'pin-failed');assert.equal(captures,0);assert.equal(session.state().phase,'idle');
});

test('Multitouch and a point limit clean up atomically while a palm does not cancel stylus capture',()=>{
 const f=fixture();f.begin();assert.equal(f.begin({pointerId:2,pointerType:'touch',timeStamp:120}).reason,'palm');assert.equal(f.pins.size,1);assert.equal(f.session.state().phase,'capturing');f.session.cancel();assert.equal(f.pins.size,0);
 const g=fixture(),input={view:view(),intent:'pen' as const,captureTarget:g.captureTarget,policy:{fingerInk:true}};assert.equal(g.session.begin(event({pointerType:'touch',timeStamp:2000}),input).status,'started');assert.equal(g.session.begin(event({pointerType:'touch',pointerId:2,isPrimary:false,timeStamp:2020}),input).reason,'multitouch');assert.equal(g.pins.size,0);assert.equal(g.captures.size,0);
 const h=fixture();h.session.begin(event(),{view:view(),intent:'pen',captureTarget:h.captureTarget,policy:{maxPoints:1}});assert.equal(h.session.append(event({timeStamp:120}),view()).reason,'point-limit');assert.equal(h.pins.size,0);assert.equal(h.captures.size,0);
});

test('Viewport transforms are guarded but snapshot copies and real coalesced sensor samples remain independent',async()=>{
 const f=fixture(),v=view(),before=structuredClone({authority:f.authority.page,event:event(),view:v});f.session.begin(event(),{view:v,intent:'pen',captureTarget:f.captureTarget});
 f.session.snapshot()!.points[0].x=999;const batch=[event({clientX:140,timeStamp:120,pressure:.8}),event({clientX:130,timeStamp:110,pressure:.4})];assert.equal(f.session.append(batch[0],v,batch).added,2);
 const result=f.session.finish(event({clientX:80,clientY:100,timeStamp:130,buttons:0,pressure:0}),v);assert.deepEqual(result.stroke!.points.map(p=>[p.x,p.y,p.pressure]),[[40,60,.2],[60,60,.4],[80,60,.8],[-40,-200,0]]);assert.deepEqual({authority:f.authority.page,event:event(),view:v},before);await result.lease!.settle();
 const g=fixture();g.begin();assert.equal(g.session.append(event({timeStamp:120}),{clientRect:{...view().clientRect,top:201}}).reason,'geometry-changed');assert.equal(g.pins.size,0);assert.equal(g.captures.size,0);
});

test('Revocation during settlement suppresses its current guard but keeps its own pin until work settles',async()=>{
 const f=fixture();f.begin();const result=f.session.finish(event({timeStamp:120,buttons:0}),view()),gate=deferred();let guard!:()=>boolean;
 const task=result.lease!.settle(async current=>{guard=current;await gate.promise;});f.authority.writable=false;assert.equal(f.session.syncAuthority()?.reason,'permission-changed');assert.equal(guard(),false);assert.equal(f.pins.size,1);f.authority.writable=true;assert.equal(guard(),false);gate.resolve();assert.equal(await task,false);assert.equal(f.pins.size,0);assert.equal(f.cancels(),1);
});

test('Settlement is idempotent and both rejection and dispose clean up without late unpinning another gesture',async()=>{
 const f=fixture();f.begin();const result=f.session.finish(event({timeStamp:120,buttons:0}),view()),gate=deferred();let calls=0;
 const task=result.lease!.settle(async()=>{calls++;await gate.promise;}),again=result.lease!.settle(()=>{calls++;});assert.equal(again,task);gate.reject(Error('save failed'));await assert.rejects(task,/save failed/);assert.equal(calls,1);assert.equal(f.pins.size,0);assert.equal(f.session.state().phase,'idle');
 f.begin({timeStamp:200});assert.equal(f.pins.size,1);assert.equal(result.lease!.current(),false);assert.equal(await result.lease!.settle().catch(()=>false),false);assert.equal(f.pins.size,1);f.session.dispose();assert.equal(f.pins.size,0);assert.equal(f.captures.size,0);assert.equal(f.begin().reason,'disposed');
 const g=fixture();g.begin();const completed=g.session.finish(event({timeStamp:120,buttons:0}),view()),pending=deferred(),settling=completed.lease!.settle(()=>pending.promise);g.session.dispose();assert.equal(g.pins.size,1);assert.equal(completed.lease!.current(),false);pending.resolve();assert.equal(await settling,false);assert.equal(g.pins.size,0);
});

test('Reentrant settlement and lost-capture notification execute work and release resources exactly once',async()=>{
 const f=fixture();f.captureTarget.releasePointerCapture=id=>{f.captures.delete(id);f.session.lostPointerCapture(id);};f.begin();const result=f.session.finish(event({timeStamp:120,buttons:0}),view());assert.equal(result.accepted,true);assert.equal(f.cancels(),0);
 let nested:Promise<boolean>|undefined,calls=0;const gate=deferred(),task=result.lease!.settle(()=>{calls++;nested=result.lease!.settle(()=>{calls++;});return gate.promise;});assert.equal(nested,task);gate.resolve();assert.equal(await task,true);assert.equal(calls,1);assert.equal(f.pins.size,0);assert.equal(f.captures.size,0);
});

test('Invalid or inaccessible authority refuses capture and an observed permission loss cancels before final work',async()=>{
 for(const patch of [{generation:NaN},{generation:-1},{generation:1.5},{ownershipKey:''},{page:{id:'page-B',width:Infinity,height:1100,rotation:0}},{page:{id:'page-B',width:800,height:0,rotation:0}},{page:{id:'page-B',width:800,height:1100,rotation:NaN}}]){
  const f=fixture();Object.assign(f.authority,patch);assert.equal(f.begin().reason,'invalid-authority');assert.equal(f.pins.size,0);assert.equal(f.captures.size,0);
 }
 const session=createPaperPageInputSession({pageId:'page-B',getAuthority:()=>{throw Error('scope gone');},pinPage:()=>()=>{}});assert.equal(session.begin(event(),{view:view(),intent:'pen',captureTarget:{setPointerCapture:()=>{},releasePointerCapture:()=>{}}}).accepted,false);
 const f=fixture();f.begin();const result=f.session.finish(event({timeStamp:120,buttons:0}),view());f.authority.writable=false;let calls=0;assert.equal(await result.lease!.settle(()=>{calls++;}),false);f.authority.writable=true;assert.equal(result.lease!.current(),false);assert.equal(calls,0);assert.equal(f.pins.size,0);
});
