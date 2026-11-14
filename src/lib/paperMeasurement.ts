/** Measurements use canonical page coordinates, never CSS pixels, zoom or screen DPI. */
export interface PaperMeasurementPoint {readonly x:number;readonly y:number}
/** An optional PaperPage field. A missing calibration never implies physical units. */
export interface PaperMeasurementCalibration {readonly schema:1;readonly pageUnitsPerMm:number}
export type PaperPhysicalMeasurementUnit='mm'|'cm'|'m'|'in'|'ft';
export type PaperMeasurementUnit='page'|PaperPhysicalMeasurementUnit;
/** Optional metadata on an ink object; points/transform and its page remain authoritative. */
export interface PaperMeasurementMetadata {readonly schema:1;readonly kind:'length'|'area';readonly unit:PaperMeasurementUnit}
export interface PaperMeasurementValue {readonly value:number;readonly unit:PaperMeasurementUnit;readonly power:1|2}
export type PaperMeasurementErrorCode='invalid_calibration'|'calibration_required'|'invalid_unit'|'invalid_geometry'|'self_intersection'|'numeric_range';
export class PaperMeasurementError extends Error {
 readonly code:PaperMeasurementErrorCode;
 constructor(code:PaperMeasurementErrorCode,message:string){super(message);this.name='PaperMeasurementError';this.code=code;}
}
/** Area intersection checks are quadratic; measurement polygons are deliberately bounded. */
export const MAX_PAPER_MEASUREMENT_VERTICES=512;
/** Linear work for a measured ink path; independent of the quadratic polygon bound. */
export const MAX_PAPER_MEASUREMENT_LENGTH_POINTS=20_000;
const millimetres:Readonly<Record<PaperPhysicalMeasurementUnit,number>>={mm:1,cm:10,m:1000,in:25.4,ft:304.8};
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const positive=(value:unknown):value is number=>finite(value)&&value>0;
const fail=(code:PaperMeasurementErrorCode,message:string):never=>{throw new PaperMeasurementError(code,message);};

