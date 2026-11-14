import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB} from 'fake-indexeddb';
import {migratePaper,isPaperDocument,legacyPaperPhotoIdentities,notebookDocumentId} from '../src/lib/notebookDocument.ts';
import {amendPaperCollaboration,verifyPaperCollaboration} from '../src/lib/paperCollaboration.ts';
import {savePaperDraft,listSnapshots} from '../pwa/src/storage.ts';
globalThis.indexedDB=indexedDB;
const stamp='2026-10-13T12:00:00Z';
const stroke=(id:unknown,x:number)=>({id,color:'#294caa',width:4,points:[{x,y:30,pressure:.2},{x:x+15,y:40,pressure:.8}]});

test('Short unique legacy object and attachment identities stay unchanged',()=>{
 const source={board:{strokes:[stroke('one',10),stroke('two',30)]},photos:[{id:'photo-one',serverId:'file-one'},{id:'photo-two',serverId:'file-two'}]};
 const document=migratePaper('qa-short','Exact text',source,stamp);assert.ok(isPaperDocument(document));
 assert.deepEqual(document.objects.filter(o=>o.kind==='ink').map(o=>o.id),['legacy-ink-one','legacy-ink-two']);
 assert.deepEqual(document.objects.filter(o=>o.kind==='image').map(o=>o.id),['legacy-image-photo-one','legacy-image-photo-two']);
 assert.deepEqual(document.assets.map(a=>a.id),['photo-one','photo-two']);
});

test('Long prefixed IDs are bounded without losing ink coordinates or image references',()=>{
 const first='x'.repeat(199)+'A',second='x'.repeat(199)+'B',source={board:{strokes:[stroke(first,10),stroke(second,30)]},photos:[{id:first,name:'First',serverId:'file-a'},{id:second,name:'Second',serverId:'file-b'}]},original=structuredClone(source);
 const document=migratePaper('qa-long','Exact text',source,stamp);assert.ok(isPaperDocument(document));
 assert.equal(document.objects.filter(o=>o.kind==='ink').length,2);assert.equal(document.objects.filter(o=>o.kind==='image').length,2);
 assert.equal(new Set(document.objects.map(o=>o.id)).size,document.objects.length);assert.ok(document.objects.every(o=>o.id.length<=200));
 assert.deepEqual(document.objects.filter(o=>o.kind==='ink').map(o=>o.points?.map(p=>({x:p.x,y:p.y,pressure:p.pressure}))),source.board.strokes.map(s=>s.points));
 const mappings=legacyPaperPhotoIdentities('qa-long',source);assert.deepEqual(document.assets.map(a=>({id:a.id,serverId:a.serverId})),[{id:mappings[0].assetId,serverId:'file-a'},{id:mappings[1].assetId,serverId:'file-b'}]);assert.ok(document.assets.every(asset=>asset.id.length<=127));assert.deepEqual(mappings.map(row=>row.sourceId),[first,second]);assert.deepEqual(source,original);
 assert.deepEqual(migratePaper('qa-long','Exact text',structuredClone(source),stamp),document);
});

test('Repeated stroke IDs retain every contribution and remain separate collaborative entities',()=>{
 const source={board:{strokes:[stroke('duplicate',10),stroke('duplicate',40),stroke('duplicate',70)]}},document=migratePaper('qa-repeat-ink','Text',source,stamp),inks=document.objects.filter(o=>o.kind==='ink');
 assert.ok(isPaperDocument(document));assert.equal(inks.length,3);assert.equal(inks[0].id,'legacy-ink-duplicate');assert.equal(new Set(inks.map(o=>o.id)).size,3);assert.deepEqual(inks.map(o=>o.points?.[0].x),[10,40,70]);
 const shared=amendPaperCollaboration(document,document);verifyPaperCollaboration(shared);assert.equal(shared.objects.filter(o=>o.kind==='ink').length,3);
});

test('Generated ink IDs cannot steal a short identity already present later in the board',()=>{
 const sourceId='long'.repeat(70),first=migratePaper('qa-reserved','', {board:{strokes:[stroke(sourceId,10)]}},stamp),generated=first.objects.find(o=>o.kind==='ink')!.id,shortId=generated.slice('legacy-ink-'.length);
 const document=migratePaper('qa-reserved','',{board:{strokes:[stroke(sourceId,10),stroke(shortId,70)]}},stamp),inks=document.objects.filter(o=>o.kind==='ink');assert.ok(isPaperDocument(document));assert.equal(inks[1].id,generated);assert.notEqual(inks[0].id,generated);assert.deepEqual(inks.map(o=>o.points?.[0].x),[10,70]);
});

