import type {NotebookMediaScope} from '../components/NotebookEditor';
import type {PaperDocument} from './notebookDocument';

export const MAX_PAPER_PRINT_BYTES=256*1024*1024;
export const PAPER_PRINT_PREPARATION_MS=300_000;
export interface PaperPrintScope {
 noteId:string;ownerKey:string;generation:string|number;media:NotebookMediaScope;
 current:()=>boolean;getCurrent:()=>PaperDocument|null;title?:string;
}
export interface PaperPrintLease {current:()=>boolean;revoke:()=>void}
export interface PreparedPaperPrint extends PaperPrintLease {
 readonly source:PaperDocument;readonly ownerKey:string;readonly generation:string|number;
 readonly accountId:string;readonly spaceId:string;readonly api:NotebookMediaScope['api'];
 readonly blob:Blob;readonly filename:string;readonly pageCount:number;
}
export type PaperPrintResultStatus='dialog-requested'|'download-requested'|'saved'|'cancelled'|'unavailable'|'refused';
export interface PaperPrintResult {status:PaperPrintResultStatus;message:string}
export type PaperPrintGesture=Pick<Event,'isTrusted'>;
type PdfRenderer=(source:PaperDocument,media:NotebookMediaScope,onProgress:(done:number,total:number)=>void,current:()=>boolean)=>Promise<Blob>;
export interface PaperPrintPreparationOptions {
 /** Flush only when editable, then await the note writer's save barrier. */
 beforePrepare?:()=>Promise<void>|void;onProgress?:(done:number,total:number)=>void;
}
/** An explicit seam for bounded renderer contract tests, never a fallback PDF. */
export interface PaperPrintPreparationDependencies {renderPdf:PdfRenderer}
const revoked=()=>Error('Le carnet ou le compte a changé. Préparez un nouvel aperçu avant d’imprimer.');
const nativeHost=()=>typeof window!=='undefined'&&!!(window as Window&{__TAURI_INTERNALS__?:unknown}).__TAURI_INTERNALS__;
export function paperPrintFilename(title:string|undefined):string {
 const name=(title?.trim()||'carnet').replace(/[\/\\:*?"<>|\x00-\x1f]/g,'-').replace(/\.pdf$/i,'').slice(0,100).trim();
 return `${name||'carnet'}.pdf`;
}
/** Revocation is permanent, including a later return to the same account/note. */
export function createPaperPrintLease(scope:PaperPrintScope,source?:PaperDocument):PaperPrintLease {
 const ownerKey=scope.ownerKey,generation=scope.generation,noteId=scope.noteId,accountId=scope.media.accountId,spaceId=scope.media.spaceId,api=scope.media.api,revision=source?.revision,lineage=source?.collaboration?.lineage;let closed=false;
 const revoke=()=>{closed=true;};
 const current=()=>{
  if(closed)return false;let valid=false;
  try{const latest=scope.getCurrent();valid=scope.ownerKey===ownerKey&&scope.generation===generation&&scope.noteId===noteId&&scope.media.accountId===accountId&&scope.media.spaceId===spaceId&&scope.media.api===api&&scope.current()&&!!latest&&latest.noteId===noteId&&(!source||latest===source&&latest.revision===revision&&latest.collaboration?.lineage===lineage);}catch{}
  if(!valid)revoke();return valid;
 };
 return {current,revoke};
}
function bounded<T>(start:()=>Promise<T>|T,lease:PaperPrintLease,deadline:number):Promise<T>{
 return new Promise<T>((resolve,reject)=>{
  let settled=false,timer:ReturnType<typeof setTimeout>|undefined,watch:ReturnType<typeof setInterval>|undefined;
  const cleanup=()=>{if(timer)clearTimeout(timer);if(watch)clearInterval(watch);};
  const fail=(error:unknown)=>{if(settled)return;settled=true;cleanup();lease.revoke();reject(error);};
  if(!lease.current()){fail(revoked());return;}const remaining=deadline-performance.now();if(remaining<=0){fail(Error('La préparation du PDF dépasse cinq minutes. Aucun fichier partiel n’est imprimé.'));return;}
  timer=setTimeout(()=>fail(Error('La préparation du PDF dépasse cinq minutes. Aucun fichier partiel n’est imprimé.')),remaining);watch=setInterval(()=>{if(!lease.current())fail(revoked());},50);
  void Promise.resolve().then(()=>{if(!lease.current())throw revoked();return start();}).then(value=>{if(settled)return;if(!lease.current()){fail(revoked());return;}settled=true;cleanup();resolve(value);},fail).catch(fail);
 });
}
/** Shared full-note PDF projection: no HTML shell print, page filtering, stored
 * print dimensions or approximate replacement for a failed export renderer. */
export async function preparePaperPrint(scope:PaperPrintScope,options:PaperPrintPreparationOptions={},dependencies?:PaperPrintPreparationDependencies):Promise<PreparedPaperPrint>{
 const opening=createPaperPrintLease(scope),deadline=performance.now()+PAPER_PRINT_PREPARATION_MS;let lease:PaperPrintLease|undefined;
 try{
  await bounded(()=>options.beforePrepare?.(),opening,deadline);if(!opening.current())throw revoked();const source=scope.getCurrent();if(!source||source.noteId!==scope.noteId)throw revoked();
  lease=createPaperPrintLease(scope,source);const current=()=>opening.current()&&!!lease?.current(),combined={current,revoke:()=>{opening.revoke();lease?.revoke();}},media={...scope.media};let pageCount=0,finished=false;
  const progress=(done:number,total:number)=>{if(!current())return;if(!Number.isSafeInteger(done)||!Number.isSafeInteger(total)||total<1||total>2000||done<0||done>total)throw Error('La pagination du PDF complet est invalide.');pageCount=total;finished=done===total;options.onProgress?.(done,total);};
  const render=dependencies?.renderPdf??(await bounded(()=>import('./paperRenderedExport'),combined,deadline)).renderPaperPdf;
  const blob=await bounded(()=>render(structuredClone(source),media,progress,current),combined,deadline);if(!current())throw revoked();
  if(!finished)throw Error('Le PDF complet n’a pas terminé la pagination du carnet.');
  if(!blob.size||blob.size>MAX_PAPER_PRINT_BYTES||blob.type.split(';')[0].toLowerCase()!=='application/pdf')throw Error('Le PDF doit être complet et contenir entre 1 octet et 256 Mo.');
  const header=await bounded(()=>blob.slice(0,8).text(),combined,deadline);if(!header.startsWith('%PDF-'))throw Error('Le moteur d’export n’a pas produit un fichier PDF.');
  if(!current())throw revoked();return {source,ownerKey:scope.ownerKey,generation:scope.generation,accountId:media.accountId,spaceId:media.spaceId,api:media.api,blob,filename:paperPrintFilename(scope.title),pageCount,current,revoke:combined.revoke};
 }catch(error){opening.revoke();lease?.revoke();throw error;}
}
export interface PaperPrintUrlApi {create:(blob:Blob)=>string;revoke:(url:string)=>void}
export interface PaperPrintPreviewController {
 readonly url:string;current:()=>boolean;ready:(frame:HTMLIFrameElement)=>boolean;
 request:(frame:HTMLIFrameElement,gesture:PaperPrintGesture,native?:boolean)=>PaperPrintResult;
 save:(gesture:PaperPrintGesture)=>Promise<PaperPrintResult>;dispose:()=>void;
}
const refused=():PaperPrintResult=>({status:'refused',message:'Une action humaine dans cet aperçu est requise. Préparez-le à nouveau si la note a changé.'});
const unavailable=():PaperPrintResult=>({status:'unavailable',message:'Impression directe indisponible ici. Enregistrez le PDF complet, puis utilisez Imprimer depuis votre lecteur PDF.'});
/** The URL belongs to one preview mount. Disposing it never revokes a prepared
 * source lease, so a StrictMode cleanup/setup can create a fresh owned URL. */
export function createPaperPrintPreview(prepared:PreparedPaperPrint,parentCurrent:()=>boolean=()=>true,urls:PaperPrintUrlApi={create:blob=>URL.createObjectURL(blob),revoke:url=>URL.revokeObjectURL(url)}):PaperPrintPreviewController {
 if(!prepared.current()||!parentCurrent())throw revoked();const url=urls.create(prepared.blob);let disposed=false,readyFrame:HTMLIFrameElement|null=null;
 const clearFrame=()=>{const frame=readyFrame;readyFrame=null;if(frame){frame.style.opacity='0';frame.removeAttribute('src');frame.src='about:blank';}};
 const dispose=()=>{if(disposed)return;disposed=true;clearFrame();urls.revoke(url);};
 const current=()=>{if(disposed)return false;let valid=false;try{valid=prepared.current()&&parentCurrent();}catch{}if(!valid)dispose();return valid;};
 const frameCurrent=(frame:HTMLIFrameElement)=>current()&&frame.isConnected&&frame.getAttribute('src')===url;
 const ready=(frame:HTMLIFrameElement)=>{if(!frameCurrent(frame))return false;readyFrame=frame;return true;};
 const request=(frame:HTMLIFrameElement,gesture:PaperPrintGesture,native=nativeHost()):PaperPrintResult=>{
  if(gesture.isTrusted!==true||!frameCurrent(frame)||readyFrame!==frame)return refused();if(native)return unavailable();
  try{
   if(typeof navigator!=='undefined'&&navigator.pdfViewerEnabled===false)return unavailable();
   const target=frame.contentWindow;if(!target||target.location.href!==url||typeof target.print!=='function')return unavailable();
   if(!current())return refused();target.print();return {status:'dialog-requested',message:'Dialogue d’impression demandé. Son résultat ne peut pas être confirmé par Dowze.'};
  }catch{return unavailable();}
 };
 const save=async(gesture:PaperPrintGesture):Promise<PaperPrintResult>=>{
  if(gesture.isTrusted!==true||!current())return refused();
  if(!nativeHost()){
   if(typeof document==='undefined')return unavailable();const link=document.createElement('a');link.href=url;link.download=prepared.filename;link.rel='noopener';if(!current())return refused();link.click();
   return {status:'download-requested',message:'Téléchargement du PDF complet demandé. Ouvrez ce fichier pour l’imprimer.'};
  }
  try{
   const {save:choose}=await import('@tauri-apps/plugin-dialog');if(!current())return refused();const path=await choose({title:'Enregistrer le PDF du carnet pour impression',defaultPath:prepared.filename,filters:[{name:'PDF',extensions:['pdf']}]});if(!current())return refused();if(!path)return {status:'cancelled',message:'Enregistrement annulé.'};
   const [{writePaperExportChunks},{invoke}]=await Promise.all([import('./paperExport'),import('@tauri-apps/api/core')]);if(!current())return refused();
   await writePaperExportChunks(prepared.blob,path.toLowerCase().endsWith('.pdf')?path:`${path}.pdf`,'pdf',async<T>(command:string,args?:Parameters<typeof invoke>[1],options?:Parameters<typeof invoke>[2]):Promise<T>=>{if(command!=='abort_notebook_export'&&!current())throw revoked();return invoke<T>(command,args,options);});
   return {status:'saved',message:'PDF enregistré. Ouvrez-le dans votre lecteur PDF pour choisir l’imprimante.'};
  }catch(error){if(!current())return refused();return {status:'unavailable',message:`Le PDF n’a pas été enregistré. ${String(error instanceof Error?error.message:error)}`};}
 };
 return {url,current,ready,request,save,dispose};
}
