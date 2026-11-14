import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB} from 'fake-indexeddb';
import {getDraft,putDraft,listLocalBlobs,listSnapshots,putLocalBlob,putSnapshot,commitNotebookTransfer,notebookDeletionKey,localBlobDigest,type Draft} from '../pwa/src/storage.ts';
import {migratePaper,notebookDocumentId,isPaperDocument,applyPaperCommand,type PaperObject} from '../src/lib/notebookDocument.ts';
import {verifyPaperCollaboration} from '../src/lib/paperCollaboration.ts';
import {insertPaperImage,preparePaperImageInsertion,type PaperImageInsertionInput} from '../src/lib/paperImageInsertion.ts';
import {parsePhotoReference} from '../src/lib/notebook.ts';
globalThis.indexedDB=indexedDB;
const bytes=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==','base64'));
let count=0;
async function fixture():Promise<{input:PaperImageInsertionInput;stored:Draft;identity:Pick<Draft,'accountId'|'spaceId'|'type'|'documentId'>}>{
 const scope={accountId:`qa-image-insert-${++count}`,spaceId:'year'},document=migratePaper('Note é🟦','# Texte original\n\nConservé.',null,'2026-10-13T12:00:00Z'),identity={...scope,type:'whiteboard' as const,documentId:notebookDocumentId(document.noteId)};
 const stored:Draft={...identity,title:'Original',content:document,baseVersion:55,updatedAt:1,syncState:'synced'};await putDraft(stored);
 return {input:{document,scope,blob:new Blob([bytes],{type:'image/png'}),name:'Original.png',current:()=>true,newId:()=>`photo-${count}`,now:'2026-10-13T14:00:00Z'},stored:(await getDraft(identity))!,identity};
}

