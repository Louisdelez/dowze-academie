import {noteMetadataTransportId} from './noteMetadataIdentity.ts';
export {noteMetadataTransportId} from './noteMetadataIdentity.ts';
import {PrivateNotebookBlockedError} from './privateNotebookSyncPolicy.ts';
import {notebookIdentityDigest,notebookDocumentId} from './notebookIdentity.ts';
import {commitNotebookTransfer,getDraft,getSnapshot,notebookPrivateTransportAllowed,quarantinePrivateNotebookChange,type Snapshot} from '../../pwa/src/storage.ts';
import type {RemoteDocument,SyncDocument,SyncTransport} from './serverSync.ts';

export interface NoteTransportScope {accountId:string;spaceId:string}
interface NoteMetadataRemote {document_type:string;document_id:string;version:number;content:unknown;deleted:boolean}
const aliasPattern=/^note-meta-id2-[a-f0-9]{64}$/;
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const cleanScope=(scope:NoteTransportScope):NoteTransportScope=>({accountId:scope.accountId,spaceId:scope.spaceId});

export interface NoteMetadataEnvelope {
 notebookMetadataTransport:1;accountId:string;spaceId:string;logicalId:string;documentId:string;graphId:string;note:Record<string,unknown>;
}
export interface NoteMetadataBinding extends NoteTransportScope {
 schema:1;kind:'paper-metadata-transport';logicalId:string;documentId:string;graphId:string;confirmedVersion:number;deletedVersion?:number;
}
export const noteMetadataBindingKey=(scope:NoteTransportScope,documentId:string)=>`paper-metadata-transport|${scope.accountId}|${scope.spaceId}|${documentId}`;
const sameBinding=(value:unknown,scope:NoteTransportScope,id:string):value is NoteMetadataBinding=>record(value)&&value.schema===1&&value.kind==='paper-metadata-transport'&&value.accountId===scope.accountId&&value.spaceId===scope.spaceId&&value.documentId===id&&typeof value.logicalId==='string'&&value.logicalId.length>0&&value.logicalId.length<=200&&noteMetadataTransportId(value.logicalId)===id&&value.graphId===notebookDocumentId(value.logicalId)&&Number.isSafeInteger(value.confirmedVersion)&&Number(value.confirmedVersion)>=0&&(value.deletedVersion===undefined||Number.isSafeInteger(value.deletedVersion)&&Number(value.deletedVersion)>0);
const currentOrThrow=(current:()=>boolean)=>{if(!current())throw Error('Le compte ou l’année a changé pendant la synchronisation de la note.');};
const requirePrivate=async(scope:NoteTransportScope,type:string,id:string,current:()=>boolean,content?:unknown)=>{currentOrThrow(current);if(!await notebookPrivateTransportAllowed({...scope,type,documentId:id},current,content))throw new PrivateNotebookBlockedError();currentOrThrow(current);};

