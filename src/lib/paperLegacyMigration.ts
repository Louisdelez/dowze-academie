import {getDraft,getSnapshot,listLocalBlobs,localBlobDigest,commitNotebookTransfer,readNotebookDeletionStatus,notebookDeletionKey,type Draft,type LocalBlob,type Snapshot,type NotebookTransferCommit} from '../../pwa/src/storage.ts';
import {isPaperDocument,migratePaper,legacyPaperPhotoIdentities,notebookDocumentId,type PaperLegacyPhotoIdentity,type PaperDocument} from './notebookDocument.ts';
import {legacyNotebookDocumentId} from './notebookIdentity.ts';
import {noteBoardId,photoReference,parsePhotoReference} from './notebook.ts';
import {readOwnedLegacyNotebookBoard,type NotebookIdentityScope} from './paperIdentity.ts';
import {prepareLegacyImageAssets,rewriteLegacyImageBindings,type LegacyImageAssetPlan,type LegacyImageBinding,type LegacyImageDownloadNeed} from './paperLegacyImageAssets.ts';
import {scanLegacyPaperImages} from './paperLegacyImages.ts';

const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const check=(current:()=>boolean)=>{if(!current())throw Error('Le compte, l’année ou le texte de la note a changé. Les originaux restent conservés.');};
const identity=(noteId:string,scope:NotebookIdentityScope)=>({...scope,type:'whiteboard' as const,documentId:notebookDocumentId(noteId)});
export const paperInitialMigrationKey=(noteId:string,scope:NotebookIdentityScope)=>`paper-migration|${scope.accountId}|${scope.spaceId}|whiteboard|${notebookDocumentId(noteId)}`;
export const paperLegacyOwnerKey=(noteId:string,scope:NotebookIdentityScope)=>`paper-legacy-owner|${scope.accountId}|${scope.spaceId}|whiteboard|${noteBoardId(noteId)}`;
const serverId=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,126}$/.test(value)&&!value.includes('..');
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function validateScope(noteId:string,scope:NotebookIdentityScope,markdown:string){
 if(typeof markdown!=='string'||typeof noteId!=='string'||!noteId||noteId.length>200||!scope||!['accountId','spaceId'].every(key=>typeof scope[key as keyof NotebookIdentityScope]==='string'&&/^[A-Za-z0-9._-]{1,200}$/.test(scope[key as keyof NotebookIdentityScope])))throw Error('L’identité ou le texte du carnet est incompatible.');
}
function validateSource(draft:Draft|undefined,expected:{accountId:string;spaceId:string;type:Draft['type'];documentId:string},noteId:string){
 if(!draft)return;if(draft.accountId!==expected.accountId||draft.spaceId!==expected.spaceId||draft.type!==expected.type||draft.documentId!==expected.documentId||draft.syncState==='conflict'||draft.staged||draft.identityAlias)throw Error('Cette source doit être départagée avant de créer le carnet.');
 if(expected.type==='notesMarkdown'&&(!record(draft.content)||draft.content.id!==noteId))throw Error('Les métadonnées ne prouvent pas l’identité complète de cette note. Aucun contenu n’est remplacé.');
}
export interface PaperInitialMigrationPlan {draft:Draft;commit:NotebookTransferCommit;photoIdentities:PaperLegacyPhotoIdentity[];imageBindings:LegacyImageBinding[];imageReceiptKeys:string[]}
export interface PaperInitialMigrationOptions {downloadOriginal?:(need:LegacyImageDownloadNeed)=>Promise<Blob>}
const draftState=(value:Draft|undefined)=>JSON.stringify(value&&{...value,key:undefined});
const blobState=(value:LocalBlob|undefined)=>JSON.stringify(value&&{...value,blob:undefined,key:undefined,size:value.blob.size,mediaType:value.blob.type});
/** Two independent reads of the same source must agree before their CAS plans can be joined. */
function mergeImageChecks(commit:NotebookTransferCommit,plan:LegacyImageAssetPlan){
 for(const incoming of plan.draftChecks){const previous=commit.draftChecks.find(row=>row.identity.accountId===incoming.identity.accountId&&row.identity.spaceId===incoming.identity.spaceId&&row.identity.type===incoming.identity.type&&row.identity.documentId===incoming.identity.documentId);if(previous){if(draftState(previous.expected)!==draftState(incoming.expected))throw Error('La source de la note a changé pendant la récupération de ses images.');}else commit.draftChecks.push(incoming);}
 for(const incoming of plan.blobChecks){const previous=commit.blobChecks.find(row=>row.identity.accountId===incoming.identity.accountId&&row.identity.spaceId===incoming.identity.spaceId&&row.identity.id===incoming.identity.id);if(previous){if(blobState(previous.expected)!==blobState(incoming.expected))throw Error('Un original d’image a changé pendant sa récupération.');}else commit.blobChecks.push(incoming);}
 for(const incoming of plan.snapshotChecks){const previous=commit.snapshotChecks.find(row=>row.key===incoming.key);if(previous){if(!same(previous.expected,incoming.expected))throw Error('Le reçu de propriété d’une image a changé pendant sa récupération.');}else commit.snapshotChecks.push(incoming);}
 for(const incoming of plan.snapshots){const previous=commit.snapshots.find(row=>row.key===incoming.key);if(previous){if(!same(previous,incoming))throw Error('Deux reçus différents désignent la même source. Aucun original n’est remplacé.');}else commit.snapshots.push(incoming);}
 for(const incoming of plan.blobs){if(commit.blobs.some(row=>row.id===incoming.id))throw Error('Deux copies différentes demandent la même identité d’image. Aucun original n’est remplacé.');commit.blobs.push(incoming);}
}
/** Reuse this migration's proved manifest copy instead of creating a second copy of identical inline bytes. A committed image receipt is immutable. */
async function reuseOwnManifestImages(plan:LegacyImageAssetPlan,document:PaperDocument,mappings:PaperLegacyPhotoIdentity[],commit:NotebookTransferCommit,files:LocalBlob[],current:()=>boolean){
 if(!plan.snapshotChecks.some(row=>row.key===plan.receiptRow.key&&row.expected===undefined))return;
 const removedIds=new Set<string>();let changed=false;
 for(const binding of plan.mappings){if(binding.source.kind!=='local'||binding.source.noteId!==document.noteId)continue;
  const matches=mappings.filter(row=>row.sourceId===binding.source.assetId),variants=new Set(matches.map(row=>row.assetId));if(variants.size!==1)continue;
  const asset=document.assets.find(row=>row.id===matches[0].assetId);if(!asset||asset.serverId!==binding.source.serverId||!parsePhotoReference(photoReference(notebookDocumentId(document.noteId),asset.id)))continue;
  const bytes=commit.blobs.find(file=>file.id===asset.id)??files.find(file=>file.id===asset.id&&(!asset.serverId||file.serverId===asset.serverId));
  if(!bytes){
   // The manifest describes a proved remote version, while the old local slot is
   // absent or still holds another version. Its downloaded copy has an isolated
   // identity; the raw manifest and old file remain in the recovery receipts.
   const copy=plan.blobs.find(file=>file.id===binding.assetId),recovered=plan.assets.find(row=>row.id===binding.assetId);
   if(!copy||!recovered||!binding.source.serverId||binding.source.serverId!==asset.serverId)continue;
   const sha256=await localBlobDigest(copy.blob);check(current);if(sha256!==binding.sha256)throw Error('La copie de l’image distante ne correspond plus à ses octets prouvés.');
   const oldId=asset.id;matches[0].assetId=binding.assetId;document.assets=document.assets.filter(row=>row.id!==oldId);document.objects=document.objects.filter(row=>row.kind!=='image'||row.assetId!==oldId);continue;
  }
  const sha256=await localBlobDigest(bytes.blob);check(current);if(sha256!==binding.sha256)throw Error('Les octets de l’image inline diffèrent de son original migré. Aucun fichier n’est remplacé.');
  if(binding.assetId!==asset.id){removedIds.add(binding.assetId);binding.assetId=asset.id;binding.canonicalURL=photoReference(notebookDocumentId(document.noteId),asset.id);changed=true;}
 }
 if(!changed)return;
 const referenced=new Set(plan.mappings.map(binding=>binding.assetId));plan.assets=plan.assets.filter(asset=>!removedIds.has(asset.id)||referenced.has(asset.id));for(const id of referenced){const asset=document.assets.find(row=>row.id===id);if(asset&&!plan.assets.some(row=>row.id===id))plan.assets.push(asset);}
 plan.blobs=plan.blobs.filter(file=>!removedIds.has(file.id)||referenced.has(file.id));
 plan.markdown=rewriteLegacyImageBindings(document.legacy.markdown,plan.mappings);plan.receiptRow={...plan.receiptRow,value:{...plan.receiptRow.value as object,mappings:plan.mappings,rewrittenMarkdown:plan.markdown}};plan.snapshots=plan.snapshots.map(row=>row.key===plan.receiptRow.key?plan.receiptRow:row);
}

