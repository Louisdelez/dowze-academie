import {build} from 'vite';
import {indexedDB} from 'fake-indexeddb';
import {JSDOM} from 'jsdom';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';

const out=await mkdtemp(join(process.cwd(),'tests/.paper-tool-preferences-hook-'));
globalThis.indexedDB=indexedDB;process.env.NODE_ENV='development';
const originalOpen=indexedDB.open;
let dom,m,sequence=0,passed=0,failed=0;
const views=new Set();
const tick=()=>new Promise(resolve=>setTimeout(resolve,8));
const pen=prefs=>prefs.toolbar.find(slot=>slot.tool==='pen');
const rows=scope=>m.listSnapshots(scope.accountId,scope.spaceId);
const group=async(name,work)=>{try{await work();passed++;console.log(name+': PASS');}catch(error){failed++;console.error(name+': FAIL');console.error(error.stack??error);}finally{indexedDB.open=originalOpen;if(m)m.resumeAllNotebookAccounts();for(const view of [...views])await view.unmount();}};
const waitFor=async(predicate,message='Mounted preference hook did not settle')=>{for(let attempt=0;attempt<120;attempt++){await m.act(async()=>{await tick();});if(predicate())return;}throw Error(message);};
const mount=async(scope,noteId)=>{
 const container=document.createElement('div');document.getElementById('root').append(container);const root=m.createRoot(container);
 let current,props={scope,noteId};const view={container,root,get hook(){return current;},get props(){return props;},async render(next){props=next;await m.act(async()=>{m.flushSync(()=>root.render(m.createElement(m.ToolPreferenceRecipe,{...props,report:value=>{current=value;}})));});},async unmount(){if(!views.has(view))return;views.delete(view);await m.act(async()=>root.unmount());container.remove();}};
 views.add(view);await view.render(props);await waitFor(()=>view.hook?.ready);return view;
};
const fixture=async(label)=>{const scope={accountId:`qa-tool-hook-${label}-${++sequence}`,spaceId:'year-2026'},noteId='Note de recette é 🟦';const view=await mount(scope,noteId);return {scope,noteId,view};};
const settle=async(view)=>{await m.act(async()=>{await view.hook.settled();});await waitFor(()=>!view.hook.saving);};
/** Delay a connection opening, before an IndexedDB transaction exists. This
 * reproduces account closure/switch while preserving real transactional rules. */
const delayNextOpen=()=>{
 let released,started,used=false;const held=new Promise(resolve=>released=resolve),began=new Promise(resolve=>started=resolve);
 indexedDB.open=function(...args){const request=originalOpen.apply(this,args);if(!used){used=true;let handler=null;Object.defineProperty(request,'onsuccess',{configurable:true,get:()=>handler,set:callback=>{handler=typeof callback==='function'?event=>{started();void held.then(()=>callback.call(request,event));}:callback;}});}return request;};
 return {began,release:released};
};
const change=async(view,command,target='note')=>{let result;await m.act(async()=>{result=await view.hook.change(command,target);});return result;};

