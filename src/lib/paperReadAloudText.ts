import {fromMarkdown} from 'mdast-util-from-markdown';
import {gfm} from 'micromark-extension-gfm';
import {math} from 'micromark-extension-math';
import {gfmFromMarkdown} from 'mdast-util-gfm';
import {mathFromMarkdown} from 'mdast-util-math';
import type {PaperDocument,PaperObject} from './notebookDocument.ts';
import {copiedPageText} from './paperPageCopy.ts';
import {textFlowFingerprint} from './paperTextFlow.ts';

export const MAX_PAPER_READ_ALOUD_TEXT=100_000;
export const MAX_PAPER_READ_ALOUD_SOURCE=1_500_000;
export const MAX_PAPER_READ_ALOUD_NODES=100_000;
export const MAX_PAPER_READ_ALOUD_CHUNK=500;
export const MAX_PAPER_READ_ALOUD_CHUNKS=256;
export type PaperReadAloudUnavailableCode='invalid-source'|'page-unavailable'|'layout-pending'|'no-extracted-text'|'budget'|'segmentation-unavailable'|'unsupported-markdown';
export type PaperReadAloudTextResult=
 | Readonly<{status:'ready';pageId:string;text:string;chunks:readonly string[]}>
 | Readonly<{status:'empty';pageId:string;reason:string}>
 | Readonly<{status:'unavailable';pageId:string;code:PaperReadAloudUnavailableCode;reason:string}>;
interface AstNode {type:string;value?:string;alt?:string|null;lang?:string|null;children?:AstNode[]}
const containers=new Set(['root','paragraph','heading','blockquote','list','listItem','emphasis','strong','delete','link','linkReference','table','tableRow','tableCell','footnoteDefinition']);
const blocks=new Set(['paragraph','heading','blockquote','listItem','tableRow','tableCell','footnoteDefinition']);
const opaque=new Set(['definition','footnoteReference','thematicBreak','html','math','inlineMath']);
const explanations:Record<PaperReadAloudUnavailableCode,string>={
 'invalid-source':'Le contenu de cette page est incompatible avec la lecture vocale.',
 'page-unavailable':'Cette page n’est plus disponible.',
 'layout-pending':'La disposition du texte doit être actualisée avant de lire cette page.',
 'no-extracted-text':'Cette page ne contient pas de texte extrait à lire. La lecture vocale ne réalise pas d’OCR.',
 budget:'Cette page dépasse la capacité de lecture vocale. Répartissez son texte sur plusieurs pages.',
 'segmentation-unavailable':'La segmentation du texte nécessaire à la lecture vocale n’est pas disponible.',
 'unsupported-markdown':'Un passage de cette page ne peut pas être extrait pour la lecture vocale.'
};
class ExtractionRefusal {readonly code:PaperReadAloudUnavailableCode;constructor(code:PaperReadAloudUnavailableCode){this.code=code;}}
const refuse=(code:PaperReadAloudUnavailableCode):never=>{throw new ExtractionRefusal(code);};
const unavailable=(pageId:string,code:PaperReadAloudUnavailableCode):PaperReadAloudTextResult=>Object.freeze({status:'unavailable',pageId,code,reason:explanations[code]});

/** Read one immutable canonical page in stored object order (PDF text first).
 * Link destinations, raw HTML, TeX syntax, filenames, pixels and ink are never
 * transcribed. The caller keeps its own captured owner/document guard before
 * starting speech and between chunks. This pure helper creates no authority. */
