import {gzipSync,Gunzip,strToU8,strFromU8} from 'fflate';
import type {ApiClient} from '../../pwa/src/api';
import {isPaperDocument} from './notebookDocument';
const MAX_BODY=16*1024*1024;
export const MAX_NOTE_BLOB_REFERENCES=1000;
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
/** Large pages and ink travel as a compressed private blob, not oversized metadata JSON. */
export async function encodePaperSync(api:ApiClient,spaceId:string,content:unknown,mutationId:string,current:()=>boolean=()=>true,sourceCheck?:()=>Promise<void>):Promise<unknown>{
 const check=()=>{if(!current())throw Error('La connexion a changé pendant la préparation de la note. Sa file de synchronisation reste conservée.');};check();if(sourceCheck)await sourceCheck();check();
 if(!isPaperDocument(content))return content;
 const bytes=strToU8(JSON.stringify(content));if(bytes.length<=256*1024)return content;
 if(bytes.length>MAX_BODY)throw Error('La note dépasse 16 Mo de contenu. Conservez une archive et répartissez-la en plusieurs notes.');
 const refs=(content as unknown as {blob_ids?:string[]}).blob_ids??[];if(refs.length>=MAX_NOTE_BLOB_REFERENCES)throw Error('Cette note dépasse la capacité de ses pièces jointes. Les originaux restent conservés.');
 const body=gzipSync(bytes,{level:3,mtime:0}),sha=hex(await crypto.subtle.digest('SHA-256',body as Uint8Array<ArrayBuffer>));check();
 if(sourceCheck)await sourceCheck();check();
 const blob=await api.uploadBlob(spaceId,new Blob([body as Uint8Array<ArrayBuffer>],{type:'application/octet-stream'}),sha,`${mutationId}-body`,sourceCheck);
 check();
 return {notebookEnvelope:3,noteId:content.noteId,revision:content.revision,body_id:blob.id,body_sha256:sha,body_size:bytes.length,blob_ids:[...refs,blob.id]};
}
export async function decodePaperSync(api:Pick<ApiClient,'downloadBlob'>,spaceId:string,content:unknown,current:()=>boolean=()=>true,sourceCheck?:()=>Promise<void>):Promise<unknown>{
 const check=()=>{if(!current())throw Error('La source a changé pendant la lecture de la note. Son original reste conservé.');};check();if(sourceCheck)await sourceCheck();check();
 if(!content||typeof content!=='object'||(content as {notebookEnvelope?:number}).notebookEnvelope!==3)return content;
 const envelope=content as {body_id?:string;body_size?:number;body_sha256?:string;noteId?:string;revision?:number};
 if(typeof envelope.body_id!=='string'||typeof envelope.body_sha256!=='string'||!Number.isInteger(envelope.body_size)||!envelope.body_size||envelope.body_size>MAX_BODY)throw Error('Manifeste de la note incompatible.');
 const blob=await api.downloadBlob(spaceId,envelope.body_id);check();if(sourceCheck)await sourceCheck();check();const compressed=new Uint8Array(await blob.arrayBuffer());check();
 const digest=hex(await crypto.subtle.digest('SHA-256',compressed));check();if(sourceCheck)await sourceCheck();check();if(digest!==envelope.body_sha256)throw Error('La pièce jointe de la note est incomplète.');
 let size=0;const chunks:Uint8Array[]=[];const decompress=new Gunzip((chunk)=>{check();size+=chunk.length;if(size>MAX_BODY)throw Error('Le document dépasse la capacité annoncée.');chunks.push(chunk);});decompress.push(compressed,true);
 if(size!==envelope.body_size)throw Error('La taille de la note reçue est incorrecte.');const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 check();const document:unknown=JSON.parse(strFromU8(bytes));if(!isPaperDocument(document)||document.noteId!==envelope.noteId||document.revision!==envelope.revision)throw Error('La version reçue ne correspond pas à cette note.');return document;
}
