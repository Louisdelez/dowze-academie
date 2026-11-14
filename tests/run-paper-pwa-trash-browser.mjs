/* NOT RUN by its author. Actual PWA App/Library/Notebook + native Chromium IDB.
 * Auth and HTTP are strict synthetic seams, not a server or installed-PWA test.
 * The existing central guard/PID-start/group/cgroup cleanup remains unchanged.
 * Local Library deletedAt restoration is tested; canonical tombstone/30 days,
 * cloud synchronization, native installation and physical devices remain OPEN. */
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
const root=process.cwd(),cases=['local-trash-restore-reload','storage-abort-preserves-original','retired-restore-owner-api-aba'];
const diagnosticCase=process.env.DOWZE_PWA_TRASH_ONLY?.trim()||null;
if(diagnosticCase&&!cases.includes(diagnosticCase))throw Error('DOWZE_PWA_TRASH_ONLY must name one exact declared library case.');
const args=process.argv.slice(2),buildPhase=args.includes('--build'),runPhase=args.includes('--run'),dirAt=args.indexOf('--bundle-dir'),bundleDir=dirAt>=0?args[dirAt+1]:undefined;
if(buildPhase===runPhase||!bundleDir||!isAbsolute(bundleDir)||args.some((arg,i)=>!['--build','--run','--bundle-dir'].includes(arg)&&i!==dirAt+1))throw Error('Use exactly --build or --run and --bundle-dir /absolute/new/private/directory.');
const artifact=mountedAuditPath(`n011-paper-pwa-trash-browser-${buildPhase?'build':'runtime'}-20261015.json`),web=join(bundleDir,'web'),manifestPath=join(bundleDir,'manifest.json');
const desktopViewport={width:1440,height:900};
const staticCacheBudget=64*1024*1024,staticCacheItemBudget=32*1024*1024;
const pinnedStaticAssets=new Map(),staticRouteOriginals=new Set(),staticRouteErrors=[];
function followStaticRoute(original){staticRouteOriginals.add(original);void original.then(()=>staticRouteOriginals.delete(original),error=>{staticRouteOriginals.delete(original);if(staticRouteErrors.length<12)staticRouteErrors.push(brief(error));});return original;}
async function drainStaticRoutes(cleanup=false){await bounded((async()=>{while(staticRouteOriginals.size)await Promise.allSettled([...staticRouteOriginals]);})(),'Join original static prewarm and pinned-resource fulfillments',3000,cleanup);}
const lifecycleBaseline={path:'tests/run-paper-library-tree-browser.mjs',sha256:'cc666295f9bbb4fb0797c36a2e1ac9fdbc6753d733bf6cba940dc844e9634303',blocks:['requireCentralGuard','procInfo','cgroupPids/discoverOwned/killOwned']};
const report={schema:1,kind:'paper-pwa-trash-real-chromium',lifecycleBaseline,phase:buildPhase?'build':'runtime',startedAt:new Date().toISOString(),proofScope:'Actual PWA App, Library and Notebook with native Chromium DOM/IndexedDB. Initial fixtures, strict synthetic account/HTTP responses, retained React callback delivery, and native abort after a successful real Library put are explicit seams. Ordinary UI actions restore local classification and preserve exact canonical graphs, metadata, media bytes, outbox and foreign scopes. This does NOT prove canonical tombstone-first deletion, 30-day retention/purge, cloud/multiclient sync, SW, installed PWA, Desktop App or physical devices.',diagnosticOnly:!!diagnosticCase,declaredGroups:buildPhase?1:cases.length,groupsStarted:0,fullSuite:false,availability:null,manifest:null,passed:0,failed:0,groups:[],cleanupFinal:{status:'NOTRUN'},finalFreeze:{status:'NOTRUN'},fatal:null};
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
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const deadline=Date.now()+235000,cleanupDeadline=Date.now()+285000;
const bounded=async(promise,label,ms=15000,cleanup=false)=>{let timer;try{const time=Math.min(ms,(cleanup?cleanupDeadline:deadline)-Date.now());if(time<=0)throw Error(label+': runtime deadline exhausted');return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+': timeout')),time);})]);}finally{clearTimeout(timer);}};
let qaCgroup;
async function verifyLifecycleBaseline(){
 const previous=await readFile(join(root,lifecycleBaseline.path),'utf8'),current=await readFile(join(root,'tests/run-paper-pwa-trash-browser.mjs'),'utf8');assert.equal(digest(previous),lifecycleBaseline.sha256,'The lifecycle reference must be the exact frozen N001 runner');
 for(const[start,end]of[['async function requireCentralGuard()','async function files('],['async function procInfo(','const owned=new Set()'],['async function cgroupPids()','async function launch(']]){const before=previous.indexOf('\n'+start),after=previous.indexOf('\n'+end,before+1),now=current.indexOf('\n'+start),until=current.indexOf('\n'+end,now+1);assert.ok(before>=0&&after>before&&now>=0&&until>now);assert.equal(current.slice(now,until),previous.slice(before,after),'The central guard and verified PID/cgroup/SIGKILL lifecycle cannot drift');}
}
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
 report.groupsStarted=1;await mkdir(bundleDir);await writeFile(join(bundleDir,'.owned-pwa-trash-build'),'private synthetic library fixture only\n');
 const {build}=await import('vite'),virtualWorker='\0private-writing-worker-url',workerInput='node_modules/pdfjs-dist/build/pdf.worker.min.mjs',seenSources=new Set();
 // Vite library mode forces imported assets into data URLs before consulting
 // assetsInlineLimit. The real App includes large sprite/WASM assets; use the
 // ordinary frontend pipeline and emit files, retaining the identical entry.
 const built=await build({configFile:false,publicDir:false,define:{'process.env.NODE_ENV':JSON.stringify('production')},esbuild:{jsx:'automatic'},plugins:[{name:'private-writing-pdf-worker-url',enforce:'pre',resolveId(id){if(id==='pdfjs-dist/build/pdf.worker.min.mjs?url')return virtualWorker;},load(id){if(id===virtualWorker)return 'export default "/pdf.worker.mjs";';},transform(_code,id){const clean=id.split('?')[0];if(isAbsolute(clean)&&clean.startsWith(root+sep)&&!clean.includes(sep+'node_modules'+sep))seenSources.add(relative(root,clean));}}],build:{outDir:web,emptyOutDir:false,copyPublicDir:false,assetsInlineLimit:0,target:'es2022',minify:false,sourcemap:false,reportCompressedSize:false,rollupOptions:{input:join(root,'tests/paper-pwa-trash-browser-entry.tsx'),preserveEntrySignatures:'strict',output:{format:'es',entryFileNames:'entry.mjs',chunkFileNames:'chunks/[name]-[hash].mjs',assetFileNames:'assets/[name]-[hash][extname]'}}},logLevel:'error'});
 await writeFile(join(web,'pdf.worker.mjs'),await readFile(join(root,workerInput)));
 const sources=new Set([...seenSources,'tests/run-paper-pwa-trash-browser.mjs','tests/paper-pwa-trash-browser-entry.tsx',lifecycleBaseline.path,'tests/mounted-cleanup.mjs','package.json','node_modules/playwright-core/types/protocol.d.ts',workerInput]);
 for(const result of Array.isArray(built)?built:[built])for(const chunk of result.output??[])if(chunk.type==='chunk')for(const id of Object.keys(chunk.modules)){const clean=id.split('?')[0];if(isAbsolute(clean)&&clean.startsWith(root+sep)&&!clean.includes(sep+'node_modules'+sep))sources.add(relative(root,clean));}
 const inputs={},outputs={};for(const path of [...sources].sort())inputs[path]=digest(await readFile(join(root,path)));for(const path of await files(web))outputs[relative(web,path)]=digest(await readFile(path));
 assert.ok(outputs['entry.mjs']);assert.ok(Object.keys(outputs).some(path=>path.endsWith('.css')),'Actual shared library CSS must be built');
 const manifest={schema:1,kind:'paper-pwa-trash-browser-build',builtAt:new Date().toISOString(),inputs,outputs};await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');report.manifest={sha256:digest(await readFile(manifestPath)),inputFiles:Object.keys(inputs).length,bundleFiles:Object.keys(outputs).length};report.passed=1;report.groups=[{name:'Separate actual library fixture build',status:'PASS'}];report.buildComplete=true;
}
let verifiedManifestSHA;
async function verifyBundle(){
 const bytes=await readFile(manifestPath),manifestSHA=digest(bytes),manifest=JSON.parse(bytes.toString('utf8'));assert.equal(manifest.schema,1);assert.equal(manifest.kind,'paper-pwa-trash-browser-build');
 if(verifiedManifestSHA)assert.equal(manifestSHA,verifiedManifestSHA,'The exact build manifest must remain unchanged');else verifiedManifestSHA=manifestSHA;
 for(const [path,expected] of Object.entries(manifest.inputs)){assert.ok(!isAbsolute(path)&&!path.split(/[\\/]/).includes('..'));assert.equal(digest(await readFile(join(root,path))),expected,'Source changed after build: '+path);}
 for(const [path,expected] of Object.entries(manifest.outputs)){assert.ok(!isAbsolute(path)&&!path.split(/[\\/]/).includes('..'));assert.equal(digest(await readFile(join(web,path))),expected,'Bundle changed after build: '+path);}
 assert.deepEqual((await files(web)).map(path=>relative(web,path)).sort(),Object.keys(manifest.outputs).sort(),'No bundle output may appear or disappear after build');
 assert.ok(manifest.outputs['entry.mjs']);report.manifest={sha256:manifestSHA,inputFiles:Object.keys(manifest.inputs).length,bundleFiles:Object.keys(manifest.outputs).length};
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
  dom=await bounded(record.page.evaluate(()=>({containerPresent:!!document.getElementById('actual-pwa-trash'),libraryCount:document.querySelectorAll('.notebook-library').length,folderRows:document.querySelectorAll('.note-folder-row').length,source:window.__paperPwaTrash?.state()?.source??null,fixtureError:window.__paperPwaTrash?.state()?.unexpected??null})),'Bounded failed UI snapshot',600,true);
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
 const record={child,pid:child.pid,start:null,baseline,members:new Map(),stderr:'',browser:null,page:null,exit:null,killed:false,pageErrors:[],consoleErrors:[],failedAssets:[],phases:[],networkRefused:0,profile,role,events:[]},launchedAt=Date.now();
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
 record.page.on('requestfailed',request=>{const url=new URL(request.url());if(url.origin===origin){if(url.pathname==='/__qa-native-offline-probe'){record.nativeOfflineProbeFailures=(record.nativeOfflineProbeFailures??0)+1;return;}record.failedAssets.push({path:url.pathname.slice(0,180),resourceType:request.resourceType(),failure:String(request.failure()?.errorText??'').slice(0,120)});if(record.failedAssets.length>12)record.failedAssets.shift();}});
 await record.page.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===origin){const pinned=record.staticAssetsPinned&&route.request().method()==='GET'?pinnedStaticAssets.get(url.pathname):undefined;if(pinned){record.staticCacheHits=(record.staticCacheHits??0)+1;return followStaticRoute(route.fulfill({status:200,headers:{'content-type':staticContentType(url.pathname),'cache-control':'no-store','x-private-qa-static-sha256':pinned.sha256},body:pinned.body}));}return route.continue();}record.networkRefused++;return route.abort('blockedbyclient');});
 await bounded(record.page.setViewportSize(desktopViewport),'Set the declared browser viewport',2000);assert.deepEqual(record.page.viewportSize(),desktopViewport);
 await bounded(record.page.goto(origin,{waitUntil:'load',timeout:15000}),'Open private fixture origin');
 await bounded(record.page.waitForFunction(()=>!!window.__paperPwaTrash,null,{timeout:15000}),'Load actual browser fixture API');
 assert.deepEqual(record.pageErrors,[],'Actual browser module initialization must not fail');assert.equal(record.networkRefused,0,'The fixture must use only its private localhost origin');
 return record;
}

