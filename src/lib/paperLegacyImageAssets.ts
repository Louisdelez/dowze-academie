import {getDraft,getSnapshot,listDrafts,listLocalBlobs,localBlobDigest,notebookDeletionKey,readNotebookDeletionStatus,type Draft,type DraftKey,type LocalBlob,type Snapshot,type NotebookTransferCommit} from '../../pwa/src/storage.ts';
import {isPaperDocument,type PaperAsset,type PaperDocument} from './notebookDocument.ts';
import {notebookDocumentId,legacyNotebookDocumentId,notebookIdentityDigest} from './notebookIdentity.ts';
import {noteBoardId,photoReference,parsePhotoReference} from './notebook.ts';
import {scanLegacyPaperImages,planLegacyPaperImageRewrite,decodeLegacyRasterDataUrl,validateLegacyRasterBytes} from './paperLegacyImages.ts';

export interface LegacyImageScope {accountId:string;spaceId:string}
export interface LegacyImageBinding {
 rawURL:string;canonicalURL:string;assetId:string;sha256:string;
 source:{kind:'local'|'data';noteId?:string;documentId?:string;assetId?:string;serverId?:string};
}
export interface LegacyImageAssetReceipt {
 schema:1;kind:'paper-legacy-image-assets';noteId:string;documentId:string;
 mode?:'owned-canonical-validation';
 originalMarkdown:string;rewrittenMarkdown:string;fingerprint:string;
 mappings:LegacyImageBinding[];sourceDrafts:Draft[];sourceClaims:Snapshot[];
 bindingReceipts?:{key:string;fingerprint:string;noteId:string;documentId:string}[];
 originalFiles:Omit<LocalBlob,'blob'>[];recoveredAt:string;
 remoteOriginals?: (LegacyImageDownloadNeed&{sha256:string;size:number})[];
}
export interface LegacyImageAssetInput {
 noteId:string;markdown:string;scope:LegacyImageScope;current:()=>boolean;
 /** The graph being prepared may include uncommitted assets; its durable source is checked separately. */
 targetDocument?:PaperDocument;expectedTarget?:Draft;knownNoteIds?:readonly string[];
 existingBindings?:readonly LegacyImageBinding[];bindingReceiptKeys?:readonly string[];
 /** Network reads may return bytes in RAM; only the caller's final transfer commits them. */
 downloadOriginal?:(need:LegacyImageDownloadNeed)=>Promise<Blob>;
 now?:string;newId?:()=>string;
}
export interface LegacyImageAssetPlan {
 markdown:string;assets:PaperAsset[];blobs:LocalBlob[];snapshots:Snapshot[];
 draftChecks:NotebookTransferCommit['draftChecks'];blobChecks:NotebookTransferCommit['blobChecks'];
 snapshotChecks:NotebookTransferCommit['snapshotChecks'];receiptRow:Snapshot;
 mappings:LegacyImageBinding[];notices:string[];
}
export interface LegacyImageDownloadNeed {accountId:string;spaceId:string;noteId:string;documentId:string;assetId:string;serverId?:string;name:string;mediaType:string;size?:number;sha256?:string}
export class LegacyImageRecoveryError extends Error {
 readonly needs:LegacyImageDownloadNeed[];
 constructor(message:string,needs:LegacyImageDownloadNeed[]=[]){super(message);this.name='LegacyImageRecoveryError';this.needs=needs;}
}
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const check=(current:()=>boolean)=>{if(!current())throw Error('Le compte, l’année ou la source de l’image a changé. Les originaux restent conservés.');};
const pair=(scope:LegacyImageScope):LegacyImageScope=>({accountId:scope.accountId,spaceId:scope.spaceId});
const draftKey=(value:DraftKey)=>`${value.accountId}|${value.spaceId}|${value.type??'notesMarkdown'}|${value.documentId}`;
const equalDraft=(a:Draft|undefined,b:Draft|undefined)=>JSON.stringify(a&&{...a,key:undefined})===JSON.stringify(b&&{...b,key:undefined});
const ownerKey=(scope:LegacyImageScope,noteId:string)=>`paper-legacy-owner|${scope.accountId}|${scope.spaceId}|whiteboard|${noteBoardId(noteId)}`;
const tags=(noteId:string)=>new Set([noteId,noteBoardId(noteId),notebookDocumentId(noteId),legacyNotebookDocumentId(noteId),`paper-v3-${noteId}`]);
const fullNoteId=(value:unknown)=>record(value)&&typeof value.id==='string'?value.id:undefined;
const validId=(id:unknown):id is string=>typeof id==='string'&&id.length>0&&id.length<=200&&!/[\u0000-\u001f\u007f]/.test(id);
const safeServerId=(id:unknown):id is string=>typeof id==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,126}$/.test(id)&&!id.includes('..');
const rasterType=(value:string)=>value.toLowerCase()==='image/jpg'?'image/jpeg':value.toLowerCase();
const mediaType=(file:LocalBlob,declared?:unknown)=>file.blob.type.startsWith('image/')?file.blob.type:typeof declared==='string'&&declared.startsWith('image/')?declared:'image/png';
const originalSource=(source:LegacyImageBinding['source'])=>({...source,serverId:undefined});

