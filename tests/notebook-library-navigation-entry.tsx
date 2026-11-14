import {useLayoutEffect,useState,createElement,StrictMode,act} from 'react';
import {createRoot} from 'react-dom/client';
import {NotebookLibraryView,type LibraryNote} from '../src/components/NotebookLibraryView';
import {useNotebookLibraryView} from '../src/hooks/useNotebookLibraryView';
import * as storage from '../pwa/src/storage';
import {emptyNotebookLibrary,LIBRARY_DOCUMENT_ID} from '../src/lib/notebookLibrary';
import {notebookLibrarySortPreferenceKey} from '../src/lib/notebookLibrarySort';
import {notebookLibraryViewPreferenceKey,defaultNotebookLibraryView} from '../src/lib/notebookLibraryViewState';
type Scope={accountId:string;spaceId:string;api?:unknown};
export function NavigationProbe({scope,onCommit}:{scope:Scope;onCommit:(handle:ReturnType<typeof useNotebookLibraryView>)=>void}){const handle=useNotebookLibraryView(scope);useLayoutEffect(()=>{handle.restoreScroll(true);onCommit(handle);});return <section><output data-mode={handle.view.mode} data-query={handle.view.query}/><div className="probe-main" ref={handle.mainRef}/><aside ref={handle.sidebarRef}/></section>;}
/** Note route and geometry are explicit seams. Shared library/hooks/storage
 * are real; no editor, full App, native browser or physical input claim. */
export function LibraryRoute({notes,scope,onOpen}:{notes:readonly LibraryNote[];scope:Scope;onOpen:(id:string)=>void}){const [active,setActive]=useState<string|null>(null);if(active)return <section aria-label="Note de recette simulée"><p>{active}</p><button type="button" onClick={()=>setActive(null)}>Retour à la bibliothèque de recette</button></section>;return <NotebookLibraryView notes={notes} media={{accountId:scope.accountId,spaceId:scope.spaceId}} onCreate={()=>{}} onOpen={id=>{onOpen(id);setActive(id);}}/>;}
export {act,createElement,StrictMode,createRoot,storage,emptyNotebookLibrary,LIBRARY_DOCUMENT_ID,notebookLibrarySortPreferenceKey,notebookLibraryViewPreferenceKey,defaultNotebookLibraryView};
