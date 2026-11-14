import {createPaperInkInput,paperInkCancellation,type PaperInkCancellation,type PaperInkContext,type PaperInkEvent,type PaperInkIntent,type PaperInkPolicy,type PaperInkRect,type PaperInkMatrix,type PaperInkReason,type PaperInkResult,type PaperInkStroke,type PaperInkPointReader} from './paperInkInput.ts';

/** geometryKey covers extra coordinate-affecting page properties (for example crop), never an object-list revision. */
export interface PaperPageInputGeometry {id:string;width:number;height:number;rotation:number;geometryKey?:string}
/** Scope generation must be monotonic across owner/API replacement, never a document revision or toolbar page. */
export interface PaperPageInputAuthority {
 ownershipKey:string;generation:string|number;api:object|null|undefined;writable:boolean;page:PaperPageInputGeometry|null;
}
export interface PaperPageInputView {clientRect:PaperInkRect;clientToPage?:PaperInkMatrix}
export interface PaperPageInputCaptureTarget {
 setPointerCapture:(pointerId:number)=>void;releasePointerCapture:(pointerId:number)=>void;
}
export interface PaperPageInputPin {
 readonly pageId:string;readonly ownershipKey:string;readonly generation:string|number;readonly api:object|null|undefined;
 readonly pointerId:number;readonly token:object;
}
export type PaperPageInputReason=PaperInkReason|'invalid-authority'|'permission-changed'|'api-changed'|'page-removed'|'pin-failed'|'settling'|'disposed';
export interface PaperPageInputLease {
 /** Sticky authority guard. The caller must also validate its own command baseline before and after any flush. */
 current:()=>boolean;
 /** Invoke guarded work once; keep the pin until it settles, including rejection or cancellation. */
 settle:(work?:(current:()=>boolean)=>void|PromiseLike<void>)=>Promise<boolean>;
}
export type PaperPageInputResult=Omit<PaperInkResult,'reason'>&{reason?:PaperPageInputReason;lease?:PaperPageInputLease;admitted?:boolean};
export interface PaperPageInputSessionOptions {
 pageId:string;getAuthority:()=>PaperPageInputAuthority|null;
 /** A distinct release handle per pin prevents an old session from unpinning a newer contact. Must be synchronous. */
 pinPage:(pin:PaperPageInputPin)=>()=>void;
 /** The callback is captured for this operation. Resolution confirms recovery/discard consumption,
  * never a canonical commit. A rejected callback retains the buffer and pin for explicit retry. */
 onCancelled?:(result:PaperPageInputResult)=>void|PromiseLike<void>;
 onCancellationState?:(result:PaperPageInputResult,phase:'preserving'|'blocked'|'settled',error?:unknown)=>void;
}
export interface PaperPageInputBegin {
 view:PaperPageInputView;intent:PaperInkIntent;captureTarget:PaperPageInputCaptureTarget;policy?:PaperInkPolicy;
}
interface Operation {
 authority:PaperPageInputAuthority&{page:PaperPageInputGeometry};pointerId:number;intent:PaperInkIntent;
 phase:'capturing'|'finished'|'settling'|'preserving'|'blocked';revoked:boolean;pinRequested:boolean;releasePin?:()=>void;
 captureTarget?:PaperPageInputCaptureTarget;settlement?:Promise<boolean>;
 admitted:boolean;actualIntent:PaperInkIntent;finishedStroke?:PaperInkStroke;workRunning:boolean;
 cancellation?:PaperPageInputResult;cancelCallback?:PaperPageInputSessionOptions['onCancelled'];
 cancellationTask?:Promise<boolean>;cancellationConfirmed?:boolean;cancellationError?:unknown;cancellationFailed?:boolean;
 pointReader?:PaperInkPointReader;rawPointReader?:PaperInkPointReader;closed:boolean;
}
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const ignored=(reason:PaperPageInputReason):PaperPageInputResult=>({status:'ignored',accepted:false,added:0,reason});

/**
 * One page controller, independent of React, toolbar selection and document identity/revision.
 * Call syncAuthority() on every permission, page-geometry and owner/API transition, including
 * intermediate B in A→B→A. Polling only pointer events cannot detect an unobserved ABA.
 * The page view is read from this page's surface; the initial tool is held for the gesture.
 * Intentional tool changes call cancel('tool-changed'). No listeners, timers or writers are installed here.
 * An accepted begin has pinned and captured the first sample before the caller selects a toolbar page.
 */
