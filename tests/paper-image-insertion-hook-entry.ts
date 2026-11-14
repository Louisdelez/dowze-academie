import {createElement,useLayoutEffect} from 'react';
import {usePaperDocument} from '../src/hooks/usePaperDocument';
import type {NotebookMediaScope} from '../src/components/NotebookEditor';
export function HookRecipe(props:{noteId:string;markdown:string;media:NotebookMediaScope;visible?:boolean;report:(value:ReturnType<typeof usePaperDocument>)=>void}){
 const paper=usePaperDocument(props.noteId,props.markdown,props.media,props.visible??false);
 useLayoutEffect(()=>props.report(paper));
 return createElement('div',{'data-note':paper.document?.noteId,'data-saved':paper.saved,'data-blocked':paper.blocked},paper.notice);
}
export {createElement,act} from 'react';
export {createRoot} from 'react-dom/client';
export {flushSync} from 'react-dom';
export {putDraft,getDraft,putSnapshot,getSnapshot,listSnapshots,listLocalBlobs,localBlobDigest,readNotebookDeletionStatus,notebookDeletionKey} from '../pwa/src/storage';
export {migratePaper,notebookDocumentId,applyPaperCommand,isPaperDocument} from '../src/lib/notebookDocument';
export {amendPaperCollaboration,verifyPaperCollaboration} from '../src/lib/paperCollaboration';
export {paperMarkdown} from '../src/lib/paperArchiveMetadata';
export {hasPendingNotebookWrites,settleNotebookAccount,resumeNotebookAccount,runNotebookOperation} from '../src/lib/notebookSession';
export {ApiClient} from '../pwa/src/api';
export {noteBoardId,photoReference} from '../src/lib/notebook';
