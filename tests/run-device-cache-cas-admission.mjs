/** NOT RUN by its author. Actual DeviceCache and fake-indexeddb.
 * Only delivery of one genuine native CAS oncomplete callback is delayed,
 * after its transaction has already completed and an independent read proves
 * its commit. No native result, request, transaction or product is replaced. */
import {requireBoundedMountedCheck,mountedAuditPath} from './mounted-cleanup.mjs';
requireBoundedMountedCheck();
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';

const variants=['set','value-aba','remove','clear'];
const cases=[...variants.map(kind=>({name:'matched-'+kind,matched:true,kind})),...variants.map(kind=>({name:'mismatched-'+kind,matched:false,kind})),{name:'unrelated-key-control',matched:true,kind:'foreign'},{name:'serialized-cas-control',matched:true,kind:'cas'}];
const report={schema:1,kind:'device-cache-cas-admission',startedAt:new Date().toISOString(),proofScope:'Actual DeviceCache and native fake-indexeddb transactions; one genuine completed CAS callback delivery is delayed. No browser, native OS, backend or physical concurrency claim.',declaredGroups:cases.length,groups:[],passed:0,failed:0,fullSuite:false,fatal:null,cleanupFinal:{status:'NOTRUN'}};
const sourcePaths=['src/lib/appStorage.ts','tests/run-device-cache-cas-admission.mjs','tests/mounted-cleanup.mjs','node_modules/fake-indexeddb/package.json'];
const sourceHashes=async()=>Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')])));
const digest=value=>createHash('sha256').update(JSON.stringify(value)??'undefined').digest('hex');
const brief=error=>({name:error?.name,operator:error?.operator,message:String(error?.message??error).split('\n')[0].slice(0,300),...(error&&'actual'in error?{actualSha256:digest(error.actual)}:{}),...(error&&'expected'in error?{expectedSha256:digest(error.expected)}:{}),at:String(error?.stack??'').split('\n').filter(line=>/^\s+at /.test(line)).slice(0,4)});
const pending=new Map(),records=new WeakMap(),timeouts=[],lateErrors=[],fixtures=new Set();
let DeviceCache,fatalStop=false;
function track(promise,label){if(records.has(promise))return promise;const record={label,timedOut:false};let complete;complete=Promise.resolve(promise).catch(error=>{if(record.timedOut)lateErrors.push({label,error:brief(error)});throw error;}).finally(()=>pending.delete(complete));records.set(complete,record);pending.set(complete,record);void complete.catch(()=>{});return complete;}
async function bounded(promise,label,ms=5000){const original=track(promise,label);let timer;try{return await Promise.race([original,new Promise((_,reject)=>{timer=setTimeout(()=>{const record=records.get(original);record.timedOut=true;timeouts.push(label);reject(Error(label+': timeout; original remains followed'));},ms);})]);}finally{clearTimeout(timer);}}
async function drain(label){const until=Date.now()+6000;while(pending.size){const remaining=until-Date.now();if(remaining<=0)throw Error(label+': actual original operations remain active');let timer;try{const done=await Promise.race([Promise.allSettled([...pending.keys()]).then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),remaining);})]);if(!done)throw Error(label+': actual original operations remain active');}finally{clearTimeout(timer);}}}
function deferred(){let resolve;const promise=new Promise(yes=>{resolve=yes;});return {promise,resolve};}
const key='dowze.notebook.source.["account-A","year-one","note"]',other='dowze.notebook.source.["account-B","year-one","note"]',year='dowze.notebook.source.["account-A","year-two","note"]';
const initial={[key]:'original-A',[other]:'foreign-account-original',[year]:'foreign-year-original'};
const sorted=value=>Object.fromEntries(Object.entries(value).sort(([left],[right])=>left<right?-1:left>right?1:0));
function cacheState(cache){const rows=[];for(let index=0;index<cache.length;index++){const name=cache.key(index);assert.equal(typeof name,'string');rows.push([name,cache.getItem(name)]);}return sorted(Object.fromEntries(rows));}