/** Transport identities never replace the logical ID in a draft, outbox or note. */
export async function prepareNoteMetadataTransport(document:{type:string;id:string;content:unknown},scope:NoteTransportScope,current:()=>boolean):Promise<{id:string;content:unknown}>{
 scope=cleanScope(scope);
 await requirePrivate(scope,document.type,document.id,current,document.content);if(document.type!=='notesMarkdown')return document;
 const id=noteMetadataTransportId(document.id);if(id===document.id)return document;
 if(!record(document.content)||document.content.id!==document.id)throw Error('Les métadonnées ne prouvent pas l’identité complète de cette note.');
 const envelope:NoteMetadataEnvelope={notebookMetadataTransport:1,...scope,logicalId:document.id,documentId:id,graphId:notebookDocumentId(document.id),note:document.content};
 const previous=await getSnapshot(noteMetadataBindingKey(scope,id));currentOrThrow(current);
 if(previous&&sameBinding(previous.value,scope,id)&&previous.value.deletedVersion!==undefined&&previous.value.deletedVersion>=previous.value.confirmedVersion)throw Error('Cette note a été supprimée sur le serveur. Son original local reste conservé.');
 await conserveBinding(scope,id,document.id,0,{kind:'prepared',source:document},current);
 return {id,content:envelope};
}
async function conserveBinding(scope:NoteTransportScope,id:string,logicalId:string,version:number,source:unknown,current:()=>boolean){
 await requirePrivate(scope,'notesMarkdown',logicalId,current);const key=noteMetadataBindingKey(scope,id),previous=await getSnapshot(key),metadata=await getDraft({...scope,type:'notesMarkdown',documentId:logicalId});currentOrThrow(current);
 if(previous&&(previous.accountId!==scope.accountId||previous.spaceId!==scope.spaceId||!sameBinding(previous.value,scope,id)||previous.value.logicalId!==logicalId))throw Error('Cet alias de synchronisation appartient à une autre note. Les deux originaux restent conservés.');
 if(metadata&&(!record(metadata.content)||metadata.content.id!==logicalId))throw Error('L’original local ne correspond pas à la note transmise.');
 const old=previous?.value as NoteMetadataBinding|undefined;
 if((source as {kind?:unknown})?.kind==='prepared'&&old?.deletedVersion!==undefined&&old.deletedVersion>=old.confirmedVersion)throw Error('Cette note a été supprimée sur le serveur. Son original local reste conservé.');
 const value:NoteMetadataBinding={schema:1,kind:'paper-metadata-transport',...scope,logicalId,documentId:id,graphId:notebookDocumentId(logicalId),confirmedVersion:Math.max(version,old?.confirmedVersion??0),...(old?.deletedVersion?{deletedVersion:old.deletedVersion}:{})};
 const proofKey=`${key}|proof-${notebookIdentityDigest(JSON.stringify(source))}`,oldProof=await getSnapshot(proofKey);currentOrThrow(current);
 const proof:Snapshot={key:proofKey,...scope,value:{schema:1,kind:'paper-metadata-transport-proof',binding:value,source,...(!previous&&metadata?{originalDraft:metadata}:{})}};
 if(oldProof&&(oldProof.accountId!==scope.accountId||oldProof.spaceId!==scope.spaceId||JSON.stringify((oldProof.value as {source?:unknown})?.source)!==JSON.stringify(source)))throw Error('Le reçu original de cette note est incompatible.');
 const snapshots:Snapshot[]=[];if(JSON.stringify(previous?.value)!==JSON.stringify(value))snapshots.push({key,...scope,value});if(!oldProof)snapshots.push(proof);
 if(!snapshots.length)return;
 // The old local version belongs to an unpublishable/retired transport key.
 // Preserve that exact original in the receipt, then start the alias at base0.
 // Pending mutation originals are retained; their wire base is journaled below.
 const rebased=!previous&&metadata?[{...metadata,baseVersion:0}]:[];
 await commitNotebookTransfer({target:scope,privateTransport:{type:'notesMarkdown',documentId:logicalId},sources:[],drafts:rebased,blobs:[],snapshots,draftChecks:[{identity:{...scope,type:'notesMarkdown',documentId:logicalId},expected:metadata}],blobChecks:[],snapshotChecks:[{key,expected:previous},{key:proofKey,expected:oldProof}]},current);
}
/** A durable mutation keeps its first network base and payload across a lost
 * acknowledgement; confirmed aliases must not change an idempotent retry. */
