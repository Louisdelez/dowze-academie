import test from 'node:test';
import assert from 'node:assert/strict';
import {migratePaper,applyPaperCommand,isPaperDocument,type PaperDocument} from '../src/lib/notebookDocument.ts';
import {reflowPaperText,textFlowFingerprint} from '../src/lib/paperTextFlow.ts';
import {amendPaperCollaboration,mergePaperCollaboration,mergePaperTextChange,verifyPaperCollaboration} from '../src/lib/paperCollaboration.ts';

const markdown='**First paragraph.**\n\nSecond paragraph with [a link](https://example.com).';
function seed(){
 let plain=migratePaper('partition-review',markdown,null),root=plain.objects[0];
 plain=applyPaperCommand(plain,{type:'add-asset',asset:{id:'kept-image',name:'Original image',mediaType:'image/png',size:17}});
 plain=applyPaperCommand(plain,reflowPaperText(plain,root.id,textFlowFingerprint(root.markdown!,root.width,root.height),[0,900,1800],[0,22,markdown.length])!);
 return amendPaperCollaboration(plain,plain);
}
function partition(before:PaperDocument,generation='partition-A'){
 const root=before.objects[0],second=before.pages[1];
 const changed=applyPaperCommand(before,{type:'batch',commands:[
  {type:'patch-object',id:root.id,patch:{markdown:'**First paragraph.**',textFlow:undefined,textPartition:generation}},
  {type:'update-page',page:{...second,flowRootId:undefined}},
  {type:'upsert-object',object:{...root,id:`fragment-${generation}`,pageId:second.id,markdown:'Second paragraph with [a link](https://example.com).',textFlow:undefined,textPartition:`${generation}-second`}},
 ]});
 return amendPaperCollaboration(before,changed);
}
function edit(before:PaperDocument,value:string){return amendPaperCollaboration(before,applyPaperCommand(before,{type:'patch-object',id:before.objects[0].id,patch:{markdown:value}}));}

test('Buffered full-source edit after partition is recovered intact and cannot land on a truncated first page',()=>{
 const before=seed(),current=partition(before),original=structuredClone(current),typed=markdown+' An edit on the last page.';
 const result=mergePaperTextChange(current,before,before.objects[0].id,typed);
 assert.equal(result.recovered,true);assert.equal(result.document.objects.find(o=>o.id===before.objects[0].id)!.markdown,'**First paragraph.**');
 assert.equal(result.document.objects.find(o=>o.id==='fragment-partition-A')!.markdown,'Second paragraph with [a link](https://example.com).');
 const recovered=result.document.objects.find(o=>o.id===result.objectId)!;
 assert.equal(recovered.markdown,typed);assert.notEqual(recovered.id,before.objects[0].id);assert.equal(recovered.textFlow,undefined);assert.equal(recovered.textPartition,undefined);
 assert.equal(result.document.pages.find(p=>p.id===result.pageId)!.flowRootId,undefined);assert.deepEqual(result.document.assets,before.assets);assert.ok(isPaperDocument(result.document));verifyPaperCollaboration(result.document);assert.deepEqual(current,original);
});

test('Remote full-source Y.Text and a partition remain explicit separate versions in both merge directions',()=>{
 const before=seed(),current=partition(before),remote=edit(before,markdown+' Remote sentence.'),saved=structuredClone([current,remote]);
 assert.equal(mergePaperCollaboration(current,remote),null);assert.equal(mergePaperCollaboration(remote,current),null);assert.deepEqual([current,remote],saved);
});

test('Independent concurrent partitions cannot combine duplicate fragment creations',()=>{
 const before=seed(),a=partition(before,'partition-A'),b=partition(before,'partition-B');
 assert.equal(mergePaperCollaboration(a,b),null);assert.equal(mergePaperCollaboration(b,a),null);verifyPaperCollaboration(a);verifyPaperCollaboration(b);
});

test('Ordinary independent edits within the same partition still merge without losing either sentence',()=>{
 const current=partition(seed()),root=current.objects[0],a=edit(current,'Local. '+root.markdown),b=edit(current,root.markdown+' Remote.');
 const merged=mergePaperCollaboration(a,b)!;assert.ok(merged);assert.equal(merged.objects.find(o=>o.id===root.id)!.markdown,'Local. **First paragraph.** Remote.');
 const buffered=mergePaperTextChange(b,current,root.id,'Buffered. '+root.markdown);assert.equal(buffered.recovered,false);assert.equal(buffered.document.objects.find(o=>o.id===root.id)!.markdown,'Buffered. **First paragraph.** Remote.');verifyPaperCollaboration(buffered.document);
});

