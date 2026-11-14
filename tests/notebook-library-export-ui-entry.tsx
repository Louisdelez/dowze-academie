import {act,createElement,StrictMode} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {NotebookLibraryView} from '../src/components/NotebookLibraryView';
import {ApiClient} from '../pwa/src/api';
import * as storage from '../pwa/src/storage';
import {emptyNotebookLibrary,LIBRARY_DOCUMENT_ID} from '../src/lib/notebookLibrary';
/** Read-only committed React state observation. No writer, injected setter,
 * fake callback or product-only inspection API is installed. */
export function readPicked(root:Root):readonly string[]{
 const first=(root as unknown as {_internalRoot?:{current?:any}})?._internalRoot?.current,pending=first?[first]:[];
 while(pending.length){const fiber=pending.pop();if(fiber.sibling)pending.push(fiber.sibling);if(fiber.child)pending.push(fiber.child);if(fiber.type!==NotebookLibraryView)continue;let item=fiber.memoizedState;for(let remaining=70;item&&remaining--;item=item.next){const value=item.memoizedState;if(value?.view?.schema===1&&Array.isArray(value.view.picked))return value.view.picked;}}
 throw Error('The real committed library selection is unavailable');
}
export {act,createElement,StrictMode,createRoot,NotebookLibraryView,ApiClient,storage,emptyNotebookLibrary,LIBRARY_DOCUMENT_ID};
