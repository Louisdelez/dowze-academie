import {Zip,ZipPassThrough} from 'fflate';
import {readBoundedZipBlob} from './zipBlob';
import {getDraft,getSnapshot,listLocalBlobs,localBlobDigest,notebookDeletionKey,type Draft,type LocalBlob} from '../../pwa/src/storage';
import type {NotebookMediaScope} from '../components/NotebookEditor';
import type {SubjectNoteDocument} from '../types';
import {isPaperDocument,notebookDocumentId,type PaperDocument} from './notebookDocument';
import {verifyPaperCollaboration} from './paperCollaboration';
import {buildPaperArchive} from './paperArchiveExport';
import {verifyPaperArchiveBlob,type PaperBlobArchive} from './paperArchive';
import {paperArchiveMetadata} from './paperArchiveMetadata';
import {isPersistedSubjectNotesStore} from './subjectNotes';
import {isNotebookLibrary,LIBRARY_DOCUMENT_ID} from './notebookLibrary';
import {paperLegacyOwnerKey} from './paperLegacyMigration';
import {noteBoardId} from './notebook';
import {runNotebookOperation} from './notebookSession';
import {savePaperExport} from './paperExport';

/** Outer ZIP limits are cumulative; inner .dowze limits remain unchanged. */
export const PAPER_NOTEBOOK_BUNDLE_LIMITS=Object.freeze({notes:100,bytes:256*1024*1024,manifestBytes:8*1024*1024,centralDirectoryBytes:1024*1024,chunkBytes:65536});
export interface PaperNotebookBundleEntry {
 path:string;noteId:string;documentId:string;revision:number;size:number;sha256:string;
 /** Exact admitted metadata, including its original Markdown and dates. */
 sourceMetadata:SubjectNoteDocument;
}
export interface PaperNotebookBundleManifest {
 schema:1;kind:'dowze-notebook-collection';createdAt:string;
 notes:PaperNotebookBundleEntry[];
}
/** Desktop supplies its persisted SubjectNotesStore reader. It must not use a
 * render-only preview. The current predicate captures its irreversible epoch. */
export type PaperBundleMetadataAuthority='indexeddb'|{
 read:(noteId:string)=>unknown|Promise<unknown>;
 current:()=>boolean;
};
export interface PreparePaperNotebookBundleOptions {
 media:NotebookMediaScope;
 selectedIds:readonly string[];
 metadata:PaperBundleMetadataAuthority;
 /** Captured owner/API/view epoch, not a reversible account-id comparison. */
 current:()=>boolean;
 onProgress?:(completedNotes:number,totalNotes:number)=>void;
}
export interface PreparedPaperNotebookBundle {
 blob:Blob;filename:string;manifest:PaperNotebookBundleManifest;
 /** false means the native Save dialog was cancelled; PWA true means requested. */
 save:()=>Promise<boolean>;
}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const validMetadata=(value:unknown,id:string):value is SubjectNoteDocument=>
 !!value&&typeof value==='object'&&(value as SubjectNoteDocument).id===id&&
 isPersistedSubjectNotesStore({schemaVersion:2,documents:[value],openDocumentIds:[],activeDocumentId:null});
const fail=()=>Error('La sélection ou une de ses sources a changé. Les notes et leurs originaux sont conservés.');
const rowState=(row:Draft|undefined)=>row&&{...row,key:undefined};
const fileState=(file:LocalBlob)=>({...file,blob:undefined,key:undefined,size:file.blob.size,mediaType:file.blob.type});
function validateDraft(row:Draft|undefined,scope:{accountId:string;spaceId:string},type:Draft['type'],documentId:string):asserts row is Draft {
 if(!row||row.accountId!==scope.accountId||row.spaceId!==scope.spaceId||row.type!==type||row.documentId!==documentId||row.staged||row.identityAlias||row.syncState==='conflict')throw Error('Une note manque ou doit être départagée avant cet export. Aucun original n’est modifié.');
}
function sourceFootprint(note:PaperDocument){return JSON.stringify(note);}

/** Captures only the latest confirmed durable versions. The UI must label that
 * snapshot or refuse while accepted editor writes are pending. This operation
 * never settles its own account/writer registration. No migration or identity
 * promotion is performed. No graph,
 * metadata, classification, original bytes or outbox row is written here.
 * readPaperAsset may cache a missing, proved remote original under its CAS. */
