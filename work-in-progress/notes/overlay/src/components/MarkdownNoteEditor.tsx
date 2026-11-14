import {registerNotebookWriter} from '../lib/notebookSession';
import {configurePaperTextStyles,type PaperTextStyleEditor} from '../lib/paperTextStyleEditor';
import './paper-text-style.css';
import {paperTextCaretY} from '../lib/paperTextCaret';
import {paperImageDimensions,paperImageAvailableWidth,paperImageFrameHeight,paperImageRatioMarker} from '../lib/paperImageSizing';
import {paperCodeView} from '../lib/paperCodeView';
import {paperCodeDecorations} from '../lib/paperCodeDecorations';
import {mapPaperEditorSearchRange} from '../lib/paperEditorSearch';
import {createPaperEditorSearchPlugin,paperEditorSearchTransaction} from '../lib/paperEditorSearchPlugin';
import {resolvePaperSearchHit} from '../lib/paperSearch';
import type {PaperSearchNavigationRequest} from '../lib/notebookSearchNavigation';
import type {PaperDocument} from '../lib/notebookDocument';
import {putSnapshot} from '../../pwa/src/storage';
import "./studio-tools.css";
import {createRoot, type Root} from "react-dom/client";
import {remotePaperEditorTransaction} from '../lib/paperEditorTransaction';
import {insert} from "@milkdown/kit/utils";
import {editorViewCtx,parserCtx,editorViewTimerCtx,nodeViewCtx,type Editor} from "@milkdown/kit/core";
import {headingIdGenerator} from '@milkdown/kit/preset/commonmark';
import {createTimer,type MilkdownPlugin} from '@milkdown/kit/ctx';
import {$remark,$prose} from '@milkdown/kit/utils';
import {Plugin} from '@milkdown/kit/prose/state';
import {createPaperTextWriter,type PaperTextWriter,type PaperTextWriterSource,type PaperTextWriterActivity} from '../lib/paperTextWriter';
import {createPaperEditorInputGate,type PaperEditorInputEvent} from '../lib/paperEditorInputGate';
import {imageBlockSchema,imageBlockConfig} from '@milkdown/kit/component/image-block';
import type {NodeViewConstructor} from '@milkdown/kit/prose/view';
import {notePhotoPlugins} from "./NotePhotoNode";
import {NotePaperTools,type PaperTools} from "./NotePaperTools";
import type {NotebookMediaScope} from "./NotebookEditor";
import { Crepe } from "@milkdown/crepe";
import { AlertCircle, LoaderCircle } from "lucide-react";
import { forwardRef,useImperativeHandle,useEffect, useLayoutEffect, useRef, useState } from "react";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import "katex/dist/katex.min.css";

const AUTOSAVE_DELAY_MS = 300;
const MAX_EMBEDDED_IMAGE_BYTES = 350_000;
const MAX_NOTE_MARKDOWN_CHARACTERS = 1_500_000;
const EMBEDDED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp"
]);

const imageRatio=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=10000?value:1;
/** Installed Crepe stores its resize ratio in Markdown alt. Keep a real alt,
 * title and independent size metadata; ordinary text edits never manufacture 1.00. */
