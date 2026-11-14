import {normalizeNotebookIdentities} from './paperIdentity';
import {commitNotebookTransfer,listDrafts,listLocalBlobs,listSnapshots,localBlobDigest,type Draft,type LocalBlob,type Snapshot,type NotebookTransferCommit} from '../../pwa/src/storage';
import {isPaperDocument,migratePaper,notebookDocumentId,type PaperDocument} from './notebookDocument';
import {amendPaperCollaboration,mergePaperCollaboration} from './paperCollaboration';
import {isNotebookLibrary,LIBRARY_DOCUMENT_ID,type NotebookLibrary} from './notebookLibrary';
import {mergeNotebookLibrary,amendNotebookLibrary} from './notebookLibraryCollaboration';
import {noteBoardId,parsePhotoReference,photoReference} from './notebook';
import type {NotebookMediaScope} from '../components/NotebookEditor';

export interface TransferNote {id:string;title:string;markdown:string;createdAt?:string;updatedAt?:string}
interface Binding {schema:1;target:{accountId:string;spaceId:string};assets:Record<string,string>;fingerprints:Record<string,string>}
export interface NotebookScopeTransferInput {
 profileId:string;localSpaceId:string;target:NotebookMediaScope;notes:TransferNote[];
 mode?:'cloud'|'local-alias';seedPlainNotes?:boolean;recoverOnly?:boolean;legacyDocuments?:{id:string;content:unknown}[];current:()=>boolean;
}
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const scopeId=(scope:{accountId:string;spaceId:string})=>`${scope.accountId}|${scope.spaceId}`;
const documentKey=(draft:Pick<Draft,'accountId'|'spaceId'|'type'|'documentId'>)=>`${scopeId(draft)}|${draft.type}|${draft.documentId}`;
const validId=(id:string)=>typeof id==='string'&&/^[A-Za-z0-9._-]{1,200}$/.test(id);
const fingerprint=(content:unknown)=>localBlobDigest(new Blob([JSON.stringify(content)]));
function remapPaper(source:PaperDocument,assets:Map<string,{id:string;serverId?:string}>):PaperDocument{
 const replacement={...source,assets:source.assets.map(asset=>({...asset,id:assets.get(asset.id)?.id??asset.id,serverId:assets.get(asset.id)?.serverId})),
  pages:source.pages.map(page=>page.pdf?{...page,pdf:{...page.pdf,assetId:assets.get(page.pdf.assetId)?.id??page.pdf.assetId}}:page),
  audio:source.audio.map(audio=>({...audio,assetId:assets.get(audio.assetId)?.id??audio.assetId,...(audio.source?{source:{...audio.source,chunks:audio.source.chunks.map(chunk=>({...chunk,assetId:assets.get(chunk.assetId)?.id??chunk.assetId}))}}:{}),...(audio.segments?{segments:audio.segments.map(part=>({...part,assetId:assets.get(part.assetId)?.id??part.assetId,...(part.source?{source:{...part.source,chunks:part.source.chunks.map(chunk=>({...chunk,assetId:assets.get(chunk.assetId)?.id??chunk.assetId}))}}:{})}))}:{})})),
  objects:source.objects.map(object=>({...object,...(object.assetId?{assetId:assets.get(object.assetId)?.id??object.assetId}:{}),...(object.markdown!==undefined?{markdown:object.markdown.replace(/dowze-photo:[^\s)]+/g,reference=>{const ref=parsePhotoReference(reference),mapped=ref&&assets.get(ref.id);return mapped?photoReference(notebookDocumentId(source.noteId),mapped.id):reference;})}:{})}))};
 return amendPaperCollaboration(source,replacement);
}

