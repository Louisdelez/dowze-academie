import {getDraft,getSnapshot,listLocalBlobs,localBlobDigest,commitNotebookTransfer,NotebookTransferChangedError,readNotebookDeletionStatus,notebookDeletionKey,type Draft,type DraftKey,type LocalBlob,type Snapshot,type NotebookTransferCommit} from '../../pwa/src/storage.ts';
import {isPaperDocument,legacyPaperPhotoIdentities,notebookDocumentId,type PaperDocument} from './notebookDocument.ts';
import {legacyNotebookDocumentId} from './notebookIdentity.ts';
import {noteBoardId,parsePhotoReference} from './notebook.ts';
import {readOwnedLegacyNotebookBoard} from './paperIdentity.ts';
import {paperLegacyOwnerKey} from './paperLegacyMigration.ts';
import {amendPaperCollaboration} from './paperCollaboration.ts';
import {paperMarkdown} from './paperArchiveMetadata.ts';
import {planPaperLegacyReconcile,type PaperLegacyObservation} from './paperLegacyReconcile.ts';
import {prepareLegacyImageAssets,rewriteLegacyImageBindings,type LegacyImageBinding,type LegacyImageDownloadNeed} from './paperLegacyImageAssets.ts';
import {scanLegacyPaperImages} from './paperLegacyImages.ts';

