import test from 'node:test';
import assert from 'node:assert/strict';
import {inkOutline,pointInPolygon,objectPoint,lassoContains} from '../src/lib/paperGeometry.ts';
import {migratePaper} from '../src/lib/notebookDocument.ts';
test('Ink geometry preserves positions and reflects actual reported pressure',()=>{
 const low=inkOutline([{x:10,y:10,time:0,pressure:.2},{x:20,y:10,time:1,pressure:.2}],10),high=inkOutline([{x:10,y:10,time:0,pressure:1},{x:20,y:10,time:1,pressure:1}],10);
 assert.match(low,/10,12/);assert.match(high,/10,20/);assert.equal(inkOutline([],3),'');assert.equal(inkOutline([{x:5,y:5,time:0}],4),'M3 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0');
});
test('Lasso follows the actual polygon rather than its bounding rectangle',()=>{
 const polygon=[{x:0,y:0,time:0},{x:100,y:0,time:0},{x:100,y:20,time:0},{x:20,y:20,time:0},{x:20,y:100,time:0},{x:0,y:100,time:0}];assert.equal(pointInPolygon({x:10,y:80},polygon),true);assert.equal(pointInPolygon({x:80,y:80},polygon),false);
 const base=migratePaper('geometry','',null).objects[0];const inCorner={...base,x:60,y:60,width:10,height:10};assert.equal(lassoContains(inCorner,polygon),false);assert.equal(lassoContains({...inCorner,x:2,y:30},polygon),true);
});
test('Rotated object coordinates use the same centre as its DOM and SVG transform',()=>{
 const base={...migratePaper('geometry','',null).objects[0],x:10,y:20,width:100,height:50,rotation:90};const p=objectPoint(base,{x:0,y:0});assert.ok(Math.abs(p.x-85)<.0001);assert.ok(Math.abs(p.y+5)<.0001);
});
