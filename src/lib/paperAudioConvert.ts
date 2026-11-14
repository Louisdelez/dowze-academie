import {FFmpeg, FFFSType} from '@ffmpeg/ffmpeg';
import workerURL from './paperAudioWorker.js?worker&url';
import coreURL from '../../node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js?url';
import wasmURL from '@ffmpeg/core/wasm?url';
import {pcmChunksWav} from './paperPcm';

export interface AudioConversionOptions {signal?:AbortSignal;current?:()=>boolean;onProgress?:(done:number,total:number)=>void}
export const CONVERSION_RATE=48000, CONVERSION_CHANNELS=2, CONVERSION_SECONDS=40;
const MAX_OUTPUT=256*1024*1024;
let queue:Promise<void>=Promise.resolve();
async function waitForQueue(previous:Promise<void>,signal?:AbortSignal){if(!signal)return previous;if(signal.aborted)throw audioConversionCancelled();let abort!:()=>void;try{await Promise.race([previous,new Promise<never>((_,reject)=>{abort=()=>reject(audioConversionCancelled());signal.addEventListener('abort',abort,{once:true});})]);}finally{signal.removeEventListener('abort',abort);}}

export const audioConversionCancelled=()=>new DOMException('Conversion annulée. Le son original est conservé.','AbortError');
/** Serial, single-threaded local decoder. WORKERFS reads Blob slices without copying the encoded course into MEMFS. */
async function convertLocally(blob:Blob,start:number,end:number,options:AudioConversionOptions={}){
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start)throw Error('Choisissez un passage audio valide.');
 if((Math.ceil(end*CONVERSION_RATE)-Math.floor(start*CONVERSION_RATE))*CONVERSION_CHANNELS*2+44>MAX_OUTPUT)throw Error('Le résultat WAV dépasse 256 Mo. Choisissez un passage ; l’original est conservé.');
 const check=()=>{if(options.signal?.aborted||options.current?.()===false)throw audioConversionCancelled();};check();
 const previous=queue;let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});queue=previous.then(()=>gate);
 const ffmpeg=new FFmpeg();let stopped=false,stopError:Error=audioConversionCancelled();
 const stop=(reason:Error=audioConversionCancelled())=>{stopped=true;stopError=reason;ffmpeg.terminate();};
 const abort=()=>stop();options.signal?.addEventListener('abort',abort,{once:true});
 let monitor:ReturnType<typeof setInterval>|undefined;let deadline:ReturnType<typeof setTimeout>|undefined;
 try{
  await waitForQueue(previous,options.signal);check();options.onProgress?.(0,Math.ceil(end*CONVERSION_RATE)-Math.floor(start*CONVERSION_RATE));
  monitor=setInterval(()=>{if(options.current?.()===false||options.signal?.aborted)stop();},100);
  deadline=setTimeout(()=>stop(Error('Le décodeur local n’a pas démarré dans le délai prévu. Réessayez ; l’original est conservé.')),30000);
  await ffmpeg.load({classWorkerURL:workerURL,coreURL,wasmURL});clearTimeout(deadline);deadline=undefined;check();
  await ffmpeg.createDir('/input');
  if(!await ffmpeg.mount(FFFSType.WORKERFS,{blobs:[{name:'source.media',data:blob}]},'/input'))throw Error('Le décodeur local ne peut pas ouvrir ce son.');
  const pieces:{blob:Blob;duration:number}[]=[];const totalFrames=Math.ceil(end*CONVERSION_RATE)-Math.floor(start*CONVERSION_RATE);let frame=0;
  while(frame<totalFrames){
   check();if(stopped)throw stopError;const frames=Math.min(CONVERSION_SECONDS*CONVERSION_RATE,totalFrames-frame),position=(Math.floor(start*CONVERSION_RATE)+frame)/CONVERSION_RATE;
   options.onProgress?.(frame,totalFrames);
   deadline=setTimeout(()=>stop(Error('La conversion de ce passage a dépassé son délai. Le son original est conservé.')),65000);
   const code=await ffmpeg.exec(['-hide_banner','-loglevel','error','-nostdin','-y','-protocol_whitelist','file,pipe','-ss',String(position),'-i','/input/source.media','-map','0:a:0','-vn','-sn','-dn','-t',String(frames/CONVERSION_RATE),'-ac','2','-ar','48000','-c:a','pcm_s16le','-f','s16le','/part.raw'],60000);clearTimeout(deadline);deadline=undefined;check();
   if(code!==0)throw Error('Ce passage ne peut pas être converti ici. Son original reste conservé.');
   const data=await ffmpeg.readFile('/part.raw');await ffmpeg.deleteFile('/part.raw');check();
   if(!(data instanceof Uint8Array)||!data.length||data.length%4||data.length>frames*4||data.length<(frame+frames<totalFrames?frames*4:frames*4-4800))throw Error('Le passage décodé est incomplet. Aucun extrait n’a été ajouté.');
   const raw=new Blob([data as Uint8Array<ArrayBuffer>]);pieces.push({blob:pcmChunksWav([raw],CONVERSION_RATE,CONVERSION_CHANNELS),duration:data.length/4/CONVERSION_RATE});frame+=frames;
  }
  options.onProgress?.(totalFrames,totalFrames);return pieces;
 }catch(error){if(options.signal?.aborted||options.current?.()===false)throw audioConversionCancelled();if(stopped)throw stopError;throw error;}
 finally{if(monitor)clearInterval(monitor);if(deadline)clearTimeout(deadline);options.signal?.removeEventListener('abort',abort);ffmpeg.terminate();release();}
}

/** Web Locks serialize decoding across tabs of the same origin, in addition to the in-page fallback queue. */
export async function convertPaperAudio(blob:Blob,start:number,end:number,options:AudioConversionOptions={}){
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start)throw Error('Choisissez un passage audio valide.');
 if(options.signal?.aborted||options.current?.()===false)throw audioConversionCancelled();
 options.onProgress?.(0,Math.ceil(end*CONVERSION_RATE)-Math.floor(start*CONVERSION_RATE));
 const controller=new AbortController(),abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});
 const watch=setInterval(()=>{if(options.current?.()===false)controller.abort();},100);
 try{const work=()=>convertLocally(blob,start,end,{...options,signal:controller.signal});return globalThis.navigator?.locks?await navigator.locks.request('dowze-notebook-audio-converter',{signal:controller.signal},work):await work();}
 finally{clearInterval(watch);options.signal?.removeEventListener('abort',abort);}
}
