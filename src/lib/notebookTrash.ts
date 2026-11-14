/** Local notebook trash lifecycle. Server lifecycle transport is injected: the
 * managed v2 ACTIVE write endpoint is never used as a deletion/restore API. */
import type {Draft,LocalBlob,Mutation,Snapshot} from '../../pwa/src/storage.ts';
import {isPaperDocument,type PaperDocument,notebookDocumentId} from './notebookDocument.ts';
import {verifyPaperCollaboration,hasPaperCollaboration} from './paperCollaboration.ts';
import {amendNotebookLibrary,mergeNotebookLibrary} from './notebookLibraryCollaboration.ts';
import {emptyClassification,isNotebookLibrary,updateNotebookLibrary,type NoteClassification} from './notebookLibrary.ts';

export const NOTEBOOK_TRASH_RETENTION_MS=30*24*60*60*1000;
export interface NotebookTrashScope {readonly accountId:string;readonly spaceId:string}
export interface NotebookTrashIdentity extends NotebookTrashScope {readonly noteId:string;readonly lineage:string}
export interface NotebookTrashFileProof {readonly id:string;readonly documentId:string|undefined;readonly revision:number|undefined;readonly sha256:string;readonly size:number;readonly mediaType:string}
/** This is an adapter contract, NOT a wire DTO or a claim that v2 has these routes. */
export interface NotebookTrashServerReceipt extends NotebookTrashIdentity {
 readonly operationId:string;readonly deletionId:string;readonly state:'trashed'|'restored'|'expired';
 readonly resourceId:string;readonly incarnation:string;readonly resourceVersion:number;
 readonly canonicalVersion:number;readonly metadataVersion:number;
 readonly deletedAt:number;readonly retainUntil:number;readonly observedAt:number;
}
export interface NotebookTrashHead extends NotebookTrashIdentity {
 readonly schema:1;readonly kind:'notebook-trash-head';readonly state:'trashed'|'restored';
 readonly sequence:number;readonly deletionId:string;readonly sourceKey:string;
 readonly localDeletedAt:number;readonly localRetainUntil:number;readonly operationIds:readonly string[];
 readonly server?:NotebookTrashServerReceipt;
}
export interface NotebookTrashSource extends NotebookTrashIdentity {
 readonly schema:1;readonly kind:'notebook-trash-source';readonly deletionId:string;readonly capturedAt:number;
 readonly canonical:Draft;readonly metadata:Draft;readonly classification:NoteClassification;
 readonly canonicalSha256:string;readonly metadataSha256:string;
 readonly files:readonly NotebookTrashFileProof[];readonly mutationIds:readonly string[];
}
export interface NotebookTrashOperation extends NotebookTrashIdentity {
 readonly schema:1;readonly kind:'notebook-trash-operation';readonly id:string;readonly deletionId:string;
 readonly sourceKey:string;readonly sequence:number;readonly intent:'trash'|'restore';readonly createdAt:number;
 readonly status:'pending'|'acknowledged';readonly receipt?:NotebookTrashServerReceipt;
}
export interface NotebookTrashView {
 readonly canonical:Draft|undefined;readonly metadata:Draft|undefined;readonly library:Draft|undefined;
 readonly files:readonly LocalBlob[];readonly mutations:readonly Mutation[];
 readonly head:NotebookTrashHead|undefined;readonly source:NotebookTrashSource|undefined;
 readonly operations:readonly NotebookTrashOperation[];readonly libraryHistory:Snapshot|undefined;
}
export interface NotebookTrashCommit {
 readonly scope:NotebookTrashScope;readonly noteId:string;readonly expected:NotebookTrashView;
 readonly head:NotebookTrashHead;readonly source?:NotebookTrashSource;
 readonly operation:NotebookTrashOperation;readonly library?:Draft;
 readonly history?:Snapshot;
}
export interface NotebookTrashStore {
 read(scope:NotebookTrashScope,noteId:string):Promise<NotebookTrashView>;
 readSource(scope:NotebookTrashScope,noteId:string,key:string):Promise<NotebookTrashSource|undefined>;
 commit(plan:NotebookTrashCommit,current:()=>boolean):Promise<void>;
}
export interface NotebookTrashTransport {
 /** Future authenticated lifecycle adapter, with durable idempotency per id.
  * It must authorize current resource/incarnation/actor before old receipts. */
 publish(operation:Readonly<NotebookTrashOperation>,source:Readonly<NotebookTrashSource>,current:()=>boolean):Promise<NotebookTrashServerReceipt>;
}
export class NotebookTrashError extends Error {
 constructor(readonly code:'source-changed'|'invalid-source'|'invalid-receipt'|'restore-expired'|'transport-unavailable',message:string){super(message);this.name='NotebookTrashError';}
}
const error:(code:NotebookTrashError['code'],message:string)=>never=(code,message)=>{throw new NotebookTrashError(code,message);};
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const text=(value:unknown,max=500):value is string=>typeof value==='string'&&value.length>0&&value.length<=max;
const time=(value:unknown):value is number=>Number.isSafeInteger(value)&&Number(value)>=0&&Number(value)<=8_640_000_000_000_000-NOTEBOOK_TRASH_RETENTION_MS;
const version=(value:unknown):value is number=>Number.isSafeInteger(value)&&Number(value)>0;
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const scopeEqual=(a:NotebookTrashScope,b:NotebookTrashScope)=>a.accountId===b.accountId&&a.spaceId===b.spaceId;
const identityEqual=(a:NotebookTrashIdentity,b:NotebookTrashIdentity)=>scopeEqual(a,b)&&a.noteId===b.noteId&&a.lineage===b.lineage;
const captureScope=(scope:NotebookTrashScope)=>{const captured={accountId:scope.accountId,spaceId:scope.spaceId};if(!text(captured.accountId)||!text(captured.spaceId))error('invalid-source','Le compte ou l’espace de la corbeille est invalide.');return Object.freeze(captured);};
export const notebookTrashHeadKey=(scope:NotebookTrashScope,noteId:string)=>'notebook-trash-head|'+JSON.stringify([scope.accountId,scope.spaceId,noteId]);
export const notebookTrashSourceKey=(identity:NotebookTrashIdentity,deletionId:string)=>'notebook-trash-source|'+JSON.stringify([identity.accountId,identity.spaceId,identity.noteId,identity.lineage,deletionId]);
export const notebookTrashOperationKey=(scope:NotebookTrashScope,noteId:string,id:string)=>'notebook-trash-operation|'+JSON.stringify([scope.accountId,scope.spaceId,noteId,id]);
function guard(current:()=>boolean){let retired=false;return()=>{if(retired)return false;try{if(current()!==true)retired=true;}catch{retired=true;}return !retired;};}
const assertCurrent=(current:()=>boolean)=>{if(!current())error('source-changed','Le compte ou la note a changé. Les originaux de la corbeille restent conservés.');};
async function sha(value:unknown,current:()=>boolean){const bytes=new TextEncoder().encode(JSON.stringify(value));assertCurrent(current);const result=await crypto.subtle.digest('SHA-256',bytes);assertCurrent(current);return Array.from(new Uint8Array(result),byte=>byte.toString(16).padStart(2,'0')).join('');}
function validIdentity(value:NotebookTrashIdentity,scope:NotebookTrashScope,noteId:string){return !!value&&scopeEqual(value,scope)&&value.noteId===noteId&&text(value.lineage,200);}
export function validNotebookTrashServerReceipt(value:unknown,operation:NotebookTrashOperation):value is NotebookTrashServerReceipt {
 const receipt=value as NotebookTrashServerReceipt|undefined;
 return !!receipt&&identityEqual(receipt,operation)&&receipt.operationId===operation.id&&receipt.deletionId===operation.deletionId&&['trashed','restored','expired'].includes(receipt.state)&&text(receipt.resourceId)&&text(receipt.incarnation)&&version(receipt.resourceVersion)&&version(receipt.canonicalVersion)&&version(receipt.metadataVersion)&&time(receipt.deletedAt)&&receipt.retainUntil===receipt.deletedAt+NOTEBOOK_TRASH_RETENTION_MS&&time(receipt.observedAt)&&receipt.observedAt>=receipt.deletedAt&&(receipt.state!=='expired'||receipt.observedAt>=receipt.retainUntil)&&(operation.intent==='trash'?receipt.state!=='restored':receipt.state==='restored');
}
export function validNotebookTrashHead(value:unknown,scope:NotebookTrashScope,noteId:string):value is NotebookTrashHead {
 const head=value as NotebookTrashHead|undefined;
 return !!head&&head.schema===1&&head.kind==='notebook-trash-head'&&validIdentity(head,scope,noteId)&&['trashed','restored'].includes(head.state)&&version(head.sequence)&&uuid(head.deletionId)&&head.sourceKey===notebookTrashSourceKey(head,head.deletionId)&&time(head.localDeletedAt)&&head.localRetainUntil===head.localDeletedAt+NOTEBOOK_TRASH_RETENTION_MS&&Array.isArray(head.operationIds)&&head.operationIds.length>0&&head.operationIds.every(uuid)&&new Set(head.operationIds).size===head.operationIds.length;
}
export function validNotebookTrashOperation(value:unknown,scope:NotebookTrashScope,noteId:string):value is NotebookTrashOperation {
 const op=value as NotebookTrashOperation|undefined;
 return !!op&&op.schema===1&&op.kind==='notebook-trash-operation'&&validIdentity(op,scope,noteId)&&uuid(op.id)&&uuid(op.deletionId)&&op.sourceKey===notebookTrashSourceKey(op,op.deletionId)&&version(op.sequence)&&['trash','restore'].includes(op.intent)&&time(op.createdAt)&&['pending','acknowledged'].includes(op.status)&&(op.status==='acknowledged'?validNotebookTrashServerReceipt(op.receipt,op):op.receipt===undefined);
}
export function validNotebookTrashSource(value:unknown,scope:NotebookTrashScope,noteId:string):value is NotebookTrashSource {
 const source=value as NotebookTrashSource|undefined;if(!source||source.schema!==1||source.kind!=='notebook-trash-source'||!validIdentity(source,scope,noteId)||!uuid(source.deletionId)||!time(source.capturedAt)||!source.canonical||!source.metadata)return false;
 const paper=source.canonical,note=source.metadata,classification=source.classification;
 return scopeEqual(paper,scope)&&paper.type==='whiteboard'&&paper.documentId===notebookDocumentId(noteId)&&isPaperDocument(paper.content)&&paper.content.noteId===noteId&&paper.content.collaboration?.lineage===source.lineage&&scopeEqual(note,scope)&&note.type==='notesMarkdown'&&note.documentId===noteId&&(note.content as{id?:unknown})?.id===noteId&&/^[a-f0-9]{64}$/.test(source.canonicalSha256)&&/^[a-f0-9]{64}$/.test(source.metadataSha256)&&!!classification&&typeof classification.favorite==='boolean'&&(classification.folderId===null||text(classification.folderId,200))&&(classification.deletedAt===null||typeof classification.deletedAt==='string'&&Number.isFinite(Date.parse(classification.deletedAt)))&&(classification.cover===undefined||!!classification.cover&&/^#[0-9a-f]{6}$/i.test(classification.cover.color)&&['plain','ruled','grid','dots'].includes(classification.cover.pattern))&&Array.isArray(source.files)&&new Set(source.files.map(file=>file?.id)).size===source.files.length&&source.files.every(file=>!!file&&text(file.id,200)&&(file.documentId===undefined||text(file.documentId,200))&&(file.revision===undefined||version(file.revision))&&/^[a-f0-9]{64}$/.test(file.sha256)&&Number.isSafeInteger(file.size)&&file.size>=0&&typeof file.mediaType==='string')&&Array.isArray(source.mutationIds)&&source.mutationIds.every(id=>text(id))&&new Set(source.mutationIds).size===source.mutationIds.length;
}
export function assertNotebookTrashView(view:NotebookTrashView,scope:NotebookTrashScope,noteId:string){
 if(view.head&&!validNotebookTrashHead(view.head,scope,noteId))error('invalid-receipt','Le reçu de corbeille doit être vérifié. Aucun original n’est remplacé.');
 if(view.operations.some(op=>!validNotebookTrashOperation(op,scope,noteId)))error('invalid-receipt','Une opération de corbeille est incompatible.');
 if(view.head&&(view.operations.length!==view.head.operationIds.length||view.operations.length!==view.head.sequence||view.operations.some((op,index)=>op.id!==view.head!.operationIds[index]||op.sequence!==index+1||!identityEqual(op,view.head!))))error('invalid-receipt','La chaîne de corbeille est incomplète.');
 if(view.head){const last=view.operations.at(-1);if(!last||last.intent!==(view.head.state==='trashed'?'trash':'restore')||last.sourceKey!==view.head.sourceKey||last.deletionId!==view.head.deletionId)error('invalid-receipt','La dernière opération ne correspond pas à la corbeille actuelle.');}
 const source=view.source;if(view.head&&(!validNotebookTrashSource(source,scope,noteId)||!identityEqual(source,view.head)||source.deletionId!==view.head.deletionId))error('invalid-receipt','La source de la corbeille reste conservée mais son reçu est incomplet.');
 if(view.head?.server){const operation=view.operations.find(op=>op.id===view.head!.server!.operationId);if(!operation||operation.status!=='acknowledged'||!same(operation.receipt,view.head.server)||!validNotebookTrashServerReceipt(view.head.server,operation))error('invalid-receipt','Le reçu serveur ne prouve pas cette opération de corbeille.');}
}
function canonical(view:NotebookTrashView,scope:NotebookTrashScope,noteId:string):Draft&{content:PaperDocument}{
 const row=view.canonical;
 if(!row||!scopeEqual(row,scope)||row.type!=='whiteboard'||row.documentId!==notebookDocumentId(noteId)||row.staged||row.identityAlias||row.syncState==='conflict'||!isPaperDocument(row.content)||row.content.noteId!==noteId||!hasPaperCollaboration(row.content))error('invalid-source','La note doit être enregistrée dans sa propre identité avant sa mise à la corbeille.');
 verifyPaperCollaboration(row.content);return row as Draft&{content:PaperDocument};
}
function metadata(view:NotebookTrashView,scope:NotebookTrashScope,noteId:string){const row=view.metadata,value=row?.content as{id?:unknown}|undefined;if(!row||!scopeEqual(row,scope)||row.type!=='notesMarkdown'||row.documentId!==noteId||row.staged||row.identityAlias||row.syncState==='conflict'||!value||value.id!==noteId)error('invalid-source','Les informations originales de la note ne sont pas disponibles.');return row;}
function library(view:NotebookTrashView,scope:NotebookTrashScope){const row=view.library;if(!row||!scopeEqual(row,scope)||row.type!=='preferences'||row.documentId!=='paper-library-v1'||row.staged||row.identityAlias||row.syncState==='conflict'||!isNotebookLibrary(row.content))error('invalid-source','Le classement doit être enregistré avant cette opération.');return row as Draft&{content:import('./notebookLibrary.ts').NotebookLibrary};}
/** Validate the local transition again inside the native CAS transaction. A
 * caller cannot use a valid expected view to rewrite a different classification. */
export function assertNotebookTrashLocalTransition(plan:NotebookTrashCommit,latest:NotebookTrashView){
 const {scope,noteId,head,operation:op}=plan,paper=canonical(latest,scope,noteId),note=metadata(latest,scope,noteId),prior=library(latest,scope);
 const previous=latest.head,identity={...scope,noteId,lineage:paper.content.collaboration!.lineage};
 if(!identityEqual(head,identity)||!identityEqual(op,identity)||op.createdAt!==plan.library?.updatedAt||head.sequence!==(previous?.sequence??0)+1||!same(head.operationIds,[...(previous?.operationIds??[]),op.id])||!same(head.server,previous?.server))error('invalid-receipt','La transition de corbeille ne correspond pas à son admission.');
 if(op.intent==='trash'){
  const source=plan.source;if(!source||previous?.state==='trashed'||head.state!=='trashed'||head.localDeletedAt!==op.createdAt||source.capturedAt!==op.createdAt||!same(source.canonical,paper)||!same(source.metadata,note)||!same(source.classification,prior.content.notes[noteId]??emptyClassification())||!same(source.mutationIds,latest.mutations.map(row=>row.id))||source.files.length!==latest.files.length||source.files.some(proof=>!latest.files.some(file=>file.id===proof.id&&file.documentId===proof.documentId&&file.revision===proof.revision&&file.sha256===proof.sha256&&file.blob.size===proof.size&&file.blob.type===proof.mediaType)))error('invalid-receipt','Les originaux de cette suppression ne correspondent pas à la note courante.');
 }else if(!previous||previous.state!=='trashed'||!latest.source||!same(paper.content,latest.source.canonical.content)||paper.title!==latest.source.canonical.title||!same(note.content,latest.source.metadata.content)||note.title!==latest.source.metadata.title||plan.source!==undefined||notebookTrashRestoreAvailability(previous)==='server-expired'||!same(head,{...previous,state:'restored',sequence:op.sequence,operationIds:[...previous.operationIds,op.id]}))error('invalid-receipt','La restauration ne correspond pas au reçu conservé.');
 const next=plan.library;if(!next||!isNotebookLibrary(next.content))error('invalid-receipt','Le classement de la corbeille est invalide.');
 const standard=`paper-history|${scope.accountId}|${scope.spaceId}|preferences|${prior.documentId}|${String(prior.content.revision).padStart(12,'0')}`,held=latest.libraryHistory;if(held&&(held.key!==standard||!scopeEqual(held,scope)))error('invalid-receipt','La clé de l’histoire conservée appartient à une autre portée.');
 const history=held&&same(held.value,prior.content)?undefined:{key:held?`paper-history|${scope.accountId}|${scope.spaceId}|preferences|${prior.documentId}|trash-recovery-${op.id}`:standard,...scope,value:prior.content};if(!same(plan.history,history))error('invalid-receipt','La destination de l’histoire doit préserver sa version exacte sans recouvrir un reçu.');
 const proposed=updateNotebookLibrary(prior.content,{note:{id:noteId,patch:{deletedAt:op.intent==='trash'?new Date(op.createdAt).toISOString():null}}},new Date(op.createdAt).toISOString());
 const plain=(value:import('./notebookLibrary.ts').NotebookLibrary)=>{const {collaboration,...fields}=value;return fields;};
 // Open/merge verifies that the entire CRDT describes exactly this semantic view.
 mergeNotebookLibrary(next.content,next.content);
 if(!next.content.collaboration||prior.content.collaboration&&next.content.collaboration.lineage!==prior.content.collaboration.lineage||!same(plain(next.content),plain(proposed))||!same({...next,content:undefined,updatedAt:undefined,syncState:undefined},{...prior,content:undefined,updatedAt:undefined,syncState:undefined})||next.syncState!=='local')error('invalid-receipt','Seule la corbeille de cette note peut changer dans ce classement.');
}
async function fileProofs(files:readonly LocalBlob[],current:()=>boolean){const result:NotebookTrashFileProof[]=[];for(const file of files){assertCurrent(current);const raw=await file.blob.arrayBuffer();assertCurrent(current);const digest=await crypto.subtle.digest('SHA-256',raw);assertCurrent(current);const sha256=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');if(file.sha256!==sha256)error('invalid-source','Un fichier original ne correspond pas à son empreinte. Il reste conservé.');result.push({id:file.id,documentId:file.documentId,revision:file.revision,sha256,size:file.blob.size,mediaType:file.blob.type});}return result;}
/** No local clock expires or purges recoverable work. Only a current server
 * receipt may close the canonical restore window; originals still remain listed. */
export function notebookTrashRestoreAvailability(head:NotebookTrashHead){return head.server?.deletionId===head.deletionId&&head.server.state==='expired'?'server-expired':head.state==='restored'?'already-restored':'available';}
/** Pending local restoration never grants publication through the v2 ACTIVE API. */
export function notebookTrashPublicationBlocked(head:NotebookTrashHead){return head.state!=='restored'||head.server?.state!=='restored'||head.server.deletionId!==head.deletionId||head.server.operationId!==head.operationIds.at(-1);}
export async function prepareNotebookTrashChange(input:{scope:NotebookTrashScope;noteId:string;intent:'trash'|'restore';store:NotebookTrashStore;current:()=>boolean;now?:number}):Promise<NotebookTrashCommit|null>{
 const current=guard(input.current);assertCurrent(current);const scope=captureScope(input.scope),noteId=input.noteId,intent=input.intent,store=input.store,read=store.read.bind(store),now=input.now??Date.now();
 if(!text(noteId,200)||!['trash','restore'].includes(intent)||!time(now))error('invalid-source','L’opération de corbeille est invalide.');
 const expected=structuredClone(await read(scope,noteId));assertCurrent(current);assertNotebookTrashView(expected,scope,noteId);
 if(expected.head?.state===(intent==='trash'?'trashed':'restored'))return null;
 const paper=canonical(expected,scope,noteId),note=metadata(expected,scope,noteId),classification=library(expected,scope),lineage=paper.content.collaboration!.lineage;
 if(expected.head&&expected.head.lineage!==lineage)error('source-changed','Cette identité désigne une autre incarnation de la note.');
 let head:NotebookTrashHead,source:NotebookTrashSource|undefined;const id=crypto.randomUUID(),sequence=(expected.head?.sequence??0)+1;if(!version(sequence)||expected.operations.some(op=>op.id===id))error('invalid-receipt','Le compteur ou l’identité de corbeille doit être vérifié.');
 if(intent==='trash'){
  const identity={...scope,noteId,lineage},deletionId=crypto.randomUUID(),files=await fileProofs(expected.files,current);
  const canonicalSha256=await sha(paper.content,current),metadataSha256=await sha(note.content,current);
  source={schema:1,kind:'notebook-trash-source',...identity,deletionId,capturedAt:now,canonical:paper,metadata:note,classification:structuredClone(classification.content.notes[noteId]??emptyClassification()),canonicalSha256,metadataSha256,files,mutationIds:expected.mutations.map(row=>row.id)};
  head={schema:1,kind:'notebook-trash-head',...identity,state:'trashed',sequence,deletionId,sourceKey:notebookTrashSourceKey(identity,deletionId),localDeletedAt:now,localRetainUntil:now+NOTEBOOK_TRASH_RETENTION_MS,operationIds:[...(expected.head?.operationIds??[]),id],...(expected.head?.server?{server:expected.head.server}:{})};
 }else{
  const previous=expected.head,original=expected.source;if(!previous||!original)error('invalid-receipt','Le reçu de suppression et ses sources sont nécessaires à la restauration.');
  if(notebookTrashRestoreAvailability(previous)==='server-expired')error('restore-expired','Le serveur confirme la fin du délai de restauration. Les originaux restent disponibles pour récupération.');
  if(!same(paper.content,original.canonical.content)||paper.title!==original.canonical.title||!same(note.content,original.metadata.content)||note.title!==original.metadata.title)error('source-changed','Une contribution a changé depuis la suppression. Les deux sources restent conservées ; comparez-les avant de restaurer.');
  const files=await fileProofs(expected.files,current);if(!Array.isArray(original.files)||files.length!==original.files.length||files.some(file=>{const held=original.files.find(held=>held.id===file.id);return !held||!same({...file,revision:undefined},{...held,revision:undefined})||(file.revision??0)<(held.revision??0);}))error('source-changed','Les fichiers originaux ont changé. Aucun fichier n’est remplacé.');
  if(await sha(paper.content,current)!==original.canonicalSha256||await sha(note.content,current)!==original.metadataSha256)error('invalid-receipt','Les sources ne correspondent pas aux empreintes de la corbeille.');
  head={...previous,state:'restored',sequence,operationIds:[...previous.operationIds,id]};
 }
 const value=amendNotebookLibrary(classification.content,updateNotebookLibrary(classification.content,{note:{id:noteId,patch:{deletedAt:intent==='trash'?new Date(now).toISOString():null}}},new Date(now).toISOString()),scope.accountId+'|'+scope.spaceId);
 const nextLibrary:Draft={...classification,content:value,updatedAt:now,syncState:'local'};
 const historyKey=`paper-history|${scope.accountId}|${scope.spaceId}|preferences|${classification.documentId}|${String(classification.content.revision).padStart(12,'0')}`;
 const priorHistory=expected.libraryHistory;if(priorHistory&&(priorHistory.key!==historyKey||!scopeEqual(priorHistory,scope)))error('invalid-receipt','La version précédente du classement appartient à une autre portée.');
 const history=priorHistory&&same(priorHistory.value,classification.content)?undefined:{key:priorHistory?`paper-history|${scope.accountId}|${scope.spaceId}|preferences|${classification.documentId}|trash-recovery-${id}`:historyKey,...scope,value:classification.content};
 const operation:NotebookTrashOperation={schema:1,kind:'notebook-trash-operation',...scope,noteId,lineage,id,deletionId:head.deletionId,sourceKey:head.sourceKey,sequence,intent,createdAt:now,status:'pending'};
 assertCurrent(current);return Object.freeze({scope,noteId,expected,head,source,operation,library:nextLibrary,history});
}
export async function changeNotebookTrash(input:Parameters<typeof prepareNotebookTrashChange>[0]){const current=guard(input.current);assertCurrent(current);const commit=input.store.commit.bind(input.store),plan=await prepareNotebookTrashChange({...input,current});assertCurrent(current);if(!plan)return {changed:false as const};await commit(plan,current);assertCurrent(current);return {changed:true as const,head:plan.head};}
/** ACK is a separate captured CAS; it never publishes old canonical content or
 * clears a tombstone merely because a response arrived. No transport => no ACK. */
export async function flushNotebookTrash(input:{scope:NotebookTrashScope;noteId:string;store:NotebookTrashStore;transport?:NotebookTrashTransport;current:()=>boolean}){
 const current=guard(input.current);assertCurrent(current);const scope=captureScope(input.scope),noteId=input.noteId,store=input.store,read=store.read.bind(store),readSource=store.readSource.bind(store),commit=store.commit.bind(store),transport=input.transport;if(!transport)error('transport-unavailable','La synchronisation de la corbeille attend le protocole serveur. Les sources restent conservées.');
 const publish=transport.publish.bind(transport);let sent=0;for(;;){const expected=structuredClone(await read(scope,noteId));assertCurrent(current);assertNotebookTrashView(expected,scope,noteId);const operation=expected.operations.find(op=>op.status==='pending');if(!operation)return sent;const original=structuredClone(await readSource(scope,noteId,operation.sourceKey));assertCurrent(current);if(!validNotebookTrashSource(original,scope,noteId)||!identityEqual(original,operation)||original.deletionId!==operation.deletionId||operation.sourceKey!==notebookTrashSourceKey(original,original.deletionId))error('invalid-receipt','La source de cette ancienne opération doit être conservée séparément avant synchronisation.');
  if(!isPaperDocument(original.canonical.content)||!hasPaperCollaboration(original.canonical.content))error('invalid-receipt','L’historique original de cette opération doit être vérifié.');verifyPaperCollaboration(original.canonical.content);if(await sha(original.canonical.content,current)!==original.canonicalSha256||await sha(original.metadata.content,current)!==original.metadataSha256)error('invalid-receipt','Les empreintes de cette ancienne source ne correspondent plus à son reçu.');
  const receipt=structuredClone(await publish(structuredClone(operation),structuredClone(original),current));assertCurrent(current);if(!validNotebookTrashServerReceipt(receipt,operation))error('invalid-receipt','Le reçu serveur ne correspond pas à cette suppression ou restauration.');
  const latest=structuredClone(await read(scope,noteId));assertCurrent(current);assertNotebookTrashView(latest,scope,noteId);const held=latest.operations.find(op=>op.id===operation.id);if(!held||!same(held,operation)||!latest.head||latest.head.lineage!==operation.lineage)error('source-changed','La corbeille a changé pendant sa confirmation.');
  const previous=latest.head.server;if(previous&&(previous.resourceId!==receipt.resourceId||previous.incarnation!==receipt.incarnation||receipt.resourceVersion<=previous.resourceVersion||receipt.canonicalVersion<=previous.canonicalVersion||receipt.metadataVersion<=previous.metadataVersion))error('invalid-receipt','La confirmation serveur ne fait pas avancer les versions attendues.');
  await commit({scope,noteId,expected:latest,head:{...latest.head,server:receipt},operation:{...held,status:'acknowledged',receipt}},current);assertCurrent(current);sent++;
 }
}
