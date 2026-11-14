/** Actual private flush/ApiClient/IDB and canonical amendment. HTTP replies are
 * an explicit synthetic seam; the paired Python tests exercise real routes.
 * The eleven original private-fence cases execute unchanged in this bundle. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {using} from './private-notebook-sync-integration.test.ts';
import {flushMutations} from '../pwa/src/sync.ts';
import * as storage from '../pwa/src/storage.ts';
import {applyPaperCommand,notebookDocumentId,type PaperDocument} from '../src/lib/notebookDocument.ts';
import {amendPaperCollaboration,verifyPaperCollaboration} from '../src/lib/paperCollaboration.ts';

const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const original=Uint8Array.from([0,255,79,71,71,0,128,10]);
async function seed(f:Parameters<Parameters<typeof using>[0]>[0],mime:string){
 const n=await f.seed('original-media',f.scope,'synced'),assetId='first-original-media';
 await f.wait(storage.putLocalBlob({...f.scope,id:assetId,documentId:n.graph.documentId,blob:new Blob([original],{type:mime}),name:'Original encoded media',createdAt:1,status:'pending'}),'immutable original seed');
 const before=n.graph.content as PaperDocument,asset={id:assetId,name:'Original encoded media',mediaType:mime,size:original.byteLength};
 let graph=applyPaperCommand(before,{type:'add-asset',asset});
 if(mime.startsWith('audio/'))graph=applyPaperCommand(graph,{type:'add-audio',audio:{id:'first-audio',assetId,name:'Original encoded media',duration:1,startedAt:1}});
 graph=amendPaperCollaboration(before,graph);
 const draft={...n.graph,content:graph,syncState:'queued' as const,updatedAt:2},mutation={...draft,id:'first-original-publication',createdAt:2,status:'pending' as const};
 await f.wait(storage.saveDraftAndQueue(draft,mutation,before),'actual original publication queue');
 return {...n,graph,assetId};
}
export {seed};

for(const mime of ['audio/wav','audio/webm;codecs=opus','audio/mp4; codecs="mp4a.40.2"','audio/ogg; codecs=opus','image/gif'])test('First private '+mime+' preserves MIME/bytes/SHA before canonical asset publication',()=>using(async f=>{
 const n=await seed(f,mime),before=await f.inventory();let uploads=0,published:PaperDocument|undefined;
 const r=f.api(undefined,async(path,init)=>{
  const headers=new Headers(init.headers);
  if(init.method==='POST'){
   assert.ok(path.endsWith('/blobs'));assert.ok(init.body instanceof Blob);
   assert.equal(init.body.type,mime);assert.equal(headers.get('Content-Type'),mime);assert.equal(headers.get('X-Content-SHA256'),sha(original));assert.equal(headers.get('X-Idempotency-Key'),n.assetId);
   assert.deepEqual(new Uint8Array(await init.body.arrayBuffer()),original);uploads++;
   return Response.json({id:'first-original-server-id',space_id:f.scope.spaceId,media_type:mime,size:original.byteLength,sha256:sha(original),created_at:'2026-10-16T12:00:00Z'},{status:201});
  }
  assert.equal(init.method,'PUT');assert.equal(uploads,1,'Original upload precedes its canonical reference');
  const packet=JSON.parse(String(init.body));published=packet.content as PaperDocument;
  verifyPaperCollaboration(published);const asset=published.assets.find(value=>value.id===n.assetId);
  assert.equal(asset?.serverId,'first-original-server-id');assert.equal(asset?.mediaType,mime);assert.equal(asset?.size,original.byteLength);
  return Response.json({version:2});
 });
 await f.wait(flushMutations(r.client,f.scope.accountId,f.scope.spaceId,()=>true),'actual first original flush');
 assert.equal(uploads,1);assert.ok(published);assert.equal(r.requests.filter(row=>row.method==='PUT').length,1);
 const stored=(await f.wait(storage.listLocalBlobs(f.scope.accountId,f.scope.spaceId),'original after ACK')).find(row=>row.id===n.assetId)!;
 assert.equal(stored.blob.type,mime);assert.deepEqual(new Uint8Array(await stored.blob.arrayBuffer()),original);assert.equal(stored.sha256,sha(original));assert.equal(stored.status,'uploaded');assert.equal(stored.serverId,'first-original-server-id');
 assert.equal((await f.wait(storage.listMutations(f.scope.accountId,f.scope.spaceId),'outbox after ACK')).length,0);
 const after=await f.inventory();for(const row of before.snapshots as storage.Snapshot[])assert.deepEqual((after.snapshots as storage.Snapshot[]).find(value=>value.key===row.key),row,'Existing snapshots remain exact');
 assert.deepEqual(after.scopedBlobs.filter(row=>row.accountId===f.other.accountId),before.scopedBlobs.filter(row=>row.accountId===f.other.accountId));
}));

test('A held original upload ACK cannot acknowledge after owner/API ABA or publish any canonical graph',()=>using(async f=>{
 await seed(f,'audio/webm;codecs=opus');const entered=f.gate(),held=f.gate();
 const r=f.api(undefined,async(_path,init)=>{assert.equal(init.method,'POST');entered.release();await held.promise;return Response.json({id:'late-original',space_id:f.scope.spaceId,media_type:'audio/webm;codecs=opus',size:original.byteLength,sha256:sha(original),created_at:'2026-10-16T12:00:00Z'},{status:201});});
 const pending=f.follow(flushMutations(r.client,f.scope.accountId,f.scope.spaceId,()=>true));await f.wait(entered.promise,'actual original POST entered');const before=await f.inventory();
 r.client.forgetSession();r.client.bindAccount(f.other.accountId);r.client.forgetSession();r.client.bindAccount(f.scope.accountId);held.release();
 await assert.rejects(()=>f.wait(pending,'revoked original upload'),error=>error instanceof Error&&!error.message.includes('Timeout'));
 assert.deepEqual(await f.inventory(),before);assert.equal(r.requests.filter(row=>row.method==='PUT').length,0);
}));

test('A lost ACK retries the new original MIME with the exact same key/bytes before any canonical publication',()=>using(async f=>{
 const n=await seed(f,'audio/webm;codecs=opus');let calls=0;const attempts:{key:string|null;mime:string|null;sha:string|null;bytes:Uint8Array}[]=[];
 const receipt={id:'replayed-first-original',space_id:f.scope.spaceId,media_type:'audio/webm;codecs=opus',size:original.byteLength,sha256:sha(original),created_at:'2026-10-16T12:00:00Z'};
 const r=f.api(undefined,async(_path,init)=>{if(init.method==='POST'){
  assert.ok(init.body instanceof Blob);const h=new Headers(init.headers);attempts.push({key:h.get('X-Idempotency-Key'),mime:h.get('Content-Type'),sha:h.get('X-Content-SHA256'),bytes:new Uint8Array(await init.body.arrayBuffer())});
  if(++calls===1)throw Error('Synthetic lost ACK after an explicitly simulated server commit');return Response.json(receipt,{status:201});
 }assert.equal(init.method,'PUT');assert.equal(calls,2);return Response.json({version:2});});
 const before=await f.inventory();
 await assert.rejects(()=>f.wait(flushMutations(r.client,f.scope.accountId,f.scope.spaceId,()=>true),'first original ACK loss'),/Synthetic lost ACK/);
 const failed=await f.inventory();for(const store of ['drafts','mutations','scopedBlobs'])assert.deepEqual(failed[store],before[store]);
 for(const row of before.snapshots as storage.Snapshot[])assert.deepEqual((failed.snapshots as storage.Snapshot[]).find(v=>v.key===row.key),row);
 const added=(failed.snapshots as storage.Snapshot[]).filter(v=>!(before.snapshots as storage.Snapshot[]).some(old=>old.key===v.key));assert.equal(added.length,2);
 const journal=added.find(row=>!row.key.endsWith('|original'))!.value as {phase:string;newKey:string};assert.equal(journal.phase,'prepared');assert.equal(journal.newKey,n.assetId);
 const history=added.find(row=>row.key.endsWith('|original'))!.value as {file:storage.LocalBlob;draft:storage.Draft};assert.equal(history.file.blob.type,receipt.media_type);assert.deepEqual(new Uint8Array(await history.file.blob.arrayBuffer()),original);assert.equal(history.draft.documentId,notebookDocumentId(n.noteId));
 assert.equal(r.requests.filter(row=>row.method==='PUT').length,0);
 await f.wait(flushMutations(r.client,f.scope.accountId,f.scope.spaceId,()=>true),'same original request retry');
 assert.equal(attempts.length,2);assert.deepEqual(attempts[1],attempts[0]);assert.equal(attempts[0].key,n.assetId);assert.equal(attempts[0].mime,receipt.media_type);assert.equal(attempts[0].sha,receipt.sha256);assert.deepEqual(attempts[0].bytes,original);
 assert.equal(r.requests.filter(row=>row.method==='PUT').length,1);
}));
