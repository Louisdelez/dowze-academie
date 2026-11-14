import {hasPendingNotebookWrites} from './notebookSession.ts';
/** Warn only when leaving would interrupt an accepted notebook write. */
export function bindNotebookBeforeUnload(target:Pick<EventTarget,'addEventListener'|'removeEventListener'>,pending:()=>boolean=hasPendingNotebookWrites){
 const listener=(event:Event)=>{if(!pending())return;event.preventDefault();try{(event as BeforeUnloadEvent).returnValue='';}catch{/* EventTarget test hosts need no legacy returnValue setter. */}};
 target.addEventListener('beforeunload',listener);return()=>target.removeEventListener('beforeunload',listener);
}
