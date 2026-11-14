import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';
import {notebookDocumentId,type PaperDocument,type PaperObject,type PaperPage} from './notebookDocument.ts';
import {textFlowFingerprint} from './paperTextFlow.ts';

interface Segment {segment:string;index:number}
export const paperSearchSupported=()=>typeof Intl.Segmenter==='function';
function segments(text:string):Iterable<Segment>|null{return paperSearchSupported()?new Intl.Segmenter('fr',{granularity:'grapheme'}).segment(text):null;}
function graphemeBoundaries(text:string):Set<number>|null{const clusters=segments(text);if(!clusters)return null;const boundaries=new Set([0,text.length]);for(const cluster of clusters){boundaries.add(cluster.index);boundaries.add(cluster.index+cluster.segment.length);}return boundaries;}
const normalize=(value:string)=>value.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('fr').replace(/\u03c2/g,'\u03c3');
const countLimit=(limit:number)=>Number.isSafeInteger(limit)&&limit>0?limit:0;
function boundaryAt(boundaries:readonly number[],target:number,ceil=false){let lo=0,hi=boundaries.length-1;while(lo<hi){const mid=Math.floor((lo+hi+(ceil?0:1))/2);if(ceil?boundaries[mid]<target:boundaries[mid]<=target){if(ceil)lo=mid+1;else lo=mid;}else{if(ceil)hi=mid;else hi=mid-1;}}return boundaries[lo];}
/** Ranges are original UTF-16 grapheme boundaries, never normalized-string offsets. */
export function textMatches(text:string,query:string,limit=100):{start:number;end:number;excerpt:string}[]{
 limit=countLimit(limit);if(!limit)return [];const needle=normalize(query.trim());if(!needle)return [];
 const clusters=segments(text);if(!clusters)return [];let searchable='';const starts:number[]=[],ends:number[]=[],boundaries=[0];
 for(const cluster of clusters){const value=normalize(cluster.segment),end=cluster.index+cluster.segment.length;searchable+=value;for(let i=0;i<value.length;i++){starts.push(cluster.index);ends.push(end);}boundaries.push(end);}
 const hits:{start:number;end:number;excerpt:string}[]=[],seen=new Set<string>();let at=0;
 while(hits.length<limit){const position=searchable.indexOf(needle,at);if(position<0)break;at=position+Math.max(1,needle.length);const start=starts[position],end=ends[position+needle.length-1],key=`${start}:${end}`;if(seen.has(key))continue;seen.add(key);
  const from=boundaryAt(boundaries,Math.max(0,start-55)),to=boundaryAt(boundaries,Math.min(text.length,end+95),true);hits.push({start,end,excerpt:(from>0?'…':'')+text.slice(from,to)+(to<text.length?'…':'')});
 }return hits;
}
/** Domain-separated SHA-256 of exact UTF-16, including distinct lone surrogates. */
function fingerprint(text:string,domain='Dowze/paper-search/text/v1'){
 const hash=sha256.create();hash.update(new TextEncoder().encode(domain+'\0'));const bytes=new Uint8Array(8192);
 for(let offset=0;offset<text.length;offset+=4096){const count=Math.min(4096,text.length-offset);for(let i=0;i<count;i++){const unit=text.charCodeAt(offset+i);bytes[i*2]=unit>>>8;bytes[i*2+1]=unit&255;}hash.update(bytes.subarray(0,count*2));}return bytesToHex(hash.digest());
}
export interface PaperSearchBinding {
 readonly schema:1;readonly id:string;readonly noteId:string;readonly documentId:string;readonly lineage:string|null;readonly migratedAt:string;readonly revision:number;readonly updatedAt:string;
 readonly kind:'text'|'pdf';readonly rootPageId:string;readonly objectId?:string;readonly objectKind?:'text'|'sticky';readonly objectCreatedAt?:number;readonly pdfAssetId?:string;readonly pdfPageNumber?:number;
 readonly sourceText:string;readonly fingerprint:string;readonly layoutFingerprint:string;
}
export interface PaperSearchHit {pageId:string;objectId?:string;kind:'text'|'pdf';start:number;end:number;excerpt:string;binding?:PaperSearchBinding;occurrenceId?:string;layout?:'ready'|'pending'}
export interface PaperSearchPageRange {readonly pageId:string;readonly start:number;readonly end:number;readonly pageSourceStart:number;readonly pageSourceEnd:number}
export interface PaperTextRange {readonly pageId:string;readonly start:number;readonly end:number;readonly ranges:readonly PaperSearchPageRange[]}
export interface ResolvedPaperSearchHit extends PaperTextRange {readonly kind:'text'|'pdf';readonly objectId?:string}
function bindingDescriptor(b:Omit<PaperSearchBinding,'id'>|PaperSearchBinding){return JSON.stringify([b.schema,b.noteId,b.documentId,b.lineage,b.migratedAt,b.revision,b.updatedAt,b.kind,b.rootPageId,b.objectId??null,b.objectKind??null,b.objectCreatedAt??null,b.pdfAssetId??null,b.pdfPageNumber??null,b.fingerprint,b.layoutFingerprint]);}
function makeBinding(document:PaperDocument,source:{object:PaperObject}|{page:PaperPage}):PaperSearchBinding{
 const object='object'in source?source.object:undefined,page='page'in source?source.page:undefined,sourceText=object?.markdown??page?.pdf?.text??'',rootPageId=object?.pageId??page!.id;
 const pageIds=object?.textFlow?.pageIds??[rootPageId],layout=object?[object.pageId,object.x,object.y,object.width,object.height,object.rotation,object.textFlow??null,pageIds.map(id=>document.pages.filter(p=>p.id===id).map(p=>[p.id,p.width,p.height,p.rotation,p.flowRootId??null]))]:[page!.id,page!.width,page!.height,page!.rotation,page!.pdf?.assetId,page!.pdf?.pageNumber,document.assets.filter(a=>a.id===page!.pdf?.assetId)];
 const base:Omit<PaperSearchBinding,'id'>={schema:1,noteId:document.noteId,documentId:notebookDocumentId(document.noteId),lineage:document.collaboration?.lineage??null,migratedAt:document.legacy.migratedAt,revision:document.revision,updatedAt:document.updatedAt,kind:object?'text':'pdf',rootPageId,...(object?{objectId:object.id,objectKind:object.kind as 'text'|'sticky',objectCreatedAt:object.createdAt}:{pdfAssetId:page!.pdf!.assetId,pdfPageNumber:page!.pdf!.pageNumber}),sourceText,fingerprint:fingerprint(sourceText),layoutFingerprint:fingerprint(JSON.stringify(layout),'Dowze/paper-search/layout/v1')};
 return Object.freeze({...base,id:fingerprint(bindingDescriptor(base),'Dowze/paper-search/binding/v1')});
}
const occurrenceId=(binding:PaperSearchBinding,start:number,end:number)=>fingerprint(JSON.stringify([binding.id,start,end]),'Dowze/paper-search/occurrence/v1');
interface RangeContext {text:string;pageIds:readonly string[];offsets:readonly number[];boundaries:Set<number>}
function textRangeContext(document:PaperDocument,objectId:string):RangeContext|null{
 if(new Set(document.pages.map(page=>page.id)).size!==document.pages.length)return null;
 const objects=document.objects.filter(object=>object.id===objectId);if(objects.length!==1)return null;const object=objects[0];if(object.kind!=='text'&&object.kind!=='sticky'||document.pages.filter(page=>page.id===object.pageId).length!==1)return null;
 const text=object.markdown??'',boundaries=graphemeBoundaries(text);if(!boundaries)return null;const flow=object.textFlow;
 if(!flow)return {text,pageIds:[object.pageId],offsets:[0,text.length],boundaries};
 if(object.kind!=='text'||flow.schema!==1||!flow.pageIds.length||flow.pageIds[0]!==object.pageId||new Set(flow.pageIds).size!==flow.pageIds.length||flow.pageIds.some(id=>document.pages.filter(page=>page.id===id).length!==1)||flow.source!==textFlowFingerprint(text,object.width,object.height)||flow.breaks.length!==flow.pageIds.length+1||flow.breaks[0]!==0||flow.breaks.some((value,index)=>!Number.isFinite(value)||value<0||index>0&&value<=flow.breaks[index-1]))return null;
 const offsets=flow.sourceOffsets??(flow.pageIds.length===1?[0,text.length]:undefined);if(!offsets||offsets.length!==flow.pageIds.length+1||offsets[0]!==0||offsets.at(-1)!==text.length||offsets.some((offset,index)=>!Number.isSafeInteger(offset)||offset<0||offset>text.length||index>0&&offset<offsets[index-1]||!boundaries.has(offset)))return null;
 return {text,pageIds:flow.pageIds,offsets,boundaries};
}
function project(context:RangeContext|null,start:number,end:number):PaperTextRange|null{
 if(!context||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||end>context.text.length||!context.boundaries.has(start)||!context.boundaries.has(end))return null;const ranges:PaperSearchPageRange[]=[];
 for(let i=0;i<context.pageIds.length;i++){const from=Math.max(start,context.offsets[i]),to=Math.min(end,context.offsets[i+1]);if(to>from)ranges.push(Object.freeze({pageId:context.pageIds[i],start:from,end:to,pageSourceStart:context.offsets[i],pageSourceEnd:context.offsets[i+1]}));}
 return ranges.length?Object.freeze({pageId:ranges[0].pageId,start,end,ranges:Object.freeze(ranges)}):null;
}
/** A fresh physical layout is required for continuations; never guess its root page. */
export function resolvePaperTextRange(document:PaperDocument,objectId:string,start:number,end:number):PaperTextRange|null{try{return project(textRangeContext(document,objectId),start,end);}catch{return null;}}
/** Hits are source proofs, not account/API authority. The caller must also keep
 * its captured owner/API guard before navigation, PM selection and highlighting. */
