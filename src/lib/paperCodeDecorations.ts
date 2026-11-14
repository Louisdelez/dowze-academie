import {$prose} from '@milkdown/kit/utils';
import {Plugin,PluginKey} from '@milkdown/kit/prose/state';
import {Decoration,DecorationSet} from '@milkdown/kit/prose/view';
import type {Node} from '@milkdown/kit/prose/model';
import {loadPaperCodeLanguage,paperCodeRanges} from './paperCodeHighlight';
const key=new PluginKey<DecorationSet>('paper-code-colours');
const decorate=(doc:Node)=>{
 const decorations:Decoration[]=[];
 doc.descendants((node,pos)=>{if(node.type.name==='code_block'&&String(node.attrs.language).toLowerCase()!=='latex')for(const range of paperCodeRanges(node.textContent,String(node.attrs.language??'')))decorations.push(Decoration.inline(pos+1+range.from,pos+1+range.to,{class:range.className}));});
 return DecorationSet.create(doc,decorations);
};
export const paperCodeDecorations=$prose(()=>new Plugin<DecorationSet>({
 key,state:{init:(_,state)=>decorate(state.doc),apply:(tr,previous)=>tr.docChanged||tr.getMeta(key)?decorate(tr.doc):previous.map(tr.mapping,tr.doc)},
 props:{decorations:state=>key.getState(state)},
 view(view){let disposed=false;const requested=new Set<string>();const request=()=>view.state.doc.descendants(node=>{if(node.type.name!=='code_block')return;const language=String(node.attrs.language??'');if(!language||language.toLowerCase()==='latex'||requested.has(language))return;requested.add(language);void loadPaperCodeLanguage(language).then(()=>{if(!disposed)view.dispatch(view.state.tr.setMeta(key,true).setMeta('addToHistory',false));});});request();return {update(){request();},destroy(){disposed=true;}};}
}));
