import type {InkPoint} from './notebookDocument.ts';

/**
 * Pointer Events Level 3: https://www.w3.org/TR/pointerevents3/
 * This module receives real samples only, never predicted samples. The caller
 * sets touch-action before a gesture and uses pointer capture for accepted
 * gestures. Cancelling a pointer event alone cannot prevent native scrolling.
 * An API being present is not evidence that an Apple Pencil/device supports it.
 */
export type PaperInkIntent='pen'|'pencil'|'calligraphy'|'highlighter'|'eraser'|'lasso'|'select'|'laser';
export interface PaperInkEvent {
 pointerId:number;pointerType:string;clientX:number;clientY:number;timeStamp:number;
 isPrimary?:boolean;button?:number;buttons?:number;width?:number;height?:number;
 pressure?:number;tiltX?:number;tiltY?:number;twist?:number;
}
export interface PaperInkRect {left:number;top:number;width:number;height:number}
/** Inverse SVG getScreenCTM(), mapping CSS client coordinates to paper units. */
export interface PaperInkMatrix {a:number;b:number;c:number;d:number;e:number;f:number}
export interface PaperInkContext {
 ownershipKey:string;generation:string|number;pageId:string;pageWidth:number;pageHeight:number;
 pageRotation?:number;clientRect:PaperInkRect;clientToPage?:PaperInkMatrix;intent:PaperInkIntent;
}
export interface PaperInkPolicy {
 enabled?:boolean;fingerInk?:boolean;palmSize?:number;penTouchDelay?:number;maxPoints?:number;
}
export interface PaperInkStroke {
 pointerId:number;pointerType:'mouse'|'pen'|'touch';intent:PaperInkIntent;context:PaperInkContext;
 points:InkPoint[];eraserButton:boolean;
}
/** Bounds each transport copy, never the number of physical samples admitted. */
export const PAPER_INK_POINT_RANGE_MAX=4096;
export interface PaperInkPointRange {
 readonly from:number;readonly to:number;readonly total:number;
 readonly points:readonly Readonly<InkPoint>[];
}
export interface PaperInkPointReader {
 readonly pointerId:number;readonly pointerType:PaperInkStroke['pointerType'];readonly intent:PaperInkIntent;
 readonly eraserButton:boolean;readonly context:Readonly<PaperInkContext>;
 /** null means this reader was closed, never a different capture's count. */
 totalCapturedCount:()=>number|null;
 readPointRange:(from:number,max:number)=>PaperInkPointRange|null;
}
export type PaperInkReason='disabled'|'invalid-context'|'invalid-pointer'|'invalid-sample'|'navigation'
 |'palm'|'non-primary'|'other-pointer'|'already-active'|'no-active-stroke'|'owner-changed'
 |'geometry-changed'|'tool-changed'|'buttons-changed'|'multitouch'|'point-limit'|'cancelled'|'capture-lost'|'publication-refused'|'save-failed';
export type PaperInkCancellationCause='pointercancel'|'capture-lost'|'surface-change'|'authority-revoked'|'unmount'
 |'explicit-discard'|'navigation'|'tool-change'|'buttons-change'|'point-limit'|'invalid-input'|'capture-failed'|'pin-failed'|'gesture-arbitration'|'publication-refused'|'save-failed';
