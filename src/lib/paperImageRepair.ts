import {getDraft,getSnapshot,listLocalBlobs,localBlobDigest,commitNotebookTransfer,notebookDeletionKey,readNotebookDeletionStatus,type Draft,type DraftKey,type LocalBlob,type Snapshot,type NotebookTransferCommit} from '../../pwa/src/storage.ts';
import {applyPaperCommand,isPaperDocument,notebookDocumentId,type PaperAsset,type PaperDocument,type PaperCommand} from './notebookDocument.ts';
import {legacyNotebookDocumentId,notebookIdentityDigest} from './notebookIdentity.ts';
import {noteBoardId,photoReference} from './notebook.ts';
import {amendPaperCollaboration} from './paperCollaboration.ts';
import {scanLegacyPaperImages,planLegacyPaperImageRewrite,validateLegacyRasterBytes,type PaperLegacyImageEdit} from './paperLegacyImages.ts';
import type {LegacyImageDownloadNeed} from './paperLegacyImageAssets.ts';

export interface PaperImageRepairScope {accountId:string;spaceId:string}
export interface PaperImageRepairInput {
 document:PaperDocument;assetId:string;scope:PaperImageRepairScope;current:()=>boolean;
 /** Explicit historical source, in this same note and scope. An existing owner claim or a full graph is required. */
 historicalSource?:{documentId:string;assetId:string};
}
export interface PaperImageRepairCandidate {
 id:string;kind:'local'|'server';label:string;name:string;mediaType:string;size?:number;sha256?:string;serverId?:string;
 source:{noteId:string;documentId:string;assetId:string};
}
export interface PaperImageRepairPlan {
 schema:1;id:string;noteId:string;documentId:string;asset:PaperAsset;
 reason:'server-mismatch'|'size-mismatch'|'missing-file'|'unproved-file'|'historical-source'|'explicit-version';
 candidates:readonly PaperImageRepairCandidate[];unavailable:readonly {kind:'local'|'historical'|'server';message:string}[];
 references:{floating:number;inline:number};
}
/** Ephemeral preview token: it must originate from loadPaperImageRepairVersion for this exact plan. */
export interface PaperImageRepairVersion {planId:string;versionId:string;sha256:string;size:number;mediaType:string;blob:Blob}
export interface PaperImageRepairReceipt {
 schema:1;kind:'paper-image-repair';noteId:string;documentId:string;planId:string;
 originalAsset:PaperAsset;retainedFile?:{id:string;ownership:'proved'|'unproved';serverId?:string;sha256?:string};
 chosen:PaperImageRepairCandidate&{sha256:string;size:number};copy:{assetId:string;sha256:string;size:number;mediaType:string};
 sourceDrafts:Draft[];sourceClaims:Snapshot[];beforeHistoryKey:string;
 changedObjects:string[];originalMetadata?:Draft;repairedAt:string;
}
export interface PreparedPaperImageRepair {
 draft:Draft;metadataDraft?:Draft;
 /** IDB metadata is already part of commit; a native device-cache setter can compare this exact baseline before mirroring. */
 metadataChange?:{beforeMarkdown:string;afterMarkdown:string};
 asset:PaperAsset;url:string;receipt:Snapshot;commit:NotebookTransferCommit;
}

