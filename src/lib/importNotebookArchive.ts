import {getDraft,listDrafts,listLocalBlobs,listSnapshots,commitNotebookTransfer,savePaperDraft,localBlobDigest,type Draft,type Snapshot,type LocalBlob} from '../../pwa/src/storage';
import {verifyPaperArchiveBlob,appendPaperArchive,MAX_PAPER_ARCHIVE_BYTES} from './paperArchive';
import {paperMarkdown,isPaperArchiveMetadata,type PaperArchiveMetadata} from './paperArchiveMetadata';
import {migratePaper,applyPaperCommand,notebookDocumentId,isPaperDocument} from './notebookDocument';
import {amendPaperCollaboration} from './paperCollaboration';
import {emptyNotebookLibrary,isNotebookLibrary,updateNotebookLibrary,LIBRARY_DOCUMENT_ID} from './notebookLibrary';
import {amendNotebookLibrary} from './notebookLibraryCollaboration';
import {isPersistedSubjectNotesStore} from './subjectNotes';
import type {SubjectNoteDocument} from '../types';
import type {NotebookMediaScope} from '../components/NotebookEditor';
export interface ArchiveImportReceipt {metadataCommitted?:boolean;schema:1;kind:'notebook-archive-import';noteId:string;importedAt:string;note:SubjectNoteDocument;sourceMetadata?:PaperArchiveMetadata;sourceDocument:unknown;sourceName:string}
const receiptKey=(media:NotebookMediaScope,noteId:string)=>`paper-import|${media.accountId}|${media.spaceId}|${noteId}`;
function validReceipt(value:unknown,noteId:string):value is ArchiveImportReceipt{const r=value as ArchiveImportReceipt;return !!r&&r.schema===1&&r.kind==='notebook-archive-import'&&r.noteId===noteId&&r.note?.id===noteId&&isPaperDocument(r.sourceDocument)&&(!r.sourceMetadata||isPaperArchiveMetadata(r.sourceMetadata)&&r.sourceMetadata.note.id===r.sourceDocument.noteId)&&isPersistedSubjectNotesStore({schemaVersion:2,documents:[r.note],openDocumentIds:[],activeDocumentId:null});}
export async function readNotebookArchiveImport(noteId:string,media:NotebookMediaScope):Promise<ArchiveImportReceipt>{
 const receipt=(await listSnapshots(media.accountId,media.spaceId)).find(row=>row.key===receiptKey(media,noteId));if(!validReceipt(receipt?.value,noteId))throw Error('Les informations de cette importation doivent être récupérées. Ses fichiers restent conservés.');return receipt!.value as ArchiveImportReceipt;
}
/** Bytes, mapped document and its receipt are staged in the same transaction. */
export async function stageNotebookArchive(file:Blob&{name?:string},noteId:string,media:NotebookMediaScope,current:()=>boolean=()=>true):Promise<SubjectNoteDocument>{
 const check=()=>{if(!current())throw Error('Le carnet a changé pendant l’importation.');};check();if(file.size>MAX_PAPER_ARCHIVE_BYTES)throw Error('L’archive dépasse la taille actuellement prise en charge. Son original reste disponible.');
 const archive=await verifyPaperArchiveBlob(file,current);check();const mapped=appendPaperArchive(archive.document,noteId),blank=migratePaper(noteId,'',null);let document=applyPaperCommand(blank,{type:'batch',commands:[...mapped.commands,...(archive.document.study?[{type:'study-language' as const,language:archive.document.study.language}]:[]),{type:'remove-page',id:blank.pages[0].id}]});document=amendPaperCollaboration(document,document);
 const now=new Date().toISOString(),sourceName=file.name??'note.dowze',note:SubjectNoteDocument={...(archive.metadata?.note??{title:sourceName.replace(/\.(dowze|zip)$/i,'').trim().slice(0,500)||'Note importée',subjectIds:[],tags:[],createdAt:now,updatedAt:now}),id:noteId,markdown:paperMarkdown(document)};
 if(!isPersistedSubjectNotesStore({schemaVersion:2,documents:[note],openDocumentIds:[],activeDocumentId:null}))throw Error('La note importée utilise des informations incompatibles.');
 const draft:Draft={accountId:media.accountId,spaceId:media.spaceId,type:'whiteboard',documentId:notebookDocumentId(noteId),title:note.title,content:document,baseVersion:0,updatedAt:Date.now(),syncState:'local',staged:true,archiveImport:true};
 const metadataIdentity={accountId:draft.accountId,spaceId:draft.spaceId,type:'notesMarkdown' as const,documentId:noteId};
 const existing=await getDraft(draft),existingMetadata=await getDraft(metadataIdentity);if(existing||existingMetadata)throw Error('Une note utilise déjà cet identifiant. L’original est conservé.');
 const existingFiles=await listLocalBlobs(media.accountId,media.spaceId),blobs:LocalBlob[]=[];
 for(const asset of archive.document.assets){check();const id=mapped.assets.get(asset.id)!;if(existingFiles.some(f=>f.id===id))throw Error('Une pièce jointe utilise déjà cet identifiant.');const blob=archive.files[`assets/${asset.id}`].slice(0,undefined,asset.mediaType);blobs.push({accountId:media.accountId,spaceId:media.spaceId,id,documentId:draft.documentId,name:asset.name,blob,createdAt:Date.now(),status:'pending',revision:1,sha256:await localBlobDigest(blob),removedFromNote:true});}
 const receipt:Snapshot={key:receiptKey(media,noteId),accountId:media.accountId,spaceId:media.spaceId,value:{schema:1,kind:'notebook-archive-import',noteId,importedAt:now,note,sourceMetadata:archive.metadata,sourceDocument:archive.document,sourceName} satisfies ArchiveImportReceipt};
 const existingReceipt=(await listSnapshots(media.accountId,media.spaceId)).find(s=>s.key===receipt.key);if(existingReceipt)throw Error('Cette importation possède déjà un reçu ; reprenez sa finalisation.');
 await commitNotebookTransfer({target:media,sources:[],drafts:[draft],blobs,snapshots:[receipt],draftChecks:[{identity:draft,expected:undefined},{identity:metadataIdentity,expected:undefined}],blobChecks:blobs.map(row=>({identity:row,expected:undefined})),snapshotChecks:[{key:receipt.key,expected:undefined}]},current);return note;
}
/** Called only after the platform-specific title/tags store has acknowledged its commit. */
export async function confirmNotebookArchiveMetadata(noteId:string,media:NotebookMediaScope,current:()=>boolean=()=>true){
 const rows=await listSnapshots(media.accountId,media.spaceId),previous=rows.find(row=>row.key===receiptKey(media,noteId));if(!validReceipt(previous?.value,noteId))throw Error('Le reçu de cette importation est indisponible.');const next={...previous!,value:{...previous!.value as ArchiveImportReceipt,metadataCommitted:true}};
 await commitNotebookTransfer({target:media,sources:[],drafts:[],blobs:[],snapshots:[next],draftChecks:[],blobChecks:[],snapshotChecks:[{key:next.key,expected:previous}]},current);
}

