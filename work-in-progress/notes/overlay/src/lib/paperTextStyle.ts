import {fromMarkdown} from 'mdast-util-from-markdown';
import {gfm} from 'micromark-extension-gfm';
import {gfmFromMarkdown} from 'mdast-util-gfm';
import {math} from 'micromark-extension-math';
import {mathFromMarkdown} from 'mdast-util-math';

export const PAPER_TEXT_FONTS=Object.freeze([{id:'dowze',label:'Dowze'},{id:'serif',label:'Noto Sérif'},{id:'mono',label:'Noto Mono'}] as const);
export type PaperTextFont=typeof PAPER_TEXT_FONTS[number]['id'];
export interface PaperTextStyle {readonly name:'body'|'title'|'subtitle'|'caption'|'custom';readonly font:PaperTextFont;readonly size:number;readonly weight:400|600|700;readonly leading:125|135|140|160}
export const PAPER_TEXT_STYLES:Readonly<Record<'body'|'title'|'subtitle'|'caption',PaperTextStyle>>=Object.freeze({
 body:Object.freeze({name:'body',font:'dowze',size:16,weight:400,leading:160}),
 title:Object.freeze({name:'title',font:'dowze',size:28,weight:700,leading:135}),
 subtitle:Object.freeze({name:'subtitle',font:'dowze',size:20,weight:600,leading:140}),
 caption:Object.freeze({name:'caption',font:'dowze',size:12,weight:400,leading:140})
});
const names=new Set(['body','title','subtitle','caption','custom']),fonts=new Set(['dowze','serif','mono']);
/** Resolved values belong to the note. They never follow a mutable default or favorite. */
export function paperTextStyle(value:unknown):PaperTextStyle|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const row=value as Record<string,unknown>,keys=Object.keys(row);
 if(keys.length!==5||!['name','font','size','weight','leading'].every(key=>Object.hasOwn(row,key))||typeof row.name!=='string'||typeof row.font!=='string'||!names.has(row.name)||!fonts.has(row.font)||typeof row.size!=='number'||typeof row.weight!=='number'||typeof row.leading!=='number'||!Number.isSafeInteger(row.size)||row.size<8||row.size>72||![400,600,700].includes(row.weight)||![125,135,140,160].includes(row.leading))return null;
 return Object.freeze({name:row.name as PaperTextStyle['name'],font:row.font as PaperTextFont,size:row.size,weight:row.weight as PaperTextStyle['weight'],leading:row.leading as PaperTextStyle['leading']});
}
const marker=/^<!-- dowze-text-style:v1 name=(body|title|subtitle|caption|custom) font=(dowze|serif|mono) size=([1-9][0-9]?) weight=(400|600|700) leading=(125|135|140|160) -->$/;
export function paperTextStyleMarker(value:unknown):PaperTextStyle|null{
 const match=typeof value==='string'?marker.exec(value):null;
 return match&&match[0]===value?paperTextStyle({name:match[1],font:match[2],size:Number(match[3]),weight:Number(match[4]),leading:Number(match[5])}):null;
}
export function serializePaperTextStyle(value:PaperTextStyle):string{
 const style=paperTextStyle(value);if(!style)throw Error('Le style de ce bloc doit être vérifié.');
 return `<!-- dowze-text-style:v1 name=${style.name} font=${style.font} size=${style.size} weight=${style.weight} leading=${style.leading} -->`;
}
export function paperTextStyleDOM(value:unknown):Record<string,string>{
 const style=paperTextStyle(value);return style?{'data-paper-text-style':'v1','data-paper-style-name':style.name,'data-paper-font':style.font,'data-paper-size':String(style.size),'data-paper-weight':String(style.weight),'data-paper-leading':String(style.leading)}:{};
}
export function paperTextStyleFromDOM(element:HTMLElement):PaperTextStyle|null{
 if(element.getAttribute('data-paper-text-style')!=='v1')return null;
 return paperTextStyle({name:element.getAttribute('data-paper-style-name'),font:element.getAttribute('data-paper-font'),size:Number(element.getAttribute('data-paper-size')),weight:Number(element.getAttribute('data-paper-weight')),leading:Number(element.getAttribute('data-paper-leading'))});
}
interface StyleNode {type:string;value?:string;children?:StyleNode[];data?:Record<string,unknown>;position?:{start:{offset?:number};end:{offset?:number}}}
export interface PaperTextStyleRange {from:number;to:number;markerFrom:number;markerTo:number;style:PaperTextStyle}
const unwrapped=(node:StyleNode|undefined)=>node?.type==='paragraph'&&node.children?.length===1&&node.children[0].type==='html'?node.children[0]:node;
const emptyPlaceholder=(node:StyleNode)=>node.type==='html'&&/^<br\s*\/?>$/.test(node.value??'');
const eligible=(node:StyleNode)=>['paragraph','heading'].includes(node.type)&&!(node.children?.length&&node.children.every(child=>['image','imageReference','html'].includes(child.type)));
/** Only an immediately following, exact v1 marker is bound to its own text block.
 * Code/maths, images, orphan/unknown markers and every source position stay intact. */
