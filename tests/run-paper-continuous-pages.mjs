import {mountedCleanup,requireBoundedMountedCheck,mountedAuditPath} from './mounted-cleanup.mjs';
requireBoundedMountedCheck();
const [{build},{JSDOM},{indexedDB},{default:assert},{mkdtemp,rm,readFile,writeFile},{pathToFileURL},{join}]=await Promise.all([import('vite'),import('jsdom'),import('fake-indexeddb'),import('node:assert/strict'),import('node:fs/promises'),import('node:url'),import('node:path')]);
const out=await mkdtemp(join(process.cwd(),'tests/.paper-continuous-pages-')),nativeBroadcastChannel=globalThis.BroadcastChannel,nativeSetTimeout=globalThis.setTimeout,nativeClearTimeout=globalThis.clearTimeout;
let m,dom,passed=0,failed=0,report;const proof=[],fixtures=new Set(),gates=[];
const tick=()=>new Promise(resolve=>nativeSetTimeout(resolve,15)),close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<=Math.max(1,Math.abs(expected))*1e-10,'Viewport coordinate differs');
const wait=async(check)=>{for(let i=0;i<180;i++){await m.act(tick);if(check())return;}throw Error('Continuous reader fixture did not settle');};
const gate=()=>{let resolve;const promise=new Promise(done=>resolve=done);gates.push(()=>resolve(new Blob([new Uint8Array([1,2,3])],{type:'application/pdf'})));return promise;};
const documentFor=(name,count=3)=>{const document=m.migratePaper('continuous-'+name,'',null);document.objects=[];document.pages=Array.from({length:count},(_,index)=>({id:name+'-'+index,width:800,height:index===1?1200:1000,pattern:'plain',color:'#ffffff',bookmark:false,rotation:0}));return document;};
const sourceUnchanged=(fixture)=>assert.ok(JSON.stringify(fixture.document)===fixture.before,'Canonical source must remain byte-equivalent');
const mount=async(document,{strict=false,...options}={})=>{
 const container=globalThis.document.createElement('div');globalThis.document.body.append(container);const root=m.createRoot(container),ref=m.createRef(),fixture={container,root,ref,document,before:JSON.stringify(document),allowed:true,live:true,anchors:[],selections:[],notices:[],media:{accountId:'qa-continuous-'+document.noteId,spaceId:'year'}};
 fixture.props={document,media:fixture.media,ownerKey:fixture.media.accountId+'|year|'+document.noteId,current:()=>fixture.allowed,mode:'continuous',zoom:1,selectedPageId:document.pages[0].id,onAnchorChange:anchor=>fixture.anchors.push(anchor),onSelectPage:id=>fixture.selections.push(id),onNotice:message=>fixture.notices.push(message),...options};
 fixture.render=async(patch={})=>{fixture.props={...fixture.props,...patch};await m.act(async()=>{const child=m.createElement(m.PaperContinuousPages,{...fixture.props,ref});root.render(strict?m.createElement(m.StrictMode,null,child):child);await tick();});};
 fixtures.add(fixture);await fixture.render();await wait(()=>ref.current&&container.querySelector('.paper-continuous-page-content'));return fixture;
};
const dispose=async fixture=>{fixture.allowed=false;if(fixture.live){await m.act(async()=>fixture.root.unmount());fixture.live=false;}fixture.container.remove();fixtures.delete(fixture);};
const fiberProps=(node,predicate)=>{assert.ok(node,'Reader canvas required');const property=Object.keys(node).find(key=>key.startsWith('__reactFiber$'));for(let fiber=node[property];fiber;fiber=fiber.return)if(predicate(fiber.memoizedProps))return fiber.memoizedProps;throw Error('Actual reader props unavailable');};
const cleanup=()=>mountedCleanup([['Readers',async()=>{for(const fixture of [...fixtures])await dispose(fixture);}],['Downloads',async()=>{for(const release of gates)release();gates.length=0;await m.act(tick);}],['Cache flush',()=>m.appStorage.flush()],['DOM readers',()=>assert.equal(document.querySelectorAll('.paper-continuous-pages').length,0)]]);
const group=async(name,work)=>{try{await work();passed++;proof.push({name,status:'PASS'});console.log(name+': PASS');}catch(error){failed++;proof.push({name,status:'FAIL',error:String(error.message).slice(0,1200)});console.error(name+': FAIL '+String(error.message).slice(0,1200));}finally{await cleanup();}};
try{
 process.env.NODE_ENV='development';globalThis.indexedDB=indexedDB;globalThis.BroadcastChannel=undefined;
 await build({configFile:false,build:{ssr:'tests/paper-continuous-pages-entry.tsx',outDir:out,copyPublicDir:false,minify:false,sourcemap:false,reportCompressedSize:false,rollupOptions:{preserveEntrySignatures:'strict',output:{entryFileNames:'continuous-pages.mjs'}}},logLevel:'error'});
 dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://qa.invalid/'});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,HTMLCanvasElement:dom.window.HTMLCanvasElement,Element:dom.window.Element,Node:dom.window.Node,NodeFilter:dom.window.NodeFilter,SVGElement:dom.window.SVGElement,MutationObserver:dom.window.MutationObserver,DOMParser:dom.window.DOMParser,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,getComputedStyle:dom.window.getComputedStyle.bind(dom.window),addEventListener:dom.window.addEventListener.bind(dom.window),removeEventListener:dom.window.removeEventListener.bind(dom.window),dispatchEvent:dom.window.dispatchEvent.bind(dom.window),devicePixelRatio:1,IS_REACT_ACT_ENVIRONMENT:true});
 Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});Object.defineProperty(document,'fonts',{configurable:true,value:{ready:Promise.resolve()}});
 Object.defineProperty(dom.window.HTMLElement.prototype,'clientHeight',{configurable:true,get(){return this.classList?.contains('paper-continuous-pages')?600:0;}});Object.defineProperty(dom.window.HTMLElement.prototype,'clientWidth',{configurable:true,get(){return this.classList?.contains('paper-continuous-pages')?900:0;}});
 globalThis.requestAnimationFrame=callback=>nativeSetTimeout(()=>callback(performance.now()),10);globalThis.cancelAnimationFrame=nativeClearTimeout;globalThis.ResizeObserver=class{observe(){}disconnect(){}};
 m=await import(pathToFileURL(join(out,'continuous-pages.mjs')));await m.appStorage.initialize(dom.window.localStorage,indexedDB);
 const style=document.createElement('style');style.textContent=await readFile(new URL('../src/components/paper-continuous-pages.css',import.meta.url),'utf8');document.head.append(style);
 await group('Readonly shared page readers never mount an editor or change canonical source',async()=>{
  const document=documentFor('readonly'),fixture=await mount(document);assert.equal(fixture.container.querySelector('[data-readonly]').getAttribute('data-readonly'),'true');assert.equal(fixture.container.querySelectorAll('input,textarea,[contenteditable="true"],.ProseMirror').length,0);assert.ok(fixture.container.querySelectorAll('.paper-continuous-page-content').length<=3);sourceUnchanged(fixture);
 });
 await group('Continuous-single mode switching and zoom retain canonical page anchors',async()=>{
  const document=documentFor('anchor'),fixture=await mount(document);await m.act(async()=>{assert.equal(fixture.ref.current.scrollToAnchor({pageId:document.pages[1].id,pageY:400,viewportOffset:100}),true);await tick();});
  await fixture.render({mode:'single'});const single=fixture.ref.current.captureAnchor();assert.equal(single.pageId,document.pages[1].id);close(single.pageY,400);close(single.viewportOffset,100);close(fixture.container.querySelector('.paper-continuous-pages').scrollTop,300);
  await fixture.render({mode:'continuous',zoom:2});const anchor=fixture.ref.current.captureAnchor();assert.equal(anchor.pageId,single.pageId);close(anchor.pageY,400);close(anchor.viewportOffset,100);close(fixture.ref.current.getProjection().logicalScroll,2724);sourceUnchanged(fixture);
 });
 await group('Same-owner immutable source replacement retains position while old handles are revoked',async()=>{
  const document=documentFor('replacement'),fixture=await mount(document);await m.act(async()=>{fixture.ref.current.scrollToAnchor({pageId:document.pages[1].id,pageY:400,viewportOffset:100});await tick();});const old=fixture.ref.current,next=structuredClone(document);next.revision++;
  await fixture.render({document:next});assert.equal(old.captureAnchor(),null);const anchor=fixture.ref.current.captureAnchor();assert.equal(anchor.pageId,document.pages[1].id);close(anchor.pageY,400);close(anchor.viewportOffset,100);sourceUnchanged(fixture);
 });
 await group('Two thousand long pages use a bounded physical window and parked pins without giant CSS spacers',async()=>{
  const document=documentFor('large',2000);document.pages=document.pages.map(page=>({...page,height:100000}));const fixture=await mount(document,{zoom:4,pinnedPageIds:[document.pages[0].id,document.pages.at(-1).id]});await m.act(async()=>{fixture.ref.current.scrollToAnchor({pageId:document.pages[1000].id,pageY:625,viewportOffset:0});await tick();});
  const projection=fixture.ref.current.getProjection();assert.ok(projection.originOffset>8000000);assert.ok(projection.physicalExtent<=8000000);assert.ok(projection.mountedPageIds.length<=5);assert.ok(fixture.container.querySelectorAll('.paper-continuous-page-content').length<=3);assert.ok([...fixture.container.querySelectorAll('[style]')].every(node=>!node.style.height||parseFloat(node.style.height)<=8000000));assert.equal(fixture.container.querySelectorAll('[data-page-parked="true"]').length,2);sourceUnchanged(fixture);
 });
 await group('Retained owner/source handles remain revoked through A-B-A',async()=>{
  const a=documentFor('a'),b=documentFor('b'),fixture=await mount(a),old=fixture.ref.current;await fixture.render({document:b,ownerKey:'other-owner',selectedPageId:b.pages[0].id});assert.equal(old.captureAnchor(),null);assert.equal(old.scrollToAnchor({pageId:a.pages[0].id,pageY:0,viewportOffset:0}),false);await fixture.render({document:a,ownerKey:fixture.props.media.accountId+'|year|'+a.noteId,selectedPageId:a.pages[0].id});assert.equal(old.captureAnchor(),null);assert.ok(fixture.ref.current.captureAnchor());sourceUnchanged(fixture);
 });
 await group('Private PDF reader callbacks and downloads remain revoked through API A-B-A and unmount',async()=>{
  const source=documentFor('api',1),asset={id:'pdf',serverId:'pdf-server',name:'Synthetic PDF',mediaType:'application/pdf',size:3};source.assets.push(asset);source.pages[0]={...source.pages[0],pdf:{assetId:'pdf',pageNumber:1}};
  let aReads=0,bReads=0;const download=gate(),a={downloadBlob:async()=>{aReads++;return download;}},b={downloadBlob:async()=>{bReads++;return download;}};const fixture=await mount(source,{media:{accountId:'qa-continuous-api',spaceId:'year',api:a}});await wait(()=>aReads>0);
  const old=fiberProps(fixture.container.querySelector('.paper-pdf-background canvas'),props=>props?.asset&&props.current&&props.onError);await fixture.render({media:{...fixture.props.media,api:b}});await wait(()=>bReads>0);assert.equal(old.current(),false);old.onError('Retained API error');await fixture.render({media:{...fixture.props.media,api:a}});assert.equal(old.current(),false);assert.equal(fixture.notices.length,0);await dispose(fixture);for(const release of gates)release();await m.act(tick);assert.equal(old.current(),false);assert.equal((await m.listLocalBlobs('qa-continuous-api','year')).length,0);sourceUnchanged(fixture);
 });
 await group('Observed visibility revocation hides the reader; a fresh parent authority never revives old handles',async()=>{
  const fixture=await mount(documentFor('visibility')),old=fixture.ref.current;fixture.allowed=false;await wait(()=>fixture.container.querySelectorAll('.paper-continuous-page-content').length===0);assert.equal(old.captureAnchor(),null);fixture.allowed=true;await fixture.render({current:()=>fixture.allowed});await wait(()=>fixture.container.querySelector('.paper-continuous-page-content'));assert.ok(fixture.ref.current.captureAnchor());assert.equal(old.captureAnchor(),null);sourceUnchanged(fixture);
 });
 await group('Readonly page selection changes the view and callback without issuing canonical commands',async()=>{
  const source=documentFor('selection'),fixture=await mount(source);const button=fixture.container.querySelector(`[data-continuous-page="${source.pages[1].id}"] button`);assert.ok(button);await m.act(async()=>{button.click();await tick();});assert.equal(fixture.selections.at(-1),source.pages[1].id);await fixture.render({selectedPageId:source.pages[1].id});assert.equal(fixture.ref.current.captureAnchor().pageId,source.pages[1].id);sourceUnchanged(fixture);
 });
 await group('StrictMode reconnect and unmount remove readers and leave retained handles inert',async()=>{
  const fixture=await mount(documentFor('strict'),{strict:true}),old=fixture.ref.current;assert.ok(old.captureAnchor());await dispose(fixture);assert.equal(old.captureAnchor(),null);assert.equal(old.getProjection(),null);sourceUnchanged(fixture);
 });
 report={date:'2026-10-14',passed,failed,groups:proof,testsExecuted:true,continuousReadonlyMounted:true,continuousEditableMounted:false,syntheticViewportBounds:true,realPDFRasterVerified:false,browserScrollbarLimitsVerified:false,nativeAndHardwareVerified:false};
}finally{
 let cleanupError;try{await mountedCleanup([['Fixtures',()=>m?cleanup():undefined],['Cache close',()=>m?.appStorage.close()],['Globals',()=>{globalThis.BroadcastChannel=nativeBroadcastChannel;}],['DOM',()=>dom?.window.close()],['Bundle',()=>rm(out,{recursive:true,force:true})]]);}catch(error){cleanupError=error;failed++;process.exitCode=1;}
 if(report){report.failed=failed;report.cleanupFinal={status:cleanupError?'FAIL':'PASS'};await writeFile(mountedAuditPath('continuous-readonly-mounted-tests-20261014.json'),JSON.stringify(report,null,2)+'\n');console.log(`Continuous reader groups: ${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;}
 if(cleanupError)throw cleanupError;
}
