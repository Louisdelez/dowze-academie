/* Separate guarded phases, never compile while the browser recipe is active:
 * bash scripts/run-dell-safe-check.sh -- node tests/run-paper-import-crash.mjs --build --bundle-dir /tmp/dowze-import-crash-BUILD-ID
 * bash scripts/run-dell-safe-check.sh -- node tests/run-paper-import-crash.mjs --run --bundle-dir /tmp/dowze-import-crash-BUILD-ID
 * A build may also use the existing server-only QA build guard, strictly in
 * the owned /tmp QA checkout with >=24GiB RAM and >=12GiB available. Runtime
 * always requires the smaller central guard; this never changes Dell limits.
 * The build directory must be NEW. --run verifies its manifest and requires an
 * already-installed Chromium; it never installs/downloads browsers or deps.
 * Evidence: actual browser/IndexedDB process SIGKILL, not physical power loss,
 * Safari/iOS/Tauri/Pencil, nor general UI input/permission parity. The separately named UI smoke uses the real Notebook/filechooser. */
import {mountedAuditPath} from './mounted-cleanup.mjs';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir,readdir,stat,access,mkdtemp,rm} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,resolve,relative,isAbsolute,dirname,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
const root=process.cwd(),cases=['pdf-source','pdf-ready','pdf-publication-pending','pdf-applied','archive-source','archive-ready','archive-publication-pending','archive-applied','ui-pdf-publication-pending'];
const diagnosticCase=process.env.DOWZE_IMPORT_CRASH_ONLY?.trim()||null;
if(diagnosticCase&&!cases.includes(diagnosticCase))throw Error('DOWZE_IMPORT_CRASH_ONLY must name one exact declared import crash case.');
const args=process.argv.slice(2),buildPhase=args.includes('--build'),runPhase=args.includes('--run'),dirAt=args.indexOf('--bundle-dir'),bundleDir=dirAt>=0?args[dirAt+1]:undefined;
if(buildPhase===runPhase||!bundleDir||!isAbsolute(bundleDir)||args.some((arg,i)=>!['--build','--run','--bundle-dir'].includes(arg)&&i!==dirAt+1))throw Error('Use exactly --build or --run and --bundle-dir /absolute/new/private/directory. No combined build/runtime.');
const artifact=mountedAuditPath(`t-x02-paper-import-browser-${buildPhase?'build':'kill'}-20261015.json`),web=join(bundleDir,'web'),manifestPath=join(bundleDir,'manifest.json');
const report={schema:1,kind:'paper-import-browser-process-crash',phase:buildPhase?'build':'runtime',startedAt:new Date().toISOString(),proofScope:buildPhase?'Separate fixture compilation and source/output manifest only; no browser execution':'Actual Chromium SIGKILL and production IndexedDB import helpers; final group is a distinct actual Notebook/filechooser smoke. No power-loss/native/Pencil claim',diagnosticOnly:!!diagnosticCase,diagnosticCase,declaredGroups:buildPhase?1:cases.length,groupsStarted:0,allGroupsAttempted:false,fullSuite:false,availability:null,manifest:null,passed:0,failed:0,groups:[],cleanupFinal:{status:'NOTRUN'},fatal:null};
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
 report.groupsStarted=1;
 await mkdir(bundleDir);await writeFile(join(bundleDir,'.owned-import-crash-build'),'synthetic fixture build only\n');
 const {build}=await import('vite'),virtualWorker='\0private-import-worker-url',workerInput='node_modules/pdfjs-dist/build/pdf.worker.min.mjs',seenSources=new Set();
 // Build-only URL seam: serve the ACTUAL installed PDF.js worker as its own
 // same-origin module instead of Vite lib mode inlining it into a data URL.
 const built=await build({configFile:false,publicDir:false,define:{'process.env.NODE_ENV':JSON.stringify('production')},esbuild:{jsx:'automatic'},plugins:[{name:'private-actual-pdf-worker-url',enforce:'pre',resolveId(id){if(id==='pdfjs-dist/build/pdf.worker.min.mjs?url')return virtualWorker;},load(id){if(id===virtualWorker)return 'export default "/pdf.worker.mjs";';},transform(_code,id){const clean=id.split('?')[0];if(isAbsolute(clean)&&clean.startsWith(root+sep)&&!clean.includes(sep+'node_modules'+sep))seenSources.add(relative(root,clean));}}],build:{lib:{entry:join(root,'tests/paper-import-crash-entry.tsx'),formats:['es'],fileName:()=> 'entry.mjs'},outDir:web,emptyOutDir:false,copyPublicDir:false,target:'es2022',minify:false,sourcemap:false,reportCompressedSize:false,rollupOptions:{output:{entryFileNames:'entry.mjs',chunkFileNames:'chunks/[name]-[hash].mjs'}}},logLevel:'error'});
 const pdf=await readFile(join(root,'tests/fixtures/paper-pdf-selection-columns.pdf'));
 await writeFile(join(web,'fixture.pdf'),pdf);await writeFile(join(web,'pdf.worker.mjs'),await readFile(join(root,workerInput)));
 // This is an actual synthetic ZIP, produced ONCE during the isolated build.
 // Restarting a browser never recreates these records in IndexedDB.
 const {zipSync}=await import('fflate'),wav=Buffer.alloc(44+800*2),wave=new DataView(wav.buffer,wav.byteOffset,wav.byteLength);
 wav.write('RIFF',0);wave.setUint32(4,wav.length-8,true);wav.write('WAVEfmt ',8);wave.setUint32(16,16,true);wave.setUint16(20,1,true);wave.setUint16(22,1,true);wave.setUint32(24,8000,true);wave.setUint32(28,16000,true);wave.setUint16(32,2,true);wave.setUint16(34,16,true);wav.write('data',36);wave.setUint32(40,1600,true);
 const stamp='2026-10-15T10:00:00Z',page=(id,width,height)=>({id,width,height,pattern:'plain',color:'#ffffff',bookmark:false,rotation:0});
 const source={notebookSchema:3,noteId:'synthetic-archive-origin',revision:0,updatedAt:stamp,legacy:{markdown:'',boardId:'synthetic-archive-board',migratedAt:stamp},pages:[{...page('source-pdf-page',800,3200/3),pdf:{assetId:'source-pdf',pageNumber:1,text:'Synthetic archive PDF link'}},page('source-ink-page',960,1200)],assets:[{id:'source-pdf',name:'fixture-columns.pdf',mediaType:'application/pdf',size:pdf.length},{id:'source-audio',name:'fixture-tone.wav',mediaType:'audio/wav',size:wav.length}],audio:[{id:'source-session',assetId:'source-audio',name:'Synthetic 100ms PCM',duration:.1,startedAt:1}],objects:[{id:'source-text',pageId:'source-pdf-page',kind:'text',x:30,y:40,width:300,height:80,rotation:0,z:1,locked:false,markdown:'Actual ZIP text survives the crash',createdAt:1},{id:'source-ink',pageId:'source-ink-page',kind:'ink',x:20,y:30,width:200,height:100,rotation:15,z:2,locked:false,pen:'pen',strokeWidth:3,color:'#183548',createdAt:1,audioAnchor:{sessionId:'source-session',time:.05},points:[{x:0,y:0,time:1,pressure:.2,tiltX:4},{x:200,y:100,time:2,pressure:.8,tiltX:7}]}]};
 const zipped={'document.json':Buffer.from(JSON.stringify(source)),'assets/source-pdf':pdf,'assets/source-audio':wav};
 const integrity={schema:1,files:Object.fromEntries(Object.entries(zipped).map(([name,bytes])=>[name,{size:bytes.length,sha256:digest(bytes)}])),assetPaths:{'source-pdf':'assets/source-pdf','source-audio':'assets/source-audio'}};
 zipped['integrity.json']=Buffer.from(JSON.stringify(integrity));await writeFile(join(web,'fixture.dowze'),zipSync(zipped,{level:1}));
 const sources=new Set([...seenSources,'tests/run-paper-import-crash.mjs','tests/paper-import-crash-entry.tsx','tests/mounted-cleanup.mjs','tests/fixtures/paper-pdf-selection-columns.pdf','src/lib/paperPdfImportStaging.ts','src/lib/paperAppendArchiveStaging.ts','src/lib/paperPdf.ts','pwa/src/storage.ts','package.json',workerInput,'node_modules/pdfjs-dist/package.json']);
 for(const result of Array.isArray(built)?built:[built])for(const chunk of result.output??[])if(chunk.type==='chunk')for(const id of Object.keys(chunk.modules)){
  const clean=id.split('?')[0];if(isAbsolute(clean)&&clean.startsWith(root+sep)&&!clean.includes(sep+'node_modules'+sep))sources.add(relative(root,clean));
 }
 const inputs={},outputs={};for(const path of [...sources].sort())inputs[path]=digest(await readFile(join(root,path)));
 for(const path of await files(web))outputs[relative(web,path)]=digest(await readFile(path));
 for(const name of ['entry.mjs','fixture.pdf','fixture.dowze','pdf.worker.mjs'])assert.ok(outputs[name],'Actual browser build missing '+name);
 assert.ok(Object.keys(outputs).some(name=>name.endsWith('.css')),'Real Notebook component CSS must be included');
 const manifest={schema:1,kind:'paper-import-browser-build',builtAt:new Date().toISOString(),fixture:{pdfSha256:digest(pdf),archiveSha256:outputs['fixture.dowze'],archiveAssets:['actual PDF','synthetic valid PCM WAV']},inputs,outputs};await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
 report.manifest={sha256:digest(await readFile(manifestPath)),inputFiles:Object.keys(inputs).length,bundleFiles:Object.keys(outputs).length};report.groups=[{name:'Separate actual browser import fixture build',status:'PASS'}];report.passed=1;report.allGroupsAttempted=true;report.buildComplete=true;report.cleanupFinal={status:'PASS',browserProcesses:0};
}
async function verifyBundle(){
 const manifest=JSON.parse(await readFile(manifestPath,'utf8'));assert.equal(manifest.schema,1);assert.equal(manifest.kind,'paper-import-browser-build');
 for(const [path,expected] of Object.entries(manifest.inputs)){assert.ok(!isAbsolute(path)&&!path.split(/[\\/]/).includes('..'),'Source manifest must stay in this checkout');assert.equal(digest(await readFile(join(root,path))),expected,'Fixture or product source changed after the separate build: '+path);}
 for(const [path,expected] of Object.entries(manifest.outputs)){assert.ok(!isAbsolute(path)&&!path.split(/[\\/]/).includes('..'),'Bundle manifest must stay in its private directory');assert.equal(digest(await readFile(join(web,path))),expected,'Browser bundle changed after build: '+path);}
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
 await bounded(record.page.waitForFunction(()=>!!window.__paperImportCrash,null,{timeout:15000}),'Load actual browser fixture API');
 assert.deepEqual(record.pageErrors,[],'Actual browser module initialization must not fail');assert.equal(record.networkRefused,0,'The fixture must use only its private localhost origin');
 return record;
}
async function waitPhase(record,expected){
 return bounded((async()=>{for(;;){assert.deepEqual(record.pageErrors,[]);const value=await record.page.evaluate(()=>window.__paperImportCrash.status());if(value.error)throw Error('Actual browser producer failed: '+value.error);if(value.phase===expected)return value;await sleep(25);}})(),`Await ${expected}`);
}
async function startServer(){
 const css=(await files(web)).filter(path=>path.endsWith('.css')).map(path=>'/'+relative(web,path).split(sep).join('/'));
 server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://127.0.0.1'),pathname=decodeURIComponent(url.pathname);
  if(pathname==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+css.map(path=>'<link rel="stylesheet" href="'+path+'">').join('')+'<style>html,body{margin:0;width:100%;height:100%}#actual-notebook{width:100%;height:100vh}</style></head><body><script type="module" src="/entry.mjs"></script></body></html>');return;}
  const file=resolve(web,'.'+pathname);if(!file.startsWith(resolve(web)+sep)||(await stat(file)).isDirectory())throw Error('Outside private bundle');
  const content=await readFile(file);res.writeHead(200,{'content-type':/\.m?js$/.test(file)?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.json')?'application/json':file.endsWith('.pdf')?'application/pdf':'application/octet-stream','cache-control':'no-store'});res.end(content);
 }catch{res.writeHead(404);res.end('Private fixture file not found');}});
 await bounded(new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);}),'Private fixture server',3000);origin=`http://127.0.0.1:${server.address().port}`;
}
async function cleanupGroup(){const failures=[];for(const record of [...owned])try{await killOwned(record);}catch(error){failures.push(error);}if(failures.length)throw new AggregateError(failures,'Owned browser cleanup failed');}
async function mountReady(record){
 await bounded(record.page.waitForSelector('.paper-notebook',{state:'visible',timeout:15000}),'Actual Notebook shell');
 await bounded(record.page.waitForSelector('.paper-page-viewport-frame[data-page-mounted="true"] svg',{state:'attached',timeout:15000}),'Actual Notebook page SVG');
}
async function openPendingPanel(record){
 await record.page.locator('summary[aria-label="Options de la note"]').click({timeout:10000});
 await record.page.getByRole('button',{name:'Importations à reprendre',exact:true}).click({timeout:10000});
 const panel=record.page.locator('section[aria-label="Importations à reprendre"]');await bounded(panel.waitFor({state:'visible',timeout:10000}),'Actual pending imports panel');await bounded(record.page.waitForFunction(()=>{const panel=document.querySelector('section[aria-label="Importations à reprendre"]');return panel&&Array.from(panel.querySelectorAll('button')).some(button=>button.textContent?.trim()==='Actualiser'&&!button.disabled);},null,{timeout:10000}),'Actual imports panel finished loading');return panel;
}
async function runBrowser(){
 await verifyBundle();
 try{playwright=await import('playwright');}catch(error){report.availability={status:'NOTRUN',reason:'Existing Playwright package unavailable',error:brief(error)};return;}
 const executable=process.env.DOWZE_CRASH_CHROMIUM_PATH||playwright.chromium.executablePath();assert.ok(isAbsolute(executable),'Existing Chromium path must be absolute');
 try{await access(executable,constants.X_OK);}catch{report.availability={status:'NOTRUN',reason:'Already-installed Chromium executable unavailable; no automatic download',executable:executable.split(sep).at(-1)};return;}
 report.availability={status:'AVAILABLE',executable:executable.split(sep).at(-1),executed:false};
 workDir=await mkdtemp(join(tmpdir(),'dowze-import-real-kill-'));await writeFile(join(workDir,'.owned-synthetic-browser-profiles'),'private synthetic test profiles only\n');await startServer();
 for(const name of cases){
  if(diagnosticCase&&name!==diagnosticCase){report.groups.push({name,status:'NOTRUN',reason:'Diagnostic exact case filter'});continue;}
  if(Date.now()>=deadline)throw Error('Global browser recipe deadline exhausted before next group');
  const runId=randomUUID(),profile=await mkdtemp(join(workDir,'profile-'));profiles.add(profile);let first,second;report.groupsStarted++;console.log(name+': START');
  try{
   first=await launch(profile,executable,'first');report.availability.executed=true;const version=first.browser.version();
   await first.page.evaluate(({name,runId})=>{window.__paperImportCrash.start(name,runId);},{name,runId});
   const ui=name.startsWith('ui-'),pending=name.endsWith('publication-pending');
   if(ui){
    await waitPhase(first,'ui-mounted');await mountReady(first);const before=await bounded(first.page.evaluate(({name,runId})=>window.__paperImportCrash.uiReady(name,runId),{name,runId}),'Actual UI durable original');assert.equal(before.durableLineage,true);assert.equal(before.jobs,0);
    await first.page.locator('summary[aria-label="Insérer dans la note"]').click({timeout:10000});await bounded(first.page.waitForFunction(()=>document.querySelector('button[aria-label="Importer un PDF"]')?.disabled===false,null,{timeout:10000}),'Actual PDF import admission ready');const button=first.page.getByRole('button',{name:'Importer un PDF',exact:true});assert.equal(await button.isEnabled(),true,'Actual importer must admit a file');
    const chooserReady=first.page.waitForEvent('filechooser',{timeout:10000});await button.click({timeout:10000});const chooser=await bounded(chooserReady,'Actual browser filechooser');await chooser.setFiles({name:'fixture-columns.pdf',mimeType:'application/pdf',buffer:await readFile(join(web,'fixture.pdf'))});
   }
   const staged=await waitPhase(first,pending?'uncommitted-written':'ready-kill'),expected=staged.expected;assert.ok(expected?.id&&/^[a-f0-9]{64}$/.test(expected.sourceSha)&&expected.sourceSize>0,'Producer must expose only confirmed comparison hashes and stable IDs');assert.equal(staged.sourceAcknowledged,true);
   if(!name.endsWith('-source')){assert.equal(staged.readyAcknowledged,true);assert.ok(expected.ids.pages.length>0&&expected.ids.assets.length>0);}
   if(pending){assert.equal(staged.holdActive,true);assert.equal(staged.holdCompleted,false);assert.ok(staged.holdReads>0);assert.equal(staged.uncommittedGraph,true);assert.equal(staged.uncommittedAssets,true);assert.equal(staged.uncommittedHistory,true);assert.equal(staged.publicationAcknowledged,false);}
   else assert.equal(staged.publicationAcknowledged,name.endsWith('-applied'));
   assert.deepEqual(first.pageErrors,[],'Actual parser/UI must not have failed before the crash');assert.equal(first.networkRefused,0);
   await killOwned(first,true);second=await launch(profile,executable,'second');
   // This read occurs BEFORE any actual Notebook mount, so durable browser
   // recovery is distinct from the application's opening/reconciliation path.
   const recovered=await bounded(second.page.evaluate(({name,runId,expected})=>window.__paperImportCrash.inspect(name,runId,expected),{name,runId,expected}),'Actual persistent import recovery');
   assert.equal(recovered.storage,'actual-browser-indexeddb');assert.equal(recovered.scopeIsolated,true);assert.equal(recovered.originalBytesExact,true);assert.equal(recovered.automaticReplay,false);
   let uiEvidence;
   if(ui){
    await bounded(second.page.evaluate(({name,runId})=>window.__paperImportCrash.mountUi(name,runId),{name,runId}),'Actual Notebook reopen without seed');await mountReady(second);const panel=await openPendingPanel(second),row=panel.locator('li').filter({hasText:'fixture-columns.pdf'});assert.equal(await row.count(),1,'Only the original ready job must be resumable');
    await row.getByRole('button',{name:'Reprendre dans cette note',exact:true}).click({timeout:10000});
    await bounded(second.page.waitForFunction(()=>{const panel=document.querySelector('section[aria-label="Importations à reprendre"]');return panel?.textContent?.includes('L’importation a été reprise dans cette note.')&&panel.querySelectorAll('li').length===0&&Array.from(panel.querySelectorAll('button')).some(button=>button.textContent?.trim()==='Actualiser'&&!button.disabled);},null,{timeout:15000}),'Actual UI confirmed resume and finally');
    uiEvidence=await bounded(second.page.evaluate(({name,runId,expected})=>window.__paperImportCrash.uiApplied(name,runId,expected),{name,runId,expected}),'Actual UI canonical publication');
    assert.equal(uiEvidence.actualNotebookUi,true);assert.equal(uiEvidence.actualFileChooser,true);assert.equal(uiEvidence.receipt,'applied');
    await bounded(second.page.reload({waitUntil:'load',timeout:15000}),'Same-origin actual UI refresh');await bounded(second.page.waitForFunction(()=>!!window.__paperImportCrash,null,{timeout:15000}),'Reloaded production fixture');
    await bounded(second.page.evaluate(({name,runId})=>window.__paperImportCrash.mountUi(name,runId),{name,runId}),'Actual UI refresh without seed');await mountReady(second);const refreshed=await openPendingPanel(second);assert.equal(await refreshed.locator('li').count(),0,'An applied job cannot return after refreshing');
    const after=await bounded(second.page.evaluate(({name,runId,expected})=>window.__paperImportCrash.uiApplied(name,runId,expected),{name,runId,expected}),'No duplicate actual UI publication after refresh');assert.equal(after.graphSha,uiEvidence.graphSha,'Refreshing the actual Notebook changed its applied graph');uiEvidence={...uiEvidence,refreshNoDuplicate:true};
   }
   assert.deepEqual(second.pageErrors,[]);assert.equal(second.networkRefused,0);
   report.passed++;report.groups.push({name,status:'PASS',browserVersion:version,crashSignal:first.exit.signal,acknowledgedState:staged.acknowledgedState,...recovered,...(uiEvidence?{uiEvidence}:{}),seams:['Private synthetic source note/ZIP','Native IDB requests keep pending publication transaction open until real SIGKILL'],noRamReseed:true});
  }catch(error){
   const firstRecord=first??[...owned].find(record=>record.role==='first'),secondRecord=second??[...owned].find(record=>record.role==='second'),records=[firstRecord,secondRecord];
   const [firstState,secondState]=await Promise.all([failureState(firstRecord),failureState(secondRecord)]),safeError=privateBrief(error,records);
   report.failed++;report.groups.push({name,status:'FAIL',error:safeError,diagnostics:{first:firstState,second:secondState}});console.error(name+': FAIL '+safeError.message);
  }
  finally{
   const result=report.groups.find(group=>group.name===name);
   try{await cleanupGroup();await rm(profile,{recursive:true,force:true});profiles.delete(profile);if(result){result.cleanup={status:'PASS'};if(result.status==='PASS')console.log(name+': PASS');}}
   catch(error){if(result){result.cleanup={status:'FAIL',error:brief(error)};if(result.status==='PASS'){result.bodyStatus='PASS';result.status='FAIL';report.passed--;report.failed++;}}throw new AggregateError([error],name+': real browser group cleanup failed');}
  }
 }
}

