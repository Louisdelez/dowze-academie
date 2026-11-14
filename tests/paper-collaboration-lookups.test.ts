import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import * as Y from 'yjs';
import {migratePaper,blankPage,applyPaperCommand,isPaperDocument,type PaperDocument} from '../src/lib/notebookDocument.ts';
import {amendPaperCollaboration,forgetPaperCollaboration,mergePaperCollaboration,mergePaperTextChange,verifyPaperCollaboration} from '../src/lib/paperCollaboration.ts';
import {initialSchedule} from '../src/lib/paperStudy.ts';

const at='2026-10-15T10:00:00.000Z',later='2026-10-15T10:01:00.000Z';
// Keep the full strict oracle without dumping encoded histories if it fails.
const unchanged=(actual:unknown,expected:unknown)=>assert.equal(isDeepStrictEqual(actual,expected),true,'The entire original graph and encoded history must remain exact');
function plain(noteId:string):PaperDocument{
 const value=migratePaper(noteId,'Prefix 🦉 middle suffix.',null,at);
 value.pages=[blankPage('first'),blankPage('second'),blankPage('third')];
 value.objects=[{...value.objects[0],id:'root',pageId:'first'},
  {...value.objects[0],id:'__proto__',pageId:'first',markdown:'Independent removed text.'},
  {...value.objects[0],id:'constructor',pageId:'first',markdown:'Independent retained text.'}];
 return value;
}
const seed=(noteId:string)=>{const value=plain(noteId);return amendPaperCollaboration(value,value);};
function withHistory<T>(document:PaperDocument,read:(doc:Y.Doc)=>T):T{
 const doc=new Y.Doc();try{Y.applyUpdate(doc,Uint8Array.from(atob(document.collaboration!.state),c=>c.charCodeAt(0)));return read(doc);}finally{doc.destroy();}
}
function fields(doc:Y.Doc,collection:string,id:string):Y.Map<unknown>{
 const entity=doc.getMap<Y.Map<unknown>>(collection).get(id);assert.ok(entity);const value=entity.get('fields');assert.ok(value instanceof Y.Map);return value;
}

test('Collection amendments preserve exact reorder, deletion, insertion and opaque IDs in the real Yjs maps',()=>{
 const before=seed('lookup-structure'),original=structuredClone(before),added={...before.objects[0],id:'new-object',pageId:'inserted',markdown:'New page text.'};
 const next:PaperDocument={...before,pages:[before.pages[2],before.pages[0],blankPage('inserted')],objects:[before.objects[2],{...before.objects[0],x:91},added],revision:before.revision+1,updatedAt:later};
 const result=amendPaperCollaboration(before,next);
 assert.deepEqual(result.pages,next.pages);assert.deepEqual(result.objects,next.objects);assert.deepEqual(result.assets,before.assets);assert.deepEqual(result.audio,before.audio);assert.deepEqual(result.legacy,before.legacy);
 assert.equal(result.revision,next.revision);assert.equal(result.updatedAt,later);assert.equal(result.collaboration!.lineage,before.collaboration!.lineage);
 withHistory(result,doc=>{for(const name of ['pages','objects'] as const){const map=doc.getMap<Y.Map<unknown>>(name);assert.equal(map.size,next[name].length);next[name].forEach((row,index)=>assert.equal(map.get(row.id)!.get('position'),index));}assert.equal(doc.getMap('pages').has('second'),false);assert.equal(doc.getMap('objects').has('__proto__'),false);assert.equal(fields(doc,'objects','constructor').get('markdown') instanceof Y.Text,true);});
 verifyPaperCollaboration(result);unchanged(before,original);
});