export function preparePaperReadAloudText(input:{readonly document:PaperDocument;readonly pageId:string}):PaperReadAloudTextResult{
 const {document,pageId}=input;
 try{
  if(typeof Intl.Segmenter!=='function')return unavailable(pageId,'segmentation-unavailable');
  if(!document||!Array.isArray(document.pages)||!Array.isArray(document.objects)||document.pages.length>2_000||document.objects.length>MAX_PAPER_READ_ALOUD_NODES)return unavailable(pageId,'invalid-source');
  const pages=new Set(document.pages.map(page=>page.id));if(pages.size!==document.pages.length)return unavailable(pageId,'invalid-source');
  const page=document.pages.find(page=>page.id===pageId);if(!page)return unavailable(pageId,'page-unavailable');
  const segmenter=new Intl.Segmenter('fr',{granularity:'grapheme'}),parts:string[]=[];
  let visited=document.pages.length,sourceSize=0,plainSize=0,hasContent=!!page.pdf;
  const charge=(count=1)=>{visited+=count;if(visited>MAX_PAPER_READ_ALOUD_NODES)refuse('budget');};
  const source=(value:string)=>{sourceSize+=value.length;if(sourceSize>MAX_PAPER_READ_ALOUD_SOURCE)refuse('budget');return value;};
  const append=(value:string)=>{plainSize+=value.length;if(plainSize>MAX_PAPER_READ_ALOUD_SOURCE+MAX_PAPER_READ_ALOUD_NODES)refuse('budget');parts.push(value);};
  if(page.pdf){
   if(typeof page.pdf.text!=='string')return unavailable(pageId,'no-extracted-text');
   append(source(page.pdf.text));append('\n\n');
  }
  const pageText=(object:PaperObject):string=>{
   const text=object.markdown??'';if(typeof text!=='string')return refuse('invalid-source');source(text);
   const flow=object.textFlow;
   if(flow){
    if(object.kind!=='text'||flow.schema!==1||!Array.isArray(flow.pageIds)||!flow.pageIds.length||flow.pageIds.length>2_000||flow.pageIds[0]!==object.pageId||new Set(flow.pageIds).size!==flow.pageIds.length||flow.pageIds.some(id=>!pages.has(id))||!flow.pageIds.includes(pageId)||flow.source!==textFlowFingerprint(text,object.width,object.height))return refuse('layout-pending');
    const offsets=flow.sourceOffsets??(flow.pageIds.length===1?[0,text.length]:undefined);
    if(!Array.isArray(flow.breaks)||flow.breaks.length!==flow.pageIds.length+1||flow.breaks[0]!==0||flow.breaks.some((value,index)=>!Number.isFinite(value)||value<0||index>0&&value<=flow.breaks[index-1])||!offsets||offsets.length!==flow.pageIds.length+1||offsets[0]!==0||offsets.at(-1)!==text.length||offsets.some((value,index)=>!Number.isSafeInteger(value)||value<0||value>text.length||index>0&&value<offsets[index-1]))return refuse('layout-pending');
    const boundaries=new Set([0,text.length]);for(const cluster of segmenter.segment(text)){boundaries.add(cluster.index);boundaries.add(cluster.index+cluster.segment.length);}
    if(offsets.some(offset=>!boundaries.has(offset)))return refuse('layout-pending');
   }
   // This shared rich-range slicer must succeed. Never fall back to the entire
   // multipage markdown when sourceOffsets or rich clipping are not ready.
   try{return copiedPageText(object,pageId);}catch{return refuse('layout-pending');}
  };
  const appendMarkdown=(markdown:string)=>{
   const tree=fromMarkdown(markdown,{extensions:[gfm(),math()],mdastExtensions:[gfmFromMarkdown(),mathFromMarkdown()]}) as unknown as AstNode;
   const stack:{node:AstNode;after?:boolean}[]=[{node:tree}];
   while(stack.length){
    const {node,after}=stack.pop()!;if(after){append('\n');continue;}charge();
    if(containers.has(node.type)){
     const children=node.children??[];if(visited+stack.length+children.length>MAX_PAPER_READ_ALOUD_NODES)refuse('budget');
     if(blocks.has(node.type))stack.push({node,after:true});for(let index=children.length-1;index>=0;index--)stack.push({node:children[index]});continue;
    }
    if(opaque.has(node.type)||node.type==='code'&&String(node.lang??'').toLowerCase()==='latex')continue;
    if(node.type==='break'){append('\n');continue;}
    if(node.type==='image'||node.type==='imageReference'){if(typeof node.alt==='string')append(node.alt);continue;}
    if(node.type==='text'||node.type==='code'||node.type==='inlineCode'){if(typeof node.value!=='string')refuse('unsupported-markdown');append(node.value!);if(node.type==='code')append('\n');continue;}
    refuse('unsupported-markdown');
   }
  };
  const ids=new Set<string>();
  for(const object of document.objects){
   charge();
   const flow=object.textFlow;
   if(flow){if(!Array.isArray(flow.pageIds)||flow.pageIds.length>2_000)refuse('layout-pending');charge(flow.pageIds.length+(flow.breaks?.length??0)+(flow.sourceOffsets?.length??0));}
   if(object.pageId!==pageId&&!flow?.pageIds.includes(pageId))continue;
   if(ids.has(object.id))refuse('invalid-source');ids.add(object.id);
   if(object.kind==='text'||object.kind==='sticky'){const markdown=pageText(object);if(markdown.trim()){hasContent=true;appendMarkdown(markdown);}append('\n\n');}else hasContent=true;
  }
  const text=parts.join('').replace(/\r\n?/g,'\n').replace(/[\t\f\v ]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
  if(!text)return hasContent?unavailable(pageId,'no-extracted-text'):Object.freeze({status:'empty',pageId,reason:'Cette page est vide.'});
  if(/[\uD800-\uDFFF]/u.test(text))return unavailable(pageId,'invalid-source');
  if(text.length>MAX_PAPER_READ_ALOUD_TEXT)return unavailable(pageId,'budget');
  const chunks:string[]=[];let chunk='';
  for(const cluster of segmenter.segment(text)){
   if(cluster.segment.length>MAX_PAPER_READ_ALOUD_CHUNK)return unavailable(pageId,'budget');
   if(chunk.length+cluster.segment.length>MAX_PAPER_READ_ALOUD_CHUNK){chunks.push(chunk);chunk='';if(chunks.length>=MAX_PAPER_READ_ALOUD_CHUNKS)return unavailable(pageId,'budget');}
   chunk+=cluster.segment;
  }
  if(chunk)chunks.push(chunk);if(chunks.length>MAX_PAPER_READ_ALOUD_CHUNKS)return unavailable(pageId,'budget');
  return Object.freeze({status:'ready',pageId,text,chunks:Object.freeze(chunks)});
 }catch(error){return unavailable(pageId,error instanceof ExtractionRefusal?error.code:'unsupported-markdown');}
}
