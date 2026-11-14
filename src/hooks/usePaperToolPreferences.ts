import {useEffect,useRef,useState} from 'react';
import type {ApiClient} from '../../pwa/src/api';
import {registerNotebookWriter} from '../lib/notebookSession';
import {loadPaperToolPreferences,commitPaperToolPreferences,clearPaperToolPreferenceOverride,resetPaperToolPreferenceSection,applyPaperToolPreferenceCommand,defaultPaperToolPreferences,type LoadedPaperToolPreferences,type PaperToolPreferences,type PaperToolPreferenceCommand,type PaperToolKind} from '../lib/paperToolPreferences';
interface ToolSession {key:string;accountId:string;spaceId:string;noteId:string;api:ApiClient|undefined;source:object;alive:boolean;writable:boolean;revoked:boolean;pending:number;epoch:number;apiCurrent:(()=>boolean)|null;apiAdmitted:boolean;loaded:LoadedPaperToolPreferences|null;opening:Promise<void>;tail:Promise<void>}
export function usePaperToolPreferences(scope:{accountId:string;spaceId:string;api?:ApiClient},noteId:string){
 const accountId=scope.accountId,spaceId=scope.spaceId,api=scope.api,key=JSON.stringify([accountId,spaceId,noteId]),latest=useRef<ToolSession|null>(null);
 let session=latest.current;
 // Checking an already captured lease is read-only. Capturing a new lease may
 // bind an API, so it happens only after this exact incarnation is admitted.
 // A failed first capture stays retired for these exact props. Only a lease
 // that was once admitted can signal a new API epoch here; otherwise a failed
 // capture plus the opening state update would recreate this effect forever.
 let leaseLost=false;try{leaseLost=!!session?.apiAdmitted&&!!session.apiCurrent&&!session.apiCurrent();}catch{leaseLost=!!session?.apiAdmitted;}
 if(!session||session.key!==key||session.api!==api||leaseLost){if(session)session.revoked=true;session={key,accountId,spaceId,noteId,api,source:Object.freeze({}),alive:true,writable:true,revoked:false,pending:0,epoch:0,apiCurrent:null,apiAdmitted:false,loaded:null,opening:Promise.resolve(),tail:Promise.resolve()};latest.current=session;}
 const captured=session,owner={accountId:session.accountId,spaceId:session.spaceId};
 const [state,setState]=useState<{source:object;loaded:LoadedPaperToolPreferences|null;saving:boolean;notice:string}>({source:captured.source,loaded:null,saving:false,notice:''});
 const sourceCurrent=()=>{
  if(!captured.alive||captured.revoked||latest.current!==captured)return false;
  if(!captured.apiCurrent)try{captured.apiCurrent=captured.api?captured.api.captureSessionAuthority(captured.accountId):()=>true;}catch{captured.revoked=true;return false;}
  try{if(captured.apiCurrent()===true)captured.apiAdmitted=true;else captured.revoked=true;}catch{captured.revoked=true;}
  return !captured.revoked&&captured.alive&&latest.current===captured;
 };
 const current=()=>captured.writable&&sourceCurrent();
 useEffect(()=>{
  captured.alive=true;const epoch=++captured.epoch,openingCurrent=()=>captured.epoch===epoch&&sourceCurrent();setState({source:captured.source,loaded:null,saving:false,notice:''});
  captured.opening=loadPaperToolPreferences(owner,captured.noteId,openingCurrent).then(loaded=>{if(openingCurrent()){captured.loaded=loaded;setState({source:captured.source,loaded,saving:captured.pending>0,notice:''});}}).catch(error=>{if(openingCurrent())setState({source:captured.source,loaded:null,saving:false,notice:String(error instanceof Error?error.message:error)});});
  const unregister=registerNotebookWriter(captured.accountId,{flush:()=>{},settled:async()=>{await captured.opening;await captured.tail;},pending:()=>captured.pending>0,suspend:()=>{captured.writable=false;},resume:()=>{captured.writable=true;}});
  return()=>{captured.alive=false;captured.epoch++;if(captured.pending)void Promise.allSettled([captured.opening,captured.tail]).then(()=>unregister());else unregister();};
 },[captured]);
 const queue=(operation:(loaded:LoadedPaperToolPreferences)=>Promise<LoadedPaperToolPreferences>)=>{
  if(!current())return Promise.resolve(false);captured.pending++;setState(old=>old.source===captured.source?{...old,saving:true,notice:''}:old);
  const work=captured.tail.catch(()=>{}).then(async()=>{await captured.opening;if(!current()||!captured.loaded)return false;
   try{const loaded=await operation(captured.loaded!);if(!current())return false;captured.loaded=loaded;setState({source:captured.source,loaded,saving:captured.pending>1,notice:''});return true;}
   catch(error){if(current()){try{captured.loaded=await loadPaperToolPreferences(owner,captured.noteId,current);}catch{}if(current())setState({source:captured.source,loaded:captured.loaded,saving:captured.pending>1,notice:`Réglages précédents conservés. ${String(error instanceof Error?error.message:error)}`});}return false;}
  }).finally(()=>{captured.pending--;if(sourceCurrent())setState(old=>old.source===captured.source?{...old,saving:captured.pending>0}:old);});
  captured.tail=work.then(()=>{});return work;
 };
 const change=(command:PaperToolPreferenceCommand,target:'global'|'note'='note')=>queue(loaded=>commitPaperToolPreferences({loaded,target,preferences:applyPaperToolPreferenceCommand(target==='global'?loaded.global:loaded.effective,command),current}));
 const clearNote=()=>queue(loaded=>clearPaperToolPreferenceOverride({loaded,current}));
 const reset=(target:'global'|'note',section:'all'|'toolbar'|'palette'|'input'|PaperToolKind)=>queue(loaded=>resetPaperToolPreferenceSection({loaded,target,section,current}));
 const loaded=state.source===captured.source?state.loaded:null;
 return {scopeKey:key,source:captured.source,current,loaded,effective:loaded?.effective??defaultPaperToolPreferences(),ready:!!loaded,saving:state.source===captured.source&&state.saving,notice:state.source===captured.source?state.notice:'',change,clearNote,reset,settled:()=>captured.tail};
}
