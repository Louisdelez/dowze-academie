/* Source candidate, not executed by its author. Actual library tree, native Chromium DOM/IDB.
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
const root=process.cwd(),cases=['six-level-create','branch-move-reload','cycle-atomic-refusal','depth-atomic-refusal','keyboard-controls','simulated-touch-controls','old-owner-callback','old-api-callback'];
const diagnosticCase=process.env.DOWZE_LIBRARY_TREE_ONLY?.trim()||null;
if(diagnosticCase&&!cases.includes(diagnosticCase))throw Error('DOWZE_LIBRARY_TREE_ONLY must name one exact declared library case.');
const args=process.argv.slice(2),buildPhase=args.includes('--build'),runPhase=args.includes('--run'),dirAt=args.indexOf('--bundle-dir'),bundleDir=dirAt>=0?args[dirAt+1]:undefined;
if(buildPhase===runPhase||!bundleDir||!isAbsolute(bundleDir)||args.some((arg,i)=>!['--build','--run','--bundle-dir'].includes(arg)&&i!==dirAt+1))throw Error('Use exactly --build or --run and --bundle-dir /absolute/new/private/directory.');
const artifact=mountedAuditPath(`n001-paper-library-tree-browser-${buildPhase?'build':'runtime'}-20261015.json`),web=join(bundleDir,'web'),manifestPath=join(bundleDir,'manifest.json');
const report={schema:1,kind:'paper-library-tree-real-chromium',phase:buildPhase?'build':'runtime',startedAt:new Date().toISOString(),proofScope:'Actual shared NotebookLibraryView/useNotebookLibrary and production storage in native Chromium DOM/IndexedDB. Private account/note-route shell and retained-callback invocation are explicit seams; CDP touch is simulated. No App authentication, physical touch, native IPC, service worker or cloud synchronization claim.',diagnosticOnly:!!diagnosticCase,declaredGroups:buildPhase?1:cases.length,groupsStarted:0,fullSuite:false,availability:null,manifest:null,passed:0,failed:0,groups:[],cleanupFinal:{status:'NOTRUN'},finalFreeze:{status:'NOTRUN'},fatal:null};
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
 const built=await build({configFile:false,publicDir:false,define:{'process.env.NODE_ENV':JSON.stringify('production')},esbuild:{jsx:'automatic'},plugins:[{name:'private-writing-pdf-worker-url',enforce:'pre',resolveId(id){if(id==='pdfjs-dist/build/pdf.worker.min.mjs?url')return virtualWorker;},load(id){if(id===virtualWorker)return 'export default "/pdf.worker.mjs";';},transform(_code,id){const clean=id.split('?')[0];if(isAbsolute(clean)&&clean.startsWith(root+sep)&&!clean.includes(sep+'node_modules'+sep))seenSources.add(relative(root,clean));}}],build:{lib:{entry:join(root,'tests/paper-library-tree-browser-entry.tsx'),formats:['es'],fileName:()=> 'entry.mjs'},outDir:web,emptyOutDir:false,copyPublicDir:false,target:'es2022',minify:false,sourcemap:false,reportCompressedSize:false,rollupOptions:{output:{entryFileNames:'entry.mjs',chunkFileNames:'chunks/[name]-[hash].mjs'}}},logLevel:'error'});
 await writeFile(join(web,'pdf.worker.mjs'),await readFile(join(root,workerInput)));
 const sources=new Set([...seenSources,'tests/run-paper-library-tree-browser.mjs','tests/paper-library-tree-browser-entry.tsx','tests/mounted-cleanup.mjs','package.json','node_modules/playwright-core/types/protocol.d.ts',workerInput]);
 for(const result of Array.isArray(built)?built:[built])for(const chunk of result.output??[])if(chunk.type==='chunk')for(const id of Object.keys(chunk.modules)){const clean=id.split('?')[0];if(isAbsolute(clean)&&clean.startsWith(root+sep)&&!clean.includes(sep+'node_modules'+sep))sources.add(relative(root,clean));}
 const inputs={},outputs={};for(const path of [...sources].sort())inputs[path]=digest(await readFile(join(root,path)));for(const path of await files(web))outputs[relative(web,path)]=digest(await readFile(path));
 assert.ok(outputs['entry.mjs']);assert.ok(Object.keys(outputs).some(path=>path.endsWith('.css')),'Actual shared library CSS must be built');
 const manifest={schema:1,kind:'paper-library-tree-browser-build',builtAt:new Date().toISOString(),inputs,outputs};await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');report.manifest={sha256:digest(await readFile(manifestPath)),inputFiles:Object.keys(inputs).length,bundleFiles:Object.keys(outputs).length};report.passed=1;report.groups=[{name:'Separate actual library fixture build',status:'PASS'}];report.buildComplete=true;
}
let verifiedManifestSHA;
async function verifyBundle(){
 const bytes=await readFile(manifestPath),manifestSHA=digest(bytes),manifest=JSON.parse(bytes.toString('utf8'));assert.equal(manifest.schema,1);assert.equal(manifest.kind,'paper-library-tree-browser-build');
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
  dom=await bounded(record.page.evaluate(()=>({containerPresent:!!document.getElementById('actual-library-tree'),libraryCount:document.querySelectorAll('.notebook-library').length,folderRows:document.querySelectorAll('.note-folder-row').length,source:window.__paperLibraryTree?.state()?.source??null,fixtureError:window.__paperLibraryTree?.state()?.controlError??null})),'Bounded failed UI snapshot',600,true);
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
 await bounded(record.page.waitForFunction(()=>!!window.__paperLibraryTree,null,{timeout:15000}),'Load actual browser fixture API');
 assert.deepEqual(record.pageErrors,[],'Actual browser module initialization must not fail');assert.equal(record.networkRefused,0,'The fixture must use only its private localhost origin');
 return record;
}

const requestHandlers=new Set(),httpErrors=[],httpSockets=new Set();
async function startServer(){
 const css=(await files(web)).filter(path=>path.endsWith('.css')).map(path=>'/'+relative(web,path).split(sep).join('/'));
 server=createServer((req,res)=>{let work;work=(async()=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);if(pathname==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+css.map(path=>'<link rel="stylesheet" href="'+path+'">').join('')+'<style>html,body{margin:0;min-height:100%}#private-library-sources{display:flex;gap:12px;min-height:40px}#actual-library-tree{height:calc(100vh - 40px)}</style></head><body><script type="module" src="/entry.mjs"></script></body></html>');return;}
  const file=resolve(web,'.'+pathname);if(!file.startsWith(resolve(web)+sep)||(await stat(file)).isDirectory())throw Error('Outside private library bundle');res.writeHead(200,{'content-type':/\.m?js$/.test(file)?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'application/octet-stream','cache-control':'no-store'});res.end(await readFile(file));
 }catch{res.writeHead(404);res.end('Private fixture request refused');}})().catch(error=>{httpErrors.push(brief(error));}).finally(()=>requestHandlers.delete(work));requestHandlers.add(work);});server.on('connection',socket=>{httpSockets.add(socket);socket.once('close',()=>httpSockets.delete(socket));});await bounded(new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);}), 'Private library HTTP listener',3000);origin=`http://127.0.0.1:${server.address().port}`;
}
async function call(record,method,...args){record.fixturePhase=method;return bounded(record.page.evaluate(({method,args})=>{const api=window.__paperLibraryTree;if(!api||typeof api[method]!=='function')throw Error('Missing private library fixture method '+method);return api[method](...args);},{method,args}),'Actual library '+method);}
async function open(record,runId,reopen=false){await call(record,'start',runId,reopen);await record.page.locator('.notebook-library').waitFor({state:'visible',timeout:10000});}
async function waitFor(record,check,arg,label){return bounded(record.page.waitForFunction(check,arg,{timeout:10000}),label,11000);}
const notesOnly=inventory=>({drafts:inventory.drafts.filter(row=>row.type!=='preferences'),snapshots:inventory.snapshots.filter(row=>row.key.startsWith('n001-original|')),files:inventory.files,mutations:inventory.mutations});
async function folderId(record,title){const value=(await call(record,'state')).library?.folders.find(row=>row.title===title);assert.ok(value,'The actual UI-created folder must exist: '+title);return value.id;}
const folderButton=(record,title)=>record.page.locator('.note-folder-row > button').filter({has:record.page.locator('span').filter({hasText:new RegExp('^'+title+'$')})});
async function expandPath(record,titles){for(const title of titles){const expand=record.page.getByRole('button',{name:'Déplier '+title,exact:true});if(await expand.count())await expand.click({timeout:5000});}}
async function reveal(record,title){const folders=(await call(record,'state')).library.folders,path=[];let row=folders.find(row=>row.title===title);assert.ok(row);while(row){path.unshift(row.title);row=folders.find(parent=>parent.id===row.parentId);}await expandPath(record,path.slice(0,-1));}
async function createFolder(record,title,parentTitle=null,keyboard=false){await record.page.getByRole('button',{name:'Créer un dossier',exact:true}).click();const field=record.page.getByRole('textbox',{name:'Nom du dossier',exact:true});await field.fill(title);await record.page.getByRole('combobox',{name:'Dossier parent',exact:true}).selectOption(parentTitle?await folderId(record,parentTitle):'');if(keyboard){await field.focus();await record.page.keyboard.press('Enter');}else await record.page.locator('.note-folder-form button[type="submit"]').click();await call(record,'flush');return folderId(record,title);}
async function createChain(record,titles){for(let i=0;i<titles.length;i++)await createFolder(record,titles[i],i?titles[i-1]:null);}
async function editParent(record,title,parentTitle,expectRefusal=false){await reveal(record,title);await folderButton(record,title).click();await record.page.getByRole('button',{name:'Modifier le dossier',exact:true}).click();await record.page.getByRole('combobox',{name:'Dossier parent',exact:true}).selectOption(await folderId(record,parentTitle));await record.page.locator('.note-folder-form button[type="submit"]').click();if(expectRefusal)await record.page.getByRole('alert').filter({hasText:/Classement invalide/}).waitFor({state:'visible',timeout:5000});return call(record,'flush');}
async function libraryInventory(record,selection='a1'){return call(record,'inventory',selection);}
async function assertForeign(record,before){for(const selection of ['a2','b1'])assertExactBody(await libraryInventory(record,selection),before[selection],'All foreign/year data must remain exact: '+selection);}
async function before(record){return {a1:await libraryInventory(record,'a1'),a2:await libraryInventory(record,'a2'),b1:await libraryInventory(record,'b1')};}
function assertDepth(folders,id,expected){let count=0,seen=new Set();while(id){assert.ok(!seen.has(id),'A cycle is forbidden');seen.add(id);const row=folders.find(row=>row.id===id);assert.ok(row);count++;id=row.parentId;}assert.equal(count,expected,'The actual committed complete branch must have its requested depth');}
async function sixLevels(record,runId){await open(record,runId);const original=await before(record);await createChain(record,['N1','N2','N3','N4','N5','N6']);const value=(await call(record,'flush')).content;assert.equal(value.folders.length,6);assertDepth(value.folders,await folderId(record,'N6'),6);await expandPath(record,['N1','N2','N3','N4','N5']);assert.equal(await record.page.locator('.note-folder-row').count(),6);await record.page.getByRole('button',{name:'Créer un dossier',exact:true}).click();const options=await record.page.getByRole('combobox',{name:'Dossier parent',exact:true}).locator('option').evaluateAll(nodes=>nodes.map(node=>node.value));assert.ok(!options.includes(await folderId(record,'N6')),'The UI must not offer level six as a seventh parent');await record.page.getByRole('button',{name:'Annuler',exact:true}).click();assertExactBody(notesOnly(await libraryInventory(record)),notesOnly(original.a1),'Six folder levels must leave canonical notes/media exact');await assertForeign(record,original);return {actualUI:true,nativeIndexedDB:true,levels:6,seventhParentNotOffered:true};}
async function branch(record,runId){await open(record,runId);const original=await before(record);await createChain(record,['A1','A2','A3']);await createChain(record,['R1','R2','R3']);const first=(await call(record,'flush')).content;await record.page.getByRole('button',{name:'Toutes les notes',exact:true}).click();await record.page.getByRole('combobox',{name:'Dossier de Première note',exact:true}).selectOption(await folderId(record,'A2'));await call(record,'flush');await record.page.getByRole('combobox',{name:'Dossier de Deuxième note',exact:true}).selectOption(await folderId(record,'A3'));const classified=(await call(record,'flush')).content;const moved=(await editParent(record,'A1','R3')).content,rootId=await folderId(record,'A1'),parentId=await folderId(record,'R3');assertExactBody(moved.folders.map(row=>({...row,parentId:row.id===rootId?first.folders.find(old=>old.id===rootId).parentId:row.parentId})).sort((a,b)=>a.id.localeCompare(b.id)),first.folders.slice().sort((a,b)=>a.id.localeCompare(b.id)),'Moving a branch preserves every folder identity, descendant link, color/title/order');assert.equal(moved.folders.find(row=>row.id===rootId).parentId,parentId);assertDepth(moved.folders,await folderId(record,'A3'),6);assertExactBody(moved.notes,classified.notes,'Moving a branch preserves all descendant note assignments');await expandPath(record,['R1','R2','R3','A1','A2']);assert.equal(await record.page.locator('.note-folder-row').count(),6);await record.page.getByRole('button',{name:'Toutes les notes',exact:true}).click();await record.page.locator('.note-card-open').first().click();await record.page.getByRole('button',{name:'Retour à la bibliothèque',exact:true}).click();await call(record,'ready');assertExactBody((await call(record,'flush')).content,moved,'Returning from the controlled note route must retain exact classification');await call(record,'cleanup');await bounded(record.page.reload({waitUntil:'load',timeout:12000}),'Native browser reload, no reseed');await open(record,runId,true);assertExactBody((await call(record,'flush')).content,moved,'Actual browser reload must read exact IDB branch, never reconstruct it');assertExactBody(notesOnly(await libraryInventory(record)),notesOnly(original.a1),'Classification/reload leaves canonical notes/media exact');await assertForeign(record,original);return {completeBranch:true,stableIDs:true,descendantsAtLevel6:true,controlledNoteReturn:true,nativeReloadNoReseed:true};}
async function refused(record,runId,kind){await open(record,runId);await createChain(record,['A1','A2','A3']);if(kind==='depth')await createChain(record,['R1','R2','R3','R4']);const original=await before(record),value=await editParent(record,'A1',kind==='cycle'?'A2':'R4',true);assert.equal(value.content.revision,original.a1.drafts.find(row=>row.type==='preferences').content.revision,'A rejected move must not invent a revision');assertExactBody(await libraryInventory(record),original.a1,'The entire native classification/history/outbox/canonical inventory must remain exact after rejection');await assertForeign(record,original);assert.equal(await record.page.locator('.note-folder-form').count(),1,'The rejected proposal remains editable');return {reason:kind,actualUIRefusal:true,wholeInventoryAtomicNoChange:true,descendantDepthChecked:kind==='depth'};}
async function keyboard(record,runId){await open(record,runId);const create=record.page.getByRole('button',{name:'Créer un dossier',exact:true});await create.focus();await record.page.keyboard.press('Enter');await record.page.getByRole('textbox',{name:'Nom du dossier',exact:true}).fill('KeyboardRoot');await record.page.keyboard.press('Enter');await call(record,'flush');await createFolder(record,'KeyboardChild','KeyboardRoot',true);const expand=record.page.getByRole('button',{name:'Replier KeyboardRoot',exact:true});await expand.focus();await record.page.keyboard.press('Space');assert.equal(await record.page.getByRole('button',{name:'Déplier KeyboardRoot',exact:true}).getAttribute('aria-expanded'),'false');assert.equal(await record.page.locator('.note-folder-row').count(),1);await record.page.keyboard.press('Enter');assert.equal(await record.page.getByRole('button',{name:'Replier KeyboardRoot',exact:true}).getAttribute('aria-expanded'),'true');assert.equal(await record.page.locator('.note-folder-row').count(),2);await folderButton(record,'KeyboardChild').focus();await record.page.keyboard.press('Enter');assert.equal(await record.page.locator('.note-library-heading h1').textContent(),'KeyboardChild');const events=(await call(record,'state')).events;assert.ok(events.some(event=>event.type==='keydown'&&event.trusted),'Keyboard must be dispatched by the native browser');return {actualButtonsAndForm:true,nativeKeyboardEvents:true,expandCollapseAndFilter:true,rovingTreeWidgetNotClaimed:true};}
async function touch(record,runId){await open(record,runId);const cdp=await record.page.context().newCDPSession(record.page);try{await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});const tap=async locator=>{await locator.scrollIntoViewIfNeeded();const box=await locator.boundingBox();assert.ok(box&&box.width>0&&box.height>0);const point={x:box.x+box.width/2,y:box.y+box.height/2};await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};await tap(record.page.getByRole('button',{name:'Créer un dossier',exact:true}));await record.page.getByRole('textbox',{name:'Nom du dossier',exact:true}).fill('TouchRoot');await tap(record.page.locator('.note-folder-form button[type="submit"]'));await call(record,'flush');await createFolder(record,'TouchChild','TouchRoot');await tap(record.page.getByRole('button',{name:'Replier TouchRoot',exact:true}));await waitFor(record,()=>document.querySelectorAll('.note-folder-row').length===1,null,'Native simulated touch must collapse the actual branch');await tap(record.page.getByRole('button',{name:'Déplier TouchRoot',exact:true}));await waitFor(record,()=>document.querySelectorAll('.note-folder-row').length===2,null,'Native simulated touch must expand the actual branch');await tap(folderButton(record,'TouchChild'));assert.equal(await record.page.locator('.note-library-heading h1').textContent(),'TouchChild');assert.ok((await call(record,'state')).events.some(event=>event.type==='pointerdown'&&event.pointerType==='touch'&&event.trusted),'The real browser must deliver a trusted simulated touch pointer');return {CDPSimulatedTouch:true,physicalTouch:false,actualButtonClickPath:true};}finally{await cdp.detach();}}
async function stale(record,runId,kind){await open(record,runId);const context=record.page.context();await context.setOffline(true);assert.equal(await record.page.evaluate(()=>navigator.onLine),false,'API-identity checks run offline and cannot accidentally contact a server');await call(record,'show','a1','a');await record.page.getByRole('button',{name:'Créer un dossier',exact:true}).click();await record.page.getByRole('textbox',{name:'Nom du dossier',exact:true}).fill('StaleProposal');const captured=await call(record,'captureSubmit');if(kind==='owner')await call(record,'show','b1','none');else{await call(record,'show','a1','b');await call(record,'show','a1','a');}const original=await before(record),result=await call(record,'invokeCapturedSubmit',captured.id);assert.equal(result.current,false,'The captured actual callback belongs to a retired incarnation');await call(record,'show','a1','a');await call(record,'flush');for(const selection of ['a1','a2','b1'])assertExactBody(await libraryInventory(record,selection),original[selection],'Retired '+kind+' callback must be inert even after fresh A returns: '+selection);const cancel=record.page.getByRole('button',{name:'Annuler',exact:true});if(await cancel.count())await cancel.click();await createFolder(record,'FreshRetry');const current=(await call(record,'flush')).content;assert.equal(current.folders.length,1);assert.equal(current.folders[0].title,'FreshRetry');return {desiredRegression:true,actualRetainedReactCallback:true,callbackInvocationSeam:'Explicit direct invocation of a previously committed onSubmit, not a physical queued input',oldSourceInert:true,freshRetryDurable:true};}
async function libraryFailureState(record){const common=await failureState(record);if(!record?.page||record.page.isClosed()||!record.browser?.isConnected())return common;let state;try{state=await bounded(record.page.evaluate(()=>{const value=window.__paperLibraryTree?.state();return value?{...value,library:value.library?{revision:value.library.revision,folders:value.library.folders.map(({id,parentId,title})=>({id,parentId,title})),noteIDs:Object.keys(value.library.notes),hasCollaboration:!!value.library.collaboration}:null}:null;}),'Bounded library diagnostics',700,true);}catch(error){state={error:privateBrief(error,[record])};}return {...common,fixturePhase:record.fixturePhase??null,state};}
async function cleanupGroup(){const errors=[];for(const record of [...owned])try{await killOwned(record);}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Private library browser cleanup failed');}
async function runBrowser(){
 await verifyBundle();try{playwright=await import('playwright');}catch(error){report.availability={status:'NOTRUN',reason:'Existing Playwright unavailable',error:brief(error)};return;}
 const executable=process.env.DOWZE_CRASH_CHROMIUM_PATH||playwright.chromium.executablePath();assert.ok(isAbsolute(executable));try{await access(executable,constants.X_OK);}catch{report.availability={status:'NOTRUN',reason:'Existing Chromium executable unavailable; no download'};return;}
 report.availability={status:'AVAILABLE',executable:executable.split(sep).at(-1),executed:false};workDir=await mkdtemp(join(tmpdir(),'dowze-library-tree-browser-'));await writeFile(join(workDir,'.owned-synthetic-browser-profiles'),'private synthetic library profiles only\n');await startServer();
 for(const name of cases){
  if(diagnosticCase&&name!==diagnosticCase){report.groups.push({name,status:'NOTRUN',reason:'Diagnostic exact library case'});continue;}
  if(Date.now()>=deadline)throw Error('Library tree global deadline exhausted before next group');const profile=await mkdtemp(join(workDir,'profile-'));profiles.add(profile);let first=null,current=null,result;report.groupsStarted++;
  try{
   first=await launch(profile,executable,'library-'+name);current=first;report.availability.executed=true;const version=first.browser.version(),runId=randomUUID();let evidence;
   if(name==='six-level-create')evidence=await sixLevels(first,runId);else if(name==='branch-move-reload')evidence=await branch(first,runId);else if(name==='cycle-atomic-refusal')evidence=await refused(first,runId,'cycle');else if(name==='depth-atomic-refusal')evidence=await refused(first,runId,'depth');else if(name==='keyboard-controls')evidence=await keyboard(first,runId);else if(name==='simulated-touch-controls')evidence=await touch(first,runId);else evidence=await stale(first,runId,name==='old-owner-callback'?'owner':'api');
   const fixtureCleanup=await call(current,'cleanup');assert.equal(fixtureCleanup.libraryNodes,0);assert.deepEqual(current.pageErrors,[]);assert.equal(current.networkRefused,0);result={name,status:'PASS',browserVersion:version,evidence,fixtureCleanup};report.passed++;
  }catch(error){result={name,status:'FAIL',error:privateBrief(error,[first,current]),diagnostics:await libraryFailureState(current??first)};report.failed++;console.error(name+': FAIL '+result.error.message);}
  finally{
   if(result)report.groups.push(result);try{await cleanupGroup();await rm(profile,{recursive:true,force:true});profiles.delete(profile);if(result)result.cleanup={status:'PASS'};}catch(error){if(result){result.cleanup={status:'FAIL',error:brief(error)};if(result.status==='PASS'){result.bodyStatus='PASS';result.status='FAIL';report.passed--;report.failed++;}}throw error;}
  }
  console.log(name+': '+result.status);
 }
}
try{await requireCentralGuard();if(buildPhase)await buildBundle();else await runBrowser();}
catch(error){report.fatal=brief(error);console.error('Library tree browser recipe failed: '+report.fatal.message);process.exitCode=1;}
finally{
 const errors=[];try{await cleanupGroup();}catch(error){errors.push(error);}if(server)try{server.closeAllConnections();await bounded(new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve())),'Library private HTTP cleanup',3000,true);await bounded((async()=>{while(requestHandlers.size)await Promise.allSettled([...requestHandlers]);})(),'Drain actual HTTP request handlers',3000,true);await bounded((async()=>{while(httpSockets.size)await sleep(10);})(),'Observe native HTTP sockets closed',1000,true);assert.equal(requestHandlers.size,0);assert.equal(httpSockets.size,0);assert.deepEqual(httpErrors,[]);}catch(error){errors.push(error);}
 if(owned.size===0){for(const profile of profiles)try{await rm(profile,{recursive:true,force:true});profiles.delete(profile);}catch(error){errors.push(error);}if(workDir)try{await rm(workDir,{recursive:true,force:true});}catch(error){errors.push(error);}}
 report.cleanupFinal=errors.length?{status:'FAIL',error:brief(new AggregateError(errors,'Final library tree cleanup failed'))}:{status:'PASS',remainingOwnedBrowsers:owned.size,remainingProfiles:profiles.size,httpListening:server?.listening??false,pendingHTTPHandlers:requestHandlers.size,openHTTPSockets:httpSockets.size};if(errors.length)process.exitCode=1;
 try{await verifyBundle();report.finalFreeze={status:'PASS',...report.manifest};}catch(error){report.finalFreeze={status:'FAIL',error:brief(error)};process.exitCode=1;}
 if(runPhase){const attempted=new Set(report.groups.map(group=>group.name));for(const name of cases)if(!attempted.has(name))report.groups.push({name,status:'NOTRUN',reason:report.availability?.reason??'Earlier fatal or cleanup failure'});report.allGroupsAttempted=report.groupsStarted===cases.length;report.fullSuite=!diagnosticCase&&report.groupsStarted===cases.length&&report.passed===cases.length&&!report.failed&&!report.fatal&&report.cleanupFinal.status==='PASS'&&report.finalFreeze.status==='PASS';report.diagnosticPassed=!!diagnosticCase&&report.groupsStarted===1&&report.passed===1&&!report.failed&&!report.fatal&&report.cleanupFinal.status==='PASS'&&report.finalFreeze.status==='PASS';if(!report.fullSuite&&!report.diagnosticPassed)process.exitCode||=report.availability?.status==='NOTRUN'?2:1;}
 report.finishedAt=new Date().toISOString();await mkdir(dirname(artifact),{recursive:true});await writeFile(artifact,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({phase:report.phase,passed:report.passed,failed:report.failed,notRun:report.groups.filter(group=>group.status==='NOTRUN').length,fullSuite:report.fullSuite,diagnosticPassed:report.diagnosticPassed??false,cleanup:report.cleanupFinal.status,finalFreeze:report.finalFreeze.status,fatal:report.fatal?.message??null,report:artifact}));
}
