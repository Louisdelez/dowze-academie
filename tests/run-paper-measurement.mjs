import {mountedCleanup,requireBoundedMountedCheck,mountedAuditPath} from './mounted-cleanup.mjs';
requireBoundedMountedCheck();
import {build} from 'vite';
import {JSDOM} from 'jsdom';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';

process.env.NODE_ENV='development';
const out=await mkdtemp(join(process.cwd(),'tests/.paper-measurement-'));
let m,dom,sequence=0,pointerTime=0,passed=0,failed=0;
const fixtures=new Set(),proof=[],tick=()=>new Promise(resolve=>setTimeout(resolve,10));
const propsOf=node=>{assert.ok(node,'The mounted control must exist');const key=Object.keys(node).find(value=>value.startsWith('__reactProps$'));assert.ok(key,'The actual React handler must exist');return node[key];};
const button=(f,label)=>[...f.host.querySelectorAll('button')].find(node=>node.getAttribute('aria-label')===label||node.textContent.trim()===label);
const field=(f,label)=>f.host.querySelector(`[aria-label="${label}"]`);
const click=async node=>{assert.ok(node,'The requested control must exist');await m.act(async()=>{node.click();await tick();});};
const change=async(node,value)=>m.act(async()=>propsOf(node).onChange({target:{value:String(value)}}));
const point=async(f,x,y)=>{await m.act(async()=>{propsOf(field(f,'Coordonnée X du point')).onChange({target:{value:String(x)}});propsOf(field(f,'Coordonnée Y du point')).onChange({target:{value:String(y)}});});await click(button(f,'Ajouter le point'));};
const wait=async(predicate,message='Measurement did not settle')=>{for(let i=0;i<160;i++){await m.act(tick);if(predicate())return;}throw Error(message);};
const measurements=f=>f.doc.objects.filter(object=>object.measurement);
const canonicalPoints=object=>object.points.map(point=>m.objectPoint(object,point));
const close=async f=>{if(!f.live)return;await m.act(async()=>f.root.unmount());f.live=false;f.host.remove();f.surfaceHost.remove();fixtures.delete(f);};
const cleanup=()=>mountedCleanup([['React fixtures',async()=>{for(const f of fixtures)await close(f);}],['Fixture DOM',()=>{document.querySelectorAll('[data-measurement-fixture]').forEach(node=>node.remove());}]]);
const group=async(name,work)=>{if(process.env.DOWZE_MEASUREMENT_ONLY&&!name.includes(process.env.DOWZE_MEASUREMENT_ONLY))return;try{await work();passed++;proof.push({name,status:'PASS'});console.log(name+': PASS');}catch(error){failed++;proof.push({name,status:'FAIL',error:String(error.message).slice(0,1500)});console.error(name+': FAIL '+String(error.message).slice(0,1500));}finally{await cleanup();}};

