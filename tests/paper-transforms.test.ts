import test from 'node:test';
import assert from 'node:assert/strict';
import {compactInk,resizePaperObject,expandPaperGroups,orderedPaperObjects} from '../src/lib/paperTransforms.ts';
import {objectPoint} from '../src/lib/paperGeometry.ts';
import {migratePaper} from '../src/lib/notebookDocument.ts';
const base=migratePaper('transform','text',null).objects[0];
test('Ink bounding box keeps every visible rotated point and pressure/time intact',()=>{
 const object={...base,kind:'ink' as const,x:40,y:90,width:794,height:1123,rotation:45,strokeWidth:3,points:[{x:160,y:400,time:1,pressure:.7},{x:260,y:410,time:2,pressure:.4}]};const normalized=compactInk(object);assert.ok(normalized.width<120);assert.equal(normalized.rotation,0);
 for(let i=0;i<object.points.length;i++){const before=objectPoint(object,object.points[i]),after=objectPoint(normalized,normalized.points![i]);assert.ok(Math.abs(before.x-after.x)<1e-9);assert.ok(Math.abs(before.y-after.y)<1e-9);assert.equal(normalized.points![i].pressure,object.points[i].pressure);assert.equal(normalized.points![i].time,object.points[i].time);}
});
test('Resizing scales ink and width, cannot mutate locked objects or accept invalid dimensions',()=>{
 const ink=compactInk({...base,kind:'ink',rotation:0,x:0,y:0,width:200,height:200,strokeWidth:2,points:[{x:20,y:20,time:1},{x:120,y:70,time:2}]});const twice=resizePaperObject(ink,ink.width*2,ink.height*2);assert.ok(Math.abs(twice.strokeWidth!-4)<1e-9);assert.ok(Math.abs(twice.points![1].x-ink.points![1].x*2)<1e-9);assert.throws(()=>resizePaperObject({...base,locked:true},40,40));assert.throws(()=>resizePaperObject(base,NaN,40));
});
test('Groups expand a selection without including unrelated objects, layering keeps stable relative order',()=>{
 const a={...base,id:'a',z:0,groupId:'g'},b={...base,id:'b',z:1,groupId:'g'},c={...base,id:'c',z:2},locked={...base,id:'locked',z:3,locked:true};const objects=[a,b,c,locked];assert.deepEqual(expandPaperGroups(objects,['a']),['a','b']);assert.deepEqual(orderedPaperObjects(objects,['a','b'],'front').map(o=>o.id),['c','locked','a','b']);assert.deepEqual(orderedPaperObjects(objects,['locked'],'back').map(o=>o.id),['a','b','c','locked']);
});
