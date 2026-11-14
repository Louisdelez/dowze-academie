import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {migratePaper,type PaperDocument} from '../src/lib/notebookDocument.ts';
import {paperPdfSize} from '../src/lib/paperPdfExport.ts';
import {createPaperPrintLease,createPaperPrintPreview,paperPrintFilename,preparePaperPrint,type PaperPrintScope,type PreparedPaperPrint} from '../src/lib/paperPrint.ts';
import type {NotebookMediaScope} from '../src/components/NotebookEditor';

const documentFixture=()=>{const doc=migratePaper('qa-print-note','',null,'2026-10-14T09:00:00Z');doc.objects=[];doc.pages.push({...doc.pages[0],id:'qa-print-landscape',width:1123,height:794});return doc;};
const scopeFixture=()=>{let document=documentFixture(),allowed=true;const scope:PaperPrintScope={noteId:document.noteId,ownerKey:'qa-print-account/year/note',generation:1,media:{accountId:'qa-print-account',spaceId:'year'},current:()=>allowed,getCurrent:()=>document,title:'Carnet de contrôle'};return {scope,get document(){return document;},set document(value:PaperDocument){document=value;},set allowed(value:boolean){allowed=value;}};};
/** Genuine blank PDF fixtures isolate leases/preview ownership. These tests do
 * not claim to validate the shared rich renderer or physical printing. */
const pdfFixture=async(source:PaperDocument)=>{const pdf=await PDFDocument.create();for(const page of source.pages){const size=paperPdfSize(page);pdf.addPage([size.width,size.height]);}const bytes=await pdf.save();return new Blob([bytes as Uint8Array<ArrayBuffer>],{type:'application/pdf'});};
const preparation=async(f:ReturnType<typeof scopeFixture>)=>preparePaperPrint(f.scope,{}, {renderPdf:async(source,_media,progress,current)=>{assert.ok(current());const blob=await pdfFixture(source);progress(source.pages.length,source.pages.length);return blob;}});
const frameFixture=(url:string)=>{
 let source=url,calls=0;const target={location:{href:url},print:()=>{calls++;}},frame={isConnected:true,style:{opacity:'1'},getAttribute:(name:string)=>name==='src'?source:null,removeAttribute:(name:string)=>{if(name==='src')source='';},get src(){return source;},set src(value:string){source=value;},contentWindow:target} as unknown as HTMLIFrameElement;
 return {frame,target,get calls(){return calls;}};
};
let urlSequence=0;
const previewFixture=(prepared:PreparedPaperPrint,current:()=>boolean=()=>true)=>{const revoked:string[]=[],created:Blob[]=[];const preview=createPaperPrintPreview(prepared,current,{create:blob=>{created.push(blob);return `blob:qa-print-${++urlSequence}`;},revoke:url=>revoked.push(url)});return {preview,created,revoked};};

test('Preparation waits for the actual barrier and captures a fresh full source without changing its graph',async()=>{
 const f=scopeFixture(),original=f.document;let passed:PaperDocument|undefined,guard:(()=>boolean)|undefined;
 const prepared=await preparePaperPrint(f.scope,{beforePrepare:()=>{f.document={...original,revision:original.revision+1,updatedAt:'2026-10-14T10:00:00Z'};}},{renderPdf:async(source,media,progress,current)=>{passed=source;guard=current;assert.equal(media.accountId,f.scope.media.accountId);assert.ok(current());const blob=await pdfFixture(source);progress(source.pages.length,source.pages.length);return blob;}});
 assert.ok(passed);assert.ok(passed!==f.document,'The renderer must receive a clone');assert.deepEqual(passed,f.document);assert.equal(prepared.source,f.document);assert.equal(original.revision,0);assert.equal(prepared.pageCount,2);assert.ok(guard?.());
 const pdf=await PDFDocument.load(await prepared.blob.arrayBuffer());assert.equal(pdf.getPageCount(),2);assert.deepEqual(pdf.getPage(0).getSize(),paperPdfSize(f.document.pages[0]));assert.deepEqual(pdf.getPage(1).getSize(),paperPdfSize(f.document.pages[1]));assert.equal(prepared.filename,'Carnet de contrôle.pdf');
});

