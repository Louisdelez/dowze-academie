/* Actual Notebook page-window, writing and bounded-media measurements in owned
 * Chromium; separate build/runtime, native IDB/DOM/Crepe/PDF workers.
 * Timing observations are descriptive, never invented hardware speed budgets. */
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
const root=process.cwd(),cases=['page-scale-1-100-2000','native-typing-2000-pages','bounded-dense-media'],diagnosticCase=process.env.DOWZE_NOTEBOOK_PERFORMANCE_ONLY?.trim()||null;
if(diagnosticCase&&!cases.includes(diagnosticCase))throw Error('DOWZE_NOTEBOOK_PERFORMANCE_ONLY must name one exact declared performance case.');
const args=process.argv.slice(2),buildPhase=args.includes('--build'),runPhase=args.includes('--run'),dirAt=args.indexOf('--bundle-dir'),bundleDir=dirAt>=0?args[dirAt+1]:undefined;
if(buildPhase===runPhase||!bundleDir||!isAbsolute(bundleDir)||args.some((arg,i)=>!['--build','--run','--bundle-dir'].includes(arg)&&i!==dirAt+1))throw Error('Use exactly --build or --run and --bundle-dir /absolute/new/private/directory.');
const cpuProfileOption=process.env.DOWZE_PERF_CPU_PROFILE,cpuProfileEnabled=runPhase&&cpuProfileOption==='1',cpuProfiles=new Set();
if(cpuProfileOption!==undefined&&!['0','1'].includes(cpuProfileOption))throw Error('DOWZE_PERF_CPU_PROFILE accepts only the exact values 0 or 1.');
if(cpuProfileEnabled&&runPhase&&diagnosticCase!==cases[1])throw Error('CPU profiling requires DOWZE_NOTEBOOK_PERFORMANCE_ONLY=native-typing-2000-pages.');
const artifact=mountedAuditPath(`t-x04-paper-notebook-performance-browser-${buildPhase?'build':'runtime'}-20261015.json`),web=join(bundleDir,'web'),manifestPath=join(bundleDir,'manifest.json');
const report={schema:1,kind:'paper-notebook-performance-real-chromium',phase:buildPhase?'build':'runtime',startedAt:new Date().toISOString(),proofScope:'Actual PaperNotebook/PaperPageViewport/Crepe/PM and scoped native storage over private bounded generated corpora. Real Chromium DOM, wheel, keyboard input, resize, local image/PDF/audio decode. One editable text source plus one vector per page isolates page-count cost. Descriptive timing/CDP/cgroup observations are not universal hardware budgets. No physical IME/Pencil, recording, cloud, App authentication, PWA install, SW or native completion.',diagnosticOnly:!!diagnosticCase,declaredGroups:buildPhase?1:cases.length,groupsStarted:0,fullSuite:false,availability:null,manifest:null,passed:0,failed:0,groups:[],cleanupFinal:{status:'NOTRUN'},fatal:null};
report.cpuProfiler={requested:cpuProfileOption==='1',enabled:cpuProfileEnabled,diagnosticOnly:cpuProfileEnabled,samplingIntervalMicroseconds:10000,maxTopFunctions:30,startupBudgetMs:15000,stopDetachBudgetMs:10000,disconnectBudgetMs:5000,rawProfileSaved:false,timingComparability:cpuProfileEnabled?'Instrumented CPU diagnostic; do not compare these durations directly with uninstrumented measurements.':'No CPU profiler enabled',scope:'Main renderer V8 samples only. Native IndexedDB/browser-process/worker CPU and I/O waiting are not fully attributed by this profiler.'};
const brief=error=>({name:String(error?.name??'Error'),message:String(error?.message??error).slice(0,900),causes:Array.from(error?.errors??[]).slice(0,4).map(value=>({message:String(value?.message??value).slice(0,350)}))});
const digest=bytes=>createHash('sha256').update(bytes).digest('hex'),bodySha=value=>digest(JSON.stringify(value)??'<undefined>');
const exact=(actual,expected,label)=>{if(!isDeepStrictEqual(actual,expected))assert.fail(label+'; exact actual SHA '+bodySha(actual)+' expected SHA '+bodySha(expected));};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),deadline=Date.now()+235000,cleanupDeadline=Date.now()+285000;
const pending=new Map(),timedOutOperations=[];let operationSerial=0;
function tracked(promise,label){const original=Promise.resolve(promise),id=++operationSerial;pending.set(id,{id,label,original});void original.then(()=>pending.delete(id),()=>pending.delete(id));return original;}
async function bounded(promise,label,ms=15000,cleanup=false){const original=tracked(promise,label);let timer;try{const time=Math.min(ms,(cleanup?cleanupDeadline:deadline)-Date.now());if(time<=0){timedOutOperations.push({label,phase:'deadline'});throw Error(label+': runtime deadline exhausted');}return await Promise.race([original,new Promise((_,reject)=>{timer=setTimeout(()=>{timedOutOperations.push({label,phase:'timeout'});reject(Error(label+': timeout'));},time);})]);}finally{clearTimeout(timer);}}
async function drain(label,ms=6000){const end=Math.min(cleanupDeadline,Date.now()+ms);while(pending.size){const originals=[...pending.values()].map(row=>row.original);let timer;try{await Promise.race([Promise.allSettled(originals),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+': accepted originals still active')),Math.max(1,end-Date.now()));})]);}finally{clearTimeout(timer);}if(Date.now()>=end&&pending.size)throw Error(label+': accepted originals still active');}}
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
 report.groupsStarted=1;await mkdir(bundleDir);await writeFile(join(bundleDir,'.owned-notebook-performance-build'),'private bounded Notebook performance fixture only\n');
 const reference=await readFile(join(root,'tests/run-paper-writing-browser.mjs'),'utf8'),self=await readFile(join(root,'tests/run-paper-notebook-performance-browser.mjs'),'utf8');
 const block=(value,start,end)=>{const from=value.indexOf('\n'+start),to=value.indexOf('\n'+end,from);assert.ok(from>=0&&to>from,'Exact anchored guard block missing');return value.slice(from,to);};
 for(const [start,end] of [['let qaCgroup;','async function files('],['async function procInfo(','const owned=new Set()'],['async function cgroupPids()','async function launch(']])assert.equal(block(self,start,end),block(reference,start,end),'The existing guard/PID ownership blocks must remain byte-identical');
 const {build}=await import('vite'),virtualWorker='\0private-notebook-performance-worker-url',workerInput='node_modules/pdfjs-dist/build/pdf.worker.min.mjs',seenSources=new Set();
 const built=await build({configFile:false,publicDir:false,define:{'process.env.NODE_ENV':JSON.stringify('production')},esbuild:{jsx:'automatic'},plugins:[{name:'private-notebook-performance-real-worker',enforce:'pre',resolveId(id){if(id==='pdfjs-dist/build/pdf.worker.min.mjs?url')return virtualWorker;},load(id){if(id===virtualWorker)return 'export default "/pdf.worker.mjs";';},transform(_code,id){const clean=id.split('?')[0];if(isAbsolute(clean)&&clean.startsWith(root+sep)&&!clean.includes(sep+'node_modules'+sep))seenSources.add(relative(root,clean));}}],build:{lib:{entry:join(root,'tests/paper-notebook-performance-browser-entry.tsx'),formats:['es'],fileName:()=> 'entry.mjs'},outDir:web,emptyOutDir:false,copyPublicDir:false,target:'es2022',minify:false,sourcemap:false,reportCompressedSize:false,rollupOptions:{output:{entryFileNames:'entry.mjs',chunkFileNames:'chunks/[name]-[hash].mjs'}}},logLevel:'error'});
 const pdfPath='tests/fixtures/paper-pdf-selection-columns.pdf',pdf=await readFile(join(root,pdfPath));await writeFile(join(web,'fixture.pdf'),pdf);await writeFile(join(web,'pdf.worker.mjs'),await readFile(join(root,workerInput)));
 const sources=new Set([...seenSources,'tests/run-paper-notebook-performance-browser.mjs','tests/paper-notebook-performance-browser-entry.tsx','tests/run-paper-writing-browser.mjs','tests/mounted-cleanup.mjs','tests/paper-writing-browser-entry.tsx','tests/paper-real-editor-probe.ts',pdfPath,'package.json','node_modules/pdfjs-dist/package.json','node_modules/playwright-core/package.json',workerInput]);
 for(const result of Array.isArray(built)?built:[built])for(const chunk of result.output??[])if(chunk.type==='chunk')for(const id of Object.keys(chunk.modules)){const clean=id.split('?')[0];if(isAbsolute(clean)&&clean.startsWith(root+sep)&&!clean.includes(sep+'node_modules'+sep))sources.add(relative(root,clean));}
 const inputs={},outputs={};for(const path of [...sources].sort())inputs[path]=digest(await readFile(join(root,path)));for(const path of await files(web))outputs[relative(web,path)]=digest(await readFile(path));
 for(const name of ['entry.mjs','fixture.pdf','pdf.worker.mjs'])assert.ok(outputs[name]);assert.ok(Object.keys(outputs).some(path=>path.endsWith('.css')),'Actual Notebook CSS must be built');
 const manifest={schema:1,kind:'paper-notebook-performance-browser-build',builtAt:new Date().toISOString(),inputs,outputs,fixture:{pdfSha256:digest(pdf),originalKnownPages:5},ownershipReference:{path:'tests/run-paper-writing-browser.mjs',sha256:inputs['tests/run-paper-writing-browser.mjs'],guardAndPidBlocksByteIdentical:true}};await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
 report.manifest={sha256:digest(await readFile(manifestPath)),inputFiles:Object.keys(inputs).length,bundleFiles:Object.keys(outputs).length,ownershipReference:manifest.ownershipReference};report.passed=1;report.groups=[{name:'Separate actual Notebook performance fixture build',status:'PASS'}];report.buildComplete=true;
}
async function verifyBundle(){
 const manifest=JSON.parse(await readFile(manifestPath,'utf8'));assert.equal(manifest.schema,1);assert.equal(manifest.kind,'paper-notebook-performance-browser-build');
 const outputPaths=(await files(web)).map(path=>relative(web,path)).sort();exact(outputPaths,Object.keys(manifest.outputs).sort(),'Complete output key set must remain exact');
 for(const [path,expected] of Object.entries(manifest.inputs)){assert.ok(!isAbsolute(path)&&!path.split(/[\\/]/).includes('..'));assert.equal(digest(await readFile(join(root,path))),expected,'Source changed after build: '+path);}
 for(const [path,expected] of Object.entries(manifest.outputs)){assert.ok(!isAbsolute(path)&&!path.split(/[\\/]/).includes('..'));assert.equal(digest(await readFile(join(web,path))),expected,'Bundle changed after build: '+path);}
 report.manifest={sha256:digest(await readFile(manifestPath)),inputFiles:Object.keys(manifest.inputs).length,bundleFiles:Object.keys(manifest.outputs).length,ownershipReference:manifest.ownershipReference};
}
async function procInfo(pid){
 try{const body=await readFile(`/proc/${pid}/stat`,'utf8'),at=body.lastIndexOf(')'),tail=body.slice(at+2).trim().split(/\s+/);return {pid,name:body.slice(body.indexOf('(')+1,at),state:tail[0],parent:Number(tail[1]),group:Number(tail[2]),start:tail[19]};}catch(error){if(error.code==='ENOENT'||error.code==='ESRCH')return null;throw error;}
}
const owned=new Set(),profiles=new Set();let server,workDir,playwright,origin;
function privateText(value,records=[]){let result=String(value??'');for(const path of [workDir,bundleDir,...records.map(row=>row?.profile)].filter(Boolean).sort((a,b)=>b.length-a.length))result=result.replaceAll(path,'<private-path>');return result.replace(/(?:wss?|https?):\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?[^\s"'<>]*/g,'<private-endpoint>');}
function privateValue(value,records=[]){return typeof value==='string'?privateText(value,records):Array.isArray(value)?value.map(item=>privateValue(item,records)):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,privateValue(item,records)])):value;}
const privateBrief=(error,records=[])=>privateValue(brief(error),records);
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
 await record.page.setViewportSize({width:1280,height:900});
 await bounded(record.page.goto(origin,{waitUntil:'load',timeout:15000}),'Open private fixture origin');
 await bounded(record.page.waitForFunction(()=>!!window.__paperNotebookPerformance,null,{timeout:15000}),'Load actual browser fixture API');
 assert.deepEqual(record.pageErrors,[],'Actual browser module initialization must not fail');assert.equal(record.networkRefused,0,'The fixture must use only its private localhost origin');
 return record;
}

