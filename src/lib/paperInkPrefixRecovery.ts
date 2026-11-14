import {applyPaperCommand,type InkPoint,type PaperDocument} from './notebookDocument';
import {amendPaperCollaboration} from './paperCollaboration';
import {listPaperInkPrefixJournals,readPaperInkPrefixJournal,confirmPaperInkPrefixCanonical,discardPaperInkPrefixJournal,isPaperInkPrefixJournalHeader,paperInkPrefixJournalKey,type PaperInkPrefixJournalHeader} from './paperInkPrefixJournal';
import {listPaperInterruptedInk,readPaperInterruptedInk,isPaperInterruptedInkReceipt,preservePaperInterruptedInk,markPaperInterruptedInkRestored,planPaperInterruptedInkRestore,paperInkRecoveryReceiptKey,PAPER_INK_RECOVERY_CHUNK_POINTS,type PaperInkRecoveryScope,type PaperInterruptedInkReceipt,type PaperInterruptedInkChunk} from './paperInterruptedInk';
import {getDraft,getSnapshot,notebookDeletionKey,type Draft,type NotebookTransferCommit} from '../../pwa/src/storage';
import {notebookDocumentId} from './notebookIdentity';

export type PaperInkRecoveryEntry={kind:'receipt';receipt:PaperInterruptedInkReceipt}|{kind:'prefix';header:PaperInkPrefixJournalHeader};
const owned=(scope:PaperInkRecoveryScope,receipt:PaperInkRecoveryScope)=>receipt.accountId===scope.accountId&&receipt.spaceId===scope.spaceId&&receipt.noteId===scope.noteId;
const sameAdmission=(receipt:PaperInterruptedInkReceipt,header:PaperInkPrefixJournalHeader)=>owned(header,receipt)&&receipt.id===header.id&&receipt.ownerKey===header.ownerKey&&receipt.generation===header.generation&&receipt.pageId===header.pageId&&receipt.pointerType===header.pointerType&&receipt.pen===header.pen&&receipt.createdAt===header.createdAt&&JSON.stringify(receipt.geometry)===JSON.stringify(header.geometry)&&receipt.style.color===header.style.color&&receipt.style.width===header.style.width&&receipt.style.opacity===header.style.opacity&&receipt.style.strokeStyle===header.style.strokeStyle&&(header.state!=='prepared'&&header.state!=='canonical'||receipt.pointCount===header.finalPointCount);
/** A prepared journal can prove an already saved canonical object. This only
 * marks a receipt; it issues no command, replay, note creation or upsert. */
async function confirmExisting(header:PaperInkPrefixJournalHeader,current:()=>boolean):Promise<boolean>{
 if(header.state!=='prepared'&&header.state!=='canonical')return false;
 const original=await getSnapshot(paperInkRecoveryReceiptKey(header,header.id));if(!current())return false;
 if(original){
  if(original.accountId!==header.accountId||original.spaceId!==header.spaceId||!isPaperInterruptedInkReceipt(original.value)||!sameAdmission(original.value,header))throw Error('La récupération et le journal ne décrivent pas le même contact.');
  const full=await readPaperInterruptedInk(header,header.id,current),raw=await readPaperInkPrefixJournal(header,header.id,current);
  if(JSON.stringify(full.points)!==JSON.stringify(raw.points))throw Error('Deux versions différentes du trait occupent sa récupération. Aucun original n’est masqué.');
 }
 const proof=await getDraft({accountId:header.accountId,spaceId:header.spaceId,type:'whiteboard',documentId:notebookDocumentId(header.noteId)});
 if(!proof||!current())return false;
 try{
  if((await confirmPaperInkPrefixCanonical(header,proof,current)).state!=='canonical')return false;
  const existing=await getSnapshot(paperInkRecoveryReceiptKey(header,header.id));if(!current())return false;
  if(existing){
   if(existing.accountId!==header.accountId||existing.spaceId!==header.spaceId||!isPaperInterruptedInkReceipt(existing.value)||!sameAdmission(existing.value,header)||existing.value.pointCount!==header.confirmedCursor)return false;
   if(existing.value.state==='available'){
    const content=proof.content as import('./notebookDocument').PaperDocument,object=content.objects.find(value=>value.id===header.prepared?.objectId);
    if(!object)return false;await markPaperInterruptedInkRestored(header,header.id,object,proof,current);
   }
  }
  return true;
 }catch{return false;}
}
/** Full interrupted receipts outrank a shorter prefix with the same admission.
 * Live/blocked contacts cannot be copied while their old-owner drain continues.
 * Headers are listed here; point chunks are read only for an explicit restore. */
