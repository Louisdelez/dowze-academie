import type {Editor} from '@milkdown/kit/core';
import type {NodeSchema} from '@milkdown/kit/transformer';
import type {DOMOutputSpec,Node as ProseNode} from '@milkdown/kit/prose/model';
import type {EditorView} from '@milkdown/kit/prose/view';
import type {Selection} from '@milkdown/kit/prose/state';
import {nodesCtx} from '@milkdown/kit/core';
import {Plugin} from '@milkdown/kit/prose/state';
import {closeHistory} from '@milkdown/kit/prose/history';
import {paragraphSchema,headingSchema} from '@milkdown/kit/preset/commonmark';
import {$node,$remark,$prose} from '@milkdown/kit/utils';
import {PAPER_TEXT_FONTS,PAPER_TEXT_STYLES,paperTextStyle,paperTextStyleDOM,paperTextStyleFromDOM,paperTextStyleFromNode,remarkPaperTextStyles,serializePaperTextStyle,type PaperTextStyle} from './paperTextStyle';
import {createPaperTextStyleFavoriteController,type PaperTextStyleFavoriteOwner,type PaperTextStyleFavoriteController} from './paperTextStyleFavorites';

function styledSchema(base:NodeSchema):NodeSchema{return {...base,
 attrs:{...base.attrs,dowzeTextStyle:{default:null,validate:(value:unknown)=>{if(value!==null&&!paperTextStyle(value))throw Error('Le style de ce bloc doit être vérifié.');}}},
 parseDOM:base.parseDOM?.map(rule=>'tag'in rule?{...rule,getAttrs:(dom:HTMLElement)=>{const previous=rule.getAttrs?rule.getAttrs(dom):rule.attrs;if(previous===false)return false;return {...previous,dowzeTextStyle:paperTextStyleFromDOM(dom)};}}:rule),
 toDOM:node=>{const output=base.toDOM!(node),style=paperTextStyle(node.attrs.dowzeTextStyle);if(!style)return output;
  if(!Array.isArray(output)||typeof output[0]!=='string')throw Error('Ce bloc ne peut pas afficher son style.');
  const hasAttrs=!!output[1]&&typeof output[1]==='object'&&!Array.isArray(output[1])&&!(output[1] instanceof Node);
  return [output[0],{...(hasAttrs?output[1] as Record<string,unknown>:{}),...paperTextStyleDOM(style)},...output.slice(hasAttrs?2:1)] as DOMOutputSpec;
 },
 parseMarkdown:{match:base.parseMarkdown.match,runner:(state,node,type)=>{const style=paperTextStyleFromNode(node);if(!style){base.parseMarkdown.runner(state,node,type);return;}
  // Same paragraph/heading content parser. No wrapper, mark, text or node kind changes.
  state.openNode(type,{...(node.type==='heading'?{level:node.depth}:{}),dowzeTextStyle:style});
  if(node.children)state.next(node.children);else state.addText(typeof node.value==='string'?node.value:'');state.closeNode();
 }},
 toMarkdown:{match:base.toMarkdown.match,runner:(state,node)=>{base.toMarkdown.runner(state,node);if(node.attrs.dowzeTextStyle!==null){const style=paperTextStyle(node.attrs.dowzeTextStyle);if(!style)throw Error('Le style de ce bloc doit être vérifié.');state.addNode('html',undefined,serializePaperTextStyle(style));}}}
};}
interface Block {node:ProseNode;pos:number}
/** Text blocks in a table/code/math are excluded, rather than emitting an unsupported codec. */
function selectedBlocks(view:EditorView):Block[]{
 const {from,to}=view.state.selection,blocks:Block[]=[];let unsupported=false;
 view.state.doc.nodesBetween(from,to,(node,pos)=>{
  if(node.type.spec.tableRole||['code_block','math_block'].includes(node.type.name)){unsupported=true;return false;}
  if(!node.isTextblock)return;
  const ancestors=view.state.doc.resolve(Math.min(pos+1,view.state.doc.content.size));
  if(Array.from({length:ancestors.depth},(_,index)=>ancestors.node(index+1)).some(parent=>parent.type.spec.tableRole)||!['paragraph','heading'].includes(node.type.name)||node.content.size>0&&node.textContent.length===0){unsupported=true;return false;}
  blocks.push({node,pos});if(blocks.length>1000)unsupported=true;return false;
 });return unsupported?[]:blocks;
}
export interface PaperTextStyleEditor {mount:(toolbar:HTMLElement)=>void;refresh:()=>void;destroy:()=>void;settled:()=>Promise<void>;pending:()=>boolean}
/** Formatting uses one guarded PM transaction. Optional favourites write only
 * their separate account/year snapshots; the applied resolved style is local to the block. */
