import {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {$node,$view,$remark,$prose} from '@milkdown/kit/utils';
import {Plugin} from '@milkdown/kit/prose/state';
import {getDraft} from '../../pwa/src/storage';
import {isPaperDocument,notebookDocumentId,type PaperDocument,type PaperAsset} from '../lib/notebookDocument';
import {resolvePaperPhotoReference} from '../lib/paperAssets';
import {PaperAssetImage} from './PaperObjectVisual';
import {paperImageDimensions,paperImageAvailableWidth,paperImageFrameHeight,paperImageRatioMarker,validPaperImageRatio,paperImageOverlayPlacement} from '../lib/paperImageSizing';
import type {NotebookMediaScope} from './NotebookEditor';

export interface NotePhotoContext {getDocument:()=>PaperDocument|undefined;current:()=>boolean}
const privateImage=(src:unknown)=>typeof src==='string'&&src.startsWith('dowze-photo:');
const check=(context:NotePhotoContext)=>{if(!context.current())throw Error('Le carnet ou le compte a changé pendant le chargement de l’image.');};
/** A newly inserted image may be durable before React receives its refreshed manifest. */
export async function resolveEditorPaperPhoto(src:string,media:NotebookMediaScope,context:NotePhotoContext):Promise<{document:PaperDocument;asset:PaperAsset;reference:{documentId:string;id:string}}>{
 check(context);const document=context.getDocument();if(!document)throw Error('Le carnet de cette image attend son ouverture. Sa référence reste conservée.');
 const resolved=resolvePaperPhotoReference(document,src);if(resolved.kind==='asset')return {document,asset:resolved.asset,reference:resolved.reference};
 if(resolved.kind!=='unavailable'||resolved.reason!=='missing-file')throw Error(resolved.kind==='unavailable'?resolved.message:'Cette image ne possède pas une référence de carnet.');
 const noteId=document.noteId,scope={accountId:media.accountId,spaceId:media.spaceId},identity={...scope,type:'whiteboard' as const,documentId:notebookDocumentId(noteId)},stored=await getDraft(identity);check(context);
 if(context.getDocument()?.noteId!==noteId||!stored||stored.accountId!==scope.accountId||stored.spaceId!==scope.spaceId||stored.documentId!==identity.documentId||stored.type!=='whiteboard'||stored.identityAlias||stored.staged||!isPaperDocument(stored.content)||stored.content.noteId!==noteId)throw Error('Le fichier de cette image n’est pas encore conservé dans le carnet courant. Sa référence reste intacte.');
 const durable=resolvePaperPhotoReference(stored.content,src);if(durable.kind!=='asset')throw Error(durable.kind==='unavailable'?durable.message:'Cette référence d’image est incompatible.');return {document:stored.content,asset:durable.asset,reference:durable.reference};
}
function PrivateNoteImage({src,alt,title,ratio,media,context,onReady}:{src:string;alt:string;title:string|null;ratio:number;media:NotebookMediaScope;context?:NotePhotoContext;onReady?:()=>void}){
 const noteId=context?.getDocument()?.noteId,key=JSON.stringify([media.accountId,media.spaceId,noteId??null,src]),[state,setState]=useState<{key:string;resolved?:Awaited<ReturnType<typeof resolveEditorPaperPhoto>>;error?:string}>({key:''}),latest=useRef({key,context});latest.current={key,context};
 useEffect(()=>{let stopped=false;const current=()=>!stopped&&latest.current.key===key&&(latest.current.context?.current()??false)&&latest.current.context?.getDocument()?.noteId===noteId;
  const load=async()=>{if(stopped)return;setState({key});try{if(!context)throw Error('Le carnet de cette image doit être ouvert avant son affichage.');const resolved=await resolveEditorPaperPhoto(src,media,{getDocument:()=>latest.current.context?.getDocument(),current});if(current())setState({key,resolved});}catch(error){if(!stopped&&latest.current.key===key)setState({key,error:String(error instanceof Error?error.message:error)});}};
  void load();const retry=()=>void load();addEventListener('online',retry);addEventListener('dowze:note-media',retry);return()=>{stopped=true;removeEventListener('online',retry);removeEventListener('dowze:note-media',retry);};
 },[key,media.api]);
 const visible=state.key===key?state:undefined;
 return visible?.resolved?<PaperAssetImage asset={visible.resolved.asset} document={visible.resolved.document} referenceDocumentId={visible.resolved.reference.documentId} media={media} alt={alt} title={title??undefined} imageRatio={ratio} onReady={onReady} current={()=>latest.current.context?.current()??false}/>:<span role="status" className="paper-asset-missing note-photo-pending" data-image-error={visible?.error?'true':undefined}>{visible?.error||'Chargement de l’image…'}</span>;
}
/** Private images are inline document nodes; text ordering, image alt/title and undo remain together. */
export function notePhotoPlugins(media:NotebookMediaScope,context?:NotePhotoContext) {
 const node=$node('dowze_note_photo',()=>({
  group:'inline',inline:true,atom:true,draggable:true,selectable:true,isolating:true,priority:200,
  attrs:{src:{default:''},alt:{default:''},title:{default:null},ratio:{default:1},ratioPresent:{default:false}},
  parseDOM:[{tag:'img[data-dowze-photo]',getAttrs:dom=>({src:(dom as HTMLElement).dataset.dowzePhoto,alt:(dom as HTMLElement).getAttribute('alt')??'',title:(dom as HTMLElement).getAttribute('title'),ratio:validPaperImageRatio(Number((dom as HTMLElement).dataset.dowzeRatio))?Number((dom as HTMLElement).dataset.dowzeRatio):1,ratioPresent:(dom as HTMLElement).hasAttribute('data-dowze-ratio')})}],
  toDOM:node=>['img',{'data-dowze-photo':node.attrs.src,alt:node.attrs.alt,title:node.attrs.title,'data-dowze-ratio':node.attrs.ratio}],
  parseMarkdown:{match:node=>node.type==='dowze-note-photo',runner:(state,node,type)=>{state.addNode(type,{src:node.url,alt:node.alt??'',title:node.title??null,ratio:validPaperImageRatio(node.dowzeImageRatio)?node.dowzeImageRatio:1,ratioPresent:node.dowzeImageRatio!==undefined});}},
  toMarkdown:{match:node=>node.type.name==='dowze_note_photo',runner:(state,node)=>{state.addNode('image',undefined,undefined,{url:node.attrs.src,alt:node.attrs.alt,title:node.attrs.title});if(node.attrs.ratio!==1||node.attrs.ratioPresent)state.addNode('html',undefined,`<!-- dowze-image-size:v1 ratio=${validPaperImageRatio(node.attrs.ratio)?node.attrs.ratio:1} -->`);}}
 }));
 const view=$view(node,()=> (initial,editor,getPos)=>{
  const dom=document.createElement('span'),imageHost=document.createElement('span'),controls=document.createElement('span'),details=document.createElement('span'),resizeButton=document.createElement('button'),edit=document.createElement('button'),description=document.createElement('input'),caption=document.createElement('input');
  dom.className='note-photo-node';dom.contentEditable='false';controls.className='image-edit note-photo-controls';imageHost.className='note-photo-image';details.className='note-photo-details';details.hidden=true;
  resizeButton.type='button';resizeButton.className='image-resize-handle';resizeButton.setAttribute('aria-label','Redimensionner l’image');resizeButton.style.touchAction='none';resizeButton.style.minWidth='44px';resizeButton.style.minHeight='44px';edit.type='button';edit.textContent='Description';edit.setAttribute('aria-label','Modifier la description de l’image');description.setAttribute('aria-label','Description de l’image');caption.setAttribute('aria-label','Légende et titre de l’image');details.append(description,caption);controls.append(edit,resizeButton,details);dom.append(imageHost,controls);
  const root=createRoot(imageHost);let alive=true,current=initial,resize:{id:number;x:number;y:number;base:number;height:number;ratio:number;nextRatio:number;src:string;angle:number;scale:number}|null=null;
  const active=()=>alive&&(context?.current()??false)&&editor.editable;
  const dimensions=(ratio:number)=>{const image=imageHost.querySelector('img');return image?paperImageDimensions(image.naturalWidth,image.naturalHeight,paperImageAvailableWidth(image),ratio,paperImageFrameHeight(image)):undefined;};
  const positionControls=()=>{const image=imageHost.querySelector('img');if(!image)return;const control=paperImageOverlayPlacement(image,160),detail=paperImageOverlayPlacement(image,320);if(control&&detail){dom.style.setProperty('--paper-photo-control-left',control.left+'px');dom.style.setProperty('--paper-photo-detail-left',(detail.left-control.left)+'px');dom.style.setProperty('--paper-photo-detail-width',detail.width+'px');controls.style.width=control.width+'px';controls.style.maxWidth=control.width+'px';}
   const clip=dom.closest<HTMLElement>('.paper-flow-clip');if(!clip)return;try{const box=dom.getBoundingClientRect(),frame=clip.getBoundingClientRect(),object=dom.closest('.paper-object'),page=dom.closest('.paper-page'),turn=new DOMMatrix(object?getComputedStyle(object).transform:undefined),zoom=new DOMMatrix(page?getComputedStyle(page).transform:undefined),angle=Math.atan2(turn.b,turn.a),scale=Math.hypot(zoom.a,zoom.b)||1,dx=box.left+box.width/2-frame.left-frame.width/2,dy=box.top+box.height/2-frame.top-frame.height/2,height=clip.offsetHeight,y=height/2+(-Math.sin(angle)*dx+Math.cos(angle)*dy)/scale-dom.offsetHeight/2,overlayHeight=44+(details.hidden?0:details.scrollHeight||80),top=y>=0&&y<height?Math.max(-y,Math.min(0,height-y-overlayHeight)):0;controls.style.setProperty('top',top+'px','important');}catch{}
  };
  const paint=()=>{positionControls();const image=imageHost.querySelector('img');if(image){image.dataset.dowzePhoto=current.attrs.src;image.dataset.dowzeRatio=String(current.attrs.ratio);}if(document.activeElement!==description)description.value=current.attrs.alt;if(document.activeElement!==caption)caption.value=current.attrs.title??'';for(const control of [edit,description,caption])control.disabled=!active();resizeButton.disabled=!active()||!dimensions(current.attrs.ratio);};
  const fit=(ratio:number)=>{const image=imageHost.querySelector('img'),size=dimensions(ratio);if(!image||!size)return;image.style.height=size.height+'px';image.style.width=size.width+'px';image.style.setProperty('--paper-image-height',image.style.height);};
  const render=(ratio:number=current.attrs.ratio)=>{if(!alive)return;const capturedSrc=current.attrs.src,viewContext=context?{getDocument:()=>context.getDocument(),current:()=>alive&&current.attrs.src===capturedSrc&&context.current()}:undefined;root.render(<PrivateNoteImage src={capturedSrc} alt={current.attrs.alt} title={current.attrs.title} ratio={ratio} media={media} context={viewContext} onReady={()=>{if(alive){paint();fit(resize?.nextRatio??current.attrs.ratio);}}}/>);paint();};
  const set=(attrs:Record<string,unknown>)=>{if(!active())return;const pos=getPos();if(pos===undefined)return;const actual=editor.state.doc.nodeAt(pos);if(!actual||actual.type!==initial.type||actual.attrs.src!==current.attrs.src)return;editor.dispatch(editor.state.tr.setNodeMarkup(pos,undefined,{...actual.attrs,...attrs}));};
  const release=()=>{const gesture=resize;resize=null;if(!gesture)return;try{if(resizeButton.hasPointerCapture(gesture.id))resizeButton.releasePointerCapture(gesture.id);}catch{}};
  const cancel=()=>{release();fit(current.attrs.ratio);render();};
  edit.addEventListener('click',()=>{if(!active())return;details.hidden=!details.hidden;positionControls();if(!details.hidden)description.focus();});description.addEventListener('input',()=>set({alt:description.value}));caption.addEventListener('input',()=>set({title:caption.value||null}));
  resizeButton.addEventListener('pointerdown',event=>{const size=dimensions(current.attrs.ratio);if(!active()||!size||event.button!==0||resize)return;event.preventDefault();event.stopPropagation();try{resizeButton.setPointerCapture(event.pointerId);}catch{return;}let angle=0,scale=1;try{const object=dom.closest('.paper-object'),page=dom.closest('.paper-page'),turn=new DOMMatrix(object?getComputedStyle(object).transform:undefined),zoom=new DOMMatrix(page?getComputedStyle(page).transform:undefined);angle=Math.atan2(turn.b,turn.a);scale=Math.hypot(zoom.a,zoom.b)||1;}catch{}resize={id:event.pointerId,x:event.clientX,y:event.clientY,base:size.baseHeight,height:size.height,ratio:current.attrs.ratio,nextRatio:current.attrs.ratio,src:current.attrs.src,angle,scale};});
  resizeButton.addEventListener('pointermove',event=>{if(!resize||resize.id!==event.pointerId)return;event.preventDefault();event.stopPropagation();if(!active()||resize.src!==current.attrs.src||dimensions(current.attrs.ratio)?.baseHeight!==resize.base){cancel();return;}const delta=(-Math.sin(resize.angle)*(event.clientX-resize.x)+Math.cos(resize.angle)*(event.clientY-resize.y))/resize.scale;if(!delta)return;const requested=Math.max(16,resize.height+delta),size=dimensions(Math.min(10000,requested/resize.base));if(!size)return;resize.nextRatio=size.height/resize.base;fit(resize.nextRatio);render(resize.nextRatio);});
  resizeButton.addEventListener('pointerup',event=>{if(!resize||resize.id!==event.pointerId)return;event.preventDefault();event.stopPropagation();const gesture=resize;release();if(active()&&gesture.src===current.attrs.src&&dimensions(current.attrs.ratio)?.baseHeight===gesture.base)set({ratio:gesture.nextRatio});else render();});
  resizeButton.addEventListener('pointercancel',cancel);resizeButton.addEventListener('lostpointercapture',()=>{if(resize)cancel();});resizeButton.addEventListener('keydown',event=>{if(!active()||!['ArrowUp','ArrowDown','Home'].includes(event.key))return;event.preventDefault();set({ratio:event.key==='Home'?1:Math.min(10000,Math.max(.05,current.attrs.ratio+(event.key==='ArrowUp'?0.1:-0.1)))});});
  render();return {dom,update(next){if(next.type!==initial.type)return false;if(next.attrs.src!==current.attrs.src||next.attrs.ratio!==current.attrs.ratio)release();current=next;render();return true;},ignoreMutation:()=>true,stopEvent:event=>event.target instanceof Element&&!!event.target.closest('input,button'),selectNode:()=>dom.classList.add('is-selected'),deselectNode:()=>dom.classList.remove('is-selected'),destroy:()=>{alive=false;release();queueMicrotask(()=>root.unmount());}};
 });
 const remark=$remark('dowze-private-photo',()=>()=> (tree:any)=>{
  const walk=(parent:any)=>{if(!Array.isArray(parent.children))return;for(let index=0;index<parent.children.length;index++){
   let child=parent.children[index];const image=child.type==='paragraph'&&child.children?.length===1?child.children[0]:child,following=parent.children[index+1],html=following?.type==='paragraph'&&following.children?.length===1?following.children[0]:following,ratio=html?.type==='html'?paperImageRatioMarker(html.value):undefined;
   if(['image','image-block','dowze-note-photo'].includes(image.type)&&privateImage(image.url)&&ratio!==undefined){image.dowzeImageRatio=ratio;parent.children.splice(index+1,1);}
   if(['image','image-block'].includes(child.type)&&privateImage(child.url)){const image={...child,type:'dowze-note-photo'};parent.children[index]=child.type==='image-block'?{type:'paragraph',children:[image]}:image;}
   else walk(child);
  }};walk(tree);
 });
 const normalizeUpload=$prose(()=>new Plugin({appendTransaction(transactions,_old,state){
  if(!transactions.some(t=>t.docChanged))return null;const replacements:{pos:number;node:import('@milkdown/kit/prose/model').Node}[]=[];
  state.doc.descendants((n,pos)=>{if(['image-block','image'].includes(n.type.name)&&privateImage(n.attrs.src))replacements.push({pos,node:n});});if(!replacements.length)return null;const tr=state.tr;
  for(const {pos,node:n} of replacements.reverse()){const attrs={src:n.attrs.src,alt:n.attrs.alt??n.attrs.caption??'',title:n.attrs.title??null,ratio:validPaperImageRatio(n.attrs.ratio)?n.attrs.ratio:1,ratioPresent:n.attrs.ratioPresent===true},image=state.schema.nodes.dowze_note_photo.create(attrs);if(n.type.name==='image-block')tr.replaceWith(pos,pos+n.nodeSize,state.schema.nodes.paragraph.create(null,image));else tr.setNodeMarkup(pos,state.schema.nodes.dowze_note_photo,attrs);}
  return tr;
 }}));
 return [...remark,node,view,normalizeUpload];
}
