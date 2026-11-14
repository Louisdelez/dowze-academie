/** BUILD ONLY. No test/process/server starts here. Root runs the emitted Node
 * test in a second bounded command; compilation is never runtime acceptance. */
import {requireBoundedMountedCheck} from './mounted-cleanup.mjs';
requireBoundedMountedCheck();
import {build} from 'vite';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {resolve,relative,dirname,join,sep} from 'node:path';
import {createHash} from 'node:crypto';
const root=process.cwd(),entry='tests/managed-notebook-media-compact.test.ts',out='tests/.managed-notebook-media-build',sha=value=>createHash('sha256').update(value).digest('hex');
const paths=new Set(['tests/build-managed-notebook-media.mjs','tests/mounted-cleanup.mjs','package.json','package-lock.json']);
async function visit(path){if(paths.has(path))return;paths.add(path);const source=await readFile(join(root,path),'utf8');for(const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"](\.[^'"]+)['"]/g)){const bare=resolve(root,dirname(path),match[1].split('?')[0]);if(!bare.startsWith(root+sep))throw Error('Source import escapes exact checkout');let candidate;for(const value of [bare,bare+'.ts',bare+'.tsx',bare+'.js',bare+'.mjs',join(bare,'index.ts')])try{if((await stat(value)).isFile()){candidate=value;break;}}catch{}if(!candidate)throw Error('Unresolved relative source import: '+relative(root,bare));await visit(relative(root,candidate));}}
await visit(entry);const sourceHashes=Object.fromEntries(await Promise.all([...paths].sort().map(async path=>[path,sha(await readFile(join(root,path)))])));
await build({configFile:false,ssr:{noExternal:['yjs','lib0']},build:{ssr:entry,outDir:out,emptyOutDir:true,copyPublicDir:false,minify:false,sourcemap:false,reportCompressedSize:false,rollupOptions:{preserveEntrySignatures:'strict',output:{entryFileNames:'managed-notebook-media.test.mjs'}}},logLevel:'error'});
for(const[path,expected]of Object.entries(sourceHashes))if(sha(await readFile(join(root,path)))!==expected)throw Error('Source changed during build: '+path);
await mkdir(out,{recursive:true});const bundle=join(out,'managed-notebook-media.test.mjs'),manifest={kind:'build-only',runtime:'NOTRUN',declaredGroups:6,sourceHashes,bundle:{path:bundle,sha256:sha(await readFile(bundle))},command:'bash scripts/run-dell-safe-check.sh -- node --test tests/.managed-notebook-media-build/managed-notebook-media.test.mjs',scope:'Actual production App caller controller/local trash/managed admission/ApiClient/closed Fetch transport/native fakeIndexedDB, explicitly synthetic HTTP ledger. No deployed server/native vault/physical GUI/30-day wait.'};await writeFile(join(out,'build-manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({build:'PASS',runtime:'NOTRUN',declaredGroups:6,bundle:manifest.bundle,manifest:join(out,'build-manifest.json')}));
