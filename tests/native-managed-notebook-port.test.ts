/** Actual TS port + ApiClient. IPC/native HTTP/vault are explicit byte-protocol
 * seams; these tests do not prove Rust compilation, keyring or native networking. */
import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ApiClient} from '../pwa/src/api.ts';
import {ManagedClientError,MAX_MANAGED_REPLY_BYTES,type ManagedTicket} from '../pwa/src/managedNotebookClient.ts';
import {MAX_MANAGED_PACKET_BYTES} from '../pwa/src/managedNotebookProtocol.ts';
import {createNativeManagedNotebookPort,NATIVE_MANAGED_PROTOCOL,NATIVE_MANAGED_ORIGIN,type NativeManagedCommands,type NativeManagedPortBinding} from '../src/lib/nativeManagedNotebookPort.ts';
const actor='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',profile='local-profile-different-from-actor';
const ticket:ManagedTicket={protocol:'dowze-managed-notebook@1',id:'20000000-0000-4000-8000-000000000001',incarnation:'30000000-0000-4000-8000-000000000001',owner_account_id:actor,space_id:'year',note_id:'note exact',canonical_document_id:'paper-note',metadata_document_id:'note',lineage:'lineage exact',state:'active',resource_version:4,acl_version:3,access_version:5,writer_version:7,role:'owner',capabilities:{read_documents:true,write_documents:true,read_blobs:true,manage_acl:true}};
const sha=(b:string|Uint8Array)=>createHash('sha256').update(b).digest('hex');
const err=(code:ManagedClientError['code'])=>(e:unknown)=>e instanceof ManagedClientError&&e.code===code;
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(yes=>{resolve=yes;});return {promise,resolve};};
let fatal=false;
function fixture(t:TestContext){
 if(fatal)throw Error('FATAL_STOP: previous original work is still active');
 const calls:{command:string;args:Readonly<Record<string,unknown>>}[]=[],originals=new Set<Promise<unknown>>(),timeouts:string[]=[],gates:ReturnType<typeof deferred>[]=[],bindings:NativeManagedPortBinding[]=[];
 const follow=<T>(p:Promise<T>)=>{let work:Promise<T>;work=p.finally(()=>originals.delete(work));originals.add(work);void work.catch(()=>{});return work;};
 const bounded=async<T>(p:Promise<T>,label:string)=>{const work=follow(p);let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([work,new Promise<never>((_,no)=>{timer=setTimeout(()=>{timeouts.push(label);no(Error(label+': timeout; original remains followed'));},6000);})]);}finally{clearTimeout(timer);}};
 let enabled=true,active=true,apiCaptures=0,leaseCounter=0,held:undefined|{id:string;leaseId:string;route:Record<string,unknown>;length:number;hash:string;input:Uint8Array;reply:Uint8Array;offset:number};
 let executeGate:ReturnType<typeof deferred>|undefined,captureGate:ReturnType<typeof deferred>|undefined;
 let response=new TextEncoder().encode(' {"é":"📝","escape":"\\u0061"}\r\n'),status=200,mediaType='application/json',fault:''|'offset'|'hash'|'size'|'protocol'='';
 class TrackedApi extends ApiClient {override captureSessionAuthority(id:string){apiCaptures++;return super.captureSessionAuthority(id);}}
 const api=new TrackedApi('https://managed.invalid');let currentApi:ApiClient=api;
 const leases=new Set<string>(),transfer='b'.repeat(48),effects:Uint8Array[]=[],routes:Record<string,unknown>[]=[];
 const commands:NativeManagedCommands={async invoke<T>(command,args){
  calls.push({command,args:structuredClone(args)});let value:unknown;
  if(command==='managed_native_capture'){if(captureGate)await captureGate.promise;const lease=(++leaseCounter).toString(16).padStart(48,'0');leases.add(lease);value={protocol:NATIVE_MANAGED_PROTOCOL,leaseId:lease,actorAccountId:actor,origin:NATIVE_MANAGED_ORIGIN,chunkBytes:65_536,maxBodyBytes:MAX_MANAGED_PACKET_BYTES,maxReplyBytes:MAX_MANAGED_REPLY_BYTES};}
  else if(command==='managed_native_retire'){assert.equal(typeof args.leaseId,'string');leases.delete(String(args.leaseId));if(held?.leaseId===args.leaseId)held=undefined;value=undefined;}
  else {assert.equal(leases.has(String(args.leaseId)),true,'No IPC work after native retirement');
   if(command==='managed_native_begin'){assert.equal(held,undefined);const route=structuredClone(args.route) as Record<string,unknown>;routes.push(route);held={id:transfer,leaseId:String(args.leaseId),route,length:Number(args.inputBytes),hash:String(args.inputSha256),input:new Uint8Array(0),reply:new Uint8Array(0),offset:0};value=transfer;}
   else {assert.ok(held);assert.equal(args.transferId,held.id);assert.equal(args.leaseId,held.leaseId);
    if(command==='managed_native_append'){assert.equal(args.offset,held.input.length);const chunk=new Uint8Array(Buffer.from(String(args.dataBase64),'base64'));assert.ok(chunk.length>0&&chunk.length<=65_536);assert.ok(held.input.length+chunk.length<=held.length);const joined=new Uint8Array(held.input.length+chunk.length);joined.set(held.input);joined.set(chunk,held.input.length);held.input=joined;value=joined.length;}
    else if(command==='managed_native_execute'){const request=held;assert.equal(request.input.length,request.length);assert.equal(sha(request.input),request.hash);effects.push(new Uint8Array(request.input));if(executeGate)await executeGate.promise;assert.equal(leases.has(request.leaseId),true,'Retired native execution refuses completion');request.reply=new Uint8Array(response);value={protocol:fault==='protocol'?'wrong':NATIVE_MANAGED_PROTOCOL,transferId:transfer,status,mediaType,byteLength:fault==='size'?MAX_MANAGED_REPLY_BYTES+1:request.reply.length,sha256:fault==='hash'?'0'.repeat(64):sha(request.reply)};}
    else if(command==='managed_native_read'){assert.equal(args.offset,held.offset);const offset=held.offset,bytes=held.reply.slice(offset,offset+65_536);held.offset+=bytes.length;value={offset:fault==='offset'?offset+1:offset,nextOffset:held.offset,dataBase64:Buffer.from(bytes).toString('base64'),done:held.offset===held.reply.length};if(held.offset===held.reply.length)held=undefined;}
    else assert.fail('No legacy/private native command is allowed');
   }
  }
  return value as T;
 }};
 const create=()=>follow(createNativeManagedNotebookPort({enabled,commands,accountId:profile,serverAccountId:actor,api,current:()=>active,currentApi:()=>currentApi}).then(binding=>{bindings.push(binding);return binding;}));
 const gate=(where:'capture'|'execute')=>{const g=deferred();gates.push(g);if(where==='capture')captureGate=g;else executeGate=g;return g;};
 t.after(async()=>{for(const g of gates)g.resolve();for(const b of bindings)follow(b.dispose());let timer:ReturnType<typeof setTimeout>|undefined;try{const done=await Promise.race([Promise.allSettled([...originals]).then(()=>true),new Promise<boolean>(yes=>{timer=setTimeout(()=>yes(false),6500);})]);if(!done||originals.size){fatal=true;throw Error('FATAL_STOP: original native port operation active; globals are not restored');}assert.deepEqual(timeouts,[],'Timeout never qualifies as an expected rejection');assert.equal(held,undefined,'No held byte response or incomplete request survives cleanup');assert.equal(leases.size,0,'Every created native lease is explicitly retired');}finally{clearTimeout(timer);if(timeouts.length)fatal=true;}});
 return {api,create,bounded,follow,calls,effects,routes,gate,captures:()=>apiCaptures,revoke:()=>{active=false;},reactivate:()=>{active=true;},replaceApi:()=>{currentApi=new ApiClient();},disabled:()=>{enabled=false;},response:(bytes:Uint8Array,type='application/octet-stream',code=200)=>{response=new Uint8Array(bytes);mediaType=type;status=code;},fault:(value:typeof fault)=>{fault=value;}};
}

