import type {PaperObject,PaperPage} from './notebookDocument.ts';
import {objectPoint,pointInPolygon} from './paperGeometry.ts';
import {isPaperMeasurementMetadata,paperMeasurementLength,paperMeasurementArea,PaperMeasurementError,MAX_PAPER_MEASUREMENT_VERTICES,MAX_PAPER_MEASUREMENT_LENGTH_POINTS,type PaperMeasurementPoint,type PaperMeasurementValue} from './paperMeasurement.ts';

export interface PaperMeasurementObjectDescription {
 readonly objectId:string;readonly pageId:string;readonly kind:'length'|'area'|null;
 readonly status:'measured'|'uncalibrated'|'invalid';readonly value:PaperMeasurementValue|null;
 readonly label:string;readonly accessibleLabel:string;readonly anchor:PaperMeasurementPoint|null;readonly errorCode?:string;
}
const numberFormat=new Intl.NumberFormat('fr-FR',{maximumSignificantDigits:6,useGrouping:false});
const scientificFormat=new Intl.NumberFormat('fr-FR',{maximumSignificantDigits:6,useGrouping:false,notation:'scientific'});
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
/** Display rounding only. The description's numeric value remains unrounded. */
export function formatPaperMeasurementValue(value:PaperMeasurementValue):string {
 if(!value||!finite(value.value)||value.value<=0||(value.power!==1&&value.power!==2)||!isPaperMeasurementMetadata({schema:1,kind:value.power===2?'area':'length',unit:value.unit}))throw new PaperMeasurementError('numeric_range','La mesure ne peut pas être affichée.');
 const formatter=value.value<.0001||value.value>=1e9?scientificFormat:numberFormat,unit=value.unit==='page'?'u. page':value.unit;
 return `${formatter.format(value.value)} ${unit}${value.power===2?'²':''}`;
}
function frozen(description:PaperMeasurementObjectDescription):PaperMeasurementObjectDescription {
 return Object.freeze({...description,value:description.value?Object.freeze({...description.value}):null,anchor:description.anchor?Object.freeze({...description.anchor}):null});
}
function lengthAnchor(points:readonly PaperMeasurementPoint[]):PaperMeasurementPoint {
 const distances:number[]=[];let total=0,compensation=0;
 for(let i=1;i<points.length;i++){const d=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y),adjusted=d-compensation,next=total+adjusted;compensation=(next-total)-adjusted;total=next;distances.push(d);}
 const midpoint=total/2;let travelled=0;
 for(let i=0;i<distances.length;i++){
  const distance=distances[i];if(distance===0)continue;
  if(travelled+distance>=midpoint){const t=Math.max(0,Math.min(1,(midpoint-travelled)/distance)),a=points[i],b=points[i+1];return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}
  travelled+=distance;
 }
 return {...points.at(-1)!};
}
/** Centroid when interior; an interior scanline midpoint for concave surfaces otherwise. */
function areaAnchor(input:readonly PaperMeasurementPoint[]):PaperMeasurementPoint {
 const points=input.length>3&&input[0].x===input.at(-1)!.x&&input[0].y===input.at(-1)!.y?input.slice(0,-1):input;
 const left=Math.min(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y)),span=Math.max(Math.max(...points.map(p=>p.x))-left,Math.max(...points.map(p=>p.y))-top),normalized=points.map(p=>({x:(p.x-left)/span,y:(p.y-top)/span}));
 let crossSum=0,xSum=0,ySum=0;
 for(let i=0;i<normalized.length;i++){const a=normalized[i],b=normalized[(i+1)%normalized.length],cross=a.x*b.y-b.x*a.y;crossSum+=cross;xSum+=(a.x+b.x)*cross;ySum+=(a.y+b.y)*cross;}
 let anchor={x:xSum/(3*crossSum),y:ySum/(3*crossSum)};
 if(!finite(anchor.x)||!finite(anchor.y)||!pointInPolygon(anchor,normalized)){
  const levels=[...new Set(normalized.map(p=>p.y))].sort((a,b)=>a-b);let best:{point:PaperMeasurementPoint;score:number}|undefined;
  for(let level=1;level<levels.length;level++){
   const bottom=levels[level-1],top=levels[level],y=(bottom+top)/2,intersections:number[]=[];
   for(let i=0;i<normalized.length;i++){const a=normalized[i],b=normalized[(i+1)%normalized.length];if((a.y>y)!==(b.y>y))intersections.push(a.x+(b.x-a.x)*(y-a.y)/(b.y-a.y));}
   intersections.sort((a,b)=>a-b);
   for(let i=0;i+1<intersections.length;i+=2){const a=intersections[i],b=intersections[i+1],score=(b-a)*(top-bottom);if(score>0&&(!best||score>best.score))best={point:{x:(a+b)/2,y},score};}
  }
  if(!best)throw new PaperMeasurementError('invalid_geometry','La surface ne possède pas de point intérieur représentable.');
  anchor=best.point;
 }
 const x=left+anchor.x*span,y=top+anchor.y*span;
 if(!finite(x)||!finite(y))throw new PaperMeasurementError('numeric_range','La position de la mesure dépasse la précision numérique disponible.');
 return {x,y};
}
/** No viewport or persisted magnitude is consulted. The receiving page's calibration is authoritative. */
export function describePaperMeasurementObject(object:PaperObject,page:PaperPage):PaperMeasurementObjectDescription|null {
 if(object.measurement===undefined)return null;
 const base={objectId:object.id,pageId:object.pageId,kind:object.measurement?.kind==='area'?'area' as const:object.measurement?.kind==='length'?'length' as const:null};
 const invalid=(errorCode:string)=>frozen({...base,status:'invalid',value:null,label:'Mesure invalide',accessibleLabel:'Mesure invalide. La géométrie originale reste conservée.',anchor:null,errorCode});
 if(object.pageId!==page.id)return invalid('page_mismatch');
 if(object.kind!=='ink'||!isPaperMeasurementMetadata(object.measurement)||!Array.isArray(object.points)||![object.x,object.y,object.width,object.height,object.rotation].every(finite)||object.width<0||object.height<0||(object.mirrorX!==undefined&&typeof object.mirrorX!=='boolean')||(object.mirrorY!==undefined&&typeof object.mirrorY!=='boolean'))return invalid('invalid_object');
 const metadata=object.measurement,kind=metadata.kind,name=kind==='area'?'Surface':'Longueur';
 if(object.points.length<(kind==='area'?3:2)||object.points.length>(kind==='area'?MAX_PAPER_MEASUREMENT_VERTICES+1:MAX_PAPER_MEASUREMENT_LENGTH_POINTS))return invalid('invalid_geometry');
 let points:PaperMeasurementPoint[];
 try{points=object.points.map(point=>objectPoint(object,point));}catch{return invalid('invalid_geometry');}
 try{
  const value=kind==='area'?paperMeasurementArea(points,page.calibration,metadata.unit):paperMeasurementLength(points,page.calibration,metadata.unit),anchor=kind==='area'?areaAnchor(points):lengthAnchor(points),label=formatPaperMeasurementValue(value);
  return frozen({...base,status:'measured',value,label,accessibleLabel:`${name} : ${label}.`,anchor});
 }catch(error){
  if(error instanceof PaperMeasurementError&&error.code==='calibration_required'){
   try{const anchor=kind==='area'?areaAnchor(points):lengthAnchor(points);return frozen({...base,status:'uncalibrated',value:null,label:'Non calibré',accessibleLabel:`${name} non calibrée. Calibrez cette page pour afficher la mesure en ${metadata.unit}.`,anchor,errorCode:error.code});}catch{return invalid('invalid_geometry');}
  }
  return invalid(error instanceof PaperMeasurementError?error.code:'invalid_geometry');
 }
}
