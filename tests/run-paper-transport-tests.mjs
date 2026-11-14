import {build} from 'vite';
import {pathToFileURL} from 'node:url';
import {mkdtemp,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {join} from 'node:path';
const out=await mkdtemp(join(process.cwd(),'tests/.paper-'));
try{
 await build({configFile:false,ssr:{noExternal:true},build:{ssr:'src/lib/paperSync.ts',outDir:out,rollupOptions:{output:{entryFileNames:'transport.mjs'}}},logLevel:'error'});
 const {encodePaperSync,decodePaperSync}=await import(pathToFileURL(out+'/transport.mjs'));
 const {migratePaper,applyPaperCommand}=await import('../src/lib/notebookDocument.ts');
 const doc=migratePaper('large','a'.repeat(280000),null);let body;const hashes=[];
 const api={uploadBlob:async(_space,blob,sha)=>{body=blob;hashes.push(sha);return{id:'body-test'};},downloadBlob:async()=>body};
 const encoded=await encodePaperSync(api,'qa',doc,'mutation');assert.equal(encoded.notebookEnvelope,3);assert.deepEqual(await decodePaperSync(api,'qa',encoded),doc);await encodePaperSync(api,'qa',doc,'mutation');assert.equal(hashes[0],hashes[1]);await assert.rejects(()=>decodePaperSync({...api,downloadBlob:async()=>new Blob(['corrupt'])},'qa',encoded));
 await build({configFile:false,ssr:{noExternal:true},build:{ssr:'src/lib/paperArchive.ts',outDir:out,emptyOutDir:false,rollupOptions:{output:{entryFileNames:'archive.mjs'}}},logLevel:'error'});
 const {readPaperArchive,appendPaperArchive}=await import(pathToFileURL(out+'/archive.mjs'));const {zipSync,strToU8}=await import('fflate');
 const source=migratePaper('old','texte',null),archive=zipSync({'document.json':strToU8(JSON.stringify(source))});assert.deepEqual(readPaperArchive(archive).document,source);const mapped=appendPaperArchive(source,'destination');const destination=migratePaper('destination','Original',null);const appended=applyPaperCommand(destination,{type:'batch',commands:mapped.commands});assert.equal(appended.pages.length,2);assert.equal(appended.objects[0].markdown,'Original');assert.notEqual(mapped.firstPageId,source.pages[0].id);assert.throws(()=>readPaperArchive(zipSync({'document.json':strToU8('{broken')})));
 await build({configFile:false,ssr:{noExternal:true},build:{ssr:'src/lib/paperConflict.ts',outDir:out,emptyOutDir:false,rollupOptions:{output:{entryFileNames:'conflict.mjs'}}},logLevel:'error'});
 const {preparePaperResolution}=await import(pathToFileURL(out+'/conflict.mjs'));
 const remote={...destination,revision:6,objects:destination.objects.map(o=>({...o,markdown:'Serveur'}))};const merged=await preparePaperResolution(destination,remote,'both',{accountId:'qa',spaceId:'qa'});
 assert.equal(merged.pages.length,2);assert.ok(merged.objects.some(o=>o.markdown==='Original'));assert.ok(merged.objects.some(o=>o.markdown==='Serveur'));assert.equal(new Set(merged.objects.map(o=>o.id)).size,merged.objects.length);assert.ok(merged.revision>remote.revision);
 assert.equal((await preparePaperResolution(destination,remote,'server',{accountId:'qa',spaceId:'qa'})).objects[0].markdown,'Serveur');await assert.rejects(()=>preparePaperResolution(destination,{...remote,noteId:'other'},'both',{accountId:'qa',spaceId:'qa'}));
 await build({configFile:false,ssr:{noExternal:true},build:{ssr:'src/lib/paperClipboard.ts',outDir:out,emptyOutDir:false,rollupOptions:{output:{entryFileNames:'clipboard.mjs'}}},logLevel:'error'});
 const {indexedDB}=await import('fake-indexeddb');globalThis.indexedDB=indexedDB;
 const {copyPaperSelection,pastePaperSelection,hasPaperSelection}=await import(pathToFileURL(out+'/clipboard.mjs'));const scope={accountId:'clipboard-qa',spaceId:'year'};
 await copyPaperSelection(destination,[destination.objects[0].id],scope);assert.equal(hasPaperSelection(scope),true);assert.equal(hasPaperSelection({...scope,accountId:'another'}),false);const clip=await pastePaperSelection('target','page-target',scope);assert.equal(clip.commands.length,1);assert.equal(clip.commands[0].object.pageId,'page-target');assert.equal(clip.commands[0].object.markdown,'Original');assert.notEqual(clip.commands[0].object.id,destination.objects[0].id);await assert.rejects(()=>pastePaperSelection('target','page-target',{...scope,spaceId:'another-year'}));
 console.log('Copie : identité distincte et isolation compte/année : PASS');
 console.log('Conflit : fusion par ajout, original conservé, identité et révision : PASS');
 console.log('Transport : grosse note, reprise déterministe, refus corruption : PASS');console.log('Archive : validation, import par ajout, identité et original conservés : PASS');
}finally{await rm(out,{recursive:true,force:true});}
