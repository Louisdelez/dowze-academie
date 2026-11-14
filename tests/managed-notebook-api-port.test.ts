/** Actual ApiClient + closed Fetch port and native Response/ReadableStream.
 * Fetch is an explicit in-memory seam, not HTTP, native vault or server proof. */
import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ApiClient,ApiError} from '../pwa/src/api.ts';
import {ManagedClientError,createManagedNotebookClient,type ManagedJsonRequest,type ManagedTicket} from '../pwa/src/managedNotebookClient.ts';

const actor='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',resource='20000000-0000-4000-8000-000000000001',incarnation='30000000-0000-4000-8000-000000000001',blobId='40000000-0000-4000-8000-000000000001';
const base='https://managed.invalid',sha=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
const ticket:ManagedTicket={protocol:'dowze-managed-notebook@1',id:resource,incarnation,owner_account_id:actor,space_id:'year',note_id:'note exact',canonical_document_id:'paper-v3-note-exact',metadata_document_id:'note-exact',lineage:'lineage exact',state:'active',resource_version:4,acl_version:3,access_version:5,writer_version:7,role:'owner',capabilities:{read_documents:true,write_documents:true,read_blobs:true,manage_acl:true}};
const identity={accountId:actor,spaceId:ticket.space_id,noteId:ticket.note_id,canonicalDocumentId:ticket.canonical_document_id,metadataDocumentId:ticket.metadata_document_id,lineage:ticket.lineage};
const body=' { "source": "École 📝", "escaped": "\\u0061" }\r\n';
const failure=(code:ManagedClientError['code'])=>(error:unknown)=>error instanceof ManagedClientError&&error.code===code;
const jsonResponse=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
interface Call {url:string;method:string;headers:Headers;body:BodyInit|null|undefined;credentials:RequestCredentials|undefined;cache:RequestCache|undefined;redirect:RequestRedirect|undefined}
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(yes=>{resolve=yes;});return {promise,resolve};}
let fatal=false;
function fixture(t:TestContext,respond:(call:Call)=>Response|Promise<Response>,raw=true){
 if(fatal)throw Error('FATAL_STOP: previous original port work has not settled');
 const calls:Call[]=[],originals=new Set<Promise<unknown>>(),timeouts:string[]=[],gates=new Set<ReturnType<typeof deferred>>();
 const follow=<T>(promise:Promise<T>)=>{let original:Promise<T>;original=promise.finally(()=>originals.delete(original));originals.add(original);void original.catch(()=>{});return original;};
 const bounded=async<T>(promise:Promise<T>,label:string)=>{const original=follow(promise);let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([original,new Promise<never>((_,no)=>{timer=setTimeout(()=>{timeouts.push(label);no(Error(label+': timeout, original remains followed'));},6000);})]);}finally{clearTimeout(timer);}};
 const gate=()=>{const g=deferred();gates.add(g);return g;};
 let epoch=0;const admittedEpoch=epoch;
 const fetcher:typeof fetch=async(input,init={})=>{const call:Call={url:typeof input==='string'?input:input instanceof URL?input.href:input.url,method:init.method??'GET',headers:new Headers(init.headers),body:init.body,credentials:init.credentials,cache:init.cache,redirect:init.redirect};calls.push(call);return respond(call);};
 const api=new ApiClient(base,fetcher,undefined,raw?{managedRawFetch:true}:{});
 let activeApi=api;const current=()=>epoch===admittedEpoch;
 const port=()=>api.createManagedNotebookPort({current,currentApi:()=>activeApi});
 t.after(async()=>{for(const g of gates)g.resolve();let timer:ReturnType<typeof setTimeout>|undefined;try{const terminal=await Promise.race([Promise.allSettled([...originals]).then(()=>true),new Promise<boolean>(yes=>{timer=setTimeout(()=>yes(false),6500);})]);if(!terminal||originals.size){fatal=true;throw Error('FATAL_STOP: original port promise active; no next fixture admitted');}assert.deepEqual(timeouts,[],'Timeout never counts as an expected business rejection');}finally{clearTimeout(timer);if(timeouts.length)fatal=true;}});
 return {api,port,calls,follow,bounded,gate,retire:()=>{epoch++;},replaceApi:(value:ApiClient)=>{activeApi=value;}};
}
const capabilitiesRequest:ManagedJsonRequest={kind:'capabilities',maximum:65_536};
function assertClosed(calls:Call[]){for(const call of calls){const url=new URL(call.url);assert.equal(url.origin,base);assert.equal(url.pathname.startsWith('/v1/spaces'),false,'No private endpoint fallback');assert.equal(call.credentials,'include');assert.equal(call.cache,'no-store');assert.equal(call.redirect,'error');assert.equal(call.headers.get('X-Dowze-Account'),actor);}}

