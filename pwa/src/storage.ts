import {readPrivateNotebookSyncPolicy as readPrivateNotebookPolicyWithin} from './privateNotebookSyncStorage.ts';
import {PrivateNotebookBlockedError,type PrivateNotebookSyncPolicy} from '../../src/lib/privateNotebookSyncPolicy.ts';
import {privateCacheRetention} from './privateCacheRetention.ts';
import {isPaperDocument} from '../../src/lib/notebookDocument.ts';
import {notebookIdentityDigest,notebookDocumentId} from '../../src/lib/notebookIdentity.ts';
import {LEGACY_NOTE_ID} from '../../src/lib/notebook.ts';
import type { DocumentType, ChangePage } from './api';

export interface DraftKey { accountId: string; spaceId: string; documentId: string; type?: DocumentType }
export interface Draft extends DraftKey { identityAlias?:string;paperDependency?:string;staged?:boolean;archiveImport?:boolean;duplicateSourceId?:string; type: DocumentType; title: string; content: unknown; baseVersion: number; updatedAt: number; syncState: 'local' | 'queued' | 'synced' | 'conflict'; conflict?: unknown }
export interface PaperPreparedMutation {schema:1;sourceSha256:string;content:unknown;draft:{title:string;updatedAt:number}}
export interface Mutation extends DraftKey { paperPrepared?:PaperPreparedMutation;identityAlias?:string;id: string; type: DocumentType; baseVersion: number; content: unknown; createdAt: number; status: 'pending' | 'conflict'; error?: string }
export interface Snapshot { key: string; accountId: string; spaceId: string; value: unknown }
export interface LocalBlob { revision?:number;sha256?:string; documentId?: string; removedFromNote?: boolean; id: string; accountId: string; spaceId: string; blob: Blob; name: string; createdAt: number; status: 'pending' | 'uploaded'; serverId?: string }

const DB = 'dowze-academie-pwa';
const VERSION = 3;
const BLOBS='scopedBlobs';
const blobKey=(blob:Pick<LocalBlob,'accountId'|'spaceId'|'id'>)=>`${blob.accountId}|${blob.spaceId}|${blob.id}`;
const key = (v: DraftKey) => `${v.accountId}|${v.spaceId}|${v.type ?? "notesMarkdown"}|${v.documentId}`;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('mutations')) db.createObjectStore('mutations', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs', { keyPath: 'id' });
      if(!db.objectStoreNames.contains(BLOBS)){
       db.createObjectStore(BLOBS,{keyPath:'key'});
       const original=request.transaction!.objectStore('blobs'),scoped=request.transaction!.objectStore(BLOBS),read=original.openCursor();
       read.onsuccess=()=>{const cursor=read.result;if(!cursor)return;const row=cursor.value as LocalBlob;
        if(typeof row.id==='string'&&typeof row.accountId==='string'&&typeof row.spaceId==='string')scoped.put({...row,key:blobKey(row)});
        cursor.continue();
       };
      }
      const drafts = request.transaction!.objectStore('drafts');
      const cursor = drafts.openCursor();
      cursor.onsuccess = () => {
        const row = cursor.result; if (!row) return;
        const value = row.value;
        if (value.key !== key(value)) { row.delete(); drafts.put({ ...value, key: key(value) }); }
        row.continue();
      };
    };
    request.onsuccess = () => {const db=request.result;db.onversionchange=()=>db.close();resolve(db);};
    request.onerror = () => reject(request.error);
  });
}

/** Dedicated notebook adapters share this exact opener/schema. No I/O until called. */
export function openNotebookStateDatabase():Promise<IDBDatabase>{return openDb();}

async function run<T>(store: string, mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = action(tx.objectStore(store));
    let result: T;
    request.onsuccess = () => { result = request.result; };
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error ?? request.error ?? new Error('Stockage interrompu')); };
  });
}

/** A delayed seed/response may update retained provenance, but never reactivate it. */
export async function putDraft(draft: Draft) {
 const db=await openDb();return new Promise<void>((resolve,reject)=>{
  const tx=db.transaction('drafts','readwrite'),store=tx.objectStore('drafts'),read=store.get(key(draft));let reason='Enregistrement interrompu.';
  read.onsuccess=()=>{const current=read.result as Draft|undefined;
   if(current?.identityAlias&&!samePaperOwner(current.content,draft.content)){reason='Cette ancienne identité appartient à une autre note. Son original reste conservé.';tx.abort();return;}
   store.put({...draft,key:key(draft),...(current?.identityAlias?{identityAlias:current.identityAlias,baseVersion:Math.max(draft.baseVersion,current.baseVersion)}:{})});
  };
  tx.oncomplete=()=>{db.close();resolve();};tx.onabort=tx.onerror=()=>{db.close();reject(tx.error??new Error(reason));};
 });
}
/** A stale React edit keeps the most recent acknowledged version and cannot erase a conflict. */
export async function putEditedDraft(draft: Draft,expectedContent?:unknown,currentView:()=>boolean=()=>true) {
  if(!currentView())throw new DraftChangedError('Le carnet a changé avant l’enregistrement du miroir.');
  const db=await openDb();
  return new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('drafts','readwrite'),store=tx.objectStore('drafts'),read=store.get(key(draft));
    let changed=false;
    read.onsuccess=()=>{
      const current=read.result as Draft|undefined;
      if(!currentView()||expectedContent!==undefined&&JSON.stringify(current?.content)!==JSON.stringify(expectedContent)){changed=true;tx.abort();return;}
      if(current?.syncState==='conflict'||current?.identityAlias&&!samePaperOwner(current.content,draft.content)){tx.abort();return;}
      store.put({...draft,key:key(draft),baseVersion:Math.max(draft.baseVersion,current?.baseVersion??0),...(current?.identityAlias?{identityAlias:current.identityAlias}:{})});
    };
    tx.oncomplete=()=>{db.close();resolve();};
    tx.onabort=tx.onerror=()=>{db.close();reject(changed?new DraftChangedError('Le miroir ou son compte a changé avant sa conservation.'):tx.error??new Error('Conflit ou stockage interrompu.'));};
  });
}
export async function getDraft(draftKey: DraftKey): Promise<Draft | undefined> { return run<any>('drafts', 'readonly', (s) => s.get(key(draftKey))); }
export async function listDrafts(accountId: string, spaceId: string): Promise<Draft[]> { const all = await run<any[]>('drafts', 'readonly', (s) => s.getAll()); return all.filter((x) => x.accountId === accountId && x.spaceId === spaceId); }
export async function queueMutation(mutation: Mutation) { await run('mutations', 'readwrite', (s) => s.put(mutation)); }
/** A late HTTP409 can mark only the exact queued branch it rejected. A newer
 * draft, acknowledged/replaced mutation or revoked session changes neither row. */
export async function markMutationConflict(expected:Mutation,serverVersion:number|undefined,message:string,current:()=>boolean=()=>true):Promise<boolean>{
 if(!current())return false;const captured=structuredClone(expected),expectedState=JSON.stringify(captured);
 const db=await openDb();if(!current()){db.close();return false;}
 return new Promise<boolean>((resolve,reject)=>{
  const tx=db.transaction(['drafts','mutations','snapshots'],'readwrite'),drafts=tx.objectStore('drafts'),outbox=tx.objectStore('mutations');let skipped=false,marked=false,failure:unknown;
  const revoke=()=>{skipped=true;tx.abort();};
  readPrivateNotebookPolicyWithin(tx,captured,current,policy=>{if(policy.blockDocument(captured.type,captured.documentId,captured.content))return;
  const read=outbox.get(captured.id);
  read.onsuccess=()=>{
   if(!current()){revoke();return;}const mutation=read.result as Mutation|undefined;
   if(!mutation||JSON.stringify(mutation)!==expectedState||mutation.status!=='pending'||mutation.identityAlias)return;
   const draftRead=drafts.get(key(captured));draftRead.onsuccess=()=>{
    if(!current()){revoke();return;}const draft=draftRead.result as Draft|undefined;
    if(!draft||draft.identityAlias||draft.syncState==='conflict'||draft.baseVersion!==captured.baseVersion||JSON.stringify(draft.content)!==JSON.stringify(captured.content))return;
    outbox.put({...mutation,status:'conflict',error:message});
    if(!current()){revoke();return;}
    drafts.put({...draft,key:key(draft),syncState:'conflict',conflict:{serverVersion}});marked=true;
   };
  };
  },error=>{if(current())failure??=error;revoke();});
  tx.oncomplete=()=>{db.close();resolve(marked);};
  tx.onerror=event=>{failure??=(event.target as IDBRequest|IDBTransaction|null)?.error??tx.error??undefined;};
  tx.onabort=()=>{db.close();if(skipped&&!failure)resolve(false);else reject(tx.error??failure??new Error('La confirmation du conflit a été interrompue.'));};
 });
}
export async function listMutations(accountId: string, spaceId: string): Promise<Mutation[]> { const all = await run<Mutation[]>('mutations', 'readonly', (s) => s.getAll()); return all.filter((x) => x.accountId === accountId && x.spaceId === spaceId).sort((a, b) => key(a).localeCompare(key(b)) || a.baseVersion - b.baseVersion || a.createdAt - b.createdAt); }
export async function deleteMutation(id: string) { await run('mutations', 'readwrite', (s) => s.delete(id)); }
export async function putSnapshot(snapshot: Snapshot) { await run('snapshots', 'readwrite', (s) => s.put(snapshot)); }
export async function getSnapshot(snapshotKey:string):Promise<Snapshot|undefined>{return run('snapshots','readonly',s=>s.get(snapshotKey));}
/** The policy reads only current marker keys and lightweight headers. */
export async function readPrivateNotebookPolicy(scope:{accountId:string;spaceId:string},current:()=>boolean=()=>true):Promise<PrivateNotebookSyncPolicy>{
 const captured={accountId:scope.accountId,spaceId:scope.spaceId};if(!current())throw new DraftChangedError('La source a changé avant la lecture de sa politique.');
 const db=await openDb();if(!current()){db.close();throw new DraftChangedError('La source a changé pendant la lecture de sa politique.');}
 return new Promise((resolve,reject)=>{let tx:IDBTransaction;try{tx=db.transaction('snapshots','readonly');}catch(error){db.close();reject(error);return;}let policy:PrivateNotebookSyncPolicy|undefined,failure:unknown,aborted=false;
  const fail=(error:unknown)=>{failure??=error;if(!aborted){aborted=true;tx.abort();}};
  readPrivateNotebookPolicyWithin(tx,captured,current,value=>{policy=value;},fail);
  tx.oncomplete=()=>{db.close();if(policy&&current())resolve(policy);else reject(failure??new DraftChangedError('La source a changé avant la fin de sa lecture.'));};tx.onerror=event=>{failure??=(event.target as IDBRequest|null)?.error??tx.error;};tx.onabort=()=>{db.close();reject(failure??tx.error??new Error('Lecture de politique interrompue.'));};
 });
}
const privateNoteHint=(content:unknown)=>content&&typeof content==='object'?Object.fromEntries(Object.entries(content).filter(([key,value])=>['notebookSchema','notebookEnvelope','notebookMetadataTransport','noteId','logicalId','id','accountId','spaceId','graphId','documentId'].includes(key)&&['string','number','boolean'].includes(typeof value))):undefined;
export async function notebookPrivateTransportAllowed(identity:{accountId:string;spaceId:string;type?:string;documentId:string},current:()=>boolean=()=>true,content?:unknown):Promise<boolean>{
 if(!current())return false;if(identity.type!==undefined&&identity.type!=='whiteboard'&&identity.type!=='notesMarkdown')return true;
 const captured={accountId:identity.accountId,spaceId:identity.spaceId,type:identity.type??'notesMarkdown',documentId:identity.documentId},hint=privateNoteHint(content),policy=await readPrivateNotebookPolicy(captured,current);return current()&&!policy.blockDocument(captured.type,captured.documentId,hint);
}
/** No publication permission. Only the existing identity quarantine builder may
 * use this read lane; its commit must prove the exact tombstone in the same TX. */