const staticContentType=path=>/\.m?js$/.test(path)?'text/javascript; charset=utf-8':path.endsWith('.css')?'text/css; charset=utf-8':path.endsWith('.pdf')?'application/pdf':path.endsWith('.svg')?'image/svg+xml':path.endsWith('.png')?'image/png':path.endsWith('.webp')?'image/webp':path.endsWith('.woff2')?'font/woff2':path.endsWith('.woff')?'font/woff':path.endsWith('.wasm')?'application/wasm':'application/octet-stream';
async function pinStaticManifest(){
 const manifest=JSON.parse(await readFile(manifestPath,'utf8')),paths=Object.keys(manifest.outputs).sort();let bytes=0;const sizes=new Map();
 for(const path of paths){assert.ok(path!=='v1'&&!path.startsWith('v1/'),'API paths cannot enter the declared static fixture cache');const size=(await stat(join(web,path))).size;assert.ok(Number.isSafeInteger(size)&&size>=0&&size<=staticCacheItemBudget,'A static resource exceeds the declared 32MiB per-item fixture cache budget');bytes+=size;assert.ok(bytes<=staticCacheBudget,'The exact bundle exceeds the declared 64MiB fixture cache budget; do not silently cache a subset');sizes.set(path,size);}
 for(const path of paths){const body=await readFile(join(web,path)),sha256=digest(body);assert.equal(body.length,sizes.get(path));assert.equal(sha256,manifest.outputs[path],'Every cached static byte must belong to the exact built manifest');pinnedStaticAssets.set('/'+path.split(sep).map(encodeURIComponent).join('/'),{body,sha256});}
 report.staticFixtureCache={kind:'explicit-route-pinned-static-bundle-bytes',allManifestOutputs:true,scope:'Only GET for exact same-origin manifest resources; never /v1/API, no SW or installed-PWA cache proof',budgetBytes:staticCacheBudget,itemBudgetBytes:staticCacheItemBudget,bytes,resources:paths.length,manifestSHA256:verifiedManifestSHA};
}
async function prewarmStaticManifest(record){
 assert.equal(record.staticAssetsPinned,false,'Prewarm must use genuine online HTTP, before enabling the declared static fixture cache');assert.equal(await record.page.evaluate(()=>navigator.onLine),true,'Static prewarm runs before native offline');
 const expected=[...pinnedStaticAssets].map(([path,value])=>({path,sha256:value.sha256,size:value.body.length}));
 const proof=await bounded(followStaticRoute(record.page.evaluate(async items=>{let bytes=0;const rows=[];for(const item of items){const response=await fetch(item.path,{cache:'no-store'});if(!response.ok)throw Error('Static manifest prewarm failed: '+item.path);const body=await response.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',body))).map(value=>value.toString(16).padStart(2,'0')).join('');if(body.byteLength!==item.size||hash!==item.sha256)throw Error('Static manifest prewarm differs: '+item.path);bytes+=body.byteLength;rows.push({path:item.path,sha256:hash,size:body.byteLength});}return {bytes,rows};},expected)),'Online exact static manifest prewarm',15000);
 assertExactBody(proof.rows,expected,'Every manifest resource is genuinely fetched and verified before offline');assert.equal(proof.bytes,report.staticFixtureCache.bytes);record.staticPrewarm={online:true,allManifestOutputs:true,resources:proof.rows.length,bytes:proof.bytes,proofSHA256:bodySha(proof.rows)};
}
const requestHandlers=new Set(),httpErrors=[],httpSockets=new Set();
async function startServer(){
 const css=(await files(web)).filter(path=>path.endsWith('.css')).map(path=>'/'+relative(web,path).split(sep).join('/'));
 server=createServer((req,res)=>{let work;work=(async()=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);if(pathname==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+css.map(path=>'<link rel="stylesheet" href="'+path+'">').join('')+'<style>html,body{margin:0;min-height:100%}#actual-pwa-trash{height:100vh}</style></head><body><script type="module" src="/entry.mjs"></script></body></html>');return;}
  const file=resolve(web,'.'+pathname);if(!file.startsWith(resolve(web)+sep)||(await stat(file)).isDirectory())throw Error('Outside private library bundle');res.writeHead(200,{'content-type':/\.m?js$/.test(file)?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.pdf')?'application/pdf':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.png')?'image/png':file.endsWith('.webp')?'image/webp':file.endsWith('.woff2')?'font/woff2':'application/octet-stream','cache-control':'no-store'});res.end(await readFile(file));
 }catch{res.writeHead(404);res.end('Private fixture request refused');}})().catch(error=>{httpErrors.push(brief(error));}).finally(()=>requestHandlers.delete(work));requestHandlers.add(work);});server.on('connection',socket=>{httpSockets.add(socket);socket.once('close',()=>httpSockets.delete(socket));});await bounded(new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);}), 'Private library HTTP listener',3000);origin=`http://127.0.0.1:${server.address().port}`;
}
function phase(record,label){record.fixturePhase=label;record.phases.push({phase:label,at:new Date().toISOString()});if(record.phases.length>32)record.phases.shift();}
async function call(record,method,...args){record.lastFixtureMethod=method;return bounded(record.page.evaluate(({method,args})=>{const api=window.__paperPwaTrash;if(!api||typeof api[method]!=='function')throw Error('Missing private library fixture method '+method);return api[method](...args);},{method,args}),'Actual library '+method);}