export interface PaperInkCancellation {readonly cause:PaperInkCancellationCause;readonly disposition:'preserve-ink'|'discard'}
export const paperInkAuthoringIntent=(intent:PaperInkIntent)=>intent==='pen'||intent==='pencil'||intent==='calligraphy'||intent==='highlighter';
/** Cancellation never grants canonical write authority. A preserved prefix belongs to a separate recovery writer. */
export function paperInkCancellation(reason:string,intent:PaperInkIntent,explicit?:PaperInkCancellation):PaperInkCancellation {
 const causes:Record<string,PaperInkCancellationCause>={'capture-lost':'capture-lost','geometry-changed':'surface-change','owner-changed':'authority-revoked','api-changed':'authority-revoked','permission-changed':'authority-revoked','page-removed':'authority-revoked','invalid-authority':'authority-revoked','disposed':'unmount','tool-changed':'tool-change','buttons-changed':'buttons-change','point-limit':'point-limit','invalid-context':'invalid-input','invalid-pointer':'invalid-input','invalid-sample':'invalid-input','multitouch':'gesture-arbitration','navigation':'navigation','pin-failed':'pin-failed','publication-refused':'publication-refused','save-failed':'save-failed'};
 const cause=explicit?.cause??causes[reason]??'explicit-discard';
 const disposition=paperInkAuthoringIntent(intent)&&!['explicit-discard','navigation','gesture-arbitration','capture-failed','pin-failed'].includes(cause)&&(explicit?.disposition??'preserve-ink')==='preserve-ink'?'preserve-ink':'discard';
 return Object.freeze({cause,disposition});
}
export interface PaperInkResult {
 status:'started'|'updated'|'finished'|'ignored'|'cancelled';accepted:boolean;added:number;
 pointerId?:number;intent?:PaperInkIntent;reason?:PaperInkReason;stroke?:PaperInkStroke;
 cancellation?:PaperInkCancellation;
}
const intents=new Set<PaperInkIntent>(['pen','pencil','calligraphy','highlighter','eraser','lasso','select','laser']);
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const matrixKeys=['a','b','c','d','e','f'] as const;
function validContext(context:PaperInkContext):boolean {
 if(!context||typeof context.ownershipKey!=='string'||!context.ownershipKey||typeof context.pageId!=='string'||!context.pageId
  ||!(typeof context.generation==='string'||finite(context.generation))||!intents.has(context.intent)
  ||![context.pageWidth,context.pageHeight].every(n=>finite(n)&&n>0)
  ||context.pageRotation!==undefined&&!finite(context.pageRotation))return false;
 const rect=context.clientRect;if(!rect||![rect.left,rect.top,rect.width,rect.height].every(finite)||rect.width<=0||rect.height<=0)return false;
 const matrix=context.clientToPage;
 return !matrix||matrixKeys.every(key=>finite(matrix[key]))&&Math.abs(matrix.a*matrix.d-matrix.b*matrix.c)>1e-12;
}
const cloneContext=(context:PaperInkContext):PaperInkContext=>({...context,clientRect:{...context.clientRect},...(context.clientToPage?{clientToPage:{...context.clientToPage}}:{})});
function changedContext(captured:PaperInkContext,current:PaperInkContext):PaperInkReason|undefined {
 if(captured.ownershipKey!==current.ownershipKey||captured.generation!==current.generation||captured.pageId!==current.pageId)return 'owner-changed';
 if(captured.intent!==current.intent)return 'tool-changed';
 if(captured.pageWidth!==current.pageWidth||captured.pageHeight!==current.pageHeight||(captured.pageRotation??0)!==(current.pageRotation??0))return 'geometry-changed';
 // Browser layout can change fractionally. Small floating-point noise (not a
 // real scroll/resize) is tolerated; the original transform is still used.
 if((['left','top','width','height'] as const).some(key=>Math.abs(captured.clientRect[key]-current.clientRect[key])>0.01))return 'geometry-changed';
 if(!!captured.clientToPage!==!!current.clientToPage)return 'geometry-changed';
 if(captured.clientToPage&&current.clientToPage&&matrixKeys.some(key=>Math.abs(captured.clientToPage![key]-current.clientToPage![key])>1e-7))return 'geometry-changed';
}
function eraser(event:PaperInkEvent):boolean {
 return event.pointerType==='pen'&&(event.button===5||finite(event.buttons)&&(event.buttons&32)!==0);
}
function point(event:PaperInkEvent,stroke:Pick<PaperInkStroke,'context'|'pointerId'|'pointerType'>):InkPoint|undefined {
 if(!finite(event.clientX)||!finite(event.clientY)||!finite(event.timeStamp)||event.timeStamp<0
  ||event.pointerId!==stroke.pointerId||event.pointerType!==stroke.pointerType)return;
 const {clientRect:rect,clientToPage:matrix,pageWidth,pageHeight}=stroke.context;
 const x=matrix?matrix.a*event.clientX+matrix.c*event.clientY+matrix.e:(event.clientX-rect.left)/rect.width*pageWidth;
 const y=matrix?matrix.b*event.clientX+matrix.d*event.clientY+matrix.f:(event.clientY-rect.top)/rect.height*pageHeight;
 if(!finite(x)||!finite(y))return;
 // Capture may legitimately continue outside the page. Keep these coordinates
 // instead of clamping them and manufacturing a line along the page boundary.
 const p:InkPoint={x,y,time:event.timeStamp};
 if(stroke.pointerType==='pen') {
  if(finite(event.pressure))p.pressure=clamp(event.pressure,0,1);
  if(finite(event.tiltX))p.tiltX=clamp(event.tiltX,-90,90);
  if(finite(event.tiltY))p.tiltY=clamp(event.tiltY,-90,90);
  if(finite(event.twist))p.twist=clamp(event.twist,0,359);
 }
 return p;
}
function equalPoint(a:InkPoint,b:InkPoint):boolean {
 return a.x===b.x&&a.y===b.y&&a.time===b.time&&a.pressure===b.pressure&&a.tiltX===b.tiltX&&a.tiltY===b.tiltY&&a.twist===b.twist;
}
const cloneStroke=(stroke:PaperInkStroke):PaperInkStroke=>({...stroke,context:cloneContext(stroke.context),points:stroke.points.map(p=>({...p}))});
const pointReader=(stroke:PaperInkStroke):PaperInkPointReader=>{
 const context=cloneContext(stroke.context);Object.freeze(context.clientRect);if(context.clientToPage)Object.freeze(context.clientToPage);Object.freeze(context);
 return Object.freeze({pointerId:stroke.pointerId,pointerType:stroke.pointerType,intent:stroke.intent,eraserButton:stroke.eraserButton,context,
  totalCapturedCount:()=>stroke.points.length,
  readPointRange:(from:number,max:number):PaperInkPointRange|null=>{
   const total=stroke.points.length;
   if(!Number.isSafeInteger(from)||from<0||from>total||!Number.isSafeInteger(max)||max<1||max>PAPER_INK_POINT_RANGE_MAX)return null;
   const to=Math.min(total,from+max),points=stroke.points.slice(from,to).map(p=>Object.freeze({...p}));
   return Object.freeze({from,to,total,points:Object.freeze(points)});
  }});
};
const ignored=(reason:PaperInkReason):PaperInkResult=>({status:'ignored',accepted:false,added:0,reason});

