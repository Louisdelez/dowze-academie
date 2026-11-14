/** Source-only candidate recipe. Root alone executes under its resource guard. */
import {build} from 'vite';
import {IDBFactory,IDBKeyRange} from 'fake-indexeddb';
import {JSDOM} from 'jsdom';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join,resolve,relative,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const reportPath=resolve(process.argv[2]??'paper-notebook-mirror-barrier-runtime.json'),directory=await mkdtemp(join(process.cwd(),'tests/.notebook-mirror-barrier-'));
const previousNodeEnv=process.env.NODE_ENV;
const pending=new Map(),timeouts=[],gates=new Set(),opens=new Set(),transactions=new Set(),connections=new Set(),groups=[],restores=[];
const compiledSources=new Map();
let module,dom,root,node,fixture,serial=0,fatal=null,importHold=null,importCalls=0,importSeamCount=0;
const oldImportFragment="void import('../lib/paperArchiveMetadata').then",heldImportFragment="void globalThis.__paperMirrorImportGate(import('../lib/paperArchiveMetadata')).then";
const sha=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const sourcePaths=['src/components/PaperNotebook.tsx','src/lib/paperMarkdownMirrorBarrier.ts','src/hooks/usePaperDocument.ts','src/lib/paperLegacyBridge.ts','src/hooks/usePersistentState.ts','src/lib/appStorage.ts','src/lib/notebookSession.ts','tests/paper-notebook-mirror-barrier-entry.tsx','tests/run-paper-notebook-mirror-barrier.mjs','package.json','package-lock.json'];
const sourcePins=await Promise.all(sourcePaths.map(async path=>({path,sha256:sha(await readFile(path,'utf8'))})));
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
function track(work,name,kind='operation'){const promise=Promise.resolve(work),id=++serial;pending.set(id,{promise,name,kind});promise.then(()=>pending.delete(id),()=>pending.delete(id));return promise;}
async function bounded(work,name,ms=12000,kind='operation'){const original=track(work,name,kind);let timer;try{return await Promise.race([original,new Promise((_,reject)=>{timer=setTimeout(()=>{timeouts.push(name);reject(Error('Timed out: '+name));},ms);})]);}finally{clearTimeout(timer);}}
async function drain(name,excludeGroups=false){const until=Date.now()+15000,active=()=>[...pending.values()].filter(row=>!excludeGroups||row.kind!=='group').length;while(active()||opens.size||transactions.size){if(Date.now()>until)throw Error('FATAL_STOP '+name+' active='+active()+'/'+opens.size+'/'+transactions.size);await tick();}}
async function wait(predicate,name){const until=Date.now()+10000;for(;;){if(await predicate())return;if(Date.now()>until)throw Error('Readiness deadline: '+name);await module.act(tick);}}
function expose(object,key,value){const before=Object.getOwnPropertyDescriptor(object,key);Object.defineProperty(object,key,{configurable:true,writable:true,value});restores.push(()=>{if(before)Object.defineProperty(object,key,before);else Reflect.deleteProperty(object,key);});}
function gate(){let enter,release;const entered=new Promise(resolve=>enter=resolve),held=new Promise(resolve=>release=resolve);gates.add(release);return {entered,enter,held,release:()=>{gates.delete(release);release();}};}
function fibers(){const queue=root?._internalRoot?.current?[root._internalRoot.current]:[],all=[];while(queue.length){const row=queue.pop();all.push(row);if(row.child)queue.push(row.child);if(row.sibling)queue.push(row.sibling);}return all;}
function notebook(){return fibers().find(row=>row.memoizedProps?.paper&&row.memoizedProps?.document?.noteId===fixture.noteId)?.memoizedProps;}
const scope=(accountId='mirror-A')=>({accountId,spaceId:'year-one'});
const cacheKey=media=>'dowze.test.mirror-parent.'+media.accountId+'.'+media.spaceId;
const note=(id,text)=>({id,title:id,markdown:text,createdAt:'2026-10-15T10:00:00.000Z',updatedAt:'2026-10-15T10:00:00.000Z',tags:[],subjectIds:[]});
async function seed(media,id,text){const value=note(id,text),plain=module.migratePaper(id,text),graph=module.amendPaperCollaboration(plain,{...plain,revision:plain.revision+1});await module.putDraft({...media,type:'whiteboard',title:value.title,documentId:module.notebookDocumentId(id),content:graph,baseVersion:0,updatedAt:1,syncState:'local'});await module.putDraft({...media,type:'notesMarkdown',title:value.title,documentId:id,content:value,paperDependency:module.notebookDocumentId(id),baseVersion:0,updatedAt:1,syncState:'local'});await module.putLocalBlob({...media,id:id+'-original',documentId:module.notebookDocumentId(id),blob:new Blob(['Exact original '+text],{type:'application/octet-stream'}),name:'original.bin',createdAt:1,status:'pending',removedFromNote:true});module.appStorage.setItem(cacheKey(media),JSON.stringify({schemaVersion:2,documents:[value],openDocumentIds:[id],activeDocumentId:id}));await module.appStorage.flush();return graph;}
async function inventory(media){const files=await module.listLocalBlobs(media.accountId,media.spaceId);return sha({drafts:await module.listDrafts(media.accountId,media.spaceId),mutations:await module.listMutations(media.accountId,media.spaceId),files:await Promise.all(files.map(async({blob,...row})=>({...row,blobSize:blob.size,blobType:blob.type,blobSHA256:createHash('sha256').update(new Uint8Array(await blob.arrayBuffer())).digest('hex')}))),snapshots:await module.listSnapshots(media.accountId,media.spaceId),cache:await module.appStorage.readCurrentItem(cacheKey(media))});}
function render(){root.render(module.createElement(module.NativeMirrorParent,{...fixture,cacheKey:cacheKey(fixture.media),observe:value=>{fixture.observed=value;},accepted:work=>track(work,'actual native parent writer'),committed:(source,text)=>fixture.hold?.source===source?fixture.hold.committed(text):Promise.resolve()}));}
async function ready(){await wait(()=>{const value=notebook();return value?.paper.legacyReady&&value.paper.saved&&!value.paper.reconciling&&!value.paper.blocked&&value.paper.getCurrent()===value.document;},'actual Notebook opening');await module.act(async()=>{await notebook().paper.whenSaved();});}
function canonicalEdit(text){const value=notebook(),object=value.paper.getCurrent().objects.find(row=>row.kind==='text');assert.ok(object,'A real canonical source object is required');assert.equal(value.paper.command({type:'patch-object',id:object.id,patch:{markdown:text}}),true);}
async function metadata(media,id){const raw=await module.appStorage.readCurrentItem(cacheKey(media));assert.ok(raw);return JSON.parse(raw).documents.find(note=>note.id===id);}
async function mount(id,api){importHold=null;const a=scope(id),b=scope(id+'-foreign');await seed(a,'A','Original source A');await seed(b,'B','Foreign exact source B');fixture={media:api?{...a,api}:a,noteId:'A',hold:null,observed:null,readOnly:false};node=document.createElement('div');document.body.append(node);root=module.createRoot(node);await module.act(async()=>render());await ready();await drain('baseline real import/native jobs',true);return {a,b};}
async function cleanMounted(){
 for(const release of [...gates])release();gates.clear();await drain('before actual component teardown');module.resumeAllNotebookAccounts();let refusal;
 if(root){try{await bounded(module.settleNotebookAccount(fixture.media.accountId),'cleanup actual account settlement');}catch(error){refusal=error;}
  // A terminal refusal is still a test failure, but must not skip teardown of
  // known idle resources. Active original work/writers continue to forbid it.
  await wait(()=>!module.hasPendingNotebookWrites(),'every original product writer terminal');await drain('settled product writer/native terminals');await module.act(async()=>{root.unmount();});root=null;}
 module.resumeAllNotebookAccounts();await drain('after actual component teardown');try{await module.appStorage.flush();}catch(error){refusal??=error;}node?.remove();node=null;fixture=null;assert.equal(module.hasPendingNotebookWrites(),false);if(refusal)throw refusal;
} 
async function group(name,body){const baselineTimeouts=timeouts.length;let row;try{await bounded(body(),name,25000,'group');row={name,status:'PASS'};}catch(error){row={name,status:'FAIL',error:String(error?.stack??error).slice(0,1800)};}finally{try{await cleanMounted();assert.equal(timeouts.length,baselineTimeouts,'A timeout cannot satisfy a refusal oracle');row.cleanup='PASS';}catch(error){row.status='FAIL';row.cleanup='FAIL';fatal=String(error);groups.push(row);throw error;}}groups.push(row);}

