import {useEffect,useRef,useState} from 'react';
import type {ApiClient} from '../../pwa/src/api';
import {registerNotebookWriter} from '../lib/notebookSession';
import {commitPaperReadingTheme,loadPaperReadingTheme,type LoadedPaperReadingTheme,type PaperReadingTheme} from '../lib/paperReadingTheme';
interface Source {accountId:string;api:ApiClient|undefined;identity:object;alive:boolean;writable:boolean;revoked:boolean;lease:(()=>boolean)|null;pending:number;opening:Promise<void>;tail:Promise<void>;loaded:LoadedPaperReadingTheme|null}
/** A theme has its own admitted local preference writer. It never joins the
 * note's canonical writer and does not claim that the note has been saved. */
export function usePaperReadingTheme(props:{accountId:string;api?:ApiClient;current:()=>boolean}){
 const latest=useRef(props);latest.current=props;const source=useRef<Source|null>(null);
 const [state,setState]=useState<{source:object|null;theme:PaperReadingTheme;ready:boolean;saving:boolean;notice:string}>({source:null,theme:'light',ready:false,saving:false,notice:''});
 const current=(held:Source)=>{
  if(!held.alive||held.revoked||source.current!==held)return false;
  try{if(latest.current.accountId!==held.accountId||latest.current.api!==held.api||latest.current.current()!==true){held.revoked=true;return false;}
   if(!held.lease)held.lease=held.api?held.api.captureSessionAuthority(held.accountId):()=>true;
   if(held.lease()!==true)held.revoked=true;
  }catch{held.revoked=true;}
  return !held.revoked&&held.alive&&source.current===held;
 };
 useEffect(()=>{
  const held:Source={accountId:props.accountId,api:props.api,identity:Object.freeze({}),alive:true,writable:true,revoked:false,lease:null,pending:0,opening:Promise.resolve(),tail:Promise.resolve(),loaded:null};source.current=held;
  setState({source:held.identity,theme:'light',ready:false,saving:false,notice:''});
  if(!current(held))return()=>{held.alive=false;held.revoked=true;};
  const unregister=registerNotebookWriter(held.accountId,{flush:()=>{},settled:async()=>{await held.opening;await held.tail;},pending:()=>held.pending>0,suspend:()=>{held.writable=false;},resume:()=>{held.writable=true;}});
  held.opening=loadPaperReadingTheme(held.accountId,()=>current(held)).then(loaded=>{if(current(held)){held.loaded=loaded;setState({source:held.identity,theme:loaded.theme,ready:true,saving:held.pending>0,notice:''});}}).catch(()=>{if(current(held))setState({source:held.identity,theme:'light',ready:false,saving:false,notice:'Le thème local n’est pas disponible. Son original reste conservé.'});});
  return()=>{held.alive=false;held.revoked=true;void Promise.allSettled([held.opening,held.tail]).then(()=>unregister());};
 },[props.accountId,props.api]);
 const change=(theme:PaperReadingTheme):Promise<boolean>=>{
  const held=source.current;if(!held||!held.writable||!current(held)||!held.loaded)return Promise.resolve(false);
  held.pending++;setState(old=>old.source===held.identity?{...old,saving:true,notice:''}:old);
  const work=held.tail.then(async()=>{
   await held.opening;if(!held.writable||!current(held)||!held.loaded)return false;
   try{const loaded=await commitPaperReadingTheme(held.loaded,theme,()=>held.writable&&current(held));if(!current(held))return false;held.loaded=loaded;setState({source:held.identity,theme:loaded.theme,ready:true,saving:held.pending>1,notice:''});return true;}
   catch{if(current(held)){try{held.loaded=await loadPaperReadingTheme(held.accountId,()=>current(held));}catch{held.loaded=null;}if(current(held))setState({source:held.identity,theme:held.loaded?.theme??'light',ready:!!held.loaded,saving:held.pending>1,notice:'Le thème précédent est conservé. Réessayez après son enregistrement local.'});}return false;}
  }).finally(()=>{held.pending--;if(current(held))setState(old=>old.source===held.identity?{...old,saving:held.pending>0}:old);});
  held.tail=work.then(()=>{},()=>{});return work;
 };
 const held=source.current,own=!!held&&held.accountId===props.accountId&&held.api===props.api&&state.source===held.identity;
 return {theme:own?state.theme:'light' as PaperReadingTheme,ready:own&&state.ready,saving:own&&state.saving,notice:own?state.notice:'',change};
}
