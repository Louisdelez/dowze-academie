import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import type {PaperDocument,PaperObject,PaperPage} from '../lib/notebookDocument';
import type {NotebookMediaScope} from './NotebookEditor';
import {PaperTextFlowView} from './PaperTextFlowView';
import {PaperPageContent} from './PaperPageContent';
import './paper-mobile-reading.css';

/** One canonical rich passage per source object, never one duplicate per flow
 * continuation page. Sorting touches only new buckets, not canonical arrays. */
export function paperMobileReadingSections(document:PaperDocument){
 const buckets=new Map(document.pages.map(page=>[page.id,[] as PaperObject[]]));
 for(const object of document.objects)if(object.kind==='text'||object.kind==='sticky')buckets.get(object.pageId)?.push(object);
 return document.pages.map(page=>({page,objects:buckets.get(page.id)!.sort((a,b)=>a.y-b.y||a.x-b.x||a.z-b.z||a.id.localeCompare(b.id))}));
}
function OriginalPage({document,page,media,current}:{document:PaperDocument;page:PaperPage;media:NotebookMediaScope;current:()=>boolean}){
 const root=useRef<HTMLDivElement>(null),[width,setWidth]=useState(0),[notice,setNotice]=useState(''),latest=useRef(current);latest.current=current;
 useLayoutEffect(()=>{const node=root.current;if(!node)return;let stopped=false;const measure=()=>{if(stopped||!latest.current())return;const value=node.clientWidth;if(Number.isFinite(value)&&value>=0)setWidth(old=>old===value?old:value);};
  const resize=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);resize?.observe(node);window.addEventListener('resize',measure);measure();return()=>{stopped=true;resize?.disconnect();window.removeEventListener('resize',measure);};
 },[]);
 const scale=width>0?Math.min(1,width/page.width):0;
 return <div ref={root} className="paper-mobile-original" data-mobile-original-page={page.id}>
  {scale>0&&current()?<div className="paper-mobile-original-frame" aria-hidden="true" inert style={{width:page.width*scale,height:page.height*scale}}><div className="paper-page" style={{width:page.width,height:page.height,backgroundColor:page.color,transform:`scale(${scale})`}}><PaperPageContent document={document} page={page} media={media} current={current} pixelWidth={width} onNotice={message=>{if(current())setNotice(message);}}/></div></div>:<p role="status">Ouverture de l’aperçu…</p>}
  {notice&&<p role="status">{notice}</p>}
 </div>;
}
interface Props {document:PaperDocument;media:NotebookMediaScope;current:()=>boolean;onReturn:()=>void;onPage:(pageId:string)=>void;onRetire:()=>void;onAudio:(anchor:{sessionId:string;time:number})=>void}
/** Read-only responsive projection. It owns no editor, writer, command, layout
 * callback, persistence or conversion; the original viewport stays mounted. */
