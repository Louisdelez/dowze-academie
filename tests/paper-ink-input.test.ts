import test from 'node:test';
import assert from 'node:assert/strict';
import {createPaperInkInput,paperInkCapabilities,type PaperInkEvent,type PaperInkContext} from '../src/lib/paperInkInput.ts';
const context=(patch:Partial<PaperInkContext>={}):PaperInkContext=>({ownershipKey:'account|year|note',generation:1,pageId:'page-1',pageWidth:800,pageHeight:1100,pageRotation:0,clientRect:{left:100,top:200,width:400,height:550},intent:'pen',...patch});
const event=(patch:Partial<PaperInkEvent>={}):PaperInkEvent=>({pointerId:9,pointerType:'pen',isPrimary:true,clientX:120,clientY:230,timeStamp:100,pressure:.2,tiltX:10,tiltY:-20,twist:45,button:0,buttons:1,width:1,height:1,...patch});
test('Captured client geometry converts samples and final endpoint to stable paper units without modifying callers',()=>{
 const input=createPaperInkInput(),c=context(),e=event(),before=structuredClone({c,e});assert.equal(input.begin(e,c).status,'started');
 assert.equal(input.append(event({clientX:140,clientY:250,timeStamp:120}),c).added,1);
 const result=input.finish(event({clientX:150,clientY:260,timeStamp:130,button:0,buttons:0,pressure:0}),c);assert.equal(result.status,'finished');assert.deepEqual(result.stroke!.points.map(p=>[p.x,p.y,p.time,p.pressure]),[[40,60,100,.2],[80,100,120,.2],[100,120,130,0]]);assert.equal(input.snapshot(),null);assert.deepEqual({c,e},before);
});
test('An inverse client-to-page transform supports rotated surfaces instead of bounding-rect approximation',()=>{
 const input=createPaperInkInput(),c=context({pageRotation:90,clientToPage:{a:0,b:-2,c:2,d:0,e:-400,f:1000}});const first=input.begin(event({clientX:150,clientY:220}),c).stroke!.points[0];assert.deepEqual([first.x,first.y],[40,700]);const last=input.finish(event({clientX:180,clientY:240,timeStamp:120,buttons:0}),c).stroke!.points[1];assert.deepEqual([last.x,last.y],[80,640]);
});
test('Pressure, inclination and twist are finite and bounded while mouse values never manufacture pen metadata',()=>{
 const input=createPaperInkInput(),c=context();const start=input.begin(event({pressure:3,tiltX:1000,tiltY:-1000,twist:600}),c).stroke!.points[0];assert.deepEqual([start.pressure,start.tiltX,start.tiltY,start.twist],[1,90,-90,359]);
 input.append(event({pressure:NaN,tiltX:Infinity,tiltY:undefined,twist:NaN,timeStamp:110}),c);const invalid=input.snapshot()!.points[1];assert.deepEqual(invalid,{x:40,y:60,time:110});input.cancel();const mouse=input.begin(event({pointerType:'mouse'}),c).stroke!.points[0];assert.deepEqual(mouse,{x:40,y:60,time:100});
});
test('Coalesced samples are sorted, deduplicated and used instead of the parent aggregate',()=>{
 const input=createPaperInkInput(),c=context();input.begin(event(),c);const native=event({timeStamp:150,clientX:999});
 const result=input.append(native,c,[event({timeStamp:140,clientX:140}),event({timeStamp:120,clientX:130}),event({timeStamp:120,clientX:130}),event({timeStamp:130,clientX:135}),event({timeStamp:200,clientX:180}),event({pointerId:8,timeStamp:125}),event({pointerType:'touch',timeStamp:125}),event({timeStamp:NaN})]);
 assert.equal(result.added,3);assert.equal(result.stroke,undefined);assert.deepEqual(input.snapshot()!.points.map(p=>[p.x,p.time]),[[40,100],[60,120],[70,130],[80,140]]);
});
test('Repeated pointer/raw batches add no duplicate samples and stale times cannot make a backward trajectory',()=>{
 const input=createPaperInkInput(),c=context();input.begin(event(),c);const batch=[event({timeStamp:110,clientX:130}),event({timeStamp:120,clientX:140})];assert.equal(input.append(batch[1],c,batch).added,2);assert.equal(input.append(batch[1],c,batch).added,0);assert.equal(input.append(event({timeStamp:105,clientX:999}),c).added,0);assert.equal(input.snapshot()!.points.length,3);
});
test('Two pressure values at the same position and timestamp remain meaningful samples',()=>{
 const input=createPaperInkInput(),c=context();input.begin(event(),c);assert.equal(input.append(event({pressure:.8}),c).added,1);assert.deepEqual(input.snapshot()!.points.map(p=>p.pressure),[.2,.8]);
});
test('Malformed samples are skipped while finite out-of-page captured points are preserved rather than clamped',()=>{
 const input=createPaperInkInput(),c=context();assert.equal(input.begin(event({clientX:NaN}),c).reason,'invalid-sample');input.begin(event(),c);assert.equal(input.append(event({clientY:Infinity,timeStamp:120}),c).added,0);assert.equal(input.append(event({clientX:80,clientY:100,timeStamp:140}),c).added,1);assert.deepEqual(input.snapshot()!.points[1],{x:-40,y:-200,time:140,pressure:.2,tiltX:10,tiltY:-20,twist:45});
});
test('Ownership, note, year, page and generation changes cancel instead of adding to the next document',()=>{
 for(const changed of [{ownershipKey:'other|year|note'},{ownershipKey:'account|other-year|note'},{ownershipKey:'account|year|other-note'},{generation:2},{pageId:'page-2'}]){const input=createPaperInkInput(),c=context();input.begin(event(),c);const result=input.finish(event({timeStamp:120,buttons:0}),context(changed));assert.equal(result.status,'cancelled');assert.equal(result.accepted,false);assert.equal(result.reason,'owner-changed');assert.equal(result.stroke!.points.length,1);assert.equal(input.snapshot(),null);}
});
test('Zoom, scroll, resize, rotation and SVG matrix changes cancel a stroke without stretching old points',()=>{
 for(const changed of [{pageWidth:1100,pageHeight:800,pageRotation:90},{clientRect:{left:100,top:201,width:400,height:550}},{clientRect:{left:100,top:200,width:800,height:1100}},{clientToPage:{a:1,b:0,c:0,d:1,e:0,f:0}}]){const input=createPaperInkInput(),c=context();input.begin(event(),c);const result=input.append(event({timeStamp:120,clientX:150}),context(changed));assert.equal(result.status,'cancelled');assert.equal(result.reason,'geometry-changed');assert.equal(result.accepted,false);assert.deepEqual(result.stroke!.points[0].x,40);}
 const matrix={a:2,b:0,c:0,d:2,e:-200,f:-400},input=createPaperInkInput(),c=context({clientToPage:matrix});input.begin(event(),c);matrix.e=-250;assert.equal(input.append(event({timeStamp:110}),c).reason,'geometry-changed');
});
test('Subpixel layout noise keeps the captured transform, whereas malformed or singular transforms never capture',()=>{
 const input=createPaperInkInput(),c=context();input.begin(event(),c);assert.equal(input.append(event({clientX:130,timeStamp:120}),context({clientRect:{...c.clientRect,left:100.005}})).status,'updated');assert.equal(input.snapshot()!.points[1].x,60);
 for(const changed of [{clientRect:{left:0,top:0,width:0,height:500}},{clientToPage:{a:1,b:2,c:2,d:4,e:0,f:0}},{pageWidth:NaN},{generation:NaN}])assert.equal(createPaperInkInput().begin(event(),context(changed)).reason,'invalid-context');
});
test('Cancellation and lost capture expose diagnostic copies but never a committable result',()=>{
 const c=context(),input=createPaperInkInput();input.begin(event(),c);input.append(event({timeStamp:120}),c);const cancelled=input.finish(event({timeStamp:130}),c,true);assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.accepted,false);assert.equal(cancelled.stroke!.points.length,2);assert.equal(input.finish(event({timeStamp:140,buttons:0}),c).reason,'no-active-stroke');
 input.begin(event(),c);assert.equal(input.cancel('capture-lost').reason,'capture-lost');assert.equal(input.snapshot(),null);
});
test('Snapshots and results cannot mutate the captured geometry or pending stroke',()=>{
 const c=context(),input=createPaperInkInput(),result=input.begin(event(),c);result.stroke!.points[0].x=10000;result.stroke!.context.clientRect.left=-999;const snapshot=input.snapshot()!;snapshot.points.push({x:1,y:1,time:1});snapshot.context.pageId='other';assert.equal(input.snapshot()!.points.length,1);assert.equal(input.snapshot()!.points[0].x,40);assert.equal(input.append(event({timeStamp:110}),c).status,'updated');
});
test('Finger writing is opt-in and palm-size, recent stylus and primary-pointer rules protect the page',()=>{
 const c=context(),touch=event({pointerType:'touch',pointerId:2,timeStamp:2000,width:10,height:10}),input=createPaperInkInput();assert.equal(input.begin(touch,c).reason,'navigation');assert.equal(input.begin({...touch,isPrimary:false},c,{fingerInk:true}).reason,'non-primary');assert.equal(input.begin({...touch,width:40},c,{fingerInk:true}).reason,'palm');assert.equal(input.begin({...touch,height:40},c,{fingerInk:true}).reason,'palm');
 input.begin(event({timeStamp:1500}),c);input.finish(event({timeStamp:1600,buttons:0}),c);assert.equal(input.begin(touch,c,{fingerInk:true}).reason,'palm');assert.equal(input.begin({...touch,timeStamp:2500},c,{fingerInk:true}).status,'started');
});
test('A second finger cancels pending finger ink for two-finger navigation while a palm cannot cancel pen ink',()=>{
 const c=context(),input=createPaperInkInput();input.begin(event({pointerType:'touch',pointerId:1}),c,{fingerInk:true});const result=input.begin(event({pointerType:'touch',pointerId:2,isPrimary:false,timeStamp:120}),c,{fingerInk:true});assert.equal(result.reason,'multitouch');assert.equal(result.status,'cancelled');assert.equal(result.accepted,false);assert.equal(input.snapshot(),null);
 input.begin(event({timeStamp:150}),c);assert.equal(input.begin(event({pointerType:'touch',pointerId:2,isPrimary:true,timeStamp:160}),c,{fingerInk:true}).reason,'palm');assert.equal(input.snapshot()!.pointerType,'pen');assert.equal(input.snapshot()!.points.length,1);
});
test('Only the owned pointer can append, end or cancel a gesture through event handling',()=>{
 const c=context(),input=createPaperInkInput();input.begin(event(),c);assert.equal(input.begin(event(),c).reason,'already-active');assert.equal(input.append(event({pointerId:8,timeStamp:120}),c).reason,'other-pointer');assert.equal(input.finish(event({pointerId:8,timeStamp:130}),c,true).reason,'other-pointer');assert.equal(input.snapshot()!.pointerId,9);assert.equal(input.finish(event({timeStamp:140,buttons:0}),c).status,'finished');
});
test('Secondary mouse buttons, stylus hover, generic pointers and disabled input cannot create ink',()=>{
 const c=context();for(const e of [event({pointerType:'mouse',button:2,buttons:2}),event({pointerType:'pen',buttons:0}),event({pointerType:'',button:0}),event({pointerId:-1}),event({pointerId:NaN})])assert.equal(createPaperInkInput().begin(e,c).accepted,false);assert.equal(createPaperInkInput().begin(event(),c,{enabled:false}).reason,'disabled');
});
test('Pen eraser button 5 or bitmask 32 captures eraser intent and final release retains it',()=>{
 const c=context({intent:'highlighter'});for(const e of [event({button:5,buttons:32}),event({button:0,buttons:32}),event({button:5,buttons:undefined})]){const input=createPaperInkInput(),begin=input.begin(e,c);assert.equal(begin.status,'started');assert.equal(begin.intent,'eraser');assert.equal(begin.stroke!.eraserButton,true);assert.equal(input.append({...e,button:-1,timeStamp:120},c).status,'updated');assert.equal(input.finish({...e,button:5,buttons:0,timeStamp:130},c).stroke!.intent,'eraser');}
});
test('Switching selected tool or stylus eraser during a stroke cancels, never mixes pen and eraser operations',()=>{
 const c=context(),input=createPaperInkInput();input.begin(event(),c);assert.equal(input.append(event({timeStamp:120}),context({intent:'eraser'})).reason,'tool-changed');input.begin(event(),c);assert.equal(input.append(event({buttons:32,button:5,timeStamp:120}),c).reason,'buttons-changed');input.begin(event({button:5,buttons:32}),c);assert.equal(input.append(event({timeStamp:120}),c).reason,'buttons-changed');
});
test('A point limit cancels atomically, leaving already stored documents outside this pure engine untouched',()=>{
 const c=context(),input=createPaperInkInput();input.begin(event(),c,{maxPoints:2});input.append(event({clientX:130,timeStamp:120}),c);const result=input.append(event({clientX:140,timeStamp:130}),c);assert.equal(result.reason,'point-limit');assert.equal(result.accepted,false);assert.equal(result.stroke!.points.length,2);assert.equal(input.snapshot(),null);
});
test('Capability reporting lists absent APIs and always keeps hardware validation separate',()=>{
 const absent=paperInkCapabilities();assert.equal(absent.available.pointerEvents,false);assert.ok(absent.missing.includes('coalescedEvents'));assert.equal(absent.hardwareVerified,false);const present=paperInkCapabilities({pointerEvents:true,pointerCapture:true,coalescedEvents:true,pressure:true,tilt:true,twist:true,eraserButton:true});assert.equal(present.missing.length,0);assert.equal(present.hardwareVerified,false);
});

