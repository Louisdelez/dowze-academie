export interface NoteFolder {id:string;parentId:string|null;title:string;color:string;order:number}
export interface NoteCover {color:string;pattern:'plain'|'ruled'|'grid'|'dots'}
export interface NoteClassification {folderId:string|null;favorite:boolean;deletedAt:string|null;cover?:NoteCover}
export interface NotebookLibrary {schema:1;revision:number;folders:NoteFolder[];notes:Record<string,NoteClassification>;updatedAt:string;collaboration?:{schema:1;lineage:string;state:string}}
export interface NoteClassificationPatch extends Omit<Partial<NoteClassification>,'cover'>{cover?:Partial<NoteCover>|null}
export interface LibraryChange {folder?:NoteFolder;note?:{id:string;patch:NoteClassificationPatch};notes?:{id:string;patch:NoteClassificationPatch}[];removeFolder?:string;folderOrder?:string[];restore?:NotebookLibrary}
export const LIBRARY_DOCUMENT_ID='paper-library-v1';
export const emptyNotebookLibrary=():NotebookLibrary=>({schema:1,revision:0,folders:[],notes:{},updatedAt:new Date().toISOString()});
export const emptyClassification=():NoteClassification=>({folderId:null,favorite:false,deletedAt:null});
export function folderDepth(folders:NoteFolder[],id:string|null):number{
 let depth=0;const seen=new Set<string>();while(id){if(seen.has(id))throw Error('Un dossier ne peut pas contenir son parent.');seen.add(id);const folder=folders.find(f=>f.id===id);if(!folder)throw Error('Dossier introuvable.');depth++;id=folder.parentId;}return depth;
}
export function isNotebookLibrary(value:unknown):value is NotebookLibrary{
 if(!value||typeof value!=='object')return false;const v=value as NotebookLibrary;
 if(v.schema!==1||!Number.isSafeInteger(v.revision)||v.revision<0||!Array.isArray(v.folders)||v.folders.length>10000||!v.notes||typeof v.notes!=='object'||Array.isArray(v.notes)||Object.keys(v.notes).length>100000||!Number.isFinite(Date.parse(v.updatedAt)))return false;
 if(v.collaboration&&(v.collaboration.schema!==1||typeof v.collaboration.lineage!=='string'||!v.collaboration.lineage||v.collaboration.lineage.length>200||typeof v.collaboration.state!=='string'||v.collaboration.state.length>12*1024*1024))return false;
 if(new Set(v.folders.map(f=>f.id)).size!==v.folders.length)return false;
 try{return v.folders.every(f=>typeof f.id==='string'&&f.id.length>0&&f.id.length<=200&&typeof f.title==='string'&&f.title.trim().length>0&&f.title.length<=100&&/^#[0-9a-f]{6}$/i.test(f.color)&&Number.isFinite(f.order)&&(f.parentId===null||typeof f.parentId==='string')&&folderDepth(v.folders,f.id)<=6)&&Object.entries(v.notes).every(([id,n])=>id.length>0&&id.length<=200&&n&&typeof n.favorite==='boolean'&&(n.folderId===null||v.folders.some(f=>f.id===n.folderId))&&(n.deletedAt===null||Number.isFinite(Date.parse(n.deletedAt)))&&(!n.cover||/^#[0-9a-f]{6}$/i.test(n.cover.color)&&['plain','ruled','grid','dots'].includes(n.cover.pattern)));}catch{return false;}
}
/** Removing a folder keeps its contents: children and notes move one level up. */
export function updateNotebookLibrary(value:NotebookLibrary,change:LibraryChange,now=new Date().toISOString()):NotebookLibrary{
 if(change.restore&&!isNotebookLibrary(change.restore))throw Error('Version de classement incompatible.');const base=change.restore?{...value,folders:change.restore.folders,notes:change.restore.notes}:value;
 let folders=change.folder?[...base.folders.filter(f=>f.id!==change.folder!.id),change.folder]:base.folders;const notes={...base.notes};
 if(change.removeFolder){const removed=folders.find(f=>f.id===change.removeFolder);if(!removed)throw Error('Dossier introuvable.');folders=folders.filter(f=>f.id!==removed.id).map(f=>f.parentId===removed.id?{...f,parentId:removed.parentId}:f);for(const [id,note] of Object.entries(notes))if(note.folderId===removed.id)notes[id]={...note,folderId:removed.parentId};}
 if(change.folderOrder){if(change.folderOrder.length!==folders.length||new Set(change.folderOrder).size!==folders.length||change.folderOrder.some(id=>!folders.some(f=>f.id===id)))throw Error('Ordre des dossiers invalide.');folders=folders.map(f=>({...f,order:change.folderOrder!.indexOf(f.id)}));}
 for(const edit of [...(change.note?[change.note]:[]),...(change.notes??[])]){const previous=Object.hasOwn(notes,edit.id)?notes[edit.id]:emptyClassification();const {cover,...patch}=edit.patch;Object.defineProperty(notes,edit.id,{enumerable:true,configurable:true,writable:true,value:{...previous,...patch,...(cover===null?{cover:undefined}:cover?{cover:{...(previous.cover??{color:'#f1f4ff',pattern:'plain'}),...cover}}:{})}});}
 const next={...value,revision:value.revision+1,updatedAt:now,folders,notes};if(!isNotebookLibrary(next))throw Error('Classement invalide : six niveaux maximum, sans cycle.');return next;
}
