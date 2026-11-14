import {useId,useMemo,useRef,useState} from 'react';
import type {PaperCommand,PaperDocument,PaperPage} from '../lib/notebookDocument';
import {paperMillimetres,type PageTemplate} from '../lib/paperTemplates';
import {PaperBackground} from './PaperBackground';
import './paper-built-in-templates.css';

const templates:readonly {value:PageTemplate;label:string;description:string}[]=[
 {value:'standard',label:'Standard',description:'Le motif courant de votre papier.'},
 {value:'cornell',label:'Prise de notes Cornell',description:'Repères, notes et synthèse.'},
 {value:'music',label:'Portées musicales',description:'Des portées de cinq lignes.'},
 {value:'weekly',label:'Semaine',description:'Sept espaces, du lundi au dimanche.'},
];
interface Props {document:PaperDocument;page:PaperPage;disabled:boolean;onCommit:(command:PaperCommand)=>boolean;onNotice:(message:string)=>void}
/** Paper-only projections. Choosing a card does not write; Apply reuses the
 * current page command and the parent's existing authority/undo path. */
export function PaperBuiltInTemplates({document,page,disabled,onCommit,onNotice}:Props){
 const name=useId(),source=useMemo(()=>({document,page}),[document,page,disabled]);
 const latest=useRef({source,disabled,onCommit,onNotice});latest.current={source,disabled,onCommit,onNotice};
 const [choice,setChoice]=useState<{source:typeof source;template:PageTemplate}|null>(null);
 const selected=choice?.source===source?choice.template:page.template??'standard',blocked=disabled||!!page.pdf;
 const current=()=>latest.current.source===source&&!latest.current.disabled&&!source.page.pdf;
 const apply=()=>{if(!current()||selected===(source.page.template??'standard'))return;
  if(latest.current.onCommit({type:'update-page',page:{...source.page,template:selected}})&&current()){
   setChoice(null);latest.current.onNotice('Modèle de papier appliqué. Vos annotations gardent leurs dimensions et leur position.');
  }
 };
 return <details className="paper-built-in-templates" onToggle={event=>{if(!event.currentTarget.open)setChoice(null);}}>
  <summary>Aperçus des papiers</summary>
  {page.pdf?<p>Le fond et le format d’origine du PDF sont conservés. Ajoutez une page vierge pour choisir un papier.</p>:<>
   <p className="paper-built-in-template-dimensions">{paperMillimetres(page.width)} × {paperMillimetres(page.height)} mm · Espacement et orientation de la page courante.</p>
   <fieldset disabled={blocked}><legend>Choisir un modèle avec aperçu</legend><div className="paper-built-in-template-grid">
    {templates.map(template=><label className="paper-built-in-template-choice" key={template.value} data-paper-template-choice={template.value}>
     <input type="radio" name={name} value={template.value} checked={selected===template.value} onChange={()=>{if(current())setChoice({source,template:template.value});}}/>
     <span className="paper-built-in-template-preview" aria-hidden="true"><span className="paper-built-in-template-sheet" style={{aspectRatio:`${page.width} / ${page.height}`,maxWidth:104*page.width/page.height,backgroundColor:page.color}}><PaperBackground page={{...page,template:template.value}}/></span></span>
     <span className="paper-built-in-template-label">{template.label}</span><small>{template.description}</small>
    </label>)}
   </div></fieldset>
   <div className="paper-built-in-template-actions"><button type="button" disabled={blocked||selected===(page.template??'standard')} onClick={apply}>Appliquer ce modèle</button><button type="button" disabled={blocked||choice?.source!==source} onClick={()=>setChoice(null)}>Annuler le choix</button></div>
   <small>L’aperçu ne contient que le papier. Le texte, les dessins, les images et les enregistrements restent intacts.</small>
  </>}
 </details>;
}
