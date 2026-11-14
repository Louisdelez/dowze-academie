import {build} from 'vite';
import {indexedDB} from 'fake-indexeddb';
import {JSDOM} from 'jsdom';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
const out=await mkdtemp(join(process.cwd(),'tests/.paper-tool-settings-'));
globalThis.indexedDB=indexedDB;process.env.NODE_ENV='development';
const originalOpen=indexedDB.open;const views=new Set();
let dom,m,sequence=0,passed=0,failed=0;
const tick=()=>new Promise(resolve=>setTimeout(resolve,8));
const pen=prefs=>prefs.toolbar.find(slot=>slot.tool==='pen');
const rows=scope=>m.listSnapshots(scope.accountId,scope.spaceId);
const group=async(name,work)=>{try{await work();passed++;console.log(name+': PASS');}catch(error){failed++;console.error(name+': FAIL');console.error(error.stack??error);}finally{indexedDB.open=originalOpen;if(m)m.resumeAllNotebookAccounts();for(const view of [...views])await view.unmount();}};
const waitFor=async(predicate,message='Tool settings did not settle')=>{for(let index=0;index<120;index++){await m.act(async()=>{await tick();});if(predicate())return;}throw Error(message);};
const mount=async(scope,noteId)=>{
 const container=document.createElement('div');document.getElementById('root').append(container);const root=m.createRoot(container);let current,props={scope,noteId};
 const view={container,get hook(){return current;},get props(){return props;},async render(next){props=next;await m.act(async()=>m.flushSync(()=>root.render(m.createElement(m.ToolSettingsRecipe,{...props,report:value=>current=value}))));},async unmount(){if(!views.has(view))return;views.delete(view);await m.act(async()=>root.unmount());container.remove();}};
 views.add(view);await view.render(props);await waitFor(()=>view.hook?.ready);return view;
};
const fixture=async(label)=>{const scope={accountId:`qa-tool-settings-${label}-${++sequence}`,spaceId:'year-2026'},noteId='Note de recette é 🟦';return {scope,noteId,view:await mount(scope,noteId)};};
const label=(view,name)=>{const element=[...view.container.querySelectorAll('[aria-label]')].find(control=>control.getAttribute('aria-label')===name);assert.ok(element,`Missing labelled control: ${name}`);return element;};
const click=async(element)=>{await m.act(async()=>element.click());};
const open=async(view)=>{await click(label(view,'Personnaliser les outils'));await waitFor(()=>!!view.container.querySelector('[role="dialog"]'));};
const configurePen=async(view)=>{const control=view.container.querySelector('[data-tool-slot="paper-tool-pen"] .paper-tool-configure');assert.ok(control,'Missing stable pen preset control');await click(control);};
const settle=async(view)=>{await m.act(async()=>{await view.hook.settled();});await waitFor(()=>!view.hook.saving);};
const setValue=(input,value)=>{const proto=input.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype;m.flushSync(()=>{Object.getOwnPropertyDescriptor(proto,'value').set.call(input,value);input.dispatchEvent(new dom.window.Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));});};
const focus=async(element)=>{await m.act(async()=>element.focus());};
const blurValue=async(view,name,value)=>{const input=label(view,name),next=label(view,'Portée des réglages des outils');await m.act(async()=>{input.focus();setValue(input,value);next.focus();});await settle(view);};
const chooseTarget=async(view,target)=>{await m.act(async()=>{const select=label(view,'Portée des réglages des outils');select.focus();setValue(select,target);});};
const delayNextOpen=()=>{let release,started,used=false;const held=new Promise(resolve=>release=resolve),began=new Promise(resolve=>started=resolve);indexedDB.open=function(...args){const request=originalOpen.apply(this,args);if(!used){used=true;let handler=null;Object.defineProperty(request,'onsuccess',{configurable:true,get:()=>handler,set:callback=>handler=typeof callback==='function'?event=>{started();void held.then(()=>callback.call(request,event));}:callback});}return request;};return {release,began};};

