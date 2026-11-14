import {requireBoundedMountedCheck,mountedCleanup,mountedAuditPath} from './mounted-cleanup.mjs';
requireBoundedMountedCheck();
import {build} from 'vite';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const sourcePaths=['src/lib/paperExport.ts','src/components/PaperNotebook.tsx','tests/paper-export-owner-entry.ts','tests/run-paper-export-owner.mjs'];
const hash=data=>createHash('sha256').update(data).digest('hex'),savedWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),out=await mkdtemp(join(tmpdir(),'dowze-export-owner-'));
const report={scope:'Actual export adapter and actual Tauri JS packages; fake IPC/dialogue and destination ledger only. No native GUI/filesystem claim.',declaredGroups:11,groups:[],passed:0,failed:0,cleanup:'NOTRUN',fullSuite:false,startedAt:new Date().toISOString()};
const bytes=Uint8Array.from({length:131073},(_,index)=>(index*31+9)%256),blob=new Blob([bytes]),originalSha=hash(bytes),operations=new Set(),gates=new Set();
const deferred=()=>{let release;const promise=new Promise(resolve=>release=resolve);gates.add(release);return {promise,release};};
const tracked=promise=>{operations.add(promise);void promise.then(()=>operations.delete(promise),()=>operations.delete(promise));return promise;};
const bounded=async(promise)=>{let timer;tracked(promise);try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Export fixture timeout')),10000);})]);}finally{clearTimeout(timer);}};
const revoked=error=>error instanceof Error&&error.message.includes('La source de cet export a changé')&&!error.message.includes('timeout');
const fixture=(hook=async()=>{})=>{
 const calls=[],staged=[],before=Buffer.from('PREVIOUS DESTINATION'),state={finished:false,aborted:false,destination:Buffer.from(before)};
 const invoke=async(name,args)=>{calls.push({name,args});await hook(name,args);
  if(name==='plugin:dialog|save')return '/tmp/qa-original';
  if(name==='begin_notebook_export')return 'owned-export';
  if(name==='push_notebook_export'){assert.equal(args.exportId,'owned-export');assert.equal(args.offset,staged.reduce((sum,row)=>sum+row.length,0));const part=Buffer.from(args.dataBase64,'base64');assert.ok(part.length<=65536);staged.push(part);return;}
  if(name==='abort_notebook_export'){assert.equal(args.exportId,'owned-export');state.aborted=true;return;}
  if(name==='finish_notebook_export'){assert.equal(args.exportId,'owned-export');state.destination=Buffer.concat(staged);state.finished=true;return;}
  throw Error('Unexpected IPC '+name);
 };
 Object.defineProperty(globalThis,'window',{value:{__TAURI_INTERNALS__:{invoke}},writable:true,configurable:true});
 return {calls,staged,state,before,invoke,unchanged(){assert.equal(state.finished,false);assert.deepEqual(state.destination,before);}};
};
const group=async(name,work)=>{try{await bounded(work());report.groups.push({name,status:'PASS'});report.passed++;console.log(name+': PASS');}catch(error){report.failed++;report.groups.push({name,status:'FAIL',error:String(error?.stack??error).slice(0,1800)});console.error(name+': FAIL '+String(error?.message??error));}finally{for(const release of gates)release();gates.clear();await bounded(Promise.allSettled([...operations]));assert.equal(operations.size,0,'Previous group still owns an operation');}};
try{
 report.hashes=Object.fromEntries(await Promise.all(sourcePaths.map(async name=>[name,hash(await readFile(name))])));
 await build({configFile:false,ssr:{noExternal:['@tauri-apps/api','@tauri-apps/plugin-dialog']},build:{ssr:'tests/paper-export-owner-entry.ts',outDir:out,copyPublicDir:false,minify:false,sourcemap:false,reportCompressedSize:false,rollupOptions:{output:{entryFileNames:'export-owner.mjs'}}},logLevel:'error'});
 const m=await import(pathToFileURL(join(out,'export-owner.mjs')));
 await group('Revoked source before dialogue sends no IPC',async()=>{const f=fixture();await assert.rejects(()=>m.savePaperExport(blob,'Original.pdf','pdf',()=>false),revoked);assert.equal(f.calls.length,0);f.unchanged();});
 await group('Actual Tauri JS dialogue pending across ABA cannot begin an export',async()=>{const entered=deferred(),hold=deferred();let epoch=0;const admission=epoch,f=fixture(async name=>{if(name==='plugin:dialog|save'){entered.release();await hold.promise;}});const pending=tracked(m.savePaperExport(blob,'Original.pdf','pdf',()=>epoch===admission));void pending.catch(()=>{});await bounded(entered.promise);epoch++;epoch++;hold.release();await assert.rejects(()=>pending,revoked);assert.deepEqual(f.calls.map(row=>row.name),['plugin:dialog|save']);f.unchanged();});
 await group('Cancelling the real JS dialogue contract returns false without file commands',async()=>{const calls=[];window.__TAURI_INTERNALS__.invoke=async name=>{calls.push(name);assert.equal(name,'plugin:dialog|save');return null;};assert.equal(await m.savePaperExport(blob,'Original.pdf','pdf'),false);assert.deepEqual(calls,['plugin:dialog|save']);});
 await group('Revocation while begin resolves aborts its owned session before reading or pushing',async()=>{let active=true;const f=fixture(async name=>{if(name==='begin_notebook_export')active=false;});await assert.rejects(()=>m.writePaperExportChunks(blob,'/tmp/original.pdf','pdf',f.invoke,()=>active),revoked);assert.deepEqual(f.calls.map(row=>row.name),['begin_notebook_export','abort_notebook_export']);assert.equal(f.state.aborted,true);f.unchanged();});
 await group('Revocation during a real sliced Blob read sends no chunk and aborts',async()=>{const entered=deferred(),hold=deferred(),f=fixture();let active=true;const source=new Blob([bytes]),slice=source.slice.bind(source);source.slice=(...args)=>{const part=slice(...args),read=part.arrayBuffer.bind(part);part.arrayBuffer=async()=>{entered.release();await hold.promise;return read();};return part;};const pending=tracked(m.writePaperExportChunks(source,'/tmp/original.pdf','pdf',f.invoke,()=>active));void pending.catch(()=>{});await bounded(entered.promise);active=false;hold.release();await assert.rejects(()=>pending,revoked);assert.deepEqual(f.calls.map(row=>row.name),['begin_notebook_export','abort_notebook_export']);assert.equal(f.state.aborted,true);f.unchanged();assert.equal(hash(new Uint8Array(await source.arrayBuffer())),originalSha);});
 await group('Revocation after one acknowledged chunk aborts without another chunk or finish',async()=>{let active=true;const f=fixture(async name=>{if(name==='push_notebook_export')active=false;});await assert.rejects(()=>m.writePaperExportChunks(blob,'/tmp/original.pdf','pdf',f.invoke,()=>active),revoked);assert.deepEqual(f.calls.map(row=>row.name),['begin_notebook_export','push_notebook_export','abort_notebook_export']);assert.equal(f.staged.length,1);assert.equal(f.state.aborted,true);f.unchanged();});
 await group('Revocation at the final chunk refuses finish and retains the old destination ledger',async()=>{let active=true;const finalBlob=new Blob([bytes.subarray(0,65536)]),f=fixture(async name=>{if(name==='push_notebook_export')active=false;});await assert.rejects(()=>m.writePaperExportChunks(finalBlob,'/tmp/original.pdf','pdf',f.invoke,()=>active),revoked);assert.deepEqual(f.calls.map(row=>row.name),['begin_notebook_export','push_notebook_export','abort_notebook_export']);assert.equal(f.staged[0].length,finalBlob.size);f.unchanged();});
 await group('Stable source passes all ordered 64KiB IPC chunks and preserves exact bytes',async()=>{const f=fixture(),source=new Blob([bytes]);source.arrayBuffer=async()=>{throw Error('Whole-file read forbidden');};assert.equal(await m.savePaperExport(source,'Original.pdf','pdf',()=>true),true);assert.equal(f.state.finished,true);assert.equal(f.state.aborted,false);assert.equal(f.staged.length,3);assert.deepEqual(Buffer.concat(f.staged),Buffer.from(bytes));assert.deepEqual(f.state.destination,Buffer.from(bytes));assert.equal(f.calls.filter(row=>row.name==='finish_notebook_export').length,1);assert.equal(f.calls.find(row=>row.name==='begin_notebook_export').args.destinationPath,'/tmp/qa-original.pdf');});
 await group('Legacy four-argument writer remains compatible and aborts on the original disk error',async()=>{const error=Error('Original disk refusal'),f=fixture(async name=>{if(name==='push_notebook_export')throw error;});await assert.rejects(()=>m.writePaperExportChunks(blob,'/tmp/original.pdf','pdf',f.invoke),e=>e===error);assert.equal(f.state.aborted,true);f.unchanged();const successful=fixture();await m.writePaperExportChunks(blob,'/tmp/original.pdf','pdf',successful.invoke);assert.equal(successful.state.finished,true);assert.deepEqual(Buffer.concat(successful.staged),Buffer.from(bytes));});
 await group('A finish requested while authorized never becomes a false interruption after its acknowledgement',async()=>{let active=true;const f=fixture(async name=>{if(name==='finish_notebook_export')active=false;});await m.writePaperExportChunks(blob,'/tmp/original.pdf','pdf',f.invoke,()=>active);assert.equal(f.state.finished,true);assert.equal(f.state.aborted,false);assert.equal(active,false);});
 await group('Existing zero and 256MiB size limits refuse before creating a session',async()=>{for(const size of [0,256*1024*1024+1]){const source=new Blob();Object.defineProperty(source,'size',{value:size});const f=fixture();await assert.rejects(()=>m.writePaperExportChunks(source,'/tmp/original.pdf','pdf',f.invoke),error=>error.message.includes('256 Mo'));assert.equal(f.calls.length,0);f.unchanged();}});
 assert.equal(hash(new Uint8Array(await blob.arrayBuffer())),originalSha);report.originalSha=originalSha;
 const after=Object.fromEntries(await Promise.all(sourcePaths.map(async name=>[name,hash(await readFile(name))])));assert.deepEqual(after,report.hashes);
}catch(error){report.fatal=String(error?.stack??error).slice(0,1800);process.exitCode=1;}
finally{
 for(const release of gates)release();
 try{await mountedCleanup([['Operations',async()=>{await bounded(Promise.allSettled([...operations]));assert.equal(operations.size,0);}],['Build fixture',()=>rm(out,{recursive:true,force:true})],['Global restore',()=>{if(savedWindow)Object.defineProperty(globalThis,'window',savedWindow);else delete globalThis.window;}]]);report.cleanup='PASS';}catch(error){report.cleanup='FAIL';report.cleanupError=String(error?.message??error);process.exitCode=1;}
 report.operationsRemaining=operations.size;
 report.notRunGroups=report.declaredGroups-report.groups.length;report.fullSuiteAttempted=report.notRunGroups===0;
 report.fullSuite=report.fullSuiteAttempted&&report.passed===report.declaredGroups&&!report.failed&&!report.fatal&&report.cleanup==='PASS';if(!report.fullSuite)process.exitCode=1;
 report.finishedAt=new Date().toISOString();const path=mountedAuditPath('paper-export-owner-adapter-20261015.json');await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,failed:report.failed,fullSuite:report.fullSuite,cleanup:report.cleanup,report:path,fatal:report.fatal??null}));
}
