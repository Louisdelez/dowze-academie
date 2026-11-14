import "./shared-study.css";
import { isStoredEvents } from '../../src/lib/workspaceValidation';
import { isStoredAssessments } from '../../src/lib/studyValidation';
import type { CalendarEvent, AssessmentRecord } from '../../src/types';
import type { Draft } from './storage';
import { useEffect, useId, useRef, useState } from 'react';

function RecordField({value,save,disabled,multiline=false,type='text',min,max}:{value:string;save:(value:string)=>void;disabled:boolean;multiline?:boolean;type?:string;min?:number;max?:number}) {
  const feedbackId=useId();
  const [text,setText]=useState(value);
  const focused=useRef(false);
  const original=useRef(value);
  const [conflict,setConflict]=useState(false);
  const [invalid,setInvalid]=useState(false);
  useEffect(()=>{if(!focused.current && !conflict){setText(value);original.current=value;}},[value,conflict]);
  const props={value:text,disabled,'aria-describedby':invalid||conflict?feedbackId:undefined,'aria-invalid':invalid || undefined,onFocus:()=>{focused.current=true;original.current=value;setConflict(false);},onChange:(event:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement>)=>{setText(event.target.value);setInvalid(false);},onBlur:()=>{
    focused.current=false;
    if(type === "number" && (!text.trim() || !Number.isFinite(Number(text)) || (min !== undefined && Number(text) < min) || (max !== undefined && Number(text) > max))) { setInvalid(true); return; }
    if(text===original.current){setText(value);return;}
    if(value!==original.current && value!==text){setConflict(true);return;}
    save(text);
  }};
  return <>{multiline?<textarea {...props}/>:<input {...props} type={type} min={min} max={max} step={type==='number'?'any':undefined}/>}{invalid && <small id={feedbackId} role="alert">Saisissez un nombre entre {min ?? 0} et {max ?? 'la limite indiquée'}.</small>}{conflict&&<span id={feedbackId} role="alert">Ce champ a changé sur un autre appareil. Votre saisie est conservée ici. <button type="button" onClick={()=>{save(text);setConflict(false);}}>Utiliser ma saisie</button><button type="button" onClick={()=>{setText(value);setConflict(false);}}>Utiliser la version reçue</button></span>}</>;
}

type Props={drafts:Draft[];onEdit:(type:Draft['type'],id:string,content:Record<string,unknown>)=>Promise<void>;onError:(message:string)=>void};
export function StudyPlanning({drafts,onEdit,onError}:Props) {
  const save=(event:CalendarEvent)=>void onEdit('planning',event.id,{...event}).catch(e=>onError(String(e)));
  const events = drafts.filter(d=>d.type==='planning' && isStoredEvents([d.content]));
  const now = Date.now();
  const upcoming = events.filter(d => new Date((d.content as CalendarEvent).end).getTime() >= now).sort((a,b) => new Date((a.content as CalendarEvent).start).getTime()-new Date((b.content as CalendarEvent).start).getTime());
  const past = events.filter(d => new Date((d.content as CalendarEvent).end).getTime() < now).sort((a,b) => new Date((b.content as CalendarEvent).start).getTime()-new Date((a.content as CalendarEvent).start).getTime());
  const renderEvent = (d: Draft) => {
    const event=d.content as CalendarEvent;
    return <article className="card" key={event.id}><h2>{event.title}</h2><p>{new Date(event.start).toLocaleString('fr-CH')} — {new Date(event.end).toLocaleString('fr-CH')}</p>
      <label>Titre de l’événement<RecordField value={event.title} disabled={d.syncState==='conflict'} save={value=>{const title=value.trim();if(title && title!==event.title)save({...event,title});}} /></label>
      <label>Lieu<RecordField value={event.location??''} disabled={d.syncState==='conflict'} save={location=>{if(location!==event.location)save({...event,location});}} /></label>
      <label>Consignes<RecordField multiline value={event.description??''} disabled={d.syncState==='conflict'} save={description=>{if(description!==event.description)save({...event,description});}} /></label>
      {d.syncState === "conflict" && <p role="status">Deux versions ont été conservées. Choisissez la version à partager pour modifier cet événement.</p>}
    </article>;
  
  };
  return <section className="shared-study shared-study-planning"><h1>Mon planning</h1><p className="shared-study-caption">Les champs sont enregistrés quand vous les quittez.</p>
    <h2>À venir</h2>{upcoming.length ? upcoming.map(renderEvent) : <div className="shared-study-empty"><h3>{events.length ? "Votre planning à venir est libre" : "Votre année prend forme"}</h3><p>{events.length ? "Les événements passés restent accessibles ci-dessous." : "Vos événements apparaîtront ici après synchronisation."}</p></div>}
    {!!past.length && <details className="shared-study-history"><summary>Événements passés · {past.length}</summary>{past.map(renderEvent)}</details>}
  </section>;
}
export function StudyResults({drafts,onEdit,onError}:Props) {
  const save=(exam:AssessmentRecord)=>void onEdit('examens',exam.id,{...exam,updatedAt:new Date().toISOString()}).catch(e=>onError(String(e)));
  const exams = drafts.filter(d=>d.type==='examens' && isStoredAssessments([d.content])).sort((a,b)=>(b.content as AssessmentRecord).assessmentDate.localeCompare((a.content as AssessmentRecord).assessmentDate));
  return <section className="shared-study shared-study-results"><h2>Résultats et évaluations</h2>{!exams.length && <p>Vos évaluations et résultats apparaîtront ici après synchronisation.</p>}{exams.map(d=>{
    const exam=d.content as AssessmentRecord;
    return <article className="card" key={exam.id}><h3>{exam.title}</h3><p>{new Intl.DateTimeFormat('fr-CH', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${exam.assessmentDate}T00:00:00Z`))} · {exam.score}/{exam.maxScore}</p><p>{exam.appreciation}</p>
      <label>Points obtenus<RecordField type="number" min={0} max={exam.maxScore} value={String(exam.score)} disabled={d.syncState==='conflict'} save={value=>{const score=Number(value);if(value && Number.isFinite(score) && score>=0 && score<=exam.maxScore && score!==exam.score)save({...exam,score});}} /></label>
      <label>Note personnelle<RecordField multiline value={exam.personalNote??''} disabled={d.syncState==='conflict'} save={personalNote=>{if(personalNote!==exam.personalNote)save({...exam,personalNote});}} /></label>
    </article>;
  })}</section>;
}
