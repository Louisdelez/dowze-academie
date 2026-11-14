import {build} from 'vite';
import {indexedDB} from 'fake-indexeddb';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';

const out=await mkdtemp(join(process.cwd(),'tests/.identity-sync-'));
globalThis.indexedDB=indexedDB;
Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
let failures=0,passed=0;
const group=async(name,work)=>{try{await work();passed++;console.log(name+': PASS');}catch(error){failures++;console.error(name+': FAIL');console.error(error.stack??error);}};
const stamp='2026-10-13T12:00:00Z';
try{
 await build({configFile:false,ssr:{noExternal:['yjs','lib0']},build:{ssr:'tests/paper-identity-sync-entry.ts',outDir:out,copyPublicDir:false,minify:false,sourcemap:false,reportCompressedSize:false,rollupOptions:{output:{entryFileNames:'identity-sync.mjs'}}},logLevel:'error'});
 const m=await import(pathToFileURL(join(out,'identity-sync.mjs')));
 const key=row=>`${row.accountId}|${row.spaceId}|${row.type}|${row.documentId}`;
 const visible=document=>document.objects.find(object=>object.kind==='text').markdown;
 const apiFor=(scope,source)=>{
  const remote=new Map(),events=[],calls=[],changeCalls=[];let sequence=0,canonicalGate;
  const remoteKey=(type,id)=>`${type}|${id}`;
  const receive=(type,id,version,content,deleted=false)=>{
   const change={space_id:scope.spaceId,document_type:type,document_id:id,version,content:structuredClone(content),deleted,changed_at:stamp,sequence:++sequence};
   remote.set(remoteKey(type,id),change);events.push(change);return change;
  };
  receive('whiteboard',source.documentId,source.baseVersion,source.content);
  const api={
   bindAccount:account=>assert.equal(account,scope.accountId,'mock session cannot bind another account'),
   uploadBlob:async()=>{throw Error('This fixture has no uploadable media in the active scope.');},
   putDocument:async(space,type,id,base,content,mutationId)=>{
    assert.equal(space,scope.spaceId);assert.match(id,/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/,'server-compatible transport identity');
    const call={space,type,id,base,content:structuredClone(content),mutationId,acknowledged:false};calls.push(call);
    assert.ok(type!=='whiteboard'||id!==source.documentId,'retained legacy aliases must never be PUT');
    const existing=remote.get(remoteKey(type,id)),expected=existing?.version??0;
    if(base!==expected)throw new m.ApiError(409,'Version distincte','version_conflict',expected);
    if(type==='notesMarkdown'){
     const metadata=await m.getDraft({...scope,type,documentId:id});
     const dependency=metadata?.paperDependency&&await m.getDraft({...scope,type:'whiteboard',documentId:metadata.paperDependency});
     assert.equal(dependency?.syncState,'synced','visible metadata must wait for durable canonical acknowledgement');
     assert.ok(remote.has(remoteKey('whiteboard',metadata.paperDependency)),'canonical must already exist remotely');
    }
    if(type==='whiteboard'&&canonicalGate)await canonicalGate(call);
    const change=receive(type,id,expected+1,content);call.acknowledged=true;return change;
   },
   changes:async(space,cursor)=>{
    assert.equal(space,scope.spaceId);changeCalls.push(cursor);
    const after=cursor===undefined?0:Number(cursor);assert.ok(Number.isSafeInteger(after)&&after>=0);
    return {items:events.filter(event=>event.sequence>after).map(event=>structuredClone(event)),has_more:false,next_cursor:String(sequence)};
   }
  };
  return {api,remote,calls,changeCalls,receive,gate:work=>{canonicalGate=work;},sequence:()=>sequence};
 };
 const seed=async(name,noteId='é',extraScope={})=>{
  const scope={accountId:'qa-identity-sync-'+name,spaceId:'year-2026',...extraScope};
  const plain=m.migratePaper(noteId,'Base.',null,stamp),document=m.amendPaperCollaboration(plain,plain);
  const source={...scope,type:'whiteboard',documentId:m.legacyNotebookDocumentId(noteId),title:'Original',content:document,baseVersion:7,updatedAt:1,syncState:'local'};
  await m.putDraft(source);await m.queueMutation({...source,id:'old-pending-'+name,createdAt:1,status:'pending'});
  const canonical={...source,documentId:m.notebookDocumentId(noteId)};
  assert.notEqual(source.documentId,canonical.documentId);
  return {scope,noteId,source,canonical,document,mock:apiFor(scope,source)};
 };
 const synchronize=fixture=>m.synchronizeSpace(fixture.mock.api,fixture.scope.accountId,fixture.scope.spaceId,()=>true);
 const cursor=scope=>m.getSnapshot(`sync-cursor|${scope.accountId}|${scope.spaceId}`).then(row=>row?.value);
 const edit=(document,markdown)=>m.amendPaperCollaboration(document,m.applyPaperCommand(document,{type:'patch-object',id:document.objects.find(object=>object.kind==='text').id,patch:{markdown}}));

 await group('Migration and canonical publication use base0; legacy source7/outbox remain recovery only',async()=>{
  const f=await seed('initial');await m.normalizeNotebookIdentities(f.scope);const initial=await m.getDraft(f.canonical);
  assert.equal(initial.baseVersion,0);assert.equal(initial.content.noteId,'é');assert.deepEqual(initial.content,f.document);
  await synchronize(f);
  assert.deepEqual(f.mock.calls.map(call=>[call.type,call.id,call.base]),[['whiteboard',f.canonical.documentId,0]]);
  const canonical=await m.getDraft(f.canonical),source=await m.getDraft(f.source);
  assert.equal(canonical.baseVersion,1);assert.equal(canonical.syncState,'synced');assert.equal(source.baseVersion,7);assert.equal(source.identityAlias,f.canonical.documentId);assert.deepEqual(source.content,f.document);
  const old=(await m.listMutations(f.scope.accountId,f.scope.spaceId)).find(row=>row.id==='old-pending-initial');assert.equal(old.identityAlias,f.canonical.documentId);assert.deepEqual(old.content,f.document);
  assert.equal(await cursor(f.scope),String(f.mock.sequence()));
  const receipt=await m.getSnapshot(m.paperIdentityReceiptKey(f.scope,f.source.documentId));await m.normalizeNotebookIdentities(f.scope);assert.deepEqual(await m.getSnapshot(receipt.key),receipt);
 });

 await group('Legacy remote contribution merges with a canonical local edit and retains its own version/cursor',async()=>{
  const f=await seed('merge');await synchronize(f);
  const local=await m.getDraft(f.canonical),localDocument=edit(local.content,'Local. Base.');await m.savePaperDraft({...local,content:localDocument,updatedAt:2,syncState:'local'},local.content.revision);
  const remote=edit(f.document,'Base. Remote.');f.mock.receive('whiteboard',f.source.documentId,8,remote);
  await synchronize(f);
  const merged=await m.getDraft(f.canonical);assert.equal(visible(merged.content),'Local. Base. Remote.');assert.equal(merged.baseVersion,2);assert.equal(merged.syncState,'local');m.verifyPaperCollaboration(merged.content);
  assert.equal((await m.getDraft(f.source)).baseVersion,8);assert.equal(await cursor(f.scope),String(f.mock.sequence()));
  await synchronize(f);const acknowledged=await m.getDraft(f.canonical);assert.equal(acknowledged.baseVersion,3);assert.equal(acknowledged.syncState,'synced');assert.equal(visible(f.mock.remote.get('whiteboard|'+f.canonical.documentId).content),'Local. Base. Remote.');
  assert.ok(f.mock.calls.every(call=>call.id!==f.source.documentId));assert.deepEqual(f.mock.calls.map(call=>call.base),[0,1,2]);
 });

 await group('Legacy tombstone does not delete or falsely conflict with an independently edited canonical',async()=>{
  const f=await seed('tombstone');await synchronize(f);const canonical=await m.getDraft(f.canonical);
  await m.savePaperDraft({...canonical,content:edit(canonical.content,'Canonical continued.'),syncState:'local',updatedAt:3},canonical.content.revision);
  f.mock.receive('whiteboard',f.source.documentId,8,null,true);await synchronize(f);
  const retained=await m.getDraft(f.canonical);assert.equal(visible(retained.content),'Canonical continued.');assert.equal(retained.syncState,'synced');assert.equal(retained.baseVersion,2);assert.equal(retained.conflict,undefined);
  assert.equal((await m.getDraft(f.source)).baseVersion,8);const proof=await m.getSnapshot(`paper-identity-source|${key(f.source)}|8`);assert.equal(proof.value.incoming.deleted,true);assert.equal(await cursor(f.scope),String(f.mock.sequence()));
 });

 await group('Metadata dependency switches to canonical and publication waits for actual acknowledgement',async()=>{
  const f=await seed('metadata','a'.repeat(105)+'X');
  const metadata={...f.scope,type:'notesMarkdown',documentId:f.noteId,title:'Metadata',content:{id:f.noteId,title:'Metadata',markdown:'Exact metadata',tags:[],subjectIds:[],createdAt:stamp,updatedAt:stamp},paperDependency:f.source.documentId,baseVersion:0,updatedAt:1,syncState:'local'};
  await m.putDraft(metadata);await m.queueMutation({...metadata,id:'old-metadata-pending',createdAt:1,status:'pending'});
  let started,release;const reached=new Promise(resolve=>{started=resolve;}),hold=new Promise(resolve=>{release=resolve;});f.mock.gate(async call=>{started(call);await hold;});
  const work=synchronize(f);const first=await reached;
  try{assert.equal(first.id,f.canonical.documentId);assert.equal(first.base,0);assert.equal((await m.getDraft(metadata)).paperDependency,f.canonical.documentId);assert.equal((await m.getDraft(f.canonical)).syncState,'queued');assert.ok(f.mock.calls.every(call=>call.type==='whiteboard'));}
  finally{release();}
  await work;assert.equal((await m.getDraft(metadata)).syncState,'synced');assert.ok(f.mock.calls.some(call=>call.type==='notesMarkdown'));assert.equal(f.mock.calls[0].acknowledged,true);assert.ok(f.mock.calls.filter(call=>call.type==='notesMarkdown').every(call=>call.acknowledged));
 });

 await group('One synchronized account/year cannot promote, upload or publish another scope',async()=>{
  const f=await seed('scope'),others=[await seed('scope-other-year','é',{accountId:f.scope.accountId,spaceId:'year-2025'}),await seed('scope-other-account','é',{accountId:'qa-other-account',spaceId:f.scope.spaceId})];
  const before=[];for(const other of others){await m.putLocalBlob({...other.scope,id:'private-file',documentId:other.source.documentId,blob:new Blob(['other private bytes']),name:'Private',createdAt:1,status:'pending'});before.push({drafts:await m.listDrafts(other.scope.accountId,other.scope.spaceId),outbox:await m.listMutations(other.scope.accountId,other.scope.spaceId),snapshots:await m.listSnapshots(other.scope.accountId,other.scope.spaceId)});}
  await synchronize(f);
  for(let i=0;i<others.length;i++){const other=others[i];assert.deepEqual(await m.listDrafts(other.scope.accountId,other.scope.spaceId),before[i].drafts);assert.deepEqual(await m.listMutations(other.scope.accountId,other.scope.spaceId),before[i].outbox);assert.deepEqual(await m.listSnapshots(other.scope.accountId,other.scope.spaceId),before[i].snapshots);const file=(await m.listLocalBlobs(other.scope.accountId,other.scope.spaceId))[0];assert.equal(file.status,'pending');assert.equal(await file.blob.text(),'other private bytes');assert.equal(file.documentId,other.source.documentId);}
  assert.deepEqual(f.mock.calls.map(call=>call.space),[f.scope.spaceId]);
 });

 await group('Foreign-note reception on the legacy alias stays recovery evidence without canonical rerouting',async()=>{
  const f=await seed('collision');await synchronize(f);const canonical=await m.getDraft(f.canonical),source=await m.getDraft(f.source);
  const foreign=m.migratePaper('other-note','Must remain foreign.',null,stamp);f.mock.receive('whiteboard',f.source.documentId,8,foreign);await synchronize(f);
  assert.deepEqual(await m.getDraft(f.canonical),canonical);assert.deepEqual(await m.getDraft(f.source),source);assert.equal(await m.getDraft({...f.canonical,documentId:m.notebookDocumentId('other-note')}),undefined);
  const proof=await m.getSnapshot(`paper-identity-source|${key(f.source)}|8`);assert.equal(proof.value.kind,'paper-identity-collision');assert.equal(proof.value.incoming.content.noteId,'other-note');assert.equal(await cursor(f.scope),String(f.mock.sequence()));
 });

 await group('Scope revoked during a change response cannot consume the cursor or legacy contribution',async()=>{
  const f=await seed('revocation');await synchronize(f);const before={canonical:await m.getDraft(f.canonical),source:await m.getDraft(f.source),cursor:await cursor(f.scope)};
  f.mock.receive('whiteboard',f.source.documentId,8,edit(f.document,'Revoked contribution.'));let allowed=true;
  const api={...f.mock.api,changes:async(...args)=>{const page=await f.mock.api.changes(...args);allowed=false;return page;}};
  await m.synchronizeSpace(api,f.scope.accountId,f.scope.spaceId,()=>allowed);
  assert.deepEqual(await m.getDraft(f.canonical),before.canonical);assert.deepEqual(await m.getDraft(f.source),before.source);assert.equal(await cursor(f.scope),before.cursor);assert.equal(await m.getSnapshot(`paper-identity-source|${key(f.source)}|8`),undefined);
 });

 await group('A stale writer queuing an unmarked alias mutation after promotion cannot publish the old key',async()=>{
  const f=await seed('late-alias');await synchronize(f);
  await m.queueMutation({...f.source,id:'late-unmarked-legacy',createdAt:10,status:'pending'});
  await m.flushMutations(f.mock.api,f.scope.accountId,f.scope.spaceId,()=>true);
  assert.ok(f.mock.calls.every(call=>call.id!==f.source.documentId));assert.ok((await m.listMutations(f.scope.accountId,f.scope.spaceId)).some(row=>row.id==='late-unmarked-legacy'));
 });
 await group('Historical photo reconciliation cannot bypass the retained alias publication guard',async()=>{
  const f=await seed('photo-alias');const source={...f.source,syncState:'synced',content:{...f.source.content,photos:[{id:'legacy-photo',name:'Legacy photograph',status:'pending'}]}};
  await m.putDraft(source);await m.putLocalBlob({...f.scope,id:'legacy-photo',documentId:source.documentId,blob:new Blob(['legacy image bytes'],{type:'image/png'}),name:'Legacy photograph',createdAt:1,status:'uploaded',serverId:'already-uploaded-photo'});
  await m.normalizeNotebookIdentities(f.scope);await synchronize(f);
  assert.ok(f.mock.calls.every(call=>call.type!=='whiteboard'||call.id===f.canonical.documentId));
  const old=await m.getDraft(source);assert.equal(old.identityAlias,f.canonical.documentId);assert.deepEqual(old.content.photos,source.content.photos);
  const bytes=(await m.listLocalBlobs(f.scope.accountId,f.scope.spaceId))[0];assert.equal(await bytes.blob.text(),'legacy image bytes');
 });
 await group('A late outbox-only text contribution joins canonical edits and publishes on its own version stream',async()=>{
  const f=await seed('late-text');await synchronize(f);const baseline=await m.getDraft(f.canonical);
  await m.savePaperDraft({...baseline,content:edit(baseline.content,'Local. Base.'),updatedAt:4,syncState:'local'},baseline.content.revision);
  const late={...f.source,id:'late-new-text',createdAt:20,status:'pending',content:edit(f.document,'Base. Late.')};await m.queueMutation(late);
  const oldSource=await m.getDraft(f.source);await synchronize(f);
  const canonical=await m.getDraft(f.canonical);assert.equal(visible(canonical.content),'Local. Base. Late.');assert.equal(canonical.baseVersion,2);assert.equal(canonical.syncState,'synced');assert.equal(canonical.conflict,undefined);m.verifyPaperCollaboration(canonical.content);
  assert.deepEqual((await m.getDraft(f.source)).content,oldSource.content);assert.equal((await m.getDraft(f.source)).baseVersion,7);
  const retained=(await m.listMutations(f.scope.accountId,f.scope.spaceId)).find(row=>row.id===late.id);assert.deepEqual(retained.content,late.content);assert.equal(retained.baseVersion,7);assert.equal(retained.identityAlias,f.canonical.documentId);
  const receiptKey=m.paperIdentityReceiptKey(f.scope,f.source.documentId),receipt=await m.getSnapshot(receiptKey);assert.equal(receipt.value.contributions.find(row=>row.mutation.id===late.id).kind,'merged');assert.deepEqual(receipt.value.contributions.find(row=>row.mutation.id===late.id).mutation.content,late.content);
  const calls=f.mock.calls.length;await m.normalizeNotebookIdentities(f.scope);await synchronize(f);assert.equal(f.mock.calls.length,calls);assert.deepEqual(await m.getSnapshot(receiptKey),receipt);assert.equal((await m.getDraft(f.canonical)).content.revision,canonical.content.revision);
 });
 await group('A late different-lineage contribution stays exact in outbox/recovery and cannot overwrite canonical',async()=>{
  const f=await seed('late-conflict');await synchronize(f);const baseline=await m.getDraft(f.canonical);
  const plain=m.migratePaper(f.noteId,'Another client lineage.',null,stamp),foreignLineage=m.amendPaperCollaboration(plain,plain);
  const late={...f.source,id:'late-conflicting-text',createdAt:21,status:'pending',content:foreignLineage};await m.queueMutation(late);const sent=f.mock.calls.length;
  await synchronize(f);const canonical=await m.getDraft(f.canonical);assert.deepEqual(canonical.content,baseline.content);assert.equal(canonical.baseVersion,1);assert.equal(canonical.syncState,'conflict');assert.deepEqual(canonical.conflict.identityOutboxIds,[late.id]);assert.equal(f.mock.calls.length,sent);
  const retained=(await m.listMutations(f.scope.accountId,f.scope.spaceId)).find(row=>row.id===late.id);assert.deepEqual(retained.content,late.content);assert.equal(retained.baseVersion,7);assert.equal(retained.identityAlias,f.canonical.documentId);
  const recovery=(await m.listSnapshots(f.scope.accountId,f.scope.spaceId)).filter(row=>row.key.startsWith(`paper-resolution|${key(f.canonical)}|identity-outbox-${late.id}-`));assert.equal(recovery.length,1);assert.deepEqual(recovery[0].value.visibleContent,late.content);assert.deepEqual(recovery[0].value.sourceMutation.content,late.content);assert.deepEqual(recovery[0].value.durable.content,baseline.content);
  const receipt=await m.getSnapshot(m.paperIdentityReceiptKey(f.scope,f.source.documentId));await m.normalizeNotebookIdentities(f.scope);assert.deepEqual(await m.getSnapshot(receipt.key),receipt);assert.equal((await m.listSnapshots(f.scope.accountId,f.scope.spaceId)).filter(row=>row.key.startsWith(recovery[0].key)).length,1);
 });
 await group('A foreign-note late outbox body is quarantined without changing the canonical document',async()=>{
  const f=await seed('late-collision');await synchronize(f);const baseline=await m.getDraft(f.canonical),plain=m.migratePaper('another-owner','Unattributable.',null,stamp);
  const late={...f.source,id:'late-foreign-note',createdAt:22,status:'pending',content:m.amendPaperCollaboration(plain,plain)};await m.queueMutation(late);const sent=f.mock.calls.length;
  await synchronize(f);assert.deepEqual(await m.getDraft(f.canonical),baseline);assert.equal(f.mock.calls.length,sent);assert.equal(await m.getDraft({...f.canonical,documentId:m.notebookDocumentId('another-owner')}),undefined);
  const retained=(await m.listMutations(f.scope.accountId,f.scope.spaceId)).find(row=>row.id===late.id);assert.deepEqual(retained.content,late.content);assert.equal(retained.identityAlias,f.canonical.documentId);
  const receipt=await m.getSnapshot(m.paperIdentityReceiptKey(f.scope,f.source.documentId));assert.equal(receipt.value.contributions.find(row=>row.mutation.id===late.id).kind,'collision');await m.normalizeNotebookIdentities(f.scope);assert.deepEqual(await m.getSnapshot(receipt.key),receipt);
 });
 await group('Late image/audio/ink contribution preserves immutable bytes, associations and time anchors',async()=>{
  const f=await seed('late-media');await synchronize(f);
  const imageBytes=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'));
  const audioBytes=new Uint8Array(16044),view=new DataView(audioBytes.buffer),write=(offset,text)=>{for(let i=0;i<text.length;i++)audioBytes[offset+i]=text.charCodeAt(i);};
  write(0,'RIFF');view.setUint32(4,audioBytes.length-8,true);write(8,'WAVE');write(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,16000,true);
  const image={id:'late-image',name:'Late image',mediaType:'image/png',size:imageBytes.length,serverId:'remote-late-image'},audio={id:'late-audio',name:'Late sound',mediaType:'audio/wav',size:audioBytes.length,serverId:'remote-late-audio'};
  for(const [asset,bytes] of [[image,imageBytes],[audio,audioBytes]])await m.putLocalBlob({...f.scope,id:asset.id,documentId:f.source.documentId,blob:new Blob([bytes],{type:asset.mediaType}),name:asset.name,createdAt:1,status:'uploaded',serverId:asset.serverId});
  const original=f.document.objects[0],next=m.applyPaperCommand(f.document,{type:'batch',commands:[{type:'add-asset',asset:image},{type:'add-asset',asset:audio},{type:'add-audio',audio:{id:'late-track',assetId:audio.id,name:'Late recording',duration:1,startedAt:1}},{type:'upsert-object',object:{...original,id:'late-image-object',kind:'image',markdown:undefined,assetId:image.id,width:320,height:240}},{type:'upsert-object',object:{...original,id:'late-ink',kind:'ink',markdown:undefined,points:[{x:10,y:20,time:2,pressure:.5},{x:60,y:80,time:3,pressure:.8}],color:'#4461dc',strokeWidth:3,audioAnchor:{sessionId:'late-track',time:.25}}}]});
  const late={...f.source,id:'late-media-graph',createdAt:23,status:'pending',content:m.amendPaperCollaboration(f.document,next)};assert.ok(m.isPaperDocument(late.content));await m.queueMutation(late);await synchronize(f);
  const canonical=await m.getDraft(f.canonical);assert.equal(canonical.baseVersion,2);assert.equal(canonical.syncState,'synced');assert.equal(canonical.content.assets.length,2);assert.equal(canonical.content.audio[0].id,'late-track');assert.deepEqual(canonical.content.objects.find(object=>object.id==='late-ink').audioAnchor,{sessionId:'late-track',time:.25});assert.deepEqual(canonical.content.objects.find(object=>object.id==='late-ink').points,late.content.objects.find(object=>object.id==='late-ink').points);assert.equal(canonical.content.objects.find(object=>object.id==='late-image-object').assetId,image.id);m.verifyPaperCollaboration(canonical.content);
  for(const [asset,bytes] of [[image,imageBytes],[audio,audioBytes]]){const stored=(await m.listLocalBlobs(f.scope.accountId,f.scope.spaceId)).find(file=>file.id===asset.id);assert.equal(stored.documentId,f.canonical.documentId);assert.deepEqual(new Uint8Array(await stored.blob.arrayBuffer()),bytes);assert.equal(stored.serverId,asset.serverId);}
  assert.equal((await m.getDraft(f.source)).content.assets.length,0);const retained=(await m.listMutations(f.scope.accountId,f.scope.spaceId)).find(row=>row.id===late.id);assert.deepEqual(retained.content,late.content);
  const receipt=await m.getSnapshot(m.paperIdentityReceiptKey(f.scope,f.source.documentId));assert.equal(receipt.value.files.length,2);assert.ok(receipt.value.files.every(file=>file.documentId===f.source.documentId&&file.blob===undefined));assert.deepEqual(receipt.value.contributions.find(row=>row.mutation.id===late.id).mutation.content,late.content);
 });
 await group('Explicit canonical deletion quarantines late alias bodies and cannot resurrect or publish the deleted key',async()=>{
  const f=await seed('deleted-canonical');await synchronize(f);f.mock.receive('whiteboard',f.canonical.documentId,2,null,true);await synchronize(f);
  assert.equal(await m.getDraft(f.canonical),undefined);const marker=await m.readNotebookDeletionStatus(f.noteId,f.scope);assert.equal(marker.version,2);assert.equal(marker.noteId,f.noteId);assert.equal(visible(marker.source.content),'Base.');
  const late={...f.source,id:'late-after-deletion',createdAt:30,status:'pending',content:edit(f.document,'Late after deletion.')};await m.queueMutation(late);const sent=f.mock.calls.length;
  await synchronize(f);assert.equal(await m.getDraft(f.canonical),undefined);assert.equal(f.mock.calls.length,sent);assert.equal((await m.getDraft(f.source)).baseVersion,7);
  const original=(await m.listMutations(f.scope.accountId,f.scope.spaceId)).find(row=>row.id===late.id);assert.deepEqual(original.content,late.content);assert.equal(original.identityAlias,f.canonical.documentId);
  const receipt=await m.getSnapshot(m.paperIdentityReceiptKey(f.scope,f.source.documentId));assert.equal(receipt.value.kind,'paper-identity-quarantine');assert.equal(receipt.value.deletion.version,2);assert.equal(receipt.value.canonical,undefined);assert.deepEqual(receipt.value.chosenIncomingConflict.content,late.content);
  await assert.rejects(()=>m.ensureNotebookIdentity(f.noteId,f.scope),/supprimée sur le serveur/);assert.equal(await m.getDraft(f.canonical),undefined);await m.normalizeNotebookIdentities(f.scope);assert.deepEqual(await m.getSnapshot(receipt.key),receipt);assert.equal(await cursor(f.scope),String(f.mock.sequence()));
 });
 await group('Canonical deletion keeps a pending canonical edit in conflict and its mutation cannot PUT',async()=>{
  const f=await seed('deleted-pending');await synchronize(f);const canonical=await m.getDraft(f.canonical),pending=edit(canonical.content,'Pending canonical edit.');
  await m.savePaperDraft({...canonical,content:pending,updatedAt:5,syncState:'local'},canonical.content.revision);await m.queueMutation({...canonical,id:'pending-canonical-before-deletion',content:pending,createdAt:31,status:'pending'});
  const tomb=f.mock.receive('whiteboard',f.canonical.documentId,2,null,true);await m.applyChangePage(f.scope.accountId,f.scope.spaceId,{items:[tomb],has_more:false,next_cursor:String(f.mock.sequence())});
  const held=await m.getDraft(f.canonical);assert.deepEqual(held.content,pending);assert.equal(held.syncState,'conflict');assert.equal(held.baseVersion,1);assert.equal((await m.readNotebookDeletionStatus(f.noteId,f.scope)).version,2);
  const sent=f.mock.calls.length;await m.flushMutations(f.mock.api,f.scope.accountId,f.scope.spaceId,()=>true);assert.equal(f.mock.calls.length,sent);assert.deepEqual((await m.listMutations(f.scope.accountId,f.scope.spaceId)).find(row=>row.id==='pending-canonical-before-deletion').content,pending);
  await m.normalizeNotebookIdentities(f.scope);assert.deepEqual((await m.getDraft(f.canonical)).content,pending);assert.equal((await m.getDraft(f.canonical)).syncState,'conflict');
 });
 await group('Only a newer live canonical with a verified owner lifts the explicit deletion marker',async()=>{
  const f=await seed('deleted-live');await synchronize(f);f.mock.receive('whiteboard',f.canonical.documentId,2,null,true);await synchronize(f);
  const foreign=m.migratePaper('foreign-live-owner','Foreign.',null,stamp);f.mock.receive('whiteboard',f.canonical.documentId,3,foreign);await synchronize(f);assert.equal(await m.getDraft(f.canonical),undefined);assert.equal((await m.readNotebookDeletionStatus(f.noteId,f.scope)).version,2);
  const restored=edit(f.document,'Restored live.');f.mock.receive('whiteboard',f.canonical.documentId,4,restored);await synchronize(f);
  assert.equal(await m.readNotebookDeletionStatus(f.noteId,f.scope),undefined);const canonical=await m.getDraft(f.canonical);assert.equal(canonical.baseVersion,4);assert.equal(visible(canonical.content),'Restored live.');assert.equal(canonical.syncState,'synced');assert.equal(f.mock.calls.length,1);
  const histories=(await m.listSnapshots(f.scope.accountId,f.scope.spaceId)).filter(row=>row.key.startsWith(m.notebookDeletionKey(f.canonical)+'|history-'));assert.ok(histories.some(row=>row.value.version===2&&visible(row.value.source.content)==='Base.'));
 });
 await group('A numeric cached version without an explicit tombstone never means notebook deletion',async()=>{
  const f=await seed('version-only');await m.putSnapshot({key:`sync-version|${key(f.canonical)}`,accountId:f.scope.accountId,spaceId:f.scope.spaceId,value:42});
  assert.equal(await m.readNotebookDeletionStatus(f.noteId,f.scope),undefined);await m.normalizeNotebookIdentities(f.scope);assert.ok(await m.getDraft(f.canonical));await synchronize(f);assert.equal(f.mock.calls[0].base,0);assert.equal((await m.getDraft(f.canonical)).syncState,'synced');
 });
 await group('Explicit legacy ownership claims isolate a colliding board and reject incomplete or foreign scope',async()=>{
  const scope={accountId:'qa-identity-owner-claim',spaceId:'year'},a='é',b=m.noteBoardId(a).slice(5),boardId=m.noteBoardId(a);assert.equal(m.noteBoardId(b),boardId);
  const board={...scope,type:'whiteboard',documentId:boardId,title:'Legacy board',content:{board:{strokes:[{id:'original-ink',points:[{x:10,y:20},{x:30,y:40}]}]},photos:[]},baseVersion:0,updatedAt:1,syncState:'local'};await m.putDraft(board);
  for(const id of [a,b])await m.putDraft({...scope,type:'notesMarkdown',documentId:id,title:id,content:{id,markdown:id},baseVersion:0,updatedAt:1,syncState:'local'});
  assert.equal(await m.readOwnedLegacyNotebookBoard(a,scope,()=>true,[a,b]),undefined);
  const claim={key:`paper-legacy-owner|${scope.accountId}|${scope.spaceId}|whiteboard|${boardId}`,...scope,value:{schema:1,noteId:a,documentId:m.notebookDocumentId(a),boardId,claimedAt:stamp}};await m.putSnapshot(claim);
  assert.deepEqual((await m.readOwnedLegacyNotebookBoard(a,scope,()=>true,[a,b])).content,board.content);assert.equal(await m.readOwnedLegacyNotebookBoard(b,scope,()=>true,[a,b]),undefined);
  await m.putSnapshot({...claim,value:{...claim.value,documentId:'incomplete-reference'}});assert.equal(await m.readOwnedLegacyNotebookBoard(a,scope),undefined);
  await m.putSnapshot({...claim,accountId:'foreign-account'});assert.equal(await m.readOwnedLegacyNotebookBoard(a,scope),undefined);assert.deepEqual((await m.getDraft(board)).content,board.content);
 });
 await group('A real ApiClient in the media scope is never cloned into drafts or identity receipts',async()=>{
  const f=await seed('api-scope'),client=new m.ApiClient('https://not-called.invalid',async()=>{throw Error('No network permitted.');}),media={...f.scope,api:client};
  const canonical=await m.ensureNotebookIdentity(f.noteId,media);assert.equal(canonical.documentId,f.canonical.documentId);assert.equal(Object.hasOwn(canonical,'api'),false);
  await m.normalizeNotebookIdentities(media);const receipt=await m.getSnapshot(m.paperIdentityReceiptKey(media,f.source.documentId));assert.equal(Object.hasOwn(receipt.value.canonical,'api'),false);assert.equal(Object.hasOwn(receipt.value.source,'api'),false);assert.ok(!JSON.stringify(receipt.value).includes('not-called.invalid'));
 });
 console.log(`Identity sync integration: ${passed} groups passed; ${failures} failed.`);if(failures)process.exitCode=1;
}finally{await rm(out,{recursive:true,force:true});}
