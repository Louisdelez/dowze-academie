import {createElement} from 'react';
import {PaperNotebook} from '../src/components/PaperNotebook';
import {WorkspaceTabVisibility} from '../src/lib/workspaceTabVisibility';
// This recipe exercises an interactive visible notebook. Hidden tabs now refuse
// pointer input at the page authority boundary instead of acting as active UI.
export function InkNotebookRecipe(props:Parameters<typeof PaperNotebook>[0]){
 return createElement(WorkspaceTabVisibility.Provider,{value:true},createElement(PaperNotebook,props));
}
export {createElement,act} from 'react';
export {createRoot} from 'react-dom/client';
export {flushSync} from 'react-dom';
export {putDraft,getDraft,putSnapshot,listSnapshots} from '../pwa/src/storage';
export {migratePaper,notebookDocumentId} from '../src/lib/notebookDocument';
export {amendPaperCollaboration,verifyPaperCollaboration} from '../src/lib/paperCollaboration';
export {loadPaperToolPreferences,commitPaperToolPreferences,applyPaperToolPreferenceCommand,activePaperToolSlot} from '../src/lib/paperToolPreferences';
export {hasPendingNotebookWrites,resumeAllNotebookAccounts} from '../src/lib/notebookSession';
