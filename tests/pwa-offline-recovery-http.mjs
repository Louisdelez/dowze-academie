/** Private HTTP oracle for the real PWA recipe. No production server or credentials. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
import {resolve,sep} from 'node:path';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const stamp='2026-10-15T10:00:00.000Z';
export function createPwaRecoveryHttp(web){
 const accounts=new Map(),sessions=new Map(),idempotency=new Map(),remote=new Map(),blobs=new Map(),sockets=new Set(),handlers=new Set();
 const ledger={requests:[],effects:[],dropped:[],sessionIssuances:[],abortedRequests:0,protocolErrors:[]};let sequence=0,drop=null;
 const scoped=(a,s,t,id)=>JSON.stringify([a,s,t,id]);
 function seed(runId){
  const account={id:'pwa-recovery-A-'+runId,email:'fixture-'+runId+'@qa.invalid',created_at:stamp},space={id:'year-one',formation_id:'synthetic',academic_year:'2026-2027',title:'Private recovery year',created_at:stamp},noteId='qa-recovery-note',title='Private recovery note',markdown='Private PWA recovery paragraph.';
  accounts.set(account.email,{account,space,noteId,title,markdown});
  const value={space_id:space.id,document_type:'notesMarkdown',document_id:noteId,version:1,content:{id:noteId,title,markdown,tags:['synthetic'],subjectIds:[],createdAt:stamp,updatedAt:stamp},deleted:false,changed_at:stamp,sequence:++sequence};
  remote.set(scoped(account.id,space.id,'notesMarkdown',noteId),{accountId:account.id,value});
  return {account,space,noteId,title,markdown};
 }
 const handle=async(req,res)=>{
  let observedRequest;const json=(value,status=200,headers={})=>{if(observedRequest)observedRequest.status=status;res.writeHead(status,{'content-type':'application/json','cache-control':'no-store',...headers});res.end(JSON.stringify(value));};
  try{
   const url=new URL(req.url,'http://127.0.0.1'),path=decodeURIComponent(url.pathname);
   if(!path.startsWith('/v1/')){
    ledger.requests.push({method:req.method,path,kind:'asset'});
    if(path==='/__qa_empty'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end('<!doctype html><title>Private empty origin observation</title>');return;}
    if(!path.startsWith('/app/')){res.writeHead(404);res.end('Private PWA path only');return;}
    const target=resolve(web,path==='/app/'?'index.html':path.slice(5));
    if(!target.startsWith(resolve(web)+sep)){res.writeHead(404);res.end('Private PWA asset path refused');return;}
    let info;try{info=await stat(target);}catch(error){if(error.code!=='ENOENT')throw error;}
    if(!info||info.isDirectory()){res.writeHead(404);res.end('Private PWA asset absent');return;}
    const bytes=await readFile(target);
    res.writeHead(200,{'content-type':target.endsWith('.html')?'text/html; charset=utf-8':/\.m?js$/.test(target)?'text/javascript; charset=utf-8':target.endsWith('.css')?'text/css; charset=utf-8':target.endsWith('.wasm')?'application/wasm':target.endsWith('.svg')?'image/svg+xml':target.endsWith('.png')?'image/png':target.endsWith('.woff2')?'font/woff2':target.endsWith('.woff')?'font/woff':target.endsWith('.json')||target.endsWith('.webmanifest')?'application/json':'application/octet-stream','cache-control':'no-store',...(path==='/app/sw.js'?{'service-worker-allowed':'/app/'}:{})});res.end(bytes);return;
   }
   let size=0;const chunks=[];for await(const part of req){size+=part.length;if(size>16*1024*1024)throw Error('Private request body limit');chunks.push(part);}const bytes=Buffer.concat(chunks);
   const token=/\bqa_pwa_session=([^;]+)/.exec(req.headers.cookie??'')?.[1],owner=token?sessions.get(token):undefined;
   const request={method:req.method,path,kind:'api',accountId:owner?.account.id??null,cookiePresent:!!token,cookieValueSHA256:token?sha(Buffer.from(token)):null,cookieMatchedSession:!!owner,id:String(req.headers['x-idempotency-key']??''),bytes:size,bodySha256:sha(bytes),atUTC:new Date().toISOString()};observedRequest=request;res.once('finish',()=>{request.responseFinished=true;});ledger.requests.push(request);
   if(path==='/v1/sessions'&&req.method==='POST'){
    const body=JSON.parse(bytes.toString()),found=accounts.get(body.email);assert.ok(found&&body.password==='private-fixture-only','Only synthetic fixture login');
    const token=randomUUID();sessions.set(token,found);ledger.sessionIssuances.push({accountId:found.account.id,name:'qa_pwa_session',valueSHA256:sha(Buffer.from(token)),httpOnly:true,sameSite:'Lax',path:'/',maxAge:3600,atUTC:new Date().toISOString()});json({expires_at:'2099-01-01T00:00:00Z',csrf_token:'private-fixture-csrf'},200,{'set-cookie':'qa_pwa_session='+token+'; HttpOnly; SameSite=Lax; Max-Age=3600; Path=/'});return;
   }
   if(!owner){json({code:'unauthenticated',message:'Private fixture login required'},401);return;}
   if(path==='/v1/me'&&req.method==='GET'){json(owner.account);return;}
   if(path==='/v1/csrf'&&req.method==='GET'){json({csrf_token:'private-fixture-csrf'});return;}
   if(path==='/v1/spaces'&&req.method==='GET'){assert.equal(req.headers['x-dowze-account'],owner.account.id);json({items:[owner.space],has_more:false,next_after:null});return;}
   if(path==='/v1/catalog'&&req.method==='GET'){json({items:[]});return;}
   const match=/^\/v1\/spaces\/([^/]+)\/(changes|documents|blobs)(?:\/([^/]+))?(?:\/([^/]+))?$/.exec(path);assert.ok(match,'Unexpected private PWA API '+path);assert.equal(match[1],owner.space.id);assert.equal(req.headers['x-dowze-account'],owner.account.id);
   const scope={accountId:owner.account.id,spaceId:owner.space.id};
   if(match[2]==='changes'&&req.method==='GET'){
    const cursor=Number(url.searchParams.get('cursor')??0),items=[...remote.values()].filter(row=>row.accountId===scope.accountId&&row.value.space_id===scope.spaceId&&row.value.sequence>cursor).map(row=>row.value).sort((a,b)=>a.sequence-b.sequence);
    json({items,next_cursor:String(sequence),has_more:false});return;
   }
   if(match[2]==='blobs'&&req.method==='GET'&&match[3]){
    const row=blobs.get(scoped(scope.accountId,scope.spaceId,'blob',match[3]));assert.ok(row,'Only confirmed private blobs may be downloaded');res.writeHead(200,{'content-type':row.info.media_type,'content-length':row.bytes.length,'X-Content-SHA256':row.info.sha256,'cache-control':'no-store'});res.end(row.bytes);return;
   }
   assert.equal(req.headers['x-csrf-token'],'private-fixture-csrf');assert.ok(request.id,'Every private mutation needs its real idempotency key');
   const mutationKey=scoped(scope.accountId,scope.spaceId,'mutation',request.id),before=idempotency.get(mutationKey),signature=JSON.stringify([req.method,path,request.bodySha256]);
   if(before){assert.equal(before.signature,signature,'A restarted idempotency key must preserve exact method/path/body');if(drop?.blockedId===request.id){req.socket.destroy();return;}json(before.value);return;}
   let value,type,documentId;
   if(match[2]==='documents'&&req.method==='PUT'&&match[3]&&match[4]){
    type=match[3];documentId=match[4];const body=JSON.parse(bytes.toString()),key=scoped(scope.accountId,scope.spaceId,type,documentId),previous=remote.get(key)?.value;request.baseVersion=body.base_version;request.currentVersion=previous?.version??0;request.contentSha256=sha(Buffer.from(JSON.stringify(body.content)));
    assert.ok(Number.isSafeInteger(body.base_version));if(body.base_version!==(previous?.version??0)){json({code:'version_conflict',current_version:previous?.version??0,message:'Private version differs'},409);return;}
    value={space_id:scope.spaceId,document_type:type,document_id:documentId,version:body.base_version+1,content:body.content,deleted:false,changed_at:new Date().toISOString(),sequence:++sequence};remote.set(key,{accountId:scope.accountId,value});
   }else if(match[2]==='blobs'&&req.method==='POST'&&!match[3]){
    assert.equal(req.headers['x-content-sha256'],request.bodySha256,'Actual uploaded bytes SHA must match');type='blob';documentId='private-blob-'+randomUUID();value={id:documentId,space_id:scope.spaceId,media_type:String(req.headers['content-type']??'application/octet-stream'),size:bytes.length,sha256:request.bodySha256,created_at:new Date().toISOString()};blobs.set(scoped(scope.accountId,scope.spaceId,'blob',documentId),{bytes,info:value});
   }else throw Error('Unexpected private mutation path');
   idempotency.set(mutationKey,{signature,value});const effect={...scope,type,documentId,id:request.id,bodySha256:request.bodySha256,version:value.version??null,at:ledger.requests.length};ledger.effects.push(effect);
   if(drop&&drop.accountId===scope.accountId&&drop.type===type&&!drop.blockedId){drop.blockedId=request.id;ledger.dropped.push({...effect,socketDestroyedAfterCommit:true,headersSent:res.headersSent});req.socket.destroy();drop.resolve({...effect,value});return;}
   json(value);
  }catch(error){if(['ECONNRESET','ERR_STREAM_PREMATURE_CLOSE'].includes(error?.code))ledger.abortedRequests++;else ledger.protocolErrors.push(String(error?.message??error).slice(0,500));if(!res.headersSent&&!res.destroyed){res.writeHead(500,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({message:'Private fixture protocol refused'}));}else req.socket.destroy();}
 };
 const server=createServer((req,res)=>{let work;work=handle(req,res).catch(error=>{ledger.protocolErrors.push(String(error?.message??error).slice(0,500));}).finally(()=>handlers.delete(work));handlers.add(work);});
 server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
 return {server,ledger,seed,
  armLostAck(accountId,type='notesMarkdown'){assert.equal(drop,null);let resolve;const promise=new Promise(done=>resolve=done);drop={accountId,type,blockedId:null,resolve};return promise;},
  allowRetry(){drop=null;},
  inspect(accountId){return {effects:ledger.effects.filter(row=>row.accountId===accountId),requests:ledger.requests.filter(row=>row.accountId===accountId),documents:[...remote.values()].filter(row=>row.accountId===accountId).map(row=>row.value),blobs:[...blobs.entries()].filter(([key])=>JSON.parse(key)[0]===accountId).map(([,row])=>({...row.info,actualSha256:sha(row.bytes)}))};},
  closeConnections(){for(const socket of sockets)socket.destroy();server.closeAllConnections();},
  openSockets:()=>sockets.size,
  pendingHandlers:()=>handlers.size,
  async settled(){while(handlers.size)await Promise.allSettled([...handlers]);},
 };
}

