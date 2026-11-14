import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';
import {getDraft,getSnapshot,listSnapshotsByPrefix,listLocalBlobs,commitNotebookTransfer,notebookDeletionKey,type Draft,type Snapshot,type LocalBlob,type NotebookTransferCommit} from '../../pwa/src/storage.ts';
import {verifyPaperArchiveBlob,appendPaperArchive,MAX_PAPER_ARCHIVE_BYTES,MAX_PAPER_ARCHIVE_MEMBER_BYTES,MAX_PAPER_ARCHIVE_ENTRIES} from './paperArchive.ts';
import {isPaperArchiveMetadata,type PaperArchiveMetadata} from './paperArchiveMetadata.ts';
import {isPaperDocument,migratePaper,applyPaperCommand,type PaperDocument,type PaperCommand} from './notebookDocument.ts';
import {notebookDocumentId,notebookIdentityDigest} from './notebookIdentity.ts';
import {amendPaperCollaboration,hasPaperCollaboration,verifyPaperCollaboration} from './paperCollaboration.ts';
import {parsePhotoReference,photoReference} from './notebook.ts';

export interface PaperAppendArchiveScope {accountId:string;spaceId:string;noteId:string}
export interface PaperAppendArchiveFile {sourceId:string;id:string;name:string;mediaType:string;size:number;sha256:string}
interface AppendArchiveBase extends PaperAppendArchiveScope {
 schema:1;kind:'paper-append-archive';id:string;sourceName:string;createdAt:string;targetLineage:string;
 original:{key:string;size:number;mediaType:string;sha256:string};
}
export interface PaperAppendArchiveSourceStaged extends AppendArchiveBase {state:'source-staged'}
export interface PaperAppendArchiveReady extends AppendArchiveBase {
 state:'ready';sourceDocument:PaperDocument;sourceMetadata?:PaperArchiveMetadata;
 commands:PaperCommand[];assets:Record<string,string>;firstPageId:string;files:PaperAppendArchiveFile[];fingerprint:string;
}
export interface PaperAppendArchiveApplied extends Omit<PaperAppendArchiveReady,'state'> {
 state:'applied';appliedAt:string;publishedRevision:number;beforeHistoryKey:string;
}
export type PaperAppendArchiveReceipt=PaperAppendArchiveSourceStaged|PaperAppendArchiveReady|PaperAppendArchiveApplied;
interface OriginalArchive extends PaperAppendArchiveScope {schema:1;kind:'paper-append-archive-source';id:string;blob:Blob;size:number;sha256:string;mediaType:string}
export interface PreparedPaperAppendArchivePublication {draft:Draft;commit:NotebookTransferCommit;firstPageId:string;receipt:PaperAppendArchiveApplied}
export interface IncompleteLegacyPaperAppendArchive {
 kind:'legacy-incomplete';key:string;sourceName:string;sourceZip:'absent';
 mediaReferences:'all-present'|'missing-or-mismatched'|'unverified';missingAssetIds:string[];reason:string;
}
export class PaperAppendArchiveAppliedError extends Error {
 readonly receipt:PaperAppendArchiveApplied;
 constructor(receipt:PaperAppendArchiveApplied){super('Cette archive a déjà été ajoutée. Rechargez la note ; aucune page n’est ajoutée une seconde fois.');this.name='PaperAppendArchiveAppliedError';this.receipt=structuredClone(receipt);}
}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const safeId=(id:unknown):id is string=>typeof id==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,126}$/.test(id)&&!id.includes('..');
const digest=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const checked=(current:()=>boolean)=>{if(!current())throw Error('Le carnet ou le compte a changé. L’importation reste dans son espace d’origine.');};
function capturedScope(scope:PaperAppendArchiveScope):PaperAppendArchiveScope {
 if(!scope||typeof scope.accountId!=='string'||!scope.accountId||typeof scope.spaceId!=='string'||!scope.spaceId||typeof scope.noteId!=='string'||!scope.noteId||scope.noteId.length>200)throw Error('La destination de cette importation est incompatible.');
 return Object.freeze({accountId:scope.accountId,spaceId:scope.spaceId,noteId:scope.noteId});
}
const scoped=(scope:PaperAppendArchiveScope)=>({accountId:scope.accountId,spaceId:scope.spaceId});
const identityOf=(scope:PaperAppendArchiveScope)=>({...scoped(scope),type:'whiteboard' as const,documentId:notebookDocumentId(scope.noteId)});
const owned=(a:PaperAppendArchiveScope,b:PaperAppendArchiveScope)=>a.accountId===b.accountId&&a.spaceId===b.spaceId&&a.noteId===b.noteId;
const namespace=(scope:PaperAppendArchiveScope)=>notebookIdentityDigest(JSON.stringify([scope.accountId,scope.spaceId,scope.noteId]));
export const paperAppendArchiveReceiptPrefix=(scope:PaperAppendArchiveScope)=>`paper-append-archive-receipt|v1|${namespace(capturedScope(scope))}|`;
export function paperAppendArchiveReceiptKey(scope:PaperAppendArchiveScope,id:string){if(!safeId(id))throw Error('Identifiant d’importation incompatible.');return `${paperAppendArchiveReceiptPrefix(scope)}${id}`;}
const sourceKey=(scope:PaperAppendArchiveScope,id:string)=>`paper-append-archive-source|v1|${namespace(scope)}|${id}`;
function ownedSnapshot(row:Snapshot|undefined,scope:PaperAppendArchiveScope,key:string){if(row&&(row.key!==key||row.accountId!==scope.accountId||row.spaceId!==scope.spaceId))throw Error('Le reçu appartient à un autre compte ou espace. Aucun original n’est remplacé.');}
/** ZIP hashing reads bounded slices, including archives larger than one cloud blob. */
async function blobDigest(blob:Blob,current:()=>boolean):Promise<string>{
 const hash=sha256.create();for(let offset=0;offset<blob.size;offset+=262144){checked(current);hash.update(new Uint8Array(await blob.slice(offset,Math.min(blob.size,offset+262144)).arrayBuffer()));checked(current);}return bytesToHex(hash.digest());
}
function stable(value:unknown):unknown {
 if(Array.isArray(value))return value.map(stable);
 if(record(value))return Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,stable(value[key])]));
 return value;
}
function readyFingerprint(value:Omit<PaperAppendArchiveReady,'fingerprint'|'state'>):string {
 return bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(stable(value)))));
}
function readyBody(value:PaperAppendArchiveReady|PaperAppendArchiveApplied):Omit<PaperAppendArchiveReady,'fingerprint'|'state'> {
 const {state,fingerprint,...rest}=value;
 if(state==='applied'){const {appliedAt,publishedRevision,beforeHistoryKey,...body}=rest as Omit<PaperAppendArchiveApplied,'state'|'fingerprint'>;return body;}
 return rest;
}
function mappedDocument(receipt:Pick<PaperAppendArchiveReady,'noteId'|'createdAt'|'commands'>):PaperDocument {
 const blank=migratePaper(receipt.noteId,'',null,new Date(receipt.createdAt).toISOString());
 return applyPaperCommand(blank,{type:'batch',commands:[...receipt.commands,{type:'remove-page',id:blank.pages[0].id}]},new Date(receipt.createdAt).toISOString());
}
function validReceipt(value:unknown,scope:PaperAppendArchiveScope,id:string):value is PaperAppendArchiveReceipt {
 if(!record(value)||value.schema!==1||value.kind!=='paper-append-archive'||!owned(value as unknown as PaperAppendArchiveScope,scope)||value.id!==id||!safeId(id)||typeof value.sourceName!=='string'||value.sourceName.length>1000||typeof value.targetLineage!=='string'||!value.targetLineage||value.targetLineage.length>200||typeof value.createdAt!=='string'||!Number.isFinite(Date.parse(value.createdAt))||!record(value.original)||value.original.key!==sourceKey(scope,id)||!Number.isSafeInteger(value.original.size)||Number(value.original.size)<0||Number(value.original.size)>MAX_PAPER_ARCHIVE_BYTES||typeof value.original.mediaType!=='string'||!digest(value.original.sha256))return false;
 if(value.state==='source-staged')return true;
 if(!['ready','applied'].includes(String(value.state))||!isPaperDocument(value.sourceDocument)||value.sourceMetadata!==undefined&&(!isPaperArchiveMetadata(value.sourceMetadata)||value.sourceMetadata.note.id!==value.sourceDocument.noteId)||!Array.isArray(value.commands)||!record(value.assets)||!Array.isArray(value.files)||typeof value.firstPageId!=='string'||!digest(value.fingerprint))return false;
 const receipt=value as unknown as PaperAppendArchiveReady|PaperAppendArchiveApplied;
 if(receipt.commands.some(command=>!record(command)||!['study-card','add-asset','add-audio','insert-page','upsert-object'].includes(String(command.type))))return false;
 if(receipt.files.some(file=>!record(file)||!safeId(file.id)||typeof file.sourceId!=='string'||typeof file.name!=='string'||typeof file.mediaType!=='string'||!Number.isSafeInteger(file.size)||file.size<0||file.size>MAX_PAPER_ARCHIVE_MEMBER_BYTES||!digest(file.sha256)||receipt.assets[file.sourceId]!==file.id||!receipt.sourceDocument.assets.some(asset=>asset.id===file.sourceId&&asset.name===file.name&&asset.mediaType===file.mediaType&&asset.size===file.size))||receipt.files.length!==receipt.sourceDocument.assets.length||new Set(receipt.files.map(file=>file.id)).size!==receipt.files.length||new Set(receipt.files.map(file=>file.sourceId)).size!==receipt.files.length||Object.keys(receipt.assets).length!==receipt.files.length)return false;
 if(receipt.fingerprint!==readyFingerprint(readyBody(receipt)))return false;
 try{
  const mapped=mappedDocument(receipt);
  if(mapped.pages[0].id!==receipt.firstPageId||mapped.pages.length!==receipt.sourceDocument.pages.length||mapped.objects.length!==receipt.sourceDocument.objects.length||mapped.audio.length!==receipt.sourceDocument.audio.length||mapped.assets.length!==receipt.files.length||(mapped.study?.cards.length??0)!==(receipt.sourceDocument.study?.cards.length??0)||new Set(mapped.objects.flatMap(object=>object.groupId?[object.groupId]:[])).size!==new Set(receipt.sourceDocument.objects.flatMap(object=>object.groupId?[object.groupId]:[])).size||mapped.assets.some(asset=>!receipt.files.some(file=>file.id===asset.id&&file.name===asset.name&&file.mediaType===asset.mediaType&&file.size===asset.size)))return false;
 }catch{return false;}
 return receipt.state!=='applied'||Number.isFinite(Date.parse(receipt.appliedAt))&&Number.isSafeInteger(receipt.publishedRevision)&&receipt.publishedRevision>0&&typeof receipt.beforeHistoryKey==='string'&&receipt.beforeHistoryKey.startsWith(`paper-history|${scope.accountId}|${scope.spaceId}|whiteboard|${notebookDocumentId(scope.noteId)}|`);
}
async function readReceiptRow(scope:PaperAppendArchiveScope,id:string,current:()=>boolean):Promise<Snapshot&{value:PaperAppendArchiveReceipt}>{
 checked(current);const key=paperAppendArchiveReceiptKey(scope,id),row=await getSnapshot(key);checked(current);ownedSnapshot(row,scope,key);
 if(!row||!validReceipt(row.value,scope,id))throw Error('Le reçu de cette importation manque ou doit être récupéré. Ses originaux restent conservés.');
 return structuredClone(row) as Snapshot&{value:PaperAppendArchiveReceipt};
}
async function readOriginal(scope:PaperAppendArchiveScope,receipt:PaperAppendArchiveReceipt,current:()=>boolean):Promise<Snapshot&{value:OriginalArchive}>{
 const row=await getSnapshot(receipt.original.key);checked(current);ownedSnapshot(row,scope,receipt.original.key);const source=row?.value as OriginalArchive|undefined;
 if(!source||source.schema!==1||source.kind!=='paper-append-archive-source'||!owned(source,scope)||source.id!==receipt.id||!(source.blob instanceof Blob)||source.size!==receipt.original.size||source.blob.size!==source.size||source.mediaType!==receipt.original.mediaType||source.blob.type!==source.mediaType||source.sha256!==receipt.original.sha256||await blobDigest(source.blob,current)!==source.sha256)throw Error('Le ZIP original de cette importation manque ou a changé. Aucun original n’est remplacé.');
 return structuredClone(row) as Snapshot&{value:OriginalArchive};
}
async function destination(scope:PaperAppendArchiveScope,current:()=>boolean,document?:PaperDocument,lineage?:string){
 checked(current);const identity=identityOf(scope),draft=await getDraft(identity);checked(current);
 if(!draft||draft.accountId!==scope.accountId||draft.spaceId!==scope.spaceId||draft.type!=='whiteboard'||draft.documentId!==identity.documentId||draft.identityAlias||draft.staged||draft.syncState==='conflict'||!isPaperDocument(draft.content)||draft.content.noteId!==scope.noteId||document&&!same(draft.content,document))throw Error('La note ou sa version durable a changé. L’importation reste disponible pour une reprise explicite.');
 if(!hasPaperCollaboration(draft.content))throw Error('Ouvrez la note pour terminer sa migration avant d’admettre l’archive.');verifyPaperCollaboration(draft.content);
 if(lineage!==undefined&&draft.content.collaboration!.lineage!==lineage)throw Error('La note de destination a changé d’identité. Le ZIP original reste conservé.');
 const deletionKey=notebookDeletionKey(identity),deletion=await getSnapshot(deletionKey);checked(current);ownedSnapshot(deletion,scope,deletionKey);
 if(deletion)throw Error('Cette note a été supprimée ou attend une vérification. L’archive reste conservée sans recréer la note.');
 return {identity,draft:structuredClone(draft),deletionKey};
}
function plan(scope:PaperAppendArchiveScope):NotebookTransferCommit{return {target:scoped(scope),sources:[],drafts:[],blobs:[],snapshots:[],draftChecks:[],blobChecks:[],snapshotChecks:[]};}
/** Accepted means this transaction completed: an original ZIP and its receipt
 * survive parsing, quota, cancellation and process interruption thereafter.
 * Sources are snapshots, never pending upload blobs. No destination edit occurs. */
