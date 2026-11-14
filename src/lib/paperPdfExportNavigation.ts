import type {PDFDocument} from 'pdf-lib';
import {readPaperAsset} from './paperAssets';
import {openPaperPdf} from './paperPdf';
import {addPaperPdfLink,addPaperPdfOutlines,preparePdfOutline,pdfDestinationPage,pdfLinkRectangle,type PdfOutlineExport} from './paperPdfLinkExport';
import type {PaperDocument} from './notebookDocument';
import type {NotebookMediaScope} from '../components/NotebookEditor';
/** Rebuild links against the exported page references after insertions, copies and reordering. */
export async function exportPaperPdfNavigation(output:PDFDocument,document:PaperDocument,media:NotebookMediaScope,current:()=>boolean=()=>true){
 const outlines:PdfOutlineExport[]=[];
 for(const asset of document.assets.filter(a=>document.pages.some(p=>p.pdf?.assetId===a.id))){
  if(!current())throw Error('Le carnet a changé pendant l’export de ses liens.');const source=await openPaperPdf(await readPaperAsset(asset,media,{document,current}));try{
   const target=(page:number)=>{const i=document.pages.findIndex(p=>p.pdf&&p.pdf.assetId===asset.id&&p.pdf.pageNumber===page);return i<0?undefined:i;};
   for(let i=0;i<document.pages.length;i++){if(!current())throw Error('Le carnet a changé pendant l’export de ses liens.');const page=document.pages[i];if(page.pdf?.assetId!==asset.id)continue;const original=await source.getPage(page.pdf.pageNumber),viewport=original.getViewport({scale:1,rotation:original.rotate+page.rotation});
    for(const a of (await original.getAnnotations({intent:'display'})).slice(0,1000)){if(a.subtype!=='Link')continue;const box=pdfLinkRectangle(viewport,a.rect);if(!box)continue;let number:number|undefined;try{number=await pdfDestinationPage(source,a.dest);}catch{}addPaperPdfLink(output,output.getPage(i),box,number===undefined?undefined:target(number),a.url);}original.cleanup();
   }
   const items=await preparePdfOutline(source,await source.getOutline(),target);if(items.length)outlines.push({title:asset.name,items});
  }finally{await source.destroy();}
 }
 if(!current())throw Error('Le carnet a changé pendant l’export de ses liens.');addPaperPdfOutlines(output,outlines);
}
