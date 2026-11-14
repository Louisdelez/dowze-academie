import workletUrl from './paperAudioCapture.worklet.js?url';
export interface CapturedPcm {data:Blob;frames:number;start:number;end:number}
/** One microphone stream and one audio graph for the whole recording, including pause/resume. */
export class PaperPcmCapture {
 state:'inactive'|'recording'|'paused'='inactive';readonly mimeType='audio/wav';readonly channels=1;frames=0;
 ondataavailable:((event:CapturedPcm)=>void)|null=null;onstop:(()=>void)|null=null;onerror:((error:unknown)=>void)|null=null;
 private origin:number;private stopping=false;private timer:ReturnType<typeof setTimeout>|undefined;
 private constructor(private context:AudioContext,private source:MediaStreamAudioSourceNode,private node:AudioWorkletNode){this.origin=Date.now()-context.currentTime*1000;
  node.port.onmessage=event=>{const value=event.data;if(value?.type==='pcm'){if(!(value.buffer instanceof ArrayBuffer)||!Number.isInteger(value.frames)||value.frames<=0||value.buffer.byteLength!==value.frames*2)return;this.frames+=value.frames;this.ondataavailable?.({data:new Blob([value.buffer],{type:'application/octet-stream'}),frames:value.frames,start:this.origin+value.startFrame/this.sampleRate*1000,end:this.origin+value.endFrame/this.sampleRate*1000});}else if(value?.type==='stopped')this.finish();};
  node.onprocessorerror=()=>{this.onerror?.(Error('La capture audio a été interrompue. Les parties déjà conservées restent récupérables.'));this.stop();};
 }
 get sampleRate(){return this.context.sampleRate;}
 static async create(stream:MediaStream):Promise<PaperPcmCapture>{
  if(typeof AudioContext==='undefined'||typeof AudioWorkletNode==='undefined')throw Error('La capture audio continue n’est pas disponible ici.');const context=new AudioContext();
  try{await context.audioWorklet.addModule(workletUrl);const source=context.createMediaStreamSource(stream),node=new AudioWorkletNode(context,'dowze-pcm-capture',{numberOfInputs:1,numberOfOutputs:1,channelCount:1,channelCountMode:'explicit',outputChannelCount:[1]});source.connect(node);node.connect(context.destination);await context.resume();if(context.state!=='running')throw Error('L’audio doit être activé avant l’enregistrement.');return new PaperPcmCapture(context,source,node);}catch(error){await context.close();throw error;}
 }
 start(){if(this.state!=='inactive')return;this.state='recording';this.node.port.postMessage({command:'start'});}
 pause(){if(this.state!=='recording')return;this.state='paused';this.node.port.postMessage({command:'pause'});}
 resume(){if(this.state!=='paused')return;this.state='recording';this.node.port.postMessage({command:'resume'});}
 stop(){if(this.stopping)return;this.stopping=true;this.state='inactive';this.node.port.postMessage({command:'stop'});this.timer=setTimeout(()=>{this.onerror?.(Error('La dernière portion audio n’a pas été confirmée. Les parties conservées restent récupérables.'));this.finish();},2000);}
 private finish(){if(!this.stopping)this.stopping=true;if(this.timer)clearTimeout(this.timer);this.node.port.onmessage=null;this.source.disconnect();this.node.disconnect();this.state='inactive';void this.context.close();const stopped=this.onstop;this.onstop=null;stopped?.();}
}
