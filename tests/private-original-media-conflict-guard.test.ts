/** Conflict stays a separate explicit resolution, never a MIME repair effect. */
import './private-original-media-current-guard.test.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {using} from './private-notebook-sync-integration.test.ts';
import {seed} from './private-notebook-original-media.test.ts';
import {flushMutations} from '../pwa/src/sync.ts';
import * as storage from '../pwa/src/storage.ts';
import {notebookDocumentId,type PaperDocument} from '../src/lib/notebookDocument.ts';
import {amendPaperCollaboration} from '../src/lib/paperCollaboration.ts';
const mime='audio/webm;codecs=opus',oldMime='application/octet-stream';

test('A real canonical conflict refuses MIME reconciliation before HTTP or any local journal change',()=>using(async f=>{
 await seed(f,mime);const branch=(await f.wait(storage.listMutations(f.scope.accountId,f.scope.spaceId),'original pending branch'))[0];
 assert.equal(await f.wait(storage.markMutationConflict(branch,2,'Synthetic actual conflict',()=>true),'actual markMutationConflict'),true);
 const before=await f.inventory(),r=f.api(undefined,async()=>{throw Error('No HTTP allowed for a conflicted source');});
 await assert.rejects(()=>f.wait(flushMutations(r.client,f.scope.accountId,f.scope.spaceId,()=>true),'initial conflict refusal'),error=>error instanceof Error&&!error.message.includes('Timeout'));
 assert.deepEqual(await f.inventory(),before);assert.equal(r.requests.length,0);
}));

test('A real conflict committed while replacement ACK is held preserves the exact conflict/draft/outbox/audit',()=>using(async f=>{
 const n=await seed(f,mime),local=(await f.wait(storage.listLocalBlobs(f.scope.accountId,f.scope.spaceId),'exact local original')).find(row=>row.id===n.assetId)!;
 const bytes=new Uint8Array(await local.blob.arrayBuffer()),sha=createHash('sha256').update(bytes).digest('hex'),oldId='old-octet-original';
 assert.equal(await f.wait(storage.acknowledgeLocalBlob(local,oldId),'legacy uploaded source seed'),true);
 const graph=amendPaperCollaboration(n.graph,{...n.graph,assets:n.graph.assets.map(a=>a.id===n.assetId?{...a,serverId:oldId}:a),blob_ids:[oldId]} as PaperDocument),source=await f.wait(storage.getDraft({...f.scope,type:'whiteboard',documentId:notebookDocumentId(n.noteId)}),'exact source before repair');assert.ok(source);
 await f.wait(storage.putDraft({...source,content:graph}),'legacy graph source seed');const initial=(await f.wait(storage.listMutations(f.scope.accountId,f.scope.spaceId),'exact original outbox'))[0];await f.wait(storage.queueMutation({...initial,content:graph}),'exact legacy branch seed');
 const entered=f.gate(),held=f.gate();let gets=0,posts=0;
 const r=f.api(undefined,async(path,init)=>{if((init.method??'GET')==='GET'){assert.ok(path.endsWith('/'+oldId));gets++;return new Response(bytes,{headers:{'Content-Type':oldMime,'X-Content-SHA256':sha}});}
  assert.equal(init.method,'POST');assert.equal(new Headers(init.headers).get('Content-Type'),mime);posts++;entered.release();await held.promise;
  return Response.json({id:'replacement-before-conflict',space_id:f.scope.spaceId,media_type:mime,size:bytes.length,sha256:sha,created_at:'2026-10-16T13:00:00Z'},{status:201});});
 const pending=f.follow(flushMutations(r.client,f.scope.accountId,f.scope.spaceId,()=>true));await f.wait(entered.promise,'actual replacement POST entered');
 const branch=(await f.wait(storage.listMutations(f.scope.accountId,f.scope.spaceId),'live exact branch before conflict'))[0];assert.equal(await f.wait(storage.markMutationConflict(branch,2,'Synthetic conflict during actual held ACK',()=>true),'real late conflict'),true);
 const before=await f.inventory();held.release();
 await assert.rejects(()=>f.wait(pending,'late conflict ACK refusal'),error=>error instanceof Error&&!error.message.includes('Timeout'));
 assert.deepEqual(await f.inventory(),before);assert.equal(gets,1);assert.equal(posts,1);assert.equal(r.requests.filter(row=>row.method==='PUT').length,0);
 const row=(before.snapshots as storage.Snapshot[]).find(row=>row.key.startsWith('private-original-media-reconciliation|')&&!row.key.endsWith('|original'))!;assert.equal((row.value as {phase:string}).phase,'replacement-prepared');
 const drafts=before.drafts as storage.Draft[],mutations=before.mutations as storage.Mutation[];assert.equal(drafts.find(row=>row.documentId===notebookDocumentId(n.noteId)&&row.accountId===f.scope.accountId)?.syncState,'conflict');assert.equal(mutations.find(row=>row.id===branch.id)?.status,'conflict');
}));
