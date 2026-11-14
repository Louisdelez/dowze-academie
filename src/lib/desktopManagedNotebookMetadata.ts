/** Explicit Desktop DeviceCache -> managed metadata mirror. DeviceCache is
 * never written. Only the notebook DB pointer/history/row commit atomically;
 * durable source reads before/after do not claim inter-database atomicity. */
import {appStorage,type DeviceCache} from './appStorage.ts';
import {isPersistedSubjectNotesStore} from './subjectNotes.ts';
import type {SubjectNoteDocument} from '../types.ts';
import type {ManagedApplicationMetadata,ManagedApplicationPrivateMetadataPreparation} from './notebookManagedApplication.ts';
import {projectManagedSources} from '../../pwa/src/managedNotebookProjection.ts';
import {paperMarkdown} from './paperArchiveMetadata.ts';
import {paperLegacyReceiptKey,type PaperLegacyBridgeReceipt} from './paperLegacyBridge.ts';
import {notebookDocumentId,isPaperDocument} from './notebookDocument.ts';
import {hasPaperCollaboration,verifyPaperCollaboration} from './paperCollaboration.ts';
import {noteMetadataTransportId} from './noteMetadataIdentity.ts';
import {managedLocalJsonEquals} from '../../pwa/src/managedNotebookJson.ts';
import {ManagedClientError,managedCurrent,assertManagedCurrent,managedUuid,freezeManaged,verifyManagedAdmission,validManagedAdmissionReceipt,verifyManagedPreparedWrite,validManagedWriteReceipt,identityMatchesTicket,parseManagedReply} from '../../pwa/src/managedNotebookClient.ts';
import {projectNotebookMetadata} from './notebookMetadataProjection.ts';
import {encodeManagedSource,parseManagedSourceJson} from '../../pwa/src/managedNotebookProtocol.ts';
import {managedBindingKey,managedResourceKey,managedIncarnationKey,managedOperationKey,type ManagedStoreIdentity,type ManagedAdmissionIntent,type ManagedPendingWrite} from '../../pwa/src/managedNotebookStore.ts';
import {managedLifecycleOperationKey,type ManagedLifecycleJournal} from '../../pwa/src/managedNotebookTrashTransport.ts';
import {verifyPreparedManagedLifecycle,validManagedLifecycleReceipt} from '../../pwa/src/managedNotebookLifecycle.ts';
import {notebookTrashHeadKey,notebookTrashOperationKey,validNotebookTrashHead,validNotebookTrashOperation,validNotebookTrashServerReceipt,type NotebookTrashHead,type NotebookTrashOperation} from './notebookTrash.ts';
import {commitNotebookTransfer,NotebookTransferChangedError,notebookDeletionKey,type Draft,type Snapshot} from '../../pwa/src/storage.ts';

