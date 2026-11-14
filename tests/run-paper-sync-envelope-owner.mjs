// Actual gzip/SHA, ApiClient and storage; explicit digest/response gates and
// fake fetch/fakeIndexedDB only. No network, native or browser durability claim.
import {requireBoundedMountedCheck,mountedCleanup,mountedAuditPath} from './mounted-cleanup.mjs';
requireBoundedMountedCheck();
const [{build},{IDBFactory},{default:assert},{mkdtemp,rm,readFile,writeFile,mkdir},{join,dirname},{pathToFileURL},{createHash}]=await Promise.all([import('vite'),import('fake-indexeddb'),import('node:assert/strict'),import('node:fs/promises'),import('node:path'),import('node:url'),import('node:crypto')]);
const names=[
 'Legacy four-argument encoding keeps deterministic gzip, SHA and exact decoding',
 'An already revoked guard refuses inline and envelope paths before work',
 'Account A to B during the actual gzip digest sends nothing and retains both scopes',
 'Account A to B to A never revalidates the old digest admission',
 'API A to B to A never revalidates the old digest admission',
 'Revocation while the body upload acknowledges prevents PUT and local ACK',
 'A lost body acknowledgement retries the same body key and bytes without losing the queue',
 'A fresh authorized retry drains only the original A mutation'
];
const sourcePaths=['src/lib/paperSync.ts','pwa/src/sync.ts','pwa/src/api.ts','pwa/src/storage.ts','tests/paper-sync-envelope-owner-entry.ts','tests/run-paper-sync-envelope-owner.mjs'];
const originalGlobals=new Map(['indexedDB','navigator'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
const operations=new Set(),gates=new Set(),restorers=new Set(),factories=new Set(),hash=value=>createHash('sha256').update(value).digest('hex');
const out=await mkdtemp(join(process.cwd(),'tests/.paper-sync-envelope-owner-'));
const report={scope:'Production encode/flush, actual gzip/SHA and ApiClient; fake fetch and real fakeIndexedDB transactions, no native/browser/server claim',declaredGroups:names.length,groups:[],passed:0,failed:0,cleanup:'NOTRUN',fullSuite:false,startedAt:new Date().toISOString()};
let m,sequence=0,lastRevoked;
const tracked=promise=>{operations.add(promise);void promise.then(()=>operations.delete(promise),()=>operations.delete(promise));return promise;};
const bounded=async(promise,label='Envelope recipe',ms=6000)=>{tracked(promise);let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+': timeout')),ms);})]);}finally{clearTimeout(timer);}};
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done),release=()=>{gates.delete(release);resolve();};gates.add(release);return {promise,release};};
const revoked=error=>error instanceof Error&&error.message.includes('La connexion a changé pendant la préparation de la note')&&!error.message.includes('timeout');
const jsonHash=value=>hash(JSON.stringify(value));
function digestGate(){
 const entered=deferred(),hold=deferred(),subtle=crypto.subtle,original=subtle.digest,descriptor=Object.getOwnPropertyDescriptor(subtle,'digest');let used=false;
 Object.defineProperty(subtle,'digest',{configurable:true,writable:true,value:async function(...args){
  const result=await original.apply(this,args),input=args[1],bytes=ArrayBuffer.isView(input)?new Uint8Array(input.buffer,input.byteOffset,input.byteLength):new Uint8Array(input);
  if(!used&&bytes[0]===0x1f&&bytes[1]===0x8b){used=true;entered.release();await hold.promise;}return result;
 }});
 const restore=()=>{if(descriptor)Object.defineProperty(subtle,'digest',descriptor);else delete subtle.digest;restorers.delete(restore);};restorers.add(restore);
 return {entered:entered.promise,release:hold.release,restore,used:()=>used};
}
function api(scope,{holdUpload,loseAcknowledgement=false}={}){
 const uploads=[],puts=[],bodies=new Map();let lose=loseAcknowledgement;
 const client=new m.ApiClient('',async(input,init={})=>{
  const url=new URL(String(input),'https://fixture.invalid');if(url.pathname==='/v1/csrf')return Response.json({csrf_token:'fixture-only'});
  assert.equal(new Headers(init.headers).get('X-Dowze-Account'),scope.accountId);assert.equal(init.credentials,'include');
  assert.ok(url.pathname.startsWith(`/v1/spaces/${scope.spaceId}/`));
  if(url.pathname.endsWith('/blobs')&&init.method==='POST'){
   const bytes=new Uint8Array(await init.body.arrayBuffer()),key=new Headers(init.headers).get('X-Idempotency-Key'),sha=new Headers(init.headers).get('X-Content-SHA256');assert.equal(hash(bytes),sha);
   const old=bodies.get(key);if(old)assert.deepEqual(bytes,old.bytes,'Idempotent body retry must keep exact compressed bytes');
   else bodies.set(key,{id:`body-${bodies.size+1}`,bytes,sha});uploads.push({key,sha,size:bytes.length});
   if(holdUpload){holdUpload.entered.release();await holdUpload.hold.promise;}
   if(lose){lose=false;throw Error('Fixture lost body acknowledgement');}return Response.json({id:bodies.get(key).id});
  }
  if(url.pathname.includes('/blobs/')&&!init.method){const body=[...bodies.values()].find(row=>url.pathname.endsWith('/'+row.id));assert.ok(body);return new Response(body.bytes,{headers:{'Content-Type':'application/octet-stream','X-Content-SHA256':body.sha}});}
  assert.equal(init.method,'PUT');assert.ok(url.pathname.includes('/documents/whiteboard/'));const body=JSON.parse(init.body);puts.push({key:new Headers(init.headers).get('X-Idempotency-Key'),body});return Response.json({version:8});
 });
 return {client,uploads,puts,bodies};
}
async function fixture(){
 const factory=new IDBFactory();factories.add(factory);Object.defineProperty(globalThis,'indexedDB',{value:factory,writable:true,configurable:true});
 const scope={accountId:'qa-envelope-A-'+ ++sequence,spaceId:'year'},other={accountId:'qa-envelope-B-'+sequence,spaceId:'year'},noteId='same-note';
 const document=m.migratePaper(noteId,'Captured A original. '.repeat(15000),null,'2026-10-15T10:00:00Z'),foreign=m.migratePaper(noteId,'B remains independent.',null,'2026-10-15T10:00:00Z');assert.equal(m.isPaperDocument(document),true);assert.ok(JSON.stringify(document).length>256*1024);
 const draft={...scope,type:'whiteboard',documentId:m.notebookDocumentId(noteId),title:'A original',content:document,baseVersion:7,updatedAt:1,syncState:'local'},otherDraft={...draft,...other,title:'B original',content:foreign,syncState:'synced'};
 await m.putDraft(draft);await m.putDraft(otherDraft);await m.queueLocalDrafts(scope.accountId,scope.spaceId);
 const read=async owner=>({draft:jsonHash(await m.getDraft({...draft,...owner})),queue:jsonHash(await m.listMutations(owner.accountId,owner.spaceId)),blobs:jsonHash(await m.listLocalBlobs(owner.accountId,owner.spaceId)),snapshots:jsonHash(await m.listSnapshots(owner.accountId,owner.spaceId))});
 const originalState={A:await read(scope),B:await read(other)},documentSha=jsonHash(document),queued=await m.listMutations(scope.accountId,scope.spaceId);assert.equal(queued.length,1);
 return {factory,scope,other,draft,otherDraft,document,documentSha,queued,read,originalState,unchanged:async()=>{assert.deepEqual({A:await read(scope),B:await read(other)},originalState);assert.equal(jsonHash(document),documentSha);}};
}
async function revokeDuringDigest(transition){
 const f=await fixture(),remote=api(f.scope),gate=digestGate(),apiA=remote.client,apiB=api(f.other).client;let authority={account:f.scope.accountId,api:apiA};
 const captured=authority,current=()=>authority===captured;
 const pending=tracked(m.flushMutations(remote.client,f.scope.accountId,f.scope.spaceId,current));void pending.catch(()=>{});await bounded(gate.entered,'Actual gzip digest');assert.equal(gate.used(),true);
 if(transition==='API-ABA'){authority={account:f.scope.accountId,api:apiB};authority={account:f.scope.accountId,api:apiA};}
 else{authority={account:f.other.accountId,api:apiB};if(transition==='owner-ABA')authority={account:f.scope.accountId,api:apiA};}
 assert.equal(current(),false,'Returning to A must retain a different admission token');gate.release();await assert.rejects(()=>bounded(pending,'Revoked flush'),revoked);gate.restore();
 assert.equal(remote.uploads.length,0);assert.equal(remote.puts.length,0);await f.unchanged();lastRevoked={f,remote,current};
}
async function group(name,work){
 try{await bounded(work(),name);report.groups.push({name,status:'PASS'});report.passed++;console.log(name+': PASS');}
 catch(error){report.groups.push({name,status:'FAIL',error:String(error?.stack??error).slice(0,1600)});report.failed++;}
 finally{for(const release of [...gates])release();for(const restore of [...restorers])restore();await bounded(Promise.allSettled([...operations]),'Previous envelope operations');assert.equal(operations.size,0,'No work may enter the next scope fixture');}
}
try{
 Object.defineProperty(globalThis,'navigator',{value:{onLine:true},writable:true,configurable:true});
 report.sourceHashes=Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,hash(await readFile(path))])));
 await build({configFile:false,ssr:{noExternal:['yjs','lib0']},build:{ssr:'tests/paper-sync-envelope-owner-entry.ts',outDir:out,copyPublicDir:false,minify:false,sourcemap:false,reportCompressedSize:false,rollupOptions:{output:{entryFileNames:'envelope-owner.mjs'}}},logLevel:'error'});
 m=await import(pathToFileURL(join(out,'envelope-owner.mjs')));
 await group(names[0],async()=>{const f=await fixture(),remote=api(f.scope);remote.client.bindAccount(f.scope.accountId);const first=await m.encodePaperSync(remote.client,f.scope.spaceId,f.document,'legacy-body'),second=await m.encodePaperSync(remote.client,f.scope.spaceId,f.document,'legacy-body');assert.equal(first.notebookEnvelope,3);assert.deepEqual(second,first);assert.deepEqual(remote.uploads[0],remote.uploads[1]);assert.deepEqual(await m.decodePaperSync(remote.client,f.scope.spaceId,first),f.document);await f.unchanged();});
 await group(names[1],async()=>{const f=await fixture(),remote=api(f.scope);for(const content of [{plain:true},m.migratePaper('small','Inline.',null),f.document])await assert.rejects(()=>m.encodePaperSync(remote.client,f.scope.spaceId,content,'revoked',()=>false),revoked);assert.equal(remote.uploads.length,0);assert.equal(remote.puts.length,0);await f.unchanged();});
 await group(names[2],()=>revokeDuringDigest('owner-to-B'));
 await group(names[3],()=>revokeDuringDigest('owner-ABA'));
 await group(names[4],()=>revokeDuringDigest('API-ABA'));
 await group(names[5],async()=>{const f=await fixture(),entered=deferred(),hold=deferred(),remote=api(f.scope,{holdUpload:{entered,hold}});let authority={};const captured=authority,current=()=>authority===captured,pending=tracked(m.flushMutations(remote.client,f.scope.accountId,f.scope.spaceId,current));void pending.catch(()=>{});await bounded(entered.promise,'Body upload');authority={};hold.release();await assert.rejects(()=>bounded(pending),revoked);assert.equal(remote.uploads.length,1);assert.equal(remote.puts.length,0);await f.unchanged();});
 await group(names[6],async()=>{const f=await fixture(),remote=api(f.scope,{loseAcknowledgement:true});await assert.rejects(()=>m.flushMutations(remote.client,f.scope.accountId,f.scope.spaceId,()=>true),/Fixture lost body acknowledgement/);await f.unchanged();await m.flushMutations(remote.client,f.scope.accountId,f.scope.spaceId,()=>true);assert.equal(remote.uploads.length,2);assert.deepEqual(remote.uploads[0],remote.uploads[1]);assert.equal(remote.bodies.size,1);assert.equal(remote.puts.length,1);assert.equal(remote.puts[0].key,f.queued[0].id);assert.equal((await m.listMutations(f.scope.accountId,f.scope.spaceId)).length,0);assert.deepEqual(await f.read(f.other),f.originalState.B);});
 await group(names[7],async()=>{assert.ok(lastRevoked,'A real digest revocation must precede this fresh retry');const {f,remote,current}=lastRevoked;Object.defineProperty(globalThis,'indexedDB',{value:f.factory,writable:true,configurable:true});assert.equal(current(),false);await m.flushMutations(remote.client,f.scope.accountId,f.scope.spaceId,()=>true);assert.equal(remote.uploads.length,1);assert.equal(remote.uploads[0].key,f.queued[0].id+'-body');assert.equal(remote.puts.length,1);assert.equal(remote.puts[0].key,f.queued[0].id);assert.equal((await m.listMutations(f.scope.accountId,f.scope.spaceId)).length,0);const stored=await m.getDraft(f.draft);assert.equal(stored.baseVersion,8);assert.equal(stored.syncState,'synced');assert.equal(stored.content.noteId,f.document.noteId);assert.equal(jsonHash(stored.content.objects),jsonHash(f.document.objects));assert.deepEqual(await f.read(f.other),f.originalState.B);assert.equal(current(),false);});
 const finalHashes=Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,hash(await readFile(path))])));assert.deepEqual(finalHashes,report.sourceHashes,'Source must remain frozen during the recipe');
}catch(error){report.fatal=String(error?.stack??error).slice(0,1600);process.exitCode=1;}
finally{
 for(const release of [...gates])release();for(const restore of [...restorers])restore();
 try{await mountedCleanup([['Pending operations',async()=>{await bounded(Promise.allSettled([...operations]),'Final envelope operations');assert.equal(operations.size,0);}],['Owned fake databases',async()=>{for(const factory of factories)await new Promise((resolve,reject)=>{const request=factory.deleteDatabase('dowze-academie-pwa');request.onsuccess=()=>resolve();request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Owned fake database still open'));});}],['Temporary bundle',()=>rm(out,{recursive:true,force:true})],['Exact globals',()=>{for(const [name,descriptor] of originalGlobals)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}]]);report.cleanup='PASS';}catch(error){report.cleanup='FAIL';report.cleanupError=String(error?.message??error);process.exitCode=1;}
 for(const name of names)if(!report.groups.some(row=>row.name===name))report.groups.push({name,status:'NOTRUN',reason:'Earlier setup or cleanup failure'});
 report.operationsRemaining=operations.size;report.fullSuite=report.passed===names.length&&!report.failed&&!report.fatal&&report.cleanup==='PASS';if(!report.fullSuite)process.exitCode=1;report.finishedAt=new Date().toISOString();
 const path=mountedAuditPath('paper-sync-envelope-owner-20261015.json');await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,failed:report.failed,fullSuite:report.fullSuite,cleanup:report.cleanup,report:path,fatal:report.fatal??null}));
}
