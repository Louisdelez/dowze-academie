import {photoReference} from './notebook.ts';
import {applyPaperCommand,isPaperDocument,notebookDocumentId,type PaperDocument,type PaperObject,type PaperCommand,type PaperAsset} from './notebookDocument.ts';
import {readPaperAsset,resolvePaperPhotoReference} from './paperAssets.ts';
import {scanLegacyPaperImages,planLegacyPaperImageRewrite} from './paperLegacyImages.ts';
import {copiedPageText} from './paperPageCopy.ts';
import {amendPaperCollaboration} from './paperCollaboration.ts';
import {notebookIdentityDigest} from './notebookIdentity.ts';
import {getDraft,getSnapshot,listLocalBlobs,localBlobDigest,notebookDeletionKey,readNotebookDeletionStatus,type Draft,type LocalBlob,type Snapshot,type NotebookTransferCommit} from '../../pwa/src/storage.ts';
import type {NotebookMediaScope} from '../components/NotebookEditor';
interface Selection {objects:PaperObject[];assets:PaperAsset[];bytes:Map<string,Blob>;source:{noteId:string;revision:number;pageId?:string;objectIds:string[]};serial:number}
const selections=new Map<string,Selection>(),serials=new Map<string,number>();
const scopeKey=(media:Pick<NotebookMediaScope,'accountId'|'spaceId'>)=>JSON.stringify([media.accountId,media.spaceId]);
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const check=(current:()=>boolean)=>{if(!current())throw Error('Le carnet ou le compte a changé. Les objets copiés et leurs originaux restent conservés.');};
/** A copy publishes one immutable selection only after its scoped reads finish.
 * A newer copy or account cleanup cannot be overwritten by an old completion. */
export async function copyPaperSelection(document:PaperDocument,ids:string[],media:NotebookMediaScope,current:()=>boolean=()=>true,pageId?:string){
 check(current);if(!isPaperDocument(document))throw Error('La sélection attend un carnet valide.');
 const source=structuredClone(document),selected=[...new Set(ids)];if(!selected.length||selected.some(id=>!source.objects.some(object=>object.id===id)))throw Error('La sélection doit être retrouvée avant sa copie.');
 if(pageId&&!source.pages.some(page=>page.id===pageId))throw Error('La page de cette sélection a changé.');
 const key=scopeKey(media),serial=(serials.get(key)??0)+1;serials.set(key,serial);
 const valid=()=>current()&&serials.get(key)===serial;
 const objects=source.objects.filter(object=>selected.includes(object.id)).map(object=>{
  if(!pageId||!object.textFlow)return object;
  const {textFlow,...copy}=object;return {...copy,pageId,markdown:copiedPageText(object,pageId)};
 }),needed=new Set(objects.flatMap(object=>object.assetId?[object.assetId]:[]));
 for(const object of objects)if(object.markdown)for(const image of scanLegacyPaperImages(object.markdown).images){
  if(image.kind==='invalid-photo')throw Error('Une image de cette sélection doit être récupérée.');
  if(image.kind!=='photo')continue;const resolved=resolvePaperPhotoReference(source,image.url);if(resolved.kind!=='asset')throw Error(resolved.kind==='unavailable'?resolved.message:'Une référence d’image est incompatible.');needed.add(resolved.asset.id);
 }
 const assets=source.assets.filter(asset=>needed.has(asset.id));if(assets.length!==needed.size)throw Error('Une pièce jointe de la sélection manque.');
 const bytes=new Map<string,Blob>();let total=0;for(const asset of assets){check(valid);const blob=await readPaperAsset(asset,media,{document:source,current:valid});check(valid);total+=blob.size;if(total>32*1024*1024)throw Error('Copiez cette sélection en plusieurs parties de moins de 32 Mo.');bytes.set(asset.id,blob);}
 check(valid);selections.set(key,{objects:structuredClone(objects),assets:structuredClone(assets),bytes,source:{noteId:source.noteId,revision:source.revision,...(pageId?{pageId}:{}),objectIds:selected},serial});return objects.length;
}
export function hasPaperSelection(media:NotebookMediaScope){return !!selections.get(scopeKey(media))?.objects.length;}
export interface PreparedPastePaperSelection {draft:Draft;commit:NotebookTransferCommit;ids:string[];commands:PaperCommand[];warnings:string[]}
/** No storage mutation occurs here. The caller applies draft, bytes, receipt and
 * exact recovery snapshot together through paper.applyPrepared/CAS. */
