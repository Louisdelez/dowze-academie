import type {SubjectNoteDocument} from '../types';
import {isPersistedSubjectNotesStore} from './subjectNotes.ts';
import {emptyClassification,isNotebookLibrary,type NotebookLibrary,type NoteClassification,type NoteFolder} from './notebookLibrary.ts';
import type {PaperDocument,PaperObject} from './notebookDocument';
import {textFlowFingerprint} from './paperTextFlow.ts';
import {copyMarkdownRange} from './paperPageCopy.ts';
export interface PaperArchiveMetadata {schema:1;exportedAt:string;note:SubjectNoteDocument;classification:NoteClassification;folderPath:NoteFolder[]}
interface MarkdownPageEntry {object:PaperObject;objectIndex:number;flowIndex:number}
const pagePositionError=()=>Error('La disposition du texte doit être actualisée avant son export dans l’ordre des pages. Son contenu original reste conservé.');
function freshFlowOffsets(object:PaperObject):number[]{
 const flow=object.textFlow,markdown=object.markdown??'',offsets=flow?.sourceOffsets;
 if(!flow||!offsets||flow.source!==textFlowFingerprint(markdown,object.width,object.height)||offsets.length!==flow.pageIds.length+1||offsets[0]!==0||offsets.at(-1)!==markdown.length||offsets.some((offset,index)=>!Number.isSafeInteger(offset)||offset<0||index>0&&offset<offsets[index-1]))throw pagePositionError();
 return offsets;
}
/**
 * Page position, rather than object creation order, determines the exported reading order.
 * An untouched continuous passage is emitted once, byte for byte. When other text or
 * reordered pages interrupt it, fresh parser positions provide independent rich passages.
 */
export function paperMarkdown(document:PaperDocument):string{
 const positions=new Map(document.pages.map((page,index)=>[page.id,index])),buckets=document.pages.map(()=>[] as MarkdownPageEntry[]),contiguousFlows=new Set<string>();
 document.objects.forEach((object,objectIndex)=>{
  if(object.kind!=='text')return;
  const flow=object.textFlow;
  if(flow&&flow.pageIds.length>1){
   const pagePositions=flow.pageIds.map(id=>positions.get(id));
   if(pagePositions.some(position=>position===undefined))throw pagePositionError();
   const contiguous=pagePositions.every((position,index)=>position===pagePositions[0]!+index);
   if(contiguous)contiguousFlows.add(object.id);else freshFlowOffsets(object);
   flow.pageIds.forEach((id,flowIndex)=>buckets[positions.get(id)!].push({object,objectIndex,flowIndex}));
  }else{
   const position=positions.get(object.pageId);if(position===undefined)throw pagePositionError();
   buckets[position].push({object,objectIndex,flowIndex:0});
  }
 });
 const entries=buckets.flatMap(bucket=>bucket.sort((a,b)=>a.object.y-b.object.y||a.object.x-b.object.x||a.object.z-b.object.z||a.objectIndex-b.objectIndex)),passages:string[]=[];
 for(let index=0;index<entries.length;){
  const entry=entries[index],object=entry.object,flow=object.textFlow;
  if(!flow||flow.pageIds.length===1){passages.push(object.markdown??'');index++;continue;}
  let end=index+1;
  while(end<entries.length&&entries[end].object.id===object.id&&entries[end].flowIndex===entries[end-1].flowIndex+1)end++;
  const last=entries[end-1];
  if(contiguousFlows.has(object.id)&&entry.flowIndex===0&&last.flowIndex===flow.pageIds.length-1)passages.push(object.markdown??'');
  else{const offsets=freshFlowOffsets(object);passages.push(copyMarkdownRange(object.markdown??'',offsets[entry.flowIndex],offsets[last.flowIndex+1]));}
  index=end;
 }
 return passages.join('\n\n');
}
export function isPaperArchiveMetadata(value:unknown):value is PaperArchiveMetadata{
 if(!value||typeof value!=='object')return false;const m=value as PaperArchiveMetadata;
 if(m.schema!==1||!Number.isFinite(Date.parse(m.exportedAt))||!Array.isArray(m.folderPath)||m.folderPath.length>6||!m.note)return false;
 if(!isPersistedSubjectNotesStore({schemaVersion:2,documents:[m.note],openDocumentIds:[],activeDocumentId:null}))return false;
 if(m.folderPath.some((folder,i)=>!folder||folder.parentId!==(i?m.folderPath[i-1].id:null)))return false;
 if(m.classification?.folderId!==(m.folderPath.at(-1)?.id??null))return false;
 return isNotebookLibrary({schema:1,revision:0,updatedAt:m.exportedAt,folders:m.folderPath,notes:{[m.note.id]:m.classification}});
}
/** Only this note's ancestor folders are exported; other notes never enter its archive. */
export function paperArchiveMetadata(document:PaperDocument,note:Partial<SubjectNoteDocument>|undefined,library:NotebookLibrary|undefined,now=new Date().toISOString()):PaperArchiveMetadata{
 const classification=structuredClone(library&&Object.hasOwn(library.notes,document.noteId)?library.notes[document.noteId]:emptyClassification()),folderPath:NoteFolder[]=[];let parent=classification.folderId;
 while(parent){const folder=library?.folders.find(f=>f.id===parent);if(!folder||folderPath.length>=6||folderPath.some(f=>f.id===parent))throw Error('Le classement de cette note doit être récupéré avant son export.');folderPath.unshift(structuredClone(folder));parent=folder.parentId;}
 const metadata:PaperArchiveMetadata={schema:1,exportedAt:now,note:{id:document.noteId,title:note?.title??'Note Dowze',markdown:paperMarkdown(document),subjectIds:note?.subjectIds??[],tags:note?.tags??[],createdAt:note?.createdAt??document.legacy.migratedAt,updatedAt:note?.updatedAt??document.updatedAt},classification,folderPath};
 if(!isPaperArchiveMetadata(metadata))throw Error('Les informations de la note ne peuvent pas être archivées dans leur format actuel.');return metadata;
}