export async function listPaperInkRecoveryEntries(scope:PaperInkRecoveryScope,current:()=>boolean,pending:(id:string)=>boolean):Promise<PaperInkRecoveryEntry[]>{
 scope=Object.freeze({...scope});if(!current())return [];
 const receipts=await listPaperInterruptedInk(scope,current),prefixes=await listPaperInkPrefixJournals(scope,current);if(!current())return [];
 const entries:PaperInkRecoveryEntry[]=[];
 for(const receipt of receipts){
  if(!current())return [];if(pending(receipt.id))continue;
  const stored=await getSnapshot(paperInkPrefixJournalKey(scope,receipt.id));if(!current())return [];
  if(stored){
   if(stored.accountId!==scope.accountId||stored.spaceId!==scope.spaceId||!isPaperInkPrefixJournalHeader(stored.value)||!sameAdmission(receipt,stored.value))throw Error('La récupération et son contact d’origine ne correspondent pas.');
   if(stored.value.state==='canonical'||stored.value.state==='discarded'){await confirmExisting(stored.value,current);continue;}
   if(await confirmExisting(stored.value,current))continue;
  }
  entries.push({kind:'receipt',receipt});
 }
 for(const header of prefixes){
  if(!current())return [];if(pending(header.id))continue;
  const existing=await getSnapshot(paperInkRecoveryReceiptKey(scope,header.id));if(!current())return [];
  if(existing){if(existing.accountId!==scope.accountId||existing.spaceId!==scope.spaceId||!isPaperInterruptedInkReceipt(existing.value)||!sameAdmission(existing.value,header))throw Error('Deux origines différentes occupent le même identifiant de trait. Aucun trait n’est remplacé.');continue;}
  if(await confirmExisting(header,current))continue;if(!current())return [];
  entries.push({kind:'prefix',header});
 }
 return entries.sort((a,b)=>{const first=a.kind==='receipt'?a.receipt:a.header,second=b.kind==='receipt'?b.receipt:b.header;return second.createdAt-first.createdAt||first.id.localeCompare(second.id);});
}
/** Materialize a recovery copy from the exact confirmed cursor. No promise is
 * made about points still in RAM at process death or a250ms maximum loss window.
 * One stable receipt ID makes retries idempotent and preserves the raw chunks. */
