import {mountedCleanup,requireBoundedMountedCheck,mountedAuditPath} from './mounted-cleanup.mjs';
requireBoundedMountedCheck();
import {build} from 'vite';
import {JSDOM} from 'jsdom';
import {IDBFactory,IDBKeyRange} from 'fake-indexeddb';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

// Actual App.newNote/Notebook/storage. JSDOM, fake HTTP and fakeIndexedDB are
// explicit seams. A synchronous native-Promise observer retains the original
// void handler's real then/catch chains without replacing any returned Promise.
const names=[
 'Current mounted New note creates a durable blank note and opens its actual Notebook',
 'Retired actual New note callback refuses admission after account A-B-A and a fresh callback succeeds',
 'Retired actual New note callback refuses admission after year A-B-A and a fresh callback succeeds',
 'Retired actual New note callback refuses every write after App unmount',
 'Already admitted creation finishes in original account after A-B-A without stealing fresh focus or schedulers',
 'Already admitted creation finishes in original year after A-B-A without stealing fresh focus or schedulers',
 'Old creation quota reaches real abort after account A-B-A without changing fresh notice or data',
 'Already admitted creation finishes after unmount with only its exact original metadata durable'
];
const sourcePaths=['pwa/src/App.tsx','pwa/src/PwaNotePane.tsx','pwa/src/api.ts','pwa/src/sync.ts','pwa/src/storage.ts','src/hooks/useNotebookLibrary.ts','tests/paper-pwa-new-note-owner-entry.ts','tests/paper-pwa-new-note-owner-runner.mjs','tests/mounted-cleanup.mjs'];
const report={scope:'Actual mounted PWA App.newNote/PwaNotePane/Notebook and ApiClient/storage; JSDOM geometry/event delivery, private fake HTTP and fakeIndexedDB. No native browser/server/hardware claim.',declaredGroups:names.length,groups:[],passed:0,failed:0,fullSuite:false,cleanup:'NOTRUN',startedAt:new Date().toISOString()};
report.preservationContract={data:'Exact four-scope drafts/outbox/blobs/snapshots except the specifically admitted original metadata, or the explicitly current new-note graph/recovery sources in the stable control. No snapshot is filtered.',currentObservation:'One exact current initial-note observation may only advance its monotone date and whole sourceMetadata equal to the current durable metadata; all other fields/key sets remain exact.',admission:'A retained callback cannot create after its owner/year incarnation or mounting was retired.',accepted:'A creation already admitted before retirement may finish only its original metadata; no focus/notice/new-current scheduler publication.'};
const globals=['window','document','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLButtonElement','Element','SVGElement','Node','NodeFilter','DOMParser','MutationObserver','Event','InputEvent','CustomEvent','KeyboardEvent','CompositionEvent','StorageEvent','ShadowRoot','navigator','getComputedStyle','addEventListener','removeEventListener','dispatchEvent','requestAnimationFrame','cancelAnimationFrame','ResizeObserver','IntersectionObserver','DOMMatrix','indexedDB','IDBKeyRange','BroadcastChannel','localStorage','innerWidth','innerHeight','IS_REACT_ACT_ENVIRONMENT','fetch'];
const originals=new Map(globals.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)])),oldNodeEnv=process.env.NODE_ENV;
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const operations=new Map(),records=new WeakMap(),timedOutOperations=[],lateErrors=[],gates=new Set(),fixtures=new Set(),restorers=new Set(),rafTimers=new Map(),factory=new IDBFactory();
const originalThenDescriptor=Object.getOwnPropertyDescriptor(Promise.prototype,'then');
const out=await mkdtemp(join(process.cwd(),'tests/.paper-pwa-new-note-owner-'));
let m,dom,remoteFixture,lastClient,sequence=0,rafSequence=0;
const tick=()=>new Promise(resolve=>setTimeout(resolve,15));
const tracked=(promise,label='Actual App/IDB operation')=>{assert.ok(promise&&typeof promise.then==='function');if(records.has(promise))return promise;const record={label,timedOut:false};let complete;complete=Promise.resolve(promise).catch(error=>{if(record.timedOut)lateErrors.push({label,error:String(error?.message??error).slice(0,180)});throw error;}).finally(()=>operations.delete(complete));records.set(complete,record);operations.set(complete,record);void complete.catch(()=>{});return complete;};
const phase=(f,label)=>{if(!f)return;f.phase=label;f.events??=[];f.events.push({atMs:Date.now()-f.createdAt,phase:label});if(f.events.length>40)f.events.shift();};
const operationTimeoutMs=6000;
const bounded=async(promise,label='PWA new-note owner',timeoutMs=operationTimeoutMs)=>{const complete=tracked(promise,label);let timer;try{return await Promise.race([complete,new Promise((_,reject)=>{timer=setTimeout(()=>{const record=records.get(complete);record.timedOut=true;timedOutOperations.push({label});reject(Error(label+' fixture timeout; phase='+String(remoteFixture?.phase??'setup')));},timeoutMs);})]);}finally{clearTimeout(timer);}};
const drainOperations=async label=>{const until=Date.now()+operationTimeoutMs;while(operations.size){const remaining=until-Date.now();if(remaining<=0)throw Error(label+': still active '+JSON.stringify([...operations.values()].map(row=>row.label).slice(0,8)));let timer;try{const settled=await Promise.race([Promise.allSettled([...operations.keys()]).then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),remaining);})]);if(!settled)throw Error(label+': originals still active');}finally{clearTimeout(timer);}}};
const deferred=()=>{let release;const promise=new Promise(resolve=>release=resolve);gates.add(release);return {promise,release};};
const transactionLedger={started:0,complete:0,aborted:0},nativeFactoryOpen=factory.open;
factory.open=function(...args){const request=Reflect.apply(nativeFactoryOpen,this,args);request.addEventListener('success',()=>{const db=request.result,nativeTransaction=db.transaction;db.transaction=function(...args){const tx=Reflect.apply(nativeTransaction,this,args);transactionLedger.started++;tracked(new Promise(resolve=>{tx.addEventListener('complete',()=>{transactionLedger.complete++;resolve();},{once:true});tx.addEventListener('abort',()=>{transactionLedger.aborted++;resolve();},{once:true});}),'Actual native '+tx.mode+' transaction '+Array.from(tx.objectStoreNames).join(','));return tx;};},{once:true});return request;};
const wait=async(check,label)=>{phase(remoteFixture,'wait: '+label);for(let i=0;i<160;i++){await m.act(tick);if(await check()){phase(remoteFixture,'ready: '+label);return;}}throw Error(label+' fixture timeout');};
const online=value=>Object.defineProperty(navigator,'onLine',{configurable:true,value});
const fiber=(f,predicate)=>{const stack=[f.root._internalRoot.current];while(stack.length){const row=stack.pop();if(predicate(row))return row;if(row.sibling)stack.push(row.sibling);if(row.child)stack.push(row.child);}throw Error('Current mounted React component/handler not found');};
const paperState=f=>{try{const row=fiber(f,item=>item.memoizedProps?.paper&&item.memoizedProps?.document&&item.memoizedProps?.media&&typeof item.memoizedProps.paper.whenSaved==='function'&&typeof item.memoizedProps.ownerKey==='string');return {...row.memoizedProps,handle:(row.ref??row.memoizedProps.ref)?.current};}catch{return null;}};
const matchesPaper=(state,scope,f)=>!!state&&state.ownerKey===JSON.stringify([scope.accountId,scope.spaceId,f.noteId])&&state.media.accountId===scope.accountId&&state.media.spaceId===scope.spaceId&&state.media.api===f.client&&state.document.noteId===f.noteId&&state.paper.document===state.document&&state.paper.getCurrent()===state.document&&state.paper.legacyReady&&state.paper.saved&&!state.paper.blocked&&!state.paper.reconciling;
const openedCurrentPaper=async(f,scope)=>{
 await wait(async()=>{const before=paperState(f);if(!matchesPaper(before,scope,f)||!before.handle)return false;const tail=before.paper.whenSaved(),generation=before.generation,handle=before.handle;
  // Flush only the mounted current viewport. The old App.save JSON/open gate
  // remains held; no account-wide settlement can wait on or retire that save.
  await m.act(async()=>{assert.equal(await bounded(handle.flush(),'Current viewport writers'),true);await bounded(tail,'Current canonical tail');await tick();});
  const after=paperState(f);return matchesPaper(after,scope,f)&&after.generation===generation&&after.handle===handle&&after.paper.whenSaved()===tail;
 },'The current Notebook owner/API/document and its canonical writers must be ready');
};
const props=(f,node)=>fiber(f,row=>row.stateNode===node).memoizedProps;
const buttons=f=>[...f.container.querySelectorAll('button')];
const saveButton=f=>buttons(f).find(node=>node.closest('.editor-footer')&&['Enregistrer','Enregistrement…'].includes(node.textContent));
const click=async node=>{assert.ok(node&&!node.disabled);await m.act(async()=>{node.click();await tick();});};
const select=async(node,value)=>{assert.ok(node);await m.act(async()=>{node.value=value;node.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await tick();});assert.equal(node.value,value);};
const fill=async(f,node,value)=>{assert.ok(node);await m.act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await tick();});assert.equal(props(f,node).value,value,'The real controlled Auth input must accept the synthetic DOM event');};
const identity=(f,accountId=f.A.id,spaceId=f.years[0].id)=>({accountId,spaceId,type:'notesMarkdown',documentId:f.noteId});
const readDetails=new WeakMap();
const read=async f=>{
 const rows=await Promise.all(f.scopes.map(async scope=>[JSON.stringify(scope),{drafts:await m.listDrafts(scope.accountId,scope.spaceId),queue:await m.listMutations(scope.accountId,scope.spaceId),blobs:await m.listLocalBlobs(scope.accountId,scope.spaceId),snapshots:await m.listSnapshots(scope.accountId,scope.spaceId)}]));
 const value=Object.fromEntries(rows.map(([scope,stores])=>[scope,hash(stores)]));readDetails.set(value,Object.fromEntries(rows));return value;
};
const fields=value=>value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().slice(0,24).map(key=>[key,hash(value[key]===undefined?'undefined':value[key])])):{};
const rowSummary=(row,store)=>({hash:hash(row),type:row.type,identity:hash(String(row.key??row.id??row.documentId??'')),keyKind:store==='snapshots'?String(row.key).split('|')[0].slice(0,50):undefined,status:row.status,syncState:row.syncState,baseVersion:row.baseVersion,updatedAt:row.updatedAt,createdAt:row.createdAt,contentUpdatedAt:row.content?.updatedAt,contentRevision:row.content?.revision,valueObservedAt:row.value?.observedAt,fields:fields(row),contentFields:fields(row.content),valueFields:fields(row.value)});
const stateDifference=(before,after)=>{
 const a=readDetails.get(before),b=readDetails.get(after),result=[];if(!a||!b)return result;
 for(const scope of Object.keys(a))for(const store of ['drafts','queue','blobs','snapshots']){const old=a[scope][store],next=b[scope][store];if(hash(old)===hash(next))continue;const rowKey=row=>String(store==='drafts'?row.type+'|'+row.documentId:row.key??row.id),left=new Map(old.map(row=>[rowKey(row),row])),right=new Map(next.map(row=>[rowKey(row),row]));const changes=[];
  for(const key of new Set([...left.keys(),...right.keys()])){const first=left.get(key),last=right.get(key);if(hash(first??null)===hash(last??null))continue;changes.push({identity:hash(key),before:first?rowSummary(first,store):null,after:last?rowSummary(last,store):null});if(changes.length===8)break;}
  result.push({scope,store,before:{count:old.length,hash:hash(old)},after:{count:next.length,hash:hash(next)},changes});if(result.length===12)return result;
 }return result;
};
const verifyCurrentObservation=(f,old,next,stores,scope)=>{
 const documentId=m.notebookDocumentId(f.noteId),key=`paper-legacy-observation|${scope.accountId}|${scope.spaceId}|whiteboard|${documentId}`;
 assert.equal(next.key,key);assert.equal(old.key,key);assert.equal(next.accountId,scope.accountId);assert.equal(next.spaceId,scope.spaceId);assert.deepEqual({...next,value:old.value},old,'Observation row ownership and all outer fields must stay exact');
 const a=old.value,b=next.value;for(const value of [a,b]){assert.equal(value.schema,1);assert.equal(value.kind,'paper-legacy-observation');assert.equal(value.noteId,f.noteId);assert.equal(value.documentId,documentId);}
 const {observedAt:oldDate,sourceMetadata:oldSource,...oldStable}=a,{observedAt:newDate,sourceMetadata:newSource,...newStable}=b;
 assert.deepEqual(newStable,oldStable,'paperRevision, observed, sourceBoard and every other observation field must remain exact');
 assert.equal(typeof oldDate,'string');assert.equal(typeof newDate,'string');assert.ok(Number.isFinite(Date.parse(oldDate))&&Number.isFinite(Date.parse(newDate)));assert.ok(Date.parse(newDate)>=Date.parse(oldDate),'Current observation time must be monotone');
 const latest=stores.drafts.find(row=>row.type==='notesMarkdown'&&row.documentId===f.noteId),canonical=stores.drafts.find(row=>row.type==='whiteboard'&&row.documentId===documentId);assert.ok(latest&&canonical);assert.equal(latest.accountId,scope.accountId);assert.equal(latest.spaceId,scope.spaceId);assert.deepEqual(newSource,latest,'An updated observation must reference the exact newest durable metadata of its current owner');assert.equal(b.paperRevision,canonical.content.revision);
 f.observationChecks??=[];f.observationChecks.push({keyHash:hash(key),accountId:scope.accountId,spaceId:scope.spaceId,oldObservedAt:oldDate,newObservedAt:newDate,sourceMetadataHash:hash(newSource),latestDraftHash:hash(latest),changedValueFields:Object.keys(b).filter(field=>hash(b[field]??null)!==hash(a[field]??null)),semantics:'Only current observation date and exact latest sourceMetadata may evolve; all other row fields, data, recovery and key sets remain exact'});
};
const unchanged=async(f,before,allowCurrentObservation=false)=>{
 const after=await read(f);f.difference=stateDifference(before,after);if(!allowCurrentObservation){assert.deepEqual(after,before);return;}
 const a=readDetails.get(before),b=readDetails.get(after),current={accountId:f.A.id,spaceId:f.years[0].id};assert.ok(matchesPaper(paperState(f),current,f),'Only the active reopened current Notebook may refresh its observation');assert.deepEqual(Object.keys(b),Object.keys(a));
 for(const scopeKey of Object.keys(a)){const scope=JSON.parse(scopeKey),old=a[scopeKey],next=b[scopeKey];for(const store of ['drafts','queue','blobs'])assert.deepEqual(next[store],old[store],`Every ${store} row must remain exact across the old continuation`);
  const left=new Map(old.snapshots.map(row=>[row.key,row])),right=new Map(next.snapshots.map(row=>[row.key,row]));assert.deepEqual([...right.keys()].sort(),[...left.keys()].sort(),'All snapshot keys, including recovery originals, must stay exact');
  const allowedKey=`paper-legacy-observation|${current.accountId}|${current.spaceId}|whiteboard|${m.notebookDocumentId(f.noteId)}`;
  for(const [key,previous] of left){const latest=right.get(key);if(hash(latest)===hash(previous)){assert.deepEqual(latest,previous);continue;}assert.equal(scope.accountId,current.accountId);assert.equal(scope.spaceId,current.spaceId);assert.equal(key,allowedKey,'No other data or recovery snapshot may change');verifyCurrentObservation(f,previous,latest,next,current);}
 }
};
const diagnostic=f=>({phase:f.phase,phases:f.events?.slice(-30),year:f.container.querySelector('[aria-label="Mon année"]')?.value,account:f.container.querySelector('header .brand small')?.textContent,authPresent:!!f.container.querySelector('.auth-card'),active:activeView(f),http:f.http.slice(-10),difference:f.difference,validatedCurrentObservations:f.observationChecks,creation:f.creationLedger,operations:operations.size,pendingWriters:m.hasPendingNotebookWrites()});
const fakeFetch=(url,init={})=>tracked((async()=>{
 const f=remoteFixture;assert.ok(f,'HTTP without an owned fixture');const path=new URL(String(url),'https://qa.invalid').pathname,method=init.method??'GET';
 f.http.push({path,method,account:new Headers(init.headers).get('X-Dowze-Account')});
 if(path==='/v1/me')return Response.json(f.remoteAccount);
 if(path==='/v1/csrf')return Response.json({csrf_token:'synthetic-csrf-'+f.remoteAccount.id});
 if(path==='/v1/sessions'&&method==='POST'){const body=JSON.parse(init.body);f.remoteAccount=body.email===f.B.email?f.B:f.A;return Response.json({csrf_token:'synthetic-login-'+f.remoteAccount.id,expires_at:'2030-01-01T00:00:00Z'});}
 if(path==='/v1/catalog')return Response.json({items:[]});
 if(path==='/v1/spaces'&&method==='GET')return Response.json({items:f.years});
 if(method==='GET'&&path.endsWith('/changes'))return Response.json({items:[],next_cursor:'',has_more:false});
 if(method==='PUT'&&path.includes('/documents/notesMarkdown/')){
  assert.equal(f.armed,true,'Background sync must not consume this Save admission');assert.equal(f.puts.length,0,'One real Save request must own the deferred JSON response');
  const body=JSON.parse(init.body);f.puts.push({path,body,account:new Headers(init.headers).get('X-Dowze-Account')});online(false);
  if(f.mode==='network'){f.entered.release();await f.hold.promise;throw new TypeError('Synthetic transport acknowledgement lost');}
  const response=f.mode==='conflict'?Response.json({code:'version_conflict',message:'Synthetic stable version conflict',current_version:8},{status:409}):Response.json({version:8});
  const json=response.json.bind(response);response.json=()=>tracked((async()=>{const actual=await json();phase(f,'real JSON parsed and held');f.entered.release();await f.hold.promise;phase(f,'real JSON released');return actual;})());return response;
 }
 throw Error('Unexpected actual App HTTP '+method+' '+path);
})());

