import {TextSelection,type EditorState,type Transaction} from '@milkdown/kit/prose/state';
import type {Node} from '@milkdown/kit/prose/model';
/** Apply the smallest rich-document replacement. The current selection maps through only that edit. */
export function remotePaperEditorTransaction(state:EditorState,next:Node):Transaction|null{
 const start=state.doc.content.findDiffStart(next.content);if(start===null)return null;
 const end=state.doc.content.findDiffEnd(next.content)!;const overlap=start-Math.min(end.a,end.b),a=end.a+Math.max(0,overlap),b=end.b+Math.max(0,overlap);
 let tr=state.tr.replace(start,a,next.slice(start,b));
 if(!tr.doc.eq(next))tr=state.tr.replaceWith(0,state.doc.content.size,next.content);
 // Marks can change without changing any text or node positions. Keep an in-text selection exactly there.
 if(state.selection instanceof TextSelection&&state.doc.content.size===next.content.size&&state.doc.textContent===next.textContent){
  const {$anchor,$head}=state.selection;if(tr.doc.resolve($anchor.pos).parent.inlineContent&&tr.doc.resolve($head.pos).parent.inlineContent)tr.setSelection(TextSelection.create(tr.doc,$anchor.pos,$head.pos));
 }
 return tr.setMeta('addToHistory',false).setMeta('dowzeRemote',true);
}
