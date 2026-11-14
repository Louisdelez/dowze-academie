/** Notebook shortcuts never replace an editor's own keymap or native IME. */
export type PaperNotebookShortcutAction='search'|'print'|'undo'|'redo'|'focus'|'help'|'escape'|'previous-page'|'next-page'|'tool-text'|'tool-pen'|'tool-highlighter'|'tool-eraser'|'tool-select';
export interface PaperNotebookShortcutKey {
 key:string;ctrlKey?:boolean;metaKey?:boolean;altKey?:boolean;shiftKey?:boolean;
 repeat?:boolean;defaultPrevented?:boolean;isComposing?:boolean;keyCode?:number;altGraph?:boolean;
}
export interface PaperNotebookShortcutEnvironment {editing:boolean;modal:boolean;surface:boolean;composing:boolean}
export interface PaperNotebookShortcutDescription {action:PaperNotebookShortcutAction;keys:string;label:string;surfaceOnly?:boolean}
export const PAPER_NOTEBOOK_SHORTCUTS:readonly PaperNotebookShortcutDescription[]=Object.freeze([
 {action:'search',keys:'Ctrl/Cmd + F',label:'Rechercher dans la note'},
 {action:'print',keys:'Ctrl/Cmd + P',label:'Ouvrir l’aperçu avant impression'},
 {action:'undo',keys:'Ctrl/Cmd + Z',label:'Annuler une action du carnet'},
 {action:'redo',keys:'Ctrl/Cmd + Maj + Z · Ctrl + Y',label:'Rétablir une action du carnet'},
 {action:'focus',keys:'Ctrl/Cmd + Maj + F',label:'Activer ou quitter le mode concentration'},
 {action:'help',keys:'?',label:'Afficher cette aide'},
 {action:'escape',keys:'Échap',label:'Fermer l’aide ou quitter le mode concentration'},
 {action:'previous-page',keys:'Alt + Page précédente',label:'Aller à la page précédente'},
 {action:'next-page',keys:'Alt + Page suivante',label:'Aller à la page suivante'},
 {action:'tool-text',keys:'T',label:'Choisir l’outil texte',surfaceOnly:true},
 {action:'tool-pen',keys:'P',label:'Choisir le stylo',surfaceOnly:true},
 {action:'tool-highlighter',keys:'H',label:'Choisir le surligneur',surfaceOnly:true},
 {action:'tool-eraser',keys:'E',label:'Choisir la gomme',surfaceOnly:true},
 {action:'tool-select',keys:'V',label:'Choisir la sélection',surfaceOnly:true},
].map(value=>Object.freeze(value)) as PaperNotebookShortcutDescription[]);

export function paperNotebookShortcut(key:PaperNotebookShortcutKey,environment:PaperNotebookShortcutEnvironment):PaperNotebookShortcutAction|null {
 if(key.defaultPrevented||key.repeat||key.isComposing||key.keyCode===229||key.altGraph||environment.composing||environment.editing||environment.modal)return null;
 const modifier=!!key.ctrlKey!==!!key.metaKey,value=key.key.toLowerCase();
 if(modifier&&!key.altKey){
  if(value==='f')return key.shiftKey?'focus':'search';
  if(value==='p'&&!key.shiftKey)return 'print';
  if(value==='z')return key.shiftKey?'redo':'undo';
  if(value==='y'&&key.ctrlKey&&!key.shiftKey)return 'redo';
  return null;
 }
 if(key.ctrlKey||key.metaKey)return null;
 if(key.altKey)return !key.shiftKey?(key.key==='PageUp'?'previous-page':key.key==='PageDown'?'next-page':null):null;
 if(key.key==='Escape'&&!key.shiftKey)return 'escape';
 if(key.key==='?')return 'help';
 if(!environment.surface||key.shiftKey)return null;
 return ({t:'tool-text',p:'tool-pen',h:'tool-highlighter',e:'tool-eraser',v:'tool-select'} as const)[value as 't'|'p'|'h'|'e'|'v']??null;
}

interface KeyTarget {target:EventTarget|null;composedPath?:()=>EventTarget[]}
const element=(value:EventTarget|null):Element|null=>value&&typeof (value as Node).nodeType==='number'?((value as Node).nodeType===1?value as Element:(value as Node).parentElement):null;
/** Public DOM inspection only; no focus, selection, key dispatch or PM access. */
export function paperNotebookShortcutEnvironment(event:KeyTarget,composing=false):PaperNotebookShortcutEnvironment {
 let path:EventTarget[]=[];try{path=event.composedPath?.()??[];}catch{}
 const targets=[event.target,...path].map(element).filter((value):value is Element=>!!value),target=targets[0],doc=target?.ownerDocument;
 const editing=targets.some(value=>!!value.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"],[role="spinbutton"]'));
 let modal=targets.some(value=>!!value.closest('dialog[open],[role="dialog"],[role="alertdialog"],[aria-modal="true"],[inert]'));
 if(!modal&&doc)modal=Array.from(doc.querySelectorAll('dialog[open],[role="dialog"],[role="alertdialog"],[aria-modal="true"]')).some(value=>{
  if(value.closest('[hidden],[aria-hidden="true"]'))return false;
  const style=doc.defaultView?.getComputedStyle(value);return style?.display!=='none'&&style?.visibility!=='hidden';
 });
 return {editing,modal,surface:targets.some(value=>!!value.closest('[data-paper-command-surface]')),composing};
}
