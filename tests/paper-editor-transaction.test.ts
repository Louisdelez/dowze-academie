import test from 'node:test';
import assert from 'node:assert/strict';
import {Schema} from '@milkdown/kit/prose/model';
import {EditorState,TextSelection} from '@milkdown/kit/prose/state';
import {remotePaperEditorTransaction} from '../src/lib/paperEditorTransaction.ts';
const schema=new Schema({nodes:{doc:{content:'paragraph+'},paragraph:{content:'text*',group:'block'},text:{group:'inline'}},marks:{strong:{}}});
const paragraph=(s:string)=>schema.node('paragraph',null,s?schema.text(s):undefined),doc=(...s:string[])=>schema.node('doc',null,s.map(paragraph));
test('An insertion before the caret maps its position, preserves selection direction and does not enter local undo',()=>{
 const before=doc('Début. Milieu. Fin.'),state=EditorState.create({schema,doc:before,selection:TextSelection.create(before,12,9)}),next=doc('Ajout. Début. Milieu. Fin.'),tr=remotePaperEditorTransaction(state,next)!;assert.ok(tr.doc.eq(next));assert.equal(tr.selection.anchor,19);assert.equal(tr.selection.head,16);assert.equal(tr.getMeta('addToHistory'),false);assert.equal(tr.steps.length,1);
});
test('Appended remote paragraphs leave a caret in an existing paragraph in place; no-op creates no transaction',()=>{
 const before=doc('Un texte 😀 conservé.'),state=EditorState.create({schema,doc:before,selection:TextSelection.create(before,8)}),next=doc('Un texte 😀 conservé.','Ajout distant.');const tr=remotePaperEditorTransaction(state,next)!;assert.equal(tr.selection.from,8);assert.ok(tr.doc.eq(next));assert.equal(remotePaperEditorTransaction(state,before),null);
});
test('Applying formatting without changing text keeps the exact in-text selection',()=>{
 const before=doc('Texte conservé.'),state=EditorState.create({schema,doc:before,selection:TextSelection.create(before,3,8)}),next=schema.node('doc',null,[schema.node('paragraph',null,schema.text('Texte conservé.',[schema.mark('strong')]))]);const tr=remotePaperEditorTransaction(state,next)!;assert.ok(tr.doc.eq(next));assert.equal(tr.selection.anchor,3);assert.equal(tr.selection.head,8);
});
