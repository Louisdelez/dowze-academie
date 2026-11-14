import {useLayoutEffect,useMemo,useRef,type PointerEvent as ReactPointerEvent,type RefObject} from 'react';
import {createPaperPageInputSession,type PaperPageInputGeometry,type PaperPageInputPin,type PaperPageInputReason,type PaperPageInputResult,type PaperPageInputView} from '../lib/paperPageInputSession';
import {createPaperStrokeCorrection,samePaperGuideContext,type PaperStrokeCorrectionOptions,type PaperStrokeCorrectionResult} from '../lib/paperDrawingGuide';
import {paperInkAuthoringIntent,PAPER_INK_POINT_RANGE_MAX,type PaperInkCancellation,type PaperInkContext,type PaperInkIntent,type PaperInkStroke,type PaperInkPointReader,type PaperInkPointRange} from '../lib/paperInkInput';
import type {PaperInkPreviewHandle,PaperInkPreviewStyle} from '../components/PaperInkPreview';

export interface PaperPageInkSource {
 readonly ownerKey:string;readonly generation:string|number;readonly api:object|null|undefined;
 readonly pageId:string;readonly token:object;readonly pointerId:number;readonly pointerType:PaperInkStroke['pointerType'];
}
export interface PaperPageInkActivity extends PaperPageInkSource {readonly phase:'capturing'|'settling'|'preserving'|'blocked'|'idle';readonly error?:unknown}
/** Immutable recovery transport. There is deliberately no canonical current()/writer grant. */
export interface PaperPageInkInterruption extends PaperPageInkSource {
 readonly stroke?:PaperInkStroke;readonly style:Readonly<PaperInkPreviewStyle>;readonly wholeEraser:boolean;
 readonly geometry:Readonly<PaperPageInputGeometry>;readonly cancellation:PaperInkCancellation;readonly admitted:boolean;
}
export interface PaperPageInkCheckpoint extends PaperPageInkSource {
 readonly stroke:PaperInkStroke;readonly style:Readonly<PaperInkPreviewStyle>;readonly wholeEraser:boolean;
 readonly geometry:Readonly<PaperPageInputGeometry>;
}
/** Incremental transport only; no canonical writer or next-owner callback. */
export interface PaperPageInkCheckpointChunk extends PaperPageInkSource,PaperInkPointRange {
 readonly intent:PaperInkIntent;readonly eraserButton:boolean;readonly context:Readonly<PaperInkContext>;
 readonly style:Readonly<PaperInkPreviewStyle>;readonly wholeEraser:boolean;readonly geometry:Readonly<PaperPageInputGeometry>;
}
export interface PaperPageInkCheckpointAcknowledgement {readonly confirmedCursor:number}
export interface PaperPageInkSubmission extends PaperPageInkSource {
 readonly stroke:PaperInkStroke;readonly style:Readonly<PaperInkPreviewStyle>;readonly wholeEraser:boolean;
 readonly geometry:Readonly<PaperPageInputGeometry>;
 readonly corrected?:PaperStrokeCorrectionResult;
 /** Strict captured page/owner/permission/tool guard. The parent must additionally prove
  * its canonical command baseline before and after any text flush or asynchronous work. */
 current:()=>boolean;
}
export interface PaperPageInkSettlement extends PaperPageInkSource {readonly accepted:boolean;readonly current:boolean;readonly error?:unknown;readonly cancellation?:PaperInkCancellation;readonly preserved?:boolean}
export interface PaperPageInkControllerOptions {
 pageId:string;page:PaperPageInputGeometry|null;ownerKey:string;generation:string|number;api:object|null|undefined;
 writable:boolean;intent:PaperInkIntent|null;style:PaperInkPreviewStyle;wholeEraser:boolean;fingerInk:boolean;
 /** View/page authority independent of document revision and toolbar selection. */
 current?:()=>boolean;
 correction?:PaperStrokeCorrectionOptions;
 /** Parent owns the global pen/palm/two-finger arbitration. This admission check only
  * refuses new captures, so a pending eraser need not revoke its own writable authority. */
 canBegin?:()=>boolean;
 pinPage:(pin:PaperPageInputPin)=>()=>void;
 /** Runs synchronously after this page has pinned, captured and stored its first sample.
  * Updating toolbar selection here must not call navigation, flush or change generation. */
 onAccepted?:(submission:PaperPageInkSubmission,event:ReactPointerEvent<SVGSVGElement>)=>void;
 onStroke:(submission:PaperPageInkSubmission)=>boolean|Promise<boolean>;
 /** Match the captured token before removing parent bookkeeping. These notifications
  * can finish after another view owns the toolbar; they never carry latest-view callbacks. */
 onActivity?:(activity:PaperPageInkActivity)=>void;
 onSettled?:(settlement:PaperPageInkSettlement)=>void;
 onCancelled?:(result:PaperPageInputResult,source:PaperPageInkSource,interruption:PaperPageInkInterruption)=>void|PromiseLike<void>;
 /** Optional durable-prefix consumer, one child at a time, at most once per250ms.
  * The callback owns confirmation; this transport never equates a RAM snapshot with persistence. */
 onCheckpoint?:(checkpoint:PaperPageInkCheckpoint)=>void|PromiseLike<void>;
 /** Preferred over onCheckpoint when both exist. Exact durable acknowledgement,
  * one child at a time; terminal drain may issue further bounded chunks between yields. */
 onCheckpointChunk?:(checkpoint:PaperPageInkCheckpointChunk)=>PromiseLike<PaperPageInkCheckpointAcknowledgement>;
 onNotice?:(message:string)=>void;
}
export interface PaperPageInkController {
 svgRef:RefObject<SVGSVGElement|null>;previewRef:RefObject<PaperInkPreviewHandle|null>;
 handlers:{onPointerDown:(event:ReactPointerEvent<SVGSVGElement>)=>void;onPointerMove:(event:ReactPointerEvent<SVGSVGElement>)=>void;onPointerUp:(event:ReactPointerEvent<SVGSVGElement>)=>void;onPointerCancel:(event:ReactPointerEvent<SVGSVGElement>)=>void;onLostPointerCapture:(event:ReactPointerEvent<SVGSVGElement>)=>void};
 cancel:(reason?:PaperPageInputReason,cancellation?:PaperInkCancellation)=>PaperPageInputResult;syncAuthority:()=>PaperPageInputResult|null;syncSurface:()=>void;
 getState:()=>{pageId:string;phase:'disposed'|'capturing'|'finished'|'settling'|'preserving'|'blocked'|'idle';pinned:boolean;pointerId:number|undefined;pendingOperations:number;cancellationError?:unknown};
 whenSettled:()=>Promise<PaperPageInkSettlement|null>;
 /** Retries the exact captured recovery callback and buffer. Never revives canonical authority. */
 retryCancellation:()=>Promise<PaperPageInkSettlement|null>;
 acceptShape:()=>void;bypassCorrection:()=>void;
}
type Held={source:PaperPageInkSource;intent:PaperInkIntent;geometry:PaperPageInputGeometry;firstTime:number;view:PaperPageInputView;
 style:Readonly<PaperInkPreviewStyle>;wholeEraser:boolean;options?:PaperStrokeCorrectionOptions;
 callbacks:Pick<PaperPageInkControllerOptions,'onAccepted'|'onStroke'|'onActivity'|'onSettled'|'onCancelled'|'onCheckpoint'|'onCheckpointChunk'|'onNotice'>;
 phase:'capturing'|'settling'|'preserving'|'blocked';reported:boolean;revoked:boolean;timer?:{id:ReturnType<typeof setTimeout>;resolve:()=>void};
 interruption?:PaperPageInkInterruption;registered?:boolean;submissionPending?:boolean;
 checkpointTimer?:ReturnType<typeof setTimeout>;checkpointWork?:Promise<void>;
 pointReader?:PaperInkPointReader;checkpointCursor:number;checkpointFailed?:boolean;
 completion?:{resolve:(value:PaperPageInkSettlement)=>void;reject:(error:unknown)=>void}};
