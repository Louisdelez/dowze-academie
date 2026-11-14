/* NOT RUN by its author. Actual Desktop App, ServerSettings and native browser IDB.
 * The local-auth parent and Tauri IPC backend are explicit private seams;
 * declared changes GETs return synthetic HTTP 503 while discovery remains local.
 * Separate build/runtime retain the central guard and exact owned PID cleanup.
 * No native OS/auth/backend, physical input, SW or production-deployment claim.
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
const root=process.cwd(),cases=['current-blank-creation','retired-server-space-aba','profile-remount-control','unmount-control'];
const diagnosticCase=process.env.DOWZE_DESKTOP_NEW_NOTE_ONLY?.trim()||null;
if(diagnosticCase&&!cases.includes(diagnosticCase))throw Error('DOWZE_DESKTOP_NEW_NOTE_ONLY must name one exact declared library case.');
const args=process.argv.slice(2),buildPhase=args.includes('--build'),runPhase=args.includes('--run'),dirAt=args.indexOf('--bundle-dir'),bundleDir=dirAt>=0?args[dirAt+1]:undefined;
if(buildPhase===runPhase||!bundleDir||!isAbsolute(bundleDir)||args.some((arg,i)=>!['--build','--run','--bundle-dir'].includes(arg)&&i!==dirAt+1))throw Error('Use exactly --build or --run and --bundle-dir /absolute/new/private/directory.');
const artifact=mountedAuditPath(`n008-paper-desktop-new-note-browser-${buildPhase?'build':'runtime'}-20261015.json`),web=join(bundleDir,'web'),manifestPath=join(bundleDir,'manifest.json');
const desktopViewport={width:1440,height:900},desktopWindowConfig='src-tauri/tauri.conf.json';
const lifecycleBaseline={path:'tests/run-paper-library-tree-browser.mjs',sha256:'cc666295f9bbb4fb0797c36a2e1ac9fdbc6753d733bf6cba940dc844e9634303',blocks:['requireCentralGuard','procInfo','cgroupPids/discoverOwned/killOwned']};
const report={schema:1,kind:'paper-desktop-new-note-real-chromium',lifecycleBaseline,phase:buildPhase?'build':'runtime',startedAt:new Date().toISOString(),proofScope:'Actual Desktop App/ServerSettings and native browser IDB; synthetic authenticated-profile parent and Tauri IPC endpoint are declared seams. Exact scoped changes GETs return synthetic HTTP 503; discovery is a local fixture response and no publication IPC is accepted. No native OS window/authentication/backend/SW or actual network-failure claim.',diagnosticOnly:!!diagnosticCase,declaredGroups:buildPhase?1:cases.length,groupsStarted:0,fullSuite:false,availability:null,manifest:null,passed:0,failed:0,groups:[],cleanupFinal:{status:'NOTRUN'},finalFreeze:{status:'NOTRUN'},fatal:null};
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
 const previous=await readFile(join(root,lifecycleBaseline.path),'utf8'),current=await readFile(join(root,'tests/run-paper-desktop-new-note-browser.mjs'),'utf8');assert.equal(digest(previous),lifecycleBaseline.sha256,'The lifecycle reference must be the exact frozen N001 runner');
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
 const built=await build({configFile:false,publicDir:false,define:{'process.env.NODE_ENV':JSON.stringify('production')},esbuild:{jsx:'automatic'},plugins:[{name:'private-writing-pdf-worker-url',enforce:'pre',resolveId(id){if(id==='pdfjs-dist/build/pdf.worker.min.mjs?url')return virtualWorker;},load(id){if(id===virtualWorker)return 'export default "/pdf.worker.mjs";';},transform(_code,id){const clean=id.split('?')[0];if(isAbsolute(clean)&&clean.startsWith(root+sep)&&!clean.includes(sep+'node_modules'+sep))seenSources.add(relative(root,clean));}}],build:{outDir:web,emptyOutDir:false,copyPublicDir:false,assetsInlineLimit:0,target:'es2022',minify:false,sourcemap:false,reportCompressedSize:false,rollupOptions:{input:join(root,'tests/paper-desktop-new-note-browser-entry.tsx'),preserveEntrySignatures:'strict',output:{format:'es',entryFileNames:'entry.mjs',chunkFileNames:'chunks/[name]-[hash].mjs',assetFileNames:'assets/[name]-[hash][extname]'}}},logLevel:'error'});
 await writeFile(join(web,'pdf.worker.mjs'),await readFile(join(root,workerInput)));
 const sources=new Set([...seenSources,'tests/run-paper-desktop-new-note-browser.mjs','tests/paper-desktop-new-note-browser-entry.tsx',lifecycleBaseline.path,'tests/mounted-cleanup.mjs','package.json',desktopWindowConfig,'node_modules/playwright-core/types/protocol.d.ts',workerInput]);
 for(const result of Array.isArray(built)?built:[built])for(const chunk of result.output??[])if(chunk.type==='chunk')for(const id of Object.keys(chunk.modules)){const clean=id.split('?')[0];if(isAbsolute(clean)&&clean.startsWith(root+sep)&&!clean.includes(sep+'node_modules'+sep))sources.add(relative(root,clean));}
 const inputs={},outputs={};for(const path of [...sources].sort())inputs[path]=digest(await readFile(join(root,path)));for(const path of await files(web))outputs[relative(web,path)]=digest(await readFile(path));
 assert.ok(outputs['entry.mjs']);assert.ok(Object.keys(outputs).some(path=>path.endsWith('.css')),'Actual shared library CSS must be built');
 const manifest={schema:1,kind:'paper-desktop-new-note-browser-build',builtAt:new Date().toISOString(),inputs,outputs};await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');report.manifest={sha256:digest(await readFile(manifestPath)),inputFiles:Object.keys(inputs).length,bundleFiles:Object.keys(outputs).length};report.passed=1;report.groups=[{name:'Separate actual library fixture build',status:'PASS'}];report.buildComplete=true;
}
let verifiedManifestSHA;
async function verifyBundle(){
 const bytes=await readFile(manifestPath),manifestSHA=digest(bytes),manifest=JSON.parse(bytes.toString('utf8'));assert.equal(manifest.schema,1);assert.equal(manifest.kind,'paper-desktop-new-note-browser-build');
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
  dom=await bounded(record.page.evaluate(()=>({containerPresent:!!document.getElementById('actual-desktop-new-note'),libraryCount:document.querySelectorAll('.notebook-library').length,folderRows:document.querySelectorAll('.note-folder-row').length,source:window.__desktopNewNote?.state()?.source??null,fixtureError:window.__desktopNewNote?.state()?.nativeIPC?.errors??null})),'Bounded failed UI snapshot',600,true);
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
 record.page.on('requestfailed',request=>{const url=new URL(request.url());if(url.origin===origin){record.failedAssets.push({path:url.pathname.slice(0,180),resourceType:request.resourceType(),failure:String(request.failure()?.errorText??'').slice(0,120)});if(record.failedAssets.length>12)record.failedAssets.shift();}});
 await record.page.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===origin)return route.continue();record.networkRefused++;return route.abort('blockedbyclient');});
 await bounded(record.page.setViewportSize(desktopViewport),'Set the exact configured Desktop viewport',2000);assert.deepEqual(record.page.viewportSize(),desktopViewport);
 await bounded(record.page.goto(origin,{waitUntil:'load',timeout:15000}),'Open private fixture origin');
 await bounded(record.page.waitForFunction(()=>!!window.__desktopNewNote,null,{timeout:15000}),'Load actual browser fixture API');
 assert.deepEqual(record.pageErrors,[],'Actual browser module initialization must not fail');assert.equal(record.networkRefused,0,'The fixture must use only its private localhost origin');
 return record;
}

const requestHandlers=new Set(),httpErrors=[],httpSockets=new Set();
async function startServer(){
 const css=(await files(web)).filter(path=>path.endsWith('.css')).map(path=>'/'+relative(web,path).split(sep).join('/'));
 server=createServer((req,res)=>{let work;work=(async()=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);if(pathname==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+css.map(path=>'<link rel="stylesheet" href="'+path+'">').join('')+'<style>html,body{margin:0;min-height:100%}#actual-desktop-new-note{height:100vh}</style></head><body><script type="module" src="/entry.mjs"></script></body></html>');return;}
  const file=resolve(web,'.'+pathname);if(!file.startsWith(resolve(web)+sep)||(await stat(file)).isDirectory())throw Error('Outside private library bundle');res.writeHead(200,{'content-type':/\.m?js$/.test(file)?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'application/octet-stream','cache-control':'no-store'});res.end(await readFile(file));
 }catch{res.writeHead(404);res.end('Private fixture request refused');}})().catch(error=>{httpErrors.push(brief(error));}).finally(()=>requestHandlers.delete(work));requestHandlers.add(work);});server.on('connection',socket=>{httpSockets.add(socket);socket.once('close',()=>httpSockets.delete(socket));});await bounded(new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);}), 'Private library HTTP listener',3000);origin=`http://127.0.0.1:${server.address().port}`;
}
function phase(record,label){record.fixturePhase=label;record.phases.push({phase:label,at:new Date().toISOString()});if(record.phases.length>32)record.phases.shift();}
async function call(record,method,...args){record.lastFixtureMethod=method;return bounded(record.page.evaluate(({method,args})=>{const api=window.__desktopNewNote;if(!api||typeof api[method]!=='function')throw Error('Missing private library fixture method '+method);return api[method](...args);},{method,args}),'Actual library '+method);}

async function open(record,runId){
 phase(record,'initial/preload');await call(record,'preload');await record.page.context().setOffline(true);assert.equal(await record.page.evaluate(()=>navigator.onLine),false,'The real Desktop component must run native offline; no navigator property override');
 phase(record,'initial/start');await call(record,'start',runId);phase(record,'initial/library');await notes(record);phase(record,'initial/ready');await call(record,'ready',0);
}
async function notes(record){await record.page.getByRole('button',{name:'Mes notes',exact:true}).click();await record.page.locator('.notebook-library').waitFor({state:'visible',timeout:10000});}
async function changeSpace(record,index){
 phase(record,`space-${index}/settings`);await record.page.getByRole('button',{name:'Réglages',exact:true}).click();const options=(await call(record,'state')).scopeOptions;
 const field=record.page.getByRole('combobox',{name:'Année sur le serveur',exact:true});await field.waitFor({state:'visible',timeout:10000});phase(record,`space-${index}/choose`);await field.selectOption(options[index]);phase(record,`space-${index}/ready-settings`);await call(record,'ready',index);phase(record,`space-${index}/library`);await notes(record);phase(record,`space-${index}/ready-library`);await call(record,'ready',index);return (await call(record,'state')).source;
}
async function all(record){return call(record,'inventory');}
function sameScopes(actual,expected,message){assertExactBody(actual.scopes,expected.scopes,message+' (all native scope stores)');assertExactBody(actual.cache,expected.cache,message+' (entire native device cache)');}
async function currentCreation(record,runId){
 await open(record,runId);const before=await all(record),source=(await call(record,'state')).source;
 phase(record,'current/trusted-create');await record.page.getByRole('button',{name:'Nouvel onglet de note',exact:true}).click();phase(record,'current/blank-note');const created=await call(record,'blankNote');phase(record,'current/exact-inventory');const after=await all(record);assert.equal(created.source.workspaceToken,source.workspaceToken);assert.equal(created.scope.accountId,source.accountId);assert.equal(created.scope.spaceId,source.spaceId);assert.equal(created.metadata.markdown,'');assert.deepEqual(created.metadata.tags,[]);assert.deepEqual(created.metadata.subjectIds,[]);
 const old=JSON.parse(before.cache[source.metadataKey]),next=JSON.parse(after.cache[source.metadataKey]);assertExactBody(next,{...old,documents:[created.metadata,...old.documents],openDocumentIds:[...old.openDocumentIds,created.id],activeDocumentId:created.id},'A current creation adds only its new metadata and tab to the exact original cache row');
 assert.deepEqual(Object.keys(after.cache).sort(),Object.keys(before.cache).sort(),'A current new note cannot invent unrelated cache records');for(const key of Object.keys(before.cache))if(key!==source.metadataKey)assertExactBody(after.cache[key],before.cache[key],'Every other native cache record stays exact');
 assert.equal(after.scopes.length,before.scopes.length);for(let index=0;index<before.scopes.length;index++){
  const previous=before.scopes[index],latest=after.scopes[index];assertExactBody(latest.scope,previous.scope,'Scope identity/order remains exact');
  if(previous.scope.accountId!==source.accountId||previous.scope.spaceId!==source.spaceId){assertExactBody(latest,previous,'All foreign account/year graph/outbox/media/receipts stay exact');continue;}
  const additions=latest.drafts.filter(row=>!previous.drafts.some(old=>old.type===row.type&&old.documentId===row.documentId));assert.equal(additions.length,1,'External Desktop metadata authority adds exactly one native canonical graph');const graph=additions[0];assert.equal(graph.type,'whiteboard');assert.equal(graph.content.noteId,created.id);assert.equal(graph.content.pages.length,1);assert.deepEqual(graph.content.assets,[]);assert.deepEqual(graph.content.audio,[]);assert.ok(graph.content.objects.every(object=>object.kind==='text'&&object.markdown===''),'A blank Desktop graph cannot borrow another note object');
  assertExactBody(latest.drafts.filter(row=>!additions.includes(row)),previous.drafts,'All earlier draft rows remain exact');assertExactBody(latest.queue,previous.queue,'Current creation leaves all earlier native outbox rows exact');assertExactBody(latest.files,previous.files,'Current creation leaves every original byte association exact');
  const oldRows=new Map(previous.snapshots.map(row=>[row.key,row])),extra=latest.snapshots.filter(row=>!oldRows.has(row.key));for(const[key,row]of oldRows)assertExactBody(latest.snapshots.find(value=>value.key===key),row,'Every prior recovery receipt remains exact');
  assert.equal(extra.length,4,'Only four new blank-note source receipts may appear');assert.deepEqual(extra.map(row=>row.key.split('|')[0]).sort(),['paper-history','paper-legacy-observation','paper-legacy-recovery','paper-migration']);
  for(const row of extra){assert.equal(row.accountId,source.accountId);assert.equal(row.spaceId,source.spaceId);assert.ok(row.key.startsWith(row.key.split('|')[0]+'|'+source.accountId+'|'+source.spaceId+'|whiteboard|'+graph.documentId),'Each new recovery receipt proves its entire owner/new-note key');assert.equal(row.value.noteId,created.id);if(row.value.incoming){assertExactBody(row.value.incoming,{markdown:'',board:null},'Initial recovered sources are exactly blank');assert.deepEqual(row.value.fileIds,[]);assert.equal(row.value.previousReceipt,null);}if('sourceMetadata'in row.value)assert.equal(row.value.sourceMetadata,null,'Desktop cache metadata is external; no borrowed IDB metadata source is allowed');}
 }
 return {actualDesktopApp:true,nativeIndexedDB:true,nativeOffline:true,actualTrustedButton:true,newBlankNote:true,allForeignStoresExact:true,newID:created.id,source:created.source};
}
async function retired(record,runId,kind){
 await open(record,runId);const captured=await call(record,'capture');assert.ok(captured.source);
 if(kind==='space'){await changeSpace(record,1);await changeSpace(record,0);const current=(await call(record,'state')).source;assert.equal(current.workspaceToken,captured.source.workspaceToken,'The real App must retain the same workspace while only the compatible server-space choice changes');assert.ok(current.epoch>=captured.source.epoch+2,'The real server-space A-B-A must cross irreversible notebook epochs');assert.equal(current.metadataKey,captured.source.metadataKey);}
 else if(kind==='profile'){await call(record,'showProfile','b');await call(record,'showProfile','a');await notes(record);await call(record,'ready',0);assert.notEqual((await call(record,'state')).source.workspaceToken,captured.source.workspaceToken,'Actual parent keying must remount the workspace for another local profile');}
 else await call(record,'unmount');
 phase(record,`${kind}/baseline-before-old-callback`);const before=await all(record),view=(await call(record,'state')).view;phase(record,`${kind}/invoke-old-callback`);const invocation=await call(record,'invokeCaptured',captured.id);if(kind!=='unmount'){phase(record,`${kind}/ready-after-old-callback`);await call(record,'ready',0);}phase(record,`${kind}/exact-old-callback-oracle`);sameScopes(await all(record),before,'A retired actual creation callback must admit no device-cache/IDB/outbox/recovery write');assertExactBody((await call(record,'state')).view,view,'A retired callback must not select a tab or publish a notice');
 if(kind!=='unmount'){phase(record,`${kind}/fresh-trusted-create`);await record.page.getByRole('button',{name:'Nouvel onglet de note',exact:true}).click();phase(record,`${kind}/fresh-blank-note`);await call(record,'blankNote');}else assert.equal(await record.page.locator('.app-shell').count(),0);
 return {actualRetainedCommittedCallback:true,deliverySeam:'Explicit invocation of the original mounted DOM onClick',transition:kind,source:captured.source,observedCurrent:invocation.current,zeroOldAdmission:true,freshRetry:kind!=='unmount',nativeOffline:await record.page.evaluate(()=>navigator.onLine===false)};
}
async function desktopFailureState(record){const common=await failureState(record);if(!record?.page||record.page.isClosed()||!record.browser?.isConnected())return common;let state;try{state=await bounded(record.page.evaluate(()=>window.__desktopNewNote?.state()),'Bounded Desktop source/IPC diagnostics',700,true);}catch(error){state={error:privateBrief(error,[record])};}return {...common,fixturePhase:record.fixturePhase??null,lastFixtureMethod:record.lastFixtureMethod??null,phases:record.phases,failedAssets:record.failedAssets,state:privateValue(state,[record])};}
async function cleanupGroup(){const errors=[];for(const record of [...owned])try{await killOwned(record);}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Private library browser cleanup failed');}
async function runBrowser(){
 await verifyBundle();try{playwright=await import('playwright');}catch(error){report.availability={status:'NOTRUN',reason:'Existing Playwright unavailable',error:brief(error)};return;}
 const executable=process.env.DOWZE_CRASH_CHROMIUM_PATH||playwright.chromium.executablePath();assert.ok(isAbsolute(executable));try{await access(executable,constants.X_OK);}catch{report.availability={status:'NOTRUN',reason:'Existing Chromium executable unavailable; no download'};return;}
 report.availability={status:'AVAILABLE',executable:executable.split(sep).at(-1),executed:false};workDir=await mkdtemp(join(tmpdir(),'dowze-desktop-new-note-browser-'));await writeFile(join(workDir,'.owned-synthetic-browser-profiles'),'private synthetic library profiles only\n');await startServer();
 for(const name of cases){
  if(diagnosticCase&&name!==diagnosticCase){report.groups.push({name,status:'NOTRUN',reason:'Diagnostic exact library case'});continue;}
  if(Date.now()>=deadline)throw Error('Library tree global deadline exhausted before next group');const profile=await mkdtemp(join(workDir,'profile-'));profiles.add(profile);let first=null,current=null,result;report.groupsStarted++;
  try{
   first=await launch(profile,executable,'library-'+name);current=first;report.availability.executed=true;const version=first.browser.version(),runId=randomUUID();let evidence;
   if(name==='current-blank-creation')evidence=await currentCreation(first,runId);else evidence=await retired(first,runId,name==='retired-server-space-aba'?'space':name==='profile-remount-control'?'profile':'unmount');
   const fixtureCleanup=await call(current,'cleanup');assert.equal(fixtureCleanup.appNodes,0);assert.equal(fixtureCleanup.pendingNativeIPC,0);assert.equal(fixtureCleanup.nativeListeners,0);assert.equal(fixtureCleanup.nativeCallbacks,0);assert.equal(fixtureCleanup.pendingWriters,false);assert.deepEqual(current.pageErrors,[]);assert.equal(current.networkRefused,0);result={name,status:'PASS',browserVersion:version,evidence,fixtureCleanup};report.passed++;
  }catch(error){result={name,status:'FAIL',error:privateBrief(error,[first,current]),diagnostics:await desktopFailureState(current??first)};report.failed++;console.error(name+': FAIL '+result.error.message);}
  finally{
   if(result)report.groups.push(result);try{await cleanupGroup();await rm(profile,{recursive:true,force:true});profiles.delete(profile);if(result)result.cleanup={status:'PASS'};}catch(error){if(result){result.cleanup={status:'FAIL',error:brief(error)};if(result.status==='PASS'){result.bodyStatus='PASS';result.status='FAIL';report.passed--;report.failed++;}}throw error;}
  }
  console.log(name+': '+result.status);
 }
}
try{await verifyLifecycleBaseline();await requireCentralGuard();await verifyDesktopViewport();if(buildPhase)await buildBundle();else await runBrowser();}
catch(error){report.fatal=brief(error);console.error('Library tree browser recipe failed: '+report.fatal.message);process.exitCode=1;}
finally{
 const errors=[];try{await cleanupGroup();}catch(error){errors.push(error);}if(server)try{server.closeAllConnections();await bounded(new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve())),'Library private HTTP cleanup',3000,true);await bounded((async()=>{while(requestHandlers.size)await Promise.allSettled([...requestHandlers]);})(),'Drain actual HTTP request handlers',3000,true);await bounded((async()=>{while(httpSockets.size)await sleep(10);})(),'Observe native HTTP sockets closed',1000,true);assert.equal(requestHandlers.size,0);assert.equal(httpSockets.size,0);assert.deepEqual(httpErrors,[]);}catch(error){errors.push(error);}
 if(owned.size===0){for(const profile of profiles)try{await rm(profile,{recursive:true,force:true});profiles.delete(profile);}catch(error){errors.push(error);}if(workDir)try{await rm(workDir,{recursive:true,force:true});}catch(error){errors.push(error);}}
 report.cleanupFinal=errors.length?{status:'FAIL',error:brief(new AggregateError(errors,'Final library tree cleanup failed'))}:{status:'PASS',remainingOwnedBrowsers:owned.size,remainingProfiles:profiles.size,httpListening:server?.listening??false,pendingHTTPHandlers:requestHandlers.size,openHTTPSockets:httpSockets.size};if(errors.length)process.exitCode=1;
 try{await verifyBundle();report.finalFreeze={status:'PASS',...report.manifest};}catch(error){report.finalFreeze={status:'FAIL',error:brief(error)};process.exitCode=1;}
 if(runPhase){const attempted=new Set(report.groups.map(group=>group.name));for(const name of cases)if(!attempted.has(name))report.groups.push({name,status:'NOTRUN',reason:report.availability?.reason??'Earlier fatal or cleanup failure'});report.allGroupsAttempted=report.groupsStarted===cases.length;report.fullSuite=!diagnosticCase&&report.groupsStarted===cases.length&&report.passed===cases.length&&!report.failed&&!report.fatal&&report.cleanupFinal.status==='PASS'&&report.finalFreeze.status==='PASS';report.diagnosticPassed=!!diagnosticCase&&report.groupsStarted===1&&report.passed===1&&!report.failed&&!report.fatal&&report.cleanupFinal.status==='PASS'&&report.finalFreeze.status==='PASS';if(!report.fullSuite&&!report.diagnosticPassed)process.exitCode||=report.availability?.status==='NOTRUN'?2:1;}
 report.finishedAt=new Date().toISOString();await mkdir(dirname(artifact),{recursive:true});await writeFile(artifact,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({phase:report.phase,passed:report.passed,failed:report.failed,notRun:report.groups.filter(group=>group.status==='NOTRUN').length,fullSuite:report.fullSuite,diagnosticPassed:report.diagnosticPassed??false,cleanup:report.cleanupFinal.status,finalFreeze:report.finalFreeze.status,fatal:report.fatal?.message??null,report:artifact}));
}

