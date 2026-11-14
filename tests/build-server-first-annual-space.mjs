/** BUILD ONLY. No mounted recipe is executed here. Root runs it separately. */
import {requireBoundedMountedCheck} from './mounted-cleanup.mjs';requireBoundedMountedCheck();
import {build} from 'vite';
import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const repo=await realpath(process.cwd()),out=path.join(repo,'tests/.server-first-annual-space-build'),pins=new Map(),hash=v=>createHash('sha256').update(v).digest('hex');
for(const name of ['package.json','package-lock.json','tests/build-server-first-annual-space.mjs','tests/run-server-first-annual-space.mjs','tests/mounted-cleanup.mjs']){const file=path.join(repo,name),bytes=await readFile(file);pins.set(file,{sha256:hash(bytes),bytes:bytes.length});}
const pin={name:'immutable-annual-inputs',enforce:'pre',async load(id){if(id.includes('?')||!path.isAbsolute(id)||!/\.(?:[cm]?[jt]sx?|json)$/.test(id))return null;const bytes=await readFile(id),old=pins.get(id);if(old&&old.sha256!==hash(bytes))throw Error('Annual input changed during build');pins.set(id,{sha256:hash(bytes),bytes:bytes.length});return {code:bytes.toString('utf8'),map:null};}};
await mkdir(out,{recursive:true});
const built=await build({root:repo,configFile:false,publicDir:false,plugins:[pin],define:{'process.env.NODE_ENV':'"development"'},ssr:{noExternal:true},build:{ssr:'tests/server-first-annual-space-entry.tsx',target:'node22',outDir:out,emptyOutDir:true,copyPublicDir:false,minify:false,sourcemap:false,reportCompressedSize:false,rollupOptions:{preserveEntrySignatures:'strict',output:{entryFileNames:'entry.mjs',inlineDynamicImports:true}}},logLevel:'error'});
const results=Array.isArray(built)?built:[built],chunks=results.flatMap(v=>v.output??[]).filter(v=>v.type==='chunk');if(chunks.length!==1||chunks[0].fileName!=='entry.mjs')throw Error('Annual recipe must remain one actual pinned SSR entry');
for(const id of Object.keys(chunks[0].modules)){const file=id.split('?')[0];if(path.isAbsolute(file)&&/\.(?:[cm]?[jt]sx?|json)$/.test(file)&&!pins.has(file))throw Error('A physical module escaped its input pin');}
for(const [file,pin]of pins){if(hash(await readFile(file))!==pin.sha256)throw Error('Annual build source changed');}
const bytes=await readFile(path.join(out,'entry.mjs')),manifest={schema:1,kind:'actual-server-first-annual-space-build',repo,output:{path:'entry.mjs',sha256:hash(bytes),bytes:bytes.length},inputs:[...pins].map(([path,pin])=>({path,...pin})).sort((a,b)=>a.path.localeCompare(b.path))};await writeFile(path.join(out,'build-manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({status:'BUILD_ONLY',runtime:'NOTRUN',groups:2,outputSHA256:manifest.output.sha256}));
