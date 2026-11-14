import {commitNotebookTransfer,getSnapshot,type Snapshot,type NotebookTransferCommit} from '../../pwa/src/storage';
import {notebookIdentityDigest} from './notebookIdentity';
import {registerNotebookWriter} from './notebookSession';
import {paperTextStyle,type PaperTextStyle} from './paperTextStyle';

export interface PaperTextStyleFavoriteScope {accountId:string;spaceId:string}
export interface PaperTextStyleFavorite {id:string;label:string;style:PaperTextStyle}
interface FavoriteRecord extends PaperTextStyleFavoriteScope {schema:1;kind:'paper-text-style-favorites';revision:number;updatedAt:string;styles:PaperTextStyleFavorite[]}
export interface LoadedPaperTextStyleFavorites {scope:PaperTextStyleFavoriteScope;row:Snapshot|undefined;styles:PaperTextStyleFavorite[]}
export type PaperTextStyleFavoriteCommand={type:'save';label:string;style:PaperTextStyle}|{type:'rename';id:string;label:string}|{type:'delete';id:string};
export interface PaperTextStyleFavoriteOwner {scope:PaperTextStyleFavoriteScope;current:()=>boolean;captureAuthority?:()=>()=>boolean}
export interface PaperTextStyleFavoritesState {ready:boolean;saving:boolean;styles:PaperTextStyleFavorite[];notice:string}
export interface PaperTextStyleFavoriteController {state:()=>PaperTextStyleFavoritesState;change:(command:PaperTextStyleFavoriteCommand)=>Promise<boolean>;settled:()=>Promise<void>;pending:()=>boolean;close:()=>Promise<void>}
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const clone=<T>(value:T):T=>structuredClone(value);
const id=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const validLabel=(value:unknown):value is string=>typeof value==='string'&&value===value.trim()&&value.length>0&&value.length<=64&&!/[\u0000-\u001f\u007f]/.test(value);
function scopeOnly(scope:PaperTextStyleFavoriteScope):PaperTextStyleFavoriteScope{
 if(typeof scope.accountId!=='string'||!scope.accountId.length||scope.accountId.length>2048||typeof scope.spaceId!=='string'||!scope.spaceId.length||scope.spaceId.length>2048)throw Error('Le compte et l’année sont nécessaires pour les styles favoris.');
 return {accountId:scope.accountId,spaceId:scope.spaceId};
}
export function paperTextStyleFavoriteKey(scopeInput:PaperTextStyleFavoriteScope):string{const scope=scopeOnly(scopeInput);return 'paper-text-style-favorites|v1|'+notebookIdentityDigest(JSON.stringify(['text-styles',scope.accountId,scope.spaceId]));}
export function paperTextStyleFavoriteHistoryPrefix(scope:PaperTextStyleFavoriteScope):string{return paperTextStyleFavoriteKey(scope)+'|history|';}
function stylesValid(value:unknown):value is PaperTextStyleFavorite[]{
 return Array.isArray(value)&&value.length<=20&&value.every(entry=>record(entry)&&Object.keys(entry).length===3&&Object.keys(entry).every(key=>['id','label','style'].includes(key))&&id(entry.id)&&validLabel(entry.label)&&paperTextStyle(entry.style)!==null)&&new Set(value.map(entry=>entry.id)).size===value.length;
}
function rowStyles(scope:PaperTextStyleFavoriteScope,row:Snapshot|undefined):PaperTextStyleFavorite[]{
 if(!row)return [];const value=row.value;
 if(row.key!==paperTextStyleFavoriteKey(scope)||row.accountId!==scope.accountId||row.spaceId!==scope.spaceId||!record(value)||Object.keys(value).length!==7||Object.keys(value).some(key=>!['schema','kind','accountId','spaceId','revision','updatedAt','styles'].includes(key))||value.schema!==1||value.kind!=='paper-text-style-favorites'||value.accountId!==scope.accountId||value.spaceId!==scope.spaceId||!Number.isSafeInteger(value.revision)||Number(value.revision)<1||typeof value.updatedAt!=='string'||!Number.isFinite(Date.parse(value.updatedAt))||!stylesValid(value.styles))throw Error('Les styles favoris précédents doivent être vérifiés. Leur original reste conservé.');
 return clone(value.styles);
}
function check(current:()=>boolean){if(current()!==true)throw Error('Le compte ou l’année des styles favoris a changé. Aucun favori n’a été remplacé.');}
export async function loadPaperTextStyleFavorites(scopeInput:PaperTextStyleFavoriteScope,current:()=>boolean):Promise<LoadedPaperTextStyleFavorites>{
 const scope=scopeOnly(scopeInput);check(current);const row=await getSnapshot(paperTextStyleFavoriteKey(scope));check(current);return {scope,row:clone(row),styles:rowStyles(scope,row)};
}
/** Snapshot-only transaction: the resolved style is independent of note bodies.
 * Whole previous rows and history destinations are checked by the real IDB CAS. */