try{
 process.env.NODE_ENV='development';
 await bounded(build({configFile:false,ssr:{noExternal:['yjs','lib0']},plugins:[{name:'declared-old-passive-mirror-import-return-gate',enforce:'pre',async transform(code,id){const path=id.split('?')[0];if(path.startsWith(process.cwd()+sep)&&!path.includes(sep+'node_modules'+sep))compiledSources.set(relative(process.cwd(),path),createHash('sha256').update(await readFile(path)).digest('hex'));if(path!==resolve('src/components/PaperNotebook.tsx'))return;importSeamCount=code.split(oldImportFragment).length-1;assert.ok(importSeamCount===0||importSeamCount===1,'Only the exact old mirror import may be scheduled by this seam');if(!importSeamCount){assert.ok(code.includes('createPaperMarkdownMirrorBarrier'),'Unknown Notebook source cannot skip the declared old scheduling seam');return;}return code.replace(oldImportFragment,heldImportFragment);}}],build:{ssr:'tests/paper-notebook-mirror-barrier-entry.tsx',outDir:directory,copyPublicDir:false,minify:false,sourcemap:false,reportCompressedSize:false,rollupOptions:{preserveEntrySignatures:'strict',output:{entryFileNames:'entry.mjs'}}},logLevel:'error'}),'actual Notebook SSR fixture build',60000);
 dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://private-mirror.invalid/'});
 for(const key of ['window','document','HTMLElement','SVGElement','HTMLInputElement','HTMLSelectElement','HTMLTextAreaElement','Element','Node','NodeFilter','DOMParser','MutationObserver','CustomEvent','Event','KeyboardEvent','ShadowRoot'])expose(globalThis,key,key==='window'?dom.window:key==='document'?dom.window.document:dom.window[key]);
 for(const key of ['addEventListener','removeEventListener','dispatchEvent','getComputedStyle'])expose(globalThis,key,dom.window[key].bind(dom.window));
 expose(globalThis,'navigator',dom.window.navigator);Object.defineProperty(dom.window.navigator,'onLine',{configurable:true,value:false});
 expose(globalThis,'innerWidth',1280);expose(globalThis,'innerHeight',900);expose(globalThis,'IS_REACT_ACT_ENVIRONMENT',true);
 expose(globalThis,'__paperMirrorImportGate',original=>track((async()=>{const actual=await original;importCalls++;const held=importHold;if(held){held.enter();await held.held;}return actual;})(),'actual loaded mirror import return'));
 expose(globalThis,'requestAnimationFrame',fn=>setTimeout(()=>fn(performance.now()),0));expose(globalThis,'cancelAnimationFrame',clearTimeout);dom.window.requestAnimationFrame=globalThis.requestAnimationFrame;dom.window.cancelAnimationFrame=clearTimeout;
 class ResizeObserver{observe(){}unobserve(){}disconnect(){}}expose(globalThis,'ResizeObserver',ResizeObserver);dom.window.ResizeObserver=ResizeObserver;expose(globalThis,'IntersectionObserver',class{observe(){}unobserve(){}disconnect(){}});
 dom.window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});dom.window.Range.prototype.getClientRects=()=>[];dom.window.Range.prototype.getBoundingClientRect=()=>new dom.window.DOMRect();dom.window.Element.prototype.scrollIntoView=()=>{};
 Object.defineProperty(dom.window.HTMLElement.prototype,'clientWidth',{get(){return 820;}});Object.defineProperty(dom.window.HTMLElement.prototype,'clientHeight',{get(){return 700;}});dom.window.HTMLElement.prototype.getBoundingClientRect=()=>new dom.window.DOMRect(0,0,820,700);dom.window.SVGElement.prototype.getBoundingClientRect=()=>new dom.window.DOMRect(0,0,600,700);dom.window.SVGElement.prototype.getScreenCTM=()=>null;
 const factory=new IDBFactory();expose(globalThis,'indexedDB',factory);expose(globalThis,'IDBKeyRange',IDBKeyRange);
 const observeTransaction=tx=>{if(transactions.has(tx))return tx;transactions.add(tx);tx.addEventListener('complete',()=>transactions.delete(tx));tx.addEventListener('abort',()=>transactions.delete(tx));return tx;};
 const realOpen=factory.open;factory.open=function(...args){const request=realOpen.apply(this,args);opens.add(request);request.addEventListener('upgradeneeded',()=>observeTransaction(request.transaction));request.addEventListener('success',()=>{opens.delete(request);const db=request.result;connections.add(db);const close=db.close.bind(db);db.close=()=>{close();connections.delete(db);};const transaction=db.transaction.bind(db);db.transaction=(...args)=>observeTransaction(transaction(...args));});request.addEventListener('error',()=>opens.delete(request));return request;};
 module=await import(pathToFileURL(join(directory,'entry.mjs')));for(const name of ['act','createRoot','createElement','flushSync','NativeMirrorParent','putDraft','putLocalBlob','migratePaper','amendPaperCollaboration','settleNotebookAccount','getSnapshot','paperLegacyReceiptKey'])assert.equal(typeof module[name],'function','Actual fixture runtime export missing before cache/root admission: '+name);assert.equal(typeof module.appStorage?.initialize,'function','Actual cache initializer export required before admission');await bounded(module.appStorage.initialize(dom.window.localStorage,factory),'actual native DeviceCache initialize');
 await group('Actual Notebook account settlement waits for its once-flushed native metadata publication',async()=>{
  const {a,b}=await mount('mirror-settle');const foreign=await inventory(b),held=gate(),effectAdmission=gate();importHold=effectAdmission;fixture.hold={source:fixture.observed.source,committed:async()=>{held.enter();await held.held;}};
  let settled=false;let closing;
  // Invoke real canonical admission and account flush in the same stack, before
  // React can admit the later passive mirror effect. No output/desired-state poll.
  await module.act(async()=>{module.flushSync(()=>canonicalEdit('Canonical contribution before its deferred native mirror'));closing=track(module.settleNotebookAccount(a.accountId).then(()=>{settled=true;}),'whole account settlement');await tick();});
  const admitted=await bounded(Promise.race([held.entered.then(()=>true),closing.then(()=>false)]),'native publication admission');
  assert.equal(admitted,true,'The actual native parent setter must be reached before account settlement can finish');
  assert.equal(settled,false,'Account receipt must remain pending while the original native writer return is held');
  const graph=notebook().paper.getCurrent();assert.equal((await metadata(a,'A')).markdown,module.paperMarkdown(graph),'The held setter has already committed its real cache transaction');
  // Layout-only canonical evolution uses the actual document writer and keeps
  // the accepted publication, rather than cancelling it with effect cleanup.
  await module.act(async()=>{const page=notebook().paper.getCurrent().pages[0];assert.equal(notebook().paper.command({type:'update-page',page:{...page,bookmark:!page.bookmark}}),true);});
  held.release();effectAdmission.release();importHold=null;await bounded(closing,'native mirror final receipt');module.resumeAllNotebookAccounts();await module.act(tick);await drain('completed native mirror',true);
  assert.equal((await metadata(a,'A')).markdown,module.paperMarkdown(notebook().paper.getCurrent()));assert.equal(await inventory(b),foreign);
 });
 await group('A held original native mirror cannot retarget a replacement API or revive after API A to B to A',async()=>{
  const {a,b}=await mount('mirror-api-aba');const foreign=await inventory(b),held=gate();fixture.hold={source:fixture.observed.source,committed:async()=>{held.enter();await held.held;}};
  await module.act(async()=>{module.flushSync(()=>canonicalEdit('Original accepted scope before API retirement'));});
  await bounded(held.entered,'original native mirror durable commit');const committed=await metadata(a,'A');
  const api=new module.ApiClient('',async()=>{throw new TypeError('Declared offline fixture');});api.bindAccount(a.accountId);
  await module.act(async()=>{fixture.media={...a,api};render();});await ready();
  await module.act(async()=>{fixture.media=a;render();});await ready();
  held.release();await drain('retired original native mirror',true);await module.act(tick);
  assert.equal((await metadata(a,'A')).markdown,committed.markdown,'The completed original writer keeps its original durable source');assert.equal(await inventory(b),foreign,'Every foreign source/media/outbox/receipt stays exact');
  await bounded(module.settleNotebookAccount(a.accountId),'fresh current API settlement');module.resumeAllNotebookAccounts();
  assert.equal((await metadata(a,'A')).markdown,module.paperMarkdown(notebook().paper.getCurrent()));
 });
 await group('The same real ApiClient session epoch cannot publish an old receipt and a fresh rendered incarnation can resume',async()=>{
  const accountId='mirror-session-aba',api=new module.ApiClient('',async()=>{throw new TypeError('Declared offline fixture');});api.bindAccount(accountId);
  const {a,b}=await mount(accountId,api),foreign=await inventory(b),held=gate();fixture.hold={source:fixture.observed.source,committed:async()=>{held.enter();await held.held;}};
  const oldSession=api.captureSessionAuthority(accountId);
  await module.act(async()=>{module.flushSync(()=>canonicalEdit('Native original admitted before same-object session retirement'));});
  await bounded(held.entered,'same API original native durable commit');
  const receiptKey=module.paperLegacyReceiptKey(a,'A'),before=await module.getSnapshot(receiptKey);assert.equal(before?.value?.mirror?.status,'staged','The actual bridge has staged the original receipt before its native writer returns');const originalMirror=structuredClone(before.value.mirror),originalMetadata=await metadata(a,'A');
  api.forgetSession();api.bindAccount(accountId);assert.equal(oldSession(),false,'Real ApiClient epoch must stay revoked after account A returns');
  // Keep the new rendered control read-only solely while observing the old
  // callback. A legitimate new mirror must not mask its receipt oracle.
  await module.act(async()=>{fixture.readOnly=true;render();});held.release();await drain('same-object revoked original return',true);await ready();
  const refused=await module.getSnapshot(receiptKey);assert.deepEqual(refused?.value?.mirror,originalMirror,'The old session cannot publish or replace its exact staged receipt after its real native return');assert.equal((await metadata(a,'A')).markdown,originalMetadata.markdown,'Accepted original metadata remains durable in its original scope');assert.equal(await inventory(b),foreign,'Every foreign source, receipt, queue and original byte stays exact');
  fixture.hold=null;await module.act(async()=>{fixture.readOnly=false;render();});await ready();
  await module.act(async()=>{module.flushSync(()=>canonicalEdit('Fresh current same-API session contribution after rendered re-admission'));});
  await bounded(module.settleNotebookAccount(accountId),'fresh same-API rendered incarnation settlement');module.resumeAllNotebookAccounts();await module.act(tick);await drain('fresh same-API original work terminal',true);
  const published=await module.getSnapshot(receiptKey);assert.equal(published?.value?.mirror?.status,'published','Fresh current controls must resume after the admitted API epoch changes');assert.notEqual(published.value.mirror.id,originalMirror.id);assert.equal((await metadata(a,'A')).markdown,module.paperMarkdown(notebook().paper.getCurrent()));assert.equal(await inventory(b),foreign);
 });
}catch(error){fatal=String(error?.stack??error).slice(0,1800);}
finally{
 for(const release of [...gates])release();gates.clear();
 try{await drain('final original work');if(root)await cleanMounted();}catch(error){fatal??=String(error?.stack??error).slice(0,1800);}
 // Close only the known cache, after actual component and original work are
 // terminal. Never force-close unknown connections to manufacture actor zero.
 if(!root&&!pending.size&&!opens.size&&!transactions.size&&(!module||!module.hasPendingNotebookWrites())){
  if(module){module.resumeAllNotebookAccounts();try{await bounded(module.appStorage.flush(),'final native cache flush');}catch(error){fatal??=String(error?.stack??error).slice(0,1800);}finally{module.appStorage.close();}}
 }
 try{await drain('final native terminals');}catch(error){fatal??=String(error?.stack??error).slice(0,1800);}
 if(root||pending.size||opens.size||transactions.size||connections.size||module?.hasPendingNotebookWrites()){
  console.error('MIRROR_PRE_FATAL_DIAGNOSTIC '+JSON.stringify({fatal,groups:groups.map(({name,status,cleanup,error})=>({name,status,cleanup,error:error?.split('\n').slice(0,4).join('\n').slice(0,600)})),timeouts,pending:[...pending.values()].slice(0,24).map(({name,kind})=>({name,kind})),opens:opens.size,transactions:[...transactions].slice(0,24).map(tx=>({mode:tx.mode,database:tx.db.name,stores:[...tx.objectStoreNames]})),connections:[...connections].slice(0,24).map(db=>({name:db.name,version:db.version})),root:!!root,pendingWriters:module?.hasPendingNotebookWrites()??null}));
  throw Error('FATAL_STOP before globals/report: accepted actors remain active');
 }
 if(previousNodeEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previousNodeEnv;
 dom?.window.close();for(const restore of restores.reverse())restore();await bounded(rm(directory,{recursive:true,force:true}),'owned fixture bundle cleanup');await drain('bundle removal');
 const finalPins=await Promise.all(sourcePaths.map(async path=>({path,sha256:sha(await readFile(path,'utf8'))})));assert.deepEqual(finalPins,sourcePins,'Product and fixture source pins must remain frozen');
 for(const[path,hash]of compiledSources)assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'),hash,'Every compiled actual source must remain frozen: '+path);
 const passed=groups.filter(row=>row.status==='PASS').length,failed=groups.filter(row=>row.status!=='PASS').length,fullSuite=groups.length===3&&passed===3&&!fatal&&timeouts.length===0;
 await writeFile(reportPath,JSON.stringify({schema:1,kind:'actual-notebook-native-mirror-barrier',declaredGroups:3,groups,passed,failed,fullSuite,fatal,timeouts,sourcePins,compiledSources:[...compiledSources].map(([path,sha256])=>({path,sha256})),finalFreeze:'PASS',fixtureSeams:{oldImportReturn:{exactFragmentSHA256:sha(oldImportFragment),compiledCallsites:importSeamCount,actualCalls:importCalls,actualModuleDelegated:true,onlyOriginalReturnDelayed:true},nativeParentReturn:'held only after real DeviceCache.flush commit'},cleanup:{operations:pending.size,opens:opens.size,transactions:transactions.size,connections:connections.size,roots:root?1:0},proofScope:'Actual PaperNotebook/usePaperDocument/bridge/native persistent hook+DeviceCache/fakeIndexedDB. Explicit synthetic geometry/offline, exact old passive import-return seam and durable-parent-return gate. Not actual Desktop App/Chromium/native OS.'},null,2)+'\n');if(!fullSuite)process.exitCode=1;
}
