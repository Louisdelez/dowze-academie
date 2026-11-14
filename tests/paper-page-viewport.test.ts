import test from 'node:test';
import assert from 'node:assert/strict';
import {createPaperPageViewportLayout,capturePaperPageViewportAnchor,restorePaperPageViewportAnchor,projectPaperPageViewportWindow,MAX_PAPER_VIEWPORT_PHYSICAL_EXTENT,MAX_PAPER_VIEWPORT_MOUNTED_PAGES,MAX_PAPER_VIEWPORT_PINNED_PAGES} from '../src/lib/paperPageViewport.ts';

const close=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<=Math.max(1,Math.abs(expected))*1e-10,`${actual} ≠ ${expected}`);
const pages=Object.freeze([Object.freeze({id:'a',width:800,height:1000}),Object.freeze({id:'b',width:1000,height:2000}),Object.freeze({id:'c',width:600,height:500})]);

test('A large valid empty gap retains physical scroll reserve and can reach the next page without an explicit jump',()=>{
 const source=[{id:'gap-a',width:100,height:100},{id:'gap-b',width:100,height:100}],layout=createPaperPageViewportLayout(source,{zoom:1,gap:600000});
 for(const overscan of [0,500]){
  let logical=0,reached=false;
  for(let index=0;index<1500;index++){
   const view=projectPaperPageViewportWindow(layout,{logicalScroll:logical,viewportHeight:500,overscan});
   close(view.originOffset+view.physicalScroll,logical);assert.ok(view.physicalExtent<=MAX_PAPER_VIEWPORT_PHYSICAL_EXTENT);
   if(view.visiblePageIds.includes('gap-b')){reached=true;break;}
   const maximum=view.physicalExtent-500;assert.ok(maximum>view.physicalScroll,'The native scrollbar must have room to progress through the empty gap');
   logical=view.originOffset+Math.min(maximum,view.physicalScroll+500);
  }
  assert.equal(reached,true,'Scrolling must eventually reach the second page');
 }
 assert.deepEqual(source,[{id:'gap-a',width:100,height:100},{id:'gap-b',width:100,height:100}]);
});

test('Variable page geometry has deterministic prefix offsets and stable page keys without mutating the source',()=>{
 const original=structuredClone(pages),layout=createPaperPageViewportLayout(pages,{zoom:.5,gap:24});
 assert.deepEqual(layout.slots.map(slot=>[slot.key,slot.top,slot.bottom]),[['a',0,500],['b',524,1524],['c',1548,1798]]);
 close(layout.totalHeight,1798);close(layout.maxWidth,500);assert.deepEqual(pages,original);
 assert.ok(Object.isFrozen(layout));assert.ok(Object.isFrozen(layout.slots));assert.ok(layout.slots.every(Object.isFrozen));
 const reordered=createPaperPageViewportLayout([pages[2],pages[0],pages[1]],{zoom:.5});
 assert.deepEqual(reordered.slots.map(slot=>slot.key),['c','a','b']);
});

test('A page-coordinate anchor survives continuous/single switching and zoom without a document command',()=>{
 const before=createPaperPageViewportLayout(pages,{zoom:.5}),after=createPaperPageViewportLayout(pages,{zoom:1}),anchor=capturePaperPageViewportAnchor(before,{mode:'continuous',logicalScroll:600,viewportOffset:100});
 assert.deepEqual(anchor,{pageId:'b',pageY:352,viewportOffset:100});
 const single=restorePaperPageViewportAnchor(anchor,after,{mode:'single',viewportHeight:300});
 close(single.pageScroll,252);close(single.logicalScroll,1276);assert.equal(single.usedFallback,false);
 const captured=capturePaperPageViewportAnchor(after,{mode:'single',pageId:single.pageId,pageScroll:single.pageScroll,viewportOffset:single.anchor.viewportOffset});
 assert.deepEqual(captured,anchor);
 const continuous=restorePaperPageViewportAnchor(captured,before,{mode:'continuous',viewportHeight:300});
 close(continuous.logicalScroll,600);assert.deepEqual(continuous.anchor,anchor);
});

