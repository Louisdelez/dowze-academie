import {invoke} from '@tauri-apps/api/core';
import {save} from '@tauri-apps/plugin-dialog';
import {isTauri} from './tauri';
/** Each IPC message is bounded; an interrupted save aborts its staging file and preserves the destination. */
export async function writePaperExportChunks(blob:Blob,destinationPath:string,kind:string,command:typeof invoke=invoke,current:()=>boolean=()=>true):Promise<void>{
 const check=()=>{if(!current())throw Error('La source de cet export a changé. L’original est conservé.');};check();
 if(!blob.size||blob.size>256*1024*1024)throw Error('L’export doit contenir entre 1 octet et 256 Mo.');
 const exportId=await command<string>('begin_notebook_export',{destinationPath,kind,totalBytes:blob.size});
 try{
  for(let offset=0;offset<blob.size;offset+=65536){check();const bytes=new Uint8Array(await blob.slice(offset,offset+65536).arrayBuffer());check();let binary='';for(let part=0;part<bytes.length;part+=16384)binary+=String.fromCharCode(...bytes.subarray(part,part+16384));await command('push_notebook_export',{exportId,offset,dataBase64:btoa(binary)});}
  check();
  await command('finish_notebook_export',{exportId});
 }catch(error){await command('abort_notebook_export',{exportId}).catch(()=>{});throw error;}
}
export type PaperExportKind='bundle'|'archive'|'template'|'pdf'|'png'|'jpeg'|'wav'|'mp3'|'m4a'|'mp4'|'ogg'|'flac'|'aac'|'webm'|'aiff';
export function originalAudioExportKind(mediaType:string,originalName?:string):PaperExportKind{if(mediaType.split(';')[0]==='audio/mp4'&&/\.mp4$/i.test(originalName??''))return 'mp4';const types:Record<string,PaperExportKind>={'audio/mpeg':'mp3','audio/mp3':'mp3','audio/mp4':'m4a','audio/x-m4a':'m4a','audio/wav':'wav','audio/x-wav':'wav','audio/ogg':'ogg','audio/flac':'flac','audio/x-flac':'flac','audio/aac':'aac','audio/webm':'webm','audio/aiff':'aiff','audio/x-aiff':'aiff'};const kind=types[mediaType.split(';')[0].toLowerCase()];if(!kind)throw Error('Cet original peut être conservé dans l’archive de la note ; son format d’export direct reste à ajouter.');return kind;}
export async function savePaperExport(blob:Blob,name:string,kind:PaperExportKind,current:()=>boolean=()=>true):Promise<boolean>{
 const check=()=>{if(!current())throw Error('La source de cet export a changé. L’original est conservé.');};check();
 if(!isTauri()){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;try{check();a.click();}catch(error){URL.revokeObjectURL(url);throw error;}setTimeout(()=>URL.revokeObjectURL(url),60000);return true;}
 const extension={bundle:'zip',archive:'dowze',template:'dowzetemplate',pdf:'pdf',png:'png',jpeg:'jpg',wav:'wav',mp3:'mp3',m4a:'m4a',mp4:'mp4',ogg:'ogg',flac:'flac',aac:'aac',webm:'webm',aiff:'aiff'}[kind];const selected=await save({title:kind==='bundle'?'Exporter la sélection de notes':'Exporter la note',defaultPath:name,filters:[{name:kind==='bundle'?'Collection de notes Dowze':'Note Dowze',extensions:[extension]}]});if(!selected)return false;
 check();await writePaperExportChunks(blob,selected.toLowerCase().endsWith(`.${extension}`)?selected:`${selected}.${extension}`,kind,invoke,current);return true;
}
