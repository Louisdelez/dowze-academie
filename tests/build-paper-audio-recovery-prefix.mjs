/** BUILD ONLY. Root runs generated tests in a separate guarded process. */
import {requireBoundedMountedCheck} from './mounted-cleanup.mjs';
requireBoundedMountedCheck();
import {build} from 'vite';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,relative,join,sep} from 'node:path';
import {createHash} from 'node:crypto';
const root=process.cwd(),entry='tests/paper-audio-recovery-prefix.test.ts',out='tests/.paper-audio-recovery-prefix-build';
const hash=value=>createHash('sha256').update(value).digest('hex'),sourceHashes={};
for(const path of ['tests/build-paper-audio-recovery-prefix.mjs','tests/mounted-cleanup.mjs','package.json','node_modules/fake-indexeddb/package.json','node_modules/vite/package.json'])sourceHashes[path]=hash(await readFile(path));
await build({configFile:false,publicDir:false,plugins:[{name:'pin-actual-audio-prefix-sources',enforce:'pre',async transform(_code,id){const clean=id.split('?')[0];if(!clean.startsWith(root+sep)||clean.includes(sep+'node_modules'+sep))return;const path=relative(root,clean),actual=hash(await readFile(clean));if(sourceHashes[path]&&sourceHashes[path]!==actual)throw Error('Audio prefix source changed between module loads: '+path);sourceHashes[path]=actual;}}],build:{ssr:entry,outDir:out,emptyOutDir:false,copyPublicDir:false,minify:false,sourcemap:false,reportCompressedSize:false,rollupOptions:{preserveEntrySignatures:'strict',output:{entryFileNames:'paper-audio-recovery-prefix.test.mjs'}}},logLevel:'error'});
for(const [path,before] of Object.entries(sourceHashes))if(hash(await readFile(resolve(root,path)))!==before)throw Error('Audio prefix source changed during build: '+path);
await mkdir(out,{recursive:true});const bundle=join(out,'paper-audio-recovery-prefix.test.mjs'),manifest={schema:1,kind:'build-only',runtime:'NOTRUN',declaredGroups:2,sourceHashes:Object.fromEntries(Object.entries(sourceHashes).sort(([a],[b])=>a.localeCompare(b))),bundle:{path:bundle,sha256:hash(await readFile(bundle))},command:'bash scripts/run-dell-safe-check.sh -- node --test --test-concurrency=1 '+bundle,scope:'Actual recoverableRecordings/storage over fakeIndexedDB, native cursor/abort observations; no Chromium/audio playback/microphone/performance acceptance.'};await writeFile(join(out,'build-manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({build:'PASS',runtime:'NOTRUN',groups:2,bundle:manifest.bundle,manifest:join(out,'build-manifest.json')}));

