/** The real Notebook owns usePaperDocument, page navigation, canonical history
 * and its speech toolbar. Only workspace visibility is controlled here. */
import {createElement,type ComponentProps} from 'react';
import {PaperNotebook} from '../src/components/PaperNotebook';
import {WorkspaceTabVisibility} from '../src/lib/workspaceTabVisibility';
export function NotebookReadAloudRecipe({visible,...props}:ComponentProps<typeof PaperNotebook>&{visible:boolean}){
 return createElement(WorkspaceTabVisibility.Provider,{value:visible},createElement(PaperNotebook,props));
}
export {createElement,act,StrictMode} from 'react';
export {createRoot} from 'react-dom/client';
export {ApiClient} from '../pwa/src/api';
export {migratePaper,blankPage,notebookDocumentId,isPaperDocument} from '../src/lib/notebookDocument';
export {amendPaperCollaboration} from '../src/lib/paperCollaboration';
export {paperMarkdown} from '../src/lib/paperArchiveMetadata';
export {preparePaperReadAloudText} from '../src/lib/paperReadAloudText';
export {putDraft,getDraft,putSnapshot,listDrafts,listMutations,listSnapshots,listLocalBlobs} from '../pwa/src/storage';
export {appStorage} from '../src/lib/appStorage';
export {settleAllNotebookAccounts,resumeAllNotebookAccounts,hasPendingNotebookWrites} from '../src/lib/notebookSession';