test('Closed JSON table uses the exact 5b routes queries headers and unchanged UTF8 request body',async t=>{
 const f=fixture(t,call=>new URL(call.url).pathname==='/v1/csrf'?jsonResponse({csrf_token:'synthetic-csrf-one'}):jsonResponse({ok:true})),session=f.port().capture(actor);
 assert.deepEqual(Object.keys(session).sort(),['actorAccountId','binary','current','json'],'No credential or generic HTTP capability escapes the port');
 const requests:ManagedJsonRequest[]=[capabilitiesRequest,{kind:'proofs',identity,maximum:65_536},{kind:'admission',resourceId:resource,key:'admission-key',body,maximum:65_536},{kind:'state',ticket,maximum:65_536},{kind:'write',resourceId:resource,key:'write-key',body,maximum:65_536}];
 for(const request of requests)await f.bounded(session.json(request),'closed route '+request.kind);
 const managed=f.calls.filter(call=>new URL(call.url).pathname!=='/v1/csrf');assert.deepEqual(managed.map(call=>[call.method,new URL(call.url).pathname]),[['GET','/v1/notebooks/capabilities'],['GET','/v1/notebook-admission-proofs'],['PUT',`/v1/notebooks/${resource}/admission`],['GET',`/v1/notebooks/${resource}/state`],['PUT',`/v1/notebooks/${resource}/state-v2`]]);
 assert.deepEqual([...new URL(managed[1].url).searchParams],[['space_id',identity.spaceId],['note_id',identity.noteId],['canonical_document_id',identity.canonicalDocumentId],['metadata_document_id',identity.metadataDocumentId],['lineage',identity.lineage]]);
 assert.deepEqual([...new URL(managed[3].url).searchParams],[['incarnation',incarnation],['resource_version','4'],['access_version','5']]);
 for(const [index,key]of [[2,'admission-key'],[4,'write-key']]as const){assert.equal(managed[index].body===body,true,'Raw whitespace/escape/UTF8 bytes must not be re-encoded');assert.equal(sha(managed[index].body as string),sha(body));assert.equal(managed[index].headers.get('Content-Type'),'application/json');assert.equal(managed[index].headers.get('X-Idempotency-Key'),key);assert.equal(managed[index].headers.get('X-CSRF-Token'),'synthetic-csrf-one');assert.equal(new URL(managed[index].url).search,'');}
 assert.equal(f.calls.filter(call=>new URL(call.url).pathname==='/v1/csrf').length,1);assertClosed(f.calls);
});

test('Resource blob table preserves exact bytes and upload hash without private-media or native routes',async t=>{
 const bytes=new Uint8Array([0xff,0,0x50,0x4b,0x80,0xfe]),f=fixture(t,call=>new URL(call.url).pathname==='/v1/csrf'?jsonResponse({csrf_token:'synthetic-csrf'}):call.method==='POST'?jsonResponse({uploaded:true},201):new Response(bytes,{headers:{'Content-Type':'application/octet-stream'}})),session=f.port().capture(actor);
 const blob=new Blob([bytes],{type:'application/octet-stream'});await f.bounded(session.binary({kind:'upload',ticket,key:'blob-key',blob,sha256:sha(bytes),maximum:65_536}),'resource upload');
 const result=await f.bounded(session.binary({kind:'resourceBlob',ticket,canonicalVersion:8,metadataVersion:12,blob:{id:blobId,media_type:blob.type,size:bytes.length,sha256:sha(bytes)},maximum:bytes.length}),'resource download');assert.equal(sha(result.body),sha(bytes));
 const upload=f.calls.find(call=>call.method==='POST')!,download=f.calls.at(-1)!;assert.equal(new URL(upload.url).pathname,`/v1/notebooks/${resource}/blobs`);assert.deepEqual([...new URL(upload.url).searchParams],[['incarnation',incarnation],['resource_version','4'],['writer_version','7']]);assert.equal(upload.headers.get('X-Content-SHA256'),sha(bytes));assert.equal(upload.headers.get('X-Idempotency-Key'),'blob-key');assert.ok(upload.body instanceof Blob);assert.equal(sha(new Uint8Array(await upload.body.arrayBuffer())),sha(bytes));assert.equal(new URL(download.url).pathname,`/v1/notebooks/${resource}/blobs/${blobId}`);assert.deepEqual([...new URL(download.url).searchParams],[['incarnation',incarnation],['resource_version','4'],['access_version','5'],['canonical_version','8'],['metadata_version','12']]);assertClosed(f.calls);
});

