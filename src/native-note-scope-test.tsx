import {createRoot} from 'react-dom/client';
import {useRef,useState} from 'react';
import {appStorage} from './lib/appStorage';
import {useNativeNotebookScope} from './hooks/useNativeNotebookScope';
import {usePersistentState,type PersistentStateSetter} from './hooks/usePersistentState';
import {createSubjectNote,updateSubjectNote,EMPTY_SUBJECT_NOTES_STORE,isPersistedSubjectNotesStore,normalizeSubjectNotesStore} from './lib/subjectNotes';
import type {PersistedSubjectNotesStore} from './lib/subjectNotes';
import {NotebookEditor} from './components/NotebookEditor';
import {WorkspaceTabs} from './components/WorkspaceTabs';
import {getDraft,listDrafts,listLocalBlobs,listSnapshots,putDraft} from '../pwa/src/storage';
import {notebookDocumentId,isPaperDocument} from './lib/notebookDocument';
import {settleNotebookAccount,resumeNotebookAccount} from './lib/notebookSession';
import './styles.css';

// Development-only recipe; no real account/session, no request to any server.
const requested=new URLSearchParams(location.search).get('run');
const run=requested&&/^[a-z0-9-]{1,40}$/.test(requested)?requested:'20261012';
const profile='qa-scope-'+run,localSpace='local-year',cloud='qa-cloud-'+run;
const base=`dowze.qa.scope.${profile}.notes`,ownerKey=`dowze.server.owner.${profile}`,linkKey=`dowze.server.link.${profile}`;
const cloudKey=(space:string)=>`${base}.cloud.${cloud}.${space}`;
const stamp='2026-10-12T10:00:00Z';
await appStorage.initialize(localStorage);
if(!appStorage.getItem(base)){
 const alpha=createSubjectNote(EMPTY_SUBJECT_NOTES_STORE,{id:'qa-alpha-'+run,title:'Note de la première année',markdown:'Texte Alpha : conservé dans le premier carnet.',now:stamp}).store;
 appStorage.setItem(base,JSON.stringify(alpha));
 const beta=createSubjectNote(EMPTY_SUBJECT_NOTES_STORE,{id:'qa-beta-'+run,title:'Note de la deuxième année',markdown:'Texte Beta : indépendant du premier carnet.',now:stamp}).store;
 appStorage.setItem(cloudKey('year-b'),JSON.stringify(beta));await appStorage.flush();
 await putDraft({accountId:profile,spaceId:localSpace,type:'whiteboard',documentId:'note-qa-alpha-'+run,title:'Dessin historique',content:{photos:[],board:{strokes:[{id:'qa-stroke',color:'#4461dc',width:3,points:[{x:40,y:130},{x:200,y:190}]}]}},baseVersion:0,syncState:'local',updatedAt:1});
}
function Recipe(){
 const scope=useNativeNotebookScope(profile,localSpace,base);
 const [stored,setStored]=usePersistentState<PersistedSubjectNotesStore>(scope.notesKey,EMPTY_SUBJECT_NOTES_STORE,isPersistedSubjectNotesStore);
 const notes=normalizeSubjectNotesStore(stored),active=notes.documents.find(n=>n.id===notes.activeDocumentId);
 const [busy,setBusy]=useState(false),[status,setStatus]=useState('Prêt'),[proof,setProof]=useState(''),[offline,setOffline]=useState(!appStorage.getItem(linkKey));
 const previousSetter=useRef<PersistentStateSetter<PersistedSubjectNotesStore>|null>(null);
 const act=async(action:()=>Promise<unknown>)=>{setBusy(true);try{await action();setStatus('Opération terminée');}catch(e){setStatus(String(e instanceof Error?e.message:e));}finally{setBusy(false);}};
 const open=async(space:string)=>{
  previousSetter.current=setStored;
  appStorage.setItem(ownerKey,JSON.stringify({id:cloud}));appStorage.setItem(linkKey,JSON.stringify({id:cloud}));await appStorage.flush();
  await scope.prepareTarget({accountId:cloud,spaceId:space},()=>true);setOffline(false);
 };
 const inspect=async()=>{
  await settleNotebookAccount(scope.identity.accountId);await appStorage.flush();
  try{
   const original=JSON.parse(appStorage.getItem(base)??'null');
   const scopes=[];
   for(const accountId of [profile,`local-${profile}`,cloud])for(const spaceId of [localSpace,'year-a','year-b']){
    const drafts=await listDrafts(accountId,spaceId);if(!drafts.length)continue;
    scopes.push({accountId,spaceId,documents:drafts.map(d=>({id:d.documentId,type:d.type,text:isPaperDocument(d.content)?d.content.objects.filter(o=>o.kind==='text').map(o=>o.markdown).join('\n'):'legacy',ink:isPaperDocument(d.content)?d.content.objects.filter(o=>o.kind==='ink').length:undefined})),files:(await listLocalBlobs(accountId,spaceId)).length,snapshots:(await listSnapshots(accountId,spaceId)).length});
   }
   const currentDraft=active?await getDraft({...scope.identity,type:'whiteboard',documentId:notebookDocumentId(active.id)}):undefined;
   setProof(JSON.stringify({recipe:'UI réelle ; transport absent, caches synthétiques uniquement',scope:scope.identity,notesKey:scope.notesKey,ready:scope.ready,offline,active:active?.id,tabs:notes.openDocumentIds,currentNoteText:isPaperDocument(currentDraft?.content)?currentDraft.content.objects.filter(o=>o.kind==='text').map(o=>o.markdown).join('\n'):null,originalMetadata:original,scopes},null,2));
  }finally{resumeNotebookAccount(scope.identity.accountId);}
 };
 return <main className="scope-recipe" style={{height:'100dvh',display:'flex',flexDirection:'column',background:'#f5f7fc'}}>
  <style>{`.scope-recipe .workspace-tabs-shell{position:relative;inset:auto;flex-shrink:0}.scope-recipe .workspace-tabs{margin-left:0}.scope-recipe header button{color:#20343b;border:1px solid #aab5c5;padding:4px 8px;border-radius:5px;background:#fff}.scope-recipe header button:disabled{opacity:.5}`}</style><header style={{padding:12,display:'flex',flexWrap:'wrap',gap:8,background:'#263650',color:'white'}}><strong>Recette isolée — éditeur et transfert réels, aucun serveur contacté</strong>
   <button disabled={busy||!scope.ready} onClick={()=>void act(()=>open('year-a'))}>Première année</button><button disabled={busy||!scope.ready} onClick={()=>void act(()=>open('year-b'))}>Deuxième année</button>
   <button disabled={busy} onClick={()=>void act(async()=>{appStorage.removeItem(linkKey);await appStorage.flush();setOffline(true);})}>Couper le transport</button>
   <button disabled={busy} onClick={()=>void act(()=>scope.prepareTarget({accountId:'qa-other-owner',spaceId:'year-a'},()=>true))}>Essayer un autre compte</button>
   <button disabled={busy} onClick={()=>{const accepted=previousSetter.current?.(EMPTY_SUBJECT_NOTES_STORE);setStatus(`Ancien callback accepté : ${String(accepted)}`);}}>Tester un ancien callback</button>
   <button disabled={busy} onClick={()=>void act(inspect)}>Inspecter les données conservées</button>
  </header>
  <p role="status" style={{margin:'8px 16px'}}>Carnet : {scope.identity.accountId} / {scope.identity.spaceId} · {scope.ready?'Ouvert':'Préparation'} · {offline?'Transport coupé':'Transport de recette'} · {status}{scope.error&&` · ${scope.error}`}</p>
  <WorkspaceTabs section="notes" documents={notes.documents} openDocumentIds={notes.openDocumentIds} activeDocumentId={notes.activeDocumentId} onActivatePage={()=>setStored({...notes,activeDocumentId:null})} onActivateNote={id=>setStored({...notes,activeDocumentId:id})} onCloseNote={id=>setStored({...notes,openDocumentIds:notes.openDocumentIds.filter(n=>n!==id),activeDocumentId:notes.activeDocumentId===id?null:notes.activeDocumentId})} onCreateNote={()=>setStored(createSubjectNote(notes,{title:'Nouvelle note de recette'}).store)} creatingDisabled={busy||!scope.ready}/>
  <div style={{display:'flex',flex:1,minHeight:0}}><section style={{flex:1,minWidth:0,minHeight:0,display:'flex',flexDirection:'column'}}>
   {scope.ready&&active?<NotebookEditor key={`${scope.identity.accountId}|${scope.identity.spaceId}|${active.id}`} noteId={active.id} markdown={active.markdown} media={scope.identity} onChange={markdown=>setStored(previous=>updateSubjectNote(normalizeSubjectNotesStore(previous),active.id,{markdown}))}/>:<p>{scope.ready?'Aucune note active':'Ouverture du carnet…'}</p>}
  </section>{proof&&<details open style={{maxWidth:400,overflow:'auto',background:'white',padding:12}}><summary>Preuve du transfert</summary><pre id="scope-proof" style={{whiteSpace:'pre-wrap',fontSize:11}}>{proof}</pre></details>}</div>
 </main>;
}
createRoot(document.getElementById('root')!).render(<Recipe/>);
