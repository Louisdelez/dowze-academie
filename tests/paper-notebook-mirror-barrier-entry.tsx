/** Actual Notebook + native persistent hook/cache. The parent below models the
 * current Desktop conditional metadata setter; no App/network/native-OS claim. */
import {useEffect,useRef} from 'react';
import {PaperNotebook} from '../src/components/PaperNotebook';
import {usePersistentState} from '../src/hooks/usePersistentState';
import {EMPTY_SUBJECT_NOTES_STORE,isPersistedSubjectNotesStore,normalizeSubjectNotesStore,updateSubjectNote,type PersistedSubjectNotesStore} from '../src/lib/subjectNotes';
import type {NotebookMediaScope,NotebookMirrorExpectation} from '../src/components/NotebookEditor';
export interface MirrorParentProps {
 media:NotebookMediaScope;noteId:string;cacheKey:string;readOnly?:boolean;
 observe:(value:{markdown:string;source:object})=>void;
 accepted:(work:Promise<boolean>)=>Promise<boolean>;
 committed:(source:object,markdown:string)=>Promise<void>;
}
export function NativeMirrorParent({media,noteId,cacheKey,readOnly=false,observe,accepted,committed}:MirrorParentProps){
 const [raw,setStore]=usePersistentState<PersistedSubjectNotesStore>(cacheKey,EMPTY_SUBJECT_NOTES_STORE,isPersistedSubjectNotesStore,{readCurrentCacheForUpdates:true});
 const sourceRef=useRef({cacheKey,noteId,accountId:media.accountId,spaceId:media.spaceId,api:media.api,retired:false});
 if(sourceRef.current.cacheKey!==cacheKey||sourceRef.current.noteId!==noteId||sourceRef.current.accountId!==media.accountId||sourceRef.current.spaceId!==media.spaceId||sourceRef.current.api!==media.api){sourceRef.current.retired=true;sourceRef.current={cacheKey,noteId,accountId:media.accountId,spaceId:media.spaceId,api:media.api,retired:false};}
 const source=sourceRef.current,mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const current=()=>mounted.current&&!source.retired&&sourceRef.current===source;
 const note=normalizeSubjectNotesStore(raw).documents.find(value=>value.id===noteId);
 if(!note)throw Error('The declared native parent note is missing');
 observe({markdown:note.markdown,source});
 const write=async(markdown:string,expected?:NotebookMirrorExpectation)=>{
  if(!current())return false;let admitted=true;
  const stored=setStore(value=>{const normalized=normalizeSubjectNotesStore(value),note=normalized.documents.find(item=>item.id===noteId);if(!note||expected&&note.markdown!==expected.expectedMarkdown){admitted=false;return value;}return updateSubjectNote(normalized,noteId,{markdown});});
  if(!stored||!admitted)return false;
  await appStorage.flush();
  // Only the return of a real native durable setter is held. No result, source
  // value, bridge transaction, or expected Markdown is substituted.
  await committed(source,markdown);return current();
 };
 return <PaperNotebook readOnly={readOnly} noteId={noteId} markdown={note.markdown} metadata={note} media={media} onChange={(markdown,expected)=>accepted(write(markdown,expected))}/>;
}
import {appStorage} from '../src/lib/appStorage';
export {appStorage};
export {createElement,act} from 'react';
export {createRoot} from 'react-dom/client';
export {flushSync} from 'react-dom';
export {migratePaper,notebookDocumentId,type PaperDocument} from '../src/lib/notebookDocument';
export {amendPaperCollaboration} from '../src/lib/paperCollaboration';
export {paperMarkdown} from '../src/lib/paperArchiveMetadata';
export {getDraft,getSnapshot,putDraft,putLocalBlob,listDrafts,listMutations,listLocalBlobs,listSnapshots} from '../pwa/src/storage';
export {settleNotebookAccount,resumeAllNotebookAccounts,hasPendingNotebookWrites} from '../src/lib/notebookSession';
export {ApiClient} from '../pwa/src/api';
export {paperLegacyReceiptKey} from '../src/lib/paperLegacyBridge';
