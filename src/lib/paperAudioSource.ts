import {localBlobDigest,commitNotebookTransfer,listSnapshots,type LocalBlob,type Snapshot} from '../../pwa/src/storage';
import {readPaperAsset} from './paperAssets';
import {migratePaper,applyPaperCommand,notebookDocumentId,type PaperAudio,type PaperAudioSource,type PaperCommand,type PaperDocument} from './notebookDocument';
import {probePaperAudio} from './paperAudioEditing';
import type {NotebookMediaScope} from '../components/NotebookEditor';
export const MAX_AUDIO_SOURCE_BYTES=256*1024*1024, AUDIO_SOURCE_CHUNK_BYTES=8*1024*1024;
export interface AudioSourceReceipt {schema:1;kind:'paper-audio-source';noteId:string;track:PaperAudio;status:'staged'|'published'|'attached'}
const receiptKey=(media:NotebookMediaScope,noteId:string,id:string)=>`audio-source-import|${JSON.stringify([media.accountId,media.spaceId,noteId,id])}`;
const check=(current:()=>boolean)=>{if(!current())throw Error('Le carnet a changé pendant la préparation du son.');};
export function sameAudioSource(a:PaperAudioSource|undefined,b:PaperAudioSource|undefined):boolean{return a===b||!!a&&!!b&&a.schema===b.schema&&a.mediaType===b.mediaType&&a.size===b.size&&a.originalName===b.originalName&&a.chunks.length===b.chunks.length&&a.chunks.every((chunk,index)=>chunk.assetId===b.chunks[index].assetId&&chunk.size===b.chunks[index].size&&chunk.sha256===b.chunks[index].sha256);}
export function audioSourceCommands(track:PaperAudio):PaperCommand[]{
 if(!track.source)throw Error('La source de ce son doit être récupérée.');return [...track.source.chunks.map((chunk,index)=>({type:'add-asset' as const,asset:{id:chunk.assetId,name:`${track.name} — original ${index+1}/${track.source!.chunks.length}`,mediaType:'application/octet-stream',size:chunk.size}})),{type:'add-audio',audio:track}];
}
function validReceipt(value:unknown,noteId:string):value is AudioSourceReceipt{
 const receipt=value as AudioSourceReceipt;if(!receipt||receipt.schema!==1||receipt.kind!=='paper-audio-source'||receipt.noteId!==noteId||!['staged','published','attached'].includes(receipt.status))return false;
 try{applyPaperCommand(migratePaper(noteId,'',null),{type:'batch',commands:audioSourceCommands(receipt.track)});return true;}catch{return false;}
}
export function audioSourceMime(file:Blob&{name?:string}):string{
 const named:Record<string,string>={mp3:'audio/mpeg',m4a:'audio/mp4',mp4:'audio/mp4',wav:'audio/wav',ogg:'audio/ogg',flac:'audio/flac',aac:'audio/aac',webm:'audio/webm',aiff:'audio/aiff',aif:'audio/aiff'};
 const extension=file.name?.split('.').at(-1)?.toLowerCase();if(extension&&named[extension])return named[extension];if(/^audio\//.test(file.type))return file.type;throw Error('Choisissez un fichier audio, par exemple MP3, M4A, MP4 ou WAV.');
}
/** Preserve encoded bytes; only the browser's actual decoder decides whether this source is playable. */
export async function importAudioSource(file:Blob&{name?:string},noteId:string,media:NotebookMediaScope,current:()=>boolean=()=>true,onProgress?:(done:number,total:number)=>void):Promise<AudioSourceReceipt>{
 check(current);if(!file.size||file.size>MAX_AUDIO_SOURCE_BYTES)throw Error('Le fichier audio doit contenir entre 1 octet et 256 Mo. Son original reste disponible.');const mediaType=audioSourceMime(file),duration=await probePaperAudio(file.slice(0,undefined,mediaType));check(current);return stageAudioSource(file,file.name??'Son importé',mediaType,duration,noteId,media,current,onProgress);
}
/** No bytes become uploadable before the note references the complete ordered source. */
export async function stageAudioSource(file:Blob,name:string,mediaType:string,duration:number,noteId:string,media:NotebookMediaScope,current:()=>boolean=()=>true,onProgress?:(done:number,total:number)=>void):Promise<AudioSourceReceipt>{
 check(current);if(!file.size||file.size>MAX_AUDIO_SOURCE_BYTES||!Number.isFinite(duration)||duration<=0)throw Error('La source audio doit être lisible et posséder une durée.');const id=crypto.randomUUID(),blobs:LocalBlob[]=[],chunks:NonNullable<PaperAudio['source']>['chunks']=[];
 for(let offset=0;offset<file.size;offset+=AUDIO_SOURCE_CHUNK_BYTES){check(current);const blob=file.slice(offset,offset+AUDIO_SOURCE_CHUNK_BYTES,'application/octet-stream'),assetId=crypto.randomUUID(),sha256=await localBlobDigest(blob);check(current);chunks.push({assetId,size:blob.size,sha256});blobs.push({accountId:media.accountId,spaceId:media.spaceId,id:assetId,documentId:notebookDocumentId(noteId),name:`${name} — original`,blob,sha256,revision:1,createdAt:Date.now(),status:'pending',removedFromNote:true});onProgress?.(Math.min(offset+AUDIO_SOURCE_CHUNK_BYTES,file.size),file.size);}
 const track:PaperAudio={id,assetId:chunks[0].assetId,name,duration,startedAt:Date.now(),source:{schema:1,originalName:name,mediaType,size:file.size,chunks}},receipt:AudioSourceReceipt={schema:1,kind:'paper-audio-source',noteId,track,status:'staged'};if(!validReceipt(receipt,noteId))throw Error('Les informations de cette source audio sont incompatibles.');const snapshot:Snapshot={key:receiptKey(media,noteId,id),accountId:media.accountId,spaceId:media.spaceId,value:receipt};
 await commitNotebookTransfer({target:media,sources:[],drafts:[],blobs,snapshots:[snapshot],draftChecks:[],blobChecks:blobs.map(row=>({identity:row,expected:undefined})),snapshotChecks:[{key:snapshot.key,expected:undefined}]},current);return receipt;
}
export async function readPaperAudioSource(track:PaperAudio,document:PaperDocument,media:NotebookMediaScope,current:()=>boolean=()=>true,onProgress?:(done:number,total:number)=>void):Promise<Blob>{
 check(current);const source=track.source;if(!source){const asset=document.assets.find(a=>a.id===track.assetId);if(!asset)throw Error('La source audio doit être récupérée.');const blob=await readPaperAsset(asset,media,{document,current});check(current);return blob;}const pieces:Blob[]=[];let total=0;
 for(const chunk of source.chunks){check(current);const asset=document.assets.find(a=>a.id===chunk.assetId);if(!asset)throw Error('Une portion de l’original audio doit être retrouvée.');const blob=await readPaperAsset(asset,media,{document,current});check(current);if(blob.size!==chunk.size||await localBlobDigest(blob)!==chunk.sha256)throw Error('Une portion de l’original audio est incomplète. Les autres restent conservées.');check(current);pieces.push(blob);total+=blob.size;onProgress?.(total,source.size);}
 check(current);if(total!==source.size)throw Error('L’original audio attend sa récupération.');return new Blob(pieces,{type:source.mediaType});
}
export async function pendingAudioSources(noteId:string,media:NotebookMediaScope){return (await listSnapshots(media.accountId,media.spaceId)).filter(snapshot=>snapshot.key.startsWith('audio-source-import|')&&validReceipt(snapshot.value,noteId)&&['staged','published'].includes(snapshot.value.status)).map(snapshot=>snapshot.value as AudioSourceReceipt);}
export async function markAudioSourcePublished(receipt:AudioSourceReceipt,media:NotebookMediaScope,current:()=>boolean){return setAudioSourceStatus(receipt,media,current,'published');}
export async function finishAudioSource(receipt:AudioSourceReceipt,media:NotebookMediaScope,current:()=>boolean){return setAudioSourceStatus(receipt,media,current,'attached');}
async function setAudioSourceStatus(receipt:AudioSourceReceipt,media:NotebookMediaScope,current:()=>boolean,status:'published'|'attached'){
 const key=receiptKey(media,receipt.noteId,receipt.track.id),previous=(await listSnapshots(media.accountId,media.spaceId)).find(s=>s.key===key);if(!validReceipt(previous?.value,receipt.noteId))throw Error('Le reçu de la source audio doit être retrouvé.');await commitNotebookTransfer({target:media,sources:[],drafts:[],blobs:[],snapshots:[{...previous!,value:{...previous!.value as AudioSourceReceipt,status:(previous!.value as AudioSourceReceipt).status==='attached'?'attached':status}}],draftChecks:[],blobChecks:[],snapshotChecks:[{key,expected:previous}]},current);
}