test('Default disabled and already retired owners never bind API or invoke native commands',async t=>{
 const f=fixture(t);f.disabled();await assert.rejects(f.bounded(f.create(),'default disabled'),err('unavailable'));assert.equal(f.captures(),0);assert.deepEqual(f.calls,[]);
 const g=fixture(t);g.revoke();await assert.rejects(g.bounded(g.create(),'old owner'),err('authority-changed'));assert.equal(g.captures(),0);assert.deepEqual(g.calls,[]);
});
test('Native profile and remote actor remain distinct and every closed DTO carries only admitted identities',async t=>{
 const f=fixture(t),b=await f.bounded(f.create(),'capture'),s=b.port.capture(actor);assert.deepEqual(f.calls[0],{command:'managed_native_capture',args:{accountId:profile,expectedAccountId:actor}});
 assert.deepEqual(Object.keys(s).sort(),['actorAccountId','binary','current','json']);assert.equal(b.port.serverKey,NATIVE_MANAGED_ORIGIN);
 await f.bounded(s.json({kind:'proofs',identity:{accountId:actor,spaceId:'year',noteId:'École & same',canonicalDocumentId:'paper-note',metadataDocumentId:'note',lineage:'lineage/opaque'},maximum:65_536}),'proof');
 await f.bounded(s.json({kind:'state',ticket,maximum:65_536}),'state');
 assert.deepEqual(f.routes,[{kind:'proofs',spaceId:'year',noteId:'École & same',canonicalDocumentId:'paper-note',metadataDocumentId:'note',lineage:'lineage/opaque'},{kind:'state',resourceId:ticket.id,incarnation:ticket.incarnation,resourceVersion:4,accessVersion:5}]);
 assert.throws(()=>b.port.capture(other),err('invalid-response'));assert.equal(f.calls.some(v=>/server_request|blob_request/.test(v.command)),false);
});
test('Raw JSON request and response preserve UTF8 BOM whitespace escapes and use 64KiB ordered chunks',async t=>{
 const f=fixture(t),b=await f.bounded(f.create(),'capture'),s=b.port.capture(actor),raw=' {"value":"É📝","escape":"\\u0061","padding":"'+'x'.repeat(70_000)+'"}\r\n',reply='\ufeff { "exact": "é 📝", "escape":"\\u0061" }\r\n';
 f.response(new TextEncoder().encode(reply),'application/json');const out=await f.bounded(s.json({kind:'write',resourceId:ticket.id,key:'same-wire-key',body:raw,maximum:65_536}),'raw chunks');
 assert.equal(out.body,reply);assert.equal(sha(f.effects[0]),sha(raw));assert.deepEqual(f.effects[0],new TextEncoder().encode(raw));
 const chunks=f.calls.filter(c=>c.command==='managed_native_append');assert.equal(chunks.length,2);assert.equal(chunks[0].args.offset,0);assert.equal(chunks[1].args.offset,65_536);assert.ok(chunks.every(c=>String(c.args.dataBase64).length<=Math.ceil(65_536/3)*4));
 assert.deepEqual(f.routes[0],{kind:'write',resourceId:ticket.id,key:'same-wire-key'});
});
test('Lifecycle read trash and restore use only exact closed DTOs with the original raw UTF8 bytes',async t=>{
 const f=fixture(t),b=await f.bounded(f.create(),'lifecycle capture'),s=b.port.capture(actor);
 await f.bounded(s.json({kind:'lifecycle',resourceId:ticket.id,incarnation:ticket.incarnation,maximum:65_536}),'read lifecycle');
 const raw=' {"protocol":"dowze-managed-notebook-lifecycle\\u00401","incarnation":"'+ticket.incarnation+'","resource_version":4,"writer_version":4,"canonical_version":8,"metadata_version":9}\r\n';
 const reply=' { "state": "trashed", "escaped": "\\u0061" }\r\n';f.response(new TextEncoder().encode(reply),'application/json');
 const trash=await f.bounded(s.json({kind:'trash',resourceId:ticket.id,key:'same-trash-operation',body:raw,maximum:65_536}),'trash raw lifecycle');
 assert.equal(trash.body,reply);assert.deepEqual(f.effects[0],new Uint8Array(0));assert.deepEqual(f.effects[1],new TextEncoder().encode(raw));
 const exactCap=raw.padEnd(4096,' ');await f.bounded(s.json({kind:'restore',resourceId:ticket.id,key:'same-restore-operation',body:exactCap,maximum:65_536}),'restore raw lifecycle at cap');
 assert.deepEqual(f.effects[2],new TextEncoder().encode(exactCap));
 assert.deepEqual(f.routes,[{kind:'lifecycle',resourceId:ticket.id,incarnation:ticket.incarnation},{kind:'trash',resourceId:ticket.id,key:'same-trash-operation'},{kind:'restore',resourceId:ticket.id,key:'same-restore-operation'}]);
 assert.equal(f.calls.some(v=>/server_request|server_blob_request/.test(v.command)),false);
});
test('Lifecycle invalid identities keys UTF8 byte caps and reply caps are refused before a native transfer',async t=>{
 const f=fixture(t),b=await f.bounded(f.create(),'lifecycle validation capture'),s=b.port.capture(actor);
 assert.throws(()=>s.json({kind:'lifecycle',resourceId:'../spaces',incarnation:ticket.incarnation,maximum:65_536}),err('invalid-response'));
 assert.throws(()=>s.json({kind:'lifecycle',resourceId:ticket.id,incarnation:'wrong',maximum:65_536}),err('invalid-response'));
 assert.throws(()=>s.json({kind:'lifecycle',resourceId:ticket.id,incarnation:ticket.incarnation,maximum:65_537}),err('invalid-response'));
 for(const kind of ['trash','restore']as const){
  assert.throws(()=>s.json({kind,resourceId:ticket.id,key:'',body:'{}',maximum:65_536}),err('invalid-response'));
  assert.throws(()=>s.json({kind,resourceId:ticket.id,key:'operation',body:'',maximum:65_536}),err('invalid-response'));
  assert.throws(()=>s.json({kind,resourceId:ticket.id,key:'operation',body:' '.repeat(4097),maximum:65_536}),err('invalid-response'));
  assert.throws(()=>s.json({kind,resourceId:ticket.id,key:'operation',body:' '.repeat(4095)+'é',maximum:65_536}),err('invalid-response'));
  assert.throws(()=>s.json({kind,resourceId:ticket.id,key:'operation',body:'\ud800',maximum:65_536}),err('invalid-response'));
  assert.throws(()=>s.json({kind,resourceId:ticket.id,key:'operation',body:'{}',maximum:65_537}),err('invalid-response'));
 }
 assert.equal(f.calls.length,1,'Invalid lifecycle DTOs never enter managed_native_begin');assert.equal(s.current(),true);
});
test('Binary upload and download retain bytes and SHA with chunked IPC in both directions',async t=>{
 const f=fixture(t),b=await f.bounded(f.create(),'capture'),s=b.port.capture(actor),bytes=new Uint8Array(140_000);for(let i=0;i<bytes.length;i++)bytes[i]=(i*31)%256;
 f.response(new TextEncoder().encode('{"ok":true}'),'application/json',201);await f.bounded(s.binary({kind:'upload',ticket,key:'blob-key',blob:new Blob([bytes],{type:'image/png'}),sha256:sha(bytes),maximum:65_536}),'upload');
 assert.deepEqual(f.effects[0],bytes);assert.deepEqual(f.routes[0],{kind:'upload',resourceId:ticket.id,incarnation:ticket.incarnation,resourceVersion:4,writerVersion:7,key:'blob-key',mediaType:'image/png',sha256:sha(bytes)});
 f.response(bytes,'image/png');const out=await f.bounded(s.binary({kind:'resourceBlob',ticket,canonicalVersion:8,metadataVersion:9,blob:{id:'40000000-0000-4000-8000-000000000001',media_type:'image/png',size:bytes.length,sha256:sha(bytes)},maximum:bytes.length}),'download');
 assert.deepEqual(out.body,bytes);assert.equal(out.mediaType,'image/png');assert.equal(f.calls.filter(c=>c.command==='managed_native_read').length,4,'One upload reply and three exact download chunks');
});
test('Malformed UTF16 foreign proof and oversized replies cannot escape validation or keep a held transfer',async t=>{
 const f=fixture(t),b=await f.bounded(f.create(),'capture'),s=b.port.capture(actor);assert.throws(()=>s.json({kind:'write',resourceId:ticket.id,key:'key',body:'\ud800',maximum:65_536}),err('invalid-response'));
 assert.throws(()=>s.json({kind:'proofs',identity:{accountId:other,spaceId:'year',noteId:'note',canonicalDocumentId:'paper',metadataDocumentId:'note',lineage:'lineage'},maximum:65_536}),err('invalid-response'));
 assert.equal(f.calls.length,1,'No transfer admitted for an invalid source');f.fault('size');await assert.rejects(f.bounded(s.json({kind:'capabilities',maximum:65_536}),'reply cap'),err('invalid-response'));assert.equal(s.current(),false);assert.equal(f.calls.at(-1)?.command,'managed_native_retire');
});
test('Cursor protocol SHA and UTF8 refusals remain distinct real failures with no legacy fallback',async t=>{
 for(const fault of ['offset','hash','protocol']as const){const f=fixture(t),b=await f.bounded(f.create(),'capture '+fault),s=b.port.capture(actor);f.fault(fault);await assert.rejects(f.bounded(s.json({kind:'capabilities',maximum:65_536}),'bad '+fault),err('invalid-response'));assert.equal(s.current(),false);await f.bounded(b.dispose(),'dispose '+fault);assert.equal(f.calls.some(c=>c.command.startsWith('server_')),false);}
 const f=fixture(t),b=await f.bounded(f.create(),'invalid UTF8 capture'),s=b.port.capture(actor);f.response(new Uint8Array([0xc3,0x28]),'application/json');await assert.rejects(f.bounded(s.json({kind:'capabilities',maximum:65_536}),'invalid UTF8'),err('invalid-response'));
});
test('API internal A B A and owner false true never reactivate an old session; fresh binding is explicit',async t=>{
 const f=fixture(t),b=await f.bounded(f.create(),'capture'),s=b.port.capture(actor),old=s.json.bind(s);f.api.forgetSession();f.api.bindAccount(other);f.api.forgetSession();f.api.bindAccount(actor);assert.equal(s.current(),false);const count=f.calls.length;assert.throws(()=>old({kind:'capabilities',maximum:65_536}),err('authority-changed'));assert.equal(f.calls.length,count);assert.equal(f.captures(),1);const fresh=await f.bounded(f.create(),'fresh explicit binding');await f.bounded(b.dispose(),'old binding retire');const session=fresh.port.capture(actor);await f.bounded(session.json({kind:'capabilities',maximum:65_536}),'fresh after old retire');assert.equal(f.captures(),2);
 const g=fixture(t),ownerBinding=await g.bounded(g.create(),'owner capture'),source=ownerBinding.port.capture(actor);g.revoke();assert.equal(source.current(),false);g.reactivate();assert.equal(source.current(),false);assert.throws(()=>source.json({kind:'capabilities',maximum:65_536}),err('authority-changed'));
 const h=fixture(t),apiBinding=await h.bounded(h.create(),'API object capture'),oldApiSession=apiBinding.port.capture(actor);h.replaceApi();assert.equal(oldApiSession.current(),false);const before=h.calls.length;assert.throws(()=>oldApiSession.json({kind:'capabilities',maximum:65_536}),err('authority-changed'));assert.equal(h.calls.length,before);assert.equal(h.captures(),1);
});
test('Retirement during native capture and execution joins original promises and returns no late payload',async t=>{
 const f=fixture(t),gate=f.gate('capture'),pending=f.bounded(f.create(),'held capture');f.revoke();gate.resolve();await assert.rejects(pending,err('authority-changed'));assert.equal(f.calls.at(-1)?.command,'managed_native_retire');
 const g=fixture(t),b=await g.bounded(g.create(),'capture execution'),s=b.port.capture(actor),hold=g.gate('execute');const original=g.bounded(s.json({kind:'capabilities',maximum:65_536}),'held execution');
 // Wait for the actual command to enter its explicit seam, never a guessed delay.
 let attempts=0;while(!g.calls.some(c=>c.command==='managed_native_execute')){if(++attempts>100)assert.fail('Execution did not enter the held IPC seam');await new Promise<void>(yes=>setImmediate(yes));}
 const disposal=g.bounded(b.dispose(),'dispose held');assert.equal(s.current(),false);hold.resolve();await assert.rejects(original);await disposal;assert.equal(g.calls.filter(c=>c.command==='managed_native_read').length,0);
});