type Scope={readonly accountId:string;readonly spaceId:string};
type Cache=Pick<DeviceCache,'readCurrentItem'|'flush'|'snapshot'>&Partial<Pick<DeviceCache,'itemSnapshot'>>;
export interface DesktopManagedNotebookMetadataCapture extends ManagedApplicationMetadata {readonly noteId:string}
export interface DesktopManagedNotebookMetadataOptions {
 readonly scope:Scope;readonly notesKey:string;readonly sourceRef:object;readonly currentSource:()=>unknown;
 readonly currentNote:(noteId:string)=>Readonly<SubjectNoteDocument>|undefined;
 readonly openDatabase:()=>Promise<IDBDatabase>;readonly cache?:Cache;
 readonly events?:Pick<EventTarget,'addEventListener'|'removeEventListener'>;
}
interface Pointer {
 readonly schema:1;readonly kind:'desktop-managed-notebook-metadata-pointer';readonly identity:ManagedStoreIdentity;
 readonly serverKey:string;readonly resourceId:string;readonly incarnation:string;readonly notesKey:string;
 readonly revision:number;readonly captureNonce:string;readonly sourceKey:string;readonly sourceSha256:string;readonly row:Draft;
}
interface Rows {readonly snapshots:Map<string,Snapshot|undefined>;readonly canonical:Draft|undefined;readonly metadata:Draft|undefined}
interface Held {readonly noteId:string;readonly nonce:string;readonly sourceSha256:string;readonly bindingHeader:string|undefined;readonly current:()=>boolean;readonly capture:DesktopManagedNotebookMetadataCapture}
const changed=()=>new ManagedClientError('source-changed','Les informations de cette note ont changé. Les deux sources restent conservées.');
const unavailable=(message:string)=>new ManagedClientError('unavailable',message);
const invalid=()=>new ManagedClientError('invalid-response','La provenance enregistrée de cette note doit être vérifiée. Aucun original n’a été remplacé.');
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const exact=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const owned=(value:{accountId:string;spaceId:string},scope:Scope)=>value.accountId===scope.accountId&&value.spaceId===scope.spaceId;
const rowState=(row:Draft)=>{const value={...row} as Draft&{key?:unknown};delete value.key;return value;};
const sameRow=(a:Draft,b:Draft)=>exact(rowState(a),rowState(b));
const key=(scope:Scope,type:string,id:string)=>[scope.accountId,scope.spaceId,type,id].join('|');
export const desktopManagedMetadataPointerKey=(scope:Scope,notesKey:string,noteId:string)=>'desktop-managed-metadata-pointer|'+JSON.stringify([scope.accountId,scope.spaceId,notesKey,noteId]);
export const desktopManagedMetadataHistoryKey=(scope:Scope,notesKey:string,noteId:string,nonce:string)=>'desktop-managed-metadata-history|'+JSON.stringify([scope.accountId,scope.spaceId,notesKey,noteId,nonce]);
function header(row:Snapshot|undefined):string|undefined {if(!row)return;const b=(row.value as ManagedAdmissionIntent|undefined)?.binding;if(!b)throw invalid();return JSON.stringify({identity:b.identity,serverKey:b.serverKey,resourceId:b.resourceId,incarnation:b.incarnation,admissionKey:b.admissionKey,phase:b.phase});}
function cleanDraft(row:Draft|undefined,scope:Scope,noteId:string,canonical=false):Draft {
 if(!row||!owned(row,scope)||row.type!==(canonical?'whiteboard':'notesMarkdown')||row.documentId!==(canonical?notebookDocumentId(noteId):noteId)||row.staged||row.identityAlias||row.syncState==='conflict'||!Number.isSafeInteger(row.baseVersion)||row.baseVersion<1||typeof row.title!=='string'||!Number.isFinite(row.updatedAt))throw changed();
 if(canonical){if(!isPaperDocument(row.content)||row.content.noteId!==noteId||!hasPaperCollaboration(row.content))throw changed();verifyPaperCollaboration(row.content);}else if(!object(row.content)||row.content.id!==noteId)throw changed();
 return row;
}
export function createDesktopManagedNotebookMetadataBridge(input:DesktopManagedNotebookMetadataOptions){
 const scope=Object.freeze({accountId:input.scope.accountId,spaceId:input.scope.spaceId}),notesKey=input.notesKey,cache=input.cache??appStorage,sourceRef=input.sourceRef,currentSource=input.currentSource,currentNote=input.currentNote,openDatabase=input.openDatabase;
 if(!managedUuid(scope.accountId)||!scope.spaceId||!notesKey||notesKey.length>1000||!sourceRef||typeof sourceRef!=='object')throw invalid();
 let disposed=false,busy=false,eventEpoch=0;const leases=new Map<string,Held>(),known=new WeakMap<ManagedApplicationMetadata,Held>();
 const events=input.events??(typeof globalThis.addEventListener==='function'?globalThis:undefined);
 const otherWindow=()=>{eventEpoch++;};events?.addEventListener('dowze:cache-other-window',otherWindow);
 const active=(current:()=>boolean)=>managedCurrent(()=>!disposed&&current()===true&&currentSource()===sourceRef);
 async function durable(noteId:string,current:()=>boolean){
  assertManagedCurrent(current);const raw=await cache.readCurrentItem(notesKey);assertManagedCurrent(current);let value:unknown;try{value=raw===null?null:JSON.parse(raw);}catch{throw invalid();}
  if(!isPersistedSubjectNotesStore(value)||value.schemaVersion!==2)throw unavailable('Les métadonnées persistées de cette note doivent être au format courant avant cette opération. Leur original reste conservé.');
  const note=value.documents.find(row=>row.id===noteId);if(!note)throw changed();return note;
 }
 async function rows(noteId:string,current:()=>boolean,privatePreparation=false):Promise<Rows>{
  assertManagedCurrent(current);const db=await openDatabase();if(!current()){db.close();throw changed();}
  if(db.name!=='dowze-academie-pwa'||db.version!==3||!['drafts','snapshots'].every(name=>db.objectStoreNames.contains(name))){db.close();throw invalid();}
  return new Promise<Rows>((resolve,reject)=>{let tx:IDBTransaction;try{tx=db.transaction(['drafts','snapshots'],'readonly');}catch(error){db.close();reject(error);return;}
   let failure:unknown;const snapshots=new Map<string,Snapshot|undefined>();let canonical:Draft|undefined,metadata:Draft|undefined;
   const abort=(error:unknown)=>{failure??=error;try{tx.abort();}catch{}};
   const read=(name:string,after?:(row:Snapshot|undefined)=>void)=>{if(snapshots.has(name))return; snapshots.set(name,undefined);const request=tx.objectStore('snapshots').get(name);request.onsuccess=()=>{try{assertManagedCurrent(current);const row=request.result as Snapshot|undefined;if(row&&(!owned(row,scope)||row.key!==name))throw invalid();snapshots.set(name,row);after?.(row);}catch(error){abort(error);}};};
   if(privatePreparation){read(paperLegacyReceiptKey(scope,noteId));read(notebookDeletionKey({...scope,type:'whiteboard',documentId:notebookDocumentId(noteId)}));}
   read(managedBindingKey({...scope,noteId}),row=>{const b=(row?.value as ManagedAdmissionIntent|undefined)?.binding;if(!b)return;if(typeof b.serverKey!=='string'||!b.serverKey||b.serverKey.length>500||!managedUuid(b.resourceId)||!managedUuid(b.incarnation)||b.resourceId===b.incarnation)throw invalid();read(managedResourceKey(b.serverKey,scope.accountId,b.resourceId));read(managedIncarnationKey(b.serverKey,scope.accountId,b.incarnation));if(b.lastWriteKey!==undefined){if(!/^[\x21-\x7e]{1,128}$/.test(b.lastWriteKey))throw invalid();read(managedOperationKey(b.serverKey,scope.accountId,b.lastWriteKey));}});
   read(desktopManagedMetadataPointerKey(scope,notesKey,noteId),row=>{const pointer=row?.value as Pointer|undefined;if(pointer){if(!managedUuid(pointer.captureNonce))throw invalid();read(desktopManagedMetadataHistoryKey(scope,notesKey,noteId,pointer.captureNonce));}});
   read(notebookTrashHeadKey(scope,noteId),row=>{const h=row?.value as NotebookTrashHead|undefined;if(h?.server){if(!validNotebookTrashHead(h,scope,noteId)||!managedUuid(h.server.operationId))throw invalid();const binding=()=>{const b=(snapshots.get(managedBindingKey({...scope,noteId}))?.value as ManagedAdmissionIntent|undefined)?.binding;if(!b)throw invalid();read(managedLifecycleOperationKey(scope,b.serverKey,b.resourceId,b.incarnation,h.server!.operationId));read(notebookTrashOperationKey(scope,noteId,h.server!.operationId));};binding();}});
   for(const isCanonical of [true,false]){const request=tx.objectStore('drafts').get(key(scope,isCanonical?'whiteboard':'notesMarkdown',isCanonical?notebookDocumentId(noteId):noteId));request.onsuccess=()=>{try{assertManagedCurrent(current);if(isCanonical)canonical=request.result;else metadata=request.result;}catch(error){abort(error);}};}
   tx.onerror=event=>{failure??=(event.target as IDBRequest|null)?.error??tx.error;};tx.onabort=()=>{db.close();reject(failure??tx.error??changed());};tx.oncomplete=()=>{db.close();if(failure)reject(failure);else resolve({snapshots,canonical,metadata});};
  });
 }
 async function binding(state:Rows,noteId:string,current:()=>boolean){
  const row=state.snapshots.get(managedBindingKey({...scope,noteId})),intent=row?.value as ManagedAdmissionIntent|undefined,b=intent?.binding,id=b?.identity;
  if(!row||!intent||!b||b.schema!==1||b.kind!=='managed-notebook-binding'||b.phase!=='managed'||!id||!owned(id,scope)||id.noteId!==noteId||id.canonicalDocumentId!==notebookDocumentId(noteId)||id.metadataDocumentId!==noteMetadataTransportId(noteId)||typeof id.lineage!=='string'||!id.lineage||!intent.prepared)throw changed();
  const prepared=await verifyManagedAdmission(intent.prepared,current);assertManagedCurrent(current);
  if(!managedLocalJsonEquals(prepared.proof.identity,id)||prepared.actorAccountId!==scope.accountId||prepared.resourceId!==b.resourceId||prepared.incarnation!==b.incarnation||prepared.idempotencyKey!==b.admissionKey||!validManagedAdmissionReceipt(b.admissionReceipt,prepared))throw invalid();
  const reservation={bindingKey:row.key,identity:id,resourceId:b.resourceId,incarnation:b.incarnation};
  for(const name of [managedResourceKey(b.serverKey,scope.accountId,b.resourceId),managedIncarnationKey(b.serverKey,scope.accountId,b.incarnation)])if(!managedLocalJsonEquals(state.snapshots.get(name)?.value,reservation))throw changed();
  const canonical=cleanDraft(state.canonical,scope,noteId,true);if(!isPaperDocument(canonical.content)||canonical.content.collaboration?.lineage!==id.lineage)throw changed();
  return {intent,b,id,canonical};
 }
 async function acceptedHeaderAdvance(row:Draft,previous:Draft,state:Rows,b:ManagedAdmissionIntent['binding'],id:ManagedStoreIdentity,current:()=>boolean){
  const strip=(value:Draft)=>{const {baseVersion:base,syncState:status,...rest}=rowState(value);return rest;};
  if(row.baseVersion<previous.baseVersion||row.syncState!=='synced'||!exact(strip(row),strip(previous)))throw changed();
  const source=await encodeManagedSource(row.content,current);assertManagedCurrent(current);
  if(b.lastWriteKey&&b.lastWriteReceipt){const op=state.snapshots.get(managedOperationKey(b.serverKey,scope.accountId,b.lastWriteKey))?.value as ManagedPendingWrite|undefined;
   if(op&&op.kind==='managed-notebook-write'&&op.schema===1&&op.serverKey===b.serverKey&&managedLocalJsonEquals(op.identity,id)&&op.status==='acknowledged'&&op.prepared.actorAccountId===scope.accountId&&op.prepared.idempotencyKey===b.lastWriteKey&&op.prepared.resourceId===b.resourceId&&op.ticket.incarnation===b.incarnation&&op.ticket.owner_account_id===scope.accountId&&identityMatchesTicket(id,op.ticket)){
    await verifyManagedPreparedWrite(op.prepared,op.ticket,current,{source_bytes:16*1024*1024,packet_bytes:4*16*1024*1024+65_536,admission_packet_bytes:65_536,blob_bytes:32*1024*1024,blob_references:1000});assertManagedCurrent(current);
    if(validManagedWriteReceipt(op.receipt,op)&&managedLocalJsonEquals(op.receipt,b.lastWriteReceipt)&&op.receipt.metadata_version===row.baseVersion&&op.prepared.metadata.sha256===source.sha256&&managedLocalJsonEquals(projectNotebookMetadata(id,parseManagedSourceJson(op.prepared.metadata.source_json)),row.content))return;
   }
  }
  const head=state.snapshots.get(notebookTrashHeadKey(scope,id.noteId))?.value as NotebookTrashHead|undefined,server=head?.server;
  if(head?.state==='restored'&&server?.state==='restored'&&server.operationId===head.operationIds.at(-1)&&server.deletionId===head.deletionId&&validNotebookTrashHead(head,scope,id.noteId)){
   const journal=state.snapshots.get(managedLifecycleOperationKey(scope,b.serverKey,b.resourceId,b.incarnation,server.operationId))?.value as ManagedLifecycleJournal|undefined,operation=state.snapshots.get(notebookTrashOperationKey(scope,id.noteId,server.operationId))?.value as NotebookTrashOperation|undefined;
   if(journal?.status==='received'&&journal.kind==='managed-notebook-lifecycle'&&managedLocalJsonEquals(journal.identity,id)&&journal.prepared.action==='restore'&&journal.prepared.key===server.operationId&&journal.prepared.resourceId===b.resourceId&&journal.prepared.incarnation===b.incarnation&&typeof journal.rawReceipt==='string'&&validNotebookTrashOperation(operation,scope,id.noteId)&&operation.status==='acknowledged'&&journal.operation.id===operation.id&&journal.sourceKey===operation.sourceKey&&managedLocalJsonEquals({...operation,status:'pending',receipt:undefined},journal.operation)&&validNotebookTrashServerReceipt(server,operation)&&managedLocalJsonEquals(operation.receipt,server)){
    const prepared=await verifyPreparedManagedLifecycle(journal.prepared,current);assertManagedCurrent(current);const raw=parseManagedReply(journal.rawReceipt,65_536);
    if(validManagedLifecycleReceipt(journal.receipt,prepared)&&validManagedLifecycleReceipt(raw,prepared)&&managedLocalJsonEquals(raw,journal.receipt)&&journal.receipt.metadata_version===row.baseVersion&&server.metadataVersion===row.baseVersion&&server.resourceVersion===journal.receipt.resource_version&&managedLocalJsonEquals(projectNotebookMetadata(id,parseManagedSourceJson(prepared.metadata.source_json)),row.content))return;
   }
  }
  throw changed();
 }
 return Object.freeze({
  async capture(noteId:string,currentInput:()=>boolean):Promise<DesktopManagedNotebookMetadataCapture>{
   const current=active(currentInput);assertManagedCurrent(current);if(!noteId||noteId.length>200)throw unavailable('Cette identité de note dépasse le format disponible.');
   await cache.flush();assertManagedCurrent(current);const sourceSnapshot=()=>cache.itemSnapshot?.(notesKey)??cache.snapshot();const ref=currentNote(noteId),revision=sourceSnapshot(),observedEvent=eventEpoch;if(!ref||ref.id!==noteId)throw changed();const refJSON=JSON.stringify(ref);
   const live=managedCurrent(()=>current()&&currentNote(noteId)===ref&&JSON.stringify(ref)===refJSON&&sourceSnapshot()===revision&&eventEpoch===observedEvent);
   const note=await durable(noteId,live);assertManagedCurrent(live);if(!managedLocalJsonEquals(note,ref))throw changed();const content=structuredClone({...note}),wire=await encodeManagedSource(content,live);assertManagedCurrent(live);const capturedRows=await rows(noteId,live);assertManagedCurrent(live);const nonce=crypto.randomUUID(),sourceKey='desktop-managed-metadata-source|'+JSON.stringify([scope.accountId,scope.spaceId,notesKey,noteId,nonce]);let held:Held;
   const capture:DesktopManagedNotebookMetadataCapture=freezeManaged({noteId,sourceKey,content,current:managedCurrent(()=>live()&&leases.get(noteId)===held)});
   held={noteId,nonce,sourceSha256:wire.sha256,bindingHeader:header(capturedRows.snapshots.get(managedBindingKey({...scope,noteId}))),current:capture.current,capture};leases.set(noteId,held);known.set(capture,held);return capture;
  },
  async preparePrivate(capture:ManagedApplicationMetadata,preparation:ManagedApplicationPrivateMetadataPreparation,currentInput:()=>boolean):Promise<Draft>{
   const held=known.get(capture);if(!held||held.capture!==capture)throw invalid();const current=active(()=>currentInput()&&held.current());assertManagedCurrent(current);if(busy)throw unavailable('Un miroir de métadonnées attend sa confirmation.');busy=true;
   try{
    const id=preparation.identity;if(!owned(id,scope)||id.noteId!==held.noteId||id.canonicalDocumentId!==notebookDocumentId(held.noteId)||id.metadataDocumentId!==noteMetadataTransportId(held.noteId)||held.bindingHeader!==undefined)throw changed();
    const durableNote=await durable(held.noteId,current);assertManagedCurrent(current);if(!managedLocalJsonEquals(durableNote,capture.content))throw changed();
    // Reverify UTF8/SHA, compressed originals and the whole private server pair;
    // a supplied projection or a UI Saved label is never durable evidence.
    const projected=await projectManagedSources(id,preparation.source,current);assertManagedCurrent(current);const proof=preparation.source.proof;
    if(proof.actorAccountId!==scope.accountId||!managedLocalJsonEquals(capture.content,projected.metadata)||!managedLocalJsonEquals(preparation.canonical.content,projected.canonical)||preparation.canonical.baseVersion!==proof.canonical.version)throw changed();
    const state=await rows(held.noteId,current,true);assertManagedCurrent(current);const canonical=cleanDraft(state.canonical,scope,held.noteId,true),row=state.metadata;
    if(canonical.syncState!=='synced'||!exact(canonical,preparation.canonical)||!row||!exact(row,preparation.metadata)||!owned(row,scope)||row.type!=='notesMarkdown'||row.documentId!==held.noteId||row.staged||row.identityAlias||row.syncState!=='local'||row.conflict||row.paperDependency!==canonical.documentId||!Number.isSafeInteger(row.baseVersion)||row.baseVersion<1||row.baseVersion>proof.metadata.version||!object(row.content)||row.content.id!==held.noteId)throw changed();
    const bindingKey=managedBindingKey(id),receiptKey=paperLegacyReceiptKey(scope,held.noteId),receiptRow=state.snapshots.get(receiptKey),receipt=receiptRow?.value as PaperLegacyBridgeReceipt|undefined,mirror=receipt?.mirror;
    if(state.snapshots.get(bindingKey)||state.snapshots.get(notebookTrashHeadKey(scope,held.noteId))||state.snapshots.get(notebookDeletionKey(canonical))||state.snapshots.get(desktopManagedMetadataPointerKey(scope,notesKey,held.noteId)))throw changed();
    const desired=paperMarkdown(projected.canonical);
    if(typeof capture.content.markdown!=='string'||desired!==capture.content.markdown||!receiptRow||!receipt||receipt.schema!==1||receipt.kind!=='paper-legacy-observation'||receipt.noteId!==held.noteId||receipt.documentId!==canonical.documentId||!object(receipt.observed)||receipt.observed.markdown!==desired||!exact(receipt.sourceMetadata,row)||!Number.isSafeInteger(receipt.paperRevision)||receipt.paperRevision<0||receipt.paperRevision>projected.canonical.revision||!Number.isFinite(Date.parse(receipt.observedAt))||!mirror||mirror.status!=='published'||!managedUuid(mirror.id)||typeof mirror.expectedMarkdown!=='string'||mirror.desiredMarkdown!==desired||!Number.isSafeInteger(mirror.paperRevision)||mirror.paperRevision<1||mirror.paperRevision>projected.canonical.revision||!Number.isFinite(Date.parse(mirror.stagedAt))||typeof mirror.publishedAt!=='string'||!Number.isFinite(Date.parse(mirror.publishedAt)))throw changed();
    const updatedAt=Date.parse(durableNote.updatedAt);if(!Number.isFinite(updatedAt)||typeof durableNote.title!=='string')throw invalid();
    const next:Draft={...row,title:durableNote.title,content:structuredClone(projected.metadata),baseVersion:proof.metadata.version,updatedAt,syncState:'synced'},nextReceipt:Snapshot={...receiptRow,value:{...receipt,sourceMetadata:structuredClone(next)}};
    const historyKey='desktop-private-metadata-reconciliation|'+JSON.stringify([scope.accountId,scope.spaceId,notesKey,held.noteId,held.nonce]),history:Snapshot={...scope,key:historyKey,value:{schema:1,kind:'desktop-private-metadata-reconciliation',noteId:held.noteId,sourceKey:capture.sourceKey,sourceSha256:held.sourceSha256,sourceContent:structuredClone(capture.content),before:structuredClone(row),beforeReceipt:structuredClone(receiptRow),after:structuredClone(next),afterReceipt:structuredClone(nextReceipt),proof:structuredClone(proof),projection:structuredClone(projected.projection)}};
    const confirmed=await durable(held.noteId,current);assertManagedCurrent(current);if(!managedLocalJsonEquals(confirmed,capture.content))throw changed();
    await commitNotebookTransfer({target:scope,sources:[],privateTransport:{type:'notesMarkdown',documentId:held.noteId},drafts:[next],blobs:[],snapshots:[nextReceipt,history],draftChecks:[{identity:canonical,expected:canonical},{identity:row,expected:row}],blobChecks:[],snapshotChecks:[...[...state.snapshots].map(([key,expected])=>({key,expected})),{key:historyKey,expected:undefined}]},current);assertManagedCurrent(current);
    // DeviceCache is authoritative and untouched. If its own DB changes after
    // the IDB CAS, refuse publication and retain history; never overwrite it back.
    const after=await durable(held.noteId,current);assertManagedCurrent(current);if(!managedLocalJsonEquals(after,capture.content))throw changed();return freezeManaged(structuredClone(next));
   }catch(error){if(leases.get(held.noteId)===held)leases.delete(held.noteId);if(error instanceof NotebookTransferChangedError)throw changed();throw error;}finally{busy=false;}
  },
  async mirror(capture:ManagedApplicationMetadata,currentInput:()=>boolean):Promise<Draft>{
   const held=known.get(capture);if(!held||held.capture!==capture)throw invalid();const current=active(()=>currentInput()&&held.current());assertManagedCurrent(current);if(busy)throw unavailable('Un miroir de métadonnées attend sa confirmation.');busy=true;
   try{
    const note=await durable(held.noteId,current);assertManagedCurrent(current);if(!managedLocalJsonEquals(note,capture.content))throw changed();const state=await rows(held.noteId,current);assertManagedCurrent(current);if(held.bindingHeader!==header(state.snapshots.get(managedBindingKey({...scope,noteId:held.noteId}))))throw changed();
    const {intent,b,id,canonical}=await binding(state,held.noteId,current);assertManagedCurrent(current);const row=cleanDraft(state.metadata,scope,held.noteId),pointerKey=desktopManagedMetadataPointerKey(scope,notesKey,held.noteId),oldPointer=state.snapshots.get(pointerKey),pointer=oldPointer?.value as Pointer|undefined;
    if(pointer&&(pointer.schema!==1||pointer.kind!=='desktop-managed-notebook-metadata-pointer'||!managedLocalJsonEquals(pointer.identity,id)||pointer.notesKey!==notesKey||pointer.serverKey!==b.serverKey||pointer.resourceId!==b.resourceId||pointer.incarnation!==b.incarnation||!Number.isSafeInteger(pointer.revision)||pointer.revision<1||!managedUuid(pointer.captureNonce)||pointer.sourceKey!=='desktop-managed-metadata-source|'+JSON.stringify([scope.accountId,scope.spaceId,notesKey,held.noteId,pointer.captureNonce])||typeof pointer.sourceSha256!=='string'||!/^[a-f0-9]{64}$/.test(pointer.sourceSha256)))throw invalid();
    if(pointer){const history=state.snapshots.get(desktopManagedMetadataHistoryKey(scope,notesKey,held.noteId,pointer.captureNonce))?.value;if(!object(history)||history.schema!==1||history.kind!=='desktop-managed-notebook-metadata-history'||!managedLocalJsonEquals(history.identity,id)||history.serverKey!==b.serverKey||history.resourceId!==b.resourceId||history.incarnation!==b.incarnation||history.notesKey!==notesKey||history.revision!==pointer.revision||history.sourceKey!==pointer.sourceKey||history.captureNonce!==pointer.captureNonce||history.sourceSha256!==pointer.sourceSha256||!object(history.after)||!sameRow(history.after as unknown as Draft,pointer.row)||!managedLocalJsonEquals(history.sourceContent,pointer.row.content))throw invalid();const original=await encodeManagedSource(history.sourceContent,current);assertManagedCurrent(current);if(original.sha256!==pointer.sourceSha256)throw invalid();}
    const previous=cleanDraft(pointer?.row??intent.original?.metadata,scope,held.noteId);if(!sameRow(row,previous))await acceptedHeaderAdvance(row,previous,state,b,id,current);assertManagedCurrent(current);
    if(b.activeWriteKey)throw unavailable('Une publication préparée doit être confirmée avant un nouveau miroir de cette note.');
    const unchanged=managedLocalJsonEquals(row.content,capture.content)&&row.title===note.title;
    if(pointer?.sourceKey===capture.sourceKey&&unchanged){const latest=await durable(held.noteId,current);assertManagedCurrent(current);if(!managedLocalJsonEquals(latest,capture.content))throw changed();return freezeManaged(structuredClone(row));}
    const next:Draft=unchanged?row:{...row,title:note.title,content:structuredClone(capture.content),updatedAt:Date.parse(note.updatedAt),syncState:'local'};
    if(!Number.isFinite(next.updatedAt))throw invalid();const revision=(pointer?.revision??0)+1;if(!Number.isSafeInteger(revision))throw invalid();
    const historyKey=desktopManagedMetadataHistoryKey(scope,notesKey,held.noteId,held.nonce),history=await (async()=>{const db=await openDatabase();try{return await new Promise<Snapshot|undefined>((resolve,reject)=>{const tx=db.transaction('snapshots','readonly'),read=tx.objectStore('snapshots').get(historyKey);let value:Snapshot|undefined;read.onsuccess=()=>{value=read.result;};tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(tx.error??changed());});}finally{db.close();}})();assertManagedCurrent(current);if(history)throw changed();
    const confirmed=await durable(held.noteId,current);assertManagedCurrent(current);if(!managedLocalJsonEquals(confirmed,capture.content))throw changed();
    const value:Pointer={schema:1,kind:'desktop-managed-notebook-metadata-pointer',identity:id,serverKey:b.serverKey,resourceId:b.resourceId,incarnation:b.incarnation,notesKey,revision,captureNonce:held.nonce,sourceKey:capture.sourceKey,sourceSha256:held.sourceSha256,row:structuredClone(next)};
    await commitNotebookTransfer({target:scope,sources:[],drafts:unchanged?[]:[next],blobs:[],snapshots:[{...scope,key:pointerKey,value},{...scope,key:historyKey,value:{schema:1,kind:'desktop-managed-notebook-metadata-history',identity:id,serverKey:b.serverKey,resourceId:b.resourceId,incarnation:b.incarnation,notesKey,revision,sourceKey:capture.sourceKey,captureNonce:held.nonce,sourceSha256:held.sourceSha256,sourceContent:structuredClone(capture.content),previousSourceKey:pointer?.sourceKey??null,before:structuredClone(row),after:structuredClone(next)}}],draftChecks:[{identity:row,expected:row},{identity:canonical,expected:canonical}],blobChecks:[],snapshotChecks:[...[...state.snapshots].map(([key,expected])=>({key,expected})),{key:historyKey,expected:undefined}]},current);assertManagedCurrent(current);
    // This is a second database: a changed durable source after the IDB commit
    // invalidates the lease and returns no publishable result. History remains.
    const after=await durable(held.noteId,current);assertManagedCurrent(current);if(!managedLocalJsonEquals(after,capture.content))throw changed();return freezeManaged(structuredClone(next));
   }catch(error){if(leases.get(held.noteId)===held)leases.delete(held.noteId);if(error instanceof NotebookTransferChangedError)throw changed();throw error;}finally{busy=false;}
  },
  dispose(){disposed=true;leases.clear();events?.removeEventListener('dowze:cache-other-window',otherWindow);},
 });
}
