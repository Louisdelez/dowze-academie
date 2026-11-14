import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB} from 'fake-indexeddb';
import {readPaperAsset,resolvePaperPhotoReference} from '../src/lib/paperAssets.ts';
import {migratePaper,notebookDocumentId,type PaperAsset} from '../src/lib/notebookDocument.ts';
import {legacyNotebookDocumentId} from '../src/lib/notebookIdentity.ts';
import {noteBoardId,photoReference} from '../src/lib/notebook.ts';
import {putDraft,getDraft,putLocalBlob,listLocalBlobs,putSnapshot,notebookDeletionKey,localBlobDigest} from '../pwa/src/storage.ts';
import type {NotebookMediaScope} from '../src/components/NotebookEditor.tsx';
globalThis.indexedDB=indexedDB;
let count=0;
const fixture=(label:string,noteId='note')=>{const media:NotebookMediaScope={accountId:`qa-read-image-${label}-${++count}`,spaceId:'year'},document=migratePaper(noteId,'Original text',null),asset:PaperAsset={id:'image',name:'Image.png',mediaType:'image/png',size:3,serverId:'server-image'};document.assets.push(asset);return {media,document,asset,identity:{accountId:media.accountId,spaceId:media.spaceId,type:'whiteboard' as const,documentId:notebookDocumentId(noteId)}};};
const api=(download:()=>Promise<Blob>)=>({downloadBlob:async()=>download()}) as unknown as NonNullable<NotebookMediaScope['api']>;
const graph=async(f:ReturnType<typeof fixture>)=>{await putDraft({...f.identity,title:'Original',content:f.document,baseVersion:7,updatedAt:1,syncState:'synced'});return (await getDraft(f.identity))!;};
const local=async(f:ReturnType<typeof fixture>,extra:Record<string,unknown>={})=>{await putLocalBlob({accountId:f.media.accountId,spaceId:f.media.spaceId,id:f.asset.id,name:f.asset.name,documentId:f.identity.documentId,blob:new Blob(['IMG'],{type:'image/png'}),createdAt:1,status:'uploaded',serverId:f.asset.serverId,...extra});return (await listLocalBlobs(f.media.accountId,f.media.spaceId))[0];};

test('Private image references resolve only their own canonical key or proved historical aliases',()=>{
 const f=fixture('own-uris','é');for(const id of [notebookDocumentId(f.document.noteId),legacyNotebookDocumentId(f.document.noteId),noteBoardId(f.document.noteId)])assert.equal(resolvePaperPhotoReference(f.document,photoReference(id,f.asset.id)).kind,'asset');
 assert.equal(resolvePaperPhotoReference(f.document,photoReference(notebookDocumentId('other-note'),f.asset.id)).kind,'unavailable');assert.equal(resolvePaperPhotoReference(f.document,'dowze-photo:wrong/path/extra').kind,'unavailable');assert.equal(resolvePaperPhotoReference(f.document,'dowze-photo:%ZZ/image').kind,'unavailable');assert.equal(resolvePaperPhotoReference(f.document,photoReference(f.identity.documentId,'missing')).kind,'unavailable');assert.equal(resolvePaperPhotoReference(f.document,'https://example.test/image.png').kind,'external');
 const wrong={...f.document,legacy:{...f.document.legacy,boardId:'note-other'}};assert.equal(resolvePaperPhotoReference(wrong,photoReference(noteBoardId(f.document.noteId),f.asset.id)).kind,'unavailable');assert.equal(resolvePaperPhotoReference(wrong,photoReference(f.identity.documentId,f.asset.id)).kind,'asset');
});

test('A scoped cached original is read without network and a different year is never borrowed',async()=>{
 const f=fixture('scoped'),stored=await local(f);let calls=0;f.media.api=api(async()=>{calls++;return new Blob(['NEW']);});const read=await readPaperAsset(f.asset,f.media,{document:f.document});assert.equal(await read.text(),'IMG');assert.equal(calls,0);assert.equal(await localBlobDigest(read),stored.sha256);
 const other={...f.media,spaceId:'other-year',api:undefined};await assert.rejects(()=>readPaperAsset(f.asset,other,{document:f.document}),/téléchargement/);assert.equal((await listLocalBlobs(other.accountId,other.spaceId)).length,0);
});