test('Field removal and edits retain real Y.Text identity and unchanged relative positions',()=>{
 const value=plain('lookup-fields');value.objects[0]={...value.objects[0],color:'#abcdef',opacity:0.7,mirrorX:true};
 const before=amendPaperCollaboration(value,value),original=structuredClone(before),oldText=before.objects[0].markdown!,suffix=oldText.indexOf('suffix');
 const relative=withHistory(before,doc=>Y.createRelativePositionFromTypeIndex(fields(doc,'objects','root').get('markdown') as Y.Text,suffix));
 const text='Prefix 🦉 changed middle suffix.',next:PaperDocument={...before,objects:before.objects.map(row=>row.id==='root'?{...row,markdown:text,color:undefined,opacity:0,mirrorX:false}:row),revision:before.revision+1,updatedAt:later};
 const result=amendPaperCollaboration(before,next);
 assert.deepEqual(result.objects,next.objects);
 withHistory(result,doc=>{const row=fields(doc,'objects','root'),current=row.get('markdown');assert.ok(current instanceof Y.Text);assert.equal(row.has('color'),false);assert.equal(row.get('opacity'),0);assert.equal(row.get('mirrorX'),false);assert.equal(current.toString(),text);const absolute=Y.createAbsolutePositionFromRelativePosition(relative,doc);assert.ok(absolute);assert.equal(absolute.type,current);assert.equal(absolute.index,text.indexOf('suffix'));});
 verifyPaperCollaboration(result);unchanged(before,original);
});

test('Asset and audio reorder preserves all media proofs, PDF links and original input bytes',()=>{
 const value=plain('lookup-media'),bytes=new Map([['image',Uint8Array.of(137,80,78,71)],['pdf',Uint8Array.of(37,80,68,70)],['audio-a',Uint8Array.of(1,2)],['audio-b',Uint8Array.of(3,4,5)]]),digest=(id:string)=>createHash('sha256').update(bytes.get(id)!).digest('hex');
 value.assets=[...bytes].map(([id,body])=>({id,name:id,mediaType:id==='image'?'image/png':id==='pdf'?'application/pdf':'application/octet-stream',size:body.length,serverId:'server-'+id}));
 value.pages[0]={...value.pages[0],pdf:{assetId:'pdf',pageNumber:1,text:'Exact extracted source.'}};
 value.objects.push({...value.objects[0],id:'photo',kind:'image',assetId:'image'});
 value.audio=[{id:'track-a',assetId:'audio-a',name:'Exact source',duration:2,startedAt:1,source:{schema:1,mediaType:'audio/wav',originalName:'original.wav',size:5,chunks:[{assetId:'audio-a',size:2,sha256:digest('audio-a')},{assetId:'audio-b',size:3,sha256:digest('audio-b')}]}},{id:'track-b',assetId:'audio-b',name:'Other source',duration:1,startedAt:2}];
 const before=amendPaperCollaboration(value,value),original=structuredClone(before),originalBytes=[...bytes].map(([id,body])=>[id,[...body]]),next:PaperDocument={...before,assets:[...before.assets].reverse(),audio:[...before.audio].reverse(),objects:[...before.objects].reverse(),revision:before.revision+1,updatedAt:later};
 const result=amendPaperCollaboration(before,next);
 assert.deepEqual(result.assets,next.assets);assert.deepEqual(result.audio,next.audio);assert.deepEqual(result.pages,before.pages);assert.deepEqual(result.objects,next.objects);
 withHistory(result,doc=>{for(const name of ['assets','audio'] as const)next[name].forEach((row,index)=>{assert.equal(doc.getMap<Y.Map<unknown>>(name).get(row.id)!.get('position'),index);assert.deepEqual(fields(doc,name,row.id).toJSON(),row);});});
 verifyPaperCollaboration(result);unchanged(before,original);assert.deepEqual([...bytes].map(([id,body])=>[id,[...body]]),originalBytes);
});

test('Study reorder and concurrent text/review changes keep each real event and schedule',()=>{
 const value=plain('lookup-cards'),card=(id:string)=>({id,kind:'basic' as const,question:'Question '+id,answer:'Answer '+id,schedule:initialSchedule(at),reviews:[],createdAt:at});
 value.study={schema:1,language:'fr',cards:[card('first-card'),card('removed-card'),card('constructor')]};
 const before=amendPaperCollaboration(value,value),original=structuredClone(before),localPlan=applyPaperCommand(before,{type:'review-card',id:'first-card',quality:4,reviewId:'local-review'},later);
 const local=amendPaperCollaboration(before,{...localPlan,study:{...localPlan.study!,cards:[localPlan.study!.cards[2],localPlan.study!.cards[0]]}}),remote=amendPaperCollaboration(before,applyPaperCommand(before,{type:'patch-object',id:'root',patch:{markdown:'Remote. '+before.objects[0].markdown}},later));
 const ab=mergePaperCollaboration(local,remote),ba=mergePaperCollaboration(remote,local);assert.ok(ab);assert.ok(ba);
 assert.deepEqual(ab.study,ba.study);assert.deepEqual(ab.objects,ba.objects);assert.deepEqual(ab.study!.cards.map(row=>row.id),['constructor','first-card']);assert.deepEqual(ab.study!.cards[1].reviews.map(row=>row.id),['local-review']);assert.equal(ab.study!.cards[1].schedule.repetitions,1);assert.equal(ab.objects[0].markdown,'Remote. '+before.objects[0].markdown);
 withHistory(ab,doc=>{assert.equal(doc.getMap('cards').has('removed-card'),false);assert.equal(fields(doc,'cards','first-card').get('question') instanceof Y.Text,true);});
 verifyPaperCollaboration(ab);verifyPaperCollaboration(ba);unchanged(before,original);
});