/** Prepare owned graph, immutable file associations and recovery receipt without writing anything. */
export async function prepareOwnedPaperNotebookMigration(noteId:string,markdown:string,scope:NotebookIdentityScope,current:()=>boolean,options:PaperInitialMigrationOptions={}):Promise<PaperInitialMigrationPlan>{
 validateScope(noteId,scope,markdown);scope={accountId:scope.accountId,spaceId:scope.spaceId};check(current);const canonical=identity(noteId,scope),deletion=await readNotebookDeletionStatus(noteId,scope,current);check(current);
 if(deletion)throw Error('Ce carnet a été supprimé sur le serveur. Ses sources restent conservées, sans recréation automatique.');
 const target=await getDraft(canonical);check(current);
 if(target)throw Error('Un carnet existe déjà pour cette note. Sa version actuelle reste conservée.');
 const historicIdentity={...canonical,documentId:legacyNotebookDocumentId(noteId)},historic=historicIdentity.documentId===canonical.documentId?undefined:await getDraft(historicIdentity);check(current);
 if(historic&&(!isPaperDocument(historic.content)||historic.content.noteId===noteId))throw Error('La version historique de ce carnet doit être reprise avant toute migration initiale.');
 const boardIdentity={...scope,type:'whiteboard' as const,documentId:noteBoardId(noteId)},rawBoard=await getDraft(boardIdentity);check(current);
 const ownedBoard=await readOwnedLegacyNotebookBoard(noteId,scope,current);check(current);
 if(rawBoard&&!ownedBoard||!same(rawBoard,ownedBoard))throw Error('L’ancien dessin ne possède plus une identité prouvée pour cette note. Ses originaux restent conservés.');
 validateSource(ownedBoard,boardIdentity,noteId);
 const metadataIdentity={...scope,type:'notesMarkdown' as const,documentId:noteId},metadata=await getDraft(metadataIdentity);check(current);validateSource(metadata,metadataIdentity,noteId);
 const migrationKey=paperInitialMigrationKey(noteId,scope),previousMigration=await getSnapshot(migrationKey);check(current);
 if(previousMigration)throw Error('Un reçu de migration existe déjà sans carnet courant. Il doit être récupéré avant de continuer.');
 const ownerKey=paperLegacyOwnerKey(noteId,scope),owner=ownedBoard?await getSnapshot(ownerKey):undefined;check(current);
 if(owner&&(owner.accountId!==scope.accountId||owner.spaceId!==scope.spaceId||!record(owner.value)||owner.value.schema!==1||owner.value.noteId!==noteId||owner.value.documentId!==canonical.documentId||owner.value.boardId!==boardIdentity.documentId||!Number.isFinite(Date.parse(String(owner.value.claimedAt)))))throw Error('Cet ancien dessin est déjà associé à une autre note. Aucun contenu n’est emprunté.');
 const now=new Date().toISOString(),document=migratePaper(noteId,markdown,ownedBoard?.content,now);if(!isPaperDocument(document))throw Error('L’ancienne note ne peut pas encore être migrée. Son original reste conservé.');
 const mappings=legacyPaperPhotoIdentities(noteId,ownedBoard?.content),files=await listLocalBlobs(scope.accountId,scope.spaceId);check(current);
 const commit:NotebookTransferCommit={target:scope,sources:[scope],drafts:[],blobs:[],snapshots:[],draftChecks:[{identity:canonical,expected:undefined},{identity:boardIdentity,expected:rawBoard},{identity:metadataIdentity,expected:metadata}],blobChecks:[],snapshotChecks:[{key:migrationKey,expected:undefined},{key:notebookDeletionKey(canonical),expected:undefined}]};
 if(historicIdentity.documentId!==canonical.documentId)commit.draftChecks.push({identity:historicIdentity,expected:historic});
 if(ownedBoard)commit.snapshotChecks.push({key:ownerKey,expected:owner});
 const scanned=scanLegacyPaperImages(markdown),needsImages=scanned.images.some(image=>image.kind!=='other');
 const ownInlineIds=new Set(scanned.images.flatMap(image=>image.kind==='photo'&&image.photo&&[boardIdentity.documentId,noteId,historicIdentity.documentId,`paper-v3-${noteId}`].includes(image.photo.documentId)?[image.photo.id]:[]));
 const checkedFiles=new Set<string>(),sourceFiles=new Map<string,LocalBlob>(),allowedTags=new Set([boardIdentity.documentId,canonical.documentId,historicIdentity.documentId,`paper-v3-${noteId}`,noteId]);
 const taggedSources=new Map<string,Draft|undefined>([[canonical.documentId,target],[boardIdentity.documentId,rawBoard],[historicIdentity.documentId,historic]]);
 const fileCheck=(id:string,file:LocalBlob|undefined)=>{if(!checkedFiles.has(id)){checkedFiles.add(id);commit.blobChecks.push({identity:{...scope,id},expected:file});}};
 const ownedFile=async(file:LocalBlob,mapping:PaperLegacyPhotoIdentity)=>{
  if(file.accountId!==scope.accountId||file.spaceId!==scope.spaceId||file.documentId&&!allowedTags.has(file.documentId))throw Error('Un fichier est associé à un autre carnet. Son original reste conservé.');
  if(file.documentId){
   if(!taggedSources.has(file.documentId)){const tagIdentity={...scope,type:'whiteboard' as const,documentId:file.documentId},tagged=await getDraft(tagIdentity);check(current);taggedSources.set(file.documentId,tagged);commit.draftChecks.push({identity:tagIdentity,expected:tagged});}
   const tagged=taggedSources.get(file.documentId);if(tagged&&(tagged.staged||tagged.syncState==='conflict'||record(tagged.content)&&tagged.content.notebookSchema===3&&(!isPaperDocument(tagged.content)||tagged.content.noteId!==noteId)))throw Error('Le carnet associé à cet original ne possède pas le même propriétaire complet. Aucun fichier n’est emprunté.');
  }
  const variants=new Set(mappings.filter(row=>row.sourceId===mapping.sourceId).map(row=>row.assetId));
  if(!file.documentId&&(variants.size!==1||file.removedFromNote))throw Error('L’identité de cet ancien fichier est ambiguë. Ses originaux restent conservés.');
 };
 for(const asset of document.assets){
  const mapping=mappings.find(row=>row.assetId===asset.id)!;const original=files.find(file=>file.id===mapping.sourceId),destination=files.find(file=>file.id===asset.id);fileCheck(mapping.sourceId,original);fileCheck(asset.id,destination);
  if(asset.serverId&&!serverId(asset.serverId))throw Error('L’identité serveur d’une photo est incompatible. Son original reste conservé.');
  const canRecoverVersion=(file:LocalBlob)=>!!options.downloadOriginal&&ownInlineIds.has(mapping.sourceId)&&!!asset.serverId&&file.documentId===boardIdentity.documentId;
  let usableDestination=destination;
  if(destination){await ownedFile(destination,mapping);check(current);sourceFiles.set(destination.id,destination);if(asset.serverId&&destination.serverId!==asset.serverId){if(!canRecoverVersion(destination))throw Error('Le fichier local ne correspond pas à l’original serveur de cette photo. Aucun fichier n’est remplacé.');usableDestination=undefined;}}
  let source=original;
  if(source){await ownedFile(source,mapping);check(current);
   sourceFiles.set(source.id,source);
   const variants=new Set(mappings.filter(row=>row.sourceId===mapping.sourceId).map(row=>row.assetId));
   if(variants.size>1&&!source.serverId)throw Error('Plusieurs originaux utilisent la même identité locale. Ils doivent être départagés avant la migration.');
   if(asset.serverId&&source.serverId!==asset.serverId){if((mapping.sourceId===asset.id||!source.serverId)&&!canRecoverVersion(source))throw Error('Les octets locaux ne prouvent pas l’identité de la photo serveur.');source=undefined;}
  }
  if(usableDestination&&source&&usableDestination.id!==source.id){const originalSha=await localBlobDigest(source.blob);check(current);const targetSha=await localBlobDigest(usableDestination.blob);check(current);if(originalSha!==targetSha)throw Error('Une identité remappée possède déjà un autre fichier. Aucun original n’est remplacé.');}
  const bytes=usableDestination??source;
  if(!bytes){if(!asset.serverId)throw Error(`Le fichier « ${asset.name} » doit être retrouvé avant d’activer cette note. Les sources restent conservées.`);continue;}
  if(source)sourceFiles.set(source.id,source);if(destination)sourceFiles.set(destination.id,destination);
  if(bytes.serverId&&!serverId(bytes.serverId))throw Error('L’identité serveur du fichier local est incompatible.');
  const sha256=await localBlobDigest(bytes.blob);check(current);sourceFiles.set(bytes.id,bytes);
  const knownServer=asset.serverId??bytes.serverId;asset.size=bytes.blob.size;asset.mediaType=bytes.blob.type||asset.mediaType;if(knownServer)asset.serverId=knownServer;
  // A proved legacy file can be activated in the same transaction as its graph.
  // The original bytes are immutable; its previous association remains in the receipt.
  if(!usableDestination||usableDestination.documentId!==canonical.documentId||usableDestination.removedFromNote)commit.blobs.push({...bytes,id:asset.id,documentId:canonical.documentId,removedFromNote:false,sha256,revision:(usableDestination?.revision??0)+1,status:knownServer?'uploaded':'pending',...(knownServer?{serverId:knownServer}:{serverId:undefined})});
 }
 const imagePlan=needsImages?await prepareLegacyImageAssets({noteId,markdown,scope,current,targetDocument:document,expectedTarget:undefined,downloadOriginal:options.downloadOriginal,now}):undefined;check(current);
 if(imagePlan){
  await reuseOwnManifestImages(imagePlan,document,mappings,commit,files,current);check(current);
  mergeImageChecks(commit,imagePlan);
  for(const asset of imagePlan.assets){const previous=document.assets.find(row=>row.id===asset.id);if(previous){if(!same(previous,asset))throw Error('Cette identité d’image désigne deux originaux différents.');}else document.assets.push(asset);}
  const linkedAssets=new Set(imagePlan.mappings.flatMap(binding=>binding.source.kind==='local'&&binding.source.noteId===noteId?mappings.filter(row=>row.sourceId===binding.source.assetId&&(row.serverId===undefined||row.serverId===binding.source.serverId)).map(row=>row.assetId):[]));
  // Only the proved inline contribution replaces its migrated floating representation. Every original asset, source file and raw manifest remains available.
  document.objects=document.objects.filter(object=>object.kind!=='image'||!linkedAssets.has(object.assetId!));
  const root=document.objects.find(object=>object.kind==='text'&&object.id===`text-${boardIdentity.documentId}`);if(!root)throw Error('Le texte d’origine de la note doit être retrouvé avant sa migration.');root.markdown=imagePlan.markdown;
 }
 if(!isPaperDocument(document))throw Error('Les fichiers ne permettent pas encore une migration valide. Les sources restent conservées.');
 const draft:Draft={...canonical,title:metadata?.title||'Carnet',content:document,baseVersion:0,updatedAt:Date.now(),syncState:'local'};commit.drafts.push(draft);
 if(metadata)commit.drafts.push({...metadata,paperDependency:canonical.documentId,syncState:'local',updatedAt:Date.now()});
 const imageBindings=imagePlan?.mappings??[],imageReceiptKeys=imagePlan?[imagePlan.receiptRow.key]:[];
 const receipt:Snapshot={key:migrationKey,...scope,value:{schema:1,kind:'paper-legacy-initial-migration',noteId,documentId:canonical.documentId,markdown,legacy:ownedBoard??null,sourceMetadata:metadata??null,migratedAt:now,photoIdentities:mappings,imageBindings,imageReceiptKeys,files:[...sourceFiles.values()].map(({blob,...file})=>({...file,size:blob.size,mediaType:blob.type})),canonical:document}};commit.snapshots.push(receipt);
 if(ownedBoard&&!owner&&!commit.snapshots.some(row=>row.key===ownerKey))commit.snapshots.push({key:ownerKey,...scope,value:{schema:1,noteId,documentId:canonical.documentId,boardId:boardIdentity.documentId,claimedAt:now}});
 check(current);return {draft,commit,photoIdentities:mappings,imageBindings,imageReceiptKeys};
}

