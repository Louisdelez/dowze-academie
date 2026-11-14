/** Actual DeviceCache + real managed store over fake-indexeddb. Only fixture
 * admission/ACK ledgers are synthetic; no network/native bridge/App claim. */
import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {IDBFactory} from 'fake-indexeddb';
import {requireBoundedMountedCheck} from './mounted-cleanup.mjs';
import {DeviceCache} from '../src/lib/appStorage.ts';
import {createDesktopManagedNotebookMetadataBridge,desktopManagedMetadataPointerKey,desktopManagedMetadataHistoryKey} from '../src/lib/desktopManagedNotebookMetadata.ts';
import {openNotebookStateDatabase,putDraft,getDraft,getSnapshot,type Draft} from '../pwa/src/storage.ts';
import {createManagedNotebookStore,managedBindingKey,managedResourceKey} from '../pwa/src/managedNotebookStore.ts';
import {MANAGED_ADMISSION_PROTOCOL,ManagedClientError,type PreparedManagedAdmission,type ManagedTicket} from '../pwa/src/managedNotebookClient.ts';
import {MANAGED_SOURCE_CODEC,MANAGED_WRITE_PROTOCOL,encodeManagedSource,prepareManagedWrite} from '../pwa/src/managedNotebookProtocol.ts';
import {migratePaper,notebookDocumentId} from '../src/lib/notebookDocument.ts';
import {amendPaperCollaboration} from '../src/lib/paperCollaboration.ts';
import type {SubjectNoteDocument,SubjectNotesStore} from '../src/types.ts';
requireBoundedMountedCheck();
const actor='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',resource='20000000-0000-4000-8000-000000000001',incarnation='30000000-0000-4000-8000-000000000001';
const serverKey='https://managed.invalid',scope={accountId:actor,spaceId:'year-one'},notesKey='etude.desktop-current-notes',noteId='desktop-exact-note',now='2026-10-16T10:00:00.000Z';
const sha=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const exact=(actual:unknown,expected:unknown)=>assert.equal(isDeepStrictEqual(actual,expected),true,'Exact source differs: '+sha(JSON.stringify(actual)??'undefined')+' / '+sha(JSON.stringify(expected)??'undefined'));
const rejected=(error:unknown)=>error instanceof ManagedClientError&&['source-changed','authority-changed','invalid-response','unavailable'].includes(error.code);
let fatal=false;
async function fixture(t:TestContext){
 if(fatal)throw Error('FATAL_STOP: prior original database work remains');
 const previous=Object.getOwnPropertyDescriptor(globalThis,'indexedDB'),factory=new IDBFactory(),connections=new Set<IDBDatabase>(),transactions=new Set<IDBTransaction>(),opens=new Set<IDBOpenDBRequest>();
 let started=0,completed=0,aborted=0,race=false,races=0;const terminals:Promise<void>[]=[];
 const track=(tx:IDBTransaction)=>{if(transactions.has(tx))return;transactions.add(tx);started++;terminals.push(new Promise(resolve=>{tx.addEventListener('complete',()=>{transactions.delete(tx);completed++;resolve();},{once:true});tx.addEventListener('abort',()=>{transactions.delete(tx);aborted++;resolve();},{once:true});}));};
 const rawOpen=factory.open.bind(factory);
 factory.open=((...args:Parameters<IDBFactory['open']>)=>{const stack=new Error().stack??'',request=rawOpen(...args);opens.add(request);request.addEventListener('upgradeneeded',()=>{if(request.transaction)track(request.transaction);},{once:true});request.addEventListener('error',()=>opens.delete(request),{once:true});request.addEventListener('success',()=>{
  opens.delete(request);const db=request.result,close=db.close.bind(db),transaction=db.transaction.bind(db);connections.add(db);db.close=()=>{close();connections.delete(db);};db.transaction=((...values:Parameters<IDBDatabase['transaction']>)=>{const tx=transaction(...values);track(tx);return tx;})as IDBDatabase['transaction'];
  if(race&&db.name==='dowze-academie-pwa'&&stack.includes('commitNotebookTransfer')){race=false;races++;const tx=db.transaction('snapshots','readwrite'),store=tx.objectStore('snapshots'),read=store.get(managedResourceKey(serverKey,actor,resource));read.onsuccess=()=>store.put({...read.result,value:{...read.result.value,incarnation:'30000000-0000-4000-8000-000000000099'}});}
 },{once:true});return request;})as IDBFactory['open'];
 Object.defineProperty(globalThis,'indexedDB',{configurable:true,writable:true,value:factory});
 const cache=new DeviceCache();const legacy:Storage={length:0,key:()=>null,getItem:()=>null,setItem:()=>{throw Error('No legacy write');},removeItem:()=>{throw Error('No legacy removal');},clear:()=>{throw Error('No legacy clear');}};
 await cache.initialize(legacy,factory);
 let note:SubjectNoteDocument={id:noteId,title:'Original exact e\u0301',markdown:'Original metadata',subjectIds:['subject-one'],tags:['École'],createdAt:now,updatedAt:now};
 const foreign:SubjectNoteDocument={...note,id:'foreign-note',title:'Foreign exact original'};
 let store:SubjectNotesStore={schemaVersion:2,documents:[note,foreign],openDocumentIds:[noteId],activeDocumentId:noteId},opaque:object={},source=opaque;
 cache.setItem(notesKey,JSON.stringify(store));await cache.flush();const events=new EventTarget();
 const bridge=createDesktopManagedNotebookMetadataBridge({scope,notesKey,sourceRef:source,currentSource:()=>opaque,currentNote:id=>store.documents.find(row=>row.id===id),cache,events,openDatabase:openNotebookStateDatabase});
 t.after(async()=>{bridge.dispose();try{await cache.flush();await Promise.all(terminals);}finally{cache.close();if(opens.size||transactions.size||connections.size){fatal=true;throw Error('FATAL_STOP: exact original database work remains');}assert.equal(started,completed+aborted);if(previous)Object.defineProperty(globalThis,'indexedDB',previous);else Reflect.deleteProperty(globalThis,'indexedDB');}});
 const plain=migratePaper(noteId,'Original canonical',null,now),paper=amendPaperCollaboration(plain,plain),identity={...scope,noteId,canonicalDocumentId:notebookDocumentId(noteId),metadataDocumentId:noteId,lineage:paper.collaboration!.lineage};
 const canonical:Draft={...scope,type:'whiteboard',documentId:identity.canonicalDocumentId,title:note.title,content:paper,baseVersion:1,updatedAt:Date.parse(now),syncState:'synced'},metadata:Draft={...scope,type:'notesMarkdown',documentId:noteId,title:note.title,content:note,baseVersion:1,updatedAt:Date.parse(now),syncState:'synced'};
 await putDraft(canonical);await putDraft(metadata);await putDraft({...metadata,accountId:other,content:foreign,title:foreign.title});
 async function write(name:string,value:unknown){const db=await openNotebookStateDatabase();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction(name,'readwrite');tx.objectStore(name).put(value);tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??Error('Fixture seed aborted'));});}finally{db.close();}}
 await write('snapshots',{key:'foreign-history',accountId:other,spaceId:scope.spaceId,value:{exact:['original',0,255]}});
 await write('scopedBlobs',{key:[other,scope.spaceId,'foreign-media'].join('|'),accountId:other,spaceId:scope.spaceId,id:'foreign-media',documentId:'foreign',blob:new Blob([new Uint8Array([0,255,80,75])],{type:'application/octet-stream'}),name:'Original.bin',createdAt:1,status:'pending',sha256:sha(new Uint8Array([0,255,80,75]))});
 const managed=createManagedNotebookStore(openNotebookStateDatabase),current=()=>true;
 const canonicalWire=await encodeManagedSource(paper,current),metadataWire=await encodeManagedSource(note,current);
 const proof={actorAccountId:actor,identity,canonical:{version:1,...canonicalWire},metadata:{version:1,...metadataWire}},admissionKey='desktop-exact-admission',body=JSON.stringify({protocol:MANAGED_ADMISSION_PROTOCOL,source_codec:MANAGED_SOURCE_CODEC,private_write_policy:'managed-only',incarnation,space_id:scope.spaceId,note_id:noteId,canonical_document_id:identity.canonicalDocumentId,metadata_document_id:noteId,lineage:identity.lineage,canonical:{version:1,sha256:canonicalWire.sha256},metadata:{version:1,sha256:metadataWire.sha256}});
 const prepared:PreparedManagedAdmission={actorAccountId:actor,resourceId:resource,incarnation,idempotencyKey:admissionKey,body,packetSha256:sha(body),proof};
 await managed.beginAdmission(identity,{serverKey,resourceId:resource,incarnation,admissionKey},current);await managed.stageAdmission(identity,prepared,current);
 await managed.ackAdmission(identity,prepared,{protocol:MANAGED_ADMISSION_PROTOCOL,source_codec:MANAGED_SOURCE_CODEC,actor_account_id:actor,resource_id:resource,incarnation,resource_version:1,space_id:scope.spaceId,note_id:noteId,canonical_document_id:identity.canonicalDocumentId,metadata_document_id:noteId,lineage:identity.lineage,canonical_version:1,metadata_version:1,canonical_source_sha256:canonicalWire.sha256,metadata_source_sha256:metadataWire.sha256,packet_sha256:sha(body),created_at:now},current);
 async function inventory(){const db=await openNotebookStateDatabase(),result:Record<string,any[]>={};try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['drafts','snapshots','mutations','scopedBlobs','blobs'],'readonly');for(const name of ['drafts','snapshots','mutations','scopedBlobs','blobs']){const read=tx.objectStore(name).getAll();read.onsuccess=()=>{result[name]=read.result;};}tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??Error('Inventory aborted'));});}finally{db.close();}for(const name of ['scopedBlobs','blobs'])result[name]=await Promise.all(result[name].map(async({blob,...rest})=>({...rest,size:blob.size,mediaType:blob.type,actualSHA256:sha(new Uint8Array(await blob.arrayBuffer()))})));return result;}
 let tick=0;
 async function edit(title:string){tick++;note={...note,title,markdown:note.markdown+' '+title,updatedAt:new Date(Date.parse(now)+tick).toISOString()};store={...store,documents:store.documents.map(row=>row.id===noteId?note:row)};cache.setItem(notesKey,JSON.stringify(store));await cache.flush();}
 return {bridge,cache,events,identity,canonical,metadata,managed,current,inventory,edit,write,store:()=>store,note:()=>note,source:()=>source,setOpaque:(value:object)=>{opaque=value;},race:()=>{race=true;},stats:()=>({started,completed,aborted,races}),capture:()=>bridge.capture(noteId,current)};
}
function originals(after:Record<string,any[]>,before:Record<string,any[]>){exact(after.scopedBlobs,before.scopedBlobs);exact(after.blobs,before.blobs);exact(after.mutations,before.mutations);const metadata=(row:any)=>row.accountId===actor&&row.spaceId===scope.spaceId&&row.type==='notesMarkdown'&&row.documentId===noteId;exact(after.drafts.filter(row=>!metadata(row)),before.drafts.filter(row=>!metadata(row)));for(const row of before.snapshots)exact(after.snapshots.find(value=>value.key===row.key),row);}

