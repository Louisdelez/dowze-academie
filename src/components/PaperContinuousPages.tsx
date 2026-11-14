import {forwardRef,useImperativeHandle,useLayoutEffect,useMemo,useRef,useState} from 'react';
import type {PaperDocument} from '../lib/notebookDocument';
import type {NotebookMediaScope} from './NotebookEditor';
import {createPaperPageViewportLayout,capturePaperPageViewportAnchor,restorePaperPageViewportAnchor,projectPaperPageViewportWindow,type PaperPageViewportAnchor,type PaperPageViewportLayout,type PaperPageViewportMode,type PaperPageViewportWindow} from '../lib/paperPageViewport';
import {createPaperContinuousReadScope,type PaperContinuousReadScope} from '../lib/paperContinuousReadScope';
import {PaperPageContent} from './PaperPageContent';
import './paper-notebook.css';
import './paper-continuous-pages.css';

export interface PaperContinuousPagesProps {
 document:PaperDocument;media:NotebookMediaScope;ownerKey:string;current:()=>boolean;zoom:number;
 mode:PaperPageViewportMode;selectedPageId:string;anchor?:PaperPageViewportAnchor;gap?:number;
 pinnedPageIds?:readonly string[];maxMountedPages?:number;
 onAnchorChange?:(anchor:PaperPageViewportAnchor)=>void;onSelectPage?:(pageId:string)=>void;onNotice?:(message:string)=>void;
}
export interface PaperContinuousPagesHandle {
 captureAnchor:()=>PaperPageViewportAnchor|null;
 scrollToAnchor:(anchor:PaperPageViewportAnchor)=>boolean;
 getProjection:()=>PaperPageViewportWindow|null;
}
interface ReaderLease {serial:number;document:PaperDocument;ownerKey:string;accountId:string;spaceId:string;api:NotebookMediaScope['api'];parentCurrent:()=>boolean;scope:PaperContinuousReadScope}
/** N067 reader foundation. Editing requires an independent page controller and
 * synchronous first-contact acquisition, not activation of PaperNotebook's
 * single global SVG. This component intentionally never accepts strokes/text. */