test('A matching raw attachment ID cannot substitute a different server original or foreign note tag',async()=>{
 for(const variant of ['server','owner','unknown-server']){const f=fixture(variant);await graph(f);const before=await local(f,variant==='server'?{serverId:'another-server'}:variant==='owner'?{documentId:notebookDocumentId('another-note')}:{serverId:undefined});let calls=0;f.media.api=api(async()=>{calls++;return new Blob(['IMG']);});await assert.rejects(()=>readPaperAsset(f.asset,f.media,{document:f.document}));assert.equal(calls,0);assert.deepEqual((await listLocalBlobs(f.media.accountId,f.media.spaceId))[0],before);}
});

test('Foreign legacy owner claims block image reading even when the graph contains an identical asset ID',async()=>{
 const f=fixture('claim','é');await graph(f);await local(f);await putSnapshot({key:`paper-legacy-owner|${f.media.accountId}|${f.media.spaceId}|whiteboard|${noteBoardId(f.document.noteId)}`,accountId:f.media.accountId,spaceId:f.media.spaceId,value:{schema:1,noteId:'other',documentId:notebookDocumentId('other'),boardId:noteBoardId(f.document.noteId),claimedAt:new Date().toISOString()}});await assert.rejects(()=>readPaperAsset(f.asset,f.media,{document:f.document,referenceDocumentId:noteBoardId(f.document.noteId)}),/autre note/);
});

test('The document manifest and reference document identity are checked before any private download',async()=>{
 const f=fixture('manifest');let calls=0;f.media.api=api(async()=>{calls++;return new Blob(['IMG']);});await assert.rejects(()=>readPaperAsset({...f.asset,serverId:'foreign-server'},f.media,{document:f.document}),/pièce jointe/);await assert.rejects(()=>readPaperAsset(f.asset,f.media,{document:f.document,referenceDocumentId:notebookDocumentId('foreign')}),/autre carnet/);assert.equal(calls,0);assert.equal((await listLocalBlobs(f.media.accountId,f.media.spaceId)).length,0);
});

test('An authenticated download cache contains only owner/year and immutable file metadata',async()=>{
 const f=fixture('download');await graph(f);let request:unknown;f.media.api={downloadBlob:async(spaceId:string,serverId:string)=>{request={spaceId,serverId};return new Blob(['IMG']);},callback:()=>{}} as unknown as NonNullable<NotebookMediaScope['api']>;const blob=await readPaperAsset(f.asset,f.media,{document:f.document});assert.equal(await blob.text(),'IMG');assert.deepEqual(request,{spaceId:f.media.spaceId,serverId:f.asset.serverId});const cached=(await listLocalBlobs(f.media.accountId,f.media.spaceId))[0];assert.equal(cached.documentId,f.identity.documentId);assert.equal(cached.serverId,f.asset.serverId);assert.equal(cached.status,'uploaded');assert.equal(Object.hasOwn(cached,'api'),false);assert.equal(cached.sha256,await localBlobDigest(blob));
});

test('A cancelled read after download never creates a file in either account',async()=>{
 const f=fixture('cancel');await graph(f);let current=true;f.media.api=api(async()=>{current=false;return new Blob(['IMG']);});await assert.rejects(()=>readPaperAsset(f.asset,f.media,{document:f.document,current:()=>current}),/compte a changé/);assert.equal((await listLocalBlobs(f.media.accountId,f.media.spaceId)).length,0);
});

test('A late download cannot overwrite a newer local file of the same size',async()=>{
 const f=fixture('late');await graph(f);f.media.api=api(async()=>{await local(f,{blob:new Blob(['NEW'],{type:'image/png'}),serverId:'new-original'});return new Blob(['IMG']);});await assert.rejects(()=>readPaperAsset(f.asset,f.media,{document:f.document}),/original attendu/);const cached=(await listLocalBlobs(f.media.accountId,f.media.spaceId))[0];assert.equal(await cached.blob.text(),'NEW');assert.equal(cached.serverId,'new-original');assert.equal(cached.revision,1);
});

