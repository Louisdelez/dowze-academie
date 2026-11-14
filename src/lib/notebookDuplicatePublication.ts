import type {NotebookMediaScope} from '../components/NotebookEditor';
import type {SubjectNoteDocument} from '../types';
import {capturePaperHistorySelection,type PaperHistorySelection} from './paperHistoryVersions';
import {isPersistedSubjectNotesStore,normalizeSubjectNotesStore,EMPTY_SUBJECT_NOTES_STORE,openSubjectNote} from './subjectNotes';
import type {DeviceCache} from './appStorage';
import {getDraft,getSnapshot,notebookDeletionKey,commitNotebookTransfer,NotebookTransferChangedError,type Draft} from '../../pwa/src/storage';
import {isPaperDocument,notebookDocumentId} from './notebookDocument';
import {LIBRARY_DOCUMENT_ID,isNotebookLibrary} from './notebookLibrary';
import {runNotebookOperation} from './notebookSession';
import {stageNotebookDuplicate,readNotebookDuplicate,notebookDuplicateReceiptKey,confirmNotebookDuplicateMetadata,activateNotebookDuplicate} from './duplicateNotebook';

export interface NotebookDuplicateMetadataAuthority {
 kind:'external'|'indexeddb';
 read:(id:string,current:()=>boolean)=>Promise<SubjectNoteDocument|undefined>;
 createIfAbsent:(note:SubjectNoteDocument,current:()=>boolean)=>Promise<void>;
}
const changed=()=>Error('Le carnet a changé. La copie et ses fichiers restent conservés pour une reprise depuis la bibliothèque.');
const validNote=(value:unknown,id:string):value is SubjectNoteDocument=>!!value&&typeof value==='object'&&(value as SubjectNoteDocument).id===id&&isPersistedSubjectNotesStore({...EMPTY_SUBJECT_NOTES_STORE,documents:[value]});

/** Capture authority before the first asynchronous metadata/source read. */
function publicationSource(media:NotebookMediaScope,viewCurrent:()=>boolean){
 const captured={accountId:media.accountId,spaceId:media.spaceId,api:media.api};
 let revoked=false,apiCurrent:(()=>boolean)|undefined;
 const current=()=>{if(revoked)return false;try{if(!viewCurrent()||apiCurrent&&!apiCurrent())revoked=true;}catch{revoked=true;}return !revoked;};
 const check=()=>{if(!current())throw changed();};
 check();apiCurrent=captured.api?.captureSessionAuthority(captured.accountId);check();
 return {media:captured,current,check};
}

/** A receipt is the stable identity of an interrupted copy. Repeating this
 * operation never creates another set of IDs or replaces an existing note. */
async function publishCaptured(noteId:string,source:ReturnType<typeof publicationSource>,metadata:NotebookDuplicateMetadataAuthority):Promise<SubjectNoteDocument>{
 source.check();const receipt=await readNotebookDuplicate(noteId,source.media,source.current);source.check();
 if(receipt.state==='applied'){
  const existing=await metadata.read(noteId,source.current);source.check();
  if(!validNote(existing,noteId))throw Error('Cette copie a déjà été finalisée. Ses informations doivent être récupérées explicitement.');
  return existing;
 }
 if(!receipt.note||!validNote(receipt.note,noteId))throw Error('Les informations de cette ancienne copie doivent être retrouvées. Ses pages et ses fichiers restent conservés.');
 await metadata.createIfAbsent(receipt.note,source.current);source.check();
 const acknowledged=await metadata.read(noteId,source.current);source.check();
 if(!validNote(acknowledged,noteId)||!receipt.metadataCommitted&&JSON.stringify(acknowledged)!==JSON.stringify(receipt.note))throw Error('Les informations de la copie ont changé avant leur confirmation. Les deux sources restent conservées.');
 await confirmNotebookDuplicateMetadata(noteId,source.media,source.current,{metadataAuthority:metadata.kind});source.check();
 await activateNotebookDuplicate(noteId,source.media,source.current,{metadataAuthority:metadata.kind});source.check();
 const note=await metadata.read(noteId,source.current);source.check();
 if(!validNote(note,noteId))throw Error('Les informations enregistrées de la copie doivent être retrouvées.');
 return note;
}
export async function createNotebookDuplicate(sourceId:string,media:NotebookMediaScope,metadata:NotebookDuplicateMetadataAuthority,viewCurrent:()=>boolean,history?:PaperHistorySelection):Promise<SubjectNoteDocument>{
 const source=publicationSource(media,viewCurrent),selected=history===undefined?undefined:capturePaperHistorySelection(history,sourceId,source.media);
 return runNotebookOperation(source.media.accountId,async()=>{
  const note=await metadata.read(sourceId,source.current);source.check();
  if(!validNote(note,sourceId))throw Error('La note à copier doit être retrouvée dans ce carnet.');
  const id=crypto.randomUUID();
  await stageNotebookDuplicate(sourceId,id,note.markdown,source.media,{current:source.current,sourceMetadata:note,history:selected});source.check();
  return publishCaptured(id,source,metadata);
 });
}
export async function resumeNotebookDuplicatePublication(noteId:string,media:NotebookMediaScope,metadata:NotebookDuplicateMetadataAuthority,viewCurrent:()=>boolean):Promise<SubjectNoteDocument>{
 const source=publicationSource(media,viewCurrent);
 return runNotebookOperation(source.media.accountId,()=>publishCaptured(noteId,source,metadata));
}