export async function notebookPrivateIdentityRecoveryAllowed(identity:{accountId:string;spaceId:string;type?:string;documentId:string},current:()=>boolean=()=>true,content?:unknown):Promise<boolean>{
 if(!current()||identity.type!=='whiteboard')return false;
 const captured={accountId:identity.accountId,spaceId:identity.spaceId,type:identity.type,documentId:identity.documentId},hint=privateNoteHint(content),policy=await readPrivateNotebookPolicy(captured,current);return current()&&!policy.blockManagedOrTrashedDocument(captured.type,captured.documentId,hint);
}
/** Receive only canonical server keys through the established strict version /
 * owner tombstone validator. Managed/trash markers never enter this lane. */
export async function notebookPrivateCanonicalReceptionAllowed(identity:{accountId:string;spaceId:string;type?:string;documentId:string},current:()=>boolean=()=>true,content?:unknown):Promise<boolean>{
 if(!current())return false;if(identity.type!=='whiteboard'||!canonicalNotebookKey(identity.documentId).canonical)return notebookPrivateTransportAllowed(identity,current,content);
 const captured={accountId:identity.accountId,spaceId:identity.spaceId,type:identity.type,documentId:identity.documentId},hint=privateNoteHint(content),policy=await readPrivateNotebookPolicy(captured,current);return current()&&(!policy.blockDocument(captured.type,captured.documentId,hint)||policy.hasCanonicalDeletion(captured.documentId)&&!policy.blockManagedOrTrashedDocument(captured.type,captured.documentId,hint));
}
/** A canonical tombstone key cannot reveal a historical sanitized alias.
 * Once any notebook is blocked, allow other files only with a targeted, exact
 * canonical graph+asset proof; ownerless/retired aliases remain retained. */
const privateBlobSourceAllowed=(policy:PrivateNotebookSyncPolicy,file:Pick<LocalBlob,'accountId'|'spaceId'|'documentId'|'id'>,draft:Draft|undefined)=>{
 if(policy.blockBlob(file.documentId))return false;if(!policy.hasBlockedNotebooks)return true;
 return !!draft&&draft.accountId===file.accountId&&draft.spaceId===file.spaceId&&draft.type==='whiteboard'&&draft.documentId===file.documentId&&!draft.identityAlias&&!draft.staged&&!policy.blockDocument('whiteboard',draft.documentId,draft.content)&&isPaperDocument(draft.content)&&notebookDocumentId(draft.content.noteId)===file.documentId&&draft.content.assets.some(asset=>asset.id===file.id);
};
export async function notebookPrivateBlobAllowed(blob:Pick<LocalBlob,'accountId'|'spaceId'|'documentId'|'id'>,current:()=>boolean=()=>true):Promise<boolean>{
 if(!current())return false;const captured={accountId:blob.accountId,spaceId:blob.spaceId,documentId:blob.documentId,id:blob.id},db=await openDb();if(!current()){db.close();return false;}
 return new Promise<boolean>((resolve,reject)=>{const tx=db.transaction(['snapshots','drafts'],'readonly');let allowed=false,failure:unknown,aborted=false;const fail=(error:unknown)=>{failure??=error;if(!aborted){aborted=true;tx.abort();}};
  // The ownership proof and exclusion markers share one snapshot. An admission
  // cannot commit between two separate policy/source reads.
  readPrivateNotebookPolicyWithin(tx,captured,current,policy=>{if(policy.blockBlob(captured.documentId))return;if(!policy.hasBlockedNotebooks){allowed=true;return;}if(!captured.documentId)return;const read=tx.objectStore('drafts').get(key({...captured,type:'whiteboard',documentId:captured.documentId}));read.onsuccess=()=>{if(current())allowed=privateBlobSourceAllowed(policy,captured,read.result);};},fail);
  tx.oncomplete=()=>{db.close();resolve(current()&&allowed);};tx.onerror=event=>{failure??=(event.target as IDBRequest|null)?.error??tx.error;};tx.onabort=()=>{db.close();reject(failure??tx.error??new Error('La preuve du propriétaire du fichier a été interrompue.'));};
 });
}

export interface PrivateNotebookQuarantineChange {readonly space_id?:string;readonly document_type:string;readonly document_id:string;readonly version:number;readonly content:unknown;readonly deleted:boolean}
export interface PrivateNotebookRawChange {identity:{type:string;documentId:string};change:ChangePage['items'][number]}
function quarantinePrivateChangeWithin(tx:IDBTransaction,scope:{accountId:string;spaceId:string},change:PrivateNotebookQuarantineChange,current:()=>boolean,fail:(error:unknown)=>void){
 if(change.space_id!==undefined&&change.space_id!==scope.spaceId||!Number.isSafeInteger(change.version)||change.version<1){fail(new Error('La source privée reçue possède une autre portée ou version.'));return;}
 const key='private-notebook-quarantine|'+notebookIdentityDigest(JSON.stringify([scope.accountId,scope.spaceId,change.document_type,change.document_id]))+'|'+change.version;
 const value={schema:1,kind:'private-notebook-quarantine',incoming:structuredClone(change)},row:Snapshot={...scope,key,value},store=tx.objectStore('snapshots'),read=store.get(key);
 read.onsuccess=()=>{try{if(!current())throw new DraftChangedError('La source a changé avant sa conservation.');if(read.result!==undefined){if(JSON.stringify(read.result)!==JSON.stringify(row))throw new Error('Cette version privée possède déjà un autre original conservé.');}else store.put(row);}catch(error){fail(error);}};
}
/** A raw rejected change is durable before a native/Desktop cursor can advance. */
export async function quarantinePrivateNotebookChange(scope:{accountId:string;spaceId:string},incoming:PrivateNotebookQuarantineChange,current:()=>boolean):Promise<void>{
 if(!current())throw new DraftChangedError('La source a changé avant sa conservation.');const captured={accountId:scope.accountId,spaceId:scope.spaceId},change=structuredClone(incoming),db=await openDb();if(!current()){db.close();throw new DraftChangedError('La source a changé avant sa conservation.');}
 return new Promise((resolve,reject)=>{const tx=db.transaction('snapshots','readwrite');let failure:unknown,aborted=false;const fail=(error:unknown)=>{failure??=error;if(!aborted){aborted=true;tx.abort();}};quarantinePrivateChangeWithin(tx,captured,change,current,fail);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=event=>{failure??=(event.target as IDBRequest|null)?.error??tx.error;};tx.onabort=()=>{db.close();reject(failure??tx.error??new Error('La source privée n’a pas encore été conservée.'));};});
}

export interface NotebookDeletionStatus {schema:1;kind:'paper-canonical-deletion';accountId:string;spaceId:string;documentId:string;noteId?:string;version:number;deletedAt:number;source?:Draft}
export const notebookDeletionKey=(identity:DraftKey)=>`paper-canonical-deletion|${key({...identity,type:'whiteboard'})}`;
const validNotebookDeletion=(value:unknown,identity:DraftKey):value is NotebookDeletionStatus=>{
 const marker=value as NotebookDeletionStatus|undefined;
 return !!marker&&marker.schema===1&&marker.kind==='paper-canonical-deletion'&&marker.accountId===identity.accountId&&marker.spaceId===identity.spaceId&&marker.documentId===identity.documentId&&(marker.noteId===undefined||typeof marker.noteId==='string')&&Number.isSafeInteger(marker.version)&&marker.version>0&&Number.isFinite(marker.deletedAt);
};
function canonicalNotebookKey(documentId:string):{canonical:boolean;noteId?:string}{
 if(documentId===notebookDocumentId(LEGACY_NOTE_ID))return {canonical:true,noteId:LEGACY_NOTE_ID};
 if(/^paper-v3-id2-[a-f0-9]{64}$/.test(documentId))return {canonical:true};
 if(documentId.startsWith('paper-v3-note-')){const noteId=documentId.slice('paper-v3-note-'.length);if(notebookDocumentId(noteId)===documentId)return {canonical:true,noteId};}
 return {canonical:false};
}
/** Only an explicit scoped server tombstone proves deletion. A cached version
 * number or a missing draft alone never means that a notebook was removed. */
export async function readNotebookDeletionStatus(noteId:string,scope:{accountId:string;spaceId:string},current:()=>boolean=()=>true):Promise<NotebookDeletionStatus|undefined>{
 if(!current())throw new DraftChangedError('Le compte a changé avant la lecture de la suppression.');
 const identity={...scope,type:'whiteboard' as const,documentId:notebookDocumentId(noteId)},row=await getSnapshot(notebookDeletionKey(identity));
 if(!current())throw new DraftChangedError('Le compte a changé pendant la lecture de la suppression.');
 if(!row)return;
 if(row.accountId!==scope.accountId||row.spaceId!==scope.spaceId||!validNotebookDeletion(row.value,identity)||row.value.noteId!==undefined&&row.value.noteId!==noteId)throw Error('Le reçu de suppression ne correspond pas à cette note. Aucun original n’est remplacé.');
 return row.value;
}
export async function listSnapshots(accountId: string, spaceId: string): Promise<Snapshot[]> { const all = await run<Snapshot[]>('snapshots', 'readonly', (s) => s.getAll()); return all.filter((x) => x.accountId === accountId && x.spaceId === spaceId); }
/** Read only this key namespace. A neighbouring raw-chunk namespace is never
 * traversed, and the first outside key is checked before accessing its value. */
