import {PaperTextFlowView} from './PaperTextFlowView';
import {paperObjectsOnPage} from '../lib/paperTextFlow';
import {paperObjectCssTransform} from '../lib/paperInkStyles';
import {PaperBackground} from './PaperBackground';
import {forwardRef,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {PaperObjectVisual} from './PaperObjectVisual';
import {PaperPdfPage} from './PaperPdfPage';
import {PaperMeasurementLabels} from './PaperMeasurementLabels';
import type {PaperDocument,PaperPage} from '../lib/notebookDocument';
import type {NotebookMediaScope} from './NotebookEditor';
import './paper-notebook.css';
/** The export uses the same readonly object renderer as the writing surface. */
interface ExportSource {serial:number;key:string;document:PaperDocument;page:PaperPage;snapshot:PaperPage;api:NotebookMediaScope['api'];parentCurrent:(()=>boolean)|undefined;valid:boolean}
/** Compare captured scalars without repeatedly serializing a possibly long PDF text. */
function samePage(page:PaperPage,snapshot:PaperPage){return page.id===snapshot.id&&page.width===snapshot.width&&page.height===snapshot.height&&page.pattern===snapshot.pattern&&page.color===snapshot.color&&page.bookmark===snapshot.bookmark&&page.rotation===snapshot.rotation&&page.template===snapshot.template&&page.spacing===snapshot.spacing&&page.flowRootId===snapshot.flowRootId&&!!page.pdf===!!snapshot.pdf&&page.pdf?.assetId===snapshot.pdf?.assetId&&page.pdf?.pageNumber===snapshot.pdf?.pageNumber&&page.pdf?.text===snapshot.pdf?.text&&!!page.calibration===!!snapshot.calibration&&page.calibration?.schema===snapshot.calibration?.schema&&page.calibration?.pageUnitsPerMm===snapshot.calibration?.pageUnitsPerMm;}
export const PaperExportPage=forwardRef<HTMLDivElement,{document:PaperDocument;page:PaperPage;media:NotebookMediaScope;annotationsOnly?:boolean;current?:()=>boolean;onReady:()=>void;onError:(message:string)=>void}>(({document,page,media,onReady,onError,current,annotationsOnly=false},ref)=>{
 const pageKey=JSON.stringify(page),sourceKey=JSON.stringify([media.accountId,media.spaceId,document.noteId,document.revision,pageKey,annotationsOnly]),source=useRef<ExportSource|null>(null),mounted=useRef(true),callbacks=useRef({current,onReady,onError});callbacks.current={current,onReady,onError};
 if(!source.current||source.current.key!==sourceKey||source.current.document!==document||source.current.page!==page||source.current.api!==media.api||source.current.parentCurrent!==current){if(source.current)source.current.valid=false;source.current={serial:(source.current?.serial??-1)+1,key:sourceKey,document,page,snapshot:{...page,...(page.pdf?{pdf:{...page.pdf}}:{}),...(page.calibration?{calibration:{...page.calibration}}:{})},api:media.api,parentCurrent:current,valid:true};}
 const lease=source.current,accountId=media.accountId,spaceId=media.spaceId,noteId=document.noteId,revision=document.revision,api=media.api;
 const viewCurrent=useMemo(()=>()=>{const live=lease.valid&&mounted.current&&source.current===lease&&media.accountId===accountId&&media.spaceId===spaceId&&media.api===api&&document.noteId===noteId&&document.revision===revision&&document.pages.find(candidate=>candidate.id===lease.snapshot.id)===lease.page&&samePage(lease.page,lease.snapshot)&&(callbacks.current.current?.()??true);if(!live)lease.valid=false;return live;},[lease]);
 const readerError=useMemo(()=>(message:string)=>{if(viewCurrent())callbacks.current.onError(message);},[viewCurrent]),[ready,setReady]=useState({serial:lease.serial,pdfReady:!page.pdf||annotationsOnly}),pdfReady=ready.serial===lease.serial?ready.pdfReady:!page.pdf||annotationsOnly,asset=document.assets.find(asset=>asset.id===page.pdf?.assetId);
 useLayoutEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{if(!viewCurrent())return;if(page.pdf&&!annotationsOnly&&!asset){readerError('Le PDF original est introuvable.');return;}if(pdfReady)callbacks.current.onReady();},[lease,pdfReady,viewCurrent,readerError,asset,annotationsOnly]);
 const objects=paperObjectsOnPage(document,page.id);if(!viewCurrent())return null;
 return <div ref={ref} className="paper-page paper-export-page" style={{width:page.width,height:page.height,backgroundColor:annotationsOnly?'transparent':page.color,transform:'none'}}>
 {!page.pdf&&!annotationsOnly&&<PaperBackground page={page}/>}
 {page.pdf&&!annotationsOnly&&asset&&<PaperPdfPage key={lease.serial} page={page} asset={asset} document={document} media={media} current={viewCurrent} onReady={()=>{if(viewCurrent())setReady({serial:lease.serial,pdfReady:true});}} onError={readerError}/>}
 {objects.map(o=><div key={`${lease.serial}|${o.id}`} data-object={o.id} className={`paper-object paper-${o.kind}`} style={{left:o.x,top:o.y,width:o.width,minHeight:o.height,color:o.kind==='text'?o.color:undefined,...(o.kind==='image'||o.kind==='shape'||o.kind==='ink'?{height:o.height}:{}),zIndex:o.z+1,transform:paperObjectCssTransform(o),transformOrigin:`${o.width/2}px ${o.height/2}px`,background:o.kind==='sticky'?o.color:undefined}}>{o.kind==='text'?<PaperTextFlowView object={o} document={document} media={media} pageId={page.id} current={viewCurrent}/>:<PaperObjectVisual object={o} document={document} media={media} current={viewCurrent} onError={readerError}/>}</div>)}
 <PaperMeasurementLabels document={document} pageId={page.id} current={viewCurrent}/>
 </div>;
});
