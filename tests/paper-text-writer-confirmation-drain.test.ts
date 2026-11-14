/** Causal transient-DOM overlap; no fake PM/IME completion or wall-clock budget. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createPaperTextWriter,type PaperTextWriterBuffer,type PaperTextWriterActivity,type PaperTextWriterOptions} from '../src/lib/paperTextWriter.ts';

const deferred=<T=void>()=>{let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function fixture(overrides:Partial<PaperTextWriterOptions>={}){
 const source={accountId:'A',spaceId:'year-A',noteId:'note-A',editorId:'text-A',api:{},generation:1,serial:1};
 const state={epoch:0,buffer:{markdown:'accepted final',composing:false,unconfirmedDOM:true,focused:true,caretY:27,domText:'accepted final DOM',document:{exact:'raw before observer'}} as PaperTextWriterBuffer};
 const raw=deferred(),durable=deferred(),writes:string[]=[],recoveries:{buffer:Readonly<PaperTextWriterBuffer>;version:number}[]=[],activities:PaperTextWriterActivity[]=[];
 const writer=createPaperTextWriter({source,initialMarkdown:'initial',current:()=>state.epoch===0,read:()=>state.buffer,
  persist:markdown=>{writes.push(markdown);return {result:true,durable:durable.promise};},
  preserve:async(buffer,version)=>{recoveries.push({buffer,version});await raw.promise;},
  onActivity:activity=>activities.push(activity),...overrides});
 writer.changed();
 const confirm=()=>{state.buffer={...state.buffer,composing:false,unconfirmedDOM:false};writer.probe();};
 return {source,state,raw,durable,writes,recoveries,activities,writer,confirm};
}

test('An explicit confirmed flush joins the held raw preservation and drains the same final buffer once under its original reentrant Promise',async()=>{
 const activities:PaperTextWriterActivity[]=[];let reentrant:ReturnType<typeof createPaperTextWriter>|undefined,fromObserver:Promise<boolean>|undefined;
 const f=fixture({onActivity:activity=>{activities.push(activity);if(activity.pendingOperations&&reentrant)fromObserver??=reentrant.flush();}});reentrant=f.writer;
 const old=f.writer.flush();
 try{
  assert.equal(f.recoveries.length,1);assert.equal(f.writes.length,0);assert.equal(f.writer.activity().pendingOperations,1);
  const held=f.recoveries[0];assert.equal(held.buffer.unconfirmedDOM,true);assert.equal(held.buffer.domText,'accepted final DOM');assert.equal(Object.isFrozen(held.buffer),true);
  f.confirm();const confirmedVersion=f.writer.activity().version;assert.ok(confirmedVersion>held.version);
  assert.equal(fromObserver,old);assert.equal(f.writer.flush(),old);assert.equal(f.writer.settled(),old);
  f.raw.resolve();f.durable.resolve();
  assert.equal(await old,true,'The successfully preserved old DOM must not reject its now-confirmed final buffer');
  assert.equal(await fromObserver,true);assert.deepEqual(f.writes,['accepted final']);assert.equal(f.recoveries.length,1);
  assert.equal(f.recoveries[0].buffer.unconfirmedDOM,true,'The original raw source remains unchanged');assert.deepEqual(f.recoveries[0].buffer.document,{exact:'raw before observer'});
  assert.equal(f.writer.activity().version,confirmedVersion);assert.equal(f.writer.activity().error,null);assert.equal(f.writer.pending(),false);
  assert.ok(activities.some(value=>value.pendingOperations===1));assert.ok(activities.every(value=>value.pendingOperations<=1));assert.equal(await f.writer.settled(),true);
 }finally{f.raw.resolve();f.durable.resolve();await old;}
});

test('Still composing/unconfirmed input and failed preservation remain refused; publication rejection is never retried by the DOM drain',async()=>{
 for(const flags of [{composing:true,unconfirmedDOM:false},{composing:false,unconfirmedDOM:true}]){
  const f=fixture();f.state.buffer={...f.state.buffer,...flags};f.writer.changed();const pending=f.writer.flush();f.raw.resolve();f.durable.resolve();
  assert.equal(await pending,false);assert.equal(f.writes.length,0);assert.equal(f.writer.pending(),true);assert.equal(f.recoveries.length,1);assert.equal(f.writer.activity().dirty,true);
 }
 const failed=fixture();const rejected=failed.writer.flush();failed.confirm();failed.raw.reject(Error('Preservation quota refused'));
 assert.equal(await rejected,false);assert.equal(failed.writes.length,0);assert.equal(failed.writer.pending(),true);assert.match(failed.writer.activity().error!,/quota refused/);failed.durable.resolve();
 for(const mode of ['false','throw','rejected-durable'] as const){
  let publications=0;const f=fixture({persist:()=>{publications++;if(mode==='throw')throw Error('CAS refused');return mode==='false'?{result:false}:{result:true,durable:Promise.reject(Error('Quota refused'))};}});
  const pending=f.writer.flush();f.confirm();f.raw.resolve();f.durable.resolve();assert.equal(await pending,false);assert.equal(publications,1,'A canonical refusal never starts another publication');assert.equal(f.recoveries.length,1);assert.equal(f.writer.pending(),true);
 }
});

test('Observed A-B-A cannot publish a drained old buffer, and concurrent newer input cannot be cleared by the one allowed drain',async()=>{
 const f=fixture();const pending=f.writer.flush();f.state.epoch=1;assert.equal(f.writer.current(),false);f.state.epoch=0;assert.equal(f.writer.current(),false);f.source.accountId='B';f.source.api={};f.source.generation=3;f.confirm();assert.equal(f.writer.flush(),pending);f.raw.resolve();f.durable.resolve();
 assert.equal(await pending,true,'The retired source can settle only after preserving its own final confirmed buffer');assert.equal(f.writes.length,0);assert.equal(f.recoveries.length,2);assert.equal(f.recoveries[1].buffer.unconfirmedDOM,false);assert.equal(f.recoveries[1].buffer.markdown,'accepted final');assert.equal(f.writer.activity().source.accountId,'A');assert.equal(f.writer.activity().source.generation,1);assert.equal(f.writer.current(),false);
 const during=deferred(),entered=deferred();let publications=0;
 const newer=fixture({persist:()=>{publications++;entered.resolve();return {result:true,durable:during.promise};}});const operation=newer.writer.flush();
 try{
  newer.confirm();newer.raw.resolve();
  // Observe a bounded number of Promise jobs. On the old product this assertion
  // fails promptly rather than parking on an admission that can never occur.
  for(let i=0;i<12&&publications===0;i++)await Promise.resolve();
  assert.equal(publications,1,'The single confirmed drain must be admitted');await entered.promise;
  newer.state.buffer={...newer.state.buffer,markdown:'newer accepted input'};newer.writer.changed();during.resolve();
  assert.equal(await operation,false);assert.equal(publications,1);assert.equal(newer.writer.activity().dirty,true);assert.equal(newer.writer.pending(),true);assert.equal(newer.recoveries[0].buffer.domText,'accepted final DOM');
 }finally{newer.raw.resolve();newer.durable.resolve();during.resolve();await operation;}
});
