import {useCallback,useLayoutEffect,useRef,useState} from 'react';
import {isNotebookLibrarySort,notebookLibrarySortPreferenceKey,readNotebookLibrarySort,writeNotebookLibrarySort,NOTEBOOK_LIBRARY_SORT_DEFAULT,NOTEBOOK_LIBRARY_SORT_READ_ERROR,NOTEBOOK_LIBRARY_SORT_WRITE_ERROR,type NotebookLibrarySort,type NotebookLibrarySortScope} from '../lib/notebookLibrarySort';

interface Source extends NotebookLibrarySortScope {readonly key:string|null;readonly api:unknown}
interface ViewState {source:Source;sort:NotebookLibrarySort;notice:string}
// Failed writes retain only an enum for this JS session, scoped by exact IDs.
// Returning from a note can keep the chosen order, while the notice stays honest.
const ephemeral=new Map<string,NotebookLibrarySort>();
const local=()=>window.localStorage;
function read(source:Source):ViewState{
 if(!source.key)return {source,sort:NOTEBOOK_LIBRARY_SORT_DEFAULT,notice:NOTEBOOK_LIBRARY_SORT_READ_ERROR};
 const memory=ephemeral.get(source.key);
 if(memory)return {source,sort:memory,notice:NOTEBOOK_LIBRARY_SORT_WRITE_ERROR};
 return {source,...readNotebookLibrarySort(source,local)};
}
export function useNotebookLibrarySort(scope:NotebookLibrarySortScope&{api?:unknown}){
 let key:string|null;try{key=notebookLibrarySortPreferenceKey(scope);}catch{key=null;}
 const sourceRef=useRef<Source|null>(null);
 if(!sourceRef.current||sourceRef.current.key!==key||sourceRef.current.api!==scope.api)sourceRef.current=Object.freeze({accountId:scope.accountId,spaceId:scope.spaceId,key,api:scope.api});
 const source=sourceRef.current,mounted=useRef(true);
 const [state,setState]=useState<ViewState>(()=>read(source));let visible=state;
 // Read the exact new key in this render, before any old value is displayed or
 // a child can save. Each observed A→B→A creates a distinct source object.
 if(state.source!==source){visible=read(source);setState(visible);}
 useLayoutEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const current=()=>mounted.current&&sourceRef.current===source;
 const setSort=useCallback((next:unknown):boolean=>{
  if(!mounted.current||sourceRef.current!==source||!source.key||!isNotebookLibrarySort(next))return false;
  const saved=writeNotebookLibrarySort(source,next,local);
  if(saved)ephemeral.delete(source.key);else ephemeral.set(source.key,next);
  if(mounted.current&&sourceRef.current===source)setState({source,sort:next,notice:saved?'':NOTEBOOK_LIBRARY_SORT_WRITE_ERROR});
  return saved;
 },[source]);
 const retry=()=>{
  if(!current()||!source.key)return false;
  const memory=ephemeral.get(source.key);if(memory)return setSort(memory);
  const fresh=read(source);if(current())setState(fresh);return fresh.notice==='';
 };
 return {sort:visible.sort,notice:visible.notice,setSort,retry,current};
}