export async function stagePaperAppendArchive(input:{scope:PaperAppendArchiveScope;file:Blob&{name?:string};id?:string;current:()=>boolean}):Promise<PaperAppendArchiveReceipt>{
 const scope=capturedScope(input.scope),current=input.current,id=input.id??crypto.randomUUID(),file=input.file.slice(0,undefined,input.file.type),sourceName=input.file.name??'note.dowze';
 checked(current);if(!safeId(id)||typeof sourceName!=='string'||sourceName.length>1000||file.size>MAX_PAPER_ARCHIVE_BYTES)throw Error('L’archive ou son identité dépasse la taille prise en charge. Son original reste disponible.');
 const checksum=await blobDigest(file,current),key=paperAppendArchiveReceiptKey(scope,id),existing=await getSnapshot(key);checked(current);ownedSnapshot(existing,scope,key);
 if(existing){
  if(!validReceipt(existing.value,scope,id)||existing.value.original.size!==file.size||existing.value.original.sha256!==checksum)throw Error('Une autre archive utilise ce reçu. Aucune source n’est remplacée.');
  await readOriginal(scope,existing.value,current);return structuredClone(existing.value);
 }
 const target=await destination(scope,current),originalKey=sourceKey(scope,id),previousSource=await getSnapshot(originalKey);checked(current);ownedSnapshot(previousSource,scope,originalKey);if(previousSource)throw Error('Une source conserve déjà cette identité. Aucun original n’est remplacé.');
 const original:OriginalArchive={schema:1,kind:'paper-append-archive-source',...scope,id,blob:file,size:file.size,mediaType:file.type,sha256:checksum};
 const receipt:PaperAppendArchiveSourceStaged={schema:1,kind:'paper-append-archive',...scope,id,state:'source-staged',sourceName,createdAt:new Date().toISOString(),targetLineage:(target.draft.content as PaperDocument).collaboration!.lineage,original:{key:originalKey,size:file.size,mediaType:file.type,sha256:checksum}},commit=plan(scope);
 commit.snapshots=[{key:originalKey,...scoped(scope),value:original},{key,...scoped(scope),value:receipt}];commit.draftChecks=[{identity:target.identity,expected:target.draft}];commit.snapshotChecks=[{key:target.deletionKey,expected:undefined},{key:originalKey,expected:undefined},{key,expected:undefined}];
 await commitNotebookTransfer(commit,current);return structuredClone(receipt);
}
export async function readPaperAppendArchive(input:{scope:PaperAppendArchiveScope;id:string;current:()=>boolean}):Promise<PaperAppendArchiveReceipt>{
 const scope=capturedScope(input.scope);return (await readReceiptRow(scope,input.id,input.current)).value;
}
export async function readPaperAppendArchiveOriginal(input:{scope:PaperAppendArchiveScope;id:string;current:()=>boolean}):Promise<{blob:Blob;name:string}>{
 const scope=capturedScope(input.scope),current=input.current,receipt=(await readReceiptRow(scope,input.id,current)).value,source=await readOriginal(scope,receipt,current);checked(current);return {blob:source.value.blob,name:receipt.sourceName};
}
/** Receipt-only namespace: this listing does not deserialize ZIP sources.
 * Legacy append snapshots never claimed to contain bytes; report that gap and
 * leave them untouched rather than manufacturing a successful restoration. */
