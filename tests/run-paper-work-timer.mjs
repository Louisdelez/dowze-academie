import {mountedCleanup,requireBoundedMountedCheck} from './mounted-cleanup.mjs';
requireBoundedMountedCheck();
import {build} from 'vite';
import {indexedDB} from 'fake-indexeddb';
import {JSDOM} from 'jsdom';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';

const out=await mkdtemp(join(process.cwd(),'tests/.paper-work-timer-'));
process.env.NODE_ENV='development';globalThis.indexedDB=indexedDB;
let m,dom,focused=true,hidden=false,sequence=0,passed=0,failed=0,rendering=null,intervalId=0;
const proof=[],roots=new Set(),containers=new Set(),intervals=new Map(),peers=new Set();
const nativeSetInterval=globalThis.setInterval,nativeClearInterval=globalThis.clearInterval,nativeBroadcastChannel=globalThis.BroadcastChannel;
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
const wait=async(predicate,message='Mounted work timer did not settle')=>{for(let i=0;i<220;i++){await m.act(tick);if(await predicate())return;}throw Error(message);};
const key=scope=>'dowze.notebook.work-timer.'+JSON.stringify([scope.accountId,scope.spaceId,scope.noteId]);
const checkpoint=(patch={})=>({schema:1,targetMinutes:10,activeMs:30000,status:'paused',...patch});
const parsed=async scope=>{const raw=await m.appStorage.readCurrentItem(key(scope));if(raw===null)return null;const value=JSON.parse(raw);assert.ok(m.isPaperWorkTimerCheckpoint(value),'Durable timer checkpoint must contain valid durations only');return value;};
const seed=async(scope,value)=>{m.appStorage.setItem(key(scope),typeof value==='string'?value:JSON.stringify(value));await m.appStorage.flush();};
const button=(f,label)=>[...f.host.querySelectorAll('button')].find(node=>node.getAttribute('aria-label')===label||node.textContent.trim()===label);
const propsOf=node=>{assert.ok(node,'The mounted control must exist');const property=Object.keys(node).find(name=>name.startsWith('__reactProps$'));assert.ok(property,'Actual mounted React control props must exist');return node[property];};
const click=async node=>{assert.ok(node,'The requested timer control must exist');assert.equal(node.disabled,false);await m.act(async()=>{node.click();await tick();});};
const open=async f=>{if(!f.host.querySelector('.paper-work-timer-panel'))await click(f.host.querySelector('.paper-work-timer-trigger'));};
const progress=f=>Number(f.host.querySelector('progress')?.value??-1);
const state=f=>f.host.querySelector('.paper-work-timer-state')?.textContent;
async function mount(scope={accountId:'qa-work-timer-'+(++sequence),spaceId:'year',noteId:'note'},options={}){
 const host=document.createElement('div');document.body.append(host);containers.add(host);const root=m.createRoot(host);roots.add(root);
 const f={id:++sequence,host,root,scope:{...scope},time:{value:options.now??0},allowed:true,props:null};
 f.props={...scope,visible:true,current:()=>f.allowed,clock:()=>f.time.value};
 f.render=async(patch={})=>{f.props={...f.props,...patch};f.scope={accountId:f.props.accountId,spaceId:f.props.spaceId,noteId:f.props.noteId};rendering=f.id;try{await m.act(async()=>root.render(options.strict?m.createElement(m.StrictMode,null,m.createElement(m.PaperWorkTimer,f.props)):m.createElement(m.PaperWorkTimer,f.props)));}finally{rendering=null;}};
 await f.render();if(options.waitReady!==false)await wait(()=>!host.querySelector('.paper-work-timer-trigger')?.disabled,'Timer did not complete its durable load');return f;
}
const pulse=async(f,time)=>{f.time.value=time;const tasks=[...intervals.values()].filter(item=>item.owner===f.id);assert.equal(tasks.length,1,'Each live timer must own one sampling interval');await m.act(async()=>{for(const item of tasks)item.callback();await tick();});};
const unmount=async f=>{await m.act(async()=>f.root.unmount());roots.delete(f.root);f.host.remove();containers.delete(f.host);await tick();await m.appStorage.flush();};
const lifecycle=async(name,patch)=>{if(patch.hidden!==undefined)hidden=patch.hidden;if(patch.focused!==undefined)focused=patch.focused;await m.act(async()=>{(name==='visibilitychange'?document:window).dispatchEvent(new Event(name));await tick();});};
const cleanup=()=>mountedCleanup([
 ['React unmount',async()=>{if(m)for(const root of roots)await m.act(async()=>root.unmount());roots.clear();}],
 ['Timer cache barrier',async()=>{if(m){await tick();await m.appStorage.flush();m.resumeAllNotebookAccounts();}}],
 ['Fixture reset',()=>{for(const host of containers)host.remove();containers.clear();assert.equal(intervals.size,0,'Unmount must remove every work timer sampling interval');focused=true;hidden=false;rendering=null;}]
]);
const group=async(name,work)=>{if(process.env.DOWZE_WORK_TIMER_ONLY&&!name.includes(process.env.DOWZE_WORK_TIMER_ONLY))return;try{await work();passed++;proof.push({name,status:'PASS'});console.log(name+': PASS');}catch(error){failed++;proof.push({name,status:'FAIL',error:String(error.message).slice(0,1000)});console.error(name+': FAIL\n'+String(error.stack).slice(0,4000));}finally{await cleanup();}};

