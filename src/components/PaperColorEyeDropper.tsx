import {useLayoutEffect,useRef,useState} from 'react';
import {Pipette} from 'lucide-react';
import {paperEyeDropperAvailable,pickPaperEyeDropperColor} from '../lib/paperEyeDropper';
const fallback='La pipette n’est pas disponible ici. Choisissez une couleur ou saisissez son code HEX.';
/** Samples only a local color draft. The owning palette's existing explicit
 * Add action retains its normal scoped CAS and history contract. */
export function PaperColorEyeDropper({source,current,onColor,disabled=false}:{source:object;current:()=>boolean;onColor:(color:string)=>void;disabled?:boolean}){
 const latest=useRef({source,current,disabled}),lifetime=useRef(0),mounted=useRef(false),job=useRef<{source:object;controller:AbortController;epoch:number}|null>(null);
 latest.current={source,current,disabled};
 const [state,setState]=useState<{source:object;pending:boolean;notice:string}>({source,pending:false,notice:''}),available=paperEyeDropperAvailable();
 useLayoutEffect(()=>{mounted.current=true;const epoch=++lifetime.current;return()=>{mounted.current=false;lifetime.current++;if(job.current?.epoch===epoch)job.current.controller.abort();};},[source]);
 const sample=async()=>{
  if(!mounted.current||latest.current.source!==source||latest.current.disabled||job.current||current()!==true)return;
  const operation={source,controller:new AbortController(),epoch:lifetime.current};job.current=operation;
  const live=()=>mounted.current&&lifetime.current===operation.epoch&&latest.current.source===source&&job.current===operation&&!operation.controller.signal.aborted&&current()===true;
  setState({source,pending:true,notice:''});
  try{
   const result=await pickPaperEyeDropperColor(live,operation.controller.signal);
   if(!live())return;
   if(result.status==='picked'){onColor(result.color);setState({source,pending:false,notice:`Couleur prélevée : ${result.color}. Choisissez Ajouter pour la conserver.`});}
   else setState({source,pending:false,notice:result.status==='cancelled'?'Prélèvement annulé. Votre palette est inchangée.':result.status==='unavailable'?fallback:'La pipette n’a pas pu prélever de couleur. Choisissez une couleur ou saisissez son code HEX.'});
  }finally{if(job.current===operation){job.current=null;if(mounted.current&&latest.current.source===source&&lifetime.current===operation.epoch)setState(old=>old.source===source?{...old,pending:false}:old);}}
 };
 const pending=state.source===source&&state.pending;
 return <div className="paper-eye-dropper"><button type="button" style={{minHeight:44}} aria-label="Prélever une couleur avec la pipette" disabled={disabled||pending||!available} aria-busy={pending} onClick={()=>{void sample();}}><Pipette/>{pending?'Choisissez un pixel…':'Pipette'}</button><p className="paper-settings-help" role="status">{!available?fallback:state.source===source&&state.notice?state.notice:'Prélevez une couleur à l’écran, puis ajoutez-la à votre palette. Échap annule le prélèvement.'}</p></div>;
}