try{
 await build({configFile:false,build:{ssr:'tests/paper-tool-preferences-hook-entry.ts',outDir:out,copyPublicDir:false,minify:false,sourcemap:false,reportCompressedSize:false,rollupOptions:{output:{entryFileNames:'tool-preferences-hook.mjs'}}},logLevel:'error'});
 dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://qa.invalid/'});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,CustomEvent:dom.window.CustomEvent,Event:dom.window.Event,IS_REACT_ACT_ENVIRONMENT:true});Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
 globalThis.addEventListener=dom.window.addEventListener.bind(dom.window);globalThis.removeEventListener=dom.window.removeEventListener.bind(dom.window);globalThis.dispatchEvent=dom.window.dispatchEvent.bind(dom.window);
 m=await import(pathToFileURL(join(out,'tool-preferences-hook.mjs')));

 await group('Real hook reopens two distinct pen presets, personal palette, active slot and input preferences',async()=>{
  const f=await fixture('reopen');assert.equal(await change(f.view,{type:'patch-preset',id:'paper-tool-pen',patch:{color:'#c04',width:7,opacity:0.45}},'global'),true);assert.equal(await change(f.view,{type:'duplicate',id:'paper-tool-pen'},'global'),true);const id=f.view.hook.effective.activeSlotId;assert.notEqual(id,'paper-tool-pen');assert.equal(await change(f.view,{type:'rename',id,label:'Stylo des formules'},'global'),true);assert.equal(await change(f.view,{type:'patch-preset',id,patch:{color:'#16a08a',width:2,opacity:0.8}},'global'),true);assert.equal(await change(f.view,{type:'palette-add',color:'#AbC'},'global'),true);assert.equal(await change(f.view,{type:'set-input',dominantHand:'left',fingerInk:true},'global'),true);
  const before=structuredClone(f.view.hook.effective);await f.view.unmount();const reopened=await mount(f.scope,f.noteId);assert.deepEqual(reopened.hook.effective,before);assert.equal(reopened.hook.effective.toolbar.filter(slot=>slot.tool==='pen').length,2);assert.deepEqual(pen(reopened.hook.effective).preset,{color:'#cc0044',width:7,opacity:0.45,wholeEraser:false});assert.equal(reopened.hook.effective.toolbar.find(slot=>slot.id===id).label,'Stylo des formules');assert.equal(reopened.hook.effective.activeSlotId,id);assert.equal(reopened.hook.effective.palette.includes('#aabbcc'),true);assert.equal(reopened.hook.effective.dominantHand,'left');assert.equal(reopened.hook.effective.fingerInk,true);assert.equal(m.hasPendingNotebookWrites(),false);
 });
 await group('Serialised rapid tool changes preserve independent fields, reorder focus and every source version',async()=>{
  const f=await fixture('serial');let pending;await m.act(async()=>{pending=[f.view.hook.change({type:'patch-preset',id:'paper-tool-pen',patch:{color:'#f80'}},'global'),f.view.hook.change({type:'patch-preset',id:'paper-tool-pen',patch:{width:11}},'global'),f.view.hook.change({type:'rename',id:'paper-tool-pen',label:'Préréglage simultané'},'global'),f.view.hook.change({type:'palette-add',color:'#FFF'},'global'),f.view.hook.change({type:'select',id:'paper-tool-pen'},'global'),f.view.hook.change({type:'move',id:'paper-tool-pen',to:0},'global')];assert.equal(m.hasPendingNotebookWrites(),true);assert.deepEqual(await Promise.all(pending),[true,true,true,true,true,true]);});await settle(f.view);
  assert.equal(pen(f.view.hook.effective).preset.color,'#ff8800');assert.equal(pen(f.view.hook.effective).preset.width,11);assert.equal(pen(f.view.hook.effective).label,'Préréglage simultané');assert.equal(f.view.hook.effective.toolbar[0].id,'paper-tool-pen');assert.equal(f.view.hook.effective.activeSlotId,'paper-tool-pen');assert.equal(f.view.hook.effective.palette.includes('#ffffff'),true);const history=(await rows(f.scope)).filter(row=>row.key.startsWith(m.paperToolPreferenceHistoryPrefix(f.scope)));assert.equal(history.length,5);assert.ok(history.every(row=>JSON.stringify(row).length<3500));assert.equal(m.hasPendingNotebookWrites(),false);
 });
 await group('Targeted note resets inherit present and future globals while keeping unrelated note overrides',async()=>{
  const f=await fixture('reset');assert.equal(await change(f.view,{type:'patch-preset',id:'paper-tool-pen',patch:{width:5,color:'#b03'}},'global'),true);assert.equal(await change(f.view,{type:'patch-preset',id:'paper-tool-pen',patch:{width:13}},'note'),true);assert.equal(await change(f.view,{type:'patch-preset',id:'paper-tool-pencil',patch:{width:7}},'note'),true);assert.equal(await change(f.view,{type:'set-input',fingerInk:true},'note'),true);await m.act(async()=>{assert.equal(await f.view.hook.reset('note','pen'),true);});assert.equal(pen(f.view.hook.effective).preset.width,5);assert.equal(f.view.hook.loaded.override.presets['paper-tool-pen'],undefined);assert.equal(f.view.hook.effective.toolbar.find(slot=>slot.tool==='pencil').preset.width,7);
  assert.equal(await change(f.view,{type:'patch-preset',id:'paper-tool-pen',patch:{width:9}},'global'),true);assert.equal(pen(f.view.hook.effective).preset.width,9);assert.equal(f.view.hook.effective.fingerInk,true);await m.act(async()=>{assert.equal(await f.view.hook.clearNote(),true);});assert.deepEqual(f.view.hook.loaded.override,{schema:1});assert.deepEqual(f.view.hook.effective,f.view.hook.loaded.global);assert.equal(f.view.hook.effective.fingerInk,false);assert.equal((await rows(f.scope)).filter(row=>row.key.startsWith(m.paperToolPreferenceHistoryPrefix(f.scope,f.noteId))).length,4);
 });
 await group('A profile close waits for a preference commit already in progress, then rejects new writes until resumed',async()=>{
  const f=await fixture('closing'),delayed=delayNextOpen();let work,closing,closed=false;await m.act(async()=>{work=f.view.hook.change({type:'patch-preset',id:'paper-tool-pen',patch:{width:12}},'global');await delayed.began;closing=m.settleNotebookAccount(f.scope.accountId);closing.then(()=>closed=true);for(let index=0;index<3;index++)await tick();});assert.equal(closed,false);assert.equal(m.hasPendingNotebookWrites(),true);await m.act(async()=>{delayed.release();assert.equal(await work,true);await closing;});assert.equal(closed,true);assert.equal(pen((await m.loadPaperToolPreferences(f.scope,f.noteId)).global).preset.width,12);const before=await rows(f.scope);assert.equal(await change(f.view,{type:'set-input',fingerInk:true},'global'),false);assert.deepEqual(await rows(f.scope),before);m.resumeNotebookAccount(f.scope.accountId);assert.equal(await change(f.view,{type:'set-input',fingerInk:true},'global'),true);assert.equal(m.hasPendingNotebookWrites(),false);
 });
 await group('A command accepted immediately before profile closure is drained durably rather than silently rejected',async()=>{
  const f=await fixture('queued-close');let work,closing;await m.act(async()=>{work=f.view.hook.change({type:'patch-preset',id:'paper-tool-pen',patch:{width:15}},'global');closing=m.settleNotebookAccount(f.scope.accountId);assert.equal(await work,true,'An already accepted writer-tail command must finish before its profile closes');await closing;});assert.equal(pen((await m.loadPaperToolPreferences(f.scope,f.noteId)).global).preset.width,15);assert.equal(f.view.hook.notice,'');assert.equal(m.hasPendingNotebookWrites(),false);
 });
 await group('Changing account during pending commit aborts its old transaction without contaminating the new profile',async()=>{
  const f=await fixture('account-race'),delayed=delayNextOpen();let work;await m.act(async()=>{work=f.view.hook.change({type:'patch-preset',id:'paper-tool-pen',patch:{width:18}},'global');await delayed.began;});const other={accountId:f.scope.accountId+'-other',spaceId:f.scope.spaceId};await f.view.render({scope:other,noteId:f.noteId});await waitFor(()=>f.view.hook.ready);await m.act(async()=>{delayed.release();assert.equal(await work,false);});assert.deepEqual(await rows(f.scope),[]);assert.deepEqual(await rows(other),[]);assert.deepEqual(f.view.hook.effective,m.defaultPaperToolPreferences());assert.equal(f.view.hook.loaded.scope.accountId,other.accountId);assert.equal(f.view.hook.notice,'');assert.equal(m.hasPendingNotebookWrites(),false);
 });
 await group('Callbacks retained across note/year/account switches cannot write their original or replacement scope',async()=>{
  const f=await fixture('stale');const stale={change:f.view.hook.change,reset:f.view.hook.reset,clear:f.view.hook.clearNote};const other={accountId:f.scope.accountId+'-new',spaceId:'year-2027'},otherNote=f.noteId+' revised';await f.view.render({scope:other,noteId:otherNote});await waitFor(()=>f.view.hook.ready);await m.act(async()=>{assert.equal(await stale.change({type:'patch-preset',id:'paper-tool-pen',patch:{width:21}},'global'),false);assert.equal(await stale.reset('global','all'),false);assert.equal(await stale.clear(),false);});assert.deepEqual(await rows(f.scope),[]);assert.deepEqual(await rows(other),[]);assert.equal(pen(f.view.hook.effective).preset.width,3);assert.equal(f.view.hook.loaded.noteId,otherNote);assert.equal(m.hasPendingNotebookWrites(),false);
 });
 await group('Unmount during preparation cancels preference publication and leaves no pending lifecycle writer',async()=>{
  const f=await fixture('unmount'),delayed=delayNextOpen();let work;await m.act(async()=>{work=f.view.hook.change({type:'set-input',fingerInk:true},'global');await delayed.began;});await f.view.unmount();await m.act(async()=>{delayed.release();assert.equal(await work,false);});assert.deepEqual(await rows(f.scope),[]);assert.equal(m.hasPendingNotebookWrites(),false);
 });
 await group('Another mounted tab wins CAS; stale tab reads back actual settings, reports refusal and preserves the winner',async()=>{
  const f=await fixture('tabs'),other=await mount(f.scope,f.noteId);assert.equal(await change(other,{type:'patch-preset',id:'paper-tool-pen',patch:{width:14}},'global'),true);const winner=await rows(f.scope);assert.equal(await change(f.view,{type:'set-input',fingerInk:true},'global'),false);assert.deepEqual(await rows(f.scope),winner);assert.equal(pen(f.view.hook.effective).preset.width,14);assert.equal(f.view.hook.effective.fingerInk,false);assert.match(f.view.hook.notice,/conservés/);assert.equal(f.view.hook.ready,true);assert.equal(f.view.hook.saving,false);assert.equal(await change(f.view,{type:'palette-add',color:'#abc'},'global'),true);assert.equal(f.view.hook.notice,'');assert.equal(pen(f.view.hook.effective).preset.width,14);assert.equal(f.view.hook.effective.palette.includes('#aabbcc'),true);assert.equal(m.hasPendingNotebookWrites(),false);
 });
 await group('A failed command does not poison the queue or revert an earlier saved preset',async()=>{
  const f=await fixture('refused');assert.equal(await change(f.view,{type:'patch-preset',id:'paper-tool-pen',patch:{width:9}},'global'),true);const before=await rows(f.scope);assert.equal(await change(f.view,{type:'patch-preset',id:'paper-tool-pen',patch:{width:NaN}},'global'),false);assert.deepEqual(await rows(f.scope),before);assert.equal(pen(f.view.hook.effective).preset.width,9);assert.match(f.view.hook.notice,/conservés/);assert.equal(await change(f.view,{type:'rename',id:'paper-tool-pen',label:'Toujours utilisable'},'global'),true);assert.equal(pen(f.view.hook.effective).label,'Toujours utilisable');assert.equal(f.view.hook.notice,'');assert.equal(m.hasPendingNotebookWrites(),false);
 });
 await group('A deletion arriving after hook load rejects its late preference change and retains all originals',async()=>{
  const f=await fixture('deleted'),identity={...f.scope,type:'whiteboard',documentId:m.notebookDocumentId(f.noteId)};await m.putSnapshot({key:m.notebookDeletionKey(identity),...f.scope,value:{schema:1,kind:'paper-canonical-deletion',...f.scope,documentId:identity.documentId,noteId:f.noteId,version:7,deletedAt:Date.now()}});const before=await rows(f.scope);assert.equal(await change(f.view,{type:'patch-preset',id:'paper-tool-pen',patch:{width:17}},'note'),false);assert.deepEqual(await rows(f.scope),before);assert.equal(pen(f.view.hook.effective).preset.width,3);assert.match(f.view.hook.notice,/conservés/);assert.equal(m.hasPendingNotebookWrites(),false);
 });
 console.log(`Tool preference hook groups: ${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
}finally{indexedDB.open=originalOpen;if(m)m.resumeAllNotebookAccounts();for(const view of [...views])await view.unmount();dom?.window.close();await rm(out,{recursive:true,force:true});}
