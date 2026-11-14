/* Worklet stays on the audio thread. Nothing is sent until the owner starts a recording. */
class DowzePcmCapture extends AudioWorkletProcessor {
 constructor(){super();this.running=false;this.paused=false;this.samples=new Int16Array(Math.max(128,Math.round(sampleRate)));this.used=0;this.startFrame=0;this.endFrame=0;
  this.port.onmessage=event=>{const command=event.data?.command;if(command==='start'){this.running=true;this.paused=false;}else if(command==='pause'){this.flush();this.paused=true;this.port.postMessage({type:'paused'});}else if(command==='resume'){this.paused=false;this.port.postMessage({type:'resumed'});}else if(command==='stop'){this.flush();this.running=false;this.port.postMessage({type:'stopped'});}};
 }
 flush(){if(!this.used)return;const bytes=this.samples.buffer.slice(0,this.used*2);this.port.postMessage({type:'pcm',buffer:bytes,frames:this.used,startFrame:this.startFrame,endFrame:this.endFrame},[bytes]);this.used=0;}
 process(inputs,outputs){for(const output of outputs)for(const channel of output)channel.fill(0);if(!this.running||this.paused)return true;const input=inputs[0]?.[0];if(!input)return true;
  for(let i=0;i<input.length;i++){if(!this.used)this.startFrame=currentFrame+i;const value=Math.max(-1,Math.min(1,input[i]||0));this.samples[this.used++]=Math.round(value*(value<0?32768:32767));this.endFrame=currentFrame+i+1;if(this.used===this.samples.length)this.flush();}return true;
 }
}
registerProcessor('dowze-pcm-capture',DowzePcmCapture);
