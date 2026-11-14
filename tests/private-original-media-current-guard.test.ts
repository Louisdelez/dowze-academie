/** Current-before-capture regression; inherited23 cases execute unchanged. */
import './private-original-media-reconciliation.test.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {ApiClient} from '../pwa/src/api.ts';
import {reconcilePrivateOriginalMedia} from '../pwa/src/privateOriginalMediaReconciliation.ts';
test('A retired original source cannot capture/rebind API authority or open any database',async()=>{
 let captures=0,binds=0,opens=0,sends=0,checks=0;
 const api=new ApiClient('https://fixture.invalid',async()=>{sends++;throw Error('Forbidden retired request');}),capture=api.captureSessionAuthority.bind(api),bind=api.bindAccount.bind(api);
 api.captureSessionAuthority=(actor:string)=>{captures++;return capture(actor);};api.bindAccount=(actor:string)=>{binds++;return bind(actor);};
 const old=Object.getOwnPropertyDescriptor(globalThis,'indexedDB');Object.defineProperty(globalThis,'indexedDB',{configurable:true,writable:true,value:{open(){opens++;throw Error('Forbidden retired database open');}}});
 try{await assert.rejects(reconcilePrivateOriginalMedia(api,{id:'original-local',accountId:'original-owner',spaceId:'year',documentId:'paper-v3-note-owned',blob:new Blob(['original'],{type:'audio/wav'}),name:'Original',createdAt:1,status:'pending'},()=>{checks++;return false;}),error=>error instanceof Error);
  assert.equal(checks,1);assert.equal(captures,0);assert.equal(binds,0);assert.equal(opens,0);assert.equal(sends,0);
 }finally{if(old)Object.defineProperty(globalThis,'indexedDB',old);else Reflect.deleteProperty(globalThis,'indexedDB');}
});
