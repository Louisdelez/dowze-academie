import {getDraft,getSnapshot,listLocalBlobs,localBlobDigest,commitNotebookTransfer,notebookDeletionKey,readNotebookDeletionStatus,type Draft,type Snapshot,type NotebookTransferCommit} from '../../pwa/src/storage.ts';
import {applyPaperCommand,isPaperDocument,notebookDocumentId,type PaperAsset,type PaperDocument,type PaperObject} from './notebookDocument.ts';
import {amendPaperCollaboration} from './paperCollaboration.ts';
import {photoReference} from './notebook.ts';
import {validateLegacyRasterBytes} from './paperLegacyImages.ts';

export interface PaperImageInsertionInput {
 document:PaperDocument;scope:{accountId:string;spaceId:string};blob:Blob;name:string;current:()=>boolean;
 /** Omit the object for an image inserted at the caret in rich text. */
 object?:PaperObject;newId?:()=>string;now?:string;
}
export interface PreparedPaperImageInsertion {draft:Draft;asset:PaperAsset;url:string;commit:NotebookTransferCommit}
const check=(current:()=>boolean)=>{if(!current())throw Error('La note ou le compte a changé pendant l’ajout. Réessayez depuis la note courante.');};
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const validId=(id:string)=>/^[A-Za-z0-9][A-Za-z0-9._-]{0,126}$/.test(id)&&!id.includes('..');

/** Prepare immutable image bytes and their owned graph together, without a prewrite. */
export async function preparePaperImageInsertion(input:PaperImageInsertionInput):Promise<PreparedPaperImageInsertion>{
 const {document,blob,current}=input,scope={accountId:input.scope.accountId,spaceId:input.scope.spaceId};check(current);
 if(!isPaperDocument(document)||!Object.values(scope).every(value=>typeof value==='string'&&/^[A-Za-z0-9._-]{1,200}$/.test(value)))throw Error('La note doit être retrouvée avant d’ajouter une image.');
 if(!['image/png','image/jpeg','image/gif','image/webp'].includes(blob.type)||!blob.size||blob.size>16*1024*1024)throw Error('Choisissez une image PNG, JPEG, GIF ou WebP de 16 Mo maximum.');
 const bytes=new Uint8Array(await blob.arrayBuffer());check(current);validateLegacyRasterBytes(bytes,blob.type);check(current);
 const identity={...scope,type:'whiteboard' as const,documentId:notebookDocumentId(document.noteId)};
 const deleted=await readNotebookDeletionStatus(document.noteId,scope,current);check(current);if(deleted)throw Error('Ce carnet a été supprimé. Aucune image n’est ajoutée à sa place.');
 const stored=await getDraft(identity);check(current);
 if(!stored||stored.staged||stored.identityAlias||stored.syncState==='conflict'||!isPaperDocument(stored.content)||stored.content.noteId!==document.noteId||!equal(stored.content,document))throw Error('La note a reçu une autre modification. Laissez-la se mettre à jour puis réessayez l’image.');
 const id=(input.newId??(()=>crypto.randomUUID()))();if(!validId(id)||document.assets.some(asset=>asset.id===id))throw Error('Cette image possède déjà une identité utilisée. Aucun fichier n’est remplacé.');
 const files=await listLocalBlobs(scope.accountId,scope.spaceId);check(current);if(files.some(file=>file.id===id))throw Error('Un fichier existe déjà pour cette identité. Aucun original n’est remplacé.');
 const now=input.now??new Date().toISOString();if(!Number.isFinite(Date.parse(now)))throw Error('La date de l’image est incompatible.');
 const sha256=await localBlobDigest(blob);check(current);
 const name=input.name.trim().slice(0,300)||'Image',asset:PaperAsset={id,name,mediaType:blob.type,size:blob.size};
 const commands:Parameters<typeof applyPaperCommand>[1][]=[{type:'add-asset',asset}];
 if(input.object){if(input.object.kind!=='image'||document.objects.some(object=>object.id===input.object!.id)||!document.pages.some(page=>page.id===input.object!.pageId))throw Error('La page a changé avant l’ajout de l’image.');commands.push({type:'upsert-object',object:{...structuredClone(input.object),assetId:id}});}
 const next=amendPaperCollaboration(document,applyPaperCommand(document,{type:'batch',commands},now),`${scope.accountId}|${scope.spaceId}|${document.noteId}`);
 if(!isPaperDocument(next))throw Error('L’image n’a pas pu être associée à cette note. Son fichier d’origine est inchangé.');
 const draft:Draft={...stored,content:next,updatedAt:Date.parse(now),syncState:'local'};
 const receiptKey=`paper-image-insertion|${scope.accountId}|${scope.spaceId}|${identity.documentId}|${id}`,historyKey=`paper-history|${scope.accountId}|${scope.spaceId}|whiteboard|${identity.documentId}|${String(document.revision).padStart(12,'0')}`;
 const [receipt,history]=await Promise.all([getSnapshot(receiptKey),getSnapshot(historyKey)]);check(current);
 if(receipt)throw Error('Une autre image utilise ce reçu. Aucun original n’est remplacé.');
 const historyMatches=history&&history.accountId===scope.accountId&&history.spaceId===scope.spaceId&&equal(history.value,document);
 const beforeHistoryKey=history&&!historyMatches?`${historyKey}|image-${id}`:historyKey;
 const alternateHistory=beforeHistoryKey!==historyKey?await getSnapshot(beforeHistoryKey):undefined;check(current);
 if(alternateHistory)throw Error('Une version historique utilise déjà cette identité. Aucun original n’est remplacé.');
 const snapshot:Snapshot={key:receiptKey,...scope,value:{schema:1,kind:'paper-image-insertion',noteId:document.noteId,documentId:identity.documentId,assetId:id,name,mediaType:blob.type,size:blob.size,sha256,mode:input.object?'floating':'inline',paperRevision:next.revision,beforeHistoryKey,insertedAt:now}};
 const commit:NotebookTransferCommit={target:scope,sources:[scope],drafts:[draft],blobs:[{...scope,id,documentId:identity.documentId,blob,name,createdAt:Date.parse(now),status:'pending',removedFromNote:false,revision:1,sha256}],snapshots:[snapshot,...(!historyMatches?[{key:beforeHistoryKey,...scope,value:document}]:[])],draftChecks:[{identity,expected:stored}],blobChecks:[{identity:{...scope,id},expected:undefined}],snapshotChecks:[{key:receiptKey,expected:undefined},{key:historyKey,expected:history},...(beforeHistoryKey!==historyKey?[{key:beforeHistoryKey,expected:undefined}]:[]),{key:notebookDeletionKey(identity),expected:undefined}]};
 return {draft,asset,url:photoReference(identity.documentId,id),commit};
}

export async function insertPaperImage(input:PaperImageInsertionInput):Promise<PreparedPaperImageInsertion>{
 const prepared=await preparePaperImageInsertion(input);check(input.current);await commitNotebookTransfer(prepared.commit,input.current);return prepared;
}