export async function listPaperAppendArchives(input:{scope:PaperAppendArchiveScope;current:()=>boolean;includeApplied?:boolean}):Promise<{receipts:PaperAppendArchiveReceipt[];legacyIncomplete:IncompleteLegacyPaperAppendArchive[]}>{
 const scope=capturedScope(input.scope),current=input.current,includeApplied=input.includeApplied===true,prefix=paperAppendArchiveReceiptPrefix(scope);checked(current);
 const rows=await listSnapshotsByPrefix(scope.accountId,scope.spaceId,prefix);checked(current);
 const receipts=rows.map(row=>{const id=row.key.slice(prefix.length);if(!validReceipt(row.value,scope,id))throw Error('Un reçu d’importation doit être récupéré. Ses sources restent conservées.');return structuredClone(row.value);}).filter(receipt=>includeApplied||receipt.state!=='applied');
 const legacyPrefix=`paper-import-append|${scope.accountId}|${scope.spaceId}|${scope.noteId}|`,legacy=await listSnapshotsByPrefix(scope.accountId,scope.spaceId,legacyPrefix);checked(current);
 const existingFiles=legacy.length?await listLocalBlobs(scope.accountId,scope.spaceId):[];checked(current);
 const legacyIncomplete:IncompleteLegacyPaperAppendArchive[]=legacy.map(row=>{
  const value=record(row.value)?row.value:{},sourceName=typeof value.sourceName==='string'?value.sourceName:'Archive historique',base={kind:'legacy-incomplete' as const,key:row.key,sourceName,sourceZip:'absent' as const};
  if(!isPaperDocument(value.sourceDocument)||!record(value.assets)||scope.noteId.includes('|'))return {...base,mediaReferences:'unverified',missingAssetIds:[],reason:'Le ZIP original est absent de ce reçu historique. Son graphe et ses fichiers éventuels restent conservés ; leur reconstruction et leur destination doivent être vérifiées.'};
  const assets=value.assets,missingAssetIds=value.sourceDocument.assets.filter(asset=>{
   const id=Object.hasOwn(assets,asset.id)?assets[asset.id]:undefined,file=existingFiles.find(file=>file.id===id);
   return typeof id!=='string'||!file||file.documentId!==notebookDocumentId(scope.noteId)||file.blob.size!==asset.size||file.blob.type!==asset.mediaType;
  }).map(asset=>asset.id);
  return {...base,mediaReferences:missingAssetIds.length?'missing-or-mismatched':'all-present',missingAssetIds,reason:missingAssetIds.length?'Le ZIP original est absent ; certaines références médias historiques manquent ou ne correspondent plus. Le graphe et les fichiers restants sont conservés.':'Le ZIP original est absent ; toutes les références médias historiques sont présentes. Cela ne prouve pas les octets du ZIP ni une reprise sûre : leur reconstruction explicite reste à valider.'};
 });
 return {receipts:receipts.sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)||a.id.localeCompare(b.id)),legacyIncomplete};
}
/** Persist the mapping once. A failed parse or write leaves source-staged and
 * its original ZIP durable; a ready retry reuses every stored identity. */
