import {getDraft,readNotebookDeletionStatus,notebookPrivateTransportAllowed} from '../../pwa/src/storage.ts';
import {isPaperDocument,notebookDocumentId} from './notebookDocument.ts';

/** Keep dependent metadata visible locally while its graph/files await upload. */
export async function canPublishNotebookMetadata(
 document:{type:string;id:string},scope:{accountId:string;spaceId:string},current:()=>boolean
):Promise<boolean>{
 if(!current())return false;
 if(!await notebookPrivateTransportAllowed({...scope,type:document.type,documentId:document.id},current))return false;
 if(document.type!=='notesMarkdown')return true;
 try{if(await readNotebookDeletionStatus(document.id,scope,current))return false;}catch(error){if(!current())return false;throw error;}
 const paper=await getDraft({...scope,type:'whiteboard',documentId:notebookDocumentId(document.id)});
 if(!current())return false;
 if(paper&&(paper.identityAlias||paper.staged||paper.syncState!=='synced'||!isPaperDocument(paper.content)||paper.content.noteId!==document.id))return false;
 return notebookPrivateTransportAllowed({...scope,type:document.type,documentId:document.id},current);
}