export async function commitPaperTextStyleFavorite(input:{loaded:LoadedPaperTextStyleFavorites;command:PaperTextStyleFavoriteCommand;current:()=>boolean;newId?:()=>string;now?:string}):Promise<LoadedPaperTextStyleFavorites>{
 const {loaded,command,current}=input,scope=scopeOnly(loaded.scope),key=paperTextStyleFavoriteKey(scope),before=clone(loaded.row),styles=rowStyles(scope,before);check(current);
 if(!same(styles,loaded.styles))throw Error('Les styles favoris chargés ont changé. Reprenez leur lecture avant toute modification.');
 if(command.type==='save'){
  const label=command.label.trim(),style=paperTextStyle(command.style),newId=(input.newId??(()=>crypto.randomUUID()))();
  if(!validLabel(label)||!style||!id(newId)||styles.some(style=>style.id===newId)||styles.length>=20)throw Error('Choisissez un nom de 1 à 64 caractères et un style valide, parmi 20 favoris au maximum.');
  styles.push({id:newId,label,style});
 }else{
  if(!id(command.id))throw Error('L’identité de ce favori doit être vérifiée.');const at=styles.findIndex(style=>style.id===command.id);if(at<0)throw Error('Ce style favori n’est plus disponible.');
  if(command.type==='delete')styles.splice(at,1);
  else if(command.type==='rename'){const label=command.label.trim();if(!validLabel(label))throw Error('Le nom du favori doit contenir entre 1 et 64 caractères.');styles[at]={...styles[at],label};}
  else throw Error('Cette modification du favori est inconnue.');
 }
 const revision=before?(before.value as FavoriteRecord).revision+1:1,updatedAt=input.now??new Date().toISOString();
 if(!Number.isSafeInteger(revision)||!Number.isFinite(Date.parse(updatedAt))||!stylesValid(styles))throw Error('Les nouveaux styles favoris doivent être vérifiés.');
 const next:Snapshot={key,...scope,value:{schema:1,kind:'paper-text-style-favorites',...scope,revision,updatedAt,styles:clone(styles)} satisfies FavoriteRecord};
 const plan:NotebookTransferCommit={target:scope,sources:[],drafts:[],blobs:[],snapshots:[next],draftChecks:[],blobChecks:[],snapshotChecks:[{key,expected:before}]};
 if(before){
  const historyKey=paperTextStyleFavoriteHistoryPrefix(scope)+notebookIdentityDigest(JSON.stringify(before)),history=await getSnapshot(historyKey);check(current);
  const expected:Snapshot={key:historyKey,...scope,value:{schema:1,kind:'paper-text-style-favorites-history',original:before}};
  if(history&&!same(history,expected))throw Error('Une version antérieure de ces favoris doit être vérifiée. Aucun original n’est remplacé.');
  plan.snapshotChecks.push({key:historyKey,expected:history});if(!history)plan.snapshots.push(expected);
 }
 check(current);await commitNotebookTransfer(plan,current);check(current);return {scope,row:clone(next),styles:clone(styles)};
}
/** One captured API lease, one serial tail, and no silent recapture after ABA.
 * Registration remains owned until opening and all accepted originals finish. */
export function createPaperTextStyleFavoriteController(owner:PaperTextStyleFavoriteOwner,notify:()=>void=()=>{}):PaperTextStyleFavoriteController{
 const scope=scopeOnly(owner.scope);let retired=false,writable=true,pending=0,loaded:LoadedPaperTextStyleFavorites|null=null,lastError:Error|null=null,notice='',closing:Promise<void>|null=null;
 let authority:()=>boolean=()=>false;try{if(owner.current()===true)authority=owner.captureAuthority?.()??(()=>true);else retired=true;}catch{retired=true;}
 const current=()=>{if(retired)return false;try{if(owner.current()===true&&authority()===true)return true;}catch{}retired=true;return false;};
 const publish=()=>{if(current())notify();};
 const opening=loadPaperTextStyleFavorites(scope,current).then(value=>{if(current())loaded=value;}).catch(error=>{if(current()){lastError=error instanceof Error?error:Error('Les styles favoris ne sont pas disponibles.');notice=lastError.message;}}).then(publish);
 let tail:Promise<void>=Promise.resolve();
 // Joining originals is distinct from accepting a write: change() returns
 // true only after CAS. A refused name/read/CAS stays visible as a notice,
 // but cannot poison unrelated note/account closure when no write is pending.
 const settled=async():Promise<void>=>{await opening;const original=tail;await original;if(original!==tail)await settled();};
 let unregister=()=>{};
 const close=()=>{if(closing)return closing;retired=true;const original=tail;closing=Promise.allSettled([opening,original]).then(()=>{unregister();});return closing;};
 unregister=registerNotebookWriter(scope.accountId,{flush:()=>{},settled,pending:()=>pending>0,suspend:()=>{writable=false;publish();},resume:()=>{writable=true;publish();},dispose:()=>{void close();}});
 return {
  state:()=>{const valid=current();return {ready:valid&&writable&&loaded!==null,saving:pending>0,styles:valid&&loaded?clone(loaded.styles):[],notice};},pending:()=>pending>0,settled,close,
  change:command=>{
   if(!current()||!writable||!loaded||pending>0)return Promise.resolve(false);const captured=clone(command);pending++;notice='';lastError=null;publish();
   const work=tail.then(async()=>{await opening;if(!current()||!writable||!loaded)return false;
    try{const value=await commitPaperTextStyleFavorite({loaded,command:captured,current});if(!current())return false;loaded=value;notice='Style favori enregistré.';return true;}
    catch(error){if(current()){lastError=error instanceof Error?error:Error('Le style favori attend son enregistrement.');notice=lastError.message;}return false;}
   }).finally(()=>{pending--;publish();});tail=work.then(()=>{});return work;
  }
 };
}
