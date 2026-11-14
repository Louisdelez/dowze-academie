import type {Draft,DraftKey,Snapshot,NotebookTransferCommit} from '../../pwa/src/storage';
import type {InkPoint,PaperObject} from './notebookDocument';
import {isPaperDocument} from './notebookDocument.ts';
import {notebookDocumentId} from './notebookIdentity.ts';
import type {PaperInkPointRange} from './paperInkInput';

/** On-disk chunk capacity, independent of a future transport batch size. */
export const PAPER_INK_PREFIX_CHUNK_POINTS=4096;
export const PAPER_INK_PREFIX_APPEND_POINTS=4096;
/** Same capture ceiling as paperInkInput; transport batches never lower it. */
export const PAPER_INK_PREFIX_MAX_POINTS=250000;
const MAX_OBJECT_JSON=64*1024*1024;
export interface PaperInkPrefixScope {readonly accountId:string;readonly spaceId:string;readonly noteId:string}
export interface PaperInkPrefixMetadata {
 readonly ownerKey:string;readonly generation:string|number;readonly pageId:string;
 readonly pointerType:'mouse'|'pen'|'touch';readonly pen:'pen'|'pencil'|'calligraphy'|'highlighter';readonly createdAt:number;
 readonly geometry:{readonly width:number;readonly height:number;readonly rotation:number;readonly geometryKey?:string};
 readonly style:{readonly color:string;readonly width:number;readonly opacity:number;readonly strokeStyle?:'solid'|'dashed'|'dotted'};
}
export interface PaperInkPrefixPreparedObject {
 readonly objectId:string;readonly pageId:string;readonly fingerprint:string;
 readonly pen:PaperInkPrefixMetadata['pen'];readonly style:PaperInkPrefixMetadata['style'];
}
export interface PaperInkPrefixJournalHeader extends PaperInkPrefixScope,PaperInkPrefixMetadata {
 readonly schema:1;readonly kind:'paper-ink-prefix-journal';readonly id:string;readonly revision:number;
 readonly state:'active'|'prepared'|'interrupted'|'canonical'|'discarded';
 /** Only this committed prefix is recoverable after a killed process. A RAM
  * suffix and even totalSeen are not proof that its points reached storage. */
 readonly confirmedCursor:number;readonly totalSeen:number;readonly chunkCount:number;
 readonly prepared?:PaperInkPrefixPreparedObject;readonly finalPointCount?:number;readonly cause?:string;
 readonly canonicalObjectId?:string;
}
export interface PaperInkPrefixJournalChunk extends PaperInkPrefixScope {
 readonly schema:1;readonly kind:'paper-ink-prefix-chunk';readonly id:string;readonly index:number;
 readonly points:readonly Readonly<InkPoint>[];
}
export interface PaperInkPrefixJournalStorage {
 read:(key:string)=>Promise<Snapshot|undefined>;
 /** Enumerate this header namespace only; do not load raw chunk values. */
 list:(accountId:string,spaceId:string,headerPrefix:string)=>Promise<Snapshot[]>;
 /** Must check all destinations atomically and resolve only after commit.
  * The current IndexedDB adapter uses its transaction-complete contract;
  * real process/power-loss durability requires separate browser/native QA. */
 commit:(plan:NotebookTransferCommit,current:()=>boolean)=>Promise<void>;
 deletionKey:(identity:DraftKey)=>string;
}
export interface PaperInkPrefixAppendAcknowledgement {readonly header:PaperInkPrefixJournalHeader;readonly confirmedCursor:number}
const storage=async():Promise<PaperInkPrefixJournalStorage>=>{const s=await import('../../pwa/src/storage');return {read:s.getSnapshot,list:s.listSnapshotsByPrefix,commit:s.commitNotebookTransfer,deletionKey:s.notebookDeletionKey};};
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const integer=(v:unknown,max=Number.MAX_SAFE_INTEGER):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=max;
const text=(v:unknown,max=2000):v is string=>typeof v==='string'&&v.length>0&&v.length<=max;
const date=(v:unknown):v is number=>finite(v)&&Math.abs(v)<=8640000000000000;
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const sameScope=(a:PaperInkPrefixScope,b:PaperInkPrefixScope)=>a.accountId===b.accountId&&a.spaceId===b.spaceId&&a.noteId===b.noteId;
const pointKeys=new Set(['x','y','time','pressure','tiltX','tiltY','twist','nibAngle','renderPressure']);
const isPoint=(p:unknown):p is InkPoint=>record(p)&&Object.keys(p).every(k=>pointKeys.has(k))&&finite(p.x)&&finite(p.y)&&finite(p.time)&&p.time>=0
 &&['pressure','renderPressure'].every(k=>p[k]===undefined||finite(p[k])&&p[k]>=0&&p[k]<=1)&&['tiltX','tiltY','twist','nibAngle'].every(k=>p[k]===undefined||finite(p[k]));
