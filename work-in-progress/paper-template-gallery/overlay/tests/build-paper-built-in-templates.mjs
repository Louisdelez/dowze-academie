/** BUILD ONLY. Root executes the three actual built-in paper groups later. */
import {requireBoundedMountedCheck} from './mounted-cleanup.mjs';
requireBoundedMountedCheck();
import {build} from 'vite';
import {readFile,writeFile,mkdir,readdir,lstat,realpath} from 'node:fs/promises';
import {resolve,relative,join,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const args=process.argv.slice(2),option=name=>{const at=args.indexOf(name);assert.ok(at>=0&&at+1<args.length);return args[at+1];},pinPath=resolve(option('--product-pins')),pinSHA=option('--product-pins-sha256'),root=await realpath(process.cwd()),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(process.versions.node,'22.23.2');assert.match(pinSHA,/^[a-f0-9]{64}$/);assert.equal(hash(await readFile(pinPath)),pinSHA);
const pins=JSON.parse(await readFile(pinPath,'utf8')),products=['src/components/PaperPageSettings.tsx','src/components/PaperBuiltInTemplates.tsx','src/components/paper-built-in-templates.css'];assert.deepEqual(pins.files.map(row=>row.path).toSorted(),products.toSorted());
const rows=new Map(pins.files.map(row=>[row.path,row]));for(const name of products)assert.equal(hash(await readFile(join(root,name))),rows.get(name).afterSHA256);
const entry='tests/paper-built-in-templates-entry.tsx',out=resolve(root,'tests/.paper-built-in-templates-build'),sourceHashes={};
async function pin(path){const row=await lstat(path);assert.ok(row.isFile()&&!row.isSymbolicLink(),'Real regular source input required');const canonical=await realpath(path);assert.equal(canonical,path);assert.ok(path.startsWith(root+'/')||path.startsWith('/tmp/dowze-notebook-qa-20261014.iGUOPY/node_modules/'),'Source escaped candidate or pinned QA dependencies');const checksum=hash(await readFile(path));assert.ok(!sourceHashes[path]||sourceHashes[path]===checksum);sourceHashes[path]=checksum;}
for(const name of [entry,'tests/build-paper-built-in-templates.mjs','tests/run-paper-built-in-templates.mjs','tests/mounted-cleanup.mjs','package.json','package-lock.json',...products])await pin(resolve(root,name));
await assert.rejects(lstat(out),error=>error?.code==='ENOENT','Fresh test output required');
await build({root,configFile:false,publicDir:false,define:{'process.env.NODE_ENV':'"development"'},ssr:{noExternal:true},plugins:[{name:'pin-real-reading-theme-inputs',enforce:'pre',async load(id){const path=id.split('?')[0];if(isAbsolute(path)&&!path.includes('\0'))await pin(path);return null;}}],build:{ssr:entry,outDir:out,emptyOutDir:false,copyPublicDir:false,minify:false,sourcemap:false,reportCompressedSize:false,rollupOptions:{preserveEntrySignatures:'strict',output:{entryFileNames:'paper-built-in-templates-entry.mjs'}}},logLevel:'error'});
for(const[path,checksum]of Object.entries(sourceHashes))assert.equal(hash(await readFile(path)),checksum,'Source changed during test build');for(const name of products)assert.equal(sourceHashes[resolve(root,name)],rows.get(name).afterSHA256);assert.equal(hash(await readFile(pinPath)),pinSHA);
const outputs={};async function walk(directory){for(const name of await readdir(directory)){const path=join(directory,name),row=await lstat(path);assert.ok(!row.isSymbolicLink());if(row.isDirectory())await walk(path);else{assert.ok(row.isFile());outputs[relative(out,path)]={sha256:hash(await readFile(path)),bytes:row.size};}}}await walk(out);
const bundle=join(out,'paper-built-in-templates-entry.mjs');assert.ok(outputs['paper-built-in-templates-entry.mjs']);
const manifest={schema:1,kind:'N062-paper-built-in-templates-build-only',status:'BUILD_PASS_RUNTIME_NOTRUN',declaredGroups:3,productPinsSHA256:pinSHA,sourceHashes,outputs,bundle:{path:bundle,sha256:hash(await readFile(bundle))},fixtureSeams:'Actual shared PageSettings/Background, React, command reducer and history; no storage adapter, writer or network. JSDOM has no native geometry; SSR attributes are source geometry, not computed sizes. No full Notebook/PM/App or browser qualification.',command:['node','--test','--test-concurrency=1','tests/run-paper-built-in-templates.mjs']};
await writeFile(join(out,'build-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({build:'PASS',runtime:'NOTRUN',manifest:join(out,'build-manifest.json')}));
