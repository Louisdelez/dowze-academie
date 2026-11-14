import {lazy,Suspense,useEffect,useMemo,useRef,useState} from 'react';
import {PaperBackground} from './PaperBackground';
import {PaperMeasurementLabels} from './PaperMeasurementLabels';
import {PaperObjectVisual} from './PaperObjectVisual';
import {PaperTextFlowView} from './PaperTextFlowView';
import {paperObjectsOnPage} from '../lib/paperTextFlow';
import {paperObjectCssTransform} from '../lib/paperInkStyles';
import type {PaperDocument,PaperPage} from '../lib/notebookDocument';
import type {NotebookMediaScope} from './NotebookEditor';
const PaperPdfPage=lazy(()=>import('./PaperPdfPage').then(module=>({default:module.PaperPdfPage})));
/** Same page geometry and content as the reader; only near-visible previews allocate renderers. */
export function PaperPagePreview({document,page,media,current,requireIntersection=false,rootMargin='180px'}:{document:PaperDocument;page:PaperPage;media:NotebookMediaScope;current?:()=>boolean;requireIntersection?:boolean;rootMargin?:string}){
 const root=useRef<HTMLDivElement>(null),[visible,setVisible]=useState(false);
 useEffect(()=>{const target=root.current;if(!target)return;if(typeof IntersectionObserver==='undefined'){setVisible(!requireIntersection);return;}const observer=new IntersectionObserver(entries=>setVisible(entries.some(entry=>entry.isIntersecting)),{rootMargin});observer.observe(target);return()=>observer.disconnect();},[page.id,requireIntersection,rootMargin]);
 const active=visible&&(current?.()??true),objects=useMemo(()=>active?paperObjectsOnPage(document,page.id):[],[active,document,page.id]);
 const scale=Math.min(80/page.width,116/page.height),width=page.width*scale,height=page.height*scale,pdf=page.pdf?document.assets.find(a=>a.id===page.pdf!.assetId):undefined;
 return <div ref={root} className="paper-thumbnail-stage" style={{width,height}} aria-hidden="true" inert data-preview-page={page.id} data-preview-rendered={active?'true':'false'}>
  <div className="paper-page paper-thumbnail-content" style={{width:page.width,height:page.height,backgroundColor:page.color,transform:`scale(${scale})`}}>
   {active&&<><PaperBackground page={page}/>{pdf&&<Suspense fallback={null}><PaperPdfPage page={page} asset={pdf} media={media} document={current?document:undefined} current={current} pixelWidth={160}/></Suspense>}
   {objects.map(object=><div key={object.id} className={`paper-object paper-${object.kind}`} data-preview-object={object.id} style={{left:object.x,top:object.y,width:object.width,height:object.height,transform:paperObjectCssTransform(object),transformOrigin:`${object.width/2}px ${object.height/2}px`,zIndex:object.z,background:object.kind==='sticky'?object.color:undefined,overflow:object.kind==='text'?'hidden':undefined}}>
    {object.kind==='text'?<PaperTextFlowView object={object} document={document} media={media} pageId={page.id} current={current}/>:<PaperObjectVisual object={object} document={document} media={media} current={current}/>}</div>)}
   <PaperMeasurementLabels document={document} pageId={page.id} current={current}/>
   </>}
  </div>
 </div>;
}