test('Undo to the unpartitioned generation and redo do not merge stale partition edits into restored text',()=>{
 const before=seed(),split=partition(before),undone=amendPaperCollaboration(split,applyPaperCommand(split,{type:'restore',document:before})),redone=amendPaperCollaboration(undone,applyPaperCommand(undone,{type:'restore',document:split}));
 assert.equal(undone.objects[0].textPartition,undefined);assert.equal(redone.objects[0].textPartition,'partition-A');
 assert.equal(mergePaperCollaboration(undone,split),null);assert.equal(mergePaperCollaboration(redone,undone),null);
 const staleSplit=mergePaperTextChange(undone,split,split.objects[0].id,'First page edited while undo was happening.');assert.equal(staleSplit.recovered,true);assert.equal(staleSplit.document.objects.find(o=>o.id===before.objects[0].id)!.markdown,markdown);
 const staleRestored=mergePaperTextChange(redone,undone,before.objects[0].id,markdown+' Buffered before redo.');assert.equal(staleRestored.recovered,true);verifyPaperCollaboration(staleRestored.document);
});

test('Retaining root ID on another surviving page cannot merge an old full-source editor into that page',()=>{
 const before=seed(),root=before.objects[0],survivor=before.pages[1];
 const moved=amendPaperCollaboration(before,applyPaperCommand(before,{type:'batch',commands:[
  {type:'upsert-object',object:{...root,pageId:survivor.id,markdown:'Second paragraph.',textFlow:undefined,textPartition:'after-first-page-delete'}},
  {type:'update-page',page:{...survivor,flowRootId:undefined}},
  {type:'remove-page',id:before.pages[0].id},
 ]}));
 const result=mergePaperTextChange(moved,before,root.id,markdown+' Buffered last-page change.');assert.equal(result.recovered,true);assert.equal(result.document.objects.find(o=>o.id===root.id)!.pageId,survivor.id);assert.equal(result.document.objects.find(o=>o.id===root.id)!.markdown,'Second paragraph.');assert.ok(isPaperDocument(result.document));
});

test('Recovery after removal of a multi-page root discards old flow references and restores missing immutable asset manifests',()=>{
 const before=seed(),root=before.objects[0];
 const plain=applyPaperCommand(before,{type:'batch',commands:[{type:'patch-object',id:root.id,patch:{textFlow:undefined}},{type:'remove-page',id:before.pages[0].id},{type:'update-page',page:{...before.pages[1],flowRootId:undefined}}]});
 const withoutAssets=applyPaperCommand(plain,{type:'restore',document:{...plain,assets:[]}}),current=amendPaperCollaboration(before,withoutAssets);
 const result=mergePaperTextChange(current,before,root.id,markdown+' Recovered.');assert.equal(result.recovered,true);assert.equal(result.document.objects.find(o=>o.id===result.objectId)!.textFlow,undefined);assert.deepEqual(result.document.assets,before.assets);assert.ok(isPaperDocument(result.document));verifyPaperCollaboration(result.document);
});

test('A different note cannot enter the recovery path or merge through partition markers',()=>{
 const before=seed(),current=partition(before),otherPlain=migratePaper('another-note','Private unrelated note.',null),other=amendPaperCollaboration(otherPlain,otherPlain),saved=structuredClone(current);
 assert.throws(()=>mergePaperTextChange(current,other,current.objects[0].id,'Unrelated content'),/autre note/);assert.equal(mergePaperCollaboration(current,other),null);assert.deepEqual(current,saved);
});

test('A structural conflict elsewhere in the baseline cannot fall through to replacement of remotely edited text',()=>{
 const initial=seed(),extra={...initial.objects[0],id:'independent-root',markdown:'Independent text.',textFlow:undefined},before=amendPaperCollaboration(initial,applyPaperCommand(initial,{type:'upsert-object',object:extra}));
 const split=partition(before),current=amendPaperCollaboration(split,applyPaperCommand(split,{type:'patch-object',id:extra.id,patch:{markdown:'Independent text. Remote addition.'}}));
 const result=mergePaperTextChange(current,before,extra.id,'Local addition. Independent text.');assert.equal(result.recovered,true);
 assert.equal(result.document.objects.find(o=>o.id===extra.id)!.markdown,'Independent text. Remote addition.');assert.equal(result.document.objects.find(o=>o.id===result.objectId)!.markdown,'Local addition. Independent text.');verifyPaperCollaboration(result.document);
});