type LaserPreview={contact:Held;node:SVGSVGElement;preview:PaperInkPreviewHandle;timer?:ReturnType<typeof setTimeout>;frame:number};
const ignored=(reason:PaperPageInputReason):PaperPageInputResult=>({status:'ignored',accepted:false,added:0,reason});
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
export const PAPER_PAGE_INK_MAX_PENDING_OPERATIONS=1;
export const PAPER_PAGE_INK_CHECKPOINT_INTERVAL_MS=250;
const freezeStroke=(stroke:PaperInkStroke)=>{for(const point of stroke.points)Object.freeze(point);Object.freeze(stroke.points);Object.freeze(stroke.context.clientRect);if(stroke.context.clientToPage)Object.freeze(stroke.context.clientToPage);Object.freeze(stroke.context);return Object.freeze(stroke);};
const copyStyle=(style:PaperInkPreviewStyle):Readonly<PaperInkPreviewStyle>|null=>style&&typeof style.color==='string'&&style.color.length>0&&finite(style.width)&&style.width>0&&finite(style.opacity)&&style.opacity>=0&&style.opacity<=1&&(style.strokeStyle===undefined||['solid','dashed','dotted'].includes(style.strokeStyle))?Object.freeze({...style}):null;
const copyOptions=(options:PaperStrokeCorrectionOptions|undefined):PaperStrokeCorrectionOptions|undefined=>options?{guide:{...options.guide},hold:{...options.hold}}:undefined;

