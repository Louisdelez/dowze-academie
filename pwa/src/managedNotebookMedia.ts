/** Existing managed binary upload only. Prepared immutable bytes survive an
 * unknown ACK; mapping changes the latest graph through native IDB CAS. No
 * private blob transport, MIME conversion or authority/key renewal is allowed. */
import {ManagedClientError,managedCurrent,assertManagedCurrent,managedSha256,managedUuid,freezeManaged,validManagedTicket,identityMatchesTicket,verifyManagedAdmission,validManagedAdmissionReceipt,assertManagedStateIdentity,type createManagedNotebookClient,type ManagedState,type ManagedTicket,type ManagedUploadReceipt} from './managedNotebookClient.ts';
import {managedBindingKey,managedResourceKey,managedIncarnationKey,type ManagedStoreIdentity,type ManagedAdmissionIntent} from './managedNotebookStore.ts';
import {verifyManagedWireSource} from './managedNotebookProtocol.ts';
import {commitNotebookTransfer,NotebookTransferChangedError,notebookDeletionKey,type Draft,type LocalBlob,type Snapshot} from './storage.ts';
import {notebookDocumentId,isPaperDocument,type PaperDocument,type PaperAsset} from '../../src/lib/notebookDocument.ts';
import {hasPaperCollaboration,verifyPaperCollaboration,amendPaperCollaboration} from '../../src/lib/paperCollaboration.ts';
import {notebookTrashHeadKey,validNotebookTrashHead,notebookTrashPublicationBlocked} from '../../src/lib/notebookTrash.ts';
import {managedLocalMetadataId} from '../../src/lib/notebookMetadataProjection.ts';
import {managedNotebookMediaType} from './managedNotebookMediaTypes.ts';

