import {useId,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {ApiClient} from '../../pwa/src/api';
import type {PaperDocument} from '../lib/notebookDocument';
import {preparePaperReadAloudText} from '../lib/paperReadAloudText';
import {createBrowserPaperReadAloudEngine,createPaperReadAloudController,type PaperReadAloudSnapshot,type PaperReadAloudVoice} from '../lib/paperReadAloud';
import './paper-read-aloud.css';

export interface PaperReadAloudProps {
 document:PaperDocument;pageId:string;accountId:string;spaceId:string;noteId:string;api?:ApiClient;
 /** Opaque owner incarnation. current must also bind the exact canonical source
  * and any editing/visibility restrictions chosen by the owning Notebook. */
 source:object;current:()=>boolean;visible:boolean;disabled?:boolean;
}
interface Authority {source:object;document:PaperDocument;revision:number;pageId:string;accountId:string;spaceId:string;noteId:string;api:ApiClient|undefined;visible:boolean;documentVisible:boolean;disabled:boolean;revoked:boolean;alive:boolean;apiCurrent:(()=>boolean)|null}
const idle:PaperReadAloudSnapshot=Object.freeze({status:'idle',completedChunks:0,totalChunks:0,message:''});
const active=(state:PaperReadAloudSnapshot)=>state.status==='starting'||state.status==='speaking'||state.status==='paused';
/** Canonical-page speech only. It never focuses an editor, mutates the graph,
 * persists preferences or resumes playback when its source becomes current. */
export function PaperReadAloud(props:PaperReadAloudProps){
 const id=useId(),latest=useRef(props),[documentVisible,setDocumentVisible]=useState(()=>!document.hidden);latest.current=props;
 const authority=useRef<Authority|null>(null);let lost=false;try{lost=!!authority.current?.apiCurrent&&!authority.current.apiCurrent();}catch{lost=true;}
 const previous=authority.current;if(previous&&lost)previous.revoked=true;
 // A lost API lease stays false forever. Create a new idle incarnation for a
 // later voluntary click, never reactivate that lease or its old callbacks.
 // A generic current(false) is sticky until a real source/visibility change;
 // renewing every revoked render would loop while an opening view is blocked.
 if(!previous||lost||previous.source!==props.source||previous.document!==props.document||previous.revision!==props.document.revision||previous.pageId!==props.pageId||previous.accountId!==props.accountId||previous.spaceId!==props.spaceId||previous.noteId!==props.noteId||previous.api!==props.api||previous.visible!==props.visible||previous.documentVisible!==documentVisible||previous.disabled!==!!props.disabled){
  if(previous)previous.revoked=true;
  authority.current={source:props.source,document:props.document,revision:props.document.revision,pageId:props.pageId,accountId:props.accountId,spaceId:props.spaceId,noteId:props.noteId,api:props.api,visible:props.visible,documentVisible,disabled:!!props.disabled,revoked:false,alive:false,apiCurrent:null};
 }
 const captured=authority.current!;
 const [engine]=useState(createBrowserPaperReadAloudEngine),[open,setOpen]=useState(false),[voices,setVoices]=useState<readonly PaperReadAloudVoice[]>([]),[voiceId,setVoiceId]=useState(''),[rate,setRate]=useState(1),[notice,setNotice]=useState(''),[view,setView]=useState<{authority:Authority;state:PaperReadAloudSnapshot}>({authority:captured,state:idle});
 const holder=useRef<{authority:Authority;controller:ReturnType<typeof createPaperReadAloudController>}|null>(null),trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null),[position,setPosition]=useState({top:12,left:12,width:340,maxHeight:400}),selectedVoice=voices.find(voice=>voice.id===voiceId)??voices.find(voice=>voice.default)??voices[0],state=view.authority===captured?view.state:idle;
 const selectedVoiceRef=useRef(selectedVoice?.id??'');selectedVoiceRef.current=selectedVoice?.id??'';
 const current=(ticket:Authority,captureApi=true)=>{
  if(!ticket.alive||ticket.revoked||authority.current!==ticket)return false;const value=latest.current;
  let allowed=false;try{allowed=value.visible&&!value.disabled&&value.source===ticket.source&&value.document===ticket.document&&value.document.noteId===ticket.noteId&&value.document.revision===ticket.revision&&value.pageId===ticket.pageId&&value.accountId===ticket.accountId&&value.spaceId===ticket.spaceId&&value.noteId===ticket.noteId&&value.api===ticket.api&&!document.hidden&&value.current();}catch{}
  if(!allowed){ticket.revoked=true;return false;}
  // Capturing can bind ApiClient. Only the admitted current source may do so,
  // and a captured lease can never become valid after its API epoch changes.
  if(captureApi&&!ticket.apiCurrent)try{ticket.apiCurrent=ticket.api?ticket.api.captureSessionAuthority(ticket.accountId):()=>true;}catch{ticket.revoked=true;return false;}
  try{if(ticket.apiCurrent&&!ticket.apiCurrent())ticket.revoked=true;}catch{ticket.revoked=true;}
  return !ticket.revoked&&ticket.alive&&authority.current===ticket;
 };
 useLayoutEffect(()=>{
  captured.alive=true;let stopped=false;
  const controller=createPaperReadAloudController(engine,next=>{if(!stopped&&captured.alive&&authority.current===captured)setView({authority:captured,state:next});});const entry={authority:captured,controller};holder.current=entry;setView({authority:captured,state:idle});setNotice('');
  const refresh=()=>{if(stopped||!current(captured,false))return;try{const next=engine?.voices()??[],chosen=selectedVoiceRef.current;setVoices(next);if(chosen&&!next.some(voice=>voice.id===chosen)){controller.stop('La liste des voix a changé ; choisis une voix avant de relancer.');setVoiceId('');}}catch{controller.stop('La liste des voix n’est plus disponible.');setVoices([]);setNotice('Les voix de cet appareil ne sont pas disponibles.');}};
  const hidden=()=>{if(document.hidden){captured.revoked=true;controller.stop('La page est masquée ; la lecture est arrêtée.');}setDocumentVisible(!document.hidden);},leaving=()=>{captured.revoked=true;controller.stop('La lecture est arrêtée.');};
  refresh();const unsubscribe=engine?.subscribeVoices?.(refresh),timer=setInterval(()=>controller.verifyAuthority(),50);document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',leaving);
  return()=>{stopped=true;captured.alive=false;clearInterval(timer);unsubscribe?.();document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',leaving);controller.dispose();if(holder.current===entry)holder.current=null;};
 },[captured,engine]);
 const sameController=()=>holder.current?.authority===captured?holder.current.controller:null;
 const stop=()=>sameController()?.stop();
 useLayoutEffect(()=>{
  if(!open||!props.visible||!documentVisible)return;let stopped=false;const visual=window.visualViewport;
  const update=()=>{const button=trigger.current,overlay=panel.current;if(stopped||!button||!overlay||authority.current!==captured)return;const box=button.getBoundingClientRect(),left=visual?.offsetLeft??0,top=visual?.offsetTop??0,width=visual?.width??window.innerWidth,height=visual?.height??window.innerHeight,usable=Math.max(1,height-24),w=Math.max(1,Math.min(340,width-24)),below=top+height-box.bottom-20,above=box.top-top-20,desired=Math.min(300,usable);let y=top+12,maxHeight=usable;
   if(below>=desired){y=box.bottom+8;maxHeight=Math.min(480,below);}else if(above>=desired){maxHeight=Math.min(480,above);y=Math.max(top+12,box.top-8-Math.min(overlay.getBoundingClientRect().height||320,maxHeight));}
   const next={top:y,left:Math.max(left+12,Math.min(box.right-w,left+width-w-12)),width:w,maxHeight};setPosition(previous=>Object.keys(next).every(key=>next[key as keyof typeof next]===previous[key as keyof typeof previous])?previous:next);
  };
  const outside=(event:PointerEvent)=>{const target=event.target;if(stopped||authority.current!==captured||!(target instanceof Node)||trigger.current?.contains(target)||panel.current?.contains(target))return;stop();setOpen(false);};
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(update);let parent:HTMLElement|null=trigger.current;while(parent){observer?.observe(parent);parent=parent.parentElement;}if(panel.current)observer?.observe(panel.current);
  window.addEventListener('resize',update);window.addEventListener('scroll',update,true);visual?.addEventListener('resize',update);visual?.addEventListener('scroll',update);document.addEventListener('pointerdown',outside,true);update();
  return()=>{stopped=true;observer?.disconnect();window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);visual?.removeEventListener('resize',update);visual?.removeEventListener('scroll',update);document.removeEventListener('pointerdown',outside,true);};
 },[open,props.visible,documentVisible,captured]);
 const read=()=>{const controller=sameController();if(!controller||!current(captured)||!selectedVoice)return;setNotice('');const prepared=preparePaperReadAloudText({document:captured.document,pageId:captured.pageId});if(!current(captured))return;if(prepared.status!=='ready'){controller.stop();setNotice(prepared.reason);return;}controller.start({source:captured.source,current:()=>current(captured),chunks:prepared.chunks,voiceId:selectedVoice.id,lang:selectedVoice.lang,rate});};
 const chooseVoice=(value:string)=>{if(!current(captured))return;stop();setVoiceId(value);setNotice('');};
 const languages=[...new Set(voices.map(voice=>voice.lang))].sort(),language=selectedVoice?.lang??'';
 const unavailable=!engine?'Lecture vocale indisponible dans ce navigateur.':!voices.length?'Aucune voix disponible sur cet appareil. La liste peut encore être en cours de chargement.':'';
 const message=notice||state.message||unavailable||(active(state)?`${state.status==='paused'?'En pause':'Lecture en cours'} · partie ${Math.min(state.completedChunks+1,state.totalChunks)} sur ${state.totalChunks}`:'Texte canonique de la page sélectionnée.');
 return <section className="paper-read-aloud" aria-label="Lecture vocale" hidden={!props.visible||!documentVisible}>
  <button ref={trigger} type="button" aria-expanded={open} aria-controls={id} onClick={()=>{if(!current(captured,false))return;if(open)stop();setOpen(value=>!value);}}>Lecture vocale</button>
  {open&&props.visible&&documentVisible&&createPortal(<div ref={panel} id={id} className="paper-read-aloud-panel" style={position} role="region" aria-label="Options de lecture vocale" onKeyDown={event=>{event.stopPropagation();if(event.key==='Escape'&&authority.current===captured){event.preventDefault();stop();setOpen(false);}}}>
   <p>Écouter le texte de cette page. Les images demandent un texte déjà extrait.</p>
   <label>Langue<select aria-label="Langue de lecture" value={language} disabled={!voices.length||!props.visible||props.disabled} onChange={event=>{const voice=voices.find(voice=>voice.lang===event.target.value);if(voice)chooseVoice(voice.id);}}>{!languages.length&&<option value="">Indisponible</option>}{languages.map(lang=><option key={lang} value={lang}>{lang}</option>)}</select></label>
   <label>Voix<select aria-label="Voix de lecture" value={selectedVoice?.id??''} disabled={!voices.length||!props.visible||props.disabled} onChange={event=>chooseVoice(event.target.value)}>{!voices.length&&<option value="">Indisponible</option>}{voices.filter(voice=>voice.lang===language).map(voice=><option key={voice.id} value={voice.id}>{voice.name} · {voice.localService?'locale':'distante'}</option>)}</select></label>
   <label>Vitesse<select aria-label="Vitesse de lecture" value={rate} disabled={!props.visible||props.disabled} onChange={event=>{if(!current(captured))return;stop();setRate(Number(event.target.value));}}>{[.5,.75,1,1.25,1.5,1.75,2].map(value=><option key={value} value={value}>{value}×</option>)}</select></label>
   {selectedVoice&&<small>{selectedVoice.localService?'Voix locale annoncée par le navigateur ; sa disponibilité hors ligne dépend de cet appareil.':'Cette voix utilise un service distant ; le texte est confié au moteur vocal choisi par le navigateur.'}</small>}
   <div className="paper-read-aloud-actions"><button type="button" disabled={!selectedVoice||!props.visible||props.disabled||active(state)} onClick={read}>Lire la page</button><button type="button" disabled={!active(state)||state.status==='paused'} onClick={()=>{if(current(captured))sameController()?.pause();}}>Pause</button><button type="button" disabled={state.status!=='paused'} onClick={()=>{if(current(captured))sameController()?.resume();}}>Reprendre</button><button type="button" disabled={!active(state)} onClick={stop}>Arrêter</button></div>
   <p role="status" aria-live="polite">{message}</p>
  </div>,document.body)}
 </section>;
}
