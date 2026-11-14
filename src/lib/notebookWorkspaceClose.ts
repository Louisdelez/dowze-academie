import {flushNotebookWorkspaceForClose} from './notebookClose';
import {resumeAllNotebookAccounts} from './notebookSession';
import {listen} from '@tauri-apps/api/event';
import {invoke} from '@tauri-apps/api/core';

interface CloseCache {
 flush:()=>Promise<void>;freeze:()=>void;unfreeze:()=>void;
}
export interface NotebookWorkspaceCloseOptions {
 cache:CloseCache;ready:Promise<unknown>;body:Pick<HTMLElement,'inert'>;
}

/** Register the application close listeners. Accepted writes are never aborted.
 * The body stays interactive until writers and both cache flushes have finished:
 * making a composing PM inert before that point could end its accepted IME chain.
 */
export function bindNotebookWorkspaceClose(options:NotebookWorkspaceCloseOptions){
 const {cache,ready,body}=options;
 const listenRequest=(handler:(requestId:number)=>void)=>listen<number>('workspace-flush-request',event=>handler(event.payload));
 const listenCancelled=(handler:()=>void)=>listen('workspace-close-cancelled',handler);
 const receipt=(requestId:number,success:boolean)=>invoke<void>('workspace_cache_flushed',{requestId,success});
 let live=true,epoch=0,masked=false,previousInert=false,tail=Promise.resolve();
 const releases=new Set<()=>void>(),releaseWork:Promise<unknown>[]=[],requests=new Map<number,Promise<void>>();
 const restore=()=>{if(!masked)return;masked=false;if(body.inert)body.inert=previousInert;};
 const resume=()=>{restore();cache.unfreeze();resumeAllNotebookAccounts();};
 const mask=()=>{if(!masked){previousInert=body.inert;masked=true;}body.inert=true;};
 const releaseOne=(release:()=>void)=>{
  let work:Promise<unknown>;try{work=Promise.resolve((release as ()=>unknown)());}catch(error){work=Promise.reject(error);}
  releaseWork.push(work);void work.catch(()=>{});
 };
 const releaseListeners=()=>{for(const release of releases)releaseOne(release);releases.clear();};
 const deactivate=()=>{if(!live)return;live=false;epoch++;releaseListeners();resume();};
 const run=(requestId:number):Promise<void>=>{
  if(!live||!Number.isSafeInteger(requestId)||requestId<0)return Promise.resolve();
  const existing=requests.get(requestId);if(existing)return existing;
  const admittedEpoch=epoch;
  const work=tail.then(async()=>{
   if(!live||epoch!==admittedEpoch){await receipt(requestId,false).catch(()=>{});return;}
   const current=()=>{if(!live||epoch!==admittedEpoch)throw Error('La demande de fermeture a été annulée.');};
   const ownedCache={
    flush:async()=>{current();await cache.flush();current();},
    freeze:()=>{current();cache.freeze();},
    unfreeze:()=>cache.unfreeze(),
   };
   try{
    await flushNotebookWorkspaceForClose(ownedCache,ready.then(current),async success=>{
     if(success){
      current();
      // This callback is reached only after writer settlement, freeze and the
      // second confirmed cache flush. It never masks an accepted composition.
      mask();
     }else restore();
     await receipt(requestId,success);
    });
   }catch{restore();}
  });
  // Every request retains its own native ID; one failure cannot break the queue.
  tail=work.catch(()=>{});requests.set(requestId,work);
  void work.finally(()=>{if(requests.get(requestId)===work)requests.delete(requestId);}).catch(()=>{});
  return work;
 };
 const cancelled=()=>{if(!live)return;epoch++;resume();};
 const adopt=(release:()=>void)=>{if(live)releases.add(release);else releaseOne(release);};
 const listening=Promise.allSettled([
  Promise.resolve().then(()=>listenRequest(id=>{void run(id); })).then(adopt),
  Promise.resolve().then(()=>listenCancelled(cancelled)).then(adopt),
 ]).then(results=>{
  const errors=results.flatMap(result=>result.status==='rejected'?[result.reason]:[]);
  if(errors.length){deactivate();throw new AggregateError(errors,'Les événements de fermeture ne sont pas disponibles.');}
 });
 // Observe setup failure even if a caller disposes before awaiting readiness.
 void listening.catch(()=>{});
 const settled=async()=>{let observed;do{observed=tail;await observed;}while(observed!==tail);};
 return {
  ready:listening,
  settled,
  dispose:async()=>{
   deactivate();await listening.catch(()=>{});releaseListeners();await settled();
   const results=await Promise.allSettled(releaseWork),errors=results.flatMap(result=>result.status==='rejected'?[result.reason]:[]);
   if(errors.length)throw new AggregateError(errors,'Les événements de fermeture attendent leur nettoyage.');
  },
 };
}
