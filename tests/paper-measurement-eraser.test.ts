import test from 'node:test';
import assert from 'node:assert/strict';
import {eraseInk,type PaperObject} from '../src/lib/notebookDocument.ts';
import {objectPoint} from '../src/lib/paperGeometry.ts';
const line=():PaperObject=>({id:'sparse-measured-line',pageId:'page',kind:'ink',x:0,y:0,width:100000,height:2,rotation:0,z:1,locked:false,createdAt:1,strokeWidth:2,measurement:{schema:1,kind:'length',unit:'page'},points:[{x:0,y:0,time:1},{x:100000,y:0,time:2}]});
test('A sparse measured segment is removed by a swept crossing even when its endpoint samples are far away',()=>{
 const object=line(),before=structuredClone(object);assert.deepEqual(eraseInk(object,{x:50000,y:-10},{x:50000,y:10},1,false),[]);assert.deepEqual(object,before);
});
test('Whole deletion observes endpoints, tangency and degenerate eraser contacts without cutting nearby untouched segments',()=>{
 const object=line();assert.deepEqual(eraseInk(object,{x:400,y:2},{x:400,y:2},1,true),[]);assert.deepEqual(eraseInk(object,{x:0,y:0},{x:0,y:0},0,true),[]);
 assert.equal(eraseInk(object,{x:400,y:2.01},{x:400,y:2.01},1,true)[0],object);assert.equal(eraseInk(object,{x:-100,y:-1},{x:-100,y:1},1,true)[0],object);
});
test('Whole erasure uses world rotation and mirrors rather than the untransformed bounds',()=>{
 const object={...line(),x:20,y:30,width:100,height:50,rotation:37,mirrorX:true,points:[{x:10,y:25,time:1},{x:90,y:25,time:2}]},center=objectPoint(object,{x:50,y:25});
 assert.deepEqual(eraseInk(object,center,center,1,true),[]);const far={x:center.x+400,y:center.y+400};assert.equal(eraseInk(object,far,far,1,true)[0],object);
});
test('A non-hit on twenty thousand very long segments reads each original once without sample densification',()=>{
 const object=line();let reads=0;object.points=Array.from({length:20000},(_,i)=>{const point={y:0,time:i};Object.defineProperty(point,'x',{enumerable:true,get(){reads++;return i%2?100000:0;}});return point as {x:number;y:number;time:number};});
 assert.equal(eraseInk(object,{x:50000,y:500},{x:50000,y:600},1,false)[0],object);assert.equal(reads,20000);
});
test('Locked measurements, invalid radii and invalid eraser contacts retain their exact source',()=>{
 const object=line(),locked={...object,locked:true};assert.equal(eraseInk(locked,{x:50,y:0},{x:50,y:0},1,true)[0],locked);
 for(const radius of [NaN,Infinity,-5])assert.equal(eraseInk(object,{x:50,y:0},{x:50,y:0},radius,true)[0],object);
 assert.equal(eraseInk(object,{x:NaN,y:0},{x:50,y:0},1,true)[0],object);
});

test('A finite but unrepresentable parallel segment pair is not mistaken for a collinear hit',()=>{
 const object:PaperObject={...line(),measurement:undefined,width:0,height:0,strokeWidth:0,points:[{x:-1e308,y:-1e308,time:1},{x:1e308,y:0,time:2}]};
 assert.equal(eraseInk(object,{x:-1e308,y:0},{x:1e308,y:1e308},0,true)[0],object);
});


test('Partial fragment identities stay canonical even when the source uses the maximum permitted ID length',()=>{
 const object={...line(),id:'x'.repeat(200),measurement:undefined,width:100,height:2,points:[{x:0,y:0,time:1,pressure:.4},{x:100,y:0,time:2,pressure:.8}]};const fragments=eraseInk(object,{x:50,y:-10},{x:50,y:10},2,false);assert.equal(fragments.length,2);assert.ok(fragments.every(fragment=>fragment.id.length<=200&&fragment.id!==object.id));assert.equal(new Set(fragments.map(fragment=>fragment.id)).size,2);assert.equal(object.points[0].pressure,.4);
});
