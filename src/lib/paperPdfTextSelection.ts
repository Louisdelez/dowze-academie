export interface PaperPdfPoint {x:number;y:number}
export type PaperPdfQuad=[PaperPdfPoint,PaperPdfPoint,PaperPdfPoint,PaperPdfPoint];
export interface PaperPdfTextFragment {
 itemIndex:number;from:number;to:number;text:string;quad:PaperPdfQuad;
 start:PaperPdfPoint;end:PaperPdfPoint;thickness:number;
}
export interface PaperPdfTextSelection {
 kind:'pdf';pageId:string;assetId:string;pdfPageNumber:number;source:string;
 pageWidth:number;pageHeight:number;rotation:number;text:string;
 fragments:PaperPdfTextFragment[];isCurrent:()=>boolean;
}
export interface PaperPdfSelectionCommand {id:string;type:'start'|'end'|'confirm'|'cancel'|'all'}
export interface PaperPdfTextItem {
 str:string;dir:string;transform:number[];width:number;height:number;fontName:string;hasEOL?:boolean;
}
export interface PaperPdfTextGeometry {
 width:number;height:number;transform:number[];
 styles:Record<string,{vertical?:boolean}>;
}
export interface PaperPdfTextRange {itemIndex:number;from:number;to:number}
export interface PaperPdfTextEndpoint {itemIndex:number;offset:number}
export interface PaperPdfGlyphBox {left:number;top:number;width:number;height:number}
const finiteBox=(box:PaperPdfGlyphBox)=>[box.left,box.top,box.width,box.height].every(Number.isFinite)&&box.width>0&&box.height>0;
export function paperPdfGuidedRanges(items:readonly PaperPdfTextItem[],anchor:PaperPdfTextEndpoint,focus:PaperPdfTextEndpoint):PaperPdfTextRange[]{
 for(const point of [anchor,focus])if(!Number.isSafeInteger(point.itemIndex)||!Number.isSafeInteger(point.offset)||point.itemIndex<0||point.itemIndex>=items.length||point.offset<0||point.offset>items[point.itemIndex].str.length)throw Error('Choisissez un début et une fin dans le texte de cette page.');
 const [start,end]=anchor.itemIndex<focus.itemIndex||anchor.itemIndex===focus.itemIndex&&anchor.offset<=focus.offset?[anchor,focus]:[focus,anchor],ranges:PaperPdfTextRange[]=[];
 for(let index=start.itemIndex;index<=end.itemIndex;index++){const from=index===start.itemIndex?start.offset:0,to=index===end.itemIndex?end.offset:items[index].str.length;if(to>from){ranges.push({itemIndex:index,from,to});if(ranges.length>1000)throw Error('Sélectionnez ce passage en parties plus courtes.');}}return ranges;
}
/** A run keeps its own oriented glyph rectangle. Selection never bridges a
 * line/column gap, and no pointer pressure/tilt/timestamp is manufactured. */