export async function listSnapshotsByPrefix(accountId:string,spaceId:string,prefix:string):Promise<Snapshot[]> {
 if(typeof prefix!=='string'||prefix.length===0)throw new TypeError('Le préfixe de récupération doit être une chaîne non vide.');
 const range=IDBKeyRange.lowerBound(prefix),db=await openDb();
 return new Promise<Snapshot[]>((resolve,reject)=>{
  const rows:Snapshot[]=[];let tx:IDBTransaction|undefined,request:IDBRequest<IDBCursorWithValue|null>|undefined,finished=false,failure:unknown;
  const finish=(ok:boolean,error?:unknown)=>{if(finished)return;finished=true;db.close();if(ok)resolve(rows);else reject(error);};
  const abort=(error:unknown)=>{failure=error;try{tx?.abort();}catch{finish(false,error);}};
  try{
   tx=db.transaction('snapshots','readonly');
   tx.oncomplete=()=>finish(true);
   tx.onabort=tx.onerror=()=>finish(false,failure??tx!.error??request?.error??new Error('Lecture du préfixe interrompue.'));
   request=tx.objectStore('snapshots').openCursor(range);
   request.onerror=()=>{failure??=request!.error??new Error('Lecture du préfixe interrompue.');};
   request.onsuccess=()=>{
    try{
     const cursor=request!.result;if(!cursor)return;
     const cursorKey=cursor.key;if(typeof cursorKey!=='string'||!cursorKey.startsWith(prefix))return;
     const row=cursor.value as Snapshot|undefined;
     if(row&&row.key===cursorKey&&row.accountId===accountId&&row.spaceId===spaceId)rows.push(row);
     cursor.continue();
    }catch(error){abort(error);}
   };
  }catch(error){abort(error);finish(false,error);}
 });
}
export async function localBlobDigest(blob:Blob){const bytes=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());return [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');}
/** A transfer can detect both byte changes and uploader acknowledgements. */
export async function putLocalBlob(blob: LocalBlob,privateResolution?:{identity:DraftKey;current:()=>boolean}) {
 if(privateResolution){
  const active=privateResolution.current,identity={accountId:privateResolution.identity.accountId,spaceId:privateResolution.identity.spaceId,type:privateResolution.identity.type??'whiteboard',documentId:privateResolution.identity.documentId};
  if(!active())throw new DraftChangedError('La source de ce fichier a changé avant sa récupération.');const captured={...blob,documentId:blob.documentId??identity.documentId};if(captured.accountId!==identity.accountId||captured.spaceId!==identity.spaceId||captured.documentId!==identity.documentId)throw Error('Le fichier de résolution possède une autre portée.');
  if(!await notebookPrivateTransportAllowed(identity,active))throw new PrivateNotebookBlockedError();if(!active())throw new DraftChangedError('La source du fichier a changé.');const sha256=await localBlobDigest(captured.blob);if(!active())throw new DraftChangedError('La source du fichier a changé.');const db=await openDb();if(!active()){db.close();throw new DraftChangedError('La source du fichier a changé.');}
  return new Promise<void>((resolve,reject)=>{const tx=db.transaction([BLOBS,'snapshots'],'readwrite'),store=tx.objectStore(BLOBS);let failure:unknown,aborted=false;const fail=(error:unknown)=>{failure??=error;if(!aborted){aborted=true;tx.abort();}};
   readPrivateNotebookPolicyWithin(tx,identity,active,policy=>{if(policy.blockDocument(identity.type,identity.documentId)){fail(new PrivateNotebookBlockedError());return;}const read=store.get(blobKey(captured));read.onsuccess=()=>{if(!active()){fail(new DraftChangedError('La source du fichier a changé avant sa conservation.'));return;}if(read.result!==undefined){fail(new DraftChangedError('Cette identité de fichier est déjà conservée. Aucun original n’est remplacé.'));return;}store.put({...captured,sha256,revision:1,key:blobKey(captured)});};},fail);
   tx.oncomplete=()=>{db.close();resolve();};tx.onerror=event=>{failure??=(event.target as IDBRequest|null)?.error??tx.error;};tx.onabort=()=>{db.close();reject(failure??tx.error??new Error('La récupération du fichier est interrompue.'));};
  });
 }

 const sha256=await localBlobDigest(blob.blob),db=await openDb();
 return new Promise<void>((resolve,reject)=>{const tx=db.transaction(BLOBS,'readwrite'),store=tx.objectStore(BLOBS),read=store.get(blobKey(blob));read.onsuccess=()=>{const old=read.result as LocalBlob|undefined;store.put({...blob,sha256,revision:(old?.revision??0)+1,key:blobKey(blob)});};tx.oncomplete=()=>{db.close();resolve();};tx.onabort=tx.onerror=()=>{db.close();reject(tx.error??new Error('Le fichier n’a pas pu être enregistré.'));};});
}
export async function listLocalBlobs(accountId: string, spaceId: string): Promise<LocalBlob[]> { const all = await run<LocalBlob[]>(BLOBS, 'readonly', (s) => s.getAll()); return all.filter((x) => x.accountId === accountId && x.spaceId === spaceId); }

/** A late upload receipt must never restore old bytes over a newer local file. */
export async function acknowledgeLocalBlob(expected:LocalBlob,serverId:string,current:()=>boolean=()=>true):Promise<boolean>{
 if(!current())return false;const captured={...expected},db=await openDb();if(!current()){db.close();return false;}return new Promise<boolean>((resolve,reject)=>{
  const tx=db.transaction([BLOBS,'drafts','snapshots'],'readwrite'),store=tx.objectStore(BLOBS);let acknowledged=false,failure:unknown,aborted=false;
  const fail=(error:unknown)=>{failure??=error;if(!aborted){aborted=true;tx.abort();}};
  readPrivateNotebookPolicyWithin(tx,captured,current,policy=>{if(policy.blockBlob(captured.documentId))return;const acknowledge=()=>{const read=store.get(blobKey(captured));read.onsuccess=()=>{const latest=read.result as LocalBlob|undefined;if(!current()||blobState(latest)!==blobState(captured))return;store.put({...latest!,status:'uploaded',serverId,revision:(latest!.revision??0)+1,key:blobKey(captured)});acknowledged=true;};};if(!policy.hasBlockedNotebooks){acknowledge();return;}if(!captured.documentId)return;const source=tx.objectStore('drafts').get(key({...captured,type:'whiteboard',documentId:captured.documentId}));source.onsuccess=()=>{if(current()&&privateBlobSourceAllowed(policy,captured,source.result))acknowledge();};},fail);
  tx.oncomplete=()=>{db.close();resolve(acknowledged);};tx.onerror=event=>{failure??=(event.target as IDBRequest|null)?.error??tx.error;};tx.onabort=()=>{db.close();reject(failure??tx.error??new Error('Confirmation du fichier interrompue.'));};
 });
}

/** Remove downloaded cache only; unsent edits and all recovery versions remain owned by their account. */
export async function clearPrivateCache(accountId: string) {
 const db=await openDb();return new Promise<void>((resolve,reject)=>{
  const tx=db.transaction(['drafts','snapshots',BLOBS,'mutations'],'readwrite');
  const rows:Record<string,unknown[]>={};let pending=4;
  for(const name of ['drafts','snapshots',BLOBS,'mutations']){const request=tx.objectStore(name).getAll();request.onsuccess=()=>{rows[name]=request.result;if(--pending)return;
   const removals=privateCacheRetention(accountId,rows.drafts as Draft[],rows.snapshots as Snapshot[],rows[BLOBS] as LocalBlob[],rows.mutations as Mutation[]);
   for(const key of removals.snapshotKeys)tx.objectStore('snapshots').delete(key);
   for(const blob of rows[BLOBS] as LocalBlob[])if(blob.accountId===accountId&&removals.blobIds.includes(blob.id))tx.objectStore(BLOBS).delete(blobKey(blob));
  };}
  tx.oncomplete=()=>{db.close();resolve();};tx.onabort=tx.onerror=()=>{db.close();reject(tx.error??new Error('Nettoyage du cache interrompu. Votre travail est conservé.'));};
 });
}

export async function deleteDraft(draftKey: DraftKey) { await run('drafts', 'readwrite', s => s.delete(key(draftKey))); }

/** Save the visible revision and its outbox entry in one durable transaction. */
export class DraftChangedError extends Error {}
/** Only an exact transfer CAS mismatch, never quota/IO or revoked authority. */
export class NotebookTransferChangedError extends DraftChangedError {
 constructor(message:string){super(message);this.name='NotebookTransferChangedError';}
}
export async function saveDraftAndQueue(draft: Draft, mutation: Mutation, expectedContent?: unknown, currentView: () => boolean = () => true, expectedLocalRevision?: Pick<Draft, 'content' | 'title' | 'updatedAt'>,privateTransport=false): Promise<Mutation> {
  // A manual Save can queue local/queued metadata. Its CAS is separate from
  // the legacy synced-only asset-reference precondition in expectedContent.
  if(mutation.paperPrepared!==undefined)throw new DraftChangedError('Un nouvel enregistrement ne peut pas réutiliser un ancien corps préparé.');
  const localRevision = expectedLocalRevision === undefined ? undefined : { content: JSON.stringify(expectedLocalRevision.content), title: expectedLocalRevision.title, updatedAt: expectedLocalRevision.updatedAt };
  if (!currentView()) throw new DraftChangedError('La session a changé avant l’enregistrement.');
  const db = await openDb();
  if (!currentView()) { db.close(); throw new DraftChangedError('La session a changé avant l’enregistrement.'); }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(privateTransport?['drafts','mutations','snapshots']:['drafts','mutations'], 'readwrite');
    const outbox = tx.objectStore('mutations');
    let queued = mutation;
    let changed = false;
    let failure: unknown;let privateFailure:unknown;
    const revoked = () => { changed = true; tx.abort(); };
    tx.oncomplete = () => { db.close(); resolve(queued); };
    // Request error bubbles precede rollback. Keep the operation pending until
    // the transaction confirms its terminal abort, including quota failures.
    tx.onerror = event => { failure = (event.target as IDBRequest | null)?.error ?? tx.error ?? failure; };
    tx.onabort = () => { db.close(); reject(privateFailure??(changed ? new DraftChangedError('Le document ou la session a changé avant l’enregistrement.') : tx.error ?? failure ?? new Error('Enregistrement interrompu'))); };
    if (!currentView()) { revoked(); return; }
    const proceed=()=>{const request = outbox.getAll();
    request.onsuccess = () => {
      if (!currentView()) { revoked(); return; }
      if((request.result as Mutation[]).some(row=>row.id===mutation.id)){changed=true;tx.abort();return;}
      const previous = (request.result as Mutation[]).filter(m => key(m) === key(draft));
      const drafts = tx.objectStore('drafts');
      const latest = drafts.get(key(draft));
      latest.onsuccess = () => {
        if (!currentView()) { revoked(); return; }
        const current = latest.result as Draft | undefined;
        if (expectedContent !== undefined && (current?.syncState !== 'synced' || JSON.stringify(current.content) !== JSON.stringify(expectedContent))) { changed = true; tx.abort(); return; }
        if (localRevision && (!current || JSON.stringify(current.content) !== localRevision.content || current.title !== localRevision.title || current.updatedAt !== localRevision.updatedAt)) { changed = true; tx.abort(); return; }
        if(current?.identityAlias&&(!samePaperOwner(current.content,draft.content)||!samePaperOwner(current.content,mutation.content))){changed=true;tx.abort();return;}
        if (current?.syncState === 'conflict' || previous.some(m => m.status === 'conflict')) { tx.abort(); return; }
        // A stroke can finish after the previous upload was acknowledged. React's
        // captured baseVersion then lags behind the durable version in IndexedDB.
        const acknowledged = Math.max(draft.baseVersion, current?.baseVersion ?? 0);
        const baseVersion = Math.max(acknowledged, ...previous.map(m => m.baseVersion + 1));
        queued = { ...mutation, baseVersion,...(current?.identityAlias?{identityAlias:current.identityAlias}:{}) };
        // A metadata Save owns these three fields. Reconciliation may already
        // have added a dependency or provenance field absent from its old view.
        const admitted = localRevision && current ? { ...current, content: draft.content, title: draft.title, updatedAt: draft.updatedAt } : draft;
        drafts.put({ ...admitted, baseVersion: acknowledged, key: key(draft), syncState: 'queued',...(current?.identityAlias?{identityAlias:current.identityAlias}:{}) });
        if (!currentView()) { revoked(); return; }
        outbox.put(queued);
      };
    };};
    if(privateTransport)readPrivateNotebookPolicyWithin(tx,draft,currentView,policy=>{if(policy.blockDocument(draft.type,draft.documentId,draft.content)||policy.blockDocument(mutation.type,mutation.documentId,mutation.content)){privateFailure=new PrivateNotebookBlockedError();tx.abort();return;}proceed();},error=>{privateFailure=error;tx.abort();});else proceed();
  });
}

/** Derived transport state is attached to, never substituted for, the original. */
const paperMutationSourceState=(mutation:Mutation)=>{const {paperPrepared:_prepared,...original}=mutation;return JSON.stringify(original);};
export async function paperMutationSourceDigest(mutation:Mutation){const state=paperMutationSourceState(mutation),bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(state));return [...new Uint8Array(bytes)].map(value=>value.toString(16).padStart(2,'0')).join('');}
const paperMutationOwner=(mutation:Mutation,draft:Draft|undefined)=>{
 if(!draft||draft.identityAlias||draft.staged||draft.syncState==='conflict'||draft.accountId!==mutation.accountId||draft.spaceId!==mutation.spaceId||draft.type!==mutation.type||draft.documentId!==mutation.documentId||!isPaperDocument(mutation.content)||!isPaperDocument(draft.content)||draft.content.noteId!==mutation.content.noteId)return false;
 return (draft.content.collaboration?.lineage??null)===(mutation.content.collaboration?.lineage??null);
};
function validPaperResolvedSource(source:unknown,resolved:unknown){
 if(!isPaperDocument(source)||!isPaperDocument(resolved)||source.noteId!==resolved.noteId||source.assets.length!==resolved.assets.length||(source.collaboration?.lineage??null)!==(resolved.collaboration?.lineage??null))return false;
 for(let i=0;i<source.assets.length;i++){
  const {serverId:oldServer,...old}=source.assets[i],{serverId:server,...next}=resolved.assets[i];
  if(JSON.stringify(old)!==JSON.stringify(next)||!server||oldServer!==undefined&&oldServer!==server)return false;
 }
 const refs=[...new Set(resolved.assets.map(asset=>asset.serverId))],actual=(resolved as unknown as {blob_ids?:unknown}).blob_ids;
 if(actual===undefined?refs.length!==0:!Array.isArray(actual)||JSON.stringify(actual)!==JSON.stringify(refs))return false;
 const {assets:_assets,collaboration:_collaboration,blob_ids:_refs,...body}=resolved as typeof resolved&{blob_ids?:unknown};
 const {assets:_oldAssets,collaboration:_oldCollaboration,blob_ids:_oldRefs,...original}=source as typeof source&{blob_ids?:unknown};
 return JSON.stringify(body)===JSON.stringify(original);
}
/** Freeze the exact resolved graph before its first encode/PUT. A newer local
 * draft is a different accepted contribution and is never overwritten here. */