export async function readPaperInkRecoveryEntry(scope:PaperInkRecoveryScope,entry:PaperInkRecoveryEntry,current:()=>boolean,pending:(id:string)=>boolean):Promise<{receipt:PaperInterruptedInkReceipt;points:InkPoint[];prefix?:PaperInkPrefixJournalHeader}|null>{
 scope=Object.freeze({...scope});const id=entry.kind==='receipt'?entry.receipt.id:entry.header.id;
 const valid=()=>current()&&!pending(id);if(!valid())throw Error('Ce trait attend encore la fin de sa conservation.');
 if(entry.kind==='receipt'){
  const loaded=await readPaperInterruptedInk(scope,id,valid),prefix=await getSnapshot(paperInkPrefixJournalKey(scope,id));
  if(!valid())throw Error('Le compte ou le trait a changé.');
  if(prefix){
   if(prefix.accountId!==scope.accountId||prefix.spaceId!==scope.spaceId||!isPaperInkPrefixJournalHeader(prefix.value)||!sameAdmission(loaded.receipt,prefix.value))throw Error('La récupération et son contact d’origine ne correspondent pas.');
   if(prefix.value.state==='canonical'||prefix.value.state==='discarded'||await confirmExisting(prefix.value,valid))return null;
  }
  if(loaded.receipt.state==='restored')return null;return loaded;
 }
 const existing=await getSnapshot(paperInkRecoveryReceiptKey(scope,id));if(!valid())throw Error('Le compte ou le trait a changé.');
 if(existing){
  if(existing.accountId!==scope.accountId||existing.spaceId!==scope.spaceId||!isPaperInterruptedInkReceipt(existing.value)||!owned(scope,existing.value)||existing.value.id!==id)throw Error('Une autre origine occupe la récupération. Aucun trait n’est remplacé.');
  const loaded=await readPaperInterruptedInk(scope,id,valid),fresh=await readPaperInkPrefixJournal(scope,id,valid);
  if(!sameAdmission(loaded.receipt,fresh.header))throw Error('La récupération et son contact d’origine ne correspondent pas.');
  if(fresh.header.state==='canonical'||fresh.header.state==='discarded'||await confirmExisting(fresh.header,valid)||loaded.receipt.state==='restored')return null;
  return {...loaded,prefix:fresh.header};
 }
 const {header,points}=await readPaperInkPrefixJournal(scope,id,valid);
 if(header.state==='canonical'||header.state==='discarded'||await confirmExisting(header,valid))return null;
 if(!valid()||points.length!==header.confirmedCursor||!points.length)throw Error('Le préfixe confirmé a changé. Relisez les traits récupérables.');
 const chunks:PaperInterruptedInkChunk[]=[];
 for(let offset=0;offset<points.length;offset+=PAPER_INK_RECOVERY_CHUNK_POINTS)chunks.push(Object.freeze({accountId:scope.accountId,spaceId:scope.spaceId,noteId:scope.noteId,schema:1,kind:'paper-interrupted-ink-chunk',id,index:chunks.length,points:Object.freeze(points.slice(offset,offset+PAPER_INK_RECOVERY_CHUNK_POINTS).map(point=>Object.freeze({...point})))}));
 const receipt:PaperInterruptedInkReceipt=Object.freeze({accountId:scope.accountId,spaceId:scope.spaceId,noteId:scope.noteId,schema:1,kind:'paper-interrupted-ink',id,pageId:header.pageId,ownerKey:header.ownerKey,generation:header.generation,pointerType:header.pointerType,cause:header.cause??'process-interrupted',createdAt:header.createdAt,pointCount:points.length,chunkCount:chunks.length,geometry:header.geometry,style:header.style,pen:header.pen,state:'available'});
 if(!isPaperInterruptedInkReceipt(receipt)||!valid())throw Error('La récupération ne correspond plus à cette note.');
 const prefixKey=paperInkPrefixJournalKey(scope,id),prefixRow=await getSnapshot(prefixKey);
 if(!valid()||!prefixRow||prefixRow.accountId!==scope.accountId||prefixRow.spaceId!==scope.spaceId||JSON.stringify(prefixRow.value)!==JSON.stringify(header))throw Error('Le préfixe a changé avant la préparation de sa copie.');
 await preservePaperInterruptedInk({receipt,chunks:Object.freeze(chunks)},undefined,{current:valid,snapshotChecks:[{key:prefixKey,expected:prefixRow}]});
 if(!valid())throw Error('La source a changé. Le préfixe reste conservé dans sa note d’origine.');
 const durable=await readPaperInterruptedInk(scope,id,valid);if(durable.receipt.state==='restored')return null;
 const fresh=await readPaperInkPrefixJournal(scope,id,valid);if(fresh.header.state==='canonical'||fresh.header.state==='discarded'||await confirmExisting(fresh.header,valid))return null;
 return {...durable,prefix:fresh.header};
}
/** Called only after the user's explicit copy has a durable restored receipt.
 * The raw prefix is retained; its terminal marker prevents a second suggestion. */
export async function finishPaperInkPrefixRecovery(scope:PaperInkRecoveryScope,header:PaperInkPrefixJournalHeader,current:()=>boolean):Promise<void>{
 const loaded=await readPaperInterruptedInk(scope,header.id,current);
 if(!current()||loaded.receipt.state!=='restored')throw Error('La copie du trait attend encore sa confirmation.');
 const fresh=await readPaperInkPrefixJournal(scope,header.id,current);if(!current())throw Error('La note a changé après la restauration.');
 await discardPaperInkPrefixJournal(fresh.header,'explicit-recovered-copy');
}

