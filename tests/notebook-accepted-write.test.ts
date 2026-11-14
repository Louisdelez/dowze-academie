import test from 'node:test';
import assert from 'node:assert/strict';
import {createNotebookAcceptedWrite,NotebookAcceptedWriteRecoveryError} from '../src/lib/notebookAcceptedWrite.ts';
import {registerNotebookWriter,settleNotebookAccount,resumeNotebookAccount,hasPendingNotebookWrites} from '../src/lib/notebookSession.ts';
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(yes=>{resolve=yes;});return {promise,resolve};};
const source=()=>({accountId:'A',spaceId:'2026',documentId:'paper-A',generation:1});

test('A canonical commit releases exactly once and later flush/retry never stores again',async()=>{
 let saves=0,recoveries=0,releases=0;
 const write=createNotebookAcceptedWrite({source:source(),value:'accepted',save:async()=>{saves++;},preserve:async()=>{recoveries++;},onDurable:kind=>{assert.equal(kind,'canonical');releases++;}});
 assert.equal(write.pending(),true);const publication=write.start();assert.equal(write.start(),publication);
 await publication;await write.settled();await Promise.all([write.flush(),write.retry()]);
 assert.equal(write.pending(),false);assert.equal(write.durability(),'canonical');assert.deepEqual([saves,recoveries,releases],[1,0,1]);
});
test('Recovery success permits settlement without changing the original publication rejection',async()=>{
 const canonicalError=Error('canonical conflict'),captured=source();let preserved:unknown,releases=0;
 const write=createNotebookAcceptedWrite({source:captured,value:Object.freeze({text:'original branch'}),save:async()=>{throw canonicalError;},preserve:async(owned,value)=>{preserved={owned,value};},onDurable:kind=>{assert.equal(kind,'recovery');releases++;}});
 captured.accountId='B';captured.documentId='paper-B';
 const publication=write.start();await assert.rejects(publication,error=>error===canonicalError);await write.settled();await write.flush();
 assert.equal(write.pending(),false);assert.equal(write.failure(),null);assert.equal(releases,1);
 assert.deepEqual(preserved,{owned:{accountId:'A',spaceId:'2026',documentId:'paper-A',generation:1},value:{text:'original branch'}});
 await assert.rejects(publication,error=>error===canonicalError);
});
test('Double quota failure rejects the proof and keeps the accepted value pending',async()=>{
 const canonicalError=Error('canonical quota'),recoveryError=Error('recovery quota'),value=Object.freeze({text:'never discarded'});let releases=0;
 const write=createNotebookAcceptedWrite({source:source(),value,save:async()=>{throw canonicalError;},preserve:async()=>{throw recoveryError;},onDurable:()=>{releases++;}});
 await assert.rejects(write.start(),error=>error===canonicalError);
 await assert.rejects(write.settled(),error=>error instanceof NotebookAcceptedWriteRecoveryError&&error.canonicalError===canonicalError&&error.recoveryError===recoveryError);
 assert.equal(write.value,value);assert.equal(write.pending(),true);assert.equal(write.durability(),null);assert.equal(releases,0);
});
test('Retry only writes one original-scope recovery identity and never retries canonical publication',async()=>{
 const original=source(),canonicalError=Error('deleted canonical'),keys:string[]=[],values:string[]=[];let quota=true,saves=0,releases=0;
 const write=createNotebookAcceptedWrite({source:original,value:'A accepted',save:async()=>{saves++;throw canonicalError;},preserve:async(owned,value)=>{keys.push(owned.documentId+'|accepted-stable');values.push(value);if(quota)throw Error('quota');},onDurable:()=>{releases++;}});
 const publication=write.start();await assert.rejects(publication);
 original.accountId='B';original.documentId='paper-B';quota=false;await write.retry();await write.settled();await write.flush();
 assert.equal(saves,1);assert.equal(releases,1);assert.equal(write.pending(),false);assert.deepEqual(keys,['paper-A|accepted-stable','paper-A|accepted-stable']);assert.deepEqual(values,['A accepted','A accepted']);
 await assert.rejects(publication,error=>error===canonicalError);
});
test('Concurrent retry and close flush join one recovery transaction',async()=>{
 const gate=deferred();let quota=true,recoveries=0,releases=0;
 const write=createNotebookAcceptedWrite({source:source(),value:'A',save:async()=>{throw Error('save');},preserve:async()=>{recoveries++;if(quota)throw Error('quota');await gate.promise;},onDurable:()=>{releases++;}});
 await assert.rejects(write.start());quota=false;const retry=write.retry(),flush=write.flush(),barrier=write.settled();
 assert.equal(retry,flush);assert.equal(barrier,retry);assert.equal(write.pending(),true);
 gate.resolve();await Promise.all([retry,flush,barrier]);assert.equal(recoveries,2);assert.equal(releases,1);assert.equal(write.pending(),false);
});
test('Persistent quota produces repeated explicit rejection rather than silent settlement or a parked promise',async()=>{
 let recoveries=0,releases=0;
 const write=createNotebookAcceptedWrite({source:source(),value:'retained',save:async()=>{throw Error('save');},preserve:async()=>{recoveries++;throw Error('quota');},onDurable:()=>{releases++;}});
 await assert.rejects(write.start());for(let index=0;index<3;index++){await assert.rejects(write.flush(),NotebookAcceptedWriteRecoveryError);await assert.rejects(write.settled(),NotebookAcceptedWriteRecoveryError);assert.equal(write.pending(),true);}
 assert.equal(recoveries,4);assert.equal(releases,0);assert.equal(write.value,'retained');
});
test('Branches behind a failed predecessor preserve their own captured values independently',async()=>{
 const copies:string[]=[];let quota=true;
 const first=createNotebookAcceptedWrite({source:source(),value:'first',save:async()=>{throw Error('first save');},preserve:async(_owner,value)=>{if(quota)throw Error('quota');copies.push(value);}});
 const firstTail=first.start(),second=createNotebookAcceptedWrite({source:source(),value:'second',save:async()=>{await firstTail;throw Error('must not run after rejected predecessor');},preserve:async(_owner,value)=>{if(quota)throw Error('quota');copies.push(value);}});
 await assert.rejects(second.start());await assert.rejects(firstTail);assert.equal(first.pending(),true);assert.equal(second.pending(),true);
 quota=false;await Promise.all([first.retry(),second.retry()]);assert.deepEqual(copies.sort(),['first','second']);assert.equal(first.pending(),false);assert.equal(second.pending(),false);
});
test('Account close refuses double failure and later confirms retained recovery before releasing its writer',async()=>{
 const account='accepted-write-barrier-unit';let quota=true,releases=0,unregister=()=>{};
 const write=createNotebookAcceptedWrite({source:{...source(),accountId:account},value:'accepted before close',save:async()=>{throw Error('save quota');},preserve:async()=>{if(quota)throw Error('recovery quota');},onDurable:()=>{releases++;unregister();}});
 unregister=registerNotebookWriter(account,{flush:write.flush,settled:write.settled,pending:write.pending,suspend:()=>{},resume:()=>{}});
 try{
  await assert.rejects(write.start());assert.equal(hasPendingNotebookWrites(),true);await assert.rejects(settleNotebookAccount(account),NotebookAcceptedWriteRecoveryError);assert.equal(hasPendingNotebookWrites(),true);assert.equal(releases,0);
  quota=false;await settleNotebookAccount(account);assert.equal(hasPendingNotebookWrites(),false);assert.equal(releases,1);await write.settled();
 }finally{quota=false;await write.flush();unregister();resumeNotebookAccount(account);}
});
test('No callback exception can invalidate a real durable commit or cause another write',async()=>{
 let saves=0;
 const write=createNotebookAcceptedWrite({source:source(),value:'accepted',save:async()=>{saves++;},preserve:async()=>{throw Error('must not preserve');},onDurable:()=>{throw Error('observer');}});
 await write.start();await write.settled();await write.retry();assert.equal(saves,1);assert.equal(write.pending(),false);
});
test('An in-flight original operation remains pending and close proof waits for its real commit',async()=>{
 const gate=deferred();let committed=false;
 const write=createNotebookAcceptedWrite({source:source(),value:'accepted',save:async()=>{await gate.promise;committed=true;},preserve:async()=>{throw Error('not needed');}});
 const publication=write.start();let settled=false;const barrier=write.settled().then(()=>{settled=true;});await Promise.resolve();assert.equal(committed,false);assert.equal(settled,false);assert.equal(write.pending(),true);
 gate.resolve();await Promise.all([publication,barrier]);assert.equal(committed,true);assert.equal(settled,true);assert.equal(write.pending(),false);
});
