import test from 'node:test';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import * as Y from 'yjs';
import {migratePaper,blankPage,isPaperDocument,type PaperDocument,type PaperObject} from '../src/lib/notebookDocument.ts';
import {amendPaperCollaboration,forgetPaperCollaboration,mergePaperCollaboration,mergePaperTextChange,verifyPaperCollaboration} from '../src/lib/paperCollaboration.ts';
import {initialSchedule} from '../src/lib/paperStudy.ts';

const at='2026-10-15T10:00:00.000Z',later='2026-10-15T10:01:00.000Z',future='2099-10-15T10:00:00.000Z';
const same=(actual:unknown,expected:unknown,label='Whole graph and encoded collaboration must remain exactly equal')=>assert.equal(isDeepStrictEqual(actual,expected),true,label);
function seed(noteId:string):PaperDocument{
 const plain=migratePaper(noteId,'Prefix 🦉. Middle. Suffix.',null,at),page=plain.pages[0];
 plain.pages=[{...page,pdf:{assetId:'pdf',pageNumber:1,text:'Exact original PDF text.'}},blankPage('second')];
 plain.assets=[{id:'pdf',name:'Original.pdf',mediaType:'application/pdf',size:32},{id:'image',name:'Original.png',mediaType:'image/png',size:16},{id:'audio',name:'Original.wav',mediaType:'audio/wav',size:8}];
 plain.audio=[{id:'session',assetId:'audio',name:'Original recording',duration:12,startedAt:1}];
 const root={...plain.objects[0],id:'root',textPartition:'partition-A',groupId:'group',audioAnchor:{sessionId:'session',time:2}};
 const ink:PaperObject={id:'stroke',pageId:page.id,kind:'ink',x:20,y:30,width:80,height:50,rotation:17,z:2,locked:false,createdAt:1,mirrorX:true,strokeWidth:3,points:[{x:0,y:0,time:1,pressure:.25,tiltX:13},{x:80,y:50,time:2,pressure:.75,twist:37}]};
 plain.objects=[root,{...root,id:'sticky',kind:'sticky',markdown:'Independent sticky source.',textPartition:'partition-sticky',z:1},ink,{id:'photo',pageId:page.id,kind:'image',x:100,y:200,width:120,height:90,rotation:-9,z:3,locked:false,createdAt:1,assetId:'image'}];
 plain.study={schema:1,language:'fr',cards:[{id:'card',kind:'basic',question:'Original question',answer:'Original answer',schedule:initialSchedule(at),reviews:[],createdAt:at}]};
 assert.equal(isPaperDocument(plain),true,'The measured source is a real complete canonical graph');
 return amendPaperCollaboration(plain,plain);
}
function measured<T>(work:()=>T):{value:T;destroyed:number}{
 const original=Y.Doc.prototype.destroy;let destroyed=0;
 Y.Doc.prototype.destroy=function(this:Y.Doc){destroyed++;return original.call(this);};
 try{return {value:work(),destroyed};}finally{Y.Doc.prototype.destroy=original;}
}
function equivalent(current:PaperDocument,result:ReturnType<typeof mergePaperTextChange>){
 // Reuse the SAME local state/client bytes produced by the measured operation.
 // A separately generated local amendment would invent another Yjs client ID.
 const expected=mergePaperCollaboration(current,result.editorBaseline);assert.ok(expected);
 same(result.document,expected);
 assert.equal(isPaperDocument(result.document),true);verifyPaperCollaboration(result.document);verifyPaperCollaboration(result.editorBaseline);
}
function errorMessage(work:()=>unknown):string{let caught:unknown;try{work();}catch(error){caught=error;}assert.ok(caught instanceof Error,'An invalid source must be rejected');return caught.message;}

