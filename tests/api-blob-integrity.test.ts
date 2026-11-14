import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {ApiClient,ApiError} from '../pwa/src/api.ts';

const sha=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const payload=Uint8Array.from([0,255,3,127,10,0,45]);
const sessionChanged=(error:unknown)=>error instanceof ApiError&&error.status===409&&error.code==='session_account_changed';
const deferred=<T>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>resolve=done);return {promise,resolve};};
const client=(fetcher:typeof fetch,account='owner-a')=>{const api=new ApiClient('https://synthetic.invalid',fetcher);if(account)api.bindAccount(account);return api;};

// Only synthetic fetch responses are used. These tests make no network requests or writes.
test('Verified binary download preserves all bytes and media type, uses the captured account and accepts upper-case SHA',async()=>{
 let request:RequestInit|undefined,path:unknown;
 const api=client(async(input,init)=>{path=input;request=init;return new Response(payload,{headers:{'Content-Type':'image/png','Content-Length':String(payload.length),'X-Content-SHA256':sha(payload).toUpperCase()}});});
 const blob=await api.downloadBlob('annual space','blob/id');
 assert.deepEqual(new Uint8Array(await blob.arrayBuffer()),payload);assert.equal(blob.size,payload.length);assert.equal(blob.type,'image/png');
 assert.equal(path,'https://synthetic.invalid/v1/spaces/annual%20space/blobs/blob%2Fid');assert.equal(new Headers(request?.headers).get('X-Dowze-Account'),'owner-a');assert.equal(request?.credentials,'include');assert.equal(request?.cache,'no-store');
});

test('A legacy response without a SHA header remains compatible and keeps its binary bytes',async()=>{
 const api=client(async()=>new Response(payload));const blob=await api.downloadBlob('year','blob');assert.equal(blob.type,'application/octet-stream');assert.deepEqual(new Uint8Array(await blob.arrayBuffer()),payload);
});

test('A valid but wrong SHA rejects a same-size corrupted body',async()=>{
 const corrupt=payload.slice();corrupt[1]^=1;
 const api=client(async()=>new Response(corrupt,{headers:{'X-Content-SHA256':sha(payload)}}));await assert.rejects(api.downloadBlob('year','blob'),/intégrité/);
});

test('Present malformed, empty, truncated and combined SHA headers are refused before accepting a file',async()=>{
 for(const hash of ['',sha(payload).slice(1),'g'.repeat(64),`${sha(payload)},${sha(payload)}`]){
  const api=client(async()=>new Response(payload,{headers:{'X-Content-SHA256':hash}}));await assert.rejects(api.downloadBlob('year','blob'),/empreinte/);
 }
});

test('Forgetting a session during fetch rejects its late response even after rebinding the same account',async()=>{
 const gate=deferred<Response>();const api=client(async()=>gate.promise);const pending=api.downloadBlob('year','blob');api.forgetSession();api.bindAccount('owner-a');gate.resolve(new Response(payload,{headers:{'X-Content-SHA256':sha(payload)}}));await assert.rejects(pending,sessionChanged);
});

test('Binding an initially unbound client during fetch cannot adopt the in-flight download',async()=>{
 const gate=deferred<Response>();const api=client(async()=>gate.promise,'');const pending=api.downloadBlob('year','blob');api.bindAccount('owner-b');gate.resolve(new Response(payload));await assert.rejects(pending,sessionChanged);
});

test('Binding the same owner is harmless, while a direct foreign account bind stays refused',async()=>{
 const gate=deferred<Response>();const api=client(async()=>gate.promise);const pending=api.downloadBlob('year','blob');api.bindAccount('owner-a');assert.throws(()=>api.bindAccount('owner-b'),sessionChanged);gate.resolve(new Response(payload));assert.deepEqual(new Uint8Array(await (await pending).arrayBuffer()),payload);
});

