import type {ApiClient} from '../../pwa/src/api';
import {notebookPrivateTransportAllowed,type DraftKey} from '../../pwa/src/storage';
import {PrivateNotebookBlockedError} from './privateNotebookSyncPolicy';
import {decodePaperSync} from './paperSync';

/** One explicitly admitted resolution. Captures only owner/identity and an
 * opaque API epoch; no token, document rewrite or private/managed fallback. */
export function capturePrivateNotebookResolution(input:{scope:DraftKey;api?:ApiClient;current:()=>boolean}){
 const scope={accountId:input.scope.accountId,spaceId:input.scope.spaceId,type:input.scope.type??'notesMarkdown',documentId:input.scope.documentId},api=input.api,view=input.current;let revoked=false,ticketRetired=false;
 const viewCurrent=()=>{if(revoked)return false;try{if(view()!==true)revoked=true;}catch{revoked=true;}return !revoked;};
 const retired=()=>Error('La source ou la connexion de cette résolution a changé. Les versions originales restent conservées.');
 if(!viewCurrent())throw retired();
 const lease=api?.captureSessionAuthority(scope.accountId);
 const ownsSource=()=>{if(!viewCurrent())return false;try{if(api&&lease?.()!==true)revoked=true;}catch{revoked=true;}return !revoked;};
 const current=()=>!ticketRetired&&ownsSource(),requireCurrent=()=>{if(!current())throw retired();};requireCurrent();
 const check=async(content?:unknown)=>{requireCurrent();try{if(!await notebookPrivateTransportAllowed(scope,current,content)){ticketRetired=true;throw new PrivateNotebookBlockedError();}requireCurrent();}catch(error){ticketRetired=true;throw error;}};
 const decode=async(content:unknown)=>{requireCurrent();const captured=structuredClone(content);await check(captured);requireCurrent();if(!api)throw Error('La version serveur attend une connexion authentifiée. Les originaux restent conservés.');const document=await decodePaperSync(api,scope.spaceId,captured,current,()=>check(captured));requireCurrent();return document;};
 return Object.freeze({scope:Object.freeze(scope),current,ownsSource,check,decode});
}
