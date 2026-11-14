import {useLayoutEffect,useMemo,type ReactNode,type PointerEvent as ReactPointerEvent} from 'react';
import type {PaperDocument,PaperObject,PaperPage} from '../lib/notebookDocument';
import type {PaperInkIntent} from '../lib/paperInkInput';
import {paperObjectsOnPage} from '../lib/paperTextFlow';
import {paperObjectSvgTransform} from '../lib/paperInkStyles';
import {inkOutline} from '../lib/paperGeometry';
import type {NotebookMediaScope} from './NotebookEditor';
import {PaperPageContent,type PaperPageContentProps} from './PaperPageContent';
import {PaperInkPreview,type PaperInkPreviewStyle} from './PaperInkPreview';
import {usePaperPageInkController,type PaperPageInkController,type PaperPageInkControllerOptions,type PaperPageInkSubmission} from '../hooks/usePaperPageInkController';
import type {PaperStrokeCorrectionOptions} from '../lib/paperDrawingGuide';
import './paper-editable-page-host.css';

export interface PaperEditablePageHostProps {
 document:PaperDocument;page:PaperPage;media:NotebookMediaScope;ownerKey:string;generation:string|number;
 /** Expensive readonly mirrors are optional; the lightweight SVG is always
  * present so a placeholder can synchronously accept its first pen sample. */
 mountedContent:boolean;pixelWidth:number;writable:boolean;current:()=>boolean;
 readerCurrent:()=>boolean;hiddenTextObjectIds?:readonly string[];intent:PaperInkIntent|null;style:PaperInkPreviewStyle;
 wholeEraser:boolean;fingerInk:boolean;correction?:PaperStrokeCorrectionOptions;
 pinPage:PaperPageInkControllerOptions['pinPage'];canBegin?:()=>boolean;
 onAccepted?:PaperPageInkControllerOptions['onAccepted'];onStroke:PaperPageInkControllerOptions['onStroke'];
 onActivity?:PaperPageInkControllerOptions['onActivity'];onSettled?:PaperPageInkControllerOptions['onSettled'];
 /** Captured interruption transport only. Await durable old-owner recovery/discard before
  * releasing the contact; rejection leaves it blocked and retryable through the controller. */
 onCancelled?:PaperPageInkControllerOptions['onCancelled'];onNotice?:(message:string)=>void;
 onCheckpoint?:PaperPageInkControllerOptions['onCheckpoint'];
 onCheckpointChunk?:PaperPageInkControllerOptions['onCheckpointChunk'];
 onController?:(controller:PaperPageInkController|null)=>void;
 onActivateText?:(objectId:string,pageId:string,current:()=>boolean)=>void;
 onBlankText?:(pageId:string,point:{x:number;y:number},current:()=>boolean)=>void;
 onObjectContact?:(objectId:string|undefined,submission:PaperPageInkSubmission,event:ReactPointerEvent<SVGSVGElement>)=>void;
 onPageFocus?:()=>void;
 textInteractionDisabled?:boolean;
 onPageContact?:(point:{x:number;y:number})=>boolean;
 selected?:readonly string[];pdfOptions?:PaperPageContentProps['pdfOptions'];onAudio?:PaperPageContentProps['onAudio'];
 renderOverlay?:(controller:PaperPageInkController)=>ReactNode;
}
/** Must be keyed by viewport owner/API/generation incarnation. Canonical PM
 * writers live outside this frame, so virtualizing readers never creates a new
 * editor. Parent owns global palm/pinch arbitration and validates every commit. */
