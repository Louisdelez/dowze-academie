import {isPaperImageCrop,type PaperImageCrop} from './notebookDocument.ts';
export type PaperCropHandle='move'|'nw'|'ne'|'se'|'sw';
export const fullPaperImageCrop=():PaperImageCrop=>({x:0,y:0,width:1,height:1});
export const copyPaperImageCrop=(crop?:PaperImageCrop):PaperImageCrop=>crop?{x:crop.x,y:crop.y,width:crop.width,height:crop.height}:fullPaperImageCrop();
export const paperImageCropIsFull=(crop:PaperImageCrop)=>crop.x===0&&crop.y===0&&crop.width===1&&crop.height===1;
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
/** Fractions refer to the original image, never the already cropped result. */
export function movePaperImageCrop(start:PaperImageCrop,handle:PaperCropHandle,dx:number,dy:number):PaperImageCrop{
 if(!isPaperImageCrop(start)||![dx,dy].every(Number.isFinite)||!['move','nw','ne','se','sw'].includes(handle))throw Error('Le cadre de recadrage est incompatible.');
 if(handle==='move')return {...start,x:clamp(start.x+dx,0,1-start.width),y:clamp(start.y+dy,0,1-start.height)};
 const minimum=Math.min(.02,start.width,start.height),right=start.x+start.width,bottom=start.y+start.height;
 const left=handle.endsWith('w')?clamp(start.x+dx,0,right-minimum):start.x,top=handle.startsWith('n')?clamp(start.y+dy,0,bottom-minimum):start.y;
 const nextRight=handle.endsWith('e')?clamp(right+dx,left+minimum,1):right,nextBottom=handle.startsWith('s')?clamp(bottom+dy,top+minimum,1):bottom;
 return {x:left,y:top,width:nextRight-left,height:nextBottom-top};
}
export function paperImageCropViewBox(crop:PaperImageCrop,width:number,height:number):string{
 if(!isPaperImageCrop(crop)||![width,height].every(n=>Number.isFinite(n)&&n>0))throw Error('Les dimensions de l’image ne permettent pas son recadrage.');
 return [crop.x*width,crop.y*height,crop.width*width,crop.height*height].join(' ');
}