export async function preparePaperAppendArchive(input:{scope:PaperAppendArchiveScope;id:string;current:()=>boolean}):Promise<PaperAppendArchiveReady|PaperAppendArchiveApplied>{
 const scope=capturedScope(input.scope),current=input.current,row=await readReceiptRow(scope,input.id,current),receipt=row.value;
 if(receipt.state!=='source-staged')return receipt;
 const original=await readOriginal(scope,receipt,current),archive=await verifyPaperArchiveBlob(original.value.blob,current),sourceDocument=structuredClone(archive.document),sourceMetadata=archive.metadata?structuredClone(archive.metadata):undefined,mapped=appendPaperArchive(sourceDocument,scope.noteId);checked(current);
 const target=await destination(scope,current,undefined,receipt.targetLineage),existingFiles=await listLocalBlobs(scope.accountId,scope.spaceId);checked(current);const blobs:LocalBlob[]=[],files:PaperAppendArchiveFile[]=[];
 for(const asset of sourceDocument.assets){
  checked(current);const id=mapped.assets.get(asset.id)!,bytes=archive.files[`assets/${asset.id}`];
  if(existingFiles.some(file=>file.id===id)||!bytes||bytes.size!==asset.size||bytes.size>MAX_PAPER_ARCHIVE_MEMBER_BYTES)throw Error('Une pièce jointe manque, a changé ou utilise déjà cette identité. Son original reste conservé.');
  const blob=bytes.slice(0,undefined,asset.mediaType),checksum=await blobDigest(blob,current);
  blobs.push({...scoped(scope),id,documentId:target.identity.documentId,blob,name:asset.name,createdAt:Date.parse(receipt.createdAt),status:'pending',removedFromNote:true,revision:1,sha256:checksum});files.push({sourceId:asset.id,id,name:asset.name,mediaType:asset.mediaType,size:blob.size,sha256:checksum});
 }
 const body={...receipt,sourceDocument,...(sourceMetadata?{sourceMetadata}:{}),commands:structuredClone(mapped.commands),assets:Object.fromEntries(mapped.assets),firstPageId:mapped.firstPageId,files};
 const {state,...fingerprintBody}=body,ready:PaperAppendArchiveReady={...fingerprintBody,state:'ready',fingerprint:readyFingerprint(fingerprintBody)};
 if(!validReceipt(ready,scope,receipt.id))throw Error('Le graphe importé nécessite une récupération. Le ZIP original reste conservé.');
 const commit=plan(scope);commit.blobs=blobs;commit.snapshots=[{...row,value:ready}];commit.draftChecks=[{identity:target.identity,expected:target.draft}];commit.blobChecks=blobs.map(blob=>({identity:blob,expected:undefined}));commit.snapshotChecks=[{key:row.key,expected:row},{key:original.key,expected:original},{key:target.deletionKey,expected:undefined}];
 await commitNotebookTransfer(commit,current);return structuredClone(ready);
}
function ensureIndependent(document:PaperDocument,receipt:Pick<PaperAppendArchiveReady,'noteId'|'createdAt'|'commands'>){
 const mapped=mappedDocument(receipt),groups=new Set(document.objects.flatMap(object=>object.groupId?[object.groupId]:[])),cards=new Set(document.study?.cards.map(card=>card.id)??[]);
 if(mapped.pages.some(page=>document.pages.some(existing=>existing.id===page.id))||mapped.objects.some(object=>document.objects.some(existing=>existing.id===object.id)||object.groupId&&groups.has(object.groupId))||mapped.assets.some(asset=>document.assets.some(existing=>existing.id===asset.id))||mapped.audio.some(audio=>document.audio.some(existing=>existing.id===audio.id))||mapped.study?.cards.some(card=>cards.has(card.id)))throw Error('Les éléments importés possèdent déjà une autre destination. Aucun élément n’est écrasé ni ajouté deux fois.');
}
/** Suitable for usePaperDocument.applyPrepared. Canonical graph, activation,
 * original history and terminal receipt share one CAS storage transaction.
 * An applied receipt is absorbing, even after later edits or undo. */
export async function preparePaperAppendArchivePublication(input:{document:PaperDocument;scope:PaperAppendArchiveScope;id:string;current:()=>boolean}):Promise<PreparedPaperAppendArchivePublication>{
 const scope=capturedScope(input.scope),document=structuredClone(input.document),current=input.current;checked(current);
 if(!isPaperDocument(document)||document.noteId!==scope.noteId)throw Error('Cette version appartient à une autre note.');
 const row=await readReceiptRow(scope,input.id,current),receipt=row.value;
 if(receipt.state==='applied')throw new PaperAppendArchiveAppliedError(receipt);
 if(receipt.state!=='ready')throw Error('Le ZIP est conservé ; préparez ses pages et médias avant leur ajout.');
 const original=await readOriginal(scope,receipt,current),target=await destination(scope,current,document,receipt.targetLineage);ensureIndependent(document,receipt);
 const storedFiles=await listLocalBlobs(scope.accountId,scope.spaceId);checked(current);const blobs:LocalBlob[]=[],checks:NotebookTransferCommit['blobChecks']=[];
 for(const file of receipt.files){
  const stored=storedFiles.find(blob=>blob.id===file.id);
  if(!stored||stored.accountId!==scope.accountId||stored.spaceId!==scope.spaceId||stored.documentId!==target.identity.documentId||stored.removedFromNote!==true||stored.status!=='pending'||stored.serverId!==undefined||stored.name!==file.name||stored.blob.type!==file.mediaType||stored.blob.size!==file.size||stored.sha256!==file.sha256||await blobDigest(stored.blob,current)!==file.sha256)throw Error('Un média de l’importation manque ou a changé. Le ZIP original et les autres fichiers restent conservés.');
  checks.push({identity:stored,expected:stored});blobs.push({...stored,removedFromNote:false,revision:(stored.revision??0)+1});
 }
 checked(current);const now=Date.now(),next=amendPaperCollaboration(document,applyPaperCommand(document,{type:'batch',commands:receipt.commands},new Date(now).toISOString()),JSON.stringify([scope.accountId,scope.spaceId,scope.noteId])),draft:Draft={...target.draft,content:next,updatedAt:now,syncState:'local'};
 const baseHistoryKey=`paper-history|${scope.accountId}|${scope.spaceId}|whiteboard|${target.identity.documentId}|${String(document.revision).padStart(12,'0')}`,baseHistory=await getSnapshot(baseHistoryKey);checked(current);ownedSnapshot(baseHistory,scope,baseHistoryKey);
 const historyKey=baseHistory&&!same(baseHistory.value,document)?`${baseHistoryKey}|append-${receipt.id}`:baseHistoryKey,history=historyKey===baseHistoryKey?baseHistory:await getSnapshot(historyKey);checked(current);ownedSnapshot(history,scope,historyKey);
 if(history&&!same(history.value,document))throw Error('Une version de récupération utilise déjà cette identité. Aucun historique n’est remplacé.');
 const applied:PaperAppendArchiveApplied={...receipt,state:'applied',appliedAt:new Date(now).toISOString(),publishedRevision:next.revision,beforeHistoryKey:historyKey},commit=plan(scope);
 commit.drafts=[draft];commit.blobs=blobs;commit.snapshots=[{...row,value:applied},...(history?[]:[{key:historyKey,...scoped(scope),value:document}])];commit.draftChecks=[{identity:target.identity,expected:target.draft}];commit.blobChecks=checks;commit.snapshotChecks=[{key:row.key,expected:row},{key:original.key,expected:original},{key:target.deletionKey,expected:undefined},{key:baseHistoryKey,expected:baseHistory},...(historyKey!==baseHistoryKey?[{key:historyKey,expected:history}]:[])];
 return {draft,commit,firstPageId:receipt.firstPageId,receipt:applied};
}

