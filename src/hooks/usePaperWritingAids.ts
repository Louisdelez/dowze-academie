import {useEffect,useMemo,useRef,useState} from 'react';
import {commitNotebookTransfer,getSnapshot,notebookDeletionKey,readNotebookDeletionStatus,type Snapshot} from '../../pwa/src/storage';
import {notebookDocumentId,notebookIdentityDigest} from '../lib/notebookIdentity';
import {registerNotebookWriter} from '../lib/notebookSession';
import {defaultPaperDrawingGuide,defaultPaperHoldCorrection,normalizePaperDrawingGuidePreference,normalizePaperHoldCorrection,type PaperDrawingGuideConfig,type PaperHoldCorrectionConfig} from '../lib/paperDrawingGuide';
import type {PaperWritingLoupeOptions} from '../lib/paperWritingLoupe';
export interface PaperWritingAids {guide:PaperDrawingGuideConfig;hold:PaperHoldCorrectionConfig;loupe:{zoom:number;options:Partial<PaperWritingLoupeOptions>}}
export interface PaperWritingAidsPatch {guide?:PaperDrawingGuideConfig;hold?:PaperHoldCorrectionConfig;loupe?:Partial<PaperWritingAids['loupe']>}
export const paperWritingAidsKey=(scope:{accountId:string;spaceId:string},noteId:string)=>'paper-writing-aids-v1|'+notebookIdentityDigest(JSON.stringify([scope.accountId,scope.spaceId,noteId]));
const defaults=():PaperWritingAids=>({guide:defaultPaperDrawingGuide(),hold:defaultPaperHoldCorrection(),loupe:{zoom:3,options:{}}});
const normalized=(value:PaperWritingAids):PaperWritingAids=>({guide:normalizePaperDrawingGuidePreference(value.guide),hold:normalizePaperHoldCorrection(value.hold),loupe:{zoom:Number.isFinite(value.loupe?.zoom)?Math.max(1,Math.min(6,value.loupe.zoom)):3,options:{...value.loupe?.options}}});
/** Local note-scoped settings use the common CAS transaction and close writer. No server preference is inferred. */
export function usePaperWritingAids(scope:{accountId:string;spaceId:string},noteId:string,disabled:boolean){
 const clean={accountId:scope.accountId,spaceId:scope.spaceId};
 const owner=JSON.stringify([scope.accountId,scope.spaceId,noteId]),latest=useRef({owner,disabled});latest.current={owner,disabled};
 const session=useMemo(()=>({owner,key:paperWritingAidsKey(scope,noteId),alive:true,writable:true,pending:0,row:undefined as Snapshot|undefined,value:defaults(),tail:Promise.resolve(),opening:Promise.resolve()}),[owner]);
 const [state,setState]=useState({owner,ready:false,value:defaults(),notice:''});
 const current=()=>session.alive&&session.writable&&latest.current.owner===owner&&!latest.current.disabled;
 const recordOwner=(row:Snapshot|undefined)=>{if(!row)return;const value=row.value as {kind?:string;schema?:number;accountId?:string;spaceId?:string;noteId?:string;settings?:PaperWritingAids};if(row.accountId!==scope.accountId||row.spaceId!==scope.spaceId||value.kind!=='paper-writing-aids'||value.schema!==1||value.accountId!==scope.accountId||value.spaceId!==scope.spaceId||value.noteId!==noteId||!value.settings)throw Error('Les réglages d’écriture appartiennent à une autre note.');};
 useEffect(()=>{session.alive=true;setState({owner,ready:false,value:defaults(),notice:''});session.opening=getSnapshot(session.key).then(row=>{recordOwner(row);if(!session.alive||latest.current.owner!==owner)return;session.row=row;session.value=row?normalized((row.value as {settings:PaperWritingAids}).settings):defaults();setState({owner,ready:true,value:session.value,notice:''});}).catch(error=>{if(session.alive&&latest.current.owner===owner)setState({owner,ready:false,value:defaults(),notice:String(error instanceof Error?error.message:error)});});
  const unregister=registerNotebookWriter(scope.accountId,{flush:()=>{},settled:async()=>{await session.opening;await session.tail;},pending:()=>session.pending>0,suspend:()=>{session.writable=false;},resume:()=>{session.writable=true;}});return()=>{session.alive=false;unregister();};
 },[session]);
 const change=(patch:PaperWritingAidsPatch)=>{if(!current()||!state.ready)return Promise.resolve(false);const value=normalized({...session.value,...patch,loupe:{...session.value.loupe,...patch.loupe}});session.value=value;session.pending++;setState({owner,ready:true,value,notice:''});
  const work=session.tail.catch(()=>{}).then(async()=>{await session.opening;if(!current())return false;try{const deletion=await readNotebookDeletionStatus(noteId,clean,current);if(deletion)throw Error('Cette note a été supprimée. Les réglages précédents restent conservés.');const deletionKey=notebookDeletionKey({...clean,type:'whiteboard',documentId:notebookDocumentId(noteId)}),deletionRow=await getSnapshot(deletionKey);if(!current())return false;if(deletionRow)throw Error('Le statut de cette note doit être réexaminé.');
   const revision=Number((session.row?.value as {revision?:number}|undefined)?.revision??0)+1,row:Snapshot={key:session.key,...clean,value:{schema:1,kind:'paper-writing-aids',...clean,noteId,revision,settings:value,updatedAt:new Date().toISOString()}};
   const historyKey=session.row?session.key+'|history|'+notebookIdentityDigest(JSON.stringify(session.row.value)):undefined,history=historyKey?await getSnapshot(historyKey):undefined;if(!current())return false;
   await commitNotebookTransfer({target:clean,sources:[],drafts:[],blobs:[],snapshots:[row,...(session.row&&historyKey&&!history?[{...session.row,key:historyKey}]:[])],draftChecks:[],blobChecks:[],snapshotChecks:[{key:session.key,expected:session.row},{key:deletionKey,expected:deletionRow},...(historyKey?[{key:historyKey,expected:history}]:[])]},current);if(!current())return false;session.row=row;return true;
  }catch(error){if(current())setState(old=>old.owner===owner?{...old,notice:`Réglages non enregistrés. ${String(error instanceof Error?error.message:error)}`}:old);return false;}}).finally(()=>session.pending--);session.tail=work.then(()=>{});return work;
 };
 return {value:state.owner===owner?state.value:defaults(),ready:state.owner===owner&&state.ready,notice:state.owner===owner?state.notice:'',change,settled:()=>session.tail};
}
