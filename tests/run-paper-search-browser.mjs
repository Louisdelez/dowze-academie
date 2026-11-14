/* Actual Chromium writing, separate build/runtime under the existing guard.
 * Private synthetic Notebook shell and metadata acknowledgement adapter; native DOM/IDB.
 * CDP IME is engine simulation, never physical OS IME or App-auth evidence.
 * Offline edits survive restart ONLINE; this bundle has no service worker.
 * No browser/dependency download, product mutation or process binary copy.
 */
import {mountedAuditPath} from './mounted-cleanup.mjs';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir,readdir,stat,access,mkdtemp,rm} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,resolve,relative,isAbsolute,dirname,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
const root=process.cwd(),cases=['search-navigation'];
const diagnosticCase=process.env.DOWZE_WRITING_ONLY?.trim()||null;
if(diagnosticCase&&!cases.includes(diagnosticCase))throw Error('DOWZE_WRITING_ONLY must name one exact declared writing case.');
const args=process.argv.slice(2),buildPhase=args.includes('--build'),runPhase=args.includes('--run'),dirAt=args.indexOf('--bundle-dir'),bundleDir=dirAt>=0?args[dirAt+1]:undefined;
if(buildPhase===runPhase||!bundleDir||!isAbsolute(bundleDir)||args.some((arg,i)=>!['--build','--run','--bundle-dir'].includes(arg)&&i!==dirAt+1))throw Error('Use exactly --build or --run and --bundle-dir /absolute/new/private/directory.');
const artifact=mountedAuditPath(`n014-paper-search-browser-${buildPhase?'build':'runtime'}-20261015.json`),web=join(bundleDir,'web'),manifestPath=join(bundleDir,'manifest.json');
const report={schema:1,kind:'paper-writing-real-chromium',phase:buildPhase?'build':'runtime',startedAt:new Date().toISOString(),proofScope:'Actual PaperNotebook, canonical host, Crepe/PM and production canonical storage in native Chromium DOM/IndexedDB. The private owner/note shell and onChange metadata acknowledgement adapter are explicit seams; no App authentication, durable legacy metadata writer, physical IME, native IPC, PWA install or offline cold start claim.',diagnosticOnly:!!diagnosticCase,declaredGroups:buildPhase?1:cases.length,groupsStarted:0,fullSuite:false,availability:null,manifest:null,passed:0,failed:0,groups:[],cleanupFinal:{status:'NOTRUN'},fatal:null};
const brief=error=>({name:String(error?.name??'Error'),message:String(error?.message??error).slice(0,900),causes:Array.from(error?.errors??[]).slice(0,4).map(value=>({message:String(value?.message??value).slice(0,350)}))});
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const bodySha=value=>digest(JSON.stringify(value)??'<undefined>');
function bodyDifference(actual,expected){
 const paths=[];let differences=0;
 const visit=(a,b,path)=>{if(isDeepStrictEqual(a,b))return;
  const plain=value=>value!==null&&typeof value==='object'&&(Array.isArray(value)||Object.getPrototypeOf(value)===Object.prototype);
  if(plain(a)&&plain(b)&&Array.isArray(a)===Array.isArray(b)){
   const keys=[...new Set([...Object.keys(a),...Object.keys(b)])].sort();for(const key of keys){const here=path+'.'+key;if(Object.hasOwn(a,key)!==Object.hasOwn(b,key)){differences++;if(paths.length<20)paths.push({path:here,actualPresent:Object.hasOwn(a,key),expectedPresent:Object.hasOwn(b,key),actualSha256:bodySha(a[key]),expectedSha256:bodySha(b[key])});}else visit(a[key],b[key],here);}return;
  }
  differences++;if(paths.length<20)paths.push({path,actualSha256:bodySha(a),expectedSha256:bodySha(b)});
 };visit(actual,expected,'$');return {actualBodySha256:bodySha(actual),expectedBodySha256:bodySha(expected),differences,paths,truncated:differences>paths.length};
}
function assertExactBody(actual,expected,message){
 // Keep the original deepStrictEqual predicate, including absent/undefined and
 // key-order semantics. Only its display changes: never print a CRDT/body diff.
 if(!isDeepStrictEqual(actual,expected))assert.fail(message+'; exact body SHA-256 '+JSON.stringify(bodyDifference(actual,expected)));
}
function sourceSnapshot(record,label,value){
 const fieldHashes=body=>Object.fromEntries(Object.entries(body??{}).map(([key,value])=>[key,bodySha(value)]));
 record.sourceTrace??=[];record.sourceTrace.push({label,selection:value.selection,canonicalBodySha256:bodySha(value.canonical),canonicalFields:fieldHashes(value.canonical),contentFields:fieldHashes(value.canonical?.content),metadataBodySha256:bodySha(value.metadata),metadataFields:fieldHashes(value.metadata)});if(record.sourceTrace.length>8)record.sourceTrace.shift();
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const deadline=Date.now()+235000,cleanupDeadline=Date.now()+285000;
const bounded=async(promise,label,ms=15000,cleanup=false)=>{let timer;try{const time=Math.min(ms,(cleanup?cleanupDeadline:deadline)-Date.now());if(time<=0)throw Error(label+': runtime deadline exhausted');return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+': timeout')),time);})]);}finally{clearTimeout(timer);}};
let qaCgroup;
async function requireCentralGuard(){
 if(process.platform!=='linux')throw Error('Real process-group SIGKILL recipe currently requires a Linux QA executor. No unguarded fallback.');
 qaCgroup=await readFile('/proc/self/cgroup','utf8');const entry=qaCgroup.split('\n').find(line=>line.startsWith('0::'))?.slice(3);
 const unit=entry?.split('/').at(-1)??'',serverBuild=buildPhase&&unit.startsWith('dowze-server-qa-');
 if(!entry||!unit.startsWith('dowze-dell-check-')&&!serverBuild)throw Error('Browser runtime requires the central guard; only a separate build may use the existing server-only QA build profile.');
 const path=join('/sys/fs/cgroup',entry),memory=(await readFile(join(path,'memory.max'),'utf8')).trim(),swap=(await readFile(join(path,'memory.swap.max'),'utf8')).trim(),cpu=(await readFile(join(path,'cpu.max'),'utf8')).trim().split(/\s+/).map(Number);
 if(serverBuild){
  const info=await readFile('/proc/meminfo','utf8'),total=Number(/^MemTotal:\s+(\d+)/m.exec(info)?.[1]),available=Number(/^MemAvailable:\s+(\d+)/m.exec(info)?.[1]),high=(await readFile(join(path,'memory.high'),'utf8')).trim();
  if(!/^\/tmp\/dowze-notebook-qa-20261014\.[a-zA-Z0-9]+$/.test(resolve(root))||!(total>=25165824)||!(available>=12582912)||!/^\d+$/.test(memory)||Number(memory)>2*1024**3||!/^\d+$/.test(high)||Number(high)>1536*1024**2||swap!=='0'||!Number.isFinite(cpu[0])||!(cpu[1]>0)||cpu[0]/cpu[1]>1||process.env.NODE_OPTIONS!=='--max-old-space-size=1024')throw Error('Separate build refused: existing large-host QA isolation/capacity is required; no Dell fallback.');
  report.guard={profile:'existing-server-only-build',unit,memory,high,swap,cpu,buildOnly:true};return;
 }
 if(!/^\d+$/.test(memory)||Number(memory)>900*1024**2||!/^\d+$/.test(swap)||Number(swap)>64*1024**2||!Number.isFinite(cpu[0])||!(cpu[1]>0)||cpu[0]/cpu[1]>.25)throw Error('Browser recipe refused: real RAM/swap/CPU ceilings exceed the central guard.');
 report.guard={profile:'central-runtime-or-small-build',unit,memory,swap,cpu};
}
async function files(path){const entries=await readdir(path,{withFileTypes:true});let result=[];for(const entry of entries){const full=join(path,entry.name);if(entry.isDirectory())result.push(...await files(full));else if(entry.isFile())result.push(full);else throw Error('Bundle directories cannot contain symlinks or special files.');}return result;}
async function buildBundle(){
 report.groupsStarted=1;await mkdir(bundleDir);await writeFile(join(bundleDir,'.owned-writing-build'),'private synthetic writing fixture only\n');
 const {build}=await import('vite'),virtualWorker='\0private-writing-worker-url',workerInput='node_modules/pdfjs-dist/build/pdf.worker.min.mjs',seenSources=new Set();
 const built=await build({configFile:false,publicDir:false,define:{'process.env.NODE_ENV':JSON.stringify('production')},esbuild:{jsx:'automatic'},plugins:[{name:'private-writing-pdf-worker-url',enforce:'pre',resolveId(id){if(id==='pdfjs-dist/build/pdf.worker.min.mjs?url')return virtualWorker;},load(id){if(id===virtualWorker)return 'export default "/pdf.worker.mjs";';},transform(_code,id){const clean=id.split('?')[0];if(isAbsolute(clean)&&clean.startsWith(root+sep)&&!clean.includes(sep+'node_modules'+sep))seenSources.add(relative(root,clean));}}],build:{lib:{entry:join(root,'tests/paper-search-browser-entry.tsx'),formats:['es'],fileName:()=> 'entry.mjs'},outDir:web,emptyOutDir:false,copyPublicDir:false,target:'es2022',minify:false,sourcemap:false,reportCompressedSize:false,rollupOptions:{output:{entryFileNames:'entry.mjs',chunkFileNames:'chunks/[name]-[hash].mjs'}}},logLevel:'error'});
 await writeFile(join(web,'pdf.worker.mjs'),await readFile(join(root,workerInput)));
 const sources=new Set([...seenSources,'tests/run-paper-search-browser.mjs','tests/paper-search-browser-entry.tsx','tests/paper-real-editor-probe.ts','tests/mounted-cleanup.mjs','package.json','node_modules/playwright-core/types/protocol.d.ts',workerInput]);
 for(const result of Array.isArray(built)?built:[built])for(const chunk of result.output??[])if(chunk.type==='chunk')for(const id of Object.keys(chunk.modules)){const clean=id.split('?')[0];if(isAbsolute(clean)&&clean.startsWith(root+sep)&&!clean.includes(sep+'node_modules'+sep))sources.add(relative(root,clean));}
 const inputs={},outputs={};for(const path of [...sources].sort())inputs[path]=digest(await readFile(join(root,path)));for(const path of await files(web))outputs[relative(web,path)]=digest(await readFile(path));
 assert.ok(outputs['entry.mjs']);assert.ok(Object.keys(outputs).some(path=>path.endsWith('.css')),'Actual Notebook CSS must be built');
 const manifest={schema:1,kind:'paper-writing-browser-build',builtAt:new Date().toISOString(),inputs,outputs};await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');report.manifest={sha256:digest(await readFile(manifestPath)),inputFiles:Object.keys(inputs).length,bundleFiles:Object.keys(outputs).length};report.passed=1;report.groups=[{name:'Separate actual writing fixture build',status:'PASS'}];report.buildComplete=true;
}
async function verifyBundle(){
 const manifest=JSON.parse(await readFile(manifestPath,'utf8'));assert.equal(manifest.schema,1);assert.equal(manifest.kind,'paper-writing-browser-build');
 for(const [path,expected] of Object.entries(manifest.inputs)){assert.ok(!isAbsolute(path)&&!path.split(/[\\/]/).includes('..'));assert.equal(digest(await readFile(join(root,path))),expected,'Source changed after build: '+path);}
 for(const [path,expected] of Object.entries(manifest.outputs)){assert.ok(!isAbsolute(path)&&!path.split(/[\\/]/).includes('..'));assert.equal(digest(await readFile(join(web,path))),expected,'Bundle changed after build: '+path);}
 assert.ok(manifest.outputs['entry.mjs']);report.manifest={sha256:digest(await readFile(manifestPath)),inputFiles:Object.keys(manifest.inputs).length,bundleFiles:Object.keys(manifest.outputs).length};
}
async function procInfo(pid){
 try{const body=await readFile(`/proc/${pid}/stat`,'utf8'),at=body.lastIndexOf(')'),tail=body.slice(at+2).trim().split(/\s+/);return {pid,name:body.slice(body.indexOf('(')+1,at),state:tail[0],parent:Number(tail[1]),group:Number(tail[2]),start:tail[19]};}catch(error){if(error.code==='ENOENT'||error.code==='ESRCH')return null;throw error;}
}
const owned=new Set(),profiles=new Set();let server,workDir,playwright,origin;
function privateText(value,records=[]){
 let result=String(value??'');
 for(const path of [workDir,bundleDir,...records.map(record=>record?.profile)].filter(Boolean).sort((a,b)=>b.length-a.length))result=result.replaceAll(path,'<private-path>');
 return result.replace(/(?:wss?|https?):\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?[^\s"'<>]*/g,'<private-endpoint>');
}
function privateValue(value,records=[]){return typeof value==='string'?privateText(value,records):Array.isArray(value)?value.map(item=>privateValue(item,records)):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,privateValue(item,records)])):value;}
function privateBrief(error,records=[]){return privateValue(brief(error),records);}
async function failureState(record){
 if(!record)return null;
 let live=null,procError=null;try{live=await procInfo(record.pid);}catch(error){procError=privateBrief(error,[record]);}
 let dom=null;
 if(record.page&&!record.page.isClosed()&&record.browser?.isConnected())try{
  dom=await bounded(record.page.evaluate(()=>({containerPresent:!!document.getElementById('actual-notebook'),notebookCount:document.querySelectorAll('.paper-notebook').length,openingStatus:document.querySelector('.paper-opening [role="status"]')?.textContent?.slice(0,240)??null,mountedPageCount:document.querySelectorAll('.paper-page-viewport-frame[data-page-mounted="true"]').length,fixturePhase:window.__paperImportCrash?.status()?.phase??null,fixtureError:window.__paperImportCrash?.status()?.error??null})),'Bounded failed UI snapshot',600,true);
 }catch(error){dom={unavailable:privateBrief(error,[record])};}
 return {observedBeforeCleanupAt:new Date().toISOString(),role:record.role,pid:record.pid,capturedStart:record.start,alreadyKilledAndVerified:record.killed,live:live?{pid:live.pid,start:live.start,sameIncarnation:live.start===record.start,state:live.state,parent:live.parent,group:live.group}:null,procError,exit:record.exit?{code:record.exit.code,signal:record.exit.signal,...(record.exit.error?{error:privateValue(record.exit.error,[record])}:{})}:null,browserConnected:record.browser?.isConnected()??false,pageClosed:record.page?.isClosed()??null,events:record.events.map(event=>({...event})),stderr:privateText(record.stderr,[record]).slice(-1500),pageErrors:record.pageErrors.map(message=>privateText(message,[record]).slice(0,500)),consoleErrors:record.consoleErrors.map(message=>privateText(message,[record]).slice(0,500)),networkRefused:record.networkRefused,dom:privateValue(dom,[record])};
}
async function cgroupPids(){const result=new Map();for(const name of await readdir('/proc'))if(/^\d+$/.test(name))try{if(await readFile(`/proc/${name}/cgroup`,'utf8')===qaCgroup){const info=await procInfo(Number(name));if(info)result.set(info.pid,info.start);}}catch{}return result;}
async function discoverOwned(record){
 const entries=await readdir('/proc'),all=new Map();for(const entry of entries)if(/^\d+$/.test(entry)){try{const info=await procInfo(Number(entry));if(info)all.set(info.pid,info);}catch{/* Unrelated inaccessible processes are not touched. */}}
 const main=all.get(record.pid),sameMain=main&&main.start===record.start;
 const selected=new Set();if(sameMain)selected.add(record.pid);
 for(const info of record.members.values())if(all.get(info.pid)?.start===info.start)selected.add(info.pid);
 let changed=true;while(changed){changed=false;for(const info of all.values())if(!selected.has(info.pid)&&((sameMain&&info.group===record.pid)||selected.has(info.parent))){selected.add(info.pid);changed=true;}}
 // Crashpad can double-fork/reparent and leave Chromium's process group. Only
 // newly created Chromium-named processes in THIS verified, isolated QA cgroup
 // are eligible, with their exact /proc start token. No other app's command
 // lines, browser profile, PID group or general pkill pattern is consulted.
 for(const info of all.values())if(record.baseline.get(info.pid)!==info.start&&/^(chrome|chromium|headless)/.test(info.name))try{if(await readFile(`/proc/${info.pid}/cgroup`,'utf8')===qaCgroup)selected.add(info.pid);}catch{}
 for(const pid of selected){const info=all.get(pid);if(info)record.members.set(pid,info);}return record.members;
}
async function killOwned(record,requireCrash=false){
 if(!record)return;await discoverOwned(record);const main=await procInfo(record.pid);
 if(requireCrash)assert.ok(main&&main.start===record.start&&main.state!=='Z','Owned browser exited before the requested SIGKILL; this cannot be a passing crash recipe');
 // Never send a group signal if its leader is gone or a PID was reused. Exact
 // captured descendants can still be cleaned safely after an early main exit.
 if(main&&main.start===record.start&&main.group===record.pid){try{process.kill(-record.pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}}
 // A Chromium subprocess can change its group. Its PID is eligible only after
 // verified ancestry and an unchanged /proc start token captured above.
 for(const info of record.members.values()){const live=await procInfo(info.pid);if(live&&live.start===info.start){try{process.kill(info.pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}}}
 await bounded(record.exited,'Owned browser child exit after SIGKILL',5000,true);
 const until=Math.min(cleanupDeadline,Date.now()+5000);let emptyOnce=false;
 while(true){
  // Reconcile again after the group signal/main exit: a last crash helper can
  // appear or reparent during that window, outside the old process group.
  await discoverOwned(record);let remaining=0;
  for(const info of record.members.values()){const live=await procInfo(info.pid);if(live&&live.start===info.start){remaining++;try{process.kill(info.pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}}}
  if(!remaining&&emptyOnce)break;emptyOnce=!remaining;
  if(Date.now()>=until)throw Error(`Owned browser cleanup still has ${remaining} recorded process(es) or an unconfirmed final scan`);await sleep(40);
 }
 if(record.browser)try{await bounded(record.browser.close(),'Closed CDP connection cleanup',2000,true);}catch(error){if(!/closed|disconnect|Target/i.test(String(error?.message??error)))throw error;}
 if(requireCrash)assert.equal(record.exit.signal,'SIGKILL','Expected a genuine SIGKILL child exit, never graceful close masquerading as a crash');
 // Keep the ownership record through every physical cleanup and crash-proof
 // check. A startup exit remains a FAIL body, but safe final cleanup can finish.
 record.killed=true;owned.delete(record);
}
async function launch(profile,executable,role){
 await rm(join(profile,'DevToolsActivePort'),{force:true});
 const config=join(profile,'xdg-config'),cache=join(profile,'xdg-cache'),temp=join(profile,'tmp');for(const path of [config,cache,temp])await mkdir(path,{recursive:true});const baseline=await cgroupPids();
 const child=spawn(executable,['--headless=new',`--user-data-dir=${profile}`,'--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-sync','--disable-extensions','about:blank'],{detached:true,stdio:['ignore','ignore','pipe'],env:{...process.env,XDG_CONFIG_HOME:config,XDG_CACHE_HOME:cache,TMPDIR:temp}});
 const record={child,pid:child.pid,start:null,baseline,members:new Map(),stderr:'',browser:null,page:null,exit:null,killed:false,pageErrors:[],consoleErrors:[],networkRefused:0,profile,role,events:[]},launchedAt=Date.now();
 const event=name=>{record.events.push({event:name,elapsedMs:Date.now()-launchedAt});if(record.events.length>12)record.events.shift();};
 record.exited=new Promise(resolve=>{child.once('exit',(code,signal)=>{record.exit={code,signal};resolve(record.exit);});child.once('error',error=>{record.exit={code:null,signal:null,error:brief(error)};resolve(record.exit);});});
 child.stderr.on('data',value=>{record.stderr=(record.stderr+value.toString()).slice(-1500);});
 if(!Number.isSafeInteger(record.pid))throw Error('Owned Chromium child could not be created');
 owned.add(record);const started=await procInfo(record.pid);if(!started)throw Error('Owned Chromium exited before its process identity was captured');record.start=started.start;record.members.set(record.pid,started);assert.equal(started.group,record.pid,'Browser must use its own detached process group');
 let port;
 await bounded((async()=>{for(;;){if(record.exit)throw Error('Owned Chromium exited during startup: '+JSON.stringify(record.exit)+' '+record.stderr.replace(/ws:\/\/\S+/g,'<devtools-endpoint>').replaceAll(profile,'<private-profile>'));try{const lines=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');if(/^\d+$/.test(lines[0])&&lines[1]?.startsWith('/devtools/browser/')){port=Number(lines[0]);break;}}catch(error){if(error.code!=='ENOENT')throw error;}await sleep(30);}})(),'Owned Chromium startup');
 record.browser=await bounded(playwright.chromium.connectOverCDP(`http://127.0.0.1:${port}`,{timeout:15000}),'Connect owned Chromium CDP');
 record.browser.on('disconnected',()=>event('browser-disconnected'));
 const context=record.browser.contexts()[0];assert.ok(context,'Owned persistent default browser context must exist');const pages=context.pages();record.page=pages[0]??await context.newPage();for(const page of pages.slice(1))await page.close();
 record.page.on('crash',()=>event('page-crash'));record.page.on('close',()=>event('page-close'));
 record.page.on('pageerror',error=>{record.pageErrors.push(String(error.message).slice(0,500));if(record.pageErrors.length>8)record.pageErrors.shift();});
 record.page.on('console',message=>{if(message.type()==='error'){record.consoleErrors.push(message.text().slice(0,500));if(record.consoleErrors.length>8)record.consoleErrors.shift();}});
 await record.page.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===origin)return route.continue();record.networkRefused++;return route.abort('blockedbyclient');});
 await bounded(record.page.goto(origin,{waitUntil:'load',timeout:15000}),'Open private fixture origin');
 await bounded(record.page.waitForFunction(()=>!!window.__paperWriting,null,{timeout:15000}),'Load actual browser fixture API');
 assert.deepEqual(record.pageErrors,[],'Actual browser module initialization must not fail');assert.equal(record.networkRefused,0,'The fixture must use only its private localhost origin');
 return record;
}
const httpLedger={pings:0,puts:[],requests:0,traces:[]},acks=new Map();let sequence=0;
async function startServer(){
 const css=(await files(web)).filter(path=>path.endsWith('.css')).map(path=>'/'+relative(web,path).split(sep).join('/'));
 server=createServer(async(req,res)=>{let trace=null;try{
  const url=new URL(req.url,'http://127.0.0.1'),pathname=decodeURIComponent(url.pathname),json=value=>{res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
  if(pathname.startsWith('/qa/')){trace={method:req.method,path:pathname.slice(0,180),status:null};httpLedger.traces.push(trace);if(httpLedger.traces.length>12)httpLedger.traces.shift();res.once('finish',()=>{trace.status=res.statusCode;});}
  if(pathname==='/qa/ping'){httpLedger.pings++;json({ok:true});return;}
  if(pathname==='/qa/v1/csrf'){json({csrf_token:'synthetic-writing-not-a-secret'});return;}
  if(pathname.startsWith('/qa/v1/spaces/')){
   httpLedger.requests++;const account=String(req.headers['x-dowze-account']??'');assert.match(account,/^writing-[AB]-[a-zA-Z0-9-]+$/);const parts=pathname.slice('/qa/v1/spaces/'.length).split('/'),space=parts[0];assert.equal(space,'year');
   if(req.method==='GET'&&parts[1]==='changes'){json({items:[],next_cursor:String(sequence),has_more:false});return;}
   if(req.method==='PUT'&&parts[1]==='documents'&&parts.length===4){
    let size=0;const chunks=[];for await(const part of req){size+=part.length;assert.ok(size<=2*1024*1024,'Private writing HTTP body exceeded bound');chunks.push(part);}const raw=Buffer.concat(chunks),body=JSON.parse(raw.toString()),id=String(req.headers['x-idempotency-key']??'');assert.ok(id&&Number.isSafeInteger(body.base_version));
    const key=account+'|'+space+'|'+id,previous=acks.get(key),bodySha=digest(raw);if(previous)assert.equal(previous.sha256,bodySha,'One private idempotency key cannot ACK different bytes');
    const value=previous?.value??{space_id:space,document_type:parts[2],document_id:parts[3],version:body.base_version+1,deleted:false,content:body.content,changed_at:new Date().toISOString()};acks.set(key,{sha256:bodySha,value});sequence++;
    httpLedger.puts.push({accountId:account,spaceId:space,type:parts[2],documentId:parts[3],id,bodySha256:bodySha});json(value);return;
   }
   throw Error('Unexpected private writing API request');
  }
  if(pathname==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+css.map(path=>'<link rel="stylesheet" href="'+path+'">').join('')+'<style>html,body{margin:0;width:100%;height:100%}#private-source-controls{display:flex;gap:12px;height:38px}#actual-writing-notebook{width:100%;height:calc(100vh - 38px)}</style></head><body><script type="module" src="/entry.mjs"></script></body></html>');return;}
  const file=resolve(web,'.'+pathname);if(!file.startsWith(resolve(web)+sep)||(await stat(file)).isDirectory())throw Error('Outside private writing bundle');const body=await readFile(file);res.writeHead(200,{'content-type':/\.m?js$/.test(file)?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'application/octet-stream','cache-control':'no-store'});res.end(body);
 }catch(error){if(trace){trace.error=brief(error);trace.status=404;}res.writeHead(404);res.end('Private fixture request refused');}});
 await bounded(new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);}),'Private writing HTTP server',3000);origin=`http://127.0.0.1:${server.address().port}`;
}
async function call(record,method,...args){record.writingPhase=method;return bounded(record.page.evaluate(({method,args})=>{const api=window.__paperWriting;if(!api||typeof api[method]!=='function')throw Error('Private writing fixture method missing: '+method);return api[method](...args);},{method,args}),'Actual writing '+method);}
async function writingFailureState(record){const common=await failureState(record);if(!record?.page||record.page.isClosed()||!record.browser?.isConnected())return common;let dom;try{dom=await bounded(record.page.evaluate(()=>{const value=window.__paperWriting?.state();return {containerPresent:!!document.getElementById('actual-writing-notebook'),notebooks:document.querySelectorAll('.paper-notebook').length,actualPM:document.querySelectorAll('#actual-writing-notebook .ProseMirror').length,parkedRoots:document.querySelectorAll('.markdown-editor-retained').length,controlError:document.getElementById('private-source-controls')?.dataset.error??null,state:value?{...value,events:value.events.slice(-12)}:null};}),'Bounded writing failure DOM snapshot',600,true);}catch(error){dom={unavailable:privateBrief(error,[record])};}return {...common,writingPhase:record.writingPhase??null,compositionTrace:record.compositionTrace??[],sourceTrace:record.sourceTrace??[],sourceDifferences:record.sourceDifferences??[],http:privateValue(httpLedger.traces,[record]),dom:privateValue(dom,[record])};}
async function compositionCheckpoint(record,label,id){const value=await call(record,'checkpoint',label,id);record.compositionTrace??=[];record.compositionTrace.push(value);if(record.compositionTrace.length>14)record.compositionTrace.shift();return value;}
async function waitFor(record,check,arg,label){return bounded(record.page.waitForFunction(check,arg,{timeout:12000}),label,13000);}
async function open(record,runId,reopen=false){await call(record,'start',runId,reopen);await bounded(record.page.waitForSelector('#actual-writing-notebook .paper-editable-page-reader [data-object="browser-text"]',{state:'visible',timeout:12000}),'Actual canonical text reader');}
async function activate(record){
 await record.page.locator('#actual-writing-notebook .paper-editable-page-reader [data-object="browser-text"]').click({position:{x:20,y:20},timeout:12000});await bounded(record.page.waitForSelector('#actual-writing-notebook .ProseMirror[contenteditable="true"]',{state:'visible',timeout:12000}),'Actual Crepe/PM editor');await record.page.locator('#actual-writing-notebook .ProseMirror').click({position:{x:20,y:20},timeout:12000});return call(record,'capture');
}
const row=(stores,selection)=>{const value=stores.find(value=>value.selection===selection);assert.ok(value,'Exact private scope row missing: '+selection);return value;};
const markdown=value=>value.canonical.content.objects.find(object=>object.id==='browser-text')?.markdown??'';
function currentTextProof(stores,selection,marker){const value=row(stores,selection);assert.ok(markdown(value).includes(marker),'Actual canonical source must contain '+marker);assert.ok(value.metadata.content.markdown.includes(marker),'Actual native metadata CAS must contain '+marker);assert.equal(value.canonical.content.noteId,value.scope.noteId);return value;}
function caret(value){assert.ok(value.selection?.inside,'Native selection must remain inside this actual PM');assert.equal(value.selection.nativeFrom,value.selection.from,'Native DOM anchor must map to the actual PM selection');assert.equal(value.selection.nativeTo,value.selection.to,'Native DOM focus must map to the actual PM selection');assert.ok(value.selection.caretFinite&&value.selection.rects>0,'The actual browser caret must have finite painted geometry');}
async function input(record,text){await record.page.keyboard.insertText(text);}
async function selectSource(record,selection){await record.page.getByRole('button',{name:'Recipe '+selection,exact:true}).click({timeout:10000});await waitFor(record,selection=>{const value=window.__paperWriting.state();return value.authority?.selection===selection&&value.ready;},selection,'The actual requested Notebook source must open');await call(record,'ready');}
async function cleanupGroup(){const errors=[];for(const record of [...owned])try{await killOwned(record);}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Private writing browser cleanup failed');}
async function searchNavigation(record,runId){
 const firstFrom=1+'La seconde page contient '.length,secondFrom=firstFrom+'aiguille et encore '.length;
 await call(record,'start',runId);await record.page.getByRole('button',{name:'Rechercher dans la note',exact:true}).click();await record.page.getByRole('searchbox',{name:'Texte à rechercher dans la note',exact:true}).fill('aiguille');
 const hits=record.page.locator('.paper-search-results button');assert.equal(await hits.count(),2,'Both exact repeated occurrences must be listed');
 await hits.nth(1).click();await waitFor(record,()=>{const state=window.__paperWriting.state();return state.selectedPageId==='second-page'&&state.highlights.length===1&&state.highlights[0].from===1+'La seconde page contient aiguille et encore '.length;},null,'Actual search result must open and highlight the exact second-page occurrence');await call(record,'ready');
 // The first mount can measure a physical layout. Its completed search must
 // still be visible after that real layout acknowledgement, not just a frame.
 await record.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));let observed=await call(record,'state');assert.equal(observed.highlights.length,1,'Search must remain visible after its actual canonical layout settles');assert.equal(observed.highlights[0].page,'second-page');assert.equal(observed.highlights[0].text,'aiguille');assert.equal(observed.highlights[0].from,secondFrom);assert.equal(observed.highlights[0].to,secondFrom+8);
 const before=await call(record,'stores'),selection=observed.editors.map(editor=>editor.selection);await hits.nth(0).click();await waitFor(record,()=>{const state=window.__paperWriting.state();return state.highlights.length===1&&state.highlights[0].from===1+'La seconde page contient '.length;},null,'Fresh exact first occurrence must paint');await call(record,'ready');const after=await call(record,'stores');assertExactBody(after,before,'Highlighting an already mounted settled text must not write canonical graph, files, outbox or snapshots');observed=await call(record,'state');assert.equal(observed.highlights[0].from,firstFrom);assert.equal(observed.highlights[0].to,firstFrom+8);assert.deepEqual(observed.editors.map(editor=>editor.selection),selection,'Search cannot move the PM caret');
 await record.page.getByRole('button',{name:'Fermer la recherche',exact:true}).click();await waitFor(record,()=>window.__paperWriting.state().highlights.length===0,null,'Closing search clears the ephemeral decoration');
 await call(record,'externalSearch');await waitFor(record,()=>{const state=window.__paperWriting.state();return state.highlights.length===1&&state.selectedPageId==='second-page'&&state.highlights[0].from===1+'La seconde page contient aiguille et encore '.length;},null,'A parent search navigation request must paint the actual matching note passage');assert.equal(await record.page.getByRole('searchbox',{name:'Texte à rechercher dans la note',exact:true}).inputValue(),'aiguille');assertExactBody(await call(record,'stores'),before,'External presentation request cannot write the note');
 await record.page.screenshot({path:join(dirname(artifact),'search-second-occurrence.png')});
 await record.page.getByRole('button',{name:'Afficher les pages',exact:true}).click();await record.page.getByRole('button',{name:'Ouvrir la page 1',exact:true}).click();await waitFor(record,()=>{const state=window.__paperWriting.state();return state.selectedPageId==='first-page'&&state.highlights.length===0;},null,'Explicit page navigation cancels the earlier search intent');assertExactBody(await call(record,'stores'),before,'Explicit page navigation cannot mutate note data');
 return {actualNotebook:true,nativeChromiumDOMAndIDB:true,exactRepeatedOccurrence:true,secondPageNavigation:true,stableAfterRealLayout:true,unchangedCaret:true,unchangedDurableStores:true,externalParentIntent:true,physicalTablet:false};
}
async function runBrowser(){
 await verifyBundle();try{playwright=await import('playwright');}catch(error){report.availability={status:'NOTRUN',reason:'Existing Playwright unavailable',error:brief(error)};return;}
 const executable=process.env.DOWZE_CRASH_CHROMIUM_PATH||playwright.chromium.executablePath();assert.ok(isAbsolute(executable));try{await access(executable,constants.X_OK);}catch{report.availability={status:'NOTRUN',reason:'Existing Chromium executable unavailable; no download'};return;}
 report.availability={status:'AVAILABLE',executable:executable.split(sep).at(-1),executed:false};workDir=await mkdtemp(join(tmpdir(),'dowze-writing-real-browser-'));await writeFile(join(workDir,'.owned-synthetic-browser-profiles'),'private synthetic writing profiles only\n');await startServer();
 for(const name of cases){
  if(diagnosticCase&&name!==diagnosticCase){report.groups.push({name,status:'NOTRUN',reason:'Diagnostic exact writing case'});continue;}
  if(Date.now()>=deadline)throw Error('Writing global deadline exhausted before next group');const profile=await mkdtemp(join(workDir,'profile-'));profiles.add(profile);let first=null,current=null,result;report.groupsStarted++;
  try{
   first=await launch(profile,executable,'writing-'+name);current=first;report.availability.executed=true;const version=first.browser.version(),runId=randomUUID();let evidence;
   evidence=await searchNavigation(first,runId);
   const fixtureCleanup=await call(current,'cleanup');assert.equal(fixtureCleanup.liveEditors,0);assert.equal(fixtureCleanup.pending,false);assert.deepEqual(current.pageErrors,[]);assert.equal(current.networkRefused,0);result={name,status:'PASS',browserVersion:version,evidence,fixtureCleanup};report.passed++;
  }catch(error){result={name,status:'FAIL',error:privateBrief(error,[first,current]),diagnostics:await writingFailureState(current??first)};report.failed++;console.error(name+': FAIL '+result.error.message);}
  finally{
   if(result)report.groups.push(result);try{await cleanupGroup();await rm(profile,{recursive:true,force:true});profiles.delete(profile);if(result)result.cleanup={status:'PASS'};}catch(error){if(result){result.cleanup={status:'FAIL',error:brief(error)};if(result.status==='PASS'){result.bodyStatus='PASS';result.status='FAIL';report.passed--;report.failed++;}}throw error;}
  }
  console.log(name+': '+result.status);
 }
}
try{await requireCentralGuard();if(buildPhase)await buildBundle();else await runBrowser();}
catch(error){report.fatal=brief(error);console.error('Writing browser recipe failed: '+report.fatal.message);process.exitCode=1;}
finally{
 const errors=[];try{await cleanupGroup();}catch(error){errors.push(error);}if(server)try{server.closeAllConnections();await bounded(new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve())),'Writing private HTTP cleanup',3000,true);}catch(error){errors.push(error);}
 if(owned.size===0){for(const profile of profiles)try{await rm(profile,{recursive:true,force:true});profiles.delete(profile);}catch(error){errors.push(error);}if(workDir)try{await rm(workDir,{recursive:true,force:true});}catch(error){errors.push(error);}}
 report.cleanupFinal=errors.length?{status:'FAIL',error:brief(new AggregateError(errors,'Final writing cleanup failed'))}:{status:'PASS',remainingOwnedBrowsers:owned.size,remainingProfiles:profiles.size,httpListening:server?.listening??false};if(errors.length)process.exitCode=1;
 if(runPhase){const attempted=new Set(report.groups.map(group=>group.name));for(const name of cases)if(!attempted.has(name))report.groups.push({name,status:'NOTRUN',reason:report.availability?.reason??'Earlier fatal or cleanup failure'});report.fullSuite=!diagnosticCase&&report.groupsStarted===cases.length&&report.passed===cases.length&&!report.failed&&!report.fatal&&report.cleanupFinal.status==='PASS';if(!report.fullSuite)process.exitCode||=report.availability?.status==='NOTRUN'?2:1;}
 report.finishedAt=new Date().toISOString();await mkdir(dirname(artifact),{recursive:true});await writeFile(artifact,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({phase:report.phase,passed:report.passed,failed:report.failed,notRun:report.groups.filter(group=>group.status==='NOTRUN').length,fullSuite:report.fullSuite,cleanup:report.cleanupFinal.status,fatal:report.fatal?.message??null,report:artifact}));
}
