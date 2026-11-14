/** Mounted legacy-copy UI cases. Called by the central complete parent suite;
 * actual Notebook/storage, seeded old receipt, no native or crash claim. */
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';

export const LEGACY_APPEND_UI_GROUP='Actual Notebook explicitly recovers legacy append media or acknowledges the complete mapped graph and never repeats after Undo';
const digest=async blob=>createHash('sha256').update(new Uint8Array(await blob.arrayBuffer())).digest('hex');

export async function runLegacyAppendUiRecoveryGroup({group,m,mount,click,wait,idle,state,stored,durable}){
 await group(LEGACY_APPEND_UI_GROUP,async()=>{
  for(const alreadyPresent of [false,true]){
   const f=await mount({notebook:true}),scope={...f.props.media,noteId:f.props.noteId},beforeOld=structuredClone(await stored(f));
   const bytes=new Blob([Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==','base64'))],{type:'image/png'}),sha=await digest(bytes),source=m.migratePaper('synthetic-old-source','Texte historique conservé.',null,'2026-10-15T10:00:00Z');
   const sourceDocument=m.applyPaperCommand(source,{type:'batch',commands:[
    {type:'add-asset',asset:{id:'legacy-image',name:'image-historique.png',mediaType:'image/png',size:bytes.size}},
    {type:'upsert-object',object:{...source.objects[0],id:'legacy-image-object',kind:'image',markdown:undefined,assetId:'legacy-image',x:150,y:160}},
   ]},'2026-10-15T10:00:00Z');
   const mapped=m.appendPaperArchive(sourceDocument,scope.noteId),sourceKey=`paper-import-append|${scope.accountId}|${scope.spaceId}|${scope.noteId}|${randomUUID()}`,sourceName=alreadyPresent?'legacy-present.dowze':'legacy-copy.dowze';
   await m.putSnapshot({key:sourceKey,accountId:scope.accountId,spaceId:scope.spaceId,value:{schema:1,sourceName,sourceDocument,assets:Object.fromEntries(mapped.assets),commands:mapped.commands}});
   await m.putLocalBlob({accountId:scope.accountId,spaceId:scope.spaceId,id:mapped.assets.get('legacy-image'),documentId:m.notebookDocumentId(scope.noteId),blob:bytes,name:'image-historique.png',createdAt:2,status:'pending',removedFromNote:true});
   if(alreadyPresent)await m.act(async()=>{assert.equal(state(f).paper.command({type:'batch',commands:mapped.commands}),true);await state(f).paper.whenSaved();});
   await idle(f);
   const baseline=structuredClone(await stored(f)),sourceReceipt=await m.getSnapshot(sourceKey),filesBefore=await m.listLocalBlobs(scope.accountId,scope.spaceId),historyPrefix=`paper-history|${scope.accountId}|${scope.spaceId}|whiteboard|${m.notebookDocumentId(scope.noteId)}|`,historiesBefore=(await m.listSnapshots(scope.accountId,scope.spaceId)).filter(row=>row.key.startsWith(historyPrefix));
   assert.deepEqual(await m.listPaperLegacyAppendArchiveRecoveries({scope,current:()=>true,includeApplied:true}),[],'Opening the Notebook cannot automatically migrate an old append receipt');
   assert.equal(filesBefore.length,1);assert.equal(await digest(filesBefore[0].blob),sha);
   await click(f.container.querySelector('[aria-label="Importations à reprendre"]'));
   const panel=()=>f.container.querySelector('section[aria-label="Importations à reprendre"]');
   await wait(()=>Array.from(panel()?.querySelectorAll('li')??[]).some(row=>row.textContent.includes(sourceName)),'The real panel must expose the preserved old append source');
   const row=Array.from(panel().querySelectorAll('li')).find(row=>row.textContent.includes(sourceName));
   assert.equal(row.querySelector('time'),null,'There is no invented historical import date');
   assert.equal(Array.from(row.querySelectorAll('button')).some(button=>button.textContent.includes('original')),false,'An absent ZIP must not be offered as an original');
   assert.ok(row.textContent.includes('ZIP'),'The missing ZIP must be stated before explicit recovery');
   const recover=Array.from(row.querySelectorAll('button')).find(button=>button.textContent==='Récupérer une nouvelle copie');assert.ok(recover);assert.equal(recover.disabled,false);
   await click(recover);
   let receipts;
   await wait(async()=>{receipts=await m.listPaperLegacyAppendArchiveRecoveries({scope,current:()=>true,includeApplied:true});return receipts.length===1&&receipts[0].state==='applied';},'The actual recovery button must await one durable terminal admission');
   await idle(f);
   await wait(()=>panel()&&!panel().querySelector('li')&&Array.from(panel().querySelectorAll('button')).some(button=>button.textContent==='Actualiser'&&!button.disabled),'The actual panel must hide the processed historical source');
   const receipt=receipts[0],next=await stored(f),files=await m.listLocalBlobs(scope.accountId,scope.spaceId);
   assert.equal(receipt.outcome,alreadyPresent?'already-present':'copy');assert.deepEqual(receipt.sourceReceipt,sourceReceipt);assert.deepEqual(await m.getSnapshot(sourceKey),sourceReceipt);assert.equal(receipt.quality.sourceZip,'absent');assert.equal(receipt.quality.originalIntegrity,'unproven');assert.equal(receipt.quality.historicalIncarnation,'unproven');
   assert.deepEqual(next.pages.slice(0,baseline.pages.length),baseline.pages,'Every pre-existing page and its geometry survive');assert.deepEqual(next.objects.slice(0,baseline.objects.length),baseline.objects,'Every pre-existing object survives unchanged');
   if(alreadyPresent){
    assert.deepEqual(next,baseline,'Recognizing the existing full mapped contribution must not write a new canonical revision');assert.equal(receipt.publishedRevision,baseline.revision);assert.equal(receipt.beforeHistoryKey,undefined);assert.equal(files.length,1);assert.equal(files[0].id,filesBefore[0].id);assert.equal(files[0].removedFromNote,false);
    assert.deepEqual((await m.listSnapshots(scope.accountId,scope.spaceId)).filter(row=>row.key.startsWith(historyPrefix)),historiesBefore,'A present-content acknowledgement must not invent undo history');
   }else{
    assert.equal(next.pages.length,baseline.pages.length+sourceDocument.pages.length);assert.equal(next.objects.length,baseline.objects.length+sourceDocument.objects.length);assert.equal(files.length,2);assert.ok(receipt.copy);
    assert.ok(receipt.copy.commands.filter(command=>command.type==='insert-page').every(command=>!mapped.commands.some(old=>old.type==='insert-page'&&old.page.id===command.page.id)),'Explicit copies require fresh page identities');
    const descriptor=receipt.copy.files[0],copied=files.find(file=>file.id===descriptor.id);assert.notEqual(copied.id,filesBefore[0].id);assert.equal(copied.removedFromNote,false);assert.equal(copied.sha256,sha);assert.equal(await digest(copied.blob),sha);assert.deepEqual(files.find(file=>file.id===filesBefore[0].id),filesBefore[0]);
    assert.deepEqual((await m.getSnapshot(receipt.beforeHistoryKey)).value,baseline,'The real prepared publication preserves the prior note in its atomic history');
   }
   for(const file of files)assert.equal(await digest(file.blob),sha,'No historical/current byte is manufactured or changed');
   await wait(()=>f.container.querySelector('button[aria-label="Annuler"]')?.disabled===false,'The real Notebook must retain Undo for its authored append');
   await click(f.container.querySelector('button[aria-label="Annuler"]'));await idle(f);
   await durable(f,document=>JSON.stringify(document.pages)===JSON.stringify(beforeOld.pages)&&JSON.stringify(document.objects)===JSON.stringify(beforeOld.objects),'Actual Undo removes only the authored contribution');
   const afterUndo=structuredClone(await stored(f)),terminal=structuredClone(receipt);
   await click(Array.from(panel().querySelectorAll('button')).find(button=>button.textContent==='Actualiser'));
   await wait(()=>panel()&&!panel().querySelector('li')&&Array.from(panel().querySelectorAll('button')).some(button=>button.textContent==='Actualiser'&&!button.disabled),'Refreshing after Undo must not revive either the historical source or its terminal copy');
   assert.deepEqual(await m.listPaperLegacyAppendArchiveRecoveries({scope,current:()=>true,includeApplied:true}),[terminal]);assert.deepEqual(await stored(f),afterUndo);assert.deepEqual(await m.getSnapshot(sourceKey),sourceReceipt);assert.equal((await m.listLocalBlobs(scope.accountId,scope.spaceId)).length,files.length);
  }
 });
}
