import test from 'node:test';
import assert from 'node:assert/strict';
import {clipPaperStroke,clipPaperInkStroke,type PaperStrokeErasePoint,type PaperStrokeEraseResult} from '../src/lib/paperStrokeErase.ts';
import {objectPoint} from '../src/lib/paperGeometry.ts';
import type {PaperObject} from '../src/lib/notebookDocument.ts';

const close=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<=Math.max(1,Math.abs(expected))*1e-10,`${actual} ≠ ${expected}`);
const line:PaperStrokeErasePoint[]=[{x:0,y:0,time:0,pressure:.2,tiltX:10,tiltY:20,twist:30},{x:100,y:0,time:100,pressure:.8,tiltX:15,tiltY:25,twist:35}];
const allPoints=(result:PaperStrokeEraseResult)=>result.fragments.flat();
const pointDistance=(point:{x:number;y:number},from:{x:number;y:number},to:{x:number;y:number})=>{const dx=to.x-from.x,dy=to.y-from.y,length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((point.x-from.x)*dx+(point.y-from.y)*dy)/length)):0;return Math.hypot(point.x-from.x-dx*t,point.y-from.y-dy*t);};

test('A sparse segment is cut analytically at both round boundaries without adding samples elsewhere',()=>{
 const original=structuredClone(line),result=clipPaperStroke(line,{x:50,y:0},{x:50,y:0},5);
 assert.equal(result.status,'clipped');assert.equal(result.changed,true);assert.equal(result.fragments.length,2);assert.equal(allPoints(result).length,4);
 assert.equal(result.fragments[0][0],line[0]);assert.equal(result.fragments[1][1],line[1]);
 close(result.fragments[0][1].x,45);close(result.fragments[1][0].x,55);close(result.fragments[0][1].time,45);close(result.fragments[1][0].time,55);
 assert.deepEqual(result.cuts.map(cut=>[cut.fragmentIndex,cut.pointIndex,cut.sourceSegment]),[[0,1,0],[1,0,0]]);close(result.cuts[0].fraction,.45);close(result.cuts[1].fraction,.55);
 assert.deepEqual(line,original);
});

test('The central rectangle clips a perpendicular sparse segment between the round caps',()=>{
 const points=[{x:50,y:-50,time:0},{x:50,y:50,time:100}],result=clipPaperStroke(points,{x:30,y:0},{x:70,y:0},5);
 assert.equal(result.fragments.length,2);close(result.fragments[0][1].y,-5);close(result.fragments[1][0].y,5);close(result.cuts[0].fraction,.45);close(result.cuts[1].fraction,.55);
});

test('Outside the longitudinal strip, a round cap determines the two intersections',()=>{
 const points=[{x:25,y:-20,time:0},{x:25,y:20,time:40}],result=clipPaperStroke(points,{x:30,y:0},{x:70,y:0},10),height=Math.sqrt(75);
 assert.equal(result.fragments.length,2);close(result.fragments[0][1].y,-height);close(result.fragments[1][0].y,height);
 for(const cut of result.cuts)close(pointDistance(result.fragments[cut.fragmentIndex][cut.pointIndex],{x:30,y:0},{x:70,y:0}),10);
});

test('Reversing the eraser movement does not change ordered fragments or cut provenance',()=>{
 const forward=clipPaperStroke(line,{x:30,y:-10},{x:70,y:-10},15),backward=clipPaperStroke(line,{x:70,y:-10},{x:30,y:-10},15),reach=Math.sqrt(125);
 assert.equal(backward.status,forward.status);assert.deepEqual(backward.fragments.map(fragment=>fragment.length),forward.fragments.map(fragment=>fragment.length));
 for(let i=0;i<forward.cuts.length;i++){const a=forward.cuts[i],b=backward.cuts[i];assert.deepEqual([b.fragmentIndex,b.pointIndex,b.sourceSegment,b.renderPressureSources],[a.fragmentIndex,a.pointIndex,a.sourceSegment,a.renderPressureSources]);close(b.fraction,a.fraction);}
 const expected=allPoints(forward),actual=allPoints(backward);for(let i=0;i<expected.length;i++){close(actual[i].x,expected[i].x);close(actual[i].y,expected[i].y);close(actual[i].time,expected[i].time);}
 close(forward.fragments[0][1].x,30-reach);close(forward.fragments[1][0].x,70+reach);
});

