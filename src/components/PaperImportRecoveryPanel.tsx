import {useEffect,useRef,useState} from 'react';

export type PaperImportRecoveryKind='pdf'|'archive'|'legacy-archive';
export interface PaperImportRecoveryItem {kind:PaperImportRecoveryKind;id:string;sourceName:string;createdAt?:string;status:string;details?:string;resumable:boolean;originalAvailable?:boolean;resumeLabel?:string}
interface Props {current:()=>boolean;disabled:boolean;load:(current:()=>boolean)=>Promise<PaperImportRecoveryItem[]>;onResume:(kind:PaperImportRecoveryKind,id:string)=>Promise<void>;onOriginal:(kind:PaperImportRecoveryKind,id:string)=>Promise<void>;onClose:()=>void}
export function PaperImportRecoveryPanel(props:Props){
 const [items,setItems]=useState<PaperImportRecoveryItem[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState<string|null>(null),[notice,setNotice]=useState('');
 const latest=useRef(props),live=useRef(false),serial=useRef(0),pending=useRef(false);latest.current=props;
 const current=()=>live.current&&latest.current.current();
 const refresh=async()=>{const ticket=++serial.current;setLoading(true);try{const rows=await latest.current.load(current);if(!current()||ticket!==serial.current)return false;setItems(rows);return true;}catch(error){if(current()&&ticket===serial.current)setNotice(String(error instanceof Error?error.message:error));return false;}finally{if(current()&&ticket===serial.current)setLoading(false);}};
 useEffect(()=>{live.current=true;void refresh();return()=>{live.current=false;serial.current++;};},[]);
 const act=async(item:PaperImportRecoveryItem,original:boolean)=>{
  if(pending.current||!current()||!item.resumable||original&&item.originalAvailable===false||!original&&props.disabled)return;pending.current=true;setBusy(`${item.kind}|${item.id}`);setNotice('');
  try{if(original)await latest.current.onOriginal(item.kind,item.id);else await latest.current.onResume(item.kind,item.id);if(current()&&await refresh()&&current())setNotice(original?'Votre fichier original est prêt à être enregistré.':item.kind==='legacy-archive'?'La reprise de cette ancienne importation est terminée.':'L’importation a été reprise dans cette note.');}
  catch(error){if(current())setNotice(String(error instanceof Error?error.message:error));}
  finally{pending.current=false;if(current())setBusy(null);}
 };
 return <section className="paper-ink-recovery paper-import-recovery" aria-label="Importations à reprendre">
  <header><strong>Importations à reprendre</strong><div><button type="button" disabled={loading||!!busy} onClick={()=>void refresh()}>Actualiser</button><button type="button" onClick={props.onClose}>Fermer</button></div></header>
  <p>Les fichiers conservés sur cet appareil restent dans leur note d’origine. Reprenez leur préparation puis leur ajout, ou enregistrez l’original.</p>
  {notice&&<p role="status">{notice}</p>}{loading?<p role="status">Recherche des importations conservées…</p>:!items.length?<p>Aucune importation en attente pour cette note.</p>:<ul>{items.map(item=><li key={`${item.kind}|${item.id}`}><div><strong>{item.sourceName||'Fichier sans nom'}</strong><span>{item.kind==='pdf'?'PDF':item.kind==='archive'?'Archive Dowze':'Ancienne importation'} · {item.status}</span>{item.createdAt&&<time dateTime={item.createdAt}>{new Intl.DateTimeFormat('fr-CH',{dateStyle:'short',timeStyle:'short'}).format(new Date(item.createdAt))}</time>}{item.details&&<span>{item.details}</span>}</div>{item.resumable&&<div><button type="button" disabled={props.disabled||!!busy} onClick={()=>void act(item,false)}>{busy===`${item.kind}|${item.id}`?'Conservation…':item.resumeLabel??'Reprendre dans cette note'}</button>{item.originalAvailable!==false&&<button type="button" disabled={!!busy} onClick={()=>void act(item,true)}>Enregistrer l’original</button>}</div>}</li>)}</ul>}
 </section>;
}
