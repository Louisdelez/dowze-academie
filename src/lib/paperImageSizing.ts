import {fromMarkdown} from 'mdast-util-from-markdown';
import {gfm} from 'micromark-extension-gfm';
import {gfmFromMarkdown} from 'mdast-util-gfm';
import {math} from 'micromark-extension-math';
import {mathFromMarkdown} from 'mdast-util-math';
import type {Root} from 'mdast';

interface ImageNode {type:string;url?:string;alt?:string;title?:string|null;identifier?:string;value?:string;children?:ImageNode[];position?:{start:{offset?:number};end:{offset?:number}}}
export interface PaperImageRatio {from:number;to:number;url:string;alt:string;title:string|null;ratio:number;markerFrom:number;markerTo:number}
export const validPaperImageRatio=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=10000;
const marker=/^<!-- dowze-image-size:v1 ratio=(\d+(?:\.\d+)?) -->$/;
export function paperImageRatioMarker(value:unknown):number|undefined{
 const match=typeof value==='string'?marker.exec(value):null,ratio=match&&match[0]===value?Number(match[1]):undefined;return validPaperImageRatio(ratio)?ratio:undefined;
}
/** Only a semantic image and its immediately following exact marker belong
 * together, inline or after a complete image block. Descriptions, ordinary HTML,
 * code and maths do not provide size evidence. Markdown is never rewritten. */
export function parsePaperImageRatios(markdown:string):PaperImageRatio[]{
 const tree=fromMarkdown(markdown,{extensions:[gfm(),math()],mdastExtensions:[gfmFromMarkdown(),mathFromMarkdown()]}) as unknown as ImageNode,definitions=new Map<string,ImageNode>(),ratios:PaperImageRatio[]=[];
 const visit=(node:ImageNode,fn:(node:ImageNode)=>void)=>{fn(node);node.children?.forEach(child=>visit(child,fn));};
 visit(tree,node=>{if(node.type==='definition'&&node.identifier&&!definitions.has(node.identifier))definitions.set(node.identifier,node);});
 const walk=(parent:ImageNode)=>{const children=parent.children??[];for(let i=0;i<children.length;i++){
  const block=children[i],image=block.type==='paragraph'&&block.children?.length===1?block.children[0]:block,next=children[i+1],html=next?.type==='paragraph'&&next.children?.length===1?next.children[0]:next;
  if(image&&(image.type==='image'||image.type==='imageReference')&&html?.type==='html'){
   const ratio=paperImageRatioMarker(html.value),definition=image.type==='imageReference'&&image.identifier?definitions.get(image.identifier):undefined,url=image.type==='image'?image.url:definition?.url,from=image.position?.start.offset,to=image.position?.end.offset,markerFrom=html.position?.start.offset,markerTo=html.position?.end.offset;
   if(validPaperImageRatio(ratio)&&url!==undefined&&[from,to,markerFrom,markerTo].every(Number.isSafeInteger)&&from!<to!&&to!<=markerFrom!&&markerTo!<=markdown.length)ratios.push({from:from!,to:to!,url,alt:image.alt??'',title:(image.type==='image'?image.title:definition?.title)??null,ratio,markerFrom:markerFrom!,markerTo:markerTo!});
  }
  walk(block);
 }};walk(tree);return ratios;
}
export function paperImageRatioAt(ratios:readonly PaperImageRatio[],from:number|undefined,to:number|undefined,url:string,alt:string|undefined,title:string|undefined):number{
 return ratios.find(row=>row.from===from&&row.to===to&&row.url===url&&row.alt===(alt??'')&&row.title===(title??null))?.ratio??1;
}
/** A structural page boundary cannot detach hidden size metadata from the
 * original image. Boundaries at the image start keep the whole pair following. */
export function paperImagePageOffsets(ratios:readonly PaperImageRatio[],offsets:readonly number[]):number[]{
 return offsets.map(offset=>ratios.reduce((value,row)=>value>row.from&&value<row.markerTo?row.markerTo:value,offset));
}
/** Remove recognized sizing controls only from this reader's presentation AST.
 * ReactMarkdown otherwise displays HTML comments as literal text. Every other
 * HTML node and every canonical source offset remain intact. */
export function remarkPaperImageRatioPresentation({ratios}:{ratios:readonly PaperImageRatio[]}){
 const approved=new Set(ratios.map(row=>`${row.markerFrom}:${row.markerTo}`));
 return (tree:Root)=>{const walk=(parent:ImageNode):boolean=>{if(!parent.children)return false;let removed=false;parent.children=parent.children.filter(child=>{if(child.type==='html'&&approved.has(`${child.position?.start.offset}:${child.position?.end.offset}`)){removed=true;return false;}const nested=walk(child);if(nested&&child.type==='paragraph'&&child.children?.length===0){removed=true;return false;}return true;});return removed;};walk(tree as unknown as ImageNode);};
}
/** The ratio is relative to the original at the available width. Sheet height
 * is a presentation cap, never a different ratio origin. Both dimensions are
 * capped together so wide originals keep their aspect ratio. */
export function paperImageDimensions(naturalWidth:number,naturalHeight:number,availableWidth:number,ratio:number,maxHeight=Infinity):{baseHeight:number;width:number;height:number}|undefined{
 if(![naturalWidth,naturalHeight,availableWidth].every(value=>Number.isFinite(value)&&value>0)||!(maxHeight>0))return undefined;
 const widthHeight=availableWidth*naturalHeight/naturalWidth,baseHeight=Math.min(naturalHeight,widthHeight),height=Math.min(baseHeight*(validPaperImageRatio(ratio)?ratio:1),widthHeight,maxHeight);
 return {baseHeight,width:height*naturalWidth/naturalHeight,height};
}
/** Logical CSS widths ignore notebook zoom and rotation. A table cell supplies
 * its own inner width; image-block wrappers intentionally span that same area. */
export function paperImageAvailableWidth(image:HTMLImageElement):number{
 let parent=image.parentElement;while(parent){const style=getComputedStyle(parent),inline=['inline','inline-block','inline-flex','inline-grid'].includes(style.display),width=inline?0:parent.clientWidth||parseFloat(style.width);if(width>0)return Math.max(1,width-(parseFloat(style.paddingLeft)||0)-(parseFloat(style.paddingRight)||0));parent=parent.parentElement;}return image.naturalWidth;
}
export function paperImageFrameHeight(image:HTMLImageElement):number{
 const frame=parseFloat(getComputedStyle(image).getPropertyValue('--flow-height'));return Number.isFinite(frame)&&frame>0?Math.max(1,frame-32):Infinity;
}
/** Offset layout units stay stable under page zoom and object rotation. Place
 * an image control overlay inside its paper column without adding document
 * height or moving the image/selection itself. */
export function paperImageOverlayPlacement(image:HTMLImageElement,requestedWidth:number):{left:number;width:number}|undefined{
 const frame=image.closest<HTMLElement>('.paper-flow-source'),anchor=image.closest<HTMLElement>('.note-photo-node,.milkdown-image-block');if(!frame||!anchor||!Number.isFinite(requestedWidth)||requestedWidth<=0)return undefined;
 const offset=(element:HTMLElement)=>{let left=0,current:HTMLElement|null=element;while(current){left+=current.offsetLeft;current=current.offsetParent as HTMLElement|null;}return left;},width=Math.min(requestedWidth,Math.max(1,frame.clientWidth||parseFloat(getComputedStyle(frame).width)||requestedWidth)),local=offset(anchor)-offset(frame),left=Math.max(-local,Math.min(0,(frame.clientWidth||parseFloat(getComputedStyle(frame).width)||width)-local-width));return {left,width};
}
