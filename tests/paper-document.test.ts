import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB} from 'fake-indexeddb';
import {applyPaperCommand,blankPage,eraseInk,isPaperDocument,migratePaper,notebookDocumentId,emptyPaperHistory,recordPaperHistory,travelPaperHistory} from '../src/lib/notebookDocument.ts';
import {getDraft,savePaperDraft,listSnapshots,putDraft} from '../pwa/src/storage.ts';
import {noteBoardId,photoReference,parsePhotoReference} from '../src/lib/notebook.ts';
globalThis.indexedDB=indexedDB;
const old={board:{strokes:[{id:'original',color:'#1144cc',width:3,points:[{x:40,y:400,pressure:.2},{x:700,y:400,pressure:.8}]}]},photos:[{id:'photo-original',name:'Photo',serverId:'server-image'}]};
test('Migration preserves Markdown, ink coordinates, photos and untouched source',()=>{
 const markdown='**Exact**\n\n|a|b|\n|--|--|';const snapshot=structuredClone(old);const d=migratePaper('original',markdown,old,'2026-10-12T00:00:00Z');assert.ok(isPaperDocument(d));assert.equal(d.legacy.markdown,markdown);assert.equal(d.objects[0].markdown,markdown);assert.deepEqual(d.objects.find(o=>o.kind==='ink')?.points?.map(p=>({x:p.x,y:p.y,pressure:p.pressure})),old.board.strokes[0].points);assert.equal(d.assets[0].serverId,'server-image');assert.deepEqual(old,snapshot);assert.notEqual(notebookDocumentId('original'),d.legacy.boardId);
});
test('Reject dangling pages/assets, invalid pressure and future schemas; no silent reset',()=>{
 const d=migratePaper('a','text',old);assert.equal(isPaperDocument({...d,notebookSchema:4}),false);assert.equal(isPaperDocument({...d,pages:[]}),false);assert.equal(isPaperDocument({...d,assets:[]}),false);assert.equal(isPaperDocument({...d,objects:d.objects.map(o=>({...o,pageId:'missing'}))}),false);const ink=d.objects.find(o=>o.kind==='ink')!;assert.equal(isPaperDocument({...d,objects:[{...ink,points:[{x:0,y:0,time:1,pressure:1.1}]}]}),false);
});
test('Page commands cannot delete final page or orphan ink; reorder requires permutation',()=>{
 const d=migratePaper('a','text',old);assert.throws(()=>applyPaperCommand(d,{type:'remove-page',id:d.pages[0].id}));const page=blankPage('second');const added=applyPaperCommand(d,{type:'insert-page',page});const moved=applyPaperCommand(added,{type:'reorder-pages',ids:['second',d.pages[0].id]});assert.equal(moved.pages[0].id,'second');assert.throws(()=>applyPaperCommand(added,{type:'reorder-pages',ids:['second','second']}));assert.ok(isPaperDocument(applyPaperCommand(added,{type:'remove-page',id:d.pages[0].id})));
});
test('Partial eraser cuts sparse segment; whole eraser removes all and locked ink survives',()=>{
 const ink=migratePaper('a','',old).objects.find(o=>o.kind==='ink')!;const from={x:300,y:350},to={x:300,y:450};const parts=eraseInk(ink,from,to,10,false);assert.equal(parts.length,2);assert.ok(parts.every(o=>o.points!.every(p=>Math.abs(p.x-300)>10)));assert.deepEqual(eraseInk(ink,from,to,10,true),[]);assert.deepEqual(eraseInk({...ink,locked:true},from,to,10,true),[{...ink,locked:true}]);
});
test('Unified undo restores text and page edits but advances durable revision',()=>{
 const d=migratePaper('a','old',null);const next=applyPaperCommand(d,{type:'batch',commands:[{type:'insert-page',page:blankPage('second')},{type:'upsert-object',object:{...d.objects[0],markdown:'new'}}]});const undo=travelPaperHistory(recordPaperHistory(emptyPaperHistory(),d),next,'undo')!;assert.equal(undo.document.pages.length,1);assert.equal(undo.document.objects[0].markdown,'old');assert.ok(undo.document.revision>next.revision);const redo=travelPaperHistory(undo.history,undo.document,'redo')!;assert.equal(redo.document.pages.length,2);assert.equal(redo.document.objects[0].markdown,'new');
});
test('Atomic migration, bounded snapshots, compare-and-swap and conflict refusal',async()=>{
 const content=migratePaper('storage','old',old);const draft={accountId:'paper-test',spaceId:'2026',documentId:notebookDocumentId('storage'),type:'whiteboard' as const,title:'QA',content,baseVersion:0,updatedAt:1,syncState:'local' as const};
 await savePaperDraft(draft,null,{original:old});assert.equal((await listSnapshots(draft.accountId,draft.spaceId)).length,1);await assert.rejects(()=>savePaperDraft(draft,null));let d=content;
 for(let i=0;i<25;i++){const next=applyPaperCommand(d,{type:'upsert-object',object:{...d.objects[0],markdown:String(i)}});await savePaperDraft({...draft,content:next},d.revision);d=next;}
 assert.equal((await listSnapshots(draft.accountId,draft.spaceId)).filter(s=>s.key.startsWith('paper-history')).length,20);await assert.rejects(()=>savePaperDraft({...draft,content},0));assert.equal(((await getDraft(draft))?.content as {revision:number}).revision,25);await putDraft({...draft,content:d,baseVersion:12,syncState:'conflict'});await assert.rejects(()=>savePaperDraft({...draft,content:d},25));assert.equal((await getDraft(draft))?.baseVersion,12);
});
test('Text updates cannot revert a moved or locked object from a stale editor callback',()=>{
 const d=migratePaper('patch','old',null),o=d.objects[0];const moved=applyPaperCommand(d,{type:'patch-object',id:o.id,patch:{x:250,locked:true}});const text=applyPaperCommand(moved,{type:'patch-object',id:o.id,patch:{markdown:'new'}});assert.equal(text.objects[0].x,250);assert.equal(text.objects[0].locked,true);
});
test('Folders allow six levels, forbid cycles/unknown parents, and retain recoverable trash',async()=>{
 const {emptyNotebookLibrary,updateNotebookLibrary,isNotebookLibrary}=await import('../src/lib/notebookLibrary.ts');let lib=emptyNotebookLibrary();
 for(let i=0;i<6;i++)lib=updateNotebookLibrary(lib,{folder:{id:'f'+i,title:'Dossier '+i,color:'#4461dc',parentId:i?'f'+(i-1):null,order:i}});
 assert.ok(isNotebookLibrary(lib));assert.throws(()=>updateNotebookLibrary(lib,{folder:{id:'too-deep',title:'Non',color:'#4461dc',parentId:'f5',order:6}}));assert.throws(()=>updateNotebookLibrary(lib,{folder:{...lib.folders[0],parentId:'f5'}}));
 lib=updateNotebookLibrary(lib,{note:{id:'original',patch:{folderId:'f5',favorite:true,deletedAt:'2026-10-12T12:00:00Z'}}});const restored=updateNotebookLibrary(lib,{note:{id:'original',patch:{deletedAt:null}}});assert.equal(restored.notes.original.folderId,'f5');assert.equal(restored.notes.original.favorite,true);assert.equal(restored.notes.original.deletedAt,null);
});
test('Failed multi-object transaction changes neither document nor revision',()=>{
 const d=migratePaper('atomic','old',null),snapshot=structuredClone(d);assert.throws(()=>applyPaperCommand(d,{type:'batch',commands:[{type:'patch-object',id:d.objects[0].id,patch:{markdown:'not committed'}},{type:'upsert-object',object:{...d.objects[0],id:'orphan',pageId:'missing'}}]}));assert.deepEqual(d,snapshot);
});
test('Restoring a prior version is undoable and does not rewind its durable revision',()=>{
 const d=migratePaper('versions','old',null);const edited=applyPaperCommand(d,{type:'patch-object',id:d.objects[0].id,patch:{markdown:'new'}});const restored=applyPaperCommand(edited,{type:'restore',document:d});assert.equal(restored.objects[0].markdown,'old');assert.equal(restored.revision,2);assert.throws(()=>applyPaperCommand(edited,{type:'restore',document:migratePaper('other','',null)}));
});
test('Audio chunks and recovery journal commit together and remain out of the upload queue',async()=>{
 const {saveAudioChunk,listLocalBlobs}=await import('../pwa/src/storage.ts');const journal={id:'audio-recipe',noteId:'a',mimeType:'audio/webm',name:'Recette',startedAt:1,chunkIds:['chunk-0'],size:3,duration:1,status:'recording' as const};await saveAudioChunk('audio-test','year',journal,new Blob(['abc'],{type:'audio/webm'}));const chunks=await listLocalBlobs('audio-test','year');assert.equal(chunks.length,1);assert.equal(chunks[0].removedFromNote,true);assert.equal(chunks[0].blob.size,3);assert.equal((await listSnapshots('audio-test','year'))[0].value.id,'audio-recipe');
});
test('Migrated inline photographs retain their asset without adding a duplicate floating image',()=>{
 const noteId='inline';const markdown='Texte\n\n![Photo](dowze-photo:note-inline/photo-original)';const document=migratePaper(noteId,markdown,{photos:[{id:'photo-original',name:'Photo',serverId:'server-original'}]});assert.equal(document.assets.length,1);assert.equal(document.objects.filter(o=>o.kind==='image').length,0);assert.equal(document.objects[0].markdown,markdown);assert.ok(isPaperDocument(document));
});
test('Only semantic images of the same note suppress migrated floating photos, including reference definitions',()=>{
 const noteId='semantic',source={photos:[{id:'photo-a',name:'A'}]},url=photoReference(noteBoardId(noteId),'photo-a');
 for(const markdown of [`\`![Example](${url})\``,`\`\`\`md\n![Example](${url})\n\`\`\``,`[Link](${url})`,`![Other](${photoReference(noteBoardId('foreign'),'photo-a')})`])assert.equal(migratePaper(noteId,markdown,source).objects.filter(o=>o.kind==='image').length,1);
 for(const markdown of [`![Photo][P]\n\n[P]: ${url}`,`![Photo](dowze-photo:note-semantic/photo%2Da)`,`![Photo](${photoReference(notebookDocumentId(noteId),'photo-a')})`])assert.equal(migratePaper(noteId,markdown,source).objects.filter(o=>o.kind==='image').length,0);
});
test('Photo IDs between 128 and 200 UTF-16 units get bounded transport identities while their source remains exact',()=>{
 for(const sourceId of ['x'.repeat(128),'x'.repeat(200),'é'.repeat(150),'unsafe/path']){const source={photos:[{id:sourceId,name:'Original'}]},before=structuredClone(source),document=migratePaper('strict-photos','Raw text',source),asset=document.assets[0];assert.ok(isPaperDocument(document));assert.notEqual(asset.id,sourceId);assert.ok(parsePhotoReference(photoReference(notebookDocumentId(document.noteId),asset.id)));assert.equal(document.objects.find(o=>o.kind==='image')?.assetId,asset.id);assert.deepEqual(source,before);}
});
test('Opacity persists through commands and history, absent legacy opacity stays compatible, invalid values are refused',()=>{
 const document=migratePaper('opacity','',old),ink=document.objects.find(o=>o.kind==='ink')!;
 assert.equal(ink.opacity,undefined);assert.ok(isPaperDocument(document));
 for(const opacity of [0,.35,.65,1]){
  const changed=applyPaperCommand(document,{type:'patch-object',id:ink.id,patch:{opacity}});
  assert.equal(changed.objects.find(o=>o.id===ink.id)?.opacity,opacity);assert.ok(isPaperDocument(changed));
  const undone=travelPaperHistory(recordPaperHistory(emptyPaperHistory(),document),changed,'undo')!;
  assert.equal(undone.document.objects.find(o=>o.id===ink.id)?.opacity,undefined);
  const redone=travelPaperHistory(undone.history,undone.document,'redo')!;
  assert.equal(redone.document.objects.find(o=>o.id===ink.id)?.opacity,opacity);
 }
 for(const opacity of [-.01,1.01,NaN,Infinity,'0.5',null])assert.equal(isPaperDocument({...document,objects:document.objects.map(o=>o.id===ink.id?{...o,opacity}:o)}),false);
});
