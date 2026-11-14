import {Type,Pencil,Highlighter,Eraser,ImagePlus,Undo2,Redo2,MoreHorizontal} from 'lucide-react';
import {useRef} from 'react';
import type {NoteTool} from './NotebookEditor';
export interface PaperTools {tool:NoteTool;color:string;width:number;onTool:(tool:NoteTool)=>void;onColor:(color:string)=>void;onWidth:(width:number)=>void;onAction:(action:'undo'|'redo')=>void}
export function NotePaperTools({tools,onImage,readOnly}:{tools:PaperTools;onImage:(file:File)=>Promise<void>;readOnly:boolean}) {
 const input=useRef<HTMLInputElement>(null);
 return <div className="note-paper-tools" role="group" aria-label="Outils de la page">
  {([['text','Écrire',Type],['pen','Stylo',Pencil],['highlighter','Surligneur',Highlighter],['eraser','Gomme',Eraser]] as const).map(([mode,label,Icon])=><button key={mode} type="button" aria-label={label} title={label} aria-pressed={tools.tool===mode} disabled={readOnly} onMouseDown={e=>e.preventDefault()} onClick={()=>tools.onTool(mode)}><Icon aria-hidden="true"/></button>)}
  <label className="note-ink-color" title="Couleur de l’encre"><input type="color" aria-label="Couleur de l’encre" value={tools.color} disabled={readOnly} onChange={e=>tools.onColor(e.target.value)}/></label>
  <select aria-label="Épaisseur du trait" value={tools.width} disabled={readOnly} onChange={e=>tools.onWidth(Number(e.target.value))}><option value={2}>Fin</option><option value={3}>Normal</option><option value={6}>Épais</option></select>
  {tools.tool!=='text'&&<><button type="button" aria-label="Annuler le trait" title="Annuler le trait" disabled={readOnly} onClick={()=>tools.onAction('undo')}><Undo2/></button><button type="button" aria-label="Rétablir le trait" title="Rétablir le trait" disabled={readOnly} onClick={()=>tools.onAction('redo')}><Redo2/></button></>}
  <button type="button" aria-label="Insérer une image dans la note" title="Insérer une image" disabled={readOnly} onMouseDown={e=>e.preventDefault()} onClick={()=>input.current?.click()}><ImagePlus/></button>
  <button type="button" aria-label="Autres outils de mise en forme" title="Autres outils" onMouseDown={e=>e.preventDefault()} onClick={e=>{const bar=e.currentTarget.closest('.note-unified-toolbar');bar?.classList.toggle('is-expanded');e.currentTarget.setAttribute('aria-expanded',String(bar?.classList.contains('is-expanded')));}}><MoreHorizontal/></button>
  <input ref={input} hidden type="file" aria-label="Image à insérer dans la note" accept="image/png,image/jpeg,image/webp" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void onImage(file);}}/>
 </div>;
}
