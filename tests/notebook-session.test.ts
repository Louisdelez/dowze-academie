import test from 'node:test';
import assert from 'node:assert/strict';
import {registerNotebookWriter,settleNotebookAccount,resumeNotebookAccount,disposeNotebookAccount} from '../src/lib/notebookSession.ts';
import {ApiClient} from '../pwa/src/api.ts';
test('Logout waits for delayed writers and their final flush before suspending, isolates other profiles',async()=>{
 let done!:()=>void;const delayed=new Promise<void>(resolve=>done=resolve);const order:string[]=[];const remove=registerNotebookWriter('A',{flush:()=>{order.push('flush');},settled:()=>delayed,suspend:()=>order.push('suspend'),resume:()=>{},dispose:()=>order.push('dispose')});const other=registerNotebookWriter('B',{flush:()=>{throw Error('wrong owner');},settled:async()=>{},suspend:()=>{},resume:()=>{}});
 const close=settleNotebookAccount('A');await Promise.resolve();assert.deepEqual(order,['flush']);done();await close;assert.deepEqual(order,['flush','suspend']);disposeNotebookAccount('A');assert.equal(order.at(-1),'dispose');remove();other();
});
test('Failed persistence restores the session and reports failure rather than silently closing it',async()=>{
 let writable=true;const remove=registerNotebookWriter('fail',{flush:()=>{},settled:async()=>{throw Error('disk full');},suspend:()=>{writable=false;},resume:()=>{writable=true;}});await assert.rejects(settleNotebookAccount('fail'),/disk full/);assert.equal(writable,true);resumeNotebookAccount('fail');remove();
});
test('An old CSRF response cannot overwrite a new login, and an old me response cannot install its owner',async()=>{
 let csrf!: (response:Response)=>void;const api=new ApiClient('',async(input)=>{if(input==='/v1/csrf')return await new Promise<Response>(resolve=>csrf=resolve);if(input==='/v1/sessions')return Response.json({csrf_token:'new-synthetic-token'});return Response.json({id:'B'});});api.bindAccount('A');const stale=api.restoreCsrf();await Promise.resolve();api.forgetSession();await api.login('synthetic','synthetic');csrf(Response.json({csrf_token:'old-synthetic-token'}));await assert.rejects(stale,/session a changé/);assert.equal(api.hasCsrf(),true);assert.equal((await api.me()).id,'B');
 let finish!: (response:Response)=>void;const other=new ApiClient('',async()=>await new Promise<Response>(resolve=>finish=resolve));const me=other.me();await Promise.resolve();other.forgetSession();finish(Response.json({id:'A'}));await assert.rejects(me,/session a changé/);
});
