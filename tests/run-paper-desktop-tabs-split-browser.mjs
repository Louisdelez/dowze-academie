import {assertExclusivePaperTextPaint} from './paper-text-reader-paint-browser-cases.mjs';
/* NOT RUN by its author. Actual Desktop App, ServerSettings and native browser IDB.
 * The local-auth parent and Tauri IPC backend are explicit private seams;
 * declared changes GETs return synthetic HTTP 503 while discovery remains local.
 * Separate build/runtime retain the central guard and exact owned PID cleanup.
 * No native OS/auth/backend, physical input, installed PWA/SW or production-deployment claim. Static private-origin traffic is available so real PDF worker/lazy modules load; backend changes remain an explicit HTTP 503 IPC seam.
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
const root=process.cwd(),cases=['tabs-library-close-reopen','split-resize-independent-notes'];
const diagnosticCase=process.env.DOWZE_DESKTOP_TABS_SPLIT_ONLY?.trim()||null;
if(diagnosticCase&&!cases.includes(diagnosticCase))throw Error('DOWZE_DESKTOP_TABS_SPLIT_ONLY must name one exact declared library case.');
const args=process.argv.slice(2),buildPhase=args.includes('--build'),runPhase=args.includes('--run'),dirAt=args.indexOf('--bundle-dir'),bundleDir=dirAt>=0?args[dirAt+1]:undefined;
if(buildPhase===runPhase||!bundleDir||!isAbsolute(bundleDir)||args.some((arg,i)=>!['--build','--run','--bundle-dir'].includes(arg)&&i!==dirAt+1))throw Error('Use exactly --build or --run and --bundle-dir /absolute/new/private/directory.');
const artifact=mountedAuditPath(`n015-n016-paper-desktop-tabs-split-browser-${buildPhase?'build':'runtime'}-20261015.json`),web=join(bundleDir,'web'),manifestPath=join(bundleDir,'manifest.json');
const desktopViewport={width:1440,height:900},desktopWindowConfig='src-tauri/tauri.conf.json';
const lifecycleBaseline={path:'tests/run-paper-library-tree-browser.mjs',sha256:'cc666295f9bbb4fb0797c36a2e1ac9fdbc6753d733bf6cba940dc844e9634303',blocks:['requireCentralGuard','procInfo','cgroupPids/discoverOwned/killOwned']};
const report={schema:1,kind:'paper-desktop-tabs-split-real-chromium',lifecycleBaseline,phase:buildPhase?'build':'runtime',startedAt:new Date().toISOString(),proofScope:'Actual Desktop App/ServerSettings and native browser IDB; synthetic authenticated-profile parent and Tauri IPC endpoint are declared seams. Exact scoped changes GETs return synthetic HTTP 503; discovery is a local fixture response and no publication IPC is accepted. Two actual long App notes, native trusted text input and media decoding are observed. No native OS window/authentication/backend/SW, physical pen/touch/IME or actual offline transport claim.',diagnosticOnly:!!diagnosticCase,declaredGroups:buildPhase?1:cases.length,declaredNames:buildPhase?['Separate actual Desktop tabs/split fixture build']:cases,groupsStarted:0,fullSuite:false,availability:null,manifest:null,passed:0,failed:0,groups:[],cleanupFinal:{status:'NOTRUN'},finalFreeze:{status:'NOTRUN'},fatal:null};
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
const pendingOperations=new Map(),timeouts=[];
function original(work,label){const promise=Promise.resolve(work);if(!pendingOperations.has(promise)){pendingOperations.set(promise,label);void promise.then(()=>pendingOperations.delete(promise),()=>pendingOperations.delete(promise));}return promise;}
const bounded=async(work,label,ms=15000,cleanup=false)=>{const promise=original(work,label);let timer;try{const time=Math.min(ms,(cleanup?cleanupDeadline:deadline)-Date.now());if(time<=0)throw Error(label+': runtime deadline exhausted');return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>{timeouts.push(label);reject(Error(label+': timeout; original remains followed'));},time);})]);}finally{clearTimeout(timer);}};
async function drainOriginals(label){const until=Math.min(cleanupDeadline,Date.now()+10000);while(pendingOperations.size){if(Date.now()>=until)throw Error(label+': originals remain '+JSON.stringify([...pendingOperations.values()].slice(0,8)));await Promise.race([Promise.allSettled([...pendingOperations.keys()]),sleep(15)]);}}

let qaCgroup;
async function verifyLifecycleBaseline(){
 const previous=await readFile(join(root,lifecycleBaseline.path),'utf8'),current=await readFile(join(root,'tests/run-paper-desktop-tabs-split-browser.mjs'),'utf8');assert.equal(digest(previous),lifecycleBaseline.sha256,'The lifecycle reference must be the exact frozen N001 runner');
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
async function verifyDesktopViewport(){
 const bytes=await readFile(join(root,desktopWindowConfig)),config=JSON.parse(bytes.toString('utf8')),main=config.app?.windows?.find(window=>window.label==='main');
 assert.ok(main,'The actual Tauri main-window configuration must exist');assert.deepEqual({width:main.width,height:main.height},desktopViewport,'This Desktop recipe must retain the actual configured initial main-window dimensions');
 report.viewport={...desktopViewport,source:desktopWindowConfig,sourceSHA256:digest(bytes),minimum:{width:main.minWidth,height:main.minHeight}};
}
async function buildBundle(){
 report.groupsStarted=1;await mkdir(bundleDir);await writeFile(join(bundleDir,'.owned-desktop-new-note-build'),'private synthetic library fixture only\n');
 const {build}=await import('vite'),virtualWorker='\0private-writing-worker-url',workerInput='node_modules/pdfjs-dist/build/pdf.worker.min.mjs',seenSources=new Set();
 // Vite library mode forces imported assets into data URLs before consulting
 // assetsInlineLimit. The real App includes large sprite/WASM assets; use the
 // ordinary frontend pipeline and emit files, retaining the identical entry.
 const built=await build({configFile:false,publicDir:false,define:{'process.env.NODE_ENV':JSON.stringify('production')},esbuild:{jsx:'automatic'},plugins:[{name:'private-writing-pdf-worker-url',enforce:'pre',resolveId(id){if(id==='pdfjs-dist/build/pdf.worker.min.mjs?url')return virtualWorker;},load(id){if(id===virtualWorker)return 'export default "/pdf.worker.mjs";';},transform(_code,id){const clean=id.split('?')[0];if(isAbsolute(clean)&&clean.startsWith(root+sep)&&!clean.includes(sep+'node_modules'+sep))seenSources.add(relative(root,clean));}}],build:{outDir:web,emptyOutDir:false,copyPublicDir:false,assetsInlineLimit:0,target:'es2022',minify:false,sourcemap:false,reportCompressedSize:false,rollupOptions:{input:join(root,'tests/paper-desktop-tabs-split-browser-entry.tsx'),preserveEntrySignatures:'strict',output:{format:'es',entryFileNames:'entry.mjs',chunkFileNames:'chunks/[name]-[hash].mjs',assetFileNames:'assets/[name]-[hash][extname]'}}},logLevel:'error'});
 await writeFile(join(web,'pdf.worker.mjs'),await readFile(join(root,workerInput)));
 const sources=new Set([...seenSources,'tests/run-paper-desktop-tabs-split-browser.mjs','tests/paper-desktop-tabs-split-browser-entry.tsx','tests/paper-text-reader-paint-browser-cases.mjs',lifecycleBaseline.path,'tests/mounted-cleanup.mjs','tests/paper-real-editor-probe.ts','tests/fixtures/paper-pdf-selection-columns.pdf','package.json',desktopWindowConfig,'node_modules/playwright-core/types/protocol.d.ts',workerInput]);
 for(const result of Array.isArray(built)?built:[built])for(const chunk of result.output??[])if(chunk.type==='chunk')for(const id of Object.keys(chunk.modules)){const clean=id.split('?')[0];if(isAbsolute(clean)&&clean.startsWith(root+sep)&&!clean.includes(sep+'node_modules'+sep))sources.add(relative(root,clean));}
 const inputs={},outputs={};for(const path of [...sources].sort())inputs[path]=digest(await readFile(join(root,path)));for(const path of await files(web))outputs[relative(web,path)]=digest(await readFile(path));
 assert.ok(outputs['entry.mjs']);assert.ok(Object.keys(outputs).some(path=>path.endsWith('.css')),'Actual shared library CSS must be built');
 const manifest={schema:1,kind:'paper-desktop-tabs-split-browser-build',builtAt:new Date().toISOString(),inputs,outputs};await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');report.manifest={sha256:digest(await readFile(manifestPath)),inputFiles:Object.keys(inputs).length,bundleFiles:Object.keys(outputs).length};report.passed=1;report.groups=[{name:'Separate actual Desktop tabs/split fixture build',status:'PASS'}];report.buildComplete=true;
}
let verifiedManifestSHA;
async function verifyBundle(){
 const bytes=await readFile(manifestPath),manifestSHA=digest(bytes),manifest=JSON.parse(bytes.toString('utf8'));assert.equal(manifest.schema,1);assert.equal(manifest.kind,'paper-desktop-tabs-split-browser-build');
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
  dom=await bounded(record.page.evaluate(()=>({containerPresent:!!document.getElementById('actual-desktop-tabs-split'),libraryCount:document.querySelectorAll('.notebook-library').length,folderRows:document.querySelectorAll('.note-folder-row').length,source:window.__desktopTabsSplit?.state()?.source??null,fixtureError:window.__desktopTabsSplit?.state()?.nativeIPC?.errors??null})),'Bounded failed UI snapshot',600,true);
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
 assert.ok(Buffer.byteLength(join(profile,'tmp/org.chromium.Chromium.XXXXXX/SingletonSocket'))<104,'Private profile path must fit the native Unix socket limit');
 await rm(join(profile,'DevToolsActivePort'),{force:true});
 const config=join(profile,'xdg-config'),cache=join(profile,'xdg-cache'),temp=join(profile,'tmp');for(const path of [config,cache,temp])await mkdir(path,{recursive:true});const baseline=await cgroupPids();
 const child=spawn(executable,['--headless=new',`--user-data-dir=${profile}`,'--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-sync','--disable-extensions','about:blank'],{detached:true,stdio:['ignore','ignore','pipe'],env:{...process.env,XDG_CONFIG_HOME:config,XDG_CACHE_HOME:cache,TMPDIR:temp}});
 const record={child,pid:child.pid,start:null,baseline,members:new Map(),stderr:'',stderrHead:'',browser:null,page:null,exit:null,killed:false,pageErrors:[],consoleErrors:[],failedAssets:[],phases:[],networkRefused:0,profile,role,events:[]},launchedAt=Date.now();
 const event=name=>{record.events.push({event:name,elapsedMs:Date.now()-launchedAt});if(record.events.length>12)record.events.shift();};
 record.exited=new Promise(resolve=>{child.once('exit',(code,signal)=>{record.exit={code,signal};resolve(record.exit);});child.once('error',error=>{record.exit={code:null,signal:null,error:brief(error)};resolve(record.exit);});});
 child.stderr.on('data',value=>{const chunk=value.toString();record.stderrHead=(record.stderrHead+chunk).slice(0,1500);record.stderr=(record.stderr+chunk).slice(-1500);});
 if(!Number.isSafeInteger(record.pid))throw Error('Owned Chromium child could not be created');
 owned.add(record);const started=await procInfo(record.pid);if(!started)throw Error('Owned Chromium exited before its process identity was captured');record.start=started.start;record.members.set(record.pid,started);assert.equal(started.group,record.pid,'Browser must use its own detached process group');
 let port;
 await bounded((async()=>{for(;;){if(record.exit)throw Error('Owned Chromium exited during startup: '+JSON.stringify(record.exit)+' '+(record.stderrHead+' '+record.stderr).replace(/ws:\/\/\S+/g,'<devtools-endpoint>').replaceAll(profile,'<private-profile>'));try{const lines=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');if(/^\d+$/.test(lines[0])&&lines[1]?.startsWith('/devtools/browser/')){port=Number(lines[0]);break;}}catch(error){if(error.code!=='ENOENT')throw error;}await sleep(30);}})(),'Owned Chromium startup');
 record.browser=await bounded(playwright.chromium.connectOverCDP(`http://127.0.0.1:${port}`,{timeout:15000}),'Connect owned Chromium CDP');
 record.browser.on('disconnected',()=>event('browser-disconnected'));
 const context=record.browser.contexts()[0];assert.ok(context,'Owned persistent default browser context must exist');const pages=context.pages();record.page=pages[0]??await context.newPage();for(const page of pages.slice(1))await page.close();
 record.page.on('crash',()=>event('page-crash'));record.page.on('close',()=>event('page-close'));
 record.page.on('pageerror',error=>{record.pageErrors.push(String(error.message).slice(0,500));if(record.pageErrors.length>8)record.pageErrors.shift();});
 record.page.on('console',message=>{if(message.type()==='error'){record.consoleErrors.push(message.text().slice(0,500));if(record.consoleErrors.length>8)record.consoleErrors.shift();}});
 record.page.on('requestfailed',request=>{const url=new URL(request.url());if(url.origin===origin){record.failedAssets.push({path:url.pathname.slice(0,180),resourceType:request.resourceType(),failure:String(request.failure()?.errorText??'').slice(0,120)});if(record.failedAssets.length>12)record.failedAssets.shift();}});
 await record.page.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===origin)return route.continue();record.networkRefused++;return route.abort('blockedbyclient');});
 await bounded(record.page.setViewportSize(desktopViewport),'Set the exact configured Desktop viewport',2000);assert.deepEqual(record.page.viewportSize(),desktopViewport);
 record.page.setDefaultTimeout(12000);await bounded(record.page.goto(origin,{waitUntil:'load',timeout:15000}),'Open private fixture origin');
 await bounded(record.page.waitForFunction(()=>!!window.__desktopTabsSplit,null,{timeout:15000}),'Load actual browser fixture API');
 assert.deepEqual(record.pageErrors,[],'Actual browser module initialization must not fail');assert.equal(record.networkRefused,0,'The fixture must use only its private localhost origin');
 return record;
}

const requestHandlers=new Set(),httpErrors=[],httpSockets=new Set();
async function startServer(){
 const css=(await files(web)).filter(path=>path.endsWith('.css')).map(path=>'/'+relative(web,path).split(sep).join('/'));
 server=createServer((req,res)=>{let work;work=(async()=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);if(pathname==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+css.map(path=>'<link rel="stylesheet" href="'+path+'">').join('')+'<style>html,body{margin:0;min-height:100%}#actual-desktop-tabs-split{height:100vh}</style></head><body><script type="module" src="/entry.mjs"></script></body></html>');return;}
  const file=resolve(web,'.'+pathname);if(!file.startsWith(resolve(web)+sep)||(await stat(file)).isDirectory())throw Error('Outside private library bundle');res.writeHead(200,{'content-type':/\.m?js$/.test(file)?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'application/octet-stream','cache-control':'no-store'});res.end(await readFile(file));
 }catch{res.writeHead(404);res.end('Private fixture request refused');}})().catch(error=>{httpErrors.push(brief(error));}).finally(()=>requestHandlers.delete(work));requestHandlers.add(work);});server.on('connection',socket=>{httpSockets.add(socket);socket.once('close',()=>httpSockets.delete(socket));});await bounded(new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);}), 'Private library HTTP listener',3000);origin=`http://127.0.0.1:${server.address().port}`;
}
function phase(record,label){record.fixturePhase=label;record.phases.push({phase:label,at:new Date().toISOString()});if(record.phases.length>32)record.phases.shift();}
async function call(record,method,...args){record.lastFixtureMethod=method;return bounded(record.page.evaluate(({method,args})=>{const api=window.__desktopTabsSplit;if(!api||typeof api[method]!=='function')throw Error('Missing private library fixture method '+method);return api[method](...args);},{method,args}),'Actual library '+method);}

async function open(record,runId){
 phase(record,'initial/preload-media');const warm=await call(record,'preload');assert.ok(warm.actualLazyModules&&warm.pdfBytes>0&&warm.pngBytes>0);assert.equal(await record.page.evaluate(()=>navigator.onLine),true,'Only the private static origin remains online for actual PDF workers/lazy modules; no offline claim');
 phase(record,'initial/start');await call(record,'start',runId);await notes(record);await call(record,'ready',0);return call(record,'fixtureInfo');
}
async function notes(record){await record.page.getByRole('button',{name:'Mes notes',exact:true}).click();await record.page.locator('.notebook-library').waitFor({state:'visible',timeout:10000});}
const panel=(record,id)=>record.page.locator('[id='+JSON.stringify('workspace-panel-'+id)+']');
const tab=(record,id)=>record.page.locator('[id='+JSON.stringify('workspace-tab-'+id)+']');
async function openNote(record,id){phase(record,'open-note/'+id);await record.page.locator('[data-library-note-id='+JSON.stringify(id)+'] .note-card-open').click();await panel(record,id).waitFor({state:'visible',timeout:10000});await call(record,'noteReady',id);}
async function selectTab(record,id){await tab(record,id).click();await panel(record,id).waitFor({state:'visible',timeout:10000});await call(record,'noteReady',id);}
async function clickVisible(record,locator,label,editorId){record.lastHitTarget={label,point:null,editorId:editorId??null,at:new Date().toISOString()};const until=Math.min(deadline,Date.now()+12000);let point=null;while(Date.now()<until&&!point){point=await bounded(locator.evaluateAll((nodes,editorId)=>window.__desktopTabsSplit.nativeHitTarget(nodes,editorId),editorId),'Read actual visible hit target for '+label,2000);if(!point)await sleep(20);}record.lastHitTarget={...record.lastHitTarget,point};assert.ok(point,'A genuine unclipped native hit target must exist for '+label);await record.page.mouse.click(point.x,point.y);}
async function activate(record,id){const pm=panel(record,id).locator('.paper-canonical-text-host[data-text-host-revoked="false"][data-text-host-parked="false"][data-canonical-text-object='+JSON.stringify(id+'-main-text')+'] .ProseMirror[contenteditable="true"]');if(!await pm.count())await clickVisible(record,panel(record,id).locator('.paper-page-viewport-frame[data-page-mounted="true"][data-page-parked="false"] .paper-editable-page-reader [data-object='+JSON.stringify(id+'-main-text')+']'),'actual canonical reader');const captured=await call(record,'editorReady',id);await revealTextWithWheel(record,id,captured.id);await clickVisible(record,pm,'actual editable PM',captured.id);return call(record,'editorReady',id);}

// An asserted retained viewport may legitimately leave its old editor above
// the visible page. Only a subsequent actual user wheel brings text back.
async function revealTextWithWheel(record,id,editorId){
 const evidence={noteId:id,editorId:editorId??null,needed:false,wheels:[]};(record.revealTextEvidence??=[]).push(evidence);
 for(let attempt=0;attempt<=12;attempt++){
  const target=await call(record,'editableTextVisibility',id,editorId);evidence.targetKind=target.targetKind;if(target.visible)return evidence;
  assert.ok(attempt<12,'A bounded series of genuine native wheels must expose the actual text target');evidence.needed=true;
  assert.ok(target.wheelPoint?.inside,'A clipped hit-tested point must belong to this note viewport before its wheel');assert.ok(target.scrollTop>0,'The preserved view must have a real upward scroll range when its text is above the viewport');
  phase(record,'native-wheel-return-to-text/'+id);const ticket=await call(record,'beginWheelObservation',id);await record.page.mouse.move(target.wheelPoint.x,target.wheelPoint.y);await record.page.mouse.wheel(0,-360);const observed=await call(record,'finishWheelObservation',ticket);
  assert.ok(observed.wheel.some(event=>event.trusted&&event.deltaY===-360),'A real trusted upward wheel must reach this exact note');assert.ok(observed.scroll.some(event=>event.trusted&&event.top!==observed.before.scroll.top),'The wheel must cause an actual trusted native scroll');assert.ok(observed.after.scroll.top<observed.before.scroll.top,'The actual native viewport must move upward before an editor click');evidence.wheels.push({before:observed.before.scroll.top,after:observed.after.scroll.top,trustedWheel:true,trustedScroll:true});
 }
}

async function input(record,id,text){await activate(record,id);await record.page.keyboard.press('Control+End');await record.page.keyboard.insertText(text);return call(record,'flushNote',id);}

async function all(record){return call(record,'inventory');}
function ownedScope(inv,source){const row=inv.scopes.find(row=>row.scope.accountId===source.accountId&&row.scope.spaceId===source.spaceId);assert.ok(row,'Exact current native scope must be present');return row;}
function graph(inv,source,id){const row=ownedScope(inv,source).drafts.find(row=>row.type==='whiteboard'&&row.content?.noteId===id);assert.ok(row,'The actual named canonical graph must exist');return row;}
function metadata(inv,source,id){const raw=inv.cache[source.metadataKey];assert.equal(typeof raw,'string');const row=JSON.parse(raw).documents.find(note=>note.id===id);assert.ok(row,'Named Desktop metadata must exist');return row;}
function assertForeign(actual,before,source){for(const previous of before.scopes)if(previous.scope.accountId!==source.accountId||previous.scope.spaceId!==source.spaceId)assertExactBody(actual.scopes.find(row=>row.scope.accountId===previous.scope.accountId&&row.scope.spaceId===previous.scope.spaceId),previous,'Every foreign account/year graph/media/outbox/receipt remains exact');for(const[key,value]of Object.entries(before.cache)){let parsed;try{parsed=JSON.parse(value);}catch{}if(key!==source.metadataKey&&Array.isArray(parsed?.documents))assertExactBody(actual.cache[key],value,'Every other native cache note-metadata authority remains exact');}}
function assertFiles(actual,before,source){assertExactBody(ownedScope(actual,source).files,ownedScope(before,source).files,'All actual PDF/image bytes and their original associations remain exact');assert.deepEqual(ownedScope(actual,source).drafts.filter(row=>row.type==='whiteboard').map(row=>row.documentId).sort(),ownedScope(before,source).drafts.filter(row=>row.type==='whiteboard').map(row=>row.documentId).sort(),'Tab and split commands cannot invent another graph identity');assert.deepEqual(JSON.parse(actual.cache[source.metadataKey]).documents.map(note=>note.id).sort(),JSON.parse(before.cache[source.metadataKey]).documents.map(note=>note.id).sort(),'Tab and split commands keep the complete original metadata note set');}
function hasOnly(result,wanted,absent){assert.ok(result.markdown.includes(wanted),'The actual canonical/mirrored buffer must contain its own new text');for(const value of absent)assert.equal(result.markdown.includes(value),false,'A note must not receive another note command');}
async function warmTwo(record,info){const [a,b]=info.notes;assert.equal(info.notes.length,2);await openNote(record,a.id);await panel(record,a.id).getByRole('combobox',{name:'Affichage des pages',exact:true}).selectOption('continuous');await call(record,'noteReady',a.id);await activate(record,a.id);await call(record,'flushNote',a.id);await call(record,'captureEditor',a.id);await notes(record);await openNote(record,b.id);await panel(record,b.id).getByRole('combobox',{name:'Affichage des pages',exact:true}).selectOption('continuous');await call(record,'noteReady',b.id);await activate(record,b.id);await call(record,'flushNote',b.id);await call(record,'captureEditor',b.id);await selectTab(record,a.id);await activate(record,a.id);record.paintProof=await assertExclusivePaperTextPaint(record.page,a.id,bounded);return {a,b};}
async function tabsCase(record,runId){
 const info=await open(record,runId),{a,b}=await warmTwo(record,info),before=await all(record),originalB=graph(before,info.source,b.id);
 const strip=record.page.getByRole('tablist',{name:'Pages ouvertes',exact:true});assert.equal(await strip.getByRole('tab').count(),3);assert.equal(await strip.locator('[role=tab]').first().getAttribute('id'),'workspace-tab-page','The Dowze section remains the first tab');assert.equal((await strip.locator('[role=tab]').first().innerText()).trim(),'Notes');
 phase(record,'tabs/edit-first');const editedA=await input(record,a.id,' FIRST-TAB-ONLY');hasOnly(editedA,'FIRST-TAB-ONLY',['SECOND-TAB-ONLY']);let after=await all(record);assertExactBody(graph(after,info.source,b.id),originalB,'Editing A cannot issue any canonical command in B');assertExactBody(metadata(after,info.source,b.id),metadata(before,info.source,b.id),'Editing A cannot alter B metadata');assertFiles(after,before,info.source);
 phase(record,'tabs/rename-real-input');const renamed='Titre A conservé · épreuve';await panel(record,a.id).getByRole('textbox',{name:'Titre de la note',exact:true}).fill(renamed);await panel(record,a.id).getByRole('textbox',{name:'Titre de la note',exact:true}).press('Tab');await call(record,'flushNote',a.id);assert.equal(await tab(record,a.id).getAttribute('title'),renamed);
 await panel(record,a.id).getByRole('button',{name:'Augmenter le zoom',exact:true}).click();await call(record,'viewReady',a.id);const scroller=panel(record,a.id).locator('.paper-page-viewport'),scrollerBox=await scroller.boundingBox();assert.ok(scrollerBox);const wheel=await call(record,'beginWheelObservation',a.id);await record.page.mouse.move(scrollerBox.x+scrollerBox.width/2,scrollerBox.y+scrollerBox.height/2);await record.page.mouse.wheel(0,240);record.wheelEvidence=await call(record,'finishWheelObservation',wheel);assert.ok(record.wheelEvidence.wheel.some(event=>event.trusted&&event.deltaY===240),'The real wheel must be acknowledged by this actual note scroller');const viewA=await call(record,'viewReady',a.id);assert.ok(viewA.scroll.top>0,'A long note must admit a real nonzero native scroll before switching tabs');const aCheckpoint=await all(record);phase(record,'tabs/edit-second');await selectTab(record,b.id);await activate(record,b.id);const editedB=await input(record,b.id,' SECOND-TAB-ONLY');hasOnly(editedB,'SECOND-TAB-ONLY',['FIRST-TAB-ONLY']);after=await all(record);assertExactBody(graph(after,info.source,a.id),graph(aCheckpoint,info.source,a.id),'Editing B cannot issue a canonical command in A');assertExactBody(metadata(after,info.source,a.id),metadata(aCheckpoint,info.source,a.id),'Editing B cannot change A title or metadata');
 phase(record,'tabs/first-section-course');await record.page.getByRole('button',{name:'Cours',exact:true}).click();assert.equal(await strip.locator('[role=tab]').first().getAttribute('id'),'workspace-tab-page');assert.equal((await strip.locator('[role=tab]').first().innerText()).trim(),'Cours');assert.equal(await strip.locator('[role=tab]').first().getAttribute('aria-selected'),'true');assert.equal(await strip.getByRole('tab').count(),3,'A Dowze section must not replace open note tabs');
 await notes(record);assert.equal((await strip.locator('[role=tab]').first().innerText()).trim(),'Notes');await selectTab(record,a.id);const returnedView=await call(record,'viewReady',a.id);assert.equal(returnedView.mode,viewA.mode,'Each note keeps its own page display mode');assert.equal(returnedView.zoom,viewA.zoom,'Each note keeps its own manual zoom');assert.equal(returnedView.selectedPageId,viewA.selectedPageId,'Each note keeps its own selected page');assert.ok(Math.abs(returnedView.scroll.top-viewA.scroll.top)<=2,'Tab/rubric/library return must keep the native scroll anchor, within two CSS pixels');await revealTextWithWheel(record,a.id);await activate(record,a.id);const returned=await call(record,'flushNote',a.id);hasOnly(returned,'FIRST-TAB-ONLY',['SECOND-TAB-ONLY']);assert.equal(await panel(record,a.id).getByRole('textbox',{name:'Titre de la note',exact:true}).inputValue(),renamed);
 phase(record,'tabs/close-second-real-button');await selectTab(record,b.id);const closing=await activate(record,b.id);await call(record,'flushNote',b.id);await record.page.getByRole('button',{name:'Fermer la note « '+b.title+' »',exact:true}).click();await tab(record,b.id).waitFor({state:'detached',timeout:10000});await record.page.waitForFunction(id=>window.__desktopTabsSplit.state().editors.find(record=>record.id===id)?.destroyed===true,closing.id,{timeout:10000});assert.equal((await call(record,'editorProof',closing.id)).destroyCalls,1,'The closed settled real editor destroys exactly once');
 await notes(record);await openNote(record,b.id);const reopened=await activate(record,b.id);assert.notEqual(reopened.id,closing.id,'Reopening a closed tab creates a fresh editor, retaining saved source');const restored=await call(record,'flushNote',b.id);hasOnly(restored,'SECOND-TAB-ONLY',['FIRST-TAB-ONLY']);after=await all(record);assertForeign(after,before,info.source);assertFiles(after,before,info.source);assert.equal(graph(after,info.source,a.id).content.noteId,a.id);assert.ok((await call(record,'state')).inputs.some(event=>event.trusted&&event.type==='input'&&event.noteId===a.id));assert.ok((await call(record,'state')).inputs.some(event=>event.trusted&&event.type==='input'&&event.noteId===b.id));
 return {actualAppTabs:true,actualTrustedTextInput:true,twoIndependentNotes:true,sectionTabFirst:true,titleRetained:true,libraryAndCourseReturn:true,perNoteModeZoomPageAndScrollRetained:true,perNoteSavedSourceRetainedAcrossTabs:true,closedEditorDestroyedOnce:true,reopenedSavedNote:true,PDFImageBytesExact:true,foreignScopesExact:true,nativeOfflineClaim:false,nativeTextReveal:record.revealTextEvidence??[]};
}
function geometry(layout,axis){assert.equal(layout.split,true);assert.equal(layout.axis,axis);assert.equal(layout.panes.length,2);const first=layout.panes.find(pane=>pane.slot==='primary'),second=layout.panes.find(pane=>pane.slot==='secondary');assert.ok(first&&second&&first.width>80&&second.width>80&&first.height>80&&second.height>80,'Both actual note panes must have usable nonzero bounds');if(axis==='horizontal'){assert.ok(first.right<=second.x+1,'Native horizontal panes cannot overlap');assert.ok(Math.abs(first.y-second.y)<2);}else{assert.ok(first.bottom<=second.y+1,'Native vertical panes cannot overlap');assert.ok(Math.abs(first.x-second.x)<2);}assert.ok(layout.ratio>=25&&layout.ratio<=75);return {first,second};}
async function splitCase(record,runId){
 const info=await open(record,runId),{a,b}=await warmTwo(record,info);await record.page.getByRole('combobox',{name:'Note à afficher en regard',exact:true}).selectOption(b.id);await record.page.getByRole('combobox',{name:'Disposition des deux notes',exact:true}).selectOption('horizontal');await call(record,'noteReady',a.id);await call(record,'noteReady',b.id);const before=await all(record),initial=await call(record,'layout');geometry(initial,'horizontal');assert.equal(await record.page.getByRole('tablist',{name:'Pages ouvertes',exact:true}).getAttribute('aria-multiselectable'),'true');
 const oldCommand=await call(record,'captureSplitCommand'),separator=record.page.getByRole('separator',{name:'Redimensionner les deux notes',exact:true}),box=await separator.boundingBox();assert.ok(box);const target=initial.parent.x+initial.parent.width*.63;await record.page.mouse.move(box.x+box.width/2,box.y+box.height/2);await record.page.mouse.down();await record.page.mouse.move(target,box.y+box.height/2,{steps:6});await record.page.mouse.up();let layout=await call(record,'layout');geometry(layout,'horizontal');assert.ok(Math.abs(layout.ratio-63)<3,'Real pointer resize must reach the requested bounded split ratio');assert.ok(Math.abs(layout.ratio-initial.ratio)>5);
 await separator.press('Home');layout=await call(record,'layout');geometry(layout,'horizontal');assert.equal(layout.ratio,25,'Accessible separator Home sets the lower bound');await separator.press('End');assert.equal((await call(record,'layout')).ratio,75);await separator.press('ArrowLeft');assert.equal((await call(record,'layout')).ratio,70);for(let step=0;step<4;step++)await separator.press('ArrowLeft');assert.equal((await call(record,'layout')).ratio,50);await record.page.getByRole('combobox',{name:'Disposition des deux notes',exact:true}).selectOption('vertical');await record.page.waitForFunction(()=>window.__desktopTabsSplit.layout().axis==='vertical',null,{timeout:5000});geometry(await call(record,'layout'),'vertical');
 phase(record,'split/edit-primary');const changedA=await input(record,a.id,' SPLIT-A-ONLY');hasOnly(changedA,'SPLIT-A-ONLY',['SPLIT-B-ONLY']);let after=await all(record);assertExactBody(graph(after,info.source,b.id),graph(before,info.source,b.id),'An actual split A input cannot write the other graph');assertExactBody(metadata(after,info.source,b.id),metadata(before,info.source,b.id),'An actual split A input cannot write the other metadata');const checkpoint=after,splitA=await call(record,'captureEditor',a.id);
 phase(record,'split/edit-secondary');const changedB=await input(record,b.id,' SPLIT-B-ONLY');hasOnly(changedB,'SPLIT-B-ONLY',['SPLIT-A-ONLY']);after=await all(record);assertExactBody(graph(after,info.source,a.id),graph(checkpoint,info.source,a.id),'A split secondary input cannot write the primary graph');assertExactBody(metadata(after,info.source,a.id),metadata(checkpoint,info.source,a.id),'A split secondary input cannot write the primary metadata');assertFiles(after,before,info.source);const splitB=await call(record,'captureEditor',b.id);

 phase(record,'split/swap-retains-actual-editors');await record.page.getByRole('button',{name:'Intervertir les deux notes',exact:true}).click();await call(record,'noteReady',a.id);await call(record,'noteReady',b.id);assert.equal((await call(record,'captureEditor',a.id)).id,splitA.id);assert.equal((await call(record,'captureEditor',b.id)).id,splitB.id);let swapped=await call(record,'layout');assert.equal(swapped.panes.find(pane=>pane.slot==='primary').id,'workspace-panel-'+b.id);await record.page.getByRole('button',{name:'Intervertir les deux notes',exact:true}).click();await call(record,'noteReady',a.id);const beforeOld=await call(record,'layout'),beforeOldStores=await all(record);await call(record,'invokeOldSplit',oldCommand.id);assertExactBody(await call(record,'layout'),beforeOld,'A retained original resize callback cannot readmit after primary-note A-B-A');assertExactBody(await all(record),beforeOldStores,'An old split resize callback cannot mutate any native source');
 phase(record,'split/media-scroll');for(const note of [a,b]){const view=panel(record,note.id).locator('.paper-page-viewport');assert.ok(await view.count(),'Real scroll viewport required');await panel(record,note.id).getByRole('button',{name:'Afficher les pages',exact:true}).click();await panel(record,note.id).locator('[data-page-entry='+JSON.stringify(note.id+'-pdf-page')+'] .paper-thumbnail').click();await view.locator('canvas[aria-label="PDF, page 1"][style*="visible"]').waitFor({state:'visible',timeout:12000});await panel(record,note.id).locator('[data-page-entry='+JSON.stringify(note.id+'-image-page')+'] .paper-thumbnail').click();await record.page.waitForFunction(id=>{const view=document.getElementById('workspace-panel-'+id)?.querySelector('.paper-page-viewport');return !!Array.from(view?.querySelectorAll('img')??[]).find(image=>image.complete&&image.naturalWidth>0);},note.id,{timeout:12000});const scroll=await call(record,'noteState',note.id);assert.ok(scroll.scroll.top>0&&scroll.scroll.scrollHeight>scroll.scroll.height,'The long media note has a genuine nonzero native scroll range');await panel(record,note.id).getByRole('button',{name:'Afficher les pages',exact:true}).click();}

 await record.page.getByRole('button',{name:'Fermer la deuxième vue',exact:true}).click();assert.equal((await call(record,'layout')).split,false);assert.equal(await tab(record,b.id).count(),1,'Closing only the second view retains its independent open note tab');await selectTab(record,b.id);await revealTextWithWheel(record,b.id);await activate(record,b.id);const finalB=await call(record,'flushNote',b.id);hasOnly(finalB,'SPLIT-B-ONLY',['SPLIT-A-ONLY']);after=await all(record);assertForeign(after,before,info.source);assertFiles(after,before,info.source);
 return {actualTwoAppNotes:true,nativePaneGeometry:true,trustedPointerAndKeyboardResize:true,horizontalAndVertical:true,actualTrustedIndependentInput:true,longDocs:true,nativePDFWorkerAndPNGDecoded:true,actualEditorIdentityRetained:true,primaryABAOldResizeZeroAdmission:true,closeViewDoesNotCloseTab:true,allMediaAndForeignScopesExact:true,physicalTouchPenIME:false,nativeTextReveal:record.revealTextEvidence??[]};
}

async function desktopFailureState(record){const common=await failureState(record);if(!record?.page||record.page.isClosed()||!record.browser?.isConnected())return common;let state,geometry,flush,screenshot;try{flush=await bounded(record.page.evaluate(()=>window.__desktopTabsSplit?.flushDiagnostics()),'Bounded captured flush phase/hash diagnostics',1500,true);}catch(error){flush={error:privateBrief(error,[record])};}try{state=await bounded(record.page.evaluate(()=>window.__desktopTabsSplit?.state()),'Bounded Desktop source/IPC diagnostics',700,true);}catch(error){state={error:privateBrief(error,[record])};}try{geometry=await bounded(record.page.evaluate(()=>window.__desktopTabsSplit?.geometryDiagnostics()),'Bounded actual note geometry/clip diagnostics',1800,true);}catch(error){geometry={error:privateBrief(error,[record])};}try{await bounded(mkdir(dirname(artifact),{recursive:true}),'Create private screenshot audit directory',1000,true);const filename='n015-n016-failure-'+cases.find(name=>record.role.endsWith(name))+'.png',bytes=await bounded(record.page.screenshot({path:join(dirname(artifact),filename),fullPage:false,timeout:4000}),'Private failure screenshot',4500,true);screenshot={status:'CAPTURED',file:filename,bytes:bytes.length,sha256:digest(bytes),privateSyntheticFixtureOnly:true};}catch(error){screenshot={status:'UNAVAILABLE',error:privateBrief(error,[record])};}return {...common,fixturePhase:record.fixturePhase??null,lastFixtureMethod:record.lastFixtureMethod??null,lastHitTarget:record.lastHitTarget??null,paintProof:record.paintProof??null,revealTextEvidence:record.revealTextEvidence??[],wheelEvidence:record.wheelEvidence??null,phases:record.phases,failedAssets:record.failedAssets,state:privateValue(state,[record]),geometry:privateValue(geometry,[record]),flush:privateValue(flush,[record]),screenshot};}
async function cleanupGroup(){const errors=[];for(const record of [...owned])try{await killOwned(record);}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Private library browser cleanup failed');}
async function runBrowser(){
 await verifyBundle();try{playwright=await import('playwright');}catch(error){report.availability={status:'NOTRUN',reason:'Existing Playwright unavailable',error:brief(error)};return;}
 const executable=process.env.DOWZE_CRASH_CHROMIUM_PATH||playwright.chromium.executablePath();assert.ok(isAbsolute(executable));try{await access(executable,constants.X_OK);}catch{report.availability={status:'NOTRUN',reason:'Existing Chromium executable unavailable; no download'};return;}
 report.availability={status:'AVAILABLE',executable:executable.split(sep).at(-1),executed:false};workDir=await mkdtemp(join(tmpdir(),'dwts-'));await writeFile(join(workDir,'.owned-synthetic-browser-profiles'),'private synthetic library profiles only\n');await startServer();
 for(const name of cases){
  if(diagnosticCase&&name!==diagnosticCase){report.groups.push({name,status:'NOTRUN',reason:'Diagnostic exact library case'});continue;}
  if(Date.now()>=deadline)throw Error('Library tree global deadline exhausted before next group');const profile=await mkdtemp(join(workDir,'profile-'));profiles.add(profile);let first=null,current=null,result;report.groupsStarted++;const timeoutAt=timeouts.length;
  try{
   first=await launch(profile,executable,'library-'+name);current=first;report.availability.executed=true;const version=first.browser.version(),runId=randomUUID();let evidence;
   if(name==='tabs-library-close-reopen')evidence=await tabsCase(first,runId);else evidence=await splitCase(first,runId);
   const fixtureCleanup=await call(current,'cleanup');assert.equal(fixtureCleanup.appNodes,0);assert.equal(fixtureCleanup.pendingNativeIPC,0);assert.equal(fixtureCleanup.nativeListeners,0);assert.equal(fixtureCleanup.nativeCallbacks,0);assert.equal(fixtureCleanup.pendingWriters,false);assert.equal(fixtureCleanup.liveEditors,0);assert.equal(fixtureCleanup.operations,0);assert.equal(fixtureCleanup.wheelObservers,0);assert.deepEqual(fixtureCleanup.native,{opens:0,connections:0,transactions:0});assert.deepEqual(current.pageErrors,[]);assert.equal(current.networkRefused,0);result={name,status:'PASS',browserVersion:version,evidence,fixtureCleanup};report.passed++;
  }catch(error){result={name,status:'FAIL',error:privateBrief(error,[first,current]),diagnostics:await desktopFailureState(current??first)};report.failed++;console.error(name+': FAIL '+result.error.message);}
  finally{
   if(result)report.groups.push(result);try{await cleanupGroup();await drainOriginals('Original browser actions before profile removal');assert.equal(timeouts.length,timeoutAt,'A timed-out accepted operation cannot become PASS after late settlement');await rm(profile,{recursive:true,force:true});profiles.delete(profile);if(result)result.cleanup={status:'PASS'};}catch(error){if(result){result.cleanup={status:'FAIL',error:brief(error)};if(result.status==='PASS'){result.bodyStatus='PASS';result.status='FAIL';report.passed--;report.failed++;}}throw error;}
  }
  console.log(name+': '+result.status);
 }
}
try{await verifyLifecycleBaseline();await requireCentralGuard();await verifyDesktopViewport();if(buildPhase)await buildBundle();else await runBrowser();}
catch(error){report.fatal=brief(error);console.error('Library tree browser recipe failed: '+report.fatal.message);process.exitCode=1;}
finally{
 const errors=[];try{await cleanupGroup();}catch(error){errors.push(error);}if(server)try{server.closeAllConnections();await bounded(new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve())),'Library private HTTP cleanup',3000,true);await bounded((async()=>{while(requestHandlers.size)await Promise.allSettled([...requestHandlers]);})(),'Drain actual HTTP request handlers',3000,true);await bounded((async()=>{while(httpSockets.size)await sleep(10);})(),'Observe native HTTP sockets closed',1000,true);assert.equal(requestHandlers.size,0);assert.equal(httpSockets.size,0);assert.deepEqual(httpErrors,[]);}catch(error){errors.push(error);}
 try{await drainOriginals('Original browser work before final cleanup');}catch(error){errors.push(error);}
 if(owned.size===0&&pendingOperations.size===0){for(const profile of profiles)try{await rm(profile,{recursive:true,force:true});profiles.delete(profile);}catch(error){errors.push(error);}if(workDir)try{await rm(workDir,{recursive:true,force:true});}catch(error){errors.push(error);}}
 report.cleanupFinal=errors.length?{status:'FAIL',error:brief(new AggregateError(errors,'Final library tree cleanup failed'))}:{status:'PASS',remainingOwnedBrowsers:owned.size,remainingProfiles:profiles.size,httpListening:server?.listening??false,pendingHTTPHandlers:requestHandlers.size,openHTTPSockets:httpSockets.size};if(errors.length)process.exitCode=1;
 if(owned.size||pendingOperations.size||requestHandlers.size||httpSockets.size){console.error(JSON.stringify({status:'FATAL_STOP',finalReportWritten:false,owned:owned.size,pending:[...pendingOperations.values()].slice(0,12),handlers:requestHandlers.size,sockets:httpSockets.size,timeouts}));throw Error('Original browser/HTTP work remains; no final report or freeze claim.');}
 try{await verifyBundle();report.finalFreeze={status:'PASS',...report.manifest};}catch(error){report.finalFreeze={status:'FAIL',error:brief(error)};process.exitCode=1;}
 if(runPhase){const attempted=new Set(report.groups.map(group=>group.name));for(const name of cases)if(!attempted.has(name))report.groups.push({name,status:'NOTRUN',reason:report.availability?.reason??'Earlier fatal or cleanup failure'});report.allGroupsAttempted=report.groupsStarted===cases.length;report.fullSuite=!diagnosticCase&&report.groupsStarted===cases.length&&report.passed===cases.length&&!report.failed&&!report.fatal&&report.cleanupFinal.status==='PASS'&&report.finalFreeze.status==='PASS';report.diagnosticPassed=!!diagnosticCase&&report.groupsStarted===1&&report.passed===1&&!report.failed&&!report.fatal&&report.cleanupFinal.status==='PASS'&&report.finalFreeze.status==='PASS';if(!report.fullSuite&&!report.diagnosticPassed)process.exitCode||=report.availability?.status==='NOTRUN'?2:1;}
 report.timeouts=timeouts;report.pendingOperations=pendingOperations.size;if(timeouts.length){report.fullSuite=false;report.diagnosticPassed=false;process.exitCode=1;}report.finishedAt=new Date().toISOString();await mkdir(dirname(artifact),{recursive:true});await writeFile(artifact,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({phase:report.phase,passed:report.passed,failed:report.failed,notRun:report.groups.filter(group=>group.status==='NOTRUN').length,fullSuite:report.fullSuite,diagnosticPassed:report.diagnosticPassed??false,cleanup:report.cleanupFinal.status,finalFreeze:report.finalFreeze.status,fatal:report.fatal?.message??null,report:artifact}));
}

