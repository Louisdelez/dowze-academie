/** A captured editor incarnation. API identity is runtime authority, never recovery data. */
export interface PaperTextWriterSource {
 accountId:string|null;spaceId:string|null;noteId:string|null;editorId:string;
 api:unknown;generation:string|number;serial:number;
}
export interface PaperTextWriterBuffer {
 markdown:string;composing:boolean;unconfirmedDOM:boolean;focused:boolean;caretY:number|null;
 domText?:string;document?:unknown;
}
export interface PaperTextWriterActivity {
 source:Readonly<PaperTextWriterSource>;dirty:boolean;composing:boolean;unconfirmedDOM:boolean;
 focused:boolean;caretY:number|null;version:number;pendingOperations:number;retired:boolean;error:string|null;
}
export interface PaperTextWriterOptions {
 source:PaperTextWriterSource;initialMarkdown:string;current:()=>boolean;read:()=>PaperTextWriterBuffer;
 /** Call the canonical callback and capture its durable tail in this same synchronous call. */
 persist:(markdown:string)=>{result:unknown;durable?:PromiseLike<unknown>};
 /** Preserve this exact buffer under the captured source. Resolve only after durable storage. */
 preserve:(buffer:Readonly<PaperTextWriterBuffer>,version:number)=>Promise<void>;
 onActivity?:(activity:PaperTextWriterActivity)=>void;
}
export interface PaperTextWriter {
 current:()=>boolean;flush:()=>Promise<boolean>;settled:()=>Promise<boolean>;
 pending:()=>boolean;composing:()=>boolean;activity:()=>PaperTextWriterActivity;
 /** Every accepted local transaction advances the version, even when already dirty. */
 changed:()=>void;probe:()=>void;
 /** A caller may apply a remote transaction only after checking pending() is false. */
 acknowledge:(markdown:string)=>boolean;retire:()=>Promise<boolean>;
}
type Outcome={ok:boolean;version:number;preservedUnconfirmed?:boolean};
const message=(error:unknown)=>error instanceof Error?error.message:String(error);
const copyBuffer=(value:PaperTextWriterBuffer):Readonly<PaperTextWriterBuffer>=>{
 if(!value||typeof value.markdown!=='string')throw new TypeError('The editor buffer cannot be read');
 return Object.freeze({markdown:value.markdown,composing:!!value.composing,unconfirmedDOM:!!value.unconfirmedDOM,
  focused:!!value.focused,caretY:typeof value.caretY==='number'&&Number.isFinite(value.caretY)?value.caretY:null,
  ...(typeof value.domText==='string'?{domText:value.domText}:{}),...('document' in value?{document:value.document}:{})});
};
const sameActivity=(a:PaperTextWriterActivity|null,b:PaperTextWriterActivity)=>!!a&&
 a.dirty===b.dirty&&a.composing===b.composing&&a.unconfirmedDOM===b.unconfirmedDOM&&
 a.focused===b.focused&&a.caretY===b.caretY&&a.version===b.version&&
 a.pendingOperations===b.pendingOperations&&a.retired===b.retired&&a.error===b.error;

