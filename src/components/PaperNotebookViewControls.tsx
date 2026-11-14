import {useId,useRef} from 'react';
import {createPortal} from 'react-dom';
import {Focus,Minimize,Keyboard} from 'lucide-react';
import type {PaperNotebookControls} from '../hooks/usePaperNotebookControls';
import {PAPER_NOTEBOOK_SHORTCUTS} from '../lib/paperNotebookKeyboard';
import './paper-notebook-view-controls.css';

/** Returns siblings so the existing concentration toolbar keeps its exit
 * visible. The help is non-modal: it never makes a composing editor inert. */
export function PaperNotebookViewControls({controls}:{controls:PaperNotebookControls}){
 const id=useId(),help=useRef<HTMLButtonElement>(null);
 const close=()=>{if(!controls.closeHelp())return;if(controls.current()&&help.current?.isConnected)help.current.focus({preventScroll:true});};
 return <>
  <button type="button" className="paper-focus-toggle paper-view-control" disabled={controls.disabled} aria-label={controls.focusMode?'Quitter le mode concentration':'Mode concentration'} aria-pressed={controls.focusMode} title="Mode concentration · Ctrl/Cmd + Maj + F · Échap pour quitter" onClick={controls.toggleFocus}>{controls.focusMode?<Minimize/>:<Focus/>}{controls.focusMode&&<span>Quitter</span>}</button>
  <button ref={help} type="button" className="paper-view-control" disabled={controls.disabled} aria-label="Raccourcis du carnet" aria-expanded={controls.helpOpen} aria-controls={id} onClick={()=>controls.helpOpen?close():controls.openHelp()}><Keyboard/></button>
  {controls.helpOpen&&createPortal(<section id={id} className="paper-shortcut-help" aria-label="Raccourcis du carnet" onKeyDown={event=>{if(event.key==='Escape'&&!event.nativeEvent.isComposing&&!event.defaultPrevented){event.preventDefault();event.stopPropagation();close();}}}>
   <header><strong>Raccourcis du carnet</strong><button type="button" aria-label="Fermer l’aide des raccourcis" onClick={close}>Fermer</button></header>
   <p>Ctrl sous Windows/Linux, Cmd sur Mac. Ces raccourcis s’appliquent hors des champs de saisie, des compositions et des fenêtres de dialogue. Le texte conserve ses propres commandes.</p>
   <dl>{PAPER_NOTEBOOK_SHORTCUTS.filter(item=>item.action==='escape'||controls.available(item.action)).map(item=><div key={item.action}><dt><kbd>{item.keys}</kbd></dt><dd>{item.label}{item.surfaceOnly?' · surface de la page':''}</dd></div>)}</dl>
   <p>Le mode concentration garde le carnet et ses enregistrements montés. Le bouton Quitter reste dans la barre d’outils.</p>
  </section>,document.body)}
 </>;
}