test('Desktop source capture is readonly; explicit mirror preserves DeviceCache, admitted originals, foreign rows/media and exact history while keeping the latest selected durable note',async t=>{
 const f=await fixture(t),before=await f.inventory(),raw=await f.cache.readCurrentItem(notesKey),revision=f.cache.snapshot(),capture=await f.capture();assert.equal(capture.noteId,noteId);assert.equal(capture.current(),true);exact(await f.inventory(),before);assert.equal(await f.cache.readCurrentItem(notesKey),raw);
 const first=await f.bridge.mirror(capture,f.current);exact(first,(await getDraft(f.metadata))!);assert.equal(f.cache.snapshot(),revision);const bootstrap=await f.inventory();originals(bootstrap,before);
 const pointer=(await getSnapshot(desktopManagedMetadataPointerKey(scope,notesKey,noteId)))!;assert.equal((pointer.value as any).revision,1);assert.equal((pointer.value as any).sourceKey,capture.sourceKey);
 await f.edit('Confirmed Desktop title');assert.equal(capture.current(),false);const nextCapture=await f.capture(),source=await f.cache.readCurrentItem(notesKey),previous=await f.inventory(),next=await f.bridge.mirror(nextCapture,f.current);
 assert.equal(next.title,f.note().title);exact(next.content,f.note());assert.equal(next.baseVersion,1);assert.equal(next.syncState,'local');assert.equal(await f.cache.readCurrentItem(notesKey),source);const after=await f.inventory();
 exact(after.scopedBlobs,previous.scopedBlobs);exact(after.mutations,previous.mutations);for(const row of previous.snapshots.filter(row=>row.key!==pointer.key))exact(after.snapshots.find(value=>value.key===row.key),row);const updated=(await getSnapshot(pointer.key))!.value as any;assert.equal(updated.revision,2);assert.equal(updated.sourceKey,nextCapture.sourceKey);
 const history=(await getSnapshot(desktopManagedMetadataHistoryKey(scope,notesKey,noteId,updated.captureNonce)))!.value as any;exact(history.before,first);exact(history.after,next);exact(history.sourceContent,f.note());assert.equal(history.sourceSha256,sha(JSON.stringify(history.sourceContent)));const stable=await f.inventory();exact(await f.bridge.mirror(nextCapture,f.current),next);exact(await f.inventory(),stable);
});

