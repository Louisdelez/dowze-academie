/** Real production preparation/ACK/ApiClient on actual fake-indexeddb TXs.
 * Injected fetch is an explicit private HTTP oracle, never native-server proof. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const PAPER_PREPARED_GROUPS=[
 'Prepared write quota reaches native rollback before any PUT and a fresh retry remains possible',
 'Exact preparation CAS preserves a newer replacement under the same mutation id',
 'Owner epoch ABA inside native preparation prevents all writes and transport',
 'Real ApiClient epoch ABA defeats a reversible owner predicate before preparation publication',
 'API retirement after prepared native commit retains the frozen source without dispatching PUT',
 'Historical prepared ACK preserves a newer canonical text edit exactly',
 'Historical prepared ACK preserves a newer title-only edit with the same raw graph',
 'ACK whole-row CAS preserves a replacement mutation instead of deleting its reused id',
 'Paper tombstone alias conflict and lineage retirement preserve pending originals without PUT',
 'Prepared source fingerprint refuses transfer to another mutation identity or account scope',
 'A new queued save refuses prepared reuse and a duplicate pending UUID atomically',
 'ACK quota after a real canonical write rolls back draft and prepared outbox together'
];
const sha=value=>createHash('sha256').update(JSON.stringify(value)??'undefined').digest('hex');
const key=row=>`${row.accountId}|${row.spaceId}|${row.type}|${row.documentId}`;
export async function runPaperPreparedMutationCases({group,m,seed,inventory,tracked,bounded,drainOperations,currentSeams}){
 async function fixture(label){
  const f=await seed('prepared-'+label),file=(await m.listLocalBlobs(f.owner.accountId,f.owner.spaceId))[0];await m.putLocalBlob({...file,status:'uploaded',serverId:'server-prepared-original'});
  f.filter=(type,id)=>type==='whiteboard'&&id===f.identity.documentId;await m.queueLocalDrafts(f.owner.accountId,f.owner.spaceId,f.filter);f.raw=(await m.listMutations(f.owner.accountId,f.owner.spaceId))[0];f.queued=await m.getDraft(f.identity);f.before=await inventory(f.owner);
  const resolved=m.resolvePaperAssets(f.raw.content,await m.listLocalBlobs(f.owner.accountId,f.owner.spaceId));f.content=m.amendPaperCollaboration(f.raw.content,resolved);m.verifyPaperCollaboration(f.content);return f;
 }
 function transport(f,onPut){
  const puts=[],requests=[],effects=new Map();
  const fetcher=async(input,init={})=>{
   const path=new URL(String(input),'https://synthetic.invalid').pathname,method=init.method??'GET';requests.push({path,method});
   if(path==='/v1/csrf'&&method==='GET')return Response.json({csrf_token:'synthetic-prepared-csrf'});
   assert.equal(method,'PUT');assert.equal(path,`/v1/spaces/${f.owner.spaceId}/documents/whiteboard/${f.identity.documentId}`);assert.equal(typeof init.body,'string');
   const payload=JSON.parse(init.body),headers=new Headers(init.headers),id=headers.get('X-Idempotency-Key');assert.equal(headers.get('X-Dowze-Account'),f.owner.accountId);const call={id,body:init.body,payload,path};puts.push(call);
   if(!effects.has(id))effects.set(id,{space_id:f.owner.spaceId,document_type:'whiteboard',document_id:f.identity.documentId,version:payload.base_version+1,content:structuredClone(payload.content),deleted:false,changed_at:'2026-10-15T12:00:00.000Z'});
   else if(JSON.stringify(effects.get(id).content)!==JSON.stringify(payload.content))assert.fail('Prepared retry body changed: '+sha(effects.get(id).content)+' versus '+sha(payload.content));
   await onPut?.(call,puts.length);return Response.json(effects.get(id));
  };
  return {puts,requests,effects,api:()=>new m.ApiClient('',fetcher,f.filter)};
 }
 function seam(f,{beforePrepare,onPrepareCreated,onPrepareComplete,quotaPrepare=false,quotaAck=false}={}){
  const nativeOpen=f.factory.open.bind(f.factory),events=[],errors=[],terminals=[];let prepared=0,acks=0,seq=0,prior=false,quotaFired=false,writes=0;
  currentSeams().push({errors});
  const mark=row=>events.push({seq:++seq,...row});
  f.factory.open=(...args)=>{const req=nativeOpen(...args);req.addEventListener('success',()=>{
   const db=req.result,nativeTx=db.transaction.bind(db);
   db.transaction=(...args)=>{
    const names=typeof args[0]==='string'?[args[0]]:Array.from(args[0]),isPrepare=args[1]==='readwrite'&&names.length===4&&['drafts','mutations','snapshots','scopedBlobs'].every(name=>names.includes(name)),isAck=args[1]==='readwrite'&&names.length===3&&['drafts','mutations','snapshots'].every(name=>names.includes(name));
    if(isPrepare&&beforePrepare&&!prior){
     prior=true;const tx=nativeTx(['drafts','mutations','snapshots'],'readwrite'),outbox=tx.objectStore('mutations'),read=outbox.get(f.raw.id);
     read.onsuccess=()=>{try{beforePrepare({tx,outbox,row:read.result});}catch(error){errors.push(error);tx.abort();}};
     terminals.push(tracked(new Promise(resolve=>{tx.addEventListener('complete',()=>{mark({kind:'prior-complete'});resolve();},{once:true});tx.addEventListener('abort',()=>{errors.push(tx.error??Error('Preceding native transaction aborted'));resolve();},{once:true});}),'Real preceding preparation transaction'));
    }
    const tx=nativeTx(...args),phase=isPrepare?'prepare':isAck?'ack':null,id=isPrepare?++prepared:isAck?++acks:undefined;if(phase)mark({kind:'created',phase,id});if(isPrepare)onPrepareCreated?.(id);
    terminals.push(tracked(new Promise(resolve=>{tx.addEventListener('complete',()=>{if(phase)mark({kind:'complete',phase,id});if(isPrepare)onPrepareComplete?.(id);resolve();},{once:true});tx.addEventListener('abort',()=>{if(phase)mark({kind:'abort',phase,id});resolve();},{once:true});}),'Real '+tx.mode+' preparation/ACK transaction '+names.join(',')));
    const nativeStore=tx.objectStore.bind(tx),seen=new WeakSet();tx.objectStore=name=>{
     const store=nativeStore(name);if(seen.has(store))return store;seen.add(store);
     if(!quotaFired&&(isPrepare&&quotaPrepare&&name==='mutations'||isAck&&quotaAck&&name==='drafts')){
      const put=store.put.bind(store);store.put=(value,...args)=>{const write=put(value,...args);write.addEventListener('success',()=>{if(!quotaFired){quotaFired=true;writes++;mark({kind:'successful-write-before-quota',phase,id});throw new DOMException('Synthetic quota after actual '+phase+' write','QuotaExceededError');}},{once:true});return write;};
     }return store;
    };return tx;
   };
  },{once:true});return req;};
  return {events,errors,get prepared(){return prepared;},get acks(){return acks;},get successfulWrites(){return writes;},restore:()=>{f.factory.open=nativeOpen;},settled:()=>bounded(Promise.all(terminals),'All actual prepared/ACK transactions must reach a native terminal')};
 }
 async function assertPrepared(f,row,expectedContent){
  assert.ok(row);const {paperPrepared,...original}=row;assert.deepEqual(original,f.raw,'Every original payload/id/base/metadata field remains exact');assert.ok(paperPrepared);assert.deepEqual(Object.keys(paperPrepared).sort(),['content','draft','schema','sourceSha256']);assert.equal(paperPrepared.schema,1);assert.equal(paperPrepared.sourceSha256,sha(f.raw));if(expectedContent)assert.deepEqual(paperPrepared.content,expectedContent);assert.deepEqual(paperPrepared.draft,{title:f.queued.title,updatedAt:f.queued.updatedAt});m.verifyPaperCollaboration(paperPrepared.content);return paperPrepared;
 }
 async function originals(f){const after=await inventory(f.owner);assert.deepEqual(after.files,f.before.files);assert.deepEqual(after.snapshots,f.before.snapshots);await f.foreignExact();}
 await group(PAPER_PREPARED_GROUPS[0],async()=>{
  const f=await fixture('quota'),http=transport(f),native=seam(f,{quotaPrepare:true});try{
   await assert.rejects(bounded(m.flushMutations(http.api(),f.owner.accountId,f.owner.spaceId,()=>true),'Prepare quota before network'));await native.settled();assert.equal(native.successfulWrites,1);assert.equal(native.prepared,1);assert.ok(native.events.some(row=>row.kind==='abort'&&row.phase==='prepare'));assert.equal(http.puts.length,0);assert.deepEqual(await inventory(f.owner),f.before,'The native rollback retains the whole raw original without prepared state');
   await m.flushMutations(http.api(),f.owner.accountId,f.owner.spaceId,()=>true);assert.equal(http.puts.length,1,'Only a new invocation may prepare again after an unsent rollback');assert.equal((await m.listMutations(f.owner.accountId,f.owner.spaceId)).length,0);await originals(f);
  }finally{await drainOperations('Prepared originals and terminals before native restore',{excludeGroups:true});native.restore();}
 });
 await group(PAPER_PREPARED_GROUPS[1],async()=>{
  const f=await fixture('replace-before'),http=transport(f);let replacement;const native=seam(f,{beforePrepare:({outbox,row})=>{replacement={...row,createdAt:row.createdAt+1,content:m.amendPaperCollaboration(row.content,m.applyPaperCommand(row.content,{type:'patch-object',id:row.content.objects[0].id,patch:{markdown:'Newer queued source under the same id'}}))};outbox.put(replacement);}});try{
   await assert.rejects(m.flushMutations(http.api(),f.owner.accountId,f.owner.spaceId,()=>true));await native.settled();assert.deepEqual(native.errors,[]);assert.equal(native.prepared,1);assert.equal(http.puts.length,0);assert.deepEqual((await m.listMutations(f.owner.accountId,f.owner.spaceId))[0],replacement);assert.deepEqual(await m.getDraft(f.identity),f.queued);await originals(f);
  }finally{await drainOperations('Prepared originals and terminals before native restore',{excludeGroups:true});native.restore();}
 });
 await group(PAPER_PREPARED_GROUPS[2],async()=>{
  const f=await fixture('owner-aba'),http=transport(f);let epoch=1;const native=seam(f,{onPrepareCreated:()=>{epoch=2;epoch=3;}});try{await assert.rejects(m.flushMutations(http.api(),f.owner.accountId,f.owner.spaceId,()=>epoch===1));await native.settled();assert.equal(http.requests.length,0);assert.deepEqual(await inventory(f.owner),f.before);await f.foreignExact();}finally{await drainOperations('Prepared originals and terminals before native restore',{excludeGroups:true});native.restore();}
 });
 await group(PAPER_PREPARED_GROUPS[3],async()=>{
  const f=await fixture('api-aba'),http=transport(f),api=http.api();const native=seam(f,{onPrepareCreated:()=>{api.forgetSession();api.bindAccount(f.foreign.accountId);api.forgetSession();api.bindAccount(f.owner.accountId);}});try{await assert.rejects(m.flushMutations(api,f.owner.accountId,f.owner.spaceId,()=>true));await native.settled();assert.equal(http.requests.length,0,'The API epoch must defeat a scope predicate which is true again');assert.deepEqual(await inventory(f.owner),f.before);await f.foreignExact();}finally{await drainOperations('Prepared originals and terminals before native restore',{excludeGroups:true});native.restore();}
 });
 await group(PAPER_PREPARED_GROUPS[4],async()=>{
  const f=await fixture('retired-after-commit'),http=transport(f),api=http.api();let retired=false;const native=seam(f,{onPrepareComplete:()=>{if(retired)return;retired=true;api.forgetSession();api.bindAccount(f.foreign.accountId);api.forgetSession();api.bindAccount(f.owner.accountId);}});try{
   await assert.rejects(m.flushMutations(api,f.owner.accountId,f.owner.spaceId,()=>true));await native.settled();assert.equal(http.requests.length,0);const row=(await m.listMutations(f.owner.accountId,f.owner.spaceId))[0],prepared=await assertPrepared(f,row);assert.deepEqual(await m.getDraft(f.identity),f.queued);await originals(f);
   await m.flushMutations(http.api(),f.owner.accountId,f.owner.spaceId,()=>true);assert.equal(http.puts.length,1);assert.deepEqual(http.puts[0].payload.content,prepared.content);assert.equal((await m.listMutations(f.owner.accountId,f.owner.spaceId)).length,0);await originals(f);
  }finally{await drainOperations('Prepared originals and terminals before native restore',{excludeGroups:true});native.restore();}
 });
 for(const mode of ['text','title'])await group(PAPER_PREPARED_GROUPS[mode==='text'?5:6],async()=>{
  const f=await fixture('new-'+mode);let newer;const http=transport(f,async(_call,n)=>{if(n!==1)return;const current=await m.getDraft(f.identity);newer={...current,title:'Accepted newer title',updatedAt:current.updatedAt+10,syncState:'local',content:mode==='title'?current.content:m.amendPaperCollaboration(current.content,m.applyPaperCommand(current.content,{type:'patch-object',id:current.content.objects[0].id,patch:{markdown:'Accepted newer canonical text'}}))};await m.putDraft(newer);});
  await m.flushMutations(http.api(),f.owner.accountId,f.owner.spaceId,()=>true);const current=await m.getDraft(f.identity);assert.deepEqual(current,{...newer,baseVersion:Math.max(newer.baseVersion,f.raw.baseVersion+1)},'The old ACK may advance only transport base, never replace a newer graph/header or mark it synced');assert.equal((await m.listMutations(f.owner.accountId,f.owner.spaceId)).length,0);await originals(f);
 });
 await group(PAPER_PREPARED_GROUPS[7],async()=>{
  const f=await fixture('replace-before-ack');let replacement;const http=transport(f,async()=>{replacement={...f.raw,createdAt:f.raw.createdAt+1,content:m.amendPaperCollaboration(f.raw.content,m.applyPaperCommand(f.raw.content,{type:'patch-object',id:f.raw.content.objects[0].id,patch:{markdown:'Replacement queued source survives the old ACK'}}))};await m.queueMutation(replacement);});
  await m.flushMutations(http.api(),f.owner.accountId,f.owner.spaceId,()=>true);assert.deepEqual((await m.listMutations(f.owner.accountId,f.owner.spaceId))[0],replacement);assert.deepEqual(await m.getDraft(f.identity),f.queued,'A mismatched whole outbox row owns neither canonical ACK nor deletion');await originals(f);
 });
 await group(PAPER_PREPARED_GROUPS[8],async()=>{
  for(const mode of ['tombstone','alias','conflict','lineage']){
   const f=await fixture('refuse-'+mode),http=transport(f);if(mode==='tombstone')await m.putSnapshot({key:m.notebookDeletionKey(f.identity),...f.owner,value:{schema:1,kind:'paper-canonical-deletion',...f.owner,documentId:f.identity.documentId,noteId:f.noteId,version:9,deletedAt:1}});if(mode==='alias')await m.putDraft({...f.queued,identityAlias:'retired-alias'});if(mode==='conflict')await m.putDraft({...f.queued,syncState:'conflict'});if(mode==='lineage'){const plain={...f.queued.content};delete plain.collaboration;await m.putDraft({...f.queued,content:m.amendPaperCollaboration(plain,plain)});}const before=await inventory(f.owner);
   await m.flushMutations(http.api(),f.owner.accountId,f.owner.spaceId,()=>true).catch(()=>{});assert.equal(http.puts.length,0,mode+' must refuse publication');assert.deepEqual(await inventory(f.owner),before,mode+' must retain all original sources');await f.foreignExact();
  }
 });
 await group(PAPER_PREPARED_GROUPS[9],async()=>{
  for(const mode of ['id','account']){
   const f=await fixture('transfer-'+mode),prepared=await m.preparePaperMutation(f.raw,f.content,()=>true),recipient=mode==='account'?f.foreign:f.owner,row={...f.raw,...recipient,id:'transferred-'+f.raw.id,paperPrepared:prepared.paperPrepared};await m.queueMutation(row);const before=await inventory(recipient),old=await inventory(f.owner);
   await assert.rejects(m.preparePaperMutation(row,prepared.paperPrepared.content,()=>true));assert.deepEqual(await inventory(recipient),before);assert.deepEqual(await inventory(f.owner),old);if(mode==='id')await f.foreignExact();
  }
 });
 await group(PAPER_PREPARED_GROUPS[10],async()=>{
  const f=await fixture('reuse-save'),prepared=await m.preparePaperMutation(f.raw,f.content,()=>true),before=await inventory(f.owner);
  await assert.rejects(m.saveDraftAndQueue({...f.queued,updatedAt:2},{...prepared,id:'another-id'}));assert.deepEqual(await inventory(f.owner),before);
  await assert.rejects(m.saveDraftAndQueue({...f.queued,updatedAt:2},f.raw));assert.deepEqual(await inventory(f.owner),before);await f.foreignExact();
 });
 await group(PAPER_PREPARED_GROUPS[11],async()=>{
  const f=await fixture('ack-quota'),http=transport(f),native=seam(f,{quotaAck:true});try{
   await assert.rejects(m.flushMutations(http.api(),f.owner.accountId,f.owner.spaceId,()=>true));await native.settled();assert.equal(native.successfulWrites,1);assert.ok(native.events.some(row=>row.kind==='abort'&&row.phase==='ack'));assert.deepEqual(await m.getDraft(f.identity),f.queued);const row=(await m.listMutations(f.owner.accountId,f.owner.spaceId))[0];await assertPrepared(f,row,http.puts[0].payload.content);await originals(f);
   await m.flushMutations(http.api(),f.owner.accountId,f.owner.spaceId,()=>true);assert.equal(http.puts.length,2);assert.equal(http.puts[0].body,http.puts[1].body);assert.equal(http.effects.size,1);assert.equal((await m.listMutations(f.owner.accountId,f.owner.spaceId)).length,0);assert.deepEqual((await m.getDraft(f.identity)).content,http.puts[0].payload.content);await originals(f);
  }finally{await drainOperations('Prepared originals and terminals before native restore',{excludeGroups:true});native.restore();}
 });
}
