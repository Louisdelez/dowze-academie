import test from 'node:test';
import {inheritedBlankPage,changePaperFormat} from '../src/lib/paperTemplates.ts';
import assert from 'node:assert/strict';
import {migratePaper,applyPaperCommand,isPaperDocument,emptyPaperHistory,recordPaperHistory,travelPaperHistory,type PaperObject} from '../src/lib/notebookDocument.ts';
import {objectPoint} from '../src/lib/paperGeometry.ts';
import {rotatePaperPage} from '../src/lib/paperPageRotation.ts';
import {duplicatePaperPage} from '../src/lib/paperPageCopy.ts';
import {resizePaperObject,compactInk} from '../src/lib/paperTransforms.ts';
import {amendPaperCollaboration,mergePaperCollaboration} from '../src/lib/paperCollaboration.ts';
import {createPaperMeasurementCalibration,paperMeasurementLength,paperMeasurementArea} from '../src/lib/paperMeasurement.ts';
const fixture=()=>{
 const doc=migratePaper('measurement-canonical-note','Texte existant',null),page=doc.pages[0];page.calibration=createPaperMeasurementCalibration(200,100,'mm');
 const line:PaperObject={id:'length-object',pageId:page.id,kind:'ink',x:20,y:30,width:100,height:2,rotation:0,z:2,locked:false,createdAt:1,pen:'pen',strokeWidth:2,measurement:{schema:1,kind:'length',unit:'mm'},points:[{x:0,y:0,time:1},{x:100,y:0,time:2}]};
 const area:PaperObject={...line,id:'area-object',x:30,y:60,height:50,measurement:{schema:1,kind:'area',unit:'mm'},points:[{x:0,y:0,time:1},{x:100,y:0,time:2},{x:100,y:50,time:3},{x:0,y:50,time:4},{x:0,y:0,time:5}]};
 doc.objects.push(line,area);return doc;
};
test('Legacy notes still validate; calibration and measurement metadata survive canonical JSON roundtrip',()=>{
 const legacy=migratePaper('legacy-measurement','Ancien texte',null);assert.equal(isPaperDocument(legacy),true);
 const doc=fixture(),restored=JSON.parse(JSON.stringify(doc));assert.equal(isPaperDocument(restored),true);assert.deepEqual(restored,doc);
 assert.equal(paperMeasurementLength(restored.objects[1].points,restored.pages[0].calibration,'mm').value,50);
 assert.equal(paperMeasurementArea(restored.objects[2].points,restored.pages[0].calibration,'mm').value,1250);
});
test('Invalid calibration, wrong object kinds and misleading measured geometry are refused without changing the prior document',()=>{
 const doc=fixture(),prior=structuredClone(doc);
 for(const calibration of [{schema:1,pageUnitsPerMm:0},{schema:2,pageUnitsPerMm:2},{schema:1,pageUnitsPerMm:Infinity}])assert.equal(isPaperDocument({...doc,pages:[{...doc.pages[0],calibration}]}),false);
 assert.equal(isPaperDocument({...doc,objects:[{...doc.objects[0],measurement:{schema:1,kind:'length',unit:'mm'}},...doc.objects.slice(1)]}),false);
 assert.equal(isPaperDocument({...doc,objects:[doc.objects[0],{...doc.objects[1],x:1e308},doc.objects[2]]}),false,'An unrepresentable transformed measurement must be refused');
 const crossed={...doc.objects[2],points:[{x:0,y:0,time:1},{x:100,y:50,time:2},{x:0,y:50,time:3},{x:100,y:0,time:4}]};
 assert.throws(()=>applyPaperCommand(doc,{type:'upsert-object',object:crossed}),/invalide/);assert.deepEqual(doc,prior);
});
test('Actual page rotation preserves calibrated lengths and surfaces; object resizing derives new physical values',()=>{
 const doc=fixture(),rotated=applyPaperCommand(doc,rotatePaperPage(doc,doc.pages[0].id,1));assert.equal(isPaperDocument(rotated),true);
 assert.deepEqual(rotated.pages[0].calibration,doc.pages[0].calibration);
 const line=rotated.objects.find(o=>o.id==='length-object')!,area=rotated.objects.find(o=>o.id==='area-object')!;
 assert.ok(Math.abs(paperMeasurementLength(line.points!.map(p=>objectPoint(line,p)),rotated.pages[0].calibration,'mm').value-50)<1e-9);
 assert.ok(Math.abs(paperMeasurementArea(area.points!.map(p=>objectPoint(area,p)),rotated.pages[0].calibration,'mm').value-1250)<1e-9);
 const normalized=compactInk(doc.objects[2]),enlarged=resizePaperObject(normalized,normalized.width*2,normalized.height*2);assert.deepEqual(enlarged.measurement,doc.objects[2].measurement);
 assert.equal(paperMeasurementArea(enlarged.points!,doc.pages[0].calibration,'mm').value,5000);
});
test('Page duplication remaps object IDs while preserving calibration and measured canonical geometry',()=>{
 const doc=fixture();let id=0;const copy=duplicatePaperPage(doc,doc.pages[0].id,()=>`copy-${++id}`),next=applyPaperCommand(doc,copy.command);
 assert.equal(isPaperDocument(next),true);const page=next.pages.find(p=>p.id===copy.pageId)!;
 assert.deepEqual(page.calibration,doc.pages[0].calibration);
 const copies=next.objects.filter(o=>o.pageId===page.id&&o.measurement);assert.equal(copies.length,2);
 for(const object of copies){assert.ok(!doc.objects.some(o=>o.id===object.id));const original=doc.objects.find(o=>o.measurement?.kind===object.measurement?.kind)!;assert.deepEqual(object.measurement,original.measurement);assert.deepEqual(object.points,original.points);}
});
test('Concurrent measured annotations use independent canonical object identities and merge without dropping either view',()=>{
 const plain=fixture(),base=amendPaperCollaboration(plain,plain);const a={...base.objects[1],id:'measure-from-A'},b={...base.objects[1],id:'measure-from-B',y:90};
 const left=amendPaperCollaboration(base,applyPaperCommand(base,{type:'upsert-object',object:a})),right=amendPaperCollaboration(base,applyPaperCommand(base,{type:'upsert-object',object:b}));
 const merged=mergePaperCollaboration(left,right);assert.ok(merged);assert.equal(isPaperDocument(merged),true);
 assert.deepEqual(merged.objects.find(o=>o.id===a.id)?.measurement,a.measurement);assert.deepEqual(merged.objects.find(o=>o.id===b.id)?.measurement,b.measurement);assert.deepEqual(merged.pages[0].calibration,base.pages[0].calibration);
});
test('Undo and redo restore the complete calibration and measured annotations together',()=>{
 const initial=migratePaper('measured-undo','Texte intact',null),page=initial.pages[0],source=fixture(),measurement={...source.objects[1],pageId:page.id};
 const next=applyPaperCommand(initial,{type:'batch',commands:[{type:'update-page',page:{...page,calibration:source.pages[0].calibration}},{type:'upsert-object',object:measurement}]}),history=recordPaperHistory(emptyPaperHistory(),initial),undo=travelPaperHistory(history,next,'undo');
 assert.ok(undo);assert.deepEqual(undo.document.pages,initial.pages);assert.deepEqual(undo.document.objects,initial.objects);assert.deepEqual(undo.document.legacy,initial.legacy);assert.equal(undo.document.revision,next.revision+1);const redo=travelPaperHistory(undo.history,undo.document,'redo');assert.ok(redo);assert.equal(redo.document.revision,undo.document.revision+1);assert.deepEqual(redo.document.pages,next.pages);assert.deepEqual(redo.document.objects,next.objects);
});


test('A new blank page retains an independent calibration without measurement content; format changes preserve the scalar',()=>{
 const doc=fixture(),source=doc.pages[0],next=inheritedBlankPage(source,'blank-measurement-page');assert.deepEqual(next.calibration,source.calibration);assert.notEqual(next.calibration,source.calibration);
 next.calibration!.pageUnitsPerMm=8;assert.equal(source.calibration!.pageUnitsPerMm,2);
 const changed=applyPaperCommand(doc,changePaperFormat(doc,source.id,297,420));assert.deepEqual(changed.pages[0].calibration,source.calibration);assert.deepEqual(changed.objects,doc.objects);
});


test('Oversized measured point arrays are refused before reading or transforming their entries',()=>{
 for(const [kind,count] of [['length',20001],['area',514]] as const){const doc=fixture(),object=doc.objects[kind==='length'?1:2];let reads=0;const points=new Array(count);Object.defineProperty(points,0,{get(){reads++;throw Error('Oversized input must not be touched');}});const oversized={...object,measurement:{schema:1,kind,unit:'page'},points};assert.equal(isPaperDocument({...doc,objects:[oversized]}),false);assert.equal(reads,0);}
});