export async function preparePaperMutation(expected:Mutation,content:unknown,current:()=>boolean=()=>true):Promise<Mutation>{
 if(!current())throw new DraftChangedError('La session a changé avant la préparation de l’envoi.');
 const captured=structuredClone(expected),resolved=structuredClone(content),expectedState=JSON.stringify(captured);
 if(captured.type!=='whiteboard'||captured.identityAlias||captured.status!=='pending'||!isPaperDocument(captured.content)||captured.documentId!==notebookDocumentId(captured.content.noteId)||!validPaperResolvedSource(captured.content,resolved))throw new DraftChangedError('La préparation ne correspond pas à l’original de cette note.');
 const source=captured.content;
 const sourceSha256=await paperMutationSourceDigest(captured);if(!current())throw new DraftChangedError('La session a changé pendant la préparation de l’envoi.');
 const previous=captured.paperPrepared;
 if(previous&&(previous.schema!==1||previous.sourceSha256!==sourceSha256||JSON.stringify(previous.content)!==JSON.stringify(resolved)||!previous.draft||typeof previous.draft.title!=='string'||!Number.isFinite(previous.draft.updatedAt)||Object.keys(previous).some(key=>!['schema','sourceSha256','content','draft'].includes(key))||Object.keys(previous.draft).some(key=>!['title','updatedAt'].includes(key))))throw new DraftChangedError('L’envoi possède déjà un autre original préparé. Sa file reste conservée.');
 const db=await openDb();if(!current()){db.close();throw new DraftChangedError('La session a changé avant la conservation de l’envoi.');}
 const prepared=await new Promise<Mutation>((resolve,reject)=>{
  let tx:IDBTransaction;try{tx=db.transaction(['drafts','mutations','snapshots',BLOBS],'readwrite');}catch(error){db.close();reject(error);return;}
  const outbox=tx.objectStore('mutations');let mutation:Mutation|undefined,draft:Draft|undefined,deletion:Snapshot|undefined,result:Mutation|undefined,failure:unknown,aborted=false,left=4,policy:PrivateNotebookSyncPolicy|undefined;
  const abort=(error:unknown)=>{failure??=error;if(!aborted){aborted=true;tx.abort();}};
  const changed=()=>new DraftChangedError('La mutation, son propriétaire ou sa session a changé avant l’envoi. Les originaux restent conservés.');
  const write=()=>{
   if(policy?.blockDocument(captured.type,captured.documentId,captured.content)){abort(new PrivateNotebookBlockedError());return;}
   if(!current()||JSON.stringify(mutation)!==expectedState||!paperMutationOwner(captured,draft)||deletion){abort(changed());return;}
   result=previous?captured:{...captured,paperPrepared:{schema:1,sourceSha256,content:resolved,draft:{title:draft!.title,updatedAt:draft!.updatedAt}}};
   if(!previous){try{outbox.put(result);}catch(error){abort(error);}}
  };
  const checked=()=>{if(aborted)return;if(!current()){abort(changed());return;}if(--left===0)write();};
  readPrivateNotebookPolicyWithin(tx,captured,current,value=>{policy=value;checked();},abort);
  const readMutation=outbox.get(captured.id);readMutation.onsuccess=()=>{mutation=readMutation.result;checked();};
  const readDraft=tx.objectStore('drafts').get(key(captured));readDraft.onsuccess=()=>{draft=readDraft.result;checked();};
  const readDeletion=tx.objectStore('snapshots').get(notebookDeletionKey(captured));readDeletion.onsuccess=()=>{deletion=readDeletion.result;checked();};
  if(!previous){for(let i=0;i<source.assets.length;i++){
   const original=source.assets[i],asset=(resolved as typeof source).assets[i];if(original.serverId)continue;left++;
   const read=tx.objectStore(BLOBS).get(blobKey({...captured,id:original.id}));read.onsuccess=()=>{
    const file=read.result as LocalBlob|undefined;
    if(!file||file.accountId!==captured.accountId||file.spaceId!==captured.spaceId||file.status!=='uploaded'||file.serverId!==asset.serverId||file.documentId&&file.documentId!==captured.documentId){abort(changed());return;}checked();
   };
  }}
  tx.oncomplete=()=>{db.close();resolve(result!);};tx.onerror=event=>{failure??=(event.target as IDBRequest|IDBTransaction|null)?.error??tx.error??undefined;};tx.onabort=()=>{db.close();reject(failure??tx.error??new Error('La préparation de l’envoi attend sa conservation.'));};
 });
 if(!current())throw new DraftChangedError('La session a changé après la conservation de l’envoi.');return prepared;
}

/** An acknowledgement owns only the exact queued original and preparation. */
export async function acknowledgeMutation(mutation: Mutation, version: number, acknowledgedContent?: unknown,current:()=>boolean=()=>true) {
 if(!current())throw new DraftChangedError('La session a changé avant la confirmation.');
 const captured=structuredClone(mutation),expectedState=JSON.stringify(captured),content=acknowledgedContent===undefined?undefined:structuredClone(acknowledgedContent),prepared=captured.paperPrepared;
 if(prepared&&JSON.stringify(content)!==JSON.stringify(prepared.content))throw new DraftChangedError('La confirmation ne correspond pas au corps préparé.');
 const db=await openDb();if(!current()){db.close();throw new DraftChangedError('La session a changé avant la confirmation.');}
 return new Promise<boolean>((resolve,reject)=>{
  let tx:IDBTransaction;try{tx=db.transaction(['drafts','mutations','snapshots'],'readwrite');}catch(error){db.close();reject(error);return;}
  const drafts=tx.objectStore('drafts'),outbox=tx.objectStore('mutations');let stored:Mutation|undefined,draft:Draft|undefined,deletion:Snapshot|undefined,left=prepared?4:3,policy:PrivateNotebookSyncPolicy|undefined,acknowledged=false,failure:unknown,aborted=false;
  const abort=()=>{if(!aborted){aborted=true;failure??=new DraftChangedError('La session a changé pendant la confirmation.');tx.abort();}};
  const checked=()=>{
   if(aborted)return;if(!current()){abort();return;}if(--left)return;
   if(policy?.blockDocument(captured.type,captured.documentId,captured.content))return;
   if(!stored||JSON.stringify(stored)!==expectedState||stored.identityAlias||stored.status!=='pending'||!draft||draft.identityAlias||draft.syncState==='conflict'||prepared&&(!paperMutationOwner(captured,draft)||deletion))return;
   const same=JSON.stringify(draft.content)===JSON.stringify(captured.content)&&(!prepared||draft.title===prepared.draft.title&&draft.updatedAt===prepared.draft.updatedAt);
   try{drafts.put({...draft,key:key(captured),baseVersion:Math.max(draft.baseVersion,version),content:same&&content!==undefined?content:draft.content,syncState:same?'synced':draft.syncState});if(!current()){abort();return;}outbox.delete(captured.id);acknowledged=true;}catch(error){failure=error;abort();}
  };
  readPrivateNotebookPolicyWithin(tx,captured,current,value=>{policy=value;checked();},error=>{failure??=error;abort();});
  const read=outbox.get(captured.id);read.onsuccess=()=>{stored=read.result;checked();};const readDraft=drafts.get(key(captured));readDraft.onsuccess=()=>{draft=readDraft.result;checked();};
  if(prepared){const deletionRead=tx.objectStore('snapshots').get(notebookDeletionKey(captured));deletionRead.onsuccess=()=>{deletion=deletionRead.result;checked();};}
  tx.oncomplete=()=>{db.close();resolve(acknowledged);};tx.onerror=event=>{failure??=(event.target as IDBRequest|IDBTransaction|null)?.error??tx.error??undefined;};tx.onabort=()=>{db.close();reject(failure??tx.error??new Error('Confirmation interrompue'));};
 });
}

