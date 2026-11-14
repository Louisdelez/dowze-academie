import {useEffect,useId,useRef,useState} from 'react';
import {Timer,Pause,Play,RotateCcw,X} from 'lucide-react';
import {appStorage} from '../lib/appStorage';
import {registerNotebookWriter} from '../lib/notebookSession';
import {createPaperWorkTimer,isPaperWorkTimerCheckpoint,type PaperWorkTimerSnapshot} from '../lib/paperWorkTimer';
import './paper-work-timer.css';

type Props={accountId:string;spaceId:string;noteId:string;visible:boolean;current:()=>boolean;clock?:()=>number};
const duration=(milliseconds:number)=>{const seconds=Math.ceil(milliseconds/1000);return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;};
const labels={idle:'Prêt',running:'En cours',paused:'En pause',complete:'Objectif atteint'};
/** A personal active-work clock. It never writes the note or awards an XP event. */
export function PaperWorkTimer(props:Props){return <ScopedPaperWorkTimer key={JSON.stringify([props.accountId,props.spaceId,props.noteId])} {...props}/>;}
function ScopedPaperWorkTimer({accountId,spaceId,noteId,visible,current,clock}:Props){
 const key='dowze.notebook.work-timer.'+JSON.stringify([accountId,spaceId,noteId]),id=useId();
 const context=useRef({key,visible,current});context.current={key,visible,current};
 const mounted=useRef(false),disposed=useRef(false),enabled=useRef(true),pending=useRef(0),submitted=useRef(''),expected=useRef<string|null>(null),readyRef=useRef(false),blocked=useRef(false),tail=useRef(Promise.resolve()),setupLease=useRef(0);
 const [ready,setReady]=useState(false),[blockedView,setBlockedView]=useState(false);const recovery=useRef(key+'.recovery.'+crypto.randomUUID());
 const [notice,setNotice]=useState(''),[open,setOpen]=useState(false);
 const [holder]=useState(()=>({timer:createPaperWorkTimer({clock:clock??(()=>performance.now())})}));
 const [snapshot,setSnapshot]=useState<PaperWorkTimerSnapshot>(()=>holder.timer.snapshot()),[minutes,setMinutes]=useState(String(snapshot.targetMinutes));
 const publish=(next:PaperWorkTimerSnapshot)=>setSnapshot(previous=>previous.status===next.status&&previous.activeMs===next.activeMs&&previous.targetMinutes===next.targetMinutes&&previous.counting===next.counting?previous:next);
 const owned=()=>mounted.current&&!disposed.current&&context.current.key===key&&context.current.current();
 const live=()=>owned()&&enabled.current;
 const foreground=()=>({visible:context.current.visible&&!document.hidden&&live(),focused:document.hasFocus()&&live()});
 const save=()=>{
  if(!readyRef.current||blocked.current)return;
  const value=JSON.stringify(holder.timer.checkpoint());if(value===submitted.current)return;submitted.current=value;pending.current++;
  tail.current=tail.current.then(async()=>{
   if(blocked.current)return;
   const original=expected.current;
   if(original){let valid=false;try{valid=isPaperWorkTimerCheckpoint(JSON.parse(original));}catch{}if(!valid)appStorage.setItem(recovery.current+'.source',original);}
   if(!await appStorage.compareAndSetItem(key,original,value)){
    blocked.current=true;holder.timer.setForeground({visible:false,focused:false});holder.timer.pause();
    appStorage.setItem(recovery.current,JSON.stringify(holder.timer.checkpoint()));await appStorage.flush();
    if(live()){publish(holder.timer.snapshot());setBlockedView(true);setNotice('Une autre vue a modifié cette séance. Ta durée est conservée séparément ; rouvre la note pour reprendre la version actuelle.');}
    return;
   }
   expected.current=value;
  }).catch(error=>{
   blocked.current=true;holder.timer.setForeground({visible:false,focused:false});holder.timer.pause();
   if(live()){publish(holder.timer.snapshot());setBlockedView(true);setNotice('Le minuteur reste en mémoire ; son enregistrement a échoué.');}
   throw error;
  }).finally(()=>pending.current--);
  void tail.current.catch(()=>{});
 };
 useEffect(()=>{
  mounted.current=true;disposed.current=false;enabled.current=true;let stopped=false;const lease=++setupLease.current,currentSetup=()=>!stopped&&setupLease.current===lease;
  // StrictMode replays setup after cleanup. Finish any accepted cleanup write before reopening.
  const loading=tail.current.then(()=>appStorage.readCurrentItem(key)).then(raw=>{
   if(!currentSetup()||!owned())return;let restored;
   if(raw)try{const parsed:unknown=JSON.parse(raw);if(isPaperWorkTimerCheckpoint(parsed))restored=parsed;}catch{}
   holder.timer=createPaperWorkTimer({clock:clock??(()=>performance.now()),restored});holder.timer.setForeground(foreground());expected.current=raw;
   submitted.current=JSON.stringify(holder.timer.checkpoint());readyRef.current=true;setReady(true);publish(holder.timer.snapshot());setMinutes(String(holder.timer.snapshot().targetMinutes));
  }).catch(()=>{if(currentSetup()&&owned())setNotice('Le minuteur ne peut pas encore retrouver sa séance enregistrée.');});
  const refresh=()=>{if(!currentSetup()||!live())return;holder.timer.setForeground(foreground());publish(holder.timer.snapshot());save();};
  const activity=(event:Event)=>{if(event.isTrusted&&currentSetup()&&live()){holder.timer.setForeground(foreground());holder.timer.activity();}};
  const names=['pointerdown','pointermove','keydown','wheel','touchstart'];for(const name of names)window.addEventListener(name,activity,{passive:true});
  window.addEventListener('focus',refresh);window.addEventListener('blur',refresh);document.addEventListener('visibilitychange',refresh);
  let samples=0;
  const interval=setInterval(()=>{if(!currentSetup()||!live()||!readyRef.current||blocked.current)return;holder.timer.setForeground(foreground());const next=holder.timer.sample();publish(next);if(++samples%15===0||next.status==='complete')save();},1000);
  const unregister=registerNotebookWriter(accountId,{flush:()=>{if(!currentSetup())return;holder.timer.setForeground(foreground());holder.timer.pause();save();},settled:async()=>{await loading;await tail.current;await appStorage.flush();},pending:()=>pending.current>0,suspend:()=>{if(!currentSetup())return;holder.timer.setForeground(foreground());holder.timer.pause();save();enabled.current=false;holder.timer.setForeground({visible:false,focused:false});},resume:()=>{if(!currentSetup()||disposed.current)return;enabled.current=true;holder.timer.setForeground(foreground());},dispose:()=>{if(!currentSetup())return;disposed.current=true;clearInterval(interval);enabled.current=false;holder.timer.setForeground({visible:false,focused:false});}});
  return()=>{stopped=true;holder.timer.setForeground({visible:false,focused:false});holder.timer.pause();save();disposed.current=true;mounted.current=false;clearInterval(interval);unregister();for(const name of names)window.removeEventListener(name,activity);window.removeEventListener('focus',refresh);window.removeEventListener('blur',refresh);document.removeEventListener('visibilitychange',refresh);};
 },[key,holder]);
 useEffect(()=>{if(mounted.current){holder.timer.setForeground(foreground());publish(holder.timer.snapshot());save();}},[visible]);
 const change=(action:()=>PaperWorkTimerSnapshot)=>{if(!live()||!readyRef.current||blocked.current)return;try{setNotice('');holder.timer.setForeground(foreground());publish(action());save();}catch(error){setNotice(String(error instanceof Error?error.message:error));}};
 const stateLabel=snapshot.status==='running'&&!snapshot.counting?'En attente d’activité':labels[snapshot.status];
 return <div className="paper-work-timer">
  <button type="button" className="paper-work-timer-trigger" aria-label={`Minuteur de travail : ${stateLabel}, ${duration(snapshot.remainingMs)} restantes`} disabled={!ready} aria-expanded={open} aria-controls={id} onClick={()=>{if(live())setOpen(value=>!value);}}><Timer size={16}/><time>{ready?duration(snapshot.remainingMs):'…'}</time></button>
  {notice&&!open&&<span className="paper-work-timer-notice" role="status">{notice}</span>}
  {open&&<section id={id} className="paper-work-timer-panel" aria-label="Minuteur de travail" onKeyDown={event=>{if(!live())return;if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);event.currentTarget.parentElement?.querySelector<HTMLButtonElement>('.paper-work-timer-trigger')?.focus();}}}>
   <header><strong>Temps de travail actif</strong><button type="button" aria-label="Fermer le minuteur" onClick={()=>{if(live())setOpen(false);}}><X size={16}/></button></header>
   <output className="paper-work-timer-time">{duration(snapshot.remainingMs)}</output>
   <progress value={snapshot.activeMs} max={snapshot.targetMinutes*60000} aria-label="Avancement de l’objectif de travail"/>
   <p className="paper-work-timer-state" aria-live="polite">{stateLabel}</p>
   <label>Objectif en minutes<input aria-label="Objectif du minuteur en minutes" type="number" disabled={blockedView} min={1} max={720} step={1} value={minutes} onChange={event=>{if(live())setMinutes(event.target.value);}}/></label>
   <div className="paper-work-timer-actions" inert={blockedView}>
    {snapshot.status==='idle'&&<button type="button" onClick={()=>change(()=>{holder.timer.reset(Number(minutes));return holder.timer.start();})}><Play size={16}/>Démarrer</button>}
    {snapshot.status==='running'&&<button type="button" onClick={()=>change(holder.timer.pause)}><Pause size={16}/>Pause</button>}
    {snapshot.status==='paused'&&<button type="button" onClick={()=>change(holder.timer.resume)}><Play size={16}/>Reprendre</button>}
    {snapshot.status!=='idle'&&<button type="button" onClick={()=>change(()=>holder.timer.reset(Number(minutes)))}><RotateCcw size={16}/>Nouvelle séance</button>}
   </div>
   <small>Le temps s’arrête quand tu quittes l’onglet ou restes inactif. Après réouverture, reprends ta séance.</small>
   {notice&&<p role="status">{notice}</p>}
  </section>}
 </div>;
}
