/* Source candidate, not executed by its author. Actual library navigation, native Chromium DOM/IDB.
 * Separate build/runtime under the unchanged central guard; data-only fixture.
 * Owner/API callbacks are desired regressions: current source lacks a lease.
 * No browser download, product mutation, physical input or full App claim.
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
const root=process.cwd(),cases=['desktop-1440','phone-390','tablet-1024'];
const diagnosticCase=process.env.DOWZE_LIBRARY_NAVIGATION_ONLY?.trim()||null;
if(diagnosticCase&&!cases.includes(diagnosticCase))throw Error('DOWZE_LIBRARY_NAVIGATION_ONLY must name one exact declared library case.');
const args=process.argv.slice(2),buildPhase=args.includes('--build'),runPhase=args.includes('--run'),dirAt=args.indexOf('--bundle-dir'),bundleDir=dirAt>=0?args[dirAt+1]:undefined;
if(buildPhase===runPhase||!bundleDir||!isAbsolute(bundleDir)||args.some((arg,i)=>!['--build','--run','--bundle-dir'].includes(arg)&&i!==dirAt+1))throw Error('Use exactly --build or --run and --bundle-dir /absolute/new/private/directory.');
const artifact=mountedAuditPath(`n001-paper-library-navigation-browser-${buildPhase?'build':'runtime'}-20261015.json`),web=join(bundleDir,'web'),manifestPath=join(bundleDir,'manifest.json');
const lifecycleBaseline={"source":"tests/run-paper-library-tree-browser.mjs","sourceSha256":"cc666295f9bbb4fb0797c36a2e1ac9fdbc6753d733bf6cba940dc844e9634303","byteIdenticalBlocks":{"async function requireCentralGuard":"31e0457b71367204b6260f829f32bbc2dc1243bf6a4ec9cefa4b7fcb748347b4","async function procInfo":"5e52fea8e6c2ba23705b513a70da69497b204e4d581158bfab3f08f350287ab3","async function cgroupPids":"b882578b3f16dfdcee9c1391f52d6fa114dde2aa526965703110d47a5fe082d9"}};
const report={schema:1,lifecycleBaseline,kind:'paper-library-navigation-real-chromium',phase:buildPhase?'build':'runtime',startedAt:new Date().toISOString(),proofScope:'Actual shared library/hooks/CSS and production storage in native Chromium DOM/IndexedDB at three viewport sizes. Private owner/note-content route and DOM scroll positioning are explicit automation seams. UI work is native offline; only the private bundle reload is online. No full App/editor, physical device, native IPC, SW or cloud synchronization claim.',diagnosticOnly:!!diagnosticCase,declaredGroups:buildPhase?1:cases.length,groupsStarted:0,fullSuite:false,availability:null,manifest:null,passed:0,failed:0,groups:[],cleanupFinal:{status:'NOTRUN'},finalFreeze:{status:'NOTRUN'},fatal:null};
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
 report.groupsStarted=1;await mkdir(bundleDir);await writeFile(join(bundleDir,'.owned-library-tree-build'),'private synthetic library fixture only\n');
 const {build}=await import('vite'),virtualWorker='\0private-writing-worker-url',workerInput='node_modules/pdfjs-dist/build/pdf.worker.min.mjs',seenSources=new Set();
 const built=await build({configFile:false,publicDir:false,define:{'process.env.NODE_ENV':JSON.stringify('production')},esbuild:{jsx:'automatic'},plugins:[{name:'private-writing-pdf-worker-url',enforce:'pre',resolveId(id){if(id==='pdfjs-dist/build/pdf.worker.min.mjs?url')return virtualWorker;},load(id){if(id===virtualWorker)return 'export default "/pdf.worker.mjs";';},transform(_code,id){const clean=id.split('?')[0];if(isAbsolute(clean)&&clean.startsWith(root+sep)&&!clean.includes(sep+'node_modules'+sep))seenSources.add(relative(root,clean));}}],build:{lib:{entry:join(root,'tests/paper-library-navigation-browser-entry.tsx'),formats:['es'],fileName:()=> 'entry.mjs'},outDir:web,emptyOutDir:false,copyPublicDir:false,target:'es2022',minify:false,sourcemap:false,reportCompressedSize:false,rollupOptions:{output:{entryFileNames:'entry.mjs',chunkFileNames:'chunks/[name]-[hash].mjs'}}},logLevel:'error'});
 await writeFile(join(web,'pdf.worker.mjs'),await readFile(join(root,workerInput)));
 const sources=new Set([...seenSources,'tests/run-paper-library-navigation-browser.mjs','tests/paper-library-navigation-browser-entry.tsx','tests/mounted-cleanup.mjs','package.json','node_modules/playwright-core/types/protocol.d.ts',workerInput]);
 for(const result of Array.isArray(built)?built:[built])for(const chunk of result.output??[])if(chunk.type==='chunk')for(const id of Object.keys(chunk.modules)){const clean=id.split('?')[0];if(isAbsolute(clean)&&clean.startsWith(root+sep)&&!clean.includes(sep+'node_modules'+sep))sources.add(relative(root,clean));}
 const inputs={},outputs={};for(const path of [...sources].sort())inputs[path]=digest(await readFile(join(root,path)));for(const path of await files(web))outputs[relative(web,path)]=digest(await readFile(path));
 assert.ok(outputs['entry.mjs']);assert.ok(Object.keys(outputs).some(path=>path.endsWith('.css')),'Actual shared library CSS must be built');
 const manifest={schema:1,kind:'paper-library-navigation-browser-build',builtAt:new Date().toISOString(),inputs,outputs};await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');report.manifest={sha256:digest(await readFile(manifestPath)),inputFiles:Object.keys(inputs).length,bundleFiles:Object.keys(outputs).length};report.passed=1;report.groups=[{name:'Separate actual library fixture build',status:'PASS'}];report.buildComplete=true;
}
let verifiedManifestSHA;
async function verifyBundle(){
 const bytes=await readFile(manifestPath),manifestSHA=digest(bytes),manifest=JSON.parse(bytes.toString('utf8'));assert.equal(manifest.schema,1);assert.equal(manifest.kind,'paper-library-navigation-browser-build');
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
  dom=await bounded(record.page.evaluate(()=>({containerPresent:!!document.getElementById('actual-library-navigation'),libraryCount:document.querySelectorAll('.notebook-library').length,folderRows:document.querySelectorAll('.note-folder-row').length,source:window.__paperLibraryNavigation?.state()?.source??null,fixtureError:window.__paperLibraryNavigation?.state()?.controlError??null})),'Bounded failed UI snapshot',600,true);
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
 await bounded(record.page.waitForFunction(()=>!!window.__paperLibraryNavigation,null,{timeout:15000}),'Load actual browser fixture API');
 assert.deepEqual(record.pageErrors,[],'Actual browser module initialization must not fail');assert.equal(record.networkRefused,0,'The fixture must use only its private localhost origin');
 return record;
}

const requestHandlers=new Set(),httpErrors=[],httpSockets=new Set();
async function startServer(){
 const css=(await files(web)).filter(path=>path.endsWith('.css')).map(path=>'/'+relative(web,path).split(sep).join('/'));
 server=createServer((req,res)=>{let work;work=(async()=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);if(pathname==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+css.map(path=>'<link rel="stylesheet" href="'+path+'">').join('')+'<style>html,body{margin:0;min-height:100%}#actual-library-navigation{height:100vh}</style></head><body><script type="module" src="/entry.mjs"></script></body></html>');return;}
  const file=resolve(web,'.'+pathname);if(!file.startsWith(resolve(web)+sep)||(await stat(file)).isDirectory())throw Error('Outside private library bundle');res.writeHead(200,{'content-type':/\.m?js$/.test(file)?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'application/octet-stream','cache-control':'no-store'});res.end(await readFile(file));
 }catch{res.writeHead(404);res.end('Private fixture request refused');}})().catch(error=>{httpErrors.push(brief(error));}).finally(()=>requestHandlers.delete(work));requestHandlers.add(work);});server.on('connection',socket=>{httpSockets.add(socket);socket.once('close',()=>httpSockets.delete(socket));});await bounded(new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);}), 'Private library HTTP listener',3000);origin=`http://127.0.0.1:${server.address().port}`;
}
async function call(record,method,...args){record.fixturePhase=method;return bounded(record.page.evaluate(({method,args})=>{const api=window.__paperLibraryNavigation;if(!api||typeof api[method]!=='function')throw Error('Missing private library fixture method '+method);return api[method](...args);},{method,args}),'Actual library '+method);}
async function open(record,runId,reopen=false){await call(record,'start',runId,reopen);await record.page.locator('.notebook-library').waitFor({state:'visible',timeout:10000});}
async function waitFor(record,check,arg,label){return bounded(record.page.waitForFunction(check,arg,{timeout:10000}),label,11000);}
const viewportSizes={'desktop-1440':{width:1440,height:900},'phone-390':{width:390,height:844},'tablet-1024':{width:1024,height:768}};
const articleIDs=record=>record.page.locator('[data-library-note-id]').evaluateAll(nodes=>nodes.map(node=>node.dataset.libraryNoteId));
const selectedIDs=record=>record.page.locator('[data-library-note-id] input[type="checkbox"]:checked').evaluateAll(nodes=>nodes.map(node=>node.closest('[data-library-note-id]').dataset.libraryNoteId));
async function frames(record){await bounded(record.page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));}),'Read native layout after the committed UI',3000);}
async function anchor(record,id=null){return bounded(record.page.evaluate(id=>{
 const main=document.querySelector('.note-library-main'),toolbar=main?.querySelector('.note-library-controls');if(!main||!toolbar)throw Error('Actual scrollport/toolbar missing');const bounds=main.getBoundingClientRect(),bar=toolbar.getBoundingClientRect(),top=Math.max(bounds.top,Math.min(bounds.bottom,bar.bottom));
 const cards=[...main.querySelectorAll('[data-library-note-id]')],card=id?cards.find(card=>card.dataset.libraryNoteId===id):cards.find(card=>{const box=card.getBoundingClientRect();return box.bottom>top&&box.top<bounds.bottom;});if(!card)throw Error('Visible native card anchor missing');const box=card.getBoundingClientRect();return {id:card.dataset.libraryNoteId,offset:box.top-top,scrollTop:main.scrollTop,visibleTop:top,visibleBottom:bounds.bottom,cardTop:box.top,cardBottom:box.bottom,toolbar:{top:bar.top,bottom:bar.bottom,height:bar.height},viewport:{width:innerWidth,height:innerHeight}};
 },id),'Actual Chromium scroll/card rectangles',3000);}
function sameAnchor(actual,expected,label){assert.equal(actual.id,expected.id,label+': exact card identity');assert.ok(Math.abs(actual.offset-expected.offset)<=2,label+': native offset changed '+JSON.stringify({id:actual.id,before:expected.offset,after:actual.offset}));assert.ok(actual.scrollTop>0,label+': nonzero real scroll must survive');assert.ok(actual.cardBottom>actual.visibleTop&&actual.cardTop<actual.visibleBottom,label+': the card cannot be hidden by the sticky toolbar');}
async function clickMode(record,label){const button=record.page.getByRole('button',{name:label,exact:true}),box=await button.boundingBox(),height=await record.page.evaluate(()=>innerHeight);assert.ok(box&&box.y>=0&&box.y+box.height<=height,'Sticky mode control must be genuinely visible before the ordinary native click');await button.click({timeout:5000});await frames(record);}
async function inventories(record){return Object.fromEntries(await Promise.all(['a1','a2','b1'].map(async selection=>[selection,await call(record,'inventory',selection)])));}
async function unchangedInventories(record,before){for(const selection of ['a1','a2','b1'])assertExactBody(await call(record,'inventory',selection),before[selection],'Every original canonical graph/metadata/classification/history/outbox/media stays exact: '+selection);}
async function navigationScenario(record,runId,size){
 await record.page.setViewportSize(size);await open(record,runId);await frames(record);const original=await inventories(record),context=record.page.context();await context.setOffline(true);assert.equal(await record.page.evaluate(()=>navigator.onLine),false,'Native UI work runs offline, no navigator spoof');assert.deepEqual(await articleIDs(record),Array.from({length:60},(_,i)=>59-i).filter(i=>i!==52&&i!==58).map(i=>'n'+String(i).padStart(2,'0')));
 const folder=record.page.locator('.note-folder-row > button').filter({has:record.page.locator('span').filter({hasText:/^Dossier de recette$/})});await folder.click();await record.page.getByRole('searchbox',{name:'Rechercher mes notes',exact:true}).fill('CARNET');await record.page.getByRole('combobox',{name:'Trier les notes',exact:true}).selectOption('title');await frames(record);const ordered=Array.from({length:50},(_,i)=>'n'+String(i).padStart(2,'0'));assert.deepEqual(await articleIDs(record),ordered);assert.equal(await record.page.locator('[data-library-note-id^="foreign-"]').count(),0);await record.page.locator('[data-library-note-id="n20"] input[type="checkbox"]').check();assert.deepEqual(await selectedIDs(record),['n20']);
 // The DOM scroll API positions a real element; rectangles, scroll events,
 // CSS and subsequent user clicks are Chromium-native, never fabricated.
 await frames(record);await record.page.locator('.note-library-main').evaluate(main=>{if(main.scrollHeight-main.clientHeight<=500)throw Error('The actual card collection must have a nontrivial native scroll range');main.scrollTop=Math.max(500,main.scrollTop);});await frames(record);const setup=await record.page.locator('.note-library-main').evaluate(main=>{const card=main.querySelector('[data-library-note-id="n20"]'),bar=main.querySelector('.note-library-controls');if(!card||!bar)throw Error('Actual card/toolbar missing');const target=card.getBoundingClientRect(),toolbar=bar.getBoundingClientRect(),top=Math.max(main.getBoundingClientRect().top,toolbar.bottom),previous=[...main.querySelectorAll('[data-library-note-id]')].map(node=>node.getBoundingClientRect()).filter(box=>box.top<target.top-.5&&box.bottom<=target.top),previousBottom=previous.length?Math.max(...previous.map(box=>box.bottom)):target.top,gap=Math.max(0,target.top-previousBottom),inset=Math.min(4,gap/2),before=main.scrollTop;main.scrollTop+=target.top-top-inset;return {target:'n20',before,after:main.scrollTop,gap,inset,toolbar:{top:toolbar.top,bottom:toolbar.bottom,position:getComputedStyle(bar).position},targetTopBefore:target.top,visibleTopBefore:top};});record.fixtureSetup=setup;assert.equal(setup.toolbar.position,'sticky');await frames(record);const grid=await anchor(record);assert.ok(grid.scrollTop>0);assert.ok(grid.offset>=0,'The chosen first card must be below, not behind, the sticky toolbar');assert.deepEqual(grid.viewport,size);
 await clickMode(record,'Vue liste');const list=await anchor(record,grid.id);sameAnchor(list,grid,'Grid to list');assert.deepEqual(await articleIDs(record),ordered);assert.deepEqual(await selectedIDs(record),['n20']);await clickMode(record,'Vue grille');sameAnchor(await anchor(record,grid.id),grid,'List to grid');await clickMode(record,'Vue liste');const beforeOpen=await anchor(record,grid.id);sameAnchor(beforeOpen,grid,'Second list projection');
 await record.page.locator('[data-library-note-id="'+grid.id+'"] .note-card-open').click();await record.page.getByRole('region',{name:'Note de recette N005',exact:true}).waitFor({state:'visible',timeout:5000});assert.equal(await record.page.locator('.notebook-library').count(),0,'The route really unmounts the shared library');const saved=await call(record,'state');assert.equal(saved.view.mode,'list');assert.equal(saved.view.filter,'folder-main');assert.equal(saved.view.query,'CARNET');assert.deepEqual(saved.view.picked,['n20']);assert.equal(saved.view.main.anchorId,grid.id);
 await record.page.getByRole('button',{name:'Retour à la bibliothèque',exact:true}).click();await call(record,'ready');await frames(record);sameAnchor(await anchor(record,grid.id),beforeOpen,'Return from real library unmount');assert.equal(await record.page.getByRole('searchbox',{name:'Rechercher mes notes',exact:true}).inputValue(),'CARNET');assert.equal(await record.page.locator('.note-library-heading h1').textContent(),'Dossier de recette');assert.deepEqual(await selectedIDs(record),['n20']);assert.deepEqual(await articleIDs(record),ordered);await unchangedInventories(record,original);
 const beforeReload=await anchor(record,grid.id),sameOrigin=record.page.url(),oldCleanup=await call(record,'cleanup');assert.equal(oldCleanup.libraryNodes,0);await context.setOffline(false);await bounded(record.page.reload({waitUntil:'load',timeout:15000}),'Native reload of private localhost bundle, same origin/profile');assert.equal(record.page.url(),sameOrigin);await bounded(record.page.waitForFunction(()=>!!window.__paperLibraryNavigation,null,{timeout:10000}),'Reloaded actual fixture module');await open(record,runId,true);await context.setOffline(true);assert.equal(await record.page.evaluate(()=>navigator.onLine),false);await frames(record);sameAnchor(await anchor(record,grid.id),beforeReload,'Native reload without RAM reseed');assert.deepEqual(await selectedIDs(record),['n20']);assert.equal(await record.page.getByRole('searchbox',{name:'Rechercher mes notes',exact:true}).inputValue(),'CARNET');assert.equal(await record.page.locator('.note-library-heading h1').textContent(),'Dossier de recette');assert.deepEqual(await articleIDs(record),ordered);assert.equal(await record.page.getByRole('combobox',{name:'Trier les notes',exact:true}).inputValue(),'title');await unchangedInventories(record,original);
 await record.page.getByRole('searchbox',{name:'Rechercher mes notes',exact:true}).fill('');await record.page.getByRole('button',{name:'Récentes',exact:true}).click();await frames(record);const recent=Array.from({length:60},(_,i)=>59-i).filter(i=>i!==52&&i!==58).slice(0,30).map(i=>'n'+String(i).padStart(2,'0'));assert.deepEqual(await articleIDs(record),recent);assert.equal(new Set(recent).size,30);assert.equal(await record.page.getByRole('combobox',{name:'Trier les notes',exact:true}).isDisabled(),true);assert.match(await record.page.locator('.note-library-heading').textContent(),/30 dernières notes modifiées, hors corbeille/);assert.deepEqual(await selectedIDs(record),[],'Switching collections never carries an unrelated bulk proposal');await record.page.locator('[data-library-note-id="n59"] input[type="checkbox"]').check();assert.deepEqual(await selectedIDs(record),['n59']);assert.equal(await record.page.locator('[data-library-note-id="n58"],[data-library-note-id="n52"],[data-library-note-id^="foreign-"]').count(),0);assert.equal((await call(record,'state')).sort.sort,'title','The normal sort remains durably intact while Recent uses activity');
 await call(record,'show','b1');await frames(record);assert.deepEqual(await articleIDs(record),['foreign-b1']);assert.deepEqual(await selectedIDs(record),[]);assert.equal(await record.page.getByRole('searchbox',{name:'Rechercher mes notes',exact:true}).inputValue(),'');assert.equal(await record.page.getByRole('button',{name:'Vue grille',exact:true}).getAttribute('aria-pressed'),'true');await call(record,'show','a2');await frames(record);assert.deepEqual(await articleIDs(record),['foreign-a2']);assert.deepEqual(await selectedIDs(record),[]);await call(record,'show','a1');await frames(record);assert.deepEqual(await articleIDs(record),recent);assert.deepEqual(await selectedIDs(record),['n59']);assert.equal(await record.page.locator('[data-library-note-id^="foreign-"]').count(),0);await record.page.getByRole('button',{name:'Toutes les notes',exact:true}).click();assert.equal(await record.page.getByRole('combobox',{name:'Trier les notes',exact:true}).inputValue(),'title');assert.equal(await record.page.getByRole('combobox',{name:'Trier les notes',exact:true}).isEnabled(),true);await unchangedInventories(record,original);
 return {viewport:size,setup,nativeDOMAndIndexedDB:true,actualSharedCSSAndControls:true,ordinaryVisibleStickyButtonClicks:true,DOMScrollPositioningExplicit:true,grid,list,beforeOpen,beforeReload,selection:['n20'],recentCount:recent.length,activityDefinition:'30 newest unique updatedAt values, excluding trash',nativeReloadSameOriginAndProfile:true,reopenNeverSeeds:true,canonicalAndForeignScopeExact:true,offlineDuringUI:true,onlineOnlyForPrivateBundleReload:true,controlledNoteRoute:true,fullAppOrPhysicalDevice:false};
}
async function libraryFailureState(record){const common=await failureState(record);if(!record?.page||record.page.isClosed()||!record.browser?.isConnected())return common;let state;try{state=await bounded(record.page.evaluate(()=>{const main=document.querySelector('.note-library-main'),bar=main?.querySelector('.note-library-controls'),bounds=main?.getBoundingClientRect(),toolbar=bar?.getBoundingClientRect(),clip=Math.max(bounds?.top??0,toolbar?.bottom??0);return {state:window.__paperLibraryNavigation?.state()??null,viewport:{width:innerWidth,height:innerHeight},main:main?{scrollTop:main.scrollTop,scrollHeight:main.scrollHeight,clientHeight:main.clientHeight,top:bounds.top,bottom:bounds.bottom}:null,toolbar:bar?{top:toolbar.top,bottom:toolbar.bottom,height:toolbar.height,position:getComputedStyle(bar).position}:null,visibleCards:main?[...main.querySelectorAll('[data-library-note-id]')].flatMap(card=>{const box=card.getBoundingClientRect();return box.bottom>clip&&box.top<(bounds?.bottom??0)?[{id:card.dataset.libraryNoteId,top:box.top,bottom:box.bottom}]:[];}).slice(0,8):[]};}),'Bounded navigation diagnostics',700,true);}catch(error){state={error:privateBrief(error,[record])};}return {...common,fixturePhase:record.fixturePhase??null,setup:record.fixtureSetup??null,state};}
async function cleanupGroup(){const errors=[];for(const record of [...owned])try{await killOwned(record);}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Private library browser cleanup failed');}
async function runBrowser(){
 await verifyBundle();try{playwright=await import('playwright');}catch(error){report.availability={status:'NOTRUN',reason:'Existing Playwright unavailable',error:brief(error)};return;}
 const executable=process.env.DOWZE_CRASH_CHROMIUM_PATH||playwright.chromium.executablePath();assert.ok(isAbsolute(executable));try{await access(executable,constants.X_OK);}catch{report.availability={status:'NOTRUN',reason:'Existing Chromium executable unavailable; no download'};return;}
 report.availability={status:'AVAILABLE',executable:executable.split(sep).at(-1),executed:false};workDir=await mkdtemp(join(tmpdir(),'dowze-library-tree-browser-'));await writeFile(join(workDir,'.owned-synthetic-browser-profiles'),'private synthetic library profiles only\n');await startServer();
 for(const name of cases){
  if(diagnosticCase&&name!==diagnosticCase){report.groups.push({name,status:'NOTRUN',reason:'Diagnostic exact library case'});continue;}
  if(Date.now()>=deadline)throw Error('Library navigation global deadline exhausted before next group');const profile=await mkdtemp(join(workDir,'profile-'));profiles.add(profile);let first=null,current=null,result;report.groupsStarted++;
  try{
   first=await launch(profile,executable,'library-'+name);current=first;report.availability.executed=true;const version=first.browser.version(),runId=randomUUID();let evidence;
   evidence=await navigationScenario(first,runId,viewportSizes[name]);
   const fixtureCleanup=await call(current,'cleanup');assert.equal(fixtureCleanup.libraryNodes,0);assert.deepEqual(current.pageErrors,[]);assert.equal(current.networkRefused,0);result={name,status:'PASS',browserVersion:version,evidence,fixtureCleanup};report.passed++;
  }catch(error){result={name,status:'FAIL',error:privateBrief(error,[first,current]),diagnostics:await libraryFailureState(current??first)};report.failed++;console.error(name+': FAIL '+result.error.message);}
  finally{
   if(result)report.groups.push(result);try{await cleanupGroup();await rm(profile,{recursive:true,force:true});profiles.delete(profile);if(result)result.cleanup={status:'PASS'};}catch(error){if(result){result.cleanup={status:'FAIL',error:brief(error)};if(result.status==='PASS'){result.bodyStatus='PASS';result.status='FAIL';report.passed--;report.failed++;}}throw error;}
  }
  console.log(name+': '+result.status);
 }
}
try{await requireCentralGuard();if(buildPhase)await buildBundle();else await runBrowser();}
catch(error){report.fatal=brief(error);console.error('Library navigation browser recipe failed: '+report.fatal.message);process.exitCode=1;}
finally{
 const errors=[];try{await cleanupGroup();}catch(error){errors.push(error);}if(server)try{server.closeAllConnections();await bounded(new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve())),'Library private HTTP cleanup',3000,true);await bounded((async()=>{while(requestHandlers.size)await Promise.allSettled([...requestHandlers]);})(),'Drain actual HTTP request handlers',3000,true);await bounded((async()=>{while(httpSockets.size)await sleep(10);})(),'Observe native HTTP sockets closed',1000,true);assert.equal(requestHandlers.size,0);assert.equal(httpSockets.size,0);assert.deepEqual(httpErrors,[]);}catch(error){errors.push(error);}
 if(owned.size===0){for(const profile of profiles)try{await rm(profile,{recursive:true,force:true});profiles.delete(profile);}catch(error){errors.push(error);}if(workDir)try{await rm(workDir,{recursive:true,force:true});}catch(error){errors.push(error);}}
 report.cleanupFinal=errors.length?{status:'FAIL',error:brief(new AggregateError(errors,'Final library navigation cleanup failed'))}:{status:'PASS',remainingOwnedBrowsers:owned.size,remainingProfiles:profiles.size,httpListening:server?.listening??false,pendingHTTPHandlers:requestHandlers.size,openHTTPSockets:httpSockets.size};if(errors.length)process.exitCode=1;
 try{await verifyBundle();report.finalFreeze={status:'PASS',...report.manifest};}catch(error){report.finalFreeze={status:'FAIL',error:brief(error)};process.exitCode=1;}
 if(runPhase){const attempted=new Set(report.groups.map(group=>group.name));for(const name of cases)if(!attempted.has(name))report.groups.push({name,status:'NOTRUN',reason:report.availability?.reason??'Earlier fatal or cleanup failure'});report.allGroupsAttempted=report.groupsStarted===cases.length;report.fullSuite=!diagnosticCase&&report.groupsStarted===cases.length&&report.passed===cases.length&&!report.failed&&!report.fatal&&report.cleanupFinal.status==='PASS'&&report.finalFreeze.status==='PASS';report.diagnosticPassed=!!diagnosticCase&&report.groupsStarted===1&&report.passed===1&&!report.failed&&!report.fatal&&report.cleanupFinal.status==='PASS'&&report.finalFreeze.status==='PASS';if(!report.fullSuite&&!report.diagnosticPassed)process.exitCode||=report.availability?.status==='NOTRUN'?2:1;}
 report.finishedAt=new Date().toISOString();await mkdir(dirname(artifact),{recursive:true});await writeFile(artifact,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({phase:report.phase,passed:report.passed,failed:report.failed,notRun:report.groups.filter(group=>group.status==='NOTRUN').length,fullSuite:report.fullSuite,diagnosticPassed:report.diagnosticPassed??false,cleanup:report.cleanupFinal.status,finalFreeze:report.finalFreeze.status,fatal:report.fatal?.message??null,report:artifact}));
}