/** Read and update in one transaction: a remote response cannot overwrite a new local edit. */
export async function applyChangePage(accountId: string, spaceId: string, page: ChangePage,current:()=>boolean=()=>true,transport:{deferred?:ChangePage['items'];raw?:PrivateNotebookRawChange[]}={}) {
  if(!current())throw new DraftChangedError('La source a changé avant la réception.');
  if(page.items.some(change=>change.space_id!==spaceId))throw Error('La réponse reçue appartient à une autre année. Les notes locales restent conservées.');
  const db = await openDb();if(!current()){db.close();throw new DraftChangedError('La source a changé avant la réception.');}
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['drafts', 'snapshots'], 'readwrite');
    const drafts = tx.objectStore('drafts');let failure:unknown,aborted=false;const fail=(error:unknown)=>{failure??=error;if(!aborted){aborted=true;tx.abort();}};
    if(!current())fail(new DraftChangedError('La source a changé avant la réception.'));
    else readPrivateNotebookPolicyWithin(tx,{accountId,spaceId},current,policy=>{
    const originals=new Map((transport.raw??[]).map(row=>[`${row.identity.type}|${row.identity.documentId}`,row.change]));
    for(const raw of transport.deferred??[])quarantinePrivateChangeWithin(tx,{accountId,spaceId},raw,current,fail);
    // Only the newest revision of each document in this page is relevant.
    const changes = new Map(page.items.map(change => [`${change.document_type}|${change.document_id}`, change]));
    for (const change of changes.values()) {
      const identity = { accountId, spaceId, type: change.document_type, documentId: change.document_id };
      if(policy.blockDocument(change.document_type,change.document_id,change.content)&&!(change.document_type==='whiteboard'&&canonicalNotebookKey(change.document_id).canonical&&policy.hasCanonicalDeletion(change.document_id)&&!policy.blockManagedOrTrashedDocument(change.document_type,change.document_id,change.content))){quarantinePrivateChangeWithin(tx,{accountId,spaceId},originals.get(`${change.document_type}|${change.document_id}`)??change,current,fail);continue;}
      const versionKey = `sync-version|${key(identity)}`;
      const version = tx.objectStore('snapshots').get(versionKey);
      version.onsuccess = () => {
        if (typeof version.result?.value === 'number' && version.result.value >= change.version) return;
        const request = drafts.get(key(identity));
        request.onsuccess = () => {
          if(!current()){tx.abort();return;}
          const existing = request.result as Draft | undefined;
          if(existing?.identityAlias){
            // This key is retained provenance. Its remote versions never share the
            // version counter or tombstone of the promoted document.
            const snapshots=tx.objectStore('snapshots');
            const incomingNote=paperNoteId(change.content),owner=paperNoteId(existing.content);
            const collision=!change.deleted&&(!owner||incomingNote!==owner||!isPaperDocument(change.content));
            snapshots.put({key:`paper-identity-source|${key(identity)}|${change.version}`,accountId,spaceId,value:{schema:1,kind:collision?'paper-identity-collision':'paper-identity-source',alias:existing.identityAlias,source:existing,incoming:change,receivedAt:Date.now()}});
            snapshots.put({key:versionKey,accountId,spaceId,value:change.version});
            if(!collision&&change.version>existing.baseVersion){
              const content=change.deleted?existing.content:change.content;
              const title=(content as {title?:unknown})?.title;
              drafts.put({...existing,key:key(existing),content,title:typeof title==='string'?title:existing.title,baseVersion:change.version,updatedAt:Date.parse(change.changed_at)||Date.now(),syncState:'synced'});
            }
            return;
          }
          if(existing&&existing.baseVersion>=change.version)return;
          const snapshots=tx.objectStore('snapshots');
          const accept=()=>{
           if(existing&&existing.syncState!=='synced')return;
           snapshots.put({key:versionKey,accountId,spaceId,value:change.version});
           if(change.deleted){drafts.delete(key(identity));return;}
           const content=change.content as {title?:string};
           drafts.put({...identity,key:key(identity),title:content?.title??(change.document_type==='notesMarkdown'?'Note synchronisée':change.document_type),content,baseVersion:change.version,updatedAt:Date.parse(change.changed_at)||Date.now(),syncState:'synced'});
          };
          if(change.document_type!=='whiteboard'||!change.document_id.startsWith('paper-v3-')){accept();return;}
          const deletionKey=notebookDeletionKey(identity),readDeletion=snapshots.get(deletionKey);
          readDeletion.onsuccess=()=>{
           if(!current()){tx.abort();return;}
           const markerRow=readDeletion.result as Snapshot|undefined,marker=markerRow?.accountId===accountId&&markerRow.spaceId===spaceId&&validNotebookDeletion(markerRow.value,identity)?markerRow.value:undefined;
           if(markerRow&&!marker){snapshots.put({key:`paper-canonical-invalid|${key(identity)}|${change.version}`,accountId,spaceId,value:{reason:'invalid-deletion-scope',incoming:change}});snapshots.put({key:versionKey,accountId,spaceId,value:change.version});return;}
           const canonicalKey=canonicalNotebookKey(change.document_id),existingOwned=isPaperDocument(existing?.content)&&notebookDocumentId(existing.content.noteId)===change.document_id;
           if(change.deleted&&(canonicalKey.canonical||existingOwned||marker)){
            const noteId=existingOwned?(existing!.content as {noteId:string}).noteId:marker?.noteId??canonicalKey.noteId;
            const status:NotebookDeletionStatus={schema:1,kind:'paper-canonical-deletion',accountId,spaceId,documentId:change.document_id,...(noteId!==undefined?{noteId}:{}),version:change.version,deletedAt:Date.parse(change.changed_at)||Date.now(),...(existing?{source:existing}:{})};
            if(markerRow)snapshots.put({...markerRow,key:`${deletionKey}|history-${crypto.randomUUID()}`});
            snapshots.put({key:deletionKey,accountId,spaceId,value:status});snapshots.put({key:versionKey,accountId,spaceId,value:change.version});
            if(existing&&existing.syncState!=='synced'){
             snapshots.put({key:`paper-resolution|${key(identity)}|canonical-deletion-${crypto.randomUUID()}`,accountId,spaceId,value:{durable:existing,visibleContent:existing.content,server:null,deletion:status}});
             drafts.put({...existing,key:key(existing),syncState:'conflict',conflict:{...(existing.conflict&&typeof existing.conflict==='object'?existing.conflict:{}),serverVersion:change.version,canonicalDeletion:deletionKey}});
            }else drafts.delete(key(identity));
            return;
           }
           if(markerRow){
            const validOwner=marker&&isPaperDocument(change.content)&&notebookDocumentId(change.content.noteId)===change.document_id&&(marker.noteId===undefined||marker.noteId===change.content.noteId);
            if(!change.deleted&&validOwner&&change.version>marker.version){
             snapshots.put({...markerRow,key:`${deletionKey}|history-${crypto.randomUUID()}`});snapshots.delete(deletionKey);
            }else{
             snapshots.put({key:`paper-canonical-invalid|${key(identity)}|${change.version}`,accountId,spaceId,value:{deletion:markerRow.value,incoming:change,source:existing}});
             snapshots.put({key:versionKey,accountId,spaceId,value:change.version});return;
            }
           }
           accept();
          };
        };
      };
    }
    tx.objectStore('snapshots').put({ key: `sync-cursor|${accountId}|${spaceId}`, accountId, spaceId, value: page.next_cursor });
    },fail);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror=event=>{failure??=(event.target as IDBRequest|null)?.error??tx.error;};
    tx.onabort=()=>{db.close();reject(failure??tx.error??new Error('Réception interrompue'));};
  });
}

/** Queue the latest durable edits, coalescing keystrokes before network transfer. */
export async function queueLocalDrafts(accountId: string, spaceId: string,accept:(type:string,id:string)=>boolean=()=>true,current:()=>boolean=()=>true) {
  if(!current())throw new DraftChangedError('La source a changé avant sa mise en attente.');
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['drafts', 'mutations','snapshots'], 'readwrite');
    const drafts = tx.objectStore('drafts'), outbox = tx.objectStore('mutations');
    let failure:unknown,aborted=false;const fail=(error:unknown)=>{failure??=error;if(!aborted){aborted=true;tx.abort();}};
    readPrivateNotebookPolicyWithin(tx,{accountId,spaceId},current,policy=>{
    const request = outbox.getAll();
    request.onsuccess = () => {
      const mutations = request.result as Mutation[];
      const rows = drafts.getAll();
      rows.onsuccess = () => {
        for (const draft of rows.result as Draft[]) {
          if(!current()){fail(new DraftChangedError('La source a changé pendant sa mise en attente.'));return;}
          if(draft.accountId!==accountId||draft.spaceId!==spaceId)continue;
          if(policy.blockDocument(draft.type,draft.documentId,draft.content))continue;
          if (draft.accountId !== accountId || draft.spaceId !== spaceId || draft.syncState !== 'local'||draft.staged||draft.identityAlias||!accept(draft.type,draft.documentId)) continue;
          const pending = mutations.filter(m => key(m) === key(draft));
          if (pending.some(m => m.status === 'conflict')) continue;
          const baseVersion = Math.max(draft.baseVersion, ...pending.map(m => m.baseVersion + 1));
          outbox.put({ accountId, spaceId, type: draft.type, documentId: draft.documentId, content: draft.content,
            id: crypto.randomUUID(), baseVersion, createdAt: Date.now(), status: 'pending' });
          drafts.put({ ...draft, key: key(draft), syncState: 'queued' });
        }
      };
    };
    },fail);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror=event=>{failure??=(event.target as IDBRequest|null)?.error??tx.error;};
    tx.onabort=()=>{db.close();reject(failure??tx.error??new Error('Mise en attente interrompue'));};
  });
}

/** Preserve the local edit as a new document, then display the server's original. */
export async function resolveConflictedDocument(original: Draft, server: Draft | null, serverVersion: number, choice: 'local' | 'server', resolutionId: string,current:()=>boolean=()=>true,privateTransport=false): Promise<void> {
  if(!current())throw new DraftChangedError('La source du conflit a changé. Les originaux restent conservés.');
  if(privateTransport){original=structuredClone(original);server=structuredClone(server);}
  if (server && key(server) !== key(original)) throw new Error('Résolution hors du compte ou de l’année refusée.');
  const db = await openDb();if(!current()){db.close();throw new DraftChangedError('La source du conflit a changé.');}
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['drafts', 'mutations', 'snapshots'], 'readwrite');
    const drafts = tx.objectStore('drafts'), outbox = tx.objectStore('mutations'),snapshots=tx.objectStore('snapshots'),receiptKey=`resolved-conflict:${key(original)}:${resolutionId}`;let failure:unknown,aborted=false;
    const fail=(error:unknown)=>{failure??=error;if(!aborted){aborted=true;tx.abort();}};
    const changed=()=>new DraftChangedError('Le document ou sa source a changé ; les versions du conflit restent conservées.');
    const proceed=()=>{const read = drafts.get(key(original));
    read.onsuccess = () => {
      const latest = read.result as Draft | undefined;
      if(!current()||!latest||latest.syncState!=='conflict'||JSON.stringify(latest.content)!==JSON.stringify(original.content)||privateTransport&&(latest.identityAlias||draftState(latest)!==draftState(original))){fail(changed());return;}
      const write=()=>{const all = outbox.getAll();all.onsuccess = () => {
        if(!current()){fail(changed());return;}const branches=(all.result as Mutation[]).filter(mutation=>key(mutation)===key(original));
        for (const mutation of branches) outbox.delete(mutation.id);
        snapshots.put({ key:receiptKey, accountId: original.accountId, spaceId: original.spaceId, value: { original, server, choice,...(privateTransport?{mutations:branches}:{}) } });
        const selected = choice === 'local' ? { ...original, baseVersion: serverVersion, syncState: 'local', conflict: undefined, updatedAt: Date.now() } : server;
        if (selected) drafts.put({ ...selected, key: key(original) }); else drafts.delete(key(original));
        snapshots.put({ key: `sync-version|${key(original)}`, accountId: original.accountId, spaceId: original.spaceId, value: serverVersion });
      };};
      if(privateTransport){const receipt=snapshots.get(receiptKey);receipt.onsuccess=()=>{if(!current()||receipt.result!==undefined){fail(changed());return;}write();};}else write();
    };};
    if(privateTransport)readPrivateNotebookPolicyWithin(tx,original,current,policy=>{if(policy.blockDocument(original.type,original.documentId,original.content)||server&&policy.blockDocument(server.type,server.documentId,server.content)){fail(new PrivateNotebookBlockedError());return;}proceed();},fail);else proceed();
    tx.oncomplete = () => { db.close(); resolve(); };
    if(privateTransport){tx.onerror=event=>{failure??=(event.target as IDBRequest|null)?.error??tx.error;};tx.onabort=()=>{db.close();reject(failure??tx.error??new Error('Le document a changé ; rechargez le conflit.'));};}
    else tx.onabort=tx.onerror=()=>{db.close();reject(tx.error??new Error('Le document a changé ; rechargez le conflit.'));};
  });
}

export async function forkConflictedDraft(original: Draft, server: Draft | null, copyId: string): Promise<Draft> {
  const copy: Draft = { ...original, documentId: copyId, title: `${original.title} (copie locale)`, baseVersion: 0,
    content: { ...(original.content as object), title: `${original.title} (copie locale)` }, syncState: 'local', conflict: undefined, updatedAt: Date.now() };
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['drafts', 'mutations', 'snapshots'], 'readwrite');
    const drafts = tx.objectStore('drafts'), outbox = tx.objectStore('mutations');
    const all = outbox.getAll();
    all.onsuccess = () => {
      for (const mutation of all.result as Mutation[]) if (key(mutation) === key(original)) outbox.delete(mutation.id);
      tx.objectStore('snapshots').put({ key: `resolved-conflict:${key(original)}:${copyId}`, accountId: original.accountId, spaceId: original.spaceId, value: { original, server } });
      drafts.put({ ...copy, key: key(copy) });
      if (server) drafts.put({ ...server, key: key(server) }); else drafts.delete(key(original));
    };
    tx.oncomplete = () => { db.close(); resolve(copy); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error ?? new Error('Résolution non enregistrée')); };
  });
}