async function mount({strict=false,calibrated=false}={}){
 const id=++sequence,host=document.createElement('div'),surfaceHost=document.createElement('div'),svg=document.createElementNS('http://www.w3.org/2000/svg','svg');host.dataset.measurementFixture='true';surfaceHost.dataset.measurementFixture='true';svg.setAttribute('viewBox','0 0 794 1123');surfaceHost.append(svg);document.body.append(host,surfaceHost);
 const doc=m.migratePaper('qa-measurement-'+id,'',null,'2026-10-14T09:00:00Z');if(calibrated)doc.pages[0]={...doc.pages[0],calibration:m.createPaperMeasurementCalibration(400,100,'mm')};
 const f={host,surfaceHost,svg,root:m.createRoot(host),doc,allowed:true,live:true,commands:[],attempts:0,notices:[],draws:0,captures:new Set(),strict,beforeCommit:null,props:null};fixtures.add(f);
 svg.setPointerCapture=pointerId=>f.captures.add(pointerId);svg.releasePointerCapture=pointerId=>f.captures.delete(pointerId);surfaceHost.addEventListener('pointerdown',()=>f.draws++);
 f.context={ownershipKey:'qa-measurement-owner-'+id,generation:1,pageId:doc.pages[0].id,pageWidth:doc.pages[0].width,pageHeight:doc.pages[0].height,pageRotation:0,intent:'select',clientRect:{left:100,top:200,width:794,height:1123},clientToPage:{a:1,b:0,c:0,d:1,e:-100,f:-200}};
 f.props={media:{accountId:'qa-measurement-account-'+id,spaceId:'year',api:{}},ownerKey:f.context.ownershipKey,generation:1,document:doc,page:doc.pages[0],current:()=>f.allowed,getCurrent:()=>f.doc,getContext:()=>f.context,surfaceRef:{current:svg},onNotice:message=>f.notices.push(message),onCommit:(command,valid)=>{
  f.attempts++;if(!f.allowed||valid&&!valid())return false;if(f.beforeCommit)f.beforeCommit();if(valid&&!valid())return false;
  f.doc=m.applyPaperCommand(f.doc,command,'2026-10-14T10:00:00Z');assert.ok(m.isPaperDocument(f.doc),'The actual canonical command must validate');f.commands.push(command);f.renderSync();return true;
 }};
 f.renderSync=()=>{f.props={...f.props,document:f.doc,page:f.doc.pages.find(page=>page.id===f.context.pageId)??f.doc.pages[0]};const child=m.createElement(m.PaperMeasurementControls,f.props);f.root.render(f.strict?m.createElement(m.StrictMode,null,child):child);};
 f.render=async(patch={})=>{f.props={...f.props,...patch};await m.act(async()=>{f.renderSync();await tick();});};
 await f.render();await wait(()=>field(f,'Unité de mesure'));return f;
}
const pointer=async(f,type,options={})=>{const event=new dom.window.PointerEvent(type,{bubbles:true,cancelable:true,clientX:110,clientY:220,pointerId:1,pointerType:'mouse',isPrimary:true,button:0,buttons:type==='pointerup'?0:1,timeStamp:++pointerTime,...options});await m.act(async()=>f.svg.dispatchEvent(event));return event;};
const tap=async(f,clientX,clientY,options={})=>{await pointer(f,'pointerdown',{clientX,clientY,...options});await pointer(f,'pointerup',{clientX,clientY,...options,buttons:0});};
const calibrate=async f=>{await change(field(f,'Longueur connue'),10);await change(field(f,'Unité de référence'),'cm');await click(button(f,'Calibrer la page'));await point(f,50,50);await point(f,450,50);await click(button(f,'Terminer'));};