interface State {
 scope:PaperImageRepairScope;document:PaperDocument;assetId:string;stored:Draft;metadata?:Draft;file?:LocalBlob;localOwned:boolean;localSHA?:string;
 allowed:Map<string,Set<string>>;candidates:Map<string,PaperImageRepairCandidate>;
 drafts:NotebookTransferCommit['draftChecks'];snapshots:NotebookTransferCommit['snapshotChecks'];ownedSources:Draft[];
}
const states=new WeakMap<PaperImageRepairPlan,State>(),versions=new WeakMap<PaperImageRepairVersion,{plan:PaperImageRepairPlan;candidate:PaperImageRepairCandidate;blob:Blob;sha256:string}>();
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const plainDraft=(v:Draft|undefined)=>v&&{...v,key:undefined};
const blobState=(v:LocalBlob|undefined)=>v&&{...v,key:undefined,blob:undefined,size:v.blob.size,mediaType:v.blob.type};
const check=(current:()=>boolean)=>{if(!current())throw Error('Le compte, l’année ou la note a changé. Les versions originales restent conservées.');};
const safeId=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,126}$/.test(v)&&!v.includes('..');
const scopeId=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=200&&!/[\u0000-\u001f\u007f]/.test(v);
const type=(v:string)=>v.toLowerCase()==='image/jpg'?'image/jpeg':v.toLowerCase();
const raster=(v:unknown):v is string=>typeof v==='string'&&['image/png','image/jpeg','image/gif','image/webp'].includes(type(v));
const ownerKey=(scope:PaperImageRepairScope,noteId:string)=>`paper-legacy-owner|${scope.accountId}|${scope.spaceId}|whiteboard|${noteBoardId(noteId)}`;
function stateFor(plan:PaperImageRepairPlan):State {const state=states.get(plan);if(!state)throw Error('Ce diagnostic d’image doit être rouvert avant la réparation.');return state;}
async function assertCurrent(state:State,current:()=>boolean){
 check(current);
 for(const row of state.drafts){const latest=await getDraft(row.identity);check(current);if(!equal(plainDraft(latest),plainDraft(row.expected)))throw Error('La note ou sa source a changé après le diagnostic. Rouvrez le choix des images.');}
 for(const row of state.snapshots){const latest=await getSnapshot(row.key);check(current);if(!equal(latest,row.expected))throw Error('Le propriétaire ou la suppression de cette note a changé. Aucun original n’est remplacé.');}
 const file=(await listLocalBlobs(state.scope.accountId,state.scope.spaceId)).find(row=>row.id===state.assetId);check(current);
 // No local bytes are opened for an unproved owner. Their complete persisted state is still checked under CAS.
 if(!equal(blobState(file),blobState(state.file)))throw Error('Le fichier local a changé après le diagnostic. Ses originaux sont conservés.');
 if(state.localOwned&&file&&await localBlobDigest(file.blob)!==state.localSHA)throw Error('Les octets locaux ont changé après le diagnostic.');check(current);
}
function replacements(markdown:string,state:State,url:string){
 const scan=scanLegacyPaperImages(markdown),values=new Map<string,string>();
 for(const image of scan.images)if(image.photo&&state.allowed.get(image.photo.documentId)?.has(image.photo.id))values.set(image.id,url);
 return {scan,...planLegacyPaperImageRewrite(scan,values),count:values.size};
}
/** Keep continuation pages/geometry; invalidate measured layout and remap UTF-16 boundaries until the renderer measures it again. */
function remapOffsets(offsets:readonly number[],oldLength:number,newLength:number,edits:readonly PaperLegacyImageEdit[]):number[]|undefined {
 if(offsets[0]!==0||offsets.at(-1)!==oldLength||offsets.some((n,i)=>!Number.isSafeInteger(n)||n<0||n>oldLength||i>0&&n<offsets[i-1]))return undefined;
 return offsets.map((offset,index)=>{if(index===0)return 0;if(index===offsets.length-1)return newLength;let delta=0;
  for(const edit of edits){if(offset<edit.from)break;if(offset>=edit.to){delta+=edit.text.length-(edit.to-edit.from);continue;}return edit.from+delta+Math.min(offset-edit.from,edit.text.length);}return offset+delta;});
}