/** Notebook revisions, outbox precursor and recovery snapshot are committed together. */
export async function savePaperDraft(draft: Draft, expectedRevision: number | null, recovery?: unknown) {
  const db=await openDb();
  return new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(['drafts','snapshots'],'readwrite');
    const drafts=tx.objectStore('drafts'),snapshots=tx.objectStore('snapshots');
    const read=drafts.get(key(draft));let reason='Enregistrement de la note interrompu.';
    read.onsuccess=()=>{
      const current=read.result as Draft|undefined;
      const revision=(current?.content as {revision?:number}|undefined)?.revision;
      if(current?.syncState==='conflict'||current?.identityAlias&&!samePaperOwner(current.content,draft.content)||(expectedRevision===null?!!current:revision!==expectedRevision)){
        reason='Cette note a été modifiée ailleurs. Rechargez avant de continuer.';tx.abort();return;
      }
      if(current)snapshots.put({key:`paper-history|${key(draft)}|${String(revision).padStart(12,'0')}`,accountId:draft.accountId,spaceId:draft.spaceId,value:current.content});
      if(recovery!==undefined)snapshots.put({key:`paper-migration|${key(draft)}`,accountId:draft.accountId,spaceId:draft.spaceId,value:recovery});
      drafts.put({...draft,key:key(draft),baseVersion:Math.max(draft.baseVersion,current?.baseVersion??0),syncState:'local',...(current?.identityAlias?{identityAlias:current.identityAlias}:{})});
      const prefix=`paper-history|${key(draft)}|`,retained:string[]=[],histories=snapshots.openKeyCursor();
      histories.onsuccess=()=>{
        const cursor=histories.result;if(!cursor)return;
        if(indexedDB.cmp(cursor.key,prefix)<0){cursor.continue(prefix);return;}
        const historyKey=cursor.key;if(typeof historyKey!=='string'||!historyKey.startsWith(prefix))return;
        // The former getAll/stable localeCompare sort kept the last twenty.
        // Insert after equal locale keys so their native IDB order stays exact,
        // while retaining at most twenty-one keys and no historical bodies.
        const at=retained.findIndex(value=>value.localeCompare(historyKey)>0);
        if(at<0)retained.push(historyKey);else retained.splice(at,0,historyKey);
        if(retained.length>20)snapshots.delete(retained.shift()!);
        cursor.continue();
      };
    };
    tx.oncomplete=()=>{db.close();resolve();};
    tx.onabort=tx.onerror=()=>{db.close();reject(tx.error??new Error(reason));};
  });
}

export interface RecordedAudioPart {assetId:string;chunkIds:string[];frames:number;offset:number;duration:number}
export interface RecordingWallSpan {start:number;end:number;offset:number}
export interface AudioRecordingJournal {writeRevision?:number;objectMarks?:Record<string,number>;pcm?:{schema:1;sampleRate:number;channels:number;frames:number};parts?:RecordedAudioPart[];spans?:RecordingWallSpan[];id:string;noteId:string;mimeType:string;name:string;startedAt:number;chunkIds:string[];size:number;duration:number;status:'recording'|'recoverable'|'completed'}
export interface AudioRecordingScope {accountId:string;spaceId:string;noteId:string}
export interface AudioRecordingLease extends AudioRecordingScope {owner:string;expiresAt:number}
const audioLeaseKey=(scope:AudioRecordingScope)=>`audio-lease|${JSON.stringify([scope.accountId,scope.spaceId,scope.noteId])}`;
const audioJournalKey=(scope:AudioRecordingScope,id:string)=>`audio-recording|${scope.accountId}|${scope.spaceId}|${scope.noteId}|${id}`;
function validLease(value:unknown):value is AudioRecordingLease {const lease=value as AudioRecordingLease;return !!lease&&typeof lease==='object'&&['accountId','spaceId','noteId','owner'].every(key=>typeof (lease as unknown as Record<string,unknown>)[key]==='string')&&Number.isFinite(lease.expiresAt);}
/** The read and ownership change share an IndexedDB transaction across every tab. */
export async function updateAudioRecordingLease(scope:AudioRecordingScope,owner:string,mode:'claim'|'renew'|'release',now=Date.now(),ttl=120000):Promise<AudioRecordingLease|null>{
 if(!owner||!Number.isFinite(now)||!Number.isSafeInteger(ttl)||ttl<1000||ttl>300000)throw Error('Bail audio incompatible.');const db=await openDb();return new Promise((resolve,reject)=>{
 const tx=db.transaction('snapshots','readwrite'),store=tx.objectStore('snapshots'),key=audioLeaseKey(scope),read=store.get(key);let result:AudioRecordingLease|null=null;
 read.onsuccess=()=>{const existing=(read.result as Snapshot|undefined)?.value,current=validLease(existing)?existing:null;
  if(mode==='release'){if(current?.owner===owner)store.delete(key);return;}
  if(mode==='renew'&&(!current||current.owner!==owner||current.expiresAt<=now))return;
  if(mode==='claim'&&current&&current.expiresAt>now&&current.owner!==owner)return;
  result={...scope,owner,expiresAt:now+ttl};store.put({key,accountId:scope.accountId,spaceId:scope.spaceId,value:result});
 };tx.oncomplete=()=>{db.close();resolve(result);};tx.onabort=tx.onerror=()=>{db.close();reject(tx.error??Error('Le bail audio ne peut pas être conservé.'));};
 });
}
export async function getAudioRecordingJournal(scope:AudioRecordingScope,id:string):Promise<AudioRecordingJournal|undefined>{const snapshot=await run<Snapshot|undefined>('snapshots','readonly',store=>store.get(audioJournalKey(scope,id)));const value=snapshot?.value as AudioRecordingJournal|undefined;return value?.noteId===scope.noteId&&value.id===id?value:undefined;}
/** Chunk, CAS journal and live ownership are committed together, or none is changed. */
export async function saveAudioChunk(accountId:string,spaceId:string,journal:AudioRecordingJournal,blob?:Blob,options:{lease?:AudioRecordingLease;expectedRevision?:number|null}={}):Promise<AudioRecordingJournal>{
 const scope={accountId,spaceId,noteId:journal.noteId},lease=options.lease;if(lease&&(lease.accountId!==accountId||lease.spaceId!==spaceId||lease.noteId!==journal.noteId))throw Error('Écriture audio hors du compte, de l’année ou de la note.');
 const sha256=blob?await localBlobDigest(blob):undefined;
 const db=await openDb();return new Promise((resolve,reject)=>{
 const tx=db.transaction([BLOBS,'snapshots'],'readwrite'),snapshots=tx.objectStore('snapshots'),journalKey=audioJournalKey(scope,journal.id);let reason='L’enregistrement audio n’a pas pu être conservé.',saved:AudioRecordingJournal;
 const abort=(message:string)=>{reason=message;tx.abort();};
 const leaseRead=snapshots.get(audioLeaseKey(scope));leaseRead.onsuccess=()=>{const currentLease=(leaseRead.result as Snapshot|undefined)?.value;
  if(lease?(!validLease(currentLease)||currentLease.owner!==lease.owner||currentLease.expiresAt<=Date.now()):(validLease(currentLease)&&currentLease.expiresAt>Date.now())){abort('Cet enregistrement est conservé par un autre onglet. Les portions déjà enregistrées restent intactes.');return;}
  const read=snapshots.get(journalKey);read.onsuccess=()=>{const existing=(read.result as Snapshot|undefined)?.value as AudioRecordingJournal|undefined;
   if(options.expectedRevision===null?existing!==undefined:options.expectedRevision!==undefined&&(existing?.writeRevision??0)!==options.expectedRevision){abort('Le journal audio a changé. Relisez sa version conservée avant de reprendre.');return;}
   if(blob){const id=journal.chunkIds.at(-1);if(!id){abort('Cette portion audio n’a pas de référence.');return;}const store=tx.objectStore(BLOBS),readBlob=store.get(blobKey({id,accountId,spaceId}));readBlob.onsuccess=()=>{const old=readBlob.result as LocalBlob|undefined;if(old&&old.sha256!==sha256){abort('Cette portion audio possède déjà une autre source. Aucune n’est remplacée.');return;}store.put({key:blobKey({id,accountId,spaceId}),id,documentId:`audio-${journal.id}`,accountId,spaceId,blob,sha256,revision:(old?.revision??0)+1,name:journal.name,createdAt:Date.now(),status:'pending',removedFromNote:true});};}
   saved={...journal,writeRevision:(existing?.writeRevision??0)+1};snapshots.put({key:journalKey,accountId,spaceId,value:saved});
  };
 };
 tx.oncomplete=()=>{db.close();resolve(saved);};tx.onabort=tx.onerror=()=>{db.close();reject(tx.error??new Error(reason));};
 });
}

/** Keep both originals and any unsaved visible edits before changing the conflict winner. */
export async function resolvePaperDraft(durable:Draft,visibleContent:unknown,server:Draft|null,serverVersion:number,selectedContent:unknown,resolutionId:string,current:()=>boolean=()=>true,privateTransport=false):Promise<Draft>{
 if(!current())throw new DraftChangedError('La connexion a changé avant la résolution de la note.');
 if(privateTransport){durable=structuredClone(durable);visibleContent=structuredClone(visibleContent);server=structuredClone(server);selectedContent=structuredClone(selectedContent);}
 if(durable.identityAlias)throw new DraftChangedError('La note a changé d’identité avant sa résolution.');
 if(server&&key(server)!==key(durable))throw new Error('Résolution hors du compte ou de l’année refusée.');
 const db=await openDb();if(!current()){db.close();throw new DraftChangedError('La connexion a changé avant la résolution de la note.');}const selected:Draft={...durable,content:selectedContent,baseVersion:serverVersion,syncState:'local',conflict:undefined,updatedAt:Date.now()};
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(['drafts','mutations','snapshots'],'readwrite'),drafts=tx.objectStore('drafts'),outbox=tx.objectStore('mutations'),snapshots=tx.objectStore('snapshots'),receiptKey=`paper-resolution|${key(durable)}|${resolutionId}`;
  let failure:unknown,aborted=false;const fail=(error?:unknown)=>{failure??=error;if(!aborted){aborted=true;tx.abort();}};
  const proceed=()=>{
  const read=drafts.get(key(durable));read.onsuccess=()=>{
   const latest=read.result as Draft|undefined;
   if(!current()||!latest||latest.identityAlias||latest.baseVersion!==durable.baseVersion||JSON.stringify(latest.content)!==JSON.stringify(durable.content)||privateTransport&&draftState(latest)!==draftState(durable)){fail(privateTransport?new DraftChangedError('La source enregistrée a changé pendant la résolution. Les originaux restent conservés.'):undefined);return;}
   const write=()=>{const all=outbox.getAll();all.onsuccess=()=>{
    if(!current()){fail();return;}const branches=(all.result as Mutation[]).filter(mutation=>key(mutation)===key(durable));
    for(const mutation of branches)outbox.delete(mutation.id);
    snapshots.put({key:receiptKey,accountId:durable.accountId,spaceId:durable.spaceId,value:{durable,visibleContent,server,selectedRevision:(selectedContent as {revision?:number})?.revision,...(privateTransport?{mutations:branches}:{})}});
    drafts.put({...selected,key:key(durable)});
    snapshots.put({key:`sync-version|${key(durable)}`,accountId:durable.accountId,spaceId:durable.spaceId,value:serverVersion});
   };};
   if(privateTransport){const receipt=snapshots.get(receiptKey);receipt.onsuccess=()=>{if(!current()||receipt.result!==undefined){fail(new DraftChangedError('Le reçu ou la source de cette résolution a changé. Les originaux restent conservés.'));return;}write();};}else write();
  };
  };if(privateTransport)readPrivateNotebookPolicyWithin(tx,durable,current,policy=>{if(policy.blockDocument(durable.type,durable.documentId,durable.content)||policy.blockDocument(durable.type,durable.documentId,selectedContent)||server&&policy.blockDocument(server.type,server.documentId,server.content)){fail(new PrivateNotebookBlockedError());return;}proceed();},fail);else proceed();
  tx.oncomplete=()=>{db.close();resolve(selected);};
  tx.onerror=event=>{failure??=(event.target as IDBRequest|IDBTransaction|null)?.error??tx.error??undefined;};
  tx.onabort=()=>{db.close();reject(failure??tx.error??new Error('La note a changé pendant la résolution. Rechargez ses versions.'));};
 });
}

/** A captured copy/import is activated only while its source still owns admission.
 * The native transaction reads and writes the same latest row; no stale body is
 * republished. Quota/IO settle only after the real terminal abort. */
