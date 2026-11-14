import {ensureNotebookIdentity} from '../lib/paperIdentity';
import {PAPER_SEARCH_DOCUMENT_CHANGED_EVENT} from '../lib/notebookSearchNavigation';
import {clearPaperSelections} from '../lib/paperClipboard';
import {retainRecordingHistory} from '../lib/paperRecordingHistory';
import {registerNotebookWriter} from '../lib/notebookSession';
import {createNotebookAcceptedWrite} from '../lib/notebookAcceptedWrite';
import {useEffect,useRef,useState} from 'react';
import {ApiError} from '../../pwa/src/api';
import {getDraft,getSnapshot,putSnapshot,savePaperDraft,resolvePaperDraft,commitNotebookTransfer,type Draft,type NotebookTransferCommit,NotebookTransferChangedError,notebookDeletionKey,readNotebookDeletionStatus} from '../../pwa/src/storage';
import {synchronizeSpace} from '../../pwa/src/sync';
import {continuousSync} from '../lib/continuousSync';
import {PaperLegacySourceChangedError} from '../lib/paperLegacyBridge';
import {amendPaperCollaboration,forgetPaperCollaboration,hasPaperCollaboration,mergePaperCollaboration,verifyPaperCollaboration,mergePaperTextChange} from '../lib/paperCollaboration';
import {capturePrivateNotebookResolution} from '../lib/paperPrivateResolution';
import {preparePaperResolution,type PaperConflictChoice} from '../lib/paperConflict';
import {applyPaperCommand,emptyPaperHistory,isPaperDocument,notebookDocumentId,recordPaperHistory,travelPaperHistory,type PaperCommand,type PaperDocument,type PaperObject} from '../lib/notebookDocument';
import type {NotebookMarkdownWriter,NotebookMediaScope} from '../components/NotebookEditor';
import type {LegacyImageDownloadNeed} from '../lib/paperLegacyImageAssets';

