import {lazy,Suspense,useMemo,type ComponentProps} from 'react';
import type {PaperDocument,PaperPage} from '../lib/notebookDocument';
import type {NotebookMediaScope} from './NotebookEditor';
import {paperObjectsOnPage} from '../lib/paperTextFlow';
import {paperObjectCssTransform} from '../lib/paperInkStyles';
import {PaperBackground} from './PaperBackground';
import {PaperObjectVisual} from './PaperObjectVisual';
import {PaperTextFlowView} from './PaperTextFlowView';
import {PaperMeasurementLabels} from './PaperMeasurementLabels';
import {Volume2} from 'lucide-react';
import './paper-notebook.css';

const PaperPdfPage=lazy(()=>import('./PaperPdfPage').then(module=>({default:module.PaperPdfPage})));
export interface PaperPageContentProps {
 document:PaperDocument;page:PaperPage;media:NotebookMediaScope;current:()=>boolean;
 pixelWidth:number;onNotice:(message:string)=>void;
 /** Current ready canonical projection only; reader geometry and audio stay available. */
 hiddenTextObjectIds?:readonly string[];
 pdfOptions?:Pick<ComponentProps<typeof PaperPdfPage>,'linksEnabled'|'textSelectionEnabled'|'onSelectionChange'|'onHighlight'|'onNavigate'>;
 onAudio?:(anchor:{sessionId:string;time:number})=>void;
}
/** Shared page readers. No canonical layout writer or editor is installed here.
 * A live editable frame supplies its separate input controller and canonical
 * text host; continuation text remains a mirror of its original source object. */
export function PaperPageContent({document,page,media,current,pixelWidth,onNotice,pdfOptions,onAudio,hiddenTextObjectIds}:PaperPageContentProps){
 const objects=useMemo(()=>paperObjectsOnPage(document,page.id),[document,page.id]),asset=document.assets.find(asset=>asset.id===page.pdf?.assetId);
 if(!current())return null;
 return <div className="paper-page paper-shared-page-content paper-continuous-page-content" style={{width:page.width,height:page.height,backgroundColor:page.color,position:'relative',transform:'none',transformOrigin:'0 0'}}>
  {!page.pdf&&<PaperBackground page={page}/>}
  {page.pdf&&(asset?<Suspense fallback={<p role="status">Ouverture du PDF…</p>}><PaperPdfPage {...pdfOptions} page={page} asset={asset} document={document} media={media} current={current} pixelWidth={pixelWidth} onError={onNotice}/></Suspense>:<p role="status">Le PDF original est introuvable.</p>)}
  {objects.map(object=>{const covered=(object.kind==='text'||object.kind==='sticky')&&hiddenTextObjectIds?.includes(object.id)===true;return <div key={object.id} data-object={object.id} className={`paper-object paper-${object.kind} ${object.kind==='ink'||object.kind==='shape'?'paper-vector':''}`} style={{left:object.x,top:object.y,width:object.width,minHeight:object.height,color:object.kind==='text'?object.color:undefined,...(object.kind!=='text'?{height:object.height}:{}),zIndex:object.z+1,transform:paperObjectCssTransform(object),transformOrigin:`${object.width/2}px ${object.height/2}px`,background:object.kind==='sticky'?object.color:undefined,visibility:covered?'hidden':undefined}}>{object.audioAnchor&&onAudio&&<button className="paper-audio-anchor" style={covered?{visibility:'visible'}:undefined} aria-label="Écouter ce passage" onClick={event=>{event.stopPropagation();if(current()&&object.audioAnchor)onAudio(object.audioAnchor);}}><Volume2/></button>}{object.kind==='text'?<PaperTextFlowView object={object} document={document} pageId={page.id} media={media} current={current}/>:<PaperObjectVisual object={object} document={document} media={media} current={current} onError={onNotice}/>}</div>})}
  <PaperMeasurementLabels document={document} pageId={page.id} current={current}/>
 </div>;
}