/** The explicit copy and all its source gates commit together. A second tab
 * consuming/discarding the receipt after this preparation makes CAS fail before
 * any canonical object or page is inserted. Deleted notes are never recreated. */
export async function preparePaperInkRecoveryCopy(input:{document:PaperDocument;receipt:PaperInterruptedInkReceipt;points:InkPoint[];destination:'original'|'new-page';current:()=>boolean}):Promise<{draft:Draft;commit:NotebookTransferCommit}>{
 const document=structuredClone(input.document),receipt=structuredClone(input.receipt),{destination,current}=input,points=input.points.map(point=>({...point})),scope=Object.freeze({accountId:receipt.accountId,spaceId:receipt.spaceId,noteId:receipt.noteId}),identity={accountId:scope.accountId,spaceId:scope.spaceId,type:'whiteboard' as const,documentId:notebookDocumentId(scope.noteId)};
 if(!current()||document.noteId!==scope.noteId)throw Error('La source de récupération a changé.');
 const receiptKey=paperInkRecoveryReceiptKey(scope,receipt.id),receiptRow=await getSnapshot(receiptKey),fresh=await readPaperInterruptedInk(scope,receipt.id,current);
 if(!current()||!receiptRow||receiptRow.accountId!==scope.accountId||receiptRow.spaceId!==scope.spaceId||JSON.stringify(receiptRow.value)!==JSON.stringify(receipt)||JSON.stringify(fresh.receipt)!==JSON.stringify(receipt)||JSON.stringify(fresh.points)!==JSON.stringify(points)||fresh.receipt.state!=='available')throw Error('Le trait a déjà été récupéré ou sa version a changé.');
 const prefixKey=paperInkPrefixJournalKey(scope,receipt.id),prefixRow=await getSnapshot(prefixKey);
 if(prefixRow){
  if(prefixRow.accountId!==scope.accountId||prefixRow.spaceId!==scope.spaceId||!isPaperInkPrefixJournalHeader(prefixRow.value)||!sameAdmission(receipt,prefixRow.value))throw Error('Le journal et la récupération appartiennent à deux contacts différents.');
  if(prefixRow.value.state==='canonical'||prefixRow.value.state==='discarded'||await confirmExisting(prefixRow.value,current))throw Error('Ce trait a déjà été enregistré ou annulé. Aucune nouvelle copie n’est ajoutée.');
 }
 const original=await getDraft(identity),deletionKey=notebookDeletionKey(identity),deletion=await getSnapshot(deletionKey);
 if(!current()||deletion||!original||original.identityAlias||original.syncState==='conflict'||JSON.stringify(original.content)!==JSON.stringify(document))throw Error('La note enregistrée a changé ou a été supprimée.');
 const plan=planPaperInterruptedInkRestore(document,receipt,points,destination);if(!plan.command)throw Error('La copie existe déjà ; sa confirmation doit être reprise.');
 const now=new Date().toISOString(),content=amendPaperCollaboration(document,applyPaperCommand(document,plan.command,now),JSON.stringify([scope.accountId,scope.spaceId,scope.noteId])),draft:Draft={...original,content,updatedAt:Date.parse(now),syncState:'local'};
 const historyKey=`paper-history|${scope.accountId}|${scope.spaceId}|whiteboard|${identity.documentId}|${String(document.revision).padStart(12,'0')}|ink-recovery-${JSON.stringify(receipt.id)}`,history=await getSnapshot(historyKey);
 if(!current()||history&&(history.accountId!==scope.accountId||history.spaceId!==scope.spaceId||JSON.stringify(history.value)!==JSON.stringify(document)))throw Error('Une autre version occupe cet historique de récupération.');
 const commit:NotebookTransferCommit={target:scope,sources:[scope],drafts:[draft],blobs:[],snapshots:history?[]:[{key:historyKey,accountId:scope.accountId,spaceId:scope.spaceId,value:document}],draftChecks:[{identity,expected:original}],blobChecks:[],snapshotChecks:[{key:receiptKey,expected:receiptRow},{key:prefixKey,expected:prefixRow},{key:deletionKey,expected:undefined},{key:historyKey,expected:history}]};
 return {draft,commit};
}