export async function activateStagedDraft(identity:DraftKey,current:()=>boolean=()=>true){
 const captured={accountId:identity.accountId,spaceId:identity.spaceId,documentId:identity.documentId,type:identity.type??'notesMarkdown'};
 let revoked=false;
 const active=()=>{if(revoked)return false;try{if(current()!==true)revoked=true;}catch{revoked=true;}return !revoked;};
 const changed=()=>Error('La source de l’import a changé. Ses originaux restent conservés.');
 if(!active())throw changed();const db=await openDb();if(!active()){db.close();throw changed();}
 await new Promise<void>((resolve,reject)=>{
  let tx:IDBTransaction;try{tx=db.transaction(['drafts','snapshots'],'readwrite');}catch(error){db.close();reject(error);return;}
  const store=tx.objectStore('drafts');let failure:unknown,reason='L’import attend sa finalisation ; ses données restent conservées.',aborted=false;
  const abort=(error?:unknown)=>{failure??=error;if(!aborted){aborted=true;tx.abort();}};
  const read=store.get(key(captured));read.onsuccess=()=>{
   const draft=read.result as Draft|undefined;
   if(!active()){abort(changed());return;}
   if(!draft||draft.accountId!==captured.accountId||draft.spaceId!==captured.spaceId||draft.type!==captured.type||draft.documentId!==captured.documentId||draft.identityAlias||draft.syncState==='conflict'){abort();return;}
   const write=()=>{if(!active()){abort(changed());return;}if(!draft.staged)return;try{const {staged:_staged,...activated}=draft;store.put({...activated,key:key(captured)});}catch(error){abort(error);}};
   if(isPaperDocument(draft.content)){
    if(captured.type!=='whiteboard'||captured.documentId!==notebookDocumentId(draft.content.noteId)){abort();return;}
    const deletion=tx.objectStore('snapshots').get(notebookDeletionKey(captured));deletion.onsuccess=()=>{
     if(!active()){abort(changed());return;}
     // A malformed scoped tombstone is also a refusal, never permission to
     // resurrect this row. Explicit restoration has its own separate receipt.
     if(deletion.result){reason='Cette note a été supprimée ou son reçu doit être vérifié. Ses sources restent conservées.';abort();return;}write();
    };
   }else write();
  };
  tx.oncomplete=()=>{db.close();resolve();};
  tx.onerror=event=>{failure??=(event.target as IDBRequest|IDBTransaction|null)?.error??tx.error??undefined;};
  tx.onabort=()=>{db.close();reject(failure??tx.error??new Error(reason));};
 });
 if(!active())throw changed();
}


/** Imported paper and media become publishable together, after note metadata is committed. */
export async function activateNotebookArchiveFiles(identity:DraftKey,current:()=>boolean){
 const db=await openDb();return new Promise<void>((resolve,reject)=>{const tx=db.transaction(['drafts',BLOBS],'readwrite'),drafts=tx.objectStore('drafts'),files=tx.objectStore(BLOBS),read=drafts.get(key(identity));
 read.onsuccess=()=>{const draft=read.result as Draft|undefined;if(!draft||!draft.archiveImport||!current()){tx.abort();return;}const rows=files.getAll();rows.onsuccess=()=>{if(!current()){tx.abort();return;}for(const blob of rows.result as LocalBlob[])if(blob.accountId===identity.accountId&&blob.spaceId===identity.spaceId&&blob.documentId===identity.documentId)files.put({...blob,removedFromNote:undefined,revision:(blob.revision??0)+1});drafts.put({...draft,staged:undefined});};};
 tx.oncomplete=()=>{db.close();resolve();};tx.onabort=tx.onerror=()=>{db.close();reject(tx.error??new Error('L’importation reste conservée, en attente de finalisation.'));};});
}

/** An append publishes its files only when the durable note contains every imported asset. */
export async function activateNotebookAppendFiles(identity:DraftKey,ids:string[],current:()=>boolean){
 const db=await openDb();return new Promise<void>((resolve,reject)=>{const tx=db.transaction(['drafts',BLOBS],'readwrite'),drafts=tx.objectStore('drafts'),files=tx.objectStore(BLOBS),read=drafts.get(key(identity));let aborted=false;const abort=()=>{if(!aborted){aborted=true;tx.abort();}};
 read.onsuccess=()=>{const draft=read.result as Draft|undefined,assets=(draft?.content as {assets?:{id:string}[]}|undefined)?.assets;if(!current()||!Array.isArray(assets)||ids.some(id=>!assets.some(asset=>asset.id===id))){abort();return;}let left=ids.length;if(!left)return;
 for(const id of ids){const request=files.get(blobKey({accountId:identity.accountId,spaceId:identity.spaceId,id}));request.onsuccess=()=>{if(aborted)return;const blob=request.result as LocalBlob|undefined;if(!blob||blob.documentId!==identity.documentId||!current()){abort();return;}files.put({...blob,removedFromNote:undefined,revision:(blob.revision??0)+1});left--;};}}
 tx.oncomplete=()=>{db.close();resolve();};tx.onabort=tx.onerror=()=>{db.close();reject(tx.error??new Error('Les pages ou fichiers attendent leur enregistrement. Les originaux restent conservés.'));};});
}

export interface NotebookTransferCommit {
 privateTransport?:{type:string;documentId:string};
 target:{accountId:string;spaceId:string};sources:{accountId:string;spaceId:string}[];
 drafts:Draft[];blobs:LocalBlob[];snapshots:Snapshot[];
 draftChecks:{identity:DraftKey;expected:Draft|undefined}[];
 blobChecks:{identity:Pick<LocalBlob,'accountId'|'spaceId'|'id'>;expected:LocalBlob|undefined}[];
 snapshotChecks:{key:string;expected:Snapshot|undefined}[];
}
const blobState=(value:LocalBlob|undefined)=>value&&JSON.stringify({...value,blob:undefined,key:undefined,size:value.blob.size,mediaType:value.blob.type});
const draftState=(value:Draft|undefined)=>value&&JSON.stringify({...value,key:undefined});
function paperNoteId(value:unknown):string|undefined{
 if(!value||typeof value!=='object')return;
 const document=value as {notebookSchema?:unknown;noteId?:unknown};
 return document.notebookSchema===3&&typeof document.noteId==='string'?document.noteId:undefined;
}
const samePaperOwner=(first:unknown,second:unknown)=>isPaperDocument(first)&&isPaperDocument(second)&&first.noteId===second.noteId;
/** Derived queue status/alias flags do not turn the same original contribution
 * into a new edit. Exact bodies and their source version remain significant. */
export function paperIdentityMutationDigest(mutation:Mutation):string{
 const {identityAlias,status,error,paperPrepared,...original}=mutation;
 return notebookIdentityDigest(JSON.stringify({...original,key:undefined}));
}
export interface PaperIdentityContribution {mutation:Mutation;kind:'merged'|'same'|'conflict'|'collision'}
export interface PaperIdentityPromotion {
 source:Draft;target:Draft|undefined;canonical:Draft;assetIds:string[];receiptKey:string;contributions?:PaperIdentityContribution[];deletion?:NotebookDeletionStatus;
}
/** Private normalization must not clone another notebook's history, managed
 * source packet or sticker catalogue. Keep the old promotion algorithm's exact
 * source/target recovery and collision rows, selected by key before each get. */
function privatePromotionSnapshots(tx:IDBTransaction,source:Draft,canonical:Draft,receiptKey:string,current:()=>boolean,done:(rows:Snapshot[])=>void,fail:(error:unknown)=>void){
 const prefixes=[...new Set([...['paper-history','paper-migration','paper-resolution'].flatMap(name=>[`${name}|${key(source)}`,`${name}|${key(canonical)}`]),receiptKey,notebookDeletionKey(canonical)])],store=tx.objectStore('snapshots'),rows:Snapshot[]=[],seen=new Set<string>();let left=prefixes.length,visited=0,failed=false;
 const guarded=(work:()=>void)=>{if(failed)return;try{if(!current())throw new DraftChangedError('La source a changé pendant sa récupération.');work();}catch(error){failed=true;fail(error);}};
 for(const prefix of prefixes){const request=store.openKeyCursor();request.onsuccess=()=>guarded(()=>{const cursor=request.result;if(!cursor){if(--left===0)done(rows);return;}if(++visited>100_000)throw Error('La récupération automatique de cette note dépasse sa fenêtre de clés. Toutes ses versions restent conservées.');if(indexedDB.cmp(cursor.key,prefix)<0){cursor.continue(prefix);return;}if(typeof cursor.key!=='string'||!cursor.key.startsWith(prefix)){if(--left===0)done(rows);return;}const selected=cursor.key===prefix||cursor.key.startsWith(prefix+'|');if(!selected||seen.has(cursor.key)){cursor.continue();return;}seen.add(cursor.key);if(seen.size>10_000)throw Error('Cette note possède trop de reçus pour une migration automatique. Tous ses originaux restent conservés.');const expectedKey=cursor.key,read=store.get(expectedKey);read.onsuccess=()=>guarded(()=>{const row=read.result as Snapshot|undefined;if(!row||row.key!==expectedKey)throw Error('Une version de récupération a changé. Aucun original n’est déplacé.');rows.push(row);cursor.continue();});});}
}
/** A renamed key starts a distinct server version stream. The old key and every
 * recovery record remain available; only the canonical key enters the outbox. */
