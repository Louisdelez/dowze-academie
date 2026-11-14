import {settleAllNotebookAccounts,resumeAllNotebookAccounts} from './notebookSession.ts';
interface CacheBarrier {flush:()=>Promise<void>;freeze:()=>void;unfreeze:()=>void}
/** Native request/receipt barrier: caches freeze only after note text and audio have committed. */
export async function flushNotebookWorkspaceForClose(cache:CacheBarrier,ready:Promise<unknown>,receipt:(success:boolean)=>Promise<void>){
 try{await ready;await settleAllNotebookAccounts();await cache.flush();cache.freeze();await cache.flush();await receipt(true);}
 catch(error){resumeAllNotebookAccounts();cache.unfreeze();await receipt(false).catch(()=>{});throw error;}
}
