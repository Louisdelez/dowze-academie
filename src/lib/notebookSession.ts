/** Local lifecycle only: closing a profile must first settle its own writers. */
export interface NotebookWriter {flush:()=>void|Promise<void>;settled:()=>Promise<unknown>;suspend:()=>void;resume:()=>void;dispose?:()=>void;pending?:()=>boolean}
const writers=new Map<string,Set<NotebookWriter>>();
const transitions=new Map<string,{promise:Promise<void>;participants:Set<NotebookWriter>}>();
export function registerNotebookWriter(accountId:string,writer:NotebookWriter){
 let set=writers.get(accountId);if(!set){set=new Set();writers.set(accountId,set);}set.add(writer);
 const closing=transitions.get(accountId);if(closing){closing.participants.add(writer);writer.suspend();}else writer.resume();
 return()=>{set!.delete(writer);if(!set!.size)writers.delete(accountId);};
}
export function settleNotebookAccount(accountId:string):Promise<void>{
 const previous=transitions.get(accountId);if(previous)return previous.promise;
 const participants=new Set(writers.get(accountId)??[]);let begin!:()=>void;
 const promise=new Promise<void>((resolve,reject)=>{begin=()=>void(async()=>{
  const flushed=new Set<NotebookWriter>();
  while(true){const batch=[...participants].filter(w=>!flushed.has(w));if(!batch.length)break;for(const w of batch)flushed.add(w);await Promise.all(batch.map(async w=>{await w.flush();}));}
  await Promise.all([...participants].map(w=>w.settled()));
  for(const w of participants)w.suspend();
  await Promise.all([...participants].map(w=>w.settled()));
 })().then(resolve,error=>{for(const w of participants)w.resume();transitions.delete(accountId);reject(error);});});
 transitions.set(accountId,{promise,participants});begin();return promise;
}
export function resumeNotebookAccount(accountId:string){const t=transitions.get(accountId);for(const w of t?.participants??writers.get(accountId)??[])w.resume();transitions.delete(accountId);}
export function disposeNotebookAccount(accountId:string){const t=transitions.get(accountId);for(const w of t?.participants??writers.get(accountId)??[])w.dispose?.();transitions.delete(accountId);}

/** Creation/import can finish safely before a profile closes, without changing another profile. */
export async function runNotebookOperation<T>(accountId:string,operation:()=>Promise<T>):Promise<T>{
 let enabled=true,finish!:()=>void;const settled=new Promise<void>(resolve=>finish=resolve);
 const unregister=registerNotebookWriter(accountId,{flush:()=>{},settled:()=>settled,pending:()=>true,suspend:()=>{enabled=false;},resume:()=>{enabled=true;}});
 try{if(!enabled)throw Error('La session se ferme. Reprenez cette opération après connexion.');return await operation();}finally{finish();unregister();}
}

/** Native close must settle every mounted notebook, including background note tabs. */
export async function settleAllNotebookAccounts(){
 const settled=new Set<string>();while(true){const accounts=[...writers.keys()].filter(id=>!settled.has(id));if(!accounts.length)return;for(const id of accounts)settled.add(id);await Promise.all(accounts.map(settleNotebookAccount));}
}
export function resumeAllNotebookAccounts(){for(const id of new Set([...writers.keys(),...transitions.keys()]))resumeNotebookAccount(id);}
export function hasPendingNotebookWrites(){for(const set of writers.values())for(const writer of set)try{if(writer.pending?.())return true;}catch{return true;}return false;}
