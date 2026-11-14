import test from 'node:test';
import assert from 'node:assert/strict';
import {textMatches,searchPaperDocument} from '../src/lib/paperSearch.ts';
import {migratePaper,blankPage} from '../src/lib/notebookDocument.ts';
test('Search ignores accents while retaining exact original ranges and emoji offsets',()=>{
 const text='📝 Énergie et énergie, étude.';const matches=textMatches(text,'ENERGIE');assert.equal(matches.length,2);assert.equal(text.slice(matches[0].start,matches[0].end),'Énergie');assert.equal(text.slice(matches[1].start,matches[1].end),'énergie');assert.equal(textMatches(text,'📝')[0].end,2);assert.deepEqual(textMatches(text,'   '),[]);
});
test('Search traverses all pages, post-its and extracted PDFs without inventing OCR',()=>{
 const doc=migratePaper('search','Premier texte',null),pdf=blankPage('pdf');doc.assets.push({id:'pdf-file',name:'pdf',mediaType:'application/pdf',size:1});pdf.pdf={assetId:'pdf-file',pageNumber:1,text:'La physique et l’énergie'};doc.pages.push(pdf);doc.objects.push({...doc.objects[0],id:'sticky',kind:'sticky',pageId:pdf.id,markdown:'Une énergie à garder'});
 const hits=searchPaperDocument(doc,'energie');assert.equal(hits.length,2);assert.ok(hits.every(h=>h.pageId==='pdf'));assert.deepEqual(hits.map(h=>h.kind),['text','pdf']);assert.equal(searchPaperDocument(doc,'energie',1).length,1);delete pdf.pdf.text;assert.equal(searchPaperDocument(doc,'energie').length,1);
});
