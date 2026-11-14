/** Runtime ownership only. No document, Markdown, DOM or editor instance is copied here. */
export interface PaperPageWriterScope {
 accountId:string;spaceId:string;noteId:string;api:unknown;generation:string|number;
}
export type PaperPageWriterEvictionCause='viewport'|'scope-change'|'close';
export type PaperPageWriterPinReason='dirty'|'composition'|'caret'|'preservation';
export interface PaperPageWriterActivity {dirty:boolean;composing:boolean;caretPageId:string|null}
export interface PaperPageWriterPreservation {
 readonly scope:Readonly<PaperPageWriterScope>;readonly objectId:string;readonly sourcePageId:string;
 readonly pageIds:readonly string[];readonly version:number;readonly cause:PaperPageWriterEvictionCause;
 /** Owns the captured writer while preserving accepted text, even after its UI was revoked.
  * Never use this guard to admit new editing/reflow in the current view. */
 held:()=>boolean;
}
export interface PaperPageWriter {
 /** Preserve accepted input against the captured note/object, including composition text.
  * A false result refuses the flush; throwing also retains the writer and its pins. */
 flush:(context:PaperPageWriterPreservation)=>void|boolean|Promise<void|boolean>;
 /** True explicitly acknowledges preservation of all input flushed for context.version.
  * A resolved void promise is deliberately insufficient to release an editor. */
 settled:(context:PaperPageWriterPreservation)=>boolean|Promise<boolean>;
}
export interface PaperPageWriterRequest {
 objectId:string;sourcePageId:string;pageId:string;pageIds?:readonly string[];
 role?:'root'|'continuation';writer:PaperPageWriter;
}
export interface PaperPageWriterEviction {
 status:'released'|'pinned'|'blocked';
 reason?:'composition'|'caret'|'flush-refused'|'unpreserved'|'changed-during-preservation'|'failure';
 error?:unknown;
}
export interface PaperPageWriterSnapshot {
 readonly scope:Readonly<PaperPageWriterScope>;readonly ownerSerial:number;readonly objectId:string;
 readonly sourcePageId:string;readonly pageIds:readonly string[];
 readonly state:'active'|'settling'|'blocked'|'released';readonly activity:Readonly<PaperPageWriterActivity>;
 readonly version:number;
}
export interface PaperPageWriterPin {
 readonly scope:Readonly<PaperPageWriterScope>;readonly objectId:string;readonly pageId:string;
 readonly reasons:readonly PaperPageWriterPinReason[];
}
export interface PaperPageWriterLease {
 /** This is the sole interactive editor/reflow authority for this object. */
 current:()=>boolean;
 /** Synchronous canonical write only. The callback must also validate its own source/baseline.
  * Async work must retain current and check it again before a later commit. No rollback is supplied. */
 commit:(write:(current:()=>boolean)=>boolean)=>boolean;
 /** Report every accepted text change with dirty:true, even when already dirty. */
 activity:(change:Partial<PaperPageWriterActivity>)=>boolean;
 updatePages:(pageIds:readonly string[])=>boolean;
 evict:(cause?:PaperPageWriterEvictionCause)=>Promise<PaperPageWriterEviction>;
 snapshot:()=>PaperPageWriterSnapshot;
}
export type PaperPageWriterAcquisition={status:'acquired';lease:PaperPageWriterLease}|{
 status:'readonly';reason:'continuation'|'already-owned'|'preserving'|'stale-owner';
};
export interface PaperPageWriterOwner {
 readonly scope:Readonly<PaperPageWriterScope>;readonly serial:number;
 current:()=>boolean;
 acquire:(request:PaperPageWriterRequest)=>PaperPageWriterAcquisition;
 /** Release is permitted only for entries whose preservation actually succeeds. */
 settle:()=>Promise<PaperPageWriterEviction[]>;
 pins:()=>readonly PaperPageWriterPin[];
}
export interface PaperPageWriterRegistry {
 /** One registry belongs to one changing view owner. Share it across that view's page hosts.
  * Repeating the same scope is idempotent; an observed A→B→A allocates a new owner serial. */
 activate:(scope:PaperPageWriterScope)=>PaperPageWriterOwner;
 /** Includes retained old owners, so an offscreen editor can be preserved before unmounting. */
 pins:()=>readonly PaperPageWriterPin[];
 close:()=>Promise<PaperPageWriterEviction[]>;
}
type Owner={scope:Readonly<PaperPageWriterScope>;serial:number;live:boolean;entries:Set<Entry>;handle:PaperPageWriterOwner};
type Entry={owner:Owner;key:string;objectId:string;sourcePageId:string;pageIds:readonly string[];
 writer:PaperPageWriter;activity:PaperPageWriterActivity;version:number;
 state:PaperPageWriterSnapshot['state'];retired:boolean;cause:PaperPageWriterEvictionCause;
 pending?:Promise<PaperPageWriterEviction>};
