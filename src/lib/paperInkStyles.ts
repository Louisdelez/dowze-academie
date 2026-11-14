import type {PaperObject,PaperDocument,PaperCommand,PaperStrokeStyle} from './notebookDocument.ts';
import {objectPoint} from './paperGeometry.ts';
export const PAPER_STROKE_STYLES:readonly PaperStrokeStyle[]=['solid','dashed','dotted'];
export function paperStrokeDashArray(style:PaperStrokeStyle|undefined,width:number):string|undefined{
 const unit=Number.isFinite(width)&&width>0?width:3;
 return style==='dashed'?`${unit*4} ${unit*2.5}`:style==='dotted'?`0 ${unit*2.5}`:undefined;
}
/** Parents apply this transform exactly once, for ink and non-vector content.
 * Local reflection happens before the existing rotation, like objectPoint(). */
export function paperObjectCssTransform(object:PaperObject):string{
 return `rotate(${object.rotation}deg)`+(object.mirrorX||object.mirrorY?` scale(${object.mirrorX?-1:1}, ${object.mirrorY?-1:1})`:'');
}
export function paperObjectSvgTransform(object:PaperObject,x=object.x,y=object.y):string{
 const cx=object.width/2,cy=object.height/2;
 return `translate(${x} ${y}) rotate(${object.rotation} ${cx} ${cy})`+(object.mirrorX||object.mirrorY?` translate(${cx} ${cy}) scale(${object.mirrorX?-1:1} ${object.mirrorY?-1:1}) translate(${-cx} ${-cy})`:'');
}
/** A selection is reflected around its own painted bounding box, never around
 * the page or an unrelated object. Locked objects stay byte-for-byte intact.
 * Continuous text is explicitly excluded: reflecting one page must not move its
 * canonical text across other pages or corrupt their shared layout identity. */
export function mirrorPaperSelection(document:PaperDocument,ids:readonly string[],axis:'horizontal'|'vertical',pageId?:string):PaperCommand|null{
 if(axis!=='horizontal'&&axis!=='vertical')throw Error('Choisissez un miroir horizontal ou vertical.');
 const selected=new Set(ids),chosen=document.objects.filter(object=>selected.has(object.id)&&!object.locked);
 if(!chosen.length)return null;
 if(chosen.some(object=>object.textFlow&&object.textFlow.pageIds.length>1))throw Error('Ce texte se poursuit sur plusieurs pages. Retournez ses dessins ou une zone de texte indépendante ; le texte continu reste conservé.');
 const page=pageId??chosen[0].pageId;if(chosen.some(object=>object.pageId!==page))throw Error('Le miroir concerne une sélection sur une seule page. Les autres pages restent conservées.');
 const corners=chosen.flatMap(object=>{
  if(object.kind==='ink'&&object.points?.length){const pad=(object.strokeWidth??3)*(object.pen==='calligraphy'?2:1),bounds=object.points.reduce((box,point)=>{const p=objectPoint(object,point);return {left:Math.min(box.left,p.x),right:Math.max(box.right,p.x),top:Math.min(box.top,p.y),bottom:Math.max(box.bottom,p.y)};},{left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity});return [{x:bounds.left-pad,y:bounds.top-pad},{x:bounds.right+pad,y:bounds.bottom+pad}];}
  return [{x:0,y:0},{x:object.width,y:0},{x:object.width,y:object.height},{x:0,y:object.height}].map(point=>objectPoint(object,point));
 });
 const left=Math.min(...corners.map(p=>p.x)),right=Math.max(...corners.map(p=>p.x)),top=Math.min(...corners.map(p=>p.y)),bottom=Math.max(...corners.map(p=>p.y)),cx=(left+right)/2,cy=(top+bottom)/2;
 return {type:'batch',commands:chosen.map(object=>{const centerX=object.x+object.width/2,centerY=object.y+object.height/2,mirror={...object,x:axis==='horizontal'?2*cx-centerX-object.width/2:object.x,y:axis==='vertical'?2*cy-centerY-object.height/2:object.y,rotation:-object.rotation};
  const field=axis==='horizontal'?'mirrorX':'mirrorY';if(mirror[field])delete mirror[field];else mirror[field]=true;
  return {type:'upsert-object' as const,object:mirror};
 })};
}
export function setPaperSelectionStrokeStyle(document:PaperDocument,ids:readonly string[],strokeStyle:PaperStrokeStyle):PaperCommand|null{
 if(!PAPER_STROKE_STYLES.includes(strokeStyle))throw Error('Le style du trait est invalide.');const selected=new Set(ids);
 const commands=document.objects.filter(object=>selected.has(object.id)&&!object.locked&&(object.kind==='ink'||object.kind==='shape')&&(object.strokeStyle??'solid')!==strokeStyle).map(object=>({type:'patch-object' as const,id:object.id,patch:{strokeStyle}}));
 return commands.length?{type:'batch',commands}:null;
}
