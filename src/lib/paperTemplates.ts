import {paperObjectsOnPage} from './paperTextFlow.ts';
import type {PaperDocument,PaperPage,PaperCommand} from './notebookDocument.ts';
import {objectPoint} from './paperGeometry.ts';
export const PAPER_FORMATS={A4:[210,297],A5:[148,210],A3:[297,420],Letter:[215.9,279.4]} as const;
export type PageTemplate='standard'|'cornell'|'music'|'weekly';
export const paperUnits=(millimetres:number)=>Math.round(millimetres*96/25.4*100)/100;
export const paperMillimetres=(units:number)=>Math.round(units*25.4/96*10)/10;
export function pageFormat(page:PaperPage):keyof typeof PAPER_FORMATS|'custom'{
 const sides=[page.width,page.height].sort((a,b)=>a-b);
 for(const [name,size] of Object.entries(PAPER_FORMATS))if(size.every((mm,i)=>Math.abs(paperUnits(mm)-sides[i])<2))return name as keyof typeof PAPER_FORMATS;
 return 'custom';
}
/** Paper geometry changes never scale handwriting. Shrinking must not hide existing objects. */
export function changePaperFormat(document:PaperDocument,pageId:string,widthMm:number,heightMm:number):PaperCommand{
 const page=document.pages.find(p=>p.id===pageId);if(!page)throw Error('Cette page n’existe plus.');if(page.pdf)throw Error('Le format du PDF est conservé. Ajoutez une page vierge pour changer de format.');
 if(!Number.isFinite(widthMm)||!Number.isFinite(heightMm)||widthMm<50||heightMm<50||widthMm>2000||heightMm>2000)throw Error('Choisissez des dimensions de 50 à 2000 mm.');
 const width=paperUnits(widthMm),height=paperUnits(heightMm);
 if(width<page.width-.1||height<page.height-.1){
  for(const o of paperObjectsOnPage(document,pageId)){
   const vertices=o.kind==='ink'?o.points??[]:[{x:0,y:0},{x:o.width,y:0},{x:o.width,y:o.height},{x:0,y:o.height}];
   const padding=o.kind==='ink'?(o.strokeWidth??3)*1.2:0;
   if(vertices.some(p=>{const point=objectPoint(o,p);return point.x+padding>width+.1||point.y+padding>height+.1;}))throw Error('Ce format couperait une annotation. Déplacez-la ou choisissez un format plus grand ; la page reste intacte.');
  }
 }
 return {type:'update-page',page:{...page,width,height}};
}
export function inheritedBlankPage(page:PaperPage,id=crypto.randomUUID()):PaperPage{const {pdf,bookmark,rotation,flowRootId,...rest}=page;return {...rest,...(rest.calibration?{calibration:{...rest.calibration}}:{}),id,bookmark:false,rotation:0};}
