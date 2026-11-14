import React,{useRef,useState} from 'react';
import {useNotebookSplitWorkspace} from '../src/hooks/useNotebookSplitWorkspace';
import {NotebookSplitControls,NotebookSplitSeparator} from '../src/components/NotebookSplitControls';
import {PersistentWorkspacePanel} from '../src/components/PersistentWorkspacePanel';
import {WorkspaceTabs} from '../src/components/WorkspaceTabs';
import {NotesWorkspace} from '../src/components/NotesWorkspace';
import {NotebookEditor,type NotebookMediaScope,type NotebookMirrorExpectation} from '../src/components/NotebookEditor';
import {closeSubjectNote} from '../src/lib/subjectNotes';
import type {SubjectNoteDocument,SubjectNotesStore} from '../src/types';
type Props={media:NotebookMediaScope;notes:SubjectNoteDocument[];mode:'desktop'|'pwa';report:(value:any)=>void;write:(id:string,patch:any,expected?:NotebookMirrorExpectation)=>Promise<boolean>};
/** Actual editors and persistent panels. The two pane compositions mirror the
 * current App branches; this recipe supplies only isolated navigation/data. */
export function SplitWorkspaceRecipe({media,notes,mode,report,write}:Props){
 const owner=JSON.stringify([media.accountId,media.spaceId]),mounted=useRef(true);
 const [view,setView]=useState({owner,primaryId:notes[0].id,openIds:notes.map(n=>n.id)}),state=view.owner===owner?view:{owner,primaryId:notes[0].id,openIds:notes.map(n=>n.id)},primary=notes.find(n=>n.id===state.primaryId),controller=useNotebookSplitWorkspace(media,primary?.id,notes.map(n=>n.id),mode==='desktop'?state.openIds:undefined);
 const set=(patch:any)=>setView(old=>({...((old.owner===owner)?old:state),...patch,owner}));
 const activate=(id:string)=>{if(controller.beforeActivate(id))set({primaryId:id,openIds:[...new Set([...state.openIds,id])]});};
 const choose=(id:string|null)=>{if(controller.choose(id)&&id)set({openIds:[...new Set([...state.openIds,id])]});};
 const close=(id:string)=>{if(id===controller.secondaryId)controller.close();const result=closeSubjectNote({schemaVersion:2,documents:notes,activeDocumentId:state.primaryId,openDocumentIds:state.openIds},id);set({primaryId:result.activeDocumentId,openIds:result.openDocumentIds});};
 report({controller,activate,choose,close,openIds:state.openIds,primaryId:state.primaryId,mounted});
 const secondary=notes.find(n=>n.id===controller.secondaryId),pane=(note:SubjectNoteDocument,index:number)=><NotesWorkspace documents={notes} activeNote={note} subjects={[]} storageKey={`split:${owner}`} media={media} onCreate={()=>{}} onOpen={activate} onBack={()=>{}} onOpenLegacy={()=>{}} onUpdateNote={write} onOpenSubjects={()=>{}} onDeleteNote={()=>{}}/>;
 return <><WorkspaceTabs section="notes" documents={notes} openDocumentIds={state.openIds} activeDocumentId={state.primaryId} secondaryDocumentId={controller.secondaryId} onActivatePage={()=>set({primaryId:null})} onActivateNote={activate} onCloseNote={close} onCreateNote={()=>{}}/><NotebookSplitControls notes={notes} controller={controller} onChoose={choose} onSwap={()=>{if(controller.secondaryId)activate(controller.secondaryId);}}/><div className={`workspace-active-panel ${controller.split?'workspace-split':''}`} ref={controller.containerRef} data-split-orientation={controller.axis} style={{'--notebook-split-ratio':`${controller.ratio}%`} as React.CSSProperties}>
 {controller.split&&<NotebookSplitSeparator controller={controller}/>}
 {state.openIds.map(id=>{const note=notes.find(n=>n.id===id);if(!note)return null;return <PersistentWorkspacePanel key={`${owner}:${note.id}`} id={`workspace-panel-${note.id}`} labelledBy={`workspace-tab-${note.id}`} active={state.primaryId===id||controller.secondaryId===id} splitSlot={state.primaryId===id?'primary':controller.secondaryId===id?'secondary':undefined}>{mode==='desktop'?pane(note,0):<NotebookEditor noteId={note.id} markdown={note.markdown} metadata={note} media={media} onChange={(markdown,expected)=>write(note.id,{markdown},expected)}/>}</PersistentWorkspacePanel>;})}
 </div></>;
}
export {createElement,act} from 'react';
export {createRoot} from 'react-dom/client';
export {flushSync} from 'react-dom';
export {putDraft,getDraft,putSnapshot,getSnapshot,putEditedDraft,listDrafts,DraftChangedError} from '../pwa/src/storage';
export {migratePaper,notebookDocumentId} from '../src/lib/notebookDocument';
export {amendPaperCollaboration,verifyPaperCollaboration} from '../src/lib/paperCollaboration';
export {normalizeSubjectNotesStore,updateSubjectNote} from '../src/lib/subjectNotes';
export {PwaNotePane} from '../pwa/src/PwaNotePane';
export {hasPendingNotebookWrites,resumeAllNotebookAccounts,settleNotebookAccount,disposeNotebookAccount,runNotebookOperation} from '../src/lib/notebookSession';
