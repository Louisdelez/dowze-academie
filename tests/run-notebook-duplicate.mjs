import {build} from 'vite';
import {indexedDB} from 'fake-indexeddb';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
const out=await mkdtemp(join(process.cwd(),'tests/.duplicate-'));
globalThis.indexedDB=indexedDB;
Object.defineProperty(globalThis,'navigator',{value:{onLine:false},configurable:true});
globalThis.dispatchEvent=()=>true;globalThis.CustomEvent=class {constructor(type,options){this.type=type;this.detail=options?.detail;}};
try{
 await build({configFile:false,ssr:{noExternal:['yjs','lib0','fflate']},build:{ssr:'tests/notebook-duplicate-entry.ts',outDir:out,rollupOptions:{output:{entryFileNames:'test.mjs'}}},logLevel:'error'});
 const m=await import(pathToFileURL(out+'/test.mjs'));
 const scope={accountId:'duplicate-fixture',spaceId:'year'},sourceId='source',targetId='copy';
 let doc=m.migratePaper(sourceId,'Un original conservé',null);const page=doc.pages[0].id,object=doc.objects[0].id;
 doc=m.applyPaperCommand(doc,{type:'batch',commands:[{type:'add-asset',asset:{id:'sound',name:'cours.wav',mediaType:'audio/wav',size:3}},{type:'add-audio',audio:{id:'recording',assetId:'sound',name:'Cours',duration:3,startedAt:1}},{type:'patch-object',id:object,patch:{groupId:'group',audioAnchor:{sessionId:'recording',time:1}}},{type:'study-card',card:{id:'card',kind:'basic',question:'Question',answer:'Réponse',source:{noteId:sourceId,pageId:page,objectId:object,quote:'original',revision:0},schedule:m.initialSchedule(),reviews:[],createdAt:new Date().toISOString()}}]});
 const draft={...scope,type:'whiteboard',documentId:m.notebookDocumentId(sourceId),title:'Original',content:doc,baseVersion:0,updatedAt:Date.now(),syncState:'synced'};await m.putDraft(draft);await m.putLocalBlob({...scope,id:'sound',name:'cours.wav',blob:new Blob(['abc']),createdAt:1,status:'uploaded',serverId:'remote-original'});
 let lib=m.updateNotebookLibrary(m.emptyNotebookLibrary(),{folder:{id:'folder',title:'Cours',parentId:null,color:'#4461dc',order:0}});lib=m.updateNotebookLibrary(lib,{note:{id:sourceId,patch:{folderId:'folder',favorite:true,cover:{color:'#fff4d8',pattern:'grid'}}}});await m.putDraft({...scope,type:'preferences',documentId:m.LIBRARY_DOCUMENT_ID,title:'Library',content:lib,baseVersion:1,updatedAt:Date.now(),syncState:'synced'});
 const copy=await m.stageNotebookDuplicate(sourceId,targetId,'ignored',scope);assert.ok(m.isPaperDocument(copy));assert.equal(copy.noteId,targetId);assert.notEqual(copy.objects[0].id,object);assert.notEqual(copy.objects[0].groupId,'group');assert.equal(copy.objects[0].markdown,'Un original conservé');assert.equal(copy.audio.length,1);assert.notEqual(copy.audio[0].assetId,'sound');assert.equal(copy.assets[0].serverId,undefined);assert.equal(copy.study.cards[0].source.noteId,targetId);assert.equal(copy.study.cards[0].source.objectId,copy.objects[0].id);assert.equal(copy.objects[0].audioAnchor.sessionId,copy.audio[0].id);
 await m.queueLocalDrafts(scope.accountId,scope.spaceId);assert.ok(!(await m.listMutations(scope.accountId,scope.spaceId)).some(d=>d.documentId===m.notebookDocumentId(targetId)),'staged copy must not upload before metadata exists');
 await m.activateNotebookDuplicate(targetId,scope);await m.queueLocalDrafts(scope.accountId,scope.spaceId);assert.ok((await m.listMutations(scope.accountId,scope.spaceId)).some(d=>d.documentId===m.notebookDocumentId(targetId)));const stored=await m.getDraft({...scope,type:'preferences',documentId:m.LIBRARY_DOCUMENT_ID});assert.deepEqual(stored.content.notes[targetId],stored.content.notes[sourceId]);assert.deepEqual((await m.getDraft(draft)).content,doc,'original unchanged');const blobs=await m.listLocalBlobs(scope.accountId,scope.spaceId);assert.equal(await blobs.find(b=>b.id===copy.assets[0].id).blob.text(),'abc');assert.equal(blobs.find(b=>b.id==='sound').serverId,'remote-original');assert.equal((await m.listLocalBlobs('other-owner',scope.spaceId)).length,0);
 console.log('Duplication: independent graph/media/study/groups; staged upload, folder/cover and untouched original: PASS');
}finally{await rm(out,{recursive:true,force:true});}
