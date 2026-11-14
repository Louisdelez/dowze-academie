import test from 'node:test';
import assert from 'node:assert/strict';
import {advancePaperWritingLoupe,boundPaperWritingLoupeRegion,createPaperWritingLoupeInput,createPaperWritingLoupeRegion,movePaperWritingLoupeRegion,nextPaperWritingLoupeLine,paperWritingLoupeContext,paperWritingLoupeOptions,samePaperWritingLoupeOwner,type PaperWritingLoupeOwner} from '../src/lib/paperWritingLoupe.ts';
import type {PaperInkEvent} from '../src/lib/paperInkInput.ts';
const page={width:800,height:1100,spacing:32},region={x:48,y:64,width:200,height:60,zoom:3},rect={left:100,top:200,width:600,height:180};
const owner=(patch:Partial<PaperWritingLoupeOwner>={}):PaperWritingLoupeOwner=>({ownershipKey:'account|year|note',generation:7,pageId:'page-1',pageWidth:page.width,pageHeight:page.height,pageRotation:90,...patch});
const event=(patch:Partial<PaperInkEvent>={}):PaperInkEvent=>({pointerId:4,pointerType:'pen',isPrimary:true,clientX:130,clientY:230,timeStamp:100,pressure:.25,tiltX:15,tiltY:-30,twist:40,buttons:1,button:0,...patch});
test('Loupe inverse transform writes exactly the canonical page coordinates with all original telemetry',()=>{
 const input=createPaperWritingLoupeInput(),before=structuredClone({region,rect});assert.equal(input.begin(event(),owner(),region,rect,'pencil').status,'started');
 input.append(event({clientX:700,clientY:380,timeStamp:150}),owner(),region,rect,'pencil',[event({clientX:160,clientY:260,timeStamp:120,pressure:.7}),event({clientX:190,clientY:290,timeStamp:140,tiltX:-10})]);
 const result=input.finish(event({clientX:220,clientY:320,timeStamp:160,buttons:0,pressure:0}),owner(),region,rect,'pencil');assert.equal(result.status,'finished');assert.equal(result.stroke!.intent,'pencil');assert.deepEqual(result.stroke!.points,[{x:58,y:74,time:100,pressure:.25,tiltX:15,tiltY:-30,twist:40},{x:68,y:84,time:120,pressure:.7,tiltX:15,tiltY:-30,twist:40},{x:78,y:94,time:140,pressure:.25,tiltX:-10,tiltY:-30,twist:40},{x:88,y:104,time:160,pressure:0,tiltX:15,tiltY:-30,twist:40}]);assert.deepEqual({region,rect},before);
});
test('Coordinates outside a captured loupe remain exact instead of becoming artificial boundary ink',()=>{
 const input=createPaperWritingLoupeInput();input.begin(event(),owner(),region,rect,'pen');const result=input.finish(event({clientX:850,clientY:140,timeStamp:150,buttons:0}),owner(),region,rect,'pen');assert.ok(result.stroke!.points[1].x>region.x+region.width);assert.ok(Math.abs(result.stroke!.points[1].y-44)<1e-10);
});
test('Canonical owner, generation, note/page rotation and tombstones cancel before a loupe result can commit',()=>{
 for(const patch of [{ownershipKey:'other|year|note'},{generation:8},{pageId:'page-2'},{pageWidth:1100,pageHeight:800,pageRotation:180},{tombstoned:true}]){const input=createPaperWritingLoupeInput();input.begin(event(),owner(),region,rect,'pen');const result=input.finish(event({timeStamp:120,buttons:0}),owner(patch),region,rect,'pen');assert.equal(result.status,'cancelled');assert.equal(result.reason,'owner-changed');assert.equal(result.accepted,false);assert.equal(input.snapshot(),null);}
 assert.equal(createPaperWritingLoupeInput().begin(event(),owner({tombstoned:true}),region,rect,'pen').accepted,false);assert.equal(samePaperWritingLoupeOwner(owner(),null),false);assert.equal(paperWritingLoupeContext(owner(),region,{...rect,width:0},'pen'),null);
});
test('Loupe geometry and tool changes during a gesture cancel rather than stretch the preceding samples',()=>{
 for(const [newRegion,newRect,newTool] of [[{...region,x:100},rect,'pen'],[region,{...rect,top:230},'pen'],[{...region,width:100},rect,'pen'],[region,rect,'eraser']] as const){const input=createPaperWritingLoupeInput();input.begin(event(),owner(),region,rect,'pen');const result=input.append(event({timeStamp:120}),owner(),newRegion,newRect,newTool);assert.equal(result.status,'cancelled');assert.equal(result.accepted,false);assert.equal(result.stroke!.points[0].x,58);}
});
test('Finger ink and pen palms keep the same shared input policy inside the loupe',()=>{
 const input=createPaperWritingLoupeInput(),touch=event({pointerType:'touch',pointerId:9,timeStamp:1500,width:10,height:10});assert.equal(input.begin(touch,owner(),region,rect,'pen').reason,'navigation');assert.equal(input.begin({...touch,width:40},owner(),region,rect,'pen',{fingerInk:true}).reason,'palm');assert.equal(input.begin(touch,owner(),region,rect,'pen',{fingerInk:true}).status,'started');assert.equal(input.begin({...touch,pointerId:10,isPrimary:false},owner(),region,rect,'pen',{fingerInk:true}).reason,'multitouch');
 input.begin(event({timeStamp:1800}),owner(),region,rect,'pen');assert.equal(input.begin({...touch,timeStamp:1850},owner(),region,rect,'pen',{fingerInk:true}).reason,'palm');assert.equal(input.finish(event({timeStamp:1900,buttons:0}),owner(),region,rect,'pen').status,'finished');
});
test('Creating and moving a region bounds both zoom and page position for phone/tablet/desktop geometry',()=>{
 for(const viewport of [{width:280,height:168},{width:600,height:180},{width:1400,height:220}])for(const zoom of [-1,1,3,6,99]){const r=createPaperWritingLoupeRegion(page,viewport,zoom,{x:-100,y:2000});assert.ok(r.zoom>=1&&r.zoom<=6);assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=page.width&&r.y+r.height<=page.height);const moved=movePaperWritingLoupeRegion(page,r,10000,-10000);assert.equal(moved.x+ moved.width,page.width);assert.equal(moved.y,0);}
 assert.equal(paperWritingLoupeOptions(page).lineHeight,32);assert.equal(boundPaperWritingLoupeRegion(page,{...region,zoom:NaN,x:Infinity}).x,0);
});
test('Auto advance happens at the trailing band after a stroke and retains overlap without mutating its points',()=>{
 const points=[{x:190,y:70,time:1},{x:215,y:80,time:2}],before=structuredClone(points);assert.equal(advancePaperWritingLoupe(page,region,[{x:100,y:80,time:1}]).moved,false);const advanced=advancePaperWritingLoupe(page,region,points);assert.equal(advanced.region.x,208);assert.equal(advanced.region.y,64);assert.equal(advanced.lineReturned,false);assert.equal(advancePaperWritingLoupe(page,region,points,{autoAdvance:false}).moved,false);assert.deepEqual(points,before);
});
test('Continuous phrases advance through the same page, return to configured left margin and stop at its bottom',()=>{
 let r=region,lines=0,ended=false;for(let index=0;index<300;index++){const next=advancePaperWritingLoupe(page,r,[{x:r.x+r.width*.9,y:r.y+20,time:index}],{lineHeight:32});if(next.lineReturned){assert.equal(next.region.x,48);assert.equal(next.region.y,r.y+32);lines++;}if(next.pageEnd){assert.equal(next.moved,false);assert.deepEqual(next.region,r);ended=true;break;}r=next.region;assert.ok(r.x+r.width<=page.width&&r.y+r.height<=page.height);}
 assert.ok(lines>20);assert.equal(ended,true);
});
test('Manual line return and disabled auto return never wrap into an already written row or make a page',()=>{
 const end={...region,x:552,y:992};assert.equal(advancePaperWritingLoupe(page,end,[{x:750,y:1000,time:2}],{autoReturn:false}).moved,false);const last=nextPaperWritingLoupeLine(page,end);assert.equal(last.pageEnd,true);assert.deepEqual(last.region,end);const moved=nextPaperWritingLoupeLine(page,{...region,x:552},{leftMargin:60,lineHeight:40});assert.equal(moved.region.x,60);assert.equal(moved.region.y,104);
});