export function configurePaperTextStyles(editor:Editor,current:()=>boolean,favoriteOwner?:PaperTextStyleFavoriteOwner):PaperTextStyleEditor{
 let view:EditorView|null=null,root:HTMLDivElement|null=null,target:{document:ProseNode;selection:Selection}|null=null,draft:PaperTextStyle|null=null;
 let named:HTMLSelectElement|null=null,font:HTMLSelectElement|null=null,size:HTMLInputElement|null=null,apply:HTMLButtonElement|null=null,reset:HTMLButtonElement|null=null,status:HTMLSpanElement|null=null;
 let favorites:PaperTextStyleFavoriteController|null=null,closed:Promise<void>|null=null,destroyed=false,favoriteRoot:HTMLDetailsElement|null=null,favoriteStatus:HTMLSpanElement|null=null;
 let favoriteSelect:HTMLSelectElement|null=null,label:HTMLInputElement|null=null,weight:HTMLSelectElement|null=null,leading:HTMLSelectElement|null=null,saveFavorite:HTMLButtonElement|null=null,renameFavorite:HTMLButtonElement|null=null,deleteFavorite:HTMLButtonElement|null=null,applyFavorite:HTMLButtonElement|null=null;
 const handlers:{node:HTMLElement;type:string;handler:EventListener}[]=[];
 const alive=()=>{try{return !!view&&view.dom.isConnected&&view.editable&&!view.composing&&current();}catch{return false;}};
 const sameTarget=()=>!!view&&!!target&&view.state.doc===target.document&&view.state.selection.eq(target.selection);
 const say=(value:string)=>{if(status)status.textContent=value;};
 const reflect=(value:PaperTextStyle|null)=>{if(!named||!font||!size)return;named.value=value?.name??'normal';font.value=value?.font??'dowze';size.value=String(value?.size??16);};
 const resolved=()=>{if(!view)return null;if(draft&&sameTarget())return draft;const blocks=selectedBlocks(view);if(!blocks.length)return null;const styles=blocks.map(block=>paperTextStyle(block.node.attrs.dowzeTextStyle)??PAPER_TEXT_STYLES.body),first=styles[0];return styles.every(style=>JSON.stringify(style)===JSON.stringify(first))?first:null;};
 const refresh=()=>{
  if(!root||!view)return;const valid=alive(),blocks=valid?selectedBlocks(view):[],available=valid&&blocks.length>0;
  if(target&&!sameTarget()){target=null;draft=null;say('La sélection a changé.');}
  if(!target){const styles=blocks.map(block=>paperTextStyle(block.node.attrs.dowzeTextStyle)),first=styles[0]??null,same=styles.every(style=>JSON.stringify(style)===JSON.stringify(first));reflect(same?first:null);if(!same&&named)named.value='mixed';}
  for(const element of [named,font,size,reset])if(element)element.disabled=!available;if(apply)apply.disabled=!available||!target||!draft;
  if(favorites&&favoriteSelect){
   const state=favorites.state(),selected=favoriteSelect.value,values=state.styles;
   if(JSON.stringify([...favoriteSelect.options].slice(1).map(option=>[option.value,option.textContent]))!==JSON.stringify(values.map(value=>[value.id,value.label]))){favoriteSelect.replaceChildren();const blank=favoriteSelect.ownerDocument.createElement('option');blank.value='';blank.textContent='Choisir un favori';favoriteSelect.append(blank);for(const value of values){const option=favoriteSelect.ownerDocument.createElement('option');option.value=value.id;option.textContent=value.label;favoriteSelect.append(option);}favoriteSelect.value=values.some(value=>value.id===selected)?selected:'';}
   const enabled=available&&state.ready&&!state.saving,selectedValue=values.find(value=>value.id===favoriteSelect!.value),style=resolved();
   for(const element of [favoriteSelect,label,weight,leading])if(element)element.disabled=!enabled;
   if(saveFavorite)saveFavorite.disabled=!enabled||!style||state.styles.length>=20;
   for(const element of [renameFavorite,deleteFavorite])if(element)element.disabled=!enabled||!selectedValue;
   if(applyFavorite)applyFavorite.disabled=!enabled||!selectedValue||!draft||!sameTarget();
   if(weight)weight.value=String(style?.weight??400);if(leading)leading.value=String(style?.leading??160);
   if(favoriteStatus)favoriteStatus.textContent=state.saving?'Enregistrement du favori…':state.notice||(!state.ready?'Chargement des favoris…':'');
  }
 };
 const capture=()=>{if(!view||!alive()||!selectedBlocks(view).length)return false;target={document:view.state.doc,selection:view.state.selection};return true;};
 const custom=()=>{const activeView=view;if(!activeView||!capture()||!font||!size)return;const baseline=draft??paperTextStyle(selectedBlocks(activeView)[0]?.node.attrs.dowzeTextStyle)??PAPER_TEXT_STYLES.body;draft=paperTextStyle({...baseline,name:'custom',font:font.value,size:Number(size.value)});if(named)named.value='custom';say(draft?'':'Choisissez une taille entière entre 8 et 72.');refresh();};
 const commit=(value:PaperTextStyle|null)=>{
  if(!view||!alive()||!sameTarget()){say('Le bloc a changé avant l’application du style.');refresh();return;}
  const state=view.state,blocks=selectedBlocks(view);if(!blocks.length)return;const style=value===null?null:paperTextStyle(value);if(value!==null&&!style)return;
  const tr=state.tr;for(const block of blocks)if(JSON.stringify(paperTextStyle(block.node.attrs.dowzeTextStyle))!==JSON.stringify(style))tr.setNodeMarkup(block.pos,undefined,{...block.node.attrs,...(style?{dowzeTextStyle:style}:{dowzeTextStyle:null})});
  if(!tr.docChanged)return;if(!alive()||view.state!==state||!sameTarget())return;
  target=null;draft=null;view.dispatch(closeHistory(tr));say('Style appliqué.');refresh();
 };
 const clearControls=()=>{for(const {node,type,handler}of handlers)node.removeEventListener(type,handler);handlers.length=0;root?.remove();favoriteRoot?.remove();root=null;favoriteRoot=null;named=font=null;size=apply=reset=null;status=favoriteStatus=null;favoriteSelect=weight=leading=null;label=null;saveFavorite=renameFavorite=deleteFavorite=applyFavorite=null;target=null;draft=null;};
 const destroy=()=>{destroyed=true;clearControls();if(favorites&&!closed)closed=favorites.close();};
 const settled=()=>closed??favorites?.settled()??Promise.resolve();
 const on=(node:HTMLElement,type:string,handler:EventListener)=>{node.addEventListener(type,handler);handlers.push({node,type,handler});};
 editor.config(ctx=>{ctx.update(paragraphSchema.key,previous=>schemaContext=>styledSchema(previous(schemaContext)));ctx.update(headingSchema.key,previous=>schemaContext=>styledSchema(previous(schemaContext)));});
 // The stock doc runner omits the last empty paragraph as a typing area,
 // even when it carries resolved typography. Keep that one real block when
 // styled; every other document uses the original runner unchanged.
 // docSchema is $node (no .key), so use its public per-editor upsert API.
 editor.use($node('doc',ctx=>{
  const base=ctx.get(nodesCtx).find(([name])=>name==='doc')?.[1];if(!base)throw Error('Le schéma du document doit être disponible avant ses styles.');
  return {...base,toMarkdown:{...base.toMarkdown,runner:(state,node)=>{
   const last=node.lastChild;if(last?.type.name==='paragraph'&&last.content.size===0&&paperTextStyle(last.attrs.dowzeTextStyle)){state.openNode('root');state.next(node.content);return;}
   base.toMarkdown.runner(state,node);
  }}};
 }));
 editor.use($remark('dowze-text-style-v1',()=>remarkPaperTextStyles));
 editor.use($prose(()=>new Plugin({view:instance=>{view=instance;return {update:()=>refresh(),destroy:()=>{destroy();view=null;}};}})));
 return {refresh,destroy,settled,pending:()=>favorites?.pending()??false,mount:toolbar=>{
  clearControls();if(!view||destroyed)return;const doc=toolbar.ownerDocument;root=doc.createElement('div');root.className='note-text-style-controls';root.setAttribute('role','group');root.setAttribute('aria-label','Style des blocs sélectionnés');
  const select=(label:string,options:readonly (readonly [string,string])[])=>{const select=doc.createElement('select');select.setAttribute('aria-label',label);for(const [value,text]of options){const option=doc.createElement('option');option.value=value;option.textContent=text;select.append(option);}root!.append(select);return select;};
  named=select('Style du bloc',[['normal','Normal'],['body','Corps'],['title','Titre'],['subtitle','Sous-titre'],['caption','Légende'],['custom','Personnalisé'],['mixed','Plusieurs styles']]);for(const option of named.options)if(['custom','mixed'].includes(option.value))option.disabled=true;
  font=select('Police du bloc',PAPER_TEXT_FONTS.map(font=>[font.id,font.label] as const));size=doc.createElement('input');size.type='number';size.min='8';size.max='72';size.step='1';size.setAttribute('aria-label','Taille du bloc en pixels');root.append(size);
  apply=doc.createElement('button');apply.type='button';apply.textContent='Appliquer';apply.setAttribute('aria-label','Appliquer le style aux blocs sélectionnés');root.append(apply);
  reset=doc.createElement('button');reset.type='button';reset.textContent='Normal';reset.setAttribute('aria-label','Retirer le style des blocs sélectionnés');root.append(reset);
  status=doc.createElement('span');status.className='note-text-style-status';status.setAttribute('role','status');root.append(status);
  on(named,'change',()=>{if(!capture()||!named)return;if(named.value==='normal'){draft=null;commit(null);return;}const preset=PAPER_TEXT_STYLES[named.value as keyof typeof PAPER_TEXT_STYLES];if(preset){draft=preset;reflect(draft);say('');refresh();}});
  on(font,'change',custom);on(size,'input',custom);on(apply,'click',()=>{if(draft)commit(draft);});on(reset,'click',()=>{if(capture())commit(null);});toolbar.append(root);
  if(favoriteOwner){
   if(!favorites)favorites=createPaperTextStyleFavoriteController(favoriteOwner,refresh);
   favoriteRoot=doc.createElement('details');favoriteRoot.className='note-text-style-favorites';const summary=doc.createElement('summary');summary.textContent='Styles favoris';favoriteRoot.append(summary);
   const panel=doc.createElement('div');panel.setAttribute('role','group');panel.setAttribute('aria-label','Mes styles favoris');favoriteRoot.append(panel);
   const selectFavorite=(name:string,options:readonly (readonly [string,string])[])=>{const element=doc.createElement('select');element.setAttribute('aria-label',name);for(const[value,text]of options){const option=doc.createElement('option');option.value=value;option.textContent=text;element.append(option);}panel.append(element);return element;};
   favoriteSelect=selectFavorite('Style favori',[['','Choisir un favori']]);label=doc.createElement('input');label.type='text';label.maxLength=64;label.setAttribute('aria-label','Nom du style favori');label.placeholder='Nom du favori';panel.append(label);
   weight=selectFavorite('Graisse du bloc',[['400','Normal'],['600','Demi-gras'],['700','Gras']]);leading=selectFavorite('Interligne du bloc',[['125','1,25'],['135','1,35'],['140','1,40'],['160','1,60']]);
   const button=(name:string,text:string)=>{const button=doc.createElement('button');button.type='button';button.setAttribute('aria-label',name);button.textContent=text;panel.append(button);return button;};
   saveFavorite=button('Enregistrer un style favori','Enregistrer');renameFavorite=button('Renommer le style favori','Renommer');deleteFavorite=button('Supprimer le style favori','Supprimer');applyFavorite=button('Appliquer le style favori','Appliquer');favoriteStatus=doc.createElement('span');favoriteStatus.setAttribute('role','status');panel.append(favoriteStatus);
   const advanced=()=>{if(!view||!alive()||!weight||!leading)return;const base=resolved();if(!base||!capture())return;draft=paperTextStyle({...base,name:'custom',weight:Number(weight.value),leading:Number(leading.value)});reflect(draft);refresh();};
   on(weight,'change',advanced);on(leading,'change',advanced);
   const chooseStoredFavorite=(event:Event)=>{if(!alive()||!favorites||!favoriteSelect)return;const selected=favorites.state().styles.find(value=>value.id===favoriteSelect!.value);if(!selected){if(event.type==='change'){target=null;draft=null;refresh();}return;}if(!capture())return;draft=selected.style;if(label)label.value=selected.label;reflect(draft);refresh();};
   on(favoriteSelect,'change',chooseStoredFavorite);on(favoriteSelect,'focus',chooseStoredFavorite);
   on(saveFavorite,'click',()=>{const style=resolved();if(!alive()||!favorites||!label||!style)return;void favorites.change({type:'save',label:label.value,style}).then(()=>refresh());});
   on(renameFavorite,'click',()=>{if(!alive()||!favorites||!label||!favoriteSelect)return;void favorites.change({type:'rename',id:favoriteSelect.value,label:label.value}).then(()=>refresh());});
   on(deleteFavorite,'click',()=>{if(!alive()||!favorites||!favoriteSelect)return;void favorites.change({type:'delete',id:favoriteSelect.value}).then(()=>refresh());});
   on(applyFavorite,'click',()=>{if(!alive()||!favorites||!favoriteSelect)return;const selected=favorites.state().styles.find(value=>value.id===favoriteSelect!.value);if(selected&&draft&&JSON.stringify(draft)===JSON.stringify(selected.style))commit(draft);});
   toolbar.append(favoriteRoot);
  }
  refresh();
 }};
}
