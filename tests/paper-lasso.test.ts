import test from 'node:test';
import assert from 'node:assert/strict';
import {createPaperLassoSelection,lassoContains,objectPoint,pointInPolygon} from '../src/lib/paperGeometry.ts';
import {preparePaperLasso,type PaperLassoPoint} from '../src/lib/paperLasso.ts';
import type {InkPoint,PaperObject} from '../src/lib/notebookDocument.ts';
const ring=(left=0,top=0,right=10,bottom=10):PaperLassoPoint[]=>[{x:left,y:top},{x:right,y:top},{x:right,y:bottom},{x:left,y:bottom}];
const ink=(points:InkPoint[],patch:Partial<PaperObject>={}):PaperObject=>({id:'whole-stroke',pageId:'captured-page',kind:'ink',x:0,y:0,width:100,height:100,rotation:0,z:1,locked:false,createdAt:0,points,...patch});
const line=(a:PaperLassoPoint,b:PaperLassoPoint,patch:Partial<PaperObject>={})=>ink([{...a,time:100,pressure:0,tiltX:12,twist:160},{...b,time:120,pressure:.8,tiltY:-30,renderPressure:.4}],patch);

test('A sparse centreline crossing a lasso selects the entire original stroke with neither endpoint inside',()=>{
 const polygon=ring(),object=line({x:-1_000_000,y:5},{x:1_000_000,y:5}),before=structuredClone(object),points=object.points!;
 assert.ok(points.every(point=>!pointInPolygon(objectPoint(object,point),polygon)));assert.equal(lassoContains(object,polygon),true);assert.equal(createPaperLassoSelection(polygon)(object),true);assert.deepEqual(object,before);assert.equal(object.points,points);assert.equal(object.id,'whole-stroke');assert.equal(points.length,2,'No physical sample or derived point is introduced');
});
test('Wholly inside, disjoint and surrounding bounding boxes use the actual polygon rather than its AABB',()=>{
 const concave=[{x:0,y:0},{x:10,y:0},{x:10,y:3},{x:3,y:3},{x:3,y:10},{x:0,y:10}],select=createPaperLassoSelection(concave);
 assert.equal(select(line({x:1,y:1},{x:2,y:2})),true);assert.equal(select(line({x:4,y:4},{x:9,y:9})),false);assert.equal(select(line({x:-5,y:8},{x:5,y:8})),true);assert.equal(select(line({x:20,y:20},{x:30,y:30})),false);
});
test('Touching one polygon vertex, overlapping an edge and touching an endpoint all select ink',()=>{
 const select=createPaperLassoSelection(ring());assert.equal(select(line({x:-5,y:5},{x:5,y:-5})),true,'A single vertex tangency is a contact');assert.equal(select(line({x:-5,y:0},{x:15,y:0})),true,'Collinear edge overlap is a contact');assert.equal(select(line({x:15,y:5},{x:10,y:5})),true,'A stroke endpoint on the right boundary is included');assert.equal(select(line({x:-5,y:-1},{x:15,y:-1})),false);
});
test('Dots and repeated physical samples include the boundary without selecting a nearby thick brush',()=>{
 const select=createPaperLassoSelection(ring());for(const point of [{x:5,y:5},{x:10,y:5},{x:0,y:0}])assert.equal(select(ink([{...point,time:1}])),true);
 assert.equal(select(ink([{x:5,y:5,time:1},{x:5,y:5,time:2}])),true);assert.equal(select(ink([])),false);assert.equal(select(ink([{x:10.001,y:5,time:1}],{strokeWidth:1000})),false,'The contract is centreline contact, independent of brush width');
});
test('Concave rings, reverse winding, repeated closure and adjacent identical lasso samples keep the same closed region',()=>{
 const polygon=[{x:0,y:0},{x:10,y:0},{x:10,y:3},{x:3,y:3},{x:3,y:10},{x:0,y:10}],cross=line({x:-5,y:8},{x:5,y:8}),gap=line({x:4,y:4},{x:9,y:9});
 for(const input of [polygon,[...polygon].reverse(),[...polygon,polygon[0]],polygon.flatMap(point=>[point,point])]){const select=createPaperLassoSelection(input);assert.equal(select(cross),true);assert.equal(select(gap),false);}
});
test('An implicitly closed ring includes its closing boundary and the even-odd self-crossing convention stays explicit',()=>{
 const triangle=preparePaperLasso([{x:0,y:0},{x:10,y:0},{x:0,y:10}]);assert.equal(triangle.contains({x:0,y:5}),true);assert.equal(triangle.contains({x:8,y:8}),false);
 const crossed=[{x:0,y:0},{x:10,y:10},{x:0,y:10},{x:10,y:0}],region=preparePaperLasso(crossed);assert.equal(region.valid,true);assert.equal(region.contains({x:5,y:2}),true);assert.equal(region.contains({x:2,y:5}),false);assert.equal(region.contains({x:5,y:5}),true,'A crossing vertex lies on the ink boundary');
});
test('Sparse strokes are projected through the actual rotation and mirror geometry without changing sensor metadata',()=>{
 for(const rotation of [0,37,90,180])for(const mirrorX of [false,true])for(const mirrorY of [false,true]){
  const object=line({x:-10,y:50},{x:110,y:50},{x:100,y:200,rotation,mirrorX,mirrorY}),before=structuredClone(object),centre=objectPoint(object,{x:50,y:50}),polygon=ring(centre.x-5,centre.y-5,centre.x+5,centre.y+5);
  assert.ok(object.points!.every(point=>!pointInPolygon(objectPoint(object,point),polygon)));assert.equal(createPaperLassoSelection(polygon)(object),true);assert.equal(createPaperLassoSelection(ring(centre.x+500,centre.y+500,centre.x+510,centre.y+510))(object),false);assert.deepEqual(object,before);
 }
});
test('Other object kinds retain whole four-corner enclosure rather than adopting sparse-ink crossing',()=>{
 const select=createPaperLassoSelection(ring(0,0,100,100)),base={...ink([]),x:10,y:10,width:20,height:10,markdown:'Preserved original'};
 for(const kind of ['text','sticky','shape','image'] as const){assert.equal(select({...base,kind}),true);assert.equal(select({...base,kind,x:95}),false);assert.equal(select({...base,kind,x:-5,width:110}),false,'An object with a crossing edge is not selected just by touching the lasso');}
 assert.equal(select({...base,kind:'shape',x:40,y:40,rotation:45,mirrorX:true,mirrorY:true}),true);
});
test('Ink boundary inclusion does not change the global point-in-polygon predicate used elsewhere',()=>{
 const polygon=ring(),point={x:10,y:5},old=pointInPolygon(point,polygon);assert.equal(old,false);assert.equal(lassoContains(ink([{...point,time:0}]),polygon),true);assert.equal(pointInPolygon(point,polygon),old);
});
test('Empty, nonfinite and wholly aligned lassos and nonfinite object geometry refuse without altering originals',()=>{
 const object=line({x:-5,y:5},{x:15,y:5}),before=structuredClone(object);
 for(const polygon of [[],[{x:0,y:0}],[{x:0,y:0},{x:1,y:1}],[{x:0,y:0},{x:0,y:0},{x:0,y:0}],[{x:0,y:0},{x:1,y:1},{x:2,y:2}],[{x:0,y:0},{x:Infinity,y:1},{x:2,y:2}],[{x:0,y:0},{x:1,y:NaN},{x:2,y:2}]]){assert.equal(preparePaperLasso(polygon).valid,false);assert.equal(createPaperLassoSelection(polygon)(object),false);}
 const select=createPaperLassoSelection(ring());assert.equal(select({...object,rotation:NaN}),false);assert.equal(select({...object,x:Infinity}),false);assert.equal(select({...object,width:-1}),false);assert.equal(select({...object,points:[{x:NaN,y:5,time:0}]}),false);assert.equal(select({...object,points:[{x:5,y:5,time:0},{x:NaN,y:5,time:1}]}),false,'An invalid trailing sample cannot hide behind an early hit');assert.equal(select(line({x:-1e308,y:5},{x:1e308,y:5},{x:1e308,width:0,height:0})),false,'A later nonrepresentable world projection cannot hide behind an early hit');assert.deepEqual(object,before);
});
test('The prepared lasso captures one immutable region and never follows a mutable source polygon',()=>{
 const polygon=ring().map(point=>({...point})),before=structuredClone(polygon),region=preparePaperLasso(polygon),select=createPaperLassoSelection(polygon);assert.deepEqual(polygon,before);assert.equal(Object.isFrozen(region),true);assert.equal(Object.isFrozen(region.polygon),true);assert.equal(Object.isFrozen(region.polygon[0]),true);polygon.forEach(point=>{point.x+=1000;point.y+=1000;});polygon.push({x:2000,y:2000});assert.equal(region.contains({x:5,y:5}),true);assert.equal(select(line({x:-5,y:5},{x:15,y:5})),true);
});
test('Finite scale changes preserve the same geometric crossing without pixel tolerances or densification',()=>{
 for(const scale of [1e-100,1,1e100]){const select=createPaperLassoSelection(ring(0,0,10*scale,10*scale));assert.equal(select(line({x:-5*scale,y:5*scale},{x:15*scale,y:5*scale},{width:0,height:0})),true);assert.equal(select(line({x:-5*scale,y:11*scale},{x:15*scale,y:11*scale},{width:0,height:0})),false);}
});
test('Representable parallel gaps and extreme finite exponent ranges are not rounded into false contacts',()=>{
 const gap=2**-50,triangle=[{x:0,y:0},{x:1,y:1},{x:0,y:1}],select=createPaperLassoSelection(triangle);
 assert.equal(select(line({x:.1,y:.1-gap},{x:.9,y:.9-gap},{width:0,height:0})),false);assert.equal(select(line({x:.1,y:.1+gap},{x:.9,y:.9+gap},{width:0,height:0})),true);
 assert.equal(createPaperLassoSelection(ring(1e-308,1e-308,2e-308,2e-308))(line({x:-1e308,y:1e308},{x:1e308,y:-1e308},{width:0,height:0})),false,'A giant diagonal misses a tiny ring strictly in the positive quadrant');
 assert.equal(createPaperLassoSelection(ring(-1e-308,-1e-308,1e-308,1e-308))(line({x:-1e308,y:0},{x:1e308,y:0},{width:0,height:0})),true);
});
test('One prepared index reads a bounded large polygon once and reuses it across a distant object fixture',()=>{
 let reads=0;const count=4096,polygon=Array.from({length:count},(_,index)=>{const angle=index/count*Math.PI*2,x=Math.cos(angle)*100,y=Math.sin(angle)*100;return {get x(){reads++;return x;},get y(){reads++;return y;}};});const select=createPaperLassoSelection(polygon),capturedReads=reads;assert.equal(capturedReads,count*2,'Each captured lasso coordinate is read once');
 const outside=line({x:1000,y:1000},{x:2000,y:2000});for(let i=0;i<512;i++)assert.equal(select({...outside,id:'distant-'+i,x:i}),false);assert.equal(reads,capturedReads,'Object queries never re-read or rebuild from the original physical path');assert.equal(select(line({x:-1e6,y:0},{x:1e6,y:0})),true);assert.equal(reads,capturedReads);assert.equal(polygon.length,count);
 // Fixed-size source/index reuse evidence only; this is not a timing or a
 // universal page/object throughput claim.
});
