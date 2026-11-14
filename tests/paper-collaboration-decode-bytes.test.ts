import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as Y from 'yjs';
import {migratePaper,applyPaperCommand,type PaperDocument} from '../src/lib/notebookDocument.ts';
import {amendPaperCollaboration,mergePaperCollaboration,verifyPaperCollaboration} from '../src/lib/paperCollaboration.ts';

const MAX_STATE=8*1024*1024;
const fingerprint=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const corpus=['ASCII before / after','e\u0301 / é / A\u030a / Å','📝 🧑🏽‍💻 𝄞 / 中文 / العربية','line one\r\nline two\n\tzero\u0000end','\ud800\udc00 / \udbff\udfff / \ufffd'];
function seed(id:string,text:string){const plain=migratePaper(id,text,null,'2026-10-16T00:00:00.000Z');return amendPaperCollaboration(plain,plain);}
function edit(value:PaperDocument,text:string){return applyPaperCommand(value,{type:'patch-object',id:value.objects[0].id,patch:{markdown:text}},'2026-10-16T00:00:01.000Z');}

test('Real Yjs histories retain exact Unicode and UTF-16 text through verify, amendment and concurrent merge',()=>{
 for(const [index,text] of corpus.entries()){
  const original=seed('decode-corpus-'+index,text),before=fingerprint(original),state=original.collaboration!.state;
  verifyPaperCollaboration(original);assert.equal(fingerprint(original),before,'Verification cannot rewrite any admitted source field');
  const bytes=Buffer.from(state,'base64');assert.equal(bytes.toString('base64'),state,'The source is the actual standard base64 representation');
  const doc=new Y.Doc();try{Y.applyUpdate(doc,bytes);const object=doc.getMap<Y.Map<unknown>>('objects').get(original.objects[0].id),fields=object?.get('fields');assert.ok(fields instanceof Y.Map);const markdown=fields.get('markdown');assert.ok(markdown instanceof Y.Text);assert.equal(markdown.toString(),text,'Independent real Yjs projection preserves the full UTF-16 string');}finally{doc.destroy();}
  const a=amendPaperCollaboration(original,edit(original,'LEFT '+text)),b=amendPaperCollaboration(original,edit(original,text+' RIGHT')),ab=mergePaperCollaboration(a,b),ba=mergePaperCollaboration(b,a);
  assert.ok(ab&&ba);verifyPaperCollaboration(ab);verifyPaperCollaboration(ba);assert.equal(ab.objects[0].markdown,'LEFT '+text+' RIGHT');assert.deepEqual(ab.objects,ba.objects);assert.equal(ab.collaboration!.state,ba.collaboration!.state);assert.deepEqual(ab.pages,original.pages);assert.deepEqual(ab.assets,original.assets);assert.deepEqual(ab.audio,original.audio);assert.equal(fingerprint(original),before);
 }
});

test('Malformed base64, invalid updates and unpaired UTF-16 cannot modify a real source or bypass full validation',()=>{
 const original=seed('decode-invalid','Exact original 📝'),before=fingerprint(original);
 for(const state of ['invalid','A===','====','AA=A','AA==AA==','AAA','AAAA\n','AAAA ','\ud800AAA','\udc00AAA','éAAA']){
  const value={...original,collaboration:{...original.collaboration!,state}},snapshot=fingerprint(value);assert.throws(()=>verifyPaperCollaboration(value),/Historique collaboratif invalide/);assert.equal(fingerprint(value),snapshot);
 }
 for(const state of ['AAAA','////',Buffer.from([255,255,255,255]).toString('base64')]){const value={...original,collaboration:{...original.collaboration!,state}},snapshot=fingerprint(value);assert.throws(()=>verifyPaperCollaboration(value));assert.equal(fingerprint(value),snapshot);}
 const other=seed('decode-other-note','Exact original 📝');assert.throws(()=>verifyPaperCollaboration({...original,collaboration:{...original.collaboration!,state:other.collaboration!.state}}),/autre note/);
 for(const text of ['isolated high \ud800 end','isolated low \udc00 end'])assert.throws(()=>verifyPaperCollaboration(amendPaperCollaboration(original,edit(original,text))),/correspond|résolution/,'Yjs replacement of invalid UTF-16 must still be rejected by full projection validation');
 assert.equal(fingerprint(original),before);
});

/** Actual Yjs binary content makes a valid update of an exact byte size. This
 * fixture does not intercept the decoder, its callback, atob or any result. */
function stateWithExactBytes(original:PaperDocument,target:number){
 const source=Buffer.from(original.collaboration!.state,'base64'),clients=new Set(Y.decodeUpdate(source).structs.map(struct=>struct.id.client));let clientID=0;while(clients.has(clientID))clientID++;
 let padding=Math.max(0,target-source.length-128);
 for(let attempt=0;attempt<4;attempt++){
  const doc=new Y.Doc();try{doc.clientID=clientID;Y.applyUpdate(doc,source);doc.getMap('decode-byte-boundary-fixture').set('opaque-padding',new Uint8Array(padding));const bytes=Y.encodeStateAsUpdate(doc);if(bytes.length===target)return Buffer.from(bytes).toString('base64');padding+=target-bytes.length;assert.ok(Number.isSafeInteger(padding)&&padding>=0&&padding<=target);}finally{doc.destroy();}
 }
 assert.fail('The real Yjs fixture must reach the declared byte boundary exactly');
}

test('The existing 8 MiB state boundary and encoded-length refusal are preserved without a new size allowance',()=>{
 const original=seed('decode-boundary','Boundary source e\u0301 📝'),before=fingerprint(original),state=stateWithExactBytes(original,MAX_STATE);assert.equal(Buffer.byteLength(state,'base64'),MAX_STATE);
 const value={...original,collaboration:{...original.collaboration!,state}},snapshot=fingerprint(value);verifyPaperCollaboration(value);assert.equal(fingerprint(value),snapshot,'A valid boundary history is read without normalization or rewriting');
 const firstRefusedMultipleOfFour=Math.floor((MAX_STATE*4/3+8)/4)*4+4,tooLong={...original,collaboration:{...original.collaboration!,state:'A'.repeat(firstRefusedMultipleOfFour)}};assert.equal(tooLong.collaboration.state.length%4,0);assert.throws(()=>verifyPaperCollaboration(tooLong),/Historique collaboratif invalide/);assert.equal(fingerprint(original),before);
});
