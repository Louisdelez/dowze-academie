import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultPaperDrawingGuide,effectivePaperDrawingGuide,normalizePaperDrawingGuidePreference,paperGuideLength,type PaperDrawingGuideConfig} from '../src/lib/paperDrawingGuide.ts';
import {createPaperMeasurementCalibration,type PaperMeasurementCalibration} from '../src/lib/paperMeasurement.ts';

const segment=[{x:10,y:20},{x:410,y:20}];
const preference=(patch:Partial<PaperDrawingGuideConfig>={})=>({...defaultPaperDrawingGuide(),enabled:true,unit:'mm' as const,...patch});
const close=(actual:number,expected:number)=>assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<=Math.max(Math.abs(expected)*1e-12,Number.MIN_VALUE),`${actual} differs from ${expected}`);

test('The current page calibration drives the rule while another uncalibrated page stays in page units',()=>{
 const local=Object.freeze(preference({pageUnitsPerMm:9})),pageA=Object.freeze(createPaperMeasurementCalibration(400,100,'mm'));
 const a=effectivePaperDrawingGuide(local,pageA),b=effectivePaperDrawingGuide(local);
 assert.equal(a.pageUnitsPerMm,4);assert.deepEqual(paperGuideLength(segment,a),{value:100,unit:'mm'});
 assert.equal(Object.hasOwn(b,'pageUnitsPerMm'),false);assert.deepEqual(paperGuideLength(segment,b),{value:400,unit:'u. page'});
 assert.equal(local.pageUnitsPerMm,9);assert.equal(pageA.pageUnitsPerMm,4);
});

test('An old note-local ratio never becomes a canonical page calibration automatically',()=>{
 const local=preference({unit:'in',pageUnitsPerMm:400/25.4}),saved=JSON.stringify(local),view=effectivePaperDrawingGuide(local);
 assert.equal(view.unit,'page');assert.equal(Object.hasOwn(view,'pageUnitsPerMm'),false);assert.equal(JSON.stringify(local),saved);
 const canonical=createPaperMeasurementCalibration(400,2,'in'),calibrated=effectivePaperDrawingGuide(local,canonical);
 assert.equal(calibrated.unit,'in');close(paperGuideLength(segment,calibrated).value,2);assert.equal(JSON.stringify(local),saved);
});

test('Recalibration and reset change derived rule values without changing the original geometry or preference',()=>{
 const geometry=Object.freeze(segment.map(point=>Object.freeze({...point}))),local=Object.freeze(preference({pageUnitsPerMm:3}));
 const original=effectivePaperDrawingGuide(local,{schema:1,pageUnitsPerMm:4}),recalibrated=effectivePaperDrawingGuide(local,{schema:1,pageUnitsPerMm:2}),reset=effectivePaperDrawingGuide(local);
 assert.equal(paperGuideLength(geometry,original).value,100);assert.equal(paperGuideLength(geometry,recalibrated).value,200);assert.deepEqual(paperGuideLength(geometry,reset),{value:400,unit:'u. page'});
 assert.deepEqual(geometry,segment);assert.equal(local.unit,'mm');assert.equal(local.pageUnitsPerMm,3);
});

test('A valid canonical ratio above the old local limit is injected exactly',()=>{
 const local=preference({pageUnitsPerMm:2}),calibration=createPaperMeasurementCalibration(400,.000001,'mm'),view=effectivePaperDrawingGuide(local,calibration);
 assert.ok(calibration.pageUnitsPerMm>10000);assert.equal(view.pageUnitsPerMm,calibration.pageUnitsPerMm);assert.equal(view.unit,'mm');close(paperGuideLength(segment,view).value,.000001);
 for(const ratio of [10000.125,Number.MAX_VALUE,Number.MIN_VALUE])assert.equal(effectivePaperDrawingGuide(local,{schema:1,pageUnitsPerMm:ratio}).pageUnitsPerMm,ratio);
});

test('Invalid or noncanonical calibration data cannot fall back to an old local physical scale',()=>{
 const local=preference({pageUnitsPerMm:4});
 for(const value of [null,{schema:2,pageUnitsPerMm:4},{schema:1,pageUnitsPerMm:0},{schema:1,pageUnitsPerMm:-1},{schema:1,pageUnitsPerMm:Infinity},{schema:1,pageUnitsPerMm:NaN},{schema:1,pageUnitsPerMm:4,zoom:2}]){
  const view=effectivePaperDrawingGuide(local,value as unknown as PaperMeasurementCalibration);
  assert.equal(view.unit,'page');assert.equal(Object.hasOwn(view,'pageUnitsPerMm'),false);assert.deepEqual(paperGuideLength(segment,view),{value:400,unit:'u. page'});
 }
});

test('Local unit preferences survive normalization and reopening without a stored ratio',()=>{
 for(const unit of ['mm','in','page'] as const){
  const saved=normalizePaperDrawingGuidePreference(preference({unit})),reopened=normalizePaperDrawingGuidePreference(JSON.parse(JSON.stringify(saved)));
  assert.equal(saved.unit,unit);assert.equal(reopened.unit,unit);assert.equal(Object.hasOwn(reopened,'pageUnitsPerMm'),false);
  assert.equal(effectivePaperDrawingGuide(reopened).unit,'page');assert.equal(effectivePaperDrawingGuide(reopened,{schema:1,pageUnitsPerMm:4}).unit,unit);
 }
});

test('The local preference keeps its historical ratio while effective views normalize geometry and use only the canonical ratio',()=>{
 const raw=preference({x:NaN,y:200,angle:-450,space:'screen',snapDistancePx:200,pageUnitsPerMm:2}),saved=normalizePaperDrawingGuidePreference(raw),view=effectivePaperDrawingGuide(saved,{schema:1,pageUnitsPerMm:4});
 assert.equal(saved.pageUnitsPerMm,2);assert.equal(saved.unit,'mm');assert.equal(saved.x,397);assert.equal(saved.angle,270);assert.equal(saved.snapDistancePx,80);
 assert.equal(view.pageUnitsPerMm,4);assert.equal(view.x,saved.x);assert.equal(view.y,200);assert.equal(view.angle,270);assert.equal(view.space,'screen');assert.equal(view.snapDistancePx,80);assert.equal(saved.pageUnitsPerMm,2);
});
