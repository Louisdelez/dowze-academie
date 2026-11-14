import {createElement} from 'react';
import {NotesWorkspace} from '../src/components/NotesWorkspace';
import type {SubjectNoteDocument} from '../src/types';
import type {NotebookMediaScope} from '../src/components/NotebookEditor';

const subjects=Object.freeze([]),noop=()=>{};
/** Change only real parent-owned controls. Documents and media are the exact
 * caller references; no active note/editor and no replacement library/search. */
export function StableLibraryNotesRecipe({documents,media,parentRevision}:{documents:readonly SubjectNoteDocument[];media:NotebookMediaScope;parentRevision:number}){
 return createElement(NotesWorkspace,{documents,media,subjects,storageKey:'qa-stable-library-notes',
  syncControls:createElement('output',{'data-parent-revision':String(parentRevision)},'Parent revision '+parentRevision),
  onCreate:noop,onOpen:noop,onOpenLegacy:noop,onBack:noop,onUpdateNote:noop,onOpenSubjects:noop,onDeleteNote:noop});
}
export {NotesWorkspace};
export {LEGACY_NOTE_ID} from '../src/lib/notebook';
export * from './notebook-library-search-entry';