type Client=ReturnType<typeof createManagedNotebookClient>;
type FileHeader=Omit<LocalBlob,'blob'>&{readonly size:number;readonly mediaType:string};
interface Prepared {
 readonly identity:ManagedStoreIdentity;readonly serverKey:string;readonly key:string;readonly ticket:ManagedTicket;
 readonly asset:PaperAsset;readonly file:FileHeader;readonly payloadBase64:string;readonly sha256:string;readonly sourceHistoryKey:string;readonly sourceSha256:string;
}
interface Upload {
 readonly schema:1;readonly kind:'managed-notebook-upload';readonly prepared:Prepared;
 readonly status:'prepared'|'received'|'applied'|'retained';readonly receipt?:ManagedUploadReceipt;
}
type PreparedHeader=Omit<Prepared,'payloadBase64'>;
interface Applied {readonly schema:1;readonly kind:'managed-notebook-upload-applied';readonly status:'applied';readonly prepared:PreparedHeader;readonly receipt:ManagedUploadReceipt}
interface Pointer {
 readonly schema:1;readonly kind:'managed-notebook-upload-pointer';readonly identity:ManagedStoreIdentity;readonly serverKey:string;
 readonly resourceId:string;readonly incarnation:string;readonly activeKey?:string;readonly mappings:readonly {assetId:string;key:string}[];
}
interface Rows {readonly snapshots:Map<string,Snapshot|undefined>;readonly files:Map<string,LocalBlob|undefined>;readonly canonical:Draft|undefined;readonly metadata:Draft|undefined}
export interface ManagedNotebookMediaInput {
 readonly identity:ManagedStoreIdentity;readonly state:ManagedState;readonly client:Client;
 readonly current:()=>boolean;readonly openDatabase:()=>Promise<IDBDatabase>;
}
export interface ManagedNotebookMediaResult {readonly canonical:Draft;readonly uploadReceipts:readonly ManagedUploadReceipt[];readonly remainingChanges:boolean}
const MAX_BYTES=32*1024*1024;
const changed=()=>new ManagedClientError('source-changed','La note ou son fichier a changé. Le paquet préparé et les originaux restent conservés.');
const invalid=()=>new ManagedClientError('invalid-response','La preuve du fichier géré est incompatible. Aucun original n’a été remplacé.');
const unavailable=(message:string)=>new ManagedClientError('unavailable',message);
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const exact=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const owned=(row:{accountId:string;spaceId:string},id:ManagedStoreIdentity)=>row.accountId===id.accountId&&row.spaceId===id.spaceId;
const draftKey=(id:ManagedStoreIdentity,canonical:boolean)=>[id.accountId,id.spaceId,canonical?'whiteboard':'notesMarkdown',canonical?id.canonicalDocumentId:managedLocalMetadataId(id)].join('|');
const fileKey=(id:ManagedStoreIdentity,assetId:string)=>[id.accountId,id.spaceId,assetId].join('|');
const fileHeader=(file:LocalBlob):FileHeader=>{const {blob,...rest}=file;const value={...rest} as typeof rest&{key?:unknown};delete value.key;return {...value,size:blob.size,mediaType:blob.type};};
export const managedNotebookUploadPointerKey=(id:ManagedStoreIdentity,serverKey:string)=>'managed-notebook-upload-pointer|'+JSON.stringify([serverKey,id.accountId,id.spaceId,id.noteId]);
export const managedNotebookUploadKey=(id:ManagedStoreIdentity,serverKey:string,key:string)=>'managed-notebook-upload|'+JSON.stringify([serverKey,id.accountId,id.spaceId,id.noteId,key]);
export const managedNotebookUploadAppliedKey=(id:ManagedStoreIdentity,serverKey:string,key:string)=>'managed-notebook-upload-applied|'+JSON.stringify([serverKey,id.accountId,id.spaceId,id.noteId,key]);
const historyKey=(id:ManagedStoreIdentity,serverKey:string,key:string,phase:'source'|'mapping')=>'managed-notebook-upload-history|'+JSON.stringify([serverKey,id.accountId,id.spaceId,id.noteId,key,phase]);
// Strings make the complete payload part of the existing synchronous JSON CAS.
// Blob JSON is {}, so a Blob cannot serve as that durable comparison evidence.
function encodeBytes(bytes:Uint8Array){let raw='';for(let at=0;at<bytes.length;at+=32768)raw+=String.fromCharCode(...bytes.subarray(at,at+32768));return btoa(raw);}
function decodeBytes(text:string,size:number):Uint8Array<ArrayBuffer>{
 if(typeof text!=='string'||!Number.isSafeInteger(size)||size<1||size>MAX_BYTES||text.length!==4*Math.ceil(size/3)||/[^A-Za-z0-9+/=]/.test(text))throw invalid();let raw:string;try{raw=atob(text);}catch{throw invalid();}if(raw.length!==size)throw invalid();const bytes=new Uint8Array(size);for(let i=0;i<size;i++)bytes[i]=raw.charCodeAt(i);if(encodeBytes(bytes)!==text)throw invalid();return bytes;
}
const receiptValid=(r:ManagedUploadReceipt|undefined,p:Pick<Prepared,'ticket'|'file'|'sha256'>)=>!!r&&managedUuid(r.id)&&r.resource_id===p.ticket.id&&r.incarnation===p.ticket.incarnation&&r.resource_version===p.ticket.resource_version&&r.writer_version===p.ticket.writer_version&&r.media_type===p.file.mediaType&&r.size===p.file.size&&r.sha256===p.sha256&&typeof r.created_at==='string'&&typeof r.expires_at==='string'&&Number.isFinite(Date.parse(r.created_at))&&Date.parse(r.expires_at)>Date.parse(r.created_at);
function pointerValue(row:Snapshot|undefined,id:ManagedStoreIdentity,state:ManagedState):Pointer {
 if(!row)return {schema:1,kind:'managed-notebook-upload-pointer',identity:id,serverKey:state.serverKey,resourceId:state.resource.id,incarnation:state.resource.incarnation,mappings:[]};
 const p=row.value as Pointer;if(!p||p.schema!==1||p.kind!=='managed-notebook-upload-pointer'||!exact(p.identity,id)||p.serverKey!==state.serverKey||p.resourceId!==state.resource.id||p.incarnation!==state.resource.incarnation||p.activeKey!==undefined&&!managedUuid(p.activeKey)||!Array.isArray(p.mappings)||p.mappings.length>1000||new Set(p.mappings.map(m=>m?.assetId)).size!==p.mappings.length||p.mappings.some(m=>!m||typeof m.assetId!=='string'||!m.assetId||m.assetId.length>200||!managedUuid(m.key)))throw invalid();return p;
}
function preparedValid(p:PreparedHeader|undefined,id:ManagedStoreIdentity,state:ManagedState,key:string):p is PreparedHeader {
 return !!p&&exact(p.identity,id)&&p.serverKey===state.serverKey&&p.key===key&&managedUuid(key)&&validManagedTicket(p.ticket)&&identityMatchesTicket(id,p.ticket)&&p.ticket.owner_account_id===id.accountId&&p.ticket.id===state.resource.id&&p.ticket.incarnation===state.resource.incarnation&&p.ticket.resource_version===state.resource.resource_version&&p.ticket.writer_version===state.resource.writer_version&&p.ticket.capabilities.write_documents&&['owner','editor'].includes(p.ticket.role)&&!!p.asset&&typeof p.asset.id==='string'&&p.asset.serverId===undefined&&p.file?.id===p.asset.id&&owned(p.file,id)&&p.file.documentId===id.canonicalDocumentId&&!p.file.removedFromNote&&managedNotebookMediaType(p.file.mediaType)&&p.file.mediaType===p.asset.mediaType&&p.file.size===p.asset.size&&Number.isSafeInteger(p.file.size)&&p.file.size>=1&&p.file.size<=MAX_BYTES&&Number.isSafeInteger(p.file.revision)&&Number(p.file.revision)>=1&&p.file.sha256===p.sha256&&/^[a-f0-9]{64}$/.test(p.sha256)&&/^[a-f0-9]{64}$/.test(p.sourceSha256)&&p.sourceHistoryKey===historyKey(id,state.serverKey,key,'source');
}
function operationValue(row:Snapshot|undefined,id:ManagedStoreIdentity,state:ManagedState,key:string):Upload {
 const u=row?.value as Upload|undefined,p=u?.prepared;
 if(!row||!u||u.schema!==1||u.kind!=='managed-notebook-upload'||!['prepared','received','applied','retained'].includes(u.status)||!preparedValid(p,id,state,key)||typeof p.payloadBase64!=='string'||p.payloadBase64.length!==4*Math.ceil(p.file.size/3)||(u.status==='prepared'?u.receipt!==undefined:!receiptValid(u.receipt,p)))throw invalid();return u;
}
function appliedValue(row:Snapshot|undefined,id:ManagedStoreIdentity,state:ManagedState,key:string):Applied {
 const u=row?.value as Applied|undefined,p=u?.prepared;
 if(!row||!u||u.schema!==1||u.kind!=='managed-notebook-upload-applied'||u.status!=='applied'||!preparedValid(p,id,state,key)||Object.hasOwn(p,'payloadBase64')||!receiptValid(u.receipt,p))throw invalid();return u;
}

