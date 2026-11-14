import test from 'node:test';
import assert from 'node:assert/strict';
import {textFlowBreaks,textFlowFingerprint,reflowPaperText} from '../src/lib/paperTextFlow.ts';
import {migratePaper,applyPaperCommand,isPaperDocument} from '../src/lib/notebookDocument.ts';
import {copiedPageText,copyMarkdownRange} from '../src/lib/paperPageCopy.ts';
import {planPaperPageOperation} from '../src/lib/paperPageOperations.ts';
import {paperMathFitCss,fitPaperFlowMath,paperFlowContentElement,paperFlowChromeSelector} from '../src/lib/paperRichFlowLayout.ts';
import {JSDOM} from 'jsdom';

test('Rich painted lines either move whole or preserve the source with a layout refusal',()=>{
 const lines=Array.from({length:28},(_,i)=>({top:8+i*22.4,bottom:25+i*22.4,unbreakable:true}));
 const cuts=textFlowBreaks(640,160,lines);assert.equal(cuts[0],0);assert.equal(cuts.at(-1),640);assert.ok(lines.every(line=>cuts.slice(1).some((end,i)=>line.top>=cuts[i]-.1&&line.bottom<=Math.min(end,cuts[i]+160)+.1)));assert.ok(cuts.slice(1,-1).every(cut=>lines.every(line=>!(line.top<cut-.1&&line.bottom>cut+.1))));
 assert.throws(()=>textFlowBreaks(240,80,[{top:0,bottom:230,unbreakable:true}]),/original reste conservé/);
 assert.throws(()=>textFlowBreaks(130,80,[{top:0,bottom:60,unbreakable:true},{top:50,bottom:110,unbreakable:true}]),/original reste conservé/);
});
test('Ordinary table pages preserve header context and source cells when copied',()=>{
 const markdown='| Sujet | Valeur |\n| --- | --- |\n| Alpha | Premier |\n| Bravo | Deuxième |\n| Charlie | Troisième |\n';
 const from=markdown.indexOf('| Bravo'),to=markdown.indexOf('| Charlie'),copy=copyMarkdownRange(markdown,from,to);assert.match(copy,/Sujet/);assert.match(copy,/Valeur/);assert.match(copy,/Bravo/);assert.match(copy,/Deuxième/);assert.doesNotMatch(copy,/Alpha|Charlie/);assert.equal(markdown.includes('Troisième'),true);
});
test('A table row spanning frames keeps its canonical text and refuses unfaithful page partitions',()=>{
 const markdown='| Sujet | Valeur |\n| --- | --- |\n| '+('Cellule longue. '.repeat(70))+' | '+('Deuxième cellule complète. '.repeat(70))+' |\n';let doc=migratePaper('oversize-table',markdown,null),root=doc.objects[0];root.width=400;root.height=160;const canonical=structuredClone(doc),fingerprint=textFlowFingerprint(markdown,root.width,root.height);
 doc=applyPaperCommand(doc,reflowPaperText(doc,root.id,fingerprint,[0,150,300,440])!);assert.ok(isPaperDocument(doc));assert.equal(doc.objects.length,1);assert.equal(doc.objects[0].id,canonical.objects[0].id);assert.equal(doc.objects[0].markdown,markdown);assert.equal(doc.objects[0].textFlow?.sourceOffsets,undefined);
 const before=structuredClone(doc);assert.throws(()=>copiedPageText(doc.objects[0],doc.pages[1].id),/actualisée/);assert.throws(()=>planPaperPageOperation(doc,{type:'remove-page',id:doc.pages[1].id}),/actualisée/);assert.throws(()=>planPaperPageOperation(doc,{type:'reorder-pages',ids:[doc.pages[1].id,doc.pages[0].id,doc.pages[2].id]}),/actualisée/);assert.deepEqual(doc,before);
});
test('Math presentation rules target only scoped KaTeX descendants and keep source DOM outside the mutation',()=>{
 const css=paperMathFitCss('paper-flow-reader',[{path:':nth-child(2) > :nth-child(1)',fontSize:8.125}]);assert.equal(css,'#paper-flow-reader > :nth-child(2) > :nth-child(1).katex{font-size:8.125px!important}');assert.throws(()=>paperMathFitCss('bad}body',[]));
});

