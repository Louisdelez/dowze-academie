import {act,createElement,useLayoutEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {usePersistentState} from '../src/hooks/usePersistentState';
import {appStorage,DeviceCache} from '../src/lib/appStorage';
import {openDesktopNotebookDuplicate} from '../src/lib/notebookDuplicatePublication';
import {EMPTY_SUBJECT_NOTES_STORE,isPersistedSubjectNotesStore,type PersistedSubjectNotesStore} from '../src/lib/subjectNotes';

/** Mount the actual hook. Report only its committed public value/functions;
 * neither a hook setter nor any returned production Promise is replaced. */
function PersistentNotebookProbe({storageKey,onCommit}:{storageKey:string;onCommit:(value:unknown)=>void}){
 const [value,setValue,refresh]=usePersistentState<PersistedSubjectNotesStore>(storageKey,EMPTY_SUBJECT_NOTES_STORE,isPersistedSubjectNotesStore,{readCurrentCacheForUpdates:true});
 useLayoutEffect(()=>{onCommit({key:storageKey,value,setValue,refresh});},[storageKey,value,setValue,refresh,onCommit]);
 return createElement('output',{'data-persistent-notebook-key':storageKey,'data-active-note':value.schemaVersion===2?value.activeDocumentId??'':''},value.documents.length);
}
export {act,createElement,createRoot,PersistentNotebookProbe,appStorage,DeviceCache,openDesktopNotebookDuplicate,EMPTY_SUBJECT_NOTES_STORE,isPersistedSubjectNotesStore};
