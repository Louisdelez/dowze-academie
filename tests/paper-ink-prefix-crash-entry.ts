/** Browser-only recipe. All reads/writes use actual production IndexedDB;
 * restarting the browser never seeds a recovered prefix from RAM or JSON. */
import {getDraft,putDraft,getSnapshot,type Draft} from '../pwa/src/storage.ts';
import {notebookDocumentId} from '../src/lib/notebookIdentity.ts';
import type {InkPoint,PaperDocument,PaperObject} from '../src/lib/notebookDocument.ts';
import {
 createPaperInkPrefixJournal,appendPaperInkPrefixJournal,capturePaperInkPrefixObject,
 preparePaperInkPrefixCanonical,discardPaperInkPrefixJournal,confirmPaperInkPrefixCanonical,
 readPaperInkPrefixJournal,listPaperInkPrefixJournals,paperInkPrefixJournalKey,paperInkPrefixJournalChunkKey,
 type PaperInkPrefixJournalHeader,type PaperInkPrefixScope,
} from '../src/lib/paperInkPrefixJournal.ts';

export const PREFIX_CRASH_CASES=['before-first-ack','ack-before-suffix','prepared-before-publish','canonical-before-marker','discard-before-kill'] as const;
export type PrefixCrashCase=typeof PREFIX_CRASH_CASES[number];
type Status={phase:string;acknowledgedCursor:number;observedUncommittedCursor:number;holdActive:boolean;holdCompleted:boolean;holdReads:number;error:string|null};
const status:Status={phase:'idle',acknowledgedCursor:0,observedUncommittedCursor:0,holdActive:false,holdCompleted:false,holdReads:0,error:null};
const check=(ok:unknown,message:string)=>{if(!ok)throw Error(message);};
const errorText=(error:unknown)=>String(error instanceof Error?error.message:error).slice(0,500);
const stamp=Date.UTC(2026,9,15,10,0,0);
function fixture(kind:PrefixCrashCase,runId:string){
 check(PREFIX_CRASH_CASES.includes(kind)&&/^[a-zA-Z0-9-]{8,80}$/.test(runId),'Invalid synthetic crash fixture identity');
 const scope:PaperInkPrefixScope={accountId:`synthetic-prefix-${runId}`,spaceId:'synthetic-crash-year',noteId:`synthetic-${kind}`},id=`synthetic-${kind}-${runId}`;
 const count=kind==='ack-before-suffix'?4113:3;
 const header=createPaperInkPrefixJournal(scope,id,{ownerKey:JSON.stringify(scope),generation:1,pageId:'synthetic-page',pointerType:'pen',pen:'pencil',createdAt:stamp,
  geometry:{width:800,height:1200,rotation:0},style:{color:'#123456',width:3,opacity:.7,strokeStyle:'dotted'}});
 const raw:InkPoint[]=Array.from({length:count},(_,i)=>i===0?{x:0,y:20,time:10}:{x:i/10,y:20+i/20,time:10+i,pressure:(i%10)/10,tiltX:12,tiltY:-20,twist:42});
 const object:PaperObject={id,pageId:header.pageId,kind:'ink',x:0,y:0,width:raw.at(-1)!.x,height:raw.at(-1)!.y,rotation:0,z:1,locked:false,createdAt:stamp,points:raw,color:header.style.color,strokeWidth:header.style.width,opacity:header.style.opacity,strokeStyle:header.style.strokeStyle,pen:header.pen};
 const content:PaperDocument={notebookSchema:3,noteId:scope.noteId,revision:0,pages:[{id:header.pageId,width:800,height:1200,rotation:0,pattern:'plain',color:'#fff',bookmark:false}],objects:[],assets:[],audio:[],updatedAt:new Date(stamp).toISOString(),legacy:{markdown:'',boardId:'synthetic-legacy',migratedAt:new Date(stamp).toISOString()}};
 const initial:Draft={accountId:scope.accountId,spaceId:scope.spaceId,type:'whiteboard',documentId:notebookDocumentId(scope.noteId),title:'Synthetic browser crash fixture',content,baseVersion:0,updatedAt:stamp,syncState:'local'};
 return {scope,id,header,raw,object,initial};
}

