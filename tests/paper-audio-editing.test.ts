import test from 'node:test';
import assert from 'node:assert/strict';
import {trimPcm,mergePcm,pcmWav,pcmDuration} from '../src/lib/paperAudioEditing.ts';
test('Trim is non-destructive, rejects invalid ranges, and WAV preserves signed samples and channel layout',async()=>{
 const audio={sampleRate:8000,channels:[new Float32Array([-.8,-.4,0,.4,.8,1])]};const snapshot=audio.channels[0].slice(),trimmed=trimPcm(audio,1/8000,4/8000);assert.deepEqual([...trimmed.channels[0]],[-.4,0,.4].map(x=>Math.fround(x)));assert.deepEqual(audio.channels[0],snapshot);assert.throws(()=>trimPcm(audio,-1,1));assert.throws(()=>trimPcm(audio,1,0));const blob=pcmWav(audio),bytes=await blob.arrayBuffer(),v=new DataView(bytes);assert.equal(new TextDecoder().decode(new Uint8Array(bytes).slice(0,4)),'RIFF');assert.equal(v.getUint32(24,true),8000);assert.equal(v.getInt16(44,true),Math.round(Math.fround(-.8)*32768));assert.equal(v.getInt16(54,true),32767);assert.equal(blob.size,56);
});
test('Merge keeps both originals, resamples the second and duplicates mono into stereo without mutating inputs',()=>{
 const first={sampleRate:8000,channels:[new Float32Array([0,.5]),new Float32Array([.5,0])]},second={sampleRate:16000,channels:[new Float32Array([1,.5,0,-.5])]};const result=mergePcm(first,second);assert.equal(result.channels.length,2);assert.equal(result.channels[0].length,4);assert.deepEqual([...result.channels[0]],[0,.5,1,0]);assert.deepEqual([...result.channels[1]],[.5,0,1,0]);assert.equal(pcmDuration(result),4/8000);assert.equal(second.channels[0].length,4);assert.throws(()=>pcmWav({sampleRate:8000,channels:[new Float32Array(),new Float32Array(1)]}));
});
