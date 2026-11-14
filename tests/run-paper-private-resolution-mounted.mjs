/** Source-only candidate, NOT RUN by its author. Actual mounted caller paths.
 * JSDOM/fakeIndexedDB/HTTP/prior transaction are declared seams. No fake hook,
 * resolver or reader, no process-source transform, no physical/browser claim. */
import {requireBoundedMountedCheck,mountedAuditPath} from './mounted-cleanup.mjs';
requireBoundedMountedCheck();
import {JSDOM} from 'jsdom';
import {IDBFactory,IDBKeyRange} from 'fake-indexeddb';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
const names=[
 'Actual mounted usePaperDocument loads the remote gzip conflict then refuses both-copy cache admission after a real preceding managed-header transaction',
 'Actual mounted PWA App conflict button refuses an admitted managed source before any remote body or final resolution write'
];
const dir='tests/.private-resolution-mounted-build',bundle=join(dir,'paper-private-resolution-mounted.mjs');
const sha=value=>createHash('sha256').update(value).digest('hex'),hash=value=>sha(JSON.stringify(value)??'undefined');
const detail=error=>({name:error?.name,code:error?.code,message:String(error?.message??error).split('\n')[0].slice(0,260),operator:error?.operator,actualSha:error&&'actual'in error?hash(error.actual):undefined,expectedSha:error&&'expected'in error?hash(error.expected):undefined,at:String(error?.stack??'').split('\n').filter(line=>/^\s+at /.test(line)).slice(0,4)});
const report={schema:1,kind:'paper-private-explicit-resolution-actual-callers',startedAt:new Date().toISOString(),declaredGroups:names.length,declaredNames:names,groups:[],passed:0,failed:0,allGroupsAttempted:false,fullSuite:false,fatal:null,cleanupFinal:{status:'NOTRUN'},proofScope:'Real mounted usePaperDocument loadResolution/resolve and real PWA App conflict DOM action, actual ApiClient, gzip decoder, readPaperAsset and storage on fakeIndexedDB. JSDOM geometry/events, private synthetic HTTP and a real preceding snapshots transaction are seams. App void DOM action is joined through its actual last notice commit plus every real HTTP/native terminal; the expected refusal text is asserted only afterwards. No source transform or helper replacement, native browser/installed PWA/server/OS/physical IME claim.'};
const globalNames=['window','document','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLButtonElement','Element','SVGElement','Node','NodeFilter','DOMParser','MutationObserver','Event','InputEvent','CustomEvent','KeyboardEvent','CompositionEvent','StorageEvent','ShadowRoot','navigator','getComputedStyle','addEventListener','removeEventListener','dispatchEvent','requestAnimationFrame','cancelAnimationFrame','ResizeObserver','IntersectionObserver','DOMMatrix','indexedDB','IDBKeyRange','BroadcastChannel','localStorage','innerWidth','innerHeight','IS_REACT_ACT_ENVIRONMENT','fetch','crypto','setInterval','clearInterval'];
const descriptors=new Map(globalNames.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)])),oldEnv=process.env.NODE_ENV;
const operations=new Map(),records=new WeakMap(),timeouts=[],lateErrors=[],fixtures=new Set(),opens=new Set(),connections=new Set(),transactions=new Set(),nativeRows=[],rafs=new Map(),intervals=new Set(),subscriptions=new Map();
const realSetInterval=globalThis.setInterval,realClearInterval=globalThis.clearInterval;
const factory=new IDBFactory(),native={opens:0,started:0,complete:0,abort:0};
let m,dom,currentFixture,lastAppApi,sequence=0,nativeSequence=0,rafSequence=0;
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
function track(promise,label,kind='operation'){
 if(records.has(promise))return promise;
 const row={label,kind,timedOut:false};let followed;
 followed=Promise.resolve(promise).catch(error=>{if(row.timedOut)lateErrors.push({label,error:detail(error)});throw error;}).finally(()=>operations.delete(followed));
 records.set(followed,row);operations.set(followed,row);void followed.catch(()=>{});return followed;
}
async function bounded(promise,label,ms=9000){const followed=track(promise,label);let timer;try{return await Promise.race([followed,new Promise((_,reject)=>{timer=setTimeout(()=>{records.get(followed).timedOut=true;timeouts.push(label);reject(Error(label+': timeout; complete original remains followed'));},ms);})]);}finally{clearTimeout(timer);}}
async function drain(label,{excludeGroups=false}={}){const deadline=Date.now()+10000,active=()=>[...operations].filter(([,row])=>!excludeGroups||row.kind!=='group');while(active().length){const remaining=deadline-Date.now();if(remaining<=0)throw Error(label+': original operations remain active');let timer;try{const done=await Promise.race([Promise.allSettled(active().map(([promise])=>promise)).then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),remaining);})]);if(!done)throw Error(label+': original operations remain active');}finally{clearTimeout(timer);}}}
// The loop itself owns a deadline. A rejected race never leaves a poll running.
async function wait(check,label,ms=9000){const deadline=Date.now()+ms;while(Date.now()<deadline){await m.act(tick);if(await check())return;}throw Error(label+': bounded observation timeout');}
const sourceKey=row=>`${row.accountId}|${row.spaceId}|${row.type??'notesMarkdown'}|${row.documentId}`;
function wrapTransaction(tx,f,role){
 const row={id:++nativeSequence,role,phase:f?.phase??'setup',mode:tx.mode,stores:Array.from(tx.objectStoreNames),writes:[],status:'pending',error:null};nativeRows.push(row);native.started++;transactions.add(tx);
 const originalStore=tx.objectStore.bind(tx),wrapped=new WeakSet();tx.objectStore=name=>{const store=originalStore(name);if(tx.mode==='readwrite'&&!wrapped.has(store)){wrapped.add(store);for(const method of ['put','add','delete','clear']){const original=store[method].bind(store);store[method]=(...args)=>{row.writes.push({store:name,method,key:method==='delete'?String(args[0]):typeof args[0]?.key==='string'?args[0].key:typeof args[0]?.id==='string'?args[0].id:null});return original(...args);};}}return store;};
 track(new Promise(resolve=>{tx.addEventListener('complete',()=>{row.status='complete';native.complete++;transactions.delete(tx);if(role==='preceding-managed-marker')f.markerCommitted=true;resolve();},{once:true});tx.addEventListener('abort',()=>{row.status='abort';row.error=tx.error?{name:tx.error.name,messageLength:tx.error.message.length}:null;native.abort++;transactions.delete(tx);resolve();},{once:true});}),'Native '+row.id+' '+role+' '+tx.mode+' '+row.stores.join(','),'native');return row;
}
const factoryOpen=factory.open;
factory.open=function(...args){const request=Reflect.apply(factoryOpen,this,args);opens.add(request);native.opens++;request.addEventListener('error',()=>opens.delete(request),{once:true});request.addEventListener('success',()=>{opens.delete(request);const db=request.result,close=db.close.bind(db),transaction=db.transaction.bind(db);connections.add(db);db.close=()=>{close();connections.delete(db);};db.transaction=(...args)=>{
 const f=currentFixture,names=typeof args[0]==='string'?[args[0]]:Array.from(args[0]),isCache=args[1]==='readwrite'&&names.length===3&&['drafts','snapshots','scopedBlobs'].every(name=>names.includes(name));
 let injected=false;
 if(f?.injectCacheMarker&&isCache){f.injectCacheMarker=false;f.markerInjections++;injected=true;const prior=transaction('snapshots','readwrite');wrapTransaction(prior,f,'preceding-managed-marker');for(const marker of f.markers)prior.objectStore('snapshots').put(structuredClone(marker));}
 const tx=transaction(...args),row=wrapTransaction(tx,f,injected?'guarded-cache-target':'production');if(injected)f.cacheTarget=row;return tx;
 };},{once:true});return request;};