/** Normalises old observations with committed bindings, without reading files or contacting a service. */
export function rewriteLegacyImageBindings(markdown:string,mappings:readonly LegacyImageBinding[]):string {
 const byURL=new Map<string,string>();
 for(const mapping of mappings){const ref=parsePhotoReference(mapping.canonicalURL);if(!ref||ref.id!==mapping.assetId||!/^[a-f0-9]{64}$/.test(mapping.sha256))throw Error('Une référence d’image récupérée est incompatible.');
  const previous=byURL.get(mapping.rawURL);if(previous&&previous!==mapping.canonicalURL)throw Error('Deux originaux utilisent la même référence d’image. Leur choix reste à départager.');byURL.set(mapping.rawURL,mapping.canonicalURL);}
 const scan=scanLegacyPaperImages(markdown),replacements=new Map<string,string>();
 for(const image of scan.images){const url=byURL.get(image.url);if(url&&url!==image.url&&['photo','data'].includes(image.kind))replacements.set(image.id,url);}
 return planLegacyPaperImageRewrite(scan,replacements).markdown;
}

/** Local, read-only preflight. A caller commits graph, copies, checks and receipt together. */
export async function prepareLegacyImageAssets(input:LegacyImageAssetInput):Promise<LegacyImageAssetPlan> {
 const {noteId,markdown,current}=input,scope=pair(input.scope),canonicalId=notebookDocumentId(noteId);
 if(!validId(noteId)||typeof markdown!=='string'||!['accountId','spaceId'].every(field=>typeof scope[field as keyof LegacyImageScope]==='string'&&/^[A-Za-z0-9._-]{1,200}$/.test(scope[field as keyof LegacyImageScope])))throw Error('L’identité de récupération de l’image est incompatible.');
 const now=input.now??new Date().toISOString();if(!Number.isFinite(Date.parse(now)))throw Error('La date de récupération est incompatible.');check(current);
 const plan:Omit<LegacyImageAssetPlan,'markdown'|'receiptRow'>={assets:[],blobs:[],snapshots:[],draftChecks:[],blobChecks:[],snapshotChecks:[],mappings:[],notices:[]};
 const drafts=new Map<string,Draft|undefined>(),snapshots=new Map<string,Snapshot|undefined>(),files=new Map<string,LocalBlob>(),checkedFiles=new Set<string>();
 const readDraft=async(documentId:string,type:Draft['type']='whiteboard')=>{const identity={...scope,documentId,type},key=draftKey(identity);if(!drafts.has(key)){const row=await getDraft(identity);check(current);drafts.set(key,row);plan.draftChecks.push({identity,expected:row});}return drafts.get(key);};
 const readSnapshot=async(key:string)=>{if(!snapshots.has(key)){const row=await getSnapshot(key);check(current);if(row&&(row.accountId!==scope.accountId||row.spaceId!==scope.spaceId))throw Error('Un reçu d’image appartient à un autre compte ou à une autre année.');snapshots.set(key,row);plan.snapshotChecks.push({key,expected:row});}return snapshots.get(key);};
 const checkFile=(id:string)=>{if(!checkedFiles.has(id)){checkedFiles.add(id);plan.blobChecks.push({identity:{...scope,id},expected:files.get(id)});}};
 const deletion=async(owner:string)=>{const identity={...scope,type:'whiteboard' as const,documentId:notebookDocumentId(owner)};await readSnapshot(notebookDeletionKey(identity));const marker=await readNotebookDeletionStatus(owner,scope,current);check(current);if(marker)throw Error('Cette image appartient à une note supprimée sur le serveur. Ses originaux sont conservés sans réactivation automatique.');};
 await deletion(noteId);
 const target=await readDraft(canonicalId);if(Object.hasOwn(input,'expectedTarget')&&!equalDraft(target,input.expectedTarget))throw Error('Le carnet a changé avant la récupération de ses images.');
 if(target&&(!isPaperDocument(target.content)||target.content.noteId!==noteId||target.identityAlias||target.staged||target.syncState==='conflict'))throw Error('Le carnet doit être départagé avant de récupérer ses images.');
 if(input.targetDocument&&(!isPaperDocument(input.targetDocument)||input.targetDocument.noteId!==noteId))throw Error('Le graphe préparé appartient à une autre note.');
 const graph=input.targetDocument??(target?.content as PaperDocument|undefined),metadata=await readDraft(noteId,'notesMarkdown');
 if(metadata&&(fullNoteId(metadata.content)!==noteId||metadata.staged||metadata.syncState==='conflict'))throw Error('Les métadonnées ne prouvent pas l’identité complète de la note.');
 const rows=await listDrafts(scope.accountId,scope.spaceId);check(current);
 const known=new Set<string>([noteId,...(input.knownNoteIds??[])]);
 for(const row of rows){if(row.type==='notesMarkdown'&&fullNoteId(row.content)===row.documentId)known.add(row.documentId);if(row.type==='whiteboard'&&isPaperDocument(row.content))known.add(row.content.noteId);}
 for(const file of await listLocalBlobs(scope.accountId,scope.spaceId)){if(file.accountId===scope.accountId&&file.spaceId===scope.spaceId)files.set(file.id,file);}check(current);
 const provenBindings:LegacyImageBinding[]=[],bindingReceipts:NonNullable<LegacyImageAssetReceipt['bindingReceipts']>=[];
 for(const key of new Set(input.bindingReceiptKeys??[])){const row=await readSnapshot(key),value=row?.value;if(!key.startsWith(`paper-legacy-images|${scope.accountId}|${scope.spaceId}|whiteboard|${canonicalId}|`)||!record(value)||value.schema!==1||value.kind!=='paper-legacy-image-assets'||value.noteId!==noteId||value.documentId!==canonicalId||typeof value.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(value.fingerprint)||key!==`paper-legacy-images|${scope.accountId}|${scope.spaceId}|whiteboard|${canonicalId}|${value.fingerprint}`||!Array.isArray(value.mappings))throw Error('Un reçu de référence d’image est absent ou incompatible.');
  bindingReceipts.push({key,fingerprint:value.fingerprint,noteId,documentId:canonicalId});
  for(const mapping of value.mappings){if(!record(mapping)||typeof mapping.rawURL!=='string'||typeof mapping.canonicalURL!=='string'||typeof mapping.assetId!=='string'||typeof mapping.sha256!=='string'||!/^[a-f0-9]{64}$/.test(mapping.sha256)||!record(mapping.source)||!['local','data'].includes(String(mapping.source.kind)))throw Error('Une référence d’image conservée est incompatible.');const ref=parsePhotoReference(mapping.canonicalURL);if(!ref||ref.documentId!==canonicalId||ref.id!==mapping.assetId)throw Error('Cette référence d’image appartient à un autre carnet.');provenBindings.push(mapping as unknown as LegacyImageBinding);}
 }
 for(const binding of input.existingBindings??[])if(!provenBindings.some(value=>JSON.stringify(value)===JSON.stringify(binding)))throw Error('Une référence existante ne possède pas de reçu prouvé pour ce carnet.');
 const allocated=new Set([...files.keys(),...(graph?.assets.map(asset=>asset.id)??[])]);
 const allocate=()=>{for(let n=0;n<16;n++){const id=input.newId?.()??crypto.randomUUID();if(parsePhotoReference(photoReference(canonicalId,id))&&!allocated.has(id)){allocated.add(id);return id;}}throw Error('La récupération nécessite une identité de fichier indépendante.');};
 const claim=async(owner:string,required:boolean)=>{
  const key=ownerKey(scope,owner),row=await readSnapshot(key),boardId=noteBoardId(owner);
  if(row){const value=row.value;if(!record(value)||value.schema!==1||!validId(value.noteId)||value.boardId!==boardId||value.documentId!==notebookDocumentId(value.noteId)||!Number.isFinite(Date.parse(String(value.claimedAt))))throw Error('Le propriétaire historique de cette image est incompatible.');
   if(value.noteId!==owner){if(required)throw Error('Ce dessin appartient à une autre identité de note. Aucun fichier n’est emprunté.');return false;}return true;}
  if(required&&!plan.snapshots.some(snapshot=>snapshot.key===key))plan.snapshots.push({key,...scope,value:{schema:1,noteId:owner,documentId:notebookDocumentId(owner),boardId,claimedAt:now}});return true;
 };
 const proof=async(documentId:string)=>{
  const raw=await readDraft(documentId),candidates=[...known].filter(owner=>tags(owner).has(documentId));let owner:string|undefined;
  if(raw&&record(raw.content)&&raw.content.notebookSchema===3&&!isPaperDocument(raw.content))throw Error('Le carnet source de cette image est incomplet ou incompatible. Aucun fichier n’est emprunté.');
  if(raw&&isPaperDocument(raw.content)){
   owner=raw.content.noteId;if(!tags(owner).has(documentId)||raw.staged||raw.syncState==='conflict')throw Error('La version de l’image ne possède pas un propriétaire utilisable.');
   if(candidates.length>1&&owner!==noteId)throw Error('Cette ancienne référence d’image possède plusieurs propriétaires possibles.');
   if(raw.identityAlias){if(raw.identityAlias!==notebookDocumentId(owner))throw Error('L’alias de cette image ne correspond pas à sa note.');const receipt=await readSnapshot(`paper-identity|${scope.accountId}|${scope.spaceId}|whiteboard|${documentId}`),value=receipt?.value;if(!record(value)||value.schema!==1||!['paper-identity-promotion','paper-identity-quarantine'].includes(String(value.kind))||value.noteId!==owner||!record(value.source)||value.source.accountId!==scope.accountId||value.source.spaceId!==scope.spaceId||value.source.type!=='whiteboard'||value.source.documentId!==documentId||!isPaperDocument(value.source.content)||value.source.content.noteId!==owner)throw Error('L’alias de cette image ne possède pas son reçu de récupération.');}
  }else{
   const boardCandidates=candidates.filter(id=>noteBoardId(id)===documentId),claimRows=await Promise.all(boardCandidates.map(async id=>({id,row:await readSnapshot(ownerKey(scope,id))})));check(current);
   const ownedClaims=claimRows.filter(({row})=>row&&record(row.value)&&typeof row.value.noteId==='string');
   if(ownedClaims.length){const values=new Set(ownedClaims.map(({row})=>(row!.value as {noteId:string}).noteId));if(values.size!==1)throw Error('Cette image possède plusieurs propriétaires historiques.');owner=[...values][0];if(!candidates.includes(owner))throw Error('Le reçu d’image désigne une autre note.');await claim(owner,true);}
   else if(candidates.length===1)owner=candidates[0];else throw Error('Le propriétaire complet de cette image est absent ou ambigu. Aucun fichier n’est emprunté.');
   if(raw&&(raw.staged||raw.identityAlias||raw.syncState==='conflict'||!record(raw.content)))throw Error('L’ancien dessin doit être départagé avant de récupérer son image.');
  }
  if(documentId===noteBoardId(noteId)&&owner!==noteId)throw Error('La référence historique de cette note est déjà attribuée à une autre identité. Aucun fichier n’est emprunté.');
  const sourceMetadata=await readDraft(owner!,'notesMarkdown');if(sourceMetadata&&(fullNoteId(sourceMetadata.content)!==owner||sourceMetadata.staged||sourceMetadata.syncState==='conflict'))throw Error('Les métadonnées de l’image appartiennent à une autre note.');
  const sourcePaper=await readDraft(notebookDocumentId(owner!));if(sourcePaper&&(!isPaperDocument(sourcePaper.content)||sourcePaper.content.noteId!==owner||sourcePaper.staged||sourcePaper.syncState==='conflict'||sourcePaper.identityAlias))throw Error('Le carnet propriétaire de l’image est incompatible.');
  await deletion(owner!);const ownsBoard=await claim(owner!,documentId===noteBoardId(owner!));
  const allowed=tags(owner!);if(!ownsBoard)allowed.delete(noteBoardId(owner!));
  const content=raw?.content??sourcePaper?.content;
  return {owner:owner!,raw,sourcePaper,content,allowed};
 };
 interface Prepared {rawURL:string;source:LegacyImageBinding['source'];blob:Blob;name:string;type:string;sha256:string;reuse?:PaperAsset;original?:LocalBlob;originalSHA256?:string;reservedId?:string;remote?:LegacyImageDownloadNeed&{sha256:string;size:number}}
 const downloaded=new Map<string,Blob>();
 const prepared:Prepared[]=[],byURL=new Map<string,Prepared>(),scan=scanLegacyPaperImages(markdown);
 const photoSources=new Map<string,Awaited<ReturnType<typeof inspectPhoto>>>();
 async function inspectPhoto(image:{photo?:{documentId:string;id:string}}){
  const ref=image.photo!,source=await proof(ref.documentId);check(current);
  const manifest=isPaperDocument(source.content)?source.content.assets.filter(asset=>asset.id===ref.id):record(source.content)&&Array.isArray(source.content.photos)?source.content.photos.filter((photo):photo is Record<string,unknown>=>record(photo)&&photo.id===ref.id):[];
  const versions=new Set(manifest.map(asset=>typeof asset.serverId==='string'?asset.serverId:''));if(versions.size>1)throw Error('La même référence d’image désigne plusieurs originaux serveur. Aucun fichier n’est emprunté.');
  const asset=manifest[0],file=files.get(ref.id);checkFile(ref.id);
  if(file&&(file.documentId?!source.allowed.has(file.documentId):!asset||file.removedFromNote))throw Error('Le fichier local ne possède pas une association prouvée avec cette image. Aucun original n’est emprunté.');
  if(file?.documentId){const tagged=await readDraft(file.documentId);if(tagged&&record(tagged.content)&&tagged.content.notebookSchema===3&&!isPaperDocument(tagged.content))throw Error('Le carnet associé au fichier est incomplet ou incompatible.');if(tagged&&isPaperDocument(tagged.content)&&tagged.content.noteId!==source.owner)throw Error('L’association du fichier désigne le carnet d’une autre note.');}
  else if(file)for(const row of rows){if(row.type!=='whiteboard')continue;const references=isPaperDocument(row.content)?row.content.assets:record(row.content)&&Array.isArray(row.content.photos)?row.content.photos:[];
   if(!references.some(value=>record(value)&&value.id===ref.id))continue;
   const owners=isPaperDocument(row.content)?[row.content.noteId]:row.documentId===source.raw?.documentId?[source.owner]:[...known].filter(id=>tags(id).has(row.documentId));
   if(owners.length!==1||owners[0]!==source.owner)throw Error('Un fichier sans association est référencé par plusieurs notes. Aucun original n’est emprunté.');await readDraft(row.documentId);
  }
  if(file?.documentId===noteBoardId(source.owner))await claim(source.owner,true);
  const fileSHA=file?await localBlobDigest(file.blob):undefined;check(current);if(file?.sha256&&file.sha256!==fileSHA)throw Error('L’empreinte des octets de cette image ne correspond plus à son reçu local.');
  const fields=asset as unknown as Record<string,unknown>|undefined,declared=typeof fields?.mediaType==='string'?rasterType(fields.mediaType):'image/png';
  if(fields?.serverId!==undefined&&!safeServerId(fields.serverId))throw Error('L’identité serveur de cet original est incompatible. Aucun téléchargement n’est demandé.');
  const missing=!file?.blob.size,mismatch=asset?.serverId!==undefined&&file?.serverId!==asset.serverId;
  const size=typeof fields?.size==='number'&&fields.size>0?fields.size:undefined,manifestSHA=typeof fields?.sha256==='string'?fields.sha256:undefined;
  const need:LegacyImageDownloadNeed={...scope,noteId:source.owner,documentId:ref.documentId,assetId:ref.id,...(typeof asset?.serverId==='string'?{serverId:asset.serverId}:{}),name:typeof asset?.name==='string'?asset.name:file?.name??'Image',mediaType:declared,...(size===undefined?{}:{size}),...(manifestSHA?{sha256:manifestSHA}:{})};
  if(missing||mismatch){
   if(!asset||!need.serverId)throw new LegacyImageRecoveryError(mismatch?'Les octets locaux ne correspondent pas à l’original serveur de cette image.':'Un original privé doit être retrouvé avant de récupérer cette image. Le texte et les fichiers déjà présents restent conservés.',[need]);
   if(!/^image\/(png|jpeg|gif|webp)$/.test(declared)||fields?.mediaType!==undefined&&typeof fields.mediaType!=='string'||fields?.size!==undefined&&(!Number.isSafeInteger(fields.size)||Number(fields.size)<0||Number(fields.size)>16*1024*1024)||fields?.sha256!==undefined&&(typeof fields.sha256!=='string'||!/^[a-f0-9]{64}$/.test(fields.sha256)))throw Error('Le manifeste raster de cet original est incompatible. Aucun téléchargement n’est demandé.');
   const signatures=new Set(manifest.map(row=>{const fields=row as unknown as Record<string,unknown>;return JSON.stringify([typeof fields.mediaType==='string'?rasterType(fields.mediaType):'image/png',typeof fields.size==='number'&&fields.size>0?fields.size:null,fields.sha256??null]);}));if(signatures.size>1)throw Error('Les descriptions de cet original sont contradictoires. Aucun téléchargement n’est demandé.');
  }
  return {ref,source,manifest,asset,file,fileSHA,missing,mismatch,declared,size,manifestSHA,need};
 }
 // Prove every source and validate embedded originals before the first network read.
 for(const image of scan.images){if(image.kind==='invalid-photo')throw Error('Une ancienne référence privée d’image est incompatible. Son original reste conservé.');if(image.kind==='data')decodeLegacyRasterDataUrl(image.url);if(image.kind==='photo'&&!photoSources.has(image.url))photoSources.set(image.url,await inspectPhoto(image));check(current);}
 for(const image of scan.images){
  if(byURL.has(image.url))continue;
  if(image.kind==='invalid-photo')throw Error('Une ancienne référence privée d’image est incompatible. Son original reste conservé.');
  if(image.kind==='other'){if(image.url.startsWith('data:'))plan.notices.push('Une image intégrée dans un format non pris en charge reste conservée dans son texte original.');continue;}
  if(image.kind==='data'){
   const decoded=decodeLegacyRasterDataUrl(image.url),blob=new Blob([new Uint8Array(decoded.bytes)],{type:decoded.mediaType}),sha256=await localBlobDigest(blob);check(current);
   const item={rawURL:image.url,source:{kind:'data' as const},blob,name:`Image intégrée.${decoded.mediaType==='image/jpeg'?'jpg':decoded.mediaType.slice(6)}`,type:decoded.mediaType,sha256};prepared.push(item);byURL.set(image.url,item);continue;
  }
  const {ref,source,asset,file,fileSHA,missing,mismatch,declared,size,manifestSHA,need}=photoSources.get(image.url)!;
  let blob=file?.blob,type=file?mediaType(file,asset?.mediaType):'image/png',sha256=fileSHA,reuse=ref.documentId===canonicalId&&source.owner===noteId?graph?.assets.find(value=>value.id===ref.id):undefined,reservedId:string|undefined,remote:Prepared['remote'];
  if(missing||mismatch){
   // Reserve and CAS every possible reused destination before the network read. An existing wrong original is always retained.
   for(const binding of provenBindings.filter(binding=>binding.rawURL===image.url))checkFile(binding.assetId);
   const cachedBinding=provenBindings.find(binding=>binding.rawURL===image.url&&binding.source.kind==='local'&&binding.source.noteId===source.owner&&binding.source.documentId===ref.documentId&&binding.source.assetId===ref.id&&binding.source.serverId===need.serverId),cached=cachedBinding&&files.get(cachedBinding.assetId);
   let received:Blob|undefined;
   if(cached&&cachedBinding){checkFile(cached.id);const cachedAsset=graph?.assets.find(row=>row.id===cached.id);if(cached.documentId!==canonicalId||cached.removedFromNote||!cachedAsset||cachedAsset.size!==cached.blob.size||cachedAsset.serverId&&cachedAsset.serverId!==cached.serverId)throw Error('La copie reçue de cet original ne possède plus son association prouvée.');const cachedSHA=await localBlobDigest(cached.blob);check(current);if(cachedSHA!==cachedBinding.sha256||cached.sha256&&cached.sha256!==cachedSHA)throw Error('La copie reçue de cet original ne possède plus ses octets exacts.');received=cached.blob;reservedId=cached.id;reuse=undefined;}
   else if(file||!reuse){reuse=undefined;reservedId=allocate();checkFile(reservedId);}
   const downloadKey=JSON.stringify([source.owner,ref.id,need.serverId]);received??=downloaded.get(downloadKey);
   if(!received){if(!input.downloadOriginal)throw new LegacyImageRecoveryError('Un original privé doit être retrouvé avant de récupérer cette image. Le texte et les fichiers déjà présents restent conservés.',[need]);check(current);received=await input.downloadOriginal(Object.freeze({...need}));check(current);if(!(received instanceof Blob)||!received.size||received.size>16*1024*1024)throw Error('L’original téléchargé est vide ou trop volumineux. Aucun fichier n’est modifié.');downloaded.set(downloadKey,received);}
   if(size!==undefined&&received.size!==size)throw Error('La taille téléchargée ne correspond pas au manifeste de cet original.');
   const servedType=rasterType(received.type.split(';')[0].trim());if(servedType&&servedType!=='application/octet-stream'&&servedType!==declared)throw Error('Le type téléchargé ne correspond pas au manifeste de cet original.');
   const bytes=new Uint8Array(await received.arrayBuffer());check(current);const validated=validateLegacyRasterBytes(bytes,declared);blob=new Blob([new Uint8Array(validated.bytes)],{type:validated.mediaType});type=validated.mediaType;sha256=await localBlobDigest(blob);check(current);if(manifestSHA&&manifestSHA!==sha256)throw Error('L’empreinte téléchargée ne correspond pas au manifeste de cet original.');
   if(reuse&&provenBindings.some(binding=>binding.rawURL===image.url&&binding.sha256!==sha256)){reuse=undefined;reservedId=allocate();checkFile(reservedId);}
   if(reuse){if(reuse.serverId!==need.serverId||reuse.size>0&&reuse.size!==blob.size||rasterType(reuse.mediaType)!==type)throw Error('L’original téléchargé ne correspond plus à l’image de ce carnet.');reuse={...reuse,size:blob.size,mediaType:type};}
   remote={...need,mediaType:type,size:blob.size,sha256};
  }
  if(!blob||!sha256)throw Error('Les octets de cet original doivent être retrouvés avant de continuer.');
  if(reuse&&(reuse.size!==blob.size||reuse.serverId&&reuse.serverId!==file?.serverId&&!remote))throw Error('L’image du carnet courant possède un autre original.');
  const sourceServer=remote?.serverId??file?.serverId;
  const item:Prepared={rawURL:image.url,source:{kind:'local',noteId:source.owner,documentId:ref.documentId,assetId:ref.id,...(sourceServer?{serverId:sourceServer}:{})},blob,name:typeof asset?.name==='string'?asset.name:file?.name??'Image',type,sha256,reuse,original:file,originalSHA256:fileSHA,reservedId,remote};prepared.push(item);byURL.set(image.url,item);
 }
 // Already owned canonical images need byte/CAS validation, never another
 // migration receipt for each phrase or metadata echo. Their marker is stable
 // across text changes and records the first exact observation only.
 const modernValidation=!!target&&prepared.length>0&&prepared.every(item=>item.reuse&&item.rawURL===photoReference(canonicalId,item.reuse.id));
 if(modernValidation)prepared.sort((a,b)=>a.rawURL.localeCompare(b.rawURL));
 // An uploader acknowledgement changes a pointer, never the immutable original's identity.
 const fingerprint=notebookIdentityDigest(JSON.stringify(modernValidation?['owned-canonical-validation',noteId,prepared.map(item=>({rawURL:item.rawURL,source:originalSource(item.source),sha256:item.sha256}))]:[noteId,markdown,prepared.map(item=>({rawURL:item.rawURL,source:item.remote?item.source:originalSource(item.source),sha256:item.sha256}))]));
 const receiptKey=`paper-legacy-images|${scope.accountId}|${scope.spaceId}|whiteboard|${canonicalId}|${fingerprint}`,old=await readSnapshot(receiptKey),oldValue=old?.value;
 if(old&&(!record(oldValue)||oldValue.schema!==1||oldValue.kind!=='paper-legacy-image-assets'||oldValue.noteId!==noteId||oldValue.documentId!==canonicalId||typeof oldValue.originalMarkdown!=='string'||typeof oldValue.rewrittenMarkdown!=='string'||(!modernValidation&&oldValue.originalMarkdown!==markdown)||(modernValidation&&(oldValue.mode!=='owned-canonical-validation'||oldValue.originalMarkdown!==oldValue.rewrittenMarkdown))||oldValue.fingerprint!==fingerprint||!Array.isArray(oldValue.mappings)))throw Error('Le reçu de récupération d’image appartient à un autre original.');
 const previous=oldValue as unknown as LegacyImageAssetReceipt|undefined;
 for(const item of prepared){
  const prior=previous?.mappings.find(mapping=>mapping.rawURL===item.rawURL)??input.existingBindings?.find(mapping=>mapping.rawURL===item.rawURL&&mapping.sha256===item.sha256&&JSON.stringify(originalSource(mapping.source))===JSON.stringify(originalSource(item.source))),id=item.reuse?.id??prior?.assetId??item.reservedId??allocate();
  if(prior&&(prior.sha256!==item.sha256||JSON.stringify(originalSource(prior.source))!==JSON.stringify(originalSource(item.source))||prior.canonicalURL!==photoReference(canonicalId,id)))throw Error('La référence récupérée ne correspond plus à son original.');
  const existing=files.get(id);checkFile(id);if(existing&&id!==item.reuse?.id){if(existing.documentId!==canonicalId||existing.removedFromNote||await localBlobDigest(existing.blob)!==item.sha256)throw Error('La copie de récupération possède déjà un autre original.');check(current);}
  const declared=graph?.assets.find(asset=>asset.id===id);if(declared&&((declared.size!==item.blob.size&&!(item.reuse&&item.remote&&declared.size===0))||declared.mediaType!==item.type||!item.reuse&&declared.serverId&&declared.serverId!==existing?.serverId))throw Error('Cette identité d’image appartient déjà à un autre fichier du carnet.');
  const asset:PaperAsset=item.reuse??{id,name:item.name,mediaType:item.type,size:item.blob.size,...(existing?.serverId?{serverId:existing.serverId}:{})};plan.assets.push(asset);
  if(!existing){plan.blobs.push({...scope,id,documentId:canonicalId,blob:item.blob.type===item.type?item.blob:new Blob([item.blob],{type:item.type}),name:item.name,createdAt:Date.parse(now),status:item.reuse&&item.remote?'uploaded':'pending',...(item.reuse&&item.remote?.serverId?{serverId:item.remote.serverId}:{}),sha256:item.sha256,revision:1,removedFromNote:false});}
  plan.mappings.push({rawURL:item.rawURL,canonicalURL:photoReference(canonicalId,id),assetId:id,sha256:item.sha256,source:item.remote&&!modernValidation?item.source:prior?.source??item.source});
 }
 const rewritten=rewriteLegacyImageBindings(markdown,plan.mappings);
 if(previous&&(JSON.stringify(previous.mappings)!==JSON.stringify(plan.mappings)||!modernValidation&&previous.rewrittenMarkdown!==rewritten))throw Error('Le reçu ne permet pas de reproduire les références d’image.');
 const originalFiles=prepared.flatMap(item=>{if(!item.original)return [];const {blob,...file}=item.original;return [{...file,sha256:item.originalSHA256??item.sha256}];});
 const sourceClaims:Snapshot[]=[...snapshots.values()].flatMap(snapshot=>{
  if(!snapshot||!snapshot.key.startsWith(`paper-legacy-owner|${scope.accountId}|${scope.spaceId}|whiteboard|`)||!record(snapshot.value)||snapshot.value.schema!==1||typeof snapshot.value.noteId!=='string'||snapshot.key!==ownerKey(scope,snapshot.value.noteId)||snapshot.value.boardId!==noteBoardId(snapshot.value.noteId)||snapshot.value.documentId!==notebookDocumentId(snapshot.value.noteId)||typeof snapshot.value.claimedAt!=='string'||!Number.isFinite(Date.parse(snapshot.value.claimedAt)))return [];
  // Preserve the original row in storage/CAS; carry only the actual owner claim,
  // never unknown fields that could themselves hold historical receipt values.
  return [{key:snapshot.key,...scope,value:{schema:1,noteId:snapshot.value.noteId,documentId:snapshot.value.documentId,boardId:snapshot.value.boardId,claimedAt:snapshot.value.claimedAt}}];
 });
 // Old image receipts remain immutable and are checked in snapshotChecks. A
 // new receipt references them by identity; embedding their values recursively
 // would double the retained payload on every subsequent observation.
 const remoteOriginals=prepared.flatMap(item=>item.remote?[item.remote]:[]);
 const receiptRow:Snapshot=old??{key:receiptKey,...scope,value:{schema:1,kind:'paper-legacy-image-assets',noteId,documentId:canonicalId,...(modernValidation?{mode:'owned-canonical-validation' as const}:{}),originalMarkdown:markdown,rewrittenMarkdown:rewritten,fingerprint,mappings:plan.mappings,sourceDrafts:[...drafts.values()].filter((draft):draft is Draft=>!!draft),sourceClaims,bindingReceipts,originalFiles,...(remoteOriginals.length?{remoteOriginals}:{}),recoveredAt:now} satisfies LegacyImageAssetReceipt};
 if(!old)plan.snapshots.push(receiptRow);check(current);return {...plan,markdown:rewritten,receiptRow};
}
