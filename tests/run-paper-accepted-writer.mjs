import {mountedCleanup,requireBoundedMountedCheck,mountedAuditPath} from './mounted-cleanup.mjs';
import {build} from 'vite';
import {indexedDB} from 'fake-indexeddb';
import {JSDOM} from 'jsdom';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
requireBoundedMountedCheck();
const out=await mkdtemp(join(process.cwd(),'tests/.paper-accepted-writer-'));
globalThis.indexedDB=indexedDB;process.env.NODE_ENV='development';
let dom,m,root,paper,props,sequence=0,passed=0,failed=0,groupsStarted=0,fatal,cleanupFinal;
const originalOpen=indexedDB.open,gates=[],faults=[],owners=new Set(),proof=[],sourceHashes={};
const declaredGroups=[
 'Accepted text survives immediate note/year/account rerender and never adopts the replacement scope',
 'Accepted tail survives same-frame unmount and reopening retains exact text without a leaked writer',
 'Unmount during delayed disk write keeps account close waiting until accepted original is durable',
 'An old-scope server tombstone preserves accepted branch in recovery without recreating its canonical draft',
 'An old-scope canonical conflict keeps remote exact and accepted local branch recoverable without changing the new account',
 'Concurrent old-scope live text merges from the captured accepted branch rather than the new-account RAM document',
 'Every accepted branch behind a failed tail retains its own recovery snapshot and old conflict stays untouched',
 'Closing old account during accepted write waits for A while stale participants cannot suspend, flush or resume B',
 'Double quota failure keeps the actual accepted writer pending and refuses close until one stable recovery is confirmed',
 'Retired account recovery remains scoped across a tombstone and concurrent close while the replacement note keeps writing',
 'Two accepted branches behind a double-failed tail retain distinct recovery copies through unmount and later close'
];
const errorDetails=error=>({name:error?.name??'Error',message:String(error?.message??error).slice(0,500),...(error instanceof AggregateError?{errors:error.errors.slice(0,4).map(item=>({name:item?.name??'Error',message:String(item?.message??item).slice(0,180)}))}: {})});
const stamp='2026-10-13T18:00:00Z',tick=()=>new Promise(resolve=>setTimeout(resolve,8));
const key=(scope,noteId)=>({...scope,type:'whiteboard',documentId:m.notebookDocumentId(noteId)});
const current=()=>paper?.document&&paper.saved&&paper.legacyReady&&!paper.reconciling&&!paper.blocked;
const waitFor=async(predicate,message='Accepted writer did not settle')=>{for(let attempt=0;attempt<220;attempt++){await m.act(async()=>{await tick();});if(await predicate())return;}throw Error(message);};
const paint=(next)=>{props=next;m.flushSync(()=>root.render(m.createElement(m.AcceptedWriterRecipe,{...props,report:value=>{paper=value;}})));};
const render=async(next)=>{await m.act(async()=>paint(next));await waitFor(current);};
const cleanupOwned=()=>mountedCleanup([
 ['Restore real storage and release delayed opens',()=>{for(const fault of faults.splice(0))fault.restore();indexedDB.open=originalOpen;for(const gate of gates.splice(0))gate.release();}],
 ['Unmount current recipe',async()=>{if(root){await m.act(async()=>root.unmount());root=null;}}],
 // Retired double-failure writers remain registered intentionally. After the
 // quota seam is restored, close explicitly retries their captured recoveries.
 ['Confirm every retained original-account writer',async()=>{if(m)for(const account of owners)await m.act(async()=>{await m.settleNotebookAccount(account);});}],
 ['Resume and verify registrations',async()=>{m?.resumeAllNotebookAccounts();if(m)await waitFor(()=>!m.hasPendingNotebookWrites(),'An unconfirmed accepted writer remains after storage was restored');owners.clear();paper=null;}],
]);
const group=async(name,run)=>{groupsStarted++;try{await run();passed++;proof.push({name,status:'PASS'});console.log(name+': PASS');}catch(error){failed++;proof.push({name,status:'FAIL',error:errorDetails(error)});console.error(name+': FAIL '+JSON.stringify(errorDetails(error)));}finally{await cleanupOwned();}};
const seed=async(scope,noteId,markdown='Original')=>{
 owners.add(scope.accountId);
 const plain=m.migratePaper(noteId,markdown,null,stamp),document=m.amendPaperCollaboration(plain,plain),identity=key(scope,noteId),draft={...identity,title:'Original',content:document,baseVersion:7,updatedAt:1,syncState:'synced'},metadata={...scope,type:'notesMarkdown',documentId:noteId,title:'Original',content:{id:noteId,markdown},baseVersion:3,updatedAt:1,syncState:'synced'};
 await m.putDraft(draft);await m.putDraft(metadata);await m.putSnapshot({key:`paper-migration|${scope.accountId}|${scope.spaceId}|whiteboard|${identity.documentId}`,...scope,value:{markdown,legacy:null,migratedAt:stamp}});return {scope,noteId,identity,draft,metadata,document};
};
const fixture=async(label)=>{const scope={accountId:'qa-accepted-writer-'+label+'-'+(++sequence),spaceId:'year-2026'},noteId='Accepted note é | '+label,f=await seed(scope,noteId);root=m.createRoot(document.getElementById('root'));await render({noteId,markdown:'Original',media:scope});return {...f,draft:await m.getDraft(f.identity),document:paper.getCurrent()};};
const branch=(text)=>paper.command({type:'patch-object',id:paper.getCurrent().objects.find(o=>o.kind==='text').id,patch:{markdown:text}});
const history=async(f)=>(await m.listSnapshots(f.scope.accountId,f.scope.spaceId)).filter(row=>row.key.startsWith(`paper-history|${f.scope.accountId}|${f.scope.spaceId}|whiteboard|${f.identity.documentId}|`));
const delayNextOpen=()=>{let release,started,used=false;const held=new Promise(resolve=>release=resolve),began=new Promise(resolve=>started=resolve);indexedDB.open=function(...args){const request=originalOpen.apply(this,args);if(!used){used=true;let handler=null;Object.defineProperty(request,'onsuccess',{configurable:true,get:()=>handler,set:callback=>handler=typeof callback==='function'?event=>{started();void held.then(()=>callback.call(request,event));}:callback});}return request;};const gate={release,began};gates.push(gate);return gate;};
// Fault only the actual transaction boundary. Reads, graphs, IDB requests and
// successful commits remain real fake-indexeddb; no production API is mocked.
const storageQuota=()=>{
 let enabled=true;const counts={canonical:0,recovery:0};
 indexedDB.open=function(...args){const request=originalOpen.apply(this,args);request.addEventListener('success',()=>{const database=request.result,transaction=database.transaction.bind(database);database.transaction=(stores,mode,...rest)=>{const names=typeof stores==='string'?[stores]:Array.from(stores);if(enabled&&mode==='readwrite'&&names.includes('snapshots')){const kind=names.includes('drafts')?'canonical':names.length===1?'recovery':null;if(kind){counts[kind]++;throw new dom.window.DOMException('Synthetic storage quota at the real transaction boundary','QuotaExceededError');}}return transaction(stores,mode,...rest);};},{once:true});return request;};
 const fault={counts,restore:()=>{enabled=false;indexedDB.open=originalOpen;}};faults.push(fault);return fault;
};
const swapTarget=async(f,kind='account')=>{const scope=kind==='account'?{...f.scope,accountId:f.scope.accountId+'-other'}:kind==='year'?{...f.scope,spaceId:'year-2027'}:f.scope,noteId=kind==='note'?f.noteId+' next':f.noteId;return seed(scope,noteId);};
const acceptedDelayed=async(f,text,target)=>{const delayed=delayNextOpen();await m.act(async()=>{assert.equal(branch(text),true);await delayed.began;});if(target)await render({noteId:target.noteId,markdown:'Original',media:target.scope});return delayed;};
const settleOwned=async(f)=>{await m.act(async()=>{await m.settleNotebookAccount(f.scope.accountId);});await waitFor(()=>!m.hasPendingNotebookWrites());};
try{
 await build({configFile:false,ssr:{noExternal:['yjs','lib0']},build:{ssr:'tests/paper-accepted-writer-entry.ts',outDir:out,copyPublicDir:false,minify:false,sourcemap:false,reportCompressedSize:false,rollupOptions:{output:{entryFileNames:'accepted-writer.mjs'}}},logLevel:'error'});
 dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://qa.invalid/'});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,CustomEvent:dom.window.CustomEvent,Event:dom.window.Event,IS_REACT_ACT_ENVIRONMENT:true});Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
 globalThis.addEventListener=dom.window.addEventListener.bind(dom.window);globalThis.removeEventListener=dom.window.removeEventListener.bind(dom.window);globalThis.dispatchEvent=dom.window.dispatchEvent.bind(dom.window);
 m=await import(pathToFileURL(join(out,'accepted-writer.mjs')));
 await group('Accepted text survives immediate note/year/account rerender and never adopts the replacement scope',async()=>{
  for(const kind of ['note','year','account']){const f=await fixture('immediate-'+kind),target=await swapTarget(f,kind),text='Accepted '+kind+'. Original';await m.act(async()=>{assert.equal(branch(text),true);paint({noteId:target.noteId,markdown:'Original',media:target.scope});});await waitFor(current);await settleOwned(f);const source=await m.getDraft(f.identity),replacement=await m.getDraft(target.identity);assert.equal(m.paperMarkdown(source.content),text);assert.equal(m.paperMarkdown(replacement.content),'Original');assert.equal(source.baseVersion,7);m.verifyPaperCollaboration(source.content);assert.equal(paper.getCurrent().noteId,target.noteId);await m.act(async()=>root.unmount());root=null;paper=null;m.resumeAllNotebookAccounts();}
 });
 await group('Accepted tail survives same-frame unmount and reopening retains exact text without a leaked writer',async()=>{
  const f=await fixture('unmount'),text='Accepted before unmount. Original';await m.act(async()=>{assert.equal(branch(text),true);root.unmount();root=null;});await settleOwned(f);assert.equal(m.paperMarkdown((await m.getDraft(f.identity)).content),text);m.resumeNotebookAccount(f.scope.accountId);root=m.createRoot(document.getElementById('root'));await render({noteId:f.noteId,markdown:'Original',media:f.scope});assert.equal(m.paperMarkdown(paper.getCurrent()),text);
 });
 await group('Unmount during delayed disk write keeps account close waiting until accepted original is durable',async()=>{
  const f=await fixture('delayed-unmount'),text='Accepted delayed unmount. Original',delayed=await acceptedDelayed(f,text);await m.act(async()=>{root.unmount();root=null;});let closed=false,closing;await m.act(async()=>{closing=m.settleNotebookAccount(f.scope.accountId).then(()=>{closed=true;});await tick();await tick();});assert.equal(closed,false);assert.equal(m.hasPendingNotebookWrites(),true);await m.act(async()=>{delayed.release();await closing;});assert.equal(closed,true);assert.equal(m.paperMarkdown((await m.getDraft(f.identity)).content),text);assert.equal(m.hasPendingNotebookWrites(),false);
 });
 await group('An old-scope server tombstone preserves accepted branch in recovery without recreating its canonical draft',async()=>{
  const f=await fixture('deleted'),target=await swapTarget(f),text='Accepted but remote-deleted. Original',delayed=await acceptedDelayed(f,text,target);await m.applyChangePage(f.scope.accountId,f.scope.spaceId,{items:[{space_id:f.scope.spaceId,document_type:'whiteboard',document_id:f.identity.documentId,version:8,content:null,deleted:true,changed_at:stamp}],has_more:false,next_cursor:'deleted-8'});const marker=await m.readNotebookDeletionStatus(f.noteId,f.scope);assert.ok(marker);await m.act(async()=>delayed.release());await settleOwned(f);assert.equal(await m.getDraft(f.identity),undefined);assert.deepEqual(await m.readNotebookDeletionStatus(f.noteId,f.scope),marker);assert.ok((await history(f)).some(row=>m.paperMarkdown(row.value)===text));assert.equal(m.paperMarkdown((await m.getDraft(target.identity)).content),'Original');assert.equal(paper.blocked,false);assert.equal(paper.notice,'');
 });
 await group('An old-scope canonical conflict keeps remote exact and accepted local branch recoverable without changing the new account',async()=>{
  const f=await fixture('conflict'),target=await swapTarget(f),text='Accepted conflicted branch. Original',delayed=await acceptedDelayed(f,text,target),remote=m.amendPaperCollaboration(f.document,m.applyPaperCommand(f.document,{type:'patch-object',id:f.document.objects[0].id,patch:{markdown:'Remote exact conflict. Original'}}),'remote-conflict');const stored={...f.draft,content:remote,baseVersion:22,syncState:'conflict',conflict:{serverVersion:22,reason:'QA conflict'}};await m.putDraft(stored);await m.act(async()=>delayed.release());await settleOwned(f);assert.deepEqual((await m.getDraft(f.identity)).content,remote);assert.equal((await m.getDraft(f.identity)).syncState,'conflict');assert.ok((await history(f)).some(row=>m.paperMarkdown(row.value)===text));assert.equal(m.paperMarkdown((await m.getDraft(target.identity)).content),'Original');assert.equal(paper.blocked,false);
 });
 await group('Concurrent old-scope live text merges from the captured accepted branch rather than the new-account RAM document',async()=>{
  const f=await fixture('merge'),target=await swapTarget(f),delayed=await acceptedDelayed(f,'Accepted addition. Original',target),remote=m.amendPaperCollaboration(f.document,m.applyPaperCommand(f.document,{type:'patch-object',id:f.document.objects[0].id,patch:{markdown:'Remote addition. Original'}}),'remote-live');await m.putDraft({...f.draft,content:remote,baseVersion:22,syncState:'synced'});await m.act(async()=>delayed.release());await settleOwned(f);const saved=await m.getDraft(f.identity),text=m.paperMarkdown(saved.content);assert.ok(text.includes('Accepted addition.'));assert.ok(text.includes('Remote addition.'));assert.equal(saved.baseVersion,22);m.verifyPaperCollaboration(saved.content);assert.equal(m.paperMarkdown((await m.getDraft(target.identity)).content),'Original');assert.equal(m.paperMarkdown(paper.getCurrent()),'Original');const mutations=await m.listMutations(f.scope.accountId,f.scope.spaceId);assert.ok(mutations.every(row=>row.accountId===f.scope.accountId&&row.spaceId===f.scope.spaceId));
 });
 await group('Every accepted branch behind a failed tail retains its own recovery snapshot and old conflict stays untouched',async()=>{
  const f=await fixture('failed-tail'),target=await swapTarget(f),first='First accepted. Original',second='Second accepted. Original',delayed=delayNextOpen();await m.act(async()=>{assert.equal(branch(first),true);assert.equal(branch(second),true);await delayed.began;});await render({noteId:target.noteId,markdown:'Original',media:target.scope});const remote={...f.draft,syncState:'conflict',baseVersion:30,conflict:{serverVersion:30}};await m.putDraft(remote);await m.act(async()=>delayed.release());await settleOwned(f);const branches=await history(f);assert.ok(branches.some(row=>m.paperMarkdown(row.value)===first));assert.ok(branches.some(row=>m.paperMarkdown(row.value)===second));assert.deepEqual((await m.getDraft(f.identity)).content,remote.content);assert.equal(m.paperMarkdown((await m.getDraft(target.identity)).content),'Original');
 });
 await group('Closing old account during accepted write waits for A while stale participants cannot suspend, flush or resume B',async()=>{
  const f=await fixture('old-close'),target=await swapTarget(f),text='Accepted in closing A. Original',delayed=await acceptedDelayed(f,text);let closed=false,closing;await m.act(async()=>{closing=m.settleNotebookAccount(f.scope.accountId).then(()=>{closed=true;});await tick();});assert.equal(closed,false);await render({noteId:target.noteId,markdown:'Original',media:target.scope});await m.act(async()=>{assert.equal(branch('First in B. Original'),true);await paper.whenSaved();});await waitFor(current);assert.equal(m.paperMarkdown((await m.getDraft(target.identity)).content),'First in B. Original');await m.act(async()=>{delayed.release();await closing;});assert.equal(closed,true);assert.equal(m.paperMarkdown((await m.getDraft(f.identity)).content),text);await m.act(async()=>{assert.equal(branch('Future in B. Original'),true);await paper.whenSaved();});assert.equal(m.paperMarkdown((await m.getDraft(target.identity)).content),'Future in B. Original');await m.act(async()=>{await m.settleNotebookAccount(target.scope.accountId);m.resumeNotebookAccount(f.scope.accountId);assert.equal(branch('Must stay refused in closed B'),false);m.resumeNotebookAccount(target.scope.accountId);assert.equal(branch('Resumed B. Original'),true);await paper.whenSaved();});assert.equal(m.paperMarkdown((await m.getDraft(target.identity)).content),'Resumed B. Original');assert.equal(m.paperMarkdown((await m.getDraft(f.identity)).content),text);
 });
 await group('Double quota failure keeps the actual accepted writer pending and refuses close until one stable recovery is confirmed',async()=>{
  const f=await fixture('double-quota'),text='Accepted while disk is full. Original',quota=storageQuota();let originalTail;
  await m.act(async()=>{assert.equal(branch(text),true);originalTail=paper.whenSaved();await assert.rejects(originalTail,error=>error?.name==='QuotaExceededError');});
  await waitFor(()=>paper.blocked&&paper.notice.includes('fermeture est refusée'),'Double failure must be visible without claiming durable recovery');
  assert.equal(paper.saved,false);assert.equal(m.paperMarkdown(paper.getCurrent()),text);assert.equal(m.paperMarkdown((await m.getDraft(f.identity)).content),'Original');assert.equal(m.hasPendingNotebookWrites(),true);assert.ok(quota.counts.canonical>=1);assert.equal(quota.counts.recovery,1);
  for(let attempt=0;attempt<2;attempt++){const before=quota.counts.recovery;await m.act(async()=>{await assert.rejects(m.settleNotebookAccount(f.scope.accountId),m.NotebookAcceptedWriteRecoveryError);});assert.equal(quota.counts.recovery,before+1,'Main and receipt flush must join one stable retry');assert.equal(m.hasPendingNotebookWrites(),true);assert.equal(paper.saved,false);}
  const canonicalAttempts=quota.counts.canonical;quota.restore();await m.act(async()=>{await m.settleNotebookAccount(f.scope.accountId);});
  const recovered=(await history(f)).filter(row=>row.key.includes('|accepted-')&&m.paperMarkdown(row.value)===text);assert.equal(recovered.length,1,'Retries must confirm one stable recovery identity');assert.equal(quota.counts.canonical,canonicalAttempts,'Retry must never publish the failed canonical branch');assert.equal(m.paperMarkdown((await m.getDraft(f.identity)).content),'Original');assert.equal(m.hasPendingNotebookWrites(),false);assert.equal(paper.saved,false,'Recovery proof is not canonical save success');assert.equal(paper.blocked,true);await assert.rejects(originalTail,error=>error?.name==='QuotaExceededError');
 });
 await group('Retired account recovery remains scoped across a tombstone and concurrent close while the replacement note keeps writing',async()=>{
  const f=await fixture('retired-quota'),target=await swapTarget(f),text='Retained A after double quota. Original',quota=storageQuota();let originalTail;
  await m.act(async()=>{assert.equal(branch(text),true);originalTail=paper.whenSaved();await assert.rejects(originalTail,error=>error?.name==='QuotaExceededError');});assert.equal(m.hasPendingNotebookWrites(),true);quota.restore();
  await m.applyChangePage(f.scope.accountId,f.scope.spaceId,{items:[{space_id:f.scope.spaceId,document_type:'whiteboard',document_id:f.identity.documentId,version:8,content:null,deleted:true,changed_at:stamp}],has_more:false,next_cursor:'retired-quota-8'});const marker=await m.readNotebookDeletionStatus(f.noteId,f.scope);assert.ok(marker);
  await render({noteId:target.noteId,markdown:'Original',media:target.scope});assert.equal(paper.blocked,false);assert.equal(paper.notice,'');const delayed=delayNextOpen();let closing,closed=false;
  await m.act(async()=>{closing=m.settleNotebookAccount(f.scope.accountId);assert.equal(m.settleNotebookAccount(f.scope.accountId),closing,'Concurrent closes share the actual account barrier');void closing.then(()=>{closed=true;},()=>{});await delayed.began;});assert.equal(closed,false);assert.equal(m.hasPendingNotebookWrites(),true);
  await m.act(async()=>{assert.equal(branch('Independent B while A recovery waits. Original'),true);await paper.whenSaved();});await waitFor(current);
  await m.act(async()=>{delayed.release();await closing;});assert.equal(closed,true);assert.equal(await m.getDraft(f.identity),undefined,'Recovery must not recreate deleted canonical A');assert.deepEqual(await m.readNotebookDeletionStatus(f.noteId,f.scope),marker);const recovered=(await history(f)).filter(row=>row.key.includes('|accepted-')&&m.paperMarkdown(row.value)===text);assert.equal(recovered.length,1);assert.equal(m.paperMarkdown((await m.getDraft(target.identity)).content),'Independent B while A recovery waits. Original');assert.equal(paper.blocked,false);assert.equal(paper.notice,'');
  await m.act(async()=>{assert.equal(branch('Future B after A close. Original'),true);await paper.whenSaved();});assert.equal(m.paperMarkdown((await m.getDraft(target.identity)).content),'Future B after A close. Original');await assert.rejects(originalTail,error=>error?.name==='QuotaExceededError');
 });
 await group('Two accepted branches behind a double-failed tail retain distinct recovery copies through unmount and later close',async()=>{
  const f=await fixture('double-failed-tail'),first='First retained branch. Original',second='Second retained branch. Original',quota=storageQuota();let originalTail;
  await m.act(async()=>{assert.equal(branch(first),true);assert.equal(branch(second),true);originalTail=paper.whenSaved();await assert.rejects(originalTail,error=>error?.name==='QuotaExceededError');});assert.equal(quota.counts.recovery,2);assert.equal(m.hasPendingNotebookWrites(),true);assert.equal(m.paperMarkdown(paper.getCurrent()),second);
  await m.act(async()=>{root.unmount();root=null;});assert.equal(m.hasPendingNotebookWrites(),true,'Unmount must keep both unconfirmed receipts');await assert.rejects(m.settleNotebookAccount(f.scope.accountId),m.NotebookAcceptedWriteRecoveryError);assert.equal(m.hasPendingNotebookWrites(),true);
  quota.restore();await m.act(async()=>{await m.settleNotebookAccount(f.scope.accountId);});const recovered=(await history(f)).filter(row=>row.key.includes('|accepted-'));assert.equal(recovered.filter(row=>m.paperMarkdown(row.value)===first).length,1);assert.equal(recovered.filter(row=>m.paperMarkdown(row.value)===second).length,1);assert.equal(new Set(recovered.map(row=>row.key)).size,2);assert.equal(m.paperMarkdown((await m.getDraft(f.identity)).content),'Original');assert.equal(m.hasPendingNotebookWrites(),false);await assert.rejects(originalTail,error=>error?.name==='QuotaExceededError');
 });
 console.log(`Accepted writer lifecycle groups: ${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
}catch(error){fatal=errorDetails(error);process.exitCode=1;console.error('Accepted writer fatal: '+JSON.stringify(fatal));}
finally{
 try{await cleanupOwned();cleanupFinal={status:'PASS'};}catch(error){cleanupFinal={status:'FAIL',error:errorDetails(error)};process.exitCode=1;}
 for(const name of declaredGroups)if(!proof.some(row=>row.name===name))proof.push({name,status:'NOTRUN'});
 try{
  for(const path of ['src/hooks/usePaperDocument.ts','src/lib/notebookAcceptedWrite.ts','tests/paper-accepted-writer-entry.ts','tests/run-paper-accepted-writer.mjs'])sourceHashes[path]=createHash('sha256').update(await readFile(join(process.cwd(),path))).digest('hex');
  await writeFile(mountedAuditPath('t-x02-accepted-writer-mounted-tests-20261014.json'),JSON.stringify({date:'2026-10-14',executedAt:new Date().toISOString(),passed,failed,declaredGroups:declaredGroups.length,groupsStarted,allGroupsAttempted:groupsStarted===declaredGroups.length,groups:proof,fatal:fatal??null,cleanupFinal,sourceHashes,realUsePaperDocumentMounted:Boolean(m),realIndexedDBStorage:'fake-indexeddb actual transactions',syntheticStorageQuota:true,realStorageQuotaOrNativeCloseVerified:false},null,2));
 }catch(error){process.exitCode=1;console.error('Accepted writer report failure: '+JSON.stringify(errorDetails(error)));}
 dom?.window.close();await rm(out,{recursive:true,force:true});
}
