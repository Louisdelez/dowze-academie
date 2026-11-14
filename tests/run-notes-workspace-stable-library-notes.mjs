/** Actual NotesWorkspace -> LibraryView, JSDOM/fIDB. No editor is mounted. */
import {requireBoundedMountedCheck,mountedAuditPath} from './mounted-cleanup.mjs';requireBoundedMountedCheck();
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {IDBFactory,IDBKeyRange} from 'fake-indexeddb';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
const hash=v=>createHash('sha256').update(v).digest('hex'),tick=()=>new Promise(r=>setTimeout(r,10));
const name='Real parent rerenders retain the exact search index; newly accessible canonical notes rebuild it once';
const keys=['window','document','HTMLElement','HTMLInputElement','InputEvent','Element','SVGElement','Node','navigator','Event','CustomEvent','indexedDB','IDBKeyRange','crypto','addEventListener','removeEventListener','dispatchEvent','IS_REACT_ACT_ENVIRONMENT','setTimeout','clearTimeout','setInterval','clearInterval','MessageChannel'],saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)])),nativeTimers={setTimeout,clearTimeout,setInterval,clearInterval};
const report={schema:1,kind:'actual-notes-workspace-stable-library-notes-mounted',declaredGroups:1,groups:[],passed:0,failed:0,fullSuite:false,cleanup:{status:'NOTRUN'},fatal:null,scope:'Actual NotesWorkspace and LibraryView, real search/classification/navigation hooks and storage on JSDOM/fakeIDB; no App, PM/editor, browser geometry, native GUI or latency claim.'};
const kinds=new WeakMap(),pending=new Set(),deadlines=[],fixtures=new Set(),opens=new Set(),txs=new Set(),connections=new Set(),timers=new Set(),intervals=new Set(),nativeErrors=[],listenerRecords=[],listenerRestorers=[],index={starts:0,cleanups:0,active:new Set()};
const factory=new IDBFactory();let m,dom,manifest,stopped=false,unsafe=false,restoreOpen,terminalEvidence,markerPath,listenerBaseline=[],expectedSources;
function follow(p,kind='operation'){if(!kinds.has(p))kinds.set(p,kind);pending.add(p);void p.then(()=>pending.delete(p),()=>pending.delete(p));return p;}
async function bounded(p,label,ms=8500,kind='operation'){follow(p,kind);let t;try{return await Promise.race([p,new Promise((_,no)=>{t=setTimeout(()=>{deadlines.push(label);no(Error('Timeout retains original: '+label));},ms);})]);}finally{clearTimeout(t);}}
async function drain(excludeBody=false){const end=Date.now()+10000;for(;;){const work=[...pending].filter(p=>!excludeBody||kinds.get(p)!=='body');if(!work.length)return;if(Date.now()>=end)throw Error('FATAL_STOP: original work remains');let timer;try{await Promise.race([Promise.allSettled(work),new Promise(resolve=>{timer=setTimeout(resolve,10);})]);}finally{clearTimeout(timer);}}}
const active=()=>{if(stopped)throw Error('Stable notes recipe admission has ended');};
async function wait(fn,label){const end=Date.now()+6500;while(Date.now()<end){active();if(fn())return;await m.act(tick);}throw Error('Observation expired: '+label);}

