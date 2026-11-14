import {preparePaperFlowExport} from './paperFlowExport';
import {createRoot} from 'react-dom/client';
import {createRef} from 'react';
import {PDFDocument} from 'pdf-lib';
import {exportPaperPdfNavigation} from './paperPdfExportNavigation';
import {addOriginalPdfPage,paperPdfSize} from './paperPdfExport';
import {toCanvas,getFontEmbedCSS} from 'html-to-image';
import {PaperExportPage} from '../components/PaperExportPage';
import {readPaperAsset} from './paperAssets';
import {paperExportPageAssetIds} from './paperExportAssetManifest';
export {paperExportPageAssetIds} from './paperExportAssetManifest';
import type {PaperDocument,PaperPage} from './notebookDocument';
import type {NotebookMediaScope} from '../components/NotebookEditor';
const PIXEL_LIMIT=16_000_000;
const EXPORT_WAIT_MS=30_000;
const cancelled=()=>Error('Le carnet ou le compte a changé pendant la préparation de son export.');
const timedOut=()=>Error('La préparation de l’export n’est pas prête après 30 secondes.');
interface ExportLease {current:()=>boolean;revoke:()=>void;signal:AbortSignal}
function exportLease(documentValue:PaperDocument,media:NotebookMediaScope,parentCurrent:()=>boolean):ExportLease {
 const accountId=media.accountId,spaceId=media.spaceId,api=media.api,noteId=documentValue.noteId,revision=documentValue.revision,controller=new AbortController();let closed=false;
 const revoke=()=>{if(closed)return;closed=true;controller.abort();};
 const current=()=>{if(closed)return false;let live=false;try{live=media.accountId===accountId&&media.spaceId===spaceId&&media.api===api&&documentValue.noteId===noteId&&documentValue.revision===revision&&parentCurrent();}catch{}if(!live)revoke();return live;};
 return {current,revoke,signal:controller.signal};
}
/** A race stops publication, not every underlying decoder. Dispose late canvases explicitly. */
function waitExportStep<T>(start:()=>Promise<T>|T,lease:ExportLease,deadline=performance.now()+EXPORT_WAIT_MS,disposeLate?:(value:T)=>void):Promise<T>{
 return new Promise<T>((resolve,reject)=>{
  let settled=false;let timer:ReturnType<typeof setTimeout>|undefined,watch:ReturnType<typeof setInterval>|undefined;
  const cleanup=()=>{if(timer)clearTimeout(timer);if(watch)clearInterval(watch);lease.signal.removeEventListener('abort',abort);};
  const fail=(error:unknown)=>{if(settled)return;settled=true;cleanup();lease.revoke();reject(error);};
  const abort=()=>fail(cancelled()),inspect=()=>{if(!lease.current())fail(cancelled());};
  lease.signal.addEventListener('abort',abort,{once:true});
  if(!lease.current()){fail(cancelled());return;}const remaining=deadline-performance.now();
  if(remaining<=0){fail(timedOut());return;}
  timer=setTimeout(()=>fail(timedOut()),remaining);watch=setInterval(inspect,50);
  void Promise.resolve().then(()=>{if(!lease.current())throw cancelled();if(performance.now()>=deadline)throw timedOut();return start();}).then(value=>{
   if(settled){disposeLate?.(value);return;}if(!lease.current()){disposeLate?.(value);fail(cancelled());return;}
   if(performance.now()>=deadline){disposeLate?.(value);fail(timedOut());return;}
   settled=true;cleanup();resolve(value);
  },fail).catch(fail);
 });
}
const clearCanvas=(canvas:HTMLCanvasElement)=>{canvas.width=0;canvas.height=0;};
export function exportPixelRatio(page:Pick<PaperPage,'width'|'height'>){
 if(page.width*page.height>PIXEL_LIMIT||page.width>16000||page.height>16000)throw Error('Cette page est trop grande pour un export image. Répartissez son contenu sur plusieurs pages.');
 return Math.min(2,Math.sqrt(PIXEL_LIMIT/(page.width*page.height)),16000/page.width,16000/page.height);
}
const canvasBlob=(canvas:HTMLCanvasElement,type:string)=>new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('L’image n’a pas pu être produite.')),type,0.95));
async function renderPage(documentValue:PaperDocument,page:PaperPage,media:NotebookMediaScope,annotationsOnly=false,current:()=>boolean=()=>true):Promise<HTMLCanvasElement>{
 const lease=exportLease(documentValue,media,current),deadline=performance.now()+EXPORT_WAIT_MS,ref=createRef<HTMLDivElement>();let host:HTMLDivElement|undefined,root:ReturnType<typeof createRoot>|undefined,disposed=false,pageReady=false,failure:string|undefined,observer:MutationObserver|undefined,frame=0,readyFailure:((error:Error)=>void)|undefined,loadListener:(()=>void)|undefined,errorListener:(()=>void)|undefined;
 const viewCurrent=()=>!disposed&&lease.current(),check=()=>{if(!viewCurrent())throw cancelled();};
 try{
 check();for(const id of paperExportPageAssetIds(documentValue,page,annotationsOnly)){const asset=documentValue.assets.find(a=>a.id===id)!;await waitExportStep(()=>readPaperAsset(asset,media,{document:documentValue,current:viewCurrent}),lease,deadline);check();}
 host=document.createElement('div');host.className='paper-rendered-export-host';host.style.cssText=`position:fixed;left:-30000px;top:0;width:${page.width}px;height:${page.height}px;pointer-events:none;background:transparent;`;host.setAttribute('aria-hidden','true');host.style.fontFamily=getComputedStyle(document.querySelector('.paper-page')??document.body).fontFamily;document.body.appendChild(host);root=createRoot(host);
 root.render(<PaperExportPage ref={ref} document={documentValue} page={page} media={media} annotationsOnly={annotationsOnly} current={viewCurrent} onReady={()=>{if(viewCurrent())pageReady=true;}} onError={message=>{if(viewCurrent())failure=message;}}/>);
 const ready=new Promise<void>((resolve,reject)=>{
  let settled=false;
  const fail=(error:Error)=>{if(settled)return;settled=true;cancelAnimationFrame(frame);reject(error);};readyFailure=fail;
  const inspect=()=>{if(disposed||settled)return;if(!viewCurrent()){fail(cancelled());return;}if(failure){fail(Error(failure));return;}const node=ref.current,missing=node?.querySelector('[data-image-error="true"]');if(missing){fail(Error(missing.textContent||'Une image ne peut pas être incluse dans cet export.'));return;}if(!pageReady||!node||node.querySelector('.paper-asset-missing,[data-code-ready="false"]'))return;if([...node.querySelectorAll('img')].some(image=>!image.complete||image.naturalWidth===0))return;settled=true;cancelAnimationFrame(frame);resolve();};
  observer=new MutationObserver(inspect);observer.observe(host!,{subtree:true,attributes:true,childList:true});loadListener=inspect;errorListener=()=>{if(viewCurrent())fail(Error('Une image ne peut pas être incluse dans cet export.'));else fail(cancelled());};host!.addEventListener('load',loadListener,true);host!.addEventListener('error',errorListener,true);
  const poll=()=>{frame=0;if(disposed||settled)return;inspect();if(!settled)frame=requestAnimationFrame(poll);};frame=requestAnimationFrame(poll);
 });
 void ready.catch(()=>{});
 await waitExportStep(()=>Promise.all([ready,document.fonts?.ready??Promise.resolve()]),lease,deadline);check();observer?.disconnect();
 const node=ref.current!;const fonts=await waitExportStep(()=>getFontEmbedCSS(node,{preferredFontFormat:'woff2',fetchRequestInit:{signal:lease.signal}}),lease,deadline);check();
 const canvas=await waitExportStep(()=>toCanvas(node,{width:page.width,height:page.height,pixelRatio:exportPixelRatio(page),fontEmbedCSS:fonts,fetchRequestInit:{signal:lease.signal},backgroundColor:annotationsOnly?undefined:page.color,style:{transform:'none',boxShadow:'none',margin:'0'},filter:node=>!(node instanceof HTMLElement&&node.classList.contains('paper-asset-missing'))}),lease,deadline,clearCanvas);try{check();return canvas;}catch(error){clearCanvas(canvas);throw error;}
 }finally{disposed=true;lease.revoke();if(host)host.style.opacity='0';readyFailure?.(cancelled());cancelAnimationFrame(frame);observer?.disconnect();if(host&&loadListener)host.removeEventListener('load',loadListener,true);if(host&&errorListener)host.removeEventListener('error',errorListener,true);try{root?.unmount();}finally{host?.remove();}}
}
/** Sequential pages bound peak memory; originals and document revisions are never modified. */
export async function renderPaperPdf(document:PaperDocument,media:NotebookMediaScope,onProgress?:(done:number,total:number)=>void,current:()=>boolean=()=>true):Promise<Blob>{
 const lease=exportLease(document,media,current),check=()=>{if(!lease.current())throw cancelled();};try{check();document=await waitExportStep(()=>preparePaperFlowExport(document,media,lease.current),lease);check();
 const pdf=await waitExportStep(()=>PDFDocument.create(),lease);pdf.setCreator('Dowze Académie');pdf.setSubject('Carnet exporté avec ses pages et annotations');
 const originals=new Map<string,PDFDocument>();
 for(let i=0;i<document.pages.length;i++){
  check();const source=document.pages[i];onProgress?.(i,document.pages.length);const size=paperPdfSize(source);let p;
  if(source.pdf){
   const asset=document.assets.find(a=>a.id===source.pdf!.assetId);if(!asset)throw Error('Le PDF original est introuvable.');
   let original=originals.get(asset.id);if(!original){const blob=await waitExportStep(()=>readPaperAsset(asset,media,{document,current:lease.current}),lease),bytes=await waitExportStep(()=>blob.arrayBuffer(),lease);original=await waitExportStep(()=>PDFDocument.load(bytes),lease);check();originals.set(asset.id,original);}
   p=await waitExportStep(()=>addOriginalPdfPage(pdf,original!,source.pdf!.pageNumber-1,size,source.rotation),lease);
  }else p=pdf.addPage([size.width,size.height]);
  const canvas=await renderPage(document,source,media,!!source.pdf,lease.current);
  try{check();const blob=await waitExportStep(()=>canvasBlob(canvas,'image/png'),lease),bytes=await waitExportStep(()=>blob.arrayBuffer(),lease),image=await waitExportStep(()=>pdf.embedPng(new Uint8Array(bytes)),lease);check();p.drawImage(image,{x:0,y:0,width:size.width,height:size.height});}
  finally{clearCanvas(canvas);}
 }
 await waitExportStep(()=>exportPaperPdfNavigation(pdf,document,media,lease.current),lease);check();
 onProgress?.(document.pages.length,document.pages.length);const bytes=await waitExportStep(()=>pdf.save(),lease);check();return new Blob([bytes as Uint8Array<ArrayBuffer>],{type:'application/pdf'});
 }finally{lease.revoke();}
}
export async function renderPaperImage(document:PaperDocument,pageId:string,media:NotebookMediaScope,format:'png'|'jpeg',current:()=>boolean=()=>true):Promise<Blob>{
 const lease=exportLease(document,media,current),check=()=>{if(!lease.current())throw cancelled();};try{check();document=await waitExportStep(()=>preparePaperFlowExport(document,media,lease.current),lease);check();
 const page=document.pages.find(p=>p.id===pageId);if(!page)throw Error('Page introuvable.');const canvas=await renderPage(document,page,media,false,lease.current);try{check();const blob=await waitExportStep(()=>canvasBlob(canvas,`image/${format}`),lease);check();return blob;}finally{clearCanvas(canvas);}
 }finally{lease.revoke();}
}
