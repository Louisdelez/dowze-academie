import {measureMarkdownPageOffsets} from './paperTextSourceMap';
import {textFlowBreaks,type TextBand} from './paperTextFlow.ts';
import {fitPaperFlowMath,paperFlowContentElement,paperFlowChromeSelector} from './paperRichFlowLayout';
/** Browser layout measurements in paper units, independent of the current zoom. */
function measureUnrotated(source:HTMLElement,width:number,height:number,markdown?:string){
 const root=source.getBoundingClientRect(),scale=root.width/width;if(!Number.isFinite(scale)||scale<=0)return null;const bands:TextBand[]=[];const content=paperFlowContentElement(source);
 const walker=document.createTreeWalker(content,NodeFilter.SHOW_TEXT);let count=0;
 while(walker.nextNode()){if(++count>100000)throw Error('Le texte est trop complexe pour une mise en page immédiate.');const node=walker.currentNode;if(!node.textContent?.trim()||(node.parentElement?.closest('.katex,'+paperFlowChromeSelector)))continue;
  const range=document.createRange();range.selectNodeContents(node);for(const rect of range.getClientRects())if(rect.height>0&&rect.width>0)bands.push({top:(rect.top-root.top)/scale,bottom:(rect.bottom-root.top)/scale,unbreakable:true});range.detach();
 }
 for(const element of content.querySelectorAll('img,.katex-display,.katex:not(.katex-display .katex)')){if(element.closest(paperFlowChromeSelector))continue;const r=element.getBoundingClientRect();if(r.height>0)bands.push({top:(r.top-root.top)/scale,bottom:(r.bottom-root.top)/scale,unbreakable:true});}
 // Keep the final border/padding of rich blocks visible, even when only paragraph margins trail it.
 for(const element of content.querySelectorAll<HTMLElement>('pre,table,blockquote')){const r=element.getBoundingClientRect();if(r.height<=0)continue;const style=getComputedStyle(element),edge=Math.max(1,parseFloat(style.borderBottomWidth)||0,element.tagName==='PRE'?parseFloat(style.paddingBottom)||0:0);bands.push({top:(r.bottom-root.top)/scale-Math.min(edge,r.height/scale),bottom:(r.bottom-root.top)/scale,unbreakable:true});}
 // Ordinary rows move together. A row taller than the frame continues at its cell text lines.
 const splitRows:{top:number;bottom:number}[]=[];for(const row of content.querySelectorAll('table tr')){const r=row.getBoundingClientRect(),band={top:(r.top-root.top)/scale,bottom:(r.bottom-root.top)/scale};if(r.height<=0)continue;if(band.bottom-band.top<=height+.1)bands.push({...band,unbreakable:true});else splitRows.push(band);}
 const body=Math.max((source.getBoundingClientRect().height/scale),bands.reduce((m,b)=>Math.max(m,b.bottom),0));const breaks=textFlowBreaks(body,height,bands);const paintTop=bands.reduce((value,band)=>Math.min(value,band.top),bands.length?Infinity:0),paintBottom=bands.reduce((value,band)=>Math.max(value,band.bottom),0);return {breaks,height:body,paintTop,paintBottom,bands,...(markdown!==undefined?{sourceOffsets:splitRows.some(row=>breaks.slice(1,-1).some(cut=>cut>row.top+.1&&cut<row.bottom-.1))?undefined:measureMarkdownPageOffsets(source,markdown,breaks,scale)}:{})};
}

/** A detached view copy is measured at 100%, so zoom/rotation never changes the logical pagination. */
export function measureTextFlow(source:HTMLElement,width:number,height:number,markdown?:string){
 const host=document.createElement('div'),copy=source.cloneNode(true) as HTMLElement;host.className='paper-object has-text-flow';host.style.cssText=`position:fixed;left:-30000px;top:0;width:${width}px;pointer-events:none;`;host.style.font=getComputedStyle(source).font;host.style.setProperty('--flow-height',height+'px');copy.removeAttribute('id');copy.style.transform='none';copy.style.width=width+'px';host.appendChild(copy);document.body.appendChild(host);try{const mathFits=fitPaperFlowMath(copy,width,height),result=measureUnrotated(copy,width,height,markdown);if(result){source.dataset.flowMeasuredHeight=String(result.height);source.dataset.flowMeasuredBreaks=JSON.stringify(result.breaks);return {...result,mathFits};}return null;}finally{host.remove();}
}
