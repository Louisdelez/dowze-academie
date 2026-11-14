import {fromMarkdown} from 'mdast-util-from-markdown';
import {gfm} from 'micromark-extension-gfm';
import {math} from 'micromark-extension-math';
import {gfmFromMarkdown} from 'mdast-util-gfm';
import {mathFromMarkdown} from 'mdast-util-math';
import type {Node as ProseMirrorNode} from '@milkdown/kit/prose/model';
import {renderedMarkdownOffsets} from './paperTextSourceMap.ts';

/** Match the editor admission budget. Refusal never changes the source. */
export const MAX_PAPER_EDITOR_SEARCH_SOURCE=1_500_000;
export const MAX_PAPER_EDITOR_SEARCH_NODES=100_000;
export const MAX_PAPER_EDITOR_SEARCH_RANGES=10_000;
export interface PaperEditorSearchRange {readonly from:number;readonly to:number}
interface AstNode {type:string;value?:string;lang?:string;children?:AstNode[];position?:{start:{offset?:number};end:{offset?:number}}}
interface Leaf {value:string;from:number;offsets:number[];softBreaks:boolean;kind?:'code'|'inlineCode'}
interface PaintedText {value:string;from:number}
const containers=new Set(['root','paragraph','heading','blockquote','list','listItem','emphasis','strong','delete','link','linkReference','table','tableRow','tableCell','footnoteDefinition']);
const opaque=new Set(['definition','image','imageReference','footnoteReference','thematicBreak','html','math','inlineMath']);
const graphemeRange=(text:string,from:number,to:number)=>{
 if(typeof Intl.Segmenter!=='function')return false;let first=from===0,last=to===text.length;
 for(const cluster of new Intl.Segmenter('fr',{granularity:'grapheme'}).segment(text)){if(cluster.index===from)first=true;if(cluster.index===to)last=true;if(cluster.index>to)break;}return first&&last;
};
/** Crepe's syncHeadingIdPlugin adds only a computed heading id after parsing.
 * Validate that exact derived value (including duplicate-heading suffixes),
 * rather than ignoring ids or comparing only the flattened document text.
 * The generator must come from this same editor's headingIdGenerator context.
 * No document, attribute, mark or transaction is mutated by this comparison. */
function sameParsedDocument(document:ProseMirrorNode,parsedDocument:ProseMirrorNode,headingId?:((heading:ProseMirrorNode)=>string)):boolean{
 if(document.eq(parsedDocument))return true;
 if(!headingId)return false;
 const stack:[ProseMirrorNode,ProseMirrorNode][]=[[document,parsedDocument]],headings=new Map<string,number>();let visited=0;
 while(stack.length){
  if(++visited>MAX_PAPER_EDITOR_SEARCH_NODES)return false;
  const [actual,parsed]=stack.pop()!;
  if(actual.type!==parsed.type||actual.nodeSize!==parsed.nodeSize||actual.childCount!==parsed.childCount||actual.text!==parsed.text)return false;
  let expected=parsed;
  if(parsed.type.name==='heading'&&parsed.textContent.trim().length){
   const generated=headingId(parsed);if(typeof generated!=='string')return false;
   const count=(headings.get(generated)??0)+1;headings.set(generated,count);
   const id=count>1?generated+'-#'+count:generated;
   if(actual.attrs.id!==parsed.attrs.id){
    if(parsed.attrs.id!==''||actual.attrs.id!==id)return false;
    expected=parsed.type.create({...parsed.attrs,id},parsed.content,parsed.marks);
   }
  }
  if(!actual.sameMarkup(expected))return false;
  if(visited+stack.length+parsed.childCount>MAX_PAPER_EDITOR_SEARCH_NODES)return false;
  for(let index=parsed.childCount-1;index>=0;index--)stack.push([actual.child(index),parsed.child(index)]);
 }
 return true;
}
/** Strict source-to-PM projection. parsedDocument MUST come from this editor's
 * installed parser for markdown; equality (or the exact computed heading-id
 * derivation above) proves the complete rich structure,
 * including repeated words, marks and opaque atoms. AST leaves then align with
 * every PM text unit in order. No word search or approximate offset fallback.
 * Syntax-only ranges, partial escape/entity tokens and unsupported parses refuse.
 * Returned ranges describe visible intersections; markup itself is never painted. */