export function PaperMobileReadView(props:Props){
 const latest=useRef(props);latest.current=props;const revoked=useRef(false),mounted=useRef(true),root=useRef<HTMLElement>(null),returnButton=useRef<HTMLButtonElement>(null);
 const [expanded,setExpanded]=useState<string|null>(null),[retired,setRetired]=useState(false);
 const current=()=>{if(revoked.current||!mounted.current)return false;let allowed=false;try{allowed=!document.hidden&&latest.current.current();}catch{}if(!allowed)revoked.current=true;return allowed;};
 const sections=useMemo(()=>paperMobileReadingSections(props.document),[props.document.pages,props.document.objects]);
 useEffect(()=>{mounted.current=true;let stopped=false;const inspect=()=>{if(stopped||current())return;stopped=true;setRetired(true);latest.current.onRetire();};const timer=setInterval(inspect,50);document.addEventListener('visibilitychange',inspect);return()=>{stopped=true;mounted.current=false;clearInterval(timer);document.removeEventListener('visibilitychange',inspect);};},[]);
 useLayoutEffect(()=>{
  if(retired||!current())return;
  const reader=root.current,note=reader?.closest<HTMLElement>('.paper-notebook'),ownWindow=reader?.ownerDocument.defaultView;
  if(!reader||!note||!ownWindow||reader.parentElement?.parentElement!==note)return;
  let ended=false,frame=0;
  // Escape closes the real portalled menu and returns focus to its summary.
  // In reading mode that temporary toolbar covers the reader header until
  // focus leaves it. Transfer only that exact owned close path, never a tab
  // into a closed menu or focus arriving from another note/panel.
  const focusAfterClose=(event:FocusEvent)=>{
   if(ended||!current())return;
   const summary=event.target,previous=event.relatedTarget;
   if(!(summary instanceof HTMLElement)||summary.tagName!=='SUMMARY'||!(previous instanceof Element))return;
   const details=summary.parentElement,panel=previous.closest<HTMLElement>('.paper-toolbox-popover'),controls=summary.getAttribute('aria-controls');
   if(!details?.matches('details.paper-tool-menu')||(details as HTMLDetailsElement).open||summary.closest('.paper-notebook')!==note||summary.closest('.paper-movable-toolbox')?.parentElement!==note||!controls||panel?.id!==controls||panel.parentElement!==note)return;
   if(frame)ownWindow.cancelAnimationFrame(frame);
   frame=ownWindow.requestAnimationFrame(()=>{
    frame=0;
    const button=returnButton.current;
    if(ended||!current()||root.current!==reader||!reader.isConnected||reader.parentElement?.parentElement!==note||reader.ownerDocument.activeElement!==summary||!summary.isConnected||(details as HTMLDetailsElement).open||summary.getAttribute('aria-controls')!==controls||panel.parentElement!==note||!button?.isConnected||!reader.contains(button)||button.disabled)return;
    button.focus({preventScroll:true});
   });
  };
  note.addEventListener('focusin',focusAfterClose);
  reader.focus({preventScroll:true});
  return()=>{ended=true;if(frame)ownWindow.cancelAnimationFrame(frame);note.removeEventListener('focusin',focusAfterClose);};
 },[retired]);
 if(retired||!current())return null;
 return <section ref={root} tabIndex={-1} className="paper-mobile-reading" aria-label="Lecture mobile de la note" data-mobile-reading="readonly">
  <header><h2>Lecture mobile</h2><button ref={returnButton} type="button" onClick={()=>{if(current())latest.current.onReturn();}}>Revenir à la page</button></header>
  <p className="paper-mobile-reading-help">Le texte s’adapte à la largeur de l’écran. Ouvrez une page pour retrouver sa mise en forme et la modifier.</p>
  {sections.map(({page,objects},index)=><article key={page.id} data-mobile-reading-page={page.id} aria-label={`Page ${index+1} en lecture mobile`}>
   <header><h3>Page {index+1}</h3><button type="button" aria-expanded={expanded===page.id} onClick={()=>{if(current())setExpanded(value=>value===page.id?null:page.id);}}>Aperçu de la page {index+1}</button><button type="button" onClick={()=>{if(current())latest.current.onPage(page.id);}}>Afficher la page {index+1}</button></header>
   {objects.map(object=><div key={object.id} className={`paper-mobile-reading-passage${object.kind==='sticky'?' is-sticky':''}`} data-mobile-reading-object={object.id} tabIndex={0} aria-label={`Texte de la page ${index+1}`} style={{color:object.kind==='text'?object.color:undefined,backgroundColor:object.kind==='sticky'?object.color:undefined}}>
    {object.textFlow&&object.textFlow.pageIds.length>1&&<p className="paper-mobile-flow-label">Passage continu · {object.textFlow.pageIds.length} pages</p>}
    <PaperTextFlowView object={object} document={props.document} media={props.media} pageId={object.pageId} continuous current={current}/>
    {object.audioAnchor&&<button type="button" onClick={()=>{if(current())latest.current.onAudio(object.audioAnchor!);}}>Écouter ce passage</button>}
   </div>)}
   {!objects.length&&<p className="paper-mobile-reading-help">Retrouvez cette page et ses éléments dans l’aperçu.</p>}
   {expanded===page.id&&<OriginalPage key={page.id} document={props.document} page={page} media={props.media} current={current}/>}
  </article>)}
 </section>;
}
