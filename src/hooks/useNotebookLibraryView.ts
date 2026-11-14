import {useCallback,useLayoutEffect,useRef,useState} from 'react';
import {captureNotebookLibraryScroll,defaultNotebookLibraryView,isNotebookLibraryViewState,notebookLibraryViewPreferenceKey,readNotebookLibraryView,restoreNotebookLibraryScroll,writeNotebookLibraryView,NOTEBOOK_LIBRARY_VIEW_READ_ERROR,NOTEBOOK_LIBRARY_VIEW_WRITE_ERROR,type NotebookLibraryViewState} from '../lib/notebookLibraryViewState';
import type {NotebookLibrarySortScope} from '../lib/notebookLibrarySort';
interface Source extends NotebookLibrarySortScope {key:string|null;api:unknown;view:NotebookLibraryViewState;notice:string;dirty:boolean;active:boolean;restore:boolean;main:HTMLElement|null;sidebar:HTMLElement|null;timer:ReturnType<typeof setTimeout>|null}
const local=()=>window.localStorage;
const ephemeral=new Map<string,NotebookLibraryViewState>();
function createSource(scope:NotebookLibrarySortScope&{api?:unknown},key:string|null,previous?:Source):Source{
 const pending=previous&&key!==null&&previous.key===key&&previous.dirty?{view:{...previous.view,expanded:[...previous.view.expanded],picked:[...previous.view.picked],main:{...previous.view.main},sidebar:{...previous.view.sidebar}},notice:previous.notice}:null;
 const memory=key?ephemeral.get(key):undefined,read=pending??(memory?{view:memory,notice:NOTEBOOK_LIBRARY_VIEW_WRITE_ERROR}:key?readNotebookLibraryView(scope,local):{view:defaultNotebookLibraryView(),notice:NOTEBOOK_LIBRARY_VIEW_READ_ERROR});
 return {...scope,key,api:scope.api,...read,dirty:pending!==null,active:true,restore:true,main:null,sidebar:null,timer:null};
}
/** A device-local navigation state, never canonical note/classification data.
 * Every callback captures an incarnation. Accepted scroll samples may finish
 * saving their exact old key during cleanup; stale UI callbacks cannot sample
 * another scope's DOM or change any preference.
 */
