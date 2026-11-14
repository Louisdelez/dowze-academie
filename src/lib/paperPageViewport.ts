/** Pure N067 geometry. These helpers do not mount an editor or change a document.
 * Logical offsets may exceed browser scroll limits: use the bounded projection,
 * rebase physical scroll in a layout transaction, and keep page input leases and
 * focused/composing editors pinned. A distant pinned page must be parked without
 * unmounting its controller; physicalTop=null is deliberately not a CSS offset. */
export const MAX_PAPER_VIEWPORT_PAGES=2_000;
export const MAX_PAPER_VIEWPORT_PAGE_EXTENT=600_000;
export const MAX_PAPER_VIEWPORT_PHYSICAL_EXTENT=8_000_000;
export const MAX_PAPER_VIEWPORT_MOUNTED_PAGES=32;
export const MAX_PAPER_VIEWPORT_PINNED_PAGES=16;
export type PaperPageViewportMode='continuous'|'single';
export interface PaperPageViewportPage {readonly id:string;readonly width:number;readonly height:number}
export interface PaperPageViewportSlot {
 readonly pageId:string;readonly key:string;readonly index:number;
 readonly pageWidth:number;readonly pageHeight:number;
 readonly scaledWidth:number;readonly scaledHeight:number;readonly top:number;readonly bottom:number;
}
export interface PaperPageViewportLayout {
 readonly zoom:number;readonly gap:number;readonly slots:readonly PaperPageViewportSlot[];
 readonly totalHeight:number;readonly maxWidth:number;
}
export interface PaperPageViewportAnchor {readonly pageId:string;readonly pageY:number;readonly viewportOffset:number}
export type PaperPageViewportAnchorInput=
 | {readonly mode:'continuous';readonly logicalScroll:number;readonly viewportOffset?:number}
 | {readonly mode:'single';readonly pageId:string;readonly pageScroll:number;readonly viewportOffset?:number};
