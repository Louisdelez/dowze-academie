export type NotebookLibrarySort='updated'|'title';
export interface NotebookLibrarySortableNote {readonly id:string;readonly title:string;readonly updatedAt:string}
export interface NotebookLibrarySortScope {readonly accountId:string;readonly spaceId:string}
export interface NotebookLibrarySortStorage {getItem:(key:string)=>string|null;setItem:(key:string,value:string)=>void}
export interface NotebookLibrarySortRead {readonly sort:NotebookLibrarySort;readonly notice:string}
export const NOTEBOOK_LIBRARY_SORT_DEFAULT:NotebookLibrarySort='updated';
export const NOTEBOOK_LIBRARY_SORT_READ_ERROR='Le réglage de tri n’a pas pu être lu. Le tri par dernière modification est utilisé.';
export const NOTEBOOK_LIBRARY_SORT_WRITE_ERROR='Le tri reste appliqué pour cette session, mais n’a pas pu être enregistré sur cet appareil.';
export const isNotebookLibrarySort=(value:unknown):value is NotebookLibrarySort=>value==='updated'||value==='title';
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
const latinCase=(value:string)=>value.replace(/[A-Z]/g,letter=>String.fromCharCode(letter.charCodeAt(0)+32)).replace(/Œ/g,'œ').replace(/Æ/g,'æ');
/** Fixed French-Latin keys, independent of the host's ICU collation version.
 * Base letters group accents; the NFC accent form then breaks that equality.
 * Canonically equivalent spelling and Latin case finally use the exact ID.
 * This is a stable library order, not a complete linguistic collation engine.
 */
const titleKeys=(title:string)=>{
 const decomposed=latinCase(title.normalize('NFD'));
 return [decomposed.replace(/[\u0300-\u036f]/g,'').replace(/[œŒ]/g,'oe').replace(/[æÆ]/g,'ae'),decomposed.normalize('NFC')] as const;
};
export function sortNotebookLibraryNotes<T extends NotebookLibrarySortableNote>(notes:readonly T[],sort:NotebookLibrarySort):T[]{
 const rows=notes.map(note=>{const time=Date.parse(note.updatedAt);return {note,time:Number.isFinite(time)?time:Number.NEGATIVE_INFINITY,title:titleKeys(note.title)};});
 rows.sort((a,b)=>{
  if(sort==='updated'&&a.time!==b.time)return a.time>b.time?-1:1;
  if(sort==='title'){const title=compare(a.title[0],b.title[0])||compare(a.title[1],b.title[1]);if(title)return title;}
  return compare(a.note.id,b.note.id);
 });
 return rows.map(row=>row.note);
}
export function notebookLibrarySortPreferenceKey(scope:NotebookLibrarySortScope):string{
 if(![scope.accountId,scope.spaceId].every(value=>typeof value==='string'&&value.length>0&&value.length<=1000))throw new TypeError('Le périmètre du tri est indisponible.');
 // Deliberately outside the legacy dowze.* device-cache migration namespace.
 // Only this tiny device-local preference is stored, never a note or library.
 return 'paper-library-sort:v1:'+JSON.stringify([scope.accountId,scope.spaceId]);
}
export function readNotebookLibrarySort(scope:NotebookLibrarySortScope,storage:()=>Pick<NotebookLibrarySortStorage,'getItem'>):NotebookLibrarySortRead{
 try{
  const raw=storage().getItem(notebookLibrarySortPreferenceKey(scope));
  if(raw===null)return {sort:NOTEBOOK_LIBRARY_SORT_DEFAULT,notice:''};
  if(raw.length>128)throw Error('Invalid preference');
  const value:unknown=JSON.parse(raw);
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==2||!Object.hasOwn(value,'schema')||!Object.hasOwn(value,'sort')||(value as {schema?:unknown}).schema!==1||!isNotebookLibrarySort((value as {sort?:unknown}).sort))throw Error('Invalid preference');
  return {sort:(value as {sort:NotebookLibrarySort}).sort,notice:''};
 }catch{return {sort:NOTEBOOK_LIBRARY_SORT_DEFAULT,notice:NOTEBOOK_LIBRARY_SORT_READ_ERROR};}
}
export function writeNotebookLibrarySort(scope:NotebookLibrarySortScope,sort:NotebookLibrarySort,storage:()=>Pick<NotebookLibrarySortStorage,'setItem'>):boolean{
 if(!isNotebookLibrarySort(sort))return false;
 try{storage().setItem(notebookLibrarySortPreferenceKey(scope),JSON.stringify({schema:1,sort}));return true;}catch{return false;}
}