test('JSON reply streams across split UTF8 sequences and never calls unbounded Response decoding',async t=>{
 const raw='\ufeff{"title":"É📝"}',bytes=new TextEncoder().encode(raw);let cancel=0;
 const f=fixture(t,()=>{let i=0;const stream=new ReadableStream<Uint8Array>({pull(c){if(i===bytes.length)c.close();else c.enqueue(bytes.slice(i,i+=1));},cancel(){cancel++;}});const response=new Response(stream);for(const name of ['json','text','arrayBuffer']as const)Object.defineProperty(response,name,{value:()=>{throw Error('Forbidden unbounded '+name);}});return response;});
 const result=await f.bounded(f.port().capture(actor).json({kind:'capabilities',maximum:64}),'stream split UTF8');assert.equal(result.body===raw,true);assert.equal(cancel,0,'Closed stream has no outstanding source to cancel');assertClosed(f.calls);
});

test('Declared oversize response cancels its native body before reading any chunk',async t=>{
 let pulls=0,cancels=0;const f=fixture(t,()=>new Response(new ReadableStream<Uint8Array>({pull(c){pulls++;c.enqueue(new Uint8Array([1]));},cancel(){cancels++;}},{highWaterMark:0}),{headers:{'Content-Length':'100'}}));
 await assert.rejects(f.bounded(f.port().capture(actor).json({kind:'capabilities',maximum:8}),'declared cap refusal'),failure('invalid-response'));assert.equal(pulls,0);assert.equal(cancels,1);assert.equal(f.calls.length,1);assertClosed(f.calls);
});

test('Streaming cap rejects before complete allocation and cancels remaining chunks',async t=>{
 let pulls=0,cancels=0;const f=fixture(t,()=>new Response(new ReadableStream<Uint8Array>({pull(c){pulls++;c.enqueue(new Uint8Array(4).fill(0x61));},cancel(){cancels++;}},{highWaterMark:0})));
 await assert.rejects(f.bounded(f.port().capture(actor).json({kind:'capabilities',maximum:6}),'stream cap refusal'),failure('invalid-response'));assert.equal(pulls,2);assert.equal(cancels,1);assert.equal(f.calls.length,1);assertClosed(f.calls);
});

test('Invalid UTF8 is refused for JSON while unknown/error responses never trigger a private fallback',async t=>{
 const f=fixture(t,()=>new Response(new Uint8Array([0xc3,0x28])));await assert.rejects(f.bounded(f.port().capture(actor).json(capabilitiesRequest),'fatal UTF8'),failure('invalid-response'));assert.equal(f.calls.length,1);assertClosed(f.calls);
 const old=fixture(t,()=>jsonResponse({code:'not_found'},404)),port=old.port(),client=createManagedNotebookClient({port,actorAccountId:actor,current:()=>true,currentPort:()=>port});await assert.rejects(old.bounded(client.capabilities(),'old server unavailable'),failure('unavailable'));assert.equal(old.calls.length,1);assertClosed(old.calls);
});

test('Authority retirement while fetch headers are held cancels the unread body and returns no old response',async t=>{
 let cancels=0;let entered!:ReturnType<typeof deferred>,held!:ReturnType<typeof deferred>;const f=fixture(t,async()=>{entered.resolve();await held.promise;return new Response(new ReadableStream<Uint8Array>({pull(c){c.enqueue(new Uint8Array([1]));},cancel(){cancels++;}},{highWaterMark:0}));});entered=f.gate();held=f.gate();const session=f.port().capture(actor),work=f.follow(session.json(capabilitiesRequest));await f.bounded(entered.promise,'fetch entered');f.retire();held.resolve();await assert.rejects(f.bounded(work,'retired headers'),failure('authority-changed'));assert.equal(cancels,1);assert.equal(session.current(),false);await assert.rejects(session.json(capabilitiesRequest),failure('authority-changed'));assert.equal(f.calls.length,1);assertClosed(f.calls);
});

