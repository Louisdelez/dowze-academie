import {createElement,useLayoutEffect} from 'react';
import {usePaperDocument} from '../src/hooks/usePaperDocument';
import type {NotebookMediaScope} from '../src/components/NotebookEditor';
export function HookRecipe(props:{noteId:string;markdown:string;media:NotebookMediaScope;report:(value:ReturnType<typeof usePaperDocument>)=>void}){
 const paper=usePaperDocument(props.noteId,props.markdown,props.media,false);
 useLayoutEffect(()=>props.report(paper));
 return createElement('div',{'data-note':paper.document?.noteId,'data-blocked':paper.blocked},paper.notice);
}
export {createElement,act} from 'react';
export {createRoot} from 'react-dom/client';
export {flushSync} from 'react-dom';
export {putDraft,getDraft,putSnapshot,getSnapshot,listSnapshots,listLocalBlobs,listDrafts,listMutations,putLocalBlob,queueLocalDrafts,savePaperDraft,notebookDeletionKey} from '../pwa/src/storage';
export {migratePaper,notebookDocumentId,applyPaperCommand} from '../src/lib/notebookDocument';
export {amendPaperCollaboration,verifyPaperCollaboration} from '../src/lib/paperCollaboration';
export {paperMarkdown} from '../src/lib/paperArchiveMetadata';
export {paperLegacyReceiptKey} from '../src/lib/paperLegacyBridge';
export {paperLegacyOwnerKey} from '../src/lib/paperLegacyMigration';
export {flushMutations,resolvePaperAssets} from '../pwa/src/sync';
export {ApiClient} from '../pwa/src/api';
export {preparePaperMutation,paperMutationSourceDigest,paperIdentityMutationDigest,acknowledgeMutation,queueMutation,deleteMutation,saveDraftAndQueue} from '../pwa/src/storage';

// Cleanup joins the actual mounted writer/opening before detaching its source.
export {settleNotebookAccount,resumeAllNotebookAccounts} from '../src/lib/notebookSession';