test('An identical-state real buffered edit validates one Y.Doc instead of reopening two redundant copies',()=>{
 const baseline=seed('same-state-count'),current=mergePaperCollaboration(baseline,baseline)!;
 assert.notEqual(current,baseline);assert.equal(current.collaboration!.state,baseline.collaboration!.state);
 const originals=structuredClone([current,baseline]),originalDestroy=Y.Doc.prototype.destroy;
 const result=measured(()=>mergePaperTextChange(current,baseline,'root','Local addition. '+baseline.objects[0].markdown));
 assert.equal(Y.Doc.prototype.destroy,originalDestroy,'The real prototype must be restored before any oracle or further merge');
 equivalent(current,result.value);assert.equal(result.value.document.collaboration!.state,result.value.editorBaseline.collaboration!.state);assert.equal(result.value.recovered,false);assert.equal(result.value.objectId,'root');assert.equal(result.value.pageId,baseline.objects[0].pageId);
 same([current,baseline],originals);assert.equal(result.destroyed,1,'This exact same-state path must create/destroy one real Y.Doc; the old implementation destroys three');
});

test('Repeated identity-distinct baselines keep the full-merge bytes, future date, root extras, every collection and revision arithmetic',()=>{
 let baseline=seed('same-state-repeat');
 let current={...mergePaperCollaboration(baseline,baseline)!,revision:baseline.revision+9,updatedAt:future,legacy:{...baseline.legacy,markdown:'Newer root-only provenance'},rootOnly:{keep:['opaque',17],source:'current'}} as PaperDocument&{rootOnly:{keep:(string|number)[];source:string}};
 const initial=structuredClone([current,baseline]);
 for(let index=0;index<4;index++){
  const originals=structuredClone([current,baseline]),beforeRevision=current.revision,text=baseline.objects[0].markdown+' Local '+index+' 🦉.';
  assert.notEqual(current,baseline);assert.equal(current.collaboration!.state,baseline.collaboration!.state);
  const result=measured(()=>mergePaperTextChange(current,baseline,'root',text));
  equivalent(current,result.value);assert.equal(result.value.document.collaboration!.state,result.value.editorBaseline.collaboration!.state);assert.equal(result.value.recovered,false);
  assert.equal(result.value.document.revision,Math.max(beforeRevision,result.value.editorBaseline.revision)+1);assert.equal(result.value.document.updatedAt,future);
  same(result.value.document.legacy,current.legacy);same((result.value.document as typeof current).rootOnly,current.rootOnly);
  same(result.value.document.pages,current.pages);same(result.value.document.assets,current.assets);same(result.value.document.audio,current.audio);same(result.value.document.study,current.study);
  same(result.value.document.objects.filter(row=>row.id!=='root'),current.objects.filter(row=>row.id!=='root'));
  same([current,baseline],originals);baseline=result.value.editorBaseline;current=result.value.document as typeof current;
 }
 assert.equal(initial[0].revision,initial[1].revision+9,'The fixture genuinely starts with different root revisions');
});

test('Divergent histories and partition generations still execute the complete merge or recover the complete buffered source',()=>{
 const baseline=seed('same-state-divergence'),saved=structuredClone(baseline);
 const current=amendPaperCollaboration(baseline,{...baseline,objects:baseline.objects.map(row=>row.id==='root'?{...row,markdown:row.markdown+' Remote sentence.'}:row.id==='stroke'?{...row,x:173}:row),revision:baseline.revision+1,updatedAt:later});
 assert.notEqual(current.collaboration!.state,baseline.collaboration!.state);const original=structuredClone(current);
 const result=measured(()=>mergePaperTextChange(current,baseline,'root','Local sentence. '+baseline.objects[0].markdown));
 equivalent(current,result.value);assert.equal(result.destroyed,3,'A genuinely divergent source keeps all three original Y.Doc validation/merge steps');
 assert.equal(result.value.document.objects.find(row=>row.id==='stroke')!.x,173);
 assert.equal(result.value.document.objects[0].markdown,'Local sentence. '+baseline.objects[0].markdown+' Remote sentence.');
 const partitioned=amendPaperCollaboration(current,{...current,objects:current.objects.map(row=>row.id==='sticky'?{...row,textPartition:'partition-sticky-B'}:row),revision:current.revision+1,updatedAt:later}),partitionOriginal=structuredClone(partitioned);
 const recovered=mergePaperTextChange(partitioned,baseline,'root','Complete buffered source. '+baseline.objects[0].markdown);
 assert.equal(recovered.recovered,true,'A partition conflict in another text region still refuses the structural merge');
 assert.notEqual(recovered.objectId,'root');assert.equal(recovered.document.objects.find(row=>row.id==='root')!.markdown,partitioned.objects[0].markdown);
 assert.equal(recovered.document.objects.find(row=>row.id===recovered.objectId)!.markdown,'Complete buffered source. '+baseline.objects[0].markdown);
 verifyPaperCollaboration(recovered.document);same(partitioned,partitionOriginal);same(current,original);same(baseline,saved);
});