// Note, object and page identities follow the canonical document's 200-character bound.
const id=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=200;
function copyScope(scope:PaperPageWriterScope):Readonly<PaperPageWriterScope>{
 if(!scope)throw new TypeError('Invalid writer scope');const {accountId,spaceId,noteId,api,generation}=scope;
 if(![accountId,spaceId,noteId].every(id)
  ||!(typeof generation==='string'&&generation.length>0||typeof generation==='number'&&Number.isSafeInteger(generation)&&generation>=0)
  ||!(api==null||typeof api==='object'||typeof api==='function'))throw new TypeError('Invalid writer scope');
 return Object.freeze({accountId,spaceId,noteId,api,generation});
}
const sameScope=(a:Readonly<PaperPageWriterScope>,b:Readonly<PaperPageWriterScope>)=>a.accountId===b.accountId&&a.spaceId===b.spaceId&&a.noteId===b.noteId&&a.api===b.api&&a.generation===b.generation;
/** Canonical textFlow currently permits at most 2000 pages; check before reading entries. */
export const PAPER_PAGE_WRITER_MAX_FLOW_PAGES=2000;
function copyPages(pageIds:readonly string[],sourcePageId:string):readonly string[]{
 if(!Array.isArray(pageIds)||!pageIds.length||pageIds.length>PAPER_PAGE_WRITER_MAX_FLOW_PAGES)throw new TypeError('Invalid writer pages');
 const count=pageIds.length,pages:string[]=[],seen=new Set<string>();
 // Iterate the captured bounded count, not a caller's iterator or a length changed by a getter.
 for(let index=0;index<count;index++){const pageId=pageIds[index];if(!id(pageId)||seen.has(pageId))throw new TypeError('Invalid writer pages');seen.add(pageId);pages.push(pageId);}
 if(pageIds.length!==count||pages[0]!==sourcePageId)throw new TypeError('Invalid writer pages');return Object.freeze(pages);
}
const causes=new Set<PaperPageWriterEvictionCause>(['viewport','scope-change','close']);
const releasedWriter:PaperPageWriter=Object.freeze({flush:()=>false,settled:()=>false});

/** Local foundation, not cross-tab locking. A caller must preserve its captured canonical
 * document in flush/settled and keep blocked hosts alive. This module never cancels input,
 * destroys ProseMirror, applies a timeout, or promotes a readonly continuation to a writer. */
