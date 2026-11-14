import {PrivateNotebookBlockedError} from '../../src/lib/privateNotebookSyncPolicy.ts';
import {normalizeNotebookIdentities} from '../../src/lib/paperIdentity';
import {prepareNoteMetadataMutation,acknowledgeNoteMetadataTransport,receiveNoteMetadataTransport} from '../../src/lib/noteMetadataTransport';
import {isNotebookLibrary} from '../../src/lib/notebookLibrary';
import {mergeNotebookLibrary} from '../../src/lib/notebookLibraryCollaboration';
import {hasPaperCollaboration,amendPaperCollaboration,mergePaperCollaboration,verifyPaperCollaboration} from '../../src/lib/paperCollaboration';
import {isPaperDocument,notebookDocumentId,ownsPaperDocument} from '../../src/lib/notebookDocument';
import {encodePaperSync,decodePaperSync,MAX_NOTE_BLOB_REFERENCES} from '../../src/lib/paperSync';
import { ApiClient, ApiError } from './api';
import {privateOriginalMediaType,reconcilePrivateOriginalMedia,rebasePrivateOriginalMapping} from './privateOriginalMediaReconciliation';
import { DraftChangedError, preparePaperMutation,acknowledgeLocalBlob, acknowledgeMutation, applyChangePage, queueLocalDrafts, getSnapshot, getDraft, listDrafts, listLocalBlobs, listMutations,markMutationConflict, saveDraftAndQueue,resolvePaperDraft,readNotebookDeletionStatus,notebookPrivateTransportAllowed,notebookPrivateCanonicalReceptionAllowed,notebookPrivateBlobAllowed,type PrivateNotebookRawChange } from './storage';

const normalizePrivate=(scope:{accountId:string;spaceId:string},current:()=>boolean)=>normalizeNotebookIdentities(scope,current,true);

const requirePrivateBlob=async(file:Parameters<typeof notebookPrivateBlobAllowed>[0],current:()=>boolean)=>{if(!await notebookPrivateBlobAllowed(file,current))throw new PrivateNotebookBlockedError();};

const requirePrivate=async(identity:{accountId:string;spaceId:string;type:string;documentId:string},current:()=>boolean,content?:unknown)=>{if(!await notebookPrivateTransportAllowed(identity,current,content))throw new PrivateNotebookBlockedError();};
const requirePrivateIncoming=async(identity:{accountId:string;spaceId:string;type:string;documentId:string},current:()=>boolean,content?:unknown)=>{if(!await notebookPrivateCanonicalReceptionAllowed(identity,current,content))throw new PrivateNotebookBlockedError();};

/** Capture before either serial queue waits; observing a revocation is final. */
function captureSyncAuthority(api:ApiClient,accountId:string,current:()=>boolean){
 let revoked=false;try{if(current()!==true)revoked=true;}catch{revoked=true;}
 const session=!revoked&&typeof api.captureSessionAuthority==='function'?api.captureSessionAuthority(accountId):()=>!revoked;
 return ()=>{if(revoked)return false;try{if(current()!==true||!session())revoked=true;}catch{revoked=true;}return !revoked;};
}