const setOnline=value=>Object.defineProperty(navigator,'onLine',{configurable:true,value});
const fakeFetch=(url,init={})=>track((async()=>{
 const f=currentFixture;assert.ok(f,'HTTP needs the current admitted fixture');const parsed=new URL(String(url),'https://qa.invalid'),path=parsed.pathname,method=init.method??'GET',headers=new Headers(init.headers);f.http.push({method,path,account:headers.get('X-Dowze-Account'),phase:f.phase});
 if(path==='/v1/me')return Response.json(f.account);
 if(path==='/v1/csrf'){assert.equal(headers.get('X-Dowze-Account'),null,'CSRF restore has no scoped actor header');assert.equal(init.credentials,'include');return Response.json({csrf_token:'synthetic-fixture-csrf'});}
 if(path==='/v1/spaces')return Response.json({items:[f.year],has_more:false,next_after:null});
 if(path==='/v1/catalog')return Response.json({items:[]});
 if(path.startsWith('/v1/spaces/'))assert.equal(headers.get('X-Dowze-Account'),f.account.id,'Actual scoped reads retain the captured actor');
 if(path===`/v1/spaces/${f.scope.spaceId}/changes`){f.changeReads++;return Response.json({items:[f.remoteChange],next_cursor:'fixture-end',has_more:false});}
 if(path===`/v1/spaces/${f.scope.spaceId}/blobs/remote-paper-body`){f.bodyDownloads++;return new Response(f.remoteBytes,{headers:{'Content-Type':'application/octet-stream'}});}
 if(path===`/v1/spaces/${f.scope.spaceId}/blobs/remote-image-bytes`){f.mediaDownloads++;return new Response(f.imageBytes,{headers:{'Content-Type':'image/png'}});}
 f.unexpected.push({method,path});throw Error('Undeclared request in explicit-resolution caller fixture');
})(),'Actual ApiClient HTTP');
function managedMarkers(f){const bindingKey='managed-notebook-binding|'+JSON.stringify([f.scope.accountId,f.scope.spaceId,f.noteId]);return [
 {...f.scope,key:bindingKey,value:{phase:'admitting',original:'Synthetic retained managed original; never a private transport fallback'}},
 {...f.scope,key:'managed-notebook-resource|'+JSON.stringify(['https://fixture.invalid',f.scope.accountId,'11111111-1111-4111-8111-111111111111']),value:{bindingKey,identity:{...f.scope,noteId:f.noteId,canonicalDocumentId:f.identity.documentId,metadataDocumentId:m.noteMetadataTransportId(f.noteId),lineage:f.document.collaboration.lineage},resourceId:'11111111-1111-4111-8111-111111111111',incarnation:'22222222-2222-4222-8222-222222222222'}}
 ];}