async function ownPreviousMigration(noteId:string,markdown:string,scope:NotebookIdentityScope,current:()=>boolean):Promise<Draft|undefined>{
 const deletion=await readNotebookDeletionStatus(noteId,scope,current);check(current);if(deletion)throw Error('Ce carnet a été supprimé sur le serveur. Ses sources restent conservées, sans recréation automatique.');
 const stored=await getDraft(identity(noteId,scope));check(current);if(!stored)return;
 const receipt=await getSnapshot(paperInitialMigrationKey(noteId,scope));check(current);const value=receipt?.value;
 if(!isPaperDocument(stored.content)||stored.content.noteId!==noteId||stored.identityAlias||!receipt||receipt.accountId!==scope.accountId||receipt.spaceId!==scope.spaceId||!record(value)||value.schema!==1||value.kind!=='paper-legacy-initial-migration'||value.noteId!==noteId||value.documentId!==stored.documentId||value.markdown!==markdown||!isPaperDocument(value.canonical)||value.canonical.noteId!==noteId)throw Error('Un carnet existe déjà pour cette note. Sa version actuelle n’est pas remplacée.');
 return stored;
}
/** Idempotent for this proved migration, never a replacement for an existing unrelated graph. */
export async function migrateOwnedPaperNotebook(noteId:string,markdown:string,scope:NotebookIdentityScope,current:()=>boolean,options:PaperInitialMigrationOptions={}):Promise<Draft>{
 validateScope(noteId,scope,markdown);scope={accountId:scope.accountId,spaceId:scope.spaceId};check(current);const prior=await ownPreviousMigration(noteId,markdown,scope,current);if(prior)return prior;
 let plan:PaperInitialMigrationPlan;
 try{plan=await prepareOwnedPaperNotebookMigration(noteId,markdown,scope,current,options);check(current);await commitNotebookTransfer(plan.commit,current);}
 catch(error){check(current);const concurrent=await ownPreviousMigration(noteId,markdown,scope,current);if(concurrent)return concurrent;throw error;}
 check(current);const saved=await ownPreviousMigration(noteId,markdown,scope,current);if(!saved)throw Error('La migration doit être reprise ; ses sources restent conservées.');return saved;
}