export async function prepareNoteMetadataMutation(document:{type:string;id:string;content:unknown},version:number,mutationId:string,scope:NoteTransportScope,current:()=>boolean):Promise<{id:string;content:unknown;baseVersion:number}>{
 scope=cleanScope(scope);
 if(!Number.isSafeInteger(version)||version<0||!mutationId||mutationId.length>128)throw Error('Le journal de cette mutation est invalide. Son original reste conservé.');
 const prepared=await prepareNoteMetadataTransport(document,scope,current);if(document.type!=='notesMarkdown'||prepared.id===document.id)return {...prepared,baseVersion:version};
 const bindingKey=noteMetadataBindingKey(scope,prepared.id),binding=await getSnapshot(bindingKey),key=`${bindingKey}|mutation-${notebookIdentityDigest(mutationId)}`,previous=await getSnapshot(key);currentOrThrow(current);
 if(!binding||!sameBinding(binding.value,scope,prepared.id)||binding.value.logicalId!==document.id)throw Error('L’alias de la mutation n’est pas conservé dans le compte courant.');
 if(previous){const value=previous.value as {mutationId?:unknown;originalVersion?:unknown;wireVersion?:unknown;source?:unknown;content?:unknown};if(previous.accountId!==scope.accountId||previous.spaceId!==scope.spaceId||value.mutationId!==mutationId||value.originalVersion!==version||JSON.stringify(value.source)!==JSON.stringify(document)||JSON.stringify(value.content)!==JSON.stringify(prepared.content)||!Number.isSafeInteger(value.wireVersion))throw Error('Cette mutation possède déjà un autre original. Aucun reçu n’est remplacé.');return {...prepared,baseVersion:Number(value.wireVersion)};}
 const wireVersion=Math.min(version,binding.value.confirmedVersion),snapshot:Snapshot={key,...scope,value:{schema:1,kind:'paper-metadata-transport-mutation',mutationId,originalVersion:version,wireVersion,source:document,content:prepared.content}};
 await commitNotebookTransfer({target:scope,privateTransport:{type:'notesMarkdown',documentId:document.id},sources:[],drafts:[],blobs:[],snapshots:[snapshot],draftChecks:[],blobChecks:[],snapshotChecks:[{key:bindingKey,expected:binding},{key,expected:previous}]},current);
 return {...prepared,baseVersion:wireVersion};
}
export async function acknowledgeNoteMetadataTransport(document:{type:string;id:string;content:unknown},version:number,scope:NoteTransportScope,current:()=>boolean){
 scope=cleanScope(scope);
 if(document.type!=='notesMarkdown'||noteMetadataTransportId(document.id)===document.id)return;
 if(!Number.isSafeInteger(version)||version<=0)throw Error('Confirmation de métadonnées invalide.');
 await conserveBinding(scope,noteMetadataTransportId(document.id),document.id,version,{kind:'acknowledged',version,source:document},current);
}
async function retainRejected(scope:NoteTransportScope,remote:NoteMetadataRemote,reason:string,current:()=>boolean):Promise<never>{
 const key=`paper-metadata-transport-rejected|${scope.accountId}|${scope.spaceId}|${notebookIdentityDigest(JSON.stringify(remote))}`,previous=await getSnapshot(key);currentOrThrow(current);
 if(!previous)await commitNotebookTransfer({target:scope,privateTransport:{type:remote.document_type,documentId:remote.document_id},sources:[],drafts:[],blobs:[],snapshots:[{key,...scope,value:{schema:1,kind:'paper-metadata-transport-rejected',reason,incoming:remote}}],draftChecks:[],blobChecks:[],snapshotChecks:[{key,expected:previous}]},current);
 throw Error(reason+' La version reçue reste conservée, sans remplacer une autre note.');
}
async function retainRemote(scope:NoteTransportScope,remote:NoteMetadataRemote,kind:string,binding:Snapshot,current:()=>boolean){
 const key=`${binding.key}|${kind}-${notebookIdentityDigest(JSON.stringify(remote))}`,previous=await getSnapshot(key);currentOrThrow(current);
 if(!previous)await commitNotebookTransfer({target:scope,privateTransport:{type:remote.document_type,documentId:remote.document_id},sources:[],drafts:[],blobs:[],snapshots:[{key,...scope,value:{schema:1,kind:'paper-metadata-transport-'+kind,incoming:remote,bindingKey:binding.key}}],draftChecks:[],blobChecks:[],snapshotChecks:[{key,expected:previous},{key:binding.key,expected:binding}]},current);
}
async function retiredSource(scope:NoteTransportScope,remote:NoteMetadataRemote,current:()=>boolean):Promise<boolean>{
 const replacementId=noteMetadataTransportId(remote.document_id);if(replacementId===remote.document_id)return false;
 const replacement=await getSnapshot(noteMetadataBindingKey(scope,replacementId));currentOrThrow(current);if(!replacement)return false;
 if(replacement.accountId!==scope.accountId||replacement.spaceId!==scope.spaceId||!sameBinding(replacement.value,scope,replacementId)||replacement.value.logicalId!==remote.document_id)return retainRejected(scope,remote,'La provenance de cette ancienne identité est incompatible.',current);
 if(replacement.value.confirmedVersion<=0)return false;
 await retainRemote(scope,remote,'retired',replacement,current);return true;
}
async function confirmDeletion(scope:NoteTransportScope,remote:NoteMetadataRemote,binding:Snapshot,current:()=>boolean){
 const old=binding.value as NoteMetadataBinding,value={...old,deletedVersion:Math.max(remote.version,old.deletedVersion??0)},key=`${binding.key}|deletion-${notebookIdentityDigest(JSON.stringify(remote))}`,previous=await getSnapshot(key);currentOrThrow(current);
 const snapshots:Snapshot[]=[{...binding,value}];if(!previous)snapshots.push({key,...scope,value:{schema:1,kind:'paper-metadata-transport-deletion',incoming:remote,bindingKey:binding.key}});
 await commitNotebookTransfer({target:scope,privateTransport:{type:remote.document_type,documentId:remote.document_id},sources:[],drafts:[],blobs:[],snapshots,draftChecks:[],blobChecks:[],snapshotChecks:[{key:binding.key,expected:binding},{key,expected:previous}]},current);
}
/** Only a complete scoped envelope, or a previously confirmed binding for a
 * tombstone, may translate a server alias back to an exact logical identity. */
