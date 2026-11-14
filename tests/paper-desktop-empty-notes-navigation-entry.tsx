/** NOT RUN by its author. Actual Desktop App, ServerSettings and native IDB.
 * The authenticated local-profile parent and Tauri IPC backend are explicit
 * private seams; no native OS window/authentication/backend claim. */
import {createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import App from '../src/App';
import {appStorage} from '../src/lib/appStorage';
import {loadFormationCatalog} from '../src/lib/formationRegistry';
import {formationStorageFor} from '../src/lib/profileStorage';
import type {LocalAccount} from '../src/lib/localAuth';
import {EMPTY_SUBJECT_NOTES_STORE} from '../src/lib/subjectNotes';
import {emptyNotebookLibrary,LIBRARY_DOCUMENT_ID} from '../src/lib/notebookLibrary';
import {migratePaper,notebookDocumentId} from '../src/lib/notebookDocument';
import {amendPaperCollaboration} from '../src/lib/paperCollaboration';
import {getDraft,putDraft,putSnapshot,listDrafts,listMutations,listSnapshots,listLocalBlobs} from '../pwa/src/storage';
import {settleAllNotebookAccounts,resumeAllNotebookAccounts,hasPendingNotebookWrites} from '../src/lib/notebookSession';
import '../src/styles.css';
import '../src/ui-system.css';
import '../src/workspace-redesign.css';
import '../src/learning-redesign.css';
import '../src/planning-redesign.css';
import '../src/components/account-surfaces.css';
import '../src/components/studio-tools.css';
import '../pwa/src/shared-study.css';
import '../src/dialogs-redesign.css';
import '../src/desktop-ergonomics.css';
import '../src/design-tokens.css';
import '../src/study-desk.css';
import '../src/panel-edge-tabs.css';
import '../src/workspace-tabs.css';

type ProfileName='a'|'b';
type Scope={accountId:string;spaceId:string};
type RecordProfile={account:LocalAccount;server:{id:string;email:string};formation:ReturnType<typeof loadFormationCatalog>['activeFormation'];baseKey:string;keys:[string,string];spaces:{id:string;title:string;academic_year:string;formation_id:string}[];noteIds:[string,string]};
type Captured={handler:()=>unknown;source:ReturnType<typeof source>};
type Fiber={child?:Fiber;sibling?:Fiber;memoizedState?:any;memoizedProps?:any;type?:any};
const stamp='2026-10-15T10:00:00.000Z',pending=new Set<Promise<unknown>>(),ipcErrors:string[]=[],ipcLedger:{command:string;method?:string;path?:string;profileId?:string}[]=[],callbacks=new Map<number,unknown>(),listeners=new Map<number,{event:string;handler:number}>(),captured=new Map<number,Captured>(),tokens=new WeakMap<object,number>();
let root:Root|null=null,node:HTMLElement|null=null,profiles:Record<ProfileName,RecordProfile>|null=null,active:ProfileName='a',started=false,serial=0,callbackSerial=0,listenerSerial=0,tokenSerial=0;
let seedMode:'absent'|'active'='active',holdDiscovery=false;
const heldDiscovery:(()=>void)[]=[];
let discoveryAccepted=0,discoveryDelivered=0;
const notesWrites:Record<string,number>={};let cacheSetDescriptor:PropertyDescriptor|undefined;
const originals=new Map<string,PropertyDescriptor|undefined>();
const pause=()=>new Promise<void>(resolve=>setTimeout(resolve,15));
function check(value:unknown,message:string):asserts value{if(!value)throw Error(message);}
function track<T>(promise:Promise<T>){let complete:Promise<T>;complete=promise.finally(()=>pending.delete(complete));pending.add(complete);void complete.catch(()=>{});return complete;}
async function wait(predicate:()=>boolean|Promise<boolean>,label:string){const until=performance.now()+10000;while(performance.now()<until){if(await predicate())return;await pause();}throw Error(label+': bounded observation timed out');}
async function drain(){const until=performance.now()+10000;while(pending.size){check(performance.now()<until,'Native IPC operations did not reach terminal settlement');await Promise.race([Promise.allSettled([...pending]),pause()]);}}
const digest=async(value:unknown)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value instanceof Uint8Array?value:new TextEncoder().encode(JSON.stringify(value)??'undefined')))).map(value=>value.toString(16).padStart(2,'0')).join('');
function fibers(){const first=(root as unknown as {_internalRoot?:{current?:Fiber}})?._internalRoot?.current,queue=first?[first]:[],all:Fiber[]=[];while(queue.length){const value=queue.pop()!;all.push(value);if(value.child)queue.push(value.child);if(value.sibling)queue.push(value.sibling);}return all;}
function source(){
 const app=fibers().find(f=>f.memoizedProps?.activeFormation&&f.memoizedProps?.account&&typeof f.memoizedProps?.onActivateFormation==='function');if(!app)return null;
 let exportSource:any=null,epochRef:any=null;for(let hook=app.memoizedState;hook;hook=hook.next){const current=hook.memoizedState?.current;if(current&&typeof current==='object'&&typeof current.identity==='string'){if(typeof current.profileId==='string'&&typeof current.ready==='boolean')exportSource=current;else if(typeof current.value==='number')epochRef=hook.memoizedState;}}
 if(!exportSource||!epochRef)return null;if(!tokens.has(epochRef))tokens.set(epochRef,++tokenSerial);const [accountId,spaceId,metadataKey]=JSON.parse(exportSource.identity);return {profileId:exportSource.profileId,accountId,spaceId,metadataKey,ready:exportSource.ready,closing:exportSource.closing,epoch:epochRef.current.value,workspaceToken:tokens.get(epochRef)};
}
function controller(){return fibers().find(f=>f.memoizedProps?.sync&&typeof f.memoizedProps.sync.chooseSpace==='function')?.memoizedProps.sync;}
function newButton(){return node?.querySelector<HTMLButtonElement>('button[aria-label="Nouvel onglet de note"]')??null;}
function currentNote(){const tabs=fibers().find(f=>typeof f.memoizedProps?.onCreateNote==='function'&&Array.isArray(f.memoizedProps?.openDocumentIds));return {activeId:tabs?.memoizedProps.activeDocumentId??null,ids:(tabs?.memoizedProps.documents??[]).map((value:{id:string})=>value.id),openIds:tabs?.memoizedProps.openDocumentIds??[],notice:[...node?.querySelectorAll('.toast-stack strong')??[]].map(value=>value.textContent)};}
function matching(name:ProfileName,spaceIndex:number){if(!profiles)return false;const expected=profiles[name],value=source();return !!value&&value.profileId===expected.account.id&&value.accountId===expected.server.id&&value.spaceId===expected.spaces[spaceIndex].id&&value.metadataKey===expected.keys[spaceIndex]&&value.ready&&!value.closing;}
async function ready(spaceIndex=0){
 const name=active;await wait(()=>{const sync=controller();return matching(name,spaceIndex)&&(!sync||!sync.busy&&sync.remoteSpace===profiles![name].spaces[spaceIndex].id)&&newButton()?.disabled===false;},'Actual Desktop App notebook identity and enabled creation');
 await settleAllNotebookAccounts();resumeAllNotebookAccounts();await appStorage.flush();await drain();check(matching(name,spaceIndex),'The actual workspace changed during its durable readiness barrier');check(!hasPendingNotebookWrites()&&!appStorage.status().pending,'Actual writers/cache must be settled');check(ipcErrors.length===0,'Unexpected native command must not be hidden');return state();
}
function installBridge(){
 cacheSetDescriptor=Object.getOwnPropertyDescriptor(appStorage,'setItem');const originalSet=appStorage.setItem;
 Object.defineProperty(appStorage,'setItem',{configurable:true,writable:true,value:function(this:typeof appStorage,key:string,value:string){if(Object.values(profiles??{}).some(profile=>[profile.baseKey,...profile.keys].includes(key)))notesWrites[key]=(notesWrites[key]??0)+1;return originalSet.call(this,key,value);}});
 for(const key of ['__TAURI_INTERNALS__','__TAURI_EVENT_PLUGIN_INTERNALS__'])originals.set(key,Object.getOwnPropertyDescriptor(window,key));
 const invoke=(command:string,args:Record<string,any>={})=>track(Promise.resolve().then(()=>{
  ipcLedger.push({command,...(command==='server_request'?{method:args.method,path:String(args.path).slice(0,180),profileId:args.accountId}:{})});if(ipcLedger.length>100)ipcLedger.shift();
  if(command==='plugin:event|listen'){const id=++listenerSerial;listeners.set(id,{event:args.event,handler:args.handler});return id;}
  if(command==='plugin:event|unlisten'){const row=listeners.get(args.eventId);if(row)callbacks.delete(row.handler);listeners.delete(args.eventId);return;}
  if(command==='server_request'){
   const own=Object.values(profiles??{}).find(profile=>profile.account.id===args.accountId);check(own,'IPC must belong to a declared synthetic profile');check(args.expectedAccountId===own.server.id,'IPC must retain the declared server-account identity');
   check(args.method==='GET'&&args.body===undefined&&args.idempotencyKey===undefined,'No publication or other native server mutation is accepted in this offline recipe');
   if(args.path==='/v1/spaces?limit=500'){
    const response={status:200,data:{items:own.spaces,has_more:false,next_after:null}};
    if(holdDiscovery&&own.account.id===profiles?.a.account.id)return new Promise<typeof response>(resolve=>{discoveryAccepted++;let delivered=false;heldDiscovery.push(()=>{check(!delivered,'Every held discovery response delivers exactly once');delivered=true;discoveryDelivered++;resolve(response);});});
    return response;
   }
   // Discovery is an explicit local-auth fixture seam. The real Desktop sync
   // also requests changes while the renderer is offline; model this single
   // declared route as unavailable, rather than inventing an empty remote
   // baseline that would permit subsequent publication of initial documents.
   check(own.spaces.some(space=>args.path===`/v1/spaces/${space.id}/changes?limit=500`),'Only exact discovery and declared offline changes routes are accepted');
   return {status:503,data:{code:'fixture_offline',message:'Explicit private fixture: remote changes are unavailable while offline.'}};
  }
  if(command==='sync_ai_panel'||command==='secure_ai_panel_for_account_transition')return;
  if(command==='native_archive_list'){
   const own=Object.values(profiles??{}).find(profile=>profile.account.id===args.accountId);
   check(own&&args.formationId===own.formation.instanceId&&Object.keys(args).every(key=>key==='accountId'||key==='formationId'),'Archive read keeps its exact synthetic profile/formation');return [];
  }
  if(command==='native_capabilities')return {platform:'browser-fixture',googleWebProfileRemoval:false,microphoneAccessRequest:false};
  if(command==='configure_ai_capture'){check(args.paused===true,'The inactive AI panel must remain paused');return {generation:1,phase:'paused',detail:'Explicit inactive native-AI fixture seam',lastPersistedMessages:0};}
  if(command==='current_ai_url')return null;
  throw Error('Unexpected synthetic native command '+command);
 }).catch(error=>{ipcErrors.push(String(error instanceof Error?error.message:error).slice(0,250));throw error;}));
 Object.defineProperty(window,'__TAURI_INTERNALS__',{configurable:true,value:{invoke,transformCallback:(callback:unknown)=>{const id=++callbackSerial;callbacks.set(id,callback);return id;},unregisterCallback:(id:number)=>callbacks.delete(id)}});
 Object.defineProperty(window,'__TAURI_EVENT_PLUGIN_INTERNALS__',{configurable:true,value:{unregisterListener:(_event:string,id:number)=>{const row=listeners.get(id);if(row)callbacks.delete(row.handler);listeners.delete(id);}}});
}
async function seedProfile(name:ProfileName,runId:string):Promise<RecordProfile>{
 const account:LocalAccount={id:crypto.randomUUID(),username:'fixture-'+name,displayName:'Private profile '+name,createdAt:stamp},formation=loadFormationCatalog(account.id).activeFormation,baseKey=formationStorageFor(account.id,formation).subjectNotes,server={id:`remote-${name}-${runId}`,email:name+'@example.invalid'},year=`${formation.manifest.academicYear.startDate.slice(0,4)}-${formation.manifest.academicYear.endDate.slice(0,4)}`;
 const spaces=['one','two'].map((id,index)=>({id:`desktop-year-${name}-${id}`,title:'Private compatible space '+(index+1),academic_year:year,formation_id:formation.packageId})),keys=spaces.map(space=>`${baseKey}.cloud.${encodeURIComponent(server.id)}.${encodeURIComponent(space.id)}`)as[string,string],noteIds=spaces.map((_,index)=>`original-${name}-${index}`)as[string,string];
 appStorage.setItem(`dowze.server.owner.${account.id}`,JSON.stringify(server));appStorage.setItem(`dowze.server.link.${account.id}`,JSON.stringify(server));appStorage.setItem(`dowze.server.space.${account.id}.${server.id}.${formation.instanceId}`,spaces[0].id);appStorage.setItem(`dowze.notebook.scope.${account.id}.${formation.instanceId}`,JSON.stringify({schema:1,localSpace:formation.instanceId,identity:{accountId:server.id,spaceId:spaces[0].id}}));appStorage.setItem(`dowze.notebook.scope.${account.id}.${formation.instanceId}.origin`,JSON.stringify({accountId:server.id,spaceId:spaces[0].id}));appStorage.setItem(baseKey,JSON.stringify(EMPTY_SUBJECT_NOTES_STORE));
 for(let index=0;index<spaces.length;index++){
  const scope={accountId:server.id,spaceId:spaces[index].id},note={id:noteIds[index],title:`Original ${name} ${index}`,markdown:`Original private ${name} ${index} body.`,subjectIds:[],tags:['preserved'],createdAt:stamp,updatedAt:stamp};
  if(!(seedMode==='absent'&&name==='a'&&index===0))appStorage.setItem(keys[index],JSON.stringify({...EMPTY_SUBJECT_NOTES_STORE,documents:[note],openDocumentIds:[note.id],activeDocumentId:note.id}));
  const plain=migratePaper(note.id,note.markdown,null,stamp),content=amendPaperCollaboration(plain,plain);await putDraft({...scope,type:'notesMarkdown',documentId:note.id,title:note.title,content:note,baseVersion:4,updatedAt:1,syncState:'synced'});await putDraft({...scope,type:'whiteboard',documentId:notebookDocumentId(note.id),title:note.title,content,baseVersion:4,updatedAt:1,syncState:'synced'});await putDraft({...scope,type:'preferences',documentId:LIBRARY_DOCUMENT_ID,title:'Private library',content:emptyNotebookLibrary(),baseVersion:4,updatedAt:1,syncState:'synced'});await putSnapshot({...scope,key:`paper-migration|${scope.accountId}|${scope.spaceId}|whiteboard|${notebookDocumentId(note.id)}`,value:{markdown:note.markdown,legacy:null,migratedAt:stamp}});
 }
 return {account,server,formation,baseKey,keys,spaces,noteIds};
}
async function preload(){
 // This is a warm, native-offline creation recipe, not an installed-shell/SW
 // test. Load the real lazy note children before cutting browser transport.
 // A rejected lazy import otherwise unmounts App before its storage assertion.
 await Promise.all([import('../src/components/SettingsPage'),import('../src/components/MarkdownNoteEditor'),import('../src/components/PaperAudioControls'),import('../src/lib/paperArchiveMetadata'),import('../src/lib/paperLegacyMigration'),import('../src/lib/paperLegacyBridge')]);
 await document.fonts.ready;return {actualLazyModules:true,warmBeforeNativeOffline:true};
}
async function start(runId:string,mode:'absent'|'active'='active'){check(!started&&/^[a-zA-Z0-9-]{1,80}$/.test(runId),'Only one private initial seed is admitted');check(mode==='absent'||mode==='active','Closed metadata fixture mode');seedMode=mode;holdDiscovery=mode==='absent';check(navigator.onLine===false,'Start actual App only after native browser offline admission');started=true;await appStorage.initialize(localStorage);profiles={a:await seedProfile('a',runId),b:await seedProfile('b',runId)};await appStorage.flush();installBridge();node=document.createElement('div');node.id='actual-desktop-new-note';document.body.append(node);root=createRoot(node);if(mode!=='absent')return showProfile('a');root.render(createElement(App,{key:profiles.a.account.id,account:profiles.a.account,onLogout:async()=>{throw Error('No native logout claimed');}}));await wait(()=>!!node?.querySelector('button[aria-label="Réglages"]')&&source()?.ready===true&&heldDiscovery.length>0,'Actual stored scope ready while exact discovery is held');check(appStorage.getItem(profiles.a.keys[0])===null,'Absent notes key must never be seeded or normalized by fixture');return state();}
async function showProfile(name:ProfileName){check(root&&profiles,'Fixture not started');active=name;root.render(createElement(App,{key:profiles[name].account.id,account:profiles[name].account,onLogout:async()=>{throw Error('No native authentication logout is claimed by this fixture');}}));await ready();return state();}
function capture(){const button=newButton();check(button&&!button.disabled,'Capture the actual enabled mounted creation button');const key=Object.keys(button).find(key=>key.startsWith('__reactProps$'));check(key,'Actual committed React button props missing');const handler=(button as unknown as Record<string,{onClick?:()=>unknown}>)[key].onClick;check(typeof handler==='function','The actual creation handler is missing');const id=++serial;captured.set(id,{handler,source:source()});return {id,source:source()};}
function captureSettings(){const button=node?.querySelector<HTMLButtonElement>('button[aria-label="Réglages"]');check(button&&!button.disabled,'Actual mounted Settings button enabled');const key=Object.keys(button).find(key=>key.startsWith('__reactProps$'));check(key,'Committed Settings React props missing');const handler=(button as unknown as Record<string,{onClick?:()=>unknown}>)[key].onClick;check(typeof handler==='function','Actual committed Settings handler missing');const id=++serial;captured.set(id,{handler,source:source()});return {id,source:source()};}
function releaseDiscovery(){holdDiscovery=false;for(const release of heldDiscovery.splice(0))release();return true;}
async function notesInventory(){check(profiles,'Fixture not started');await appStorage.flush();const rows:Record<string,string|null>={};for(const profile of Object.values(profiles))for(const key of [profile.baseKey,...profile.keys]){const raw=await appStorage.readCurrentItem(key);check(raw===appStorage.getItem(key),'Exact notes durable/cache row must agree');rows[key]=raw;}return {source:source(),rows,view:currentNote(),writes:{...notesWrites}};}
async function activeReady(){await ready();const profile=profiles![active],id=profile.noteIds[0],authority=JSON.stringify(source()),notebook=()=>fibers().find(row=>row.memoizedProps?.paper&&row.memoizedProps?.document?.noteId===id)?.memoizedProps;
 await wait(async()=>{check(JSON.stringify(source())===authority,'Actual workspace changed during paper readiness');const value=notebook();if(currentNote().activeId!==id||!node?.querySelector('.paper-notebook')||!value?.paper.saved||!value.paper.legacyReady||value.paper.blocked||value.paper.reconciling||value.paper.getCurrent()!==value.document)return false;const captured=value.document;await value.paper.whenSaved();await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));check(JSON.stringify(source())===authority,'Actual workspace changed after paper readiness');return notebook()?.paper.getCurrent()===captured&&notebook()?.paper.saved===true;},'Actual paper legacy/current document and saved tail are settled');
 const value=await getDraft({accountId:profile.server.id,spaceId:profile.spaces[0].id,type:'whiteboard',documentId:notebookDocumentId(id)});check(value?.content&&typeof value.content==='object'&&(value.content as{noteId?:string}).noteId===id,'Actual active note canonical graph required');await ready();return state();}
