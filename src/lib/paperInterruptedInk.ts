import type {Snapshot,NotebookTransferCommit,Draft} from '../../pwa/src/storage';
import {notebookDocumentId} from './notebookIdentity.ts';
import type {PaperPageInkInterruption} from '../hooks/usePaperPageInkController';
import type {InkPoint,PaperObject,PaperDocument,PaperCommand,PaperPage} from './notebookDocument';

export interface PaperInkRecoveryScope {readonly accountId:string;readonly spaceId:string;readonly noteId:string}
export interface PaperInterruptedInkReceipt extends PaperInkRecoveryScope {
 readonly schema:1;readonly kind:'paper-interrupted-ink';readonly id:string;readonly pageId:string;
 readonly ownerKey:string;readonly generation:string|number;readonly pointerType:'mouse'|'pen'|'touch';
 readonly cause:string;readonly createdAt:number;readonly pointCount:number;readonly chunkCount:number;
 readonly geometry:{readonly width:number;readonly height:number;readonly rotation:number;readonly geometryKey?:string};
 readonly style:{readonly color:string;readonly width:number;readonly opacity:number;readonly strokeStyle?:'solid'|'dashed'|'dotted'};
 readonly pen:'pen'|'pencil'|'calligraphy'|'highlighter';readonly state:'available'|'restored';readonly restoredObjectId?:string;
}
export interface PaperInterruptedInkChunk extends PaperInkRecoveryScope {
 readonly schema:1;readonly kind:'paper-interrupted-ink-chunk';readonly id:string;readonly index:number;readonly points:readonly InkPoint[];
}
export interface PreparedPaperInterruptedInk {readonly receipt:PaperInterruptedInkReceipt;readonly chunks:readonly PaperInterruptedInkChunk[]}
export interface PaperInkRecoveryStorage {
 read:(key:string)=>Promise<Snapshot|undefined>;
 list:(accountId:string,spaceId:string)=>Promise<Snapshot[]>;
 commit:(plan:NotebookTransferCommit,current:()=>boolean)=>Promise<void>;
}
const ownedStorage=async():Promise<PaperInkRecoveryStorage>=>{const s=await import('../../pwa/src/storage');return {read:s.getSnapshot,list:s.listSnapshots,commit:s.commitNotebookTransfer};};
export const PAPER_INK_RECOVERY_CHUNK_POINTS=4096;
const authoring=new Set(['pen','pencil','calligraphy','highlighter']);
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const text=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=2000;
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const sameScope=(a:PaperInkRecoveryScope,b:PaperInkRecoveryScope)=>a.accountId===b.accountId&&a.spaceId===b.spaceId&&a.noteId===b.noteId;
const point=(p:unknown):p is InkPoint=>!!p&&typeof p==='object'&&finite((p as InkPoint).x)&&finite((p as InkPoint).y)&&finite((p as InkPoint).time)&&['pressure','tiltX','tiltY','twist','nibAngle','renderPressure'].every(key=>(p as Record<string,unknown>)[key]===undefined||finite((p as Record<string,unknown>)[key]));
export const paperInkRecoveryPrefix=(scope:PaperInkRecoveryScope)=>`paper-ink-recovery|${JSON.stringify([scope.accountId,scope.spaceId,scope.noteId])}|`;
export const paperInkRecoveryReceiptKey=(scope:PaperInkRecoveryScope,id:string)=>paperInkRecoveryPrefix(scope)+JSON.stringify(id);
const chunkKey=(scope:PaperInkRecoveryScope,id:string,index:number)=>paperInkRecoveryReceiptKey(scope,id)+`|chunk-${index}`;

/** Captured first-contact ownership only. No API object or live callback is stored,
 * and this independent receipt never modifies the canonical note or its outbox. */
