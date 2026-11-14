import test from 'node:test';
import assert from 'node:assert/strict';
import {planPaperInkGestureErase} from '../src/lib/paperInkGestureErase.ts';
import type {InkPoint,PaperCommand,PaperObject,PaperPage} from '../src/lib/notebookDocument.ts';

const page:PaperPage={id:'page',width:794,height:1123,pattern:'plain',color:'#fff',bookmark:false,rotation:0};
const stroke=(points:InkPoint[]=[{x:0,y:0,time:0,pressure:.2,tiltX:10,twist:30},{x:100,y:0,time:100,pressure:.8,tiltX:20,twist:40}]):PaperObject=>({id:'source',pageId:page.id,kind:'ink',x:10,y:20,width:100,height:0,rotation:0,z:1,locked:false,createdAt:0,strokeWidth:2,pen:'pen',points});
const commandsOf=(commands:PaperCommand[]):PaperCommand[]=>commands.flatMap(command=>command.type==='batch'?commandsOf(command.commands):[command]);
const upserts=(commands:PaperCommand[])=>commandsOf(commands).filter((command):command is Extract<PaperCommand,{type:'upsert-object'}>=>command.type==='upsert-object').map(command=>command.object);
const removed=(commands:PaperCommand[])=>commandsOf(commands).filter((command):command is Extract<PaperCommand,{type:'remove-objects'}>=>command.type==='remove-objects').flatMap(command=>command.ids);
const close=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<=Math.max(1,Math.abs(expected))*1e-9,`${actual} ≠ ${expected}`);
const options=(objects:PaperObject[],path:InkPoint[])=>({objects,pages:[page],pageId:page.id,path,radius:5,current:()=>true,yieldNow:()=>Promise.resolve(),sliceMs:16,maxWorkPerSlice:4096});
const dot=(x:number,y:number):InkPoint[]=>[{x,y,time:0}];
const zigzag=(count:number):InkPoint[]=>Array.from({length:count},(_,index)=>({x:index%2?700:0,y:0,time:index}));
const unchanged=(object:PaperObject,before:string,points:InkPoint[])=>{assert.equal(object.points,points);assert.ok(JSON.stringify(object)===before,'Planner must preserve canonical geometry and telemetry');};

test('Distant 20k-point ink and a 250k-point eraser path perform no point/path pair tests or ID allocation',async()=>{
 const points=zigzag(20000),object={...stroke(points),width:700},before=JSON.stringify(object),path=Array.from({length:250000},(_,index)=>({x:index%2?700:0,y:900,time:index}));let ids=0;
 const result=await planPaperInkGestureErase({...options([object],path),makeId:()=>{ids++;return 'unexpected-id';}});
 assert.equal(result.status,'unchanged');assert.equal(result.commands.length,0);assert.equal(result.stats.projectedPoints,points.length);assert.equal(result.stats.pairTests,0);assert.ok(result.stats.yields>0);assert.equal(ids,0);unchanged(object,before,points);
});

test('Cancellation during the first scheduling yield keeps commands and IDs empty',async()=>{
 const points=zigzag(20000),object={...stroke(points),width:700},before=JSON.stringify(object);let allowed=true,yields=0,ids=0;
 const result=await planPaperInkGestureErase({...options([object],dot(300,20)),current:()=>allowed,yieldNow:async()=>{yields++;allowed=false;},makeId:()=>{ids++;return 'unexpected-id';}});
 assert.ok(yields>0);assert.equal(result.status,'cancelled');assert.equal(result.commands.length,0);assert.equal(ids,0);unchanged(object,before,points);
});

test('An in-place baseline geometry change during a yield cancels even while parent current remains true',async()=>{
 const object={...stroke(zigzag(20000)),width:700};let yields=0,ids=0;
 const result=await planPaperInkGestureErase({...options([object],dot(300,20)),yieldNow:async()=>{if(++yields===1)object.x=41;},makeId:()=>{ids++;return 'unexpected-id';}});
 assert.ok(yields>0);assert.equal(result.status,'cancelled');assert.equal(result.commands.length,0);assert.equal(ids,0);assert.equal(object.x,41,'Planner must not overwrite the newer geometry');
});

