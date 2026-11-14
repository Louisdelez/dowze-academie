import test from 'node:test';
import assert from 'node:assert/strict';
import {createPaperWorkTimer,isPaperWorkTimerCheckpoint,type PaperWorkTimerCheckpoint} from '../src/lib/paperWorkTimer.ts';
const foreground={visible:true,focused:true};
const fixture=(targetMinutes=10)=>{let time=0;const timer=createPaperWorkTimer({clock:()=>time,targetMinutes,foreground});return {timer,at:(value:number)=>{time=value;},sample:(value:number)=>{time=value;return timer.sample();}};};
test('Only running work counts; pause and resume preserve elapsed work without crediting the break',()=>{
 const f=fixture();assert.equal(f.timer.snapshot().status,'idle');f.sample(5000);assert.equal(f.timer.snapshot().activeMs,0);
 f.timer.start();assert.equal(f.sample(35000).activeMs,30000);f.at(50000);assert.equal(f.timer.pause().activeMs,45000);assert.equal(f.timer.snapshot().status,'paused');
 f.sample(500000);assert.equal(f.timer.snapshot().activeMs,45000);assert.equal(f.timer.start().status,'paused');f.timer.resume();assert.equal(f.sample(530000).activeMs,75000);
 assert.equal(f.timer.reset(5).activeMs,0);assert.equal(f.timer.snapshot().remainingMs,300000);assert.equal(f.timer.snapshot().status,'idle');assert.equal(f.sample(550000).activeMs,0);
});
test('An objective finishes exactly at its active duration and requires a reset for a new session',()=>{
 const f=fixture(1);f.timer.start();for(const time of [10000,20000,30000,40000,50000])assert.equal(f.sample(time).status,'running');
 const done=f.sample(70000);assert.deepEqual(done,{status:'complete',targetMinutes:1,activeMs:60000,remainingMs:0,counting:false});
 f.timer.activity();f.timer.resume();f.timer.start();assert.equal(f.sample(80000).activeMs,60000);assert.equal(f.timer.snapshot().status,'complete');f.timer.reset();assert.equal(f.timer.start().status,'running');
});
test('Polling cannot extend the two-minute activity window; new work never backfills the AFK gap',()=>{
 const f=fixture();f.timer.start();for(const time of [30000,60000,90000])f.sample(time);
 assert.equal(f.sample(130000).activeMs,120000);assert.equal(f.timer.snapshot().counting,false);assert.equal(f.sample(160000).activeMs,120000);
 f.at(190000);f.timer.activity();assert.equal(f.timer.snapshot().activeMs,120000);assert.equal(f.sample(200000).activeMs,130000);
});
test('Hidden and unfocused intervals earn no work; returning requires fresh Dowze activity',()=>{
 for(const background of [{visible:false,focused:true},{visible:true,focused:false},{visible:false,focused:false}]){
  const f=fixture();f.timer.start();f.sample(10000);f.at(15000);f.timer.setForeground(background);assert.equal(f.timer.snapshot().counting,false);
  f.sample(80000);f.timer.activity();f.at(120000);f.timer.setForeground(foreground);assert.equal(f.sample(130000).activeMs,10000);assert.equal(f.timer.snapshot().counting,false);
  f.timer.activity();assert.equal(f.sample(140000).activeMs,20000);
 }
});
test('A delayed sample at the suspension threshold is discarded, even after recent activity',()=>{
 const f=fixture();f.timer.start();f.sample(10000);f.timer.activity();assert.equal(f.sample(100000).activeMs,10000);assert.equal(f.timer.snapshot().counting,false);
 assert.equal(f.sample(110000).activeMs,10000);f.timer.activity();assert.equal(f.sample(120000).activeMs,20000);
});
test('A backwards clock cannot count the same interval twice and requires fresh activity after recovery',()=>{
 const f=fixture();f.timer.start();f.sample(30000);assert.equal(f.sample(10000).activeMs,30000);f.timer.activity();assert.equal(f.sample(20000).activeMs,30000);
 assert.equal(f.sample(30000).activeMs,30000);assert.equal(f.sample(40000).activeMs,30000);assert.equal(f.timer.snapshot().counting,false);f.timer.activity();assert.equal(f.sample(50000).activeMs,40000);
});
test('Invalid clocks drop observation without damaging the already recorded work',()=>{
 for(const invalid of [NaN,Infinity,-1,Number.MAX_SAFE_INTEGER+1]){
  const f=fixture();f.timer.start();f.sample(10000);assert.equal(f.sample(invalid).activeMs,10000);assert.equal(f.timer.snapshot().counting,false);
  assert.equal(f.sample(20000).activeMs,10000);f.timer.activity();assert.equal(f.sample(30000).activeMs,20000);
 }
});
test('Reload retains only measured duration and pauses a running checkpoint until explicit resume',()=>{
 const f=fixture();f.timer.start();f.sample(30000);const checkpoint=f.timer.checkpoint();assert.deepEqual(Object.keys(checkpoint).sort(),['activeMs','schema','status','targetMinutes']);
 let time=9000000;const restored=createPaperWorkTimer({clock:()=>time,foreground,restored:checkpoint});assert.equal(restored.snapshot().status,'paused');assert.equal(restored.sample().activeMs,30000);
 restored.start();restored.activity();time+=60000;assert.equal(restored.sample().activeMs,30000);restored.resume();time+=10000;assert.equal(restored.sample().activeMs,40000);
 const complete:PaperWorkTimerCheckpoint={schema:1,targetMinutes:1,activeMs:60000,status:'complete'};assert.equal(createPaperWorkTimer({clock:()=>time,foreground,restored:complete}).resume().status,'complete');
});
test('Default foreground is fail-closed and malformed durations or historical timestamps are rejected',()=>{
 let time=0;const timer=createPaperWorkTimer({clock:()=>time,targetMinutes:1});timer.start();time=10000;assert.equal(timer.sample().activeMs,0);timer.setForeground(foreground);time=20000;assert.equal(timer.sample().activeMs,0);timer.activity();time=30000;assert.equal(timer.sample().activeMs,10000);
 const base={schema:1,targetMinutes:1,activeMs:10000,status:'paused'};assert.equal(isPaperWorkTimerCheckpoint(base),true);
 for(const invalid of [{...base,startedAt:0},{...base,lastActivity:0},{...base,activeMs:-1},{...base,activeMs:60001},{...base,status:'complete'},{...base,status:'idle'},{...base,targetMinutes:1.5},{...base,targetMinutes:721}]){assert.equal(isPaperWorkTimerCheckpoint(invalid),false);assert.throws(()=>createPaperWorkTimer({clock:()=>time,restored:invalid as PaperWorkTimerCheckpoint}));}
 for(const minutes of [0,-1,1.5,Infinity,721])assert.throws(()=>timer.reset(minutes));assert.throws(()=>createPaperWorkTimer({clock:()=>time,targetMinutes:2,restored:base as PaperWorkTimerCheckpoint}));
});
