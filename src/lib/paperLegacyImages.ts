import {fromMarkdown} from 'mdast-util-from-markdown';
import {parse,preprocess,postprocess} from 'micromark';
import {gfm} from 'micromark-extension-gfm';import {gfmFromMarkdown} from 'mdast-util-gfm';
import {math} from 'micromark-extension-math';import {mathFromMarkdown} from 'mdast-util-math';
import {decodeString} from 'micromark-util-decode-string';
import {parsePhotoReference} from './notebook.ts';

export interface PaperLegacyImageRange {from:number;to:number;raw:string}
export interface PaperLegacyImageDefinition {
 id:string;identifier:string;label:string;from:number;to:number;url:string;title:string|null;
 destination:PaperLegacyImageRange;labelRange:PaperLegacyImageRange;sharedWithLinks:boolean;
}
export interface PaperLegacyImageOccurrence {
 id:string;from:number;to:number;url:string;title:string|null;alt:string;
 kind:'photo'|'data'|'other'|'invalid-photo';photo?:{documentId:string;id:string};data?:{mediaType:string};
 destination?:PaperLegacyImageRange;
 reference?:{identifier:string;type:'full'|'collapsed'|'shortcut';definitionId:string;sharedWithLinks:boolean;range?:PaperLegacyImageRange};
}
export interface PaperLegacyImageScan {markdown:string;images:PaperLegacyImageOccurrence[];definitions:PaperLegacyImageDefinition[]}
export interface PaperLegacyImageEdit {from:number;to:number;text:string}
interface Node {type:string;url?:string;title?:string|null;alt?:string;identifier?:string;label?:string;referenceType?:'full'|'collapsed'|'shortcut';children?:Node[];position?:{start:{offset?:number};end:{offset?:number}}}
interface Tokens {type:string;from:number;to:number;destination?:PaperLegacyImageRange;label?:PaperLegacyImageRange;reference?:PaperLegacyImageRange}
const range=(markdown:string,from:number,to:number):PaperLegacyImageRange=>({from,to,raw:markdown.slice(from,to)});
const visit=(node:Node,fn:(node:Node)=>void)=>{fn(node);node.children?.forEach(child=>visit(child,fn));};
const definitionNode=(tree:Node,label:string):Node|undefined=>{let found:Node|undefined;visit(tree,node=>{if(node.type==='definition'&&node.identifier===label)found=node;});return found;};
const bounds=(node:Node)=>{const from=node.position?.start.offset,to=node.position?.end.offset;if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to))throw Error('Les positions de cette image doivent être retrouvées avant sa conversion.');return {from:from!,to:to!};};
const parserOptions=()=>({extensions:[gfm(),math()]});
const mdastOptions=()=>({...parserOptions(),mdastExtensions:[gfmFromMarkdown(),mathFromMarkdown()]});