export function isPaperMeasurementCalibration(value:unknown):value is PaperMeasurementCalibration {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const fields=Object.keys(value),record=value as Record<string,unknown>;
 return fields.length===2&&Object.hasOwn(record,'schema')&&Object.hasOwn(record,'pageUnitsPerMm')&&record.schema===1&&positive(record.pageUnitsPerMm);
}
export function isPaperMeasurementMetadata(value:unknown):value is PaperMeasurementMetadata {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const fields=Object.keys(value),record=value as Record<string,unknown>;
 return fields.length===3&&['schema','kind','unit'].every(key=>Object.hasOwn(record,key))&&record.schema===1&&(record.kind==='length'||record.kind==='area')&&(record.unit==='page'||typeof record.unit==='string'&&Object.hasOwn(millimetres,record.unit));
}
function unitMillimetres(unit:unknown):number {
 if(typeof unit!=='string'||!Object.hasOwn(millimetres,unit))return fail('invalid_unit','Choisissez une unité physique reconnue.');
 return millimetres[unit as PaperPhysicalMeasurementUnit];
}
/** Reorder positive divisors to avoid overflow/underflow from intermediate products. */
function dividePositive(value:number,divisors:readonly number[]):number {
 const remaining=[...divisors];
 while(remaining.length){
  const indices=remaining.map((_,i)=>i).sort((a,b)=>value>=1?remaining[b]-remaining[a]:remaining[a]-remaining[b]);
  const index=indices.find(i=>positive(value/remaining[i]));
  if(index===undefined)return fail('numeric_range','La mesure dépasse la précision numérique disponible.');
  value/=remaining[index];remaining.splice(index,1);
 }
 return value;
}
/** Preserve full numeric precision; rounding and preferred display units belong to the view. */
export function createPaperMeasurementCalibration(pageLength:number,physicalLength:number,unit:PaperPhysicalMeasurementUnit):PaperMeasurementCalibration {
 if(!positive(pageLength)||!positive(physicalLength))return fail('invalid_calibration','Indiquez deux longueurs finies et strictement positives.');
 return {schema:1,pageUnitsPerMm:dividePositive(pageLength,[physicalLength,unitMillimetres(unit)])};
}
function pointsOf(points:readonly PaperMeasurementPoint[],minimum:number,maximum=MAX_PAPER_MEASUREMENT_VERTICES):PaperMeasurementPoint[] {
 if(!Array.isArray(points)||points.length<minimum||points.length>maximum)return fail('invalid_geometry',`Choisissez de ${minimum} à ${maximum} points de mesure.`);
 return points.map(point=>{
  if(!point||!finite(point.x)||!finite(point.y))return fail('invalid_geometry','Chaque point doit avoir des coordonnées finies.');
  return {x:point.x,y:point.y};
 });
}
function magnitude(value:number,power:1|2,calibration:PaperMeasurementCalibration|undefined,unit:PaperMeasurementUnit):PaperMeasurementValue {
 if(!positive(value))return fail('numeric_range','La mesure doit être non nulle et représentable.');
 if(calibration!==undefined&&!isPaperMeasurementCalibration(calibration))return fail('invalid_calibration','La calibration de cette page est invalide.');
 if(unit==='page')return {value,unit,power};
 const factor=unitMillimetres(unit);
 if(!calibration)return fail('calibration_required','Calibrez cette page avant de demander une mesure physique.');
 return {value:dividePositive(value,power===1?[calibration.pageUnitsPerMm,factor]:[calibration.pageUnitsPerMm,calibration.pageUnitsPerMm,factor,factor]),unit,power};
}
function polylineLength(points:readonly PaperMeasurementPoint[]):number {
 let sum=0,compensation=0;
 for(let i=1;i<points.length;i++){
  const length=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);
  if(!finite(length))return fail('numeric_range','La géométrie dépasse la précision numérique disponible.');
  const adjusted=length-compensation,next=sum+adjusted;compensation=(next-sum)-adjusted;sum=next;
  if(!finite(sum))return fail('numeric_range','La longueur dépasse la précision numérique disponible.');
 }
 if(!positive(sum))return fail('invalid_geometry','La longueur de mesure doit être non nulle.');
 return sum;
}
/** Consecutive samples may coincide; a wholly stationary path is refused.
 * Canonical magnitudes must be representable before physical unit conversion. */
export function paperMeasurementLength(points:readonly PaperMeasurementPoint[],calibration?:PaperMeasurementCalibration,unit:PaperMeasurementUnit='page'):PaperMeasurementValue {
 return magnitude(polylineLength(pointsOf(points,2,MAX_PAPER_MEASUREMENT_LENGTH_POINTS)),1,calibration,unit);
}

