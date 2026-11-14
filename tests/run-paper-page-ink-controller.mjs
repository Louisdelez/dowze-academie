import {mountedCleanup,requireBoundedMountedCheck,mountedAuditPath} from './mounted-cleanup.mjs';
requireBoundedMountedCheck();
const [{build},{JSDOM},{default:assert},{mkdtemp,rm,writeFile},{pathToFileURL},{join}]=await Promise.all([import('vite'),import('jsdom'),import('node:assert/strict'),import('node:fs/promises'),import('node:url'),import('node:path')]);
const out=await mkdtemp(join(process.cwd(),'tests/.paper-page-ink-controller-')),nativeTimeout=globalThis.setTimeout,nativeClear=globalThis.clearTimeout;
const names=['window','document','HTMLElement','Element','SVGElement','Node','Event','CustomEvent','navigator','requestAnimationFrame','cancelAnimationFrame','ResizeObserver','IS_REACT_ACT_ENVIRONMENT'],originals=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
const declaredNames=[
 "First contact B pins and captures its first point before toolbar A-to-B, retaining the SVG and both endpoints",
 "A render, revision seam and changed preset keep the style and whole-eraser option captured at first contact",
 "Observed owner, API, permission and canonical page geometry transitions revoke old captures through A-B-A",
 "An externally observed permission loss stays revoked without requiring a render; stable absent API remains editable",
 "True scroll, resize and zoom surface changes cancel; a compensated rebase with unchanged CTM preserves the contact",
 "Lost capture, cancellation and wrong-pointer events release only the owned contact; normal release does not cancel finish",
 "Async stroke settlement is visible before parent callbacks, retains its pin and refuses another contact",
 "An accepted laser keeps its endpoint preview for 600 real milliseconds after settlement without publishing an object or retaining a pin",
 "A new contact cancels the retained laser timer so the old expiry cannot erase a newer captured preview",
 "Refused lasers never linger and owner, API, tool, permission, geometry, cancellation and deactivation revoke an accepted laser visual",
 "Eraser work crosses a macrotask while its pin and settlement remain tracked",
 "An old completed guard cannot cancel or unpin a new contact on the same page controller",
 "A replaced host keeps its pending old pin until settlement and its old finally never releases the new host pin",
 "Strict replay remains usable and unmount revokes callbacks while awaiting the tracked child job without dropping its pin",
 "Rejected child work settles once and a stale scope never publishes its error into the replacement view",
 "An OS interrupted ink prefix stays pinned through asynchronous preservation with raw sensors and its held style",
 "A failed interruption stays blocked through owner ABA and explicit retry uses the old callback and exact manifest",
 "Explicit navigation and non-ink interruptions cannot become recovered ink or deferred commands",
 "True unmount retains an admitted ink prefix until the old-owner recovery callback confirms consumption",
 "Checkpoint cadence coalesces one child and cancel drains it before the final original-owner receipt",
 "Normal finish also waits the pending prefix before invoking a single canonical submission",
 "A failed checkpoint falls back to the full raw prefix and failed recovery remains blocked until exact retry",
 "A refused or rejected completed submission keeps its full raw stroke pinned until recovery confirms consumption",
 "Unadmitted capture failure with an asynchronous discard can fail and retry without leaking admission or its pending counter",
 "Incremental checkpoints bound each copy and finish drains only acknowledged suffixes before one canonical submission",
 "A revoked operation drains its final suffix through the captured old callback and keeps its pin through recovery",
 "Missing or mismatched chunk acknowledgements never advance a cursor or release full raw recovery early",
 "A late prefix rejection during finish retains the complete raw endpoint and exact retry after failed conservation",
 "An empty incremental interval resumes polling and never resends a confirmed prefix",
 "The chunk route takes precedence over legacy snapshots and non-authoring gestures never emit recovery chunks"
];
const startedNames=new Set(),cleanupFailures=[];
const fixtures=new Set(),gates=new Set(),observers=new Set(),rafTimers=new Map(),proof=[];let dom,m,rafSequence=0,sequence=0,passed=0,failed=0,mountedAny=false,fatal,cleanupError;
const tick=()=>new Promise(resolve=>nativeTimeout(resolve,15)),wait=async check=>{for(let index=0;index<100;index++){await m.act(tick);if(check())return;}throw Error('Page controller fixture did not settle');};
const gate=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;}),value={promise,resolve,reject};gates.add(value);return value;};
const sample=(patch={})=>({pointerId:9,pointerType:'pen',isPrimary:true,clientX:120,clientY:230,timeStamp:100,pressure:.2,tiltX:10,tiltY:-20,twist:45,button:0,buttons:1,width:1,height:1,...patch});
const pointer=(type,patch={})=>{const value=sample(patch),event=new dom.window.MouseEvent(type,{bubbles:true,cancelable:true,clientX:value.clientX,clientY:value.clientY,button:value.button,buttons:value.buttons});for(const [name,item] of Object.entries(value))Object.defineProperty(event,name,{configurable:true,value:item});return event;};
const mount=async({strict=false,onStroke,onAccepted,onActivity,onCancelled,onCheckpoint,onCheckpointChunk,...patch}={})=>{
 const container=document.createElement('div');document.body.append(container);const root=m.createRoot(container),ref=m.createRef(),fixture={container,root,ref,strict,live:true,allowed:true,pins:new Map(),captures:new Map(),log:[],accepted:[],strokes:[],activities:[],settlements:[],notices:[],controllers:new Set(),box:{left:100,top:200,width:400,height:550},published:0,releases:0,starts:0};
 fixture.options={pageId:'page-B',page:{id:'page-B',width:800,height:1100,rotation:0},ownerKey:`qa-page-controller-${++sequence}`,generation:1,api:{},writable:true,current:()=>fixture.allowed,intent:'pen',style:{color:'#2855ce',width:2,opacity:.4,strokeStyle:'solid'},wholeEraser:false,fingerInk:true,
  pinPage:pin=>{assert.equal(fixture.pins.has(pin.token),false);fixture.pins.set(pin.token,pin);fixture.log.push('pin');return()=>{assert.equal(fixture.pins.delete(pin.token),true,'Only the original pin handle may release its token');fixture.releases++;fixture.log.push('unpin');};},
  onAccepted:(submission,event)=>{fixture.accepted.push(submission);fixture.log.push('accepted');onAccepted?.(fixture,submission,event);},
  onStroke:submission=>{fixture.starts++;fixture.strokes.push(submission);fixture.log.push('stroke');if(onStroke)return onStroke(fixture,submission);if(!submission.current())return false;fixture.published++;return true;},
  onActivity:activity=>{fixture.activities.push(activity);onActivity?.(fixture,activity);},onSettled:settlement=>fixture.settlements.push(settlement),onCancelled:(result,source,interruption)=>{fixture.log.push('cancel:'+result.reason);return onCancelled?.(fixture,result,source,interruption);},onCheckpoint:onCheckpoint?checkpoint=>onCheckpoint(fixture,checkpoint):undefined,onCheckpointChunk:onCheckpointChunk?checkpoint=>onCheckpointChunk(fixture,checkpoint):undefined,onNotice:message=>fixture.notices.push(message),...patch};
 fixture.render=async(change={})=>{fixture.options={...fixture.options,...change};await m.act(async()=>{const child=m.createElement(m.PaperPageInkControllerRecipe,{...fixture.options,controllerRef:ref,toolbarPage:'page-A'});root.render(strict?m.createElement(m.StrictMode,null,child):child);await tick();});if(ref.current){fixture.controllers.add(ref.current);mountedAny=true;}};
 fixture.svg=()=>container.querySelector('svg[data-controller-page]');
 fixture.dispatch=(type,change={},coalesced)=>{const node=fixture.svg();assert.ok(node,'The dedicated page SVG must exist');const event=pointer(type,change);if(coalesced)Object.defineProperty(event,'getCoalescedEvents',{value:()=>coalesced});
  // Browser seam: lostpointercapture is delivered after the capture flag is
  // removed. Keeping it set would synthesize a spurious loss, correctly ignored.
  if(type==='lostpointercapture')fixture.captures.get(node)?.delete(event.pointerId);
  node.dispatchEvent(event);return event;};
 fixture.emit=async(type,change={},coalesced)=>{let event;await m.act(async()=>{event=fixture.dispatch(type,change,coalesced);await tick();});return event;};
 fixture.resize=()=>{for(const observer of observers)if(observer.nodes.has(fixture.svg()))observer.callback([],observer);};
 fixtures.add(fixture);await fixture.render();
 fixture.svg().fixture=fixture;return fixture;
};
const bind=(fixture)=>{fixture.svg().fixture=fixture;};
const dispose=async fixture=>{fixture.allowed=false;if(fixture.live){await m.act(async()=>fixture.root.unmount());fixture.live=false;}fixture.container.remove();};
const cleanFixtures=()=>mountedCleanup([
 ['Revoke scopes',()=>{for(const fixture of fixtures)fixture.allowed=false;}],
 ['Release child jobs',()=>{for(const value of gates)value.resolve();gates.clear();}],
 ['Unmount controllers',async()=>{for(const fixture of fixtures)await dispose(fixture);}],
 ['Retry failed synthetic consumers',async()=>{for(const fixture of fixtures)for(const controller of fixture.controllers)if(controller.getState().phase==='blocked')await m.act(async()=>{await controller.retryCancellation();});}],
 ['Tracked settlements',async()=>{await Promise.all([...fixtures].flatMap(fixture=>[...fixture.controllers].map(controller=>controller.whenSettled())));}],
 ['Pins and captures',()=>{for(const fixture of fixtures){assert.equal(fixture.pins.size,0,'Every original pin must settle before cleanup');for(const values of fixture.captures.values())assert.equal(values.size,0,'Pointer capture must be released');}fixtures.clear();}],
 ['Page hosts',()=>assert.equal(document.querySelectorAll('[data-page-controller-recipe]').length,0)],
]);
const briefError=error=>({message:String(error?.message??error).slice(0,1200),causes:Array.from(error?.errors??[]).slice(0,4).map(value=>({message:String(value?.message??value).slice(0,600),causes:Array.from(value?.errors??[]).slice(0,3).map(cause=>String(cause?.message??cause).slice(0,400))}))});
const group=async(name,work)=>{
 if(!declaredNames.includes(name)||startedNames.has(name))throw Error('Undeclared or repeated mounted group: '+name);startedNames.add(name);
 try{await work();passed++;proof.push({name,status:'PASS'});console.log(name+': PASS');}
 catch(error){failed++;proof.push({name,status:'FAIL',error:String(error?.message??error).slice(0,1200)});console.error(name+': FAIL '+String(error?.message??error).slice(0,1200));}
 finally{try{await cleanFixtures();}catch(error){cleanupFailures.push({group:name,...briefError(error)});throw error;}}
};
try{
 process.env.NODE_ENV='development';await build({configFile:false,build:{ssr:'tests/paper-page-ink-controller-entry.tsx',outDir:out,copyPublicDir:false,minify:false,sourcemap:false,reportCompressedSize:false,rollupOptions:{preserveEntrySignatures:'strict',output:{entryFileNames:'page-ink-controller.mjs'}}},logLevel:'error'});
 dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://qa.invalid/'});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,SVGElement:dom.window.SVGElement,Node:dom.window.Node,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,IS_REACT_ACT_ENVIRONMENT:true});Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});
 globalThis.requestAnimationFrame=callback=>{const id=++rafSequence,timer=nativeTimeout(()=>{rafTimers.delete(id);callback(performance.now());},10);rafTimers.set(id,timer);return id;};globalThis.cancelAnimationFrame=id=>{const timer=rafTimers.get(id);if(timer){nativeClear(timer);rafTimers.delete(id);}};
 globalThis.ResizeObserver=class{constructor(callback){this.callback=callback;this.nodes=new Set();observers.add(this);}observe(node){this.nodes.add(node);}disconnect(){this.nodes.clear();observers.delete(this);}};
 // Synthetic SVG/Pointer/CTM seams: stable page B geometry, captured real sample fields,
 // mock capture ownership and explicit surface movement. No native device or raster evidence.
 dom.window.SVGElement.prototype.getBoundingClientRect=function(){const box=this.fixture?.box??{left:100,top:200,width:400,height:550};return new dom.window.DOMRect(box.left,box.top,box.width,box.height);};
 dom.window.SVGElement.prototype.getScreenCTM=function(){return {inverse:()=>{const box=this.fixture?.box??{left:100,top:200,width:400,height:550},page=this.fixture?.options.page??{width:800,height:1100},a=page.width/box.width,d=page.height/box.height;return {a,b:0,c:0,d,e:-box.left*a,f:-box.top*d};}};};
 dom.window.Element.prototype.setPointerCapture=function(id){const fixture=this.fixture;assert.ok(fixture);const values=fixture.captures.get(this)??new Set();fixture.captures.set(this,values);values.add(id);fixture.log.push('capture');};
 dom.window.Element.prototype.hasPointerCapture=function(id){return this.fixture?.captures.get(this)?.has(id)??false;};
 dom.window.Element.prototype.releasePointerCapture=function(id){const fixture=this.fixture;fixture?.captures.get(this)?.delete(id);fixture?.log.push('release-capture');this.dispatchEvent(pointer('lostpointercapture',{pointerId:id,timeStamp:500,buttons:0}));};
 m=await import(pathToFileURL(join(out,'page-ink-controller.mjs')));
 await group('First contact B pins and captures its first point before toolbar A-to-B, retaining the SVG and both endpoints',async()=>{
  const fixture=await mount({onAccepted:(f,submission)=>{assert.equal(f.container.querySelector('[data-toolbar-page]').textContent,'page-A');assert.equal(f.ref.current.getState().phase,'capturing');assert.equal(f.svg().hasPointerCapture(9),true);assert.deepEqual(submission.stroke.points.map(point=>[point.x,point.y]),[[40,60]]);}}),node=fixture.svg();
  await fixture.emit('pointerdown');assert.deepEqual(fixture.log.slice(0,3),['pin','capture','accepted']);assert.equal(fixture.container.querySelector('[data-toolbar-page]').textContent,'page-B');assert.equal(fixture.svg()===node,true,'The first contact must preserve the same page SVG');assert.equal(fixture.pins.size,1);
  await fixture.emit('pointermove',{clientX:140,clientY:250,timeStamp:125},[sample({clientX:130,clientY:240,timeStamp:115,pressure:.4}),sample({clientX:140,clientY:250,timeStamp:120,pressure:.8})]);await fixture.emit('pointerup',{clientX:150,clientY:260,timeStamp:140,buttons:0,pressure:0});await fixture.ref.current.whenSettled();
  const stroke=fixture.strokes[0].stroke;assert.equal(stroke.context.pageId,'page-B');assert.deepEqual(stroke.points.map(point=>[point.x,point.y,point.time,point.pressure]),[[40,60,100,.2],[60,80,115,.4],[80,100,120,.8],[100,120,140,0]]);assert.equal(fixture.published,1);assert.equal(fixture.pins.size,0);
 });
 await group('A render, revision seam and changed preset keep the style and whole-eraser option captured at first contact',async()=>{
  const fixture=await mount(),node=fixture.svg();await fixture.emit('pointerdown');await fixture.render({style:{color:'#dd4050',width:12,opacity:.9,strokeStyle:'dashed'},wholeEraser:true,revision:7});bind(fixture);assert.equal(fixture.svg()===node,true,'Preset changes must preserve the same page SVG');assert.equal(fixture.ref.current.getState().phase,'capturing');
  await fixture.emit('pointermove',{clientX:140,clientY:250,timeStamp:120});assert.equal(fixture.container.querySelector('[data-preview]').getAttribute('data-preview-color'),'#2855ce');await fixture.emit('pointerup',{clientX:150,clientY:260,timeStamp:140,buttons:0});await fixture.ref.current.whenSettled();assert.deepEqual(fixture.strokes[0].style,{color:'#2855ce',width:2,opacity:.4,strokeStyle:'solid'});assert.equal(fixture.strokes[0].wholeEraser,false);
 });
 await group('Observed owner, API, permission and canonical page geometry transitions revoke old captures through A-B-A',async()=>{
  for(const change of [f=>({ownerKey:f.options.ownerKey+'-B'}),()=>({api:{}}),()=>({writable:false}),f=>({page:{...f.options.page,width:900}}),()=>({generation:2})]){
   const fixture=await mount(),before={...fixture.options};await fixture.emit('pointerdown');const old=fixture.accepted[0];await fixture.render(change(fixture));bind(fixture);assert.equal(old.current(),false);assert.equal(fixture.pins.size,0);await fixture.render(before);bind(fixture);assert.equal(old.current(),false);await fixture.emit('pointerdown',{timeStamp:300});assert.equal(fixture.ref.current.getState().phase,'capturing');assert.equal(old.current(),false);await fixture.emit('pointerup',{timeStamp:320,clientX:150,buttons:0});await fixture.ref.current.whenSettled();assert.equal(fixture.published,1);
  }
 });
 await group('An externally observed permission loss stays revoked without requiring a render; stable absent API remains editable',async()=>{
  const fixture=await mount({api:undefined});await fixture.emit('pointerdown');const old=fixture.accepted[0];fixture.allowed=false;assert.equal(old.current(),false);assert.equal(fixture.pins.size,0);fixture.allowed=true;assert.equal(old.current(),false);await fixture.emit('pointerdown',{timeStamp:300});await fixture.emit('pointerup',{timeStamp:320,buttons:0});await fixture.ref.current.whenSettled();assert.equal(fixture.published,1);
 });
 await group('True scroll, resize and zoom surface changes cancel; a compensated rebase with unchanged CTM preserves the contact',async()=>{
  for(const kind of ['scroll','resize','zoom']){const fixture=await mount();await fixture.emit('pointerdown');const old=fixture.accepted[0];await m.act(async()=>{if(kind==='zoom'){fixture.box.width=800;fixture.box.height=1100;}else fixture.box.top+=20;if(kind==='resize')fixture.resize();else document.dispatchEvent(new dom.window.Event('scroll'));await tick();});assert.equal(old.current(),false);assert.equal(fixture.pins.size,0);assert.equal(fixture.starts,0);}
  const fixture=await mount();await fixture.emit('pointerdown');await m.act(async()=>{fixture.box.top-=20;document.dispatchEvent(new dom.window.Event('scroll'));fixture.box.top+=20;await tick();});assert.equal(fixture.accepted[0].current(),true);await fixture.emit('pointerup',{timeStamp:140,clientX:150,clientY:260,buttons:0});await fixture.ref.current.whenSettled();assert.deepEqual(fixture.strokes[0].stroke.points.map(point=>[point.x,point.y]),[[40,60],[100,120]]);
 });
 await group('Lost capture, cancellation and wrong-pointer events release only the owned contact; normal release does not cancel finish',async()=>{
  const fixture=await mount();await fixture.emit('pointerdown');await fixture.emit('lostpointercapture',{pointerId:10,timeStamp:120});assert.equal(fixture.pins.size,1);
  // Deliberately spurious event: retain the browser capture flag to prove that
  // the product ignores it. fixture.emit models a genuine capture loss instead.
  await m.act(async()=>{fixture.svg().dispatchEvent(pointer('lostpointercapture',{timeStamp:120}));await tick();});
  assert.equal(fixture.pins.size,1,'A stale lost event while actual capture is held must be ignored');
  await fixture.emit('lostpointercapture',{timeStamp:120});assert.equal(fixture.pins.size,0);assert.equal(fixture.starts,0);
  await fixture.emit('pointerdown',{timeStamp:200});await fixture.emit('pointercancel',{timeStamp:220,buttons:0});assert.equal(fixture.pins.size,0);assert.equal(fixture.starts,0);await fixture.emit('pointerdown',{timeStamp:300});await fixture.emit('pointerup',{timeStamp:320,buttons:0});await fixture.ref.current.whenSettled();assert.equal(fixture.published,1);assert.equal(fixture.strokes.length,1);assert.equal(fixture.releases,3);
 });
 await group('Async stroke settlement is visible before parent callbacks, retains its pin and refuses another contact',async()=>{
  const held=gate();let pendingAtActivity,pendingAtStroke;const fixture=await mount({onActivity:(f,activity)=>{if(activity.phase==='settling')pendingAtActivity=f.ref.current.whenSettled();},onStroke:async(f,submission)=>{pendingAtStroke=f.ref.current.whenSettled();await held.promise;if(!submission.current())return false;f.published++;return true;}});await fixture.emit('pointerdown');await fixture.emit('pointerup',{timeStamp:140,buttons:0});const pending=fixture.ref.current.whenSettled();assert.equal(pendingAtActivity,pending);assert.equal(pendingAtStroke,pending);assert.equal(fixture.ref.current.getState().pendingOperations,1);assert.equal(fixture.pins.size,1);assert.equal(fixture.captures.get(fixture.svg()).size,0);
  await fixture.emit('pointerdown',{timeStamp:200});assert.equal(fixture.accepted.length,1);assert.equal(fixture.pins.size,1);await m.act(async()=>{held.resolve();await pending;});assert.equal(fixture.published,1);assert.equal(fixture.pins.size,0);assert.equal(fixture.ref.current.getState().pendingOperations,0);
 });
 await group('An accepted laser keeps its endpoint preview for 600 real milliseconds after settlement without publishing an object or retaining a pin',async()=>{
  const held=gate(),fixture=await mount({intent:'laser',onStroke:async(_f,submission)=>{await held.promise;return submission.current();}}),preview=()=>fixture.container.querySelector('[data-preview]');
  await fixture.emit('pointerdown');await fixture.emit('pointerup',{clientX:150,clientY:260,timeStamp:140,buttons:0});const pending=fixture.ref.current.whenSettled();
  assert.equal(preview().getAttribute('data-preview'),'empty','A pending parent acceptance cannot retain a released laser');assert.equal(fixture.pins.size,1);
  await m.act(async()=>{held.resolve();await pending;});const acceptedAt=performance.now();assert.equal(fixture.settlements[0].accepted,true);assert.equal(preview().getAttribute('data-preview'),'stroke');assert.equal(preview().getAttribute('data-preview-points'),'2');assert.equal(fixture.strokes[0].stroke.intent,'laser');assert.equal(fixture.published,0);assert.equal(fixture.pins.size,0);assert.equal(fixture.ref.current.getState().pendingOperations,0);
  await m.act(async()=>{await new Promise(resolve=>nativeTimeout(resolve,450));});assert.equal(preview().getAttribute('data-preview'),'stroke','The accepted endpoint must still be visible before 600 ms');
  await m.act(async()=>{await new Promise(resolve=>nativeTimeout(resolve,200));});assert.ok(performance.now()-acceptedAt>=600);assert.equal(preview().getAttribute('data-preview'),'empty','The visual must expire after its bounded 600 ms lifetime');assert.equal(fixture.published,0);assert.equal(fixture.pins.size,0);
 });
 await group('A new contact cancels the retained laser timer so the old expiry cannot erase a newer captured preview',async()=>{
  const fixture=await mount({intent:'laser',onStroke:(_f,submission)=>submission.current()}),preview=()=>fixture.container.querySelector('[data-preview]');await fixture.emit('pointerdown');await fixture.emit('pointerup',{clientX:150,timeStamp:140,buttons:0});await fixture.ref.current.whenSettled();assert.equal(preview().getAttribute('data-preview-points'),'2');
  await fixture.emit('pointerdown',{clientX:160,timeStamp:200});assert.equal(preview().getAttribute('data-preview-points'),'1');assert.equal(fixture.pins.size,1);
  await m.act(async()=>{await new Promise(resolve=>nativeTimeout(resolve,650));});assert.equal(preview().getAttribute('data-preview'),'stroke');assert.equal(preview().getAttribute('data-preview-points'),'1','The retired timer must not paint into the new contact');assert.equal(fixture.ref.current.getState().phase,'capturing');
  await fixture.emit('pointercancel',{timeStamp:220,buttons:0});assert.equal(preview().getAttribute('data-preview'),'empty');assert.equal(fixture.pins.size,0);assert.equal(fixture.published,0);
  for(const mode of ['cancel','begin','begin-cancel']){
   let acted=false;const reentrant=await mount({intent:'laser',onStroke:(_f,submission)=>submission.current(),onActivity:(f,activity)=>{if(activity.phase==='idle'&&!acted){acted=true;if(mode!=='cancel')f.dispatch('pointerdown',{clientX:180,timeStamp:200});if(mode!=='begin')f.ref.current.cancel();}}});
   await reentrant.emit('pointerdown');await reentrant.emit('pointerup',{timeStamp:140,buttons:0});await reentrant.ref.current.whenSettled();
   const pending=mode==='begin';assert.equal(reentrant.container.querySelector('[data-preview]').getAttribute('data-preview'),pending?'stroke':'empty','A retired laser cannot repaint after reentrant admission or cancellation');assert.equal(reentrant.pins.size,pending?1:0);if(pending)assert.equal(reentrant.container.querySelector('[data-preview]').getAttribute('data-preview-points'),'1');
  }
 });
 await group('Refused lasers never linger and owner, API, tool, permission, geometry, cancellation and deactivation revoke an accepted laser visual',async()=>{
  const refused=await mount({intent:'laser',onStroke:()=>false});await refused.emit('pointerdown');await refused.emit('pointerup',{timeStamp:140,buttons:0});await refused.ref.current.whenSettled();assert.equal(refused.container.querySelector('[data-preview]').getAttribute('data-preview'),'empty');assert.equal(refused.settlements[0].accepted,false);assert.equal(refused.published,0);
  for(const change of [f=>({ownerKey:f.options.ownerKey+'-next'}),()=>({generation:2}),()=>({api:{}}),()=>({intent:'pen'}),()=>({writable:false}),f=>({page:{...f.options.page,width:900}}),()=>({instanceKey:'replacement'})]){
   const fixture=await mount({intent:'laser',onStroke:(_f,submission)=>submission.current()});await fixture.emit('pointerdown');await fixture.emit('pointerup',{timeStamp:140,buttons:0});await fixture.ref.current.whenSettled();assert.equal(fixture.container.querySelector('[data-preview]').getAttribute('data-preview'),'stroke');await fixture.render(change(fixture));bind(fixture);assert.equal(fixture.container.querySelector('[data-preview]').getAttribute('data-preview'),'empty');assert.equal(fixture.pins.size,0);assert.equal(fixture.published,0);
  }
  const observed=await mount({intent:'laser',onStroke:(_f,submission)=>submission.current()});await observed.emit('pointerdown');await observed.emit('pointerup',{timeStamp:140,buttons:0});await observed.ref.current.whenSettled();observed.allowed=false;await m.act(tick);assert.equal(observed.container.querySelector('[data-preview]').getAttribute('data-preview'),'empty','A current() revocation without render must hide the old source');observed.allowed=true;await m.act(tick);assert.equal(observed.container.querySelector('[data-preview]').getAttribute('data-preview'),'empty','A revoked laser must never resume through A-B-A');
  const cancelled=await mount({intent:'laser',onStroke:(_f,submission)=>submission.current()});await cancelled.emit('pointerdown');await cancelled.emit('pointerup',{timeStamp:140,buttons:0});await cancelled.ref.current.whenSettled();await m.act(async()=>cancelled.ref.current.cancel());assert.equal(cancelled.container.querySelector('[data-preview]').getAttribute('data-preview'),'empty');await dispose(cancelled);assert.equal(cancelled.container.querySelector('[data-preview]'),null);
 });
 await group('Eraser work crosses a macrotask while its pin and settlement remain tracked',async()=>{
  const held=gate(),fixture=await mount({intent:'eraser',onStroke:async(f,submission)=>{await held.promise;if(!submission.current())return false;f.published++;return true;}});await fixture.emit('pointerdown');await m.act(async()=>{fixture.dispatch('pointerup',{timeStamp:140,buttons:0});assert.equal(fixture.starts,0);assert.equal(fixture.pins.size,1);assert.equal(fixture.ref.current.getState().pendingOperations,1);await tick();});assert.equal(fixture.starts,1);const pending=fixture.ref.current.whenSettled();assert.equal(fixture.pins.size,1);await m.act(async()=>{held.resolve();await pending;});assert.equal(fixture.published,1);assert.equal(fixture.pins.size,0);
 });
 await group('An old completed guard cannot cancel or unpin a new contact on the same page controller',async()=>{
  const fixture=await mount();await fixture.emit('pointerdown');await fixture.emit('pointerup',{timeStamp:140,buttons:0});await fixture.ref.current.whenSettled();const old=fixture.strokes[0];await fixture.emit('pointerdown',{timeStamp:200});assert.equal(old.current(),false);assert.equal(fixture.pins.size,1);assert.equal(fixture.svg().hasPointerCapture(9),true);assert.equal(fixture.ref.current.getState().phase,'capturing');await fixture.emit('pointerup',{timeStamp:220,clientX:150,buttons:0});await fixture.ref.current.whenSettled();assert.equal(fixture.published,2);
 });
 await group('A replaced host keeps its pending old pin until settlement and its old finally never releases the new host pin',async()=>{
  const held=gate(),fixture=await mount({onStroke:async(f,submission)=>{await held.promise;if(!submission.current())return false;f.published++;return true;}});await fixture.emit('pointerdown');await fixture.emit('pointerup',{timeStamp:140,buttons:0});const oldController=fixture.ref.current,oldPending=oldController.whenSettled(),old=fixture.strokes[0];await fixture.render({instanceKey:'replacement',generation:2});bind(fixture);await fixture.emit('pointerdown',{timeStamp:200});assert.equal(fixture.pins.size,2);assert.equal(old.current(),false);await m.act(async()=>{held.resolve();await oldPending;});assert.equal(fixture.published,0);assert.equal(fixture.pins.size,1);assert.equal(fixture.ref.current.getState().phase,'capturing');assert.equal(fixture.svg().hasPointerCapture(9),true);await fixture.emit('pointerup',{timeStamp:220,buttons:0});await fixture.ref.current.whenSettled();assert.equal(fixture.published,1);
 });
 await group('Strict replay remains usable and unmount revokes callbacks while awaiting the tracked child job without dropping its pin',async()=>{
  const strict=await mount({strict:true});await strict.emit('pointerdown');await strict.emit('pointerup',{timeStamp:140,buttons:0});await strict.ref.current.whenSettled();assert.equal(strict.published,1);assert.equal(strict.releases,1);
  const held=gate(),fixture=await mount({onStroke:async(f,submission)=>{await held.promise;if(!submission.current())return false;f.published++;return true;}});await fixture.emit('pointerdown');await fixture.emit('pointerup',{timeStamp:140,buttons:0});const controller=fixture.ref.current,pending=controller.whenSettled(),old=fixture.strokes[0],node=fixture.svg();await dispose(fixture);assert.equal(old.current(),false);assert.equal(fixture.pins.size,1);controller.handlers.onPointerDown({currentTarget:node,nativeEvent:pointer('pointerdown',{timeStamp:300}),defaultPrevented:false,preventDefault(){},stopPropagation(){}});assert.equal(fixture.accepted.length,1);await m.act(async()=>{held.resolve();await pending;});assert.equal(fixture.published,0);assert.equal(fixture.pins.size,0);assert.equal(fixture.releases,1);assert.equal(fixture.notices.length,0);
 });
 await group('Rejected child work settles once and a stale scope never publishes its error into the replacement view',async()=>{
  for(const stale of [false,true]){const held=gate(),fixture=await mount({onStroke:async()=>{await held.promise;return true;}});await fixture.emit('pointerdown');await fixture.emit('pointerup',{timeStamp:140,buttons:0});const pending=fixture.ref.current.whenSettled();if(stale){await fixture.render({ownerKey:fixture.options.ownerKey+'-next',generation:2});bind(fixture);}await m.act(async()=>{held.reject(Error('Synthetic child write failure'));await pending;});assert.equal(fixture.pins.size,0);assert.equal(fixture.settlements.length,1);assert.equal(fixture.settlements[0].accepted,false);assert.equal(fixture.notices.length,stale?0:1);}
 });
 await group('An OS interrupted ink prefix stays pinned through asynchronous preservation with raw sensors and its held style',async()=>{
  const saved=gate();let transport;const fixture=await mount({onCancelled:(_f,result,source,interruption)=>{transport={result,source,interruption};return saved.promise;}});
  await fixture.emit('pointerdown');await fixture.emit('pointermove',{clientX:140,timeStamp:120,pressure:.8});await fixture.render({style:{color:'#ff0000',width:12,opacity:1}});bind(fixture);
  await fixture.emit('pointercancel',{clientX:900,timeStamp:140,buttons:0});const pending=fixture.ref.current.whenSettled();
  assert.equal(fixture.ref.current.getState().phase,'preserving');assert.equal(fixture.pins.size,1);assert.equal(fixture.starts,0);
  assert.deepEqual(transport.interruption.cancellation,{cause:'pointercancel',disposition:'preserve-ink'});assert.equal(transport.interruption.admitted,true);
  assert.equal(transport.interruption.style.color,'#2855ce');assert.equal(transport.interruption.style.width,2);
  assert.deepEqual(transport.interruption.geometry,fixture.accepted[0].geometry);assert.equal(Object.isFrozen(fixture.accepted[0].geometry),true);
  assert.deepEqual(transport.interruption.stroke.points.map(point=>[point.x,point.time,point.pressure]),[[40,100,.2],[80,120,.8]]);
  assert.equal(Object.isFrozen(transport.interruption.stroke.points),true);assert.equal('current' in transport.interruption,false);
  await fixture.emit('pointerdown',{timeStamp:200});assert.equal(fixture.accepted.length,1);await m.act(async()=>{saved.resolve();await pending;});
  assert.equal(fixture.pins.size,0);assert.equal(fixture.ref.current.getState().phase,'idle');assert.equal(fixture.published,0);
 });
 await group('A failed interruption stays blocked through owner ABA and explicit retry uses the old callback and exact manifest',async()=>{
  const fail=gate(),retry=gate(),rows=[];let nextCalls=0;
  const fixture=await mount({onCancelled:(_f,result,source,interruption)=>{rows.push({result,source,interruption});return rows.length===1?fail.promise:retry.promise;}});
  await fixture.emit('pointerdown');await fixture.emit('lostpointercapture',{timeStamp:140});const controller=fixture.ref.current,failed=controller.whenSettled();
  assert.equal(rows.length,1,'Actual capture loss must invoke its captured recovery consumer before a storage rejection');assert.equal(controller.getState().phase,'preserving');assert.equal(fixture.svg().hasPointerCapture(9),false);
  await m.act(async()=>{fail.reject(Error('Synthetic quota failure'));await assert.rejects(failed,/quota/);});
  assert.equal(controller.getState().phase,'blocked');assert.equal(fixture.pins.size,1);assert.equal(controller.getState().pendingOperations,1);
  const oldOwner=fixture.options.ownerKey;await fixture.render({ownerKey:oldOwner+'-B',generation:2,onCancelled:()=>{nextCalls++;}});bind(fixture);await fixture.render({ownerKey:oldOwner,generation:3});bind(fixture);
  await fixture.emit('pointerdown',{timeStamp:200});assert.equal(fixture.accepted.length,1);let pending;await m.act(async()=>{pending=controller.retryCancellation();await tick();});
  assert.equal(rows.length,2);assert.equal(rows[0].interruption,rows[1].interruption);assert.equal(rows[0].source,rows[1].source);assert.equal(rows[1].source.generation,1);assert.equal(nextCalls,0);
  await m.act(async()=>{retry.resolve();await pending;});assert.equal(fixture.pins.size,0);assert.equal(controller.getState().pendingOperations,0);assert.equal(controller.getState().phase,'idle');
 });
 await group('Explicit navigation and non-ink interruptions cannot become recovered ink or deferred commands',async()=>{
  for(const intent of ['pen','eraser','lasso','select','laser']){
   const rows=[],fixture=await mount({intent,onCancelled:(_f,_result,_source,interruption)=>{rows.push(interruption);}});await fixture.emit('pointerdown');
   if(intent==='pen')await m.act(async()=>{fixture.ref.current.cancel('navigation',{cause:'navigation',disposition:'discard'});});else await fixture.emit('pointercancel',{timeStamp:140,buttons:0});
   assert.equal(rows.length,1);assert.equal(rows[0].cancellation.disposition,'discard');assert.equal(fixture.published,0);assert.equal(fixture.starts,0);assert.equal(fixture.pins.size,0);
  }
 });
 await group('True unmount retains an admitted ink prefix until the old-owner recovery callback confirms consumption',async()=>{
  const saved=gate();let transport;const fixture=await mount({onCancelled:(_f,_result,_source,interruption)=>{transport=interruption;return saved.promise;}});
  await fixture.emit('pointerdown');await fixture.emit('pointermove',{clientX:140,timeStamp:120});const controller=fixture.ref.current;await dispose(fixture);const pending=controller.whenSettled();
  assert.equal(transport.cancellation.disposition,'preserve-ink');assert.equal(transport.cancellation.cause,'unmount');assert.equal(transport.stroke.points.length,2);assert.equal(fixture.pins.size,1);
  await m.act(async()=>{saved.resolve();await pending;});assert.equal(fixture.pins.size,0);assert.equal(fixture.published,0);assert.equal(controller.getState().pendingOperations,0);
 });
 await group('Checkpoint cadence coalesces one child and cancel drains it before the final original-owner receipt',async()=>{
  const prefix=gate(),final=gate(),seen=[],order=[];let interruption;
  const fixture=await mount({onCheckpoint:(_f,snapshot)=>{seen.push(snapshot);order.push('prefix');return prefix.promise;},onCancelled:(_f,_result,_source,value)=>{interruption=value;order.push('final');return final.promise;}});
  await fixture.emit('pointerdown');await wait(()=>seen.length===1);await fixture.emit('pointermove',{clientX:140,timeStamp:120,pressure:.8});
  await m.act(async()=>{await new Promise(resolve=>nativeTimeout(resolve,300));});assert.equal(seen.length,1,'A pending prefix must not start another child');
  assert.equal(seen[0].stroke.points.length,1);assert.equal(Object.isFrozen(seen[0].stroke.points),true);
  await fixture.emit('pointercancel',{timeStamp:140,buttons:0});const pending=fixture.ref.current.whenSettled();assert.deepEqual(order,['prefix']);assert.equal(fixture.pins.size,1);
  await m.act(async()=>{prefix.resolve();await tick();});assert.deepEqual(order,['prefix','final']);assert.equal(interruption.token,seen[0].token);assert.equal(interruption.stroke.points.length,2);
  assert.equal(fixture.pins.size,1);assert.equal(fixture.published,0);await m.act(async()=>{final.resolve();await pending;});assert.equal(fixture.pins.size,0);
 });
 await group('Normal finish also waits the pending prefix before invoking a single canonical submission',async()=>{
  const prefix=gate(),seen=[];const fixture=await mount({onCheckpoint:(_f,snapshot)=>{seen.push(snapshot);return prefix.promise;}});
  await fixture.emit('pointerdown');await wait(()=>seen.length===1);await fixture.emit('pointerup',{clientX:150,timeStamp:140,buttons:0});const pending=fixture.ref.current.whenSettled();
  assert.equal(fixture.starts,0);assert.equal(fixture.pins.size,1);await m.act(async()=>{prefix.resolve();await pending;});assert.equal(fixture.starts,1);assert.equal(fixture.published,1);assert.equal(fixture.pins.size,0);assert.equal(seen.length,1);
 });
 await group('A failed checkpoint falls back to the full raw prefix and failed recovery remains blocked until exact retry',async()=>{
  const failed=gate(),retry=gate(),rows=[];const fixture=await mount({onCheckpoint:()=>Promise.reject(Error('Synthetic checkpoint failure')),onCancelled:(_f,_result,_source,interruption)=>{rows.push(interruption);return rows.length===1?failed.promise:retry.promise;}});
  await fixture.emit('pointerdown');await fixture.emit('pointermove',{clientX:140,timeStamp:120});await wait(()=>rows.length===1);const controller=fixture.ref.current,pending=controller.whenSettled();
  assert.equal(rows[0].cancellation.disposition,'preserve-ink');assert.equal(rows[0].cancellation.cause,'save-failed');assert.equal(rows[0].stroke.points.length,2);assert.equal(fixture.starts,0);
  await m.act(async()=>{failed.reject(Error('Synthetic recovery quota'));await assert.rejects(pending,/quota/);});assert.equal(controller.getState().phase,'blocked');assert.equal(fixture.pins.size,1);
  let retried;await m.act(async()=>{retried=controller.retryCancellation();await tick();});assert.equal(rows.length,2);assert.equal(rows[0],rows[1]);await m.act(async()=>{retry.resolve();await retried;});assert.equal(fixture.pins.size,0);assert.equal(fixture.published,0);
 });
 await group('A refused or rejected completed submission keeps its full raw stroke pinned until recovery confirms consumption',async()=>{
  for(const rejected of [false,true]){
   const recovery=gate();let transport;const fixture=await mount({onStroke:()=>{if(rejected)throw Error('Synthetic canonical save failure');return false;},onCancelled:(_f,_result,_source,interruption)=>{transport=interruption;return recovery.promise;}});
   await fixture.emit('pointerdown');await fixture.emit('pointerup',{clientX:150,timeStamp:140,buttons:0});const pending=fixture.ref.current.whenSettled();
   assert.equal(transport.cancellation.cause,rejected?'save-failed':'publication-refused');assert.equal(transport.cancellation.disposition,'preserve-ink');assert.equal(transport.stroke.points.length,2);
   assert.equal(fixture.pins.size,1);assert.equal(fixture.ref.current.getState().phase,'preserving');assert.equal(fixture.strokes[0].current(),false);
   await m.act(async()=>{recovery.resolve();await pending;});assert.equal(fixture.pins.size,0);assert.equal(fixture.settlements[0].accepted,false);assert.equal(fixture.settlements[0].preserved,true);assert.equal(fixture.published,0);
  }
 });
 await group('Unadmitted capture failure with an asynchronous discard can fail and retry without leaking admission or its pending counter',async()=>{
  const failed=gate(),retry=gate(),rows=[];const fixture=await mount({onCancelled:(_f,_result,_source,interruption)=>{rows.push(interruption);return rows.length===1?failed.promise:retry.promise;}});
  const node=fixture.svg(),capture=node.setPointerCapture;node.setPointerCapture=()=>{throw Error('Synthetic capture failure');};await fixture.emit('pointerdown');const controller=fixture.ref.current,pending=controller.whenSettled();
  assert.equal(rows[0].admitted,false);assert.equal(rows[0].cancellation.disposition,'discard');assert.equal(fixture.accepted.length,0);assert.equal(controller.getState().pendingOperations,1);
  await m.act(async()=>{failed.reject(Error('Synthetic discard failure'));await assert.rejects(pending,/discard/);});assert.equal(controller.getState().phase,'blocked');assert.equal(fixture.pins.size,1);
  let retried;await m.act(async()=>{retried=controller.retryCancellation();await tick();});assert.equal(rows[0],rows[1]);await m.act(async()=>{retry.resolve();await retried;});
  assert.equal(fixture.pins.size,0);assert.equal(controller.getState().pendingOperations,0);node.setPointerCapture=capture;await fixture.emit('pointerdown',{timeStamp:200});assert.equal(fixture.accepted.length,1);await fixture.emit('pointerup',{timeStamp:240,buttons:0});await controller.whenSettled();assert.equal(fixture.published,1);
 });
 await group('Incremental checkpoints bound each copy and finish drains only acknowledged suffixes before one canonical submission',async()=>{
  const first=gate(),seen=[],order=[];let active=0,peak=0;
  const f=await mount({onCheckpointChunk:(_f,p)=>{seen.push(p);order.push('chunk:'+p.from);active++;peak=Math.max(peak,active);return (seen.length===1?first.promise:Promise.resolve({confirmedCursor:p.to})).finally(()=>{active--;});},onStroke:(fixture,submission)=>{order.push('canonical');assert.equal(seen.at(-1).to,submission.stroke.points.length);fixture.published++;return submission.current();}});
  await f.emit('pointerdown');const batch=Array.from({length:5000},(_,i)=>sample({clientX:121+i/10,timeStamp:101+i,pressure:i%2===0?undefined:.7}));
  await f.emit('pointermove',{timeStamp:5101},batch);await wait(()=>seen.length===1);await f.render({style:{color:'#ff0000',width:20,opacity:1}});bind(f);
  await m.act(async()=>{await new Promise(resolve=>nativeTimeout(resolve,300));});assert.equal(seen.length,1);assert.equal(peak,1);
  assert.deepEqual([seen[0].from,seen[0].to,seen[0].total,seen[0].points.length],[0,4096,5001,4096]);assert.equal('stroke' in seen[0],false);assert.equal(Object.isFrozen(seen[0].points),true);assert.equal(Object.isFrozen(seen[0].context.clientRect),true);assert.equal('pressure' in seen[0].points[1],false);assert.equal(seen[0].points[2].pressure,.7);
  await f.emit('pointerup',{clientX:180,timeStamp:5200,buttons:0});const pending=f.ref.current.whenSettled();assert.equal(f.starts,0);assert.equal(f.pins.size,1);
  await m.act(async()=>{first.resolve({confirmedCursor:4096});await pending;});assert.equal(seen.length,2);assert.deepEqual([seen[1].from,seen[1].to,seen[1].total,seen[1].points.length],[4096,5002,5002,906]);assert.equal(peak,1);assert.equal(seen[1].token,seen[0].token);assert.equal(seen[1].style.width,2);assert.deepEqual(order,['chunk:0','chunk:4096','canonical']);assert.equal(f.published,1);assert.equal(f.pins.size,0);
 });
 await group('A revoked operation drains its final suffix through the captured old callback and keeps its pin through recovery',async()=>{
  const prefix=gate(),recovery=gate(),seen=[],rows=[];let nextCalls=0;
  const f=await mount({onCheckpointChunk:(_f,p)=>{seen.push(p);return seen.length===1?prefix.promise:Promise.resolve({confirmedCursor:p.to});},onCancelled:(_f,_r,_s,value)=>{rows.push(value);return recovery.promise;}});
  await f.emit('pointerdown');await wait(()=>seen.length===1);await f.emit('pointermove',{clientX:140,timeStamp:120,pressure:.8});const old=f.ref.current,owner=f.options.ownerKey;
  await f.render({ownerKey:owner+'-B',generation:2,api:{},onCheckpointChunk:()=>{nextCalls++;return Promise.resolve({confirmedCursor:999});}});bind(f);await f.render({ownerKey:owner,generation:3});bind(f);
  assert.equal(rows.length,0);assert.equal(f.pins.size,1);await f.emit('pointerdown',{timeStamp:300});assert.equal(f.accepted.length,1);
  await m.act(async()=>{prefix.resolve({confirmedCursor:1});await tick();});await wait(()=>seen.length===2&&rows.length===1);assert.equal(seen.length,2);assert.deepEqual([seen[1].from,seen[1].to,seen[1].total],[1,2,2]);assert.equal(seen[1].generation,1);assert.equal(seen[1].ownerKey,owner);assert.equal(seen[1].token,seen[0].token);assert.equal(nextCalls,0);assert.equal(rows.length,1);assert.equal(rows[0].stroke.points.length,2);assert.equal(f.pins.size,1);
  await m.act(async()=>{recovery.resolve();await old.whenSettled();});assert.equal(f.pins.size,0);assert.equal(f.published,0);const count=seen.length;await m.act(async()=>{await new Promise(resolve=>nativeTimeout(resolve,300));});assert.equal(seen.length,count,'No retired reader may append after terminal consumption');
 });
 await group('Missing or mismatched chunk acknowledgements never advance a cursor or release full raw recovery early',async()=>{
  for(const ack of [undefined,{confirmedCursor:0},{confirmedCursor:2},{confirmedCursor:'1'},'no-promise']){
   const saved=gate(),seen=[],rows=[];const f=await mount({onCheckpointChunk:(_f,p)=>{seen.push(p);return ack==='no-promise'?undefined:Promise.resolve(ack);},onCancelled:(_f,_r,_s,value)=>{rows.push(value);return saved.promise;}});
   await f.emit('pointerdown');await wait(()=>rows.length===1);const pending=f.ref.current.whenSettled();assert.deepEqual([seen[0].from,seen[0].to],[0,1]);assert.equal(rows[0].cancellation.cause,'save-failed');assert.equal(rows[0].stroke.points.length,1);assert.equal(f.starts,0);assert.equal(f.pins.size,1);assert.equal(f.ref.current.getState().phase,'preserving');
   await m.act(async()=>{saved.resolve();await pending;});assert.equal(f.pins.size,0);assert.equal(f.published,0);assert.equal(seen.length,1,'An unconfirmed prefix cannot be treated as acknowledged or replayed after recovery');
  }
 });
 await group('A late prefix rejection during finish retains the complete raw endpoint and exact retry after failed conservation',async()=>{
  const prefix=gate(),failed=gate(),retry=gate(),rows=[];let packets=0;
  const f=await mount({onCheckpointChunk:()=>{packets++;return prefix.promise;},onCancelled:(_f,_r,_s,value)=>{rows.push(value);return rows.length===1?failed.promise:retry.promise;}});
  await f.emit('pointerdown');await wait(()=>packets===1);await f.emit('pointerup',{clientX:150,timeStamp:140,buttons:0});const controller=f.ref.current,pending=controller.whenSettled();
  await m.act(async()=>{prefix.reject(Error('Synthetic late prefix failure'));await tick();});await wait(()=>rows.length===1);assert.equal(rows.length,1);assert.equal(rows[0].cancellation.cause,'save-failed');assert.deepEqual(rows[0].stroke.points.map(p=>[p.x,p.time]),[[40,100],[100,140]]);assert.equal(f.starts,0);assert.equal(f.pins.size,1);
  await m.act(async()=>{failed.reject(Error('Synthetic recovery quota'));await assert.rejects(pending,/quota/);});assert.equal(controller.getState().phase,'blocked');assert.equal(f.pins.size,1);
  let retried;await m.act(async()=>{retried=controller.retryCancellation();await tick();});assert.equal(rows.length,2);assert.equal(rows[1],rows[0]);assert.equal(packets,1);
  await m.act(async()=>{retry.resolve();await retried;});assert.equal(f.pins.size,0);assert.equal(f.published,0);
 });
 await group('An empty incremental interval resumes polling and never resends a confirmed prefix',async()=>{
  const seen=[],f=await mount({onCheckpointChunk:(_f,p)=>{seen.push(p);return Promise.resolve({confirmedCursor:p.to});}});
  await f.emit('pointerdown');await wait(()=>seen.length===1);await m.act(async()=>{await new Promise(resolve=>nativeTimeout(resolve,300));});assert.equal(seen.length,1);
  await f.emit('pointermove',{clientX:140,timeStamp:120});await wait(()=>seen.length===2);assert.deepEqual(seen.map(p=>[p.from,p.to]),[[0,1],[1,2]]);
  await f.emit('pointerup',{clientX:150,timeStamp:140,buttons:0});await f.ref.current.whenSettled();assert.deepEqual(seen.map(p=>[p.from,p.to]),[[0,1],[1,2],[2,3]]);assert.equal(f.published,1);assert.equal(f.pins.size,0);
 });
 await group('The chunk route takes precedence over legacy snapshots and non-authoring gestures never emit recovery chunks',async()=>{
  let legacy=0;const seen=[],f=await mount({onCheckpoint:()=>{legacy++;throw Error('Legacy full snapshot must not be used');},onCheckpointChunk:(_f,p)=>{seen.push(p);return Promise.resolve({confirmedCursor:p.to});}});
  await f.emit('pointerdown');await f.emit('pointerup',{timeStamp:140,buttons:0});await f.ref.current.whenSettled();assert.equal(legacy,0);assert.equal(seen.length,1);assert.deepEqual([seen[0].from,seen[0].to],[0,2]);assert.equal(f.published,1);
  let nonInk=0;for(const intent of ['eraser','lasso','select','laser','pen']){
   const n=await mount({intent,onCheckpointChunk:()=>{nonInk++;throw Error('Non-authoring gesture must never emit a journal chunk');}});
   await n.emit('pointerdown',intent==='pen'?{button:5,buttons:32}:{});await n.emit('pointercancel',{timeStamp:140,buttons:0});await n.ref.current.whenSettled();assert.equal(n.pins.size,0);assert.equal(n.published,0);
  }
  await m.act(async()=>{await new Promise(resolve=>nativeTimeout(resolve,300));});assert.equal(nonInk,0);
 });
}catch(error){fatal=String(error?.message??error).slice(0,1200);failed++;process.exitCode=1;}
finally{
 try{await mountedCleanup([['Controller fixtures',()=>m?cleanFixtures():undefined],['RAF jobs',()=>{for(const timer of rafTimers.values())nativeClear(timer);rafTimers.clear();}],['Observers',()=>{assert.equal(observers.size,0);}],['DOM',()=>dom?.window.close()],['Globals',()=>{for(const [name,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}}],['Bundle',()=>rm(out,{recursive:true,force:true})]]);}catch(error){cleanupError=String(error?.message??error).slice(0,1200);failed++;process.exitCode=1;}
 const groups=declaredNames.map(name=>proof.find(value=>value.name===name)??{name,status:'NOTRUN',reason:fatal?'Run aborted after fatal error or failed cleanup':'Group was not executed'});
 const bodyPassed=groups.filter(value=>value.status==='PASS').length,bodyFailed=groups.filter(value=>value.status==='FAIL').length,notRun=groups.filter(value=>value.status==='NOTRUN').length,allGroupsAttempted=startedNames.size===declaredNames.length;
 const report={date:new Date().toISOString().slice(0,10),executedAt:new Date().toISOString(),passed:bodyPassed,failed:bodyFailed,failureEvents:failed,groupsStarted:startedNames.size,declaredGroups:declaredNames.length,notRun,allGroupsAttempted,fullSuiteAttempted:allGroupsAttempted,fullSuitePassed:allGroupsAttempted&&bodyFailed===0&&!fatal&&!cleanupError&&cleanupFailures.length===0,groups,testsExecuted:startedNames.size>0,pageControllerMounted:mountedAny,notebookIntegrationMounted:false,realProseMirrorMounted:false,syntheticSVGPointerCaptureCTM:true,syntheticPreviewDelivery:true,syntheticRecoveryAndCheckpointConsumers:true,realDurableInkRecoveryVerified:false,realDeviceOrPencilVerified:false,realRasterVerified:false,globalPalmAndPinchIntegrated:false,maximumPendingOperationsPerController:1,fatal:fatal??null,cleanupFailures,cleanupFinal:{status:cleanupError?'FAIL':'PASS',error:cleanupError??null}};
 await writeFile(mountedAuditPath('n067-page-ink-controller-mounted-tests-20261014.json'),JSON.stringify(report,null,2)+'\n');console.log(`Page ink controller groups: ${bodyPassed} passed, ${bodyFailed} failed, ${notRun} NOTRUN; cleanup ${cleanupError?'FAIL':'PASS'}`);if(failed||fatal||cleanupError||notRun)process.exitCode=1;
}
