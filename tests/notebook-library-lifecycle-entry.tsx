import {createElement,useLayoutEffect} from 'react';
import {NotebookLibraryView} from '../src/components/NotebookLibraryView';
import {useNotebookLibrary} from '../src/hooks/useNotebookLibrary';
import type {NotebookMediaScope} from '../src/components/NotebookEditor';
import type {NotebookLibraryLifecycleOptions} from '../src/lib/notebookLibraryLifecycle';
/** A second real observer of the same existing external-store session. The UI
 * action itself remains the production LibraryView callback, never replaced. */
export function ObservedLifecycleLibrary(props:{notes:Parameters<typeof NotebookLibraryView>[0]['notes'];media:NotebookMediaScope;lifecycle?:NotebookLibraryLifecycleOptions;report:(value:ReturnType<typeof useNotebookLibrary>)=>void}){
 const observed=useNotebookLibrary(props.media,props.lifecycle);useLayoutEffect(()=>{props.report(observed);});
 return createElement(NotebookLibraryView,{notes:props.notes,media:props.media,lifecycle:props.lifecycle,onOpen:()=>{},onCreate:()=>{}});
}
export * from './notebook-library-classification-entry';
export {ApiClient} from '../pwa/src/api';
export {createNotebookLibraryLifecycle} from '../src/lib/notebookLibraryLifecycle';
export {notebookTrashHeadKey,notebookTrashSourceKey,notebookTrashOperationKey,NOTEBOOK_TRASH_RETENTION_MS} from '../src/lib/notebookTrash';
