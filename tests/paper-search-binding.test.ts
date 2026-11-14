import test from 'node:test';
import assert from 'node:assert/strict';
import {textMatches,searchPaperDocument,resolvePaperTextRange,resolvePaperSearchHit,type PaperSearchHit} from '../src/lib/paperSearch.ts';
import {migratePaper,applyPaperCommand,blankPage,type PaperDocument} from '../src/lib/notebookDocument.ts';
import {textFlowFingerprint,reflowPaperText} from '../src/lib/paperTextFlow.ts';

const stamp='2026-10-15T12:00:00.000Z';
function flow(text='prefix\nTARGET begins\nlast page',offsets?:number[]):PaperDocument{
 const document=migratePaper('search-bound-flow',text,null,stamp),root=document.objects[0];
 const positions=offsets??[0,text.indexOf('TARGET'),text.indexOf('last'),text.length],breaks=positions.map((_,index)=>index*100);
 const command=reflowPaperText(document,root.id,textFlowFingerprint(text,root.width,root.height),breaks,positions);assert.ok(command);
 return applyPaperCommand(document,command,stamp);
}
const copy=<T>(value:T):T=>structuredClone(value);

test('Decomposed accents select their complete original grapheme in UTF-16',()=>{
 for(const original of ['e\u0301','e\u0327\u0301','É']){
  const found=textMatches(original,'e');assert.equal(found.length,1);assert.equal(found[0].start,0);assert.equal(found[0].end,original.length);assert.equal(original.slice(found[0].start,found[0].end),original);
 }
 const source='📝 e\u0301cole et ÉCOLE';const hits=textMatches(source,'école');assert.equal(hits.length,2);assert.deepEqual(hits.map(hit=>source.slice(hit.start,hit.end)),['e\u0301cole','ÉCOLE']);assert.equal(hits[0].start,3);
 assert.deepEqual(textMatches(source,'\u0301'),[]);
});
test('Emoji modifiers and ZWJ sequences cannot produce cut or duplicate grapheme ranges',()=>{
 const family='👩‍👩‍👧‍👦',source='A '+family+' 🧑🏽‍🏫 fin';const found=textMatches(source,'👩');assert.equal(found.length,1);assert.equal(source.slice(found[0].start,found[0].end),family);
 const toned=textMatches(source,'🧑');assert.equal(toned.length,1);assert.equal(source.slice(toned[0].start,toned[0].end),'🧑🏽‍🏫');
 const long='a'.repeat(54)+family+' avant cible après '+family+'z'.repeat(120),excerpt=textMatches(long,'cible')[0].excerpt;
 assert.equal(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(excerpt),false,'Excerpt boundaries do not create lone surrogate halves');
});
test('Limits remain bounded and invalid or empty queries produce no invented occurrence',()=>{
 for(const limit of [0,-1,NaN,Infinity,1.5])assert.deepEqual(textMatches('a a a','a',limit),[]);
 assert.equal(textMatches('a a a','a',1).length,1);assert.deepEqual(textMatches('source','   '),[]);
 assert.equal(textMatches('ΟΣ ος οσ','ΟΣ').length,3,'Context-sensitive final sigma still follows the same case fold on both sides');
});
test('A fresh flow occurrence navigates to its continuation and keeps exact global source offsets',()=>{
 const document=flow(),before=copy(document),root=document.objects[0],hit=searchPaperDocument(document,'TARGET')[0],resolved=resolvePaperSearchHit(document,hit),start=root.markdown!.indexOf('TARGET');
 assert.equal(hit.pageId,root.textFlow!.pageIds[1]);assert.equal(hit.layout,'ready');assert.ok(resolved);assert.deepEqual(resolved,{pageId:root.textFlow!.pageIds[1],kind:'text',objectId:root.id,start,end:start+6,ranges:[{pageId:root.textFlow!.pageIds[1],start,end:start+6,pageSourceStart:root.textFlow!.sourceOffsets![1],pageSourceEnd:root.textFlow!.sourceOffsets![2]}]});
 assert.deepEqual(document,before,'Search and resolution never rewrite or reflow the canonical document');
});
test('Cross-page occurrences project nonempty half-open intersections without splitting the source',()=>{
 const document=flow(),root=document.objects[0],hit=searchPaperDocument(document,'begins\nlast')[0],resolved=resolvePaperSearchHit(document,hit);assert.ok(resolved);assert.equal(resolved.ranges.length,2);
 assert.deepEqual(resolved.ranges.map(row=>row.pageId),root.textFlow!.pageIds.slice(1));assert.equal(resolved.ranges[0].end,resolved.ranges[1].start);
 assert.equal(resolved.ranges.map(row=>root.markdown!.slice(row.start,row.end)).join(''),root.markdown!.slice(hit.start,hit.end));
 const boundary=root.textFlow!.sourceOffsets![1];assert.equal(resolvePaperTextRange(document,root.id,boundary-1,boundary)!.pageId,root.pageId);assert.equal(resolvePaperTextRange(document,root.id,boundary,boundary+1)!.pageId,root.textFlow!.pageIds[1]);
});
test('A physically present empty flow interval does not claim an occurrence on that page',()=>{
 const document=flow('TARGET tail',[0,0,7,11]),root=document.objects[0],resolved=resolvePaperTextRange(document,root.id,0,6);assert.ok(resolved);assert.equal(resolved.pageId,root.textFlow!.pageIds[1]);assert.equal(resolved.ranges.length,1);
});
test('Missing stale or malformed continuation layout keeps hits visible but refuses navigation',()=>{
 const base=flow(),mutations=[
  (doc:PaperDocument)=>{delete doc.objects[0].textFlow!.sourceOffsets;},
  (doc:PaperDocument)=>{doc.objects[0].textFlow!.source='old-layout';},
  (doc:PaperDocument)=>{doc.objects[0].width++;},
  (doc:PaperDocument)=>{doc.objects[0].textFlow!.sourceOffsets![1]=1.5;},
  (doc:PaperDocument)=>{doc.objects[0].textFlow!.sourceOffsets![2]=1;},
  (doc:PaperDocument)=>{doc.objects[0].textFlow!.pageIds[1]=doc.objects[0].pageId;},
  (doc:PaperDocument)=>{doc.objects[0].textFlow!.pageIds[0]=doc.objects[0].textFlow!.pageIds[1];},
  (doc:PaperDocument)=>{doc.pages.splice(1,1);},
  (doc:PaperDocument)=>{doc.objects[0].textFlow!.breaks[1]=Infinity;},
  (doc:PaperDocument)=>{doc.objects[0].textFlow!.breaks.pop();}
 ];
 for(const change of mutations){const document=copy(base);change(document);const hit=searchPaperDocument(document,'TARGET')[0];assert.ok(hit,'The textual occurrence remains available in results');assert.equal(hit.layout,'pending');assert.equal(resolvePaperSearchHit(document,hit),null);assert.equal(resolvePaperTextRange(document,document.objects[0].id,7,13),null);}
});
test('Page source offsets and manual ranges cannot cut a combining cluster or surrogate pair',()=>{
 const document=flow('e\u0301TARGET tail',[0,1,8,13]),root=document.objects[0];assert.equal(resolvePaperTextRange(document,root.id,2,8),null,'An otherwise valid match cannot use a page boundary inside the leading accent cluster');
 const plain=migratePaper('search-grapheme','📝e\u0301',null,stamp),id=plain.objects[0].id;assert.equal(resolvePaperTextRange(plain,id,0,1),null);assert.equal(resolvePaperTextRange(plain,id,2,3),null);assert.ok(resolvePaperTextRange(plain,id,2,4));
});
test('A hit binding is immutable and shared by occurrences of one exact source',()=>{
 const document=migratePaper('search-binding','cible puis cible',null,stamp),hits=searchPaperDocument(document,'cible');assert.equal(hits.length,2);assert.ok(Object.isFrozen(hits[0].binding));assert.equal(hits[0].binding,hits[1].binding);assert.notEqual(hits[0].occurrenceId,hits[1].occurrenceId);assert.ok(resolvePaperSearchHit(copy(document),JSON.parse(JSON.stringify(hits[0]))),'Serialized data is revalidated against its exact current source, not treated as authority');
});
test('Changed document incarnation revision source text object kind or geometry rejects old hits',()=>{
 const base=migratePaper('search-stale','cible puis suite',null,stamp),hit=searchPaperDocument(base,'cible')[0],mutations=[
  (doc:PaperDocument)=>{doc.noteId='different-note';},
  (doc:PaperDocument)=>{doc.revision++;},
  (doc:PaperDocument)=>{doc.updatedAt='2026-10-15T13:00:00.000Z';},
  (doc:PaperDocument)=>{doc.legacy.migratedAt='2026-10-15T11:00:00.000Z';},
  (doc:PaperDocument)=>{doc.collaboration={schema:1,lineage:'different-incarnation',state:''};},
  (doc:PaperDocument)=>{doc.objects[0].markdown+=' independent new text';},
  (doc:PaperDocument)=>{doc.objects[0].kind='sticky';},
  (doc:PaperDocument)=>{doc.objects[0].createdAt++;},
  (doc:PaperDocument)=>{doc.objects[0].x++;},
  (doc:PaperDocument)=>{doc.objects=[];}
 ];
 for(const change of mutations){const document=copy(base);change(document);assert.equal(resolvePaperSearchHit(document,hit),null);}
});
test('Ambiguous object or page IDs never resolve to an arbitrary first match',()=>{
 const base=migratePaper('search-ambiguous','cible',null,stamp),hit=searchPaperDocument(base,'cible')[0],objects=copy(base),pages=copy(base);objects.objects.push(copy(objects.objects[0]));pages.pages.push(copy(pages.pages[0]));assert.equal(resolvePaperSearchHit(objects,hit),null);assert.equal(resolvePaperTextRange(objects,hit.objectId!,0,5),null);assert.equal(resolvePaperSearchHit(pages,hit),null);
});
test('Reflow regenerates a new bound hit and refuses stale page maps even when revision is forged unchanged',()=>{
 const document=flow(),old=searchPaperDocument(document,'TARGET')[0],root=document.objects[0],changed=copy(document);changed.objects[0].textFlow!.sourceOffsets![1]=0;assert.equal(resolvePaperSearchHit(changed,old),null,'Changed fresh-looking offsets are part of the source binding');
 const command=reflowPaperText(document,root.id,textFlowFingerprint(root.markdown!,root.width,root.height),[0,100],[0,root.markdown!.length]);assert.ok(command);const reflowed=applyPaperCommand(document,command,stamp),fresh=searchPaperDocument(reflowed,'TARGET')[0];assert.equal(resolvePaperSearchHit(reflowed,old),null);assert.ok(resolvePaperSearchHit(reflowed,fresh));assert.equal(fresh.pageId,reflowed.objects[0].pageId);
});
test('Unbound hits and edited offsets page IDs or source proofs cannot authorize a selection',()=>{
 const document=flow(),hit=searchPaperDocument(document,'TARGET')[0],{binding,occurrenceId,layout,...unbound}=hit;assert.equal(resolvePaperSearchHit(document,unbound),null);
 const altered:PaperSearchHit[]=[{...hit,start:hit.start+1},{...hit,end:hit.end+1},{...hit,pageId:document.pages[0].id},{...hit,objectId:'another-object'},{...hit,binding:{...binding!,sourceText:'another text'}},{...hit,binding:{...binding!,fingerprint:'0'.repeat(64)}},{...hit,occurrenceId:'0'.repeat(64)}];for(const item of altered)assert.equal(resolvePaperSearchHit(document,item),null);
});
test('Exact UTF-16 fingerprints distinguish lone surrogates and chunk-boundary source changes',()=>{
 const left=migratePaper('search-utf16','a'.repeat(4095)+'\ud800 cible',null,stamp),right=copy(left);right.objects[0].markdown='a'.repeat(4095)+'\ud801 cible';const a=searchPaperDocument(left,'cible')[0],b=searchPaperDocument(right,'cible')[0];assert.notEqual(a.binding!.fingerprint,b.binding!.fingerprint);assert.equal(resolvePaperSearchHit(right,a),null);assert.ok(resolvePaperSearchHit(right,b));
});
test('PDF hits bind the real extracted text asset and physical PDF page without inventing OCR',()=>{
 const document=migratePaper('search-pdf','No target here',null,stamp),page=blankPage('extracted-page');page.pdf={assetId:'pdf-source',pageNumber:4,text:'Énergie et e\u0301nergie'};document.pages.push(page);document.assets.push({id:'pdf-source',name:'Original.pdf',mediaType:'application/pdf',size:12});const hits=searchPaperDocument(document,'energie');assert.equal(hits.length,2);assert.ok(hits.every(hit=>hit.kind==='pdf'&&hit.pageId===page.id));assert.equal(hits[0].binding,hits[1].binding);const resolved=resolvePaperSearchHit(document,hits[1]);assert.ok(resolved);assert.equal(resolved.kind,'pdf');assert.equal(page.pdf.text!.slice(resolved.start,resolved.end),'e\u0301nergie');
 for(const change of [(doc:PaperDocument)=>{doc.pages[1].pdf!.pageNumber++;},(doc:PaperDocument)=>{doc.pages[1].pdf!.text+=' updated';},(doc:PaperDocument)=>{doc.pages[1].pdf!.assetId='different-pdf';}]){const altered=copy(document);change(altered);assert.equal(resolvePaperSearchHit(altered,hits[0]),null);}
 delete page.pdf.text;assert.equal(searchPaperDocument(document,'energie').length,0);assert.equal(resolvePaperSearchHit(document,hits[0]),null);
});
