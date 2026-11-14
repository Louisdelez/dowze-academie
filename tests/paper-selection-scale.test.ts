import test from 'node:test';
import assert from 'node:assert/strict';
import {migratePaper,blankPage,applyPaperCommand,isPaperDocument,emptyPaperHistory,recordPaperHistory,travelPaperHistory,type PaperDocument,type PaperObject,type PaperCommand} from '../src/lib/notebookDocument.ts';
import {objectPoint} from '../src/lib/paperGeometry.ts';
import {describePaperMeasurementObject} from '../src/lib/paperMeasurementObject.ts';
import {paperSelectionScaleBounds,preparePaperSelectionScale} from '../src/lib/paperTransforms.ts';

const close=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<=Math.max(1,Math.abs(expected))*1e-10,`${actual} ≠ ${expected}`);
const object=(id:string,kind:PaperObject['kind'],patch:Partial<PaperObject>={}):PaperObject=>({id,pageId:'page-a',kind,x:20,y:30,width:80,height:60,rotation:0,z:1,locked:false,createdAt:123,...patch});
function fixture():PaperDocument {
 const doc=migratePaper('scale-note','Original legacy text',null);
 return {...doc,pages:[{...blankPage('page-a'),rotation:90,calibration:{schema:1,pageUnitsPerMm:4},pdf:{assetId:'pdf-asset',pageNumber:1,text:'PDF original'}},blankPage('page-b')],
  assets:[{id:'image-asset',name:'photo.png',mediaType:'image/png',size:42},{id:'pdf-asset',name:'original.pdf',mediaType:'application/pdf',size:512},{id:'audio-asset',name:'voice.webm',mediaType:'audio/webm',size:64}],
  audio:[{id:'audio-session',assetId:'audio-asset',name:'Voice original',duration:30,startedAt:123}],
  objects:[object('ink','ink',{x:30,y:70,width:70,height:50,rotation:31,mirrorX:true,mirrorY:true,strokeWidth:2.75,color:'#123456',opacity:.6,pen:'calligraphy',nibAngle:37,strokeStyle:'dashed',groupId:'group-a',audioAnchor:{sessionId:'audio-session',time:12.25},points:[{x:4,y:8,time:10,pressure:.2,tiltX:-12,tiltY:9,twist:217,nibAngle:33},{x:26,y:17,time:12,renderPressure:.7},{x:65,y:43,time:16,pressure:.91,tiltX:4,tiltY:18,twist:91}]}),
   object('shape','shape',{x:150,y:60,width:110,height:40,rotation:-23,mirrorY:true,shape:'ellipse',strokeWidth:3.25,color:'#aa1188',strokeStyle:'dotted'}),
   object('image','image',{x:310,y:50,width:90,height:130,rotation:17,mirrorX:true,assetId:'image-asset'}),
   object('sticky','sticky',{x:260,y:260,rotation:11,markdown:'Independent **text**'}),
   object('foreign-page','shape',{pageId:'page-b',x:44,y:55,shape:'rectangle'}),object('unselected','shape',{x:500,y:800,shape:'line'})]};
}
function commandObjects(command:PaperCommand|null):PaperObject[]{assert.ok(command&&command.type==='batch');return command.commands.map(command=>{assert.equal(command.type,'upsert-object');return (command as Extract<PaperCommand,{type:'upsert-object'}>).object;});}
const metadata=(value:PaperObject)=>{const {x,y,width,height,points,strokeWidth,...rest}=value;return rest;};
function frozen<T>(value:T):T {if(value&&typeof value==='object'){for(const child of Object.values(value))frozen(child);Object.freeze(value);}return value;}

