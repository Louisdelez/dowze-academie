import {build} from 'vite';
import {indexedDB} from 'fake-indexeddb';
import {randomUUID,randomBytes} from 'node:crypto';
import {writeFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const out=await mkdtemp(join(process.cwd(),'tests/.transfer-live-'));
globalThis.indexedDB=indexedDB;Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
const host='https://academie.dowze.ch',run=randomUUID(),profile='qa-transfer-'+run,space='transfer-'+run,yearB='transfer-other-'+run;
const proof={date:new Date().toISOString(),host,synthetic:true,checks:[],passed:false};
let a,b,outside;
try{
 await build({configFile:false,ssr:{noExternal:['yjs','lib0']},build:{ssr:'tests/notebook-live-transfer-entry.ts',outDir:out,rollupOptions:{output:{entryFileNames:'live.mjs'}}},logLevel:'error'});
 const m=await import(pathToFileURL(out+'/live.mjs'));
 const client=()=>{let cookies='';return new m.ApiClient(host,async(input,init={})=>{const headers=new Headers(init.headers);headers.set('Origin',host);if(cookies)headers.set('Cookie',cookies);const response=await fetch(input,{...init,headers});const updated=response.headers.getSetCookie();if(updated.length)cookies=updated.map(c=>c.split(';')[0]).join('; ');return response;},m.ownsPaperDocument);};
 a=client();b=client();outside=client();const email=`notebook.transfer.${run}@dowze.ch`,password=randomBytes(24).toString('base64url');
 const owner=await a.register(email,password);await a.login(email,password);await a.me();await b.login(email,password);await b.me();proof.accountId=owner.id;proof.spaceId=space;
 await a.putSpace(space,'notebook-qa','2026-2027','Recette transfert isolée');await a.putSpace(yearB,'notebook-qa','2027-2028','Autre année de recette');
 const source={accountId:'local-'+profile,spaceId:'local-year'},target={accountId:owner.id,spaceId:space,api:a};
 const stamp='2026-10-12T10:00:00Z',plain=m.migratePaper('qa-local-'+run,'Texte local transféré avec son dessin, sa photo et son enregistrement.',null,stamp);
 const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/bX8AAAAASUVORK5CYII=','base64'));
 const wav=new Uint8Array(46),v=new DataView(wav.buffer);for(const [offset,tag] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']])for(let i=0;i<tag.length;i++)wav[offset+i]=tag.charCodeAt(i);v.setUint32(4,38,true);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,16000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);v.setUint32(40,2,true);
 const withMedia=m.applyPaperCommand(plain,{type:'batch',commands:[{type:'add-asset',asset:{id:'qa-photo',name:'pixel.png',mediaType:'image/png',size:png.length}},{type:'add-asset',asset:{id:'qa-audio',name:'silence.wav',mediaType:'audio/wav',size:wav.length}},{type:'add-audio',audio:{id:'qa-recording',assetId:'qa-audio',name:'Son synthétique',duration:0.000125,startedAt:1}},{type:'upsert-object',object:{id:'qa-ink',kind:'ink',pageId:plain.pages[0].id,x:0,y:0,width:300,height:200,rotation:0,z:2,locked:false,createdAt:1,color:'#4461dc',strokeWidth:3,points:[{x:40,y:120,time:1},{x:200,y:180,time:2}]}}]});
 const doc=m.amendPaperCollaboration(withMedia,withMedia),draft={...source,type:'whiteboard',documentId:m.notebookDocumentId(doc.noteId),title:'Origine',content:doc,baseVersion:0,syncState:'local',updatedAt:1};await m.putDraft(draft);
 await m.putLocalBlob({...source,id:'qa-photo',name:'pixel.png',blob:new Blob([png],{type:'image/png'}),createdAt:1,status:'pending'});await m.putLocalBlob({...source,id:'qa-audio',name:'silence.wav',blob:new Blob([wav],{type:'audio/wav'}),createdAt:1,status:'pending'});
 const sourceFiles=(await m.listLocalBlobs(source.accountId,source.spaceId)).map(({blob,...rest})=>rest);
 await m.synchronizeSpace(a,owner.id,space,()=>true);const result=await m.transferNotebookScope({profileId:profile,localSpaceId:source.spaceId,target,notes:[],current:()=>true});assert.equal(result.conflicts,0);
 await m.synchronizeSpace(a,owner.id,space,()=>true);await m.synchronizeSpace(a,owner.id,space,()=>true);
 const changes=await b.changes(space),row=changes.items.filter(c=>c.document_id===draft.documentId).at(-1);assert.ok(row);const received=await m.decodePaperSync(b,space,row.content);assert.equal(received.objects.find(o=>o.kind==='text').markdown,plain.objects[0].markdown);assert.equal(received.objects.find(o=>o.kind==='ink').points.length,2);assert.equal(received.audio.length,1);assert.equal((await m.getDraft({...target,type:'whiteboard',documentId:draft.documentId})).syncState,'synced');
 for(const asset of received.assets){assert.ok(asset.serverId);const bytes=new Uint8Array(await (await b.downloadBlob(space,asset.serverId)).arrayBuffer());assert.deepEqual(bytes,asset.id==='qa-photo'?png:wav);}
 proof.checks.push('Vrai transfert local vers Dowze-01 puis lecture dans une seconde session : texte, encre, photo et WAV exacts');
 assert.deepEqual((await m.getDraft(draft)).content,doc);assert.deepEqual((await m.listLocalBlobs(source.accountId,source.spaceId)).map(({blob,...rest})=>rest),sourceFiles);proof.checks.push('Source locale et métadonnées des pièces jointes inchangées après publication et confirmation');
 const other=await m.transferNotebookScope({profileId:profile,localSpaceId:source.spaceId,target:{accountId:owner.id,spaceId:yearB,api:a},notes:[],current:()=>true});assert.equal(other.sourceMaySeedMetadata,false);await m.synchronizeSpace(a,owner.id,yearB,()=>true);assert.equal((await b.changes(yearB)).items.length,0);proof.checks.push('Aucune réplication implicite du carnet dans une autre année serveur');
 const otherPassword=randomBytes(24).toString('base64url'),otherEmail=`notebook.transfer.outside.${run}@dowze.ch`;await outside.register(otherEmail,otherPassword);await outside.login(otherEmail,otherPassword);await outside.me();let denied=false;try{await outside.downloadBlob(space,received.assets[0].serverId);}catch(e){denied=[403,404].includes(e.status);}assert.equal(denied,true);proof.checks.push('Compte synthétique distinct : accès aux pièces jointes privées refusé');
 proof.passed=true;
}catch(error){proof.failure=error instanceof Error?error.message:String(error);}finally{await Promise.allSettled([a?.logout(),b?.logout(),outside?.logout()]);await rm(out,{recursive:true,force:true});}
await writeFile('/home/louis/Documents/Dowze-Notebook-Implementation-20261012/live-transfer-proof.json',JSON.stringify(proof,null,2));console.log(JSON.stringify({passed:proof.passed,checks:proof.checks,failure:proof.failure}));if(!proof.passed)process.exitCode=1;
