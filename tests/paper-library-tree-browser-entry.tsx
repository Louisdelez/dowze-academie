/** DRAFT NOT RUN. Actual shared library/hook + native browser IndexedDB.
 * Private source/note-route controls are explicit seams, not App authentication. */
import {createElement,useState} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {NotebookLibraryView,type LibraryNote} from '../src/components/NotebookLibraryView';
import {ApiClient} from '../pwa/src/api';
import {emptyNotebookLibrary,isNotebookLibrary,LIBRARY_DOCUMENT_ID} from '../src/lib/notebookLibrary';
import {migratePaper,notebookDocumentId} from '../src/lib/notebookDocument';
import {amendPaperCollaboration} from '../src/lib/paperCollaboration';
import {putDraft,getDraft,listDrafts,listSnapshots,listMutations,listLocalBlobs,putSnapshot} from '../pwa/src/storage';
import {settleNotebookAccount,resumeNotebookAccount} from '../src/lib/notebookSession';

type Selection='a1'|'a2'|'b1';
type Scope={accountId:string;spaceId:string};
type Ticket={selection:Selection;scope:Scope;api:'none'|'a'|'b';epoch:number};
type HookState={library:ReturnType<typeof emptyNotebookLibrary>|null;saving:boolean;conflict:boolean;error:string};
const stamp='2026-10-15T10:00:00.000Z';
function check(value:unknown,label:string):asserts value{if(!value)throw Error(label);}
let root:Root|null=null,node:HTMLElement|null=null,ticket:Ticket|null=null,scopes:Record<Selection,Scope>|null=null,sequence=0,started=false;
const apis={a:new ApiClient('/private-unused-api-a'),b:new ApiClient('/private-unused-api-b')};
const captured=new Map<number,{submit:(event:{preventDefault:()=>void})=>unknown;source:Ticket}>();let captureSerial=0;
const observed:{type:string;trusted:boolean;pointerType:string|null;label:string}[]=[];
const observe=(event:Event)=>{if(!(event.target instanceof Element)||!node?.contains(event.target))return;const target=event.target.closest('button,input,select,form');if(!target)return;observed.push({type:event.type,trusted:event.isTrusted,pointerType:'pointerType'in event?String(event.pointerType):null,label:(target.getAttribute('aria-label')??target.textContent??'').slice(0,80)});if(observed.length>80)observed.shift();};
const noteRows=():readonly LibraryNote[]=>[{id:'note-one',title:'Première note',markdown:'Source une conservée.',updatedAt:stamp},{id:'note-two',title:'Deuxième note',markdown:'Source deux conservée.',updatedAt:stamp}];
const identity=(scope:Scope)=>({...scope,type:'preferences' as const,documentId:LIBRARY_DOCUMENT_ID});
const digest=async(value:unknown)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)??'undefined')))).map(byte=>byte.toString(16).padStart(2,'0')).join('');
const pause=()=>new Promise<void>(resolve=>setTimeout(resolve,15));
async function wait(predicate:()=>boolean|Promise<boolean>,label:string){const until=performance.now()+10000;while(performance.now()<until){if(await predicate())return;await pause();}throw Error(label+': bounded observation timed out');}
function hook(){
 const first=(root as unknown as {_internalRoot?:{current?:any}})?._internalRoot?.current,pending=first?[first]:[];
 while(pending.length){const fiber=pending.pop();if(fiber.sibling)pending.push(fiber.sibling);if(fiber.child)pending.push(fiber.child);if(fiber.type!==NotebookLibraryView)continue;
  let item=fiber.memoizedState;for(let remaining=60;item&&remaining--;item=item.next){const state=item.memoizedState;if(state&&typeof state==='object'&&'library'in state&&typeof state.saving==='boolean'&&typeof state.conflict==='boolean')return {props:fiber.memoizedProps,state:state as HookState};}
 }return null;
}
function Shell({source}:{source:Ticket}){
 const [opened,setOpened]=useState<string|null>(null),media={...source.scope,...(source.api==='none'?{}:{api:apis[source.api]})};
 return opened?createElement('section',{'aria-label':'Note de recette N001'},createElement('p',null,opened),createElement('button',{onClick:()=>setOpened(null)},'Retour à la bibliothèque')):createElement(NotebookLibraryView,{notes:noteRows(),media,onOpen:id=>setOpened(id),onCreate:()=>{}});
}
function sourceCurrent(source:Ticket){check(ticket===source&&root&&node,'The captured library source/epoch has changed');}
function matchingHook(source:Ticket){sourceCurrent(source);const current=hook();return current&&current.props.media.accountId===source.scope.accountId&&current.props.media.spaceId===source.scope.spaceId&&current.props.media.api===(source.api==='none'?undefined:apis[source.api])?current.state:null;}
function owns(source:Ticket){const current=matchingHook(source);check(current,'The actual library/API must match its captured scope');return current;}
async function ready(){const source=ticket;check(source,'Source missing');await wait(async()=>{const state=matchingHook(source);if(!state?.library||state.saving||state.conflict)return false;const capturedLibrary=state.library,row=await getDraft(identity(source.scope)),after=matchingHook(source);return after?.library===capturedLibrary&&!after.saving&&!after.conflict&&!!row&&isNotebookLibrary(row.content)&&JSON.stringify(row.content)===JSON.stringify(capturedLibrary);},'Actual hook and native durable library');owns(source);return state();}
async function show(selection:Selection,api:Ticket['api']='none'){
 check(root&&scopes,'Start the private library recipe first');const source:Ticket={selection,scope:{...scopes[selection]},api,epoch:++sequence};ticket=source;root.render(createElement(Shell,{source}));await ready();check(ticket===source,'Source changed before opening acknowledgement');return state();
}
async function seed(scope:Scope){
 const library=emptyNotebookLibrary();library.updatedAt=stamp;await putDraft({...identity(scope),title:'Classement de recette',content:library,baseVersion:4,updatedAt:1,syncState:'synced'});
 for(const note of noteRows()){const plain=migratePaper(note.id,note.markdown,null,stamp),content=amendPaperCollaboration(plain,plain);await putDraft({...scope,type:'notesMarkdown',documentId:note.id,title:note.title,content:{id:note.id,title:note.title,markdown:note.markdown,updatedAt:stamp},baseVersion:2,updatedAt:1,syncState:'synced'});await putDraft({...scope,type:'whiteboard',documentId:notebookDocumentId(note.id),title:note.title,content,baseVersion:2,updatedAt:1,syncState:'synced'});}
 await putSnapshot({...scope,key:'n001-original|'+JSON.stringify([scope.accountId,scope.spaceId]),value:{kind:'Private original, never edited by folder operations'}});
}
async function start(runId:string,reopen=false){
 check(!started&&/^[a-zA-Z0-9-]{1,80}$/.test(runId),'Invalid or repeated private library bootstrap');started=true;scopes={a1:{accountId:'library-A-'+runId,spaceId:'year-one'},a2:{accountId:'library-A-'+runId,spaceId:'year-two'},b1:{accountId:'library-B-'+runId,spaceId:'year-one'}};
 for(const scope of Object.values(scopes)){if(reopen)check(await getDraft(identity(scope)),'A browser reload must never RAM-reseed missing library data');else await seed(scope);}
 node=document.createElement('div');node.id='actual-library-tree';document.body.append(node);root=createRoot(node);const nav=document.createElement('nav');nav.id='private-library-sources';nav.setAttribute('aria-label','Private library recipe sources');for(const selection of ['a1','a2','b1']as const){const button=document.createElement('button');button.textContent='Recipe '+selection;button.addEventListener('click',()=>{void show(selection).catch(error=>{nav.dataset.error=String(error instanceof Error?error.message:error);});});nav.append(button);}document.body.prepend(nav);
 for(const type of ['click','keydown','pointerdown','pointerup'])document.addEventListener(type,observe,true);return show('a1');
}
async function inventory(selection:Selection){check(scopes,'Missing scopes');const scope=scopes[selection],files=[];for(const {blob,...file}of await listLocalBlobs(scope.accountId,scope.spaceId))files.push({...file,size:blob.size,sha256:await digest(Array.from(new Uint8Array(await blob.arrayBuffer())))});return {selection,scope,drafts:await listDrafts(scope.accountId,scope.spaceId),snapshots:await listSnapshots(scope.accountId,scope.spaceId),mutations:await listMutations(scope.accountId,scope.spaceId),files};}
async function flush(){const source=ticket;check(source,'Source missing');owns(source);try{await settleNotebookAccount(source.scope.accountId);owns(source);}finally{resumeNotebookAccount(source.scope.accountId);}await ready();owns(source);const row=await getDraft(identity(source.scope));owns(source);check(row&&isNotebookLibrary(row.content),'Actual durable library missing');return row;}
function captureSubmit(){const source=ticket;check(source,'Source missing');owns(source);const form=node!.querySelector('.note-folder-form');check(form,'Capture requires the real open library form');const key=Object.keys(form).find(key=>key.startsWith('__reactProps$'));check(key,'Actual committed React form props missing');const submit=(form as unknown as Record<string,{onSubmit?:(event:{preventDefault:()=>void})=>unknown}>)[key].onSubmit;check(typeof submit==='function','The actual form submit callback must exist');const id=++captureSerial;captured.set(id,{submit,source});return {id,source:{selection:source.selection,epoch:source.epoch,api:source.api}};}
function invokeCapturedSubmit(id:number){const old=captured.get(id);check(old,'Captured actual callback missing');old.submit({preventDefault:()=>{}});return {source:old.source.selection,epoch:old.source.epoch,current:ticket===old.source};}
function state(){const value=hook();return {source:ticket?{selection:ticket.selection,scope:ticket.scope,epoch:ticket.epoch,api:ticket.api}:null,ready:!!value?.state.library&&!value.state.saving&&!value.state.conflict,library:value?.state.library??null,error:value?.state.error??null,saving:value?.state.saving??null,conflict:value?.state.conflict??null,route:node?.querySelector('section[aria-label="Note de recette N001"]')?'note':'library',events:observed.slice(),controlError:document.getElementById('private-library-sources')?.dataset.error??null};}
async function cleanup(){const source=ticket;try{if(source)await settleNotebookAccount(source.scope.accountId);}finally{if(source)resumeNotebookAccount(source.scope.accountId);}root?.unmount();root=null;ticket=null;for(const type of ['click','keydown','pointerdown','pointerup'])document.removeEventListener(type,observe,true);node?.remove();document.getElementById('private-library-sources')?.remove();return {libraryNodes:document.querySelectorAll('.notebook-library').length};}
const api={start,show,ready,state,flush,inventory,captureSubmit,invokeCapturedSubmit,cleanup};
declare global{interface Window{__paperLibraryTree:typeof api}}
window.__paperLibraryTree=api;