export interface PaperPageViewportRestoredAnchor {
 readonly mode:PaperPageViewportMode;readonly pageId:string;readonly logicalScroll:number;readonly pageScroll:number;
 readonly anchor:PaperPageViewportAnchor;readonly usedFallback:boolean;
}
export interface PaperPageViewportWindowOptions {
 readonly logicalScroll:number;readonly viewportHeight:number;readonly overscan?:number;readonly maxMountedPages?:number;
 readonly pinnedContactPageIds?:readonly string[];readonly pinnedEditorPageIds?:readonly string[];readonly pinnedPageIds?:readonly string[];
}
export interface PaperPageViewportProjectedSlot extends PaperPageViewportSlot {
 readonly physicalTop:number|null;readonly visible:boolean;readonly mounted:boolean;readonly pinned:boolean;readonly parked:boolean;
}
export interface PaperPageViewportWindow {
 readonly logicalScroll:number;readonly originOffset:number;readonly physicalScroll:number;readonly physicalExtent:number;
 readonly overscan:number;readonly visiblePageIds:readonly string[];readonly mountedPageIds:readonly string[];
 readonly slots:readonly PaperPageViewportProjectedSlot[];
}
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const fail=(message:string):never=>{throw new RangeError(message);};
const clamp=(value:number,low:number,high:number)=>Math.max(low,Math.min(high,value));
const pageId=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=200;
function requireFinite(value:unknown,name:string):number {if(!finite(value))return fail(`${name} doit être fini.`);return value;}
function viewportHeight(value:number):number {
 requireFinite(value,'La hauteur du viewport');
 if(value<=0||value>MAX_PAPER_VIEWPORT_PAGE_EXTENT)return fail('La hauteur du viewport dépasse la fenêtre prise en charge.');return value;
}
function viewportOffset(value:number):number {
 requireFinite(value,'La position dans le viewport');
 if(Math.abs(value)>MAX_PAPER_VIEWPORT_PHYSICAL_EXTENT)return fail('La position dans le viewport dépasse la précision prise en charge.');return value;
}
function mode(value:PaperPageViewportMode):PaperPageViewportMode {if(value!=='continuous'&&value!=='single')return fail('Mode de pages inconnu.');return value;}
function slotById(layout:PaperPageViewportLayout,id:string):PaperPageViewportSlot|undefined {return layout.slots.find(slot=>slot.pageId===id);}
/** First page ending strictly after an offset. Gaps select the following page. */
function slotAt(layout:PaperPageViewportLayout,offset:number):PaperPageViewportSlot {
 let low=0,high=layout.slots.length;
 while(low<high){const middle=(low+high)>>>1;if(layout.slots[middle].bottom<=offset)low=middle+1;else high=middle;}
 return layout.slots[Math.min(low,layout.slots.length-1)];
}
/** Snapshot only public page geometry. Keys use page IDs and survive reordering. */
export function createPaperPageViewportLayout(pages:readonly PaperPageViewportPage[],options:{readonly zoom:number;readonly gap?:number}):PaperPageViewportLayout {
 if(!Array.isArray(pages)||!pages.length||pages.length>MAX_PAPER_VIEWPORT_PAGES)return fail('Le viewport accepte de 1 à 2000 pages.');
 const zoom=requireFinite(options.zoom,'Le zoom'),gap=requireFinite(options.gap??24,'L’espace entre pages');
 if(zoom<=0||gap<0||gap>MAX_PAPER_VIEWPORT_PAGE_EXTENT)return fail('Zoom ou espace entre pages invalide.');
 const ids=new Set<string>(),slots:PaperPageViewportSlot[]=[];let top=0,maxWidth=0;
 for(let index=0;index<pages.length;index++){
  const page=pages[index];
  if(!page||!pageId(page.id)||ids.has(page.id)||!finite(page.width)||!finite(page.height)||page.width<=0||page.height<=0)return fail('Chaque page demande une identité unique et des dimensions positives finies.');
  ids.add(page.id);const scaledWidth=page.width*zoom,scaledHeight=page.height*zoom;
  if(!finite(scaledWidth)||!finite(scaledHeight)||scaledWidth<=0||scaledHeight<=0||scaledWidth>MAX_PAPER_VIEWPORT_PAGE_EXTENT||scaledHeight>MAX_PAPER_VIEWPORT_PAGE_EXTENT)return fail('Une page dépasse les dimensions physiques prises en charge.');
  const bottom=top+scaledHeight;if(!finite(bottom)||bottom<=top||bottom>Number.MAX_SAFE_INTEGER)return fail('La position logique d’une page n’est pas représentable.');
  slots.push(Object.freeze({pageId:page.id,key:page.id,index,pageWidth:page.width,pageHeight:page.height,scaledWidth,scaledHeight,top,bottom}));maxWidth=Math.max(maxWidth,scaledWidth);
  if(index+1<pages.length){const next=bottom+gap;if(!finite(next)||(gap>0&&next<=bottom)||next>Number.MAX_SAFE_INTEGER)return fail('L’espace logique entre pages n’est pas représentable.');top=next;}
 }
 return Object.freeze({zoom,gap,slots:Object.freeze(slots),totalHeight:slots.at(-1)!.bottom,maxWidth});
}
/** Capture a canonical page coordinate, not an index or a raw scrollTop. */
export function capturePaperPageViewportAnchor(layout:PaperPageViewportLayout,input:PaperPageViewportAnchorInput):PaperPageViewportAnchor {
 const offset=viewportOffset(input.viewportOffset??0);let slot:PaperPageViewportSlot,scroll:number,point:number;
 if(mode(input.mode)==='continuous'){
  scroll=clamp(requireFinite((input as Extract<PaperPageViewportAnchorInput,{mode:'continuous'}>).logicalScroll,'Le défilement logique'),0,layout.totalHeight);
  const target=scroll+offset;if(!finite(target))return fail('La position logique de l’ancre n’est pas représentable.');
  slot=slotAt(layout,clamp(target,0,layout.totalHeight));point=clamp(target,slot.top,slot.bottom);
  return Object.freeze({pageId:slot.pageId,pageY:(point-slot.top)/layout.zoom,viewportOffset:viewportOffset(point-scroll)});
 }
 const single=input as Extract<PaperPageViewportAnchorInput,{mode:'single'}>;
 slot=slotById(layout,single.pageId)??fail('La page unique ne fait plus partie du document.');
 scroll=clamp(requireFinite(single.pageScroll,'Le défilement de la page'),0,slot.scaledHeight);point=clamp(scroll+offset,0,slot.scaledHeight);
 return Object.freeze({pageId:slot.pageId,pageY:point/layout.zoom,viewportOffset:point-scroll});
}
function replacementSlot(layout:PaperPageViewportLayout,id:string,previous:PaperPageViewportLayout|undefined):{slot:PaperPageViewportSlot;atEnd:boolean} {
 const original=previous?.slots.findIndex(slot=>slot.pageId===id)??-1;
 const byId=new Map(layout.slots.map(slot=>[slot.pageId,slot]));
 if(previous&&original>=0){
  for(let index=original+1;index<previous.slots.length;index++){const slot=byId.get(previous.slots[index].pageId);if(slot)return {slot,atEnd:false};}
  for(let index=original-1;index>=0;index--){const slot=byId.get(previous.slots[index].pageId);if(slot)return {slot,atEnd:true};}
 }
 return {slot:layout.slots[0],atEnd:false};
}
/** Removed page: next surviving old neighbor, then previous, then the first new
 * page. A resized surviving page clamps pageY. Neither case issues a command. */
