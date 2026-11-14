import test from 'node:test';
import assert from 'node:assert/strict';
import {migratePaper,applyPaperCommand,blankPage} from '../src/lib/notebookDocument.ts';
import {amendPaperCollaboration,mergePaperCollaboration,forgetPaperCollaboration} from '../src/lib/paperCollaboration.ts';
import {initialSchedule} from '../src/lib/paperStudy.ts';
const edit=(d:ReturnType<typeof migratePaper>,markdown:string)=>applyPaperCommand(d,{type:'patch-object',id:d.objects[0].id,patch:{markdown}});
test('Two independent edits to the same text converge without losing either phrase',()=>{
 const plain=migratePaper('shared','Début. Milieu. Fin.',null),seed=amendPaperCollaboration(plain,plain);const a=amendPaperCollaboration(seed,edit(seed,'Ajout A. Début. Milieu. Fin.')),b=amendPaperCollaboration(seed,edit(seed,'Début. Milieu. Fin. Ajout B.'));
 const ab=mergePaperCollaboration(a,b)!,ba=mergePaperCollaboration(b,a)!;assert.equal(ab.objects[0].markdown,'Ajout A. Début. Milieu. Fin. Ajout B.');assert.deepEqual(ab.objects,ba.objects);assert.equal(ab.collaboration!.state,ba.collaboration!.state);assert.deepEqual(mergePaperCollaboration(ab,ab)!.objects,ab.objects);
});
test('Concurrent changes to different properties and inserted objects keep pages and identities intact',()=>{
 const plain=migratePaper('props','texte',null),seed=amendPaperCollaboration(plain,plain),object=seed.objects[0];const a=amendPaperCollaboration(seed,applyPaperCommand(seed,{type:'patch-object',id:object.id,patch:{x:200}})),b=amendPaperCollaboration(seed,edit(seed,'Texte corrigé'));
 const merged=mergePaperCollaboration(a,b)!;assert.equal(merged.objects[0].x,200);assert.equal(merged.objects[0].markdown,'Texte corrigé');const page=blankPage('second'),c=amendPaperCollaboration(seed,applyPaperCommand(seed,{type:'insert-page',page}));assert.equal(mergePaperCollaboration(merged,c)!.pages.length,2);
});
test('Concurrent reviews retain distinct events and derive one consistent schedule',()=>{
 const plain=migratePaper('cards','texte',null),card={id:'card',kind:'basic' as const,question:'Q',answer:'A',schedule:initialSchedule('2026-10-12T00:00:00Z'),reviews:[],createdAt:'2026-10-12T00:00:00Z'},withCard=applyPaperCommand(plain,{type:'study-card',card}),seed=amendPaperCollaboration(withCard,withCard);
 const a=amendPaperCollaboration(seed,applyPaperCommand(seed,{type:'review-card',id:'card',quality:4,reviewId:'A'},'2026-10-12T10:00:00Z')),b=amendPaperCollaboration(seed,applyPaperCommand(seed,{type:'review-card',id:'card',quality:5,reviewId:'B'},'2026-10-12T10:01:00Z'));
 const ab=mergePaperCollaboration(a,b)!,ba=mergePaperCollaboration(b,a)!;assert.deepEqual(ab.study,ba.study);assert.deepEqual(ab.study!.cards[0].reviews.map(r=>r.id),['A','B']);assert.equal(ab.study!.cards[0].schedule.repetitions,2);
});
test('Invalid histories and separate lineages never overwrite an original',()=>{
 const plain=migratePaper('bounds','texte',null),seed=amendPaperCollaboration(plain,plain),other=amendPaperCollaboration(plain,plain);assert.equal(mergePaperCollaboration(seed,other),null);assert.throws(()=>amendPaperCollaboration({...seed,objects:seed.objects.map(o=>({...o,markdown:'different'}))},seed));assert.throws(()=>mergePaperCollaboration(seed,{...seed,collaboration:{...seed.collaboration!,state:'invalid'}}));
 const next=amendPaperCollaboration(seed,edit(seed,'modifié'),'qa-cache');assert.equal(amendPaperCollaboration(next,edit(next,'encore'),'qa-cache').objects[0].markdown,'encore');forgetPaperCollaboration('qa-cache');
});

test('Buffered editor text is applied against its own baseline and cannot delete a newer remote phrase',async()=>{
 const {mergePaperTextChange}=await import('../src/lib/paperCollaboration.ts');const plain=migratePaper('buffered','Début.',null),seed=amendPaperCollaboration(plain,plain),remote=amendPaperCollaboration(seed,edit(seed,'Début. Ajout distant.'));
 const result=mergePaperTextChange(remote,seed,seed.objects[0].id,'Ajout local. Début.');assert.equal(result.document.objects[0].markdown,'Ajout local. Début. Ajout distant.');assert.equal(result.recovered,false);
});
test('Typing buffered before a page was removed is recovered on a new page, not silently discarded',async()=>{
 const {mergePaperTextChange}=await import('../src/lib/paperCollaboration.ts');const plain=migratePaper('deleted','Original.',null),seed=amendPaperCollaboration(plain,plain),withPage=amendPaperCollaboration(seed,applyPaperCommand(seed,{type:'insert-page',page:blankPage('keep')}));const remote=amendPaperCollaboration(withPage,applyPaperCommand(withPage,{type:'remove-page',id:seed.pages[0].id}));
 const result=mergePaperTextChange(remote,withPage,seed.objects[0].id,'Texte à récupérer.');assert.equal(result.recovered,true);assert.equal(result.document.pages.length,2);assert.equal(result.document.objects.find(o=>o.id===result.objectId)!.markdown,'Texte à récupérer.');assert.equal(remote.pages.length,1);
});

test('Repeated typing before the merged remote text is rendered cannot delete the remote phrase or duplicate earlier typing',async()=>{
 const {mergePaperTextChange}=await import('../src/lib/paperCollaboration.ts');const plain=migratePaper('repeat','Début.',null),seed=amendPaperCollaboration(plain,plain),remote=amendPaperCollaboration(seed,edit(seed,'Début. Ajout distant.'));const one=mergePaperTextChange(remote,seed,seed.objects[0].id,'Ajout local. Début.');assert.equal(one.editorBaseline.objects[0].markdown,'Ajout local. Début.');const two=mergePaperTextChange(one.document,one.editorBaseline,seed.objects[0].id,'Ajout local. Début. Suite locale.');const text=two.document.objects[0].markdown!;assert.ok(text.startsWith('Ajout local. Début.'));for(const phrase of ['Ajout local.','Ajout distant.','Suite locale.'])assert.equal(text.split(phrase).length-1,1);assert.equal(mergePaperCollaboration(two.document,remote)!.objects[0].markdown,text);
});
