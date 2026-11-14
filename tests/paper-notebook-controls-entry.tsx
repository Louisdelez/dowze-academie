/** Actual Notebook integration; only geometry/IDB/media devices are fixture seams. */
import {createElement,useLayoutEffect,type ComponentProps} from 'react';
import {PaperNotebook} from '../src/components/PaperNotebook';
import {WorkspaceTabVisibility} from '../src/lib/workspaceTabVisibility';
import {usePaperNotebookControls,type PaperNotebookControlsOptions,type PaperNotebookControls} from '../src/hooks/usePaperNotebookControls';
import {PaperNotebookViewControls} from '../src/components/PaperNotebookViewControls';
export function NotebookControlsRecipe({visible,...props}:ComponentProps<typeof PaperNotebook>&{visible:boolean}){
 return createElement(WorkspaceTabVisibility.Provider,{value:visible},createElement(PaperNotebook,props));
}
export function NotebookControlsProbe({options,report}:{options:PaperNotebookControlsOptions;report:(controls:PaperNotebookControls)=>void}){
 const controls=usePaperNotebookControls(options);
 useLayoutEffect(()=>{report(controls);});
 return <section aria-label="Source-scoped controls probe" onKeyDown={controls.onKeyDown} onCompositionStartCapture={controls.onCompositionStartCapture} onCompositionEndCapture={controls.onCompositionEndCapture}><PaperNotebookViewControls controls={controls}/><div data-paper-command-surface="true" tabIndex={0}>Real mounted keyboard surface</div></section>;
}
export {createElement,act,StrictMode} from 'react';
export {createRoot} from 'react-dom/client';
export {ApiClient} from '../pwa/src/api';
export {migratePaper,blankPage,notebookDocumentId,isPaperDocument} from '../src/lib/notebookDocument';
export {amendPaperCollaboration} from '../src/lib/paperCollaboration';
export {paperMarkdown} from '../src/lib/paperArchiveMetadata';
export {putDraft,getDraft,putSnapshot,listDrafts,listMutations,listSnapshots,listLocalBlobs,getAudioRecordingJournal} from '../pwa/src/storage';
export {appStorage} from '../src/lib/appStorage';
export {settleAllNotebookAccounts,resumeAllNotebookAccounts,hasPendingNotebookWrites} from '../src/lib/notebookSession';

export {paperToolPreferenceKey,loadPaperToolPreferences,applyPaperToolPreferenceCommand,paperToolPreferenceOverride} from '../src/lib/paperToolPreferences';
export {notebookIdentityDigest} from '../src/lib/notebookIdentity';
