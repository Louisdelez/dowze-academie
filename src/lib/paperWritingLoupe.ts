import type {InkPoint} from './notebookDocument.ts';
import {createPaperInkInput,type PaperInkContext,type PaperInkEvent,type PaperInkIntent,type PaperInkPolicy,type PaperInkRect,type PaperInkResult} from './paperInkInput.ts';

export interface PaperWritingLoupePage {width:number;height:number;spacing?:number}
export interface PaperWritingLoupeRegion {x:number;y:number;width:number;height:number;zoom:number}
/** generation is a scope epoch, not the document revision (each accepted stroke changes that revision). */
export interface PaperWritingLoupeOwner {
 ownershipKey:string;generation:string|number;pageId:string;pageWidth:number;pageHeight:number;pageRotation?:number;tombstoned?:boolean;
}
export interface PaperWritingLoupeOptions {
 autoAdvance:boolean;autoReturn:boolean;advanceAt:number;overlap:number;lineHeight:number;
 leftMargin:number;rightMargin:number;topMargin:number;bottomMargin:number;
}
export interface PaperWritingLoupeAdvance {region:PaperWritingLoupeRegion;moved:boolean;lineReturned:boolean;pageEnd:boolean}
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const clamp=(value:number,low:number,high:number)=>Math.max(low,Math.min(high,value));
const number=(value:unknown,fallback:number,low:number,high:number)=>clamp(finite(value)?value:fallback,low,high);
function assertPage(page:PaperWritingLoupePage){if(!finite(page.width)||!finite(page.height)||page.width<=0||page.height<=0)throw Error('La page de la loupe est invalide.');}
export function paperWritingLoupeOptions(page:PaperWritingLoupePage,options:Partial<PaperWritingLoupeOptions>={}):PaperWritingLoupeOptions{
 assertPage(page);return {autoAdvance:options.autoAdvance??true,autoReturn:options.autoReturn??true,advanceAt:number(options.advanceAt,.72,.3,.95),overlap:number(options.overlap,.2,0,.6),lineHeight:number(options.lineHeight,page.spacing??28,8,100),leftMargin:number(options.leftMargin,48,0,page.width*.4),rightMargin:number(options.rightMargin,48,0,page.width*.4),topMargin:number(options.topMargin,48,0,page.height*.4),bottomMargin:number(options.bottomMargin,48,0,page.height*.4)};
}
/** Regions alone are bounded. Captured ink samples are never clamped or rescaled after capture. */
export function boundPaperWritingLoupeRegion(page:PaperWritingLoupePage,region:PaperWritingLoupeRegion):PaperWritingLoupeRegion{
 assertPage(page);const width=number(region.width,Math.min(240,page.width),1,page.width),height=number(region.height,Math.min(64,page.height),1,page.height);
 return {x:number(region.x,0,0,page.width-width),y:number(region.y,0,0,page.height-height),width,height,zoom:number(region.zoom,3,1,6)};
}
export function createPaperWritingLoupeRegion(page:PaperWritingLoupePage,viewport:{width:number;height:number},zoom=3,anchor?:{x:number;y:number},options:Partial<PaperWritingLoupeOptions>={}):PaperWritingLoupeRegion{
 const configuration=paperWritingLoupeOptions(page,options),scale=number(zoom,3,1,6),width=number(viewport.width,600,1,10000)/scale,height=number(viewport.height,180,1,10000)/scale;
 return boundPaperWritingLoupeRegion(page,{x:anchor?anchor.x-width/2:configuration.leftMargin,y:anchor?anchor.y-height/2:configuration.topMargin,width,height,zoom:scale});
}
export function movePaperWritingLoupeRegion(page:PaperWritingLoupePage,region:PaperWritingLoupeRegion,dx:number,dy:number):PaperWritingLoupeRegion{
 return boundPaperWritingLoupeRegion(page,{...region,x:region.x+(finite(dx)?dx:0),y:region.y+(finite(dy)?dy:0)});
}
export function samePaperWritingLoupeOwner(captured:PaperWritingLoupeOwner,current:PaperWritingLoupeOwner|null|undefined):boolean{
 return !!current&&!current.tombstoned&&!captured.tombstoned&&current.ownershipKey===captured.ownershipKey&&current.generation===captured.generation&&current.pageId===captured.pageId&&current.pageWidth===captured.pageWidth&&current.pageHeight===captured.pageHeight&&(current.pageRotation??0)===(captured.pageRotation??0);
}
export function paperWritingLoupeContext(owner:PaperWritingLoupeOwner,region:PaperWritingLoupeRegion,clientRect:PaperInkRect,intent:PaperInkIntent):PaperInkContext|null{
 if(owner.tombstoned||!owner.ownershipKey||!owner.pageId||!finite(owner.pageWidth)||!finite(owner.pageHeight)||owner.pageWidth<=0||owner.pageHeight<=0||![clientRect.left,clientRect.top,clientRect.width,clientRect.height,region.x,region.y,region.width,region.height].every(finite)||clientRect.width<=0||clientRect.height<=0||region.width<=0||region.height<=0)return null;
 const a=region.width/clientRect.width,d=region.height/clientRect.height;
 return {...owner,clientRect:{...clientRect},intent,clientToPage:{a,b:0,c:0,d,e:region.x-clientRect.left*a,f:region.y-clientRect.top*d}};
}
export function nextPaperWritingLoupeLine(page:PaperWritingLoupePage,region:PaperWritingLoupeRegion,options:Partial<PaperWritingLoupeOptions>={}):PaperWritingLoupeAdvance{
 const configuration=paperWritingLoupeOptions(page,options),current=boundPaperWritingLoupeRegion(page,region),bottom=Math.max(0,page.height-configuration.bottomMargin-current.height);
 // The last fully visible writing row is terminal. No implicit new page or wrap
 // back to the first row can overwrite a user's already written paragraph.
 if(current.y+configuration.lineHeight>bottom+.001)return {region:current,moved:false,lineReturned:false,pageEnd:true};
 const next=boundPaperWritingLoupeRegion(page,{...current,x:configuration.leftMargin,y:current.y+configuration.lineHeight});
 return {region:next,moved:next.x!==current.x||next.y!==current.y,lineReturned:true,pageEnd:false};
}
export function advancePaperWritingLoupe(page:PaperWritingLoupePage,region:PaperWritingLoupeRegion,points:readonly InkPoint[],options:Partial<PaperWritingLoupeOptions>={}):PaperWritingLoupeAdvance{
 const configuration=paperWritingLoupeOptions(page,options),current=boundPaperWritingLoupeRegion(page,region),unchanged={region:current,moved:false,lineReturned:false,pageEnd:false};
 if(!configuration.autoAdvance||!points.length)return unchanged;
 const right=points.reduce((max,p)=>finite(p.x)?Math.max(max,p.x):max,-Infinity),edge=Math.max(configuration.leftMargin,page.width-configuration.rightMargin),threshold=Math.min(current.x+current.width*configuration.advanceAt,edge-current.width*(1-configuration.advanceAt));
 if(right<threshold)return unchanged;
 if(current.x+current.width>=edge-.001){return configuration.autoReturn?nextPaperWritingLoupeLine(page,current,configuration):unchanged;}
 const next=boundPaperWritingLoupeRegion(page,{...current,x:Math.min(Math.max(current.x,edge-current.width),Math.max(current.x+current.width*(1-configuration.overlap),right-current.width*configuration.overlap))});
 return {...unchanged,region:next,moved:next.x!==current.x};
}
/** The same input engine as the page. The loupe adds only its inverse viewport transform. */
export function createPaperWritingLoupeInput(){
 const ink=createPaperInkInput();let captured:PaperWritingLoupeOwner|null=null;
 const context=(owner:PaperWritingLoupeOwner|null,region:PaperWritingLoupeRegion,rect:PaperInkRect,intent:PaperInkIntent)=>owner?paperWritingLoupeContext(owner,region,rect,intent):null;
 const invalid=(owner:PaperWritingLoupeOwner|null)=>captured&&!samePaperWritingLoupeOwner(captured,owner);
 const cancel=(reason:Parameters<typeof ink.cancel>[0]='cancelled')=>{captured=null;return ink.cancel(reason);};
 return {
  begin(event:PaperInkEvent,owner:PaperWritingLoupeOwner|null,region:PaperWritingLoupeRegion,rect:PaperInkRect,intent:PaperInkIntent,policy:PaperInkPolicy={}):PaperInkResult{
   if(invalid(owner))return cancel('owner-changed');const value=context(owner,region,rect,intent);if(!value)return {status:'ignored' as const,accepted:false,added:0,reason:'invalid-context' as const};
   const result=ink.begin(event,value,policy);if(result.status==='cancelled')captured=null;else if(result.accepted&&result.stroke)captured={...owner!};return result;
  },
  append(event:PaperInkEvent,owner:PaperWritingLoupeOwner|null,region:PaperWritingLoupeRegion,rect:PaperInkRect,intent:PaperInkIntent,coalesced:readonly PaperInkEvent[]=[]):PaperInkResult{
   if(invalid(owner))return cancel('owner-changed');const value=context(owner,region,rect,intent);if(!value)return cancel('invalid-context');const result=ink.append(event,value,coalesced);if(result.status==='cancelled')captured=null;return result;
  },
  finish(event:PaperInkEvent,owner:PaperWritingLoupeOwner|null,region:PaperWritingLoupeRegion,rect:PaperInkRect,intent:PaperInkIntent,wasCancelled=false):PaperInkResult{
   if(invalid(owner))return cancel('owner-changed');const value=context(owner,region,rect,intent);if(!value)return cancel('invalid-context');const result=ink.finish(event,value,wasCancelled);if(result.status!=='ignored')captured=null;return result;
  },cancel,snapshot:ink.snapshot,
 };
}