/** Historical recovery only. This does not relax the application or server transport parser. */
export function parseLegacyPhotoImageUrl(url:string):{documentId:string;id:string}|null{
 const match=/^dowze-photo:([^/]+)\/([^/]+)$/.exec(url);if(!match)return null;
 try{const documentId=decodeURIComponent(match[1]),id=decodeURIComponent(match[2]);return [documentId,id].every(value=>value.length>0&&value.length<=200&&!/[\u0000-\u001f\u007f]/.test(value))?{documentId,id}:null;}catch{return null;}
}
function tokenPositions(markdown:string):Map<string,Tokens>{
 const result=new Map<string,Tokens>(),stack:Tokens[]=[];
 for(const [event,token] of postprocess(parse(parserOptions()).document().write(preprocess()(markdown,undefined,true)))){
  const from=token.start.offset,to=token.end.offset;if(typeof from!=='number'||typeof to!=='number')continue;
  if(['image','link','definition'].includes(token.type)){if(event==='enter')stack.push({type:token.type,from,to});else{const owner=stack.pop();if(!owner||owner.type!==token.type||owner.from!==from)throw Error('Les positions de l’image ne correspondent plus au document.');result.set(`${owner.type}:${owner.from}:${owner.to}`,owner);}continue;}
  if(event!=='enter')continue;const owner=stack.at(-1);if(!owner)continue;
  if(['resourceDestinationString','definitionDestinationString'].includes(token.type))owner.destination=range(markdown,from,to);
  else if(token.type==='definitionLabelString')owner.label=range(markdown,from,to);
  else if(token.type==='reference')owner.reference=range(markdown,from,to);
 }
 return result;
}
/** Only semantic Markdown images are indexed. Code, ordinary links, HTML and maths stay untouched. */
export function scanLegacyPaperImages(markdown:string):PaperLegacyImageScan{
 if(typeof markdown!=='string')throw Error('Le texte de la note est incompatible.');
 const tree=fromMarkdown(markdown,mdastOptions()) as unknown as Node,tokens=tokenPositions(markdown),definitions:PaperLegacyImageDefinition[]=[],images:PaperLegacyImageOccurrence[]=[],linked=new Set<string>();
 visit(tree,node=>{if(node.type==='linkReference'&&node.identifier)linked.add(node.identifier);});
 const firstDefinition=new Map<string,PaperLegacyImageDefinition>();
 visit(tree,node=>{if(node.type!=='definition'||!node.identifier||node.url===undefined)return;const {from,to}=bounds(node),token=tokens.get(`definition:${from}:${to}`);if(!token?.destination||!token.label)throw Error('La destination de cette image référencée doit être retrouvée.');const definition:PaperLegacyImageDefinition={id:`definition-${from}-${to}`,identifier:node.identifier,label:node.label??node.identifier,from,to,url:node.url,title:node.title??null,destination:token.destination,labelRange:token.label,sharedWithLinks:linked.has(node.identifier)};definitions.push(definition);if(!firstDefinition.has(node.identifier))firstDefinition.set(node.identifier,definition);});
 visit(tree,node=>{
  if(node.type!=='image'&&node.type!=='imageReference')return;const {from,to}=bounds(node),token=tokens.get(`image:${from}:${to}`),definition=node.type==='imageReference'&&node.identifier?firstDefinition.get(node.identifier):undefined;
  const url=node.type==='image'?node.url:definition?.url;if(url===undefined)return;
  const photo=parseLegacyPhotoImageUrl(url),data=/^data:(image\/(?:png|jpeg|jpg|gif|webp))(?:;[^\r\n,]*)?,/i.exec(url),kind=photo?'photo':url.startsWith('dowze-photo:')?'invalid-photo':data?'data':'other',mediaType=data?.[1].toLowerCase();
  images.push({id:`image-${from}-${to}`,from,to,url,title:node.type==='image'?node.title??null:definition?.title??null,alt:node.alt??'',kind,...(photo?{photo}:{}),...(data?{data:{mediaType:mediaType==='image/jpg'?'image/jpeg':mediaType!}}:{}),...(node.type==='image'&&token?.destination?{destination:token.destination}:{}),...(definition?{reference:{identifier:definition.identifier,type:node.referenceType??'shortcut',definitionId:definition.id,sharedWithLinks:definition.sharedWithLinks,...(token?.reference?{range:token.reference}:{})}}:{})});
 });
 return {markdown,images,definitions};
}
function applyEdits(markdown:string,edits:readonly PaperLegacyImageEdit[]):string{
 const ordered=[...edits].sort((a,b)=>a.from-b.from||a.to-b.to);let cursor=0,result='';
 for(const edit of ordered){if(!Number.isSafeInteger(edit.from)||!Number.isSafeInteger(edit.to)||edit.from<cursor||edit.to<edit.from||edit.to>markdown.length)throw Error('Deux conversions d’image se chevauchent. Le texte original reste conservé.');result+=markdown.slice(cursor,edit.from)+edit.text;cursor=edit.to;}return result+markdown.slice(cursor);
}
/** Rewrites only destinations or image reference labels; all other original characters survive exactly. */
export function planLegacyPaperImageRewrite(scan:PaperLegacyImageScan,replacements:ReadonlyMap<string,string>):{markdown:string;edits:PaperLegacyImageEdit[]}{
 const fresh=scanLegacyPaperImages(scan.markdown);if(JSON.stringify(fresh)!==JSON.stringify(scan))throw Error('Le recensement d’images ne correspond plus au texte original.');
 const byId=new Map(scan.images.map(image=>[image.id,image])),edits:PaperLegacyImageEdit[]=[],append:string[]=[],aliases=new Map<string,string>(),decodedLower=decodeString(scan.markdown).toLowerCase();let nextLabel=0;
 for(const [id,url] of replacements){const image=byId.get(id);if(!image||!['photo','data'].includes(image.kind)||!parsePhotoReference(url))throw Error('Cette image ou sa nouvelle référence est incompatible. Le texte original reste conservé.');}
 const definitions=new Map(scan.definitions.map(definition=>[definition.id,definition])),handledDefinitions=new Set<string>();
 const makeAlias=(definition:PaperLegacyImageDefinition,url:string)=>{
  const key=`${definition.id}\u0000${url}`,known=aliases.get(key);if(known)return known;
  let label:string;do{label=`dowze-note-image-${++nextLabel}`;}while(decodedLower.includes(label)||scan.definitions.some(item=>item.identifier===label));
  const raw=scan.markdown.slice(definition.from,definition.to),copy=applyEdits(raw,[{from:definition.labelRange.from-definition.from,to:definition.labelRange.to-definition.from,text:label},{from:definition.destination.from-definition.from,to:definition.destination.to-definition.from,text:url}]);
  let cloned=copy;const parsed=fromMarkdown(copy,mdastOptions()) as unknown as Node,matching=definitionNode(parsed,label);
  if(!matching||matching.url!==url||matching.title!==definition.title){const title=definition.title===null?'':` "${definition.title.replace(/\\/g,'\\\\').replace(/"/g,'\\"')}"`;cloned=`[${label}]: <${url}>${title}`;}
  const checked=definitionNode(fromMarkdown(cloned,mdastOptions()) as unknown as Node,label);if(!checked||checked.url!==url||(checked.title??null)!==definition.title)throw Error('Le titre de cette image ne peut pas être conservé exactement. Son original reste visible.');
  aliases.set(key,label);append.push(cloned);return label;
 };
 for(const image of scan.images){const url=replacements.get(image.id);if(url===undefined)continue;
  if(image.destination){edits.push({from:image.destination.from,to:image.destination.to,text:url});continue;}
  const ref=image.reference,definition=ref?definitions.get(ref.definitionId):undefined;if(!ref||!definition)throw Error('La destination de l’image ne peut pas être retrouvée.');
  const usages=scan.images.filter(other=>other.reference?.definitionId===definition.id),canReplaceDefinition=!definition.sharedWithLinks&&usages.every(other=>replacements.get(other.id)===url);
  if(canReplaceDefinition){if(!handledDefinitions.has(definition.id)){edits.push({from:definition.destination.from,to:definition.destination.to,text:url});handledDefinitions.add(definition.id);}continue;}
  const label=makeAlias(definition,url);edits.push(ref.range?{from:ref.range.from,to:ref.range.to,text:`[${label}]`}:{from:image.to,to:image.to,text:`[${label}]`});
 }
 if(append.length){const eol=scan.markdown.includes('\r\n')?'\r\n':scan.markdown.includes('\r')&&!scan.markdown.includes('\n')?'\r':'\n',separator=scan.markdown.length===0?'':/(?:\r\n|\r|\n){2}$/.test(scan.markdown)?'':/[\r\n]$/.test(scan.markdown)?eol:eol+eol;edits.push({from:scan.markdown.length,to:scan.markdown.length,text:separator+append.join(eol)+eol});}
 return {markdown:applyEdits(scan.markdown,edits),edits:edits.sort((a,b)=>a.from-b.from||a.to-b.to)};
}