export function usePaperDocument(noteId:string,markdown:string,media:NotebookMediaScope,visible=true){
 const sourceMarkdown=useRef(markdown);sourceMarkdown.current=markdown;
 const sourceVersion=useRef({markdown,value:0});if(sourceVersion.current.markdown!==markdown)sourceVersion.current={markdown,value:sourceVersion.current.value+1};
 const initialOpening=useRef<{ticket:number;accessEpoch:number;scopeKey:string;markdown:string;sourceVersion:number;opening:Promise<void>;draft:Draft;document:PaperDocument;revision:number;postcondition:NotebookTransferCommit}|null>(null);
 const [legacyObserved,setLegacyObserved]=useState<{key:string;markdown:string}|null>(null),[reconciling,setReconciling]=useState(false);
 const [legacyReconcileEpoch,setLegacyReconcileEpoch]=useState(0);
 const selfMirrors=useRef<{key:string;generation:number;accessEpoch:number;expected:string;desired:string;lineage:string|undefined;receiptId:string;acknowledged:boolean;published:boolean}[]>([]);
 const [importGeneration,setImportGeneration]=useState(0);
 const [document,setDocument]=useState<PaperDocument|null>(null),[notice,setNotice]=useState(''),[blocked,setBlocked]=useState(false),[saved,setSaved]=useState(false);
 const [resolution,setResolution]=useState<{remote:PaperDocument|null;version:number;durable:Draft;alternatives?:{id:string;content:PaperDocument}[];selected?:string}|null>(null),[resolving,setResolving]=useState(false);
 const resolutionState=useRef(resolution);resolutionState.current=resolution;const resolutionOperation=useRef(0);
 const writable=useRef(true),opening=useRef(Promise.resolve());const persistenceFailure=useRef(false);
 const current=useRef<PaperDocument|null>(null),draft=useRef<Draft|null>(null),history=useRef(emptyPaperHistory()),tail=useRef(Promise.resolve()),alive=useRef(true),pending=useRef(0),generation=useRef(0);
 // Publication errors stay visible to whenSaved. Closing uses the independent
 // proof that this exact accepted tail was saved or preserved in recovery.
 const acceptedDurability=useRef(new WeakMap<Promise<unknown>,{flush:()=>Promise<void>;settled:()=>Promise<void>;pending:()=>boolean}>());
 const owner={accountId:media.accountId,spaceId:media.spaceId};
 const scope={...owner,type:'whiteboard' as const,documentId:notebookDocumentId(noteId)};
 const notifySearchIndex=()=>{if(typeof dispatchEvent==='function'&&typeof CustomEvent==='function')dispatchEvent(new CustomEvent(PAPER_SEARCH_DOCUMENT_CHANGED_EVENT,{detail:{...owner,noteId,documentId:scope.documentId}}));};
 const scopeKey=JSON.stringify([media.accountId,media.spaceId,noteId]);
 const renderedScope=useRef(scopeKey);renderedScope.current=scopeKey;
 const documentOwner=useRef(scopeKey);
 const accessEpoch=useRef({key:scopeKey,api:media.api,value:0});
 if(accessEpoch.current.key!==scopeKey||accessEpoch.current.api!==media.api)accessEpoch.current={key:scopeKey,api:media.api,value:accessEpoch.current.value+1};
 const acceptedEpoch=accessEpoch.current.value;
 const documentAccessEpoch=useRef(acceptedEpoch);
 // Detached controls must not start a new write; accepted writes still finish in their captured scope.
 const accepts=()=>alive.current&&accessEpoch.current.value===acceptedEpoch&&documentAccessEpoch.current===acceptedEpoch&&renderedScope.current===scopeKey&&documentOwner.current===scopeKey;
 const renderedApi=useRef(media.api);renderedApi.current=media.api;
 // The planner proves the manifest and retains all CAS checks before requesting bytes.
 // This callback has no cache writes: originals join the notebook's final transaction.
 const downloadOriginal=(valid:()=>boolean)=>{
  const api=media.api;if(!api)return undefined;
  return async(need:LegacyImageDownloadNeed)=>{
   const active=()=>valid()&&renderedScope.current===scopeKey&&renderedApi.current===api&&writable.current;
   if(!active()||need.accountId!==owner.accountId||need.spaceId!==owner.spaceId||!need.serverId)throw Error('La connexion ou la source de l’image a changé. Ses originaux restent conservés.');
   api.bindAccount(owner.accountId);
   let blob:Blob;
   try{blob=await api.downloadBlob(owner.spaceId,need.serverId);}catch(error){
    if(!active())throw Error('La connexion a changé pendant la récupération de l’image. Aucun fichier n’a été remplacé.');
    if(error instanceof TypeError||error instanceof ApiError&&error.status>=500)throw new Error('Les images d’origine attendent la connexion au serveur. Vos notes restent conservées ; leur ouverture reprendra au retour de la connexion.',{cause:error});
    if(error instanceof ApiError&&(error.status===401||error.status===403))throw new Error('Reconnectez-vous à Dowze pour retrouver les images de cette note. Ses originaux restent conservés.',{cause:error});
    throw error;
   }
   if(!active())throw Error('La connexion a changé pendant la récupération de l’image. Aucun fichier n’a été remplacé.');
   return blob;
  };
 };
 const retryOpen=()=>{if(writable.current&&!current.current&&!persistenceFailure.current&&renderedScope.current===scopeKey)setImportGeneration(value=>value+1);};
 useEffect(()=>{const online=()=>retryOpen();addEventListener('online',online);return()=>removeEventListener('online',online);},[scopeKey]);
 useEffect(()=>{const ready=(event:Event)=>{const d=(event as CustomEvent).detail;if(d?.accountId===media.accountId&&d?.spaceId===media.spaceId&&d?.noteId===noteId)setImportGeneration(v=>v+1);};addEventListener('dowze:paper-import-ready',ready);return()=>removeEventListener('dowze:paper-import-ready',ready);},[scopeKey]);
 useEffect(()=>{
  alive.current=true;documentOwner.current=scopeKey;documentAccessEpoch.current=acceptedEpoch;generation.current++;selfMirrors.current=[];const ticket=generation.current;tail.current=Promise.resolve();pending.current=0;let stopped=false;current.current=null;draft.current=null;history.current=emptyPaperHistory();setDocument(null);setBlocked(false);setSaved(false);setNotice('');setResolution(null);setResolving(false);setLegacyObserved(null);setReconciling(false);persistenceFailure.current=false;
  initialOpening.current=null;const openingSourceVersion=sourceVersion.current.value,openingMarkdown=sourceMarkdown.current;
  // Scope/API changes retire this attempt during render, before effect cleanup.
  // A later A→B→A render cannot reactivate its captured epoch.
  const api=media.api;
  const ownsOpening=()=>!stopped&&alive.current&&ticket===generation.current&&accessEpoch.current.value===acceptedEpoch&&renderedScope.current===scopeKey&&documentOwner.current===scopeKey&&renderedApi.current===api;
  const openOnce=async()=>{
   if(!ownsOpening())return;
   let existing=await ensureNotebookIdentity(noteId,owner,ownsOpening);
   if(!ownsOpening())return;
   if(!existing){
    // Query the server before migrating when connected: never replace a remote v3 note with a new local migration.
    if(api&&navigator.onLine){try{
     await synchronizeSpace(api,media.accountId,media.spaceId,ownsOpening);if(!ownsOpening())return;
     existing=await ensureNotebookIdentity(noteId,owner,ownsOpening);if(!ownsOpening())return;
    }catch(error){if(!ownsOpening())return;if(!(error instanceof TypeError)&&!(error instanceof ApiError&&error.status>=500))throw error;setNotice('Le serveur est temporairement inaccessible. Vous pouvez écrire sur cet appareil ; la synchronisation reprendra ensuite.');}}
   }
   if(!existing){
    const {migrateOwnedPaperNotebook}=await import('../lib/paperLegacyMigration');if(!ownsOpening())return;
    const source=sourceMarkdown.current;
    const valid=()=>ownsOpening()&&sourceMarkdown.current===source;
    existing=await migrateOwnedPaperNotebook(noteId,source,owner,valid,{downloadOriginal:downloadOriginal(valid)});if(!ownsOpening())return;
   }
   if(!existing)throw Error('La note doit être retrouvée avant son ouverture.');
   if(!isPaperDocument(existing.content)||existing.content.noteId!==noteId)throw Error('Format de note non pris en charge. L’original est conservé.');
   if(existing.identityAlias)throw Error('Cette identité de note a été remplacée. Son original reste conservé.');
   if(existing.staged){
    if(existing.archiveImport){const {activateNotebookArchive}=await import('../lib/importNotebookArchive');if(!ownsOpening())return;await activateNotebookArchive(noteId,media,ownsOpening);}
    else{const {activateNotebookDuplicate}=await import('../lib/duplicateNotebook');if(!ownsOpening())return;await activateNotebookDuplicate(noteId,media,ownsOpening);}
    if(!ownsOpening())return;const activated=await getDraft(scope);if(!ownsOpening())return;if(activated)existing=activated;
   }
   if(!isPaperDocument(existing.content)||existing.content.noteId!==noteId||existing.identityAlias)throw Error('La version enregistrée est incompatible.');
   if(!hasPaperCollaboration(existing.content)&&existing.syncState!=='conflict'){
    const original=existing.content,seed=amendPaperCollaboration(original,{...original,revision:original.revision+1,updatedAt:new Date().toISOString()});
    // Seeding is itself a checked publication. A colliding ACK restarts the
    // complete opening; quota/IO never become permission to replay an old plan.
    const deletionKey=notebookDeletionKey(scope),deletionRow=await getSnapshot(deletionKey);if(!ownsOpening())return;
    if(await readNotebookDeletionStatus(noteId,owner,ownsOpening))throw Error('Cette note a été supprimée. Ses sources restent conservées sans recréation automatique.');if(!ownsOpening())return;
    const historyKey=`paper-history|${owner.accountId}|${owner.spaceId}|whiteboard|${scope.documentId}|${String(original.revision).padStart(12,'0')}`,historyRow=await getSnapshot(historyKey);if(!ownsOpening())return;
    const historyChecks:NotebookTransferCommit['snapshotChecks']=[{key:deletionKey,expected:deletionRow},{key:historyKey,expected:historyRow}],seedHistory:NotebookTransferCommit['snapshots']=[];
    if(!historyRow)seedHistory.push({key:historyKey,...owner,value:original});
    else if(historyRow.accountId!==owner.accountId||historyRow.spaceId!==owner.spaceId||JSON.stringify(historyRow.value)!==JSON.stringify(original)){
     const recoveryKey=`paper-seed-recovery|${owner.accountId}|${owner.spaceId}|whiteboard|${scope.documentId}|${crypto.randomUUID()}`;
     seedHistory.push({key:recoveryKey,...owner,value:original});historyChecks.push({key:recoveryKey,expected:undefined});
    }
    await commitNotebookTransfer({target:owner,sources:[owner],drafts:[{...existing,content:seed,syncState:'local'}],blobs:[],snapshots:seedHistory,draftChecks:[{identity:scope,expected:existing}],blobChecks:[],snapshotChecks:historyChecks},ownsOpening);
    if(!ownsOpening())return;const seeded=await getDraft(scope);if(!ownsOpening())return;if(!seeded||!isPaperDocument(seeded.content))throw Error('L’historique collaboratif n’a pas pu être conservé.');existing=seeded;
   }
   if(!isPaperDocument(existing.content)||existing.content.noteId!==noteId||existing.identityAlias)throw Error('La version enregistrée de la note est incompatible.');
   if(hasPaperCollaboration(existing.content))verifyPaperCollaboration(existing.content);
   let observedOpening:{markdown:string;postcondition:NotebookTransferCommit}|undefined;
   if(existing.syncState!=='conflict'){
    const {reconcilePaperLegacy}=await import('../lib/paperLegacyBridge');if(!ownsOpening())return;const incoming=sourceMarkdown.current;
    const valid=()=>ownsOpening()&&sourceMarkdown.current===incoming;
    const result=await reconcilePaperLegacy({noteId,scope:owner,incomingMarkdown:incoming,current:valid,downloadOriginal:downloadOriginal(valid),retryTransport:false,capturePostcondition:importGeneration===0&&legacyReconcileEpoch===0&&openingSourceVersion===sourceVersion.current.value});
    if(!ownsOpening())return;existing=result.draft;if(result.postcondition)observedOpening={markdown:incoming,postcondition:result.postcondition};setLegacyObserved({key:scopeKey,markdown:incoming});if(result.notices.length)setNotice(result.notices.join(' '));
   }
   if(!ownsOpening())return;
   if(!isPaperDocument(existing.content)||existing.content.noteId!==noteId||existing.identityAlias)throw Error('La note conservée est incompatible.');
   if(hasPaperCollaboration(existing.content))verifyPaperCollaboration(existing.content);
   draft.current=existing;current.current=existing.content;setDocument(existing.content);setBlocked(existing.syncState==='conflict');setSaved(true);
   if(observedOpening&&importGeneration===0&&legacyReconcileEpoch===0&&openingSourceVersion===sourceVersion.current.value&&openingMarkdown===observedOpening.markdown)initialOpening.current={ticket,accessEpoch:acceptedEpoch,scopeKey,markdown:observedOpening.markdown,sourceVersion:openingSourceVersion,opening:opening.current,draft:existing,document:existing.content,revision:existing.content.revision,postcondition:observedOpening.postcondition};
   if(existing.syncState==='conflict')setNotice('Deux versions de la note nécessitent une résolution dans la synchronisation.');
  };
  const open=async()=>{for(let attempt=0;attempt<3;attempt++){
   const source=sourceMarkdown.current;
   try{await openOnce();return;}catch(error){
    if(!ownsOpening())return;
    const freshSource=error instanceof PaperLegacySourceChangedError&&sourceMarkdown.current!==source;
    if(attempt===2||!(error instanceof NotebookTransferChangedError)&&!freshSource)throw error;
   }
  }};
  opening.current=open().catch(error=>{if(ownsOpening()){setBlocked(true);setNotice(String(error instanceof Error?error.message:error));}});
  return()=>{stopped=true;alive.current=false;forgetPaperCollaboration(scopeKey);};
 },[scopeKey,importGeneration,media.api]);
 useEffect(()=>{let registered=true;const owns=()=>registered&&renderedScope.current===scopeKey&&documentOwner.current===scopeKey;
  const unregister=registerNotebookWriter(media.accountId,{
   flush:()=>{if(!owns())return;dispatchEvent(new CustomEvent('dowze:paper-flush',{detail:{prefix:`${noteId}-`}}));return acceptedDurability.current.get(tail.current)?.flush();},
   settled:async()=>{if(!owns())return;await opening.current;if(owns()){const captured=tail.current,proof=acceptedDurability.current.get(captured);await(proof?proof.settled():captured);}},readyForPublication:()=>tail.current,pending:()=>owns()&&(pending.current>0||persistenceFailure.current&&(acceptedDurability.current.get(tail.current)?.pending()??true)),suspend:()=>{if(owns())writable.current=false;},resume:()=>{if(owns())writable.current=true;},dispose:()=>{forgetPaperCollaboration(scopeKey);clearPaperSelections(media.accountId);}
  });return()=>{registered=false;unregister();};
 },[scopeKey]);
 useEffect(()=>{
  if(!visible)return;let stopped=false;
  const refresh=async()=>{
   if(!writable.current)return;dispatchEvent(new CustomEvent('dowze:paper-flush',{detail:{prefix:`${noteId}-`}}));await tail.current;if(stopped)return;
   if(media.api)await synchronizeSpace(media.api,media.accountId,media.spaceId,()=>!stopped&&writable.current);
   let latest=await ensureNotebookIdentity(noteId,owner,()=>!stopped&&writable.current);if(stopped||pending.current||persistenceFailure.current||!latest)return;
   if(latest.syncState!=='conflict'){
    const {reconcilePaperLegacy}=await import('../lib/paperLegacyBridge');const incoming=sourceMarkdown.current,baseline=current.current;
    const valid=()=>!stopped&&writable.current&&!pending.current&&sourceMarkdown.current===incoming&&current.current===baseline;
    let result:Awaited<ReturnType<typeof reconcilePaperLegacy>>;
    try{result=await reconcilePaperLegacy({noteId,scope:owner,incomingMarkdown:incoming,current:valid,downloadOriginal:downloadOriginal(valid)});}catch(error){if(!valid())return;throw error;}
    if(stopped||pending.current)return;latest=result.draft;setLegacyObserved({key:scopeKey,markdown:incoming});if(result.notices.length)setNotice(result.notices.join(' '));
   }
   if(!isPaperDocument(latest.content)||latest.content.noteId!==noteId)throw Error('La version reçue est incompatible ; la note locale est conservée.');
   if(hasPaperCollaboration(latest.content))verifyPaperCollaboration(latest.content);
   draft.current=latest;
   if(latest.syncState==='conflict'){setBlocked(true);setNotice('Cette note contient un conflit. Vos modifications sont conservées.');return;}
   setBlocked(false);
   if(current.current&&JSON.stringify(current.current)!==JSON.stringify(latest.content)){const changedRevision=current.current.revision!==latest.content.revision;current.current=latest.content;setDocument(latest.content);if(changedRevision)history.current=emptyPaperHistory();}
  };
  const sync=continuousSync(refresh,()=>{if(!stopped)setNotice('Note conservée sur cet appareil. Synchronisation en attente.');});
  const online=()=>sync.request(true);addEventListener('online',online);sync.request();
  return()=>{stopped=true;sync.stop();removeEventListener('online',online);};
 },[scopeKey,media.api,visible]);
 useEffect(()=>{
  const ticket=generation.current;let stopped=false;
  const initialAdmission=current.current===null&&legacyObserved===null&&importGeneration===0&&legacyReconcileEpoch===0?{opening:opening.current,sourceVersion:sourceVersion.current.value}:null;
  if(legacyObserved?.key===scopeKey&&legacyObserved.markdown===markdown)return;
  // Only the exact ordered echo of a staged, owner-scoped publication bypasses
  // legacy reconciliation. The canonical text may already contain newer typing;
  // its accepted writes remain behind this publication in the same durable tail.
  const echo=selfMirrors.current.find(proof=>!proof.acknowledged&&proof.key===scopeKey&&legacyObserved?.key===scopeKey&&proof.generation===ticket&&proof.accessEpoch===accessEpoch.current.value&&proof.expected===legacyObserved.markdown&&proof.desired===markdown&&proof.lineage===current.current?.collaboration?.lineage&&!!proof.receiptId);
  if(echo&&accepts()&&writable.current&&!persistenceFailure.current){echo.acknowledged=true;setLegacyObserved({key:scopeKey,markdown});return;}
  dispatchEvent(new CustomEvent('dowze:paper-flush',{detail:{prefix:`${noteId}-`}}));
  setReconciling(true);pending.current++;
  tail.current=tail.current.catch(()=>undefined).then(async()=>{
   await opening.current;if(stopped||ticket!==generation.current||!writable.current||persistenceFailure.current||!current.current)return;
   const proof=initialOpening.current;if(proof?.ticket===ticket)initialOpening.current=null;
   const sameOpening=()=>!!initialAdmission&&!!proof&&proof.ticket===ticket&&proof.accessEpoch===acceptedEpoch&&accepts()&&proof.scopeKey===scopeKey&&proof.markdown===markdown&&sourceMarkdown.current===markdown&&proof.sourceVersion===initialAdmission.sourceVersion&&sourceVersion.current.value===proof.sourceVersion&&opening.current===initialAdmission.opening&&proof.opening===initialAdmission.opening&&draft.current===proof.draft&&current.current===proof.document&&current.current.revision===proof.revision&&draft.current.syncState!=='conflict'&&!stopped&&writable.current&&!persistenceFailure.current;
   // Reuse only this exact initial observation. The same native whole-row CAS
   // still checks its committed drafts, files, receipts and deletion guards.
   if(proof&&sameOpening()){
    let checked=false;try{await commitNotebookTransfer(proof.postcondition,sameOpening);checked=true;}catch(error){if(!(error instanceof NotebookTransferChangedError))throw error;}
    if(checked&&sameOpening())return;
    if(stopped||ticket!==generation.current||!accepts()||renderedApi.current!==media.api||!writable.current||persistenceFailure.current||!current.current)return;
   }
   const {reconcilePaperLegacy}=await import('../lib/paperLegacyBridge'),baseline=current.current;
   const valid=()=>!stopped&&ticket===generation.current&&writable.current&&sourceMarkdown.current===markdown&&current.current===baseline;
   const result=await reconcilePaperLegacy({noteId,scope:owner,incomingMarkdown:markdown,current:valid,downloadOriginal:downloadOriginal(valid)});
   if(!valid())return;const latest=result.draft;if(!isPaperDocument(latest.content)||latest.content.noteId!==noteId)throw Error('La reprise de cette note doit être vérifiée.');
   draft.current=latest;if(JSON.stringify(current.current)!==JSON.stringify(latest.content)){current.current=latest.content;setDocument(latest.content);history.current=emptyPaperHistory();}
   setLegacyObserved({key:scopeKey,markdown});setSaved(true);if(result.notices.length)setNotice(result.notices.join(' '));
  }).catch(error=>{if(!stopped&&ticket===generation.current&&sourceMarkdown.current===markdown)setNotice(`${String(error instanceof Error?error.message:error)} Les deux sources restent conservées.`);}).finally(()=>{if(ticket===generation.current){pending.current--;setReconciling(false);}});
  return()=>{stopped=true;};
 },[scopeKey,markdown,legacyReconcileEpoch]);
 const persist=(next:PaperDocument)=>{
  const previous=current.current,existing=draft.current;if(!accepts()||!previous||!existing||blocked||!writable.current)return false;
  current.current=next;setDocument(next);setSaved(false);pending.current++;
  const ticket=generation.current;
  const nextDraft={...existing,content:next,updatedAt:Date.now(),syncState:'local' as const};
  // Accepted edits belong to their captured account and annual space, even
  // when this mounted hook opens another note before the queued write starts.
  const predecessor=tail.current,recovery={key:`paper-history|${scope.accountId}|${scope.spaceId}|whiteboard|${scope.documentId}|accepted-${crypto.randomUUID()}`,accountId:scope.accountId,spaceId:scope.spaceId,value:next};
  const active=()=>alive.current&&ticket===generation.current&&accessEpoch.current.value===acceptedEpoch&&renderedScope.current===scopeKey&&documentOwner.current===scopeKey;
  let unregister=()=>{},publicationError:unknown;
  const accepted=createNotebookAcceptedWrite({source:{...scope,generation:ticket,accessEpoch:acceptedEpoch},value:next,
   save:async()=>{
   await predecessor;
   let written=nextDraft;
   try{await savePaperDraft(nextDraft,previous.revision);}catch(error){
    let recovered=false;
    for(let attempt=0;attempt<3;attempt++){
     const latest=await getDraft(scope),visible=active()?current.current:next;
     if(!latest||latest.syncState==='conflict'||!visible||!isPaperDocument(latest.content)||!hasPaperCollaboration(visible))break;
     const merged=mergePaperCollaboration(visible,latest.content);if(!merged)break;
     if(merged.collaboration?.state===latest.content.collaboration?.state){written=latest as typeof nextDraft;recovered=true;break;}
     try{written=await resolvePaperDraft(latest,visible,null,latest.baseVersion,merged,crypto.randomUUID()) as typeof nextDraft;recovered=true;break;}catch{ /* A concurrent writer owns the new revision; reread before retrying. */ }
    }
    if(!recovered)throw error;
   }
   notifySearchIndex();
   if(active()){draft.current=written;if(written!==nextDraft){current.current=written.content as PaperDocument;setDocument(written.content as PaperDocument);history.current=emptyPaperHistory();setNotice('Modifications des appareils réunies.');}}
   },
   // After a failed canonical write, every retry only preserves this stable
   // original-scope branch. It never resurrects a deleted/conflicting draft.
   preserve:()=>putSnapshot(recovery),
   onCanonicalFailure:error=>{publicationError=error;if(active()){persistenceFailure.current=true;setBlocked(true);setSaved(false);setNotice(`${String(error instanceof Error?error.message:error)} Votre version reste visible ; sa récupération attend une confirmation.`);}},
   onFailure:()=>{if(active())setNotice(`${String(publicationError instanceof Error?publicationError.message:publicationError)} Le stockage et la récupération sont indisponibles. Votre version reste retenue ; la fermeture est refusée tant qu’elle n’est pas conservée.`);},
   onDurable:kind=>{if(active()){pending.current=Math.max(0,pending.current-1);if(kind==='canonical'&&pending.current===0&&!persistenceFailure.current)setSaved(true);if(kind==='recovery')setNotice(`${String(publicationError instanceof Error?publicationError.message:publicationError)} Votre version est conservée dans la récupération. La note enregistrée reste intacte.`);}unregister();}
  });
  unregister=registerNotebookWriter(scope.accountId,{flush:accepted.flush,settled:accepted.settled,readyForPublication:()=>acceptedPublication,pending:accepted.pending,suspend:()=>{},resume:()=>{}});
  const acceptedPublication=accepted.start();tail.current=acceptedPublication;acceptedDurability.current.set(tail.current,accepted);
  // Consume rejection for event handlers; failed chain remains failed and cannot overwrite the durable revision.
  void tail.current.catch(()=>{});return true;
 };
 const command=(cmd:PaperCommand)=>{
  if(!accepts()||!current.current||blocked||!writable.current)return false;
  try{const before=current.current,next=amendPaperCollaboration(before,applyPaperCommand(before,cmd),scopeKey);if(persist(next)){history.current=recordPaperHistory(history.current,before);return true;}return false;}catch(error){setNotice(String(error instanceof Error?error.message:error));return false;}
 };
 const layout=(cmd:PaperCommand)=>{if(!accepts()||!current.current||blocked||!writable.current)return false;try{return persist(amendPaperCollaboration(current.current,applyPaperCommand(current.current,cmd),scopeKey));}catch(error){setNotice(String(error instanceof Error?error.message:error));return false;}};
 const recordingCommand=(cmd:PaperCommand)=>{if(!accepts()||!current.current||blocked||!writable.current)return false;try{const retained=retainRecordingHistory(history.current,cmd),next=amendPaperCollaboration(current.current,applyPaperCommand(current.current,cmd),scopeKey);if(!persist(next))return false;history.current=retained;return true;}catch(error){setNotice(String(error instanceof Error?error.message:error));return false;}};
 const textChange=(objectId:string,markdown:string,baseline?:PaperDocument)=>{
  if(!accepts()||!current.current||blocked||!writable.current)return null;
  try{const before=current.current,result=mergePaperTextChange(before,baseline,objectId,markdown);if(!persist(result.document))return null;history.current=recordPaperHistory(history.current,before);if(result.recovered)setNotice('Votre texte a été conservé sur une nouvelle page ; la version reçue reste intacte.');return result;}catch(error){setNotice(String(error instanceof Error?error.message:error));return null;}
 };
 const travel=(direction:'undo'|'redo')=>{if(!accepts()||!current.current||blocked||!writable.current)return;const result=travelPaperHistory(history.current,current.current,direction);if(result){try{const next=amendPaperCollaboration(current.current,result.document,scopeKey);if(persist(next))history.current=result.history;}catch(error){setNotice(String(error instanceof Error?error.message:error));}}};
 const loadResolution=async()=>{
  const ticket=generation.current,visible=current.current,api=media.api;if(!accepts()||!visible||!writable.current)return;
  const operation=++resolutionOperation.current,ownsOperation=()=>accepts()&&writable.current&&ticket===generation.current&&renderedApi.current===api&&resolutionOperation.current===operation,sourceCurrent=()=>ownsOperation()&&current.current===visible;
  let authority:ReturnType<typeof capturePrivateNotebookResolution>|undefined;setResolving(true);
  try{const admitted=capturePrivateNotebookResolution({scope,api,current:sourceCurrent});authority=admitted;
   await admitted.check(visible);await tail.current.catch(()=>undefined);await admitted.check(visible);const durable=await getDraft(scope);await admitted.check(durable?.content);if(!durable)throw Error('La copie enregistrée est introuvable. Exportez la version visible.');
   const identityConflict=durable.conflict as {identityReceipt?:unknown}|undefined;
   if(typeof identityConflict?.identityReceipt==='string'&&identityConflict.identityReceipt.startsWith(`paper-identity|${media.accountId}|${media.spaceId}|whiteboard|`)){
    const row=await getSnapshot(identityConflict.identityReceipt);await admitted.check(durable.content);const value=row?.value as {source?:Draft;canonical?:Draft;chosenIncomingConflict?:{mutationId:string;content:unknown};incomingConflicts?:{mutationId:string;content:unknown}[]}|undefined;
    const source=value?.source?.content;
    if(value?.source?.accountId!==media.accountId||value.source.spaceId!==media.spaceId||value?.canonical?.documentId!==scope.documentId||!isPaperDocument(source)||source.noteId!==noteId)throw Error('Les versions historiques doivent être retrouvées avant de les réunir.');
    const alternatives=(value.incomingConflicts??[]).map(item=>{
     if(typeof item.mutationId!=='string'||!isPaperDocument(item.content)||item.content.noteId!==noteId)throw Error('Une contribution reçue appartient à une autre note.');
     return {id:item.mutationId,content:item.content};
    });
    const selected=alternatives.find(item=>item.id===value.chosenIncomingConflict?.mutationId)??alternatives.at(-1),received=selected?.content??source;
    if(admitted.current())setResolution({durable,remote:received,version:durable.baseVersion,alternatives,selected:selected?.id});return;
   }

   if(!api){if(admitted.current())setResolution({durable,remote:isPaperDocument(durable.content)?durable.content:null,version:durable.baseVersion});return;}
   let cursor:string|undefined,latest:import('../../pwa/src/api').DocumentChange|undefined;
   do{await admitted.check(visible);const page=await api.changes(scope.spaceId,cursor);await admitted.check(visible);for(const row of page.items)if(row.document_type===scope.type&&row.document_id===scope.documentId)latest=row;cursor=page.has_more?page.next_cursor:undefined;}while(cursor&&admitted.current());
   if(!latest)throw Error('La version serveur n’est pas encore disponible. Votre note est conservée.');
   await admitted.check(latest.content);const remote=latest.deleted?null:await admitted.decode(latest.content);
   if(remote!==null&&(!isPaperDocument(remote)||remote.noteId!==noteId))throw Error('La version serveur est incompatible. Exportez votre note avant de continuer.');
   if(admitted.current())setResolution({durable,remote:remote as PaperDocument|null,version:latest.version});
  }catch(error){if(sourceCurrent()&&(!authority||authority.ownsSource()))setNotice(String(error instanceof Error?error.message:error));}
  finally{if(ownsOperation())setResolving(false);}
 };
 const selectResolutionVersion=(id:string)=>{if(resolving)return;setResolution(value=>{const selected=value?.alternatives?.find(item=>item.id===id);return value&&selected?{...value,selected:id,remote:selected.content}:value;});};
 const resolve=async(choice:PaperConflictChoice)=>{
  const ticket=generation.current,visible=current.current,selectedResolution=resolution,api=media.api;if(!accepts()||!selectedResolution||!visible||resolving||!writable.current)return;
  const operation=++resolutionOperation.current,ownsOperation=()=>accepts()&&writable.current&&ticket===generation.current&&renderedApi.current===api&&resolutionOperation.current===operation,sourceCurrent=()=>ownsOperation()&&current.current===visible&&resolutionState.current===selectedResolution;
  let authority:ReturnType<typeof capturePrivateNotebookResolution>|undefined;setResolving(true);try{const admitted=capturePrivateNotebookResolution({scope,api,current:sourceCurrent});authority=admitted;
   await admitted.check(visible);const content=await preparePaperResolution(visible,selectedResolution.remote,choice,{accountId:scope.accountId,spaceId:scope.spaceId,api},admitted.current,()=>admitted.check(visible),scope);
   await admitted.check(content);if(!admitted.current())return;
   const server=selectedResolution.remote?{...selectedResolution.durable,content:selectedResolution.remote,baseVersion:selectedResolution.version,syncState:'synced' as const,conflict:undefined}:null;
   const selected=await resolvePaperDraft(selectedResolution.durable,visible,server,selectedResolution.version,content,crypto.randomUUID(),admitted.current,true);
   if(!admitted.current())return;
   notifySearchIndex();
   tail.current=Promise.resolve();pending.current=0;persistenceFailure.current=false;draft.current=selected;current.current=content;history.current=emptyPaperHistory();setDocument(content);setResolution(null);setBlocked(false);setSaved(true);setNotice('Versions originales conservées dans la récupération. La note peut être modifiée et synchronisée.');
  }catch(error){if(sourceCurrent()&&(!authority||authority.ownsSource()))setNotice(String(error instanceof Error?error.message:error));}
  finally{if(ownsOperation())setResolving(false);}
 };
 const mirrorMarkdown=(value:string,writer:NotebookMarkdownWriter):Promise<boolean>=>{
  if(!accepts()||blocked||!writable.current||persistenceFailure.current)return Promise.resolve(false);
  const ticket=generation.current,expectedMarkdown=sourceMarkdown.current;let published=false,proof:typeof selfMirrors.current[number]|undefined;
  // The very same authority gates staging, publication and its error notice.
  // Once any phase observes retirement, a later A→B→A cannot revive it.
  let retired=false,readCurrent=()=>false,parentCurrent=()=>true;
  const publicationCurrent=()=>{if(retired)return false;try{if(!readCurrent()||parentCurrent()!==true)retired=true;}catch{retired=true;}return !retired;};
  pending.current++;
  const operation=tail.current.then(async()=>{
   const baseline=current.current;
   const inScope=()=>alive.current&&ticket===generation.current&&renderedScope.current===scopeKey&&documentOwner.current===scopeKey&&writable.current&&!persistenceFailure.current;
   if(!baseline||blocked)return;
   readCurrent=()=>inScope()&&sourceMarkdown.current===expectedMarkdown&&current.current===baseline;
   if(!publicationCurrent())return;
   const {stagePaperLegacyMirror,publishPaperLegacyMirror}=await import('../lib/paperLegacyBridge');
   const staged=await stagePaperLegacyMirror({noteId,scope:owner,expectedMarkdown,desiredMarkdown:value,current:publicationCurrent});
   if(!publicationCurrent())return;
   proof={key:scopeKey,generation:ticket,accessEpoch:acceptedEpoch,expected:expectedMarkdown,desired:value,lineage:baseline.collaboration?.lineage,receiptId:staged.receipt.mirror!.id,acknowledged:false,published:false};
   selfMirrors.current=selfMirrors.current.filter(value=>!value.acknowledged);selfMirrors.current.push(proof);
   // RAM can accept another character while metadata is being written. The
   // bridge still compares the exact staged durable graph, metadata and receipt
   // atomically; those newer canonical writes run after this tail operation.
   readCurrent=()=>inScope()&&(sourceMarkdown.current===expectedMarkdown||sourceMarkdown.current===value);
   const validPublication=publicationCurrent;
   let atomic=false;
   const accepted=await writer(value,{expectedMarkdown,commitMetadata:async(metadata,sourceCurrent=()=>true)=>{
    parentCurrent=sourceCurrent;const valid=validPublication;
    if(!valid())throw Error('Le carnet a changé avant la publication de ses métadonnées.');
    await publishPaperLegacyMirror(staged,{confirmedMarkdown:value,metadataDraft:metadata,current:valid});atomic=true;
    const confirmed=await getDraft({...owner,type:'notesMarkdown',documentId:noteId});
    if(!valid()||!confirmed)throw Error('Les métadonnées restent conservées dans leur carnet d’origine.');return confirmed;
   }});
   if(accepted===false||!validPublication())return;
   if(!atomic)await publishPaperLegacyMirror(staged,{confirmedMarkdown:value,current:validPublication});
   if(inScope()){published=true;proof.published=true;}
  }).catch(error=>{if(publicationCurrent())setNotice(`${String(error instanceof Error?error.message:error)} Le carnet et ses sources restent conservés.`);}).finally(()=>{if(proof&&!published){selfMirrors.current=selfMirrors.current.filter(value=>value!==proof);if(proof.acknowledged&&alive.current&&ticket===generation.current&&sourceMarkdown.current===proof.desired){setLegacyObserved(null);setLegacyReconcileEpoch(value=>value+1);}}if(ticket===generation.current)pending.current--;});
  tail.current=operation;return operation.then(()=>published);
 };
 const attachImage=(blob:Blob,name:string,stillCurrent:()=>boolean,object?:PaperObject):Promise<string>=>{
  const ticket=generation.current;if(blocked||!writable.current||renderedScope.current!==scopeKey||documentOwner.current!==scopeKey) return Promise.reject(Error('La note ou le compte a changé. Reprenez l’ajout depuis la note courante.'));
  pending.current++;setSaved(false);
  const operation=tail.current.then(async()=>{
   await opening.current;const baseline=current.current;
   const valid=()=>alive.current&&ticket===generation.current&&renderedScope.current===scopeKey&&documentOwner.current===scopeKey&&writable.current&&!persistenceFailure.current&&stillCurrent()&&current.current===baseline;
   if(!baseline||!valid())throw Error('La note ou le compte a changé pendant l’ajout de l’image.');
   const {insertPaperImage}=await import('../lib/paperImageInsertion');
   const result=await insertPaperImage({document:baseline,scope:owner,blob,name,object,current:valid});
   if(!valid())throw Error('L’image est conservée dans sa note d’origine. Reprenez depuis la note courante.');
   const next=result.draft.content;if(!isPaperDocument(next)||next.noteId!==noteId)throw Error('L’image doit être récupérée dans sa note d’origine.');
   notifySearchIndex();draft.current=result.draft;current.current=next;history.current=recordPaperHistory(history.current,baseline);setDocument(next);
   return result.url;
  }).finally(()=>{if(ticket===generation.current){pending.current--;if(!persistenceFailure.current&&pending.current===0)setSaved(true);}});
  // A refused image never poisons later text edits. Its transaction either
  // committed the owned bytes and graph together, or wrote neither of them.
  tail.current=operation.then(()=>undefined,error=>{if(alive.current&&ticket===generation.current)setNotice(String(error instanceof Error?error.message:error));});
  return operation;
 };
 const applyPrepared=(prepare:(baseline:PaperDocument,current:()=>boolean)=>Promise<{draft:Draft;commit:NotebookTransferCommit}>,sourceCurrent:()=>boolean=()=>true)=>{
  const ownsSource=()=>{try{return sourceCurrent()===true;}catch{return false;}};
  if(!ownsSource()||!accepts()||blocked||!writable.current)return Promise.reject(Error('La note doit être retrouvée avant cette modification.'));
  const ticket=generation.current;pending.current++;setSaved(false);
  let finish!:()=>void;const settled=new Promise<void>(resolve=>{finish=resolve;});const unregister=registerNotebookWriter(scope.accountId,{flush:()=>{},settled:()=>settled,pending:()=>true,suspend:()=>{},resume:()=>{}});
  const operation=tail.current.then(async()=>{
   await opening.current;const baseline=current.current;
   const active=()=>ownsSource()&&alive.current&&ticket===generation.current&&renderedScope.current===scopeKey&&documentOwner.current===scopeKey&&writable.current&&!persistenceFailure.current;
   const valid=()=>active()&&current.current===baseline;
   if(!baseline||!valid())throw Error('La note ou le compte a changé avant cette modification.');
   const prepared=await prepare(baseline,valid);if(!valid())throw Error('La note a changé pendant la préparation. Ses modifications sont conservées.');
   const next=prepared.draft.content,rows=prepared.commit.drafts,check=prepared.commit.draftChecks.find(item=>item.identity.accountId===scope.accountId&&item.identity.spaceId===scope.spaceId&&item.identity.type===scope.type&&item.identity.documentId===scope.documentId);
   const inScope=(row:Draft)=>row.accountId===scope.accountId&&row.spaceId===scope.spaceId&&(row===prepared.draft||row.type==='notesMarkdown'&&row.documentId===noteId);
   if(prepared.draft.accountId!==scope.accountId||prepared.draft.spaceId!==scope.spaceId||prepared.draft.type!==scope.type||prepared.draft.documentId!==scope.documentId||prepared.commit.target.accountId!==scope.accountId||prepared.commit.target.spaceId!==scope.spaceId||!rows.includes(prepared.draft)||!rows.every(inScope)||!prepared.commit.sources.every(source=>source.accountId===scope.accountId&&source.spaceId===scope.spaceId)||!prepared.commit.snapshots.every(row=>row.accountId===scope.accountId&&row.spaceId===scope.spaceId)||!check?.expected||JSON.stringify(check.expected.content)!==JSON.stringify(baseline)||!isPaperDocument(next)||next.noteId!==noteId||next.revision<=baseline.revision)throw Error('Cette modification préparée appartient à une autre version de la note.');
   if(hasPaperCollaboration(next))verifyPaperCollaboration(next);
   await commitNotebookTransfer(prepared.commit,valid);
   if(!valid())throw Error('La modification reste conservée dans sa note d’origine. Reprenez depuis la note courante.');
   notifySearchIndex();draft.current=prepared.draft;current.current=next;history.current=recordPaperHistory(history.current,baseline);setDocument(next);return next;
  }).finally(()=>{if(ticket===generation.current){pending.current--;if(!persistenceFailure.current&&pending.current===0)setSaved(true);}finish();unregister();});
  tail.current=operation.then(()=>undefined,error=>{if(alive.current&&ticket===generation.current&&renderedScope.current===scopeKey)setNotice(String(error instanceof Error?error.message:error));});
  return operation;
 };
 return {retryOpen,layout,recordingCommand,resolution:documentOwner.current===scopeKey&&documentAccessEpoch.current===acceptedEpoch?resolution:null,resolving,loadResolution,selectResolutionVersion,resolve,document:documentOwner.current===scopeKey&&documentAccessEpoch.current===acceptedEpoch?document:null,command,textChange,travel,blocked,saved,notice,setNotice,reconciling,legacyReady:legacyObserved?.key===scopeKey&&legacyObserved.markdown===markdown,mirrorMarkdown,attachImage,applyPrepared,getCurrent:()=>accepts()?current.current:null,whenSaved:()=>tail.current,canUndo:!!history.current.past.length,canRedo:!!history.current.future.length};
}