test('Resize/reorder retain the page ID and coordinate; removal chooses surviving old neighbors deterministically',()=>{
 const before=createPaperPageViewportLayout(pages,{zoom:1}),anchor={pageId:'b',pageY:352,viewportOffset:100};
 const reordered=createPaperPageViewportLayout([pages[1],pages[2],pages[0]],{zoom:1}),restored=restorePaperPageViewportAnchor(anchor,reordered,{mode:'continuous',viewportHeight:300,previousLayout:before});
 close(restored.logicalScroll,252);assert.equal(restored.anchor.pageY,352);assert.equal(restored.pageId,'b');
 const resized=createPaperPageViewportLayout([pages[0],{...pages[1],height:300},pages[2]],{zoom:1});
 assert.equal(restorePaperPageViewportAnchor(anchor,resized,{mode:'continuous',viewportHeight:300}).anchor.pageY,300);
 const removed=createPaperPageViewportLayout([pages[0],pages[2]],{zoom:1}),next=restorePaperPageViewportAnchor(anchor,removed,{mode:'continuous',viewportHeight:300,previousLayout:before});
 assert.equal(next.pageId,'c');assert.equal(next.anchor.pageY,0);assert.equal(next.usedFallback,true);
 const previous=restorePaperPageViewportAnchor({pageId:'c',pageY:100,viewportOffset:50},createPaperPageViewportLayout(pages.slice(0,2),{zoom:1}),{mode:'continuous',viewportHeight:300,previousLayout:before});
 assert.equal(previous.pageId,'b');assert.equal(previous.anchor.pageY,2000);
 const allReplaced=restorePaperPageViewportAnchor(anchor,createPaperPageViewportLayout([{id:'new',width:500,height:500}],{zoom:1}),{mode:'single',viewportHeight:300,previousLayout:before});
 assert.equal(allReplaced.pageId,'new');assert.equal(allReplaced.anchor.pageY,0);
});

test('Gap and end anchors clamp to real page geometry rather than inventing coordinates in page spacers',()=>{
 const layout=createPaperPageViewportLayout(pages,{zoom:.5}),gap=capturePaperPageViewportAnchor(layout,{mode:'continuous',logicalScroll:510});
 assert.deepEqual(gap,{pageId:'b',pageY:0,viewportOffset:14});
 const end=capturePaperPageViewportAnchor(layout,{mode:'continuous',logicalScroll:9000});assert.equal(end.pageId,'c');assert.equal(end.pageY,500);
 const short=restorePaperPageViewportAnchor({pageId:'c',pageY:500,viewportOffset:0},layout,{mode:'single',viewportHeight:300});
 assert.equal(short.pageScroll,0);assert.equal(short.anchor.viewportOffset,250);
});

test('2000 long pages use logical offsets plus a bounded physical projection and preserve distant pinned controllers',()=>{
 const source=Array.from({length:2000},(_,index)=>({id:`page-${index}`,width:800,height:100000})),original=structuredClone(source),layout=createPaperPageViewportLayout(source,{zoom:4});
 assert.ok(layout.totalHeight>800_000_000);assert.equal(layout.slots.length,2000);
 const logicalScroll=layout.slots[1000].top+2500,window=projectPaperPageViewportWindow(layout,{logicalScroll,viewportHeight:800,overscan:500,pinnedContactPageIds:['page-1000'],pinnedEditorPageIds:['page-0'],pinnedPageIds:['page-1999','deleted-page']});
 assert.ok(window.physicalExtent<=MAX_PAPER_VIEWPORT_PHYSICAL_EXTENT);assert.ok(window.originOffset>MAX_PAPER_VIEWPORT_PHYSICAL_EXTENT);
 close(window.originOffset+window.physicalScroll,logicalScroll);assert.equal(window.visiblePageIds[0],'page-1000');
 for(const id of ['page-0','page-1999']){const slot=window.slots.find(slot=>slot.pageId===id)!;assert.equal(slot.mounted,true);assert.equal(slot.pinned,true);assert.equal(slot.parked,true);assert.equal(slot.physicalTop,null);}
 assert.ok(window.mountedPageIds.length<=8+MAX_PAPER_VIEWPORT_PINNED_PAGES);assert.deepEqual(source,original);assert.ok(Object.isFrozen(window.slots));
 const anchor=capturePaperPageViewportAnchor(layout,{mode:'continuous',logicalScroll}),resized=createPaperPageViewportLayout(source,{zoom:2}),restored=restorePaperPageViewportAnchor(anchor,resized,{mode:'continuous',viewportHeight:1000}),projection=projectPaperPageViewportWindow(resized,{logicalScroll:restored.logicalScroll,viewportHeight:1000});
 close(projection.originOffset+projection.physicalScroll,restored.logicalScroll);assert.equal(restored.pageId,'page-1000');close(restored.anchor.pageY,625);
});

