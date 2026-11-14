/** Helper/storage fixture only. No App, React DOM or native window is mounted. */
export * from './notebook-duplicate-staging-recovery-entry';
export {DeviceCache} from '../src/lib/appStorage';
export {createNotebookDuplicate,resumeNotebookDuplicatePublication,desktopNotebookDuplicateMetadata,indexedDBNotebookDuplicateMetadata} from '../src/lib/notebookDuplicatePublication';
export {isPersistedSubjectNotesStore,EMPTY_SUBJECT_NOTES_STORE} from '../src/lib/subjectNotes';
export {deleteDraft,queueMutation} from '../pwa/src/storage';
export {hasPendingNotebookWrites,settleAllNotebookAccounts,resumeAllNotebookAccounts} from '../src/lib/notebookSession';