const seed=async(f,scope)=>{
 const now='2026-10-15T10:00:00Z',note={...scope,type:'notesMarkdown',documentId:f.noteId,title:'Original '+scope.accountId+' '+scope.spaceId,content:{id:f.noteId,title:'Original '+scope.accountId+' '+scope.spaceId,markdown:'',subjectIds:[],tags:['original'],createdAt:now,updatedAt:now},baseVersion:7,updatedAt:1,syncState:'synced'};
 const plain=m.migratePaper(f.noteId,'',null,now);plain.objects=[];const document=m.amendPaperCollaboration(plain,plain);
 await m.putDraft(note);await m.putDraft({...scope,type:'whiteboard',documentId:m.notebookDocumentId(f.noteId),title:note.title,content:document,baseVersion:7,updatedAt:1,syncState:'synced'});
 await m.putDraft({...scope,type:'preferences',documentId:m.LIBRARY_DOCUMENT_ID,title:'Library',content:m.emptyNotebookLibrary(),baseVersion:7,updatedAt:1,syncState:'synced'});
 await m.putSnapshot({key:`paper-migration|${scope.accountId}|${scope.spaceId}|whiteboard|${m.notebookDocumentId(f.noteId)}`,accountId:scope.accountId,spaceId:scope.spaceId,value:{markdown:'',legacy:null,migratedAt:now}});
 return note;
};
const mount=async(mode='success')=>{
 online(false);lastClient?.forgetSession();localStorage.clear();const n=++sequence,A={id:'save-owner-A-'+n,email:'a'+n+'@example.invalid',created_at:'2026-10-15'},B={id:'save-owner-B-'+n,email:'b'+n+'@example.invalid',created_at:'2026-10-15'};
 const years=['one','two'].map((id,index)=>({id:'year-'+id,formation_id:'synthetic',academic_year:'202'+index,title:'Year '+id,created_at:'2026-10-15'}));
 const f={A,B,years,noteId:'save-note-'+n,remoteAccount:A,mode,entered:deferred(),hold:deferred(),puts:[],http:[],codes:[],armed:false,live:true,createdAt:Date.now(),phase:'seed',events:[]};f.scopes=[A,B].flatMap(account=>years.map(year=>({accountId:account.id,spaceId:year.id})));
 for(const scope of f.scopes)await seed(f,scope);
 for(const account of [A,B]){localStorage.setItem('dowze.spaces.'+account.id,JSON.stringify(years));localStorage.setItem('dowze.active-space.'+account.id,years[0].id);}
 remoteFixture=f;f.container=document.createElement('div');document.body.append(f.container);f.root=m.createRoot(f.container);fixtures.add(f);
 await m.act(async()=>{f.root.render(m.createElement(m.App));await tick();});
 await wait(()=>f.container.querySelector('[aria-label="Mon année"]')?.value===years[0].id&&f.container.querySelector('.note-card-open'),'The real App must open its cached account/year');
 await click(f.container.querySelector('.note-card-open'));
 await wait(()=>saveButton(f)&&f.container.querySelector('.paper-notebook'),'The real PwaNotePane and Notebook must mount');
 const pane=fiber(f,row=>row.type===m.PwaNotePane).memoizedProps;f.client=pane.media.api;assert.ok(f.client instanceof m.ApiClient);lastClient=f.client;
 const original=f.client.putDocument;f.restore=()=>{f.client.putDocument=original;};f.client.putDocument=function(...args){const pending=original.apply(this,args);void pending.catch(error=>f.codes.push({name:error.name,status:error.status,code:error.code}));return pending;};
 await m.act(async()=>{await m.settleAllNotebookAccounts();m.resumeAllNotebookAccounts();await tick();});
 await openedCurrentPaper(f,{accountId:f.A.id,spaceId:f.years[0].id});assert.equal(m.hasPendingNotebookWrites(),false);assert.equal(f.puts.length,0);phase(f,'mounted writers settled');return f;
};
const switchYear=async(f,index)=>{await select(f.container.querySelector('[aria-label="Mon année"]'),f.years[index].id);await wait(()=>f.container.querySelector('[aria-label="Titre de la première note"]')?.value.includes(f.years[index].id)||f.container.querySelector('[aria-label="Titre de la première note"]')?.value==='Newer durable A','The real App must reload its selected year');await openedCurrentPaper(f,{accountId:f.A.id,spaceId:f.years[index].id});};
const login=async(f,account)=>{
 phase(f,'storage account switch to '+(account.id===f.A.id?'A':'B'));
 await m.act(async()=>{const value=JSON.stringify(account);localStorage.setItem('dowze.offline-account',value);dispatchEvent(new dom.window.StorageEvent('storage',{key:'dowze.offline-account',newValue:value,url:'https://qa.invalid/'}));await tick();});
 await wait(()=>f.container.querySelector('form input[name="email"]'),'A real storage account event must revoke App and show Auth');
 await fill(f,f.container.querySelector('input[name="email"]'),account.email);await fill(f,f.container.querySelector('input[name="password"]'),'synthetic-not-a-secret');
 phase(f,'submit real Auth for '+(account.id===f.A.id?'A':'B'));await m.act(async()=>{f.container.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await tick();});
 await wait(()=>f.container.querySelector('header .brand small')?.textContent===account.email&&f.container.querySelector('[aria-label="Mon année"]')?.value===f.years[0].id,'The actual Auth/API login must mount the requested account');
 await wait(()=>saveButton(f)||f.container.querySelector('.note-card-open'),'The logged-in account must expose its retained note');if(!saveButton(f))await click(f.container.querySelector('.note-card-open'));await openedCurrentPaper(f,{accountId:account.id,spaceId:f.years[0].id});
};
const unmount=async f=>{if(f.live){await m.act(async()=>{f.root.unmount();await tick();});f.live=false;}f.container.remove();};
const newButton=f=>buttons(f).find(node=>node.classList.contains('note-library-create')&&node.textContent==='Nouvelle note');
const activeView=f=>{let selected;try{selected=fiber(f,row=>row.type===m.PwaNotePane&&row.memoizedProps?.primary).memoizedProps;}catch{}return {id:selected?.note.documentId??null,accountId:selected?.note.accountId??null,spaceId:selected?.note.spaceId??null,title:selected?.note.title??null,notice:f.container.querySelector('.notice')?.textContent??null};};
const library=async f=>{const back=buttons(f).find(node=>node.textContent==='Mes notes');if(back)await click(back);await wait(()=>newButton(f),'The actual library must expose New note');};
function invokeCreation(f,handler,{expectAdmission=true}={}){
 const descriptor=Object.getOwnPropertyDescriptor(Promise.prototype,'then'),native=descriptor.value,nativeOpen=factory.open,chains=[];let returned,opens=0;
 // Observe only the original synchronous handler call, returning the identical
 // native Promises. Restore the exact descriptor before any await or React act.
 Object.defineProperty(Promise.prototype,'then',{...descriptor,value:function(...args){const result=Reflect.apply(native,this,args);chains.push(result);return result;}});
 factory.open=function(...args){opens++;return Reflect.apply(nativeOpen,this,args);};
 try{returned=handler();}finally{factory.open=nativeOpen;Object.defineProperty(Promise.prototype,'then',descriptor);}
 if(returned&&typeof returned.then==='function')chains.push(returned);
 const complete=[...new Set(chains)].map(promise=>tracked(promise,'Complete original App.newNote chain'));if(expectAdmission||opens)assert.ok(complete.length,'An admitted void handler without an observable then chain or returned Promise is a fixture failure');
 f.creationLedger??=[];f.creationLedger.push({chains:complete.length,synchronousNativeOpens:opens,returnedPromise:!!returned&&typeof returned.then==='function'});return {complete,opens,settled:()=>bounded(Promise.allSettled(complete),'Every actual New note chain settled')};
}
const invoke=async(f,handler,options)=>{let operation;await m.act(async()=>{operation=invokeCreation(f,handler,options);await tick();});return operation;};
function holdCreationOpen(f,{quota=false}={}){
 const nativeOpen=factory.open,entered=deferred(),hold=deferred(),terminals=[],ledger={opens:0,puts:0,successfulWrites:0,aborts:0,completes:0,closed:0,row:null};let used=false;
 factory.open=function(...args){const request=Reflect.apply(nativeOpen,this,args);if(!used&&(new Error().stack??'').includes('newNote')){used=true;let callback;Object.defineProperty(request,'onsuccess',{configurable:true,get:()=>callback,set:fn=>{callback=typeof fn==='function'?event=>{
  ledger.opens++;const db=request.result,nativeClose=db.close,nativeTx=db.transaction;db.close=function(...args){ledger.closed++;return Reflect.apply(nativeClose,this,args);};
  db.transaction=function(...args){const tx=Reflect.apply(nativeTx,this,args);terminals.push(tracked(new Promise(resolve=>{tx.addEventListener('complete',()=>{ledger.completes++;resolve();},{once:true});tx.addEventListener('abort',()=>{ledger.aborts++;resolve();},{once:true});}),'Real creation native transaction terminal'));
   if(tx.mode==='readwrite'&&Array.from(tx.objectStoreNames).includes('drafts')){const objectStore=tx.objectStore.bind(tx);tx.objectStore=name=>{const store=objectStore(name);if(name==='drafts'){const put=store.put;store.put=function(value,...args){ledger.puts++;ledger.row=structuredClone(value);const result=Reflect.apply(put,this,[value,...args]);result.addEventListener('success',()=>{ledger.successfulWrites++;if(quota)throw new DOMException('Synthetic quota after actual new note put','QuotaExceededError');},{once:true});return result;};}return store;};}return tx;};
  entered.release();tracked(hold.promise.then(()=>fn.call(request,event)),'Deliver actual creation open success after release');
 }:fn;}});}return request;};
 const restore=()=>{factory.open=nativeOpen;restorers.delete(restore);};restorers.add(restore);return {entered:entered.promise,release:hold.release,ledger,restore,settled:()=>bounded(Promise.all(terminals),'Actual creation native terminal')};
}
function observeCurrentSchedulers(f){
 const app=fiber(f,row=>row.type===m.App),targets=new Set(),calls=[];for(let hook=app.memoizedState;hook;hook=hook.next){const value=hook.memoizedState?.current;if(value&&typeof value.request==='function'&&typeof value.stop==='function')targets.add(value);}assert.equal(targets.size,2,'Observe actual App upload and download scheduler refs');
 const restore=[];for(const target of targets){const native=target.request;target.request=function(...args){calls.push({index:[...targets].indexOf(target),args});return Reflect.apply(native,this,args);};restore.push(()=>{target.request=native;});}
 const cleanup=()=>{for(const done of restore)done();restorers.delete(cleanup);};restorers.add(cleanup);return {calls,restore:cleanup};
}
const drain=async()=>{
 online(false);for(const release of gates)release();gates.clear();await drainOperations('All original New note/HTTP/native operations before restore');
 await m.act(async()=>{await bounded(m.settleAllNotebookAccounts(),'Actual mounted writer settlement');m.resumeAllNotebookAccounts();await tick();});for(const f of fixtures){f.restore?.();await unmount(f);}await drainOperations('Post-unmount actual native terminals');for(const restore of [...restorers])restore();assert.equal(operations.size,0);assert.equal(transactionLedger.started,transactionLedger.complete+transactionLedger.aborted);assert.equal(m.hasPendingNotebookWrites(),false);assert.deepEqual(Object.getOwnPropertyDescriptor(Promise.prototype,'then'),originalThenDescriptor);fixtures.clear();remoteFixture=undefined;
};
const group=async(name,work)=>{const timeoutStart=timedOutOperations.length;let row;try{await bounded(tracked(Promise.resolve().then(work),'Complete '+name),name,3*operationTimeoutMs);row={name,status:'PASS'};report.passed++;}catch(error){row={name,status:'FAIL',error:String(error?.stack??error).slice(0,1900)};report.failed++;}if(remoteFixture)row.diagnostic=diagnostic(remoteFixture);report.groups.push(row);console.log(name+': '+row.status);try{await drain();row.timeouts=timedOutOperations.slice(timeoutStart);if(row.timeouts.length)throw Error('A timeout cannot satisfy a New note refusal');row.cleanup='PASS';}catch(error){row.cleanup='FAIL';row.cleanupError=String(error?.message??error);if(row.status==='PASS'){row.status='FAIL';report.passed--;report.failed++;}throw error;}};

