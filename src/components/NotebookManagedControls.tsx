import {useLayoutEffect,useRef,useState} from 'react';
import type {ManagedAdmissionPreview,createNotebookManagedApplication} from '../lib/notebookManagedApplication';
import './notebook-managed-controls.css';
type Application=ReturnType<typeof createNotebookManagedApplication>;
export interface NotebookManagedControlsProps {
 readonly source:object;readonly current:()=>boolean;
 readonly notes:readonly {id:string;title:string}[];
 /** Real App factory: it owns the captured account/API/raw port. */
 readonly create:(current:()=>boolean)=>Application;
 readonly onChanged?:()=>void|Promise<void>;
}
interface Held {readonly source:object;readonly noteId:string;readonly epoch:number;retired:boolean;application:Application}
/** Explicit opt-in on ONE note. Merely displaying the Library performs no
 * authentication, transport binding, admission or metadata write. */
export function NotebookManagedControls({source,current,notes,create,onChanged}:NotebookManagedControlsProps){
 const latest=useRef({source,current,create,onChanged,notes});latest.current={source,current,create,onChanged,notes};
 const actionRef=useRef<{source:object;retired:boolean}>({source,retired:false});
 const mounted=useRef(false),epoch=useRef(0),held=useRef<Held|null>(null),job=useRef<object|null>(null),selected=useRef(''),authority=useRef<object|null>(null),retiredRecords=useRef<Held[]>([]);
 const [noteId,setNoteId]=useState(''),[state,setState]=useState<{source:object;noteId:string;pending:boolean;preview?:Readonly<ManagedAdmissionPreview>;message:string;error:boolean}>({source,noteId:'',pending:false,message:'',error:false});
 if(held.current&&(held.current.source!==source||held.current.retired||!held.current.application.current())){held.current.retired=true;retiredRecords.current.push(held.current);held.current=null;authority.current=null;actionRef.current.retired=true;}
 if(actionRef.current.source!==source||actionRef.current.retired)actionRef.current={source,retired:false};
 const actionSource=actionRef.current;
 const dispose=(record:Held|null)=>{if(!record)return;record.retired=true;void record.application.dispose().catch(()=>{console.error('Le transport géré retiré attend une confirmation de fermeture. Ses reçus sont conservés.');});};
 useLayoutEffect(()=>{for(const record of retiredRecords.current.splice(0))dispose(record);});
 useLayoutEffect(()=>{mounted.current=true;++epoch.current;if(actionRef.current.retired){actionRef.current={source,retired:false};setState(old=>({...old}));}return()=>{mounted.current=false;actionRef.current.retired=true;++epoch.current;dispose(held.current);held.current=null;authority.current=null;job.current=null;};},[source]);
 const live=(record:Held)=>mounted.current&&!record.retired&&epoch.current===record.epoch&&latest.current.source===record.source&&selected.current===record.noteId&&held.current===record&&record.application.current();
 const choose=(id:string)=>{if(actionRef.current!==actionSource||actionSource.retired||latest.current.source!==source||!mounted.current||current()!==true||id&&!latest.current.notes.some(note=>note.id===id))return;if(selected.current===id)return;selected.current=id;dispose(held.current);held.current=null;authority.current=null;job.current=null;setNoteId(id);setState({source,noteId:id,pending:false,message:'',error:false});};
 const run=async(action:'sync'|'trash'|'restore')=>{
  const id=noteId,capturedEpoch=epoch.current;
  if(actionRef.current!==actionSource||actionSource.retired)return;
  if(!mounted.current||latest.current.source!==source||selected.current!==id||!id||!latest.current.notes.some(note=>note.id===id)||job.current||current()!==true)return;
  let record=held.current;
  if(record&&!record.application.current()){actionSource.retired=true;dispose(record);held.current=null;authority.current=null;setState({source,noteId:id,pending:false,message:'La session a changé. Réessayez avec votre connexion actuelle ; la note reste enregistrée.',error:true});return;}
  if(!record||record.source!==source||record.noteId!==id||record.epoch!==capturedEpoch||!record.application.current()){
   dispose(record);const token={};authority.current=token;let revoked=false;
   const admittedCurrent=()=>{try{if(actionRef.current!==actionSource||actionSource.retired||!mounted.current||epoch.current!==capturedEpoch||latest.current.source!==source||selected.current!==id||current()!==true)revoked=true;}catch{revoked=true;}return !revoked;};
   // No capture or API bind is allowed before the real App source is current.
   if(!admittedCurrent())return;
   try{record={source,noteId:id,epoch:capturedEpoch,retired:false,application:create(()=>admittedCurrent()&&authority.current===token)};held.current=record;}catch(error){if(admittedCurrent())setState({source,noteId:id,pending:false,message:error instanceof Error?error.message:String(error),error:true});return;}
  }
  const owned=record,operation={};job.current=operation;setState({source,noteId:id,pending:true,message:'',error:false});
  try{
   if(action==='sync'){
    let preview=await owned.application.inspect(id);if(!live(owned))return;
    if(preview.status!=='managed'){await owned.application.admit(id);if(!live(owned))return;preview=await owned.application.inspect(id);if(!live(owned))return;}
    const result=await owned.application.synchronize(id);
    if(live(owned))setState({source,noteId:id,pending:false,preview,message:'remainingChanges'in result&&result.remainingChanges?'Version précédente confirmée. Votre nouvelle version reste enregistrée sur cet appareil ; synchronisez-la à nouveau.':'À jour',error:false});
   }else{
    const result=await owned.application.lifecycle(id,action);
    if(live(owned))setState(old=>({...old,pending:false,message:result.warning||(action==='trash'?'Note dans la corbeille.':'Note restaurée.'),error:result.synchronization!=='acknowledged'}));
   }
   if(live(owned))await onChanged?.();
  }catch(error){if(live(owned))setState(old=>({...old,pending:false,message:error instanceof Error?error.message:String(error),error:true}));else if(mounted.current&&latest.current.source===source&&selected.current===id&&epoch.current===capturedEpoch)setState({source,noteId:id,pending:false,message:'La session a changé. La note reste enregistrée sur cet appareil ; reconnectez-vous puis réessayez.',error:true});}
  finally{if(job.current===operation){job.current=null;if(mounted.current&&latest.current.source===source&&selected.current===id&&epoch.current===capturedEpoch)setState(old=>old.source===source&&old.noteId===id?{...old,pending:false}:old);}}
 };
 const displayed=state.source===source&&state.noteId===noteId?state:undefined,pending=displayed?.pending??false,preview=displayed?.preview;
 return <section className="notebook-managed-controls" aria-label="Synchronisation des notes"><h2>Retrouver vos notes sur vos appareils</h2><p>Choisissez une note enregistrée pour la synchroniser avec votre compte Dowze.</p><label>Note<select aria-label="Note à synchroniser" value={notes.some(note=>note.id===noteId)?noteId:''} disabled={pending} onChange={event=>choose(event.target.value)}><option value="">Choisir une note</option>{notes.map(note=><option key={note.id} value={note.id}>{note.title||'Sans titre'}</option>)}</select></label><div className="notebook-managed-actions"><button type="button" disabled={!noteId||pending} onClick={()=>{void run('sync');}}>Synchroniser cette note</button>{preview?.status==='managed'&&<button type="button" disabled={pending} onClick={()=>{void run('trash');}}>Mettre à la corbeille</button>}<button type="button" disabled={!noteId||pending} onClick={()=>{void run('restore');}}>Restaurer cette note</button></div>{pending&&<p role="status">Synchronisation…</p>}{displayed?.message&&<p role={displayed.error?'alert':'status'}>{displayed.message}</p>}{!pending&&!displayed?.message&&<p role="status">Enregistrée sur cet appareil</p>}</section>;
}
