import {useId,useLayoutEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {paperToolboxLocalPoint,placePaperToolboxPopover} from '../lib/paperToolboxBounds';
import './paper-toolbox-popover.css';
interface Props {source:object;current:()=>boolean;visible:boolean;children:ReactNode}
interface Ticket {source:object;visible:boolean;revoked:boolean;alive:boolean}
interface Placement {ticket:Ticket;style:CSSProperties}
/** Only the menu panel is portalled, into its OWN note. Toolbar, editor,
 * hidden file inputs and menu children keep their React identity while closed.
 * In particular closing a menu does not unmount a pending native file chooser. */
export function PaperToolboxPopover(props:Props){
 const marker=useRef<HTMLSpanElement>(null),panel=useRef<HTMLDivElement>(null),latest=useRef(props);latest.current=props;
 const authority=useRef<Ticket|null>(null),before=authority.current;
 if(!before||before.source!==props.source||before.visible!==props.visible){if(before)before.revoked=true;authority.current={source:props.source,visible:props.visible,revoked:false,alive:false};}
 const ticket=authority.current!,id=useId(),[host,setHost]=useState<HTMLElement|null>(null),[state,setState]=useState<{ticket:Ticket;open:boolean;label:string}>({ticket,open:false,label:''}),[placement,setPlacement]=useState<Placement|null>(null);
 const runtime=useRef<{ticket:Ticket;details:HTMLDetailsElement;summary:HTMLElement;host:HTMLElement;close:()=>void;measure:()=>void}|null>(null);
 const current=()=>{
  if(authority.current!==ticket||ticket.revoked||!ticket.alive||!ticket.visible||latest.current.source!==ticket.source||!latest.current.visible)return false;
  try{if(latest.current.current()===true)return true;}catch{}
  ticket.revoked=true;return false;
 };
 useLayoutEffect(()=>{
  ticket.alive=true;
  const details=marker.current?.closest<HTMLDetailsElement>('details.paper-tool-menu'),note=marker.current?.closest<HTMLElement>('.paper-notebook'),summary=details?.querySelector<HTMLElement>(':scope > summary');
  if(!details||!note||!summary){ticket.alive=false;return;}
  const ownWindow=note.ownerDocument.defaultView;if(!ownWindow){ticket.alive=false;return;}
  setHost(previous=>previous===note?previous:note);
  const oldControls=summary.getAttribute('aria-controls');summary.setAttribute('aria-controls',id);
  let geometryFrame=0,guardFrame=0,ended=false;
  const owned=()=>!ended&&runtime.current===active&&authority.current===ticket;
  const close=()=>{if(!owned())return;details.removeAttribute('open');setState({ticket,open:false,label:''});setPlacement(null);};
  const measure=()=>{
   geometryFrame=0;if(!owned()||!details.open||!current())return;
   const element=panel.current;if(!element?.isConnected)return;
   const rect=note.getBoundingClientRect(),scaleX=note.offsetWidth?rect.width/note.offsetWidth:0,scaleY=note.offsetHeight?rect.height/note.offsetHeight:0;
   if(!(scaleX>0&&scaleY>0)){close();return;}
   let noteBounds={left:rect.left+note.clientLeft*scaleX,top:rect.top+note.clientTop*scaleY,width:note.clientWidth*scaleX,height:note.clientHeight*scaleY};
   // A short split pane can also clip its note. Intersect those real client
   // boxes before choosing a point; a window-visible point alone is insufficient.
   for(let parent=note.parentElement,depth=0;parent&&depth<64;parent=parent.parentElement,depth++){
    const css=ownWindow.getComputedStyle(parent),clipX=/^(auto|scroll|hidden|clip)$/.test(css.overflowX),clipY=/^(auto|scroll|hidden|clip)$/.test(css.overflowY);if(!clipX&&!clipY)continue;
    const box=parent.getBoundingClientRect(),sx=parent.offsetWidth?box.width/parent.offsetWidth:0,sy=parent.offsetHeight?box.height/parent.offsetHeight:0;if(!(sx>0&&sy>0)){close();return;}
    const left=clipX?Math.max(noteBounds.left,box.left+parent.clientLeft*sx):noteBounds.left,top=clipY?Math.max(noteBounds.top,box.top+parent.clientTop*sy):noteBounds.top;
    const right=clipX?Math.min(noteBounds.left+noteBounds.width,box.left+(parent.clientLeft+parent.clientWidth)*sx):noteBounds.left+noteBounds.width,bottom=clipY?Math.min(noteBounds.top+noteBounds.height,box.top+(parent.clientTop+parent.clientHeight)*sy):noteBounds.top+noteBounds.height;noteBounds={left,top,width:right-left,height:bottom-top};
   }
   const visual=ownWindow.visualViewport,viewport={left:visual?.offsetLeft??0,top:visual?.offsetTop??0,width:visual?.width??note.ownerDocument.documentElement.clientWidth,height:visual?.height??note.ownerDocument.documentElement.clientHeight};
   const anchor=summary.getBoundingClientRect(),preferredWidth=250*scaleX,preferredHeight=Math.max(1,element.scrollHeight)*scaleY;
   const placed=placePaperToolboxPopover({note:noteBounds,viewport,anchor,preferredWidth,preferredHeight,align:note.classList.contains('is-left-handed')?'start':'end'});
   if(!placed){close();return;}
   const point=paperToolboxLocalPoint(placed,{left:rect.left,top:rect.top,scaleX,scaleY,clientLeft:note.clientLeft,clientTop:note.clientTop,scrollLeft:note.scrollLeft,scrollTop:note.scrollTop});
   if(!point){close();return;}
   const style:CSSProperties={left:point.left,top:point.top,width:placed.width/scaleX,maxWidth:placed.maximumWidth/scaleX,maxHeight:placed.maximumHeight/scaleY};
   setPlacement(previous=>previous?.ticket===ticket&&Object.keys(style).every(key=>previous.style[key as keyof CSSProperties]===style[key as keyof CSSProperties])?previous:{ticket,style});
  };
  const queueMeasure=()=>{if(owned()&&!geometryFrame)geometryFrame=ownWindow.requestAnimationFrame(measure);};
  const inspect=()=>{guardFrame=0;if(!owned()||!details.open)return;if(!current()||note.ownerDocument.visibilityState==='hidden'){close();return;}guardFrame=ownWindow.requestAnimationFrame(inspect);};
  const toggle=()=>{
   if(!owned())return;
   if(!details.open){setState({ticket,open:false,label:''});setPlacement(null);if(guardFrame)ownWindow.cancelAnimationFrame(guardFrame);guardFrame=0;return;}
   if(!current()){close();return;}
   setState({ticket,open:true,label:summary.getAttribute('aria-label')??summary.textContent??''});setPlacement(null);queueMeasure();
   if(!guardFrame)guardFrame=ownWindow.requestAnimationFrame(inspect);
  };
  const hidden=()=>{if(note.ownerDocument.visibilityState==='hidden')close();};
  const active={ticket,details,summary,host:note,close,measure:queueMeasure};runtime.current=active;
  details.addEventListener('toggle',toggle);ownWindow.addEventListener('resize',queueMeasure);ownWindow.addEventListener('scroll',queueMeasure,true);note.addEventListener('scroll',queueMeasure,true);note.ownerDocument.addEventListener('visibilitychange',hidden);
  ownWindow.visualViewport?.addEventListener('resize',queueMeasure);ownWindow.visualViewport?.addEventListener('scroll',queueMeasure);
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(queueMeasure):null;observer?.observe(note);observer?.observe(summary);if(panel.current)observer?.observe(panel.current);
  toggle();
  return()=>{
   ended=true;ticket.alive=false;if(runtime.current===active){runtime.current=null;details.removeAttribute('open');}
   if(geometryFrame)ownWindow.cancelAnimationFrame(geometryFrame);if(guardFrame)ownWindow.cancelAnimationFrame(guardFrame);
   details.removeEventListener('toggle',toggle);ownWindow.removeEventListener('resize',queueMeasure);ownWindow.removeEventListener('scroll',queueMeasure,true);note.removeEventListener('scroll',queueMeasure,true);note.ownerDocument.removeEventListener('visibilitychange',hidden);
   ownWindow.visualViewport?.removeEventListener('resize',queueMeasure);ownWindow.visualViewport?.removeEventListener('scroll',queueMeasure);observer?.disconnect();
   if(summary.getAttribute('aria-controls')===id){if(oldControls===null)summary.removeAttribute('aria-controls');else summary.setAttribute('aria-controls',oldControls);}
  };
 },[ticket,id,host]);
 // The portal's first layout must be measured after it has actually mounted.
 useLayoutEffect(()=>{if(state.ticket===ticket&&state.open){const target=runtime.current;if(target?.ticket===ticket)target.measure();}},[host,state.open,ticket]);
 const open=state.ticket===ticket&&state.open&&props.visible&&!ticket.revoked,ready=open&&placement?.ticket===ticket;
 return <><span ref={marker} hidden data-paper-toolbox-anchor=""/>{host&&createPortal(<div ref={panel} id={id} role="group" aria-label={state.label||undefined} className="paper-tool-popover paper-toolbox-popover" data-toolbox-popover-open={open?'true':'false'} style={{...placement?.style,display:open?'flex':'none',visibility:ready?'visible':'hidden'}} onClickCapture={event=>{if(!current()){event.preventDefault();event.stopPropagation();}}} onChangeCapture={event=>{if(!current()){event.preventDefault();event.stopPropagation();}}} onClick={event=>{if((event.target as Element).closest?.('button')&&current())runtime.current?.close();}} onKeyDown={event=>{if(event.key==='Escape'&&!event.nativeEvent.isComposing&&current()){event.preventDefault();event.stopPropagation();const target=runtime.current;if(target?.ticket===ticket){target.close();target.summary.focus({preventScroll:true});}}}}>{props.children}</div>,host)}</>;
}
