import {useEffect,useLayoutEffect,useRef,useState} from 'react';
export type NotebookSplitOrientation='auto'|'horizontal'|'vertical';
export interface NotebookSplitState {owner:string;secondaryId:string|null;orientation:NotebookSplitOrientation;ratio:number}
export const initialNotebookSplitState=(owner:string):NotebookSplitState=>({owner,secondaryId:null,orientation:'auto',ratio:50});
export const clampNotebookSplitRatio=(value:number)=>Math.max(25,Math.min(75,Number.isFinite(value)?value:50));
/** View state only. Every note retains its own document, commands, history and
 * durable writer. A pane never duplicates the current editor's identity. */
export function useNotebookSplitWorkspace(scope:{accountId:string;spaceId:string},primaryId:string|null|undefined,availableIds:readonly string[],mountedIds?:readonly string[]){
 const owner=JSON.stringify([scope.accountId,scope.spaceId]),rendered=useRef({owner,primaryId,ids:availableIds});rendered.current={owner,primaryId,ids:availableIds};const alive=useRef(true);
 const epoch=useRef({key:JSON.stringify([owner,primaryId??null]),value:0});const identity=JSON.stringify([owner,primaryId??null]);if(epoch.current.key!==identity)epoch.current={key:identity,value:epoch.current.value+1};const capturedEpoch=epoch.current.value;
 const containerRef=useRef<HTMLDivElement>(null),[autoAxis,setAutoAxis]=useState<'horizontal'|'vertical'>(()=>typeof innerWidth==='number'&&innerWidth<=720?'vertical':'horizontal');
 const [stored,setStored]=useState<NotebookSplitState>(()=>initialNotebookSplitState(owner));
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const state=stored.owner===owner?stored:initialNotebookSplitState(owner),secondaryId=primaryId&&state.secondaryId!==primaryId&&availableIds.includes(state.secondaryId??'')&&(!mountedIds||mountedIds.includes(state.secondaryId??''))?state.secondaryId:null;
 const current=()=>alive.current&&epoch.current.value===capturedEpoch&&rendered.current.owner===owner&&rendered.current.primaryId===primaryId;
 const set=(patch:Partial<NotebookSplitState>)=>{if(!current())return false;setStored(old=>({...(old.owner===owner?old:initialNotebookSplitState(owner)),...patch,owner}));return true;};
 const choose=(id:string|null)=>{if(!current()||id!==null&&(id===primaryId||!rendered.current.ids.includes(id)))return false;return set({secondaryId:id});};
 /** Activating the note already in the other pane swaps views without remounting either editor. */
 const beforeActivate=(id:string)=>{if(!current()||!rendered.current.ids.includes(id))return false;if(secondaryId===id)set({secondaryId:primaryId??null});return true;};
 useLayoutEffect(()=>{const element=containerRef.current;if(!element)return;const measure=()=>{if(element.clientWidth>0)setAutoAxis(element.clientWidth<=720?'vertical':'horizontal');};measure();if(typeof ResizeObserver==='undefined')return;const observer=new ResizeObserver(measure);observer.observe(element);return()=>observer.disconnect();},[owner,primaryId,secondaryId]);
 return {containerRef,axis:state.orientation==='auto'?autoAxis:state.orientation,owner,primaryId,secondaryId,orientation:state.orientation,ratio:state.ratio,split:!!primaryId&&!!secondaryId,choose,beforeActivate,current,close:()=>choose(null),orient:(orientation:NotebookSplitOrientation)=>['auto','horizontal','vertical'].includes(orientation)&&set({orientation}),resize:(ratio:number)=>set({ratio:clampNotebookSplitRatio(ratio)})};
}
