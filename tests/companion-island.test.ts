import test from 'node:test';
import assert from 'node:assert/strict';
import { CompanionIsland, companionSize, companionPosition } from '../src/lib/companionIsland.ts';
import { islandSize, botPosition } from '../src/lib/coucou/layout.ts';
import { Tracked } from '../src/lib/coucou/anim.ts';
import { greetingPose } from '../src/lib/coucou/greetingPose.ts';
test('Dowze lifecycle: greeting, persistent compact pet, click opens',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const m=new CompanionIsland();m.launch();assert.equal(m.mode,'coucou');
 t.mock.timers.tick(4600);assert.equal(m.mode,'coucou');t.mock.timers.tick(600);assert.equal(m.mode,'petit');m.leave();
 t.mock.timers.tick(60000);assert.equal(m.mode,'petit');m.enter();assert.equal(m.mode,'petit');m.click();assert.equal(m.mode,'home');
 m.leave();t.mock.timers.tick(14999);assert.equal(m.mode,'home');t.mock.timers.tick(1);assert.equal(m.mode,'petit');m.dispose();
});
test('Coucou hover cancels collapse; pin and disposal cancel active timers',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const m=new CompanionIsland();m.click();m.leave();t.mock.timers.tick(14000);m.enter();t.mock.timers.tick(1000);assert.equal(m.mode,'home');
 m.leave();m.held=true;t.mock.timers.tick(60000);assert.equal(m.mode,'home');m.held=false;m.leave();t.mock.timers.tick(15000);assert.equal(m.mode,'petit');
 m.dispose();t.mock.timers.tick(60000);assert.equal(m.mode,'petit');
});
test('Actual upstream geometry and shared pet placement',()=>{
 assert.deepEqual(islandSize('hidden','overview'),{w:184,h:0});assert.deepEqual(islandSize('compact','overview'),{w:288,h:32});
 assert.deepEqual(islandSize('expanded','overview'),{w:640,h:160});assert.deepEqual(islandSize('expanded','greeting'),{w:640,h:150});
 assert.deepEqual(botPosition('compact','overview',32),{cx:40,cy:16,diameter:20,opacity:1});
 const p=greetingPose(1.6);assert.ok(p.x<320);assert.ok(p.hb>50);assert.equal(greetingPose(4.6).x,320);
});
test('Upstream spring settles and close curve reaches target without overshoot',()=>{
 const v=new Tracked(288);v.springTo(640);for(let i=0;i<200;i++)v.step(1/60,i*1000/60);assert.equal(v.value,640);assert.equal(v.animating,false);
 v.curveTowards(288,340,0);let old=640;for(let n=0;n<=340;n+=10){v.step(.01,n);assert.ok(v.value<=old+.01&&v.value>=288);old=v.value;}assert.ok(Math.abs(v.value-288)<.001);assert.equal(v.animating,false);
});

test('React lifecycle replay keeps greeting and collapse observable', t => {
 t.mock.timers.enable({apis:['setTimeout']});const m=new CompanionIsland();const states:string[]=[];m.onChange=state=>states.push(state);
 m.launch();m.dispose();m.launch();t.mock.timers.tick(4600);t.mock.timers.tick(600);assert.equal(m.mode,'petit');assert.equal(states.at(-1),'petit');m.dispose();
});

test('Dowze compact pet survives extended inactivity and explicit hiding',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const m=new CompanionIsland();assert.equal(m.mode,'petit');
 m.leave();t.mock.timers.tick(86400000);assert.equal(m.mode,'petit');m.forceHidden();assert.equal(m.mode,'petit');
 assert.deepEqual(companionSize(false,'overview'),{w:64,h:32});assert.deepEqual(companionPosition(false,'overview',32),{cx:32,cy:16,diameter:26,opacity:1});
 m.click();assert.equal(m.mode,'home');m.collapse();t.mock.timers.tick(86400000);assert.equal(m.mode,'petit');m.dispose();
});
