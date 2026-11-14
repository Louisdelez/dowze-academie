import test from 'node:test';
import assert from 'node:assert/strict';
import {paperMarkdown,paperArchiveMetadata} from '../src/lib/paperArchiveMetadata.ts';
import {migratePaper,blankPage,applyPaperCommand,isPaperDocument,type PaperDocument,type PaperObject} from '../src/lib/notebookDocument.ts';
import {reflowPaperText,textFlowFingerprint} from '../src/lib/paperTextFlow.ts';

function text(document:PaperDocument,id:string,pageId:string,markdown:string,y=48,x=48,z=0):PaperObject{
 return {...document.objects[0],id,pageId,markdown,y,x,z,textFlow:undefined};
}
function continued(markdown:string,cuts:number[],offsets=true):PaperDocument{
 const seed=migratePaper('markdown-order',markdown,null),root=seed.objects[0];
 return applyPaperCommand(seed,reflowPaperText(seed,root.id,textFlowFingerprint(markdown,root.width,root.height),cuts.map((_,index)=>index*900),offsets?cuts:undefined)!);
}

test('Markdown follows the physical page order after edits change object insertion order',()=>{
 const seed=migratePaper('order','Premier',null),first=seed.pages[0],second=blankPage('second'),third=blankPage('third');
 const document={...seed,pages:[third,first,second],objects:[text(seed,'second-text',second.id,'Deuxième'),text(seed,'first-text',first.id,'Premier'),text(seed,'third-text',third.id,'Troisième')]};
 const before=structuredClone(document);assert.equal(paperMarkdown(document),'Troisième\n\nPremier\n\nDeuxième');assert.deepEqual(document,before);
});

test('Multiple text objects on a page use stable visual reading order, excluding ink and sticky objects',()=>{
 const seed=migratePaper('visual','',null),page=seed.pages[0];
 const document={...seed,objects:[text(seed,'lower',page.id,'Bas',200),text(seed,'right',page.id,'Droite',80,200),text(seed,'same-later',page.id,'Même après',80,48,1),text(seed,'left',page.id,'Gauche',80),{...text(seed,'sticky',page.id,'Post-it',0),kind:'sticky' as const},{...text(seed,'ink',page.id,'Dessin',0),kind:'ink' as const,points:[{x:0,y:0,time:1}]}]};
 assert.equal(paperMarkdown(document),'Gauche\n\nMême après\n\nDroite\n\nBas');
});

test('An uninterrupted continuous flow remains byte exact and is emitted once even without legacy source offsets',()=>{
 const markdown='# Cours\r\n\r\n**Texte riche** et [source][ref].\r\n\r\n```ts\r\nconst a = "&amp;";\r\n```\r\n\r\n$$x^2$$\r\n\r\n[ref]: https://example.org\r\n',document=continued(markdown,[0,1,2,markdown.length],false),before=structuredClone(document);
 assert.ok(isPaperDocument(document));assert.equal(document.pages.length,3);assert.equal(paperMarkdown(document),markdown);assert.deepEqual(document,before);
});

test('A passage inserted inside a continuous flow appears at its actual page position with balanced rich fragments',()=>{
 const markdown='## Première\n\n**Partie A** et [guide][ref].\n\n## Dernière\n\nPartie B.\n\n[ref]: https://example.org "Guide"\n',cut=markdown.indexOf('## Dernière'),flow=continued(markdown,[0,cut,markdown.length]),inserted=blankPage('inserted'),document={...flow,pages:[flow.pages[0],inserted,flow.pages[1]],objects:[text(flow,'inserted-text',inserted.id,'## Intercalaire'),...flow.objects]},before=structuredClone(document),exported=paperMarkdown(document);
 assert.ok(exported.indexOf('Partie A')<exported.indexOf('Intercalaire'));assert.ok(exported.indexOf('Intercalaire')<exported.indexOf('Partie B'));assert.match(exported,/\*\*Partie A\*\*/);assert.match(exported,/\[ref\]: https:\/\/example.org/);assert.equal(exported.match(/Partie A/g)?.length,1);assert.equal(exported.match(/Partie B/g)?.length,1);assert.deepEqual(document,before);
});

test('Reversed continuous pages export their fresh rich source ranges in physical order',()=>{
 const markdown='# Un\n\nPremier.\n\n# Deux\n\nDeuxième.\n\n# Trois\n\nTroisième.\n',cuts=[0,markdown.indexOf('# Deux'),markdown.indexOf('# Trois'),markdown.length],flow=continued(markdown,cuts),document={...flow,pages:[flow.pages[2],flow.pages[0],flow.pages[1]]},before=structuredClone(document),exported=paperMarkdown(document);
 assert.ok(exported.indexOf('Troisième')<exported.indexOf('Premier'));assert.ok(exported.indexOf('Premier')<exported.indexOf('Deuxième'));for(const value of ['Premier','Deuxième','Troisième'])assert.equal(exported.split(value).length-1,1);assert.deepEqual(document,before);
});

test('Ambiguous old or stale page positions fail explicitly instead of exporting a misleading order',()=>{
 const markdown='Premier.\n\nDernier.\n',cut=markdown.indexOf('Dernier'),old=continued(markdown,[0,cut,markdown.length],false),spacer=blankPage('blank-interruption');
 assert.throws(()=>paperMarkdown({...old,pages:[old.pages[0],spacer,old.pages[1]]}),/actualisée.*ordre des pages.*original reste conservé/);
 assert.throws(()=>paperMarkdown({...old,pages:[old.pages[1],old.pages[0]]}),/actualisée/);
 const fresh=continued(markdown,[0,cut,markdown.length]),stale={...fresh,objects:[{...fresh.objects[0],markdown:markdown+'Nouveau texte.'}],pages:[fresh.pages[1],fresh.pages[0]]},before=structuredClone(stale);assert.throws(()=>paperMarkdown(stale),/actualisée/);assert.deepEqual(stale,before);
 const overlay={...old,objects:[...old.objects,text(old,'interrupted-text',old.pages[0].id,'Au milieu',200)]};assert.throws(()=>paperMarkdown(overlay),/actualisée/);
});

test('Materialized independent passages require no flow positions and archive metadata uses the same page order',()=>{
 const seed=migratePaper('metadata-order','Original',null,'2026-10-13T10:00:00Z'),second=blankPage('second'),document={...seed,pages:[second,seed.pages[0]],objects:[text(seed,'original',seed.pages[0].id,'**Ancien premier**'),text(seed,'moved',second.id,'# Maintenant premier')]},before=structuredClone(document),metadata=paperArchiveMetadata(document,{title:'Cours déplacé'},undefined,'2026-10-13T11:00:00Z');
 assert.equal(metadata.note.markdown,'# Maintenant premier\n\n**Ancien premier**');assert.equal(metadata.note.title,'Cours déplacé');assert.deepEqual(metadata.folderPath,[]);assert.deepEqual(document,before);
});