/** Stateful capture, independent of DOM/React. snapshot() copies only on RAF. */
export function createPaperInkInput() {
 let active:PaperInkStroke|null=null,lastPenTime=-Infinity,maxPoints=250000;
 const observePen=(event:PaperInkEvent)=>{if(event.pointerType==='pen'&&finite(event.timeStamp)&&event.timeStamp>=0)lastPenTime=Math.max(lastPenTime,event.timeStamp);};
 const cancel=(reason:PaperInkReason='cancelled',details?:PaperInkCancellation):PaperInkResult=>{
  if(!active)return ignored('no-active-stroke');const stroke=cloneStroke(active);active=null;
  return {status:'cancelled',accepted:false,added:0,reason,pointerId:stroke.pointerId,intent:stroke.intent,stroke,cancellation:paperInkCancellation(reason,stroke.intent,details)};
 };
 const inspect=(event:PaperInkEvent,context:PaperInkContext):PaperInkResult|undefined=>{
  if(!active)return ignored('no-active-stroke');
  if(event.pointerId!==active.pointerId)return ignored('other-pointer');
  if(!validContext(context))return cancel('invalid-context');
  const changed=changedContext(active.context,context);if(changed)return cancel(changed);
  if(event.pointerType!==active.pointerType)return cancel('invalid-pointer');
 };
 const append=(event:PaperInkEvent,context:PaperInkContext,coalesced:readonly PaperInkEvent[]=[]):PaperInkResult=>{
  observePen(event);const invalid=inspect(event,context);if(invalid)return invalid;
  const stroke=active!;
  // The released eraser uses buttons=0 on pointerup; finish handles this case.
  if(event.pointerType==='pen'&&finite(event.buttons)&&event.buttons!==0&&eraser(event)!==stroke.eraserButton)return cancel('buttons-changed');
  let added=0;
  // W3C recommends processing coalesced OR the parent summary, never both.
  // Untrusted/malformed batches are filtered and chronologically sorted.
  if(coalesced.length>250000)return cancel('point-limit');
  const batch=coalesced.length?coalesced:[event];
  const valid=batch.map(sample=>point(sample,stroke)).filter((p):p is InkPoint=>!!p&&p.time<=event.timeStamp).sort((a,b)=>a.time-b.time);
  for(const p of valid){const previous=stroke.points[stroke.points.length-1];if(previous&&(p.time<previous.time||equalPoint(p,previous)))continue;
   if(stroke.points.length>=maxPoints)return cancel('point-limit');stroke.points.push(p);added++;
  }
  return {status:'updated',accepted:true,added,pointerId:stroke.pointerId,intent:stroke.intent};
 };
 return {
  begin(event:PaperInkEvent,context:PaperInkContext,policy:PaperInkPolicy={}):PaperInkResult {
   observePen(event);
   if(policy.enabled===false)return ignored('disabled');
   if(!validContext(context))return ignored('invalid-context');
   if(!Number.isSafeInteger(event.pointerId)||event.pointerId<0||!['mouse','pen','touch'].includes(event.pointerType))return ignored('invalid-pointer');
   if(active){
    if(event.pointerId===active.pointerId)return ignored('already-active');
    if(active.pointerType==='touch'&&event.pointerType==='touch')return cancel('multitouch');
    return ignored(active.pointerType==='pen'&&event.pointerType==='touch'?'palm':'other-pointer');
   }
   if(event.isPrimary===false)return ignored('non-primary');
   if(event.pointerType==='touch') {
    if(!policy.fingerInk)return ignored('navigation');
    if(event.isPrimary!==true)return ignored('non-primary');
    const delay=finite(policy.penTouchDelay)?clamp(policy.penTouchDelay,0,10000):800,palm=finite(policy.palmSize)?clamp(policy.palmSize,1,200):28;
    if(event.timeStamp-lastPenTime<delay||finite(event.width)&&event.width>palm||finite(event.height)&&event.height>palm)return ignored('palm');
   }
   const eraserButton=eraser(event);
   if(!eraserButton&&(event.button!==undefined&&event.button!==0||finite(event.buttons)&&event.buttons!==1))return ignored('buttons-changed');
   const candidate:PaperInkStroke={pointerId:event.pointerId,pointerType:event.pointerType as PaperInkStroke['pointerType'],intent:eraserButton?'eraser':context.intent,context:cloneContext(context),points:[],eraserButton};
   const first=point(event,candidate);if(!first)return ignored('invalid-sample');candidate.points.push(first);active=candidate;
   maxPoints=finite(policy.maxPoints)?Math.floor(clamp(policy.maxPoints,1,250000)):250000;
   return {status:'started',accepted:true,added:1,pointerId:candidate.pointerId,intent:candidate.intent,stroke:cloneStroke(candidate)};
  },
  append,
  finish(event:PaperInkEvent,context:PaperInkContext,wasCancelled=false):PaperInkResult {
   observePen(event);const invalid=inspect(event,context);if(invalid)return invalid;
   if(wasCancelled)return cancel('cancelled',{cause:'pointercancel',disposition:'preserve-ink'});
   const result=append(event,context);if(result.status==='cancelled'||result.status==='ignored')return result;
   const stroke=cloneStroke(active!);active=null;
   return {status:'finished',accepted:true,added:result.added,pointerId:stroke.pointerId,intent:stroke.intent,stroke};
  },
  cancel,
  snapshot():PaperInkStroke|null {return active?cloneStroke(active):null;},
  /** Exact append-only capture, including its frozen final prefix after finish/cancel.
   * Old readers never redirect to active. The owning session closes its wrapper. */
  capturePointReader():PaperInkPointReader|null{return active?pointReader(active):null;},
 };
}

/** Presence-only capabilities; never infer physical hardware from API presence. */
export function paperInkCapabilities(environment:{pointerEvents?:boolean;pointerCapture?:boolean;coalescedEvents?:boolean;pressure?:boolean;tilt?:boolean;twist?:boolean;eraserButton?:boolean}={}) {
 const available={pointerEvents:environment.pointerEvents===true,pointerCapture:environment.pointerCapture===true,coalescedEvents:environment.coalescedEvents===true,pressure:environment.pressure===true,tilt:environment.tilt===true,twist:environment.twist===true,eraserButton:environment.eraserButton===true};
 return {available,missing:Object.entries(available).filter(([,present])=>!present).map(([name])=>name),hardwareVerified:false as const};
}