test('A removed source still recovers a complete buffered edit without restoring deleted identities',()=>{
 const before=seed('lookup-recovery'),remote=amendPaperCollaboration(before,applyPaperCommand(before,{type:'remove-page',id:'first'},later)),original=structuredClone(remote),text=before.objects[0].markdown+' Buffered last sentence.';
 const result=mergePaperTextChange(remote,before,'root',text);
 assert.equal(result.recovered,true);assert.notEqual(result.objectId,'root');assert.notEqual(result.pageId,'first');assert.equal(result.document.pages.length,remote.pages.length+1);assert.deepEqual(result.document.pages.slice(0,-1),remote.pages);assert.equal(result.document.pages.some(row=>row.id==='first'),false);assert.equal(result.document.objects.some(row=>['root','__proto__','constructor'].includes(row.id)),false);assert.equal(result.document.objects.find(row=>row.id===result.objectId)!.markdown,text);assert.deepEqual(result.document.assets,remote.assets);assert.equal(result.document.collaboration!.lineage,remote.collaboration!.lineage);
 verifyPaperCollaboration(result.document);unchanged(remote,original);
});

test('Duplicate IDs remain rejected and cannot poison the existing scoped cache or source',()=>{
 const before=seed('lookup-duplicates'),original=structuredClone(before),key='qa-lookup-cache';
 try{const next=amendPaperCollaboration(before,applyPaperCommand(before,{type:'patch-object',id:'root',patch:{markdown:'Accepted cached text.'}},later),key),saved=structuredClone(next);
  assert.throws(()=>amendPaperCollaboration(next,{...next,pages:[next.pages[0],{...next.pages[0],color:'#000000'},...next.pages.slice(1)],revision:next.revision+1},key),/correspond|simultanées/);
  assert.throws(()=>amendPaperCollaboration({...next,objects:[...next.objects,{...next.objects[0],markdown:'Divergent duplicate.'}]},next,key),/correspond|simultanées/);
  const retry=amendPaperCollaboration(next,applyPaperCommand(next,{type:'patch-object',id:'root',patch:{markdown:'Fresh cached retry.'}},later),key);assert.equal(retry.objects[0].markdown,'Fresh cached retry.');verifyPaperCollaboration(retry);unchanged(next,saved);
 }finally{forgetPaperCollaboration(key);}unchanged(before,original);
});

test('An unchanged 256-page collection has a linear ID-read budget, independent of machine speed',()=>{
 const value=plain('lookup-linear');value.pages=Array.from({length:256},(_,index)=>blankPage('page-'+index));value.objects=value.objects.map(row=>({...row,pageId:'page-0'}));
 const before=amendPaperCollaboration(value,value);let reads=0;
 const pages=before.pages.map(row=>Object.defineProperty({...row},'id',{enumerable:true,get(){reads++;return row.id;}})),observed={...before,pages};
 const result=amendPaperCollaboration(observed,{...observed,objects:observed.objects.map(row=>row.id==='root'?{...row,markdown:'One accepted text change.'}:row),revision:before.revision+1,updatedAt:later});
 const observedReads=reads;assert.ok(observedReads>0,'The real collection IDs must be observed');assert.ok(observedReads<=96*pages.length,`Actual collection lookup must stay linear: ${observedReads} ID reads for ${pages.length} pages`);
 assert.equal(isDeepStrictEqual(result.pages,before.pages),true,'Every page must remain exact');assert.equal(result.objects[0].markdown,'One accepted text change.');assert.equal(isPaperDocument(result),true);verifyPaperCollaboration(result);
});