/** Read-only diagnostic. Merely opening this choice neither downloads bytes nor writes claims or files. */
export async function inspectPaperImageRepair(input:PaperImageRepairInput):Promise<PaperImageRepairPlan>{
 const scope={accountId:input.scope.accountId,spaceId:input.scope.spaceId},document=structuredClone(input.document),{current}=input;check(current);
 if(!isPaperDocument(document)||!Object.values(scope).every(scopeId))throw Error('La note ne possède pas une identité de réparation valide.');
 const documentId=notebookDocumentId(document.noteId),identity={...scope,type:'whiteboard' as const,documentId},stored=await getDraft(identity);check(current);
 if(!stored||stored.accountId!==scope.accountId||stored.spaceId!==scope.spaceId||stored.type!=='whiteboard'||stored.documentId!==documentId||stored.identityAlias||stored.staged||stored.syncState==='conflict'||!isPaperDocument(stored.content)||stored.content.noteId!==document.noteId||!equal(stored.content,document))throw Error('La version de ce carnet doit être retrouvée avant de réparer une image.');
 const asset=document.assets.find(row=>row.id===input.assetId);if(!asset)throw Error('Cette image n’appartient plus au carnet courant.');
 const state:State={scope,document,assetId:asset.id,stored,localOwned:false,allowed:new Map([[documentId,new Set([asset.id])]]),candidates:new Map(),drafts:[{identity,expected:stored}],snapshots:[],ownedSources:[]};
 const unavailable:PaperImageRepairPlan['unavailable'][number][]=[];
 const snapshot=async(key:string)=>{const row=await getSnapshot(key);check(current);if(row&&(row.accountId!==scope.accountId||row.spaceId!==scope.spaceId))throw Error('Un reçu d’image appartient à un autre compte ou à une autre année.');state.snapshots.push({key,expected:row});return row;};
 const read=async(documentId:string,type:Draft['type']='whiteboard')=>{const identity={...scope,type,documentId},row=await getDraft(identity);check(current);if(row&&(row.accountId!==scope.accountId||row.spaceId!==scope.spaceId||row.type!==type||row.documentId!==documentId))throw Error('Une source appartient à un autre compte, une autre année ou une autre identité complète.');state.drafts.push({identity,expected:row});return row;};
 if(await readNotebookDeletionStatus(document.noteId,scope,current))throw Error('Cette note a été supprimée. Sa réparation ne peut pas la recréer.');check(current);
 if(await snapshot(notebookDeletionKey(identity)))throw Error('La suppression de cette note doit être départagée avant la réparation.');
 state.metadata=await read(document.noteId,'notesMarkdown');
 if(state.metadata&&(!record(state.metadata.content)||state.metadata.content.id!==document.noteId||state.metadata.staged||state.metadata.identityAlias||state.metadata.syncState==='conflict'||state.metadata.paperDependency&&state.metadata.paperDependency!==documentId))throw Error('Les métadonnées de cette note doivent être départagées avant la réparation.');
 const claim=await snapshot(ownerKey(scope,document.noteId)),board=noteBoardId(document.noteId);
 if(claim&&(!record(claim.value)||claim.value.schema!==1||claim.value.noteId!==document.noteId||claim.value.documentId!==documentId||claim.value.boardId!==board||!Number.isFinite(Date.parse(String(claim.value.claimedAt)))))throw Error('Le propriétaire historique de cette note est contradictoire. Aucun fichier n’est emprunté.');
 const claimProved=!!claim;
 if(claimProved&&document.legacy.boardId===board)for(const alias of [board,legacyNotebookDocumentId(document.noteId),`paper-v3-${document.noteId}`,document.noteId])state.allowed.set(alias,new Set([asset.id]));
 const addServer=(descriptor:Record<string,unknown>,source:PaperImageRepairCandidate['source'],label:string)=>{
  if(!safeId(descriptor.serverId)||!raster(descriptor.mediaType)||descriptor.size!==undefined&&(!Number.isSafeInteger(descriptor.size)||Number(descriptor.size)<0||Number(descriptor.size)>16*1024*1024)||descriptor.sha256!==undefined&&(typeof descriptor.sha256!=='string'||!/^[a-f0-9]{64}$/.test(descriptor.sha256))){unavailable.push({kind:'server',message:'Une version serveur possède un manifeste incompatible. Aucun téléchargement n’est demandé pour cette version.'});return;}
  const value={kind:'server' as const,label,name:typeof descriptor.name==='string'?descriptor.name.slice(0,300):asset.name,mediaType:type(descriptor.mediaType),...(Number(descriptor.size)>0?{size:Number(descriptor.size)}:{}),...(descriptor.sha256?{sha256:String(descriptor.sha256)}:{}),serverId:descriptor.serverId,source};
  const id=`version-${notebookIdentityDigest(JSON.stringify(value))}`;state.candidates.set(id,Object.freeze({id,...value,source:Object.freeze({...source})}));
 };
 if(asset.serverId)addServer(asset as unknown as Record<string,unknown>,{noteId:document.noteId,documentId,assetId:asset.id},'Original indiqué par le carnet');
 if(input.historicalSource){
  const source={documentId:input.historicalSource.documentId,assetId:input.historicalSource.assetId},row=await read(source.documentId),ownGraph=!!row&&isPaperDocument(row.content)&&row.content.noteId===document.noteId&&[documentId,legacyNotebookDocumentId(document.noteId)].includes(source.documentId),ownBoard=source.documentId===board&&claimProved;
  if(!row||row.staged||row.syncState==='conflict'||row.identityAlias||!ownGraph&&!ownBoard||!record(row.content)||ownBoard&&!ownGraph&&!state.metadata||isPaperDocument(row.content)&&row.content.noteId!==document.noteId||record(row.content)&&row.content.notebookSchema===3&&!isPaperDocument(row.content)||source.assetId!==asset.id&&document.assets.some(other=>other.id===source.assetId)){unavailable.push({kind:'historical',message:'Cette source historique ne possède pas un propriétaire complet prouvé ou sa référence est déjà utilisée par une autre image. Ses fichiers ne sont ni affichés ni empruntés.'});}
  else {
   const manifest=isPaperDocument(row.content)?row.content.assets:source.documentId===board&&Array.isArray(row.content.photos)?row.content.photos:[];
   const descriptors=manifest.filter((v):v is Record<string,unknown>=>record(v)&&v.id===source.assetId);
   if(!descriptors.length)unavailable.push({kind:'historical',message:'La source historique ne contient plus le manifeste de cette image.'});
   else {state.ownedSources.push(row);const allowed=state.allowed.get(source.documentId)??new Set<string>();allowed.add(source.assetId);state.allowed.set(source.documentId,allowed);for(const descriptor of descriptors)addServer(descriptor,{noteId:document.noteId,...source},'Original historique à choisir');}
  }
 }
 const file=(await listLocalBlobs(scope.accountId,scope.spaceId)).find(row=>row.id===asset.id);check(current);state.file=file;
 if(file){
  const tag=file.documentId,canonical=tag===documentId,legacy=!!tag&&claimProved&&document.legacy.boardId===board&&[board,legacyNotebookDocumentId(document.noteId),`paper-v3-${document.noteId}`,document.noteId].includes(tag);
  let proved=canonical||legacy;
  if(proved&&tag&&tag!==documentId){const associated=await read(tag);if(associated&&(associated.staged||associated.syncState==='conflict'||associated.identityAlias||isPaperDocument(associated.content)&&associated.content.noteId!==document.noteId||record(associated.content)&&associated.content.notebookSchema===3&&!isPaperDocument(associated.content)))proved=false;}
  if(!proved||file.removedFromNote){unavailable.push({kind:'local',message:'Le fichier local ne possède pas un propriétaire utilisable prouvé. Il reste conservé et ne sera pas affiché.'});}
  else try {
   if(!raster(file.blob.type))throw Error('Ce fichier local n’est pas un original raster pris en charge.');
   validateLegacyRasterBytes(new Uint8Array(await file.blob.arrayBuffer()),file.blob.type);check(current);const sha256=await localBlobDigest(file.blob);check(current);
   if(file.sha256&&file.sha256!==sha256)throw Error('L’empreinte du fichier local ne correspond plus à ses octets.');
   state.localOwned=true;state.localSHA=sha256;const source={noteId:document.noteId,documentId:tag!,assetId:file.id},value={kind:'local' as const,label:'Copie conservée sur cet appareil',name:file.name,mediaType:type(file.blob.type),size:file.blob.size,sha256,...(file.serverId?{serverId:file.serverId}:{}),source},id=`version-${notebookIdentityDigest(JSON.stringify(value))}`;state.candidates.set(id,Object.freeze({id,...value,source:Object.freeze(source)}));
  }catch(error){check(current);unavailable.push({kind:'local',message:error instanceof Error?error.message:'Le fichier local ne peut pas être vérifié.'});}
 }
 const floating=document.objects.filter(row=>row.kind==='image'&&row.assetId===asset.id).length,inline=document.objects.reduce((sum,row)=>sum+((row.kind==='text'||row.kind==='sticky')?scanLegacyPaperImages(row.markdown??'').images.filter(image=>image.photo&&state.allowed.get(image.photo.documentId)?.has(image.photo.id)).length:0),0);
 const id=notebookIdentityDigest(JSON.stringify({scope,document,asset,file:blobState(file),localSHA:state.localSHA,drafts:state.drafts.map(row=>plainDraft(row.expected)),snapshots:state.snapshots,candidates:[...state.candidates.values()]}));
 const reason:PaperImageRepairPlan['reason']=input.historicalSource?'historical-source':!file?'missing-file':!state.localOwned?'unproved-file':asset.serverId&&file.serverId!==asset.serverId?'server-mismatch':asset.size>0&&asset.size!==file.blob.size?'size-mismatch':'explicit-version';
 const plan:PaperImageRepairPlan=Object.freeze({schema:1,id,noteId:document.noteId,documentId,asset:Object.freeze({...asset}),reason,candidates:Object.freeze([...state.candidates.values()]),unavailable:Object.freeze(unavailable.map(row=>Object.freeze(row))),references:Object.freeze({floating,inline})});states.set(plan,state);return plan;
}

