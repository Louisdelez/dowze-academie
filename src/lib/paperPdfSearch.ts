import type {PaperAsset} from './notebookDocument.ts';
import type {PaperSearchNavigationRequest} from './notebookSearchNavigation.ts';
import {resolvePaperSearchHit} from './paperSearch.ts';
import type {PaperPdfTextRange} from './paperPdfTextSelection.ts';

export const MAX_PAPER_PDF_SEARCH_ITEMS=20_000;
export const MAX_PAPER_PDF_SEARCH_TEXT=200_000;
export const MAX_PAPER_PDF_SEARCH_RANGES=1_000;
export interface PaperPdfSearchItem {readonly str:string;readonly hasEOL?:boolean}
export interface PaperPdfSearchSource {
 readonly pageId:string;readonly assetId:string;readonly pdfPageNumber:number;
 readonly pageWidth:number;readonly pageHeight:number;
 /** These describe the actual rendered asset/page, not a search-result copy. */
 readonly notebookRotation?:number;readonly assetVersion?:string;
}
export const paperPdfSearchAssetVersion=(asset:PaperAsset)=>JSON.stringify([asset.id,asset.serverId??null,asset.mediaType,asset.size,asset.name]);

/** The import/extraction pipeline appends exactly one separator to EVERY text
 * item, including its last/empty item. A truncated/different extraction cannot
 * prove glyph offsets; no indexOf, repeated-word search or prefix fallback. */
export function resolvePaperPdfSearchRanges(request:PaperSearchNavigationRequest,source:PaperPdfSearchSource,items:readonly PaperPdfSearchItem[]):readonly PaperPdfTextRange[]|null{
 try{
  if(request.current()!==true||!Array.isArray(items)||items.length>MAX_PAPER_PDF_SEARCH_ITEMS)return null;
  const resolved=resolvePaperSearchHit(request.document,request.hit);if(!resolved||resolved.kind!=='pdf'||resolved.pageId!==source.pageId)return null;
  const page=request.document.pages.find(page=>page.id===source.pageId),asset=request.document.assets.find(asset=>asset.id===source.assetId);
  if(!page?.pdf||!asset||page.pdf.assetId!==source.assetId||page.pdf.pageNumber!==source.pdfPageNumber||page.width!==source.pageWidth||page.height!==source.pageHeight||page.rotation!==source.notebookRotation||paperPdfSearchAssetVersion(asset)!==source.assetVersion)return null;
  const pieces:string[]=[];let length=0;
  for(const item of items){if(!item||typeof item.str!=='string'||item.hasEOL!==undefined&&typeof item.hasEOL!=='boolean')return null;length+=item.str.length;if(length>MAX_PAPER_PDF_SEARCH_TEXT)return null;pieces.push(item.str+(item.hasEOL?'\n':' '));}
  if(pieces.join('')!==page.pdf.text)return null;
  const ranges:PaperPdfTextRange[]=[];let offset=0;
  for(let index=0;index<items.length;index++){
   const item=items[index],from=Math.max(resolved.start,offset),to=Math.min(resolved.end,offset+item.str.length);
   if(from<to){ranges.push(Object.freeze({itemIndex:index,from:from-offset,to:to-offset}));if(ranges.length>MAX_PAPER_PDF_SEARCH_RANGES)return null;}
   offset+=item.str.length+1;
  }
  return ranges.length&&request.current()===true&&resolvePaperSearchHit(request.document,request.hit)?Object.freeze(ranges):null;
 }catch{return null;}
}
