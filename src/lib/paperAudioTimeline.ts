import type {PaperAudio,PaperAudioSegment} from './notebookDocument';
export const audioSegments=(track:PaperAudio):PaperAudioSegment[]=>track.segments??[{assetId:track.assetId,offset:0,duration:track.duration}];
export function audioPosition(track:PaperAudio,time:number):{index:number;local:number;global:number}{
 const parts=audioSegments(track),global=Math.max(0,Math.min(Number.isFinite(time)?time:0,track.duration));let index=parts.findIndex((part,i)=>global<part.offset+part.duration||i===parts.length-1);if(index<0)index=0;return {index,local:Math.max(0,global-parts[index].offset),global};
}
