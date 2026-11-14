import { test } from 'node:test';
import assert from 'node:assert/strict';
import { awardSlimeXp, emptySlimeProgress, mergeSlimeProgress, slimeLevel, slimeXp, activeMinuteEligible, isSlimeProgress, xpAtLevel } from '../src/lib/slimeProgress.ts';
const e = (id: string, color = 'blue', kind = 'course') => ({id,color,kind,day:'2026-10-07',at:0}) as any;
test('completed activity rewards once even after uncheck/recheck and colour changes', () => {
  const once = awardSlimeXp(emptySlimeProgress(), [e('lesson1')]);
  const twice = awardSlimeXp(once,[e('lesson1','red')]);
  assert.equal(slimeXp(twice,'blue'),100); assert.equal(slimeXp(twice,'red'),0);
});
test('remote union converges without duplicate XP and keeps work from both devices', () => {
  const a = awardSlimeXp(emptySlimeProgress(),[e('shared'),e('a')]);
  const b = awardSlimeXp(emptySlimeProgress(),[e('shared','red'),e('b','red')]);
  assert.deepEqual(mergeSlimeProgress(a,b),mergeSlimeProgress(b,a));
  assert.equal(slimeXp(mergeSlimeProgress(a,b),'blue')+slimeXp(mergeSlimeProgress(a,b),'red'),300);
});
test('connected-time XP is capped across colours and idle/background/suspended intervals earn none', () => {
  const ledger=awardSlimeXp(emptySlimeProgress(),Array.from({length:4000},(_,i)=>e(`minute-${i.toString().padStart(4,'0')}`,i%2?'blue':'red','active-minute')));
  assert.equal(slimeXp(ledger,'blue')+slimeXp(ledger,'red'),3000);
  const active={visible:true,focused:true,lastInteraction:100000,now:160000,lastSample:100000};
  assert.equal(activeMinuteEligible(active),true);
  for (const changed of [{visible:false},{focused:false},{lastInteraction:0},{lastSample:0}]) assert.equal(activeMinuteEligible({...active,...changed}),false);
});
test('evolution follows XP levels only and malformed progress is rejected', () => {
  assert.equal(slimeLevel(0).level,0); assert.equal(slimeLevel(99).level,0); assert.equal(slimeLevel(100).level,1);
  assert.equal(slimeLevel(225).level,2);
  assert.equal(slimeLevel(xpAtLevel(25)-1).stage,'baby'); assert.equal(slimeLevel(xpAtLevel(25)).stage,'teen'); assert.equal(slimeLevel(xpAtLevel(60)).stage,'adult');
  assert.equal(slimeLevel(xpAtLevel(26)).stage,'teen');
  assert.equal(slimeLevel(xpAtLevel(100)-1).stage,'adult');
  assert.equal(slimeLevel(xpAtLevel(100)).stage,'sage');
  assert.equal(slimeLevel(xpAtLevel(61)).nextEvolution,100);
  assert.equal(isSlimeProgress({schema:1,events:[{...e('x'),kind:'fake'}]}),false);
});

test('daily ceiling applies to all sources and resets next calendar day without lowering previous rewards', () => {
  const first=awardSlimeXp(emptySlimeProgress(),Array.from({length:40},(_,i)=>({...e('course-'+i),at:i})));
  assert.equal(slimeXp(first,'blue'),3000);
  const next=awardSlimeXp(first,[{...e('tomorrow'),day:'2026-10-08',at:100}]);
  assert.equal(slimeXp(next,'blue'),3100);
  const later=awardSlimeXp(next,[{...e('late-red','red'),at:101}]);
  assert.equal(slimeXp(later,'blue'),3100); assert.equal(slimeXp(later,'red'),0);
});
