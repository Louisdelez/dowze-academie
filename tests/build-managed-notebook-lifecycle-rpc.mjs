/** Root executes this only in the frozen isolated client snapshot under guard. */
import {requireBoundedMountedCheck} from './mounted-cleanup.mjs';
requireBoundedMountedCheck();
import {build} from 'vite';
import {readFile,mkdir,writeFile,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const repo=await realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
const out=path.join(repo,'tests/.managed-lifecycle-rpc-build');await mkdir(out,{recursive:true});
if(process.versions.node!=='22.23.2')throw Error('Pinned Node22.23.2 required');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),pins=new Map();
for(const name of ['package-lock.json','package.json','tests/build-managed-notebook-lifecycle-rpc.mjs','tests/mounted-cleanup.mjs']){const file=path.join(repo,name),bytes=await readFile(file);pins.set(file,{bytes,sha256:hash(bytes)});}
const loaded={name:'immutable-build-inputs',enforce:'pre',async load(id){if(id.includes('?'))return null;const file=id;if(!path.isAbsolute(file)||!/\.(?:[cm]?[jt]sx?|json)$/.test(file))return null;const bytes=await readFile(file),old=pins.get(file);if(old&&hash(bytes)!==old.sha256)throw Error('Build input changed while loading: '+file);pins.set(file,{bytes,sha256:hash(bytes)});return {code:bytes.toString('utf8'),map:null};}};
// Use the same installed Vite SSR pipeline as Node7. No esbuild/package install
// is required. Every physical module loaded below is supplied from its pin.
const built=await build({root:repo,configFile:false,publicDir:false,plugins:[loaded],ssr:{noExternal:true},build:{ssr:'tests/managed-notebook-lifecycle-rpc.ts',target:'node22',outDir:out,emptyOutDir:true,copyPublicDir:false,minify:false,sourcemap:false,reportCompressedSize:false,rollupOptions:{preserveEntrySignatures:'strict',output:{entryFileNames:'rpc.mjs',inlineDynamicImports:true}}},logLevel:'error'});
const results=Array.isArray(built)?built:[built],chunks=results.flatMap(result=>result.output??[]);
if(chunks.length!==1||chunks[0].type!=='chunk'||chunks[0].fileName!=='rpc.mjs')throw Error('RPC must remain one pinned standalone ESM output');
for(const id of Object.keys(chunks[0].modules)){const file=id.split('?')[0];if(path.isAbsolute(file)&&/\.(?:[cm]?[jt]sx?|json)$/.test(file)&&!pins.has(file))throw Error('A real bundled module escaped the before/load pin: '+file);}
for(const [name,pin]of pins)if(hash(await readFile(name))!==pin.sha256)throw Error('Build input changed: '+name);
const node=await realpath(process.execPath),output=await readFile(path.join(out,'rpc.mjs'));
const manifest={schema:1,kind:'actual-stage8-lifecycle-rpc-build',repo,node:{path:node,version:process.versions.node,sha256:hash(await readFile(node))},output:{path:'rpc.mjs',bytes:output.length,sha256:hash(output)},inputs:[...pins].map(([name,pin])=>({path:name,sha256:pin.sha256,bytes:pin.bytes.length})).sort((a,b)=>a.path.localeCompare(b.path))};
await writeFile(path.join(out,'rpc-build-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
process.stdout.write(JSON.stringify({kind:manifest.kind,inputs:manifest.inputs.length,outputSHA256:manifest.output.sha256})+'\n');