async function fixture(){
 const factory=new IDBFactory(),nativeOpen=factory.open,connections=new Set(),transactions=new Set(),opens=new Set(),errors=[],entered=deferred();
 const ledger={nativeComplete:0,nativeAbort:0,heldCallbacks:0,deliveredCallbacks:0,casReads:0,casSuccessfulPuts:0,ordinarySuccessfulPuts:0,started:0,complete:0,aborted:0};
 const f={factory,nativeOpen,connections,transactions,opens,errors,ledger,cache:null,db:null,arm:false,held:false,released:false,terminalEvent:null,callback:null,entered:entered.promise,closeCount:0};fixtures.add(f);
 f.release=()=>{f.released=true;if(f.callback&&f.terminalEvent){const callback=f.callback,event=f.terminalEvent;f.callback=null;ledger.deliveredCallbacks++;callback.call(f.dbTransaction,event);}};
 factory.open=function(...args){const request=Reflect.apply(nativeOpen,this,args);opens.add(request);request.addEventListener('error',()=>{opens.delete(request);errors.push({kind:'open',name:request.error?.name});},{once:true});request.addEventListener('success',()=>{
  opens.delete(request);const db=request.result,nativeClose=db.close,nativeTransaction=db.transaction;if(!f.db)f.db=db;connections.add(db);db.close=function(...args){const value=Reflect.apply(nativeClose,this,args);connections.delete(db);f.closeCount++;return value;};
  db.transaction=function(...args){const tx=Reflect.apply(nativeTransaction,this,args);transactions.add(tx);ledger.started++;let resolve;const terminal=new Promise(yes=>{resolve=yes;});track(terminal,'Actual cache native '+tx.mode+' transaction terminal');
   tx.addEventListener('complete',()=>{ledger.complete++;transactions.delete(tx);resolve();},{once:true});tx.addEventListener('abort',()=>{ledger.aborted++;transactions.delete(tx);errors.push({kind:'abort',name:tx.error?.name});resolve();},{once:true});
   const held=f.arm&&db===f.db&&tx.mode==='readwrite'&&Array.from(tx.objectStoreNames).includes('records');if(held){f.arm=false;f.held=true;f.dbTransaction=tx;let assigned=null;Object.defineProperty(tx,'oncomplete',{configurable:true,get:()=>assigned,set:callback=>{assigned=typeof callback==='function'?event=>{ledger.heldCallbacks++;ledger.nativeComplete++;f.callback=callback;f.terminalEvent=event;entered.resolve();if(f.released)f.release();}:callback;}});tx.addEventListener('abort',()=>{ledger.nativeAbort++;entered.resolve();},{once:true});}
   const objectStore=tx.objectStore;tx.objectStore=function(...storeArgs){const store=Reflect.apply(objectStore,this,storeArgs);if(store.name==='records'){if(held){const get=store.get;store.get=function(...readArgs){const read=Reflect.apply(get,this,readArgs);read.addEventListener('success',()=>ledger.casReads++,{once:true});return read;};}const put=store.put;store.put=function(...writeArgs){const write=Reflect.apply(put,this,writeArgs);write.addEventListener('success',()=>{if(held)ledger.casSuccessfulPuts++;else ledger.ordinarySuccessfulPuts++;},{once:true});return write;};}return store;};return tx;
  };
 },{once:true});return request;};
 f.cache=new DeviceCache();await f.cache.initialize({length:0,key:()=>null,getItem:()=>null},factory);for(const[name,value]of Object.entries(initial))f.cache.setItem(name,value);await f.cache.flush();assert.deepEqual(cacheState(f.cache),sorted(initial));return f;
}
async function durable(f){
 const db=await track(new Promise((resolve,reject)=>{const request=f.factory.open('dowze-academie-device-cache',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Owned native cache read blocked'));}),'Independent native cache connection');
 try{return await track(new Promise((resolve,reject)=>{const tx=db.transaction('records','readonly'),store=tx.objectStore('records'),keys=store.getAllKeys(),values=store.getAll();tx.oncomplete=()=>resolve(sorted(Object.fromEntries(keys.result.map((key,index)=>[String(key),String(values.result[index])]))));tx.onabort=()=>reject(tx.error??Error('Owned native read aborted'));tx.onerror=()=>{};}),'Independent complete native cache inventory');}finally{db.close();}
}
async function scenario(definition){
 const f=await fixture();f.arm=true;let casSettled=false,flushSettled=false;const cas=track(f.cache.compareAndSetItem(key,definition.matched?'original-A':'unseen-source','CAS-committed').then(value=>{casSettled=true;return value;}),'Actual held DeviceCache CAS');
 await bounded(f.entered,'Genuine completed CAS callback captured');assert.equal(f.held,true);assert.equal(f.ledger.nativeComplete,1);assert.equal(f.ledger.nativeAbort,0);assert.equal(f.ledger.heldCallbacks,1);assert.equal(f.ledger.deliveredCallbacks,0);assert.equal(f.ledger.casReads,1);assert.equal(f.ledger.casSuccessfulPuts,definition.matched?1:0);assert.equal(casSettled,false,'The product CAS must still await its own real callback');
 const committed={...initial,[key]:definition.matched?'CAS-committed':'original-A'};assert.deepEqual(await durable(f),sorted(committed),'The genuine native transaction must already be committed before the later ordinary write');assert.deepEqual(cacheState(f.cache),sorted(initial),'No product CAS continuation has run before callback delivery');
 const expected={...initial};let second=null;
 if(definition.kind==='set'){f.cache.setItem(key,'newer-B');expected[key]='newer-B';}
 else if(definition.kind==='value-aba'){f.cache.setItem(key,'newer-B');f.cache.setItem(key,'original-A');}
 else if(definition.kind==='remove'){f.cache.removeItem(key);delete expected[key];}
 else if(definition.kind==='clear'){f.cache.clear();for(const name of Object.keys(expected))delete expected[name];}
 else if(definition.kind==='foreign'){f.cache.setItem(other,'admitted-foreign');expected[other]='admitted-foreign';}
 else if(definition.kind==='cas'){second=track(f.cache.compareAndSetItem(key,'CAS-committed','CAS-second'),'Actual second serialized CAS');}
 assert.deepEqual(cacheState(f.cache),sorted(expected),'Ordinary local admission is immediately visible before the old callback is delivered');
 const flush=track(f.cache.flush().then(()=>{flushSettled=true;}),'Actual cache flush includes the later admitted work');assert.equal(flushSettled,false);f.release();assert.equal(f.ledger.deliveredCallbacks,1);assert.equal(await bounded(cas,'Actual CAS result after native callback'),definition.matched);if(second){assert.equal(await bounded(second,'Second actual serialized CAS'),true);expected[key]='CAS-second';}else if(definition.kind==='foreign')expected[key]='CAS-committed';
 await bounded(flush,'Actual terminal flush of ordinary admissions');assert.equal(flushSettled,true);assert.equal(casSettled,true);assert.equal(f.cache.status().pending,0);assert.equal(f.cache.status().error,'');const actualMemory=cacheState(f.cache),actualDurable=await durable(f);
 assert.deepEqual(actualDurable,sorted(expected),'Every admitted ordinary operation keeps its exact durable result and key set');assert.deepEqual(actualMemory,sorted(expected),'A late CAS continuation must preserve the newer admitted cache, even when its value went A-B-A');assert.deepEqual(actualMemory,actualDurable,'The public getItem/key/length cache and whole native DB must agree after flush');
 return {definition,committedBeforeOrdinary:true,actualCASResult:definition.matched,ordinaryAdmissionExact:true,allKeysExact:true,foreignKeysPreserved:definition.kind!=='clear',clearScope:definition.kind==='clear'?'Explicit global Storage.clear removes all three seeded keys':undefined,memorySha256:digest(actualMemory),durableSha256:digest(actualDurable),native:{...f.ledger}};
}
async function cleanup(){
 for(const f of fixtures)f.release();await drain('Every original body/CAS/native operation before restoration');for(const f of fixtures){await bounded(f.cache.flush(),'Final real cache flush');await drain('All real cache transactions after final flush');assert.equal(f.transactions.size,0);assert.equal(f.opens.size,0);assert.deepEqual(f.errors,[]);assert.equal(f.ledger.started,f.ledger.complete+f.ledger.aborted);f.cache.close();assert.equal(f.connections.size,0,'All owned cache/native reader connections close before restoring the factory');f.factory.open=f.nativeOpen;await bounded(new Promise((resolve,reject)=>{const request=f.factory.deleteDatabase('dowze-academie-device-cache');request.onsuccess=resolve;request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Owned cache connection remained open during cleanup'));}),'Delete only the owned synthetic cache');}await drain('Every original cache cleanup before next group');fixtures.clear();
}
async function group(definition){const timeoutStart=timeouts.length;let row;try{row={name:definition.name,status:'PASS',evidence:await bounded(scenario(definition),'Complete '+definition.name,15000)};report.passed++;}catch(error){row={name:definition.name,status:'FAIL',error:brief(error),native:[...fixtures].map(f=>({...f.ledger,pendingTransactions:f.transactions.size,connections:f.connections.size}))};report.failed++;}report.groups.push(row);try{await cleanup();assert.equal(timeouts.length,timeoutStart,'No timeout can be treated as a successful result');row.cleanup='PASS';}catch(error){row.cleanup='FAIL';row.cleanupError=brief(error);if(row.status==='PASS'){row.bodyStatus='PASS';row.status='FAIL';report.passed--;report.failed++;}throw error;}console.log(row.name+': '+row.status);}
try{report.sourceHashes=await sourceHashes();({DeviceCache}=await import('../src/lib/appStorage.ts'));for(const definition of cases)await group(definition);}
catch(error){report.fatal=brief(error);process.exitCode=1;}
finally{
 try{await cleanup();report.cleanupFinal={status:'PASS',operations:pending.size,fixtures:fixtures.size};}catch(error){report.cleanupFinal={status:'FAIL',error:brief(error),operations:pending.size,fixtures:fixtures.size};report.fatal={prior:report.fatal,cleanup:brief(error)};process.exitCode=1;fatalStop=pending.size>0||[...fixtures].some(f=>f.transactions.size||f.opens.size||f.connections.size);}
 if(fatalStop)console.error(JSON.stringify({status:'FATAL_STOP',finalReportWritten:false,cleanup:report.cleanupFinal,pendingLabels:[...pending.values()].map(row=>row.label).slice(0,10)}));
 else{
  try{report.sourceHashesAfter=await sourceHashes();assert.deepEqual(report.sourceHashesAfter,report.sourceHashes);report.finalFreeze='PASS';}catch(error){report.finalFreeze='FAIL';report.freezeError=brief(error);process.exitCode=1;}
  const attempted=new Set(report.groups.map(row=>row.name));for(const definition of cases)if(!attempted.has(definition.name))report.groups.push({name:definition.name,status:'NOTRUN',reason:'An earlier setup or terminal cleanup failure stopped admission'});report.timeouts=timeouts;report.lateErrors=lateErrors;report.operationsRemaining=pending.size;report.fixturesRemaining=fixtures.size;report.fullSuite=report.groups.length===cases.length&&report.passed===cases.length&&!report.failed&&!report.fatal&&timeouts.length===0&&pending.size===0&&fixtures.size===0&&report.cleanupFinal.status==='PASS'&&report.finalFreeze==='PASS';if(!report.fullSuite)process.exitCode=1;report.finishedAt=new Date().toISOString();const output=mountedAuditPath('device-cache-cas-admission-20261015.json');await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,failed:report.failed,notRun:report.groups.filter(row=>row.status==='NOTRUN').length,fullSuite:report.fullSuite,cleanup:report.cleanupFinal.status,finalFreeze:report.finalFreeze,report:output}));
 }
}
