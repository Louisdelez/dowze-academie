/* Full guarded Node foundation recipe. Actual installed PDF.js parser and
 * production storage over real fakeIndexedDB transactions. No browser/native
 * rendering, Notebook UI, real quota exhaustion or process-kill claim.
 * bash scripts/run-dell-safe-check.sh -- node tests/run-paper-pdf-import-staging.mjs */
import {mountedCleanup,mountedAuditPath,requireBoundedMountedCheck} from './mounted-cleanup.mjs';
requireBoundedMountedCheck();
import {createServer} from 'vite';
import {indexedDB,IDBKeyRange} from 'fake-indexeddb';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';

const names=[
 'Raw source before parser, helper reopen, exact SHA and no held upload',
 'Actual five-page PDF parse and stable retry identities',
 'Atomic publication graph, active asset, applied receipt and history',
 'Applied receipt remains absorbing after imported pages are removed',
 'Actual parser failure preserves the raw source and resumable job',
 'Captured A-B-A and AbortSignal cannot publish into a new scope',
 'Source SHA and source revision changes refuse preparation or commit',
 'Changed baseline, deletion and revoked owner CAS write nothing',
 'Quota after a successful publication blob write rolls back and retries once',
 'Legacy migration admission and recreated-note lineage stay distinct',
 'Long Unicode job IDs remain stable and corrupt receipts fail clearly',
 'PDF parser options retain the original guard and signal after await',
];
const report={schema:1,kind:'paper-pdf-import-staging-node-foundation',startedAt:new Date().toISOString(),declaredGroups:names.length,groupsStarted:0,allGroupsAttempted:false,fullSuite:false,passed:0,failed:0,groups:[],fatal:null,cleanupFinal:{status:'NOTRUN'},proofScope:'Actual PDF.js parsing and production IndexedDB APIs with real fakeIndexedDB requests/transactions; no Notebook UI, real browser persistence, native or SIGKILL claim',seams:['Installed legacy PDF.js entry and file-URL worker for Node; actual @napi-rs DOMMatrix/Path2D/ImageData','Explicit parser gates for owner/abort races; actual parser called after the gate','Quota seam throws at a successful real blob request; no physical quota exhaustion','Fake API observes the real synchronizer; no network/server claim','Helper reopened by closing/recreating nonpersistent SSR context; no process restart or crash claim']};
const artifact=mountedAuditPath('paper-pdf-import-staging-node-20261015.json'),runId=randomUUID(),bodyDeadline=Date.now()+220000,cleanupDeadline=Date.now()+280000;
const sourcePaths=['tests/run-paper-pdf-import-staging.mjs','tests/paper-pdf-import-staging-entry.ts','src/lib/paperPdfImportStaging.ts','src/lib/paperPdf.ts','src/lib/notebookDocument.ts','src/lib/paperCollaboration.ts','pwa/src/storage.ts','pwa/src/sync.ts','tests/fixtures/paper-pdf-selection-columns.pdf'];
const hash=value=>createHash('sha256').update(value).digest('hex');
const equalJSON=(actual,expected,label)=>assert.equal(hash(JSON.stringify(actual)),hash(JSON.stringify(expected)),label);
const brief=error=>({name:String(error?.name??'Error'),message:String(error?.message??error).slice(0,600),frames:String(error?.stack??'').split('\n').filter(line=>/^\s+at /.test(line)).slice(0,4),causes:Array.from(error?.errors??[]).slice(0,4).map(item=>({message:String(item?.message??item).slice(0,250)}))});
const refusal=error=>!!error&&typeof error.message==='string'&&!error.message.includes(': timeout')&&/chang|identit|connexion|migrat|supprim|déjà|reçu|prépar|provenance|fichier|pages/i.test(error.message);
const originals=new Map(['indexedDB','IDBKeyRange','DOMMatrix','Path2D','ImageData','navigator','CustomEvent','dispatchEvent'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
const servers=new Set(),operations=new Set(),controllers=new Set(),openPDFs=new Set(),gates=new Set(),restorers=new Set();let m,vite,live=true,fixtureBytes,file,fixtureSha,main;
const bounded=async(promise,label,ms=30000,cleanup=false)=>{let timer;try{const time=Math.min(ms,(cleanup?cleanupDeadline:bodyDeadline)-Date.now());if(time<=0)throw Error(label+': timeout');return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+': timeout')),time);})]);}finally{clearTimeout(timer);}};
const track=(promise,label,ms=30000)=>{const item=Promise.resolve(promise);operations.add(item);void item.then(()=>operations.delete(item),()=>operations.delete(item));return bounded(item,label,ms);};
const gate=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});const release=()=>{gates.delete(release);resolve();};gates.add(release);return {promise,release};};
const current=()=>live;
const identity=scope=>({accountId:scope.accountId,spaceId:scope.spaceId,type:'whiteboard',documentId:m.notebookDocumentId(scope.noteId)});
const blobs=scope=>m.listLocalBlobs(scope.accountId,scope.spaceId);
const receipt=(scope,id)=>m.readPaperPdfImport(scope,id,current);
const canonical=f=>m.getDraft(identity(f.scope));
const fileBody=async(actual,expected=file)=>{assert.equal(Buffer.compare(Buffer.from(await actual.arrayBuffer()),Buffer.from(await expected.arrayBuffer())),0,'Raw bytes must be exactly retained');assert.equal(await m.localBlobDigest(actual),await m.localBlobDigest(expected));};
async function load(){
 const server=await createServer({configFile:false,resolve:{alias:[{find:/^pdfjs-dist$/,replacement:resolve('node_modules/pdfjs-dist/legacy/build/pdf.mjs')}]},server:{middlewareMode:true,hmr:false,ws:false,watch:null},optimizeDeps:{noDiscovery:true,include:[]},ssr:{noExternal:['yjs','lib0']},logLevel:'error'});servers.add(server);
 const module=await server.ssrLoadModule('/tests/paper-pdf-import-staging-entry.ts');module.GlobalWorkerOptions.workerSrc=pathToFileURL(resolve('node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
 // Node PDF.js may replace our navigator to install language/platform fields.
 // Keep those actual fields and explicitly restore only the online API seam.
 Object.defineProperty(globalThis.navigator,'onLine',{value:true,configurable:true,writable:true});assert.equal(globalThis.navigator.onLine,true,'SSR load/reopen must leave the fake synchronizer explicitly online');return {server,module};
}
async function seed(label,{legacy=false}={}){
 const scope={accountId:'qa-pdf-import-'+label+'-'+runId,spaceId:'year',noteId:'note-'+label},plain=m.migratePaper(scope.noteId,'Exact original '+label,null,'2026-10-15T10:00:00Z');
 const document=legacy?plain:m.amendPaperCollaboration(plain,plain);
 await m.putDraft({...identity(scope),title:'Synthetic PDF '+label,content:document,baseVersion:1,updatedAt:1,syncState:'synced'});
 return {scope,document,draft:await m.getDraft(identity(scope))};
}
async function ready(f,id='job',blob=file){
 const staged=await m.stagePaperPdfImport({scope:f.scope,id,file:blob,current}),prepared=await parseJob(f.scope,id);return {staged,prepared};
}
async function parseJob(scope,id){
 const controller=new AbortController();controllers.add(controller);
 try{return await m.preparePaperPdfImport({scope,id,current,signal:controller.signal});}finally{controllers.delete(controller);}
}
async function held(f,id){
 const stored=await receipt(f.scope,id),rows=await blobs(f.scope);assert.ok(rows.every(row=>row.removedFromNote===true));assert.equal(rows.filter(row=>row.id===stored.sourceId).length,1);await fileBody(rows.find(row=>row.id===stored.sourceId).blob);return {stored,rows};
}
async function noHeldUpload(scope){
 assert.equal(globalThis.navigator.onLine,true,'Held-upload assertions must not pass merely because the synchronizer is offline');
 const sent={uploads:0,documents:0};await m.queueLocalDrafts(scope.accountId,scope.spaceId);
 assert.equal(globalThis.navigator.onLine,true,'The synchronizer must still be online immediately before flush');
 await m.flushMutations({bindAccount:()=>{},uploadBlob:async()=>{sent.uploads++;return {id:'synthetic-upload'};},putDocument:async()=>{sent.documents++;return {version:2};}},scope.accountId,scope.spaceId,current);
 assert.equal(sent.uploads,0,'A held PDF must never upload');assert.equal(sent.documents,0,'A staged PDF must not create a visible document mutation');return sent;
}
function publicationQuota(scope,assetId){
 const original=indexedDB.open,ledger={successfulDraftWrites:0,successfulBlobWrites:0,quotaThrows:0,aborts:0};let finish;const terminalAbort=new Promise(resolve=>{finish=resolve;});
 indexedDB.open=function(...args){const request=original.apply(this,args);request.addEventListener('success',()=>{
  const db=request.result,transaction=db.transaction.bind(db);db.transaction=(...parameters)=>{
   const tx=transaction(...parameters),storeNames=Array.from(tx.objectStoreNames),eligible=(parameters[1]??'readonly')==='readwrite'&&storeNames.length===3&&['drafts','scopedBlobs','snapshots'].every(name=>storeNames.includes(name)),objectStore=tx.objectStore.bind(tx);let observed=false;
   tx.addEventListener('abort',()=>{if(observed){ledger.aborts++;finish();}},{once:true});const seen=new WeakSet();
   tx.objectStore=name=>{const store=objectStore(name);if(!eligible||seen.has(store))return store;seen.add(store);if(name==='drafts'||name==='scopedBlobs'){
    const put=store.put.bind(store);store.put=(value,...rest)=>{const result=put(value,...rest),owned=value.accountId===scope.accountId&&value.spaceId===scope.spaceId;if(owned&&name==='drafts')result.addEventListener('success',()=>{ledger.successfulDraftWrites++;},{once:true});
     if(owned&&name==='scopedBlobs'&&value.id===assetId){observed=true;result.addEventListener('success',()=>{ledger.successfulBlobWrites++;if(!ledger.quotaThrows){ledger.quotaThrows++;throw new DOMException('Synthetic quota at a real publication asset write','QuotaExceededError');}},{once:true});}return result;};
   }return store;};return tx;
  };},{once:true});return request;};
 const restore=()=>{indexedDB.open=original;restorers.delete(restore);};restorers.add(restore);return {ledger,terminalAbort,restore};
}
async function noPublication(f,id,baseline,expectedState='ready',historyBefore=[]){
 equalJSON(await canonical(f),baseline,'Refused publication must preserve the exact durable draft');const job=await receipt(f.scope,id);assert.equal(job.state,expectedState);await held(f,id);
 const snapshots=await m.listSnapshots(f.scope.accountId,f.scope.spaceId);equalJSON(snapshots.filter(row=>row.key.startsWith('paper-history|')),historyBefore,'Refused publication must preserve exact existing history and create none');return job;
}
async function group(name,operation){
 report.groupsStarted++;console.log(name+': START');try{await track(operation(),name,45000);report.passed++;report.groups.push({name,status:'PASS'});console.log(name+': PASS');}
 catch(error){report.failed++;report.groups.push({name,status:'FAIL',error:brief(error)});console.error(name+': FAIL '+brief(error).message);throw error;}
}
try{
 const {DOMMatrix,Path2D,ImageData}=await track(import('@napi-rs/canvas'),'Installed native PDF parser primitives');assert.equal(typeof DOMMatrix,'function');assert.equal(typeof Path2D,'function');assert.equal(typeof ImageData,'function');
 Object.assign(globalThis,{indexedDB,IDBKeyRange,DOMMatrix,Path2D,ImageData,dispatchEvent:()=>true});Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true,writable:true});globalThis.CustomEvent=class extends Event{constructor(type,options){super(type);this.detail=options?.detail;}};
 report.dependencyVersions=Object.fromEntries(await Promise.all(['vite','fake-indexeddb','pdfjs-dist','@napi-rs/canvas'].map(async name=>[name,JSON.parse(await readFile(resolve('node_modules',name,'package.json'),'utf8')).version])));
 report.sourceHashes=Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,hash(await readFile(path))])));
 fixtureBytes=await readFile('tests/fixtures/paper-pdf-selection-columns.pdf');file=Object.assign(new Blob([fixtureBytes],{type:'application/pdf'}),{name:'selection-columns.pdf'});fixtureSha=hash(fixtureBytes);report.fixture={sha256:fixtureSha,bytes:file.size,expectedPages:5};
 ({server:vite,module:m}=await track(load(),'Nonpersistent SSR setup'));
 await group(names[0],async()=>{
  main=await seed('main');main.id='raw-first';const staged=await m.stagePaperPdfImport({scope:main.scope,id:main.id,file,current});assert.equal(staged.state,'source-staged');assert.equal(staged.sha256,fixtureSha);assert.equal(staged.pages,undefined);assert.ok(staged.targetLineage);equalJSON(await canonical(main),main.draft,'Staging must preserve the complete original document');
  const source=(await blobs(main.scope))[0];assert.equal((await blobs(main.scope)).length,1);assert.equal(source.id,staged.sourceId);assert.equal(source.removedFromNote,true);assert.equal(source.status,'pending');await fileBody(source.blob);await noHeldUpload(main.scope);
  await vite.close();servers.delete(vite);({server:vite,module:m}=await load());const resumed=await m.listPaperPdfImports(main.scope,current);assert.equal(resumed.length,1);equalJSON(resumed[0],staged,'A new SSR helper must observe the same durable job without a RAM seed');const original=await m.readPaperPdfImportOriginal(main.scope,main.id,current);assert.equal(original.name,file.name);await fileBody(original.blob);
 });
 await group(names[1],async()=>{
  const prepared=await parseJob(main.scope,main.id);assert.equal(prepared.state,'ready');assert.equal(prepared.pages.length,5);assert.ok(prepared.pages[0].pdf.text.includes('GAUCHE A'));assert.equal(prepared.pages[4].pdf.text.trim(),'');assert.ok(prepared.pages.every((page,index)=>page.pdf.assetId===prepared.assetId&&page.pdf.pageNumber===index+1&&page.id.length<=200));assert.equal(new Set(prepared.pages.map(page=>page.id)).size,5);assert.ok(Math.abs(prepared.pages[0].width-800)<1e-6);assert.ok(Math.abs(prepared.pages[0].height-800*4/3)<1e-6);
  let reruns=0;const retried=await m.preparePaperPdfImport({scope:main.scope,id:main.id,current},async()=>{reruns++;throw Error('A ready job must never reparse');});assert.equal(reruns,0);equalJSON(retried,prepared,'Retry must use the same prepared pages and identities');const {rows}=await held(main,main.id);assert.equal(rows.length,2);equalJSON(await canonical(main),main.draft);await noHeldUpload(main.scope);main.prepared=prepared;
 });
 await group(names[2],async()=>{
  const plan=await m.preparePaperPdfImportPublication({document:main.document,scope:main.scope,id:main.id,current});assert.equal(plan.receipt.state,'applied');assert.equal(plan.firstPageId,main.prepared.pages[0].id);assert.equal(plan.commit.drafts.length,1);assert.equal(plan.commit.blobs.length,1);assert.equal(plan.commit.snapshots.length,2);
  await m.commitNotebookTransfer(plan.commit,current);const saved=await canonical(main),job=await receipt(main.scope,main.id);assert.ok(m.isPaperDocument(saved.content));m.verifyPaperCollaboration(saved.content);assert.equal(saved.content.pages.length,main.document.pages.length+5);equalJSON(saved.content.pages.slice(-5),main.prepared.pages,'All original PDF page geometry/text must publish exactly');equalJSON(saved.content.objects,main.document.objects,'Publication must preserve existing objects');assert.equal(saved.content.assets.filter(asset=>asset.id===job.assetId).length,1);assert.equal(saved.content.revision,main.document.revision+1);assert.equal(job.state,'applied');assert.equal(job.appliedRevision,saved.content.revision);
  const rows=await blobs(main.scope),source=rows.find(row=>row.id===job.sourceId),asset=rows.find(row=>row.id===job.assetId);assert.equal(source.removedFromNote,true);assert.equal(asset.removedFromNote,undefined);await fileBody(source.blob);await fileBody(asset.blob);const history=(await m.listSnapshots(main.scope.accountId,main.scope.spaceId)).filter(row=>row.key.startsWith('paper-history|'));assert.equal(history.length,1);equalJSON(history[0].value,main.document,'Old exact revision must be in the same publication transaction');assert.equal((await m.listPaperPdfImports(main.scope,current)).length,0);main.saved=saved;
 });
 await group(names[3],async()=>{
  const before=await canonical(main),removed=m.amendPaperCollaboration(before.content,m.applyPaperCommand(before.content,{type:'batch',commands:main.prepared.pages.map(page=>({type:'remove-page',id:page.id}))}));await m.putDraft({...before,content:removed,syncState:'local'});const baseline=await canonical(main);assert.equal(baseline.content.pages.length,main.document.pages.length);
  const already=await m.preparePaperPdfImport({scope:main.scope,id:main.id,current});assert.equal(already.state,'applied');await assert.rejects(()=>m.preparePaperPdfImportPublication({document:baseline.content,scope:main.scope,id:main.id,current}),error=>refusal(error)&&error.message.includes('déjà'));equalJSON(await canonical(main),baseline);assert.equal((await blobs(main.scope)).length,2);assert.equal((await m.listSnapshots(main.scope.accountId,main.scope.spaceId)).filter(row=>row.key.startsWith('paper-history|')).length,1);await fileBody((await m.readPaperPdfImportOriginal(main.scope,main.id,current)).blob);
 });
 await group(names[4],async()=>{
  const f=await seed('invalid'),invalid=Object.assign(new Blob(['Definitely not a valid PDF'],{type:'application/pdf'}),{name:'invalid.pdf'});const staged=await m.stagePaperPdfImport({scope:f.scope,id:'bad',file:invalid,current});await assert.rejects(()=>track(parseJob(f.scope,'bad'),'Actual invalid PDF parser'),error=>!error.message?.includes(': timeout')&&/pdf|invalid/i.test(String(error.message)));
  assert.equal((await receipt(f.scope,'bad')).state,'source-staged');equalJSON(await canonical(f),f.draft);const rows=await blobs(f.scope);assert.equal(rows.length,1);assert.equal(rows[0].id,staged.sourceId);assert.equal(rows[0].removedFromNote,true);await fileBody(rows[0].blob,invalid);assert.equal((await m.listPaperPdfImports(f.scope,current)).length,1);
 });
 await group(names[5],async()=>{
  const a=await seed('aba-A'),b=await seed('aba-B');let owner='A',generation=0,api={id:'A'};const originalApi=api,captured=()=>live&&owner==='A'&&generation===0&&api===originalApi;
  await m.stagePaperPdfImport({scope:a.scope,id:'aba',file,current:captured});const entered=gate(),release=gate(),args={scope:{...a.scope},id:'aba',current:captured};const pending=track(m.preparePaperPdfImport(args,async(blob,assetId,options)=>{entered.release();await release.promise;return m.importPaperPdf(blob,assetId,options);}), 'Captured owner prepare');void pending.catch(()=>{});await bounded(entered.promise,'Captured parser entered');
  owner='B';generation++;api={id:'B'};args.scope.accountId=b.scope.accountId;args.id='replacement';args.current=()=>true;owner='A';generation++;api=originalApi;release.release();await assert.rejects(()=>pending,refusal);assert.equal(captured(),false);await noPublication(a,'aba',a.draft,'source-staged');equalJSON(await canonical(b),b.draft);assert.equal((await blobs(b.scope)).length,0);assert.equal((await m.listPaperPdfImports(b.scope,current)).length,0);
  const c=await seed('signal'),controller=new AbortController(),replacement=new AbortController(),started=gate(),hold=gate();controllers.add(controller);await m.stagePaperPdfImport({scope:c.scope,id:'signal',file,current});const input={scope:c.scope,id:'signal',current,signal:controller.signal};const opening=track(m.preparePaperPdfImport(input,async(blob,assetId,options)=>{assert.equal(options.signal,controller.signal,'Parser must receive the captured signal');started.release();await hold.promise;return m.importPaperPdf(blob,assetId,options);}), 'Captured signal prepare');void opening.catch(()=>{});await bounded(started.promise,'Signal parser entered');input.signal=replacement.signal;controller.abort();hold.release();await assert.rejects(()=>opening,refusal);controllers.delete(controller);await noPublication(c,'signal',c.draft,'source-staged');
 });
 await group(names[6],async()=>{
  const f=await seed('sha');const staged=await m.stagePaperPdfImport({scope:f.scope,id:'sha',file,current});const row=(await blobs(f.scope))[0],changed=new Uint8Array(fixtureBytes);changed[0]^=1;await m.putLocalBlob({...row,blob:new Blob([changed],{type:'application/pdf'})});await assert.rejects(()=>m.preparePaperPdfImport({scope:f.scope,id:'sha',current}),refusal);await assert.rejects(()=>m.readPaperPdfImportOriginal(f.scope,'sha',current),refusal);equalJSON(await canonical(f),f.draft);assert.equal((await receipt(f.scope,'sha')).sha256,staged.sha256);assert.equal((await blobs(f.scope)).length,1);assert.equal(hash(fixtureBytes),fixtureSha,'The original fixture bytes must not mutate');
  const r=await seed('source-revision');await ready(r,'revision');const plan=await m.preparePaperPdfImportPublication({document:r.document,scope:r.scope,id:'revision',current}),source=(await blobs(r.scope)).find(item=>item.id===plan.receipt.sourceId);await m.putLocalBlob(source);assert.equal((await blobs(r.scope)).find(item=>item.id===source.id).revision,source.revision+1);await assert.rejects(()=>m.commitNotebookTransfer(plan.commit,current),refusal);await noPublication(r,'revision',r.draft);
 });
 await group(names[7],async()=>{
  for(const scenario of ['before-prepare','after-prepare','deleted','revoked']){
   const f=await seed('cas-'+scenario);await ready(f,'cas');let allowed=true;const owned=()=>live&&allowed;let plan;
   if(scenario!=='before-prepare')plan=await m.preparePaperPdfImportPublication({document:f.document,scope:f.scope,id:'cas',current:owned});
   let baseline=f.draft;
   if(scenario==='before-prepare'||scenario==='after-prepare'){const changed=m.amendPaperCollaboration(f.document,m.applyPaperCommand(f.document,{type:'insert-page',page:m.blankPage('concurrent-'+randomUUID())}));await m.putDraft({...f.draft,content:changed,syncState:'local'});baseline=await canonical(f);}
   if(scenario==='deleted')await m.putSnapshot({key:m.notebookDeletionKey(identity(f.scope)),accountId:f.scope.accountId,spaceId:f.scope.spaceId,value:{schema:1,kind:'paper-canonical-deletion',...identity(f.scope),noteId:f.scope.noteId,version:2,deletedAt:Date.now(),source:f.draft}});
   if(scenario==='revoked')allowed=false;
   if(scenario==='before-prepare')await assert.rejects(()=>m.preparePaperPdfImportPublication({document:f.document,scope:f.scope,id:'cas',current:owned}),refusal);else await assert.rejects(()=>m.commitNotebookTransfer(plan.commit,owned),refusal);
   await noPublication(f,'cas',baseline);if(scenario==='deleted')assert.ok(await m.getSnapshot(m.notebookDeletionKey(identity(f.scope))),'Delete marker must remain durable');
  }
 });
 await group(names[8],async()=>{
  const f=await seed('quota');await ready(f,'quota');const plan=await m.preparePaperPdfImportPublication({document:f.document,scope:f.scope,id:'quota',current}),beforeRows=await blobs(f.scope),fault=publicationQuota(f.scope,plan.receipt.assetId);
  try{await assert.rejects(()=>track(m.commitNotebookTransfer(plan.commit,current),'Real publication quota rollback'),error=>error?.name==='AbortError');await bounded(fault.terminalAbort,'Quota must reach the real terminal abort');assert.equal(fault.ledger.successfulDraftWrites,1);assert.equal(fault.ledger.successfulBlobWrites,1);assert.equal(fault.ledger.quotaThrows,1);assert.equal(fault.ledger.aborts,1);await noPublication(f,'quota',f.draft);equalJSON((await blobs(f.scope)).map(({blob,...row})=>row),beforeRows.map(({blob,...row})=>row),'Asset revisions and held state must roll back');}finally{fault.restore();}
  await m.commitNotebookTransfer(plan.commit,current);const saved=await canonical(f);assert.equal(saved.content.pages.length,f.document.pages.length+5);assert.equal(saved.content.assets.length,1);assert.equal((await receipt(f.scope,'quota')).state,'applied');assert.equal((await m.listSnapshots(f.scope.accountId,f.scope.spaceId)).filter(row=>row.key.startsWith('paper-history|')).length,1);assert.equal((await blobs(f.scope)).length,2);
 });
 await group(names[9],async()=>{
  const f=await seed('legacy',{legacy:true});assert.equal(m.hasPaperCollaboration(f.document),false);await assert.rejects(()=>m.stagePaperPdfImport({scope:f.scope,id:'legacy',file,current}),error=>refusal(error)&&error.message.includes('migration'));assert.equal((await blobs(f.scope)).length,0);assert.equal((await m.listSnapshots(f.scope.accountId,f.scope.spaceId)).length,0);equalJSON(await canonical(f),f.draft);
  const migrated=m.amendPaperCollaboration(f.document,{...f.document,revision:f.document.revision+1,updatedAt:new Date().toISOString()});await m.savePaperDraft({...f.draft,content:migrated,syncState:'local'},f.document.revision);f.document=migrated;f.draft=await canonical(f);const historyBefore=(await m.listSnapshots(f.scope.accountId,f.scope.spaceId)).filter(row=>row.key.startsWith('paper-history|'));assert.equal(historyBefore.length,1);const {prepared}=await ready(f,'legacy');assert.equal(prepared.targetLineage,migrated.collaboration.lineage);
  await m.deleteDraft(identity(f.scope));const replacementPlain=m.migratePaper(f.scope.noteId,'A distinct recreated note',null,'2026-10-15T12:00:00Z'),replacement=m.amendPaperCollaboration(replacementPlain,replacementPlain);assert.notEqual(replacement.collaboration.lineage,migrated.collaboration.lineage);await m.putDraft({...f.draft,content:replacement});const baseline=await canonical(f);assert.equal(await m.getSnapshot(m.notebookDeletionKey(identity(f.scope))),undefined);await assert.rejects(()=>m.preparePaperPdfImportPublication({document:replacement,scope:f.scope,id:'legacy',current}),error=>refusal(error)&&error.message.includes('identité'));await noPublication(f,'legacy',baseline,'ready',historyBefore);
 });
 await group(names[10],async()=>{
  const f=await seed('unicode'),id='é|雪'+ 'x'.repeat(490);const {prepared}=await ready(f,id);assert.equal(prepared.id,id);assert.ok(prepared.sourceId.length<=200&&prepared.assetId.length<=200);assert.ok(prepared.pages.every(page=>page.id.length<=200));equalJSON(await m.preparePaperPdfImport({scope:f.scope,id,current}),prepared);const other=await seed('unicode-other'),otherJob=await m.stagePaperPdfImport({scope:other.scope,id,file,current});assert.notEqual(otherJob.sourceId,prepared.sourceId,'The same job ID in another scope must have a separate source identity');
  const row=await m.getSnapshot(m.paperPdfImportKey(f.scope,id));await m.putSnapshot({...row,value:{...prepared,pages:[null]}});await assert.rejects(()=>m.readPaperPdfImport(f.scope,id,current),error=>refusal(error)&&!(error instanceof TypeError));equalJSON(await canonical(f),f.draft);await m.putSnapshot(row);await held(f,id);
 });
 await group(names[11],async()=>{
  for(const operation of ['open','import']){
   const entered=gate(),release=gate(),old=new AbortController(),next=new AbortController();let authorized=true;controllers.add(old);
   class DeferredBlob extends Blob{async arrayBuffer(){entered.release();await release.promise;return super.arrayBuffer();}}
   const deferred=new DeferredBlob([fixtureBytes],{type:'application/pdf'}),options={current:()=>authorized,signal:old.signal};const pending=track(operation==='open'?m.openPaperPdf(deferred,options).then(pdf=>{openPDFs.add(pdf);return pdf;}):m.importPaperPdf(deferred,'synthetic-asset',options),'Captured '+operation+' options');void pending.catch(()=>{});await bounded(entered.promise,'Actual Blob arrayBuffer entered');options.current=()=>true;options.signal=next.signal;if(operation==='open')authorized=false;else old.abort();release.release();await assert.rejects(()=>pending,refusal);controllers.delete(old);assert.equal(hash(fixtureBytes),fixtureSha);
  }
 });
}catch(error){report.fatal=brief(error);process.exitCode=1;}
finally{
 live=false;
 try{await mountedCleanup([
  ['Release gated callbacks',()=>{for(const release of [...gates])release();}],
  ['Abort owned PDF tasks',()=>{for(const controller of controllers)controller.abort();controllers.clear();}],
  ['Restore fault interception',()=>{for(const restore of [...restorers])restore();}],
  ['Drain recipe operations',()=>bounded(Promise.allSettled([...operations]),'Accepted PDF operations must settle before teardown',6000,true)],
  ['Destroy unexpected opened PDF handles',async()=>{for(const pdf of [...openPDFs]){await pdf.destroy();openPDFs.delete(pdf);}}],
  ['Close nonpersistent SSR contexts',async()=>{for(const server of [...servers]){await server.close();servers.delete(server);}}],
  ['Delete isolated fakeIndexedDB database',()=>new Promise((resolve,reject)=>{const request=indexedDB.deleteDatabase('dowze-academie-pwa');request.onsuccess=()=>resolve();request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Owned fakeIndexedDB still has a live connection'));})],
  ['Restore exact globals',()=>{for(const [name,descriptor] of originals)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}],
 ],6000);assert.equal(operations.size,0,'All accepted recipe work must actually be settled');assert.equal(openPDFs.size,0,'Every unexpectedly accepted PDF handle must actually be destroyed');assert.equal(servers.size,0,'All nonpersistent contexts must actually close');report.cleanupFinal={status:'PASS',pendingOperations:operations.size,openContexts:servers.size,openPDFs:openPDFs.size};}
 catch(error){report.cleanupFinal={status:'FAIL',error:brief(error)};process.exitCode=1;}
 try{const finalHashes=Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,hash(await readFile(path))])));if(report.sourceHashes)equalJSON(finalHashes,report.sourceHashes,'Fixture/product source must not change during the recipe');}catch(error){report.fatal??=brief(error);process.exitCode=1;}
 const attempted=new Set(report.groups.map(item=>item.name));for(const name of names)if(!attempted.has(name))report.groups.push({name,status:'NOTRUN',reason:'Earlier fatal/setup/group/cleanup failure'});
 report.allGroupsAttempted=report.groupsStarted===names.length;report.fullSuite=report.allGroupsAttempted&&report.passed===names.length&&report.failed===0&&!report.fatal&&report.cleanupFinal.status==='PASS';report.finishedAt=new Date().toISOString();if(!report.fullSuite)process.exitCode=1;
 await mkdir(dirname(artifact),{recursive:true});await writeFile(artifact,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,failed:report.failed,notRun:report.groups.filter(item=>item.status==='NOTRUN').length,declaredGroups:report.declaredGroups,allGroupsAttempted:report.allGroupsAttempted,fullSuite:report.fullSuite,cleanup:report.cleanupFinal.status,fatal:report.fatal?.message??null,report:artifact}));
}