// Exact ownership/drain pattern from the already qualified annual mounted
// recipe. Install BEFORE importing the React bundle, retain original delivery.
const frameworkChannels=[],frameworkErrors=[];let frameworkRetired=false;
function installFrameworkChannels(){
 const NativeChannel=globalThis.MessageChannel;assert.equal(typeof NativeChannel,'function');
 class OwnedMessageChannel extends NativeChannel{
  constructor(...args){
   if(frameworkRetired)throw Error('Framework created new work after terminal cleanup');
   super(...args);const ports=[this.port1,this.port2],row={inflight:[0,0],posts:0,deliveries:0,closed:[false,false],closePromises:[],ports};frameworkChannels.push(row);
   ports.forEach((port,index)=>{
    const post=port.postMessage.bind(port),close=port.close.bind(port);let resolveClose;
    row.closePromises[index]=new Promise(resolve=>resolveClose=resolve);
    port.once('close',()=>{row.closed[index]=true;resolveClose();});
    port.addEventListener('message',()=>{if(row.inflight[index]<=0)frameworkErrors.push('Unexpected framework message');else row.inflight[index]--;row.deliveries++;});
    port.addEventListener('messageerror',()=>frameworkErrors.push('Framework message error'));
    port.postMessage=(...values)=>{const receiver=1-index;if(row.closed[index]||row.closed[receiver])frameworkErrors.push('Framework post after closed port');row.posts++;row.inflight[receiver]++;try{return post(...values);}catch(error){row.inflight[receiver]--;frameworkErrors.push('Framework post rejected');throw error;}};
    port.close=(...values)=>close(...values);
   });
  }
 }
 Object.defineProperty(globalThis,'MessageChannel',{configurable:true,writable:true,value:OwnedMessageChannel});
 Object.defineProperty(window,'MessageChannel',{configurable:true,writable:true,value:OwnedMessageChannel});
}
const frameworkState=()=>({created:frameworkChannels.length,inflight:frameworkChannels.reduce((n,row)=>n+row.inflight[0]+row.inflight[1],0),closedPorts:frameworkChannels.reduce((n,row)=>n+row.closed.filter(Boolean).length,0),posts:frameworkChannels.reduce((n,row)=>n+row.posts,0),deliveries:frameworkChannels.reduce((n,row)=>n+row.deliveries,0),errors:[...frameworkErrors]});
async function closeFrameworkChannels(){
 assert.equal(pending.size,0);assert.equal(fixtures.size,0);assert.equal(opens.size,0);assert.equal(txs.size,0);assert.equal(connections.size,0);
 const end=Date.now()+6500;let quiet=0;
 while(quiet<2){if(Date.now()>=end)throw Error('Framework messages did not settle');await bounded(new Promise(resolve=>nativeTimers.setTimeout(resolve,10)),'Observe original framework message turn');const state=frameworkState();quiet=state.inflight===0?quiet+1:0;}
 assert.deepEqual(frameworkErrors,[]);frameworkRetired=true;
 for(const row of frameworkChannels)for(const port of row.ports)port.close();
 await bounded(Promise.all(frameworkChannels.flatMap(row=>row.closePromises)),'Native framework port close events');
 const state=frameworkState();assert.equal(state.inflight,0);assert.equal(state.closedPorts,state.created*2);assert.equal(state.posts,state.deliveries);assert.deepEqual(state.errors,[]);return state;
}
process.once('exit',code=>{
 if(code!==0||!terminalEvidence||unsafe||!report.fullSuite||pending.size||opens.size||txs.size||connections.size||fixtures.size||timers.size||intervals.size||index.active.size||frameworkState().inflight||frameworkState().closedPorts!==frameworkChannels.length*2||frameworkErrors.length||process.listenerCount('SIGTERM')||process.listenerCount('SIGINT'))return;
 try{writeFileSync(markerPath,JSON.stringify({schema:1,kind:'notes-workspace-stable-library-notes-natural-exit',naturalExit:true,exitCode:0,...terminalEvidence,framework:frameworkState()})+'\n',{flag:'wx',mode:0o600});}catch{process.exitCode=1;}
});
function observe(tx){if(txs.has(tx))return;txs.add(tx);follow(new Promise(r=>{tx.addEventListener('complete',()=>{txs.delete(tx);r();},{once:true});tx.addEventListener('abort',()=>{txs.delete(tx);nativeErrors.push(tx.error?.name??'native-abort');r();},{once:true});}));}
function observeIDB(){const original=factory.open;factory.open=function(...args){const r=Reflect.apply(original,this,args);opens.add(r);r.addEventListener('upgradeneeded',()=>observe(r.transaction),{once:true});r.addEventListener('error',()=>{opens.delete(r);nativeErrors.push(r.error?.name??'open-error');},{once:true});r.addEventListener('success',()=>{opens.delete(r);const db=r.result,close=db.close.bind(db),transaction=db.transaction.bind(db);connections.add(db);db.close=()=>{close();connections.delete(db);};db.transaction=(...a)=>{const tx=transaction(...a);observe(tx);return tx;};},{once:true});return r;};return()=>factory.open=original;}
function observeListeners(target){
 const add=target.addEventListener,remove=target.removeEventListener,types=new Set(['dowze:paper-document-changed','dowze:notebook-library-changed','focus','pagehide','visibilitychange']);
 target.addEventListener=function(type,listener,options){const capture=typeof options==='boolean'?options:!!options?.capture;if(types.has(type)&&!listenerRecords.some(row=>row.target===target&&row.type===type&&row.listener===listener&&row.capture===capture)){const row={target,type,listener,capture};listenerRecords.push(row);if(type==='dowze:paper-document-changed'){assert.equal(target,dom.window);assert.equal(capture,false);index.starts++;index.active.add(listener);}}return Reflect.apply(add,this,[type,listener,options]);};
 target.removeEventListener=function(type,listener,options){const capture=typeof options==='boolean'?options:!!options?.capture,i=listenerRecords.findIndex(row=>row.target===target&&row.type===type&&row.listener===listener&&row.capture===capture);if(i>=0){listenerRecords.splice(i,1);if(type==='dowze:paper-document-changed'){index.cleanups++;assert.equal(index.active.delete(listener),true);}}return Reflect.apply(remove,this,[type,listener,options]);};
 listenerRestorers.push(()=>{target.addEventListener=add;target.removeEventListener=remove;});
}
const scope=Object.freeze({accountId:'qa-stable-library-owner',spaceId:'year-one'}),foreign=Object.freeze({accountId:'qa-stable-library-foreign',spaceId:'year-one'}),stamp='2026-10-16T12:00:00.000Z';
const note=(id,title)=>Object.freeze({id,title,markdown:'',createdAt:stamp,updatedAt:stamp,tags:Object.freeze(['retained']),subjectIds:Object.freeze([])});
const initialNote=note('initial-note','Initial visible note'),freshNote=note('fresh-note','Second visible note'),initialDocuments=Object.freeze([initialNote]),freshDocuments=Object.freeze([initialNote,freshNote]);
async function inventory(){const rows=[];for(const owner of [scope,foreign]){const blobs=[];for(const {blob,...row}of await m.storage.listLocalBlobs(owner.accountId,owner.spaceId))blobs.push({...row,blobSize:blob.size,blobType:blob.type,blobSHA256:hash(new Uint8Array(await blob.arrayBuffer()))});rows.push({scope:owner,drafts:await m.storage.listDrafts(owner.accountId,owner.spaceId),mutations:await m.storage.listMutations(owner.accountId,owner.spaceId),snapshots:await m.storage.listSnapshots(owner.accountId,owner.spaceId),blobs});}return rows;}
async function seed(){
 for(const owner of [scope,foreign]){
  const plain=m.emptyNotebookLibrary();plain.updatedAt=stamp;plain.notes=Object.fromEntries([initialNote,freshNote].map(n=>[n.id,{folderId:null,favorite:false,deletedAt:null}]));const library=m.amendNotebookLibrary(plain,plain,JSON.stringify(owner));assert.equal(m.isNotebookLibrary(library),true);
  await m.storage.putDraft({...owner,type:'preferences',documentId:m.LIBRARY_DOCUMENT_ID,title:'Original library',content:library,baseVersion:3,updatedAt:1,syncState:'synced'});
  for(const [n,text]of [[initialNote,'Original canonical text without the unique term.'],[freshNote,'freshneedle from the retained second canonical graph.']]){const raw=m.migratePaper(n.id,text,null,stamp),content=m.amendPaperCollaboration(raw,raw);assert.equal(m.isPaperDocument(content),true);await m.storage.putDraft({...owner,type:'whiteboard',documentId:m.notebookDocumentId(n.id),title:n.title,content,baseVersion:4,updatedAt:1,syncState:'synced'});await m.storage.putDraft({...owner,type:'notesMarkdown',documentId:n.id,title:n.title,content:n,baseVersion:2,updatedAt:1,syncState:'synced'});}
  await m.storage.putDraft({...owner,type:'whiteboard',documentId:'whiteboard-main',title:'Original legacy source',content:{board:{strokes:[{id:'original-stroke',points:[{x:1,y:2}]}]},photos:[]},baseVersion:2,updatedAt:1,syncState:'synced'});
  const bytes=new Uint8Array([17,29,43,owner.accountId.length]);await m.storage.putLocalBlob({...owner,id:'source-bytes',documentId:m.notebookDocumentId(initialNote.id),blob:new Blob([bytes],{type:'application/octet-stream'}),name:'Original source.bin',createdAt:1,status:'uploaded',serverId:'source-server-id',sha256:hash(bytes)});
  await m.storage.queueMutation({...owner,id:'retained-mutation-'+owner.accountId,type:'notesMarkdown',documentId:initialNote.id,baseVersion:2,content:{retained:'original pending metadata'},createdAt:1,status:'pending'});await m.storage.putSnapshot({...owner,key:'retained-history|'+owner.accountId,value:{original:'prior graph and history',noteId:initialNote.id}});
 }
 expectedSources=await inventory();
}
const card=(f,id)=>[...f.container.querySelectorAll('[data-library-note-id]')].find(node=>node.dataset.libraryNoteId===id)??null;
async function ready(f){await wait(()=>{const lib=m.readLibrary(f.root),search=m.readLibrarySearch(f.root);return lib?.props.media===scope&&lib.state.library&&!lib.state.saving&&!lib.state.conflict&&!lib.state.error&&search?.state.ready&&search.state.source===m.readLibraryNavigation(f.root)?.source&&f.container.querySelector('.notebook-library')?.getAttribute('aria-busy')==='false';},'actual current-source index and classification ready');assert.equal(f.container.querySelectorAll('.notebook-library').length,1);assert.equal(f.container.querySelector('.paper-notebook'),null,'No active note/editor is mounted');}
async function render(f,documents,revision){active();await m.act(async()=>{f.root.render(m.createElement(m.StableLibraryNotesRecipe,{documents,media:scope,parentRevision:revision}));await tick();});await ready(f);assert.equal(f.container.querySelector('[data-parent-revision]')?.getAttribute('data-parent-revision'),String(revision),'The real parent controls rerendered');}
async function search(f,value){const input=f.container.querySelector('input[aria-label="Rechercher mes notes"]');assert.ok(input);await m.act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new dom.window.InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));await tick();});await wait(()=>m.readLibraryNavigation(f.root)?.view.query===value&&input.value===value,'actual controlled search input committed');await ready(f);}
async function cleanup(){
 if(m)await bounded(m.act(async()=>{await m.settleAllNotebookAccounts();await tick();}),'settle actual accepted notebook writers');
 for(const f of [...fixtures]){await bounded(m.act(async()=>{f.root.unmount();await tick();}),'unmount actual NotesWorkspace');f.container.remove();fixtures.delete(f);}
 if(m)m.resumeAllNotebookAccounts();await drain();
 if(expectedSources)assert.deepEqual(await bounded(inventory(),'entire original source inventory after unmount'),expectedSources,'Every original graph, metadata, legacy source, media byte, mutation and history row stays exact');
 await drain();assert.equal(opens.size,0);assert.equal(txs.size,0);assert.equal(connections.size,0);assert.deepEqual(nativeErrors,[]);assert.equal(intervals.size,0);assert.equal(timers.size,0);assert.equal(index.active.size,0);assert.equal(index.starts,index.cleanups);assert.equal(m?.hasPendingNotebookWrites()??false,false);
 assert.deepEqual(listenerRecords,listenerBaseline,'Exact pre-product listener identities remain and no product listener survives');assert.equal(document.querySelectorAll('.notebook-library,.paper-notebook').length,0);
}
async function runCase(){
 const row={name,status:'RUNNING',cleanup:'NOTRUN'};report.groups.push(row);
 try{
  await seed();const container=document.createElement('main');document.body.append(container);const f={container,root:m.createRoot(container)};fixtures.add(f);await render(f,initialDocuments,0);
  await wait(()=>!!card(f,m.LEGACY_NOTE_ID),'real listDrafts legacy discovery committed before baseline');await ready(f);
  await bounded(m.act(async()=>{await m.settleAllNotebookAccounts();m.resumeAllNotebookAccounts();await tick();}),'baseline writers terminal');await ready(f);await drain(true);
  assert.equal(card(f,freshNote.id),null,'Second graph is already durable but inaccessible before metadata admits it');assert.ok(card(f,initialNote.id));
  const notesRef=m.readLibrarySearch(f.root).props.notes,listener=[...index.active][0],baseline={starts:index.starts,cleanups:index.cleanups};assert.equal(index.active.size,1,'Only the real LibraryView owns this canonical index listener');assert.equal(baseline.starts,baseline.cleanups+1);
  for(const revision of [1,2,3]){await render(f,initialDocuments,revision);assert.deepEqual({starts:index.starts,cleanups:index.cleanups},baseline,'Unrelated real parent rerenders do not restart/cleanup the canonical index');assert.equal(m.readLibrarySearch(f.root).props.notes,notesRef,'Stable documents/legacy preserve the exact LibraryView notes reference');assert.deepEqual([...index.active],[listener],'The exact original canonical listener stays registered');}
  await search(f,'freshneedle');assert.equal(card(f,freshNote.id),null);assert.equal(card(f,initialNote.id),null,'Fixture metadata title/markdown/tags contain no unique canonical term');
  await render(f,freshDocuments,4);assert.notEqual(m.readLibrarySearch(f.root).props.notes,notesRef);assert.deepEqual({starts:index.starts,cleanups:index.cleanups},{starts:baseline.starts+1,cleanups:baseline.cleanups+1},'Actual changed document membership restarts the effect exactly once');assert.equal(index.active.size,1);assert.equal(index.active.has(listener),false,'The former source listener was actually removed');
  assert.ok(card(f,freshNote.id),'Newly accessible second canonical note is searchable through actual DOM');assert.equal(card(f,initialNote.id),null);assert.ok(card(f,freshNote.id).querySelectorAll('.note-library-search-hits button').length>0,'Fresh result comes from real canonical page content, not metadata');
  const indexed=m.readLibrarySearch(f.root).state.documents[freshNote.id],durable=expectedSources[0].drafts.find(d=>d.type==='whiteboard'&&d.documentId===m.notebookDocumentId(freshNote.id));assert.deepEqual(indexed,durable.content,'The real current index uses the retained exact canonical graph');assert.equal(f.container.querySelector('.notebook-library').getAttribute('aria-busy'),'false');
  row.observation={baselineStarts:baseline.starts,baselineCleanups:baseline.cleanups,stableParentRerenders:3,changedDocumentsStarts:index.starts-baseline.starts,changedDocumentsCleanups:index.cleanups-baseline.cleanups,uniqueActiveIndexListener:index.active.size,actualCanonicalHit:true};row.status='PASS';report.passed++;
 }catch(e){row.status='FAIL';row.error={name:e?.name??'Error',message:String(e?.message??e).split('\n')[0].slice(0,240),...(e&&'actual'in e?{actualSHA256:hash(JSON.stringify(e.actual)??'undefined')}:{}),...(e&&'expected'in e?{expectedSHA256:hash(JSON.stringify(e.expected)??'undefined')}:{})};report.failed++;}
}
try{
 const dir=resolve('tests/.notes-workspace-stable-library-notes-build');manifest=JSON.parse(await readFile(resolve(dir,'build-manifest.json'),'utf8'));assert.equal(manifest.kind,'actual-notes-workspace-stable-library-notes-build');assert.equal(manifest.repo,process.cwd());for(const r of manifest.inputs)assert.equal(hash(await readFile(r.path)),r.sha256);assert.equal(hash(await readFile(resolve(dir,manifest.output.path))),manifest.output.sha256);
 dom=new JSDOM('<!doctype html><body/>',{url:'https://stable-library-notes.invalid'});observeListeners(dom.window);observeListeners(dom.window.document);
 const selectorProbe=dom.window.document.createElement('button');dom.window.document.body.append(selectorProbe);selectorProbe.matches(':focus');dom.window.document.querySelectorAll('button:focus,button:focus-visible');selectorProbe.remove();listenerBaseline=[...listenerRecords];assert.ok(listenerBaseline.length>0);assert.equal(listenerBaseline.every(row=>row.target===dom.window&&row.type==='focus'&&row.capture===true),true);
 for(const [k,v]of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,HTMLInputElement:dom.window.HTMLInputElement,InputEvent:dom.window.InputEvent,Element:dom.window.Element,SVGElement:dom.window.SVGElement,Node:dom.window.Node,navigator:dom.window.navigator,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,indexedDB:factory,IDBKeyRange,crypto:webcrypto,addEventListener:dom.window.addEventListener.bind(dom.window),removeEventListener:dom.window.removeEventListener.bind(dom.window),dispatchEvent:dom.window.dispatchEvent.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true}))Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:v});Object.defineProperty(navigator,'onLine',{configurable:true,value:false});
 globalThis.setTimeout=(fn,ms,...args)=>{let id;id=nativeTimers.setTimeout(()=>{timers.delete(id);fn(...args);},ms);timers.add(id);return id;};globalThis.clearTimeout=id=>{timers.delete(id);return nativeTimers.clearTimeout(id);};globalThis.setInterval=(...a)=>{const id=nativeTimers.setInterval(...a);intervals.add(id);return id;};globalThis.clearInterval=id=>{intervals.delete(id);return nativeTimers.clearInterval(id);};
 installFrameworkChannels();restoreOpen=observeIDB();m=await bounded(import(pathToFileURL(resolve(dir,manifest.output.path))),'import actual NotesWorkspace and LibraryView');assert.equal(m.PAPER_SEARCH_DOCUMENT_CHANGED_EVENT,'dowze:paper-document-changed');
 await bounded(runCase(),name,35000,'body');
}catch(e){report.fatal={name:e?.name??'Error',message:String(e?.message??e).split('\n')[0].slice(0,240)};process.exitCode=1;}
finally{
 stopped=true;
 try{await drain();if(m){await cleanup();report.framework=await closeFrameworkChannels();await drain();}assert.equal(opens.size,0);assert.equal(txs.size,0);assert.equal(connections.size,0);assert.equal(fixtures.size,0);assert.equal(intervals.size,0);assert.equal(timers.size,0);report.cleanup={status:'PASS',pending:pending.size,opens:opens.size,transactions:txs.size,connections:connections.size,roots:fixtures.size,indexStarts:index.starts,indexCleanups:index.cleanups};if(report.groups[0])report.groups[0].cleanup='PASS';}catch(e){report.cleanup={status:'FAIL',errorType:e?.name??'Error',message:String(e?.message??e).split('\n')[0].slice(0,240)};if(report.groups[0])report.groups[0].cleanup='FAIL';process.exitCode=1;}
 unsafe=!!(pending.size||opens.size||txs.size||connections.size||fixtures.size||intervals.size||timers.size||index.active.size||frameworkState().inflight||frameworkState().closedPorts!==frameworkChannels.length*2);
 if(unsafe){console.error(JSON.stringify({status:'FATAL_STOP',finalReportWritten:false,pending:pending.size,opens:opens.size,transactions:txs.size,connections:connections.size,roots:fixtures.size,intervals:intervals.size,timers:timers.size,framework:frameworkState()}));process.exitCode=1;}
 else{restoreOpen?.();for(const restore of listenerRestorers)restore();dom?.window.close();for(const [key,value]of saved)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
}
if(!unsafe){
 if(manifest)try{for(const r of manifest.inputs)assert.equal(hash(await readFile(r.path)),r.sha256);}catch(e){report.fatal={name:e?.name??'Error',message:'Frozen source input changed'};process.exitCode=1;}
 if(!report.groups.length)report.groups.push({name,status:'NOTRUN',cleanup:'NOTRUN'});report.timeouts=deadlines;report.fullSuite=report.passed===1&&!report.failed&&!report.fatal&&report.cleanup.status==='PASS'&&!deadlines.length;
 const path=mountedAuditPath('notes-workspace-stable-library-notes-mounted-20261016.json');await mkdir(dirname(path),{recursive:true});report.activeResourceTypesAtFooter=process.getActiveResourcesInfo?.()??[];await writeFile(path,JSON.stringify(report,null,2)+'\n');markerPath=path+'.natural-exit.json';terminalEvidence={bodyReportSHA256:hash(await readFile(path)),buildManifestSHA256:hash(await readFile(resolve('tests/.notes-workspace-stable-library-notes-build/build-manifest.json'))),runnerSHA256:manifest?.inputs.find(row=>row.path.endsWith('/tests/run-notes-workspace-stable-library-notes.mjs'))?.sha256};console.log(JSON.stringify({passed:report.passed,failed:report.failed,fullSuite:report.fullSuite,cleanup:report.cleanup.status,report:path}));if(!report.fullSuite)process.exitCode=1;
}