test('Changing owners while a streamed chunk is delayed cancels reception and refuses the old body',async()=>{
 let controller!:ReadableStreamDefaultController<Uint8Array>,cancelled=false;const waiting=deferred<void>();
 const stream=new ReadableStream<Uint8Array>({start(value){controller=value;},pull(){waiting.resolve();},cancel(){cancelled=true;}});
 const api=client(async()=>new Response(stream,{headers:{'X-Content-SHA256':sha(payload)}}));const pending=api.downloadBlob('year','blob');await waiting.promise;api.forgetSession();api.bindAccount('owner-b');controller.enqueue(payload);await assert.rejects(pending,sessionChanged);assert.equal(cancelled,true);
});

test('A session change while hashing the complete body rejects it before returning a Blob',async()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'crypto'),started=deferred<void>(),finished=deferred<ArrayBuffer>();
 Object.defineProperty(globalThis,'crypto',{configurable:true,value:{subtle:{digest:()=>{started.resolve();return finished.promise;}}}});
 try{const api=client(async()=>new Response(payload,{headers:{'X-Content-SHA256':sha(payload)}}));const pending=api.downloadBlob('year','blob');await started.promise;api.forgetSession();finished.resolve(await webcrypto.subtle.digest('SHA-256',payload));await assert.rejects(pending,sessionChanged);}
 finally{if(original)Object.defineProperty(globalThis,'crypto',original);else Reflect.deleteProperty(globalThis,'crypto');}
});

test('Errors from an obsolete fetch or stream do not misreport a changed session as a network failure',async()=>{
 const gate=deferred<Response>();let rejectFetch!:(error:Error)=>void;const failedFetch=new Promise<Response>((_,reject)=>rejectFetch=reject),api=client(async()=>failedFetch),pending=api.downloadBlob('year','blob');api.forgetSession();rejectFetch(Error('synthetic transport failure'));await assert.rejects(pending,sessionChanged);
 let controller!:ReadableStreamDefaultController<Uint8Array>;const waiting=deferred<void>(),stream=new ReadableStream<Uint8Array>({start(value){controller=value;},pull(){waiting.resolve();}}),other=client(async()=>gate.promise),reading=other.downloadBlob('year','blob');gate.resolve(new Response(stream));await waiting.promise;other.forgetSession();controller.error(Error('synthetic stream failure'));await assert.rejects(reading,sessionChanged);
});

test('The 16 MiB declared-size limit rejects an oversized response without consuming its bytes',async()=>{
 let consumed=false;const stream=new ReadableStream<Uint8Array>({pull(controller){consumed=true;controller.enqueue(payload);controller.close();}},{highWaterMark:0});
 const api=client(async()=>new Response(stream,{headers:{'Content-Length':String(16*1024*1024+1)}}));await assert.rejects(api.downloadBlob('year','blob'),/volumineuse/);assert.equal(consumed,false);
});

test('The streaming size cap rejects bodies above 16 MiB even with an absent or misleading size header',async()=>{
 for(const headers of [{},{'Content-Length':'1'}]){
  let index=0,cancelled=false;const stream=new ReadableStream<Uint8Array>({pull(controller){controller.enqueue(new Uint8Array(index++<2?8*1024*1024:1));},cancel(){cancelled=true;}});
  const api=client(async()=>new Response(stream,{headers}));await assert.rejects(api.downloadBlob('year','blob'),/volumineuse/);assert.equal(cancelled,true);
 }
});

test('An exact-limit stream returns exactly 16 MiB rather than truncating its last chunk',async()=>{
 const bytes=new Uint8Array(16*1024*1024);bytes[0]=255;bytes[bytes.length-1]=137;const expected=sha(bytes);let offset=0;
 const stream=new ReadableStream<Uint8Array>({pull(controller){if(offset===bytes.length){controller.close();return;}const end=Math.min(bytes.length,offset+1_048_573);controller.enqueue(bytes.subarray(offset,end));offset=end;}});
 const api=client(async()=>new Response(stream,{headers:{'X-Content-SHA256':expected,'Content-Type':'application/pdf'}}));const blob=await api.downloadBlob('year','blob');assert.equal(blob.size,bytes.length);assert.equal(blob.type,'application/pdf');assert.equal(sha(new Uint8Array(await blob.arrayBuffer())),expected);
});