export function createPaperPageWriterRegistry():PaperPageWriterRegistry {
 const slots=new Map<string,Entry>();let active:Owner|null=null,serial=0;
 const held=(entry:Entry)=>entry.state!=='released'&&slots.get(entry.key)===entry;
 const current=(entry:Entry)=>held(entry)&&entry.state==='active'&&!entry.retired&&entry.owner.live&&active===entry.owner;
 const snapshot=(entry:Entry):PaperPageWriterSnapshot=>Object.freeze({scope:entry.owner.scope,ownerSerial:entry.owner.serial,objectId:entry.objectId,sourcePageId:entry.sourcePageId,pageIds:entry.pageIds,state:entry.state,activity:Object.freeze({...entry.activity}),version:entry.version});
 const pinsFor=(entries:Iterable<Entry>):readonly PaperPageWriterPin[]=>{
  const pins:PaperPageWriterPin[]=[];
  for(const entry of entries){if(!held(entry))continue;const reasons:PaperPageWriterPinReason[]=[];
   if(entry.activity.dirty)reasons.push('dirty');if(entry.activity.composing)reasons.push('composition');
   if(entry.activity.caretPageId!==null)reasons.push('caret');if(entry.retired||entry.state!=='active')reasons.push('preservation');
   if(!reasons.length)continue;pins.push(Object.freeze({scope:entry.owner.scope,objectId:entry.objectId,pageId:entry.sourcePageId,reasons:Object.freeze(reasons)}));
   const caret=entry.activity.caretPageId;if(caret!==null&&caret!==entry.sourcePageId)pins.push(Object.freeze({scope:entry.owner.scope,objectId:entry.objectId,pageId:caret,reasons:Object.freeze(['caret'] as PaperPageWriterPinReason[])}));
  }return Object.freeze(pins);
 };
 const blocked=(entry:Entry,reason:NonNullable<PaperPageWriterEviction['reason']>,error?:unknown):PaperPageWriterEviction=>{
  // Preservation failure keeps the host readonly and pinned. Retrying is explicit;
  // merely revisiting the note must not treat an unconfirmed flush as a clean editor.
  entry.state='blocked';
  return {status:'blocked',reason,...(error===undefined?{}:{error})};
 };
 const evict=(entry:Entry,cause:PaperPageWriterEvictionCause='viewport'):Promise<PaperPageWriterEviction>=>{
  if(!causes.has(cause))return Promise.reject(new TypeError('Invalid writer eviction cause'));
  if(!held(entry))return Promise.resolve({status:'released'});
  if(cause!=='viewport'){entry.retired=true;entry.cause=cause;}
  if(entry.pending)return entry.pending;
  if(!entry.retired){if(entry.activity.composing)return Promise.resolve({status:'pinned',reason:'composition'});if(entry.activity.caretPageId!==null)return Promise.resolve({status:'pinned',reason:'caret'});}
  entry.state='settling';entry.cause=entry.retired?entry.cause:cause;
  const version=entry.version,context:PaperPageWriterPreservation=Object.freeze({scope:entry.owner.scope,objectId:entry.objectId,sourcePageId:entry.sourcePageId,pageIds:entry.pageIds,version,cause:entry.cause,held:()=>held(entry)});
  // Queue after installing pending, so reentrant flush/settled callbacks share one attempt.
  const work=Promise.resolve().then(async():Promise<PaperPageWriterEviction>=>{
   try{
    if(await entry.writer.flush(context)===false)return blocked(entry,'flush-refused');
    if(await entry.writer.settled(context)!==true)return blocked(entry,'unpreserved');
    if(entry.version!==version)return blocked(entry,'changed-during-preservation');
    if(entry.activity.composing)return blocked(entry,'composition');
    if(!entry.retired&&entry.activity.caretPageId!==null)return blocked(entry,'caret');
    entry.activity.dirty=false;entry.state='released';entry.writer=releasedWriter;slots.delete(entry.key);entry.owner.entries.delete(entry);
    return {status:'released'};
   }catch(error){return blocked(entry,'failure',error);}
  });
  const pending=work.finally(()=>{if(entry.pending===pending)entry.pending=undefined;});entry.pending=pending;return pending;
 };
 const retire=(owner:Owner,cause:'scope-change'|'close')=>{
  owner.live=false;for(const entry of owner.entries)void evict(entry,cause);
 };
 const acquire=(owner:Owner,request:PaperPageWriterRequest):PaperPageWriterAcquisition=>{
  if(!request||![request.objectId,request.sourcePageId,request.pageId].every(id)||!request.writer||typeof request.writer.flush!=='function'||typeof request.writer.settled!=='function'||request.role!==undefined&&request.role!=='root'&&request.role!=='continuation')throw new TypeError('Invalid writer request');
  const pageIds=copyPages(request.pageIds??[request.sourcePageId],request.sourcePageId);
  if(!pageIds.includes(request.pageId))throw new TypeError('Requested page is outside this flow');
  if(!owner.live||active!==owner)return {status:'readonly',reason:'stale-owner'};
  if(request.role==='continuation'||request.pageId!==request.sourcePageId)return {status:'readonly',reason:'continuation'};
  const key=JSON.stringify([owner.scope.accountId,owner.scope.spaceId,owner.scope.noteId,request.objectId]),existing=slots.get(key);
  if(existing)return {status:'readonly',reason:current(existing)?'already-owned':'preserving'};
  const writer=request.writer,flush=writer.flush,settled=writer.settled;
  const entry:Entry={owner,key,objectId:request.objectId,sourcePageId:request.sourcePageId,pageIds,writer:{flush:context=>flush.call(writer,context),settled:context=>settled.call(writer,context)},activity:{dirty:false,composing:false,caretPageId:null},version:0,state:'active',retired:false,cause:'viewport'};
  const lease:PaperPageWriterLease={
   current:()=>current(entry),
   commit:write=>{if(typeof write!=='function')throw new TypeError('Invalid writer commit');if(!current(entry))return false;const result=write(()=>current(entry));if(typeof result!=='boolean')throw new TypeError('Writer commit must be synchronous and return a boolean');return result&&current(entry);},
   activity:change=>{
    if(!held(entry))return false;if(!change||Object.keys(change).some(key=>!['dirty','composing','caretPageId'].includes(key))||change.dirty!==undefined&&typeof change.dirty!=='boolean'||change.composing!==undefined&&typeof change.composing!=='boolean'||change.caretPageId!==undefined&&change.caretPageId!==null&&!entry.pageIds.includes(change.caretPageId))throw new TypeError('Invalid writer activity');
    if(change.dirty===true){if(!Number.isSafeInteger(entry.version+1))throw new RangeError('Writer version exhausted');entry.version++;}
    if(change.dirty!==undefined)entry.activity.dirty=change.dirty;if(change.composing!==undefined)entry.activity.composing=change.composing;if(change.caretPageId!==undefined)entry.activity.caretPageId=change.caretPageId;return true;
   },
   updatePages:pages=>{if(!current(entry))return false;const next=copyPages(pages,entry.sourcePageId);if(entry.activity.caretPageId!==null&&!next.includes(entry.activity.caretPageId))throw new TypeError('The caret page must remain pinned');entry.pageIds=next;return true;},
   evict:cause=>evict(entry,cause),snapshot:()=>snapshot(entry),
  };slots.set(key,entry);owner.entries.add(entry);return {status:'acquired',lease:Object.freeze(lease)};
 };
 const activate=(input:PaperPageWriterScope):PaperPageWriterOwner=>{
  const scope=copyScope(input);if(active?.live&&sameScope(active.scope,scope))return active.handle;
  if(!Number.isSafeInteger(serial+1))throw new RangeError('Writer owner serial exhausted');
  const previous=active,owner:Owner={scope,serial:++serial,live:true,entries:new Set(),handle:undefined!};active=owner;
  owner.handle={scope,serial:owner.serial,current:()=>owner.live&&active===owner,acquire:request=>acquire(owner,request),settle:()=>{owner.live=false;return Promise.all([...owner.entries].map(entry=>evict(entry,'close')));},pins:()=>pinsFor(owner.entries)};
  if(previous)retire(previous,'scope-change');return Object.freeze(owner.handle);
 };
 return Object.freeze({activate,pins:()=>pinsFor(slots.values()),close:()=>{if(active)active.live=false;return Promise.all([...slots.values()].map(entry=>evict(entry,'close')));}});
}
