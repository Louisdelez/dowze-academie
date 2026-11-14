import assert from 'node:assert/strict';
import test from 'node:test';
import {indexedDB} from 'fake-indexeddb';
import {applyChangePage,commitPaperIdentityPromotion,getDraft,getSnapshot,listDrafts,listLocalBlobs,listMutations,listSnapshots,putDraft,putEditedDraft,saveDraftAndQueue,savePaperDraft,DraftChangedError,putLocalBlob,putSnapshot,queueLocalDrafts,queueMutation,type Draft,type PaperIdentityPromotion} from '../pwa/src/storage.ts';
globalThis.indexedDB=indexedDB;
const noteId='historical-note';
const content=(text='original')=>({notebookSchema:3,noteId,revision:1,assets:[{id:'asset-a',name:'Image',mediaType:'image/png',size:0},{id:'asset-direct',name:'Image2',mediaType:'image/png',size:0}],objects:[{id:'text-a',pageId:'page-a',kind:'text',markdown:text,x:48,y:48,width:698,height:1027,rotation:0,z:0,locked:false,createdAt:0}],pages:[{id:'page-a',width:794,height:1123,pattern:'plain',color:'#ffffff',bookmark:false,rotation:0}],audio:[],updatedAt:'2026-10-13T00:00:00Z',legacy:{markdown:'original',boardId:'note-historical-note',migratedAt:'2026-10-13T00:00:00Z'}});
function fixture(name:string):PaperIdentityPromotion{
 const source:Draft={accountId:'identity-'+name,spaceId:'year-2026',documentId:'paper-v3-old',type:'whiteboard',title:'Original',content:content(),baseVersion:7,updatedAt:1,syncState:'local'};
 return {source,target:undefined,canonical:{...source,documentId:'paper-v3-id2-new',baseVersion:99},assetIds:['asset-a','asset-direct'],receiptKey:'identity-receipt|'+name};
}
const draftKey=(row:Draft)=>`${row.accountId}|${row.spaceId}|${row.type}|${row.documentId}`;
async function observed(plan:PaperIdentityPromotion){
 const files=await listLocalBlobs(plan.source.accountId,plan.source.spaceId);
 return {drafts:await listDrafts(plan.source.accountId,plan.source.spaceId),mutations:await listMutations(plan.source.accountId,plan.source.spaceId),snapshots:await listSnapshots(plan.source.accountId,plan.source.spaceId),files:await Promise.all(files.map(async({blob,...metadata})=>({...metadata,text:await blob.text(),size:blob.size,type:blob.type})))};
}
test('promotion atomically retains old state, starts the new version stream and rebases only owned files/metadata',async()=>{
 const plan=fixture('complete'),oldKey=draftKey(plan.source),newKey=draftKey(plan.canonical);
 await putDraft(plan.source);
 const metadata:Draft={...plan.source,type:'notesMarkdown',documentId:noteId,paperDependency:plan.source.documentId,content:{id:noteId,markdown:'metadata exact'},syncState:'synced'};
 const otherMetadata={...metadata,documentId:'other-note',content:{id:'other-note',markdown:'other exact'}};
 await putDraft(metadata);await putDraft(otherMetadata);
 const mutation={...plan.source,id:'old-outbox',createdAt:2,status:'pending' as const};await queueMutation(mutation);
 const mutationOther={...mutation,id:'unrelated-outbox',documentId:'unrelated'};await queueMutation(mutationOther);
 const files=[{id:'asset-a',documentId:plan.source.documentId},{id:'asset-direct',documentId:`paper-v3-${noteId}`},{id:'asset-other',documentId:plan.source.documentId},{id:'asset-a',documentId:plan.source.documentId,accountId:'another-account'}];
 for(const file of files)await putLocalBlob({accountId:plan.source.accountId,spaceId:plan.source.spaceId,...file,blob:new Blob(['bytes-'+file.id],{type:'image/png'}),name:file.id,createdAt:3,status:'uploaded',serverId:'remote-'+file.id});
 const keys=[`paper-history|${oldKey}|000000000001`,`paper-migration|${oldKey}`,`paper-resolution|${oldKey}|resolution-a`];
 for(const key of keys)await putSnapshot({key,accountId:plan.source.accountId,spaceId:plan.source.spaceId,value:{original:content(),exact:key}});
 await putSnapshot({key:`paper-history|${oldKey}-other|000000000001`,accountId:plan.source.accountId,spaceId:plan.source.spaceId,value:'unrelated'});
 await commitPaperIdentityPromotion(plan,()=>true);
 assert.equal((await getDraft(plan.source))?.identityAlias,plan.canonical.documentId);
 assert.deepEqual((await getDraft(plan.source))?.content,plan.source.content);
 assert.equal((await getDraft(plan.canonical))?.baseVersion,0);
 assert.equal((await getDraft(metadata))?.paperDependency,plan.canonical.documentId);
 assert.equal((await getDraft(otherMetadata))?.paperDependency,plan.source.documentId);
 const outbox=await listMutations(plan.source.accountId,plan.source.spaceId);
 assert.equal(outbox.find(row=>row.id===mutation.id)?.identityAlias,plan.canonical.documentId);
 assert.equal(outbox.find(row=>row.id===mutationOther.id)?.identityAlias,undefined);
 assert.deepEqual(outbox.find(row=>row.id===mutation.id)?.content,mutation.content);
 const stored=await listLocalBlobs(plan.source.accountId,plan.source.spaceId);
 for(const id of ['asset-a','asset-direct']){const file=stored.find(row=>row.id===id)!;assert.equal(file.documentId,plan.canonical.documentId);assert.equal(await file.blob.text(),'bytes-'+id);assert.equal(file.serverId,'remote-'+id);assert.equal(file.status,'uploaded');}
 assert.equal(stored.find(row=>row.id==='asset-other')?.documentId,plan.source.documentId);
 assert.equal((await listLocalBlobs('another-account',plan.source.spaceId))[0].documentId,plan.source.documentId);
 for(const old of keys){assert.ok(await getSnapshot(old));assert.deepEqual((await getSnapshot(old.replace(oldKey,newKey)))?.value,(await getSnapshot(old))?.value);}
 assert.equal(await getSnapshot(`paper-history|${newKey}-other|000000000001`),undefined);
 const receipt=(await getSnapshot(plan.receiptKey))!.value as {source:Draft;mutations:unknown[];files:{blob?:unknown;documentId?:string}[]};
 assert.deepEqual(receipt.source,plan.source);assert.equal(receipt.mutations.length,1);assert.equal(receipt.files.length,2);assert.ok(receipt.files.every(row=>row.blob===undefined));assert.equal(receipt.files[0].documentId,plan.source.documentId);
 await queueLocalDrafts(plan.source.accountId,plan.source.spaceId);
 const queued=await listMutations(plan.source.accountId,plan.source.spaceId);
 assert.equal(queued.filter(row=>row.documentId===plan.source.documentId).length,1);
 assert.ok(queued.some(row=>row.documentId===plan.canonical.documentId&&row.baseVersion===0));
});
test('source and destination compare-and-swap failures do not change any other store',async()=>{
 for(const kind of ['source','target']){
  const plan=fixture('cas-'+kind);await putDraft(plan.source);
  if(kind==='source')await putDraft({...plan.source,content:content('new external edit')});
  else await putDraft({...plan.canonical,baseVersion:9,content:content('existing destination')});
  await queueMutation({...plan.source,id:'cas-'+kind,createdAt:1,status:'pending'});
  const before=await observed(plan);await assert.rejects(()=>commitPaperIdentityPromotion(plan,()=>true),/changé/);assert.deepEqual(await observed(plan),before);
 }
});
test('scope revocation after reads aborts draft, outbox, files and receipt together',async()=>{
 const plan=fixture('revoked');await putDraft(plan.source);await queueMutation({...plan.source,id:'revoked-outbox',createdAt:1,status:'pending'});
 await putLocalBlob({...plan.source,id:'asset-a',blob:new Blob(['untouched']),name:'Image',createdAt:1,status:'pending'});
 const before=await observed(plan);let checks=0;
 await assert.rejects(()=>commitPaperIdentityPromotion(plan,()=>++checks<3),/connexion/);
 assert.deepEqual(await observed(plan),before);assert.equal(await getSnapshot(plan.receiptKey),undefined);
});
test('foreign account/year, target owner and unowned files are rejected before writes',async()=>{
 const plan=fixture('foreign');await putDraft(plan.source);const before=await observed(plan);
 const variants=[{...plan,canonical:{...plan.canonical,accountId:'foreign'}},{...plan,canonical:{...plan.canonical,spaceId:'foreign-year'}},{...plan,canonical:{...plan.canonical,content:{...content(),noteId:'foreign-note'}}},{...plan,canonical:{...plan.canonical,content:{notebookSchema:3,noteId}}},{...plan,assetIds:['not-owned']},{...plan,target:{...plan.canonical,content:{...content(),noteId:'foreign-note'}}}];
 for(const variant of variants)await assert.rejects(()=>commitPaperIdentityPromotion(variant,()=>true));
 assert.deepEqual(await observed(plan),before);
});
test('a matching existing canonical keeps its own server counter and colliding history is preserved',async()=>{
 const plan=fixture('destination');plan.target={...plan.canonical,baseVersion:12,content:content('canonical newer'),syncState:'synced'};await putDraft(plan.source);await putDraft(plan.target);
 const oldHistory=`paper-history|${draftKey(plan.source)}|000000000001`,newHistory=oldHistory.replace(draftKey(plan.source),draftKey(plan.canonical));
 await putSnapshot({key:oldHistory,accountId:plan.source.accountId,spaceId:plan.source.spaceId,value:content('source history')});await putSnapshot({key:newHistory,accountId:plan.source.accountId,spaceId:plan.source.spaceId,value:content('destination history')});
 await commitPaperIdentityPromotion({...plan,canonical:{...plan.canonical,content:content('merged')}} ,()=>true);
 assert.equal((await getDraft(plan.canonical))?.baseVersion,12);assert.deepEqual((await getSnapshot(newHistory))?.value,content('destination history'));
 const copies=(await listSnapshots(plan.source.accountId,plan.source.spaceId)).filter(row=>row.key.startsWith(newHistory+'|identity-'));assert.equal(copies.length,1);assert.deepEqual(copies[0].value,content('source history'));
});
test('legacy remote updates retain provenance, preserve canonical state and skip foreign owners/tombstones',async()=>{
 const plan=fixture('remote');await putDraft(plan.source);await commitPaperIdentityPromotion(plan,()=>true);const canonical=await getDraft(plan.canonical);
 const page=(version:number,received:unknown,deleted=false)=>({next_cursor:'cursor-'+version,has_more:false,items:[{document_type:'whiteboard' as const,document_id:plan.source.documentId,space_id:plan.source.spaceId,version,content:received,deleted,changed_at:'2026-10-13T10:00:00Z'}]});
 await applyChangePage(plan.source.accountId,plan.source.spaceId,page(8,content('remote same owner')));
 assert.deepEqual((await getDraft(plan.source))?.content,content('remote same owner'));assert.equal((await getDraft(plan.source))?.baseVersion,8);assert.equal((await getDraft(plan.source))?.identityAlias,plan.canonical.documentId);assert.deepEqual(await getDraft(plan.canonical),canonical);
 await applyChangePage(plan.source.accountId,plan.source.spaceId,page(9,{...content('collision'),noteId:'another-note'}));
 assert.deepEqual((await getDraft(plan.source))?.content,content('remote same owner'));assert.equal((await getDraft(plan.source))?.baseVersion,8);
 const collision=(await getSnapshot(`paper-identity-source|${draftKey(plan.source)}|9`))?.value as {kind?:string};assert.equal(collision.kind,'paper-identity-collision');
 await applyChangePage(plan.source.accountId,plan.source.spaceId,page(10,null,true));
 assert.deepEqual((await getDraft(plan.source))?.content,content('remote same owner'));assert.equal((await getDraft(plan.source))?.baseVersion,10);assert.deepEqual(await getDraft(plan.canonical),canonical);
 assert.equal((await getSnapshot(`sync-cursor|${plan.source.accountId}|${plan.source.spaceId}`))?.value,'cursor-10');
 await applyChangePage(plan.source.accountId,plan.source.spaceId,page(8,content('stale response')));assert.deepEqual((await getDraft(plan.source))?.content,content('remote same owner'));
});
test('revoked remote alias reception commits neither provenance, source nor cursor',async()=>{
 const plan=fixture('remote-revoked');await putDraft(plan.source);await commitPaperIdentityPromotion(plan,()=>true);const before=await observed(plan);let checks=0;
 const page={next_cursor:'must-not-commit',has_more:false,items:[{document_type:'whiteboard' as const,document_id:plan.source.documentId,space_id:plan.source.spaceId,version:8,content:content('not committed'),deleted:false,changed_at:'2026-10-13T10:00:00Z'}]};
 await assert.rejects(()=>applyChangePage(plan.source.accountId,plan.source.spaceId,page,()=>++checks<2));assert.deepEqual(await observed(plan),before);
});
test('malformed legacy documents remain recovery evidence and cannot replace source or canonical',async()=>{
 const plan=fixture('malformed');await putDraft(plan.source);await commitPaperIdentityPromotion(plan,()=>true);const source=await getDraft(plan.source),canonical=await getDraft(plan.canonical);
 const page={next_cursor:'malformed-seen',has_more:false,items:[{document_type:'whiteboard' as const,document_id:plan.source.documentId,space_id:plan.source.spaceId,version:8,content:{notebookSchema:3,noteId,objects:[]},deleted:false,changed_at:'2026-10-13T10:00:00Z'}]};
 await applyChangePage(plan.source.accountId,plan.source.spaceId,page);assert.deepEqual(await getDraft(plan.source),source);assert.deepEqual(await getDraft(plan.canonical),canonical);
 const proof=(await getSnapshot(`paper-identity-source|${draftKey(plan.source)}|8`))?.value as {kind?:string};assert.equal(proof.kind,'paper-identity-collision');
 const before=await observed(plan);await assert.rejects(()=>applyChangePage(plan.source.accountId,plan.source.spaceId,{...page,items:page.items.map(row=>({...row,space_id:'foreign-year'}))}),/autre année/);assert.deepEqual(await observed(plan),before);
});
test('successive promotions keep immutable receipt provenance with a linear pointer chain',async()=>{
 const plan=fixture('receipt-chain');await putDraft(plan.source);
 await putLocalBlob({...plan.source,id:'asset-a',blob:new Blob(['immutable bytes']),name:'Original',createdAt:1,status:'pending'});
 await commitPaperIdentityPromotion(plan,()=>true);
 const first=await getSnapshot(plan.receiptKey),previousValues=[first!.value];
 const sourceOriginal=(await getDraft(plan.source))!.content;
 for(let update=1;update<=3;update++){
  const source={...(await getDraft(plan.source))!,content:content('legacy update '+update),baseVersion:7+update};
  await putDraft(source);
  const target=(await getDraft(plan.canonical))!;
  const canonical={...target,content:content('merged update '+update),syncState:'local' as const};
  await commitPaperIdentityPromotion({...plan,source,target,canonical},()=>true);
  const latest=(await getSnapshot(plan.receiptKey))!;
  const value=latest.value as {previous?:unknown;previousReceiptKey?:string};
  assert.equal(value.previous,undefined);assert.ok(value.previousReceiptKey);
  assert.deepEqual((await getSnapshot(value.previousReceiptKey!))?.value,previousValues.at(-1));
  previousValues.push(latest.value);
 }
 const keys=new Set<string>();let row=await getSnapshot(plan.receiptKey),count=0;
 while(row){assert.ok(!keys.has(row.key));keys.add(row.key);count++;
  const value=row.value as {previous?:unknown;previousReceiptKey?:string;files:{blob?:unknown}[]};
  assert.equal(value.previous,undefined);assert.ok(value.files.every(file=>file.blob===undefined));
  row=value.previousReceiptKey?await getSnapshot(value.previousReceiptKey):undefined;
 }
 assert.equal(count,4);assert.equal((await listSnapshots(plan.source.accountId,plan.source.spaceId)).filter(snapshot=>snapshot.key.startsWith(plan.receiptKey+'|previous-')).length,3);
 const oldest=(await getSnapshot([...keys].at(-1)!))!.value as {source:Draft};assert.deepEqual(oldest.source.content,sourceOriginal);
 assert.equal(await (await listLocalBlobs(plan.source.accountId,plan.source.spaceId))[0].blob.text(),'immutable bytes');
 const before=await observed(plan);
 // Reusing a captured pre-promotion source cannot create another receipt or
 // overwrite the immutable provenance, even with the same deterministic key.
 await assert.rejects(()=>commitPaperIdentityPromotion(plan,()=>true));assert.deepEqual(await observed(plan),before);
 assert.deepEqual((await getSnapshot([...keys].at(-1)!))?.value,first!.value);
});
test('late writers preserve a proved durable alias, source counter and novel body',async()=>{
 for(const writer of ['putDraft','putEditedDraft','saveDraftAndQueue','savePaperDraft']){
  const plan=fixture('writer-'+writer);await putDraft(plan.source);await commitPaperIdentityPromotion(plan,()=>true);
  const late={...plan.source,content:{...content('late '+writer),revision:2},baseVersion:0,syncState:'local' as const};
  if(writer==='putDraft')await putDraft(late);
  else if(writer==='putEditedDraft')await putEditedDraft(late);
  else if(writer==='savePaperDraft')await savePaperDraft(late,1);
  else{const queued=await saveDraftAndQueue(late,{...late,id:'late-'+writer,createdAt:2,status:'pending'});assert.equal(queued.identityAlias,plan.canonical.documentId);}
  const original=await getDraft(plan.source);assert.equal(original?.identityAlias,plan.canonical.documentId);assert.equal(original?.baseVersion,7);assert.deepEqual(original?.content,late.content);assert.deepEqual((await getDraft(plan.canonical))?.content,plan.canonical.content);
  await assert.rejects(()=>putDraft({...late,content:{...content(),noteId:'foreign-note'}}),/autre note/);assert.deepEqual(await getDraft(plan.source),original);
 }
});
test('exact edited-draft CAS rejects a stale mirror and a revoked owner without changing durable metadata',async()=>{
 const plan=fixture('mirror-cas'),metadata:Draft={...plan.source,type:'notesMarkdown',documentId:noteId,content:{id:noteId,markdown:'baseline'}};
 await putDraft(metadata);const latest={...metadata,content:{id:noteId,markdown:'other writer'}};await putDraft(latest);
 const before=await getDraft(metadata);
 await assert.rejects(()=>putEditedDraft({...metadata,content:{id:noteId,markdown:'stale mirror'}},metadata.content),DraftChangedError);assert.deepEqual(await getDraft(metadata),before);
 await assert.rejects(()=>putEditedDraft({...latest,content:{id:noteId,markdown:'revoked mirror'}},latest.content,()=>false),DraftChangedError);assert.deepEqual(await getDraft(metadata),before);
 await putEditedDraft({...latest,content:{id:noteId,markdown:'current mirror'}},latest.content,()=>true);assert.equal(((await getDraft(metadata))?.content as {markdown:string}).markdown,'current mirror');
});
test('an outbox body changed after planning prevents promotion and its contribution receipt together',async()=>{
 const plan=fixture('mutation-cas');await putDraft(plan.source);
 const mutation={...plan.source,id:'changing-outbox',createdAt:1,status:'pending' as const,content:content('planned contribution')};await queueMutation(mutation);
 await queueMutation({...mutation,content:content('newer contribution')});const before=await observed(plan);
 await assert.rejects(()=>commitPaperIdentityPromotion({...plan,contributions:[{mutation,kind:'conflict'}]},()=>true),/contribution a changé/);assert.deepEqual(await observed(plan),before);
});
