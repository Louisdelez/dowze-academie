/** SOURCE ONLY. Root compiles the actual component/reducer entry before this run. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';
import {requireBoundedMountedCheck,mountedAuditPath} from './mounted-cleanup.mjs';
requireBoundedMountedCheck();
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),out=resolve('tests/.paper-built-in-templates-build'),manifest=JSON.parse(await readFile(out+'/build-manifest.json','utf8'));
assert.equal(manifest.kind,'N062-paper-built-in-templates-build-only');assert.equal(manifest.declaredGroups,3);assert.equal(manifest.bundle.path,out+'/paper-built-in-templates-entry.mjs');
const proof=async()=>Object.fromEntries(await Promise.all(Object.keys(manifest.sourceHashes).map(async path=>[path,hash(await readFile(path))])));
async function outputs(){for(const[name,row]of Object.entries(manifest.outputs)){assert.ok(name&&!name.includes('..')&&!name.startsWith('/')&&!name.includes('\\'));assert.equal(hash(await readFile(resolve(out,name))),row.sha256);}}
const originalTimeout=setTimeout,originalClear=clearTimeout,originalInterval=setInterval,originalClearInterval=clearInterval,old=new Map(),roots=new Set(),pending=new Set(),timers=new Set(),results=[];
let dom,m,passed=0,idbReads=0,terminal=false,reportSHA='',admissions=true;
const reportPath=mountedAuditPath('n062-built-in-paper-previews-20261017.json');
const install=(key,value)=>{if(!old.has(key))old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});};
const follow=promise=>{const original=Promise.resolve(promise);pending.add(original);void original.then(()=>pending.delete(original),()=>pending.delete(original));return original;};
async function bounded(promise,label,closing=false){assert.ok(admissions||closing);const original=follow(promise);let timer;try{return await Promise.race([original,new Promise((_,reject)=>{timer=originalTimeout(()=>{admissions=false;reject(Error(label+': original nonterminal'));},12000);})]);}finally{originalClear(timer);}}
const act=(label,work,closing=false)=>bounded(m.act(work),label,closing);
const group=(name,work)=>test(name,async()=>{try{await bounded(work(),name);assert.equal(pending.size,0);passed++;results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',code:error?.code??null});throw error;}});
before(async()=>{
 assert.deepEqual(await proof(),manifest.sourceHashes);await outputs();
 dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://qa.invalid/',pretendToBeVisual:true});
 for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLButtonElement','HTMLSelectElement','Element','Node','Event','HTMLDetailsElement','SVGElement','navigator'])install(key,key==='window'?dom.window:key==='document'?dom.window.document:dom.window[key]);
 install('IS_REACT_ACT_ENVIRONMENT',true);install('getComputedStyle',dom.window.getComputedStyle.bind(dom.window));
 if(!old.has('indexedDB'))old.set('indexedDB',Object.getOwnPropertyDescriptor(globalThis,'indexedDB'));Object.defineProperty(globalThis,'indexedDB',{configurable:true,get(){idbReads++;throw Error('N062 preview must not open IDB');}});
 install('setTimeout',(callback,delay,...args)=>{let id;id=originalTimeout((...values)=>{timers.delete(id);callback(...values);},delay,...args);timers.add(id);return id;});install('clearTimeout',id=>{timers.delete(id);originalClear(id);});
 install('setInterval',(callback,delay,...args)=>{const id=originalInterval(callback,delay,...args);timers.add(id);return id;});install('clearInterval',id=>{timers.delete(id);originalClearInterval(id);});
 m=await bounded(import(pathToFileURL(manifest.bundle.path).href),'Import actual settings/background/reducer entry');
});
after(async()=>{
 for(const owner of [...roots])await owner.close();await bounded(Promise.allSettled([...pending]),'Join all original work',true);assert.equal(roots.size,0);assert.equal(pending.size,0);assert.equal(timers.size,0);assert.equal(idbReads,0);
 assert.deepEqual(await proof(),manifest.sourceHashes);await outputs();dom?.window.close();for(const[key,value]of old){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);}
 const raw=JSON.stringify({kind:'N062-built-in-paper-previews',runtime:'ACTUAL',declaredGroups:3,passed,results,fullSuite:passed===3,cleanup:{roots:roots.size,pending:pending.size,timers:timers.size,idbReads},sourceFrozen:true,sourceHashes:manifest.sourceHashes,limits:['Actual shared components, React native controls and paper command/history; synchronous parent commit callback is a declared fixture adapter, not full Notebook/PM/storage/cloud','SSR viewBox/pattern/rotation and CSS source only; native 44px/computed layout/keyboard-arrow/browser export/PDF rendering remain unqualified','No personal-template gallery, original thumbnail, asset decode or N063 completeness claimed']},null,2)+'\n';await writeFile(reportPath,raw,{flag:'wx'});reportSHA=hash(raw);terminal=passed===3;
});
process.once('exit',code=>{if(code===0&&terminal)writeFileSync(reportPath+'.natural-exit.json',JSON.stringify({kind:'natural-node-exit',code,reportSHA256:reportSHA})+'\n',{flag:'wx'});});
function graph(){const doc=m.migratePaper('qa-built-in-paper','Original **text** preserved.',{},'2026-10-17T00:00:00.000Z'),page=doc.pages[0];Object.assign(page,{width:900,height:600,pattern:'grid',spacing:24,rotation:90,color:'#fff4dd'});doc.assets.push({id:'image-original',name:'Original.png',mediaType:'image/png',size:3},{id:'audio-original',name:'Original.webm',mediaType:'audio/webm',size:3});doc.audio.push({id:'recording',assetId:'audio-original',name:'Original.webm',duration:3,startedAt:1});doc.objects[0].audioAnchor={sessionId:'recording',time:1};doc.objects.push({id:'image',pageId:page.id,kind:'image',assetId:'image-original',crop:{x:.25,y:0,width:.5,height:1},x:12,y:200,width:120,height:80,rotation:90,z:2,locked:false,createdAt:1},{id:'ink',pageId:page.id,kind:'ink',points:[{x:0,y:0,time:0,pressure:.5},{x:20,y:10,time:1,pressure:1}],color:'#123456',strokeWidth:3,x:4,y:4,width:20,height:10,rotation:0,z:3,locked:false,createdAt:1},{id:'shape',pageId:page.id,kind:'shape',shape:'rectangle',fill:'#eeddcc',color:'#223344',x:15,y:15,width:80,height:60,rotation:270,z:4,locked:false,createdAt:1});assert.equal(m.isPaperDocument(doc),true);return doc;}
async function mounted(document){const host=window.document.createElement('div');host.className='paper-page-settings-fixture';window.document.body.append(host);const root=m.createRoot(host),f={host,root,document,history:m.emptyPaperHistory(),commands:[],notices:[],disabled:false,accept:true};
 const render=()=>root.render(m.createElement(m.PaperPageSettings,{document:f.document,page:f.document.pages[0],disabled:f.disabled,onCommit:command=>{if(!f.accept||f.disabled)return false;f.commands.push(command);f.history=m.recordPaperHistory(f.history,f.document);f.document=m.applyPaperCommand(f.document,command,'2026-10-17T00:00:01.000Z');render();return true;},onNotice:notice=>f.notices.push(notice)}));
 f.render=()=>act('Render real PageSettings',render);f.close=async()=>{if(!roots.has(f))return;await act('Unmount real PageSettings',()=>root.unmount(),true);host.remove();roots.delete(f);};roots.add(f);await f.render();const outer=host.querySelector('.paper-page-settings'),gallery=host.querySelector('.paper-built-in-templates');await act('Open and join actual native details toggles',async()=>{const opened=follow(Promise.all([outer,gallery].map(details=>new Promise(done=>details.addEventListener('toggle',done,{once:true})))));outer.open=true;gallery.open=true;await opened;});return f;
}
const button=(f,text)=>{const value=[...f.host.querySelectorAll('button')].find(x=>x.textContent===text);assert.ok(value);return value;};
async function choose(f,value){const radio=f.host.querySelector(`.paper-built-in-templates input[value="${value}"]`);assert.ok(radio);await act('Choose actual native paper radio',()=>radio.click());}
group('Four real vector backgrounds preserve exact source dimensions, rotation and spacing without writing or projecting annotations',async()=>{
 for(const rotation of [0,90,180,270]){const document=graph();document.pages[0].rotation=rotation;const original=structuredClone(document),markup=m.renderToStaticMarkup(m.createElement(m.PaperBuiltInTemplates,{document,page:document.pages[0],disabled:false,onCommit:()=>{throw Error('Readonly render wrote');},onNotice:()=>{throw Error('Readonly render notified');}})),box=window.document.createElement('div');box.innerHTML=markup;
 const choices=[...box.querySelectorAll('[data-paper-template-choice]')];assert.deepEqual(choices.map(x=>x.dataset.paperTemplateChoice),['standard','cornell','music','weekly']);
 for(const item of choices){const svg=item.querySelector('svg.paper-background');assert.ok(svg);assert.equal(svg.getAttribute('viewBox'),'0 0 900 600');assert.equal(svg.querySelector('pattern').getAttribute('width'),'24');assert.equal(svg.querySelector('pattern').getAttribute('height'),'24');assert.equal(svg.querySelector(':scope > g').getAttribute('transform'),({0:null,90:'translate(900 0) rotate(90)',180:'translate(900 600) rotate(180)',270:'translate(0 600) rotate(270)'})[rotation]);const sheet=item.querySelector('.paper-built-in-template-sheet');assert.equal(sheet.style.aspectRatio,'900 / 600');assert.equal(sheet.style.backgroundColor,'rgb(255, 244, 221)');}
 assert.ok(choices[1].textContent.includes('Synthèse'));assert.equal(choices[2].querySelectorAll('svg > g > g path').length,rotation===90||rotation===270?20:10);assert.deepEqual([...choices[3].querySelectorAll('svg text')].slice(1).map(x=>x.textContent),['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche']);assert.equal(box.querySelector('[data-object]'),null);assert.deepEqual(document,original);
 }
 assert.equal(idbReads,0);
});
group('Actual preview/Cancel write zero; Apply is one real page command and one undo while original ink/image/audio/text remain exact',async()=>{
 const original=graph(),before=structuredClone(original),f=await mounted(original);try{
  const oldSelect=f.host.querySelector('select[aria-label="Modèle de papier"]');assert.deepEqual([...oldSelect.options].map(x=>x.value),['standard','cornell','music','weekly']);
  await choose(f,'cornell');assert.equal(f.commands.length,0);assert.deepEqual(f.document,before);await act('Cancel real local choice',()=>button(f,'Annuler le choix').click());assert.equal(f.commands.length,0);assert.equal(button(f,'Appliquer ce modèle').disabled,true);
  await choose(f,'weekly');await act('Apply real existing page command',()=>button(f,'Appliquer ce modèle').click());assert.equal(f.commands.length,1);assert.deepEqual(f.commands,[{type:'update-page',page:{...before.pages[0],template:'weekly'}}]);assert.equal(f.history.past.length,1);const expected={...before,pages:[{...before.pages[0],template:'weekly'}],revision:before.revision+1,updatedAt:'2026-10-17T00:00:01.000Z'};assert.deepEqual(f.document,expected);assert.deepEqual(original,before);assert.equal(f.host.querySelector('.paper-built-in-templates img'),null);assert.equal(idbReads,0);
  const undone=m.travelPaperHistory(f.history,f.document,'undo');assert.ok(undone);assert.deepEqual(undone.document,{...before,revision:expected.revision+1,updatedAt:undone.document.updatedAt});assert.ok(Number.isFinite(Date.parse(undone.document.updatedAt)));assert.equal(undone.history.past.length,0);assert.equal(undone.history.future.length,1);
 }finally{await f.close();}
});
group('Page/document ABA, disabled and PDF retain existing refusal guards; a refused parent commit never creates history',async()=>{
 const original=graph(),before=structuredClone(original),f=await mounted(original);try{
  await choose(f,'cornell');f.document={...original,pages:[{...original.pages[0],spacing:32}]};await f.render();assert.equal(button(f,'Appliquer ce modèle').disabled,true);f.document=original;await f.render();assert.equal(button(f,'Appliquer ce modèle').disabled,true);assert.equal(f.commands.length,0);assert.deepEqual(f.document,before);
  await choose(f,'music');f.disabled=true;await f.render();await choose(f,'music');assert.equal(f.host.querySelector('.paper-built-in-templates fieldset').disabled,true);assert.equal(f.commands.length,0);f.disabled=false;f.accept=false;await f.render();assert.equal(button(f,'Appliquer ce modèle').disabled,true);await choose(f,'cornell');await act('Refuse actual parent commit',()=>button(f,'Appliquer ce modèle').click());assert.equal(f.commands.length,0);assert.equal(f.history.past.length,0);assert.deepEqual(f.document,before);
  const pdf={...original,assets:[...original.assets,{id:'pdf-original',name:'Original.pdf',mediaType:'application/pdf',size:3}],pages:[{...original.pages[0],pdf:{assetId:'pdf-original',pageNumber:1}}]};f.document=pdf;await f.render();assert.equal(f.host.querySelector('select[aria-label="Modèle de papier"]').disabled,true);assert.equal(f.host.querySelector('.paper-built-in-templates input'),null);assert.equal(f.host.querySelector('.paper-built-in-templates svg'),null);assert.ok(f.host.querySelector('.paper-built-in-templates').textContent.includes('Le fond et le format d’origine du PDF sont conservés.'));assert.equal(f.commands.length,0);assert.deepEqual(f.document,pdf);assert.equal(idbReads,0);
 }finally{await f.close();}
});