let serial: Promise<unknown> = Promise.resolve();
const spaces = new Map<string, Promise<void>>();
export function synchronizeSpace(api: ApiClient, accountId: string, spaceId: string, current: () => boolean): Promise<void> {
  let active:()=>boolean;try{active=captureSyncAuthority(api,accountId,current);}catch(error){return Promise.reject(error);}
  const key = `${accountId}|${spaceId}`;
  const next = (spaces.get(key) ?? Promise.resolve()).catch(() => undefined).then(async () => {
    if (!active() || !navigator.onLine) return;
    api.bindAccount(accountId);
    await normalizePrivate({accountId,spaceId},active);
    await queueLocalDrafts(accountId, spaceId,api.syncDocumentFilter,active);
    await flushMutations(api, accountId, spaceId, active);
    if (!active()) return;
    const cursorKey=`sync-cursor|${key}`,cursorRow=await getSnapshot(cursorKey);if(!active())return;if(cursorRow&&(cursorRow.key!==cursorKey||cursorRow.accountId!==accountId||cursorRow.spaceId!==spaceId))throw Error('Le curseur de synchronisation possède une autre portée.');const saved=cursorRow?.value;
    let cursor = typeof saved === 'string' ? saved : undefined;
    const seen = new Set<string>();
    while (active()) {
      const page = await api.changes(spaceId, cursor);
      if (!active()) return;
      // Resolve every scoped alias before coalescing revisions. An earlier live
      // envelope can prove the logical owner of a later tombstone in this page.
      const logicalChanges:typeof page.items=[],deferred:typeof page.items=[],raw:PrivateNotebookRawChange[]=[];
      for(const item of page.items){
        const original=structuredClone(item),wireIdentity={accountId,spaceId,type:item.document_type,documentId:item.document_id};
        if(!await notebookPrivateCanonicalReceptionAllowed(wireIdentity,active,item.content)){deferred.push(original);continue;}
        try{
          const received=item.document_type==='notesMarkdown'?await receiveNoteMetadataTransport(item,{accountId,spaceId},active):item;if(!received)continue;
          const identity={accountId,spaceId,type:received.document_type,documentId:received.document_id};await requirePrivateIncoming(identity,active,received.content);
          const decoded=received.document_type==='whiteboard'&&received.document_id.startsWith('paper-v3-')&&!received.deleted?await decodePaperSync(api,spaceId,received.content,active,()=>requirePrivateIncoming(identity,active,received.content)):received.content;
          if(!active())return;logicalChanges.push({...received,content:decoded});raw.push({identity:{type:received.document_type,documentId:received.document_id},change:original});
        }catch(error){if(error instanceof PrivateNotebookBlockedError){deferred.push(original);continue;}throw error;}
      }
      page.items=[...new Map(logicalChanges.map(item=>[`${item.document_type}|${item.document_id}`,item])).values()];
      await applyChangePage(accountId,spaceId,page,active,{deferred,raw});
      await normalizePrivate({accountId,spaceId},active);
      if (!page.has_more) break;
      if (!page.next_cursor || seen.has(page.next_cursor)) throw new Error('Pagination de synchronisation incohérente.');
      seen.add(page.next_cursor); cursor = page.next_cursor;
    }
  });
  spaces.set(key, next);
  const clear = () => { if (spaces.get(key) === next) spaces.delete(key); };
  void next.then(clear, clear);
  return next;
}
/** One uploader per browser instance; versions are sent in their durable order. */
export function flushMutations(api: ApiClient, accountId: string, spaceId: string, current: () => boolean) {
  let active:()=>boolean;try{active=captureSyncAuthority(api,accountId,current);}catch(error){return Promise.reject(error);}
  const next = serial.catch(() => undefined).then(async () => {
    if (!active()) return;
    api.bindAccount(accountId);
    const originalMappings=new Map<string,string>();
    for (const photo of await listLocalBlobs(accountId, spaceId)) {
      if (!active() || !navigator.onLine) return;
      if (photo.removedFromNote || !await notebookPrivateBlobAllowed(photo,active)) continue;
      if(privateOriginalMediaType(photo.blob.type)){const repaired=await reconcilePrivateOriginalMedia(api,photo,active);if(repaired.mutationId)originalMappings.set(repaired.mutationId,repaired.journalKey);continue;}
      if(photo.status==='uploaded')continue;
      const digest = await crypto.subtle.digest('SHA-256', await photo.blob.arrayBuffer());
      if (!active()) return;
      const sha = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      // Keep the immutable original MIME as well as its bytes: admission binds
      // the canonical asset type to the exact stored blob receipt.
      if(!await notebookPrivateBlobAllowed(photo,active))continue;
      let uploaded;try{uploaded=await api.uploadBlob(spaceId,photo.blob,sha,photo.id,()=>requirePrivateBlob(photo,active));}catch(error){if(error instanceof PrivateNotebookBlockedError)continue;throw error;}
      if(!active())return;await acknowledgeLocalBlob(photo,uploaded.id,active);
    }
    const uploadedAssets=await listLocalBlobs(accountId,spaceId);
    const blocked = new Set<string>();
    for (let mutation of (await listMutations(accountId, spaceId)).sort((a,b)=>Number(originalMappings.has(a.id))-Number(originalMappings.has(b.id))||(originalMappings.has(a.id)&&originalMappings.has(b.id)?a.createdAt-b.createdAt:Number(!ownsPaperDocument(a.type,a.documentId))-Number(!ownsPaperDocument(b.type,b.documentId))))) {
      if (!active() || !navigator.onLine) return;
      if(mutation.identityAlias||!await notebookPrivateTransportAllowed(mutation,active,mutation.content))continue;
      // A stale writer may have queued this before seeing the identity promotion.
      // Keep its original contribution for recovery, never PUT the retired key.
      const durable=await getDraft(mutation);
      if(!active())return;
      if(durable?.identityAlias||isPaperDocument(mutation.content)&&mutation.documentId!==notebookDocumentId(mutation.content.noteId))continue;
      if(isPaperDocument(mutation.content)&&await readNotebookDeletionStatus(mutation.content.noteId,{accountId,spaceId},active))continue;
      if(!active())return;
      if(api.syncDocumentFilter&&!api.syncDocumentFilter(mutation.type,mutation.documentId))continue;
      if(mutation.type==='notesMarkdown'){if(durable?.paperDependency){const dependency=await getDraft({...mutation,type:'whiteboard',documentId:durable.paperDependency});if(!dependency||dependency.staged||dependency.syncState!=='synced')continue;}}
      const key = `${mutation.type}|${mutation.documentId}`;
      if (blocked.has(key) || mutation.status === 'conflict') { blocked.add(key); continue; }
      try {
        const mappingJournal=originalMappings.get(mutation.id);if(mappingJournal)mutation=await rebasePrivateOriginalMapping(api,mappingJournal,mutation,active);
        let content:unknown;
        if(isPaperDocument(mutation.content)){
          const resolved=mutation.paperPrepared?.content??resolvePaperAssets(mutation.content,uploadedAssets);
          content=mutation.paperPrepared?resolved:resolved!==mutation.content&&hasPaperCollaboration(mutation.content)&&isPaperDocument(resolved)?amendPaperCollaboration(mutation.content,resolved):resolved;
          if(isPaperDocument(content)&&hasPaperCollaboration(content))verifyPaperCollaboration(content);
          if(mutation.paperPrepared||content!==mutation.content){mutation=await preparePaperMutation(mutation,content,active);if(!active())return;content=mutation.paperPrepared!.content;}
        }else content=resolvePaperAssets(mutation.content,uploadedAssets);
        await requirePrivate(mutation,active,content);
        const transmitted=await encodePaperSync(api,spaceId,content,mutation.id,active,()=>requirePrivate(mutation,active,content));
        const metadataDocument={type:mutation.type,id:mutation.documentId,content:transmitted},prepared=await prepareNoteMetadataMutation(metadataDocument,mutation.baseVersion,mutation.id,{accountId,spaceId},active);
        if(!active())return;await requirePrivate(mutation,active,content);const result = await api.putDocument(spaceId, mutation.type, prepared.id, prepared.baseVersion, prepared.content, mutation.id,()=>requirePrivate(mutation,active,content));
        if(!active())return;await acknowledgeNoteMetadataTransport(metadataDocument,result.version,{accountId,spaceId},active);
        if(!active())return;await acknowledgeMutation(mutation, result.version, content,active);
      } catch (error) {
        if(!active())throw error;
        if(error instanceof PrivateNotebookBlockedError||!await notebookPrivateTransportAllowed(mutation,active,mutation.content))continue;
        if (error instanceof ApiError && error.status === 409 && error.code !== 'session_account_changed') {
          blocked.add(key);
          const draft=await getDraft(mutation);
          if(!active())return;
          if(draft?.identityAlias)continue;
          if(draft&&active()&&(isPaperDocument(draft.content)&&hasPaperCollaboration(draft.content)||isNotebookLibrary(draft.content)&&draft.content.collaboration)){
            let cursor:string|undefined,remote:import('./api').DocumentChange|undefined;const seen=new Set<string>();
            do{const page=await api.changes(spaceId,cursor);if(!active())return;for(const item of page.items)if(item.document_type===mutation.type&&item.document_id===mutation.documentId)remote=item;if(!page.has_more)break;if(!page.next_cursor||seen.has(page.next_cursor))throw Error('Pagination collaborative incohérente.');seen.add(page.next_cursor);cursor=page.next_cursor;}while(active());
            if(remote&&!remote.deleted){
              const received=await decodePaperSync(api,spaceId,remote.content,active,()=>requirePrivate(mutation,active,remote!.content));if(!active())return;
              if(isPaperDocument(received)||isNotebookLibrary(received)){
                let merged:import('../../src/lib/notebookDocument').PaperDocument|import('../../src/lib/notebookLibrary').NotebookLibrary|null=null;
                try{merged=isPaperDocument(draft.content)&&isPaperDocument(received)?mergePaperCollaboration(draft.content,received):isNotebookLibrary(draft.content)&&isNotebookLibrary(received)?mergeNotebookLibrary(draft.content,received):null;}catch{/* Both snapshots remain available for explicit resolution. */}
                if(merged){
                  try{await resolvePaperDraft(draft,draft.content,{...draft,content:received,baseVersion:remote.version,syncState:'synced'},remote.version,merged,crypto.randomUUID(),active,true);continue;}catch{ /* A new durable edit owns the revision; preserve it below. */ }
                }
              }
            }
          }
          await markMutationConflict(mutation,error.currentVersion,error.message,active);
        } else throw error;
      }
    }
    if (!active()) return;
    const photos = await listLocalBlobs(accountId, spaceId);
    for (const draft of await listDrafts(accountId, spaceId)) {
      if (!active()) return;
      if(!await notebookPrivateTransportAllowed(draft,active,draft.content))continue;
      if (draft.type !== 'whiteboard' || draft.syncState !== 'synced'||api.syncDocumentFilter&&!api.syncDocumentFilter(draft.type,draft.documentId)) continue;
      // V3 assets use the graph/envelope uploader above. The legacy photo helper
      // must neither reactivate an alias nor bypass that graph's Yjs update.
      if(draft.identityAlias||isPaperDocument(draft.content))continue;
      const content = draft.content as { photos?: { id: string; serverId?: string; status?: string }[]; blob_ids?: string[] };
      if (!Array.isArray(content.photos)) continue;
      const updatedPhotos = content.photos.map(photo => {
        const local = photos.find(item => item.id === photo.id);
        return local?.serverId ? { ...photo, serverId: local.serverId, status: 'uploaded' } : photo;
      });
      const updated = { ...content, photos: updatedPhotos, blob_ids: updatedPhotos.flatMap(photo => photo.serverId ? [photo.serverId] : []) };
      if (JSON.stringify(updated) === JSON.stringify(content)) continue;
      let mutation;
      try {
        mutation = await saveDraftAndQueue({ ...draft, content: updated }, {
          ...draft, id: crypto.randomUUID(), content: updated, createdAt: Date.now(), status: 'pending',
        }, draft.content,active,undefined,true);
      } catch (error) {
        // A new stroke owns the newer revision. Reconcile its photos next pass.
        if (error instanceof DraftChangedError||error instanceof PrivateNotebookBlockedError) continue;
        throw error;
      }
      if (!active()) return;
      if(!await notebookPrivateTransportAllowed(mutation,active,mutation.content))continue;
      const result = await api.putDocument(spaceId, mutation.type, mutation.documentId, mutation.baseVersion, mutation.content, mutation.id,()=>requirePrivate(mutation,active,mutation.content));
      if(!active())return;await acknowledgeMutation(mutation, result.version,undefined,active);
    }
  });
  serial = next;
  return next;
}

