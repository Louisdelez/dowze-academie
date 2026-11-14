import {ensureNotebookIdentity,readOwnedLegacyNotebookBoard} from './paperIdentity';
import {emptyNotebookLibrary,isNotebookLibrary,updateNotebookLibrary,LIBRARY_DOCUMENT_ID} from './notebookLibrary';
import {amendNotebookLibrary} from './notebookLibraryCollaboration';
import {getDraft,listDrafts,listLocalBlobs,listSnapshotsByPrefix,localBlobDigest,commitNotebookTransfer,NotebookTransferChangedError,getSnapshot,notebookDeletionKey,readNotebookDeletionStatus,type Draft,type Snapshot,type LocalBlob,type NotebookTransferCommit} from '../../pwa/src/storage';
import {synchronizeSpace} from '../../pwa/src/sync';
import {isPaperDocument,migratePaper,notebookDocumentId,applyPaperCommand,type PaperDocument,type PaperCommand} from './notebookDocument';
import {legacyNotebookDocumentId} from './notebookIdentity';
import {noteBoardId,photoReference} from './notebook';
import {appendPaperArchive,MAX_PAPER_ARCHIVE_BYTES} from './paperArchive';
import {paperMarkdown} from './paperArchiveMetadata';
import {readPaperAsset,resolvePaperPhotoReference} from './paperAssets';
import {scanLegacyPaperImages,planLegacyPaperImageRewrite} from './paperLegacyImages';
import {amendPaperCollaboration,hasPaperCollaboration,verifyPaperCollaboration} from './paperCollaboration';
import {isPersistedSubjectNotesStore} from './subjectNotes';
import type {SubjectNoteDocument} from '../types';
import type {NotebookMediaScope} from '../components/NotebookEditor';
import {capturePaperHistorySelection,type PaperHistorySelection} from './paperHistoryVersions';

export const NOTEBOOK_DUPLICATE_LIMITS=Object.freeze({assets:10000,bytes:MAX_PAPER_ARCHIVE_BYTES});
export interface NotebookDuplicateStageOptions {current?:()=>boolean;sourceMetadata?:SubjectNoteDocument;history?:PaperHistorySelection}
export interface NotebookDuplicateStageReceipt {
 schema:1;kind:'notebook-duplicate-stage';noteId:string;sourceNoteId:string;documentId:string;createdAt:string;
 state:'staged'|'applied';metadataCommitted:boolean;copyLineage:string;sourceDocument:PaperDocument;
 sourceMetadata?:SubjectNoteDocument;note?:SubjectNoteDocument;mapping:{assets:[string,string][]};commands:PaperCommand[];
 files:{id:string;sourceId:string;size:number;mediaType:string;sha256:string}[];
}
type DuplicateScope={accountId:string;spaceId:string};
const duplicatePrefix=(scope:DuplicateScope)=>`paper-duplicate-stage|${scope.accountId}|${scope.spaceId}|whiteboard|`;
export const notebookDuplicateReceiptKey=(noteId:string,scope:DuplicateScope)=>duplicatePrefix(scope)+notebookDocumentId(noteId);
const migrationKey=(noteId:string,scope:DuplicateScope)=>`paper-migration|${scope.accountId}|${scope.spaceId}|whiteboard|${notebookDocumentId(noteId)}`;
const validNoteId=(id:unknown):id is string=>typeof id==='string'&&id.length>0&&id.length<=200;
const validMetadata=(value:unknown,noteId:string):value is SubjectNoteDocument=>!!value&&typeof value==='object'&&(value as SubjectNoteDocument).id===noteId&&isPersistedSubjectNotesStore({schemaVersion:2,documents:[value],openDocumentIds:[],activeDocumentId:null});
const ownedDraft=(row:Draft|undefined,scope:DuplicateScope,type:Draft['type'],documentId:string)=>!row||row.accountId===scope.accountId&&row.spaceId===scope.spaceId&&row.type===type&&row.documentId===documentId;
function captureDuplicateAuthority(media:NotebookMediaScope,current:()=>boolean=()=>true){
 const scope={accountId:media.accountId,spaceId:media.spaceId},api=media.api;let retired=false,session:(()=>boolean)|undefined;
 const active=()=>{if(retired)return false;try{if(current()!==true||session&&!session())retired=true;}catch{retired=true;}return !retired;};
 const check=()=>{if(!active())throw Error('Le compte ou le carnet a changé. La copie et ses originaux restent conservés.');};
 check();if(!scope.accountId||!scope.spaceId)throw Error('Ouvrez un compte et une année avant de copier cette note.');
 // Binding must itself follow admission: an already retired callback has no side effects.
 session=api?.captureSessionAuthority(scope.accountId);check();return {scope,media:{...scope,api},active,check};
}
function validateDuplicateReceipt(row:Snapshot|undefined,noteId:string,scope:DuplicateScope):NotebookDuplicateStageReceipt {
 const r=row?.value as NotebookDuplicateStageReceipt|undefined;
 if(!row||row.key!==notebookDuplicateReceiptKey(noteId,scope)||row.accountId!==scope.accountId||row.spaceId!==scope.spaceId||!r||r.schema!==1||r.kind!=='notebook-duplicate-stage'||r.noteId!==noteId||!validNoteId(r.sourceNoteId)||r.sourceNoteId===noteId||r.documentId!==notebookDocumentId(noteId)||!Number.isFinite(Date.parse(r.createdAt))||!['staged','applied'].includes(r.state)||typeof r.metadataCommitted!=='boolean'||typeof r.copyLineage!=='string'||!r.copyLineage||!isPaperDocument(r.sourceDocument)||r.sourceDocument.noteId!==r.sourceNoteId||r.sourceMetadata!==undefined&&!validMetadata(r.sourceMetadata,r.sourceNoteId)||r.note!==undefined&&!validMetadata(r.note,noteId)||!Array.isArray(r.commands)||!r.mapping||!Array.isArray(r.mapping.assets)||!Array.isArray(r.files)||r.files.length>NOTEBOOK_DUPLICATE_LIMITS.assets)throw Error('Le reçu de cette copie doit être récupéré. Aucun fichier ni original n’est supprimé.');
 const ids=new Set<string>(),sourceIds=new Set<string>();let bytes=0;
 for(const file of r.files){if(!file||!validNoteId(file.id)||!validNoteId(file.sourceId)||ids.has(file.id)||sourceIds.has(file.sourceId)||!Number.isSafeInteger(file.size)||file.size<0||typeof file.mediaType!=='string'||!/^[a-f0-9]{64}$/.test(file.sha256)||!r.sourceDocument.assets.some(a=>a.id===file.sourceId&&a.mediaType===file.mediaType&&(a.size===0||a.size===file.size))||!r.mapping.assets.some(pair=>Array.isArray(pair)&&pair.length===2&&pair[0]===file.sourceId&&pair[1]===file.id))throw Error('Les fichiers de cette copie doivent être départagés. Leurs octets restent conservés.');ids.add(file.id);sourceIds.add(file.sourceId);bytes+=file.size;}
 if(bytes>NOTEBOOK_DUPLICATE_LIMITS.bytes||r.files.length!==r.sourceDocument.assets.length||r.mapping.assets.length!==r.files.length)throw Error('Le reçu de cette copie ne décrit pas tous ses originaux.');
 if(hasPaperCollaboration(r.sourceDocument))verifyPaperCollaboration(r.sourceDocument);
 return r;
}
/** Legacy image manifests used size zero for unknown; the receipt always keeps
 * the actual durable byte count and SHA, without rewriting that source graph. */
