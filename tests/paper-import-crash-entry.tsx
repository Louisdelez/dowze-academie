/** Real browser/IndexedDB only. inspect() never seeds a recovered job, file or
 * draft. Expected hashes/IDs are comparisons retained by the parent process. */
import {getDraft,putDraft,putSnapshot,listSnapshots,listLocalBlobs,commitNotebookTransfer,localBlobDigest,type Draft} from '../pwa/src/storage';
import {migratePaper,applyPaperCommand,isPaperDocument,notebookDocumentId,type PaperDocument} from '../src/lib/notebookDocument';
import {amendPaperCollaboration,verifyPaperCollaboration} from '../src/lib/paperCollaboration';
import {stagePaperPdfImport,preparePaperPdfImport,preparePaperPdfImportPublication,readPaperPdfImport,readPaperPdfImportOriginal,listPaperPdfImports,paperPdfImportKey,type PaperPdfImportReceipt} from '../src/lib/paperPdfImportStaging';
import {stagePaperAppendArchive,preparePaperAppendArchive,preparePaperAppendArchivePublication,readPaperAppendArchive,readPaperAppendArchiveOriginal,listPaperAppendArchives,paperAppendArchiveReceiptKey,type PaperAppendArchiveReceipt} from '../src/lib/paperAppendArchiveStaging';
import {notebookIdentityDigest} from '../src/lib/notebookIdentity';