test('A common page anchor scales rotated and mirrored mixed objects, preserving exact identities and sensor metadata',()=>{
 const doc=frozen(fixture()),before=structuredClone(doc),ids=['ink','shape','image','sticky'],anchor={x:123,y:214},factor=2.5;
 assert.ok(isPaperDocument(doc));const plan=preparePaperSelectionScale(doc,'page-a',ids,factor,anchor),results=commandObjects(plan.command);
 assert.deepEqual(results.map(value=>value.id),ids);assert.deepEqual(plan.anchor,anchor);assert.ok(Object.isFrozen(plan.anchor));
 for(const next of results){const old=doc.objects.find(value=>value.id===next.id)!;assert.deepEqual(metadata(next),metadata(old));
  const probes=[{x:0,y:0},{x:old.width,y:0},{x:old.width,y:old.height},{x:0,y:old.height},...(old.points??[])];
  for(const point of probes){const a=objectPoint(old,point),b=objectPoint(next,{x:point.x*factor,y:point.y*factor});close(b.x,anchor.x+factor*(a.x-anchor.x));close(b.y,anchor.y+factor*(a.y-anchor.y));}
  if(old.points)for(let i=0;i<old.points.length;i++){const {x,y,...sensors}=old.points[i],{x:nx,y:ny,...retained}=next.points![i];assert.deepEqual(retained,sensors);close(nx,x*factor);close(ny,y*factor);assert.notEqual(next.points![i],old.points[i]);}
  if(old.strokeWidth!==undefined)close(next.strokeWidth!,old.strokeWidth*factor);
 }
 assert.deepEqual(doc,before);
});

test('Painted ink bounds determine one shared corner/centre anchor rather than legacy page-sized stroke boxes',()=>{
 const doc=fixture();doc.objects=[object('ink','ink',{width:10000,height:90000,points:[{x:20,y:30,time:1},{x:40,y:50,time:2}],strokeWidth:2}),object('box','shape',{x:100,y:100,width:20,height:30})];
 const bounds=paperSelectionScaleBounds(doc,'page-a',['ink','box']);assert.deepEqual(bounds,{left:38,top:58,right:120,bottom:130,width:82,height:72});assert.ok(Object.isFrozen(bounds));
 const anchors={'top-left':{x:38,y:58},'top-right':{x:120,y:58},'bottom-left':{x:38,y:130},'bottom-right':{x:120,y:130},center:{x:79,y:94}} as const;
 for(const [name,expected]of Object.entries(anchors)){const plan=preparePaperSelectionScale(doc,'page-a',['ink','box'],2,name as keyof typeof anchors);assert.deepEqual(plan.anchor,expected);const next=applyPaperCommand(doc,plan.command!);const after=paperSelectionScaleBounds(next,'page-a',['ink','box']);close(after.left,expected.x+2*(bounds.left-expected.x));close(after.top,expected.y+2*(bounds.top-expected.y));close(after.width,bounds.width*2);close(after.height,bounds.height*2);}
});

test('Measured length and area derive scaled world geometry; calibration, page PDF, recordings and source remain exact',()=>{
 const doc=fixture(),line=object('length','ink',{rotation:37,mirrorX:true,points:[{x:0,y:0,time:1},{x:0,y:40,time:2},{x:30,y:40,time:3}],measurement:{schema:1,kind:'length',unit:'cm'}}),area=object('area','ink',{x:210,rotation:-17,mirrorY:true,points:[{x:0,y:0,time:1},{x:40,y:0,time:2},{x:40,y:20,time:3},{x:0,y:20,time:4}],measurement:{schema:1,kind:'area',unit:'cm'}});
 doc.objects.push(line,area);assert.ok(isPaperDocument(doc));const baseline=structuredClone(doc),plan=preparePaperSelectionScale(doc,'page-a',['length','area'],3),next=applyPaperCommand(doc,plan.command!);assert.ok(isPaperDocument(next));
 for(const old of [line,area]){const scaled=next.objects.find(value=>value.id===old.id)!,a=describePaperMeasurementObject(old,doc.pages[0])!,b=describePaperMeasurementObject(scaled,next.pages[0])!;assert.equal(b.status,'measured');close(b.value!.value,a.value!.value*(old.measurement!.kind==='area'?9:3));assert.deepEqual(scaled.measurement,old.measurement);}
 assert.deepEqual(next.pages,baseline.pages);assert.deepEqual(next.assets,baseline.assets);assert.deepEqual(next.audio,baseline.audio);assert.deepEqual(next.legacy,baseline.legacy);assert.deepEqual(doc,baseline);
});