export async function receiveNoteMetadataTransport<T extends NoteMetadataRemote>(remote:T,scope:NoteTransportScope,current:()=>boolean):Promise<T|null>{
 scope=cleanScope(scope);
 await requirePrivate(scope,remote.document_type,remote.document_id,current,remote.content);if(remote.document_type!=='notesMarkdown')return remote;
 const suppliedSpace=(remote as RemoteDocument&{space_id?:unknown}).space_id;
 if(suppliedSpace!==undefined&&suppliedSpace!==scope.spaceId)return retainRejected(scope,remote,'La note reçue appartient à une autre année.',current);
 if(remote.deleted){
  const row=await getSnapshot(noteMetadataBindingKey(scope,remote.document_id));currentOrThrow(current);
  if(!row){if(await retiredSource(scope,remote,current))return null;if(aliasPattern.test(remote.document_id))return retainRejected(scope,remote,'La suppression ne prouve pas encore à quelle note cet alias appartient.',current);return remote;}
  if(row.accountId!==scope.accountId||row.spaceId!==scope.spaceId||!sameBinding(row.value,scope,remote.document_id)||row.value.confirmedVersion<=0)return retainRejected(scope,remote,'L’alias de cette suppression n’est pas confirmé par le serveur.',current);
  if(!Number.isSafeInteger(remote.version)||remote.version<=0)return retainRejected(scope,remote,'La version de cette suppression est invalide.',current);
  if(remote.version<row.value.confirmedVersion){await retainRemote(scope,remote,'stale-deletion',row,current);return null;}
  await confirmDeletion(scope,remote,row,current);
  return {...remote,document_id:row.value.logicalId};
 }
 if(!record(remote.content))return retainRejected(scope,remote,'Les métadonnées reçues sont illisibles.',current);
 if(remote.content.notebookMetadataTransport!==undefined){
  const value=remote.content as unknown as NoteMetadataEnvelope;
  let valid=false;try{valid=value.notebookMetadataTransport===1&&value.accountId===scope.accountId&&value.spaceId===scope.spaceId&&typeof value.logicalId==='string'&&value.documentId===remote.document_id&&noteMetadataTransportId(value.logicalId)===remote.document_id&&value.logicalId!==remote.document_id&&value.graphId===notebookDocumentId(value.logicalId)&&record(value.note)&&value.note.id===value.logicalId&&Number.isSafeInteger(remote.version)&&remote.version>0;}catch{/* Preserve an invalid identity instead of guessing. */}
  if(!valid)return retainRejected(scope,remote,'L’alias reçu ne correspond pas à l’identité et au compte de cette note.',current);
  const previous=await getSnapshot(noteMetadataBindingKey(scope,remote.document_id));currentOrThrow(current);
  if(previous&&(previous.accountId!==scope.accountId||previous.spaceId!==scope.spaceId||!sameBinding(previous.value,scope,remote.document_id)||previous.value.logicalId!==value.logicalId))return retainRejected(scope,remote,'L’alias reçu possède déjà une autre preuve de propriété.',current);
  if(previous&&sameBinding(previous.value,scope,remote.document_id)&&previous.value.deletedVersion!==undefined&&remote.version<=previous.value.deletedVersion){await retainRemote(scope,remote,'deleted-source',previous,current);return null;}
  await conserveBinding(scope,remote.document_id,value.logicalId,remote.version,{kind:'received',incoming:remote},current);
  return {...remote,document_id:value.logicalId,content:value.note};
 }
 // Historical literal IDs in the reserved namespace are real independent
 // notes. Their plain content must never be mistaken for a hashed alias.
 if(remote.content.id!==undefined&&remote.content.id!==remote.document_id)return retainRejected(scope,remote,'Le nom de transport et l’identité logique de la note sont différents.',current);
 const binding=await getSnapshot(noteMetadataBindingKey(scope,remote.document_id));currentOrThrow(current);
 if(binding)return retainRejected(scope,remote,'Cet identifiant serveur contient une autre note que l’alias enregistré.',current);
 if(await retiredSource(scope,remote,current))return null;
 return remote;
}
export async function noteMetadataDeleteTransportId(logicalId:string,scope:NoteTransportScope,current:()=>boolean):Promise<string>{
 scope=cleanScope(scope);
 const id=noteMetadataTransportId(logicalId);currentOrThrow(current);if(id===logicalId)return id;
 const row=await getSnapshot(noteMetadataBindingKey(scope,id));currentOrThrow(current);
 if(!row||row.accountId!==scope.accountId||row.spaceId!==scope.spaceId||!sameBinding(row.value,scope,id)||row.value.logicalId!==logicalId||row.value.confirmedVersion<=0)throw Error('La suppression attend la confirmation de l’identité serveur de cette note.');
 return id;
}
/** Shared adapter used by active/inactive native years. Its journals and
 * conflict keys continue to use logical IDs; only network paths are aliases. */