async function newerMetadata(){check(profiles,'Fixture not started');const current=source();check(current?.ready,'Real current note scope ready');const key=current.metadataKey,raw=await appStorage.readCurrentItem(key);check(raw,'Current actual note row exists');const value=JSON.parse(raw);check(value.activeDocumentId&&value.documents.some((note:{id:string})=>note.id===value.activeDocumentId),'A real seeded note must be active');const next={...value,documents:value.documents.map((note:{id:string;title:string;tags:string[]})=>note.id===value.activeDocumentId?{...note,title:'Newer durable title',tags:[...note.tags,'current-cache']}:note)};appStorage.setItem(key,JSON.stringify(next));await appStorage.flush();return {key,previousRaw:raw,next};}
async function invokeCaptured(id:number){const old=captured.get(id);check(old,'Original committed callback missing');const returned=old.handler();if(returned&&typeof(returned as Promise<unknown>).then==='function')await returned;await pause();await appStorage.flush();await drain();return {returned:typeof returned==='boolean'?returned:null,captured:old.source,current:source()};}
async function inventory(){check(profiles,'Fixture not started');await appStorage.flush();const cache:Record<string,string|null>={};for(let index=0;index<appStorage.length;index++){const key=appStorage.key(index);check(key,'Owned cache key missing');const value=await appStorage.readCurrentItem(key);check(value===appStorage.getItem(key),'Native durable cache and current cache differ');cache[key]=value;}const scopes=[];for(const profile of Object.values(profiles))for(const space of profile.spaces){const scope:Scope={accountId:profile.server.id,spaceId:space.id},files=[];for(const{blob,...file}of await listLocalBlobs(scope.accountId,scope.spaceId))files.push({...file,size:blob.size,sha256:await digest(new Uint8Array(await blob.arrayBuffer()))});scopes.push({scope,drafts:await listDrafts(scope.accountId,scope.spaceId),queue:await listMutations(scope.accountId,scope.spaceId),snapshots:await listSnapshots(scope.accountId,scope.spaceId),files});}return {cache,scopes};}
async function blankNote(){const profile=profiles?.[active],current=source();check(profile&&current,'Current source missing');await wait(()=>!!currentNote().activeId&&!(profile.noteIds as string[]).includes(currentNote().activeId),'Actual current creation selects its new note');const id=currentNote().activeId,raw=await appStorage.readCurrentItem(current.metadataKey);check(raw,'Native metadata missing');const value=JSON.parse(raw),note=value.documents.find((row:{id:string})=>row.id===id);check(note&&note.title==='Sans titre'&&note.markdown===''&&note.tags.length===0&&note.subjectIds.length===0,'The selected metadata must be a new blank note');check(value.activeDocumentId===id&&value.openDocumentIds.includes(id),'The actual metadata owns its selected new tab');await wait(async()=>{const draft=await getDraft({accountId:current.accountId,spaceId:current.spaceId,type:'whiteboard',documentId:notebookDocumentId(id)});return !!draft&&draft.content&&typeof draft.content==='object'&&(draft.content as{noteId?:string}).noteId===id&&!!node?.querySelector('.paper-notebook');},'Actual Notebook and native new canonical graph');await ready(current.spaceId===profile.spaces[0].id?0:1);return {id,scope:{accountId:current.accountId,spaceId:current.spaceId},metadata:note,view:currentNote(),source:source()};}
function state(){const sync=controller();return {source:source(),view:currentNote(),offline:navigator.onLine===false,cache:appStorage.status(),pendingWriters:hasPendingNotebookWrites(),nativeIPC:{pending:pending.size,listeners:listeners.size,callbacks:callbacks.size,errors:[...ipcErrors],recent:ipcLedger.slice(-12)},server:sync?{remoteSpace:sync.remoteSpace,busy:sync.busy,preparing:sync.preparingNotes,notice:sync.notice,spaces:sync.spaces.map((space:{id:string})=>space.id)}:null,scopeOptions:profiles?profiles[active].spaces.map(space=>space.id):[]};}
async function unmount(){await settleAllNotebookAccounts();resumeAllNotebookAccounts();await appStorage.flush();root?.unmount();root=null;await pause();await drain();await settleAllNotebookAccounts();resumeAllNotebookAccounts();await appStorage.flush();check(!hasPendingNotebookWrites(),'No actual writer may survive unmount');return state();}
async function cleanup(){releaseDiscovery();await unmount();check(discoveryAccepted===discoveryDelivered&&heldDiscovery.length===0,'All held discovery originals must deliver exactly once');check(listeners.size===0&&callbacks.size===0,'Actual Tauri JS subscriptions/callbacks must be removed');check(pending.size===0,'Every accepted IPC operation must settle');check(ipcErrors.length===0,'No unknown native command may be swallowed');appStorage.close();if(cacheSetDescriptor)Object.defineProperty(appStorage,'setItem',cacheSetDescriptor);else Reflect.deleteProperty(appStorage,'setItem');for(const[key,descriptor]of originals)if(descriptor)Object.defineProperty(window,key,descriptor);else Reflect.deleteProperty(window,key);node?.remove();node=null;return {appNodes:document.querySelectorAll('.app-shell').length,pendingNativeIPC:pending.size,nativeListeners:listeners.size,nativeCallbacks:callbacks.size,pendingWriters:hasPendingNotebookWrites(),discoveryAccepted,discoveryDelivered,discoveryPending:heldDiscovery.length,cacheClosed:true};}
const api={preload,start,ready,state,showProfile,capture,invokeCaptured,inventory,blankNote,unmount,cleanup,captureSettings,releaseDiscovery,notesInventory,newerMetadata,activeReady};
declare global{interface Window{__desktopNewNote:typeof api}}
window.__desktopNewNote=api;
