import {mountedCleanup,requireBoundedMountedCheck,mountedAuditPath} from './mounted-cleanup.mjs';
requireBoundedMountedCheck();
const [{build},{JSDOM},{IDBFactory,IDBKeyRange},{default:assert},{mkdtemp,rm,mkdir,readFile,writeFile},{join,dirname},{pathToFileURL},{createHash}]=await Promise.all([import('vite'),import('jsdom'),import('fake-indexeddb'),import('node:assert/strict'),import('node:fs/promises'),import('node:path'),import('node:url'),import('node:crypto')]);
const startedAt=new Date().toISOString(),previousNodeEnv=process.env.NODE_ENV,out=await mkdtemp(join(process.cwd(),'tests/.notebook-library-export-ui-')),nativeTimeout=globalThis.setTimeout,nativeClear=globalThis.clearTimeout,nativeInterval=globalThis.setInterval,nativeClearInterval=globalThis.clearInterval;
const globalNames=['window','document','HTMLElement','Element','SVGElement','Node','Event','CustomEvent','navigator','indexedDB','IDBKeyRange','addEventListener','removeEventListener','dispatchEvent','setInterval','clearInterval','IS_REACT_ACT_ENVIRONMENT'],originals=new Map(globalNames.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
const {notebookLibraryExportUIGroupNames:declaredGroupNames,runNotebookLibraryExportUICases}=await import('./notebook-library-export-ui-cases.mjs');
const sourcePaths=['src/components/NotebookLibraryView.tsx','src/components/notebook-library.css','src/hooks/useNotebookLibrary.ts','src/hooks/useNotebookLibraryView.ts','src/hooks/useNotebookLibrarySort.ts','src/lib/notebookLibraryViewState.ts','src/lib/notebookLibrarySort.ts','pwa/src/storage.ts','tests/mounted-cleanup.mjs','tests/notebook-library-export-ui-entry.tsx','tests/notebook-library-export-ui-cases.mjs','tests/run-notebook-library-export-ui.mjs'];
const pendingExports=new Set(),fixtures=new Set(),intervals=new Set(),scopes=new Map(),proof=[],sourceHashes={};let dom,m,passed=0,failed=0,groupsStarted=0,fatal=null,cleanupFinal='NOTRUN',sequence=0,deadline,bodyTask,stopped=false;
const errorDetail=error=>({name:error?.name,message:String(error?.message??error).split('\n')[0].slice(0,300),operator:error?.operator,...(error&&'actual'in error?{actualSha256:createHash('sha256').update(JSON.stringify(error.actual)??'undefined').digest('hex')}:{ }),...(error&&'expected'in error?{expectedSha256:createHash('sha256').update(JSON.stringify(error.expected)??'undefined').digest('hex')}:{ }),at:String(error?.stack??'').split('\n').filter(line=>/^\s+at /.test(line)).slice(0,4)});
const active=()=>{if(stopped)throw Error('Library export UI recipe admission has ended');};
const tick=()=>new Promise(resolve=>nativeTimeout(resolve,10));
const wait=async(check,label)=>{for(let attempt=0;attempt<100;attempt++){active();await m.act(tick);if(check())return;}throw Error(label+' did not settle');};
const scopeFor=label=>({accountId:'qa-ui-export-'+label+'-'+ ++sequence,spaceId:'year-one'});
const rows=()=>['a','b','c'].map(id=>({id,title:'Note '+id,markdown:'CANONICAL:'+id,updatedAt:'2026-10-15T10:00:00Z'}));
const canonical=async scope=>JSON.stringify({drafts:await m.storage.listDrafts(scope.accountId,scope.spaceId),snapshots:await m.storage.listSnapshots(scope.accountId,scope.spaceId),mutations:await m.storage.listMutations(scope.accountId,scope.spaceId),blobs:await m.storage.listLocalBlobs(scope.accountId,scope.spaceId)});
const seed=async(input,notes,library)=>{const scope={accountId:input.accountId,spaceId:input.spaceId};
 const key=JSON.stringify([scope.accountId,scope.spaceId]);if(scopes.has(key))return;
 await m.storage.putDraft({...scope,type:'preferences',documentId:m.LIBRARY_DOCUMENT_ID,title:'Bibliothèque conservée',content:{...(library??m.emptyNotebookLibrary()),updatedAt:'2026-10-15T10:00:00Z'},baseVersion:7,updatedAt:1760522400000,syncState:'synced'});
 for(const note of notes)await m.storage.putDraft({...scope,type:'notesMarkdown',documentId:note.id,title:note.title,content:{markdown:note.markdown},baseVersion:3,updatedAt:Date.parse(note.updatedAt),syncState:'synced'});
 await m.storage.putSnapshot({accountId:scope.accountId,spaceId:scope.spaceId,key:'qa-ui-export-original|'+key,value:{marker:'Unchanged original'}});
 scopes.set(key,{scope,before:await canonical(scope)});
};
const unchanged=async()=>{for(const {scope,before} of scopes.values())assert.equal(await canonical(scope),before,'The UI export contract must not alter any canonical draft, library, snapshot, mutation or media');};
const createExportJobs=label=>{const jobs=[];return {jobs,callback:ids=>{assert.ok(Array.isArray(ids),'The real UI callback receives a readonly ID array');let resolve,reject;const raw=new Promise((yes,no)=>{resolve=yes;reject=no;}),job={label,ids,resolve,reject,settled:false,promise:null};job.promise=raw.finally(()=>{job.settled=true;pendingExports.delete(job);});void job.promise.catch(()=>{});pendingExports.add(job);jobs.push(job);return job.promise;}};};
const mount=async({scope=scopeFor('library'),notes=rows(),strict=false,library,onExport}={})=>{
 active();const container=document.createElement('div');document.body.append(container);const root=m.createRoot(container),fixture={container,root,scope,notes,strict,library,onExport,live:true};
 fixture.render=async patch=>{active();Object.assign(fixture,patch);await seed(fixture.scope,fixture.notes,fixture.library);active();await m.act(async()=>{active();const child=m.createElement(m.NotebookLibraryView,{notes:fixture.notes,media:fixture.scope,onCreate:()=>{},onOpen:()=>{},onExport:fixture.onExport});root.render(fixture.strict?m.createElement(m.StrictMode,null,child):child);await tick();});await wait(()=>fixture.container.querySelector('.notebook-library')?.getAttribute('aria-busy')==='false','Actual library source/index ready');};
 fixtures.add(fixture);await fixture.render({});return fixture;
};
const dispose=async fixture=>{if(fixture.live){await m.act(async()=>{fixture.root.unmount();await tick();});fixture.live=false;}fixture.container.remove();};
const click=async node=>{active();assert.ok(node,'The requested actual UI button must exist');await m.act(async()=>{active();node.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));await tick();});};
const clean=()=>mountedCleanup([
 ['Settle every accepted callback Promise and its actual UI awaiter',async()=>{await m.act(async()=>{for(const job of [...pendingExports])job.resolve(false);await Promise.allSettled([...pendingExports].map(job=>job.promise));await tick();});assert.equal(pendingExports.size,0,'No accepted callback is left pending');}],
 ['Unmount all real libraries',async()=>{for(const fixture of fixtures)await dispose(fixture);}],
 ['No mounted UI remains',()=>{fixtures.clear();assert.equal(document.querySelectorAll('.notebook-library').length,0);}],
 ['Canonical data and library polling',async()=>{await unchanged();assert.equal(intervals.size,0,'Library synchronization intervals must all be stopped');assert.equal(document.querySelectorAll('.notebook-library').length,0);}]
],5000);
const group=async(name,work)=>{active();groupsStarted++;const row={name,status:'RUNNING',cleanup:{status:'NOTRUN'}};proof.push(row);try{await work();active();passed++;row.status='PASS';}catch(error){failed++;row.status='FAIL';row.error=errorDetail(error);}finally{try{await clean();row.cleanup={status:'PASS'};}catch(error){if(row.status==='PASS'){row.bodyStatus='PASS';passed--;failed++;}row.status='FAIL';row.cleanup={status:'FAIL',error:errorDetail(error)};throw error;}}};
try{
 process.env.NODE_ENV='development';
 await build({configFile:false,build:{ssr:'tests/notebook-library-export-ui-entry.tsx',outDir:out,copyPublicDir:false,minify:false,sourcemap:false,reportCompressedSize:false,rollupOptions:{preserveEntrySignatures:'strict',output:{entryFileNames:'library-export-ui.mjs'}}},logLevel:'error'});
 dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://qa.invalid/'});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,SVGElement:dom.window.SVGElement,Node:dom.window.Node,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,indexedDB:new IDBFactory(),IDBKeyRange,addEventListener:dom.window.addEventListener.bind(dom.window),removeEventListener:dom.window.removeEventListener.bind(dom.window),dispatchEvent:dom.window.dispatchEvent.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true});
 Object.defineProperty(globalThis,'navigator',{configurable:true,writable:true,value:dom.window.navigator});Object.defineProperty(dom.window.navigator,'onLine',{configurable:true,value:false});
 globalThis.setInterval=(callback,delay,...args)=>{const timer=nativeInterval(callback,delay,...args);intervals.add(timer);return timer;};globalThis.clearInterval=timer=>{intervals.delete(timer);nativeClearInterval(timer);};
 for(const path of sourcePaths)sourceHashes[path]=createHash('sha256').update(await readFile(join(process.cwd(),path))).digest('hex');
 m=await import(pathToFileURL(join(out,'library-export-ui.mjs')));
 const body=()=>runNotebookLibraryExportUICases({group,m,mount,dispose,click,wait,tick,scopeFor,createExportJobs,assert});
 bodyTask=body();await Promise.race([bodyTask,new Promise((_,reject)=>{deadline=nativeTimeout(()=>{stopped=true;reject(Error('Library export UI fixture deadline exceeded'));},180000);})]);
}catch(error){fatal=errorDetail(error);process.exitCode=1;}
finally{
 stopped=true;nativeClear(deadline);
 try{await mountedCleanup([
  ['Drain the admitted recipe body',()=>bodyTask?.catch(()=>{})],
  ['Final fixture cleanup',()=>m&&dom?clean():undefined],
  ['Stop retained intervals',()=>{for(const timer of intervals)nativeClearInterval(timer);intervals.clear();}],
  ['Close DOM',()=>dom?.window.close()],
  ['Restore original globals',()=>{for(const name of globalNames){const original=originals.get(name);if(original)Object.defineProperty(globalThis,name,original);else delete globalThis[name];}if(previousNodeEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previousNodeEnv;}],
  ['Remove private fixture bundle',()=>rm(out,{recursive:true,force:true})]
 ],5000);cleanupFinal='PASS';}catch(error){cleanupFinal='FAIL';fatal={prior:fatal,cleanup:errorDetail(error)};process.exitCode=1;}
 let sourceHashesStable=false;try{for(const path of sourcePaths)assert.equal(createHash('sha256').update(await readFile(join(process.cwd(),path))).digest('hex'),sourceHashes[path],'The exact UI/storage/recipe source must remain frozen through cleanup: '+path);sourceHashesStable=true;}catch(error){fatal={prior:fatal,freeze:errorDetail(error)};process.exitCode=1;}
 for(const name of declaredGroupNames.slice(groupsStarted))proof.push({name,status:'NOTRUN',reason:'An earlier setup, deadline or cleanup failure stopped the full recipe'});
 const allGroupsAttempted=groupsStarted===declaredGroupNames.length,report={startedAt,finishedAt:new Date().toISOString(),declaredGroups:declaredGroupNames.length,groupsStarted,passed,failed,notRun:proof.filter(row=>row.status==='NOTRUN').length,allGroupsAttempted,fullSuite:allGroupsAttempted&&!fatal&&failed===0&&sourceHashesStable&&pendingExports.size===0&&cleanupFinal==='PASS'&&proof.every(row=>row.status==='PASS'&&row.cleanup?.status==='PASS'),cleanupFinal,fatal,sourceHashesStable,pendingAcceptedCallbacks:pendingExports.size,groups:proof,sourceHashes,evidenceScope:'JSDOM actual shared LibraryView, committed DOM callbacks and production storage on fakeIndexedDB. The async onExport callback is an explicitly observed/deferred parent oracle; read-only React state observes selection-array identity. No real bundle/archive/save dialog, full App/authentication, native browser/filesystem or device claim.'};
 const reportPath=mountedAuditPath('n010-library-export-ui-mounted-20261015.json');await mkdir(dirname(reportPath),{recursive:true});await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed,failed,notRun:report.notRun,cleanupFinal,fullSuite:report.fullSuite}));if(failed||fatal||!allGroupsAttempted||cleanupFinal!=='PASS')process.exitCode=1;
}