async function duplicateFiles(receipt:NotebookDuplicateStageReceipt,document:PaperDocument,scope:DuplicateScope,check:()=>void):Promise<LocalBlob[]>{
 const all=await listLocalBlobs(scope.accountId,scope.spaceId);check();const files:LocalBlob[]=[];
 for(const expected of receipt.files){
  const file=all.find(row=>row.id===expected.id),asset=document.assets.find(row=>row.id===expected.id);
  if(!asset||!file||file.accountId!==scope.accountId||file.spaceId!==scope.spaceId||file.documentId!==receipt.documentId||file.blob.size!==expected.size||file.blob.type!==expected.mediaType||asset.size>0&&asset.size!==expected.size||asset.mediaType!==expected.mediaType||file.sha256!==expected.sha256)throw Error('Une pièce jointe de la copie attend sa récupération. Aucun fichier n’est réassocié automatiquement.');
  const sha=await localBlobDigest(file.blob);check();if(sha!==expected.sha256)throw Error('Les octets de la copie ont changé. Les deux sources restent conservées.');files.push(file);
 }
 return files;
}
async function readDuplicateState(noteId:string,authority:ReturnType<typeof captureDuplicateAuthority>){
 const {scope,check}=authority;if(!validNoteId(noteId))throw Error('L’identité de la copie est incompatible.');check();
 const row=await getSnapshot(notebookDuplicateReceiptKey(noteId,scope));check();const receipt=validateDuplicateReceipt(row,noteId,scope),identity={...scope,type:'whiteboard' as const,documentId:notebookDocumentId(noteId)},draft=await getDraft(identity);check();
 if(!draft||!ownedDraft(draft,scope,'whiteboard',identity.documentId)||!isPaperDocument(draft.content)||draft.content.noteId!==noteId||draft.identityAlias||draft.syncState==='conflict'||draft.archiveImport||!hasPaperCollaboration(draft.content)||draft.content.collaboration.lineage!==receipt.copyLineage)throw Error('La copie doit être retrouvée et ses versions départagées avant sa reprise.');
 verifyPaperCollaboration(draft.content);const deletionKey=notebookDeletionKey(identity),deletion=await getSnapshot(deletionKey);check();if(deletion)throw Error('Cette copie a été supprimée. Sa reprise ne la restaure pas automatiquement.');
 if(receipt.state==='applied'&&draft.staged||receipt.state==='staged'&&!draft.staged)throw Error('La confirmation de cette copie doit être récupérée avant sa reprise.');
 // An applied receipt never replays its old media requirements over later
 // independent edits/restores of the active copy. Staged copies retain full proofs.
 const files=receipt.state==='applied'?[]:await duplicateFiles(receipt,draft.content,scope,check);check();return {row:row!,receipt,draft,files,deletionKey};
}
/** Read a fixed admitted copy; this never creates IDs or replays its source. */
export async function readNotebookDuplicate(noteId:string,media:NotebookMediaScope,current:()=>boolean=()=>true):Promise<NotebookDuplicateStageReceipt>{
 const authority=captureDuplicateAuthority(media,current),state=await readDuplicateState(noteId,authority);authority.check();return structuredClone(state.receipt);
}
export async function resumeNotebookDuplicate(noteId:string,media:NotebookMediaScope,current:()=>boolean=()=>true):Promise<NotebookDuplicateStageReceipt>{return readNotebookDuplicate(noteId,media,current);}
/** Malformed pending receipts are reported, never silently dropped from recovery. */
export async function pendingNotebookDuplicates(media:NotebookMediaScope,current:()=>boolean=()=>true):Promise<NotebookDuplicateStageReceipt[]>{
 const authority=captureDuplicateAuthority(media,current),rows=await listSnapshotsByPrefix(authority.scope.accountId,authority.scope.spaceId,duplicatePrefix(authority.scope));authority.check();const result:NotebookDuplicateStageReceipt[]=[];
 const drafts=await listDrafts(authority.scope.accountId,authority.scope.spaceId);authority.check();
 for(const draft of drafts)if(draft.type==='whiteboard'&&draft.staged&&draft.duplicateSourceId&&!draft.archiveImport){
  if(!isPaperDocument(draft.content)||draft.documentId!==notebookDocumentId(draft.content.noteId))throw Error('Une ancienne copie en attente possède une identité incompatible. Ses pages et fichiers restent conservés.');
  const noteId=draft.content.noteId,row=rows.find(value=>value.key===notebookDuplicateReceiptKey(noteId,authority.scope));
  if(!row)throw Error('Une ancienne copie en attente ne possède pas de reçu complet de métadonnées. Ses pages et fichiers restent conservés ; sa récupération demande une confirmation explicite.');
  const receipt=validateDuplicateReceipt(row,noteId,authority.scope);if(receipt.state==='applied')throw Error('La confirmation d’une copie en attente doit être récupérée. Aucun original n’est supprimé.');
 }
 for(const row of rows){const id=(row.value as {noteId?:unknown}|undefined)?.noteId;if(!validNoteId(id))throw Error('Une copie en attente possède un reçu incompatible. Ses fichiers restent conservés.');const receipt=validateDuplicateReceipt(row,id,authority.scope);if(receipt.state==='applied')continue;const state=await readDuplicateState(id,authority);authority.check();result.push(structuredClone(state.receipt));}
 return result.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.noteId.localeCompare(b.noteId));
}
export interface NotebookDuplicateRecoveryIssue {kind:'legacy-incomplete'|'unavailable';noteId?:string;documentId?:string;message:string}
/** UI recovery keeps each valid pending copy visible beside incompatible older
 * entries. Authority/namespace retirement is global and is never downgraded. */
