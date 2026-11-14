/** Desired regression, NOT RUN. Register after the existing 16 real groups.
 * Uses the real ApiClient serialization, uploader, Yjs amendment and storage.
 * The injected fetch transport captures bytes and simulates one lost response;
 * it never substitutes the graph resolver or any durable storage operation. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const ASSET_LOST_ACK_GROUP='Actual uploaded asset lost ACK retries the exact durable id/base/wire body across fresh API clients';
const sha=value=>createHash('sha256').update(value).digest('hex');
export async function runPaperOpeningAssetLostAckCase({group,m,seed,inventory}){
 await group(ASSET_LOST_ACK_GROUP,async()=>{
  assert.equal(typeof m.ApiClient,'function','Entry must export the real production ApiClient');
  const f=await seed('asset-lost-ack'),source=await m.getDraft(f.identity),file=(await m.listLocalBlobs(f.owner.accountId,f.owner.spaceId))[0];
  assert.ok(file&&source.content.assets.length===1,'A real copied local asset is required');
  assert.equal(source.content.assets[0].serverId,undefined,'The durable graph has not yet consumed the upload ACK');
  await m.putLocalBlob({...file,status:'uploaded',serverId:'server-original-lost-ack'});
  const filter=(type,id)=>type==='whiteboard'&&id===f.identity.documentId;
  await m.queueLocalDrafts(f.owner.accountId,f.owner.spaceId,filter);
  const queue=await m.listMutations(f.owner.accountId,f.owner.spaceId),queuedDraft=await m.getDraft(f.identity),before=await inventory(f.owner);
  assert.equal(queue.length,1,'Exactly one real durable canonical mutation is admitted');
  assert.equal(queue[0].content.assets[0].serverId,undefined,'The outbox must still hold the original local graph');
  m.verifyPaperCollaboration(queue[0].content);
  const puts=[],effective=new Map();let lost=true;
  const fetcher=async(input,init={})=>{
   const url=new URL(String(input),'https://synthetic.invalid'),method=init.method??'GET';
   if(url.pathname==='/v1/csrf'&&method==='GET')return Response.json({csrf_token:'synthetic-asset-lost-ack-csrf'});
   assert.equal(method,'PUT','No blob upload or manual queue bypass is permitted after its real prior upload ACK');
   assert.equal(url.pathname,`/v1/spaces/${f.owner.spaceId}/documents/whiteboard/${f.identity.documentId}`);
   assert.equal(typeof init.body,'string','Capture the actual JSON bytes emitted by ApiClient.putDocument');
   const headers=new Headers(init.headers),body=init.body,payload=JSON.parse(body),id=headers.get('X-Idempotency-Key');
   assert.equal(headers.get('X-Dowze-Account'),f.owner.accountId);assert.ok(headers.get('X-CSRF-Token'));
   m.verifyPaperCollaboration(payload.content);
   const capture={method,path:url.pathname,id,baseVersion:payload.base_version,body,bodySha256:sha(body),content:payload.content};puts.push(capture);
   assert.equal(id,queue[0].id,'Both requests must originate from the original durable mutation');
   assert.equal(payload.content.assets[0].serverId,'server-original-lost-ack');assert.deepEqual(payload.content.blob_ids,['server-original-lost-ack']);
   if(!effective.has(id))effective.set(id,{space_id:f.owner.spaceId,document_type:'whiteboard',document_id:f.identity.documentId,version:payload.base_version+1,content:structuredClone(payload.content),deleted:false,changed_at:'2026-10-15T12:00:00.000Z'});
   if(lost){lost=false;throw new TypeError('Synthetic response lost after the first actual serialized asset PUT');}
   // A cached reply never repairs or normalises the retry request. The exact
   // request equality below remains a required assertion even if storage ACKs.
   return Response.json(effective.get(id));
  };
  const firstApi=new m.ApiClient('',fetcher,filter);
  await assert.rejects(m.flushMutations(firstApi,f.owner.accountId,f.owner.spaceId,()=>true),error=>error instanceof TypeError&&error.message.includes('response lost'));
  assert.equal(puts.length,1,'The real uploader must have reached its first PUT');assert.equal(effective.size,1);
  const retainedQueue=await m.listMutations(f.owner.accountId,f.owner.spaceId);assert.equal(retainedQueue.length,1);
  const {paperPrepared,...historical}=retainedQueue[0];assert.deepEqual(historical,queue[0],'Lost response must preserve every original outbox payload/id/base/metadata field');
  assert.ok(paperPrepared,'The resolved body must have been durably prepared before PUT');assert.deepEqual(Object.keys(paperPrepared).sort(),['content','draft','schema','sourceSha256']);assert.equal(paperPrepared.schema,1);assert.equal(paperPrepared.sourceSha256,sha(JSON.stringify(queue[0])));assert.deepEqual(paperPrepared.content,puts[0].content,'The unique prepared body is the exact first serialized graph including Yjs');assert.deepEqual(paperPrepared.draft,{title:queuedDraft.title,updatedAt:queuedDraft.updatedAt},'Only the exact observed draft header may accompany preparation');
  assert.deepEqual(await m.getDraft(f.identity),queuedDraft,'No canonical ACK may be fabricated after the lost response');
  assert.deepEqual((await inventory(f.owner)).files,before.files,'No second upload or byte/property rewrite is permitted');await f.foreignExact();
  // A fresh ApiClient has no carried CSRF/session state. The production module's
  // rejected serial promise is recovered through its ordinary next invocation.
  const restartedApi=new m.ApiClient('',fetcher,filter);
  await m.flushMutations(restartedApi,f.owner.accountId,f.owner.spaceId,()=>true);
  assert.equal(puts.length,2,'Exactly one ordinary retry must reach the transport');
  assert.deepEqual({method:puts[1].method,path:puts[1].path,id:puts[1].id,baseVersion:puts[1].baseVersion},{method:puts[0].method,path:puts[0].path,id:puts[0].id,baseVersion:puts[0].baseVersion},'The retry method/path/id/base must be exact');
  if(puts[1].body!==puts[0].body)assert.fail('Actual asset retry wire body differs: firstSHA='+puts[0].bodySha256+' retrySHA='+puts[1].bodySha256+' firstCollaborationSHA='+sha(puts[0].content.collaboration.state)+' retryCollaborationSHA='+sha(puts[1].content.collaboration.state));
  assert.equal(puts[1].bodySha256,puts[0].bodySha256,'Exact wire bytes require the exact SHA-256');
  assert.equal(effective.size,1,'The original key has exactly one effective commit');assert.equal((await m.listMutations(f.owner.accountId,f.owner.spaceId)).length,0);
  const saved=await m.getDraft(f.identity);assert.equal(saved.baseVersion,queue[0].baseVersion+1);assert.equal(saved.syncState,'synced');assert.deepEqual(saved.content,effective.get(queue[0].id).content,'Durable graph must match the first effective HTTP body including its exact Yjs state');m.verifyPaperCollaboration(saved.content);
  const after=await inventory(f.owner);assert.deepEqual(after.files,before.files);assert.deepEqual(after.snapshots,before.snapshots);await f.foreignExact();
 });
}
