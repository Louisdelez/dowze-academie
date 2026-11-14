import test from 'node:test';
import assert from 'node:assert/strict';
import {migratePaper,applyPaperCommand,isPaperDocument} from '../src/lib/notebookDocument.ts';
import {PAPER_FORMATS,paperUnits,pageFormat,inheritedBlankPage,changePaperFormat} from '../src/lib/paperTemplates.ts';
test('Formats use physical 96 dpi dimensions and retain handwriting coordinates',()=>{
 const doc=migratePaper('paper','Texte',null),page=doc.pages[0];assert.equal(pageFormat(page),'A4');const original=structuredClone(doc.objects);const resized=applyPaperCommand(doc,changePaperFormat(doc,page.id,...PAPER_FORMATS.A3));assert.equal(resized.pages[0].width,paperUnits(297));assert.equal(pageFormat(resized.pages[0]),'A3');assert.deepEqual(resized.objects,original);assert.throws(()=>changePaperFormat(doc,page.id,NaN,297));assert.throws(()=>changePaperFormat(doc,page.id,10,20));
});
test('Shrinking a page cannot clip existing rotated objects or change the original PDF',()=>{
 const doc=migratePaper('paper','Texte',null),before=structuredClone(doc);assert.throws(()=>changePaperFormat(doc,doc.pages[0].id,...PAPER_FORMATS.A5),/couperait/);assert.deepEqual(doc,before);let rotated=applyPaperCommand(doc,{type:'patch-object',id:doc.objects[0].id,patch:{x:650,y:900,width:100,height:100,rotation:45}});assert.throws(()=>changePaperFormat(rotated,doc.pages[0].id,210,260),/couperait/);const pdf={...doc,pages:[{...doc.pages[0],pdf:{assetId:'pdf',pageNumber:1}}]};assert.throws(()=>changePaperFormat(pdf,doc.pages[0].id,297,420),/PDF/);
});
test('New blank pages inherit style and dimensions without reusing PDF, bookmark or identity',()=>{
 const doc=migratePaper('paper','Texte',null),p={...doc.pages[0],width:1000,height:1500,template:'cornell' as const,spacing:24,pattern:'ruled' as const,bookmark:true,pdf:{assetId:'pdf',pageNumber:1}};const next=inheritedBlankPage(p,'fresh');assert.equal(next.template,'cornell');assert.equal(next.pattern,'ruled');assert.equal(next.width,1000);assert.equal(next.id,'fresh');assert.equal(next.bookmark,false);assert.equal(next.pdf,undefined);assert.ok(isPaperDocument({...doc,pages:[next],objects:[]}));assert.equal(isPaperDocument({...doc,pages:[{...doc.pages[0],spacing:0}]}),false);assert.equal(isPaperDocument({...doc,pages:[{...doc.pages[0],template:'unsupported'}]}),false);
});
