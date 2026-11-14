/** Actual writer component/session/storage with an explicitly SYNTHETIC Crepe/PM seam. */
export {default as MarkdownNoteEditor} from '../src/components/MarkdownNoteEditor';
export type {MarkdownNoteEditorProps,MarkdownNoteEditorHandle,MarkdownNoteEditorSource,MarkdownNoteEditorActivity} from '../src/components/MarkdownNoteEditor';
export {act,createElement,StrictMode,createRef} from 'react';
export {createRoot} from 'react-dom/client';
export {settleNotebookAccount,resumeNotebookAccount,hasPendingNotebookWrites,settleAllNotebookAccounts,resumeAllNotebookAccounts} from '../src/lib/notebookSession';
export {putSnapshot,getSnapshot,listSnapshots} from '../pwa/src/storage';
export {Crepe,instances,configure,configureNext,reset,listInstances} from './markdown-note-writer-crepe-seam';
export {syntheticCrepeInstances,configureSyntheticCrepe,resetSyntheticCrepe} from './markdown-note-writer-crepe-seam';
export {instances as crepeInstances,configure as configureCrepeSeam,configureNext as configureNextCrepeSeam,reset as resetCrepeSeam,listInstances as listCrepeInstances} from './markdown-note-writer-crepe-seam';
export const markdownWriterRecipeProof=Object.freeze({actualMarkdownNoteEditor:true,actualNotebookSession:true,actualStorageModule:true,
 syntheticCrepe:true,syntheticProseMirror:true,syntheticDOMObserver:true,realPMTransactions:false,realIMEDevice:false,realPencil:false});
