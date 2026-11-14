import {useLayoutEffect,useRef,useState} from 'react';
import type {ApiClient} from '../../pwa/src/api';
import {paperNotebookShortcut,paperNotebookShortcutEnvironment,type PaperNotebookShortcutAction} from '../lib/paperNotebookKeyboard';

export type PaperNotebookExternalShortcut=Exclude<PaperNotebookShortcutAction,'focus'|'help'|'escape'>;
export interface PaperNotebookControlsOptions {
 accountId:string;spaceId:string;noteId:string;api?:ApiClient;
 /** Owner/tab incarnation, independent of document revisions. */
 source:object;
 /** Exact page/document incarnation. Changing it retires handlers, not focus. */
 context:object;current:()=>boolean;visible:boolean;disabled?:boolean;
 actions:Partial<Record<PaperNotebookExternalShortcut,()=>unknown>>;
 available?:(action:PaperNotebookExternalShortcut)=>boolean;
 onFocusChange?:(focused:boolean)=>void;onError?:(message:string)=>void;
}
interface Authority {source:object;accountId:string;spaceId:string;noteId:string;api:ApiClient|undefined;visible:boolean;disabled:boolean;alive:boolean;revoked:boolean;apiCurrent:(()=>boolean)|null;compositions:Set<EventTarget>;pending:Set<PaperNotebookExternalShortcut>}
interface View {authority:Authority;context:object}
export interface PaperNotebookControls {
 source:object;focusMode:boolean;helpOpen:boolean;disabled:boolean;
 current:(captureApi?:boolean)=>boolean;setFocusMode:(value:boolean|((previous:boolean)=>boolean))=>boolean;
 toggleFocus:()=>boolean;openHelp:()=>boolean;closeHelp:()=>boolean;
 available:(action:PaperNotebookShortcutAction)=>boolean;
 /** Gate the existing surface command menu before it can intercept a key. */
 canHandleKey:(event:KeyboardInput)=>boolean;
 onKeyDown:(event:KeyboardInput)=>boolean;
 onCompositionStartCapture:(event:{target:EventTarget|null})=>void;
 onCompositionEndCapture:(event:{target:EventTarget|null})=>void;
}
interface KeyboardInput {
 key:string;ctrlKey?:boolean;metaKey?:boolean;altKey?:boolean;shiftKey?:boolean;repeat?:boolean;defaultPrevented?:boolean;
 target:EventTarget|null;nativeEvent?:{isComposing?:boolean;keyCode?:number;getModifierState?:(key:'AltGraph')=>boolean;composedPath?:()=>EventTarget[]};
 isComposing?:boolean;keyCode?:number;getModifierState?:(key:'AltGraph')=>boolean;composedPath?:()=>EventTarget[];
 preventDefault:()=>void;stopPropagation:()=>void;
}
/** UI-only state. Accepted parent commands retain their own existing save
 * barrier; this hook neither flushes nor destroys/reparents editor or audio DOM. */