export async function readNotebookDuplicateRecoveries(media:NotebookMediaScope,current:()=>boolean=()=>true):Promise<{pending:NotebookDuplicateStageReceipt[];issues:NotebookDuplicateRecoveryIssue[]}>{
 const authority=captureDuplicateAuthority(media,current),{scope,check}=authority,prefix=duplicatePrefix(scope),rows=await listSnapshotsByPrefix(scope.accountId,scope.spaceId,prefix);check();
 const drafts=await listDrafts(scope.accountId,scope.spaceId);check();const pending:NotebookDuplicateStageReceipt[]=[],issues:NotebookDuplicateRecoveryIssue[]=[];
 for(const row of rows){
  check();const documentId=row.key.slice(prefix.length),draft=drafts.find(value=>value.type==='whiteboard'&&value.documentId===documentId),rawId=(row.value as {noteId?:unknown}|undefined)?.noteId,noteId=draft&&isPaperDocument(draft.content)?draft.content.noteId:validNoteId(rawId)?rawId:undefined;
  try{
   if(!validNoteId(rawId))throw Error('Le reçu de cette copie est incompatible. Ses pages et fichiers restent conservés.');
   const receipt=validateDuplicateReceipt(row,rawId,scope);
   if(receipt.state==='applied'){if(draft?.staged)throw Error('La confirmation de cette copie en attente doit être récupérée.');continue;}
   const state=await readDuplicateState(rawId,authority);check();if(state.receipt.state==='staged')pending.push(structuredClone(state.receipt));
  }catch(error){check();issues.push({kind:'unavailable',...(noteId?{noteId}:{}),documentId,message:String(error instanceof Error?error.message:'Cette copie doit être récupérée. Ses originaux restent conservés.').split('\n')[0].slice(0,300)});}
 }
 for(const draft of drafts)if(draft.type==='whiteboard'&&draft.staged&&draft.duplicateSourceId&&!draft.archiveImport&&!rows.some(row=>row.key===prefix+draft.documentId)){
  check();const noteId=isPaperDocument(draft.content)?draft.content.noteId:undefined;
  issues.push({kind:'legacy-incomplete',...(noteId?{noteId}:{}),documentId:draft.documentId,message:'Cette ancienne copie ne possède pas de reçu complet de métadonnées. Ses pages et fichiers restent conservés pour une récupération explicite.'});
 }
 check();pending.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.noteId.localeCompare(b.noteId));issues.sort((a,b)=>(a.documentId??'').localeCompare(b.documentId??'')||(a.noteId??'').localeCompare(b.noteId??''));return {pending,issues};
}
/** The platform calls this only after its exact scoped metadata store acknowledges. */
export async function confirmNotebookDuplicateMetadata(noteId:string,media:NotebookMediaScope,current:()=>boolean=()=>true,options:NotebookDuplicateActivationOptions={}):Promise<void>{
 const authority=captureDuplicateAuthority(media,current),{scope,check,active}=authority,mode=options.metadataAuthority??'external';if(mode!=='external'&&mode!=='indexeddb')throw Error('La preuve des métadonnées de la copie est incompatible.');
 const state=await readDuplicateState(noteId,authority);check();if(state.receipt.state==='applied'||state.receipt.metadataCommitted)return;
 if(!state.receipt.note)throw Error('Les métadonnées originales de cette ancienne copie doivent être récupérées avant sa finalisation.');
 const metadataKey={...scope,type:'notesMarkdown' as const,documentId:noteId},metadata=await getDraft(metadataKey);check();
 if(!ownedDraft(metadata,scope,'notesMarkdown',noteId)||metadata?.identityAlias||metadata?.syncState==='conflict'||metadata?.staged||metadata&&!validMetadata(metadata.content,noteId)||mode==='indexeddb'&&(!metadata||metadata.paperDependency!==state.draft.documentId))throw Error('Les métadonnées de cette copie attendent leur enregistrement ou doivent être départagées.');
 const next={...state.row,value:{...state.receipt,metadataCommitted:true}};
 await commitNotebookTransfer({target:scope,sources:[scope],drafts:[],blobs:[],snapshots:[next],draftChecks:[{identity:state.draft,expected:state.draft},{identity:metadataKey,expected:metadata}],blobChecks:state.files.map(file=>({identity:file,expected:file})),snapshotChecks:[{key:state.row.key,expected:state.row},{key:state.deletionKey,expected:undefined}]},active);check();
}
/** Build entirely in memory, then commit bytes, graph and receipts together.
 * Four-argument callers retain their accepted captured scope; UI passes a
 * permanent owner/API epoch and source metadata for a complete resumable note. */
