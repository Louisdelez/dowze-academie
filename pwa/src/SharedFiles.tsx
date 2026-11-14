import "./shared-study.css";
import { useEffect, useRef, useState } from 'react';
import type { ApiClient } from './api';
import type { Draft } from './storage';
import { downloadAsset, isAssetManifest, isAssetDeletion, type AssetManifest } from '../../src/lib/assetTransfer';

export function SharedFiles({ api, accountId, spaceId, drafts }: { api:ApiClient; accountId:string; spaceId:string; drafts:Draft[] }) {
  const scope=`${accountId}|${spaceId}`, current=useRef(scope); current.current=scope;
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const [query,setQuery]=useState('');
  const [kind,setKind]=useState('all');
  const [failed,setFailed]=useState(false);
  const [archive,setArchive]=useState<{ name:string; messages:{role:string;content:string;version?:number}[] }|null>(null);
  useEffect(()=>{current.current=scope;setArchive(null);setBusy(false);setNotice('');setQuery('');setKind('all');setFailed(false);return()=>{current.current='';};},[scope]);
  const scoped=drafts.filter(d=>d.accountId===accountId && d.spaceId===spaceId).map(d=>d.content);
  const deletions=scoped.filter(isAssetDeletion);
  const manifests=scoped.filter(isAssetManifest);
  const files=manifests.filter(file=>file.asset.kind!=='memory').filter(file=>!deletions.some(d=>JSON.stringify(d.asset)===JSON.stringify(file.asset) && d.hashes.includes(file.sha256)));
  async function open(manifest:AssetManifest) {
    if (busy) return;
    const captured=scope;
    setBusy(true);
    try {
      setFailed(false);setNotice('Chargement et vérification du document…');
      const bytes=await downloadAsset(api,spaceId,manifest,()=>current.current===captured);
      if (current.current !== captured) return;
      if(manifest.asset.kind==='archive') {
        const value=JSON.parse(new TextDecoder().decode(bytes));
        if(!Array.isArray(value.messages) || !value.messages.every((m:unknown)=>!!m && typeof m==='object' && 'content' in m && typeof m.content==='string' && 'role' in m && typeof m.role==='string')) throw new Error('Archive invalide.');
        setArchive({name:manifest.name,messages:value.messages});
      } else {
        const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
        const link=document.createElement('a');link.href=url;link.download=manifest.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
      }
      setNotice('Document vérifié.');
    } catch(error) {if(current.current===captured){setFailed(true);setNotice(String(error));}}
    finally { if(current.current===captured)setBusy(false); }
  }
  const visibleFiles=files.filter(file=>(kind==='all'||(kind==='pdf'?file.asset.kind!=='archive':file.asset.kind==='archive'))&&file.name.toLocaleLowerCase('fr').includes(query.trim().toLocaleLowerCase('fr')));
  return <section className="shared-study shared-study-files" aria-busy={busy}><h2>Documents et conversations</h2><p className="shared-study-caption">Les ressources partagées dans votre année, réunies ici.</p>{!!files.length && <div className="shared-study-filters"><label className="shared-study-search">Rechercher un document<input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Nom du fichier…" /></label><label>Type<select value={kind} onChange={event=>setKind(event.target.value)}><option value="all">Tout</option><option value="pdf">Documents PDF</option><option value="archive">Conversations</option></select></label></div>}{notice && <p className={failed?"shared-study-error":"shared-study-notice"} role={failed?"alert":"status"}>{notice}</p>}
    <div className="shared-study-file-list">{visibleFiles.map((file,index)=><article className="card" key={`${file.sha256}:${index}`}><h3>{file.name}</h3><p>{file.asset.kind==='archive'?'Conversation':'Document PDF'} · {(file.size/1024/1024).toFixed(1)} Mio</p><button disabled={busy} aria-label={`${file.asset.kind==='archive'?'Lire':'Télécharger'} ${file.name}`} onClick={()=>void open(file)}>{file.asset.kind==='archive'?'Lire la conversation':'Télécharger le PDF'}</button></article>)}</div>
    {!!files.length && !visibleFiles.length && <div className="shared-study-empty"><h3>Aucun document ne correspond</h3><p>Essayez un autre nom ou affichez tous les types.</p><button onClick={()=>{setQuery('');setKind('all');}}>Afficher tous les documents</button></div>}
    {!files.length && <div className="shared-study-empty"><h3>Vos documents, au même endroit</h3><p>Les PDF et conversations de cette année apparaîtront ici après synchronisation.</p></div>}
    {archive && <article className="card shared-study-archive"><h2>{archive.name}</h2><button onClick={()=>setArchive(null)}>Fermer la conversation</button>{archive.messages.map((message,index)=><section key={index}><h3>{message.role === "user" ? "Vous" : message.role === "assistant" ? "Assistant" : message.role}</h3><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{message.content}</p></section>)}</article>}
  </section>;
}
