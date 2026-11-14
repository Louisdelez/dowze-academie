import test from 'node:test';
import assert from 'node:assert/strict';
import {migratePaper,blankPage,type PaperDocument,type PaperObject} from '../src/lib/notebookDocument.ts';
import {textFlowFingerprint} from '../src/lib/paperTextFlow.ts';
import {preparePaperReadAloudText,MAX_PAPER_READ_ALOUD_TEXT,MAX_PAPER_READ_ALOUD_SOURCE,MAX_PAPER_READ_ALOUD_CHUNK,MAX_PAPER_READ_ALOUD_CHUNKS,MAX_PAPER_READ_ALOUD_NODES} from '../src/lib/paperReadAloudText.ts';

function fixture(markdown=''){
 const document=migratePaper('read-aloud-note',markdown,null,'2026-10-15T10:00:00.000Z');
 return {document,pageId:document.pages[0].id};
}
function ready(document:PaperDocument,pageId:string){const result=preparePaperReadAloudText({document,pageId});assert.equal(result.status,'ready',result.status==='unavailable'?result.reason:'Expected extracted text');if(result.status!=='ready')throw Error('Fixture requires ready text');return result;}
function flow(markdown:string,offset:number){
 const f=fixture(markdown),root=f.document.objects.find(object=>object.kind==='text')!,second=blankPage('second-page');f.document.pages.push(second);
 root.textFlow={schema:1,pageIds:[f.pageId,second.id],breaks:[0,1000,2000],source:textFlowFingerprint(root.markdown??'',root.width,root.height),sourceOffsets:[0,offset,markdown.length]};
 return {...f,root,second};
}
test('Markdown AST reads visible text code and image alt without destinations HTML TeX or formatting syntax',()=>{
 const f=fixture('# Titre\n\nDu **gras**, _italique_ et `code inline`.\n\n[Libellé](https://never-read.invalid/private) ![Une étoile](https://never-read.invalid/image)\n\n```js\nconst x = 1;\n```\n\n<div>HTML_SECRET</div>\n\n$MATH_SECRET$\n\n```LaTeX\nLATEX_SECRET\n```'),before=structuredClone(f.document),result=ready(f.document,f.pageId);
 for(const text of ['Titre','Du gras, italique et code inline.','Libellé','Une étoile','const x = 1;'])assert.ok(result.text.includes(text),text);
 for(const hidden of ['https://','never-read','HTML_SECRET','MATH_SECRET','LATEX_SECRET','```','**','!['])assert.equal(result.text.includes(hidden),false,hidden);
 assert.deepEqual(f.document,before);assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.chunks));assert.equal(result.chunks.join(''),result.text);
});
test('GFM tables lists strike and escaped entities yield content instead of raw syntax',()=>{
 const f=fixture('- [x] Une tâche\n- ~~Annulé~~\n\n| Nom | Valeur |\n| --- | --- |\n| Énergie | &amp; \\* |'),result=ready(f.document,f.pageId);
 for(const text of ['Une tâche','Annulé','Nom','Valeur','Énergie','& *'])assert.ok(result.text.includes(text),text);
 assert.equal(result.text.includes('|'),false);assert.equal(result.text.includes('[x]'),false);assert.equal(result.text.includes('~~'),false);
});
test('Continuation extraction uses the exact shared rich range and never the other page source',()=>{
 const markdown='Première page.\n\nSeconde **page**.',f=flow(markdown,markdown.indexOf('Seconde')),before=structuredClone(f.document);
 assert.equal(ready(f.document,f.pageId).text,'Première page.');assert.equal(ready(f.document,f.second.id).text,'Seconde page.');assert.deepEqual(f.document,before);
});
test('Missing stale malformed or non-grapheme continuation offsets refuse the whole request',()=>{
 const f=flow('left e\u0301😀 right',7);
 for(const changed of [undefined,[0,6,f.root.markdown!.length],[0,8,f.root.markdown!.length],[0,100,f.root.markdown!.length],[0,7],[-1,7,f.root.markdown!.length]]){
  const object={...f.root,textFlow:{...f.root.textFlow!,sourceOffsets:changed}},document={...f.document,objects:[object]};
  const result=preparePaperReadAloudText({document,pageId:f.second.id});assert.equal(result.status,'unavailable');if(result.status==='unavailable')assert.equal(result.code,'layout-pending');
 }
 const stale={...f.document,objects:[{...f.root,markdown:f.root.markdown+'new'}]};assert.equal(preparePaperReadAloudText({document:stale,pageId:f.second.id}).status,'unavailable');
});
test('Extracted PDF text precedes annotations and is read without downloading rasterizing or changing assets',()=>{
 const f=fixture('Annotation'),asset={id:'pdf-source',name:'DO_NOT_READ_FILENAME.pdf',mediaType:'application/pdf',size:100};f.document.assets.push(asset);f.document.pages[0].pdf={assetId:asset.id,pageNumber:2,text:'Texte PDF déjà extrait.\nDeuxième ligne.'};
 const before=structuredClone(f.document),result=ready(f.document,f.pageId);assert.equal(result.text,'Texte PDF déjà extrait.\nDeuxième ligne.\n\nAnnotation');assert.deepEqual(f.document,before);
});
test('A PDF without extracted text and image-only or ink-only pages report unavailable rather than inventing OCR',()=>{
 const pdf=fixture('Annotation'),asset={id:'pdf-source',name:'secret-name.pdf',mediaType:'application/pdf',size:1};pdf.document.assets.push(asset);pdf.document.pages[0].pdf={assetId:asset.id,pageNumber:1};
 const result=preparePaperReadAloudText(pdf);assert.equal(result.status,'unavailable');if(result.status==='unavailable'){assert.equal(result.code,'no-extracted-text');assert.ok(result.reason.includes('OCR'));}
 for(const kind of ['image','ink'] as const){const f=fixture(),base=f.document.objects[0]??{id:'visual',pageId:f.pageId,x:0,y:0,width:100,height:100,rotation:0,z:0,locked:false,createdAt:1};f.document.objects=[{...base,kind,assetId:'image-source',points:[{x:0,y:0,time:0}]} as PaperObject];const before=structuredClone(f.document),actual=preparePaperReadAloudText(f);assert.equal(actual.status,'unavailable');assert.deepEqual(f.document,before);}
});
test('Blank text placeholders are empty and another page text is not borrowed',()=>{
 const f=fixture(),second=blankPage('other-page');f.document.pages.push(second);assert.equal(preparePaperReadAloudText(f).status,'empty');
 const withText=fixture('Other page only');withText.document.pages.push(second);assert.equal(preparePaperReadAloudText({document:withText.document,pageId:second.id}).status,'empty');
 const removed=preparePaperReadAloudText({document:f.document,pageId:'removed'});assert.equal(removed.status,'unavailable');if(removed.status==='unavailable')assert.equal(removed.code,'page-unavailable');
});
test('Chunks preserve every UTF16 unit and never split emoji combining sequences or joined families',()=>{
 const f=fixture(('é e\u0301 😀 👩‍👩‍👧‍👦 mot ').repeat(250)),result=ready(f.document,f.pageId),boundaries=new Set([0,result.text.length]);
 for(const part of new Intl.Segmenter('fr',{granularity:'grapheme'}).segment(result.text))boundaries.add(part.index);
 let end=0;for(const chunk of result.chunks){assert.ok(chunk.length>0&&chunk.length<=MAX_PAPER_READ_ALOUD_CHUNK);assert.ok(boundaries.has(end));end+=chunk.length;assert.ok(boundaries.has(end));}assert.equal(end,result.text.length);assert.equal(result.chunks.join(''),result.text);assert.ok(result.chunks.length<=MAX_PAPER_READ_ALOUD_CHUNKS);
});
test('Text source node and chunk budgets reject without a truncated ready result',()=>{
 for(const markdown of ['a'.repeat(MAX_PAPER_READ_ALOUD_TEXT+1),'x'.repeat(MAX_PAPER_READ_ALOUD_SOURCE+1),'a'+'\u0301'.repeat(MAX_PAPER_READ_ALOUD_CHUNK)]){
  const f=fixture(markdown),before=structuredClone(f.document),result=preparePaperReadAloudText(f);assert.equal(result.status,'unavailable');if(result.status==='unavailable')assert.equal(result.code,'budget');assert.deepEqual(f.document,before);
 }
 const f=fixture(),base={id:'unrelated',pageId:'not-selected',kind:'shape' as const,x:0,y:0,width:1,height:1,rotation:0,z:0,locked:false,createdAt:1};f.document.objects=Array.from({length:MAX_PAPER_READ_ALOUD_NODES},()=>base);const result=preparePaperReadAloudText(f);assert.equal(result.status,'unavailable');if(result.status==='unavailable')assert.equal(result.code,'budget');
});
test('A successful result remains an independent text snapshot when later canonical content changes',()=>{
 const f=fixture('Texte admis'),result=ready(f.document,f.pageId);f.document.objects[0].markdown='Version suivante';f.document.revision++;assert.equal(result.text,'Texte admis');assert.equal(result.chunks.join(''),'Texte admis');assert.equal(ready(f.document,f.pageId).text,'Version suivante');
});
test('Unavailable grapheme segmentation and malformed surrogate text fail explicitly',()=>{
 const f=fixture('Texte'),original=Object.getOwnPropertyDescriptor(Intl,'Segmenter');
 try{Object.defineProperty(Intl,'Segmenter',{configurable:true,writable:true,value:undefined});const result=preparePaperReadAloudText(f);assert.equal(result.status,'unavailable');if(result.status==='unavailable')assert.equal(result.code,'segmentation-unavailable');}finally{if(original)Object.defineProperty(Intl,'Segmenter',original);}
 const malformed=fixture('Avant \ud800 après'),result=preparePaperReadAloudText(malformed);assert.equal(result.status,'unavailable');if(result.status==='unavailable')assert.equal(result.code,'invalid-source');
});
test('Duplicate current page or object identities cannot create a false readable page',()=>{
 const f=fixture('Texte');const duplicatePage={...f.document,pages:[...f.document.pages,{...f.document.pages[0]}]};assert.equal(preparePaperReadAloudText({document:duplicatePage,pageId:f.pageId}).status,'unavailable');
 const duplicateObject={...f.document,objects:[...f.document.objects,{...f.document.objects[0]}]};assert.equal(preparePaperReadAloudText({document:duplicateObject,pageId:f.pageId}).status,'unavailable');
});