const handlers=new Set(),sockets=new Set(),protocolErrors=[];let apiRequests=0;
async function startServer(){
 const css=(await files(web)).filter(path=>path.endsWith('.css')).map(path=>'/'+relative(web,path).split(sep).join('/'));
 const handle=async(req,res)=>{try{
  const url=new URL(req.url,'http://127.0.0.1'),path=decodeURIComponent(url.pathname);assert.equal(req.method,'GET','Private performance server accepts static GET only');assert.equal(url.search,'','Private static fixture does not accept query mutations');
  if(path.startsWith('/qa/')){apiRequests++;throw Error('Measured local reading/writing must not perform network/API mutation or substitute missing local originals');}
  if(path==='/favicon.ico'){res.writeHead(204);res.end();return;}
  if(path==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+css.map(path=>'<link rel="stylesheet" href="'+path+'">').join('')+'<style>html,body{margin:0;width:100%;height:100%;font:16px sans-serif}#private-source-controls{display:none}#actual-writing-notebook{width:100%;height:100vh}</style></head><body><script type="module" src="/entry.mjs"></script></body></html>');return;}
  const file=resolve(web,'.'+path);assert.ok(file.startsWith(resolve(web)+sep)&&!(await stat(file)).isDirectory(),'Outside private static performance bundle');const body=await readFile(file);res.writeHead(200,{'content-type':/\.m?js$/.test(file)?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.pdf')?'application/pdf':'application/octet-stream','cache-control':'no-store'});res.end(body);
 }catch(error){protocolErrors.push(brief(error));if(!res.headersSent)res.writeHead(404);res.end('Private performance fixture refused this request');}};
 server=createServer((req,res)=>{let work;work=handle(req,res).catch(error=>{protocolErrors.push(brief(error));}).finally(()=>handlers.delete(work));handlers.add(work);});
 server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
 await bounded(new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);}),'Private performance static HTTP listener',3000);origin='http://127.0.0.1:'+server.address().port;
}
async function closeServer(){
 if(server){const closing=new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));for(const socket of sockets)socket.destroy();await bounded(closing,'Private static HTTP close',3000,true);}
 await bounded(Promise.allSettled([...handlers]),'Accepted private HTTP handlers terminal',5000,true);
 assert.equal(handlers.size,0);assert.equal(sockets.size,0);assert.equal(server?.listening??false,false);
}
function step(record,label,detail={}){record.businessPhase=label;record.steps??=[];record.steps.push({label,elapsedMs:Date.now()-(record.measurementStarted??=Date.now()),...detail});if(record.steps.length>48)record.steps.shift();}
async function call(record,method,...args){record.phase=method;record.calls??=[];const row={method,startedElapsedMs:Date.now()-(record.measurementStarted??=Date.now()),state:'pending'};record.calls.push(row);if(record.calls.length>64)record.calls.shift();try{const result=await bounded(record.page.evaluate(({method,args})=>{const api=window.__paperNotebookPerformance;if(!api||typeof api[method]!=='function')throw Error('Actual Notebook performance fixture method absent: '+method);return api[method](...args);},{method,args}),'Actual Notebook performance '+method,method==='start'?35000:20000);row.state='resolved';return result;}catch(error){row.state='rejected';row.error=privateBrief(error,[record]);throw error;}finally{row.elapsedMs=Date.now()-(record.measurementStarted??Date.now())-row.startedElapsedMs;}}
async function waitFor(record,check,arg,label){return bounded(record.page.waitForFunction(check,arg,{timeout:12000}),label,13000);}
// Browser timings describe this exact corpus and executor. None are pass/fail
// speed budgets; functional safety and source DOM/resource bounds remain strict.
async function cgroupMemory(){const relative=qaCgroup.split('\n').find(line=>line.startsWith('0::'))?.slice(3),base=join('/sys/fs/cgroup',relative);const read=async name=>{try{const raw=(await readFile(join(base,name),'utf8')).trim();return /^\d+$/.test(raw)?Number(raw):raw;}catch{return null;}};return {currentBytes:await read('memory.current'),peakBytesCumulative:await read('memory.peak'),maxBytes:await read('memory.max'),peakScope:'Entire guarded runner cgroup including Node and owned Chromium, cumulative and not reset per corpus'};}
function cpuProfileURL(value){
 if(!value)return '<engine-or-native>';
 try{const url=new URL(value);if(url.protocol==='blob:'&&value.startsWith('blob:'+origin+'/'))return '<local-blob>';if(url.origin!==origin)return '<non-fixture-url>';return /^\/(?:entry\.mjs|pdf\.worker\.mjs|chunks\/[A-Za-z0-9._-]+\.m?js)$/.test(url.pathname)?'<local-bundle>'+url.pathname:'<local-bundle-module>';}catch{return '<unresolved-module>';}
}
function summarizeCpuProfile(profile,record){
 if(!profile||!Array.isArray(profile.nodes)||!Array.isArray(profile.samples)||!Array.isArray(profile.timeDeltas)||!profile.samples.length||profile.samples.length!==profile.timeDeltas.length||profile.samples.length>50000||profile.nodes.length>100000||!Number.isFinite(profile.startTime)||!Number.isFinite(profile.endTime)||profile.endTime<profile.startTime)throw Error('The bounded native CPU profile is incomplete or exceeds the diagnostic limits.');
 const frames=new Map(),totals=new Map();let sampledMicroseconds=0,unattributedSamples=0;
 for(const node of profile.nodes){const frame=node.callFrame??{},location={functionName:privateText(String(frame.functionName||'(anonymous)'),[record]).replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,160),url:cpuProfileURL(frame.url),line:Number.isSafeInteger(frame.lineNumber)&&frame.lineNumber>=0?frame.lineNumber+1:null,column:Number.isSafeInteger(frame.columnNumber)&&frame.columnNumber>=0?frame.columnNumber+1:null};frames.set(node.id,location);}
 for(let index=0;index<profile.samples.length;index++){const delta=profile.timeDeltas[index];if(!Number.isFinite(delta)||delta<0)throw Error('Native CPU sample durations are invalid.');sampledMicroseconds+=delta;let frame=frames.get(profile.samples[index]);if(!frame){unattributedSamples++;frame={functionName:'<unmapped-sample>',url:'<unmapped>',line:null,column:null};}const key=JSON.stringify(frame),row=totals.get(key)??{...frame,selfSamples:0,selfMicroseconds:0};row.selfSamples++;row.selfMicroseconds+=delta;totals.set(key,row);}
 const topFunctions=[...totals.values()].sort((a,b)=>b.selfMicroseconds-a.selfMicroseconds||b.selfSamples-a.selfSamples||a.functionName.localeCompare(b.functionName)).slice(0,30).map(({selfMicroseconds,...row})=>({...row,selfDurationMs:selfMicroseconds/1000}));
 return {nodeCount:profile.nodes.length,sampleCount:profile.samples.length,functionCount:totals.size,unattributedSamples,profileDurationMs:(profile.endTime-profile.startTime)/1000,sampledDurationMs:sampledMicroseconds/1000,samplingIntervalMicroseconds:10000,topFunctions,window:'After baseline/selection and immediately before the first input, through four input/durability/assertion iterations or the observed failure. Final inventory and fixture teardown excluded on success.',source:'Actual CDP Profiler samples; no source transform, copied product function or wall-clock capacity threshold.'};
}
function cpuProfileSnapshot(state){return state?{status:state.status,phase:state.phase??null,retired:state.retired===true,startedElapsedMs:state.startedElapsedMs??null,stoppedElapsedMs:state.stoppedElapsedMs??null,stopReason:state.stopReason??null,detached:state.detached===true,transportDisconnected:state.transportDisconnected===true,error:state.error??null,detachError:state.detachError??null,disconnectError:state.disconnectError??null,steps:state.steps??[],summary:state.summary??null}:{status:'NOT_STARTED'};}
function cpuPhase(record,state,phase){state.phase=phase;state.steps.push({phase,elapsedMs:Date.now()-record.measurementStarted});if(state.steps.length>12)state.steps.shift();}
function disconnectCpuTransport(record,state){
 if(state.disconnectBounded)return state.disconnectBounded;
 // Installed Playwright connectOverCDP closes only its own websocket transport
 // here (coreBundle _connectOverCDPImpl). It rejects outstanding CDP callbacks
 // without waiting for the blocked renderer/session Runtime command.
 const original=(async()=>{cpuPhase(record,state,'disconnect-transport');if(record.browser?.isConnected())await record.browser.close({reason:'Retired bounded CPU diagnostic'});state.transportDisconnected=!record.browser?.isConnected();if(!state.transportDisconnected)throw Error('The retired diagnostic CDP transport must disconnect');})();
 state.disconnectBounded=bounded(original,'Disconnect retired CPU diagnostic CDP transport',5000,true);return state.disconnectBounded;
}
async function startCpuProfile(record){
 assert.equal(cpuProfiles.size,0,'Only the exact single typing corpus may start a CPU profiler');
 const state={status:'STARTING',phase:null,steps:[],session:null,summary:null,detached:false,retired:false};record.cpuProfile=state;cpuProfiles.add(state);
 const live=()=>{if(state.retired)throw Error('The CPU diagnostic startup was irreversibly retired');};
 state.startPromise=(async()=>{try{live();cpuPhase(record,state,'attach-session');state.session=await record.page.context().newCDPSession(record.page);live();cpuPhase(record,state,'enable-profiler');await state.session.send('Profiler.enable');live();cpuPhase(record,state,'set-interval');await state.session.send('Profiler.setSamplingInterval',{interval:10000});live();cpuPhase(record,state,'start-profiler');await state.session.send('Profiler.start');live();state.status='RECORDING';state.startedElapsedMs=Date.now()-record.measurementStarted;cpuPhase(record,state,'recording');}catch(error){state.status='START_FAILED';state.error??=privateBrief(error,[record]);throw error;}})();
 try{await bounded(state.startPromise,'Start actual bounded CPU profiler',15000);}
 catch(error){state.retired=true;state.status='START_FAILED';state.error??=privateBrief(error,[record]);try{await disconnectCpuTransport(record,state);}catch(disconnectError){state.disconnectError=privateBrief(disconnectError,[record]);}throw error;}
}
async function stopCpuProfile(record,reason){
 const state=record?.cpuProfile;if(!state)return null;if(state.stopBounded)return state.stopBounded;
 state.stopReason=reason;state.status='STOPPING';
 const original=(async()=>{let failure;
  try{
   // Never make cancellation depend on the command it is cancelling. On a
   // retired startup, disconnect first, then join its original rejection.
   if(state.retired)await disconnectCpuTransport(record,state);
   await state.startPromise;if(state.retired)throw Error('No profile can be confirmed after diagnostic retirement');
   cpuPhase(record,state,'stop-profiler');const response=await state.session.send('Profiler.stop');state.summary=summarizeCpuProfile(response.profile,record);state.stoppedElapsedMs=Date.now()-record.measurementStarted;
  }catch(error){failure=error;state.error??=privateBrief(error,[record]);}
  finally{
   if(state.session&&!state.transportDisconnected)try{cpuPhase(record,state,'detach-session');await state.session.detach();state.detached=true;state.session=null;}catch(error){failure??=error;state.detachError=privateBrief(error,[record]);}
   state.status=failure?'STOP_FAILED':'STOPPED';
  }
  if(failure)throw failure;return cpuProfileSnapshot(state);
 })();
 const control=(async()=>{try{return await bounded(original,'Stop and detach actual CPU profiler before owned browser shutdown',10000,true);}catch(error){state.retired=true;state.error??=privateBrief(error,[record]);try{await disconnectCpuTransport(record,state);}catch(disconnectError){state.disconnectError=privateBrief(disconnectError,[record]);}throw error;}})();
 state.stopBounded=tracked(control,'CPU profiler stop or irreversible transport retirement');return state.stopBounded;
}
async function browserMetrics(record){const cdp=await record.page.context().newCDPSession(record.page);try{await cdp.send('Performance.enable');const value=await cdp.send('Performance.getMetrics'),metrics=Object.fromEntries(value.metrics.map(metric=>[metric.name,metric.value]));let dom=null;try{dom=await cdp.send('Memory.getDOMCounters');}catch{}return {metrics,DOMCounters:dom,cgroup:await cgroupMemory()};}finally{await cdp.detach();}}
function metricDelta(before,after){return {before,after,delta:Object.fromEntries(['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','LayoutCount','RecalcStyleCount'].map(key=>[key,Number.isFinite(before.metrics[key])&&Number.isFinite(after.metrics[key])?after.metrics[key]-before.metrics[key]:null]))};}
function summary(values){const sorted=[...values].sort((a,b)=>a-b);assert.ok(sorted.length&&sorted.every(Number.isFinite));return {samples:values,count:values.length,min:sorted[0],median:sorted[Math.floor(sorted.length/2)],p95NearestRank:sorted[Math.max(0,Math.ceil(sorted.length*.95)-1)],max:sorted.at(-1),units:'milliseconds',acceptanceThreshold:null};}
function sameAnchor(before,after,label){assert.equal(after.anchor.pageId,before.anchor.pageId,label+' page identity');assert.ok(Math.abs(after.anchor.pageY-before.anchor.pageY)<=1/Math.min(before.zoom,after.zoom),label+' canonical page coordinate');assert.ok(Math.abs(after.anchor.viewportOffset-before.anchor.viewportOffset)<=1,label+' viewport reference coordinate');}
async function functionalNavigation(record,count){
 const navigation=[],sequence=[0,Math.floor(count/2),count-1,Math.floor(count/2),0,Math.floor(count/2)],before=await browserMetrics(record);
 for(const index of sequence){const result=await call(record,'navigate',index);assert.equal(result.sample.pages,count);assert.equal(result.sample.PM,0,'Reading/navigation cannot mount an unrequested canonical editor');navigation.push(result);}
 let prior=(await call(record,'checkpoint')).point;const modes=[];for(const mode of ['single','continuous']){await record.page.getByRole('combobox',{name:'Affichage des pages',exact:true}).selectOption(mode);await call(record,'ready');const value=await call(record,'checkpoint');assert.equal(value.sample.mode,mode);sameAnchor(prior,value.point,'Actual Notebook display-mode switch');modes.push(value);prior=value.point;}
 await record.page.getByRole('button',{name:'Augmenter le zoom',exact:true}).click();let changed=await call(record,'checkpoint');sameAnchor(prior,changed.point,'Real zoom-in');assert.ok(changed.sample.zoom>prior.zoom);prior=changed.point;
 await record.page.getByRole('button',{name:'Réduire le zoom',exact:true}).click();changed=await call(record,'checkpoint');sameAnchor(prior,changed.point,'Real zoom-out');prior=changed.point;
 const resizes=[];for(const viewport of [{width:900,height:1000},{width:1280,height:900}]){await record.page.setViewportSize(viewport);await call(record,'ready');changed=await call(record,'checkpoint');sameAnchor(prior,changed.point,'Actual ResizeObserver');resizes.push({viewport,...changed});prior=changed.point;}
 const wheels=[];for(const deltaY of [140,-140,140,-140]){const box=await record.page.locator('.paper-page-viewport').boundingBox();assert.ok(box&&box.height>100);await record.page.mouse.move(box.x+Math.min(200,box.width/2),box.y+box.height/2);const top=(await call(record,'sample')).viewport.logicalScroll,start=performance.now();await record.page.mouse.wheel(0,deltaY);await waitFor(record,top=>Number(document.querySelector('.paper-page-viewport')?.getAttribute('data-logical-scroll'))!==top,top,'Native wheel must actually move the real viewport');const end=await call(record,'checkpoint');wheels.push({deltaY,driverToTwoRAFMs:performance.now()-start,...end});}
 return {navigation,timing:summary(navigation.map(value=>value.elapsedMs)),modes,resizes,wheels,metrics:metricDelta(before,await browserMetrics(record)),measurementDefinition:'Navigation: actual public guarded viewport scrollToAnchor to two real RAFs; wheel: driver dispatch to native logical-scroll observation plus two RAFs. Zoom uses actual Notebook buttons. Source/DOM/anchor assertions have no speed threshold.'};
}
async function readingCase(record,runId,count){step(record,'reading/start',{pages:count});const opened=await call(record,'start',runId,count,false);await record.page.getByRole('combobox',{name:'Affichage des pages',exact:true}).selectOption('continuous');await call(record,'ready');const baseline=await call(record,'inventory');step(record,'reading/navigation',{pages:count});const evidence=await functionalNavigation(record,count);record.completedMeasurements={corpus:opened.fixture,...evidence};step(record,'reading/exact-inventory',{pages:count});exact(await call(record,'inventory'),baseline,'Read navigation zoom resize and wheel must preserve every original native row and byte');return {corpus:opened.fixture,...evidence,wholeNativeInventoryExact:true};}
async function typingCase(record,runId){
 step(record,'typing/start',{pages:2000});const opened=await call(record,'start',runId,2000,false);await record.page.getByRole('combobox',{name:'Affichage des pages',exact:true}).selectOption('continuous');await call(record,'ready');
 await record.page.locator('.paper-editable-page-reader [data-object="browser-text"]').click({position:{x:20,y:20},timeout:12000});await bounded(record.page.waitForSelector('#actual-writing-notebook .ProseMirror[contenteditable="true"]',{state:'visible',timeout:12000}),'Actual measured Crepe/PM opens');await record.page.locator('#actual-writing-notebook .ProseMirror').click({position:{x:20,y:10},timeout:12000});await record.page.keyboard.press('Control+End');
 step(record,'typing/baseline-flush');const baseline=await call(record,'flush');step(record,'typing/baseline-inventory');const beforeInventory=await call(record,'inventory'),capture=await record.page.evaluate(()=>window.__paperWriting.capture()),nodeIdentity=await record.page.evaluate(()=>{const node=document.querySelector('#actual-writing-notebook .ProseMirror');window.__measuredPM=node;return !!node;});assert.equal(nodeIdentity,true);await bounded(record.page.evaluate(id=>window.__paperWriting.selectionReady(id),capture.id),'Actual measured PM acknowledges native selection');const originalText=capture.text;assert.equal(typeof originalText,'string');let wantedText=originalText;const before=await browserMetrics(record),samples=[];record.completedMeasurements={corpus:opened.fixture,baseline,samples};step(record,'typing/native-selection-acknowledged',{captureId:capture.id,originalTextLength:originalText.length});
 if(cpuProfileEnabled)await startCpuProfile(record);
 for(let index=0;index<4;index++){const marker=' PERF-'+index;step(record,'typing/native-insert',{sample:index+1});await call(record,'armTyping',marker);await record.page.keyboard.insertText(marker);const dom=await call(record,'typingResult');step(record,'typing/durable-flush',{sample:index+1});const durable=await call(record,'flush');wantedText+=marker;const actualText=await record.page.evaluate(id=>window.__paperWriting.recordState(id).text,capture.id);assert.equal(actualText,wantedText,'Each real native insertion preserves the complete prior PM text and every earlier marker');assert.equal(dom.id,capture.id,'All measured inputs use the same actual canonical PM');assert.equal(durable.pages,2000);assert.equal(durable.lineage,baseline.lineage);for(const key of ['otherObjectsSHA256','pagesSHA256','assetsSHA256','audioSHA256'])assert.equal(durable[key],baseline[key],'Writing cannot change unrelated '+key);assert.equal(await record.page.evaluate(()=>document.querySelector('#actual-writing-notebook .ProseMirror')===window.__measuredPM),true,'Timing must not remount/replace the actual editor');samples.push({dom,durable});step(record,'typing/sample-verified',{sample:index+1});}
 if(cpuProfileEnabled)await stopCpuProfile(record,'four-inputs-complete');
 step(record,'typing/final-inventory');const afterInventory=await call(record,'inventory'),sourceAccount='writing-A-'+runId;for(const [store,rows]of Object.entries(beforeInventory)){const retained=row=>row.accountId!==sourceAccount||row.documentId==='note-two'||row.documentId==='paper-v3-note-note-two'||String(row.key).startsWith('perf-original|');exact(afterInventory[store].filter(retained),rows.filter(retained),'Every foreign/second-note/explicit retained origin key set and entire row stays exact');if(store==='blobs'||store==='scopedBlobs')exact(afterInventory[store],rows,'Writing cannot mutate any original media bytes');}
 return {corpus:opened.fixture,samples,inputEventToDOM:summary(samples.map(value=>value.dom.eventToDOMObservedMs)),durableCanonicalAndMirror:summary(samples.map(value=>value.durable.elapsedMs)),metrics:metricDelta(before,await browserMetrics(record)),sameActualPM:true,nativeTrustedInput:true,measurementDefinition:'Four real CDP insertText actions. Native input capture to actual MutationObserver is descriptive; durable time joins the unchanged writing fixture actual PM/canonical/parent-first-mirror barrier. No OS/IME claim.'};
}
async function mediaCase(record,runId){
 const opened=await call(record,'start',runId,100,true);await record.page.getByRole('combobox',{name:'Affichage des pages',exact:true}).selectOption('continuous');await call(record,'ready');const baseline=await call(record,'inventory'),before=await browserMetrics(record),samples=[];
 for(const index of [0,50,99,50,0]){const navigation=await call(record,'navigate',index),media=await call(record,'mediaReady');assert.ok(media.images>=12&&media.decodedImages===media.images,'Mounted dense image readers must really decode their scoped originals');if(index===50||index===99){await waitFor(record,()=>!!document.querySelector('#actual-writing-notebook canvas[style*="visible"]'),null,'A real PDF.js canvas must finish');const source=await call(record,'mediaReady');assert.ok(source.canvas>=1);samples.push({navigation,media:source});}else samples.push({navigation,media});}
 await record.page.getByRole('button',{name:'Afficher les enregistrements',exact:true}).click();await waitFor(record,()=>{const audio=document.querySelector('.paper-audio-track audio');return audio&&audio.readyState>=1&&Number.isFinite(audio.duration);},null,'Actual one-second local audio metadata must decode');const audio=(await call(record,'mediaReady')).audio;assert.equal(audio.length,1);assert.ok(Math.abs(audio[0].duration-1)<.01&&audio[0].paused,'Audio metadata may load without recording or playback');exact(await call(record,'inventory'),baseline,'Dense native image PDF and audio reads must preserve every original row and byte');return {corpus:opened.fixture,samples,audio,timing:summary(samples.map(value=>value.navigation.elapsedMs)),metrics:metricDelta(before,await browserMetrics(record)),wholeNativeInventoryExact:true,actualImagePdfAudioReaders:true,audioPlayback:false,microphone:false};
}
async function failureState(record){
 if(cpuProfileEnabled)try{await stopCpuProfile(record,'observe-failure');}catch{/* Preserve the initial business error; final CPU state and cleanup retain this failure. */}
 if(!record)return null;let dom;try{dom=record.page&&!record.page.isClosed()&&record.browser?.isConnected()?await bounded(record.page.evaluate(()=>window.__paperNotebookPerformance?.state()??null),'Bounded performance failure state',800,true):null;}catch(error){dom={unavailable:privateBrief(error,[record])};}
 return {phase:record.phase??null,businessPhase:record.businessPhase??null,steps:record.steps??[],calls:record.calls??[],completedMeasurements:record.completedMeasurements??null,...(cpuProfileEnabled?{cpuProfile:cpuProfileSnapshot(record.cpuProfile)}:{}),browserConnected:record.browser?.isConnected()??false,pageClosed:record.page?.isClosed()??null,pageErrors:record.pageErrors,consoleErrors:record.consoleErrors,stderr:privateText(record.stderr,[record]).slice(-1500),dom:privateValue(dom,[record]),protocolErrors:protocolErrors.slice(-6),apiRequests};
}
async function cleanupGroup(){const errors=[];for(const record of [...owned]){if(cpuProfileEnabled)try{await stopCpuProfile(record,'cleanup-before-kill');}catch(error){errors.push(error);}try{await killOwned(record);}catch(error){errors.push(error);}}if(errors.length)throw new AggregateError(errors,'Owned performance browser cleanup failed');}
async function completeCorpus(executable,count,dense,work,admission){
 if(!admission.current)throw Error('No new corpus after group retirement');const profile=await mkdtemp(join(workDir,'profile-'));profiles.add(profile);let record;
 try{record=await launch(profile,executable,'notebook-performance-'+count+(dense?'-dense':''));admission.record=record;report.availability.executed=true;if(!admission.current)throw Error('Corpus retired before admission');const evidence=await work(record,randomUUID(),count);if(!admission.current)throw Error('Corpus retired before cleanup');const fixtureCleanup=await call(record,'cleanup');await waitFor(record,()=>window.__paperNotebookPerformance.state().operations===0,null,'Original measured fixture methods must settle');assert.equal(fixtureCleanup.source.liveEditors,0);assert.equal(fixtureCleanup.source.pending,false);for(const key of ['opened','connections','transactions','workers','objectURLs'])assert.equal(fixtureCleanup.native[key],0,'Native '+key+' must finish');assert.deepEqual(record.pageErrors,[]);assert.equal(record.networkRefused,0);assert.equal(apiRequests,0);assert.deepEqual(protocolErrors,[]);const result={browserVersion:record.browser.version(),evidence,fixtureCleanup};if(cpuProfileEnabled)await stopCpuProfile(record,'successful-corpus-before-kill');await killOwned(record);await rm(profile,{recursive:true,force:true});profiles.delete(profile);return result;}catch(error){admission.diagnostics=await failureState(record);throw error;}
}
async function runBrowser(){
 await verifyBundle();try{playwright=await import('playwright');}catch(error){report.availability={status:'NOTRUN',reason:'Existing Playwright unavailable',error:brief(error)};return;}
 const executable=process.env.DOWZE_CRASH_CHROMIUM_PATH||playwright.chromium.executablePath();assert.ok(isAbsolute(executable));try{await access(executable,constants.X_OK);}catch{report.availability={status:'NOTRUN',reason:'Existing Chromium executable unavailable; no download'};return;}
 report.availability={status:'AVAILABLE',executable:executable.split(sep).at(-1),executed:false};const os=await import('node:os');report.executor={platform:process.platform,arch:process.arch,node:process.version,kernel:os.release(),CPUModel:os.cpus()[0]?.model??null,logicalCPUs:os.cpus().length,guard:report.guard};workDir=await mkdtemp(join(tmpdir(),'dwnp-'));await writeFile(join(workDir,'.owned-synthetic-browser-profiles'),'private synthetic measured profiles only\n');await startServer();
 for(const name of cases){
  if(diagnosticCase&&name!==diagnosticCase){report.groups.push({name,status:'NOTRUN',reason:'Diagnostic exact performance case'});continue;}
  if(Date.now()>=deadline)throw Error('Performance recipe global deadline exhausted');const admission={current:true,record:null,diagnostics:null},timeoutBefore=timedOutOperations.length;let result;report.groupsStarted++;
  try{const body=async()=>{if(name===cases[0]){const corpora=[];for(const count of [1,100,2000]){const value=await completeCorpus(executable,count,false,readingCase,admission);corpora.push(value);(admission.completedCorpora??=[]).push(value);}return {corpora};}return completeCorpus(executable,name===cases[1]?2000:100,name===cases[2],name===cases[1]?typingCase:mediaCase,admission);};const evidence=await bounded(body(),'Complete actual performance case '+name,name===cases[0]?110000:70000);result={name,status:'PASS',evidence};report.passed++;}
  catch(error){admission.current=false;result={name,status:'FAIL',error:privateBrief(error,[admission.record]),diagnostics:admission.diagnostics??await failureState(admission.record),completedCorpora:admission.completedCorpora??[]};report.failed++;console.error(name+': FAIL '+result.error.message);}
  finally{admission.current=false;if(result)report.groups.push(result);try{await cleanupGroup();await drain('Original measured case after owned browser shutdown');if(timedOutOperations.length!==timeoutBefore)throw Error('Any timed-out original remains an explicit group failure');for(const profile of [...profiles]){await rm(profile,{recursive:true,force:true});profiles.delete(profile);}if(result)result.cleanup={status:'PASS'};}catch(error){if(result){result.cleanup={status:'FAIL',error:brief(error)};if(result.status==='PASS'){result.bodyStatus='PASS';result.status='FAIL';report.passed--;report.failed++;}}throw error;}}
  console.log(name+': '+result.status);
 }
}

