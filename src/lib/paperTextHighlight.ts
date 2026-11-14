import {renderedMarkdownOffsets} from './paperTextSourceMap.ts';
import {fitPaperFlowMath,paperFlowChromeSelector} from './paperRichFlowLayout.ts';
import {objectPoint} from './paperGeometry.ts';
import type {PaperObject,PaperPage,PaperCommand} from './notebookDocument.ts';

export interface PaperHighlightPoint{x:number;y:number}
export interface PaperHighlightFragment{quad:[PaperHighlightPoint,PaperHighlightPoint,PaperHighlightPoint,PaperHighlightPoint];text:string;from:number;to:number}
interface TextRun{path:number[];text:string;from:number;to:number;sourceOffsets:number[]}
export interface PaperTextHighlightModel{root:HTMLElement;markdown:string;text:string;runs:TextRun[]}
export interface PaperTypedHighlightSelection{kind:'text';objectId:string;pageId:string;source:string;objectSnapshot:string;from:number;to:number;text:string;fragments:PaperHighlightFragment[]}
const MAX_TEXT=2_000_000,MAX_NODES=100_000,MAX_FRAGMENTS=5_000;
const excluded='[data-md-atomic],.katex,'+paperFlowChromeSelector;
function pathOf(root:Node,node:Node){const path:number[]=[];while(node!==root){const parent=node.parentNode;if(!parent)throw Error('Le texte n’appartient plus à cette zone.');path.unshift(Array.prototype.indexOf.call(parent.childNodes,node));node=parent;}return path;}
function atPath(root:Node,path:readonly number[]):Text|null{let node=root;for(const index of path){const child=node.childNodes[index];if(!child)return null;node=child;}return node.nodeType===3?node as Text:null;}
function boundary(text:string,offset:number){return Number.isSafeInteger(offset)&&offset>=0&&offset<=text.length&&!(offset>0&&offset<text.length&&/[\uD800-\uDBFF]/.test(text[offset-1])&&/[\uDC00-\uDFFF]/.test(text[offset]));}
/** Parser-derived positions, never a search for a quote that may occur twice. */
export function paperTextHighlightModel(root:HTMLElement,markdown:string):PaperTextHighlightModel{
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),runs:TextRun[]=[],cache=new Map<HTMLElement,number[]|null>();let text='',nodes=0,block:Element|null=null;
 while(walker.nextNode()){
  if(++nodes>MAX_NODES)throw Error('Sélectionnez une zone de texte plus courte.');const node=walker.currentNode as Text,parent=node.parentElement;if(!parent||parent.closest(excluded)||!node.length)continue;
  const owner=parent.closest<HTMLElement>('[data-md-from]');if(!owner||!root.contains(owner))continue;const sourceFrom=Number(owner.dataset.mdFrom),sourceTo=Number(owner.dataset.mdTo);
  if(!Number.isSafeInteger(sourceFrom)||!Number.isSafeInteger(sourceTo)||sourceFrom<0||sourceTo>markdown.length||sourceTo<sourceFrom)continue;
  if(!cache.has(owner))cache.set(owner,renderedMarkdownOffsets(markdown.slice(sourceFrom,sourceTo),owner.textContent??'',owner.dataset.mdMode));const mapping=cache.get(owner);if(!mapping)continue;
  const prefix=document.createRange();prefix.setStart(owner,0);prefix.setEnd(node,0);const local=prefix.toString().length;prefix.detach();if(local+node.length>=mapping.length)continue;
  const nextBlock=parent.closest('p,h1,h2,h3,h4,h5,h6,li,td,th,pre,blockquote');if(runs.length&&nextBlock!==block&&text&&!text.endsWith('\n'))text+='\n';block=nextBlock;
  const from=text.length;text+=node.data;if(text.length>MAX_TEXT)throw Error('Sélectionnez une zone de texte plus courte.');runs.push({path:pathOf(root,node),text:node.data,from,to:text.length,sourceOffsets:mapping.slice(local,local+node.length+1).map(offset=>sourceFrom+offset)});
 }
 return {root,markdown,text,runs};
}
/** Return logical display offsets only for a selection inside this exact source. */
export function paperTextHighlightRange(model:PaperTextHighlightModel,range:Range):{from:number;to:number}|null{
 if(range.collapsed||!model.root.contains(range.startContainer)||!model.root.contains(range.endContainer))return null;
 for(const atom of model.root.querySelectorAll('[data-md-atomic],.katex'))if(range.intersectsNode(atom))return null;
 let from=Infinity,to=-Infinity;for(const run of model.runs){const node=atPath(model.root,run.path);if(!node||node.data!==run.text)return null;const before=range.comparePoint(node,0),after=range.comparePoint(node,node.length);if(before===after&&before!==0)continue;
  const start=range.startContainer===node?range.startOffset:0,end=range.endContainer===node?range.endOffset:node.length;if(start<end){from=Math.min(from,run.from+start);to=Math.max(to,run.from+end);}
 }return Number.isFinite(from)&&to>from?{from,to}:null;
}
/** Measure the real reader's copy at 100%. A rotated bounding box is never used as a glyph rectangle. */
export function measurePaperTextHighlight(model:PaperTextHighlightModel,object:PaperObject,page:PaperPage,from:number,to:number):PaperTypedHighlightSelection|null{
 if(!boundary(model.text,from)||!boundary(model.text,to)||to<=from||object.markdown!==model.markdown||!model.root.isConnected)throw Error('Le passage sélectionné a changé. Sélectionnez-le à nouveau.');
 const pageIndex=object.textFlow?.pageIds.indexOf(page.id)??-1;if(object.pageId!==page.id&&pageIndex<0)throw Error('Cette zone appartient à une autre page.');
 const offset=pageIndex>=0?object.textFlow!.breaks[pageIndex]:0,frameHeight=pageIndex>=0?Math.min(object.height,object.textFlow!.breaks[pageIndex+1]-offset):object.height;
 const parent=model.root.closest<HTMLElement>('[data-object]'),insets=object.kind==='sticky'&&parent?getComputedStyle(parent):null,leftInset=insets?parseFloat(insets.paddingLeft)||0:0,topInset=insets?parseFloat(insets.paddingTop)||0:0,rightInset=insets?parseFloat(insets.paddingRight)||0:0,bottomInset=insets?parseFloat(insets.paddingBottom)||0:0,contentWidth=object.width-leftInset-rightInset;
 const host=document.createElement('div'),copy=model.root.cloneNode(true) as HTMLElement;host.className='paper-object'+(object.kind==='text'?' has-text-flow':'');host.style.cssText=`position:fixed;left:-30000px;top:0;width:${contentWidth}px;pointer-events:none;visibility:hidden;`;host.style.font=getComputedStyle(model.root).font;host.style.color=getComputedStyle(model.root).color;host.style.setProperty('--flow-height',object.height+'px');
 copy.removeAttribute('id');copy.style.transform='none';copy.style.width=contentWidth+'px';host.append(copy);document.body.append(host);
 try{
  fitPaperFlowMath(copy,contentWidth,object.height);const origin=copy.getBoundingClientRect();type Band={left:number;right:number;top:number;bottom:number;text:string;from:number;to:number};const bands:Band[]=[];let measured=0;
  for(const run of model.runs){const start=Math.max(from,run.from),end=Math.min(to,run.to);if(end<=start)continue;const node=atPath(copy,run.path);if(!node||node.data!==run.text)throw Error('La géométrie du texte a changé.');const range=document.createRange();
   for(let cursor=start-run.from;cursor<end-run.from;){
    if(++measured>50000)throw Error('Surlignez ce passage en plusieurs parties.');const length=(node.data.codePointAt(cursor)??0)>0xffff?2:1,next=Math.min(end-run.from,cursor+length);range.setStart(node,cursor);range.setEnd(node,next);
    for(const rect of range.getClientRects()){
     if(rect.width<=0||rect.height<=0)continue;const left=Math.max(0,rect.left-origin.left)+leftInset,right=Math.min(contentWidth,rect.right-origin.left)+leftInset,top=Math.max(0,rect.top-origin.top-offset)+topInset,bottom=Math.min(frameHeight-bottomInset,rect.bottom-origin.top-offset+topInset);if(right<=left||bottom<=top)continue;
     const band:Band={left,right,top,bottom,text:node.data.slice(cursor,next),from:run.sourceOffsets[cursor],to:run.sourceOffsets[next]},previous=bands.at(-1),gap=previous?Math.max(left-previous.right,previous.left-right):Infinity;
     if(previous&&Math.abs(top-previous.top)<.75&&Math.abs(bottom-previous.bottom)<.75&&gap<=Math.max(1,(bottom-top)*.12)&&band.from>=previous.from){previous.left=Math.min(previous.left,left);previous.right=Math.max(previous.right,right);previous.text+=band.text;previous.to=band.to;}
     else bands.push(band);if(bands.length>MAX_FRAGMENTS)throw Error('Surlignez ce passage en plusieurs parties.');
    }cursor=next;
   }range.detach();
  }
  const fragments:PaperHighlightFragment[]=bands.map(band=>({quad:[{x:band.left,y:band.top},{x:band.right,y:band.top},{x:band.right,y:band.bottom},{x:band.left,y:band.bottom}].map(point=>objectPoint(object,point)) as PaperHighlightFragment['quad'],text:band.text,from:band.from,to:band.to}));
  return fragments.length?{kind:'text',objectId:object.id,pageId:page.id,source:model.markdown,objectSnapshot:JSON.stringify(object),from,to,text:model.text.slice(from,to),fragments}:null;
 }finally{host.remove();}
}
/** Every disjoint line fragment is its own band. One batch is one undo step. */
export function paperHighlightCommand(fragments:readonly PaperHighlightFragment[],pageId:string,color:string,z:number):PaperCommand{
 if(!fragments.length||fragments.length>MAX_FRAGMENTS||!/^#[\da-f]{6}$/i.test(color)||!Number.isFinite(z))throw Error('Le surlignage sélectionné est invalide.');const groupId=crypto.randomUUID(),createdAt=Date.now();
 return {type:'batch',commands:fragments.map(fragment=>{
  const q=fragment.quad;if(q.length!==4||q.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))throw Error('Le passage ne peut pas être mesuré.');
  const ux=q[1].x-q[0].x,uy=q[1].y-q[0].y,vx=q[3].x-q[0].x,vy=q[3].y-q[0].y,areaScale=Math.hypot(ux,uy)*Math.hypot(vx,vy);if(!areaScale||Math.abs(ux*vx+uy*vy)>areaScale*.001||Math.hypot(q[2].x-q[1].x-vx,q[2].y-q[1].y-vy)>Math.max(.01,Math.sqrt(areaScale)*.001))throw Error('Ce texte incliné nécessite un tracé libre. Son original est conservé.');
  const start={x:(q[0].x+q[3].x)/2,y:(q[0].y+q[3].y)/2},end={x:(q[1].x+q[2].x)/2,y:(q[1].y+q[2].y)/2},thickness=Math.hypot(q[0].x-q[3].x,q[0].y-q[3].y);
  if(thickness<=0||thickness>10000||Math.hypot(start.x-end.x,start.y-end.y)<=0)throw Error('Le passage ne peut pas être mesuré.');const pad=thickness/2,x=Math.min(start.x,end.x)-pad,y=Math.min(start.y,end.y)-pad;
  const object:PaperObject={id:crypto.randomUUID(),pageId,kind:'ink',x,y,width:Math.max(1,Math.abs(start.x-end.x)+thickness),height:Math.max(1,Math.abs(start.y-end.y)+thickness),rotation:0,z,locked:false,groupId,createdAt,color,strokeWidth:thickness,pen:'highlighter',strokeStyle:'solid',opacity:.32,points:[{x:start.x-x,y:start.y-y,time:0},{x:end.x-x,y:end.y-y,time:0}]};
  return {type:'upsert-object',object};
 })};
}
