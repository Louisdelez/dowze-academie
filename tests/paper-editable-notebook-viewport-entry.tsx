export {flushNotebookWorkspaceForClose} from '../src/lib/notebookClose';
import {createElement,useLayoutEffect,useRef,useState,type ComponentProps} from 'react';
import {PaperEditableNotebookViewport,type PaperEditableNotebookViewportHandle} from '../src/components/PaperEditableNotebookViewport';
import {PaperNotebook} from '../src/components/PaperNotebook';
import type {NotebookMediaScope} from '../src/components/NotebookEditor';
import {usePaperDocument} from '../src/hooks/usePaperDocument';
import {WorkspaceTabVisibility} from '../src/lib/workspaceTabVisibility';
import type {PaperInkIntent} from '../src/lib/paperInkInput';
import type {PaperPageViewportMode} from '../src/lib/paperPageViewport';

export {act,createElement,createRef,StrictMode} from 'react';
export {createRoot} from 'react-dom/client';
export {flushSync} from 'react-dom';
export {Crepe} from '@milkdown/crepe';
export {installRealPaperEditorProbe,type RealPaperEditorProbe,type RealPaperEditorRecord} from './paper-real-editor-probe';
export {editorViewCtx,rootCtx,parserCtx,serializerCtx} from '@milkdown/kit/core';
export {TextSelection} from '@milkdown/kit/prose/state';
export {putDraft,getDraft,putLocalBlob,putSnapshot,getSnapshot,listSnapshots,listSnapshotsByPrefix,listMutations,listLocalBlobs} from '../pwa/src/storage';
export {zipSync,strToU8} from 'fflate';
export {appendPaperArchive} from '../src/lib/paperArchive';
export {listPaperLegacyAppendArchiveRecoveries} from '../src/lib/paperAppendArchiveStaging';
export {PaperPersonalTemplates} from '../src/components/PaperPersonalTemplates';
export {loadPaperPersonalTemplates,exportPaperPersonalTemplate,inspectPaperPersonalTemplateImport} from '../src/lib/paperPersonalTemplates';
export {savePaperExport} from '../src/lib/paperExport';
export {createPaperInkPrefixJournal,appendPaperInkPrefixJournal,capturePaperInkPrefixObject,preparePaperInkPrefixCanonical,discardPaperInkPrefixJournal,readPaperInkPrefixJournal,listPaperInkPrefixJournals,paperInkPrefixJournalKey,paperInkPrefixJournalChunkKey} from '../src/lib/paperInkPrefixJournal';
export {preparePaperInterruptedInk,preservePaperInterruptedInk,paperInkRecoveryReceiptKey} from '../src/lib/paperInterruptedInk';
export {preparePaperInkRecoveryCopy} from '../src/lib/paperInkPrefixRecovery';
export {migratePaper,notebookDocumentId,isPaperDocument,applyPaperCommand} from '../src/lib/notebookDocument';
export {amendPaperCollaboration} from '../src/lib/paperCollaboration';
export {reflowPaperText,textFlowFingerprint} from '../src/lib/paperTextFlow';
export {paperMarkdown} from '../src/lib/paperArchiveMetadata';
export {loadPaperToolPreferences,commitPaperToolPreferences,applyPaperToolPreferenceCommand} from '../src/lib/paperToolPreferences';
export {settleNotebookAccount,settleAllNotebookAccounts,resumeNotebookAccount,resumeAllNotebookAccounts,hasPendingNotebookWrites} from '../src/lib/notebookSession';
export {PaperEditableNotebookViewport,usePaperDocument};
export {appStorage} from '../src/lib/appStorage';

export interface EditableViewportRecipeReport {
 paper:ReturnType<typeof usePaperDocument>;handle:PaperEditableNotebookViewportHandle|null;
 selectedPageId:string;selected:readonly string[];zoom:number;ownerKey:string;generation:number;mode:PaperPageViewportMode;
}
export interface EditableViewportRecipeProps {
 noteId:string;markdown:string;media:NotebookMediaScope;generation:number;
 mode:PaperPageViewportMode;zoom:number;intent:PaperInkIntent|null;writable:boolean;
 selectedPageId?:string;selected?:string[];current?:()=>boolean;
 report:(value:EditableViewportRecipeReport)=>void;
}

/** The actual hook and editable viewport own commands, storage, text writers and
 * page inputs. This fixture supplies only controlled toolbar/view state. */
export function EditableViewportRecipe(props:EditableViewportRecipeProps){
 const paper=usePaperDocument(props.noteId,props.markdown,props.media,false),handle=useRef<PaperEditableNotebookViewportHandle>(null),latest=useRef(props);latest.current=props;
 const ownerKey=JSON.stringify([props.media.accountId,props.media.spaceId,props.noteId]);
 const [toolbarPage,setToolbarPage]=useState<string|null>(props.selectedPageId??null),[selected,setSelected]=useState<string[]>([...(props.selected??[])]),[zoom,setZoom]=useState(props.zoom);
 const external=useRef({ownerKey,generation:props.generation,api:props.media.api,page:props.selectedPageId,selection:JSON.stringify(props.selected??[]),zoom:props.zoom});
 const selection=JSON.stringify(props.selected??[]);
 useLayoutEffect(()=>{
  const before=external.current,changedOwner=before.ownerKey!==ownerKey||before.generation!==props.generation||before.api!==props.media.api;
  if(changedOwner||before.page!==props.selectedPageId)setToolbarPage(props.selectedPageId??null);
  if(changedOwner||before.selection!==selection)setSelected([...(props.selected??[])]);
  if(changedOwner||before.zoom!==props.zoom)setZoom(props.zoom);
  external.current={ownerKey,generation:props.generation,api:props.media.api,page:props.selectedPageId,selection,zoom:props.zoom};
 },[ownerKey,props.generation,props.media.api,props.selectedPageId,selection,props.zoom]);
 const doc=paper.document,selectedPageId=toolbarPage??doc?.pages[0]?.id??'';
 const source={ownerKey,generation:props.generation,api:props.media.api};
 const current=()=>{const value=latest.current;return JSON.stringify([value.media.accountId,value.media.spaceId,value.noteId])===source.ownerKey&&value.generation===source.generation&&value.media.api===source.api&&(value.current?.()??true);};
 useLayoutEffect(()=>props.report({paper,handle:handle.current,selectedPageId,selected,zoom,ownerKey,generation:props.generation,mode:props.mode}));
 return <>
  <output data-recipe-toolbar-page={selectedPageId} data-recipe-selected={JSON.stringify(selected)} data-recipe-ready={String(!!doc&&!paper.blocked)} data-recipe-zoom={String(zoom)}/>
  {doc&&!paper.blocked&&<PaperEditableNotebookViewport ref={handle} document={doc} paper={paper} media={props.media} ownerKey={ownerKey} generation={props.generation} current={current} writable={props.writable} mode={props.mode} zoom={zoom} selectedPageId={selectedPageId} selected={selected} intent={props.intent} style={{color:'#2855ce',width:2,opacity:.4,strokeStyle:'solid'}} wholeEraser={false} fingerInk={false} onSelect={(pageId,ids)=>{setToolbarPage(pageId);setSelected(ids);}} onZoom={setZoom} onNotice={paper.setNotice} onAuthored={()=>{}}/>}
 </>;
}

/** The real Notebook caller, including toolbar, text-only mode and auto-fit. */
export function NotebookRecipe(props:ComponentProps<typeof PaperNotebook>){
 return createElement(WorkspaceTabVisibility.Provider,{value:true},createElement(PaperNotebook,props));
}
