/** One mounted group for the actual personal-template component and exports.
 * Native WebCrypto, production template/storage helpers and Tauri JS adapter
 * run; controlled authority props, DOM geometry and native IPC are test seams.
 * Called only by the central guarded suite. No standalone runtime or OS claim. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const TEMPLATE_EXPORT_UI_GROUP='Real personal template export refuses API and generation ABA after native SHA preparation, preserves its sources and allows an exact fresh retry';
const sha=value=>createHash('sha256').update(value).digest('hex');
const jsonSha=value=>sha(JSON.stringify(value));
const blobBytes=async blob=>Buffer.from(await blob.arrayBuffer());
const restoreProperty=(target,name,descriptor)=>{if(descriptor)Object.defineProperty(target,name,descriptor);else delete target[name];};

/** Read-only React observation, using the parent's committed-root resolver.
 * Waiting the old queue is necessary: its writer can already be unregistered
 * after authority retirement while its accepted native digest remains held. */
function templateProps(fiber,details){
 return fiber(details,props=>props?.document&&props?.pageId&&props?.media&&typeof props.generation==='number'&&typeof props.onExport==='function').memoizedProps;
}
function templateSession(fiber,details){
 const owner=fiber(details,props=>props?.document&&props?.pageId&&props?.media&&typeof props.generation==='number'&&typeof props.onExport==='function');
 for(let hook=owner.memoizedState,left=48;hook&&left--;hook=hook.next){
  const value=Array.isArray(hook.memoizedState)?hook.memoizedState[0]:null;
  if(typeof value?.key==='string'&&typeof value.alive==='boolean'&&typeof value.pending==='number'&&typeof value.tail?.then==='function'&&typeof value.opening?.then==='function')return value;
 }
 throw Error('The real personal-template queue session was not found');
}
function descriptorFor(data){
 const bytes=ArrayBuffer.isView(data)?new Uint8Array(data.buffer,data.byteOffset,data.byteLength):data instanceof ArrayBuffer?new Uint8Array(data):null;
 if(!bytes||bytes.byteLength>65536)return null;
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{return null;}
}

