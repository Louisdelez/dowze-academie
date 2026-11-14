import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import {NotebookEditor,type NotebookMirrorExpectation} from './components/NotebookEditor';
import {getDraft,putDraft,putEditedDraft,putLocalBlob,listLocalBlobs,listSnapshots,localBlobDigest,type Draft} from '../pwa/src/storage';
import {notebookDocumentId,isPaperDocument} from './lib/notebookDocument';
import {noteBoardId} from './lib/notebook';
import './styles.css';import './paper-audio-test.css';
const noteId='qa-legacy-live-20261013',media={accountId:'qa-legacy-live-20261013',spaceId:'isolated'},markdown='# Note conservée\n\nUn texte initial, son dessin et sa photo.';
const identity={...media,type:'notesMarkdown' as const,documentId:noteId},boardIdentity={...media,type:'whiteboard' as const,documentId:noteBoardId(noteId)};
const initial:Draft={...identity,title:'Reprise des anciennes notes',content:{id:noteId,title:'Reprise des anciennes notes',markdown,tags:[],subjectIds:[],createdAt:'2026-10-13T12:00:00Z',updatedAt:'2026-10-13T12:00:00Z'},baseVersion:0,updatedAt:1,syncState:'local'};
if(!await getDraft(identity)){
 await putDraft(initial);
 await putDraft({...boardIdentity,title:'Dessin original',content:{board:{strokes:[{id:'initial-stroke',color:'#2855ce',width:3,points:[{x:80,y:210,pressure:.2},{x:190,y:210,pressure:.8}]}]},photos:[{id:'qa-legacy-live-image',name:'Photo conservée.png',mediaType:'image/png',size:68}]},baseVersion:2,updatedAt:1,syncState:'synced'});
 const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jKZkAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
 await putLocalBlob({...media,id:'qa-legacy-live-image',documentId:boardIdentity.documentId,blob:new Blob([bytes],{type:'image/png'}),name:'Photo conservée.png',createdAt:1,status:'pending'});
}
const loaded=(await getDraft(identity))!;
function Recipe(){
 const [source,setSource]=useState(loaded),[proof,setProof]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const write=async(value:string,expected?:NotebookMirrorExpectation)=>{
  const durable=await getDraft(identity);if(!durable)return false;const content=durable.content as {markdown:string};
  if(expected&&content.markdown!==expected.expectedMarkdown){setSource(durable);return false;}
  const next={...durable,content:{...(durable.content as object),markdown:value},updatedAt:Date.now(),syncState:'local' as const};
  try{if(expected?.commitMetadata){setSource(await expected.commitMetadata(next));}else{await putEditedDraft(next,durable.content,()=>true);setSource(next);}return true;}catch{return false;}
 };
 const modifyLegacy=async()=>{setBusy(true);try{
  const durable=(await getDraft(identity))!,board=(await getDraft(boardIdentity))!,content=board.content as {board:{strokes:unknown[]};photos:unknown[]};
  const id=crypto.randomUUID();await putDraft({...board,content:{...content,board:{...content.board,strokes:[...content.board.strokes,{id,color:'#dd4050',width:4,points:[{x:80,y:250,pressure:.3},{x:190,y:270,pressure:.7}]}]}},updatedAt:Date.now(),syncState:'local'});
  const next={...durable,content:{...(durable.content as object),markdown:(durable.content as {markdown:string}).markdown+'\n\nAjout reçu de l’ancienne application.'},updatedAt:Date.now(),syncState:'local' as const};await putEditedDraft(next);setSource(next);setNotice('Ancienne modification enregistrée : texte et nouveau trait.');
 }catch(error){setNotice(String(error));}finally{setBusy(false);}};
 const inspect=async()=>{const paper=await getDraft({...media,type:'whiteboard',documentId:notebookDocumentId(noteId)}),snapshots=await listSnapshots(media.accountId,media.spaceId),files=await listLocalBlobs(media.accountId,media.spaceId);setProof(JSON.stringify({paper:paper&&isPaperDocument(paper.content)?{key:paper.documentId,revision:paper.content.revision,text:paper.content.objects.filter(o=>o.kind==='text').map(o=>o.markdown),inks:paper.content.objects.filter(o=>o.kind==='ink').map(o=>({id:o.id,points:o.points})),assets:paper.content.assets}:null,metadata:(await getDraft(identity))?.content,receipts:snapshots.filter(row=>row.key.startsWith('paper-legacy-observation|')).map(row=>row.value),originals:snapshots.filter(row=>row.key.startsWith('paper-migration|')).map(row=>row.value),files:await Promise.all(files.map(async file=>({id:file.id,size:file.blob.size,sha256:await localBlobDigest(file.blob)})))},null,2));};
 return <main style={{height:'100dvh',display:'flex',flexDirection:'column'}}><header style={{padding:10,background:'#263650',color:'white',display:'flex',gap:12,flexWrap:'wrap',alignItems:'center'}}><strong>Recette isolée — reprise des anciennes notes</strong><button disabled={busy} onClick={()=>void modifyLegacy()}>Recevoir un ancien ajout texte et dessin</button><button onClick={()=>void inspect()}>Vérifier les sources conservées</button><span role="status">{notice}</span></header><div style={{flex:1,minHeight:0}}><NotebookEditor noteId={noteId} markdown={(source.content as {markdown:string}).markdown} metadata={{title:source.title}} media={media} onChange={write}/></div>{proof&&<details style={{maxHeight:120,overflow:'auto',background:'#fff'}}><summary>Preuves de la reprise</summary><pre id="legacy-proof">{proof}</pre></details>}</main>;
}
const root=createRoot(document.getElementById('root')!);root.render(<Recipe/>);if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