export interface PaperLegacyAppendSourceFile {sourceId:string;id:string;sha256:string;state:Record<string,unknown>}
export interface PaperLegacyAppendCopy {
 commands:PaperCommand[];assets:Record<string,string>;files:PaperAppendArchiveFile[];firstPageId:string;
}
interface PaperLegacyAppendBase extends PaperAppendArchiveScope {
 schema:1;kind:'paper-legacy-append-copy';id:string;createdAt:string;sourceName:string;targetLineage:string;
 sourceReceipt:Snapshot;sourceFingerprint:string;sourceFiles:PaperLegacyAppendSourceFile[];fingerprint:string;
 quality:{sourceZip:'absent';originalIntegrity:'unproven';historicalIncarnation:'unproven';localMedia:'sha256-verified-at-admission'};
 firstPageId:string;
}
export interface PaperLegacyAppendReady extends PaperLegacyAppendBase {state:'ready';copy:PaperLegacyAppendCopy}
export interface PaperLegacyAppendApplied extends PaperLegacyAppendBase {state:'applied';outcome:'copy'|'already-present';copy?:PaperLegacyAppendCopy;appliedAt:string;publishedRevision:number;beforeHistoryKey?:string}
export type PaperLegacyAppendArchiveReceipt=PaperLegacyAppendReady|PaperLegacyAppendApplied;
export interface PreparedPaperLegacyAppendArchivePublication {draft:Draft;commit:NotebookTransferCommit;firstPageId:string;receipt:PaperLegacyAppendApplied}
export interface PaperLegacyAppendRecoveryDescription {label:string;status:string;integrity:string;canPublishCopy:boolean;canSaveOriginal:false}
/** UI text describes today's proof, without assigning a ZIP provenance or
 * promising that a previously applied contribution survived a later Undo. */
export function describePaperLegacyAppendArchiveRecovery(receipt:PaperLegacyAppendArchiveReceipt):PaperLegacyAppendRecoveryDescription {
 return {
  label:'Copie explicite de données anciennes',
  status:receipt.state==='ready'?'Copie prête à ajouter avec de nouvelles identités.':receipt.outcome==='copy'?'Copie ajoutée lors de cette reprise ; aucune répétition automatique.':'Contenu complet confirmé présent lors de cette reprise ; aucune répétition automatique.',
  integrity:'Les octets des médias locaux ont été vérifiés par SHA-256 lors de cette nouvelle admission. Le ZIP original est absent : son intégrité et l’identité historique de la note ne sont pas prouvées.',
  canPublishCopy:receipt.state==='ready',canSaveOriginal:false,
 };
}
const valueFingerprint=(value:unknown)=>bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(stable(value)))));
const canonicalSame=(first:unknown,second:unknown)=>same(stable(first),stable(second));
const legacyPrefix=(scope:PaperAppendArchiveScope)=>`paper-import-append|${scope.accountId}|${scope.spaceId}|${scope.noteId}|`;
function legacySourceKey(scope:PaperAppendArchiveScope,key:string){
 // The old writer appends one delimiter-free uid. A longer note ID therefore
 // cannot be mistaken for this note, including note IDs containing '|'.
 if(typeof key!=='string'||!key.startsWith(legacyPrefix(scope))||!safeId(key.slice(legacyPrefix(scope).length)))throw Error('Ce reçu historique ne désigne pas cette note.');return key;
}
export const paperLegacyAppendRecoveryPrefix=(scope:PaperAppendArchiveScope)=>`paper-legacy-append-copy|v1|${namespace(capturedScope(scope))}|`;
export function paperLegacyAppendRecoveryId(scope:PaperAppendArchiveScope,sourceReceiptKey:string){const captured=capturedScope(scope);legacySourceKey(captured,sourceReceiptKey);return `legacy-${notebookIdentityDigest(sourceReceiptKey)}`;}
export function paperLegacyAppendRecoveryKey(scope:PaperAppendArchiveScope,id:string){if(!safeId(id))throw Error('Identifiant de copie historique incompatible.');return `${paperLegacyAppendRecoveryPrefix(scope)}${id}`;}
const mediaType=(type:string)=>new Blob([],{type}).type;
const localFileState=(file:LocalBlob):Record<string,unknown>=>({...file,blob:undefined,key:undefined,size:file.blob.size,mediaType:file.blob.type});
const legacyBody=(receipt:PaperLegacyAppendArchiveReceipt)=>{
 const {state,fingerprint,...body}=receipt;
 if(state==='applied'){const {outcome,appliedAt,publishedRevision,beforeHistoryKey,...source}=body as Omit<PaperLegacyAppendApplied,'state'|'fingerprint'>;return source;}
 return body;
};
function legacyPhoto(src:string){const ref=parsePhotoReference(src);if(ref)return ref;const match=/^dowze-photo:([^/]+)\/([^/]+)$/.exec(src);if(!match)return null;try{const id=decodeURIComponent(match[2]);return id.length>0&&id.length<=200?{id}:null;}catch{return null;}}
/** Validate the actual old append contract. Never execute arbitrary commands
 * found in a historical snapshot against the current destination document. */