test('Locked, continuous, foreign-page, missing or duplicate identities reject the entire batch without altering any source',()=>{
 for(const variant of ['locked','flow','foreign','missing','duplicate','missing-page']){const doc=fixture();let ids=['ink','shape'],page='page-a';
  if(variant==='locked')doc.objects[1].locked=true;
  if(variant==='flow')doc.objects.push(object('flow','text',{markdown:'Continuous source',textFlow:{schema:1,source:'source',pageIds:['page-a','page-b'],breaks:[0,100,200],sourceOffsets:[0,8,17]}})),ids=['ink','flow'];
  if(variant==='foreign')ids=['ink','foreign-page'];if(variant==='missing')ids=['ink','missing'];if(variant==='duplicate')ids=['ink','ink'];if(variant==='missing-page')page='removed-page';
  const before=structuredClone(doc);assert.throws(()=>preparePaperSelectionScale(doc,page,ids,2),variant==='locked'?/Déverrouillez/:variant==='flow'?/continu/:undefined);assert.deepEqual(doc,before);
 }
});

test('Invalid dimensions/anchors, overflow and underflow refuse before exposing a partial command',()=>{
 for(const factor of [0,-1,NaN,Infinity,-Infinity])assert.throws(()=>preparePaperSelectionScale(fixture(),'page-a',['ink','shape'],factor));
 for(const anchor of [{x:NaN,y:0},{x:0,y:Infinity},'invalid' as 'center'])assert.throws(()=>preparePaperSelectionScale(fixture(),'page-a',['ink','shape'],2,anchor));
 const overflow=fixture();overflow.objects.push(object('late','shape',{x:1e308,y:0,width:1e307,height:10}));const before=structuredClone(overflow);assert.throws(()=>preparePaperSelectionScale(overflow,'page-a',['shape','late'],4,{x:0,y:0}),/précision/);assert.deepEqual(overflow,before);
 const underflow=fixture();underflow.objects[0].points![1].x=Number.MIN_VALUE;assert.throws(()=>preparePaperSelectionScale(underflow,'page-a',['shape','ink'],.5),/précision/);
 const projection=fixture();projection.objects[0]={...projection.objects[0],x:1e308,width:0,rotation:0,points:[{x:-1e308,y:0,time:1},{x:1e308,y:0,time:2}]};assert.throws(()=>preparePaperSelectionScale(projection,'page-a',['shape','ink'],2),/précision/);
});

test('One atomic command validates, survives JSON and undo/redo, preserving unrelated page objects and all media',()=>{
 const doc=fixture(),before=structuredClone(doc),plan=preparePaperSelectionScale(doc,'page-a',['image','ink','shape'],1.75,'top-left'),next=applyPaperCommand(doc,plan.command!,'2026-10-15T12:00:00.000Z');
 assert.equal(next.revision,doc.revision+1);assert.ok(isPaperDocument(next));assert.deepEqual(JSON.parse(JSON.stringify(next)),next);
 for(const id of ['unselected','foreign-page','sticky'])assert.deepEqual(next.objects.find(value=>value.id===id),before.objects.find(value=>value.id===id));
 assert.deepEqual(next.pages,before.pages);assert.deepEqual(next.assets,before.assets);assert.deepEqual(next.audio,before.audio);assert.deepEqual(doc,before);
 const undone=travelPaperHistory(recordPaperHistory(emptyPaperHistory(),doc),next,'undo')!;assert.deepEqual(undone.document.objects,doc.objects);assert.deepEqual(undone.document.pages,doc.pages);assert.equal(undone.document.revision,next.revision+1);
 const redone=travelPaperHistory(undone.history,undone.document,'redo')!;assert.deepEqual(redone.document.objects,next.objects);assert.deepEqual(redone.document.assets,next.assets);assert.equal(redone.document.revision,undone.document.revision+1);
 const foreign={...doc,noteId:'other-note'};assert.throws(()=>applyPaperCommand(foreign,{type:'restore',document:next}),/autre note/);assert.deepEqual(doc,before);
});

