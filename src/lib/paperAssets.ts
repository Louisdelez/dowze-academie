import {listLocalBlobs,getDraft,getSnapshot,readNotebookDeletionStatus,notebookDeletionKey,localBlobDigest,commitNotebookTransfer,type Snapshot,type Draft,type DraftKey} from '../../pwa/src/storage.ts';
import type {NotebookMediaScope} from '../components/NotebookEditor';
import {notebookDocumentId,isPaperDocument,type PaperAsset,type PaperDocument} from './notebookDocument.ts';
import {legacyNotebookDocumentId} from './notebookIdentity.ts';
import {noteBoardId,parsePhotoReference} from './notebook.ts';

export type PaperPhotoResolution={kind:'asset';asset:PaperAsset;reference:{documentId:string;id:string}}|{kind:'unavailable';reason:'malformed'|'foreign-note'|'missing-file';message:string}|{kind:'external'};
/** A matching attachment ID in a different note is never a reference to this note's image. */
export function resolvePaperPhotoReference(document:PaperDocument,src:string):PaperPhotoResolution{
 if(!src.startsWith('dowze-photo:'))return {kind:'external'};
 const reference=parsePhotoReference(src);if(!reference)return {kind:'unavailable',reason:'malformed',message:'Cette référence d’image doit être récupérée avant son affichage. Son texte original reste conservé.'};
 const canonical=notebookDocumentId(document.noteId),board=noteBoardId(document.noteId),legacyProved=document.legacy.boardId===board;
 const allowed=reference.documentId===canonical||legacyProved&&(reference.documentId===board||reference.documentId===legacyNotebookDocumentId(document.noteId));
 if(!allowed)return {kind:'unavailable',reason:'foreign-note',message:'Cette image fait référence à un autre carnet. Elle n’est pas remplacée par une image de cette note.'};
 const asset=document.assets.find(row=>row.id===reference.id);return asset?{kind:'asset',asset,reference}:{kind:'unavailable',reason:'missing-file',message:'Le fichier de cette image n’est pas encore associé à la note. Son texte original reste conservé.'};
}
export interface PaperAssetReadContext {document?:PaperDocument;referenceDocumentId?:string;current?:()=>boolean;sourceCheck?:()=>Promise<void>;privateResolutionIdentity?:DraftKey}
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const descriptor=(asset:PaperAsset)=>JSON.stringify([asset.id,asset.serverId??null,asset.mediaType,asset.size]);
const check=(current:()=>boolean)=>{if(!current())throw Error('Le carnet ou le compte a changé pendant le chargement du fichier.');};
function validateManifest(asset:PaperAsset,document:PaperDocument|undefined,referenceDocumentId?:string){
 if(!document)return;if(!document.assets.some(row=>descriptor(row)===descriptor(asset)))throw Error('Cette pièce jointe ne correspond plus au carnet affiché.');
 if(referenceDocumentId){const result=resolvePaperPhotoReference(document,`dowze-photo:${encodeURIComponent(referenceDocumentId)}/${encodeURIComponent(asset.id)}`);if(result.kind!=='asset')throw Error(result.kind==='unavailable'?result.message:'La référence de cette image est incompatible.');}
}
async function documentProof(document:PaperDocument|undefined,scope:{accountId:string;spaceId:string},current:()=>boolean){
 if(!document)return {draft:undefined as Draft|undefined,snapshots:[] as {key:string;expected:Snapshot|undefined}[]};
 const identity={...scope,type:'whiteboard' as const,documentId:notebookDocumentId(document.noteId)},draft=await getDraft(identity);check(current);
 if(draft&&(draft.accountId!==scope.accountId||draft.spaceId!==scope.spaceId||draft.documentId!==identity.documentId||!isPaperDocument(draft.content)||draft.content.noteId!==document.noteId))throw Error('Ce carnet ne possède plus une identité prouvée. Ses fichiers restent conservés.');
 if(await readNotebookDeletionStatus(document.noteId,scope,current))throw Error('Ce carnet a été supprimé. Ses fichiers conservés ne sont pas réassociés automatiquement.');check(current);
 const deletionKey=notebookDeletionKey(identity),deletion=await getSnapshot(deletionKey);check(current);if(deletion)throw Error('La suppression de ce carnet doit être départagée avant le chargement de ses fichiers.');
 const board=noteBoardId(document.noteId),ownerKey=`paper-legacy-owner|${scope.accountId}|${scope.spaceId}|whiteboard|${board}`,owner=await getSnapshot(ownerKey);check(current);
 if(owner&&(owner.accountId!==scope.accountId||owner.spaceId!==scope.spaceId||!record(owner.value)||owner.value.schema!==1||owner.value.noteId!==document.noteId||owner.value.documentId!==identity.documentId||owner.value.boardId!==board||!Number.isFinite(Date.parse(String(owner.value.claimedAt)))))throw Error('L’ancien carnet de cette image appartient à une autre note ou doit être départagé. Aucun fichier n’est emprunté.');
 return {draft,snapshots:[{key:deletionKey,expected:undefined},{key:ownerKey,expected:owner}]};
}
/** Files stay scoped to the captured owner/year. A late download cannot overwrite another original. */
export async function readPaperAsset(asset:PaperAsset,media:NotebookMediaScope,context:PaperAssetReadContext={}):Promise<Blob>{
 const scope={accountId:media.accountId,spaceId:media.spaceId},current=context.current??(()=>true),sourceCheck=context.sourceCheck,privateIdentity=context.privateResolutionIdentity?{accountId:context.privateResolutionIdentity.accountId,spaceId:context.privateResolutionIdentity.spaceId,type:context.privateResolutionIdentity.type??'whiteboard',documentId:context.privateResolutionIdentity.documentId}:undefined;check(current);if(sourceCheck||privateIdentity)asset={...asset};if(privateIdentity&&(privateIdentity.accountId!==scope.accountId||privateIdentity.spaceId!==scope.spaceId||privateIdentity.type!=='whiteboard'||context.document&&notebookDocumentId(context.document.noteId)!==privateIdentity.documentId))throw Error('La récupération de ce fichier appartient à une autre note.');if(sourceCheck){await sourceCheck();check(current);}validateManifest(asset,context.document,context.referenceDocumentId);
 let proof=await documentProof(context.document,scope,current);check(current);
 const files=await listLocalBlobs(scope.accountId,scope.spaceId);check(current);const local=files.find(file=>file.id===asset.id);
 const validateLocal=(file:typeof local)=>{
  if(!file)return;if(file.accountId!==scope.accountId||file.spaceId!==scope.spaceId||asset.serverId&&file.serverId!==asset.serverId)throw Error(`Le fichier « ${asset.name} » ne correspond pas à l’original attendu. Aucun fichier n’est remplacé.`);
  if(asset.size>0&&file.blob.size!==asset.size)throw Error(`Le fichier « ${asset.name} » possède une autre taille que l’original conservé.`);
  if(context.document&&file.documentId){const noteId=context.document.noteId,board=noteBoardId(noteId),allowed=new Set([notebookDocumentId(noteId),...(context.document.legacy.boardId===board?[board,legacyNotebookDocumentId(noteId),`paper-v3-${noteId}`,noteId]:[])]);if(!allowed.has(file.documentId))throw Error('Ce fichier est associé à un autre carnet. Il n’est pas utilisé à la place de votre image.');}
 };
 validateLocal(local);if(local){check(current);return local.blob;}
 if(!asset.serverId||!media.api)throw Error(`Le fichier « ${asset.name} » attend son téléchargement. Connectez cet appareil pour retrouver l’original.`);
 if(sourceCheck){await sourceCheck();check(current);}let downloaded:Blob;try{downloaded=await media.api.downloadBlob(scope.spaceId,asset.serverId);}catch(error){check(current);throw new Error(`Le fichier « ${asset.name} » n’a pas pu être téléchargé. L’original reste conservé ; réessayez après la reconnexion.`,{cause:error});}check(current);if(sourceCheck){await sourceCheck();check(current);}
 const blob=new Blob([downloaded],{type:asset.mediaType});if(asset.size>0&&blob.size!==asset.size)throw Error(`Le téléchargement de « ${asset.name} » ne correspond pas à la taille de l’original.`);
 const sha256=await localBlobDigest(blob);check(current);const identity=context.document?{...scope,type:'whiteboard' as const,documentId:notebookDocumentId(context.document.noteId)}:privateIdentity;
 const cached={...scope,id:asset.id,blob,name:asset.name,createdAt:Date.now(),status:'uploaded' as const,serverId:asset.serverId,sha256,revision:1,...(identity?{documentId:identity.documentId}:{})};
 for(let attempt=0;attempt<3;attempt++){
  try{if(sourceCheck){await sourceCheck();check(current);}await commitNotebookTransfer({target:scope,sources:[scope],drafts:[],blobs:[cached],snapshots:[],draftChecks:identity?[{identity,expected:proof.draft}]:[],blobChecks:[{identity:{...scope,id:asset.id},expected:undefined}],snapshotChecks:proof.snapshots,...(privateIdentity?{privateTransport:{type:privateIdentity.type,documentId:privateIdentity.documentId}}:{})},current);check(current);if(sourceCheck){await sourceCheck();check(current);}return blob;}
  catch(error){check(current);if(sourceCheck){await sourceCheck();check(current);}const latest=(await listLocalBlobs(scope.accountId,scope.spaceId)).find(file=>file.id===asset.id);check(current);validateLocal(latest);if(latest){const latestSha=await localBlobDigest(latest.blob);check(current);if(latestSha===sha256){await documentProof(context.document,scope,current);check(current);return latest.blob;}}
   // An unrelated annotation can advance the note while its immutable image downloads.
   // Refresh the ownership proof a bounded number of times, without replacing any bytes.
   if(!latest&&context.document&&attempt<2){proof=await documentProof(context.document,scope,current);check(current);continue;}
   throw new Error(`Le carnet ou le fichier « ${asset.name} » a changé pendant son chargement. Aucun original n’a été remplacé.`,{cause:error});
  }
 }
 throw Error('Le fichier attend une nouvelle tentative de chargement.');
}
