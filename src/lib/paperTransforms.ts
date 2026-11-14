import type {PaperObject,PaperDocument,PaperCommand} from './notebookDocument.ts';
import {objectPoint,paperInkPointOnPage,paperDirectionOnPage} from './paperGeometry.ts';
/** Normalize ink bounds without changing any visible point, including rotated legacy strokes. */
export function compactInk(object:PaperObject):PaperObject{
 if(object.kind!=='ink'||!object.points?.length)return object;
 const pad=(object.strokeWidth??3)*(object.pen==='calligraphy'?2.4:1.2),points=object.points.map(point=>paperInkPointOnPage(object,point));
 const bounds=points.reduce((b,p)=>({left:Math.min(b.left,p.x),right:Math.max(b.right,p.x),top:Math.min(b.top,p.y),bottom:Math.max(b.bottom,p.y)}),{left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity});const left=bounds.left-pad,top=bounds.top-pad,right=bounds.right+pad,bottom=bounds.bottom+pad;
 const {mirrorX:_,mirrorY:__,...normal}=object;
 return {...normal,x:left,y:top,width:Math.max(1,right-left),height:Math.max(1,bottom-top),rotation:0,...(object.pen==='calligraphy'?{nibAngle:paperDirectionOnPage(object,object.nibAngle??45)}:{}),points:points.map(p=>({...p,x:p.x-left,y:p.y-top}))};
}
export function resizePaperObject(object:PaperObject,width:number,height:number):PaperObject{
 if(object.locked)throw Error('Déverrouillez cet objet avant de le redimensionner.');
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<8||height<8||width>20000||height>100000)throw Error('Dimensions invalides.');
 const normalized=compactInk(object),sx=width/Math.max(1,normalized.width),sy=height/Math.max(1,normalized.height);
 return {...normalized,width,height,...(normalized.points?{points:normalized.points.map(p=>({...p,x:p.x*sx,y:p.y*sy})),strokeWidth:(normalized.strokeWidth??3)*Math.sqrt(sx*sy)}:{})};
}
export function expandPaperGroups(objects:readonly PaperObject[],ids:readonly string[]):string[]{
 const groups=new Set(objects.filter(o=>ids.includes(o.id)&&o.groupId).map(o=>o.groupId));
 return objects.filter(o=>ids.includes(o.id)||o.groupId&&groups.has(o.groupId)).map(o=>o.id);
}
export function orderedPaperObjects(objects:readonly PaperObject[],ids:readonly string[],direction:'front'|'back'):PaperObject[]{
 const sorted=[...objects].sort((a,b)=>a.z-b.z),selected=sorted.filter(o=>ids.includes(o.id)&&!o.locked),rest=sorted.filter(o=>!selected.some(s=>s.id===o.id));
 return (direction==='front'?[...rest,...selected]:[...selected,...rest]).map((o,z)=>({...o,z}));
}

export function rotatePaperSelection(objects:readonly PaperObject[],angle:number):PaperObject[]{
 const editable=objects.filter(o=>!o.locked);if(!editable.length)return [];
 const corners=editable.flatMap(o=>[{x:0,y:0},{x:o.width,y:0},{x:o.width,y:o.height},{x:0,y:o.height}].map(p=>objectPoint(o,p)));
 const left=Math.min(...corners.map(p=>p.x)),right=Math.max(...corners.map(p=>p.x)),top=Math.min(...corners.map(p=>p.y)),bottom=Math.max(...corners.map(p=>p.y)),cx=(left+right)/2,cy=(top+bottom)/2,a=angle*Math.PI/180;
 return editable.map(o=>{const x=o.x+o.width/2-cx,y=o.y+o.height/2-cy;return {...o,x:cx+x*Math.cos(a)-y*Math.sin(a)-o.width/2,y:cy+x*Math.sin(a)+y*Math.cos(a)-o.height/2,rotation:(o.rotation+angle)%360};});
}

