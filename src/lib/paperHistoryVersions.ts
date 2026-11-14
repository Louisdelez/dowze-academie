import {listSnapshotsByPrefix,type Snapshot} from '../../pwa/src/storage';
import {isPaperDocument,notebookDocumentId,type PaperDocument} from './notebookDocument';
export type PaperHistoryVariant='value'|'durable'|'visible'|'server';
export interface PaperHistorySelection {snapshot:Snapshot;variant:PaperHistoryVariant;document:PaperDocument}
export type PaperHistoryCopyCallback=(selection:PaperHistorySelection,current:()=>boolean)=>Promise<unknown>;
type Scope={accountId:string;spaceId:string};
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const prefixes=(noteId:string,scope:Scope)=>({history:`paper-history|${scope.accountId}|${scope.spaceId}|whiteboard|${notebookDocumentId(noteId)}|`,resolution:`paper-resolution|${scope.accountId}|${scope.spaceId}|whiteboard|${notebookDocumentId(noteId)}|`});
/** The row, namespace and exact selected slot are the proof; arbitrary caller
 * documents cannot be passed off as an old version of another note. */
export function paperHistoryDocument(snapshot:Snapshot,variant:PaperHistoryVariant,noteId:string,scope:Scope):PaperDocument|undefined {
 if(!snapshot||snapshot.accountId!==scope.accountId||snapshot.spaceId!==scope.spaceId||typeof snapshot.key!=='string')return;
 const keys=prefixes(noteId,scope);let value:unknown;
 if(variant==='value'&&snapshot.key.startsWith(keys.history)&&snapshot.key.length>keys.history.length)value=snapshot.value;
 else if(snapshot.key.startsWith(keys.resolution)&&snapshot.key.length>keys.resolution.length&&record(snapshot.value)){
  const row=snapshot.value;
  if(variant==='visible')value=row.visibleContent;
  else if(variant==='durable'&&record(row.durable))value=row.durable.content;
  else if(variant==='server'&&record(row.server))value=row.server.content;
 }
 return isPaperDocument(value)&&value.noteId===noteId?value:undefined;
}
/** Capture before the caller's first await. A later selection mutation cannot
 * redirect a prepared copy or change the whole-row CAS expectation. */
export function capturePaperHistorySelection(input:PaperHistorySelection,noteId:string,scope:Scope):PaperHistorySelection {
 const selected=structuredClone(input),document=paperHistoryDocument(selected?.snapshot,selected?.variant,noteId,scope);
 if(!document||JSON.stringify(document)!==JSON.stringify(selected.document))throw Error('Cette version ne correspond plus à son original conservé. Aucun contenu n’est restauré.');
 return {snapshot:selected.snapshot,variant:selected.variant,document};
}
/** Targeted prefix readers avoid cloning unrelated histories/catalogues. This
 * reader never writes or changes the original rows. */
export async function readPaperHistorySelections(noteId:string,scope:Scope,current:()=>boolean):Promise<PaperHistorySelection[]>{
 const check=()=>{if(!current())throw Error('Le carnet a changé avant la lecture de ses versions.');};check();
 const captured={accountId:scope.accountId,spaceId:scope.spaceId},keys=prefixes(noteId,captured);
 const history=await listSnapshotsByPrefix(captured.accountId,captured.spaceId,keys.history);check();
 const resolutions=await listSnapshotsByPrefix(captured.accountId,captured.spaceId,keys.resolution);check();
 const distinct=new Map<string,PaperHistorySelection>();
 for(const snapshot of [...history,...resolutions])for(const variant of ['value','durable','visible','server'] as const){
  const document=paperHistoryDocument(snapshot,variant,noteId,captured);if(!document)continue;
  const key=JSON.stringify(document);if(!distinct.has(key))distinct.set(key,{snapshot,variant,document});
 }
 check();return [...distinct.values()].sort((a,b)=>b.document.revision-a.document.revision);
}
