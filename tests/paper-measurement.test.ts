import test from 'node:test';
import assert from 'node:assert/strict';
import {createPaperMeasurementCalibration,isPaperMeasurementCalibration,isPaperMeasurementMetadata,paperMeasurementLength,paperMeasurementArea,paperMeasurementPerimeter,PaperMeasurementError,MAX_PAPER_MEASUREMENT_VERTICES,MAX_PAPER_MEASUREMENT_LENGTH_POINTS,type PaperMeasurementPoint,type PaperPhysicalMeasurementUnit} from '../src/lib/paperMeasurement.ts';

const close=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<=Math.max(1,Math.abs(expected))*1e-11,`${actual} ≠ ${expected}`);
const refuses=(operation:()=>unknown,code:string)=>assert.throws(operation,(error:unknown)=>error instanceof PaperMeasurementError&&error.code===code);
const rectangle:readonly PaperMeasurementPoint[]=[{x:0,y:0},{x:200,y:0},{x:200,y:100},{x:0,y:100}];

test('Canonical metadata is versioned and does not store stale viewport or derived magnitudes',()=>{
 assert.equal(isPaperMeasurementMetadata({schema:1,kind:'length',unit:'mm'}),true);
 assert.equal(isPaperMeasurementMetadata({schema:1,kind:'area',unit:'m'}),true);
 assert.equal(isPaperMeasurementMetadata({schema:1,kind:'area',unit:'page'}),true);
 for(const metadata of [{schema:2,kind:'area',unit:'m'},{schema:1,kind:'area',unit:'pixel'},{schema:1,kind:'volume',unit:'m'},{schema:1,kind:'area',unit:'m',value:10},{schema:1,kind:'area',unit:'m',zoom:2}])assert.equal(isPaperMeasurementMetadata(metadata),false);
});

test('A known reference establishes one page calibration, including metric and imperial input',()=>{
 const references:[number,PaperPhysicalMeasurementUnit][]=[[100,'mm'],[10,'cm'],[.1,'m'],[100/25.4,'in'],[100/304.8,'ft']];
 for(const [physical,unit] of references)close(createPaperMeasurementCalibration(400,physical,unit).pageUnitsPerMm,4);
 assert.equal(isPaperMeasurementCalibration({schema:1,pageUnitsPerMm:4}),true);
 for(const value of [{schema:2,pageUnitsPerMm:4},{schema:1,pageUnitsPerMm:0},{schema:1,pageUnitsPerMm:-1},{schema:1,pageUnitsPerMm:Infinity},{schema:1,pageUnitsPerMm:NaN},{schema:1,pageUnitsPerMm:4,zoom:2}])assert.equal(isPaperMeasurementCalibration(value),false);
 for(const value of [0,-1,NaN,Infinity]){
  refuses(()=>createPaperMeasurementCalibration(value,100,'mm'),'invalid_calibration');
  refuses(()=>createPaperMeasurementCalibration(400,value,'mm'),'invalid_calibration');
 }
 refuses(()=>createPaperMeasurementCalibration(400,100,'pixel' as PaperPhysicalMeasurementUnit),'invalid_unit');
});

test('Physical units are explicit and area conversion uses the square of the linear factor',()=>{
 const calibration=createPaperMeasurementCalibration(400,100,'mm');
 close(paperMeasurementLength([{x:0,y:0},{x:12,y:16}],calibration,'mm').value,5);
 close(paperMeasurementLength([{x:0,y:0},{x:400,y:0}],calibration,'cm').value,10);
 close(paperMeasurementArea(rectangle,calibration,'mm').value,1250);
 close(paperMeasurementArea(rectangle,calibration,'cm').value,12.5);
 close(paperMeasurementArea(rectangle,calibration,'m').value,.00125);
 close(paperMeasurementArea(rectangle,calibration,'in').value,1250/(25.4*25.4));
 close(paperMeasurementArea(rectangle,calibration,'ft').value,1250/(304.8*304.8));
 assert.equal(paperMeasurementArea(rectangle,calibration,'cm').power,2);
 close(paperMeasurementPerimeter(rectangle,calibration,'mm').value,150);
 assert.equal(paperMeasurementLength([{x:0,y:0},{x:3,y:4}]).unit,'page');
 refuses(()=>paperMeasurementArea(rectangle,undefined,'mm'),'calibration_required');
});

test('Inverse viewport projection leaves canonical measurements unchanged at different zooms',()=>{
 const calibration=createPaperMeasurementCalibration(400,100,'mm'),original=structuredClone(rectangle),expected=paperMeasurementArea(rectangle,calibration,'cm').value;
 for(const zoom of [.25,.5,1,2,6]){
  const screen=rectangle.map(p=>({x:73+zoom*p.x,y:41+zoom*p.y}));
  const canonical=screen.map(p=>({x:(p.x-73)/zoom,y:(p.y-41)/zoom}));
  close(paperMeasurementArea(canonical,calibration,'cm').value,expected);
 }
 assert.deepEqual(rectangle,original);
});