/** Reuse matching folder ancestors, add missing ones, and never alter an unrelated note. */
export async function activateNotebookArchive(noteId:string,media:NotebookMediaScope,current:()=>boolean=()=>true):Promise<SubjectNoteDocument>{
 const check=()=>{if(!current())throw Error('Le carnet a changé avant la finalisation de l’importation.');};check();const receipt=await readNotebookArchiveImport(noteId,media),identity={accountId:media.accountId,spaceId:media.spaceId,type:'whiteboard' as const,documentId:notebookDocumentId(noteId)},staged=await getDraft(identity);check();
 if(!staged||!isPaperDocument(staged.content)||staged.content.noteId!==noteId)throw Error('Le document de cette importation doit être récupéré.');if(!staged.staged)return receipt.note;if(!receipt.metadataCommitted)throw Error('Cette importation attend l’enregistrement de ses informations. Reprenez-la depuis la bibliothèque.');
 const key={...identity,type:'preferences' as const,documentId:LIBRARY_DOCUMENT_ID};let classified=false;
 for(let attempt=0;attempt<3;attempt++){
  check();const stored=await getDraft(key),original=stored?.content??emptyNotebookLibrary();if(!isNotebookLibrary(original))throw Error('Le classement existant doit être récupéré. Les fichiers importés restent conservés.');let next=original,parentId:string|null=null;
  for(const folder of receipt.sourceMetadata?.folderPath??[]){const found=next.folders.find(f=>f.parentId===parentId&&f.title===folder.title&&f.color===folder.color);if(found){parentId=found.id;continue;}const id=crypto.randomUUID();next=updateNotebookLibrary(next,{folder:{id,parentId,title:folder.title,color:folder.color,order:next.folders.filter(f=>f.parentId===parentId).length}});parentId=id;}
  const classification=receipt.sourceMetadata?.classification;next=amendNotebookLibrary(original,updateNotebookLibrary(next,{note:{id:noteId,patch:{folderId:parentId,favorite:classification?.favorite??false,cover:classification?.cover??null,deletedAt:null}}}),`${media.accountId}|${media.spaceId}`);
  check();try{await savePaperDraft({...key,title:'Bibliothèque de notes',content:next,baseVersion:stored?.baseVersion??0,updatedAt:Date.now(),syncState:'local'},stored?original.revision:null);classified=true;break;}catch(e){if(attempt===2)throw e;}
 }
 if(!classified)throw Error('Le classement de l’importation attend sa finalisation.');check();await activateNotebookArchiveFiles(identity,current);dispatchEvent(new CustomEvent('dowze:paper-import-ready',{detail:{accountId:media.accountId,spaceId:media.spaceId,noteId}}));dispatchEvent(new CustomEvent('dowze:notebook-library-changed',{detail:{accountId:media.accountId,spaceId:media.spaceId}}));return receipt.note;
}
// Activation belongs to a storage transaction: imported media cannot publish before metadata is durable.
import {activateNotebookArchiveFiles} from '../../pwa/src/storage';
export async function pendingNotebookArchives(media:NotebookMediaScope){return (await listDrafts(media.accountId,media.spaceId)).filter(d=>d.type==='whiteboard'&&d.staged&&d.archiveImport&&isPaperDocument(d.content)).map(d=>(d.content as import('./notebookDocument').PaperDocument).noteId);}