async function setup(){const f=await mount();await library(f);await m.act(async()=>{await bounded(m.settleAllNotebookAccounts(),'Initial accepted writers');m.resumeAllNotebookAccounts();await tick();});assert.equal(m.hasPendingNotebookWrites(),false);return f;}
function verifyCreatedSnapshots(rows,stores,scope,noteId){
 const documentId=m.notebookDocumentId(noteId),prefix=`${scope.accountId}|${scope.spaceId}|whiteboard|${documentId}`,byKind=new Map();
 assert.equal(rows.length,4,'A blank first opening creates exactly migration, history, observation and recovery receipts');
 for(const row of rows){assert.equal(row.accountId,scope.accountId);assert.equal(row.spaceId,scope.spaceId);const kind=row.key.split('|')[0];assert.ok(!byKind.has(kind),'A blank first opening cannot invent duplicate receipt kinds');byKind.set(kind,row);}
 assert.deepEqual([...byKind.keys()].sort(),['paper-history','paper-legacy-observation','paper-legacy-recovery','paper-migration']);
 const migration=byKind.get('paper-migration'),history=byKind.get('paper-history'),observation=byKind.get('paper-legacy-observation'),recovery=byKind.get('paper-legacy-recovery');
 const metadata=stores.drafts.find(row=>row.type==='notesMarkdown'&&row.documentId===noteId),canonical=stores.drafts.find(row=>row.type==='whiteboard'&&row.documentId===documentId);assert.ok(metadata&&canonical);
 assert.equal(migration.key,`paper-migration|${prefix}`);const initial=migration.value;assert.equal(initial.schema,1);assert.equal(initial.kind,'paper-legacy-initial-migration');assert.equal(initial.noteId,noteId);assert.equal(initial.documentId,documentId);assert.equal(initial.markdown,'');assert.equal(initial.legacy,null);assert.ok(Number.isFinite(Date.parse(initial.migratedAt)));
 for(const name of ['photoIdentities','imageBindings','imageReceiptKeys','files'])assert.deepEqual(initial[name],[],'A new blank note cannot borrow legacy media or bindings');
 const {paperDependency,updatedAt,...latestSource}=metadata,{paperDependency:originalDependency,updatedAt:originalTime,...originalSource}=initial.sourceMetadata;assert.equal(paperDependency,documentId);assert.equal(originalDependency,undefined);assert.ok(Number.isFinite(originalTime)&&Number.isFinite(updatedAt)&&updatedAt>=originalTime);assert.deepEqual(originalSource,latestSource,'Initial migration must preserve the exact metadata it admitted apart from its later dependency and durable timestamp');
 assert.equal(history.key,`paper-history|${prefix}|${String(initial.canonical.revision).padStart(12,'0')}`);assert.deepEqual(history.value,initial.canonical,'The complete original migrated graph remains in its exact history receipt');assert.equal(initial.canonical.noteId,noteId);assert.equal(initial.canonical.notebookSchema,3);assert.equal(initial.canonical.legacy.markdown,'');assert.equal(initial.canonical.pages.length,1);assert.deepEqual(initial.canonical.assets,[]);assert.deepEqual(initial.canonical.audio,[]);assert.ok(initial.canonical.objects.every(object=>object.kind==='text'&&object.markdown===''),'The migrated blank graph contains no borrowed object');
 assert.equal(observation.key,`paper-legacy-observation|${prefix}`);const observed=observation.value;assert.ok(Number.isFinite(Date.parse(observed.observedAt)));assert.deepEqual(observed,{schema:1,kind:'paper-legacy-observation',noteId,documentId,observed:{markdown:'',board:null},baselineKnown:true,paperRevision:canonical.content.revision,observedAt:observed.observedAt,sourceMetadata:metadata,sourceBoard:null});
 const recoveryPrefix=`paper-legacy-recovery|${prefix}|`;assert.ok(recovery.key.startsWith(recoveryPrefix));assert.match(recovery.key.slice(recoveryPrefix.length),/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);assert.ok(Number.isFinite(Date.parse(recovery.value.at)));assert.deepEqual(recovery.value,{schema:1,noteId,at:recovery.value.at,beforePaper:canonical,incoming:{markdown:'',board:null},sourceMetadata:metadata,sourceBoard:null,baseline:{markdown:'',board:null},previousReceipt:null,fileIds:[]},'The first bridge preserves the exact new-note graph and empty sources in its recovery receipt');
}
async function assertPreserved(f,before,{addedMetadata=null,allowCurrentObservation=false,createdId=null}={}){
 const after=await read(f),a=readDetails.get(before),b=readDetails.get(after);f.difference=stateDifference(before,after);assert.deepEqual(Object.keys(b),Object.keys(a));
 for(const scopeKey of Object.keys(a)){
  const scope=JSON.parse(scopeKey),old=a[scopeKey],next=b[scopeKey],isOwner=scope.accountId===f.A.id&&scope.spaceId===f.years[0].id;
  let kept=next.drafts;if(addedMetadata&&isOwner){const added=next.drafts.filter(row=>row.type===addedMetadata.type&&row.documentId===addedMetadata.documentId);assert.deepEqual(added,[addedMetadata],'Exactly the admitted original metadata must finish in its original scope');kept=next.drafts.filter(row=>row.type!==addedMetadata.type||row.documentId!==addedMetadata.documentId);}
  if(createdId&&isOwner){const added=next.drafts.filter(row=>!old.drafts.some(previous=>previous.type===row.type&&previous.documentId===row.documentId));assert.equal(added.length,2,'Actual new-note opening creates only its metadata and canonical graph');assert.ok(added.some(row=>row.type==='notesMarkdown'&&row.documentId===createdId));assert.ok(added.some(row=>row.type==='whiteboard'&&row.documentId===m.notebookDocumentId(createdId)));kept=next.drafts.filter(row=>old.drafts.some(previous=>previous.type===row.type&&previous.documentId===row.documentId));}
  assert.deepEqual(kept,old.drafts,'Every previously admitted draft remains exact');assert.deepEqual(next.queue,old.queue,'No old or foreign outbox row may change');assert.deepEqual(next.blobs,old.blobs,'No old or foreign media row may change');
  const left=new Map(old.snapshots.map(row=>[row.key,row])),right=new Map(next.snapshots.map(row=>[row.key,row]));for(const [key,previous]of left){const latest=right.get(key);assert.ok(latest,'No existing snapshot can disappear');if(hash(previous)===hash(latest)){assert.deepEqual(latest,previous);continue;}
   assert.ok(allowCurrentObservation&&isOwner,'Only the explicitly current observation may refresh');assert.equal(key,`paper-legacy-observation|${scope.accountId}|${scope.spaceId}|whiteboard|${m.notebookDocumentId(f.noteId)}`);verifyCurrentObservation(f,previous,latest,next,scope);
  }
  const extra=[...right.values()].filter(row=>!left.has(row.key));if(createdId&&isOwner)verifyCreatedSnapshots(extra,next,scope,createdId);else assert.deepEqual(extra,[],'No snapshot may be invented by an old continuation');
 }
 return b;
}
async function stableCreate(f){
 await library(f);const before=await read(f),handler=props(f,newButton(f)).onClick,operation=await invoke(f,handler);await m.act(async()=>{await operation.settled();await tick();});await wait(()=>activeView(f).id&&activeView(f).id!==f.noteId,'The actual current New note must select its admitted note');const id=activeView(f).id;assert.equal(activeView(f).title,'Nouvelle note');
 const originalId=f.noteId;f.noteId=id;try{await openedCurrentPaper(f,{accountId:f.A.id,spaceId:f.years[0].id});}finally{f.noteId=originalId;}
 const metadata=await m.getDraft({...identity(f),documentId:id}),canonical=await m.getDraft({...identity(f),type:'whiteboard',documentId:m.notebookDocumentId(id)});assert.ok(metadata&&canonical);assert.equal(metadata.content.id,id);assert.equal(metadata.title,'Nouvelle note');assert.equal(metadata.content.title,'Nouvelle note');assert.equal(metadata.content.markdown,'');assert.deepEqual(metadata.content.tags,[]);assert.deepEqual(metadata.content.subjectIds,[]);assert.ok(Number.isFinite(Date.parse(metadata.content.createdAt)));assert.equal(canonical.content.noteId,id);assert.equal(canonical.content.legacy.markdown,'');assert.equal(canonical.content.pages.length,1);assert.equal(canonical.content.assets.length,0);assert.equal(canonical.content.audio.length,0);assert.ok(canonical.content.objects.filter(row=>row.kind==='text'||row.kind==='sticky').every(row=>row.markdown.trim()===''));
 await assertPreserved(f,before,{createdId:id});assert.equal(f.puts.length,0);return id;
}
async function retired(kind){
 const f=await setup(),handler=props(f,newButton(f)).onClick;if(kind==='unmount')await unmount(f);else if(kind==='account'){await login(f,f.B);await login(f,f.A);}else{await click(f.container.querySelector('.note-card-open'));await switchYear(f,1);await switchYear(f,0);}
 const before=await read(f),view=activeView(f),schedulers=kind==='unmount'?null:observeCurrentSchedulers(f),operation=await invoke(f,handler,{expectAdmission:false});await m.act(async()=>{await operation.settled();await tick();});await assertPreserved(f,before,{allowCurrentObservation:kind!=='unmount'});assert.deepEqual(activeView(f),view,'A retired callback cannot publish a new tab/focus/notice');if(schedulers)assert.deepEqual(schedulers.calls,[],'A retired callback cannot schedule work in the new incarnation');
 if(kind==='unmount')assert.equal(document.querySelector('.app-shell'),null);else{await library(f);await stableCreate(f);}assert.equal(f.puts.length,0);
}
async function admitted(kind,{quota=false}={}){
 const f=await setup(),handler=props(f,newButton(f)).onClick,seam=holdCreationOpen(f,{quota}),operation=await invoke(f,handler);await bounded(seam.entered,'Actual New note opening native database');assert.equal(seam.ledger.opens,1);assert.equal(seam.ledger.puts,0,'The actual admitted open is held before its real transaction');
 if(kind==='unmount')await unmount(f);else if(kind==='account'){await login(f,f.B);await login(f,f.A);}else{await click(f.container.querySelector('.note-card-open'));await switchYear(f,1);await switchYear(f,0);}
 if(kind!=='unmount'){await fill(f,f.container.querySelector('[aria-label="Titre de la première note"]'),'Fresh A focus retained');await wait(async()=>{const row=await m.getDraft(identity(f));return row?.title==='Fresh A focus retained'&&!m.hasPendingNotebookWrites();},'Actual fresh-incarnation edit durable');await openedCurrentPaper(f,{accountId:f.A.id,spaceId:f.years[0].id});}
 const before=await read(f),focus=f.container.querySelector('[aria-label="Titre de la première note"]');if(focus)focus.focus();const view=activeView(f),schedulers=kind==='unmount'?null:observeCurrentSchedulers(f);seam.restore();phase(f,'Release only the old admitted native database open');await m.act(async()=>{seam.release();await operation.settled();await seam.settled();await tick();});
 assert.equal(seam.ledger.puts,1);assert.equal(seam.ledger.successfulWrites,1);assert.ok(seam.ledger.closed>=1);if(quota){assert.equal(seam.ledger.aborts,1);assert.equal(seam.ledger.completes,0);await assertPreserved(f,before,{allowCurrentObservation:true});}else{assert.equal(seam.ledger.aborts,0);assert.equal(seam.ledger.completes,1);assert.equal(seam.ledger.row.accountId,f.A.id);assert.equal(seam.ledger.row.spaceId,f.years[0].id);await assertPreserved(f,before,{addedMetadata:seam.ledger.row,allowCurrentObservation:kind!=='unmount'});}
 assert.deepEqual(activeView(f),view,'Finishing an old creation cannot steal the fresh active tab or notice');if(focus)assert.equal(document.activeElement,focus,'The exact fresh title field must retain actual DOM focus');if(schedulers)assert.deepEqual(schedulers.calls,[],'The old completion cannot request the new incarnation schedulers');assert.equal(f.puts.length,0);if(kind==='unmount')assert.equal(document.querySelector('.app-shell'),null);
}