test('Opaque scope A-B-A, selected note/cache A-B-A and another-window invalidation never reactivate a captured Desktop source',async t=>{
 const f=await fixture(t),capture=await f.capture(),before=await f.inventory();f.setOpaque({});assert.equal(capture.current(),false);f.setOpaque(f.source());assert.equal(capture.current(),false);await assert.rejects(f.bridge.mirror(capture,f.current),rejected);exact(await f.inventory(),before);
 const fresh=await f.capture(),raw=await f.cache.readCurrentItem(notesKey);f.cache.setItem(notesKey,raw+' ');f.cache.setItem(notesKey,raw!);await f.cache.flush();assert.equal(fresh.current(),false);await assert.rejects(f.bridge.mirror(fresh,f.current),rejected);exact(await f.inventory(),before);
 const windowCapture=await f.capture();f.events.dispatchEvent(new Event('dowze:cache-other-window'));assert.equal(windowCapture.current(),false);await assert.rejects(f.bridge.mirror(windowCapture,f.current),rejected);exact(await f.inventory(),before);
});

test('An independent IDB edit or a preceding native reservation transaction blocks mirroring without replacing any accepted original',async t=>{
 const f=await fixture(t),capture=await f.capture(),row=(await getDraft(f.metadata))!;await putDraft({...row,title:'Independent IDB title',content:{...(row.content as object),title:'Independent IDB title'},syncState:'local'});const preserved=await f.inventory(),raw=await f.cache.readCurrentItem(notesKey);await assert.rejects(f.bridge.mirror(capture,f.current),rejected);exact(await f.inventory(),preserved);assert.equal(await f.cache.readCurrentItem(notesKey),raw);
 await t.test('Actual preceding resource write defeats the exact snapshot CAS',async sub=>{const g=await fixture(sub),accepted=await g.capture(),before=await g.inventory();g.race();await assert.rejects(g.bridge.mirror(accepted,g.current),rejected);assert.equal(g.stats().races,1);assert.equal(g.stats().aborted,1);const after=await g.inventory(),resourceKey=managedResourceKey(serverKey,actor,resource);exact(after.drafts,before.drafts);exact(after.scopedBlobs,before.scopedBlobs);exact(after.mutations,before.mutations);exact(after.snapshots.filter(row=>row.key!==resourceKey),before.snapshots.filter(row=>row.key!==resourceKey));assert.equal((after.snapshots.find(row=>row.key===resourceKey)!.value as any).incarnation,'30000000-0000-4000-8000-000000000099');});
});

