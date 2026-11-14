import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB} from 'fake-indexeddb';
import {getDraft,putDraft,applyChangePage,type Draft} from '../pwa/src/storage.ts';
import {isPaperDocument,migratePaper,notebookDocumentId} from '../src/lib/notebookDocument.ts';
import {canPublishNotebookMetadata} from '../src/lib/paperMetadataPublication.ts';
import {syncDocuments,emptySyncState,type SyncDocument} from '../src/lib/serverSync.ts';
globalThis.indexedDB=indexedDB;
const scope={accountId:'qa-metadata-publication',spaceId:'2026'};
test('A metadata mirror waits for its own canonical graph and respects staging, ownership and revocation',async()=>{
 const note={type:'notesMarkdown',id:'note-a'},other={...scope,spaceId:'2025'};
 const paper:Draft={...scope,type:'whiteboard',documentId:notebookDocumentId(note.id),title:'QA',content:migratePaper(note.id,'Text',null),baseVersion:0,updatedAt:1,syncState:'local'};
 assert.ok(isPaperDocument(paper.content));await putDraft(paper);
 assert.equal(await canPublishNotebookMetadata(note,scope,()=>true),false);
 assert.equal(await canPublishNotebookMetadata(note,other,()=>true),true);
 await putDraft({...paper,syncState:'queued'});assert.equal(await canPublishNotebookMetadata(note,scope,()=>true),false);
 await putDraft({...paper,syncState:'synced',staged:true});assert.equal(await canPublishNotebookMetadata(note,scope,()=>true),false);
 await putDraft({...paper,syncState:'synced'});assert.equal(await canPublishNotebookMetadata(note,scope,()=>true),true);
 let checks=0;assert.equal(await canPublishNotebookMetadata(note,scope,()=>++checks<2),false);
 await putDraft({...paper,syncState:'synced',content:migratePaper('foreign','Foreign',null)});assert.equal(await canPublishNotebookMetadata(note,scope,()=>true),false);
 assert.equal(await canPublishNotebookMetadata({type:'tasks',id:'task'},scope,()=>true),true);
 assert.equal((await getDraft(paper))?.content.noteId,'foreign');
});
test('Deferral leaves metadata present, never fabricates a deletion, and resumes with its durable mutation identity',async()=>{
 const document:SyncDocument={type:'notesMarkdown',id:'dependency-test',content:{title:'QA',markdown:'New content'}},state=emptySyncState();
 state.base['notesMarkdown|dependency-test']={version:4,content:{title:'QA',markdown:'Previous content'}};
 const puts:{base:number;id:string;content:unknown}[]=[],removed:string[]=[];let ready=false,allocations=0,saved=0;
 const run=()=>syncDocuments({state,save:()=>{saved++;},documents:()=>[document],apply:()=>true,current:()=>true,id:()=>`mutation-${++allocations}`,canPublish:()=>ready,transport:{changes:async()=>({items:[],has_more:false,next_cursor:'0'}),remove:async(_type,id)=>{removed.push(id);return {version:5};},put:async(doc,base,id)=>{puts.push({base,id,content:doc.content});return {version:base+1};}}});
 await run();assert.equal(puts.length,0);assert.deepEqual(removed,[]);assert.equal(state.base['notesMarkdown|dependency-test'].version,4);assert.equal(state.pending['notesMarkdown|dependency-test'],undefined);
 ready=true;await run();assert.equal(puts.length,1);assert.equal(puts[0].base,4);assert.deepEqual(puts[0].content,document.content);assert.deepEqual(removed,[]);assert.equal(state.base['notesMarkdown|dependency-test'].version,5);assert.ok(saved>0);
});
test('An explicit canonical tombstone blocks the visible mirror even when its draft is absent',async()=>{
 const owner={accountId:'qa-metadata-deletion',spaceId:'2026'},note={type:'notesMarkdown',id:'deleted-note'},id=notebookDocumentId(note.id);
 const paper:Draft={...owner,type:'whiteboard',documentId:id,title:'Deleted',content:migratePaper(note.id,'Retained source',null),baseVersion:4,updatedAt:1,syncState:'synced'};
 await putDraft(paper);await applyChangePage(owner.accountId,owner.spaceId,{items:[{space_id:owner.spaceId,document_type:'whiteboard',document_id:id,version:5,content:null,deleted:true,changed_at:'2026-10-13T12:00:00Z'}],has_more:false,next_cursor:'deleted-proof'});
 assert.equal(await getDraft(paper),undefined);assert.equal(await canPublishNotebookMetadata(note,owner,()=>true),false);
 assert.equal(await canPublishNotebookMetadata(note,{...owner,spaceId:'2025'},()=>true),true);
});
