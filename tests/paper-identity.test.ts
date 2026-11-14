import test from 'node:test';import assert from 'node:assert/strict';import {indexedDB} from 'fake-indexeddb';
import {ensureNotebookIdentity,normalizeNotebookIdentities,readOwnedLegacyNotebookBoard,paperIdentityReceiptKey} from '../src/lib/paperIdentity.ts';
import {notebookDocumentId,legacyNotebookDocumentId} from '../src/lib/notebookIdentity.ts';
import {migratePaper,applyPaperCommand} from '../src/lib/notebookDocument.ts';import {amendPaperCollaboration} from '../src/lib/paperCollaboration.ts';
import {getDraft,getSnapshot,listSnapshots,putDraft,applyChangePage,queueLocalDrafts,listMutations,type Draft} from '../pwa/src/storage.ts';import {noteBoardId} from '../src/lib/notebook.ts';
Object.defineProperty(globalThis,'indexedDB',{value:indexedDB,configurable:true});
const scope=(name:string)=>({accountId:`qa-identity-${name}`,spaceId:'year'}),draft=(name:string,noteId:string,markdown='Original'):Draft=>({...scope(name),type:'whiteboard',documentId:legacyNotebookDocumentId(noteId),title:'Original',content:migratePaper(noteId,markdown,null),baseVersion:7,updatedAt:1,syncState:'synced'});
test('Promotion creates the new owned key while another colliding owner remains distinct and every original is retained',async()=>{
 const note='é',literal=noteBoardId(note).slice(5),old=draft('unicode',note);await putDraft(old);const promoted=await ensureNotebookIdentity(note,scope('unicode'));
 assert.equal(promoted!.documentId,notebookDocumentId(note));assert.equal(promoted!.baseVersion,0);assert.deepEqual(promoted!.content,old.content);assert.equal((await getDraft(old))!.identityAlias,promoted!.documentId);
 assert.equal(await ensureNotebookIdentity(literal,scope('unicode')),undefined);const own={...draft('unicode',literal,'Literal owner'),documentId:notebookDocumentId(literal),baseVersion:0};await putDraft(own);
 assert.deepEqual((await ensureNotebookIdentity(literal,scope('unicode')))!.content,own.content);assert.deepEqual((await ensureNotebookIdentity(note,scope('unicode')))!.content,old.content);assert.notEqual(own.documentId,promoted!.documentId);
 const board={...old,documentId:noteBoardId(note),content:{board:{strokes:[{id:'s',points:[{x:1,y:2}]}]}}};await putDraft(board);assert.equal(await readOwnedLegacyNotebookBoard(literal,scope('unicode')),undefined);assert.deepEqual((await readOwnedLegacyNotebookBoard(note,scope('unicode')))!.content,board.content);
});
test('The long-key collision never borrows the other note text or legacy board',async()=>{
 const a='a'.repeat(105)+'X',b='a'.repeat(105)+'Y',old=draft('long',a,'Exact long owner');await putDraft(old);await putDraft({...old,documentId:noteBoardId(b),content:{photos:[{id:'not-b'}]}});
 await ensureNotebookIdentity(a,scope('long'));assert.equal(await ensureNotebookIdentity(b,scope('long')),undefined);assert.equal(await readOwnedLegacyNotebookBoard(b,scope('long')),undefined);assert.equal(((await getDraft({...old,documentId:notebookDocumentId(a)}))!.content as any).objects[0].markdown,'Exact long owner');
});
test('A preserved alias does not overwrite later canonical edits or create another receipt on reopening',async()=>{
 const note='学習',old=draft('idempotent',note);await putDraft(old);let canonical=(await ensureNotebookIdentity(note,scope('idempotent')))!;const before=await listSnapshots(old.accountId,old.spaceId);const doc=canonical.content as ReturnType<typeof migratePaper>;canonical={...canonical,content:applyPaperCommand(doc,{type:'patch-object',id:doc.objects[0].id,patch:{markdown:'New canonical work'}}),baseVersion:12,syncState:'synced'};await putDraft(canonical);
 const reopened=await ensureNotebookIdentity(note,scope('idempotent'));assert.deepEqual(reopened,await getDraft(canonical));assert.equal(reopened!.syncState,'synced');assert.deepEqual(await listSnapshots(old.accountId,old.spaceId),before);
});
test('An existing incompatible canonical version becomes a preserved resolvable conflict using its own server version',async()=>{
 const note='autre/clé',old=draft('conflict',note,'Legacy'),canonical={...old,documentId:notebookDocumentId(note),content:migratePaper(note,'Canonical',null),baseVersion:22};await putDraft(old);await putDraft(canonical);
 const result=(await ensureNotebookIdentity(note,scope('conflict')))!;assert.equal(result.baseVersion,22);assert.equal(result.syncState,'conflict');assert.deepEqual(result.content,canonical.content);
 const receipt=(await getSnapshot(paperIdentityReceiptKey(scope('conflict'),old.documentId)))!.value as any;assert.deepEqual(receipt.source.content,old.content);assert.deepEqual(receipt.target.content,canonical.content);assert.equal(receipt.canonical.documentId,result.documentId);assert.equal((result.conflict as any).identityReceipt,paperIdentityReceiptKey(scope('conflict'),old.documentId));
});
test('A later legacy same-lineage edit merges with newer canonical work without borrowing the legacy server counter',async()=>{
 const note='édition',old=draft('merge',note,'alpha'),seed=old.content as ReturnType<typeof migratePaper>;old.content=amendPaperCollaboration(seed,seed);await putDraft(old);let canonical=(await ensureNotebookIdentity(note,scope('merge')))!;
 const base=canonical.content as typeof seed;canonical={...canonical,baseVersion:30,syncState:'synced',content:amendPaperCollaboration(base,applyPaperCommand(base,{type:'patch-object',id:base.objects[0].id,patch:{markdown:'Local. alpha'}}))};await putDraft(canonical);
 const remote=amendPaperCollaboration(base,applyPaperCommand(base,{type:'patch-object',id:base.objects[0].id,patch:{markdown:'alpha Remote.'}}));await applyChangePage(old.accountId,old.spaceId,{items:[{space_id:old.spaceId,document_type:'whiteboard',document_id:old.documentId,version:8,changed_at:new Date().toISOString(),deleted:false,content:remote}],has_more:false,next_cursor:'received-8'});
 const merged=(await ensureNotebookIdentity(note,scope('merge')))!;assert.equal(merged.baseVersion,30);assert.equal(merged.syncState,'local');assert.equal((merged.content as typeof seed).objects[0].markdown,'Local. alpha Remote.');assert.equal((await getDraft(old))!.baseVersion,8);
});
test('A tombstone of the old key cannot erase or conflict a later edited canonical note',async()=>{
 const note='archive/été',old=draft('tombstone',note);await putDraft(old);let canonical=(await ensureNotebookIdentity(note,scope('tombstone')))!;const doc=canonical.content as ReturnType<typeof migratePaper>;canonical={...canonical,content:applyPaperCommand(doc,{type:'patch-object',id:doc.objects[0].id,patch:{markdown:'Continue work'}}),baseVersion:40,syncState:'synced'};await putDraft(canonical);
 await applyChangePage(old.accountId,old.spaceId,{items:[{space_id:old.spaceId,document_type:'whiteboard',document_id:old.documentId,version:9,changed_at:new Date().toISOString(),deleted:true,content:null}],has_more:false,next_cursor:'deleted-old'});await normalizeNotebookIdentities(scope('tombstone'));
 assert.deepEqual(await getDraft(canonical),await ensureNotebookIdentity(note,scope('tombstone')));assert.equal((await getDraft(canonical))!.syncState,'synced');assert.equal((await getDraft(canonical))!.baseVersion,40);assert.equal(((await getDraft(canonical))!.content as typeof doc).objects[0].markdown,'Continue work');
});
test('Ambiguous historical boards stay recoverable and are not assigned automatically to either metadata owner',async()=>{
 const note='é',literal=noteBoardId(note).slice(5),s=scope('board');const board:Draft={...s,type:'whiteboard',documentId:noteBoardId(note),title:'Drawing',content:{board:{strokes:[{id:'old',points:[{x:1,y:2}]}]}},baseVersion:1,updatedAt:1,syncState:'synced'};await putDraft(board);
 for(const id of [note,literal])await putDraft({...s,type:'notesMarkdown',documentId:id,title:'Metadata',content:{id,markdown:'Owned text'},baseVersion:1,updatedAt:1,syncState:'synced'});
 assert.equal(await readOwnedLegacyNotebookBoard(note,s),undefined);assert.equal(await readOwnedLegacyNotebookBoard(literal,s),undefined);assert.deepEqual((await getDraft(board))!.content,board.content);
});
test('Normalization publishes only canonical mutations and refuses a revoked note/account scope',async()=>{
 const note='a..b',old=draft('outbox',note);await putDraft({...old,syncState:'local'});await normalizeNotebookIdentities(scope('outbox'));await queueLocalDrafts(old.accountId,old.spaceId);const mutations=await listMutations(old.accountId,old.spaceId);assert.equal(mutations.length,1);assert.equal(mutations[0].documentId,notebookDocumentId(note));assert.equal(mutations[0].baseVersion,0);
 const other=draft('revoked','世界');await putDraft(other);await assert.rejects(()=>ensureNotebookIdentity('世界',scope('revoked'),()=>false),/changé/);assert.equal(await getDraft({...other,documentId:notebookDocumentId('世界')}),undefined);assert.deepEqual((await getDraft(other))!.content,other.content);
});
