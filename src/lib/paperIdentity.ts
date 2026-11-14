import {getDraft,getSnapshot,listDrafts,listMutations,commitPaperIdentityPromotion,paperIdentityMutationDigest,readNotebookDeletionStatus,notebookPrivateIdentityRecoveryAllowed,type Draft,type PaperIdentityContribution} from '../../pwa/src/storage.ts';
import {isPaperDocument,type PaperDocument} from './notebookDocument.ts';
import {notebookDocumentId,legacyNotebookDocumentId} from './notebookIdentity.ts';
import {mergePaperCollaboration} from './paperCollaboration.ts';
import {noteBoardId} from './notebook.ts';
import {PrivateNotebookBlockedError} from './privateNotebookSyncPolicy.ts';

export interface NotebookIdentityScope {accountId:string;spaceId:string}
export const paperIdentityReceiptKey=(scope:NotebookIdentityScope,sourceId:string)=>`paper-identity|${scope.accountId}|${scope.spaceId}|whiteboard|${sourceId}`;
const check=(current:()=>boolean)=>{if(!current())throw Error('Le compte ou le carnet a changé pendant la migration. Les originaux restent conservés.');};
const owned=(draft:Draft|undefined,noteId:string)=>{if(draft&&(!isPaperDocument(draft.content)||draft.content.noteId!==noteId))throw Error('L’identité de cette note désigne un autre document. Aucun contenu n’est remplacé.');return draft;};

/** Promote a proved historical owner. A colliding alias is never a source for another note. */
export async function ensureNotebookIdentity(noteId:string,scope:NotebookIdentityScope,current:()=>boolean=()=>true,deletedMode:'error'|'allow'='error',privateTransport=false):Promise<Draft|undefined>{
 scope={accountId:scope.accountId,spaceId:scope.spaceId};
 check(current);if(privateTransport&&!await notebookPrivateIdentityRecoveryAllowed({...scope,type:'whiteboard',documentId:notebookDocumentId(noteId)},current,{noteId}))throw new PrivateNotebookBlockedError();
 check(current);const documentId=notebookDocumentId(noteId),sourceId=legacyNotebookDocumentId(noteId),identity={...scope,type:'whiteboard' as const,documentId};
 const deletion=await readNotebookDeletionStatus(noteId,scope,current),deletedError=()=>Error('Cette note a été supprimée sur le serveur. Ses versions restent conservées dans la récupération ; restaurez-la explicitement avant de la rouvrir.');
 const target=owned(await getDraft(identity),noteId);check(current);if(sourceId===documentId){if(deletion&&deletedMode==='error')throw deletedError();return target;}
 const source=await getDraft({...identity,documentId:sourceId});check(current);
 if(!source||!isPaperDocument(source.content)||source.content.noteId!==noteId){if(deletion&&deletedMode==='error')throw deletedError();return target;}
 const receiptKey=paperIdentityReceiptKey(scope,sourceId),receipt=await getSnapshot(receiptKey);check(current);
 const previous=(receipt?.value as {source?:Draft}|undefined)?.source,processed=(receipt?.value as {processedMutationStates?:Record<string,string>}|undefined)?.processedMutationStates??{};
 const pending=(await listMutations(scope.accountId,scope.spaceId)).filter(mutation=>mutation.accountId===scope.accountId&&mutation.spaceId===scope.spaceId&&mutation.type==='whiteboard'&&mutation.documentId===sourceId&&(!Object.hasOwn(processed,mutation.id)||processed[mutation.id]!==paperIdentityMutationDigest(mutation)));check(current);
 const contribution=(value:unknown)=>{if(!isPaperDocument(value))return value;const {revision,updatedAt,collaboration,...content}=value;return content;};
 const sourceChanged=!(source.identityAlias===documentId&&previous&&JSON.stringify(contribution(source.content))===JSON.stringify(contribution(previous.content)));
 if(deletion){
  const previousDeletion=(receipt?.value as {deletion?:{version?:number}}|undefined)?.deletion;
  if(sourceChanged||pending.length||previousDeletion?.version!==deletion.version){
   const contributions:PaperIdentityContribution[]=pending.map(mutation=>({mutation,kind:isPaperDocument(mutation.content)&&mutation.content.noteId===noteId?'conflict':'collision'}));
   const assetIds=[...new Set([...source.content.assets.map(asset=>asset.id),...contributions.flatMap(row=>row.kind!=='collision'&&isPaperDocument(row.mutation.content)?row.mutation.content.assets.map(asset=>asset.id):[])])];
   const canonical={...(target??source),...identity,content:target?.content??source.content,baseVersion:target?.baseVersion??0,identityAlias:undefined};
   await commitPaperIdentityPromotion({source,target,canonical,assetIds,receiptKey,contributions,deletion},current,privateTransport);check(current);
  }
  if(deletedMode==='error')throw deletedError();return target;
 }
 if(!sourceChanged&&!pending.length)return target;
 let content:PaperDocument=target&&!sourceChanged?target.content as PaperDocument:source.content,conflict=target?.conflict,syncState:Draft['syncState']=target&&!sourceChanged?target.syncState:'local';
 if(target&&sourceChanged){
  if(JSON.stringify(target.content)===JSON.stringify(content)){content=target.content as PaperDocument;syncState=target.syncState;}
  else{
   let merged:PaperDocument|null=null;try{merged=mergePaperCollaboration(target.content as PaperDocument,content);}catch{/* Both proved versions remain in the migration receipt. */}
   if(merged)content=merged;
   else{content=target.content as PaperDocument;syncState='conflict';conflict={...(target.conflict&&typeof target.conflict==='object'?target.conflict:{}),identitySource:sourceId,identityReceipt:receiptKey,sourceVersion:source.baseVersion};}
  }
 }
 const contributions:PaperIdentityContribution[]=[],assetIds=new Set(source.content.assets.map(asset=>asset.id)),conflicted:string[]=[];
 for(const mutation of pending){
  if(!isPaperDocument(mutation.content)||mutation.content.noteId!==noteId){contributions.push({mutation,kind:'collision'});continue;}
  for(const asset of mutation.content.assets)assetIds.add(asset.id);
  if(JSON.stringify(contribution(content))===JSON.stringify(contribution(mutation.content))){contributions.push({mutation,kind:'same'});continue;}
  let merged:PaperDocument|null=null;try{merged=mergePaperCollaboration(content,mutation.content);}catch{/* The exact original goes to recovery, never to another note. */}
  if(merged){content=merged;contributions.push({mutation,kind:'merged'});if(syncState!=='conflict')syncState='local';}
  else{contributions.push({mutation,kind:'conflict'});conflicted.push(mutation.id);syncState='conflict';}
 }
 if(target?.syncState==='conflict')syncState='conflict';
 if(conflicted.length)conflict={...(conflict&&typeof conflict==='object'?conflict:{}),identitySource:sourceId,identityReceipt:receiptKey,identityOutboxIds:conflicted,sourceVersion:source.baseVersion};
 const unchangedTarget=target&&!sourceChanged&&contributions.every(row=>row.kind==='same'||row.kind==='collision');
 const canonical:Draft={...(target??source),...identity,content,baseVersion:target?.baseVersion??0,updatedAt:unchangedTarget?target.updatedAt:Date.now(),syncState,identityAlias:undefined,...(conflict?{conflict}:{conflict:undefined})};
 await commitPaperIdentityPromotion({source,target,canonical,assetIds:[...assetIds],receiptKey,contributions},current,privateTransport);check(current);
 return owned(await getDraft(identity),noteId);
}