/** The desktop's complete store is compared atomically. Concurrent notes,
 * edits and tab order remain authoritative; publication itself opens no tab. */
export function desktopNotebookDuplicateMetadata(cache:Pick<DeviceCache,'readCurrentItem'|'compareAndSetItem'|'flush'>,key:string):NotebookDuplicateMetadataAuthority{
 const readStore=async(current:()=>boolean)=>{
  if(!current())throw changed();const raw=await cache.readCurrentItem(key);if(!current())throw changed();
  const value:unknown=raw===null?EMPTY_SUBJECT_NOTES_STORE:JSON.parse(raw);
  if(!isPersistedSubjectNotesStore(value))throw Error('Le carnet enregistré doit être récupéré avant de copier une note.');
  return {raw,store:normalizeSubjectNotesStore(value)};
 };
 return {kind:'external',read:async(id,current)=>(await readStore(current)).store.documents.find(note=>note.id===id),createIfAbsent:async(note,current)=>{
  if(!validNote(note,note.id))throw Error('Les informations de la copie sont incompatibles.');
  for(let attempt=0;attempt<3;attempt++){
   const {raw,store}=await readStore(current);if(store.documents.some(value=>value.id===note.id))return;
   const next={...store,documents:[structuredClone(note),...store.documents]};
   if(!current())throw changed();const saved=await cache.compareAndSetItem(key,raw,JSON.stringify(next));
   if(saved){await cache.flush();if(!current())throw changed();return;}
  }
  throw Error('Le carnet a été modifié pendant la copie. Reprenez sa finalisation depuis la bibliothèque.');
 }};
}

/** Opening the new tab is a separate fresh CAS. Never rewrite the cache's RAM
 * snapshot after another window may have committed a different note. */
export async function openDesktopNotebookDuplicate(cache:Pick<DeviceCache,'readCurrentItem'|'compareAndSetItem'|'flush'>,key:string,noteId:string,current:()=>boolean):Promise<void>{
 for(let attempt=0;attempt<3;attempt++){
  if(!current())throw changed();const raw=await cache.readCurrentItem(key);if(!current())throw changed();
  const value:unknown=raw===null?null:JSON.parse(raw);
  if(!isPersistedSubjectNotesStore(value))throw Error('Le carnet enregistré doit être récupéré avant son ouverture.');
  const store=normalizeSubjectNotesStore(value);
  if(!store.documents.some(note=>note.id===noteId))throw Error('Cette copie doit être retrouvée dans le carnet enregistré.');
  const next=JSON.stringify(openSubjectNote(store,noteId));
  if(next===raw)return;
  if(!current())throw changed();const saved=await cache.compareAndSetItem(key,raw,next);
  if(saved){await cache.flush();if(!current())throw changed();return;}
 }
 throw Error('Le carnet a changé pendant l’ouverture. La copie reste conservée dans la bibliothèque.');
}

