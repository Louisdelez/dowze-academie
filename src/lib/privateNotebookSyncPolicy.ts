/** Pure, bounded exclusion policy. Readers supply scoped keys and projected
 * headers only: never managed intents, source graphs, history bodies or Blobs. */
import {notebookDocumentId,legacyNotebookDocumentId} from './notebookIdentity.ts';
import {noteBoardId} from './notebook.ts';
import {noteMetadataTransportId} from './noteMetadataIdentity.ts';

export const PRIVATE_NOTEBOOK_SYNC_POLICY_MAX_ENTRIES=10_000;
export interface PrivateNotebookSyncScope {readonly accountId:string;readonly spaceId:string}
export interface PrivateNotebookSyncSnapshotLike extends PrivateNotebookSyncScope {readonly key:string;readonly value:unknown}
export interface PrivateNotebookSyncPolicyInput {
 readonly bindingKeys:readonly string[];
 readonly resources:readonly PrivateNotebookSyncSnapshotLike[];
 readonly trash:readonly PrivateNotebookSyncSnapshotLike[];
 readonly deletionKeys:readonly string[];
 readonly metadataAliases?:readonly PrivateNotebookSyncSnapshotLike[];
}
export interface PrivateNotebookSyncPolicy {
 readonly hasBlockedNotebooks:boolean;
 readonly blockDocument:(type:string,id:string,rawContent?:unknown)=>boolean;
 /** Read/recovery only: canonical server tombstones still block every outgoing operation. */
 readonly blockManagedOrTrashedDocument:(type:string,id:string,rawContent?:unknown)=>boolean;
 readonly hasCanonicalDeletion:(documentId:string)=>boolean;
 readonly blockBlob:(documentId?:string)=>boolean;
}
export type Scope=PrivateNotebookSyncScope;
export type Policy=PrivateNotebookSyncPolicy;
export type SnapshotLike=PrivateNotebookSyncSnapshotLike;
export type PrivateNotebookSnapshotLike=PrivateNotebookSyncSnapshotLike;
export class PrivateNotebookBlockedError extends Error {
 readonly code='private-notebook-blocked' as const;
 constructor(){super('Ce carnet est conservé par son protocole partagé ou sa corbeille. Sa synchronisation privée est suspendue.');this.name='PrivateNotebookBlockedError';}
}
export class PrivateNotebookSyncPolicyError extends Error {
 constructor(){super('La provenance locale des carnets doit être vérifiée avant leur synchronisation privée. Les originaux restent conservés.');this.name='PrivateNotebookSyncPolicyError';}
}
type RecordValue=Record<string,unknown>;
const fail=():never=>{throw new PrivateNotebookSyncPolicyError();};
const record=(value:unknown):value is RecordValue=>!!value&&typeof value==='object'&&!Array.isArray(value);
const text=(value:unknown,max=500):value is string=>typeof value==='string'&&value.length>0&&value.length<=max;
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
function fields(value:unknown,required:readonly string[],optional:readonly string[]=[]):RecordValue {
 if(!record(value)||!required.every(key=>Object.hasOwn(value,key))||Object.keys(value).some(key=>!required.includes(key)&&!optional.includes(key)))return fail();
 return value;
}
function jsonKey(value:unknown,prefix:string,length:number):string[] {
 if(!text(value,2600)||!value.startsWith(prefix))return fail();
 let parts:unknown;try{parts=JSON.parse(value.slice(prefix.length));}catch{return fail();}
 if(!Array.isArray(parts)||parts.length!==length||!parts.every(part=>text(part))||prefix+JSON.stringify(parts)!==value)return fail();
 return parts as string[];
}
const scopeEqual=(value:RecordValue,scope:PrivateNotebookSyncScope)=>value.accountId===scope.accountId&&value.spaceId===scope.spaceId;
function row(value:unknown,scope:PrivateNotebookSyncScope):PrivateNotebookSyncSnapshotLike {
 const result=fields(value,['key','accountId','spaceId','value']);if(!text(result.key,2600)||!scopeEqual(result,scope))return fail();
 return result as unknown as PrivateNotebookSyncSnapshotLike;
}
function canonicalId(value:string):boolean {
 if(value===notebookDocumentId('legacy-whiteboard-main')||/^paper-v3-id2-[a-f0-9]{64}$/.test(value))return true;
 return value.startsWith('paper-v3-note-')&&notebookDocumentId(value.slice('paper-v3-note-'.length))===value;
}