export function useNotebookLibraryView(scope:NotebookLibrarySortScope&{api?:unknown}){
 let key:string|null;try{key=notebookLibraryViewPreferenceKey(scope);}catch{key=null;}
 const sourceRef=useRef<Source|null>(null);
 if(!sourceRef.current||sourceRef.current.key!==key||sourceRef.current.api!==scope.api){const previous=sourceRef.current;if(previous)previous.active=false;sourceRef.current=createSource(scope,key,previous??undefined);}
 const source=sourceRef.current,[state,setState]=useState(()=>({source,view:source.view,notice:source.notice}));
 let visible=state;if(state.source!==source){visible={source,view:source.view,notice:source.notice};setState(visible);}
 const current=useCallback(()=>sourceRef.current===source&&source.active,[source]);
 const publish=()=>{if(current())setState({source,view:source.view,notice:source.notice});};
 const persist=(notify:boolean)=>{
  if(source.timer!==null){clearTimeout(source.timer);source.timer=null;}
  if(!source.key)return false;
  const previousNotice=source.notice,saved=writeNotebookLibraryView(source,source.view,local);
  if(saved)ephemeral.delete(source.key);else ephemeral.set(source.key,source.view);
  source.dirty=false;source.notice=saved?'':NOTEBOOK_LIBRARY_VIEW_WRITE_ERROR;
  if(notify&&source.notice!==previousNotice)publish();return saved;
 };
 const sample=(withAnchor=true)=>{if(!current()||source.restore)return;if(source.notice===NOTEBOOK_LIBRARY_VIEW_READ_ERROR&&!source.dirty&&(!source.main||source.main.scrollTop===source.view.main.top&&source.main.scrollLeft===source.view.main.left)&&(!source.sidebar||source.sidebar.scrollTop===source.view.sidebar.top&&source.sidebar.scrollLeft===source.view.sidebar.left))return;const main=source.main?(withAnchor?captureNotebookLibraryScroll(source.main,true):{top:Math.max(0,source.main.scrollTop),left:Math.max(0,source.main.scrollLeft),anchorId:null,anchorOffset:0}):source.view.main,sidebar=source.sidebar?captureNotebookLibraryScroll(source.sidebar,false):source.view.sidebar;const equal=(a:typeof main,b:typeof main)=>a.top===b.top&&a.left===b.left&&a.anchorId===b.anchorId&&a.anchorOffset===b.anchorOffset;if(equal(main,source.view.main)&&equal(sidebar,source.view.sidebar))return;source.view={...source.view,main,sidebar};source.dirty=true;};
 const checkpoint=useCallback(()=>{if(!current())return false;sample();return source.dirty?persist(true):!source.notice;},[source,current]);
 const patch=useCallback((change:Partial<NotebookLibraryViewState>|((view:NotebookLibraryViewState)=>Partial<NotebookLibraryViewState>))=>{
  if(!current())return false;const next={...source.view,...(typeof change==='function'?change(source.view):change)};if(!isNotebookLibraryViewState(next))return false;source.view=next;source.restore=true;source.dirty=true;persist(false);publish();return true;
 },[source,current]);
 const mainRef=useCallback((node:HTMLElement|null)=>{source.main=node;},[source]);
 const sidebarRef=useCallback((node:HTMLElement|null)=>{source.sidebar=node;},[source]);
 const restoreScroll=useCallback((ready:boolean)=>{if(!ready||!current()||!source.restore)return;const {main,sidebar}=source.view;if(source.main)restoreNotebookLibraryScroll(source.main,main);if(source.sidebar)restoreNotebookLibraryScroll(source.sidebar,sidebar);source.restore=false;},[source,current]);
 const changeMode=useCallback((mode:'grid'|'list')=>{if(!current())return false;sample();return patch({mode});},[source,current,patch]);
 const retry=useCallback(()=>{if(!current())return false;if(source.key&&ephemeral.has(source.key))return persist(true);if(!source.key)return false;const read=readNotebookLibraryView(source,local);source.view=read.view;source.notice=read.notice;source.restore=true;publish();return !read.notice;},[source,current]);
 useLayoutEffect(()=>{
  source.active=true;
  if(source.dirty)persist(true);
  const scrolled=()=>{if(!current())return;sample(false);if(source.restore)return;if(source.timer!==null)clearTimeout(source.timer);source.timer=setTimeout(()=>{source.timer=null;if(current()&&source.dirty){sample();persist(true);}},150);};
  const userScroll=(event:Event)=>{if(!current())return;if(event.type==='keydown'&&!['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes((event as KeyboardEvent).key))return;source.restore=false;};
  const nodes=[source.main,source.sidebar].filter((node):node is HTMLElement=>!!node);
  for(const node of nodes){node.addEventListener('scroll',scrolled,{passive:true});node.addEventListener('wheel',userScroll,{passive:true});node.addEventListener('pointerdown',userScroll,{passive:true});node.addEventListener('keydown',userScroll);}
  const leaving=()=>{if(current()){sample();if(source.dirty)persist(true);}};
  window.addEventListener('pagehide',leaving);document.addEventListener('visibilitychange',leaving);
  return()=>{if(current())sample();source.active=false;if(source.timer!==null){clearTimeout(source.timer);source.timer=null;}if(source.dirty)persist(false);for(const node of nodes){node.removeEventListener('scroll',scrolled);node.removeEventListener('wheel',userScroll);node.removeEventListener('pointerdown',userScroll);node.removeEventListener('keydown',userScroll);}window.removeEventListener('pagehide',leaving);document.removeEventListener('visibilitychange',leaving);};
 },[source,current]);
 return {source,view:visible.view,notice:visible.notice,current,patch,changeMode,mainRef,sidebarRef,restoreScroll,checkpoint,retry};
}
