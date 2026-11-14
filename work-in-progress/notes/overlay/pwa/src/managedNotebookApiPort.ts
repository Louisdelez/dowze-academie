/** PWA Fetch bridge for the closed stage5b + stage6 routes. No private route or native
 * JSON bridge is a substitute for this byte-preserving transport. */
import {ManagedClientError,MAX_MANAGED_REPLY_BYTES,managedUuid,validManagedIdentity,validManagedTicket,type ManagedNotebookPort,type ManagedPortSession,type ManagedJsonRequest,type ManagedBinaryRequest} from './managedNotebookClient.ts';
import {validManagedCollectionQuery,MAX_MANAGED_COLLECTION_REPLY} from './managedNotebookCollection.ts';
import {MAX_MANAGED_PACKET_BYTES} from './managedNotebookProtocol.ts';

export interface ManagedApiWireRequest {
 readonly path:string;readonly method:'GET'|'PUT'|'POST';
 readonly headers:Readonly<Record<string,string>>;readonly body?:string|Blob;
 readonly maximum:number;
}
export interface ManagedApiWireReply {readonly status:number;readonly body:Uint8Array<ArrayBuffer>;readonly mediaType:string}
/** The authority callback is supplied from inside ApiClient. It never returns
 * a CSRF token, cookie, generic fetch function or mutable session object. */
export interface ManagedApiAuthority {
 readonly actorAccountId:string;current():boolean;
 send(request:ManagedApiWireRequest):Promise<ManagedApiWireReply>;
}
const invalid=()=>new ManagedClientError('invalid-response','Le transport partagé a refusé une identité ou une réponse incompatible.');
const maxReply=(value:number)=>{if(!Number.isSafeInteger(value)||value<0||value>MAX_MANAGED_REPLY_BYTES)throw invalid();return value;};
const version=(value:unknown):value is number=>Number.isSafeInteger(value)&&Number(value)>=1;
const key=(value:unknown):value is string=>typeof value==='string'&&/^[\x21-\x7e]{1,128}$/.test(value);
const hash=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const guard=(current:()=>boolean)=>{if(current()!==true)throw new ManagedClientError('authority-changed','La session ou la source du carnet partagé a changé.');};
function rawBody(value:string,maximum=MAX_MANAGED_PACKET_BYTES){
 if(typeof value!=='string'||value.length>maximum)throw invalid();
 for(let i=0;i<value.length;i++){const n=value.charCodeAt(i);if(n>=0xd800&&n<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))throw invalid();}else if(n>=0xdc00&&n<=0xdfff)throw invalid();}
 if(new TextEncoder().encode(value).byteLength>maximum)throw invalid();
 return value;
}
const query=(values:Record<string,string|number>)=>new URLSearchParams(Object.entries(values).map(([name,value])=>[name,String(value)])).toString();
const resource=(id:string)=>{if(!managedUuid(id))throw invalid();return '/v1/notebooks/'+encodeURIComponent(id);};
function jsonRequest(input:ManagedJsonRequest):ManagedApiWireRequest {
 const maximum=maxReply(input.maximum);if(maximum<2)throw invalid();
 switch(input.kind){
  case 'collection':{const q=input.query;if(!validManagedCollectionQuery(q)||maximum!==MAX_MANAGED_COLLECTION_REPLY)throw invalid();return {path:'/v1/notebooks/collection?'+query({view:q.view,space_id:q.spaceId,limit:q.limit,...(q.ownerAccountId===null?{}:{owner_account_id:q.ownerAccountId}),...(q.cursor?{cursor:q.cursor}:{})}),method:'GET',headers:{},maximum};}
  case 'capabilities':return {path:'/v1/notebooks/capabilities',method:'GET',headers:{},maximum};
  case 'proofs':{const id=input.identity;if(!validManagedIdentity(id))throw invalid();return {path:'/v1/notebook-admission-proofs?'+query({space_id:id.spaceId,note_id:id.noteId,canonical_document_id:id.canonicalDocumentId,metadata_document_id:id.metadataDocumentId,lineage:id.lineage}),method:'GET',headers:{},maximum};}
  case 'admission':case 'write':if(!key(input.key))throw invalid();return {path:resource(input.resourceId)+(input.kind==='admission'?'/admission':'/state-v2'),method:'PUT',headers:{'Content-Type':'application/json','X-Idempotency-Key':input.key},body:rawBody(input.body,input.kind==='admission'?65_536:MAX_MANAGED_PACKET_BYTES),maximum};
  case 'lifecycle':if(!managedUuid(input.incarnation)||maximum>65_536)throw invalid();return {path:resource(input.resourceId)+'/lifecycle?'+query({incarnation:input.incarnation}),method:'GET',headers:{},maximum};
  case 'trash':case 'restore':if(!key(input.key)||!input.body||maximum>65_536)throw invalid();return {path:resource(input.resourceId)+'/'+input.kind,method:'POST',headers:{'Content-Type':'application/json','X-Idempotency-Key':input.key},body:rawBody(input.body,4096),maximum};
  case 'state':{const t=input.ticket;if(!validManagedTicket(t))throw invalid();return {path:resource(t.id)+'/state?'+query({incarnation:t.incarnation,resource_version:t.resource_version,access_version:t.access_version}),method:'GET',headers:{},maximum};}
  default:throw invalid();
 }
}
function binaryRequest(input:ManagedBinaryRequest):ManagedApiWireRequest {
 const maximum=maxReply(input.maximum),t=input.ticket;if(!validManagedTicket(t))throw invalid();
 switch(input.kind){
  case 'upload':if(!key(input.key)||!hash(input.sha256)||!(input.blob instanceof Blob)||input.blob.size>32*1024*1024)throw invalid();return {path:resource(t.id)+'/blobs?'+query({incarnation:t.incarnation,resource_version:t.resource_version,writer_version:t.writer_version}),method:'POST',headers:{'Content-Type':input.blob.type,'X-Content-SHA256':input.sha256,'X-Idempotency-Key':input.key},body:input.blob.slice(0,input.blob.size,input.blob.type),maximum};
  case 'resourceBlob':{const b=input.blob;if(!version(input.canonicalVersion)||!version(input.metadataVersion)||!managedUuid(b?.id)||!hash(b.sha256)||!Number.isSafeInteger(b.size)||b.size<0||b.size>32*1024*1024||maximum!==b.size)throw invalid();return {path:resource(t.id)+'/blobs/'+encodeURIComponent(b.id)+'?'+query({incarnation:t.incarnation,resource_version:t.resource_version,access_version:t.access_version,canonical_version:input.canonicalVersion,metadata_version:input.metadataVersion}),method:'GET',headers:{},maximum};}
  default:throw invalid();
 }
}

