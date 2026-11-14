import {readPaperAudioSource} from './paperAudioSource';
import {readPaperAsset} from './paperAssets';
import {audioSegments} from './paperAudioTimeline';
import type {AudioConversionOptions} from './paperAudioConvert';
import {pcmChunksWav,PCM_SECTION_BYTES} from './paperPcm';
import type {PaperAudio,PaperDocument} from './notebookDocument';
import type {NotebookMediaScope} from '../components/NotebookEditor';
export interface AudioPiece {blob:Blob;duration:number;source?:NonNullable<PaperAudio['source']>}
export async function wavPcmSource(blob:Blob):Promise<{sampleRate:number;channels:number;raw:Blob;frames:number}|null>{
 if(blob.size<44)return null;const buffer=await blob.slice(0,44).arrayBuffer(),v=new DataView(buffer),text=(offset:number,n:number)=>new TextDecoder().decode(new Uint8Array(buffer,offset,n));if(text(0,4)!=='RIFF'||text(8,4)!=='WAVE'||text(12,4)!=='fmt '||text(36,4)!=='data'||v.getUint32(16,true)!==16||v.getUint16(20,true)!==1||v.getUint16(34,true)!==16)return null;
 const channels=v.getUint16(22,true),sampleRate=v.getUint32(24,true),size=v.getUint32(40,true);if(![1,2].includes(channels)||sampleRate<8000||sampleRate>192000||size+44!==blob.size||!size||size%(channels*2))return null;return {sampleRate,channels,raw:blob.slice(44),frames:size/(channels*2)};
}
/** A trim loads only the intersected sections; valid PCM sections can be sliced without decoding the course. */
export async function readPaperAudioRange(track:PaperAudio,document:PaperDocument,media:NotebookMediaScope,start=0,end=track.duration,current:()=>boolean=()=>true,options:AudioConversionOptions={}):Promise<AudioPiece[]>{
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>track.duration+.001||end<=start)throw Error('Choisissez un début et une fin dans la durée du son.');const result:AudioPiece[]=[];
 for(const part of audioSegments(track)){if(!current())throw Error('Le carnet a changé pendant la préparation du son.');const from=Math.max(start,part.offset),to=Math.min(end,part.offset+part.duration);if(to<=from)continue;const asset=document.assets.find(a=>a.id===part.assetId);if(!asset)throw Error('Une section du son doit être récupérée.');const descriptor=part.source??track.source,blob=descriptor?await readPaperAudioSource({...track,assetId:part.assetId,segments:undefined,source:descriptor},document,media,current):await readPaperAsset(asset,media);if(!current())throw Error('Le carnet a changé pendant la préparation du son.');
  if(from===part.offset&&to===part.offset+part.duration){result.push({blob,duration:part.duration,...(descriptor?{source:descriptor}:{})});continue;}
  const source=await wavPcmSource(blob);if(source){const first=Math.floor((from-part.offset)*source.sampleRate),last=Math.min(source.frames,Math.ceil((to-part.offset)*source.sampleRate)),raw=source.raw.slice(first*source.channels*2,last*source.channels*2);const limit=Math.floor(PCM_SECTION_BYTES/(source.channels*2))*(source.channels*2);for(let offset=0;offset<raw.size;offset+=limit){const section=raw.slice(offset,offset+limit);result.push({blob:pcmChunksWav([section],source.sampleRate,source.channels),duration:section.size/(source.channels*2)/source.sampleRate});}}else{const {convertPaperAudio}=await import('./paperAudioConvert');result.push(...await convertPaperAudio(blob,from-part.offset,to-part.offset,{...options,current:()=>current()&&options.current?.()!==false}));}
 }
 return result;
}
/** The WAV header describes all sample sections; original audio containers are never blindly concatenated. */
export async function buildPaperTrackWav(track:PaperAudio,document:PaperDocument,media:NotebookMediaScope,current:()=>boolean=()=>true,options:AudioConversionOptions={}):Promise<Blob>{
 const pieces=await readPaperAudioRange(track,document,media,0,track.duration,current,options),sources=await Promise.all(pieces.map(piece=>wavPcmSource(piece.blob)));
 const uniform=sources.every(source=>source&&source.sampleRate===sources[0]?.sampleRate&&source.channels===sources[0]?.channels);let raw:Blob[]=[],sampleRate=48000,channels=2,size=0;
 if(!uniform&&Math.ceil(track.duration*48000)*4+44>256*1024*1024)throw Error('Cet export WAV dépasse 256 Mo. Choisissez un extrait ; l’original est conservé.');
 const append=(blob:Blob)=>{size+=blob.size;if(size+44>256*1024*1024)throw Error('Cet export WAV dépasse 256 Mo. Le son original et son archive sont conservés.');raw.push(blob);};
 if(uniform){sampleRate=sources[0]!.sampleRate;channels=sources[0]!.channels;for(const source of sources){if(!current())throw Error('Le carnet a changé pendant l’export.');append(source!.raw);}}
 else{const {convertPaperAudio}=await import('./paperAudioConvert');for(const piece of pieces){if(!current())throw Error('Le carnet a changé pendant l’export.');for(const converted of await convertPaperAudio(piece.blob,0,piece.duration,{...options,current:()=>current()&&options.current?.()!==false})){const source=await wavPcmSource(converted.blob);if(!source)throw Error('Le résultat audio est invalide.');append(source.raw);}}}
 return pcmChunksWav(raw,sampleRate,channels);
}
