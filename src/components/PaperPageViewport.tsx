import {forwardRef,useImperativeHandle,useLayoutEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {capturePaperPageViewportAnchor,createPaperPageViewportLayout,projectPaperPageViewportWindow,restorePaperPageViewportAnchor,type PaperPageViewportAnchor,type PaperPageViewportLayout,type PaperPageViewportMode,type PaperPageViewportPage,type PaperPageViewportProjectedSlot,type PaperPageViewportWindow} from '../lib/paperPageViewport';
import './paper-page-viewport.css';

export interface PaperPageViewportHandle {
 captureAnchor:()=>PaperPageViewportAnchor|null;
 captureAnchorAt:(viewportOffset:number)=>PaperPageViewportAnchor|null;
 scrollToAnchor:(anchor:PaperPageViewportAnchor)=>boolean;
 getProjection:()=>PaperPageViewportWindow|null;
 getElement:()=>HTMLDivElement|null;
}
export interface PaperPageViewportProps {
 /** Monotonic view authority. Never use a document revision or the toolbar page. */
 ownerKey:string;generation:string|number;api?:object|null;current:()=>boolean;
 /** Explicit identity of one document view. Only its numeric anchor can cross
  * a fresh generation; it never keeps an old handle, frame or input current. */
 viewIdentity?:object;
 /** Parent layout/commit readiness, distinct from an evaluated authority refusal. */
 authorityReady?:()=>boolean;
 pages:readonly PaperPageViewportPage[];mode:PaperPageViewportMode;zoom:number;
 selectedPageId:string;pinnedPageIds?:readonly string[];maxMountedPages?:number;gap?:number;
 anchor?:PaperPageViewportAnchor;
 /** Called for every nearby/retained frame. A placeholder can own a lightweight
  * input controller immediately; expensive readers/writers use slot.mounted.
  * A parked frame keeps the same child tree and dimensions, including its IME. */
 renderPage:(slot:PaperPageViewportProjectedSlot,current:()=>boolean)=>ReactNode;
 /** Canonical editors stay siblings of frames, including while old writers are
  * being preserved. Parent hides and retains revoked writers until confirmed. */
 renderWindow?:(rows:readonly PaperPageViewportProjectedSlot[],layout:PaperPageViewportLayout,current:()=>boolean)=>ReactNode;
 onAnchorChange?:(anchor:PaperPageViewportAnchor)=>void;onNotice?:(message:string)=>void;
}
interface Authority {ownerKey:string;generation:string|number;api:object|null|undefined;viewIdentity:object|undefined;revoked:boolean;serial:number}
interface FrameLease {owner:Authority;revoked:boolean;width:number;height:number}
interface Position {pageId:string;logicalScroll:number;pageScroll:number}
const singleRows=(layout:PaperPageViewportLayout,pageId:string,pins:readonly string[]|undefined):readonly PaperPageViewportProjectedSlot[]=>{
 const selected=layout.slots.find(row=>row.pageId===pageId)??layout.slots[0],retained=new Set(pins??[]);
 // Reuse the checked pin admission, even in single-page mode.
 const checked=projectPaperPageViewportWindow(layout,{logicalScroll:0,viewportHeight:1,maxMountedPages:1,pinnedPageIds:pins});
 return layout.slots.filter(row=>row.pageId===selected.pageId||checked.mountedPageIds.includes(row.pageId)&&retained.has(row.pageId)).map(row=>({...row,physicalTop:row.pageId===selected.pageId?0:null,visible:row.pageId===selected.pageId,mounted:true,pinned:retained.has(row.pageId),parked:row.pageId!==selected.pageId}));
};

/** Editable viewport foundation. Its frame keys are owner-generation/page IDs,
 * not document identities. Pins must cover contacts, dirty text, composition and
 * the focused caret before scrolling or switching modes can evict a page host.
 * This component owns no canonical command and does not create an editor.
 * The parent must drain or retain its writer tree before every revocation,
 * including visibility/permissions and account/API retirement: pins here cover
 * the current owner only. This foundation is not a durable writer barrier. */
export const PaperPageViewport=forwardRef<PaperPageViewportHandle,PaperPageViewportProps>((props,ref)=>{
 const host=useRef<HTMLDivElement>(null),mounted=useRef(true),latest=useRef(props);latest.current=props;
 const authority=useRef<Authority|null>(null);
 if(!authority.current||authority.current.ownerKey!==props.ownerKey||authority.current.generation!==props.generation||authority.current.api!==props.api||authority.current.viewIdentity!==props.viewIdentity){
  if(authority.current)authority.current.revoked=true;
  authority.current={ownerKey:props.ownerKey,generation:props.generation,api:props.api,viewIdentity:props.viewIdentity,revoked:false,serial:(authority.current?.serial??-1)+1};
 }
 const owner=authority.current;
 const ready=()=>{try{return mounted.current&&(latest.current.authorityReady?.()??true);}catch{return false;}};
 const current=()=>{
  if(!ready()||owner.revoked||authority.current!==owner)return false;
  let allowed=false;try{allowed=latest.current.current();}catch{}
  if(!allowed)owner.revoked=true;return allowed;
 };
 const layout=useMemo(()=>createPaperPageViewportLayout(props.pages,{zoom:props.zoom,gap:props.gap}),[props.pages,props.zoom,props.gap]);
 const previous=useRef<{layout:PaperPageViewportLayout;owner:Authority;mode:PaperPageViewportMode;selectedPageId:string;anchor:PaperPageViewportAnchor|undefined;origin:number}>({layout,owner,mode:props.mode,selectedPageId:props.selectedPageId,anchor:props.anchor,origin:0});
 const [bounds,setBounds]=useState({width:0,height:0}),[position,setPosition]=useState<Position>({pageId:props.selectedPageId,logicalScroll:0,pageScroll:0}),[revoked,setRevoked]=useState(-1);
 const anchor=useRef<PaperPageViewportAnchor>(props.anchor??{pageId:props.selectedPageId,pageY:0,viewportOffset:0}),pendingScroll=useRef<number|null>(null),projectionRef=useRef<PaperPageViewportWindow|null>(null);
 const deferredRestore=useRef<{owner:Authority;anchor:PaperPageViewportAnchor}|null>(null);
 const frames=useRef(new Map<string,FrameLease>()),restoreLatest=useRef<((value:PaperPageViewportAnchor)=>boolean)|null>(null),captureAtLatest=useRef<((offset:number)=>PaperPageViewportAnchor|null)|null>(null);
 const height=Math.max(1,bounds.height),projection=props.mode==='continuous'?projectPaperPageViewportWindow(layout,{logicalScroll:position.logicalScroll,viewportHeight:height,maxMountedPages:props.maxMountedPages??3,pinnedPageIds:props.pinnedPageIds}):null;projectionRef.current=projection;
 const rows=projection?.slots??singleRows(layout,position.pageId,props.pinnedPageIds),selected=layout.slots.find(row=>row.pageId===position.pageId)??layout.slots[0],physicalExtent=projection?.physicalExtent??Math.max(height,selected.scaledHeight);
 const notice=(error:unknown)=>{if(current())latest.current.onNotice?.(error instanceof Error?error.message:String(error));};
 const restore=(value:PaperPageViewportAnchor)=>{
  if(!current())return false;
  try{
   const restored=restorePaperPageViewportAnchor(value,layout,{mode:props.mode,viewportHeight:height,previousLayout:previous.current.layout});
   const next=props.mode==='continuous'?projectPaperPageViewportWindow(layout,{logicalScroll:restored.logicalScroll,viewportHeight:height,maxMountedPages:props.maxMountedPages??3,pinnedPageIds:props.pinnedPageIds}):null;
   // A newly admitted navigation wins over the anchor queued before readiness.
   if(deferredRestore.current?.owner===owner)deferredRestore.current=null;
   anchor.current=restored.anchor;pendingScroll.current=next?.physicalScroll??restored.pageScroll;
   setPosition({pageId:restored.pageId,logicalScroll:restored.logicalScroll,pageScroll:restored.pageScroll});return true;
  }catch(error){notice(error);return false;}
 };
 restoreLatest.current=restore;
 captureAtLatest.current=offset=>{if(!current()||!host.current)return null;try{return capturePaperPageViewportAnchor(layout,props.mode==='continuous'?{mode:'continuous',logicalScroll:(projectionRef.current?.originOffset??0)+host.current.scrollTop,viewportOffset:offset}:{mode:'single',pageId:selected.pageId,pageScroll:host.current.scrollTop,viewportOffset:offset});}catch(error){notice(error);return null;}};
 useImperativeHandle(ref,()=>({captureAnchor:()=>current()?Object.freeze({...anchor.current}):null,captureAnchorAt:offset=>current()?captureAtLatest.current?.(offset)??null:null,scrollToAnchor:value=>current()&&latest.current.pages.some(page=>page.id===value.pageId)?restoreLatest.current?.(value)===true:false,getProjection:()=>current()?projectionRef.current:null,getElement:()=>current()?host.current:null}),[owner]);
 useLayoutEffect(()=>{
  mounted.current=true;const node=host.current;if(!node)return;let stopped=false;
  const measure=()=>{if(stopped)return;const width=node.clientWidth,height=node.clientHeight;if(width>0&&height>0)setBounds(before=>before.width===width&&before.height===height?before:{width,height});};
  const observer=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(measure);observer?.observe(node);node.ownerDocument.defaultView?.addEventListener('resize',measure);measure();
  return()=>{stopped=true;mounted.current=false;observer?.disconnect();node.ownerDocument.defaultView?.removeEventListener('resize',measure);};
 },[]);
 useLayoutEffect(()=>{
  const before=previous.current;let next=anchor.current;
  if(before.owner!==owner){
   const sameView=!!props.viewIdentity&&before.owner.viewIdentity===props.viewIdentity&&before.owner.ownerKey===owner.ownerKey&&before.owner.api===owner.api;
   // Copy data, never the previous authority or its callbacks. A hidden tab's
   // fresh generation can restore its view only within this explicit identity.
   next=props.anchor??(sameView?{pageId:anchor.current.pageId,pageY:anchor.current.pageY,viewportOffset:anchor.current.viewportOffset}:{pageId:props.selectedPageId,pageY:0,viewportOffset:0});
  }
  else if(props.anchor&&props.anchor!==before.anchor)next=props.anchor;
  else if(before.layout!==layout&&before.mode===props.mode&&host.current){
   // Native scrollTop is authoritative even if its scroll event has not been
   // delivered yet when the user changes zoom. Capture against the old layout
   // at the same caret/pinch reference point, not an implicit viewport top.
   try{next=capturePaperPageViewportAnchor(before.layout,before.mode==='continuous'?{mode:'continuous',logicalScroll:before.origin+host.current.scrollTop,viewportOffset:anchor.current.viewportOffset}:{mode:'single',pageId:position.pageId,pageScroll:host.current.scrollTop,viewportOffset:anchor.current.viewportOffset});}catch(error){notice(error);}
  }
  // A toolbar selection is not a navigation request: first contact B must not
  // reset scroll to B's top. Explicit navigation uses scrollToAnchor/anchor.
  if(!ready())deferredRestore.current={owner,anchor:next};else restore(next);previous.current={layout,owner,mode:props.mode,selectedPageId:props.selectedPageId,anchor:props.anchor,origin:projection?.originOffset??0};
 },[owner,layout,props.mode,props.anchor,height]);
 useLayoutEffect(()=>{const node=host.current,value=pendingScroll.current;
  if(!ready()){if(value!==null&&deferredRestore.current?.owner!==owner)deferredRestore.current={owner,anchor:anchor.current};return;}
  pendingScroll.current=null;if(node&&value!==null&&current())node.scrollTop=value;previous.current.origin=projection?.originOffset??0;
 },[position,projection?.originOffset,owner]);
 useLayoutEffect(()=>{
  let stopped=false,timer:ReturnType<typeof setInterval>|undefined;
  const inspect=()=>{if(stopped||authority.current!==owner||!ready())return;if(!current()){stopped=true;if(timer)clearInterval(timer);if(host.current)host.current.style.opacity='0';setRevoked(owner.serial);return;}const pending=deferredRestore.current;if(pending?.owner===owner){deferredRestore.current=null;restoreLatest.current?.(pending.anchor);}};
  inspect();queueMicrotask(inspect);if(!stopped)timer=setInterval(inspect,50);return()=>{stopped=true;if(timer)clearInterval(timer);};
 },[owner]);
 const scroll=()=>{
  if(!current()||!host.current)return;
  try{
   const local=host.current.scrollTop,logical=props.mode==='continuous'?(projection?.originOffset??0)+local:local;
   // A restore can itself deliver a native scroll event. Preserve its chosen
   // viewport reference; real movement still recaptures the latest DOM scroll.
   const captured=capturePaperPageViewportAnchor(layout,props.mode==='continuous'?{mode:'continuous',logicalScroll:logical,viewportOffset:anchor.current.viewportOffset}:{mode:'single',pageId:selected.pageId,pageScroll:local,viewportOffset:anchor.current.viewportOffset});
   const restored=restorePaperPageViewportAnchor(captured,layout,{mode:props.mode,viewportHeight:height});anchor.current=captured;
   const next=props.mode==='continuous'?projectPaperPageViewportWindow(layout,{logicalScroll:restored.logicalScroll,viewportHeight:height,maxMountedPages:props.maxMountedPages??3,pinnedPageIds:props.pinnedPageIds}):null;
   if(next&&next.originOffset!==projection?.originOffset)pendingScroll.current=next.physicalScroll;
   setPosition({pageId:restored.pageId,logicalScroll:restored.logicalScroll,pageScroll:restored.pageScroll});latest.current.onAnchorChange?.(captured);
  }catch(error){notice(error);}
 };
 // Keep this exact owner tree while its parent reconnects layout effects.
 // Handles, inputs and reads still require current(), and are refused until ready.
 const live=revoked!==owner.serial&&!owner.revoked&&authority.current===owner&&(!ready()||current());
 const liveIds=new Set(live?rows.map(row=>row.pageId):[]);
 for(const [id,lease] of frames.current)if(lease.owner!==owner||!liveIds.has(id)){lease.revoked=true;frames.current.delete(id);}
 for(const row of live?rows:[]){
  const previous=frames.current.get(row.pageId);
  if(!previous||previous.width!==row.pageWidth||previous.height!==row.pageHeight){
   if(previous)previous.revoked=true;
   frames.current.set(row.pageId,{owner,revoked:false,width:row.pageWidth,height:row.pageHeight});
  }
 }
 useLayoutEffect(()=>{if(host.current)host.current.style.opacity=live?'1':'0';},[live,owner]);
 return <div ref={host} className="paper-page-viewport" data-page-view-mode={props.mode} data-logical-scroll={position.logicalScroll} data-window-origin={projection?.originOffset??0} onScroll={scroll} role="region" aria-label="Pages du carnet" style={{opacity:live?1:0}}>
  <div className="paper-page-viewport-window" style={{height:physicalExtent,width:layout.maxWidth}}>{(live?rows:[]).map(row=>{
   const lease=frames.current.get(row.pageId)!;
   const pageCurrent=()=>!lease.revoked&&frames.current.get(row.pageId)===lease&&current()&&latest.current.pages.some(page=>page.id===row.pageId&&page.width===row.pageWidth&&page.height===row.pageHeight);
   return <section key={`${owner.serial}|${row.pageId}`} className="paper-page-viewport-frame" data-viewport-page={row.pageId} data-page-mounted={String(row.mounted)} data-page-parked={String(row.parked)} aria-label={`Page ${row.index+1}`} style={{top:row.physicalTop??0,width:row.scaledWidth,height:row.scaledHeight,...(row.parked?{left:-600001,opacity:0,pointerEvents:'none' as const}:{} )}}>
    <div className="paper-page-viewport-surface" style={{width:row.pageWidth,height:row.pageHeight,transform:`scale(${props.zoom})`}}>{props.renderPage(row,pageCurrent)}</div>
   </section>;
  })}{props.renderWindow?.(live?rows:[],layout,current)}</div>
 </div>;
});