test('Matching encoded state never admits a tampered body, malformed root, foreign source or overflowing final revision',()=>{
 const baseline=seed('same-state-invalid'),original=structuredClone(baseline);
 for(const current of [
  {...baseline,objects:baseline.objects.map(row=>row.id==='root'?{...row,markdown:'Tampered without a Yjs update'}:row)},
  {...baseline,objects:[...baseline.objects,baseline.objects[0]]},
  {...baseline,updatedAt:'not-a-date'},
  {...baseline,collaboration:{...baseline.collaboration!,state:'invalid'}},
 ]){
  const unchanged=structuredClone(current),destroy=Y.Doc.prototype.destroy;
  assert.throws(()=>measured(()=>mergePaperTextChange(current,baseline,'root','Must not overwrite the source')));
  assert.equal(Y.Doc.prototype.destroy,destroy);same(current,unchanged);
 }
 const overflow={...baseline,revision:Number.MAX_SAFE_INTEGER},overflowOriginal=structuredClone(overflow);assert.equal(isPaperDocument(overflow),true);
 const oldLocal=amendPaperCollaboration(baseline,{...baseline,objects:baseline.objects.map(row=>row.id==='root'?{...row,markdown:'Overflow refusal'}:row),revision:baseline.revision+1,updatedAt:later});
 const expectedError=errorMessage(()=>mergePaperCollaboration(overflow,oldLocal));
 assert.equal(errorMessage(()=>mergePaperTextChange(overflow,baseline,'root','Overflow refusal')),expectedError,'The final full-snapshot validator remains equivalent, including safe-integer overflow');
 const foreign={...baseline,noteId:'another-note'};assert.throws(()=>mergePaperTextChange(baseline,foreign,'root','Foreign'),/autre note/);
 same(overflow,overflowOriginal);same(baseline,original);
});

test('The public amendment wrapper keeps its original return shape, cache reuse, validation and failure cleanup',()=>{
 const baseline=seed('same-state-public-cache'),original=structuredClone(baseline),key='qa-same-state-private-projection';
 try{
  const one=amendPaperCollaboration(baseline,{...baseline,objects:baseline.objects.map(row=>row.id==='root'?{...row,markdown:'First cached edit'}:row),revision:baseline.revision+1,updatedAt:later},key);
  assert.equal(Object.hasOwn(one,'document'),false);assert.equal(Object.hasOwn(one,'projection'),false);verifyPaperCollaboration(one);const saved=structuredClone(one);
  assert.throws(()=>amendPaperCollaboration(one,{...one,pages:[...one.pages,one.pages[0]],revision:one.revision+1},key));
  const two=amendPaperCollaboration(one,{...one,objects:one.objects.map(row=>row.id==='root'?{...row,markdown:'Fresh cached edit after rejection'}:row),revision:one.revision+1,updatedAt:later},key);
  assert.equal(two.objects[0].markdown,'Fresh cached edit after rejection');verifyPaperCollaboration(two);same(one,saved);
 }finally{forgetPaperCollaboration(key);}same(baseline,original);
});
