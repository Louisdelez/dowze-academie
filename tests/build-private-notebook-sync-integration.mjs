/** BUILD ONLY. Execute the generated Node test in a second guarded command.
 * Never interpret a bundle as runtime acceptance. No live server/browser work. */
import {requireBoundedMountedCheck} from './mounted-cleanup.mjs';
requireBoundedMountedCheck();
import {build} from 'vite';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {resolve,relative,dirname,join,sep} from 'node:path';
import {createHash} from 'node:crypto';
const root=process.cwd(),entry='tests/private-notebook-sync-integration.test.ts',out='tests/.private-notebook-sync-integration-build',hash=value=>createHash('sha256').update(value).digest('hex');
const paths=new Set(['tests/build-private-notebook-sync-integration.mjs','tests/mounted-cleanup.mjs','package.json']);
const visit=async path=>{if(paths.has(path))return;paths.add(path);const source=await readFile(join(root,path),'utf8');for(const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"](\.[^'"]+)['"]/g)){const bare=resolve(root,dirname(path),match[1].split('?')[0]);if(!bare.startsWith(root+sep))throw Error('Source import escapes the exact checkout');let candidate;for(const value of [bare,bare+'.ts',bare+'.tsx',bare+'.js',bare+'.mjs',join(bare,'index.ts')])try{if((await stat(value)).isFile()){candidate=value;break;}}catch{}if(!candidate)throw Error('Unresolved relative source import: '+relative(root,bare));await visit(relative(root,candidate));}};
await visit(entry);const sourceHashes=Object.fromEntries(await Promise.all([...paths].sort().map(async path=>[path,hash(await readFile(path))])));
await build({configFile:false,ssr:{noExternal:['yjs','lib0']},define:{__PRIVATE_FENCE_BUILD_MANIFEST__:JSON.stringify(sourceHashes)},build:{ssr:entry,outDir:out,emptyOutDir:true,copyPublicDir:false,minify:false,sourcemap:false,reportCompressedSize:false,rollupOptions:{output:{entryFileNames:'private-notebook-sync-integration.test.mjs'}}},logLevel:'error'});
const after=Object.fromEntries(await Promise.all(Object.keys(sourceHashes).map(async path=>[path,hash(await readFile(path))])));if(JSON.stringify(after)!==JSON.stringify(sourceHashes))throw Error('Sources changed during the private-fence build');
await mkdir(out,{recursive:true});const bundle=join(out,'private-notebook-sync-integration.test.mjs'),report={kind:'build-only',runtime:'NOTRUN',declaredGroups:11,sourceHashes,bundle:{path:bundle,sha256:hash(await readFile(bundle))},command:'bash scripts/run-dell-safe-check.sh -- node --test --test-concurrency=1 '+bundle,scope:'Actual sync/storage under fakeIndexedDB with explicit fetch/quota/prior-TX seams; no live/private/managed endpoint, browser, native or physical quota proof'};await writeFile(join(out,'build-manifest.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({build:'PASS',runtime:'NOTRUN',declaredGroups:11,bundle:report.bundle,manifest:join(out,'build-manifest.json')}));
