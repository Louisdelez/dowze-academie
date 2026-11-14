import {createElement,useLayoutEffect} from 'react';
import {PaperPersonalTemplates} from '../src/components/PaperPersonalTemplates';
import {usePaperDocument} from '../src/hooks/usePaperDocument';
import {preparePaperPersonalTemplateUse} from '../src/lib/paperPersonalTemplates';
import type {NotebookMediaScope} from '../src/components/NotebookEditor';
export function PersonalTemplatesRecipe(props:{noteId:string;markdown:string;media:NotebookMediaScope;report:(value:ReturnType<typeof usePaperDocument>)=>void;onNotice:(message:string)=>void;onExport:(blob:Blob,name:string)=>Promise<boolean>;onPrepared?:()=>void}){
 const paper=usePaperDocument(props.noteId,props.markdown,props.media,false);
 useLayoutEffect(()=>{props.report(paper);});
 return createElement('main',null,paper.document?createElement(PaperPersonalTemplates,{document:paper.document,pageId:paper.document.pages[0].id,media:props.media,disabled:paper.blocked,onNotice:props.onNotice,onExport:props.onExport,onUse:async template=>{await paper.applyPrepared(async(document,current)=>{const prepared=await preparePaperPersonalTemplateUse({template,document,media:props.media,current,afterId:document.pages[0].id});props.onPrepared?.();return prepared;});return true;}}):'Ouverture de la note…');
}
export {createElement,act} from 'react';
export {createRoot} from 'react-dom/client';
export {flushSync} from 'react-dom';
export * from '../src/lib/paperPersonalTemplates';
export {putDraft,getDraft,getSnapshot,putSnapshot,listSnapshots,listLocalBlobs,putLocalBlob,localBlobDigest} from '../pwa/src/storage';
export {migratePaper,notebookDocumentId,applyPaperCommand,isPaperDocument} from '../src/lib/notebookDocument';
export {amendPaperCollaboration,verifyPaperCollaboration} from '../src/lib/paperCollaboration';
export {photoReference} from '../src/lib/notebook';
export {paperMarkdown} from '../src/lib/paperArchiveMetadata';
export {buildPaperArchive} from '../src/lib/paperArchiveExport';
export {verifyPaperArchiveBlob} from '../src/lib/paperArchive';
export {hasPendingNotebookWrites,settleNotebookAccount,resumeNotebookAccount,resumeAllNotebookAccounts} from '../src/lib/notebookSession';
