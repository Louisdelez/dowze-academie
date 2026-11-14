import {createElement,useLayoutEffect} from 'react';
import {usePaperToolPreferences} from '../src/hooks/usePaperToolPreferences';
import type {ApiClient} from '../pwa/src/api';

/** Actual hook; the report only observes committed values. No writer is replaced. */
export function ToolAuthorityRecipe(props:{scope:{accountId:string;spaceId:string;api?:ApiClient};noteId:string;report:(value:ReturnType<typeof usePaperToolPreferences>)=>void}){
 const preferences=usePaperToolPreferences(props.scope,props.noteId);
 useLayoutEffect(()=>props.report(preferences));
 return createElement('output',{'data-ready':String(preferences.ready),'data-saving':String(preferences.saving)},preferences.notice);
}
export {act,createElement,StrictMode} from 'react';
export {createRoot} from 'react-dom/client';
export {ApiClient} from '../pwa/src/api';
export * as storage from '../pwa/src/storage';
export {migratePaper,notebookDocumentId} from '../src/lib/notebookDocument';
export {amendPaperCollaboration} from '../src/lib/paperCollaboration';
export {paperToolPreferenceKey,defaultPaperToolPreferences,applyPaperToolPreferenceCommand} from '../src/lib/paperToolPreferences';
export {settleAllNotebookAccounts,resumeAllNotebookAccounts,hasPendingNotebookWrites} from '../src/lib/notebookSession';
