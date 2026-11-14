/** Actual shared library/hooks and native IndexedDB. The source selector and
 * note-content route are explicit private fixture seams, not the full App. */
import {createElement,useState} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {NotebookLibraryView,type LibraryNote} from '../src/components/NotebookLibraryView';
import {emptyNotebookLibrary,isNotebookLibrary,LIBRARY_DOCUMENT_ID} from '../src/lib/notebookLibrary';
import {migratePaper,notebookDocumentId} from '../src/lib/notebookDocument';
import {amendPaperCollaboration} from '../src/lib/paperCollaboration';
import {putDraft,getDraft,listDrafts,listSnapshots,listMutations,listLocalBlobs,putLocalBlob,putSnapshot} from '../pwa/src/storage';
import {settleNotebookAccount,resumeNotebookAccount} from '../src/lib/notebookSession';
import {notebookLibraryViewPreferenceKey} from '../src/lib/notebookLibraryViewState';
import {notebookLibrarySortPreferenceKey} from '../src/lib/notebookLibrarySort';
type Selection='a1'|'a2'|'b1';
type Scope={accountId:string;spaceId:string};
type Ticket={selection:Selection;scope:Scope;epoch:number};
type HookState={library:ReturnType<typeof emptyNotebookLibrary>|null;saving:boolean;conflict:boolean;error:string};
const stamp='2026-10-15T10:00:00.000Z';
function check(value:unknown,label:string):asserts value{if(!value)throw Error(label);}
let root:Root|null=null,node:HTMLElement|null=null,ticket:Ticket|null=null,scopes:Record<Selection,Scope>|null=null,serial=0,started=false;
const rows=(selection:Selection):readonly LibraryNote[]=>selection==='a1'?Array.from({length:60},(_,index)=>({id:'n'+String(index).padStart(2,'0'),title:'Collection '+String(index).padStart(2,'0'),markdown:'CARNET source conservée n'+String(index).padStart(2,'0'),updatedAt:new Date(Date.parse(stamp)+index*1000).toISOString()})):[{id:'foreign-'+selection,title:'FOREIGN '+selection,markdown:'FOREIGN private scope '+selection,updatedAt:stamp}];
const identity=(scope:Scope)=>({...scope,type:'preferences' as const,documentId:LIBRARY_DOCUMENT_ID});
const digest=async(value:unknown)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)??'undefined')))).map(byte=>byte.toString(16).padStart(2,'0')).join('');
const pause=()=>new Promise<void>(resolve=>setTimeout(resolve,15));
async function wait(predicate:()=>boolean|Promise<boolean>,label:string){const until=performance.now()+10000;while(performance.now()<until){if(await predicate())return;await pause();}throw Error(label+': bounded observation timed out');}
function hook(){
 const first=(root as unknown as {_internalRoot?:{current?:any}})?._internalRoot?.current,pending=first?[first]:[];
 while(pending.length){const fiber=pending.pop();if(fiber.sibling)pending.push(fiber.sibling);if(fiber.child)pending.push(fiber.child);if(fiber.type!==NotebookLibraryView)continue;let item=fiber.memoizedState;for(let remaining=65;item&&remaining--;item=item.next){const state=item.memoizedState;if(state&&typeof state==='object'&&'library'in state&&typeof state.saving==='boolean'&&typeof state.conflict==='boolean')return {props:fiber.memoizedProps,state:state as HookState};}}
 return null;
}
function Shell({source}:{source:Ticket}){const [opened,setOpened]=useState<string|null>(null);return opened?createElement('section',{'aria-label':'Note de recette N005'},createElement('p',null,opened),createElement('button',{type:'button',onClick:()=>setOpened(null)},'Retour à la bibliothèque')):createElement(NotebookLibraryView,{notes:rows(source.selection),media:source.scope,onOpen:id=>setOpened(id),onCreate:()=>{}});}
function sourceCurrent(source:Ticket){check(ticket===source&&root&&node,'Captured native library source changed');}
function matching(source:Ticket){sourceCurrent(source);const value=hook();return value&&value.props.media.accountId===source.scope.accountId&&value.props.media.spaceId===source.scope.spaceId?value.state:null;}
async function ready(){const source=ticket;check(source,'Source missing');await wait(async()=>{const current=matching(source);if(!current?.library||current.saving||current.conflict||node?.querySelector('.notebook-library')?.getAttribute('aria-busy')!=='false')return false;const captured=current.library,row=await getDraft(identity(source.scope)),after=matching(source);return after?.library===captured&&!after.saving&&!after.conflict&&!!row&&isNotebookLibrary(row.content)&&JSON.stringify(row.content)===JSON.stringify(captured);},'Real hook/index and native durable library');sourceCurrent(source);return state();}
async function show(selection:Selection){check(root&&scopes,'Start the private recipe first');check(['a1','a2','b1'].includes(selection),'Unknown private scope');const source:Ticket={selection,scope:{...scopes[selection]},epoch:++serial};ticket=source;root.render(createElement(Shell,{key:selection,source}));await ready();sourceCurrent(source);return state();}
async function seed(scope:Scope,selection:Selection){
 const library=emptyNotebookLibrary();library.updatedAt=stamp;
 if(selection==='a1'){library.folders=[{id:'folder-main',parentId:null,title:'Dossier de recette',color:'#4461dc',order:0}];library.notes=Object.fromEntries(rows(selection).map((note,index)=>[note.id,{folderId:index<50?'folder-main':null,favorite:index%3===0,deletedAt:index===52||index===58?stamp:null}]));}
 await putDraft({...identity(scope),title:'Classement original',content:library,baseVersion:4,updatedAt:1,syncState:'synced'});
 for(const note of rows(selection)){const plain=migratePaper(note.id,note.markdown,null,stamp),content=amendPaperCollaboration(plain,plain);await putDraft({...scope,type:'notesMarkdown',documentId:note.id,title:note.title,content:{id:note.id,title:note.title,markdown:note.markdown,updatedAt:note.updatedAt},baseVersion:2,updatedAt:Date.parse(note.updatedAt),syncState:'synced'});await putDraft({...scope,type:'whiteboard',documentId:notebookDocumentId(note.id),title:note.title,content,baseVersion:2,updatedAt:1,syncState:'synced'});}
 await putLocalBlob({...scope,id:'preserved-media-'+selection,documentId:'preserved-document',blob:new Blob([new Uint8Array([17,29,43,selection==='a1'?1:selection==='a2'?2:3])]),name:'Preserved.bin',createdAt:1,status:'uploaded',serverId:'preserved-server-'+selection});
 await putSnapshot({...scope,key:'n005-original|'+JSON.stringify([scope.accountId,scope.spaceId]),value:{kind:'Private immutable source'}});
}
async function start(runId:string,reopen=false){
 check(!started&&/^[a-zA-Z0-9-]{1,80}$/.test(runId),'Invalid or repeated private bootstrap');started=true;scopes={a1:{accountId:'navigation-A-'+runId,spaceId:'year-one'},a2:{accountId:'navigation-A-'+runId,spaceId:'year-two'},b1:{accountId:'navigation-B-'+runId,spaceId:'year-one'}};
 for(const [selection,scope]of Object.entries(scopes)as [Selection,Scope][]){if(reopen){check(await getDraft(identity(scope)),'Native reload must never reseed missing library');for(const note of rows(selection))check(await getDraft({...scope,type:'notesMarkdown',documentId:note.id}),'Reload must retain every native metadata row');}else await seed(scope,selection);}
 node=document.createElement('div');node.id='actual-library-navigation';document.body.append(node);root=createRoot(node);return show('a1');
}
async function inventory(selection:Selection){check(scopes,'Missing scopes');const scope=scopes[selection],files=[];for(const {blob,...file}of await listLocalBlobs(scope.accountId,scope.spaceId))files.push({...file,size:blob.size,sha256:await digest(Array.from(new Uint8Array(await blob.arrayBuffer())))});return {selection,scope,drafts:await listDrafts(scope.accountId,scope.spaceId),snapshots:await listSnapshots(scope.accountId,scope.spaceId),mutations:await listMutations(scope.accountId,scope.spaceId),files};}
function state(){const value=hook(),source=ticket;return {source,ready:!!value?.state.library&&!value.state.saving&&!value.state.conflict,error:value?.state.error??null,route:node?.querySelector('section[aria-label="Note de recette N005"]')?'note':'library',view:source?JSON.parse(localStorage.getItem(notebookLibraryViewPreferenceKey(source.scope))??'null'):null,sort:source?JSON.parse(localStorage.getItem(notebookLibrarySortPreferenceKey(source.scope))??'null'):null};}
async function cleanup(){const source=ticket;try{if(source)await settleNotebookAccount(source.scope.accountId);}finally{if(source)resumeNotebookAccount(source.scope.accountId);}root?.unmount();root=null;ticket=null;node?.remove();return {libraryNodes:document.querySelectorAll('.notebook-library').length};}
const api={start,show,ready,state,inventory,cleanup};
declare global{interface Window{__paperLibraryNavigation:typeof api}}
window.__paperLibraryNavigation=api;