const ordered=(points:readonly InkPoint[])=>points.every((p,i)=>isPoint(p)&&(i===0||p.time>=points[i-1].time));
const copyPoint=(p:InkPoint):Readonly<InkPoint>=>Object.freeze({...p});
const authoring=new Set(['pen','pencil','calligraphy','highlighter']);
const styleKeys=new Set(['color','width','opacity','strokeStyle']),geometryKeys=new Set(['width','height','rotation','geometryKey']);
const validStyle=(style:unknown):style is PaperInkPrefixMetadata['style']=>record(style)&&Object.keys(style).every(k=>styleKeys.has(k))&&text(style.color)&&finite(style.width)&&style.width>0&&finite(style.opacity)&&style.opacity>=0&&style.opacity<=1&&(style.strokeStyle===undefined||['solid','dashed','dotted'].includes(String(style.strokeStyle)));
const validMetadata=(m:PaperInkPrefixMetadata)=>text(m.ownerKey)&&(text(m.generation)||integer(m.generation))&&text(m.pageId,200)&&['mouse','pen','touch'].includes(m.pointerType)&&authoring.has(m.pen)&&date(m.createdAt)
 &&record(m.geometry)&&Object.keys(m.geometry).every(k=>geometryKeys.has(k))&&finite(m.geometry.width)&&m.geometry.width>0&&finite(m.geometry.height)&&m.geometry.height>0&&finite(m.geometry.rotation)&&(m.geometry.geometryKey===undefined||text(m.geometry.geometryKey))
 &&validStyle(m.style);
const captureStyle=(style:PaperInkPrefixMetadata['style']):PaperInkPrefixMetadata['style']=>Object.freeze({color:style.color,width:style.width,opacity:style.opacity,...(style.strokeStyle===undefined?{}:{strokeStyle:style.strokeStyle})});
const sameStyle=(a:PaperInkPrefixMetadata['style'],b:PaperInkPrefixMetadata['style'])=>a.color===b.color&&a.width===b.width&&a.opacity===b.opacity&&a.strokeStyle===b.strokeStyle;
const captureScope=(scope:PaperInkPrefixScope):PaperInkPrefixScope=>Object.freeze({accountId:scope.accountId,spaceId:scope.spaceId,noteId:scope.noteId});
const metadata=(m:PaperInkPrefixMetadata):PaperInkPrefixMetadata=>({ownerKey:m.ownerKey,generation:m.generation,pageId:m.pageId,pointerType:m.pointerType,pen:m.pen,createdAt:m.createdAt,
 geometry:{width:m.geometry.width,height:m.geometry.height,rotation:m.geometry.rotation,...(m.geometry.geometryKey===undefined?{}:{geometryKey:m.geometry.geometryKey})},
 style:{color:m.style.color,width:m.style.width,opacity:m.style.opacity,...(m.style.strokeStyle===undefined?{}:{strokeStyle:m.style.strokeStyle})}});