export const PaperContinuousPages=forwardRef<PaperContinuousPagesHandle,PaperContinuousPagesProps>((props,ref)=>{
 const host=useRef<HTMLDivElement>(null),mounted=useRef(true),latest=useRef(props);latest.current=props;
 const authority=useRef<ReaderLease|null>(null),snapshot=()=>({ownerKey:latest.current.ownerKey,document:latest.current.document,media:latest.current.media,current:()=>mounted.current&&latest.current.current()});
 if(!authority.current||authority.current.document!==props.document||authority.current.ownerKey!==props.ownerKey||authority.current.accountId!==props.media.accountId||authority.current.spaceId!==props.media.spaceId||authority.current.api!==props.media.api||authority.current.parentCurrent!==props.current){
  authority.current?.scope.revoke();authority.current={serial:(authority.current?.serial??-1)+1,document:props.document,ownerKey:props.ownerKey,accountId:props.media.accountId,spaceId:props.media.spaceId,api:props.media.api,parentCurrent:props.current,scope:createPaperContinuousReadScope(snapshot(),snapshot)};
 }
 const lease=authority.current,[bounds,setBounds]=useState({width:0,height:0}),[position,setPosition]=useState({logicalScroll:0,pageScroll:0,pageId:props.selectedPageId}),[notice,setNotice]=useState(''),[revoked,setRevoked]=useState(-1);
 const ownerStamp=JSON.stringify([props.ownerKey,props.media.accountId,props.media.spaceId,props.document.noteId]);
 const layout=useMemo(()=>createPaperPageViewportLayout(props.document.pages,{zoom:props.zoom,gap:props.gap}),[props.document.pages,props.zoom,props.gap]),previousLayout=useRef<PaperPageViewportLayout>(layout),previousInputs=useRef({serial:lease.serial,ownerStamp,mode:props.mode,selectedPageId:props.selectedPageId,anchor:props.anchor});
 const anchorRef=useRef<PaperPageViewportAnchor>(props.anchor??{pageId:props.selectedPageId,pageY:0,viewportOffset:0}),pendingScroll=useRef<number|null>(null),projectionRef=useRef<PaperPageViewportWindow|null>(null);
 const height=bounds.height>0?bounds.height:1,projection=props.mode==='continuous'?projectPaperPageViewportWindow(layout,{logicalScroll:position.logicalScroll,viewportHeight:height,maxMountedPages:props.maxMountedPages??3,pinnedPageIds:props.pinnedPageIds}):null;projectionRef.current=projection;
 const selected=layout.slots.find(slot=>slot.pageId===position.pageId)??layout.slots.find(slot=>slot.pageId===props.selectedPageId)??layout.slots[0],rows=projection?.slots??[{...selected,physicalTop:0,visible:true,mounted:true,pinned:false,parked:false}],physicalExtent=projection?.physicalExtent??Math.max(height,selected.scaledHeight);
 const report=(message:string)=>{if(!lease.scope.current())return;setNotice(message);latest.current.onNotice?.(message);};
 const restore=(anchor:PaperPageViewportAnchor)=>{
  if(!lease.scope.current())return false;
  try{const value=restorePaperPageViewportAnchor(anchor,layout,{mode:props.mode,viewportHeight:height,previousLayout:previousLayout.current});anchorRef.current=value.anchor;
   const nextProjection=props.mode==='continuous'?projectPaperPageViewportWindow(layout,{logicalScroll:value.logicalScroll,viewportHeight:height,maxMountedPages:props.maxMountedPages??3,pinnedPageIds:props.pinnedPageIds}):null;
   pendingScroll.current=nextProjection?.physicalScroll??value.pageScroll;setPosition({logicalScroll:value.logicalScroll,pageScroll:value.pageScroll,pageId:value.pageId});return true;
  }catch(error){report(String(error instanceof Error?error.message:error));return false;}
 };
 useImperativeHandle(ref,()=>({captureAnchor:()=>lease.scope.current()?Object.freeze({...anchorRef.current}):null,scrollToAnchor:restore,getProjection:()=>lease.scope.current()?projectionRef.current:null}),[lease,layout,props.mode,height,props.maxMountedPages,props.pinnedPageIds]);
 useLayoutEffect(()=>{mounted.current=true;const node=host.current;if(!node)return;let stopped=false;
  const measure=()=>{if(stopped)return;const width=node.clientWidth,height=node.clientHeight;if(width>0&&height>0)setBounds(before=>before.width===width&&before.height===height?before:{width,height});};
  const observer=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(measure);observer?.observe(node);node.ownerDocument.defaultView?.addEventListener('resize',measure);measure();
  return()=>{stopped=true;mounted.current=false;observer?.disconnect();node.ownerDocument.defaultView?.removeEventListener('resize',measure);};
 },[]);
 useLayoutEffect(()=>{
  const before=previousInputs.current;let anchor=anchorRef.current;
  if(before.ownerStamp!==ownerStamp){anchor=props.anchor??{pageId:props.selectedPageId,pageY:0,viewportOffset:0};setNotice('');}
  else if(props.anchor&&props.anchor!==before.anchor)anchor=props.anchor;
  else if(props.selectedPageId!==before.selectedPageId&&props.selectedPageId!==anchor.pageId)anchor={pageId:props.selectedPageId,pageY:0,viewportOffset:0};
  restore(anchor);previousLayout.current=layout;previousInputs.current={serial:lease.serial,ownerStamp,mode:props.mode,selectedPageId:props.selectedPageId,anchor:props.anchor};
 },[lease,layout,props.mode,props.selectedPageId,props.anchor,height,ownerStamp]);
 useLayoutEffect(()=>{const node=host.current,scroll=pendingScroll.current;pendingScroll.current=null;if(node&&scroll!==null&&lease.scope.current())node.scrollTop=scroll;},[position,projection?.originOffset,lease]);
 useLayoutEffect(()=>{let stopped=false,timer:ReturnType<typeof setInterval>|undefined;const inspect=()=>{if(stopped||authority.current!==lease)return;if(!lease.scope.current()){stopped=true;if(timer)clearInterval(timer);if(host.current)host.current.style.opacity='0';setRevoked(lease.serial);}};inspect();if(!stopped)timer=setInterval(inspect,50);return()=>{stopped=true;if(timer)clearInterval(timer);};},[lease]);
 const scroll=()=>{
  if(!lease.scope.current()||!host.current)return;const local=host.current.scrollTop;
  try{const logical=props.mode==='continuous'?(projection?.originOffset??0)+local:local,anchor=capturePaperPageViewportAnchor(layout,props.mode==='continuous'?{mode:'continuous',logicalScroll:logical}:{mode:'single',pageId:selected.pageId,pageScroll:local});anchorRef.current=anchor;
   const next=restorePaperPageViewportAnchor(anchor,layout,{mode:props.mode,viewportHeight:height}),window=props.mode==='continuous'?projectPaperPageViewportWindow(layout,{logicalScroll:next.logicalScroll,viewportHeight:height,maxMountedPages:props.maxMountedPages??3,pinnedPageIds:props.pinnedPageIds}):null;
   if(window&&window.originOffset!==projection?.originOffset)pendingScroll.current=window.physicalScroll;setPosition({logicalScroll:next.logicalScroll,pageScroll:next.pageScroll,pageId:next.pageId});latest.current.onAnchorChange?.(anchor);
  }catch(error){report(String(error instanceof Error?error.message:error));}
 };
 const live=revoked!==lease.serial&&lease.scope.current();
 useLayoutEffect(()=>{if(host.current)host.current.style.opacity=live?'1':'0';},[lease,live]);
 return <div ref={host} className="paper-continuous-pages" data-page-view-mode={props.mode} data-readonly="true" data-logical-scroll={position.logicalScroll} data-window-origin={projection?.originOffset??0} onScroll={scroll} role="region" aria-label={props.mode==='continuous'?'Pages de la note en lecture continue':'Page de la note en lecture seule'} style={{opacity:live?1:0}}>
  {live&&<div className="paper-continuous-pages-window" style={{height:physicalExtent,width:layout.maxWidth}}>{rows.map(row=>{const page=props.document.pages.find(page=>page.id===row.pageId);if(!page)return null;const current=lease.scope.pageCurrent(page.id),pixelWidth=Math.max(1,Math.min(row.scaledWidth,bounds.width||row.scaledWidth)*(globalThis.devicePixelRatio||1));return <section key={`${lease.serial}|${row.key}`} className="paper-continuous-page-frame" data-continuous-page={page.id} data-page-mounted={row.mounted?'true':'false'} data-page-parked={row.parked?'true':'false'} aria-hidden={row.parked||undefined} inert={row.parked||undefined} style={{top:row.physicalTop??0,width:row.parked?0:row.scaledWidth,height:row.parked?0:row.scaledHeight,...(row.parked?{left:-600001,overflow:'hidden' as const,opacity:0,pointerEvents:'none' as const}:{}),backgroundColor:page.color}}>
   {!row.parked&&<button type="button" className="paper-continuous-page-select" aria-label={`Ouvrir la page ${row.index+1}`} aria-pressed={page.id===props.selectedPageId} onClick={()=>{if(!current())return;if(restore({pageId:page.id,pageY:0,viewportOffset:0}))latest.current.onSelectPage?.(page.id);}}>Page {row.index+1}</button>}
   {row.mounted&&!row.parked?<div style={{width:page.width,height:page.height,transform:`scale(${props.zoom})`,transformOrigin:'0 0'}}><PaperPageContent document={props.document} page={page} media={props.media} current={current} pixelWidth={pixelWidth} onNotice={message=>{if(current())report(message);}}/></div>:!row.parked&&<p className="paper-continuous-page-placeholder">Page {row.index+1} — aperçu chargé à proximité</p>}
  </section>;})}</div>}
  {notice&&live&&<div className="paper-continuous-pages-notice" role="status"><p>{notice}</p></div>}
 </div>;
});
