import * as Y from 'yjs';
import {emptyClassification,isNotebookLibrary,type NotebookLibrary,type NoteClassification} from './notebookLibrary.ts';
const lexical=(a:string,b:string)=>a<b?-1:a>b?1:0;
const stable=(value:unknown):unknown=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>lexical(a,b)).map(([k,v])=>[k,stable(v)])):value;
const same=(a:unknown,b:unknown)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
const binary=(value:string)=>{if(value.length>12*1024*1024||value.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw Error('Historique du classement invalide.');return Uint8Array.from(atob(value),c=>c.charCodeAt(0));};
const encoded=(bytes:Uint8Array)=>{if(bytes.length>8*1024*1024)throw Error('L’historique de classement dépasse sa capacité.');const chunks=[];for(let i=0;i<bytes.length;i+=32768)chunks.push(String.fromCharCode(...bytes.subarray(i,i+32768)));return btoa(chunks.join(''));};
const field=(id:string,key:string)=>JSON.stringify([id,key]);
function write(doc:Y.Doc,before:NotebookLibrary|null,after:NotebookLibrary){doc.transact(()=>{
 const folderIds=doc.getMap<boolean>('folder-ids'),folders=doc.getMap('folders');
 for(const old of before?.folders??[])if(!after.folders.some(f=>f.id===old.id)){folderIds.delete(old.id);for(const key of Object.keys(old))folders.delete(field(old.id,key));}
 for(const folder of after.folders){if(!folderIds.has(folder.id))folderIds.set(folder.id,true);const old=before?.folders.find(f=>f.id===folder.id);for(const [key,value] of Object.entries(folder))if(!same(old?.[key as keyof typeof old],value))folders.set(field(folder.id,key),value);}
 const noteIds=doc.getMap<boolean>('note-ids'),notes=doc.getMap('notes');
 for(const [id,note] of Object.entries(after.notes)){
  if(!noteIds.has(id))noteIds.set(id,true);const old=before?.notes[id]??emptyClassification();
  for(const key of ['folderId','favorite','deletedAt'] as const)if(!same(old[key],note[key]))notes.set(field(id,key),note[key]);
  for(const key of ['color','pattern'] as const)if(!same(old.cover?.[key],note.cover?.[key])){if(note.cover?.[key]!==undefined)notes.set(field(id,`cover.${key}`),note.cover[key]);else notes.delete(field(id,`cover.${key}`));}
 }
});}
function read(template:NotebookLibrary,doc:Y.Doc):NotebookLibrary{
 const f=doc.getMap('folders'),n=doc.getMap('notes');const folders=[...doc.getMap('folder-ids').keys()].map(id=>Object.fromEntries(['id','parentId','title','color','order'].map(key=>[key,f.get(field(id,key))])) as unknown as NotebookLibrary['folders'][number]).sort((a,b)=>a.order-b.order||lexical(a.id,b.id));
 const notes=Object.fromEntries([...doc.getMap('note-ids').keys()].sort(lexical).map(id=>{const note:NoteClassification={...emptyClassification()};for(const key of ['folderId','favorite','deletedAt'] as const)if(n.has(field(id,key)))(note as unknown as Record<string,unknown>)[key]=n.get(field(id,key));const color=n.get(field(id,'cover.color')),pattern=n.get(field(id,'cover.pattern'));if(color!==undefined||pattern!==undefined)note.cover={color:String(color??'#f1f4ff'),pattern:(pattern??'plain') as NonNullable<NoteClassification['cover']>['pattern']};return [id,note];}));
 const result={...template,folders,notes};if(!isNotebookLibrary(result))throw Error('Deux changements de classement demandent une résolution. Les versions sont conservées.');return result;
}
function open(value:NotebookLibrary){const doc=new Y.Doc();try{if(value.collaboration){Y.applyUpdate(doc,binary(value.collaboration.state));const restored=read(value,doc);if(!same(restored.folders,[...value.folders].sort((a,b)=>a.order-b.order||lexical(a.id,b.id)))||!same(restored.notes,value.notes))throw Error('Le classement et son historique ne correspondent pas.');}else write(doc,null,value);return doc;}catch(error){doc.destroy();throw error;}}
function scopeHash(key:string){let hash=14695981039346656037n;for(const c of key){hash^=BigInt(c.codePointAt(0)!);hash=BigInt.asUintN(64,hash*1099511628211n);}return hash.toString(16);}
export function amendNotebookLibrary(before:NotebookLibrary,after:NotebookLibrary,scope:string):NotebookLibrary{
 const doc=open(before);try{write(doc,before,after);const lineage=before.collaboration?.lineage??(!before.folders.length&&!Object.keys(before.notes).length?`empty-library-${scopeHash(scope)}`:crypto.randomUUID());const result={...after,collaboration:{schema:1 as const,lineage,state:encoded(Y.encodeStateAsUpdate(doc))}};const restored=read(result,doc);if(!same(restored.notes,result.notes)||!same(restored.folders,[...result.folders].sort((a,b)=>a.order-b.order||lexical(a.id,b.id))))throw Error('Modification de classement incompatible.');return result;}finally{doc.destroy();}
}
export function mergeNotebookLibrary(local:NotebookLibrary,remote:NotebookLibrary):NotebookLibrary|null{
 if(!local.collaboration||!remote.collaboration||local.collaboration.lineage!==remote.collaboration.lineage)return null;const doc=open(local);try{const verified=open(remote);verified.destroy();Y.applyUpdate(doc,binary(remote.collaboration.state));return {...read({...local,revision:Math.max(local.revision,remote.revision)+1,updatedAt:new Date(Math.max(Date.parse(local.updatedAt),Date.parse(remote.updatedAt))).toISOString()},doc),collaboration:{schema:1,lineage:local.collaboration.lineage,state:encoded(Y.encodeStateAsUpdate(doc))}};}finally{doc.destroy();}
}