const capturePrepared=(p:PaperInkPrefixPreparedObject):PaperInkPrefixPreparedObject=>Object.freeze({objectId:p.objectId,pageId:p.pageId,fingerprint:p.fingerprint,pen:p.pen,style:captureStyle(p.style)});
const freezeHeader=(h:PaperInkPrefixJournalHeader):PaperInkPrefixJournalHeader=>Object.freeze({...h,geometry:Object.freeze({...h.geometry}),style:captureStyle(h.style),...(h.prepared?{prepared:capturePrepared(h.prepared)}:{})});
const preparedObject=(v:unknown):v is PaperInkPrefixPreparedObject=>{
 return record(v)&&Object.keys(v).every(k=>['objectId','pageId','fingerprint','pen','style'].includes(k))&&text(v.objectId,200)&&text(v.pageId,200)&&typeof v.fingerprint==='string'&&/^[a-f0-9]{64}$/.test(v.fingerprint)&&authoring.has(String(v.pen))&&validStyle(v.style);
};
const objectKeys=new Set(['id','pageId','kind','x','y','width','height','rotation','z','locked','createdAt','points','color','strokeWidth','opacity','strokeStyle','pen','mirrorX','mirrorY','nibAngle','groupId','audioAnchor']);
function validObject(v:unknown):v is PaperObject {
 return record(v)&&Object.keys(v).every(k=>objectKeys.has(k))&&text(v.id,200)&&text(v.pageId,200)&&v.kind==='ink'&&[v.x,v.y,v.width,v.height,v.rotation,v.z].every(finite)&&date(v.createdAt)&&Number(v.width)>=0&&Number(v.height)>=0&&typeof v.locked==='boolean'
  &&Array.isArray(v.points)&&v.points.length>0&&v.points.length<=PAPER_INK_PREFIX_MAX_POINTS&&ordered(v.points)&&text(v.color)&&finite(v.strokeWidth)&&v.strokeWidth>0&&finite(v.opacity)&&v.opacity>=0&&v.opacity<=1&&authoring.has(String(v.pen))
  &&(v.strokeStyle===undefined||['solid','dashed','dotted'].includes(String(v.strokeStyle)))&&(v.mirrorX===undefined||typeof v.mirrorX==='boolean')&&(v.mirrorY===undefined||typeof v.mirrorY==='boolean')&&(v.nibAngle===undefined||finite(v.nibAngle))
  &&(v.groupId===undefined||text(v.groupId,200))&&(v.audioAnchor===undefined||record(v.audioAnchor)&&Object.keys(v.audioAnchor).every(k=>k==='sessionId'||k==='time')&&text(v.audioAnchor.sessionId,200)&&finite(v.audioAnchor.time)&&v.audioAnchor.time>=0);
}
const headerKeys=new Set(['accountId','spaceId','noteId','ownerKey','generation','pageId','pointerType','pen','createdAt','geometry','style','schema','kind','id','revision','state','confirmedCursor','totalSeen','chunkCount','prepared','finalPointCount','cause','canonicalObjectId']);
export function isPaperInkPrefixJournalHeader(value:unknown):value is PaperInkPrefixJournalHeader {
 try{
  if(!record(value)||!Object.keys(value).every(k=>headerKeys.has(k)))return false;const h=value as unknown as PaperInkPrefixJournalHeader;
  if(h.schema!==1||h.kind!=='paper-ink-prefix-journal'||!text(h.id,200)||![h.accountId,h.spaceId,h.noteId].every(v=>text(v))||!validMetadata(h)||!integer(h.revision)||!integer(h.confirmedCursor,PAPER_INK_PREFIX_MAX_POINTS)||!integer(h.totalSeen,PAPER_INK_PREFIX_MAX_POINTS)||h.totalSeen<h.confirmedCursor||h.chunkCount!==Math.ceil(h.confirmedCursor/PAPER_INK_PREFIX_CHUNK_POINTS)||!['active','prepared','interrupted','canonical','discarded'].includes(h.state))return false;
  if(h.cause!==undefined&&!text(h.cause)||h.prepared!==undefined&&(!preparedObject(h.prepared)||h.prepared.pageId!==h.pageId||h.prepared.pen!==h.pen||!sameStyle(h.prepared.style,h.style))||h.finalPointCount!==undefined&&h.finalPointCount!==h.confirmedCursor)return false;
  if(h.state==='active'&&(h.prepared!==undefined||h.finalPointCount!==undefined||h.cause!==undefined||h.canonicalObjectId!==undefined))return false;
  if(h.state==='prepared'&&(!h.prepared||h.finalPointCount!==h.confirmedCursor||h.cause!==undefined||h.canonicalObjectId!==undefined))return false;
  if(h.state==='interrupted'&&(!h.cause||h.finalPointCount!==h.confirmedCursor||h.prepared!==undefined||h.canonicalObjectId!==undefined))return false;
  if(h.state==='canonical'&&(!h.prepared||h.finalPointCount!==h.confirmedCursor||h.canonicalObjectId!==h.prepared.objectId))return false;
  if(h.state==='discarded'&&(!h.cause||h.finalPointCount!==h.confirmedCursor||h.canonicalObjectId!==undefined))return false;
  return h.confirmedCursor>0||h.state==='active'||h.state==='discarded';
 }catch{return false;}
}
const assertHeader=(h:PaperInkPrefixJournalHeader)=>{if(!isPaperInkPrefixJournalHeader(h))throw Error('Le journal du préfixe est invalide. Son buffer doit rester retenu.');};
const captureHeader=(h:PaperInkPrefixJournalHeader)=>{assertHeader(h);return freezeHeader(h);};
const sameAdmission=(a:PaperInkPrefixJournalHeader,b:PaperInkPrefixJournalHeader)=>sameScope(a,b)&&a.id===b.id&&equal(metadata(a),metadata(b));
export const paperInkPrefixJournalPrefix=(scope:PaperInkPrefixScope)=>`paper-ink-prefix-header|${JSON.stringify([scope.accountId,scope.spaceId,scope.noteId])}|`;
export const paperInkPrefixJournalChunksPrefix=(scope:PaperInkPrefixScope)=>`paper-ink-prefix-chunks|${JSON.stringify([scope.accountId,scope.spaceId,scope.noteId])}|`;
export const paperInkPrefixJournalKey=(scope:PaperInkPrefixScope,id:string)=>paperInkPrefixJournalPrefix(scope)+JSON.stringify(id);
export const paperInkPrefixJournalChunkKey=(scope:PaperInkPrefixScope,id:string,index:number)=>paperInkPrefixJournalChunksPrefix(scope)+JSON.stringify(id)+`|chunk-${index}`;
const row=(h:PaperInkPrefixScope,key:string,value:unknown):Snapshot=>({key,accountId:h.accountId,spaceId:h.spaceId,value});
const owns=(r:Snapshot,h:PaperInkPrefixScope)=>r.accountId===h.accountId&&r.spaceId===h.spaceId;
const bump=(h:PaperInkPrefixJournalHeader)=>{if(h.revision===Number.MAX_SAFE_INTEGER)throw Error('Le journal a atteint sa limite de révision. Le préfixe reste conservé.');return h.revision+1;};
const identity=(scope:PaperInkPrefixScope):DraftKey=>({accountId:scope.accountId,spaceId:scope.spaceId,type:'whiteboard',documentId:notebookDocumentId(scope.noteId)});
const plan=(h:PaperInkPrefixJournalHeader,snapshots:Snapshot[],checks:NotebookTransferCommit['snapshotChecks'],draftChecks:NotebookTransferCommit['draftChecks']=[]):NotebookTransferCommit=>({target:{accountId:h.accountId,spaceId:h.spaceId},sources:[],drafts:[],blobs:[],snapshots,snapshotChecks:checks,draftChecks,blobChecks:[]});
async function storedHeader(expected:PaperInkPrefixJournalHeader,store:PaperInkPrefixJournalStorage,allowAbsent=false){
 expected=captureHeader(expected);const key=paperInkPrefixJournalKey(expected,expected.id),snapshot=await store.read(key);
 if(!snapshot){if(allowAbsent&&expected.state==='active'&&expected.revision===0&&expected.confirmedCursor===0)return {key,snapshot,header:expected};throw Error('Le préfixe confirmé doit être retrouvé avant de continuer.');}
 if(!owns(snapshot,expected)||snapshot.key!==key||!isPaperInkPrefixJournalHeader(snapshot.value)||!sameAdmission(expected,snapshot.value))throw Error('Une autre origine ou version occupe ce journal. Aucun préfixe n’est remplacé.');
 return {key,snapshot,header:freezeHeader(snapshot.value)};
}
function chunk(snapshot:Snapshot|undefined,header:PaperInkPrefixJournalHeader,index:number):PaperInkPrefixJournalChunk {
 const c=snapshot?.value as PaperInkPrefixJournalChunk|undefined,key=paperInkPrefixJournalChunkKey(header,header.id,index),size=Math.min(PAPER_INK_PREFIX_CHUNK_POINTS,header.confirmedCursor-index*PAPER_INK_PREFIX_CHUNK_POINTS);
 if(!snapshot||snapshot.key!==key||!owns(snapshot,header)||!record(c)||!Object.keys(c).every(k=>['accountId','spaceId','noteId','schema','kind','id','index','points'].includes(k))||c.schema!==1||c.kind!=='paper-ink-prefix-chunk'||c.id!==header.id||c.index!==index||!sameScope(c,header)||!Array.isArray(c.points)||size<=0||c.points.length!==size||!ordered(c.points))throw Error('Un fragment confirmé du préfixe est manquant ou invalide.');
 return c;
}

