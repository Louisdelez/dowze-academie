import test from 'node:test';
import assert from 'node:assert/strict';
import {hasPendingNotebookWrites,runNotebookOperation,settleNotebookAccount,resumeNotebookAccount} from '../src/lib/notebookSession.ts';
import {bindNotebookBeforeUnload} from '../src/lib/notebookBeforeUnload.ts';
const deferred=()=>{let release!:()=>void;const promise=new Promise<void>(resolve=>release=resolve);return {promise,release};};

test('An admitted deferred notebook operation is pending until its captured writer completes, and closure waits it',async()=>{
 const account='operation-pending-owner',gate=deferred();let closed=false,closing:Promise<void>|undefined;
 assert.equal(hasPendingNotebookWrites(),false);
 const operation=runNotebookOperation(account,async()=>{await gate.promise;return 'original-owner-result';});
 try {
  assert.equal(hasPendingNotebookWrites(),true,'Browser close detection must include a title, creation or import admitted through runNotebookOperation');
  closing=settleNotebookAccount(account).then(()=>{closed=true;});await Promise.resolve();assert.equal(closed,false);
  assert.equal(hasPendingNotebookWrites(),true);gate.release();assert.equal(await operation,'original-owner-result');await closing;assert.equal(closed,true);assert.equal(hasPendingNotebookWrites(),false);
  let called=false;await assert.rejects(runNotebookOperation(account,async()=>{called=true;}),/session se ferme/);assert.equal(called,false);assert.equal(hasPendingNotebookWrites(),false);
 } finally {gate.release();await operation.catch(()=>{});await closing?.catch(()=>{});resumeNotebookAccount(account);}
});

test('Completing one account operation keeps the global pending signal while a second owner still writes',async()=>{
 const firstGate=deferred(),secondGate=deferred(),first=runNotebookOperation('operation-pending-first',async()=>{await firstGate.promise;}),second=runNotebookOperation('operation-pending-second',async()=>{await secondGate.promise;});
 try {assert.equal(hasPendingNotebookWrites(),true);firstGate.release();await first;assert.equal(hasPendingNotebookWrites(),true);secondGate.release();await second;assert.equal(hasPendingNotebookWrites(),false);}
 finally {firstGate.release();secondGate.release();await Promise.allSettled([first,second]);resumeNotebookAccount('operation-pending-first');resumeNotebookAccount('operation-pending-second');}
});

test('A failed operation clears its pending signal and does not leave an idle browser close warning',async()=>{
 const gate=deferred(),operation=runNotebookOperation('operation-pending-failed',async()=>{await gate.promise;throw Error('targeted operation failure');}),rejected=assert.rejects(operation,/targeted operation failure/);
 try {assert.equal(hasPendingNotebookWrites(),true);gate.release();await rejected;assert.equal(hasPendingNotebookWrites(),false);}
 finally {gate.release();await rejected;resumeNotebookAccount('operation-pending-failed');}
});

test('Actual beforeunload binding allows idle exit, guards a deferred operation, and allows exit after settling',async()=>{
 const target=new EventTarget(),unbind=bindNotebookBeforeUnload(target),gate=deferred(),event=()=>new Event('beforeunload',{cancelable:true});
 const before=event();assert.equal(target.dispatchEvent(before),true);assert.equal(before.defaultPrevented,false);
 const operation=runNotebookOperation('operation-beforeunload',async()=>{await gate.promise;});
 try {const during=event();assert.equal(target.dispatchEvent(during),false);assert.equal(during.defaultPrevented,true);gate.release();await operation;const after=event();assert.equal(target.dispatchEvent(after),true);assert.equal(after.defaultPrevented,false);}
 finally {gate.release();await operation.catch(()=>{});unbind();resumeNotebookAccount('operation-beforeunload');}
});

test('Actual beforeunload binding clears after failure and its removal allows exit even during another pending operation',async()=>{
 const target=new EventTarget(),unbind=bindNotebookBeforeUnload(target),gate=deferred(),operation=runNotebookOperation('operation-beforeunload-failure',async()=>{await gate.promise;throw Error('pending close test failure');}),rejected=assert.rejects(operation,/pending close test failure/);
 try {const pending=new Event('beforeunload',{cancelable:true});Object.defineProperty(pending,'returnValue',{set(){throw Error('host has no legacy returnValue setter');}});assert.equal(target.dispatchEvent(pending),false);assert.equal(pending.defaultPrevented,true);gate.release();await rejected;const after=new Event('beforeunload',{cancelable:true});assert.equal(target.dispatchEvent(after),true);
  const secondGate=deferred(),second=runNotebookOperation('operation-beforeunload-dispose',async()=>{await secondGate.promise;});try{assert.equal(hasPendingNotebookWrites(),true);unbind();unbind();const removed=new Event('beforeunload',{cancelable:true});assert.equal(target.dispatchEvent(removed),true);assert.equal(removed.defaultPrevented,false);}finally{secondGate.release();await second;resumeNotebookAccount('operation-beforeunload-dispose');}
 } finally {gate.release();await rejected;unbind();resumeNotebookAccount('operation-beforeunload-failure');}
});