test('Metadata header advancement requires the unique exact acknowledged managed packet and cannot rely on a receipt header alone',async t=>{
 const f=await fixture(t);await f.bridge.mirror(await f.capture(),f.current);await f.edit('First managed contribution');await f.bridge.mirror(await f.capture(),f.current);const local=await f.managed.localPair(f.identity,f.current);
 const ticket:ManagedTicket={protocol:'dowze-managed-notebook@1',id:resource,incarnation,owner_account_id:actor,space_id:scope.spaceId,note_id:noteId,canonical_document_id:f.identity.canonicalDocumentId,metadata_document_id:noteId,lineage:f.identity.lineage,state:'active',resource_version:1,acl_version:1,access_version:1,writer_version:1,role:'owner',capabilities:{read_documents:true,write_documents:true,read_blobs:true,manage_acl:true}};
 const prepared=await prepareManagedWrite({actorAccountId:actor,resourceId:resource,incarnation,resourceVersion:1,writerVersion:1,idempotencyKey:'desktop-write-exact-key',canonicalVersion:1,metadataVersion:1,canonical:local.canonical.content,metadata:local.metadata.content},f.current),pending=await f.managed.stageWrite(f.identity,ticket,prepared,local,f.current);
 const receipt={protocol:MANAGED_WRITE_PROTOCOL,source_codec:MANAGED_SOURCE_CODEC,actor_account_id:actor,resource_id:resource,incarnation,resource_version:1,writer_version:1,canonical_base_version:1,metadata_base_version:1,canonical_version:2,metadata_version:2,canonical_source_sha256:prepared.canonical.sha256,metadata_source_sha256:prepared.metadata.sha256,packet_sha256:prepared.packetSha256,changed_at:now};
 await f.managed.ackWrite(f.identity,pending,receipt,f.current);const binding=(await f.managed.admission(f.identity,f.current))!;assert.equal(binding.binding.lastWriteKey,prepared.idempotencyKey);
 await f.edit('Latest durable after ACK');const capture=await f.capture(),next=await f.bridge.mirror(capture,f.current);assert.equal(next.baseVersion,2);assert.equal(next.syncState,'local');exact(next.content,f.note());
 await t.test('A changed unique operation remains refused',async sub=>{const g=await fixture(sub);await g.bridge.mirror(await g.capture(),g.current);const source=await getSnapshot(managedBindingKey(g.identity));assert.ok(source);await g.write('snapshots',{...source,value:{...source.value as object,binding:{...(source.value as any).binding,lastWriteKey:'unknown-exact-key',lastWriteReceipt:receipt}}});const row=(await getDraft(g.metadata))!;await putDraft({...row,baseVersion:2,syncState:'synced'});await g.edit('New source with unproved header');const candidate=await g.capture(),before=await g.inventory();await assert.rejects(g.bridge.mirror(candidate,g.current),rejected);exact(await g.inventory(),before);});
});

