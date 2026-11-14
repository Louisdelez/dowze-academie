/** Explicit, durable repair of the former private audio/GIF octet wrapper.
 * Only the existing owner-scoped POST/GET routes are used. Old remote rows,
 * receipts and source history stay intact; latest canonical edits use CAS/Yjs. */
import {ApiClient,ApiError,type BlobInfo} from './api';
import {openNotebookStateDatabase,type LocalBlob,type Draft,type Snapshot,type Mutation} from './storage';
import {readPrivateNotebookSyncPolicy} from './privateNotebookSyncStorage';
import {PrivateNotebookBlockedError} from '../../src/lib/privateNotebookSyncPolicy';
import {isPaperDocument,notebookDocumentId} from '../../src/lib/notebookDocument';
import {managedNotebookMediaType} from './managedNotebookMediaTypes';
import {canonical} from '../../src/lib/serverSync';
import {amendPaperCollaboration} from '../../src/lib/paperCollaboration';

const CAP=16*1024*1024,OLD='application/octet-stream';
const fail=()=>new Error('La réconciliation du média privé doit être reprise depuis son original conservé.');
const exact=(a:unknown,b:unknown)=>canonical(a)===canonical(b);
const text=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,names:string[])=>Object.keys(v).length===names.length&&names.every(n=>Object.hasOwn(v,n));
async function digest(bytes:BufferSource){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export const privateOriginalMediaType=(mime:string)=>managedNotebookMediaType(mime)&&(mime.startsWith('audio/')||mime==='image/gif');
type Phase='prepared'|'conflict'|'legacy-replay-prepared'|'legacy-get-prepared'|'legacy-verified'|'replacement-prepared'|'received'|'applied'|'observed-original';
type Header=Omit<LocalBlob,'blob'>&{key?:string;type:string;size:number};
interface Legacy {kind:'conflict-replay'|'uploaded-get';blobId:string;mime:typeof OLD;sha256:string;size:number;receipt?:BlobInfo}
interface Journal {schema:1;kind:'private-original-media-reconciliation';serverKey:string;accountId:string;spaceId:string;blobId:string;documentId:string;sha256:string;size:number;originalMime:string;initialFile:Header;sourceSha256:string;lineage:string|null;phase:Phase;newKey:string;conflict?:{status:422;code:'idempotency_key_reused';key:string};legacy?:Legacy;receipt?:BlobInfo;mapping?:{mutationId:string;contentSha256:string;lineage:string|null}}
export interface PrivateOriginalReconciliation {readonly journalKey:string;readonly mutationId?:string}
function header(file:LocalBlob):Header{
 const {blob,...rest}=file as LocalBlob&{key?:string};
 if(!(blob instanceof Blob)||!privateOriginalMediaType(blob.type)||blob.size<1||blob.size>CAP||!text(file.id)||!file.accountId||!text(file.spaceId)||!file.documentId||file.revision!==undefined&&(!Number.isSafeInteger(file.revision)||file.revision<1)||file.sha256!==undefined&&!/^[a-f0-9]{64}$/.test(file.sha256)||!['pending','uploaded'].includes(file.status)||typeof file.name!=='string'||!Number.isFinite(file.createdAt)||file.removedFromNote)throw fail();
 if(Object.keys(rest).some(k=>!['revision','sha256','documentId','removedFromNote','id','accountId','spaceId','name','createdAt','status','serverId','key'].includes(k)))throw fail();
 if(file.status==='uploaded'&&!text(file.serverId)||file.serverId!==undefined&&!text(file.serverId))throw fail();
 return {...rest,type:blob.type,size:blob.size};
}
function receipt(raw:unknown,j:Journal,mime:string):BlobInfo{
 if(!record(raw)||!keys(raw,['id','space_id','media_type','size','sha256','created_at'])||!text(raw.id)||raw.space_id!==j.spaceId||raw.media_type!==mime||raw.size!==j.size||raw.sha256!==j.sha256||typeof raw.created_at!=='string'||!Number.isFinite(Date.parse(raw.created_at)))throw fail();
 return {...raw} as unknown as BlobInfo;
}
function valid(raw:unknown,context:Pick<Journal,'serverKey'|'accountId'|'spaceId'|'blobId'|'documentId'|'sha256'|'size'|'originalMime'>):Journal{
 if(!record(raw)||Object.keys(raw).some(k=>!['schema','kind','serverKey','accountId','spaceId','blobId','documentId','sha256','size','originalMime','initialFile','sourceSha256','lineage','phase','newKey','conflict','legacy','receipt','mapping'].includes(k))||raw.schema!==1||raw.kind!=='private-original-media-reconciliation'||Object.entries(context).some(([k,v])=>raw[k]!==v)||!record(raw.initialFile)||!Object.hasOwn(raw,'newKey')||typeof raw.newKey!=='string'||!(/^[\x21-\x7e]{1,128}$/).test(raw.newKey)||typeof raw.sourceSha256!=='string'||!/^[a-f0-9]{64}$/.test(raw.sourceSha256)||!['prepared','conflict','legacy-replay-prepared','legacy-get-prepared','legacy-verified','replacement-prepared','received','applied','observed-original'].includes(String(raw.phase)))throw fail();
 const j=raw as unknown as Journal,h=j.initialFile;
 if(!j.accountId||!text(j.spaceId)||!text(j.blobId)||!text(j.documentId)||!/^[a-f0-9]{64}$/.test(j.sha256)||!Number.isSafeInteger(j.size)||j.size<1||j.size>CAP||!privateOriginalMediaType(j.originalMime))throw fail();
 if(j.lineage!==null&&(typeof j.lineage!=='string'||j.lineage.length<1||j.lineage.length>200))throw fail();
 if(h.id!==j.blobId||h.accountId!==j.accountId||h.spaceId!==j.spaceId||h.documentId!==j.documentId||h.sha256!==undefined&&h.sha256!==j.sha256||h.type!==j.originalMime||h.size!==j.size)throw fail();
 if(j.conflict!==undefined&&(!record(j.conflict)||!keys(j.conflict,['status','code','key'])||j.conflict.status!==422||j.conflict.code!=='idempotency_key_reused'||j.conflict.key!==j.blobId))throw fail();
 if(j.legacy!==undefined){const p=j.legacy;if(!record(p)||Object.keys(p).some(k=>!['kind','blobId','mime','sha256','size','receipt'].includes(k))||!['conflict-replay','uploaded-get'].includes(p.kind)||!text(p.blobId)||p.mime!==OLD||p.sha256!==j.sha256||p.size!==j.size)throw fail();if(p.kind==='conflict-replay'){if(!j.conflict||!p.receipt||receipt(p.receipt,j,OLD).id!==p.blobId)throw fail();}else if(p.receipt!==undefined||h.status!=='uploaded'||h.serverId!==p.blobId)throw fail();}
 if(j.receipt!==undefined)receipt(j.receipt,j,j.originalMime);
 if(['conflict','legacy-replay-prepared'].includes(j.phase)&&!j.conflict)throw fail();
 if(['legacy-verified','replacement-prepared'].includes(j.phase)&&!j.legacy)throw fail();
 if(['received','applied'].includes(j.phase)&&!j.receipt)throw fail();
 if(j.phase==='legacy-get-prepared'&&h.status!=='uploaded'||j.phase==='observed-original'&&(h.status!=='uploaded'||j.legacy!==undefined||j.receipt!==undefined))throw fail();
 if(['replacement-prepared','received','applied'].includes(j.phase)&&j.legacy&&j.newKey===j.blobId)throw fail();
 if(j.mapping!==undefined&&(!record(j.mapping)||!keys(j.mapping,['mutationId','contentSha256','lineage'])||j.phase!=='applied'||!j.legacy||j.mapping.mutationId!==j.newKey+'-graph'||!/^[a-f0-9]{64}$/.test(j.mapping.contentSha256)||j.mapping.lineage!==null&&(typeof j.mapping.lineage!=='string'||j.mapping.lineage.length<1||j.mapping.lineage.length>200)))throw fail();
 if(['prepared','conflict','legacy-replay-prepared','legacy-get-prepared','legacy-verified','observed-original'].includes(j.phase)&&j.newKey!==j.blobId)throw fail();
 if(['prepared','conflict','legacy-replay-prepared','legacy-get-prepared','observed-original'].includes(j.phase)&&(j.legacy!==undefined||j.receipt!==undefined))throw fail();
 if(j.legacy===undefined&&['received','applied'].includes(j.phase)&&j.newKey!==j.blobId)throw fail();
 if(j.legacy!==undefined&&['replacement-prepared','received','applied'].includes(j.phase)&&!/^media-reconcile-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(j.newKey))throw fail();
 if(j.receipt!==undefined&&!['received','applied'].includes(j.phase))throw fail();
 return j;
}

/** Called by the existing serial flush for supported original audio/GIF only.
 * The API instance and current callback are captured before any await. */
export async function reconcilePrivateOriginalMedia(apiInput:ApiClient,fileInput:LocalBlob,currentInput:()=>boolean):Promise<PrivateOriginalReconciliation>{
 const api=apiInput,sourceCurrent=currentInput;let retired=false;
 const sourceAllowed=()=>{try{if(sourceCurrent()!==true)retired=true;}catch{retired=true;}return !retired;};
 if(!sourceAllowed())throw fail();
 const file={...fileInput,blob:fileInput.blob},initial=header(file),serverKey=api.privateBlobServerKey();
 if(!sourceAllowed())throw fail();const authority=api.captureSessionAuthority(file.accountId);
 const current=()=>{try{if(!sourceAllowed()||authority()!==true||api.privateBlobServerKey()!==serverKey)retired=true;}catch{retired=true;}return !retired;};
 const requireCurrent=()=>{if(!current())throw fail();};requireCurrent();
 const bytes=new Uint8Array(await file.blob.arrayBuffer());requireCurrent();const sha256=await digest(bytes);requireCurrent();if(file.sha256!==undefined&&sha256!==file.sha256)throw fail();
 const context={serverKey,accountId:file.accountId,spaceId:file.spaceId,blobId:file.id,documentId:file.documentId!,sha256,size:file.blob.size,originalMime:file.blob.type};
 const journalKey='private-original-media-reconciliation|'+JSON.stringify([serverKey,file.accountId,file.spaceId,file.id]),historyKey=journalKey+'|original';
 const fileKey=`${file.accountId}|${file.spaceId}|${file.id}`,draftKey=`${file.accountId}|${file.spaceId}|whiteboard|${file.documentId}`;
 type View={file:LocalBlob;draft:Draft;journal?:Journal;history?:Snapshot};
 async function transaction<T>(mode:IDBTransactionMode,work:(tx:IDBTransaction,view:View)=>T):Promise<T>{
  requireCurrent();const db=await openNotebookStateDatabase();if(!current()){db.close();throw fail();}
  return new Promise<T>((resolve,reject)=>{const tx=db.transaction(['snapshots','drafts','scopedBlobs','mutations'],mode);let result:T,reason:unknown,stopped=false,remaining=5,loaded:Partial<View>={};
   const abort=(error:unknown)=>{reason??=error;if(!stopped){stopped=true;tx.abort();}};
   const ready=()=>{if(stopped||--remaining)return;try{requireCurrent();const f=loaded.file,d=loaded.draft,j=loaded.journal;if(!f||!d)throw fail();const h=header(f);
    if(j){const expected=j.phase==='applied'?{...j.initialFile,status:'uploaded',serverId:j.receipt!.id,sha256:j.sha256,revision:(j.initialFile.revision??0)+1}:j.initialFile;if(!exact(h,expected))throw fail();}
    else if(!exact(h,initial))throw fail();
    if(d.accountId!==file.accountId||d.spaceId!==file.spaceId||d.type!=='whiteboard'||d.documentId!==file.documentId||d.identityAlias||d.staged||d.syncState==='conflict'||!Number.isSafeInteger(d.updatedAt)||!isPaperDocument(d.content)||notebookDocumentId(d.content.noteId)!==file.documentId)throw fail();
    if(j&&(d.content.collaboration?.lineage??null)!==(j.mapping?j.mapping.lineage:j.lineage))throw fail();
    const asset=d.content.assets.find(a=>a.id===file.id);if(!asset||asset.mediaType!==context.originalMime||asset.size!==context.size||asset.serverId!==undefined&&asset.serverId!==f.serverId&&asset.serverId!==j?.initialFile.serverId)throw fail();
    result=work(tx,loaded as View);
   }catch(error){abort(error);}};
   readPrivateNotebookSyncPolicy(tx,file,current,policy=>{try{if(policy.blockBlob(file.documentId)||policy.blockDocument('whiteboard',file.documentId!))throw new PrivateNotebookBlockedError();ready();}catch(error){abort(error);}},abort);
   const get=(store:string,key:string,accept:(row:unknown)=>void)=>{const request=tx.objectStore(store).get(key);request.onsuccess=()=>{try{accept(request.result);ready();}catch(error){abort(error);}};};
   get('scopedBlobs',fileKey,row=>{loaded.file=row as LocalBlob;});get('drafts',draftKey,row=>{loaded.draft=row as Draft;});
   get('snapshots',journalKey,row=>{if(row!==undefined){const s=row as Snapshot;if(s.key!==journalKey||s.accountId!==file.accountId||s.spaceId!==file.spaceId)throw fail();loaded.journal=valid(s.value,context);}});
   get('snapshots',historyKey,row=>{if(row!==undefined){const h=row as Snapshot;if(h.key!==historyKey||h.accountId!==file.accountId||h.spaceId!==file.spaceId)throw fail();loaded.history=h;}});
   tx.oncomplete=()=>{db.close();if(!current())reject(fail());else resolve(result!);};tx.onerror=event=>{reason??=(event.target as IDBRequest|null)?.error??tx.error;};tx.onabort=()=>{db.close();reject(reason??tx.error??fail());};
  });
 }
 const snapshot=(value:Journal):Snapshot=>({key:journalKey,accountId:file.accountId,spaceId:file.spaceId,value});
 const read=()=>transaction('readonly',(_tx,v)=>v);
 async function update(previous:Journal,next:Journal,apply?:{expectedDraft:string;content:unknown;contentSha256:string}){requireCurrent();return transaction('readwrite',(tx,v)=>{
  if(!v.journal||!exact(v.journal,previous)||!v.history)throw fail();const accepted=valid(next,context);
  if(accepted.phase==='applied'){if(!accepted.receipt)throw fail();if(apply){if(!accepted.mapping||JSON.stringify(v.draft)!==apply.expectedDraft||accepted.mapping.contentSha256!==apply.contentSha256)throw fail();const createdAt=Math.max(Date.now(),v.draft.updatedAt+1);if(!Number.isSafeInteger(createdAt))throw fail();const queued:Mutation={accountId:file.accountId,spaceId:file.spaceId,type:'whiteboard',documentId:file.documentId!,id:accepted.mapping.mutationId,baseVersion:v.draft.baseVersion,content:apply.content,createdAt,status:'pending'};
    const read=tx.objectStore('mutations').get(queued.id);read.onsuccess=()=>{try{requireCurrent();if(read.result!==undefined)throw fail();tx.objectStore('mutations').put(queued);tx.objectStore('drafts').put({...v.draft,content:apply.content,syncState:'queued',updatedAt:queued.createdAt});}catch(error){tx.abort();}};
   }tx.objectStore('scopedBlobs').put({...v.file,status:'uploaded',serverId:accepted.receipt.id,sha256,revision:(v.file.revision??0)+1});}
  tx.objectStore('snapshots').put(snapshot(accepted));return accepted;
 });}
 const first=await read();let journal=first.journal;
 if(journal){const h=first.history?.value;if(!record(h)||!keys(h,['schema','kind','file','draft'])||h.schema!==1||h.kind!=='private-original-media-original'||!exact(header(h.file as LocalBlob),journal.initialFile)||!record(h.draft)||!isPaperDocument(h.draft.content)||(h.draft.content.collaboration?.lineage??null)!==journal.lineage)throw fail();
  const originalSource=new TextEncoder().encode(JSON.stringify(h.draft));if(originalSource.byteLength>CAP||await digest(originalSource)!==journal.sourceSha256||await digest(new Uint8Array(await (h.file as LocalBlob).blob.arrayBuffer()))!==sha256)throw fail();requireCurrent();
 }
 if(!journal){const source=JSON.stringify(first.draft),sourceBytes=new TextEncoder().encode(source);if(sourceBytes.byteLength>CAP)throw fail();const sourceSha256=await digest(sourceBytes);requireCurrent();
  journal=await transaction('readwrite',(tx,v)=>{if(v.journal)return v.journal;if(v.history||JSON.stringify(v.draft)!==source)throw fail();
   if(!isPaperDocument(v.draft.content))throw fail();const value:Journal={schema:1,kind:'private-original-media-reconciliation',...context,initialFile:initial,sourceSha256,lineage:v.draft.content.collaboration?.lineage??null,phase:file.status==='uploaded'?'legacy-get-prepared':'prepared',newKey:file.id};
   tx.objectStore('snapshots').put({key:historyKey,accountId:file.accountId,spaceId:file.spaceId,value:{schema:1,kind:'private-original-media-original',file:v.file,draft:v.draft}});
   tx.objectStore('snapshots').put(snapshot(value));return value;
  });
 }
 const guard=async()=>{requireCurrent();await read();requireCurrent();};
 async function checkedOld(blobId:string){await guard();const original=await api.downloadBlob(file.spaceId,blobId);requireCurrent();if(original.type!==OLD||original.size!==context.size)throw fail();const body=new Uint8Array(await original.arrayBuffer());requireCurrent();if(await digest(body)!==sha256)throw fail();requireCurrent();await guard();}
 if(journal.phase==='observed-original'||journal.phase==='applied')return {journalKey,...(journal.mapping?{mutationId:journal.mapping.mutationId}:{})};
 if(journal.phase==='prepared'){
  try{const reply=await api.uploadBlob(file.spaceId,file.blob,sha256,journal.newKey,guard);requireCurrent();const accepted=receipt(reply,journal,context.originalMime);journal=await update(journal,{...journal,phase:'received',receipt:accepted});}
  catch(error){requireCurrent();if(!(error instanceof ApiError)||error.status!==422||error.code!=='idempotency_key_reused')throw error;
   journal=await update(journal,{...journal,phase:'conflict',conflict:{status:422,code:'idempotency_key_reused',key:file.id}});
  }
 }
 if(journal.phase==='conflict')journal=await update(journal,{...journal,phase:'legacy-replay-prepared'});
 if(journal.phase==='legacy-replay-prepared'){
  const reply=await api.uploadBlob(file.spaceId,new Blob([file.blob],{type:OLD}),sha256,file.id,guard);requireCurrent();const old=receipt(reply,journal,OLD);
  await checkedOld(old.id);journal=await update(journal,{...journal,phase:'legacy-verified',legacy:{kind:'conflict-replay',blobId:old.id,mime:OLD,sha256,size:context.size,receipt:old}});
 }
 if(journal.phase==='legacy-get-prepared'){
  await guard();const id=journal.initialFile.serverId!;const old=await api.downloadBlob(file.spaceId,id);requireCurrent();if(old.size!==context.size)throw fail();const body=new Uint8Array(await old.arrayBuffer());requireCurrent();if(await digest(body)!==sha256)throw fail();requireCurrent();await guard();
  if(old.type===context.originalMime){await update(journal,{...journal,phase:'observed-original'});return {journalKey};}
  if(old.type!==OLD)throw fail();journal=await update(journal,{...journal,phase:'legacy-verified',legacy:{kind:'uploaded-get',blobId:id,mime:OLD,sha256,size:context.size}});
 }
 if(journal.phase==='legacy-verified'){
  const newKey='media-reconcile-'+crypto.randomUUID();if(newKey===file.id)throw fail();journal=await update(journal,{...journal,phase:'replacement-prepared',newKey});
 }
 if(journal.phase==='replacement-prepared'){
  const reply=await api.uploadBlob(file.spaceId,file.blob,sha256,journal.newKey,guard);requireCurrent();const accepted=receipt(reply,journal,context.originalMime);if(accepted.id===journal.legacy!.blobId)throw fail();journal=await update(journal,{...journal,phase:'received',receipt:accepted});
 }
 if(journal.phase==='received'){
  const view=await read(),before=view.draft.content;if(!isPaperDocument(before))throw fail();const selected=before.assets.find(a=>a.id===file.id)!;
  if(selected.serverId!==undefined&&selected.serverId!==journal.receipt!.id){
   if(!journal.legacy||selected.serverId!==journal.legacy.blobId||!Number.isSafeInteger(before.revision+1))throw fail();
   const assets=before.assets.map(a=>a.id===file.id?{...a,serverId:journal!.receipt!.id}:a),blob_ids=[...new Set(assets.flatMap(a=>a.serverId?[a.serverId]:[]))];
   const content=amendPaperCollaboration(before,{...before,revision:before.revision+1,updatedAt:new Date().toISOString(),assets,blob_ids} as typeof before),raw=new TextEncoder().encode(JSON.stringify(content));if(raw.byteLength>CAP)throw fail();const contentSha256=await digest(raw);requireCurrent();
   journal=await update(journal,{...journal,phase:'applied',mapping:{mutationId:journal.newKey+'-graph',contentSha256,lineage:content.collaboration?.lineage??null}},{expectedDraft:JSON.stringify(view.draft),content,contentSha256});
  }else journal=await update(journal,{...journal,phase:'applied'});
 }
 if(journal.phase!=='applied')throw fail();
 return {journalKey,...(journal.mapping?{mutationId:journal.mapping.mutationId}:{})};
}

/** Old accepted contributions retain their exact requests and run first. Only
 * the NEW mapping mutation, before preparation/HTTP, takes their ACK version.
 * A prepared mapping mutation always retries its original base/body/key. */
export async function rebasePrivateOriginalMapping(api:ApiClient,journalKey:string,input:Mutation,currentInput:()=>boolean):Promise<Mutation>{
 const current=currentInput,expected=structuredClone(input),state=JSON.stringify(expected),serverKey=api.privateBlobServerKey(),contentSha256=await digest(new TextEncoder().encode(JSON.stringify(expected.content)));if(!current())throw fail();
 const db=await openNotebookStateDatabase();if(!current()){db.close();throw fail();}
 return new Promise<Mutation>((resolve,reject)=>{const tx=db.transaction(['snapshots','drafts','mutations'],'readwrite');let left=4,raw:Snapshot|undefined,draft:Draft|undefined,queued:Mutation|undefined,result=expected,reason:unknown,aborted=false;
  const abort=(e:unknown)=>{reason??=e;if(!aborted){aborted=true;tx.abort();}};
  const done=()=>{if(aborted||--left)return;try{if(!current()||!raw||!draft||!queued||JSON.stringify(queued)!==state||raw.key!==journalKey||raw.accountId!==expected.accountId||raw.spaceId!==expected.spaceId||!record(raw.value))throw fail();const j=raw.value as unknown as Journal;
   valid(j,{serverKey,accountId:expected.accountId,spaceId:expected.spaceId,blobId:j.blobId,documentId:expected.documentId,sha256:j.sha256,size:j.size,originalMime:j.originalMime});
   if(journalKey!=='private-original-media-reconciliation|'+JSON.stringify([serverKey,expected.accountId,expected.spaceId,j.blobId])||j.phase!=='applied'||j.mapping?.mutationId!==expected.id||j.mapping.contentSha256!==contentSha256||expected.type!=='whiteboard'||queued.status!=='pending'||queued.identityAlias||draft.identityAlias||draft.staged||draft.syncState==='conflict'||draft.accountId!==expected.accountId||draft.spaceId!==expected.spaceId||draft.documentId!==expected.documentId||draft.type!=='whiteboard'||!isPaperDocument(draft.content)||!isPaperDocument(queued.content)||draft.content.noteId!==queued.content.noteId||draft.content.collaboration?.lineage!==queued.content.collaboration?.lineage||(draft.content.collaboration?.lineage??null)!==j.mapping.lineage)throw fail();
   if(queued.paperPrepared===undefined&&draft.baseVersion>queued.baseVersion){result={...queued,baseVersion:draft.baseVersion};tx.objectStore('mutations').put(result);}
  }catch(e){abort(e);}};
  readPrivateNotebookSyncPolicy(tx,expected,current,policy=>{if(policy.blockDocument(expected.type,expected.documentId,expected.content)){abort(new PrivateNotebookBlockedError());return;}done();},abort);
  const get=(store:string,key:string,accept:(v:any)=>void)=>{const r=tx.objectStore(store).get(key);r.onsuccess=()=>{accept(r.result);done();};};
  get('snapshots',journalKey,v=>raw=v);get('drafts',`${expected.accountId}|${expected.spaceId}|whiteboard|${expected.documentId}`,v=>draft=v);get('mutations',expected.id,v=>queued=v);
  tx.oncomplete=()=>{db.close();if(!current())reject(fail());else resolve(result);};tx.onerror=e=>{reason??=(e.target as IDBRequest|null)?.error??tx.error;};tx.onabort=()=>{db.close();reject(reason??tx.error??fail());};
 });
}