async function readRows(id:ManagedStoreIdentity,state:ManagedState,openDatabase:()=>Promise<IDBDatabase>,current:()=>boolean):Promise<Rows>{
 assertManagedCurrent(current);const db=await openDatabase();if(!current()){db.close();assertManagedCurrent(current);}if(db.name!=='dowze-academie-pwa'||db.version!==3||['drafts','snapshots','scopedBlobs'].some(name=>!db.objectStoreNames.contains(name))){db.close();throw invalid();}
 return new Promise((resolve,reject)=>{let tx:IDBTransaction;try{tx=db.transaction(['drafts','snapshots','scopedBlobs'],'readonly');}catch(error){db.close();reject(error);return;}
  const snapshots=new Map<string,Snapshot|undefined>(),files=new Map<string,LocalBlob|undefined>();let canonical:Draft|undefined,metadata:Draft|undefined,failure:unknown;
  const fail=(error:unknown)=>{failure??=error;try{tx.abort();}catch{}};
  const snapshot=(key:string,after?:(row:Snapshot|undefined)=>void)=>{if(snapshots.has(key))return;snapshots.set(key,undefined);const r=tx.objectStore('snapshots').get(key);r.onsuccess=()=>{try{assertManagedCurrent(current);const row=r.result as Snapshot|undefined;if(row&&(!owned(row,id)||row.key!==key))throw invalid();snapshots.set(key,row);after?.(row);}catch(error){fail(error);}};};
  const file=(assetId:string)=>{if(files.has(assetId))return;files.set(assetId,undefined);const r=tx.objectStore('scopedBlobs').get(fileKey(id,assetId));r.onsuccess=()=>{try{assertManagedCurrent(current);const row=r.result as LocalBlob|undefined;if(row&&(!owned(row,id)||row.id!==assetId))throw invalid();files.set(assetId,row);}catch(error){fail(error);}};};
  for(const key of [managedBindingKey(id),managedResourceKey(state.serverKey,id.accountId,state.resource.id),managedIncarnationKey(state.serverKey,id.accountId,state.resource.incarnation),notebookTrashHeadKey(id,id.noteId),notebookDeletionKey({...id,type:'whiteboard',documentId:id.canonicalDocumentId})])snapshot(key);
  snapshot(managedNotebookUploadPointerKey(id,state.serverKey),row=>{const p=pointerValue(row,id,state);if(p.activeKey){const key=p.activeKey;snapshot(managedNotebookUploadKey(id,state.serverKey,key),op=>{const u=operationValue(op,id,state,key);file(u.prepared.asset.id);snapshot(u.prepared.sourceHistoryKey);});}for(const mapping of p.mappings)snapshot(managedNotebookUploadAppliedKey(id,state.serverKey,mapping.key));});
  for(const isCanonical of [true,false]){const r=tx.objectStore('drafts').get(draftKey(id,isCanonical));r.onsuccess=()=>{try{assertManagedCurrent(current);if(isCanonical){canonical=r.result;if(isPaperDocument(canonical?.content)){if(canonical.content.assets.length>1000)throw invalid();for(const asset of canonical.content.assets)if(!asset.serverId||!state.blobs.some(b=>b.id===asset.serverId))file(asset.id);}}else metadata=r.result;}catch(error){fail(error);}};}
  tx.onerror=event=>{failure??=(event.target as IDBRequest|null)?.error??tx.error;};tx.onabort=()=>{db.close();reject(failure??tx.error??changed());};tx.oncomplete=()=>{db.close();if(failure)reject(failure);else resolve({snapshots,files,canonical,metadata});};
 });
}
async function validateRows(rows:Rows,id:ManagedStoreIdentity,state:ManagedState,current:()=>boolean){
 const intent=rows.snapshots.get(managedBindingKey(id))?.value as ManagedAdmissionIntent|undefined,b=intent?.binding,canonical=rows.canonical,metadata=rows.metadata;
 if(!b||!intent?.prepared||b.schema!==1||b.kind!=='managed-notebook-binding'||b.phase!=='managed'||!exact(b.identity,id)||b.serverKey!==state.serverKey||b.resourceId!==state.resource.id||b.incarnation!==state.resource.incarnation||b.activeWriteKey||!canonical||!metadata||!owned(canonical,id)||!owned(metadata,id)||canonical.type!=='whiteboard'||canonical.documentId!==id.canonicalDocumentId||metadata.type!=='notesMarkdown'||metadata.documentId!==managedLocalMetadataId(id)||!record(metadata.content)||metadata.content.id!==id.noteId||[canonical,metadata].some(row=>row.staged||row.identityAlias||row.syncState==='conflict'||!Number.isSafeInteger(row.baseVersion)||row.baseVersion<1)||!isPaperDocument(canonical.content)||canonical.content.noteId!==id.noteId||!hasPaperCollaboration(canonical.content)||canonical.content.collaboration.lineage!==id.lineage)throw changed();
 verifyPaperCollaboration(canonical.content);const admission=await verifyManagedAdmission(intent.prepared,current);assertManagedCurrent(current);if(!exact(admission.proof.identity,id)||admission.actorAccountId!==id.accountId||admission.resourceId!==b.resourceId||admission.incarnation!==b.incarnation||admission.idempotencyKey!==b.admissionKey||!validManagedAdmissionReceipt(b.admissionReceipt,admission))throw invalid();
 const reservation={bindingKey:managedBindingKey(id),identity:id,resourceId:b.resourceId,incarnation:b.incarnation};for(const k of [managedResourceKey(b.serverKey,id.accountId,b.resourceId),managedIncarnationKey(b.serverKey,id.accountId,b.incarnation)])if(!exact(rows.snapshots.get(k)?.value,reservation))throw changed();
 const head=rows.snapshots.get(notebookTrashHeadKey(id,id.noteId))?.value;if(head&&(!validNotebookTrashHead(head,id,id.noteId)||notebookTrashPublicationBlocked(head)))throw changed();if(rows.snapshots.get(notebookDeletionKey({...id,type:'whiteboard',documentId:id.canonicalDocumentId})))throw changed();
 return {canonical:canonical as Draft&{content:PaperDocument},metadata,pointer:pointerValue(rows.snapshots.get(managedNotebookUploadPointerKey(id,state.serverKey)),id,state)};
}
async function commit(rows:Rows,id:ManagedStoreIdentity,current:()=>boolean,updates:Snapshot[],drafts:Draft[]=[],file?:LocalBlob){
 const checks=[...rows.snapshots].map(([key,expected])=>({key,expected}));for(const row of updates)if(!rows.snapshots.has(row.key))checks.push({key:row.key,expected:undefined});
 try{await commitNotebookTransfer({target:id,sources:[],drafts,blobs:[],snapshots:updates,draftChecks:[{identity:{...id,type:'whiteboard',documentId:id.canonicalDocumentId},expected:rows.canonical},{identity:{...id,type:'notesMarkdown',documentId:managedLocalMetadataId(id)},expected:rows.metadata}],blobChecks:file?[{identity:file,expected:file}]:[],snapshotChecks:checks},current);}catch(error){if(error instanceof NotebookTransferChangedError)throw changed();throw error;}
 assertManagedCurrent(current);
}
const snapshot=(id:ManagedStoreIdentity,key:string,value:unknown):Snapshot=>({accountId:id.accountId,spaceId:id.spaceId,key,value});
function localFile(file:LocalBlob|undefined,id:ManagedStoreIdentity,asset:PaperAsset,maximum:number):LocalBlob {
 if(!file||!owned(file,id)||file.id!==asset.id||file.documentId!==id.canonicalDocumentId||file.removedFromNote||!(file.blob instanceof Blob)||!file.blob.size||file.blob.size>maximum||file.blob.type!==asset.mediaType||file.blob.size!==asset.size||!managedNotebookMediaType(file.blob.type)||!Number.isSafeInteger(file.revision)||Number(file.revision)<1||typeof file.sha256!=='string'||!/^[a-f0-9]{64}$/.test(file.sha256))throw unavailable('Ce fichier attend une provenance ou un format pris en charge avant son transfert géré. Ses octets restent conservés.');return file;
}
/** Call after replaying any pending managed write and before queueWrite. The
 * caller MUST reread its pair and qualify every asset against state.blobs or the
 * returned receipts before publication. This helper never publishes the pair. */