/** Allocate one captured admission identity (caller supplies its stable UUID).
 * No storage write, API object or live callback is made part of the header. */
export function createPaperInkPrefixJournal(scope:PaperInkPrefixScope,id:string,meta:PaperInkPrefixMetadata):PaperInkPrefixJournalHeader {
 const header=freezeHeader({accountId:scope.accountId,spaceId:scope.spaceId,noteId:scope.noteId,...metadata(meta),schema:1,kind:'paper-ink-prefix-journal',id,revision:0,state:'active',confirmedCursor:0,totalSeen:0,chunkCount:0});assertHeader(header);return header;
}
/** Only the delta is copied. Read/CAS the header and at most two touched chunks;
 * a full old prefix is never reloaded or rewritten on every250ms checkpoint.
 * Older identical packets can be acknowledged after a terminal transition, but
 * new suffixes or divergent retries can never reopen that journal. */
export async function appendPaperInkPrefixJournal(expected:PaperInkPrefixJournalHeader,input:PaperInkPointRange,provided?:PaperInkPrefixJournalStorage):Promise<PaperInkPrefixAppendAcknowledgement> {
 expected=captureHeader(expected);
 if(!integer(input.from,PAPER_INK_PREFIX_MAX_POINTS)||!integer(input.to,PAPER_INK_PREFIX_MAX_POINTS)||!integer(input.total,PAPER_INK_PREFIX_MAX_POINTS)||input.to<=input.from||input.total<input.to||!Array.isArray(input.points)||input.points.length!==input.to-input.from||input.points.length>PAPER_INK_PREFIX_APPEND_POINTS||!ordered(input.points))throw Error('Le suffixe du trait est incomplet ou invalide.');
 input=Object.freeze({from:input.from,to:input.to,total:input.total,points:Object.freeze(input.points.map(copyPoint))});
 const points=input.points,store=provided??await storage(),stored=await storedHeader(expected,store,true),h=stored.header;
 const cache=new Map<number,Snapshot|undefined>();const read=async(index:number)=>{if(!cache.has(index))cache.set(index,await store.read(paperInkPrefixJournalChunkKey(h,h.id,index)));return cache.get(index);};
 if(input.to<=h.confirmedCursor){
  for(let at=input.from;at<input.to;){const index=Math.floor(at/PAPER_INK_PREFIX_CHUNK_POINTS),c=chunk(await read(index),h,index),offset=at%PAPER_INK_PREFIX_CHUNK_POINTS,length=Math.min(input.to-at,c.points.length-offset);if(length<=0||!equal(c.points.slice(offset,offset+length),points.slice(at-input.from,at-input.from+length)))throw Error('Un suffixe différent occupe déjà ces points confirmés.');at+=length;}
  return {header:h,confirmedCursor:input.to};
 }
 if(h.state!=='active'||input.from!==h.confirmedCursor)throw Error('Le journal est fermé ou son curseur a changé. Aucun suffixe n’est ajouté.');
 if(input.from>0){const index=Math.floor((input.from-1)/PAPER_INK_PREFIX_CHUNK_POINTS),previous=chunk(await read(index),h,index);if(points[0].time<previous.points.at(-1)!.time)throw Error('Le suffixe ne suit pas l’ordre des points admis.');}
 const snapshots:Snapshot[]=[],checks:NotebookTransferCommit['snapshotChecks']=[{key:stored.key,expected:stored.snapshot}];
 for(let at=input.from;at<input.to;){
  const index=Math.floor(at/PAPER_INK_PREFIX_CHUNK_POINTS),offset=at%PAPER_INK_PREFIX_CHUNK_POINTS,key=paperInkPrefixJournalChunkKey(h,h.id,index),old=await read(index);
  if(offset===0&&old)throw Error('Une autre version occupe le nouveau fragment du trait.');
  const prefix=offset?chunk(old,h,index).points:[];if(prefix.length!==offset)throw Error('Le fragment ouvert ne correspond pas au curseur confirmé.');
  const length=Math.min(input.to-at,PAPER_INK_PREFIX_CHUNK_POINTS-offset),values=Object.freeze([...prefix,...points.slice(at-input.from,at-input.from+length)]),value:PaperInkPrefixJournalChunk=Object.freeze({accountId:h.accountId,spaceId:h.spaceId,noteId:h.noteId,schema:1,kind:'paper-ink-prefix-chunk',id:h.id,index,points:values});
  snapshots.push(row(h,key,value));checks.push({key,expected:old});at+=length;
 }
 const next=freezeHeader({...h,revision:bump(h),confirmedCursor:input.to,totalSeen:Math.max(h.totalSeen,input.total),chunkCount:Math.ceil(input.to/PAPER_INK_PREFIX_CHUNK_POINTS)});snapshots.push(row(h,stored.key,next));
 await store.commit(plan(h,snapshots,checks),()=>true);return {header:next,confirmedCursor:input.to};
}

