import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB} from 'fake-indexeddb';
import {putDraft,putLocalBlob,putSnapshot,clearPrivateCache,listLocalBlobs,listSnapshots,getDraft,queueMutation,acknowledgeMutation,listMutations} from '../pwa/src/storage.ts';
globalThis.indexedDB=indexedDB;
test('Logout removes cache, keeps notebook history, audio recovery, pending data and other owners atomically',async()=>{
 const identity={accountId:'retention',spaceId:'year',type:'whiteboard' as const,documentId:'n'};
 await putDraft({...identity,title:'Local',content:{assets:[{id:'pending-linked'}]},baseVersion:0,updatedAt:1,syncState:'local'});
 for(const [id,status] of [['pending-linked','uploaded'],['recovery-linked','uploaded'],['audio-chunk','pending'],['download-cache','uploaded']] as const)await putLocalBlob({id,accountId:identity.accountId,spaceId:'year',blob:new Blob(['test']),name:id,createdAt:1,status});
 await putLocalBlob({id:'other-account-cache',accountId:'other',spaceId:'year',blob:new Blob(['keep']),name:'Other',createdAt:1,status:'uploaded'});
 await putSnapshot({key:'paper-history|retention|year|n|1',accountId:'retention',spaceId:'year',value:{assets:[{id:'recovery-linked'}]}});await putSnapshot({key:'audio-recording|retention|year|n|a',accountId:'retention',spaceId:'year',value:{chunkIds:['audio-chunk']}});await putSnapshot({key:'course|retention|year',accountId:'retention',spaceId:'year',value:'cache'});
 await clearPrivateCache('retention');assert.deepEqual((await listLocalBlobs('retention','year')).map(b=>b.id).sort(),['audio-chunk','pending-linked','recovery-linked']);assert.equal((await listLocalBlobs('other','year')).length,1);assert.equal((await listSnapshots('retention','year')).length,2);assert.ok(await getDraft(identity));
});
test('A response received after the scope closed cannot acknowledge or erase a pending edit',async()=>{
 const draft={accountId:'ack-closed',spaceId:'year',type:'notesMarkdown' as const,documentId:'n',title:'Pending',content:{text:'typed'},baseVersion:0,updatedAt:1,syncState:'queued' as const};const mutation={...draft,id:'close-mutation',createdAt:1,status:'pending' as const};await putDraft(draft);await queueMutation(mutation);await assert.rejects(()=>acknowledgeMutation(mutation,1,undefined,()=>false));assert.equal((await listMutations(draft.accountId,'year')).length,1);assert.equal((await getDraft(draft))?.baseVersion,0);
});
