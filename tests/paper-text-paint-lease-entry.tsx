/** Actual production viewport/hook/host/editor. The runner declares geometry and IDB seams. */
export {EditableViewportRecipe} from './paper-editable-notebook-viewport-entry';
export {migratePaper,notebookDocumentId,blankPage} from '../src/lib/notebookDocument';
export {putDraft,listDrafts,listMutations,putSnapshot,listSnapshots,putLocalBlob,listLocalBlobs} from '../pwa/src/storage';
export {ApiClient} from '../pwa/src/api';
export {installRealPaperEditorProbe} from './paper-real-editor-probe';
export {createElement,act} from 'react';
export {createRoot} from 'react-dom/client';
