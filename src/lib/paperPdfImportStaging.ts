import {getDraft,getSnapshot,listLocalBlobs,listSnapshotsByPrefix,localBlobDigest,notebookDeletionKey,commitNotebookTransfer,type Draft,type LocalBlob,type Snapshot,type NotebookTransferCommit} from '../../pwa/src/storage';
import {applyPaperCommand,isPaperDocument,migratePaper,notebookDocumentId,type PaperDocument,type PaperPage} from './notebookDocument';
import {amendPaperCollaboration,hasPaperCollaboration,verifyPaperCollaboration} from './paperCollaboration';
import {notebookIdentityDigest} from './notebookIdentity';

export interface PaperPdfImportScope {accountId:string;spaceId:string;noteId:string}
export interface PaperPdfImportReceipt extends PaperPdfImportScope {
 schema:1;kind:'paper-pdf-import';id:string;state:'source-staged'|'ready'|'applied';
 sourceName:string;createdAt:string;sourceId:string;assetId:string;size:number;sha256:string;
 targetLineage:string;pages?:PaperPage[];pagesSha256?:string;appliedAt?:string;appliedRevision?:number;
}
export const MAX_PAPER_PDF_IMPORT_BYTES=16*1024*1024;
const safe=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=500;
const scopeOf=(input:PaperPdfImportScope)=>{
 const scope=Object.freeze({accountId:input.accountId,spaceId:input.spaceId,noteId:input.noteId});
 if(!Object.values(scope).every(safe))throw Error('Le compte et la note du PDF doivent être identifiés.');return scope;
};
const prefix=(scope:PaperPdfImportScope)=>`paper-import-pdf|${JSON.stringify([scope.accountId,scope.spaceId,scope.noteId])}|`;
export const paperPdfImportKey=(scope:PaperPdfImportScope,id:string)=>prefix(scope)+JSON.stringify(id);
const identityOf=(scope:PaperPdfImportScope)=>({accountId:scope.accountId,spaceId:scope.spaceId,type:'whiteboard' as const,documentId:notebookDocumentId(scope.noteId)});
const resourceBase=(scope:PaperPdfImportScope,id:string)=>`pdf-import-${notebookIdentityDigest(JSON.stringify([scope.accountId,scope.spaceId,scope.noteId,id]))}`;
const sourceDocumentId=(scope:PaperPdfImportScope,id:string)=>`paper-import-source-${resourceBase(scope,id)}`;
const check=(current:()=>boolean)=>{if(!current())throw Error('La note ou le compte a changé. Le PDF déjà conservé peut être repris dans sa note d’origine.');};
const sameScope=(row:{accountId:string;spaceId:string},scope:PaperPdfImportScope)=>row.accountId===scope.accountId&&row.spaceId===scope.spaceId;
const digest=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function validReceipt(value:unknown,scope:PaperPdfImportScope,id:string):value is PaperPdfImportReceipt {
 const row=value as PaperPdfImportReceipt|undefined;
 if(!row||row.schema!==1||row.kind!=='paper-pdf-import'||row.id!==id||!safe(id)||!sameScope(row,scope)||row.noteId!==scope.noteId||!safe(row.sourceId)||!safe(row.assetId)||row.sourceId===row.assetId||typeof row.sourceName!=='string'||row.sourceName.length>500||typeof row.createdAt!=='string'||!Number.isFinite(Date.parse(row.createdAt))||!Number.isSafeInteger(row.size)||row.size<=0||row.size>MAX_PAPER_PDF_IMPORT_BYTES||!digest(row.sha256)||!safe(row.targetLineage)||!['source-staged','ready','applied'].includes(row.state))return false;
 if(row.sourceId!==`${resourceBase(scope,id)}-source`||row.assetId!==`${resourceBase(scope,id)}-asset`)return false;
 if(row.state==='source-staged')return row.pages===undefined&&row.pagesSha256===undefined;
 if(!Array.isArray(row.pages)||row.pages.length<1||row.pages.length>500||!row.pages.every(page=>page&&typeof page==='object'&&safe(page.id))||new Set(row.pages.map(page=>page.id)).size!==row.pages.length||!digest(row.pagesSha256))return false;
 const model=migratePaper(scope.noteId,'',null);model.pages=row.pages;model.objects=[];model.assets=[{id:row.assetId,name:row.sourceName,mediaType:'application/pdf',size:row.size}];
 return isPaperDocument(model)&&row.pages.every((page,index)=>page.id===`${resourceBase(scope,id)}-page-${index+1}`&&page.pdf?.assetId===row.assetId&&page.pdf.pageNumber===index+1)&&(row.state!=='applied'||typeof row.appliedAt==='string'&&Number.isFinite(Date.parse(row.appliedAt))&&Number.isSafeInteger(row.appliedRevision)&&Number(row.appliedRevision)>0);
}
async function ownedReceipt(scope:PaperPdfImportScope,id:string,current:()=>boolean):Promise<{row:Snapshot;receipt:PaperPdfImportReceipt}> {
 check(current);if(!safe(id))throw Error('Cette importation PDF ne possède pas d’identité valide.');const key=paperPdfImportKey(scope,id),row=await getSnapshot(key);check(current);
 if(!row||row.key!==key||!sameScope(row,scope)||!validReceipt(row.value,scope,id))throw Error('Le reçu du PDF doit être récupéré. Aucun fichier d’origine n’est remplacé.');
 return {row,receipt:structuredClone(row.value)};
}
export async function readPaperPdfImport(scopeInput:PaperPdfImportScope,id:string,current:()=>boolean=()=>true){const scope=scopeOf(scopeInput);return (await ownedReceipt(scope,id,current)).receipt;}
export async function listPaperPdfImports(scopeInput:PaperPdfImportScope,current:()=>boolean=()=>true):Promise<PaperPdfImportReceipt[]> {
 const scope=scopeOf(scopeInput);check(current);const rows=await listSnapshotsByPrefix(scope.accountId,scope.spaceId,prefix(scope));check(current);
 return rows.map(row=>{const value=row.value as PaperPdfImportReceipt;if(!safe(value?.id)||row.key!==paperPdfImportKey(scope,value.id)||!validReceipt(value,scope,value.id))throw Error('Une importation PDF conservée utilise un reçu incompatible.');return structuredClone(value);}).filter(row=>row.state!=='applied').sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
}
async function durableTarget(scope:PaperPdfImportScope,current:()=>boolean,document?:PaperDocument){
 const identity=identityOf(scope),draft=await getDraft(identity),deletionKey=notebookDeletionKey(identity),deletion=await getSnapshot(deletionKey);check(current);
 if(deletion||!draft||draft.identityAlias||draft.staged||draft.syncState==='conflict'||!isPaperDocument(draft.content)||draft.content.noteId!==scope.noteId||document&&JSON.stringify(draft.content)!==JSON.stringify(document))throw Error('La note enregistrée a changé, a été supprimée ou attend une résolution. Le PDF original reste conservé.');
 if(!hasPaperCollaboration(draft.content))throw Error('Ouvrez la note pour terminer sa migration avant d’admettre le PDF.');verifyPaperCollaboration(draft.content);
 return {draft,identity,deletionKey};
}
async function ownedFile(scope:PaperPdfImportScope,receipt:PaperPdfImportReceipt,id:string,current:()=>boolean):Promise<LocalBlob>{
 const row=(await listLocalBlobs(scope.accountId,scope.spaceId)).find(file=>file.id===id);check(current);
 if(!row||!sameScope(row,scope)||row.blob.size!==receipt.size||row.sha256!==receipt.sha256||row.blob.type!=='application/pdf'||await localBlobDigest(row.blob)!==receipt.sha256)throw Error('Un fichier PDF conservé manque ou a changé. Son reçu reste disponible.');check(current);return row;
}
/** Acknowledges the source bytes and job together, before invoking a PDF parser. */
export async function stagePaperPdfImport(input:{scope:PaperPdfImportScope;file:Blob&{name?:string};id?:string;current:()=>boolean}):Promise<PaperPdfImportReceipt>{
 const scope=scopeOf(input.scope),current=input.current,id=input.id??crypto.randomUUID(),file=input.file.slice(0,input.file.size,'application/pdf'),sourceName=(input.file.name??'document.pdf').slice(0,500),createdAt=new Date().toISOString();check(current);
 if(!safe(id))throw Error('L’identité de cette importation PDF est incompatible.');if(!file.size||file.size>MAX_PAPER_PDF_IMPORT_BYTES)throw Error('Le PDF doit peser entre un octet et 16 Mo.');
 const target=await durableTarget(scope,current),sha256=await localBlobDigest(file);check(current);
 const receipt:PaperPdfImportReceipt={schema:1,kind:'paper-pdf-import',...scope,id,state:'source-staged',sourceName,createdAt,sourceId:`${resourceBase(scope,id)}-source`,assetId:`${resourceBase(scope,id)}-asset`,size:file.size,sha256,targetLineage:(target.draft.content as PaperDocument).collaboration!.lineage};
 const key=paperPdfImportKey(scope,id),existing=await getSnapshot(key),files=await listLocalBlobs(scope.accountId,scope.spaceId);check(current);
 if(existing||files.some(row=>row.id===receipt.sourceId||row.id===receipt.assetId))throw Error('Cette importation possède déjà une source conservée. Reprenez-la depuis les importations.');
 const source:LocalBlob={accountId:scope.accountId,spaceId:scope.spaceId,id:receipt.sourceId,documentId:sourceDocumentId(scope,id),blob:file,name:sourceName,createdAt:Date.parse(createdAt),status:'pending',removedFromNote:true,revision:1,sha256};
 await commitNotebookTransfer({target:scope,sources:[],drafts:[],blobs:[source],snapshots:[{key,accountId:scope.accountId,spaceId:scope.spaceId,value:receipt}],draftChecks:[{identity:target.identity,expected:target.draft}],blobChecks:[{identity:source,expected:undefined}],snapshotChecks:[{key,expected:undefined},{key:target.deletionKey,expected:undefined}]},current);return receipt;
}
export async function readPaperPdfImportOriginal(scopeInput:PaperPdfImportScope,id:string,current:()=>boolean=()=>true){const scope=scopeOf(scopeInput),{receipt}=await ownedReceipt(scope,id,current),source=await ownedFile(scope,receipt,receipt.sourceId,current);if(source.documentId!==sourceDocumentId(scope,id)||!source.removedFromNote)throw Error('La provenance du PDF conservé a changé.');return {blob:source.blob,name:receipt.sourceName};}
type PdfParser=(file:Blob,assetId:string,options:{current:()=>boolean;signal?:AbortSignal})=>Promise<PaperPage[]>;
/** A retry reuses the job's stable page/asset identities, never a fresh mapping. */
export async function preparePaperPdfImport(input:{scope:PaperPdfImportScope;id:string;current:()=>boolean;signal?:AbortSignal},parser?:PdfParser):Promise<PaperPdfImportReceipt>{
 const scope=scopeOf(input.scope),guard=input.current,signal=input.signal,current=()=>!signal?.aborted&&guard(),id=input.id,{row,receipt}=await ownedReceipt(scope,id,current);
 if(receipt.state!=='source-staged')return receipt;
 const source=await ownedFile(scope,receipt,receipt.sourceId,current);
 if(source.documentId!==sourceDocumentId(scope,id)||!source.removedFromNote)throw Error('La provenance de ce PDF a changé.');
 const parse=parser??(await import('./paperPdf')).importPaperPdf;check(current);
 const parsed=await parse(source.blob,receipt.assetId,{current,signal});check(current);
 const pages=parsed.map((page,index)=>({...structuredClone(page),id:`${resourceBase(scope,id)}-page-${index+1}`,pdf:{...page.pdf!,assetId:receipt.assetId,pageNumber:index+1}}));
 const pagesSha256=await localBlobDigest(new Blob([JSON.stringify(pages)],{type:'application/json'})),next:PaperPdfImportReceipt={...receipt,state:'ready',pages,pagesSha256};check(current);
 if(!validReceipt(next,scope,id))throw Error('Le format des pages PDF ne peut pas être ajouté. Le fichier original reste conservé.');
 const target=await durableTarget(scope,current),existing=(await listLocalBlobs(scope.accountId,scope.spaceId)).find(file=>file.id===receipt.assetId);check(current);
 if(existing)throw Error('Une pièce jointe utilise déjà l’identité du PDF conservé.');
 const asset:LocalBlob={...source,id:receipt.assetId,documentId:target.identity.documentId,removedFromNote:true};
 await commitNotebookTransfer({target:scope,sources:[],drafts:[],blobs:[asset],snapshots:[{...row,value:next}],draftChecks:[{identity:target.identity,expected:target.draft}],blobChecks:[{identity:source,expected:source},{identity:asset,expected:undefined}],snapshotChecks:[{key:row.key,expected:row},{key:target.deletionKey,expected:undefined}]},current);return next;
}
/** Publication, media activation, applied receipt and old revision are one CAS. */
export async function preparePaperPdfImportPublication(input:{document:PaperDocument;scope:PaperPdfImportScope;id:string;current:()=>boolean}):Promise<{draft:Draft;commit:NotebookTransferCommit;firstPageId:string;receipt:PaperPdfImportReceipt}>{
 const scope=scopeOf(input.scope),document=structuredClone(input.document),id=input.id,current=input.current;check(current);
 if(document.noteId!==scope.noteId||!isPaperDocument(document))throw Error('La destination du PDF appartient à une autre note.');
 const {row,receipt}=await ownedReceipt(scope,id,current);if(receipt.state==='applied')throw Error('Ce PDF a déjà été ajouté. Aucune nouvelle copie n’est créée.');if(receipt.state!=='ready')throw Error('Le PDF conservé doit d’abord être préparé.');
 if(await localBlobDigest(new Blob([JSON.stringify(receipt.pages)],{type:'application/json'}))!==receipt.pagesSha256)throw Error('Les pages préparées ont changé. Le PDF original reste disponible.');check(current);
 const target=await durableTarget(scope,current,document);
 if(document.collaboration?.lineage!==receipt.targetLineage)throw Error('La note de destination a changé d’identité.');
 if(document.assets.some(asset=>asset.id===receipt.assetId)||receipt.pages!.some(page=>document.pages.some(existing=>existing.id===page.id)))throw Error('Une identité de page ou de fichier existe déjà. La reprise n’ajoute pas de doublon.');
 const source=await ownedFile(scope,receipt,receipt.sourceId,current),asset=await ownedFile(scope,receipt,receipt.assetId,current);
 if(source.documentId!==sourceDocumentId(scope,id)||!source.removedFromNote||asset.documentId!==target.identity.documentId||!asset.removedFromNote)throw Error('Les fichiers du PDF ne sont plus dans leur préparation d’origine.');
 const now=new Date().toISOString(),content=amendPaperCollaboration(document,applyPaperCommand(document,{type:'batch',commands:[{type:'add-asset',asset:{id:receipt.assetId,name:receipt.sourceName,mediaType:'application/pdf',size:receipt.size}},...receipt.pages!.map(page=>({type:'insert-page' as const,page}))]},now),JSON.stringify([scope.accountId,scope.spaceId,scope.noteId]));
 if(!isPaperDocument(content))throw Error('Les pages dépassent le format du carnet. Le PDF préparé reste conservé.');
 const draft:Draft={...target.draft,content,updatedAt:Date.parse(now),syncState:'local'},applied:PaperPdfImportReceipt={...receipt,state:'applied',appliedAt:now,appliedRevision:content.revision};
 const historyKey=`paper-history|${scope.accountId}|${scope.spaceId}|whiteboard|${target.identity.documentId}|${String(document.revision).padStart(12,'0')}|pdf-import-${JSON.stringify(id)}`,history=await getSnapshot(historyKey);check(current);
 if(history&&(!sameScope(history,scope)||JSON.stringify(history.value)!==JSON.stringify(document)))throw Error('L’historique de cette importation appartient à une autre version.');
 const published:LocalBlob={...asset,removedFromNote:undefined,revision:(asset.revision??0)+1};
 const commit:NotebookTransferCommit={target:scope,sources:[],drafts:[draft],blobs:[published],snapshots:[{...row,value:applied},...(history?[]:[{key:historyKey,accountId:scope.accountId,spaceId:scope.spaceId,value:document}])],draftChecks:[{identity:target.identity,expected:target.draft}],blobChecks:[{identity:source,expected:source},{identity:asset,expected:asset}],snapshotChecks:[{key:row.key,expected:row},{key:target.deletionKey,expected:undefined},{key:historyKey,expected:history}]};
 return {draft,commit,firstPageId:receipt.pages![0].id,receipt:applied};
}