export function usePaperNotebookControls(options:PaperNotebookControlsOptions):PaperNotebookControls {
 const latest=useRef(options);latest.current=options;
 const authority=useRef<Authority|null>(null),view=useRef<View|null>(null);
 let lost=false;try{lost=!!authority.current?.apiCurrent&&!authority.current.apiCurrent();}catch{lost=true;}
 const before=authority.current;
 if(!before||lost||before.source!==options.source||before.accountId!==options.accountId||before.spaceId!==options.spaceId||before.noteId!==options.noteId||before.api!==options.api||before.visible!==options.visible||before.disabled!==!!options.disabled){
  if(before)before.revoked=true;
  authority.current={source:options.source,accountId:options.accountId,spaceId:options.spaceId,noteId:options.noteId,api:options.api,visible:options.visible,disabled:!!options.disabled,alive:false,revoked:false,apiCurrent:null,compositions:new Set(),pending:new Set()};
 }
 const captured=authority.current!;
 if(!view.current||view.current.authority!==captured||view.current.context!==options.context)view.current={authority:captured,context:options.context};
 const ticket=view.current;
 const [state,setState]=useState({authority:captured,focusMode:false,helpOpen:false});
 const stateRef=useRef(state);stateRef.current=state;
 useLayoutEffect(()=>{captured.alive=true;return()=>{captured.alive=false;};},[captured]);
 const current=(captureApi=true)=>{
  if(!captured.alive||captured.revoked||authority.current!==captured||view.current!==ticket)return false;
  let allowed=false;try{allowed=latest.current.source===captured.source&&latest.current.context===ticket.context&&latest.current.visible&&!latest.current.disabled&&latest.current.current();}catch{}
  if(!allowed){captured.revoked=true;return false;}
  // A retired callback must return before this potentially binding operation.
  if(captureApi&&!captured.apiCurrent)try{captured.apiCurrent=captured.api?captured.api.captureSessionAuthority(captured.accountId):()=>true;}catch{captured.revoked=true;return false;}
  try{if(captured.apiCurrent&&!captured.apiCurrent())captured.revoked=true;}catch{captured.revoked=true;}
  return !captured.revoked&&captured.alive&&authority.current===captured&&view.current===ticket;
 };
 const local=()=>stateRef.current.authority===captured?stateRef.current:{authority:captured,focusMode:false,helpOpen:false};
 const composing=()=>captured.compositions.size>0;
 const update=(focusMode:boolean,helpOpen:boolean)=>{const next={authority:captured,focusMode,helpOpen};stateRef.current=next;setState(next);};
 const setFocusMode=(value:boolean|((previous:boolean)=>boolean))=>{
  if(!current()||composing())return false;const previous=local(),next=typeof value==='function'?value(previous.focusMode):value;
  if(!current())return false;update(next,false);if(next!==previous.focusMode)latest.current.onFocusChange?.(next);return true;
 };
 const openHelp=()=>{if(!current()||composing())return false;const prior=local();update(false,true);if(prior.focusMode)latest.current.onFocusChange?.(false);return true;};
 const closeHelp=()=>{if(!current()||composing())return false;const previous=local();update(previous.focusMode,false);return true;};
 const available=(action:PaperNotebookShortcutAction)=>{
  if(!current(false)||composing())return false;
  if(action==='focus'||action==='help')return true;
  if(action==='escape')return local().focusMode||local().helpOpen;
  try{return !captured.pending.has(action)&&!!latest.current.actions[action]&&(latest.current.available?.(action)??true)&&current(false);}catch{return false;}
 };
 const keyContext=(event:KeyboardInput)=>{const native=event.nativeEvent??event;let altGraph=false;try{altGraph=native.getModifierState?.('AltGraph')??false;}catch{}return {native,altGraph,environment:paperNotebookShortcutEnvironment({target:event.target,composedPath:native.composedPath?.bind(native)},composing())};};
 const canHandleKey=(event:KeyboardInput)=>{
  if(!current(false))return false;const {native,altGraph,environment}=keyContext(event);
  return !event.defaultPrevented&&!event.repeat&&!native.isComposing&&native.keyCode!==229&&!altGraph&&!environment.editing&&!environment.modal&&!environment.composing&&(!local().helpOpen||event.key==='Escape');
 };
 const onKeyDown=(event:KeyboardInput)=>{
  if(!canHandleKey(event))return false;const {native,altGraph,environment}=keyContext(event);
  const action=paperNotebookShortcut({...event,isComposing:native.isComposing,keyCode:native.keyCode,altGraph},environment);
  if(!action||local().helpOpen&&action!=='escape'||!available(action)||!current())return false;
  event.preventDefault();event.stopPropagation();
  if(action==='focus')return setFocusMode(value=>!value);
  if(action==='help')return openHelp();
  if(action==='escape'){const previous=local();return previous.helpOpen?closeHelp():setFocusMode(false);}
  const callback=latest.current.actions[action];if(!callback||!current())return false;
  captured.pending.add(action);
  try{const work=callback();void Promise.resolve(work).catch(error=>{if(current(false))latest.current.onError?.(String(error instanceof Error?error.message:error));}).finally(()=>captured.pending.delete(action));}
  catch(error){captured.pending.delete(action);if(current(false))latest.current.onError?.(String(error instanceof Error?error.message:error));}
  return true;
 };
 return {source:captured,focusMode:state.authority===captured&&state.focusMode,helpOpen:state.authority===captured&&state.helpOpen,disabled:!options.visible||!!options.disabled,current,setFocusMode,toggleFocus:()=>setFocusMode(value=>!value),openHelp,closeHelp,available,canHandleKey,onKeyDown,
  onCompositionStartCapture:event=>{if(event.target&&current(false))captured.compositions.add(event.target);},
  onCompositionEndCapture:event=>{if(event.target)captured.compositions.delete(event.target);}};
}
