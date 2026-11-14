import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import {NotebookEditor} from './components/NotebookEditor';
import {migratePaper,applyPaperCommand,notebookDocumentId,type PaperCommand} from './lib/notebookDocument';
import {amendPaperCollaboration} from './lib/paperCollaboration';
import {getDraft,putDraft} from '../pwa/src/storage';
const media={accountId:'qa-pages-100',spaceId:'local-test'},noteId='qa-pages-100-20261012';
function Recipe(){const [nonce,setNonce]=useState(0),[notice,setNotice]=useState('Recette isolée — aucune donnée utilisateur ni connexion serveur.');
 const seed=async()=>{const identity={...media,type:'whiteboard' as const,documentId:notebookDocumentId(noteId)};if(await getDraft(identity)){setNotice('Le carnet de recette existe déjà ; son contenu est conservé.');setNonce(n=>n+1);return;}
 const base=migratePaper(noteId,'Page 1 — début du carnet de recette.',null,'2026-10-12T10:00:00Z'),commands:PaperCommand[]=[];
 for(let i=2;i<=100;i++){const id=`qa-page-${i}`;commands.push({type:'insert-page',page:{...base.pages[0],id,bookmark:i%10===0,pattern:i%3===0?'grid':'plain'}},{type:'upsert-object',object:{...base.objects[0],id:`qa-text-${i}`,pageId:id,markdown:`# Page ${i}\n\nContenu propre à la page ${i}.\n\n${i===100?'DERNIÈRE PAGE — CENT PAGES CONSERVÉES.':'Une page indépendante du même carnet.'}`}});}
 const full=applyPaperCommand(base,{type:'batch',commands});await putDraft({...identity,title:'Cent pages',content:amendPaperCollaboration(full,full),baseVersion:0,updatedAt:1,syncState:'local'});setNonce(n=>n+1);setNotice('100 pages synthétiques créées. Signets sur les pages 10,20,…,100.');};
 return <main style={{height:'100dvh',display:'flex',flexDirection:'column',fontFamily:'system-ui'}}><header style={{padding:8,background:'#263650',color:'white'}}><span role="status">{notice}</span> <button onClick={()=>void seed()}>Préparer les cent pages</button></header>{nonce>0?<NotebookEditor key={nonce} noteId={noteId} markdown="" media={media} onChange={()=>{}}/>:<p style={{padding:20}}>Ouvrez le carnet de recette en préparant les cent pages.</p>}</main>;
}
createRoot(document.getElementById('root')!).render(<Recipe/>);
