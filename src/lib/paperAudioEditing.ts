export interface PcmAudio{sampleRate:number;channels:Float32Array[]}
const MAX_FRAMES=16_000_000;
export async function probePaperAudio(blob:Blob):Promise<number>{
 return new Promise((resolve,reject)=>{const url=URL.createObjectURL(blob),audio=document.createElement('audio');let seeking=false,finished=false;const timer=setTimeout(()=>finish(Error('La durée de ce son ne peut pas être déterminée.')),10000);const finish=(value:number|Error)=>{if(finished)return;finished=true;audio.onloadedmetadata=null;audio.ondurationchange=null;audio.onseeked=null;audio.onerror=null;clearTimeout(timer);audio.pause();audio.removeAttribute('src');audio.load();URL.revokeObjectURL(url);value instanceof Error?reject(value):resolve(value);};
 const inspect=()=>{if(Number.isFinite(audio.duration)&&audio.duration>0)finish(audio.duration);else if(!seeking&&audio.readyState>=1){seeking=true;try{audio.currentTime=1e12;}catch{finish(Error('Le fichier ne contient pas une durée audio lisible.'));}}};
 audio.preload='metadata';audio.onloadedmetadata=inspect;audio.ondurationchange=inspect;audio.onseeked=inspect;audio.onerror=()=>finish(Error('Ce fichier audio ne peut pas être lu ici.'));audio.src=url;
 });
}
export async function decodePaperAudio(blob:Blob):Promise<PcmAudio>{
 const Audio=globalThis.AudioContext;if(!Audio)throw Error('Le décodage audio n’est pas disponible dans ce navigateur.');
 const seconds=await probePaperAudio(blob),context=new Audio();try{if(seconds*context.sampleRate*2>MAX_FRAMES)throw Error('Ce son est trop long pour l’édition dans ce navigateur. Son original reste disponible pour l’écoute et l’archive.');const decoded=await context.decodeAudioData(await blob.arrayBuffer());if(decoded.length*decoded.numberOfChannels>MAX_FRAMES)throw Error('Ce son est trop long pour être édité ici. Importez-le en sections.');if(decoded.numberOfChannels>2)throw Error('L’édition prend en charge le son mono ou stéréo.');return {sampleRate:decoded.sampleRate,channels:Array.from({length:decoded.numberOfChannels},(_,i)=>decoded.getChannelData(i).slice())};}finally{await context.close();}
}
export function trimPcm(audio:PcmAudio,start:number,end:number):PcmAudio{
 const duration=audio.channels[0].length/audio.sampleRate;if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>duration+0.001||end<=start)throw Error('Choisissez un début et une fin dans la durée du son.');
 return {sampleRate:audio.sampleRate,channels:audio.channels.map(channel=>channel.slice(Math.floor(start*audio.sampleRate),Math.min(channel.length,Math.ceil(end*audio.sampleRate))))};
}
export function mergePcm(first:PcmAudio,second:PcmAudio):PcmAudio{
 const rate=first.sampleRate,frames=Math.ceil(second.channels[0].length*rate/second.sampleRate),count=Math.max(first.channels.length,second.channels.length),length=first.channels[0].length+frames;
 if(length*count>MAX_FRAMES||length*count*2+44>16*1024*1024)throw Error('Le résultat dépasse 16 Mo. Assemblez des sections plus courtes.');
 return {sampleRate:rate,channels:Array.from({length:count},(_,c)=>{const result=new Float32Array(length);result.set(first.channels[Math.min(c,first.channels.length-1)]);const channel=second.channels[Math.min(c,second.channels.length-1)];for(let i=0;i<frames;i++){const source=i*second.sampleRate/rate,index=Math.floor(source),fraction=source-index;result[first.channels[0].length+i]=(channel[Math.min(index,channel.length-1)]??0)*(1-fraction)+(channel[Math.min(index+1,channel.length-1)]??0)*fraction;}return result;})};
}
export function pcmWav(audio:PcmAudio):Blob{
 if(!Number.isInteger(audio.sampleRate)||audio.sampleRate<8000||audio.sampleRate>192000||audio.channels.length<1||audio.channels.length>2||!audio.channels[0].length||!audio.channels.every(c=>c.length===audio.channels[0].length))throw Error('Format audio non pris en charge.');
 const channels=audio.channels.length,length=audio.channels[0].length,size=length*channels*2;if(size+44>16*1024*1024)throw Error('Le son WAV dépasse 16 Mo.');
 const buffer=new ArrayBuffer(44+size),view=new DataView(buffer),text=(offset:number,value:string)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));};
 text(0,'RIFF');view.setUint32(4,36+size,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);view.setUint32(24,audio.sampleRate,true);view.setUint32(28,audio.sampleRate*channels*2,true);view.setUint16(32,channels*2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,size,true);
 for(let i=0;i<length;i++)for(let c=0;c<channels;c++){const sample=Math.max(-1,Math.min(1,audio.channels[c][i]||0));view.setInt16(44+(i*channels+c)*2,Math.round(sample*(sample<0?32768:32767)),true);}return new Blob([buffer],{type:'audio/wav'});
}
export const pcmDuration=(audio:PcmAudio)=>audio.channels[0].length/audio.sampleRate;
