/** Experimental closed raw native port. Opt-in is deliberately false by default.
 * Local profile, remote actor and ApiClient authority are distinct. This factory
 * never uses the older native JSON Fetch bridge or changes a saved link. */
import type {ApiClient} from '../../pwa/src/api.ts';
import {ManagedClientError,MAX_MANAGED_REPLY_BYTES,managedUuid,validManagedIdentity,validManagedTicket,type ManagedNotebookPort,type ManagedJsonRequest,type ManagedBinaryRequest} from '../../pwa/src/managedNotebookClient.ts';
import {MAX_MANAGED_PACKET_BYTES} from '../../pwa/src/managedNotebookProtocol.ts';
import {decodeManagedApiUtf8} from '../../pwa/src/managedNotebookApiPort.ts';

export const NATIVE_MANAGED_PROTOCOL='dowze-native-managed-raw@1';
export const NATIVE_MANAGED_ORIGIN='https://academie.dowze.ch';
const CHUNK=64*1024,MAX_BLOB=32*1024*1024,MAX_LIFECYCLE_BODY=4096;
type Command='managed_native_capture'|'managed_native_begin'|'managed_native_append'|'managed_native_execute'|'managed_native_read'|'managed_native_retire';
export interface NativeManagedCommands {invoke<T>(command:Command,args:Readonly<Record<string,unknown>>):Promise<T>}
export interface NativeManagedPortOptions {
 readonly enabled?:boolean;readonly commands:NativeManagedCommands;
 readonly accountId:string;readonly serverAccountId:string;
 readonly api:ApiClient;readonly current:()=>boolean;readonly currentApi?:()=>ApiClient;
}
export interface NativeManagedPortBinding {readonly port:ManagedNotebookPort;dispose():Promise<void>}
type Route=Readonly<Record<string,unknown>>;
interface Capture {protocol:string;leaseId:string;actorAccountId:string;origin:string;chunkBytes:number;maxBodyBytes:number;maxReplyBytes:number}
interface Reply {protocol:string;transferId:string;status:number;mediaType:string;byteLength:number;sha256:string}
interface Chunk {offset:number;nextOffset:number;dataBase64:string;done:boolean}
const invalid=()=>new ManagedClientError('invalid-response','Le transport natif brut a refusé une réponse ou une séquence incompatible.');
const changed=()=>new ManagedClientError('authority-changed','La source ou la session native du carnet partagé a changé.');
const hex=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const opaque=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{48}$/.test(v);
const key=(v:unknown):v is string=>typeof v==='string'&&/^[\x21-\x7e]{1,128}$/.test(v);
const version=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>0;
function maximum(value:number){if(!Number.isSafeInteger(value)||value<0||value>MAX_MANAGED_REPLY_BYTES)throw invalid();return value;}
function utf8(raw:string,cap:number){
 if(typeof raw!=='string'||raw.length>cap)throw invalid();
 for(let i=0;i<raw.length;i++){const c=raw.charCodeAt(i);if(c>=0xd800&&c<=0xdbff){const d=raw.charCodeAt(++i);if(!(d>=0xdc00&&d<=0xdfff))throw invalid();}else if(c>=0xdc00&&c<=0xdfff)throw invalid();}
 const bytes=new TextEncoder().encode(raw);if(bytes.length>cap)throw invalid();return bytes;
}
function encode(bytes:Uint8Array){let s='';for(const n of bytes)s+=String.fromCharCode(n);return btoa(s);}
function decode(raw:string){if(typeof raw!=='string'||raw.length>Math.ceil(CHUNK/3)*4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(raw))throw invalid();let s:string;try{s=atob(raw);}catch{throw invalid();}if(s.length>CHUNK)throw invalid();const out=new Uint8Array(s.length);for(let i=0;i<s.length;i++)out[i]=s.charCodeAt(i);if(encode(out)!==raw)throw invalid();return out;}
async function digest(bytes:Uint8Array<ArrayBuffer>,check:()=>void){check();const hash=await crypto.subtle.digest('SHA-256',bytes);check();return Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');}
function jsonRoute(input:ManagedJsonRequest,actor:string):{route:Route;bytes:Uint8Array<ArrayBuffer>;maximum:number}{
 const max=maximum(input.maximum);if(max<2)throw invalid();let route:Route,bytes=new Uint8Array(0);
 switch(input.kind){
  case 'capabilities':if(max>65_536)throw invalid();route={kind:input.kind};break;
  case 'proofs':{const id={...input.identity};if(!validManagedIdentity(id)||id.accountId!==actor)throw invalid();route={kind:input.kind,spaceId:id.spaceId,noteId:id.noteId,canonicalDocumentId:id.canonicalDocumentId,metadataDocumentId:id.metadataDocumentId,lineage:id.lineage};break;}
  case 'admission':case 'write':if(!managedUuid(input.resourceId)||!key(input.key)||max>65_536)throw invalid();route={kind:input.kind,resourceId:input.resourceId,key:input.key};bytes=utf8(input.body,input.kind==='admission'?65_536:MAX_MANAGED_PACKET_BYTES);if(!bytes.length)throw invalid();break;
  case 'state':{const t={...input.ticket};if(!validManagedTicket(t))throw invalid();route={kind:input.kind,resourceId:t.id,incarnation:t.incarnation,resourceVersion:t.resource_version,accessVersion:t.access_version};break;}
  case 'lifecycle':if(!managedUuid(input.resourceId)||!managedUuid(input.incarnation)||max>65_536)throw invalid();route={kind:input.kind,resourceId:input.resourceId,incarnation:input.incarnation};break;
  case 'trash':case 'restore':if(!managedUuid(input.resourceId)||!key(input.key)||max>65_536)throw invalid();route={kind:input.kind,resourceId:input.resourceId,key:input.key};bytes=utf8(input.body,MAX_LIFECYCLE_BODY);if(!bytes.length)throw invalid();break;
  default:throw invalid();
 }
 return {route:Object.freeze(route),bytes,maximum:max};
}
async function binaryRoute(input:ManagedBinaryRequest,check:()=>void){
 const max=maximum(input.maximum),t=structuredClone(input.ticket);if(!validManagedTicket(t))throw invalid();check();
 switch(input.kind){
  case 'upload':{const k=input.key,sha=input.sha256,blob=input.blob;if(!key(k)||!hex(sha)||!(blob instanceof Blob)||blob.size>MAX_BLOB||max>65_536)throw invalid();const copy=blob.slice(0,blob.size,blob.type),bytes=new Uint8Array(await copy.arrayBuffer());check();return {route:Object.freeze({kind:'upload',resourceId:t.id,incarnation:t.incarnation,resourceVersion:t.resource_version,writerVersion:t.writer_version,key:k,mediaType:copy.type,sha256:sha}),bytes,maximum:max};}
  case 'resourceBlob':{const b={...input.blob},cv=input.canonicalVersion,mv=input.metadataVersion;if(!version(cv)||!version(mv)||!managedUuid(b.id)||!hex(b.sha256)||!Number.isSafeInteger(b.size)||b.size<0||b.size>MAX_BLOB||max!==b.size)throw invalid();return {route:Object.freeze({kind:input.kind,resourceId:t.id,incarnation:t.incarnation,resourceVersion:t.resource_version,accessVersion:t.access_version,canonicalVersion:cv,metadataVersion:mv,blobId:b.id,size:b.size,sha256:b.sha256}),bytes:new Uint8Array(0),maximum:max};}
  default:throw invalid();
 }
}
/** Do not opt in until this Rust candidate has actually compiled and passed the
 * native account/keyring/HTTP recipe. Every created binding must be disposed. */
export async function createNativeManagedNotebookPort(input:NativeManagedPortOptions):Promise<NativeManagedPortBinding>{
 const api=input.api,view=input.current,getApi=input.currentApi??(()=>api),local=input.accountId,actor=input.serverAccountId;
 const invoke=input.commands.invoke.bind(input.commands);let retired=false,requestBusy=false,apiCurrent:(()=>boolean)|undefined,leaseId:string|undefined,tail:Promise<unknown>=Promise.resolve(),disposeTask:Promise<void>|undefined;
 const current=()=>{try{if(view()!==true||getApi()!==api||apiCurrent&&apiCurrent()!==true)retired=true;}catch{retired=true;}return !retired;};
 const check=()=>{if(!current())throw changed();};
 check();if(input.enabled!==true)throw new ManagedClientError('unavailable','Le transport brut natif reste désactivé jusqu’à sa validation native.');
 if(!local||local.length>200||!managedUuid(actor))throw invalid();check();apiCurrent=api.captureSessionAuthority(actor);check();
 const retireNative=async()=>{if(leaseId)await invoke<void>('managed_native_retire',{leaseId});};
 try{
  const captured=await invoke<Capture>('managed_native_capture',{accountId:local,expectedAccountId:actor});
  if(opaque(captured?.leaseId))leaseId=captured.leaseId;
  check();if(!leaseId||captured.protocol!==NATIVE_MANAGED_PROTOCOL||captured.actorAccountId!==actor||captured.origin!==NATIVE_MANAGED_ORIGIN||captured.chunkBytes!==CHUNK||captured.maxBodyBytes!==MAX_MANAGED_PACKET_BYTES||captured.maxReplyBytes!==MAX_MANAGED_REPLY_BYTES)throw invalid();
 }catch(error){retired=true;try{await retireNative();}catch(cleanup){throw new AggregateError([error,cleanup],'La capture native a échoué et sa révocation doit être réessayée.');}throw error;}
 const dispose=()=>{if(!disposeTask){retired=true;const revoke=retireNative();disposeTask=(async()=>{const [result]=await Promise.allSettled([revoke,tail]);if(result.status==='rejected')throw result.reason;})();}return disposeTask;};
 const transfer=async(wire:{route:Route;bytes:Uint8Array<ArrayBuffer>;maximum:number})=>{
  check();const inputSha256=await digest(wire.bytes,check);check();
  const transferId=await invoke<string>('managed_native_begin',{leaseId,route:wire.route,inputBytes:wire.bytes.byteLength,inputSha256,maximumReply:wire.maximum});check();if(!opaque(transferId))throw invalid();
  for(let offset=0;offset<wire.bytes.length;offset+=CHUNK){check();const chunk=wire.bytes.subarray(offset,offset+CHUNK);const next=await invoke<number>('managed_native_append',{leaseId,transferId,offset,dataBase64:encode(chunk)});check();if(next!==offset+chunk.length)throw invalid();}
  const reply=await invoke<Reply>('managed_native_execute',{leaseId,transferId});check();
  const cap=reply?.status>=200&&reply.status<300?wire.maximum:Math.min(wire.maximum,65_536);
  if(!reply||reply.protocol!==NATIVE_MANAGED_PROTOCOL||reply.transferId!==transferId||!Number.isInteger(reply.status)||reply.status<100||reply.status>599||typeof reply.mediaType!=='string'||reply.mediaType.length>128||!Number.isSafeInteger(reply.byteLength)||reply.byteLength<0||reply.byteLength>cap||!hex(reply.sha256))throw invalid();
  const body=new Uint8Array(reply.byteLength);let offset=0;
  for(;;){check();const chunk=await invoke<Chunk>('managed_native_read',{leaseId,transferId,offset});check();if(!chunk||chunk.offset!==offset||typeof chunk.done!=='boolean')throw invalid();const bytes=decode(chunk.dataBase64);if(bytes.length>body.length-offset||chunk.nextOffset!==offset+bytes.length||!chunk.done&&bytes.length===0||chunk.done!==(offset+bytes.length===body.length))throw invalid();body.set(bytes,offset);offset+=bytes.length;if(chunk.done)break;}
  if(await digest(body,check)!==reply.sha256)throw invalid();check();return {status:reply.status,body,mediaType:reply.mediaType};
 };
 // Capture the complete request before it joins the queue. Queued work keeps
 // this same lease and never looks up a new source after an earlier await.
 const queued=<T>(prepare:()=>Promise<{route:Route;bytes:Uint8Array<ArrayBuffer>;maximum:number}>|{route:Route;bytes:Uint8Array<ArrayBuffer>;maximum:number},finish:(r:Awaited<ReturnType<typeof transfer>>)=>T):Promise<T>=>{
  check();if(requestBusy)throw new ManagedClientError('unavailable','Un transfert natif attend sa fin avant une nouvelle lecture.');requestBusy=true;
  let prepared:Promise<{route:Route;bytes:Uint8Array<ArrayBuffer>;maximum:number}>;try{prepared=Promise.resolve(prepare());}catch(error){requestBusy=false;throw error;}void prepared.catch(()=>{});
  const work=tail.then(async()=>{const wire=await prepared;check();return finish(await transfer(wire));});
  const guarded=work.catch(async error=>{retired=true;try{await retireNative();}catch(cleanup){throw new AggregateError([error,cleanup],'Le transfert natif a échoué et sa révocation doit être réessayée.');}throw error;}).finally(()=>{requestBusy=false;});
  tail=guarded.catch(()=>{});return guarded;
 };
 const port:ManagedNotebookPort=Object.freeze({serverKey:NATIVE_MANAGED_ORIGIN,capture(account:string){check();if(account!==actor)throw invalid();return Object.freeze({actorAccountId:actor,current,
  json(request:ManagedJsonRequest){check();return queued(()=>jsonRoute(request,actor),r=>({status:r.status,body:decodeManagedApiUtf8(r.body)}));},
  binary(request:ManagedBinaryRequest){check();return queued(()=>binaryRoute(request,check),r=>r);},
 });}});
 return Object.freeze({port,dispose});
}
