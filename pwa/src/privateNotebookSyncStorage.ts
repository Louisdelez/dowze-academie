/** Transaction-local private-v1 exclusion. Reads keys and small current headers
 * only, never snapshots.getAll(), binding originals, pending packets or history. */
import {buildPrivateNotebookSyncPolicy,type PrivateNotebookSyncPolicy,type PrivateNotebookSyncScope,type PrivateNotebookSnapshotLike} from '../../src/lib/privateNotebookSyncPolicy.ts';

const invalid=()=>Error('Les marqueurs de synchronisation de ce carnet doivent être vérifiés. Aucun envoi privé ni effacement n’a été effectué.');
const MAX_VISITED_KEYS=100_000;
const scopePrefix=(namespace:string,scope:PrivateNotebookSyncScope)=>namespace+JSON.stringify([scope.accountId,scope.spaceId]).slice(0,-1)+',';
export function readPrivateNotebookSyncPolicy(tx:IDBTransaction,input:PrivateNotebookSyncScope,current:()=>boolean,done:(policy:PrivateNotebookSyncPolicy)=>void,fail:(error:unknown)=>void):void{
 const scope={accountId:input.accountId,spaceId:input.spaceId};
 // These two OLD key namespaces use pipes. An ambiguous owner/year is a
 // conservative refusal, never an invitation to inspect another scope's row.
 if(!scope.accountId||!scope.spaceId||scope.accountId.includes('|')||scope.spaceId.includes('|')){fail(invalid());return;}
 const store=tx.objectStore('snapshots'),bindingKeys:string[]=[],resources:PrivateNotebookSnapshotLike[]=[],trash:PrivateNotebookSnapshotLike[]=[],deletionKeys:string[]=[],metadataAliases:PrivateNotebookSnapshotLike[]=[];
 let left=5,failed=false,visited=0;
 const guarded=(work:()=>void)=>{if(failed)return;try{if(current()!==true)throw invalid();work();}catch(error){failed=true;fail(error);}};
 const complete=()=>guarded(()=>{if(--left===0)done(buildPrivateNotebookSyncPolicy(scope,{bindingKeys,resources,trash,deletionKeys,metadataAliases}));});
 const snapshot=(key:string,accept:(row:PrivateNotebookSnapshotLike)=>void,next:()=>void,otherSpace=false)=>{
  const request=store.get(key);request.onsuccess=()=>guarded(()=>{const row=request.result as PrivateNotebookSnapshotLike|undefined;if(!row||row.key!==key||row.accountId!==scope.accountId||!otherSpace&&row.spaceId!==scope.spaceId)throw invalid();if(row.spaceId===scope.spaceId)accept(row);next();});
 };
 const walk=(prefix:string,visit:(key:string,next:()=>void)=>void)=>{
  const request=store.openKeyCursor();request.onsuccess=()=>guarded(()=>{const cursor=request.result;if(!cursor){complete();return;}if(++visited>MAX_VISITED_KEYS)throw invalid();if(indexedDB.cmp(cursor.key,prefix)<0){cursor.continue(prefix);return;}if(typeof cursor.key!=='string'||!cursor.key.startsWith(prefix)){complete();return;}visit(cursor.key,()=>cursor.continue());});
 };
 walk(scopePrefix('managed-notebook-binding|',scope),(key,next)=>{bindingKeys.push(key);next();});
 walk('managed-notebook-resource|',(key,next)=>{
  let parts:unknown;try{parts=JSON.parse(key.slice('managed-notebook-resource|'.length));}catch{throw invalid();}
  if(!Array.isArray(parts)||parts.length!==3||parts.some(v=>typeof v!=='string'))throw invalid();
  if(parts[1]!==scope.accountId){next();return;}
  snapshot(key,row=>resources.push(row),next,true);
 });
 walk(scopePrefix('notebook-trash-head|',scope),(key,next)=>snapshot(key,row=>{
  const h=row.value as Record<string,unknown>|undefined,operations=h?.operationIds;if(!h||!Array.isArray(operations)||!operations.length)throw invalid();
  const rawServer=h.server;if(rawServer!==undefined&&(!rawServer||typeof rawServer!=='object'||Array.isArray(rawServer)))throw invalid();const server=rawServer as Record<string,unknown>|undefined;
  trash.push({...row,value:{schema:h.schema,kind:h.kind,accountId:h.accountId,spaceId:h.spaceId,noteId:h.noteId,state:h.state,deletionId:h.deletionId,latestOperationId:operations.at(-1),...(server!==undefined?{server:{state:server.state,deletionId:server.deletionId,operationId:server.operationId}}:{})}});
 },next));
 walk(`paper-canonical-deletion|${scope.accountId}|${scope.spaceId}|whiteboard|`,(key,next)=>{const tail=key.slice(`paper-canonical-deletion|${scope.accountId}|${scope.spaceId}|whiteboard|`.length);if(!tail)throw invalid();if(!tail.includes('|'))deletionKeys.push(key);next();});
 walk(`paper-metadata-transport|${scope.accountId}|${scope.spaceId}|`,(key,next)=>{const tail=key.slice(`paper-metadata-transport|${scope.accountId}|${scope.spaceId}|`.length);if(!tail)throw invalid();if(tail.includes('|')){next();return;}snapshot(key,row=>{const v=row.value as Record<string,unknown>|undefined;if(!v)throw invalid();metadataAliases.push({...row,value:{schema:v.schema,kind:v.kind,accountId:v.accountId,spaceId:v.spaceId,logicalId:v.logicalId,documentId:v.documentId,graphId:v.graphId}});},next);});
}