/** Local copies are retained; no data is queued for another owner or another year. */
export async function transferNotebookScope(input:NotebookScopeTransferInput){
 const {profileId,localSpaceId,target,current}=input,mode=input.mode??'cloud';
 if(!validId(profileId)||!validId(localSpaceId)||!validId(target.accountId)||!validId(target.spaceId))throw Error('Identité du carnet invalide.');
 if(mode==='local-alias'&&(target.accountId!==`local-${profileId}`||target.spaceId!==localSpaceId))throw Error('Normalisation locale hors du profil refusée.');
 const primary={accountId:`local-${profileId}`,spaceId:localSpaceId};
 const sources=[primary,{accountId:profileId,spaceId:localSpaceId}].filter(scope=>scopeId(scope)!==scopeId(target));
 const bindingKey=`paper-transfer-binding|${scopeId(primary)}|${mode}`;
 const originalPrimarySnapshots=await listSnapshots(primary.accountId,primary.spaceId),bindingRow=originalPrimarySnapshots.find(row=>row.key===bindingKey);
 const binding=bindingRow?.value as Binding|undefined;
 if(binding&&(binding.schema!==1||!binding.target||!binding.assets||!binding.fingerprints))throw Error('Journal de transfert incompatible. Il reste conservé.');
 if(binding&&!equal(binding.target,{accountId:target.accountId,spaceId:target.spaceId}))return {copied:0,conflicts:0,sourceMaySeedMetadata:false};
 if(!current())throw Error('La connexion a changé.');
 await normalizeNotebookIdentities(target,current);for(const sourceScope of sources)await normalizeNotebookIdentities(sourceScope,current);
 const targetDrafts=await listDrafts(target.accountId,target.spaceId),targetBlobs=await listLocalBlobs(target.accountId,target.spaceId),targetSnapshots=await listSnapshots(target.accountId,target.spaceId);
 const sourceRows=await Promise.all(sources.map(async scope=>({scope,drafts:await listDrafts(scope.accountId,scope.spaceId),blobs:await listLocalBlobs(scope.accountId,scope.spaceId),snapshots:await listSnapshots(scope.accountId,scope.spaceId)})));
 const plan:NotebookTransferCommit={target,sources:[primary,...sources],drafts:[],blobs:[],snapshots:[],draftChecks:[],blobChecks:[],snapshotChecks:[{key:bindingKey,expected:bindingRow}]};
 const receiptId=crypto.randomUUID(),nextBinding:Binding={schema:1,target:{accountId:target.accountId,spaceId:target.spaceId},assets:{...binding?.assets},fingerprints:{...binding?.fingerprints}};
 const checkedBlobs=new Set<string>(),checkedDrafts=new Set<string>();let conflicts=0,copied=0;
 const checkBlob=(identity:Pick<LocalBlob,'accountId'|'spaceId'|'id'>,expected:LocalBlob|undefined)=>{const key=scopeId(identity)+'|'+identity.id;if(!checkedBlobs.has(key)){checkedBlobs.add(key);plan.blobChecks.push({identity,expected});}};
 const checkDraft=(identity:Draft,expected:Draft|undefined)=>{const key=documentKey(identity);if(!checkedDrafts.has(key)){checkedDrafts.add(key);plan.draftChecks.push({identity,expected});}};
 const mapBlob=async(scope:{accountId:string;spaceId:string},id:string,blob:LocalBlob,sourceExpected:LocalBlob|null|undefined=blob,publishable=true)=>{
  checkBlob({...scope,id},sourceExpected??undefined);const key=scopeId(scope)+'|'+id,sha=await localBlobDigest(blob.blob);let mapped=nextBinding.assets[key]??id;
  let existing=targetBlobs.find(b=>b.id===mapped)??plan.blobs.find(b=>b.id===mapped);
  if(existing&&(existing.sha256??await localBlobDigest(existing.blob))!==sha){mapped=`import-${sha.slice(0,32)}-${(await fingerprint(key)).slice(0,16)}`;existing=targetBlobs.find(b=>b.id===mapped)??plan.blobs.find(b=>b.id===mapped);if(existing&&(existing.sha256??await localBlobDigest(existing.blob))!==sha)throw Error('Une identité de fichier doit être départagée. Les originaux sont conservés.');}
  nextBinding.assets[key]=mapped;checkBlob({accountId:target.accountId,spaceId:target.spaceId,id:mapped},targetBlobs.find(b=>b.id===mapped));
  if(!existing)plan.blobs.push({...blob,id:mapped,accountId:target.accountId,spaceId:target.spaceId,sha256:sha,revision:1,status:'pending',serverId:undefined,...(publishable?{removedFromNote:false}:{})});else if(publishable){const planned=plan.blobs.find(b=>b.id===mapped);if(planned)planned.removedFromNote=false;}
  return {id:mapped,serverId:existing?.status==='uploaded'?existing.serverId:undefined};
 };
 const mapDocument=async(document:PaperDocument,scope:{accountId:string;spaceId:string})=>{
  const row=sourceRows.find(r=>scopeId(r.scope)===scopeId(scope)),assets=new Map<string,{id:string;serverId?:string}>();
  for(const asset of document.assets){let blob=row?.blobs.find(b=>b.id===asset.id);const original=blob;
   if(!blob&&mode==='cloud'&&asset.serverId&&target.api){const downloaded=await target.api.downloadBlob(target.spaceId,asset.serverId);if(!current())throw Error('La connexion a changé pendant la récupération d’un fichier.');blob={...scope,id:asset.id,blob:new Blob([downloaded],{type:asset.mediaType}),name:asset.name,createdAt:Date.now(),status:'pending'};}
   if(!blob){if(mode==='local-alias'&&asset.serverId){assets.set(asset.id,{id:asset.id,serverId:asset.serverId});continue;}throw Error(`Le fichier « ${asset.name} » doit être retrouvé avant de relier ce carnet. La note locale reste disponible.`);}
   assets.set(asset.id,await mapBlob(scope,asset.id,blob,original??null));
  }
  return remapPaper(document,assets);
 };
 const mapRecovery=async(value:unknown,scope:{accountId:string;spaceId:string}):Promise<unknown>=>{
  if(isPaperDocument(value))return mapDocument(value,scope);
  if(!value||typeof value!=='object'||isNotebookLibrary(value))return value;if(value instanceof Blob||value instanceof Date||value instanceof ArrayBuffer||ArrayBuffer.isView(value))return structuredClone(value);
  if(Array.isArray(value)){const result:unknown[]=[];for(const row of value)result.push(await mapRecovery(row,scope));return result;}
  const result:Record<string,unknown>=Object.create(null);for(const [name,item] of Object.entries(value))result[name]=await mapRecovery(item,scope);return result;
 };
 for(const row of sourceRows)for(const draft of row.drafts)if(draft.type==='whiteboard'&&draft.documentId.startsWith('paper-v3-')&&(!isPaperDocument(draft.content)||!draft.identityAlias&&draft.documentId!==notebookDocumentId(draft.content.noteId)))throw Error('Une note locale utilise un format incompatible. Son original reste conservé.');
 const candidates:{scope:{accountId:string;spaceId:string};draft:Draft;original?:Draft}[]=[];
 for(const row of sourceRows)for(const draft of row.drafts)if(!draft.identityAlias&&(isPaperDocument(draft.content)||draft.type==='preferences'&&draft.documentId===LIBRARY_DOCUMENT_ID))candidates.push({scope:row.scope,draft,original:draft});
 const knownNotes=new Set(candidates.filter(c=>isPaperDocument(c.draft.content)).map(c=>(c.draft.content as PaperDocument).noteId));
 for(const note of input.notes){if(knownNotes.has(note.id))continue;
  let selected:typeof sourceRows[number]|undefined,legacy:Draft|undefined;
  for(const row of sourceRows){legacy=row.drafts.find(d=>d.type==='whiteboard'&&d.documentId===noteBoardId(note.id));if(legacy){selected=row;break;}}
  const shared=input.legacyDocuments?.find(d=>d.id===noteBoardId(note.id));if(input.seedPlainNotes===false&&!legacy&&!shared)continue;const scope=selected?.scope??sources[0]??primary;
  const content=migratePaper(note.id,note.markdown,legacy?.content??shared?.content,note.createdAt??note.updatedAt??(legacy?new Date(legacy.updatedAt).toISOString():'1970-01-01T00:00:00Z'));
  candidates.push({scope,draft:{...scope,type:'whiteboard',documentId:notebookDocumentId(note.id),title:note.title,content,baseVersion:0,updatedAt:Date.now(),syncState:'local'}});
  if(legacy)checkDraft(legacy,legacy);
 }
 const chosen=new Set<string>();
 for(const candidate of candidates){
  if(!current())throw Error('La connexion a changé pendant la préparation des notes.');
  const {scope,draft,original}=candidate,sourceKey=documentKey(draft),hash=await fingerprint(draft.content);
  if(original)checkDraft(original,original);
  if(binding?.fingerprints[sourceKey]===hash)continue;
  const source=sourceRows.find(row=>scopeId(row.scope)===scopeId(scope));let content=draft.content;
  if(isPaperDocument(content))content=await mapDocument(content,scope);
  else if(!isNotebookLibrary(content))throw Error('Le classement local est incompatible. Son original reste conservé.');
  const identity={...draft,accountId:target.accountId,spaceId:target.spaceId},destination=targetDrafts.find(d=>d.type===draft.type&&d.documentId===draft.documentId),destinationKey=`${draft.type}|${draft.documentId}`;
  plan.snapshots.push({key:`paper-resolution|${documentKey(identity)}|transfer-${receiptId}-${copied}`,accountId:target.accountId,spaceId:target.spaceId,value:{durable:destination,visibleContent:content,source:original??draft,sourceScope:scope}});
  nextBinding.fingerprints[sourceKey]=hash;
  if(chosen.has(destinationKey)){copied++;continue;}chosen.add(destinationKey);checkDraft(identity,destination);
  if(input.recoverOnly||destination&&mode==='local-alias'){copied++;continue;}
  let next:Draft={...identity,content,baseVersion:destination?.baseVersion??0,updatedAt:Date.now(),syncState:'local',conflict:undefined};
  if(destination){
   const merged=isPaperDocument(content)&&isPaperDocument(destination.content)?mergePaperCollaboration(content,destination.content):isNotebookLibrary(content)&&isNotebookLibrary(destination.content)?mergeLibrariesForTransfer(content,destination.content,scopeId(target)):null;
   if(merged)next={...next,content:merged};
   else if(!equal(content,destination.content)){next={...next,syncState:'conflict',conflict:{serverVersion:destination.baseVersion,scopeTransfer:receiptId}};conflicts++;}
   else next=destination;
  }
  plan.drafts.push(next);copied++;
 }
 // Audio recovery chunks are not publishable attachments, but must follow the note's cache.
 for(const row of sourceRows)for(const snapshot of row.snapshots){
  if(!/^(paper-history|paper-migration|paper-resolution|audio-recording|audio-source-import)\|/.test(snapshot.key))continue;
  const snapshotFingerprint=await fingerprint(snapshot.value),snapshotSourceKey='snapshot|'+snapshot.key;if(binding?.fingerprints[snapshotSourceKey]===snapshotFingerprint)continue;nextBinding.fingerprints[snapshotSourceKey]=snapshotFingerprint;plan.snapshotChecks.push({key:snapshot.key,expected:snapshot});
  let value=await mapRecovery(snapshot.value,row.scope);
  if(snapshot.key.startsWith('audio-recording|')){const journal=value as {chunkIds?:string[];parts?:{assetId:string;chunkIds:string[]}[]};const mapping=new Map<string,string>();const mapAudio=async(id:string)=>{if(mapping.has(id))return mapping.get(id)!;const blob=row.blobs.find(b=>b.id===id);if(!blob)throw Error('Une partie de l’enregistrement reste à récupérer sur cet appareil.');const next=(await mapBlob(row.scope,id,blob,blob,false)).id;mapping.set(id,next);return next;};if(Array.isArray(journal.chunkIds)){const ids:string[]=[];for(const id of journal.chunkIds)ids.push(await mapAudio(id));journal.chunkIds=ids;};if(Array.isArray(journal.parts))for(const part of journal.parts){part.assetId=await mapAudio(part.assetId);const ids:string[]=[];for(const id of part.chunkIds)ids.push(await mapAudio(id));part.chunkIds=ids;}}
  if(snapshot.key.startsWith('audio-source-import|')){const receipt=value as {kind?:string;noteId?:string;track?:import('./notebookDocument').PaperAudio;status?:string};if(receipt.kind!=='paper-audio-source'||!receipt.noteId||!receipt.track?.source)throw Error('Une importation audio utilise un reçu incompatible.');const mapping=new Map<string,string>();for(const chunk of receipt.track.source.chunks){const blob=row.blobs.find(b=>b.id===chunk.assetId);if(!blob)throw Error('Une portion de l’original audio doit être retrouvée avant le transfert.');const mapped=(await mapBlob(row.scope,chunk.assetId,blob,blob,receipt.status==='attached')).id;mapping.set(chunk.assetId,mapped);chunk.assetId=mapped;}receipt.track.assetId=mapping.get(receipt.track.assetId)??receipt.track.assetId;const destinationKey=`audio-source-import|${JSON.stringify([target.accountId,target.spaceId,receipt.noteId,receipt.track.id])}`,existing=targetSnapshots.find(s=>s.key===destinationKey);if(existing&&!equal(existing.value,value)){plan.snapshots.push({key:`paper-transfer-audio-source-history|${scopeId(target)}|${receiptId}|${(await fingerprint(snapshot.key)).slice(0,16)}`,accountId:target.accountId,spaceId:target.spaceId,value});continue;}if(!existing)plan.snapshots.push({key:destinationKey,accountId:target.accountId,spaceId:target.spaceId,value});continue;}
  const prefix=snapshot.key.replace(`${row.scope.accountId}|${row.scope.spaceId}`,`${target.accountId}|${target.spaceId}`);let copyKey=prefix+`|transfer-${receiptId}`;
  if(snapshot.key.startsWith('audio-recording|')){const existing=targetSnapshots.find(s=>s.key===prefix);if(existing){const existingJournal=existing.value as {status?:string;chunkIds?:string[]},journal=value as {chunkIds?:string[]};if(existingJournal.status==='completed'&&journal.chunkIds?.every(id=>existingJournal.chunkIds?.includes(id)))copyKey=`paper-transfer-audio-history|${scopeId(target)}|${receiptId}|${(await fingerprint(snapshot.key)).slice(0,16)}`;else if(!equal(value,existing.value)){const alias='import-audio-'+(await fingerprint(row.scope)).slice(0,16)+'-'+String((value as {id:string}).id).slice(0,140);(value as {id:string}).id=alias;copyKey=prefix.slice(0,prefix.lastIndexOf('|')+1)+alias;}else continue;}else copyKey=prefix;}
  plan.snapshots.push({key:copyKey,accountId:target.accountId,spaceId:target.spaceId,value});
 }
 if(!plan.drafts.length&&!plan.blobs.length&&!plan.snapshots.length&&binding&&equal(binding,nextBinding)){if(!current())throw Error('La connexion a changé.');return {copied:0,conflicts:0,sourceMaySeedMetadata:true};}
 const receipt={schema:1,mode,sourceProfileId:profileId,localSpaceId,target:{accountId:target.accountId,spaceId:target.spaceId},copied,conflicts,at:new Date().toISOString()};
 plan.snapshots.push({key:bindingKey,...primary,value:nextBinding},{key:`paper-transfer-receipt|${scopeId(target)}|${receiptId}`,accountId:target.accountId,spaceId:target.spaceId,value:receipt});
 for(const snapshot of plan.snapshots)if(!plan.snapshotChecks.some(c=>c.key===snapshot.key))plan.snapshotChecks.push({key:snapshot.key,expected:targetSnapshots.find(row=>row.key===snapshot.key)});
 await commitNotebookTransfer(plan,current);return {copied,conflicts,sourceMaySeedMetadata:true};
}

/** Disjoint local/cloud folders can be joined; conflicting classifications remain explicit. */
function mergeLibrariesForTransfer(local:NotebookLibrary,remote:NotebookLibrary,scope:string){
 const sameLineage=mergeNotebookLibrary(local,remote);if(sameLineage)return sameLineage;
 const folders=[...remote.folders];for(const folder of local.folders){const old=folders.find(f=>f.id===folder.id);if(old&&!equal(old,folder))return null;if(!old)folders.push(folder);}
 const notes={...remote.notes};for(const [id,note] of Object.entries(local.notes)){if(notes[id]&&!equal(notes[id],note))return null;notes[id]=note;}
 const union={...remote,revision:Math.max(local.revision,remote.revision)+1,updatedAt:new Date().toISOString(),folders,notes};if(!isNotebookLibrary(union))return null;return amendNotebookLibrary(remote,union,scope);
}
