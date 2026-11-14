import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createPaperEditorInputGate} from '../src/lib/paperEditorInputGate.ts';

test('no new edit or IME is admitted after source revocation',()=>{
 const gate=createPaperEditorInputGate(),target={};
 for(const type of ['compositionstart','beforeinput','input','keydown','paste','drop','cut'])assert.equal(gate.admit({type,inputType:'insertText',data:'new',key:'x'},target,false),false);
 assert.equal(gate.pending(),false);
});
test('an accepted IME chain remains owned through source retirement',()=>{
 const gate=createPaperEditorInputGate(),target={};
 assert.equal(gate.admit({type:'compositionstart'},target,true),true);
 assert.equal(gate.admit({type:'compositionupdate',data:'漢'},target,false),true);
 assert.equal(gate.admit({type:'beforeinput',inputType:'insertCompositionText',data:'漢'},target,false),true);
 assert.equal(gate.admit({type:'input',inputType:'insertText',isComposing:true,data:'漢'},target,false),true);
 assert.equal(gate.pending(),true);
 gate.confirmed();assert.equal(gate.pending(),true,'observer confirmation cannot end the ongoing chain');
});
test('another editable target cannot borrow the accepted composition',()=>{
 const gate=createPaperEditorInputGate(),first={},next={};gate.admit({type:'compositionstart'},first,true);
 for(const type of ['compositionupdate','compositionend','beforeinput','input','keydown'])assert.equal(gate.admit({type,inputType:'insertCompositionText',isComposing:true},next,false),false);
 assert.equal(gate.pending(),true);
});
test('ordinary edits and structural commands are blocked during retained IME',()=>{
 const gate=createPaperEditorInputGate(),target={};gate.admit({type:'compositionstart'},target,true);
 for(const inputType of ['insertText','insertParagraph','insertFromPaste','deleteContentBackward','historyUndo'])assert.equal(gate.admit({type:'beforeinput',inputType,data:'unrelated'},target,false),false);
 for(const type of ['paste','drop','cut','click'])assert.equal(gate.admit({type},target,false),false);
 assert.equal(gate.admit({type:'keydown',key:'v',ctrlKey:true,isComposing:true},target,false),false);
 assert.equal(gate.admit({type:'keydown',key:'Enter'},target,false),true);
 assert.equal(gate.admit({type:'keydown',keyCode:229},target,false),true);
});
test('normal end keeps only the final committed data until observer confirmation',()=>{
 const gate=createPaperEditorInputGate(),target={};gate.admit({type:'compositionstart'},target,true);
 assert.equal(gate.admit({type:'compositionend',data:'漢字'},target,false),true);
 assert.equal(gate.pending(),true);
 assert.equal(gate.admit({type:'beforeinput',inputType:'insertText',data:'other'},target,false),false);
 assert.equal(gate.admit({type:'beforeinput',inputType:'insertText',data:'漢字'},target,false),true);
 assert.equal(gate.admit({type:'input',inputType:'insertText',data:'漢字'},target,false),true);
 assert.equal(gate.admit({type:'input',inputType:'insertText',data:'漢字'},target,false),false);
 gate.confirmed();assert.equal(gate.pending(),false);
 assert.equal(gate.admit({type:'beforeinput',inputType:'insertFromComposition',data:'漢字'},target,false),false);
});
test('cancelled or empty composition does not authorize a new insertText',()=>{
 const gate=createPaperEditorInputGate(),target={};gate.admit({type:'compositionstart'},target,true);gate.admit({type:'compositionend',data:''},target,false);
 assert.equal(gate.admit({type:'input',inputType:'insertText',data:'later'},target,false),false);
 gate.confirmed();assert.equal(gate.pending(),false);
});
test('source becomes writable without reviving a confirmed old chain',()=>{
 const gate=createPaperEditorInputGate(),target={};gate.admit({type:'compositionstart'},target,true);gate.admit({type:'compositionend',data:'ok'},target,false);gate.confirmed();
 assert.equal(gate.admit({type:'compositionupdate'},target,false),false);
 assert.equal(gate.admit({type:'compositionstart'},target,true),true);
 assert.equal(gate.admit({type:'compositionstart'},target,true),false);
});
