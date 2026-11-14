import {PaperEditableNotebookViewport,type PaperEditableNotebookViewportHandle} from './PaperEditableNotebookViewport';
import {PaperMobileReadView} from './PaperMobileReadView';
import {PaperInterruptedInkPanel} from './PaperInterruptedInkPanel';
import {PaperImportRecoveryPanel,type PaperImportRecoveryItem,type PaperImportRecoveryKind} from './PaperImportRecoveryPanel';
import {planPaperInterruptedInkRestore,markPaperInterruptedInkRestored,readPaperInterruptedInk,type PaperInterruptedInkReceipt} from '../lib/paperInterruptedInk';
import {preparePaperInkRecoveryCopy} from '../lib/paperInkPrefixRecovery';
import {ownPaperPrintShell} from '../lib/paperPrintShell';
import {PaperWorkTimer} from './PaperWorkTimer';
import {PaperPrintPreview} from './PaperPrintPreview';
import type {PreparedPaperPrint} from '../lib/paperPrint';
import type {PaperAudioControlsHandle} from './PaperAudioControls';
import {PaperMeasurementLabels} from './PaperMeasurementLabels';
import {PaperMeasurementControls} from './PaperMeasurementControls';
import {PaperPresentation} from './PaperPresentation';
import {PaperCommandMenu,type PaperCommandMenuHandle} from './PaperCommandMenu';
import {capturePaperNotebookCommandTarget,paperNotebookCommandTargetCurrent,executePaperNotebookCommand,type PaperNotebookCommandId,type PaperNotebookCommandContext,type PaperNotebookCommandTarget} from '../lib/paperNotebookCommands';
import {preparePastePaperSelection} from '../lib/paperClipboard';
import {usePaperSmartHighlight} from '../hooks/usePaperSmartHighlight';
import {PaperTextHighlightPanel,paperHighlightChoice} from './PaperTextHighlightPanel';
import {hasPendingNotebookWrites,registerNotebookWriter} from '../lib/notebookSession';
import {createPaperMarkdownMirrorBarrier} from '../lib/paperMarkdownMirrorBarrier';
import {PaperTextFlowView} from './PaperTextFlowView';
import {paperObjectsOnPage,reflowPaperText,textFlowFingerprint} from '../lib/paperTextFlow';
import {rotatePaperPage} from '../lib/paperPageRotation';
import {PaperPdfOutline} from './PaperPdfOutline';
import {PaperPagePreview} from './PaperPagePreview';
import {PaperBackground} from './PaperBackground';
import {PaperPageSettings} from './PaperPageSettings';
import {inheritedBlankPage} from '../lib/paperTemplates';
import {cloneElement,Fragment,isValidElement,lazy,Suspense,useEffect,useLayoutEffect,useMemo,useRef,useState,type CSSProperties,type ReactElement,type ReactNode} from 'react';
import {usePaperToolPreferences} from '../hooks/usePaperToolPreferences';
import {activePaperToolSlot,PAPER_FALLBACK_TEXT_SLOT,type PaperToolSlot} from '../lib/paperToolPreferences';
import {PaperToolSettings,PaperToolIcon,paperToolSlotLabel} from './PaperToolSettings';
import {createPaperInkInput,type PaperInkContext,type PaperInkStroke} from '../lib/paperInkInput';
import {createPaperViewportGesture,type PaperViewportAction} from '../lib/paperViewportGesture';
import {PaperInkPreview,type PaperInkPreviewHandle,type PaperInkPreviewStyle} from './PaperInkPreview';
import {PaperWritingLoupe,PaperWritingLoupeTarget,type PaperWritingLoupeHandle} from './PaperWritingLoupe';
import {samePaperWritingLoupeOwner,type PaperWritingLoupeOwner,type PaperWritingLoupeRegion} from '../lib/paperWritingLoupe';
import {PaperDrawingGuide,PaperDrawingGuideControls} from './PaperDrawingGuide';
import {createPaperStrokeCorrection,effectivePaperDrawingGuide,type PaperShapeCandidate,type PaperStrokeCorrectionResult} from '../lib/paperDrawingGuide';
import {usePaperWritingAids} from '../hooks/usePaperWritingAids';
import {Volume2,Type,Pencil,Highlighter,Eraser,MousePointer2,Undo2,Redo2,ImagePlus,Plus,Layers,Bookmark,Trash2,Copy,ChevronLeft,ChevronRight,Download,StickyNote,Square,Lock,Unlock,ZoomIn,ZoomOut,Move,RotateCw,Upload,History,BookOpenCheck,ClipboardPaste,MoreHorizontal,Settings2,Search,Presentation,Ruler,Printer} from 'lucide-react';
import {PaperObjectVisual,PaperRichText,PaperAssetImage} from './PaperObjectVisual';
import {compactInk,expandPaperGroups} from '../lib/paperTransforms';
import {PaperSearchPanel} from './PaperSearchPanel';
import {PaperReadAloud} from './PaperReadAloud';
import {PaperToolboxPopover} from './PaperToolboxPopover';
import {PaperMovableToolbox} from './PaperMovableToolbox';
import {usePaperNotebookControls} from '../hooks/usePaperNotebookControls';
import {PaperNotebookViewControls} from './PaperNotebookViewControls';
import {paperNotebookShortcut,paperNotebookShortcutEnvironment} from '../lib/paperNotebookKeyboard';
import {resolvePaperSearchHit,searchPaperDocument,type PaperSearchHit} from '../lib/paperSearch';
import type {PaperSearchNavigation,PaperSearchNavigationRequest} from '../lib/notebookSearchNavigation';
import {PaperImageRepair} from './PaperImageRepair';
import type {PaperImageRepairPlan,PaperImageRepairVersion,PreparedPaperImageRepair} from '../lib/paperImageRepair';
import type {PersonalPaperTemplate} from '../lib/paperPersonalTemplates';
import type {PersonalPaperSticker} from '../lib/paperStickers';
import type {LegacyImageDownloadNeed} from '../lib/paperLegacyImageAssets';
import {PaperSelectionTools} from './PaperSelectionTools';
import {paperObjectCssTransform,paperObjectSvgTransform} from '../lib/paperInkStyles';
import {createPaperEraserReturn} from '../lib/paperEraserReturn';
import {inkOutline as outline,createPaperLassoSelection} from '../lib/paperGeometry';
import type {SubjectNoteDocument} from '../types';
import {runNotebookOperation} from '../lib/notebookSession';
import {savePaperExport} from '../lib/paperExport';
import {getDraft} from '../../pwa/src/storage';
import {capturePaperHistorySelection,readPaperHistorySelections,type PaperHistorySelection,type PaperHistoryCopyCallback} from '../lib/paperHistoryVersions';
import {usePaperDocument} from '../hooks/usePaperDocument';
import {blankPage,isPaperDocument,notebookDocumentId,type PaperDocument,type InkPoint,type PaperObject,type PaperPage,type PaperCommand,type PaperStrokeStyle} from '../lib/notebookDocument';
import {useWorkspaceTabVisible} from '../lib/workspaceTabVisibility';
import type {NotebookMarkdownWriter,NotebookMediaScope} from './NotebookEditor';
import './paper-notebook.css';
const PaperPersonalTemplates=lazy(()=>import('./PaperPersonalTemplates').then(module=>({default:module.PaperPersonalTemplates})));
const PaperStickers=lazy(()=>import('./PaperStickers').then(module=>({default:module.PaperStickers})));
const PaperStudyPanel=lazy(()=>import('./PaperStudyPanel').then(module=>({default:module.PaperStudyPanel})));
const PaperAudioControls=lazy(()=>import('./PaperAudioControls').then(module=>({default:module.PaperAudioControls})));
const PaperPdfPage=lazy(()=>import('./PaperPdfPage').then(module=>({default:module.PaperPdfPage})));
const MarkdownNoteEditor=lazy(()=>import('./MarkdownNoteEditor'));
const uid=()=>crypto.randomUUID();
type Tool='text'|'pen'|'pencil'|'calligraphy'|'highlighter'|'eraser'|'select'|'lasso'|'laser';
const colors=['#20343b','#2855ce','#dd4050','#16a08a','#f6c447','#965ac8'];
function saveDownload(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
interface Props {onRestoreVersion?:PaperHistoryCopyCallback;metadata?:Partial<SubjectNoteDocument>;noteId:string;markdown:string;onChange:NotebookMarkdownWriter;media:NotebookMediaScope;readOnly?:boolean;closingUI?:boolean;searchNavigation?:PaperSearchNavigation}
function retainEditableViewport(value:ReactNode):ReactNode {
 // Preserve the exact keyed/positional path to the viewport. Other children
 // must unmount normally: retaining audio or another old-scope control would
 // also retain its effects, independently of this accepted text composition.
 if(Array.isArray(value)){const children=value.map(retainEditableViewport);return children.some(child=>child!==null)?children:null;}
 if(!isValidElement<{children?:ReactNode}>(value))return null;
 if(value.type===PaperEditableNotebookViewport)return value;
 if(typeof value.type!=='string'&&value.type!==Fragment)return null;
 const children=retainEditableViewport(value.props.children);
 return children===null?null:cloneElement(value,undefined,children);
}
export function PaperNotebook({noteId,markdown,onChange,media,metadata,readOnly:sourceReadOnly=false,closingUI=false,searchNavigation,onRestoreVersion}:Props){
 const readOnly=sourceReadOnly||closingUI;
 const visible=useWorkspaceTabVisible(),paper=usePaperDocument(noteId,markdown,media,visible);
 const markdownRef=useRef(markdown);markdownRef.current=markdown;const doc=paper.document;const mediaApi=useRef(media.api);mediaApi.current=media.api;const metadataRef=useRef(metadata);metadataRef.current=metadata;const onChangeRef=useRef(onChange);onChangeRef.current=onChange;const renderedOwner=JSON.stringify([media.accountId,media.spaceId,noteId]);const exportScope=useRef('');exportScope.current=renderedOwner;const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);const [pageId,setPageId]=useState(''),[tool,setTool]=useState<Tool>('text'),[color,setColor]=useState(colors[0]),[width,setWidth]=useState(3),[zoom,setZoom]=useState(1),[manager,setManager]=useState(false),[wholeEraser,setWholeEraser]=useState(false),[strokeStyle,setStrokeStyle]=useState<PaperStrokeStyle>('solid'),[selected,setSelected]=useState<string[]>([]),[textOnly,setTextOnly]=useState(false);

 const toolPreferences=usePaperToolPreferences(media,noteId),activeSlot=activePaperToolSlot(toolPreferences.effective),fingerInk=toolPreferences.effective.fingerInk;
 const [opacity,setOpacity]=useState(1);const visibleTools=toolPreferences.effective.toolbar.filter(slot=>slot.visible);
 const toolbarSlots=visibleTools.some(slot=>slot.tool==='text')?visibleTools:[PAPER_FALLBACK_TEXT_SLOT as PaperToolSlot,...visibleTools];
 useEffect(()=>{setLoupeOpen(false);setLoupeRegion(null);setAidsOpen(false);},[renderedOwner]);
 useEffect(()=>{setTool(activeSlot.tool);setColor(activeSlot.preset.color);setWidth(activeSlot.preset.width);setOpacity(activeSlot.preset.opacity);setWholeEraser(activeSlot.preset.wholeEraser);setStrokeStyle(activeSlot.preset.strokeStyle??'solid');},[activeSlot.id,activeSlot.tool,JSON.stringify(activeSlot.preset)]);
 const selectToolSlot=(slot:PaperToolSlot)=>{if(!mounted.current||exportScope.current!==renderedOwner)return;setSmartHighlight(false);setTool(slot.tool);setColor(slot.preset.color);setWidth(slot.preset.width);setOpacity(slot.preset.opacity);setWholeEraser(slot.preset.wholeEraser);setStrokeStyle(slot.preset.strokeStyle??'solid');eraserReturn.current.select(slot);void toolPreferences.change({type:'select',id:slot.id});};
 const activateTool=(next:Tool)=>{if(!mounted.current||exportScope.current!==renderedOwner)return;const slot=toolbarSlots.find(slot=>slot.tool===next);if(slot)selectToolSlot(slot);else setTool(next);};
 const changeStyle=(patch:Partial<PaperToolSlot['preset']>)=>{if(!mounted.current||exportScope.current!==renderedOwner)return;if(patch.color!==undefined)setColor(patch.color);if(patch.width!==undefined)setWidth(patch.width);if(patch.opacity!==undefined)setOpacity(patch.opacity);if(patch.wholeEraser!==undefined)setWholeEraser(patch.wholeEraser);if(patch.strokeStyle!==undefined)setStrokeStyle(patch.strokeStyle);if(activeSlot.id!==PAPER_FALLBACK_TEXT_SLOT.id)void toolPreferences.change({type:'patch-preset',id:activeSlot.id,patch});};
 const eraserReturn=useRef(createPaperEraserReturn());
 const aids=usePaperWritingAids(media,noteId,readOnly||paper.blocked||paper.reconciling);
 const [aidsOpen,setAidsOpen]=useState(false),[measurementsOpen,setMeasurementsOpen]=useState(false),[loupeOpen,setLoupeOpen]=useState(false),[loupeRegion,setLoupeRegion]=useState<{owner:PaperWritingLoupeOwner;region:PaperWritingLoupeRegion}|null>(null);
 useEffect(()=>setMeasurementsOpen(false),[renderedOwner]);
 const loupe=useRef<PaperWritingLoupeHandle>(null),correction=useRef(createPaperStrokeCorrection()),correctionFrame=useRef(0),correctionSource=useRef<'page'|'loupe'|null>(null);
 const [shapeProposal,setShapeProposal]=useState<{candidate:PaperShapeCandidate;original:PaperObject;expected:PaperObject;revision:number;owner:PaperWritingLoupeOwner}|null>(null),[originalRestore,setOriginalRestore]=useState<{original:PaperObject;expected:PaperObject;revision:number;owner:PaperWritingLoupeOwner}|null>(null);
 const shapeProposalRef=useRef(shapeProposal),originalRestoreRef=useRef(originalRestore);shapeProposalRef.current=shapeProposal;originalRestoreRef.current=originalRestore;
 const scopeEpoch=useRef({key:'',epoch:0,api:media.api});
 const editableView=useRef({owner:renderedOwner,epoch:0,pageId:'',width:0,height:0,rotation:0,disabled:true,tool,document:paper});
 useEffect(()=>{eraserReturn.current.clear();},[toolPreferences.scopeKey]);
 useEffect(()=>{eraserReturn.current.seed(toolPreferences.effective.previousInkSlotId??null);eraserReturn.current.select(activeSlot);},[toolPreferences.scopeKey,activeSlot.id,activeSlot.tool,toolPreferences.effective.previousInkSlotId]);
 const readingOrder=doc?JSON.stringify([doc.pages.map(page=>page.id),doc.objects.filter(object=>object.kind==='text').map(({id,pageId,markdown,x,y,z,textFlow})=>({id,pageId,markdown,x,y,z,textFlow}))]):'';

 const [pdfOutline,setPdfOutline]=useState(false),[audioSeek,setAudioSeek]=useState<{key:string;sessionId:string;time:number}|null>(null);
 const seekAudio=(anchor:{sessionId:string;time:number})=>setAudioSeek({...anchor,key:uid()});
 const [pageBusy,setPageBusy]=useState(false);useEffect(()=>setPageBusy(false),[noteId,media.accountId,media.spaceId]);
 const [pageFilter,setPageFilter]=useState<'all'|'bookmarks'|'pdf'|'content'>('all'),[pageNumber,setPageNumber]=useState('1');const pageList=useRef<HTMLElement>(null);
 const contentPages=useMemo(()=>new Set(doc?.objects.flatMap(o=>o.kind==='text'||o.kind==='sticky'?(o.markdown?.trim()?[o.pageId,...(o.textFlow?.pageIds??[])]:[]):[o.pageId])??[]),[doc?.objects]);
 const filteredPages=doc?.pages.filter(p=>pageFilter==='bookmarks'?p.bookmark:pageFilter==='pdf'?!!p.pdf:pageFilter==='content'?contentPages.has(p.id):true)??[];
 const [studyOpen,setStudyOpen]=useState(false),[searchOpen,setSearchOpen]=useState(false);
 const [searchSeed,setSearchSeed]=useState<{query:string;requestId:string}>({query:'',requestId:''});
 const [searchTarget,setSearchTarget]=useState<PaperSearchNavigationRequest|null>(null),searchTargetRef=useRef<PaperSearchNavigationRequest|null>(null),searchWork=useRef<{request:PaperSearchNavigationRequest;ownerCurrent:()=>boolean}|null>(null),consumedSearch=useRef('');
 const [inkRecoveryOpen,setInkRecoveryOpen]=useState(false),[importRecoveryOpen,setImportRecoveryOpen]=useState(false);useEffect(()=>{setInkRecoveryOpen(false);setImportRecoveryOpen(false);},[renderedOwner]);

 const [exportBusy,setExportBusy]=useState(false),[exportPreviewState,setExportPreview]=useState<{scope:string;generation:number;api:NotebookMediaScope['api'];url:string;format:'pdf'|'png'|'jpeg'|'archive';blob:Blob}|null>(null);
 const [historyState,setHistoryState]=useState<{scope:string;versions:PaperHistorySelection[];open:boolean}>({scope:'',versions:[],open:false});const historyRequest=useRef(0),historyOpen=historyState.scope===exportScope.current&&historyState.open,versions=historyOpen?historyState.versions:[];const closeHistory=()=>{historyRequest.current++;setHistoryState(old=>({...old,open:false}));};const archiveInput=useRef<HTMLInputElement>(null);const manualZoom=useRef(false);const pdfInput=useRef<HTMLInputElement>(null);const viewport=useRef<HTMLDivElement>(null),svg=useRef<SVGSVGElement>(null),input=useRef<HTMLInputElement>(null),frame=useRef(0),drag=useRef<{point:InkPoint;objects:PaperObject[]}|null>(null),[dragDelta,setDragDelta]=useState({x:0,y:0});
 const historyCopy=useRef<{authority:object;request:number}|null>(null),[historyCopyActivity,setHistoryCopyActivity]=useState<object|null>(null);
 const erasePlan=useRef<{id:number;owner:string;epoch:number}|null>(null),eraseCounter=useRef(0),[eraseActivity,setEraseActivity]=useState<{owner:string;id:number}|null>(null);
 const ink=useRef(createPaperInkInput()),inkPreview=useRef<PaperInkPreviewHandle>(null),touchGesture=useRef(createPaperViewportGesture());
 const capture=useRef<{stroke:PaperInkStroke;style:PaperInkPreviewStyle;wholeEraser:boolean;objects:PaperObject[]}|null>(null),laserTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const [pinchLayoutVersion,setPinchLayoutVersion]=useState(0);const pinch=useRef<{x:number;y:number;pageId:string;owner:string}|null>(null),pendingPinch=useRef<{x:number;y:number;clientX:number;clientY:number;pageId:string;owner:string}|null>(null);
 const [smartHighlight,setSmartHighlight]=useState(false),commandMenu=useRef<PaperCommandMenuHandle>(null);
 const [presentation,setPresentation]=useState<{owner:string;id:number;epoch:number;pageId:string;baseline?:PaperDocument;snapshot?:PaperDocument}|null>(null);
 const [printState,setPrintState]=useState<{owner:string;id:number;epoch:number;prepared?:PreparedPaperPrint;progress?:{done:number;total:number}}|null>(null);
 const printRequest=useRef(0),printStateRef=useRef(printState),readPane=useRef<'presentation'|'print'|null>(null),audioReadGuard=useRef<PaperAudioControlsHandle|null>(null);printStateRef.current=printState;
 const presentationRequest=useRef(0),presentationAuthority=useRef({key:'',epoch:0,api:media.api}),pageNavigation=useRef(false);
 const editablePages=useRef<PaperEditableNotebookViewportHandle>(null),[pageViewMode,setPageViewMode]=useState<'single'|'continuous'>('single');
 const mirrorSource=useRef<{owner:string;api:NotebookMediaScope['api'];lineage:string|undefined;revoked:boolean;apiCurrent:(()=>boolean)|null;apiAdmitted:boolean}>({owner:renderedOwner,api:media.api,lineage:doc?.collaboration?.lineage,revoked:false,apiCurrent:null,apiAdmitted:false});
 // Read an admitted lease only; a failed initial capture must not create a
 // render loop. A later real API epoch may create one fresh opaque source.
 let mirrorLeaseLost=false;try{mirrorLeaseLost=mirrorSource.current.apiAdmitted&&!!mirrorSource.current.apiCurrent&&!mirrorSource.current.apiCurrent();}catch{mirrorLeaseLost=mirrorSource.current.apiAdmitted;}
 if(mirrorSource.current.owner!==renderedOwner||mirrorSource.current.api!==media.api||mirrorSource.current.lineage!==doc?.collaboration?.lineage||mirrorLeaseLost){mirrorSource.current.revoked=true;mirrorSource.current={owner:renderedOwner,api:media.api,lineage:doc?.collaboration?.lineage,revoked:false,apiCurrent:null,apiAdmitted:false};}
 const capturedMirrorSource=mirrorSource.current;
 const mirrorCurrent=()=>{if(!mounted.current||capturedMirrorSource.revoked||mirrorSource.current!==capturedMirrorSource)return false;try{if(capturedMirrorSource.apiCurrent){if(capturedMirrorSource.apiCurrent()===true)capturedMirrorSource.apiAdmitted=true;else capturedMirrorSource.revoked=true;}}catch{capturedMirrorSource.revoked=true;}return !capturedMirrorSource.revoked;};
 const mirrorRead=useRef({paper,markdown,readOnly:sourceReadOnly,writer:onChange});mirrorRead.current={paper,markdown,readOnly:sourceReadOnly,writer:onChange};
 const mirrorBarrier=useMemo(()=>createPaperMarkdownMirrorBarrier({
  current:mirrorCurrent,
  captureCurrent:()=>{if(!mirrorCurrent()||!media.accountId)return()=>false;if(!capturedMirrorSource.apiCurrent)try{const api=capturedMirrorSource.api;capturedMirrorSource.apiCurrent=typeof api?.captureSessionAuthority==='function'?api.captureSessionAuthority(media.accountId):()=>true;}catch{capturedMirrorSource.revoked=true;return()=>false;}return mirrorCurrent()?mirrorCurrent:()=>false;},
  read:()=>{const value=mirrorRead.current;return {markdown:value.markdown,ready:value.paper.legacyReady&&!value.paper.blocked&&!value.paper.reconciling,readOnly:value.readOnly,getCurrent:value.paper.getCurrent,whenSaved:value.paper.whenSaved,mirrorMarkdown:value.paper.mirrorMarkdown,writer:value.writer};},
  flushCanonical:async()=>{const handle=editablePages.current;return !handle||await handle.flush()===true&&await handle.settled()===true;}
 }),[capturedMirrorSource]);
 useEffect(()=>registerNotebookWriter(media.accountId,mirrorBarrier),[media.accountId,mirrorBarrier]);
 useEffect(()=>{
  if(!doc||!paper.legacyReady||paper.reconciling||!paper.saved||paper.blocked||readOnly)return;
  // Admission is synchronous and visible to the persistent account participant.
  // A later layout render does not cancel an already admitted metadata write.
  // The account participant retains refusal for its durable close barrier.
  // Background pagination may still be awaiting exact text-flow positions.
  void mirrorBarrier.request().catch(()=>{});
 },[readingOrder,noteId,media.accountId,media.spaceId,markdown,paper.legacyReady,paper.reconciling,paper.saved,paper.blocked,readOnly,mirrorBarrier]);
 const page=doc?.pages.find(p=>p.id===pageId)??doc?.pages[0];const presentationReadBlocked=paper.blocked||paper.reconciling,baseDisabled=readOnly||presentationReadBlocked;
 const presentationKey=JSON.stringify([renderedOwner,page?.id,page?.width,page?.height,page?.rotation,doc?.collaboration?.lineage,visible,readOnly,paper.blocked,paper.reconciling]);
 if(presentationAuthority.current.key!==presentationKey||presentationAuthority.current.api!==media.api)presentationAuthority.current={key:presentationKey,epoch:presentationAuthority.current.epoch+1,api:media.api};
 const presentationEpoch=presentationAuthority.current.epoch;
 const presenting=presentation?.owner===renderedOwner&&presentation.epoch===presentationEpoch;
 const printing=printState?.owner===renderedOwner&&printState.epoch===presentationEpoch;
 useLayoutEffect(()=>printing?ownPaperPrintShell(document):undefined,[printing]);
 const disabled=baseDisabled||presenting||printing;const objects=useMemo(()=>doc&&page?paperObjectsOnPage(doc,page.id):[],[doc,page?.id]);
 useEffect(()=>{if(presentation&&(presentation.owner!==renderedOwner||presentation.epoch!==presentationEpoch)){presentationRequest.current++;if(readPane.current==='presentation')readPane.current=null;setPresentation(null);}},[renderedOwner,presentationEpoch,presentation]);
 useEffect(()=>{if(printState&&(printState.owner!==renderedOwner||printState.epoch!==presentationEpoch)){printRequest.current++;printState.prepared?.revoke();if(readPane.current==='print')readPane.current=null;setPrintState(null);}},[renderedOwner,presentationEpoch,printState]);
 useEffect(()=>()=>{presentationRequest.current++;},[]);
 useEffect(()=>()=>{printRequest.current++;printStateRef.current?.prepared?.revoke();readPane.current=null;erasePlan.current=null;},[]);
 const pageViewAuthority=useRef({key:'',generation:0,api:media.api});
 const pageViewKey=JSON.stringify([renderedOwner,doc?.collaboration?.lineage,visible,disabled]);
 if(pageViewAuthority.current.key!==pageViewKey||pageViewAuthority.current.api!==media.api)pageViewAuthority.current={key:pageViewKey,generation:pageViewAuthority.current.generation+1,api:media.api};
 const pageViewGeneration=pageViewAuthority.current.generation;
 type MobileReaderEntry={authority:{key:string;generation:number;api:NotebookMediaScope['api']};returnPageId:string;selection:string[];entered:boolean;current:()=>boolean};
 const mobileReader=useRef<MobileReaderEntry|null>(null),[mobileOpening,setMobileOpening]=useState(false);
 const retireMobileReader=(entry:MobileReaderEntry)=>{if(mobileReader.current!==entry)return;mobileReader.current=null;setTextOnly(false);setMobileOpening(false);};
 useEffect(()=>{setTextOnly(false);setMobileOpening(false);return()=>{mobileReader.current=null;};},[pageViewGeneration,media.api]);
 useEffect(()=>{if(!textOnly&&mobileReader.current?.entered)mobileReader.current=null;},[textOnly]);

 const importScopeKey=JSON.stringify([renderedOwner,pageViewGeneration]),importControllers=useRef(new Map<string,AbortController>()),[importActivity,setImportActivity]=useState<string|null>(null),importBusy=importActivity===importScopeKey;
 const fileAdmissions=useRef(new Map<'pdf'|'archive',{authority:typeof pageViewAuthority.current;api:NotebookMediaScope['api'];scopeKey:string}>());
 useLayoutEffect(()=>()=>{importControllers.current.get(importScopeKey)?.abort();for(const [kind,ticket] of fileAdmissions.current)if(ticket.scopeKey===importScopeKey)fileAdmissions.current.delete(kind);},[importScopeKey]);
 const pageViewLive=()=>mounted.current&&exportScope.current===renderedOwner&&pageViewAuthority.current.generation===pageViewGeneration&&pageViewAuthority.current.api===media.api&&visible&&!!paper.getCurrent()&&paper.getCurrent()?.noteId===noteId;
 // A reader owns this exact canonical page incarnation. Late speech callbacks
 // cannot attach to another page, document revision, account or API lease.
 const readAloudSource=useMemo(()=>Object.freeze({authority:pageViewAuthority.current,document:doc,pageId:page?.id}),[pageViewAuthority.current,doc,page?.id]);
 const readAloudCurrent=()=>pageViewAuthority.current===readAloudSource.authority&&pageViewLive()&&paper.getCurrent()===readAloudSource.document&&editableView.current.pageId===readAloudSource.pageId&&!presentationReadBlocked&&!presenting&&!printing;
 const exportPreview=exportPreviewState?.scope===renderedOwner&&exportPreviewState.generation===pageViewGeneration&&exportPreviewState.api===media.api?exportPreviewState:null;
 const pendingPageNavigation=useRef<{authority:typeof pageViewAuthority.current;targetId:string}|null>(null);
 useLayoutEffect(()=>{const pending=pendingPageNavigation.current;if(!pending||textOnly)return;if(pending.authority!==pageViewAuthority.current||!pageViewLive()){pendingPageNavigation.current=null;return;}if(doc?.pages.some(value=>value.id===pending.targetId)&&editablePages.current?.navigate(pending.targetId))pendingPageNavigation.current=null;},[doc?.pages,pageViewGeneration,visible,pageViewMode,textOnly]);
 const pendingLoupePosition=useRef<{authority:typeof pageViewAuthority.current;pageId:string;x:number;y:number}|null>(null);
 useLayoutEffect(()=>{const pending=pendingLoupePosition.current;if(!pending)return;if(pending.authority!==pageViewAuthority.current||!pageViewLive()||!loupeOpen){pendingLoupePosition.current=null;return;}if(page?.id===pending.pageId&&loupe.current){loupe.current.reposition(pending.x,pending.y);pendingLoupePosition.current=null;}},[page?.id,loupeOpen,pageViewGeneration]);
 const epochKey=JSON.stringify([renderedOwner,page?.id,page?.width,page?.height,page?.rotation,doc?.collaboration?.lineage,visible,disabled,smartHighlight,textOnly]);if(scopeEpoch.current.key!==epochKey||scopeEpoch.current.api!==media.api)scopeEpoch.current={key:epochKey,epoch:scopeEpoch.current.epoch+1,api:media.api};const inkEpoch=scopeEpoch.current.epoch;
 editableView.current={owner:renderedOwner,epoch:inkEpoch,pageId:page?.id??'',width:page?.width??0,height:page?.height??0,rotation:page?.rotation??0,disabled,tool,document:paper};
 const editable=()=>{const view=editableView.current;return mounted.current&&view.owner===renderedOwner&&view.epoch===inkEpoch&&!view.disabled&&!!view.document.getCurrent()&&view.document.getCurrent()?.noteId===noteId;};
 const loupeOwner=():PaperWritingLoupeOwner|null=>{if(!editable())return null;const view=editableView.current,current=view.document.getCurrent(),target=current?.pages.find(p=>p.id===view.pageId);if(!target||target.width!==view.width||target.height!==view.height||target.rotation!==view.rotation)return null;return {ownershipKey:view.owner,generation:view.epoch,pageId:target.id,pageWidth:target.width,pageHeight:target.height,pageRotation:target.rotation};};
 const effectiveGuide=effectivePaperDrawingGuide(aids.value.guide,page?.calibration);
 const correctionOptions={guide:effectiveGuide,hold:aids.value.hold},correctionOptionsRef=useRef(correctionOptions);correctionOptionsRef.current=correctionOptions;
 useEffect(()=>{if(shapeProposal&&(shapeProposal.revision!==doc?.revision||!samePaperWritingLoupeOwner(shapeProposal.owner,loupeOwner())))setShapeProposal(null);if(originalRestore&&(originalRestore.revision!==doc?.revision||!samePaperWritingLoupeOwner(originalRestore.owner,loupeOwner())))setOriginalRestore(null);},[doc?.revision,disabled,inkEpoch]);
 useEffect(()=>{if(doc&&!doc.pages.some(p=>p.id===pageId))setPageId(doc.pages[0].id);},[doc?.pages,pageId]);
 useEffect(()=>{if(!doc||!page)return;setPageNumber(String(doc.pages.findIndex(p=>p.id===page.id)+1));if(manager){const target=Array.from(pageList.current?.querySelectorAll<HTMLElement>('[data-page-entry]')??[]).find(node=>node.dataset.pageEntry===page.id);target?.scrollIntoView({block:'nearest'});}},[page?.id,manager,pageFilter]);
 const clearPreview=()=>{cancelAnimationFrame(frame.current);frame.current=0;inkPreview.current?.paint(null,{color,width,opacity});};
 const cancelStroke=()=>{ink.current.cancel();capture.current=null;drag.current=null;setDragDelta({x:0,y:0});clearPreview();cancelAnimationFrame(correctionFrame.current);correctionFrame.current=0;correction.current.cancel();correctionSource.current=null;};
 useLayoutEffect(()=>{if(!page)return;const controller=editablePages.current?.getController(page.id);if(controller){svg.current=controller.svgRef.current;inkPreview.current=controller.previewRef.current;}},[page?.id,doc?.revision,zoom,pageViewMode]);
 const cancelLegacyInputs=()=>{cancelStroke();loupe.current?.cancel();if(erasePlan.current){erasePlan.current=null;setEraseActivity(null);}};
 const cancelInputs=()=>{cancelLegacyInputs();editablePages.current?.cancelInputs();};
 useEffect(()=>{cancelLegacyInputs();setShapeProposal(null);setOriginalRestore(null);touchGesture.current.cancel();pinch.current=null;pendingPinch.current=null;},[noteId,media.accountId,media.spaceId,page?.id,page?.width,page?.height,page?.rotation,disabled,textOnly,tool]);
 useEffect(()=>()=>{ink.current.cancel();correction.current.cancel();cancelAnimationFrame(correctionFrame.current);touchGesture.current.cancel();cancelAnimationFrame(frame.current);if(laserTimer.current)clearTimeout(laserTimer.current);},[]);
 useLayoutEffect(()=>{const anchor=pendingPinch.current;pendingPinch.current=null;if(!anchor||!viewport.current||!svg.current||anchor.owner!==exportScope.current||anchor.pageId!==page?.id)return;const rect=svg.current.getBoundingClientRect();viewport.current.scrollLeft+=rect.left+anchor.x*zoom-anchor.clientX;viewport.current.scrollTop+=rect.top+anchor.y*zoom-anchor.clientY;},[zoom,pinchLayoutVersion]);
 
 const viewportFitWidth=doc?Math.max(...doc.pages.map(value=>value.width)):0;
 useEffect(()=>{const target=viewport.current;if(!target||!viewportFitWidth||textOnly)return;const fit=()=>{if(!manualZoom.current)setZoom(Math.max(0.3,Math.min(1.5,(target.clientWidth-(parseFloat(getComputedStyle(target).paddingLeft)||0)-(parseFloat(getComputedStyle(target).paddingRight)||0)-1)/viewportFitWidth)));};const observer=new ResizeObserver(fit);observer.observe(target);fit();return()=>observer.disconnect();},[viewportFitWidth,manager,textOnly]);
 useEffect(()=>{
  if(!searchOpen||!doc||disabled)return;let stopped=false;
  void(async()=>{
   const {extractPaperPdfPageText}=await import('../lib/paperPdf');const {readPaperAsset}=await import('../lib/paperAssets');let total=doc.pages.reduce((sum,p)=>sum+(p.pdf?.text?.length??0),0);
   for(const source of doc.pages.filter(p=>p.pdf&&p.pdf.text===undefined)){
    if(stopped||total>=2_000_000)return;const asset=doc.assets.find(a=>a.id===source.pdf!.assetId);if(!asset)continue;
    const text=(await extractPaperPdfPageText(await readPaperAsset(asset,media),source.pdf!.pageNumber)).slice(0,2_000_000-total);total+=text.length;
    if(stopped)return;const latest=paper.getCurrent()?.pages.find(p=>p.id===source.id);if(latest?.pdf?.assetId===source.pdf!.assetId&&latest.pdf.pageNumber===source.pdf!.pageNumber)paper.command({type:'update-page',page:{...latest,pdf:{...latest.pdf,text}}});
   }
  })().catch(error=>{if(!stopped)paper.setNotice(`Recherche PDF : ${String(error instanceof Error?error.message:error)}`);});
  return()=>{stopped=true;};
 },[searchOpen,doc?.noteId,media.accountId,media.spaceId,disabled]);
 const flushText=()=>dispatchEvent(new CustomEvent('dowze:paper-flush',{detail:{prefix:`${noteId}-`}}));
 const presentationOwnerCurrent=(epoch:number)=>mounted.current&&exportScope.current===renderedOwner&&presentationAuthority.current.epoch===epoch&&presentationAuthority.current.api===media.api&&visible&&!presentationReadBlocked&&paper.getCurrent()?.noteId===noteId;
 const navigationCurrent=()=>presentationOwnerCurrent(presentationEpoch)&&editableView.current.epoch===inkEpoch&&!presenting&&!printing&&readPane.current===null;
 const navigatePage=(targetId:string,selection:string[]=[],keepSearch=false)=>{
  if(pageNavigation.current||!navigationCurrent()||!paper.getCurrent()?.pages.some(value=>value.id===targetId))return false;
  if(!keepSearch)clearSearchTarget();
  // Flush while the current page generation still accepts its editor. A caret
  // callback emitted by that flush cannot recursively replace this destination.
  pageNavigation.current=true;
  try{cancelInputs();if(editable())flushText();if(!navigationCurrent()||!paper.getCurrent()?.pages.some(value=>value.id===targetId))return false;setPageId(targetId);setSelected(selection);pendingPageNavigation.current={authority:pageViewAuthority.current,targetId};if(editablePages.current?.navigate(targetId))pendingPageNavigation.current=null;return true;}
  finally{pageNavigation.current=false;}
 };
 const closeMobileReading=(targetId?:string)=>{
  const entry=mobileReader.current;if(!entry||!entry.current())return;
  const target=targetId??entry.returnPageId;if(!paper.getCurrent()?.pages.some(value=>value.id===target))return;
  mobileReader.current=null;setTextOnly(false);setPageId(target);setSelected(target===entry.returnPageId?entry.selection:[]);
  pendingPageNavigation.current={authority:entry.authority,targetId:target};
 };
 const openMobileReading=async()=>{
  if(mobileReader.current||!page||!pageViewLive()||presentationReadBlocked||presenting||printing||document.hidden||!toolPreferences.current())return;
  const authority=pageViewAuthority.current,source=toolPreferences.source,epoch=inkEpoch;let apiCurrent:()=>boolean;
  try{apiCurrent=media.api?media.api.captureSessionAuthority(media.accountId):()=>true;}catch{return;}
  let retired=false;const entry:MobileReaderEntry={authority,returnPageId:page.id,selection:[...selected],entered:false,current:()=>{
   if(retired)return false;try{if(mobileReader.current!==entry||pageViewAuthority.current!==authority||!pageViewLive()||document.hidden||!apiCurrent()||!toolPreferences.current()||toolPreferences.source!==source||!entry.entered&&editableView.current.epoch!==epoch)retired=true;}catch{retired=true;}return !retired;
  }};
  mobileReader.current=entry;setMobileOpening(true);
  try{
   cancelInputs();flushText();if(!entry.current())return;
   const view=editablePages.current;if(!view||await view.flush()!==true||!entry.current()||await view.settled()!==true||!entry.current())throw Error('Terminez la saisie en cours avant la lecture mobile.');
   await paper.whenSaved();if(!entry.current()||paper.getCurrent()?.noteId!==noteId)return;
   // Change projection only after the original writer and its real durable tail
   // settled. The same viewport/PM tree stays mounted, with interaction locked.
   entry.entered=true;clearSearchTarget();setSearchOpen(false);setStudyOpen(false);setMeasurementsOpen(false);setLoupeOpen(false);setAidsOpen(false);setSmartHighlight(false);setTextOnly(true);
  }catch(error){if(entry.current())paper.setNotice(String(error instanceof Error?error.message:error));}
  finally{if(mobileReader.current===entry){setMobileOpening(false);if(!entry.entered||!entry.current())retireMobileReader(entry);}}
 };
 // Search is a view intent: it must never change the selection, caret, undo
 // history or note graph merely to paint an occurrence. The mounted host and
 // PDF layer independently revalidate this exact document and authority.
 const clearSearchTarget=()=>{searchWork.current=null;searchTargetRef.current=null;setSearchTarget(null);editablePages.current?.clearSearch();};
 const beginSearch=(hit:PaperSearchHit,externalCurrent:()=>boolean=()=>true)=>{
  const snapshot=paper.getCurrent(),authority=pageViewAuthority.current;
  if(!snapshot||snapshot!==doc||!pageViewLive()||!externalCurrent())return false;
  let apiCurrent:()=>boolean=()=>true;try{if(media.api)apiCurrent=media.api.captureSessionAuthority(media.accountId);}catch{return false;}
  let revoked=false;const ownerCurrent=()=>{if(revoked)return false;try{if(!mounted.current||pageViewAuthority.current!==authority||exportScope.current!==renderedOwner||!apiCurrent()||!externalCurrent())revoked=true;}catch{revoked=true;}return !revoked;};
  const live=()=>ownerCurrent()&&paper.getCurrent()===snapshot;
  const resolved=live()?resolvePaperSearchHit(snapshot,hit):null;
  if(!resolved){paper.setNotice('Le texte ou sa pagination a changé. Relancez la recherche.');return false;}
  clearSearchTarget();
  if(!navigatePage(resolved.pageId,resolved.objectId?[resolved.objectId]:[],true)||!live())return false;
  setTool('text');setTextOnly(false);setSmartHighlight(false);setLoupeOpen(false);setAidsOpen(false);setFocusMode(false);
  let request:PaperSearchNavigationRequest;
  request={document:snapshot,hit,current:()=>searchTargetRef.current===request&&live()};
  searchWork.current={request,ownerCurrent};searchTargetRef.current=request;setSearchTarget(request);return true;
 };
 // Only this synchronous acknowledgement from an accepted reflow may prepare
 // a fresh occurrence after the first editor mount. Other document changes
 // still retire the old request. The old binding is never rewritten/reused.
 const searchLayoutAccepted=(before:PaperDocument,after:PaperDocument,objectId:string)=>{
  const work=searchWork.current,old=work?.request;if(!work||!old||old!==searchTargetRef.current||old.document!==before||old.hit.kind!=='text'||old.hit.objectId!==objectId)return;
  if(!work.ownerCurrent()||paper.getCurrent()!==after||!resolvePaperSearchHit(before,old.hit)){clearSearchTarget();return;}
  const prior=before.objects.find(object=>object.id===objectId),next=after.objects.find(object=>object.id===objectId),withoutFlow=(object:PaperObject)=>{const {textFlow:ignored,...rest}=object;return JSON.stringify(rest);};
  if(!prior||!next||before.noteId!==after.noteId||before.legacy.migratedAt!==after.legacy.migratedAt||before.collaboration?.lineage!==after.collaboration?.lineage||after.revision!==before.revision+1||withoutFlow(prior)!==withoutFlow(next)){clearSearchTarget();return;}
  const quote=old.hit.binding?.sourceText.slice(old.hit.start,old.hit.end)??'';
  const fresh=searchPaperDocument(after,quote).find(hit=>hit.kind==='text'&&hit.objectId===objectId&&hit.start===old.hit.start&&hit.end===old.hit.end&&hit.binding?.sourceText===old.hit.binding?.sourceText),resolved=fresh&&resolvePaperSearchHit(after,fresh);
  if(!fresh||!resolved){clearSearchTarget();paper.setNotice('La pagination doit être actualisée avant de rejoindre ce passage. Relancez la recherche.');return;}
  let request:PaperSearchNavigationRequest;request={document:after,hit:fresh,current:()=>searchTargetRef.current===request&&work.ownerCurrent()&&paper.getCurrent()===after};
  searchWork.current={request,ownerCurrent:work.ownerCurrent};searchTargetRef.current=request;setSearchTarget(request);setPageId(resolved.pageId);setSelected([objectId]);pendingPageNavigation.current={authority:pageViewAuthority.current,targetId:resolved.pageId};
 };
 useEffect(()=>{
  if(!searchNavigation||consumedSearch.current===searchNavigation.requestId||!doc||!pageViewLive()||!searchNavigation.current()||searchNavigation.hit.binding?.noteId!==noteId)return;
  consumedSearch.current=searchNavigation.requestId;
  setSearchSeed({query:searchNavigation.query,requestId:searchNavigation.requestId});setSearchOpen(true);setFocusMode(false);
  beginSearch(searchNavigation.hit,searchNavigation.current);
 },[searchNavigation,doc,pageViewGeneration,visible]);
 useEffect(()=>{
  const request=searchTarget;if(!request)return;
  if(!request.current()){if(searchTargetRef.current===request){clearSearchTarget();if(pageViewLive())paper.setNotice('Le texte a changé. Relancez la recherche pour rejoindre son passage à jour.');}return;}
  if(tool!=='text'||smartHighlight||textOnly){clearSearchTarget();return;}
  if(request.hit.kind==='pdf')return;
  let cancelled=false,frame=0;const deadline=performance.now()+10000;
  const paint=()=>{
   if(cancelled)return;
   if(!request.current()){if(searchTargetRef.current===request){clearSearchTarget();if(pageViewLive())paper.setNotice('Le texte a changé. Relancez la recherche pour rejoindre son passage à jour.');}return;}
   if(editablePages.current?.highlightSearch(request))return;
   if(performance.now()<deadline)frame=requestAnimationFrame(paint);
   else{clearSearchTarget();paper.setNotice('Le passage attend la fin de la saisie ou une pagination à jour. Relancez la recherche dans la note.');}
  };
  frame=requestAnimationFrame(paint);return()=>{cancelled=true;cancelAnimationFrame(frame);};
 },[searchTarget,doc,page?.id,pageViewGeneration,tool,smartHighlight,textOnly,visible]);
 const activePdfSearch=searchTarget?.hit.kind==='pdf'&&searchTarget.current()?searchTarget:undefined;
 const audioMayEnterReadOnly=()=>{
  if(!audioReadGuard.current||audioReadGuard.current.canEnterReadOnly())return true;
  paper.setNotice('Une opération audio est en cours. Attendez sa fin ou arrêtez et conservez l’enregistrement avant d’ouvrir cet aperçu.');return false;
 };
 const openPresentation=async()=>{
  if(!page||!presentationOwnerCurrent(presentationEpoch)||presenting||printing||readPane.current||!audioMayEnterReadOnly())return;
  if(editablePages.current&&await editablePages.current.flush()!==true){paper.setNotice('Terminez la saisie en cours avant de présenter le carnet.');return;}if(!presentationOwnerCurrent(presentationEpoch)||readPane.current)return;readPane.current='presentation';const request=++presentationRequest.current,capturedEpoch=presentationEpoch,targetPage=page.id;
  cancelInputs();if(editable())flushText();if(!audioMayEnterReadOnly()){readPane.current=null;return;}setPresentation({owner:renderedOwner,id:request,epoch:capturedEpoch,pageId:targetPage});
  const current=()=>presentationRequest.current===request&&presentationOwnerCurrent(capturedEpoch);
  try{
   await paper.whenSaved();if(!current())return;const baseline=paper.getCurrent();
   if(!baseline||!baseline.pages.some(value=>value.id===targetPage))throw Error('La page a changé avant la présentation.');
   const snapshotCurrent=()=>current()&&paper.getCurrent()===baseline;
   const {preparePaperFlowExport}=await import('../lib/paperFlowExport');if(!snapshotCurrent())return;
   const snapshot=await preparePaperFlowExport(structuredClone(baseline),media,snapshotCurrent);if(!snapshotCurrent())return;
   setPresentation({owner:renderedOwner,id:request,epoch:capturedEpoch,pageId:targetPage,baseline,snapshot});
  }catch(error){if(current()){if(readPane.current==='presentation')readPane.current=null;setPresentation(null);paper.setNotice(String(error instanceof Error?error.message:error));}}
  finally{if(current())setPresentation(old=>{if(old?.id===request&&!old.snapshot){if(readPane.current==='presentation')readPane.current=null;return null;}return old;});}
 };
 const closePresentation=(id:number)=>{if(presentationRequest.current!==id)return;presentationRequest.current++;if(readPane.current==='presentation')readPane.current=null;setPresentation(old=>old?.id===id?null:old);};
 const openPrint=async()=>{
  if(!page||!presentationOwnerCurrent(presentationEpoch)||printing||presenting||readPane.current||!audioMayEnterReadOnly())return;
  if(editablePages.current&&await editablePages.current.flush()!==true){paper.setNotice('Terminez la saisie en cours avant d’imprimer le carnet.');return;}if(!presentationOwnerCurrent(presentationEpoch)||readPane.current)return;
  readPane.current='print';const request=++printRequest.current,capturedEpoch=presentationEpoch;
  cancelInputs();if(editable())flushText();
  const current=()=>printRequest.current===request&&presentationOwnerCurrent(capturedEpoch);
  if(!current()||!audioMayEnterReadOnly()){if(readPane.current==='print')readPane.current=null;return;}
  setPrintState({owner:renderedOwner,id:request,epoch:capturedEpoch});
  try{
   const {preparePaperPrint}=await import('../lib/paperPrint');if(!current())return;
   const prepared=await preparePaperPrint({noteId,ownerKey:renderedOwner,generation:capturedEpoch,media,current,getCurrent:paper.getCurrent,title:metadataRef.current?.title},{beforePrepare:()=>paper.whenSaved(),onProgress:(done,total)=>{if(current())setPrintState(old=>old?.id===request?{...old,progress:{done,total}}:old);}});
   if(!current()){prepared.revoke();return;}setPrintState({owner:renderedOwner,id:request,epoch:capturedEpoch,prepared});
  }catch(error){if(current()){if(readPane.current==='print')readPane.current=null;setPrintState(null);paper.setNotice(String(error instanceof Error?error.message:error));}}
 };
 const closePrint=(id:number)=>{if(printRequest.current!==id)return;printRequest.current++;const active=printStateRef.current;if(active?.id===id)active.prepared?.revoke();if(readPane.current==='print')readPane.current=null;setPrintState(old=>old?.id===id?null:old);};

 const authored=(ids:string[])=>{if(ids.length)dispatchEvent(new CustomEvent('dowze:paper-authored',{detail:{accountId:media.accountId,spaceId:media.spaceId,noteId,ids,at:Date.now()}}));};
 const commit=(command:PaperCommand,valid?:()=>boolean)=>{if(!editable()||valid&&!valid())return false;setShapeProposal(null);setOriginalRestore(null);flushText();if(!editable()||valid&&!valid())return false;const result=paper.command(command);if(result){const ids=(c:PaperCommand):string[]=>c.type==='upsert-object'?[c.object.id]:c.type==='patch-object'&&c.patch.audioAnchor===undefined?[c.id]:c.type==='batch'?c.commands.flatMap(ids):[];authored(ids(command));}return result;};
 const commandContext:PaperNotebookCommandContext|null=doc&&page?{ownerKey:renderedOwner,generation:inkEpoch,document:doc,pageId:page.id,objects,selected,readOnly,blocked:paper.blocked||paper.reconciling||!visible,mode:tool}:null;
 const currentCommandContext=():PaperNotebookCommandContext|null=>{const view=editableView.current,current=view.document.getCurrent(),target=current?.pages.find(p=>p.id===view.pageId);return mounted.current&&view.owner===renderedOwner&&view.epoch===inkEpoch&&mediaApi.current===media.api&&current&&target?{ownerKey:view.owner,generation:view.epoch,document:current,pageId:target.id,objects:paperObjectsOnPage(current,target.id),selected,readOnly,blocked:view.disabled||!visible,mode:view.tool}:null;};
 const commandCommit=(value:PaperCommand,target:PaperNotebookCommandTarget)=>paperNotebookCommandTargetCurrent(target,currentCommandContext())&&commit(value,()=>paperNotebookCommandTargetCurrent(target,currentCommandContext()));
 const commandSelect=(ids:string[],target:PaperNotebookCommandTarget)=>{if(!paperNotebookCommandTargetCurrent(target,currentCommandContext()))return;setSelected(ids);};
 const commandPaste=async(target:PaperNotebookCommandTarget)=>{if(!paperNotebookCommandTargetCurrent(target,currentCommandContext()))return false;let ids:string[]=[];try{flushText();await paper.whenSaved();if(!paperNotebookCommandTargetCurrent(target,currentCommandContext()))return false;await paper.applyPrepared(async(baseline,valid)=>{const current=()=>valid()&&paperNotebookCommandTargetCurrent(target,currentCommandContext());const prepared=await preparePastePaperSelection(baseline,target.pageId,media,current);ids=prepared.ids;return prepared;});if(!mounted.current||exportScope.current!==renderedOwner||editableView.current.epoch!==inkEpoch)return false;setSelected(ids);setTool('select');setSmartHighlight(false);return true;}catch(error){if(mounted.current&&exportScope.current===renderedOwner)paper.setNotice(String(error instanceof Error?error.message:error));return false;}};
 const selectionCommand=(id:PaperNotebookCommandId)=>{const context=commandContext;return context?executePaperNotebookCommand({getCurrent:currentCommandContext,media,onCommit:commandCommit,onSelect:commandSelect,onPaste:commandPaste,onAudio:(anchor,target)=>{if(paperNotebookCommandTargetCurrent(target,currentCommandContext()))seekAudio(anchor);},onNotice:paper.setNotice},id,capturePaperNotebookCommandTarget(context)):false;};
 const smart=usePaperSmartHighlight({enabled:smartHighlight,disabled,visible,textOnly,owner:renderedOwner,generation:inkEpoch,document:doc,page,media,viewport,getCurrent:paper.getCurrent,current:editable,commit,onNotice:paper.setNotice});
 const pdfViewCurrent=()=>mounted.current&&exportScope.current===renderedOwner&&editableView.current.epoch===inkEpoch&&mediaApi.current===media.api&&visible;
 const object=(kind:PaperObject['kind'],at={x:72,y:72}):PaperObject=>({id:uid(),pageId:page!.id,kind,x:at.x,y:at.y,width:kind==='text'?450:240,height:kind==='text'?260:160,rotation:0,z:Math.max(0,...objects.map(o=>o.z))+1,locked:false,createdAt:Date.now(),...(kind==='text'||kind==='sticky'?{markdown:''}:{})});
 const addObject=(kind:'text'|'sticky'|'shape',at?:{x:number;y:number},shape:PaperObject['shape']='rectangle')=>{if(!page||!editable())return;const item={...object(kind,at),...(kind==='sticky'?{color:'#fff3b0'}:kind==='shape'?{shape,color,strokeWidth:width,strokeStyle}:{})};commit({type:'upsert-object',object:item});setSelected([item.id]);activateTool(kind==='shape'?'select':'text');};
 const point=(event:{clientX:number;clientY:number;pressure?:number;pointerType?:string;timeStamp:number;tiltX?:number;tiltY?:number;twist?:number}):InkPoint=>{
 const rect=svg.current!.getBoundingClientRect();let inverse:DOMMatrix|undefined;try{inverse=svg.current!.getScreenCTM()?.inverse();}catch{}return {x:inverse?inverse.a*event.clientX+inverse.c*event.clientY+inverse.e:(event.clientX-rect.left)/rect.width*page!.width,y:inverse?inverse.b*event.clientX+inverse.d*event.clientY+inverse.f:(event.clientY-rect.top)/rect.height*page!.height,time:event.timeStamp,...(event.pointerType==='pen'?{pressure:event.pressure,tiltX:event.tiltX,tiltY:event.tiltY,twist:event.twist}:{})};};
 const inkContext=():PaperInkContext|null=>{if(!page||!svg.current||tool==='text'||!editable()||editableView.current.tool!==tool)return null;const rect=svg.current.getBoundingClientRect();let matrix:PaperInkContext['clientToPage'];try{const inverse=svg.current.getScreenCTM()?.inverse();if(inverse)matrix={a:inverse.a,b:inverse.b,c:inverse.c,d:inverse.d,e:inverse.e,f:inverse.f};}catch{}
  return {ownershipKey:renderedOwner,generation:inkEpoch,pageId:page.id,pageWidth:page.width,pageHeight:page.height,pageRotation:page.rotation,clientRect:{left:rect.left,top:rect.top,width:rect.width,height:rect.height},clientToPage:matrix,intent:tool};};
 const paintCorrected=(stroke:PaperInkStroke,output:PaperStrokeCorrectionResult)=>({...stroke,points:output.points});
 const holdTick=()=>{correctionFrame.current=0;const held=capture.current,stroke=ink.current.snapshot(),context=inkContext();if(!held||!stroke||!context||correctionSource.current!=='page')return;const result=correction.current.tick(performance.now(),context,correctionOptionsRef.current);if(result.cancelled){cancelStroke();return;}inkPreview.current?.paint(paintCorrected(stroke,result),held.style);correctionFrame.current=requestAnimationFrame(holdTick);};
 const repaint=()=>{if(!frame.current)frame.current=requestAnimationFrame(()=>{frame.current=0;const held=capture.current,stroke=ink.current.snapshot(),context=inkContext();if(held&&stroke&&context){const result=correction.current.update(stroke,performance.now(),context,correctionOptionsRef.current);if(result.cancelled){cancelStroke();return;}inkPreview.current?.paint(paintCorrected(stroke,result),held.style);}});};
 const previewLoupe=(phase:'begin'|'update'|'tick',stroke:PaperInkStroke)=>{if(!samePaperWritingLoupeOwner(stroke.context,loupeOwner()))return stroke;if(phase==='begin'){cancelStroke();correctionSource.current='loupe';return paintCorrected(stroke,correction.current.begin(stroke,correctionOptionsRef.current,performance.now()));}if(correctionSource.current!=='loupe')return stroke;const output=phase==='tick'?correction.current.tick(performance.now(),stroke.context,correctionOptionsRef.current):correction.current.update(stroke,performance.now(),stroke.context,correctionOptionsRef.current);return paintCorrected(stroke,output);};
 const commitStroke=(stroke:PaperInkStroke,held:{style:PaperInkPreviewStyle;wholeEraser:boolean},corrected?:PaperStrokeCorrectionResult):boolean=>{
  if(erasePlan.current||!samePaperWritingLoupeOwner(stroke.context,loupeOwner())||!editable()||stroke.context.intent!==editableView.current.tool)return false;const pts=stroke.points;
  if(stroke.intent==='laser'){inkPreview.current?.paint(stroke,held.style);laserTimer.current=setTimeout(()=>{inkPreview.current?.paint(null,held.style);laserTimer.current=null;},600);return true;}
  if(stroke.intent==='lasso'){const contains=createPaperLassoSelection(pts);setSelected(expandPaperGroups(objects,objects.filter(contains).map(o=>o.id)));activateTool('select');return true;}
  if(stroke.intent==='eraser'){
   if(erasePlan.current)return false;flushText();if(!editable()||!samePaperWritingLoupeOwner(stroke.context,loupeOwner()))return false;
   const baseline=paper.getCurrent();if(!baseline)return false;const task={id:++eraseCounter.current,owner:renderedOwner,epoch:inkEpoch};erasePlan.current=task;setEraseActivity({owner:task.owner,id:task.id});
   const valid=()=>{const view=editableView.current;return mounted.current&&erasePlan.current===task&&paper.getCurrent()===baseline&&mediaApi.current===media.api&&view.owner===task.owner&&view.epoch===task.epoch&&!view.disabled&&view.tool===stroke.context.intent&&view.pageId===stroke.context.pageId&&view.width===stroke.context.pageWidth&&view.height===stroke.context.pageHeight&&(view.rotation??0)===(stroke.context.pageRotation??0);};
   void runNotebookOperation(media.accountId,async()=>{
    const {planPaperInkGestureErase}=await import('../lib/paperInkGestureErase');if(!valid())return;
    const plan=await planPaperInkGestureErase({objects:baseline.objects,pages:baseline.pages,pageId:stroke.context.pageId,path:pts,radius:held.style.width*3,whole:held.wholeEraser,current:valid,maxGeneratedPoints:200000});if(!valid())return;
    if(plan.status==='refused'){paper.setNotice('Ce geste d’effacement est trop complexe ou sa géométrie ne peut pas être conservée exactement. Les traits restent intacts ; effacez une zone plus petite.');return;}
    if(plan.status==='cancelled'||!plan.current())return;
    if(plan.status==='ready'&&!commit({type:'batch',commands:plan.commands},()=>valid()&&plan.current()))return;
    const previous=eraserReturn.current.afterStroke({intent:stroke.intent,cancelled:false,enabled:toolPreferences.effective.returnToPen===true,activeSlot,toolbar:toolbarSlots});const previousSlot=toolbarSlots.find(slot=>slot.id===previous);if(previousSlot)selectToolSlot(previousSlot);
   }).catch(error=>{if(valid())paper.setNotice(String(error instanceof Error?error.message:error));}).finally(()=>{if(erasePlan.current===task){erasePlan.current=null;if(mounted.current)setEraseActivity(null);}});return true;
  }
  const original={...object('ink',{x:0,y:0}),pageId:stroke.context.pageId,width:stroke.context.pageWidth,height:stroke.context.pageHeight,points:pts.map(p=>({...p})),color:held.style.color,strokeWidth:held.style.width,opacity:held.style.opacity,strokeStyle:held.style.strokeStyle,pen:stroke.intent==='pencil'||stroke.intent==='calligraphy'||stroke.intent==='highlighter'?stroke.intent:'pen' as const};
  if(!commit({type:'upsert-object',object:compactInk(original)}))return false;
  if(corrected&&!corrected.cancelled&&corrected.correction!=='none'&&JSON.stringify(corrected.points)!==JSON.stringify(pts)){const replacement=compactInk({...original,points:corrected.points});if(commit({type:'upsert-object',object:replacement})){const current=paper.getCurrent(),owner=loupeOwner();if(current&&owner)setOriginalRestore({original,expected:replacement,revision:current.revision,owner});}}
  if(corrected?.candidate&&corrected.candidate.kind!=='line'){const current=paper.getCurrent(),owner=loupeOwner(),expected=current?.objects.find(o=>o.id===original.id);if(current&&owner&&expected)setShapeProposal({candidate:corrected.candidate,original,expected,revision:current.revision,owner});}return true;
 };
 const finishLoupe=(stroke:PaperInkStroke,style:PaperInkPreviewStyle)=>{if(!samePaperWritingLoupeOwner(stroke.context,loupeOwner())||!editable())return false;const result=correctionSource.current==='loupe'?correction.current.finish(stroke,performance.now(),stroke.context,correctionOptionsRef.current):undefined;correctionSource.current=null;return commitStroke(stroke,{style,wholeEraser},result);};
 const down=(event:React.PointerEvent<SVGSVGElement>)=>{
  if(!page||!editable()||textOnly||erasePlan.current)return;if(loupeOpen){const p=point(event);loupe.current?.reposition(p.x,p.y);return;}if(laserTimer.current){clearTimeout(laserTimer.current);laserTimer.current=null;}
  if(event.pointerType==='pen')touchGesture.current.observePen(event.timeStamp);
  if(tool==='text'){if(event.pointerType!=='touch')addObject('text',point(event));return;}
  const context=inkContext();if(!context)return;const result=ink.current.begin(event.nativeEvent,context,{enabled:!disabled,fingerInk});
  if(!result.accepted||!result.stroke){if(result.status==='cancelled')cancelStroke();return;}
  capture.current={stroke:result.stroke,style:{color,width,opacity,strokeStyle},wholeEraser,objects:[...objects]};
  try{event.currentTarget.setPointerCapture(event.pointerId);}catch{cancelStroke();return;}event.preventDefault();
  if(result.intent==='select'){const p=result.stroke.points[0],target=(event.target as Element).closest('[data-object]')?.getAttribute('data-object');if(!target){setSelected([]);cancelStroke();return;}const group=expandPaperGroups(objects,[target]);const ids=event.shiftKey?(selected.includes(target)?selected.filter(id=>!group.includes(id)):[...new Set([...selected,...group])]):selected.includes(target)?selected:group;setSelected(ids);drag.current={point:p,objects:objects.filter(o=>ids.includes(o.id)&&!o.locked)};return;}
  correctionSource.current='page';const output=correction.current.begin(result.stroke,correctionOptionsRef.current,performance.now());inkPreview.current?.paint(paintCorrected(result.stroke,output),capture.current.style);if(aids.value.hold.enabled)correctionFrame.current=requestAnimationFrame(holdTick);
 };
 const move=(event:React.PointerEvent<SVGSVGElement>)=>{
  const context=inkContext();if(!context||!capture.current)return;let batch:PointerEvent[]=[];try{batch=event.nativeEvent.getCoalescedEvents?.()??[];}catch{}
  const result=ink.current.append(event.nativeEvent,context,batch);if(result.status==='cancelled'){cancelStroke();return;}if(!result.accepted)return;event.preventDefault();
  if(drag.current){const p=point(event);setDragDelta({x:p.x-drag.current.point.x,y:p.y-drag.current.point.y});return;}const raw=ink.current.snapshot();if(raw)correction.current.update(raw,performance.now(),context,correctionOptionsRef.current);repaint();
 };
 const finish=(event:React.PointerEvent<SVGSVGElement>,cancel=false)=>{
  const context=inkContext(),held=capture.current;if(!context||!held)return;const result=ink.current.finish(event.nativeEvent,context,cancel);if(result.status==='ignored')return;
  if(!result.accepted)correction.current.cancel();const corrected=result.accepted&&result.stroke?correction.current.finish(result.stroke,performance.now(),context,correctionOptionsRef.current):undefined,oldDrag=drag.current;capture.current=null;drag.current=null;setDragDelta({x:0,y:0});clearPreview();cancelAnimationFrame(correctionFrame.current);correctionFrame.current=0;correctionSource.current=null;try{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}catch{}
  if(!result.accepted||!result.stroke||!editable()||corrected?.cancelled)return;const stroke=result.stroke,pts=stroke.points;
  if(oldDrag){const p=pts.at(-1)!;const dx=p.x-oldDrag.point.x,dy=p.y-oldDrag.point.y;if(Math.hypot(dx,dy)>.1){const latest=paper.getCurrent();const commands=oldDrag.objects.flatMap(o=>{const current=latest?.objects.find(item=>item.id===o.id);return current&&!current.locked?[{type:'patch-object' as const,id:current.id,patch:{x:current.x+dx,y:current.y+dy}}]:[];});if(commands.length)commit({type:'batch',commands});}return;}
  commitStroke(stroke,held,corrected);
 };
 const bypassCorrection=()=>{if(page)editablePages.current?.getController(page.id)?.bypassCorrection();const output=correction.current.disable(),raw=ink.current.snapshot(),held=capture.current;if(raw&&held&&correctionSource.current==='page')inkPreview.current?.paint(paintCorrected(raw,output),held.style);};
 const updateGuide=(guide:typeof aids.value.guide)=>{if(!editable())return;const moved=(['x','y','angle','space','unit','pageUnitsPerMm','snapDistancePx'] as const).some(key=>guide[key]!==effectiveGuide[key]);if(moved)cancelInputs();else bypassCorrection();setShapeProposal(null);setOriginalRestore(null);const {pageUnitsPerMm:canonicalRatio,...view}=guide;const previous=aids.value.guide;void aids.change({guide:{...view,unit:guide.unit!==effectiveGuide.unit?guide.unit:previous.unit,...(previous.pageUnitsPerMm!==undefined?{pageUnitsPerMm:previous.pageUnitsPerMm}:{})}});};
 const updateHold=(hold:typeof aids.value.hold)=>{if(!editable())return;bypassCorrection();setShapeProposal(null);setOriginalRestore(null);void aids.change({hold});};
 const applyProposal=()=>{const proposal=shapeProposal,current=paper.getCurrent();if(!proposal||shapeProposalRef.current!==proposal||!current||!editable()||!samePaperWritingLoupeOwner(proposal.owner,loupeOwner())||proposal.revision!==current.revision||JSON.stringify(current.objects.find(o=>o.id===proposal.expected.id))!==JSON.stringify(proposal.expected))return;const replacement=compactInk({...proposal.original,points:proposal.candidate.points});if(commit({type:'upsert-object',object:replacement})){const latest=paper.getCurrent();if(latest)setOriginalRestore({original:proposal.original,expected:replacement,revision:latest.revision,owner:proposal.owner});}};
 const restoreOriginal=()=>{const previous=originalRestore,current=paper.getCurrent();if(!previous||originalRestoreRef.current!==previous||!current||!editable()||!samePaperWritingLoupeOwner(previous.owner,loupeOwner())||previous.revision!==current.revision||JSON.stringify(current.objects.find(o=>o.id===previous.expected.id))!==JSON.stringify(previous.expected))return;commit({type:'upsert-object',object:compactInk(previous.original)});};
 const viewContext=()=>({owner:exportScope.current,pageId:page?.id??'',zoom,scrollLeft:viewport.current?.scrollLeft??0,scrollTop:viewport.current?.scrollTop??0,fingerInk});
 const applyNavigation=(action:PaperViewportAction)=>{const target=viewport.current;if(!target)return;if(action.mode==='pan'){cancelInputs();target.scrollLeft=action.scrollLeft??target.scrollLeft;target.scrollTop=action.scrollTop??target.scrollTop;}
  if(action.mode==='pinch'&&action.center&&svg.current&&page){cancelInputs();if(action.start){const rect=svg.current.getBoundingClientRect();pinch.current={x:(action.center.x-rect.left)/zoom,y:(action.center.y-rect.top)/zoom,pageId:page.id,owner:exportScope.current};}const anchor=pinch.current;if(!anchor)return;pendingPinch.current={...anchor,clientX:action.center.x,clientY:action.center.y};manualZoom.current=true;setZoom(action.zoom!);setPinchLayoutVersion(version=>version+1);}
  if(action.mode==='ended'||action.mode==='cancelled')pinch.current=null;if(action.mode==='cancelled')pendingPinch.current=null;
 };
 const touchDown=(event:React.PointerEvent<HTMLDivElement>)=>{if(event.pointerType==='pen'){touchGesture.current.observePen(event.timeStamp);return;}if(event.pointerType!=='touch'||textOnly||tool==='text'||disabled||(event.target as Element).closest('button,input,select,textarea,[contenteditable="true"]'))return;const action=touchGesture.current.begin(event.nativeEvent,viewContext(),capture.current?.stroke.pointerType==='pen');if(action.reason==='palm'){event.preventDefault();event.stopPropagation();return;}if(action.handled){event.preventDefault();event.stopPropagation();cancelInputs();try{event.currentTarget.setPointerCapture(event.pointerId);}catch{}applyNavigation(action);}};
 const touchMove=(event:React.PointerEvent<HTMLDivElement>)=>{const action=touchGesture.current.move(event.nativeEvent,viewContext());if(action.handled){event.preventDefault();event.stopPropagation();applyNavigation(action);}};
 const touchEnd=(event:React.PointerEvent<HTMLDivElement>,cancel=false)=>{const action=touchGesture.current.end(event.nativeEvent,viewContext(),cancel);if(action.handled){event.preventDefault();event.stopPropagation();applyNavigation(action);try{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}catch{}}};
 const uploadImage=async(file:File)=>{
  if(disabled||!doc||!page)return;const scope=renderedOwner,current=()=>mounted.current&&exportScope.current===scope,image={...object('image'),width:320,height:240};
  try{await runNotebookOperation(media.accountId,async()=>{
   flushText();await paper.whenSaved();if(!current())return;await paper.attachImage(file,file.name,current,image);if(current())authored([image.id]);
  });}catch(error){if(current())paper.setNotice(String(error instanceof Error?error.message:error));}
 };
 const uploadInlineImage=async(file:File):Promise<string>=>{
  if(disabled)throw Error('La note attend sa récupération avant d’ajouter une image.');const scope=renderedOwner,current=()=>mounted.current&&exportScope.current===scope;
  return runNotebookOperation(media.accountId,async()=>{flushText();await paper.whenSaved();if(!current())throw Error('La note courante a changé.');return paper.attachImage(file,file.name,current);});
 };
 const resumeImport=async(kind:PaperImportRecoveryKind,jobId?:string,file?:File)=>{
  if(disabled||!pageViewLive())throw Error('Ouvrez cette note avant de reprendre son importation.');
  if(importControllers.current.has(importScopeKey))throw Error('Une importation est déjà en cours dans cette note.');
  const scope=Object.freeze({accountId:media.accountId,spaceId:media.spaceId,noteId}),authority=pageViewAuthority.current,api=media.api,controller=new AbortController();
  const current=()=>!controller.signal.aborted&&pageViewAuthority.current===authority&&mediaApi.current===api&&pageViewLive()&&!editableView.current.disabled;
  importControllers.current.set(importScopeKey,controller);setImportActivity(importScopeKey);
  try{await runNotebookOperation(scope.accountId,async()=>{
   cancelInputs();if(await editablePages.current?.flush()!==true)throw Error('Terminez la saisie en cours avant d’importer le fichier.');await paper.whenSaved();if(!current())throw Error('La note a changé avant l’importation.');
   const pdf=kind==='pdf'?await import('../lib/paperPdfImportStaging'):null,archive=kind!=='pdf'?await import('../lib/paperAppendArchiveStaging'):null;
   let id=jobId;
   if(file){const staged=pdf?await pdf.stagePaperPdfImport({scope,file,current}):await archive!.stagePaperAppendArchive({scope,file,current});id=staged.id;}
   if(!id)throw Error('Choisissez une importation conservée dans cette note.');
   const receipt=pdf?await pdf.preparePaperPdfImport({scope,id,current,signal:controller.signal}):kind==='legacy-archive'?await archive!.stagePaperLegacyAppendArchiveCopy({scope,sourceReceiptKey:id,current}):await archive!.preparePaperAppendArchive({scope,id,current});
   if(kind==='legacy-archive')id=receipt.id;
   if(receipt.state==='applied'){const durable=await getDraft({...scope,type:'whiteboard',documentId:notebookDocumentId(noteId)});if(current()){if(JSON.stringify(durable?.content)!==JSON.stringify(paper.getCurrent()))paper.retryOpen();paper.setNotice('Cette importation a déjà été traitée. Aucune nouvelle copie n’est créée.');}return;}
   cancelInputs();if(await editablePages.current?.flush()!==true)throw Error('Terminez la saisie en cours avant d’ajouter les pages préparées.');await paper.whenSaved();if(!current())throw Error('La note a changé. L’importation préparée reste conservée.');
   let firstPageId='';await paper.applyPrepared(async(document,active)=>{
    const valid=()=>current()&&active(),prepared=pdf?await pdf.preparePaperPdfImportPublication({document,scope,id:id!,current:valid}):kind==='legacy-archive'?await archive!.preparePaperLegacyAppendArchivePublication({document,scope,id:id!,current:valid}):await archive!.preparePaperAppendArchivePublication({document,scope,id:id!,current:valid});firstPageId=prepared.firstPageId;return prepared;
   });await paper.whenSaved();
   if(current()){navigatePage(firstPageId);setManager(true);paper.setNotice(kind==='pdf'?'Les pages PDF sont ajoutées. Vous pouvez écrire et dessiner dessus.':kind==='legacy-archive'?'Une nouvelle copie des pages récupérées a été ajoutée. Les données de l’ancienne importation sont conservées.':'Les pages de l’archive sont ajoutées. Le titre et le classement de votre note sont conservés.');}
  });}catch(error){if(current()){setImportRecoveryOpen(true);paper.setNotice(String(error instanceof Error?error.message:error));}throw error;}
  finally{if(importControllers.current.get(importScopeKey)===controller)importControllers.current.delete(importScopeKey);if(mounted.current&&exportScope.current===renderedOwner)setImportActivity(value=>value===importScopeKey?null:value);}
 };
 const openImportFile=(kind:'pdf'|'archive')=>{
  if(disabled||importBusy||!pageViewLive())return;
  fileAdmissions.current.set(kind,{authority:pageViewAuthority.current,api:media.api,scopeKey:importScopeKey});
  (kind==='pdf'?pdfInput.current:archiveInput.current)?.click();
 };
 const acceptImportFile=(kind:'pdf'|'archive',file:File|undefined)=>{
  const ticket=fileAdmissions.current.get(kind);fileAdmissions.current.delete(kind);if(!file)return;
  if(!ticket||ticket.authority!==pageViewAuthority.current||ticket.api!==media.api||ticket.scopeKey!==importScopeKey||!pageViewLive()){
   if(pageViewLive())paper.setNotice('La note a changé pendant le choix du fichier. Choisissez à nouveau le fichier depuis la note souhaitée.');return;
  }
  void resumeImport(kind,undefined,file).catch(()=>{});
 };
 const loadPendingImports=async(current:()=>boolean):Promise<PaperImportRecoveryItem[]>=>{
  const scope={accountId:media.accountId,spaceId:media.spaceId,noteId},[pdf,archive]=await Promise.all([import('../lib/paperPdfImportStaging'),import('../lib/paperAppendArchiveStaging')]);
  const [pdfRows,archiveRows,legacyRows]=await Promise.all([pdf.listPaperPdfImports(scope,current),archive.listPaperAppendArchives({scope,current}),archive.listPaperLegacyAppendArchiveRecoveries({scope,current,includeApplied:true})]);
  const recoveredKeys=new Set(legacyRows.map(row=>row.sourceReceipt.key));
  const legacyCopies:PaperImportRecoveryItem[]=legacyRows.filter(row=>row.state==='ready').map(row=>({kind:'legacy-archive',id:row.sourceReceipt.key,sourceName:row.sourceName,createdAt:row.createdAt,status:'Copie récupérée prête à ajouter',details:'Cette copie conserve les médias disponibles. Le fichier ZIP de l’ancienne importation n’est pas disponible.',resumable:true,originalAvailable:false,resumeLabel:'Ajouter la copie récupérée'}));
  const legacySources:PaperImportRecoveryItem[]=archiveRows.legacyIncomplete.filter(row=>!recoveredKeys.has(row.key)).map(row=>({kind:'legacy-archive',id:row.key,sourceName:row.sourceName,status:'Ancienne importation conservée',details:row.mediaReferences==='all-present'?'Les médias locaux sont disponibles. Vous pouvez en récupérer une nouvelle copie ; le fichier ZIP d’origine n’est pas disponible.':row.reason,resumable:row.mediaReferences==='all-present',originalAvailable:false,resumeLabel:'Récupérer une nouvelle copie'}));
  return [...pdfRows.map(row=>({kind:'pdf' as const,id:row.id,sourceName:row.sourceName,createdAt:row.createdAt,status:row.state==='ready'?'Prêt à ajouter':'Original conservé',details:row.pages?`${row.pages.length} pages préparées`:undefined,resumable:true})),...archiveRows.receipts.map(row=>({kind:'archive' as const,id:row.id,sourceName:row.sourceName,createdAt:row.createdAt,status:row.state==='ready'?'Prêt à ajouter':'Original conservé',resumable:true})),...legacyCopies,...legacySources];
 };
 const saveImportOriginal=async(kind:PaperImportRecoveryKind,id:string)=>{
  if(kind==='legacy-archive')throw Error('Le fichier original de cette ancienne importation n’est pas disponible. Ses données locales restent conservées.');
  const scope={accountId:media.accountId,spaceId:media.spaceId,noteId},authority=pageViewAuthority.current,current=()=>pageViewLive()&&pageViewAuthority.current===authority;
  await runNotebookOperation(scope.accountId,async()=>{const original=kind==='pdf'?await (await import('../lib/paperPdfImportStaging')).readPaperPdfImportOriginal(scope,id,current):await (await import('../lib/paperAppendArchiveStaging')).readPaperAppendArchiveOriginal({scope,id,current});if(!current())throw Error('La note de l’original a changé.');const saved=await savePaperExport(original.blob,original.name,kind==='pdf'?'pdf':'archive',current);if(!saved)throw Error('Enregistrement de l’original annulé.');});
 };
 const previewExport=async(blob:Blob,format:'pdf'|'png'|'jpeg'|'archive',scope:string,authority:typeof pageViewAuthority.current)=>{if(!pageViewLive()||scope!==exportScope.current||pageViewAuthority.current!==authority)return;setExportPreview({scope,generation:authority.generation,api:authority.api,url:URL.createObjectURL(blob),format,blob});};
 useEffect(()=>()=>{if(exportPreviewState)URL.revokeObjectURL(exportPreviewState.url);},[exportPreviewState]);
 useEffect(()=>{setExportBusy(false);setExportPreview(null);historyRequest.current++;setHistoryState({scope:exportScope.current,versions:[],open:false});},[noteId,media.accountId,media.spaceId,media.api,pageViewGeneration]);
 const exportName=(format:'pdf'|'png'|'jpeg'|'archive')=>`${(metadataRef.current?.title?.trim()||'note').replace(/[\/\\:*?"<>|\x00-\x1f]/g,'-').slice(0,80)}.${format==='jpeg'?'jpg':format==='archive'?'dowze':format}`;
 const savePreview=()=>{const preview=exportPreview;if(!preview||preview.scope!==exportScope.current)return;const authority=pageViewAuthority.current,current=()=>pageViewLive()&&pageViewAuthority.current===authority&&preview.generation===authority.generation&&preview.api===authority.api;void savePaperExport(preview.blob,exportName(preview.format),preview.format,current).then(saved=>{if(current())paper.setNotice(saved?'Export enregistré ou téléchargement demandé.':'Export annulé.');}).catch(error=>{if(current())paper.setNotice(String(error));});};
 const exportBundle=async()=>{
 if(exportBusy||!doc||!pageViewLive())return;setExportBusy(true);const captured=renderedOwner,authority=pageViewAuthority.current,current=()=>pageViewLive()&&pageViewAuthority.current===authority;
 try{await runNotebookOperation(media.accountId,async()=>{flushText();await paper.whenSaved();const snapshot=paper.getCurrent();if(!snapshot||!current())return;const {buildPaperArchive}=await import('../lib/paperArchiveExport');const blob=await buildPaperArchive(snapshot,media,metadataRef.current,current,(done,total)=>{if(current())paper.setNotice(`Préparation de l’archive… ${Math.round(done/total*100)} %`);});if(!current())return;await previewExport(blob,'archive',captured,authority);paper.setNotice('Archive prête : titre, matières, tags, classement, pages et médias conservés.');});}catch(e){if(current())paper.setNotice(String(e instanceof Error?e.message:e));}finally{if(current())setExportBusy(false);}
 };
 // Capture an irreversible view/API lease before any history IO. Closing or
 // hiding this panel retires the accepted operation, even through an A-B-A view.
 const historyAuthority=(request:number)=>{
  const authority=pageViewAuthority.current;let retired=false,lease:(()=>boolean)|undefined;
  const current=()=>{if(retired)return false;try{if(pageViewAuthority.current!==authority||!pageViewLive()||!toolPreferences.current()||historyRequest.current!==request||lease&&!lease())retired=true;}catch{retired=true;}return !retired;};
  if(!current())return;try{lease=media.api?.captureSessionAuthority(media.accountId);}catch{retired=true;return;}return current()?{authority,current}:undefined;
 };
 const openHistory=async()=>{if(!pageViewLive()||!toolPreferences.current())return;const captured=renderedOwner,request=++historyRequest.current,source=historyAuthority(request);if(!source)return;try{const versions=await readPaperHistorySelections(noteId,media,source.current);if(source.current())setHistoryState({scope:captured,versions,open:true});}catch(error){if(source.current())paper.setNotice(String(error instanceof Error?error.message:error));}};
 const restoreHistoryCopy=async(selection:PaperHistorySelection)=>{
  if(disabled||!onRestoreVersion||historyState.scope!==renderedOwner||!historyOpen)return;
  const request=historyRequest.current,source=historyAuthority(request);if(!source||historyCopy.current?.authority===source.authority)return;
  const job={authority:source.authority,request},callback=onRestoreVersion;
  historyCopy.current=job;setHistoryCopyActivity(source.authority);
  const current=()=>historyCopy.current===job&&source.current();
  try{
   const captured=capturePaperHistorySelection(selection,noteId,media);
   flushText();await paper.whenSaved();if(!current())return;
   await callback(captured,current);if(!current())return;
   paper.setNotice('Version restaurée dans une nouvelle note. Retrouvez-la dans la bibliothèque.');closeHistory();
  }catch(error){if(current())paper.setNotice(String(error instanceof Error?error.message:error));}
  finally{if(historyCopy.current===job){historyCopy.current=null;if(mounted.current)setHistoryCopyActivity(null);}}
 };
 const renderExport=async(format:'pdf'|'png'|'jpeg')=>{
 if(exportBusy||!page||!pageViewLive())return;const captured=renderedOwner,authority=pageViewAuthority.current,current=()=>pageViewLive()&&pageViewAuthority.current===authority;setExportBusy(true);try{flushText();await paper.whenSaved().catch(()=>undefined);const snapshot=paper.getCurrent();if(!snapshot||!current())return;
 const {renderPaperPdf,renderPaperImage}=await import('../lib/paperRenderedExport');const blob=format==='pdf'?await renderPaperPdf(snapshot,media,(done,total)=>{if(current())paper.setNotice(`Préparation du PDF : ${done} / ${total} pages`);}):await renderPaperImage(snapshot,page.id,media,format);
 if(!current())return;await previewExport(blob,format,captured,authority);paper.setNotice('Votre export est prêt. Vous pouvez le consulter puis l’enregistrer.');
 }catch(e){if(current())paper.setNotice(String(e instanceof Error?e.message:e));}finally{if(current())setExportBusy(false);}
 };
 const caretPosition=useRef<{id:string;y:number}|null>(null);
 const reflow=(id:string,source:string,breaks:number[],sourceOffsets?:number[])=>{const latest=paper.getCurrent();if(!latest||!editable()||hasPendingNotebookWrites())return false;const command=reflowPaperText(latest,id,source,breaks,sourceOffsets);if(!command)return true;const saved=paper.layout(command);if(saved&&caretPosition.current?.id===id)flowCaret(id,caretPosition.current.y);return saved;};
 const flowCaret=(id:string,y:number)=>{if(!editable())return;caretPosition.current={id,y};const root=paper.getCurrent()?.objects.find(o=>o.id===id),flow=root?.textFlow;if(!flow)return;const index=flow.breaks.findIndex((end,i)=>i>0&&y<end)-1;const target=flow.pageIds[index<0?flow.pageIds.length-1:index];if(target&&target!==pageId)navigatePage(target,[id]);};
 useEffect(()=>{const caret=caretPosition.current,root=caret&&paper.getCurrent()?.objects.find(o=>o.id===caret.id),target=viewport.current;if(!caret||!root||!target||!root.textFlow)return;const index=root.textFlow.pageIds.indexOf(pageId);if(index<0)return;const localY=(root.y+caret.y-root.textFlow.breaks[index])*zoom;const task=requestAnimationFrame(()=>{if(localY<target.scrollTop+32||localY>target.scrollTop+target.clientHeight-32)target.scrollTop=Math.max(0,localY-target.clientHeight/2);});return()=>cancelAnimationFrame(task);},[pageId,zoom]);
 const goPdfPage=(number:number)=>{if(!navigationCurrent())return;const target=paper.getCurrent()?.pages.find(p=>p.pdf&&p.pdf.assetId===page?.pdf?.assetId&&p.pdf.pageNumber===number);if(target){if(navigatePage(target.id)&&innerWidth<=700)setPdfOutline(false);}else paper.setNotice('La page visée ne fait plus partie de cette note. Le PDF original est conservé.');};
 const duplicatePage=async()=>{if(!doc||!page||pageBusy||disabled)return;const scope=exportScope.current,selectedPage=page.id;setPageBusy(true);const current=()=>mounted.current&&exportScope.current===scope;
  try{await runNotebookOperation(media.accountId,async()=>{flushText();await paper.whenSaved();let snapshot=paper.getCurrent();if(!snapshot||!current())return;const {duplicatePaperPage,alignCopiedPageText}=await import('../lib/paperPageCopy');const {preparePaperFlowExport,measurePaperFlowObject}=await import('../lib/paperFlowExport');
   if(paperObjectsOnPage(snapshot,selectedPage).some(o=>o.kind==='text'&&o.textFlow&&o.textFlow.pageIds.length>1&&(!o.textFlow.sourceOffsets||o.textFlow.source!==textFlowFingerprint(o.markdown??'',o.width,o.height)))){const baseline=snapshot;paper.setNotice('Préparation de la copie de cette page…');snapshot=await preparePaperFlowExport(snapshot,media);if(!current())return;const latest=paper.getCurrent();if(!latest||JSON.stringify(latest.objects)!==JSON.stringify(baseline.objects))throw Error('Le contenu a changé pendant la préparation. Relancez la copie de cette page.');}
   if(!current()||!paper.getCurrent()?.pages.some(p=>p.id===selectedPage))return;const baseline=paper.getCurrent()!,copied=duplicatePaperPage(snapshot,selectedPage);if(copied.command.type==='batch'){const sources=paperObjectsOnPage(snapshot,selectedPage);let textIndex=0;for(const command of copied.command.commands){if(command.type!=='upsert-object')continue;const source=sources[textIndex++];if(command.object.kind==='text'&&source.textFlow&&source.textFlow.pageIds.length>1){const originalLayout=await measurePaperFlowObject(source,snapshot,media),copyLayout=await measurePaperFlowObject(command.object,snapshot,media);command.object=alignCopiedPageText(command.object,source,selectedPage,originalLayout.bands,copyLayout);}}}if(!current())return;const latest=paper.getCurrent();if(!latest||JSON.stringify(latest.objects)!==JSON.stringify(baseline.objects)||JSON.stringify(latest.pages.find(p=>p.id===selectedPage))!==JSON.stringify(baseline.pages.find(p=>p.id===selectedPage)))throw Error('La page a changé pendant la copie. Sa version actuelle est conservée.');if(!commit(copied.command))return;await paper.whenSaved();if(current()){navigatePage(copied.pageId);paper.setNotice('Page dupliquée avec son texte, sa mise en forme et ses annotations.');}
  });}catch(error){if(current())paper.setNotice(String(error instanceof Error?error.message:error));}finally{if(current())setPageBusy(false);}
 };


 const modifyPages=async(operation:import('../lib/paperPageOperations').PaperPageOperation)=>{
  if(pageBusy||disabled)return;const scope=exportScope.current;setPageBusy(true);const current=()=>mounted.current&&exportScope.current===scope;
  try{await runNotebookOperation(media.accountId,async()=>{
   flushText();await paper.whenSaved();const baseline=paper.getCurrent();if(!baseline||!current())return;
   const {pageOperationFlows,planPaperPageOperation}=await import('../lib/paperPageOperations');
   const {preparePaperFlowExport,measurePaperFlowObject}=await import('../lib/paperFlowExport');
   const {alignCopiedPageText}=await import('../lib/paperPageCopy');
   let snapshot=baseline;const affected=pageOperationFlows(snapshot,operation);
   if(affected.some(o=>!o.textFlow?.sourceOffsets||o.textFlow.source!==textFlowFingerprint(o.markdown??'',o.width,o.height))){
    paper.setNotice('Préparation des pages et de leur texte…');snapshot=await preparePaperFlowExport(snapshot,media);
    if(!current())return;if(JSON.stringify(snapshot.pages.map(p=>p.id))!==JSON.stringify(baseline.pages.map(p=>p.id)))throw Error('La pagination a changé. Laissez-la se terminer puis réessayez.');
   }
   const plan=planPaperPageOperation(snapshot,operation);
   for(const partition of plan.partitions){
    const originalLayout=await measurePaperFlowObject(partition.source,snapshot,media);if(!current())return;
    for(let i=0;i<partition.objects.length;i++){
     const fragment=partition.objects[i],layout=await measurePaperFlowObject(fragment,snapshot,media);if(!current())return;
     partition.objects[i]=alignCopiedPageText(fragment,partition.source,fragment.pageId,originalLayout.bands,layout);
    }
   }
   for(const command of plan.command.commands)if(command.type==='partition-text-flow')command.expected=structuredClone(baseline.objects.find(o=>o.id===command.id)!);
   if(!current())return;flushText();await paper.whenSaved();const latest=paper.getCurrent();
   if(!latest||JSON.stringify(latest.objects)!==JSON.stringify(baseline.objects)||JSON.stringify(latest.pages)!==JSON.stringify(baseline.pages))throw Error('La note a changé pendant la préparation. Votre contenu actuel reste conservé. Réessayez.');
   for(const command of plan.command.commands)if(command.type==='partition-text-flow')command.expected=structuredClone(latest.objects.find(o=>o.id===command.id)!);
   if(!commit(plan.command))return;await paper.whenSaved();if(!current())return;
   // The common metadata effect publishes only after source reconciliation and
   // the scoped durable callback, including for page operations.
   if(plan.nextPageId)navigatePage(plan.nextPageId);else setSelected([]);paper.setNotice(operation.type==='remove-page'?'Page supprimée. Les autres pages sont conservées ; vous pouvez annuler.':'Pages déplacées avec leur texte et leurs annotations.');
  });}catch(error){if(current())paper.setNotice(String(error instanceof Error?error.message:error));}finally{if(current())setPageBusy(false);}
 };

 const getRepairDocument=async()=>{const captured=renderedOwner;await paper.whenSaved();if(!mounted.current||exportScope.current!==captured)return null;const current=paper.getCurrent();if(current)return current;const stored=await getDraft({...media,type:'whiteboard',documentId:notebookDocumentId(noteId)});if(!mounted.current||exportScope.current!==captured)return null;return stored&&stored.accountId===media.accountId&&stored.spaceId===media.spaceId&&isPaperDocument(stored.content)&&stored.content.noteId===noteId?stored.content:null;};
 const downloadRepairOriginal=media.api?async(need:LegacyImageDownloadNeed)=>{const api=media.api!,captured=renderedOwner,valid=()=>mounted.current&&exportScope.current===captured&&mediaApi.current===api;if(!valid()||need.accountId!==media.accountId||need.spaceId!==media.spaceId||!need.serverId)throw Error('La connexion de cette image a changé.');api.bindAccount(media.accountId);const blob=await api.downloadBlob(media.spaceId,need.serverId);if(!valid())throw Error('La connexion a changé pendant la récupération. Les originaux restent conservés.');return blob;}:undefined;
 const applyImageRepair=async(plan:PaperImageRepairPlan,version:PaperImageRepairVersion)=>{const captured=renderedOwner,current=()=>mounted.current&&exportScope.current===captured;if(readOnly||!current())throw Error('La note courante est en lecture seule ou a changé.');await runNotebookOperation(media.accountId,async()=>{flushText();await paper.whenSaved();if(!current())throw Error('La note courante a changé.');const {preparePaperImageRepair}=await import('../lib/paperImageRepair');let prepared:PreparedPaperImageRepair|undefined;if(paper.getCurrent())await paper.applyPrepared(async(_,valid)=>prepared=await preparePaperImageRepair({plan,version,current:()=>current()&&valid()}));else {prepared=await preparePaperImageRepair({plan,version,current});const {commitNotebookTransfer}=await import('../../pwa/src/storage');if(!current())return;await commitNotebookTransfer(prepared.commit,current);}if(!current()||!prepared)return;if(prepared.metadataChange){const change=prepared.metadataChange;const mirrored=await onChangeRef.current(change.afterMarkdown,{expectedMarkdown:change.beforeMarkdown});if(mirrored===false){await new Promise(resolve=>setTimeout(resolve,0));if(current()&&markdownRef.current!==change.afterMarkdown)throw Error('Le carnet est réparé et ses originaux sont conservés. Les métadonnées ont changé ; leur reprise attend la version courante pour préserver votre saisie.');}}if(current()){paper.retryOpen();paper.setNotice('Image réparée. Les versions originales restent conservées dans l’historique.');}});};
 const usePersonalTemplate=async(template:PersonalPaperTemplate)=>{const captured=renderedOwner,current=()=>mounted.current&&exportScope.current===captured;if(disabled||!current())return false;let first='';try{flushText();await paper.whenSaved();if(!current())throw Error('La note courante a changé.');await paper.applyPrepared(async(baseline,valid)=>{const {preparePaperPersonalTemplateUse}=await import('../lib/paperPersonalTemplates');const result=await preparePaperPersonalTemplateUse({template,document:baseline,media,current:()=>current()&&valid(),afterId:pageId});first=result.firstPageId;return result;});if(!current())return false;return navigatePage(first);}catch(error){if(current())paper.setNotice(String(error instanceof Error?error.message:error));return false;}};
 const useSticker=async(sticker:PersonalPaperSticker,stickerCurrent:()=>boolean)=>{const authority=pageViewAuthority.current,targetPage=pageId,current=()=>pageViewAuthority.current===authority&&pageViewLive()&&editableView.current.pageId===targetPage&&!disabled&&!presentationReadBlocked&&!presenting&&!printing;if(!current()||!stickerCurrent())return false;let ids:string[]=[],warnings:string[]=[];try{flushText();await paper.whenSaved();if(!current()||!stickerCurrent())return false;await paper.applyPrepared(async(baseline,valid)=>{const {preparePaperStickerUse}=await import('../lib/paperStickers');const plan=await preparePaperStickerUse({sticker,document:baseline,pageId:targetPage,media,current:()=>current()&&stickerCurrent()&&valid()});ids=plan.ids;warnings=plan.warnings;return plan;},()=>current()&&stickerCurrent());if(!current())return false;setSelected(ids);paper.setNotice(warnings.join(' ')||'Sticker inséré avec des identités indépendantes.');return true;}catch(error){if(current())paper.setNotice(error instanceof Error&&error.message?error.message:'Le sticker n’a pas été inséré. Ses originaux restent conservés.');return false;}};
 const repairImages=<PaperImageRepair key={exportScope.current} noteId={noteId} media={media} disabled={readOnly} getDocument={getRepairDocument} downloadOriginal={downloadRepairOriginal} onApply={applyImageRepair}/>;
 const restoreInterruptedInk=async(receipt:PaperInterruptedInkReceipt,points:InkPoint[],destination:'original'|'new-page')=>{
  const scope={accountId:media.accountId,spaceId:media.spaceId,noteId},valid=()=>pageViewLive()&&editable()&&mediaApi.current===media.api;
  if(!valid()||receipt.accountId!==scope.accountId||receipt.spaceId!==scope.spaceId||receipt.noteId!==noteId)throw Error('Le compte ou la note a changé. Le trait reste conservé.');
  await runNotebookOperation(scope.accountId,async()=>{
   cancelInputs();if(await editablePages.current?.flush()!==true)throw Error('Terminez la saisie en cours avant de récupérer le trait.');await paper.whenSaved();
   if(!valid())throw Error('La note a changé avant la restauration.');const baseline=paper.getCurrent();if(!baseline)throw Error('Ouvrez une note enregistrée avant de récupérer le trait.');
   const fresh=await readPaperInterruptedInk(scope,receipt.id,valid);
   if(fresh.receipt.state==='restored')return;
   if(!valid()||JSON.stringify(fresh.receipt)!==JSON.stringify(receipt)||JSON.stringify(fresh.points)!==JSON.stringify(points))throw Error('Le reçu du trait a changé. Relisez les traits récupérables.');
   const plan=planPaperInterruptedInkRestore(baseline,receipt,points,destination);
   if(!valid()||paper.getCurrent()!==baseline)throw Error('La note a changé pendant la préparation du trait.');
   if(plan.command)await paper.applyPrepared((document,active)=>preparePaperInkRecoveryCopy({document,receipt,points,destination,current:()=>valid()&&active()}));
   await paper.whenSaved();
   const unchanged=()=>valid()&&JSON.stringify(paper.getCurrent()?.objects.find(object=>object.id===plan.object.id))===JSON.stringify(plan.object);
   if(!unchanged())throw Error('Le trait ou la note a changé. La récupération reste disponible.');
   const proof=await getDraft({...scope,type:'whiteboard',documentId:notebookDocumentId(noteId)});
   if(!proof||!unchanged())throw Error('La copie enregistrée du trait a changé. Sa récupération reste disponible.');
   await markPaperInterruptedInkRestored(scope,receipt.id,plan.object,proof,unchanged);
   if(valid()){navigatePage(plan.pageId,[plan.object.id]);paper.setNotice('Le trait a été restauré. Son original reste conservé.');}
  });
 };
 // Keep the last committed viewport in its exact React/DOM position while a
 // replacement source opens. Moving a composing PM, even with moveBefore,
 // can collapse Chromium's native IME range while preserving its focus. Its
 // captured current() is already revoked; only the accepted old chain remains
 // admissible. The same viewport receives the new props after opening and
 // retains old TextEntry writers until their own preservation settles.
 // UI-only controls keep the same page/editor/audio tree mounted. Their
 // owner is independent of graph revisions; handlers bind the exact page/doc.
 const viewControls=usePaperNotebookControls({accountId:media.accountId,spaceId:media.spaceId,noteId,api:media.api,source:pageViewAuthority.current,context:readAloudSource,current:readAloudCurrent,visible,disabled:presentationReadBlocked||presenting||printing,
  actions:{search:()=>{clearSearchTarget();setSearchOpen(true);},print:openPrint,undo:()=>{if(editable()){cancelInputs();flushText();paper.travel('undo');setShapeProposal(null);setOriginalRestore(null);}},redo:()=>{if(editable()){cancelInputs();flushText();paper.travel('redo');setShapeProposal(null);setOriginalRestore(null);}},'previous-page':()=>{const index=doc!.pages.indexOf(page!);return index>0&&navigatePage(doc!.pages[index-1].id);},'next-page':()=>{const index=doc!.pages.indexOf(page!);return index>=0&&index<doc!.pages.length-1&&navigatePage(doc!.pages[index+1].id);},'tool-text':()=>activateTool('text'),'tool-pen':()=>activateTool('pen'),'tool-highlighter':()=>activateTool('highlighter'),'tool-eraser':()=>activateTool('eraser'),'tool-select':()=>activateTool('select')},
  available:action=>{if(action==='print')return !printing&&!presenting&&readPane.current===null;if(action==='undo')return editable()&&paper.canUndo;if(action==='redo')return editable()&&paper.canRedo;if(action==='previous-page')return !!doc&&!!page&&doc.pages.indexOf(page)>0;if(action==='next-page')return !!doc&&!!page&&doc.pages.indexOf(page)<doc.pages.length-1;if(action.startsWith('tool-')){const input=editablePages.current?.getController(editableView.current.pageId)?.getState();return editable()&&(!input||input.phase==='idle');}return true;},onFocusChange:focused=>{if(focused){setSearchOpen(false);setStudyOpen(false);}},onError:paper.setNotice});
 const {focusMode,setFocusMode}=viewControls;
 const retainedNotebook=useRef<ReactElement<{style?:CSSProperties;'aria-hidden'?:boolean}>|null>(null);
 let notebook:ReactElement<{style?:CSSProperties;'aria-hidden'?:boolean}>|null=null;
 useLayoutEffect(()=>{if(notebook){const retained=retainEditableViewport(notebook);if(isValidElement<{style?:CSSProperties;'aria-hidden'?:boolean}>(retained))retainedNotebook.current=retained;}});
 const renderedMobileReader=mobileReader.current;
 if(!doc||!page)return <><div key="notebook-opening" className="paper-opening"><p role="status">{paper.notice||'Ouverture de votre carnet…'}</p>{paper.blocked&&<><button type="button" onClick={paper.retryOpen}>Réessayer l’ouverture</button>{repairImages}</>}</div>{retainedNotebook.current&&cloneElement(retainedNotebook.current,{'aria-hidden':true,style:{...retainedNotebook.current.props.style,opacity:0,pointerEvents:'none'}})}</>;
 notebook=<div key="notebook-body" className={`paper-notebook ${smartHighlight?'is-smart-highlighting':''} ${toolPreferences.effective.dominantHand==='left'?'is-left-handed':''} ${focusMode?'is-focused':''} ${textOnly?'is-mobile-reading':''}`} onCompositionStartCapture={viewControls.onCompositionStartCapture} onCompositionEndCapture={viewControls.onCompositionEndCapture} onClick={event=>{const target=event.target as Element;if(target.closest('.paper-tool-popover button'))target.closest('details')?.removeAttribute('open');}} onKeyDown={event=>{if(!viewControls.canHandleKey(event))return;commandMenu.current?.handleKeyDown(event);if(viewControls.onKeyDown(event))return;const native=event.nativeEvent;if(paperNotebookShortcut({...event,isComposing:native.isComposing,keyCode:native.keyCode,altGraph:native.getModifierState('AltGraph')},paperNotebookShortcutEnvironment({target:event.target,composedPath:native.composedPath.bind(native)}))==='escape'&&viewControls.current(false)){clearSearchTarget();setSearchOpen(false);event.currentTarget.querySelectorAll('details.paper-tool-menu[open]').forEach(menu=>menu.removeAttribute('open'));}}}>
 <PaperMovableToolbox source={toolPreferences.source} current={toolPreferences.current} visible={visible} disabled={presenting||printing} canMove={()=>{const input=editablePages.current?.getController(editableView.current.pageId)?.getState();return !capture.current&&(!input||input.phase==='idle');}}><div className="paper-primary-tools">
 <button aria-label="Afficher les pages" aria-pressed={manager} onClick={()=>setManager(v=>!v)}><Layers/></button><span className="paper-tool-divider"/>
 {toolbarSlots.map(slot=><button key={slot.id} data-tool-slot={slot.id} title={`${paperToolSlotLabel(slot,toolPreferences.effective)} · ${slot.preset.width} pt`} aria-label={paperToolSlotLabel(slot,toolPreferences.effective)} disabled={disabled||toolPreferences.saving} aria-pressed={tool===slot.tool&&activeSlot.id===slot.id} className="paper-preset-tool" onClick={()=>{if(!editable())return;selectToolSlot(slot);if(slot.tool==='text'){const texts=objects.filter(o=>o.kind==='text'||o.kind==='sticky');const active=texts.find(o=>selected.includes(o.id))??texts[0];if(active)setSelected([active.id]);else addObject('text');}}}><PaperToolIcon tool={slot.tool}/>{['pen','pencil','calligraphy','highlighter'].includes(slot.tool)&&<i aria-hidden="true" style={{background:slot.preset.color,opacity:slot.preset.opacity}}/>}</button>)}
 {['pen','pencil','calligraphy','highlighter','eraser'].includes(tool)&&<>{tool!=='eraser'&&<label title="Couleur"><input type="color" aria-label="Couleur" value={color} disabled={toolPreferences.saving} onChange={e=>changeStyle({color:e.target.value})}/></label>}<select aria-label="Épaisseur" value={width} disabled={toolPreferences.saving} onChange={e=>changeStyle({width:Number(e.target.value)})}>{[...new Set([.5,1,2,3,5,8,12,14,20,width])].sort((a,b)=>a-b).map(w=><option key={w} value={w}>{w} pt</option>)}</select>{tool!=='eraser'&&<select aria-label="Style du trait" value={strokeStyle} disabled={toolPreferences.saving} onChange={e=>changeStyle({strokeStyle:e.target.value as PaperStrokeStyle})}><option value="solid">Continu</option><option value="dashed">Tirets</option><option value="dotted">Pointillés</option></select>}{tool==='eraser'?<label className="paper-option"><input type="checkbox" checked={wholeEraser} disabled={toolPreferences.saving} onChange={e=>changeStyle({wholeEraser:e.target.checked})}/>Trait entier</label>:<label className="paper-opacity-control" title="Opacité"> <input type="range" min="0" max="100" step="5" aria-label="Opacité de l’encre" value={Math.round(opacity*100)} disabled={toolPreferences.saving} onChange={e=>changeStyle({opacity:Number(e.target.value)/100})}/><span>{Math.round(opacity*100)} %</span></label>}</>}
 <span className="paper-tool-divider"/>
 </div><div className="paper-toolbox-history-actions"><button aria-label="Annuler" disabled={disabled||!paper.canUndo} onClick={()=>{if(!editable())return;cancelInputs();flushText();paper.travel('undo');setShapeProposal(null);setOriginalRestore(null);}}><Undo2/></button><button aria-label="Rétablir" disabled={disabled||!paper.canRedo} onClick={()=>{if(!editable())return;cancelInputs();flushText();paper.travel('redo');setShapeProposal(null);setOriginalRestore(null);}}><Redo2/></button></div><div className="paper-toolbar-actions"><PaperReadAloud document={doc} pageId={page.id} accountId={media.accountId} spaceId={media.spaceId} noteId={noteId} api={media.api} source={readAloudSource} current={readAloudCurrent} visible={visible} disabled={presentationReadBlocked||presenting||printing}/>{commandContext&&<PaperCommandMenu ref={commandMenu} context={commandContext} getCurrent={currentCommandContext} media={media} onCommit={commandCommit} onSelect={commandSelect} onPaste={commandPaste} onOpen={()=>{cancelInputs();flushText();}} onAudio={(anchor,target)=>{if(paperNotebookCommandTargetCurrent(target,currentCommandContext()))seekAudio(anchor);}} onNotice={paper.setNotice}/>}<PaperNotebookViewControls controls={viewControls}/><PaperToolSettings preferences={toolPreferences}/><details className="paper-tool-menu"><summary aria-label="Insérer dans la note"><Plus/><span>Insérer</span></summary><PaperToolboxPopover source={toolPreferences.source} current={toolPreferences.current} visible={visible}><button aria-label="Ajouter une zone de texte" disabled={disabled} onClick={()=>addObject('text')}><Type/>Zone de texte</button><button aria-label="Ajouter une image" disabled={disabled} onClick={()=>input.current?.click()}><ImagePlus/>Image</button><button aria-label="Ajouter un post-it" disabled={disabled} onClick={()=>addObject('sticky')}><StickyNote/>Post-it</button><select aria-label="Ajouter une forme" value="" disabled={disabled} onChange={e=>{if(e.target.value)addObject('shape',undefined,e.target.value as PaperObject['shape']);}}><option value="">Forme…</option><option value="rectangle">Rectangle</option><option value="ellipse">Ellipse</option><option value="line">Ligne</option><option value="arrow">Flèche</option></select>
 <button aria-label="Coller les objets copiés" disabled={disabled} onClick={()=>{const current=commandContext;if(current)void commandPaste(capturePaperNotebookCommandTarget(current));}}><ClipboardPaste/>Coller les objets copiés</button>
 <button aria-label="Importer un PDF" disabled={disabled||importBusy} onClick={()=>openImportFile('pdf')}><Layers/>Importer un PDF</button><input ref={pdfInput} type="file" hidden aria-label="PDF à importer" accept="application/pdf" onChange={e=>{const f=e.target.files?.[0];e.target.value='';acceptImportFile('pdf',f);}}/><button aria-label="Importer une archive Dowze" disabled={disabled||importBusy} onClick={()=>openImportFile('archive')}><Upload/>Importer une archive</button><input ref={archiveInput} type="file" hidden aria-label="Archive Dowze à importer" accept=".dowze,application/zip" onChange={e=>{const f=e.target.files?.[0];e.target.value='';acceptImportFile('archive',f);}}/></PaperToolboxPopover></details>{repairImages}<details className="paper-tool-menu paper-more-tools"><summary aria-label="Options de la note"><MoreHorizontal/><span>Autres outils</span></summary><PaperToolboxPopover source={toolPreferences.source} current={toolPreferences.current} visible={visible}><button aria-label="Traits récupérables" title="Retrouver un trait interrompu" aria-pressed={inkRecoveryOpen} onClick={()=>setInkRecoveryOpen(value=>!value)}><History/>Traits récupérables</button><button aria-label="Présenter la note" title="Présenter uniquement les pages de cette note" disabled={presentationReadBlocked||presenting||printing||!visible} onClick={()=>void openPresentation()}><Presentation/>Présenter la note</button><button aria-label="Mesurer une longueur ou une surface" title="Mesures et calibration de la page" aria-pressed={measurementsOpen} disabled={disabled} onClick={()=>{if(!editable())return;cancelInputs();flushText();if(!editable())return;setMeasurementsOpen(value=>!value);setTextOnly(false);setSmartHighlight(false);setLoupeOpen(false);setAidsOpen(false);setTool('select');setSelected([]);}}><Ruler/>Mesures et calibration</button><button aria-label="Surlignage guidé du texte" aria-pressed={smartHighlight} disabled={disabled||textOnly} onClick={()=>{if(!editable())return;cancelInputs();setSelected([]);setSmartHighlight(value=>!value);setLoupeOpen(false);}}><Highlighter/>Surlignage guidé du texte</button><button aria-label="Loupe d’écriture" aria-pressed={loupeOpen} disabled={disabled||textOnly||!aids.ready} onClick={()=>{if(!editable())return;cancelInputs();setLoupeOpen(value=>!value);if(tool==='text'||tool==='select')activateTool('pen');}}><ZoomIn/>Loupe d’écriture</button><button aria-label="Règle et maintien" aria-pressed={aidsOpen} disabled={disabled||textOnly||!aids.ready} onClick={()=>{if(editable())setAidsOpen(value=>!value);}}><Move/>Règle et maintien</button><button aria-label="Rechercher dans la note" aria-pressed={searchOpen} onClick={()=>{clearSearchTarget();setSearchOpen(v=>!v);}}><Search/>Rechercher dans la note</button><button aria-label="Réviser la note" aria-pressed={studyOpen} onClick={()=>setStudyOpen(v=>!v)}><BookOpenCheck/>Réviser la note</button><button aria-label="Importations à reprendre" aria-pressed={importRecoveryOpen} onClick={()=>setImportRecoveryOpen(value=>!value)}><Upload/>Importations à reprendre</button><button aria-label="Historique des versions" onClick={()=>void openHistory()}><History/>Historique des versions</button><button aria-label="Imprimer le carnet complet" disabled={presentationReadBlocked||presenting||printing||!visible} onClick={()=>void openPrint()}><Printer/>Imprimer le carnet complet</button><select aria-label="Exporter la note ou la page" value="" disabled={exportBusy} onChange={e=>{const format=e.target.value;if(format)void renderExport(format as 'pdf'|'png'|'jpeg');}}><option value="">Exporter…</option><option value="pdf">Note complète en PDF</option><option value="png">Page en PNG</option><option value="jpeg">Page en JPEG</option></select><button aria-label="Exporter l’archive complète" disabled={exportBusy} onClick={()=>void exportBundle()}><Download/>Archive complète</button>
 <label className="paper-option"><input type="checkbox" checked={fingerInk} onChange={e=>void toolPreferences.change({type:'set-input',fingerInk:e.target.checked})}/>Dessiner au doigt</label><label className="paper-option"><input type="checkbox" checked={textOnly} disabled={mobileOpening||presentationReadBlocked||presenting||printing||!visible} onChange={e=>{if(e.target.checked)void openMobileReading();else closeMobileReading();}}/>Lecture mobile</label>
 <input ref={input} type="file" hidden aria-label="Image du carnet" accept="image/png,image/jpeg,image/gif,image/webp" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void uploadImage(f);}}/>
 </PaperToolboxPopover></details></div></PaperMovableToolbox>
 {paper.blocked&&<section className="paper-conflict" aria-label="Résoudre les versions de la note"><strong>Vos modifications sont conservées.</strong><p>Cette note a changé ailleurs. Comparez les versions avant de poursuivre ; les originaux restent dans la récupération.</p><button disabled={paper.resolving} onClick={()=>void paper.loadResolution()}>{paper.resolving?'Chargement…':'Comparer les versions'}</button>{paper.resolution&&<>{paper.resolution.alternatives&&paper.resolution.alternatives.length>1&&<label>Contribution à comparer<select aria-label="Contribution à comparer" value={paper.resolution.selected} onChange={event=>paper.selectResolutionVersion(event.target.value)}>{paper.resolution.alternatives.map((item,index)=><option key={item.id} value={item.id}>Version reçue {index+1} · {item.content.pages.length} pages</option>)}</select></label>}<div className="paper-conflict-versions"><div><h3>Sur cet appareil</h3><p>Version {doc.revision} · {doc.pages.length} pages</p><p>{doc.objects.find(o=>o.markdown)?.markdown?.slice(0,240)||'Dessins et pièces jointes'}</p></div><div><h3>{media.api?'Sur le serveur':'Copie enregistrée'}</h3><p>{paper.resolution.remote?`Version ${paper.resolution.remote.revision} · ${paper.resolution.remote.pages.length} pages`:'Note supprimée sur le serveur'}</p><p>{paper.resolution.remote?.objects.find(o=>o.markdown)?.markdown?.slice(0,240)}</p></div></div><div className="paper-conflict-actions"><button disabled={paper.resolving} onClick={()=>void paper.resolve('both')}>Conserver les deux dans la note</button><button disabled={paper.resolving} onClick={()=>void paper.resolve('local')}>Utiliser ma version</button><button disabled={paper.resolving||!paper.resolution.remote} onClick={()=>void paper.resolve('server')}>Utiliser {media.api?'la version serveur':'la copie enregistrée'}</button></div></>}</section>}
 {exportPreview&&<section className="paper-export-preview" aria-label="Export prêt"><header><strong>Export {exportPreview.format.toUpperCase()}</strong><span className="paper-export-size">{exportPreview.blob.size>=1024*1024?`${(exportPreview.blob.size/(1024*1024)).toFixed(1)} Mo`:`${Math.max(1,Math.ceil(exportPreview.blob.size/1024))} Ko`}</span><a href={exportPreview.url} download={exportName(exportPreview.format)}>Télécharger l’export</a><button onClick={savePreview}>Enregistrer</button><button onClick={()=>setExportPreview(null)}>Fermer</button></header>{exportPreview.format!=='pdf'&&exportPreview.format!=='archive'&&<img src={exportPreview.url} alt="Aperçu de la page exportée"/>}</section>}
 {inkRecoveryOpen&&<PaperInterruptedInkPanel key={`${renderedOwner}|${pageViewGeneration}`} scope={{accountId:media.accountId,spaceId:media.spaceId,noteId}} current={pageViewLive} getDocument={paper.getCurrent} disabled={disabled} isPending={id=>editablePages.current?.isInkRecoveryPending(id)===true} onRestore={restoreInterruptedInk} onClose={()=>setInkRecoveryOpen(false)}/>}
 {importRecoveryOpen&&<PaperImportRecoveryPanel key={importScopeKey} current={pageViewLive} disabled={disabled||importBusy} load={loadPendingImports} onResume={(kind,id)=>resumeImport(kind,id)} onOriginal={saveImportOriginal} onClose={()=>setImportRecoveryOpen(false)}/>}
 {historyOpen&&<section className="paper-history" aria-label="Versions de récupération" aria-busy={historyCopyActivity===pageViewAuthority.current}><header><strong>Versions sur cet appareil</strong><button onClick={closeHistory}>Fermer</button></header>{versions.length?versions.map((selection,index)=><div key={index}><span>Version {selection.document.revision} · {new Intl.DateTimeFormat('fr-CH',{dateStyle:'short',timeStyle:'short'}).format(new Date(selection.document.updatedAt))}</span><button disabled={disabled||!onRestoreVersion||historyCopyActivity===pageViewAuthority.current} onClick={()=>void restoreHistoryCopy(selection)}>Restaurer une copie</button></div>):<p>Aucune version précédente enregistrée sur cet appareil.</p>}<small>La restauration crée une nouvelle note. Cette note et ses versions restent intactes.</small></section>}
 <div className="paper-flow-toolbar-slot milkdown"/>
 <Suspense fallback={null}><PaperAudioControls ref={audioReadGuard} readPaneActive={()=>readPane.current!==null} requestedSeek={audioSeek} document={doc} media={media} disabled={disabled} onCommit={commit} getCurrentDocument={paper.getCurrent} onRecordingCommit={(input,valid)=>{if(!editable()||valid&&!valid())return false;flushText();if(!editable()||valid&&!valid())return false;const baseline=paper.getCurrent();if(!baseline)return false;const command=typeof input==='function'?input(baseline):input;if(!command||paper.getCurrent()!==baseline||!editable()||valid&&!valid())return false;return paper.recordingCommand(command);}} whenSaved={paper.whenSaved} onNotice={paper.setNotice}/></Suspense>
 {smartHighlight&&objects.some(o=>o.kind==='text'||o.kind==='sticky')&&<PaperTextHighlightPanel key={`${renderedOwner}|${inkEpoch}|${doc.revision}`} choices={objects.filter(o=>o.kind==='text'||o.kind==='sticky').map(paperHighlightChoice)} selection={smart.selection?.kind==='text'?smart.selection:null} color={smart.color} disabled={disabled} onColor={smart.setColor} onChoose={smart.choose} onRange={smart.range} onApply={smart.apply} onClear={smart.clear} onClose={()=>{if(mounted.current&&exportScope.current===renderedOwner&&editableView.current.epoch===inkEpoch)setSmartHighlight(false);}}/>}<div className="paper-work-area">{searchOpen&&<PaperSearchPanel document={doc} initialQuery={searchSeed.query} requestId={searchSeed.requestId} onQueryChange={clearSearchTarget} onNavigate={hit=>{if(beginSearch(hit)&&innerWidth<=700)setSearchOpen(false);}} onClose={()=>{clearSearchTarget();setSearchOpen(false);}}/>}
 {measurementsOpen&&!textOnly&&<PaperMeasurementControls key={renderedOwner} media={media} ownerKey={renderedOwner} generation={inkEpoch} document={doc} page={page} current={editable} getCurrent={paper.getCurrent} onCommit={commit} onNotice={paper.setNotice} surfaceRef={svg} getContext={inkContext} disabled={disabled} onClose={()=>{if(pdfViewCurrent())setMeasurementsOpen(false);}}/>}{manager&&<aside ref={pageList} className="paper-pages" aria-label="Pages de la note"><div className="paper-pages-navigation"><header><strong>{doc.pages.length} page{doc.pages.length>1?'s':''}</strong><button aria-label="Ajouter une page" disabled={disabled} onClick={()=>{const p=inheritedBlankPage(page);if(commit({type:'insert-page',page:p,afterId:page.id}))navigatePage(p.id);}}><Plus/></button></header><form className="paper-page-jump" onSubmit={event=>{event.preventDefault();const n=Number(pageNumber);if(Number.isSafeInteger(n)&&n>=1&&n<=doc.pages.length)navigatePage(doc.pages[n-1].id);}}><input type="number" min="1" max={doc.pages.length} aria-label="Aller à la page" value={pageNumber} onChange={e=>setPageNumber(e.target.value)}/><button type="submit">Aller</button></form><select aria-label="Filtrer les pages" value={pageFilter} onChange={e=>setPageFilter(e.target.value as typeof pageFilter)}><option value="all">Toutes les pages</option><option value="bookmarks">Signets</option><option value="pdf">Pages PDF</option><option value="content">Avec contenu</option></select></div>{!filteredPages.length&&<p>Aucune page dans ce filtre.</p>}{filteredPages.map(p=>{const i=doc.pages.findIndex(item=>item.id===p.id);return <div key={p.id} data-page-entry={p.id} className={page.id===p.id?'paper-page-entry active':'paper-page-entry'}><button className="paper-thumbnail" aria-label={`Ouvrir la page ${i+1}`} aria-pressed={page.id===p.id} onClick={()=>{navigatePage(p.id);}}><PaperPagePreview document={doc} page={p} media={media}/><span>{p.bookmark?'★ ':''}{i+1}</span></button><div><button aria-label={`Déplacer la page ${i+1} vers le haut`} disabled={disabled||pageBusy||i===0} onClick={()=>{const ids=doc.pages.map(p=>p.id);[ids[i-1],ids[i]]=[ids[i],ids[i-1]];void modifyPages({type:'reorder-pages',ids});}}><ChevronLeft/></button><button aria-label={`Déplacer la page ${i+1} vers le bas`} disabled={disabled||pageBusy||i===doc.pages.length-1} onClick={()=>{const ids=doc.pages.map(p=>p.id);[ids[i],ids[i+1]]=[ids[i+1],ids[i]];void modifyPages({type:'reorder-pages',ids});}}><ChevronRight/></button></div></div>;})}
 <select aria-label="Papier de la page" value={page.pattern} disabled={disabled} onChange={e=>commit({type:'update-page',page:{...page,pattern:e.target.value as PaperPage['pattern']}})}><option value="plain">Uni</option><option value="ruled">Ligné</option><option value="grid">Quadrillé</option><option value="dots">Pointillé</option></select>
 <Suspense fallback={<p>Ouverture des stickers…</p>}><PaperStickers document={doc} pageId={page.id} selectedIds={selected} media={media} source={readAloudSource} current={readAloudCurrent} disabled={disabled||pageBusy} onUse={useSticker} onNotice={paper.setNotice}/></Suspense>
 <PaperPageSettings key={page.id} document={doc} page={page} disabled={disabled} onCommit={commit} onNotice={paper.setNotice}/><Suspense fallback={<p>Ouverture des modèles…</p>}><PaperPersonalTemplates document={doc} pageId={page.id} media={media} generation={pageViewGeneration} disabled={disabled||pageBusy} onUse={usePersonalTemplate} onNotice={paper.setNotice} onExport={(blob,name,sourceCurrent)=>{const authority=pageViewAuthority.current;return savePaperExport(blob,name,'template',()=>pageViewLive()&&pageViewAuthority.current===authority&&sourceCurrent());}}/></Suspense>
 {page.pdf&&<button aria-pressed={pdfOutline} onClick={()=>setPdfOutline(v=>!v)}>Sommaire PDF</button>}
 <label className="paper-option">Papier<input type="color" aria-label="Couleur du papier" value={page.color} disabled={disabled} onChange={e=>commit({type:'update-page',page:{...page,color:e.target.value}})}/></label>
 <button aria-label="Tourner la page vers la droite" disabled={disabled} onClick={()=>commit(rotatePaperPage(doc,page.id,1))}><RotateCw/>Tourner</button>
 <button disabled={disabled} onClick={()=>commit({type:'update-page',page:{...page,bookmark:!page.bookmark}})}><Bookmark/>{page.bookmark?'Retirer le signet':'Marquer la page'}</button><button disabled={disabled||pageBusy} onClick={()=>void duplicatePage()}><Copy/>Dupliquer</button><button disabled={disabled||pageBusy||doc.pages.length===1} onClick={()=>void modifyPages({type:'remove-page',id:page.id})}><Trash2/>Supprimer la page</button></aside>}
 {pdfOutline&&page.pdf&&doc.assets.find(a=>a.id===page.pdf!.assetId)&&<PaperPdfOutline asset={doc.assets.find(a=>a.id===page.pdf!.assetId)!} media={media} onPage={goPdfPage} onClose={()=>setPdfOutline(false)}/>}
 {textOnly&&renderedMobileReader&&<PaperMobileReadView key={`${renderedOwner}|${pageViewGeneration}`} document={doc} media={media} current={()=>mobileReader.current===renderedMobileReader&&renderedMobileReader.entered&&renderedMobileReader.current()&&paper.getCurrent()===doc} onReturn={()=>{if(mobileReader.current===renderedMobileReader)closeMobileReading();}} onPage={id=>{if(mobileReader.current===renderedMobileReader)closeMobileReading(id);}} onAudio={anchor=>{if(mobileReader.current===renderedMobileReader&&renderedMobileReader.current())seekAudio(anchor);}} onRetire={()=>retireMobileReader(renderedMobileReader)}/>}
 <div className={`paper-viewport paper-multipage-viewport${textOnly?' is-text-only':''}`} hidden={textOnly} aria-hidden={textOnly||undefined} inert={textOnly} ref={viewport} onContextMenu={event=>commandMenu.current?.handleContextMenu(event)} onPointerUp={event=>{if(smartHighlight&&!(event.target as Element).closest('button,input,textarea,select,.paper-pdf-text-selection'))smart.deferNative();}} onKeyUp={event=>{if(smartHighlight&&event.shiftKey)smart.deferNative();}}>
 {selected.length>0&&!disabled&&tool==='select'&&<PaperSelectionTools document={doc} objects={objects} selected={selected} media={media} pageId={page.id} onCommit={value=>commandContext?commandCommit(value,capturePaperNotebookCommandTarget(commandContext)):false} onSelect={ids=>{if(commandContext)commandSelect(ids,capturePaperNotebookCommandTarget(commandContext));}} onCommand={selectionCommand} onNotice={paper.setNotice}/>}
 <PaperEditableNotebookViewport ref={editablePages} document={doc} paper={paper} media={media} ownerKey={renderedOwner} generation={pageViewGeneration} current={pageViewLive} authorityReady={()=>mounted.current} writable={!disabled&&!textOnly} textInteractionDisabled={smartHighlight||textOnly} mode={pageViewMode} zoom={zoom} selectedPageId={page.id} selected={selected} intent={tool==='text'||smartHighlight||textOnly?null:tool} style={{color,width,opacity,strokeStyle}} wholeEraser={wholeEraser} fingerInk={fingerInk} correction={correctionOptions} onNotice={paper.setNotice}
 onCanonicalLayout={searchLayoutAccepted} onSelect={(target,ids)=>{if(!pageViewLive())return;setPageId(target);setSelected(ids);}} onTool={intent=>{if(pageViewLive())activateTool(intent??'text');}} onAuthored={authored} onZoom={value=>{if(pageViewLive()){manualZoom.current=true;setZoom(value);}}}
 onPageContact={loupeOpen?(target,point)=>{if(!pageViewLive())return true;if(target===page.id)loupe.current?.reposition(point.x,point.y);else{pendingLoupePosition.current={authority:pageViewAuthority.current,pageId:target,...point};if(!navigatePage(target))pendingLoupePosition.current=null;}return true;}:undefined}
 onInkCorrection={(source,original,expected,current)=>{const owner=loupeOwner();if(!pageViewLive()||!source.current()||!owner||owner.pageId!==source.pageId||paper.getCurrent()!==current)return;const result=source.corrected;if(!result||result.cancelled)return;if(result.correction!=='none'&&JSON.stringify(result.points)!==JSON.stringify(original.points))setOriginalRestore({original,expected,revision:current.revision,owner});if(result.candidate&&result.candidate.kind!=='line')setShapeProposal({candidate:result.candidate,original,expected,revision:current.revision,owner});}}
 onUploadImage={async(file,current)=>runNotebookOperation(media.accountId,async()=>{if(!current())throw Error('Le carnet a changé.');await paper.whenSaved();if(!current())throw Error('Le carnet a changé.');return paper.attachImage(file,file.name,current);})}
 pdfOptions={target=>({searchRequest:activePdfSearch?.hit.pageId===target?activePdfSearch:undefined,linksEnabled:tool==='text'&&!smartHighlight,textSelectionEnabled:smartHighlight&&!textOnly&&!disabled&&target===page.id,onSelectionChange:smart.pdfSelection,onHighlight:smart.pdfHighlight,onNavigate:number=>{const source=paper.getCurrent()?.pages.find(value=>value.id===target),destination=paper.getCurrent()?.pages.find(value=>value.pdf?.assetId===source?.pdf?.assetId&&value.pdf?.pageNumber===number);if(destination)navigatePage(destination.id);}})} onAudio={seekAudio}
 onEraserDone={()=>{const previous=eraserReturn.current.afterStroke({intent:'eraser',cancelled:false,enabled:toolPreferences.effective.returnToPen===true,activeSlot,toolbar:toolbarSlots}),slot=toolbarSlots.find(slot=>slot.id===previous);if(slot)selectToolSlot(slot);}}
 onSurface={(target,controller)=>{if(target===editableView.current.pageId){svg.current=controller?.svgRef.current??null;inkPreview.current=controller?.previewRef.current??null;}}}
 renderOverlay={(target,controller,current)=>target===page.id?<>
 {loupeRegion&&samePaperWritingLoupeOwner(loupeRegion.owner,loupeOwner())&&<PaperWritingLoupeTarget region={loupeRegion.region}/>}
 {effectiveGuide.enabled&&inkContext()&&<PaperDrawingGuide key={`${renderedOwner}|${inkEpoch}`} guide={effectiveGuide} context={inkContext()!} disabled={disabled} onChange={updateGuide}/>}
 {smartHighlight&&smart.selection&&smart.selection.fragments.map((fragment,index)=><polygon key={index} points={fragment.quad.map(point=>`${point.x},${point.y}`).join(' ')} fill={smart.color} opacity=".25" stroke="#987500" strokeWidth=".5"/>)}
 </>:null}/>
 </div>{studyOpen&&<Suspense fallback={<p>Ouverture des révisions…</p>}><PaperStudyPanel document={doc} media={media} disabled={disabled} onCommit={commit} onPage={id=>{navigatePage(id);}} onClose={()=>setStudyOpen(false)} onNotice={paper.setNotice}/></Suspense>}</div>
 {aidsOpen&&!textOnly&&<div className="paper-writing-aids-panel"><header><strong>Règle et maintien</strong><button type="button" aria-label="Fermer règle et maintien" onClick={()=>{if(editable())setAidsOpen(false);}}>×</button></header><PaperDrawingGuideControls key={`${renderedOwner}|${inkEpoch}`} guide={effectiveGuide} hold={aids.value.hold} pageWidth={page.width} pageHeight={page.height} context={inkContext()??undefined} disabled={disabled||!aids.ready} onOpenMeasurements={()=>{if(!editable())return;cancelInputs();flushText();if(!editable())return;setAidsOpen(false);setMeasurementsOpen(true);setTextOnly(false);setSmartHighlight(false);setLoupeOpen(false);setSelected([]);setTool('select');}} onGuideChange={updateGuide} onHoldChange={updateHold} candidate={shapeProposal?.candidate} onAcceptShape={shapeProposal?applyProposal:undefined} onRestoreOriginal={originalRestore?restoreOriginal:undefined}/></div>}
 {loupeOpen&&!textOnly&&<PaperWritingLoupe key={`${renderedOwner}|${inkEpoch}`} ref={loupe} document={doc} page={page} media={media} ownershipKey={renderedOwner} generation={inkEpoch} currentOwner={loupeOwner} tool={tool==='text'?'pen':tool} style={{color,width,opacity,strokeStyle}} fingerInk={fingerInk} disabled={disabled} initialZoom={aids.value.loupe.zoom} options={aids.value.loupe.options} onOptionsChange={options=>{if(editable())void aids.change({loupe:{options}});}} onZoomChange={zoom=>{if(editable())void aids.change({loupe:{zoom}});}} previewStroke={previewLoupe} renderOverlay={context=>effectiveGuide.enabled?<PaperDrawingGuide guide={effectiveGuide} context={context} disabled={disabled} onChange={updateGuide}/>:null} onInputCancel={()=>{if(correctionSource.current==='loupe'){correction.current.cancel();correctionSource.current=null;}}} onStroke={finishLoupe} onPreview={(stroke,style)=>{if(editable())inkPreview.current?.paint(stroke,style);}} onRegionChange={(region,owner)=>{if(owner.ownershipKey!==renderedOwner||exportScope.current!==renderedOwner||owner.generation!==inkEpoch)return;setLoupeRegion(region?{region,owner}:null);}} onUndo={()=>{if(editable()){cancelInputs();flushText();paper.travel('undo');}}} onRedo={()=>{if(editable()){cancelInputs();flushText();paper.travel('redo');}}} canUndo={paper.canUndo} canRedo={paper.canRedo} onClose={()=>{if(editable()){setLoupeOpen(false);setLoupeRegion(null);}}}/>}
 {presenting&&presentation?.snapshot&&<PaperPresentation key={`${renderedOwner}|${presentation.id}`} document={presentation.snapshot} pageId={presentation.pageId} media={media} ownerKey={renderedOwner} current={()=>presentationRequest.current===presentation.id&&presentationOwnerCurrent(presentation.epoch)&&paper.getCurrent()===presentation.baseline} focusCurrent={()=>presentationOwnerCurrent(presentation.epoch)} onClose={()=>closePresentation(presentation.id)}/>}
 {presenting&&!presentation?.snapshot&&<div className="paper-opening" role="status">Préparation de la présentation…<button type="button" onClick={()=>presentation&&closePresentation(presentation.id)}>Annuler</button></div>}
 {eraseActivity?.owner===renderedOwner&&<div className="paper-print-preparing paper-erase-progress" role="status"><span>Effacement en cours…</span><button type="button" aria-label="Annuler l’effacement en cours" onClick={cancelInputs}>Annuler</button></div>}
 {printing&&printState&&!printState.prepared&&<div className="paper-print-preparing" role="status"><span>Préparation du carnet complet{printState.progress?` · ${printState.progress.done} / ${printState.progress.total} pages`:''}…</span><button type="button" aria-label="Annuler la préparation de l’impression" onClick={()=>closePrint(printState.id)}>Annuler</button></div>}
 {printing&&printState?.prepared&&<PaperPrintPreview key={`${renderedOwner}|${printState.id}`} prepared={printState.prepared} media={media} ownerKey={renderedOwner} generation={printState.epoch} current={()=>printRequest.current===printState.id&&presentationOwnerCurrent(printState.epoch)} getCurrent={paper.getCurrent} readOnly={readOnly} focusCurrent={()=>presentationOwnerCurrent(printState.epoch)} onClose={()=>closePrint(printState.id)}/>}
 <footer className="paper-status"><PaperWorkTimer key={renderedOwner} accountId={media.accountId} spaceId={media.spaceId} noteId={noteId} visible={visible} current={()=>mounted.current&&exportScope.current===renderedOwner}/><span role="status">{paper.notice||aids.notice||toolPreferences.notice|| (paper.saved?'Enregistrée sur cet appareil':'Enregistrement…')}</span><div><select aria-label="Affichage des pages" value={pageViewMode} onChange={event=>{cancelInputs();setPageViewMode(event.target.value as typeof pageViewMode);}}><option value="single">Une page</option><option value="continuous">Pages en continu</option></select><button aria-label="Réduire le zoom" disabled={zoom<=0.4} onClick={()=>{cancelInputs();manualZoom.current=true;setZoom(z=>Math.max(0.3,z-0.1));}}><ZoomOut/></button><button aria-label="Ajuster à la largeur" onClick={()=>{cancelInputs();manualZoom.current=false;if(viewport.current)setZoom(Math.max(0.3,Math.min(1.5,(viewport.current.clientWidth-(parseFloat(getComputedStyle(viewport.current).paddingLeft)||0)-(parseFloat(getComputedStyle(viewport.current).paddingRight)||0)-1)/page.width)));}}> {Math.round(zoom*100)} % </button><button aria-label="Augmenter le zoom" disabled={zoom>=2} onClick={()=>{cancelInputs();manualZoom.current=true;setZoom(z=>Math.min(2,z+0.1));}}><ZoomIn/></button><span>Page {doc.pages.indexOf(page)+1} / {doc.pages.length}</span></div></footer>
 </div>;
 return <>{null}{notebook}</>;
}
