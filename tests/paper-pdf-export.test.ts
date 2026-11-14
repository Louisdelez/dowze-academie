import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument,StandardFonts,degrees} from 'pdf-lib';
import {paperPdfSize,addOriginalPdfPage} from '../src/lib/paperPdfExport.ts';
test('PDF units and rotated original pages retain vector contents and their physical dimensions',async()=>{
 assert.deepEqual(paperPdfSize({width:800,height:1120}),{width:600,height:840});
 const original=await PDFDocument.create(),font=await original.embedFont(StandardFonts.Helvetica);for(const rotation of [0,90,180,270]){const p=original.addPage([600,840]);p.drawText('Selectable original',{font,size:20,x:30,y:700});p.setRotation(degrees(rotation));}
 const output=await PDFDocument.create();for(let i=0;i<4;i++){const turned=i%2===1,size=turned?{width:840,height:600}:{width:600,height:840};const p=await addOriginalPdfPage(output,original,i,size);assert.equal(p.getWidth(),size.width);assert.equal(p.getHeight(),size.height);assert.ok(p.node.Resources());}
 const reread=await PDFDocument.load(await output.save());assert.equal(reread.getPageCount(),4);assert.deepEqual(reread.getPages().map(p=>[p.getWidth(),p.getHeight()]),[[600,840],[840,600],[600,840],[840,600]]);
});

test('An additional notebook rotation is applied to the vector PDF resources',async()=>{
 const original=await PDFDocument.create(),source=original.addPage([600,840]);source.drawText('Vector pivot',{x:40,y:700});source.setRotation(degrees(90));const output=await PDFDocument.create();const p=await addOriginalPdfPage(output,original,0,{width:600,height:840},90);assert.equal(p.getWidth(),600);assert.equal(p.getHeight(),840);assert.ok(p.node.Resources());const read=await PDFDocument.load(await output.save());assert.equal(read.getPageCount(),1);
});

test('A blank imported PDF page remains exportable without inventing or requiring a content stream',async()=>{
 const original=await PDFDocument.create();original.addPage([600,840]);const output=await PDFDocument.create();await addOriginalPdfPage(output,original,0,{width:840,height:600},90);const read=await PDFDocument.load(await output.save());assert.equal(read.getPageCount(),1);assert.equal(read.getPage(0).getWidth(),840);
});