test('Authority retirement during a real body read cancels it before publication and is never reactivated',async t=>{
 let cancels=0;let entered!:ReturnType<typeof deferred>,held!:ReturnType<typeof deferred>;const f=fixture(t,()=>new Response(new ReadableStream<Uint8Array>({async pull(c){entered.resolve();await held.promise;c.enqueue(new TextEncoder().encode('{}'));},cancel(){cancels++;}},{highWaterMark:0})));entered=f.gate();held=f.gate();const session=f.port().capture(actor),work=f.follow(session.json(capabilitiesRequest));await f.bounded(entered.promise,'reader entered');f.retire();held.resolve();await assert.rejects(f.bounded(work,'retired body'),failure('authority-changed'));assert.equal(cancels,1);assert.equal(session.current(),false);assert.equal(f.calls.length,1);assertClosed(f.calls);
});

test('CSRF retry refreshes only its captured session and sends the same raw body id and route once',async t=>{
 let csrf=0,puts=0;const f=fixture(t,call=>{if(new URL(call.url).pathname==='/v1/csrf')return jsonResponse({csrf_token:'synthetic-'+(++csrf)});return ++puts===1?jsonResponse({code:'csrf_rejected'},403):jsonResponse({accepted:true},201);}),session=f.port().capture(actor);
 await f.bounded(session.json({kind:'admission',resourceId:resource,key:'exact-retry-key',body,maximum:65_536}),'CSRF exact retry');const attempts=f.calls.filter(call=>call.method==='PUT');assert.equal(attempts.length,2);assert.equal(csrf,2);assert.equal(attempts[0].url,attempts[1].url);assert.equal(attempts[0].body===body&&attempts[1].body===body,true);assert.equal(sha(attempts[0].body as string),sha(attempts[1].body as string));assert.equal(attempts[0].headers.get('X-Idempotency-Key'),attempts[1].headers.get('X-Idempotency-Key'));assert.equal(attempts[0].headers.get('X-CSRF-Token'),'synthetic-1');assert.equal(attempts[1].headers.get('X-CSRF-Token'),'synthetic-2');assertClosed(f.calls);
});

test('A lost Fetch ACK reuses exact raw UTF8 body and key with a fresh captured port under the same API session',async t=>{
 const effects=new Map<string,{bodySHA256:string;raw:string}>();let puts=0;
 const f=fixture(t,call=>{if(new URL(call.url).pathname==='/v1/csrf')return jsonResponse({csrf_token:'synthetic-csrf'});const key=call.headers.get('X-Idempotency-Key')!,raw=call.body;assert.equal(typeof raw,'string');const next={bodySHA256:sha(raw as string),raw:raw as string};if(effects.has(key))assert.deepEqual(next,effects.get(key),'The first synthetic effect is immutable');else effects.set(key,next);if(++puts===1)throw new TypeError('Synthetic lost ACK after the exact Fetch body was recorded');return jsonResponse({accepted:true});});
 const request:ManagedJsonRequest={kind:'write',resourceId:resource,key:'lost-ack-key',body,maximum:65_536};
 await assert.rejects(f.bounded(f.port().capture(actor).json(request),'first Fetch effect'),TypeError);await f.bounded(f.port().capture(actor).json(request),'ordinary fresh port retry');assert.equal(effects.size,1);assert.equal(puts,2);const attempts=f.calls.filter(call=>call.method==='PUT');assert.equal(attempts.length,2);assert.equal(attempts[0].body===body&&attempts[1].body===body,true);assert.equal(attempts[0].url,attempts[1].url);assert.equal(effects.get('lost-ack-key')?.bodySHA256,sha(body));assert.equal(f.calls.filter(call=>new URL(call.url).pathname==='/v1/csrf').length,1);assertClosed(f.calls);
});

test('Second CSRF refusal is returned without a third PUT; retired CSRF cannot send the first PUT',async t=>{
 const f=fixture(t,call=>new URL(call.url).pathname==='/v1/csrf'?jsonResponse({csrf_token:'synthetic-token'}):jsonResponse({code:'csrf_rejected'},403));const reply=await f.bounded(f.port().capture(actor).json({kind:'write',resourceId:resource,key:'bounded-retry',body,maximum:65_536}),'single CSRF retry');assert.equal(reply.status,403);assert.equal(f.calls.filter(call=>call.method==='PUT').length,2);assertClosed(f.calls);
 let entered!:ReturnType<typeof deferred>,held!:ReturnType<typeof deferred>;const retired=fixture(t,async()=>{entered.resolve();await held.promise;return jsonResponse({csrf_token:'never-use-this-synthetic-token'});});entered=retired.gate();held=retired.gate();const session=retired.port().capture(actor),work=retired.follow(session.json({kind:'admission',resourceId:resource,key:'retired-csrf',body,maximum:65_536}));await retired.bounded(entered.promise,'CSRF request held');retired.api.forgetSession();retired.api.bindAccount(actor);held.resolve();await assert.rejects(retired.bounded(work,'epoch ABA CSRF'),failure('authority-changed'));assert.equal(retired.calls.some(call=>call.method==='PUT'),false);assert.equal(retired.api.hasCsrf(),false);assertClosed(retired.calls);
});

