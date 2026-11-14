import {useId,useLayoutEffect,useRef,useState,type CSSProperties,type KeyboardEvent,type PointerEvent,type ReactNode} from 'react';
import {GripVertical,RotateCcw} from 'lucide-react';
import {paperToolboxLocalPoint,paperToolboxVisibleBounds} from '../lib/paperToolboxBounds';
import {constrainPaperToolbox,paperToolboxKeyPoint,type PaperToolboxMovementBounds,type PaperToolboxPoint} from '../lib/paperToolboxMovement';
import './paper-movable-toolbox.css';
interface Props {source:object;current:()=>boolean;visible:boolean;disabled?:boolean;canMove?:()=>boolean;children:ReactNode}
interface Ticket {source:object;visible:boolean;disabled:boolean;alive:boolean;revoked:boolean}
interface Position extends PaperToolboxPoint {floating:boolean;reservedHeight:number}
interface Geometry {bounds:PaperToolboxMovementBounds;slot:PaperToolboxPoint;origin:PaperToolboxPoint;scaleX:number;scaleY:number;availableWidth:number;availableHeight:number}
interface Drag {ticket:Ticket;id:number;handle:HTMLButtonElement;clientX:number;clientY:number;origin:PaperToolboxPoint;moved:boolean}
const docked:Position={floating:false,x:0,y:0,reservedHeight:0};
/** UI-only position for this mounted note view. No document, preference format,
 * storage, sync, scroll, focus, selection or editor node is mutated. The outer
 * .paper-toolbar reserves its original height while the same body floats. */
