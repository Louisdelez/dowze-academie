import {useId,useLayoutEffect,useRef,useState,type ReactNode,type KeyboardEvent,type PointerEvent} from 'react';
import {GripVertical} from 'lucide-react';
import {createPaperToolReorderSession,paperToolReorderIndex,type PaperToolReorderSession,type PaperToolReorderTarget} from '../lib/paperToolReorder';
import './paper-tool-reorder.css';
export interface PaperToolReorderItem {id:string;label:string}
export interface PaperToolReorderListProps {
 items:readonly PaperToolReorderItem[];source:object;target:PaperToolReorderTarget;current:()=>boolean;disabled?:boolean;
 onReorder:(ids:readonly string[],target:PaperToolReorderTarget)=>Promise<boolean>;
 renderItem:(item:PaperToolReorderItem,index:number)=>ReactNode;
 itemClassName?:(item:PaperToolReorderItem)=>string|undefined;
}
interface Gesture {session:PaperToolReorderSession;mode:'keyboard'|'pointer';pointer?:{id:number;button:HTMLButtonElement;startY:number;moved:boolean}}
/** Dedicated handles reorder settings rows only. Pointer capture/touch-action
 * never apply to the notebook, its caret, ink surface or surrounding scroll. */
export function PaperToolReorderList(props:PaperToolReorderListProps){
 const latest=useRef(props),list=useRef<HTMLUListElement>(null),gesture=useRef<Gesture|null>(null),job=useRef<object|null>(null),mounted=useRef(false),help=useId();latest.current=props;
 const [presentation,setPresentation]=useState<{source:object;target:PaperToolReorderTarget;ids:readonly string[];notice:string;busy:boolean}>({source:props.source,target:props.target,ids:props.items.map(item=>item.id),notice:'',busy:false});
 const ids=props.items.map(item=>item.id),signature=JSON.stringify(ids),visible=presentation.source===props.source&&presentation.target===props.target&&presentation.ids.length===ids.length&&presentation.ids.every(id=>ids.includes(id)),previewing=gesture.current?.session.source===props.source&&gesture.current.session.target===props.target,order=visible&&previewing?presentation.ids:ids;
 const incarnation=useRef({source:props.source,target:props.target,signature,token:Object.freeze({})});
 if(incarnation.current.source!==props.source||incarnation.current.target!==props.target||incarnation.current.signature!==signature)incarnation.current={source:props.source,target:props.target,signature,token:Object.freeze({})};
 const viewToken=incarnation.current.token;
 const read=()=>({source:latest.current.source,target:latest.current.target,ids:latest.current.items.map(item=>item.id),disabled:latest.current.disabled});
 const current=(source:object,target:PaperToolReorderTarget,token?:object)=>{try{return mounted.current&&(token===undefined||incarnation.current.token===token)&&latest.current.source===source&&latest.current.target===target&&latest.current.current()===true;}catch{return false;}};
 const release=(value:Gesture|null)=>{if(!value?.pointer)return;const pointer=value.pointer;value.pointer=undefined;try{if(pointer.button.hasPointerCapture(pointer.id))pointer.button.releasePointerCapture(pointer.id);}catch{}};
 const reset=(notice='Déplacement annulé. L’ordre enregistré est conservé.')=>{const previous=gesture.current;gesture.current=null;previous?.session.cancel();release(previous);if(current(props.source,props.target))setPresentation({source:props.source,target:props.target,ids:latest.current.items.map(item=>item.id),notice,busy:false});};
 useLayoutEffect(()=>{mounted.current=true;return()=>{mounted.current=false;const previous=gesture.current;gesture.current=null;previous?.session.cancel();release(previous);job.current=null;};},[]);
 useLayoutEffect(()=>{const active=gesture.current;if(active&&(active.session.source!==props.source||active.session.target!==props.target)){job.current=null;reset('');}else if(active&&!active.session.pending()&&!active.session.current())reset('');if(presentation.source!==props.source||presentation.target!==props.target)setPresentation({source:props.source,target:props.target,ids,notice:'',busy:false});},[props.source,props.target,props.disabled,signature]);
 // Preview uses CSS order, so the pointer-captured row never reparents. Keep
 // focus only on the handle whose keyboard gesture requested that preview.
 useLayoutEffect(()=>{const active=gesture.current;if(active?.mode!=='keyboard'||active.session.pending()||!active.session.current())return;const row=[...(list.current?.children??[])].find(child=>(child as HTMLElement).dataset.reorderTool===active.session.id);row?.querySelector<HTMLButtonElement>('.paper-tool-reorder-handle')?.focus({preventScroll:true});},[presentation.ids]);
 const begin=(id:string,mode:Gesture['mode']):Gesture|null=>{
  if(gesture.current||job.current||props.disabled||!current(props.source,props.target,viewToken))return null;
  try{const session=createPaperToolReorderSession({source:props.source,target:props.target,ids,id,view:read,current:()=>current(props.source,props.target,viewToken),onReorder:props.onReorder}),value={session,mode};gesture.current=value;setPresentation({source:props.source,target:props.target,ids:session.order(),notice:'Déplacez cet outil, puis validez. Échap annule.',busy:false});return value;}catch{return null;}
 };
 const preview=(value:Gesture,index:number)=>{const next=value.session.preview(index);if(!next){reset();return;}setPresentation({source:props.source,target:props.target,ids:next,notice:`${props.items.find(item=>item.id===value.session.id)?.label??'Outil'}, position ${value.session.index()+1} sur ${ids.length}.`,busy:false});};
 const commit=(value:Gesture)=>{
  if(gesture.current!==value||job.current)return;release(value);
  if(!value.session.current()){reset();return;}
  const operation={};job.current=operation;setPresentation({source:props.source,target:props.target,ids:value.session.order(),notice:'Enregistrement de l’ordre…',busy:true});
  void value.session.commit().then(saved=>{if(job.current===operation&&current(value.session.source,value.session.target))setPresentation({source:value.session.source,target:value.session.target,ids:saved?value.session.order():latest.current.items.map(item=>item.id),notice:saved?'Ordre des outils enregistré.':'L’ordre précédent reste conservé. Réessayez.',busy:false});},()=>{if(job.current===operation&&current(value.session.source,value.session.target))setPresentation({source:value.session.source,target:value.session.target,ids:latest.current.items.map(item=>item.id),notice:'L’ordre précédent reste conservé. Réessayez.',busy:false});}).finally(()=>{if(job.current===operation)job.current=null;if(gesture.current===value)gesture.current=null;});
 };
 const keyboard=(event:KeyboardEvent<HTMLButtonElement>,id:string)=>{
  if(incarnation.current.token!==viewToken||latest.current.source!==props.source||latest.current.target!==props.target)return;
  let active=gesture.current;
  if(event.key==='Escape'&&active?.session.id===id){event.preventDefault();event.stopPropagation();reset();return;}
  if(event.key===' '||event.key==='Enter'){
   event.preventDefault();event.stopPropagation();if(active?.session.id===id&&active.mode==='keyboard')commit(active);else if(!active)begin(id,'keyboard');return;
  }
  if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
  if(!active&&event.altKey)active=begin(id,'keyboard');
  if(!active||active.session.id!==id||active.mode!=='keyboard')return;
  event.preventDefault();event.stopPropagation();const from=active.session.index(),to=event.key==='Home'?0:event.key==='End'?ids.length-1:Math.max(0,Math.min(ids.length-1,from+(event.key==='ArrowUp'?-1:1)));preview(active,to);
  if(event.altKey)commit(active);
 };
 const pointerDown=(event:PointerEvent<HTMLButtonElement>,id:string)=>{
  if(event.button!==0||event.isPrimary===false||!Number.isFinite(event.clientY))return;
  const active=begin(id,'pointer');if(!active)return;
  event.preventDefault();event.stopPropagation();try{event.currentTarget.setPointerCapture(event.pointerId);if(!event.currentTarget.hasPointerCapture(event.pointerId))throw Error('capture');active.pointer={id:event.pointerId,button:event.currentTarget,startY:event.clientY,moved:false};}catch{reset('Utilisez les flèches ou le clavier pour déplacer cet outil.');}
 };
 const pointerMove=(event:PointerEvent<HTMLButtonElement>)=>{
  if(incarnation.current.token!==viewToken||latest.current.source!==props.source||latest.current.target!==props.target)return;
  const active=gesture.current,pointer=active?.pointer;if(!active||!pointer||pointer.id!==event.pointerId)return;
  event.preventDefault();event.stopPropagation();if(!active.session.current()){reset();return;}if(!pointer.moved&&Math.abs(event.clientY-pointer.startY)<4)return;pointer.moved=true;
  const rows=[...(list.current?.children??[])].map(child=>{const row=child as HTMLElement,box=row.getBoundingClientRect();return {id:row.dataset.reorderTool??'',top:box.top,bottom:box.bottom};}).sort((first,second)=>first.top-second.top),to=paperToolReorderIndex(active.session.order(),rows,event.clientY);
  if(to!==null)preview(active,to);
 };
 const pointerEnd=(event:PointerEvent<HTMLButtonElement>,cancelled=false)=>{if(incarnation.current.token!==viewToken||latest.current.source!==props.source||latest.current.target!==props.target)return;const active=gesture.current;if(!active?.pointer||active.pointer.id!==event.pointerId)return;event.preventDefault();event.stopPropagation();if(cancelled||!active.pointer.moved)reset(cancelled?undefined:'Ordre inchangé.');else commit(active);};
 const busy=visible&&presentation.busy;
 return <div className="paper-tool-reorder"><p id={help} className="paper-settings-help">Glissez la poignée d’un outil. Au clavier : Espace, flèches, puis Entrée. Échap annule.</p><ul ref={list} className="paper-tool-order paper-tool-reorder-list" aria-label="Ordre des outils" aria-busy={busy}>{props.items.map(item=>{const id=item.id,index=order.indexOf(id),active=gesture.current?.session.id===id&&gesture.current.session.source===props.source&&gesture.current.session.target===props.target;return <li key={id} data-reorder-tool={id} data-tool-slot={id} style={{order:index}} aria-posinset={index+1} aria-setsize={ids.length} className={[props.itemClassName?.(item),active?'is-reordering':''].filter(Boolean).join(' ')}><button type="button" className="paper-tool-reorder-handle" aria-label={`Déplacer ${item.label}`} aria-describedby={help} aria-pressed={active} disabled={props.disabled||busy} onKeyDown={event=>keyboard(event,id)} onPointerDown={event=>pointerDown(event,id)} onPointerMove={pointerMove} onPointerUp={event=>pointerEnd(event)} onPointerCancel={event=>pointerEnd(event,true)} onLostPointerCapture={event=>pointerEnd(event,true)}><GripVertical/></button>{props.renderItem(item,index)}</li>;})}</ul><p className="paper-settings-help" role="status" aria-live="polite">{visible?presentation.notice:''}</p></div>;
}