function legacyGraph(scope:PaperAppendArchiveScope,row:Snapshot):{source:PaperDocument;metadata?:PaperArchiveMetadata;mapped:PaperDocument;assets:Record<string,string>;commands:PaperCommand[];sourceName:string}{
 legacySourceKey(scope,row.key);ownedSnapshot(row,scope,row.key);const value=row.value;
 if(!record(value)||value.schema!==1||typeof value.sourceName!=='string'||value.sourceName.length>1000||!isPaperDocument(value.sourceDocument)||!record(value.assets)||!Array.isArray(value.commands)||value.sourceMetadata!==undefined&&(!isPaperArchiveMetadata(value.sourceMetadata)||value.sourceMetadata.note.id!==value.sourceDocument.noteId))throw Error('Le graphe du reçu historique doit être vérifié. Ses données restent conservées.');
 const source=value.sourceDocument,commands=value.commands as PaperCommand[],assets=value.assets as Record<string,string>;
 const documentBytes=new Blob([JSON.stringify(source)]).size;
 if(commands.some(command=>!record(command)||!['study-card','add-asset','add-audio','insert-page','upsert-object'].includes(String(command.type)))||documentBytes>MAX_PAPER_ARCHIVE_MEMBER_BYTES||source.assets.length+1>MAX_PAPER_ARCHIVE_ENTRIES||source.assets.some(asset=>!Number.isSafeInteger(asset.size)||asset.size>MAX_PAPER_ARCHIVE_MEMBER_BYTES)||source.assets.reduce((total,asset)=>total+asset.size,documentBytes)>MAX_PAPER_ARCHIVE_BYTES)throw Error('Les commandes historiques ne décrivent pas une archive ajoutée. Aucune commande n’est rejouée.');
 const pages=commands.filter(command=>command.type==='insert-page').map(command=>command.page),objects=commands.filter(command=>command.type==='upsert-object').map(command=>command.object),audio=commands.filter(command=>command.type==='add-audio').map(command=>command.audio),cards=commands.filter(command=>command.type==='study-card').map(command=>command.card),mappedAssets=commands.filter(command=>command.type==='add-asset').map(command=>command.asset);
 const ids=(before:readonly {id:string}[],after:readonly {id:string}[])=>{
  if(before.length!==after.length||after.some(item=>!record(item)||typeof item.id!=='string'||!item.id||item.id.length>200)||new Set(after.map(item=>item.id)).size!==after.length)throw Error('Les identités historiques ne sont pas indépendantes.');return new Map(before.map((item,index)=>[item.id,after[index].id]));
 };
 const pageIds=ids(source.pages,pages),objectIds=ids(source.objects,objects),audioIds=ids(source.audio,audio),cardIds=ids(source.study?.cards??[],cards),assetIds=ids(source.assets,mappedAssets),groups=new Map<string,string>();
 if(Object.keys(assets).length!==source.assets.length||source.assets.some(asset=>!Object.hasOwn(assets,asset.id)||assets[asset.id]!==assetIds.get(asset.id)))throw Error('Le remappage des médias historiques ne correspond pas au graphe.');
 source.objects.forEach((object,index)=>{if(!object.groupId)return;const group=objects[index].groupId;if(typeof group!=='string'||!group||group.length>200||groups.has(object.groupId)&&groups.get(object.groupId)!==group)throw Error('Les groupes historiques sont incohérents.');groups.set(object.groupId,group);});
 if(new Set(groups.values()).size!==groups.size)throw Error('Deux groupes historiques occupent une seule identité.');
 const expected:PaperCommand[]=[...(source.study?.cards??[]).map(card=>({type:'study-card' as const,card:{...card,id:cardIds.get(card.id)!,...(card.source?{source:{...card.source,noteId:scope.noteId,pageId:pageIds.get(card.source.pageId)??card.source.pageId,objectId:objectIds.get(card.source.objectId)??card.source.objectId}}:{})}})),...source.assets.map(asset=>({type:'add-asset' as const,asset:{id:assetIds.get(asset.id)!,name:asset.name,mediaType:asset.mediaType,size:asset.size}})),...source.audio.map(track=>({type:'add-audio' as const,audio:{...track,id:audioIds.get(track.id)!,assetId:assetIds.get(track.assetId)!,...(track.source?{source:{...track.source,chunks:track.source.chunks.map(chunk=>({...chunk,assetId:assetIds.get(chunk.assetId)!}))}}:{}),...(track.segments?{segments:track.segments.map(part=>({...part,assetId:assetIds.get(part.assetId)!,...(part.source?{source:{...part.source,chunks:part.source.chunks.map(chunk=>({...chunk,assetId:assetIds.get(chunk.assetId)!}))}}:{})}))}:{})}})),...source.pages.map(page=>({type:'insert-page' as const,page:{...page,...(page.flowRootId?{flowRootId:objectIds.get(page.flowRootId)}:{}),id:pageIds.get(page.id)!,...(page.pdf?{pdf:{...page.pdf,assetId:assetIds.get(page.pdf.assetId)!}}:{})}})),...source.objects.map(object=>({type:'upsert-object' as const,object:{...object,...(object.textFlow?{textFlow:{...object.textFlow,pageIds:object.textFlow.pageIds.map(id=>pageIds.get(id)!)}}:{}),...(object.markdown?{markdown:object.markdown.replace(/dowze-photo:[^\s)]+/g,src=>{const ref=legacyPhoto(src);return ref&&assetIds.has(ref.id)?photoReference(notebookDocumentId(scope.noteId),assetIds.get(ref.id)!):src;})}:{}),...(object.groupId?{groupId:groups.get(object.groupId)}:{}),id:objectIds.get(object.id)!,pageId:pageIds.get(object.pageId)!,...(object.assetId?{assetId:assetIds.get(object.assetId)!}:{}),...(object.audioAnchor?{audioAnchor:{...object.audioAnchor,sessionId:audioIds.get(object.audioAnchor.sessionId)!}}:{})}}))];
 if(!canonicalSame(commands,expected))throw Error('Les commandes et la source historiques divergent. Aucun élément existant n’est remplacé.');
 const mapped=mappedDocument({noteId:scope.noteId,createdAt:'1970-01-01T00:00:00.000Z',commands});
 // This timestamp is only an internal model-validation sentinel. It is never
 // a receipt, an import date, a source provenance field or a persisted record.
 return {source,metadata:value.sourceMetadata as PaperArchiveMetadata|undefined,mapped,assets,commands,sourceName:value.sourceName};
}
async function legacySource(scope:PaperAppendArchiveScope,key:string,current:()=>boolean){
 checked(current);legacySourceKey(scope,key);const row=await getSnapshot(key);checked(current);ownedSnapshot(row,scope,key);if(!row)throw Error('Le reçu historique manque. Sa récupération attend sa source conservée.');const captured=structuredClone(row);return {row:captured,graph:legacyGraph(scope,captured)};
}
async function legacyFiles(scope:PaperAppendArchiveScope,graph:ReturnType<typeof legacyGraph>,current:()=>boolean,proofs?:PaperLegacyAppendSourceFile[]){
 const rows=await listLocalBlobs(scope.accountId,scope.spaceId);checked(current);const files:LocalBlob[]=[],captured:PaperLegacyAppendSourceFile[]=[];
 for(const asset of graph.source.assets){
  const id=graph.assets[asset.id],file=rows.find(file=>file.id===id);
  if(!file||file.accountId!==scope.accountId||file.spaceId!==scope.spaceId||file.documentId!==notebookDocumentId(scope.noteId)||file.name!==asset.name||file.blob.size!==asset.size||asset.size>MAX_PAPER_ARCHIVE_MEMBER_BYTES||file.blob.type!==mediaType(asset.mediaType))throw Error('Un média historique manque ou ne correspond plus. Le reçu et les fichiers restants sont conservés.');
  const checksum=await blobDigest(file.blob,current);if(file.sha256!==undefined&&file.sha256!==checksum)throw Error('L’empreinte stockée d’un média historique ne correspond pas à ses octets.');
  const proof={sourceId:asset.id,id,sha256:checksum,state:localFileState(file)},before=proofs?.find(before=>before.sourceId===asset.id);
  if(proofs&&(!before||!canonicalSame(before,proof)))throw Error('Les médias historiques ont changé depuis l’admission explicite. Leurs versions restent conservées.');
  files.push(file);captured.push(proof);
 }
 return {files,proofs:captured};
}
function mappedContentPresent(document:PaperDocument,graph:ReturnType<typeof legacyGraph>,files:readonly LocalBlob[]):boolean{
 const mapped=graph.mapped,positions=mapped.pages.map(page=>document.pages.findIndex(existing=>existing.id===page.id));
 if(positions.some((position,index)=>position<0||index>0&&position<=positions[index-1]))return false;
 if(mapped.pages.some(page=>!canonicalSame(document.pages.find(existing=>existing.id===page.id),page))||mapped.objects.some(object=>!canonicalSame(document.objects.find(existing=>existing.id===object.id),object))||mapped.audio.some(audio=>!canonicalSame(document.audio.find(existing=>existing.id===audio.id),audio))||(mapped.study?.cards??[]).some(card=>!canonicalSame(document.study?.cards.find(existing=>existing.id===card.id),card)))return false;
 return mapped.assets.every(asset=>{const found=document.assets.find(existing=>existing.id===asset.id),file=files.find(file=>file.id===asset.id);if(!found||!file)return false;const {serverId,...body}=found;return canonicalSame(body,asset)&&(serverId===undefined||file.status==='uploaded'&&file.serverId===serverId);});
}
function validLegacyReceipt(value:unknown,scope:PaperAppendArchiveScope,id:string):value is PaperLegacyAppendArchiveReceipt{
 try{
  if(!record(value)||value.schema!==1||value.kind!=='paper-legacy-append-copy'||!owned(value as unknown as PaperAppendArchiveScope,scope)||value.id!==id||!safeId(id)||typeof value.createdAt!=='string'||!Number.isFinite(Date.parse(value.createdAt))||typeof value.sourceName!=='string'||typeof value.targetLineage!=='string'||!value.targetLineage||value.targetLineage.length>200||!record(value.sourceReceipt)||!digest(value.sourceFingerprint)||!digest(value.fingerprint)||!Array.isArray(value.sourceFiles)||!['ready','applied'].includes(String(value.state)))return false;
  const receipt=value as unknown as PaperLegacyAppendArchiveReceipt,graph=legacyGraph(scope,receipt.sourceReceipt);
  if(receipt.id!==paperLegacyAppendRecoveryId(scope,receipt.sourceReceipt.key)||receipt.sourceFingerprint!==valueFingerprint(receipt.sourceReceipt)||receipt.sourceName!==graph.sourceName||!canonicalSame(receipt.quality,{sourceZip:'absent',originalIntegrity:'unproven',historicalIncarnation:'unproven',localMedia:'sha256-verified-at-admission'})||receipt.sourceFiles.length!==graph.source.assets.length||new Set(receipt.sourceFiles.map(file=>file?.sourceId)).size!==receipt.sourceFiles.length||receipt.sourceFiles.some(file=>!record(file)||typeof file.sourceId!=='string'||!Object.hasOwn(graph.assets,file.sourceId)||typeof file.id!=='string'||file.id!==graph.assets[file.sourceId]||!digest(file.sha256)||!record(file.state)))return false;
  if(receipt.copy!==undefined){
   const copy=receipt.copy;if(!Array.isArray(copy.commands)||!record(copy.assets)||!Array.isArray(copy.files)||copy.files.length!==graph.source.assets.length||new Set(copy.files.map(file=>file?.sourceId)).size!==copy.files.length||copy.files.some(file=>!record(file)||!safeId(file.id)||copy.assets[file.sourceId]!==file.id||file.id===graph.assets[file.sourceId]||!digest(file.sha256)||file.sha256!==receipt.sourceFiles.find(source=>source.sourceId===file.sourceId)?.sha256||!graph.source.assets.some(asset=>asset.id===file.sourceId&&asset.name===file.name&&asset.mediaType===file.mediaType&&asset.size===file.size)))return false;
   const copied=legacyGraph(scope,{...receipt.sourceReceipt,value:{schema:1,sourceName:receipt.sourceName,sourceDocument:graph.source,...(graph.metadata?{sourceMetadata:graph.metadata}:{}),assets:copy.assets,commands:copy.commands}});
   if(copied.mapped.pages[0].id!==copy.firstPageId)return false;
  }
  if(receipt.state==='ready'||receipt.outcome==='copy'){if(!receipt.copy||receipt.firstPageId!==receipt.copy.firstPageId)return false;}
  else if(receipt.outcome!=='already-present'||receipt.firstPageId!==graph.mapped.pages[0].id)return false;
  return receipt.fingerprint===valueFingerprint(legacyBody(receipt))&&(receipt.state!=='applied'||Number.isFinite(Date.parse(receipt.appliedAt))&&Number.isSafeInteger(receipt.publishedRevision)&&receipt.publishedRevision>=0);
 }catch{return false;}
}
async function legacyRecoveryRow(scope:PaperAppendArchiveScope,id:string,current:()=>boolean){
 checked(current);const key=paperLegacyAppendRecoveryKey(scope,id),row=await getSnapshot(key);checked(current);ownedSnapshot(row,scope,key);
 if(!row||!validLegacyReceipt(row.value,scope,id))throw Error('La copie historique conservée attend une vérification. Aucun original n’est remplacé.');return structuredClone(row) as Snapshot&{value:PaperLegacyAppendArchiveReceipt};
}
export async function readPaperLegacyAppendArchiveRecovery(input:{scope:PaperAppendArchiveScope;id:string;current:()=>boolean}):Promise<PaperLegacyAppendArchiveReceipt>{const scope=capturedScope(input.scope);return (await legacyRecoveryRow(scope,input.id,input.current)).value;}
export async function listPaperLegacyAppendArchiveRecoveries(input:{scope:PaperAppendArchiveScope;current:()=>boolean;includeApplied?:boolean}):Promise<PaperLegacyAppendArchiveReceipt[]>{
 const scope=capturedScope(input.scope),current=input.current,includeApplied=input.includeApplied===true,prefix=paperLegacyAppendRecoveryPrefix(scope);checked(current);const rows=await listSnapshotsByPrefix(scope.accountId,scope.spaceId,prefix);checked(current);
 return rows.map(row=>{if(!validLegacyReceipt(row.value,scope,row.key.slice(prefix.length)))throw Error('Une copie historique conservée attend une vérification.');return structuredClone(row.value);}).filter(row=>includeApplied||row.state!=='applied').sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt)||a.id.localeCompare(b.id));
}
/** This is an explicit NEW copy admission, never an assertion that the old
 * import was unfinished or that its ZIP/date/incarnation can be reconstructed.
 * The current local bytes are checked and retained under fresh stable IDs. */
