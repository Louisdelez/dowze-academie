/** Pure actual v2 codec. No auth, storage, full graph, HTTP or deployment claim. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {encodeManagedSource, verifyManagedWireSource, parseManagedSourceJson, prepareManagedWrite, ManagedProtocolError, MAX_MANAGED_JSON_NODES, MANAGED_SOURCE_CODEC, MANAGED_WRITE_PROTOCOL} from '../pwa/src/managedNotebookProtocol.ts';
const checksum = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const allowed = () => true;
const uuid = '00000000-0000-4000-8000-000000000001';
const preparation = () => ({actorAccountId: uuid, resourceId: uuid, incarnation: uuid, resourceVersion: 1, writerVersion: 2, idempotencyKey: 'exact-operation-one', canonicalVersion: 3, metadataVersion: 4, canonical: {tiny: 0.000001, text: '📝 e\u0301'}, metadata: {title: 'Original'}});
async function heldDigest(work: (release: () => void) => Promise<void>) {
 const own = Object.getOwnPropertyDescriptor(crypto.subtle, 'digest'), native = crypto.subtle.digest.bind(crypto.subtle);
 let release!: () => void, first = true;
 const gate = new Promise<void>(resolve => {release = resolve;}), originals: Promise<ArrayBuffer>[] = [];
 Object.defineProperty(crypto.subtle, 'digest', {configurable: true, value: (...args: Parameters<SubtleCrypto['digest']>) => {const original = native(...args), result = first ? original.then(async value => {await gate; return value;}) : original; first = false; originals.push(original, result); return result;} });
 let complete: Promise<void> | undefined;
 try {complete = work(release); await complete;}
 finally {release(); await Promise.allSettled(originals); if (complete) await complete.catch(() => {}); if (own) Object.defineProperty(crypto.subtle, 'digest', own); else Reflect.deleteProperty(crypto.subtle, 'digest');}
}
test('Exact UTF8 source hashing preserves JS numeric spelling Unicode and immutable original snapshot', async () => {
 const input = {tiny: 0.000001, exponent: 1e-7, unicode: 'e\u0301 📝', '\ue000': 1, '𐀀': 2}, before = structuredClone(input), result = await encodeManagedSource(input, allowed);
 assert.equal(result.source_json, JSON.stringify(before)); assert.equal(result.sha256, checksum(result.source_json)); assert.ok(result.source_json.includes('0.000001')); assert.ok(Object.isFrozen(result)); assert.deepEqual(input, before);
});
test('Verified pretty source keeps every whitespace byte and does not replace it by normalized JSON', async () => {
 const source_json = '{\n  "tiny": 1e-06, "title": "Étude e\\u0301 📝"\n}\n', result = await verifyManagedWireSource({source_json, sha256: checksum(source_json)}, allowed);
 assert.equal(result.source_json, source_json); assert.notEqual(result.sha256, checksum(JSON.stringify(JSON.parse(source_json)))); assert.ok(Object.isFrozen(result));
 assert.equal(parseManagedSourceJson('{"__proto__":{"safe":true}}').__proto__ instanceof Object, false, 'Decoded keys cannot modify an object prototype');
});
test('Duplicate and escaped duplicate members malformed syntax nonfinite and lone surrogates are rejected', () => {
 for (const text of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"nested":{"a":1,"a":2}}', '{"x":NaN}', '{"x":1e400}', '{"x":' + '9'.repeat(400) + '}', '{"x":"\\ud800"}', '{"\\udfff":1}', '{"x":01}', '{"x":1.}', '{"x":true,}', '[]', '{} trailing']) assert.throws(() => parseManagedSourceJson(text), ManagedProtocolError, text.slice(0, 40));
 const literal = 'literal [ { " quoted and ' + String.fromCharCode(92); assert.equal(parseManagedSourceJson(JSON.stringify({text: literal})).text, literal);
});
test('Depth nodes and UTF8 budgets are explicit and string brackets are opaque', () => {
 const atLimit = '{"x":' + '['.repeat(255) + '0' + ']'.repeat(255) + '}'; assert.ok(parseManagedSourceJson(atLimit));
 assert.throws(() => parseManagedSourceJson('{"x":' + '['.repeat(256) + '0' + ']'.repeat(256) + '}'), ManagedProtocolError);
 const values = '{"x":[' + Array(MAX_MANAGED_JSON_NODES - 2).fill('0').join(',') + ']}'; assert.ok(parseManagedSourceJson(values));
 assert.throws(() => parseManagedSourceJson(values.replace(']}', ',0]}')), ManagedProtocolError);
 const text = '{"x":"é"}'; assert.ok(parseManagedSourceJson(text, Buffer.byteLength(text))); assert.throws(() => parseManagedSourceJson(text, Buffer.byteLength(text) - 1), ManagedProtocolError);
});
test('Encoding rejects lossy values cycles accessors sparse arrays and non-JSON instances', async () => {
 const cycle: Record<string, unknown> = {}; cycle.self = cycle;
 const sparse = Array(2); sparse[0] = 1; Object.defineProperty(sparse, '4294967295', {value: 2, enumerable: true});
 const hidden = {}; Object.defineProperty(hidden, 'hidden', {value: 1}); let getterCalls = 0;
 const getter = {get x() {getterCalls++; return 1;}};
 for (const input of [{x: undefined}, {x: () => 1}, {x: NaN}, {x: Infinity}, {x: BigInt(1)}, {x: new Date()}, {x: Array(2)}, {x: sparse}, {x: Symbol()}, {[Symbol()]: 1}, cycle, getter, hidden]) await assert.rejects(encodeManagedSource(input, allowed), ManagedProtocolError);
 assert.equal(getterCalls, 0);
});
test('Both sources identities and versions are captured before the first real digest await', async () => {
 await heldDigest(async release => {
  const input = preparation(), original = structuredClone(input), pending = prepareManagedWrite(input, allowed);
  input.canonical.text = 'Changed after admission'; input.metadata.title = 'New title'; input.canonicalVersion = 900; input.incarnation = 'ffffffff-ffff-4fff-8fff-ffffffffffff'; release();
  const prepared = await pending, body = JSON.parse(prepared.body);
  assert.equal(body.protocol, MANAGED_WRITE_PROTOCOL); assert.equal(body.source_codec, MANAGED_SOURCE_CODEC); assert.equal(body.canonical.base_version, original.canonicalVersion); assert.equal(body.incarnation, original.incarnation);
  assert.equal(body.canonical.source_json, JSON.stringify(original.canonical)); assert.equal(body.metadata.source_json, JSON.stringify(original.metadata)); assert.equal(prepared.packetSha256, checksum(prepared.body)); assert.ok(Object.isFrozen(prepared)); assert.ok(Object.isFrozen(prepared.canonical)); assert.ok(Object.isFrozen(prepared.metadata));
 });
});
test('Owner epoch ABA or thrown current during a held real digest refuses prepared output', async () => {
 for (const throws of [false, true]) await heldDigest(async release => {
  let epoch = 0, broken = false; const pending = prepareManagedWrite(preparation(), () => {if (broken) throw Error('retired'); return epoch === 0;});
  if (throws) broken = true; else {epoch++; epoch++;} release();
  await assert.rejects(pending, (error: unknown) => error instanceof ManagedProtocolError && error.code === 'managed_authority_changed');
 });
});
test('Invalid resource identities unsafe versions keys and effective budgets refuse the packet', async () => {
 for (const delta of [{resourceId: 'another-note'}, {actorAccountId: 'owner'}, {incarnation: uuid.toUpperCase() + 'A'}, {writerVersion: 0}, {canonicalVersion: 1.5}, {metadataVersion: Number.MAX_SAFE_INTEGER + 1}, {idempotencyKey: 'contains space'}]) await assert.rejects(prepareManagedWrite({...preparation(), ...delta}, allowed), ManagedProtocolError);
 await assert.rejects(prepareManagedWrite(preparation(), allowed, {maxSourceBytes: 10, maxPacketBytes: 1000}), ManagedProtocolError);
 await assert.rejects(prepareManagedWrite(preparation(), allowed, {maxSourceBytes: 1000, maxPacketBytes: 20}), ManagedProtocolError);
});
test('Wire verification refuses altered hash extra members getters or already retired authority', async () => {
 const source_json = '{"a":1}', good = {source_json, sha256: checksum(source_json)};
 await assert.rejects(verifyManagedWireSource({...good, sha256: '0'.repeat(64)}, allowed), (error: unknown) => error instanceof ManagedProtocolError && error.code === 'managed_hash_mismatch');
 await assert.rejects(verifyManagedWireSource({...good, extra: true} as typeof good, allowed), ManagedProtocolError);
 let calls = 0; const getter = {get source_json() {calls++; return source_json;}, sha256: good.sha256}; await assert.rejects(verifyManagedWireSource(getter, allowed), ManagedProtocolError); assert.equal(calls, 0);
 await assert.rejects(verifyManagedWireSource(good, () => false), (error: unknown) => error instanceof ManagedProtocolError && error.code === 'managed_authority_changed');
});
