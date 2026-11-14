import test from 'node:test';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {migratePaper,blankPage,isPaperDocument,type PaperDocument,type PaperObject} from '../src/lib/notebookDocument.ts';
import {amendPaperCollaboration,mergePaperCollaboration,verifyPaperCollaboration} from '../src/lib/paperCollaboration.ts';

const at='2026-10-15T10:00:00.000Z',later='2026-10-15T10:01:00.000Z';
const same=(actual:unknown,expected:unknown,label='The whole original graph/history must remain exact')=>assert.equal(isDeepStrictEqual(actual,expected),true,label);
function ink(id:string):PaperObject{return {id,pageId:'page',kind:'ink',x:10,y:20,width:40,height:30,rotation:0,z:0,locked:false,createdAt:1,strokeWidth:2,points:[{x:0,y:0,time:1,pressure:.25},{x:40,y:30,time:2,pressure:.75}]};}
function seed(id:string,objects:PaperObject[]):PaperDocument{const plain=migratePaper(id,'',null,at);plain.pages=[blankPage('page')];plain.objects=objects;assert.equal(isPaperDocument(plain),true);return amendPaperCollaboration(plain,plain);}
function text(id:string,kind:'text'|'sticky'='text'):PaperObject{const {points,...rest}=ink(id);return {...rest,kind,markdown:'Prefix. Middle. Suffix.',textPartition:'partition-A'};}

test('The real full merge keeps a linear object-ID read budget for ink-only and mixed collections without any timing threshold',()=>{
 for(const mixed of [false,true]){
  const count=256,objects=Array.from({length:count},(_,index)=>ink('stroke-'+index));if(mixed){objects[0]=text('__proto__');objects[128]=text('constructor','sticky');}
  const original=seed('merge-linear-'+mixed,objects),preserved=structuredClone(original);let reads=0;
  const observed=():PaperDocument=>({...original,objects:original.objects.map(row=>Object.defineProperty({...row},'id',{enumerable:true,get(){reads++;return row.id;}}))});
  const merged=mergePaperCollaboration(observed(),observed());const measured=reads;
  assert.ok(merged,'The actual Yjs merge must really execute');assert.ok(measured>0,'The actual source IDs must be observed');
  assert.ok(measured<=96*count,`Whole merge object-ID reads must stay linear: ${measured} for ${count} objects (mixed=${mixed})`);
  same(merged.objects,original.objects);same(merged.pages,original.pages);same(merged.assets,original.assets);same(merged.audio,original.audio);same(merged.study,original.study);assert.equal(merged.revision,original.revision+1);verifyPaperCollaboration(merged);same(original,preserved);
 }
});

test('Real text and sticky partition mismatches still refuse in both directions without touching either source',()=>{
 for(const kind of ['text','sticky'] as const){
  const before=seed('partition-refusal-'+kind,[text('root',kind),ink('retained')]);
  const local=amendPaperCollaboration(before,{...before,objects:before.objects.map(row=>row.id==='root'?{...row,textPartition:'partition-left'}:row),revision:before.revision+1,updatedAt:later});
  const remote=amendPaperCollaboration(before,{...before,objects:before.objects.map(row=>row.id==='root'?{...row,textPartition:'partition-right'}:row),revision:before.revision+1,updatedAt:later});
  const originals=[structuredClone(local),structuredClone(remote)];assert.equal(mergePaperCollaboration(local,remote),null);assert.equal(mergePaperCollaboration(remote,local),null);same([local,remote],originals);verifyPaperCollaboration(local);verifyPaperCollaboration(remote);
 }
});

test('Same-partition concurrent text/property edits converge, while ink-only partition metadata does not invent a text refusal',()=>{
 const before=seed('partition-convergence',[text('__proto__'),text('constructor','sticky'),{...ink('stroke'),textPartition:'ink-base'}]),baseline=structuredClone(before);
 const local=amendPaperCollaboration(before,{...before,objects:before.objects.map(row=>row.id==='__proto__'?{...row,markdown:'Local. '+row.markdown}:row.id==='stroke'?{...row,textPartition:'ink-local',x:91}:row),revision:before.revision+1,updatedAt:later});
 const remote=amendPaperCollaboration(before,{...before,objects:before.objects.map(row=>row.id==='__proto__'?{...row,markdown:row.markdown+' Remote.'}:row.id==='constructor'?{...row,color:'#123456'}:row.id==='stroke'?{...row,textPartition:'ink-remote',y:82}:row),revision:before.revision+1,updatedAt:later});
 const originals=[structuredClone(local),structuredClone(remote)],ab=mergePaperCollaboration(local,remote),ba=mergePaperCollaboration(remote,local);assert.ok(ab);assert.ok(ba);
 same(ab.objects,ba.objects);assert.equal(ab.collaboration!.state,ba.collaboration!.state);assert.equal(ab.objects[0].markdown,'Local. Prefix. Middle. Suffix. Remote.');assert.equal(ab.objects[0].textPartition,'partition-A');assert.equal(ab.objects[1].color,'#123456');assert.equal(ab.objects[2].x,91);assert.equal(ab.objects[2].y,82);assert.ok(['ink-local','ink-remote'].includes(ab.objects[2].textPartition!));
 verifyPaperCollaboration(ab);verifyPaperCollaboration(ba);same([local,remote],originals);same(before,baseline);
});

test('First remote duplicate semantics and all existing malformed/foreign source guards remain fail closed',()=>{
 const before=seed('partition-first-match',[text('root')]),source=structuredClone(before),mismatch={...before.objects[0],textPartition:'partition-B'};
 const firstMismatch={...before,objects:[mismatch,before.objects[0]]};assert.equal(mergePaperCollaboration(before,firstMismatch),null,'find previously refused the first divergent partition before opening an invalid duplicate snapshot');
 const lastMismatch={...before,objects:[before.objects[0],mismatch]};assert.throws(()=>mergePaperCollaboration(before,lastMismatch),/correspond|simultanées/,'Matching first partition must still reach complete snapshot validation and reject duplicate IDs');
 const invalidState={...before,collaboration:{...before.collaboration!,state:'invalid'}};assert.throws(()=>mergePaperCollaboration(before,invalidState));
 const otherLineage={...before,collaboration:{...before.collaboration!,lineage:'foreign'}};assert.equal(mergePaperCollaboration(before,otherLineage),null);
 const otherNote={...before,noteId:'foreign'};assert.equal(mergePaperCollaboration(before,otherNote),null);assert.equal(mergePaperCollaboration({...before,collaboration:undefined},before),null);
 same(before,source);same(firstMismatch.objects,[mismatch,before.objects[0]]);same(lastMismatch.objects,[before.objects[0],mismatch]);
});
