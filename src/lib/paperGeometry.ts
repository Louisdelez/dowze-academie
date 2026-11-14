import type {InkPoint,PaperObject} from './notebookDocument.ts';
import {preparePaperLasso,type PaperLassoPoint} from './paperLasso.ts';
/** A geometric cut may interpolate visual thickness without fabricating sensor data. */
export const paperInkRenderPressure=(point:Pick<InkPoint,'pressure'|'renderPressure'>)=>point.renderPressure??point.pressure??0.5;
export function inkOutline(points:readonly InkPoint[],width:number,constant=false):string {
 if(!points.length)return '';const left:string[]=[],right:string[]=[];
 for(let i=0;i<points.length;i++){const p=points[i],before=points[Math.max(0,i-1)],after=points[Math.min(points.length-1,i+1)],dx=after.x-before.x,dy=after.y-before.y,len=Math.hypot(dx,dy)||1,r=width*(constant?0.5:Math.max(0.15,paperInkRenderPressure(p)));left.push(`${p.x-dy/len*r},${p.y+dx/len*r}`);right.push(`${p.x+dy/len*r},${p.y-dx/len*r}`);}
 if(points.length===1){const p=points[0],r=width/2;return `M${p.x-r} ${p.y}a${r} ${r} 0 1 0 ${r*2} 0a${r} ${r} 0 1 0 ${-r*2} 0`;}
 return `M${left.join('L')}L${right.reverse().join('L')}Z`;
}
export function pointInPolygon(point:{x:number;y:number},polygon:readonly {x:number;y:number}[]):boolean{
 let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;
}
export function objectPoint(object:PaperObject,point:{x:number;y:number}){const a=object.rotation*Math.PI/180,cx=object.width/2,cy=object.height/2,dx=(point.x-cx)*(object.mirrorX?-1:1),dy=(point.y-cy)*(object.mirrorY?-1:1);return {x:object.x+cx+dx*Math.cos(a)-dy*Math.sin(a),y:object.y+cy+dx*Math.sin(a)+dy*Math.cos(a)};}
/** Transform a visual nib direction; this is geometry, not device telemetry. */
export function paperDirectionOnPage(object:PaperObject,angle:number):number{
 const local=angle*Math.PI/180,x=Math.cos(local)*(object.mirrorX?-1:1),y=Math.sin(local)*(object.mirrorY?-1:1),rotation=object.rotation*Math.PI/180;
 return (Math.atan2(x*Math.sin(rotation)+y*Math.cos(rotation),x*Math.cos(rotation)-y*Math.sin(rotation))*180/Math.PI+360)%360;
}
/** Derived page orientation is kept separate from the original sensor values. */
export function paperInkOrientationOnPage(object:PaperObject,point:InkPoint):{nibAngle?:number;tiltX?:number;tiltY?:number}{
 const next:{nibAngle?:number;tiltX?:number;tiltY?:number}={};
 if(Number.isFinite(point.nibAngle??point.twist))next.nibAngle=paperDirectionOnPage(object,(point.nibAngle??point.twist)!);
 if(Number.isFinite(point.tiltX)&&Number.isFinite(point.tiltY)){
  const x=Math.tan(point.tiltX!*Math.PI/180)*(object.mirrorX?-1:1),y=Math.tan(point.tiltY!*Math.PI/180)*(object.mirrorY?-1:1),angle=object.rotation*Math.PI/180;
  next.tiltX=Math.atan(x*Math.cos(angle)-y*Math.sin(angle))*180/Math.PI;next.tiltY=Math.atan(x*Math.sin(angle)+y*Math.cos(angle))*180/Math.PI;
 }
 return next;
}
/** Baking a geometric transform retains the original pressure, tilt, twist and
 * time. The visual nib orientation has its own field and is never telemetry. */
export function paperInkPointOnPage(object:PaperObject,point:InkPoint):InkPoint{
 const next={...point,...objectPoint(object,point)};
 if(!object.mirrorX&&!object.mirrorY&&object.rotation%360===0)return next;
 const nib=paperInkOrientationOnPage(object,point).nibAngle;if(nib!==undefined)next.nibAngle=nib;
 return next;
}
/** Prepare once per accepted gesture, then reuse across its captured objects.
 * Ink selects the whole object when its centreline touches the closed lasso.
 * Other objects retain the existing four-corner enclosure policy. */
export function createPaperLassoSelection(polygon:readonly PaperLassoPoint[]):(object:PaperObject)=>boolean {
 const lasso=preparePaperLasso(polygon);
 return object=>{
  if(!object||!lasso.valid||![object.x,object.y,object.width,object.height,object.rotation].every(Number.isFinite)||object.width<0||object.height<0)return false;
  if(object.kind!=='ink')return [{x:0,y:0},{x:object.width,y:0},{x:object.width,y:object.height},{x:0,y:object.height}].every(point=>pointInPolygon(objectPoint(object,point),lasso.polygon));
  const points=object.points;if(!Array.isArray(points)||!points.length)return false;
  let previous:PaperLassoPoint|undefined,hit=false;
  for(const point of points){if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))return false;const world=objectPoint(object,point);if(!Number.isFinite(world.x)||!Number.isFinite(world.y))return false;if(!hit&&(lasso.contains(world)||previous&&lasso.intersects(previous,world)))hit=true;previous=world;}
  return hit;
 };
}
/** Compatibility helper; callers filtering many objects should prepare once. */
export function lassoContains(object:PaperObject,polygon:readonly PaperLassoPoint[]):boolean{return createPaperLassoSelection(polygon)(object);}

/** Broad nib: thickness depends on stroke direction, pressure and the pen's reported twist. */
export function calligraphyOutline(points:readonly InkPoint[],width:number,nibAngle=45):string{
 const adjusted=points.map((p,i)=>{
  const before=points[Math.max(0,i-1)],after=points[Math.min(points.length-1,i+1)],dx=after.x-before.x,dy=after.y-before.y,len=Math.hypot(dx,dy)||1;
  const angle=(p.nibAngle??p.twist??nibAngle)*Math.PI/180,projection=Math.abs((-dy/len)*Math.cos(angle)+(dx/len)*Math.sin(angle));
  return {...p,renderPressure:Math.max(.15,paperInkRenderPressure(p)*(.2+.8*projection))};
 });return inkOutline(adjusted,width*2);
}
