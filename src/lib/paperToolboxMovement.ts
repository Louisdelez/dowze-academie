export interface PaperToolboxPoint {x:number;y:number}
export interface PaperToolboxMovementBounds {left:number;top:number;width:number;height:number;toolWidth:number;toolHeight:number}
/** Note-local presentation coordinates only; invalid or invisible geometry
 * refuses rather than acquiring a window-level placement. */
export function constrainPaperToolbox(point:PaperToolboxPoint,bounds:PaperToolboxMovementBounds):PaperToolboxPoint|null {
 if(![point.x,point.y].every(Number.isFinite)||!Object.values(bounds).every(Number.isFinite)||bounds.width<=0||bounds.height<=0||bounds.toolWidth<=0||bounds.toolHeight<=0||bounds.toolWidth>bounds.width||bounds.toolHeight>bounds.height)return null;
 return {x:Math.max(bounds.left,Math.min(bounds.left+bounds.width-bounds.toolWidth,point.x)),y:Math.max(bounds.top,Math.min(bounds.top+bounds.height-bounds.toolHeight,point.y))};
}
export function paperToolboxKeyPoint(point:PaperToolboxPoint,key:string,large=false):PaperToolboxPoint|null {
 if(![point.x,point.y].every(Number.isFinite))return null;const step=large?48:16;
 switch(key){case 'ArrowLeft':return {x:point.x-step,y:point.y};case 'ArrowRight':return {x:point.x+step,y:point.y};case 'ArrowUp':return {x:point.x,y:point.y-step};case 'ArrowDown':return {x:point.x,y:point.y+step};default:return null;}
}