type Polygon={points:PaperMeasurementPoint[];normalized:PaperMeasurementPoint[];span:number};
// Dimensionless tolerance: it is unaffected by translation, zoom or display units.
const topologyTolerance=64*Number.EPSILON;
const cross=(a:PaperMeasurementPoint,b:PaperMeasurementPoint,c:PaperMeasurementPoint)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const orientation=(a:PaperMeasurementPoint,b:PaperMeasurementPoint,c:PaperMeasurementPoint)=>{const value=cross(a,b,c);return Math.abs(value)<=topologyTolerance?0:value<0?-1:1;};
const equalPoint=(a:PaperMeasurementPoint,b:PaperMeasurementPoint)=>a.x===b.x&&a.y===b.y;
const onSegment=(a:PaperMeasurementPoint,b:PaperMeasurementPoint,p:PaperMeasurementPoint)=>p.x>=Math.min(a.x,b.x)-topologyTolerance&&p.x<=Math.max(a.x,b.x)+topologyTolerance&&p.y>=Math.min(a.y,b.y)-topologyTolerance&&p.y<=Math.max(a.y,b.y)+topologyTolerance;
function intersects(a:PaperMeasurementPoint,b:PaperMeasurementPoint,c:PaperMeasurementPoint,d:PaperMeasurementPoint):boolean {
 const ac=orientation(a,b,c),ad=orientation(a,b,d),ca=orientation(c,d,a),cb=orientation(c,d,b);
 return (ac!==0&&ad!==0&&ca!==0&&cb!==0&&ac!==ad&&ca!==cb)||(ac===0&&onSegment(a,b,c))||(ad===0&&onSegment(a,b,d))||(ca===0&&onSegment(c,d,a))||(cb===0&&onSegment(c,d,b));
}
/** One simple ring, no holes. An exactly repeated closing point is accepted and removed on a copy. */
function polygonOf(input:readonly PaperMeasurementPoint[]):Polygon {
 const points=pointsOf(input,3,MAX_PAPER_MEASUREMENT_VERTICES+1);
 if(equalPoint(points[0],points.at(-1)!))points.pop();
 if(points.length<3||points.length>MAX_PAPER_MEASUREMENT_VERTICES)return fail('invalid_geometry','Une surface demande de 3 à 512 sommets distincts.');
 const left=Math.min(...points.map(p=>p.x)),right=Math.max(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y)),bottom=Math.max(...points.map(p=>p.y)),span=Math.max(right-left,bottom-top);
 if(!positive(span))return fail('invalid_geometry','La surface doit être non nulle et représentable.');
 const normalized=points.map(p=>({x:(p.x-left)/span,y:(p.y-top)/span}));
 for(let i=0;i<points.length;i++){
  const previous=normalized[(i+points.length-1)%points.length],current=normalized[i],next=normalized[(i+1)%points.length];
  if(equalPoint(points[i],points[(i+1)%points.length]))return fail('invalid_geometry','Un côté de la surface a une longueur nulle.');
  if(orientation(previous,current,next)===0&&(previous.x-current.x)*(next.x-current.x)+(previous.y-current.y)*(next.y-current.y)>0)return fail('self_intersection','La surface comporte un côté replié ou superposé.');
  for(let j=i+1;j<points.length;j++){
   if(j===i+1||(i===0&&j===points.length-1))continue;
   if(intersects(current,next,normalized[j],normalized[(j+1)%points.length]))return fail('self_intersection','Choisissez une surface simple, sans croisement ni contact avec elle-même.');
  }
 }
 return {points,normalized,span};
}
function polygonArea(polygon:Polygon):number {
 let sum=0,compensation=0;
 const origin=polygon.normalized[0];
 for(let i=1;i<polygon.normalized.length-1;i++){
  const adjusted=cross(origin,polygon.normalized[i],polygon.normalized[i+1])/2-compensation,next=sum+adjusted;compensation=(next-sum)-adjusted;sum=next;
 }
 if(Math.abs(sum)<=topologyTolerance)return fail('invalid_geometry','La surface est nulle ou trop proche d’un alignement pour être mesurée.');
 const area=(Math.abs(sum)*polygon.span)*polygon.span;
 if(!positive(area))return fail('numeric_range','La surface dépasse la précision numérique disponible.');
 return area;
}
export function paperMeasurementArea(points:readonly PaperMeasurementPoint[],calibration?:PaperMeasurementCalibration,unit:PaperMeasurementUnit='page'):PaperMeasurementValue {
 return magnitude(polygonArea(polygonOf(points)),2,calibration,unit);
}
/** Perimeter validates the same simple nondegenerate ring as the area. */
export function paperMeasurementPerimeter(points:readonly PaperMeasurementPoint[],calibration?:PaperMeasurementCalibration,unit:PaperMeasurementUnit='page'):PaperMeasurementValue {
 const polygon=polygonOf(points);polygonArea(polygon);
 return magnitude(polylineLength([...polygon.points,polygon.points[0]]),1,calibration,unit);
}