export interface PaperLegacyScope {accountId:string;spaceId:string}
export interface PaperLegacyBridgeInput {
 noteId:string;scope:PaperLegacyScope;incomingMarkdown:string;current:()=>boolean;
 /** External means native metadata has its own conditional, durable setter. */
 metadataAuthority?:'external'|'indexeddb';preparedFiles?:readonly LocalBlob[];
 downloadOriginal?:(need:LegacyImageDownloadNeed)=>Promise<Blob>;
 now?:string;newId?:()=>string;
 /** Initial opening owns its global fresh-read budget; other callers retain strict transport-only retries. */
 retryTransport?:boolean;
 /** Initial mounted opening may recheck this exact committed observation without replaying its planner. */
 capturePostcondition?:boolean;
}
export interface PaperLegacyMirror {
 id:string;status:'staged'|'published';expectedMarkdown:string;desiredMarkdown:string;
 paperRevision:number;stagedAt:string;publishedAt?:string;
}
export interface PaperLegacyBridgeReceipt {
 schema:1;kind:'paper-legacy-observation';noteId:string;documentId:string;
 observed:PaperLegacyObservation;baselineKnown:boolean;paperRevision:number;observedAt:string;
 sourceMetadata:Draft|null;sourceBoard:Draft|null;mirror?:PaperLegacyMirror;
 imageBindings?:LegacyImageBinding[];imageReceiptKeys?:string[];
}
export interface PaperLegacyPreflight {
 noteId:string;scope:PaperLegacyScope;expectedPaper:Draft;draft:Draft;
 receipt:PaperLegacyBridgeReceipt;receiptRow:Snapshot;commit:NotebookTransferCommit;
 changed:boolean;recovered:boolean;notices:string[];
}
export interface PaperLegacyMirrorTicket {
 noteId:string;scope:PaperLegacyScope;paper:Draft;metadata:Draft|undefined;board:Draft|undefined;
 receipt:PaperLegacyBridgeReceipt;receiptRow:Snapshot;expectedMarkdown:string;desiredMarkdown:string;
}
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const canonical=(value:unknown):string=>JSON.stringify(value,(_key,item)=>record(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item)??'undefined';
const equal=(a:unknown,b:unknown)=>canonical(a)===canonical(b);
const draftKey=(identity:DraftKey)=>`${identity.accountId}|${identity.spaceId}|${identity.type??'notesMarkdown'}|${identity.documentId}`;
export class PaperLegacySourceChangedError extends Error {
 constructor(){super('Le compte, l’année ou la source de la note a changé. Les originaux restent conservés.');this.name='PaperLegacySourceChangedError';}
}
const check=(current:()=>boolean)=>{if(!current())throw new PaperLegacySourceChangedError();};
const identity=(scope:PaperLegacyScope,noteId:string)=>({...scope,type:'whiteboard' as const,documentId:notebookDocumentId(noteId)});
const ownedScope=(scope:PaperLegacyScope):PaperLegacyScope=>({accountId:scope.accountId,spaceId:scope.spaceId});
export const paperLegacyReceiptKey=(scope:PaperLegacyScope,noteId:string)=>`paper-legacy-observation|${draftKey(identity(scope,noteId))}`;
const metadataMarkdown=(draft:Draft|undefined)=>record(draft?.content)&&typeof draft.content.markdown==='string'?draft.content.markdown:undefined;
function validScope(scope:PaperLegacyScope,noteId:string){if(!scope||!['accountId','spaceId'].every(key=>typeof scope[key as keyof PaperLegacyScope]==='string'&&/^[A-Za-z0-9._-]{1,200}$/.test(scope[key as keyof PaperLegacyScope]))||typeof noteId!=='string'||!noteId||noteId.length>200)throw Error('L’identité du carnet est incompatible.');}
function receiptValue(row:Snapshot|undefined,scope:PaperLegacyScope,noteId:string):PaperLegacyBridgeReceipt|undefined{
 if(!row)return;const value=row.value;
 if(row.accountId!==scope.accountId||row.spaceId!==scope.spaceId||!record(value)||value.schema!==1||value.kind!=='paper-legacy-observation'||value.noteId!==noteId||value.documentId!==notebookDocumentId(noteId)||!record(value.observed)||typeof value.observed.markdown!=='string'||typeof value.baselineKnown!=='boolean'||!Number.isSafeInteger(value.paperRevision)||!Number.isFinite(Date.parse(String(value.observedAt))))throw Error('Le reçu historique est incompatible. Son original reste conservé.');
 if(value.mirror!==undefined&&(!record(value.mirror)||typeof value.mirror.id!=='string'||!['staged','published'].includes(String(value.mirror.status))||typeof value.mirror.expectedMarkdown!=='string'||typeof value.mirror.desiredMarkdown!=='string'||!Number.isSafeInteger(value.mirror.paperRevision)))throw Error('La publication précédente doit être récupérée avant de continuer.');
 if(value.imageBindings!==undefined&&!Array.isArray(value.imageBindings)||value.imageReceiptKeys!==undefined&&(!Array.isArray(value.imageReceiptKeys)||value.imageReceiptKeys.some(key=>typeof key!=='string')))throw Error('Le reçu des références d’images est incompatible.');
 return value as unknown as PaperLegacyBridgeReceipt;
}
async function readState(scope:PaperLegacyScope,noteId:string,current:()=>boolean){
 validScope(scope,noteId);check(current);
 const paper=await getDraft(identity(scope,noteId));check(current);
 if(!paper||!isPaperDocument(paper.content)||paper.content.noteId!==noteId||paper.staged||paper.syncState==='conflict'||paper.identityAlias)throw Error('La note doit être conservée et ses versions départagées avant la réconciliation.');
 const deletionRow=await getSnapshot(notebookDeletionKey(identity(scope,noteId)));check(current);
 if(await readNotebookDeletionStatus(noteId,scope,current))throw Error('Cette note a été supprimée sur le serveur. Ses sources sont conservées sans publication ni recréation automatique.');check(current);
 const ownerRow=await getSnapshot(paperLegacyOwnerKey(noteId,scope));check(current);
 if(ownerRow&&(ownerRow.accountId!==scope.accountId||ownerRow.spaceId!==scope.spaceId||!record(ownerRow.value)||ownerRow.value.schema!==1||ownerRow.value.noteId!==noteId||ownerRow.value.documentId!==paper.documentId||ownerRow.value.boardId!==noteBoardId(noteId)))throw Error('Cet ancien dessin est déjà lié à une autre identité. Les originaux restent conservés.');
 const boardIdentity={...scope,type:'whiteboard' as const,documentId:noteBoardId(noteId)},rawBoard=await getDraft(boardIdentity);check(current);
 const board=await readOwnedLegacyNotebookBoard(noteId,scope,current);check(current);
 if(rawBoard&&!board)throw Error('Cet ancien dessin ne possède pas une identité prouvée pour cette note. Ses originaux restent conservés.');
 const metadata=await getDraft({...scope,type:'notesMarkdown',documentId:noteId});check(current);
 if(metadata?.syncState==='conflict'||metadata&&record(metadata.content)&&typeof metadata.content.id==='string'&&metadata.content.id!==noteId)throw Error('Les métadonnées reçues doivent être départagées avant de publier le texte de cette note.');
 const receiptRow=await getSnapshot(paperLegacyReceiptKey(scope,noteId));check(current);
 return {paper,board,metadata,ownerRow,receiptRow,deletionRow,receipt:receiptValue(receiptRow,scope,noteId)};
}
async function migrationBaseline(scope:PaperLegacyScope,noteId:string,current:()=>boolean){
 const keys=[...new Set([notebookDocumentId(noteId),legacyNotebookDocumentId(noteId)])].map(documentId=>`paper-migration|${draftKey({...scope,type:'whiteboard',documentId})}`);
 const checks:{key:string;expected:Snapshot|undefined}[]=[];
 for(const key of keys){const row=await getSnapshot(key);check(current);checks.push({key,expected:row});if(!row)continue;const value=row.value;
  if(row.accountId!==scope.accountId||row.spaceId!==scope.spaceId||!record(value)||typeof value.markdown!=='string')continue;
  const images={imageBindings:Array.isArray(value.imageBindings)?value.imageBindings as LegacyImageBinding[]:[],imageReceiptKeys:Array.isArray(value.imageReceiptKeys)?value.imageReceiptKeys as string[]:[]};
  if(value.legacy===null)return {baseline:{markdown:value.markdown,board:null} as PaperLegacyObservation,known:true,checks,...images};
  if(record(value.legacy)&&value.legacy.accountId===scope.accountId&&value.legacy.spaceId===scope.spaceId&&value.legacy.type==='whiteboard'&&value.legacy.documentId===noteBoardId(noteId))return {baseline:{markdown:value.markdown,board:value.legacy.content} as PaperLegacyObservation,known:true,checks,...images};
 }
 return {baseline:{markdown:'',board:null} as PaperLegacyObservation,known:false,checks,imageBindings:[] as LegacyImageBinding[],imageReceiptKeys:[] as string[]};
}
const emptyCommit=(scope:PaperLegacyScope):NotebookTransferCommit=>({target:scope,sources:[scope],drafts:[],blobs:[],snapshots:[],draftChecks:[],blobChecks:[],snapshotChecks:[]});
function sourceChecks(commit:NotebookTransferCommit,scope:PaperLegacyScope,noteId:string,state:Awaited<ReturnType<typeof readState>>){
 commit.draftChecks.push({identity:identity(scope,noteId),expected:state.paper},{identity:{...scope,type:'whiteboard',documentId:noteBoardId(noteId)},expected:state.board},{identity:{...scope,type:'notesMarkdown',documentId:noteId},expected:state.metadata});
 commit.snapshotChecks.push({key:paperLegacyReceiptKey(scope,noteId),expected:state.receiptRow});
 commit.snapshotChecks.push({key:paperLegacyOwnerKey(noteId,scope),expected:state.ownerRow});
 commit.snapshotChecks.push({key:notebookDeletionKey(identity(scope,noteId)),expected:state.deletionRow});
}

/** Re-prepare after a transport ACK, never after a different contribution.
 * Actual storage CAS remains whole-row and each retry gets new native reads.
 * Missing checks are permitted only for absent, regenerated destinations;
 * all existing sources, owner/deletion receipts and original bytes stay exact. */
async function transportRefresh(previous:NotebookTransferCommit,next:NotebookTransferCommit,current:()=>boolean){
 check(current);if(!equal(previous.target,next.target)||!equal(previous.sources,next.sources))return false;
 let advanced=false;
 const beforeDrafts=new Map(previous.draftChecks.map(row=>[draftKey(row.identity),row.expected])),afterDrafts=new Map(next.draftChecks.map(row=>[draftKey(row.identity),row.expected]));
 for(const key of new Set([...beforeDrafts.keys(),...afterDrafts.keys()])){
  const before=beforeDrafts.get(key),after=afterDrafts.get(key);if(!before||!after){if(before!==after)return false;continue;}
  if(!['local','queued','synced'].includes(before.syncState)||!['local','queued','synced'].includes(after.syncState)||!Number.isSafeInteger(before.baseVersion)||!Number.isSafeInteger(after.baseVersion)||after.baseVersion<before.baseVersion)return false;
  if(before.syncState==='synced'&&after.syncState!=='synced'||before.syncState==='queued'&&after.syncState==='local')return false;
  const {baseVersion:oldBase,syncState:oldStatus,key:_oldKey,...oldStable}=before as Draft&{key?:string},{baseVersion:newBase,syncState:newStatus,key:_newKey,...newStable}=after as Draft&{key?:string};
  if(!equal(oldStable,newStable))return false;advanced||=oldBase!==newBase||oldStatus!==newStatus;
 }
 const snapshots=new Map(next.snapshotChecks.map(row=>[row.key,row.expected]));
 for(const row of previous.snapshotChecks){if(!snapshots.has(row.key)){if(row.expected!==undefined)return false;continue;}if(JSON.stringify(row.expected)!==JSON.stringify(snapshots.get(row.key)))return false;}
 const oldSnapshots=new Set(previous.snapshotChecks.map(row=>row.key));if(next.snapshotChecks.some(row=>!oldSnapshots.has(row.key)&&row.expected!==undefined))return false;
 const fileKey=(value:Pick<LocalBlob,'accountId'|'spaceId'|'id'>)=>JSON.stringify([value.accountId,value.spaceId,value.id]),beforeFiles=new Map(previous.blobChecks.map(row=>[fileKey(row.identity),row.expected])),afterFiles=new Map(next.blobChecks.map(row=>[fileKey(row.identity),row.expected]));
 for(const key of new Set([...beforeFiles.keys(),...afterFiles.keys()])){
  const before=beforeFiles.get(key),after=afterFiles.get(key);if(!before||!after){if(before!==after)return false;continue;}
  if(!equal({...before,blob:undefined},{...after,blob:undefined}))return false;
  const oldSHA=await localBlobDigest(before.blob);check(current);const newSHA=await localBlobDigest(after.blob);check(current);if(oldSHA!==newSHA)return false;
 }
 return advanced;
}
/** Refuse a changed contribution before repeating any private image download.
 * The complete preflight still runs afterwards and checks its own fresh CAS. */
async function rereadLegacyChecks(previous:NotebookTransferCommit,current:()=>boolean):Promise<NotebookTransferCommit>{
 check(current);
 const draftChecks=await Promise.all(previous.draftChecks.map(async row=>{check(current);const expected=await getDraft(row.identity);check(current);return {...row,expected};}));
 const snapshotChecks=await Promise.all(previous.snapshotChecks.map(async row=>{check(current);const expected=await getSnapshot(row.key);check(current);return {...row,expected};}));
 const catalogs=new Map<string,Awaited<ReturnType<typeof listLocalBlobs>>>();
 for(const row of previous.blobChecks){const key=JSON.stringify([row.identity.accountId,row.identity.spaceId]);if(!catalogs.has(key)){check(current);const files=await listLocalBlobs(row.identity.accountId,row.identity.spaceId);check(current);catalogs.set(key,files);}}
 const blobChecks=previous.blobChecks.map(row=>({...row,expected:catalogs.get(JSON.stringify([row.identity.accountId,row.identity.spaceId]))?.find(file=>file.id===row.identity.id)}));
 check(current);return {...previous,draftChecks,snapshotChecks,blobChecks};
}
async function commitFreshLegacy<Prepared extends {commit:NotebookTransferCommit}>(prepare:()=>Promise<Prepared>,current:()=>boolean):Promise<Prepared>{
 let rejected:NotebookTransferCommit|undefined,last:NotebookTransferChangedError|undefined;
 for(let attempt=0;attempt<3;attempt++){
  check(current);if(rejected&&!await transportRefresh(rejected,await rereadLegacyChecks(rejected,current),current))throw last!;
  const prepared=await prepare();check(current);
  if(rejected&&!await transportRefresh(rejected,prepared.commit,current))throw last!;
  try{await commitNotebookTransfer(prepared.commit,current);check(current);return prepared;}
  catch(error){if(!(error instanceof NotebookTransferChangedError)||attempt===2)throw error;check(current);rejected=prepared.commit;last=error;}
 }
 throw last??Error('La réconciliation attend une source stable.');
}

const bindingUnion=(...groups:readonly LegacyImageBinding[][]):LegacyImageBinding[]=>{const values=new Map<string,LegacyImageBinding>();for(const group of groups)for(const binding of group)values.set(binding.rawURL,binding);return [...values.values()];};
async function readImageBindings(scope:PaperLegacyScope,noteId:string,keys:readonly string[],bindings:readonly LegacyImageBinding[],current:()=>boolean){
 const checks:NotebookTransferCommit['snapshotChecks']=[],proved:LegacyImageBinding[]=[];
 for(const key of new Set(keys)){if(typeof key!=='string'||!key.startsWith(`paper-legacy-images|${draftKey(identity(scope,noteId))}|`))throw Error('Le reçu d’image appartient à un autre carnet.');const row=await getSnapshot(key);check(current);const value=row?.value;
  if(!row||row.accountId!==scope.accountId||row.spaceId!==scope.spaceId||!record(value)||value.schema!==1||value.kind!=='paper-legacy-image-assets'||value.noteId!==noteId||value.documentId!==notebookDocumentId(noteId)||!Array.isArray(value.mappings))throw Error('Le reçu de récupération des images est absent ou incompatible.');checks.push({key,expected:row});proved.push(...value.mappings as LegacyImageBinding[]);
 }
 for(const binding of bindings){const ref=record(binding)&&typeof binding.canonicalURL==='string'?parsePhotoReference(binding.canonicalURL):null;if(!ref||ref.documentId!==notebookDocumentId(noteId)||ref.id!==binding.assetId||typeof binding.rawURL!=='string'||typeof binding.sha256!=='string'||!/^[a-f0-9]{64}$/.test(binding.sha256)||!record(binding.source)||!['data','local'].includes(String(binding.source.kind))||!proved.some(value=>equal(value,binding)))throw Error('Une référence d’image ne possède pas son reçu prouvé.');}
 return {bindings:[...bindings],checks};
}
function planningBoard(board:unknown,noteId:string,bindings:readonly LegacyImageBinding[],assets:PaperDocument['assets']):unknown {
 if(!record(board)||!Array.isArray(board.photos))return board;
 const ownTags=new Set([noteId,noteBoardId(noteId),notebookDocumentId(noteId),legacyNotebookDocumentId(noteId),`paper-v3-${noteId}`]);
 return {...board,photos:board.photos.map(photo=>{if(!record(photo)||typeof photo.id!=='string')return photo;const binding=bindings.find(value=>value.source.kind==='local'&&value.source.noteId===noteId&&!!value.source.documentId&&ownTags.has(value.source.documentId)&&value.source.assetId===photo.id);if(!binding)return photo;
  const asset=assets.find(value=>value.id===binding.assetId),{serverId,...raw}=photo;return {...raw,id:binding.assetId,...(asset?{name:asset.name,mediaType:asset.mediaType,size:asset.size,...(asset.serverId?{serverId:asset.serverId}:{})}:{})};})};
}
function mergeCommitChecks(commit:NotebookTransferCommit,extra:Pick<NotebookTransferCommit,'draftChecks'|'blobChecks'|'snapshotChecks'|'blobs'|'snapshots'>){
 for(const field of ['draftChecks','blobChecks','snapshotChecks'] as const)for(const checkRow of extra[field]){const key=field==='snapshotChecks'?(checkRow as NotebookTransferCommit['snapshotChecks'][number]).key:field==='draftChecks'?draftKey((checkRow as NotebookTransferCommit['draftChecks'][number]).identity):`${(checkRow as NotebookTransferCommit['blobChecks'][number]).identity.accountId}|${(checkRow as NotebookTransferCommit['blobChecks'][number]).identity.spaceId}|${(checkRow as NotebookTransferCommit['blobChecks'][number]).identity.id}`;
  const existing=commit[field].find(row=>field==='snapshotChecks'?(row as NotebookTransferCommit['snapshotChecks'][number]).key===key:field==='draftChecks'?draftKey((row as NotebookTransferCommit['draftChecks'][number]).identity)===key:`${(row as NotebookTransferCommit['blobChecks'][number]).identity.accountId}|${(row as NotebookTransferCommit['blobChecks'][number]).identity.spaceId}|${(row as NotebookTransferCommit['blobChecks'][number]).identity.id}`===key);
  if(existing&&!equal(existing.expected,checkRow.expected))throw Error('Une source a changé pendant la préparation des images.');if(!existing)(commit[field] as unknown[]).push(checkRow);
 }
 for(const row of extra.blobs){const existing=commit.blobs.find(value=>value.id===row.id);if(existing&&!equal({...existing,blob:undefined},{...row,blob:undefined}))throw Error('Deux préparations d’image utilisent la même identité.');if(!existing)commit.blobs.push(row);}
 for(const row of extra.snapshots){const existing=commit.snapshots.find(value=>value.key===row.key);if(existing&&!equal(existing,row))throw Error('Deux reçus d’image utilisent la même identité.');if(!existing)commit.snapshots.push(row);}
}

/** No writes: optional private downloads stay in memory until the checked graph/file commit. */
export async function preflightPaperLegacy(input:PaperLegacyBridgeInput):Promise<PaperLegacyPreflight>{
 const {noteId,current}=input,scope=ownedScope(input.scope);if(typeof input.incomingMarkdown!=='string')throw Error('Le texte reçu est incompatible.');
 const state=await readState(scope,noteId,current);check(current);
 if(input.metadataAuthority==='indexeddb'&&state.metadata&&metadataMarkdown(state.metadata)!==input.incomingMarkdown)throw Error('Le texte de la note a changé avant sa réconciliation.');
 const migration=await migrationBaseline(scope,noteId,current);check(current);
 const board=state.board?.content??state.receipt?.observed.board??migration.baseline.board;
 const echo=state.receipt?.mirror?.desiredMarkdown===input.incomingMarkdown;
 const observed=state.receipt?{...state.receipt.observed,...(echo?{markdown:input.incomingMarkdown}:{})}:undefined;
 const now=input.now??new Date().toISOString();
 const commit=emptyCommit(scope);sourceChecks(commit,scope,noteId,state);commit.snapshotChecks.push(...migration.checks);
 const receiptKeys=[...new Set([...migration.imageReceiptKeys,...(state.receipt?.imageReceiptKeys??[])])],previousBindings=bindingUnion(migration.imageBindings,state.receipt?.imageBindings??[]);
 const catalog=await readImageBindings(scope,noteId,receiptKeys,previousBindings,current);commit.snapshotChecks.push(...catalog.checks);
 const scan=scanLegacyPaperImages(input.incomingMarkdown),needsImages=scan.images.some(image=>image.kind==='photo'||image.kind==='data'||image.kind==='invalid-photo'||image.url.startsWith('data:'));
 const imagePlan=needsImages?await prepareLegacyImageAssets({noteId,markdown:input.incomingMarkdown,scope,current,targetDocument:state.paper.content as PaperDocument,expectedTarget:state.paper,existingBindings:catalog.bindings,bindingReceiptKeys:receiptKeys,downloadOriginal:input.downloadOriginal,now,newId:input.newId}):undefined;check(current);
 if(imagePlan)mergeCommitChecks(commit,imagePlan);
 const incomingBindings=bindingUnion(catalog.bindings,imagePlan?.mappings??[]),historicalBindings=bindingUnion(imagePlan?.mappings??[],catalog.bindings);
 const rawCurrent=state.paper.content as PaperDocument,assets=[...rawCurrent.assets];
 for(const asset of imagePlan?.assets??[]){const index=assets.findIndex(value=>value.id===asset.id);if(index<0)assets.push(asset);else if(!equal(assets[index],asset))assets[index]=asset;}
 const normalisedCurrent={...rawCurrent,assets,objects:rawCurrent.objects.map(object=>object.markdown===undefined?object:{...object,markdown:rewriteLegacyImageBindings(object.markdown,historicalBindings)})};
 const normalise=(observation:PaperLegacyObservation,bindings:readonly LegacyImageBinding[]):PaperLegacyObservation=>({markdown:rewriteLegacyImageBindings(observation.markdown,bindings),board:planningBoard(observation.board,noteId,bindings,assets)});
 const incoming={markdown:imagePlan?.markdown??rewriteLegacyImageBindings(input.incomingMarkdown,incomingBindings),board:planningBoard(board,noteId,incomingBindings,assets)},baseline=normalise(migration.baseline,historicalBindings),normalisedObserved=observed?normalise(observed,historicalBindings):undefined;
 let equivalent=false;try{equivalent=paperMarkdown(normalisedCurrent)===incoming.markdown;}catch{/* Reflow must first prove the full reading order of interrupted passages. */}
 const plan=planPaperLegacyReconcile(normalisedCurrent,{...incoming,baseline,baselineKnown:migration.known,observed:normalisedObserved,currentMarkdownEquivalent:equivalent,now,newId:input.newId});
 let preparedDocument=plan.document;
 const changed=!equal({pages:rawCurrent.pages,objects:rawCurrent.objects,assets:rawCurrent.assets,audio:rawCurrent.audio,study:rawCurrent.study},{pages:preparedDocument.pages,objects:preparedDocument.objects,assets:preparedDocument.assets,audio:preparedDocument.audio,study:preparedDocument.study});
 if(changed&&preparedDocument.revision===rawCurrent.revision)preparedDocument={...preparedDocument,revision:rawCurrent.revision+1,updatedAt:now};
 const local=await listLocalBlobs(scope.accountId,scope.spaceId);check(current);
 const prepared=new Map<string,LocalBlob>();
 for(const file of input.preparedFiles??[]){if(file.accountId!==scope.accountId||file.spaceId!==scope.spaceId)throw Error('Un fichier appartient à un autre compte ou à une autre année.');if(prepared.has(file.id))throw Error('Deux fichiers préparés utilisent la même identité.');prepared.set(file.id,file);}
 for(const file of imagePlan?.blobs??[]){if(prepared.has(file.id))throw Error('Une image reçue utilise déjà l’identité d’un autre original.');prepared.set(file.id,file);}
 const mappings=legacyPaperPhotoIdentities(noteId,board),checkedFiles=new Set<string>();
 const ownedFileDocuments=new Set([noteId,noteBoardId(noteId),notebookDocumentId(noteId),legacyNotebookDocumentId(noteId),`paper-v3-${noteId}`]);
 const proveFile=(file:LocalBlob,asset:{id:string;serverId?:string})=>{
  const alreadyOwned=(state.paper.content as PaperDocument).assets.some(old=>old.id===asset.id);
  const explicit=mappings.some(mapping=>mapping.assetId===asset.id&&(mapping.sourceId===file.id||mapping.assetId===file.id));
  if(!alreadyOwned&&(file.documentId?!ownedFileDocuments.has(file.documentId):!explicit))throw Error('Un fichier local ne possède pas une référence prouvée dans cette note. Son original reste conservé.');
  if(!alreadyOwned&&!file.documentId&&file.removedFromNote)throw Error('Un fichier conservé sans note propriétaire ne peut pas être réactivé automatiquement. Son original reste conservé.');
  if(asset.serverId&&file.serverId!==asset.serverId)throw Error('Les octets locaux ne correspondent pas à la version serveur reçue. Son original doit être retrouvé avant de continuer.');
 };
 const checkFile=(id:string,file:LocalBlob|undefined)=>{if(!checkedFiles.has(id)){checkedFiles.add(id);commit.blobChecks.push({identity:{...scope,id},expected:file});}};
 for(const asset of preparedDocument.assets){
  const existing=local.find(file=>file.id===asset.id);let candidate=prepared.get(asset.id);checkFile(asset.id,existing);
  if(existing)proveFile(existing,asset);
  if(!existing&&!candidate){const mapping=mappings.find(row=>row.assetId===asset.id),original=mapping&&local.find(file=>file.id===mapping.sourceId);
   if(mapping&&original){const variants=new Set(mappings.filter(row=>row.sourceId===mapping.sourceId).map(row=>row.assetId));if(variants.size>1&&!original.serverId)throw Error('Un ancien fichier possède plusieurs versions impossibles à distinguer localement. Ses originaux restent conservés.');
    if(!asset.serverId||!original.serverId||asset.serverId===original.serverId){checkFile(original.id,original);candidate={...original,id:asset.id};}
   }
  }
  if(candidate){const sha=await localBlobDigest(candidate.blob);check(current);if(existing){const oldSha=existing.sha256??await localBlobDigest(existing.blob);check(current);if(oldSha!==sha)throw Error(`Le fichier « ${asset.name} » possède déjà un autre original. Aucun fichier n’est remplacé.`);}
   proveFile(candidate,asset);
   if(asset.serverId&&candidate.serverId&&asset.serverId!==candidate.serverId)throw Error('Le fichier préparé ne correspond pas à la photo reçue.');
   if(!existing&&!commit.blobs.some(file=>file.id===candidate.id))commit.blobs.push({id:candidate.id,...scope,blob:candidate.blob,name:candidate.name,createdAt:candidate.createdAt,status:candidate.status,...(candidate.serverId?{serverId:candidate.serverId}:{}),documentId:identity(scope,noteId).documentId,sha256:sha,revision:1,removedFromNote:false});
  }else if(!existing&&!asset.serverId)throw Error(`Le fichier « ${asset.name} » doit être retrouvé avant la réconciliation. La note reste conservée.`);
  const bytes=existing?.blob??candidate?.blob;
  if(bytes&&!(state.paper.content as PaperDocument).assets.some(old=>old.id===asset.id))preparedDocument={...preparedDocument,assets:preparedDocument.assets.map(row=>row.id===asset.id?{...row,size:bytes.size,mediaType:bytes.type||row.mediaType}:row)};
 }
 const content=changed?amendPaperCollaboration(state.paper.content as PaperDocument,preparedDocument):state.paper.content as PaperDocument;
 const draft=changed?{...state.paper,content,updatedAt:Date.now(),syncState:'local' as const}:state.paper;
 const metadata=state.metadata&&state.metadata.paperDependency!==draft.documentId?{...state.metadata,paperDependency:draft.documentId,syncState:'local' as const}:state.metadata;
 if(metadata&&metadata!==state.metadata)commit.drafts.push(metadata);
 const nextReceiptKeys=[...new Set([...receiptKeys,...(imagePlan?[imagePlan.receiptRow.key]:[])])];
 const proposedReceipt:PaperLegacyBridgeReceipt={schema:1,kind:'paper-legacy-observation',noteId,documentId:identity(scope,noteId).documentId,observed:{markdown:input.incomingMarkdown,board:structuredClone(board)},baselineKnown:!!state.receipt||migration.known,paperRevision:content.revision,observedAt:now,sourceMetadata:metadata??null,sourceBoard:state.board??null,...(state.receipt?.mirror?{mirror:state.receipt.mirror}:{}),...(nextReceiptKeys.length?{imageBindings:incomingBindings,imageReceiptKeys:nextReceiptKeys}:{})};
 // Reopening or resizing a read view must not turn an identical observation
 // into a storage write solely to refresh its date. Keep the original row,
 // while retaining every source/deletion/receipt CAS in this no-op commit.
 const unchangedReceipt=!!state.receiptRow&&!!state.receipt&&equal({...state.receipt,observedAt:now},proposedReceipt);
 const receipt=unchangedReceipt?state.receipt!:proposedReceipt;
 const receiptRow:Snapshot=unchangedReceipt?state.receiptRow!:{key:paperLegacyReceiptKey(scope,noteId),...scope,value:receipt};
 if(!unchangedReceipt)commit.snapshots.push(receiptRow);
 if(state.board&&!state.ownerRow&&!commit.snapshots.some(row=>row.key===paperLegacyOwnerKey(noteId,scope)))commit.snapshots.push({key:paperLegacyOwnerKey(noteId,scope),...scope,value:{schema:1,noteId,documentId:draft.documentId,boardId:noteBoardId(noteId),claimedAt:now}});
 if(changed)commit.drafts.push(draft);
 if(changed||!state.receipt||!equal(state.receipt.observed,receipt.observed)){
  const recovery:Snapshot={key:`paper-legacy-recovery|${draftKey(identity(scope,noteId))}|${crypto.randomUUID()}`,...scope,value:{schema:1,noteId,at:now,beforePaper:state.paper,incoming:{markdown:input.incomingMarkdown,board:structuredClone(board)},sourceMetadata:state.metadata??null,sourceBoard:state.board??null,baseline:migration.known?migration.baseline:null,previousReceipt:state.receiptRow??null,fileIds:content.assets.map(asset=>asset.id)}};
  commit.snapshots.push(recovery);commit.snapshotChecks.push({key:recovery.key,expected:undefined});
 }
 check(current);return {noteId,scope,expectedPaper:state.paper,draft,receipt,receiptRow,commit,changed,recovered:plan.recovered,notices:[...plan.notices,...(imagePlan?.notices??[])]};
}
export async function commitPaperLegacyPreflight(plan:PaperLegacyPreflight,current:()=>boolean){check(current);await commitNotebookTransfer(plan.commit,current);check(current);return {draft:plan.draft,receipt:plan.receipt,changed:plan.changed,recovered:plan.recovered,notices:plan.notices};}
function legacyPostcondition(commit:NotebookTransferCommit):NotebookTransferCommit{
 const drafts=new Map(commit.drafts.map(row=>[draftKey(row),row])),blobs=new Map(commit.blobs.map(row=>[`${row.accountId}|${row.spaceId}|${row.id}`,row])),snapshots=new Map(commit.snapshots.map(row=>[row.key,row]));
 const proof:NotebookTransferCommit=structuredClone({...commit,drafts:[],blobs:[],snapshots:[],draftChecks:commit.draftChecks.map(row=>({...row,expected:drafts.get(draftKey(row.identity))??row.expected})),blobChecks:commit.blobChecks.map(row=>({...row,expected:blobs.get(`${row.identity.accountId}|${row.identity.spaceId}|${row.identity.id}`)??row.expected})),snapshotChecks:commit.snapshotChecks.map(row=>({...row,expected:snapshots.get(row.key)??row.expected}))});
 // Detached expected rows cannot be changed by a caller holding the adopted
 // document. Freeze the JSON containers; original Blob values are immutable.
 const freeze=(value:unknown):void=>{if(value&&typeof value==='object'&&(Array.isArray(value)||Object.getPrototypeOf(value)===Object.prototype)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}};freeze(proof);return proof;
}
export async function reconcilePaperLegacy(input:PaperLegacyBridgeInput){
 const captured={...input,scope:ownedScope(input.scope),now:input.now??new Date().toISOString()};
 const plan=captured.retryTransport===false?await preflightPaperLegacy(captured):await commitFreshLegacy(()=>preflightPaperLegacy(captured),captured.current);
 if(captured.retryTransport===false){check(captured.current);await commitNotebookTransfer(plan.commit,captured.current);check(captured.current);}
 return {draft:plan.draft,receipt:plan.receipt,changed:plan.changed,recovered:plan.recovered,notices:plan.notices,...(captured.capturePostcondition&&notebookDocumentId(captured.noteId)===legacyNotebookDocumentId(captured.noteId)&&!plan.commit.blobChecks.length&&!plan.commit.blobs.length?{postcondition:legacyPostcondition(plan.commit)}:{})};
}

/** Persist intent before the native conditional metadata setter runs. */
export async function stagePaperLegacyMirror(input:{noteId:string;scope:PaperLegacyScope;expectedMarkdown:string;desiredMarkdown:string;current:()=>boolean;metadataAuthority?:'external'|'indexeddb';now?:string}):Promise<PaperLegacyMirrorTicket>{
 const captured={...input,scope:ownedScope(input.scope),now:input.now??new Date().toISOString()}, {noteId,current,scope}=captured;
 const prepared=await commitFreshLegacy(async()=>{
 const state=await readState(scope,noteId,current);check(current);
 if(!state.receipt||state.receipt.observed.markdown!==captured.expectedMarkdown)throw Error('Les apports précédents doivent être conservés avant de publier le miroir.');
 const observedBoard=state.board?.content??state.receipt.observed.board;if(!equal(observedBoard,state.receipt.observed.board))throw Error('Un nouveau dessin doit être réconcilié avant de publier le texte.');
 if(captured.metadataAuthority==='indexeddb'&&state.metadata&&metadataMarkdown(state.metadata)!==captured.expectedMarkdown)throw Error('Les métadonnées ont changé avant la publication du miroir.');
 if(paperMarkdown(state.paper.content as PaperDocument)!==captured.desiredMarkdown)throw Error('Le texte à publier ne correspond plus aux pages conservées.');
 const previous=state.receipt.mirror,mirror:PaperLegacyMirror=previous?.status==='staged'&&previous.expectedMarkdown===captured.expectedMarkdown&&previous.desiredMarkdown===captured.desiredMarkdown&&previous.paperRevision===(state.paper.content as PaperDocument).revision?previous:{id:crypto.randomUUID(),status:'staged',expectedMarkdown:captured.expectedMarkdown,desiredMarkdown:captured.desiredMarkdown,paperRevision:(state.paper.content as PaperDocument).revision,stagedAt:captured.now};
 const receipt={...state.receipt,mirror},receiptRow:Snapshot={key:paperLegacyReceiptKey(scope,noteId),...scope,value:receipt},commit=emptyCommit(scope);sourceChecks(commit,scope,noteId,state);commit.snapshots.push(receiptRow);
 const ticket:PaperLegacyMirrorTicket={noteId,scope,paper:state.paper,metadata:state.metadata,board:state.board,receipt,receiptRow,expectedMarkdown:captured.expectedMarkdown,desiredMarkdown:captured.desiredMarkdown};return {commit,ticket};
 },current);return prepared.ticket;
}

/** Complete only after the caller confirms its scoped durable conditional write. */
export async function publishPaperLegacyMirror(ticket:PaperLegacyMirrorTicket,input:{current:()=>boolean;confirmedMarkdown:string;metadataDraft?:Draft;now?:string}){
 const captured={...input,now:input.now??new Date().toISOString()}, {current}=captured;check(current);if(captured.confirmedMarkdown!==ticket.desiredMarkdown)throw Error('Le miroir n’est pas confirmé dans la source courante.');
 const prepared=await commitFreshLegacy(async()=>{
 const state=await readState(ticket.scope,ticket.noteId,current);check(current);
 if(!state.receipt||!equal(state.receiptRow,ticket.receiptRow)||!equal(state.paper.content,ticket.paper.content)||!equal(state.board?.content,ticket.board?.content))throw Error('Le graphe ou ses apports ont changé pendant la publication du miroir.');
 const mirror=state.receipt.mirror;if(!mirror||mirror.status!=='staged'||mirror.id!==ticket.receipt.mirror?.id)throw Error('Cette publication ne possède plus son reçu.');
 const now=captured.now,receipt:PaperLegacyBridgeReceipt={...state.receipt,observed:{...state.receipt.observed,markdown:ticket.desiredMarkdown},mirror:{...mirror,status:'published',publishedAt:now},observedAt:now,sourceBoard:state.board??null},receiptRow:Snapshot={key:paperLegacyReceiptKey(ticket.scope,ticket.noteId),...ticket.scope,value:receipt},commit=emptyCommit(ticket.scope);sourceChecks(commit,ticket.scope,ticket.noteId,state);
 if(captured.metadataDraft){const wanted=captured.metadataDraft;if(wanted.accountId!==ticket.scope.accountId||wanted.spaceId!==ticket.scope.spaceId||wanted.type!=='notesMarkdown'||wanted.documentId!==ticket.noteId||metadataMarkdown(wanted)!==ticket.desiredMarkdown)throw Error('La publication des métadonnées sort du carnet courant.');
  if(!state.metadata||metadataMarkdown(state.metadata)!==ticket.expectedMarkdown&&!equal(state.metadata,wanted))throw Error('Le texte courant a été modifié avant son miroir.');
  const metadata={...state.metadata,content:{...(state.metadata.content as Record<string,unknown>),markdown:ticket.desiredMarkdown,updatedAt:now},updatedAt:Date.now(),syncState:'local' as const,paperDependency:ticket.paper.documentId};commit.drafts.push(metadata);receipt.sourceMetadata=metadata;
 }else if(state.metadata&&!equal(state.metadata,ticket.metadata)){
  // A native metadata update may have its own server receipt. Only its exact new
  // Markdown is an admissible echo; a different user contribution stays untouched.
  if(metadataMarkdown(state.metadata)!==ticket.desiredMarkdown&&metadataMarkdown(state.metadata)!==ticket.expectedMarkdown)throw Error('Un nouveau texte a été reçu pendant la publication du miroir.');receipt.sourceMetadata=state.metadata;
 }
 if(state.metadata&&!commit.drafts.length&&state.metadata.paperDependency!==ticket.paper.documentId){const metadata={...state.metadata,paperDependency:ticket.paper.documentId,syncState:'local' as const};commit.drafts.push(metadata);receipt.sourceMetadata=metadata;}
 commit.snapshots.push(receiptRow);return {commit,receipt,receiptRow,draft:state.paper};
 },current);return {receipt:prepared.receipt,receiptRow:prepared.receiptRow,draft:prepared.draft};
}
