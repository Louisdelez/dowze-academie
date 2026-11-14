import {createElement,useLayoutEffect} from 'react';
import {usePaperToolPreferences} from '../src/hooks/usePaperToolPreferences';
export function ToolPreferenceRecipe(props:{scope:{accountId:string;spaceId:string};noteId:string;report:(value:ReturnType<typeof usePaperToolPreferences>)=>void}){
 const preferences=usePaperToolPreferences(props.scope,props.noteId);
 useLayoutEffect(()=>props.report(preferences));
 return createElement('div',{'data-account':props.scope.accountId,'data-space':props.scope.spaceId,'data-note':props.noteId,'data-ready':preferences.ready,'data-saving':preferences.saving},JSON.stringify({effective:preferences.effective,notice:preferences.notice}));
}
export {createElement,act} from 'react';
export {createRoot} from 'react-dom/client';
export {flushSync} from 'react-dom';
export {getSnapshot,putSnapshot,listSnapshots,notebookDeletionKey} from '../pwa/src/storage';
export {loadPaperToolPreferences,commitPaperToolPreferences,applyPaperToolPreferenceCommand,activePaperToolSlot,paperToolPreferenceKey,paperToolPreferenceHistoryPrefix,defaultPaperToolPreferences} from '../src/lib/paperToolPreferences';
export {notebookDocumentId} from '../src/lib/notebookIdentity';
export {hasPendingNotebookWrites,settleNotebookAccount,resumeNotebookAccount,resumeAllNotebookAccounts} from '../src/lib/notebookSession';
