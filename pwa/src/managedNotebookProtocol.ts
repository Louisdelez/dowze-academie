/** Exact UTF-8 wire codec only. It grants no session, resource, storage or write authority. */
export const MANAGED_SOURCE_CODEC = 'source-json-utf8-sha256@1' as const;
export const MANAGED_WRITE_PROTOCOL = 'dowze-managed-notebook-write@2' as const;
export const MAX_MANAGED_SOURCE_BYTES = 16 * 1024 * 1024;
export const MAX_MANAGED_PACKET_BYTES = 4 * MAX_MANAGED_SOURCE_BYTES + 65_536;
export const MAX_MANAGED_JSON_DEPTH = 256;
export const MAX_MANAGED_JSON_NODES = 500_000;
const SHA256 = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const encoder = new TextEncoder();
export type ManagedJson = null | boolean | number | string | ManagedJson[] | {[key: string]: ManagedJson};
export interface ManagedWireSource {readonly source_json: string; readonly sha256: string}
export interface ManagedWritePreparation {
 readonly actorAccountId: string; readonly resourceId: string; readonly incarnation: string;
 readonly resourceVersion: number; readonly writerVersion: number; readonly idempotencyKey: string;
 readonly canonicalVersion: number; readonly metadataVersion: number;
 readonly canonical: unknown; readonly metadata: unknown;
}
export interface PreparedManagedWrite {
 readonly actorAccountId: string; readonly resourceId: string; readonly idempotencyKey: string;
 readonly body: string; readonly packetSha256: string;
 readonly canonical: ManagedWireSource; readonly metadata: ManagedWireSource;
}
export class ManagedProtocolError extends Error {
 readonly code: 'invalid_managed_json' | 'managed_json_budget' | 'invalid_managed_packet' | 'managed_hash_mismatch' | 'managed_authority_changed';
 constructor(code: ManagedProtocolError['code']) {super(code); this.code = code; this.name = 'ManagedProtocolError';}
}
const fail: (code: ManagedProtocolError['code']) => never = code => {throw new ManagedProtocolError(code);};
function validUnicode(text: string) {
 for (let index = 0; index < text.length; index++) {
  const code = text.charCodeAt(index);
  if (code >= 0xd800 && code <= 0xdbff) {const next = text.charCodeAt(++index); if (!(next >= 0xdc00 && next <= 0xdfff)) return false;}
  else if (code >= 0xdc00 && code <= 0xdfff) return false;
 }
 return true;
}
function limit(value: number, maximum: number) {if (!Number.isSafeInteger(value) || value < 2 || value > maximum) fail('managed_json_budget'); return value;}
function bytes(text: string, maximum: number) {
 if (!validUnicode(text)) fail('invalid_managed_json');
 if (text.length > maximum) fail('managed_json_budget');
 const result = encoder.encode(text); if (result.length > maximum) fail('managed_json_budget'); return result;
}
/** JSON.parse alone silently accepts duplicate members. This bounded parser does not. */
export function parseManagedSourceJson(text: string, maximum = MAX_MANAGED_SOURCE_BYTES): {[key: string]: ManagedJson} {
 limit(maximum, MAX_MANAGED_SOURCE_BYTES); if (typeof text !== 'string') fail('invalid_managed_json'); bytes(text, maximum);
 let index = 0, nodes = 0;
 const whitespace = () => {while (index < text.length && /[ \t\n\r]/.test(text[index])) index++;};
 const string = (): string => {
  const start = index++; let escaped = false;
  while (index < text.length) {
   const character = text[index++];
   if (escaped) {escaped = false; continue;}
   if (character === '\\') {escaped = true; continue;}
   if (character === '"') {let result: string; try {result = JSON.parse(text.slice(start, index));} catch {return fail('invalid_managed_json');} if (!validUnicode(result)) fail('invalid_managed_json'); return result;}
  }
  return fail('invalid_managed_json');
 };
 const value = (depth: number): ManagedJson => {
  whitespace(); if (++nodes > MAX_MANAGED_JSON_NODES) fail('managed_json_budget');
  const character = text[index];
  if (character === '"') return string();
  if (character === '{' || character === '[') {
   if (depth >= MAX_MANAGED_JSON_DEPTH) fail('managed_json_budget'); index++; whitespace();
   if (character === '[') {const result: ManagedJson[] = []; if (text[index] === ']') {index++; return result;}
    while (true) {result.push(value(depth + 1)); whitespace(); if (text[index] === ']') {index++; return result;} if (text[index++] !== ',') fail('invalid_managed_json');}
   }
   const result = Object.create(null) as {[key: string]: ManagedJson}, names = new Set<string>();
   if (text[index] === '}') {index++; return result;}
   while (true) {whitespace(); if (text[index] !== '"') fail('invalid_managed_json'); const name = string(); if (names.has(name)) fail('invalid_managed_json'); names.add(name); whitespace(); if (text[index++] !== ':') fail('invalid_managed_json'); result[name] = value(depth + 1); whitespace(); if (text[index] === '}') {index++; return result;} if (text[index++] !== ',') fail('invalid_managed_json');}
  }
  for (const [literal, result] of [['true', true], ['false', false], ['null', null]] as const) if (text.startsWith(literal, index)) {index += literal.length; return result;}
  const start = index; if (text[index] === '-') index++;
  if (text[index] === '0') index++; else {if (!(text[index] >= '1' && text[index] <= '9')) fail('invalid_managed_json'); while (text[index] >= '0' && text[index] <= '9') index++;}
  if (text[index] === '.') {index++; const first = index; while (text[index] >= '0' && text[index] <= '9') index++; if (index === first) fail('invalid_managed_json');}
  if (text[index] === 'e' || text[index] === 'E') {index++; if (text[index] === '+' || text[index] === '-') index++; const first = index; while (text[index] >= '0' && text[index] <= '9') index++; if (index === first) fail('invalid_managed_json');}
  const number = Number(text.slice(start, index)); if (!Number.isFinite(number)) fail('invalid_managed_json'); return number;
 };
 const result = value(0); whitespace();
 if (index !== text.length || result === null || typeof result !== 'object' || Array.isArray(result)) fail('invalid_managed_json');
 return result as {[key: string]: ManagedJson};
}
/** Reject lossy JSON.stringify inputs (getters, toJSON, holes, cycles, undefined). */
function serializeSource(input: unknown, maximum: number): string {
 const active = new WeakSet<object>(); let nodes = 0;
 const visit = (item: unknown, depth: number) => {
  if (++nodes > MAX_MANAGED_JSON_NODES) fail('managed_json_budget');
  if (typeof item === 'string') {if (!validUnicode(item)) fail('invalid_managed_json'); return;}
  if (item === null || typeof item === 'boolean') return;
  if (typeof item === 'number') {if (!Number.isFinite(item)) fail('invalid_managed_json'); return;}
  if (!item || typeof item !== 'object' || active.has(item)) fail('invalid_managed_json');
  if (depth >= MAX_MANAGED_JSON_DEPTH) fail('managed_json_budget');
  const array = Array.isArray(item), prototype = Object.getPrototypeOf(item);
  if (prototype !== (array ? Array.prototype : Object.prototype) && !(prototype === null && !array)) fail('invalid_managed_json');
  if (Object.getOwnPropertySymbols(item).length) fail('invalid_managed_json');
  const descriptors = Object.getOwnPropertyDescriptors(item), names = Object.keys(descriptors);
  if (array && (names.length !== (item as unknown[]).length + 1 || names.some(name => name !== 'length' && (!/^(0|[1-9][0-9]*)$/.test(name) || !Number.isSafeInteger(Number(name)) || Number(name) >= (item as unknown[]).length)))) fail('invalid_managed_json');
  active.add(item);
  for (const name of names) {if (array && name === 'length') continue; const descriptor = descriptors[name]; if (!validUnicode(name) || !descriptor.enumerable || !('value' in descriptor)) fail('invalid_managed_json'); visit(descriptor.value, depth + 1);}
  active.delete(item);
 };
 if (!input || typeof input !== 'object' || Array.isArray(input)) fail('invalid_managed_json');
 visit(input, 0); const text = JSON.stringify(input); if (typeof text !== 'string') fail('invalid_managed_json'); bytes(text, maximum); return text;
}
function authority(current: () => boolean) {let revoked = false; return () => {try {if (!current()) revoked = true;} catch {revoked = true;} if (revoked) fail('managed_authority_changed');};}
async function digest(raw: Uint8Array<ArrayBuffer>, check: () => void) {check(); const value = await crypto.subtle.digest('SHA-256', raw); check(); return Array.from(new Uint8Array(value), byte => byte.toString(16).padStart(2, '0')).join('');}
export async function encodeManagedSource(input: unknown, current: () => boolean, maximum = MAX_MANAGED_SOURCE_BYTES): Promise<ManagedWireSource> {
 const check = authority(current); check(); limit(maximum, MAX_MANAGED_SOURCE_BYTES); const source_json = serializeSource(input, maximum), raw = bytes(source_json, maximum);
 const sha256 = await digest(raw, check); check(); return Object.freeze({source_json, sha256});
}
export async function verifyManagedWireSource(input: ManagedWireSource, current: () => boolean, maximum = MAX_MANAGED_SOURCE_BYTES): Promise<ManagedWireSource> {
 const check = authority(current); check(); limit(maximum, MAX_MANAGED_SOURCE_BYTES);
 if (!input || typeof input !== 'object' || (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null) || Object.getOwnPropertySymbols(input).length) fail('invalid_managed_packet');
 const fields = Object.getOwnPropertyDescriptors(input), keys = Object.keys(fields).sort();
 if (keys.join(',') !== 'sha256,source_json' || keys.some(key => !('value' in fields[key]) || !fields[key].enumerable)) fail('invalid_managed_packet');
 const source_json: unknown = fields.source_json.value, expected: unknown = fields.sha256.value;
 if (typeof source_json !== 'string' || typeof expected !== 'string' || !SHA256.test(expected)) fail('invalid_managed_packet');
 parseManagedSourceJson(source_json, maximum); const sha256 = await digest(bytes(source_json, maximum), check);
 if (sha256 !== expected) fail('managed_hash_mismatch'); check(); return Object.freeze({source_json, sha256});
}
/** Snapshot BOTH sources and every identity synchronously, before the first await. */
export async function prepareManagedWrite(input: ManagedWritePreparation, current: () => boolean, limits: {maxSourceBytes: number; maxPacketBytes: number} = {maxSourceBytes: MAX_MANAGED_SOURCE_BYTES, maxPacketBytes: MAX_MANAGED_PACKET_BYTES}): Promise<PreparedManagedWrite> {
 const check = authority(current); check();
 const maxSource = limit(limits.maxSourceBytes, MAX_MANAGED_SOURCE_BYTES), maxPacket = limit(limits.maxPacketBytes, MAX_MANAGED_PACKET_BYTES);
 const {actorAccountId, resourceId, incarnation, resourceVersion, writerVersion, idempotencyKey, canonicalVersion, metadataVersion} = input;
 if (![actorAccountId, resourceId, incarnation].every(value => typeof value === 'string' && UUID.test(value)) || ![resourceVersion, writerVersion, canonicalVersion, metadataVersion].every(value => Number.isSafeInteger(value) && value >= 1) || typeof idempotencyKey !== 'string' || !/^[\x21-\x7e]{1,128}$/.test(idempotencyKey)) fail('invalid_managed_packet');
 const canonicalText = serializeSource(input.canonical, maxSource), metadataText = serializeSource(input.metadata, maxSource);
 const canonicalRaw = bytes(canonicalText, maxSource), metadataRaw = bytes(metadataText, maxSource);
 const canonical = Object.freeze({source_json: canonicalText, sha256: await digest(canonicalRaw, check)});
 const metadata = Object.freeze({source_json: metadataText, sha256: await digest(metadataRaw, check)});
 const body = JSON.stringify({protocol: MANAGED_WRITE_PROTOCOL, source_codec: MANAGED_SOURCE_CODEC, incarnation, resource_version: resourceVersion, writer_version: writerVersion, canonical: {base_version: canonicalVersion, ...canonical}, metadata: {base_version: metadataVersion, ...metadata}});
 const packetSha256 = await digest(bytes(body, maxPacket), check); check();
 return Object.freeze({actorAccountId, resourceId, idempotencyKey, body, packetSha256, canonical, metadata});
}
