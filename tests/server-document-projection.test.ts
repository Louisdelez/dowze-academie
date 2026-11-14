/** SOURCE ONLY / NOT RUN by author. Direct Node22 --experimental-strip-types.
 * The oracle is the existing public canonical(), never a copied serializer. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {canonical,type SyncDocument} from '../src/lib/serverSync.ts';
import {projectServerDocumentGroup,joinServerDocumentGroups,serverDocumentsChangeSignature} from '../src/lib/serverDocumentProjection.ts';

const doc=(type:SyncDocument['type'],id:string,content:Record<string,unknown>):SyncDocument=>({type,id,content});
const freeze=(value:unknown):void=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const item of Object.values(value))freeze(item);}};
const assertSame=(actual:unknown,expected:unknown,message:string)=>assert.equal(canonical(actual),canonical(expected),message);

test('Nine ordered groups preserve every document, duplicate key, empty group and exact canonical bytes',()=>{
  const duplicate=doc('formation','same',{z:1,a:'first'}),second=doc('formation','same',{a:'second',z:2});
  const groups:SyncDocument[][]=[
    [duplicate,doc('whiteboard','board',{pages:[{id:'page',width:600}],objects:[]})],
    [doc('preferences','slime-progress',{schema:1,events:[{id:'xp',at:0}]})],
    [],
    [doc('tasks','task',{id:'task',completed:false})],
    [doc('conversations','web-1',{kind:'web',conversation:{id:'1'}}),doc('conversations','chat-1',{kind:'chat',conversation:{id:'1'}})],
    [doc('notesMarkdown','note',{id:'note',title:'Titre',markdown:''})],
    [doc('planning','plan',{id:'plan',start:'2026-10-16'})],
    [doc('progression','subject',{modules:[{items:[{completed:true}]}]}),second],
    [doc('examens','exam',{id:'exam',score:17})]
  ];
  freeze(groups);const before=canonical(groups),expected=groups.flatMap(group=>group),prepared=groups.map(projectServerDocumentGroup),actual=joinServerDocumentGroups(prepared);
  assert.equal(actual.signature,canonical(expected));assertSame(actual.documents,expected,'Projection content/order must be exact');
  assert.deepEqual(actual.documents.map(item=>[item.type,item.id]),expected.map(item=>[item.type,item.id]));
  assert.equal(actual.documents.filter(item=>item.type==='formation'&&item.id==='same').length,2);
  assert.equal(actual.documents[0],duplicate);assert.equal(actual.documents.at(-2),second);assert.equal(canonical(groups),before);
});

test('Empty and sparse array boundaries, numeric keys and unusual canonical leaves remain byte exact',()=>{
  const sparse=new Array<SyncDocument>(3);sparse[1]=doc('notesMarkdown','unicode',{z:'é\ud800😀',a:undefined,numberKeys:{'10':'dix','2':'deux'},numbers:[-0,NaN,Infinity,-Infinity],empty:[]});
  const sources=[[],sparse,[],[doc('preferences','edge',{constructor:'own',nested:{b:null,a:false}})],[]];
  for(const grouping of [[],[[]],sources,sources.slice().reverse()]){
    const expected:SyncDocument[]=[];for(const group of grouping)for(const item of group)expected.push(item);
    const actual=joinServerDocumentGroups(grouping.map(projectServerDocumentGroup));
    assert.equal(actual.signature,canonical(expected));assert.deepEqual(actual.documents,expected);
  }
});

test('A title-only sibling projection does not reread any unchanged heavy group; full canonical demonstrably does',()=>{
  let reads=0;const program:Record<string,unknown>={};
  for(let i=0;i<32;i++)Object.defineProperty(program,'chapter-'+i,{enumerable:true,get(){reads++;return {items:Array.from({length:8},(_,j)=>({id:j,title:'Conserved lesson '+i,completed:false}))};}});
  const stable=Array.from({length:8},(_,i)=>projectServerDocumentGroup([doc(i===0?'formation':'progression','stable-'+i,{program})]));
  const note=(title:string)=>projectServerDocumentGroup([doc('notesMarkdown','note',{id:'note',title,markdown:''})]);
  const first=joinServerDocumentGroups([...stable.slice(0,5),note('Before'),...stable.slice(5)]);
  reads=0;const oldSignature=canonical(first.documents);assert.equal(oldSignature,first.signature);assert.equal(reads,8*32,'The old full-array dependency really traverses every stable program');
  for(let i=1;i<=17;i++){
    reads=0;const updated=joinServerDocumentGroups([...stable.slice(0,5),note('After '+i),...stable.slice(5)]);
    assert.equal(serverDocumentsChangeSignature(updated.documents,updated.signature),updated.signature);
    assert.equal(reads,0,'Joining and consuming the prepared signature cannot reread stable content');
    const exact=canonical(updated.documents);assert.equal(updated.signature,exact);assert.equal(reads,8*32,'The independent whole-array oracle still visits the original content');
  }
});

test('Default hook-signature fallback stays eager on in-place changes and propagates canonical failures',()=>{
  const content={title:'Before'},documents=[doc('notesMarkdown','same-array',content)];
  assert.equal(serverDocumentsChangeSignature(documents),canonical(documents));
  const before=serverDocumentsChangeSignature(documents);content.title='After';
  assert.notEqual(serverDocumentsChangeSignature(documents),before);assert.equal(serverDocumentsChangeSignature(documents),canonical(documents));
  const failure=new Error('Exact canonical getter failure'),bad:Record<string,unknown>={};Object.defineProperty(bad,'value',{enumerable:true,get(){throw failure;}});
  assert.throws(()=>projectServerDocumentGroup([doc('preferences','bad',bad)]),error=>error===failure);
  assert.throws(()=>serverDocumentsChangeSignature([doc('preferences','bad',bad)]),error=>error===failure);
});

test('A changed formation or progression group changes only its prepared data and exactly the old dependency',()=>{
  const shared=doc('formation','package',{schema:1,manifest:{id:'package',name:'Shared original'},subjectIds:['b','a','b']});
  const first=projectServerDocumentGroup([shared]),notes=projectServerDocumentGroup([doc('notesMarkdown','note',{title:'Unchanged'})]),remaining=projectServerDocumentGroup([]);
  const before=joinServerDocumentGroups([first,notes,remaining]),changed=projectServerDocumentGroup([{...shared,content:{...shared.content,manifest:{id:'package',name:'Changed remotely'}}}]);
  const after=joinServerDocumentGroups([changed,notes,remaining]);
  assert.notEqual(after.signature,before.signature);assert.equal(after.signature,canonical(after.documents));
  assert.equal(after.documents[1],before.documents[1]);assert.deepEqual(shared.content.subjectIds,['b','a','b']);
  assert.equal(first.signature,canonical([shared]));assert.equal(remaining.signature,'[]');
});
