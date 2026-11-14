import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB} from 'fake-indexeddb';
import {getDraft,putDraft,getSnapshot,putSnapshot,listSnapshots,listMutations,queueMutation,type Draft} from '../pwa/src/storage.ts';
import {noteMetadataTransportId,prepareNoteMetadataTransport,prepareNoteMetadataMutation,acknowledgeNoteMetadataTransport,receiveNoteMetadataTransport,noteMetadataDeleteTransportId,noteMetadataBindingKey,notebookMetadataSyncTransport} from '../src/lib/noteMetadataTransport.ts';
import {notebookDocumentId} from '../src/lib/notebookIdentity.ts';
import {emptySyncState,syncDocuments,type SyncDocument,type RemoteDocument} from '../src/lib/serverSync.ts';
globalThis.indexedDB=indexedDB;
const scope=(name:string)=>({accountId:'qa-meta-'+name,spaceId:'year-2026'}),yes=()=>true;
const document=(id:string,markdown='Original exact 🖋️')=>({type:'notesMarkdown' as const,id,content:{id,title:'Note importée',markdown,subjectIds:[],tags:[],createdAt:'2026-10-13T12:00:00Z',updatedAt:'2026-10-13T12:00:00Z'}});
const remote=(id:string,content:unknown,version=1)=>({document_type:'notesMarkdown' as const,document_id:id,content,version,deleted:false});
test('Safe IDs stay byte exact; Unicode/path/long/reserved IDs use separate bounded server aliases',()=>{
 for(const id of ['note-a','a.b_-','x'.repeat(127)])assert.equal(noteMetadataTransportId(id),id);
 const values=['é','e\u0301','学習','a/b','a|b','a..b','a%20b','a#b','x'.repeat(128),'x'.repeat(200),'\ud800','\ud801'];
 const ids=values.map(noteMetadataTransportId);assert.equal(new Set(ids).size,values.length);for(const id of ids){assert.match(id,/^[A-Za-z0-9][A-Za-z0-9._-]{0,126}$/);assert.equal(id.length,78);assert.ok(!id.includes('..'));}
 const literal=ids[0];assert.notEqual(noteMetadataTransportId(literal),literal);assert.notEqual(noteMetadataTransportId(literal),ids[0]);assert.throws(()=>noteMetadataTransportId(''),/identité/);assert.throws(()=>noteMetadataTransportId('x'.repeat(201)),/identité/);
});
test('Preparation keeps logical draft and outbox originals, rebases only the new transport and preserves its receipt',async()=>{
 const s=scope('prepare'),d=document('archivées/été|1'),draft:Draft={...s,type:'notesMarkdown',documentId:d.id,title:'Original',content:d.content,baseVersion:9,updatedAt:1,syncState:'queued'};
 await putDraft(draft);await queueMutation({...draft,id:'old-original-mutation',createdAt:1,status:'pending'});
 const oldOutbox=await listMutations(s.accountId,s.spaceId),prepared=await prepareNoteMetadataMutation(d,9,'old-original-mutation',s,yes);
 assert.equal(prepared.id,noteMetadataTransportId(d.id));assert.equal(prepared.baseVersion,0);assert.equal((prepared.content as any).note.id,d.id);assert.equal((prepared.content as any).graphId,notebookDocumentId(d.id));assert.deepEqual((await getDraft(draft))?.content,d.content);assert.equal((await getDraft(draft))?.documentId,d.id);assert.equal((await getDraft(draft))?.baseVersion,0);assert.deepEqual(await listMutations(s.accountId,s.spaceId),oldOutbox);
 const proof=(await listSnapshots(s.accountId,s.spaceId)).find(row=>(row.value as any).originalDraft);assert.deepEqual((proof?.value as any).originalDraft.content,draft.content);assert.equal((proof?.value as any).originalDraft.baseVersion,9);
 const again=await prepareNoteMetadataMutation(d,9,'old-original-mutation',s,yes);assert.deepEqual(again,prepared);
});
test('Acknowledged retry uses the same durable wire base and rejects reuse with another payload',async()=>{
 const s=scope('retry'),d=document('学習'),first=await prepareNoteMetadataMutation(d,7,'mutation',s,yes);await acknowledgeNoteMetadataTransport(d,1,s,yes);
 assert.equal((await prepareNoteMetadataMutation(d,7,'mutation',s,yes)).baseVersion,first.baseVersion);assert.equal(first.baseVersion,0);
 await assert.rejects(()=>prepareNoteMetadataMutation(document(d.id,'Changed'),7,'mutation',s,yes),/autre original/);
 const next=await prepareNoteMetadataMutation(document(d.id,'Changed'),1,'next',s,yes);assert.equal(next.baseVersion,1);
});
test('A valid full envelope returns exact logical content on a new device and confirms a scoped tombstone',async()=>{
 const s=scope('receive'),d=document('année/一|二'),wire=await prepareNoteMetadataTransport(d,s,yes),received=await receiveNoteMetadataTransport({...remote(wire.id,wire.content,3),space_id:s.spaceId},s,yes);
 assert.equal(received?.document_id,d.id);assert.deepEqual(received?.content,d.content);assert.equal((await getSnapshot(noteMetadataBindingKey(s,wire.id))?.then(row=>row?.value) as any).confirmedVersion,3);
 const tomb=await receiveNoteMetadataTransport({...remote(wire.id,null,4),deleted:true},s,yes);assert.equal(tomb?.document_id,d.id);assert.equal(await noteMetadataDeleteTransportId(d.id,s,yes),wire.id);
});
test('Live envelopes are refused for changed account/year/logical/graph/inner ID; every received original is retained',async()=>{
 const s=scope('invalid'),d=document('é'),wire=await prepareNoteMetadataTransport(d,s,yes),value=wire.content as any;
 const variants=[{...value,accountId:'another'},{...value,spaceId:'other-year'},{...value,logicalId:'another'},{...value,graphId:'wrong-graph'},{...value,note:{...value.note,id:'another'}},{...value,documentId:'wrong-wire'},{...value,logicalId:'x'.repeat(201)}];
 for(const content of variants)await assert.rejects(()=>receiveNoteMetadataTransport(remote(wire.id,content),s,yes),/alias reçu/);
 await assert.rejects(()=>receiveNoteMetadataTransport({...remote(wire.id,value),space_id:'other'},s,yes),/autre année/);
 const rows=await listSnapshots(s.accountId,s.spaceId);assert.equal(rows.filter(row=>(row.value as any).kind==='paper-metadata-transport-rejected').length,8);assert.equal((rows.find(row=>row.key===noteMetadataBindingKey(s,wire.id))!.value as any).confirmedVersion,0);assert.equal(await getDraft({...s,type:'notesMarkdown',documentId:d.id}),undefined);
});
test('A prepared or unknown alias cannot delete a guessed logical note or advance its sync cursor',async()=>{
 const s=scope('tomb'),d=document('🌿'),wire=await prepareNoteMetadataTransport(d,s,yes),tomb={...remote(wire.id,null,2),deleted:true} as RemoteDocument;
 await assert.rejects(()=>receiveNoteMetadataTransport(tomb,s,yes),/pas confirmé/);await assert.rejects(()=>noteMetadataDeleteTransportId(d.id,s,yes),/confirmation/);
 const other=scope('unknown');await assert.rejects(()=>receiveNoteMetadataTransport(tomb,other,yes),/quelle note/);
 const state=emptySyncState();state.cursor='before';const adapter=notebookMetadataSyncTransport({changes:async()=>({items:[tomb],has_more:false,next_cursor:'after'}),put:async()=>({version:1}),remove:async()=>({version:1})},other,yes);
 await assert.rejects(()=>syncDocuments({state,save:()=>{},documents:()=>[],apply:()=>true,transport:adapter,current:yes,id:()=>crypto.randomUUID()}),/quelle note/);assert.equal(state.cursor,'before');assert.equal(Object.keys(state.base).length,0);
});
test('Plain historical IDs in the alias namespace remain independent and cannot borrow another binding',async()=>{
 const s=scope('literal'),logical='é',alias=noteMetadataTransportId(logical),literal=document(alias),received=await receiveNoteMetadataTransport(remote(alias,literal.content,5),s,yes);assert.equal(received?.document_id,alias);
 const wire=await prepareNoteMetadataTransport(document(logical),s,yes);await assert.rejects(()=>receiveNoteMetadataTransport(remote(alias,literal.content,5),s,yes),/autre note/);
 assert.equal((await getSnapshot(noteMetadataBindingKey(s,wire.id))?.then(row=>row?.value) as any).confirmedVersion,0);
 const literalWire=await prepareNoteMetadataTransport(literal,scope('literal-own'),yes);assert.notEqual(literalWire.id,wire.id);assert.equal((literalWire.content as any).note.id,alias);
});
test('A confirmed replacement retains later old plain source revisions without regressing its version namespace',async()=>{
 const s=scope('retired'),id=noteMetadataTransportId('é'),d=document(id),wire=await prepareNoteMetadataTransport(d,s,yes);await acknowledgeNoteMetadataTransport(d,2,s,yes);
 assert.equal(await receiveNoteMetadataTransport(remote(id,d.content,50),s,yes),null);
 const rows=await listSnapshots(s.accountId,s.spaceId),retained=rows.find(row=>(row.value as any).kind==='paper-metadata-transport-retired');assert.deepEqual((retained?.value as any).incoming.content,d.content);assert.equal((await getSnapshot(noteMetadataBindingKey(s,wire.id))?.then(row=>row?.value) as any).confirmedVersion,2);
 assert.equal(await receiveNoteMetadataTransport({...remote(id,null,51),deleted:true},s,yes),null);
});
test('Explicit alias deletion survives stale live replay and blocks automatic resurrection; higher proven live version can restore it',async()=>{
 const s=scope('deleted-replay'),d=document('année|é'),wire=await prepareNoteMetadataTransport(d,s,yes);await receiveNoteMetadataTransport(remote(wire.id,wire.content,1),s,yes);
 const tomb=await receiveNoteMetadataTransport({...remote(wire.id,null,2),deleted:true},s,yes);assert.equal(tomb?.document_id,d.id);assert.equal(await receiveNoteMetadataTransport(remote(wire.id,wire.content,1),s,yes),null);
 await assert.rejects(()=>prepareNoteMetadataMutation(d,1,'new-after-deletion',s,yes),/supprimée sur le serveur/);
 const restored=await receiveNoteMetadataTransport(remote(wire.id,wire.content,3),s,yes);assert.equal(restored?.document_id,d.id);assert.equal((await prepareNoteMetadataMutation(d,3,'after-proved-restore',s,yes)).baseVersion,3);
 assert.equal(await receiveNoteMetadataTransport({...remote(wire.id,null,2),deleted:true},s,yes),null);
 const markers=await listSnapshots(s.accountId,s.spaceId);assert.ok(markers.some(row=>(row.value as any).kind==='paper-metadata-transport-deletion'));assert.ok(markers.some(row=>(row.value as any).kind==='paper-metadata-transport-deleted-source'));
});
test('Foreign or incompatible binding/source claims never replace local notes or original receipts',async()=>{
 const s=scope('collision'),d=document('é'),wire=noteMetadataTransportId(d.id),key=noteMetadataBindingKey(s,wire),foreign={key,accountId:'foreign',spaceId:s.spaceId,value:{schema:1,kind:'paper-metadata-transport',...s,logicalId:d.id,documentId:wire,graphId:notebookDocumentId(d.id),confirmedVersion:1}};await putSnapshot(foreign);
 await assert.rejects(()=>prepareNoteMetadataTransport(d,s,yes),/autre note/);assert.deepEqual(await getSnapshot(key),foreign);
 const s2=scope('source-mismatch');await putDraft({...s2,type:'notesMarkdown',documentId:d.id,title:'Foreign',content:{id:'different',markdown:'Do not overwrite'},baseVersion:9,updatedAt:1,syncState:'local'});await assert.rejects(()=>prepareNoteMetadataTransport(d,s2,yes),/original local/);assert.equal((await listSnapshots(s2.accountId,s2.spaceId)).length,0);
});
test('Revocation and concurrent binding creation abort atomically; transport/API objects are not persisted',async()=>{
 const s=scope('revoke'),d=document('é');await assert.rejects(()=>prepareNoteMetadataTransport(d,s,()=>false),/compte/);assert.deepEqual(await listSnapshots(s.accountId,s.spaceId),[]);
 let checks=0;await assert.rejects(()=>prepareNoteMetadataTransport(d,s,()=>++checks<4),/changé|connexion/);assert.deepEqual(await listSnapshots(s.accountId,s.spaceId),[]);
 const complete=await Promise.allSettled([prepareNoteMetadataTransport(d,s,yes),prepareNoteMetadataTransport(d,s,yes)]);assert.ok(complete.some(result=>result.status==='fulfilled'));await prepareNoteMetadataTransport(d,s,yes);
 const rich={...scope('no-api'),api:{secret:'NO-PERSIST',method:()=>{}},current:yes};await prepareNoteMetadataTransport(d,rich,yes);const json=JSON.stringify(await listSnapshots(rich.accountId,rich.spaceId));assert.ok(!json.includes('NO-PERSIST'));assert.ok(!json.includes('"api"'));
});
test('Native shared sync keeps logical baseline/conflict keys while only sending bounded alias paths',async()=>{
 const s=scope('native'),d:SyncDocument=document('année|été/2'),state=emptySyncState(),writes:any[]=[],deletions:any[]=[];let local:SyncDocument[]=[d],events:RemoteDocument[]=[];
 const adapter=notebookMetadataSyncTransport({changes:async()=>({items:events,has_more:false,next_cursor:'1'}),put:async(doc,base,mutation)=>{writes.push({doc,base,mutation});events=[remote(doc.id,doc.content,base+1) as RemoteDocument];return {version:base+1};},remove:async(type,id,version,mutation)=>{deletions.push({type,id,version,mutation});return {version:version+1};}},s,yes);
 const pass=()=>syncDocuments({state,save:()=>{},documents:()=>local,apply:()=>true,current:yes,id:()=>crypto.randomUUID(),transport:adapter});await pass();assert.equal(writes.length,1);assert.equal(writes[0].doc.id,noteMetadataTransportId(d.id));assert.equal(writes[0].doc.content.note.id,d.id);assert.deepEqual(state.base[`notesMarkdown|${d.id}`].content,d.content);assert.equal(Object.keys(state.pending).length,0);
 events=[];local=[];await pass();assert.equal(deletions.length,1);assert.equal(deletions[0].id,noteMetadataTransportId(d.id));assert.equal(state.base[`notesMarkdown|${d.id}`].content,null);
});