/** Byte cap is enforced while reading, before a complete response is allocated.
 * No response.json/text/arrayBuffer shortcut, even for error or CSRF responses. */
export async function readManagedApiReply(response:Response,maximum:number,current:()=>boolean):Promise<ManagedApiWireReply>{
 maxReply(maximum);guard(current);let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
 try{
  const length=response.headers.get('content-length');
  if(length!==null&&(!/^\d+$/.test(length)||!Number.isSafeInteger(Number(length))||Number(length)>maximum))throw invalid();
  const status=response.status,contentType=(response.headers.get('content-type')??'').trim().toLowerCase(),mediaType=contentType.startsWith('audio/')?contentType:contentType.split(';',1)[0].trim();
  if(!response.body)return {status,body:new Uint8Array(0),mediaType};
  reader=response.body.getReader();const chunks:Uint8Array<ArrayBuffer>[]=[];let size=0;
  for(;;){guard(current);const next=await reader.read();guard(current);if(next.done)break;if(!(next.value instanceof Uint8Array)||next.value.byteLength>maximum-size)throw invalid();size+=next.value.byteLength;chunks.push(new Uint8Array(next.value));}
  guard(current);const body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
  guard(current);return {status,body,mediaType};
 }catch(error){guard(current);throw error;}
 finally{try{if(reader)await reader.cancel();else if(response.body&&!response.body.locked)await response.body.cancel();}finally{reader?.releaseLock();guard(current);}}
}
export function decodeManagedApiUtf8(bytes:Uint8Array):string{try{return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{throw invalid();}}

export function createManagedNotebookFetchPort(input:{serverKey:string;capture:(actorAccountId:string)=>ManagedApiAuthority}):ManagedNotebookPort{
 const serverKey=input.serverKey,capture=input.capture;
 return Object.freeze({serverKey,capture(actorAccountId:string):ManagedPortSession{
  if(!managedUuid(actorAccountId))throw invalid();const authority=capture(actorAccountId),heldActor=authority.actorAccountId,current=authority.current.bind(authority),send=authority.send.bind(authority);
  guard(current);if(heldActor!==actorAccountId)throw invalid();
  return Object.freeze({actorAccountId:heldActor,current,
   async json(request:ManagedJsonRequest){guard(current);const wire=jsonRequest(request);if(request.kind==='proofs'&&request.identity.accountId!==heldActor)throw invalid();Object.freeze(wire.headers);Object.freeze(wire);guard(current);const reply=await send(wire);guard(current);return {status:reply.status,body:decodeManagedApiUtf8(reply.body)};},
   async binary(request:ManagedBinaryRequest){guard(current);const wire=binaryRequest(request);Object.freeze(wire.headers);Object.freeze(wire);guard(current);const reply=await send(wire);guard(current);return {status:reply.status,body:reply.body,mediaType:reply.mediaType};},
  });
 }});
}
