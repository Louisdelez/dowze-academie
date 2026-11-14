import {parsePhotoReference,photoReference} from './notebook.ts';
import {notebookDocumentId} from './notebookDocument.ts';
import {unzipSync,strFromU8} from 'fflate';
import {readBoundedZipBlob} from './zipBlob.ts';
import {isPaperArchiveMetadata,type PaperArchiveMetadata} from './paperArchiveMetadata.ts';
import {isPaperDocument,type PaperDocument,type PaperCommand} from './notebookDocument.ts';
export interface PortablePaperArchive<T> {document:PaperDocument;files:Record<string,T>;physicalFiles?:Record<string,T>;metadata?:PaperArchiveMetadata;integrity?:{schema:1;files:Record<string,{size:number;sha256:string}>;assetPaths?:Record<string,string>}}
export type PaperArchive=PortablePaperArchive<Uint8Array>;
export type PaperBlobArchive=PortablePaperArchive<Blob>;
/** Total archive quota; each media remains within the cloud's 16 MiB blob quota. */
export const MAX_PAPER_ARCHIVE_BYTES=256*1024*1024;
export const MAX_PAPER_ARCHIVE_MEMBER_BYTES=16*1024*1024;
export const MAX_PAPER_ARCHIVE_ENTRIES=10003;
const acceptedEntry=(name:string)=>/^(document\.json|metadata\.json|integrity\.json|assets\/[A-Za-z0-9._-]{1,200})$/.test(name);
function parsePaperArchive<T>(files:Record<string,T>,size:(file:T)=>number,text:Record<string,string>):PortablePaperArchive<T>{
 if(Object.values(files).reduce((sum,file)=>sum+size(file),0)>MAX_PAPER_ARCHIVE_BYTES||Object.values(files).some(file=>size(file)>MAX_PAPER_ARCHIVE_MEMBER_BYTES))throw Error('Le contenu de l’archive dépasse la taille prise en charge.');
 if(!files['document.json'])throw Error('Cette archive ne contient pas une note Dowze.');
 const document:unknown=JSON.parse(text['document.json']);if(!isPaperDocument(document))throw Error('Format de note invalide ou non pris en charge.');
 let metadata:PaperArchiveMetadata|undefined;
 if(files['metadata.json']){const value:unknown=JSON.parse(text['metadata.json']);if(!isPaperArchiveMetadata(value)||value.note.id!==document.noteId)throw Error('Informations de note incompatibles dans l’archive.');metadata=value;}
 let integrity:PortablePaperArchive<T>['integrity'];
 if(files['integrity.json']){const value=JSON.parse(text['integrity.json']);if(value?.schema!==1||!value.files||typeof value.files!=='object'||Array.isArray(value.files))throw Error('Manifeste d’intégrité incompatible.');if(value.assetPaths!==undefined&&(!value.assetPaths||typeof value.assetPaths!=='object'||Array.isArray(value.assetPaths)||Object.keys(value.assetPaths).length!==document.assets.length||document.assets.some(a=>typeof value.assetPaths[a.id]!=='string'||!/^assets\/[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(value.assetPaths[a.id]))||new Set(Object.values(value.assetPaths)).size!==document.assets.length))throw Error('Références de pièces jointes incompatibles.');const required=['document.json',...(metadata?['metadata.json']:[]),...document.assets.map(a=>value.assetPaths?.[a.id]??`assets/${a.id}`)];if(Object.keys(value.files).length!==required.length||required.some(name=>{const row=value.files[name];return !row||!Number.isSafeInteger(row.size)||row.size<0||!files[name]||row.size!==size(files[name])||typeof row.sha256!=='string'||!/^[0-9a-f]{64}$/.test(row.sha256);}))throw Error('Le manifeste ne correspond pas au contenu de l’archive.');integrity=value;}
 const logicalFiles={...files};for(const asset of document.assets){const path=integrity?.assetPaths?.[asset.id]??`assets/${asset.id}`;if(!files[path])throw Error(`La pièce jointe « ${asset.name} » manque dans l’archive.`);logicalFiles[`assets/${asset.id}`]=files[path];}
 if(metadata&&!integrity)throw Error('Cette archive de note complète ne contient pas son manifeste d’intégrité.');return {document,files:logicalFiles,physicalFiles:files,metadata,integrity};
}
export function readPaperArchive(bytes:Uint8Array):PaperArchive{
 if(bytes.length>MAX_PAPER_ARCHIVE_BYTES)throw Error('L’archive dépasse 256 Mo.');let total=0,count=0;const names=new Set<string>();
 const files=unzipSync(bytes,{filter:entry=>{if(++count>MAX_PAPER_ARCHIVE_ENTRIES||names.has(entry.name))throw Error('L’archive contient trop d’éléments ou des noms répétés.');names.add(entry.name);if(!acceptedEntry(entry.name))return false;if(entry.originalSize>MAX_PAPER_ARCHIVE_MEMBER_BYTES)throw Error('Une pièce de l’archive dépasse 16 Mo.');total+=entry.originalSize;if(total>MAX_PAPER_ARCHIVE_BYTES)throw Error('Le contenu de l’archive dépasse 256 Mo.');return true;}});
 return parsePaperArchive(files,file=>file.length,Object.fromEntries(['document.json','metadata.json','integrity.json'].filter(name=>files[name]).map(name=>[name,strFromU8(files[name])])));
}
function corruptedEntry<T>(archive:PortablePaperArchive<T>,name:string):Error{
 const label=name==='document.json'?'contenu de la note':name==='metadata.json'?'informations de la note':archive.document.assets.find(a=>(archive.integrity?.assetPaths?.[a.id]??`assets/${a.id}`)===name)?.name??'pièce jointe';return Error(`L’archive contient un élément endommagé : ${label}. Votre carnet est inchangé.`);
}
export async function verifyPaperArchive(bytes:Uint8Array):Promise<PaperArchive>{
 const archive=readPaperArchive(bytes);if(archive.integrity)for(const [name,row] of Object.entries(archive.integrity.files)){const digest=await crypto.subtle.digest('SHA-256',new Uint8Array((archive.physicalFiles??archive.files)[name]));const sha=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');if(sha!==row.sha256)throw corruptedEntry(archive,name);}return archive;
}
/** Read only central-directory-proved ranges. In particular, original stored
 * assets containing PK headers/descriptors remain opaque bytes. Unknown names
 * are still counted/deduplicated and ignored, as in readPaperArchive's filter. */
export async function verifyPaperArchiveBlob(blob:Blob,current:()=>boolean=()=>true,onProgress?:(completed:number,total:number)=>void):Promise<PaperBlobArchive>{
 const check=()=>{if(!current())throw Error('Le carnet a changé pendant l’importation.');};check();if(blob.size>MAX_PAPER_ARCHIVE_BYTES)throw Error('L’archive dépasse 256 Mo.');
 const accepted=await readBoundedZipBlob(blob,{maxBytes:MAX_PAPER_ARCHIVE_BYTES,maxEntries:MAX_PAPER_ARCHIVE_ENTRIES,maxMemberBytes:MAX_PAPER_ARCHIVE_MEMBER_BYTES,maxExpandedBytes:MAX_PAPER_ARCHIVE_BYTES,maxDirectoryBytes:16*1024*1024,acceptEntry:acceptedEntry,current,onProgress});check();
 const files:Record<string,Blob>=Object.create(null);for(const [name,file] of accepted)files[name]=file;
 const text:Record<string,string>=Object.create(null);for(const name of ['document.json','metadata.json','integrity.json'])if(files[name]){text[name]=await files[name].text();check();}
 const archive=parsePaperArchive(files,file=>file.size,text);if(archive.integrity)for(const [name,row] of Object.entries(archive.integrity.files)){check();const digest=await crypto.subtle.digest('SHA-256',await files[name].arrayBuffer());check();const sha=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');if(sha!==row.sha256)throw corruptedEntry(archive,name);}return archive;
}
/** Import is an append transaction: the destination note and its recovery source survive. */
export function appendPaperArchive(source:PaperDocument,destinationNoteId:string):{commands:PaperCommand[];assets:Map<string,string>;firstPageId:string}{
 const groups=new Map(source.objects.filter(o=>o.groupId).map(o=>[o.groupId!,crypto.randomUUID()]));
 const objects=new Map(source.objects.map(o=>[o.id,crypto.randomUUID()]));
 const pages=new Map(source.pages.map(p=>[p.id,crypto.randomUUID()])),assets=new Map(source.assets.map(a=>[a.id,crypto.randomUUID()])),audio=new Map(source.audio.map(a=>[a.id,crypto.randomUUID()]));
 const commands:PaperCommand[]=[...(source.study?source.study.cards.map(card=>({type:'study-card' as const,card:{...card,id:crypto.randomUUID(),...(card.source?{source:{...card.source,noteId:destinationNoteId,pageId:pages.get(card.source.pageId)??card.source.pageId,objectId:objects.get(card.source.objectId)??card.source.objectId}}:{})}})):[]),...source.assets.map(a=>({type:'add-asset' as const,asset:{id:assets.get(a.id)!,name:a.name,mediaType:a.mediaType,size:a.size}})),...source.audio.map(a=>({type:'add-audio' as const,audio:{...a,id:audio.get(a.id)!,assetId:assets.get(a.assetId)!,...(a.source?{source:{...a.source,chunks:a.source.chunks.map(chunk=>({...chunk,assetId:assets.get(chunk.assetId)!}))}}:{}),...(a.segments?{segments:a.segments.map(part=>({...part,assetId:assets.get(part.assetId)!,...(part.source?{source:{...part.source,chunks:part.source.chunks.map(chunk=>({...chunk,assetId:assets.get(chunk.assetId)!}))}}:{})}))}:{})}})),...source.pages.map(p=>({type:'insert-page' as const,page:{...p,...(p.flowRootId?{flowRootId:objects.get(p.flowRootId)}:{}),id:pages.get(p.id)!,...(p.pdf?{pdf:{...p.pdf,assetId:assets.get(p.pdf.assetId)!}}:{})}})),...source.objects.map(o=>({type:'upsert-object' as const,object:{...o,...(o.textFlow?{textFlow:{...o.textFlow,pageIds:o.textFlow.pageIds.map(id=>pages.get(id)!)}}:{}),...(o.markdown?{markdown:o.markdown.replace(/dowze-photo:[^\s)]+/g,src=>{const ref=parseArchivePhoto(src);return ref&&assets.has(ref.id)?photoReference(notebookDocumentId(destinationNoteId),assets.get(ref.id)!):src;})}:{}),...(o.groupId?{groupId:groups.get(o.groupId)}:{}),id:objects.get(o.id)!,pageId:pages.get(o.pageId)!,...(o.assetId?{assetId:assets.get(o.assetId)!}:{}),...(o.audioAnchor?{audioAnchor:{...o.audioAnchor,sessionId:audio.get(o.audioAnchor.sessionId)!}}:{})}}))];
 return {commands,assets,firstPageId:pages.get(source.pages[0].id)!};
}

/** Legacy document IDs can be longer than server keys; importing maps them to fresh bounded IDs. */
function parseArchivePhoto(src:string){const known=parsePhotoReference(src);if(known)return known;const match=/^dowze-photo:([^/]+)\/([^/]+)$/.exec(src);if(!match)return null;try{const id=decodeURIComponent(match[2]);return id.length>0&&id.length<=200?{id}:null;}catch{return null;}}