export function mapPaperEditorSearchRange(input:{markdown:string;document:ProseMirrorNode;parsedDocument:ProseMirrorNode;headingId?:(heading:ProseMirrorNode)=>string;start:number;end:number}):readonly PaperEditorSearchRange[]|null{
 try{
  const {markdown,document,parsedDocument,start,end}=input;
  if(markdown.length>MAX_PAPER_EDITOR_SEARCH_SOURCE||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||end>markdown.length||!sameParsedDocument(document,parsedDocument,input.headingId)||!graphemeRange(markdown,start,end))return null;
  const tree=fromMarkdown(markdown,{extensions:[gfm(),math()],mdastExtensions:[gfmFromMarkdown(),mathFromMarkdown()]}) as unknown as AstNode,leaves:Leaf[]=[];let visited=0,valid=true;
  const walk=(node:AstNode)=>{
   if(!valid||++visited>MAX_PAPER_EDITOR_SEARCH_NODES){valid=false;return;}
   if(containers.has(node.type)){for(const child of node.children??[])walk(child);return;}
   if(opaque.has(node.type)||node.type==='code'&&String(node.lang??'').toLowerCase()==='latex')return;
   const from=node.position?.start.offset,to=node.position?.end.offset;
   if(typeof from!=='number'||typeof to!=='number'||!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from<0||to>markdown.length||to<from){valid=false;return;}
   if(node.type==='break'){leaves.push({value:'\n',from:from!,offsets:[0,to!-from!],softBreaks:false});return;}
   if(!['text','code','inlineCode'].includes(node.type)||typeof node.value!=='string'){valid=false;return;}
   // mdast retains source EOLs; the shared renderer mapper uses LF for text
   // and spaces for inline code. Preserve its exact offset map, then align the
   // installed PM parser's literal EOL representation below.
   const value=node.value.replace(/\r\n|\r|\n/g,node.type==='inlineCode'?' ':'\n'),offsets=renderedMarkdownOffsets(markdown.slice(from,to),value,node.type==='text'?'text':'code');if(!offsets){valid=false;return;}
   leaves.push({value,from,offsets,softBreaks:node.type==='text',...(node.type==='code'||node.type==='inlineCode'?{kind:node.type}:{})});
  };walk(tree);if(!valid)return null;
  const painted:PaintedText[]=[];let pmNodes=0;
  document.descendants((node,pos)=>{
   if(++pmNodes>MAX_PAPER_EDITOR_SEARCH_NODES){valid=false;return false;}
   // Crepe's inline math/html/images are opaque atoms. Display TeX is a
   // code_block with language latex; its source is not the painted formula.
   if(node.type.name==='code_block'&&String(node.attrs.language??'').toLowerCase()==='latex')return false;
   if(node.isText)painted.push({value:node.text??'',from:pos});
   else if(node.type.name==='hardbreak')painted.push({value:'\n',from:pos});
   return true;
  });if(!valid)return null;
  let pmIndex=0,pmOffset=0,partial=false;const ranges:PaperEditorSearchRange[]=[];
  const nextIs=(value:string)=>{let index=pmIndex,offset=pmOffset;for(const unit of value.split('')){while(index<painted.length&&offset===painted[index].value.length){index++;offset=0;}if(painted[index]?.value[offset++]!==unit)return false;}return true;};
  const consume=(value:string,rawFrom:number,rawTo:number)=>{
   for(let unit=0;unit<value.length;unit++){
    while(pmIndex<painted.length&&pmOffset===painted[pmIndex].value.length){pmIndex++;pmOffset=0;}
    const current=painted[pmIndex];if(!current||current.value[pmOffset]!==value[unit]){valid=false;return;}
    const position=current.from+pmOffset++;if(rawTo<=start||rawFrom>=end)continue;
    if(rawFrom<start||rawTo>end){partial=true;continue;}
    const previous=ranges.at(-1);if(previous?.to===position)ranges[ranges.length-1]={from:previous.from,to:position+1};else ranges.push({from:position,to:position+1});
    if(ranges.length>MAX_PAPER_EDITOR_SEARCH_RANGES){valid=false;return;}
   }
  };
  for(const leaf of leaves){
   const softBreaks=new Map<number,number>();if(leaf.softBreaks)for(const found of leaf.value.matchAll(/[\t ]*(?:\r?\n|\r)/g))softBreaks.set(found.index,found.index+found[0].length);
   for(let unit=0;unit<leaf.value.length&&valid;){
    // Milkdown remarkLineBreak turns text soft line breaks (and their preceding
    // spaces/tabs) into one hardbreak atom. Reproduce exactly that transform.
    const lineEnd=softBreaks.get(unit);
    if(lineEnd!==undefined){consume('\n',leaf.from+leaf.offsets[unit],leaf.from+leaf.offsets[lineEnd]);unit=lineEnd;continue;}
    let until=unit+1;while(until<leaf.value.length&&leaf.offsets[until]===leaf.offsets[unit])until++;
    const rawFrom=leaf.from+leaf.offsets[unit],rawTo=leaf.from+leaf.offsets[until],rawToken=markdown.slice(rawFrom,rawTo);let value=leaf.value.slice(unit,until);
    // Milkdown inlineCode.addText passes mdast.value literally; HAST-based
    // parsers use one space. Both representations are source-derived EOLs,
    // and the mandatory parsedDocument equality still fixes the actual one.
    if(leaf.kind&&/^(?:\r\n|\r|\n)$/.test(rawToken)){if(nextIs(rawToken))value=rawToken;else if(nextIs('\n'))value='\n';}
    consume(value,rawFrom,rawTo);unit=until;
   }
   if(!valid)return null;
  }
  while(pmIndex<painted.length&&pmOffset===painted[pmIndex].value.length){pmIndex++;pmOffset=0;}
  if(partial||pmIndex!==painted.length||!ranges.length)return null;
  return Object.freeze(ranges.map(range=>Object.freeze(range)));
 }catch{return null;}
}
