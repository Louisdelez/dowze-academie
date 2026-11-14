import {amendPaperCollaboration} from './paperCollaboration';
import {isPaperDocument,applyPaperCommand,type PaperDocument} from './notebookDocument';
import {appendPaperArchive} from './paperArchive';
import {readPaperAsset} from './paperAssets';
import {putLocalBlob,type DraftKey} from '../../pwa/src/storage';
import type {NotebookMediaScope} from '../components/NotebookEditor';
export type PaperConflictChoice='local'|'server'|'both';
/** Both versions keep their original page geometry, attachments and review sources. */
export async function preparePaperResolution(local:PaperDocument,remote:PaperDocument|null,choice:PaperConflictChoice,media:NotebookMediaScope,current?:()=>boolean,sourceCheck?:()=>Promise<void>,privateResolutionIdentity?:DraftKey):Promise<PaperDocument>{
 const guarded=!!current||!!sourceCheck||!!privateResolutionIdentity,active=current??(()=>true),check=async()=>{if(!active())throw Error('La source de la résolution a changé. Ses originaux restent conservés.');if(sourceCheck)await sourceCheck();if(!active())throw Error('La source de la résolution a changé. Ses originaux restent conservés.');};if(guarded){media={accountId:media.accountId,spaceId:media.spaceId,api:media.api};if(!active())throw Error('La source de la résolution a changé. Ses originaux restent conservés.');local=structuredClone(local);remote=structuredClone(remote);await check();}
 if(!isPaperDocument(local)||remote&&(!isPaperDocument(remote)||remote.noteId!==local.noteId))throw Error('Ces versions ne correspondent pas à la même note.');
 if(choice==='server'&&!remote)throw Error('La note a été supprimée sur le serveur. Votre copie locale reste disponible.');
 let result=choice==='server'?remote!:local;
 if(choice==='both'&&remote){
  const mapped=appendPaperArchive(remote,local.noteId);
  for(const asset of remote.assets){
   const blob=await readPaperAsset(asset,media,guarded?{document:remote,current:active,sourceCheck,privateResolutionIdentity}:undefined);if(guarded)await check();const id=mapped.assets.get(asset.id)!;
   await putLocalBlob({id,accountId:media.accountId,spaceId:media.spaceId,blob,name:asset.name,createdAt:Date.now(),status:'pending'},privateResolutionIdentity?{identity:privateResolutionIdentity,current:active}:undefined);if(guarded)await check();
  }
  result=applyPaperCommand(local,{type:'batch',commands:mapped.commands});
 }
 if(guarded)await check();
 // A new resolution is a new revision, even when the server version is chosen.
 const selected={...result,revision:Math.max(local.revision,remote?.revision??0,result.revision)+1,updatedAt:new Date().toISOString()};
 try{return amendPaperCollaboration(choice==='server'?remote!:local,selected);}catch{const clean={...selected};delete clean.collaboration;return amendPaperCollaboration(clean,clean);}
}
