import assert from 'node:assert/strict';
import test,{type TestContext} from 'node:test';
import {webcrypto} from 'node:crypto';
import {IDBFactory,IDBKeyRange as FakeKeyRange} from 'fake-indexeddb';
import {zipSync,strToU8} from 'fflate';
import {verifyPaperArchiveBlob,appendPaperArchive} from '../src/lib/paperArchive.ts';
import {getDraft,getSnapshot,listDrafts,listLocalBlobs,listSnapshots,putDraft,putLocalBlob,putSnapshot,commitNotebookTransfer,notebookDeletionKey,type Draft,type Snapshot} from '../pwa/src/storage.ts';
import {migratePaper,applyPaperCommand,isPaperDocument,notebookDocumentId,type PaperDocument} from '../src/lib/notebookDocument.ts';
import {paperArchiveMetadata} from '../src/lib/paperArchiveMetadata.ts';
import {amendPaperCollaboration,verifyPaperCollaboration} from '../src/lib/paperCollaboration.ts';
import {stagePaperAppendArchive,preparePaperAppendArchive,preparePaperAppendArchivePublication,readPaperAppendArchive,readPaperAppendArchiveOriginal,listPaperAppendArchives,paperAppendArchiveReceiptKey,PaperAppendArchiveAppliedError,stagePaperLegacyAppendArchiveCopy,preparePaperLegacyAppendArchivePublication,readPaperLegacyAppendArchiveRecovery,listPaperLegacyAppendArchiveRecoveries,describePaperLegacyAppendArchiveRecovery,paperLegacyAppendRecoveryId,paperLegacyAppendRecoveryKey,type PaperAppendArchiveScope,type PaperAppendArchiveReady,type PaperLegacyAppendReady} from '../src/lib/paperAppendArchiveStaging.ts';

