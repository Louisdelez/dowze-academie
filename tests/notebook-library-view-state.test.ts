import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultNotebookLibraryView,isNotebookLibraryViewState,notebookLibraryViewPreferenceKey,readNotebookLibraryView,writeNotebookLibraryView,recentNotebookLibraryNotes,captureNotebookLibraryScroll,restoreNotebookLibraryScroll,NOTEBOOK_LIBRARY_VIEW_READ_ERROR,NOTEBOOK_LIBRARY_RECENT_LIMIT} from '../src/lib/notebookLibraryViewState.ts';
const scope={accountId:'A',spaceId:'year'};
const note=(id:string,date:string,title=id)=>Object.freeze({id,title,updatedAt:date,markdown:'Original '+id});
test('View state round trips exact search, selection, expanded folders and scroll without touching another namespace',()=>{
 const view={...defaultNotebookLibraryView(),mode:'list' as const,filter:'folder',query:'École 📝',picked:['note-A'],expanded:['folder'],main:{top:123,left:4,anchorId:'note-A',anchorOffset:-12}},rows=new Map([['canonical','untouched']]),storage={getItem:(key:string)=>rows.get(key)??null,setItem:(key:string,value:string)=>{rows.set(key,value);}};
 assert.equal(writeNotebookLibraryView(scope,view,()=>storage),true);assert.deepEqual(readNotebookLibraryView(scope,()=>storage),{view,notice:''});assert.equal(rows.get('canonical'),'untouched');assert.equal(rows.size,2);
});
test('Exact tuple keys separate owners and spaces even with separators and canonical Unicode variants',()=>{
 const keys=[{accountId:'a|b',spaceId:'c'},{accountId:'a',spaceId:'b|c'},{accountId:'É',spaceId:'one'},{accountId:'E\u0301',spaceId:'one'}].map(notebookLibraryViewPreferenceKey);assert.equal(new Set(keys).size,4);assert.ok(keys.every(key=>!key.startsWith('dowze.')));assert.throws(()=>notebookLibraryViewPreferenceKey({...scope,accountId:''}));
});
test('Malformed/future/oversized views and nonfinite scroll are rejected without rewriting rejected bytes',()=>{
 for(const value of [{...defaultNotebookLibraryView(),schema:2},{...defaultNotebookLibraryView(),picked:['a','a']},{...defaultNotebookLibraryView(),main:{top:Infinity,left:0,anchorId:null,anchorOffset:0}},{...defaultNotebookLibraryView(),unexpected:true}])assert.equal(isNotebookLibraryViewState(value),false);
 for(const raw of ['{',JSON.stringify({...defaultNotebookLibraryView(),schema:2}),'x'.repeat(512*1024+1)]){let writes=0;const storage={getItem:()=>raw,setItem:()=>{writes++;}};assert.deepEqual(readNotebookLibraryView(scope,()=>storage),{view:defaultNotebookLibraryView(),notice:NOTEBOOK_LIBRARY_VIEW_READ_ERROR});assert.equal(writes,0);}
});
test('Read denial and write quota are explicit failures, never falsely reported durable',()=>{
 const denied=()=>{throw Error('Synthetic denied local storage');};assert.equal(readNotebookLibraryView(scope,denied).notice,NOTEBOOK_LIBRARY_VIEW_READ_ERROR);assert.equal(writeNotebookLibraryView(scope,defaultNotebookLibraryView(),denied),false);assert.equal(writeNotebookLibraryView(scope,defaultNotebookLibraryView(),()=>({setItem(){throw Error('Synthetic quota');}})),false);
});
test('Recent activity is modification time with exact ID ties, independent of title preference and input order',()=>{
 const a=note('a','2026-10-15T10:00:00Z','Zèbre'),b=note('b','2026-10-15T12:00:00+02:00','Avant'),newer=note('z','2026-10-15T11:00:00Z');for(const rows of [[a,b,newer],[b,newer,a],[newer,b,a]])assert.deepEqual(recentNotebookLibraryNotes(rows,{}).map(row=>row.id),['z','a','b']);
});
test('Recent collection is the newest thirty unique accessible IDs, excludes trash and invalid dates, and preserves sources',()=>{
 const rows=Object.freeze([...Array.from({length:40},(_,i)=>note('n'+String(i).padStart(2,'0'),new Date(1760522400000+i*1000).toISOString())),note('n39','2026-01-01T00:00:00Z'),note('invalid','not-a-date'),note('trash','2027-01-01T00:00:00Z')]),before=JSON.stringify(rows),result=recentNotebookLibraryNotes(rows,{trash:{deletedAt:'2026-10-15T00:00:00Z'}});
 assert.equal(result.length,NOTEBOOK_LIBRARY_RECENT_LIMIT);assert.equal(new Set(result.map(row=>row.id)).size,30);assert.equal(result[0].id,'n39');assert.equal(result.at(-1)?.id,'n10');assert.ok(result.every(row=>rows.includes(row)));assert.equal(JSON.stringify(rows),before);
});
test('Latest duplicate incarnation wins by activity without duplicating or rewriting its canonical row',()=>{
 const old=note('same','2026-10-10T00:00:00Z'),fresh=note('same','2026-10-15T00:00:00Z');for(const rows of [[old,fresh],[fresh,old]])assert.deepEqual(recentNotebookLibraryNotes(rows,{}),[fresh]);
});
test('A sticky toolbar excludes covered cards from the anchor; missing toolbar preserves the original viewport coordinate system',()=>{
 const box=(top:number,bottom:number)=>({top,bottom,height:bottom-top}),covered={dataset:{libraryNoteId:'covered'},getBoundingClientRect:()=>box(120,170)},target={dataset:{libraryNoteId:'visible'},getBoundingClientRect:()=>box(190,250)};
 let toolbar:{getBoundingClientRect:()=>ReturnType<typeof box>}|null={getBoundingClientRect:()=>box(100,180)};
 const node={scrollTop:1000,scrollLeft:0,getBoundingClientRect:()=>box(100,500),querySelector:()=>toolbar,querySelectorAll:()=>[covered,target]} as unknown as HTMLElement;
 const position=captureNotebookLibraryScroll(node,true);assert.deepEqual(position,{top:1000,left:0,anchorId:'visible',anchorOffset:10});target.getBoundingClientRect=()=>box(500,540);restoreNotebookLibraryScroll(node,position);assert.equal(node.scrollTop,1310);
 toolbar=null;node.scrollTop=1000;assert.equal(captureNotebookLibraryScroll(node,true).anchorId,'covered');assert.equal(captureNotebookLibraryScroll(node,true).anchorOffset,20);
});