export function configureNotebookImageBlocks(editor:Editor,current:()=>boolean=()=>true){
 editor.config(ctx=>ctx.update(imageBlockSchema.key,previous=>schemaContext=>{
  const base=previous(schemaContext);return {...base,attrs:{...base.attrs,alt:{default:''},title:{default:null},sourceCaption:{default:''},ratioPresent:{default:false}},
   parseDOM:[{tag:'img[data-type="image-block"]',getAttrs:dom=>{const image=dom as HTMLElement,title=image.getAttribute('title'),alt=image.getAttribute('alt')??'',ratio=imageRatio(Number(image.getAttribute('data-dowze-ratio')??1));return {src:image.getAttribute('src')??'',alt,title,caption:title??'',sourceCaption:title??'',ratio,ratioPresent:image.hasAttribute('data-dowze-ratio')};}}],
   toDOM:node=>['img',{'data-type':'image-block',src:node.attrs.src,alt:node.attrs.alt,title:node.attrs.caption!==node.attrs.sourceCaption?node.attrs.caption||null:node.attrs.title,'data-dowze-ratio':node.attrs.ratio}],
   parseMarkdown:{match:base.parseMarkdown.match,runner:(state,node,type)=>{const alt=typeof node.alt==='string'?node.alt:'',title=typeof node.title==='string'?node.title:null,ratio=imageRatio(node.dowzeImageRatio);state.addNode(type,{src:node.url,alt,title,caption:title??'',sourceCaption:title??'',ratio,ratioPresent:node.dowzeImageRatio!==undefined});}},
   toMarkdown:{match:base.toMarkdown.match,runner:(state,node)=>{const ratio=imageRatio(node.attrs.ratio),alt=node.attrs.alt,title=node.attrs.caption!==node.attrs.sourceCaption?node.attrs.caption||null:node.attrs.title;state.openNode('paragraph');state.addNode('image',undefined,undefined,{url:node.attrs.src,alt,title});state.closeNode();if(ratio!==1||node.attrs.ratioPresent)state.addNode('html',undefined,`<!-- dowze-image-size:v1 ratio=${ratio} -->`);}}
  };
 }));
 const metadata=$remark('dowze-image-size',()=>()=> (tree:any)=>{
  const walk=(parent:any)=>{if(!Array.isArray(parent.children))return;for(let i=0;i<parent.children.length;i++){
   const block=parent.children[i],image=block.type==='paragraph'&&block.children?.length===1&&block.children[0].type==='image'?block.children[0]:block,following=parent.children[i+1],next=following?.type==='paragraph'&&following.children?.length===1&&following.children[0].type==='html'?following.children[0]:following,ratio=next?.type==='html'?paperImageRatioMarker(next.value):undefined;
   if((block.type==='image-block'||block.type==='paragraph'&&block.children?.length===1)&&['image','image-block'].includes(image.type)&&ratio!==undefined){
    // Crepe installs its image remark feature lazily. Normalize this one image
    // here so its later transform cannot discard our independent size field.
    parent.children[i]={...image,type:'image-block',dowzeImageRatio:ratio};parent.children.splice(i+1,1);
   }else walk(block);
  }};walk(tree);
 });
 const imageView:MilkdownPlugin=ctx=>{const ready=createTimer('NotebookImageViewReady'),preceding=[...ctx.get(editorViewTimerCtx)];ctx.record(ready);ctx.update(editorViewTimerCtx,timers=>[...timers,ready]);return async()=>{await Promise.all(preceding.map(timer=>ctx.wait(timer)));const config=ctx.get(imageBlockConfig.key);
  const constructor:NodeViewConstructor=(initial,view,getPos)=>{
   let alive=true,node=initial,resize:{id:number;start:number;x:number;angle:number;scale:number;base:number;ratio:number;height:number;nextRatio:number}|null=null;
   const dom=document.createElement('div'),wrapper=document.createElement('div'),image=document.createElement('img'),operations=document.createElement('div'),settings=document.createElement('div'),description=document.createElement('input'),caption=document.createElement('input'),handle=document.createElement('button'),upload=document.createElement('label'),file=document.createElement('input'),link=document.createElement('input'),confirm=document.createElement('button'),edit=document.createElement('button');
   dom.className='milkdown-image-block';dom.contentEditable='false';wrapper.className='image-wrapper';operations.className='operation';settings.className='image-edit';caption.className='caption-input';handle.className='image-resize-handle';upload.className='uploader';image.dataset.type='image-block';
   description.type='text';description.setAttribute('aria-label','Description de l’image');description.placeholder='Description de l’image';caption.setAttribute('aria-label','Légende et titre de l’image');caption.placeholder=config.captionPlaceholderText;handle.type='button';handle.setAttribute('aria-label','Redimensionner l’image');handle.tabIndex=0;handle.style.touchAction='none';handle.style.minWidth='44px';handle.style.minHeight='44px';edit.type='button';edit.textContent='Description';edit.setAttribute('aria-label','Modifier la description de l’image');edit.className='operation-item';
   file.type='file';file.accept='image/png,image/jpeg,image/webp,image/gif';file.hidden=true;file.id='note-image-'+crypto.randomUUID();upload.htmlFor=file.id;upload.textContent=config.uploadButton??'Choisir une image';upload.append(file);link.type='text';link.setAttribute('aria-label','Source de l’image');link.placeholder=config.uploadPlaceholderText;confirm.type='button';confirm.textContent='Insérer';confirm.setAttribute('aria-label','Confirmer la source de l’image');settings.hidden=true;settings.append(description,upload,link,confirm);operations.append(edit);wrapper.append(image,operations,handle);dom.append(wrapper,caption,settings);confirm.className='confirm';
   const active=()=>alive&&current()&&view.editable;
   const set=(attrs:Record<string,unknown>)=>{if(!active())return;const pos=getPos();if(pos===undefined)return;const actual=view.state.doc.nodeAt(pos);if(!actual||actual.type!==initial.type||actual.attrs.src!==node.attrs.src)return;view.dispatch(view.state.tr.setNodeMarkup(pos,undefined,{...actual.attrs,...attrs}));};
   const paint=()=>{const title=node.attrs.caption!==node.attrs.sourceCaption?node.attrs.caption||null:node.attrs.title,alt=node.attrs.alt;if(image.getAttribute('src')!==node.attrs.src)image.setAttribute('src',node.attrs.src);image.alt=alt;image.title=title??'';image.hidden=!node.attrs.src;image.dataset.dowzeRatio=String(node.attrs.ratio);if(document.activeElement!==description)description.value=node.attrs.alt;if(document.activeElement!==caption)caption.value=node.attrs.caption;caption.hidden=!node.attrs.src;caption.classList.toggle('hidden',caption.hidden);wrapper.classList.toggle('hidden',!node.attrs.src);if(!node.attrs.src)wrapper.style.setProperty('display','none','important');else wrapper.style.removeProperty('display');if(!node.attrs.src)settings.hidden=false;settings.classList.toggle('hidden',Boolean(settings.hidden));link.value=node.attrs.src;for(const control of [description,caption,file,link,confirm,edit,handle])control.disabled=!active();upload.setAttribute('aria-disabled',String(!active()));};
   const dimensions=(ratio:number)=>paperImageDimensions(image.naturalWidth,image.naturalHeight,Math.min(paperImageAvailableWidth(image),config.maxWidth??Infinity),ratio,Math.min(paperImageFrameHeight(image),config.maxHeight??Infinity));
   const baseHeight=()=>dimensions(1)?.baseHeight||Number(image.dataset.origin)||100;
   const paintSize=(ratio:number)=>{const computed=dimensions(ratio),base=computed?.baseHeight??baseHeight(),height=computed?.height??base*ratio;image.dataset.origin=String(base);image.dataset.height=String(height);image.style.height=height+'px';image.style.setProperty('--paper-image-height',image.style.height);image.style.width=computed?computed.width+'px':'auto';image.style.maxWidth='100%';return height;};
   const size=()=>paintSize(imageRatio(node.attrs.ratio));
   image.addEventListener('load',size);description.addEventListener('input',()=>set({alt:description.value}));description.addEventListener('change',()=>set({alt:description.value}));caption.addEventListener('input',()=>set({caption:caption.value}));edit.addEventListener('click',()=>{if(!active())return;settings.hidden=!settings.hidden;settings.classList.toggle('hidden',Boolean(settings.hidden));if(!settings.hidden)description.focus();});confirm.addEventListener('click',()=>{const src=link.value.trim();if(src&&!/^javascript:/i.test(src))set({src});});
   file.addEventListener('change',()=>{const blob=file.files?.[0];file.value='';if(!blob||!active())return;const capturedSrc=node.attrs.src;void config.onUpload(blob).then(src=>{if(active()&&node.attrs.src===capturedSrc)set({src});}).catch(()=>{});});
   const release=()=>{const gesture=resize;resize=null;if(!gesture)return;try{if(handle.hasPointerCapture(gesture.id))handle.releasePointerCapture(gesture.id);}catch{}};
   handle.addEventListener('pointerdown',event=>{if(!active()||event.button!==0||resize)return;event.preventDefault();event.stopPropagation();try{handle.setPointerCapture(event.pointerId);}catch{return;}const ratio=imageRatio(node.attrs.ratio);let angle=0,scale=1;try{const object=dom.closest('.paper-object'),page=dom.closest('.paper-page'),turn=new DOMMatrix(object?getComputedStyle(object).transform:undefined),zoom=new DOMMatrix(page?getComputedStyle(page).transform:undefined);angle=Math.atan2(turn.b,turn.a);scale=Math.hypot(zoom.a,zoom.b)||1;}catch{}resize={id:event.pointerId,start:event.clientY,x:event.clientX,angle,scale,base:baseHeight(),ratio,height:Number(image.dataset.height)||baseHeight()*ratio,nextRatio:ratio};});
   handle.addEventListener('pointermove',event=>{if(!resize||resize.id!==event.pointerId)return;event.preventDefault();event.stopPropagation();if(!active()||baseHeight()!==resize.base){release();size();return;}const delta=(-Math.sin(resize.angle)*(event.clientX-resize.x)+Math.cos(resize.angle)*(event.clientY-resize.start))/resize.scale;if(!delta)return;const requested=Math.max(16,resize.height+delta),height=paintSize(imageRatio(Math.min(10000,requested/resize.base)));resize.nextRatio=imageRatio(height/resize.base);});
   handle.addEventListener('pointerup',event=>{if(!resize||resize.id!==event.pointerId)return;event.preventDefault();event.stopPropagation();const ratio=resize.nextRatio,valid=active()&&baseHeight()===resize.base;release();if(valid)set({ratio});else size();});
   const cancel=()=>{release();size();};handle.addEventListener('pointercancel',cancel);handle.addEventListener('lostpointercapture',()=>{if(resize)cancel();});handle.addEventListener('keydown',event=>{if(!active()||!['ArrowUp','ArrowDown','Home'].includes(event.key))return;event.preventDefault();set({ratio:event.key==='Home'?1:imageRatio(Math.min(10000,Math.max(.05,imageRatio(node.attrs.ratio)+(event.key==='ArrowUp'?0.1:-0.1))))});});
   paint();size();return {dom,update(next){if(next.type!==initial.type)return false;const sourceChanged=next.attrs.src!==node.attrs.src;if(sourceChanged||next.attrs.ratio!==node.attrs.ratio)release();node=next;if(sourceChanged&&node.attrs.src)settings.hidden=true;paint();if(!resize)size();return true;},stopEvent:event=>event.target instanceof Element&&!!event.target.closest('input,button,label'),ignoreMutation:()=>true,selectNode:()=>dom.classList.add('selected'),deselectNode:()=>dom.classList.remove('selected'),destroy:()=>{alive=false;release();}};
  };
  ctx.update(nodeViewCtx,views=>views.map(([name,view])=>[name,name==='image-block'?constructor:view]));ctx.done(ready);return()=>{ctx.update(editorViewTimerCtx,timers=>timers.filter(timer=>timer!==ready));ctx.clearTimer(ready);};
 };};
 editor.use(metadata).use(imageView);
}

/** Milkdown's uploader is a label; ProseMirror can cancel its default activation.
 * Keep the existing input/change callback and activate it synchronously in the user gesture. */
