/** UI geometry only. Coordinates here are viewport CSS pixels; no document,
 * input, history, storage or global-window placement is retained. */
export interface PaperToolboxRect {left:number;top:number;width:number;height:number}
export interface PaperToolboxPopoverPlacement extends PaperToolboxRect {maximumWidth:number;maximumHeight:number}
const valid=(r:PaperToolboxRect)=>[r.left,r.top,r.width,r.height].every(Number.isFinite)&&r.width>0&&r.height>0;
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
export function paperToolboxVisibleBounds(note:PaperToolboxRect,viewport:PaperToolboxRect):PaperToolboxRect|null {
 if(!valid(note)||!valid(viewport))return null;
 const left=Math.max(note.left,viewport.left),top=Math.max(note.top,viewport.top);
 const right=Math.min(note.left+note.width,viewport.left+viewport.width),bottom=Math.min(note.top+note.height,viewport.top+viewport.height);
 return right>left&&bottom>top?{left,top,width:right-left,height:bottom-top}:null;
}
export function placePaperToolboxPopover(input:{note:PaperToolboxRect;viewport:PaperToolboxRect;anchor:PaperToolboxRect;preferredWidth:number;preferredHeight:number;align?:'start'|'end'}):PaperToolboxPopoverPlacement|null {
 const bounds=paperToolboxVisibleBounds(input.note,input.viewport);
 if(!bounds||!valid(input.anchor)||!Number.isFinite(input.preferredWidth)||!Number.isFinite(input.preferredHeight)||input.preferredWidth<=0||input.preferredHeight<=0)return null;
 const inset=Math.min(8,bounds.width/4,bounds.height/4),left=bounds.left+inset,top=bounds.top+inset;
 const maximumWidth=bounds.width-2*inset,maximumHeight=bounds.height-2*inset;
 const width=Math.min(input.preferredWidth,maximumWidth),height=Math.min(input.preferredHeight,maximumHeight);
 const x=input.align==='start'?input.anchor.left:input.anchor.left+input.anchor.width-width;
 const below=input.anchor.top+input.anchor.height+6,above=input.anchor.top-height-6;
 const y=below+height<=top+maximumHeight?below:above>=top?above:below;
 return {left:clamp(x,left,left+maximumWidth-width),top:clamp(y,top,top+maximumHeight-height),width,height,maximumWidth,maximumHeight};
}
/** Convert a viewport point to an absolutely positioned child of this note.
 * The host's own scroll and border are included. No window-relative fallback. */
export function paperToolboxLocalPoint(point:{left:number;top:number},host:{left:number;top:number;scaleX:number;scaleY:number;clientLeft:number;clientTop:number;scrollLeft:number;scrollTop:number}):{left:number;top:number}|null {
 if(!Object.values(point).every(Number.isFinite)||!Object.values(host).every(Number.isFinite)||host.scaleX<=0||host.scaleY<=0)return null;
 return {left:(point.left-host.left)/host.scaleX-host.clientLeft+host.scrollLeft,top:(point.top-host.top)/host.scaleY-host.clientTop+host.scrollTop};
}
