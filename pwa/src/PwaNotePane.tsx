import {useEffect,useRef,useState,type ReactNode} from 'react';
import {ChevronLeft} from 'lucide-react';
import {NotebookEditor,type NotebookMediaScope,type NotebookMirrorExpectation} from '../../src/components/NotebookEditor';
import type {PaperHistoryCopyCallback} from '../../src/lib/paperHistoryVersions';
import type {PaperSearchNavigation} from '../../src/lib/notebookSearchNavigation';
import type {SubjectNoteDocument} from '../../src/types';
import type {Draft} from './storage';
import {notebookIdentityDigest} from '../../src/lib/notebookIdentity';
import './pwa-note-chrome.css';
/** A closed pane cannot start new metadata writes, even when its note is reopened. */
export function PwaNotePane({note,media,primary,readOnly,closingUI=false,searchNavigation,onRestoreVersion,onUpdate,onBack,footer}:{onRestoreVersion?:PaperHistoryCopyCallback;note:Draft;searchNavigation?:PaperSearchNavigation;media:NotebookMediaScope;primary:boolean;readOnly?:boolean;closingUI?:boolean;onUpdate:(note:Draft,changes:Partial<Draft>,expected?:NotebookMirrorExpectation)=>Promise<boolean>;onBack:()=>void;footer:ReactNode}){
 const owner=JSON.stringify([note.accountId,note.spaceId,note.documentId]),alive=useRef(true),epoch=useRef({owner,value:0});
 if(epoch.current.owner!==owner)epoch.current={owner,value:epoch.current.value+1};const captured=epoch.current.value;
 const closing=useRef(closingUI);closing.current=closingUI;
 const valid=()=>alive.current&&epoch.current.value===captured&&!readOnly;
 const [title,setTitle]=useState(note.title),pending=useRef(0),serial=useRef(0),latest=useRef(note);latest.current=note;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;serial.current++;};},[owner]);
 useEffect(()=>{if(!pending.current)setTitle(note.title);},[owner,note.title]);
 const changeTitle=(value:string)=>{if(!valid()||closing.current)return;setTitle(value);const ticket=++serial.current;pending.current++;
  void onUpdate(note,{title:value}).finally(()=>{pending.current--;if(valid()&&ticket===serial.current&&!pending.current&&latest.current.title===value)setTitle(value);});
 };
 return <section className="editor pwa-note-pane" aria-label={`Note ${note.title||'Sans titre'}`}><header className="pwa-note-heading"><button className="mobile-notes-back pwa-notebook-library-back" onClick={()=>{if(alive.current&&!closing.current)onBack();}}><ChevronLeft aria-hidden="true"/>Mes notes</button><label id={`pwa-note-title-${notebookIdentityDigest(note.documentId)}`}>Titre<input name="note-title" aria-label={`Titre de ${primary?'la première':'la deuxième'} note`} autoComplete="off" value={title} disabled={readOnly||closingUI} onChange={event=>changeTitle(event.target.value)}/></label><div className="editor-footer pwa-note-actions">{footer}</div></header><NotebookEditor onRestoreVersion={onRestoreVersion} searchNavigation={searchNavigation} metadata={{...(note.content as Partial<SubjectNoteDocument>),title:note.title}} noteId={note.documentId} markdown={(note.content as {markdown?:string}).markdown??''} onChange={(markdown,expected)=>valid()&&(!closing.current||typeof expected?.commitMetadata==='function')?onUpdate(note,{content:{...(note.content as object),markdown}},expected):Promise.resolve(false)} media={media} readOnly={readOnly} closingUI={closingUI}/></section>;
}
