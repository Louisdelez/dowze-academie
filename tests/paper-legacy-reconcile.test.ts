import test from 'node:test';import assert from 'node:assert/strict';
import {applyPaperCommand,blankPage,isPaperDocument,migratePaper} from '../src/lib/notebookDocument.ts';
import {legacyInlinePhotoIds,mergeLegacyMarkdown,planPaperLegacyReconcile} from '../src/lib/paperLegacyReconcile.ts';
const now='2026-10-13T12:00:00.000Z';
const stroke=(id:string,x=10)=>({id,color:'#1144cc',width:3,points:[{x,y:20,pressure:.3},{x:x+10,y:30,pressure:.7}]});
const board=(...strokes:ReturnType<typeof stroke>[])=>({board:{strokes},photos:[]});
const ids=()=>{let i=0;return ()=>`qa-legacy-${++i}`;};
test('An unchanged old observation does not copy text, ink, attachments, or advance revision',()=>{
 const old=board(stroke('one')),source=migratePaper('qa-legacy','**Original**',old,now),plan=planPaperLegacyReconcile(source,{markdown:'**Original**',board:structuredClone(old),baseline:{markdown:'**Original**',board:old},now,newId:ids()});
 assert.equal(plan.document,source);assert.equal(plan.changed,false);assert.equal(plan.recovered,false);assert.equal(plan.commands.length,0);assert.deepEqual(plan.receipt.board,old);
});
test('A safe old-client text update preserves drawings, file identities, unrelated objects, and original provenance',()=>{
 const old=board(stroke('one')),source=migratePaper('qa-legacy','Old text',old,now),page=blankPage('qa-other-page');
 const current=applyPaperCommand(source,{type:'batch',commands:[{type:'insert-page',page},{type:'upsert-object',object:{...source.objects[0],id:'qa-unrelated',pageId:page.id,markdown:'Independent newer page'}},{type:'add-asset',asset:{id:'qa-immutable',name:'Recording',mediaType:'audio/wav',size:40}}]},now);
 const snapshot=structuredClone(current),plan=planPaperLegacyReconcile(current,{markdown:'New **text**',board:old,baseline:{markdown:'Old text',board:old},now});
 assert.equal(plan.document.objects.find(o=>o.id===source.objects[0].id)?.markdown,'New **text**');assert.equal(plan.document.objects.find(o=>o.id==='qa-unrelated')?.markdown,'Independent newer page');assert.deepEqual(plan.document.assets,current.assets);assert.deepEqual(plan.document.legacy,source.legacy);assert.deepEqual(plan.document.objects.find(o=>o.kind==='ink'),current.objects.find(o=>o.kind==='ink'));assert.equal(plan.document.revision,current.revision+1);assert.deepEqual(current,snapshot);assert.equal(plan.recovered,false);assert.ok(isPaperDocument(plan.document));
});
test('Distinct old/new edits merge in source order including Unicode; overlapping text remains a conflict',()=>{
 assert.equal(mergeLegacyMarkdown('alpha beta gamma','ALPHA beta gamma','alpha beta GAMMA'),'ALPHA beta GAMMA');assert.equal(mergeLegacyMarkdown('🟦 a b 🟩','🟦 A b 🟩','🟦 a B 🟩'),'🟦 A B 🟩');assert.equal(mergeLegacyMarkdown('start end','start NEW end','start OLD end'),null);assert.equal(mergeLegacyMarkdown('text','same','same'),'same');
});
test('Concurrent edits recover the full incoming text once and retain every current text/ink object',()=>{
 const old=board(stroke('one')),source=migratePaper('qa-legacy','Original',old,now),current=applyPaperCommand(source,{type:'patch-object',id:source.objects[0].id,patch:{markdown:'Current **choice**'}},now);
 const plan=planPaperLegacyReconcile(current,{markdown:'Incoming **choice**',board:old,baseline:{markdown:'Original',board:old},now,newId:ids()});assert.equal(plan.recovered,true);assert.equal(plan.document.pages.length,current.pages.length+1);assert.equal(plan.document.objects.find(o=>o.id===source.objects[0].id)?.markdown,'Current **choice**');assert.ok(plan.document.objects.some(o=>o.markdown==='Incoming **choice**'));assert.deepEqual(plan.document.objects.filter(o=>o.kind==='ink'),current.objects.filter(o=>o.kind==='ink'));
 const again=planPaperLegacyReconcile(plan.document,{markdown:'Incoming **choice**',board:old,baseline:{markdown:'Original',board:old},observed:plan.receipt,now,newId:ids()});assert.equal(again.changed,false);assert.equal(again.document,plan.document);
});
test('Missing or partitioned migration roots never overwrite current reorganised text',()=>{
 const source=migratePaper('qa-legacy','Original',null,now),current=applyPaperCommand(source,{type:'patch-object',id:source.objects[0].id,patch:{textPartition:'partition-new',markdown:'First reorganised page'}},now);
 const plan=planPaperLegacyReconcile(current,{markdown:'Incoming update',board:null,baseline:{markdown:'Original',board:null},now,newId:ids()});assert.equal(plan.recovered,true);assert.equal(plan.document.objects.find(o=>o.id===source.objects[0].id)?.markdown,'First reorganised page');assert.equal(plan.document.objects.filter(o=>o.kind==='text').length,2);
});
test('Independent legacy ink additions, updates and deletions respect the latest baseline',()=>{
 const before=board(stroke('one'),stroke('remove')),source=migratePaper('qa-legacy','Text',before,now),incoming=board(stroke('one',30),stroke('new',50));
 const plan=planPaperLegacyReconcile(source,{markdown:'Text',board:incoming,baseline:{markdown:'Text',board:before},now});assert.equal(plan.recovered,false);assert.equal(plan.document.objects.some(o=>o.id==='legacy-ink-remove'),false);assert.equal(plan.document.objects.find(o=>o.id==='legacy-ink-one')?.points?.[0].x,30);assert.equal(plan.document.objects.find(o=>o.id==='legacy-ink-new')?.points?.[0].x,50);assert.deepEqual(plan.document.legacy,source.legacy);
});
test('A moved current stroke survives an old-client erasure or conflicting update',()=>{
 const before=board(stroke('one')),source=migratePaper('qa-legacy','Text',before,now),current=applyPaperCommand(source,{type:'patch-object',id:'legacy-ink-one',patch:{x:90,rotation:45}},now),incoming=board(stroke('one',55));
 const plan=planPaperLegacyReconcile(current,{markdown:'Text',board:incoming,baseline:{markdown:'Text',board:before},now,newId:ids()});assert.equal(plan.recovered,true);assert.deepEqual(plan.document.objects.find(o=>o.id==='legacy-ink-one'),current.objects.find(o=>o.id==='legacy-ink-one'));const recovered=plan.document.objects.find(o=>o.kind==='ink'&&o.id!=='legacy-ink-one');assert.equal(recovered?.points?.[0].x,55);assert.notEqual(recovered?.pageId,source.pages[0].id);
 const erased=planPaperLegacyReconcile(current,{markdown:'Text',board:board(),baseline:{markdown:'Text',board:before},now,newId:ids()});assert.equal(erased.document.objects.find(o=>o.id==='legacy-ink-one')?.x,90);assert.equal(erased.recovered,true);
});
test('Inline images use Markdown semantics: escaped URLs and definitions count, code examples do not',()=>{
 const markdown='![Inline](dowze-photo:note-qa%2Dlegacy/photo%2Done)\n\n![Referenced][picture]\n\n[picture]: dowze-photo:note-qa-legacy/photo-two\n\n`![Example](dowze-photo:note-qa-legacy/photo-code)`';assert.deepEqual([...legacyInlinePhotoIds(markdown)].sort(),['photo-one','photo-two']);
 const empty={board:{strokes:[]},photos:[]},incoming={board:{strokes:[]},photos:[{id:'photo-one',name:'One'},{id:'photo-two',name:'Two'},{id:'photo-code',name:'Code example'}]},source=migratePaper('qa-legacy','',empty,now),plan=planPaperLegacyReconcile(source,{markdown,board:incoming,baseline:{markdown:'',board:empty},now,newId:ids()});assert.equal(plan.document.assets.length,3);assert.deepEqual(plan.document.objects.filter(o=>o.kind==='image').map(o=>o.assetId),['photo-code']);assert.equal(plan.document.objects[0].markdown,markdown);
});
test('Deleted legacy photos never destroy current immutable assets or current photo objects',()=>{
 const old={board:{strokes:[]},photos:[{id:'photo-original',name:'Original',serverId:'server-one'}]},source=migratePaper('qa-legacy','Text',old,now),plan=planPaperLegacyReconcile(source,{markdown:'Text',board:board(),baseline:{markdown:'Text',board:old},now});assert.deepEqual(plan.document.assets,source.assets);assert.deepEqual(plan.document.objects,source.objects);assert.equal(plan.changed,false);assert.deepEqual(plan.receipt.board,board());
});
test('A conflicting immutable photo identity refuses a plan and leaves source untouched',()=>{
 const old={board:{strokes:[]},photos:[{id:'photo-original',name:'Original',serverId:'server-one'}]},source=migratePaper('qa-legacy','Text',old,now),snapshot=structuredClone(source);assert.throws(()=>planPaperLegacyReconcile(source,{markdown:'Update',board:{photos:[{id:'photo-original',serverId:'server-two'}]},baseline:{markdown:'Text',board:old},now}),/identité/);assert.deepEqual(source,snapshot);
});
test('Duplicate old stroke identities retain all incoming strokes independently instead of invalid objects',()=>{
 const source=migratePaper('qa-legacy','Text',null,now),incoming=board(stroke('duplicate',10),stroke('duplicate',60));const plan=planPaperLegacyReconcile(source,{markdown:'Text',board:incoming,baseline:{markdown:'Text',board:null},now,newId:ids()});assert.equal(plan.recovered,true);assert.equal(plan.document.objects.filter(o=>o.kind==='ink').length,2);assert.ok(isPaperDocument(plan.document));assert.deepEqual(plan.receipt.board,incoming);
});
test('A tall old drawing remains inside its recovery page, not clipped below A4',()=>{
 const old=board(stroke('one')),source=migratePaper('qa-legacy','Original',old,now),current=applyPaperCommand(source,{type:'patch-object',id:'legacy-ink-one',patch:{x:30}},now),tall={...stroke('one'),points:[{x:10,y:6400,pressure:.5},{x:20,y:6600,pressure:.7}]},plan=planPaperLegacyReconcile(current,{markdown:'Original',board:board(tall),baseline:{markdown:'Original',board:old},now,newId:ids()});const recovered=plan.document.objects.find(o=>o.kind==='ink'&&o.id!=='legacy-ink-one')!,page=plan.document.pages.find(p=>p.id===recovered.pageId)!;assert.ok(page.height>=6700);assert.equal(recovered.points?.at(-1)?.y,6600);assert.equal(plan.document.objects.find(o=>o.id==='legacy-ink-one')?.x,30);
});
test('Several new floating photographs are laid out separately without overlapping retained photographs',()=>{
 const old={photos:[{id:'old',name:'Old'}]},source=migratePaper('qa-legacy','Text',old,now),plan=planPaperLegacyReconcile(source,{markdown:'Text',board:{photos:[{id:'old',name:'Old'},{id:'one',name:'One'},{id:'two',name:'Two'},{id:'three',name:'Three'}]},baseline:{markdown:'Text',board:old},now,newId:ids()});const images=plan.document.objects.filter(o=>o.kind==='image').sort((a,b)=>a.y-b.y);for(let i=1;i<images.length;i++)assert.ok(images[i].y>=images[i-1].y+images[i-1].height);assert.ok(plan.document.pages[0].height>=images.at(-1)!.y+images.at(-1)!.height);assert.deepEqual(plan.document.assets.find(a=>a.id==='old'),source.assets[0]);
});
test('A locked current text is retained even if its content still equals the old baseline',()=>{
 const source=migratePaper('qa-legacy','Original',null,now),current=applyPaperCommand(source,{type:'patch-object',id:source.objects[0].id,patch:{locked:true}},now),plan=planPaperLegacyReconcile(current,{markdown:'Update',board:null,baseline:{markdown:'Original',board:null},now,newId:ids()});assert.equal(plan.recovered,true);assert.equal(plan.document.objects[0].markdown,'Original');assert.equal(plan.document.objects[0].locked,true);
});
test('A failed new-identity allocator cannot replace an existing user object or page',()=>{
 const source=migratePaper('qa-legacy','Original',null,now),current=applyPaperCommand(source,{type:'patch-object',id:source.objects[0].id,patch:{markdown:'Current'}},now),snapshot=structuredClone(current);assert.throws(()=>planPaperLegacyReconcile(current,{markdown:'Incoming',board:null,baseline:{markdown:'Original',board:null},now,newId:()=>source.objects[0].id}),/identité indépendante/);assert.deepEqual(current,snapshot);
});
test('Current ink size and layer changes are never reverted by a stale legacy edit',()=>{
 const old=board(stroke('one')),source=migratePaper('qa-legacy','Text',old,now),current=applyPaperCommand(source,{type:'patch-object',id:'legacy-ink-one',patch:{width:480,z:200}},now),plan=planPaperLegacyReconcile(current,{markdown:'Text',board:board(stroke('one',60)),baseline:{markdown:'Text',board:old},now,newId:ids()});assert.equal(plan.recovered,true);assert.deepEqual(plan.document.objects.find(o=>o.id==='legacy-ink-one'),current.objects.find(o=>o.id==='legacy-ink-one'));
});
test('A new old-client photo can reuse retained bytes, while unchanged old photos do not resurrect removed image objects',()=>{
 const old={photos:[{id:'retained',name:'Photo',serverId:'server-original'}]},source=migratePaper('qa-legacy','Text',old,now),current=applyPaperCommand(source,{type:'remove-objects',ids:source.objects.filter(o=>o.kind==='image').map(o=>o.id)},now);
 const unchanged=planPaperLegacyReconcile(current,{markdown:'Text',board:old,baseline:{markdown:'Text',board:old},now,newId:ids()});assert.equal(unchanged.changed,false);
 const introduced=planPaperLegacyReconcile(current,{markdown:'Text',board:old,baseline:{markdown:'Text',board:board()},now,newId:ids()});assert.equal(introduced.document.assets.length,1);assert.equal(introduced.document.objects.filter(o=>o.kind==='image').length,1);assert.equal(introduced.document.objects.find(o=>o.kind==='image')?.assetId,'retained');assert.deepEqual(introduced.document.assets[0],source.assets[0]);
});
