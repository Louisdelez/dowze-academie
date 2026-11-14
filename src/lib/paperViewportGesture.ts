/** Touch navigation is view-only: it never modifies the notebook or its ink. */
export interface PaperViewportContext {owner:string;pageId:string;zoom:number;scrollLeft:number;scrollTop:number;fingerInk:boolean}
export interface PaperTouchPoint {pointerId:number;pointerType:string;clientX:number;clientY:number;timeStamp:number;width?:number;height?:number}
export interface PaperViewportAction {mode:'ignored'|'pending'|'pan'|'pinch'|'ended'|'cancelled';handled:boolean;zoom?:number;scrollLeft?:number;scrollTop?:number;center?:{x:number;y:number};start?:boolean;reason?:string}
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const validPoint=(event:PaperTouchPoint)=>event.pointerType==='touch'&&Number.isSafeInteger(event.pointerId)&&finite(event.clientX)&&finite(event.clientY)&&finite(event.timeStamp);
export function createPaperViewportGesture(){
 const points=new Map<number,{x:number;y:number}>();let owner='',pageId='',finger=false,taken=false,base:PaperViewportContext|null=null,center={x:0,y:0},distance=0,penUntil=-Infinity;
 const observePen=(time:number)=>{if(finite(time))penUntil=Math.max(penUntil,time+800);};
 const reset=()=>{points.clear();base=null;taken=false;};
 const geometry=()=>{const p=[...points.values()];return {center:{x:p.reduce((s,v)=>s+v.x,0)/p.length,y:p.reduce((s,v)=>s+v.y,0)/p.length},distance:p.length>1?Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y):0};};
 const matches=(context:PaperViewportContext)=>context.owner===owner&&context.pageId===pageId&&context.fingerInk===finger;
 const capture=(context:PaperViewportContext)=>{base={...context};const g=geometry();center=g.center;distance=g.distance;};
 const action=(start=false):PaperViewportAction=>{const g=geometry();if(points.size>1)return {mode:'pinch',handled:true,start,center:g.center,zoom:Math.max(.3,Math.min(2,base!.zoom*(distance>1?g.distance/distance:1)))};
  if(taken||!finger)return {mode:'pan',handled:true,start,scrollLeft:Math.max(0,base!.scrollLeft-(g.center.x-center.x)),scrollTop:Math.max(0,base!.scrollTop-(g.center.y-center.y))};
  return {mode:'pending',handled:false};
 };
 return {
  observePen,
  begin(event:PaperTouchPoint,context:PaperViewportContext,penActive=false):PaperViewportAction{
   if(!validPoint(event))return {mode:'ignored',handled:false};
   if(penActive||event.timeStamp<penUntil||(event.width??0)>28||(event.height??0)>28)return {mode:'ignored',handled:false,reason:'palm'};
   if(!finite(context.zoom)||context.zoom<=0||!finite(context.scrollLeft)||!finite(context.scrollTop))return {mode:'ignored',handled:false};
   if(points.size&&!matches(context)){reset();return {mode:'cancelled',handled:true,reason:'owner-changed'};}
   if(points.has(event.pointerId)||points.size>=2)return {mode:'ignored',handled:false};
   if(!points.size){owner=context.owner;pageId=context.pageId;finger=context.fingerInk;}
   points.set(event.pointerId,{x:event.clientX,y:event.clientY});if(points.size===2)taken=true;capture(context);return action(true);
  },
  move(event:PaperTouchPoint,context:PaperViewportContext):PaperViewportAction{
   if(!points.has(event.pointerId)||!validPoint(event))return {mode:'ignored',handled:false};
   if(!matches(context)){reset();return {mode:'cancelled',handled:true,reason:'owner-changed'};}
   points.set(event.pointerId,{x:event.clientX,y:event.clientY});return action();
  },
  end(event:PaperTouchPoint,context:PaperViewportContext,cancelled=false):PaperViewportAction{
   if(!points.has(event.pointerId))return {mode:'ignored',handled:false};const handled=taken||!finger;
   if(cancelled||!matches(context)){reset();return {mode:'cancelled',handled,reason:cancelled?'cancelled':'owner-changed'};}
   points.delete(event.pointerId);if(!points.size){reset();return {mode:'ended',handled};}capture(context);return action(true);
  },
  cancel:reset,
  has:(id:number)=>points.has(id),
  active:()=>points.size>0&&(taken||!finger),
 };
}
