import {build} from 'vite';
import {indexedDB} from 'fake-indexeddb';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {zipSync,strToU8} from 'fflate';
const out=await mkdtemp(join(process.cwd(),'tests/.archive-'));
globalThis.indexedDB=indexedDB;Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
globalThis.CustomEvent=class extends Event{constructor(type,options){super(type);this.detail=options?.detail;}};globalThis.dispatchEvent=()=>true;
const deadline=async(promise,label)=>{let timer;try{return await Promise.race([promise,new Promise((_resolve,reject)=>{timer=setTimeout(()=>reject(Error(label+': timeout')),10000);})]);}finally{clearTimeout(timer);}};
/** Preserve real fakeIndexedDB requests and transactions. A completed metadata
 * read can be held before its caller observes the result; an injected quota at
 * a successful blob request must abort and roll back the real transfer. */
const archiveStorageFault=({metadataKey,quotaAccount,observeSettled}={})=>{
 const originalOpen=indexedDB.open,seen=new WeakSet(),ledger={metadataReads:0,metadataWasAbsent:false,quotaThrows:0,successfulBlobWrites:0,aborts:0,errorEvents:0,pendingSamples:0,settledBeforeAbort:false};
 let entered,release,aborted,held=false;const began=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;}),terminalAbort=new Promise(resolve=>{aborted=resolve;});
 indexedDB.open=function(...args){
  const request=originalOpen.apply(this,args);
  request.addEventListener('success',()=>{
   const database=request.result,transaction=database.transaction.bind(database);
   database.transaction=(...parameters)=>{
    const tx=transaction(...parameters),mode=parameters[1]??'readonly',objectStore=tx.objectStore.bind(tx),stores=Array.from(tx.objectStoreNames),transfer=mode==='readwrite'&&stores.length===3&&['drafts','scopedBlobs','snapshots'].every(name=>stores.includes(name));let holdComplete=false,observedTransfer=false;
    // Pending request errors can reject the storage Promise before this real
    // terminal event. Only the transfer that read/wrote the fault's scope may
    // release the assertion barrier; an unrelated transaction cannot do so.
    tx.addEventListener('abort',()=>{ledger.aborts++;if(observedTransfer)aborted();},{once:true});
    tx.addEventListener('error',()=>{if(transfer&&observedTransfer){ledger.errorEvents++;queueMicrotask(()=>queueMicrotask(()=>{if(!ledger.aborts){ledger.pendingSamples++;if(observeSettled?.())ledger.settledBeforeAbort=true;}}));}});
    if(metadataKey&&mode==='readonly'){
     let callback=null;
     Object.defineProperty(tx,'oncomplete',{configurable:true,get:()=>callback,set:fn=>{callback=typeof fn==='function'?event=>{if(!holdComplete){fn.call(tx,event);return;}entered();void gate.then(()=>fn.call(tx,event));}:fn;}});
    }
    tx.objectStore=name=>{
     const store=objectStore(name);if(seen.has(store))return store;seen.add(store);
     if(metadataKey&&name==='drafts'){
      const get=store.get.bind(store);store.get=key=>{const read=get(key);if(key===metadataKey){if(transfer)observedTransfer=true;if(mode==='readonly'&&!held){held=true;holdComplete=true;read.addEventListener('success',()=>{ledger.metadataReads++;ledger.metadataWasAbsent=read.result===undefined;},{once:true});}}return read;};
     }
     if(quotaAccount&&mode==='readwrite'&&name==='scopedBlobs'){
      const put=store.put.bind(store);store.put=(value,...rest)=>{const write=put(value,...rest);if(value.accountId===quotaAccount){if(transfer)observedTransfer=true;write.addEventListener('success',()=>{ledger.successfulBlobWrites++;if(!ledger.quotaThrows){ledger.quotaThrows++;throw new DOMException('Synthetic quota after a real blob write','QuotaExceededError');}},{once:true});}return write;};
     }
     return store;
    };
    return tx;
   };
  },{once:true});return request;
 };
 return {ledger,began,release,terminalAbort,restore:()=>{release();indexedDB.open=originalOpen;}};
};
try{
 await build({configFile:false,ssr:{noExternal:['yjs','lib0']},build:{ssr:'tests/notebook-archive-entry.ts',outDir:out,rollupOptions:{output:{entryFileNames:'archive.mjs'}}},logLevel:'error'});
 const m=await import(pathToFileURL(out+'/archive.mjs'));
 const scope={accountId:'qa-archive-source',spaceId:'year'},target={accountId:'qa-archive-target',spaceId:'year'},stamp='2026-10-12T10:00:00Z';
 const plain=m.migratePaper('original','# Carnet de mécanique\n\n![Photo](dowze-photo:note-original/image)\n\nCours et annotations.',null,stamp);
 const doc=m.amendPaperCollaboration(plain,m.applyPaperCommand(plain,{type:'batch',commands:[{type:'add-asset',asset:{id:'image',name:'figure.png',mediaType:'image/png',size:3}},{type:'add-asset',asset:{id:'sound',name:'cours.wav',mediaType:'audio/wav',size:3}},{type:'add-audio',audio:{id:'recording',assetId:'sound',name:'Explication',duration:2,startedAt:1}},{type:'upsert-object',object:{...plain.objects[0],id:'ink',kind:'ink',markdown:undefined,points:[{x:1,y:10,time:1},{x:50,y:90,time:2}],strokeWidth:3,color:'#4461dc',audioAnchor:{sessionId:'recording',time:1}}}]}));
 const metadata={id:doc.noteId,title:'Mécanique — cours 1',markdown:plain.objects[0].markdown,tags:['Physique','À revoir'],subjectIds:['mecanique'],createdAt:stamp,updatedAt:stamp};
 let library=m.emptyNotebookLibrary();for(const folder of [{id:'a',parentId:null,title:'Année 1',color:'#4461dc',order:0},{id:'b',parentId:'a',title:'Physique',color:'#16a08a',order:0},{id:'c',parentId:'b',title:'Mécanique',color:'#dd4050',order:0},{id:'unrelated',parentId:null,title:'Autres notes privées',color:'#f6c447',order:1}])library=m.updateNotebookLibrary(library,{folder});library=m.updateNotebookLibrary(library,{notes:[{id:'original',patch:{folderId:'c',favorite:true,cover:{color:'#fff4d8',pattern:'grid'}}},{id:'unrelated-note',patch:{folderId:'unrelated',favorite:false}}]});
 await m.putDraft({...scope,type:'preferences',documentId:m.LIBRARY_DOCUMENT_ID,title:'Library',content:library,baseVersion:0,updatedAt:1,syncState:'local'});for(const [id,text,type] of [['image','IMG','image/png'],['sound','WAV','audio/wav']])await m.putLocalBlob({...scope,id,name:id,createdAt:1,status:'uploaded',serverId:'source-'+id,blob:new Blob([text],{type})});
 const before=(await m.listLocalBlobs(scope.accountId,scope.spaceId)).map(({blob,...rest})=>rest);
 const blob=await m.buildPaperArchive(doc,scope,metadata);const bytes=new Uint8Array(await blob.arrayBuffer()),archive=await m.verifyPaperArchive(bytes);
 assert.equal(archive.metadata.note.title,metadata.title);assert.deepEqual(archive.metadata.note.tags,metadata.tags);assert.deepEqual(archive.metadata.note.subjectIds,['mecanique']);assert.deepEqual(archive.metadata.folderPath.map(f=>f.title),['Année 1','Physique','Mécanique']);assert.equal(archive.metadata.classification.cover.pattern,'grid');assert.ok(!new TextDecoder().decode(archive.files['metadata.json']).includes('Autres notes privées'));assert.equal(archive.document.objects.find(o=>o.id==='ink').audioAnchor.time,1);assert.deepEqual((await m.listLocalBlobs(scope.accountId,scope.spaceId)).map(({blob,...rest})=>rest),before);
 console.log('Archive complete: title/tags/subjects/cover/folder ancestors and audio linkage; unrelated data excluded; originals unchanged: PASS');
 const tampered={...archive.files,[archive.integrity.assetPaths.image]:strToU8('BAD')};await assert.rejects(()=>m.verifyPaperArchive(zipSync(tampered)),/endommagé/);const changedMeta={...archive.metadata,note:{...archive.metadata.note,title:'Titre altéré'}};await assert.rejects(()=>m.verifyPaperArchive(zipSync({...archive.files,'metadata.json':strToU8(JSON.stringify(changedMeta))})));await assert.rejects(()=>m.verifyPaperArchive(zipSync({...archive.files,'metadata.json':strToU8(JSON.stringify({...archive.metadata,schema:2}))})));
 console.log('Archive verification: same-size corrupted media, modified metadata and future schema rejected: PASS');
 let destLibrary=m.updateNotebookLibrary(m.emptyNotebookLibrary(),{folder:{id:'existing-a',parentId:null,title:'Année 1',color:'#4461dc',order:0}});destLibrary=m.updateNotebookLibrary(destLibrary,{note:{id:'existing-note',patch:{folderId:'existing-a',favorite:true}}});const libraryDraft={...target,type:'preferences',documentId:m.LIBRARY_DOCUMENT_ID,title:'Library',content:destLibrary,baseVersion:0,updatedAt:1,syncState:'local'};await m.putDraft(libraryDraft);
 const id='imported';const imported=await m.stageNotebookArchive(Object.assign(blob,{name:'mecanique.dowze'}),id,target,()=>true),key={...target,type:'whiteboard',documentId:m.notebookDocumentId(id)};
 assert.equal(imported.id,id);assert.equal(imported.title,metadata.title);assert.deepEqual(imported.tags,metadata.tags);assert.equal(imported.createdAt,stamp);assert.ok(imported.markdown.includes('dowze-photo:paper-v3-note-imported/'));assert.equal((await m.getDraft(key)).staged,true);assert.ok((await m.listLocalBlobs(target.accountId,target.spaceId)).every(b=>b.removedFromNote));assert.deepEqual(await m.pendingNotebookArchives(target),[id]);
 await assert.rejects(()=>m.activateNotebookArchive(id,target),/enregistrement/);assert.deepEqual((await m.getDraft(libraryDraft)).content,destLibrary);
 let sent=0;await m.queueLocalDrafts(target.accountId,target.spaceId);await m.flushMutations({bindAccount:()=>{},uploadBlob:async()=>{sent++;return{id:'x'};},putDocument:async()=>{sent++;return{version:1};}},target.accountId,target.spaceId,()=>true);assert.equal((await m.getDraft(key)).staged,true);assert.equal(sent,1); // Existing unrelated library alone can synchronize.
 console.log('Staged import: body/media held back, interrupted metadata preserved with a resumable receipt: PASS');
 const noteDraft={...target,type:'notesMarkdown',documentId:id,title:imported.title,content:imported,baseVersion:0,updatedAt:1,syncState:'local',paperDependency:key.documentId};await m.putDraft(noteDraft);await m.confirmNotebookArchiveMetadata(id,target);await m.activateNotebookArchive(id,target);
 const restored=(await m.getDraft(key)).content;m.verifyPaperCollaboration(restored);assert.equal(restored.pages.length,doc.pages.length);assert.equal(restored.audio.length,1);assert.notEqual(restored.audio[0].id,'recording');assert.equal(restored.objects.find(o=>o.kind==='ink').audioAnchor.sessionId,restored.audio[0].id);
 const nowLibrary=(await m.getDraft(libraryDraft)).content;assert.equal(nowLibrary.folders.length,3);assert.deepEqual(nowLibrary.notes['existing-note'],destLibrary.notes['existing-note']);const classification=nowLibrary.notes[id];assert.equal(classification.favorite,true);assert.equal(classification.cover.color,'#fff4d8');assert.equal(nowLibrary.folders.find(f=>f.id===classification.folderId).title,'Mécanique');assert.ok((await m.listLocalBlobs(target.accountId,target.spaceId)).every(b=>!b.removedFromNote));const revision=nowLibrary.revision;await m.activateNotebookArchive(id,target);assert.equal((await m.getDraft(libraryDraft)).content.revision,revision);
 console.log('Import activation: independent identities, preserved audio anchor, existing ancestor reused, other note retained, idempotent finalization: PASS');
 const publication=[];const api={bindAccount:()=>{},uploadBlob:async(space,blob)=>({id:'uploaded-'+blob.type.replace(/[^a-z]/g,'')}),putDocument:async(space,type,id,base,content)=>{publication.push([type,id]);return{version:base+1};}};await m.queueLocalDrafts(target.accountId,target.spaceId);await m.flushMutations(api,target.accountId,target.spaceId,()=>true);assert.ok(publication.findIndex(p=>p[0]==='whiteboard')<publication.findIndex(p=>p[0]==='notesMarkdown'));assert.equal((await m.getDraft(noteDraft)).syncState,'synced');assert.equal((await m.getDraft(key)).syncState,'synced');
 console.log('Publication: owned paper and acknowledged media precede visible metadata: PASS');

 const existingMetadataOnly={accountId:'qa-archive-existing-meta',spaceId:'year',type:'notesMarkdown',documentId:'existing-id',title:'Ne pas remplacer',content:{id:'existing-id',title:'Ne pas remplacer',markdown:'Texte original sans document papier encore créé',tags:[],subjectIds:[],createdAt:stamp,updatedAt:stamp},baseVersion:0,updatedAt:1,syncState:'local'};await m.putDraft(existingMetadataOnly);await assert.rejects(()=>m.stageNotebookArchive(blob,'existing-id',existingMetadataOnly,()=>true),/déjà/);assert.deepEqual((await m.getDraft(existingMetadataOnly)).content,existingMetadataOnly.content);assert.equal((await m.listLocalBlobs(existingMetadataOnly.accountId,existingMetadataOnly.spaceId)).length,0);
 const sourceDigest=await m.localBlobDigest(blob),raceScope={accountId:'qa-archive-post-read-meta',spaceId:'year'},raceId='post-read-collision',concurrent={...existingMetadataOnly,...raceScope,documentId:raceId,content:{...existingMetadataOnly.content,id:raceId}};
 const metadataRace=archiveStorageFault({metadataKey:`${raceScope.accountId}|${raceScope.spaceId}|notesMarkdown|${raceId}`});
 const staging=m.stageNotebookArchive(blob,raceId,raceScope,()=>true);void staging.catch(()=>{});
 try{
  await deadline(metadataRace.began,'The real metadata read must complete before the concurrent creation');assert.equal(metadataRace.ledger.metadataReads,1);assert.equal(metadataRace.ledger.metadataWasAbsent,true);
  await m.putDraft(concurrent);metadataRace.release();await assert.rejects(()=>deadline(staging,'Concurrent metadata must reject the entire archive transaction'),error=>typeof error?.message==='string'&&error.message.includes('La note ou ses fichiers ont changé pendant le transfert.')&&!error.message.includes(': timeout'));
  await deadline(metadataRace.terminalAbort,'Concurrent metadata transfer must reach its real terminal abort');
  assert.equal(metadataRace.ledger.aborts,1);assert.equal(await m.getDraft({...raceScope,type:'whiteboard',documentId:m.notebookDocumentId(raceId)}),undefined);
  const {key:_key,...preserved}=await m.getDraft(concurrent);assert.deepEqual(preserved,concurrent);assert.equal((await m.listDrafts(raceScope.accountId,raceScope.spaceId)).length,1);
  assert.equal((await m.listLocalBlobs(raceScope.accountId,raceScope.spaceId)).length,0);assert.equal((await m.listSnapshots(raceScope.accountId,raceScope.spaceId)).length,0);assert.equal(await m.localBlobDigest(blob),sourceDigest);
 }finally{metadataRace.restore();await deadline(staging.catch(()=>{}),'Delayed metadata-read cleanup');}
 console.log('Archive metadata race: real absent read then concurrent creation aborts staging atomically; original metadata and archive bytes unchanged: PASS');
 let quotaSettled=false;
 const quotaScope={accountId:'qa-archive-staging-quota',spaceId:'year'},quotaId='quota-import',quota=archiveStorageFault({quotaAccount:quotaScope.accountId,observeSettled:()=>quotaSettled});
 try{
  const quotaPending=m.stageNotebookArchive(blob,quotaId,quotaScope,()=>true);void quotaPending.then(()=>{quotaSettled=true;},()=>{quotaSettled=true;});
  await assert.rejects(()=>deadline(quotaPending,'Injected write quota must reject archive staging'),error=>error?.name==='AbortError');
  await deadline(quota.terminalAbort,'Quota transfer must reach its real terminal abort');
  assert.equal(quota.ledger.quotaThrows,1);assert.equal(quota.ledger.successfulBlobWrites,1);assert.equal(quota.ledger.aborts,1);
  assert.ok(quota.ledger.errorEvents>0&&quota.ledger.pendingSamples>0,'Real error events must be sampled before the terminal abort');assert.equal(quota.ledger.settledBeforeAbort,false,'The transfer Promise must remain pending until IndexedDB confirms rollback');
  assert.equal((await m.listDrafts(quotaScope.accountId,quotaScope.spaceId)).length,0);assert.equal((await m.listLocalBlobs(quotaScope.accountId,quotaScope.spaceId)).length,0);assert.equal((await m.listSnapshots(quotaScope.accountId,quotaScope.spaceId)).length,0);assert.equal(await m.localBlobDigest(blob),sourceDigest);
 }finally{quota.restore();}
 const retried=await m.stageNotebookArchive(blob,quotaId,quotaScope,()=>true);assert.equal(retried.id,quotaId);assert.deepEqual(await m.pendingNotebookArchives(quotaScope),[quotaId]);assert.equal((await m.listDrafts(quotaScope.accountId,quotaScope.spaceId)).length,1);assert.equal((await m.listSnapshots(quotaScope.accountId,quotaScope.spaceId)).length,1);assert.equal((await m.listLocalBlobs(quotaScope.accountId,quotaScope.spaceId)).length,archive.document.assets.length);assert.equal(await m.localBlobDigest(blob),sourceDigest);
 const retriedDraft=await m.getDraft({...quotaScope,type:'whiteboard',documentId:m.notebookDocumentId(quotaId)}),retriedBlobs=await m.listLocalBlobs(quotaScope.accountId,quotaScope.spaceId);
 assert.equal(retriedDraft.content.assets.length,archive.document.assets.length);assert.equal(new Set(retriedBlobs.map(row=>row.id)).size,archive.document.assets.length);
 for(const asset of retriedDraft.content.assets){
  const original=archive.document.assets.find(source=>source.name===asset.name&&source.mediaType===asset.mediaType),stored=retriedBlobs.find(row=>row.id===asset.id);assert.ok(original&&stored);
  const originalBytes=archive.files[`assets/${original.id}`],digest=await m.localBlobDigest(new Blob([originalBytes]));assert.equal(stored.sha256,digest);assert.equal(await m.localBlobDigest(stored.blob),digest);assert.deepEqual(new Uint8Array(await stored.blob.arrayBuffer()),originalBytes);
  assert.equal(stored.documentId,retriedDraft.documentId);assert.equal(stored.removedFromNote,true);assert.equal(stored.status,'pending');
 }
 console.log('Archive quota seam: real transaction rolls back after an injected quota at its first successful blob write; the Promise waits for terminal abort and same-ID retry creates one complete staged import: PASS');
 const rejected={accountId:'qa-archive-cancelled',spaceId:'year'};await assert.rejects(()=>m.stageNotebookArchive(blob,'cancelled',rejected,()=>false));assert.equal((await m.listDrafts(rejected.accountId,rejected.spaceId)).length,0);assert.equal((await m.listLocalBlobs(rejected.accountId,rejected.spaceId)).length,0);
 const old=m.readPaperArchive(zipSync({'document.json':archive.files['document.json'],...Object.fromEntries(Object.entries(archive.files).filter(([k])=>k.startsWith('assets/')))}));assert.equal(old.metadata,undefined);assert.equal(old.document.noteId,'original');console.log('Import safety: revoked scope commits nothing and older complete media archives remain readable: PASS');
 const specialScope={accountId:'qa-archive-special',spaceId:'year'},specialId='école/../'+ 'a'.repeat(140),specialPlain=m.migratePaper('constructor',`![Image](dowze-photo:note-constructor/${encodeURIComponent(specialId)})`,null,stamp),special=m.applyPaperCommand(specialPlain,{type:'add-asset',asset:{id:specialId,name:'figure.png',mediaType:'image/png',size:3}});
 await m.putLocalBlob({...specialScope,id:specialId,name:'figure.png',blob:new Blob(['IMG'],{type:'image/png'}),createdAt:1,status:'pending'});
 const specialArchive=await m.verifyPaperArchive(new Uint8Array(await (await m.buildPaperArchive(special,specialScope)).arrayBuffer()));assert.ok(Object.keys(specialArchive.integrity.files).every(path=>!path.includes('..')&&!path.includes('école')));assert.equal(new TextDecoder().decode(specialArchive.files['assets/'+specialId]),'IMG');
 const specialCopy=m.appendPaperArchive(specialArchive.document,'mapped-special');assert.ok(specialCopy.commands.find(c=>c.type==='upsert-object'&&c.object.kind==='text').object.markdown.includes(specialCopy.assets.get(specialId)));
 const prototypeSafe=m.updateNotebookLibrary(m.emptyNotebookLibrary(),{notes:[{id:'__proto__',patch:{favorite:true}},{id:'constructor',patch:{favorite:false}}]});assert.ok(Object.hasOwn(prototypeSafe.notes,'__proto__'));assert.equal(Object.getPrototypeOf(prototypeSafe.notes),Object.prototype);assert.equal(prototypeSafe.notes.constructor.folderId,null);

 const overlapId=await m.localBlobDigest(new Blob(['image'])),overlapPlain=m.migratePaper('overlap','Deux images',null,stamp),overlap=m.applyPaperCommand(overlapPlain,{type:'batch',commands:[{type:'add-asset',asset:{id:'image',name:'one.png',mediaType:'image/png',size:3}},{type:'add-asset',asset:{id:overlapId,name:'two.png',mediaType:'image/png',size:3}}]});
 const overlapScope={accountId:'qa-archive-overlap',spaceId:'year'};await m.putLocalBlob({...overlapScope,id:'image',blob:new Blob(['ONE']),name:'one.png',createdAt:1,status:'pending'});await m.putLocalBlob({...overlapScope,id:overlapId,blob:new Blob(['TWO']),name:'two.png',createdAt:1,status:'pending'});
 const overlapArchive=await m.verifyPaperArchive(new Uint8Array(await (await m.buildPaperArchive(overlap,overlapScope)).arrayBuffer()));assert.equal(new TextDecoder().decode(overlapArchive.files['assets/image']),'ONE');assert.equal(new TextDecoder().decode(overlapArchive.files['assets/'+overlapId]),'TWO');assert.equal(new TextDecoder().decode(overlapArchive.physicalFiles['assets/'+overlapId]),'ONE');
 console.log('Portable identities: Unicode/long asset references use safe ZIP names, inline links remap, special dictionary IDs cannot alter prototypes: PASS');

}finally{await rm(out,{recursive:true,force:true});}
