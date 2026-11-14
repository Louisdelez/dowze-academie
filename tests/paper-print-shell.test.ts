import test from 'node:test';
import assert from 'node:assert/strict';
import {ownPaperPrintShell} from '../src/lib/paperPrintShell.ts';
const owner=(active=false)=>{const names=new Set(active?['paper-print-preview-active']:[]);return {document:{body:{classList:{contains:(name:string)=>names.has(name),add:(name:string)=>names.add(name),remove:(name:string)=>names.delete(name)}}} as unknown as Document,names};};
test('Preparation and preview independently protect the private shell until both release',()=>{
 const a=owner(),prepare=ownPaperPrintShell(a.document),preview=ownPaperPrintShell(a.document);
 assert.ok(a.names.has('paper-print-preview-active'));prepare();prepare();assert.ok(a.names.has('paper-print-preview-active'));preview();assert.equal(a.names.size,0);
});
test('Strict replay and a later preview lifetime do not let stale cleanup revoke the live shell',()=>{
 const a=owner(),first=ownPaperPrintShell(a.document);first();const next=ownPaperPrintShell(a.document);first();assert.ok(a.names.has('paper-print-preview-active'));next();assert.equal(a.names.size,0);
});
test('A preexisting shell guard and another document are preserved independently',()=>{
 const a=owner(true),b=owner(),releaseA=ownPaperPrintShell(a.document),releaseB=ownPaperPrintShell(b.document);releaseA();assert.ok(a.names.has('paper-print-preview-active'));assert.ok(b.names.has('paper-print-preview-active'));releaseB();assert.equal(b.names.size,0);assert.ok(a.names.has('paper-print-preview-active'));
});