export async function stagePaperLegacyAppendArchiveCopy(input:{scope:PaperAppendArchiveScope;sourceReceiptKey:string;current:()=>boolean}):Promise<PaperLegacyAppendArchiveReceipt>{
 const scope=capturedScope(input.scope),sourceReceiptKey=input.sourceReceiptKey,current=input.current,id=paperLegacyAppendRecoveryId(scope,sourceReceiptKey),key=paperLegacyAppendRecoveryKey(scope,id);checked(current);
 const previous=await getSnapshot(key);checked(current);ownedSnapshot(previous,scope,key);
 if(previous){if(!validLegacyReceipt(previous.value,scope,id))throw Error('Cette récupération historique possède déjà un reçu incompatible.');if(previous.value.state==='applied')return structuredClone(previous.value);}
 const source=await legacySource(scope,sourceReceiptKey,current),target=await destination(scope,current,undefined,previous?(previous.value as PaperLegacyAppendReady).targetLineage:undefined),ownedFiles=await legacyFiles(scope,source.graph,current,previous?(previous.value as PaperLegacyAppendReady).sourceFiles:undefined),document=target.draft.content as PaperDocument;
 if(previous&&!canonicalSame((previous.value as PaperLegacyAppendReady).sourceReceipt,source.row))throw Error('Le reçu historique a changé depuis sa conservation.');
 if(mappedContentPresent(document,source.graph,ownedFiles.files)){
  const base={schema:1 as const,kind:'paper-legacy-append-copy' as const,...scope,id,createdAt:previous?(previous.value as PaperLegacyAppendReady).createdAt:new Date().toISOString(),sourceName:source.graph.sourceName,targetLineage:document.collaboration!.lineage,sourceReceipt:source.row,sourceFingerprint:valueFingerprint(source.row),sourceFiles:ownedFiles.proofs,quality:{sourceZip:'absent' as const,originalIntegrity:'unproven' as const,historicalIncarnation:'unproven' as const,localMedia:'sha256-verified-at-admission' as const},firstPageId:source.graph.mapped.pages[0].id,...(previous?{copy:(previous.value as PaperLegacyAppendReady).copy}:{})};
  const applied:PaperLegacyAppendApplied={...base,fingerprint:valueFingerprint(base),state:'applied',outcome:'already-present',appliedAt:new Date().toISOString(),publishedRevision:document.revision},commit=plan(scope);
  if(!validLegacyReceipt(applied,scope,id))throw Error('La reconnaissance du contenu historique doit être vérifiée. Ses sources sont intactes.');
  // Activation here is safe: every corresponding mapped entity is already
  // in this exact durable canonical graph. It never uploads an orphan.
  commit.blobs=ownedFiles.files.filter(file=>file.removedFromNote).map(file=>({...file,removedFromNote:false,revision:(file.revision??0)+1}));commit.snapshots=[{key,...scoped(scope),value:applied}];commit.draftChecks=[{identity:target.identity,expected:target.draft}];commit.blobChecks=ownedFiles.files.map(file=>({identity:file,expected:file}));commit.snapshotChecks=[{key,expected:previous},{key:source.row.key,expected:source.row},{key:target.deletionKey,expected:undefined}];await commitNotebookTransfer(commit,current);return structuredClone(applied);
 }
 if(previous)return structuredClone(previous.value as PaperLegacyAppendReady);
 const mapped=appendPaperArchive(source.graph.source,scope.noteId),existingFiles=await listLocalBlobs(scope.accountId,scope.spaceId);checked(current);const files:PaperAppendArchiveFile[]=[],blobs:LocalBlob[]=[];
 for(const asset of source.graph.source.assets){const original=ownedFiles.files.find(file=>file.id===source.graph.assets[asset.id])!,proof=ownedFiles.proofs.find(file=>file.sourceId===asset.id)!,id=mapped.assets.get(asset.id)!;if(existingFiles.some(file=>file.id===id))throw Error('Une nouvelle identité de média existe déjà. Aucun fichier historique n’est remplacé.');files.push({sourceId:asset.id,id,name:asset.name,mediaType:asset.mediaType,size:asset.size,sha256:proof.sha256});blobs.push({...scoped(scope),id,documentId:target.identity.documentId,blob:original.blob,name:asset.name,createdAt:Date.now(),status:'pending',removedFromNote:true,revision:1,sha256:proof.sha256});}
 const body={schema:1 as const,kind:'paper-legacy-append-copy' as const,...scope,id,createdAt:new Date().toISOString(),sourceName:source.graph.sourceName,targetLineage:document.collaboration!.lineage,sourceReceipt:source.row,sourceFingerprint:valueFingerprint(source.row),sourceFiles:ownedFiles.proofs,quality:{sourceZip:'absent' as const,originalIntegrity:'unproven' as const,historicalIncarnation:'unproven' as const,localMedia:'sha256-verified-at-admission' as const},firstPageId:mapped.firstPageId,copy:{commands:structuredClone(mapped.commands),assets:Object.fromEntries(mapped.assets),files,firstPageId:mapped.firstPageId}},receipt:PaperLegacyAppendReady={...body,state:'ready',fingerprint:valueFingerprint(body)};
 if(!validLegacyReceipt(receipt,scope,id))throw Error('La copie des données historiques doit être vérifiée. Ses sources sont intactes.');ensureIndependent(document,{...receipt,commands:receipt.copy.commands});
 const commit=plan(scope);commit.blobs=blobs;commit.snapshots=[{key,...scoped(scope),value:receipt}];commit.draftChecks=[{identity:target.identity,expected:target.draft}];commit.blobChecks=[...ownedFiles.files.map(file=>({identity:file,expected:file})),...blobs.map(file=>({identity:file,expected:undefined}))];commit.snapshotChecks=[{key,expected:undefined},{key:source.row.key,expected:source.row},{key:target.deletionKey,expected:undefined}];await commitNotebookTransfer(commit,current);return structuredClone(receipt);
}
/** Only new copied identities publish. A complete old mapped contribution that
 * appeared meanwhile is reconciled through stagePaperLegacyAppendArchiveCopy,
 * whose snapshot-only terminal path intentionally bypasses applyPrepared. */
