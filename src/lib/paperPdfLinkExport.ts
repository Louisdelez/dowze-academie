import {PDFName,PDFHexString,type PDFDocument,type PDFPage,type PDFRef} from 'pdf-lib';
import {safePdfUrl,type PdfNavigationDocument,pdfDestinationPage,pdfLinkRectangle} from './paperPdfNavigation.ts';
export interface PdfOutlineExport {title:string;targetIndex?:number;url?:string;items:PdfOutlineExport[]}
/** Export only ordinary hyperlinks and internal page destinations, not PDF executable actions. */
export function addPaperPdfLink(pdf:PDFDocument,page:PDFPage,box:{left:number;top:number;width:number;height:number},targetIndex?:number,url?:string){
 const target=targetIndex===undefined?undefined:pdf.getPage(targetIndex);const safe=safePdfUrl(url);if(!target&&!safe)return;
 const x=box.left/100*page.getWidth(),y=(1-(box.top+box.height)/100)*page.getHeight(),w=box.width/100*page.getWidth(),h=box.height/100*page.getHeight();
 const annotation=pdf.context.obj({Type:'Annot',Subtype:'Link',Rect:[x,y,x+w,y+h],Border:[0,0,0],...(target?{Dest:[target.ref,PDFName.of('Fit')]}:{A:{S:'URI',URI:PDFHexString.fromText(safe!)}})});
 page.node.addAnnot(pdf.context.register(annotation));
}
export function addPaperPdfOutlines(pdf:PDFDocument,items:PdfOutlineExport[]){
 if(!items.length)return;const root=pdf.context.obj({Type:'Outlines'}),rootRef=pdf.context.register(root);let nodes=0;
 const attach=(parent:PDFRef,children:PdfOutlineExport[],depth=0):number=>{
  if(depth>20||nodes>=2000)return 0;const entries=[];let count=0;
  for(const item of children){if(nodes++>=2000)break;const target=item.targetIndex===undefined?undefined:pdf.getPage(item.targetIndex),url=safePdfUrl(item.url),dict=pdf.context.obj({Title:PDFHexString.fromText(item.title.slice(0,500)),Parent:parent,...(target?{Dest:[target.ref,PDFName.of('Fit')]}:url?{A:{S:'URI',URI:PDFHexString.fromText(url)}}:{})}),ref=pdf.context.register(dict);const descendants=attach(ref,item.items,depth+1);count+=1+descendants;if(descendants)dict.set(PDFName.of('Count'),pdf.context.obj(descendants));entries.push({dict,ref});}
  const owner=pdf.context.lookup(parent) as typeof root;if(entries.length){owner.set(PDFName.of('First'),entries[0].ref);owner.set(PDFName.of('Last'),entries.at(-1)!.ref);for(let i=0;i<entries.length;i++){if(i)entries[i].dict.set(PDFName.of('Prev'),entries[i-1].ref);if(i+1<entries.length)entries[i].dict.set(PDFName.of('Next'),entries[i+1].ref);}}return count;
 };const count=attach(rootRef,items);root.set(PDFName.of('Count'),pdf.context.obj(count));pdf.catalog.set(PDFName.of('Outlines'),rootRef);
}
export async function preparePdfOutline(pdf:PdfNavigationDocument,items:any[],targetIndex:(page:number)=>number|undefined,depth=0,budget={remaining:2000}):Promise<PdfOutlineExport[]>{
 const result:PdfOutlineExport[]=[];if(depth>20)return result;for(const item of items??[]){if(budget.remaining--<=0)break;let page:number|undefined;try{page=await pdfDestinationPage(pdf,item.dest);}catch{}const children=await preparePdfOutline(pdf,item.items,targetIndex,depth+1,budget),target=page===undefined?undefined:targetIndex(page),url=safePdfUrl(item.url);if(target!==undefined||url||children.length)result.push({title:String(item.title??'Section'),targetIndex:target,url,items:children});}return result;
}
export {pdfLinkRectangle,pdfDestinationPage};
