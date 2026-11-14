/** Existing gzip/metadata-v1 projections. Only immutable original compressed
 * bytes are retained; no private network access is possible during replay. */
import {decodePaperSync} from '../../src/lib/paperSync.ts';
import {isPaperDocument,type PaperDocument} from '../../src/lib/notebookDocument.ts';
import {hasPaperCollaboration,verifyPaperCollaboration} from '../../src/lib/paperCollaboration.ts';
import {projectNotebookMetadata} from '../../src/lib/notebookMetadataProjection.ts';
import {MAX_MANAGED_SOURCE_BYTES,parseManagedSourceJson,verifyManagedWireSource} from './managedNotebookProtocol.ts';
import {ManagedClientError,assertManagedCurrent,managedCurrent,managedSha256,freezeManaged,type ManagedPairProof} from './managedNotebookClient.ts';
import type {ManagedStoreIdentity} from './managedNotebookStore.ts';

export interface ManagedProjectionBody {readonly id:string;readonly blob:Blob}
export interface ManagedAdmissionSource {readonly proof:ManagedPairProof;readonly body?:ManagedProjectionBody}
export interface ManagedAdmissionProjection {
 readonly schema:1;readonly kind:'managed-notebook-source-projection';
 readonly canonical:{readonly version:number;readonly sha256:string};
 readonly metadata:{readonly version:number;readonly sha256:string};
 /** Exact immutable bytes encoded for synchronous transaction CAS. Blob JSON
  * would be `{}` and could not prove a replaced compressed body at commit. */
 readonly body?:{readonly id:string;readonly mediaType:'application/octet-stream';readonly base64:string};
}
const invalid=()=>new ManagedClientError('invalid-response','Le corps original ou son identité ne prouve pas cette note. Il reste conservé sans admission.');
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const MAX_COMPRESSED=16*1024*1024;
function encode(bytes:Uint8Array){let raw='';for(let at=0;at<bytes.length;at+=32768)raw+=String.fromCharCode(...bytes.subarray(at,at+32768));return btoa(raw);}
function decode(value:string){if(typeof value!=='string'||!value.length||value.length>4*Math.ceil(MAX_COMPRESSED/3)||value.length%4||/[^A-Za-z0-9+/=]/.test(value))throw invalid();let raw:string;try{raw=atob(value);}catch{throw invalid();}const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));if(!bytes.length||bytes.length>MAX_COMPRESSED||encode(bytes)!==value)throw invalid();return bytes;}
export async function projectManagedSources(identityInput:ManagedStoreIdentity,sourceInput:ManagedAdmissionSource,currentInput:()=>boolean):Promise<{readonly canonical:PaperDocument;readonly metadata:Readonly<Record<string,unknown>>;readonly projection:ManagedAdmissionProjection}> {
 const identity=structuredClone(identityInput),source=structuredClone(sourceInput),current=managedCurrent(currentInput);assertManagedCurrent(current);
 if(source.proof.actorAccountId!==identity.accountId||!same(source.proof.identity,identity))throw invalid();
 for(const name of ['canonical','metadata']as const){const p=source.proof[name];if(!Number.isSafeInteger(p.version)||p.version<1)throw invalid();await verifyManagedWireSource({source_json:p.source_json,sha256:p.sha256},current,MAX_MANAGED_SOURCE_BYTES);assertManagedCurrent(current);}
 const raw=parseManagedSourceJson(source.proof.canonical.source_json),metadata=projectNotebookMetadata(identity,parseManagedSourceJson(source.proof.metadata.source_json));if(!metadata)throw invalid();
 let canonical:unknown=raw,bodyProof:ManagedAdmissionProjection['body'];
 if(object(raw)&&raw.notebookEnvelope===3){
  const body=source.body;if(!body||body.id!==raw.body_id||!(body.blob instanceof Blob)||body.blob.type!=='application/octet-stream'||body.blob.size<1||body.blob.size>MAX_COMPRESSED)throw invalid();
  canonical=await decodePaperSync({downloadBlob:async(space,id)=>{assertManagedCurrent(current);if(space!==identity.spaceId||id!==body.id)throw invalid();return body.blob;}},identity.spaceId,raw,current);assertManagedCurrent(current);
  const bytes=new Uint8Array(await body.blob.arrayBuffer());assertManagedCurrent(current);if(await managedSha256(bytes,current)!==raw.body_sha256)throw invalid();bodyProof={id:body.id,mediaType:'application/octet-stream',base64:encode(bytes)};
 }else if(source.body!==undefined)throw invalid();
 if(!isPaperDocument(canonical)||canonical.noteId!==identity.noteId||!hasPaperCollaboration(canonical)||canonical.collaboration!.lineage!==identity.lineage)throw invalid();verifyPaperCollaboration(canonical);assertManagedCurrent(current);
 const projection:ManagedAdmissionProjection={schema:1,kind:'managed-notebook-source-projection',canonical:{version:source.proof.canonical.version,sha256:source.proof.canonical.sha256},metadata:{version:source.proof.metadata.version,sha256:source.proof.metadata.sha256},...(bodyProof?{body:bodyProof}:{})};
 return freezeManaged({canonical,metadata,projection});
}
export async function replayManagedProjection(identity:ManagedStoreIdentity,proof:ManagedPairProof,projectionInput:ManagedAdmissionProjection,current:()=>boolean){
 const projection=structuredClone(projectionInput);assertManagedCurrent(current);
 if(projection?.schema!==1||projection.kind!=='managed-notebook-source-projection'||!same(projection.canonical,{version:proof.canonical.version,sha256:proof.canonical.sha256})||!same(projection.metadata,{version:proof.metadata.version,sha256:proof.metadata.sha256}))throw invalid();
 const body=projection.body;if(body&&(body.mediaType!=='application/octet-stream'||typeof body.id!=='string'))throw invalid();
 return projectManagedSources(identity,{proof,...(body?{body:{id:body.id,blob:new Blob([decode(body.base64)],{type:body.mediaType})}}:{})},current);
}