test('Preparation refuses a scope switch during its barrier before invoking a renderer',async()=>{
 const f=scopeFixture();let release!:()=>void,started!:()=>void,calls=0;const gate=new Promise<void>(resolve=>release=resolve),began=new Promise<void>(resolve=>started=resolve);
 const work=preparePaperPrint(f.scope,{beforePrepare:async()=>{started();await gate;}},{renderPdf:async()=>{calls++;return pdfFixture(f.document);}});void work.catch(()=>{});await began;f.scope.media.accountId='qa-print-other';release();await assert.rejects(work,/carnet|compte/);assert.equal(calls,0);
});

test('A source change during a pending renderer rejects its late genuine PDF and old guard permanently',async()=>{
 const f=scopeFixture(),blob=await pdfFixture(f.document);let release!:(value:Blob)=>void,started!:()=>void,guard:(()=>boolean)|undefined;const gate=new Promise<Blob>(resolve=>release=resolve),began=new Promise<void>(resolve=>started=resolve);
 const work=preparePaperPrint(f.scope,{}, {renderPdf:async(_source,_media,progress,current)=>{guard=current;started();const value=await gate;progress(2,2);return value;}});void work.catch(()=>{});await began;const first=f.document;f.document={...first,revision:first.revision+1};assert.equal(guard?.(),false);f.document=first;assert.equal(guard?.(),false);release(blob);await assert.rejects(work,/carnet|compte/);
});

test('A print lease rejects source revision identity generation owner API and account ABA',()=>{
 for(const kind of ['revision','identity','generation','owner','api','account','space','permission']){
  const f=scopeFixture(),lease=createPaperPrintLease(f.scope,f.document);assert.equal(lease.current(),true);const api=f.scope.media.api;
  if(kind==='revision')f.document.revision++;
  if(kind==='identity')f.document={...f.document};
  if(kind==='generation')f.scope.generation=2;
  if(kind==='owner')f.scope.ownerKey='other-owner';
  if(kind==='api')f.scope.media.api={} as NotebookMediaScope['api'];
  if(kind==='account')f.scope.media.accountId='qa-print-other';
  if(kind==='space')f.scope.media.spaceId='other-year';
  if(kind==='permission')f.allowed=false;
  assert.equal(lease.current(),false);f.scope.ownerKey='qa-print-account/year/note';f.scope.generation=1;f.scope.media.accountId='qa-print-account';f.scope.media.spaceId='year';f.scope.media.api=api;f.allowed=true;assert.equal(lease.current(),false,'Returning to the old scope cannot revive this lease');
 }
});

test('Preparation never substitutes a non PDF or an incomplete renderer result',async()=>{
 const f=scopeFixture(),blob=await pdfFixture(f.document);
 await assert.rejects(preparePaperPrint(f.scope,{}, {renderPdf:async()=>blob}),/pagination/);
 await assert.rejects(preparePaperPrint(f.scope,{}, {renderPdf:async(_source,_media,progress)=>{progress(1,2);return blob;}}),/pagination/);
 await assert.rejects(preparePaperPrint(f.scope,{}, {renderPdf:async(_source,_media,progress)=>{progress(2,2);return new Blob(['not a PDF'],{type:'application/pdf'});}}),/PDF/);
 await assert.rejects(preparePaperPrint(f.scope,{}, {renderPdf:async(_source,_media,progress)=>{progress(2,2);return new Blob([await blob.arrayBuffer()],{type:'text/plain'});}}),/PDF/);
});

test('The shared projection may remove obsolete generated flow pages while still finishing its complete PDF',async()=>{
 const f=scopeFixture();f.document.pages[1]={...f.document.pages[1],flowRootId:'old-text-root'};
 const prepared=await preparePaperPrint(f.scope,{}, {renderPdf:async(source,_media,progress)=>{const projected={...source,pages:source.pages.slice(0,1)},blob=await pdfFixture(projected);progress(1,1);return blob;}});
 assert.equal(prepared.pageCount,1);assert.equal(f.document.pages.length,2);assert.equal((await PDFDocument.load(await prepared.blob.arrayBuffer())).getPageCount(),1);
});

