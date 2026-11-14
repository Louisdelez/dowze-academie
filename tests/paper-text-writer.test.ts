import test from 'node:test';
import assert from 'node:assert/strict';
import {createPaperTextWriter,type PaperTextWriter,type PaperTextWriterSource,type PaperTextWriterBuffer,type PaperTextWriterOptions,type PaperTextWriterActivity} from '../src/lib/paperTextWriter.ts';

const deferred=<T=void>()=>{let resolve!:(value:T)=>void,reject!:(reason:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const scope=():PaperTextWriterSource=>({accountId:'A',spaceId:'year',noteId:'note',editorId:'note-text',api:{},generation:1,serial:1});
const fixture=(overrides:Partial<PaperTextWriterOptions>={})=>{
 const state={live:true,buffer:{markdown:'initial',composing:false,unconfirmedDOM:false,focused:false,caretY:null} as PaperTextWriterBuffer};
 const writes:string[]=[],recoveries:{buffer:Readonly<PaperTextWriterBuffer>;version:number}[]=[],activities:PaperTextWriterActivity[]=[];
 const writer=createPaperTextWriter({source:scope(),initialMarkdown:'initial',current:()=>state.live,read:()=>state.buffer,
  persist:markdown=>{writes.push(markdown);return {result:true,durable:Promise.resolve()};},
  preserve:async(buffer,version)=>{recoveries.push({buffer,version});},onActivity:activity=>activities.push(activity),...overrides});
 return {writer,state,writes,recoveries,activities,edit:(markdown:string)=>{state.buffer={...state.buffer,markdown};writer.changed();}};
};

test('A delayed durable write owns one Promise before all reentrant callbacks and clears only after confirmation',async()=>{
 const gate=deferred(),source=scope();let writer!:PaperTextWriter,fromPersist:Promise<boolean>|undefined,fromActivity:Promise<boolean>|undefined,calls=0;
 const buffer:PaperTextWriterBuffer={markdown:'initial',composing:false,unconfirmedDOM:false,focused:true,caretY:37};
 writer=createPaperTextWriter({source,initialMarkdown:'initial',current:()=>true,read:()=>buffer,
  persist:markdown=>{assert.equal(markdown,'accepted');calls++;assert.equal(writer.activity().pendingOperations,1);fromPersist=writer.flush();return {result:true,durable:gate.promise};},
  preserve:async()=>{throw Error('unexpected recovery');},onActivity:activity=>{assert.equal(activity.source.accountId,'A');if(activity.pendingOperations)fromActivity=writer.flush();}});
 buffer.markdown='accepted';writer.changed();const pending=writer.flush();
 assert.equal(calls,1,'Publication is synchronous');assert.equal(pending,fromPersist);assert.equal(pending,fromActivity);assert.equal(pending,writer.flush());assert.equal(pending,writer.settled());
 assert.equal(writer.pending(),true);assert.equal(writer.activity().dirty,true);gate.resolve();assert.equal(await pending,true);assert.equal(await writer.settled(),true);assert.equal(writer.pending(),false);
});

test('Empty Markdown is accepted input, and every local transaction advances a dirty version',async()=>{
 const f=fixture();f.edit('');assert.equal(f.writer.activity().dirty,true);assert.equal(f.writer.activity().version,1);f.writer.changed();assert.equal(f.writer.activity().version,2);
 assert.equal(await f.writer.settled(),false);assert.equal(await f.writer.flush(),true);assert.deepEqual(f.writes,['']);assert.equal(f.writer.pending(),false);
});

test('Durable rejection is consumed, retains the buffer, refuses acknowledgement, and can be retried',async()=>{
 const gate=deferred();let fail=true;const f=fixture({persist:()=>({result:true,durable:fail?gate.promise:Promise.resolve()})});f.edit('owned text');
 const pending=f.writer.flush();gate.reject(Error('disk full'));assert.equal(await pending,false);assert.equal(await f.writer.settled(),false);assert.equal(f.writer.activity().dirty,true);assert.match(f.writer.activity().error!,/disk full/);
 assert.equal(f.writer.acknowledge('owned text'),false);fail=false;assert.equal(await f.writer.flush(),true);assert.equal(f.writer.activity().error,null);assert.equal(f.writer.pending(),false);
});

test('Sync refusal, legacy Promise refusal and thrown/rejected callbacks never mark accepted text clean',async()=>{
 for(const persist of [()=>({result:false}),()=>({result:Promise.resolve(false)}),()=>{throw Error('publication failed');},()=>({result:Promise.reject(Error('legacy failed'))}),()=>({result:Promise.reject(null)})]){
  const f=fixture({persist});f.edit('local');assert.equal(await f.writer.flush(),false);assert.equal(f.writer.pending(),true);assert.equal(f.writer.activity().dirty,true);assert.ok(f.writer.activity().error);assert.equal(f.recoveries.length,0);
 }
});

test('Legacy callback completion without a durable tail waits for captured recovery storage',async()=>{
 const result=deferred<unknown>(),storage=deferred();let recovered:Readonly<PaperTextWriterBuffer>|undefined;
 const f=fixture({persist:()=>({result:result.promise}),preserve:async buffer=>{recovered=buffer;await storage.promise;}});f.edit('legacy accepted');const pending=f.writer.flush();
 assert.equal(recovered,undefined);result.resolve(true);await Promise.resolve();await Promise.resolve();assert.equal(recovered?.markdown,'legacy accepted');assert.equal(Object.isFrozen(recovered),true);assert.equal(f.writer.pending(),true);
 storage.resolve();assert.equal(await pending,true);assert.equal(f.writer.pending(),false);
});

test('Missing durable acknowledgement uses recovery even for a live synchronous callback',async()=>{
 const f=fixture({persist:()=>({result:undefined})});f.edit('live fallback');assert.equal(await f.writer.flush(),true);assert.equal(f.recoveries.length,1);assert.equal(f.recoveries[0].buffer.markdown,'live fallback');assert.equal(f.recoveries[0].version,1);
});

test('Observed A→B→A retires authority permanently and stale flush preserves only the captured source',async()=>{
 const source=scope(),f=fixture({source});f.edit('old note');source.accountId='B';source.generation=2;
 f.state.live=false;assert.equal(f.writer.current(),false);f.state.live=true;assert.equal(f.writer.current(),false);
 assert.equal(await f.writer.flush(),true);assert.deepEqual(f.writes,[]);assert.equal(f.recoveries.length,1);assert.equal(f.writer.activity().source.accountId,'A');assert.equal(f.writer.activity().source.generation,1);assert.equal(f.writer.activity().retired,true);assert.equal(Object.isFrozen(f.writer.activity().source),true);
});

test('Retirement failure retains dirty input and supports a later durable retry without calling persist',async()=>{
 let unavailable=true;const f=fixture({preserve:async()=>{if(unavailable)throw Error('recovery failed');}});f.edit('late buffer');
 assert.equal(await f.writer.retire(),false);assert.equal(f.writer.current(),false);assert.equal(f.writer.pending(),true);assert.match(f.writer.activity().error!,/recovery failed/);assert.equal(f.writer.activity().dirty,true);
 unavailable=false;assert.equal(await f.writer.retire(),true);assert.equal(f.writer.pending(),false);assert.equal(f.writes.length,0);
});

test('Active IME and unconfirmed DOM preserve raw data but cannot confirm settlement or retirement',async()=>{
 for(const flags of [{composing:true,unconfirmedDOM:false},{composing:false,unconfirmedDOM:true}]){
  const f=fixture();f.state.buffer={...f.state.buffer,...flags,domText:'visible composition'};f.writer.probe();
  assert.equal(f.writer.pending(),true);assert.equal(await f.writer.settled(),false);assert.equal(f.writer.acknowledge('initial'),false);assert.equal(await f.writer.retire(),false);
  assert.equal(f.writes.length,0);assert.equal(f.recoveries[0].buffer.domText,'visible composition');assert.equal(f.writer.activity().dirty,true);
  f.state.buffer={...f.state.buffer,composing:false,unconfirmedDOM:false,markdown:'composition committed'};f.writer.changed();assert.equal(await f.writer.flush(),true);assert.equal(f.writer.pending(),false);
 }
});

test('Input or raw IME state changed during await refuses the old version and keeps the new buffer',async()=>{
 for(const change of ['transaction','unobserved Markdown','unconfirmed DOM'] as const){
  const gate=deferred();let first=true;const f=fixture({persist:()=>({result:true,durable:first?(first=false,gate.promise):Promise.resolve()})});f.edit('first');const pending=f.writer.flush();
  if(change==='transaction')f.edit('second');else if(change==='unobserved Markdown')f.state.buffer={...f.state.buffer,markdown:'second'};else f.state.buffer={...f.state.buffer,unconfirmedDOM:true,domText:'raw input'};
  gate.resolve();assert.equal(await pending,false);assert.equal(f.writer.activity().dirty,true);assert.equal(f.writer.pending(),true);
  f.state.buffer={...f.state.buffer,composing:false,unconfirmedDOM:false,markdown:'second'};f.writer.changed();assert.equal(await f.writer.flush(),true);assert.equal(f.writer.pending(),false);
 }
});

test('Retiring during an accepted write shares its operation and never cancels its captured durable tail',async()=>{
 const gate=deferred();const f=fixture({persist:()=>({result:true,durable:gate.promise})});f.edit('accepted before scope change');const pending=f.writer.flush();assert.equal(f.writer.retire(),pending);assert.equal(f.writer.current(),false);assert.equal(f.writer.activity().pendingOperations,1);
 gate.resolve();assert.equal(await pending,true);assert.equal(f.writer.activity().retired,true);assert.equal(f.writer.pending(),false);assert.equal(f.recoveries.length,0);
});

test('Remote acknowledgement after a confirmed local version and initial normalization cannot override local dirty input',async()=>{
 const f=fixture();f.state.buffer={...f.state.buffer,markdown:'initial\n'};f.writer.probe();assert.equal(f.writer.activity().version,0);assert.equal(f.writer.acknowledge('initial\n'),true);
 f.edit('local');assert.equal(f.writer.acknowledge('local'),false);assert.equal(await f.writer.flush(),true);assert.equal(f.writer.pending(),false);
 const version=f.writer.activity().version;f.state.buffer={...f.state.buffer,markdown:'confirmed external'};assert.equal(f.writer.acknowledge('confirmed external'),true);assert.equal(f.writer.activity().version,version);assert.equal(f.writer.pending(),false);
 f.state.buffer={...f.state.buffer,markdown:'unreported typing'};f.writer.probe();assert.equal(f.writer.acknowledge('unreported typing'),false);assert.equal(f.writer.activity().dirty,true);
});

test('Focus, caret, composition and pending activity carry immutable source identity; observer errors do not break saves',async()=>{
 const updates:PaperTextWriterActivity[]=[];const f=fixture({onActivity:activity=>{updates.push(activity);throw Error('display failed');}});f.writer.probe();f.state.buffer={...f.state.buffer,focused:true,caretY:780};f.writer.probe();assert.equal(f.writer.activity().dirty,false);
 f.edit('edited');assert.equal(await f.writer.flush(),true);assert.ok(updates.some(a=>a.focused&&a.caretY===780));assert.ok(updates.some(a=>a.pendingOperations===1));assert.ok(updates.some(a=>a.dirty));assert.equal(updates.at(-1)?.pendingOperations,0);assert.ok(updates.every(a=>Object.isFrozen(a)&&Object.isFrozen(a.source)));
});

test('Unreadable editor state is conservatively pending, and restoring reads permits captured recovery',async()=>{
 let unavailable=true;const f=fixture({read:()=>{if(unavailable)throw Error('editor unreadable');return {markdown:'recovered',composing:false,unconfirmedDOM:false,focused:false,caretY:null};}});
 assert.equal(f.writer.pending(),true);assert.equal(await f.writer.flush(),false);assert.match(f.writer.activity().error!,/editor unreadable/);unavailable=false;assert.equal(await f.writer.retire(),true);assert.equal(f.writes.length,0);assert.equal(f.recoveries[0].buffer.markdown,'recovered');
});

test('An early durable rejection remains observed while a legacy result is pending',async()=>{
 const result=deferred<unknown>(),storage=deferred();const f=fixture({persist:()=>({result:result.promise,durable:storage.promise})});f.edit('legacy pending');const pending=f.writer.flush();
 storage.reject(Error('early storage failure'));await Promise.resolve();await Promise.resolve();assert.equal(f.writer.activity().pendingOperations,1);result.resolve(true);
 assert.equal(await pending,false);assert.match(f.writer.activity().error!,/early storage failure/);assert.equal(f.writer.activity().dirty,true);
});

test('An old completion observer can start the newer flush without its Promise being cleared by the old operation',async()=>{
 const oldGate=deferred(),newGate=deferred();let writer!:PaperTextWriter,newer:Promise<boolean>|undefined,calls=0,admitted=false;
 const buffer:PaperTextWriterBuffer={markdown:'initial',composing:false,unconfirmedDOM:false,focused:false,caretY:null};
 writer=createPaperTextWriter({source:scope(),initialMarkdown:'initial',current:()=>true,read:()=>buffer,
  persist:markdown=>{calls++;return {result:true,durable:markdown==='one'?oldGate.promise:newGate.promise};},preserve:async()=>{},
  onActivity:activity=>{if(!admitted&&activity.version>1&&activity.dirty&&activity.pendingOperations===0){admitted=true;newer=writer.flush();}}});
 buffer.markdown='one';writer.changed();const older=writer.flush();buffer.markdown='two';writer.changed();oldGate.resolve();assert.equal(await older,false);
 assert.ok(newer);assert.equal(calls,2);assert.equal(writer.flush(),newer);assert.equal(writer.activity().pendingOperations,1);newGate.resolve();assert.equal(await newer,true);assert.equal(writer.pending(),false);
});