/** Canonical JSON sorts object keys recursively; array/point order is exact.
 * Serialize once per final candidate, SHA-256 its UTF-8 bytes, and retain only
 * the small descriptor. Raw points stay in chunks and are never stored twice in
 * headers or reparsed by the header listing. No fallback noncrypto hash exists. */
const stableJSON=(value:unknown)=>JSON.stringify(value,(_key,child:unknown)=>record(child)?Object.fromEntries(Object.keys(child).sort().map(key=>[key,child[key]])):child);
async function objectFingerprint(serialized:string):Promise<string>{
 if(serialized.length>MAX_OBJECT_JSON)throw Error('L’objet attendu dépasse la taille prise en charge. Son préfixe reste conservé.');
 if(!globalThis.crypto?.subtle)throw Error('SHA-256 est indisponible. Le préfixe reste conservé sans confirmation canonique.');
 const digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(serialized));return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export async function capturePaperInkPrefixObject(object:PaperObject):Promise<PaperInkPrefixPreparedObject> {
 if(!validObject(object))throw Error('L’objet attendu ne correspond pas à un trait valide.');
 const objectId=object.id,pageId=object.pageId,pen=object.pen!,style=captureStyle({color:object.color!,width:object.strokeWidth!,opacity:object.opacity!,strokeStyle:object.strokeStyle}),serialized=stableJSON(object);
 const fingerprint=await objectFingerprint(serialized);return Object.freeze({objectId,pageId,fingerprint,pen,style});
}
export async function preparePaperInkPrefixCanonical(expected:PaperInkPrefixJournalHeader,finalPointCount:number,object:PaperInkPrefixPreparedObject,provided?:PaperInkPrefixJournalStorage):Promise<PaperInkPrefixJournalHeader> {
 expected=captureHeader(expected);if(!preparedObject(object))throw Error('La preuve de l’objet attendu est invalide.');const captured=capturePrepared(object),store=provided??await storage(),stored=await storedHeader(expected,store),h=stored.header;
 if(!integer(finalPointCount,PAPER_INK_PREFIX_MAX_POINTS)||finalPointCount!==h.confirmedCursor||finalPointCount===0)throw Error('Tous les points finaux doivent être confirmés avant la préparation canonique.');
 if(h.state==='prepared'||h.state==='canonical'){if(h.finalPointCount===finalPointCount&&equal(h.prepared,captured))return h;throw Error('Un autre objet attendu occupe ce préfixe préparé.');}
 if(h.state!=='active')throw Error('Ce préfixe est déjà interrompu ou annulé. Il ne peut pas publier un trait automatiquement.');
 if(captured.pageId!==h.pageId||captured.pen!==h.pen||!sameStyle(captured.style,h.style))throw Error('La page ou le style attendu ne correspond pas au contact d’origine.');
 const next=freezeHeader({...h,revision:bump(h),state:'prepared',prepared:captured,finalPointCount});await store.commit(plan(h,[row(h,stored.key,next)],[{key:stored.key,expected:stored.snapshot}]),()=>true);return next;
}
/** A final preserve does not rewrite a prepared expectation: after a crash the
 * canonical object may already exist, but its terminal marker may be missing.
 * Retaining that expectation lets a future scoped proof prevent duplicates. */