test('An owned ready PDF frame requires a trusted action and reports only a dialogue request',async()=>{
 const f=scopeFixture(),prepared=await preparation(f),{preview,created}=previewFixture(prepared),frame=frameFixture(preview.url);assert.equal(created[0],prepared.blob);
 assert.equal(preview.request(frame.frame,{isTrusted:true},false).status,'refused');assert.equal(frame.calls,0);assert.equal(preview.ready(frame.frame),true);
 assert.equal(preview.request(frame.frame,{isTrusted:false},false).status,'refused');assert.equal(frame.calls,0);assert.equal(preview.request(frame.frame,{isTrusted:true},true).status,'unavailable');assert.equal(frame.calls,0);
 const result=preview.request(frame.frame,{isTrusted:true},false);assert.equal(result.status,'dialog-requested');assert.equal(frame.calls,1);assert.ok(!result.message.includes('imprimé avec succès'));preview.dispose();
});

test('A foreign navigated disconnected or revoked frame can never print another document',async()=>{
 const f=scopeFixture(),prepared=await preparation(f),{preview,revoked}=previewFixture(prepared),frame=frameFixture(preview.url);preview.ready(frame.frame);
 frame.target.location.href='https://other.invalid/private';assert.equal(preview.request(frame.frame,{isTrusted:true},false).status,'unavailable');assert.equal(frame.calls,0);frame.target.location.href=preview.url;frame.frame.src='https://other.invalid/private';assert.equal(preview.request(frame.frame,{isTrusted:true},false).status,'refused');assert.equal(frame.calls,0);
 frame.frame.src=preview.url;Object.defineProperty(frame.frame,'isConnected',{value:false});assert.equal(preview.request(frame.frame,{isTrusted:true},false).status,'refused');assert.equal(frame.calls,0);Object.defineProperty(frame.frame,'isConnected',{value:true});f.allowed=false;assert.equal(preview.current(),false);assert.equal(frame.frame.src,'about:blank');assert.equal(frame.frame.style.opacity,'0');assert.deepEqual(revoked,[preview.url]);f.allowed=true;assert.equal(preview.request(frame.frame,{isTrusted:true},false).status,'refused');assert.equal(frame.calls,0);preview.dispose();assert.deepEqual(revoked,[preview.url]);
});

test('View cleanup revokes its URL exactly once without destroying a valid source for StrictMode setup',async()=>{
 const f=scopeFixture(),prepared=await preparation(f),first=previewFixture(prepared),frame=frameFixture(first.preview.url);first.preview.ready(frame.frame);first.preview.dispose();first.preview.dispose();assert.deepEqual(first.revoked,[first.preview.url]);assert.equal(prepared.current(),true);assert.equal(frame.frame.src,'about:blank');
 const fresh=previewFixture(prepared);assert.equal(fresh.preview.current(),true);fresh.preview.dispose();prepared.revoke();assert.equal(prepared.current(),false);assert.throws(()=>previewFixture(prepared),/carnet|compte/);
});

test('Untrusted saving and revoked human saving cannot initiate a download or native dialog',async()=>{
 const f=scopeFixture(),prepared=await preparation(f),{preview}=previewFixture(prepared);assert.equal((await preview.save({isTrusted:false})).status,'refused');f.allowed=false;assert.equal((await preview.save({isTrusted:true})).status,'refused');preview.dispose();
});

test('PDF filenames remove path separators and controls without exposing a save path',()=>{
 assert.equal(paperPrintFilename(' A/B:note.PDF '),'A-B-note.pdf');assert.equal(paperPrintFilename(''),'carnet.pdf');assert.equal(paperPrintFilename(' \n '),'carnet.pdf');assert.equal(paperPrintFilename('A\x00B'),'A-B.pdf');assert.ok(paperPrintFilename('a'.repeat(200)).length<=104);
});
