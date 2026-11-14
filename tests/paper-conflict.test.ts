import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB} from 'fake-indexeddb';
import {migratePaper,applyPaperCommand,notebookDocumentId} from '../src/lib/notebookDocument.ts';
import {putDraft,getDraft,resolvePaperDraft,listSnapshots,queueMutation,listMutations} from '../pwa/src/storage.ts';
globalThis.indexedDB=indexedDB;
test('Conflict resolution preserves server, durable and unsaved visible versions in one transaction',async()=>{
 const content=migratePaper('conflict','local',null),visible=applyPaperCommand(content,{type:'patch-object',id:content.objects[0].id,patch:{markdown:'Unsaved text'}});
 const original={accountId:'conflict-qa',spaceId:'year',documentId:notebookDocumentId('conflict'),type:'whiteboard' as const,title:'Note',content,baseVersion:1,updatedAt:1,syncState:'conflict' as const};
 const remote={...original,content:{...content,revision:8,objects:content.objects.map(o=>({...o,markdown:'Remote text'}))},baseVersion:3,syncState:'synced' as const};
 await putDraft(original);await queueMutation({...original,id:'old-upload',createdAt:1,status:'conflict'});
 const selected={...visible,revision:9};await resolvePaperDraft(original,visible,remote,3,selected,'receipt');
 const saved=await getDraft(original);assert.equal(saved?.baseVersion,3);assert.equal(saved?.syncState,'local');assert.deepEqual(saved?.content,selected);assert.equal((await listMutations('conflict-qa','year')).length,0);
 const receipt=(await listSnapshots('conflict-qa','year')).find(s=>s.key.startsWith('paper-resolution'))!;assert.deepEqual(receipt.value.visibleContent,visible);assert.deepEqual(receipt.value.server.content,remote.content);assert.deepEqual(receipt.value.durable.content,content);
});
test('A second edit invalidates an outdated conflict decision and remains untouched',async()=>{
 const content=migratePaper('race','original',null),original={accountId:'conflict-race',spaceId:'year',documentId:notebookDocumentId('race'),type:'whiteboard' as const,title:'Note',content,baseVersion:1,updatedAt:1,syncState:'conflict' as const};
 const latest={...original,content:applyPaperCommand(content,{type:'patch-object',id:content.objects[0].id,patch:{markdown:'newer'}})};await putDraft(latest);
 await assert.rejects(()=>resolvePaperDraft(original,content,null,0,content,'outdated'));assert.deepEqual((await getDraft(original))?.content,latest.content);assert.equal((await listSnapshots('conflict-race','year')).length,0);
 await assert.rejects(()=>resolvePaperDraft(latest,content,{...latest,accountId:'other'},3,content,'wrong-account'));
});
