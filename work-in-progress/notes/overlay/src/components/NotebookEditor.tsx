import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import {PaperNotebook} from './PaperNotebook';
import type {PaperHistoryCopyCallback} from '../lib/paperHistoryVersions';
import type {PaperSearchNavigation} from '../lib/notebookSearchNavigation';
import type {SubjectNoteDocument} from '../types';
import type {ApiClient} from '../../pwa/src/api';
import type {Draft,LocalBlob} from '../../pwa/src/storage';
import {Drawing} from '../../pwa/src/Drawing';
import {listDrafts} from '../../pwa/src/storage';
import {synchronizeSpace} from '../../pwa/src/sync';
import {continuousSync} from '../lib/continuousSync';
import {noteBoardId} from '../lib/notebook';
import {photoReference} from '../lib/notebook';
import './notebook.css';
import { useWorkspaceTabVisible } from '../lib/workspaceTabVisibility';
const MarkdownNoteEditor=lazy(()=>import('./MarkdownNoteEditor'));
export interface NotebookMediaScope {accountId:string;spaceId:string;api?:ApiClient;readonly managedRead?:{current():boolean;read(asset:import('../lib/notebookDocument').PaperAsset,document:import('../lib/notebookDocument').PaperDocument):Promise<Blob>}}
export interface NotebookMirrorExpectation {
 expectedMarkdown:string;
 /** IndexedDB metadata can share the receipt's atomic commit; native uses its own durable setter. */
 commitMetadata?:(draft:Draft,current?:()=>boolean)=>Promise<Draft>;
}
export type NotebookMarkdownWriter=(value:string,expected?:NotebookMirrorExpectation)=>void|boolean|Promise<void|boolean>;
export type NoteTool='text'|'pen'|'highlighter'|'eraser';
interface Props {onRestoreVersion?:PaperHistoryCopyCallback;metadata?:Partial<SubjectNoteDocument>;noteId:string;markdown:string;onChange:NotebookMarkdownWriter;media:NotebookMediaScope;readOnly?:boolean;closingUI?:boolean;searchNavigation?:PaperSearchNavigation}
/** One paper surface. Rich text/images share the editor; ink covers the same page. */
export function NotebookEditor(props:Props) { return <PaperNotebook {...props}/>; }
/** Historical rendering kept for reversible migration inspection. */
export function LegacyNotebookEditor({noteId,markdown,onChange,media,readOnly=false}:Props) {
 const tabVisible=useWorkspaceTabVisible();
 const [tool,setTool]=useState<NoteTool>('text');const [color,setColor]=useState('#20343b');const [width,setWidth]=useState(3);
 const [version,setVersion]=useState('');const [notice,setNotice]=useState('');const [initial,setInitial]=useState<string|null>(null);
 const [inkGeometry,setInkGeometry]=useState({top:52,height:1100});const sheet=useRef<HTMLDivElement>(null);
 const uploader=useRef<((file:File)=>Promise<LocalBlob|undefined>)|null>(null);const documentId=noteBoardId(noteId);
 useEffect(()=>{
  if(!tabVisible)return;
  let stopped=false;
  const refresh=async()=>{
   if(media.api)await synchronizeSpace(media.api,media.accountId,media.spaceId,()=>!stopped);
   const draft=(await listDrafts(media.accountId,media.spaceId)).find(d=>d.type==='whiteboard'&&d.documentId===documentId);
   if(stopped)return;setVersion(`${draft?.baseVersion??0}:${draft?.syncState??'local'}:${draft?.updatedAt??0}`);
   dispatchEvent(new CustomEvent('dowze:note-media',{detail:{accountId:media.accountId,spaceId:media.spaceId}}));
  };
  // Existing photographs become nodes in this note's writing surface, without moving original bytes.
  void listDrafts(media.accountId,media.spaceId).then(drafts=>{
   const old=drafts.find(d=>d.type==='whiteboard'&&d.documentId===documentId);
   const oldContent=old?.content as {paperLayout?:number;photos?:{id:string;name:string}[]}|undefined;
   const photos=oldContent?.paperLayout?[]:oldContent?.photos??[];
   const missing=photos.filter(p=>!markdown.includes(photoReference(documentId,p.id)));
   if(!stopped)setInitial(markdown+missing.map(p=>`\n\n![${p.name.replace(/[\[\]\\]/g,'')}](${photoReference(documentId,p.id)})`).join(''));
  }).catch(()=>{if(!stopped){setInitial(markdown);setNotice('Les pièces jointes attendent leur chargement.');}});
  const sync=continuousSync(refresh,()=>{if(!stopped)setNotice('Cette note est conservée sur cet appareil. Synchronisation en attente.');});
  const resume=()=>sync.request(true);addEventListener('online',resume);resume();
  return()=>{stopped=true;sync.stop();removeEventListener('online',resume);};
 },[noteId,media.accountId,media.spaceId,media.api,documentId,tabVisible]);
 useEffect(()=>{
  const root=sheet.current;if(!root||!tabVisible)return;
  const measure=()=>{const page=root.querySelector<HTMLElement>('.ProseMirror');if(!page)return;const a=root.getBoundingClientRect(),b=page.getBoundingClientRect();setInkGeometry({top:b.top-a.top+root.scrollTop,height:Math.max(1100,page.scrollHeight)});};
  const observer=new ResizeObserver(measure);observer.observe(root);const timer=setInterval(measure,500);measure();
  return()=>{observer.disconnect();clearInterval(timer);};
 },[initial,tabVisible]);
 const upload=async(file:File)=>{
  if(readOnly)throw Error('Cette note est en lecture seule.');
  const photo=await uploader.current?.(file);if(!photo)throw Error('L’image n’a pas pu être enregistrée. Réessayez.');return photoReference(documentId,photo.id);
 };
 const action=(action:'undo'|'redo')=>dispatchEvent(new CustomEvent('dowze:ink-action',{detail:{documentId,action}}));
 return <div className={`notebook-composition note-paper-composition is-${tool}`}>
  <div className="note-sheet" ref={sheet}>
   {initial===null?<p role="status">Ouverture de la note…</p>:<Suspense fallback={<p role="status">Ouverture de la note…</p>}><MarkdownNoteEditor key={noteId} noteId={noteId} initialMarkdown={initial} externalMarkdown={markdown} onChange={value=>onChange(value)} media={media} onUploadImage={upload} paperTools={{tool:readOnly?'text':tool,color,width,onTool:readOnly?()=>{}:setTool,onColor:setColor,onWidth:setWidth,onAction:action}} readOnly={readOnly}/></Suspense>}
   <div className={`note-ink-layer ${tool==='text'||readOnly?'is-passive':''}`} style={{top:inkGeometry.top,height:inkGeometry.height}}>
    <Drawing key={`${media.accountId}:${media.spaceId}:${noteId}`} pageMode api={readOnly?undefined:media.api} accountId={media.accountId} spaceId={media.spaceId} documentId={documentId} syncedVersion={version} editing={tabVisible&&tool!=='text'&&!readOnly} inkTool={tool==='text'?'pen':tool} inkColor={color} inkWidth={width} readOnly={readOnly} registerUploader={fn=>{uploader.current=fn;}} onNotice={setNotice}/>
   </div>
  </div>
  {notice&&<p className="notebook-media-status" role="status">{notice}</p>}
 </div>;
}