async function inventory(){
 const raw=await bounded(new Promise((resolve,reject)=>{const req=factory.open('dowze-academie-pwa',3);req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,names=Array.from(db.objectStoreNames),tx=db.transaction(names,'readonly'),values={};for(const name of names){const read=tx.objectStore(name).getAll();read.onsuccess=()=>{values[name]=read.result;};}tx.oncomplete=()=>{db.close();resolve(values);};tx.onabort=tx.onerror=()=>{db.close();reject(tx.error??Error('Inventory transaction aborted'));};};}),'Whole native store inventory');
 const result={};for(const [store,rows]of Object.entries(raw)){result[store]=await Promise.all(rows.map(async row=>{if(!(row?.blob instanceof Blob))return row;const{blob,...rest}=row;return {...rest,actualBytes:{size:blob.size,type:blob.type,sha256:sha(new Uint8Array(await blob.arrayBuffer()))}};}));result[store].sort((a,b)=>String(a.key??a.id)<String(b.key??b.id)?-1:String(a.key??a.id)>String(b.key??b.id)?1:0);}return result;
}
function expectedMarkers(before,markers){const next=structuredClone(before);next.snapshots.push(...structuredClone(markers));next.snapshots.sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);return next;}
async function seed(label){
 const serial=++sequence,scope={accountId:'resolution-caller-'+label+'-'+serial,spaceId:'resolution-year-'+serial},foreign={accountId:scope.accountId+'-foreign',spaceId:scope.spaceId},noteId='explicit-note-'+serial,stamp='2026-10-16T00:00:00.000Z',text='Accepted local conflict source.';
 const plain=m.migratePaper(noteId,text,null,stamp),document=m.amendPaperCollaboration(plain,plain),identity={...scope,type:'whiteboard',documentId:m.notebookDocumentId(noteId)};
 const imageBytes=new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jrboAAAAASUVORK5CYII=','base64'));
 const asset={id:'remote-image',serverId:'remote-image-bytes',name:'Retained remote image.png',mediaType:'image/png',size:imageBytes.length};
 const remote=m.amendPaperCollaboration(document,m.applyPaperCommand(document,{type:'batch',commands:[{type:'add-asset',asset},{type:'upsert-object',object:{id:'remote-image-object',pageId:document.pages[0].id,kind:'image',assetId:asset.id,x:30,y:40,width:50,height:60,rotation:0,z:2,locked:false,createdAt:1}}]},stamp));m.verifyPaperCollaboration(remote);
 const body=new TextEncoder().encode(JSON.stringify(remote)),remoteBytes=m.gzipSync(body,{level:3,mtime:0}),envelope={notebookEnvelope:3,noteId,revision:remote.revision,body_id:'remote-paper-body',body_sha256:sha(remoteBytes),body_size:body.length,blob_ids:['remote-paper-body']};
 const f={scope,foreign,noteId,identity,document,remote,remoteBytes,imageBytes,text,account:{id:scope.accountId,email:'synthetic-'+serial+'@example.invalid',created_at:stamp},year:{id:scope.spaceId,formation_id:'fixture',academic_year:'2026',title:'Private fixture year',created_at:stamp},phase:'seed',http:[],unexpected:[],changeReads:0,bodyDownloads:0,mediaDownloads:0,markerInjections:0,markerCommitted:false,injectCacheMarker:false,roots:[],cacheTarget:null};f.remoteChange={document_id:identity.documentId,document_type:'whiteboard',version:9,deleted:false,content:envelope};f.markers=managedMarkers(f);currentFixture=f;fixtures.add(f);
 for(const s of [scope,foreign]){
  await m.putDraft({...identity,...s,title:'Exact original title '+s.accountId,content:document,baseVersion:4,updatedAt:1,syncState:'conflict',conflict:{serverVersion:9}});
  await m.putDraft({...s,type:'notesMarkdown',documentId:noteId,title:'Exact original title '+s.accountId,content:{id:noteId,title:'Exact original title '+s.accountId,markdown:text,tags:['original','unchanged'],createdAt:stamp,updatedAt:stamp},paperDependency:identity.documentId,baseVersion:4,updatedAt:1,syncState:'synced'});
  await m.putDraft({...s,type:'preferences',documentId:m.LIBRARY_DOCUMENT_ID,title:'Original classification',content:m.emptyNotebookLibrary(),baseVersion:4,updatedAt:1,syncState:'synced'});
  await m.putSnapshot({...s,key:'paper-migration|'+sourceKey({...identity,...s}),value:{markdown:text,legacy:null,migratedAt:stamp}});
  await m.putSnapshot({...s,key:'fixture-retained-original|'+s.accountId,value:{text:'An unrelated exact retained receipt',opaque:[1,'keep',null]}});
  await m.putLocalBlob({...s,id:'unrelated-original',documentId:identity.documentId,blob:new Blob(['Exact retained original '+s.accountId],{type:'application/octet-stream'}),name:'Original bytes.bin',createdAt:1,status:'uploaded',serverId:'retained-original-server',revision:1});
  await m.queueMutation({...identity,...s,id:'retained-pending-'+s.accountId,content:document,baseVersion:4,createdAt:1,status:'pending'});
 }
 return f;
}
async function mountHook(f){
 f.phase='hook/mount';f.container=document.createElement('div');document.body.append(f.container);f.root=m.createRoot(f.container);f.roots.push(f.root);f.live=true;
 await m.act(async()=>{m.flushSync(()=>f.root.render(m.createElement(m.HookRecipe,{noteId:f.noteId,markdown:f.text,media:{...f.scope,api:f.api},report:value=>{f.paper=value;}})));await tick();});
 await wait(()=>f.paper?.document&&f.paper.blocked&&f.paper.saved&&!f.paper.reconciling,'Actual hook opens its existing conflicted canonical');
 await m.act(async()=>{await bounded(f.paper.whenSaved(),'Actual hook opening/legacy tail');await tick();});
 assert.deepEqual(f.paper.getCurrent(),f.document);assert.equal(f.paper.resolution,null);
}
async function runHook(){
 const f=await seed('hook');f.api=new m.ApiClient('https://qa.invalid',fakeFetch);f.api.bindAccount(f.scope.accountId);await mountHook(f);const before=await inventory();
 f.phase='hook/loadResolution';await m.act(async()=>{await bounded(f.paper.loadResolution(),'Actual hook loadResolution');await tick();});
 assert.ok(f.paper.resolution,'The real hook must expose the actual fetched alternative');assert.deepEqual(f.paper.resolution.remote,f.remote);assert.equal(f.paper.resolution.version,9);assert.equal(f.paper.resolving,false);assert.equal(f.bodyDownloads,1);assert.equal(f.changeReads,1);assert.equal(f.mediaDownloads,0);assert.deepEqual(await inventory(),before,'Loading comparison alone does not rewrite source or cache media');
 const selected=f.paper.resolution,local=f.paper.getCurrent();f.phase='hook/resolve-both';f.injectCacheMarker=true;
 await m.act(async()=>{await bounded(f.paper.resolve('both'),'Actual hook resolve both with native cache race');await tick();});
 assert.equal(f.markerInjections,1,'A real prior snapshots transaction must precede the exact production cache commit');assert.equal(f.markerCommitted,true);assert.equal(f.mediaDownloads,1,'The actual asset reader must download the original before the protected fresh-TX refusal');
 assert.deepEqual(await inventory(),expectedMarkers(before,f.markers),'Only the independently admitted header may change; every original graph metadata history receipt outbox and byte stays exact');
 assert.equal(f.cacheTarget.status,'abort');assert.equal(f.cacheTarget.error,null);assert.deepEqual(f.cacheTarget.writes,[],'A blocked production cache transaction schedules no writes');assert.equal(f.paper.resolving,false);assert.equal(f.paper.blocked,true);assert.equal(f.paper.resolution,selected);assert.equal(f.paper.getCurrent(),local);assert.match(f.paper.notice,/protég|géré|restaur|privé|corbeille/i,'The actual hook reports a recoverable protected-source refusal');
 return {loadedRemoteGzip:true,originalDownloadBeforeGuard:true,cacheRollbackExact:true,foreignAndOriginalStoresExact:true,expectedSourceAbort:{id:f.cacheTarget.id,role:f.cacheTarget.role,writes:f.cacheTarget.writes.length}};
}
const fiber=(f,predicate)=>{const stack=[f.root._internalRoot.current];while(stack.length){const item=stack.pop();if(predicate(item))return item;if(item.sibling)stack.push(item.sibling);if(item.child)stack.push(item.child);}throw Error('Actual committed component missing');};
const notice=f=>f.container.querySelector('.workspace > .notice[role="status"]')?.textContent??null;
async function runApp(){
 const f=await seed('app');lastAppApi?.forgetSession();localStorage.clear();for(const account of [f.account]){localStorage.setItem('dowze.spaces.'+account.id,JSON.stringify([f.year]));localStorage.setItem('dowze.active-space.'+account.id,f.year.id);}setOnline(false);f.phase='app/mount';
 f.container=document.createElement('div');document.body.append(f.container);f.root=m.createRoot(f.container);f.roots.push(f.root);f.live=true;
 await m.act(async()=>{f.root.render(m.createElement(m.App));await tick();});
 await wait(()=>f.container.querySelector('[aria-label="Mon année"]')?.value===f.scope.spaceId&&f.container.querySelector('.notebook-library')?.getAttribute('aria-busy')==='false'&&f.container.querySelectorAll('section.card.conflict button').length===2,'Actual cached owner/year and real conflict buttons are ready');
 const library=fiber(f,row=>row.type===m.NotebookLibraryView).memoizedProps;assert.equal(library.media.accountId,f.scope.accountId);f.api=library.media.api;assert.ok(f.api instanceof m.ApiClient);lastAppApi=f.api;
 await m.act(async()=>{await bounded(m.settleAllNotebookAccounts(),'Actual App mounted writers before explicit choice');m.resumeAllNotebookAccounts();await tick();});await drain('App initial fetch and native terminals',{excludeGroups:true});
 for(const marker of f.markers)await m.putSnapshot(marker);const before=await inventory(),baselineNotice=notice(f),beforeBody=f.bodyDownloads,beforeChanges=f.changeReads;f.phase='app/explicit-conflict-click';
 const button=[...f.container.querySelectorAll('section.card.conflict button')].find(row=>row.textContent==='Utiliser la version serveur');assert.ok(button&&!button.disabled);
 // This is the real DOM event: its production wrapper is void. Wait for ANY
 // actual final notice (success OR refusal), then join I/O; do not wait for the
 // desired refusal text, nor extract or replace resolveDocument.
 await m.act(async()=>{button.click();await tick();});
 await wait(()=>notice(f)!==baselineNotice&&notice(f)!==null,'Actual App conflict action reaches its public terminal notice');await drain('Real App resolution HTTP and native terminals',{excludeGroups:true});await m.act(tick);
 assert.deepEqual(await inventory(),before,'A protected App resolution cannot touch any graph metadata original bytes history conflict receipt or outbox in any scope');
 assert.equal(f.bodyDownloads,beforeBody,'Protected actual App caller refuses before gzip body decoding');assert.equal(f.changeReads,beforeChanges,'Protected actual App caller refuses before private changes I/O');assert.equal(f.mediaDownloads,0);assert.match(notice(f),/protég|géré|restaur|privé|corbeille/i,'Only after terminal observation, assert the actionable source refusal');assert.equal(f.container.querySelectorAll('section.card.conflict button').length,2,'The original conflict remains available for explicit recovery');assert.equal(navigator.onLine,false);
 return {actualDomConflictButton:true,publicVoidTerminalObserved:true,blockedBeforeChangesAndBody:true,allNativeStoresAndOriginalBytesExact:true};
}
async function cleanup(){
 await drain('Complete original group work before teardown');
 if(m){await m.act(async()=>{await bounded(m.settleAllNotebookAccounts(),'Actual source writers before unmount');m.resumeAllNotebookAccounts();await tick();});
  for(const f of fixtures){if(f.live){await m.act(async()=>{f.root.unmount();await tick();});f.live=false;f.roots=[];f.container.remove();}assert.deepEqual(f.unexpected,[],'No undeclared private transport may be hidden by a refusal');}
  await drain('All actual unmount/native continuations');assert.equal(m.hasPendingNotebookWrites(),false);
 }
 for(const row of nativeRows.filter(row=>row.status==='abort')){const f=[...fixtures].find(item=>item.cacheTarget===row);assert.ok((row.expectedSourceRefusal===true||f&&f.markerInjections===1&&f.markerCommitted)&&row.role==='guarded-cache-target'&&row.error===null&&row.writes.length===0,'Only the exact expected, read-only-in-effect source refusal may abort');row.expectedSourceRefusal=true;}
 assert.equal(opens.size,0);assert.equal(transactions.size,0);assert.equal(native.started,native.complete+native.abort);assert.equal(intervals.size,0,'All actual continuous-sync intervals are removed by unmount');assert.equal([...subscriptions.values()].reduce((n,set)=>n+set.size,0),0,'No observed target remains subscribed');fixtures.clear();currentFixture=undefined;
}
async function group(index,work){const row={name:names[index],status:'RUNNING',cleanup:{status:'NOTRUN'}},timeoutStart=timeouts.length;report.groups.push(row);try{row.evidence=await bounded(track(Promise.resolve().then(work),'Complete mounted caller group '+index,'group'),names[index],35000);row.status='PASS';report.passed++;}catch(error){row.status='FAIL';row.error=detail(error);row.diagnostic={phase:currentFixture?.phase??null,bodyDownloads:currentFixture?.bodyDownloads??null,mediaDownloads:currentFixture?.mediaDownloads??null,changeReads:currentFixture?.changeReads??null,hook:{present:!!currentFixture?.paper,blocked:currentFixture?.paper?.blocked??null,resolving:currentFixture?.paper?.resolving??null,resolution:!!currentFixture?.paper?.resolution,noticeLength:currentFixture?.paper?.notice?.length??0},native:nativeRows.slice(-12).map(({id,role,phase,mode,stores,status,error,writes})=>({id,role,phase,mode,stores,status,error,writeCount:writes.length}))};report.failed++;}finally{try{await cleanup();assert.equal(timeouts.length,timeoutStart,'A timeout can never count as an accepted refusal');row.cleanup={status:'PASS',pendingOperations:operations.size};}catch(error){row.cleanup={status:'FAIL',error:detail(error),pendingOperations:operations.size};if(row.status==='PASS'){row.status='FAIL';report.passed--;report.failed++;}throw error;}}console.log(row.name+': '+row.status);}
try{
 report.buildManifest=JSON.parse(await readFile(join(dir,'build-manifest.json'),'utf8'));assert.equal(report.buildManifest.runtime,'NOTRUN');assert.equal(report.buildManifest.declaredGroups,names.length);assert.equal(sha(await readFile(bundle)),report.buildManifest.bundle.sha256,'Exact prebuilt caller bundle');
 report.sourceHashes=Object.fromEntries(await Promise.all(Object.keys(report.buildManifest.sourceHashes).map(async path=>[path,sha(await readFile(path))])));assert.deepEqual(report.sourceHashes,report.buildManifest.sourceHashes,'Source provenance must match the frozen bundle before import');
 process.env.NODE_ENV='development';dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://qa.invalid/'});
 for(const key of ['HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLButtonElement','Element','SVGElement','Node','NodeFilter','DOMParser','MutationObserver','Event','InputEvent','CustomEvent','KeyboardEvent','CompositionEvent','StorageEvent','ShadowRoot'])Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:dom.window[key]});
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,getComputedStyle:dom.window.getComputedStyle.bind(dom.window),addEventListener:dom.window.addEventListener.bind(dom.window),removeEventListener:dom.window.removeEventListener.bind(dom.window),dispatchEvent:dom.window.dispatchEvent.bind(dom.window),navigator:dom.window.navigator,indexedDB:factory,IDBKeyRange,BroadcastChannel:undefined,localStorage:dom.window.localStorage,innerWidth:1280,innerHeight:800,IS_REACT_ACT_ENVIRONMENT:true,fetch:fakeFetch,crypto:webcrypto}))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});setOnline(false);Object.defineProperty(document,'fonts',{configurable:true,value:{ready:Promise.resolve()}});
 class Observer{constructor(){subscriptions.set(this,new Set());}observe(target){subscriptions.get(this).add(target);}unobserve(target){subscriptions.get(this).delete(target);}disconnect(){subscriptions.get(this).clear();}}
 globalThis.ResizeObserver=Observer;globalThis.IntersectionObserver=Observer;dom.window.ResizeObserver=Observer;dom.window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
 globalThis.setInterval=(callback,ms,...args)=>{const timer=realSetInterval(callback,ms,...args);intervals.add(timer);return timer;};globalThis.clearInterval=timer=>{intervals.delete(timer);realClearInterval(timer);};
 globalThis.requestAnimationFrame=callback=>{const id=++rafSequence;rafs.set(id,setTimeout(()=>{rafs.delete(id);callback(performance.now());},10));return id;};globalThis.cancelAnimationFrame=id=>{clearTimeout(rafs.get(id));rafs.delete(id);};dom.window.requestAnimationFrame=requestAnimationFrame;dom.window.cancelAnimationFrame=cancelAnimationFrame;
 globalThis.DOMMatrix=class{constructor(){this.a=1;this.b=0;this.c=0;this.d=1;this.e=0;this.f=0;}inverse(){return this;}};
 dom.window.HTMLElement.prototype.getBoundingClientRect=dom.window.SVGElement.prototype.getBoundingClientRect=function(){return new dom.window.DOMRect(0,0,900,600);};for(const [key,value]of [['clientWidth',900],['clientHeight',600],['offsetHeight',56]])Object.defineProperty(dom.window.HTMLElement.prototype,key,{configurable:true,get:()=>value});dom.window.Range.prototype.getBoundingClientRect=()=>new dom.window.DOMRect(0,0,1,20);dom.window.Range.prototype.getClientRects=function(){return [this.getBoundingClientRect()];};dom.window.Element.prototype.scrollIntoView=()=>{};
 m=await bounded(import(pathToFileURL(join(process.cwd(),bundle))),'Import actual caller bundle');await bounded(m.appStorage.initialize(localStorage,factory),'Initialize actual device cache');
 await group(0,runHook);await group(1,runApp);
}catch(error){report.fatal=detail(error);process.exitCode=1;}
finally{
 try{await cleanup();if(m){await bounded(m.appStorage.flush(),'Final actual device cache tail');m.appStorage.close();}await drain('All originals/native operations before restoration');assert.equal(connections.size,0);assert.equal(opens.size,0);assert.equal(transactions.size,0);for(const database of ['dowze-academie-pwa','dowze-academie-device-cache'])await bounded(new Promise((resolve,reject)=>{const request=factory.deleteDatabase(database);request.onsuccess=resolve;request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Owned database remains connected'));}),'Delete owned '+database);report.cleanupFinal={status:'PASS',pendingOperations:operations.size,nativeOpens:opens.size,nativeTransactions:transactions.size,nativeConnections:connections.size,roots:fixtures.size,observedTargets:[...subscriptions.values()].reduce((n,set)=>n+set.size,0),intervals:intervals.size};}catch(error){report.cleanupFinal={status:'FAIL',error:detail(error),pendingOperations:operations.size,nativeOpens:opens.size,nativeTransactions:transactions.size,nativeConnections:connections.size,roots:[...fixtures].filter(f=>f.live).length};process.exitCode=1;}
 if(operations.size||opens.size||transactions.size||connections.size||[...fixtures].some(f=>f.live)||m?.hasPendingNotebookWrites()||intervals.size||[...subscriptions.values()].some(set=>set.size)){console.error(JSON.stringify({kind:'FATAL_STOP',reason:'Accepted original/native/subscription work remains active; no resource restoration or final report',pending:[...operations.values()].slice(0,8).map(({label,kind})=>({label,kind})),nativeOpens:opens.size,nativeTransactions:transactions.size,nativeConnections:connections.size,roots:[...fixtures].filter(f=>f.live).length,intervals:intervals.size}));process.exitCode=1;throw Error('Private-resolution mounted fixture is not terminal');}
 if(report.cleanupFinal.status==='PASS'){for(const timer of rafs.values())clearTimeout(timer);rafs.clear();dom?.window.close();for(const [key,descriptor]of descriptors)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];if(oldEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=oldEnv;}
}
report.groupsStarted=report.groups.length;for(const name of names)if(!report.groups.some(row=>row.name===name))report.groups.push({name,status:'NOTRUN',reason:'Earlier fatal or cleanup failure'});report.allGroupsAttempted=report.groupsStarted===names.length;report.notRun=report.groups.filter(row=>row.status==='NOTRUN').map(row=>row.name);report.timeouts=timeouts;report.lateErrors=lateErrors;report.expectedSourceAborts=nativeRows.filter(row=>row.status==='abort').map(({id,role,phase,mode,stores,writes,error})=>({id,role,phase,mode,stores,writes,error}));report.native={...native};report.sourceHashesAfter=report.sourceHashes?Object.fromEntries(await Promise.all(Object.keys(report.sourceHashes).map(async path=>[path,sha(await readFile(path))]))):null;report.sourceFreeze={status:report.sourceHashes&&hash(report.sourceHashes)===hash(report.sourceHashesAfter)?'PASS':'FAIL'};report.fullSuite=report.allGroupsAttempted&&report.passed===names.length&&!report.failed&&!report.fatal&&report.cleanupFinal.status==='PASS'&&report.sourceFreeze.status==='PASS'&&!timeouts.length&&!lateErrors.length;report.finishedAt=new Date().toISOString();const output=mountedAuditPath('private-notebook-resolution-actual-callers-mounted-20261016.json');await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');if(!report.fullSuite)process.exitCode=1;console.log(JSON.stringify({passed:report.passed,failed:report.failed,notRun:report.notRun.length,fullSuite:report.fullSuite,cleanup:report.cleanupFinal.status,freeze:report.sourceFreeze.status,report:output}));