export function bindNotebookImageChooser(root:HTMLElement,current:()=>boolean,readOnly:()=>boolean):()=>void{
  const labelFor=(event:Event)=>event.target instanceof Element?event.target.closest<HTMLLabelElement>('.milkdown-image-block label.uploader,.milkdown-image-inline label.uploader'):null;
  const inputFor=(label:HTMLLabelElement)=>{const id=label.getAttribute('for'),input=id?root.ownerDocument.getElementById(id):null;return input instanceof HTMLInputElement&&input.type==='file'&&root.contains(input)?input:null;};
  const decorate=()=>{for(const label of root.querySelectorAll<HTMLLabelElement>('.milkdown-image-block label.uploader,.milkdown-image-inline label.uploader')){const input=inputFor(label),disabled=!current()||readOnly()||!input||input.disabled;label.setAttribute('role','button');label.setAttribute('aria-label','Choisir une image');label.setAttribute('title','Choisir une image sur cet appareil');label.setAttribute('aria-disabled',String(disabled));label.tabIndex=disabled?-1:0;}};
  const open=(event:Event,label:HTMLLabelElement)=>{event.preventDefault();event.stopPropagation();const input=inputFor(label);if(!current()||readOnly()||!input||input.disabled)return;input.click();};
  const click=(event:Event)=>{const label=labelFor(event);if(label&&root.contains(label))open(event,label);};
  const keydown=(event:KeyboardEvent)=>{if(event.key!=='Enter'&&event.key!==' ')return;const label=labelFor(event);if(label&&root.contains(label))open(event,label);};
  const pointer=(event:Event)=>{const label=labelFor(event);if(label&&root.contains(label))event.stopPropagation();};
  root.addEventListener('click',click,true);root.addEventListener('keydown',keydown,true);root.addEventListener('mousedown',pointer,true);root.addEventListener('pointerdown',pointer,true);const observer=new MutationObserver(decorate);observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled']});decorate();
  return()=>{observer.disconnect();root.removeEventListener('click',click,true);root.removeEventListener('keydown',keydown,true);root.removeEventListener('mousedown',pointer,true);root.removeEventListener('pointerdown',pointer,true);};
}

export type MarkdownNoteEditorSource=PaperTextWriterSource;
export type MarkdownNoteEditorActivity=PaperTextWriterActivity;
export type MarkdownNoteEditorSearchRequest=PaperSearchNavigationRequest;
export interface MarkdownNoteEditorHandle {
 current:()=>boolean;flush:()=>Promise<boolean>;settled:()=>Promise<boolean>;
 pending:()=>boolean;composing:()=>boolean;activity:()=>Readonly<MarkdownNoteEditorActivity>;
 highlightSearch:(request:MarkdownNoteEditorSearchRequest)=>boolean;clearSearch:()=>void;
}
export interface MarkdownNoteEditorProps {
  noteId: string;
  initialMarkdown: string;
  externalMarkdown?: string;
  documentSnapshot?:PaperDocument;
  onChange: (markdown: string,baseline?:PaperDocument) => unknown;
  media?: NotebookMediaScope;
  paperTools?: PaperTools;
  onUploadImage?: (file:File)=>Promise<string>;
  readOnly?: boolean;
  flowEditing?:boolean;onCaretPosition?:(y:number)=>void;
  /** A view incarnation, independent of document revision and caret/toolbar page. */
  generation?:string|number;current?:()=>boolean;
  /** Capture this promise immediately after accepting onChange, before any await. */
  whenSaved?:()=>Promise<unknown>;
  onActivity?:(activity:Readonly<MarkdownNoteEditorActivity>)=>void;
  /** The persistent host can aggregate its own account writer; legacy callers register here. */
  registerWriter?:boolean;registerSession?:boolean;
}
interface MarkdownEditorScope {
 ownerKey:string;source:Readonly<MarkdownNoteEditorSource>;revoked:boolean;retryKey:number;
 props:MarkdownNoteEditorProps;
}
interface MarkdownEditorRuntime {
 scope:MarkdownEditorScope;writer:PaperTextWriter;crepe:Crepe;prepared:boolean;created:boolean;disposed:boolean;applyingExternal:boolean;
 baseline:PaperDocument|undefined;lastExternal:string;lastAccepted:string;fallback:string;
 tools:Root|null;imageInsert:((file:File)=>Promise<void>)|null;
 flush:()=>Promise<boolean>;settled:()=>Promise<boolean>;pending:()=>boolean;setReadonly:()=>void;inspectSearch:()=>void;handle:MarkdownNoteEditorHandle;
 fallbackChanged:(markdown:string)=>void;fallbackComposition:(active:boolean)=>void;
 fallbackElement:HTMLTextAreaElement|null;attachFallback:(element:HTMLTextAreaElement)=>void;
}
// Unexpected React teardown cannot make unpreserved accepted text collectable.
// The normal host keeps the same PM tree until settled() explicitly returns true.
const retainedMarkdownEditors=new Set<MarkdownEditorRuntime>();
let markdownWriterSerial=0;

function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("L’image n’a pas pu être lue."));
    }, { once: true });
    reader.addEventListener("error", () => reject(new Error("L’image n’a pas pu être lue.")), { once: true });
    reader.readAsDataURL(file);
  });
}

