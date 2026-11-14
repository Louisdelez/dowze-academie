import test from 'node:test';
import assert from 'node:assert/strict';
import type {PaperObject,PaperPage} from '../src/lib/notebookDocument.ts';
import {describePaperMeasurementObject,formatPaperMeasurementValue} from '../src/lib/paperMeasurementObject.ts';
import {objectPoint,pointInPolygon} from '../src/lib/paperGeometry.ts';
import {resizePaperObject} from '../src/lib/paperTransforms.ts';

const close=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<=Math.max(1,Math.abs(expected))*1e-10,`${actual} ≠ ${expected}`);
const page:PaperPage={id:'page-a',width:794,height:1123,pattern:'plain',color:'#ffffff',bookmark:false,rotation:0,calibration:{schema:1,pageUnitsPerMm:4}};
const line:PaperObject={id:'length-a',pageId:page.id,kind:'ink',x:20,y:30,width:100,height:100,rotation:0,z:1,locked:false,createdAt:0,points:[{x:0,y:0,time:1},{x:0,y:80,time:2},{x:60,y:80,time:3}],measurement:{schema:1,kind:'length',unit:'cm'}};
const area:PaperObject={...line,id:'area-a',width:200,height:100,measurement:{schema:1,kind:'area',unit:'cm'},points:[{x:0,y:0,time:1},{x:200,y:0,time:2},{x:200,y:100,time:3},{x:0,y:100,time:4}]};

test('Polyline label follows half the travelled path rather than sample index or bounding-box midpoint',()=>{
 const description=describePaperMeasurementObject(line,page)!;
 assert.equal(description.status,'measured');close(description.value!.value,3.5);
 close(description.anchor!.x,20);close(description.anchor!.y,100);
 assert.match(description.label,/3,5 cm$/);assert.match(description.accessibleLabel,/Longueur/);
 assert.ok(Object.isFrozen(description));assert.ok(Object.isFrozen(description.anchor));assert.ok(Object.isFrozen(description.value));
});

test('Rotation and mirror map the anchor to world page coordinates while preserving the magnitude',()=>{
 const object={...line,rotation:90,mirrorX:true},description=describePaperMeasurementObject(object,page)!;
 close(description.value!.value,3.5);close(description.anchor!.x,50);close(description.anchor!.y,130);
 assert.deepEqual(line.points,[{x:0,y:0,time:1},{x:0,y:80,time:2},{x:60,y:80,time:3}]);
});

test('Area labels derive current transformed geometry and squared calibration',()=>{
 const original=describePaperMeasurementObject(area,page)!,resized=describePaperMeasurementObject(resizePaperObject(area,400,200),page)!;
 close(original.value!.value,12.5);assert.match(original.label,/12,5 cm²$/);
 close(original.anchor!.x,120);close(original.anchor!.y,80);
 // compactInk includes drawing padding; calculate the actual point-transform effect independently.
 const points=resizePaperObject(area,400,200).points!,width=points[1].x-points[0].x,height=points[2].y-points[1].y;
 close(resized.value!.value,width*height/(4*4*10*10));
 assert.notEqual(resized.value!.value,original.value!.value);
});

test('A concave surface gets an interior anchor, including when its geometric centroid lies outside',()=>{
 const polygon=[{x:0,y:0,time:1},{x:4,y:0,time:2},{x:4,y:1,time:3},{x:1,y:1,time:4},{x:1,y:4,time:5},{x:0,y:4,time:6}],object={...area,x:100,y:200,width:4,height:4,rotation:31,points:polygon},description=describePaperMeasurementObject(object,page)!;
 const world=polygon.map(p=>objectPoint(object,p));
 assert.equal(description.status,'measured');assert.ok(pointInPolygon(description.anchor!,world));
 close(description.value!.value,7/(4*4*10*10));
});

test('An exact closing point and reversed winding preserve the area label and world centroid',()=>{
 const reversed=[...area.points!].reverse(),closed=[...reversed,reversed[0]],original=structuredClone(closed),description=describePaperMeasurementObject({...area,points:closed},page)!;
 close(description.value!.value,12.5);close(description.anchor!.x,120);close(description.anchor!.y,80);
 assert.match(description.label,/cm²$/);assert.deepEqual(closed,original);
});

test('Clipboard target calibration and recalibration change only the derived result',()=>{
 const target={...page,id:'page-b',calibration:{schema:1 as const,pageUnitsPerMm:2}},copied={...area,pageId:target.id},original=structuredClone(area);
 close(describePaperMeasurementObject(copied,target)!.value!.value,4*describePaperMeasurementObject(area,page)!.value!.value);
 const recalibrated={...page,calibration:{schema:1 as const,pageUnitsPerMm:8}};
 close(describePaperMeasurementObject(area,recalibrated)!.value!.value,describePaperMeasurementObject(area,page)!.value!.value/4);
 assert.deepEqual(area,original);
 assert.equal(describePaperMeasurementObject(area,target)!.errorCode,'page_mismatch');
});

test('Missing calibration is explicit, and invalid geometry never emits a physical value',()=>{
 const uncalibrated=describePaperMeasurementObject(line,{...page,calibration:undefined})!;
 assert.equal(uncalibrated.status,'uncalibrated');assert.equal(uncalibrated.value,null);assert.equal(uncalibrated.label,'Non calibré');assert.ok(uncalibrated.anchor);
 const pageUnits=describePaperMeasurementObject({...line,measurement:{schema:1,kind:'length',unit:'page'}},{...page,calibration:undefined})!;
 close(pageUnits.value!.value,140);assert.match(pageUnits.label,/u\. page$/);
 const crossing={...area,points:[{x:0,y:0,time:1},{x:10,y:10,time:2},{x:0,y:10,time:3},{x:10,y:0,time:4}]},invalid=describePaperMeasurementObject(crossing,page)!;
 assert.equal(invalid.status,'invalid');assert.equal(invalid.value,null);assert.equal(invalid.anchor,null);assert.equal(invalid.errorCode,'self_intersection');assert.equal(invalid.label,'Mesure invalide');
 assert.equal(describePaperMeasurementObject({...line,measurement:undefined},page),null);
});

test('Zero-length samples do not move the midpoint, and world transforms remain bounded before drawing a label',()=>{
 const repeated={...line,points:[{x:0,y:0,time:0},{x:0,y:0,time:1},...line.points!.slice(1)]},description=describePaperMeasurementObject(repeated,page)!;
 close(description.anchor!.x,20);close(description.anchor!.y,100);
 assert.equal(describePaperMeasurementObject({...line,rotation:NaN},page)!.status,'invalid');
 const invalidCalibration=describePaperMeasurementObject(line,{...page,calibration:{schema:1,pageUnitsPerMm:NaN}})!;
 assert.equal(invalidCalibration.status,'invalid');assert.equal(invalidCalibration.value,null);assert.equal(invalidCalibration.anchor,null);
});

test('Presentation strings round separately while canonical values retain precision',()=>{
 const value={value:Math.PI,unit:'m' as const,power:2 as const},label=formatPaperMeasurementValue(value);
 assert.match(label,/3,14159 m²$/);assert.equal(value.value,Math.PI);
 assert.ok(formatPaperMeasurementValue({value:1e-12,unit:'mm',power:1}).length<30);
 const description=describePaperMeasurementObject({...line,x:500,y:900,rotation:180},page)!;
 close(description.value!.value,3.5);
});
