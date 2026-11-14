import test from 'node:test';
import assert from 'node:assert/strict';
import {paperInkRenderPressure,inkOutline,calligraphyOutline,paperInkPointOnPage} from '../src/lib/paperGeometry.ts';
import {migratePaper,isPaperDocument,type InkPoint,type PaperObject} from '../src/lib/notebookDocument.ts';
const points:InkPoint[]=[{x:0,y:10,time:0,pressure:.25},{x:20,y:10,time:2,renderPressure:.6},{x:40,y:10,time:4,pressure:.8}];
test('Derived visual pressure renders a geometric cut without creating a device pressure value',()=>{
 assert.equal(paperInkRenderPressure(points[1]),.6);assert.equal(points[1].pressure,undefined);const before=structuredClone(points);
 const visual=points.map(point=>({...point,pressure:paperInkRenderPressure(point)}));assert.equal(inkOutline(points,4),inkOutline(visual,4));assert.equal(inkOutline(points,4,true),inkOutline(visual,4,true));assert.deepEqual(points,before);
});
test('Calligraphy preserves source telemetry and applies its own nib projection to a derived cut width',()=>{
 const before=structuredClone(points),visual=points.map(point=>{const {renderPressure,...rest}=point;return {...rest,pressure:paperInkRenderPressure(point)};});
 assert.equal(calligraphyOutline(points,4,45),calligraphyOutline(visual,4,45));assert.deepEqual(points,before);assert.equal(points[1].pressure,undefined);
});
test('Canonical documents retain finite derived render widths separately from sensor fields',()=>{
 const doc=migratePaper('derived-ink-pressure','Original',null),ink:PaperObject={id:'cut-ink',pageId:doc.pages[0].id,kind:'ink',x:0,y:0,width:40,height:20,rotation:0,z:1,locked:false,createdAt:1,points};doc.objects.push(ink);const restored=JSON.parse(JSON.stringify(doc));assert.equal(isPaperDocument(restored),true);assert.deepEqual(restored.objects[1].points,points);assert.equal(restored.objects[1].points[1].pressure,undefined);
 for(const value of [-.1,1.1,NaN,Infinity,'sensor'])assert.equal(isPaperDocument({...doc,objects:[{...ink,points:[points[0],{...points[1],renderPressure:value},points[2]]}]}),false);
});
test('Geometric mapping keeps the derived width and original reported sensor values distinct',()=>{
 const object:PaperObject={id:'mirrored-cut',pageId:'page',kind:'ink',x:20,y:30,width:40,height:20,rotation:90,mirrorX:true,z:1,locked:false,createdAt:1},point={...points[1],twist:30,tiltX:10,tiltY:20},before={...point};const mapped=paperInkPointOnPage(object,point);assert.equal(mapped.renderPressure,.6);assert.equal(mapped.pressure,undefined);assert.equal(mapped.twist,30);assert.deepEqual(point,before);
});