export function PaperEditablePageHost(props:PaperEditablePageHostProps){
 const objects=useMemo(()=>paperObjectsOnPage(props.document,props.page.id),[props.document,props.page.id]);
 const controller=usePaperPageInkController({pageId:props.page.id,page:props.page,ownerKey:props.ownerKey,generation:props.generation,api:props.media.api,writable:props.writable,current:props.current,intent:props.intent,style:props.style,wholeEraser:props.wholeEraser,fingerInk:props.fingerInk,correction:props.correction,pinPage:props.pinPage,canBegin:props.canBegin,onAccepted:(submission,event)=>{
  const target=(event.target as Element).closest?.('[data-object]')?.getAttribute('data-object')??undefined;
  props.onObjectContact?.(target,submission,event);
  if(submission.current())props.onAccepted?.(submission,event);
  },onStroke:props.onStroke,onActivity:props.onActivity,onSettled:props.onSettled,onCancelled:props.onCancelled,onCheckpoint:props.onCheckpoint,onCheckpointChunk:props.onCheckpointChunk,onNotice:props.onNotice});
 useLayoutEffect(()=>{props.onController?.(controller);return()=>props.onController?.(null);},[controller,props.onController]);
 const textContact=(event:ReactPointerEvent<HTMLDivElement>)=>{
  if(props.intent!==null||props.textInteractionDisabled||!props.writable||!props.current()||event.button!==0)return;
  const target=event.target as Element;
  if(target.closest('button,input,textarea,select,[contenteditable="true"],a'))return;
  const id=target.closest('[data-object]')?.getAttribute('data-object'),object=id?objects.find(object=>object.id===id):undefined;
  if(object){if((object.kind==='text'||object.kind==='sticky')&&!object.locked)props.onActivateText?.(object.id,props.page.id,props.current);return;}
  // A touch on empty paper scrolls the page; it must not create a text zone.
  if(event.pointerType==='touch')return;
  const svg=controller.svgRef.current;if(!svg)return;const rect=svg.getBoundingClientRect();if(rect.width<=0||rect.height<=0)return;
  let x=(event.clientX-rect.left)/rect.width*props.page.width,y=(event.clientY-rect.top)/rect.height*props.page.height;
  try{const inverse=svg.getScreenCTM()?.inverse();if(inverse){x=inverse.a*event.clientX+inverse.c*event.clientY+inverse.e;y=inverse.b*event.clientX+inverse.d*event.clientY+inverse.f;}}catch{}
  if(Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&y>=0&&x<=props.page.width&&y<=props.page.height&&props.current())props.onBlankText?.(props.page.id,{x,y},props.current);
 };
 const pageContact=(event:ReactPointerEvent<HTMLDivElement>)=>{
  if(!props.onPageContact||event.button!==0||!props.writable||!props.current()||(event.target as Element).closest('button,input,textarea,select,[contenteditable="true"],a'))return;
  const svg=controller.svgRef.current;if(!svg)return;const box=svg.getBoundingClientRect();if(box.width<=0||box.height<=0)return;
  let x=(event.clientX-box.left)/box.width*props.page.width,y=(event.clientY-box.top)/box.height*props.page.height;
  try{const inverse=svg.getScreenCTM()?.inverse();if(inverse){x=inverse.a*event.clientX+inverse.c*event.clientY+inverse.e;y=inverse.b*event.clientX+inverse.d*event.clientY+inverse.f;}}catch{}
  if(Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&y>=0&&x<=props.page.width&&y<=props.page.height&&props.current()&&props.onPageContact({x,y})){event.preventDefault();event.stopPropagation();}
 };
 return <div className="paper-editable-page-host" data-editable-page={props.page.id} data-paper-command-surface="true" role="group" aria-label="Page de la note — commandes" style={{width:props.page.width,height:props.page.height,backgroundColor:props.page.color}} onPointerDownCapture={pageContact} onPointerDown={textContact}>
  {props.mountedContent?<div className="paper-editable-page-reader"><PaperPageContent hiddenTextObjectIds={props.hiddenTextObjectIds} document={props.document} page={props.page} media={props.media} current={props.readerCurrent} pixelWidth={props.pixelWidth} pdfOptions={props.pdfOptions} onAudio={props.onAudio} onNotice={message=>{if(props.readerCurrent())props.onNotice?.(message);}}/></div>:<div className="paper-editable-page-placeholder" aria-hidden="true"/>}
  <svg key="page-input" ref={controller.svgRef} tabIndex={0} onFocus={()=>{if(props.current())props.onPageFocus?.();}} className="paper-ink paper-editable-page-input" data-paper-command-surface="true" viewBox={`0 0 ${props.page.width} ${props.page.height}`} style={{pointerEvents:props.intent===null?'none':'auto',touchAction:props.intent===null?'pan-x pan-y pinch-zoom':'none'}} {...controller.handlers} aria-label="Page de dessin">
   {props.mountedContent&&objects.map(object=><ObjectHit key={object.id} object={object} selected={props.selected?.includes(object.id)===true} selectable={props.intent==='select'}/>)}
   {props.renderOverlay?.(controller)}
   <PaperInkPreview ref={controller.previewRef}/>
  </svg>
 </div>;
}
function ObjectHit({object,selected,selectable}:{object:PaperObject;selected:boolean;selectable:boolean}){
 return <g transform={paperObjectSvgTransform(object,object.x,object.y)} data-object={object.id}>
  {object.kind==='ink'?<path d={inkOutline(object.points??[],object.strokeWidth??3,object.pen==='highlighter')} fill="transparent"/>:object.kind==='shape'||selectable?<rect width={object.width} height={object.height} fill="transparent"/>:null}
  {selected&&selectable&&<rect width={object.width} height={object.height} fill="none" stroke="#4461dc" strokeWidth="1.5" strokeDasharray="6 4"/>}
 </g>;
}