export function preparePaperInterruptedInk(scope:PaperInkRecoveryScope,id:string,input:PaperPageInkInterruption,createdAt=Date.now()):PreparedPaperInterruptedInk {
 const stroke=input.stroke,geometry=input.geometry,style=input.style;
 if(!text(scope.accountId)||!text(scope.spaceId)||!text(scope.noteId)||!text(id)||!finite(createdAt)||!input.admitted||input.cancellation.disposition!=='preserve-ink'||!stroke||!authoring.has(stroke.intent)||!stroke.points.length||stroke.points.length>250000||!stroke.points.every(point))throw Error('Le trait interrompu ne contient pas de saisie d’encre admise à conserver.');
 if(stroke.context.ownershipKey!==input.ownerKey||stroke.context.generation!==input.generation||stroke.context.pageId!==input.pageId||geometry.id!==input.pageId||stroke.context.pageWidth!==geometry.width||stroke.context.pageHeight!==geometry.height||stroke.context.pageRotation!==geometry.rotation||!finite(geometry.width)||geometry.width<=0||!finite(geometry.height)||geometry.height<=0||!finite(geometry.rotation)||!text(style.color)||!finite(style.width)||style.width<=0||!finite(style.opacity)||style.opacity<0||style.opacity>1||style.strokeStyle!==undefined&&!['solid','dashed','dotted'].includes(style.strokeStyle))throw Error('La géométrie ou l’origine du trait interrompu ne correspond pas à son contact admis.');
 const copiedScope=Object.freeze({...scope}),chunks:PaperInterruptedInkChunk[]=[];
 for(let offset=0;offset<stroke.points.length;offset+=PAPER_INK_RECOVERY_CHUNK_POINTS)chunks.push(Object.freeze({...copiedScope,schema:1,kind:'paper-interrupted-ink-chunk',id,index:chunks.length,points:Object.freeze(stroke.points.slice(offset,offset+PAPER_INK_RECOVERY_CHUNK_POINTS).map(p=>Object.freeze({...p})))}));
 const receipt:PaperInterruptedInkReceipt=Object.freeze({...copiedScope,schema:1,kind:'paper-interrupted-ink',id,pageId:input.pageId,ownerKey:input.ownerKey,generation:input.generation,pointerType:input.pointerType,cause:input.cancellation.cause,createdAt,pointCount:stroke.points.length,chunkCount:chunks.length,geometry:Object.freeze({width:geometry.width,height:geometry.height,rotation:geometry.rotation,...(geometry.geometryKey===undefined?{}:{geometryKey:geometry.geometryKey})}),style:Object.freeze({...style}),pen:stroke.intent as PaperInterruptedInkReceipt['pen'],state:'available'});
 if(!isPaperInterruptedInkReceipt(receipt))throw Error('Le reçu du trait est invalide. Son buffer reste retenu.');
 return Object.freeze({receipt,chunks:Object.freeze(chunks)});
}
export function isPaperInterruptedInkReceipt(value:unknown):value is PaperInterruptedInkReceipt {
 const r=value as PaperInterruptedInkReceipt|undefined;
 return !!r&&r.schema===1&&r.kind==='paper-interrupted-ink'&&[r.id,r.accountId,r.spaceId,r.noteId,r.pageId,r.ownerKey,r.cause].every(text)&&(finite(r.generation)||text(r.generation))&&['mouse','pen','touch'].includes(r.pointerType)&&authoring.has(r.pen)&&finite(r.createdAt)&&Math.abs(r.createdAt)<=8640000000000000&&Number.isInteger(r.pointCount)&&r.pointCount>0&&r.pointCount<=250000&&r.chunkCount===Math.ceil(r.pointCount/PAPER_INK_RECOVERY_CHUNK_POINTS)&&!!r.geometry&&finite(r.geometry.width)&&r.geometry.width>0&&finite(r.geometry.height)&&r.geometry.height>0&&finite(r.geometry.rotation)&&!!r.style&&text(r.style.color)&&finite(r.style.width)&&r.style.width>0&&finite(r.style.opacity)&&r.style.opacity>=0&&r.style.opacity<=1&&(r.style.strokeStyle===undefined||['solid','dashed','dotted'].includes(r.style.strokeStyle))&&(r.geometry.geometryKey===undefined||text(r.geometry.geometryKey))&&['available','restored'].includes(r.state)&&(r.state!=='restored'||text(r.restoredObjectId));
}
const row=(scope:PaperInkRecoveryScope,key:string,value:unknown):Snapshot=>({key,accountId:scope.accountId,spaceId:scope.spaceId,value});
const owned=(s:Snapshot|undefined,scope:PaperInkRecoveryScope)=>!s||s.accountId===scope.accountId&&s.spaceId===scope.spaceId;

/** Atomic header + all raw chunks. Retrying the same admission is idempotent;
 * another body with the same ID is a collision, never an overwrite. */