export async function interruptPaperInkPrefixJournal(expected:PaperInkPrefixJournalHeader,cause:string,finalPointCount:number,provided?:PaperInkPrefixJournalStorage):Promise<PaperInkPrefixJournalHeader> {
 expected=captureHeader(expected);if(!text(cause))throw Error('La cause d’interruption est invalide.');const store=provided??await storage(),stored=await storedHeader(expected,store),h=stored.header;
 if(h.state==='canonical'||h.state==='discarded')return h;
 if(!integer(finalPointCount,PAPER_INK_PREFIX_MAX_POINTS)||finalPointCount===0||finalPointCount!==h.confirmedCursor)throw Error('Le suffixe final attend sa confirmation avant la récupération.');
 if(h.state==='prepared'||h.state==='interrupted')return h;
 const next=freezeHeader({...h,revision:bump(h),state:'interrupted',cause,finalPointCount});await store.commit(plan(h,[row(h,stored.key,next)],[{key:stored.key,expected:stored.snapshot}]),()=>true);return next;
}
/** Only an explicit controller disposition=discard calls this operation. Never
 * infer it from timeout, a changed toolbar or a missing callback. Raw chunks are
 * retained; the durable terminal prevents revival after a later process kill. */
export async function discardPaperInkPrefixJournal(expected:PaperInkPrefixJournalHeader,explicitCause:string,provided?:PaperInkPrefixJournalStorage):Promise<PaperInkPrefixJournalHeader> {
 expected=captureHeader(expected);if(!text(explicitCause))throw Error('La cause d’annulation est invalide.');const store=provided??await storage(),stored=await storedHeader(expected,store,true),h=stored.header;
 if(h.state==='canonical'||h.state==='discarded')return h;
 const next=freezeHeader({...h,revision:bump(h),state:'discarded',cause:explicitCause,finalPointCount:h.confirmedCursor});await store.commit(plan(h,[row(h,stored.key,next)],[{key:stored.key,expected:stored.snapshot}]),()=>true);return next;
}
/** Never upserts a canonical object. Verify a real scoped draft, absence of its
 * deletion marker, exact expected object and page geometry, then CAS the draft,
 * tombstone absence and header in ONE transaction. Canonical/discarded states
 * are absorbing; a late confirmation cannot reopen a deliberate discard. */
