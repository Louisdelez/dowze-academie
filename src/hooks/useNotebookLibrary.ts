import {runNotebookLibraryTrashChange,type NotebookLibraryLifecycleOptions} from '../lib/notebookLibraryLifecycle';
import {useEffect,useLayoutEffect,useRef,useSyncExternalStore} from 'react';
import {getDraft,savePaperDraft,resolvePaperDraft,listSnapshots,type Draft} from '../../pwa/src/storage';
import {ApiError} from '../../pwa/src/api';
import {synchronizeSpace} from '../../pwa/src/sync';
import {continuousSync} from '../lib/continuousSync';
import {registerNotebookWriter} from '../lib/notebookSession';
import {emptyNotebookLibrary,isNotebookLibrary,LIBRARY_DOCUMENT_ID,updateNotebookLibrary,type NotebookLibrary,type LibraryChange} from '../lib/notebookLibrary';
import {amendNotebookLibrary,mergeNotebookLibrary} from '../lib/notebookLibraryCollaboration';
import type {NotebookMediaScope} from '../components/NotebookEditor';
interface State{library:NotebookLibrary|null;error:string;saving:boolean;conflict:boolean;resolving:boolean;versions?:{durable:Draft;remote:NotebookLibrary|null;version:number}}
interface Session{state:State;subscribers:Set<()=>void>;tail:Promise<void>;opening?:Promise<void>;writable:boolean;failed:boolean;pending:number}
const sessions=new Map<string,Session>();
function session(key:string){let s=sessions.get(key);if(!s){s={state:{library:null,error:'',saving:false,conflict:false,resolving:false},subscribers:new Set(),tail:Promise.resolve(),writable:true,failed:false,pending:0};sessions.set(key,s);}return s;}
function publish(s:Session,state:State){s.state=state;for(const listener of s.subscribers)listener();}
const message=(error:unknown)=>String(error instanceof Error?error.message:error);
export function useNotebookLibrary(media:NotebookMediaScope,lifecycle?:NotebookLibraryLifecycleOptions){
 const lifecycleRef=useRef(lifecycle);lifecycleRef.current=lifecycle;
 const scopeKey=`${media.accountId}|${media.spaceId}`,s=session(scopeKey),identity={accountId:media.accountId,spaceId:media.spaceId,type:'preferences' as const,documentId:LIBRARY_DOCUMENT_ID};
 const admission=useRef({accountId:media.accountId,spaceId:media.spaceId,api:media.api,active:true,revoked:false,apiCurrent:null as (()=>boolean)|null});
 // Looking at a captured lease never binds an API. A new render may create a
 // fresh incarnation, but it cannot renew any callback from the retired one.
 let leaseLost=false;try{leaseLost=!!admission.current.apiCurrent&&!admission.current.apiCurrent();}catch{leaseLost=true;}
 if(admission.current.accountId!==media.accountId||admission.current.spaceId!==media.spaceId||admission.current.api!==media.api||admission.current.revoked||leaseLost){admission.current.active=false;admission.current.revoked=true;admission.current={accountId:media.accountId,spaceId:media.spaceId,api:media.api,active:true,revoked:false,apiCurrent:null};}
 const source=admission.current;
 // Only admission is revoked: accepted writes retain their captured scope/tail.
 const canAdmit=()=>{
  if(admission.current!==source||!source.active||source.revoked)return false;
  if(!source.apiCurrent)try{source.apiCurrent=source.api?source.api.captureSessionAuthority(source.accountId):()=>true;}catch{source.revoked=true;return false;}
  try{if(!source.apiCurrent())source.revoked=true;}catch{source.revoked=true;}
  return admission.current===source&&source.active&&!source.revoked;
 };
 // Capture before these mounted controls can accept their first event, including
 // a retained restore callback which has never itself been invoked before ABA.
 useLayoutEffect(()=>{source.active=true;canAdmit();return()=>{source.active=false;};},[source]);
 const state=useSyncExternalStore(listener=>{s.subscribers.add(listener);return()=>{s.subscribers.delete(listener);};},()=>s.state);
 useEffect(()=>{
  let stopped=false;
  const read=async()=>{
   if(!s.writable||s.failed)return;await s.tail;let stored=await getDraft(identity),error='';
   if(!stored&&media.api&&navigator.onLine){try{await synchronizeSpace(media.api,media.accountId,media.spaceId,()=>!stopped&&s.writable);stored=await getDraft(identity);}catch(e){if(!(e instanceof TypeError)&&!(e instanceof ApiError&&e.status>=500))throw e;error='Classement conservé sur cet appareil ; connexion au serveur en attente.';}}
   if(stored&&!isNotebookLibrary(stored.content))throw Error('Classement incompatible. Les données sont conservées.');
   if(!s.writable||s.pending||stopped)return;
   if(stored?.syncState==='conflict'){publish(s,{...s.state,library:stored.content as NotebookLibrary,conflict:true,error:'Deux versions du classement sont conservées. Comparez-les pour poursuivre.',saving:false});return;}
   publish(s,{library:stored?stored.content as NotebookLibrary:emptyNotebookLibrary(),error,saving:false,conflict:false,resolving:false});
  };
  if(!s.opening)s.opening=read().catch(e=>publish(s,{...s.state,error:message(e)}));
  const sync=continuousSync(async()=>{if(!s.writable)return;if(media.api)await synchronizeSpace(media.api,media.accountId,media.spaceId,()=>!stopped&&s.writable);await read();},e=>{if(!stopped&&s.writable)publish(s,{...s.state,error:message(e)});},{interval:12000});
  const changed=(event:Event)=>{const scope=(event as CustomEvent<{accountId?:string;spaceId?:string}>).detail;if(scope?.accountId===media.accountId&&scope.spaceId===media.spaceId)sync.request(true);};addEventListener('dowze:notebook-library-changed',changed);
  return()=>{stopped=true;sync.stop();s.opening=undefined;removeEventListener('dowze:notebook-library-changed',changed);};
 },[scopeKey,media.api]);
 useEffect(()=>registerNotebookWriter(media.accountId,{flush:()=>{},settled:async()=>{await s.opening;await s.tail;},suspend:()=>{s.writable=false;},resume:()=>{s.writable=true;},dispose:()=>{sessions.delete(scopeKey);publish(s,{library:null,error:'',saving:false,conflict:false,resolving:false});}}),[scopeKey]);
 const update=(change:LibraryChange)=>{
  if(!canAdmit()||!s.state.library||!s.writable||s.failed||s.state.conflict)return false;
  if(lifecycle?.enabled===true){
   const touched=[...(change.note?[change.note]:[]),...(change.notes??[])].filter(edit=>Object.hasOwn(edit.patch,'deletedAt'));
   if(touched.length||change.restore){
    const route=lifecycle,current=()=>lifecycleRef.current===route&&route.enabled===true&&canAdmit()&&s.writable&&!s.failed;
    // One exact note per durable lifecycle admission. A bulk/history request
    // never degrades to a partially applied series or a classification fallback.
    if(!current()||change.restore||touched.length!==1||change.notes!==undefined||Object.keys(change).length!==1||!change.note||Object.keys(change.note.patch).length!==1){if(current())publish(s,{...s.state,error:'Utilisez la corbeille d’une seule note pour préserver son reçu complet. Aucun changement partiel n’a été appliqué.'});return false;}
    const edit=change.note,value=edit.patch.deletedAt,noteId=edit.id,scope={accountId:source.accountId,spaceId:source.spaceId};if(value!==null&&(typeof value!=='string'||!Number.isFinite(Date.parse(value)))){publish(s,{...s.state,error:'L’intention de corbeille est incompatible. Les sources restent conservées.'});return false;}
    s.pending++;publish(s,{...s.state,error:'',saving:true});
    const operation=s.tail.catch(()=>undefined).then(async()=>{
     if(!current())return;
     const result=await runNotebookLibraryTrashChange({configuration:route,scope,noteId,intent:value===null?'restore':'trash',current});
     if(current())publish(s,{...s.state,library:result.library.content as NotebookLibrary,error:result.warning,saving:false});
    }).catch(error=>{if(current()){publish(s,{...s.state,error:message(error),saving:false});throw error;}}).finally(()=>{s.pending--;if(current()&&!s.pending)publish(s,{...s.state,saving:false});});
    s.tail=operation;void operation.catch(()=>{});return true;
   }
  }
  const previous=s.state.library;let next:NotebookLibrary;
  try{next=amendNotebookLibrary(previous,updateNotebookLibrary(previous,change),scopeKey);}catch(e){publish(s,{...s.state,error:message(e)});return false;}
  s.pending++;publish(s,{...s.state,library:next,error:'',saving:true});
  s.tail=s.tail.then(async()=>{
   const stored=await getDraft(identity);let written=next;
   try{await savePaperDraft({...identity,title:'Bibliothèque de notes',content:next,baseVersion:stored?.baseVersion??0,updatedAt:Date.now(),syncState:'local'},stored?previous.revision:null);}catch(error){
    let recovered=false;for(let attempt=0;attempt<3;attempt++){
     const current=await getDraft(identity);if(!current||current.syncState==='conflict'||!isNotebookLibrary(current.content)||!s.state.library)break;
     const merged=mergeNotebookLibrary(s.state.library,current.content);if(!merged)break;
     if(merged.collaboration?.state===current.content.collaboration?.state){written=current.content;recovered=true;break;}
     try{await resolvePaperDraft(current,s.state.library,null,current.baseVersion,merged,crypto.randomUUID());written=merged;recovered=true;break;}catch{}
    }if(!recovered)throw error;
   }
   if(written!==next)publish(s,{...s.state,library:written});
  }).catch(e=>{s.failed=true;publish(s,{...s.state,error:message(e),saving:false,conflict:true});throw e;}).finally(()=>{s.pending--;if(!s.pending&&!s.failed)publish(s,{...s.state,saving:false});});void s.tail.catch(()=>{});return true;
 };
 const compare=async()=>{
  publish(s,{...s.state,resolving:true});try{
   await s.tail.catch(()=>undefined);const durable=await getDraft(identity);if(!durable)throw Error('La copie enregistrée est introuvable.');let remote:NotebookLibrary|null=isNotebookLibrary(durable.content)?durable.content:null,version=durable.baseVersion;
   if(media.api){let cursor:string|undefined;const seen=new Set<string>();let latest:import('../../pwa/src/api').DocumentChange|undefined;do{const page=await media.api.changes(media.spaceId,cursor);for(const row of page.items)if(row.document_type==='preferences'&&row.document_id===LIBRARY_DOCUMENT_ID)latest=row;if(!page.has_more)break;if(!page.next_cursor||seen.has(page.next_cursor))throw Error('Pagination du classement incohérente.');seen.add(page.next_cursor);cursor=page.next_cursor;}while(true);if(!latest)throw Error('La version serveur n’est pas encore disponible.');remote=latest.deleted?null:latest.content as NotebookLibrary;version=latest.version;if(remote&&!isNotebookLibrary(remote))throw Error('Le classement reçu est incompatible.');}
   publish(s,{...s.state,versions:{durable,remote,version},resolving:false});
  }catch(e){publish(s,{...s.state,error:message(e),resolving:false});}
 };
 const resolve=async(choice:'local'|'remote')=>{
  const versions=s.state.versions,visible=s.state.library;if(!versions||!visible||s.state.resolving)return;publish(s,{...s.state,resolving:true});
  try{const selected=choice==='local'?visible:versions.remote;if(!selected)throw Error('Le classement reçu n’existe plus.');const clean={...selected,revision:Math.max(visible.revision,versions.remote?.revision??0)+1,updatedAt:new Date().toISOString()};delete clean.collaboration;const restored=amendNotebookLibrary(clean,clean,scopeKey);const server=versions.remote?{...versions.durable,content:versions.remote,baseVersion:versions.version,syncState:'synced' as const}:null;
   await resolvePaperDraft(versions.durable,visible,server,versions.version,restored,crypto.randomUUID());s.failed=false;s.tail=Promise.resolve();publish(s,{library:restored,error:'Versions originales conservées dans la récupération.',saving:false,conflict:false,resolving:false});
  }catch(e){publish(s,{...s.state,error:message(e),resolving:false});}
 };
 const versions=async()=>{const prefix=`paper-history|${media.accountId}|${media.spaceId}|preferences|${LIBRARY_DOCUMENT_ID}|`;return (await listSnapshots(media.accountId,media.spaceId)).flatMap(row=>{if(row.key.startsWith(prefix))return [row.value];if(row.key.startsWith(`paper-resolution|${media.accountId}|${media.spaceId}|preferences|${LIBRARY_DOCUMENT_ID}|`)){const v=row.value as {durable?:{content?:unknown};visibleContent?:unknown;server?:{content?:unknown}};return [v.durable?.content,v.visibleContent,v.server?.content];}return [];}).filter((value):value is NotebookLibrary=>isNotebookLibrary(value)).sort((a,b)=>b.revision-a.revision);};
 return {...state,source,current:canAdmit,update,compare,resolve,history:versions,whenSaved:()=>s.tail};
}
