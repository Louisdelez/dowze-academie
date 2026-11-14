/** Experimental Library caller bridge. Explicit opt-in; no server endpoint,
 * managed admission or private fallback is inferred from a local tombstone. */
import {changeNotebookTrash,flushNotebookTrash,NotebookTrashError,type NotebookTrashScope,type NotebookTrashStore,type NotebookTrashTransport} from './notebookTrash.ts';
import {isNotebookLibrary} from './notebookLibrary.ts';
import {createNotebookTrashStorage} from '../../pwa/src/notebookTrashStorage.ts';
import {openNotebookStateDatabase} from '../../pwa/src/storage.ts';
export interface NotebookLibraryLifecycleOptions {readonly enabled?:boolean;readonly store:NotebookTrashStore;readonly transport?:NotebookTrashTransport}
/** PWA/local IDB only. Desktop external metadata has no implicit substitute. */
export function createNotebookLibraryLifecycle(options:{enabled?:boolean;transport?:NotebookTrashTransport}={}):Readonly<NotebookLibraryLifecycleOptions>{
 return Object.freeze({enabled:options.enabled===true,store:createNotebookTrashStorage(openNotebookStateDatabase),transport:options.transport});
}
export async function runNotebookLibraryTrashChange(input:{configuration:NotebookLibraryLifecycleOptions;scope:NotebookTrashScope;noteId:string;intent:'trash'|'restore';current:()=>boolean}){
 const configuration=input.configuration,scope={accountId:input.scope.accountId,spaceId:input.scope.spaceId},noteId=input.noteId,intent=input.intent,store=configuration.store,transport=configuration.transport,externalCurrent=input.current,read=store.read.bind(store);let retired=false;
 const current=()=>{if(retired)return false;try{if(configuration.enabled!==true||externalCurrent()!==true)retired=true;}catch{retired=true;}return !retired;};
 const checked=()=>{if(!current())throw new NotebookTrashError('source-changed','Le compte ou la note a changé. Les sources de la corbeille restent conservées.');};
 if(configuration.enabled!==true)throw new NotebookTrashError('transport-unavailable','Le cycle de corbeille expérimental est désactivé.');checked();
 const changed=await changeNotebookTrash({scope,noteId,intent,store,current});checked();let synchronization:'pending'|'acknowledged'='pending',warning='';
 if(transport){try{await flushNotebookTrash({scope,noteId,store,transport,current});checked();}catch(error){checked();warning=String(error instanceof Error?error.message:error);}}
 const view=await read(scope,noteId);checked();if(!view.library||!isNotebookLibrary(view.library.content)||!view.head)throw new NotebookTrashError('invalid-receipt','Le classement et le reçu doivent être retrouvés avant de confirmer la corbeille.');
 if(view.operations.length&&view.operations.every(operation=>operation.status==='acknowledged'))synchronization='acknowledged';
 if(synchronization==='pending')warning=warning||'Corbeille enregistrée sur cet appareil. La confirmation du serveur reste en attente ; les originaux et la file sont conservés.';
 return Object.freeze({changed:changed.changed,library:view.library,head:view.head,synchronization,warning});
}