try{await requireCentralGuard();if(buildPhase)await buildBundle();else await runBrowser();}
catch(error){report.fatal=brief(error);console.error('Notebook performance browser recipe failed: '+report.fatal.message);process.exitCode=1;}
finally{
 const errors=[];try{await cleanupGroup();}catch(error){errors.push(error);}try{await closeServer();}catch(error){errors.push(error);}try{await drain('Final original measured/HTTP operations');}catch(error){errors.push(error);}
 if(pending.size||handlers.size||owned.size){console.error('FATAL_STOP: accepted browser/HTTP operations remain; no final report, observer restore or profile deletion');throw new AggregateError(errors,'Accepted originals remain active');}
 for(const profile of [...profiles])try{await rm(profile,{recursive:true,force:true});profiles.delete(profile);}catch(error){errors.push(error);}if(workDir)try{await rm(workDir,{recursive:true,force:true});}catch(error){errors.push(error);}
 if(runPhase&&report.manifest)try{const before=report.manifest.sha256;await verifyBundle();assert.equal(report.manifest.sha256,before);report.finalFreeze={status:'PASS',manifestSha256:before};}catch(error){errors.push(error);report.finalFreeze={status:'FAIL',error:brief(error)};}
 if(cpuProfileEnabled){report.cpuProfiler.profiles=[...cpuProfiles].map(cpuProfileSnapshot);if(cpuProfiles.size!==1||[...cpuProfiles].some(state=>state.status!=='STOPPED'||!state.detached||!state.summary?.sampleCount))errors.push(Error('The requested actual CPU diagnostic did not finish a bounded profile and detach.'));}
 if(protocolErrors.length)errors.push(Error('Private HTTP protocol errors were observed'));report.timedOutOperations=timedOutOperations;report.cleanupFinal=errors.length?{status:'FAIL',error:brief(new AggregateError(errors,'Final Notebook performance cleanup failed'))}:{status:'PASS',remainingOwnedBrowsers:owned.size,remainingProfiles:profiles.size,httpListening:server?.listening??false,httpSockets:sockets.size,httpHandlers:handlers.size,acceptedOperations:pending.size};if(errors.length)process.exitCode=1;
 if(runPhase){const attempted=new Set(report.groups.map(group=>group.name));for(const name of cases)if(!attempted.has(name))report.groups.push({name,status:'NOTRUN',reason:report.availability?.reason??'Earlier fatal/cleanup failure'});report.fullSuite=!diagnosticCase&&report.groupsStarted===cases.length&&report.passed===cases.length&&!report.failed&&!report.fatal&&!timedOutOperations.length&&report.cleanupFinal.status==='PASS'&&report.finalFreeze?.status==='PASS';report.diagnosticPassed=!!diagnosticCase&&report.passed===1&&!report.failed&&!report.fatal&&!timedOutOperations.length&&report.cleanupFinal.status==='PASS'&&report.finalFreeze?.status==='PASS';if(!report.fullSuite&&!report.diagnosticPassed)process.exitCode||=report.availability?.status==='NOTRUN'?2:1;}
 report.finishedAt=new Date().toISOString();await mkdir(dirname(artifact),{recursive:true});await writeFile(artifact,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({phase:report.phase,passed:report.passed,failed:report.failed,notRun:report.groups.filter(group=>group.status==='NOTRUN').length,fullSuite:report.fullSuite,diagnosticPassed:report.diagnosticPassed??false,cleanup:report.cleanupFinal.status,fatal:report.fatal?.message??null,report:artifact}));
}