export type PaperSelectionScaleAnchor='center'|'top-left'|'top-right'|'bottom-left'|'bottom-right'|Readonly<{x:number;y:number}>;
export interface PaperSelectionScaleBounds {readonly left:number;readonly top:number;readonly right:number;readonly bottom:number;readonly width:number;readonly height:number}
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const scaleError=()=>Error('Cette transformation dépasse la précision disponible. La sélection originale reste conservée.');
function scaleSources(document:PaperDocument,pageId:string,ids:readonly string[]):PaperObject[]{
 if(!document.pages.some(page=>page.id===pageId))throw Error('La page sélectionnée n’existe plus.');
 if(!ids.length||new Set(ids).size!==ids.length)throw Error('Sélectionnez chaque objet une seule fois.');
 const byId=new Map(document.objects.map(object=>[object.id,object]));
 return ids.map(id=>{const object=byId.get(id);if(!object)throw Error('Un objet sélectionné n’existe plus. Reprenez la sélection.');
  if(object.pageId!==pageId)throw Error('Redimensionnez ensemble les objets d’une seule page. Les autres pages restent conservées.');
  if(object.locked)throw Error('Déverrouillez tous les objets sélectionnés avant de les redimensionner ensemble.');
  if(object.textFlow)throw Error('Ce texte utilise une mise en page continue. Redimensionnez ses dessins ou une zone de texte indépendante ; le texte continu reste conservé.');
  if(![object.x,object.y,object.width,object.height,object.rotation].every(finite)||object.width<0||object.height<0||(object.strokeWidth!==undefined&&(!finite(object.strokeWidth)||object.strokeWidth<=0)))throw scaleError();
  return object;
 });
}
function selectionBounds(objects:readonly PaperObject[]):PaperSelectionScaleBounds {
 let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
 const include=(x:number,y:number,pad=0)=>{if(![x,y,pad,x-pad,x+pad,y-pad,y+pad].every(finite))throw scaleError();left=Math.min(left,x-pad);right=Math.max(right,x+pad);top=Math.min(top,y-pad);bottom=Math.max(bottom,y+pad);};
 for(const object of objects){
  // The common anchor uses painted ink bounds, including the existing visual
  // nib padding. Legacy page-sized stroke boxes never dominate the selection.
  if(object.kind==='ink'){
   if(!object.points?.length)throw Error('Ce trait ne possède pas de géométrie redimensionnable.');
   const pad=(object.strokeWidth??3)*(object.pen==='calligraphy'?2:1);
   for(const point of object.points){if(!point||!finite(point.x)||!finite(point.y))throw scaleError();const world=objectPoint(object,point);include(world.x,world.y,pad);}
  }else for(const point of [{x:0,y:0},{x:object.width,y:0},{x:object.width,y:object.height},{x:0,y:object.height}]){const world=objectPoint(object,point);include(world.x,world.y);}
 }
 const width=right-left,height=bottom-top;if(![left,top,right,bottom,width,height].every(finite)||width<0||height<0||width===0&&height===0)throw scaleError();
 return Object.freeze({left,top,right,bottom,width,height});
}
/** Page coordinates only: no viewport, zoom, DPI, calibration or writer. Every
 * selected identity is checked; locked/continuous/foreign objects never vanish
 * silently from a partially transformed result. */
export function paperSelectionScaleBounds(document:PaperDocument,pageId:string,ids:readonly string[]):PaperSelectionScaleBounds{return selectionBounds(scaleSources(document,pageId,ids));}
/** A uniform page-space dilation commutes with each object's existing local
 * rotation/reflection. Scale local geometry and its box together, preserving
 * sensor samples, chronology, audio links and measured-geometry metadata. */
export function preparePaperSelectionScale(document:PaperDocument,pageId:string,ids:readonly string[],factor:number,anchor:PaperSelectionScaleAnchor='center'):{command:PaperCommand|null;bounds:PaperSelectionScaleBounds;anchor:Readonly<{x:number;y:number}>;factor:number} {
 const objects=scaleSources(document,pageId,ids),bounds=selectionBounds(objects);
 if(!finite(factor)||factor<=0)throw Error('Choisissez une dimension positive et finie.');
 let fixed:{x:number;y:number};
 if(typeof anchor==='object'&&anchor!==null)fixed={x:anchor.x,y:anchor.y};
 else if(anchor==='center')fixed={x:bounds.left+bounds.width/2,y:bounds.top+bounds.height/2};
 else if(['top-left','top-right','bottom-left','bottom-right'].includes(anchor))fixed={x:anchor.endsWith('right')?bounds.right:bounds.left,y:anchor.startsWith('bottom')?bounds.bottom:bounds.top};
 else throw Error('Choisissez un ancrage commun à la sélection.');
 if(!finite(fixed.x)||!finite(fixed.y))throw scaleError();
 const local=(value:number)=>{const result=value*factor;if(!finite(value)||!finite(result)||value!==0&&result===0)throw scaleError();return result;};
 const page=(value:number,pivot:number)=>{const result=pivot+(value-pivot)*factor;if(!finite(result)||value!==pivot&&result===pivot)throw scaleError();return result;};
 if(factor===1)return {command:null,bounds,anchor:Object.freeze(fixed),factor};
 // Materialize every result BEFORE exposing a command. A late invalid point
 // cannot publish an earlier object from this one atomic batch.
 const transformed=objects.map(object=>{
  const next:PaperObject={...object,x:page(object.x,fixed.x),y:page(object.y,fixed.y),width:local(object.width),height:local(object.height),
   ...(object.points?{points:object.points.map(point=>({...point,x:local(point.x),y:local(point.y)}))}:{}),
   ...(object.strokeWidth!==undefined||object.kind==='ink'||object.kind==='shape'?{strokeWidth:local(object.strokeWidth??3)}:{}),
   ...(object.measurement?{measurement:{...object.measurement}}:{}),...(object.audioAnchor?{audioAnchor:{...object.audioAnchor}}:{})};
  // Check the transformed world projection, not only finite local inputs.
  const checkWorld=(point:{x:number;y:number})=>{const world=objectPoint(next,point);if(!finite(world.x)||!finite(world.y))throw scaleError();};
  for(const point of [{x:0,y:0},{x:next.width,y:0},{x:next.width,y:next.height},{x:0,y:next.height}])checkWorld(point);
  for(const point of next.points??[])checkWorld(point);
  return next;
 });
 return {command:{type:'batch',commands:transformed.map(object=>({type:'upsert-object',object}))},bounds,anchor:Object.freeze(fixed),factor};
}
