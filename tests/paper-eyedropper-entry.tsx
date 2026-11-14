import {createElement,useLayoutEffect} from 'react';
import {usePaperToolPreferences} from '../src/hooks/usePaperToolPreferences';
import {PaperToolSettings} from '../src/components/PaperToolSettings';
import type {ApiClient} from '../pwa/src/api';
export function EyeDropperSettingsRecipe(props:{scope:{accountId:string;spaceId:string;api?:ApiClient};noteId:string;report:(value:ReturnType<typeof usePaperToolPreferences>)=>void}){
 const preferences=usePaperToolPreferences(props.scope,props.noteId);useLayoutEffect(()=>{props.report(preferences);});
 return createElement('main',null,createElement(PaperToolSettings,{preferences}));
}
export {act,createElement,StrictMode} from 'react';
export {createRoot} from 'react-dom/client';
export {ApiClient} from '../pwa/src/api';
export {migratePaper,notebookDocumentId} from '../src/lib/notebookDocument';
export {amendPaperCollaboration} from '../src/lib/paperCollaboration';
export {defaultPaperToolPreferences,paperToolPreferenceKey,paperToolPreferenceHistoryPrefix,loadPaperToolPreferences} from '../src/lib/paperToolPreferences';
export {notebookIdentityDigest} from '../src/lib/notebookIdentity';
export {settleAllNotebookAccounts,resumeAllNotebookAccounts,hasPendingNotebookWrites} from '../src/lib/notebookSession';
export * as storage from '../pwa/src/storage';
