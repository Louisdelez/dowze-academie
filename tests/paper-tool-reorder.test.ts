import test from 'node:test';
import assert from 'node:assert/strict';
import {createPaperToolReorderSession,paperToolReorderIndex,MAX_PAPER_TOOL_REORDER_ITEMS,type PaperToolReorderTarget,type PaperToolReorderView} from '../src/lib/paperToolReorder.ts';
import {applyPaperToolPreferenceCommand,defaultPaperToolPreferences} from '../src/lib/paperToolPreferences.ts';
const deferred=<T,>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes;});return {promise,resolve};};

test('Ordered measured rows choose exact pointer destinations; invalid geometry or duplicate identities cannot admit a gesture',()=>{
 const ids=['pen-a','pen-b','text'],rows=ids.map((id,index)=>({id,top:10+index*48,bottom:54+index*48})),before=structuredClone(rows);
 assert.equal(paperToolReorderIndex(ids,rows,-30),0);assert.equal(paperToolReorderIndex(ids,rows,57),1);assert.equal(paperToolReorderIndex(ids,rows,200),2);assert.deepEqual(rows,before);
 assert.equal(paperToolReorderIndex(ids,[rows[1],rows[0],rows[2]],60),null);assert.equal(paperToolReorderIndex(ids,[rows[0],{...rows[1],top:20},rows[2]],60),null);assert.equal(paperToolReorderIndex(ids,[rows[0],{...rows[1],bottom:NaN},rows[2]],60),null);assert.equal(paperToolReorderIndex(ids,rows,Infinity),null);
 const source={},make=(values:readonly string[])=>createPaperToolReorderSession({source,target:'global',ids:values,id:'pen-a',view:()=>({source,target:'global',ids:values}),current:()=>true,onReorder:async()=>true});
 assert.throws(()=>make(['pen-a','pen-a']));assert.throws(()=>make(['pen-a',...Array.from({length:MAX_PAPER_TOOL_REORDER_ITEMS},(_,index)=>'pen-'+index)]));const session=make(ids);assert.deepEqual(session.preview(2),['pen-b','text','pen-a']);assert.deepEqual(ids,['pen-a','pen-b','text']);assert.equal(session.preview(-1),null);assert.equal(session.preview(3),null);assert.ok(Object.isFrozen(session.order()));
});

test('One accepted reorder preserves distinct duplicate presets and selected tool; reentrant commits share the original Promise',async()=>{
 const source={},original=applyPaperToolPreferenceCommand(defaultPaperToolPreferences(),{type:'duplicate',id:'paper-tool-pen'},()=> 'pen-second'),second=original.toolbar.find(slot=>slot.id==='pen-second')!;second.preset={...second.preset,color:'#aabbcc',width:7,opacity:.25};const before=structuredClone(original),ids=original.toolbar.map(slot=>slot.id),target:PaperToolReorderTarget='note',receipt=deferred<boolean>();let calls=0,next=original,reentrant:Promise<boolean>|null=null,session:ReturnType<typeof createPaperToolReorderSession>;
 session=createPaperToolReorderSession({source,target,ids,id:'pen-second',view:()=>({source,target,ids}),current:()=>true,onReorder:(order,admittedTarget)=>{calls++;assert.equal(admittedTarget,'note');reentrant=session.commit();next=applyPaperToolPreferenceCommand(original,{type:'reorder',ids:[...order]});return receipt.promise;}});
 session.preview(0);const first=session.commit(),again=session.commit();assert.equal(first,again);assert.equal(first,reentrant);assert.equal(calls,1);assert.equal(session.pending(),true);assert.equal(next.toolbar[0].id,'pen-second');assert.equal(next.activeSlotId,before.activeSlotId);for(const slot of before.toolbar)assert.deepEqual(next.toolbar.find(item=>item.id===slot.id),slot,'A reordered instance retains every preset field and identity');assert.deepEqual(original,before,'The original preference snapshot is never mutated');receipt.resolve(true);assert.equal(await first,true);assert.equal(session.pending(),false);assert.equal(await session.commit(),true);assert.equal(calls,1);
});

test('Source target order permission and cancellation retire gestures permanently; an accepted original is joined without redirecting its publisher',async()=>{
 const ids=['a','b','c'];
 for(const change of ['source','target','order','disabled','permission','cancel'] as const){const source={},other={},view:PaperToolReorderView={source,target:'global',ids},original=structuredClone(ids);let permission=true,calls=0;
  const session=createPaperToolReorderSession({source,target:'global',ids,id:'a',view:()=>view,current:()=>permission,onReorder:async()=>{calls++;return true;}});session.preview(2);
  if(change==='source')view.source=other;if(change==='target')view.target='note';if(change==='order')view.ids=['b','a','c'];if(change==='disabled')view.disabled=true;if(change==='permission')permission=false;if(change==='cancel')session.cancel();assert.equal(session.current(),false,change);
  view.source=source;view.target='global';view.ids=ids;view.disabled=false;permission=true;assert.equal(await session.commit(),false,change+' cannot reactivate on ABA');assert.equal(calls,0);assert.deepEqual(ids,original);
 }
 const source={},target='note' as const,view:PaperToolReorderView={source,target,ids},gate=deferred<boolean>();let admitted=0;const session=createPaperToolReorderSession({source,target,ids,id:'b',view:()=>view,current:()=>true,onReorder:async(order,level)=>{admitted++;assert.deepEqual(order,['a','c','b']);assert.equal(level,'note');return gate.promise;}});session.preview(2);const original=session.commit();view.source={};session.cancel();assert.equal(session.current(),false);assert.equal(session.pending(),true,'Retirement does not pretend the admitted writer has settled');assert.equal(session.commit(),original);gate.resolve(true);assert.equal(await original,true);assert.equal(session.pending(),false);assert.equal(admitted,1);
 let writes=0;const refused=createPaperToolReorderSession({source,target,ids,id:'a',view:()=>({source,target,ids}),current:()=>true,onReorder:async()=>{writes++;throw Error('Synthetic durable refusal');}});refused.preview(1);await assert.rejects(refused.commit(),/Synthetic durable refusal/);assert.equal(refused.pending(),false);assert.equal(writes,1);assert.deepEqual(ids,['a','b','c']);
});
