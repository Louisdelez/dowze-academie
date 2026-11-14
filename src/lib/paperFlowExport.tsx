import {createRoot} from 'react-dom/client';
import {PaperTextFlowView} from '../components/PaperTextFlowView';
import {applyPaperCommand,type PaperDocument,type PaperObject} from './notebookDocument';
import {reflowPaperText,textFlowFingerprint} from './paperTextFlow';
import {measureTextFlow} from './paperTextMeasurement';
import type {NotebookMediaScope} from '../components/NotebookEditor';
/** Detached reader measurement is shared by export and structural page operations. It never changes the source document. */
export async function measurePaperFlowObject(object:PaperObject,original:PaperDocument,media:NotebookMediaScope,current:()=>boolean=()=>true){
 const checkCurrent=()=>{if(!current())throw Error('Le carnet ou le compte a changé pendant la préparation de ses pages.');};checkCurrent();
 if(object.height<40)throw Error('Agrandissez la zone de texte avant de la préparer.');
 const host=document.createElement('div');host.className='paper-object has-text-flow';host.style.cssText=`position:fixed;left:-30000px;top:0;width:${object.width}px;pointer-events:none;`;host.style.fontFamily=getComputedStyle(document.querySelector('.paper-page')??document.body).fontFamily;document.body.appendChild(host);const root=createRoot(host);let observer:MutationObserver|undefined,timer:ReturnType<typeof setTimeout>|undefined,frame=0,stopped=false;
 try{
  const viewCurrent=()=>!stopped&&current();checkCurrent();
  root.render(<PaperTextFlowView object={object} document={original} media={media} pageId={object.pageId} current={viewCurrent}/>);
  await new Promise<void>((resolve,reject)=>{
   let settled=false,fontsReady=false;
   const fail=(error:unknown)=>{if(settled)return;settled=true;cancelAnimationFrame(frame);reject(error);};
   const check=()=>{
    if(stopped||settled)return;try{checkCurrent();}catch(error){fail(error);return;}
    const body=host.querySelector<HTMLElement>('.paper-flow-source'),failure=body?.dataset.flowLayoutError??host.querySelector('.paper-asset-missing[data-image-error="true"]')?.textContent;
    if(failure){fail(Error(failure));return;}if(!fontsReady||!body||body.dataset.flowReady!=='true'||host.querySelector('.paper-asset-missing,[data-code-ready="false"]'))return;
    if([...host.querySelectorAll('img')].some(image=>!image.complete||!image.naturalWidth))return;
    settled=true;cancelAnimationFrame(frame);resolve();
   };
   observer=new MutationObserver(check);observer.observe(host,{subtree:true,attributes:true,childList:true});host.addEventListener('load',check,true);host.addEventListener('error',()=>fail(Error('Une image du texte ne peut pas être préparée.')),true);
   const inspect=()=>{frame=0;if(stopped||settled)return;check();if(!settled)frame=requestAnimationFrame(inspect);};frame=requestAnimationFrame(inspect);
   void (document.fonts?.ready??Promise.resolve()).then(()=>{if(stopped||settled)return;fontsReady=true;check();},fail);
   timer=setTimeout(()=>fail(Error('Le texte et ses images ne sont pas encore prêts.')),30000);
  });
  checkCurrent();const measured=measureTextFlow(host.querySelector<HTMLElement>('.paper-flow-source')!,object.width,object.height,object.markdown);checkCurrent();if(!measured)throw Error('La disposition du texte ne peut pas être mesurée.');return measured;
 }finally{stopped=true;if(timer)clearTimeout(timer);cancelAnimationFrame(frame);observer?.disconnect();try{root.unmount();}finally{host.remove();}}
}
/** Export lays out the complete canonical text, even before the editor's delayed layout has settled. */
export async function preparePaperFlowExport(original:PaperDocument,media:NotebookMediaScope,current:()=>boolean=()=>true):Promise<PaperDocument>{
 const checkCurrent=()=>{if(!current())throw Error('Le carnet ou le compte a changé pendant la préparation de ses pages.');};checkCurrent();
 let prepared=original;for(const object of original.objects.filter(o=>o.kind==='text')){checkCurrent();const measurement=await measurePaperFlowObject(object,original,media,current);checkCurrent();const command=reflowPaperText(prepared,object.id,textFlowFingerprint(object.markdown??'',object.width,object.height),measurement.breaks,measurement.sourceOffsets);if(command)prepared=applyPaperCommand(prepared,command);}checkCurrent();return prepared;
}
