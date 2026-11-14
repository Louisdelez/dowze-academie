import {mountedCleanup,requireBoundedMountedCheck,mountedAuditPath} from './mounted-cleanup.mjs';
requireBoundedMountedCheck();
const [{build},{JSDOM},{IDBFactory,IDBKeyRange},{default:assert},{mkdtemp,rm,mkdir,readFile,writeFile},{join,dirname},{pathToFileURL},{createHash}]=await Promise.all([import('vite'),import('jsdom'),import('fake-indexeddb'),import('node:assert/strict'),import('node:fs/promises'),import('node:path'),import('node:url'),import('node:crypto')]);
const startedAt=new Date().toISOString(),previousNodeEnv=process.env.NODE_ENV,out=await mkdtemp(join(process.cwd(),'tests/.notebook-library-navigation-')),nativeTimeout=globalThis.setTimeout,nativeClear=globalThis.clearTimeout,nativeInterval=globalThis.setInterval,nativeClearInterval=globalThis.clearInterval;
const globalNames=['window','document','HTMLElement','Element','SVGElement','Node','Event','CustomEvent','navigator','indexedDB','IDBKeyRange','addEventListener','removeEventListener','dispatchEvent','setInterval','clearInterval','IS_REACT_ACT_ENVIRONMENT'],originals=new Map(globalNames.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
const {notebookLibraryNavigationGroupNames:declaredGroupNames,runNotebookLibraryNavigationCases}=await import('./notebook-library-navigation-cases.mjs');
const fixtures=new Set(),intervals=new Set(),scopes=new Map(),proof=[],sourceHashes={},storageRestores=[];let dom,m,passed=0,failed=0,groupsStarted=0,fatal=null,cleanupFinal='NOTRUN',sequence=0,deadline,bodyTask,stopped=false;
const errorDetail=error=>({name:error?.name,message:String(error?.message??error).split('\n')[0].slice(0,300),operator:error?.operator,...(error&&'actual'in error?{actualSha256:createHash('sha256').update(JSON.stringify(error.actual)??'undefined').digest('hex')}:{ }),...(error&&'expected'in error?{expectedSha256:createHash('sha256').update(JSON.stringify(error.expected)??'undefined').digest('hex')}:{ }),at:String(error?.stack??'').split('\n').filter(line=>/^\s+at /.test(line)).slice(0,4)});
const active=()=>{if(stopped)throw Error('Library navigation recipe admission has ended');};
const tick=()=>new Promise(resolve=>nativeTimeout(resolve,10));
const wait=async(check,label)=>{for(let attempt=0;attempt<100;attempt++){active();await m.act(tick);if(check())return;}throw Error(label+' did not settle');};
const scopeFor=label=>({accountId:'qa-sort-'+label+'-'+ ++sequence,spaceId:'year-one'});
const rows=()=>Object.freeze([
 Object.freeze({id:'z',title:'Zèbre',markdown:'CANONICAL:z',updatedAt:'2026-10-15T10:00:00Z'}),
 Object.freeze({id:'b',title:'École',markdown:'CANONICAL:b',updatedAt:'2026-10-15T12:00:00+02:00'}),
 Object.freeze({id:'o',title:'Œuvre',markdown:'CANONICAL:o',updatedAt:'2026-10-15T10:00:00Z'}),
 Object.freeze({id:'a',title:'E\u0301COLE',markdown:'CANONICAL:a',updatedAt:'2026-10-15T10:00:00Z'}),
 Object.freeze({id:'c',title:'ecole',markdown:'CANONICAL:c',updatedAt:'2026-10-15T10:00:00Z'})
]);
const sortSelect=f=>f.container.querySelector('select[aria-label="Trier les notes"]');
const cardIds=f=>[...f.container.querySelectorAll('.note-card-preview')].map(node=>node.textContent.replace('CANONICAL:',''));
const canonical=async scope=>JSON.stringify({drafts:await m.storage.listDrafts(scope.accountId,scope.spaceId),snapshots:await m.storage.listSnapshots(scope.accountId,scope.spaceId),mutations:await m.storage.listMutations(scope.accountId,scope.spaceId),blobs:await m.storage.listLocalBlobs(scope.accountId,scope.spaceId)});
const seed=async(scope,notes,library)=>{
 const key=JSON.stringify([scope.accountId,scope.spaceId]);if(scopes.has(key))return;
 await m.storage.putDraft({...scope,type:'preferences',documentId:m.LIBRARY_DOCUMENT_ID,title:'Bibliothèque conservée',content:{...(library??m.emptyNotebookLibrary()),updatedAt:'2026-10-15T10:00:00Z'},baseVersion:7,updatedAt:1760522400000,syncState:'synced'});
 for(const note of notes)await m.storage.putDraft({...scope,type:'notesMarkdown',documentId:note.id,title:note.title,content:{markdown:note.markdown},baseVersion:3,updatedAt:Date.parse(note.updatedAt),syncState:'synced'});
 await m.storage.putSnapshot({accountId:scope.accountId,spaceId:scope.spaceId,key:'qa-sort-original|'+key,value:{marker:'Unchanged original'}});
 scopes.set(key,{scope,before:await canonical(scope)});
};
const unchanged=async()=>{for(const {scope,before} of scopes.values())assert.equal(await canonical(scope),before,'Sorting must not alter any canonical draft, library, snapshot, mutation or media');};
const patchStorage=(target,key,value)=>{const old=Object.getOwnPropertyDescriptor(target,key);Object.defineProperty(target,key,{configurable:true,writable:true,value});storageRestores.push(()=>old?Object.defineProperty(target,key,old):delete target[key]);};
const restoreStorage=()=>{while(storageRestores.length)storageRestores.pop()();};
const mount=async({scope=scopeFor('library'),notes=rows(),probe=false,strict=false,library}={})=>{
 active();if(!probe)await seed(scope,notes,library);active();
 const container=document.createElement('div');document.body.append(container);const root=m.createRoot(container),fixture={container,root,scope,notes,probe,strict,live:true,commits:[],opened:[],handles:[]};
 fixture.render=async patch=>{active();Object.assign(fixture,patch);await m.act(async()=>{active();const child=fixture.probe?m.createElement(m.NavigationProbe,{scope:fixture.scope,onCommit:handle=>{fixture.handle=handle;fixture.handles.push(handle);fixture.commits.push({accountId:fixture.scope.accountId,spaceId:fixture.scope.spaceId,view:handle.view});}}):m.createElement(m.LibraryRoute,{notes:fixture.notes,scope:fixture.scope,onOpen:id=>fixture.opened.push(id)});root.render(fixture.strict?m.createElement(m.StrictMode,null,child):child);await tick();});};
 fixtures.add(fixture);await fixture.render({});if(!probe)await wait(()=>fixture.container.querySelector('.notebook-library')?.getAttribute('aria-busy')==='false','Real library and initial source search ready');return fixture;
};
const dispose=async fixture=>{if(fixture.live){await m.act(async()=>{fixture.root.unmount();await tick();});fixture.live=false;}fixture.container.remove();};
const choose=async(fixture,value)=>{active();const select=sortSelect(fixture);assert.ok(select,'The real library sort control must exist');await m.act(async()=>{active();select.value=value;select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await tick();});assert.equal(sortSelect(fixture).value,value);};
const click=async node=>{active();assert.ok(node,'The requested actual UI button must exist');await m.act(async()=>{active();node.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));await tick();});};
const clean=()=>mountedCleanup([
 ['Restore storage error seams',restoreStorage],
 ['Unmount all real libraries and hook probes',async()=>{for(const fixture of fixtures)await dispose(fixture);}],
 ['Retained hook callbacks are inert',()=>{for(const fixture of fixtures)for(const handle of fixture.handles){assert.equal(handle.current(),false);assert.equal(handle.patch({mode:'list'}),false);assert.equal(handle.checkpoint(),false);}fixtures.clear();}],
 ['Canonical data and library polling',async()=>{await unchanged();assert.equal(intervals.size,0,'Library synchronization intervals must all be stopped');assert.equal(document.querySelectorAll('.notebook-library').length,0);}]
],5000);
const group=async(name,work)=>{active();groupsStarted++;const row={name,status:'RUNNING',cleanup:{status:'NOTRUN'}};proof.push(row);try{await work();active();passed++;row.status='PASS';}catch(error){failed++;row.status='FAIL';row.error=errorDetail(error);}finally{try{await clean();row.cleanup={status:'PASS'};}catch(error){if(row.status==='PASS'){row.bodyStatus='PASS';passed--;failed++;}row.status='FAIL';row.cleanup={status:'FAIL',error:errorDetail(error)};throw error;}}};
try{
 process.env.NODE_ENV='development';
 await build({configFile:false,build:{ssr:'tests/notebook-library-navigation-entry.tsx',outDir:out,copyPublicDir:false,minify:false,sourcemap:false,reportCompressedSize:false,rollupOptions:{preserveEntrySignatures:'strict',output:{entryFileNames:'library-navigation.mjs'}}},logLevel:'error'});
 dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://qa.invalid/'});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,SVGElement:dom.window.SVGElement,Node:dom.window.Node,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,indexedDB:new IDBFactory(),IDBKeyRange,addEventListener:dom.window.addEventListener.bind(dom.window),removeEventListener:dom.window.removeEventListener.bind(dom.window),dispatchEvent:dom.window.dispatchEvent.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true});
 Object.defineProperty(globalThis,'navigator',{configurable:true,writable:true,value:dom.window.navigator});Object.defineProperty(dom.window.navigator,'onLine',{configurable:true,value:false});
 globalThis.setInterval=(callback,delay,...args)=>{const timer=nativeInterval(callback,delay,...args);intervals.add(timer);return timer;};globalThis.clearInterval=timer=>{intervals.delete(timer);nativeClearInterval(timer);};
 for(const path of ['src/lib/notebookLibraryViewState.ts','src/hooks/useNotebookLibraryView.ts','src/lib/notebookLibrarySort.ts','src/hooks/useNotebookLibrarySort.ts','src/components/NotebookLibraryView.tsx','src/hooks/useNotebookLibrary.ts','tests/notebook-library-navigation-cases.mjs'])sourceHashes[path]=createHash('sha256').update(await readFile(join(process.cwd(),path))).digest('hex');
 m=await import(pathToFileURL(join(out,'library-navigation.mjs')));
 const body=()=>runNotebookLibraryNavigationCases({group,m,mount,dispose,click,wait,choose,scopeFor,cardIds,canonical,unchanged,patchStorage,restoreStorage,tick,dom,assert});
 bodyTask=body();await Promise.race([bodyTask,new Promise((_,reject)=>{deadline=nativeTimeout(()=>{stopped=true;reject(Error('Library navigation fixture deadline exceeded'));},180000);})]);
}catch(error){fatal=errorDetail(error);process.exitCode=1;}
finally{
 stopped=true;nativeClear(deadline);
 try{await mountedCleanup([
  ['Drain the admitted recipe body',()=>bodyTask?.catch(()=>{})],
  ['Final fixture cleanup',()=>m&&dom?clean():restoreStorage()],
  ['Stop retained intervals',()=>{for(const timer of intervals)nativeClearInterval(timer);intervals.clear();}],
  ['Close DOM',()=>dom?.window.close()],
  ['Restore original globals',()=>{for(const name of globalNames){const original=originals.get(name);if(original)Object.defineProperty(globalThis,name,original);else delete globalThis[name];}if(previousNodeEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previousNodeEnv;}],
  ['Remove private fixture bundle',()=>rm(out,{recursive:true,force:true})]
 ],5000);cleanupFinal='PASS';}catch(error){cleanupFinal='FAIL';fatal={prior:fatal,cleanup:errorDetail(error)};process.exitCode=1;}
 for(const name of declaredGroupNames.slice(groupsStarted))proof.push({name,status:'NOTRUN',reason:'An earlier setup, deadline or cleanup failure stopped the full recipe'});
 const allGroupsAttempted=groupsStarted===declaredGroupNames.length,report={startedAt,finishedAt:new Date().toISOString(),declaredGroups:declaredGroupNames.length,groupsStarted,passed,failed,notRun:proof.filter(row=>row.status==='NOTRUN').length,allGroupsAttempted,fullSuite:allGroupsAttempted&&!fatal&&failed===0&&cleanupFinal==='PASS'&&proof.every(row=>row.status==='PASS'&&row.cleanup?.status==='PASS'),cleanupFinal,fatal,groups:proof,sourceHashes,evidenceScope:'JSDOM real shared NotebookLibraryView/hooks and production storage on fakeIndexedDB; explicit synthetic rectangles and scroll positions, localStorage failure seams and controlled note-route unmount/remount. No native layout, full application, browser reload, cloud synchronization or physical-device claim.'};
 const reportPath=mountedAuditPath('n005-n006-library-navigation-mounted-20261015.json');await mkdir(dirname(reportPath),{recursive:true});await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed,failed,notRun:report.notRun,cleanupFinal,fullSuite:report.fullSuite}));if(failed||fatal||!allGroupsAttempted||cleanupFinal!=='PASS')process.exitCode=1;
}
