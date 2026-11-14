import test from 'node:test';
import assert from 'node:assert/strict';
import {flushNotebookWorkspaceForClose} from '../src/lib/notebookClose.ts';
import {registerNotebookWriter,resumeAllNotebookAccounts,hasPendingNotebookWrites} from '../src/lib/notebookSession.ts';
test('Closing settles every note and sound before freezing caches and giving the native receipt',async()=>{
 const order:string[]=[];let typed=true;const a=registerNotebookWriter('close-A',{flush:()=>{order.push('text');typed=false;},settled:async()=>{order.push('note committed');},suspend:()=>order.push('suspend A'),resume:()=>{},pending:()=>typed});const b=registerNotebookWriter('close-B',{flush:async()=>{order.push('sound');},settled:async()=>{},suspend:()=>order.push('suspend B'),resume:()=>{}});assert.equal(hasPendingNotebookWrites(),true);
 const cache={flush:async()=>{order.push('cache');},freeze:()=>order.push('freeze'),unfreeze:()=>order.push('unfreeze')};await flushNotebookWorkspaceForClose(cache,Promise.resolve(),async saved=>{assert.equal(saved,true);order.push('receipt');});assert.ok(order.indexOf('text')<order.indexOf('freeze'));assert.ok(order.indexOf('sound')<order.indexOf('freeze'));assert.ok(order.indexOf('note committed')<order.indexOf('freeze'));assert.deepEqual(order.slice(-4),['cache','freeze','cache','receipt']);assert.equal(hasPendingNotebookWrites(),false);resumeAllNotebookAccounts();a();b();
});
test('A note-save failure or obsolete native receipt cancels closing and resumes writing',async()=>{
 let writable=true;const receipts:boolean[]=[];const remove=registerNotebookWriter('close-fail',{flush:()=>{},settled:async()=>{throw Error('disk full');},suspend:()=>{writable=false;},resume:()=>{writable=true;}});let frozen=false;const cache={flush:async()=>{},freeze:()=>{frozen=true;},unfreeze:()=>{frozen=false;}};await assert.rejects(flushNotebookWorkspaceForClose(cache,Promise.resolve(),async value=>{receipts.push(value);}),/disk full/);assert.deepEqual(receipts,[false]);assert.equal(frozen,false);assert.equal(writable,true);remove();
 const ok=registerNotebookWriter('close-stale',{flush:()=>{},settled:async()=>{},suspend:()=>{writable=false;},resume:()=>{writable=true;}});await assert.rejects(flushNotebookWorkspaceForClose(cache,Promise.resolve(),async value=>{if(value)throw Error('stale receipt');}),/stale receipt/);assert.equal(frozen,false);assert.equal(writable,true);ok();
});

test('A pending-state read failure is treated as unsaved work rather than permission to close',()=>{
 const remove=registerNotebookWriter('close-read-error',{flush:()=>{},settled:async()=>{},suspend:()=>{},resume:()=>{},pending:()=>{throw Error('editor unreadable');}});assert.equal(hasPendingNotebookWrites(),true);remove();
});