/** Blob bytes are acknowledged before a v3 document can publish their references. */
export function resolvePaperAssets(content:unknown,blobs:readonly {id:string;serverId?:string;status:string}[]):unknown {
  if(!content||typeof content!=='object'||(content as {notebookSchema?:number}).notebookSchema!==3)return content;
  const paper=content as {assets?:{id:string;serverId?:string}[];blob_ids?:unknown};
  if(!Array.isArray(paper.assets))throw Error('Manifeste des pièces jointes invalide.');
  const assets=paper.assets.map(asset=>{const local=blobs.find(blob=>blob.id===asset.id);const serverId=asset.serverId??(local?.status==='uploaded'?local.serverId:undefined);if(!serverId)throw Error('Une pièce jointe attend son transfert avant la synchronisation de la note.');return asset.serverId===serverId?asset:{...asset,serverId};});
  const blob_ids=[...new Set(assets.map(asset=>asset.serverId))];if(blob_ids.length>MAX_NOTE_BLOB_REFERENCES)throw Error('La note dépasse la capacité de ses pièces jointes. Ses originaux restent conservés.');
  // An ACK without a changed attachment must preserve the exact graph/Yjs body.
  // In particular, an absent optional reference list is not an empty-list edit.
  const sameAssets=assets.every((asset,index)=>asset===paper.assets![index]);
  const sameReferences=paper.blob_ids===undefined?blob_ids.length===0:Array.isArray(paper.blob_ids)&&paper.blob_ids.length===blob_ids.length&&paper.blob_ids.every((id,index)=>id===blob_ids[index]);
  return sameAssets&&sameReferences?content:{...content,assets,blob_ids};
}