/** A colliding old board is kept for recovery, rather than copied into an unrelated note. */
export async function readOwnedLegacyNotebookBoard(noteId:string,scope:NotebookIdentityScope,current:()=>boolean=()=>true,knownNoteIds:readonly string[]=[]):Promise<Draft|undefined>{
 scope={accountId:scope.accountId,spaceId:scope.spaceId};
 check(current);const paper=await getDraft({...scope,type:'whiteboard',documentId:legacyNotebookDocumentId(noteId)});check(current);
 if(paper&&isPaperDocument(paper.content)&&paper.content.noteId!==noteId)return undefined;
 const boardId=noteBoardId(noteId),claim=await getSnapshot(`paper-legacy-owner|${scope.accountId}|${scope.spaceId}|whiteboard|${boardId}`);check(current);
 if(claim){
  const value=claim.value as {schema?:unknown;noteId?:unknown;documentId?:unknown;boardId?:unknown;claimedAt?:unknown};
  if(claim.accountId!==scope.accountId||claim.spaceId!==scope.spaceId||!value||value.schema!==1||typeof value.noteId!=='string'||value.boardId!==boardId||value.documentId!==notebookDocumentId(value.noteId)||typeof value.claimedAt!=='string'||!Number.isFinite(Date.parse(value.claimedAt)))return undefined;
  if(value.noteId!==noteId)return undefined;
  const board=await getDraft({...scope,type:'whiteboard',documentId:boardId});check(current);return board;
 }
 const rows=await listDrafts(scope.accountId,scope.spaceId);check(current);
 const owners=new Set([noteId,...knownNoteIds,...rows.filter(row=>row.type==='notesMarkdown').map(row=>{
  const content=row.content as {id?:unknown}|undefined;return typeof content?.id==='string'?content.id:row.documentId;
 })].filter(id=>noteBoardId(id)===boardId));
 if(owners.size>1)return undefined;
 const board=await getDraft({...scope,type:'whiteboard',documentId:boardId});check(current);return board;
}

/** Called before outbox publication and after reception, so aliases cannot be republished. */
export async function normalizeNotebookIdentities(scope:NotebookIdentityScope,current:()=>boolean=()=>true,privateTransport=false){
 scope={accountId:scope.accountId,spaceId:scope.spaceId};
 check(current);const rows=await listDrafts(scope.accountId,scope.spaceId);check(current);
 for(const row of rows){if(privateTransport&&!await notebookPrivateIdentityRecoveryAllowed(row,current,row.content))continue;check(current);if(row.type!=='whiteboard'||!row.documentId.startsWith('paper-v3-')||!isPaperDocument(row.content))continue;
  const noteId=row.content.noteId,canonical=notebookDocumentId(noteId),legacy=legacyNotebookDocumentId(noteId);
  if(row.documentId===canonical)continue;
  if(row.documentId!==legacy)throw Error('Une ancienne note utilise une identité inconnue. Son original reste conservé.');
  try{await ensureNotebookIdentity(noteId,scope,current,'allow',privateTransport);}catch(error){if(!privateTransport||!(error instanceof PrivateNotebookBlockedError))throw error;}check(current);
 }
}
