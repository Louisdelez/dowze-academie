/** NOT RUN by its author. Actual usePersistentState, Desktop opening helper and
 * DeviceCache; JSDOM and fake-indexeddb are explicit seams. No native UI claim.
 * A held read delays only the product's genuine completed transaction callback.
 * All original work remains followed through terminal settlement and cleanup. */
import {requireBoundedMountedCheck,mountedAuditPath} from './mounted-cleanup.mjs';
requireBoundedMountedCheck();
import {build} from 'vite';
import {JSDOM} from 'jsdom';
import {IDBFactory} from 'fake-indexeddb';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {join,dirname,isAbsolute,relative,sep} from 'node:path';
import {pathToFileURL} from 'node:url';

const names=[
 'A genuine publication/open CAS and a functional local edit keep the copied note before readonly hydration',
 'A completed native refresh cannot revive after key A-B-A or unmount',
 'A real same-key hook edit wins against an older refresh and fresh readonly refresh still works'
];
const report={schema:1,kind:'paper-desktop-duplicate-open-mounted',startedAt:new Date().toISOString(),proofScope:'Actual usePersistentState/openDesktopNotebookDuplicate/DeviceCache and fake-indexeddb transactions. JSDOM mount and scheduling of genuine callback delivery are explicit seams; no actual Desktop App, browser/native OS or multi-window broadcast claim.',declaredGroups:names.length,groups:[],passed:0,failed:0,fullSuite:false,fatal:null,cleanupFinal:{status:'NOTRUN'}};
const fixedSources=['src/hooks/usePersistentState.ts','src/lib/notebookDuplicatePublication.ts','src/lib/appStorage.ts','tests/paper-desktop-duplicate-open-entry.tsx','tests/run-paper-desktop-duplicate-open.mjs','tests/mounted-cleanup.mjs','package.json','node_modules/vite/package.json','node_modules/react/package.json','node_modules/react-dom/package.json','node_modules/jsdom/package.json','node_modules/fake-indexeddb/package.json'];
const inputs=new Set(fixedSources),sourceHashes=async()=>Object.fromEntries(await Promise.all([...inputs].sort().map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')])));
const hash=value=>createHash('sha256').update(JSON.stringify(value)??'undefined').digest('hex');
const brief=error=>({name:String(error?.name??'Error'),message:String(error?.message??error).split('\n')[0].slice(0,350),...(error&&'actual'in error?{actualSHA256:hash(error.actual)}:{}),...(error&&'expected'in error?{expectedSHA256:hash(error.expected)}:{}),at:String(error?.stack??'').split('\n').filter(line=>/^\s+at /.test(line)).slice(0,4)});
const operations=new Map(),records=new WeakMap(),timeouts=[],lateErrors=[],gates=new Set(),roots=new Set(),otherCaches=new Set(),connections=new Set(),transactions=new Set(),opens=new Set(),nativeErrors=[];
let m,dom,out,factory,cacheDB,committed=null,readGate=null,delegateRestore=null,fatalStop=false,sequence=0;
const globals=['window','document','HTMLElement','HTMLInputElement','Node','Event','CustomEvent','navigator','BroadcastChannel','IS_REACT_ACT_ENVIRONMENT'];
const originals=new Map(globals.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)])),oldNodeEnv=process.env.NODE_ENV;
function track(promise,label,kind='operation'){
 if(records.has(promise))return promise;const record={label,kind,timedOut:false};let complete;complete=Promise.resolve(promise).catch(error=>{if(record.timedOut)lateErrors.push({label,error:brief(error)});throw error;}).finally(()=>operations.delete(complete));records.set(complete,record);operations.set(complete,record);void complete.catch(()=>{});return complete;
}
async function bounded(promise,label,ms=6000,kind='operation'){
 const original=track(promise,label,kind);let timer;try{return await Promise.race([original,new Promise((_,reject)=>{timer=setTimeout(()=>{records.get(original).timedOut=true;timeouts.push(label);reject(Error(label+': timeout; original is still followed'));},ms);})]);}finally{clearTimeout(timer);}
}
async function drain(label,{excludeGroups=false}={}){
 const until=Date.now()+7000;while(true){const pending=[...operations].filter(([,record])=>!excludeGroups||record.kind!=='group').map(([promise])=>promise);if(!pending.length)return;const remaining=until-Date.now();if(remaining<=0)throw Error(label+': original operations still active');let timer;try{const done=await Promise.race([Promise.allSettled(pending).then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),remaining);})]);if(!done)throw Error(label+': original operations still active');}finally{clearTimeout(timer);}}
}
function deferred(){let resolve;const promise=new Promise(yes=>{resolve=yes;});return {promise,resolve};}
const ledger={started:0,completed:0,aborted:0,reads:0,puts:0,deletes:0,clears:0,heldNativeComplete:0,deliveredComplete:0};
const persistenceEvents=[];
const writeCount=()=>ledger.puts+ledger.deletes+ledger.clears;
const keys={a:'dowze.fixture.duplicate-open.account-a.year-one',b:'dowze.fixture.duplicate-open.account-b.year-one',year:'dowze.fixture.duplicate-open.account-a.year-two'};
const stamp='2026-10-15T10:00:00.000Z';
const note=(id,title)=>({id,title,markdown:'Exact original '+id+' body.\n',subjectIds:[],tags:['preserved'],createdAt:stamp,updatedAt:stamp});
const store=(suffix)=>({...m.EMPTY_SUBJECT_NOTES_STORE,documents:[note('source-'+suffix,'Source '+suffix),note('copy-'+suffix,'Copy '+suffix)],openDocumentIds:['source-'+suffix],activeDocumentId:'source-'+suffix});
const sorted=value=>Object.fromEntries(Object.entries(value).sort(([left],[right])=>left<right?-1:left>right?1:0));
function memory(){const rows=[];for(let index=0;index<m.appStorage.length;index++){const key=m.appStorage.key(index);assert.equal(typeof key,'string');rows.push([key,m.appStorage.getItem(key)]);}return sorted(Object.fromEntries(rows));}
function installNativeObservation(){
 const original=factory.open;
 factory.open=function(...args){const request=Reflect.apply(original,this,args);opens.add(request);request.addEventListener('error',()=>{opens.delete(request);nativeErrors.push({kind:'open',name:request.error?.name});},{once:true});request.addEventListener('success',()=>{
  opens.delete(request);const db=request.result;if(!cacheDB)cacheDB=db;connections.add(db);const close=db.close,nativeTransaction=db.transaction;db.close=function(...args){const value=Reflect.apply(close,this,args);connections.delete(db);return value;};
  db.transaction=function(...args){const tx=Reflect.apply(nativeTransaction,this,args);transactions.add(tx);ledger.started++;let finish;const terminal=new Promise(resolve=>{finish=resolve;});track(terminal,'Actual native '+tx.mode+' transaction terminal','native');
   tx.addEventListener('complete',()=>{transactions.delete(tx);ledger.completed++;finish();},{once:true});tx.addEventListener('abort',()=>{transactions.delete(tx);ledger.aborted++;nativeErrors.push({kind:'abort',name:tx.error?.name});finish();},{once:true});
   const gate=readGate?.armed&&db===cacheDB&&tx.mode==='readonly'&&Array.from(tx.objectStoreNames).includes('records')?readGate:null;
   if(gate){gate.armed=false;gate.tx=tx;let assigned;Object.defineProperty(tx,'oncomplete',{configurable:true,get:()=>assigned,set:callback=>{assigned=typeof callback==='function'?event=>{gate.callback=callback;gate.event=event;ledger.heldNativeComplete++;gate.entered.resolve();if(gate.released)gate.release();}:callback;}});}
   const objectStore=tx.objectStore;tx.objectStore=function(...args){const object=Reflect.apply(objectStore,this,args);if(object.name==='records')for(const method of ['get','put','delete','clear']){const delegate=object[method];object[method]=function(...args){const request=Reflect.apply(delegate,this,args);if(method==='get')request.addEventListener('success',()=>{ledger.reads++;if(gate)gate.successfulReads++;},{once:true});else ledger[method==='put'?'puts':method==='delete'?'deletes':'clears']++;return request;};}return object;};return tx;
  };
 },{once:true});return request;};return ()=>{factory.open=original;};
}
function holdActualRead(){
 assert.equal(readGate,null);const gate={armed:true,entered:deferred(),callback:null,event:null,tx:null,released:false,successfulReads:0,delivered:0};
 gate.release=()=>{gate.released=true;if(gate.callback&&gate.event){const callback=gate.callback;gate.callback=null;gate.delivered++;ledger.deliveredComplete++;callback.call(gate.tx,gate.event);}};readGate=gate;gates.add(gate);return gate;
}
async function readNative(){
 const db=await track(new Promise((resolve,reject)=>{const request=factory.open('dowze-academie-device-cache',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Owned native reader blocked'));}),'Independent native DB reader');
 try{return await track(new Promise((resolve,reject)=>{const tx=db.transaction('records','readonly'),object=tx.objectStore('records'),keys=object.getAllKeys(),values=object.getAll();tx.oncomplete=()=>resolve(sorted(Object.fromEntries(keys.result.map((key,index)=>[String(key),String(values.result[index])]))));tx.onabort=()=>reject(tx.error??Error('Native read aborted'));tx.onerror=()=>{};}),'Independent full native cache read');}finally{db.close();}
}
async function exactAll(expected,label){await bounded(m.appStorage.flush(),label+' cache flush');assert.deepEqual(memory(),expected,label+' exact complete public Storage');assert.deepEqual(await readNative(),expected,label+' exact complete native DB');assert.equal(m.appStorage.status().pending,0);assert.equal(m.appStorage.status().error,'');}
async function render(f,key){await m.act(async()=>{f.root.render(m.createElement(m.PersistentNotebookProbe,{storageKey:key,onCommit:value=>{committed=value;}}));});assert.equal(committed.key,key);assert.equal(f.node.querySelector('output')?.getAttribute('data-persistent-notebook-key'),key);return committed;}
async function mounted(key){const node=document.createElement('div');document.body.append(node);const f={node,root:m.createRoot(node),unmounted:false};roots.add(f);await render(f,key);return f;}
async function unmount(f){if(f.unmounted)return;await m.act(async()=>{f.root.unmount();});f.unmounted=true;roots.delete(f);f.node.remove();}
async function prepare(){
 const serial=++sequence,values={[keys.a]:JSON.stringify(store('a-'+serial)),[keys.b]:JSON.stringify(store('b-'+serial)),[keys.year]:JSON.stringify(store('year-'+serial))};for(const[key,value]of Object.entries(values))m.appStorage.setItem(key,value);await bounded(m.appStorage.flush(),'Seed only private cache rows');const before=memory();assert.deepEqual(await readNative(),before);return {before,a:JSON.parse(values[keys.a]),b:JSON.parse(values[keys.b]),year:JSON.parse(values[keys.year])};
}
async function entered(gate,work,label){
 let settled=false;void work.then(()=>{settled=true;},()=>{settled=true;});await bounded(gate.entered.promise,label);assert.equal(gate.armed,false);assert.equal(gate.successfulReads,1);assert.equal(gate.delivered,0);assert.equal(settled,false,'The actual public refresh must still await its genuine completed read callback');assert.ok(gate.event,'The original transaction has emitted its real complete event');assert.equal(transactions.has(gate.tx),false,'The held callback is not an artificial active native transaction');
}
async function cases(index){
 if(index===0){
  const seed=await prepare(),f=await mounted(keys.a),other=new m.DeviceCache();otherCaches.add(other);await other.initialize({length:0,key:()=>null,getItem:()=>null},factory);
  // The actual CAS publication updates the DeviceCache before React sees its
  // copied metadata. A subsequent ordinary functional setter must use that
  // current cache, not overwrite the copy from its older rendered list.
  const copied=note('new-published-copy','Published copy'),published={...seed.a,documents:[copied,...seed.a.documents]};
  assert.equal(await bounded(m.appStorage.compareAndSetItem(keys.a,JSON.stringify(seed.a),JSON.stringify(published)),'Actual copy metadata publication CAS'),true);await bounded(m.appStorage.flush(),'Actual publication terminal flush');assert.deepEqual(committed.value,seed.a);assert.equal(committed.value.documents.some(value=>value.id===copied.id),false);
  const current=structuredClone(published);current.documents=current.documents.map(value=>value.id===seed.a.documents[1].id?{...value,title:'Concurrent independent title',markdown:'Concurrent body kept exactly.\n',tags:['Concurrent']}:value);
  let attempts=0,competing=0;const native=m.appStorage.compareAndSetItem;
  m.appStorage.compareAndSetItem=async function(...args){attempts++;if(attempts===1){assert.equal(args[0],keys.a);assert.equal(await track(other.compareAndSetItem(keys.a,args[1],JSON.stringify(current)),'Actual competing cache CAS'),true);await track(other.flush(),'Actual competing cache flush');competing++;}return track(Reflect.apply(native,this,args),'Actual delegated opening CAS');};
  delegateRestore=()=>{m.appStorage.compareAndSetItem=native;delegateRestore=null;};
  await bounded(m.openDesktopNotebookDuplicate(m.appStorage,keys.a,copied.id,()=>true),'Actual bounded Desktop tab opening');delegateRestore();assert.equal(competing,1);assert.equal(attempts,2,'The first real stale CAS retries from the whole fresh store');
  const opened={...current,openDocumentIds:[...current.openDocumentIds,copied.id],activeDocumentId:copied.id};
  await exactAll(sorted({...seed.before,[keys.a]:JSON.stringify(opened)}),'Successful opening');assert.deepEqual(committed.value,seed.a,'Opening helper must not invoke a hook setter or secretly replace its RAM value');
  const eventAt=persistenceEvents.length;let admitted,updaterSource;await m.act(async()=>{admitted=committed.setValue(previous=>{updaterSource=structuredClone(previous);return {...previous,documents:previous.documents.map(value=>value.id===seed.a.documents[0].id?{...value,title:'Functional edit after publication',updatedAt:'2026-10-15T11:00:00.000Z'}:value)};});});assert.equal(admitted,true);assert.deepEqual(updaterSource,opened,'The real functional setter must receive the entire current cache, including the unseen published copy and the competing edit');
  const expectedStore={...opened,documents:opened.documents.map(value=>value.id===seed.a.documents[0].id?{...value,title:'Functional edit after publication',updatedAt:'2026-10-15T11:00:00.000Z'}:value)},expected=sorted({...seed.before,[keys.a]:JSON.stringify(expectedStore)});assert.deepEqual(committed.value,expectedStore);assert.equal(committed.value.documents.filter(value=>value.id===copied.id).length,1);await exactAll(expected,'Accepted functional edit preserves copied metadata');assert.deepEqual(persistenceEvents.slice(eventAt),[{kind:'success',key:keys.a}],'The actual hook flush continuation must finish before the readonly phase');const writes=writeCount();let accepted;
  await m.act(async()=>{accepted=await bounded(committed.refresh(),'Actual readonly hook hydration');});assert.equal(accepted,true);assert.deepEqual(committed.value,expectedStore);assert.equal(writeCount(),writes,'Hydration cannot rewrite a CAS result into the cache');await exactAll(expected,'Hydrated complete store');await unmount(f);other.close();otherCaches.delete(other);
  return {actualOpenHelper:true,actualMountedHook:true,genuineCASAttempts:attempts,copyUnseenByOldReact:true,functionalUpdaterFromCurrentCache:true,copiedNoteAndConcurrentEditExact:true,readonlyHydration:true,allForeignKeysExact:true,wholeStateSHA256:hash(expected)};
 }
 if(index===1){const variants=[];for(const transition of ['key-ABA','unmount']){
  const seed=await prepare(),f=await mounted(keys.a),old=committed.refresh,gate=holdActualRead(),work=track(old(),'Actual old refresh '+transition);await entered(gate,work,'Completed native read '+transition);
  const newer={...seed.a,documents:seed.a.documents.map((value,index)=>index===0?{...value,title:'New A after '+transition}:value)};m.appStorage.setItem(keys.a,JSON.stringify(newer));await bounded(m.appStorage.flush(),'Admit and commit newer A '+transition);
  if(transition==='key-ABA'){await render(f,keys.b);assert.deepEqual(committed.value,seed.b);await render(f,keys.a);assert.deepEqual(committed.value,newer);}else await unmount(f);
  const expected=sorted({...seed.before,[keys.a]:JSON.stringify(newer)}),writes=writeCount();let accepted;await m.act(async()=>{gate.release();accepted=await bounded(work,'Old callback terminal '+transition);});assert.equal(accepted,false,'A retired native read cannot hydrate a later key incarnation or an unmounted hook');assert.equal(gate.delivered,1);assert.equal(writeCount(),writes,'A revoked refresh never writes storage');if(transition==='key-ABA')assert.deepEqual(committed.value,newer);else assert.equal(f.node.isConnected,false);
  await exactAll(expected,'Retired refresh '+transition);if(!f.unmounted)await unmount(f);readGate=null;gates.delete(gate);variants.push({transition,revokedRefresh:false,allKeysExact:true});
 }return {actualMountedHook:true,variants};}
 const seed=await prepare(),f=await mounted(keys.a),old=committed.refresh,gate=holdActualRead(),work=track(old(),'Actual old same-key refresh');await entered(gate,work,'Completed same-key native read');
 const newer={...seed.a,documents:seed.a.documents.map((value,index)=>index===0?{...value,title:'Accepted same-key title',markdown:'Accepted local content.\n',updatedAt:'2026-10-15T11:00:00.000Z'}:value)},eventAt=persistenceEvents.length;let admitted;await m.act(async()=>{admitted=committed.setValue(newer);});assert.equal(admitted,true);assert.deepEqual(committed.value,newer);await bounded(m.appStorage.flush(),'Actual same-key local edit commits');assert.deepEqual(persistenceEvents.slice(eventAt),[{kind:'success',key:keys.a}],'The accepted local flush/event continuation has completed');
 const expected=sorted({...seed.before,[keys.a]:JSON.stringify(newer)}),writes=writeCount();let accepted;await m.act(async()=>{gate.release();accepted=await bounded(work,'Stale same-key read terminal');});assert.equal(accepted,false);assert.equal(gate.delivered,1);assert.deepEqual(committed.value,newer);assert.equal(writeCount(),writes,'The old read cannot rewrite or replace a newer accepted local edit');readGate=null;gates.delete(gate);
 await exactAll(expected,'Accepted local edit wins');await m.act(async()=>{accepted=await bounded(committed.refresh(),'Fresh readonly refresh after refusal');});assert.equal(accepted,true);assert.deepEqual(committed.value,newer);assert.equal(writeCount(),writes);await exactAll(expected,'Fresh retry remains read-only');await unmount(f);
 return {actualHookSetter:true,oldRefresh:false,freshRefresh:true,readonlyRetry:true,allForeignKeysExact:true,wholeStateSHA256:hash(expected)};
}
async function cleanupGroup(){
 for(const gate of gates)gate.release();await drain('Drain every original group/helper/read/setter/native operation before fixture teardown');if(delegateRestore)delegateRestore();for(const f of [...roots])await bounded(unmount(f),'Actual mounted hook unmount');for(const cache of otherCaches){await bounded(cache.flush(),'Other real cache final flush');cache.close();otherCaches.delete(cache);}await bounded(m.appStorage.flush(),'Final actual main-cache flush');await drain('Drain actual cleanup/native terminals');assert.equal(transactions.size,0);assert.equal(opens.size,0);assert.deepEqual(nativeErrors,[]);gates.clear();readGate=null;
}
async function group(index){const timeoutAt=timeouts.length;let row;try{row={name:names[index],status:'PASS',evidence:await bounded(cases(index),'Whole mounted group '+(index+1),20000,'group')};report.passed++;}catch(error){row={name:names[index],status:'FAIL',error:brief(error),native:{...ledger}};report.failed++;}report.groups.push(row);try{await cleanupGroup();assert.equal(timeouts.length,timeoutAt,'No wrapper timeout may satisfy a refusal assertion or become PASS');row.cleanup='PASS';}catch(error){row.cleanup='FAIL';row.cleanupError=brief(error);if(row.status==='PASS'){row.bodyStatus='PASS';row.status='FAIL';report.passed--;report.failed++;}throw error;}console.log(row.name+': '+row.status);}
let restoreFactory;
try{
 out=await mkdtemp(join(process.cwd(),'tests/.desktop-duplicate-open-'));process.env.NODE_ENV='development';
 await build({configFile:false,logLevel:'error',plugins:[{name:'pin-actual-duplicate-open-sources',transform(_code,id){const path=id.split('?')[0];if(isAbsolute(path)&&path.startsWith(process.cwd()+sep)&&!path.includes(sep+'node_modules'+sep))inputs.add(relative(process.cwd(),path));}}],build:{ssr:'tests/paper-desktop-duplicate-open-entry.tsx',outDir:out,emptyOutDir:false,copyPublicDir:false,minify:false,sourcemap:false,reportCompressedSize:false,target:'node22',rollupOptions:{preserveEntrySignatures:'strict',output:{entryFileNames:'entry.mjs'}}}});
 report.sourceHashes=await sourceHashes();report.bundleSHA256=createHash('sha256').update(await readFile(join(out,'entry.mjs'))).digest('hex');
 dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://desktop-duplicate-open.invalid'});for(const name of globals){const value=name==='IS_REACT_ACT_ENVIRONMENT'?true:name==='BroadcastChannel'?undefined:name==='window'?dom.window:dom.window[name];Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});}for(const kind of ['success','error','recovery'])window.addEventListener('etude:persistence-'+kind,event=>persistenceEvents.push({kind,key:event.detail?.key??null}));
 m=await import(pathToFileURL(join(out,'entry.mjs')).href);factory=new IDBFactory();restoreFactory=installNativeObservation();await bounded(m.appStorage.initialize({length:0,key:()=>null,getItem:()=>null},factory),'Initialize actual singleton DeviceCache');for(let index=0;index<names.length;index++)await group(index);
}catch(error){report.fatal=brief(error);process.exitCode=1;}
finally{
 try{if(m){await cleanupGroup();await drain('All original operations before closing singleton');assert.equal(roots.size,0);assert.equal(otherCaches.size,0);assert.equal(transactions.size,0);assert.equal(opens.size,0);m.appStorage.close();assert.equal(connections.size,0);if(factory)await bounded(new Promise((resolve,reject)=>{const request=factory.deleteDatabase('dowze-academie-device-cache');request.onsuccess=resolve;request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Owned private cache DB remained open during cleanup'));}),'Delete only the owned synthetic cache database');}if(restoreFactory)restoreFactory();await drain('All final native work before globals restore');assert.ok(persistenceEvents.every(event=>event.kind==='success'),'No persistence error/recovery event may be hidden');report.cleanupFinal={status:'PASS',operations:operations.size,roots:roots.size,connections:connections.size,transactions:transactions.size,opens:opens.size,gates:gates.size};}catch(error){report.cleanupFinal={status:'FAIL',error:brief(error),operations:operations.size,roots:roots.size,connections:connections.size,transactions:transactions.size,opens:opens.size};report.fatal={prior:report.fatal,cleanup:brief(error)};process.exitCode=1;fatalStop=operations.size>0||transactions.size>0||opens.size>0||connections.size>0||roots.size>0;}
 if(fatalStop)console.error(JSON.stringify({kind:'FATAL_STOP',finalReportWritten:false,cleanup:report.cleanupFinal,pending:[...operations.values()].map(value=>({label:value.label,kind:value.kind})).slice(0,12)}));
 else{
  dom?.window.close();for(const[name,descriptor]of originals)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];if(oldNodeEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=oldNodeEnv;
  if(out)try{await bounded(rm(out,{recursive:true,force:true}),'Remove only owned SSR fixture bundle');await drain('Actual bundle removal terminal');}catch(error){report.cleanupFinal={status:'FAIL',prior:report.cleanupFinal,error:brief(error)};process.exitCode=1;fatalStop=operations.size>0;}
  if(fatalStop)console.error(JSON.stringify({kind:'FATAL_STOP',finalReportWritten:false,cleanup:report.cleanupFinal}));
  else{try{report.sourceHashesAfter=await sourceHashes();assert.deepEqual(report.sourceHashesAfter,report.sourceHashes);report.finalFreeze='PASS';}catch(error){report.finalFreeze='FAIL';report.freezeError=brief(error);process.exitCode=1;}const attempted=new Set(report.groups.map(row=>row.name));for(const name of names)if(!attempted.has(name))report.groups.push({name,status:'NOTRUN',reason:'Earlier setup or terminal cleanup failure'});report.groupsStarted=attempted.size;report.timeouts=timeouts;report.lateErrors=lateErrors;report.native={...ledger};report.fullSuite=attempted.size===names.length&&report.passed===names.length&&!report.failed&&!report.fatal&&timeouts.length===0&&lateErrors.length===0&&report.cleanupFinal.status==='PASS'&&report.finalFreeze==='PASS';if(!report.fullSuite)process.exitCode=1;report.finishedAt=new Date().toISOString();const path=mountedAuditPath('paper-desktop-duplicate-open-mounted-20261015.json');await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,failed:report.failed,notRun:report.groups.filter(row=>row.status==='NOTRUN').length,fullSuite:report.fullSuite,cleanup:report.cleanupFinal.status,finalFreeze:report.finalFreeze,report:path}));}
 }
}