try{
 report.sourceHashes=Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,hash(await readFile(path,'utf8'))])));
 process.env.NODE_ENV='development';await build({configFile:false,ssr:{noExternal:['yjs','lib0']},build:{ssr:'tests/paper-pwa-new-note-owner-entry.ts',outDir:out,copyPublicDir:false,minify:false,sourcemap:false,reportCompressedSize:false,rollupOptions:{preserveEntrySignatures:'strict',output:{entryFileNames:'pwa-new-note-owner.mjs'}}},logLevel:'error'});
 dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://qa.invalid/'});
 for(const name of ['HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLButtonElement','Element','SVGElement','Node','NodeFilter','DOMParser','MutationObserver','Event','InputEvent','CustomEvent','KeyboardEvent','CompositionEvent','StorageEvent','ShadowRoot'])Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:dom.window[name]});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,getComputedStyle:dom.window.getComputedStyle.bind(dom.window),addEventListener:dom.window.addEventListener.bind(dom.window),removeEventListener:dom.window.removeEventListener.bind(dom.window),dispatchEvent:dom.window.dispatchEvent.bind(dom.window),indexedDB:factory,IDBKeyRange,BroadcastChannel:undefined,localStorage:dom.window.localStorage,innerWidth:1280,innerHeight:800,IS_REACT_ACT_ENVIRONMENT:true,fetch:fakeFetch});
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});online(false);Object.defineProperty(document,'fonts',{configurable:true,value:{ready:Promise.resolve()}});
 globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};globalThis.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};dom.window.ResizeObserver=ResizeObserver;dom.window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
 globalThis.requestAnimationFrame=callback=>{const id=++rafSequence;rafTimers.set(id,setTimeout(()=>{rafTimers.delete(id);callback(performance.now());},10));return id;};globalThis.cancelAnimationFrame=id=>{clearTimeout(rafTimers.get(id));rafTimers.delete(id);};dom.window.requestAnimationFrame=requestAnimationFrame;dom.window.cancelAnimationFrame=cancelAnimationFrame;
 globalThis.DOMMatrix=class{constructor(){this.a=1;this.b=0;this.c=0;this.d=1;this.e=0;this.f=0;}inverse(){return this;}};
 dom.window.HTMLElement.prototype.getBoundingClientRect=dom.window.SVGElement.prototype.getBoundingClientRect=function(){return new dom.window.DOMRect(0,0,900,600);};for(const [name,value] of [['clientWidth',900],['clientHeight',600],['offsetHeight',56]])Object.defineProperty(dom.window.HTMLElement.prototype,name,{configurable:true,get:()=>value});
 dom.window.Range.prototype.getBoundingClientRect=()=>new dom.window.DOMRect(0,0,1,20);dom.window.Range.prototype.getClientRects=function(){return [this.getBoundingClientRect()];};dom.window.Element.prototype.scrollIntoView=()=>{};
 m=await import(pathToFileURL(join(out,'pwa-new-note-owner.mjs')));await m.appStorage.initialize(dom.window.localStorage,factory);
 await group(names[0],async()=>{const f=await setup();await stableCreate(f);});
 await group(names[1],()=>retired('account'));
 await group(names[2],()=>retired('year'));
 await group(names[3],()=>retired('unmount'));
 await group(names[4],()=>admitted('account'));
 await group(names[5],()=>admitted('year'));
 await group(names[6],()=>admitted('account',{quota:true}));
 await group(names[7],()=>admitted('unmount'));
}catch(error){report.fatal=String(error?.stack??error).slice(0,2200);process.exitCode=1;}
finally{
 for(const release of gates)release();
 try{
  if(m){await drain();await bounded(m.appStorage.flush(),'Final real cache flush');m.appStorage.close();}await drainOperations('All final native cache/storage terminals before restore');assert.equal(transactionLedger.started,transactionLedger.complete+transactionLedger.aborted);factory.open=nativeFactoryOpen;
  await mountedCleanup([['Owned fake databases',async()=>{for(const name of ['dowze-academie-pwa','dowze-academie-device-cache'])await new Promise((resolve,reject)=>{const request=factory.deleteDatabase(name);request.onsuccess=resolve;request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Owned database is still open'));});}],['RAF',()=>{for(const timer of rafTimers.values())clearTimeout(timer);rafTimers.clear();}],['DOM',()=>dom?.window.close()],['Exact globals',()=>{assert.deepEqual(Object.getOwnPropertyDescriptor(Promise.prototype,'then'),originalThenDescriptor);for(const [name,descriptor] of originals)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];if(oldNodeEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=oldNodeEnv;}],['Bundle',()=>rm(out,{recursive:true,force:true})]]);report.cleanup='PASS';
 }catch(error){report.cleanup='FAIL';report.cleanupError=String(error?.stack??error).slice(0,1600);process.exitCode=1;}
 try{report.sourceHashesAfter=Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,hash(await readFile(path,'utf8'))])));assert.deepEqual(report.sourceHashesAfter,report.sourceHashes);report.finalFreeze='PASS';}catch(error){report.finalFreeze='FAIL';report.freezeError=String(error?.message??error);process.exitCode=1;}
 report.operationsRemaining=operations.size;report.pendingLabels=[...operations.values()].map(row=>row.label).slice(0,8);report.fixturesRemaining=fixtures.size;report.nativeTransactions=transactionLedger;report.timedOutOperations=timedOutOperations;report.lateErrors=lateErrors;report.notRunGroups=names.length-report.groups.length;for(const name of names.slice(report.groups.length))report.groups.push({name,status:'NOTRUN',reason:'Previous setup or terminal cleanup did not complete'});
 report.fullSuite=report.notRunGroups===0&&report.passed===names.length&&!report.failed&&!report.fatal&&timedOutOperations.length===0&&report.operationsRemaining===0&&report.fixturesRemaining===0&&report.cleanup==='PASS'&&report.finalFreeze==='PASS';if(!report.fullSuite)process.exitCode=1;report.finishedAt=new Date().toISOString();const path=mountedAuditPath('paper-pwa-new-note-owner-mounted-20261015.json');await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,failed:report.failed,notRun:report.notRunGroups,cleanup:report.cleanup,fullSuite:report.fullSuite,finalFreeze:report.finalFreeze,report:path}));
}
