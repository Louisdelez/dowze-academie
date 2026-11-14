/** Small RIFF/PCM utilities shared by capture, recovery, playback exports and deterministic tests. */
export const PCM_SECTION_BYTES=8*1024*1024;
export function pcmWavHeader(size:number,sampleRate:number,channels:number):ArrayBuffer{
 if(!Number.isSafeInteger(size)||size<=0||size+36>0xffffffff||!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>192000||![1,2].includes(channels)||size%(channels*2))throw Error('Format PCM incompatible.');
 const bytes=new ArrayBuffer(44),v=new DataView(bytes),text=(i:number,s:string)=>{for(let j=0;j<s.length;j++)v.setUint8(i+j,s.charCodeAt(j));};
 text(0,'RIFF');v.setUint32(4,36+size,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,channels,true);v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*channels*2,true);v.setUint16(32,channels*2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,size,true);return bytes;
}
export function pcmChunksWav(chunks:readonly Blob[],sampleRate:number,channels:number):Blob{
 const size=chunks.reduce((sum,blob)=>sum+blob.size,0);return new Blob([pcmWavHeader(size,sampleRate,channels),...chunks],{type:'audio/wav'});
}
export function pcmBytes(audio:{sampleRate:number;channels:Float32Array[]}):Blob{
 if(!audio.channels.length||audio.channels.length>2||!audio.channels[0].length||!audio.channels.every(c=>c.length===audio.channels[0].length))throw Error('Format PCM incompatible.');
 const bytes=new ArrayBuffer(audio.channels[0].length*audio.channels.length*2),view=new DataView(bytes);for(let i=0;i<audio.channels[0].length;i++)for(let c=0;c<audio.channels.length;c++){const n=Math.max(-1,Math.min(1,audio.channels[c][i]||0));view.setInt16((i*audio.channels.length+c)*2,Math.round(n*(n<0?32768:32767)),true);}return new Blob([bytes],{type:'application/octet-stream'});
}