const stamp='2026-10-15T10:00:00.000Z';
const deadline=async<T>(work:Promise<T>,label:string)=>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error(`${label}: timeout`)),5000);})]);}finally{if(timer)clearTimeout(timer);}
};
const checksum=async(blob:Blob)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');
function fixture(t:TestContext){
 const factory=new IDBFactory(),previous=new Map(['indexedDB','IDBKeyRange','crypto'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 Object.defineProperty(globalThis,'indexedDB',{configurable:true,writable:true,value:factory});
 Object.defineProperty(globalThis,'IDBKeyRange',{configurable:true,writable:true,value:FakeKeyRange});
 if(!globalThis.crypto?.subtle)Object.defineProperty(globalThis,'crypto',{configurable:true,value:webcrypto});
 t.after(()=>{for(const [name,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);}});
 /** A quota seam after a real successful request. It preserves the actual
  * storage transaction and observes its terminal abort before assertions. */
 const quotaAfter=(storeName:string,accept:(value:any)=>boolean)=>{
  const open=factory.open.bind(factory);let aborted!:()=>void;
  const ledger={writes:0,throws:0,aborts:0},terminal=new Promise<void>(resolve=>{aborted=resolve;}),seen=new WeakSet<object>();
  factory.open=((...args:Parameters<typeof factory.open>)=>{
   const request=open(...args);request.addEventListener('success',()=>{
    const db=request.result,transaction=db.transaction.bind(db);
    db.transaction=((...args:Parameters<IDBDatabase['transaction']>)=>{
     const tx=transaction(...args),stores=Array.from(tx.objectStoreNames),transfer=args[1]==='readwrite'&&stores.length===3&&['drafts','scopedBlobs','snapshots'].every(name=>stores.includes(name));let touched=false;
     tx.addEventListener('abort',()=>{if(touched){ledger.aborts++;aborted();}},{once:true});
     const objectStore=tx.objectStore.bind(tx);tx.objectStore=(name:string)=>{
      const store=objectStore(name);if(!transfer||name!==storeName||seen.has(store))return store;seen.add(store);const put=store.put.bind(store);
      store.put=((value:any,key?:IDBValidKey)=>{const write=key===undefined?put(value):put(value,key);if(accept(value)){touched=true;write.addEventListener('success',()=>{ledger.writes++;if(!ledger.throws){ledger.throws++;throw new DOMException('Synthetic quota after real storage write','QuotaExceededError');}},{once:true});}return write;}) as IDBObjectStore['put'];return store;
     };return tx;
    }) as IDBDatabase['transaction'];
   },{once:true});return request;
  }) as typeof factory.open;
  return {ledger,terminal,restore:()=>{factory.open=open;}};
 };
 return {factory,quotaAfter};
}
const scope=(suffix:string):PaperAppendArchiveScope=>({accountId:`synthetic-append-${suffix}`,spaceId:'année|2026 📝',noteId:'destination-[é]'});
async function seed(captured:PaperAppendArchiveScope){
 const legacy=migratePaper(captured.noteId,'Texte existant — rester intact.',null,stamp),document=amendPaperCollaboration(legacy,legacy),draft:Draft={accountId:captured.accountId,spaceId:captured.spaceId,type:'whiteboard',documentId:notebookDocumentId(captured.noteId),title:'Titre destination original',content:document,baseVersion:4,updatedAt:1,syncState:'local'};
 await putDraft(draft);await putDraft({...draft,type:'notesMarkdown',documentId:captured.noteId,content:{id:captured.noteId,title:draft.title,tags:['ancien'],markdown:'Métadonnées intactes'},paperDependency:draft.documentId});
 return {draft,document};
}
async function portable(){
 const bytes={'image':strToU8('IMG'),'audio':strToU8('WAV'),'pdf':strToU8('%PDF synthetic bytes')},blank=migratePaper('source-note','Cours source — Ω 🖊️',null,stamp),second={...blank.pages[0],id:'source-page-2',pdf:{assetId:'pdf',pageNumber:2,text:'PDF texte source'}};
 const document=applyPaperCommand(blank,{type:'batch',commands:[
  {type:'add-asset',asset:{id:'image',name:'figure-é.png',mediaType:'image/png',size:bytes.image.length}},
  {type:'add-asset',asset:{id:'audio',name:'cours.wav',mediaType:'audio/wav',size:bytes.audio.length}},
  {type:'add-asset',asset:{id:'pdf',name:'pages.pdf',mediaType:'application/pdf',size:bytes.pdf.length}},
  {type:'add-audio',audio:{id:'source-audio',assetId:'audio',name:'Explication source',duration:2,startedAt:1}},
  {type:'insert-page',page:second},
  {type:'upsert-object',object:{...blank.objects[0],markdown:`Cours source Ω 🖊️\n\n![Figure](dowze-photo:${notebookDocumentId(blank.noteId)}/image)`,groupId:'source-group'}},
  {type:'upsert-object',object:{...blank.objects[0],id:'source-image',pageId:second.id,kind:'image',markdown:undefined,assetId:'image',groupId:'source-group'}},
  {type:'upsert-object',object:{...blank.objects[0],id:'source-ink',pageId:second.id,kind:'ink',markdown:undefined,points:[{x:1,y:2,time:3,pressure:.3},{x:40,y:50,time:60,pressure:.7}],audioAnchor:{sessionId:'source-audio',time:1}}},
  {type:'study-card',card:{id:'source-card',kind:'basic',question:'Quelle note conserve la source ?',answer:'Le carnet source',source:{noteId:blank.noteId,pageId:blank.pages[0].id,objectId:blank.objects[0].id,revision:blank.revision,quote:'Cours source'},schedule:{repetitions:2,intervalDays:6,ease:2.5,dueAt:stamp},reviews:[{id:'source-review',at:stamp,quality:4}],createdAt:stamp}},
 ]},stamp);
 const metadata=paperArchiveMetadata(document,{title:'Titre source indépendant',tags:['source'],subjectIds:['matière-é']},undefined,stamp);
 const members:Record<string,Uint8Array>={'document.json':strToU8(JSON.stringify(document)),'metadata.json':strToU8(JSON.stringify(metadata)),...Object.fromEntries(Object.entries(bytes).map(([id,raw])=>[`assets/${id}`,raw]))};
 const files:Record<string,{size:number;sha256:string}>={};for(const [name,raw] of Object.entries(members))files[name]={size:raw.length,sha256:await checksum(new Blob([raw]))};
 members['integrity.json']=strToU8(JSON.stringify({schema:1,files}));
 const file=Object.assign(new Blob([zipSync(members,{level:0})],{type:'application/zip'}),{name:'cours-é.dowze'});
 const originalRam=structuredClone(document),verified=await verifyPaperArchiveBlob(file),archiveSha256=await checksum(file);assert.deepEqual(document,originalRam);
 return {file,document,metadata,bytes,originalRam,verified,archiveSha256};
}
async function observed(captured:PaperAppendArchiveScope){
 const snapshots=await listSnapshots(captured.accountId,captured.spaceId),files=await listLocalBlobs(captured.accountId,captured.spaceId);
 return {drafts:await listDrafts(captured.accountId,captured.spaceId),snapshots:await Promise.all(snapshots.map(async row=>({row,bytes:(row.value as {blob?:Blob})?.blob?await checksum((row.value as {blob:Blob}).blob):undefined}))),files:await Promise.all(files.map(async({blob,...row})=>({row,bytes:await checksum(blob),size:blob.size,mediaType:blob.type})))};
}
async function ready(captured:PaperAppendArchiveScope,id='append-op'){
 const baseline=await seed(captured),archive=await portable();await stagePaperAppendArchive({scope:captured,file:archive.file,id,current:()=>true});
 const receipt=await preparePaperAppendArchive({scope:captured,id,current:()=>true});assert.equal(receipt.state,'ready');return {...baseline,archive,receipt:receipt as PaperAppendArchiveReady,id};
}

test('Source staging keeps original ZIP durable before parsing, rejects identity replacement and preserves invalid ZIP for explicit recovery',async t=>{
 fixture(t);const captured=scope('original'),baseline=await seed(captured),file=Object.assign(new Blob(['invalid but preserved ZIP'],{type:'application/zip'}),{name:'original.dowze'}),id='invalid-original';
 const receipt=await stagePaperAppendArchive({scope:captured,file,id,current:()=>true});assert.equal(receipt.state,'source-staged');
 const source=(await getSnapshot(receipt.original.key))!.value as {blob:Blob};assert.equal(await source.blob.text(),await file.text());assert.equal(await checksum(source.blob),receipt.original.sha256);
 const recoveredOriginal=await readPaperAppendArchiveOriginal({scope:captured,id,current:()=>true});assert.equal(recoveredOriginal.name,file.name);assert.equal(await recoveredOriginal.blob.text(),await file.text());
 await assert.rejects(()=>preparePaperAppendArchive({scope:captured,id,current:()=>true}),/incomplète/);
 assert.equal((await readPaperAppendArchive({scope:captured,id,current:()=>true})).state,'source-staged');assert.deepEqual((await getDraft(baseline.draft))!.content,baseline.document);assert.equal((await listLocalBlobs(captured.accountId,captured.spaceId)).length,0);
 assert.deepEqual(await stagePaperAppendArchive({scope:captured,file,id,current:()=>true}),receipt);
 const before=await observed(captured);await assert.rejects(()=>stagePaperAppendArchive({scope:captured,file:new Blob(['different ZIP']),id,current:()=>true}),/autre archive/);assert.deepEqual(await observed(captured),before);
});

test('Ready staging remaps once, holds every media, and publication atomically appends graph, media, history and absorbing receipt',async t=>{
 fixture(t);const captured=scope('complete'),r=await ready(captured),metadataBefore=await getDraft({...r.draft,type:'notesMarkdown',documentId:captured.noteId});
 const repeat=await preparePaperAppendArchive({scope:captured,id:r.id,current:()=>true});assert.deepEqual(repeat,r.receipt);assert.deepEqual((await getDraft(r.draft))!.content,r.document);
 const staged=await listLocalBlobs(captured.accountId,captured.spaceId);assert.equal(staged.length,r.archive.document.assets.length);assert.ok(staged.every(file=>file.removedFromNote===true&&file.status==='pending'&&file.serverId===undefined));
 for(const descriptor of r.receipt.files){const file=staged.find(file=>file.id===descriptor.id)!;assert.notEqual(descriptor.id,descriptor.sourceId);assert.equal(await checksum(file.blob),descriptor.sha256);assert.deepEqual(new Uint8Array(await file.blob.arrayBuffer()),r.archive.bytes[descriptor.sourceId as keyof typeof r.archive.bytes]);}
 // Compare the durable graph to the actual ZIP decoding contract. JSON drops
 // undefined properties, while the untouched pre-export source retains them.
 assert.deepEqual(r.receipt.sourceDocument,r.archive.verified.document);assert.deepEqual(r.receipt.sourceMetadata,r.archive.verified.metadata);assert.deepEqual(r.archive.document,r.archive.originalRam);
 const original=await readPaperAppendArchiveOriginal({scope:captured,id:r.id,current:()=>true});assert.equal(await checksum(original.blob),r.archive.archiveSha256);assert.deepEqual(new Uint8Array(await original.blob.arrayBuffer()),new Uint8Array(await r.archive.file.arrayBuffer()));
 const prepared=await preparePaperAppendArchivePublication({scope:captured,id:r.id,document:r.document,current:()=>true});assert.equal(prepared.commit.drafts[0],prepared.draft);assert.deepEqual(prepared.commit.draftChecks[0].expected!.content,r.document);
 await commitNotebookTransfer(prepared.commit,()=>true);const next=(await getDraft(r.draft))!.content as PaperDocument;assert.ok(isPaperDocument(next));verifyPaperCollaboration(next);assert.equal(next.pages.length,r.document.pages.length+r.archive.document.pages.length);assert.equal(next.revision,r.document.revision+1);assert.deepEqual(next.pages.slice(0,r.document.pages.length),r.document.pages);assert.deepEqual(next.objects.filter(object=>r.document.objects.some(original=>original.id===object.id)),r.document.objects);
 assert.equal((await getDraft(r.draft))!.title,r.draft.title);assert.deepEqual(await getDraft({...r.draft,type:'notesMarkdown',documentId:captured.noteId}),metadataBefore);assert.ok((await listLocalBlobs(captured.accountId,captured.spaceId)).every(file=>file.removedFromNote===false));
 const importedInk=next.objects.find(object=>object.kind==='ink')!;assert.equal(importedInk.audioAnchor!.sessionId,next.audio[0].id);assert.notEqual(next.audio[0].id,'source-audio');assert.ok(next.objects.some(object=>object.markdown?.includes(`dowze-photo:${r.draft.documentId}/${r.receipt.assets.image}`)));assert.equal(next.pages.find(page=>page.id===r.receipt.firstPageId)!.id,prepared.firstPageId);
 const card=next.study!.cards[0],sourceCard=r.archive.document.study!.cards[0];assert.notEqual(card.id,sourceCard.id);assert.equal(card.source!.noteId,captured.noteId);assert.ok(next.pages.some(page=>page.id===card.source!.pageId));assert.ok(next.objects.some(object=>object.id===card.source!.objectId));assert.deepEqual(card.schedule,sourceCard.schedule);assert.deepEqual(card.reviews,sourceCard.reviews);assert.equal(card.question,sourceCard.question);assert.equal(card.answer,sourceCard.answer);
 const importedGroups=next.objects.filter(object=>object.groupId);assert.equal(importedGroups.length,2);assert.equal(importedGroups[0].groupId,importedGroups[1].groupId);assert.notEqual(importedGroups[0].groupId,'source-group');
 const applied=await readPaperAppendArchive({scope:captured,id:r.id,current:()=>true});assert.equal(applied.state,'applied');assert.deepEqual((await getSnapshot(prepared.receipt.beforeHistoryKey))!.value,r.document);assert.equal((await listPaperAppendArchives({scope:captured,current:()=>true})).receipts.length,0);
 await assert.rejects(()=>preparePaperAppendArchivePublication({scope:captured,id:r.id,document:next,current:()=>true}),error=>error instanceof PaperAppendArchiveAppliedError);
 await putDraft({...r.draft,content:amendPaperCollaboration(next,applyPaperCommand(next,{type:'restore',document:r.document},stamp))});
 const undone=(await getDraft(r.draft))!.content as PaperDocument,before=await observed(captured);await assert.rejects(()=>preparePaperAppendArchivePublication({scope:captured,id:r.id,document:undone,current:()=>true}),PaperAppendArchiveAppliedError);assert.deepEqual(await observed(captured),before);
});

test('Source quota rolls both source and receipt back; no destination or metadata is changed',async t=>{
 const f=fixture(t),captured=scope('source-quota'),baseline=await seed(captured),archive=await portable(),originalChecksum=await checksum(archive.file),before=await observed(captured),fault=f.quotaAfter('snapshots',row=>row.accountId===captured.accountId&&row.value?.kind==='paper-append-archive-source');
 try{await assert.rejects(()=>deadline(stagePaperAppendArchive({scope:captured,file:archive.file,id:'source-quota',current:()=>true}),'source quota'),error=>(error as Error).name==='AbortError');await deadline(fault.terminal,'source transaction terminal');assert.equal(fault.ledger.writes,1);assert.equal(fault.ledger.aborts,1);assert.deepEqual(await observed(captured),before);}finally{fault.restore();}
 assert.deepEqual((await getDraft(baseline.draft))!.content,baseline.document);assert.equal(await checksum(archive.file),originalChecksum);
});

test('Quota after a real ready media write leaves only the original source; retry maps complete bytes without partial publication',async t=>{
 const f=fixture(t),captured=scope('ready-quota'),baseline=await seed(captured),archive=await portable(),id='ready-quota';await stagePaperAppendArchive({scope:captured,file:archive.file,id,current:()=>true});const before=await observed(captured),fault=f.quotaAfter('scopedBlobs',row=>row.accountId===captured.accountId);
 try{await assert.rejects(()=>deadline(preparePaperAppendArchive({scope:captured,id,current:()=>true}),'ready quota'),error=>(error as Error).name==='AbortError');await deadline(fault.terminal,'ready transaction terminal');assert.equal(fault.ledger.writes,1);assert.equal(fault.ledger.aborts,1);assert.deepEqual(await observed(captured),before);}finally{fault.restore();}
 const retried=await preparePaperAppendArchive({scope:captured,id,current:()=>true});assert.equal(retried.state,'ready');const files=await listLocalBlobs(captured.accountId,captured.spaceId);assert.equal(files.length,archive.document.assets.length);assert.ok(files.every(file=>file.removedFromNote));assert.deepEqual((await getDraft(baseline.draft))!.content,baseline.document);
});

test('Quota during publication rolls draft, activated files, history and applied marker back; ready retry uses identical IDs',async t=>{
 const f=fixture(t),captured=scope('publication-quota'),r=await ready(captured),prepared=await preparePaperAppendArchivePublication({scope:captured,id:r.id,document:r.document,current:()=>true}),before=await observed(captured),fault=f.quotaAfter('scopedBlobs',row=>row.accountId===captured.accountId&&row.removedFromNote===false);
 try{await assert.rejects(()=>deadline(commitNotebookTransfer(prepared.commit,()=>true),'publication quota'),error=>(error as Error).name==='AbortError');await deadline(fault.terminal,'publication transaction terminal');assert.equal(fault.ledger.writes,1);assert.equal(fault.ledger.aborts,1);assert.deepEqual(await observed(captured),before);}finally{fault.restore();}
 const retried=await preparePaperAppendArchivePublication({scope:captured,id:r.id,document:r.document,current:()=>true});assert.equal(retried.firstPageId,prepared.firstPageId);assert.deepEqual(retried.commit.blobs.map(file=>file.id),prepared.commit.blobs.map(file=>file.id));await commitNotebookTransfer(retried.commit,()=>true);assert.equal((await readPaperAppendArchive({scope:captured,id:r.id,current:()=>true})).state,'applied');
});

test('Late draft, media, receipt, history and tombstone changes each refuse the entire prepared publication by real storage CAS',async t=>{
 fixture(t);
 for(const kind of ['draft','media','receipt','history','tombstone']){
  const captured=scope('cas-'+kind),r=await ready(captured),prepared=await preparePaperAppendArchivePublication({scope:captured,id:r.id,document:r.document,current:()=>true});
  if(kind==='draft')await putDraft({...r.draft,content:applyPaperCommand(r.document,{type:'patch-object',id:r.document.objects[0].id,patch:{markdown:'Édition concurrente intacte'}},stamp)});
  if(kind==='media'){const file=(await listLocalBlobs(captured.accountId,captured.spaceId))[0];await putLocalBlob({...file,blob:new Blob(['different media'],{type:file.blob.type})});}
  if(kind==='receipt'){const row=(await getSnapshot(paperAppendArchiveReceiptKey(captured,r.id)))!;await putSnapshot({...row,value:{...r.receipt,sourceName:'Concurrent original name'}});}
  if(kind==='history')await putSnapshot({key:prepared.receipt.beforeHistoryKey,accountId:captured.accountId,spaceId:captured.spaceId,value:{original:'Concurrent history remains intact'}});
  if(kind==='tombstone')await putSnapshot({key:notebookDeletionKey(r.draft),accountId:captured.accountId,spaceId:captured.spaceId,value:{schema:1,kind:'paper-canonical-deletion',...captured,documentId:r.draft.documentId,version:8,deletedAt:2}});
  const before=await observed(captured);await assert.rejects(()=>commitNotebookTransfer(prepared.commit,()=>true),/changé/);assert.deepEqual(await observed(captured),before);assert.ok((await listLocalBlobs(captured.accountId,captured.spaceId)).every(file=>file.removedFromNote===true));
 }
});

test('Captured scope and non-reactivating generation guards prevent A-B-A publication without losing durable source or ready media',async t=>{
 fixture(t);const captured=scope('aba'),baseline=await seed(captured),archive=await portable();let generation=4;const admitted=4,current=()=>generation===admitted,mutable={...captured};
 const staging=stagePaperAppendArchive({scope:mutable,file:archive.file,id:'captured-scope',current});mutable.accountId='synthetic-owner-B';mutable.noteId='foreign-note';await staging;assert.equal((await readPaperAppendArchive({scope:captured,id:'captured-scope',current})).accountId,captured.accountId);assert.equal((await listSnapshots(mutable.accountId,mutable.spaceId)).length,0);
 await preparePaperAppendArchive({scope:captured,id:'captured-scope',current});const prepared=await preparePaperAppendArchivePublication({scope:captured,id:'captured-scope',document:baseline.document,current}),before=await observed(captured);generation=5;
 await assert.rejects(()=>commitNotebookTransfer(prepared.commit,current),/connexion/);generation=6;await assert.rejects(()=>preparePaperAppendArchivePublication({scope:captured,id:'captured-scope',document:baseline.document,current}),/compte/);assert.deepEqual(await observed(captured),before);
 // A new explicit operation admits a new generation for the SAME old scope.
 const resumed=await preparePaperAppendArchivePublication({scope:captured,id:'captured-scope',document:baseline.document,current:()=>generation===6});await commitNotebookTransfer(resumed.commit,()=>generation===6);assert.equal((await readPaperAppendArchive({scope:captured,id:'captured-scope',current:()=>true})).state,'applied');
});

test('Existing mapped identities, changed bytes and a canonical deletion refuse restoration without resurrection or overwrite',async t=>{
 fixture(t);
 for(const kind of ['collision','source-bytes','media-bytes','deleted']){
  const captured=scope('refusal-'+kind),r=await ready(captured);let document=r.document;
  if(kind==='collision'){const pageCommand=r.receipt.commands.find(command=>command.type==='insert-page')!;assert.equal(pageCommand.type,'insert-page');document=amendPaperCollaboration(document,applyPaperCommand(document,pageCommand,stamp));await putDraft({...r.draft,content:document});}
  if(kind==='source-bytes'){const row=(await getSnapshot(r.receipt.original.key))!,value=row.value as {blob:Blob};await putSnapshot({...row,value:{...value,blob:new Blob([new Uint8Array([0]),value.blob.slice(1)],{type:value.blob.type})}});}
  if(kind==='media-bytes'){const file=(await listLocalBlobs(captured.accountId,captured.spaceId))[0];await putLocalBlob({...file,blob:new Blob(['BAD'],{type:file.blob.type})});}
  if(kind==='deleted')await putSnapshot({key:notebookDeletionKey(r.draft),accountId:captured.accountId,spaceId:captured.spaceId,value:{schema:1,kind:'paper-canonical-deletion',...captured,documentId:r.draft.documentId,version:3,deletedAt:2}});
  const before=await observed(captured);await assert.rejects(()=>preparePaperAppendArchivePublication({scope:captured,id:r.id,document,current:()=>true}));assert.deepEqual(await observed(captured),before);
 }
});

test('Receipt listing is scoped and reads no ZIP source namespace; legacy no-bytes receipts stay explicit and unchanged',async t=>{
 const f=fixture(t),captured=scope('list'),r=await ready(captured),legacy:Snapshot={key:`paper-import-append|${captured.accountId}|${captured.spaceId}|${captured.noteId}|old`,accountId:captured.accountId,spaceId:captured.spaceId,value:{schema:1,sourceName:'historique.dowze',sourceDocument:r.archive.document,commands:r.receipt.commands,assets:r.receipt.assets}};await putSnapshot(legacy);
 const foreign={...captured,accountId:'another-account'};await seed(foreign);await stagePaperAppendArchive({scope:foreign,file:r.archive.file,id:'foreign-source',current:()=>true});
 const open=f.factory.open.bind(f.factory),seen:string[]=[];f.factory.open=((...args:Parameters<typeof f.factory.open>)=>{const request=open(...args);request.addEventListener('success',()=>{const db=request.result,transaction=db.transaction.bind(db);db.transaction=((...args:Parameters<IDBDatabase['transaction']>)=>{const tx=transaction(...args),objectStore=tx.objectStore.bind(tx);tx.objectStore=(name:string)=>{const store=objectStore(name);if(name==='snapshots'){const cursor=store.openCursor.bind(store);store.getAll=(()=>{throw Error('Listing may not scan all snapshots');}) as IDBObjectStore['getAll'];store.openCursor=((...args:Parameters<IDBObjectStore['openCursor']>)=>{seen.push(String((args[0] as IDBKeyRange).lower));return cursor(...args);}) as IDBObjectStore['openCursor'];}return store;};return tx;}) as IDBDatabase['transaction'];},{once:true});return request;}) as typeof f.factory.open;
 let listed:Awaited<ReturnType<typeof listPaperAppendArchives>>;try{listed=await listPaperAppendArchives({scope:captured,current:()=>true});}finally{f.factory.open=open;}
 assert.deepEqual(listed.receipts.map(receipt=>receipt.id),[r.id]);assert.equal(listed.legacyIncomplete.length,1);assert.equal(listed.legacyIncomplete[0].kind,'legacy-incomplete');assert.equal(listed.legacyIncomplete[0].sourceName,'historique.dowze');assert.equal(listed.legacyIncomplete[0].sourceZip,'absent');assert.equal(listed.legacyIncomplete[0].mediaReferences,'all-present');assert.deepEqual(listed.legacyIncomplete[0].missingAssetIds,[]);assert.ok(listed.legacyIncomplete[0].reason.includes('ZIP'));assert.equal(seen.length,2);assert.ok(seen.every(prefix=>!prefix.startsWith('paper-append-archive-source|')));assert.deepEqual(await getSnapshot(legacy.key),legacy);
 const file=(await listLocalBlobs(captured.accountId,captured.spaceId))[0];await putLocalBlob({...file,blob:new Blob(['Changed size source'],{type:file.blob.type})});
 const missing=(await listPaperAppendArchives({scope:captured,current:()=>true})).legacyIncomplete[0];assert.equal(missing.mediaReferences,'missing-or-mismatched');assert.deepEqual(missing.missingAssetIds,[r.receipt.files.find(descriptor=>descriptor.id===file.id)!.sourceId]);
 const unknown:Snapshot={...legacy,key:legacy.key+'-unknown',value:{schema:1,sourceName:'source-ambiguë.dowze',sourceDocument:{unknown:true}}};await putSnapshot(unknown);
 const unverified=(await listPaperAppendArchives({scope:captured,current:()=>true})).legacyIncomplete.find(entry=>entry.key===unknown.key)!;assert.equal(unverified.mediaReferences,'unverified');assert.deepEqual(unverified.missingAssetIds,[]);assert.deepEqual(await getSnapshot(unknown.key),unknown);assert.deepEqual(await getSnapshot(legacy.key),legacy);
});

test('Legacy destination must migrate before admission, and a recreated note with the same ID cannot receive an old ready import',async t=>{
 fixture(t);const captured=scope('incarnation'),seeded=await seed(captured),archive=await portable(),legacy=migratePaper(captured.noteId,'Texte ancien sans collaboration',null,stamp);
 await putDraft({...seeded.draft,content:legacy});const beforeLegacy=await observed(captured);
 await assert.rejects(()=>stagePaperAppendArchive({scope:captured,file:archive.file,id:'legacy-refused',current:()=>true}),/migration/);assert.deepEqual(await observed(captured),beforeLegacy);
 await putDraft(seeded.draft);await stagePaperAppendArchive({scope:captured,file:archive.file,id:'original-incarnation',current:()=>true});const receipt=await preparePaperAppendArchive({scope:captured,id:'original-incarnation',current:()=>true});assert.equal(receipt.state,'ready');
 // A fresh legitimate lineage models explicit deletion/recreation after the
 // server tombstone disappeared. Matching noteId alone is insufficient.
 const recreatedLegacy=migratePaper(captured.noteId,'Nouvelle note distincte',null,'2026-10-15T11:00:00.000Z'),recreated=amendPaperCollaboration(recreatedLegacy,recreatedLegacy);assert.notEqual(recreated.collaboration!.lineage,receipt.targetLineage);await putDraft({...seeded.draft,content:recreated});
 const before=await observed(captured);await assert.rejects(()=>preparePaperAppendArchivePublication({scope:captured,id:'original-incarnation',document:recreated,current:()=>true}),/identité/);assert.deepEqual(await observed(captured),before);assert.equal((await readPaperAppendArchive({scope:captured,id:'original-incarnation',current:()=>true})).state,'ready');
});

test('Malformed durable receipts refuse with a recovery error and do not change the canonical note, original or staged media',async t=>{
 fixture(t);
 for(const variant of [{files:[null]},{createdAt:1e30},{commands:[{type:'patch-object',id:'old-object',patch:{markdown:'Forbidden overwrite'}}]}]){
  const captured=scope('malformed-'+Object.keys(variant)[0]),r=await ready(captured),key=paperAppendArchiveReceiptKey(captured,r.id),row=(await getSnapshot(key))!;await putSnapshot({...row,value:{...r.receipt,...variant}});const before=await observed(captured);
  await assert.rejects(()=>readPaperAppendArchive({scope:captured,id:r.id,current:()=>true}),/reçu/);await assert.rejects(()=>preparePaperAppendArchivePublication({scope:captured,id:r.id,document:r.document,current:()=>true}),/reçu/);assert.deepEqual(await observed(captured),before);
 }
});

/** Seed the precise former writer contract, using the real archive verifier,
 * old remapper, receipt writer and separate LocalBlob writes. No ZIP is stored.
 * This represents an old interrupted import, not a process-kill proof. */
async function oldAppend(captured:PaperAppendArchiveScope,{present=false}={}){
 const baseline=await seed(captured),archive=await portable(),source=archive.verified.document,mapped=appendPaperArchive(source,captured.noteId),sourceReceiptKey=`paper-import-append|${captured.accountId}|${captured.spaceId}|${captured.noteId}|${crypto.randomUUID()}`,receipt:Snapshot={key:sourceReceiptKey,accountId:captured.accountId,spaceId:captured.spaceId,value:{schema:1,sourceName:archive.file.name,sourceDocument:source,sourceMetadata:archive.verified.metadata,assets:Object.fromEntries(mapped.assets),commands:mapped.commands}};
 await putSnapshot(receipt);
 for(const asset of source.assets)await putLocalBlob({accountId:captured.accountId,spaceId:captured.spaceId,id:mapped.assets.get(asset.id)!,documentId:baseline.draft.documentId,blob:archive.verified.files[`assets/${asset.id}`].slice(0,undefined,asset.mediaType),name:asset.name,createdAt:2,status:'pending',removedFromNote:true});
 let document=baseline.document;if(present){document=amendPaperCollaboration(document,applyPaperCommand(document,{type:'batch',commands:mapped.commands},stamp));await putDraft({...baseline.draft,content:document});}
 return {...baseline,baselineDocument:baseline.document,document,archive,mapped,sourceReceiptKey,sourceReceipt:await getSnapshot(sourceReceiptKey)};
}

test('Explicit legacy copy freezes current graph/media with new IDs and a new admission, without inventing a ZIP or mutating historical data',async t=>{
 fixture(t);const captured=scope('legacy-copy'),r=await oldAppend(captured),originals=await listLocalBlobs(captured.accountId,captured.spaceId),metadata=await getDraft({...r.draft,type:'notesMarkdown',documentId:captured.noteId}),started=Date.now();
 const staged=await stagePaperLegacyAppendArchiveCopy({scope:captured,sourceReceiptKey:r.sourceReceiptKey,current:()=>true});assert.equal(staged.state,'ready');const receipt=staged as PaperLegacyAppendReady;
 assert.ok(Date.parse(receipt.createdAt)>=started);assert.equal(receipt.targetLineage,r.document.collaboration!.lineage);assert.deepEqual(receipt.quality,{sourceZip:'absent',originalIntegrity:'unproven',historicalIncarnation:'unproven',localMedia:'sha256-verified-at-admission'});assert.equal('original' in receipt,false);assert.equal('importedAt' in receipt,false);assert.deepEqual(receipt.sourceReceipt,r.sourceReceipt);assert.deepEqual((await getDraft(r.draft))!.content,r.document);assert.deepEqual(await getSnapshot(r.sourceReceiptKey),r.sourceReceipt);
 const description=describePaperLegacyAppendArchiveRecovery(receipt);assert.equal(description.canPublishCopy,true);assert.equal(description.canSaveOriginal,false);assert.ok(description.label.includes('Copie explicite'));assert.ok(description.integrity.includes('SHA-256'));assert.ok(description.integrity.includes('ZIP original est absent'));assert.ok(description.integrity.includes('ne sont pas prouvées'));
 assert.equal(receipt.id,paperLegacyAppendRecoveryId(captured,r.sourceReceiptKey));assert.deepEqual(await stagePaperLegacyAppendArchiveCopy({scope:captured,sourceReceiptKey:r.sourceReceiptKey,current:()=>true}),receipt);
 const files=await listLocalBlobs(captured.accountId,captured.spaceId);assert.equal(files.length,originals.length*2);
 for(const descriptor of receipt.copy.files){const file=files.find(file=>file.id===descriptor.id)!,old=originals.find(file=>file.id===r.mapped.assets.get(descriptor.sourceId))!;assert.notEqual(file.id,old.id);assert.equal(file.removedFromNote,true);assert.equal(file.status,'pending');assert.equal(file.serverId,undefined);assert.equal(await checksum(file.blob),await checksum(old.blob));assert.equal(file.sha256,descriptor.sha256);}
 const prepared=await preparePaperLegacyAppendArchivePublication({scope:captured,id:receipt.id,document:r.document,current:()=>true});assert.equal(prepared.commit.drafts[0],prepared.draft);await commitNotebookTransfer(prepared.commit,()=>true);
 const next=(await getDraft(r.draft))!.content as PaperDocument;verifyPaperCollaboration(next);assert.equal(next.pages.length,r.document.pages.length+r.archive.verified.document.pages.length);assert.deepEqual(next.pages.slice(0,r.document.pages.length),r.document.pages);assert.equal(next.study!.cards[0].source!.noteId,captured.noteId);assert.equal(next.objects.find(object=>object.kind==='ink')!.audioAnchor!.sessionId,next.audio[0].id);assert.equal((await getDraft(r.draft))!.title,r.draft.title);assert.deepEqual(await getDraft({...r.draft,type:'notesMarkdown',documentId:captured.noteId}),metadata);assert.deepEqual(await getSnapshot(r.sourceReceiptKey),r.sourceReceipt);assert.deepEqual((await getSnapshot(prepared.receipt.beforeHistoryKey!))!.value,r.document);
 const after=await listLocalBlobs(captured.accountId,captured.spaceId);for(const original of originals){const found=after.find(file=>file.id===original.id)!;assert.deepEqual(found,original);assert.equal(await checksum(found.blob),await checksum(original.blob));}assert.ok(receipt.copy.files.every(file=>after.find(row=>row.id===file.id)!.removedFromNote===false));
 const applied=await readPaperLegacyAppendArchiveRecovery({scope:captured,id:receipt.id,current:()=>true});assert.equal(applied.state,'applied');if(applied.state==='applied')assert.equal(applied.outcome,'copy');assert.deepEqual(await listPaperLegacyAppendArchiveRecoveries({scope:captured,current:()=>true}),[]);assert.equal((await listSnapshots(captured.accountId,captured.spaceId)).some(row=>row.key.startsWith('paper-append-archive-source|')),false);await assert.rejects(()=>readPaperAppendArchiveOriginal({scope:captured,id:receipt.id,current:()=>true}),/reçu/);
 const undo=amendPaperCollaboration(next,applyPaperCommand(next,{type:'restore',document:r.document},stamp));await putDraft({...r.draft,content:undo});const before=await observed(captured);assert.equal((await stagePaperLegacyAppendArchiveCopy({scope:captured,sourceReceiptKey:r.sourceReceiptKey,current:()=>true})).state,'applied');await assert.rejects(()=>preparePaperLegacyAppendArchivePublication({scope:captured,id:receipt.id,document:undo,current:()=>true}),/déjà/);assert.deepEqual(await observed(captured),before);
});

test('A complete legacy mapped contribution is acknowledged currently present without replay, revision change or fabricated import history',async t=>{
 fixture(t);const captured=scope('legacy-present'),r=await oldAppend(captured,{present:true}),before=(await getDraft(r.draft))!,files=await listLocalBlobs(captured.accountId,captured.spaceId),snapshots=await listSnapshots(captured.accountId,captured.spaceId);
 const receipt=await stagePaperLegacyAppendArchiveCopy({scope:captured,sourceReceiptKey:r.sourceReceiptKey,current:()=>true});assert.equal(receipt.state,'applied');if(receipt.state==='applied'){assert.equal(receipt.outcome,'already-present');assert.equal(receipt.publishedRevision,r.document.revision);assert.equal(receipt.beforeHistoryKey,undefined);}
 const description=describePaperLegacyAppendArchiveRecovery(receipt);assert.equal(description.canPublishCopy,false);assert.equal(description.canSaveOriginal,false);assert.ok(description.status.includes('lors de cette reprise'));assert.ok(description.status.includes('aucune répétition automatique'));
 assert.equal(receipt.firstPageId,r.mapped.firstPageId);assert.deepEqual(await getDraft(r.draft),before);assert.deepEqual(await getSnapshot(r.sourceReceiptKey),r.sourceReceipt);const after=await listLocalBlobs(captured.accountId,captured.spaceId);assert.deepEqual(after.map(file=>file.id),files.map(file=>file.id));assert.ok(after.every(file=>file.removedFromNote===false));for(const file of after)assert.equal(await checksum(file.blob),await checksum(files.find(old=>old.id===file.id)!.blob));assert.equal((await listSnapshots(captured.accountId,captured.spaceId)).length,snapshots.length+1);
 const restored=amendPaperCollaboration(r.document,applyPaperCommand(r.document,{type:'restore',document:r.baselineDocument},stamp));await putDraft({...r.draft,content:restored});const unchanged=await observed(captured);assert.equal((await stagePaperLegacyAppendArchiveCopy({scope:captured,sourceReceiptKey:r.sourceReceiptKey,current:()=>true})).state,'applied');assert.deepEqual(await observed(captured),unchanged);
});

test('Divergent legacy IDs do not prove absence: explicit new copies preserve modified canonical objects and a verified current lineage',async t=>{
 fixture(t);const captured=scope('legacy-divergence'),r=await oldAppend(captured,{present:true}),ink=r.document.objects.find(object=>object.kind==='ink')!,edited=amendPaperCollaboration(r.document,applyPaperCommand(r.document,{type:'patch-object',id:ink.id,patch:{x:ink.x+71}},stamp));await putDraft({...r.draft,content:edited});
 const receipt=await stagePaperLegacyAppendArchiveCopy({scope:captured,sourceReceiptKey:r.sourceReceiptKey,current:()=>true});assert.equal(receipt.state,'ready');const prepared=await preparePaperLegacyAppendArchivePublication({scope:captured,id:receipt.id,document:edited,current:()=>true});await commitNotebookTransfer(prepared.commit,()=>true);const next=(await getDraft(r.draft))!.content as PaperDocument;assert.equal(next.objects.find(object=>object.id===ink.id)!.x,ink.x+71);assert.equal(next.objects.filter(object=>object.kind==='ink').length,2);assert.deepEqual(await getSnapshot(r.sourceReceiptKey),r.sourceReceipt);
});

test('Legacy source and copy CAS races refuse the entire publication; originals and already staged bytes remain available',async t=>{
 fixture(t);
 for(const kind of ['source-receipt','source-media','copy-media','recovery-receipt','target','tombstone']){
  const captured=scope('legacy-cas-'+kind),r=await oldAppend(captured),receipt=await stagePaperLegacyAppendArchiveCopy({scope:captured,sourceReceiptKey:r.sourceReceiptKey,current:()=>true});assert.equal(receipt.state,'ready');const ready=receipt as PaperLegacyAppendReady,prepared=await preparePaperLegacyAppendArchivePublication({scope:captured,id:receipt.id,document:r.document,current:()=>true});
  if(kind==='source-receipt')await putSnapshot({...r.sourceReceipt!,value:{...(r.sourceReceipt!.value as object),sourceName:'Concurrent historical source'}});
  if(kind==='source-media'||kind==='copy-media'){const id=kind==='source-media'?receipt.sourceFiles[0].id:ready.copy.files[0].id,file=(await listLocalBlobs(captured.accountId,captured.spaceId)).find(file=>file.id===id)!;await putLocalBlob({...file,blob:new Blob(['Concurrent bytes'],{type:file.blob.type})});}
  if(kind==='recovery-receipt'){const row=(await getSnapshot(paperLegacyAppendRecoveryKey(captured,receipt.id)))!;await putSnapshot({...row,value:{...receipt,sourceName:'Concurrent recovery'}});}
  if(kind==='target')await putDraft({...r.draft,content:amendPaperCollaboration(r.document,applyPaperCommand(r.document,{type:'patch-object',id:r.document.objects[0].id,patch:{markdown:'Concurrent target text'}},stamp))});
  if(kind==='tombstone')await putSnapshot({key:notebookDeletionKey(r.draft),accountId:captured.accountId,spaceId:captured.spaceId,value:{schema:1,kind:'paper-canonical-deletion',...captured,documentId:r.draft.documentId,version:5,deletedAt:2}});
  const before=await observed(captured);await assert.rejects(()=>commitNotebookTransfer(prepared.commit,()=>true),/changé/);assert.deepEqual(await observed(captured),before);assert.equal(await getSnapshot(prepared.receipt.beforeHistoryKey!),undefined);
 }
});

test('Legacy staging quota after a real copied media write rolls back only the new admission and keeps every historical source byte',async t=>{
 const f=fixture(t),captured=scope('legacy-quota'),r=await oldAppend(captured),originalIds=new Set((await listLocalBlobs(captured.accountId,captured.spaceId)).map(file=>file.id)),before=await observed(captured),fault=f.quotaAfter('scopedBlobs',row=>row.accountId===captured.accountId&&!originalIds.has(row.id));
 try{await assert.rejects(()=>deadline(stagePaperLegacyAppendArchiveCopy({scope:captured,sourceReceiptKey:r.sourceReceiptKey,current:()=>true}),'legacy staging quota'),error=>(error as Error).name==='AbortError');await deadline(fault.terminal,'legacy source transaction terminal');assert.equal(fault.ledger.writes,1);assert.equal(fault.ledger.aborts,1);assert.deepEqual(await observed(captured),before);}finally{fault.restore();}
 const receipt=await stagePaperLegacyAppendArchiveCopy({scope:captured,sourceReceiptKey:r.sourceReceiptKey,current:()=>true});assert.equal(receipt.state,'ready');assert.equal(receipt.id,paperLegacyAppendRecoveryId(captured,r.sourceReceiptKey));assert.equal((await listLocalBlobs(captured.accountId,captured.spaceId)).length,originalIds.size*2);assert.deepEqual(await getSnapshot(r.sourceReceiptKey),r.sourceReceipt);
});

test('Legacy missing/mismatched media, forged commands and overlapping note keys are refused without claiming their data was lost',async t=>{
 fixture(t);
 for(const kind of ['wrong-owner','wrong-size','wrong-sha','commands','mapping','overlap']){
  const captured=scope('legacy-refusal-'+kind),r=await oldAppend(captured);let sourceReceiptKey=r.sourceReceiptKey;
  if(kind==='wrong-owner'||kind==='wrong-size'){const file=(await listLocalBlobs(captured.accountId,captured.spaceId))[0];await putLocalBlob({...file,...(kind==='wrong-owner'?{documentId:'unrelated-paper'}:{blob:new Blob(['Different length source'],{type:file.blob.type})})});}
  if(kind==='wrong-sha'){const source=(await listLocalBlobs(captured.accountId,captured.spaceId))[0],database=await new Promise<IDBDatabase>((resolve,reject)=>{const read=indexedDB.open('dowze-academie-pwa',3);read.onsuccess=()=>resolve(read.result);read.onerror=()=>reject(read.error);});await new Promise<void>((resolve,reject)=>{const tx=database.transaction('scopedBlobs','readwrite');tx.objectStore('scopedBlobs').put({...source,sha256:'0'.repeat(64)});tx.oncomplete=()=>{database.close();resolve();};tx.onerror=tx.onabort=()=>{database.close();reject(tx.error);};});}
  if(kind==='commands')await putSnapshot({...r.sourceReceipt!,value:{...(r.sourceReceipt!.value as object),commands:[...r.mapped.commands,{type:'patch-object',id:r.document.objects[0].id,patch:{markdown:'Forbidden historical overwrite'}}]}});
  if(kind==='mapping')await putSnapshot({...r.sourceReceipt!,value:{...(r.sourceReceipt!.value as object),assets:Object.fromEntries([...r.mapped.assets].map(([source])=>[source,'same-for-all']))}});
  if(kind==='overlap'){sourceReceiptKey=`paper-import-append|${captured.accountId}|${captured.spaceId}|${captured.noteId}|longer-note|uid`;await putSnapshot({...r.sourceReceipt!,key:sourceReceiptKey});}
  const before=await observed(captured);await assert.rejects(()=>stagePaperLegacyAppendArchiveCopy({scope:captured,sourceReceiptKey,current:()=>true}));assert.deepEqual(await observed(captured),before);assert.equal((await listPaperLegacyAppendArchiveRecoveries({scope:captured,current:()=>true})).length,0);
 }
});

test('Legacy recovery never reactivates an old A-B-A admission or changes the captured incarnation after staging',async t=>{
 fixture(t);const captured=scope('legacy-aba'),r=await oldAppend(captured),before=await observed(captured);let generation=1;const current=()=>generation===1,operation=stagePaperLegacyAppendArchiveCopy({scope:captured,sourceReceiptKey:r.sourceReceiptKey,current});generation=2;await assert.rejects(()=>operation,/compte/);generation=3;await assert.rejects(()=>stagePaperLegacyAppendArchiveCopy({scope:captured,sourceReceiptKey:r.sourceReceiptKey,current}),/compte/);assert.deepEqual(await observed(captured),before);
 const admitted=await stagePaperLegacyAppendArchiveCopy({scope:captured,sourceReceiptKey:r.sourceReceiptKey,current:()=>generation===3});assert.equal(admitted.state,'ready');const recreatedLegacy=migratePaper(captured.noteId,'Fresh incarnation',null,'2026-10-15T12:00:00Z'),recreated=amendPaperCollaboration(recreatedLegacy,recreatedLegacy);await putDraft({...r.draft,content:recreated});const changed=await observed(captured);await assert.rejects(()=>preparePaperLegacyAppendArchivePublication({scope:captured,id:admitted.id,document:recreated,current:()=>true}),/identité/);assert.deepEqual(await observed(captured),changed);
});