export function paperPdfGlyphFragment(item:PaperPdfTextItem,itemIndex:number,from:number,to:number,geometry:PaperPdfTextGeometry,fullPageBox:PaperPdfGlyphBox,fullGlyphBox:PaperPdfGlyphBox,selectedGlyphBox:PaperPdfGlyphBox,scaleX=1,minFontSize=1):PaperPdfTextFragment|undefined{
 if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from<0||to>item.str.length||to<=from||!finiteBox(fullPageBox)||!finiteBox(fullGlyphBox)||!finiteBox(selectedGlyphBox)||![scaleX,minFontSize].every(value=>Number.isFinite(value)&&value>0)||geometry.transform.length!==6||item.transform.length!==6||!geometry.transform.every(Number.isFinite)||!item.transform.every(Number.isFinite))return undefined;
 const [a,b,c,d]=geometry.transform,[x,y,nx,ny]=item.transform,basis={x:a*x+c*y,y:b*x+d*y},normal={x:a*nx+c*ny,y:b*nx+d*ny},basisLength=Math.hypot(basis.x,basis.y),normalLength=Math.hypot(normal.x,normal.y);
 // PDF.js lays out TextLayer spans with rotate/scaleX. A sheared source matrix
 // needs an affine quad renderer; silently inventing a rectangle would mispaint.
 if(!(basisLength>0&&normalLength>0)||Math.abs((basis.x*normal.x+basis.y*normal.y)/(basisLength*normalLength))>1e-4)return undefined;
 const angle=Math.atan2(basis.y,basis.x)+(geometry.styles[item.fontName]?.vertical?Math.PI/2:0),u={x:Math.cos(angle),y:Math.sin(angle)},n={x:-u.y,y:u.x},length=fullGlyphBox.width*scaleX/minFontSize,thickness=selectedGlyphBox.height/minFontSize,fullHeight=fullGlyphBox.height/minFontSize,centre={x:fullPageBox.left+fullPageBox.width/2,y:fullPageBox.top+fullPageBox.height/2},origin={x:centre.x-u.x*length/2-n.x*fullHeight/2,y:centre.y-u.y*length/2-n.y*fullHeight/2},advance=(selectedGlyphBox.left-fullGlyphBox.left)*scaleX/minFontSize,down=(selectedGlyphBox.top-fullGlyphBox.top)/minFontSize,width=selectedGlyphBox.width*scaleX/minFontSize;
 const point=(along:number,across:number):PaperPdfPoint=>({x:origin.x+u.x*along+n.x*across,y:origin.y+u.y*along+n.y*across}),quad:PaperPdfQuad=[point(advance,down),point(advance+width,down),point(advance+width,down+thickness),point(advance,down+thickness)],epsilon=.75;
 if(!quad.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=-epsilon&&p.x<=geometry.width+epsilon&&p.y>=-epsilon&&p.y<=geometry.height+epsilon)||!(width>0&&thickness>0))return undefined;
 return {itemIndex,from,to,text:item.str.slice(from,to),quad,start:point(advance,down+thickness/2),end:point(advance+width,down+thickness/2),thickness};
}
/** Exact DOM positions, not text searches: repeated words stay distinct. */
export function paperPdfSelectedRanges(selection:Selection,divs:readonly HTMLElement[],items:readonly PaperPdfTextItem[],limit=1000):PaperPdfTextRange[]{
 if(selection.isCollapsed||!selection.rangeCount)return [];if(divs.length!==items.length||divs.length>20000||selection.rangeCount>32)throw Error('Cette page contient trop de texte pour une sélection guidée immédiate.');
 const result:PaperPdfTextRange[]=[];
 for(let index=0;index<divs.length;index++){const div=divs[index];if(!items[index].str||!div.isConnected||div.textContent!==items[index].str)continue;const text=div.firstChild;if(!text||text.nodeType!==3||div.childNodes.length!==1)continue;
  for(let r=0;r<selection.rangeCount;r++){const selected=selection.getRangeAt(r);if(!selected.intersectsNode(div))continue;const full=div.ownerDocument.createRange();full.selectNodeContents(div);const clipped=selected.cloneRange();if(clipped.compareBoundaryPoints(0,full)<0)clipped.setStart(text,0);if(clipped.compareBoundaryPoints(2,full)>0)clipped.setEnd(text,items[index].str.length);const before=div.ownerDocument.createRange();before.setStart(text,0);before.setEnd(clipped.startContainer,clipped.startOffset);const from=before.toString().length,to=from+clipped.toString().length;before.detach();full.detach();clipped.detach();if(to>from){result.push({itemIndex:index,from,to});if(result.length>limit)throw Error('Sélectionnez ce passage en parties plus courtes.');}}
 }
 return result;
}
/** Detached typography only: no source TextLayer node, user selection or
 * viewport is modified while measuring shaped/RTL/ligature character ranges. */
export function measurePaperPdfGlyphRanges(frame:HTMLElement,divs:readonly HTMLElement[],items:readonly PaperPdfTextItem[],ranges:readonly PaperPdfTextRange[],geometry:PaperPdfTextGeometry):PaperPdfTextFragment[]{
 const frameBox=frame.getBoundingClientRect(),zoomX=frameBox.width/geometry.width,zoomY=frameBox.height/geometry.height;if(!(zoomX>0&&zoomY>0))return [];
 const host=frame.ownerDocument.createElement('div');host.style.cssText='position:fixed;left:-30000px;top:0;pointer-events:none;white-space:pre;';frame.ownerDocument.body.append(host);
 try{const fragments:PaperPdfTextFragment[]=[];for(const selection of ranges){const span=divs[selection.itemIndex],item=items[selection.itemIndex];if(!span||!item||span.textContent!==item.str)throw Error('Le texte PDF a changé pendant la sélection.');const style=getComputedStyle(span),clone=frame.ownerDocument.createElement('span');clone.style.cssText='display:inline-block;position:relative;white-space:pre;transform:none;';clone.style.font=style.font;clone.style.lineHeight=style.lineHeight;clone.style.letterSpacing=style.letterSpacing;clone.style.wordSpacing=style.wordSpacing;clone.style.fontKerning=style.fontKerning;clone.style.fontFeatureSettings=style.fontFeatureSettings;clone.dir=span.dir;clone.textContent=item.str;host.replaceChildren(clone);
   const original=frame.ownerDocument.createRange();original.selectNodeContents(span);const actual=original.getBoundingClientRect();original.detach();const full=frame.ownerDocument.createRange();full.selectNodeContents(clone);const fullGlyph=full.getBoundingClientRect();full.detach();const selected=frame.ownerDocument.createRange();selected.setStart(clone.firstChild!,selection.from);selected.setEnd(clone.firstChild!,selection.to);const boxes=[...selected.getClientRects()].filter(finiteBox);selected.detach();
   for(const box of boxes){const fragment=paperPdfGlyphFragment(item,selection.itemIndex,selection.from,selection.to,geometry,{left:(actual.left-frameBox.left)/zoomX,top:(actual.top-frameBox.top)/zoomY,width:actual.width/zoomX,height:actual.height/zoomY},fullGlyph,box,parseFloat(style.getPropertyValue('--scale-x'))||1,parseFloat(style.getPropertyValue('--min-font-size'))||1);if(!fragment)throw Error('L’orientation de ce passage PDF demande une sélection libre. Son original reste conservé.');fragments.push(fragment);if(fragments.length>1000)throw Error('Sélectionnez ce passage en parties plus courtes.');}
  }return fragments;
 }finally{host.remove();}
}