type Kind='pdf'|'archive';
type Receipt=PaperPdfImportReceipt|PaperAppendArchiveReceipt;
type Scope={accountId:string;spaceId:string;noteId:string};
export const IMPORT_CRASH_CASES=['pdf-source','pdf-ready','pdf-publication-pending','pdf-applied','archive-source','archive-ready','archive-publication-pending','archive-applied','ui-pdf-publication-pending'] as const;
type Case=typeof IMPORT_CRASH_CASES[number];
type Ids={pages:string[];objects:string[];assets:string[];audio:string[]};
type Expected={kind:Kind;id:string;baselineSha:string;baselinePages:string[];baselinePageSha:string;sourceSha:string;sourceSize:number;ids:Ids;readyDigest:string;publicationSha:string;historyKey:string};
type Context={name:Case;runId:string;kind:Kind;scope:Scope;id:string|null};
const status={phase:'idle',acknowledgedState:'none',sourceAcknowledged:false,readyAcknowledged:false,publicationAcknowledged:false,holdActive:false,holdCompleted:false,holdReads:0,uncommittedGraph:false,uncommittedAssets:false,uncommittedHistory:false,error:null as string|null,expected:null as Expected|null};
const stamp='2026-10-15T10:00:00Z',current=()=>true;
const check=(condition:unknown,message:string)=>{if(!condition)throw Error(message);};
const fingerprint=(value:unknown)=>notebookIdentityDigest(JSON.stringify(value));
const same=(a:unknown,b:unknown,message:string)=>check(fingerprint(a)===fingerprint(b),message);
const describe=(name:Case,runId:string):Context=>{check(IMPORT_CRASH_CASES.includes(name)&&/^[a-zA-Z0-9-]{8,80}$/.test(runId),'Invalid private fixture identity');return {name,runId,kind:name.includes('archive')?'archive':'pdf',scope:{accountId:`synthetic-import-${runId}`,spaceId:'synthetic-import-year',noteId:`synthetic-${name}`},id:name.startsWith('ui-')?null:`job-${runId}`};};
const identity=(scope:Scope)=>({accountId:scope.accountId,spaceId:scope.spaceId,type:'whiteboard' as const,documentId:notebookDocumentId(scope.noteId)});
const draftKey=(scope:Scope)=>`${scope.accountId}|${scope.spaceId}|whiteboard|${notebookDocumentId(scope.noteId)}`;
const receiptKey=(f:Context)=>f.kind==='pdf'?paperPdfImportKey(f.scope,f.id!):paperAppendArchiveReceiptKey(f.scope,f.id!);
const job=(f:Context):Promise<Receipt>=>f.kind==='pdf'?readPaperPdfImport(f.scope,f.id!,current):readPaperAppendArchive({scope:f.scope,id:f.id!,current});
const original=(f:Context)=>f.kind==='pdf'?readPaperPdfImportOriginal(f.scope,f.id!,current):readPaperAppendArchiveOriginal({scope:f.scope,id:f.id!,current});
const listed=async(f:Context)=>f.kind==='pdf'?listPaperPdfImports(f.scope,current):(await listPaperAppendArchives({scope:f.scope,current})).receipts;
const sourceInfo=(value:Receipt)=>value.kind==='paper-pdf-import'?{sha:value.sha256,size:value.size}:{sha:value.original.sha256,size:value.original.size};
function ids(value:Receipt):Ids{
 if(value.kind==='paper-pdf-import')return {pages:value.pages?.map(page=>page.id)??[],objects:[],assets:value.state==='source-staged'?[]:[value.assetId],audio:[]};
 if(value.state==='source-staged')return {pages:[],objects:[],assets:[],audio:[]};
 return {pages:value.commands.flatMap(command=>command.type==='insert-page'?[command.page.id]:[]),objects:value.commands.flatMap(command=>command.type==='upsert-object'?[command.object.id]:[]),assets:value.files.map(file=>file.id),audio:value.commands.flatMap(command=>command.type==='add-audio'?[command.audio.id]:[])};
}
const readyDigest=(value:Receipt)=>value.kind==='paper-pdf-import'?value.pagesSha256??'':value.state==='source-staged'?'':value.fingerprint;
function capture(value:Receipt){
 check(status.expected,'Producer baseline missing');const info=sourceInfo(value);status.expected!.id=value.id;status.expected!.sourceSha=info.sha;status.expected!.sourceSize=info.size;status.expected!.ids=ids(value);status.expected!.readyDigest=readyDigest(value);
}
async function fixtureFile(kind:Kind){const response=await fetch(kind==='pdf'?'/fixture.pdf':'/fixture.dowze',{cache:'no-store'});check(response.ok,'Private immutable fixture file missing');return new File([await response.blob()],kind==='pdf'?'fixture-columns.pdf':'fixture-media.dowze',{type:kind==='pdf'?'application/pdf':'application/zip'});}
async function exactBytes(actual:Blob,expected:Blob){check(actual.size===expected.size,'Original size differs after restart');const a=new Uint8Array(await actual.arrayBuffer()),b=new Uint8Array(await expected.arrayBuffer());check(a.every((value,index)=>value===b[index]),'Original bytes differ after restart');return localBlobDigest(actual);}
async function seed(f:Context,ui=false){
 const plain=migratePaper(f.scope.noteId,'',null,stamp);plain.objects=[];const content=amendPaperCollaboration(plain,plain),draft:Draft={...identity(f.scope),title:'Synthetic import browser fixture',content,baseVersion:1,updatedAt:1,syncState:'synced'};
 await putDraft(draft);
 if(ui){await putDraft({accountId:f.scope.accountId,spaceId:f.scope.spaceId,type:'notesMarkdown',documentId:f.scope.noteId,title:draft.title,content:{id:f.scope.noteId,title:draft.title,markdown:'',tags:[],subjectIds:[],createdAt:stamp,updatedAt:stamp},baseVersion:1,updatedAt:1,syncState:'synced'});await putSnapshot({key:`paper-migration|${draftKey(f.scope)}`,accountId:f.scope.accountId,spaceId:f.scope.spaceId,value:{markdown:'',legacy:null,migratedAt:stamp}});}
 status.expected={kind:f.kind,id:f.id??'',baselineSha:fingerprint(content),baselinePages:content.pages.map(page=>page.id),baselinePageSha:fingerprint(content.pages),sourceSha:'',sourceSize:0,ids:{pages:[],objects:[],assets:[],audio:[]},readyDigest:'',publicationSha:'',historyKey:''};return content;
}

/** Timing seam: all transactions, puts, gets and ACK events remain native IDB.
 * Only an applied receipt put of the exact private job arms a bounded chain of
 * native reads. There is no synthetic oncomplete/commit or replacement storage. */