test('Many visible tiny pages remain placeholders beyond the mounted budget; contact/editor pins take priority',()=>{
 const source=Array.from({length:2000},(_,index)=>({id:`tiny-${index}`,width:100,height:100})),layout=createPaperPageViewportLayout(source,{zoom:.001,gap:0}),window=projectPaperPageViewportWindow(layout,{logicalScroll:0,viewportHeight:500,maxMountedPages:3,pinnedContactPageIds:['tiny-1999'],pinnedEditorPageIds:['tiny-0']});
 assert.equal(window.visiblePageIds.length,2000);assert.equal(window.slots.length,2000);assert.equal(window.mountedPageIds.length,5);
 assert.ok(window.mountedPageIds.includes('tiny-0'));assert.ok(window.mountedPageIds.includes('tiny-1999'));assert.ok(window.slots.some(slot=>slot.visible&&!slot.mounted));
});

test('Invalid/oversize geometry is rejected before reading page entries, and nonfinite scroll or excessive pins never grow a window',()=>{
 const oversize=new Array(2001);let reads=0;Object.defineProperty(oversize,0,{get(){reads++;throw Error('Oversize entries must not be read');}});
 assert.throws(()=>createPaperPageViewportLayout(oversize,{zoom:1}),RangeError);assert.equal(reads,0);
 for(const zoom of [0,-1,NaN,Infinity,Number.MAX_VALUE])assert.throws(()=>createPaperPageViewportLayout(pages,{zoom}),RangeError);
 for(const gap of [-1,NaN,Infinity,600001])assert.throws(()=>createPaperPageViewportLayout(pages,{zoom:1,gap}),RangeError);
 assert.throws(()=>createPaperPageViewportLayout([{id:'same',width:100,height:100},{id:'same',width:100,height:100}],{zoom:1}),RangeError);
 assert.throws(()=>createPaperPageViewportLayout([{id:'underflow',width:Number.MIN_VALUE,height:Number.MIN_VALUE}],{zoom:.5}),RangeError);
 const layout=createPaperPageViewportLayout(pages,{zoom:1});
 for(const logicalScroll of [NaN,Infinity])assert.throws(()=>projectPaperPageViewportWindow(layout,{logicalScroll,viewportHeight:500}),RangeError);
 for(const height of [0,NaN,Infinity,600001])assert.throws(()=>projectPaperPageViewportWindow(layout,{logicalScroll:0,viewportHeight:height}),RangeError);
 assert.throws(()=>projectPaperPageViewportWindow(layout,{logicalScroll:0,viewportHeight:500,maxMountedPages:MAX_PAPER_VIEWPORT_MOUNTED_PAGES+1}),RangeError);
 assert.throws(()=>projectPaperPageViewportWindow(layout,{logicalScroll:0,viewportHeight:500,pinnedPageIds:new Array(17).fill('a')}),RangeError);
 assert.throws(()=>capturePaperPageViewportAnchor(layout,{mode:'single',pageId:'missing',pageScroll:0}),RangeError);
 assert.throws(()=>restorePaperPageViewportAnchor({pageId:'a',pageY:NaN,viewportOffset:0},layout,{mode:'continuous',viewportHeight:500}),RangeError);
});

test('Overscan is physically bounded without deleting logical pages, and clamp restores report their actual viewport offset',()=>{
 const source=Array.from({length:100},(_,index)=>({id:`long-${index}`,width:1000,height:100000})),layout=createPaperPageViewportLayout(source,{zoom:6,gap:600000}),window=projectPaperPageViewportWindow(layout,{logicalScroll:50_000_000,viewportHeight:600000,overscan:1e12});
 assert.ok(window.physicalExtent<=MAX_PAPER_VIEWPORT_PHYSICAL_EXTENT);assert.equal(layout.slots.length,100);assert.ok(window.overscan<1e12);
 const restored=restorePaperPageViewportAnchor({pageId:'long-0',pageY:0,viewportOffset:100},layout,{mode:'continuous',viewportHeight:500});
 assert.equal(restored.logicalScroll,0);assert.equal(restored.anchor.viewportOffset,0);
});
