import {Plugin,PluginKey,type EditorState,type Transaction} from '@milkdown/kit/prose/state';
import {Decoration,DecorationSet} from '@milkdown/kit/prose/view';
import type {Node} from '@milkdown/kit/prose/model';
import {MAX_PAPER_EDITOR_SEARCH_RANGES,type PaperEditorSearchRange} from './paperEditorSearch.ts';
interface Highlight {document:Node;ranges:readonly PaperEditorSearchRange[];decorations:DecorationSet}
const key=new PluginKey<Highlight|null>('paper-editor-search');
const allows=(current:()=>boolean)=>{try{return current()===true;}catch{return false;}};
/** Presentation metadata only. It never changes doc/selection or enters undo. */
export function paperEditorSearchTransaction(state:EditorState,ranges:readonly PaperEditorSearchRange[]|null):Transaction{
 return state.tr.setMeta(key,ranges).setMeta('addToHistory',false);
}
export function createPaperEditorSearchPlugin(current:()=>boolean):Plugin<Highlight|null>{
 const retired=new WeakSet<Highlight>();
 return new Plugin<Highlight|null>({key,state:{init:()=>null,apply(tr,previous){
  if(tr.docChanged||!allows(current))return null;const ranges=tr.getMeta(key) as readonly PaperEditorSearchRange[]|null|undefined;if(ranges===undefined)return previous&&!retired.has(previous)?previous:null;if(ranges===null||!ranges.length||ranges.length>MAX_PAPER_EDITOR_SEARCH_RANGES)return null;
  if(ranges.some(range=>!Number.isSafeInteger(range.from)||!Number.isSafeInteger(range.to)||range.from<0||range.to<=range.from||range.to>tr.doc.content.size||!tr.doc.resolve(range.from).parent.inlineContent||!tr.doc.resolve(range.to).parent.inlineContent))return null;
  const copied=Object.freeze(ranges.map(range=>Object.freeze({from:range.from,to:range.to}))),decorations=DecorationSet.create(tr.doc,copied.map(range=>Decoration.inline(range.from,range.to,{class:'paper-editor-search-hit','data-paper-editor-search':'true',style:'background-color:var(--paper-editor-search-background,transparent);box-shadow:var(--paper-editor-search-outline,none);color:inherit;'})));
  return {document:tr.doc,ranges:copied,decorations};
 }},props:{decorations(state){const found=key.getState(state);if(!found)return DecorationSet.empty;if(found.document!==state.doc||!allows(current))retired.add(found);return !retired.has(found)?found.decorations:DecorationSet.empty;}}});
}
