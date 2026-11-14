/** Actual media helper/CRDT/IDB/client/Fetch reply reader. The inherited binary
 * ledger is synthetic; real HTTP/SQLite/file bytes are tested separately in
 * server/tests/test_notebook_original_media.py. No decoder or playback claim. */
import test from 'node:test';
import assert from 'node:assert/strict';
import './managed-notebook-media-compact.test.ts';
import {setup} from './managed-notebook-media.test.ts';
import {exact,sha} from './managed-notebook-application-fixture.ts';
import {MANAGED_NOTEBOOK_MEDIA_TYPES,managedNotebookMediaType} from '../pwa/src/managedNotebookMediaTypes.ts';
import {createManagedNotebookClient,type ManagedState} from '../pwa/src/managedNotebookClient.ts';
import {createManagedNotebookFetchPort,readManagedApiReply} from '../pwa/src/managedNotebookApiPort.ts';
import {applyPaperCommand,type PaperDocument} from '../src/lib/notebookDocument.ts';
import {amendPaperCollaboration,verifyPaperCollaboration} from '../src/lib/paperCollaboration.ts';

const accepted=['audio/wav','audio/webm;codecs=opus','audio/mp4; codecs="mp4a.40.2"','audio/ogg; codecs=opus','image/gif'];
const rejected=['audio/x-dowze-unsupported','image/x-dowze-unsupported','audio/webm;codecs=unknown','audio/mp4;codecs=avc1','audio/webm;codecs=opus;extra=1','text/html'];
test('Closed original-media contract accepts actual recorder types and keeps unknown MIME/parameters refused',async()=>{
 for(const value of [...MANAGED_NOTEBOOK_MEDIA_TYPES,...accepted])assert.equal(managedNotebookMediaType(value),true,value);
 for(const value of [...rejected,'audio/webm; codecs="opus','audio/webm;codecs=opus\n','audio/webm\r\nX-Escape:1',null,{},''])assert.equal(managedNotebookMediaType(value),false,String(value));
 const json=await readManagedApiReply(new Response('{}',{status:200,headers:{'content-type':'application/json; charset=utf-8'}}),2,()=>true);
 assert.equal(json.mediaType,'application/json','JSON response behavior remains unchanged');
 await assert.rejects(readManagedApiReply(new Response(new Uint8Array([1,2]),{status:200,headers:{'content-type':'audio/mp4','content-length':'2'}}),1,()=>true));
});

for(const mime of accepted)test('Original '+mime+' keeps exact bytes/type through durable upload and managed Fetch download',async t=>{
 const u=await setup(t),{asset,file}=await u.add(mime),before=await u.f.inventory();
 if(mime.startsWith('audio/')){
  const row=await u.canonical(),graph=row.content as PaperDocument,next=amendPaperCollaboration(graph,applyPaperCommand(graph,{type:'add-audio',audio:{id:'added-original-track',assetId:asset.id,name:'Original recorded audio',duration:1,startedAt:1}}));
  await u.f.write('drafts',{...row,content:next,syncState:'local'});
 }
 const result=await u.run();assert.equal(result.remainingChanges,false);assert.equal(result.uploadReceipts.length,1);const receipt=result.uploadReceipts[0],sent=u.requests[0];
 assert.equal(sent.type,mime);assert.equal(receipt.media_type,mime);assert.equal(receipt.sha256,file.sha256);assert.equal(sent.sha256,file.sha256);assert.equal(sent.size,file.blob.size);exact(new Uint8Array(sent.bytes),new Uint8Array(await file.blob.arrayBuffer()));
 const mapped=result.canonical.content as PaperDocument;verifyPaperCollaboration(mapped);assert.equal(mapped.assets.find(value=>value.id===asset.id)?.mediaType,mime);
 if(mime.startsWith('audio/'))assert.equal(mapped.audio.find(value=>value.id==='added-original-track')?.assetId,asset.id);
 const oldSession=u.f.port.capture(u.f.scope.accountId);let reads=0;
 const port=createManagedNotebookFetchPort({serverKey:u.state.serverKey,capture(actor){assert.equal(actor,u.f.scope.accountId);return {actorAccountId:actor,current:u.f.current,async send(request){
  if(request.path==='/v1/notebooks/capabilities'){
   const reply=await oldSession.json({kind:'capabilities',maximum:request.maximum});return {status:reply.status,body:new TextEncoder().encode(reply.body),mediaType:'application/json'};
  }
  assert.equal(request.method,'GET');assert.ok(request.path.startsWith('/v1/notebooks/'+receipt.resource_id+'/blobs/'+receipt.id+'?'));assert.equal(request.maximum,file.blob.size);reads++;
  return readManagedApiReply(new Response(new Uint8Array(sent.bytes),{status:200,headers:{'content-type':mime,'content-length':String(sent.size)}}),request.maximum,u.f.current);
 }};}});
 const client=createManagedNotebookClient({port,actorAccountId:u.f.scope.accountId,current:u.f.current,currentPort:()=>port}),state:ManagedState={...u.state,blobs:[{id:receipt.id,media_type:mime,size:receipt.size,sha256:receipt.sha256}]};
 const downloaded=await client.download(state,receipt.id);assert.equal(downloaded.type,mime);assert.equal(downloaded.size,file.blob.size);assert.equal(sha(new Uint8Array(await downloaded.arrayBuffer())),file.sha256);assert.equal(reads,1);
 const after=await u.f.inventory();for(const name of ['scopedBlobs','blobs','mutations'])exact(after[name],before[name],name+' originals remain exact');
 for(const row of before.snapshots)exact(after.snapshots.find(value=>value.key===row.key),row,'pre-existing history/foreign snapshot exact');
});
