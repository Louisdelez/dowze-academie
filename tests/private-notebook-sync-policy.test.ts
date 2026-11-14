import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPrivateNotebookSyncPolicy,PrivateNotebookSyncPolicyError,PrivateNotebookBlockedError,PRIVATE_NOTEBOOK_SYNC_POLICY_MAX_ENTRIES,type PrivateNotebookSyncPolicyInput,type Scope,type SnapshotLike} from '../src/lib/privateNotebookSyncPolicy.ts';
import {noteMetadataTransportId} from '../src/lib/noteMetadataIdentity.ts';
import {notebookDocumentId,legacyNotebookDocumentId} from '../src/lib/notebookIdentity.ts';
import {noteBoardId} from '../src/lib/notebook.ts';

const scope={accountId:'actor-A',spaceId:'year-one'};
const resourceId='10000000-0000-4000-8000-000000000001',incarnation='20000000-0000-4000-8000-000000000002',deletionId='30000000-0000-4000-8000-000000000003',operationId='40000000-0000-4000-8000-000000000004';
const empty=():PrivateNotebookSyncPolicyInput=>({bindingKeys:[],resources:[],trash:[],deletionKeys:[],metadataAliases:[]});
const snapshot=(key:string,value:unknown,owner:Scope=scope):SnapshotLike=>({key,...owner,value});
function managed(noteId='note-A',owner:Scope=scope):PrivateNotebookSyncPolicyInput {
 const bindingKey='managed-notebook-binding|'+JSON.stringify([owner.accountId,owner.spaceId,noteId]);
 return {...empty(),bindingKeys:[bindingKey],resources:[snapshot('managed-notebook-resource|'+JSON.stringify(['https://private.example',owner.accountId,resourceId]),{bindingKey,identity:{...owner,noteId,canonicalDocumentId:notebookDocumentId(noteId),metadataDocumentId:noteId,lineage:'lineage-A'},resourceId,incarnation},owner)]};
}
function trash(noteId='note-A',state:'trashed'|'restored'='trashed',server?:unknown):SnapshotLike {
 return snapshot('notebook-trash-head|'+JSON.stringify([scope.accountId,scope.spaceId,noteId]),{schema:1,kind:'notebook-trash-head',...scope,noteId,state,deletionId,latestOperationId:operationId,...(server===undefined?{}:{server})});
}
const deletion=(id:string,owner:Scope=scope)=>`paper-canonical-deletion|${owner.accountId}|${owner.spaceId}|whiteboard|${id}`;
function alias(logicalId:string):SnapshotLike {
 const documentId=noteMetadataTransportId(logicalId);return snapshot(`paper-metadata-transport|${scope.accountId}|${scope.spaceId}|${documentId}`,{schema:1,kind:'paper-metadata-transport',...scope,logicalId,documentId,graphId:notebookDocumentId(logicalId)});
}
const rejected=(input:PrivateNotebookSyncPolicyInput,owner:Scope=scope)=>assert.throws(()=>buildPrivateNotebookSyncPolicy(owner,input),PrivateNotebookSyncPolicyError);

test('An empty ordinary scope keeps private documents and unassigned legacy uploads available',()=>{
 const p=buildPrivateNotebookSyncPolicy(scope,empty());assert.equal(Object.isFrozen(p),true);assert.equal(p.hasBlockedNotebooks,false);
 for(const type of ['whiteboard','notesMarkdown','preferences'])assert.equal(p.blockDocument(type,'ordinary-note'),false);
 assert.equal(p.blockBlob(),false);assert.equal(p.blockBlob('ordinary-note'),false);assert.equal(p.blockBlob(''),false);
 const error=new PrivateNotebookBlockedError();assert.equal(error.code,'private-notebook-blocked');assert.equal(error.name,'PrivateNotebookBlockedError');
});