test('A reciprocal uniform transform round-trips geometry with no sensor or audio drift',()=>{
 const doc=fixture(),ids=['ink','shape','image'],anchor={x:0,y:0},scaled=applyPaperCommand(doc,preparePaperSelectionScale(doc,'page-a',ids,3,anchor).command!),back=applyPaperCommand(scaled,preparePaperSelectionScale(scaled,'page-a',ids,1/3,anchor).command!);
 for(const id of ids){const old=doc.objects.find(value=>value.id===id)!,next=back.objects.find(value=>value.id===id)!;assert.deepEqual(metadata(next),metadata(old));for(const key of ['x','y','width','height'] as const)close(next[key],old[key]);if(old.strokeWidth!==undefined)close(next.strokeWidth!,old.strokeWidth);for(let i=0;i<(old.points?.length??0);i++){const a=old.points![i],b=next.points![i];close(a.x,b.x);close(a.y,b.y);const {x:ax,y:ay,...sensorA}=a,{x:bx,y:by,...sensorB}=b;assert.deepEqual(sensorB,sensorA);}}
});

test('A factor of one is an explicit no-op; zero-width geometry remains valid when the common extent is nonzero',()=>{
 const doc=fixture(),before=structuredClone(doc);assert.equal(preparePaperSelectionScale(doc,'page-a',['ink','shape'],1).command,null);assert.deepEqual(doc,before);
 doc.objects=[object('vertical','shape',{x:0,y:0,width:0,height:50,shape:'line'}),object('vertical-2','shape',{x:0,y:80,width:0,height:20,shape:'line'})];const bounds=paperSelectionScaleBounds(doc,'page-a',['vertical','vertical-2']);assert.equal(bounds.width,0);assert.equal(bounds.height,100);const next=applyPaperCommand(doc,preparePaperSelectionScale(doc,'page-a',['vertical','vertical-2'],2,'top-left').command!);assert.ok(isPaperDocument(next));assert.equal(next.objects[1].height,40);assert.equal(next.objects[1].y,160);
 doc.objects=doc.objects.map(value=>({...value,y:0,height:0}));assert.throws(()=>preparePaperSelectionScale(doc,'page-a',['vertical','vertical-2'],2));
});

test('A bounded dense stroke keeps every sample and derived render pressure without fabricating device pressure',()=>{
 const doc=fixture(),points=Array.from({length:1025},(_,i)=>({x:i/4,y:Math.sin(i/20)*10,time:i*2,...(i%2?{pressure:.25+(i%4)/8}:{renderPressure:.6}),tiltX:10,tiltY:-5,twist:120}));doc.objects[0]={...doc.objects[0],points};const source=structuredClone(points),next=commandObjects(preparePaperSelectionScale(doc,'page-a',['ink','shape'],2).command).find(value=>value.id==='ink')!;
 assert.equal(next.points!.length,source.length);for(let i=0;i<source.length;i++){const {x,y,...sensors}=source[i],{x:nx,y:ny,...retained}=next.points![i];assert.deepEqual(retained,sensors);assert.equal(nx,x*2);assert.equal(ny,y*2);assert.equal(Object.hasOwn(next.points![i],'pressure'),Object.hasOwn(source[i],'pressure'));}assert.deepEqual(points,source);
});
