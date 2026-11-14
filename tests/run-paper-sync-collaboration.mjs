import {build} from 'vite';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {indexedDB} from 'fake-indexeddb';
import assert from 'node:assert/strict';
const out=await mkdtemp(join(process.cwd(),'tests/.collab-'));globalThis.indexedDB=indexedDB;Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
try{
 await build({configFile:false,ssr:{noExternal:true},build:{ssr:'tests/paper-sync-collaboration-entry.ts',outDir:out,rollupOptions:{output:{entryFileNames:'sync.mjs'}}},logLevel:'error'});
 const {flushMutations,ApiError,putDraft,queueMutation,ownsPaperDocument,savePaperDraft,queueLocalDrafts,getDraft,listMutations,listSnapshots,amendPaperCollaboration,migratePaper,applyPaperCommand,notebookDocumentId,emptyNotebookLibrary,updateNotebookLibrary,LIBRARY_DOCUMENT_ID,amendNotebookLibrary}=await import(pathToFileURL(out+'/sync.mjs'));
 const plain=migratePaper('automatic','Milieu.',null),seed=amendPaperCollaboration(plain,plain),a=amendPaperCollaboration(seed,applyPaperCommand(seed,{type:'patch-object',id:seed.objects[0].id,patch:{markdown:'Ajout A. Milieu.'}})),b=amendPaperCollaboration(seed,applyPaperCommand(seed,{type:'patch-object',id:seed.objects[0].id,patch:{markdown:'Milieu. Ajout B.'}}));
 const draft={accountId:'automatic-qa',spaceId:'year',documentId:notebookDocumentId(seed.noteId),type:'whiteboard',title:'QA',content:a,baseVersion:1,updatedAt:Date.now(),syncState:'local'};await savePaperDraft(draft,null);await queueLocalDrafts(draft.accountId,draft.spaceId);
 let first=true,received;
 const api={bindAccount:id=>assert.equal(id,draft.accountId),changes:async()=>({items:[{space_id:'year',document_type:'whiteboard',document_id:draft.documentId,version:2,content:b,deleted:false,changed_at:new Date().toISOString()}],has_more:false,next_cursor:'2'}),putDocument:async(space,type,id,version,content)=>{assert.equal(space,'year');assert.equal(id,draft.documentId);if(first){first=false;throw new ApiError(409,'stale','version_conflict',2);}assert.equal(version,2);received=content;return{version:3};}};
 await flushMutations(api,draft.accountId,draft.spaceId,()=>true);const resolved=await getDraft(draft);assert.equal(resolved.syncState,'local');assert.equal(resolved.baseVersion,2);assert.equal(resolved.content.objects[0].markdown,'Ajout A. Milieu. Ajout B.');assert.equal((await listMutations(draft.accountId,draft.spaceId)).length,0);assert.ok((await listSnapshots(draft.accountId,draft.spaceId)).some(s=>s.key.startsWith('paper-resolution')));
 await queueLocalDrafts(draft.accountId,draft.spaceId);await flushMutations(api,draft.accountId,draft.spaceId,()=>true);assert.equal((await getDraft(draft)).syncState,'synced');assert.equal(received.objects[0].markdown,'Ajout A. Milieu. Ajout B.');console.log('Synchronisation collaborative : HTTP409, fusion automatique, originaux conservés, reprise et confirmation : PASS');
 const libScope={accountId:'library-sync-qa',spaceId:'year'},empty=emptyNotebookLibrary(),favorite=amendNotebookLibrary(empty,updateNotebookLibrary(empty,{note:{id:'a',patch:{favorite:true}}}),'library-sync-qa|year');let folder=updateNotebookLibrary(empty,{folder:{id:'f',parentId:null,title:'Cours',color:'#4461dc',order:0}});folder=amendNotebookLibrary(empty,updateNotebookLibrary(folder,{note:{id:'a',patch:{folderId:'f',cover:{color:'#fff4d8',pattern:'grid'}}}}),'library-sync-qa|year');
 const libDraft={...libScope,type:'preferences',documentId:LIBRARY_DOCUMENT_ID,title:'Library',content:favorite,baseVersion:1,updatedAt:Date.now(),syncState:'local'};await savePaperDraft(libDraft,null);await queueLocalDrafts(libScope.accountId,libScope.spaceId);let stale=true;
 const libApi={bindAccount:id=>assert.equal(id,libScope.accountId),changes:async()=>({items:[{space_id:'year',document_type:'preferences',document_id:LIBRARY_DOCUMENT_ID,version:2,content:folder,deleted:false,changed_at:new Date().toISOString()}],has_more:false,next_cursor:'2'}),putDocument:async(space,type,id,version,content)=>{assert.equal(id,LIBRARY_DOCUMENT_ID);if(stale){stale=false;throw new ApiError(409,'stale','version_conflict',2);}assert.equal(version,2);assert.equal(content.notes.a.favorite,true);assert.equal(content.notes.a.folderId,'f');assert.equal(content.notes.a.cover.pattern,'grid');return{version:3};}};
 await flushMutations(libApi,libScope.accountId,libScope.spaceId,()=>true);const libResult=await getDraft(libDraft);assert.equal(libResult.content.notes.a.favorite,true);assert.equal(libResult.content.notes.a.folderId,'f');assert.equal(libResult.syncState,'local');await queueLocalDrafts(libScope.accountId,libScope.spaceId);await flushMutations(libApi,libScope.accountId,libScope.spaceId,()=>true);assert.equal((await getDraft(libDraft)).syncState,'synced');console.log('Bibliothèque HTTP409: favoris, dossier et couverture convergent sans écraser les autres champs: PASS');

 const managed={accountId:'native-owned-sync-qa',spaceId:'year'};
 const provenance={...managed,type:'whiteboard',documentId:'note-old',content:{board:{strokes:[]}},title:'Provenance',baseVersion:5,updatedAt:1,syncState:'local'};
 const metadata={...provenance,type:'notesMarkdown',documentId:'note-old',content:{title:'Native metadata'}};
 const ownedPlain=migratePaper('owned','Seul le carnet est envoyé',null),owned={...provenance,documentId:notebookDocumentId('owned'),content:amendPaperCollaboration(ownedPlain,ownedPlain)};
 for(const row of [provenance,metadata,owned])await putDraft(row);
 await queueMutation({...provenance,id:'legacy-pending',createdAt:1,status:'pending'});
 await queueLocalDrafts(managed.accountId,managed.spaceId,ownsPaperDocument);
 const sent=[];const ownedApi={bindAccount:()=>{},syncDocumentFilter:ownsPaperDocument,putDocument:async(space,type,id)=>{sent.push([type,id]);return {version:6};}};
 await flushMutations(ownedApi,managed.accountId,managed.spaceId,()=>true);
 assert.deepEqual(sent,[['whiteboard',owned.documentId]]);assert.equal((await getDraft(provenance)).syncState,'local');assert.equal((await getDraft(metadata)).syncState,'local');assert.equal((await listMutations(managed.accountId,managed.spaceId)).find(m=>m.id==='legacy-pending').status,'pending');assert.equal((await getDraft(owned)).syncState,'synced');
 console.log('Native uploader ownership: v3 only; metadata/legacy draft/outbox retained without duplicate upload: PASS');

}finally{await rm(out,{recursive:true,force:true});}