export async function preparePaperNotebookBundle(options:PreparePaperNotebookBundleOptions):Promise<PreparedPaperNotebookBundle>{
 const media={accountId:options.media.accountId,spaceId:options.media.spaceId,api:options.media.api};
 const scope={accountId:media.accountId,spaceId:media.spaceId},ids=[...options.selectedIds];
 const currentView=options.current,authority=options.metadata;
 const readExternal=authority==='indexeddb'?undefined:authority.read;
 const externalCurrent=authority==='indexeddb'?undefined:authority.current;
 const onProgress=options.onProgress;
 if(!scope.accountId||!scope.spaceId||![scope.accountId,scope.spaceId].every(value=>typeof value==='string'&&/^[A-Za-z0-9._-]{1,200}$/.test(value))||!ids.length||ids.length>PAPER_NOTEBOOK_BUNDLE_LIMITS.notes||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!id.length||id.length>200))throw Error('Choisissez entre 1 et 100 notes distinctes dans ce compte et cette année.');
 let apiCurrent:(()=>boolean)|undefined,retired=false;
 const current=()=>{if(retired)return false;try{if(!currentView()||externalCurrent&&!externalCurrent()||apiCurrent&&!apiCurrent()){retired=true;return false;}return true;}catch{retired=true;return false;}};
 const check=()=>{if(!current())throw fail();};check();
 // Binding is itself authority-sensitive: a retired callback cannot even bind
 // an otherwise unbound API to its old account. Recheck after opaque capture.
 apiCurrent=media.api?.captureSessionAuthority(scope.accountId);check();
 return runNotebookOperation(scope.accountId,async()=>{
  const libraryIdentity={...scope,type:'preferences' as const,documentId:LIBRARY_DOCUMENT_ID};
  const library=await getDraft(libraryIdentity);check();
  if(library&&(library.accountId!==scope.accountId||library.spaceId!==scope.spaceId||library.type!=='preferences'||library.documentId!==LIBRARY_DOCUMENT_ID||library.staged||library.identityAlias||library.syncState==='conflict'||!isNotebookLibrary(library.content)))throw Error('Le classement doit être récupéré avant cet export.');
  const captured: {id:string;draft:Draft;document:PaperDocument;metadata:SubjectNoteDocument;metadataRow?:Draft;owner:Awaited<ReturnType<typeof getSnapshot>>;files:{row:LocalBlob;sha256:string}[]}[]=[];
  // Read every selected source before producing a partial collection.
  for(const id of ids){
   check();const identity={...scope,type:'whiteboard' as const,documentId:notebookDocumentId(id)},draft=await getDraft(identity);check();validateDraft(draft,scope,'whiteboard',identity.documentId);
   if(!isPaperDocument(draft.content)||draft.content.noteId!==id)throw Error('Cette note n’a pas de carnet canonique compatible. Ouvrez-la pour la récupérer avant son export.');
   const document=structuredClone(draft.content);verifyPaperCollaboration(document);check();
   const deletion=await getSnapshot(notebookDeletionKey(identity));check();if(deletion)throw Error('Une note supprimée doit être récupérée explicitement avant son export.');
   const owner=await getSnapshot(paperLegacyOwnerKey(id,scope));check();
   if(owner){const value=owner.value as {schema?:unknown;noteId?:unknown;documentId?:unknown;boardId?:unknown;claimedAt?:unknown}|null;if(owner.accountId!==scope.accountId||owner.spaceId!==scope.spaceId||!value||value.schema!==1||value.noteId!==id||value.documentId!==identity.documentId||value.boardId!==noteBoardId(id)||!Number.isFinite(Date.parse(String(value.claimedAt))))throw Error('Le reçu de propriété de cette note doit être départagé avant son export.');}
   let metadataRow:Draft|undefined,raw:unknown;
   if(authority==='indexeddb'){metadataRow=await getDraft({...scope,type:'notesMarkdown',documentId:id});check();validateDraft(metadataRow,scope,'notesMarkdown',id);raw=metadataRow.content;}
   else {raw=await readExternal!(id);check();}
   if(!validMetadata(raw,id))throw Error('Les métadonnées complètes de cette note sont absentes ou incompatibles. Aucun titre ni aucune date ne sont inventés.');
   const metadata=structuredClone(raw),files:typeof captured[number]['files']=[];
   if(metadataRow&&metadataRow.title!==metadata.title)throw Error('Le titre et les métadonnées de la note doivent être départagés avant cet export.');
   captured.push({id,draft:structuredClone(draft),document,metadata,metadataRow:metadataRow&&structuredClone(metadataRow),owner:owner&&structuredClone(owner),files});
  }
  const manifest:PaperNotebookBundleManifest={schema:1,kind:'dowze-notebook-collection',createdAt:new Date().toISOString(),notes:[]};
  const archives:Blob[]=[];let total=0,expanded=0;
  for(const [index,source] of captured.entries()){
   check();const archive=await buildPaperArchive(source.document,media,source.metadata,current);check();
   total+=archive.size;if(total>PAPER_NOTEBOOK_BUNDLE_LIMITS.bytes)throw Error('La sélection dépasse 256 Mo. Exportez-la en plusieurs collections.');
   // Use the existing importer as the oracle for every individual inner note.
   const verified=await verifyPaperArchiveBlob(archive,current);check();
   if(sourceFootprint(verified.document)!==sourceFootprint(source.document)||!verified.metadata||!verified.integrity)throw Error('Une note de la collection n’a pas pu être vérifiée.');
   expanded+=Object.values(verified.physicalFiles??verified.files).reduce((sum,file)=>sum+file.size,0);
   if(expanded>PAPER_NOTEBOOK_BUNDLE_LIMITS.bytes)throw Error('Les notes décompressées dépassent 256 Mo. Exportez-les en plusieurs collections.');
   const local=await listLocalBlobs(scope.accountId,scope.spaceId);check();
   for(const asset of source.document.assets){const file=local.find(row=>row.id===asset.id);if(!file||file.removedFromNote)throw Error('Un original de cette note doit être retrouvé avant son export.');const sha256=await localBlobDigest(file.blob);check();if(file.sha256&&file.sha256!==sha256)throw Error('L’empreinte conservée de cet original ne correspond plus à ses octets.');const expected=verified.integrity.files[verified.integrity.assetPaths?.[asset.id]??`assets/${asset.id}`];if(sha256!==expected?.sha256)throw fail();source.files.push({row:file,sha256});}
   manifest.notes.push({path:`notes/${String(index+1).padStart(4,'0')}.dowze`,noteId:source.id,documentId:source.draft.documentId,revision:source.document.revision,size:archive.size,sha256:await localBlobDigest(archive),sourceMetadata:source.metadata});check();archives.push(archive);onProgress?.(index+1,ids.length);check();
  }
  const manifestBlob=new Blob([JSON.stringify(manifest)]);
  if(manifestBlob.size>PAPER_NOTEBOOK_BUNDLE_LIMITS.manifestBytes||manifestBlob.size+total>PAPER_NOTEBOOK_BUNDLE_LIMITS.bytes)throw Error('Le manifeste ou la collection dépasse la taille prise en charge.');
  const validateSources=async()=>{
   check();const latestLibrary=await getDraft(libraryIdentity);check();if(!same(rowState(latestLibrary),rowState(library)))throw fail();
   for(const source of captured){
    const latest=await getDraft({...scope,type:'whiteboard',documentId:source.draft.documentId});check();if(!same(rowState(latest),rowState(source.draft)))throw fail();
    if(await getSnapshot(notebookDeletionKey(source.draft)))throw fail();check();
    const owner=await getSnapshot(paperLegacyOwnerKey(source.id,scope));check();if(!same(owner,source.owner))throw fail();
    if(authority==='indexeddb'){const row=await getDraft({...scope,type:'notesMarkdown',documentId:source.id});check();if(!same(rowState(row),rowState(source.metadataRow)))throw fail();}
    else {const metadata=await readExternal!(source.id);check();if(!same(metadata,source.metadata))throw fail();}
    const local=await listLocalBlobs(scope.accountId,scope.spaceId);check();
    for(const expected of source.files){const file=local.find(row=>row.id===expected.row.id);if(!file||!same(fileState(file),fileState(expected.row)))throw fail();const digest=await localBlobDigest(file.blob);check();if(digest!==expected.sha256)throw fail();}
   }
  };
  await validateSources();check();
  const pieces:Blob[]=[];let produced=0,finished=false;
  const zip=new Zip((error,chunk,final)=>{check();if(error)throw error;produced+=chunk.length;if(produced>PAPER_NOTEBOOK_BUNDLE_LIMITS.bytes)throw Error('La collection complète dépasse 256 Mo.');if(chunk.length)pieces.push(new Blob([chunk as Uint8Array<ArrayBuffer>]));if(final)finished=true;});
  try{
   const files=[['collection.json',manifestBlob] as const,...archives.map((blob,index)=>[manifest.notes[index].path,blob] as const)];
   for(const [path,blob] of files){const member=new ZipPassThrough(path);zip.add(member);for(let offset=0;offset<blob.size;offset+=PAPER_NOTEBOOK_BUNDLE_LIMITS.chunkBytes){check();const end=Math.min(blob.size,offset+PAPER_NOTEBOOK_BUNDLE_LIMITS.chunkBytes);const bytes=new Uint8Array(await blob.slice(offset,end).arrayBuffer());check();member.push(bytes,end===blob.size);if(offset%(1024*1024)===0){await new Promise<void>(resolve=>setTimeout(resolve,0));check();}}}
   check();zip.end();if(!finished)throw Error('La collection n’a pas pu être finalisée.');
  }finally{zip.terminate();}
  const blob=new Blob(pieces,{type:'application/zip'}),filename=`notes-dowze-${manifest.createdAt.slice(0,10)}.zip`;
  check();return {blob,filename,manifest:structuredClone(manifest),save:()=>runNotebookOperation(scope.accountId,async()=>{await validateSources();check();return savePaperExport(blob,filename,'bundle',current);})};
 });
}

