/** Direct Node22 test; deterministic clock, no real wait/interval or product replacement. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {continuousSync} from '../src/lib/continuousSync.ts';

type Timer={at:number;every:number;callback:(...args:unknown[])=>void;args:unknown[]};
class Clock{
 now=0;sequence=0;tasks=new Map<number,Timer>();saved=new Map<string,PropertyDescriptor|undefined>();dateNow=Object.getOwnPropertyDescriptor(Date,'now')!;
 install(){
  const replace=(name:string,value:unknown)=>{this.saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});};
  const add=(callback:(...args:unknown[])=>void,ms:number,args:unknown[],every:boolean)=>{const delay=Math.max(1,Number(ms)||0),id=++this.sequence;this.tasks.set(id,{at:this.now+delay,every:every?delay:0,callback,args});return id;};
  replace('setTimeout',(callback:(...args:unknown[])=>void,ms=0,...args:unknown[])=>add(callback,ms,args,false));
  replace('setInterval',(callback:(...args:unknown[])=>void,ms=0,...args:unknown[])=>add(callback,ms,args,true));
  replace('clearTimeout',(id:unknown)=>{this.tasks.delete(Number(id));});replace('clearInterval',(id:unknown)=>{this.tasks.delete(Number(id));});
  Object.defineProperty(Date,'now',{...this.dateNow,value:()=>this.now});
 }
 advance(ms:number){
  const target=this.now+ms;let steps=0;
  for(;;){const next=[...this.tasks].filter(([,t])=>t.at<=target).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!next)break;
   assert.ok(++steps<=1000,'Finite deterministic fixture callbacks');const [id,t]=next;this.now=t.at;if(t.every)t.at+=t.every;else this.tasks.delete(id);t.callback(...t.args);
  }this.now=target;
 }
 restore(){Object.defineProperty(Date,'now',this.dateNow);for(const [name,descriptor]of this.saved)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);}
}
type Job={work:Promise<void>;resolve:()=>void;reject:(error:unknown)=>void;terminal:boolean;at:number};
async function using(body:(f:{clock:Clock;calls:Job[];errors:unknown[];make:(options?:Parameters<typeof continuousSync>[2])=>ReturnType<typeof continuousSync>;finish:(job:Job,error?:unknown)=>Promise<void>})=>Promise<void>){
 const clock=new Clock(),calls:Job[]=[],errors:unknown[]=[],pending=new Set<Promise<void>>(),controllers:ReturnType<typeof continuousSync>[]=[];clock.install();
 const run=()=>{let yes!:()=>void,no!:(error:unknown)=>void;const work=new Promise<void>((resolve,reject)=>{yes=resolve;no=reject;}),job:Job={work,terminal:false,at:clock.now,resolve:()=>{if(!job.terminal){job.terminal=true;yes();}},reject:error=>{if(!job.terminal){job.terminal=true;no(error);}}};calls.push(job);pending.add(work);void work.then(()=>{pending.delete(work);},()=>{pending.delete(work);});return work;};
 const finish=async(job:Job,error?:unknown)=>{if(error===undefined)job.resolve();else job.reject(error);await job.work.catch(()=>{});await Promise.resolve();};
 try{await body({clock,calls,errors,make:options=>{const value=continuousSync(run,error=>{errors.push(error);},options);controllers.push(value);return value;},finish});}
 finally{try{for(const value of controllers)value.stop();for(const job of calls)job.resolve();await Promise.allSettled([...pending]);await Promise.resolve();assert.equal(pending.size,0,'Every actual run Promise is terminal');assert.equal(clock.tasks.size,0,'All fake timers/intervals are removed, not unrefed');}finally{clock.restore();}}
}

test('Automatic polls during a held run do not force an immediate extra pass; the next normal poll still runs',()=>using(async f=>{
 const sync=f.make({interval:3000});sync.request(true);assert.equal(f.calls.length,1);f.clock.advance(10000);assert.equal(f.calls.length,1,'No overlapping run');
 await f.finish(f.calls[0]);assert.equal(f.calls.length,1,'Only automatic polls occurred: release must become idle');
 f.clock.advance(1999);assert.equal(f.calls.length,1);f.clock.advance(1);assert.equal(f.calls.length,2);assert.equal(f.calls[1].at,12000);await f.finish(f.calls[1]);assert.deepEqual(f.errors,[]);
}));

test('An edit requested during a held run keeps one extra pass; stop cancels another pending edit',()=>using(async f=>{
 const sync=f.make({delay:500,interval:3000});sync.request(true);f.clock.advance(100);sync.request();sync.request();f.clock.advance(500);assert.equal(f.calls.length,1);
 await f.finish(f.calls[0]);assert.equal(f.calls.length,2,'Debounced edit must survive the running guard without any automatic poll');assert.equal(f.calls[1].at,600);
 sync.request();sync.stop();await f.finish(f.calls[1]);f.clock.advance(30000);assert.equal(f.calls.length,2,'Stop cancels the pending edit and poll');assert.deepEqual(f.errors,[]);
}));

test('Immediate focus/online requests during a held run coalesce into one extra pass and remain stoppable',()=>using(async f=>{
 const sync=f.make({interval:3000});sync.request(true);f.clock.advance(100);sync.request(true);sync.request(true);assert.equal(f.calls.length,1);
 await f.finish(f.calls[0]);assert.equal(f.calls.length,2,'Explicit immediate requests must remain pending while running');assert.equal(f.calls[1].at,100);
 sync.request(true);sync.stop();await f.finish(f.calls[1]);f.clock.advance(30000);assert.equal(f.calls.length,2);assert.deepEqual(f.errors,[]);
}));

test('Ordinary retry backoff and exponential delay survive idle polls; stop cancels a genuinely pending retry',()=>using(async f=>{
 const sync=f.make({interval:1000,retryDelay:2000});const first=Error('Actual held run refusal'),second=Error('Actual retry refusal');sync.request(true);sync.request(true);
 await f.finish(f.calls[0],first);assert.deepEqual(f.errors,[first]);f.clock.advance(1999);assert.equal(f.calls.length,1);f.clock.advance(1);assert.equal(f.calls.length,2);assert.equal(f.calls[1].at,2000);
 await f.finish(f.calls[1],second);assert.deepEqual(f.errors,[first,second]);f.clock.advance(3999);assert.equal(f.calls.length,2,'Second refusal waits the doubled backoff despite polls');sync.stop();f.clock.advance(60000);assert.equal(f.calls.length,2,'A pending retry cannot restart after stop');
}));

test('HTTP429 retains its full fixed backoff without skipping the eventual normal retry',()=>using(async f=>{
 const sync=f.make({interval:1000,retryDelay:1}),limited={status:429};sync.request(true);await f.finish(f.calls[0],limited);f.clock.advance(59999);assert.equal(f.calls.length,1);f.clock.advance(1);assert.equal(f.calls.length,2);assert.equal(f.calls[1].at,60000);sync.stop();await f.finish(f.calls[1]);assert.deepEqual(f.errors,[limited]);
}));
