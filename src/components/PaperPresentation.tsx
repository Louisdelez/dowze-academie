import {lazy,Suspense,useId,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {PaperBackground} from './PaperBackground';
import {PaperMeasurementLabels} from './PaperMeasurementLabels';
import {PaperObjectVisual} from './PaperObjectVisual';
import {PaperTextFlowView} from './PaperTextFlowView';
import {paperObjectsOnPage} from '../lib/paperTextFlow';
import {paperObjectCssTransform} from '../lib/paperInkStyles';
import {paperPresentationFit} from '../lib/paperPresentation';
import type {PaperDocument} from '../lib/notebookDocument';
import type {NotebookMediaScope} from './NotebookEditor';
import './paper-presentation.css';

const PaperPdfPage=lazy(()=>import('./PaperPdfPage').then(module=>({default:module.PaperPdfPage})));
const samePageData=(expected:unknown,actual:unknown):boolean=>{
 if(expected===actual)return true;
 if(!expected||!actual||typeof expected!=='object'||typeof actual!=='object')return false;
 if(Array.isArray(expected))return Array.isArray(actual)&&expected.length===actual.length&&expected.every((value,index)=>samePageData(value,actual[index]));
 if(Array.isArray(actual))return false;
 const before=expected as Record<string,unknown>,after=actual as Record<string,unknown>,keys=Object.keys(before).filter(key=>before[key]!==undefined);
 return keys.length===Object.keys(after).filter(key=>after[key]!==undefined).length&&keys.every(key=>samePageData(before[key],after[key]));
};

export interface PaperPresentationProps {
 document:PaperDocument;
 pageId:string;
 media:NotebookMediaScope;
 ownerKey:string;
 /** Revoked when the parent note, account, visible workspace or permission changes. */
 current:()=>boolean;
 /** The workspace can still receive focus after a normal close; a revoked owner cannot. */
 focusCurrent?:()=>boolean;
 onClose:()=>void;
}

/** An audience reader: no document hook, writer, editor or layout command is mounted. */
export function PaperPresentation({document:paper, pageId, media, ownerKey, current, focusCurrent, onClose}:PaperPresentationProps){
 const titleId=useId(),dialog=useRef<HTMLDialogElement>(null),audience=useRef<HTMLDivElement>(null),viewport=useRef<HTMLDivElement>(null),content=useRef<HTMLDivElement>(null),exitControl=useRef<HTMLButtonElement>(null),mounted=useRef(true),pendingNavigation=useRef<string|null>(null);
 const session=useRef({ownerKey,noteId:paper.noteId,accountId:media.accountId,spaceId:media.spaceId,api:media.api,revoked:false,closed:false});
 const latest=useRef({paper,pageId,media,ownerKey,current,focusCurrent,onClose});latest.current={paper,pageId,media,ownerKey,current,focusCurrent,onClose};
 const [selection,setSelection]=useState({origin:pageId,pageId}),[bounds,setBounds]=useState({width:0,height:0}),[unavailable,setUnavailable]=useState(false),[fullScreen,setFullScreen]=useState(false),[notice,setNotice]=useState('');
 const shownId=selection.origin===pageId?selection.pageId:pageId;
 const page=paper.pages.find(value=>value.id===shownId),pageStamp=page?JSON.stringify(page):'',assetStamp=JSON.stringify(paper.assets);
 const runtime=useRef({epoch:0,paper,revision:paper.revision,lineage:paper.collaboration?.lineage,ownerKey,inputPageId:pageId,shownId,pageStamp,assetStamp,api:media.api});
 if(runtime.current.paper!==paper||runtime.current.revision!==paper.revision||runtime.current.lineage!==paper.collaboration?.lineage||runtime.current.ownerKey!==ownerKey||runtime.current.inputPageId!==pageId||runtime.current.shownId!==shownId||runtime.current.pageStamp!==pageStamp||runtime.current.assetStamp!==assetStamp||runtime.current.api!==media.api){runtime.current={epoch:runtime.current.epoch+1,paper,revision:paper.revision,lineage:paper.collaboration?.lineage,ownerKey,inputPageId:pageId,shownId,pageStamp,assetStamp,api:media.api};}
 const epoch=runtime.current.epoch;
 if(pendingNavigation.current===shownId)pendingNavigation.current=null;
 // Opacity also hides descendants that explicitly set visibility:visible (PDF canvas).
 const hidePage=()=>{if(content.current)content.current.style.opacity='0';};
 const sessionCurrent=()=>{
  const initial=session.current,value=latest.current;
  if(!mounted.current||initial.closed||initial.revoked)return false;
  let valid=false;
  try{valid=initial.ownerKey===value.ownerKey&&initial.noteId===value.paper.noteId&&initial.accountId===value.media.accountId&&initial.spaceId===value.media.spaceId&&initial.api===value.media.api&&value.current();}catch{valid=false;}
  if(!valid){initial.revoked=true;runtime.current.epoch++;hidePage();}
  return valid;
 };
 // Keep this callback stable while only viewport size or local status changes.
 const revision=paper.revision,lineage=paper.collaboration?.lineage;
 const snapshot=useMemo(()=>({page:page?structuredClone(page):undefined,assets:paper.assets.map(asset=>({...asset}))}),[epoch]);
 const pageCurrent=useMemo(()=>()=>sessionCurrent()&&runtime.current.epoch===epoch&&runtime.current.paper===paper&&latest.current.paper===paper&&latest.current.paper.revision===revision&&latest.current.paper.collaboration?.lineage===lineage&&runtime.current.shownId===shownId&&runtime.current.pageStamp===pageStamp&&!!page&&samePageData(snapshot.page,latest.current.paper.pages.find(value=>value.id===shownId))&&latest.current.paper.assets.length===snapshot.assets.length&&snapshot.assets.every((expected,index)=>{const value=latest.current.paper.assets[index];return !!value&&expected.id===value.id&&expected.name===value.name&&expected.mediaType===value.mediaType&&expected.size===value.size&&expected.serverId===value.serverId;}),[epoch]);
 const pageCurrentRef=useRef(pageCurrent);pageCurrentRef.current=pageCurrent;
 const live=pageCurrent(),objects=useMemo(()=>page?paperObjectsOnPage(paper,page.id):[],[paper,page]);
 let fit:ReturnType<typeof paperPresentationFit>|null=null;
 if(page&&bounds.width>0&&bounds.height>0){try{fit=paperPresentationFit(page,bounds);}catch{fit=null;}}
 const index=paper.pages.findIndex(value=>value.id===shownId);
 const close=()=>{
  // A retained callback from an earlier page or owner cannot close a newer session.
  if(!mounted.current||session.current.closed||runtime.current.epoch!==epoch)return;sessionCurrent();
  session.current.closed=true;session.current.revoked=true;hidePage();setUnavailable(true);
  const target=audience.current;
  if(target&&target.ownerDocument.fullscreenElement===target)void target.ownerDocument.exitFullscreen?.().catch(()=>{});
  latest.current.onClose();
 };
 const closeRef=useRef(close);closeRef.current=close;
 const navigate=(direction:1|-1)=>{
  if(!pageCurrent())return;const next=paper.pages[index+direction];if(!next)return;
  hidePage();pendingNavigation.current=next.id;runtime.current.epoch++;setSelection({origin:pageId,pageId:next.id});setNotice('');
 };
 const toggleFullScreen=async()=>{
  const target=audience.current;if(!target||!pageCurrent())return;
  try{
   if(target.ownerDocument.fullscreenElement===target){await target.ownerDocument.exitFullscreen();return;}
   if(typeof target.requestFullscreen!=='function'){setNotice('Plein écran indisponible. La présentation reste affichée.');return;}
   await target.requestFullscreen();
   if(!pageCurrent()&&target.ownerDocument.fullscreenElement===target)await target.ownerDocument.exitFullscreen();
  }catch{if(pageCurrent())setNotice('Plein écran indisponible. La présentation reste affichée.');}
 };

 useLayoutEffect(()=>{
  const target=dialog.current,host=viewport.current;if(!target||!host)return;
  mounted.current=true;const ownerDocument=target.ownerDocument,previousFocus=ownerDocument.activeElement as HTMLElement|null;
  const siblings=new Map<HTMLElement,{inert:boolean;hidden:string|null;visibility:string;priority:string}>();
  const conceal=(element:HTMLElement)=>{
   if(element===target||siblings.has(element)||['SCRIPT','STYLE','LINK','META'].includes(element.tagName))return;
   siblings.set(element,{inert:element.inert,hidden:element.getAttribute('aria-hidden'),visibility:element.style.getPropertyValue('visibility'),priority:element.style.getPropertyPriority('visibility')});
   element.inert=true;element.setAttribute('aria-hidden','true');element.style.setProperty('visibility','hidden','important');
  };
  for(const child of ownerDocument.body.children)if(child instanceof HTMLElement)conceal(child);
  const siblingsObserver=typeof MutationObserver==='undefined'?undefined:new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node instanceof HTMLElement)conceal(node);});
  siblingsObserver?.observe(ownerDocument.body,{childList:true});
  try{if(typeof target.showModal==='function')target.showModal();else target.setAttribute('open','');}catch{target.setAttribute('open','');}
  if(pageCurrentRef.current()&&content.current)content.current.style.opacity='1';
  exitControl.current?.focus({preventScroll:true});
  const closed=()=>closeRef.current();target.addEventListener('close',closed);
  const fullScreenTarget=audience.current;
  const changedFullScreen=()=>{if(mounted.current)setFullScreen(ownerDocument.fullscreenElement===fullScreenTarget);};ownerDocument.addEventListener('fullscreenchange',changedFullScreen);
  let sizeFrame=0,leaseFrame=0,stopped=false;
  const measure=()=>{
   sizeFrame=0;if(stopped)return;const style=getComputedStyle(host),width=host.clientWidth-(parseFloat(style.paddingLeft)||0)-(parseFloat(style.paddingRight)||0),height=host.clientHeight-(parseFloat(style.paddingTop)||0)-(parseFloat(style.paddingBottom)||0);
   const next={width:Math.max(0,width),height:Math.max(0,height)};setBounds(old=>old.width===next.width&&old.height===next.height?old:next);
  };
  const schedule=()=>{if(!sizeFrame&&!stopped)sizeFrame=requestAnimationFrame(measure);};
  const resize=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(schedule);resize?.observe(host);ownerDocument.defaultView?.addEventListener('resize',schedule);measure();
  const watch=()=>{
   if(stopped)return;
   if(!sessionCurrent()||(!pendingNavigation.current&&!pageCurrentRef.current())){if(!session.current.revoked){session.current.revoked=true;runtime.current.epoch++;}hidePage();setUnavailable(true);return;}
   leaseFrame=requestAnimationFrame(watch);
  };leaseFrame=requestAnimationFrame(watch);
  return()=>{
   stopped=true;mounted.current=false;hidePage();cancelAnimationFrame(sizeFrame);cancelAnimationFrame(leaseFrame);resize?.disconnect();siblingsObserver?.disconnect();ownerDocument.defaultView?.removeEventListener('resize',schedule);ownerDocument.removeEventListener('fullscreenchange',changedFullScreen);target.removeEventListener('close',closed);
   if(ownerDocument.fullscreenElement===fullScreenTarget)void ownerDocument.exitFullscreen?.().catch(()=>{});
   try{if(target.open)target.close();}catch{target.removeAttribute('open');}
   for(const [element,old] of siblings){element.inert=old.inert;if(element.getAttribute('aria-hidden')==='true'){if(old.hidden===null)element.removeAttribute('aria-hidden');else element.setAttribute('aria-hidden',old.hidden);}if(element.style.getPropertyValue('visibility')==='hidden'&&element.style.getPropertyPriority('visibility')==='important'){if(old.visibility)element.style.setProperty('visibility',old.visibility,old.priority);else element.style.removeProperty('visibility');}}
   const initial=session.current,value=latest.current;
   let returnFocus=false;try{returnFocus=initial.ownerKey===value.ownerKey&&initial.noteId===value.paper.noteId&&initial.accountId===value.media.accountId&&initial.spaceId===value.media.spaceId&&initial.api===value.media.api&&(value.focusCurrent??value.current)();}catch{}
   if(returnFocus&&previousFocus?.isConnected&&!ownerDocument.querySelector('dialog[open]'))previousFocus.focus?.({preventScroll:true});
  };
 },[]);

 if(typeof globalThis.document==='undefined')return null;
 const pixelWidth=fit?Math.max(1,Math.ceil(fit.width*Math.min(2,globalThis.devicePixelRatio||1))):undefined;
 return createPortal(<dialog ref={dialog} className="paper-presentation" aria-labelledby={titleId} aria-modal="true" onCancel={event=>{event.preventDefault();close();}} onClick={event=>event.stopPropagation()} onPointerDown={event=>event.stopPropagation()} onPointerUp={event=>event.stopPropagation()} onKeyDown={event=>{
  event.stopPropagation();
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}
  if(event.key!=='Tab')return;const controls=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-presentation-control]:not(:disabled)')];if(!controls.length)return;event.preventDefault();const selected=controls.indexOf(event.currentTarget.ownerDocument.activeElement as HTMLButtonElement),next=selected<0?(event.shiftKey?controls.length-1:0):(selected+(event.shiftKey?-1:1)+controls.length)%controls.length;controls[next].focus();
 }}>
  <div ref={audience} className="paper-presentation-surface"><header className="paper-presentation-controls"><h2 id={titleId} className="paper-presentation-sr">Présentation de la page</h2><nav aria-label="Pages de la présentation"><button type="button" data-presentation-control disabled={!live||index<=0} onClick={()=>navigate(-1)} aria-label="Page précédente">←</button><span aria-live="polite">{live&&index>=0?`Page ${index+1} sur ${paper.pages.length}`:'Présentation fermée'}</span><button type="button" data-presentation-control disabled={!live||index<0||index>=paper.pages.length-1} onClick={()=>navigate(1)} aria-label="Page suivante">→</button></nav><div><button type="button" data-presentation-control disabled={!live} onClick={()=>void toggleFullScreen()} aria-pressed={fullScreen}>{fullScreen?'Quitter le plein écran':'Plein écran'}</button><button ref={exitControl} type="button" data-presentation-control className="paper-presentation-exit" onClick={close}>Sortir</button></div></header>
  <div ref={viewport} className="paper-presentation-viewport">
   {!unavailable&&live&&page&&fit?<div key={epoch} ref={content} className="paper-presentation-fit" style={{width:fit.width,height:fit.height,opacity:1}}><div className="paper-page paper-presentation-page" role="region" aria-label={`Page ${index+1} de la présentation`} style={{width:page.width,height:page.height,backgroundColor:page.color,transform:`scale(${fit.scale})`}} onClickCapture={event=>{event.preventDefault();event.stopPropagation();}}>
    <PaperBackground page={page}/>
    {page.pdf&&paper.assets.find(asset=>asset.id===page.pdf!.assetId)&&<Suspense fallback={<p className="paper-presentation-media-status">Ouverture du PDF…</p>}><PaperPdfPage page={page} asset={paper.assets.find(asset=>asset.id===page.pdf!.assetId)!} document={paper} media={media} current={pageCurrent} pixelWidth={pixelWidth}/></Suspense>}
    {objects.map(object=><div key={object.id} className={`paper-object paper-${object.kind} paper-presentation-object`} style={{left:object.x,top:object.y,width:object.width,minHeight:object.height,...(object.kind!=='text'?{height:object.height}:{}),color:object.kind==='text'?object.color:undefined,zIndex:object.z+1,transform:paperObjectCssTransform(object),transformOrigin:`${object.width/2}px ${object.height/2}px`,background:object.kind==='sticky'?object.color:undefined}}>{object.kind==='text'?<PaperTextFlowView object={object} document={paper} media={media} pageId={page.id} current={pageCurrent}/>:<PaperObjectVisual object={object} document={paper} media={media} current={pageCurrent}/>}</div>)}
    <PaperMeasurementLabels document={paper} pageId={page.id} current={pageCurrent}/>
   </div></div>:<p className="paper-presentation-empty" role="status">{unavailable||!live?'La présentation de cette note est fermée.':page?'Préparation de la page…':'Cette page n’est plus disponible.'}</p>}
  </div>
  <p className="paper-presentation-notice" role="status">{notice}</p></div>
 </dialog>,globalThis.document.body);
}