export async function commitPaperIdentityPromotion(plan:PaperIdentityPromotion,current:()=>boolean,privateTransport=false):Promise<void>{
 const {source,target,canonical,receiptKey}=plan,noteId=paperNoteId(source.content);
 const sameScope=(row:Pick<Draft,'accountId'|'spaceId'>)=>row.accountId===source.accountId&&row.spaceId===source.spaceId;
 if(!noteId||!isPaperDocument(source.content)||!isPaperDocument(canonical.content)||target&&!isPaperDocument(target.content)||source.type!=='whiteboard'||canonical.type!=='whiteboard'||!sameScope(canonical)||target&&(!sameScope(target)||key(target)!==key(canonical)))throw Error('Changement d’identité hors du compte ou de l’année refusé.');
 if(paperNoteId(canonical.content)!==noteId||target&&paperNoteId(target.content)!==noteId||key(source)===key(canonical)||source.identityAlias&&source.identityAlias!==canonical.documentId||canonical.identityAlias||target?.identityAlias)throw Error('Deux notes utilisent une identité incompatible. Leurs originaux restent conservés.');
 if(plan.contributions?.some(row=>key(row.mutation)!==key(source)||row.kind!=='collision'&&!samePaperOwner(source.content,row.mutation.content)))throw Error('Une contribution appartient à une autre note ou à un autre périmètre. Les originaux restent conservés.');
 if(plan.deletion&&(!validNotebookDeletion(plan.deletion,canonical)||plan.deletion.noteId!==undefined&&plan.deletion.noteId!==noteId||canonical.documentId!==notebookDocumentId(noteId)))throw Error('Le reçu de suppression ne correspond pas à cette note.');
 if(!receiptKey||typeof receiptKey!=='string')throw Error('Le changement d’identité nécessite un reçu de récupération.');
 const sourceAssets=[...(source.content as {assets:{id:string}[]}).assets,...(plan.contributions??[]).flatMap(row=>row.kind!=='collision'&&isPaperDocument(row.mutation.content)?row.mutation.content.assets:[])];
 if(!Array.isArray(sourceAssets)||!plan.assetIds.every(id=>sourceAssets.some(asset=>asset.id===id)))throw Error('Les fichiers à reclasser doivent appartenir à cette note.');
 if(!current())throw Error('Le carnet a changé avant le reclassement de la note.');
 const db=await openDb();
 return new Promise<void>((resolve,reject)=>{
  const tx=db.transaction(['drafts','mutations','snapshots',BLOBS],'readwrite'),drafts=tx.objectStore('drafts'),snapshots=tx.objectStore('snapshots');
  let reason='La note a changé pendant son reclassement. Les originaux restent conservés.',aborted=false,pending=6,privateFailure:unknown;
  let storedSource:Draft|undefined,storedTarget:Draft|undefined;
  const rows:{drafts:Draft[];mutations:Mutation[];snapshots:Snapshot[];files:LocalBlob[]}={drafts:[],mutations:[],snapshots:[],files:[]};
  const abort=()=>{if(!aborted){aborted=true;tx.abort();}};
  const checked=()=>{if(aborted||--pending)return;if(!current()){reason='La connexion a changé pendant le reclassement de la note.';abort();return;}
   if(draftState(storedSource)!==draftState(source)||draftState(storedTarget)!==draftState(target)){abort();return;}
   if(plan.deletion){const status=rows.snapshots.find(row=>row.key===notebookDeletionKey(canonical));if(!status||!sameScope(status)||JSON.stringify(status.value)!==JSON.stringify(plan.deletion)){reason='La suppression de la note a changé pendant sa récupération.';abort();return;}}
   if(plan.contributions?.some(row=>{const mutation=rows.mutations.find(candidate=>candidate.id===row.mutation.id);return !mutation||JSON.stringify({...mutation,key:undefined})!==JSON.stringify({...row.mutation,key:undefined});})){reason='Une contribution a changé pendant sa récupération. Aucun original n’est remplacé.';abort();return;}
   const now=Date.now(),next:Draft={...canonical,identityAlias:undefined,baseVersion:target?.baseVersion??0};
   const mutations=rows.mutations.filter(row=>key(row)===key(source));
   const assetIds=new Set(plan.assetIds),directTag=`paper-v3-${noteId}`;
   const files=rows.files.filter(row=>sameScope(row)&&assetIds.has(row.id)&&(row.documentId===source.documentId||row.documentId===directTag));
   const metadata=rows.drafts.filter(row=>sameScope(row)&&row.type==='notesMarkdown'&&row.documentId===noteId&&(row.content as {id?:unknown})?.id===noteId&&row.paperDependency===source.documentId);
   const recovery=rows.snapshots.filter(row=>sameScope(row)&&['paper-history','paper-migration','paper-resolution'].some(prefix=>row.key.startsWith(`${prefix}|${key(source)}`)&&(row.key===`${prefix}|${key(source)}`||row.key.startsWith(`${prefix}|${key(source)}|`))));
   const clones:Snapshot[]=[];
   for(const row of recovery){const cloneKey=row.key.replace(`|${key(source)}`,`|${key(canonical)}`),existing=rows.snapshots.find(candidate=>candidate.key===cloneKey);
    if(existing&&JSON.stringify(existing.value)===JSON.stringify(row.value))continue;
    let destination=cloneKey;
    if(existing){const suffix=`|identity-${source.documentId}-${now}`;destination=cloneKey+suffix;let count=0;while(rows.snapshots.some(candidate=>candidate.key===destination)||clones.some(candidate=>candidate.key===destination))destination=cloneKey+suffix+`-${++count}`;}
    clones.push({...row,key:destination});
   }
   const previous=rows.snapshots.find(row=>row.key===receiptKey);
   if(previous&&!sameScope(previous)){reason='Ce reçu appartient à un autre compte. Aucun original n’est déplacé.';abort();return;}
   let previousReceiptKey:string|undefined;
   if(previous){do{previousReceiptKey=`${receiptKey}|previous-${crypto.randomUUID()}`;}while(rows.snapshots.some(row=>row.key===previousReceiptKey)||clones.some(row=>row.key===previousReceiptKey));}
   const processedMutationStates={...((previous?.value as {processedMutationStates?:Record<string,string>}|undefined)?.processedMutationStates??{}),...Object.fromEntries((plan.contributions??[]).map(row=>[row.mutation.id,paperIdentityMutationDigest(row.mutation)]))};
   const incomingConflicts=(plan.contributions??[]).filter(row=>row.kind==='conflict').map(row=>({mutationId:row.mutation.id,content:row.mutation.content,baseVersion:row.mutation.baseVersion}));
   const conflictBodies=new Map(incomingConflicts.map(row=>[notebookIdentityDigest(JSON.stringify(row.content)),row]));
   const receipt={schema:1,kind:plan.deletion?'paper-identity-quarantine':'paper-identity-promotion',noteId,at:now,source,target,canonical:plan.deletion?target:next,...(plan.deletion?{deletion:plan.deletion,quarantinedCanonical:next}:{}),mutations,
    files:files.map(({blob,...file})=>({...file,size:blob.size,mediaType:blob.type})),metadata,snapshots:recovery.map(row=>({key:row.key,value:row.value})),clonedSnapshotKeys:clones.map(row=>row.key),contributions:plan.contributions??[],processedMutationStates,incomingConflicts,...(conflictBodies.size===1?{chosenIncomingConflict:[...conflictBodies.values()][0]}:{}),...(previousReceiptKey?{previousReceiptKey}:{})};
   // Recheck the owner immediately before the first write. The transaction locks
   // all affected stores, so acknowledgements and edits cannot interleave.
   if(!current()){reason='La connexion a changé avant la conservation du reçu.';abort();return;}
   if(previous&&previousReceiptKey)snapshots.put({...previous,key:previousReceiptKey});
   snapshots.put({key:receiptKey,accountId:source.accountId,spaceId:source.spaceId,value:receipt});
   for(const row of plan.contributions??[])if(row.kind==='conflict'||row.kind==='collision'||plan.deletion)snapshots.put({key:`${row.kind==='collision'?'paper-identity-collision':'paper-resolution'}|${key(canonical)}|identity-outbox-${row.mutation.id}-${crypto.randomUUID()}`,accountId:source.accountId,spaceId:source.spaceId,value:{schema:1,kind:plan.deletion?'paper-identity-deleted-outbox':'paper-identity-outbox-'+row.kind,durable:target,visibleContent:row.mutation.content,sourceMutation:row.mutation,sourceIdentity:source.documentId,identityReceipt:receiptKey,...(plan.deletion?{deletion:plan.deletion}:{})}});
   for(const row of clones)snapshots.put(row);
   for(const row of mutations)tx.objectStore('mutations').put({...row,identityAlias:canonical.documentId});
   if(!plan.deletion){for(const row of files)tx.objectStore(BLOBS).put({...row,documentId:canonical.documentId,revision:(row.revision??0)+1,key:blobKey(row)});
    for(const row of metadata)drafts.put({...row,key:key(row),paperDependency:canonical.documentId,syncState:row.syncState==='conflict'?'conflict':'local'});}
   drafts.put({...source,key:key(source),identityAlias:canonical.documentId});
   if(!plan.deletion)drafts.put({...next,key:key(next)});
  };
  const readOriginals=()=>{if(!current()){abort();return;}
   const readSource=drafts.get(key(source));readSource.onsuccess=()=>{storedSource=readSource.result;checked();};
   const readTarget=drafts.get(key(canonical));readTarget.onsuccess=()=>{storedTarget=readTarget.result;checked();};
   for(const [name,field] of [['drafts','drafts'],['mutations','mutations'],[BLOBS,'files']] as const){const request=tx.objectStore(name).getAll();request.onsuccess=()=>{rows[field]=request.result;checked();};}
   if(privateTransport)privatePromotionSnapshots(tx,source,canonical,receiptKey,current,value=>{rows.snapshots=value;checked();},error=>{privateFailure=error;abort();});else{const request=tx.objectStore('snapshots').getAll();request.onsuccess=()=>{rows.snapshots=request.result;checked();};}
  };
  // A late managed/trash admission locks the same snapshots store. Its light
  // headers are checked BEFORE cloning source/history bodies or promoting IDs.
  if(privateTransport)readPrivateNotebookPolicyWithin(tx,source,current,policy=>{const blocked=policy.blockDocument(source.type,source.documentId,source.content)||policy.blockDocument(canonical.type,canonical.documentId,canonical.content),protectedSource=policy.blockManagedOrTrashedDocument(source.type,source.documentId,source.content)||policy.blockManagedOrTrashedDocument(canonical.type,canonical.documentId,canonical.content);if(blocked&&(!plan.deletion||protectedSource)){privateFailure=new PrivateNotebookBlockedError();abort();return;}readOriginals();},error=>{privateFailure=error;abort();});else readOriginals();
  let failure:unknown;tx.oncomplete=()=>{db.close();resolve();};tx.onerror=event=>{failure??=(event.target as IDBRequest|null)?.error??tx.error;};tx.onabort=()=>{db.close();reject(privateFailure??failure??tx.error??new Error(reason));};
 });
}
/** Originals, target revisions and the migration receipt change atomically or not at all. */
export async function commitNotebookTransfer(plan:NotebookTransferCommit,current:()=>boolean){
 const active=()=>{try{return current()===true;}catch{return false;}};
 const inTarget=(row:{accountId:string;spaceId:string})=>row.accountId===plan.target.accountId&&row.spaceId===plan.target.spaceId;
 const inSource=(row:{accountId:string;spaceId:string})=>plan.sources.some(source=>source.accountId===row.accountId&&source.spaceId===row.spaceId);
 if(!plan.drafts.every(inTarget)||!plan.blobs.every(inTarget)||!plan.snapshots.every(row=>inTarget(row)||inSource(row)))throw Error('Transfert hors du compte ou de l’année refusé.');
 if(plan.drafts.some(row=>!plan.draftChecks.some(check=>key(check.identity)===key(row)))||plan.blobs.some(row=>!plan.blobChecks.some(check=>blobKey(check.identity)===blobKey(row)))||plan.snapshots.some(row=>!plan.snapshotChecks.some(check=>check.key===row.key)))throw Error('Le transfert doit vérifier chaque destination.');
 if(!active())throw Error('La connexion a changé avant le transfert.');
 const db=await openDb();return new Promise<void>((resolve,reject)=>{
  const tx=db.transaction(['drafts',BLOBS,'snapshots'],'readwrite');let reason='La note ou ses fichiers ont changé pendant le transfert. Les originaux restent conservés.',aborted=false,changed:NotebookTransferChangedError|undefined,privateFailure:unknown;
  const abort=()=>{if(!aborted){aborted=true;tx.abort();}};
  let left=plan.draftChecks.length+plan.blobChecks.length+plan.snapshotChecks.length+Number(!!plan.privateTransport);
  const write=()=>{if(aborted)return;if(!active()){reason='La connexion a changé pendant le transfert.';abort();return;}for(const row of plan.drafts)tx.objectStore('drafts').put({...row,key:key(row)});for(const row of plan.blobs)tx.objectStore(BLOBS).put({...row,key:blobKey(row)});for(const row of plan.snapshots)tx.objectStore('snapshots').put(row);};
  const checked=(valid:boolean)=>{if(aborted)return;if(!active()){reason='La connexion a changé pendant le transfert.';abort();return;}if(!valid){changed=new NotebookTransferChangedError(reason);abort();return;}if(--left===0)write();};
  if(plan.privateTransport)readPrivateNotebookPolicyWithin(tx,plan.target,active,policy=>{if(policy.blockDocument(plan.privateTransport!.type,plan.privateTransport!.documentId)){privateFailure=new PrivateNotebookBlockedError();abort();return;}checked(true);},error=>{privateFailure=error;abort();});
  for(const check of plan.draftChecks){const request=tx.objectStore('drafts').get(key(check.identity));request.onsuccess=()=>checked(draftState(request.result)===draftState(check.expected));}
  for(const check of plan.blobChecks){const request=tx.objectStore(BLOBS).get(blobKey(check.identity));request.onsuccess=()=>checked(blobState(request.result)===blobState(check.expected));}
  for(const check of plan.snapshotChecks){const request=tx.objectStore('snapshots').get(check.key);request.onsuccess=()=>checked(JSON.stringify(request.result)===JSON.stringify(check.expected));}
  if(!left)write();
  let failure:unknown;
  tx.oncomplete=()=>{db.close();resolve();};
  // A request error is not yet a completed rollback. Hold this transfer until
  // IndexedDB confirms abort before its caller releases the admitted writer.
  tx.onerror=event=>{failure=(event.target as IDBRequest|null)?.error??tx.error??failure;};
  tx.onabort=()=>{db.close();reject(privateFailure??(changed&&active()?changed:aborted?new Error(active()?reason:'La connexion a changé pendant le transfert.'):tx.error??failure??new Error(reason)));};
 });
}