/** Test-only timing seam forwards the real IDB transaction and all real writes.
 * A chain of queued reads keeps that transaction open until the parent SIGKILL.
 * It never fakes commit/oncomplete/ACK or substitutes a persistent adapter. */
let armed:{key:string;cursor:number}|null=null;
const originalTransaction=IDBDatabase.prototype.transaction;
let heldTransaction:IDBTransaction|null=null,holdTimer:number|null=null;
IDBDatabase.prototype.transaction=function(this:IDBDatabase,...args:Parameters<IDBDatabase['transaction']>):IDBTransaction{
 const tx=Reflect.apply(originalTransaction,this,args) as IDBTransaction;
 if(!armed||heldTransaction||this.name!=='dowze-academie-pwa'||tx.mode!=='readwrite'||!tx.objectStoreNames.contains('snapshots')||!tx.objectStoreNames.contains('drafts')||!tx.objectStoreNames.contains('scopedBlobs'))return tx;
 const target=armed;armed=null;heldTransaction=tx;status.holdActive=true;
 tx.addEventListener('complete',()=>{status.holdCompleted=true;status.holdActive=false;status.error='Held transaction completed before SIGKILL';status.phase='error';if(holdTimer!==null)clearTimeout(holdTimer);});
 tx.addEventListener('abort',()=>{status.holdActive=false;status.error='Held transaction aborted before SIGKILL';status.phase='error';if(holdTimer!==null)clearTimeout(holdTimer);});
 const started=performance.now(),store=tx.objectStore('snapshots');
 const pump=()=>{
  if(performance.now()-started>20000||status.holdReads>50000){status.error='Bounded real transaction hold expired';status.phase='error';try{tx.abort();}catch{}return;}
  const request=store.get(target.key);request.onerror=()=>{status.error='Real held IndexedDB read failed';status.phase='error';};
  request.onsuccess=()=>{
   status.holdReads++;
   const header=request.result?.value as PaperInkPrefixJournalHeader|undefined;
   if(header?.confirmedCursor===target.cursor&&header.state==='active'){
    status.observedUncommittedCursor=target.cursor;status.phase='uncommitted-written';
   }
   pump();
  };
 };
 pump();holdTimer=window.setTimeout(()=>{status.error='Bounded real transaction hold expired';status.phase='error';try{tx.abort();}catch{}},20000);
 return tx;
};
let running=false;
async function produce(kind:PrefixCrashCase,runId:string){
 const f=fixture(kind,runId);await putDraft(f.initial);let h=f.header;
 const append=async(from:number,to:number)=>{const ack=await appendPaperInkPrefixJournal(h,{from,to,total:f.raw.length,points:f.raw.slice(from,to)});h=ack.header;status.acknowledgedCursor=ack.confirmedCursor;};
 if(kind==='before-first-ack'){
  armed={key:paperInkPrefixJournalKey(f.scope,f.id),cursor:f.raw.length};status.phase='writing-first';await append(0,f.raw.length);throw Error('Uncommitted first append unexpectedly acknowledged');
 }
 if(kind==='ack-before-suffix'){
  await append(0,4096);armed={key:paperInkPrefixJournalKey(f.scope,f.id),cursor:f.raw.length};status.phase='writing-suffix';await append(4096,f.raw.length);throw Error('Uncommitted suffix unexpectedly acknowledged');
 }
 await append(0,f.raw.length);
 if(kind==='discard-before-kill'){
  await discardPaperInkPrefixJournal(h,'explicit-synthetic-navigation');status.phase='ready-kill';return;
 }
 const descriptor=await capturePaperInkPrefixObject(f.object);h=await preparePaperInkPrefixCanonical(h,f.raw.length,descriptor);
 if(kind==='canonical-before-marker')await putDraft({...f.initial,content:{...(f.initial.content as PaperDocument),revision:1,objects:[f.object]},updatedAt:stamp+1});
 status.phase='ready-kill';
}

