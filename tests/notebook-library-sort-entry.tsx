import {useLayoutEffect,useState,createElement,StrictMode,act} from 'react';
import {createRoot} from 'react-dom/client';
import {NotebookLibraryView,type LibraryNote} from '../src/components/NotebookLibraryView';
import {useNotebookLibrarySort} from '../src/hooks/useNotebookLibrarySort';
import * as storage from '../pwa/src/storage';
import {emptyNotebookLibrary,LIBRARY_DOCUMENT_ID} from '../src/lib/notebookLibrary';
import {notebookLibrarySortPreferenceKey} from '../src/lib/notebookLibrarySort';

type Scope={accountId:string;spaceId:string;api?:unknown};
type Handle=ReturnType<typeof useNotebookLibrarySort>;
export function SortProbe({scope,onCommit}:{scope:Scope;onCommit:(handle:Handle)=>void}){
 const handle=useNotebookLibrarySort(scope);
 useLayoutEffect(()=>{onCommit(handle);});
 return <output data-sort={handle.sort} data-notice={handle.notice}>{handle.sort}</output>;
}
/** Only the library is real here. The note-content route is an explicit seam,
 * reproducing the unmount/remount used by both existing production callers.
 * This is not a full Desktop/PWA application or editor navigation proof.
 */
export function LibraryRoute({notes,scope,onOpen}:{notes:readonly LibraryNote[];scope:Scope;onOpen:(id:string)=>void}){
 const [active,setActive]=useState<string|null>(null);
 if(active)return <section aria-label="Note de recette simulée"><p>{active}</p><button type="button" onClick={()=>setActive(null)}>Retour à la bibliothèque de recette</button></section>;
 return <NotebookLibraryView notes={notes} media={{accountId:scope.accountId,spaceId:scope.spaceId}} onCreate={()=>{}} onOpen={id=>{onOpen(id);setActive(id);}}/>;
}
export {act,createElement,StrictMode,createRoot,storage,emptyNotebookLibrary,LIBRARY_DOCUMENT_ID,notebookLibrarySortPreferenceKey};