test('Rigid transforms, reflection and winding preserve length/area; document scaling changes them by degree',()=>{
 const angle=.73,rotated=rectangle.map(p=>({x:1e9+p.x*Math.cos(angle)-p.y*Math.sin(angle),y:-1e9+p.x*Math.sin(angle)+p.y*Math.cos(angle)}));
 // Translation at a large coordinate introduces representational error before the calculation.
 assert.ok(Math.abs(paperMeasurementArea(rotated).value-20000)<.001);
 const reflected=rectangle.map(p=>({x:500-p.x,y:1000+p.y}));
 close(paperMeasurementArea(reflected).value,20000);
 close(paperMeasurementArea([...rectangle].reverse()).value,20000);
 close(paperMeasurementPerimeter(reflected).value,600);
 const scaled=rectangle.map(p=>({x:3*p.x,y:3*p.y}));
 close(paperMeasurementArea(scaled).value,9*20000);
 close(paperMeasurementPerimeter(scaled).value,3*600);
});

test('Concave simple polygons have area independent of a repeated closing point',()=>{
 const polygon=[{x:0,y:0},{x:4,y:0},{x:4,y:1},{x:1,y:1},{x:1,y:4},{x:0,y:4}],original=structuredClone(polygon);
 close(paperMeasurementArea(polygon).value,7);
 close(paperMeasurementArea([...polygon,polygon[0]]).value,7);
 close(paperMeasurementPerimeter(polygon).value,16);
 assert.deepEqual(polygon,original);
});

test('Crossings, contacts and adjacent backtracking are refused rather than producing a misleading surface',()=>{
 const invalid=[
  [{x:0,y:0},{x:10,y:10},{x:0,y:10},{x:10,y:0}],
  [{x:0,y:0},{x:4,y:0},{x:4,y:4},{x:2,y:0},{x:0,y:4}],
  [{x:0,y:0},{x:4,y:0},{x:2,y:0},{x:0,y:4}],
  [{x:0,y:0},{x:4,y:0},{x:4,y:4},{x:0,y:0},{x:0,y:4}]
 ];
 for(const polygon of invalid){refuses(()=>paperMeasurementArea(polygon),'self_intersection');refuses(()=>paperMeasurementPerimeter(polygon),'self_intersection');}
 // A collinear vertex along a side is not a backtracking overlap.
 close(paperMeasurementArea([{x:0,y:0},{x:2,y:0},{x:4,y:0},{x:4,y:4},{x:0,y:4}]).value,16);
});

test('Degenerate, unbounded and nonfinite geometry is refused; positive paths may contain repeated samples',()=>{
 refuses(()=>paperMeasurementLength([{x:2,y:3},{x:2,y:3}]),'invalid_geometry');
 refuses(()=>paperMeasurementArea([{x:0,y:0},{x:1,y:0},{x:2,y:0}]),'self_intersection');
 refuses(()=>paperMeasurementArea([{x:0,y:0},{x:0,y:0},{x:1,y:1}]),'invalid_geometry');
 refuses(()=>paperMeasurementArea([{x:0,y:0},{x:1,y:0},{x:0,y:Infinity}]),'invalid_geometry');
 refuses(()=>paperMeasurementLength([{x:-Number.MAX_VALUE,y:0},{x:Number.MAX_VALUE,y:0}]),'numeric_range');
 refuses(()=>paperMeasurementArea(Array.from({length:MAX_PAPER_MEASUREMENT_VERTICES+2},(_,i)=>({x:i,y:i%2}))),'invalid_geometry');
 close(paperMeasurementLength([{x:0,y:0},{x:0,y:0},{x:3,y:4},{x:6,y:4}]).value,8);
});

test('A calibration is page-specific, and recalibration derives new values without altering geometry',()=>{
 const original=structuredClone(rectangle),pageA=createPaperMeasurementCalibration(400,100,'mm'),pageB=createPaperMeasurementCalibration(400,200,'mm');
 close(paperMeasurementArea(rectangle,pageB,'mm').value,4*paperMeasurementArea(rectangle,pageA,'mm').value);
 close(paperMeasurementPerimeter(rectangle,pageB,'mm').value,2*paperMeasurementPerimeter(rectangle,pageA,'mm').value);
 assert.deepEqual(rectangle,original);
 assert.deepEqual(pageA,{schema:1,pageUnitsPerMm:4});
});

test('Ink path length is linear and accepts more samples than a polygon surface',()=>{
 const points=Array.from({length:1025},(_,i)=>({x:i,y:0}));
 close(paperMeasurementLength(points).value,1024);
 refuses(()=>paperMeasurementLength(Array.from({length:MAX_PAPER_MEASUREMENT_LENGTH_POINTS+1},(_,i)=>({x:i,y:0}))),'invalid_geometry');
});

test('Balanced unit divisors avoid intermediate overflow, while unrepresentable results remain explicit errors',()=>{
 const calibration=createPaperMeasurementCalibration(1e308,1e308,'m');
 close(calibration.pageUnitsPerMm,.001);
 const result=paperMeasurementLength([{x:0,y:0},{x:1e308,y:0}],calibration,'m');
 assert.ok(Number.isFinite(result.value));
 close(result.value/1e308,1);
 refuses(()=>paperMeasurementLength([{x:0,y:0},{x:1e308,y:0}],{schema:1,pageUnitsPerMm:Number.MIN_VALUE},'mm'),'numeric_range');
 refuses(()=>paperMeasurementLength([{x:0,y:0},{x:Number.MIN_VALUE,y:0}],{schema:1,pageUnitsPerMm:Number.MAX_VALUE},'mm'),'numeric_range');
});
