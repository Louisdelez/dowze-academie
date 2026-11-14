/* Separate guarded phases, never compile while the browser recipe is active:
 * bash scripts/run-dell-safe-check.sh -- node tests/run-paper-ink-prefix-crash.mjs --build --bundle-dir /tmp/dowze-prefix-crash-BUILD-ID
 * bash scripts/run-dell-safe-check.sh -- node tests/run-paper-ink-prefix-crash.mjs --run --bundle-dir /tmp/dowze-prefix-crash-BUILD-ID
 * The build directory must be NEW. --run verifies its manifest and requires an
 * already-installed Chromium; it never installs/downloads browsers or deps.
 * Evidence: actual browser/IndexedDB process SIGKILL, not physical power loss,
 * Safari/iOS/Tauri/Pencil, nor mounted UI input/permission parity. */
import {mountedAuditPath} from './mounted-cleanup.mjs';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir,readdir,stat,access,mkdtemp,rm} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,resolve,relative,isAbsolute,dirname,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
const root=process.cwd(),cases=['before-first-ack','ack-before-suffix','prepared-before-publish','canonical-before-marker','discard-before-kill'];
const args=process.argv.slice(2),buildPhase=args.includes('--build'),runPhase=args.includes('--run'),dirAt=args.indexOf('--bundle-dir'),bundleDir=dirAt>=0?args[dirAt+1]:undefined;
if(buildPhase===runPhase||!bundleDir||!isAbsolute(bundleDir)||args.some((arg,i)=>!['--build','--run','--bundle-dir'].includes(arg)&&i!==dirAt+1))throw Error('Use exactly --build or --run and --bundle-dir /absolute/new/private/directory. No combined build/runtime.');
const artifact=mountedAuditPath(`t-x02-paper-ink-prefix-browser-${buildPhase?'build':'kill'}-20261015.json`),web=join(bundleDir,'web'),manifestPath=join(bundleDir,'manifest.json');
const report={schema:1,kind:'paper-ink-prefix-browser-process-crash',phase:buildPhase?'build':'runtime',startedAt:new Date().toISOString(),proofScope:'Actual Chromium process SIGKILL and production IndexedDB; no power-loss/native/Pencil/UI claim',availability:null,manifest:null,passed:0,failed:0,groups:[],cleanupFinal:{status:'NOTRUN'},fatal:null};
const brief=error=>({name:String(error?.name??'Error'),message:String(error?.message??error).slice(0,900),causes:Array.from(error?.errors??[]).slice(0,5).map(cause=>({message:String(cause?.message??cause).slice(0,400),causes:Array.from(cause?.errors??[]).slice(0,3).map(value=>String(value?.message??value).slice(0,250))}))});
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const deadline=Date.now()+235000;
const cleanupDeadline=Date.now()+285000;
const bounded=async(promise,label,ms=20000,cleanup=false)=>{let timer;try{const time=Math.min(ms,(cleanup?cleanupDeadline:deadline)-Date.now());if(time<=0)throw Error(`${label}: runtime deadline exhausted`);return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(`${label}: timeout`)),time);})]);}finally{clearTimeout(timer);}};
let qaCgroup;
async function requireCentralGuard(){
 if(process.platform!=='linux')throw Error('Real process-group SIGKILL recipe currently requires a Linux QA executor. No unguarded fallback.');
 qaCgroup=await readFile('/proc/self/cgroup','utf8');const entry=qaCgroup.split('\n').find(line=>line.startsWith('0::'))?.slice(3);
 if(!entry||!entry.split('/').at(-1)?.startsWith('dowze-dell-check-'))throw Error('Browser recipe requires the central dowze-dell-check cgroup guard on every executor.');
 const path=join('/sys/fs/cgroup',entry),memory=(await readFile(join(path,'memory.max'),'utf8')).trim(),swap=(await readFile(join(path,'memory.swap.max'),'utf8')).trim(),cpu=(await readFile(join(path,'cpu.max'),'utf8')).trim().split(/\s+/).map(Number);
 if(!/^\d+$/.test(memory)||Number(memory)>900*1024**2||!/^\d+$/.test(swap)||Number(swap)>64*1024**2||!Number.isFinite(cpu[0])||!(cpu[1]>0)||cpu[0]/cpu[1]>.25)throw Error('Browser recipe refused: real RAM/swap/CPU ceilings exceed the central guard.');
}
async function files(path){const entries=await readdir(path,{withFileTypes:true});let result=[];for(const entry of entries){const full=join(path,entry.name);if(entry.isDirectory())result.push(...await files(full));else if(entry.isFile())result.push(full);else throw Error('Bundle directories cannot contain symlinks or special files.');}return result;}
async function buildBundle(){
 await mkdir(bundleDir);await writeFile(join(bundleDir,'.owned-prefix-crash-build'),'synthetic fixture build only\n');
 const {build}=await import('vite');
 const built=await build({configFile:false,publicDir:false,build:{lib:{entry:join(root,'tests/paper-ink-prefix-crash-entry.ts'),formats:['es'],fileName:()=> 'entry.mjs'},outDir:web,emptyOutDir:false,copyPublicDir:false,target:'es2022',minify:false,sourcemap:false,reportCompressedSize:false,rollupOptions:{output:{entryFileNames:'entry.mjs',chunkFileNames:'chunks/[name]-[hash].mjs'}}},logLevel:'error'});
 const sources=new Set(['tests/run-paper-ink-prefix-crash.mjs','tests/paper-ink-prefix-crash-entry.ts','src/lib/paperInkPrefixJournal.ts','pwa/src/storage.ts','package.json']);
 for(const result of Array.isArray(built)?built:[built])for(const chunk of result.output??[])if(chunk.type==='chunk')for(const id of Object.keys(chunk.modules)){
  const clean=id.split('?')[0];if(isAbsolute(clean)&&clean.startsWith(root+sep)&&!clean.includes(sep+'node_modules'+sep))sources.add(relative(root,clean));
 }
 const inputs={},outputs={};for(const path of [...sources].sort())inputs[path]=digest(await readFile(join(root,path)));
 for(const path of await files(web))outputs[relative(web,path)]=digest(await readFile(path));
 assert.ok(outputs['entry.mjs'],'Actual browser entry bundle must be produced');
 const manifest={schema:1,kind:'paper-ink-prefix-browser-build',builtAt:new Date().toISOString(),inputs,outputs};await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
 report.manifest={sha256:digest(await readFile(manifestPath)),inputFiles:Object.keys(inputs).length,bundleFiles:Object.keys(outputs).length};report.groups=[{name:'Separate actual browser fixture build',status:'PASS'}];report.passed=1;report.cleanupFinal={status:'PASS',browserProcesses:0};
}
async function verifyBundle(){
 const manifest=JSON.parse(await readFile(manifestPath,'utf8'));assert.equal(manifest.schema,1);assert.equal(manifest.kind,'paper-ink-prefix-browser-build');
 for(const [path,expected] of Object.entries(manifest.inputs)){assert.ok(!isAbsolute(path)&&!path.split(/[\\/]/).includes('..'),'Source manifest must stay in this checkout');assert.equal(digest(await readFile(join(root,path))),expected,'Fixture or product source changed after the separate build: '+path);}
 for(const [path,expected] of Object.entries(manifest.outputs)){assert.ok(!isAbsolute(path)&&!path.split(/[\\/]/).includes('..'),'Bundle manifest must stay in its private directory');assert.equal(digest(await readFile(join(web,path))),expected,'Browser bundle changed after build: '+path);}
 assert.ok(manifest.outputs['entry.mjs']);report.manifest={sha256:digest(await readFile(manifestPath)),inputFiles:Object.keys(manifest.inputs).length,bundleFiles:Object.keys(manifest.outputs).length};
}
async function procInfo(pid){
 try{const body=await readFile(`/proc/${pid}/stat`,'utf8'),at=body.lastIndexOf(')'),tail=body.slice(at+2).trim().split(/\s+/);return {pid,name:body.slice(body.indexOf('(')+1,at),state:tail[0],parent:Number(tail[1]),group:Number(tail[2]),start:tail[19]};}catch(error){if(error.code==='ENOENT'||error.code==='ESRCH')return null;throw error;}
}
const owned=new Set(),profiles=new Set();let server,workDir,playwright,origin;
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
async function launch(profile,executable){
 await rm(join(profile,'DevToolsActivePort'),{force:true});
 const config=join(profile,'xdg-config'),cache=join(profile,'xdg-cache'),temp=join(profile,'tmp');for(const path of [config,cache,temp])await mkdir(path,{recursive:true});const baseline=await cgroupPids();
 const child=spawn(executable,['--headless=new',`--user-data-dir=${profile}`,'--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-sync','--disable-extensions','about:blank'],{detached:true,stdio:['ignore','ignore','pipe'],env:{...process.env,XDG_CONFIG_HOME:config,XDG_CACHE_HOME:cache,TMPDIR:temp}});
 const record={child,pid:child.pid,start:null,baseline,members:new Map(),stderr:'',browser:null,page:null,exit:null,killed:false,pageErrors:[],networkRefused:0};
 record.exited=new Promise(resolve=>{child.once('exit',(code,signal)=>{record.exit={code,signal};resolve(record.exit);});child.once('error',error=>{record.exit={code:null,signal:null,error:brief(error)};resolve(record.exit);});});
 child.stderr.on('data',value=>{record.stderr=(record.stderr+value.toString()).slice(-1500);});
 if(!Number.isSafeInteger(record.pid))throw Error('Owned Chromium child could not be created');
 owned.add(record);const started=await procInfo(record.pid);if(!started)throw Error('Owned Chromium exited before its process identity was captured');record.start=started.start;record.members.set(record.pid,started);assert.equal(started.group,record.pid,'Browser must use its own detached process group');
 let port;
 await bounded((async()=>{for(;;){if(record.exit)throw Error('Owned Chromium exited during startup: '+JSON.stringify(record.exit)+' '+record.stderr.replace(/ws:\/\/\S+/g,'<devtools-endpoint>').replaceAll(profile,'<private-profile>'));try{const lines=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');if(/^\d+$/.test(lines[0])&&lines[1]?.startsWith('/devtools/browser/')){port=Number(lines[0]);break;}}catch(error){if(error.code!=='ENOENT')throw error;}await sleep(30);}})(),'Owned Chromium startup');
 record.browser=await bounded(playwright.chromium.connectOverCDP(`http://127.0.0.1:${port}`,{timeout:15000}),'Connect owned Chromium CDP');
 const context=record.browser.contexts()[0];assert.ok(context,'Owned persistent default browser context must exist');const pages=context.pages();record.page=pages[0]??await context.newPage();for(const page of pages.slice(1))await page.close();
 record.page.on('pageerror',error=>{record.pageErrors.push(String(error.message).slice(0,500));});
 await record.page.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===origin)return route.continue();record.networkRefused++;return route.abort('blockedbyclient');});
 await bounded(record.page.goto(origin,{waitUntil:'load',timeout:15000}),'Open private fixture origin');
 await bounded(record.page.waitForFunction(()=>!!window.__paperInkPrefixCrash,null,{timeout:15000}),'Load actual browser fixture API');
 assert.deepEqual(record.pageErrors,[],'Actual browser module initialization must not fail');assert.equal(record.networkRefused,0,'The fixture must use only its private localhost origin');
 return record;
}
async function waitPhase(record,expected){
 return bounded((async()=>{for(;;){assert.deepEqual(record.pageErrors,[]);const value=await record.page.evaluate(()=>window.__paperInkPrefixCrash.status());if(value.error)throw Error('Actual browser producer failed: '+value.error);if(value.phase===expected)return value;await sleep(25);}})(),`Await ${expected}`);
}
async function startServer(){
 server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://127.0.0.1'),pathname=decodeURIComponent(url.pathname);
  if(pathname==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end('<!doctype html><html><head><meta charset="utf-8"></head><body><script type="module" src="/entry.mjs"></script></body></html>');return;}
  const file=resolve(web,'.'+pathname);if(!file.startsWith(resolve(web)+sep)||(await stat(file)).isDirectory())throw Error('Outside private bundle');
  const content=await readFile(file);res.writeHead(200,{'content-type':/\.m?js$/.test(file)?'text/javascript; charset=utf-8':file.endsWith('.json')?'application/json':'application/octet-stream','cache-control':'no-store'});res.end(content);
 }catch{res.writeHead(404);res.end('Private fixture file not found');}});
 await bounded(new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);}),'Private fixture server',3000);origin=`http://127.0.0.1:${server.address().port}`;
}
async function cleanupGroup(){const failures=[];for(const record of [...owned])try{await killOwned(record);}catch(error){failures.push(error);}if(failures.length)throw new AggregateError(failures,'Owned browser cleanup failed');}
async function runBrowser(){
 await verifyBundle();
 try{playwright=await import('playwright');}catch(error){report.availability={status:'NOTRUN',reason:'Existing Playwright package unavailable',error:brief(error)};return;}
 const executable=process.env.DOWZE_CRASH_CHROMIUM_PATH||playwright.chromium.executablePath();assert.ok(isAbsolute(executable),'Existing Chromium path must be absolute');
 try{await access(executable,constants.X_OK);}catch{report.availability={status:'NOTRUN',reason:'Already-installed Chromium executable unavailable; no automatic download',executable:executable.split(sep).at(-1)};return;}
 report.availability={status:'AVAILABLE',executable:executable.split(sep).at(-1),executed:false};
 workDir=await mkdtemp(join(tmpdir(),'dowze-prefix-real-kill-'));await writeFile(join(workDir,'.owned-synthetic-browser-profiles'),'private synthetic test profiles only\n');await startServer();
 for(const name of cases){
  if(Date.now()>=deadline)throw Error('Global browser recipe deadline exhausted before next group');
  const runId=randomUUID(),profile=await mkdtemp(join(workDir,'profile-'));profiles.add(profile);let first,second;
  console.log(name+': START');
  try{
   first=await launch(profile,executable);report.availability.executed=true;const version=first.browser.version();
   await first.page.evaluate(({name,runId})=>{window.__paperInkPrefixCrash.start(name,runId);},{name,runId});
   const staged=await waitPhase(first,name==='before-first-ack'||name==='ack-before-suffix'?'uncommitted-written':'ready-kill');
   if(name==='before-first-ack'||name==='ack-before-suffix'){assert.equal(staged.holdActive,true);assert.equal(staged.holdCompleted,false);assert.equal(staged.observedUncommittedCursor,name==='before-first-ack'?3:4113);assert.equal(staged.acknowledgedCursor,name==='before-first-ack'?0:4096);}
   await killOwned(first,true);second=await launch(profile,executable);
   const recovered=await bounded(second.page.evaluate(({name,runId})=>window.__paperInkPrefixCrash.inspect(name,runId),{name,runId}),'Actual persistent browser recovery');
   assert.equal(recovered.storage,'actual-browser-indexeddb');assert.equal(recovered.scopeIsolated,true);assert.equal(recovered.automaticReplay,false);assert.equal(second.networkRefused,0);
   report.passed++;report.groups.push({name,status:'PASS',browserVersion:version,crashSignal:first.exit.signal,acknowledgedCursor:staged.acknowledgedCursor,...recovered});
  }catch(error){report.failed++;report.groups.push({name,status:'FAIL',error:brief(error)});console.error(name+': FAIL '+brief(error).message);}
  finally{
   const result=report.groups.find(group=>group.name===name);
   try{await cleanupGroup();await rm(profile,{recursive:true,force:true});profiles.delete(profile);if(result){result.cleanup={status:'PASS'};if(result.status==='PASS')console.log(name+': PASS');}}
   catch(error){if(result){result.cleanup={status:'FAIL',error:brief(error)};if(result.status==='PASS'){result.bodyStatus='PASS';result.status='FAIL';report.passed--;report.failed++;}}throw new AggregateError([error],name+': real browser group cleanup failed');}
  }
 }
}
try{
 await requireCentralGuard();if(buildPhase)await buildBundle();else await runBrowser();
}catch(error){report.fatal=brief(error);console.error('Prefix browser recipe failed: '+report.fatal.message);process.exitCode=1;}
finally{
 const errors=[];try{await cleanupGroup();}catch(error){errors.push(error);}
 if(server)try{server.closeAllConnections();await bounded(new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve())),'Private HTTP server cleanup',3000,true);}catch(error){errors.push(error);}
 if(owned.size===0){for(const profile of profiles)try{await rm(profile,{recursive:true,force:true});}catch(error){errors.push(error);}if(workDir)try{await rm(workDir,{recursive:true,force:true});}catch(error){errors.push(error);}}
 if(errors.length){report.cleanupFinal={status:'FAIL',error:brief(new AggregateError(errors,'Final real-browser cleanup failed'))};process.exitCode=1;}else report.cleanupFinal={status:'PASS',remainingOwnedBrowsers:owned.size};
 if(runPhase){const attempted=new Set(report.groups.map(group=>group.name));for(const name of cases)if(!attempted.has(name))report.groups.push({name,status:'NOTRUN',reason:report.availability?.reason??'Earlier fatal or cleanup failure'});if(report.availability?.status==='NOTRUN'&&!report.fatal)process.exitCode=2;if(report.failed||report.passed!==cases.length||report.fatal||report.cleanupFinal.status!=='PASS')process.exitCode||=1;}
 report.finishedAt=new Date().toISOString();await mkdir(dirname(artifact),{recursive:true});await writeFile(artifact,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({phase:report.phase,passed:report.passed,failed:report.failed,notRun:report.groups.filter(group=>group.status==='NOTRUN').length,cleanup:report.cleanupFinal.status,fatal:report.fatal?.message??null,report:artifact}));
}