export function PaperMovableToolbox(props:Props){
 const frame=useRef<HTMLDivElement>(null),body=useRef<HTMLDivElement>(null),latest=useRef(props);latest.current=props;
 const authority=useRef<Ticket|null>(null),before=authority.current;
 if(!before||before.source!==props.source||before.visible!==props.visible||before.disabled!==!!props.disabled){if(before)before.revoked=true;authority.current={source:props.source,visible:props.visible,disabled:!!props.disabled,alive:false,revoked:false};}
 const ticket=authority.current!,drag=useRef<Drag|null>(null),compositions=useRef(new Set<EventTarget>()),guardFrame=useRef<{ticket:Ticket;id:number}|null>(null),runtime=useRef<{ticket:Ticket;measure:()=>Geometry|null}|null>(null),help=useId();
 const [saved,setSaved]=useState<{source:object;position:Position}>({source:props.source,position:docked}),savedRef=useRef(saved);savedRef.current=saved;
 const [preview,setPreview]=useState<{ticket:Ticket;position:Position}|null>(null),previewRef=useRef(preview);previewRef.current=preview;
 const [geometry,setGeometry]=useState<Geometry|null>(null),[notice,setNotice]=useState('');
 const committed=()=>savedRef.current.source===props.source?savedRef.current.position:docked;
 const current=()=>{
  if(authority.current!==ticket||ticket.revoked||!ticket.alive||!ticket.visible||ticket.disabled||latest.current.source!==ticket.source||!latest.current.visible||latest.current.disabled)return false;
  try{if(latest.current.current()===true)return true;}catch{}
  ticket.revoked=true;return false;
 };
 const canMove=()=>{if(compositions.current.size)return false;try{return latest.current.canMove?.()!==false;}catch{return false;}};
 const release=(value:Drag|null)=>{if(!value)return;try{if(value.handle.hasPointerCapture(value.id))value.handle.releasePointerCapture(value.id);}catch{}};
 const cancel=(paint=true)=>{
  const value=drag.current;if(value?.ticket===ticket){drag.current=null;release(value);}
  if(guardFrame.current?.ticket===ticket){frame.current?.ownerDocument.defaultView?.cancelAnimationFrame(guardFrame.current.id);guardFrame.current=null;}
  if(previewRef.current?.ticket===ticket)previewRef.current=null;if(paint)setPreview(previous=>previous?.ticket===ticket?null:previous);
 };
 const store=(position:Position)=>{if(!current())return false;const next={source:props.source,position};savedRef.current=next;setSaved(next);return true;};
 useLayoutEffect(()=>{
  ticket.alive=true;const node=frame.current,content=body.current,note=node?.closest<HTMLElement>('.paper-notebook'),win=node?.ownerDocument.defaultView;
  if(!node||!content||!note||!win){ticket.alive=false;return;}
  let ended=false,resizeFrame=0;
  const measure=():Geometry|null=>{
   if(ended||authority.current!==ticket)return null;const unavailable=()=>{setGeometry(previous=>previous===null?previous:null);return null;};
   const rect=note.getBoundingClientRect(),sx=note.offsetWidth?rect.width/note.offsetWidth:0,sy=note.offsetHeight?rect.height/note.offsetHeight:0;
   if(!(sx>0&&sy>0))return unavailable();
   const visual=win.visualViewport,viewport={left:visual?.offsetLeft??0,top:visual?.offsetTop??0,width:visual?.width??note.ownerDocument.documentElement.clientWidth,height:visual?.height??note.ownerDocument.documentElement.clientHeight};
   let noteBounds={left:rect.left+note.clientLeft*sx,top:rect.top+note.clientTop*sy,width:note.clientWidth*sx,height:note.clientHeight*sy};
   for(let parent=note.parentElement,depth=0;parent&&depth<64;parent=parent.parentElement,depth++){
    const css=win.getComputedStyle(parent),clipX=/^(auto|scroll|hidden|clip)$/.test(css.overflowX),clipY=/^(auto|scroll|hidden|clip)$/.test(css.overflowY);if(!clipX&&!clipY)continue;
    const box=parent.getBoundingClientRect(),px=parent.offsetWidth?box.width/parent.offsetWidth:0,py=parent.offsetHeight?box.height/parent.offsetHeight:0;if(!(px>0&&py>0))return unavailable();
    const left=clipX?Math.max(noteBounds.left,box.left+parent.clientLeft*px):noteBounds.left,top=clipY?Math.max(noteBounds.top,box.top+parent.clientTop*py):noteBounds.top;
    const right=clipX?Math.min(noteBounds.left+noteBounds.width,box.left+(parent.clientLeft+parent.clientWidth)*px):noteBounds.left+noteBounds.width,bottom=clipY?Math.min(noteBounds.top+noteBounds.height,box.top+(parent.clientTop+parent.clientHeight)*py):noteBounds.top+noteBounds.height;noteBounds={left,top,width:right-left,height:bottom-top};
   }
   const visible=paperToolboxVisibleBounds(noteBounds,viewport);if(!visible)return unavailable();
   const at=(p:{left:number;top:number})=>paperToolboxLocalPoint(p,{left:rect.left,top:rect.top,scaleX:sx,scaleY:sy,clientLeft:note.clientLeft,clientTop:note.clientTop,scrollLeft:note.scrollLeft,scrollTop:note.scrollTop});
   const point=at(visible),slot=at(node.getBoundingClientRect()),origin=at(content.getBoundingClientRect());if(!point||!slot||!origin)return unavailable();
   const availableWidth=visible.width/sx,availableHeight=visible.height/sy,inset=Math.min(8,availableWidth/4,availableHeight/4),width=availableWidth-2*inset,height=availableHeight-2*inset;
   const toolWidth=Math.min(680,width),toolHeight=Math.min(content.offsetHeight,height);
   if(!(toolWidth>=88&&toolHeight>=44))return unavailable();
   const next:Geometry={bounds:{left:point.left+inset,top:point.top+inset,width,height,toolWidth,toolHeight},slot:{x:slot.left,y:slot.top},origin:{x:origin.left,y:origin.top},scaleX:sx,scaleY:sy,availableWidth,availableHeight};
   setGeometry(previous=>previous&&JSON.stringify(previous)===JSON.stringify(next)?previous:next);return next;
  };
  const resize=()=>{resizeFrame=0;if(ended)return;const next=measure(),position=committed(),activePreview=previewRef.current;if(drag.current?.ticket===ticket){if(!next||!current()||!canMove()){cancel();return;}if(activePreview?.ticket===ticket){const point=constrainPaperToolbox(activePreview.position,next.bounds);if(point){const adjusted={ticket,position:{...activePreview.position,...point}};previewRef.current=adjusted;setPreview(previous=>previous?.ticket===ticket&&previous.position.x===point.x&&previous.position.y===point.y?previous:adjusted);}}return;}if(next&&position.floating&&current()){const point=constrainPaperToolbox(position,next.bounds);if(point&&(Math.abs(point.x-position.x)>.1||Math.abs(point.y-position.y)>.1))store({...position,...point});}};
  const queue=()=>{if(!ended&&!resizeFrame)resizeFrame=win.requestAnimationFrame(resize);};
  const start=(event:Event)=>{if(event.target)compositions.current.add(event.target);cancel();},end=(event:Event)=>{if(event.target)compositions.current.delete(event.target);};
  const hidden=()=>{if(note.ownerDocument.visibilityState==='hidden')cancel();};
  const active={ticket,measure};runtime.current=active;
  note.addEventListener('compositionstart',start,true);note.addEventListener('compositionend',end,true);note.ownerDocument.addEventListener('visibilitychange',hidden);note.addEventListener('scroll',queue,true);win.addEventListener('resize',queue);win.addEventListener('scroll',queue,true);win.visualViewport?.addEventListener('resize',queue);win.visualViewport?.addEventListener('scroll',queue);
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(queue):null;observer?.observe(note);observer?.observe(content);measure();
  return()=>{ended=true;ticket.alive=false;cancel(false);compositions.current.clear();if(runtime.current===active)runtime.current=null;if(resizeFrame)win.cancelAnimationFrame(resizeFrame);observer?.disconnect();note.removeEventListener('compositionstart',start,true);note.removeEventListener('compositionend',end,true);note.ownerDocument.removeEventListener('visibilitychange',hidden);note.removeEventListener('scroll',queue,true);win.removeEventListener('resize',queue);win.removeEventListener('scroll',queue,true);win.visualViewport?.removeEventListener('resize',queue);win.visualViewport?.removeEventListener('scroll',queue);};
 },[ticket]);
 const position=preview?.ticket===ticket&&drag.current?.ticket===ticket?preview.position:saved.source===props.source?saved.position:docked;
 const read=()=>runtime.current?.ticket===ticket?runtime.current.measure():null;
 const begin=(event:PointerEvent<HTMLButtonElement>)=>{
  if(drag.current||!canMove()||!current()||event.button!==0||event.isPrimary===false||!['mouse','pen','touch'].includes(event.pointerType)||!Number.isSafeInteger(event.pointerId)||event.pointerId<0||![event.clientX,event.clientY].every(Number.isFinite))return;
  const next=read();if(!next)return;
  event.preventDefault();event.stopPropagation();const value:Drag={ticket,id:event.pointerId,handle:event.currentTarget,clientX:event.clientX,clientY:event.clientY,origin:next.origin,moved:false};
  try{value.handle.setPointerCapture(value.id);if(!value.handle.hasPointerCapture(value.id))return;}catch{return;}
  drag.current=value;
  const inspect=()=>{guardFrame.current=null;if(drag.current!==value)return;if(!current()||!canMove()||frame.current?.ownerDocument.visibilityState==='hidden'){cancel();return;}const win=frame.current?.ownerDocument.defaultView;if(win)guardFrame.current={ticket,id:win.requestAnimationFrame(inspect)};};inspect();
 };
 const move=(event:PointerEvent<HTMLButtonElement>)=>{
  const value=drag.current;if(value?.ticket!==ticket||value.id!==event.pointerId)return;
  event.preventDefault();event.stopPropagation();if(!current()||!canMove()){cancel();return;}
  const next=read();if(!next){cancel();return;}const dx=(event.clientX-value.clientX)/next.scaleX,dy=(event.clientY-value.clientY)/next.scaleY;
  if(!value.moved&&Math.hypot(dx,dy)<4)return;value.moved=true;
  const point=constrainPaperToolbox({x:value.origin.x+dx,y:value.origin.y+dy},next.bounds);if(!point){cancel();return;}
  const selected:Position={...point,floating:true,reservedHeight:committed().floating?committed().reservedHeight:frame.current?.offsetHeight??0};previewRef.current={ticket,position:selected};setPreview(previewRef.current);
 };
 const finish=(event:PointerEvent<HTMLButtonElement>,abort=false)=>{
  const value=drag.current;if(value?.ticket!==ticket||value.id!==event.pointerId)return;event.preventDefault();event.stopPropagation();
  const chosen=previewRef.current?.ticket===ticket?previewRef.current.position:null;
  if(!abort&&value.moved&&chosen&&current()&&canMove()){const next=read(),point=next&&constrainPaperToolbox(chosen,next.bounds);if(point)store({...chosen,...point});}cancel();
 };
 const reset=()=>{if(!canMove()||!current())return;cancel();if(store(docked))setNotice('Barre replacée en haut de cette note.');};
 const keyboard=(event:KeyboardEvent<HTMLButtonElement>)=>{
  if(event.nativeEvent.isComposing||event.nativeEvent.keyCode===229||event.ctrlKey||event.metaKey||event.altKey||!canMove()||!current())return;
  if(event.key==='Escape'){if(drag.current?.ticket===ticket){event.preventDefault();event.stopPropagation();cancel();}return;}
  if(event.key==='Home'){event.preventDefault();event.stopPropagation();reset();return;}
  const next=read();if(!next)return;const original=committed(),point=paperToolboxKeyPoint(original.floating?original:next.origin,event.key,event.shiftKey);if(!point)return;
  event.preventDefault();event.stopPropagation();const constrained=constrainPaperToolbox(point,next.bounds);if(!constrained)return;cancel();if(store({...constrained,floating:true,reservedHeight:original.floating?original.reservedHeight:frame.current?.offsetHeight??0}))setNotice('Position de la barre ajustée dans cette note.');
 };
 const size:CSSProperties={'--paper-toolbox-width':`${Math.max(1,(geometry?.availableWidth??700)-16)}px`,'--paper-toolbox-height':`${Math.max(44,Math.min(224,(geometry?.availableHeight??500)-16))}px`}as CSSProperties;
 const floating=position.floating&&!!geometry,bodyStyle:CSSProperties=floating?{position:'absolute',left:position.x-geometry!.slot.x,top:position.y-geometry!.slot.y,width:Math.min(680,geometry!.bounds.width),maxHeight:geometry!.bounds.height}:{};
 return <div ref={frame} className="paper-toolbar paper-movable-toolbox" role="toolbar" aria-label="Outils du carnet" data-toolbox-floating={floating?'true':'false'} style={{...size,...(floating?{height:position.reservedHeight}:{}),padding:0}}><div ref={body} className="paper-movable-toolbox-body" style={bodyStyle}><div className="paper-toolbox-move-controls"><button type="button" className="paper-toolbox-move-handle" aria-label="Déplacer la barre d’outils" aria-describedby={help} disabled={!props.visible||props.disabled} onPointerDown={begin} onPointerMove={move} onPointerUp={event=>finish(event)} onPointerCancel={event=>finish(event,true)} onLostPointerCapture={event=>finish(event,true)} onKeyDown={keyboard}><GripVertical/></button><button type="button" aria-label="Replacer la barre d’outils en haut" title="Replacer la barre en haut" disabled={!props.visible||props.disabled} onClick={reset}><RotateCcw/></button></div>{props.children}</div><span id={help} className="paper-toolbox-screen-reader">Glissez la poignée. Au clavier : flèches, Maj pour déplacer davantage, Début pour replacer en haut. Échap annule un déplacement. Position conservée seulement dans cette vue ouverte.</span><span className="paper-toolbox-screen-reader" role="status" aria-live="polite">{notice}</span></div>;
}