try{
 await build({configFile:false,build:{ssr:'tests/paper-tool-settings-entry.tsx',outDir:out,copyPublicDir:false,minify:false,sourcemap:false,reportCompressedSize:false,rollupOptions:{output:{entryFileNames:'tool-settings.mjs'}}},logLevel:'error'});
 dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://qa.invalid/'});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,CustomEvent:dom.window.CustomEvent,Event:dom.window.Event,IS_REACT_ACT_ENVIRONMENT:true});Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
 globalThis.addEventListener=dom.window.addEventListener.bind(dom.window);globalThis.removeEventListener=dom.window.removeEventListener.bind(dom.window);globalThis.dispatchEvent=dom.window.dispatchEvent.bind(dom.window);
 // JSDOM has no layout. Give mounted visible controls a parent to exercise the
 // actual dialog's visibility-filtered Tab wrapping; this is not visual QA.
 Object.defineProperty(dom.window.HTMLElement.prototype,'offsetParent',{configurable:true,get(){return this.isConnected&&this.style.display!=='none'?this.parentElement:null;}});
 m=await import(pathToFileURL(join(out,'tool-settings.mjs')));

 await group('Mounted settings preserve rapid Name → Width → Opacity edits while the preceding commit is delayed',async()=>{
  const f=await fixture('rapid');await open(f.view);await configurePen(f.view);const delayed=delayNextOpen();const name=label(f.view,'Nom du préréglage'),width=label(f.view,'Épaisseur du préréglage'),opacity=label(f.view,'Opacité du préréglage');
  await m.act(async()=>{name.focus();setValue(name,'  Formules rapides  ');width.focus();await delayed.began;});assert.equal(f.view.hook.saving,true);assert.equal(document.activeElement,width);assert.equal(name.disabled,false);assert.equal(width.disabled,false);assert.equal(opacity.disabled,false);
  await m.act(async()=>{setValue(width,'7.5');opacity.focus();setValue(opacity,'65');label(f.view,'Portée des réglages des outils').focus();});assert.equal(f.view.hook.saving,true);assert.equal(label(f.view,'Épaisseur du préréglage').disabled,false);assert.equal(label(f.view,'Opacité du préréglage').disabled,false);
  await m.act(async()=>delayed.release());await settle(f.view);assert.equal(pen(f.view.hook.loaded.global).label,'Formules rapides');assert.equal(pen(f.view.hook.loaded.global).preset.width,7.5);assert.equal(pen(f.view.hook.loaded.global).preset.opacity,0.65);assert.equal(label(f.view,'Nom du préréglage').value,'Formules rapides');assert.equal(label(f.view,'Épaisseur du préréglage').value,'7.5');assert.equal(label(f.view,'Opacité du préréglage').value,'65');assert.equal(f.view.hook.notice,'');assert.equal(m.hasPendingNotebookWrites(),false);const durable=await m.loadPaperToolPreferences(f.scope,f.noteId);assert.deepEqual(durable.global,f.view.hook.loaded.global);
 });
 await group('An older acknowledgement keeps newer dirty text and focus in the same preset input until its next blur',async()=>{
  const f=await fixture('dirty-after-ack');await open(f.view);await configurePen(f.view);const delayed=delayNextOpen(),width=label(f.view,'Épaisseur du préréglage'),next=label(f.view,'Nom du préréglage');
  await m.act(async()=>{width.focus();setValue(width,'7.5');next.focus();await delayed.began;});assert.equal(f.view.hook.saving,true);
  await m.act(async()=>{width.focus();setValue(width,'9.5');});assert.equal(document.activeElement,width);assert.equal(width.value,'9.5');await m.act(async()=>delayed.release());await settle(f.view);
  assert.equal(width.isConnected,true);assert.equal(label(f.view,'Épaisseur du préréglage'),width);assert.equal(width.value,'9.5');assert.equal(document.activeElement,width);assert.equal(pen(f.view.hook.loaded.global).preset.width,7.5);assert.equal(pen((await m.loadPaperToolPreferences(f.scope,f.noteId)).global).preset.width,7.5);assert.equal(f.view.hook.notice,'');
  await focus(next);await settle(f.view);assert.equal(pen(f.view.hook.loaded.global).preset.width,9.5);assert.equal(pen((await m.loadPaperToolPreferences(f.scope,f.noteId)).global).preset.width,9.5);assert.equal(width.value,'9.5');assert.equal(width.isConnected,true);assert.equal(m.hasPendingNotebookWrites(),false);
 });
 await group('A second submitted preset value remains visible while the first acknowledgement and second commit arrive in order',async()=>{
  const f=await fixture('submitted-before-ack');await open(f.view);await configurePen(f.view);const first=delayNextOpen(),width=label(f.view,'Épaisseur du préréglage'),next=label(f.view,'Nom du préréglage');
  await m.act(async()=>{width.focus();setValue(width,'7.5');next.focus();await first.began;});await m.act(async()=>{width.focus();setValue(width,'9.5');next.focus();width.focus();});assert.equal(f.view.hook.saving,true);assert.equal(width.value,'9.5');const second=delayNextOpen();
  await m.act(async()=>{first.release();await second.began;});assert.equal(pen(f.view.hook.loaded.global).preset.width,7.5);assert.equal(pen((await m.loadPaperToolPreferences(f.scope,f.noteId)).global).preset.width,7.5);assert.equal(label(f.view,'Épaisseur du préréglage'),width);assert.equal(width.value,'9.5');assert.equal(document.activeElement,width);assert.equal(width.isConnected,true);assert.equal(f.view.hook.saving,true);
  await m.act(async()=>second.release());await settle(f.view);assert.equal(pen(f.view.hook.loaded.global).preset.width,9.5);assert.equal(pen((await m.loadPaperToolPreferences(f.scope,f.noteId)).global).preset.width,9.5);assert.equal(width.value,'9.5');assert.equal(document.activeElement,width);assert.equal(label(f.view,'Épaisseur du préréglage'),width);assert.equal(f.view.hook.notice,'');assert.equal(m.hasPendingNotebookWrites(),false);
 });
 await group('Empty, unchanged and out-of-range numeric fields restore their actual preset without generating writes',async()=>{
  const f=await fixture('validation');await open(f.view);await configurePen(f.view);const before=await rows(f.scope);for(const value of ['', '0.05', '65', '-4','3']){await blurValue(f.view,'Épaisseur du préréglage',value);assert.equal(label(f.view,'Épaisseur du préréglage').value,'3');assert.deepEqual(await rows(f.scope),before);assert.equal(f.view.hook.notice,'');}
  for(const value of ['', '-1','101','100']){await blurValue(f.view,'Opacité du préréglage',value);assert.equal(label(f.view,'Opacité du préréglage').value,'100');assert.deepEqual(await rows(f.scope),before);assert.equal(f.view.hook.notice,'');}await blurValue(f.view,'Opacité du préréglage','0');assert.equal(pen(f.view.hook.loaded.global).preset.opacity,0);assert.equal(label(f.view,'Opacité du préréglage').value,'0');
 });
 await group('Changing the target scope keeps the edited note preset separate and reset restores future global inheritance',async()=>{
  const f=await fixture('scope');await open(f.view);await configurePen(f.view);await blurValue(f.view,'Épaisseur du préréglage','5');await chooseTarget(f.view,'note');await configurePen(f.view);await blurValue(f.view,'Nom du préréglage','Ma note');await blurValue(f.view,'Épaisseur du préréglage','13');assert.equal(pen(f.view.hook.loaded.global).preset.width,5);assert.equal(pen(f.view.hook.effective).preset.width,13);assert.equal(pen(f.view.hook.loaded.global).label,undefined);
  await click(label(f.view,'Réinitialiser les styles Stylo'));await settle(f.view);assert.equal(pen(f.view.hook.effective).preset.width,5);assert.equal(pen(f.view.hook.effective).label,'Ma note');assert.equal(f.view.hook.loaded.override.presets?.['paper-tool-pen'],undefined);await chooseTarget(f.view,'global');await configurePen(f.view);assert.equal(label(f.view,'Nom du préréglage').value,'');assert.equal(label(f.view,'Épaisseur du préréglage').value,'5');await blurValue(f.view,'Épaisseur du préréglage','9');await chooseTarget(f.view,'note');await configurePen(f.view);assert.equal(label(f.view,'Épaisseur du préréglage').value,'9');assert.equal(label(f.view,'Nom du préréglage').value,'Ma note');
  const inherit=[...f.view.container.querySelectorAll('button')].find(button=>button.textContent==='Utiliser tous les réglages globaux');assert.ok(inherit);await click(inherit);await settle(f.view);assert.deepEqual(f.view.hook.loaded.override,{schema:1});assert.equal(label(f.view,'Nom du préréglage').value,'');assert.equal(label(f.view,'Épaisseur du préréglage').value,'9');
 });
 await group('Account/year switching closes the open settings and prevents a dirty field from leaking into the replacement profile',async()=>{
  const f=await fixture('account');await open(f.view);await configurePen(f.view);const oldInput=label(f.view,'Épaisseur du préréglage');await m.act(async()=>{oldInput.focus();setValue(oldInput,'27');});const other={accountId:f.scope.accountId+'-other',spaceId:'year-2027'};await f.view.render({scope:other,noteId:f.noteId});await waitFor(()=>f.view.hook.ready);assert.equal(f.view.container.querySelector('[role="dialog"]'),null);assert.equal(label(f.view,'Personnaliser les outils').getAttribute('aria-expanded'),'false');assert.equal(oldInput.isConnected,false);await m.act(async()=>oldInput.dispatchEvent(new dom.window.FocusEvent('focusout',{bubbles:true})));assert.deepEqual(await rows(f.scope),[]);assert.deepEqual(await rows(other),[]);await open(f.view);await configurePen(f.view);assert.equal(label(f.view,'Épaisseur du préréglage').value,'3');assert.equal(label(f.view,'Nom du préréglage').value,'');assert.equal(f.view.hook.notice,'');assert.equal(m.hasPendingNotebookWrites(),false);
 });
 await group('Dialog Escape returns focus to its trigger and Tab wraps inside the actual mounted controls',async()=>{
  const f=await fixture('focus');await open(f.view);const panel=f.view.container.querySelector('[role="dialog"]'),controls=[...panel.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(element=>element.offsetParent!==null),first=controls[0],last=controls.at(-1);assert.equal(document.activeElement,first);
  const shiftTab=new dom.window.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true});await m.act(async()=>first.dispatchEvent(shiftTab));assert.equal(shiftTab.defaultPrevented,true);assert.equal(document.activeElement,last);const tab=new dom.window.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true});await m.act(async()=>last.dispatchEvent(tab));assert.equal(tab.defaultPrevented,true);assert.equal(document.activeElement,first);await m.act(async()=>first.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));assert.equal(f.view.container.querySelector('[role="dialog"]'),null);assert.equal(document.activeElement,label(f.view,'Personnaliser les outils'));assert.equal(label(f.view,'Personnaliser les outils').getAttribute('aria-expanded'),'false');
 });
 await group('Alt-arrow keyboard reorder keeps focus on the same preset identity and commits the new toolbar order',async()=>{
  const f=await fixture('reorder');await open(f.view);await configurePen(f.view);const configured=label(f.view,'Régler Stylo');await focus(configured);await m.act(async()=>configured.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowUp',altKey:true,bubbles:true,cancelable:true})));await settle(f.view);assert.equal(f.view.hook.loaded.global.toolbar[0].id,'paper-tool-pen');assert.equal(f.view.container.querySelector('.paper-tool-order li').getAttribute('data-tool-slot'),'paper-tool-pen');assert.equal(document.activeElement,configured);assert.equal(configured.isConnected,true);assert.equal(m.hasPendingNotebookWrites(),false);
 });
 console.log(`Tool settings mounted groups: ${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
}finally{indexedDB.open=originalOpen;if(m)m.resumeAllNotebookAccounts();for(const view of [...views])await view.unmount();dom?.window.close();await rm(out,{recursive:true,force:true});}
