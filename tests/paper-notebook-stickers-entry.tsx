/** Actual PaperNotebook owns usePaperDocument, selection, sticker onUse,
 * paper.applyPrepared and undo. Only workspace visibility/parent metadata are
 * declared fixture inputs; no sticker publication callback is replaced. */
import {createElement,type ComponentProps} from 'react';
import {PaperNotebook} from '../src/components/PaperNotebook';
import {WorkspaceTabVisibility} from '../src/lib/workspaceTabVisibility';
export function NotebookStickersRecipe(props:ComponentProps<typeof PaperNotebook>){
 return createElement(WorkspaceTabVisibility.Provider,{value:true},createElement(PaperNotebook,props));
}
export {createElement,act,StrictMode} from 'react';
export {createRoot} from 'react-dom/client';
export {ApiClient} from '../pwa/src/api';
export {migratePaper,blankPage,notebookDocumentId,isPaperDocument} from '../src/lib/notebookDocument';
export {amendPaperCollaboration,verifyPaperCollaboration} from '../src/lib/paperCollaboration';
export {paperMarkdown} from '../src/lib/paperArchiveMetadata';
export {loadPaperStickers,paperStickerKey,paperStickerLibraryKey} from '../src/lib/paperStickers';
export {putDraft,getDraft,putSnapshot,getSnapshot,putLocalBlob,listDrafts,listMutations,listSnapshots,listLocalBlobs} from '../pwa/src/storage';
export {appStorage} from '../src/lib/appStorage';
export {settleAllNotebookAccounts,resumeAllNotebookAccounts,hasPendingNotebookWrites} from '../src/lib/notebookSession';
