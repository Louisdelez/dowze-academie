import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startupUpdates } from '../src/lib/startupUpdates.ts';
import { AppUpdates } from '../src/lib/appUpdates.ts';
function fixture(fail = false) {
  const calls: string[] = [];
  const updates = new AppUpdates({ check: async () => { calls.push('check'); return { version: '0.6.3', download: async progress => { calls.push('download'); progress({ event:'Started', data:{contentLength:100} }); progress({ event:'Progress',data:{chunkLength:40} }); assert.equal(updates.snapshot().received,40); progress({ event:'Progress',data:{chunkLength:60} }); if (fail) throw Error('bad signature'); }, install: async () => { throw Error('interactive install must not run'); }, close: async () => {} }; }, prepare: async () => {}, restart: async () => {} });
  return { updates, calls, apply: async () => { calls.push('apply'); } };
}
test('startup applies cache, downloads with real byte progress, then applies verified update', async () => {
  const f=fixture(); await startupUpdates(f.updates,true,f.apply); assert.deepEqual(f.calls,['apply','check','download','apply']); assert.equal(f.updates.snapshot().received,100); assert.equal(f.updates.snapshot().total,100);
});
test('offline startup can apply an already signed cache without requesting the network', async () => {
  const f=fixture(); await startupUpdates(f.updates,false,f.apply); assert.deepEqual(f.calls,['apply']);
});
test('failed verification cannot install newly downloaded bytes', async () => {
  const f=fixture(true); await startupUpdates(f.updates,true,f.apply); assert.deepEqual(f.calls,['apply','check','download']); assert.equal(f.updates.snapshot().phase,'error');
});