test('A resource index blocks the admitting binding before any receipt or phase is read',()=>{
 const input=managed(),before=structuredClone(input),p=buildPrivateNotebookSyncPolicy(scope,input);
 assert.equal(p.hasBlockedNotebooks,true);assert.equal(p.blockDocument('whiteboard',notebookDocumentId('note-A')),true);assert.equal(p.blockDocument('whiteboard',resourceId),true);
 assert.equal(p.blockDocument('notesMarkdown','note-A'),true);assert.equal(p.blockBlob(),true);assert.equal(p.blockBlob('note-A'),true);
 assert.equal(p.blockDocument('preferences','note-A'),false);assert.equal(p.blockBlob('independent-note'),false);assert.deepEqual(input,before);
});

test('Managed exact legacy graph identity and both logical and wire metadata identities stay fenced',()=>{
 const logicalId='École / repeated 📝',input=managed(logicalId),source=input.resources[0],value=source.value as any;value.identity.canonicalDocumentId='historical-canonical';value.identity.metadataDocumentId='historical-metadata';
 const p=buildPrivateNotebookSyncPolicy(scope,input);assert.equal(p.blockDocument('whiteboard','historical-canonical'),true);assert.equal(p.blockDocument('notesMarkdown','historical-metadata'),true);
 assert.equal(p.blockDocument('notesMarkdown',logicalId),true);assert.equal(p.blockDocument('notesMarkdown',noteMetadataTransportId(logicalId)),true);
 for(const id of [notebookDocumentId(logicalId),legacyNotebookDocumentId(logicalId),noteBoardId(logicalId),`paper-v3-${logicalId}`,logicalId]){assert.equal(p.blockBlob(id),true,id);assert.equal(p.blockDocument('whiteboard',id),true,id);}
});

test('Raw canonical and metadata envelopes cannot hide a blocked logical identity behind another wire id',()=>{
 const p=buildPrivateNotebookSyncPolicy(scope,managed('École / A'));
 assert.equal(p.blockDocument('whiteboard','unrelated-wire',{notebookEnvelope:3,noteId:'École / A'}),true);
 for(const content of [{id:'École / A'},{logicalId:'École / A'},{graphId:notebookDocumentId('École / A')},{documentId:noteMetadataTransportId('École / A')},{note:{id:'École / A'}}])assert.equal(p.blockDocument('notesMarkdown','unrelated-wire',content),true);
 assert.equal(p.blockDocument('notesMarkdown','ordinary',{id:'ordinary'}),false);assert.equal(p.blockDocument('preferences','ordinary',{id:'École / A'}),false);
});

test('Missing, duplicate or orphan resource indexes and non-exact JSON keys fail closed',()=>{
 const good=managed();rejected({...good,resources:[]});rejected({...good,bindingKeys:[]});rejected({...good,resources:[good.resources[0],good.resources[0]]});rejected({...good,bindingKeys:[...good.bindingKeys,...good.bindingKeys]});
 const whitespace={...good,bindingKeys:[good.bindingKeys[0].replace('[','[ ')]};rejected(whitespace);
 const mismatch=structuredClone(good);(mismatch.resources[0].value as any).identity.noteId='other-note';rejected(mismatch);
});

test('Every supplied outer or inner foreign scope is refused rather than ignored by the pure builder',()=>{
 const foreign={accountId:scope.accountId,spaceId:'year-two'};rejected(managed('note-A',foreign));
 const outer=structuredClone(managed());(outer.resources[0] as any).accountId='actor-B';rejected(outer);
 const inner=structuredClone(managed());(inner.resources[0].value as any).identity.accountId='actor-B';rejected(inner);
 rejected({...empty(),trash:[{...trash(),spaceId:'year-two'}]});rejected({...empty(),deletionKeys:[deletion(notebookDocumentId('note-A'),foreign)]});
 const encoded={accountId:'actor|A',spaceId:'year/α'};assert.equal(buildPrivateNotebookSyncPolicy(encoded,managed('note-A',encoded)).blockDocument('notesMarkdown','note-A'),true);
});