export function restorePaperPageViewportAnchor(anchor:PaperPageViewportAnchor,layout:PaperPageViewportLayout,options:{readonly mode:PaperPageViewportMode;readonly viewportHeight:number;readonly previousLayout?:PaperPageViewportLayout}):PaperPageViewportRestoredAnchor {
 if(!anchor||!pageId(anchor.pageId)||!finite(anchor.pageY)||anchor.pageY<0)return fail('Ancre de page invalide.');
 const selectedMode=mode(options.mode),height=viewportHeight(options.viewportHeight),offset=viewportOffset(anchor.viewportOffset),existing=slotById(layout,anchor.pageId),fallback=existing?undefined:replacementSlot(layout,anchor.pageId,options.previousLayout),slot=existing??fallback!.slot;
 const pageY=existing?Math.min(anchor.pageY,slot.pageHeight):fallback!.atEnd?slot.pageHeight:0,point=pageY*layout.zoom;
 const logicalScroll=clamp(slot.top+point-offset,0,Math.max(0,layout.totalHeight-height)),pageScroll=clamp(point-offset,0,Math.max(0,slot.scaledHeight-height));
 const actualOffset=(selectedMode==='continuous'?slot.top+point-logicalScroll:point-pageScroll);
 return Object.freeze({mode:selectedMode,pageId:slot.pageId,logicalScroll,pageScroll,anchor:Object.freeze({pageId:slot.pageId,pageY,viewportOffset:actualOffset}),usedFallback:!existing});
}
function pinnedIds(layout:PaperPageViewportLayout,options:PaperPageViewportWindowOptions):Set<string> {
 const known=new Set(layout.slots.map(slot=>slot.pageId)),ids=new Set<string>();
 for(const list of [options.pinnedContactPageIds,options.pinnedEditorPageIds,options.pinnedPageIds]){
  if(list===undefined)continue;if(!Array.isArray(list)||list.length>MAX_PAPER_VIEWPORT_PINNED_PAGES)return fail('Trop de pages épinglées.');
  for(const id of list){if(!pageId(id))return fail('Identité de page épinglée invalide.');if(known.has(id))ids.add(id);}
 }
 if(ids.size>MAX_PAPER_VIEWPORT_PINNED_PAGES)return fail('Trop de pages épinglées.');return ids;
}
/** The logical document stays intact. At most maxMountedPages unpinned readers
 * and 16 pinned controllers are mounted; remaining visible slots are placeholders
 * requiring synchronous input acquisition by the future editable surface. */