test('Two identical downloads converge on the existing bytes without advancing their file revision',async()=>{
 const f=fixture('same-concurrent');await graph(f);f.media.api=api(async()=>{await local(f);return new Blob(['IMG']);});const result=await readPaperAsset(f.asset,f.media,{document:f.document});assert.equal(await result.text(),'IMG');assert.equal((await listLocalBlobs(f.media.accountId,f.media.spaceId))[0].revision,1);
});

test('A new foreign owner claim or canonical deletion aborts cache publication',async()=>{
 for(const marker of ['owner','deleted']){const f=fixture(`race-${marker}`);await graph(f);f.media.api=api(async()=>{const now=Date.now();await putSnapshot(marker==='owner'?{key:`paper-legacy-owner|${f.media.accountId}|${f.media.spaceId}|whiteboard|${noteBoardId(f.document.noteId)}`,accountId:f.media.accountId,spaceId:f.media.spaceId,value:{schema:1,noteId:'foreign',documentId:notebookDocumentId('foreign'),boardId:noteBoardId(f.document.noteId),claimedAt:new Date(now).toISOString()}}:{key:notebookDeletionKey(f.identity),accountId:f.media.accountId,spaceId:f.media.spaceId,value:{schema:1,kind:'paper-canonical-deletion',accountId:f.media.accountId,spaceId:f.media.spaceId,documentId:f.identity.documentId,noteId:f.document.noteId,version:10,deletedAt:now}});return new Blob(['IMG']);});await assert.rejects(()=>readPaperAsset(f.asset,f.media,{document:f.document}));assert.equal((await listLocalBlobs(f.media.accountId,f.media.spaceId)).length,0);assert.equal((await getDraft(f.identity))?.baseVersion,7);}
});

test('Unrelated note edits during download keep the latest graph and allow a refreshed immutable cache commit',async()=>{
 const f=fixture('annotation-race'),original=await graph(f),updated={...f.document,revision:1,objects:f.document.objects.map(object=>({...object,markdown:'New user text'}))};f.media.api=api(async()=>{await putDraft({...original,content:updated,updatedAt:99});return new Blob(['IMG']);});const result=await readPaperAsset(f.asset,f.media,{document:f.document});assert.equal(await result.text(),'IMG');assert.deepEqual((await getDraft(f.identity))?.content,updated);assert.equal((await listLocalBlobs(f.media.accountId,f.media.spaceId)).length,1);
});

test('Wrong-length downloads and unreadable server responses remain uncached with clear errors',async()=>{
 const wrong=fixture('wrong-length');wrong.media.api=api(async()=>new Blob(['OTHER']));await assert.rejects(()=>readPaperAsset(wrong.asset,wrong.media,{document:wrong.document}),/taille/);assert.equal((await listLocalBlobs(wrong.media.accountId,wrong.media.spaceId)).length,0);
 const failed=fixture('network-error');failed.media.api=api(async()=>{throw Error('Technical body that must not appear in the note');});await assert.rejects(()=>readPaperAsset(failed.asset,failed.media,{document:failed.document}),error=>error instanceof Error&&error.message.includes('réessayez')&&!error.message.includes('Technical'));assert.equal((await listLocalBlobs(failed.media.accountId,failed.media.spaceId)).length,0);
});

test('Existing two-argument private export reads still use the scoped authenticated API and cache',async()=>{
 const f=fixture('export-compatible');let calls=0;f.media.api=api(async()=>{calls++;return new Blob(['IMG']);});assert.equal(await(await readPaperAsset(f.asset,f.media)).text(),'IMG');assert.equal(calls,1);assert.equal(await(await readPaperAsset(f.asset,{...f.media,api:undefined})).text(),'IMG');assert.equal(calls,1);
});