export async function resumeManagedNotebookUploads(input:ManagedNotebookMediaInput):Promise<Readonly<ManagedNotebookMediaResult>>{
 const id=structuredClone(input.identity),state=structuredClone(input.state),client=input.client,openDatabase=input.openDatabase,sourceCurrent=input.current,current=managedCurrent(()=>sourceCurrent()&&client.current());assertManagedCurrent(current);assertManagedStateIdentity(state);
 if(id.canonicalDocumentId!==notebookDocumentId(id.noteId)||!identityMatchesTicket(id,state.resource)||state.resource.owner_account_id!==id.accountId||state.serverKey!==client.serverKey||state.actorAccountId!==id.accountId||client.actorAccountId!==id.accountId||!state.resource.capabilities.write_documents||!['owner','editor'].includes(state.resource.role))throw invalid();
 for(const source of [state.canonical,state.metadata])await verifyManagedWireSource({source_json:source.source_json,sha256:source.sha256},current);assertManagedCurrent(current);const capabilities=await client.capabilities();assertManagedCurrent(current);if(!capabilities.writer_configured)throw unavailable('Le serveur géré ne permet pas encore ce transfert.');
 let rows=await readRows(id,state,openDatabase,current),value=await validateRows(rows,id,state,current);assertManagedCurrent(current);const selected=new Set(value.canonical.content.assets.map(a=>a.id));let retained=false;
 for(let count=0;count<=selected.size;count++){
  rows=await readRows(id,state,openDatabase,current);value=await validateRows(rows,id,state,current);assertManagedCurrent(current);let pointer=value.pointer;
  if(!pointer.activeKey){const asset=value.canonical.content.assets.find(a=>selected.has(a.id)&&!a.serverId);if(!asset)break;const file=localFile(rows.files.get(asset.id),id,asset,capabilities.limits.blob_bytes),payload=file.blob.slice(0,file.blob.size,file.blob.type),bytes=new Uint8Array(await payload.arrayBuffer()),digest=await managedSha256(bytes,current);assertManagedCurrent(current);if(digest!==file.sha256)throw changed();const sourceSha256=await managedSha256(JSON.stringify(value.canonical),current),key=crypto.randomUUID(),prepared:Prepared={identity:id,serverKey:state.serverKey,key,ticket:state.resource,asset:structuredClone(asset),file:fileHeader(file),payloadBase64:encodeBytes(bytes),sha256:digest,sourceHistoryKey:historyKey(id,state.serverKey,key,'source'),sourceSha256};
   const op:Upload={schema:1,kind:'managed-notebook-upload',prepared,status:'prepared'};pointer={...pointer,activeKey:key};await commit(rows,id,current,[snapshot(id,managedNotebookUploadKey(id,state.serverKey,key),op),snapshot(id,managedNotebookUploadPointerKey(id,state.serverKey),pointer),snapshot(id,prepared.sourceHistoryKey,{schema:1,kind:'managed-notebook-upload-source',identity:id,key,canonical:structuredClone(value.canonical),file:fileHeader(file),sha256:digest,sourceSha256})],[],file);
   rows=await readRows(id,state,openDatabase,current);value=await validateRows(rows,id,state,current);pointer=value.pointer;
  }
  if(!pointer.activeKey)throw changed();const key=pointer.activeKey,opKey=managedNotebookUploadKey(id,state.serverKey,key);let op=operationValue(rows.snapshots.get(opKey),id,state,key),p=op.prepared;
  if(!['prepared','received'].includes(op.status))throw invalid();const origin=rows.snapshots.get(p.sourceHistoryKey)?.value;if(!record(origin)||origin.schema!==1||origin.kind!=='managed-notebook-upload-source'||!exact(origin.identity,id)||origin.key!==key||!exact(origin.file,p.file)||origin.sha256!==p.sha256||origin.sourceSha256!==p.sourceSha256||!record(origin.canonical)||!owned(origin.canonical as unknown as Draft,id)||origin.canonical.documentId!==id.canonicalDocumentId||!isPaperDocument(origin.canonical.content)||origin.canonical.content.noteId!==id.noteId||origin.canonical.content.collaboration?.lineage!==id.lineage||!origin.canonical.content.assets.some(asset=>exact(asset,p.asset))||await managedSha256(JSON.stringify(origin.canonical),current)!==p.sourceSha256)throw invalid();verifyPaperCollaboration(origin.canonical.content);assertManagedCurrent(current);
  const payloadBytes=decodeBytes(p.payloadBase64,p.file.size);if(payloadBytes.length>capabilities.limits.blob_bytes||await managedSha256(payloadBytes,current)!==p.sha256)throw invalid();assertManagedCurrent(current);
  if(op.status==='prepared'){
   // A native no-write CAS proves the captured source/authority before the real
   // client's port capture/send. Unknown replies keep this exact prepared row.
   await commit(rows,id,current,[]);const receipt=await client.upload(p.ticket,new Blob([payloadBytes],{type:p.file.mediaType}),p.key);assertManagedCurrent(current);if(!receiptValid(receipt,p))throw invalid();
   rows=await readRows(id,state,openDatabase,current);value=await validateRows(rows,id,state,current);if(value.pointer.activeKey!==key||!exact(operationValue(rows.snapshots.get(opKey),id,state,key),op))throw changed();op={...op,status:'received',receipt};await commit(rows,id,current,[snapshot(id,opKey,op)]);
   rows=await readRows(id,state,openDatabase,current);value=await validateRows(rows,id,state,current);op=operationValue(rows.snapshots.get(opKey),id,state,key);p=op.prepared;
  }
  if(!receiptValid(op.receipt,p)||Date.now()>=Date.parse(op.receipt!.expires_at))throw unavailable('Le reçu de ce fichier a expiré. Son paquet et ses octets restent conservés pour une reprise explicite.');
  const asset=value.canonical.content.assets.find(a=>a.id===p.asset.id),file=rows.files.get(p.asset.id);let fits=!!asset&&asset.mediaType===p.asset.mediaType&&asset.size===p.asset.size&&(asset.serverId===undefined||asset.serverId===op.receipt!.id)&&!!file&&exact(fileHeader(file),p.file);
  if(fits&&file)fits=await managedSha256(new Uint8Array(await file.blob.arrayBuffer()),current)===p.sha256;assertManagedCurrent(current);if(value.pointer.activeKey!==key)throw changed();
  const nextPointer:Pointer={...value.pointer,activeKey:undefined,mappings:fits?[...value.pointer.mappings.filter(m=>m.assetId!==p.asset.id),{assetId:p.asset.id,key}]:value.pointer.mappings};
  if(!fits){await commit(rows,id,current,[snapshot(id,opKey,{...op,status:'retained'}),snapshot(id,managedNotebookUploadPointerKey(id,state.serverKey),nextPointer)]);retained=true;break;}
  const graph=value.canonical.content,assets=graph.assets.map(a=>a.id===p.asset.id?{...a,serverId:op.receipt!.id}:a),refs=[...new Set(assets.flatMap(a=>a.serverId?[a.serverId]:[]))],stamp=Math.max(Date.now(),Date.parse(graph.updatedAt)+1,value.canonical.updatedAt+1);if(!Number.isFinite(stamp)||!Number.isSafeInteger(graph.revision+1))throw invalid();
  const next=amendPaperCollaboration(graph,{...graph,assets,blob_ids:refs,revision:graph.revision+1,updatedAt:new Date(stamp).toISOString()} as PaperDocument),draft:Draft={...value.canonical,content:next,updatedAt:stamp,syncState:'local'};verifyPaperCollaboration(next);
  const {payloadBase64:retainedOriginalBytes,...preparedHeader}=p;const applied:Applied={schema:1,kind:'managed-notebook-upload-applied',status:'applied',prepared:preparedHeader,receipt:op.receipt!};
  await commit(rows,id,current,[snapshot(id,opKey,{...op,status:'applied'}),snapshot(id,managedNotebookUploadAppliedKey(id,state.serverKey,key),applied),snapshot(id,managedNotebookUploadPointerKey(id,state.serverKey),nextPointer),snapshot(id,historyKey(id,state.serverKey,key,'mapping'),{schema:1,kind:'managed-notebook-upload-mapping',identity:id,key,before:structuredClone(value.canonical),after:structuredClone(draft),receipt:op.receipt})],[draft],file);
 }
 rows=await readRows(id,state,openDatabase,current);value=await validateRows(rows,id,state,current);assertManagedCurrent(current);const receipts:ManagedUploadReceipt[]=[];let remainingChanges=retained||!!value.pointer.activeKey;
 for(const asset of value.canonical.content.assets){if(!asset.serverId){remainingChanges=true;continue;}const remote=state.blobs.find(b=>b.id===asset.serverId);if(remote){if(remote.media_type!==asset.mediaType||remote.size!==asset.size)throw changed();continue;}const mapping=value.pointer.mappings.find(m=>m.assetId===asset.id);if(!mapping)throw changed();const op=appliedValue(rows.snapshots.get(managedNotebookUploadAppliedKey(id,state.serverKey,mapping.key)),id,state,mapping.key);if(op.status!=='applied'||!receiptValid(op.receipt,op.prepared)||op.receipt!.id!==asset.serverId||op.receipt!.media_type!==asset.mediaType||op.receipt!.size!==asset.size||Date.now()>=Date.parse(op.receipt!.expires_at))throw changed();const file=rows.files.get(asset.id);if(!file||!exact(fileHeader(file),op.prepared.file))throw changed();if(!receipts.some(r=>r.id===op.receipt!.id))receipts.push(op.receipt!);}
 return freezeManaged({canonical:structuredClone(value.canonical),uploadReceipts:receipts,remainingChanges});
}