const ascii=(bytes:Uint8Array,from:number,to:number)=>String.fromCharCode(...bytes.subarray(from,to));
const pngCrcTable=new Uint32Array(256);for(let value=0;value<256;value++){let next=value;for(let bit=0;bit<8;bit++)next=next&1?(next>>>1)^0xedb88320:next>>>1;pngCrcTable[value]=next;}
function pngCrc(bytes:Uint8Array,from:number,to:number){let value=0xffffffff;for(let index=from;index<to;index++)value=(value>>>8)^pngCrcTable[(value^bytes[index])&255];return (value^0xffffffff)>>>0;}
function percentBytes(payload:string,limit:number){
 if(payload.length>limit*3)throw Error('Cette image intégrée dépasse la capacité de récupération.');const bytes=new Uint8Array(Math.min(payload.length,limit));let written=0;
 for(let index=0;index<payload.length;index++){let byte=payload.charCodeAt(index);if(byte===37){const hex=payload.slice(index+1,index+3);if(!/^[a-fA-F0-9]{2}$/.test(hex))throw Error('L’image intégrée possède un encodage URI invalide.');byte=parseInt(hex,16);index+=2;}else if(byte>127||byte<=32||byte===35)throw Error('Les octets de cette image doivent être encodés explicitement dans son URI.');if(written>=limit)throw Error('Cette image intégrée dépasse la capacité de récupération.');bytes[written++]=byte;}
 return bytes.slice(0,written);
}
/** Decode a bounded raster data URI without contacting any service or changing its bytes. */
export function decodeLegacyRasterDataUrl(url:string,options:{maxBytes?:number;maxPixels?:number}={}):{bytes:Uint8Array;mediaType:string}{
 const maxBytes=options.maxBytes??16*1024*1024,maxPixels=options.maxPixels??40_000_000;
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>16*1024*1024||!Number.isSafeInteger(maxPixels)||maxPixels<1)throw Error('La capacité de récupération d’image est incompatible.');
 const match=/^data:(image\/(?:png|jpeg|jpg|gif|webp))((?:;[^,\r\n]*)?),([^\r\n]*)$/i.exec(url);if(!match)throw Error('Cette image intégrée ne possède pas un encodage raster pris en charge. Son original reste conservé.');
 const parameters=match[2]?match[2].slice(1).split(';'):[],base64=parameters.at(-1)?.toLowerCase()==='base64';if(base64)parameters.pop();if(parameters.some(parameter=>!/^[-A-Za-z0-9!#$&^_.+]+=[^;\r\n]*$/.test(parameter)))throw Error('Les paramètres de cette image intégrée sont incompatibles.');
 let bytes:Uint8Array;if(base64){let payload=match[3];if(payload.includes('%')){const decoded=percentBytes(payload,Math.ceil(maxBytes/3)*4),parts:string[]=[];for(let offset=0;offset<decoded.length;offset+=32768)parts.push(String.fromCharCode(...decoded.subarray(offset,offset+32768)));payload=parts.join('');}
  if(!/^[A-Za-z0-9+/]+={0,2}$/.test(payload)||payload.length%4!==0||payload.length>Math.ceil(maxBytes/3)*4)throw Error('Cette image intégrée dépasse la capacité ou possède un encodage incomplet.');let binary:string;try{binary=atob(payload);}catch{throw Error('L’image intégrée possède un encodage base64 invalide.');}if(binary.length>maxBytes||btoa(binary)!==payload)throw Error('L’image intégrée possède un encodage base64 non canonique ou trop volumineux.');bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));
 }else bytes=percentBytes(match[3],maxBytes);
 return validateLegacyRasterBytes(bytes,match[1],options);
}
/** Validate exact upload bytes without a base64 round trip or contacting any service. */
export function validateLegacyRasterBytes(bytes:Uint8Array,declaredType:string,options:{maxBytes?:number;maxPixels?:number}={}):{bytes:Uint8Array;mediaType:string}{
 const maxBytes=options.maxBytes??16*1024*1024,maxPixels=options.maxPixels??40_000_000;
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>16*1024*1024||!Number.isSafeInteger(maxPixels)||maxPixels<1)throw Error('La capacité de récupération d’image est incompatible.');
 if(!(bytes instanceof Uint8Array)||!bytes.byteLength||bytes.byteLength>maxBytes||typeof declaredType!=='string'||!/^image\/(?:png|jpeg|jpg|gif|webp)$/i.test(declaredType))throw Error('Cet original ne possède pas des octets raster pris en charge dans la limite de récupération.');
 const normalizedType=declaredType.toLowerCase(),mediaType=normalizedType==='image/jpg'?'image/jpeg':normalizedType;
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let width=0,height=0;
 if(mediaType==='image/png'){
  if(bytes.length<33||!bytes.subarray(0,8).every((byte,index)=>byte===[137,80,78,71,13,10,26,10][index])||view.getUint32(8)!==13||ascii(bytes,12,16)!=='IHDR')throw Error('La signature PNG de cet original est invalide.');width=view.getUint32(16);height=view.getUint32(20);let offset=8,ended=false,hasPixels=false;
  while(offset+12<=bytes.length){const size=view.getUint32(offset),end=offset+12+size;if(end>bytes.length||pngCrc(bytes,offset+4,end-4)!==view.getUint32(end-4))throw Error('Une portion PNG est incomplète ou son contrôle d’intégrité est invalide.');const kind=ascii(bytes,offset+4,offset+8);if(kind==='IDAT')hasPixels=true;if(kind==='IEND'){if(size!==0||end!==bytes.length)throw Error('La fin PNG est incompatible.');ended=true;}offset=end;}
  if(offset!==bytes.length||!ended||!hasPixels)throw Error('Cet original PNG est incomplet.');
 }else if(mediaType==='image/gif'){
  if(bytes.length<14||!['GIF87a','GIF89a'].includes(ascii(bytes,0,6))||bytes.at(-1)!==0x3b)throw Error('La signature GIF de cet original est invalide.');width=view.getUint16(6,true);height=view.getUint16(8,true);let offset=13+(bytes[10]&0x80?3*(1<<((bytes[10]&7)+1)):0),hasPixels=false;
  const subBlocks=()=>{while(offset<bytes.length){const size=bytes[offset++];if(size===0)return;if(offset+size>bytes.length)throw Error('Une portion GIF est incomplète.');offset+=size;}throw Error('La fin GIF est incomplète.');};
  while(offset<bytes.length){const marker=bytes[offset++];if(marker===0x3b){if(offset!==bytes.length)throw Error('La fin GIF est incompatible.');break;}if(marker===0x21){if(offset>=bytes.length)throw Error('Une extension GIF est incomplète.');offset++;subBlocks();}else if(marker===0x2c){if(offset+9>bytes.length)throw Error('La taille GIF est incomplète.');const packed=bytes[offset+8];offset+=9+(packed&0x80?3*(1<<((packed&7)+1)):0);if(offset>=bytes.length||bytes[offset]<2||bytes[offset]>8)throw Error('Les pixels GIF sont incompatibles.');offset++;subBlocks();hasPixels=true;}else throw Error('La structure GIF est incompatible.');}
  if(!hasPixels)throw Error('Cet original GIF ne contient pas d’image.');
 }else if(mediaType==='image/jpeg'){
  if(bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8||bytes.at(-2)!==0xff||bytes.at(-1)!==0xd9)throw Error('La signature JPEG de cet original est invalide.');let offset=2,hasPixels=false;
  while(offset+3<bytes.length){if(bytes[offset++]!==0xff)throw Error('L’en-tête JPEG est incompatible.');while(bytes[offset]===0xff)offset++;const marker=bytes[offset++];if(marker===0xd9)break;if(marker===0x01||marker>=0xd0&&marker<=0xd7)continue;if(offset+2>bytes.length)throw Error('Un segment JPEG est incomplet.');const size=view.getUint16(offset);if(size<2||offset+size>bytes.length)throw Error('Un segment JPEG est incomplet.');if(marker===0xda){if(size<6)throw Error('Les pixels JPEG sont incomplets.');hasPixels=true;break;}if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){if(size<11||size!==8+3*bytes[offset+7])throw Error('La taille JPEG est incompatible.');height=view.getUint16(offset+3);width=view.getUint16(offset+5);}offset+=size;}
  if(!hasPixels)throw Error('Cet original JPEG est incomplet.');
 }else{
  if(bytes.length<25||ascii(bytes,0,4)!=='RIFF'||ascii(bytes,8,12)!=='WEBP'||view.getUint32(4,true)+8!==bytes.length)throw Error('La signature WebP de cet original est invalide.');let offset=12,hasImage=false;
  while(offset+8<=bytes.length){const kind=ascii(bytes,offset,offset+4),size=view.getUint32(offset+4,true),start=offset+8;if(start+size>bytes.length)throw Error('Une portion WebP est incomplète.');
   if(kind==='VP8 '){hasImage=true;if(size<10||bytes[start+3]!==0x9d||bytes[start+4]!==1||bytes[start+5]!==0x2a)throw Error('La taille WebP est incompatible.');if(!width){width=view.getUint16(start+6,true)&0x3fff;height=view.getUint16(start+8,true)&0x3fff;}}
   else if(kind==='VP8L'){hasImage=true;if(size<5||bytes[start]!==0x2f)throw Error('La taille WebP sans perte est incompatible.');const bits=view.getUint32(start+1,true);if(!width){width=(bits&0x3fff)+1;height=((bits>>>14)&0x3fff)+1;}}
   else if(kind==='VP8X'){if(size<10)throw Error('La taille WebP étendue est incompatible.');width=bytes[start+4]+(bytes[start+5]<<8)+(bytes[start+6]<<16)+1;height=bytes[start+7]+(bytes[start+8]<<8)+(bytes[start+9]<<16)+1;}
   else if(kind==='ANMF')hasImage=true;offset=start+size+(size&1);
  }if(offset!==bytes.length||!hasImage)throw Error('Cet original WebP ne contient pas une image complète.');
 }
 if(!width||!height||width*height>maxPixels)throw Error('Les dimensions de cet original dépassent la capacité de récupération. Ses octets restent conservés.');
 return {bytes,mediaType};
}