async function inspect(kind:PrefixCrashCase,runId:string){
 const f=fixture(kind,runId),saved=await getDraft(f.initial),snapshot=await getSnapshot(paperInkPrefixJournalKey(f.scope,f.id)),listed=await listPaperInkPrefixJournals(f.scope,()=>true);
 check(saved,'The synthetic canonical draft must itself survive process restart');
 const document=saved!.content as PaperDocument;check(document.noteId===f.scope.noteId,'Recovered draft scope differs');
 check((await listPaperInkPrefixJournals({...f.scope,accountId:f.scope.accountId+'-foreign'},()=>true)).length===0,'Foreign owner unexpectedly listed a prefix');
 let cursor=0,state='absent',fingerprint:string|null=null;
 if(kind==='before-first-ack'){
  check(!snapshot&&listed.length===0,'An unacknowledged first prefix survived despite an uncommitted real transaction');
  check(await getSnapshot(paperInkPrefixJournalChunkKey(f.scope,f.id,0))===undefined,'Uncommitted first chunk leaked after SIGKILL');
  check(JSON.stringify(document)===JSON.stringify(f.initial.content),'The kill silently changed the original note');
 }else{
  const recovered=await readPaperInkPrefixJournal(f.scope,f.id,()=>true);cursor=recovered.header.confirmedCursor;state=recovered.header.state;fingerprint=recovered.header.prepared?.fingerprint??null;
  const expected=kind==='ack-before-suffix'?4096:f.raw.length;
  check(cursor===expected,'Recovered cursor differs from the last committed ACK');
  check(JSON.stringify(recovered.points)===JSON.stringify(f.raw.slice(0,expected)),'Recovered raw prefix or sensor values differ');
  check(!Object.hasOwn(recovered.points[0],'pressure')&&!Object.hasOwn(recovered.points[0],'tiltX'),'Absent sensor values were manufactured after restart');
  if(kind==='ack-before-suffix'){
   check(state==='active'&&listed.length===1,'Committed active prefix was lost or replayed automatically');
   check(await getSnapshot(paperInkPrefixJournalChunkKey(f.scope,f.id,1))===undefined,'Uncommitted suffix chunk survived SIGKILL');
  }
  if(kind==='prepared-before-publish')check(state==='prepared'&&listed.length===1&&fingerprint===(await capturePaperInkPrefixObject(f.object)).fingerprint,'Prepared fingerprint/prefix did not survive the process crash');
  if(kind==='canonical-before-marker'){
   check(state==='prepared'&&listed.length===1,'Startup automatically consumed or replayed a prepared journal');
   check(document.objects.length===1&&document.objects[0].id===f.id,'Canonical object was lost or duplicated before explicit confirmation');
   const terminal=await confirmPaperInkPrefixCanonical(recovered.header,saved!,()=>true);check(terminal.state==='canonical','Explicit proof failed to confirm the existing object');
   const after=await getDraft(f.initial);check(JSON.stringify(after!.content)===JSON.stringify(saved!.content),'Confirmation rewrote the canonical note');
   check((await listPaperInkPrefixJournals(f.scope,()=>true)).length===0,'Canonical terminal remained recoverable after explicit confirmation');state=terminal.state;
  }else check(JSON.stringify(document)===JSON.stringify(f.initial.content),'Recovery or listing silently recreated/published a canonical object');
  if(kind==='discard-before-kill'){
   check(state==='discarded'&&listed.length===0,'Explicit durable discard resurrected after SIGKILL');
   await appendPaperInkPrefixJournal(f.header,{from:0,to:f.raw.length,total:f.raw.length,points:f.raw});
   let refused=false;try{await appendPaperInkPrefixJournal(f.header,{from:f.raw.length,to:f.raw.length+1,total:f.raw.length+1,points:[{x:1,y:1,time:100}]});}catch{refused=true;}
   check(refused,'A late prefix reopened the discarded journal');
   check((await readPaperInkPrefixJournal(f.scope,f.id,()=>true)).header.state==='discarded','Late callbacks changed the absorbing terminal');
  }
 }
 return {cursor,state,fingerprint,scopeIsolated:true,canonicalObjects:document.objects.length,rawExactlyRecovered:true,storage:'actual-browser-indexeddb',automaticReplay:false};
}
export const paperInkPrefixCrash={
 start:(kind:PrefixCrashCase,runId:string)=>{
  check(!running,'Synthetic producer was already started');running=true;
  void produce(kind,runId).catch(error=>{status.error=errorText(error);status.phase='error';});
 },
 status:()=>({...status}),inspect,
};
declare global {interface Window {__paperInkPrefixCrash:typeof paperInkPrefixCrash}}
window.__paperInkPrefixCrash=paperInkPrefixCrash;