export function createPaperPageInputSession(options:PaperPageInputSessionOptions){
 const ink=createPaperInkInput();let operation:Operation|null=null,disposed=false;
 const read=():PaperPageInputAuthority|null=>{try{return options.getAuthority();}catch{return null;}};
 const valid=(authority:PaperPageInputAuthority|null):authority is PaperPageInputAuthority&{page:PaperPageInputGeometry}=>!!authority
  &&typeof authority.ownershipKey==='string'&&authority.ownershipKey.length>0
  &&(typeof authority.generation==='string'&&authority.generation.length>0||finite(authority.generation)&&Number.isSafeInteger(authority.generation)&&authority.generation>=0)
  &&(authority.api==null||typeof authority.api==='object'||typeof authority.api==='function')
  &&typeof authority.writable==='boolean'&&!!authority.page&&authority.page.id===options.pageId
  &&[authority.page.width,authority.page.height].every(n=>finite(n)&&n>0)&&finite(authority.page.rotation)
  &&(authority.page.geometryKey===undefined||typeof authority.page.geometryKey==='string');
 const reason=(op:Operation,authority:PaperPageInputAuthority|null):PaperPageInputReason|undefined=>{
  if(disposed)return 'disposed';
  if(!authority)return 'invalid-authority';
  if(authority.ownershipKey!==op.authority.ownershipKey||authority.generation!==op.authority.generation)return 'owner-changed';
  if(authority.api!==op.authority.api)return 'api-changed';
  if(authority.writable!==true)return 'permission-changed';
  if(!authority.page||authority.page.id!==options.pageId)return 'page-removed';
  if(!valid(authority))return 'invalid-authority';
  const a=op.authority.page,b=authority.page;
  if(a.width!==b.width||a.height!==b.height||a.rotation!==b.rotation||(a.geometryKey??'')!==(b.geometryKey??''))return 'geometry-changed';
 };
 const releaseCapture=(op:Operation)=>{const target=op.captureTarget;op.captureTarget=undefined;if(target)try{target.releasePointerCapture(op.pointerId);}catch{}};
 const releasePin=(op:Operation)=>{const release=op.releasePin;op.releasePin=undefined;op.pinRequested=false;if(release)try{release();}catch{}};
 const discard=(op:Operation)=>{op.closed=true;op.rawPointReader=undefined;if(operation===op)operation=null;releaseCapture(op);releasePin(op);};
 const cancellationFinished=(op:Operation)=>{
  if(op.cancellationFailed){op.phase='blocked';return;}
  if(op.cancellationConfirmed&&!op.workRunning)discard(op);
  else if(op.cancellationConfirmed)op.phase='settling';
 };
 const preserveCancellation=(op:Operation):Promise<boolean>=>{
  if(op.cancellationTask&&!op.cancellationFailed)return op.cancellationTask;
  op.phase='preserving';op.cancellationFailed=false;op.cancellationError=undefined;
  let resolve!:(value:boolean)=>void,reject!:(error:unknown)=>void;
  const task=new Promise<boolean>((yes,no)=>{resolve=yes;reject=no;});op.cancellationTask=task;
  // Observe rejection internally without converting it into successful settlement.
  void task.catch(()=>{});
  const notify=(phase:'preserving'|'blocked'|'settled',error?:unknown)=>{try{options.onCancellationState?.(op.cancellation!,phase,error);}catch{}};
  notify('preserving');
  const done=()=>{op.cancellationConfirmed=true;cancellationFinished(op);resolve(false);notify('settled');};
  const failed=(error:unknown)=>{op.cancellationFailed=true;op.cancellationError=error;op.phase='blocked';reject(error);notify('blocked',error);};
  try{
   if(!op.cancelCallback&&op.cancellation?.cancellation?.disposition==='preserve-ink')throw Error('Le trait interrompu attend un écrivain de conservation.');
   const value=op.cancelCallback?.(op.cancellation!);
   if(value&&typeof value.then==='function')Promise.resolve(value).then(done,failed);else done();
  }catch(error){failed(error);}
  return task;
 };
 const cancelOperation=(op:Operation,why:PaperPageInputReason,details?:PaperInkCancellation,raw?:PaperInkResult):PaperPageInputResult=>{
  if(op.revoked)return ignored(op.closed?'no-active-stroke':'settling');
  const strokeResult=raw??(op.phase==='capturing'?ink.cancel('cancelled'):undefined);
  op.revoked=true;
  const requested=paperInkCancellation(why,op.actualIntent,details??raw?.cancellation);
  const cancellation=op.admitted?requested:Object.freeze({cause:requested.cause,disposition:'discard' as const});
  const result:PaperPageInputResult={status:'cancelled',accepted:false,added:0,pointerId:op.pointerId,intent:op.actualIntent,reason:why,
   stroke:strokeResult?.stroke??op.finishedStroke,cancellation,admitted:op.admitted};
  if(result.stroke){for(const point of result.stroke.points)Object.freeze(point);Object.freeze(result.stroke.points);Object.freeze(result.stroke.context.clientRect);if(result.stroke.context.clientToPage)Object.freeze(result.stroke.context.clientToPage);Object.freeze(result.stroke.context);Object.freeze(result.stroke);}
  Object.freeze(result);op.cancellation=result;
  // Invalidate before release: synchronous lostpointercapture cannot cancel twice.
  releaseCapture(op);preserveCancellation(op);return result;
 };
 const current=(op:Operation):boolean=>{
  if(op.revoked||operation!==op)return false;const why=reason(op,read());if(why){cancelOperation(op,why);return false;}return true;
 };
 const context=(op:Operation,view:PaperPageInputView):PaperInkContext=>({ownershipKey:op.authority.ownershipKey,generation:op.authority.generation,pageId:options.pageId,pageWidth:op.authority.page.width,pageHeight:op.authority.page.height,pageRotation:op.authority.page.rotation,clientRect:view.clientRect,clientToPage:view.clientToPage,intent:op.intent});
 const syncAuthority=():PaperPageInputResult|null=>{
  if(!operation)return null;const why=reason(operation,read());return why?cancelOperation(operation,why):null;
 };
 const cancel=(why:PaperPageInputReason='cancelled',details?:PaperInkCancellation)=>operation?cancelOperation(operation,why,details):ignored(disposed?'disposed':'no-active-stroke');
 const consume=(op:Operation,result:PaperInkResult):PaperPageInputResult=>{
  return result.status==='cancelled'?cancelOperation(op,result.reason??'cancelled',result.cancellation,result):result;
 };
 const leaseFor=(op:Operation):PaperPageInputLease=>({current:()=>current(op),settle:(work)=>{
  if(op.settlement)return op.settlement;
  if(!current(op))return op.cancellationTask??Promise.resolve(false);
  // Publish the promise before invoking work: it may reenter settle, revoke authority or dispose.
  let run!:()=>void;const task=new Promise<boolean>((resolve,reject)=>{run=()=>void(async()=>{
   let workRejected=false,workError:unknown;
   try{if(!current(op))return false;await work?.(()=>current(op));return current(op);}
   catch(error){
    workRejected=true;workError=error;
    // Rejection is not proof that an admitted buffer reached canonical storage.
    // Preserve the exact finished source before releasing its reader or page pin.
    cancelOperation(op,'save-failed');
   }finally{
   op.workRunning=false;
   if(op.cancellation){
    // A blocked-state observer may synchronously start retry. Do not let an
    // older rejected attempt release the newer preservation tail.
    while(op.cancellationTask){const task=op.cancellationTask;try{await task;}catch(error){if(op.cancellationTask!==task)continue;if(!workRejected)throw error;break;}if(op.cancellationTask===task)break;}
    cancellationFinished(op);
   }
   else{op.revoked=true;discard(op);}
   }
   // Keep the original accepted-work failure observable. A second preservation
   // failure stays in cancellationError/blocked and retains the buffer for retry.
   if(workRejected)throw workError;
   // All successful try paths already return a boolean. Keep the exhausted
   // rejection branch typed as a refusal rather than an undefined success.
   return false;
  })().then(resolve,reject);});
  op.phase='settling';op.workRunning=true;op.settlement=task;run();return task;
 }});
 return {
  begin(event:PaperInkEvent,input:PaperPageInputBegin):PaperPageInputResult{
   if(disposed)return ignored('disposed');const changed=syncAuthority();if(changed)return changed;
   if(operation){if(operation.phase!=='capturing')return ignored('settling');return consume(operation,ink.begin(event,context(operation,input.view),input.policy));}
   const authority=read();if(!valid(authority))return ignored(authority?.page?'invalid-authority':'page-removed');if(!authority.writable)return ignored('permission-changed');
   if(!input.captureTarget||typeof input.captureTarget.setPointerCapture!=='function'||typeof input.captureTarget.releasePointerCapture!=='function')return ignored('capture-lost');
   const op:Operation={authority:{...authority,page:{...authority.page}},pointerId:event.pointerId,intent:input.intent,actualIntent:input.intent,phase:'capturing',revoked:false,pinRequested:false,admitted:false,workRunning:false,cancelCallback:options.onCancelled,closed:false};
   const result=ink.begin(event,context(op,input.view),input.policy);if(!result.accepted)return result;op.actualIntent=result.intent??input.intent;operation=op;
   const reader=ink.capturePointReader();
   op.rawPointReader=reader??undefined;
   if(reader)op.pointReader=Object.freeze({...reader,totalCapturedCount:()=>op.closed?null:op.rawPointReader?.totalCapturedCount()??null,readPointRange:(from:number,max:number)=>op.closed?null:op.rawPointReader?.readPointRange(from,max)??null});
   const pin:PaperPageInputPin=Object.freeze({pageId:options.pageId,ownershipKey:authority.ownershipKey,generation:authority.generation,api:authority.api,pointerId:event.pointerId,token:Object.freeze({})});
   try{op.pinRequested=true;const release=options.pinPage(pin);if(typeof release!=='function')throw Error('A page pin needs a release handle.');op.releasePin=release;
    if(!current(op)){releasePin(op);return {...result,status:'cancelled',accepted:false,reason:'cancelled'};}
   }catch{return cancelOperation(op,'pin-failed',{cause:'pin-failed',disposition:'discard'});}
   try{op.captureTarget=input.captureTarget;input.captureTarget.setPointerCapture(event.pointerId);}catch{return cancelOperation(op,'capture-lost',{cause:'capture-failed',disposition:'discard'});}
   if(!current(op))return {...result,status:'cancelled',accepted:false,reason:'cancelled'};op.admitted=true;return {...result,admitted:true};
  },
  append(event:PaperInkEvent,view:PaperPageInputView,coalesced:readonly PaperInkEvent[]=[]):PaperPageInputResult{
   const changed=syncAuthority();if(changed)return changed;const op=operation;if(!op||op.phase!=='capturing')return ignored(disposed?'disposed':'no-active-stroke');
   return consume(op,ink.append(event,context(op,view),coalesced));
  },
  finish(event:PaperInkEvent,view:PaperPageInputView,wasCancelled=false):PaperPageInputResult{
   const changed=syncAuthority();if(changed)return changed;const op=operation;if(!op||op.phase!=='capturing')return ignored(disposed?'disposed':'no-active-stroke');
   const result=consume(op,ink.finish(event,context(op,view),wasCancelled));if(result.status!=='finished'||!result.accepted)return result;
   op.phase='finished';op.finishedStroke=result.stroke;releaseCapture(op);if(!current(op))return {...result,status:'cancelled',accepted:false,reason:'cancelled'};
   return {...result,lease:leaseFor(op)};
  },
  lostPointerCapture(pointerId:number):PaperPageInputResult{const op=operation;return op?.phase==='capturing'&&op.pointerId===pointerId?cancelOperation(op,'capture-lost'):ignored('other-pointer');},
  syncAuthority,cancel,
  snapshot():PaperInkStroke|null{syncAuthority();return operation?.phase==='capturing'?ink.snapshot():null;},
  /** Recovery reader for this exact admitted operation. No current()/latest authority
   * check: a revoked owner may finish preserving its own samples, never publish canonically. */
  capturePointReader():PaperInkPointReader|null{return operation?.admitted&&!operation.closed?operation.pointReader??null:null;},
  state(){return {pageId:options.pageId,phase:operation?.phase==='blocked'?'blocked' as const:disposed?'disposed' as const:operation?.phase??'idle' as const,pinned:operation?.pinRequested===true,pointerId:operation?.pointerId,cancellationError:operation?.cancellationError};},
  whenCancelled:()=>operation?.cancellationTask??Promise.resolve(false),
  retryCancellation:()=>operation?.cancellationFailed?preserveCancellation(operation):operation?.cancellationTask??Promise.resolve(false),
  dispose(){if(disposed)return;disposed=true;if(operation)cancelOperation(operation,'disposed');},
 };
}