test('A source changing in the second database after IDB commit retires the old capture; the committed history stays available and no inverse overwrite is attempted',async t=>{
 const f=await fixture(t);await f.bridge.mirror(await f.capture(),f.current);await f.edit('Captured durable source');const capture=await f.capture(),read=f.cache.readCurrentItem.bind(f.cache);let reads=0;
 f.cache.readCurrentItem=async key=>{const value=await read(key);if(key===notesKey&&++reads===3)await f.edit('New durable source after IDB commit');return value;};
 try{await assert.rejects(f.bridge.mirror(capture,f.current),rejected);}finally{f.cache.readCurrentItem=read;}
 assert.equal(capture.current(),false);const pointer=(await getSnapshot(desktopManagedMetadataPointerKey(scope,notesKey,noteId)))!.value as any;assert.equal(pointer.sourceKey,capture.sourceKey);assert.equal((pointer.row.content as SubjectNoteDocument).title,'Captured durable source');assert.equal(f.note().title,'New durable source after IDB commit');assert.notEqual((await getDraft(f.metadata))!.title,f.note().title);const history=await getSnapshot(desktopManagedMetadataHistoryKey(scope,notesKey,noteId,pointer.captureNonce));assert.ok(history);
 const latest=await f.capture();await f.bridge.mirror(latest,f.current);exact((await getDraft(f.metadata))!.content,f.note());
});

test('Legacy formats and corrupted pointer history are refused without metadata normalization, fallback or any DeviceCache replacement',async t=>{
 const f=await fixture(t);await f.bridge.mirror(await f.capture(),f.current);const pointer=(await getSnapshot(desktopManagedMetadataPointerKey(scope,notesKey,noteId)))!.value as any,historyKey=desktopManagedMetadataHistoryKey(scope,notesKey,noteId,pointer.captureNonce),history=(await getSnapshot(historyKey))!;
 await f.write('snapshots',{...history,value:{...history.value as object,sourceSha256:'0'.repeat(64)}});await f.edit('New selected source');const capture=await f.capture(),preserved=await f.inventory(),raw=await f.cache.readCurrentItem(notesKey);await assert.rejects(f.bridge.mirror(capture,f.current),rejected);exact(await f.inventory(),preserved);assert.equal(await f.cache.readCurrentItem(notesKey),raw);
 const legacy={schemaVersion:1,documents:[{id:noteId,subjectId:'subject-one',title:'Legacy exact',markdown:'Legacy original',createdAt:now,updatedAt:now}],activeDocumentBySubject:{'subject-one':noteId}},legacyRaw=JSON.stringify(legacy);f.cache.setItem(notesKey,legacyRaw);await f.cache.flush();await assert.rejects(f.capture(),rejected);assert.equal(await f.cache.readCurrentItem(notesKey),legacyRaw);exact(await f.inventory(),preserved);
});
