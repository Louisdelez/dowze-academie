/** Presentation foundation only: actual PaperPageContent/ReactMarkdown.
 * JSDOM has no native layout, canonical host, writer, IME or durable backend.
 * The separate actual Chromium assertion verifies ready PM integration. */
import {requireBoundedMountedCheck,mountedAuditPath} from './mounted-cleanup.mjs';
requireBoundedMountedCheck();
import {build} from 'vite';
import {JSDOM} from 'jsdom';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {join,dirname,isAbsolute,relative,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
const names=['Mask only the current page text reader while retaining DOM geometry continuation readers vectors and live audio controls'];
const report={kind:'paper-text-reader-paint-foundation',startedAt:new Date().toISOString(),declaredNames:names,groups:[],passed:0,failed:0,fullSuite:false,fatal:null,cleanupFinal:{status:'NOTRUN'},proofScope:'Real PaperPageContent/ReactMarkdown. Synthetic JSDOM and ResizeObserver; no PM/authority/geometry/IME/durability claim.'};
const inputs=new Set(['tests/run-paper-text-reader-paint.mjs','tests/paper-text-reader-paint-entry.tsx','tests/mounted-cleanup.mjs','src/components/PaperPageContent.tsx','src/components/PaperTextFlowView.tsx','src/components/PaperObjectVisual.tsx','src/lib/paperTextFlow.ts','src/lib/notebookDocument.ts','package.json']);
const sha=value=>createHash('sha256').update(value).digest('hex'),sources=async()=>Object.fromEntries(await Promise.all([...inputs].sort().map(async path=>[path,sha(await readFile(path))])));
const brief=error=>({name:error?.name??'Error',message:String(error?.message??error).split('\n')[0].slice(0,400)});
const globals=['window','document','HTMLElement','Element','Node','MutationObserver','navigator','getComputedStyle','requestAnimationFrame','cancelAnimationFrame','ResizeObserver','IS_REACT_ACT_ENVIRONMENT'];
const original=new Map(globals.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)])),oldEnv=process.env.NODE_ENV,operations=new Set(),timeouts=[],frames=new Map(),resizes=new Set();
let dom,m,out,root,container,frameSerial=0,stopped=false;
function tracked(value){const work=Promise.resolve(value);operations.add(work);void work.then(()=>operations.delete(work),()=>operations.delete(work));return work;}
async function bounded(value,label,ms=10000){const work=tracked(value);let timer;try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>{timeouts.push(label);reject(Error(label+': timeout; original remains followed'));},ms);})]);}finally{clearTimeout(timer);}}
async function drain(){const until=Date.now()+10000;while(operations.size){const left=until-Date.now();assert.ok(left>0,'Original presentation operations must settle before teardown');let timer;try{await Promise.race([Promise.allSettled([...operations]),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Original presentation work is not terminal')),left);})]);}finally{clearTimeout(timer);}}}
const tick=()=>new Promise(resolve=>setTimeout(resolve,15));
try{
 process.env.NODE_ENV='development';out=await mkdtemp(join(process.cwd(),'tests/.reader-paint-'));
 await bounded(build({configFile:false,plugins:[{name:'reader-paint-source-freeze',transform(_code,id){const path=id.split('?')[0];if(isAbsolute(path)&&path.startsWith(process.cwd()+sep)&&!path.includes(sep+'node_modules'+sep))inputs.add(relative(process.cwd(),path));}}],build:{ssr:'tests/paper-text-reader-paint-entry.tsx',outDir:out,copyPublicDir:false,minify:false,sourcemap:false,reportCompressedSize:false,rollupOptions:{preserveEntrySignatures:'strict',output:{entryFileNames:'entry.mjs'}}},logLevel:'error'}),'Build presentation foundation',50000);
 report.sourceHashes=await sources();dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://private-reader.invalid/'});
 for(const key of ['HTMLElement','Element','Node','MutationObserver'])Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:dom.window[key]});
 for(const[key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,getComputedStyle:dom.window.getComputedStyle.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true}))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
 Object.defineProperty(document,'fonts',{configurable:true,value:{ready:Promise.resolve()}});
 globalThis.requestAnimationFrame=callback=>{const id=++frameSerial;frames.set(id,setTimeout(()=>{frames.delete(id);callback(performance.now());},5));return id;};globalThis.cancelAnimationFrame=id=>{clearTimeout(frames.get(id));frames.delete(id);};
 globalThis.ResizeObserver=class{constructor(callback){this.callback=callback;resizes.add(this);}observe(){}disconnect(){resizes.delete(this);}};
 m=await bounded(import(pathToFileURL(join(out,'entry.mjs'))),'Import actual reader');container=document.createElement('main');document.body.append(container);root=m.createRoot(container);
 const doc=m.migratePaper('synthetic-reader-mask','Original **paragraph**.\n\nSecond paragraph.',null,'2026-10-15T10:00:00.000Z'),first=m.blankPage('first'),second=m.blankPage('continuation');doc.pages=[first,second];
 const text={...doc.objects[0],id:'constructor',pageId:first.id,audioAnchor:{sessionId:'session',time:0}};text.textFlow={schema:1,pageIds:[first.id,second.id],breaks:[0,300,600],source:m.textFlowFingerprint(text.markdown,text.width,text.height)};
 doc.assets=[{id:'audio',name:'Original.wav',mediaType:'audio/wav',size:1}];doc.audio=[{id:'session',assetId:'audio',name:'Original audio',duration:1,startedAt:1}];
 const vector={...text,id:'vector',kind:'shape',shape:'rectangle',textFlow:undefined,markdown:undefined,audioAnchor:undefined};doc.objects=[text,vector];assert.equal(m.isPaperDocument(doc),true);const originalDocument=structuredClone(doc);let audioCalls=0,notices=[];
 const render=async hidden=>{await bounded(m.act(async()=>{root.render(m.createElement('div',null,...doc.pages.map(page=>m.createElement('section',{key:page.id,'data-test-page':page.id},m.createElement(m.PaperPageContent,{document:doc,page,media:{accountId:'private-a',spaceId:'year'},current:()=>true,pixelWidth:800,hiddenTextObjectIds:page.id===first.id?hidden:[],onNotice:message=>notices.push(message),onAudio:()=>audioCalls++})))));await tick();}),'Actual reader render');};
 await render([]);const row=page=>[...container.querySelectorAll('[data-test-page]')].find(node=>node.dataset.testPage===page).querySelector('[data-object="constructor"]'),reader=row(first.id),continuation=row(second.id),textDOM=reader.querySelector('.paper-flow-source'),geometry=reader.getAttribute('style'),flowGeometry=reader.querySelector('.paper-flow-clip').getAttribute('style'),button=reader.querySelector('button');
 assert.ok(reader&&continuation&&textDOM&&button);const textBefore=textDOM.textContent;
 await render(['constructor','vector']);assert.equal(row(first.id),reader,'Masking preserves the exact reader wrapper');assert.equal(reader.querySelector('.paper-flow-source'),textDOM,'Masking retains the complete text DOM');assert.equal(textDOM.textContent,textBefore);assert.equal(reader.style.visibility,'hidden');assert.equal(row(second.id),continuation);assert.notEqual(getComputedStyle(continuation).visibility,'hidden','Other-page continuation reader stays painted');assert.notEqual(container.querySelector('[data-object="vector"]').style.visibility,'hidden','An unrelated vector can never be covered by a text lease');assert.equal(reader.querySelector('.paper-flow-clip').getAttribute('style'),flowGeometry,'Crop dimensions and offsets remain exact');
 assert.equal(button.style.visibility,'visible','Audio action remains visible through text paint coverage');await bounded(m.act(async()=>button.click()),'Original reader audio action');assert.equal(audioCalls,1);
 await render([]);assert.equal(row(first.id),reader);assert.equal(reader.getAttribute('style'),geometry,'Removing coverage restores the exact original wrapper styles');assert.equal(reader.querySelector('.paper-flow-source'),textDOM);assert.deepEqual(doc,originalDocument);assert.deepEqual(notices,[]);
 report.groups.push({name:names[0],status:'PASS'});report.passed++;
}catch(error){report.failed++;report.groups.push({name:names[0],status:'FAIL',error:brief(error)});report.fatal=report.sourceHashes?null:brief(error);process.exitCode=1;}
finally{
 try{await drain();if(root){await bounded(m.act(async()=>{root.unmount();await tick();}),'Unmount actual presentation');root=null;}await drain();assert.equal(resizes.size,0,'Actual flow effects must release every resize observer');assert.equal(frames.size,0,'Actual flow effects must release every scheduled frame');report.cleanupFinal={status:'PASS',pending:operations.size,roots:0,resizes:resizes.size,frames:frames.size};}catch(error){report.cleanupFinal={status:'FAIL',error:brief(error),pending:operations.size,roots:root?1:0};process.exitCode=1;}
 if(root||operations.size||resizes.size||frames.size){stopped=true;console.error('FATAL_STOP: original presentation work remains; globals/bundle/final report retained');process.exitCode=1;}
 if(!stopped){dom?.window.close();for(const[key,value]of original)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];if(oldEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=oldEnv;if(out)await rm(out,{recursive:true,force:true});}
}
if(!stopped){report.timeouts=timeouts;report.sourceHashesAfter=await sources();report.finalFreeze={status:JSON.stringify(report.sourceHashes)===JSON.stringify(report.sourceHashesAfter)?'PASS':'FAIL'};report.fullSuite=report.passed===1&&!report.failed&&!report.fatal&&!timeouts.length&&report.cleanupFinal.status==='PASS'&&report.finalFreeze.status==='PASS';report.finishedAt=new Date().toISOString();const output=mountedAuditPath('paper-text-reader-paint-foundation-20261015.json');await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');if(!report.fullSuite)process.exitCode=1;console.log(JSON.stringify({passed:report.passed,failed:report.failed,fullSuite:report.fullSuite,cleanup:report.cleanupFinal.status,report:output}));}