/** The PWA inserts only an absent metadata row, with the canonical dependency.
 * A racing or already edited copy is read again, never overwritten. */
export function indexedDBNotebookDuplicateMetadata(scope:{accountId:string;spaceId:string}):NotebookDuplicateMetadataAuthority{
 const captured={accountId:scope.accountId,spaceId:scope.spaceId};
 const read=async(id:string,current:()=>boolean)=>{
  if(!current())throw changed();const row=await getDraft({...captured,type:'notesMarkdown',documentId:id});if(!current())throw changed();
  if(row&&(row.accountId!==captured.accountId||row.spaceId!==captured.spaceId||row.type!=='notesMarkdown'||row.documentId!==id||row.staged||row.identityAlias||row.syncState==='conflict'||!validNote(row.content,id)||row.title!==row.content.title))throw Error('Les informations de cette note doivent être départagées.');
  return row;
 };
 return {kind:'indexeddb',read:async(id,current)=>(await read(id,current))?.content as SubjectNoteDocument|undefined,createIfAbsent:async(note,current)=>{
  for(let attempt=0;attempt<3;attempt++){
   const existing=await read(note.id,current);
   if(existing){if(existing.paperDependency!==notebookDocumentId(note.id))throw Error('Le reçu de cette copie ne correspond pas à ses informations.');return;}
   const receipt=await readNotebookDuplicate(note.id,captured,current);if(!current())throw changed();
   if(receipt.state!=='staged'||receipt.metadataCommitted)throw Error('Les informations déjà confirmées de cette copie doivent être récupérées explicitement.');
   const identity={...captured,type:'whiteboard' as const,documentId:notebookDocumentId(note.id)},receiptKey=notebookDuplicateReceiptKey(note.id,captured),deletionKey=notebookDeletionKey(identity);
   const receiptRow=await getSnapshot(receiptKey);if(!current())throw changed();
   const canonical=await getDraft(identity);if(!current())throw changed();
   const deletion=await getSnapshot(deletionKey);if(!current())throw changed();
   const libraryIdentity={...captured,type:'preferences' as const,documentId:LIBRARY_DOCUMENT_ID},library=await getDraft(libraryIdentity);if(!current())throw changed();
   const owned=(row:{accountId:string;spaceId:string})=>row.accountId===captured.accountId&&row.spaceId===captured.spaceId;
   if(!receiptRow||receiptRow.key!==receiptKey||!owned(receiptRow)||JSON.stringify(receiptRow.value)!==JSON.stringify(receipt)||deletion||!canonical||!owned(canonical)||canonical.type!==identity.type||canonical.documentId!==identity.documentId||!canonical.staged||canonical.identityAlias||canonical.syncState==='conflict'||!isPaperDocument(canonical.content)||canonical.content.noteId!==note.id||canonical.content.collaboration?.lineage!==receipt.copyLineage||library&&(!owned(library)||library.type!==libraryIdentity.type||library.documentId!==libraryIdentity.documentId||!isNotebookLibrary(library.content)||library.identityAlias||library.staged||library.syncState==='conflict'||library.content.notes[note.id]?.deletedAt))throw Error('La copie ou son classement a changé avant l’enregistrement de ses informations.');
   const draft:Draft={...captured,type:'notesMarkdown',documentId:note.id,title:note.title,content:structuredClone(note),baseVersion:0,updatedAt:Date.now(),syncState:'local',paperDependency:notebookDocumentId(note.id)};
   try{await commitNotebookTransfer({target:captured,sources:[],drafts:[draft],blobs:[],snapshots:[],draftChecks:[{identity:draft,expected:undefined},{identity,expected:canonical},{identity:libraryIdentity,expected:library}],blobChecks:[],snapshotChecks:[{key:receiptKey,expected:receiptRow},{key:deletionKey,expected:undefined}]},current);return;}
   catch(error){if(!(error instanceof NotebookTransferChangedError)||!current()||attempt===2)throw error;}
  }
 }};
}
