import test from 'node:test';
import assert from 'node:assert/strict';
import {retainRecordingHistory} from '../src/lib/paperRecordingHistory.ts';
import {applyPaperCommand,migratePaper,recordPaperHistory,emptyPaperHistory,travelPaperHistory,type PaperCommand} from '../src/lib/notebookDocument.ts';

test('Undo/redo edits preserve every saved audio section without adding undo steps',()=>{
 const before=migratePaper('audio-undo','Before',null),text=before.objects[0];
 let document=applyPaperCommand(before,{type:'patch-object',id:text.id,patch:{markdown:'After'}}),history=recordPaperHistory(emptyPaperHistory(),before);
 const capture=(parts:number):PaperCommand=>({type:'batch',commands:[...Array.from({length:parts},(_,i)=>({type:'add-asset' as const,asset:{id:`part-${i}`,name:'Sound',mediaType:'audio/wav',size:200}})),{type:'add-audio',audio:{id:'recording',name:'Sound',assetId:'part-0',duration:parts,startedAt:1,inProgress:true,segments:Array.from({length:parts},(_,i)=>({assetId:`part-${i}`,offset:i,duration:1}))}},{type:'patch-object',id:text.id,patch:{audioAnchor:{sessionId:'recording',time:0.2}}}]});
 history=retainRecordingHistory(history,capture(1));document=applyPaperCommand(document,capture(1));assert.equal(history.past.length,1);
 const undone=travelPaperHistory(history,document,'undo')!;assert.equal(undone.document.objects[0].markdown,'Before');assert.equal(undone.document.audio[0].duration,1);
 history=retainRecordingHistory(undone.history,capture(3));document=applyPaperCommand(undone.document,capture(3));assert.equal(history.past.length,0);assert.equal(history.future.length,1);
 const redone=travelPaperHistory(history,document,'redo')!;assert.equal(redone.document.objects[0].markdown,'After');assert.equal(redone.document.audio[0].duration,3);assert.equal(redone.document.assets.length,3);assert.deepEqual(redone.document.objects[0].audioAnchor,{sessionId:'recording',time:.2});
});

test('Background recording cannot change user text and does not resurrect removed objects',()=>{
 const original=migratePaper('audio-delete','original',null),removed=applyPaperCommand(original,{type:'remove-objects',ids:[original.objects[0].id]}),history={past:[original,removed],future:[]};
 assert.throws(()=>retainRecordingHistory(history,{type:'patch-object',id:original.objects[0].id,patch:{markdown:'forbidden'}}));assert.equal(original.objects[0].markdown,'original');
 const result=retainRecordingHistory(history,{type:'batch',commands:[{type:'add-asset',asset:{id:'audio',name:'Sound',mediaType:'audio/wav',size:100}},{type:'add-audio',audio:{id:'audio',name:'Sound',assetId:'audio',duration:1,startedAt:0}},{type:'patch-object',id:original.objects[0].id,patch:{audioAnchor:{sessionId:'audio',time:.5}}}]});
 assert.equal(result.past[1].objects.length,0);assert.equal(result.past[0].objects[0].markdown,'original');assert.equal(result.past[0].revision,original.revision);assert.equal(result.past[0].updatedAt,original.updatedAt);assert.equal(history.past[0].audio.length,0);
});