export async function preservePaperInterruptedInk(prepared:PreparedPaperInterruptedInk,provided?:PaperInkRecoveryStorage,validation?:{current:()=>boolean;snapshotChecks:NotebookTransferCommit['snapshotChecks']}):Promise<void> {
 const current=validation?.current??(()=>true),extraChecks=validation?structuredClone(validation.snapshotChecks):[];
 if(!current())throw Error('La source du trait a changé avant sa conservation.');
 const store=provided??await ownedStorage();
 const scope=prepared.receipt,key=paperInkRecoveryReceiptKey(scope,scope.id),keys=[key,...prepared.chunks.map(c=>chunkKey(scope,c.id,c.index))],values=[prepared.receipt,...prepared.chunks],existing=await Promise.all(keys.map(k=>store.read(k)));
 if(existing.some(s=>!owned(s,scope)))throw Error('Une autre origine occupe le reçu du trait. Aucun fichier n’a été remplacé.');
 for(let i=0;i<existing.length;i++)if(existing[i]){
  const old=existing[i]!.value;
  // A late retry of the admitted input must not reopen a user-restored receipt.
  const body=i===0&&isPaperInterruptedInkReceipt(old)&&old.state==='restored'?({...old,state:'available',restoredObjectId:undefined}):old;
  if(!equal(body,values[i]))throw Error('Une autre version occupe le reçu du trait. Les deux saisies doivent être conservées séparément.');
  if(i===0&&isPaperInterruptedInkReceipt(old)&&old.state==='restored')values[0]=old;
 }
 if(existing.every(Boolean)&&!extraChecks.length){if(!current())throw Error('La source du trait a changé pendant sa conservation.');return;}
 await store.commit({target:{accountId:scope.accountId,spaceId:scope.spaceId},sources:[],drafts:[],blobs:[],snapshots:keys.map((k,i)=>row(scope,k,values[i])),draftChecks:[],blobChecks:[],snapshotChecks:[...keys.map((k,i)=>({key:k,expected:existing[i]})),...extraChecks]},current);
}
export async function listPaperInterruptedInk(scope:PaperInkRecoveryScope,current:()=>boolean,provided?:PaperInkRecoveryStorage):Promise<PaperInterruptedInkReceipt[]> {
 const store=provided??await ownedStorage();
 if(!current())return [];const rows=await store.list(scope.accountId,scope.spaceId);if(!current())return [];
 return rows.flatMap(s=>s.key.startsWith(paperInkRecoveryPrefix(scope))&&owned(s,scope)&&isPaperInterruptedInkReceipt(s.value)&&s.key===paperInkRecoveryReceiptKey(scope,s.value.id)&&sameScope(s.value,scope)&&s.value.state==='available'?[s.value]:[]).sort((a,b)=>b.createdAt-a.createdAt||a.id.localeCompare(b.id));
}
export async function readPaperInterruptedInk(scope:PaperInkRecoveryScope,id:string,current:()=>boolean,provided?:PaperInkRecoveryStorage):Promise<{receipt:PaperInterruptedInkReceipt;points:InkPoint[]}> {
 scope=Object.freeze({accountId:scope.accountId,spaceId:scope.spaceId,noteId:scope.noteId});
 const store=provided??await ownedStorage();
 if(!current())throw Error('Le compte ou la note a changé.');const header=await store.read(paperInkRecoveryReceiptKey(scope,id));
 if(!current()||!owned(header,scope)||!isPaperInterruptedInkReceipt(header?.value)||header.value.id!==id||!sameScope(header.value,scope))throw Error('Le reçu du trait ne correspond pas à cette note.');
 const receipt=header.value,points:InkPoint[]=[];
 for(let index=0;index<receipt.chunkCount;index++){
  const r=await store.read(chunkKey(scope,id,index));if(!current())throw Error('La note a changé pendant la lecture du trait.');const c=r?.value as PaperInterruptedInkChunk|undefined;
  const expected=Math.min(PAPER_INK_RECOVERY_CHUNK_POINTS,receipt.pointCount-index*PAPER_INK_RECOVERY_CHUNK_POINTS);
  if(!owned(r,scope)||!c||c.schema!==1||c.kind!=='paper-interrupted-ink-chunk'||c.id!==id||c.index!==index||!sameScope(c,scope)||!Array.isArray(c.points)||c.points.length!==expected||!c.points.every(point))throw Error('Un fragment du trait doit être retrouvé avant sa restauration.');points.push(...c.points.map(p=>({...p})));
 }
 const after=await store.read(paperInkRecoveryReceiptKey(scope,id));if(!current()||!equal(after,header))throw Error('Le reçu du trait a changé pendant sa lecture. Relisez les traits récupérables.');
 return {receipt,points};
}
export function recoveredInkObject(receipt:PaperInterruptedInkReceipt,points:InkPoint[],pageId:string,z:number):PaperObject {
 if(points.length!==receipt.pointCount||!points.every(point))throw Error('Le trait récupéré est incomplet.');
 return {id:receipt.id,kind:'ink',pageId,x:0,y:0,width:receipt.geometry.width,height:receipt.geometry.height,rotation:0,z,locked:false,createdAt:receipt.createdAt,points:points.map(p=>({...p})),color:receipt.style.color,strokeWidth:receipt.style.width,opacity:receipt.style.opacity,strokeStyle:receipt.style.strokeStyle,pen:receipt.pen};
}
/** Only explicit UI restoration adds a copy to an existing writable note. The
 * original page is never recreated silently. IDs remain stable across retries
 * after a canonical save succeeded but receipt confirmation failed. */
