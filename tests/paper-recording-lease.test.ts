import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB} from 'fake-indexeddb';
import {updateAudioRecordingLease,saveAudioChunk,getAudioRecordingJournal,listLocalBlobs,type AudioRecordingJournal} from '../pwa/src/storage.ts';
globalThis.indexedDB=indexedDB;
const initial=(noteId:string):AudioRecordingJournal=>({id:'sound',noteId,name:'Synthetic',mimeType:'audio/wav',startedAt:1,chunkIds:[],size:0,duration:0,status:'recording'});

test('Two concurrent tabs acquire only one live recording lease; namespaces stay independent',async()=>{
 const scope={accountId:'lease-tabs',spaceId:'year',noteId:'note'},now=Date.now();
 const leases=await Promise.all(['tab-one','tab-two'].map(owner=>updateAudioRecordingLease(scope,owner,'claim',now)));assert.equal(leases.filter(Boolean).length,1);
 const winner=leases.find(Boolean)!,loser=winner.owner==='tab-one'?'tab-two':'tab-one';assert.equal(await updateAudioRecordingLease(scope,loser,'renew',now),null);await updateAudioRecordingLease(scope,loser,'release',now);assert.equal(await updateAudioRecordingLease(scope,loser,'claim',now),null);
 assert.ok(await updateAudioRecordingLease({...scope,spaceId:'other-year'},loser,'claim',now));assert.ok(await updateAudioRecordingLease({...scope,accountId:'another-user'},loser,'claim',now));assert.ok(await updateAudioRecordingLease({...scope,noteId:'other-note'},loser,'claim',now));
 await updateAudioRecordingLease(scope,winner.owner,'release',now);assert.ok(await updateAudioRecordingLease(scope,loser,'claim',now));
});

test('Expired lease can be recovered; delayed renewal/release cannot remove its new owner',async()=>{
 const scope={accountId:'lease-expiry',spaceId:'year',noteId:'note'},now=Date.now();const old=await updateAudioRecordingLease(scope,'crashed','claim',now-2000,1000);assert.ok(old);
 const next=await updateAudioRecordingLease(scope,'recovery','claim',now);assert.ok(next);assert.equal(await updateAudioRecordingLease(scope,'crashed','renew',now),null);await updateAudioRecordingLease(scope,'crashed','release',now);assert.equal(await updateAudioRecordingLease(scope,'third','claim',now),null);
});

test('CAS journal and raw chunk are atomic: one competing write succeeds and loser bytes stay absent',async()=>{
 const scope={accountId:'lease-cas',spaceId:'year',noteId:'note'},lease=(await updateAudioRecordingLease(scope,'recorder','claim'))!;
 const journal=await saveAudioChunk(scope.accountId,scope.spaceId,initial(scope.noteId),undefined,{lease,expectedRevision:null});assert.equal(journal.writeRevision,1);
 const next=(id:string)=>({...journal,chunkIds:[id],size:3,duration:1});const outcomes=await Promise.allSettled(['chunk-a','chunk-b'].map(id=>saveAudioChunk(scope.accountId,scope.spaceId,next(id),new Blob(['ABC']),{lease,expectedRevision:1})));assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
 const saved=(await getAudioRecordingJournal(scope,'sound'))!,files=await listLocalBlobs(scope.accountId,scope.spaceId);assert.equal(saved.writeRevision,2);assert.deepEqual(files.map(f=>f.id),saved.chunkIds);assert.equal(await files[0].blob.text(),'ABC');
 await assert.rejects(()=>saveAudioChunk(scope.accountId,scope.spaceId,{...journal,chunkIds:['stale'],size:3},new Blob(['BAD']),{lease,expectedRevision:1}));assert.deepEqual((await getAudioRecordingJournal(scope,'sound'))?.chunkIds,saved.chunkIds);
});

test('Live owner blocks legacy writer and wrong namespace; same chunk ID cannot overwrite other bytes',async()=>{
 const scope={accountId:'lease-data',spaceId:'year',noteId:'note'},lease=(await updateAudioRecordingLease(scope,'one','claim'))!,journal=await saveAudioChunk(scope.accountId,scope.spaceId,{...initial(scope.noteId),chunkIds:['chunk'],size:3},new Blob(['ONE']),{lease,expectedRevision:null});
 await assert.rejects(()=>saveAudioChunk(scope.accountId,scope.spaceId,journal,new Blob(['TWO'])));await assert.rejects(()=>saveAudioChunk(scope.accountId,'wrong-year',journal,undefined,{lease,expectedRevision:journal.writeRevision}));
 await assert.rejects(()=>saveAudioChunk(scope.accountId,scope.spaceId,journal,new Blob(['TWO']),{lease,expectedRevision:journal.writeRevision}));assert.equal((await getAudioRecordingJournal(scope,'sound'))?.writeRevision,1);assert.equal(await (await listLocalBlobs(scope.accountId,scope.spaceId))[0].blob.text(),'ONE');
});

test('Late old worker cannot write after takeover; zero writes on journal creation collision',async()=>{
 const scope={accountId:'lease-takeover',spaceId:'year',noteId:'note'},now=Date.now(),old=(await updateAudioRecordingLease(scope,'old','claim',now))!,journal=await saveAudioChunk(scope.accountId,scope.spaceId,initial(scope.noteId),undefined,{lease:old,expectedRevision:null});
 const next=(await updateAudioRecordingLease(scope,'new','claim',old.expiresAt+1))!;assert.ok(next);
 await assert.rejects(()=>saveAudioChunk(scope.accountId,scope.spaceId,{...journal,chunkIds:['late'],size:4},new Blob(['LATE']),{lease:old,expectedRevision:1}));await assert.rejects(()=>saveAudioChunk(scope.accountId,scope.spaceId,journal,undefined,{lease:next,expectedRevision:null}));assert.equal((await listLocalBlobs(scope.accountId,scope.spaceId)).length,0);assert.equal((await getAudioRecordingJournal(scope,'sound'))?.writeRevision,1);
});