/** One non-cancellable preservation operation. Failure never discards the owned buffer. */
export function createPaperTextWriter(options:PaperTextWriterOptions):PaperTextWriter {
 const source:Readonly<PaperTextWriterSource>=Object.freeze({accountId:options.source.accountId,spaceId:options.source.spaceId,
  noteId:options.source.noteId,editorId:options.source.editorId,api:options.source.api,generation:options.source.generation,serial:options.source.serial});
 const read=options.read,persist=options.persist,preserve=options.preserve,allows=options.current,onActivity=options.onActivity;
 let confirmed=options.initialMarkdown,version=0,dirty=false,forceDirty=false,retired=false,error:string|null=null;
 let buffer:Readonly<PaperTextWriterBuffer>=Object.freeze({markdown:confirmed,composing:false,unconfirmedDOM:false,focused:false,caretY:null});
 let observed=false,operation:Promise<boolean>|null=null,lastActivity:PaperTextWriterActivity|null=null,emitting=false,queued=false;
 const snapshot=():PaperTextWriterActivity=>Object.freeze({source,dirty,composing:buffer.composing,unconfirmedDOM:buffer.unconfirmedDOM,
  focused:buffer.focused,caretY:buffer.caretY,version,pendingOperations:operation?1:0,retired,error});
 const emit=()=>{
  if(emitting){queued=true;return;}
  do{
   queued=false;const next=snapshot();if(sameActivity(lastActivity,next))break;lastActivity=next;
   emitting=true;try{onActivity?.(next);}catch{ /* Observer failures cannot erase input or reject a save barrier. */ }finally{emitting=false;}
  }while(queued);
 };
 const fail=(reason:unknown)=>{error=message(reason);forceDirty=true;dirty=true;emit();};
 const current=()=>{
  if(retired)return false;
  let allowed=false;try{allowed=allows()===true;}catch(reason){fail(reason);}
  if(!allowed){retired=true;emit();}return allowed;
 };
 const readOwned=(track:boolean):Readonly<PaperTextWriterBuffer>|null=>{
  let next:Readonly<PaperTextWriterBuffer>;try{next=copyBuffer(read());}catch(reason){fail(reason);return null;}
  if(track&&observed){
   const markdownChanged=next.markdown!==buffer.markdown;
   const rawChanged=next.unconfirmedDOM!==buffer.unconfirmedDOM||(next.unconfirmedDOM||buffer.unconfirmedDOM)&&next.domText!==buffer.domText;
   if(markdownChanged||rawChanged||next.composing!==buffer.composing)version++;
   if(markdownChanged||rawChanged)forceDirty=true;
  }
  buffer=next;observed=true;dirty=forceDirty||buffer.markdown!==confirmed||buffer.unconfirmedDOM;return next;
 };
 const probe=()=>{current();readOwned(true);emit();};
 const clean=()=>!dirty&&!buffer.composing&&!buffer.unconfirmedDOM&&error===null;
 const perform=async():Promise<Outcome>=>{
  current();const captured=readOwned(true);emit();const capturedVersion=version;
  if(!captured)return {ok:false,version:capturedVersion};
  if(clean())return {ok:true,version:capturedVersion};
  error=null;emit();
  try{
   if(captured.composing||captured.unconfirmedDOM){
    // Serialized Markdown does not prove that the IME's visible DOM was committed.
    forceDirty=true;dirty=true;emit();await preserve(captured,capturedVersion);
    error='Le texte en cours de composition reste dans l’éditeur.';emit();return {ok:false,version:capturedVersion,preservedUnconfirmed:true};
   }
   if(!current())await preserve(captured,capturedVersion);
   else{
    // No await may separate admission, canonical publication and durable-tail capture.
    const publication=persist(captured.markdown);
    // Observe an early durable rejection even when a legacy callback is still pending.
    const durable=publication.durable===undefined?null:Promise.resolve(publication.durable).then(
     ()=>({ok:true as const}),reason=>({ok:false as const,reason}));
    let accepted:unknown,refusal:unknown,resultFailed=false;
    try{accepted=await publication.result;}catch(reason){refusal=reason;resultFailed=true;}
    const saved=durable?await durable:null;
    if(resultFailed)throw refusal;
    if(accepted===false)throw Error('Votre texte reste dans l’éditeur ; son enregistrement doit être repris.');
    if(saved&&!saved.ok)throw saved.reason;
    if(!durable)await preserve(captured,capturedVersion);
   }
   const latest=readOwned(true);
   if(!latest||version!==capturedVersion||latest.markdown!==captured.markdown||latest.composing||latest.unconfirmedDOM){
    forceDirty=true;dirty=true;emit();return {ok:false,version:capturedVersion};
   }
   confirmed=captured.markdown;forceDirty=false;dirty=false;error=null;emit();return {ok:true,version:capturedVersion};
  }catch(reason){fail(reason);return {ok:false,version:capturedVersion};}
 };
 const flush=():Promise<boolean>=>{
  if(operation)return operation;
  let resolve!:(accepted:boolean)=>void;const ticket=new Promise<boolean>(yes=>{resolve=yes;});operation=ticket;
  // Reentrant observers/read/persist see this very Promise and cannot start a second write.
  emit();
  const run=async()=>{
   const outcome=await perform();
   // Only a successful raw-buffer preservation may have overlapped the real
   // DOM observer confirmation. Drain that newer confirmed version once under
   // this SAME ticket; never retry publication/storage errors or end IME.
   if(outcome.preservedUnconfirmed){
    const latest=readOwned(true);emit();
    if(latest&&version!==outcome.version&&!latest.composing&&!latest.unconfirmedDOM)return perform();
   }
   return outcome;
  };
  void run().then(outcome=>{
   if(operation===ticket)operation=null;emit();
   readOwned(true);emit();resolve(outcome.ok&&version===outcome.version&&clean());
  },reason=>{fail(reason);if(operation===ticket)operation=null;emit();resolve(false);});
  return ticket;
 };
 const settled=():Promise<boolean>=>{
  if(operation)return operation;
  probe();return Promise.resolve(clean());
 };
 const acknowledge=(markdown:string)=>{
  if(operation||forceDirty||error!==null||dirty&&version!==0||!current())return false;
  const next=readOwned(false);
  if(!next||operation||forceDirty||next.markdown!==markdown||next.composing||next.unconfirmedDOM||!current())return false;
  confirmed=markdown;dirty=false;error=null;emit();return true;
 };
 return {
  current,flush,settled,probe,acknowledge,
  changed:()=>{version++;forceDirty=true;dirty=true;readOwned(false);emit();},
  pending:()=>{probe();return !!operation||!clean();},
  composing:()=>{probe();return buffer.composing;},
  activity:()=>{probe();return snapshot();},
  retire:()=>{retired=true;emit();return flush();}
 };
}
