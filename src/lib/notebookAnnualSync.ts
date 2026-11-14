import type {ApiClient} from '../../pwa/src/api.ts';
import {synchronizeSpace} from '../../pwa/src/sync.ts';
import {notebookPrivateTransportAllowed} from '../../pwa/src/storage.ts';
import {canPublishNotebookMetadata} from './paperMetadataPublication.ts';
import type {SyncDocument} from './serverSync.ts';

/** Every annual workspace must acknowledge its scoped graph before the native
 * metadata pass. synchronizeSpace retains its account/space queue and the
 * supplied API's original document filter; it does not reset server journals. */
export async function synchronizeNotebookYearBeforeMetadata(api:ApiClient,scope:{accountId:string;spaceId:string},current:()=>boolean,flushLocal:()=>Promise<void>):Promise<boolean>{
 if(!current())return false;
 await flushLocal();if(!current())return false;
 await synchronizeSpace(api,scope.accountId,scope.spaceId,current);
 return current();
}

/** A note created during the metadata pass may not have existed in its initial
 * graph pass. Reuse that same scoped uploader only when the original dependency
 * guard defers it; managed/trash policy never becomes a private fallback. */
export async function prepareNotebookMetadataPublication(api:ApiClient,scope:{accountId:string;spaceId:string},document:SyncDocument,current:()=>boolean,flushLocal:()=>Promise<void>):Promise<boolean>{
 if(await canPublishNotebookMetadata(document,scope,current))return current();
 if(document.type!=='notesMarkdown'||!current())return false;
 if(!await notebookPrivateTransportAllowed({...scope,type:document.type,documentId:document.id},current))return false;
 await flushLocal();if(!current())return false;
 await synchronizeSpace(api,scope.accountId,scope.spaceId,current);if(!current())return false;
 return canPublishNotebookMetadata(document,scope,current);
}
