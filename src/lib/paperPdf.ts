import {getDocument,GlobalWorkerOptions} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type {PaperPage} from './notebookDocument';
GlobalWorkerOptions.workerSrc=workerUrl;
export async function openPaperPdf(blob:Blob,options:{current?:()=>boolean;signal?:AbortSignal}={}){
 const signal=options.signal,guard=options.current,current=()=>!signal?.aborted&&(guard?.()??true);if(!current())throw Error('Le carnet PDF a changé avant son ouverture.');const bytes=new Uint8Array(await blob.arrayBuffer());if(!current())throw Error('Le carnet PDF a changé pendant sa lecture.');
 const task=getDocument({data:bytes,useSystemFonts:true,maxImageSize:16000000}),abort=()=>{void task.destroy().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
 try{const pdf=await task.promise;if(!current()){await task.destroy();throw Error('Le carnet PDF a changé pendant son ouverture.');}return Object.assign(pdf,{destroy:()=>{signal?.removeEventListener('abort',abort);return task.destroy();}});}catch(e){signal?.removeEventListener('abort',abort);await task.destroy();throw e;}
}
export async function importPaperPdf(file:Blob,assetId:string,options:{current?:()=>boolean;signal?:AbortSignal}={}):Promise<PaperPage[]>{
 const signal=options.signal,guard=options.current,current=()=>!signal?.aborted&&(guard?.()??true),check=()=>{if(!current())throw Error('La note du PDF a changé. Son original conservé pourra être repris.');};
 const pdf=await openPaperPdf(file,{signal,current});try{
 if(pdf.numPages>500)throw Error('Importez ce document en parties de 500 pages maximum.');const pages:PaperPage[]=[];let indexedCharacters=0;
 for(let i=1;i<=pdf.numPages;i++){check();const p=await pdf.getPage(i);try{check();const v=p.getViewport({scale:4/3});if(v.width<100||v.width>20000||v.height<100||v.height>100000)throw Error('Le format d’une page PDF dépasse les dimensions prises en charge.');let text='';if(indexedCharacters<2_000_000){const content=await p.getTextContent();check();text=content.items.map(item=>'str' in item?item.str+('hasEOL' in item&&item.hasEOL?'\n':' '):'').join('').slice(0,Math.max(0,2_000_000-indexedCharacters));indexedCharacters+=text.length;}pages.push({id:crypto.randomUUID(),width:v.width,height:v.height,pattern:'plain',color:'#ffffff',bookmark:false,rotation:0,pdf:{assetId,pageNumber:i,text}});}finally{p.cleanup();}}check();return pages;
 }finally{await pdf.destroy();}
}

export async function extractPaperPdfPageText(blob:Blob,pageNumber:number):Promise<string>{const pdf=await openPaperPdf(blob);try{const page=await pdf.getPage(pageNumber),content=await page.getTextContent();return content.items.map(item=>'str' in item?item.str+('hasEOL' in item&&item.hasEOL?'\n':' '):'').join('').slice(0,120000);}finally{await pdf.destroy();}}
