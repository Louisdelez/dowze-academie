/** BUILD ONLY. Execute the generated Node test in a second guarded command.
 * Never interpret a bundle as runtime acceptance. No live server/browser work. */
import {requireBoundedMountedCheck} from './mounted-cleanup.mjs';
requireBoundedMountedCheck();
import {build} from 'vite';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {resolve,relative,dirname,join,sep} from 'node:path';
import {createHash} from 'node:crypto';
const root=process.cwd(),entry='tests/notebook-library-lifecycle-entry.tsx',out='tests/.notebook-library-lifecycle-build',hash=value=>createHash('sha256').update(value).digest('hex');
const paths=new Set(['tests/build-notebook-library-lifecycle.mjs','tests/run-notebook-library-lifecycle.mjs','tests/mounted-cleanup.mjs','package.json']);
const visit=async path=>{if(paths.has(path))return;paths.add(path);const source=await readFile(join(root,path),'utf8');for(const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"](\.[^'"]+)['"]/g)){const bare=resolve(root,dirname(path),match[1].split('?')[0]);if(!bare.startsWith(root+sep))throw Error('Source import escapes the exact checkout');let candidate;for(const value of [bare,bare+'.ts',bare+'.tsx',bare+'.js',bare+'.mjs',join(bare,'index.ts')])try{if((await stat(value)).isFile()){candidate=value;break;}}catch{}if(!candidate)throw Error('Unresolved relative source import: '+relative(root,bare));await visit(relative(root,candidate));}};
await visit(entry);const sourceHashes=Object.fromEntries(await Promise.all([...paths].sort().map(async path=>[path,hash(await readFile(path))])));
await build({configFile:false,ssr:{noExternal:['yjs','lib0']},build:{ssr:entry,outDir:out,emptyOutDir:true,copyPublicDir:false,minify:false,sourcemap:false,reportCompressedSize:false,rollupOptions:{preserveEntrySignatures:'strict',output:{entryFileNames:'notebook-library-lifecycle.mjs'}}},logLevel:'error'});
const after=Object.fromEntries(await Promise.all(Object.keys(sourceHashes).map(async path=>[path,hash(await readFile(path))])));if(JSON.stringify(after)!==JSON.stringify(sourceHashes))throw Error('Sources changed during the Library lifecycle build');
await mkdir(out,{recursive:true});const bundle=join(out,'notebook-library-lifecycle.mjs'),report={kind:'build-only',runtime:'NOTRUN',declaredGroups:3,sourceHashes,bundle:{path:bundle,sha256:hash(await readFile(bundle))},command:'bash scripts/run-dell-safe-check.sh -- node tests/run-notebook-library-lifecycle.mjs',scope:'Actual LibraryView DOM controls, production library hook, local trash kernel/store and private fences; JSDOM/fakeIndexedDB/native quota/open-delivery seams. No browser/server/native-device or remote lifecycle ACK proof'};await writeFile(join(out,'build-manifest.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({build:'PASS',runtime:'NOTRUN',declaredGroups:3,bundle:report.bundle,manifest:join(out,'build-manifest.json')}));
