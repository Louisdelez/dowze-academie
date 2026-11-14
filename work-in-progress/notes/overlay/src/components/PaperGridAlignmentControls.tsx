import {useLayoutEffect,useMemo,useRef,useState} from 'react';
import {PaperBackground} from './PaperBackground';
import {preparePaperGridAlignment,type PaperGridAnchor,type PaperGridAxes} from '../lib/paperGridAlignment';
import type {PaperDocument} from '../lib/notebookDocument';
import './paper-grid-alignment.css';

/** A preview never changes the notebook. Validation re-plans through the
 * parent's existing captured selection/owner/API authority and command writer. */
export function PaperGridAlignmentControls(props:{source:object;document:PaperDocument;pageId:string;ids:readonly string[];current:()=>boolean;onAlign:(anchor:PaperGridAnchor,axes:PaperGridAxes)=>boolean;onCancel:()=>void;onNotice:(message:string)=>void}){
 const latest=useRef(props),alive=useRef(false),retired=useRef(false);latest.current=props;
 const [anchor,setAnchor]=useState<PaperGridAnchor>('top-left'),[axes,setAxes]=useState<PaperGridAxes>('both'),[closed,setClosed]=useState(false);
 const admitted=()=>{if(!alive.current||retired.current||latest.current.source!==props.source)return false;try{if(props.current()===true)return true;}catch{}retired.current=true;return false;};
 useLayoutEffect(()=>{
  alive.current=true;retired.current=false;const win=window,doc=window.document;
  const retire=()=>{const active=admitted();retired.current=true;setClosed(true);if(active)props.onCancel();};
  const hidden=()=>{if(doc.visibilityState==='hidden')retire();};
  win.addEventListener('blur',retire);doc.addEventListener('visibilitychange',hidden);
  return()=>{alive.current=false;retired.current=true;win.removeEventListener('blur',retire);doc.removeEventListener('visibilitychange',hidden);};
 },[]);
 const preview=useMemo(()=>{try{return {plan:preparePaperGridAlignment(props.document,props.pageId,props.ids,anchor,axes),reason:''};}catch(error){return {plan:null,reason:String(error instanceof Error?error.message:error)};}},[props.document,props.pageId,props.ids,anchor,axes]);
 const cancel=()=>{if(!admitted())return;setClosed(true);props.onCancel();};
 const apply=()=>{if(!admitted()||!preview.plan)return;try{if(!props.onAlign(anchor,axes))throw Error('La sélection a changé. Reprenez l’alignement avant de réessayer.');if(admitted()){setClosed(true);props.onCancel();}}catch(error){if(admitted())props.onNotice(String(error instanceof Error?error.message:error));}};
 if(closed)return null;
 const plan=preview.plan;
 return <fieldset className="paper-grid-alignment" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cancel();}}}>
 <legend>Aligner sur la grille</legend>
 <label>Ancrage commun<select aria-label="Ancrage de l’alignement sur la grille" value={anchor} onChange={event=>{if(admitted())setAnchor(event.target.value as PaperGridAnchor);}}><option value="top-left">En haut à gauche</option><option value="center">Centre</option><option value="top-right">En haut à droite</option><option value="bottom-left">En bas à gauche</option><option value="bottom-right">En bas à droite</option></select></label>
 <label>Axes<select aria-label="Axes de l’alignement sur la grille" value={axes} onChange={event=>{if(admitted())setAxes(event.target.value as PaperGridAxes);}}><option value="both">Horizontal et vertical</option><option value="x">Horizontal seulement</option><option value="y">Vertical seulement</option></select></label>
 {plan&&<><div className="paper-grid-alignment-preview" style={{width:Math.min(240,240*plan.page.width/plan.page.height),aspectRatio:`${plan.page.width}/${plan.page.height}`}} role="img" aria-label="Aperçu de la sélection : contour pointillé avant, contour plein après alignement">
 <PaperBackground page={plan.page}/><svg viewBox={`0 0 ${plan.page.width} ${plan.page.height}`} aria-hidden="true"><rect x={plan.bounds.left} y={plan.bounds.top} width={plan.bounds.width} height={plan.bounds.height} fill="none" stroke="#64748b" strokeWidth="1.5" strokeDasharray="5 4" vectorEffect="non-scaling-stroke"/><rect x={plan.bounds.left+plan.delta.x} y={plan.bounds.top+plan.delta.y} width={plan.bounds.width} height={plan.bounds.height} fill="#2463eb22" stroke="#2463eb" strokeWidth="2" vectorEffect="non-scaling-stroke"/><circle cx={plan.target.x} cy={plan.target.y} r="4" fill="#2463eb"/></svg></div><p role="status">Déplacement : {Number(plan.delta.x.toFixed(3))} horizontal, {Number(plan.delta.y.toFixed(3))} vertical. Unités de page ; espacement {plan.spacing}. Toute la sélection se déplace ensemble.</p></>}
 {preview.reason&&<p role="status">{preview.reason}</p>}
 <button type="button" onClick={cancel}>Annuler l’alignement</button><button type="button" disabled={!plan} onClick={apply}>Valider l’alignement</button>
 </fieldset>;
}