export async function confirmPaperInkPrefixCanonical(expected:PaperInkPrefixJournalHeader,proof:Draft,current:()=>boolean,provided?:PaperInkPrefixJournalStorage):Promise<PaperInkPrefixJournalHeader> {
 expected=captureHeader(expected);if(!current())throw Error('La source a changé avant la confirmation du trait.');proof=structuredClone(proof);const store=provided??await storage();if(!current())throw Error('La source a changé avant la confirmation du trait.');const stored=await storedHeader(expected,store),h=stored.header;
 if(!current()||proof.accountId!==h.accountId||proof.spaceId!==h.spaceId||proof.type!=='whiteboard'||proof.documentId!==notebookDocumentId(h.noteId)||proof.identityAlias||proof.syncState==='conflict'||!isPaperDocument(proof.content)||proof.content.noteId!==h.noteId||!h.prepared)throw Error('La note enregistrée ne prouve pas la publication de ce trait.');
 const object=proof.content.objects.find(o=>o.id===h.prepared!.objectId),page=proof.content.pages.find(p=>p.id===h.prepared!.pageId);
 if(!object||!validObject(object)||object.pageId!==h.prepared.pageId||object.pen!==h.prepared.pen||!sameStyle({color:object.color!,width:object.strokeWidth!,opacity:object.opacity!,strokeStyle:object.strokeStyle},h.prepared.style)||!page||page.width!==h.geometry.width||page.height!==h.geometry.height||page.rotation!==h.geometry.rotation)throw Error('Le trait ou la géométrie enregistrée a changé. Le préfixe reste conservé.');
 const fingerprint=await objectFingerprint(stableJSON(object));if(!current()||fingerprint!==h.prepared.fingerprint)throw Error('L’objet enregistré ne correspond plus au trait attendu. Le préfixe reste conservé.');
 const deletion=store.deletionKey(identity(h));if(!text(deletion,10000)||await store.read(deletion)||!current())throw Error('La note a été supprimée ou la source a changé. Aucune note n’est recréée.');
 if(h.state==='discarded'||h.state==='canonical')return h;
 if(h.state!=='prepared')throw Error('Le préfixe attend une préparation explicite de son objet canonique.');
 const next=freezeHeader({...h,revision:bump(h),state:'canonical',canonicalObjectId:h.prepared.objectId});
 await store.commit(plan(h,[row(h,stored.key,next)],[{key:stored.key,expected:stored.snapshot},{key:deletion,expected:undefined}],[{identity:identity(h),expected:proof}]),current);return next;
}