try{
 const entry=join(out,'entry.tsx');await writeFile(entry,"export {createElement,StrictMode,act} from 'react';\nexport {createRoot} from 'react-dom/client';\nexport {PaperMeasurementControls} from '../../src/components/PaperMeasurementControls';\nexport {migratePaper,applyPaperCommand,isPaperDocument} from '../../src/lib/notebookDocument';\nexport {createPaperMeasurementCalibration,paperMeasurementLength,paperMeasurementArea} from '../../src/lib/paperMeasurement';\nexport {objectPoint} from '../../src/lib/paperGeometry';\n");
 await build({configFile:false,build:{ssr:entry,outDir:out,emptyOutDir:false,copyPublicDir:false,minify:false,sourcemap:false,reportCompressedSize:false,rollupOptions:{preserveEntrySignatures:'strict',output:{entryFileNames:'measurement.mjs'}}},logLevel:'error'});
 dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://qa.invalid/'});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,SVGElement:dom.window.SVGElement,Element:dom.window.Element,Node:dom.window.Node,Event:dom.window.Event,KeyboardEvent:dom.window.KeyboardEvent,CustomEvent:dom.window.CustomEvent,getComputedStyle:dom.window.getComputedStyle.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true});
 dom.window.PointerEvent=class extends dom.window.MouseEvent{constructor(type,options={}){super(type,options);for(const key of ['pointerId','pointerType','isPrimary','width','height','pressure','tiltX','tiltY','twist','timeStamp'])if(options[key]!==undefined)Object.defineProperty(this,key,{value:options[key]});}};globalThis.PointerEvent=dom.window.PointerEvent;
 globalThis.requestAnimationFrame=callback=>setTimeout(()=>callback(performance.now()),10);globalThis.cancelAnimationFrame=clearTimeout;
 m=await import(pathToFileURL(join(out,'measurement.mjs')));const style=document.createElement('style');style.textContent=await readFile(new URL('../src/components/paper-measurement-controls.css',import.meta.url),'utf8');document.head.append(style);

 await group('Keyboard reference calibrates the current page and derives physical length and closed area from canonical ink',async()=>{
  const f=await mount(),before=structuredClone(f.doc);await calibrate(f);assert.equal(f.doc.pages[0].calibration.pageUnitsPerMm,4);assert.deepEqual(f.doc.objects,before.objects);assert.equal(f.commands[0].type,'update-page');
  await change(field(f,'Unité de mesure'),'cm');await click(button(f,'Mesurer une longueur'));await point(f,10,20);await point(f,130,180);assert.ok(field(f,'Mesure provisoire').textContent.includes('5 cm'));await click(button(f,'Terminer'));
  const length=measurements(f)[0];assert.deepEqual(length.measurement,{schema:1,kind:'length',unit:'cm'});assert.equal(m.paperMeasurementLength(canonicalPoints(length),f.doc.pages[0].calibration,'cm').value,5);assert.ok(!('value' in length.measurement));assert.deepEqual(Object.keys(length.points[0]).sort(),['time','x','y']);
  await click(button(f,'Mesurer une surface'));for(const p of [[100,100],[300,100],[300,200],[100,200]])await point(f,...p);await click(button(f,'Terminer'));
  const area=measurements(f)[1],first=area.points[0],last=area.points.at(-1);assert.equal(first.x,last.x);assert.equal(first.y,last.y);assert.ok(Number.isFinite(last.time)&&last.time>=area.points.at(-2).time);assert.equal(m.paperMeasurementArea(canonicalPoints(area),f.doc.pages[0].calibration,'cm').value,12.5);assert.ok(f.host.querySelector('[aria-label="Mesures de la page"]').textContent.includes('12,5 cm²'));
  assert.equal(getComputedStyle(button(f,'Calibrer la page')).minHeight,'44px');assert.equal(f.captures.size,0);
 });
 await group('Actual SVG capture projects the pointerdown origin through the supplied inverse rotated zoom matrix and stops drawing only during a measure',async()=>{
  const f=await mount();await tap(f,110,220);assert.equal(f.draws,1,'Inactive controls must leave page drawing events alone');
  f.context={...f.context,clientToPage:{a:0,b:-.5,c:.5,d:0,e:-50,f:110}};await click(button(f,'Mesurer une longueur'));await tap(f,100,200);await tap(f,100,400);assert.equal(f.draws,1,'The active measure must stop the page drawing handler');await click(button(f,'Terminer'));
  const object=measurements(f)[0];assert.equal(object.x,50);assert.equal(object.y,60);assert.equal(object.width,100);assert.equal(object.height,0);assert.equal(m.paperMeasurementLength(canonicalPoints(object)).value,100);assert.equal(f.captures.size,0);await tap(f,110,220);assert.equal(f.draws,2);
 });
 await group('Physical units require calibration and invalid zero length or crossing polygons cannot commit',async()=>{
  const f=await mount();assert.equal([...field(f,'Unité de mesure').options].find(option=>option.value==='mm').disabled,true);await change(field(f,'Unité de mesure'),'mm');await click(button(f,'Mesurer une longueur'));assert.ok(!button(f,'Terminer'));assert.equal(f.commands.length,0);assert.ok(f.notices.at(-1).includes('Calibrez'));
  await change(field(f,'Unité de mesure'),'page');await click(button(f,'Mesurer une longueur'));await point(f,20,20);await point(f,20,20);await click(button(f,'Terminer'));assert.equal(f.commands.length,0);await click(button(f,'Annuler'));
  await click(button(f,'Mesurer une surface'));for(const p of [[10,10],[110,110],[10,110],[110,10]])await point(f,...p);await click(button(f,'Terminer'));assert.equal(f.commands.length,0);assert.ok(f.host.querySelector('.paper-measurement-notice').textContent.includes('croisement'));
 });
 await group('Recalibration derives new labels and removing calibration preserves every measured ink geometry',async()=>{
  const f=await mount({calibrated:true});await change(field(f,'Unité de mesure'),'mm');await click(button(f,'Mesurer une longueur'));await point(f,10,10);await point(f,410,10);await click(button(f,'Terminer'));const original=structuredClone(measurements(f));assert.ok(f.host.querySelector('[aria-label="Mesures de la page"]').textContent.includes('100 mm'));
  await change(field(f,'Longueur connue'),200);await click(button(f,'Calibrer la page'));await point(f,10,10);await point(f,410,10);await click(button(f,'Terminer'));assert.equal(f.doc.pages[0].calibration.pageUnitsPerMm,2);assert.ok(f.host.querySelector('[aria-label="Mesures de la page"]').textContent.includes('200 mm'));assert.deepEqual(measurements(f),original);
  await click(button(f,'Réinitialiser la calibration'));assert.equal(f.doc.pages[0].calibration,undefined);assert.deepEqual(measurements(f),original);assert.equal(field(f,'Unité de mesure').value,'page');assert.ok(f.host.querySelector('[aria-label="Mesures de la page"]').textContent.includes('Non calibré'));assert.equal(measurements(f)[0].measurement.unit,'mm');assert.ok(!f.host.querySelector('[aria-label="Mesures de la page"]').textContent.includes('200 mm'));
 });
 await group('A typed closing vertex is normalized to one closing segment and no synthetic sensor fields are stored',async()=>{
  const f=await mount();await click(button(f,'Mesurer une surface'));for(const p of [[10,10],[110,10],[110,110],[10,110],[10,10]])await point(f,...p);await click(button(f,'Terminer'));const object=measurements(f)[0];assert.equal(object.points.length,5);assert.equal(m.paperMeasurementArea(canonicalPoints(object)).value,10000);for(const point of object.points)assert.deepEqual(Object.keys(point).sort(),['time','x','y']);
 });
 await group('Exact revision calibration owner API and viewport changes revoke a draft and retained controls',async()=>{
  for(const kind of ['revision','calibration','owner','api','viewport','generation']){
   const f=await mount();await click(button(f,'Mesurer une longueur'));await point(f,10,10);await point(f,110,10);const oldFinish=propsOf(button(f,'Terminer')).onClick,oldAdd=propsOf(button(f,'Ajouter le point')).onClick,oldBegin=propsOf(button(f,'Calibrer la page')).onClick;
   if(kind==='revision')f.doc=m.applyPaperCommand(f.doc,{type:'update-page',page:{...f.doc.pages[0],color:'#abcdef'}});
   if(kind==='calibration')f.doc=m.applyPaperCommand(f.doc,{type:'update-page',page:{...f.doc.pages[0],calibration:m.createPaperMeasurementCalibration(400,100,'mm')}});
   if(kind==='owner'){f.context={...f.context,ownershipKey:'other-owner'};await f.render({ownerKey:'other-owner',media:{...f.props.media,accountId:'other-account'}});}
   if(kind==='api')await f.render({media:{...f.props.media,api:{}}});
   if(kind==='viewport')f.context={...f.context,clientRect:{...f.context.clientRect,left:120}};
   if(kind==='generation'){f.context={...f.context,generation:2};await f.render({generation:2});}
   await m.act(async()=>{oldFinish();oldAdd();});await wait(()=>!button(f,'Terminer'),'Revocation must clear the old draft');assert.equal(measurements(f).length,0);assert.equal(f.commands.length,0);assert.equal(f.captures.size,0);
   if(['owner','api','generation'].includes(kind)){await m.act(async()=>oldBegin());assert.ok(!button(f,'Terminer'),'A retained mode control from another lease must be refused');}
   await close(f);
  }
 });
 await group('The commit guard is rechecked after a caller flush and cannot overwrite its changed canonical graph',async()=>{
  const f=await mount();await click(button(f,'Mesurer une longueur'));await point(f,10,10);await point(f,110,10);f.beforeCommit=()=>{f.doc=m.applyPaperCommand(f.doc,{type:'update-page',page:{...f.doc.pages[0],color:'#fedcba'}});};await click(button(f,'Terminer'));assert.equal(f.attempts,1);assert.equal(f.commands.length,0);assert.equal(f.doc.pages[0].color,'#fedcba');assert.equal(measurements(f).length,0);
 });
 await group('Old draft controls cannot finish cancel or add to a replacement draft on the same page',async()=>{
  const f=await mount();await click(button(f,'Mesurer une longueur'));await point(f,10,10);await point(f,110,10);const oldFinish=propsOf(button(f,'Terminer')).onClick,oldAdd=propsOf(button(f,'Ajouter le point')).onClick,oldCancel=propsOf(button(f,'Annuler')).onClick;
  await click(button(f,'Annuler'));await click(button(f,'Mesurer une surface'));for(const p of [[10,10],[110,10],[10,110]])await point(f,...p);await m.act(async()=>{oldFinish();oldAdd();oldCancel();});assert.equal(measurements(f).length,0);assert.ok(button(f,'Terminer'));await click(button(f,'Terminer'));assert.equal(measurements(f).length,1);assert.equal(measurements(f)[0].measurement.kind,'area');
 });
 await group('Recent real pen palms two finger gestures and touch swipes are ignored without manufacturing measurement samples',async()=>{
  const f=await mount();await tap(f,110,220,{pointerType:'pen',pointerId:9,timeStamp:10});await click(button(f,'Mesurer une longueur'));
  await tap(f,120,230,{pointerType:'touch',pointerId:11,timeStamp:100,width:8,height:8});assert.ok(f.host.querySelector('.paper-measurement-draft').textContent.includes('0 / 128'));
  await pointer(f,'pointerdown',{pointerType:'touch',pointerId:11,timeStamp:1000});await pointer(f,'pointerdown',{pointerType:'touch',pointerId:12,isPrimary:false,timeStamp:1001});await pointer(f,'pointerup',{pointerType:'touch',pointerId:11,timeStamp:1002});await pointer(f,'pointerup',{pointerType:'touch',pointerId:12,isPrimary:false,timeStamp:1003});assert.ok(f.host.querySelector('.paper-measurement-draft').textContent.includes('0 / 128'));
  await pointer(f,'pointerdown',{pointerType:'touch',pointerId:11,timeStamp:2000});await pointer(f,'pointermove',{pointerType:'touch',pointerId:11,clientX:140,timeStamp:2001});await pointer(f,'pointerup',{pointerType:'touch',pointerId:11,clientX:140,timeStamp:2002});assert.ok(f.host.querySelector('.paper-measurement-draft').textContent.includes('0 / 128'));
  await tap(f,110,220,{pointerType:'touch',pointerId:11,timeStamp:3000});await tap(f,210,220,{timeStamp:4000});await click(button(f,'Terminer'));assert.equal(measurements(f)[0].points.length,2);assert.equal(m.paperMeasurementLength(canonicalPoints(measurements(f)[0])).value,100);assert.equal(f.captures.size,0);
 });
 await group('An ignored palm never releases the genuine pen contact that owns a measurement point',async()=>{
  const f=await mount();await click(button(f,'Mesurer une longueur'));await pointer(f,'pointerdown',{pointerType:'pen',pointerId:21,timeStamp:1000});assert.equal(f.captures.size,1);
  await pointer(f,'pointerdown',{pointerType:'touch',pointerId:22,width:40,height:40,timeStamp:1001});assert.equal(f.captures.size,1,'Ignoring a palm must preserve the owning pen capture');await pointer(f,'pointerup',{pointerType:'touch',pointerId:22,timeStamp:1002});await pointer(f,'pointerup',{pointerType:'pen',pointerId:21,timeStamp:1003});assert.ok(f.host.querySelector('.paper-measurement-draft').textContent.includes('1 / 128'));
  await tap(f,210,220,{timeStamp:2000});await click(button(f,'Terminer'));assert.equal(measurements(f)[0].points.length,2);assert.equal(m.paperMeasurementLength(canonicalPoints(measurements(f)[0])).value,100);assert.equal(f.captures.size,0);
 });
 await group('Point entry is bounded to 128 and cancellation or readonly controls cannot mutate the canonical document',async()=>{
  const f=await mount();await click(button(f,'Mesurer une longueur'));for(let index=0;index<128;index++)await point(f,index,50);await point(f,129,50);assert.ok(f.host.querySelector('.paper-measurement-draft').textContent.includes('128 / 128'));await click(button(f,'Terminer'));assert.equal(measurements(f)[0].points.length,128);
  const before=structuredClone(f.doc);await click(button(f,'Calibrer la page'));await point(f,10,10);const oldFinish=propsOf(button(f,'Terminer')).onClick;await f.render({disabled:true});await m.act(async()=>oldFinish());assert.deepEqual(f.doc,before);assert.equal(f.host.querySelector('fieldset').disabled,true);assert.ok(!button(f,'Terminer'));assert.equal(f.host.querySelectorAll('[aria-label="Mesures de la page"] li').length,1);
 });
 await group('StrictMode owns one capture and unmount revokes retained controls removes its overlay and releases every pointer',async()=>{
  const f=await mount({strict:true});await click(button(f,'Mesurer une longueur'));await tap(f,110,220);assert.ok(f.host.querySelector('.paper-measurement-draft').textContent.includes('1 / 128'));assert.equal(f.svg.querySelectorAll('.paper-measurement-preview').length,1);const oldFinish=propsOf(button(f,'Terminer')).onClick;
  await pointer(f,'pointerdown',{pointerId:17,clientX:210});assert.equal(f.captures.size,1);await m.act(async()=>f.root.unmount());f.live=false;assert.equal(f.captures.size,0);assert.equal(f.svg.querySelectorAll('.paper-measurement-preview').length,0);await m.act(async()=>oldFinish());assert.equal(f.commands.length,0);f.host.remove();f.surfaceHost.remove();fixtures.delete(f);
 });
 const report={date:'2026-10-14',passed,failed,groups:proof,canonicalCommandsUseActualModel:true,pointerEventsAndCaptureSynthetic:true,physicalPenVerified:false,physicalScaleVerified:false,keyboardEntryUsesActualReactHandlers:true,parentNotebookIntegrationVerified:false};
 await writeFile(mountedAuditPath('measurement-mounted-tests-20261014.json'),JSON.stringify(report,null,2)+'\n');console.log(`Measurement groups: ${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
}finally{await mountedCleanup([['React fixtures',()=>m&&dom?cleanup():undefined],['DOM close',()=>dom?.window.close()],['Generated bundle',()=>rm(out,{recursive:true,force:true})]]);}
