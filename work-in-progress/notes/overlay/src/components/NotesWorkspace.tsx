import type {NotebookSharedCollectionConfiguration} from '../lib/notebookSharedCollection';
import type {ManagedLibraryTrashAction} from '../lib/notebookManagedLibraryActions';
import type {ReactNode} from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, FilePlus2, NotebookPen, Search, ChevronDown } from 'lucide-react';
import type { Subject, SubjectNoteDocument } from '../types';
import { WorkspaceNotePage } from './WorkspaceNotePage';
import { listDrafts } from '../../pwa/src/storage';
import { LEGACY_NOTE_ID, hasLegacyDrawing } from '../lib/notebook';
import type { NotebookMediaScope,NotebookMirrorExpectation } from './NotebookEditor';
import './notebook.css';
import {NotebookLibraryView} from './NotebookLibraryView';
import {useNotebookLibrary} from '../hooks/useNotebookLibrary';
import { useWorkspaceTabVisible } from '../lib/workspaceTabVisibility';
import type {PaperHistorySelection} from '../lib/paperHistoryVersions';
import type {PaperSearchNavigation,PaperSearchOpenRequest} from '../lib/notebookSearchNavigation';
type Patch = Partial<Pick<SubjectNoteDocument, 'title'|'markdown'|'tags'|'subjectIds'>>;
interface Props { collection?:NotebookSharedCollectionConfiguration;syncControls?:ReactNode;onManagedTrash?:ManagedLibraryTrashAction; documents: readonly SubjectNoteDocument[]; activeNote?: SubjectNoteDocument; searchNavigation?:PaperSearchNavigation; subjects: readonly Subject[]; storageKey: string; media: NotebookMediaScope; onCreate: () => unknown; onDuplicate?:(id:string,current?:()=>boolean,history?:PaperHistorySelection)=>Promise<unknown>; onResumeDuplicate?:(id:string,current?:()=>boolean)=>Promise<unknown>; onExport?:(ids:readonly string[])=>Promise<unknown>; onImport?:(file:File)=>Promise<unknown>;onResumeImport?:(id:string)=>Promise<unknown>; onOpen: (id: string,search?:PaperSearchOpenRequest) => unknown; onOpenLegacy: () => unknown; onBack: () => void; onUpdateNote: (id: string, patch: Patch,expected?:NotebookMirrorExpectation) => void|boolean|Promise<void|boolean>; onOpenSubjects: (note: SubjectNoteDocument) => void; onDeleteNote: (note: SubjectNoteDocument) => void }
const normalized = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr');
export function NotesWorkspace({ collection, syncControls, onManagedTrash, documents, activeNote, searchNavigation, subjects, storageKey, media, onCreate, onDuplicate, onResumeDuplicate, onExport, onImport, onResumeImport, onOpen, onOpenLegacy, onBack, onUpdateNote, onOpenSubjects, onDeleteNote }: Props) {
  const tabVisible=useWorkspaceTabVisible();
  const library=useNotebookLibrary(media);
  const trashSource=useMemo(()=>({}),[media.accountId,media.spaceId,media.api,activeNote?.id,tabVisible]),trashSourceRef=useRef(trashSource);trashSourceRef.current=trashSource;
  const [trashNotice,setTrashNotice]=useState('');
  const changeTrash=async(id:string,intent:'trash'|'restore')=>{const current=()=>trashSourceRef.current===trashSource&&tabVisible&&library.current();if(!current())return;setTrashNotice('');try{const routed=await onManagedTrash?.([id],intent,current);if(!current())return;if(routed?.handled)setTrashNotice(routed.warning??'');else library.update({note:{id,patch:{deletedAt:intent==='restore'?null:new Date().toISOString()}}});}catch(error){if(current())setTrashNotice(error instanceof Error?error.message:String(error));}};
  const [query,setQuery]=useState('');
  const [filter,setFilter]=useState('all');
  const [legacy,setLegacy]=useState(false);
  useEffect(()=>{
    if(!tabVisible)return;
    let stopped=false;
    const refresh=()=>listDrafts(media.accountId,media.spaceId).then(drafts=>{if(!stopped)setLegacy(hasLegacyDrawing(drafts));}).catch(()=>{});
    void refresh();const timer=setInterval(refresh,5000);
    return()=>{stopped=true;clearInterval(timer);};
  },[media.accountId,media.spaceId,tabVisible]);
  const visible=useMemo(()=>documents.filter(note=>(filter==='all' || (filter==='unfiled'?!note.subjectIds.length:note.subjectIds.includes(filter))) && normalized([note.title,note.markdown,...note.tags].join(' ')).includes(normalized(query.trim()))).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)),[documents,filter,query]);
  const legacyVisible=legacy && !documents.some(note=>note.id===LEGACY_NOTE_ID) && filter==='all' && normalized('Dessins et photos existants').includes(normalized(query.trim()));
  const libraryNotes=useMemo(()=>[...documents,...(legacy && !documents.some(n=>n.id===LEGACY_NOTE_ID)?[{id:LEGACY_NOTE_ID,title:'Dessins et photos existants',markdown:'Reprendre votre ancien carnet',updatedAt:'2026-10-08T00:00:00Z'}]:[])],[documents,legacy]);
  if(!activeNote)return <NotebookLibraryView collection={collection} syncControls={syncControls} onManagedTrash={onManagedTrash} notes={libraryNotes} media={media} onCreate={onCreate} onDuplicate={onDuplicate} onResumeDuplicate={onResumeDuplicate} onExport={onExport} onImport={onImport} onResumeImport={onResumeImport} onOpen={(id,search)=>id===LEGACY_NOTE_ID&&!documents.some(n=>n.id===id)?onOpenLegacy():onOpen(id,search)}/>;
  if(library.library?.notes[activeNote.id]?.deletedAt)return <main className="notebook-empty"><h2>Cette note est dans la corbeille</h2>{trashNotice&&<p role="alert">{trashNotice}</p>}<p>Votre texte, vos pages et vos pièces jointes sont conservés.</p><button onClick={()=>{void changeTrash(activeNote.id,'restore');}}>Restaurer la note</button></main>;
  return <main className="notes-workspace has-active-note is-editor-only" aria-label="Carnet de notes"><section className="notebook-detail" aria-label="Note sélectionnée"><button type="button" className="notebook-back" onClick={onBack}><ChevronLeft aria-hidden="true"/> Toutes les notes</button>{trashNotice&&<p role="alert">{trashNotice}</p>}<WorkspaceNotePage onRestoreVersion={onDuplicate?(selection,current)=>onDuplicate(activeNote.id,current,selection):undefined} note={activeNote} searchNavigation={searchNavigation} subjects={subjects} storageKey={storageKey} media={media} onUpdateNote={onUpdateNote} onOpenSubjects={onOpenSubjects} onDeleteNote={note=>{void changeTrash(note.id,'trash');}}/></section></main>;
}