test('Isolated tangency keeps the stroke and sample-array identity, while a dot on the boundary is hit',()=>{
 const points=[{x:-2,y:1,time:0},{x:2,y:1,time:1}],touch=clipPaperStroke(points,{x:0,y:0},{x:0,y:0},1);
 assert.equal(touch.changed,false);assert.equal(touch.fragments[0],points);assert.equal(touch.cuts.length,0);
 assert.equal(clipPaperStroke([{x:0,y:1,time:0}],{x:0,y:0},{x:0,y:0},1).status,'erased');
 assert.equal(clipPaperStroke(points.map(point=>({...point,y:1+1e-8})),{x:0,y:0},{x:0,y:0},1).changed,false);
 assert.equal(clipPaperStroke(points.map(point=>({...point,y:1-1e-4})),{x:0,y:0},{x:0,y:0},1).fragments.length,2);
});

test('A positive-length overlap along the closed capsule boundary is removed without a zero-length fragment',()=>{
 const points=[{x:-2,y:1,time:0},{x:2,y:1,time:4}],result=clipPaperStroke(points,{x:-1,y:0},{x:1,y:0},1);
 assert.equal(result.fragments.length,2);close(result.fragments[0][1].x,-1);close(result.fragments[1][0].x,1);assert.ok(result.fragments.every(fragment=>fragment.length===2));
});

test('Two numerically near-tangent cap contacts cannot bridge across an outside strip',()=>{
 const points=[{x:-2,y:1+4*Number.EPSILON,time:0},{x:2,y:1+4*Number.EPSILON,time:1}],result=clipPaperStroke(points,{x:-1,y:0},{x:1,y:0},1);
 assert.equal(result.changed,false);assert.equal(result.fragments[0],points);assert.equal(result.cuts.length,0);
});

test('A zero-radius eraser removes collinear overlap and dots, but not an isolated crossing',()=>{
 const overlap=clipPaperStroke(line,{x:40,y:0},{x:60,y:0},0);assert.equal(overlap.fragments.length,2);close(overlap.fragments[0][1].x,40);close(overlap.fragments[1][0].x,60);
 assert.equal(clipPaperStroke(line,{x:50,y:-10},{x:50,y:10},0).changed,false);
 assert.equal(clipPaperStroke([{x:50,y:0,time:0}],{x:40,y:0},{x:60,y:0},0).status,'erased');
});

test('Entirely covered strokes and repeated dots erase cleanly; outside dots retain exact telemetry',()=>{
 assert.deepEqual(clipPaperStroke([{x:-1,y:0,time:0},{x:1,y:0,time:1}],{x:0,y:0},{x:0,y:0},2).fragments,[]);
 assert.equal(clipPaperStroke([{x:0,y:0,time:0},{x:0,y:0,time:1}],{x:0,y:0},{x:0,y:0},1).status,'erased');
 const points=[{x:4,y:5,time:3,pressure:0,tiltX:12}],result=clipPaperStroke(points,{x:0,y:0},{x:0,y:0},1);assert.equal(result.fragments[0],points);assert.equal(result.fragments[0][0],points[0]);
 assert.deepEqual(clipPaperStroke([],{x:0,y:0},{x:0,y:0},1).fragments,[]);
});

test('Repeated outside samples survive exactly, and shared segment endpoints are emitted only once',()=>{
 const points=[{x:-10,y:0,time:0},{x:-10,y:0,time:1},{x:10,y:0,time:2},{x:10,y:0,time:3}],result=clipPaperStroke(points,{x:0,y:0},{x:0,y:0},1);
 assert.equal(result.fragments.length,2);assert.equal(allPoints(result).length,6);assert.deepEqual(result.fragments[0].slice(0,2),points.slice(0,2));assert.equal(result.fragments[0][1],points[1]);assert.equal(result.fragments[1][1],points[2]);assert.equal(result.fragments[1][2],points[3]);
 close(result.fragments[0][2].time,1.45);close(result.fragments[1][0].time,1.55);
});

test('Several crossings produce ordered separate fragments that never bridge an erased interval',()=>{
 const points=[{x:-10,y:0,time:0},{x:10,y:0,time:10},{x:-10,y:10,time:20},{x:10,y:10,time:30}],from={x:0,y:-2},to={x:0,y:12},result=clipPaperStroke(points,from,to,2);
 assert.equal(result.fragments.length,4);assert.equal(result.cuts.length,6);assert.equal(allPoints(result).length,10);
 const ordered=allPoints(result);assert.ok(ordered.every((point,index)=>index===0||point.time>=ordered[index-1].time));
 for(const fragment of result.fragments)for(let i=1;i<fragment.length;i++){const a=fragment[i-1],b=fragment[i],mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};assert.ok(pointDistance(mid,from,to)>=2-1e-10);}
 assert.deepEqual(result.cuts.map(cut=>cut.sourceSegment),[0,0,1,1,2,2]);
});

