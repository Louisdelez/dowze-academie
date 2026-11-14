import {mountedCleanup,mountedAuditPath,requireBoundedMountedCheck} from './mounted-cleanup.mjs';
requireBoundedMountedCheck();
import assert from 'node:assert/strict';
import {build} from 'vite';
import {JSDOM} from 'jsdom';
import {IDBFactory,IDBKeyRange} from 'fake-indexeddb';
import {File} from 'node:buffer';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

// Real production Tauri JS event registration, Markdown/PM, writers, DeviceCache
// and IDB. The native IPC/event emitter, DOM geometry/inert and IME events are
// explicit seams. No native window, browser IME or physical device claim.
const names=[
 'The actual close listener refuses a composing PM without making its body inert, then confirms a fresh close after exact canonical and cache durability',
 'Concurrent native requests keep their own IDs and join duplicate in-flight IDs without releasing a pending writer',
 'Native cancellation revokes queued and active positive receipts while accepted preservation drains, then permits a fresh request',
 'Disposal during late event registration unregisters the actual Tauri callbacks and cannot admit retained old callbacks',
 'Disposal during an accepted write keeps that write tracked and refuses its late positive receipt',
 'A rejected positive native receipt restores admission and the original inert state, then a fresh request can succeed',
 'Cancellation or disposal during the first real cache flush cannot freeze that cache again or start a second flush',
];
const originals=new Map(),frames=new Set(),fixtures=new Set(),groups=[],out=await mkdtemp(join(process.cwd(),'tests/.workspace-close-listener-'));
const report={schema:1,kind:'paper-workspace-close-listener-mounted',scope:'Production listener registered by main.tsx through actual @tauri-apps/api/event/core; real Markdown PM and DeviceCache/IDB. Native event bus, geometry, inert effects and IME delivery are synthetic.',declaredGroups:names.length,groupsStarted:0,passed:0,failed:0,allGroupsAttempted:false,fullSuite:false,groups,cleanupFinal:{status:'NOTRUN'},fatal:null};
const deadline=Date.now()+235000,cleanupDeadline=Date.now()+285000,globals=['window','document','navigator','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLButtonElement','Element','SVGElement','Node','NodeFilter','DOMParser','MutationObserver','Event','CustomEvent','InputEvent','CompositionEvent','KeyboardEvent','ShadowRoot','getComputedStyle','addEventListener','removeEventListener','dispatchEvent','indexedDB','IDBKeyRange','File','BroadcastChannel','requestAnimationFrame','cancelAnimationFrame','ResizeObserver','IntersectionObserver','DOMMatrix','innerWidth','innerHeight','IS_REACT_ACT_ENVIRONMENT'];
for(const key of globals)originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
const defer=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const brief=error=>({name:String(error?.name??'Error'),message:String(error?.message??error).slice(0,900),stack:String(error?.stack??'').split('\n').slice(0,5).join('\n'),causes:Array.from(error?.errors??[]).slice(0,4).map(value=>String(value?.message??value).slice(0,300))});
const bounded=async(promise,label,cleanup=false)=>{let timer;try{const remaining=(cleanup?cleanupDeadline:deadline)-Date.now();assert.ok(remaining>0,label+': deadline exhausted');return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+': timeout')),Math.min(20000,remaining));})]);}finally{clearTimeout(timer);}};
let m,dom,probe,sequence=0,inert=false,inertWrites=[],native,stop=false;
const wait=async(predicate,label,cleanup=false)=>{while(Date.now()<(cleanup?cleanupDeadline:deadline)){await m.act(tick);if(await predicate())return;}throw Error(label+': deadline exhausted');};
function bridge(){
 let callbackId=0,eventId=0;const callbacks=new Map(),subscriptions=new Map(),receipts=[],unlistens=[];
 const value={callbacks,subscriptions,receipts,unlistens,listenGate:null,unlistenGate:null,rejectPositive:false,
  emit:(name,payload)=>{for(const [id,row] of [...subscriptions])if(row.event===name)callbacks.get(row.handler)?.({event:name,id,payload});},
  internals:{transformCallback:(callback,once=false)=>{const id=++callbackId;callbacks.set(id,once?event=>{callbacks.delete(id);callback(event);}:callback);return id;},unregisterCallback:id=>callbacks.delete(id),invoke:async(command,args={})=>{
   if(command==='plugin:event|listen'){const id=++eventId;subscriptions.set(id,{event:args.event,handler:args.handler});if(value.listenGate)await value.listenGate.promise;return id;}
   if(command==='plugin:event|unlisten'){unlistens.push(args.eventId);subscriptions.delete(args.eventId);if(value.unlistenGate)await value.unlistenGate.promise;return;}
   if(command==='workspace_cache_flushed'){receipts.push({requestId:args.requestId,success:args.success,inert:document.body.inert});if(args.success&&value.rejectPositive){value.rejectPositive=false;throw Error('Synthetic rejected native positive receipt');}return;}
   throw Error('Unexpected native command: '+command);
  }},
  plugin:{unregisterListener:(_event,id)=>{const row=subscriptions.get(id);if(row)callbacks.delete(row.handler);subscriptions.delete(id);}},
 };return value;
}
async function fixture({editor=false,bind=true,listenGate=null}={}){
 const id=++sequence,f={id,live:true,bindings:[],container:null,root:null,ref:null,saveGate:null,saveEntered:false,tail:Promise.resolve(),unregister:null,flushGate:null,flushGates:new Map(),flushEntered:false,receipts:null,frozen:false,flushCalls:0,freezeCalls:0,unfreezeCalls:0};fixtures.add(f);
 globalThis.indexedDB=new IDBFactory();dom.window.indexedDB=indexedDB;
 native=bridge();native.listenGate=listenGate;Object.defineProperty(window,'__TAURI_INTERNALS__',{configurable:true,value:native.internals});Object.defineProperty(window,'__TAURI_EVENT_PLUGIN_INTERNALS__',{configurable:true,value:native.plugin});f.native=native;f.receipts=native.receipts;
 f.cache=new m.DeviceCache();await f.cache.initialize(window.localStorage,indexedDB);f.cache.setItem('dowze.close-source','original-'+id);await f.cache.flush();
 const flush=f.cache.flush.bind(f.cache),freeze=f.cache.freeze.bind(f.cache),unfreeze=f.cache.unfreeze.bind(f.cache);
 f.cache.flush=async()=>{f.flushCalls++;const gate=f.flushGates.get(f.flushCalls)??f.flushGate,writing=flush();if(gate){f.flushEntered=true;await writing;await gate.promise;}else await writing;};
 f.cache.freeze=()=>{f.freezeCalls++;f.frozen=true;freeze();};f.cache.unfreeze=()=>{f.unfreezeCalls++;f.frozen=false;unfreeze();};
 f.bind=()=>{const binding=m.bindNotebookWorkspaceClose({cache:f.cache,ready:Promise.resolve(),body:document.body});f.bindings.push(binding);return binding;};
 if(bind){f.binding=f.bind();await bounded(f.binding.ready,'Actual close listeners ready');assert.equal(f.native.subscriptions.size,2);}
 f.scope={accountId:'qa-workspace-close-'+id,spaceId:'year'};
 if(editor){
  f.doc=m.migratePaper('close-note-'+id,'Original close text.',null,'2026-10-15T10:00:00Z');f.objectId=f.doc.objects[0].id;f.identity={...f.scope,type:'whiteboard',documentId:m.notebookDocumentId(f.doc.noteId)};
  await m.putDraft({...f.identity,content:f.doc,title:'Close listener fixture',baseVersion:0,updatedAt:1,syncState:'local'});
  f.container=document.createElement('section');document.body.append(f.container);f.root=m.createRoot(f.container);f.ref=m.createRef();
  await m.act(async()=>{f.root.render(m.createElement(m.MarkdownNoteEditor,{ref:f.ref,noteId:f.doc.noteId+'-editor',initialMarkdown:f.doc.objects[0].markdown,documentSnapshot:f.doc,media:f.scope,generation:1,current:()=>f.live,
   onChange:markdown=>{f.doc=m.applyPaperCommand(f.doc,{type:'patch-object',id:f.objectId,patch:{markdown}});const accepted=f.doc,gate=f.saveGate;f.tail=f.tail.then(async()=>{if(gate){f.saveEntered=true;await gate.promise;}await m.putDraft({...f.identity,content:accepted,title:'Close listener fixture',baseVersion:0,updatedAt:Date.now(),syncState:'local'});f.cache.setItem('dowze.close-markdown',markdown);await f.cache.flush();});return accepted;},whenSaved:()=>f.tail}));await tick();});
  await wait(()=>f.ref.current?.current()&&probe.records.some(record=>record.created&&!record.destroyed&&f.container.contains(record.view?.dom)),'Actual Markdown PM ready');
  f.record=probe.records.find(record=>record.created&&!record.destroyed&&f.container.contains(record.view?.dom));assert.ok(f.record?.view);f.view=f.record.view;
 }
 return f;
}
async function settle(f){await m.act(async()=>{await bounded(f.binding.settled(),'Native close request settlement');await tick();});}
async function finishComposition(f){if(!f.view?.composing)return;await m.act(async()=>{f.view.dom.dispatchEvent(new window.CompositionEvent('compositionend',{bubbles:true,data:' accepted IME'}));await tick();});}
async function flushEditor(f,cleanup=false){for(let at=0;at<60;at++){let ok;await m.act(async()=>{ok=await bounded(f.ref.current.flush(),'Real editor flush',cleanup);await tick();});if(ok&&await f.ref.current.settled())return;}throw Error('The actual editor buffer did not become settled');}
async function cleanup(){await mountedCleanup([
 ['Release all held operations',async()=>{for(const f of fixtures){f.saveGate?.resolve();f.flushGate?.resolve();for(const gate of f.flushGates.values())gate.resolve();f.native.listenGate?.resolve();f.native.unlistenGate?.resolve();f.native.rejectPositive=false;await finishComposition(f);}}],
 ['Dispose actual event listeners and drain accepted work',async()=>{for(const f of fixtures){for(const binding of f.bindings)await bounded(binding.dispose(),'Listener disposal',true);assert.equal(f.native.subscriptions.size,0);}}],
 ['Preserve actual PM before unmount',async()=>{m.resumeAllNotebookAccounts();for(const f of fixtures){if(f.root)await flushEditor(f,true);await f.tail;f.unregister?.();f.unregister=null;}}],
 ['Unmount owned trees and confirm actual destroy',async()=>{for(const f of fixtures){if(f.root){await m.act(async()=>{f.root.unmount();await tick();});f.live=false;}f.container?.remove();}await wait(()=>probe.records.every(record=>record.destroyed),'All actual PM destroys complete',true);assert.equal(m.hasPendingNotebookWrites(),false);}],
 ['Close caches and clear probe records',async()=>{for(const f of fixtures){await f.cache.flush();f.cache.close();}fixtures.clear();probe.clear();inert=false;inertWrites=[];}],
]);return {status:'PASS'};}
async function group(name,work){if(stop){groups.push({name,status:'NOTRUN'});return;}report.groupsStarted++;let entry={name,status:'PASS'};try{await work();report.passed++;}catch(error){entry={name,status:'FAIL',error:brief(error)};report.failed++;}try{entry.cleanup=await cleanup();}catch(error){entry.cleanup={status:'FAIL',error:brief(error)};report.failed++;stop=true;}groups.push(entry);console.log(name+': '+entry.status);}
try{
 process.env.NODE_ENV='development';
 await build({configFile:false,ssr:{noExternal:['yjs','lib0']},build:{ssr:'tests/paper-workspace-close-listener-entry.tsx',outDir:out,copyPublicDir:false,minify:false,sourcemap:false,reportCompressedSize:false,rollupOptions:{preserveEntrySignatures:'strict',output:{entryFileNames:'close-listener.mjs'}}},logLevel:'error'});
 dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://qa.invalid/'});
 for(const key of ['HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLButtonElement','Element','SVGElement','Node','NodeFilter','DOMParser','MutationObserver','Event','CustomEvent','InputEvent','CompositionEvent','KeyboardEvent','ShadowRoot'])globalThis[key]=dom.window[key];
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,File,IDBKeyRange,BroadcastChannel:undefined,getComputedStyle:dom.window.getComputedStyle.bind(dom.window),addEventListener:dom.window.addEventListener.bind(dom.window),removeEventListener:dom.window.removeEventListener.bind(dom.window),dispatchEvent:dom.window.dispatchEvent.bind(dom.window),innerWidth:1280,innerHeight:800,IS_REACT_ACT_ENVIRONMENT:true});Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});Object.defineProperty(navigator,'onLine',{configurable:true,value:false});
 Object.defineProperty(document.body,'inert',{configurable:true,get:()=>inert,set:value=>{inert=!!value;inertWrites.push(inert);}});
 globalThis.requestAnimationFrame=callback=>{const id=setTimeout(()=>{frames.delete(id);callback(performance.now());},10);frames.add(id);return id;};globalThis.cancelAnimationFrame=id=>{clearTimeout(id);frames.delete(id);};window.requestAnimationFrame=requestAnimationFrame;window.cancelAnimationFrame=cancelAnimationFrame;
 globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};globalThis.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};window.ResizeObserver=ResizeObserver;window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
 window.Range.prototype.getClientRects=()=>[];window.Range.prototype.getBoundingClientRect=()=>new window.DOMRect(0,0,1,20);window.HTMLElement.prototype.getBoundingClientRect=()=>new window.DOMRect(0,0,450,40);
 globalThis.DOMMatrix=class{constructor(){this.a=this.d=1;this.b=this.c=this.e=this.f=0;}};
 m=await import(pathToFileURL(join(out,'close-listener.mjs')));probe=m.installRealPaperEditorProbe();

 await group(names[0],async()=>{
  const f=await fixture({editor:true});await m.act(async()=>{f.view.focus();f.view.dom.dispatchEvent(new window.CompositionEvent('compositionstart',{bubbles:true,data:'accepted'}));const p=f.view.dom.querySelector('p');assert.ok(p?.firstChild);p.firstChild.nodeValue+=' accepted IME';f.view.dom.dispatchEvent(new window.InputEvent('input',{bubbles:true,inputType:'insertCompositionText',data:' accepted IME',isComposing:true}));await tick();});assert.equal(f.view.composing,true);
  f.native.emit('workspace-flush-request',11);await settle(f);assert.deepEqual(f.receipts,[{requestId:11,success:false,inert:false}]);assert.equal(inertWrites.includes(true),false,'No body inert write during an accepted IME');assert.equal(f.view.composing,true);assert.equal(f.view.dom.isConnected,true);assert.equal(f.record.destroyed,false);assert.ok((await m.listSnapshots(f.scope.accountId,f.scope.spaceId)).some(row=>row.value?.composing===true&&row.value?.noteId===f.doc.noteId));
  await finishComposition(f);await flushEditor(f);f.saveGate=defer();await m.act(async()=>{f.view.dispatch(f.view.state.tr.insertText(' Final accepted text.',f.view.state.doc.content.size-1));await tick();});f.native.emit('workspace-flush-request',12);await wait(()=>f.saveEntered,'Close must wait for the accepted actual save');assert.equal(document.body.inert,false);assert.equal(f.receipts.length,1);f.saveGate.resolve();await settle(f);
  assert.deepEqual(f.receipts.at(-1),{requestId:12,success:true,inert:true});assert.equal(f.frozen,true);const durable=await m.getDraft(f.identity),markdown=durable.content.objects.find(object=>object.id===f.objectId).markdown;assert.ok(markdown.includes('accepted IME')&&markdown.includes('Final accepted text.'));assert.equal(await f.cache.readCurrentItem('dowze.close-markdown'),markdown);assert.equal(f.ref.current.pending(),false);assert.throws(()=>f.cache.setItem('dowze.after-close','denied'),/Fermeture/);
 });
 await group(names[1],async()=>{
  const f=await fixture(),gate=defer();let entered=0;f.saveGate=gate;f.unregister=m.registerNotebookWriter(f.scope.accountId,{flush:async()=>{entered++;await gate.promise;},settled:()=>gate.promise,suspend(){},resume(){}});
  f.native.emit('workspace-flush-request',21);f.native.emit('workspace-flush-request',21);f.native.emit('workspace-flush-request',22);await wait(()=>entered===1,'The single first close must await its writer');assert.equal(f.receipts.length,0);assert.equal(document.body.inert,false);gate.resolve();await settle(f);assert.deepEqual(f.receipts.map(row=>[row.requestId,row.success]),[[21,true],[22,true]]);assert.equal(entered,1);assert.equal(f.flushCalls,4);assert.equal(f.freezeCalls,2);
 });
 await group(names[2],async()=>{
  const f=await fixture(),gate=defer();f.saveGate=gate;let entered=false,confirmed=false;f.unregister=m.registerNotebookWriter(f.scope.accountId,{flush:async()=>{entered=true;await gate.promise;await m.putSnapshot({...f.scope,key:'close-cancel-accepted',value:'original accepted value'});confirmed=true;},settled:()=>gate.promise,pending:()=>!confirmed,suspend(){},resume(){}});
  f.native.emit('workspace-flush-request',31);f.native.emit('workspace-flush-request',32);await wait(()=>entered,'Accepted original work begins');f.native.emit('workspace-close-cancelled');assert.equal(document.body.inert,false);assert.equal(confirmed,false);assert.equal(f.receipts.length,0);gate.resolve();await settle(f);assert.equal(confirmed,true);assert.deepEqual(f.receipts.map(row=>[row.requestId,row.success]),[[31,false],[32,false]]);assert.equal(document.body.inert,false);assert.equal((await m.listSnapshots(f.scope.accountId,f.scope.spaceId)).some(row=>row.value==='original accepted value'),true);f.native.emit('workspace-flush-request',33);await settle(f);assert.deepEqual(f.receipts.at(-1),{requestId:33,success:true,inert:true});
 });
 await group(names[3],async()=>{
  const gate=defer(),f=await fixture({bind:false,listenGate:gate});f.native.unlistenGate=defer();f.binding=f.bind();await wait(()=>f.native.subscriptions.size===2,'Both actual native subscriptions enter');const retained=[...f.native.subscriptions.values()].filter(row=>row.event==='workspace-flush-request').map(row=>f.native.callbacks.get(row.handler));let done=false;const disposal=f.binding.dispose().then(()=>{done=true;});await m.act(tick);assert.equal(done,false);gate.resolve();await wait(()=>f.native.unlistens.length===2,'Both actual asynchronous native unlistens begin');assert.equal(done,false,'Disposal must also await native unsubscribe completion');f.native.unlistenGate.resolve();await bounded(disposal,'Late setup disposal');assert.equal(f.native.subscriptions.size,0);assert.equal(f.native.unlistens.length,2);for(const callback of retained)callback({event:'workspace-flush-request',id:1,payload:41});await settle(f);assert.equal(f.receipts.length,0);assert.equal(f.freezeCalls,0);assert.equal(document.body.inert,false);
 });
 await group(names[4],async()=>{
  const f=await fixture(),gate=defer();f.saveGate=gate;let entered=false,confirmed=false;f.unregister=m.registerNotebookWriter(f.scope.accountId,{flush:async()=>{entered=true;await gate.promise;await m.putSnapshot({...f.scope,key:'close-dispose-accepted',value:'preserved'});confirmed=true;},settled:()=>gate.promise,pending:()=>!confirmed,suspend(){},resume(){}});f.native.emit('workspace-flush-request',51);await wait(()=>entered,'Accepted old close work begins');let disposed=false;const disposal=f.binding.dispose().then(()=>{disposed=true;});await m.act(tick);assert.equal(disposed,false);assert.equal(document.body.inert,false);assert.equal(f.native.subscriptions.size,0);gate.resolve();await bounded(disposal,'Disposal retains original work');assert.equal(confirmed,true);assert.deepEqual(f.receipts,[{requestId:51,success:false,inert:false}]);assert.equal(f.frozen,false);assert.equal((await m.listSnapshots(f.scope.accountId,f.scope.spaceId)).some(row=>row.value==='preserved'),true);
 });
 await group(names[5],async()=>{
  const f=await fixture();document.body.inert=true;f.native.rejectPositive=true;f.native.emit('workspace-flush-request',61);await settle(f);assert.deepEqual(f.receipts.map(row=>[row.requestId,row.success]),[[61,true],[61,false]]);assert.equal(document.body.inert,true,'Restore the pre-existing external inert state');assert.equal(f.frozen,false);f.cache.setItem('dowze.retry','retained');await f.cache.flush();document.body.inert=false;f.native.emit('workspace-flush-request',62);await settle(f);assert.deepEqual(f.receipts.at(-1),{requestId:62,success:true,inert:true});assert.equal(await f.cache.readCurrentItem('dowze.retry'),'retained');
 });
 await group(names[6],async()=>{
  for(const variant of ['cancel','dispose']){
   const f=await fixture(),first=defer(),second=defer();f.flushGates.set(1,first);f.flushGates.set(2,second);f.native.emit('workspace-flush-request',variant==='cancel'?71:72);await wait(()=>f.flushCalls===1,'The first actual cache flush must be held');let disposal;
   if(variant==='cancel')f.native.emit('workspace-close-cancelled');else disposal=f.binding.dispose();
   assert.equal(document.body.inert,false);f.cache.setItem('dowze.accepted-after-'+variant,'preserved');first.resolve();await wait(()=>f.receipts.length>0||f.flushCalls>=2,'Cancellation must finish or expose an incorrect second flush');assert.equal(f.freezeCalls,0,'An obsolete close must never freeze the writable cache again');assert.equal(f.flushCalls,1,'An obsolete close must not start a second flush');assert.equal(f.frozen,false);f.cache.setItem('dowze.still-writable-'+variant,'yes');
   if(disposal)await bounded(disposal,'Disposed close terminal drain');else await settle(f);assert.deepEqual(f.receipts.map(row=>[row.requestId,row.success]),[[variant==='cancel'?71:72,false]]);assert.equal(await f.cache.readCurrentItem('dowze.accepted-after-'+variant),'preserved');await bounded(f.binding.dispose(),'Retire this variant before replacing its native bridge');assert.equal(f.native.subscriptions.size,0);
  }
 });
}catch(error){report.fatal=brief(error);report.failed++;stop=true;}finally{
 for(const name of names)if(!groups.some(group=>group.name===name))groups.push({name,status:'NOTRUN'});
 try{await mountedCleanup([['Owned listeners/editors/caches',async()=>{if(m&&probe)await cleanup();}],['Probe',()=>probe?.restore()],['RAF',()=>{for(const id of frames)clearTimeout(id);frames.clear();}],['DOM',()=>dom?.window.close()],['Globals',()=>{for(const [name,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}}],['Bundle',()=>rm(out,{recursive:true,force:true})]]);report.cleanupFinal={status:'PASS'};}catch(error){report.cleanupFinal={status:'FAIL',error:brief(error)};report.failed++;}
 report.allGroupsAttempted=report.groupsStarted===names.length;report.fullSuite=report.allGroupsAttempted&&report.failed===0&&!report.fatal&&report.cleanupFinal.status==='PASS';report.finishedAt=new Date().toISOString();report.sourceHashes={};for(const path of ['src/main.tsx','src/lib/notebookWorkspaceClose.ts','src/lib/notebookClose.ts','src/lib/notebookSession.ts','src/components/MarkdownNoteEditor.tsx','src/lib/appStorage.ts','tests/paper-workspace-close-listener-entry.tsx','tests/run-paper-workspace-close-listener.mjs'])report.sourceHashes[path]=createHash('sha256').update(await readFile(path)).digest('hex');
 const path=mountedAuditPath('t-x02-workspace-close-listener-mounted-20261015.json');await writeFile(path,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,failed:report.failed,declaredGroups:names.length,allGroupsAttempted:report.allGroupsAttempted,fullSuite:report.fullSuite,cleanup:report.cleanupFinal.status,report:path}));if(!report.fullSuite)process.exitCode=1;
}