let watched:Context|null=null,armed=false,held:IDBTransaction|null=null,holdTimer:number|null=null;
const nativeTransaction=IDBDatabase.prototype.transaction;
function hold(tx:IDBTransaction,key:string){
 check(!held&&watched&&status.expected,'More than one held operation');held=tx;armed=false;status.holdActive=true;const started=performance.now();let observed=false;
 const fail=(message:string)=>{status.error=message;status.phase='error';status.holdActive=false;try{tx.abort();}catch{}};
 tx.addEventListener('complete',()=>{status.holdCompleted=true;status.holdActive=false;status.error='Publication committed before SIGKILL';status.phase='error';if(holdTimer!==null)clearTimeout(holdTimer);},{once:true});
 tx.addEventListener('abort',()=>{status.holdActive=false;status.error='Publication aborted before SIGKILL';status.phase='error';if(holdTimer!==null)clearTimeout(holdTimer);},{once:true});
 const pump=()=>{
  if(performance.now()-started>20000||status.holdReads>50000){fail('Bounded native transaction hold expired');return;}
  const read=tx.objectStore('snapshots').get(key);read.onerror=()=>fail('Native held receipt read failed');read.onsuccess=()=>{
   status.holdReads++;const value=read.result?.value as Receipt|undefined;
   if(!observed&&value?.state==='applied'&&status.expected!.historyKey){
    const graph=tx.objectStore('drafts').get(draftKey(watched!.scope));graph.onerror=()=>fail('Native held draft read failed');graph.onsuccess=()=>{
     const document=graph.result?.content as PaperDocument|undefined;check(document&&isPaperDocument(document),'Tentative canonical graph missing');const graphFingerprint=fingerprint(document);if(status.expected!.publicationSha)check(graphFingerprint===status.expected!.publicationSha,'Tentative graph differs from the prepared plan');else status.expected!.publicationSha=graphFingerprint;
     check(document!.pages.length===status.expected!.baselinePages.length+status.expected!.ids.pages.length&&status.expected!.ids.pages.every(id=>document!.pages.some(page=>page.id===id))&&document!.objects.length===status.expected!.ids.objects.length&&document!.assets.length===status.expected!.ids.assets.length&&document!.audio.length===status.expected!.ids.audio.length,'Tentative graph lost or duplicated mapped elements');status.uncommittedGraph=true;
     const history=tx.objectStore('snapshots').get(status.expected!.historyKey);history.onerror=()=>fail('Native held history read failed');history.onsuccess=()=>{
      check(history.result&&fingerprint(history.result.value)===status.expected!.baselineSha,'Tentative publication history differs from baseline');status.uncommittedHistory=true;let left=status.expected!.ids.assets.length;
      const finish=()=>{observed=true;status.phase='uncommitted-written';pump();};
      if(!left){status.uncommittedAssets=true;finish();return;}
      for(const id of status.expected!.ids.assets){const media=tx.objectStore('scopedBlobs').get(`${watched!.scope.accountId}|${watched!.scope.spaceId}|${id}`);media.onerror=()=>fail('Native held asset read failed');media.onsuccess=()=>{check(media.result&&media.result.removedFromNote!==true,'Tentative asset was not activated');if(!--left){status.uncommittedAssets=true;finish();}};}
     };
    };
   }else pump();
  };
 };
 pump();holdTimer=window.setTimeout(()=>fail('Bounded native transaction hold expired'),20000);
}
IDBDatabase.prototype.transaction=function(this:IDBDatabase,...args:Parameters<IDBDatabase['transaction']>){
 const tx=Reflect.apply(nativeTransaction,this,args) as IDBTransaction;
 if(!watched||this.name!=='dowze-academie-pwa'||tx.mode!=='readwrite'||tx.objectStoreNames.length!==3||!['drafts','scopedBlobs','snapshots'].every(name=>tx.objectStoreNames.contains(name)))return tx;
 const receipts:Receipt[]=[];
 // Observe the native terminal event before returning the transaction to the
 // product. Its later oncomplete callback resolves the helper promise; native
 // microtask checkpoints may run that continuation before a later listener.
 tx.addEventListener('complete',()=>{for(const value of receipts){status.acknowledgedState=value.state;if(value.state==='source-staged')status.sourceAcknowledged=true;if(value.state==='ready')status.readyAcknowledged=true;if(value.state==='applied')status.publicationAcknowledged=true;}},{once:true});
 const nativeStore=tx.objectStore.bind(tx),seen=new WeakSet<IDBObjectStore>();
 tx.objectStore=name=>{const store=nativeStore(name);if(name!=='snapshots'||seen.has(store))return store;seen.add(store);const put=store.put;
  store.put=function(...parameters:Parameters<IDBObjectStore['put']>){const result=Reflect.apply(put,this,parameters) as IDBRequest<IDBValidKey>,row=parameters[0],f=watched!;
   if(row?.accountId===f.scope.accountId&&row?.spaceId===f.scope.spaceId){
    if(typeof row.key==='string'&&row.key.startsWith(`paper-history|${draftKey(f.scope)}|`)&&status.expected)status.expected.historyKey=row.key;
    const value=row.value as Receipt|undefined,kind=f.kind==='pdf'?'paper-pdf-import':'paper-append-archive';
    if(value?.kind===kind&&value.noteId===f.scope.noteId&&(f.id===null||value.id===f.id)){
     f.id=value.id;if(status.expected)capture(value);
     receipts.push(value);
     if(armed&&value.state==='applied')hold(tx,row.key);
    }
   }return result;
  };return store;
 };return tx;
};