test('OS cancellation preserves only admitted authoring samples and never manufactures its final endpoint',()=>{
 const c=context(),input=createPaperInkInput();input.begin(event(),c);input.append(event({clientX:130,timeStamp:120,pressure:.7}),c);
 const result=input.finish(event({clientX:900,timeStamp:140,pressure:0}),c,true);
 assert.deepEqual(result.cancellation,{cause:'pointercancel',disposition:'preserve-ink'});assert.equal(result.accepted,false);
 assert.deepEqual(result.stroke!.points.map(p=>[p.x,p.time,p.pressure]),[[40,100,.2],[60,120,.7]]);
 assert.equal(input.snapshot(),null);
});

test('Explicit discard, gesture navigation and all non-authoring intents stay separate from recoverable ink',()=>{
 for(const intent of ['eraser','lasso','select','laser'] as const){const input=createPaperInkInput(),c=context({intent});input.begin(event(),c);assert.equal(input.finish(event({timeStamp:140}),c,true).cancellation?.disposition,'discard');}
 const input=createPaperInkInput(),c=context();input.begin(event(),c);assert.deepEqual(input.cancel().cancellation,{cause:'explicit-discard',disposition:'discard'});
 input.begin(event(),c);assert.deepEqual(input.cancel('geometry-changed').cancellation,{cause:'surface-change',disposition:'preserve-ink'});
 input.begin(event(),c);assert.deepEqual(input.cancel('navigation').cancellation,{cause:'navigation',disposition:'discard'});
 input.begin(event(),c);assert.deepEqual(input.cancel('point-limit').cancellation,{cause:'point-limit',disposition:'preserve-ink'});
 input.begin(event(),c);assert.deepEqual(input.cancel('publication-refused').cancellation,{cause:'publication-refused',disposition:'preserve-ink'});
 input.begin(event(),c);assert.deepEqual(input.cancel('save-failed').cancellation,{cause:'save-failed',disposition:'preserve-ink'});
});

