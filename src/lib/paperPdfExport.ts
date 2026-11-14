import {degrees,type PDFDocument} from 'pdf-lib';
import type {PaperPage} from './notebookDocument';
/** Paper units correspond to CSS pixels at 96 dpi; PDF coordinates are 72 dpi. */
export const paperPdfSize=(page:Pick<PaperPage,'width'|'height'>)=>({width:page.width*0.75,height:page.height*0.75});
/** Embed the original vector resources instead of turning the imported document into a photograph. */
export async function addOriginalPdfPage(output:PDFDocument,original:PDFDocument,index:number,size:{width:number;height:number},extraRotation=0){
 const source=original.getPage(index);if(!source)throw Error('Cette page manque dans le PDF original.');
 // A truly blank PDF page has no content stream to embed. It remains a blank vector page.
 if(!source.node.Contents())return output.addPage([size.width,size.height]);
 const crop=source.getCropBox(),rotation=(((source.getRotation().angle+extraRotation)%360)+360)%360;
 if(![0,90,180,270].includes(rotation))throw Error('L’orientation du PDF n’est pas prise en charge.');
 const embedded=await output.embedPage(source,{left:crop.x,bottom:crop.y,right:crop.x+crop.width,top:crop.y+crop.height});
 const page=output.addPage([size.width,size.height]);
 const turned=rotation===90||rotation===270,w=turned?size.height:size.width,h=turned?size.width:size.height;
 page.drawPage(embedded,{x:rotation===180||rotation===270?size.width:0,y:rotation===90||rotation===180?size.height:0,width:w,height:h,rotate:degrees(-rotation)});
 return page;
}