export function notebookMetadataSyncTransport(transport:SyncTransport,scope:NoteTransportScope,current:()=>boolean):SyncTransport{
 scope=cleanScope(scope);
 return {
  changes:async cursor=>{const page=await transport.changes(cursor),items:RemoteDocument[]=[];currentOrThrow(current);for(const item of page.items){const original=structuredClone(item);try{await requirePrivate(scope,item.document_type,item.document_id,current,item.content);const received=await receiveNoteMetadataTransport(item,scope,current);if(received){await requirePrivate(scope,received.document_type,received.document_id,current,received.content);items.push(received);}}catch(error){if(!(error instanceof PrivateNotebookBlockedError))throw error;await quarantinePrivateNotebookChange(scope,original,current);}}return {...page,items};},
  put:async(document,version,mutationId)=>{await requirePrivate(scope,document.type,document.id,current,document.content);const prepared=await prepareNoteMetadataMutation(document,version,mutationId,scope,current);await requirePrivate(scope,document.type,document.id,current,document.content);const result=await transport.put({...document,id:prepared.id,content:prepared.content} as SyncDocument,prepared.baseVersion,mutationId);await requirePrivate(scope,document.type,document.id,current,document.content);await acknowledgeNoteMetadataTransport(document,result.version,scope,current);await requirePrivate(scope,document.type,document.id,current,document.content);return result;},
  remove:async(type,id,version,mutationId)=>{await requirePrivate(scope,type,id,current);const transportId=type==='notesMarkdown'?await noteMetadataDeleteTransportId(id,scope,current):id;await requirePrivate(scope,type,id,current);const result=await transport.remove(type,transportId,version,mutationId);await requirePrivate(scope,type,id,current);return result;}
 };
}
