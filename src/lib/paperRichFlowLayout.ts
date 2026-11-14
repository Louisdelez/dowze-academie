/** Interactive adornments are never canonical painted content. */
export const paperFlowChromeSelector='.katex-mathml,.cm-gutters,.milkdown-top-bar,.milkdown-toolbar,.studio-editor-help,.markdown-editor-loading,.operation,.image-edit,.image-resize-handle,.milkdown-link-preview,.milkdown-link-edit,.milkdown-latex-inline-edit,.milkdown-slash-menu,.milkdown-block-edit,.cell-handle,.preview-label,.preview-divider';
export const paperFlowContentElement=(source:HTMLElement)=>source.querySelector<HTMLElement>('.ProseMirror')??source;
/** Presentation-only sizing. No node is replaced and no canonical Markdown is rewritten. */
export interface PaperMathFit {path:string;fontSize:number}
// A bordered object can expose a viewport two pixels narrower than its logical
// source. Reserve four pixels on either side, also covering glyph rounding.
const mathHorizontalInset=4;
const pathFrom=(root:HTMLElement,node:Element)=>{const path:string[]=[];let current:Element|null=node;while(current&&current!==root){const parent:HTMLElement|null=current.parentElement;if(!parent)return '';path.unshift(`:nth-child(${[...parent.children].indexOf(current)+1})`);current=parent;}return current===root?path.join(' > '):'';};
/** Display KaTeX's HTML wrapper can be constrained to the frame while its bases
 * still paint far outside it. Measure the union of those painted layout boxes. */
function mathPaintBounds(painted:HTMLElement){
 const wrapper=painted.getBoundingClientRect(),boxes=[...painted.querySelectorAll<HTMLElement>('.base')].map(base=>base.getBoundingClientRect()).filter(box=>box.width>0&&box.height>0);
 if(!boxes.length)return wrapper;
 const bounds=boxes.reduce((all,box)=>({left:Math.min(all.left,box.left),right:Math.max(all.right,box.right),top:Math.min(all.top,box.top),bottom:Math.max(all.bottom,box.bottom)}),{left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity});
 const top=Math.min(bounds.top,wrapper.top),bottom=Math.max(bounds.bottom,wrapper.bottom);
 return {...bounds,top,bottom,width:bounds.right-bounds.left,height:bottom-top};
}
/** KaTeX dimensions are expressed in em, so font sizing reserves its real scaled layout box. */
export function fitPaperFlowMath(source:HTMLElement,width:number,height:number):PaperMathFit[]{
 const fits:PaperMathFit[]=[];
 for(const element of paperFlowContentElement(source).querySelectorAll<HTMLElement>('.katex')){
  if(element.closest(paperFlowChromeSelector))continue;
  const painted=element.querySelector<HTMLElement>('.katex-html')??element,cell=element.closest<HTMLElement>('td,th'),cellStyle=cell?getComputedStyle(cell):undefined;
  const availableWidth=Math.max(1,cell?cell.getBoundingClientRect().width-parseFloat(cellStyle?.paddingLeft??'0')-parseFloat(cellStyle?.paddingRight??'0'):width),availableHeight=Math.max(1,height-40),naturalFont=parseFloat(getComputedStyle(element).fontSize);
  const rect=mathPaintBounds(painted);if(!(rect.width>0&&rect.height>0&&naturalFont>0))continue;
  const paintWidth=Math.max(.5,availableWidth-mathHorizontalInset*2-.5);
  let font=naturalFont*Math.min(1,paintWidth/rect.width,(availableHeight-.5)/rect.height);
  if(font>=naturalFont-.01)continue;
  // Rounding or a surrounding table can slightly change the first fit. Keep all painted pixels within the frame.
  for(let attempt=0;attempt<4;attempt++){element.style.fontSize=`${font}px`;const box=mathPaintBounds(painted),factor=Math.min(1,paintWidth/box.width,(availableHeight-.5)/box.height);if(factor>=.999)break;font*=factor;}
  const path=pathFrom(source,element);if(path)fits.push({path,fontSize:font});
 }
 return fits;
}
/** Scoped stylesheet keeps presentation changes outside ProseMirror's observed source DOM. */
export function paperMathFitCss(sourceId:string,fits:readonly PaperMathFit[]){
 if(!/^[A-Za-z][A-Za-z0-9_-]*$/.test(sourceId))throw Error('Identifiant de mise en page invalide.');
 return fits.map(fit=>`#${sourceId} > ${fit.path}.katex{font-size:${fit.fontSize}px!important}`).join('\n');
}