export async function runTemplateExportUiGroup({group,m,mount,click,wait,idle,state,stored,fiber,bounded,gate,fixtures}){
 await group(TEMPLATE_EXPORT_UI_GROUP,async()=>{
  for(const name of ['PaperPersonalTemplates','loadPaperPersonalTemplates','exportPaperPersonalTemplate','inspectPaperPersonalTemplateImport','savePaperExport'])assert.equal(typeof m[name],'function','The actual entry export is required: '+name);
  assert.ok(fixtures instanceof Set,'The second actual React root must use the parent cleanup registry');
  const f=await mount({notebook:true}),A=f.props.media,apiA={},apiB={};
  await click(f.container.querySelector('[aria-label="Afficher les pages"]'));
  const parentDetails=()=>f.container.querySelector('.paper-personal-templates');
  await wait(()=>!!parentDetails(),'The actual Notebook must mount its real personal-template library');
  let parentGeneration=state(f).generation;
  assert.equal(templateProps(fiber,parentDetails()).generation,parentGeneration,'The actual parent must pass its viewport generation');
  for(const api of [apiA,apiB,apiA]){
   await f.render({media:{...A,api}});
   await wait(()=>!!parentDetails()&&templateProps(fiber,parentDetails()).media.api===api&&templateProps(fiber,parentDetails()).generation===state(f).generation,'The actual parent must pass the committed API and generation');
   assert.ok(state(f).generation>parentGeneration,'Every actual parent API transition must create a fresh generation');parentGeneration=state(f).generation;
  }
  await idle(f);
  const source=structuredClone(await stored(f)),scope={accountId:A.accountId,spaceId:A.spaceId},sourceDraftSha=jsonSha(await m.getDraft({ ...scope,type:'whiteboard',documentId:m.notebookDocumentId(f.props.noteId)}));
  const container=document.createElement('div');container.className='recipe-container';document.body.append(container);const root=m.createRoot(container);
  // Matches the parent's readCleanupState()/dispose() contract; no custom
  // disposer or fake editor/paper handle is introduced for this second root.
  const fixture={container,root,notebook:false,strict:false,live:true,allowed:true,report:null,handles:new Set(),captureLog:[],base:{document:source},props:{noteId:source.noteId,media:{...A,api:apiA},generation:1,intent:null,mode:'continuous'}};
  container.recipeFixture=fixture;fixtures.add(fixture);
  const notices=[],sessions=new Set(),holds=new Set();let ledger={exports:[],commands:[],parts:[],finished:0,downloads:0};
  const modelName='Actual API ABA template',expectedName=modelName+'.dowzetemplate',destination='/tmp/qa-mounted-template.dowzetemplate',exportId='qa-owned-template-export';
  const onExport=async(blob,name,current)=>{ledger.exports.push({blob,name,currentAtCall:current()});return m.savePaperExport(blob,name,'template',current);};
  const render=async change=>{
   fixture.props={...fixture.props,...change};
   await m.act(async()=>root.render(m.createElement(m.PaperPersonalTemplates,{document:source,pageId:'page-A',media:fixture.props.media,generation:fixture.props.generation,disabled:false,onUse:async()=>false,onNotice:message=>notices.push(message),onExport})));
   await wait(()=>{const details=container.querySelector('.paper-personal-templates');if(!details)return false;const props=templateProps(fiber,details);return props.media.api===fixture.props.media.api&&props.generation===fixture.props.generation;},'The controlled authority must actually commit, including while old work is held');
  };
  const details=()=>container.querySelector('.paper-personal-templates');
  const button=()=>Array.from(container.querySelectorAll('.paper-personal-template-list button')).find(node=>node.getAttribute('aria-label')==='Exporter le modèle '+modelName);
  const scopeProof=async()=>{
   const rows=await m.listLocalBlobs(scope.accountId,scope.spaceId),files=[];
   for(const {blob,...metadata} of rows)files.push({metadata,bytesSha:sha(await blobBytes(blob))});
   return {draft:jsonSha(await m.getDraft({...scope,type:'whiteboard',documentId:m.notebookDocumentId(source.noteId)})),snapshots:jsonSha(await m.listSnapshots(scope.accountId,scope.spaceId)),library:jsonSha(await m.loadPaperPersonalTemplates(scope,()=>true)),files:jsonSha(files),mutations:jsonSha(await m.listMutations(scope.accountId,scope.spaceId))};
  };
  const drain=async session=>{await m.act(async()=>{await bounded(session.tail,'The captured actual template queue must drain');});};
  let digestRestore=null,nativeDescriptor=null,nativeInstalled=false,anchorDescriptor=null,anchorPrototype=null;
  const failures=[];
  try{
   await render({});const originalDetails=details();assert.ok(originalDetails);
   await click(originalDetails.querySelector('summary'));assert.equal(originalDetails.open,true,'The actual template form must be opened');
   await wait(()=>originalDetails.querySelector('[aria-label="Nom du modèle personnel"]')?.disabled===false,'The real creation library must finish opening');const input=originalDetails.querySelector('[aria-label="Nom du modèle personnel"]');assert.ok(input);const view=input.ownerDocument.defaultView;
   await m.act(async()=>{Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype,'value').set.call(input,modelName);input.dispatchEvent(new view.Event('input',{bubbles:true}));input.dispatchEvent(new view.Event('change',{bubbles:true}));});
   await wait(()=>originalDetails.querySelector('[aria-label="Créer le modèle personnel"]')?.disabled===false,'The real creation form must accept the entered model name');
   const creationSession=templateSession(fiber,originalDetails);sessions.add(creationSession);await click(originalDetails.querySelector('[aria-label="Créer le modèle personnel"]'));await drain(creationSession);
   await wait(()=>button()?.disabled===false,'Actual creation must expose its durable model and real export button');
   const library=await m.loadPaperPersonalTemplates(scope,()=>true);assert.equal(library.templates.length,1,'The test must create one real model, never seed a fake library');const template=library.templates[0];
   assert.equal(template.name,modelName);assert.equal(template.schema,1);assert.equal(template.version,1);assert.equal(template.source.kind,'document');assert.equal(template.source.documentSha256,jsonSha(source));assert.equal(template.pageCount,1);
   assert.equal((await scopeProof()).draft,sourceDraftSha,'Creating the model must preserve its canonical source');
   const expectedPortable=await m.exportPaperPersonalTemplate(template,scope,()=>true),expected=await blobBytes(expectedPortable),baseline=await scopeProof();
   assert.ok(expected.length>0);const baselineSha=sha(expected);
   nativeDescriptor=Object.getOwnPropertyDescriptor(window,'__TAURI_INTERNALS__');nativeInstalled=true;
   Object.defineProperty(window,'__TAURI_INTERNALS__',{configurable:true,value:{invoke:async(name,args)=>{
    ledger.commands.push(name);
    if(name==='plugin:dialog|save'){assert.equal(args.options.defaultPath,expectedName);assert.deepEqual(args.options.filters[0].extensions,['dowzetemplate']);return destination;}
    if(name==='begin_notebook_export'){assert.equal(args.kind,'template');assert.equal(args.destinationPath,destination);assert.equal(args.totalBytes,expected.length);return exportId;}
    assert.equal(args.exportId,exportId,'Native chunks must belong to the admitted fresh export');
    if(name==='push_notebook_export'){assert.equal(args.offset,ledger.parts.reduce((total,part)=>total+part.length,0));ledger.parts.push(Buffer.from(args.dataBase64,'base64'));return;}
    if(name==='finish_notebook_export'){ledger.finished++;return;}
    if(name==='abort_notebook_export')return;
    throw Error('Unexpected native template export command: '+name);
   }}});
   anchorPrototype=originalDetails.ownerDocument.defaultView.HTMLAnchorElement.prototype;anchorDescriptor=Object.getOwnPropertyDescriptor(anchorPrototype,'click');const actualAnchorClick=anchorPrototype.click;
   Object.defineProperty(anchorPrototype,'click',{configurable:true,writable:true,value:function(...args){if(this.download)ledger.downloads++;return Reflect.apply(actualAnchorClick,this,args);}});
   for(const variant of ['API-ABA','generation-ABA']){
    ledger={exports:[],commands:[],parts:[],finished:0,downloads:0};notices.length=0;
    await render({media:{...A,api:apiA},generation:1});assert.equal(details(),originalDetails,'Authority variants must reuse the same mounted component and DOM');await wait(()=>button()?.disabled===false,'The current model must be loaded before actual export admission');
    const subtle=crypto.subtle,originalDigest=Object.getOwnPropertyDescriptor(subtle,'digest'),actualDigest=subtle.digest,entered=gate(),held=gate();holds.add(held);let armed=true,nativeShaResolved=false,suspensions=0;
    digestRestore=()=>restoreProperty(subtle,'digest',originalDigest);
    Object.defineProperty(subtle,'digest',{configurable:true,writable:true,value:async function(algorithm,data){
     const result=await Reflect.apply(actualDigest,this,[algorithm,data]);
     const name=typeof algorithm==='string'?algorithm:algorithm?.name,descriptor=armed&&name?.toUpperCase()==='SHA-256'?descriptorFor(data):null;
     if(armed&&descriptor?.kind==='paper-personal-template-portable'&&descriptor.id===template.id&&descriptor.version===template.version){armed=false;nativeShaResolved=true;suspensions++;entered.resolve();await held.promise;}
     return result;
    }});
    const oldSession=templateSession(fiber,details());sessions.add(oldSession);const previousTail=oldSession.tail;
    await click(button());assert.notEqual(oldSession.tail,previousTail,'The actual export button must admit real queue work');const originalTail=oldSession.tail;
    await bounded(entered.promise,'The actual final portable descriptor SHA must finish before authority changes');
    assert.equal(nativeShaResolved,true);assert.equal(suspensions,1);assert.equal(oldSession.pending,1);assert.equal(ledger.exports.length,0);assert.deepEqual(ledger.commands,[]);
    if(variant==='API-ABA'){await render({media:{...A,api:apiB}});await render({media:{...A,api:apiA}});}
    else{await render({generation:2});await render({generation:1});}
    assert.equal(details(),originalDetails);assert.equal(originalDetails.isConnected,true);const freshSession=templateSession(fiber,details());sessions.add(freshSession);assert.equal(templateProps(fiber,details()).media.api,apiA);assert.equal(templateProps(fiber,details()).generation,1);
    await m.act(async()=>{held.resolve();await bounded(originalTail,'The exact retired template export tail must drain');});holds.delete(held);
    assert.equal(oldSession.pending,0);assert.equal(ledger.exports.length,0,'Retired work must never call onExport after ABA');assert.deepEqual(ledger.commands,[],'Retired work must never open a dialogue or start native IPC');assert.equal(ledger.downloads,0);assert.deepEqual(notices,[],'Retired work may not publish a success/error notice into the current view');assert.deepEqual(await scopeProof(),baseline,'Retired export must preserve every durable source and library/file revision');
    digestRestore();digestRestore=null;
    await wait(()=>button()?.disabled===false,'The current admission must allow a fresh retry');const retrySession=templateSession(fiber,details());sessions.add(retrySession);const beforeRetryTail=retrySession.tail;
    await click(button());assert.notEqual(retrySession.tail,beforeRetryTail,'Fresh retry must create new work');await drain(retrySession);
    assert.equal(ledger.exports.length,1);assert.equal(ledger.exports[0].currentAtCall,true);assert.equal(ledger.exports[0].name,expectedName);assert.equal(ledger.finished,1);assert.equal(ledger.commands.filter(name=>name==='plugin:dialog|save').length,1);assert.equal(ledger.commands.filter(name=>name==='begin_notebook_export').length,1);assert.equal(ledger.commands.filter(name=>name==='finish_notebook_export').length,1);assert.equal(ledger.commands.includes('abort_notebook_export'),false);assert.equal(ledger.downloads,0);
    const actual=Buffer.concat(ledger.parts);assert.equal(Buffer.compare(actual,expected),0,'The fresh actual JS native adapter must receive the exact portable bytes');assert.equal(sha(actual),baselineSha);assert.equal(sha(await blobBytes(ledger.exports[0].blob)),baselineSha);
    const preview=await m.inspectPaperPersonalTemplateImport(ledger.exports[0].blob,()=>true);assert.equal(preview.kind,'template');assert.equal(preview.name,modelName);assert.equal(preview.mode,template.mode);assert.equal(preview.pages.length,template.pageCount);
    assert.deepEqual(await scopeProof(),baseline,'An exact fresh export may not mutate, duplicate or replace its original model or source');assert.equal((await m.loadPaperPersonalTemplates(scope,()=>true)).templates.length,1);assert.equal(retrySession.pending,0);
   }
  }catch(error){failures.push(error);}
  finally{
   for(const held of holds)held.resolve();
   for(const session of sessions)try{await drain(session);}catch(error){failures.push(error);}
   try{if(digestRestore)digestRestore();}catch(error){failures.push(error);}
   try{if(anchorPrototype)restoreProperty(anchorPrototype,'click',anchorDescriptor);}catch(error){failures.push(error);}
   try{if(nativeInstalled)restoreProperty(window,'__TAURI_INTERNALS__',nativeDescriptor);}catch(error){failures.push(error);}
  }
  if(failures.length)throw new AggregateError(failures,'Actual template export ABA or exact cleanup failed');
 });
}