test('Old geometry expires while deterministic continuation identities and originals survive recalculation',()=>{
 const markdown='Canonical rich source';let doc=migratePaper('layout-version',markdown,null),root=doc.objects[0],current=textFlowFingerprint(markdown,root.width,root.height);doc=applyPaperCommand(doc,reflowPaperText(doc,root.id,current,[0,100,200],[0,8,markdown.length])!);const pageIds=doc.pages.map(page=>page.id);doc.objects[0].textFlow!.source=current.replace(/^rich2:/,'');assert.throws(()=>copiedPageText(doc.objects[0],doc.pages[1].id),/actualisée/);doc=applyPaperCommand(doc,reflowPaperText(doc,root.id,current,[0,100,200])!);assert.equal(doc.objects[0].textFlow!.sourceOffsets,undefined);assert.deepEqual(doc.pages.map(page=>page.id),pageIds);assert.equal(doc.objects[0].markdown,markdown);
});

test('Trailing paragraph spacing never creates an empty continuation after the last painted pixel',()=>{
 const bands=[{top:10,bottom:30,unbreakable:true},{top:40,bottom:168,unbreakable:true},{top:179,bottom:199,unbreakable:true}],cuts=textFlowBreaks(211,160,bands);assert.deepEqual(cuts,[0,40,211]);assert.ok(bands.every(b=>cuts.slice(1).some((end,i)=>b.top>=cuts[i]-.1&&b.bottom<=Math.min(end,cuts[i]+160)+.1)));
});

test('Wide math fits its painted bases even when the HTML wrapper already reports the frame width',()=>{
 const dom=new JSDOM('<div id="flow"><span class="katex-display"><span class="katex" style="font-size:19.36px"><span class="katex-html"><span class="base">wide formula first part</span><span class="base">second part</span></span></span></span></div>'),source=dom.window.document.getElementById('flow') as HTMLElement,atom=source.querySelector<HTMLElement>('.katex')!,html=source.querySelector<HTMLElement>('.katex-html')!,bases=[...html.querySelectorAll<HTMLElement>('.base')];
 const previousStyle=globalThis.getComputedStyle;globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);
 const box=(left:number,width:number,height:number)=>({left,right:left+width,top:0,bottom:height,width,height,x:left,y:0,toJSON(){return this;}});
 html.getBoundingClientRect=()=>box(0,400,26);bases[0].getBoundingClientRect=()=>{const scale=parseFloat(atom.style.fontSize)/19.36;return box(0,1200*scale,26*scale);};bases[1].getBoundingClientRect=()=>{const scale=parseFloat(atom.style.fontSize)/19.36;return box(1200*scale,1142*scale,26*scale);};
 try{const fits=fitPaperFlowMath(source,400,160);assert.equal(fits.length,1);assert.ok(fits[0].fontSize<4);assert.ok(bases[1].getBoundingClientRect().right<=399.51);assert.equal(source.textContent,'wide formula first partsecond part');assert.equal(source.querySelectorAll('.base').length,2);}
 finally{globalThis.getComputedStyle=previousStyle;dom.window.close();}
});

