import type {PaperCommand,PaperDocument,PaperPage} from './notebookDocument';
import {paperSelectionScaleBounds,type PaperSelectionScaleBounds} from './paperTransforms.ts';

export type PaperGridAnchor='center'|'top-left'|'top-right'|'bottom-left'|'bottom-right';
export type PaperGridAxes='both'|'x'|'y';
export interface PaperGridAlignment {
 readonly page:PaperPage;readonly bounds:PaperSelectionScaleBounds;
 readonly anchor:Readonly<{x:number;y:number}>;readonly target:Readonly<{x:number;y:number}>;
 readonly delta:Readonly<{x:number;y:number}>;readonly spacing:number;
 readonly command:PaperCommand|null;
}
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
/** The lattice is the exact standard grid/dots pattern transformed by
 * PaperBackground. Its phase depends on the actual visual page dimensions. */
export function paperGridLattice(page:PaperPage):Readonly<{x:number;y:number;spacing:number}>{
 const rotation=((page.rotation%360)+360)%360;
 if(![page.width,page.height,page.rotation].every(finite)||page.width<100||page.width>20000||page.height<100||page.height>100000||![0,90,180,270].includes(rotation))throw Error('Choisissez une page valide et une rotation de 0°, 90°, 180° ou 270°.');
 if(page.pdf||(page.template??'standard')!=='standard'||!['grid','dots'].includes(page.pattern))throw Error('Choisissez un papier quadrillé ou pointillé standard sans fond PDF dans les réglages de page.');
 const spacing=page.spacing??(page.pattern==='grid'?24:20);
 if(!finite(spacing)||spacing<8||spacing>100)throw Error('L’espacement de cette grille n’est pas valide.');
 const half=page.pattern==='dots'?spacing/2:0;
 return Object.freeze({x:rotation===90||rotation===180?page.width-half:half,y:rotation===180||rotation===270?page.height-half:half,spacing});
}
function snapped(value:number,origin:number,spacing:number,min:number,max:number):number{
 if(![value,origin,spacing,min,max].every(finite)||min>max)throw Error('La sélection ne tient pas entièrement sur cette page.');
 const first=Math.ceil((min-origin)/spacing),last=Math.floor((max-origin)/spacing);
 if(first>last)throw Error('Aucun point de cette grille ne garde toute la sélection sur la page.');
 const result=origin+Math.max(first,Math.min(last,Math.round((value-origin)/spacing)))*spacing;
 if(!finite(result)||result<min||result>max)throw Error('La précision disponible ne permet pas cet alignement.');
 return result;
}
/** Pure, page-space translation: no zoom/CSS pixels, asset reads or writes.
 * One common anchor preserves all offsets within the full selected groups. */
export function preparePaperGridAlignment(document:PaperDocument,pageId:string,ids:readonly string[],anchor:PaperGridAnchor='top-left',axes:PaperGridAxes='both'):PaperGridAlignment{
 const pages=document.pages.filter(page=>page.id===pageId);
 if(pages.length!==1)throw Error('La page sélectionnée n’existe plus.');
 const page=pages[0],lattice=paperGridLattice(page),idSet=new Set(ids);
 if(!ids.length||idSet.size!==ids.length||new Set(document.objects.map(object=>object.id)).size!==document.objects.length)throw Error('Reprenez une sélection d’objets distincts.');
 if(!['center','top-left','top-right','bottom-left','bottom-right'].includes(anchor)||!['both','x','y'].includes(axes))throw Error('Choisissez un ancrage et des axes valides.');
 const selected=document.objects.filter(object=>idSet.has(object.id));
 if(selected.length!==ids.length)throw Error('Un objet sélectionné n’existe plus.');
 const groups=new Set(selected.flatMap(object=>object.groupId?[object.groupId]:[]));
 if(document.objects.some(object=>object.groupId&&groups.has(object.groupId)&&!idSet.has(object.id)))throw Error('Sélectionnez le groupe entier avant de l’aligner sur la grille.');
 // Reuse the existing painted-ink bounds and its atomic locked, continuous,
 // foreign-page and non-finite geometry refusals.
 const bounds=paperSelectionScaleBounds(document,pageId,ids);
 const point={x:anchor==='center'?(bounds.left+bounds.right)/2:anchor.endsWith('right')?bounds.right:bounds.left,y:anchor==='center'?(bounds.top+bounds.bottom)/2:anchor.startsWith('bottom')?bounds.bottom:bounds.top};
 const target={x:axes==='y'?point.x:snapped(point.x,lattice.x,lattice.spacing,point.x-bounds.left,page.width-bounds.right+point.x),y:axes==='x'?point.y:snapped(point.y,lattice.y,lattice.spacing,point.y-bounds.top,page.height-bounds.bottom+point.y)};
 const delta={x:target.x-point.x,y:target.y-point.y};
 if(![delta.x,delta.y,bounds.left+delta.x,bounds.top+delta.y,bounds.right+delta.x,bounds.bottom+delta.y].every(finite)||bounds.left+delta.x<0||bounds.top+delta.y<0||bounds.right+delta.x>page.width||bounds.bottom+delta.y>page.height)throw Error('L’alignement sortirait la sélection de la page.');
 const commands:PaperCommand[]=selected.map(object=>{
  const x=object.x+delta.x,y=object.y+delta.y;
  if(!finite(x)||!finite(y)||delta.x!==0&&x===object.x||delta.y!==0&&y===object.y)throw Error('La précision disponible ne permet pas cet alignement.');
  return {type:'patch-object',id:object.id,patch:{x,y}};
 });
 const command:PaperCommand|null=delta.x===0&&delta.y===0?null:{type:'batch',commands};
 return Object.freeze({page,bounds,anchor:Object.freeze(point),target:Object.freeze(target),delta:Object.freeze(delta),spacing:lattice.spacing,command});
}
