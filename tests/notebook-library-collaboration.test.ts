import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyNotebookLibrary,updateNotebookLibrary} from '../src/lib/notebookLibrary.ts';
import {amendNotebookLibrary,mergeNotebookLibrary} from '../src/lib/notebookLibraryCollaboration.ts';
test('A fresh library can merge independent first classifications without dropping favorites or folders',()=>{
 const empty=emptyNotebookLibrary();let a=updateNotebookLibrary(empty,{note:{id:'n',patch:{favorite:true}}}),b=updateNotebookLibrary(empty,{folder:{id:'f',parentId:null,title:'Cours',color:'#4461dc',order:0}});b=updateNotebookLibrary(b,{note:{id:'n',patch:{folderId:'f'}}});a=amendNotebookLibrary(empty,a,'A|year');b=amendNotebookLibrary(empty,b,'A|year');const ab=mergeNotebookLibrary(a,b)!,ba=mergeNotebookLibrary(b,a)!;assert.equal(ab.notes.n.favorite,true);assert.equal(ab.notes.n.folderId,'f');assert.deepEqual(ab.notes,ba.notes);assert.deepEqual(ab.folders,ba.folders);
});
test('Bulk classification changes commit as one revision and invalid batches leave originals unchanged',()=>{
 const empty=emptyNotebookLibrary(),next=updateNotebookLibrary(empty,{notes:[{id:'a',patch:{favorite:true}},{id:'b',patch:{favorite:true}}]});assert.equal(next.revision,1);assert.equal(next.notes.a.favorite,true);assert.equal(next.notes.b.favorite,true);assert.throws(()=>updateNotebookLibrary(empty,{notes:[{id:'a',patch:{favorite:true}},{id:'b',patch:{folderId:'missing'}}]}));assert.deepEqual(empty.notes,{});
});
test('Removing a folder preserves notes and child folders, and cover changes do not reset another property',()=>{
 let lib=updateNotebookLibrary(emptyNotebookLibrary(),{folder:{id:'parent',parentId:null,title:'Parent',color:'#4461dc',order:0}});lib=updateNotebookLibrary(lib,{folder:{id:'child',parentId:'parent',title:'Child',color:'#4461dc',order:1}});lib=updateNotebookLibrary(lib,{note:{id:'a',patch:{folderId:'parent',cover:{color:'#ff0000',pattern:'grid'}}}});const removed=updateNotebookLibrary(lib,{removeFolder:'parent'});assert.equal(removed.notes.a.folderId,null);assert.equal(removed.folders[0].parentId,null);const recolored=updateNotebookLibrary(removed,{note:{id:'a',patch:{cover:{color:'#ffffff'}}}});assert.equal(recolored.notes.a.cover?.pattern,'grid');assert.equal(recolored.notes.a.cover?.color,'#ffffff');assert.throws(()=>updateNotebookLibrary(removed,{removeFolder:'missing'}));
});
