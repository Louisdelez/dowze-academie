import {objectPoint} from './paperGeometry.ts';
import type {InkPoint,PaperObject} from './notebookDocument.ts';

export interface PaperStrokeErasePosition {readonly x:number;readonly y:number}
/** Visual interpolation is separate from the original device pressure. */
export interface PaperStrokeErasePoint extends InkPoint {renderPressure?:number}
export type PaperStrokeErasePressureSource='sensor'|'derived'|'default';
export interface PaperStrokeEraseCut {
 readonly schema:1;
 readonly kind:'eraser-boundary';
 readonly fragmentIndex:number;
 readonly pointIndex:number;
 readonly sourceSegment:number;
 readonly fraction:number;
 readonly renderPressureSources:readonly [PaperStrokeErasePressureSource,PaperStrokeErasePressureSource];
}
export type PaperStrokeEraseReason='invalid-eraser'|'invalid-sample'|'non-monotone-time'|'invalid-transform'|'precision-range'|'ineligible-object';
export interface PaperStrokeEraseResult {
 readonly changed:boolean;
 readonly status:'unchanged'|'clipped'|'erased';
 readonly fragments:readonly (readonly PaperStrokeErasePoint[])[];
 /** Ephemeral provenance; the caller owns any canonical metadata migration. */
 readonly cuts:readonly PaperStrokeEraseCut[];
 readonly reason?:PaperStrokeEraseReason;
}
export type PaperStrokeEraseProjection=(point:PaperStrokeErasePosition,index:number)=>PaperStrokeErasePosition;
type Interval=readonly [number,number];
type Capsule={from:PaperStrokeErasePosition;dx:number;dy:number;radius:number};
type PendingCut=Omit<PaperStrokeEraseCut,'fragmentIndex'>;
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const identity:PaperStrokeEraseProjection=point=>point;
function unchanged(points:readonly PaperStrokeErasePoint[],reason?:PaperStrokeEraseReason):PaperStrokeEraseResult {
 return {changed:false,status:'unchanged',fragments:points.length?[points]:[],cuts:[],...(reason?{reason}:{})};
}
function interval(low:number,high:number):Interval|null {
 const first=Math.max(0,low),last=Math.min(1,high);
 return first<=last?[first,last]:null;
}
/** Slab clipping also handles a zero-radius, collinear swept segment. */
function rectangleInterval(a:number,b:number,c:number,d:number,length:number,radius:number):Interval|null {
 let first=0,last=1;
 for(const [start,end,low,high] of [[a,b,0,length],[c,d,-radius,radius]]){
  const delta=end-start;
  if(delta===0){if(start<low||start>high)return null;continue;}
  const p=(low-start)/delta,q=(high-start)/delta;
  first=Math.max(first,Math.min(p,q));last=Math.min(last,Math.max(p,q));
  if(first>last)return null;
 }
 return [first,last];
}
/** Projection/distance avoids the squared-coordinate quadratic overflow. */
function diskInterval(a:PaperStrokeErasePosition,dx:number,dy:number,length:number,center:PaperStrokeErasePosition,radius:number):Interval|null {
 const ux=dx/length,uy=dy/length,cx=center.x-a.x,cy=center.y-a.y;
 const along=cx*ux+cy*uy,p=cx*uy,q=cy*ux,perpendicular=Math.abs(p-q);
 // A contact indistinguishable from tangency at floating-point precision
 // removes no length. This tolerance scales with the projection arithmetic.
 const error=8*Number.EPSILON*(Math.abs(p)+Math.abs(q)+radius);
 if(perpendicular>radius+error)return null;
 const half=Math.abs(perpendicular-radius)<=error?0:radius*Math.sqrt(Math.max(0,(1-perpendicular/radius)*(1+perpendicular/radius)));
 return interval((along-half)/length,(along+half)/length);
}
/** One convex capsule intersects a straight segment in at most one interval. */
function capsuleInterval(a:PaperStrokeErasePosition,b:PaperStrokeErasePosition,capsule:Capsule):Interval|null|'precision-range' {
 const ax=a.x-capsule.from.x,ay=a.y-capsule.from.y,bx=b.x-capsule.from.x,by=b.y-capsule.from.y;
 if(![ax,ay,bx,by].every(finite))return 'precision-range';
 const scale=Math.max(Math.abs(ax),Math.abs(ay),Math.abs(bx),Math.abs(by),Math.abs(capsule.dx),Math.abs(capsule.dy),capsule.radius);
 if(scale===0)return [0,1];
 const values=[ax,ay,bx,by,capsule.dx,capsule.dy,capsule.radius],normalized=values.map(value=>value/scale);
 if(normalized.some((value,index)=>value===0&&values[index]!==0))return 'precision-range';
 const [x,y,u,v,sx,sy,radius]=normalized,first={x,y},dx=u-x,dy=v-y,length=Math.hypot(dx,dy),sweepLength=Math.hypot(sx,sy);
 if(length===0){
  if(a.x!==b.x||a.y!==b.y)return 'precision-range';
  const t=sweepLength?Math.max(0,Math.min(1,(x*(sx/sweepLength)+y*(sy/sweepLength))/sweepLength)):0;
  return Math.hypot(x-sx*t,y-sy*t)<=radius?[0,1]:null;
 }
 const intervals:Interval[]=[],include=(candidate:Interval|null)=>{if(candidate&&candidate[1]>candidate[0])intervals.push(candidate);};
 include(diskInterval(first,dx,dy,length,{x:0,y:0},radius));
 if(sweepLength){
  include(diskInterval(first,dx,dy,length,{x:sx,y:sy},radius));
  const ux=sx/sweepLength,uy=sy/sweepLength;
  include(rectangleInterval(x*ux+y*uy,u*ux+v*uy,-x*uy+y*ux,-u*uy+v*ux,sweepLength,radius));
 }
 if(!intervals.length)return null;
 // Their union is connected because it is the intersection with a convex set.
 const low=Math.min(...intervals.map(value=>value[0])),high=Math.max(...intervals.map(value=>value[1]));
 return high>low?[low,high]:null;
}
function interpolate(a:number,b:number,fraction:number):number {
 if(a===b)return a;
 const delta=b-a,value=finite(delta)?a+delta*fraction:a*(1-fraction)+b*fraction;
 return Math.max(Math.min(a,b),Math.min(Math.max(a,b),value));
}
function visualPressure(point:PaperStrokeErasePoint):{value:number;source:PaperStrokeErasePressureSource} {
 if(finite(point.renderPressure)&&point.renderPressure>=0&&point.renderPressure<=1)return {value:Math.max(.15,point.renderPressure),source:'derived'};
 if(finite(point.pressure)&&point.pressure>=0&&point.pressure<=1)return {value:Math.max(.15,point.pressure),source:'sensor'};
 return {value:.5,source:'default'};
}
/**
 * Clip the canonical polyline against a round swept eraser, never by sampling.
 * Original samples (including unknown sensor fields) retain their identity.
 * New boundary points contain x/y/time/renderPressure, not fabricated telemetry.
 * An optional projection must be one fixed affine transform for this stroke;
 * the eraser positions and radius are in the resulting world page coordinates.
 * Cuts are ordered along the source, and time remains nondecreasing.
 * Isolated tangencies keep a nondegenerate stroke; a dot on the boundary is hit.
 * Work and storage are O(points): at most two boundary points per source segment.
 */