export async function preparePaperLegacyAppendArchivePublication(input:{document:PaperDocument;scope:PaperAppendArchiveScope;id:string;current:()=>boolean}):Promise<PreparedPaperLegacyAppendArchivePublication>{
 const scope=capturedScope(input.scope),document=structuredClone(input.document),id=input.id,current=input.current;checked(current);if(!isPaperDocument(document)||document.noteId!==scope.noteId)throw Error('La destination appartient à une autre note.');
 const row=await legacyRecoveryRow(scope,id,current),receipt=row.value;if(receipt.state==='applied')throw Error('Ces données historiques ont déjà été récupérées. Aucune nouvelle copie n’est créée.');
 const source=await legacySource(scope,receipt.sourceReceipt.key,current);if(!canonicalSame(source.row,receipt.sourceReceipt)||valueFingerprint(source.row)!==receipt.sourceFingerprint)throw Error('Le reçu historique a changé. Ses variantes restent conservées.');
 const ownedFiles=await legacyFiles(scope,source.graph,current,receipt.sourceFiles),target=await destination(scope,current,document,receipt.targetLineage);if(mappedContentPresent(document,source.graph,ownedFiles.files))throw Error('Le contenu historique mappé est déjà présent. Vérifiez de nouveau la récupération pour la confirmer sans créer de copie.');
 ensureIndependent(document,{...receipt,commands:receipt.copy.commands});const rows=await listLocalBlobs(scope.accountId,scope.spaceId);checked(current);const blobs:LocalBlob[]=[],blobChecks:NotebookTransferCommit['blobChecks']=ownedFiles.files.map(file=>({identity:file,expected:file}));
 for(const descriptor of receipt.copy.files){const file=rows.find(file=>file.id===descriptor.id);if(!file||file.documentId!==target.identity.documentId||file.accountId!==scope.accountId||file.spaceId!==scope.spaceId||file.status!=='pending'||file.removedFromNote!==true||file.serverId!==undefined||file.name!==descriptor.name||file.blob.size!==descriptor.size||file.blob.type!==mediaType(descriptor.mediaType)||file.sha256!==descriptor.sha256||await blobDigest(file.blob,current)!==descriptor.sha256)throw Error('Un média de la copie historique a changé. Ses autres sources restent conservées.');blobChecks.push({identity:file,expected:file});blobs.push({...file,removedFromNote:false,revision:(file.revision??0)+1});}
 const now=new Date().toISOString(),next=amendPaperCollaboration(document,applyPaperCommand(document,{type:'batch',commands:receipt.copy.commands},now),JSON.stringify([scope.accountId,scope.spaceId,scope.noteId])),draft:Draft={...target.draft,content:next,updatedAt:Date.parse(now),syncState:'local'},historyKey=`paper-history|${scope.accountId}|${scope.spaceId}|whiteboard|${target.identity.documentId}|${String(document.revision).padStart(12,'0')}|legacy-append-${receipt.id}`,history=await getSnapshot(historyKey);checked(current);ownedSnapshot(history,scope,historyKey);if(history&&!canonicalSame(history.value,document))throw Error('Une autre version conserve déjà cet historique.');
 const applied:PaperLegacyAppendApplied={...receipt,state:'applied',outcome:'copy',appliedAt:now,publishedRevision:next.revision,beforeHistoryKey:historyKey},commit=plan(scope);commit.drafts=[draft];commit.blobs=blobs;commit.snapshots=[{...row,value:applied},...(history?[]:[{key:historyKey,...scoped(scope),value:document}])];commit.draftChecks=[{identity:target.identity,expected:target.draft}];commit.blobChecks=blobChecks;commit.snapshotChecks=[{key:row.key,expected:row},{key:source.row.key,expected:source.row},{key:target.deletionKey,expected:undefined},{key:historyKey,expected:history}];return {draft,commit,firstPageId:receipt.firstPageId,receipt:applied};
}