export function planPaperInterruptedInkRestore(document:PaperDocument,receipt:PaperInterruptedInkReceipt,points:InkPoint[],destination:'original'|'new-page'):{command:PaperCommand|null;object:PaperObject;pageId:string} {
 if(document.noteId!==receipt.noteId||receipt.state!=='available')throw Error('Ce trait ne peut pas être restauré dans cette note.');
 const id=receipt.id+'-recovered',newPageId=receipt.id+'-recovered-page',existing=document.objects.find(o=>o.id===id);
 const original=document.pages.find(p=>p.id===receipt.pageId);
 const compatible=(p:PaperPage)=>p.width===receipt.geometry.width&&p.height===receipt.geometry.height&&p.rotation===receipt.geometry.rotation;
 const pageId=destination==='original'?receipt.pageId:newPageId;
 if(destination==='original'&&(!original||!compatible(original)))throw Error('La page d’origine a changé ou a été supprimée. Choisissez une nouvelle page pour conserver la géométrie du trait.');
 const target=document.pages.find(p=>p.id===pageId);
 if(target&&!compatible(target))throw Error('La page de récupération a été modifiée. Le trait conservé reste intact.');
 const z=existing?.z??Math.max(0,...document.objects.filter(o=>o.pageId===pageId).map(o=>o.z))+1;
 const object={...recoveredInkObject(receipt,points,pageId,z),id};
 if(existing){if(!equal(existing,object))throw Error('Une autre version occupe ce trait récupéré. Aucun objet n’a été remplacé.');return {command:null,object,pageId};}
 if(destination==='new-page'&&target)throw Error('Une autre page occupe cette récupération. Aucun contenu n’a été remplacé.');
 const commands:PaperCommand[]=[];
 if(!target)commands.push({type:'insert-page',page:{id:pageId,width:receipt.geometry.width,height:receipt.geometry.height,rotation:receipt.geometry.rotation,pattern:'plain',color:'#ffffff',bookmark:false}});
 commands.push({type:'upsert-object',object});
 return {command:{type:'batch',commands},object,pageId};
}
/** Called only after a user-selected restore has a confirmed canonical save.
 * The raw chunks remain intact for provenance, export and future recovery. */
export async function markPaperInterruptedInkRestored(scope:PaperInkRecoveryScope,id:string,object:PaperObject,proof:Draft,current:()=>boolean,provided?:PaperInkRecoveryStorage):Promise<void> {
 scope=Object.freeze({accountId:scope.accountId,spaceId:scope.spaceId,noteId:scope.noteId});object=structuredClone(object);proof=structuredClone(proof);
 const store=provided??await ownedStorage();
 const content=proof.content as PaperDocument|undefined;
 if(proof.accountId!==scope.accountId||proof.spaceId!==scope.spaceId||proof.type!=='whiteboard'||proof.documentId!==notebookDocumentId(scope.noteId)||proof.identityAlias||proof.syncState==='conflict'||!content||content.notebookSchema!==3||content.noteId!==scope.noteId||!Array.isArray(content.objects)||!equal(content.objects.find(o=>o.id===object.id),object)||!content.pages.some(page=>page.id===object.pageId))throw Error('La copie enregistrée du trait a changé. La récupération reste disponible.');
 const objectId=object.id;
 const deletionKey=`paper-canonical-deletion|${scope.accountId}|${scope.spaceId}|whiteboard|${notebookDocumentId(scope.noteId)}`;
 const deletion=await store.read(deletionKey);
 if(!current()||deletion)throw Error('La note a été supprimée ou sa suppression doit être vérifiée. Le trait reste conservé.');
 if(!current())throw Error('La note a changé avant la confirmation de récupération.');const key=paperInkRecoveryReceiptKey(scope,id),previous=await store.read(key);
 if(!current()||!owned(previous,scope)||!isPaperInterruptedInkReceipt(previous?.value)||previous.value.id!==id||!sameScope(previous.value,scope)||!text(objectId))throw Error('Le reçu de récupération ne peut pas être confirmé dans cette note.');
 if(previous.value.state==='restored'){if(previous.value.restoredObjectId===objectId)return;throw Error('Ce trait a déjà été récupéré sous une autre identité.');}
 const page=content.pages.find(page=>page.id===object.pageId)!;
 if(page.width!==previous.value.geometry.width||page.height!==previous.value.geometry.height||page.rotation!==previous.value.geometry.rotation)throw Error('La page enregistrée a changé. Le trait reste récupérable.');
 await store.commit({target:{accountId:scope.accountId,spaceId:scope.spaceId},sources:[],drafts:[],blobs:[],snapshots:[row(scope,key,{...previous.value,state:'restored',restoredObjectId:objectId})],draftChecks:[{identity:{accountId:scope.accountId,spaceId:scope.spaceId,type:'whiteboard',documentId:notebookDocumentId(scope.noteId)},expected:proof}],blobChecks:[],snapshotChecks:[{key,expected:previous},{key:deletionKey,expected:undefined}]},current);
}
