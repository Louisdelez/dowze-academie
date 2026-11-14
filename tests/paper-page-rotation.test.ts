import test from 'node:test';
import assert from 'node:assert/strict';
import {applyPaperCommand,migratePaper,isPaperDocument} from '../src/lib/notebookDocument.ts';
import {objectPoint} from '../src/lib/paperGeometry.ts';
import {rotatePaperPage} from '../src/lib/paperPageRotation.ts';
test('Page rotation preserves the physical position of every annotation in the new coordinates',()=>{
 const doc=migratePaper('rotation','Texte',null),source=applyPaperCommand(doc,{type:'patch-object',id:doc.objects[0].id,patch:{x:130,y:270,width:200,height:100,rotation:15,locked:true}}),o=source.objects[0],point=objectPoint(o,{x:20,y:40}),rotated=applyPaperCommand(source,rotatePaperPage(source,source.pages[0].id,1)),mapped=objectPoint(rotated.objects[0],{x:20,y:40});assert.ok(isPaperDocument(rotated));assert.equal(rotated.pages[0].width,source.pages[0].height);assert.equal(rotated.pages[0].height,source.pages[0].width);assert.ok(Math.abs(mapped.x-(source.pages[0].height-point.y))<1e-9);assert.ok(Math.abs(mapped.y-point.x)<1e-9);assert.equal(rotated.objects[0].locked,true);assert.equal(rotated.objects[0].markdown,'Texte');
 let turn=source;for(let i=0;i<4;i++)turn=applyPaperCommand(turn,rotatePaperPage(turn,turn.pages[0].id,1));assert.deepEqual(turn.pages,source.pages);assert.deepEqual(turn.objects,source.objects);const inverse=applyPaperCommand(rotated,rotatePaperPage(rotated,rotated.pages[0].id,-1));assert.deepEqual(inverse.objects,source.objects);
});
test('Rotation does not move another page or rewrite pen samples and audio references',()=>{
 const doc=migratePaper('rotation','Texte',null),p=doc.pages[0],ink={...doc.objects[0],id:'ink',kind:'ink' as const,markdown:undefined,x:30,y:50,width:300,height:400,points:[{x:0,y:0,time:10,pressure:.5},{x:200,y:300,time:20,pressure:.8}],strokeWidth:3};const all=applyPaperCommand(doc,{type:'batch',commands:[{type:'insert-page',page:{...p,id:'other'}},{type:'upsert-object',object:ink}]});const next=applyPaperCommand(all,rotatePaperPage(all,p.id,1));assert.deepEqual(next.pages[1],all.pages[1]);assert.deepEqual(next.objects.find(o=>o.id==='ink')?.points,ink.points);assert.throws(()=>rotatePaperPage(all,'missing',1));
});