test('Range copies are bounded independently of capture size, preserve exact samples and refuse invalid cursors',()=>{
 const input=createPaperInkInput(),c=context();input.begin(event(),c);
 const batch=Array.from({length:5000},(_,i)=>event({clientX:121+i/10,timeStamp:101+i,pressure:i%2===0?undefined:.7,tiltX:undefined,twist:undefined}));
 assert.equal(input.append(event({timeStamp:5101}),c,batch).added,5000);
 const reader=input.capturePointReader()!,first=reader.readPointRange(0,4096)!,tail=reader.readPointRange(first.to,4096)!;
 assert.equal(reader.totalCapturedCount(),5001);assert.equal(first.points.length,4096);assert.deepEqual([first.from,first.to,first.total],[0,4096,5001]);
 assert.deepEqual([tail.from,tail.to,tail.total,tail.points.length],[4096,5001,5001,905]);
 assert.equal('pressure' in first.points[1],false);assert.equal(first.points[2].pressure,.7);assert.equal('tiltX' in first.points[1],false);
 assert.equal(Object.isFrozen(first),true);assert.equal(Object.isFrozen(first.points),true);assert.equal(Object.isFrozen(first.points[0]),true);
 assert.throws(()=>{(first.points[0] as {x:number}).x=999;},TypeError);assert.equal(reader.readPointRange(0,1)!.points[0].x,40);
 for(const [from,max] of [[-1,1],[.5,1],[5002,1],[NaN,1],[0,0],[0,4097],[0,Infinity],[0,1.5]])assert.equal(reader.readPointRange(from,max),null);
 assert.deepEqual(reader.readPointRange(5001,4096)!.points,[]);
});

test('A captured range reader keeps its own final count and metadata through engine cancel and another capture',()=>{
 const input=createPaperInkInput(),c=context();input.begin(event(),c);const old=input.capturePointReader()!;
 input.append(event({clientX:140,timeStamp:120}),c);input.cancel('capture-lost');
 input.begin(event({clientX:180,timeStamp:300}),context({ownershipKey:'other',generation:2}));
 assert.equal(old.totalCapturedCount(),2);assert.deepEqual(old.readPointRange(0,4096)!.points.map(p=>[p.x,p.time]),[[40,100],[80,120]]);
 assert.equal(old.context.ownershipKey,c.ownershipKey);assert.equal(input.capturePointReader()!.context.ownershipKey,'other');
 assert.equal(Object.isFrozen(old.context.clientRect),true);assert.throws(()=>{old.context.clientRect.left=0;},TypeError);
 assert.equal(old.readPointRange(2,1)!.points.length,0);
});
