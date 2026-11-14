import {listLocalBlobs,listSnapshotsByPrefix,saveAudioChunk,type AudioRecordingJournal} from '../../pwa/src/storage';
import type {NotebookMediaScope} from '../components/NotebookEditor';
export const MAX_RECORDING_BYTES=16*1024*1024;
export function chooseRecordingMime():string|undefined{
 if(typeof MediaRecorder==='undefined')return undefined;
 return ['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus','audio/webm'].find(type=>MediaRecorder.isTypeSupported(type));
}
export async function recordingBlob(journal:AudioRecordingJournal,media:NotebookMediaScope):Promise<Blob>{
 const blobs=await listLocalBlobs(media.accountId,media.spaceId);const chunks:Blob[]=[];
 for(const id of journal.chunkIds){const chunk=blobs.find(b=>b.id===id);if(!chunk)throw Error('Une partie de l’enregistrement n’est pas disponible. Les autres parties sont conservées.');chunks.push(chunk.blob);}
 if(!chunks.length)throw Error('Cet enregistrement ne contient pas encore de son.');
 const blob=new Blob(chunks,{type:journal.mimeType});if(blob.size>MAX_RECORDING_BYTES)throw Error('L’enregistrement dépasse 16 Mo.');return blob;
}
export async function recoverableRecordings(noteId:string,media:NotebookMediaScope):Promise<AudioRecordingJournal[]>{
 const prefix=`audio-recording|${media.accountId}|${media.spaceId}|${noteId}|`;return (await listSnapshotsByPrefix(media.accountId,media.spaceId,prefix)).filter(s=>s.key.startsWith(prefix)).map(s=>s.value as AudioRecordingJournal).filter(j=>j&&typeof j.id==='string'&&j.noteId===noteId&&['recording','recoverable'].includes(j.status)&&Array.isArray(j.chunkIds)&&j.chunkIds.length>0);
}
export async function completeRecordingJournal(journal:AudioRecordingJournal,media:NotebookMediaScope){await saveAudioChunk(media.accountId,media.spaceId,{...journal,status:'completed'});}