export async function stageNotebookDuplicate(sourceNoteId:string,targetNoteId:string,markdown:string,media:NotebookMediaScope,options:NotebookDuplicateStageOptions={}):Promise<PaperDocument>{
 const sourceMetadataInput=options.sourceMetadata===undefined?undefined:structuredClone(options.sourceMetadata),authority=captureDuplicateAuthority(media,options.current),{scope,check,active}=authority,capturedMedia=authority.media;
 if(!validNoteId(sourceNoteId)||!validNoteId(targetNoteId)||sourceNoteId===targetNoteId||typeof markdown!=='string'||sourceMetadataInput!==undefined&&!validMetadata(sourceMetadataInput,sourceNoteId))throw Error('La note source ou les métadonnées de sa copie sont incompatibles. Les originaux restent conservés.');
 const historyInput=options.history===undefined?undefined:capturePaperHistorySelection(options.history,sourceNoteId,scope);
 const sourceKey={...scope,type:'whiteboard' as const,documentId:notebookDocumentId(sourceNoteId)},targetKey={...scope,type:'whiteboard' as const,documentId:notebookDocumentId(targetNoteId)},sourceMetadataKey={...scope,type:'notesMarkdown' as const,documentId:sourceNoteId},targetMetadataKey={...scope,type:'notesMarkdown' as const,documentId:targetNoteId};
 let original=historyInput?await getDraft(sourceKey):await ensureNotebookIdentity(sourceNoteId,capturedMedia,active);check();
 if(historyInput){if(!original||!isPaperDocument(original.content)||original.content.noteId!==sourceNoteId)throw Error('La note source doit être retrouvée avant de restaurer sa copie.');const fresh=await getSnapshot(historyInput.snapshot.key);check();if(JSON.stringify(fresh)!==JSON.stringify(historyInput.snapshot))throw new NotebookTransferChangedError('Cette version a changé. Son original reste conservé.');}
 if(!original&&capturedMedia.api&&navigator.onLine){await synchronizeSpace(capturedMedia.api,scope.accountId,scope.spaceId,active);check();original=await ensureNotebookIdentity(sourceNoteId,capturedMedia,active);check();}
 if(original&&(!ownedDraft(original,scope,'whiteboard',sourceKey.documentId)||original.identityAlias||original.syncState==='conflict'||original.staged))throw Error('La source de cette copie doit être récupérée avant sa duplication.');
 const legacy=original?undefined:await readOwnedLegacyNotebookBoard(sourceNoteId,capturedMedia,active);check();
 const boardKey={...scope,type:'whiteboard' as const,documentId:noteBoardId(sourceNoteId)},legacyKey={...scope,type:'whiteboard' as const,documentId:legacyNotebookDocumentId(sourceNoteId)},board=await getDraft(boardKey);check();const oldPaper=await getDraft(legacyKey);check();
 if(!original&&board&&!legacy)throw Error('L’ancien carnet doit être départagé avant sa copie. Aucun dessin n’est omis silencieusement.');
 if(legacy&&(legacy.identityAlias||legacy.syncState==='conflict'||legacy.staged))throw Error('L’ancien carnet doit être départagé avant sa copie.');
 const raw=historyInput?.document??original?.content??migratePaper(sourceNoteId,markdown,legacy?.content);if(!isPaperDocument(raw)||raw.noteId!==sourceNoteId)throw Error('La note source ne peut pas être copiée. Son original est conservé.');const source=structuredClone(raw);if(hasPaperCollaboration(source))verifyPaperCollaboration(source);
 const imageScans=source.objects.map(object=>{
  check();if(typeof object.markdown!=='string')return;const scan=scanLegacyPaperImages(object.markdown);
  for(const image of scan.images)if(image.url.startsWith('dowze-photo:')){const resolution=resolvePaperPhotoReference(source,image.url);if(resolution.kind!=='asset')throw Error('Une référence d’image de la source est absente, mal formée ou appartient à une autre note. Récupérez-la avant de copier ; son texte et ses originaux restent conservés.');}
  return scan;
 });
 if(source.assets.length>NOTEBOOK_DUPLICATE_LIMITS.assets||source.assets.reduce((n,a)=>n+a.size,0)>NOTEBOOK_DUPLICATE_LIMITS.bytes)throw Error('Cette copie dépasse la limite actuelle de 256 Mo ou de 10 000 pièces jointes. Son original reste conservé.');
 const sourceMetadataRow=await getDraft(sourceMetadataKey);check();if(!ownedDraft(sourceMetadataRow,scope,'notesMarkdown',sourceNoteId)||sourceMetadataRow?.identityAlias||sourceMetadataRow?.syncState==='conflict'||sourceMetadataRow?.staged||sourceMetadataRow&&!validMetadata(sourceMetadataRow.content,sourceNoteId))throw Error('Les métadonnées originales doivent être récupérées avant la copie.');
 const sourceMetadata=sourceMetadataInput??(sourceMetadataRow?structuredClone(sourceMetadataRow.content as SubjectNoteDocument):undefined);
 const sourceDeletionKey=notebookDeletionKey(sourceKey),targetDeletionKey=notebookDeletionKey(targetKey),ownerKey=`paper-legacy-owner|${scope.accountId}|${scope.spaceId}|whiteboard|${boardKey.documentId}`;
 const sourceDeletion=await getSnapshot(sourceDeletionKey);check();const targetDeletion=await getSnapshot(targetDeletionKey);check();const owner=await getSnapshot(ownerKey);check();if(sourceDeletion||targetDeletion)throw Error('Une source supprimée ou une ancienne identité cible doit être récupérée explicitement.');
 if(owner){const v=owner.value as {schema?:unknown;noteId?:unknown;documentId?:unknown;boardId?:unknown;claimedAt?:unknown}|null;if(owner.accountId!==scope.accountId||owner.spaceId!==scope.spaceId||!v||v.schema!==1||v.noteId!==sourceNoteId||v.documentId!==sourceKey.documentId||v.boardId!==boardKey.documentId||!Number.isFinite(Date.parse(String(v.claimedAt))))throw Error('La propriété de l’ancien carnet doit être départagée avant sa copie.');}
 const existing=await getDraft(targetKey);check();const metadata=await getDraft(targetMetadataKey);check();const migration=await getSnapshot(migrationKey(targetNoteId,scope));check();const receipt=await getSnapshot(notebookDuplicateReceiptKey(targetNoteId,scope));check();if(existing||metadata||migration||receipt)throw Error('Cette identité possède déjà une note ou une reprise. Aucun contenu n’est remplacé ; reprenez la copie existante.');
 const now=Date.now(),at=new Date(now).toISOString(),mapped=appendPaperArchive(source,targetNoteId);let objectIndex=0;
 // The archive mapper supplies independent graph IDs. Rewrite only semantic
 // image destinations; literals, code and ordinary links remain source-exact.
 const mappedCommands:PaperCommand[]=mapped.commands.map(command=>{
  if(command.type!=='upsert-object')return command;const scan=imageScans[objectIndex++];if(!scan)return command;
  const replacements=new Map<string,string>();for(const image of scan.images)if(image.url.startsWith('dowze-photo:')){const resolution=resolvePaperPhotoReference(source,image.url);if(resolution.kind!=='asset')throw Error('La référence de cette image a changé avant sa copie.');const id=mapped.assets.get(resolution.asset.id);if(!id)throw Error('Le fichier de cette image ne possède pas d’identité de copie.');replacements.set(image.id,photoReference(targetKey.documentId,id));}
  return {...command,object:{...command.object,markdown:planLegacyPaperImageRewrite(scan,replacements).markdown}};
 });
 if(objectIndex!==source.objects.length)throw Error('Le plan de copie ne couvre pas tous les éléments de la source. Aucun original n’est remplacé.');
 const blank=migratePaper(targetNoteId,'',null,at),commands:PaperCommand[]=[...mappedCommands,...(source.study?[{type:'study-language' as const,language:source.study.language}]:[]),{type:'remove-page',id:blank.pages[0].id}];
 let copied=applyPaperCommand(blank,{type:'batch',commands},at);copied=amendPaperCollaboration(copied,copied);verifyPaperCollaboration(copied);
 const note:SubjectNoteDocument|undefined=sourceMetadata?{...sourceMetadata,id:targetNoteId,title:`${sourceMetadata.title} (${historyInput?'version restaurée':'copie'})`.slice(0,500),markdown:paperMarkdown(copied),createdAt:at,updatedAt:at}:undefined;
 const draft:Draft={...targetKey,title:note?.title??'Copie de note',content:copied,baseVersion:0,updatedAt:now,syncState:'local',staged:true,duplicateSourceId:sourceNoteId},blobs:LocalBlob[]=[],sourceFiles:LocalBlob[]=[];let total=0;
 for(const asset of source.assets){
  check();const blob=await readPaperAsset(asset,capturedMedia,{document:source,current:active});check();total+=blob.size;if(total>NOTEBOOK_DUPLICATE_LIMITS.bytes)throw Error('Les fichiers de cette copie dépassent 256 Mo. Aucun fichier cible n’est publié.');
  const sha256=await localBlobDigest(blob);check();const files=await listLocalBlobs(scope.accountId,scope.spaceId);check();const originalFile=files.find(row=>row.id===asset.id);
  if(!originalFile||(originalFile.removedFromNote&&!historyInput)||originalFile.blob.size!==blob.size||originalFile.blob.type!==blob.type||originalFile.sha256&&originalFile.sha256!==sha256)throw Error('Une pièce jointe originale a changé ou a été supprimée. Aucun fichier n’est ressuscité.');
  if(historyInput){const originalSha=await localBlobDigest(originalFile.blob);check();if(originalSha!==sha256)throw Error('Les octets historiques ont changé. Aucun fichier ni original n’est remplacé.');}
  sourceFiles.push(originalFile);blobs.push({...scope,id:mapped.assets.get(asset.id)!,documentId:targetKey.documentId,blob:blob.slice(0,undefined,asset.mediaType),name:asset.name,createdAt:now,status:'pending',revision:1,sha256,removedFromNote:true});
 }
 const stage:NotebookDuplicateStageReceipt={schema:1,kind:'notebook-duplicate-stage',noteId:targetNoteId,sourceNoteId,documentId:targetKey.documentId,createdAt:at,state:'staged',metadataCommitted:false,copyLineage:copied.collaboration!.lineage,sourceDocument:source,...(sourceMetadata?{sourceMetadata,note}:{}),mapping:{assets:[...mapped.assets]},commands,files:blobs.map((file,i)=>({id:file.id,sourceId:source.assets[i].id,size:file.blob.size,mediaType:file.blob.type,sha256:file.sha256!}))};
 const stageRow:Snapshot={key:notebookDuplicateReceiptKey(targetNoteId,scope),...scope,value:stage},migrationRow:Snapshot={key:migrationKey(targetNoteId,scope),...scope,value:{duplicateSource:{noteId:sourceNoteId,revision:source.revision},source}};
 const plan:NotebookTransferCommit={target:scope,sources:[scope],drafts:[draft],blobs,snapshots:[stageRow,migrationRow],draftChecks:[{identity:sourceKey,expected:original},{identity:targetKey,expected:undefined},{identity:sourceMetadataKey,expected:sourceMetadataRow},{identity:targetMetadataKey,expected:undefined}],blobChecks:[...sourceFiles.map(file=>({identity:file,expected:file})),...blobs.map(file=>({identity:file,expected:undefined}))],snapshotChecks:[{key:sourceDeletionKey,expected:undefined},{key:targetDeletionKey,expected:undefined},{key:ownerKey,expected:owner},{key:stageRow.key,expected:undefined},{key:migrationRow.key,expected:undefined}]};
 for(const [identity,expected] of [[boardKey,board],[legacyKey,oldPaper]] as const)if(!plan.draftChecks.some(row=>row.identity.type===identity.type&&row.identity.documentId===identity.documentId))plan.draftChecks.push({identity,expected});
 if(historyInput)plan.snapshotChecks.push({key:historyInput.snapshot.key,expected:historyInput.snapshot});
 check();await commitNotebookTransfer(plan,active);check();return copied;
}
export interface NotebookDuplicateActivationOptions {metadataAuthority?:'external'|'indexeddb'}
/** Activate one captured copy, never whichever notebook becomes current later.
 * Existing 2-argument callers are already accepted operations with external
 * metadata; opening passes its irreversible source/API epoch as current. */