/** A collection reader returns individually importable .dowze members. It does
 * not append, activate, remap IDs or promise an automatic batch-import UI. */
export async function readPaperNotebookBundle(blob:Blob,current:()=>boolean=()=>true):Promise<{manifest:PaperNotebookBundleManifest;notes:{entry:PaperNotebookBundleEntry;blob:Blob;archive:PaperBlobArchive}[]}>{
 const check=()=>{if(!current())throw fail();};check();if(!blob.size||blob.size>PAPER_NOTEBOOK_BUNDLE_LIMITS.bytes)throw Error('La collection doit contenir entre 1 octet et 256 Mo.');
 const files=await readBoundedZipBlob(blob,{maxBytes:PAPER_NOTEBOOK_BUNDLE_LIMITS.bytes,minEntries:2,maxEntries:PAPER_NOTEBOOK_BUNDLE_LIMITS.notes+1,maxMemberBytes:PAPER_NOTEBOOK_BUNDLE_LIMITS.bytes,maxExpandedBytes:PAPER_NOTEBOOK_BUNDLE_LIMITS.bytes,maxDirectoryBytes:PAPER_NOTEBOOK_BUNDLE_LIMITS.centralDirectoryBytes,maxNameBytes:200,acceptEntry:name=>name==='collection.json'||/^notes\/\d{4}\.dowze$/.test(name),rejectUnknown:true,memberLimit:name=>name==='collection.json'?PAPER_NOTEBOOK_BUNDLE_LIMITS.manifestBytes:PAPER_NOTEBOOK_BUNDLE_LIMITS.bytes,current});check();
  const manifest=JSON.parse(await files.get('collection.json')!.text()) as PaperNotebookBundleManifest;check();
  if(manifest?.schema!==1||manifest.kind!=='dowze-notebook-collection'||!Number.isFinite(Date.parse(manifest.createdAt))||!Array.isArray(manifest.notes)||!manifest.notes.length||manifest.notes.length>PAPER_NOTEBOOK_BUNDLE_LIMITS.notes||files.size!==manifest.notes.length+1||new Set(manifest.notes.map(row=>row.noteId)).size!==manifest.notes.length)throw Error('Le manifeste de collection est incompatible.');
  const notes:{entry:PaperNotebookBundleEntry;blob:Blob;archive:PaperBlobArchive}[]=[];let expanded=0;
  for(const [index,entry] of manifest.notes.entries()){
   if(!entry||entry.path!==`notes/${String(index+1).padStart(4,'0')}.dowze`||!validMetadata(entry.sourceMetadata,entry.noteId)||entry.documentId!==notebookDocumentId(entry.noteId)||!Number.isSafeInteger(entry.revision)||entry.revision<0||!Number.isSafeInteger(entry.size)||entry.size<=0||!/^[a-f0-9]{64}$/.test(entry.sha256))throw Error('Une identité du manifeste de collection est incompatible.');
   const source=files.get(entry.path);if(!source||source.size!==entry.size)throw Error('Une note manque dans la collection.');const digest=await localBlobDigest(source);check();if(digest!==entry.sha256)throw Error('Une note de la collection a été endommagée.');
   const archive=await verifyPaperArchiveBlob(source,current);check();if(archive.document.noteId!==entry.noteId||archive.document.revision!==entry.revision||!archive.metadata||!archive.integrity)throw Error('Le manifeste ne correspond pas à la note archivée.');verifyPaperCollaboration(archive.document);const expectedMetadata=paperArchiveMetadata(archive.document,entry.sourceMetadata,{schema:1,revision:0,updatedAt:archive.metadata.exportedAt,folders:archive.metadata.folderPath,notes:{[entry.noteId]:archive.metadata.classification}},archive.metadata.exportedAt);if(!same(expectedMetadata,archive.metadata))throw Error('Les métadonnées du manifeste ne correspondent pas à la note archivée.');
   expanded+=Object.values(archive.physicalFiles??archive.files).reduce((sum,file)=>sum+file.size,0);if(expanded>PAPER_NOTEBOOK_BUNDLE_LIMITS.bytes)throw Error('Les notes de la collection décompressées dépassent 256 Mo.');notes.push({entry,blob:source,archive});
  }
  return {manifest,notes};
}