test('Repeated photographs share an original asset but preserve distinct visible objects',()=>{
 const source={photos:[{id:'same-photo',name:'First label',serverId:'same-file'},{id:'same-photo',name:'Second label',serverId:'same-file'}]},document=migratePaper('qa-repeat-photo','',source,stamp);
 assert.ok(isPaperDocument(document));assert.equal(document.assets.length,1);assert.equal(document.assets[0].serverId,'same-file');assert.equal(document.objects.filter(o=>o.kind==='image').length,2);assert.equal(new Set(document.objects.map(o=>o.id)).size,document.objects.length);
 const plan=legacyPaperPhotoIdentities('qa-repeat-photo',source);assert.equal(plan.length,2);assert.equal(plan[0].assetId,plan[1].assetId);
});

test('Same photo identity with different originals produces an explicit file association plan',()=>{
 const source={photos:[{id:'photo',serverId:'file-first'},{id:'photo',serverId:'file-second'}]},markdown='![Original](dowze-photo:note-qa-photo-variants/photo)',document=migratePaper('qa-photo-variants',markdown,source,stamp),plan=legacyPaperPhotoIdentities('qa-photo-variants',source);
 assert.ok(isPaperDocument(document));assert.equal(document.assets.length,2);assert.deepEqual(document.assets.map(a=>a.serverId),['file-first','file-second']);assert.equal(plan[0].assetId,'photo');assert.notEqual(plan[1].assetId,'photo');assert.equal(document.objects[0].markdown,markdown);assert.equal(document.legacy.markdown,markdown);
 assert.deepEqual(document.objects.filter(o=>o.kind==='image').map(o=>o.assetId),[plan[1].assetId]);assert.deepEqual(plan.map(p=>({photoIndex:p.photoIndex,sourceId:p.sourceId,serverId:p.serverId})),[{photoIndex:0,sourceId:'photo',serverId:'file-first'},{photoIndex:1,sourceId:'photo',serverId:'file-second'}]);
});

test('Photo identities beyond model bounds are retained and reserved short IDs stay owned',()=>{
 const sourceId='é'.repeat(240),source={photos:[{id:sourceId,name:'Long original',serverId:'file-long'}]},plan=legacyPaperPhotoIdentities('qa-photo-long',source),document=migratePaper('qa-photo-long','',source,stamp);
 assert.ok(isPaperDocument(document));assert.equal(plan[0].sourceId,sourceId);assert.ok(plan[0].assetId.length<=200);assert.equal(document.assets[0].id,plan[0].assetId);assert.equal(document.assets[0].serverId,'file-long');assert.equal(document.objects.filter(o=>o.kind==='image').length,1);
 const reserved={photos:[...source.photos,{id:plan[0].assetId,name:'Independent original',serverId:'file-short'}]},reservedPlan=legacyPaperPhotoIdentities('qa-photo-long',reserved),reservedDocument=migratePaper('qa-photo-long','',reserved,stamp);
 assert.ok(isPaperDocument(reservedDocument));assert.equal(reservedPlan[1].assetId,plan[0].assetId);assert.notEqual(reservedPlan[0].assetId,reservedPlan[1].assetId);assert.deepEqual(reservedDocument.assets.map(a=>a.serverId),['file-long','file-short']);
});

test('Atomic migration receipt retains exact raw IDs, duplicate metadata and original source',async()=>{
 const source={board:{strokes:[stroke('duplicate',10),stroke('duplicate',40)]},photos:[{id:'p'.repeat(240),name:'Long',serverId:'file-long'},{id:'photo',serverId:'one'},{id:'photo',serverId:'two'}]},before=structuredClone(source),noteId='qa-object-identity-receipt',content=migratePaper(noteId,'Original Markdown',source,stamp),draft={accountId:'qa-object-identity',spaceId:'year',type:'whiteboard' as const,documentId:notebookDocumentId(noteId),title:'QA',content,baseVersion:0,updatedAt:1,syncState:'local' as const};
 assert.ok(isPaperDocument(content));await savePaperDraft(draft,null,{markdown:'Original Markdown',legacy:source,migratedAt:stamp});const receipts=await listSnapshots(draft.accountId,draft.spaceId),receipt=receipts.find(s=>s.key.startsWith('paper-migration'))!;
 assert.deepEqual(receipt.value.legacy,before);assert.deepEqual(source,before);assert.equal(content.objects.filter(o=>o.kind==='ink').length,2);assert.equal(content.assets.length,3);
});