const MarkdownNoteEditor=forwardRef<MarkdownNoteEditorHandle,MarkdownNoteEditorProps>(function MarkdownNoteEditor({
  noteId,
  initialMarkdown,externalMarkdown,documentSnapshot,
  onChange,media,paperTools,onUploadImage,readOnly=false,flowEditing=false,onCaretPosition,
  generation=0,current,whenSaved,onActivity,registerWriter=true,registerSession
}: MarkdownNoteEditorProps,ref) {
  const [retryKey, setRetryKey] = useState(0);
  const props:MarkdownNoteEditorProps={noteId,initialMarkdown,externalMarkdown,documentSnapshot,onChange,media,paperTools,onUploadImage,readOnly,flowEditing,onCaretPosition,generation,current,whenSaved,onActivity,registerWriter,registerSession};
  const ownerKey=JSON.stringify([media?.accountId??null,media?.spaceId??null,noteId,documentSnapshot?.noteId??null]),scopeRef=useRef<MarkdownEditorScope|null>(null),serial=useRef(0);
  if(!scopeRef.current||scopeRef.current.ownerKey!==ownerKey||scopeRef.current.source.api!==media?.api||scopeRef.current.source.generation!==generation||scopeRef.current.retryKey!==retryKey){
   if(scopeRef.current)scopeRef.current.revoked=true;
   scopeRef.current={ownerKey,source:Object.freeze({accountId:media?.accountId??null,spaceId:media?.spaceId??null,noteId:documentSnapshot?.noteId??null,editorId:noteId,api:media?.api,generation,serial:++serial.current}),revoked:false,retryKey,props};
  }else scopeRef.current.props=props;
  const scope=scopeRef.current,runtimeRef=useRef<MarkdownEditorRuntime|null>(null),rootRef=useRef<HTMLDivElement>(null);
  const scopeCurrent=(candidate:MarkdownEditorScope)=>{
   if(candidate.revoked||scopeRef.current!==candidate)return false;
   const value=candidate.props,source=candidate.source;
   if((value.media?.accountId??null)!==source.accountId||(value.media?.spaceId??null)!==source.spaceId||value.media?.api!==source.api||value.generation!==source.generation||value.noteId!==source.editorId||(value.documentSnapshot?.noteId??null)!==source.noteId){candidate.revoked=true;return false;}
   let valid=true;try{if(candidate.props.current)valid=candidate.props.current()===true;}catch{valid=false;}
   if(!valid)candidate.revoked=true;return valid;
  };
  const [isReady, setIsReady] = useState(false);
  const [reconcileTick,setReconcileTick]=useState(0);
  const [error, setError] = useState<string | null>(null);
  const [creationFailed, setCreationFailed] = useState(false);
  const [fallbackMarkdown, setFallbackMarkdown] = useState(initialMarkdown);

  // Handles capture one actual setup, including Strict replay. A retained old
  // handle never follows runtimeRef to a replacement writer.
  useImperativeHandle(ref,()=>runtimeRef.current?.scope===scope&&runtimeRef.current.prepared&&!runtimeRef.current.disposed?runtimeRef.current.handle:{current:()=>false,flush:()=>Promise.resolve(false),settled:()=>Promise.resolve(false),pending:()=>true,composing:()=>false,highlightSearch:()=>false,clearSearch:()=>{},activity:()=>{throw Error('L’éditeur prépare encore son writer.');}},[scope,isReady]);
  useEffect(()=>{const runtime=runtimeRef.current;if(runtime?.scope===scope)runtime.setReadonly();},[readOnly,isReady,scope]);
  useEffect(()=>{const runtime=runtimeRef.current;if(runtime?.scope===scope)runtime.inspectSearch();},[documentSnapshot,scope]);
  useEffect(()=>{const runtime=runtimeRef.current;if(runtime?.scope===scope&&runtime.tools&&paperTools)runtime.tools.render(<NotePaperTools tools={paperTools} readOnly={readOnly} onImage={file=>runtime.imageInsert?.(file)??Promise.resolve()}/>);},[paperTools,readOnly,scope]);

  useEffect(()=>{
    if(!isReady||externalMarkdown===undefined)return;
    const runtime=runtimeRef.current;if(!runtime||runtime.scope!==scope||!runtime.created||runtime.disposed||!scopeCurrent(scope)||externalMarkdown===runtime.lastExternal)return;const crepe=runtime.crepe;
    // Unsaved typing remains local. The synchronizer keeps concurrent versions for review.
    const current=crepe.getMarkdown();
    const view=crepe.editor.action(ctx=>ctx.get(editorViewCtx));
    // Listener debounces for 200ms. Reading the live view catches typing before its notification arrives.
    if(runtime.writer.pending()||view.composing||current!==runtime.lastAccepted)return;
    if(current!==externalMarkdown){
      const viewport=view.dom.closest<HTMLElement>('.paper-viewport'),top=viewport?.scrollTop,left=viewport?.scrollLeft;
      runtime.applyingExternal=true;
      try{crepe.editor.action(ctx=>{const parsed=ctx.get(parserCtx)(externalMarkdown);if(!parsed)throw Error('Le texte reçu ne peut pas être interprété.');const tr=remotePaperEditorTransaction(view.state,parsed);if(tr)view.dispatch(tr);});}
      catch(caught){setError(String(caught instanceof Error?caught.message:caught));return;}
      finally{runtime.applyingExternal=false;}
      if(viewport&&top!==undefined&&left!==undefined){viewport.scrollTop=top;viewport.scrollLeft=left;}
    }
    runtime.lastExternal=externalMarkdown;runtime.lastAccepted=crepe.getMarkdown();runtime.baseline=scope.props.documentSnapshot;runtime.writer.acknowledge(runtime.lastAccepted);
  },[externalMarkdown,isReady,reconcileTick,scope]);

  useLayoutEffect(() => {
    const container = rootRef.current;
    if (!container) return;
    // One private DOM root per incarnation. A delayed old destroy must never
    // remove a new editor that happens to reuse the React container.
    const root=container.ownerDocument.createElement('div');root.className='markdown-editor-owned';root.inert=true;container.appendChild(root);
    let disposed = false,prepared=false;
    let created = false;
    let crepe: Crepe | null = null,textStyles:PaperTextStyleEditor|null=null;
    let runtime:MarkdownEditorRuntime,saveTimer:ReturnType<typeof setTimeout>|undefined,verifyTimer:ReturnType<typeof setTimeout>|undefined,caretFrame=0,suspended=false,composing=false,unconfirmedDOM=false,focused=false,caretY:number|null=null,unregisterWriter:(()=>void)|null=null,retirement:Promise<boolean>|null=null,destroyed=false,projectedToolbar:HTMLElement|null=null,creating=true,preparationFlush:Promise<boolean>|null=null,finishCreation!:()=>void;
    // Stable gate installed before exposing the handle or registering the writer.
    const creation=new Promise<void>(resolve=>{finishCreation=resolve;});
    const source=Object.freeze({...scope.source,serial:++markdownWriterSerial}),activityCallback=scope.props.onActivity;
    const logicalNoteId=source.noteId,ownerCurrent=()=>prepared&&scopeCurrent(scope),interactive=()=>!disposed&&ownerCurrent()&&!scope.props.readOnly&&!suspended,inputGate=createPaperEditorInputGate();
    let parkedRoot:HTMLDivElement|null=null;
    const parkOwnedDOM=()=>{
     // React owns the outer container, but this root and all Crepe children are
     // ours. Move them during layout cleanup, before React removes that parent.
     // Keeping a runtime alone would leave a live PM on a disconnected DOM and
     // can terminate its already admitted native composition.
     if(!parkedRoot){
      parkedRoot=root.ownerDocument.createElement('div');parkedRoot.className='markdown-editor-retained';parkedRoot.dataset.markdownEditorRetained=String(source.serial);
      parkedRoot.setAttribute('aria-hidden','true');parkedRoot.style.cssText='position:fixed;left:-600001px;top:0;opacity:0;pointer-events:none;';
      const width=root.offsetWidth||root.getBoundingClientRect().width;if(Number.isFinite(width)&&width>0)parkedRoot.style.width=`${width}px`;
      (root.ownerDocument.body??root.ownerDocument.documentElement).appendChild(parkedRoot);
     }
     if(root.parentNode!==parkedRoot){
      // Engines that support state-preserving moves keep focus/composition as
      // well as node identity. The fallback never clones, blurs, resets PM or
      // manufactures a compositionend; the same input gate stays on this root.
      const move=(parkedRoot as HTMLDivElement&{moveBefore?:(node:Node,before:Node|null)=>void}).moveBefore;
      if(typeof move==='function'&&root.isConnected)move.call(parkedRoot,root,null);else parkedRoot.appendChild(root);
     }
     if(projectedToolbar&&!root.contains(projectedToolbar)&&projectedToolbar.parentNode!==parkedRoot)parkedRoot.appendChild(projectedToolbar);
    };
    const releaseImageChooser=bindNotebookImageChooser(root,interactive,()=>!!scope.props.readOnly||suspended);
    setFallbackMarkdown(initialMarkdown);
    setIsReady(false);
    setError(null);
    setCreationFailed(false);
    const getView=()=>created&&crepe?crepe.editor.action(ctx=>ctx.get(editorViewCtx)):null;
    let searchRequest:MarkdownNoteEditorSearchRequest|null=null,searchWriterClean=false,searchApiCurrent:()=>boolean=()=>!media?.api;
    const searchAllowed=()=>{try{return !!searchRequest&&!disposed&&!runtime.applyingExternal&&ownerCurrent()&&!suspended&&searchWriterClean&&!composing&&!unconfirmedDOM&&!inputGate.pending()&&searchApiCurrent()&&scope.props.documentSnapshot===searchRequest.document&&searchRequest.current()===true&&getView()?.composing===false;}catch{return false;}};
    const hideSearch=()=>{searchRequest=null;root.style.removeProperty('--paper-editor-search-background');root.style.removeProperty('--paper-editor-search-outline');};
    const clearSearch=()=>{
     const shown=searchRequest!==null;hideSearch();
     // Never restructure text DOM to clear presentation during an admitted IME.
     try{const view=getView();if(shown&&view&&!view.composing&&!composing&&!inputGate.pending()&&!unconfirmedDOM)view.dispatch(paperEditorSearchTransaction(view.state,null));}catch{/* Presentation cleanup cannot interrupt the accepted writer's retirement. */}
    };
    const readBuffer=()=>{let markdown=runtime?.fallback??initialMarkdown,view:ReturnType<typeof getView>=null;
     try{if(created&&crepe){view=getView();markdown=crepe.getMarkdown();}else if(runtime?.fallbackElement)markdown=runtime.fallbackElement.value;}catch{unconfirmedDOM=true;}
     return {markdown,composing:composing||view?.composing===true||inputGate.pending(),unconfirmedDOM,focused,caretY,...(view&&(unconfirmedDOM||composing||view.composing||inputGate.pending())?{domText:view.dom.textContent??'',document:view.state.doc.toJSON()}:runtime?.fallbackElement&&composing?{domText:runtime.fallbackElement.value}:{} )};
    };
    const writer=createPaperTextWriter({source,initialMarkdown,current:()=>!disposed&&ownerCurrent(),read:readBuffer,
     persist:markdown=>{
      if(!ownerCurrent())return {result:false};
      const callback=scope.props.onChange,captureDurable=scope.props.whenSaved;
      const result=callback(markdown,runtime.baseline);
      // whenSaved reads a mutable tail in usePaperDocument. Capture the old
      // accepted promise in this stack, never after an await or in settled().
      const thenable=result&&typeof (result as PromiseLike<unknown>).then==='function';
      // An async callback can publish its tail after the call returns. In that
      // case its captured recovery is the proof, not a possibly earlier tail.
      let durable:Promise<unknown>|undefined;if(result!==false&&!thenable&&captureDurable)try{durable=captureDurable();}catch(error){durable=Promise.reject(error);}
      const accept=(value:unknown)=>{if(value===false)return false;runtime.lastAccepted=markdown;if(value&&typeof value==='object'&&'notebookSchema' in value&&value.notebookSchema===3&&'noteId' in value&&value.noteId===logicalNoteId)runtime.baseline=value as PaperDocument;if(!disposed&&ownerCurrent())setReconcileTick(t=>t+1);return value;};
      return {result:thenable?Promise.resolve(result).then(accept):accept(result),...(durable?{durable}:{})};
     },
     preserve:async(buffer,version)=>{
      if(!source.accountId||!source.spaceId)throw Error('La récupération attend un espace de stockage de cette note.');
      await putSnapshot({key:`paper-editor-recovery|${source.accountId}|${source.spaceId}|${source.editorId}|${source.serial}|${version}|${crypto.randomUUID()}`,accountId:source.accountId,spaceId:source.spaceId,value:{schema:2,kind:'paper-editor-buffer',noteId:logicalNoteId,editorId:source.editorId,markdown:buffer.markdown,baseline:runtime.baseline,composing:buffer.composing,unconfirmedDOM:buffer.unconfirmedDOM,...(buffer.domText!==undefined?{domText:buffer.domText,document:buffer.document}:{}),generation:source.generation,createdAt:new Date().toISOString()}});
     },
     onActivity:activity=>{searchWriterClean=!activity.dirty&&!activity.composing&&!activity.unconfirmedDOM&&!activity.pendingOperations&&!activity.retired&&activity.error===null;if(!searchWriterClean)hideSearch();try{activityCallback?.(activity);}catch{}if(!disposed&&ownerCurrent()){
      const writerNotice='Votre texte reste dans l’éditeur ; son enregistrement doit être repris.';
      if(activity.error)setError(writerNotice);
      else if(searchWriterClean)setError(previous=>previous===writerNotice?null:previous);
     }}
    });
    const stopSave=()=>{if(saveTimer!==undefined){clearTimeout(saveTimer);saveTimer=undefined;}};
    const flush=()=>{stopSave();if(creating)return preparationFlush??(preparationFlush=creation.then(()=>disposed?writer.retire():writer.flush()));return disposed?writer.retire():writer.flush();};

    const flushPaper = (event:Event) => {const prefix=(event as CustomEvent<{prefix?:string}>).detail?.prefix;if(prefix&&noteId.startsWith(prefix))void flush();};
    window.addEventListener('dowze:paper-flush',flushPaper);

    const scheduleSave = (markdown: string) => {
      if(disposed||!ownerCurrent())return;
      if(!created)runtime.fallback=markdown;
      stopSave();saveTimer=setTimeout(()=>{saveTimer=undefined;void flush();},AUTOSAVE_DELAY_MS);
    };

    const uploadEmbeddedImage = async (file: File) => {
      if(!interactive())throw Error('Le carnet a changé avant l’ajout de l’image.');
      if(scope.props.onUploadImage){const upload=scope.props.onUploadImage,src=await upload(file);if(!interactive())throw Error('Le carnet a changé pendant l’ajout de l’image. L’original reste conservé.');return src;}
      if(documentSnapshot&&media)throw Error('L’ajout d’image attend la préparation de son fichier dans ce carnet. Réessayez après son ouverture.');
      if (!EMBEDDED_IMAGE_TYPES.has(file.type)) {
        const message = "Utilise une image PNG, JPEG, GIF ou WebP.";
        setError(message);
        throw new Error(message);
      }
      if (file.size > MAX_EMBEDDED_IMAGE_BYTES) {
        const message = "L’image dépasse 350 ko. Compresse-la avant de l’intégrer à la note.";
        setError(message);
        throw new Error(message);
      }
      const currentMarkdown = created && crepe ? crepe.getMarkdown() : initialMarkdown;
      if (currentMarkdown.length + Math.ceil(file.size * 4 / 3) > MAX_NOTE_MARKDOWN_CHARACTERS) {
        const message = "Cette note approche la capacité locale. Exporte-la en .md puis crée une nouvelle note avant d’ajouter cette image.";
        setError(message);
        throw new Error(message);
      }
      setError(null);
      const src=await fileAsDataUrl(file);if(!interactive())throw Error('Le carnet a changé pendant la lecture de l’image.');return src;
    };

    crepe = new Crepe({
      root,
      defaultValue: initialMarkdown,
      features: {
        [Crepe.Feature.Cursor]: true,
        [Crepe.Feature.ListItem]: true,
        [Crepe.Feature.LinkTooltip]: true,
        [Crepe.Feature.ImageBlock]: true,
        [Crepe.Feature.BlockEdit]: true,
        [Crepe.Feature.Toolbar]: true,
        [Crepe.Feature.Placeholder]: true,
        [Crepe.Feature.CodeMirror]: true,
        [Crepe.Feature.Table]: true,
        [Crepe.Feature.Latex]: true,
        [Crepe.Feature.TopBar]: true,
        [Crepe.Feature.AI]: false
      },
      featureConfigs: {
        [Crepe.Feature.Placeholder]: {
          text: "Commence à écrire… Tape / pour insérer un bloc ou une formule.",
          mode: "block"
        },
        [Crepe.Feature.TopBar]: {
          headingOptions: [
            { label: "Paragraphe", level: null },
            { label: "Titre 1", level: 1 },
            { label: "Titre 2", level: 2 },
            { label: "Titre 3", level: 3 },
            { label: "Titre 4", level: 4 },
            { label: "Titre 5", level: 5 },
            { label: "Titre 6", level: 6 }
          ]
        },
        [Crepe.Feature.Toolbar]: {
          boldLabel: "Gras",
          italicLabel: "Italique",
          strikethroughLabel: "Barré",
          codeLabel: "Code",
          linkLabel: "Lien",
          latexLabel: "Formule"
        },
        [Crepe.Feature.BlockEdit]: {
          textGroup: {
            label: "Texte",
            text: { label: "Paragraphe" },
            h1: { label: "Titre 1" },
            h2: { label: "Titre 2" },
            h3: { label: "Titre 3" },
            h4: { label: "Titre 4" },
            h5: { label: "Titre 5" },
            h6: { label: "Titre 6" },
            quote: { label: "Citation" },
            divider: { label: "Séparateur" }
          },
          listGroup: {
            label: "Listes",
            bulletList: { label: "Liste à puces" },
            orderedList: { label: "Liste numérotée" },
            taskList: { label: "Liste de tâches" }
          },
          advancedGroup: {
            label: "Blocs avancés",
            image: { label: "Image" },
            codeBlock: { label: "Bloc de code" },
            table: { label: "Tableau" },
            math: { label: "Formule mathématique" }
          }
        },
        [Crepe.Feature.Latex]: {
          katexOptions: {
            throwOnError: false,
            trust: false
          }
        },
        [Crepe.Feature.ImageBlock]: {
          blockUploadButton:'Choisir une image',inlineUploadButton:'Choisir une image',blockUploadPlaceholderText:'Ou coller le lien d’une image…',inlineUploadPlaceholderText:'Ou coller le lien d’une image…',blockCaptionPlaceholderText:'Légende et titre de l’image',
          onUpload: uploadEmbeddedImage,
          inlineOnUpload: uploadEmbeddedImage,
          blockOnUpload: uploadEmbeddedImage
        }
      }
    });

    const fallbackStart=()=>runtime.fallbackComposition(true),fallbackEnd=()=>runtime.fallbackComposition(false);
    const setReadonly=()=>{
     if(disposed||!ownerCurrent()||suspended||composing||unconfirmedDOM||inputGate.pending())clearSearch();
     // PM gates compositionend on view.editable. Retain only the accepted IME
     // chain until its real end and observer confirmation; root capture below
     // rejects new editing while this old view temporarily stays editable.
     crepe?.setReadonly(!interactive()&&!inputGate.pending());textStyles?.refresh();
     if(disposed||prepared&&!ownerCurrent()){root.style.opacity='0';root.style.pointerEvents='none';}
     if(projectedToolbar)projectedToolbar.hidden=!interactive();
    };
    const settled=async()=>{await creation;if(!await writer.settled())return false;await textStyles?.settled();return disposed||retirement!==null?retireEditor():true;};
    const pending=()=>creating||!destroyed&&(disposed||retirement!==null)||writer.pending()||textStyles?.pending()===true;
    const highlightSearch=(request:MarkdownNoteEditorSearchRequest)=>{
     clearSearch();
     try{
      if(!created||!ownerCurrent()||disposed||runtime.applyingExternal||suspended||!searchApiCurrent()||request.current()!==true||scope.props.documentSnapshot!==request.document||writer.pending())return false;
      const resolved=resolvePaperSearchHit(request.document,request.hit);
      if(!resolved||resolved.kind!=='text'||!resolved.objectId||source.noteId!==request.document.noteId||source.editorId!==`${source.noteId}-${resolved.objectId}`)return false;
      const object=request.document.objects.find(object=>object.id===resolved.objectId),markdown=object?.markdown??'',view=getView();
      if(!view||!view.dom.isConnected||root.closest('[data-text-host-parked="true"]')||view.composing||composing||unconfirmedDOM||inputGate.pending()||crepe!.getMarkdown()!==runtime.lastAccepted)return false;
      const state=view.state,parser=crepe!.editor.action(ctx=>({document:ctx.get(parserCtx)(markdown),headingId:ctx.get(headingIdGenerator.key)}));if(!parser.document)return false;
      const ranges=mapPaperEditorSearchRange({markdown,document:state.doc,parsedDocument:parser.document,headingId:parser.headingId,start:resolved.start,end:resolved.end});if(!ranges)return false;
      searchRequest={document:request.document,hit:request.hit,current:request.current,scroll:request.scroll};
      if(view.state!==state||!searchAllowed()||!resolvePaperSearchHit(request.document,request.hit)){clearSearch();return false;}
      root.style.setProperty('--paper-editor-search-background','var(--paper-search-hit,#ffe38a)');root.style.setProperty('--paper-editor-search-outline','0 0 0 1px #bd8300');
      view.dispatch(paperEditorSearchTransaction(state,ranges));
      if(view.state.doc!==state.doc||!searchAllowed()){clearSearch();return false;}
      // Scroll the proven decoration, without changing selection or focus.
      const target=view.dom.querySelector<HTMLElement>('[data-paper-editor-search]');if(!target){clearSearch();return false;}
      if(request.scroll!==false)target.scrollIntoView({block:'center',inline:'nearest'});
      if(!searchAllowed()){clearSearch();return false;}return true;
     }catch{clearSearch();return false;}
    };
    const runtimeHandle:MarkdownNoteEditorHandle={highlightSearch,clearSearch,current:()=>interactive()&&writer.current(),flush,settled,pending,composing:()=>(prepared||disposed)?writer.composing():false,activity:()=>{if(!prepared&&!disposed)throw Error('L’éditeur prépare encore son writer.');return writer.activity();}};
    runtime={scope,writer,crepe,prepared:false,created:false,disposed:false,applyingExternal:false,baseline:documentSnapshot,lastExternal:externalMarkdown??initialMarkdown,lastAccepted:initialMarkdown,fallback:initialMarkdown,fallbackElement:null,tools:null,imageInsert:null,flush,handle:runtimeHandle,
     settled,pending,setReadonly,inspectSearch:()=>{if(!searchAllowed())clearSearch();},
     fallbackChanged:markdown=>{if(!interactive())return;runtime.fallback=markdown;writer.changed();scheduleSave(markdown);},
     fallbackComposition:active=>{composing=active;writer.probe();if(!active){void flush();if(disposed)void retireEditor();}},
     attachFallback:element=>{if(runtime.fallbackElement===element)return;runtime.fallbackElement=element;element.addEventListener('compositionstart',fallbackStart);element.addEventListener('compositionend',fallbackEnd);element.addEventListener('focusin',focusChanged);element.addEventListener('focusout',focusOut);}
    };runtimeRef.current=runtime;
    // Strict replay restores child layout effects before its parent's DOM ref.
    // Publishing now makes a parent's activity() probe see a disconnected
    // parent and permanently revoke this still-preparing scope. Publish only
    // after the commit restores those refs, retaining this exact incarnation.
    queueMicrotask(()=>{
     if(disposed||runtimeRef.current!==runtime)return;
     prepared=true;runtime.prepared=true;
     if(ownerCurrent()){try{searchApiCurrent=!media?.api?()=>true:typeof media.api.captureSessionAuthority==='function'?media.api.captureSessionAuthority(media.accountId):()=>false;}catch{searchApiCurrent=()=>false;}}
     setReadonly();
     if(typeof ref==='function')ref(runtimeHandle);else if(ref)ref.current=runtimeHandle;
    });
    crepe.editor.use($prose(()=>createPaperEditorSearchPlugin(searchAllowed)));
    configureNotebookImageBlocks(crepe.editor,interactive);
    textStyles=configurePaperTextStyles(crepe.editor,()=>interactive()&&!composing&&!unconfirmedDOM&&!inputGate.pending(),media?{scope:{accountId:media.accountId,spaceId:media.spaceId},current:()=>!disposed&&ownerCurrent(),captureAuthority:()=>media.api?media.api.captureSessionAuthority(media.accountId):()=>true}:undefined);
    if(flowEditing)crepe.editor.use(paperCodeView).use(paperCodeDecorations);
    if(media)crepe.editor.use(notePhotoPlugins(media,{getDocument:()=>scope.props.documentSnapshot,current:()=>interactive()&&scope.source.api===media.api&&scope.props.documentSnapshot?.noteId===logicalNoteId}));
    if(readOnly)crepe.setReadonly(true);

    // Milkdown's Markdown/selection listener is debounced. Observe accepted PM
    // transactions immediately so a first edit or IME cannot lose its pin.
    crepe.editor.use($prose(()=>new Plugin({view(){return {update(view,previous){
     if(!created||runtime.applyingExternal)return;
     if(!view.state.doc.eq(previous.doc)){unconfirmedDOM=false;writer.changed();if(!disposed)scheduleSave(crepe!.getMarkdown());}
     else writer.probe();
    }};}})));
    const finishAcceptedDOM=async()=>{
     const accepted=await flush();
     // An older preservation may have captured the still-composing version.
     // Retry the now-confirmed final buffer once after that tracked operation,
     // without cancelling storage or looping on a persistent failure.
     if(!accepted&&!inputGate.pending()&&!composing&&!unconfirmedDOM)await flush();
     if(disposed)await retireEditor();
    };
    const verifyDOM=(delay=0)=>{
     if(verifyTimer!==undefined)return;
     verifyTimer=setTimeout(()=>{verifyTimer=undefined;let view:ReturnType<typeof getView>=null;
      try{view=getView();if(view&&!view.composing&&!composing){
       // Installed ProseMirror's observer flush reconciles DOM input without
       // ending composition. If this optional seam is unavailable or still
       // scheduled, refuse settlement instead of guessing DOM confirmation.
       const observer=(view as unknown as {domObserver?:{flush:()=>void;queue:unknown[];flushingSoon:number}}).domObserver;
       observer?.flush();if(observer&&observer.flushingSoon<0&&Array.isArray(observer.queue)&&observer.queue.length===0){unconfirmedDOM=false;inputGate.confirmed();}
       else if(observer&&observer.flushingSoon>=0)verifyDOM(25);
      }}catch{unconfirmedDOM=true;}
      setReadonly();writer.probe();if(!disposed&&ownerCurrent())setReconcileTick(t=>t+1);
      if(!interactive()&&!inputGate.pending()&&!unconfirmedDOM)void finishAcceptedDOM();
     },delay);
    };
    const guardedEvents=['beforeinput','input','keydown','keyup','keypress','paste','drop','cut','compositionstart','compositionupdate','compositionend','click','dblclick','mousedown','pointerdown'] as const;
    const inputGuard=(event:Event)=>{
     const element=event.target;if(!(element instanceof Element))return;
     const pm=element.closest('.ProseMirror'),target=element instanceof HTMLInputElement||element instanceof HTMLTextAreaElement?element:pm??element;
     const value=event as Event&PaperEditorInputEvent;
     if(inputGate.admit(value,target,interactive()))return;
     if(event.cancelable)event.preventDefault();event.stopImmediatePropagation();
    };
    const rawInput=(event:Event)=>{const target=event.target;if(!(target instanceof Element)||!target.closest('.ProseMirror'))return;clearSearch();unconfirmedDOM=true;writer.changed();verifyDOM();};
    const compositionStarted=()=>{composing=true;clearSearch();unconfirmedDOM=true;writer.changed();};
    const compositionFinished=()=>{composing=false;verifyDOM();};
    const focusChanged=()=>{const element=root.ownerDocument.activeElement;focused=root.contains(element)||runtime.fallbackElement===element;if(!focused)caretY=null;writer.probe();};
    for(const type of guardedEvents)root.addEventListener(type,inputGuard,true);
    root.addEventListener('beforeinput',rawInput,true);root.addEventListener('input',rawInput,true);
    root.addEventListener('compositionstart',compositionStarted,true);root.addEventListener('compositionend',compositionFinished,true);
    const focusOut=()=>queueMicrotask(focusChanged);
    root.addEventListener('focusin',focusChanged,true);root.addEventListener('focusout',focusOut,true);

    const reportFlowCaret=(coordinates:{left:number;right:number;top:number;bottom:number})=>{
      const body=root.closest<HTMLElement>('.paper-flow-source');if(!flowEditing||disposed||!ownerCurrent()||!body)return;
      try{const box=body.getBoundingClientRect(),object=body.closest('.paper-object'),page=body.closest('.paper-page'),turn=new DOMMatrix(object?getComputedStyle(object).transform:undefined),zoom=new DOMMatrix(page?getComputedStyle(page).transform:undefined);caretY=paperTextCaretY({x:box.left+box.width/2,y:box.top+box.height/2,height:body.offsetHeight},{x:(coordinates.left+coordinates.right)/2,y:(coordinates.top+coordinates.bottom)/2},Math.atan2(turn.b,turn.a)*180/Math.PI,Math.hypot(zoom.a,zoom.b));writer.probe();scope.props.onCaretPosition?.(caretY);}catch{}
    };
    // A caption or description input owns its own keyboard focus. Report its
    // source position so the page containing that control can remain visible.
    const imageControlFocus=(event:FocusEvent)=>{const control=event.target;if(!(control instanceof HTMLElement)||!control.closest('.milkdown-image-block,.milkdown-image-inline,.note-photo-node'))return;if(caretFrame)cancelAnimationFrame(caretFrame);caretFrame=requestAnimationFrame(()=>{caretFrame=0;if(created&&!disposed&&ownerCurrent()&&root.contains(control))reportFlowCaret(control.getBoundingClientRect());});};
    root.addEventListener('focusin',imageControlFocus);
    crepe.on((listener) => {
      listener.selectionUpdated((ctx)=>{if(disposed||!created||!ownerCurrent())return;writer.probe();if(!flowEditing)return;if(caretFrame)cancelAnimationFrame(caretFrame);caretFrame=requestAnimationFrame(()=>{caretFrame=0;if(disposed||!created||!ownerCurrent())return;const view=ctx.get(editorViewCtx);if(view.composing||!view.hasFocus()){writer.probe();return;}try{reportFlowCaret(view.coordsAtPos(view.state.selection.head));}catch{}});});
      listener.markdownUpdated((_, markdown, previousMarkdown) => {
        if (created && !disposed && ownerCurrent()&&markdown !== previousMarkdown&&markdown!==runtime.lastAccepted) scheduleSave(markdown);
      });
      listener.blur(()=>{focusChanged();void flush();});
    });

    const accountWriter={flush:async()=>{await creation;if(!await flush())throw Error('Le texte ou la composition doit être confirmé avant de fermer la fenêtre.');},
     settled:async()=>{await creation;if(!await writer.settled())throw Error('Le texte visible reste dans son éditeur ; son enregistrement doit être repris.');await textStyles?.settled();if(disposed&&!await retireEditor())throw Error('La récupération de cet éditeur doit être confirmée avant fermeture.');},
     pending:runtime.pending,suspend:()=>{suspended=true;setReadonly();},resume:()=>{suspended=false;setReadonly();}};
    const ensureRegistered=()=>{if(media&&!unregisterWriter)unregisterWriter=registerNotebookWriter(media.accountId,accountWriter);};
    if(registerSession??registerWriter)ensureRegistered();
    const retireEditor=():Promise<boolean>=>{
     if(destroyed)return Promise.resolve(true);
     if(retirement)return retirement;
     retainedMarkdownEditors.add(runtime);
     const work=Promise.resolve().then(async()=>{
      await creation;if(!await writer.retire()||!await writer.settled())return false;
      const nested=runtime.tools;runtime.tools=null;runtime.imageInsert=null;
      runtime.fallback=readBuffer().markdown;
      // Milkdown removes editorViewCtx before destroy() resolves. From this
      // point readers must use the exact, already-confirmed final buffer, not
      // interpret a dismantled PM context as a new unconfirmed DOM change.
      // settled() still awaits the real destroy; failure retains the runtime.
      created=false;runtime.created=false;focused=false;caretY=null;
      textStyles?.destroy();if(textStyles)await textStyles.settled();textStyles=null;if(nested)nested.unmount();await crepe!.destroy();destroyed=true;root.remove();projectedToolbar?.remove();parkedRoot?.remove();parkedRoot=null;releaseImageChooser();
      for(const type of guardedEvents){root.removeEventListener(type,inputGuard,true);projectedToolbar?.removeEventListener(type,inputGuard,true);}
      root.removeEventListener('beforeinput',rawInput,true);root.removeEventListener('input',rawInput,true);root.removeEventListener('compositionstart',compositionStarted,true);root.removeEventListener('compositionend',compositionFinished,true);root.removeEventListener('focusin',focusChanged,true);root.removeEventListener('focusout',focusOut,true);root.removeEventListener('focusin',imageControlFocus);
      if(verifyTimer!==undefined){clearTimeout(verifyTimer);verifyTimer=undefined;}
      if(caretFrame){cancelAnimationFrame(caretFrame);caretFrame=0;}
      runtime.fallbackElement?.removeEventListener('compositionstart',fallbackStart);runtime.fallbackElement?.removeEventListener('compositionend',fallbackEnd);runtime.fallbackElement?.removeEventListener('focusin',focusChanged);runtime.fallbackElement?.removeEventListener('focusout',focusOut);runtime.fallbackElement=null;
      unregisterWriter?.();unregisterWriter=null;retainedMarkdownEditors.delete(runtime);return true;
     }).catch(()=>false);
     const tracked=work.finally(()=>{if(retirement===tracked)retirement=null;});retirement=tracked;return tracked;
    };
    const refreshBeforeLeaving = () => {void flush();};
    window.addEventListener("pagehide", refreshBeforeLeaving);

    void Promise.resolve().then(()=>crepe!.create())
      .then(() => {
        created = true;creating=false;runtime.created=true;
        if (disposed||!ownerCurrent()){void retireEditor();return;}
        const editable = root.querySelector<HTMLElement>("[contenteditable='true']");
        editable?.setAttribute("aria-label", "Éditeur Markdown de la note");
        editable?.setAttribute("lang", "fr");
        editable?.setAttribute("role", "textbox");
        editable?.setAttribute("aria-multiline", "true");
        editable?.setAttribute("spellcheck", "true");
        const toolbarLabels = [
          "Style de paragraphe", "Gras", "Italique", "Barré", "Code en ligne",
          "Liste à puces", "Liste numérotée", "Liste de tâches", "Ajouter un lien",
          "Ajouter une image", "Insérer un tableau", "Bloc de code",
          "Formule mathématique", "Citation", "Séparateur"
        ];
        root.querySelectorAll<HTMLButtonElement>(".milkdown-top-bar button").forEach((button, index) => {
          const label = toolbarLabels[index] ?? `Outil Markdown ${index + 1}`;
          if (!button.getAttribute("aria-label")) button.setAttribute("aria-label", label);
          button.setAttribute("title", label);
          button.dataset.tooltip = label;
          button.dataset.noteFormat = String(index);
        });
        const styleToolbar=root.querySelector<HTMLElement>('.milkdown-top-bar');if(styleToolbar)textStyles?.mount(styleToolbar);
        if(scope.props.paperTools){
          const toolbar=root.querySelector<HTMLElement>(".milkdown-top-bar");
          if(toolbar){
            // Preserve a single toolbar: normal formatting plus paper/ink tools.
            toolbar.classList.add('note-unified-toolbar');
            const originalImage=toolbar.querySelector<HTMLButtonElement>('button[aria-label="Ajouter une image"]');
            if(originalImage)originalImage.style.display='none';
            const slot=document.createElement('div');slot.className='note-paper-tools-slot';toolbar.appendChild(slot);runtime.tools=createRoot(slot);
            runtime.imageInsert=async file=>{
              try{const src=await uploadEmbeddedImage(file);if(!interactive()||!crepe)return;crepe.editor.action(insert(`![${file.name.replace(/[\[\]\\]/g,'')}](${src})\n\n`));crepe.editor.action(ctx=>ctx.get(editorViewCtx).focus());setError(null);}
              catch(error){if(!disposed&&ownerCurrent())setError(error instanceof Error?error.message:String(error));}
            };
            runtime.tools.render(<NotePaperTools tools={scope.props.paperTools} readOnly={!!scope.props.readOnly} onImage={file=>runtime.imageInsert?.(file)??Promise.resolve()}/>);
          }
        }
        if(flowEditing){const toolbar=root.querySelector<HTMLElement>('.milkdown-top-bar'),slot=root.closest('.paper-notebook')?.querySelector('.paper-flow-toolbar-slot');if(toolbar&&slot){slot.appendChild(toolbar);projectedToolbar=toolbar;for(const type of guardedEvents)toolbar.addEventListener(type,inputGuard,true);}}
        runtime.lastAccepted=crepe!.getMarkdown();writer.acknowledge(runtime.lastAccepted);root.inert=false;setReadonly();
        setIsReady(true);
        return undefined;
      })
      .catch((caught) => {
        creating=false;if (!disposed&&ownerCurrent()) {
          setCreationFailed(true);
          setError(`Impossible de charger l’éditeur Markdown : ${caught instanceof Error ? caught.message : String(caught)}`);
        }
      }).finally(finishCreation);

    return () => {
      if(disposed)return;
      disposed = true;runtime.disposed=true;stopSave();clearSearch();
      ensureRegistered();parkOwnedDOM();
      // display:none/inert/blur can terminate the native IME before its real
      // commit. Mask the retained old tree without forcing that transition.
      if(!inputGate.pending())root.hidden=true;
      root.style.opacity='0';root.style.pointerEvents='none';if(projectedToolbar)projectedToolbar.hidden=true;setReadonly();
      releaseImageChooser();
      window.removeEventListener('dowze:paper-flush',flushPaper);
      window.removeEventListener("pagehide", refreshBeforeLeaving);
      // An accidental teardown still contributes its captured recovery promise
      // to close. Do not unregister, destroy, clear the DOM or abort an accepted
      // save when recovery fails or the composition is not confirmed.
      void retireEditor();
    };
  }, [scope]);

  return (
    <div className="markdown-editor-shell studio-tools"><div className="studio-editor-help"><span>Écrivez et structurez vos idées</span><small>Sélectionnez du texte pour le mettre en forme · / pour insérer un bloc</small></div>
      {!isReady && !error && (
        <div className="markdown-editor-loading" role="status">
          <LoaderCircle /> Chargement de l’éditeur…
        </div>
      )}
      {error && (
        <div className="markdown-editor-error" role="alert">
          <AlertCircle /> <span>{error}</span>
          <button
            type="button"
            onClick={() => {
              if (creationFailed){const runtime=runtimeRef.current;if(runtime?.scope===scope)void runtime.flush().then(async accepted=>{if(accepted&&await runtime.settled()&&scopeCurrent(scope))setRetryKey(value=>value+1);});}
              else setError(null);
            }}
            aria-label={creationFailed ? "Réessayer de charger l’éditeur" : "Fermer l’erreur"}
          >
            {creationFailed ? "Réessayer" : "×"}
          </button>
        </div>
      )}
      {creationFailed && <label className="form-field">
        <span>Édition en texte Markdown</span>
        <small>Vous pouvez continuer à écrire ici et enregistrer votre note pendant que l’éditeur est indisponible.</small>
        <textarea ref={element=>{const runtime=runtimeRef.current;if(element&&runtime?.scope===scope)runtime.attachFallback(element);}} aria-label="Contenu Markdown de la note" value={fallbackMarkdown} readOnly={readOnly} rows={16} maxLength={MAX_NOTE_MARKDOWN_CHARACTERS} spellCheck onChange={(event) => {
          const markdown = event.target.value;
          const runtime=runtimeRef.current;if(runtime?.scope!==scope||!scopeCurrent(scope)||readOnly)return;
          setFallbackMarkdown(markdown);runtime.fallbackChanged(markdown);
        }} />
      </label>}
      <div className="markdown-editor-root" ref={rootRef} data-note-id={noteId} />
    </div>
  );
});
export default MarkdownNoteEditor;
