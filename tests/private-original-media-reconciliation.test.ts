/** Actual serial flush/ApiClient/IDB/Yjs. Explicit synthetic HTTP ledger;
 * the composed RPC/TestClient sidecar is a separate real-server qualification. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {using} from './private-notebook-sync-integration.test.ts';
import {seed} from './private-notebook-original-media.test.ts';
import {flushMutations} from '../pwa/src/sync.ts';
import * as storage from '../pwa/src/storage.ts';
import {notebookDocumentId,migratePaper,type PaperDocument} from '../src/lib/notebookDocument.ts';
import {amendPaperCollaboration,verifyPaperCollaboration} from '../src/lib/paperCollaboration.ts';
const mime='audio/webm;codecs=opus',oldMime='application/octet-stream',bytes=Uint8Array.from([0,255,79,71,71,0,128,10]),sha=createHash('sha256').update(bytes).digest('hex');
function receipts(scope:{spaceId:string}){return {old:{id:'legacy-original-server-id',space_id:scope.spaceId,media_type:oldMime,size:bytes.byteLength,sha256:sha,created_at:'2026-10-16T12:00:00Z'},replacement:{id:'reconciled-original-server-id',space_id:scope.spaceId,media_type:mime,size:bytes.byteLength,sha256:sha,created_at:'2026-10-16T13:00:00Z'}};}
function journal(rows:unknown[]){const row=(rows as storage.Snapshot[]).find(v=>v.key.startsWith('private-original-media-reconciliation|')&&!v.key.endsWith('|original'));assert.ok(row);return row.value as {phase:string;newKey:string;legacy?:{blobId:string;receipt?:unknown};receipt?:unknown;conflict?:{status:number;code:string;key:string}};}

test('Actual flush reconciles verified legacy422, journals one replacement key and retries its lost ACK exactly',()=>using(async f=>{
 const n=await seed(f,mime),before=await f.inventory(),{old,replacement}=receipts(f.scope),requests:{key:string;mime:string;sha:string;bytes:Uint8Array}[]=[];let oldPosts=0,oldGets=0,replacements=0,published:PaperDocument|undefined;
 const r=f.api(undefined,async(path,init)=>{
  if(init.method==='POST'){
   const h=new Headers(init.headers),key=h.get('X-Idempotency-Key')!,type=h.get('Content-Type')!;assert.ok(init.body instanceof Blob);const body=new Uint8Array(await init.body.arrayBuffer());requests.push({key,mime:type,sha:h.get('X-Content-SHA256')!,bytes:body});assert.deepEqual(body,bytes);
   const durable=journal((await f.inventory()).snapshots);
   if(key===n.assetId&&type===mime){assert.equal(durable.phase,'prepared');return Response.json({code:'idempotency_key_reused',message:'Exact legacy wire digest conflict'},{status:422});}
   if(key===n.assetId&&type===oldMime){oldPosts++;assert.equal(durable.phase,'legacy-replay-prepared');assert.deepEqual(durable.conflict,{status:422,code:'idempotency_key_reused',key:n.assetId});return Response.json(old,{status:201});}
   assert.notEqual(key,n.assetId);assert.equal(type,mime);assert.equal(durable.phase,'replacement-prepared');assert.equal(durable.newKey,key);assert.deepEqual(durable.legacy?.receipt,old);
   if(++replacements===1)throw Error('Synthetic lost replacement ACK after ledger commit');return Response.json(replacement,{status:201});
  }
  if((init.method??'GET')==='GET'){assert.equal(path,`/v1/spaces/${f.scope.spaceId}/blobs/${old.id}`);oldGets++;return new Response(bytes,{headers:{'Content-Type':oldMime,'X-Content-SHA256':sha}});}
  assert.equal(init.method,'PUT');published=JSON.parse(String(init.body)).content;return Response.json({version:2});
 });
 await assert.rejects(()=>f.wait(flushMutations(r.client,f.scope.accountId,f.scope.spaceId,()=>true),'replacement ACK loss'),/Synthetic lost replacement ACK/);
 const pending=await f.inventory(),prepared=journal(pending.snapshots);assert.equal(prepared.phase,'replacement-prepared');assert.notEqual(prepared.newKey,n.assetId);
 for(const store of ['drafts','mutations','scopedBlobs'])assert.deepEqual(pending[store],before[store]);assert.equal(r.requests.filter(row=>row.method==='PUT').length,0);
 await f.wait(flushMutations(r.client,f.scope.accountId,f.scope.spaceId,()=>true),'durable replacement retry and canonical publication');
 assert.equal(oldPosts,1);assert.equal(oldGets,1);assert.equal(replacements,2);assert.deepEqual(requests.at(-1),requests.at(-2));assert.equal(requests.at(-1)!.key,prepared.newKey);
 assert.equal(published?.assets.find(a=>a.id===n.assetId)?.serverId,replacement.id);assert.equal(published?.assets.find(a=>a.id===n.assetId)?.mediaType,mime);
 const after=await f.inventory(),applied=journal(after.snapshots);assert.equal(applied.phase,'applied');assert.equal(applied.newKey,prepared.newKey);assert.deepEqual(applied.receipt,replacement);assert.deepEqual(applied.legacy?.receipt,old);
 const history=(after.snapshots as storage.Snapshot[]).find(row=>row.key.startsWith('private-original-media-reconciliation|')&&row.key.endsWith('|original'))!.value as {file:storage.LocalBlob;draft:storage.Draft};
 assert.deepEqual(new Uint8Array(await history.file.blob.arrayBuffer()),bytes);assert.equal(history.file.blob.type,mime);assert.deepEqual(history.draft.content,n.graph);
 for(const row of before.snapshots as storage.Snapshot[])assert.deepEqual((after.snapshots as storage.Snapshot[]).find(v=>v.key===row.key),row);
 assert.deepEqual(after.scopedBlobs.filter(row=>row.accountId===f.other.accountId),before.scopedBlobs.filter(row=>row.accountId===f.other.accountId));
}));

test('An already-uploaded old serverId is proved by GET before one replacement; no old POST is invented',()=>using(async f=>{
 const n=await seed(f,mime),{old,replacement}=receipts(f.scope),file=(await f.wait(storage.listLocalBlobs(f.scope.accountId,f.scope.spaceId),'original uploaded source')).find(v=>v.id===n.assetId)!;
 assert.equal(await f.wait(storage.acknowledgeLocalBlob(file,old.id),'legacy durable ACK seed'),true);
 const oldGraph=amendPaperCollaboration(n.graph,{...n.graph,assets:n.graph.assets.map(a=>a.id===n.assetId?{...a,serverId:old.id}:a),blob_ids:[old.id]} as PaperDocument);
 const source=await f.wait(storage.getDraft({...f.scope,type:'whiteboard',documentId:notebookDocumentId(n.noteId)}),'owned source');
 assert.ok(source);await f.wait(storage.putDraft({...source,content:oldGraph}),'actual old server reference seed');
 const oldMutation=(await f.wait(storage.listMutations(f.scope.accountId,f.scope.spaceId),'old pending branch'))[0];await f.wait(storage.queueMutation({...oldMutation,content:oldGraph}),'retain actual old pending branch');
 let gets=0,posts=0,puts=0;const mappingAttempts:{key:string|null;raw:string}[]=[];
 const r=f.api(undefined,async(path,init)=>{if((init.method??'GET')==='GET'){assert.ok(path.endsWith('/'+old.id));gets++;return new Response(bytes,{headers:{'Content-Type':oldMime,'X-Content-SHA256':sha}});}
  if(init.method==='POST'){posts++;assert.equal(gets,1);const h=new Headers(init.headers);assert.equal(h.get('Content-Type'),mime);assert.notEqual(h.get('X-Idempotency-Key'),n.assetId);assert.equal(journal((await f.inventory()).snapshots).phase,'replacement-prepared');return Response.json(replacement,{status:201});}
  assert.equal(init.method,'PUT');puts++;const packet=JSON.parse(String(init.body)),graph=packet.content as PaperDocument;verifyPaperCollaboration(graph);
  if(puts===1){assert.equal(graph.assets.find(a=>a.id===n.assetId)?.serverId,old.id);assert.equal(packet.base_version,1);return Response.json({version:2});}
  assert.equal(graph.assets.find(a=>a.id===n.assetId)?.serverId,replacement.id);assert.equal(packet.base_version,2);mappingAttempts.push({key:new Headers(init.headers).get('X-Idempotency-Key'),raw:String(init.body)});if(puts===2)throw Error('Synthetic lost prepared mapping ACK');return Response.json({version:3});});
 await assert.rejects(()=>f.wait(flushMutations(r.client,f.scope.accountId,f.scope.spaceId,()=>true),'uploaded original mapping ACK loss'),/Synthetic lost prepared mapping ACK/);
 await f.wait(flushMutations(r.client,f.scope.accountId,f.scope.spaceId,()=>true),'uploaded original exact prepared mapping retry');assert.equal(gets,1);assert.equal(posts,1);assert.equal(puts,3);assert.deepEqual(mappingAttempts[1],mappingAttempts[0]);
 const audit=journal((await f.inventory()).snapshots);assert.equal(audit.phase,'applied');assert.equal(audit.legacy?.blobId,old.id);assert.equal(audit.legacy?.receipt,undefined,'GET observation is not forged into an old POST receipt');
}));

test('A false legacy receipt cannot become an observed original or a replacement request',()=>using(async f=>{
 const n=await seed(f,mime),{old}=receipts(f.scope),before=await f.inventory();let posts=0;const attempts:{path:string;key:string|null;mime:string|null}[]=[];
 const r=f.api(undefined,async(path,init)=>{assert.equal(init.method,'POST');posts++;const h=new Headers(init.headers);attempts.push({path,key:h.get('X-Idempotency-Key'),mime:h.get('Content-Type')});if(h.get('Content-Type')===mime)return Response.json({code:'idempotency_key_reused'},{status:422});return Response.json({...old,sha256:'0'.repeat(64)},{status:201});});
 await assert.rejects(()=>f.wait(flushMutations(r.client,f.scope.accountId,f.scope.spaceId,()=>true),'invalid old receipt'),error=>error instanceof Error&&!error.message.includes('Timeout'));
 const after=await f.inventory();assert.equal(posts,2);assert.equal(journal(after.snapshots).phase,'legacy-replay-prepared');for(const store of ['drafts','mutations','scopedBlobs'])assert.deepEqual(after[store],before[store]);
 assert.deepEqual(r.requests.filter(row=>row.method==='GET').map(row=>row.path),['/v1/csrf'],'Only the mandatory cookie-scoped CSRF readiness GET is admitted; no blob GET');
 assert.equal(r.requests.filter(row=>row.method==='PUT').length,0,'No canonical publication follows a false legacy receipt');
 const path=`/v1/spaces/${f.scope.spaceId}/blobs`;assert.deepEqual(attempts,[{path,key:n.assetId,mime},{path,key:n.assetId,mime:oldMime}],'Only original-MIME conflict and exact old-key octet replay; no replacement POST');
}));

test('Quota seam after actual replacement-prepared put aborts before binary send and preserves the previous audit',()=>using(async f=>{
 const n=await seed(f,mime),{old}=receipts(f.scope);let quota=0,replacementPosts=0;
 f.setOnTx(tx=>{if(tx.mode!=='readwrite'||!tx.objectStoreNames.contains('snapshots'))return;const store=tx.objectStore('snapshots'),native=store.put.bind(store);store.put=((...args:Parameters<IDBObjectStore['put']>)=>{const request=native(...args),row=args[0] as storage.Snapshot;if((row.value as {phase?:string})?.phase==='replacement-prepared')request.addEventListener('success',()=>{quota++;tx.abort();},{once:true});return request;}) as IDBObjectStore['put'];});
 const r=f.api(undefined,async(_path,init)=>{if((init.method??'GET')==='GET')return new Response(bytes,{headers:{'Content-Type':oldMime,'X-Content-SHA256':sha}});assert.equal(init.method,'POST');const h=new Headers(init.headers);if(h.get('X-Idempotency-Key')!==n.assetId){replacementPosts++;throw Error('Forbidden replacement before durable preparation');}if(h.get('Content-Type')===mime)return Response.json({code:'idempotency_key_reused'},{status:422});return Response.json(old,{status:201});});
 const before=await f.inventory();await assert.rejects(()=>f.wait(flushMutations(r.client,f.scope.accountId,f.scope.spaceId,()=>true),'actual prepare rollback'),error=>error instanceof Error&&!error.message.includes('Timeout'));f.setOnTx(undefined);
 const after=await f.inventory();assert.equal(quota,1);assert.equal(replacementPosts,0);assert.equal(journal(after.snapshots).phase,'legacy-verified');assert.equal(journal(after.snapshots).newKey,n.assetId);for(const store of ['drafts','mutations','scopedBlobs'])assert.deepEqual(after[store],before[store]);
}));

test('A new canonical lineage under the same note/file identity cannot receive an old held upload ACK',()=>using(async f=>{
 const n=await seed(f,mime),entered=f.gate(),held=f.gate(),{replacement}=receipts(f.scope);
 const r=f.api(undefined,async(_path,init)=>{assert.equal(init.method,'POST');entered.release();await held.promise;return Response.json(replacement,{status:201});});
 const pending=f.follow(flushMutations(r.client,f.scope.accountId,f.scope.spaceId,()=>true));await f.wait(entered.promise,'actual upload before lineage replacement');
 const source=await f.wait(storage.getDraft({...f.scope,type:'whiteboard',documentId:notebookDocumentId(n.noteId)}),'exact old lineage source');assert.ok(source);
 const fresh=migratePaper(n.noteId,'Independent newer lineage',null,'2026-10-16T18:00:00Z'),changed=amendPaperCollaboration(fresh,{...fresh,assets:n.graph.assets,audio:n.graph.audio});assert.notEqual(changed.collaboration!.lineage,n.graph.collaboration!.lineage);
 await f.wait(storage.putDraft({...source,content:changed,updatedAt:source.updatedAt+1}),'actual replacement lineage');const before=await f.inventory();held.release();
 await assert.rejects(()=>f.wait(pending,'old lineage ACK refused'),error=>error instanceof Error&&!error.message.includes('Timeout'));assert.deepEqual(await f.inventory(),before);assert.equal(journal(before.snapshots).phase,'prepared');assert.equal(r.requests.filter(row=>row.method==='PUT').length,0);
}));
