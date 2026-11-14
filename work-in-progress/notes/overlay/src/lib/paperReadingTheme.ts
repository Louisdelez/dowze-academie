import {commitNotebookTransfer,getSnapshot,type Snapshot,type NotebookTransferCommit} from '../../pwa/src/storage.ts';
import {notebookIdentityDigest} from './notebookIdentity.ts';

export const PAPER_READING_THEMES=['light','sepia','dark'] as const;
export type PaperReadingTheme=typeof PAPER_READING_THEMES[number];
/** Local account preference namespace, never an annual space or note. It is
 * stored only in snapshots; no draft, queue, API resource or asset is written. */
export const PAPER_READING_PREFERENCE_SPACE='local-paper-reader-preferences';
interface ReadingThemeRecord {schema:1;kind:'paper-reading-theme';accountId:string;theme:PaperReadingTheme;revision:number;updatedAt:string}
export interface LoadedPaperReadingTheme {accountId:string;theme:PaperReadingTheme;row?:Snapshot}
const clone=<T>(value:T):T=>structuredClone(value);
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const keys=(value:Record<string,unknown>,expected:string[])=>Object.keys(value).sort().join('|')===[...expected].sort().join('|');
export const isPaperReadingTheme=(value:unknown):value is PaperReadingTheme=>typeof value==='string'&&PAPER_READING_THEMES.includes(value as PaperReadingTheme);
const check=(current:()=>boolean)=>{if(!current())throw Error('Le compte ou la lecture a changé. Le thème précédent est conservé.');};
function owner(accountId:string){if(typeof accountId!=='string'||!accountId.length||accountId.length>2048)throw Error('Le compte de lecture doit être identifié.');return {accountId,spaceId:PAPER_READING_PREFERENCE_SPACE};}
export function paperReadingThemeKey(accountId:string):string{owner(accountId);return 'paper-reading-theme|v1|'+notebookIdentityDigest(JSON.stringify(['reader-theme',accountId]));}
function validDate(value:unknown):value is string{return typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;}
function validRecord(value:unknown,accountId:string):value is ReadingThemeRecord{return record(value)&&keys(value,['schema','kind','accountId','theme','revision','updatedAt'])&&value.schema===1&&value.kind==='paper-reading-theme'&&value.accountId===accountId&&isPaperReadingTheme(value.theme)&&Number.isSafeInteger(value.revision)&&Number(value.revision)>0&&validDate(value.updatedAt);}
function fromRow(accountId:string,row:Snapshot|undefined):LoadedPaperReadingTheme{
 const scope=owner(accountId),key=paperReadingThemeKey(accountId);
 if(row&&(!record(row)||!keys(row as unknown as Record<string,unknown>,['key','accountId','spaceId','value'])||row.key!==key||row.accountId!==accountId||row.spaceId!==scope.spaceId||!validRecord(row.value,accountId)))throw Error('Le thème conservé ne peut pas être remplacé. Son original reste intact.');
 return {accountId,theme:row?(row.value as ReadingThemeRecord).theme:'light',...(row?{row:clone(row)}:{})};
}
export async function loadPaperReadingTheme(accountId:string,current:()=>boolean):Promise<LoadedPaperReadingTheme>{owner(accountId);check(current);const row=await getSnapshot(paperReadingThemeKey(accountId));check(current);return fromRow(accountId,row);}
export async function commitPaperReadingTheme(loaded:LoadedPaperReadingTheme,theme:PaperReadingTheme,current:()=>boolean,now=new Date().toISOString()):Promise<LoadedPaperReadingTheme>{
 const scope=owner(loaded.accountId);check(current);if(!isPaperReadingTheme(theme)||!validDate(now))throw Error('Le thème de lecture est invalide.');
 const before=fromRow(loaded.accountId,loaded.row);if(before.theme!==loaded.theme)throw Error('Rechargez le thème courant avant de le modifier.');
 if(theme===before.theme)return before;
 const previous=before.row?.value as ReadingThemeRecord|undefined,revision=(previous?.revision??0)+1;if(!Number.isSafeInteger(revision))throw Error('La révision du thème doit être vérifiée.');
 const key=paperReadingThemeKey(scope.accountId),value:ReadingThemeRecord={schema:1,kind:'paper-reading-theme',accountId:scope.accountId,theme,revision,updatedAt:now},next:Snapshot={key,...scope,value};
 const plan:NotebookTransferCommit={target:scope,sources:[],drafts:[],blobs:[],snapshots:[next],draftChecks:[],blobChecks:[],snapshotChecks:[{key,expected:before.row}]};
 if(before.row){
  const historyKey=key+'|history|'+notebookIdentityDigest(JSON.stringify(before.row)),history=await getSnapshot(historyKey);check(current);
  if(history&&(history.key!==historyKey||history.accountId!==scope.accountId||history.spaceId!==scope.spaceId||JSON.stringify(history.value)!==JSON.stringify(before.row)))throw Error('L’historique du thème a changé. Aucun original n’est remplacé.');
  plan.snapshotChecks.push({key:historyKey,expected:history});if(!history)plan.snapshots.push({key:historyKey,...scope,value:clone(before.row)});
 }
 check(current);await commitNotebookTransfer(plan,current);check(current);return fromRow(scope.accountId,next);
}
