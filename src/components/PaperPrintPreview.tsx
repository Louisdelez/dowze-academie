import {ownPaperPrintShell} from '../lib/paperPrintShell';
import {useId,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {createPaperPrintPreview,type PaperPrintPreviewController,type PreparedPaperPrint} from '../lib/paperPrint';
import type {PaperDocument} from '../lib/notebookDocument';
import type {NotebookMediaScope} from './NotebookEditor';
import './paper-print-preview.css';

export interface PaperPrintPreviewProps {
 prepared:PreparedPaperPrint;media:NotebookMediaScope;ownerKey:string;generation:string|number;
 current:()=>boolean;getCurrent:()=>PaperDocument|null;readOnly?:boolean;
 focusCurrent?:()=>boolean;onClose:()=>void;
}
interface PrintView {epoch:number;lifetime:number;controller:PaperPrintPreviewController;ready:boolean;unavailable:boolean}
interface RunningView extends PrintView {timer?:ReturnType<typeof setTimeout>;afterTarget?:Window;afterListener?:()=>void;attempt:number;endedAttempt:number;pendingSave:boolean}
const clearFrame=(frame:HTMLIFrameElement)=>{frame.style.opacity='0';frame.removeAttribute('src');frame.src='about:blank';};


/** Explicit full-PDF preview. No print call is made from an effect, load event,
 * timer or preparation completion; only trusted user actions may request it. */
export function PaperPrintPreview(props:PaperPrintPreviewProps){
 const {prepared,media,ownerKey,generation,readOnly=false}=props,titleId=useId(),dialog=useRef<HTMLDialogElement>(null),frame=useRef<HTMLIFrameElement>(null),exit=useRef<HTMLButtonElement>(null),mounted=useRef(false),latest=useRef(props);latest.current=props;
 const authority=useRef({key:'',epoch:0,prepared,api:media.api});
 const key=JSON.stringify([ownerKey,generation,media.accountId,media.spaceId,prepared.source.noteId,prepared.source.revision,readOnly]);
 if(authority.current.key!==key||authority.current.prepared!==prepared||authority.current.api!==media.api)authority.current={key,epoch:authority.current.epoch+1,prepared,api:media.api};
 const epoch=authority.current.epoch,sequence=useRef(0),running=useRef<RunningView|null>(null),closed=useRef(false),printRef=useRef((_event:Event)=>{});
 const [view,setView]=useState<PrintView|null>(null),[notice,setNotice]=useState(''),[saving,setSaving]=useState(false);
 const owned=(captured:number)=>mounted.current&&!closed.current&&authority.current.epoch===captured;
 const sourceCurrent=(captured:number)=>{
  if(!owned(captured))return false;const value=latest.current,pdf=value.prepared;
  try{return pdf.ownerKey===value.ownerKey&&pdf.generation===value.generation&&pdf.accountId===value.media.accountId&&pdf.spaceId===value.media.spaceId&&pdf.api===value.media.api&&value.getCurrent()===pdf.source&&value.current()&&pdf.current();}catch{return false;}
 };
 const close=()=>{if(!owned(epoch))return;closed.current=true;const active=running.current;if(frame.current&&frame.current.dataset.printLifetime===String(active?.lifetime))clearFrame(frame.current);active?.controller.dispose();latest.current.onClose();};
 const closeRef=useRef(close);closeRef.current=close;
 useLayoutEffect(()=>{
  mounted.current=true;closed.current=false;const target=dialog.current;if(!target)return;const previousFocus=document.activeElement as HTMLElement|null;
  const initial={ownerKey,accountId:media.accountId,spaceId:media.spaceId,api:media.api,noteId:prepared.source.noteId,generation,readOnly},releaseBody=ownPaperPrintShell(document);
  try{if(typeof target.showModal==='function')target.showModal();else target.setAttribute('open','');}catch{target.setAttribute('open','');}exit.current?.focus();
  const keyboard=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();closeRef.current();return;}
   if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='p'){event.preventDefault();const active=running.current;if(!active?.ready||!sourceCurrent(active.epoch)){setNotice('Attendez le PDF complet, puis utilisez Imprimer ou Enregistrer le PDF.');return;}printRef.current(event);}
  };
  target.addEventListener('keydown',keyboard);
  return()=>{
   mounted.current=false;target.removeEventListener('keydown',keyboard);releaseBody();try{if(target.open&&typeof target.close==='function')target.close();}catch{}
   const value=latest.current;let restore=false;try{restore=initial.ownerKey===value.ownerKey&&initial.accountId===value.media.accountId&&initial.spaceId===value.media.spaceId&&initial.api===value.media.api&&initial.noteId===value.prepared.source.noteId&&initial.generation===value.generation&&initial.readOnly===(value.readOnly??false)&&(value.focusCurrent?.()??value.current());}catch{}
   if(restore&&previousFocus?.isConnected)previousFocus.focus();
  };
 },[]);
 useLayoutEffect(()=>{
  if(!sourceCurrent(epoch)){setView(null);setNotice('Cet aperçu a été révoqué. Fermez-le et préparez le carnet courant.');return;}
  let controller:PaperPrintPreviewController;try{controller=createPaperPrintPreview(prepared,()=>sourceCurrent(epoch));}catch(error){setNotice(String(error instanceof Error?error.message:error));return;}
  const active:RunningView={epoch,lifetime:++sequence.current,controller,ready:false,unavailable:false,attempt:0,endedAttempt:0,pendingSave:false};running.current=active;setView(active);setSaving(false);setNotice('Chargement de l’aperçu PDF complet…');let watch=0,stopped=false;
  active.timer=setTimeout(()=>{if(stopped||running.current!==active||!controller.current()||active.ready)return;active.unavailable=true;if(frame.current?.dataset.printLifetime===String(active.lifetime))clearFrame(frame.current);setView({...active});setNotice('L’aperçu intégré n’est pas disponible. Enregistrez le PDF complet pour l’ouvrir dans votre lecteur.');},15_000);
  const inspect=()=>{if(stopped)return;if(!controller.current()){if(frame.current?.dataset.printLifetime===String(active.lifetime))clearFrame(frame.current);setView(previous=>previous?.lifetime===active.lifetime?{...previous,unavailable:true,ready:false}:previous);setNotice('Cet aperçu a été révoqué. Fermez-le et préparez le carnet courant.');return;}watch=requestAnimationFrame(inspect);};watch=requestAnimationFrame(inspect);
  return()=>{stopped=true;cancelAnimationFrame(watch);clearTimeout(active.timer);if(active.afterTarget&&active.afterListener)active.afterTarget.removeEventListener('afterprint',active.afterListener);if(frame.current?.dataset.printLifetime===String(active.lifetime))clearFrame(frame.current);controller.dispose();if(running.current===active)running.current=null;};
 },[epoch]);
 const activeView=()=>{const active=running.current;return view&&active?.lifetime===view.lifetime&&active.epoch===epoch&&active.controller.current()?active:null;};
 const ready=(target:HTMLIFrameElement)=>{
  const active=activeView();if(!active||active.unavailable||target.dataset.printLifetime!==String(active.lifetime)||!active.controller.ready(target))return;
  active.ready=true;clearTimeout(active.timer);setView({...active});setNotice('PDF complet prêt. Vérifiez les pages avant de demander l’impression.');
  try{const win=target.contentWindow;if(win){if(active.afterTarget&&active.afterListener)active.afterTarget.removeEventListener('afterprint',active.afterListener);active.afterTarget=win;active.afterListener=()=>{if(running.current!==active||!active.controller.current())return;active.endedAttempt=active.attempt;setNotice('Dialogue fermé. Le navigateur ne confirme pas si le carnet a été imprimé.');};win.addEventListener('afterprint',active.afterListener);}}catch{}
 };
 const print=(event:Event)=>{
  const active=activeView(),target=frame.current;if(!active?.ready||!target)return;active.attempt++;const attempt=active.attempt,result=active.controller.request(target,event);
  if(running.current!==active||!active.controller.current())return;if(active.endedAttempt!==attempt)setNotice(result.message);
 };
 printRef.current=print;
 const save=async(event:Event)=>{
  const active=activeView();if(!active||active.pendingSave)return;active.pendingSave=true;setSaving(true);const result=await active.controller.save(event);
  if(running.current!==active||!active.controller.current())return;active.pendingSave=false;setSaving(false);setNotice(result.message);
 };
 const live=sourceCurrent(epoch),active=activeView();
 return createPortal(<dialog ref={dialog} className="paper-print-preview" aria-labelledby={titleId} aria-modal="true" onCancel={event=>{event.preventDefault();closeRef.current();}}>
  <header><div><h2 id={titleId}>Aperçu avant impression</h2>{live&&<p>{prepared.filename} · {prepared.pageCount} page{prepared.pageCount>1?'s':''} · carnet complet</p>}</div><button ref={exit} type="button" aria-label="Fermer l’aperçu d’impression" onClick={close}>Fermer</button></header>
  <p>Le PDF reprend les pages, orientations et annotations du carnet exporté. Réglez le papier, les marges et l’échelle dans le dialogue de votre imprimante ; ces choix ne modifient pas la note.</p>
  <div className="paper-print-controls"><button type="button" disabled={!live||!active?.ready||!!active.unavailable} onClick={event=>print(event.nativeEvent)}>Imprimer le PDF complet</button><button type="button" disabled={!live||!active||saving} onClick={event=>void save(event.nativeEvent)}>{saving?'Enregistrement…':'Enregistrer le PDF complet'}</button></div>
  <p className="paper-print-status" role="status">{notice}</p>
  <div className="paper-print-viewport">{live&&view&&view.epoch===epoch&&!view.unavailable&&view.controller.current()?<iframe key={view.lifetime} ref={frame} data-print-lifetime={view.lifetime} title="PDF complet du carnet à imprimer" src={view.controller.url} onLoad={event=>ready(event.currentTarget)} onError={()=>{const ownedView=activeView();if(!ownedView)return;clearTimeout(ownedView.timer);ownedView.unavailable=true;setView({...ownedView});setNotice('Aperçu intégré indisponible. Enregistrez le PDF complet et ouvrez-le dans votre lecteur PDF.');}}/>:<p>L’aperçu intégré est indisponible. Le PDF complet peut être enregistré tant que ce carnet reste courant.</p>}</div>
  <p className="paper-print-parent-warning">Pour imprimer le carnet complet, utilisez le bouton Imprimer le PDF complet ou ouvrez le PDF enregistré. Le reste de l’application ne fait pas partie de ce document.</p>
 </dialog>,document.body);
}