export async function activateNotebookDuplicate(noteId:string,media:NotebookMediaScope,current:()=>boolean=()=>true,options:NotebookDuplicateActivationOptions={}){
 const authority=captureDuplicateAuthority(media,current),{scope,active,check}=authority,copyKey={...scope,type:'whiteboard' as const,documentId:notebookDocumentId(noteId)},libraryKey={...scope,type:'preferences' as const,documentId:LIBRARY_DOCUMENT_ID},metadataKey={...scope,type:'notesMarkdown' as const,documentId:noteId};
 const metadataAuthority=options.metadataAuthority??'external',now=Date.now(),at=new Date(now).toISOString();
 if(metadataAuthority!=='external'&&metadataAuthority!=='indexeddb')throw Error('La preuve des métadonnées de la copie est incompatible.');
 let incarnation:{sourceId:string|undefined;lineage:string|undefined}|undefined,legacyIncarnation:{content:string;receipt:string}|undefined;
 const owned=(row:Draft|undefined,identity:typeof copyKey|typeof libraryKey|typeof metadataKey)=>!row||row.accountId===scope.accountId&&row.spaceId===scope.spaceId&&row.type===identity.type&&row.documentId===identity.documentId;
 check();
 for(let attempt=0;attempt<3;attempt++){
  check();const copy=await getDraft(copyKey);check();
  if(!copy||!owned(copy,copyKey)||!isPaperDocument(copy.content)||copy.content.noteId!==noteId||copy.identityAlias||copy.syncState==='conflict'||copy.archiveImport)throw Error('La copie doit être retrouvée et ses versions départagées avant sa finalisation.');
  if(hasPaperCollaboration(copy.content))verifyPaperCollaboration(copy.content);
  const deletionKey=notebookDeletionKey(copyKey),deletionRow=await getSnapshot(deletionKey);check();
  if(await readNotebookDeletionStatus(noteId,scope,active))throw Error('Cette copie a été supprimée. Ses sources restent conservées sans réactivation automatique.');check();
  const stageKey=notebookDuplicateReceiptKey(noteId,scope),stageRow=await getSnapshot(stageKey);check();
  const stagedReceipt=stageRow?validateDuplicateReceipt(stageRow,noteId,scope):undefined;
  if(stagedReceipt&&(stagedReceipt.sourceNoteId!==copy.duplicateSourceId||stagedReceipt.copyLineage!==copy.content.collaboration?.lineage||stagedReceipt.state==='applied'&&copy.staged||stagedReceipt.state==='staged'&&!copy.staged))throw Error('La confirmation de cette copie doit être récupérée. Ses sources restent conservées.');
  // Absorbing: a replay cannot reset a classification edited after activation.
  if(!copy.staged)return;
  if(stagedReceipt&&!stagedReceipt.metadataCommitted)throw Error('Cette copie attend la confirmation durable de ses métadonnées. Reprenez-la depuis la bibliothèque.');
  const sourceId=copy.duplicateSourceId;
  if(sourceId!==undefined&&(typeof sourceId!=='string'||!sourceId||sourceId.length>200||sourceId===noteId))throw Error('L’identité historique de la copie est incompatible.');
  const lineage=copy.content.collaboration?.lineage;
  if(incarnation&&(incarnation.sourceId!==sourceId||incarnation.lineage!==lineage))throw Error('La source de la copie a changé pendant sa finalisation. Les deux versions restent conservées.');
  incarnation??={sourceId,lineage};
  const metadata=await getDraft(metadataKey);check();
  if(!owned(metadata,metadataKey)||metadata?.identityAlias||metadata?.syncState==='conflict'||metadata&&typeof metadata.content==='object'&&metadata.content!==null&&typeof (metadata.content as {id?:unknown}).id==='string'&&(metadata.content as {id:string}).id!==noteId)throw Error('Les métadonnées de cette copie doivent être départagées avant sa finalisation.');
  // Desktop's durable SubjectNotesStore is acknowledged by its accepted caller.
  // PWA may require its actual notesMarkdown row explicitly. Absence remains CAS.
  if(metadataAuthority==='indexeddb'&&!metadata)throw Error('Les métadonnées de cette copie attendent leur enregistrement.');
  const migrationKey=`paper-migration|${scope.accountId}|${scope.spaceId}|whiteboard|${copyKey.documentId}`,migration=await getSnapshot(migrationKey);check();
  if(migration&&(migration.accountId!==scope.accountId||migration.spaceId!==scope.spaceId))throw Error('Le reçu historique de la copie appartient à un autre périmètre.');
  const history=migration?.value as {duplicateSource?:{noteId?:unknown};source?:unknown}|undefined;
  if(sourceId&&history?.duplicateSource&&(history.duplicateSource.noteId!==sourceId||!isPaperDocument(history.source)||history.source.noteId!==sourceId))throw Error('Le reçu historique ne prouve pas la source de cette copie. Ses originaux restent conservés.');
  if(stagedReceipt&&(!history?.duplicateSource||JSON.stringify(history.source)!==JSON.stringify(stagedReceipt.sourceDocument)))throw Error('Les reçus de cette copie doivent être départagés. Aucun original n’est remplacé.');
  // Old staged copies have no CRDT lineage. A retry may refresh classification,
  // but it cannot silently admit a different legacy body/incarnation receipt.
  if(!lineage){
   const legacy={content:JSON.stringify(copy.content),receipt:JSON.stringify(migration)??'undefined'};
   if(legacyIncarnation&&(legacyIncarnation.content!==legacy.content||legacyIncarnation.receipt!==legacy.receipt))throw Error('Cette ancienne copie a changé pendant sa finalisation. Ses sources restent conservées pour une reprise explicite.');
   legacyIncarnation??=legacy;
  }
  const stored=await getDraft(libraryKey);check();
  if(!owned(stored,libraryKey)||stored?.identityAlias||stored?.syncState==='conflict'||stored?.staged)throw Error('Le classement de cette copie doit être départagé avant sa finalisation.');
  const library=stored?.content??emptyNotebookLibrary();if(!isNotebookLibrary(library))throw Error('Le classement de la copie est incompatible. Les originaux restent conservés.');
  // Validate the retained CRDT as well as the visible library, without writing a
  // no-op amendment back to storage.
  amendNotebookLibrary(library,library,`${scope.accountId}|${scope.spaceId}`);
  const target=Object.hasOwn(library.notes,noteId)?library.notes[noteId]:undefined,source=sourceId&&Object.hasOwn(library.notes,sourceId)?library.notes[sourceId]:undefined;
  if(target?.deletedAt)throw Error('Cette copie a été placée dans la corbeille. Sa finalisation ne la restaure pas automatiquement.');
  const plan:NotebookTransferCommit={target:scope,sources:[scope],drafts:[],blobs:[],snapshots:[],draftChecks:[{identity:copyKey,expected:copy},{identity:libraryKey,expected:stored},{identity:metadataKey,expected:metadata}],blobChecks:[],snapshotChecks:[{key:deletionKey,expected:deletionRow},{key:migrationKey,expected:migration}]};
  if(source&&!target){
   const next=amendNotebookLibrary(library,updateNotebookLibrary(library,{note:{id:noteId,patch:{...source,deletedAt:null}}},at),`${scope.accountId}|${scope.spaceId}`);
   if(stored){
    const historyKey=`paper-history|${scope.accountId}|${scope.spaceId}|preferences|${LIBRARY_DOCUMENT_ID}|${String(library.revision).padStart(12,'0')}`,previous=await getSnapshot(historyKey);check();
    plan.snapshotChecks.push({key:historyKey,expected:previous});
    if(!previous)plan.snapshots.push({key:historyKey,...scope,value:library});
    else if(previous.accountId!==scope.accountId||previous.spaceId!==scope.spaceId||JSON.stringify(previous.value)!==JSON.stringify(library)){
     // Keep both originals visible to the existing library.history prefix reader.
     const extraKey=`${historyKey}-copy-${crypto.randomUUID()}`;
     plan.snapshotChecks.push({key:extraKey,expected:undefined});plan.snapshots.push({key:extraKey,...scope,value:library});
    }
   }
   plan.drafts.push({...stored,...libraryKey,title:stored?.title??'Bibliothèque de notes',content:next,baseVersion:stored?.baseVersion??0,updatedAt:now,syncState:'local'});
  }
  const {staged:_staged,...activated}=copy;plan.drafts.push(activated);
  if(stagedReceipt){
   const files=await duplicateFiles(stagedReceipt,copy.content as PaperDocument,scope,check);check();
   for(const file of files){if(file.removedFromNote!==true||file.status!=='pending')throw Error('Une pièce jointe de la copie n’est plus dans son état préparé. Ses octets restent conservés.');plan.blobChecks.push({identity:file,expected:file});plan.blobs.push({...file,removedFromNote:false});}
   plan.snapshotChecks.push({key:stageKey,expected:stageRow});plan.snapshots.push({...stageRow!,value:{...stagedReceipt,state:'applied'}});
  }
  check();
  try{await commitNotebookTransfer(plan,active);check();dispatchEvent(new CustomEvent('dowze:notebook-library-changed',{detail:scope}));return;}
  catch(error){check();if(!(error instanceof NotebookTransferChangedError)||attempt===2)throw error;}
 }
}
