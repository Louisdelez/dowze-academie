import {useEffect,useRef,useState} from 'react';
import {type PaperInterruptedInkReceipt,type PaperInkRecoveryScope} from '../lib/paperInterruptedInk';
import {listPaperInkRecoveryEntries,readPaperInkRecoveryEntry,finishPaperInkPrefixRecovery,type PaperInkRecoveryEntry} from '../lib/paperInkPrefixRecovery';
import type {InkPoint,PaperDocument} from '../lib/notebookDocument';

interface Props {
 scope:PaperInkRecoveryScope;current:()=>boolean;getDocument:()=>PaperDocument|null;disabled:boolean;
 onRestore:(receipt:PaperInterruptedInkReceipt,points:InkPoint[],destination:'original'|'new-page')=>Promise<void>;
 onClose:()=>void;
 isPending?:(id:string)=>boolean;
}
const tools={pen:'Stylo',pencil:'Crayon',calligraphy:'Calligraphie',highlighter:'Surligneur'};
export function PaperInterruptedInkPanel(props:Props){
 const [receipts,setReceipts]=useState<PaperInkRecoveryEntry[]>([]),[notice,setNotice]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState<string|null>(null);
 const live=useRef(false),request=useRef(0),operation=useRef(false),source=useRef({...props.scope}),latest=useRef(props);latest.current=props;
 const valid=()=>live.current&&source.current.accountId===latest.current.scope.accountId&&source.current.spaceId===latest.current.scope.spaceId&&source.current.noteId===latest.current.scope.noteId&&latest.current.current();
 const refresh=async()=>{
  const ticket=++request.current;setLoading(true);setNotice('');
  try{const rows=await listPaperInkRecoveryEntries(props.scope,valid,id=>latest.current.isPending?.(id)===true);if(valid()&&ticket===request.current)setReceipts(rows);}
  catch(error){if(valid()&&ticket===request.current)setNotice(String(error instanceof Error?error.message:error));}
  finally{if(valid()&&ticket===request.current)setLoading(false);}
 };
 useEffect(()=>{live.current=true;void refresh();return()=>{live.current=false;request.current++;};},[]);
 const restore=async(entry:PaperInkRecoveryEntry,destination:'original'|'new-page')=>{
  const receipt=entry.kind==='receipt'?entry.receipt:entry.header;
  if(operation.current||props.disabled||!valid())return;operation.current=true;setBusy(receipt.id);setNotice('');
  try{const loaded=await readPaperInkRecoveryEntry(props.scope,entry,valid,id=>latest.current.isPending?.(id)===true);if(!valid())return;
   if(!loaded){await refresh();if(valid())setNotice('Ce trait est déjà enregistré. Aucune nouvelle copie n’a été ajoutée.');return;}
   await latest.current.onRestore(loaded.receipt,loaded.points,destination);if(!valid())return;if(loaded.prefix)await finishPaperInkPrefixRecovery(props.scope,loaded.prefix,valid);if(!valid())return;await refresh();if(valid())setNotice('Le trait a été restauré. Sa copie d’origine reste conservée.');
  }catch(error){if(valid())setNotice(String(error instanceof Error?error.message:error));}
  finally{operation.current=false;if(valid())setBusy(null);}
 };
 const document=props.getDocument();
 return <section className="paper-ink-recovery" aria-label="Traits récupérables">
  <header><strong>Traits récupérables</strong><div><button type="button" disabled={loading||!!busy} onClick={()=>void refresh()}>Actualiser</button><button type="button" onClick={props.onClose} aria-label="Fermer les traits récupérables">Fermer</button></div></header>
  <p>Ces traits interrompus sont conservés sur cet appareil. Choisissez où restaurer une copie.</p>
  {notice&&<p role="status">{notice}</p>}{loading?<p role="status">Recherche des traits conservés…</p>:!receipts.length?<p>Aucun trait interrompu à récupérer pour cette note.</p>:<ul>{receipts.map(entry=>{
   const receipt=entry.kind==='receipt'?entry.receipt:entry.header;
   const original=document?.pages.find(page=>page.id===receipt.pageId),compatible=original&&original.width===receipt.geometry.width&&original.height===receipt.geometry.height&&original.rotation===receipt.geometry.rotation;
   return <li key={receipt.id}><div><strong>{tools[receipt.pen]}</strong><time dateTime={new Date(receipt.createdAt).toISOString()}>{new Intl.DateTimeFormat('fr-CH',{dateStyle:'short',timeStyle:'short'}).format(receipt.createdAt)}</time>{entry.kind==='prefix'&&<span>Début du trait conservé : {entry.header.confirmedCursor} points. La fin peut manquer après un arrêt brutal.</span>}{!compatible&&<span>La page d’origine a changé ou a été supprimée.</span>}</div><div><button type="button" disabled={props.disabled||!!busy||!compatible} onClick={()=>void restore(entry,'original')}>{busy===receipt.id?'Conservation…':'Restaurer sur la page d’origine'}</button><button type="button" disabled={props.disabled||!!busy} onClick={()=>void restore(entry,'new-page')}>Restaurer sur une nouvelle page</button></div></li>;
  })}</ul>}
 </section>;
}
