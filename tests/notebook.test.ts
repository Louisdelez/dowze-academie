import assert from 'node:assert/strict';
import test from 'node:test';
import { LEGACY_NOTE_ID, noteBoardId, hasLegacyDrawing } from '../src/lib/notebook.ts';
import { createSubjectNote, normalizeSubjectNotesStore, deleteSubjectNote } from '../src/lib/subjectNotes.ts';
test('Notebook attachment identity preserves legacy files and isolates note branches',()=>{
 assert.equal(noteBoardId(LEGACY_NOTE_ID),'whiteboard-main');
 const ids=['a','b','A',crypto.randomUUID(),'notes '+ 'é'.repeat(200)];
 const boards=ids.map(noteBoardId);
 assert.equal(new Set(boards).size,ids.length);
 for(const id of boards)assert.match(id,/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
 assert.equal(noteBoardId(ids[4]),noteBoardId(ids[4]));
});
test('A legacy note is offered only for actual strokes or image references',()=>{
 assert.equal(hasLegacyDrawing([]),false);
 assert.equal(hasLegacyDrawing([{type:'whiteboard',documentId:'whiteboard-main',content:{board:{strokes:[]},photos:[]}}]),false);
 assert.equal(hasLegacyDrawing([{type:'whiteboard',documentId:'whiteboard-main',content:{board:{strokes:[{id:'old'}]}}}]),true);
 assert.equal(hasLegacyDrawing([{type:'whiteboard',documentId:'whiteboard-main',content:{photos:[{id:'original'}]}}]),true);
 assert.equal(hasLegacyDrawing([{type:'whiteboard',documentId:noteBoardId('other'),content:{photos:[{}]}}]),false);
});
test('Opening a legacy note keeps every previous note byte-for-byte and original drawing identity',()=>{
 const previous=createSubjectNote(normalizeSubjectNotesStore(null),{id:'before',title:'Original',markdown:'**Texte** ![image](data:image/png;base64,original)',subjectIds:['physics'],tags:['revision']}).store;
 const migrated=createSubjectNote(previous,{id:LEGACY_NOTE_ID,title:'Dessins et photos existants'}).store;
 assert.deepEqual(migrated.documents.find(n=>n.id==='before'),previous.documents[0]);
 assert.equal(noteBoardId(LEGACY_NOTE_ID),'whiteboard-main');
 assert.equal(migrated.activeDocumentId,LEGACY_NOTE_ID);
 assert.deepEqual(deleteSubjectNote(migrated,LEGACY_NOTE_ID).documents,previous.documents);
});

test('private image references preserve historical IDs and reject external URLs or paths', async () => {
 const {photoReference,parsePhotoReference}=await import('../src/lib/notebook.ts');
 assert.deepEqual(parsePhotoReference(photoReference('note-local.20261008','image-123')), {documentId:'note-local.20261008',id:'image-123'});
 for(const ref of ['https://other.example/image.png','dowze-photo:../x','dowze-photo:note/%2Fsecret','dowze-photo:note/%ZZ']) assert.equal(parsePhotoReference(ref),null);
});

test('a delayed note edit preserves the acknowledged server version and conflicts', async()=>{
 const {indexedDB}=await import('fake-indexeddb');globalThis.indexedDB=indexedDB;
 const {putDraft,putEditedDraft,getDraft}=await import('../pwa/src/storage.ts');
 const note={accountId:'recipe',spaceId:'year',documentId:'versioned-note',type:'notesMarkdown' as const,title:'Cours',content:{title:'Cours',markdown:'version serveur'},baseVersion:5,updatedAt:1,syncState:'synced' as const};
 await putDraft(note);await putEditedDraft({...note,content:{title:'Cours',markdown:'nouvelle saisie'},baseVersion:3,syncState:'local'});
 assert.equal((await getDraft(note))?.baseVersion,5);
 await putDraft({...note,syncState:'conflict',conflict:{serverVersion:6}});
 await assert.rejects(()=>putEditedDraft({...note,baseVersion:3,syncState:'local'}));
 assert.equal((await getDraft(note))?.syncState,'conflict');
});

test('a stroke finished after an upload uses the durable version and preserves real conflicts',async()=>{
 const {putDraft,saveDraftAndQueue,acknowledgeMutation,getDraft,listMutations}=await import('../pwa/src/storage.ts');
 const board={accountId:'recipe',spaceId:'year',documentId:'delayed-stroke',type:'whiteboard' as const,title:'Feuille',content:{board:{strokes:[]}},baseVersion:0,updatedAt:1,syncState:'queued' as const};
 const entry={...board,id:'stroke-first',createdAt:1,status:'pending' as const};
 const first=await saveDraftAndQueue(board,entry);await acknowledgeMutation(first,2);
 const ink={...board,content:{board:{strokes:[{id:'ink'}]}}};
 const next=await saveDraftAndQueue(ink,{...entry,id:'stroke-second',content:ink.content});
 assert.equal(next.baseVersion,2);assert.equal((await getDraft(board))?.baseVersion,2);
 const third=await saveDraftAndQueue(ink,{...entry,id:'stroke-third',content:ink.content});assert.equal(third.baseVersion,3);
 await putDraft({...ink,baseVersion:4,syncState:'conflict',conflict:{serverVersion:5}});
 await assert.rejects(()=>saveDraftAndQueue(board,{...entry,id:'stroke-rejected'}));
 assert.equal((await getDraft(board))?.syncState,'conflict');assert.ok(!(await listMutations('recipe','year')).some(m=>m.id==='stroke-rejected'));
});

test('photo reference reconciliation cannot overwrite a stroke saved after its snapshot',async()=>{
 const {putDraft,saveDraftAndQueue,getDraft,DraftChangedError}=await import('../pwa/src/storage.ts');
 const original={accountId:'recipe',spaceId:'year',documentId:'photo-race',type:'whiteboard' as const,title:'Feuille',content:{board:{strokes:[]},photos:[{id:'photo'}]},baseVersion:2,updatedAt:1,syncState:'synced' as const};
 const newer={...original,content:{...original.content,board:{strokes:[{id:'new-stroke'}]}},syncState:'queued' as const};await putDraft(newer);
 const photoUpdate={...original.content,photos:[{id:'photo',serverId:'private-blob'}]};
 await assert.rejects(()=>saveDraftAndQueue({...original,content:photoUpdate},{...original,id:'photo-race-rejected',createdAt:1,status:'pending',content:photoUpdate},original.content),DraftChangedError);
 assert.deepEqual((await getDraft(original))?.content,newer.content);
});
