export interface PdfNavigationDocument {numPages:number;getDestination:(name:string)=>Promise<unknown[]|null>;getPageIndex:(reference:any)=>Promise<number>}
export function safePdfUrl(value:unknown):string|undefined{if(typeof value!=='string'||value.length>8192)return;try{const url=new URL(value);if(['http:','https:','mailto:'].includes(url.protocol))return url.href;}catch{}}
/** PDF destinations are page references or zero-based indexes, never executable actions. */
export async function pdfDestinationPage(pdf:PdfNavigationDocument,dest:unknown):Promise<number|undefined>{
 const value=typeof dest==='string'?await pdf.getDestination(dest):dest;if(!Array.isArray(value)||!value.length)return;const reference=value[0];let index:number;
 if(Number.isInteger(reference))index=reference as number;else if(reference&&typeof reference==='object'&&Number.isSafeInteger(reference.num)&&Number.isSafeInteger(reference.gen))index=await pdf.getPageIndex(reference);else return;
 return Number.isInteger(index)&&index>=0&&index<pdf.numPages?index+1:undefined;
}
export function pdfLinkRectangle(viewport:{convertToViewportPoint:(x:number,y:number)=>number[];width:number;height:number},rect:unknown){
 if(!Array.isArray(rect)||rect.length!==4||!rect.every(Number.isFinite))return;const a=viewport.convertToViewportPoint(rect[0],rect[1]),b=viewport.convertToViewportPoint(rect[2],rect[3]),box=[...a,...b],x=Math.max(0,Math.min(box[0],box[2])),y=Math.max(0,Math.min(box[1],box[3])),right=Math.min(viewport.width,Math.max(box[0],box[2])),bottom=Math.min(viewport.height,Math.max(box[1],box[3]));if(right<=x||bottom<=y)return;
 return {left:x/viewport.width*100,top:y/viewport.height*100,width:(right-x)/viewport.width*100,height:(bottom-y)/viewport.height*100};
}
