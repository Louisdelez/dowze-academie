import test from 'node:test';
import assert from 'node:assert/strict';
import {createPaperPageWriterRegistry,PAPER_PAGE_WRITER_MAX_FLOW_PAGES,type PaperPageWriter,type PaperPageWriterScope,type PaperPageWriterOwner,type PaperPageWriterLease,type PaperPageWriterPreservation} from '../src/lib/paperPageWriterRegistry.ts';

const api={};
const scope=(patch:Partial<PaperPageWriterScope>={}):PaperPageWriterScope=>({accountId:'account',spaceId:'space',noteId:'note-A',api,generation:1,...patch});
const deferred=()=>{let resolve!:()=>void,reject!:(error:unknown)=>void;const promise=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const preserved=():PaperPageWriter=>({flush:()=>{},settled:()=>true});
const acquire=(owner:PaperPageWriterOwner,writer:PaperPageWriter=preserved(),objectId='flow'):PaperPageWriterLease=>{
 const result=owner.acquire({objectId,sourcePageId:'first',pageId:'first',pageIds:['first','second','third'],writer});assert.equal(result.status,'acquired');if(result.status!=='acquired')throw Error('Expected a writer');return result.lease;
};

test('Only the source page owns one editor/reflow writer; continuation caret pins do not mount every flow page',async()=>{
 const registry=createPaperPageWriterRegistry(),owner=registry.activate(scope()),lease=acquire(owner);let writes=0;
 assert.equal(lease.commit(current=>{assert.equal(current(),true);writes++;return true;}),true);assert.equal(writes,1);
 assert.deepEqual(owner.acquire({objectId:'flow',sourcePageId:'first',pageId:'second',pageIds:['first','second'],writer:preserved()}),{status:'readonly',reason:'continuation'});
 assert.deepEqual(owner.acquire({objectId:'flow',sourcePageId:'first',pageId:'first',role:'continuation',writer:preserved()}),{status:'readonly',reason:'continuation'});
 assert.deepEqual(owner.acquire({objectId:'flow',sourcePageId:'first',pageId:'first',writer:preserved()}),{status:'readonly',reason:'already-owned'});
 lease.activity({dirty:true,caretPageId:'second'});const pins=registry.pins();assert.deepEqual(pins.map(pin=>pin.pageId),['first','second']);assert.deepEqual(pins[0].reasons,['dirty','caret']);assert.deepEqual(pins[1].reasons,['caret']);assert.ok(!pins.some(pin=>pin.pageId==='third'));
 lease.activity({caretPageId:null});assert.equal((await lease.evict()).status,'released');assert.equal(lease.current(),false);assert.equal(registry.pins().length,0);
});

test('An observed note A→B→A never revives old callbacks and returning A waits for its accepted text preservation',async()=>{
 const registry=createPaperPageWriterRegistry(),original=scope(),ownerA=registry.activate(original),gate=deferred(),log:string[]=[];
 const leaseA=acquire(ownerA,{flush:async context=>{log.push(`flush:${context.scope.noteId}`);assert.equal(context.held(),true);await gate.promise;},settled:context=>{log.push(`saved:${context.scope.noteId}`);return true;}});leaseA.activity({dirty:true});
 assert.equal(registry.activate({...original}),ownerA,'Same observed scope reuses its owner');
 const ownerB=registry.activate(scope({noteId:'note-B'})),leaseB=acquire(ownerB);assert.equal(leaseB.current(),true);assert.equal(leaseA.current(),false);assert.equal(ownerA.current(),false);
 const returned=registry.activate(scope());assert.ok(returned.serial>ownerA.serial);assert.equal(returned.current(),true);assert.equal(leaseA.current(),false);let staleWrites=0;
 assert.equal(leaseA.commit(()=>{staleWrites++;return true;}),false);assert.equal(staleWrites,0);assert.equal(ownerA.acquire({objectId:'other',sourcePageId:'first',pageId:'first',writer:preserved()}).status,'readonly');
 assert.deepEqual(returned.acquire({objectId:'flow',sourcePageId:'first',pageId:'first',writer:preserved()}),{status:'readonly',reason:'preserving'});
 const pending=leaseA.evict('scope-change');gate.resolve();assert.equal((await pending).status,'released');assert.deepEqual(log,['flush:note-A','saved:note-A']);assert.equal(acquire(returned).current(),true);
 await registry.close();
});

test('API and generation replacement use exact identity, including stable offline ownership and API ABA',async()=>{
 const registry=createPaperPageWriterRegistry(),offline=registry.activate(scope({api:undefined})),local=acquire(offline);assert.equal(local.commit(current=>current()),true);
 const online=registry.activate(scope({api:{}}));assert.equal(local.current(),false);assert.deepEqual(online.acquire({objectId:'flow',sourcePageId:'first',pageId:'first',writer:preserved()}),{status:'readonly',reason:'preserving'});await local.evict('scope-change');const onlineLease=acquire(online);
 const offlineAgain=registry.activate(scope({api:undefined}));assert.equal(onlineLease.current(),false);assert.equal(local.current(),false);await onlineLease.evict('scope-change');const latest=acquire(offlineAgain);
 const nextGeneration=registry.activate(scope({api:undefined,generation:2}));assert.equal(latest.current(),false);await latest.evict('scope-change');assert.equal(acquire(nextGeneration).current(),true);await registry.close();
});

test('Eviction waits for flush then explicit settlement, shares a single attempt and retains its own pins',async()=>{
 const registry=createPaperPageWriterRegistry(),gate=deferred(),log:string[]=[];let context:PaperPageWriterPreservation|undefined;
 const lease=acquire(registry.activate(scope()),{flush:value=>{context=value;log.push('flush');},settled:async value=>{assert.equal(value,context);log.push('settled-start');await gate.promise;log.push('settled-end');return true;}});lease.activity({dirty:true});
 const pending=lease.evict(),again=lease.evict();assert.equal(pending,again);assert.equal(lease.current(),false);assert.equal(lease.snapshot().state,'settling');assert.ok(registry.pins()[0].reasons.includes('preservation'));
 await Promise.resolve();await Promise.resolve();assert.deepEqual(log,['flush','settled-start']);assert.equal(context!.held(),true);assert.equal(registry.pins().length,1);gate.resolve();assert.equal((await pending).status,'released');
 assert.equal(context!.held(),false);assert.equal(registry.pins().length,0);assert.equal(lease.snapshot().activity.dirty,false);assert.deepEqual(log,['flush','settled-start','settled-end']);assert.equal((await lease.evict()).status,'released');
});

test('Viewport eviction preserves live caret and composition without flushing or revoking the editor',async()=>{
 const registry=createPaperPageWriterRegistry();let flushes=0;const lease=acquire(registry.activate(scope()),{flush:()=>{flushes++;},settled:()=>true});
 lease.activity({dirty:true,composing:true});assert.deepEqual(await lease.evict(),{status:'pinned',reason:'composition'});assert.equal(lease.current(),true);assert.equal(flushes,0);
 lease.activity({composing:false,caretPageId:'third'});assert.deepEqual(await lease.evict(),{status:'pinned',reason:'caret'});assert.equal(flushes,0);assert.deepEqual(registry.pins().map(pin=>pin.pageId),['first','third']);
 lease.activity({caretPageId:null});assert.equal((await lease.evict()).status,'released');assert.equal(flushes,1);
});

test('A failed flush retains the writer, source buffer and pins; another note can still acquire its independent object',async()=>{
 const registry=createPaperPageWriterRegistry(),buffer={markdown:'Accepted original text'},before={...buffer};let fail=true;
 const writer:PaperPageWriter={flush:()=>{if(fail)throw Error('storage offline');},settled:()=>true},owner=registry.activate(scope()),lease=acquire(owner,writer);lease.activity({dirty:true});
 const failure=await lease.evict();assert.equal(failure.status,'blocked');assert.equal(failure.reason,'failure');assert.match(String(failure.error),/storage offline/);assert.equal(lease.snapshot().state,'blocked');assert.equal(lease.current(),false);assert.equal(registry.pins().length,1);assert.deepEqual(buffer,before);
 assert.deepEqual(owner.acquire({objectId:'flow',sourcePageId:'first',pageId:'first',writer:preserved()}),{status:'readonly',reason:'preserving'});
 const otherOwner=registry.activate(scope({noteId:'note-B'})),other=acquire(otherOwner);assert.equal(other.current(),true);fail=false;assert.equal((await lease.evict('scope-change')).status,'released');assert.equal(other.current(),true);await registry.close();assert.deepEqual(buffer,before);
});

test('Flush refusal and missing preservation acknowledgement cannot release accepted input',async()=>{
 const registry=createPaperPageWriterRegistry();let allowFlush=false,allowSettlement=false,settlements=0;
 const lease=acquire(registry.activate(scope()),{flush:()=>allowFlush,settled:()=>{settlements++;return allowSettlement;}});lease.activity({dirty:true});
 assert.deepEqual(await lease.evict(),{status:'blocked',reason:'flush-refused'});assert.equal(settlements,0);assert.equal(registry.pins().length,1);allowFlush=true;
 assert.deepEqual(await lease.evict(),{status:'blocked',reason:'unpreserved'});assert.equal(lease.snapshot().activity.dirty,true);allowSettlement=true;assert.equal((await lease.evict()).status,'released');assert.equal(settlements,2);
 const unresolved=acquire(registry.activate(scope()),{flush:()=>{},settled:()=>undefined as unknown as boolean});unresolved.activity({dirty:true});assert.equal((await unresolved.evict()).reason,'unpreserved');assert.equal(registry.pins().length,1);
});

test('Accepted text arriving during preservation requires a new flush and never marks a newer version clean',async()=>{
 const registry=createPaperPageWriterRegistry(),gate=deferred(),buffer={markdown:'before'},saved:string[]=[];let first=true;
 const lease=acquire(registry.activate(scope()),{flush:async()=>{saved.push(buffer.markdown);if(first){first=false;await gate.promise;}},settled:()=>true});lease.activity({dirty:true});
 const pending=lease.evict();await Promise.resolve();buffer.markdown='before plus accepted composition';lease.activity({dirty:true});gate.resolve();
 assert.deepEqual(await pending,{status:'blocked',reason:'changed-during-preservation'});assert.deepEqual(saved,['before']);assert.equal(lease.snapshot().activity.dirty,true);assert.equal(lease.snapshot().version,2);assert.equal(registry.pins().length,1);
 assert.equal((await lease.evict()).status,'released');assert.deepEqual(saved,['before','before plus accepted composition']);assert.equal(buffer.markdown,'before plus accepted composition');assert.equal(lease.snapshot().activity.dirty,false);
});

test('Scope retirement never aborts live composition: preserve its raw text, retain the host, then retry after completion',async()=>{
 const registry=createPaperPageWriterRegistry(),buffer={markdown:'日本',composing:true},saved:string[]=[];
 const owner=registry.activate(scope()),lease=acquire(owner,{flush:context=>{assert.equal(context.scope.noteId,'note-A');assert.equal(context.held(),true);saved.push(buffer.markdown);},settled:()=>true});lease.activity({dirty:true,composing:true,caretPageId:'second'});
 const results=await owner.settle();assert.deepEqual(results,[{status:'blocked',reason:'composition'}]);assert.equal(buffer.composing,true);assert.equal(lease.current(),false);assert.deepEqual(registry.pins().map(pin=>pin.pageId),['first','second']);
 buffer.markdown='日本語';buffer.composing=false;lease.activity({composing:false,dirty:true});assert.equal((await lease.evict('close')).status,'released');assert.deepEqual(saved,['日本','日本語']);assert.equal(registry.pins().length,0);
});

test('Canonical scopes/pages are captured independently and malformed large flows refuse before reading entries',async()=>{
 const registry=createPaperPageWriterRegistry(),input=scope(),owner=registry.activate(input),pages=['first','second'];
 const result=owner.acquire({objectId:'flow',sourcePageId:'first',pageId:'first',pageIds:pages,writer:preserved()});assert.equal(result.status,'acquired');if(result.status!=='acquired')throw Error('Expected lease');const lease=result.lease;
 input.noteId='mutated';input.generation=9;pages[1]='mutated';assert.equal(lease.snapshot().scope.noteId,'note-A');assert.equal(lease.snapshot().scope.generation,1);assert.deepEqual(lease.snapshot().pageIds,['first','second']);
 lease.activity({dirty:true,caretPageId:'second'});const snapshot=lease.snapshot();lease.activity({dirty:undefined,composing:undefined,caretPageId:undefined});assert.equal(lease.snapshot().activity.dirty,true);assert.equal(snapshot.activity.caretPageId,'second');
 assert.throws(()=>lease.updatePages(['first']),/caret page/);assert.deepEqual(lease.snapshot().pageIds,['first','second']);assert.throws(()=>lease.updatePages(['first','first']),/Invalid writer pages/);assert.throws(()=>lease.updatePages(['second','first']),/Invalid writer pages/);
 let reads=0;const tooMany=new Array<string>(PAPER_PAGE_WRITER_MAX_FLOW_PAGES+1);Object.defineProperty(tooMany,0,{get:()=>{reads++;throw Error('Must not read oversized flow');}});
 assert.throws(()=>lease.updatePages(tooMany),/Invalid writer pages/);assert.equal(reads,0);assert.throws(()=>owner.acquire({objectId:'other',sourcePageId:'first',pageId:'first',pageIds:tooMany,writer:preserved()}),/Invalid writer pages/);assert.equal(reads,0);
 const growing=['first','second'];Object.defineProperty(growing,0,{get:()=>{growing.length=2001;return 'first';}});assert.throws(()=>lease.updatePages(growing),/Invalid writer pages/);assert.deepEqual(lease.snapshot().pageIds,['first','second']);
 lease.activity({caretPageId:null});lease.updatePages(['first',...Array.from({length:PAPER_PAGE_WRITER_MAX_FLOW_PAGES-1},(_,i)=>`page-${i}`)]);assert.equal(lease.snapshot().pageIds.length,2000);assert.equal(registry.pins().length,1);await registry.close();
});

test('Preservation captures method identity and receiver, and reentrant eviction shares the installed promise',async()=>{
 const registry=createPaperPageWriterRegistry(),gate=deferred();let lease!:PaperPageWriterLease,nested:Promise<unknown>|undefined,flushes=0,settlements=0;
 const writer={marker:'source',flush(){assert.equal(this.marker,'source');flushes++;nested=lease.evict('close');return gate.promise;},settled(){assert.equal(this.marker,'source');settlements++;return true;}};
 lease=acquire(registry.activate(scope()),writer);writer.flush=()=>{throw Error('A later callback replacement must not run');};const pending=lease.evict();await Promise.resolve();assert.equal(nested,pending);assert.equal(flushes,1);assert.equal(lease.current(),false);gate.resolve();assert.equal((await pending).status,'released');assert.equal(settlements,1);
});

test('Close awaits every writer and reports retained failures without unpinning or replacing them',async()=>{
 const registry=createPaperPageWriterRegistry(),owner=registry.activate(scope()),gate=deferred();let accepted=false;
 const first=acquire(owner,{flush:()=>{},settled:async()=>{await gate.promise;return true;}},'first-object'),second=acquire(owner,{flush:()=>{},settled:()=>accepted},'second-object');first.activity({dirty:true});second.activity({dirty:true});
 const pending=registry.close();assert.equal(first.current(),false);assert.equal(second.current(),false);assert.equal(registry.pins().length,2);gate.resolve();const results=await pending;assert.equal(results.filter(result=>result.status==='released').length,1);assert.equal(results.filter(result=>result.status==='blocked').length,1);assert.equal(registry.pins().length,1);assert.equal(registry.pins()[0].objectId,'second-object');
 const returned=registry.activate(scope());assert.deepEqual(returned.acquire({objectId:'second-object',sourcePageId:'first',pageId:'first',writer:preserved()}),{status:'readonly',reason:'preserving'});accepted=true;assert.equal((await second.evict('close')).status,'released');assert.equal(acquire(returned,preserved(),'second-object').current(),true);await registry.close();
});