/** Page-local capture/preview only; no document hook, canonical write, gesture navigator or
 * hardware detection. Supply a stable SVG node/viewBox for this canonical page, place
 * PaperInkPreview inside it, and set touch-action before pointerdown. The viewport parent
 * must arbitrate palm/pinch globally, preserve page hosts through pins and register pending
 * settlements with the account-close barrier. Generation excludes toolbar page/revision.
 * Key this host by owner/generation/API incarnation, after draining or retaining its old
 * writers. Retained handler/method references relay latest options within one incarnation;
 * reusing its same connected SVG across different authorities is not supported. */
export function usePaperPageInkController(options:PaperPageInkControllerOptions):PaperPageInkController {
 const svgRef=useRef<SVGSVGElement|null>(null),previewRef=useRef<PaperInkPreviewHandle|null>(null),latest=useRef(options);latest.current=options;
 const activeRuntime=useRef<object|null>(null);
 const runtime=useMemo(()=>{
  let active=false,held:Held|null=null,laser:LaserPreview|null=null,visualEpoch=0,frame=0,surfaceFrame=0,pendingOperations=0,pending:Promise<PaperPageInkSettlement|null>=Promise.resolve(null);
  const pageId=options.pageId,token={},correction=createPaperStrokeCorrection(),own=()=>active&&activeRuntime.current===token;
  const parentCurrent=()=>{try{return latest.current.current?latest.current.current()===true:true;}catch{return false;}};
  const authority=()=>{const value=latest.current;return {ownershipKey:value.ownerKey,generation:value.generation,api:value.api,writable:own()&&parentCurrent()&&value.writable&&value.intent!==null,page:value.page?.id===pageId?value.page:null};};
  const sameOwner=(contact:Held)=>{const value=latest.current,page=value.page,source=contact.source;return own()&&parentCurrent()&&value.writable&&value.ownerKey===source.ownerKey&&value.generation===source.generation&&value.api===source.api&&page?.id===source.pageId&&page.width===contact.geometry.width&&page.height===contact.geometry.height&&page.rotation===contact.geometry.rotation&&(page.geometryKey??'')===(contact.geometry.geometryKey??'');};
  const live=(contact:Held)=>!contact.revoked&&sameOwner(contact)&&latest.current.intent===contact.intent;
  const stopFrame=()=>{if(frame){cancelAnimationFrame(frame);frame=0;}if(surfaceFrame){cancelAnimationFrame(surfaceFrame);surfaceFrame=0;}};
  const stopTimer=(contact:Held)=>{const timer=contact.timer;contact.timer=undefined;if(timer){clearTimeout(timer.id);timer.resolve();}};
  const stopCheckpoint=(contact:Held)=>{if(contact.checkpointTimer!==undefined){clearTimeout(contact.checkpointTimer);contact.checkpointTimer=undefined;}};
  const activity=(contact:Held,phase:PaperPageInkActivity['phase'],error?:unknown)=>{if(phase==='capturing')contact.reported=true;if(!contact.reported)return;try{contact.callbacks.onActivity?.({...contact.source,phase,...(error===undefined?{}:{error})});}catch{}};
  const pendingFor=(contact:Held)=>{
   if(!contact.registered){contact.registered=true;pendingOperations++;}
   pending=new Promise<PaperPageInkSettlement>((resolve,reject)=>{contact.completion={resolve,reject};});void pending.catch(()=>{});
  };
  const releaseContact=(contact:Held)=>{if(held===contact){held=null;clearVisual(contact);}if(contact.registered){contact.registered=false;pendingOperations--;}activity(contact,'idle');};
  const clearVisual=(contact:Held)=>{stopFrame();if(own())try{previewRef.current?.paint(null,contact.style);}catch{}};
  const clearLaser=(expected=laser)=>{
   if(!expected||laser!==expected)return;laser=null;if(expected.timer)clearTimeout(expected.timer);if(expected.frame)cancelAnimationFrame(expected.frame);
   // A retired timer may clear only the exact preview tree it owned, never a replacement.
   if(own()&&svgRef.current===expected.node&&previewRef.current===expected.preview)try{expected.preview.paint(null,expected.contact.style);}catch{}
  };
  const retainLaser=(contact:Held,stroke:PaperInkStroke)=>{
   // An idle observer can synchronously admit another contact. Never repaint
   // the completed laser over that new capture or clear its preview.
   if(held)return;
   clearLaser();const node=svgRef.current,preview=previewRef.current;if(!live(contact)||!node?.isConnected||!preview)return;
   const value:LaserPreview={contact,node,preview,frame:0};laser=value;
   // The page lease has settled and released its pin; only this bounded visual remains.
   try{if(laser===value&&live(contact))preview.paint(stroke,contact.style);}catch{clearLaser(value);return;}
   if(laser!==value||!live(contact)){clearLaser(value);return;}
   value.timer=setTimeout(()=>clearLaser(value),600);
   const inspect=()=>{if(laser!==value)return;value.frame=0;if(!live(contact)||!node.isConnected||svgRef.current!==node||previewRef.current!==preview){contact.revoked=true;clearLaser(value);return;}value.frame=requestAnimationFrame(inspect);};
   value.frame=requestAnimationFrame(inspect);
  };
  const session=createPaperPageInputSession({pageId,getAuthority:authority,pinPage:pin=>latest.current.pinPage(pin),onCancelled:result=>{
   const contact=held;if(!contact)return;contact.revoked=true;clearVisual(contact);correction.cancel();stopTimer(contact);stopCheckpoint(contact);
   if(!contact.interruption){
    const stroke=result.stroke;if(stroke)freezeStroke(stroke);
    contact.interruption=Object.freeze({...contact.source,stroke,style:contact.style,wholeEraser:contact.wholeEraser,geometry:Object.freeze({...contact.geometry}),cancellation:result.cancellation!,admitted:result.admitted===true});
   }
   if(!contact.callbacks.onCancelled&&contact.interruption.cancellation.disposition==='preserve-ink')throw Error('Le trait interrompu attend sa conservation dans son carnet d’origine.');
   const consume=()=>contact.callbacks.onCancelled?.(result,contact.source,contact.interruption!);
   // An in-flight prefix cannot arrive after a final discard/recovery receipt.
   if(contact.callbacks.onCheckpointChunk&&contact.pointReader&&paperInkAuthoringIntent(contact.pointReader.intent))return drainCheckpoint(contact).then(consume);
   return contact.checkpointWork?contact.checkpointWork.catch(()=>undefined).then(consume):consume();
  },onCancellationState:(result,phase,error)=>{
   const contact=held;if(!contact)return;
   if(phase==='preserving'){if(!contact.submissionPending)pendingFor(contact);contact.phase='preserving';activity(contact,'preserving');return;}
   if(phase==='blocked'){contact.phase='blocked';activity(contact,'blocked',error);if(!contact.submissionPending)contact.completion?.reject(error);if(sameOwner(contact))try{contact.callbacks.onNotice?.(String(error instanceof Error?error.message:error));}catch{}return;}
   if(contact.submissionPending){contact.phase='settling';return;}
   const value:PaperPageInkSettlement={...contact.source,accepted:false,current:false,cancellation:result.cancellation,preserved:result.cancellation?.disposition==='preserve-ink'};
   releaseContact(contact);contact.completion?.resolve(value);
  }});
  const startCheckpoint=(contact:Held):Promise<void>=>{
   if(contact.checkpointWork)return contact.checkpointWork;
   if(contact.checkpointFailed)return Promise.resolve();
   const chunkCallback=contact.callbacks.onCheckpointChunk,reader=contact.pointReader;
   let packet:PaperPageInkCheckpointChunk|undefined,snapshot:PaperPageInkCheckpoint|undefined;
   if(chunkCallback){
    if(!reader||!paperInkAuthoringIntent(reader.intent))return Promise.resolve();
    const range=reader.readPointRange(contact.checkpointCursor,PAPER_INK_POINT_RANGE_MAX);
    if(range&&range.to===range.from)return Promise.resolve();
    if(range)packet=Object.freeze({...contact.source,...range,intent:reader.intent,eraserButton:reader.eraserButton,context:reader.context,style:contact.style,wholeEraser:contact.wholeEraser,geometry:Object.freeze({...contact.geometry})});
   }else{
    const stroke=session.snapshot();if(!stroke||!paperInkAuthoringIntent(stroke.intent))return Promise.resolve();
    snapshot=Object.freeze({...contact.source,stroke:freezeStroke(stroke),style:contact.style,wholeEraser:contact.wholeEraser,geometry:Object.freeze({...contact.geometry})});
   }
    let resolve!:()=>void,reject!:(error:unknown)=>void;const task=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});contact.checkpointWork=task;
    void task.then(()=>{if(contact.checkpointWork===task)contact.checkpointWork=undefined;scheduleCheckpoint(contact);},()=>{
     if(contact.checkpointWork===task)contact.checkpointWork=undefined;contact.checkpointFailed=true;
     if(held===contact&&!contact.revoked&&(contact.phase==='capturing'||contact.phase==='settling'))session.cancel('save-failed');
    });
    try{
     if(chunkCallback){
      if(!packet)throw Error('Le préfixe du trait n’est plus disponible dans sa capture d’origine.');
      const sent=packet,value=chunkCallback(sent);
      if(!value||typeof value.then!=='function')throw Error('Le préfixe du trait attend une confirmation durable explicite.');
      Promise.resolve(value).then(ack=>{
       if(!ack||ack.confirmedCursor!==sent.to||contact.checkpointCursor!==sent.from)throw Error('La confirmation du préfixe ne correspond pas aux points envoyés.');
       contact.checkpointCursor=sent.to;
      }).then(resolve,reject);
     }else{const value=contact.callbacks.onCheckpoint!(snapshot!);if(value&&typeof value.then==='function')Promise.resolve(value).then(resolve,reject);else resolve();}
    }catch(error){reject(error);}
    return task;
  };
  const drainCheckpoint=async(contact:Held)=>{
   if(contact.checkpointWork)await contact.checkpointWork.catch(()=>undefined);
   const reader=contact.pointReader;
   if(!contact.callbacks.onCheckpointChunk||!reader||!paperInkAuthoringIntent(reader.intent)||contact.checkpointFailed)return;
   const total=reader.totalCapturedCount();
   if(total===null){contact.checkpointFailed=true;if(!contact.revoked)session.cancel('save-failed');return;}
   while(!contact.checkpointFailed&&contact.checkpointCursor<total){
    await startCheckpoint(contact).catch(()=>undefined);
    if(!contact.checkpointFailed&&contact.checkpointCursor<total)await new Promise<void>(resolve=>setTimeout(resolve,0));
   }
  };
  const scheduleCheckpoint=(contact:Held)=>{
   if((!contact.callbacks.onCheckpoint&&!contact.callbacks.onCheckpointChunk)||contact.checkpointFailed||contact.checkpointTimer!==undefined||contact.checkpointWork||held!==contact||contact.phase!=='capturing'||!live(contact))return;
   if(contact.pointReader&&!paperInkAuthoringIntent(contact.pointReader.intent))return;
   if(contact.callbacks.onCheckpointChunk&&!contact.pointReader)return;
   contact.checkpointTimer=setTimeout(()=>{
    contact.checkpointTimer=undefined;if(held!==contact||contact.phase!=='capturing'||!live(contact))return;
    void startCheckpoint(contact).then(()=>scheduleCheckpoint(contact),()=>{});
   },PAPER_PAGE_INK_CHECKPOINT_INTERVAL_MS);
  };
  const view=(node:SVGSVGElement|null):PaperPageInputView|null=>{
   if(!own()||!node||node!==svgRef.current||!node.isConnected)return null;const box=node.getBoundingClientRect();if(![box.left,box.top,box.width,box.height].every(finite)||box.width<=0||box.height<=0)return null;
   let clientToPage:PaperInkContext['clientToPage'];try{const inverse=node.getScreenCTM()?.inverse();if(inverse)clientToPage={a:inverse.a,b:inverse.b,c:inverse.c,d:inverse.d,e:inverse.e,f:inverse.f};}catch{}
   return {clientRect:{left:box.left,top:box.top,width:box.width,height:box.height},...(clientToPage?{clientToPage}:{})};
  };
  const context=(contact:Held,currentView:PaperPageInputView):PaperInkContext=>({ownershipKey:contact.source.ownerKey,generation:contact.source.generation,pageId:contact.source.pageId,pageWidth:contact.geometry.width,pageHeight:contact.geometry.height,pageRotation:contact.geometry.rotation,intent:contact.intent,...currentView});
  const syncSurface=()=>{if(surfaceFrame||!held||held.phase!=='capturing')return;surfaceFrame=requestAnimationFrame(()=>{
   surfaceFrame=0;const contact=held;if(!contact||contact.phase!=='capturing')return;const changed=session.syncAuthority();if(changed)return;if(!live(contact)){session.cancel('tool-changed');return;}
   const next=view(svgRef.current);if(!next||!samePaperGuideContext(context(contact,contact.view),context(contact,next)))session.cancel('geometry-changed');
  });};
  const paint=(contact:Held,stroke:PaperInkStroke,result?:PaperStrokeCorrectionResult)=>{if(held!==contact||!live(contact))return;try{previewRef.current?.paint(result?{...stroke,points:result.points}:stroke,contact.style);}catch{}};
  const repaint=()=>{if(frame||!held||held.phase!=='capturing')return;frame=requestAnimationFrame(()=>{
   frame=0;const contact=held;if(!contact||contact.phase!=='capturing')return;if(!live(contact)){session.cancel('tool-changed');return;}
   const currentView=view(svgRef.current),stroke=session.snapshot();if(!currentView||!stroke){session.cancel('geometry-changed');return;}
   const output=contact.options?correction.update(stroke,performance.now(),context(contact,currentView),contact.options):undefined;
   if(output?.cancelled){session.cancel('geometry-changed');return;}paint(contact,stroke,output);if(contact.options?.hold.enabled&&['pen','pencil','calligraphy','highlighter'].includes(stroke.intent))repaint();
  });};
  const submission=(contact:Held,stroke:PaperInkStroke,current:()=>boolean,corrected?:PaperStrokeCorrectionResult):PaperPageInkSubmission=>({...contact.source,stroke,style:contact.style,wholeEraser:contact.wholeEraser,geometry:Object.freeze({...contact.geometry}),current,...(corrected?{corrected}:{})});
  const begin=(event:ReactPointerEvent<SVGSVGElement>)=>{
   if(!own()||event.defaultPrevented)return ignored('disabled');if(pendingOperations>=PAPER_PAGE_INK_MAX_PENDING_OPERATIONS)return ignored('settling');visualEpoch++;clearLaser();const changed=session.syncAuthority();if(changed)return changed;const currentView=view(event.currentTarget);if(!currentView)return ignored('invalid-context');
   const value=latest.current;if(value.intent===null||!value.writable)return ignored('disabled');
   if(session.state().phase!=='idle')return session.begin(event.nativeEvent,{view:currentView,intent:value.intent,captureTarget:event.currentTarget,policy:{fingerInk:value.fingerInk}});
   try{if(value.canBegin?.()===false)return ignored('disabled');}catch{return ignored('disabled');}
   const style=copyStyle(value.style),page=value.page;if(!style||!page||page.id!==pageId)return ignored('invalid-context');
   const contact:Held={source:Object.freeze({ownerKey:value.ownerKey,generation:value.generation,api:value.api,pageId:page.id,token:Object.freeze({}),pointerId:event.pointerId,pointerType:event.pointerType as PaperInkStroke['pointerType']}),intent:value.intent,geometry:{...page},firstTime:event.timeStamp,view:currentView,style,wholeEraser:value.wholeEraser,options:copyOptions(value.correction),callbacks:{onAccepted:value.onAccepted,onStroke:value.onStroke,onActivity:value.onActivity,onSettled:value.onSettled,onCancelled:value.onCancelled,onCheckpoint:value.onCheckpoint,onCheckpointChunk:value.onCheckpointChunk,onNotice:value.onNotice},phase:'capturing',reported:false,revoked:false,checkpointCursor:0};held=contact;
   const result=session.begin(event.nativeEvent,{view:currentView,intent:contact.intent,captureTarget:event.currentTarget,policy:{fingerInk:value.fingerInk}});
   if(!result.accepted||!result.stroke){if(held===contact&&!contact.registered)held=null;return result;}if(held!==contact||!live(contact)){session.cancel('owner-changed');return {...result,status:'cancelled',accepted:false,reason:'owner-changed'};}
   contact.pointReader=session.capturePointReader()??undefined;
   event.preventDefault();event.stopPropagation();activity(contact,'capturing');if(held!==contact||!live(contact)){if(held===contact)session.cancel('owner-changed');return {...result,status:'cancelled',accepted:false,reason:'owner-changed'};}
   const output=contact.options?correction.begin(result.stroke,contact.options,performance.now()):undefined;paint(contact,result.stroke,output);repaint();
   const acceptedCurrent=()=>{const valid=held===contact&&live(contact);if(!valid){contact.revoked=true;if(held===contact)session.cancel('owner-changed');}return valid;};
   try{contact.callbacks.onAccepted?.(submission(contact,result.stroke,acceptedCurrent),event);}catch(error){session.cancel('invalid-sample');if(sameOwner(contact))try{contact.callbacks.onNotice?.(String(error instanceof Error?error.message:error));}catch{}}
   scheduleCheckpoint(contact);
   return result;
  };
  const move=(event:ReactPointerEvent<SVGSVGElement>)=>{
   const contact=held;if(!contact||contact.phase!=='capturing'||event.timeStamp<contact.firstTime)return ignored('no-active-stroke');if(!live(contact))return session.cancel('tool-changed');
   const currentView=view(event.currentTarget);if(!currentView)return session.cancel('geometry-changed');let coalesced:PointerEvent[]=[];try{coalesced=event.nativeEvent.getCoalescedEvents?.()??[];}catch{}
   const result=session.append(event.nativeEvent,currentView,coalesced);if(result.accepted){event.preventDefault();event.stopPropagation();repaint();}return result;
  };
  const finish=(event:ReactPointerEvent<SVGSVGElement>,cancelled=false)=>{
   const contact=held;if(!contact||contact.phase!=='capturing'||event.timeStamp<contact.firstTime)return ignored('no-active-stroke');if(!live(contact))return session.cancel('tool-changed');const currentView=view(event.currentTarget);if(!currentView)return session.cancel('geometry-changed');
   const result=session.finish(event.nativeEvent,currentView,cancelled);if(!result.accepted||!result.stroke||!result.lease)return result;
   const stroke=result.stroke,lease=result.lease,corrected=contact.options?correction.finish(stroke,performance.now(),context(contact,currentView),contact.options):undefined;
   if(corrected?.cancelled){session.cancel('geometry-changed');return {...result,status:'cancelled',accepted:false,reason:'geometry-changed'};}
   event.preventDefault();event.stopPropagation();contact.phase='settling';contact.submissionPending=true;stopCheckpoint(contact);clearVisual(contact);let accepted=false;
   // Publish before any parent callback. A synchronous account-close observer must
   // see this settlement, not the previous contact's promise.
   pendingFor(contact);activity(contact,'settling');
   const guard=()=>{const valid=lease.current()&&live(contact);if(!valid){contact.revoked=true;if(held===contact)session.cancel(latest.current.intent!==contact.intent?'tool-changed':'owner-changed');}return valid;};
   const work=lease.settle(async()=>{
    await drainCheckpoint(contact);
    // Let the parent paint busy state and cancellation before an analytical eraser starts.
    if(stroke.intent==='eraser')await new Promise<void>(resolve=>{const id=setTimeout(()=>{contact.timer=undefined;resolve();},0);contact.timer={id,resolve};});
    if(!guard())return;
    try{accepted=await contact.callbacks.onStroke(submission(contact,stroke,guard,corrected))===true;if(!accepted)session.cancel('publication-refused');}
    catch(error){session.cancel('save-failed');throw error;}
   });
   const notify=(current:boolean,error?:unknown):PaperPageInkSettlement=>{const value={...contact.source,accepted,current,...(error===undefined?{}:{error}),...(contact.interruption?{cancellation:contact.interruption.cancellation,preserved:contact.interruption.cancellation.disposition==='preserve-ink'}:{})};try{contact.callbacks.onSettled?.(value);}catch{}return value;};
   void work.then(stillCurrent=>notify(stillCurrent&&live(contact)),async error=>{
    if(contact.interruption&&session.state().pinned&&session.state().phase==='preserving'){
     try{await session.whenCancelled();}catch(conservationError){contact.submissionPending=false;contact.completion?.reject(conservationError);return null;}
    }
    if(session.state().phase==='blocked'){contact.submissionPending=false;contact.completion?.reject(error);return null;}
    if(sameOwner(contact))try{contact.callbacks.onNotice?.(String(error instanceof Error?error.message:error));}catch{}return notify(false,error);
   }).then(value=>{if(!value)return;contact.submissionPending=false;stopTimer(contact);const epoch=visualEpoch;releaseContact(contact);if(epoch===visualEpoch&&stroke.intent==='laser'&&value.accepted&&value.current&&live(contact))retainLaser(contact,stroke);contact.completion?.resolve(value);});return result;
  };
  const lost=(event:ReactPointerEvent<SVGSVGElement>)=>{const node=event.currentTarget;if(node!==svgRef.current)return;try{if(node.hasPointerCapture(event.pointerId))return;}catch{}session.lostPointerCapture(event.pointerId);};
  const updateCorrection=(accept:boolean)=>{const contact=held;if(!contact||contact.phase!=='capturing'||!live(contact)||!contact.options)return;const currentView=view(svgRef.current),stroke=session.snapshot();if(!currentView||!stroke)return;const result=accept?correction.acceptShape(context(contact,currentView),contact.options):correction.disable();paint(contact,stroke,result);};
  const bindSurface=()=>{const node=svgRef.current,document=node?.ownerDocument,window=document?.defaultView;if(!node||!document||!window)return()=>{};const check=()=>syncSurface(),observer=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(check);observer?.observe(node);document.addEventListener('scroll',check,true);window.addEventListener('resize',check);return()=>{observer?.disconnect();document.removeEventListener('scroll',check,true);window.removeEventListener('resize',check);};};
  return {token,activate:()=>{active=true;session.syncAuthority();if(!held)try{previewRef.current?.paint(null,latest.current.style);}catch{}},deactivate:()=>{
   visualEpoch++;clearLaser();const contact=held,value=latest.current;
   const cause:PaperInkCancellation['cause']=contact&&(value.ownerKey!==contact.source.ownerKey||value.generation!==contact.source.generation||value.api!==contact.source.api||!value.writable||!value.page||value.page.id!==contact.source.pageId)?'authority-revoked':contact&&value.intent!==contact.intent?'tool-change':contact&&value.page&&(value.page.width!==contact.geometry.width||value.page.height!==contact.geometry.height||value.page.rotation!==contact.geometry.rotation||(value.page.geometryKey??'')!==(contact.geometry.geometryKey??''))?'surface-change':'unmount';
   active=false;session.cancel('cancelled',{cause,disposition:'preserve-ink'});stopFrame();if(held)stopTimer(held);
  },bindSurface,handlers:{onPointerDown:(event:ReactPointerEvent<SVGSVGElement>)=>{begin(event);},onPointerMove:(event:ReactPointerEvent<SVGSVGElement>)=>{move(event);},onPointerUp:(event:ReactPointerEvent<SVGSVGElement>)=>{finish(event);},onPointerCancel:(event:ReactPointerEvent<SVGSVGElement>)=>{finish(event,true);},onLostPointerCapture:lost},cancel:(reason:PaperPageInputReason='cancelled',cancellation?:PaperInkCancellation)=>{visualEpoch++;clearLaser();if(held)held.revoked=true;return session.cancel(reason,cancellation);},syncAuthority:()=>{if(laser&&!live(laser.contact))clearLaser();return session.syncAuthority();},syncSurface,getState:()=>({...session.state(),pendingOperations}),whenSettled:()=>pending,retryCancellation:()=>{session.retryCancellation();return pending;},acceptShape:()=>updateCorrection(true),bypassCorrection:()=>updateCorrection(false)};
 },[options.pageId]);activeRuntime.current=runtime.token;
 useLayoutEffect(()=>{runtime.activate();return()=>runtime.deactivate();},[runtime,options.ownerKey,options.generation,options.api,options.writable,options.intent,options.page?.id,options.page?.width,options.page?.height,options.page?.rotation,options.page?.geometryKey]);
 useLayoutEffect(()=>runtime.bindSurface(),[runtime]);
 // Check after layout effects/rebase compensation, not between its top and scroll writes.
 useLayoutEffect(()=>{runtime.syncSurface();});
 return useMemo(()=>({svgRef,previewRef,handlers:runtime.handlers,cancel:runtime.cancel,syncAuthority:runtime.syncAuthority,syncSurface:runtime.syncSurface,getState:runtime.getState,whenSettled:runtime.whenSettled,retryCancellation:runtime.retryCancellation,acceptShape:runtime.acceptShape,bypassCorrection:runtime.bypassCorrection}),[runtime]);
}