async function produce(name:Case,runId:string){
 const f=describe(name,runId);watched=f;const baseline=await seed(f),file=await fixtureFile(f.kind);
 const staged=f.kind==='pdf'?await stagePaperPdfImport({scope:f.scope,id:f.id!,file,current}):await stagePaperAppendArchive({scope:f.scope,id:f.id!,file,current});capture(staged);
 if(name.endsWith('-source')){check(status.sourceAcknowledged,'Source helper returned before a native ACK');status.phase='ready-kill';return;}
 const ready=f.kind==='pdf'?await preparePaperPdfImport({scope:f.scope,id:f.id!,current}):await preparePaperAppendArchive({scope:f.scope,id:f.id!,current});capture(ready);check(status.readyAcknowledged,'Ready helper returned before a native ACK');
 if(name.endsWith('-ready')){status.phase='ready-kill';return;}
 const plan=f.kind==='pdf'?await preparePaperPdfImportPublication({document:baseline,scope:f.scope,id:f.id!,current}):await preparePaperAppendArchivePublication({document:baseline,scope:f.scope,id:f.id!,current});
 const history=plan.commit.snapshotChecks?.find(row=>row.key.startsWith(`paper-history|${draftKey(f.scope)}|`));check(history,'Prepared publication has no history CAS');status.expected!.publicationSha=fingerprint(plan.draft.content);status.expected!.historyKey=history!.key;
 armed=name.endsWith('publication-pending');await commitNotebookTransfer(plan.commit,current);
 check(!armed&&!held,'Uncommitted publication unexpectedly acknowledged');check(status.publicationAcknowledged,'Publication returned without a native transaction ACK');status.phase='ready-kill';
}
async function isolated(f:Context){
 for(const scope of [{...f.scope,accountId:f.scope.accountId+'-foreign'},{...f.scope,spaceId:f.scope.spaceId+'-foreign'},{...f.scope,noteId:f.scope.noteId+'-foreign'}]){
  const other={...f,scope};check((await listed(other)).length===0,'A foreign scope listed this import');let refused=false;try{await original(other);}catch(error){refused=error instanceof Error&&/reçu|importation|source|fichier/i.test(error.message);}check(refused,'Foreign scope read original bytes');
 }
}
async function inspect(name:Case,runId:string,expected:Expected){
 const f=describe(name,runId);f.id=expected.id;check(expected.kind===f.kind,'Expected import kind differs');const saved=await getDraft(identity(f.scope));check(saved&&isPaperDocument(saved.content),'Canonical baseline did not survive');const document=saved!.content as PaperDocument,value=await job(f),source=await original(f),input=await fixtureFile(f.kind);
 check(await exactBytes(source.blob,input)===expected.sourceSha&&source.blob.size===expected.sourceSize,'Recovered original SHA/size differs');const info=sourceInfo(value);check(info.sha===expected.sourceSha&&info.size===expected.sourceSize,'Recovered receipt no longer proves original bytes');await isolated(f);
 const rows=await listLocalBlobs(f.scope.accountId,f.scope.spaceId),histories=(await listSnapshots(f.scope.accountId,f.scope.spaceId)).filter(row=>row.key.startsWith(`paper-history|${draftKey(f.scope)}|`));
 if(name.endsWith('-source')){check(value.state==='source-staged','Source job advanced automatically after restart');check(fingerprint(document)===expected.baselineSha&&histories.length===0,'Source recovery changed original graph/history');check(rows.length===(f.kind==='pdf'?1:0)&&rows.every(row=>row.removedFromNote===true),'Raw source lost its held status');}
 else{
  check(rows.length===expected.ids.assets.length+(f.kind==='pdf'?1:0),'Mapped media or original file was duplicated or lost');
  same(ids(value),expected.ids,'Ready identities changed across process restart');check(readyDigest(value)===expected.readyDigest,'Ready mapping fingerprint changed');
  if(!name.endsWith('-applied')){
   check(value.state==='ready'&&(await listed(f)).length===1,'Ready job was replayed or lost');check(fingerprint(document)===expected.baselineSha&&histories.length===0,'Uncommitted publication did not roll back atomically');check(rows.every(row=>row.removedFromNote===true),'Uncommitted asset activation survived');
   const again=f.kind==='pdf'?await preparePaperPdfImport({scope:f.scope,id:f.id!,current}):await preparePaperAppendArchive({scope:f.scope,id:f.id!,current});same(ids(again),expected.ids,'Explicit preparation retry remapped IDs');check(fingerprint((await getDraft(identity(f.scope)))!.content)===expected.baselineSha,'A preparation retry silently published');
  }else{
   check(value.state==='applied'&&(await listed(f)).length===0,'Applied import reappeared as recoverable');check(fingerprint(document)===expected.publicationSha,'Published graph changed across restart');verifyPaperCollaboration(document);check(histories.length===1&&fingerprint(histories[0].value)===expected.baselineSha,'Atomic publication history missing');
   for(const id of expected.ids.assets)check(rows.find(row=>row.id===id)?.removedFromNote!==true,'Published asset stayed held');
   const removed=amendPaperCollaboration(document,applyPaperCommand(document,{type:'batch',commands:expected.ids.pages.map(id=>({type:'remove-page' as const,id}))}));await putDraft({...saved!,content:removed,syncState:'local'});
   const before=fingerprint((await getDraft(identity(f.scope)))!.content);let refused=false;try{if(f.kind==='pdf')await preparePaperPdfImportPublication({document:removed,scope:f.scope,id:f.id!,current});else await preparePaperAppendArchivePublication({document:removed,scope:f.scope,id:f.id!,current});}catch(error){refused=error instanceof Error&&/déjà|seconde fois/i.test(error.message);}check(refused,'Applied job reopened after page deletion');check(fingerprint((await getDraft(identity(f.scope)))!.content)===before,'Replay refusal changed the edited note');same(removed.pages.map(page=>page.id),expected.baselinePages,'Deleting imported pages removed an original page');check((await job(f)).state==='applied'&&(await listed(f)).length===0,'Applied receipt stopped being absorbing');await exactBytes((await original(f)).blob,input);
  }
 }
 if(value.state!=='source-staged')for(const id of expected.ids.assets){const row=rows.find(item=>item.id===id);check(row,'Mapped file missing after crash');const expectedSha=value.kind==='paper-pdf-import'?value.sha256:value.files.find(item=>item.id===id)!.sha256;check(row!.sha256===expectedSha&&await localBlobDigest(row!.blob)===expectedSha,'Mapped file bytes/manifest differ');}
 return {storage:'actual-browser-indexeddb',state:value.state,scopeIsolated:true,originalBytesExact:true,stableIdentities:value.state!=='source-staged',automaticReplay:false,atomicRollback:name.endsWith('publication-pending'),appliedAbsorbing:name.endsWith('-applied'),proofScope:'Production import/storage helpers in real Chromium; no native/power-loss claim'};
}
let uiRoot:import('react-dom/client').Root|null=null;
async function mountUi(name:Case,runId:string,first=false){
 const f=describe(name,runId);check(f.kind==='pdf','UI smoke is PDF only');watched=f;
 if(first)await seed(f,true);else check(await getDraft(identity(f.scope)),'Reopening UI must not seed a missing original');
 const [{createRoot},{createElement},{PaperNotebook},{WorkspaceTabVisibility},{appStorage}]=await Promise.all([import('react-dom/client'),import('react'),import('../src/components/PaperNotebook'),import('../src/lib/workspaceTabVisibility'),import('../src/lib/appStorage')]);
 await appStorage.initialize(localStorage,indexedDB);const node=document.createElement('div');node.id='actual-notebook';document.body.append(node);uiRoot=createRoot(node);uiRoot.render(createElement(WorkspaceTabVisibility.Provider,{value:true},createElement(PaperNotebook,{noteId:f.scope.noteId,markdown:'',onChange:()=>true,media:{accountId:f.scope.accountId,spaceId:f.scope.spaceId},metadata:{title:'Synthetic import browser fixture'}})));
 armed=first;status.phase='ui-mounted';
}
async function uiApplied(name:Case,runId:string,expected:Expected){
 const f=describe(name,runId);f.id=expected.id;const saved=await getDraft(identity(f.scope)),value=await job(f);check(saved&&isPaperDocument(saved.content)&&value.kind==='paper-pdf-import'&&value.state==='applied','Real Notebook UI did not publish its job');const document=saved!.content as PaperDocument;verifyPaperCollaboration(document);same(ids(value),expected.ids,'UI resume changed prepared identities');check(document.pages.length===expected.baselinePages.length+5&&expected.ids.pages.every(id=>document.pages.some(page=>page.id===id))&&expected.baselinePages.every(id=>document.pages.some(page=>page.id===id)),'UI resume lost/duplicated imported or original pages');check(fingerprint(document.pages.filter(page=>expected.baselinePages.includes(page.id)))===expected.baselinePageSha,'UI resume changed original page geometry or metadata');check(document.assets.filter(asset=>asset.id===(value as PaperPdfImportReceipt).assetId).length===1,'UI resume duplicated its PDF asset');check((await listed(f)).length===0,'UI applied job stayed recoverable');check((await listLocalBlobs(f.scope.accountId,f.scope.spaceId)).length===2,'UI resume duplicated or lost raw/active files');await exactBytes((await original(f)).blob,await fixtureFile('pdf'));await isolated(f);return {storage:'actual-browser-indexeddb',scopeIsolated:true,originalBytesExact:true,stableIdentities:true,actualNotebookUi:true,actualFileChooser:true,pages:document.pages.length,receipt:'applied',graphSha:fingerprint(document)};
}
async function uiReady(name:Case,runId:string){const f=describe(name,runId),saved=await getDraft(identity(f.scope));check(status.expected&&saved&&isPaperDocument(saved.content),'Actual UI original is not durable');verifyPaperCollaboration(saved!.content as PaperDocument);check(fingerprint(saved!.content)===status.expected!.baselineSha,'Mounting the actual Notebook changed the baseline');check((await listPaperPdfImports(f.scope,current)).length===0,'Actual UI started with an unrelated import');return {durableLineage:true,jobs:0};}
let running=false;
const api={start:(name:Case,runId:string)=>{check(!running,'Producer already started');running=true;void (name.startsWith('ui-')?mountUi(name,runId,true):produce(name,runId)).catch(error=>{status.error=String(error instanceof Error?error.message:error).slice(0,500);status.phase='error';});},status:()=>structuredClone(status),inspect,mountUi:(name:Case,runId:string)=>mountUi(name,runId,false),uiReady,uiApplied};
declare global {interface Window{__paperImportCrash:typeof api}}
window.__paperImportCrash=api;
