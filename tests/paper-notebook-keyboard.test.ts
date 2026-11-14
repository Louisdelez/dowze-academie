import test from 'node:test';
import assert from 'node:assert/strict';
import {paperNotebookShortcut,PAPER_NOTEBOOK_SHORTCUTS} from '../src/lib/paperNotebookKeyboard.ts';
const surface={editing:false,modal:false,surface:true,composing:false};
test('Ctrl/Cmd route the same supported actions; letters use the logical keyboard layout and never add destructive commands',()=>{
 for(const modifier of [{ctrlKey:true},{metaKey:true}]){
  for(const [key,action] of [['f','search'],['p','print'],['z','undo']] as const)assert.equal(paperNotebookShortcut({key,...modifier},surface),action);
  assert.equal(paperNotebookShortcut({key:'Z',shiftKey:true,...modifier},surface),'redo');
  assert.equal(paperNotebookShortcut({key:'F',shiftKey:true,...modifier},surface),'focus');
  for(const key of ['n','w','Delete','Backspace','s'])assert.equal(paperNotebookShortcut({key,...modifier},surface),null);
 }
 assert.equal(paperNotebookShortcut({key:'y',ctrlKey:true},surface),'redo');assert.equal(paperNotebookShortcut({key:'y',metaKey:true},surface),null);
 assert.equal(paperNotebookShortcut({key:'PageDown',altKey:true},surface),'next-page');assert.equal(paperNotebookShortcut({key:'PageUp',altKey:true},surface),'previous-page');
 assert.equal(paperNotebookShortcut({key:'ArrowLeft',altKey:true},surface),null);
 assert.equal(paperNotebookShortcut({key:'?'},surface),'help');assert.equal(paperNotebookShortcut({key:'Escape'},surface),'escape');
 for(const [key,action] of [['t','tool-text'],['p','tool-pen'],['h','tool-highlighter'],['e','tool-eraser'],['v','tool-select']] as const){assert.equal(paperNotebookShortcut({key},surface),action);assert.equal(paperNotebookShortcut({key},{...surface,surface:false}),null);}
 assert.equal(paperNotebookShortcut({key:'é'},surface),null);assert.equal(paperNotebookShortcut({key:'p',shiftKey:true},surface),null);
});
test('editable fields, dialogs, accepted composition, AltGraph and already handled keys keep every shortcut untouched',()=>{
 const keys=[{key:'f',ctrlKey:true},{key:'p',metaKey:true},{key:'z',ctrlKey:true},{key:'F',ctrlKey:true,shiftKey:true},{key:'?'},{key:'Escape'},{key:'PageDown',altKey:true},{key:'e'}];
 for(const key of keys){
  for(const flag of ['editing','modal','composing'] as const)assert.equal(paperNotebookShortcut(key,{...surface,[flag]:true}),null);
  for(const change of [{isComposing:true},{keyCode:229},{altGraph:true},{defaultPrevented:true},{repeat:true}])assert.equal(paperNotebookShortcut({...key,...change},surface),null);
 }
 assert.equal(paperNotebookShortcut({key:'f',ctrlKey:true,metaKey:true},surface),null);assert.equal(paperNotebookShortcut({key:'f',ctrlKey:true,altKey:true},surface),null);
});
test('the published help is immutable and describes only actions the resolver can actually emit',()=>{
 assert.equal(Object.isFrozen(PAPER_NOTEBOOK_SHORTCUTS),true);
 assert.equal(new Set(PAPER_NOTEBOOK_SHORTCUTS.map(value=>value.action)).size,PAPER_NOTEBOOK_SHORTCUTS.length);
 for(const row of PAPER_NOTEBOOK_SHORTCUTS){assert.equal(Object.isFrozen(row),true);assert.ok(row.keys.trim()&&row.label.trim());}
 assert.equal(PAPER_NOTEBOOK_SHORTCUTS.some(row=>/delete|new-note|close-note/.test(row.action)),false);
});