test('Trashed and server-pending restores block, while an explicit local-only restore can resume',()=>{
 const trashed=buildPrivateNotebookSyncPolicy(scope,{...empty(),trash:[trash()]});assert.equal(trashed.blockDocument('notesMarkdown','note-A'),true);
 const restored=()=>buildPrivateNotebookSyncPolicy(scope,{...empty(),trash:[trash('note-A','restored')]});assert.equal(restored().hasBlockedNotebooks,false);
 for(const server of [{state:'trashed',deletionId,operationId},{state:'expired',deletionId,operationId},{state:'restored',deletionId:resourceId,operationId},{state:'restored',deletionId,operationId:resourceId}])assert.equal(buildPrivateNotebookSyncPolicy(scope,{...empty(),trash:[trash('note-A','restored',server)]}).blockBlob(),true);
 assert.equal(buildPrivateNotebookSyncPolicy(scope,{...empty(),trash:[trash('note-A','restored',{state:'restored',deletionId,operationId})]}).hasBlockedNotebooks,false);
 assert.equal(buildPrivateNotebookSyncPolicy(scope,{...managed(),trash:[trash('note-A','restored')]}).blockDocument('notesMarkdown','note-A'),true);
});

test('Canonical deletion presence alone blocks hashed note and exact stored metadata aliases',()=>{
 const noteId='École / deleted',id=notebookDocumentId(noteId),input={...empty(),deletionKeys:[deletion(id)],metadataAliases:[alias(noteId),alias('ordinary')]},p=buildPrivateNotebookSyncPolicy(scope,input);
 assert.equal(p.blockDocument('whiteboard',id),true);assert.equal(p.blockDocument('notesMarkdown',noteId),true);assert.equal(p.blockDocument('notesMarkdown',noteMetadataTransportId(noteId)),true);
 assert.equal(p.blockBlob(noteBoardId(noteId)),true);assert.equal(p.blockDocument('notesMarkdown',noteMetadataTransportId('ordinary')),false);assert.equal(p.blockBlob(),true);
 assert.equal(buildPrivateNotebookSyncPolicy(scope,{...empty(),deletionKeys:[deletion(id)]}).blockDocument('notesMarkdown',noteId),true);
});

test('Proof rows, malformed aliases and bodies in projected headers are rejected without traversal',()=>{
 const a=alias('École / A');rejected({...empty(),metadataAliases:[{...a,key:a.key+'|proof-any'}]});
 const bad=structuredClone(a);(bad.value as any).graphId=notebookDocumentId('other');rejected({...empty(),metadataAliases:[bad]});
 const body=managed();(body.resources[0].value as any).original={canonical:{content:{huge:'must not be consumed'}}};rejected(body);
 const badTrash=trash();(badTrash.value as any).source={body:'must not be consumed'};rejected({...empty(),trash:[badTrash]});
 const boxed=trash();(boxed.value as any).state=new String('restored');rejected({...empty(),trash:[boxed]});
 rejected({...empty(),deletionKeys:[deletion('not-a-canonical-id')]});
});

test('The explicit total cardinality boundary is accepted exactly and overflow refuses before use',()=>{
 const deletionKeys=Array.from({length:PRIVATE_NOTEBOOK_SYNC_POLICY_MAX_ENTRIES},(_,i)=>deletion(notebookDocumentId('N'+i)));
 const p=buildPrivateNotebookSyncPolicy(scope,{...empty(),deletionKeys});assert.equal(p.blockDocument('whiteboard',notebookDocumentId('N9999')),true);
 rejected({...empty(),deletionKeys:[...deletionKeys,deletion(notebookDocumentId('overflow'))]});
});

test('Returned decisions are immutable snapshots and transport formula keeps short and distinct UTF16 identities',()=>{
 const input=managed(),p=buildPrivateNotebookSyncPolicy(scope,input);(input.bindingKeys as string[]).length=0;(input.resources as SnapshotLike[]).length=0;
 assert.equal(p.blockDocument('notesMarkdown','note-A'),true);assert.equal(p.blockDocument('notesMarkdown','fresh-note'),false);
 assert.equal(noteMetadataTransportId('ordinary-note'),'ordinary-note');assert.match(noteMetadataTransportId('École / A'),/^note-meta-id2-[a-f0-9]{64}$/);
 assert.notEqual(noteMetadataTransportId('\ud800'),noteMetadataTransportId('\ud801'));assert.throws(()=>noteMetadataTransportId(''));assert.throws(()=>noteMetadataTransportId('x'.repeat(201)));
});