export async function preparePastePaperSelection(document:PaperDocument,pageId:string,media:NotebookMediaScope,current:()=>boolean):Promise<PreparedPastePaperSelection>{
 check(current);if(!isPaperDocument(document))throw Error('Le carnet de destination doit être retrouvé.');const page=document.pages.find(page=>page.id===pageId);if(!page)throw Error('La page de destination a changé.');
 const scope={accountId:media.accountId,spaceId:media.spaceId},key=scopeKey(media),copy=selections.get(key);if(!copy?.objects.length)throw Error('Copiez d’abord une sélection dans cet espace.');
 const valid=()=>current()&&selections.get(key)===copy;check(valid);
 const identity={...scope,type:'whiteboard' as const,documentId:notebookDocumentId(document.noteId)},stored=await getDraft(identity);check(valid);
 if(!stored||stored.accountId!==scope.accountId||stored.spaceId!==scope.spaceId||stored.type!=='whiteboard'||stored.documentId!==identity.documentId||stored.identityAlias||stored.staged||stored.syncState==='conflict'||!isPaperDocument(stored.content)||!equal(stored.content,document))throw Error('La note a changé ou attend son enregistrement. Reprenez le collage depuis sa version conservée.');
 if(await readNotebookDeletionStatus(document.noteId,scope,valid))throw Error('Cette note est supprimée. Le collage ne la recrée pas.');check(valid);
 const deletionKey=notebookDeletionKey(identity),deletion=await getSnapshot(deletionKey);check(valid);if(deletion)throw Error('La suppression de cette note doit être départagée.');
 const files=await listLocalBlobs(scope.accountId,scope.spaceId);check(valid);const occupied=new Set([...document.objects.map(object=>object.id),...document.objects.flatMap(object=>object.groupId?[object.groupId]:[]),...document.assets.map(asset=>asset.id),...files.map(file=>file.id)]);
 const allocate=()=>{for(let i=0;i<32;i++){const value=crypto.randomUUID();if(!occupied.has(value)){occupied.add(value);return value;}}throw Error('Le collage attend des identités nouvelles.');};
 const assets=new Map(copy.assets.map(asset=>[asset.id,allocate()])),groups=new Map(copy.objects.filter(object=>object.groupId).map(object=>[object.groupId!,allocate()])),commands:PaperCommand[]=[],ids:string[]=[],blobs:LocalBlob[]=[],now=new Date().toISOString(),at=Date.parse(now),warnings:string[]=[];
 for(const asset of copy.assets){check(valid);const original=copy.bytes.get(asset.id);if(!original||asset.size>0&&original.size!==asset.size)throw Error('Un original copié manque ou possède une autre taille.');const id=assets.get(asset.id)!,blob=original.slice(0,undefined,asset.mediaType),sha256=await localBlobDigest(blob);check(valid);blobs.push({...scope,id,documentId:identity.documentId,blob,name:asset.name,createdAt:at,status:'pending',removedFromNote:false,revision:1,sha256});commands.push({type:'add-asset',asset:{...asset,id,size:blob.size,serverId:undefined}});}
 const top=Math.max(0,...document.objects.filter(object=>object.pageId===pageId||object.textFlow?.pageIds.includes(pageId)).map(object=>object.z));
 for(const original of copy.objects){check(valid);const id=allocate();ids.push(id);const {audioAnchor,textFlow,...object}=structuredClone(original);let markdown=object.markdown;
  if(markdown!==undefined){const scan=scanLegacyPaperImages(markdown),replacements=new Map<string,string>();for(const image of scan.images)if(image.kind==='photo'){const asset=assets.get(image.photo!.id);if(!asset)throw Error('Une image copiée ne possède plus son original.');replacements.set(image.id,photoReference(identity.documentId,asset));}markdown=planLegacyPaperImageRewrite(scan,replacements).markdown;}
  const audioWarning='Les liens vers les passages audio de la note d’origine restent dans cette note.';
  const anchor=audioAnchor&&copy.source.noteId===document.noteId&&document.audio.some(track=>track.id===audioAnchor.sessionId)?audioAnchor:undefined;if(audioAnchor&&!anchor&&!warnings.includes(audioWarning))warnings.push(audioWarning);
  const measurementWarning='Les mesures sont recalculées selon la calibration de la page de destination.';
  if(object.measurement&&object.measurement.unit!=='page'&&!warnings.includes(measurementWarning))warnings.push(measurementWarning);
  commands.push({type:'upsert-object',object:{...object,id,pageId,x:Math.max(0,Math.min(object.x+24,page.width-Math.min(page.width,object.width))),y:Math.max(0,Math.min(object.y+24,page.height-Math.min(page.height,object.height))),z:top+ids.length,locked:false,createdAt:at,...(markdown!==undefined?{markdown}:{}),...(object.assetId?{assetId:assets.get(object.assetId)!}:{}),...(object.groupId?{groupId:groups.get(object.groupId)}:{}),...(anchor?{audioAnchor:anchor}:{})}});
 }
 const next=amendPaperCollaboration(document,applyPaperCommand(document,{type:'batch',commands},now),JSON.stringify([scope.accountId,scope.spaceId,document.noteId])),draft:Draft={...stored,content:next,updatedAt:at,syncState:'local'};
 const historyKey=`paper-history|${scope.accountId}|${scope.spaceId}|whiteboard|${identity.documentId}|${String(document.revision).padStart(12,'0')}`,history=await getSnapshot(historyKey);check(valid);if(history&&(history.accountId!==scope.accountId||history.spaceId!==scope.spaceId||history.key!==historyKey))throw Error('L’historique de cette note possède une autre portée.');
 const exactHistoryKey=history&&!equal(history.value,document)?`${historyKey}|clipboard-${allocate()}`:historyKey,exactHistory=exactHistoryKey===historyKey?history:await getSnapshot(exactHistoryKey);check(valid);if(exactHistoryKey!==historyKey&&exactHistory)throw Error('Une version du collage utilise déjà cette identité.');
 const receiptKey=`paper-clipboard-paste|v1|${notebookIdentityDigest(JSON.stringify([scope.accountId,scope.spaceId,document.noteId]))}|${allocate()}`,receiptBefore=await getSnapshot(receiptKey);check(valid);if(receiptBefore)throw Error('Un reçu de collage utilise déjà cette identité.');
 const receipt:Snapshot={...scope,key:receiptKey,value:{schema:1,kind:'paper-clipboard-paste',noteId:document.noteId,pageId,source:copy.source,objectIds:ids,files:blobs.map(file=>({assetId:file.id,sha256:file.sha256,size:file.blob.size})),beforeHistoryKey:exactHistoryKey,warnings,appliedAt:now}};
 const commit:NotebookTransferCommit={target:scope,sources:[scope],drafts:[draft],blobs,snapshots:[receipt,...(exactHistory&&equal(exactHistory.value,document)?[]:[{...scope,key:exactHistoryKey,value:document}])],draftChecks:[{identity,expected:stored}],blobChecks:blobs.map(file=>({identity:file,expected:undefined})),snapshotChecks:[{key:deletionKey,expected:undefined},{key:receiptKey,expected:undefined},{key:historyKey,expected:history},...(exactHistoryKey!==historyKey?[{key:exactHistoryKey,expected:undefined}]:[])]};
 check(valid);return {draft,commit,ids,commands,warnings};
}
/** Legacy command-only callers can still paste objects without files. File
 * selections require the atomic prepared path; never prewrite orphan blobs. */
export async function pastePaperSelection(noteId:string,pageId:string,media:NotebookMediaScope,current:()=>boolean=()=>true):Promise<{commands:PaperCommand[];ids:string[]}>{
 check(current);const copy=selections.get(scopeKey(media));if(!copy?.objects.length)throw Error('Copiez d’abord une sélection dans cet espace.');if(copy.assets.length)throw Error('Le collage de fichiers doit utiliser la préparation protégée du carnet.');const stored=await getDraft({...media,type:'whiteboard',documentId:notebookDocumentId(noteId)});check(current);if(!stored||!isPaperDocument(stored.content))throw Error('Le carnet de destination attend son ouverture.');const prepared=await preparePastePaperSelection(stored.content,pageId,media,current);return {commands:prepared.commands,ids:prepared.ids};
}
export function clearPaperSelections(accountId:string){for(const key of new Set([...selections.keys(),...serials.keys()])){const owner=JSON.parse(key) as [string,string];if(owner[0]===accountId){selections.delete(key);serials.set(key,(serials.get(key)??0)+1);}}}
