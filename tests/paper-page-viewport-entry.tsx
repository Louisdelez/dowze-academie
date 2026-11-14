import {useLayoutEffect,useRef,createElement,StrictMode,act,createRef} from 'react';
import {createRoot} from 'react-dom/client';
import {PaperPageViewport} from '../src/components/PaperPageViewport';
import type {PaperPageViewportProjectedSlot} from '../src/lib/paperPageViewport';

type Lifecycle=(phase:'host-mount'|'host-unmount'|'writer-mount'|'writer-unmount',pageId:string,instance:number)=>void;
let instanceSequence=0;
function SyntheticWriter({pageId,onLifecycle}:{pageId:string;onLifecycle:Lifecycle}){
 const instance=useRef<number|null>(null);if(instance.current===null)instance.current=++instanceSequence;
 const id=instance.current;
 useLayoutEffect(()=>{onLifecycle('writer-mount',pageId,id);return()=>onLifecycle('writer-unmount',pageId,id);},[pageId,id,onLifecycle]);
 return <textarea data-dummy-writer={pageId} data-writer-instance={id} aria-label={`Writer synthétique ${pageId}`} defaultValue="Brouillon synthétique"/>;
}
/** DOM retention seam only: no ProseMirror, durable writer, physical input or raster. */
export function SyntheticViewportPage({slot,onLifecycle}:{slot:PaperPageViewportProjectedSlot;onLifecycle:Lifecycle}){
 const instance=useRef<number|null>(null);if(instance.current===null)instance.current=++instanceSequence;
 const id=instance.current;
 useLayoutEffect(()=>{onLifecycle('host-mount',slot.pageId,id);return()=>onLifecycle('host-unmount',slot.pageId,id);},[slot.pageId,id,onLifecycle]);
 return <div data-lightweight-page={slot.pageId} data-host-instance={id} data-slot-mounted={String(slot.mounted)} data-slot-parked={String(slot.parked)}>
  <svg data-synthetic-page-geometry={slot.pageId} viewBox={`0 0 ${slot.pageWidth} ${slot.pageHeight}`} width={slot.pageWidth} height={slot.pageHeight}><title>Géométrie de page synthétique</title></svg>
  {slot.mounted?<SyntheticWriter pageId={slot.pageId} onLifecycle={onLifecycle}/>:<span data-page-placeholder={slot.pageId}>Page synthétique légère</span>}
 </div>;
}
export {PaperPageViewport,act,createElement,StrictMode,createRoot,createRef};
