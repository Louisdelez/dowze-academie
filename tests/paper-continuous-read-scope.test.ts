import test from 'node:test';
import assert from 'node:assert/strict';
import {createPaperContinuousReadScope,type PaperContinuousReadSnapshot} from '../src/lib/paperContinuousReadScope.ts';
import type {PaperDocument} from '../src/lib/notebookDocument.ts';

const document=(id:string):PaperDocument=>({notebookSchema:3,noteId:id,revision:1,updatedAt:'2026-10-14T00:00:00Z',pages:[{id:'page',width:800,height:1000,pattern:'plain',color:'#ffffff',bookmark:false,rotation:0}],objects:[],assets:[{id:'asset',name:'Synthetic asset',mediaType:'image/png',size:3,serverId:'server'}],audio:[],legacy:{markdown:'',boardId:'board',migratedAt:'2026-10-14T00:00:00Z'}});
const fixture=()=>{const source=document('a');let latest:PaperContinuousReadSnapshot={ownerKey:'owner',document:source,media:{accountId:'account',spaceId:'year'},current:()=>true};const initial=latest,scope=createPaperContinuousReadScope(initial,()=>latest);return {source,initial,scope,set:(value:PaperContinuousReadSnapshot)=>latest=value};};

test('Reader guards are stable per page and do not change source metadata',()=>{
 const f=fixture(),before=structuredClone(f.source),current=f.scope.pageCurrent('page');
 assert.equal(current,f.scope.pageCurrent('page'));assert.equal(current(),true);assert.equal(f.scope.current(),true);assert.deepEqual(f.source,before);assert.equal(f.scope.pageCurrent('missing')(),false);
});
test('Document source A-B-A never revives the old page reader',()=>{
 const f=fixture(),old=f.scope.pageCurrent('page');f.set({...f.initial,document:document('b')});assert.equal(old(),false);f.set(f.initial);assert.equal(f.scope.current(),false);assert.equal(old(),false);
});
test('Account/year/API changes revoke old callbacks even if the source later returns',()=>{
 for(const replacement of [{accountId:'other',spaceId:'year'},{accountId:'account',spaceId:'other-year'},{accountId:'account',spaceId:'year',api:{} as NonNullable<PaperContinuousReadSnapshot['media']['api']>}]){
  const f=fixture(),old=f.scope.pageCurrent('page');f.set({...f.initial,media:replacement});assert.equal(old(),false);f.set(f.initial);assert.equal(old(),false);
 }
});
test('Observed permission loss, exceptions and explicit unmount revocation are permanent',()=>{
 for(const current of [()=>false,()=>{throw Error('Authority unavailable');}]){const f=fixture(),old=f.scope.pageCurrent('page');f.set({...f.initial,current});assert.equal(old(),false);f.set(f.initial);assert.equal(old(),false);}
 const f=fixture(),old=f.scope.pageCurrent('page');f.scope.revoke();assert.equal(old(),false);assert.equal(f.scope.current(),false);
});
test('In-place page geometry or asset mutation cannot publish old private pixels after restoration',()=>{
 const f=fixture(),old=f.scope.pageCurrent('page');f.source.pages[0].rotation=90;assert.equal(old(),false);f.source.pages[0].rotation=0;assert.equal(old(),false);
 const g=fixture(),assetReader=g.scope.pageCurrent('page');g.source.assets[0].serverId='different';assert.equal(assetReader(),false);g.source.assets[0].serverId='server';assert.equal(assetReader(),false);assert.equal(g.scope.current(),false);
});
test('A replaced source receives a fresh scope while callbacks retained from a revoked scope stay inert',()=>{
 const f=fixture(),old=f.scope.pageCurrent('page');f.scope.revoke();const fresh=createPaperContinuousReadScope(f.initial,()=>f.initial);assert.equal(fresh.pageCurrent('page')(),true);assert.equal(old(),false);
});