export function buildPrivateNotebookSyncPolicy(scopeInput:PrivateNotebookSyncScope,input:PrivateNotebookSyncPolicyInput):Readonly<PrivateNotebookSyncPolicy> {
 fields(scopeInput,['accountId','spaceId']);fields(input,['bindingKeys','resources','trash','deletionKeys'],['metadataAliases']);
 const scope={accountId:scopeInput.accountId,spaceId:scopeInput.spaceId};
 if(!text(scope.accountId)||!text(scope.spaceId))return fail();
 const arrays=[input.bindingKeys,input.resources,input.trash,input.deletionKeys,input.metadataAliases??[]];
 if(arrays.some(value=>!Array.isArray(value))||arrays.reduce((sum,value)=>sum+value.length,0)>PRIVATE_NOTEBOOK_SYNC_POLICY_MAX_ENTRIES)return fail();
 const canonical=new Set<string>(),metadata=new Set<string>(),logical=new Set<string>(),protectedCanonical=new Set<string>(),protectedMetadata=new Set<string>(),protectedLogical=new Set<string>(),canonicalDeletions=new Set<string>(),bindings=new Map<string,string>(),resourceBindings=new Set<string>(),seenRows=new Set<string>();
 const addNoteTo=(noteId:string,graphs:Set<string>,notes:Set<string>,ids:Set<string>)=>{if(!text(noteId,200))return fail();ids.add(noteId);for(const id of [notebookDocumentId(noteId),legacyNotebookDocumentId(noteId),noteBoardId(noteId),`paper-v3-${noteId}`,noteId])graphs.add(id);notes.add(noteId);notes.add(noteMetadataTransportId(noteId));};
 const addNote=(noteId:string)=>addNoteTo(noteId,canonical,metadata,logical),addProtectedNote=(noteId:string)=>{addNote(noteId);addNoteTo(noteId,protectedCanonical,protectedMetadata,protectedLogical);};
 for(const key of input.bindingKeys){
  const [accountId,spaceId,noteId]=jsonKey(key,'managed-notebook-binding|',3);
  if(accountId!==scope.accountId||spaceId!==scope.spaceId||!text(noteId,200)||bindings.has(key))return fail();bindings.set(key,noteId);
 }
 for(const source of input.resources){
  const item=row(source,scope),[serverKey,accountId,resourceId]=jsonKey(item.key,'managed-notebook-resource|',3),value=fields(item.value,['bindingKey','identity','resourceId','incarnation']);
  const identity=fields(value.identity,['accountId','spaceId','noteId','canonicalDocumentId','metadataDocumentId','lineage']);
  if(!text(serverKey)||accountId!==scope.accountId||!uuid(resourceId)||value.resourceId!==resourceId||!uuid(value.incarnation)||value.incarnation===resourceId||!scopeEqual(identity,scope)||!text(identity.noteId,200)||!text(identity.canonicalDocumentId,128)||!text(identity.metadataDocumentId,128)||!text(identity.lineage,200)||typeof value.bindingKey!=='string'||bindings.get(value.bindingKey)!==identity.noteId||resourceBindings.has(value.bindingKey)||seenRows.has(item.key))return fail();
  resourceBindings.add(value.bindingKey);seenRows.add(item.key);addProtectedNote(identity.noteId);canonical.add(identity.canonicalDocumentId);canonical.add(resourceId);metadata.add(identity.metadataDocumentId);protectedCanonical.add(identity.canonicalDocumentId);protectedCanonical.add(resourceId);protectedMetadata.add(identity.metadataDocumentId);
 }
 if(resourceBindings.size!==bindings.size)return fail();
 for(const source of input.trash){
  const item=row(source,scope),[accountId,spaceId,noteId]=jsonKey(item.key,'notebook-trash-head|',3),value=fields(item.value,['schema','kind','accountId','spaceId','noteId','state','deletionId','latestOperationId'],['server']);
  if(accountId!==scope.accountId||spaceId!==scope.spaceId||!text(noteId,200)||!scopeEqual(value,scope)||value.noteId!==noteId||value.schema!==1||value.kind!=='notebook-trash-head'||value.state!=='trashed'&&value.state!=='restored'||!uuid(value.deletionId)||!uuid(value.latestOperationId)||seenRows.has(item.key))return fail();
  seenRows.add(item.key);let blocked=value.state==='trashed';
  if(value.server!==undefined){const server=fields(value.server,['state','deletionId','operationId']);if(server.state!=='trashed'&&server.state!=='restored'&&server.state!=='expired'||!uuid(server.deletionId)||!uuid(server.operationId))return fail();blocked||=server.state!=='restored'||server.deletionId!==value.deletionId||server.operationId!==value.latestOperationId;}
  // Explicit local restore is permitted when no server trash was attested.
  if(blocked)addProtectedNote(noteId);
 }
 const deletionPrefix=`paper-canonical-deletion|${scope.accountId}|${scope.spaceId}|whiteboard|`;
 for(const key of input.deletionKeys){
  if(!text(key,2600)||!key.startsWith(deletionPrefix)||seenRows.has(key))return fail();const id=key.slice(deletionPrefix.length);if(!canonicalId(id))return fail();seenRows.add(key);canonical.add(id);canonicalDeletions.add(id);
 }
 for(const source of input.metadataAliases??[]){
  const item=row(source,scope),value=fields(item.value,['schema','kind','accountId','spaceId','logicalId','documentId','graphId']);
  if(value.schema!==1||value.kind!=='paper-metadata-transport'||!scopeEqual(value,scope)||!text(value.logicalId,200)||!text(value.documentId,128)||value.documentId!==noteMetadataTransportId(value.logicalId)||value.graphId!==notebookDocumentId(value.logicalId)||item.key!==`paper-metadata-transport|${scope.accountId}|${scope.spaceId}|${value.documentId}`||seenRows.has(item.key))return fail();
  seenRows.add(item.key);if(canonical.has(value.graphId as string)||logical.has(value.logicalId)){addNote(value.logicalId);metadata.add(value.documentId);}if(protectedCanonical.has(value.graphId as string)||protectedLogical.has(value.logicalId)){addProtectedNote(value.logicalId);protectedMetadata.add(value.documentId);}
 }
 const blockFrom=(graphs:Set<string>,notes:Set<string>,ids:Set<string>)=>{
  const blockedNote=(id:unknown)=>text(id,200)&&(ids.has(id)||graphs.has(notebookDocumentId(id))),blockedGraph=(id:unknown)=>typeof id==='string'&&graphs.has(id),blockedMetadata=(id:unknown)=>typeof id==='string'&&(notes.has(id)||blockedNote(id));
  return (type:string,id:string,rawContent?:unknown):boolean=>{
   if(type==='whiteboard')return blockedGraph(id)||record(rawContent)&&(blockedNote(rawContent.noteId));
   if(type!=='notesMarkdown')return false;
   if(blockedMetadata(id))return true;
   if(!record(rawContent))return false;
   return blockedNote(rawContent.id)||blockedNote(rawContent.logicalId)||blockedMetadata(rawContent.documentId)||blockedGraph(rawContent.graphId)||record(rawContent.note)&&blockedNote(rawContent.note.id);
  };
 };
 const blockDocument=blockFrom(canonical,metadata,logical),blockManagedOrTrashedDocument=blockFrom(protectedCanonical,protectedMetadata,protectedLogical);
 const blockedNote=(id:unknown)=>text(id,200)&&(logical.has(id)||canonical.has(notebookDocumentId(id)));
 const hasBlockedNotebooks=canonical.size>0;
 const blockBlob=(documentId?:string)=>!text(documentId)?hasBlockedNotebooks:canonical.has(documentId)||metadata.has(documentId)||blockedNote(documentId);
 const hasCanonicalDeletion=(documentId:string)=>canonicalDeletions.has(documentId);
 return Object.freeze({hasBlockedNotebooks,blockDocument,blockManagedOrTrashedDocument,hasCanonicalDeletion,blockBlob});
}
