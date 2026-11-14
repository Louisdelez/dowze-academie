import {paperMarkdown} from './paperArchiveMetadata';
import type {PaperDocument} from './notebookDocument';
import type {NotebookMarkdownWriter} from '../components/NotebookEditor';

interface Source {
 markdown:string;
 ready:boolean;
 readOnly:boolean;
 getCurrent:()=>PaperDocument|null;
 whenSaved:()=>Promise<unknown>;
 mirrorMarkdown:(value:string,writer:NotebookMarkdownWriter)=>Promise<boolean>;
 writer:NotebookMarkdownWriter;
}
/** One already-mounted notebook participant. It never starts an account settle
 * or registers another participant while flushing its accepted publication. */
export function createPaperMarkdownMirrorBarrier(input:{current:()=>boolean;captureCurrent:()=>()=>boolean;read:()=>Source;flushCanonical:()=>Promise<boolean>}){
 let enabled=true,work:Promise<boolean>|undefined,flushing:Promise<void>|undefined,confirmed:string|undefined,failure:unknown;
 const active=()=>input.current();
 const eligible=()=>{const value=input.read();return active()&&value.ready&&!value.readOnly;};
 const capture=()=>{
  if(!enabled||!eligible())return null;
  const observed=input.read(),document=observed.getCurrent();if(!document)return null;
  const lease=input.captureCurrent(),writer=observed.writer;let retired=false;
  const current=()=>{if(retired)return false;try{if(!active()||lease()!==true)retired=true;}catch{retired=true;}return !retired;};
  return current()?{noteId:document.noteId,lineage:document.collaboration?.lineage,writer,current}:null;
 };
 type Admission=NonNullable<ReturnType<typeof capture>>;
 const drive=async(binding:Admission)=>{
  const bound=()=>{if(!binding.current())return false;const value=input.read().getCurrent();return !!value&&value.noteId===binding.noteId&&value.collaboration?.lineage===binding.lineage;};
  for(let attempt=0;attempt<3;attempt++){
   if(!bound())return false;
   let source=input.read();await source.whenSaved();
   if(!bound()||!eligible())return false;
   source=input.read();const baseline=source.getCurrent();if(!baseline)return false;
   const value=paperMarkdown(baseline);
   if(value===confirmed||value===source.markdown){confirmed=value;return true;}
   const accepted=await source.mirrorMarkdown(value,async(text,expected)=>{
    if(!bound())return false;
    const accepted=await binding.writer(text,expected);
    // The hook can publish its local receipt immediately after the callback.
    // Refuse here, before control returns to it, when the session was revoked.
    return bound()?accepted:false;
   });
   if(!bound())return false;
   if(accepted){confirmed=value;const latest=input.read().getCurrent();if(latest&&paperMarkdown(latest)===value)return true;}
   else if(input.read().getCurrent()===baseline)throw Error('Le miroir de la note attend son enregistrement durable.');
   // A new canonical revision invalidates the old plan, including a layout-only
   // revision. Prepare afresh; never replay its former bridge transaction.
  }
  throw Error('La note a continué à changer. Ses pages sont conservées ; terminez la saisie avant de fermer.');
 };
 const requestCaptured=(binding:Admission|null):Promise<boolean>=>{
  if(work)return work;
  if(!binding||!binding.current()||!enabled||!eligible())return Promise.resolve(false);
  const observed=input.read(),source=observed.getCurrent();if(!source)return Promise.resolve(false);
  if(source.noteId!==binding.noteId||source.collaboration?.lineage!==binding.lineage)return Promise.resolve(false);
  // A layout-only render of text already confirmed by this parent is a true
  // no-op, rather than a new pending job after the account has settled.
  try{const value=paperMarkdown(source);if(value===confirmed||value===observed.markdown){confirmed=value;failure=undefined;return Promise.resolve(true);}}
  catch(error){failure=error;return Promise.reject(error);}
  failure=undefined;
  let operation:Promise<boolean>;
  operation=Promise.resolve().then(()=>drive(binding)).then(value=>{if(!value&&active())throw Error('Le miroir courant n’a pas été confirmé.');return value;}).catch(error=>{failure=error;throw error;}).finally(()=>{if(work===operation)work=undefined;});
  work=operation;return operation;
 };
 const request=():Promise<boolean>=>{if(work)return work;try{return requestCaptured(capture());}catch(error){failure=error;return Promise.reject(error);}};
 const settled=async()=>{
  for(;;){const flush=flushing,mirror=work;await Promise.all([flush,mirror]);if(flush===flushing&&mirror===work||!flushing&&!work)break;}
  if(failure&&active())throw failure;
 };
 const flush=():Promise<void>=>{
  if(flushing)return flushing;
  if(!enabled||!eligible())return settled();
  const admitted=capture();if(!admitted)return Promise.reject(Error('La session de la note a changé avant sa fermeture.'));
  let operation:Promise<void>;
  operation=(async()=>{
   if(await input.flushCanonical()!==true)throw Error('Terminez la saisie en cours avant de fermer la note.');
   if(!admitted.current())throw Error('La session a changé pendant la fermeture de la note.');
   if(await requestCaptured(admitted)!==true)throw Error('Le miroir de la note attend son enregistrement durable.');
   if(!admitted.current())throw Error('La session a changé avant le reçu de fermeture de la note.');
  })().catch(error=>{failure=error;throw error;}).finally(()=>{if(flushing===operation)flushing=undefined;});
  flushing=operation;return operation;
 };
 return {request,flush,settled,pending:()=>!!work||!!flushing,suspend:()=>{enabled=false;},resume:()=>{enabled=true;}};
}
