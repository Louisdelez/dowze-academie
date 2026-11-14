import type {PaperTextFlow} from './paperTextFlow.ts';
import {isPaperStudy,emptyStudy,reviewStudyCard,type PaperStudy,type StudyCard} from './paperStudy.ts';
import { noteBoardId,photoReference,parsePhotoReference } from './notebook.ts';
import {notebookIdentityDigest,notebookDocumentId,legacyNotebookDocumentId} from './notebookIdentity.ts';
import {scanLegacyPaperImages} from './paperLegacyImages.ts';
import {objectPoint} from './paperGeometry.ts';
import {clipPaperInkStroke} from './paperStrokeErase.ts';
import {isPaperMeasurementCalibration,isPaperMeasurementMetadata,paperMeasurementLength,paperMeasurementArea,type PaperMeasurementCalibration,type PaperMeasurementMetadata} from './paperMeasurement.ts';

/** Paper units are independent from CSS pixels, scroll position and viewport size. */
export interface InkPoint { x: number; y: number; time: number; pressure?: number; tiltX?: number; tiltY?: number; twist?: number; nibAngle?:number; /** Derived brush width at a geometric cut; never device pressure. */ renderPressure?:number }
export type PaperPattern = 'plain' | 'ruled' | 'grid' | 'dots';
export interface PaperPage { calibration?:PaperMeasurementCalibration; flowRootId?:string; template?: 'standard'|'cornell'|'music'|'weekly'; spacing?:number; id: string; width: number; height: number; pattern: PaperPattern; color: string; bookmark: boolean; rotation: number; pdf?: { assetId: string; pageNumber: number; text?: string } }
export type PaperStrokeStyle='solid'|'dashed'|'dotted';
export interface PaperImageCrop {x:number;y:number;width:number;height:number}
export interface PaperObject {
  id: string; pageId: string; kind: 'text' | 'ink' | 'image' | 'shape' | 'sticky';
  /** Canonical geometry stays in ink points; physical values are always derived from the page calibration. */
  measurement?:PaperMeasurementMetadata;
  x: number; y: number; width: number; height: number; rotation: number; z: number; locked: boolean;
  textFlow?:PaperTextFlow; textPartition?:string; groupId?: string; markdown?: string; points?: InkPoint[]; color?: string; strokeWidth?: number;
  opacity?:number;
  /** Closed shapes only. Missing fill keeps the original transparent interior. */
  fill?:string;
  /** Fractions of the untouched original image. Missing means the full image. */
  crop?:PaperImageCrop;
  pen?: 'pen' | 'pencil' | 'highlighter' | 'calligraphy'; strokeStyle?:PaperStrokeStyle;mirrorX?:boolean;mirrorY?:boolean;nibAngle?:number;shape?: 'rectangle' | 'ellipse' | 'line' | 'arrow';
  assetId?: string; createdAt: number; audioAnchor?: { sessionId: string; time: number };
}
export interface PaperAsset { id: string; name: string; mediaType: string; serverId?: string; size: number }
export interface PaperAudioSegment {source?:PaperAudioSource;assetId:string;offset:number;duration:number}
export interface PaperAudioSource {originalName?:string;schema:1;mediaType:string;size:number;chunks:{assetId:string;size:number;sha256:string}[]}
export interface PaperAudio { source?:PaperAudioSource; segments?:PaperAudioSegment[];inProgress?:boolean; id: string; assetId: string; name: string; duration: number; startedAt: number }
export interface PaperDocument {
  collaboration?: {schema:1;lineage:string;state:string}; notebookSchema: 3; noteId: string; revision: number; pages: PaperPage[]; objects: PaperObject[];
  assets: PaperAsset[]; audio: PaperAudio[]; study?:PaperStudy; updatedAt: string;
  legacy: { markdown: string; boardId: string; migratedAt: string };
}
export {notebookDocumentId,legacyNotebookDocumentId} from './notebookIdentity.ts';
export const ownsPaperDocument = (type: string, id: string) => (type === 'whiteboard' && id.startsWith('paper-v3-')) || (type === 'preferences' && id === 'paper-library-v1');
/** The generic native metadata synchronizer must preserve legacy notebook provenance too. */
export const ownsNotebookMediaDocument=(type:string,id:string)=>ownsPaperDocument(type,id)||(type==='whiteboard'&&(id==='whiteboard-main'||id.startsWith('note-')));
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 200;
const unique = (items: {id:string}[]) => new Set(items.map(item=>item.id)).size === items.length;
export const paperShapeSupportsFill=(kind:unknown,shape:unknown)=>kind==='shape'&&(shape===undefined||shape==='rectangle'||shape==='ellipse');
/** A literal picker color cannot refer to an external SVG paint server. */
export const isPaperShapeFill=(value:unknown):value is string=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
export function isPaperImageCrop(value:unknown):value is PaperImageCrop{
 if(!record(value)||Object.keys(value).length!==4||!Object.keys(value).every(key=>['x','y','width','height'].includes(key)))return false;
 return [value.x,value.y,value.width,value.height].every(finite)&&Number(value.x)>=0&&Number(value.y)>=0&&Number(value.width)>0&&Number(value.height)>0&&Number(value.x)+Number(value.width)<=1&&Number(value.y)+Number(value.height)<=1;
}
function validMeasurementObject(value:Record<string,unknown>):boolean{
 if(value.measurement===undefined)return true;
 if(value.kind!=='ink'||!isPaperMeasurementMetadata(value.measurement)||!Array.isArray(value.points))return false;
 const count=value.points.length,area=value.measurement.kind==='area';
 if(count<(area?3:2)||count>(area?513:20000))return false;
 try{const points=value.points.map(point=>objectPoint(value as unknown as PaperObject,point));const result=value.measurement.kind==='area'?paperMeasurementArea(points):paperMeasurementLength(points);return result.value>0;}catch{return false;}
}
function validAudioSegments(value:unknown,root:unknown,duration:number,assets:Set<unknown>,metadata:unknown[]):boolean{
 if(!Array.isArray(value)||!value.length||value.length>10000)return false;let offset=0;
 for(const [index,part] of value.entries()){if(!record(part)||!assets.has(part.assetId)||index===0&&part.assetId!==root||!finite(part.offset)||!finite(part.duration)||part.duration<=0||Math.abs(part.offset-offset)>=0.001||(part.source!==undefined&&!validAudioSource(part.source,part.assetId,metadata)))return false;offset+=part.duration;}return Math.abs(duration-offset)<0.001;
}
function validAudioSource(value:unknown,root:unknown,assets:unknown[]):boolean{
 if(!record(value)||value.schema!==1||(value.originalName!==undefined&&(typeof value.originalName!=='string'||value.originalName.length>500))||typeof value.mediaType!=='string'||!/^audio\//.test(value.mediaType)||!Number.isSafeInteger(value.size)||Number(value.size)<=0||!Array.isArray(value.chunks)||!value.chunks.length||value.chunks.length>10000)return false;const ids=new Set<unknown>();let size=0;
 for(const [index,chunk] of value.chunks.entries()){if(!record(chunk)||!id(chunk.assetId)||ids.has(chunk.assetId)||index===0&&chunk.assetId!==root||!Number.isSafeInteger(chunk.size)||!finite(chunk.size)||chunk.size<=0||chunk.size>16*1024*1024||typeof chunk.sha256!=='string'||!/^[a-f0-9]{64}$/.test(chunk.sha256)||!assets.some(a=>record(a)&&a.id===chunk.assetId&&a.size===chunk.size))return false;ids.add(chunk.assetId);size+=chunk.size;}return size===value.size;
}
export function isPaperDocument(value: unknown): value is PaperDocument {
  if (!record(value) || value.notebookSchema!==3 || !id(value.noteId) || !Number.isSafeInteger(value.revision) || Number(value.revision)<0 || typeof value.updatedAt!=='string' || !Number.isFinite(Date.parse(value.updatedAt))) return false;
  if(value.collaboration!==undefined&&(!record(value.collaboration)||value.collaboration.schema!==1||!id(value.collaboration.lineage)||typeof value.collaboration.state!=='string'||value.collaboration.state.length>8*1024*1024*4/3+8))return false;
  if (!Array.isArray(value.pages) || !value.pages.length || value.pages.length>2000 || !Array.isArray(value.objects) || value.objects.length>100000 || !Array.isArray(value.assets) || !Array.isArray(value.audio) || !record(value.legacy) || typeof value.legacy.markdown!=='string' || !id(value.legacy.boardId) || typeof value.legacy.migratedAt!=='string') return false;
  if (!value.pages.every(p=>record(p)&&id(p.id)&&(p.flowRootId===undefined||id(p.flowRootId))&&(p.calibration===undefined||isPaperMeasurementCalibration(p.calibration))&&finite(p.width)&&p.width>=100&&p.width<=20000&&finite(p.height)&&p.height>=100&&p.height<=100000&&['plain','ruled','grid','dots'].includes(String(p.pattern))&&typeof p.color==='string'&&typeof p.bookmark==='boolean'&&finite(p.rotation)&&(p.template===undefined||['standard','cornell','music','weekly'].includes(String(p.template)))&&(p.spacing===undefined||(finite(p.spacing)&&p.spacing>=8&&p.spacing<=100))&&(!p.pdf||(record(p.pdf)&&id(p.pdf.assetId)&&Number.isInteger(p.pdf.pageNumber)&&Number(p.pdf.pageNumber)>=1&&(p.pdf.text===undefined||typeof p.pdf.text==='string'))))) return false;
  const pages = new Set(value.pages.map(p=>p.id));
  if (!value.assets.every(a=>record(a)&&id(a.id)&&typeof a.name==='string'&&typeof a.mediaType==='string'&&finite(a.size)&&a.size>=0&&(a.serverId===undefined||id(a.serverId)))) return false;
  const assets = new Set(value.assets.map(a=>a.id));
  if (!value.objects.every(o=>record(o)&&id(o.id)&&pages.has(o.pageId)&&validMeasurementObject(o)&&['text','ink','image','shape','sticky'].includes(String(o.kind))&&[o.x,o.y,o.width,o.height,o.rotation,o.z,o.createdAt].every(finite)&&Number(o.width)>=0&&Number(o.height)>=0&&typeof o.locked==='boolean'&&(o.opacity===undefined||(finite(o.opacity)&&o.opacity>=0&&o.opacity<=1))&&(o.fill===undefined||paperShapeSupportsFill(o.kind,o.shape)&&isPaperShapeFill(o.fill))&&(o.crop===undefined||o.kind==='image'&&isPaperImageCrop(o.crop))&&(o.strokeStyle===undefined||['solid','dashed','dotted'].includes(String(o.strokeStyle)))&&(o.mirrorX===undefined||typeof o.mirrorX==='boolean')&&(o.mirrorY===undefined||typeof o.mirrorY==='boolean')&&(o.nibAngle===undefined||finite(o.nibAngle))&&(o.textPartition===undefined||id(o.textPartition))&&(o.groupId===undefined||id(o.groupId))&&((o.kind==='text'||o.kind==='sticky')?typeof o.markdown==='string':true)&&(o.kind==='image'?assets.has(o.assetId):true)&&(o.kind==='ink'?Array.isArray(o.points)&&o.points.length>0&&o.points.every(p=>record(p)&&finite(p.x)&&finite(p.y)&&finite(p.time)&&(p.pressure===undefined||(finite(p.pressure)&&p.pressure>=0&&p.pressure<=1))&&(p.renderPressure===undefined||(finite(p.renderPressure)&&p.renderPressure>=0&&p.renderPressure<=1))&&[p.tiltX,p.tiltY,p.twist,p.nibAngle].every(n=>n===undefined||finite(n))):true))) return false;
  if (!value.audio.every(a=>record(a)&&id(a.id)&&assets.has(a.assetId)&&typeof a.name==='string'&&finite(a.duration)&&a.duration>=0&&finite(a.startedAt)&&(a.inProgress===undefined||typeof a.inProgress==='boolean')&&(a.segments===undefined||validAudioSegments(a.segments,a.assetId,a.duration,assets,value.assets as unknown[]))&&(a.source===undefined||a.segments===undefined&&validAudioSource(a.source,a.assetId,value.assets as unknown[])))) return false;
  if(value.study!==undefined&&!isPaperStudy(value.study))return false;
  const audio=new Set(value.audio.map(a=>a.id));
  if(!value.objects.every(o=>o.textFlow===undefined||(o.kind==='text'&&record(o.textFlow)&&o.textFlow.schema===1&&typeof o.textFlow.source==='string'&&o.textFlow.source.length<=200&&Array.isArray(o.textFlow.pageIds)&&o.textFlow.pageIds.length>0&&o.textFlow.pageIds.length<=2000&&o.textFlow.pageIds[0]===o.pageId&&o.textFlow.pageIds.every((p:unknown)=>pages.has(p))&&new Set(o.textFlow.pageIds).size===o.textFlow.pageIds.length&&Array.isArray(o.textFlow.breaks)&&o.textFlow.breaks.length===o.textFlow.pageIds.length+1&&o.textFlow.breaks[0]===0&&(o.textFlow.sourceOffsets===undefined||(Array.isArray(o.textFlow.sourceOffsets)&&o.textFlow.sourceOffsets.length===o.textFlow.breaks.length&&o.textFlow.sourceOffsets[0]===0&&o.textFlow.sourceOffsets.every((n:unknown,i:number)=>Number.isSafeInteger(n)&&Number(n)>=0&&(i===0||Number(n)>=Number(o.textFlow!.sourceOffsets![i-1])))))&&o.textFlow.breaks.every((n:unknown,i:number)=>finite(n)&&n>=0&&(i===0||n>Number(o.textFlow!.breaks[i-1]))))))return false;
  return unique(value.pages) && unique(value.objects) && unique(value.assets) && unique(value.audio) && value.pages.every(p=>!p.pdf||assets.has(p.pdf.assetId)) && value.objects.every(o=>!o.audioAnchor||(record(o.audioAnchor)&&audio.has(o.audioAnchor.sessionId)&&finite(o.audioAnchor.time)&&o.audioAnchor.time>=0));
}
export function blankPage(pageId:string=crypto.randomUUID()): PaperPage { return {id:pageId,width:794,height:1123,pattern:'plain',color:'#ffffff',bookmark:false,rotation:0}; }
/** Reserve existing short identities before allocating replacements: a generated ID must not steal one. */
function legacyEntityIds(noteId:string,prefix:string,values:readonly {sourceId:string;identity?:string}[],addressable:(value:string)=>boolean=id):string[]{
  const reserved=new Set(values.map(value=>`${prefix}${value.sourceId}`).filter(addressable)),used=new Set<string>(),occurrences=new Map<string,number>();
  return values.map(value=>{
    const preferred=`${prefix}${value.sourceId}`,identity=value.identity??value.sourceId,occurrence=occurrences.get(identity)??0;occurrences.set(identity,occurrence+1);
    if(addressable(preferred)&&!used.has(preferred)){used.add(preferred);return preferred;}
    const base=`${prefix}id2-${notebookIdentityDigest(JSON.stringify(['paper-legacy-entity',noteId,prefix,identity,occurrence]))}`;
    let replacement=base,collision=0;while(used.has(replacement)||reserved.has(replacement))replacement=`${base}-${++collision}`;
    used.add(replacement);return replacement;
  });
}
export interface PaperLegacyPhotoIdentity {photoIndex:number;sourceId:string;assetId:string;serverId?:string}
/** Pure plan for the caller to associate original files atomically; no bytes are copied by the model. */
export function legacyPaperPhotoIdentities(noteId:string,legacyBoard:unknown):PaperLegacyPhotoIdentity[]{
  if(!record(legacyBoard)||!Array.isArray(legacyBoard.photos))return [];
  const photos=legacyBoard.photos.flatMap((photo,photoIndex)=>record(photo)&&typeof photo.id==='string'&&photo.id?[
    {photoIndex,sourceId:photo.id,...(id(photo.serverId)?{serverId:photo.serverId}:{})}
  ]:[]);
  const variants=new Map<string,{sourceId:string;identity:string}>();
  for(const photo of photos){const identity=JSON.stringify([photo.sourceId,photo.serverId??null]);if(!variants.has(identity))variants.set(identity,{sourceId:photo.sourceId,identity});}
  // The graph may retain longer object identities, but every image asset must also be transport-addressable.
  const addressable=(value:string)=>{try{return !!parsePhotoReference(photoReference(notebookDocumentId(noteId),value));}catch{return false;}};
  const entries=[...variants.entries()],allocated=legacyEntityIds(noteId,'',entries.map(([,value])=>value),addressable),ids=new Map(entries.map(([identity],index)=>[identity,allocated[index]]));
  return photos.map(photo=>({...photo,assetId:ids.get(JSON.stringify([photo.sourceId,photo.serverId??null]))!}));
}
export function migratePaper(noteId:string,markdown:string,legacyBoard:unknown,now=new Date().toISOString()):PaperDocument {
  const page=blankPage(`page-${noteBoardId(noteId)}`);
  const objects:PaperObject[]=[];const assets:PaperAsset[]=[];
  const old=record(legacyBoard)?legacyBoard:{};const board=record(old.board)?old.board:{};
  const strokes:{stroke:Record<string,unknown>;points:InkPoint[];sourceId:string}[]=[];
  if(Array.isArray(board.strokes))for(const stroke of board.strokes){
    if(!record(stroke)||!Array.isArray(stroke.points))continue;
    const points=stroke.points.filter(p=>record(p)&&finite(p.x)&&finite(p.y)).map(p=>({x:Number(p.x),y:Number(p.y),time:0,...(finite(p.pressure)?{pressure:Math.max(0,Math.min(1,p.pressure))}:{})}));
    if(!points.length)continue;
    strokes.push({stroke,points,sourceId:String(stroke.id??strokes.length)});
  }
  const strokeIds=legacyEntityIds(noteId,'legacy-ink-',strokes);
  for(const [index,{stroke,points}] of strokes.entries()){
    page.height=Math.max(page.height,Math.min(100000,points.reduce((max,p)=>Math.max(max,p.y),0)+100));
    objects.push({id:strokeIds[index],pageId:page.id,kind:'ink',x:0,y:0,width:page.width,height:page.height,rotation:0,z:objects.length+1,locked:false,points,color:typeof stroke.color==='string'?stroke.color:'#20343b',strokeWidth:finite(stroke.width)?stroke.width:3,pen:'pen',createdAt:Date.parse(now)});
  }
  // Preserve text as a first-class object; untouched source remains available for recovery.
  objects.unshift({id:`text-${noteBoardId(noteId)}`,pageId:page.id,kind:'text',x:48,y:48,width:page.width-96,height:page.height-96,rotation:0,z:0,locked:false,markdown,createdAt:Date.parse(now)});
  const photoIdentities=legacyPaperPhotoIdentities(noteId,old),imageIds=legacyEntityIds(noteId,'legacy-image-',photoIdentities),assetIds=new Set<string>();
  const ownDocuments=new Set([noteBoardId(noteId),notebookDocumentId(noteId),legacyNotebookDocumentId(noteId)]);
  const inlinePhotos=new Set(scanLegacyPaperImages(markdown).images.flatMap(image=>image.kind==='photo'&&image.photo&&ownDocuments.has(image.photo.documentId)&&parsePhotoReference(image.url)?[image.photo.id]:[]));
  for(const [index,identity] of photoIdentities.entries()){
    const photo=(old.photos as Record<string,unknown>[])[identity.photoIndex];
    if(!assetIds.has(identity.assetId)){assetIds.add(identity.assetId);assets.push({id:identity.assetId,name:typeof photo.name==='string'?photo.name:'Image',mediaType:'image/png',size:0,...(identity.serverId?{serverId:identity.serverId}:{})});}
    // Only a real Markdown image of this note suppresses a floating photo. Remapped references stay visible until the atomic file planner rewrites them.
    const inline=identity.assetId===identity.sourceId&&inlinePhotos.has(identity.sourceId);
    if(!inline)objects.push({id:imageIds[index],pageId:page.id,kind:'image',x:48,y:Math.min(page.height-280,100+(index+1)*260),width:320,height:240,rotation:0,z:objects.length,locked:false,assetId:identity.assetId,createdAt:Date.parse(now)});
  }
  return {notebookSchema:3,noteId,revision:0,pages:[page],objects,assets,audio:[],updatedAt:now,legacy:{markdown,boardId:noteBoardId(noteId),migratedAt:now}};
}
export type PaperCommand =
 | {type:'upsert-object';object:PaperObject}
 | {type:'patch-object';id:string;patch:Partial<Omit<PaperObject,'id'|'pageId'|'kind'>>}
 | {type:'remove-objects';ids:string[]}
 | {type:'insert-page';page:PaperPage;afterId?:string}
 | {type:'update-page';page:PaperPage}
 | {type:'remove-page';id:string}
 | {type:'reorder-pages';ids:string[]}
 | {type:'partition-text-flow';id:string;expected:PaperObject;objects:PaperObject[]}
 | {type:'add-asset';asset:PaperAsset}
 | {type:'add-audio';audio:PaperAudio}
 | {type:'study-card';card:StudyCard}
 | {type:'remove-study-card';id:string}
 | {type:'study-language';language:string}
 | {type:'review-card';id:string;quality:number;reviewId:string}
 | {type:'restore';document:PaperDocument}
 | {type:'batch';commands:PaperCommand[]};
/** Entire command is validated before a revision is committed, including multi-object edits. */
export function applyPaperCommand(document:PaperDocument,command:PaperCommand,now=new Date().toISOString()):PaperDocument {
  const apply=(d:PaperDocument,c:PaperCommand):PaperDocument=>{
    switch(c.type){
      case 'batch':return c.commands.reduce(apply,d);
      case 'study-card':{const study=d.study??emptyStudy();return {...d,study:{...study,cards:[...study.cards.filter(card=>card.id!==c.card.id),c.card]}};}
      case 'remove-study-card':{const study=d.study??emptyStudy();return {...d,study:{...study,cards:study.cards.filter(card=>card.id!==c.id)}};}
      case 'study-language':return {...d,study:{...(d.study??emptyStudy()),language:c.language}};
      case 'review-card':{const study=d.study??emptyStudy();return {...d,study:{...study,cards:study.cards.map(card=>card.id===c.id?reviewStudyCard(card,c.quality,c.reviewId,now):card)}};}

      case 'restore':if(c.document.noteId!==d.noteId||!isPaperDocument(c.document))throw Error('Cette version appartient à une autre note.');return {...d,pages:c.document.pages,objects:c.document.objects,assets:c.document.assets,audio:c.document.audio,...(c.document.study?{study:c.document.study}:{study:undefined})};
      case 'upsert-object':return {...d,objects:[...d.objects.filter(o=>o.id!==c.object.id),c.object]};
      case 'patch-object':return {...d,objects:d.objects.map(o=>o.id===c.id?{...o,...c.patch}:o)};
      case 'remove-objects':return {...d,objects:d.objects.filter(o=>o.locked||!c.ids.includes(o.id))};
      case 'insert-page':{const pages=[...d.pages];const i=c.afterId?pages.findIndex(p=>p.id===c.afterId):-1;pages.splice(i<0?pages.length:i+1,0,c.page);return {...d,pages};}
      case 'update-page':return {...d,pages:d.pages.map(p=>p.id===c.page.id?c.page:p)};
      case 'remove-page':if(d.objects.some(o=>o.textFlow&&o.textFlow.pageIds.length>1&&o.textFlow.pageIds.includes(c.id)))throw Error('Cette page appartient à un texte continu. Retirez le passage dans le texte ; ses autres pages et annotations restent conservées.');if(d.pages.length===1)throw Error('Gardez au moins une page.');return {...d,pages:d.pages.filter(p=>p.id!==c.id),objects:d.objects.filter(o=>o.pageId!==c.id)};
      case 'partition-text-flow':{
        const root=d.objects.find(o=>o.id===c.id),flow=root?.textFlow;
        if(!root||root.kind!=='text'||!flow||flow.pageIds.length<2||JSON.stringify(root)!==JSON.stringify(c.expected))throw Error('Le texte a changé pendant la préparation des pages. Sa version actuelle est conservée.');
        if(!c.objects.length||!c.objects.some(o=>o.id===root.id)||c.objects.some(o=>o.kind!=='text'||!flow.pageIds.includes(o.pageId)||o.textFlow!==undefined||!id(o.textPartition))||new Set(c.objects.map(o=>o.pageId)).size!==c.objects.length||c.objects.some(o=>o.id!==root.id&&d.objects.some(n=>n.id===o.id)))throw Error('Le découpage des pages est invalide.');
        const cards=d.study?.cards.map(card=>{if(card.source?.objectId!==root.id)return card;const candidates=c.objects.filter(o=>o.markdown?.includes(card.source!.quote));const target=candidates.find(o=>o.pageId===card.source!.pageId)??(candidates.length===1?candidates[0]:undefined);return target?{...card,source:{...card.source,objectId:target.id,pageId:target.pageId,revision:d.revision+1}}:card;});
        return {...d,objects:[...d.objects.filter(o=>o.id!==root.id),...c.objects],pages:d.pages.map(p=>p.flowRootId===root.id?{...p,flowRootId:undefined}:p),...(d.study&&cards?{study:{...d.study,cards}}:{})};
      }
      case 'reorder-pages':{
        if(c.ids.length!==d.pages.length||new Set(c.ids).size!==d.pages.length||c.ids.some(id=>!d.pages.some(p=>p.id===id)))throw Error('Ordre des pages invalide.');
        if(d.objects.some(o=>o.textFlow&&o.textFlow.pageIds.length>1&&o.textFlow.pageIds.some((p,i)=>c.ids.indexOf(p)!==c.ids.indexOf(o.pageId)+i)))throw Error('Préparez le texte continu avant de déplacer ses pages.');
        return {...d,pages:c.ids.map(id=>d.pages.find(p=>p.id===id)!)};
      }
      case 'add-asset':return {...d,assets:[...d.assets.filter(a=>a.id!==c.asset.id),c.asset]};
      case 'add-audio':return {...d,audio:[...d.audio.filter(a=>a.id!==c.audio.id),c.audio]};
    }
  };
  const next={...apply(document,command),revision:document.revision+1,updatedAt:now};
  if(!isPaperDocument(next))throw Error('Cette modification produirait une note invalide.');
  return next;
}
export function distanceToSegment(p:{x:number;y:number},a:{x:number;y:number},b:{x:number;y:number}){
  const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
  if(!length)return Math.hypot(p.x-a.x,p.y-a.y);
  if(!Number.isFinite(length))return Infinity;
  const ux=dx/length,uy=dy/length,t=Math.max(0,Math.min(length,(p.x-a.x)*ux+(p.y-a.y)*uy));
  return Math.hypot(p.x-a.x-t*ux,p.y-a.y-t*uy);
}
/** A swept eraser tests original segments; whole-stroke deletion needs no samples. */
function sweptSegmentHit(a:{x:number;y:number},b:{x:number;y:number},from:{x:number;y:number},to:{x:number;y:number},radius:number):boolean{
 if(Math.max(a.x,b.x)+radius<Math.min(from.x,to.x)||Math.min(a.x,b.x)-radius>Math.max(from.x,to.x)||Math.max(a.y,b.y)+radius<Math.min(from.y,to.y)||Math.min(a.y,b.y)-radius>Math.max(from.y,to.y))return false;
 const side=(p:{x:number;y:number},q:{x:number;y:number},r:{x:number;y:number})=>{const dx=q.x-p.x,dy=q.y-p.y,length=Math.hypot(dx,dy);if(!Number.isFinite(length))return NaN;return length?Math.sign(dx/length*(r.y-p.y)-dy/length*(r.x-p.x)):0;};
 const s1=side(a,b,from),s2=side(a,b,to),s3=side(from,to,a),s4=side(from,to,b);
 const boundsOverlap=Math.max(Math.min(a.x,b.x),Math.min(from.x,to.x))<=Math.min(Math.max(a.x,b.x),Math.max(from.x,to.x))&&Math.max(Math.min(a.y,b.y),Math.min(from.y,to.y))<=Math.min(Math.max(a.y,b.y),Math.max(from.y,to.y));
 if(boundsOverlap&&[s1,s2,s3,s4].every(Number.isFinite)&&(s1===0||s2===0||s1!==s2)&&(s3===0||s4===0||s3!==s4))return true;
 return Math.min(distanceToSegment(a,from,to),distanceToSegment(b,from,to),distanceToSegment(from,a,b),distanceToSegment(to,a,b))<=radius;
}
/** Split at the eraser's swept path, including sparse strokes crossing between samples. */
export function eraseInk(object:PaperObject,from:{x:number;y:number},to:{x:number;y:number},radius:number,whole:boolean):PaperObject[] {
  const pts=object.points??[];if(object.kind!=='ink'||object.locked||!pts.length)return [object];
  if(whole||object.measurement){
   const reach=radius+(object.strokeWidth??3)/2;if(!Number.isFinite(reach)||reach<0||![from.x,from.y,to.x,to.y].every(Number.isFinite))return [object];
   let previous=objectPoint(object,pts[0]);if(distanceToSegment(previous,from,to)<=reach)return [];
   for(let i=1;i<pts.length;i++){const next=objectPoint(object,pts[i]);if(sweptSegmentHit(previous,next,from,to,reach))return [];previous=next;}return [object];
  }
  const result=clipPaperInkStroke(object,from,to,radius);if(!result.changed)return [object];
  return result.fragments.map(points=>({...object,id:`ink-fragment-${crypto.randomUUID()}`,points:[...points]}));
}
export interface PaperHistory { past:PaperDocument[]; future:PaperDocument[] }
export const emptyPaperHistory=():PaperHistory=>({past:[],future:[]});
export function recordPaperHistory(history:PaperHistory,before:PaperDocument):PaperHistory {return {past:[...history.past.slice(-49),before],future:[]};}
export function travelPaperHistory(history:PaperHistory,current:PaperDocument,direction:'undo'|'redo'):{history:PaperHistory;document:PaperDocument}|null {
  const stack=direction==='undo'?history.past:history.future;const selected=stack.at(-1);if(!selected)return null;
  const document={...selected,revision:current.revision+1,updatedAt:new Date().toISOString()};
  return {document,history:direction==='undo'?{past:history.past.slice(0,-1),future:[...history.future,current]}:{past:[...history.past,current],future:history.future.slice(0,-1)}};
}
