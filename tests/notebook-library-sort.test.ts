import test from 'node:test';
import assert from 'node:assert/strict';
import {sortNotebookLibraryNotes,notebookLibrarySortPreferenceKey,readNotebookLibrarySort,writeNotebookLibrarySort,NOTEBOOK_LIBRARY_SORT_READ_ERROR} from '../src/lib/notebookLibrarySort.ts';

const note=(id:string,title:string,updatedAt='2026-10-15T10:00:00.000Z')=>Object.freeze({id,title,updatedAt,markdown:'Canonical '+id});
const permutations=<T,>(values:readonly T[]):T[][]=>values.length===0?[[]]:values.flatMap((value,index)=>permutations(values.filter((_,at)=>at!==index)).map(rest=>[value,...rest]));
test('French accents, canonical spelling and equal titles have one identity order for every input permutation',()=>{
 const rows=[note('b','École'),note('a','E\u0301COLE'),note('c','ecole'),note('o','Œuvre'),note('z','Zèbre')];
 for(const input of permutations(rows))assert.deepEqual(sortNotebookLibraryNotes(input,'title').map(row=>row.id),['c','a','b','o','z']);
});
test('Equal real instants with different ISO offsets use exact identity rather than the input or timestamp spelling',()=>{
 const rows=[note('b','B','2026-10-15T12:00:00+02:00'),note('a','A','2026-10-15T10:00:00Z'),note('z','Later','2026-10-15T11:00:00Z'),note('old','Invalid','not-a-date')];
 for(const input of permutations(rows))assert.deepEqual(sortNotebookLibraryNotes(input,'updated').map(row=>row.id),['z','a','b','old']);
});
test('Sorting copies only the order and leaves every canonical note and original array exact',()=>{
 const rows=Object.freeze([note('z','Zèbre'),note('a','À lire')]),before=JSON.stringify(rows);
 for(const mode of ['updated','title'] as const){const result=sortNotebookLibraryNotes(rows,mode);assert.notEqual(result,rows);assert.ok(result.every(row=>rows.includes(row)));assert.equal(JSON.stringify(rows),before);}
});
test('Exact account and space keys cannot collide through separators, accents or path-like IDs',()=>{
 const scopes=[{accountId:'a|b',spaceId:'c'},{accountId:'a',spaceId:'b|c'},{accountId:'Équipe/../A',spaceId:'Année 1'},{accountId:'E\u0301quipe/../A',spaceId:'Année 1'}];
 const keys=scopes.map(notebookLibrarySortPreferenceKey);assert.equal(new Set(keys).size,scopes.length);assert.ok(keys.every(key=>!key.startsWith('dowze.')));assert.throws(()=>notebookLibrarySortPreferenceKey({accountId:'',spaceId:'year'}));
});
test('Only the exact scoped setting is read or written; other preferences and note-like values stay intact',()=>{
 const A={accountId:'A',spaceId:'one'},B={accountId:'B',spaceId:'one'},Y={accountId:'A',spaceId:'two'},rows=new Map([[notebookLibrarySortPreferenceKey(B),JSON.stringify({schema:1,sort:'updated'})],['canonical-note','DO NOT CHANGE']]),readKeys:string[]=[],writtenKeys:string[]=[];
 const storage={getItem:(key:string)=>{readKeys.push(key);return rows.get(key)??null;},setItem:(key:string,value:string)=>{writtenKeys.push(key);rows.set(key,value);}};
 assert.deepEqual(readNotebookLibrarySort(A,()=>storage),{sort:'updated',notice:''});assert.equal(writeNotebookLibrarySort(A,'title',()=>storage),true);assert.equal(readNotebookLibrarySort(A,()=>storage).sort,'title');assert.equal(readNotebookLibrarySort(Y,()=>storage).sort,'updated');
 assert.deepEqual(writtenKeys,[notebookLibrarySortPreferenceKey(A)]);assert.deepEqual(readKeys,[notebookLibrarySortPreferenceKey(A),notebookLibrarySortPreferenceKey(A),notebookLibrarySortPreferenceKey(Y)]);assert.equal(rows.get('canonical-note'),'DO NOT CHANGE');assert.equal(rows.get(notebookLibrarySortPreferenceKey(B)),JSON.stringify({schema:1,sort:'updated'}));
});
test('Malformed, future or oversized preference data falls back visibly without rewriting the original',()=>{
 const scope={accountId:'A',spaceId:'year'};
 for(const raw of ['{',JSON.stringify({schema:2,sort:'title'}),JSON.stringify({schema:1,sort:'other'}),JSON.stringify({schema:1,sort:'title',unexpected:true}),'x'.repeat(129)]){
  let writes=0;const storage={getItem:()=>raw,setItem:()=>{writes++;}};assert.deepEqual(readNotebookLibrarySort(scope,()=>storage),{sort:'updated',notice:NOTEBOOK_LIBRARY_SORT_READ_ERROR});assert.equal(writes,0);
 }
});
test('Denied storage access and quota return explicit failure without crashing or falsely confirming persistence',()=>{
 const scope={accountId:'A',spaceId:'year'},denied=()=>{throw Error('Synthetic denied local storage');};
 assert.deepEqual(readNotebookLibrarySort(scope,denied),{sort:'updated',notice:NOTEBOOK_LIBRARY_SORT_READ_ERROR});assert.equal(writeNotebookLibrarySort(scope,'title',denied),false);
 const rows=new Map([[notebookLibrarySortPreferenceKey(scope),JSON.stringify({schema:1,sort:'updated'})]]),before=JSON.stringify([...rows]);
 assert.equal(writeNotebookLibrarySort(scope,'title',()=>({setItem(){throw Error('Synthetic quota');}})),false);assert.equal(JSON.stringify([...rows]),before);
});
