import {mountedCleanup,requireBoundedMountedCheck,mountedAuditPath} from './mounted-cleanup.mjs';
requireBoundedMountedCheck();
const [{build},{JSDOM},{IDBFactory,IDBKeyRange},{default:assert},{mkdtemp,rm,mkdir,readFile,writeFile},{join,dirname},{pathToFileURL},{createHash}]=await Promise.all([import('vite'),import('jsdom'),import('fake-indexeddb'),import('node:assert/strict'),import('node:fs/promises'),import('node:path'),import('node:url'),import('node:crypto')]);
const startedAt=new Date().toISOString(),previousNodeEnv=process.env.NODE_ENV,out=await mkdtemp(join(process.cwd(),'tests/.notebook-library-sort-')),nativeTimeout=globalThis.setTimeout,nativeClear=globalThis.clearTimeout,nativeInterval=globalThis.setInterval,nativeClearInterval=globalThis.clearInterval;
const globalNames=['window','document','HTMLElement','Element','SVGElement','Node','Event','CustomEvent','navigator','indexedDB','IDBKeyRange','addEventListener','removeEventListener','dispatchEvent','setInterval','clearInterval','IS_REACT_ACT_ENVIRONMENT'],originals=new Map(globalNames.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
const declaredGroupNames=[
 'The real library UI deterministically sorts equal dates and accented titles without canonical writes',
 'Opening the controlled note route and returning remounts the real library with its saved order',
 'Observed account and space transitions read only the exact key before committing their choice',
 'Old account and API A-B-A setters never write, while the fresh setter remains usable',
 'A refused local write keeps a visible session-only choice across remount, then retries honestly',
 'Denied reads and malformed preferences show a fallback without overwriting the setting',
 'Strict replay remains usable and unmounted callbacks cannot change any setting'
];
const fixtures=new Set(),intervals=new Set(),scopes=new Map(),proof=[],sourceHashes={},storageRestores=[];let dom,m,passed=0,failed=0,groupsStarted=0,fatal=null,cleanupFinal='NOTRUN',sequence=0,deadline,bodyTask,stopped=false;
const errorDetail=error=>({name:error?.name,message:String(error?.message??error).split('\n')[0].slice(0,300),operator:error?.operator,...(error&&'actual'in error?{actualSha256:createHash('sha256').update(JSON.stringify(error.actual)??'undefined').digest('hex')}:{ }),...(error&&'expected'in error?{expectedSha256:createHash('sha256').update(JSON.stringify(error.expected)??'undefined').digest('hex')}:{ }),at:String(error?.stack??'').split('\n').filter(line=>/^\s+at /.test(line)).slice(0,4)});
const active=()=>{if(stopped)throw Error('Library sort recipe admission has ended');};
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
const seed=async(scope,notes)=>{
 const key=JSON.stringify([scope.accountId,scope.spaceId]);if(scopes.has(key))return;
 await m.storage.putDraft({...scope,type:'preferences',documentId:m.LIBRARY_DOCUMENT_ID,title:'Bibliothèque conservée',content:{...m.emptyNotebookLibrary(),updatedAt:'2026-10-15T10:00:00Z'},baseVersion:7,updatedAt:1760522400000,syncState:'synced'});
 for(const note of notes)await m.storage.putDraft({...scope,type:'notesMarkdown',documentId:note.id,title:note.title,content:{markdown:note.markdown},baseVersion:3,updatedAt:Date.parse(note.updatedAt),syncState:'synced'});
 await m.storage.putSnapshot({accountId:scope.accountId,spaceId:scope.spaceId,key:'qa-sort-original|'+key,value:{marker:'Unchanged original'}});
 scopes.set(key,{scope,before:await canonical(scope)});
};
const unchanged=async()=>{for(const {scope,before} of scopes.values())assert.equal(await canonical(scope),before,'Sorting must not alter any canonical draft, library, snapshot, mutation or media');};
const patchStorage=(target,key,value)=>{const old=Object.getOwnPropertyDescriptor(target,key);Object.defineProperty(target,key,{configurable:true,writable:true,value});storageRestores.push(()=>old?Object.defineProperty(target,key,old):delete target[key]);};
const restoreStorage=()=>{while(storageRestores.length)storageRestores.pop()();};
const mount=async({scope=scopeFor('library'),notes=rows(),probe=false,strict=false}={})=>{
 active();if(!probe)await seed(scope,notes);active();
 const container=document.createElement('div');document.body.append(container);const root=m.createRoot(container),fixture={container,root,scope,notes,probe,strict,live:true,commits:[],opened:[],handles:[]};
 fixture.render=async patch=>{active();Object.assign(fixture,patch);await m.act(async()=>{active();const child=fixture.probe?m.createElement(m.SortProbe,{scope:fixture.scope,onCommit:handle=>{fixture.handle=handle;fixture.handles.push(handle);fixture.commits.push({accountId:fixture.scope.accountId,spaceId:fixture.scope.spaceId,sort:handle.sort});}}):m.createElement(m.LibraryRoute,{notes:fixture.notes,scope:fixture.scope,onOpen:id=>fixture.opened.push(id)});root.render(fixture.strict?m.createElement(m.StrictMode,null,child):child);await tick();});};
 fixtures.add(fixture);await fixture.render({});if(!probe)await wait(()=>cardIds(fixture).length===notes.length,'Real library cards');return fixture;
};
const dispose=async fixture=>{if(fixture.live){await m.act(async()=>{fixture.root.unmount();await tick();});fixture.live=false;}fixture.container.remove();};
const choose=async(fixture,value)=>{active();const select=sortSelect(fixture);assert.ok(select,'The real library sort control must exist');await m.act(async()=>{active();select.value=value;select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await tick();});assert.equal(sortSelect(fixture).value,value);};
const click=async node=>{active();assert.ok(node,'The requested actual UI button must exist');await m.act(async()=>{active();node.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));await tick();});};
const clean=()=>mountedCleanup([
 ['Restore storage error seams',restoreStorage],
 ['Unmount all real libraries and hook probes',async()=>{for(const fixture of fixtures)await dispose(fixture);}],
 ['Retained hook callbacks are inert',()=>{for(const fixture of fixtures)for(const handle of fixture.handles){assert.equal(handle.current(),false);assert.equal(handle.setSort('title'),false);}fixtures.clear();}],
 ['Canonical data and library polling',async()=>{await unchanged();assert.equal(intervals.size,0,'Library synchronization intervals must all be stopped');assert.equal(document.querySelectorAll('.notebook-library').length,0);}]
],5000);
const group=async(name,work)=>{active();groupsStarted++;const row={name,status:'RUNNING',cleanup:{status:'NOTRUN'}};proof.push(row);try{await work();active();passed++;row.status='PASS';}catch(error){failed++;row.status='FAIL';row.error=errorDetail(error);}finally{try{await clean();row.cleanup={status:'PASS'};}catch(error){if(row.status==='PASS'){row.bodyStatus='PASS';passed--;failed++;}row.status='FAIL';row.cleanup={status:'FAIL',error:errorDetail(error)};throw error;}}};
try{
 process.env.NODE_ENV='development';
 await build({configFile:false,build:{ssr:'tests/notebook-library-sort-entry.tsx',outDir:out,copyPublicDir:false,minify:false,sourcemap:false,reportCompressedSize:false,rollupOptions:{preserveEntrySignatures:'strict',output:{entryFileNames:'library-sort.mjs'}}},logLevel:'error'});
 dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://qa.invalid/'});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,SVGElement:dom.window.SVGElement,Node:dom.window.Node,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,indexedDB:new IDBFactory(),IDBKeyRange,addEventListener:dom.window.addEventListener.bind(dom.window),removeEventListener:dom.window.removeEventListener.bind(dom.window),dispatchEvent:dom.window.dispatchEvent.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true});
 Object.defineProperty(globalThis,'navigator',{configurable:true,writable:true,value:dom.window.navigator});Object.defineProperty(dom.window.navigator,'onLine',{configurable:true,value:false});
 globalThis.setInterval=(callback,delay,...args)=>{const timer=nativeInterval(callback,delay,...args);intervals.add(timer);return timer;};globalThis.clearInterval=timer=>{intervals.delete(timer);nativeClearInterval(timer);};
 for(const path of ['src/lib/notebookLibrarySort.ts','src/hooks/useNotebookLibrarySort.ts','src/components/NotebookLibraryView.tsx','src/components/NotesWorkspace.tsx','pwa/src/App.tsx','src/lib/appStorage.ts'])sourceHashes[path]=createHash('sha256').update(await readFile(join(process.cwd(),path))).digest('hex');
 m=await import(pathToFileURL(join(out,'library-sort.mjs')));
 const body=async()=>{
  await group(declaredGroupNames[0],async()=>{
   const fixture=await mount(),before=JSON.stringify(fixture.notes);assert.deepEqual(cardIds(fixture),['a','b','c','o','z']);await choose(fixture,'title');assert.deepEqual(cardIds(fixture),['c','a','b','o','z']);await fixture.render({notes:[...fixture.notes].reverse()});assert.deepEqual(cardIds(fixture),['c','a','b','o','z']);await choose(fixture,'updated');assert.deepEqual(cardIds(fixture),['a','b','c','o','z']);assert.equal(JSON.stringify([...fixture.notes].reverse()),before);await unchanged();
  });
  await group(declaredGroupNames[1],async()=>{
   const fixture=await mount();await choose(fixture,'title');assert.equal(JSON.parse(window.localStorage.getItem(m.notebookLibrarySortPreferenceKey(fixture.scope))).sort,'title');await click(fixture.container.querySelector('.note-card-open'));assert.deepEqual(fixture.opened,['c']);assert.equal(Boolean(sortSelect(fixture)),false,'Opening a note really unmounts the library');await click(fixture.container.querySelector('section[aria-label="Note de recette simulée"] button'));await wait(()=>Boolean(sortSelect(fixture)),'Return to library');assert.equal(sortSelect(fixture).value,'title');assert.deepEqual(cardIds(fixture),['c','a','b','o','z']);
  });
  await group(declaredGroupNames[2],async()=>{
   const A=scopeFor('scope-A'),B={accountId:A.accountId+'-B',spaceId:A.spaceId},Y={accountId:A.accountId,spaceId:'year-two'},key=m.notebookLibrarySortPreferenceKey;window.localStorage.setItem(key(A),JSON.stringify({schema:1,sort:'title'}));window.localStorage.setItem(key(B),JSON.stringify({schema:1,sort:'updated'}));window.localStorage.setItem(key(Y),JSON.stringify({schema:1,sort:'title'}));const reads=[],proto=dom.window.Storage.prototype,original=proto.getItem;patchStorage(proto,'getItem',function(value){reads.push(value);return original.call(this,value);});
   const fixture=await mount({scope:A,probe:true});assert.equal(fixture.handle.sort,'title');for(const [scope,expected] of [[B,'updated'],[Y,'title'],[A,'title']]){const start=fixture.commits.length,readStart=reads.length;await fixture.render({scope});assert.ok(fixture.commits.length>start);assert.ok(fixture.commits.slice(start).every(row=>row.accountId===scope.accountId&&row.spaceId===scope.spaceId&&row.sort===expected),'No committed view may display the preceding scope preference');assert.deepEqual([...new Set(reads.slice(readStart))],[key(scope)],'Only the exact new key may be read');}
  });
  await group(declaredGroupNames[3],async()=>{
   const A=scopeFor('ABA'),B={accountId:A.accountId+'-B',spaceId:A.spaceId},apiA={},apiB={},fixture=await mount({scope:{...A,api:apiA},probe:true}),old=fixture.handle;await m.act(async()=>{assert.equal(old.setSort('title'),true);});await fixture.render({scope:{...B,api:apiB}});await fixture.render({scope:{...A,api:apiA}});const key=m.notebookLibrarySortPreferenceKey(A),before=window.localStorage.getItem(key);assert.equal(old.current(),false);assert.equal(old.setSort('updated'),false);assert.equal(window.localStorage.getItem(key),before);const oldApi=fixture.handle;await fixture.render({scope:{...A,api:apiB}});await fixture.render({scope:{...A,api:apiA}});assert.equal(oldApi.current(),false);assert.equal(oldApi.setSort('updated'),false);assert.equal(window.localStorage.getItem(key),before);await m.act(async()=>{assert.equal(fixture.handle.setSort('updated'),true);});assert.equal(fixture.handle.sort,'updated');
  });
  await group(declaredGroupNames[4],async()=>{
   const scope=scopeFor('quota'),key=m.notebookLibrarySortPreferenceKey(scope);window.localStorage.setItem(key,JSON.stringify({schema:1,sort:'updated'}));const proto=dom.window.Storage.prototype,original=proto.setItem;patchStorage(proto,'setItem',function(k,value){if(k===key)throw new dom.window.DOMException('Synthetic preference quota','QuotaExceededError');return original.call(this,k,value);});const first=await mount({scope});await choose(first,'title');assert.match(first.container.querySelector('[role="status"]').textContent,/session.*pas pu être enregistré/);assert.equal(JSON.parse(window.localStorage.getItem(key)).sort,'updated');await dispose(first);const again=await mount({scope});assert.equal(sortSelect(again).value,'title');assert.match(again.container.querySelector('[role="status"]').textContent,/pas pu être enregistré/);restoreStorage();await click(again.container.querySelector('[role="status"] button'));assert.equal(JSON.parse(window.localStorage.getItem(key)).sort,'title');assert.equal(again.container.querySelector('[role="status"]'),null);
  });
  await group(declaredGroupNames[5],async()=>{
   const scope=scopeFor('read-error'),key=m.notebookLibrarySortPreferenceKey(scope),proto=dom.window.Storage.prototype,original=proto.getItem;window.localStorage.setItem(key,JSON.stringify({schema:1,sort:'title'}));patchStorage(proto,'getItem',function(k){if(k===key)throw new dom.window.DOMException('Synthetic access denial','SecurityError');return original.call(this,k);});const fixture=await mount({scope});assert.equal(sortSelect(fixture).value,'updated');assert.match(fixture.container.querySelector('[role="status"]').textContent,/pas pu être lu/);restoreStorage();await click(fixture.container.querySelector('[role="status"] button'));assert.equal(sortSelect(fixture).value,'title');assert.equal(fixture.container.querySelector('[role="status"]'),null);await dispose(fixture);
   const malformed=scopeFor('malformed'),badKey=m.notebookLibrarySortPreferenceKey(malformed);window.localStorage.setItem(badKey,'{');const bad=await mount({scope:malformed});assert.equal(sortSelect(bad).value,'updated');assert.match(bad.container.querySelector('[role="status"]').textContent,/pas pu être lu/);assert.equal(window.localStorage.getItem(badKey),'{','A fallback read never overwrites the rejected original');
  });
  await group(declaredGroupNames[6],async()=>{
   const fixture=await mount({scope:scopeFor('strict'),probe:true,strict:true});await m.act(async()=>{assert.equal(fixture.handle.setSort('title'),true);});assert.equal(fixture.handle.sort,'title');const old=fixture.handle,key=m.notebookLibrarySortPreferenceKey(fixture.scope),before=window.localStorage.getItem(key);await dispose(fixture);assert.equal(old.current(),false);assert.equal(old.setSort('updated'),false);assert.equal(old.retry(),false);assert.equal(window.localStorage.getItem(key),before);
  });
 };
 bodyTask=body();await Promise.race([bodyTask,new Promise((_,reject)=>{deadline=nativeTimeout(()=>{stopped=true;reject(Error('Library sort fixture deadline exceeded'));},180000);})]);
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
 const allGroupsAttempted=groupsStarted===declaredGroupNames.length,report={startedAt,finishedAt:new Date().toISOString(),declaredGroups:declaredGroupNames.length,groupsStarted,passed,failed,notRun:proof.filter(row=>row.status==='NOTRUN').length,allGroupsAttempted,fullSuite:allGroupsAttempted&&!fatal&&failed===0&&cleanupFinal==='PASS'&&proof.every(row=>row.status==='PASS'&&row.cleanup?.status==='PASS'),cleanupFinal,fatal,groups:proof,sourceHashes,evidenceScope:'JSDOM real shared NotebookLibraryView and hook; production storage on fakeIndexedDB; localStorage failure seams; controlled note-route unmount/remount. No full application, native browser, cloud sync or physical-device claim.'};
 const reportPath=mountedAuditPath('n007-library-sort-mounted-20261015.json');await mkdir(dirname(reportPath),{recursive:true});await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed,failed,notRun:report.notRun,cleanupFinal,fullSuite:report.fullSuite}));if(failed||fatal||!allGroupsAttempted||cleanupFinal!=='PASS')process.exitCode=1;
}
