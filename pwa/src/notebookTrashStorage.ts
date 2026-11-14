/** Dedicated transactions over the EXISTING notebook stores. The caller passes
 * the normal production database opener; no schema/version or shared API edit. */
import {notebookDocumentId} from '../../src/lib/notebookDocument.ts';
import {LIBRARY_DOCUMENT_ID,isNotebookLibrary} from '../../src/lib/notebookLibrary.ts';
import {notebookTrashHeadKey,notebookTrashSourceKey,notebookTrashOperationKey,validNotebookTrashHead,validNotebookTrashSource,validNotebookTrashOperation,assertNotebookTrashView,assertNotebookTrashLocalTransition,NotebookTrashError,type NotebookTrashScope,type NotebookTrashStore,type NotebookTrashSource,type NotebookTrashView,type NotebookTrashOperation} from '../../src/lib/notebookTrash.ts';
import type {Draft,LocalBlob,Mutation,Snapshot} from './storage.ts';

const stores=['drafts','snapshots','mutations','scopedBlobs'];
const draftKey=(scope:NotebookTrashScope,type:string,id:string)=>[scope.accountId,scope.spaceId,type,id].join('|');
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const owned=(row:NotebookTrashScope,scope:NotebookTrashScope)=>row.accountId===scope.accountId&&row.spaceId===scope.spaceId;
const invalid=()=>new NotebookTrashError('invalid-receipt','Le reçu de corbeille ne correspond pas à ses sources. Aucun original n’est remplacé.');
const changed=()=>new NotebookTrashError('source-changed','La note, ses fichiers ou sa corbeille ont changé. Tous les originaux restent conservés.');
const fileState=(row:LocalBlob)=>{const {blob,...fields}=row;return {...fields,blobSize:blob.size,blobType:blob.type};};
const viewState=(value:NotebookTrashView)=>({...value,files:value.files.map(fileState)});
function currentGuard(current:()=>boolean){let retired=false;return()=>{if(retired)return false;try{if(current()!==true)retired=true;}catch{retired=true;}return !retired;};}
function readWithin(tx:IDBTransaction,scope:NotebookTrashScope,noteId:string,done:(view:NotebookTrashView)=>void,fail:(error:unknown)=>void){
 let left=6,failed=false;const value:{canonical?:Draft;metadata?:Draft;library?:Draft;files:LocalBlob[];mutations:Mutation[];head?:NotebookTrashView['head'];source?:NotebookTrashSource;operations:NotebookTrashOperation[];libraryHistory:Snapshot|undefined}={files:[],mutations:[],operations:[],libraryHistory:undefined};
 const guarded=(work:()=>void)=>{if(failed)return;try{work();}catch(error){failed=true;fail(error);}};
 const complete=()=>{if(--left===0)guarded(()=>{value.operations.sort((a,b)=>a.sequence-b.sequence);done({canonical:value.canonical,metadata:value.metadata,library:value.library,files:value.files,mutations:value.mutations,head:value.head,source:value.source,operations:value.operations,libraryHistory:value.libraryHistory});});};
 const drafts=tx.objectStore('drafts'),snapshots=tx.objectStore('snapshots');
 for(const [name,type,id]of [['canonical','whiteboard',notebookDocumentId(noteId)],['metadata','notesMarkdown',noteId],['library','preferences',LIBRARY_DOCUMENT_ID]]as const){const request=drafts.get(draftKey(scope,type,id));request.onsuccess=()=>guarded(()=>{value[name]=request.result as Draft|undefined;if(name==='library'&&isNotebookLibrary(value.library?.content)){left++;const prior=snapshots.get(`paper-history|${scope.accountId}|${scope.spaceId}|preferences|${LIBRARY_DOCUMENT_ID}|${String(value.library.content.revision).padStart(12,'0')}`);prior.onsuccess=()=>guarded(()=>{value.libraryHistory=prior.result as Snapshot|undefined;complete();});}complete();});}
 const head=snapshots.get(notebookTrashHeadKey(scope,noteId));head.onsuccess=()=>guarded(()=>{
  const row=head.result as Snapshot|undefined;if(row){if(!owned(row,scope)||!validNotebookTrashHead(row.value,scope,noteId))throw invalid();const savedHead=row.value;value.head=savedHead;
   left++;const source=snapshots.get(savedHead.sourceKey);source.onsuccess=()=>guarded(()=>{const stored=source.result as Snapshot|undefined;if(!stored||!owned(stored,scope)||!validNotebookTrashSource(stored.value,scope,noteId)||notebookTrashSourceKey(stored.value,stored.value.deletionId)!==savedHead.sourceKey)throw invalid();value.source=stored.value;complete();});
   for(const id of savedHead.operationIds){left++;const operation=snapshots.get(notebookTrashOperationKey(scope,noteId,id));operation.onsuccess=()=>guarded(()=>{const held=operation.result as Snapshot|undefined;if(!held||!owned(held,scope)||!validNotebookTrashOperation(held.value,scope,noteId)||held.value.id!==id)throw invalid();value.operations.push(held.value);complete();});}
  }complete();
 });
 const files=tx.objectStore('scopedBlobs').openCursor();files.onsuccess=()=>guarded(()=>{const cursor=files.result;if(!cursor){complete();return;}const row=cursor.value as LocalBlob,ids=new Set((value.canonical?.content as{assets?:{id:string}[]}|undefined)?.assets?.map(asset=>asset.id)??[]);if(owned(row,scope)&&(row.documentId===notebookDocumentId(noteId)||ids.has(row.id)))value.files.push(row);cursor.continue();});
 const mutations=tx.objectStore('mutations').openCursor();mutations.onsuccess=()=>guarded(()=>{const cursor=mutations.result;if(!cursor){complete();return;}const row=cursor.value as Mutation;if(owned(row,scope)&&(row.type==='whiteboard'&&row.documentId===notebookDocumentId(noteId)||row.type==='notesMarkdown'&&row.documentId===noteId))value.mutations.push(row);cursor.continue();});
}
export function createNotebookTrashStorage(openDatabase:()=>Promise<IDBDatabase>):NotebookTrashStore {
 const open=async()=>{const db=await openDatabase();if(stores.some(name=>!db.objectStoreNames.contains(name))){db.close();throw invalid();}return db;};
 return {
  async read(scope,noteId){const captured={accountId:scope.accountId,spaceId:scope.spaceId},id=noteId,db=await open();return new Promise<NotebookTrashView>((resolve,reject)=>{let tx:IDBTransaction;try{tx=db.transaction(stores,'readonly');}catch(error){db.close();reject(error);return;}let result:NotebookTrashView|undefined,failure:unknown,aborted=false;const abort=(error:unknown)=>{failure??=error;if(!aborted){aborted=true;tx.abort();}};try{readWithin(tx,captured,id,value=>{assertNotebookTrashView(value,captured,id);result=value;},abort);}catch(error){abort(error);}tx.oncomplete=()=>{db.close();if(result)resolve(result);else reject(invalid());};tx.onerror=event=>{failure??=(event.target as IDBRequest|null)?.error??tx.error;};tx.onabort=()=>{db.close();reject(failure??tx.error??invalid());};});},
  async readSource(scope,noteId,key){const captured={accountId:scope.accountId,spaceId:scope.spaceId},id=noteId,sourceKey=key;if(typeof sourceKey!=='string'||!sourceKey.startsWith('notebook-trash-source|'))throw invalid();const db=await open();return new Promise<NotebookTrashSource|undefined>((resolve,reject)=>{let tx:IDBTransaction;try{tx=db.transaction('snapshots','readonly');}catch(error){db.close();reject(error);return;}let result:NotebookTrashSource|undefined,failure:unknown;const request=tx.objectStore('snapshots').get(sourceKey);request.onsuccess=()=>{try{const row=request.result as Snapshot|undefined;if(row){if(!owned(row,captured)||!validNotebookTrashSource(row.value,captured,id)||notebookTrashSourceKey(row.value,row.value.deletionId)!==sourceKey)throw invalid();result=row.value;}}catch(error){failure=error;tx.abort();}};tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=event=>{failure??=(event.target as IDBRequest|null)?.error??tx.error;};tx.onabort=()=>{db.close();reject(failure??tx.error??invalid());};});},
  async commit(input,current){
   const active=currentGuard(current);if(!active())throw changed();const plan=structuredClone(input);if(!validNotebookTrashHead(plan.head,plan.scope,plan.noteId)||!validNotebookTrashOperation(plan.operation,plan.scope,plan.noteId)||plan.source&&!validNotebookTrashSource(plan.source,plan.scope,plan.noteId)||plan.library&&(!owned(plan.library,plan.scope)||plan.library.type!=='preferences'||plan.library.documentId!==LIBRARY_DOCUMENT_ID))throw invalid();
   const db=await open();if(!active()){db.close();throw changed();}
   await new Promise<void>((resolve,reject)=>{let tx:IDBTransaction;try{tx=db.transaction(stores,'readwrite');}catch(error){db.close();reject(error);return;}let failure:unknown,aborted=false;const abort=(error:unknown)=>{failure??=error;if(!aborted){aborted=true;tx.abort();}};
    const write=(latest:NotebookTrashView)=>{if(!active()||!same(viewState(latest),viewState(plan.expected))){abort(changed());return;}
     const oldOperation=latest.operations.find(op=>op.id===plan.operation.id),ack=plan.operation.status==='acknowledged';
     if(ack?(!oldOperation||oldOperation.status!=='pending'||!same({...plan.operation,status:'pending',receipt:undefined},oldOperation)||plan.library!==undefined||plan.history!==undefined||plan.source!==undefined||!same(plan.head,{...latest.head,server:plan.operation.receipt})):oldOperation!==undefined||plan.operation.sequence!==(latest.head?.sequence??0)+1||plan.head.sequence!==plan.operation.sequence||!plan.library||!isNotebookLibrary(plan.library.content)){abort(invalid());return;}
     try{if(!ack)assertNotebookTrashLocalTransition(plan,latest);assertNotebookTrashView({...latest,head:plan.head,source:plan.source??latest.source,library:plan.library??latest.library,operations:ack?latest.operations.map(op=>op.id===plan.operation.id?plan.operation:op):[...latest.operations,plan.operation]},plan.scope,plan.noteId);}catch(error){abort(error);return;}
     const snapshots=tx.objectStore('snapshots'),commit=()=>{if(!active()){abort(changed());return;}try{
      // Request order puts the tombstone/receipt first; all changes still share
      // one native atomic commit, so no intermediate state can be observed.
      snapshots.put({key:notebookTrashHeadKey(plan.scope,plan.noteId),...plan.scope,value:plan.head});
      if(plan.source)snapshots.put({key:plan.head.sourceKey,...plan.scope,value:plan.source});
      snapshots.put({key:notebookTrashOperationKey(plan.scope,plan.noteId,plan.operation.id),...plan.scope,value:plan.operation});
      if(plan.history)snapshots.put(plan.history);
      if(plan.library)tx.objectStore('drafts').put({...plan.library,key:draftKey(plan.scope,'preferences',LIBRARY_DOCUMENT_ID)});
      if(!active())abort(changed());
     }catch(error){abort(error);}};
     let left=Number(!!plan.source)+Number(!!plan.history)+Number(!ack);const checked=()=>{if(--left===0)commit();};if(!left){commit();return;}
     if(!ack){const existing=snapshots.get(notebookTrashOperationKey(plan.scope,plan.noteId,plan.operation.id));existing.onsuccess=()=>{if(existing.result!==undefined){abort(changed());return;}checked();};}
     if(plan.source){const existing=snapshots.get(plan.head.sourceKey);existing.onsuccess=()=>{if(existing.result){abort(changed());return;}checked();};}
     if(plan.history){if(!owned(plan.history,plan.scope)||!same(plan.history.value,latest.library?.content)){abort(invalid());return;}const existing=snapshots.get(plan.history.key);existing.onsuccess=()=>{if(existing.result){abort(changed());return;}checked();};}
    };
    try{readWithin(tx,plan.scope,plan.noteId,write,abort);}catch(error){abort(error);}
    tx.oncomplete=()=>{db.close();resolve();};tx.onerror=event=>{failure??=(event.target as IDBRequest|null)?.error??tx.error;};tx.onabort=()=>{db.close();reject(failure??tx.error??changed());};
   });
  },
 };
}