test('Existing sensor values stay untouched; cuts carry only geometry, time and explicitly derived render pressure',()=>{
 const result=clipPaperStroke(line,{x:50,y:0},{x:50,y:0},10),left=result.fragments[0][1],right=result.fragments[1][0];
 assert.deepEqual(Object.keys(left).sort(),['renderPressure','time','x','y']);close(left.renderPressure!,.44);close(right.renderPressure!,.56);
 assert.equal(left.pressure,undefined);assert.equal(left.tiltX,undefined);assert.equal(left.tiltY,undefined);assert.equal(left.twist,undefined);assert.equal(left.nibAngle,undefined);
 assert.deepEqual(result.cuts[0].renderPressureSources,['sensor','sensor']);assert.equal(result.fragments[0][0].pressure,.2);assert.equal(result.fragments[1][1].pressure,.8);
});

test('Render interpolation follows the visible pressure floor and declares a missing-pressure default',()=>{
 const low=[{x:0,y:0,time:0,pressure:0},{x:100,y:0,time:1,pressure:.9}],result=clipPaperStroke(low,{x:50,y:0},{x:50,y:0},10);
 close(result.fragments[0][1].renderPressure!,.45);close(result.fragments[1][0].renderPressure!,.6);assert.equal(low[0].pressure,0);
 const mixed=[{x:0,y:0,time:0},{x:100,y:0,time:1,pressure:.9}],fallback=clipPaperStroke(mixed,{x:50,y:0},{x:50,y:0},10);
 close(fallback.fragments[0][1].renderPressure!,.66);assert.deepEqual(fallback.cuts[0].renderPressureSources,['default','sensor']);assert.equal(mixed[0].pressure,undefined);
});

test('Repeated erasure can derive pressure from prior render values without turning them into sensor pressure',()=>{
 const points=[{x:0,y:0,time:0,renderPressure:.3},{x:100,y:0,time:100,renderPressure:.7}],result=clipPaperStroke(points,{x:50,y:0},{x:50,y:0},10);
 close(result.fragments[0][1].renderPressure!,.46);close(result.fragments[1][0].renderPressure!,.54);assert.deepEqual(result.cuts[0].renderPressureSources,['derived','derived']);assert.ok(allPoints(result).every(point=>point.pressure===undefined));
});

test('The object adapter uses canonical rotation/mirror geometry and the existing nominal half-width reach',()=>{
 const object:PaperObject={id:'ink',pageId:'page',kind:'ink',x:20,y:30,width:100,height:100,rotation:37,mirrorX:true,mirrorY:true,z:1,locked:false,createdAt:0,strokeWidth:4,points:[{...line[0],x:10,y:50},{...line[1],x:90,y:50}]},before=structuredClone(object),center=objectPoint(object,{x:50,y:50}),result=clipPaperInkStroke(object,center,center,2);
 assert.equal(result.fragments.length,2);close(result.fragments[0][1].x,46);close(result.fragments[1][0].x,54);
 for(const cut of result.cuts)close(pointDistance(objectPoint(object,result.fragments[cut.fragmentIndex][cut.pointIndex]),center,center),4);
 assert.equal(result.fragments[0][0],object.points![0]);assert.equal(result.fragments[1][1],object.points![1]);assert.deepEqual(object,before);
});

test('Translation and uniform page scaling preserve fractions, chronology and pressure derivation',()=>{
 const baseline=clipPaperStroke(line,{x:50,y:0},{x:50,y:0},5);
 for(const factor of [1e-6,1,1e6]){const offset={x:20*factor,y:-30*factor},points=line.map(point=>({...point,x:point.x*factor+offset.x,y:offset.y})),center={x:50*factor+offset.x,y:offset.y},result=clipPaperStroke(points,center,center,5*factor);
  assert.equal(result.fragments.length,2);for(let i=0;i<result.cuts.length;i++){close(result.cuts[i].fraction,baseline.cuts[i].fraction);const cut=result.cuts[i],point=result.fragments[cut.fragmentIndex][cut.pointIndex],old=baseline.fragments[cut.fragmentIndex][cut.pointIndex];close(point.x,old.x*factor+offset.x);close(point.time,old.time);close(point.renderPressure!,old.renderPressure!);}
 }
});

