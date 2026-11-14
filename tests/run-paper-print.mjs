import {mountedCleanup,requireBoundedMountedCheck,mountedAuditPath} from './mounted-cleanup.mjs';
requireBoundedMountedCheck();
import {build} from 'vite';
import {JSDOM} from 'jsdom';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
process.env.NODE_ENV='development';
const out=await mkdtemp(join(process.cwd(),'tests/.paper-print-'));
let m,dom,passed=0,failed=0,sequence=0,urlSequence=0;
const fixtures=new Set(),urls=new Map(),revocations=[],blobOwners=new WeakMap(),timers=new Map(),proof=[];
const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL,nativeTimeout=globalThis.setTimeout,nativeClear=globalThis.clearTimeout;
const tick=()=>new Promise(resolve=>nativeTimeout(resolve,10));
const propsOf=node=>{assert.ok(node,'The real mounted control must exist');const key=Object.keys(node).find(value=>value.startsWith('__reactProps$'));assert.ok(key,'The actual React handler must exist');return node[key];};
const button=(f,label)=>[...document.querySelectorAll('.paper-print-preview button')].find(node=>node.getAttribute('aria-label')===label||node.textContent.trim()===label);
const wait=async(predicate,message='Print preview did not settle')=>{for(let i=0;i<160;i++){await m.act(tick);if(predicate())return;}throw Error(message);};
const status=()=>document.querySelector('.paper-print-status')?.textContent??'';
const click=async(node,trusted=false)=>{assert.ok(node,'The requested print control must exist');await m.act(async()=>{propsOf(node).onClick({nativeEvent:{isTrusted:trusted}});await tick();});};
const pdfFixture=async source=>{const pdf=await m.PDFDocument.create();for(const page of source.pages){const size=m.paperPdfSize(page);pdf.addPage([size.width,size.height]);}return new Blob([await pdf.save()],{type:'application/pdf'});};
const prepare=async f=>{const prepared=await m.preparePaperPrint(f.scope,{}, {renderPdf:async(source,_media,progress,current)=>{assert.ok(current());const blob=await pdfFixture(source);progress(source.pages.length,source.pages.length);return blob;}});blobOwners.set(prepared.blob,f);return prepared;};
const mount=async({strict=false,readOnly=false}={})=>{
 const id=++sequence,host=document.createElement('div'),privatePane=document.createElement('aside'),previous=document.createElement('button');host.dataset.printFixture='true';privatePane.dataset.printFixture='true';privatePane.textContent='Panneau privé hors du PDF';previous.textContent='Ouvrir impression';privatePane.append(previous);document.body.append(host,privatePane);previous.focus();
 const doc=m.migratePaper('qa-print-ui-'+id,'',null,'2026-10-14T09:00:00Z');doc.objects=[];doc.pages.push({...doc.pages[0],id:'qa-print-landscape-'+id,width:1123,height:794});
 const f={host,privatePane,previous,root:m.createRoot(host),doc,allowed:true,live:true,strict,requests:0,downloads:[],closed:0,pdfWindows:[],props:null,scope:null};fixtures.add(f);
 f.scope={noteId:doc.noteId,ownerKey:'qa-print-ui-owner-'+id,generation:1,media:{accountId:'qa-print-ui-account-'+id,spaceId:'year'},current:()=>f.allowed,getCurrent:()=>f.doc,title:'Carnet de recette'};f.prepared=await prepare(f);
 f.props={prepared:f.prepared,media:f.scope.media,ownerKey:f.scope.ownerKey,generation:f.scope.generation,readOnly,current:()=>f.allowed,getCurrent:()=>f.doc,focusCurrent:()=>f.allowed,onClose:()=>{f.closed++;f.root.render(null);}};
 f.render=async patch=>{f.props={...f.props,...patch};await m.act(async()=>{const child=m.createElement(m.PaperPrintPreview,f.props);f.root.render(f.strict?m.createElement(m.StrictMode,null,child):child);await tick();});};await f.render();await wait(()=>document.querySelector('.paper-print-preview iframe'));return f;
};
const ready=async(f,{afterPrint=false}={})=>{
 const frame=document.querySelector('.paper-print-preview iframe');assert.ok(frame);const url=frame.getAttribute('src');assert.ok(urls.has(url),'The preview must own a generated PDF URL');
 const pdf=await m.PDFDocument.load(await urls.get(url).blob.arrayBuffer());assert.equal(pdf.getPageCount(),f.prepared.pageCount,'A genuine complete PDF fixture must back this preview');
 const target=new dom.window.EventTarget();target.location={href:url};target.print=()=>{f.requests++;if(afterPrint)target.dispatchEvent(new Event('afterprint'));};f.pdfWindows.push(target);Object.defineProperty(frame,'contentWindow',{configurable:true,value:target});await m.act(async()=>propsOf(frame).onLoad({currentTarget:frame}));await wait(()=>!button(f,'Imprimer le PDF complet').disabled);return {frame,target,url};
};
const unmount=async f=>{if(!f.live)return;await m.act(async()=>f.root.unmount());f.live=false;f.host.remove();f.privatePane.remove();fixtures.delete(f);};
const cleanup=()=>mountedCleanup([['React print fixtures',async()=>{for(const f of fixtures)await unmount(f);}],['Owned PDF resources',()=>{assert.equal(urls.size,0,'Every print preview URL must be revoked');assert.equal(timers.size,0,'Every preview load timeout must be cleared');document.querySelectorAll('[data-print-fixture]').forEach(node=>node.remove());assert.equal(document.body.classList.contains('paper-print-preview-active'),false);delete window.__TAURI_INTERNALS__;}]]);
const group=async(name,work)=>{if(process.env.DOWZE_PRINT_ONLY&&!name.includes(process.env.DOWZE_PRINT_ONLY))return;try{await work();passed++;proof.push({name,status:'PASS'});console.log(name+': PASS');}catch(error){failed++;proof.push({name,status:'FAIL',error:String(error.message).slice(0,1500)});console.error(name+': FAIL '+String(error.message).slice(0,1500));}finally{await cleanup();}};
try{
 await build({configFile:false,ssr:{noExternal:['yjs','lib0']},build:{ssr:'tests/paper-print-entry.tsx',outDir:out,copyPublicDir:false,minify:false,sourcemap:false,reportCompressedSize:false,rollupOptions:{preserveEntrySignatures:'strict',output:{entryFileNames:'print.mjs'}}},logLevel:'error'});
 dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://qa.invalid/'});Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,HTMLIFrameElement:dom.window.HTMLIFrameElement,HTMLDialogElement:dom.window.HTMLDialogElement,Element:dom.window.Element,Node:dom.window.Node,Event:dom.window.Event,KeyboardEvent:dom.window.KeyboardEvent,CustomEvent:dom.window.CustomEvent,getComputedStyle:dom.window.getComputedStyle.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true});Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});Object.defineProperty(navigator,'pdfViewerEnabled',{value:true,configurable:true});
 URL.createObjectURL=blob=>{const url='blob:https://qa.invalid/print-'+(++urlSequence);urls.set(url,{blob,owner:blobOwners.get(blob)});return url;};URL.revokeObjectURL=url=>{revocations.push(url);urls.delete(url);};
 globalThis.setTimeout=(callback,delay,...args)=>{if(delay!==15000)return nativeTimeout(callback,delay,...args);const id={printLoadTimeout:++sequence};timers.set(id,()=>{timers.delete(id);callback(...args);});return id;};globalThis.clearTimeout=id=>{if(!timers.delete(id))nativeClear(id);};globalThis.requestAnimationFrame=callback=>nativeTimeout(()=>callback(performance.now()),10);globalThis.cancelAnimationFrame=nativeClear;
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};dom.window.print=()=>{throw Error('The private application shell must never be printed by a preview action');};
 dom.window.HTMLAnchorElement.prototype.click=function(){const owned=urls.get(this.href);assert.ok(owned?.owner,'Only this preview owned PDF may be downloaded');owned.owner.downloads.push({url:this.href,name:this.download});};
 m=await import(pathToFileURL(join(out,'print.mjs')));const style=document.createElement('style');style.textContent=await readFile(new URL('../src/components/paper-print-preview.css',import.meta.url),'utf8');document.head.append(style);

 await group('The full genuine PDF is previewed before any human print request and remains identical to its source bytes',async()=>{
  const f=await mount(),original=structuredClone(f.doc);assert.equal(f.requests,0);assert.equal(button(f,'Imprimer le PDF complet').disabled,true);const {url}=await ready(f);assert.equal(f.requests,0);assert.ok(document.body.classList.contains('paper-print-preview-active'));assert.ok(document.querySelector('dialog').textContent.includes('2 pages'));
  await click(button(f,'Imprimer le PDF complet'));assert.equal(f.requests,0,'Programmatic events must not print');await click(button(f,'Imprimer le PDF complet'),true);assert.equal(f.requests,1);assert.ok(status().includes('Dialogue d’impression demandé'));assert.deepEqual(f.doc,original);assert.deepEqual(new Uint8Array(await urls.get(url).blob.arrayBuffer()),new Uint8Array(await f.prepared.blob.arrayBuffer()));assert.equal(getComputedStyle(button(f,'Imprimer le PDF complet')).minHeight,'44px');
  await click(button(f,'Fermer l’aperçu d’impression'));await wait(()=>!document.querySelector('.paper-print-preview'));assert.equal(f.closed,1);assert.equal(urls.size,0);assert.ok(document.activeElement===f.previous,'Normal exit must restore its own launcher');assert.deepEqual(f.doc,original);
 });
 await group('Afterprint means dialogue closure rather than a claim of a successful printer job',async()=>{
  const f=await mount();await ready(f,{afterPrint:true});await click(button(f,'Imprimer le PDF complet'),true);assert.equal(f.requests,1);assert.ok(status().includes('Dialogue fermé'));assert.ok(status().includes('ne confirme pas'));
 });
 await group('A readable readonly source can request its complete PDF without changing canonical geometry',async()=>{
  const f=await mount({readOnly:true}),original=structuredClone(f.doc);await ready(f);await click(button(f,'Imprimer le PDF complet'),true);assert.equal(f.requests,1);assert.deepEqual(f.doc,original);const stale=propsOf(button(f,'Imprimer le PDF complet')).onClick;
  f.scope.generation++;await f.render({readOnly:false,generation:f.scope.generation});await wait(()=>!document.querySelector('.paper-print-preview iframe'));await m.act(async()=>stale({nativeEvent:{isTrusted:true}}));assert.equal(f.requests,1);assert.equal(urls.size,0);assert.deepEqual(f.doc,original);
 });
 await group('Account source API and generation changes revoke private PDF frames and retained actions across A to B to A',async()=>{
  for(const change of ['account','source','api','generation']){
   const f=await mount();const old=await ready(f),print=propsOf(button(f,'Imprimer le PDF complet')).onClick,save=propsOf(button(f,'Enregistrer le PDF complet')).onClick,first=f.doc,oldScope={...f.scope,media:{...f.scope.media}};
   if(change==='account'){f.scope.ownerKey='other-print-owner';f.scope.media={...f.scope.media,accountId:'other-account'};await f.render({ownerKey:f.scope.ownerKey,media:f.scope.media});}
   if(change==='source')f.doc={...f.doc,revision:f.doc.revision+1};
   if(change==='api'){f.scope.media={...f.scope.media,api:{}};await f.render({media:f.scope.media});}
   if(change==='generation'){f.scope.generation++;await f.render({generation:f.scope.generation});}
   await wait(()=>!document.querySelector('.paper-print-preview iframe'));assert.equal(urls.has(old.url),false);assert.equal(old.frame.style.opacity,'0');await m.act(async()=>{print({nativeEvent:{isTrusted:true}});save({nativeEvent:{isTrusted:true}});});assert.equal(f.requests,0);assert.equal(f.downloads.length,0);
   f.doc=first;f.scope={...oldScope,generation:oldScope.generation+2,current:()=>f.allowed,getCurrent:()=>f.doc};await f.render({ownerKey:f.scope.ownerKey,media:f.scope.media,generation:f.scope.generation});assert.ok(!document.querySelector('.paper-print-preview iframe'),'An old prepared PDF cannot revive after ABA');
   f.prepared=await prepare(f);await f.render({prepared:f.prepared});await ready(f);await m.act(async()=>print({nativeEvent:{isTrusted:true}}));assert.equal(f.requests,0,'The retained action must not print a fresh preview');await unmount(f);
  }
 });
 await group('StrictMode replay owns one PDF URL and unmount releases frames events and timeouts',async()=>{
  const f=await mount({strict:true});assert.equal(urls.size,1);const {frame,target,url}=await ready(f),old=propsOf(button(f,'Imprimer le PDF complet')).onClick;await click(button(f,'Imprimer le PDF complet'),true);assert.equal(f.requests,1);await unmount(f);assert.equal(urls.has(url),false);assert.equal(frame.style.opacity,'0');await m.act(async()=>{old({nativeEvent:{isTrusted:true}});target.dispatchEvent(new Event('afterprint'));});assert.equal(f.requests,1);assert.equal(timers.size,0);assert.ok(revocations.includes(url));
 });
 await group('Unsupported native and inline readers use explicit full PDF file fallback without printing the application shell',async()=>{
  const f=await mount();await ready(f);window.__TAURI_INTERNALS__={};await click(button(f,'Imprimer le PDF complet'),true);assert.equal(f.requests,0);assert.ok(status().includes('Impression directe indisponible'));delete window.__TAURI_INTERNALS__;
  Object.defineProperty(navigator,'pdfViewerEnabled',{value:false,configurable:true});await click(button(f,'Imprimer le PDF complet'),true);assert.equal(f.requests,0);Object.defineProperty(navigator,'pdfViewerEnabled',{value:true,configurable:true});
  await click(button(f,'Enregistrer le PDF complet'));assert.equal(f.downloads.length,0);await click(button(f,'Enregistrer le PDF complet'),true);assert.equal(f.downloads.length,1);assert.equal(f.downloads[0].name,'Carnet de recette.pdf');assert.ok(status().includes('Téléchargement du PDF complet demandé'));
 });
 await group('An unavailable inline preview clears its load timer but keeps the genuine complete PDF available for a human download',async()=>{
  const f=await mount();assert.equal(timers.size,1);await m.act(async()=>{for(const callback of [...timers.values()])callback();});await wait(()=>!document.querySelector('.paper-print-preview iframe'));assert.equal(timers.size,0);assert.ok(status().includes('aperçu intégré'));assert.equal(f.requests,0);await click(button(f,'Enregistrer le PDF complet'),true);assert.equal(f.downloads.length,1);assert.equal((await m.PDFDocument.load(await f.prepared.blob.arrayBuffer())).getPageCount(),2);
 });
 const report={date:'2026-10-14',passed,failed,groups:proof,genuinePdfFixtures:true,preparationRendererInjectedForLeaseContract:true,sharedRichRendererFidelityVerified:false,pdfIframeAndPrintFunctionsSynthetic:true,trustedHumanActionSynthetic:true,physicalPrinterVerified:false,browserIosPrintVerified:false,nativePrintAndFileDialogVerified:false,parentNotebookIntegrationVerified:false};
 await writeFile(mountedAuditPath('print-mounted-tests-20261014.json'),JSON.stringify(report,null,2)+'\n');console.log(`Print groups: ${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
}finally{await mountedCleanup([['Print fixtures',()=>m&&dom?cleanup():undefined],['Browser API restore',()=>{URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;globalThis.setTimeout=nativeTimeout;globalThis.clearTimeout=nativeClear;}],['DOM',()=>dom?.window.close()],['Generated bundle',()=>rm(out,{recursive:true,force:true})]]);}
