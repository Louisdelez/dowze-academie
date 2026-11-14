import test from 'node:test';
import assert from 'node:assert/strict';
import {migratePaper,applyPaperCommand,isPaperDocument} from '../src/lib/notebookDocument.ts';
import {suggestClozeCards,sourceIsCurrent,reviewStudyCard,importStudyRows,summaryExcerpts,initialSchedule} from '../src/lib/paperStudy.ts';
test('Cloze proposals quote real French note content and are stable across repeated generation',()=>{
 const doc=migratePaper('study','La conservation de l’énergie décrit une quantité qui reste constante dans un système isolé.',null);const cards=suggestClozeCards(doc);assert.equal(cards.length,1);assert.equal(cards[0].answer,'conservation');assert.equal(cards[0].question,'La _____ de l’énergie décrit une quantité qui reste constante dans un système isolé.');assert.deepEqual(suggestClozeCards(doc).map(c=>c.id),cards.map(c=>c.id));assert.ok(sourceIsCurrent(doc,cards[0].source!));const changed=applyPaperCommand(doc,{type:'patch-object',id:doc.objects[0].id,patch:{markdown:'Texte corrigé'}});assert.equal(sourceIsCurrent(changed,cards[0].source!),false);
});
test('Cards retain review progress, review idempotency and the SM-2 first intervals',()=>{
 const c={id:'q',kind:'basic' as const,question:'Question',answer:'Réponse',createdAt:'2026-10-12T12:00:00Z',reviews:[],schedule:initialSchedule('2026-10-12T12:00:00Z')};const one=reviewStudyCard(c,4,'r1','2026-10-12T12:00:00Z');assert.equal(one.schedule.intervalDays,1);assert.equal(one.schedule.ease,2.5);assert.deepEqual(reviewStudyCard(one,1,'r1'),one);const two=reviewStudyCard(one,4,'r2','2026-10-13T12:00:00Z');assert.equal(two.schedule.intervalDays,6);const three=reviewStudyCard(two,4,'r3','2026-10-19T12:00:00Z');assert.equal(three.schedule.intervalDays,15);assert.equal(reviewStudyCard(three,1,'r4').schedule.repetitions,0);
});
test('CSV quoting preserves commas, quotes and multiline cards; malformed lines are reported',()=>{
 const result=importStudyRows('question,answer\n"Force, énergie","Réponse ""exacte"""\n"Deux\nlignes","Texte"\nSans réponse\n');assert.equal(result.cards.length,2);assert.equal(result.rejected,1);assert.equal(result.cards[0].question,'Force, énergie');assert.equal(result.cards[0].answer,'Réponse "exacte"');assert.equal(result.cards[1].question,'Deux\nlignes');assert.throws(()=>importStudyRows('"Citation non fermée,réponse'));assert.equal(importStudyRows('recto\tverso\nA\tB').cards.length,1);
});
test('Study commands share the document history and malformed schedules never enter the note',()=>{
 const doc=migratePaper('study','Un contenu exact pour préparer des fiches de révision personnelles.',null);const card=suggestClozeCards(doc)[0];const saved=applyPaperCommand(doc,{type:'study-card',card});assert.ok(isPaperDocument(saved));const reviewed=applyPaperCommand(saved,{type:'review-card',id:card.id,quality:4,reviewId:'unique'});assert.equal(reviewed.study?.cards[0].reviews.length,1);assert.throws(()=>applyPaperCommand(doc,{type:'study-card',card:{...card,schedule:{...card.schedule,ease:0}}}));const excerpts=summaryExcerpts(doc);assert.equal(excerpts[0].source.quote,doc.objects[0].markdown);assert.equal(excerpts[0].text,doc.objects[0].markdown);
});