/** A download remains in RAM and is bound to the captured account/source. No candidate is chosen implicitly. */
export async function loadPaperImageRepairVersion(plan:PaperImageRepairPlan,versionId:string,input:{current:()=>boolean;downloadOriginal?:(need:LegacyImageDownloadNeed)=>Promise<Blob>}):Promise<PaperImageRepairVersion>{
 const state=stateFor(plan),candidate=state.candidates.get(versionId);if(!candidate)throw Error('Choisissez explicitement une version prouvée de cette image.');await assertCurrent(state,input.current);
 let original:Blob;
 if(candidate.kind==='local'){if(!state.localOwned||!state.file)throw Error('Ce fichier local ne possède pas un propriétaire prouvé.');original=state.file.blob;}
 else {if(!input.downloadOriginal)throw Error('Connectez cet appareil pour charger cette version originale avant de la choisir.');original=await input.downloadOriginal({...state.scope,...candidate.source,serverId:candidate.serverId,name:candidate.name,mediaType:candidate.mediaType,...(candidate.size?{size:candidate.size}:{}),...(candidate.sha256?{sha256:candidate.sha256}:{})});}
 check(input.current);if(!(original instanceof Blob))throw Error('Cette version ne possède pas un original binaire valide.');const servedType=type(original.type.split(';')[0].trim());if(servedType&&servedType!=='application/octet-stream'&&servedType!==candidate.mediaType)throw Error('Le type de cette version ne correspond pas à son manifeste.');
 const blob=new Blob([original],{type:candidate.mediaType}),bytes=new Uint8Array(await blob.arrayBuffer());check(input.current);validateLegacyRasterBytes(bytes,candidate.mediaType);
 if(candidate.size&&candidate.size!==blob.size)throw Error('La taille de cette version ne correspond pas à son manifeste.');const sha256=await localBlobDigest(blob);check(input.current);if(candidate.sha256&&candidate.sha256!==sha256)throw Error('L’empreinte de cette version ne correspond pas à son manifeste.');await assertCurrent(state,input.current);
 const version:PaperImageRepairVersion=Object.freeze({planId:plan.id,versionId,sha256,size:blob.size,mediaType:candidate.mediaType,blob});versions.set(version,{plan,candidate,blob,sha256});return version;
}