export function projectPaperPageViewportWindow(layout:PaperPageViewportLayout,options:PaperPageViewportWindowOptions):PaperPageViewportWindow {
 const height=viewportHeight(options.viewportHeight),scroll=clamp(requireFinite(options.logicalScroll,'Le défilement logique'),0,Math.max(0,layout.totalHeight-height)),requestedOverscan=requireFinite(options.overscan??height,'L’overscan'),limit=options.maxMountedPages??8;
 if(requestedOverscan<0||!Number.isInteger(limit)||limit<1||limit>MAX_PAPER_VIEWPORT_MOUNTED_PAGES)return fail('Fenêtre de pages invalide.');
 const overscan=Math.min(requestedOverscan,(MAX_PAPER_VIEWPORT_PHYSICAL_EXTENT-height-2*MAX_PAPER_VIEWPORT_PAGE_EXTENT)/2),start=Math.max(0,scroll-overscan),end=Math.min(layout.totalHeight,scroll+height+overscan),pins=pinnedIds(layout,options);
 const nearby=layout.slots.filter(slot=>slot.bottom>start&&slot.top<end),nearIds=new Set(nearby.map(slot=>slot.pageId)),visible=nearby.filter(slot=>slot.bottom>scroll&&slot.top<scroll+height),visibleIds=new Set(visible.map(slot=>slot.pageId));
 // Keep bounded scroll reserve through empty gaps as well as rendered pages.
 // Otherwise a short first page followed by a large valid gap produces a
 // viewport-height spacer and native scrolling can never reach the next page.
 const scrollReserve=Math.max(height,overscan),reserveStart=Math.max(0,scroll-scrollReserve),reserveEnd=Math.min(layout.totalHeight,scroll+height+scrollReserve);
 const originOffset=Math.min(reserveStart,nearby[0]?.top??reserveStart),last=Math.max(reserveEnd,nearby.at(-1)?.bottom??reserveEnd),physicalExtent=Math.max(height,last-originOffset),physicalScroll=scroll-originOffset;
 if(!finite(physicalExtent)||physicalExtent>MAX_PAPER_VIEWPORT_PHYSICAL_EXTENT||!finite(physicalScroll)||physicalScroll<0||physicalScroll>physicalExtent-height)return fail('La fenêtre physique n’est pas représentable.');
 const center=scroll+height/2,distance=(slot:PaperPageViewportSlot)=>center<slot.top?slot.top-center:center>slot.bottom?center-slot.bottom:0;
 const candidates=nearby.filter(slot=>!pins.has(slot.pageId)).sort((a,b)=>Number(visibleIds.has(b.pageId))-Number(visibleIds.has(a.pageId))||distance(a)-distance(b)||a.index-b.index),mounted=new Set([...pins,...candidates.slice(0,limit).map(slot=>slot.pageId)]);
 const slots=layout.slots.filter(slot=>nearIds.has(slot.pageId)||pins.has(slot.pageId)).map(slot=>Object.freeze({...slot,physicalTop:nearIds.has(slot.pageId)?slot.top-originOffset:null,visible:visibleIds.has(slot.pageId),mounted:mounted.has(slot.pageId),pinned:pins.has(slot.pageId),parked:!nearIds.has(slot.pageId)}));
 return Object.freeze({logicalScroll:scroll,originOffset,physicalScroll,physicalExtent,overscan,visiblePageIds:Object.freeze(visible.map(slot=>slot.pageId)),mountedPageIds:Object.freeze(slots.filter(slot=>slot.mounted).map(slot=>slot.pageId)),slots:Object.freeze(slots)});
}