test('A fresh scroller establishes its saved sticky context before restoring the same visible anchor',()=>{
 for(const heading of [83,99]){
  let top=0,left=0;const measured:{top:number;left:number}[]=[],box=(y:number,height:number)=>({top:y,bottom:y+height,height});
  const target={dataset:{libraryNoteId:'accepted-note'},getBoundingClientRect:()=>{measured.push({top,left});return box(1184-top,60);}};
  const toolbar={getBoundingClientRect:()=>{measured.push({top,left});return box(100+Math.max(0,heading-top),80);}};
  const node={get scrollTop(){return top;},set scrollTop(value:number){top=value;},get scrollLeft(){return left;},set scrollLeft(value:number){left=value;},getBoundingClientRect:()=>box(100,400),querySelector:()=>toolbar,querySelectorAll:()=>[target]} as unknown as HTMLElement;
  const saved={top:1000,left:17,anchorId:'accepted-note',anchorOffset:4};
  restoreNotebookLibraryScroll(node,saved);
  assert.equal(node.scrollTop,1000,'The original heading must not be added to the restored offset');assert.equal(node.scrollLeft,17);
  assert.deepEqual(measured,[{top:1000,left:17},{top:1000,left:17}],'Both native rects are measured only after the numeric saved position has established sticky geometry');
  assert.deepEqual(captureNotebookLibraryScroll(node,true),saved,'The exact accepted card and offset remain visible after a real fresh-mount transition');
  // A changed card layout still corrects the anchor after establishing context.
  target.getBoundingClientRect=()=>box(1384-top,60);top=0;left=0;restoreNotebookLibraryScroll(node,saved);
  assert.equal(node.scrollTop,1200);assert.equal(captureNotebookLibraryScroll(node,true).anchorOffset,4);
 }
});
