import test from 'node:test';
import assert from 'node:assert/strict';
import {migratePaper} from '../src/lib/notebookDocument.ts';
import {searchPaperDocument} from '../src/lib/paperSearch.ts';
import {paperPdfSearchAssetVersion,resolvePaperPdfSearchRanges,MAX_PAPER_PDF_SEARCH_ITEMS,MAX_PAPER_PDF_SEARCH_TEXT,MAX_PAPER_PDF_SEARCH_RANGES,type PaperPdfSearchItem} from '../src/lib/paperPdfSearch.ts';

function fixture(items:readonly PaperPdfSearchItem[],query:string,index=0){
 const document=migratePaper('pdf-search','',null,'2026-10-15T10:00:00.000Z'),asset={id:'pdf-original',serverId:'server-version-one',name:'Original.pdf',mediaType:'application/pdf',size:123};
 document.assets.push(asset);const page=document.pages[0];page.pdf={assetId:asset.id,pageNumber:3,text:items.map(item=>item.str+(item.hasEOL?'\n':' ')).join('')};
 const hit=searchPaperDocument(document,query).filter(hit=>hit.kind==='pdf')[index];assert.ok(hit,'Fixture must contain the requested real core search occurrence');
 const source={pageId:page.id,assetId:asset.id,pdfPageNumber:3,pageWidth:page.width,pageHeight:page.height,notebookRotation:page.rotation,assetVersion:paperPdfSearchAssetVersion(asset)};
 return {document,asset,page,hit,source,items,request:{document,hit,current:()=>true}};
}
test('A repeated word resolves to the exact later PDF item rather than its first spelling',()=>{
 const f=fixture([{str:'répété'},{str:'répété',hasEOL:true},{str:'final'}],'repete',1),before=structuredClone(f.document),ranges=resolvePaperPdfSearchRanges(f.request,f.source,f.items);
 assert.deepEqual(ranges,[{itemIndex:1,from:0,to:6}]);assert.ok(Object.isFrozen(ranges));assert.ok(Object.isFrozen(ranges![0]));assert.deepEqual(f.document,before);
});
test('Cross-item matches keep separate glyph ranges and never paint inserted separators or empty items',()=>{
 const f=fixture([{str:'one'},{str:''},{str:'two',hasEOL:true}],'one  two');assert.deepEqual(resolvePaperPdfSearchRanges(f.request,f.source,f.items),[{itemIndex:0,from:0,to:3},{itemIndex:2,from:0,to:3}]);
 const g=fixture([{str:'répété'},{str:'répété'}],'té ré');assert.deepEqual(resolvePaperPdfSearchRanges(g.request,g.source,g.items),[{itemIndex:0,from:4,to:6},{itemIndex:1,from:0,to:2}]);
});
test('Emoji and decomposed accents retain canonical UTF16 offsets in their own glyph item',()=>{
 const item={str:'📝 e\u0301nergie'},f=fixture([item,{str:'fin'}],'ENERGIE');assert.deepEqual(resolvePaperPdfSearchRanges(f.request,f.source,f.items),[{itemIndex:0,from:3,to:item.str.length}]);
 const emoji=fixture([item],'📝');assert.deepEqual(resolvePaperPdfSearchRanges(emoji.request,emoji.source,emoji.items),[{itemIndex:0,from:0,to:2}]);
});
test('Full extracted text equality includes the final separator and EOL; no truncated or approximate fallback',()=>{
 const f=fixture([{str:'same',hasEOL:true},{str:'target'}],'target');assert.deepEqual(resolvePaperPdfSearchRanges(f.request,f.source,f.items),[{itemIndex:1,from:0,to:6}]);
 for(const items of [[{str:'same'},{str:'target'}],[{str:'same',hasEOL:true},{str:'target extra'}],[{str:'same',hasEOL:true},{str:'target'},{str:''}]])assert.equal(resolvePaperPdfSearchRanges(f.request,f.source,items),null);
 const truncated={...f.document,pages:f.document.pages.map(page=>({...page,pdf:{...page.pdf!,text:page.pdf!.text!.slice(0,-1)}}))},hit=searchPaperDocument(truncated,'target').find(hit=>hit.kind==='pdf')!;assert.ok(hit);assert.equal(resolvePaperPdfSearchRanges({...f.request,document:truncated,hit},f.source,f.items),null,'A freshly bound hit cannot make truncated extracted text prove full glyph positions');
});
test('Revision source identity PDF page and asset version changes revoke the earlier occurrence',()=>{
 const f=fixture([{str:'target'}],'target');
 for(const changed of [
  {...f.document,revision:f.document.revision+1},
  {...f.document,noteId:'another-note'},
  {...f.document,assets:f.document.assets.map(asset=>({...asset,serverId:'new-server-version'}))},
  {...f.document,pages:f.document.pages.map(page=>({...page,pdf:{...page.pdf!,pageNumber:4}}))},
  {...f.document,pages:f.document.pages.map(page=>({...page,pdf:{...page.pdf!,text:'other target '}}))}
 ])assert.equal(resolvePaperPdfSearchRanges({...f.request,document:changed},f.source,f.items),null);
});
test('Even a fresh hit requires the actual rendered asset metadata geometry and notebook rotation',()=>{
 const f=fixture([{str:'target'}],'target');
 for(const source of [{...f.source,assetId:'foreign-file'},{...f.source,pdfPageNumber:4},{...f.source,pageWidth:f.source.pageWidth+1},{...f.source,pageHeight:f.source.pageHeight+1},{...f.source,notebookRotation:90},{...f.source,assetVersion:'other-version'},{...f.source,assetVersion:undefined}])assert.equal(resolvePaperPdfSearchRanges(f.request,source,f.items),null);
 const changed={...f.document,assets:f.document.assets.map(asset=>({...asset,name:'Renamed version.pdf'}))},hit=searchPaperDocument(changed,'target').find(hit=>hit.kind==='pdf')!;assert.ok(hit);assert.equal(resolvePaperPdfSearchRanges({...f.request,document:changed,hit},f.source,f.items),null);
});
test('Captured owner generation rejects A-B-A and a guard revoked during exact item reading',()=>{
 const f=fixture([{str:'target'}],'target');let epoch=0;const captured=epoch,request={...f.request,current:()=>epoch===captured};assert.ok(resolvePaperPdfSearchRanges(request,f.source,f.items));epoch++;epoch++;assert.equal(resolvePaperPdfSearchRanges(request,f.source,f.items),null);
 let allowed=true;const item={get str(){allowed=false;return 'target';}};assert.equal(resolvePaperPdfSearchRanges({...f.request,current:()=>allowed},f.source,[item]),null);assert.equal(resolvePaperPdfSearchRanges({...f.request,current:()=>{throw Error('revoked');}},f.source,f.items),null);
});
test('Unbound altered text-only and duplicate-page results cannot target a PDF layer',()=>{
 const f=fixture([{str:'target'}],'target');assert.equal(resolvePaperPdfSearchRanges({...f.request,hit:{pageId:f.page.id,kind:'pdf',start:0,end:6,excerpt:'target'}},f.source,f.items),null);assert.equal(resolvePaperPdfSearchRanges({...f.request,hit:{...f.hit,start:1}},f.source,f.items),null);
 const text=migratePaper('text-search','target',null),hit=searchPaperDocument(text,'target')[0];assert.equal(resolvePaperPdfSearchRanges({document:text,hit,current:()=>true},f.source,f.items),null);
 const duplicate={...f.document,pages:[...f.document.pages,{...f.page}]};assert.equal(resolvePaperPdfSearchRanges({...f.request,document:duplicate},f.source,f.items),null);
});
test('Item text and glyph-range budgets reject before unbounded measurement',()=>{
 const f=fixture([{str:'target'}],'target');assert.equal(resolvePaperPdfSearchRanges(f.request,f.source,Array.from({length:MAX_PAPER_PDF_SEARCH_ITEMS+1},()=>({str:''}))),null);assert.equal(resolvePaperPdfSearchRanges(f.request,f.source,[{str:'x'.repeat(MAX_PAPER_PDF_SEARCH_TEXT+1)}]),null);
 const items=Array.from({length:MAX_PAPER_PDF_SEARCH_RANGES+1},()=>({str:'x'})),phrase=items.map(()=> 'x').join(' '),g=fixture(items,phrase);assert.equal(resolvePaperPdfSearchRanges(g.request,g.source,g.items),null,'A single valid source match cannot generate more than the existing glyph measurement budget');
});