try{
 await requireCentralGuard();if(buildPhase)await buildBundle();else await runBrowser();
}catch(error){report.fatal=brief(error);console.error('Import browser recipe failed: '+report.fatal.message);process.exitCode=1;}
finally{
 const errors=[];try{await cleanupGroup();}catch(error){errors.push(error);}
 if(server)try{server.closeAllConnections();await bounded(new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve())),'Private HTTP server cleanup',3000,true);}catch(error){errors.push(error);}
 if(owned.size===0){for(const profile of profiles)try{await rm(profile,{recursive:true,force:true});profiles.delete(profile);}catch(error){errors.push(error);}if(workDir)try{await rm(workDir,{recursive:true,force:true});}catch(error){errors.push(error);}}
 if(errors.length){report.cleanupFinal={status:'FAIL',error:brief(new AggregateError(errors,'Final real-browser cleanup failed'))};process.exitCode=1;}else report.cleanupFinal={status:'PASS',remainingOwnedBrowsers:owned.size,remainingProfiles:profiles.size,httpListening:server?.listening??false};
 if(runPhase){const attempted=new Set(report.groups.map(group=>group.name));for(const name of cases)if(!attempted.has(name))report.groups.push({name,status:'NOTRUN',reason:report.availability?.reason??'Earlier fatal or cleanup failure'});if(report.availability?.status==='NOTRUN'&&!report.fatal)process.exitCode=2;if(report.failed||report.passed!==cases.length||report.fatal||report.cleanupFinal.status!=='PASS')process.exitCode||=1;}
 if(runPhase){report.allGroupsAttempted=report.groupsStarted===cases.length;report.fullSuite=!diagnosticCase&&report.allGroupsAttempted&&report.passed===cases.length&&!report.failed&&!report.fatal&&report.cleanupFinal.status==='PASS';if(diagnosticCase)process.exitCode||=1;}report.finishedAt=new Date().toISOString();await mkdir(dirname(artifact),{recursive:true});await writeFile(artifact,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({phase:report.phase,diagnosticOnly:report.diagnosticOnly,passed:report.passed,failed:report.failed,notRun:report.groups.filter(group=>group.status==='NOTRUN').length,cleanup:report.cleanupFinal.status,fatal:report.fatal?.message??null,report:artifact}));
}