/** A recovered cursor is a PREFIX, never proof of the last in-memory sample or
 * of a maximum250ms loss window: event loops, backpressure and storage can stall.
 * This reader issues no canonical command and never restores automatically. */
export async function readPaperInkPrefixJournal(scope:PaperInkPrefixScope,id:string,current:()=>boolean,provided?:PaperInkPrefixJournalStorage):Promise<{header:PaperInkPrefixJournalHeader;points:InkPoint[]}> {
 scope=captureScope(scope);const store=provided??await storage();if(!current())throw Error('La note a changé avant la lecture du préfixe.');const key=paperInkPrefixJournalKey(scope,id),snapshot=await store.read(key);
 if(!current()||!snapshot||!owns(snapshot,scope)||snapshot.key!==key||!isPaperInkPrefixJournalHeader(snapshot.value)||snapshot.value.id!==id||!sameScope(snapshot.value,scope))throw Error('Le journal ne correspond pas à cette note.');
 const header=freezeHeader(snapshot.value),points:InkPoint[]=[];
 for(let index=0;index<header.chunkCount;index++){const part=chunk(await store.read(paperInkPrefixJournalChunkKey(header,id,index)),header,index);if(!current())throw Error('La source a changé pendant la lecture du préfixe.');if(points.length&&part.points[0].time<points.at(-1)!.time)throw Error('L’ordre des fragments du préfixe est invalide.');points.push(...part.points.map(p=>({...p})));}
 const after=await store.read(key);if(!current()||!equal(after,snapshot))throw Error('Le journal a changé pendant sa lecture. Relisez son préfixe confirmé.');
 return {header,points};
}
export async function listPaperInkPrefixJournals(scope:PaperInkPrefixScope,current:()=>boolean,provided?:PaperInkPrefixJournalStorage):Promise<PaperInkPrefixJournalHeader[]> {
 scope=captureScope(scope);const store=provided??await storage();if(!current())return [];const rows=await store.list(scope.accountId,scope.spaceId,paperInkPrefixJournalPrefix(scope));if(!current())return [];
 return rows.flatMap(r=>owns(r,scope)&&isPaperInkPrefixJournalHeader(r.value)&&sameScope(r.value,scope)&&r.key===paperInkPrefixJournalKey(scope,r.value.id)&&r.value.confirmedCursor>0&&r.value.state!=='canonical'&&r.value.state!=='discarded'?[freezeHeader(r.value)]:[]).sort((a,b)=>b.createdAt-a.createdAt||a.id.localeCompare(b.id));
}