test('A ready result retains a sticky publication guard through current false then true',async()=>{
 const object=stroke();let allowed=true,ids=0;
 const result=await planPaperInkGestureErase({...options([object],dot(60,20)),current:()=>allowed,makeId:()=>`fragment-${++ids}`});
 assert.equal(result.status,'ready');assert.equal(result.current(),true);allowed=false;assert.equal(result.current(),false);allowed=true;assert.equal(result.current(),false);assert.equal(upserts(result.commands).length,2);assert.equal(ids,2);
});

test('Union of sparse sweep segments clips multiple gaps once, with final independent IDs only',async()=>{
 const object=stroke(),points=object.points!,before=JSON.stringify(object),path=[{x:30,y:20,time:0},{x:30,y:200,time:1},{x:70,y:200,time:2},{x:70,y:20,time:3}];let ids=0;
 const result=await planPaperInkGestureErase({...options([object],path),makeId:()=>`final-fragment-${++ids}`}),fragments=upserts(result.commands);
 assert.equal(result.status,'ready');assert.equal(fragments.length,3);assert.equal(ids,3);assert.equal(new Set(fragments.map(object=>object.id)).size,3);assert.deepEqual(removed(result.commands),[object.id]);
 const ranges=fragments.map(fragment=>[fragment.points![0].x,fragment.points!.at(-1)!.x]);
 close(ranges[0][0],0);close(ranges[0][1],14);close(ranges[1][0],26);close(ranges[1][1],54);close(ranges[2][0],66);close(ranges[2][1],100);
 assert.ok(fragments.every(fragment=>fragment.id!==object.id&&fragment.pageId===page.id));unchanged(object,before,points);
});

test('Original sensor fields survive; geometric cuts use derived renderPressure without fabricated sensor values',async()=>{
 const object=stroke(),points=object.points!,before=JSON.stringify(object);let ids=0;
 const result=await planPaperInkGestureErase({...options([object],dot(60,20)),makeId:()=>`pressure-fragment-${++ids}`}),fragments=upserts(result.commands);
 assert.equal(result.status,'ready');assert.equal(fragments.length,2);
 const first=fragments[0].points![0],last=fragments[1].points!.at(-1)!,left=fragments[0].points!.at(-1)!,right=fragments[1].points![0];
 assert.equal(first.pressure,.2);assert.equal(first.tiltX,10);assert.equal(first.twist,30);assert.equal(last.pressure,.8);assert.equal(last.tiltX,20);assert.equal(last.twist,40);
 assert.equal(left.pressure,undefined);assert.equal(left.tiltX,undefined);assert.equal(left.twist,undefined);close(left.renderPressure!,.464);close(right.renderPressure!,.536);close(left.time,44);close(right.time,56);unchanged(object,before,points);
});

test('Locked ink is retained; isolated partial tangency is unchanged; measured ink uses whole contact deletion',async()=>{
 for(const object of [{...stroke(),locked:true},{...stroke(),strokeWidth:0}]){let ids=0;const before=JSON.stringify(object),result=await planPaperInkGestureErase({...options([object],dot(60,21)),radius:1,makeId:()=>{ids++;return 'unexpected-id';}});assert.equal(result.status,'unchanged');assert.equal(result.commands.length,0);assert.equal(ids,0);assert.ok(JSON.stringify(object)===before);}
 const measured={...stroke(),strokeWidth:0,measurement:{schema:1 as const,kind:'length' as const,unit:'page' as const}},before=JSON.stringify(measured);let ids=0;
 const result=await planPaperInkGestureErase({...options([measured],dot(60,21)),radius:1,makeId:()=>{ids++;return 'unexpected-id';}});
 assert.equal(result.status,'ready');assert.deepEqual(removed(result.commands),[measured.id]);assert.equal(upserts(result.commands).length,0);assert.equal(ids,0);assert.ok(JSON.stringify(measured)===before);
});

test('A configured generated-point budget refuses an edit before IDs or canonical changes',async()=>{
 const object=stroke(),points=object.points!,before=JSON.stringify(object);let ids=0;
 const result=await planPaperInkGestureErase({...options([object],dot(60,20)),maxGeneratedPoints:1,makeId:()=>{ids++;return 'unexpected-id';}});
 assert.equal(result.status,'refused');assert.equal(result.commands.length,0);assert.equal(ids,0);unchanged(object,before,points);
});
