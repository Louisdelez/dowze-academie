export type NotebookAcceptedWriteDurability='canonical'|'recovery';

/** Storage operations are captured at admission. No callback may rediscover a
 * newer account, API or document to decide where this accepted value belongs. */
export interface NotebookAcceptedWriteOptions<Value,Source extends object> {
 source:Source;value:Value;
 save:(source:Readonly<Source>,value:Value)=>Promise<void>;
 /** Must use one stable recovery identity and resolve only after durable commit. */
 preserve:(source:Readonly<Source>,value:Value)=>Promise<void>;
 onCanonicalFailure?:(error:unknown)=>void;
 onFailure?:(error:NotebookAcceptedWriteRecoveryError)=>void;
 /** Called once, after either storage operation actually confirms durability. */
 onDurable?:(kind:NotebookAcceptedWriteDurability)=>void;
}
export interface NotebookAcceptedWrite<Value,Source extends object> {
 readonly source:Readonly<Source>;readonly value:Value;
 /** Canonical publication tail. Its original rejection remains observable even
  * when an independent recovery copy was committed successfully. */
 start:()=>Promise<void>;
 /** Await an attempt, or retry only the captured recovery copy after failure.
  * Concurrent callers join one attempt; a confirmed write never writes again. */
 flush:()=>Promise<void>;retry:()=>Promise<void>;
 /** No automatic retry. Rejects an unconfirmed failure instead of hanging or
  * reporting success. A running attempt is awaited until its storage result. */
 settled:()=>Promise<void>;
 pending:()=>boolean;
 durability:()=>NotebookAcceptedWriteDurability|null;
 failure:()=>NotebookAcceptedWriteRecoveryError|null;
}
export class NotebookAcceptedWriteRecoveryError extends AggregateError {
 readonly canonicalError:unknown;readonly recoveryError:unknown;
 constructor(canonicalError:unknown,recoveryError:unknown){
  super([canonicalError,recoveryError],'L’enregistrement et sa récupération ont échoué. La fermeture attend une conservation durable.');
  this.name='NotebookAcceptedWriteRecoveryError';this.canonicalError=canonicalError;this.recoveryError=recoveryError;
 }
}
const notify=(callback:(()=>void)|undefined)=>{try{callback?.();}catch{/* An observer cannot turn a confirmed storage commit into a failure. */}};

/** One accepted immutable branch. The caller retains its writer registration
 * and value until onDurable. Failure releases neither: flush/retry can preserve
 * the original branch later, even after its UI was retired. Value is not cloned
 * (large documents); callers must keep that captured value immutable. */
export function createNotebookAcceptedWrite<Value,Source extends object>(options:NotebookAcceptedWriteOptions<Value,Source>):NotebookAcceptedWrite<Value,Source> {
 const source:Readonly<Source>=Object.freeze({...options.source}),value=options.value;
 const save=options.save,preserve=options.preserve,onCanonicalFailure=options.onCanonicalFailure,onFailure=options.onFailure,onDurable=options.onDurable;
 let initial:Promise<void>|null=null,operation:Promise<void>|null=null,durable:NotebookAcceptedWriteDurability|null=null;
 let canonicalFailure:{error:unknown}|null=null,failure:NotebookAcceptedWriteRecoveryError|null=null;
 const confirm=(kind:NotebookAcceptedWriteDurability)=>{if(durable)return;durable=kind;failure=null;notify(()=>onDurable?.(kind));};
 const preserveOwned=async()=>{
  try{await preserve(source,value);confirm('recovery');}
  catch(error){failure=new NotebookAcceptedWriteRecoveryError(canonicalFailure?.error,error);notify(()=>onFailure?.(failure!));throw failure;}
 };
 const track=(attempt:Promise<void>)=>{
  operation=attempt;void attempt.catch(()=>{});
  const clear=()=>{if(operation===attempt)operation=null;};void attempt.then(clear,clear);return attempt;
 };
 const start=()=>{
  if(initial)return initial;
  initial=Promise.resolve().then(async()=>{
   try{await save(source,value);confirm('canonical');}
   catch(error){
    canonicalFailure={error};notify(()=>onCanonicalFailure?.(error));
    try{await preserveOwned();}catch{/* The durable barrier keeps both errors; the publication tail keeps its original error. */}
    throw error;
   }
  });
  // Observe the publication rejection separately from the proof of durability.
  // A recovery success permits close but does not rewrite whenSaved's result.
  void initial.catch(()=>{});
  track(initial.then(()=>{},()=>{if(!durable)throw failure??new NotebookAcceptedWriteRecoveryError(canonicalFailure?.error,Error('La récupération n’est pas confirmée.'));}));
  return initial;
 };
 const settled=():Promise<void>=>{
  if(durable)return Promise.resolve();if(operation)return operation;
  return Promise.reject(failure??Error('L’écriture acceptée n’a pas encore été conservée.'));
 };
 const flush=():Promise<void>=>{
  if(durable)return Promise.resolve();if(operation)return operation;
  if(!initial){start();return operation!;}
  // Never replay canonical publication after it failed: it may now be deleted
  // or conflicting. Repeated recovery writes use the caller's same captured key.
  return track(Promise.resolve().then(preserveOwned));
 };
 return {source,value,start,flush,retry:flush,settled,pending:()=>durable===null,durability:()=>durable,failure:()=>failure};
}