async function open(record,runId,reopen=false){
 phase(record,'initial/prewarm-manifest');record.staticAssetsPinned=false;await prewarmStaticManifest(record);phase(record,'initial/preload');const preloaded=await call(record,'preload');assert.equal(preloaded.apiCalls,0);assert.equal(preloaded.started,false);assert.equal(preloaded.appMounted,false);record.staticAssetsPinned=true;await record.page.context().setOffline(true);assert.equal(await record.page.evaluate(()=>navigator.onLine),false,'Native offline is applied before App mount; navigator is never replaced');const probe=await bounded(record.page.evaluate(async()=>{try{await fetch('/__qa-native-offline-probe',{cache:'no-store'});return false;}catch{return true;}}),'Uncached native offline proof',2000);assert.equal(probe,true,'The explicit static fixture cache must not mask native offline for uncached requests');
 phase(record,'initial/start');await call(record,'start',runId,reopen);await call(record,'ready');
}
const card=record=>record.page.locator('[data-library-note-id="restorable-original"]');
const all=record=>call(record,'inventory');
const libraryRow=inv=>inv[0].drafts.find(row=>row.type==='preferences'&&row.documentId==='paper-library-v1');
async function ready(record){return call(record,'ready');}
async function collection(record,name){const library=record.page.getByRole('main',{name:'Bibliothèque de notes',exact:true}),accessibleName=name==='Corbeille'?/^Corbeille(?:\s*\d+)?$/:name;await library.getByRole('button',{name:accessibleName,exact:typeof accessibleName==='string'}).click();await ready(record);}
async function trash(record){await card(record).locator('input[type="checkbox"]').check();await record.page.getByRole('button',{name:'Mettre à la corbeille',exact:true}).click();await ready(record);assert.equal(await card(record).count(),0,'Trash removes only the selected card from the active collection');}
async function restore(record){await card(record).getByRole('button',{name:'Restaurer',exact:true}).click();await ready(record);assert.equal(await card(record).count(),0,'The restored card leaves the trash collection');}
function exactOriginals(actual,expected,label){
 assert.equal(actual.length,expected.length,label+': no scope may appear/disappear');for(let index=0;index<expected.length;index++){
  const old=expected[index],next=actual[index];assertExactBody(next.scope,old.scope,label+': scope identity');
  if(index){assertExactBody(next,old,label+': every foreign account/year graph/classification/file/history/outbox stays exact');continue;}
  assertExactBody(next.drafts.filter(row=>row.type!=='preferences'||row.documentId!=='paper-library-v1'),old.drafts.filter(row=>row.type!=='preferences'||row.documentId!=='paper-library-v1'),label+': canonical/metadata/other drafts exact');
  assertExactBody(next.files,old.files,label+': every media attribute and stored/actual SHA exact');assertExactBody(next.queue,old.queue,label+': entire outbox exact');
 }
}
function classificationTransition(actual,expected,deletedAt,label){
 exactOriginals(actual,expected,label);const old=libraryRow(expected),next=libraryRow(actual);assert.ok(old&&next,'Both native Library rows must exist');const{collaboration:oldCRDT,...oldBody}=old.content,{collaboration:newCRDT,...newBody}=next.content;
 assert.equal(next.content.revision,old.content.revision+1,label+': exactly one admitted Library revision');assert.ok(Number.isFinite(Date.parse(next.content.updatedAt)));assert.ok(Date.parse(next.content.updatedAt)>=Date.parse(old.content.updatedAt));
 assertExactBody(newBody,{...oldBody,revision:oldBody.revision+1,updatedAt:newBody.updatedAt,notes:{...oldBody.notes,'restorable-original':{...oldBody.notes['restorable-original'],deletedAt}}},label+': only deletedAt may change in the entire classification');
 assert.ok(newCRDT&&newCRDT.schema===1&&newCRDT.lineage===oldCRDT.lineage&&typeof newCRDT.state==='string');assert.notEqual(newCRDT.state,oldCRDT.state,label+': the real Library CRDT records the operation');
 const{content:discardOld,updatedAt:oldTime,title:oldTitle,syncState:oldSync,...oldDraft}=old,{content:discardNew,updatedAt:newTime,title:newTitle,syncState:newSync,...newDraft}=next;assertExactBody(newDraft,oldDraft,label+': native Library identity/base/flags stay exact');assert.equal(newTitle,'Bibliothèque de notes');assert.equal(newSync,'local');assert.ok(Number.isFinite(newTime)&&newTime>=oldTime);
 const key=`paper-history|${expected[0].scope.accountId}|${expected[0].scope.spaceId}|preferences|paper-library-v1|${String(old.content.revision).padStart(12,'0')}`;
 const prior=expected[0].snapshots,after=actual[0].snapshots,expectedHistory={key,accountId:expected[0].scope.accountId,spaceId:expected[0].scope.spaceId,value:old.content};
 assert.ok(!prior.some(row=>row.key===key),label+': fixture must not overwrite a preexisting history key');assertExactBody(after,[...prior,expectedHistory].sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0),label+': one exact old whole Library snapshot and nothing else');
}
async function validate(record){const row=await call(record,'validateLibrary');assert.ok(row.content.collaboration,'The real Library validator must open its recorded Yjs state');return row;}
async function inspectOriginalUI(record){
 await card(record).locator('.note-card-open').click();await call(record,'opened');await record.page.locator('.paper-notebook').waitFor({state:'visible',timeout:10000});
 assert.match(await record.page.locator('[data-object="exact-text"]').first().textContent(),/Exact text é 📝/);assert.ok(await record.page.locator('[data-object="exact-ink"]').count()>0,'Actual restored page keeps its original ink');await bounded(record.page.waitForFunction(()=>{const image=document.querySelector('[data-object="exact-image"] img');return image instanceof HTMLImageElement&&image.complete&&image.naturalWidth>0;},null,{timeout:10000}),'Actual native local image ready');assert.equal(await record.page.locator('[data-object="exact-image"] .paper-asset-missing').count(),0,'The restored original image cannot be replaced by an error placeholder');assert.ok(await record.page.getByRole('button',{name:'Écouter ce passage',exact:true}).count()>0,'Actual restored audio anchor remains reachable');
 await record.page.getByRole('button',{name:'Mes notes',exact:true}).click();await ready(record);
}
async function reloadSame(record,runId){
 const url=record.page.url(),cleanup=await call(record,'cleanup');assert.equal(cleanup.appNodes,0);assert.equal(cleanup.pending,0);assert.equal(cleanup.pendingWriters,false);assert.equal(cleanup.nativeTransactions,0);assert.equal(cleanup.nativeConnections,0);assert.equal(cleanup.nativeOpens,0);
 await record.page.context().setOffline(false);await bounded(record.page.reload({waitUntil:'load',timeout:15000}),'Native same-origin/profile reload');assert.equal(record.page.url(),url);await bounded(record.page.waitForFunction(()=>!!window.__paperPwaTrash,null,{timeout:15000}),'Fresh actual fixture API without RAM reseed');await open(record,runId,true);
}
async function restored(record,runId){
 await open(record,runId);const seeded=await all(record);assert.equal(seeded.length,4);assert.equal(seeded[0].files.length,3);for(const file of seeded[0].files)assert.equal(file.sha256,file.blobSha256,'Stored proof and actual original file bytes agree');
 await inspectOriginalUI(record);const before=await all(record);exactOriginals(before,seeded,'Opening the actual original Notebook');phase(record,'trash/ordinary-ui');await trash(record);const deleted=await all(record),removed=libraryRow(deleted).content.notes['restorable-original'].deletedAt;assert.ok(Number.isFinite(Date.parse(removed)));classificationTransition(deleted,before,removed,'Actual trash');await validate(record);
 await collection(record,'Corbeille');assert.equal(await card(record).count(),1);assert.equal(await card(record).locator('.note-card-open').isDisabled(),true,'Trash cannot reopen or edit the hidden note');assert.equal(await card(record).getByRole('button',{name:'Restaurer',exact:true}).isEnabled(),true);
 phase(record,'trash/native-reload-without-reseed');await reloadSame(record,runId);await collection(record,'Corbeille');assertExactBody(await all(record),deleted,'Native reload keeps exact deleted classification and all original sources');phase(record,'restore/ordinary-ui');await restore(record);const after=await all(record);classificationTransition(after,deleted,null,'Actual restore');await validate(record);await collection(record,'Toutes les notes');assert.equal(await card(record).count(),1);await inspectOriginalUI(record);exactOriginals(await all(record),before,'Restored actual Notebook content and file identities');
 const stable=await all(record);phase(record,'restore/native-reload-without-reseed');await reloadSame(record,runId);await collection(record,'Toutes les notes');assertExactBody(await all(record),stable,'Restored note remains exact after native reload');
 return {actualPwaApp:true,nativeIndexedDB:true,ordinaryTrashAndRestore:true,originalTextInkSensorsMediaAndIDsExact:true,classificationLinksExact:true,fourScopesExact:true,nativeReloadWithoutSeed:true,canonicalTombstoneAndThirtyDays:false};
}
async function storageFailure(record,runId){
 await open(record,runId);const before=await all(record);await call(record,'armQuota');await card(record).locator('input[type="checkbox"]').check();await record.page.getByRole('button',{name:'Mettre à la corbeille',exact:true}).click();const failed=await call(record,'quotaSettled');assert.ok(failed.native.quotaPuts>=1&&failed.native.quotaPuts<=4,'The real bounded Library save/recovery attempts must actually reach put success');assert.equal(failed.native.quotaAborts,failed.native.quotaPuts);assert.equal(failed.library.conflict,true);await record.page.getByRole('region',{name:'Versions du classement',exact:true}).waitFor({state:'visible',timeout:5000});assertExactBody(await all(record),before,'Every aborted native write rolls back Library/history and preserves all sources/media/foreign scopes/outbox');
 phase(record,'quota/native-reopen-preserved-source');await reloadSame(record,runId);await collection(record,'Toutes les notes');assert.equal(await card(record).count(),1);assertExactBody(await all(record),before,'Fresh native reopen reads the original durable classification, never a reseeded substitute');await trash(record);await collection(record,'Corbeille');await restore(record);await collection(record,'Toutes les notes');exactOriginals(await all(record),before,'Fresh explicit retry and restore preserve all original notes/media');
 return {actualPwaApp:true,nativeAbortAfterSuccessfulPut:true,quotaRetriesBounded:true,rollbackAllStoresExact:true,visibleConflict:true,nativeReloadAndFreshRetry:true,noDataLoss:true};
}
async function login(record,index){const credentials=await call(record,'beginLogin',index);await record.page.locator('form input[name="email"]').fill(credentials.email);await record.page.locator('form input[name="password"]').fill(credentials.password);await record.page.getByRole('button',{name:'Se connecter',exact:true}).click();await call(record,'loginReady',index);}
async function inert(record,id,label){const before=await all(record),state=await call(record,'state'),result=await call(record,'invokeCaptured',id);assert.equal(result.result,false,label+': old restore admission must refuse');assert.deepEqual(result.after,result.before,label+': refusal precedes every IDB open, API capture or bind');assertExactBody(await all(record),before,label+': every classification/source/media/history/outbox stays exact');const after=await call(record,'state');assertExactBody(after.source,state.source,label+': source unchanged');assert.equal(after.library.revision,state.library.revision);}
async function retired(record,runId){
 await open(record,runId);await trash(record);await collection(record,'Corbeille');const oldOwner=await call(record,'captureRestore');await login(record,1);await login(record,0);await collection(record,'Corbeille');await inert(record,oldOwner,'Owner/account A-B-A');
 const oldApi=await call(record,'captureRestore'),api=await call(record,'retireApi');assert.equal(api.heldCurrent,false);await inert(record,oldApi,'Same-object API epoch A-B-A');await call(record,'refresh');await ready(record);await collection(record,'Corbeille');await restore(record);await collection(record,'Toutes les notes');assert.equal(await card(record).count(),1);
 return {actualPwaAuthUI:true,ownerABARefused:true,internalApiEpochABARefused:true,oldCallbackZeroOpensCapturesBindings:true,freshRestore:true,retainedCommittedCallbackDeliveryExplicit:true};
}
async function trashFailureState(record){const common=await failureState(record);if(!record?.page||record.page.isClosed()||!record.browser?.isConnected())return common;let state;try{state=await bounded(record.page.evaluate(()=>window.__paperPwaTrash?.state()),'Bounded actual PWA Library/source diagnostics',700,true);}catch(error){state={error:privateBrief(error,[record])};}return {...common,fixturePhase:record.fixturePhase??null,lastFixtureMethod:record.lastFixtureMethod??null,phases:record.phases,failedAssets:record.failedAssets,staticPrewarm:record.staticPrewarm??null,staticAssetsPinned:record.staticAssetsPinned??false,staticCacheHits:record.staticCacheHits??0,state:privateValue(state,[record])};}
async function cleanupGroup(){const errors=[];for(const record of [...owned])try{await killOwned(record);}catch(error){errors.push(error);}try{await drainStaticRoutes(true);}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Private library browser cleanup failed');}
async function runBrowser(){
 await verifyBundle();try{playwright=await import('playwright');}catch(error){report.availability={status:'NOTRUN',reason:'Existing Playwright unavailable',error:brief(error)};return;}
 const executable=process.env.DOWZE_CRASH_CHROMIUM_PATH||playwright.chromium.executablePath();assert.ok(isAbsolute(executable));try{await access(executable,constants.X_OK);}catch{report.availability={status:'NOTRUN',reason:'Existing Chromium executable unavailable; no download'};return;}
 report.availability={status:'AVAILABLE',executable:executable.split(sep).at(-1),executed:false};workDir=await mkdtemp(join(tmpdir(),'dowze-pwa-trash-browser-'));await writeFile(join(workDir,'.owned-synthetic-browser-profiles'),'private synthetic library profiles only\n');await pinStaticManifest();await startServer();
 for(const name of cases){
  if(diagnosticCase&&name!==diagnosticCase){report.groups.push({name,status:'NOTRUN',reason:'Diagnostic exact library case'});continue;}
  if(Date.now()>=deadline)throw Error('Library tree global deadline exhausted before next group');const profile=await mkdtemp(join(workDir,'profile-'));profiles.add(profile);let first=null,current=null,result;report.groupsStarted++;
  try{
   first=await launch(profile,executable,'library-'+name);current=first;report.availability.executed=true;const version=first.browser.version(),runId=randomUUID();let evidence;
   if(name==='local-trash-restore-reload')evidence=await restored(first,runId);else if(name==='storage-abort-preserves-original')evidence=await storageFailure(first,runId);else evidence=await retired(first,runId);
   const fixtureCleanup=await call(current,'cleanup');assert.equal(fixtureCleanup.appNodes,0);assert.equal(fixtureCleanup.libraryNodes,0);assert.equal(fixtureCleanup.pending,0);assert.equal(fixtureCleanup.nativeOpens,0);assert.equal(fixtureCleanup.nativeConnections,0);assert.equal(fixtureCleanup.nativeTransactions,0);assert.equal(fixtureCleanup.pendingWriters,false);assert.deepEqual(fixtureCleanup.unexpected,[]);assert.deepEqual(current.pageErrors,[]);assert.equal(current.networkRefused,0);await drainStaticRoutes();assert.deepEqual(staticRouteErrors,[],'Pinned static asset delivery must not hide an original rejection');result={name,status:'PASS',browserVersion:version,evidence,fixturePreparation:{viewport:desktopViewport,staticPrewarm:current.staticPrewarm,staticCacheHits:current.staticCacheHits??0,nativeOffline:true,nativeOfflineProbeFailures:current.nativeOfflineProbeFailures??0,apiCallsDuringPreload:0},fixtureCleanup};report.passed++;
  }catch(error){result={name,status:'FAIL',error:privateBrief(error,[first,current]),diagnostics:await trashFailureState(current??first)};report.failed++;console.error(name+': FAIL '+result.error.message);}
  finally{
   if(result)report.groups.push(result);try{await cleanupGroup();await rm(profile,{recursive:true,force:true});profiles.delete(profile);if(result)result.cleanup={status:'PASS'};}catch(error){if(result){result.cleanup={status:'FAIL',error:brief(error)};if(result.status==='PASS'){result.bodyStatus='PASS';result.status='FAIL';report.passed--;report.failed++;}}throw error;}
  }
  console.log(name+': '+result.status);
 }
}
try{await verifyLifecycleBaseline();await requireCentralGuard();if(buildPhase)await buildBundle();else await runBrowser();}
catch(error){report.fatal=brief(error);console.error('Library tree browser recipe failed: '+report.fatal.message);process.exitCode=1;}
finally{
 const errors=[];try{await cleanupGroup();}catch(error){errors.push(error);}if(server)try{server.closeAllConnections();await bounded(new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve())),'Library private HTTP cleanup',3000,true);await bounded((async()=>{while(requestHandlers.size)await Promise.allSettled([...requestHandlers]);})(),'Drain actual HTTP request handlers',3000,true);await bounded((async()=>{while(httpSockets.size)await sleep(10);})(),'Observe native HTTP sockets closed',1000,true);assert.equal(requestHandlers.size,0);assert.equal(httpSockets.size,0);assert.deepEqual(httpErrors,[]);}catch(error){errors.push(error);}
 if(owned.size===0){for(const profile of profiles)try{await rm(profile,{recursive:true,force:true});profiles.delete(profile);}catch(error){errors.push(error);}if(workDir)try{await rm(workDir,{recursive:true,force:true});}catch(error){errors.push(error);}}
 report.cleanupFinal=errors.length?{status:'FAIL',error:brief(new AggregateError(errors,'Final library tree cleanup failed'))}:{status:'PASS',remainingOwnedBrowsers:owned.size,remainingProfiles:profiles.size,httpListening:server?.listening??false,pendingHTTPHandlers:requestHandlers.size,openHTTPSockets:httpSockets.size};if(errors.length)process.exitCode=1;
 try{await verifyBundle();report.finalFreeze={status:'PASS',...report.manifest};}catch(error){report.finalFreeze={status:'FAIL',error:brief(error)};process.exitCode=1;}
 if(runPhase){const attempted=new Set(report.groups.map(group=>group.name));for(const name of cases)if(!attempted.has(name))report.groups.push({name,status:'NOTRUN',reason:report.availability?.reason??'Earlier fatal or cleanup failure'});report.allGroupsAttempted=report.groupsStarted===cases.length;report.fullSuite=!diagnosticCase&&report.groupsStarted===cases.length&&report.passed===cases.length&&!report.failed&&!report.fatal&&report.cleanupFinal.status==='PASS'&&report.finalFreeze.status==='PASS';report.diagnosticPassed=!!diagnosticCase&&report.groupsStarted===1&&report.passed===1&&!report.failed&&!report.fatal&&report.cleanupFinal.status==='PASS'&&report.finalFreeze.status==='PASS';if(!report.fullSuite&&!report.diagnosticPassed)process.exitCode||=report.availability?.status==='NOTRUN'?2:1;}
 if(staticRouteOriginals.size){console.error(JSON.stringify({kind:'FATAL_STOP',finalReportWritten:false,pendingPinnedResourceRoutes:staticRouteOriginals.size}));throw Error('Original static prewarm or pinned-resource actors remain active; no final report');}report.staticFixtureCacheFinal={pendingRoutes:staticRouteOriginals.size,routeErrors:staticRouteErrors};report.finishedAt=new Date().toISOString();await mkdir(dirname(artifact),{recursive:true});await writeFile(artifact,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({phase:report.phase,passed:report.passed,failed:report.failed,notRun:report.groups.filter(group=>group.status==='NOTRUN').length,fullSuite:report.fullSuite,diagnosticPassed:report.diagnosticPassed??false,cleanup:report.cleanupFinal.status,finalFreeze:report.finalFreeze.status,fatal:report.fatal?.message??null,report:artifact}));
}