export function clipPaperStroke(points:readonly PaperStrokeErasePoint[],from:PaperStrokeErasePosition,to:PaperStrokeErasePosition,radius:number,pointOnPage:PaperStrokeEraseProjection=identity):PaperStrokeEraseResult {
 if(!finite(radius)||radius<0||![from?.x,from?.y,to?.x,to?.y].every(finite))return unchanged(points,'invalid-eraser');
 const capsule:Capsule={from:{x:from.x,y:from.y},dx:to.x-from.x,dy:to.y-from.y,radius};
 if(!finite(capsule.dx)||!finite(capsule.dy))return unchanged(points,'precision-range');
 if(!points.length)return unchanged(points);
 const world:PaperStrokeErasePosition[]=[];let previousTime=-Infinity;
 for(let i=0;i<points.length;i++){
  const point=points[i],x=point?.x,y=point?.y,time=point?.time;
  if(![x,y,time].every(finite))return unchanged(points,'invalid-sample');
  if(time<previousTime)return unchanged(points,'non-monotone-time');previousTime=time;
  let projected:PaperStrokeErasePosition;try{projected=pointOnPage({x,y},i);}catch{return unchanged(points,'invalid-transform');}
  if(!projected||![projected.x,projected.y].every(finite))return unchanged(points,'invalid-transform');
  world.push({x:projected.x,y:projected.y});
 }
 if(points.length===1){const hit=capsuleInterval(world[0],world[0],capsule);return hit==='precision-range'?unchanged(points,hit):hit?{changed:true,status:'erased',fragments:[],cuts:[]}:unchanged(points);}
 const fragments:PaperStrokeErasePoint[][]=[],cuts:PaperStrokeEraseCut[]=[];let run:PaperStrokeErasePoint[]|undefined,runCuts:PendingCut[]=[],lastSample=-1,changed=false;
 const begin=()=>{if(!run){run=[];runCuts=[];lastSample=-1;}return run;};
 const sample=(index:number)=>{const target=begin();if(lastSample===index)return;target.push(points[index]);lastSample=index;};
 const boundary=(segment:number,fraction:number)=>{
  if(fraction===0){sample(segment);return;}if(fraction===1){sample(segment+1);return;}
  const target=begin(),a=points[segment],b=points[segment+1],pa=visualPressure(a),pb=visualPressure(b);
  const point:PaperStrokeErasePoint={x:interpolate(a.x,b.x,fraction),y:interpolate(a.y,b.y,fraction),time:interpolate(a.time,b.time,fraction),renderPressure:interpolate(pa.value,pb.value,fraction)};
  target.push(point);lastSample=-1;
  runCuts.push({schema:1,kind:'eraser-boundary',pointIndex:target.length-1,sourceSegment:segment,fraction,renderPressureSources:[pa.source,pb.source]});
 };
 const finish=()=>{if(run?.length){const fragmentIndex=fragments.length;fragments.push(run);for(const cut of runCuts)cuts.push({...cut,fragmentIndex});}run=undefined;runCuts=[];lastSample=-1;};
 for(let i=0;i+1<points.length;i++){
  const hit=capsuleInterval(world[i],world[i+1],capsule);
  if(hit==='precision-range')return unchanged(points,hit);
  if(!hit){sample(i);sample(i+1);continue;}
  changed=true;const [low,high]=hit;
  if(low>0){sample(i);boundary(i,low);}finish();
  if(high<1){boundary(i,high);sample(i+1);}
 }
 finish();if(!changed)return unchanged(points);
 return {changed:true,status:fragments.length?'clipped':'erased',fragments,cuts};
}
/** Parent keeps UUID/undo/CRDT work and whole-stroke measurement semantics. */
export function clipPaperInkStroke(object:PaperObject,from:PaperStrokeErasePosition,to:PaperStrokeErasePosition,radius:number):PaperStrokeEraseResult {
 const points=object.points??[],width=object.strokeWidth??3;
 if(object.kind!=='ink'||object.locked||object.measurement)return unchanged(points,'ineligible-object');
 if(![object.x,object.y,object.width,object.height,object.rotation].every(finite)||object.width<0||object.height<0||(object.mirrorX!==undefined&&typeof object.mirrorX!=='boolean')||(object.mirrorY!==undefined&&typeof object.mirrorY!=='boolean'))return unchanged(points,'invalid-transform');
 if(!finite(width)||width<0||!finite(radius)||radius<0)return unchanged(points,'invalid-eraser');
 const reach=radius+width/2;if(!finite(reach))return unchanged(points,'precision-range');
 return clipPaperStroke(points,from,to,reach,point=>objectPoint(object,point));
}