try{
 const entry=join(out,'entry.tsx');
 await writeFile(entry,"export {PaperWorkTimer} from '../../src/components/PaperWorkTimer';\nexport {appStorage,DeviceCache} from '../../src/lib/appStorage';\nexport {isPaperWorkTimerCheckpoint} from '../../src/lib/paperWorkTimer';\nexport {settleNotebookAccount,resumeNotebookAccount,resumeAllNotebookAccounts,hasPendingNotebookWrites} from '../../src/lib/notebookSession';\nexport {createElement,StrictMode,act} from 'react';\nexport {createRoot} from 'react-dom/client';\n");
 await build({configFile:false,build:{ssr:entry,outDir:out,emptyOutDir:false,copyPublicDir:false,minify:false,sourcemap:false,reportCompressedSize:false,rollupOptions:{output:{entryFileNames:'work-timer.mjs'}}},logLevel:'error'});
 dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://qa.invalid/',pretendToBeVisual:true});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,SVGElement:dom.window.SVGElement,Element:dom.window.Element,Node:dom.window.Node,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,KeyboardEvent:dom.window.KeyboardEvent,HTMLInputElement:dom.window.HTMLInputElement,IS_REACT_ACT_ENVIRONMENT:true});
 Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});document.hasFocus=()=>focused;globalThis.BroadcastChannel=undefined;
 // Invoke the component's real sampler deterministically; no real-time waits or synthetic activity credits.
 globalThis.setInterval=(callback,delay,...args)=>{if(delay!==1000)return nativeSetInterval(callback,delay,...args);const id={workTimerInterval:++intervalId};intervals.set(id,{callback:()=>callback(...args),owner:rendering});return id;};
 globalThis.clearInterval=id=>{if(!intervals.delete(id))nativeClearInterval(id);};
 m=await import(pathToFileURL(join(out,'work-timer.mjs')));await m.appStorage.initialize(dom.window.localStorage,indexedDB);

 await group('Restored running session is paused and counts only explicit resumed foreground work',async()=>{
  const scope={accountId:'qa-timer-restore',spaceId:'year',noteId:'note'};await seed(scope,checkpoint({status:'running'}));const f=await mount(scope,{now:5000000});await open(f);assert.equal(state(f),'En pause');assert.equal(progress(f),30000);
  await pulse(f,5060000);assert.equal(progress(f),30000);await click(button(f,'Reprendre'));await pulse(f,5090000);assert.equal(progress(f),60000);await click(button(f,'Pause'));
  const durable=await parsed(scope);assert.equal(durable.status,'paused');assert.equal(durable.activeMs,60000);assert.equal(f.host.querySelector('output').textContent,'09:00');
 });
 await group('AFK and untrusted window events never refresh activity while pause and resume preserve work',async()=>{
  const f=await mount();await open(f);await click(button(f,'Démarrer'));for(const time of [30000,60000,90000,130000])await pulse(f,time);assert.equal(progress(f),120000);assert.equal(state(f),'En attente d’activité');
  f.time.value=140000;await m.act(async()=>window.dispatchEvent(new Event('pointermove')));await pulse(f,150000);assert.equal(progress(f),120000);
  await click(button(f,'Pause'));await pulse(f,180000);assert.equal(progress(f),120000);await click(button(f,'Reprendre'));await pulse(f,190000);assert.equal(progress(f),130000);await click(button(f,'Pause'));assert.equal((await parsed(f.scope)).activeMs,130000);
 });
 await group('Hidden unfocused and inactive workspace views cannot credit background intervals',async()=>{
  const f=await mount();await open(f);await click(button(f,'Démarrer'));await pulse(f,10000);f.time.value=15000;await lifecycle('visibilitychange',{hidden:true});await pulse(f,70000);assert.equal(progress(f),10000);
  f.time.value=75000;await lifecycle('visibilitychange',{hidden:false});await pulse(f,80000);assert.equal(progress(f),10000);assert.equal(state(f),'En attente d’activité');await click(button(f,'Pause'));await click(button(f,'Reprendre'));await pulse(f,90000);assert.equal(progress(f),20000);
  f.time.value=95000;await lifecycle('blur',{focused:false});await pulse(f,120000);assert.equal(progress(f),20000);f.time.value=125000;await lifecycle('focus',{focused:true});await pulse(f,130000);assert.equal(progress(f),20000);
  await click(button(f,'Pause'));await click(button(f,'Reprendre'));await pulse(f,140000);assert.equal(progress(f),30000);f.time.value=145000;await f.render({visible:false});await pulse(f,180000);assert.equal(progress(f),30000);await f.render({visible:true});await pulse(f,190000);assert.equal(progress(f),30000);
 });
 await group('Unmount durably pauses measured work and never reconstructs the time spent closed',async()=>{
  const f=await mount();await open(f);await click(button(f,'Démarrer'));await pulse(f,10000);f.time.value=15000;const scope=f.scope;await unmount(f);const durable=await parsed(scope);assert.equal(durable.status,'paused');assert.equal(durable.activeMs,10000);
  const reopened=await mount(scope,{now:9000000});await open(reopened);await pulse(reopened,9060000);assert.equal(progress(reopened),10000);assert.equal(state(reopened),'En pause');
 });
 await group('Old controls reject account space note switches and A to B to A without changing either scope',async()=>{
  for(const patch of [{accountId:'qa-timer-switch-B'},{spaceId:'next-year'},{noteId:'other-note'}]){
   const scope={accountId:'qa-timer-switch-'+(++sequence),spaceId:'year',noteId:'note'};await seed(scope,checkpoint({targetMinutes:7,activeMs:11000}));const f=await mount(scope);await open(f);const oldResume=propsOf(button(f,'Reprendre')).onClick,oldInput=propsOf(f.host.querySelector('input')).onChange;
   await f.render(patch);await wait(()=>!f.host.querySelector('.paper-work-timer-trigger').disabled);await open(f);assert.equal(progress(f),0);await m.act(async()=>{oldResume();oldInput({target:{value:'99'}});});assert.equal(progress(f),0);assert.equal(await parsed(f.scope),null);
   await f.render(scope);await wait(()=>!f.host.querySelector('.paper-work-timer-trigger').disabled);await open(f);await m.act(async()=>oldResume());assert.equal(progress(f),11000);assert.equal(state(f),'En pause');assert.equal((await parsed(scope)).activeMs,11000);await unmount(f);
  }
 });
 await group('A delayed durable load from an old account cannot publish into the current timer',async()=>{
  const old={accountId:'qa-timer-delayed-A',spaceId:'year',noteId:'note'},fresh={...old,accountId:'qa-timer-delayed-B'};await seed(old,checkpoint({targetMinutes:8,activeMs:42000}));let release,beganResolve;const gate=new Promise(resolve=>release=resolve),began=new Promise(resolve=>beganResolve=resolve),read=m.appStorage.readCurrentItem;
  m.appStorage.readCurrentItem=async function(cacheKey){const value=await read.call(this,cacheKey);if(cacheKey===key(old)){beganResolve();await gate;}return value;};
  try{const f=await mount(old,{waitReady:false});await began;assert.equal(f.host.querySelector('.paper-work-timer-trigger').disabled,true);await f.render(fresh);await wait(()=>!f.host.querySelector('.paper-work-timer-trigger').disabled);await open(f);assert.equal(progress(f),0);release();await m.act(tick);assert.equal(progress(f),0);assert.equal(f.host.querySelector('input').value,'25');assert.equal(await parsed(fresh),null);}finally{release();m.appStorage.readCurrentItem=read;}
 });
 await group('StrictMode replay leaves one writer and permits resume after the close barrier is cancelled',async()=>{
  const f=await mount(undefined,{strict:true});await open(f);await click(button(f,'Démarrer'));await pulse(f,10000);await m.act(async()=>m.settleNotebookAccount(f.scope.accountId));assert.equal((await parsed(f.scope)).activeMs,10000);assert.equal((await parsed(f.scope)).status,'paused');
  await m.act(async()=>m.resumeNotebookAccount(f.scope.accountId));await pulse(f,20000);assert.equal(state(f),'En pause');await click(button(f,'Reprendre'));await pulse(f,30000);assert.equal(progress(f),20000);assert.equal([...intervals.values()].filter(item=>item.owner===f.id).length,1);
 });
 await group('Same-key concurrent views preserve the current checkpoint and retain the conflicting local duration separately',async()=>{
  const scope={accountId:'qa-timer-conflict',spaceId:'year',noteId:'note'};await seed(scope,checkpoint());const a=await mount(scope),b=await mount(scope);await open(a);await open(b);const staleResume=propsOf(button(b,'Reprendre')).onClick;
  await click(button(a,'Reprendre'));await pulse(a,10000);await click(button(a,'Pause'));const original=await parsed(scope);assert.equal(original.activeMs,40000);
  await click(button(b,'Reprendre'));await wait(()=>b.host.textContent.includes('Une autre vue a modifié cette séance.'));assert.deepEqual(await parsed(scope),original);
  const recoveries=Array.from({length:m.appStorage.length},(_,index)=>m.appStorage.key(index)).filter(value=>value?.startsWith(key(scope)+'.recovery.')&&!value.endsWith('.source'));assert.equal(recoveries.length,1);const recovered=JSON.parse(await m.appStorage.readCurrentItem(recoveries[0]));assert.ok(m.isPaperWorkTimerCheckpoint(recovered));assert.equal(recovered.activeMs,30000);assert.equal(recovered.status,'paused');await m.act(async()=>staleResume());assert.deepEqual(await parsed(scope),original);
 });
 await group('Durable cache CAS sees another connection and cannot overwrite its unseen checkpoint',async()=>{
  const scope={accountId:'qa-timer-peer',spaceId:'year',noteId:'note'};await seed(scope,checkpoint());const f=await mount(scope);await open(f);const peer=new m.DeviceCache();peers.add(peer);await peer.initialize(dom.window.localStorage,indexedDB);const before=await peer.readCurrentItem(key(scope)),external=checkpoint({activeMs:50000});assert.equal(await peer.compareAndSetItem(key(scope),before,JSON.stringify(external)),true);
  await click(button(f,'Reprendre'));await wait(()=>f.host.textContent.includes('Une autre vue a modifié cette séance.'));assert.deepEqual(await parsed(scope),external);peer.close();peers.delete(peer);
 });
 await group('An incompatible original is retained under a unique recovery key before an explicit new session',async()=>{
  const scope={accountId:'qa-timer-invalid',spaceId:'year',noteId:'note'},original='{"legacy":"retained","startedAt":123}';await seed(scope,original);const f=await mount(scope);await open(f);assert.equal(progress(f),0);assert.equal(await m.appStorage.readCurrentItem(key(scope)),original);await click(button(f,'Démarrer'));await wait(async()=>await parsed(scope)!==null);
  const sources=Array.from({length:m.appStorage.length},(_,index)=>m.appStorage.key(index)).filter(value=>value?.startsWith(key(scope)+'.recovery.')&&value.endsWith('.source'));assert.equal(sources.length,1);assert.equal(await m.appStorage.readCurrentItem(sources[0]),original);
 });
 await group('Failed cache mutation is visible and never lets the writer report a successful close',async()=>{
  const f=await mount();await open(f);m.appStorage.freeze();try{await click(button(f,'Démarrer'));await wait(()=>f.host.textContent.includes('son enregistrement a échoué'));assert.ok(f.host.querySelector('[role="status"]'),'Persistence failure must remain visible');await assert.rejects(()=>m.settleNotebookAccount(f.scope.accountId),/Fermeture en cours/);}finally{m.appStorage.unfreeze();m.resumeAllNotebookAccounts();}
 });
 console.log(`Work timer mounted groups: ${passed} passed, ${failed} failed`);
 await writeFile('/home/louis/Documents/Dowze-Notebook-Implementation-20261012/work-timer-mounted-tests.json',JSON.stringify({date:'2026-10-14',passed,failed,groups:proof,physicalClockAndForegroundVerified:false,syntheticUntrustedEvents:true,deterministicSampler:true,xpAwarded:false},null,2)+'\n');if(failed)process.exitCode=1;
}finally{
 await mountedCleanup([
  ['Mounted timer cleanup',()=>cleanup()],
  ['Peer caches close',()=>{for(const peer of peers)peer.close();peers.clear();}],
  ['Device cache close',()=>m?.appStorage.close()],
  ['Host APIs restore',()=>{globalThis.setInterval=nativeSetInterval;globalThis.clearInterval=nativeClearInterval;globalThis.BroadcastChannel=nativeBroadcastChannel;}],
  ['DOM close',()=>dom?.window.close()],
  ['Fixture removal',()=>rm(out,{recursive:true,force:true})]
 ]);
}