function stylesInTree(tree:StyleNode,present:boolean):PaperTextStyleRange[]{
 const ranges:PaperTextStyleRange[]=[];
 const walk=(parent:StyleNode)=>{const children=parent.children;if(!children)return;
  for(let index=0;index<children.length;index++){
   const block=children[index],next=unwrapped(children[index+1]),style=next?.type==='html'?paperTextStyleMarker(next.value):null;
   const empty=emptyPlaceholder(block)||block.type==='paragraph'&&block.children?.length===1&&emptyPlaceholder(block.children[0]);
   if(style&&(eligible(block)||empty)){
    const from=block.position?.start.offset,to=block.position?.end.offset,markerFrom=next?.position?.start.offset,markerTo=next?.position?.end.offset;
    if([from,to,markerFrom,markerTo].every(Number.isSafeInteger)&&from!<=to!&&to!<=markerFrom!)ranges.push({from:from!,to:to!,markerFrom:markerFrom!,markerTo:markerTo!,style});
    if(present){if(empty){block.type='paragraph';block.children=[];delete block.value;}block.data={...block.data,dowzeTextStyle:style,hProperties:{...(block.data?.hProperties as Record<string,unknown>|undefined),...paperTextStyleDOM(style)}};children.splice(index+1,1);}
   }
   walk(block);
  }
 };walk(tree);return ranges;
}
export function parsePaperTextStyles(markdown:string):PaperTextStyleRange[]{
 if(!markdown.includes('<!-- dowze-text-style:v1 '))return [];
 const tree=fromMarkdown(markdown,{extensions:[gfm(),math()],mdastExtensions:[gfmFromMarkdown(),mathFromMarkdown()]});
 return stylesInTree(tree as unknown as StyleNode,false);
}
/** A presentation/editor AST transform, never a canonical/source rewrite. */
export function remarkPaperTextStyles(){return (tree:unknown)=>{stylesInTree(tree as StyleNode,true);};}
export function paperTextStyleFromNode(node:unknown):PaperTextStyle|null{
 return paperTextStyle((node as StyleNode)?.data?.dowzeTextStyle);
}
/** Partial copies of a styled paragraph keep the marker on each copied passage.
 * A hidden trailing marker alone must not create a separate page boundary. */
export function paperTextStylePageOffsets(styles:readonly PaperTextStyleRange[],offsets:readonly number[]):number[]{
 return offsets.map(offset=>styles.reduce((at,row)=>at>=row.to&&at<row.markerTo?row.markerTo:at,offset));
}
/** Search retains exact UTF16 offsets without matching hidden typography controls. */
export function paperTextStyleSearchSource(markdown:string):string{
 const styles=parsePaperTextStyles(markdown);if(!styles.length)return markdown;let source=markdown;
 for(const row of [...styles].sort((a,b)=>b.markerFrom-a.markerFrom))source=source.slice(0,row.markerFrom)+' '.repeat(row.markerTo-row.markerFrom)+source.slice(row.markerTo);
 return source;
}
