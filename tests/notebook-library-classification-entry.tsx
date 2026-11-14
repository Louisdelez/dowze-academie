import {act,createElement,StrictMode} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {NotebookLibraryView} from '../src/components/NotebookLibraryView';
import {emptyNotebookLibrary,isNotebookLibrary,LIBRARY_DOCUMENT_ID} from '../src/lib/notebookLibrary';
import {amendNotebookLibrary} from '../src/lib/notebookLibraryCollaboration';
import {migratePaper,isPaperDocument,notebookDocumentId} from '../src/lib/notebookDocument';
import {amendPaperCollaboration} from '../src/lib/paperCollaboration';
import {settleAllNotebookAccounts,resumeAllNotebookAccounts,hasPendingNotebookWrites} from '../src/lib/notebookSession';
import * as storage from '../pwa/src/storage';
/** Observe the actual committed external-store state. No hook setter or product
 * callback is replaced; every classification edit is made through the UI. */
export function readLibrary(root:Root){
 const first=(root as unknown as {_internalRoot?:{current?:any}})?._internalRoot?.current,pending=first?[first]:[];
 while(pending.length){const fiber=pending.pop();if(fiber.sibling)pending.push(fiber.sibling);if(fiber.child)pending.push(fiber.child);if(fiber.type!==NotebookLibraryView)continue;for(let item=fiber.memoizedState,remaining=70;item&&remaining--;item=item.next){const value=item.memoizedState;if(value&&typeof value==='object'&&'library'in value&&typeof value.saving==='boolean'&&typeof value.conflict==='boolean')return {props:fiber.memoizedProps,state:value};}}
 return null;
}
export {act,createElement,StrictMode,createRoot,NotebookLibraryView,emptyNotebookLibrary,isNotebookLibrary,LIBRARY_DOCUMENT_ID,amendNotebookLibrary,migratePaper,isPaperDocument,notebookDocumentId,amendPaperCollaboration,settleAllNotebookAccounts,resumeAllNotebookAccounts,hasPendingNotebookWrites,storage};