test('Initial stale/native/foreign and malformed closed calls do not bind or send; fresh raw admission is explicit',async t=>{
 const f=fixture(t,()=>jsonResponse({ok:true}));let binds=0;const nativeBind=f.api.bindAccount.bind(f.api);f.api.bindAccount=value=>{binds++;nativeBind(value);};
 assert.throws(()=>f.api.createManagedNotebookPort({current:()=>false}),failure('authority-changed'));assert.equal(binds,0);const port=f.port();assert.throws(()=>port.capture('not-an-account'),failure('invalid-response'));assert.equal(binds,0);const session=port.capture(actor);assert.equal(binds,1);await assert.rejects(session.json({kind:'proofs',identity:{...identity,accountId:other},maximum:65_536}),failure('invalid-response'));await assert.rejects(session.json({kind:'private-fallback',maximum:65_536}as unknown as ManagedJsonRequest),failure('invalid-response'));await assert.rejects(session.json({kind:'write',resourceId:resource,key:'safe-key',body:'\ud800',maximum:65_536}),failure('invalid-response'));assert.equal(f.calls.length,0);
 const native=fixture(t,()=>{throw Error('Native re-encoding bridge must not be called');},false);let nativeBinds=0;native.api.bindAccount=()=>{nativeBinds++;};assert.throws(()=>native.port(),failure('unavailable'));assert.equal(nativeBinds,0);assert.equal(native.calls.length,0);
 const foreign=fixture(t,()=>{throw Error('Foreign session must not send');});foreign.api.bindAccount(other);assert.throws(()=>foreign.port().capture(actor),(error:unknown)=>error instanceof ApiError&&error.code==='session_account_changed');assert.equal(foreign.calls.length,0);
 const builtin=new ApiClient(base);assert.doesNotThrow(()=>builtin.createManagedNotebookPort({current:()=>true}).capture(actor),'Built-in PWA Fetch has raw support without a custom-fetch attestation');
});

test('Input route/ticket are copied before await and API/epoch ABA never revives an old session',async t=>{
 let entered!:ReturnType<typeof deferred>,held!:ReturnType<typeof deferred>;const f=fixture(t,async call=>{if(new URL(call.url).pathname==='/v1/csrf'){entered.resolve();await held.promise;return jsonResponse({csrf_token:'synthetic-csrf'});}return jsonResponse({ok:true});});entered=f.gate();held=f.gate();const capturedPort=f.port(),session=capturedPort.capture(actor),request={kind:'write' as const,resourceId:resource,key:'original-key',body,maximum:65_536},work=f.follow(session.json(request));await f.bounded(entered.promise,'captured request before CSRF');Object.assign(request,{resourceId:'20000000-0000-4000-8000-000000000099',key:'changed-key',body:'{}'});held.resolve();await f.bounded(work,'captured request settlement');const put=f.calls.find(call=>call.method==='PUT')!;assert.equal(new URL(put.url).pathname,`/v1/notebooks/${resource}/state-v2`);assert.equal(put.headers.get('X-Idempotency-Key'),'original-key');assert.equal(put.body===body,true);
 f.api.forgetSession();f.api.bindAccount(actor);assert.equal(session.current(),false);assert.throws(()=>capturedPort.capture(actor),failure('authority-changed'));await assert.rejects(session.json(capabilitiesRequest),failure('authority-changed'));const fresh=f.port().capture(actor);await f.bounded(fresh.json(capabilitiesRequest),'fresh same API epoch');const oldCalls=f.calls.length;f.replaceApi(new ApiClient(base));assert.equal(fresh.current(),false);f.replaceApi(f.api);assert.equal(fresh.current(),false);await assert.rejects(fresh.json(capabilitiesRequest),failure('authority-changed'));assert.equal(f.calls.length,oldCalls);assertClosed(f.calls);
});