test('Inline upload commits exact bytes, graph ownership and recovery together, never serialising the media API',async()=>{
 const f=await fixture();const result=await insertPaperImage({...f.input,scope:{...f.input.scope,api:()=>{}} as any}),saved=(await getDraft(f.identity))!;
 assert.equal(saved.baseVersion,55);assert.ok(isPaperDocument(saved.content));verifyPaperCollaboration(saved.content);assert.equal(saved.content.objects[0].markdown,f.input.document.objects[0].markdown);assert.equal(saved.content.objects.filter(object=>object.kind==='image').length,0);assert.deepEqual(parsePhotoReference(result.url),{documentId:f.identity.documentId,id:result.asset.id});
 const files=await listLocalBlobs(f.identity.accountId,f.identity.spaceId);assert.equal(files.length,1);assert.deepEqual(new Uint8Array(await files[0].blob.arrayBuffer()),bytes);assert.equal(files[0].sha256,await localBlobDigest(f.input.blob));assert.equal(files[0].documentId,f.identity.documentId);assert.equal(files[0].removedFromNote,false);assert.equal(files[0].status,'pending');assert.equal(Object.hasOwn(files[0],'api'),false);
 const snapshots=await listSnapshots(f.identity.accountId,f.identity.spaceId);assert.equal(snapshots.length,2);assert.deepEqual(snapshots.find(row=>row.key.startsWith('paper-history|'))!.value,f.input.document);const receipt=snapshots.find(row=>row.key.startsWith('paper-image-insertion|'))!.value as any;assert.equal(receipt.mode,'inline');assert.equal(receipt.sha256,files[0].sha256);assert.equal(receipt.blob,undefined);
});
test('Floating image uses the same atomic path with its page and file, and preserves the original graph',async()=>{
 const f=await fixture(),object:PaperObject={id:'floating-object',pageId:f.input.document.pages[0].id,kind:'image',assetId:'ignored',x:72,y:92,width:320,height:240,rotation:0,z:1,locked:false,createdAt:1};const original=structuredClone(f.input.document),result=await insertPaperImage({...f.input,object});
 const document=(await getDraft(f.identity))!.content;assert.ok(isPaperDocument(document));assert.equal(document.objects.find(row=>row.id===object.id)!.assetId,result.asset.id);assert.deepEqual(f.input.document,original);assert.equal((await listLocalBlobs(f.identity.accountId,f.identity.spaceId)).length,1);
});
test('Preflight writes nothing, and a concurrent same-revision text edit aborts both the graph and file commit',async()=>{
 const f=await fixture(),plan=await preparePaperImageInsertion(f.input);assert.deepEqual(await getDraft(f.identity),f.stored);assert.equal((await listLocalBlobs(f.identity.accountId,f.identity.spaceId)).length,0);
 const changed=structuredClone(f.input.document);changed.objects[0].markdown='Contribution reçue au même compteur';await putDraft({...f.stored,content:changed});const concurrent=(await getDraft(f.identity))!;await assert.rejects(()=>commitNotebookTransfer(plan.commit,()=>true));assert.deepEqual(await getDraft(f.identity),concurrent);assert.equal((await listLocalBlobs(f.identity.accountId,f.identity.spaceId)).length,0);assert.equal((await listSnapshots(f.identity.accountId,f.identity.spaceId)).length,0);
});
test('A file arriving after preflight is preserved and the new graph is never published',async()=>{
 const f=await fixture(),plan=await preparePaperImageInsertion(f.input);await putLocalBlob({...f.input.scope,id:plan.asset.id,blob:new Blob(['different original']),name:'Concurrent',createdAt:1,status:'pending'});const before=(await listLocalBlobs(f.identity.accountId,f.identity.spaceId))[0];await assert.rejects(()=>commitNotebookTransfer(plan.commit,()=>true));assert.deepEqual((await listLocalBlobs(f.identity.accountId,f.identity.spaceId))[0],before);assert.deepEqual(await getDraft(f.identity),f.stored);
});
test('Cancellation during preparation and at commit never leaks an image into either account',async()=>{
 const f=await fixture();let checks=0;await assert.rejects(()=>preparePaperImageInsertion({...f.input,current:()=>++checks<4}),/compte a changé/);const plan=await preparePaperImageInsertion(f.input);await assert.rejects(()=>commitNotebookTransfer(plan.commit,()=>false));assert.equal((await listLocalBlobs(f.identity.accountId,f.identity.spaceId)).length,0);assert.deepEqual(await getDraft(f.identity),f.stored);
});
test('Canonical deletion before or after preflight prevents resurrection with new image bytes',async()=>{
 for(const phase of ['before','after']){const f=await fixture(),plan=phase==='after'?await preparePaperImageInsertion(f.input):undefined;await putSnapshot({key:notebookDeletionKey(f.identity),...f.input.scope,value:{schema:1,kind:'paper-canonical-deletion',...f.input.scope,documentId:f.identity.documentId,noteId:f.input.document.noteId,version:80,deletedAt:Date.now()}});
 if(plan)await assert.rejects(()=>commitNotebookTransfer(plan.commit,()=>true));else await assert.rejects(()=>insertPaperImage(f.input),/supprimé/);assert.equal((await listLocalBlobs(f.identity.accountId,f.identity.spaceId)).length,0);assert.deepEqual(await getDraft(f.identity),f.stored);}
});
test('Corrupt image structure, forged MIME and unsupported format cannot become managed files',async()=>{
 for(const blob of [new Blob(['not PNG'],{type:'image/png'}),new Blob([bytes],{type:'image/jpeg'}),new Blob([bytes],{type:'image/svg+xml'})]){const f=await fixture();await assert.rejects(()=>insertPaperImage({...f.input,blob}));assert.deepEqual(await getDraft(f.identity),f.stored);assert.equal((await listLocalBlobs(f.identity.accountId,f.identity.spaceId)).length,0);}
});
test('The upload cap is 16 MiB and not the old 350 kB embedded-image restriction',async()=>{
 const f=await fixture();await assert.rejects(()=>insertPaperImage({...f.input,blob:new Blob([new Uint8Array(16*1024*1024+1)],{type:'image/png'})}),/16 Mo/);assert.deepEqual(await getDraft(f.identity),f.stored);
});
test('Duplicate asset or local file identities never replace an original',async()=>{
 for(const mode of ['asset','file']){const f=await fixture(),id=f.input.newId!();if(mode==='asset'){f.input.document=applyPaperCommand(f.input.document,{type:'add-asset',asset:{id,name:'Existing',mediaType:'image/png',size:bytes.length}});await putDraft({...f.stored,content:f.input.document});}else await putLocalBlob({...f.input.scope,id,blob:new Blob([bytes],{type:'image/png'}),name:'Existing',createdAt:1,status:'pending'});
 const before=(await getDraft(f.identity))!,files=await listLocalBlobs(f.identity.accountId,f.identity.spaceId);await assert.rejects(()=>insertPaperImage(f.input));assert.deepEqual(await getDraft(f.identity),before);assert.deepEqual(await listLocalBlobs(f.identity.accountId,f.identity.spaceId),files);}
});
test('Conflict, retired alias, foreign owner and changed page reject insertion before any write',async()=>{
 for(const mode of ['conflict','alias','foreign','page']){const f=await fixture();if(mode!=='page'){const changed={...f.stored,...(mode==='conflict'?{syncState:'conflict' as const}:mode==='alias'?{identityAlias:'retired'}:{content:{...f.input.document,noteId:'another-owner'}})};await putDraft(changed);}const before=(await getDraft(f.identity))!;const object:PaperObject={id:'floating',pageId:'missing',kind:'image',x:0,y:0,width:32,height:32,rotation:0,z:0,locked:false,createdAt:1};await assert.rejects(()=>insertPaperImage({...f.input,...(mode==='page'?{object}:{})}));assert.deepEqual(await getDraft(f.identity),before);assert.equal((await listLocalBlobs(f.identity.accountId,f.identity.spaceId)).length,0);}
});
test('A source graph belonging to another year is not found by its globally matching note ID',async()=>{
 const f=await fixture();await assert.rejects(()=>insertPaperImage({...f.input,scope:{...f.input.scope,spaceId:'other-year'}}));assert.deepEqual(await getDraft(f.identity),f.stored);assert.equal((await listLocalBlobs(f.identity.accountId,'other-year')).length,0);
});

test('A different historical body at the same revision is preserved together with the exact pre-insertion source',async()=>{
 const f=await fixture(),key=`paper-history|${f.identity.accountId}|${f.identity.spaceId}|whiteboard|${f.identity.documentId}|${String(f.input.document.revision).padStart(12,'0')}`,older=structuredClone(f.input.document);older.objects[0].markdown='Une autre source à ce compteur';const original={key,...f.input.scope,value:older};await putSnapshot(original);await insertPaperImage(f.input);const snapshots=await listSnapshots(f.identity.accountId,f.identity.spaceId),histories=snapshots.filter(row=>row.key.startsWith('paper-history|'));assert.equal(histories.length,2);assert.deepEqual(histories.find(row=>row.key===key),original);assert.deepEqual(histories.find(row=>row.key!==key)!.value,f.input.document);const receipt=snapshots.find(row=>row.key.startsWith('paper-image-insertion|'))!.value as any;assert.equal(receipt.beforeHistoryKey,histories.find(row=>row.key!==key)!.key);
});