test('Tall math reserves the HTML wrapper height as well as its base paint height',()=>{
 const dom=new JSDOM('<div id="flow"><span class="katex"><span class="katex-html"><span class="base">tall table</span></span></span></div>'),source=dom.window.document.getElementById('flow') as HTMLElement,atom=source.querySelector<HTMLElement>('.katex')!,html=source.querySelector<HTMLElement>('.katex-html')!,base=source.querySelector<HTMLElement>('.base')!;atom.style.fontSize='19.36px';
 const previousStyle=globalThis.getComputedStyle;globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);
 const box=(width:number,height:number)=>({left:0,right:width,top:0,bottom:height,width,height,x:0,y:0,toJSON(){return this;}}),scale=()=>parseFloat(atom.style.fontSize)/19.36;
 html.getBoundingClientRect=()=>box(400,1800*scale());base.getBoundingClientRect=()=>box(80*scale(),1000*scale());
 try{const fits=fitPaperFlowMath(source,400,160);assert.equal(fits.length,1);assert.ok(html.getBoundingClientRect().height<=119.51);assert.equal(source.textContent,'tall table');}
 finally{globalThis.getComputedStyle=previousStyle;dom.window.close();}
});

test('Centred wide math leaves painted room inside a bordered viewport narrower than the source, including fractional glyph advances',()=>{
 const dom=new JSDOM('<div id="flow"><span class="katex-display"><span class="katex" style="font-size:19.36px"><span class="katex-html">'+Array.from({length:45},(_,i)=>`<span class="base">x_${i}</span>`).join('')+'</span></span></span></div>'),source=dom.window.document.getElementById('flow') as HTMLElement,atom=source.querySelector<HTMLElement>('.katex')!,html=source.querySelector<HTMLElement>('.katex-html')!,bases=[...html.querySelectorAll<HTMLElement>('.base')],text=source.textContent,previousStyle=globalThis.getComputedStyle;globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);
 const box=(left:number,width:number,height:number)=>({left,right:left+width,top:0,bottom:height,width,height,x:left,y:0,toJSON(){return this;}}),scale=()=>parseFloat(atom.style.fontSize)/19.36,advance=()=>Math.ceil(2342/45*scale()*64)/64;
 html.getBoundingClientRect=()=>box(0,400,26*scale());bases.forEach((base,i)=>{base.getBoundingClientRect=()=>box((400-advance()*45)/2+i*advance(),advance(),26*scale());});
 try{const fits=fitPaperFlowMath(source,400,160);assert.equal(fits.length,1);assert.ok(bases[0].getBoundingClientRect().left>=2);assert.ok(bases.at(-1)!.getBoundingClientRect().right<=398-2);assert.equal(source.textContent,text);assert.equal(source.querySelectorAll('.base').length,45);}
 finally{globalThis.getComputedStyle=previousStyle;dom.window.close();}
});

test('Editor content excludes toolbar and image controls without replacing original nodes or selection',()=>{
 const dom=new JSDOM('<div id="source"><div class="milkdown"><div class="milkdown-top-bar">Toolbar adornment</div><div class="ProseMirror" contenteditable="true"><p>Canonical before</p><div class="milkdown-image-block"><div class="image-wrapper"><div class="operation">Caption action</div><img alt="Original exact" src="data:image/png;base64,original"/></div><input class="caption-input" value="Title exact"/><div class="image-edit"><input value="Original exact"/></div></div><p>Canonical after</p></div></div></div>'),source=dom.window.document.getElementById('source') as HTMLElement,body=paperFlowContentElement(source),text=body.querySelector('p')!.firstChild!,image=body.querySelector('img')!,before=source.innerHTML,range=dom.window.document.createRange();range.setStart(text,4);range.collapse(true);const selection=dom.window.getSelection()!;selection.removeAllRanges();selection.addRange(range);
 assert.equal(body.className,'ProseMirror');assert.equal(body.contains(source.querySelector('.milkdown-top-bar')),false);assert.equal(image.closest(paperFlowChromeSelector),null);assert.ok(body.querySelector('.operation')!.closest(paperFlowChromeSelector));assert.ok(body.querySelector('.image-edit')!.closest(paperFlowChromeSelector));assert.equal(source.innerHTML,before);assert.equal(selection.anchorNode,text);assert.equal(selection.anchorOffset,4);assert.equal(image.alt,'Original exact');assert.equal(body.querySelector<HTMLInputElement>('.caption-input')!.value,'Title exact');dom.window.close();
});
