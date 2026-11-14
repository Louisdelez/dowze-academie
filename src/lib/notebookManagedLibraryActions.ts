/** Route only durably admitted notes to the managed lifecycle. A known marker
 * never falls through to classification/private sync, including malformed or
 * pending admissions. Bulk containing any managed note is refused in full. */
import {ManagedClientError,assertManagedCurrent,managedCurrent} from '../../pwa/src/managedNotebookClient.ts';
import {managedBindingKey} from '../../pwa/src/managedNotebookStore.ts';
import {openNotebookStateDatabase} from '../../pwa/src/storage.ts';
import type {createNotebookManagedApplication,ManagedApplicationScope} from './notebookManagedApplication.ts';
export interface ManagedLibraryTrashResult {readonly handled:boolean;readonly warning?:string}
export type ManagedLibraryTrashAction=(ids:readonly string[],intent:'trash'|'restore',current:()=>boolean)=>Promise<Readonly<ManagedLibraryTrashResult>>;
export function createManagedLibraryTrashAction(input:{scope:ManagedApplicationScope;current:()=>boolean;create:(current:()=>boolean)=>ReturnType<typeof createNotebookManagedApplication>;openDatabase?:()=>Promise<IDBDatabase>}):ManagedLibraryTrashAction {
 const scope=Object.freeze({...input.scope}),view=input.current,create=input.create,open=input.openDatabase??openNotebookStateDatabase;
 return async(ids,intent,callerCurrent)=>{
  const current=managedCurrent(()=>view()===true&&callerCurrent()===true),captured=Object.freeze([...ids]);assertManagedCurrent(current);
  if(!captured.length||captured.length>1000||new Set(captured).size!==captured.length||captured.some(id=>typeof id!=='string'||!id||id.length>200)||!['trash','restore'].includes(intent))throw new ManagedClientError('source-changed','Choisissez une note avant cette action.');
  const db=await open();if(!current()){db.close();assertManagedCurrent(current);}let found=false;
  await new Promise<void>((resolve,reject)=>{let tx:IDBTransaction;try{tx=db.transaction('snapshots','readonly');}catch(error){db.close();reject(error);return;}let failure:unknown;const fail=(error:unknown)=>{failure??=error;try{tx.abort();}catch{}};
   tx.oncomplete=()=>{db.close();if(current())resolve();else reject(new ManagedClientError('source-changed','Le compte de cette note a changé.'));};tx.onerror=event=>{failure??=(event.target as IDBRequest|null)?.error??tx.error;};tx.onabort=()=>{db.close();reject(failure??tx.error??Error('La lecture de la note a été interrompue.'));};
   try{for(const noteId of captured){assertManagedCurrent(current);const key=managedBindingKey({...scope,noteId}),request=tx.objectStore('snapshots').openKeyCursor(key);request.onsuccess=()=>{try{assertManagedCurrent(current);if(request.result){if(request.result.key!==key)throw Error('Identité de note incohérente.');found=true;}}catch(error){fail(error);}};}}catch(error){fail(error);}
  });assertManagedCurrent(current);if(!found)return Object.freeze({handled:false});
  if(captured.length!==1)throw new ManagedClientError('unavailable','Pour préserver chaque confirmation, déplacez une seule note synchronisée à la fois. Aucune note de la sélection n’a été modifiée.');
  const application=create(current);try{const result=await application.lifecycle(captured[0],intent);assertManagedCurrent(current);return Object.freeze({handled:true,warning:result.warning});}finally{await application.dispose();}
 };
}