/** Plan a new owned UUID copy, its references, metadata and recovery receipts under a single transaction. */
export async function preparePaperImageRepair(input:{plan:PaperImageRepairPlan;version:PaperImageRepairVersion;current:()=>boolean;newId?:()=>string;now?:string}):Promise<PreparedPaperImageRepair>{
 const {plan,version,current}=input,state=stateFor(plan),loaded=versions.get(version);check(current);
 if(!loaded||loaded.plan!==plan||version.planId!==plan.id||!state.candidates.has(version.versionId))throw Error('La version choisie doit être chargée depuis ce diagnostic avant la réparation.');await assertCurrent(state,current);
 const id=(input.newId??(()=>crypto.randomUUID()))(),files=await listLocalBlobs(state.scope.accountId,state.scope.spaceId);check(current);
 if(!safeId(id)||state.document.assets.some(asset=>asset.id===id)||files.some(file=>file.id===id))throw Error('La réparation nécessite une nouvelle identité libre. Aucun fichier n’est remplacé.');
 const now=input.now??new Date().toISOString();if(!Number.isFinite(Date.parse(now)))throw Error('La date de réparation est incompatible.');
 const asset:PaperAsset={id,name:loaded.candidate.name,mediaType:loaded.candidate.mediaType,size:loaded.blob.size},url=photoReference(plan.documentId,id),commands:PaperCommand[]=[{type:'add-asset',asset}],changedObjects:string[]=[];
 for(const object of state.document.objects){
  if(object.kind==='image'&&object.assetId===plan.asset.id){commands.push({type:'patch-object',id:object.id,patch:{assetId:id}});changedObjects.push(object.id);}
  else if(object.kind==='text'||object.kind==='sticky'){const before=object.markdown??'',result=replacements(before,state,url);if(result.markdown===before)continue;
   const textFlow=object.textFlow?{...object.textFlow,source:'',sourceOffsets:object.textFlow.sourceOffsets?remapOffsets(object.textFlow.sourceOffsets,before.length,result.markdown.length,result.edits):undefined}:undefined;
   commands.push({type:'patch-object',id:object.id,patch:{markdown:result.markdown,...(object.textFlow?{textFlow}:{})}});changedObjects.push(object.id);
  }
 }
 if(!changedObjects.length)throw Error('Cette image n’a plus de référence active à réparer. Les originaux restent conservés.');
 const usedElsewhere=state.document.pages.some(page=>page.pdf?.assetId===plan.asset.id)||state.document.audio.some(audio=>audio.assetId===plan.asset.id||audio.source?.chunks.some(chunk=>chunk.assetId===plan.asset.id)||audio.segments?.some(segment=>segment.assetId===plan.asset.id||segment.source?.chunks.some(chunk=>chunk.assetId===plan.asset.id)));
 if(usedElsewhere)throw Error('Cet original est aussi utilisé par un PDF ou une piste audio. Ces usages doivent être départagés avant de réparer son image.');
 const applied=applyPaperCommand(state.document,{type:'batch',commands},now),active={...applied,assets:applied.assets.filter(asset=>asset.id!==plan.asset.id)};
 // Retire only the replaced descriptor from the active manifest. Keeping a wrong server pointer there
 // would make the strict legacy bridge reject reopening even when no rendered image uses it anymore.
 // Its exact identity/descriptor is retained in the immutable before graph and repair receipt.
 if(!isPaperDocument(active)||active.objects.some(object=>object.kind==='image'&&object.assetId===plan.asset.id)||active.objects.some(object=>(object.kind==='text'||object.kind==='sticky')&&replacements(object.markdown??'',state,url).count))throw Error('Cet original possède encore une référence active. La réparation ne modifie aucun fichier.');
 const next=amendPaperCollaboration(state.document,active,JSON.stringify([state.scope.accountId,state.scope.spaceId,state.document.noteId]));
 const draft:Draft={...state.stored,content:next,updatedAt:Date.parse(now),syncState:'local'};let metadataDraft:Draft|undefined,metadataChange:PreparedPaperImageRepair['metadataChange'];
 if(state.metadata&&record(state.metadata.content)&&typeof state.metadata.content.markdown==='string'){const markdown=replacements(state.metadata.content.markdown,state,url).markdown;if(markdown!==state.metadata.content.markdown){metadataDraft={...state.metadata,content:{...state.metadata.content,markdown},updatedAt:Date.parse(now),syncState:'local',paperDependency:plan.documentId};metadataChange={beforeMarkdown:state.metadata.content.markdown,afterMarkdown:markdown};}}
 const receiptKey=`paper-image-repair|${notebookIdentityDigest(JSON.stringify([state.scope.accountId,state.scope.spaceId,plan.noteId]))}|${id}`,historyKey=`paper-history|${state.scope.accountId}|${state.scope.spaceId}|whiteboard|${plan.documentId}|${String(state.document.revision).padStart(12,'0')}`;
 const [existingReceipt,history]=await Promise.all([getSnapshot(receiptKey),getSnapshot(historyKey)]);check(current);if(existingReceipt)throw Error('Un autre reçu utilise cette identité. Aucun original n’est remplacé.');
 const historyMatches=!!history&&history.accountId===state.scope.accountId&&history.spaceId===state.scope.spaceId&&equal(history.value,state.document),beforeHistoryKey=history&&!historyMatches?`${historyKey}|image-repair-${id}`:historyKey;
 if(beforeHistoryKey!==historyKey&&await getSnapshot(beforeHistoryKey))throw Error('Une autre version utilise cette identité historique.');check(current);
 const sourceClaims=state.snapshots.flatMap(({expected:row})=>{const value=row?.value;if(!row||!record(value)||row.key!==ownerKey(state.scope,plan.noteId))return [];return [{key:row.key,...state.scope,value:{schema:1,noteId:value.noteId,documentId:value.documentId,boardId:value.boardId,claimedAt:value.claimedAt}}];});
 const value:PaperImageRepairReceipt={schema:1,kind:'paper-image-repair',noteId:plan.noteId,documentId:plan.documentId,planId:plan.id,originalAsset:{...plan.asset},...(state.file?{retainedFile:{id:state.file.id,ownership:state.localOwned?'proved':'unproved',...(state.localOwned?{serverId:state.file.serverId,sha256:state.localSHA}:{})}}:{}),chosen:{...loaded.candidate,sha256:loaded.sha256,size:loaded.blob.size},copy:{assetId:id,sha256:loaded.sha256,size:loaded.blob.size,mediaType:asset.mediaType},sourceDrafts:state.ownedSources.map(row=>structuredClone(row)),sourceClaims,beforeHistoryKey,changedObjects,...(state.metadata?{originalMetadata:structuredClone(state.metadata)}:{}),repairedAt:now};
 const receipt:Snapshot={key:receiptKey,...state.scope,value};
 const commit:NotebookTransferCommit={target:state.scope,sources:[state.scope],drafts:[draft,...(metadataDraft?[metadataDraft]:[])],blobs:[{...state.scope,id,documentId:plan.documentId,blob:loaded.blob,name:asset.name,createdAt:Date.parse(now),status:'pending',removedFromNote:false,revision:1,sha256:loaded.sha256}],snapshots:[receipt,...(!historyMatches?[{key:beforeHistoryKey,...state.scope,value:state.document}]:[])],draftChecks:state.drafts,blobChecks:[{identity:{...state.scope,id:plan.asset.id},expected:state.file},{identity:{...state.scope,id},expected:undefined}],snapshotChecks:[...state.snapshots,{key:receiptKey,expected:undefined},{key:historyKey,expected:history},...(beforeHistoryKey!==historyKey?[{key:beforeHistoryKey,expected:undefined}]:[])]};
 return {draft,...(metadataDraft?{metadataDraft,metadataChange}:{}),asset,url,receipt,commit};
}
export async function repairPaperImage(input:Parameters<typeof preparePaperImageRepair>[0]):Promise<PreparedPaperImageRepair>{const prepared=await preparePaperImageRepair(input);check(input.current);await commitNotebookTransfer(prepared.commit,input.current);return prepared;}
