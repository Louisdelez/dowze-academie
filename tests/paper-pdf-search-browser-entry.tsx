/** Actual PDF.js, Page/TextLayer, fonts/glyph ranges and native IndexedDB.
 * Only the isolated owner/request shell is synthetic. Lifecycle observers
 * delegate native constructors/methods and preserve their exact return values. */
import {createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {TextLayer} from 'pdfjs-dist';
import {PaperPdfPage} from '../src/components/PaperPdfPage';
import '../src/components/paper-notebook.css';
import {importPaperPdf} from '../src/lib/paperPdf';
import {migratePaper,isPaperDocument,notebookDocumentId,type PaperDocument} from '../src/lib/notebookDocument';
import {amendPaperCollaboration} from '../src/lib/paperCollaboration';
import {searchPaperDocument} from '../src/lib/paperSearch';
import type {PaperSearchNavigationRequest} from '../src/lib/notebookSearchNavigation';
import {ApiClient} from '../pwa/src/api';
import {putDraft,putLocalBlob,putSnapshot,queueMutation,localBlobDigest,type Draft} from '../pwa/src/storage';

function check(value:unknown,message:string):asserts value{if(!value)throw Error(message);}
const stamp='2026-10-15T10:00:00.000Z';
const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
async function wait(checking:()=>boolean,label:string){const end=performance.now()+12000;while(performance.now()<end){if(checking())return;await new Promise(resolve=>setTimeout(resolve,20));}throw Error(label+': fixture deadline');}

// Observe real terminals only; no request, transaction, value or result is replaced.
const opens=new Set<IDBOpenDBRequest>(),connections=new Set<IDBDatabase>(),transactions=new Set<IDBTransaction>(),renders=new Set<Promise<unknown>>(),workers=new Set<Worker>();
let writes=0,workerCreates=0,renderCalls=0,restored=false;
const nativeOpen=IDBFactory.prototype.open,nativeClose=IDBDatabase.prototype.close,nativeTransaction=IDBDatabase.prototype.transaction,nativeRender=TextLayer.prototype.render,nativeTerminate=Worker.prototype.terminate,workerDescriptor=Object.getOwnPropertyDescriptor(window,'Worker')!;
IDBFactory.prototype.open=function(...args:Parameters<IDBFactory['open']>){const result=Reflect.apply(nativeOpen,this,args) as IDBOpenDBRequest;opens.add(result);result.addEventListener('success',()=>{opens.delete(result);connections.add(result.result);},{once:true});result.addEventListener('error',()=>opens.delete(result),{once:true});return result;};
IDBDatabase.prototype.close=function(){const result=Reflect.apply(nativeClose,this,[]);connections.delete(this);return result;};
IDBDatabase.prototype.transaction=function(...args:Parameters<IDBDatabase['transaction']>){const result=Reflect.apply(nativeTransaction,this,args) as IDBTransaction;transactions.add(result);if(result.mode==='readwrite')writes++;const done=()=>transactions.delete(result);result.addEventListener('complete',done,{once:true});result.addEventListener('abort',done,{once:true});return result;};
TextLayer.prototype.render=function(...args:Parameters<TextLayer['render']>){const result=Reflect.apply(nativeRender,this,args) as ReturnType<TextLayer['render']>;renderCalls++;renders.add(result);void result.then(()=>renders.delete(result),()=>renders.delete(result));return result;};
Object.defineProperty(window,'Worker',{...workerDescriptor,value:new Proxy(workerDescriptor.value,{construct(target,args,newTarget){const worker=Reflect.construct(target,args,newTarget) as Worker;workers.add(worker);workerCreates++;return worker;}})});
Worker.prototype.terminate=function(){const result=Reflect.apply(nativeTerminate,this,[]);workers.delete(this);return result;};
function restore(){check(opens.size===0&&connections.size===0&&transactions.size===0&&renders.size===0&&workers.size===0,'Native PDF/IDB work must settle before observer restoration');if(restored)return;IDBFactory.prototype.open=nativeOpen;IDBDatabase.prototype.close=nativeClose;IDBDatabase.prototype.transaction=nativeTransaction;TextLayer.prototype.render=nativeRender;Worker.prototype.terminate=nativeTerminate;Object.defineProperty(window,'Worker',workerDescriptor);restored=true;}

type Scope={accountId:string;spaceId:string;noteId:string};
type Source={scope:Scope;document:PaperDocument;api:ApiClient};
type Captured={id:number;request:PaperSearchNavigationRequest;allowed:boolean};
let root:Root|null=null,node:HTMLDivElement|null=null,sources:Record<string,Source>={},selected='a',viewDocument:PaperDocument|null=null,pageIndex=0,client:ApiClient|null=null,selectionEnabled=false,requestId:number|null=null,serial=0,sourceEpoch=0;
let ticket:object={},readyCount=0,selectionCallbacks=0,highlightCallbacks=0;
const captured=new Map<number,Captured>(),errors:string[]=[],operations=new Set<Promise<unknown>>();
const track=<T,>(work:Promise<T>)=>{operations.add(work);void work.then(()=>operations.delete(work),()=>operations.delete(work));return work;};
const identity=(scope:Scope)=>({...scope,type:'whiteboard' as const,documentId:notebookDocumentId(scope.noteId)});
function paint(){
 check(root&&viewDocument&&client,'Actual PDF shell has not started');const source=sources[selected],document=viewDocument,page=document.pages[pageIndex],asset=document.assets.find(asset=>asset.id===page.pdf?.assetId);check(page?.pdf&&asset,'Actual rendered PDF source missing');const own=ticket;
 flushSync(()=>root!.render(createElement(PaperPdfPage,{page,asset,document,media:{accountId:source.scope.accountId,spaceId:source.scope.spaceId,api:client!},current:()=>ticket===own,onReady:()=>{readyCount++;},onError:(message:string)=>errors.push(message.slice(0,240)),textSelectionEnabled:selectionEnabled,onSelectionChange:()=>{selectionCallbacks++;},onHighlight:()=>{highlightCallbacks++;return false;},searchRequest:requestId===null?undefined:captured.get(requestId)?.request})));
}
async function start(runId:string,enableSelection=false){
 check(!root&&/^[a-zA-Z0-9-]{8,80}$/.test(runId),'Fresh private PDF fixture required');const response=await fetch('/fixture.pdf',{cache:'no-store'});check(response.ok,'Private original PDF fixture missing');const blob=await response.blob(),assetId='pdf-search-original',pages=await importPaperPdf(blob,assetId);check(pages.length===5,'The actual original PDF must contain all five known fixture pages');
 for(const label of ['a','b','year']){
  const scope={accountId:`pdf-search-${label==='b'?'B':'A'}-${runId}`,spaceId:label==='year'?'year-two':'year-one',noteId:'known-pdf-note'},plain=migratePaper(scope.noteId,'',null,stamp);plain.pages=structuredClone(pages);plain.objects=[];plain.assets=[{id:assetId,name:'Known columns.pdf',mediaType:'application/pdf',size:blob.size}];const document=amendPaperCollaboration(plain,plain);check(isPaperDocument(document),'Known PDF canonical fixture must be valid');
  const api=new ApiClient('/qa');api.bindAccount(scope.accountId);sources[label]={scope,document,api};const draft:Draft={...identity(scope),title:'Private PDF search '+label,content:document,baseVersion:1,updatedAt:1,syncState:'synced'};
  await putDraft(draft);await putLocalBlob({...scope,id:assetId,documentId:notebookDocumentId(scope.noteId),blob,name:'Known columns.pdf',createdAt:1,status:'pending'});await putSnapshot({key:`pdf-search-recovery|${scope.accountId}|${scope.spaceId}`,accountId:scope.accountId,spaceId:scope.spaceId,value:{schema:1,kind:'synthetic-preservation-control',noteId:scope.noteId,documentId:notebookDocumentId(scope.noteId),originalSha256:await localBlobDigest(blob)}});
  await queueMutation({...identity(scope),id:`pdf-search-pending-${label}-${runId}`,baseVersion:1,content:document,createdAt:1,status:'pending'});
 }
 node=document.createElement('div');node.id='actual-pdf-search';document.body.append(node);root=createRoot(node);const caret=document.createElement('div');caret.id='outside-pdf-caret';caret.contentEditable='true';caret.textContent='Outside native caret witness';caret.setAttribute('aria-label','Native caret witness');caret.style.cssText='position:fixed;right:12px;top:80px;width:240px;min-height:50px;background:white;border:1px solid #999;z-index:500;white-space:pre-wrap';document.body.append(caret);
 selectionEnabled=enableSelection;selected='a';viewDocument=sources.a.document;client=sources.a.api;pageIndex=0;ticket={epoch:++sourceEpoch};node.style.cssText=`position:relative;width:${viewDocument.pages[0].width}px;height:${viewDocument.pages[0].height}px;margin:12px;background:white`;paint();await ready();return {scope:sources.a.scope,originalSha256:await localBlobDigest(blob),originalSize:blob.size,pages:pages.length};
}
async function ready(){await wait(()=>!!node?.querySelector('canvas[style*="visible"]')&&(!node.querySelector('.paper-pdf-text-frame')||!!node.querySelector('[data-pdf-text-state="ready"]'))&&renders.size===0,'Actual Page canvas and any mounted TextLayer ready');await document.fonts.ready;await frame();await frame();return state();}
function newRequest(mode:'fresh'|'stale'='fresh',occurrence=1){
 check(viewDocument,'Canonical request source missing');const document=viewDocument,base=sources[selected].document,hits=searchPaperDocument(mode==='stale'?base:document,'mot').filter(hit=>hit.kind==='pdf'&&hit.pageId===base.pages[0].id),hit=hits[occurrence];check(hit&&hits.length===2,'The actual first PDF page must contain exactly two repeated mot occurrences');const item:Captured={id:++serial,allowed:true,request:null!};item.request=Object.freeze({document,hit:Object.freeze({...hit}),current:()=>item.allowed});captured.set(item.id,item);return {id:item.id,start:hit.start,end:hit.end,occurrenceId:hit.occurrenceId,pageId:hit.pageId};
}
function attach(id:number|null){check(id===null||captured.has(id),'Captured request not found');requestId=id;paint();return state();}
function permit(id:number,allowed:boolean){const request=captured.get(id);check(request,'Captured request missing');request.allowed=allowed;return state();}
async function show(label:string,index=0,variant:'base'|'revision'='base',freshApi=false){
 check(sources[label],'Unknown exact private source');selected=label;pageIndex=index;viewDocument=variant==='revision'?{...sources[label].document,revision:sources[label].document.revision+1,updatedAt:'2026-10-15T10:00:01.000Z'}:sources[label].document;client=freshApi?new ApiClient('/qa'):sources[label].api;client.bindAccount(sources[label].scope.accountId);ticket={epoch:++sourceEpoch};const page=viewDocument.pages[index];check(page,'Private actual PDF page missing');if(node){node.style.width=page.width+'px';node.style.height=page.height+'px';}paint();return ready();
}
function sessionABA(){check(client,'Actual API missing');client.forgetSession();client.bindAccount(sources[selected].scope.accountId);return state();}
function staleAdmission(){check(viewDocument,'Source missing');const api=new ApiClient('/qa'),id=newRequest().id;permit(id,false);client=api;requestId=id;paint();let untouched=false;try{api.bindAccount('synthetic-other-account-proof');untouched=true;}catch{}check(untouched,'A stale request must not bind an unbound real ApiClient');return {id,unboundApiUntouched:untouched};}
async function stores(){
 const database=await new Promise<IDBDatabase>((resolve,reject)=>{const open=indexedDB.open('dowze-academie-pwa',3);open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);});
 const rows=await new Promise<Record<string,unknown[]>>((resolve,reject)=>{const names=Array.from(database.objectStoreNames),tx=database.transaction(names,'readonly'),result:Record<string,unknown[]>={};for(const name of names){const read=tx.objectStore(name).getAll();read.onsuccess=()=>{result[name]=read.result;};}tx.oncomplete=()=>{database.close();resolve(result);};tx.onabort=()=>{database.close();reject(tx.error);};});
 for(const name of ['blobs','scopedBlobs'])for(const item of rows[name]??[]){const row=item as {blob?:Blob;bytesSha256?:string;blobType?:string;blobSize?:number};if(row.blob){const blob=row.blob;delete row.blob;row.bytesSha256=await localBlobDigest(blob);row.blobType=blob.type;row.blobSize=blob.size;}}
 for(const [name,items] of Object.entries(rows))rows[name]=items.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));return {rows,writes};
}
const nodeIds=new WeakMap<Node,number>();let nodeSerial=0;const nodeId=(node:Node|null)=>{if(!node)return null;if(!nodeIds.has(node))nodeIds.set(node,++nodeSerial);return nodeIds.get(node)!;};
function selection(){const value=document.getSelection(),range=value?.rangeCount?value.getRangeAt(0):null,box=range?.getBoundingClientRect();return {activeId:(document.activeElement as HTMLElement|null)?.id??null,anchor:nodeId(value?.anchorNode??null),focus:nodeId(value?.focusNode??null),anchorOffset:value?.anchorOffset??null,focusOffset:value?.focusOffset??null,rangeCount:value?.rangeCount??0,collapsed:value?.isCollapsed??null,text:value?.toString()??'',witness:document.getElementById('outside-pdf-caret')?.textContent,caret:box?{x:box.x,y:box.y,width:box.width,height:box.height}:null};}
function geometry(){
 const host=node?.querySelector<HTMLElement>('.paper-pdf-text-frame'),svg=node?.querySelector<SVGSVGElement>('svg[data-paper-pdf-search-hit]');check(host&&svg,'Actual visual search paint missing');const hostBox=host.getBoundingClientRect(),page=viewDocument!.pages[pageIndex],scaleX=hostBox.width/page.width,scaleY=hostBox.height/page.height;
 const boxFor=(prefix:string)=>{const spans=Array.from(host.querySelectorAll<HTMLElement>('.paper-pdf-text-layer span')).filter(span=>span.childNodes.length===1&&span.firstChild?.nodeType===3&&span.textContent?.startsWith(prefix));check(spans.length===1,'Exact known native PDF line must be unique: '+prefix);const span=spans[0],at=span.textContent!.indexOf('mot');check(at>=0,'Exact known native PDF word missing');const range=document.createRange();range.setStart(span.firstChild!,at);range.setEnd(span.firstChild!,at+3);const box=range.getBoundingClientRect();range.detach();return {left:(box.left-hostBox.left)/scaleX,top:(box.top-hostBox.top)/scaleY,width:box.width/scaleX,height:box.height/scaleY};};
 const polygons=Array.from(svg.querySelectorAll('polygon')).map(polygon=>{const points=Array.from(polygon.points).map(point=>({x:point.x,y:point.y}));return {points,fill:getComputedStyle(polygon).fill,opacity:getComputedStyle(polygon).opacity};});return {occurrenceId:svg.dataset.paperPdfSearchHit,first:boxFor('GAUCHE A'),second:boxFor('GAUCHE B'),polygons,page:{width:page.width,height:page.height},source:host.dataset.pdfTextSource};
}
function state(){return {selected,pageIndex,sourceEpoch,requestId,searchState:node?.querySelector<HTMLElement>('[data-pdf-search-state]')?.dataset.pdfSearchState??null,paintCount:node?.querySelectorAll('svg[data-paper-pdf-search-hit]').length??0,textState:node?.querySelector<HTMLElement>('[data-pdf-text-state]')?.dataset.pdfTextState??null,readyCount,selectionCallbacks,highlightCallbacks,errors:errors.slice(-6),native:{opens:opens.size,connections:connections.size,transactions:transactions.size,renders:renders.size,workers:workers.size,workerCreates,renderCalls,writes},operations:operations.size,root:!!root};}
async function cleanup(){ticket={retired:true};if(root)flushSync(()=>root!.unmount());root=null;await frame();await frame();await wait(()=>opens.size===0&&connections.size===0&&transactions.size===0&&renders.size===0&&workers.size===0,'Real PDF/IDB teardown');node?.remove();node=null;document.getElementById('outside-pdf-caret')?.remove();restore();return state();}
const api={start:(...args:Parameters<typeof start>)=>track(start(...args)),ready:()=>track(ready()),show:(...args:Parameters<typeof show>)=>track(show(...args)),stores:()=>track(stores()),cleanup:()=>track(cleanup()),newRequest,attach,permit,sessionABA,staleAdmission,selection,geometry,state};
declare global{interface Window{__paperPdfSearch:typeof api}}
window.__paperPdfSearch=api;