export function resolvePaperSearchHit(document:PaperDocument,hit:PaperSearchHit):ResolvedPaperSearchHit|null{
 try{
  if(!hit.binding||hit.layout!=='ready'||hit.binding.kind!==hit.kind||hit.occurrenceId!==occurrenceId(hit.binding,hit.start,hit.end))return null;
  let binding:PaperSearchBinding,range:PaperTextRange|null;
  if(hit.kind==='text'){
   if(!hit.objectId||hit.objectId!==hit.binding.objectId)return null;const objects=document.objects.filter(object=>object.id===hit.objectId);if(objects.length!==1||!['text','sticky'].includes(objects[0].kind))return null;
   binding=makeBinding(document,{object:objects[0]});range=resolvePaperTextRange(document,hit.objectId,hit.start,hit.end);
  }else{
   if(hit.objectId!==undefined||new Set(document.pages.map(page=>page.id)).size!==document.pages.length)return null;const pages=document.pages.filter(page=>page.id===hit.pageId);if(pages.length!==1||!pages[0].pdf||document.assets.filter(asset=>asset.id===pages[0].pdf!.assetId).length!==1)return null;
   binding=makeBinding(document,{page:pages[0]});const boundaries=graphemeBoundaries(binding.sourceText);if(!boundaries)return null;range=project({text:binding.sourceText,pageIds:[pages[0].id],offsets:[0,binding.sourceText.length],boundaries},hit.start,hit.end);
  }
  if(!range||range.pageId!==hit.pageId||binding.id!==hit.binding.id||binding.sourceText!==hit.binding.sourceText||binding.fingerprint!==hit.binding.fingerprint||bindingDescriptor(binding)!==bindingDescriptor(hit.binding))return null;
  return Object.freeze({...range,kind:hit.kind,...(hit.objectId?{objectId:hit.objectId}:{})});
 }catch{return null;}
}
export function searchPaperDocument(document:PaperDocument,query:string,limit=100):PaperSearchHit[]{
 limit=countLimit(limit);if(!limit)return [];const hits:PaperSearchHit[]=[];
 for(const page of document.pages){
  for(const object of document.objects.filter(object=>object.pageId===page.id&&(object.kind==='text'||object.kind==='sticky'))){
   const matches=textMatches(object.markdown??'',query,limit-hits.length);if(!matches.length)continue;const binding=makeBinding(document,{object}),context=textRangeContext(document,object.id);
   for(const match of matches){const range=project(context,match.start,match.end);hits.push({...match,pageId:range?.pageId??page.id,objectId:object.id,kind:'text',binding,occurrenceId:occurrenceId(binding,match.start,match.end),layout:range?'ready':'pending'});if(hits.length>=limit)return hits;}
  }
  const matches=textMatches(page.pdf?.text??'',query,limit-hits.length);if(matches.length&&page.pdf){const binding=makeBinding(document,{page});for(const match of matches){hits.push({...match,pageId:page.id,kind:'pdf',binding,occurrenceId:occurrenceId(binding,match.start,match.end),layout:'ready'});if(hits.length>=limit)return hits;}}
 }return hits;
}
export const searchablePaperText=(document:PaperDocument)=>[...document.objects.map(object=>object.markdown??''),...document.pages.map(page=>page.pdf?.text??'')].join('\n');