test('Finite extreme times interpolate without overflowing the endpoint difference',()=>{
 const points=[{x:0,y:0,time:-1e308},{x:100,y:0,time:1e308}],result=clipPaperStroke(points,{x:50,y:0},{x:50,y:0},5);
 close(result.fragments[0][1].time,-1e307);close(result.fragments[1][0].time,1e307);assert.ok(allPoints(result).every(point=>Number.isFinite(point.time)));
});

test('Invalid geometry, transforms and descending chronologies preserve source rather than fabricate an edit',()=>{
 for(const radius of [-1,NaN,Infinity])assert.equal(clipPaperStroke(line,{x:50,y:0},{x:50,y:0},radius).reason,'invalid-eraser');
 assert.equal(clipPaperStroke(line,{x:NaN,y:0},{x:0,y:0},1).reason,'invalid-eraser');
 assert.equal(clipPaperStroke([{x:0,y:0,time:NaN}],{x:0,y:0},{x:0,y:0},1).reason,'invalid-sample');
 const descending=[{x:0,y:0,time:2},{x:100,y:0,time:1}],result=clipPaperStroke(descending,{x:50,y:0},{x:50,y:0},5);assert.equal(result.reason,'non-monotone-time');assert.equal(result.fragments[0],descending);
 assert.equal(clipPaperStroke(line,{x:50,y:0},{x:50,y:0},5,()=>({x:Infinity,y:0})).reason,'invalid-transform');
 assert.equal(clipPaperStroke(line,{x:50,y:0},{x:50,y:0},5,()=>{throw Error('Invalid projection');}).reason,'invalid-transform');
 const extreme=[{x:-Number.MAX_VALUE,y:0,time:0},{x:Number.MAX_VALUE,y:0,time:1}];assert.equal(clipPaperStroke(extreme,{x:Number.MAX_VALUE,y:0},{x:Number.MAX_VALUE,y:0},1).reason,'precision-range');
});

test('The adapter leaves locked, measured and non-ink objects for their existing parent semantics',()=>{
 const object:PaperObject={id:'ink',pageId:'page',kind:'ink',x:0,y:0,width:100,height:100,rotation:0,z:1,locked:false,createdAt:0,points:line};
 for(const value of [{...object,locked:true},{...object,measurement:{schema:1 as const,kind:'length' as const,unit:'cm' as const}},{...object,kind:'shape' as const}]){const result=clipPaperInkStroke(value,{x:50,y:0},{x:50,y:0},5);assert.equal(result.changed,false);assert.equal(result.reason,'ineligible-object');assert.equal(result.fragments[0],line);}
 assert.equal(clipPaperInkStroke({...object,mirrorX:'yes'} as unknown as PaperObject,{x:50,y:0},{x:50,y:0},5).reason,'invalid-transform');
 assert.equal(clipPaperInkStroke({...object,strokeWidth:Infinity},{x:50,y:0},{x:50,y:0},5).reason,'invalid-eraser');
});

test('A large distant stroke keeps its array and projects each original point exactly once',()=>{
 const points=Array.from({length:20000},(_,index)=>({x:index%2?1e9:0,y:0,time:index}));let calls=0;
 const result=clipPaperStroke(points,{x:5e8,y:500},{x:5e8,y:600},1,point=>{calls++;return point;});assert.equal(calls,points.length);assert.equal(result.changed,false);assert.equal(result.fragments[0],points);assert.equal(result.cuts.length,0);
});

test('The worst alternating sparse path has at most two cuts per segment and linear output size',()=>{
 const points=Array.from({length:20000},(_,index)=>({x:index%2?1e6:-1e6,y:0,time:index}));let calls=0;
 const result=clipPaperStroke(points,{x:0,y:0},{x:0,y:0},1,point=>{calls++;return point;});assert.equal(calls,points.length);assert.equal(result.fragments.length,points.length);assert.equal(result.cuts.length,2*(points.length-1));assert.equal(allPoints(result).length,3*points.length-2);
 assert.ok(result.fragments.every(fragment=>fragment.length<=3));assert.ok(allPoints(result).every(point=>point.pressure===undefined));
});
