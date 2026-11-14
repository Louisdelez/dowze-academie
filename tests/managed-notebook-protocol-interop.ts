/** Pinned Node CLI for private Python interop tests; no database/network/authority. */
import {encodeManagedSource, verifyManagedWireSource, prepareManagedWrite} from '../pwa/src/managedNotebookProtocol.ts';
const MAX_INPUT = 65_536, MAX_OUTPUT = 65_536;
let size = 0; const pieces: Buffer[] = [];
for await (const part of process.stdin) {const bytes = Buffer.from(part); size += bytes.length; if (size > MAX_INPUT) {process.exitCode = 2; break;} pieces.push(bytes);}
try {
 if (size > MAX_INPUT || process.versions.node !== '22.23.2') throw Error('Pinned bounded Node runtime required');
 const input = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(Buffer.concat(pieces))); let result: unknown;
 if (input.action === 'encode') result = await encodeManagedSource(input.value, () => true);
 else if (input.action === 'verify') result = await verifyManagedWireSource(input.source, () => true);
 else if (input.action === 'packet') result = await prepareManagedWrite(input.value, () => true);
 else throw Error('Unknown interop operation');
 const output = JSON.stringify({ok: true, result}); if (Buffer.byteLength(output) > MAX_OUTPUT) throw Error('Output budget'); process.stdout.write(output + '\n');
} catch (error) {process.stdout.write(JSON.stringify({ok: false, code: (error as {code?: string}).code ?? 'interop_failure'}) + '\n'); process.exitCode = 1;}
