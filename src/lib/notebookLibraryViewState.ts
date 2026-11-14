import {sortNotebookLibraryNotes,type NotebookLibrarySortScope,type NotebookLibrarySortStorage,type NotebookLibrarySortableNote} from './notebookLibrarySort.ts';

export interface NotebookLibraryScroll {readonly top:number;readonly left:number;readonly anchorId:string|null;readonly anchorOffset:number}
export interface NotebookLibraryViewState {readonly schema:1;readonly mode:'grid'|'list';readonly filter:string;readonly query:string;readonly expanded:readonly string[];readonly picked:readonly string[];readonly main:NotebookLibraryScroll;readonly sidebar:NotebookLibraryScroll}
export const NOTEBOOK_LIBRARY_VIEW_READ_ERROR='La vue enregistrée est indisponible. La vue par défaut est utilisée.';
export const NOTEBOOK_LIBRARY_VIEW_WRITE_ERROR='La vue reste conservée pour cette session, mais son enregistrement sur cet appareil a échoué.';
export const NOTEBOOK_LIBRARY_RECENT_LIMIT=30;
export const NOTEBOOK_LIBRARY_RECENT_DESCRIPTION='Les 30 dernières notes modifiées, hors corbeille. Les dates de modification invalides sont exclues.';
const maxSavedLength=512*1024;
const id=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=200;
const ownKeys=(value:object,keys:readonly string[])=>Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const ids=(value:unknown,max:number):value is string[]=>Array.isArray(value)&&value.length<=max&&value.every(id)&&new Set(value).size===value.length;
const scroll=(value:unknown):value is NotebookLibraryScroll=>record(value)&&ownKeys(value,['top','left','anchorId','anchorOffset'])&&[value.top,value.left].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1e9)&&(value.anchorId===null||id(value.anchorId))&&typeof value.anchorOffset==='number'&&Number.isFinite(value.anchorOffset)&&Math.abs(value.anchorOffset)<=1e9;
export const emptyNotebookLibraryScroll=():NotebookLibraryScroll=>({top:0,left:0,anchorId:null,anchorOffset:0});
export const defaultNotebookLibraryView=():NotebookLibraryViewState=>({schema:1,mode:'grid',filter:'all',query:'',expanded:[],picked:[],main:emptyNotebookLibraryScroll(),sidebar:emptyNotebookLibraryScroll()});
export function isNotebookLibraryViewState(value:unknown):value is NotebookLibraryViewState{
 return record(value)&&ownKeys(value,['schema','mode','filter','query','expanded','picked','main','sidebar'])&&value.schema===1&&(value.mode==='grid'||value.mode==='list')&&id(value.filter)&&typeof value.query==='string'&&value.query.length<=2048&&ids(value.expanded,10000)&&ids(value.picked,100000)&&scroll(value.main)&&scroll(value.sidebar);
}
export function notebookLibraryViewPreferenceKey(scope:NotebookLibrarySortScope):string{
 if(![scope.accountId,scope.spaceId].every(value=>typeof value==='string'&&value.length>0&&value.length<=1000))throw TypeError('Le périmètre de la vue est indisponible.');
 return 'paper-library-view:v1:'+JSON.stringify([scope.accountId,scope.spaceId]);
}
export function readNotebookLibraryView(scope:NotebookLibrarySortScope,storage:()=>Pick<NotebookLibrarySortStorage,'getItem'>):{view:NotebookLibraryViewState;notice:string}{
 try{const raw=storage().getItem(notebookLibraryViewPreferenceKey(scope));if(raw===null)return {view:defaultNotebookLibraryView(),notice:''};if(raw.length>maxSavedLength)throw Error('Oversized view');const view:unknown=JSON.parse(raw);if(!isNotebookLibraryViewState(view))throw Error('Invalid view');return {view,notice:''};}catch{return {view:defaultNotebookLibraryView(),notice:NOTEBOOK_LIBRARY_VIEW_READ_ERROR};}
}
export function writeNotebookLibraryView(scope:NotebookLibrarySortScope,view:NotebookLibraryViewState,storage:()=>Pick<NotebookLibrarySortStorage,'setItem'>):boolean{
 if(!isNotebookLibraryViewState(view))return false;
 // Refuse an oversized preference visibly; never truncate accepted selections.
 if(view.picked.reduce((size,value)=>size+value.length+3,0)+view.expanded.reduce((size,value)=>size+value.length+3,0)>maxSavedLength)return false;
 try{const raw=JSON.stringify(view);if(raw.length>maxSavedLength)return false;storage().setItem(notebookLibraryViewPreferenceKey(scope),raw);return true;}catch{return false;}
}
/** Activity is the supplied note.updatedAt, not opening/viewing or server rights.
 * Pick the most recently modified incarnation per ID, then the exact ID breaks
 * equal instants. Original rows and dates are never rewritten.
 */
export function recentNotebookLibraryNotes<T extends NotebookLibrarySortableNote>(notes:readonly T[],classified:Readonly<Record<string,{deletedAt?:string|null}>>):T[]{
 const unique=new Map<string,T>();
 for(const note of notes){const time=Date.parse(note.updatedAt);if(classified[note.id]?.deletedAt||!Number.isFinite(time))continue;const previous=unique.get(note.id);if(!previous||time>Date.parse(previous.updatedAt))unique.set(note.id,note);}
 return sortNotebookLibraryNotes([...unique.values()],'updated').slice(0,NOTEBOOK_LIBRARY_RECENT_LIMIT);
}
function visibleScrollBounds(node:HTMLElement){
 const bounds=node.getBoundingClientRect(),toolbar=node.querySelector<HTMLElement>('.note-library-controls')?.getBoundingClientRect();
 const top=toolbar&&toolbar.height>0&&toolbar.bottom>bounds.top&&toolbar.top<bounds.bottom?Math.max(bounds.top,Math.min(bounds.bottom,toolbar.bottom)):bounds.top;
 return {top,bottom:bounds.bottom,height:Math.max(0,bounds.bottom-top)};
}
export function captureNotebookLibraryScroll(node:HTMLElement,withAnchor:boolean):NotebookLibraryScroll{
 const bounds=visibleScrollBounds(node);let anchorId:string|null=null,anchorOffset=0;
 if(withAnchor)for(const card of node.querySelectorAll<HTMLElement>('[data-library-note-id]')){const rect=card.getBoundingClientRect();if(rect.bottom>bounds.top&&rect.top<bounds.bottom){anchorId=card.dataset.libraryNoteId??null;anchorOffset=rect.top-bounds.top;break;}}
 return {top:Math.max(0,node.scrollTop),left:Math.max(0,node.scrollLeft),anchorId,anchorOffset};
}
export function restoreNotebookLibraryScroll(node:HTMLElement,position:NotebookLibraryScroll):void{
 // Establish the saved scrolling/sticky context before measuring the anchor.
 // A fresh scroller still has the heading above its toolbar at scrollTop=0.
 node.scrollTop=Math.max(0,position.top);node.scrollLeft=position.left;
 let top=node.scrollTop;
 if(position.anchorId!==null){const card=[...node.querySelectorAll<HTMLElement>('[data-library-note-id]')].find(row=>row.dataset.libraryNoteId===position.anchorId);if(card){const bounds=visibleScrollBounds(node),rect=card.getBoundingClientRect();const offset=rect.height>0&&bounds.height>0?Math.max(1-rect.height,Math.min(bounds.height-1,position.anchorOffset)):position.anchorOffset;top=node.scrollTop+rect.top-bounds.top-offset;}}
 node.scrollTop=Math.max(0,top);
}
