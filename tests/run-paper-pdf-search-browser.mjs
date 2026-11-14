/* Actual PDF Page/TextLayer search in owned Chromium; separate build/runtime.
 * Native IndexedDB, real PDF.js/worker/fonts/glyph measurement and SVG.
 * No product edits, dependency install, PDF/ApiClient mock, App/SW/cloud claim. */
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
const root=process.cwd(),cases=['exact-repeated-glyphs-preserve-selection','retired-api-page-source-refusals'],diagnosticCase=process.env.DOWZE_PDF_SEARCH_ONLY?.trim()||null;
if(diagnosticCase&&!cases.includes(diagnosticCase))throw Error('DOWZE_PDF_SEARCH_ONLY must name one exact declared PDF case.');
const args=process.argv.slice(2),buildPhase=args.includes('--build'),runPhase=args.includes('--run'),dirAt=args.indexOf('--bundle-dir'),bundleDir=dirAt>=0?args[dirAt+1]:undefined;
if(buildPhase===runPhase||!bundleDir||!isAbsolute(bundleDir)||args.some((arg,i)=>!['--build','--run','--bundle-dir'].includes(arg)&&i!==dirAt+1))throw Error('Use exactly --build or --run and --bundle-dir /absolute/new/private/directory.');
const artifact=mountedAuditPath(`n014-paper-pdf-search-browser-${buildPhase?'build':'runtime'}-20261015.json`),web=join(bundleDir,'web'),manifestPath=join(bundleDir,'manifest.json');
const report={schema:1,kind:'paper-pdf-search-real-chromium',phase:buildPhase?'build':'runtime',startedAt:new Date().toISOString(),proofScope:'Actual PaperPdfPage/TextLayer, installed PDF.js worker, real DOM glyphs/SVG, native selection/caret witness and IndexedDB. Synthetic source/request shell; real ApiClient authority without network authentication. No Notebook/PM/App/SW/native/physical/cloud completion.',diagnosticOnly:!!diagnosticCase,declaredGroups:buildPhase?1:cases.length,groupsStarted:0,fullSuite:false,availability:null,manifest:null,passed:0,failed:0,groups:[],cleanupFinal:{status:'NOTRUN'},fatal:null};
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
 report.groupsStarted=1;await mkdir(bundleDir);await writeFile(join(bundleDir,'.owned-pdf-search-build'),'private PDF search fixture only\n');
 const reference=await readFile(join(root,'tests/run-paper-writing-browser.mjs'),'utf8'),self=await readFile(join(root,'tests/run-paper-pdf-search-browser.mjs'),'utf8');
 const block=(value,start,end)=>{const from=value.indexOf('\n'+start),to=value.indexOf('\n'+end,from);assert.ok(from>=0&&to>from,'Exact anchored guard block missing');return value.slice(from,to);};
 for(const [start,end] of [['let qaCgroup;','async function files('],['async function procInfo(','const owned=new Set()'],['async function cgroupPids()','async function launch(']])assert.equal(block(self,start,end),block(reference,start,end),'The existing guard/PID ownership blocks must remain byte-identical');
 const {build}=await import('vite'),virtualWorker='\0private-pdf-search-worker-url',workerInput='node_modules/pdfjs-dist/build/pdf.worker.min.mjs',seenSources=new Set();
 const built=await build({configFile:false,publicDir:false,define:{'process.env.NODE_ENV':JSON.stringify('production')},esbuild:{jsx:'automatic'},plugins:[{name:'private-pdf-search-real-worker',enforce:'pre',resolveId(id){if(id==='pdfjs-dist/build/pdf.worker.min.mjs?url')return virtualWorker;},load(id){if(id===virtualWorker)return 'export default "/pdf.worker.mjs";';},transform(_code,id){const clean=id.split('?')[0];if(isAbsolute(clean)&&clean.startsWith(root+sep)&&!clean.includes(sep+'node_modules'+sep))seenSources.add(relative(root,clean));}}],build:{lib:{entry:join(root,'tests/paper-pdf-search-browser-entry.tsx'),formats:['es'],fileName:()=> 'entry.mjs'},outDir:web,emptyOutDir:false,copyPublicDir:false,target:'es2022',minify:false,sourcemap:false,reportCompressedSize:false,rollupOptions:{output:{entryFileNames:'entry.mjs',chunkFileNames:'chunks/[name]-[hash].mjs'}}},logLevel:'error'});
 const pdfPath='tests/fixtures/paper-pdf-selection-columns.pdf',pdf=await readFile(join(root,pdfPath));await writeFile(join(web,'fixture.pdf'),pdf);await writeFile(join(web,'pdf.worker.mjs'),await readFile(join(root,workerInput)));
 const sources=new Set([...seenSources,'tests/run-paper-pdf-search-browser.mjs','tests/paper-pdf-search-browser-entry.tsx','tests/run-paper-writing-browser.mjs','tests/mounted-cleanup.mjs',pdfPath,'package.json','node_modules/pdfjs-dist/package.json','node_modules/playwright-core/package.json',workerInput]);
 for(const result of Array.isArray(built)?built:[built])for(const chunk of result.output??[])if(chunk.type==='chunk')for(const id of Object.keys(chunk.modules)){const clean=id.split('?')[0];if(isAbsolute(clean)&&clean.startsWith(root+sep)&&!clean.includes(sep+'node_modules'+sep))sources.add(relative(root,clean));}
 const inputs={},outputs={};for(const path of [...sources].sort())inputs[path]=digest(await readFile(join(root,path)));for(const path of await files(web))outputs[relative(web,path)]=digest(await readFile(path));
 for(const name of ['entry.mjs','fixture.pdf','pdf.worker.mjs'])assert.ok(outputs[name]);assert.ok(Object.keys(outputs).some(path=>path.endsWith('.css')),'Actual Page/TextLayer CSS must be built');
 const manifest={schema:1,kind:'paper-pdf-search-browser-build',builtAt:new Date().toISOString(),inputs,outputs,fixture:{pdfSha256:digest(pdf),originalKnownPages:5},ownershipReference:{path:'tests/run-paper-writing-browser.mjs',sha256:inputs['tests/run-paper-writing-browser.mjs'],guardAndPidBlocksByteIdentical:true}};await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
 report.manifest={sha256:digest(await readFile(manifestPath)),inputFiles:Object.keys(inputs).length,bundleFiles:Object.keys(outputs).length,ownershipReference:manifest.ownershipReference};report.passed=1;report.groups=[{name:'Separate actual PDF visual fixture build',status:'PASS'}];report.buildComplete=true;
}
async function verifyBundle(){
 const manifest=JSON.parse(await readFile(manifestPath,'utf8'));assert.equal(manifest.schema,1);assert.equal(manifest.kind,'paper-pdf-search-browser-build');
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
 await record.page.setViewportSize({width:1440,height:1200});
 await bounded(record.page.goto(origin,{waitUntil:'load',timeout:15000}),'Open private fixture origin');
 await bounded(record.page.waitForFunction(()=>!!window.__paperPdfSearch,null,{timeout:15000}),'Load actual browser fixture API');
 assert.deepEqual(record.pageErrors,[],'Actual browser module initialization must not fail');assert.equal(record.networkRefused,0,'The fixture must use only its private localhost origin');
 return record;
}

const handlers=new Set(),sockets=new Set(),protocolErrors=[];let apiRequests=0;
async function startServer(){
 const css=(await files(web)).filter(path=>path.endsWith('.css')).map(path=>'/'+relative(web,path).split(sep).join('/'));
 const handle=async(req,res)=>{try{
  const url=new URL(req.url,'http://127.0.0.1'),path=decodeURIComponent(url.pathname);assert.equal(req.method,'GET','Private PDF server accepts static GET only');assert.equal(url.search,'','Private static fixture does not accept query mutations');
  if(path.startsWith('/qa/')){apiRequests++;throw Error('Visual search must not perform any API/network mutation or substitute missing local original');}
  if(path==='/favicon.ico'){res.writeHead(204);res.end();return;}
  if(path==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+css.map(path=>'<link rel="stylesheet" href="'+path+'">').join('')+'<style>html,body{margin:0;background:#ddd;min-height:100%;font:16px sans-serif}</style></head><body><script type="module" src="/entry.mjs"></script></body></html>');return;}
  const file=resolve(web,'.'+path);assert.ok(file.startsWith(resolve(web)+sep)&&!(await stat(file)).isDirectory(),'Outside private static PDF bundle');const body=await readFile(file);res.writeHead(200,{'content-type':/\.m?js$/.test(file)?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.pdf')?'application/pdf':'application/octet-stream','cache-control':'no-store'});res.end(body);
 }catch(error){protocolErrors.push(brief(error));if(!res.headersSent)res.writeHead(404);res.end('Private PDF fixture refused this request');}};
 server=createServer((req,res)=>{let work;work=handle(req,res).catch(error=>{protocolErrors.push(brief(error));}).finally(()=>handlers.delete(work));handlers.add(work);});
 server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
 await bounded(new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);}),'Private PDF static HTTP listener',3000);origin='http://127.0.0.1:'+server.address().port;
}
async function closeServer(){
 if(server){const closing=new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));for(const socket of sockets)socket.destroy();await bounded(closing,'Private static HTTP close',3000,true);}
 await bounded(Promise.allSettled([...handlers]),'Accepted private HTTP handlers terminal',5000,true);
 assert.equal(handlers.size,0);assert.equal(sockets.size,0);assert.equal(server?.listening??false,false);
}
async function call(record,method,...args){record.phase=method;return bounded(record.page.evaluate(({method,args})=>{const api=window.__paperPdfSearch;if(!api||typeof api[method]!=='function')throw Error('Actual PDF fixture method absent: '+method);return api[method](...args);},{method,args}),'Actual PDF '+method);}
async function waitFor(record,check,arg,label){return bounded(record.page.waitForFunction(check,arg,{timeout:12000}),label,13000);}
async function paintReady(record){await waitFor(record,()=>window.__paperPdfSearch.state().paintCount===1,null,'Actual glyph SVG must be published');return call(record,'geometry');}
async function noPaint(record,label){await waitFor(record,()=>window.__paperPdfSearch.state().paintCount===0,null,label);await call(record,'ready');assert.equal((await call(record,'state')).paintCount,0,label);}
async function caretWitness(record){await record.page.locator('#outside-pdf-caret').click({timeout:10000});await record.page.keyboard.press('End');await record.page.keyboard.press('ArrowLeft');const value=await call(record,'selection');assert.equal(value.activeId,'outside-pdf-caret');assert.ok(value.collapsed&&value.caret?.height>0&&Number.isFinite(value.caret.x),'Actual browser caret must have native finite geometry');return value;}
function exactGlyphGeometry(value,which,occurrenceId){
 assert.equal(value.occurrenceId,occurrenceId,'SVG must identify the exact bound occurrence');assert.ok(value.polygons.length>0,'The real SVG must paint measured glyph polygons');const wanted=value[which],other=value[which==='first'?'second':'first'];assert.ok(wanted.width>0&&wanted.height>0);
 const points=value.polygons.flatMap(row=>{assert.ok(row.points.length===4&&row.fill!=='none'&&Number(row.opacity)>0);return row.points;});assert.ok(points.every(point=>Number.isFinite(point.x)&&Number.isFinite(point.y)&&point.x>=-.75&&point.y>=-.75&&point.x<=value.page.width+.75&&point.y<=value.page.height+.75));
 const actual={left:Math.min(...points.map(point=>point.x)),top:Math.min(...points.map(point=>point.y)),width:Math.max(...points.map(point=>point.x))-Math.min(...points.map(point=>point.x)),height:Math.max(...points.map(point=>point.y))-Math.min(...points.map(point=>point.y))};
 for(const key of ['left','top','width','height'])assert.ok(Math.abs(actual[key]-wanted[key])<=2.5,'Actual SVG '+key+' must match the independent native DOM Range on '+which+' known line');
 assert.ok(actual.top+actual.height<other.top||actual.top>other.top+other.height,'The repeated word on the other known line must remain unpainted');
 return {measuredSvg:true,rangeGeometryToleranceLogicalPx:2.5,occurrenceSha256:bodySha(occurrenceId),glyphPolygons:value.polygons.length,actual,expected:wanted};
}
async function valid(record,which=1){const request=await call(record,'newRequest','fresh',which);await call(record,'attach',request.id);const geometry=await paintReady(record);return {request,evidence:exactGlyphGeometry(geometry,which===1?'second':'first',request.occurrenceId)};}
async function selectionCase(record,runId){
 const original=await call(record,'start',runId,true),before=await call(record,'stores'),selection=await caretWitness(record),counters=await call(record,'state');
 const later=await valid(record,1);exact(await call(record,'selection'),selection,'Search must retain the exact native user selection/caret/focus');exact(await call(record,'stores'),before,'Search must preserve all scoped native rows, outbox and original bytes without writes');
 await call(record,'attach',null);await noPaint(record,'Clearing the search must remove only ephemeral SVG');exact(await call(record,'selection'),selection,'Clearing cannot change the user selection/caret');
 const earlier=await valid(record,0);assert.notEqual(earlier.request.occurrenceId,later.request.occurrenceId);exact(await call(record,'selection'),selection,'The first-word control must retain the native caret');exact(await call(record,'stores'),before,'Changing occurrence must preserve every native durable row and byte');
 const after=await call(record,'state');assert.equal(after.selectionCallbacks,counters.selectionCallbacks,'Search must not emit a PDF user-selection callback');assert.equal(after.highlightCallbacks,0);assert.deepEqual(after.errors,[]);assert.ok(after.native.workerCreates>0&&after.native.renderCalls>0,'Actual native PDF.js worker and TextLayer render must execute');
 return {original,later:later.evidence,earlier:earlier.evidence,nativeCaretAndSelectionExact:true,wholeNativeInventoryExact:true,zeroAdditionalNativeWrites:true};
}
async function refusedCase(record,runId){
 const original=await call(record,'start',runId,false),before=await call(record,'stores'),selection=await caretWitness(record),refusals=[];
 const stale=await call(record,'staleAdmission');assert.equal(stale.unboundApiUntouched,true);await noPaint(record,'Already revoked caller must not bind or paint');refusals.push('caller-before-real-API-capture');
 await call(record,'show','a');await call(record,'attach',null);let active=await valid(record);
 await call(record,'permit',active.request.id,false);await noPaint(record,'Revoked current must clear already visible glyphs');await call(record,'permit',active.request.id,true);await call(record,'attach',active.request.id);await noPaint(record,'A revoked request cannot become current again');refusals.push('current-false-then-true');
 active=await valid(record);await call(record,'sessionABA');await noPaint(record,'A real ApiClient epoch ABA must revoke visible paint');await call(record,'attach',active.request.id);await noPaint(record,'The old API request must not capture a fresh same-client epoch');refusals.push('real-API-session-ABA');
 active=await valid(record);await call(record,'show','a',0,'base',true);await noPaint(record,'Replacing the API must retire the old request');await call(record,'show','a');await noPaint(record,'API identity A-B-A cannot renew the same request');refusals.push('API-instance-ABA');
 active=await valid(record);await call(record,'show','b');await noPaint(record,'Foreign owner cannot paint the earlier request');await call(record,'show','a');await noPaint(record,'Owner A-B-A cannot revive the same request');refusals.push('owner-ABA');
 await call(record,'show','a',1);const wrongPage=await call(record,'newRequest');await call(record,'attach',wrongPage.id);await call(record,'ready');assert.equal((await call(record,'state')).textState,'ready','A real wrong-page TextLayer must load before its refusal');await noPaint(record,'A fresh first-page occurrence cannot paint PDF page two');refusals.push('actual-page-mismatch');
 await call(record,'show','a',0,'revision');const staleSource=await call(record,'newRequest','stale');await call(record,'attach',staleSource.id);await call(record,'ready');assert.equal((await call(record,'state')).textState,'ready');await noPaint(record,'A request bound to the earlier revision cannot paint the fresh canonical source');refusals.push('stale-source-revision');
 active=await valid(record);await call(record,'attach',null);await noPaint(record,'Explicit search removal must clear paint');await call(record,'attach',active.request.id);await noPaint(record,'Reintroducing an explicitly retired request object must refuse');refusals.push('clear-and-reuse');
 const fresh=await valid(record);exact(await call(record,'selection'),selection,'All denied requests must preserve actual native selection and focus');exact(await call(record,'stores'),before,'Every denied/retried search must preserve all native scopes, queue, recovery rows and original bytes');
 const after=await call(record,'state');assert.equal(after.selectionCallbacks,0,'Search-only mounting must never emit user-selection callbacks');assert.equal(after.highlightCallbacks,0);assert.deepEqual(after.errors,[]);assert.equal(refusals.length,8);
 return {original,refusals,freshCurrentControl:fresh.evidence,wholeNativeInventoryExact:true,nativeCaretAndSelectionExact:true,realApiClientWithoutFetcherMock:true};
}
async function failureState(record){
 if(!record)return null;let dom;try{dom=record.page&&!record.page.isClosed()&&record.browser?.isConnected()?await bounded(record.page.evaluate(()=>window.__paperPdfSearch?.state()??null),'Bounded PDF failure state',800,true):null;}catch(error){dom={unavailable:privateBrief(error,[record])};}
 return {phase:record.phase??null,browserConnected:record.browser?.isConnected()??false,pageClosed:record.page?.isClosed()??null,pageErrors:record.pageErrors,consoleErrors:record.consoleErrors,stderr:privateText(record.stderr,[record]).slice(-1500),dom:privateValue(dom,[record]),protocolErrors:protocolErrors.slice(-6),apiRequests};
}
async function cleanupGroup(){const errors=[];for(const record of [...owned])try{await killOwned(record);}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Owned PDF browser cleanup failed');}
async function runBrowser(){
 await verifyBundle();try{playwright=await import('playwright');}catch(error){report.availability={status:'NOTRUN',reason:'Existing Playwright unavailable',error:brief(error)};return;}
 const executable=process.env.DOWZE_CRASH_CHROMIUM_PATH||playwright.chromium.executablePath();assert.ok(isAbsolute(executable));try{await access(executable,constants.X_OK);}catch{report.availability={status:'NOTRUN',reason:'Existing Chromium executable unavailable; no download'};return;}
 report.availability={status:'AVAILABLE',executable:executable.split(sep).at(-1),executed:false};workDir=await mkdtemp(join(tmpdir(),'dowze-pdf-search-browser-'));await writeFile(join(workDir,'.owned-synthetic-browser-profiles'),'private synthetic PDF search profiles only\n');await startServer();
 for(const name of cases){
  if(diagnosticCase&&name!==diagnosticCase){report.groups.push({name,status:'NOTRUN',reason:'Diagnostic exact PDF case'});continue;}
  if(Date.now()>=deadline)throw Error('PDF global deadline exhausted before next group');const profile=await mkdtemp(join(workDir,'profile-'));profiles.add(profile);let record,result;const timeoutBefore=timedOutOperations.length;report.groupsStarted++;
  try{
   record=await launch(profile,executable,'pdf-search-'+name);report.availability.executed=true;const evidence=await bounded((name===cases[0]?selectionCase:refusedCase)(record,randomUUID()),'Complete actual PDF case '+name,70000);
   const fixtureCleanup=await call(record,'cleanup');await waitFor(record,()=>window.__paperPdfSearch.state().operations===0,null,'All original fixture methods must settle');const terminal=await call(record,'state');assert.equal(terminal.root,false);for(const key of ['opens','connections','transactions','renders','workers'])assert.equal(terminal.native[key],0,'Native '+key+' must settle before browser cleanup');
   assert.deepEqual(record.pageErrors,[]);assert.equal(record.networkRefused,0);assert.equal(apiRequests,0);assert.deepEqual(protocolErrors,[]);result={name,status:'PASS',browserVersion:record.browser.version(),evidence,fixtureCleanup,terminal};report.passed++;
  }catch(error){result={name,status:'FAIL',error:privateBrief(error,[record]),diagnostics:await failureState(record)};report.failed++;console.error(name+': FAIL '+result.error.message);}
  finally{
   if(result)report.groups.push(result);try{await cleanupGroup();await drain('Original case work after owned browser shutdown');if(timedOutOperations.length!==timeoutBefore)throw Error('A timeout cannot be an expected refusal or PASS');await rm(profile,{recursive:true,force:true});profiles.delete(profile);if(result)result.cleanup={status:'PASS'};}catch(error){if(result){result.cleanup={status:'FAIL',error:brief(error)};if(result.status==='PASS'){result.bodyStatus='PASS';result.status='FAIL';report.passed--;report.failed++;}}throw error;}
  }
  console.log(name+': '+result.status);
 }
}
try{await requireCentralGuard();if(buildPhase)await buildBundle();else await runBrowser();}
catch(error){report.fatal=brief(error);console.error('PDF visual browser recipe failed: '+report.fatal.message);process.exitCode=1;}
finally{
 const errors=[];try{await cleanupGroup();}catch(error){errors.push(error);}try{await closeServer();}catch(error){errors.push(error);}try{await drain('Final original PDF/HTTP operations');}catch(error){errors.push(error);}
 if(pending.size||handlers.size||owned.size){console.error('FATAL_STOP: accepted browser/HTTP operations remain; no final report, observer restore or profile deletion');throw new AggregateError(errors,'Accepted originals remain active');}
 for(const profile of [...profiles])try{await rm(profile,{recursive:true,force:true});profiles.delete(profile);}catch(error){errors.push(error);}if(workDir)try{await rm(workDir,{recursive:true,force:true});}catch(error){errors.push(error);}
 if(runPhase&&report.manifest)try{const before=report.manifest.sha256;await verifyBundle();assert.equal(report.manifest.sha256,before);report.finalFreeze={status:'PASS',manifestSha256:before};}catch(error){errors.push(error);report.finalFreeze={status:'FAIL',error:brief(error)};}
 if(protocolErrors.length)errors.push(Error('Private HTTP protocol errors were observed'));report.timedOutOperations=timedOutOperations;report.cleanupFinal=errors.length?{status:'FAIL',error:brief(new AggregateError(errors,'Final PDF cleanup failed'))}:{status:'PASS',remainingOwnedBrowsers:owned.size,remainingProfiles:profiles.size,httpListening:server?.listening??false,httpSockets:sockets.size,httpHandlers:handlers.size,acceptedOperations:pending.size};if(errors.length)process.exitCode=1;
 if(runPhase){const attempted=new Set(report.groups.map(group=>group.name));for(const name of cases)if(!attempted.has(name))report.groups.push({name,status:'NOTRUN',reason:report.availability?.reason??'Earlier fatal/cleanup failure'});report.fullSuite=!diagnosticCase&&report.groupsStarted===cases.length&&report.passed===cases.length&&!report.failed&&!report.fatal&&!timedOutOperations.length&&report.cleanupFinal.status==='PASS'&&report.finalFreeze?.status==='PASS';report.diagnosticPassed=!!diagnosticCase&&report.passed===1&&!report.failed&&!report.fatal&&!timedOutOperations.length&&report.cleanupFinal.status==='PASS'&&report.finalFreeze?.status==='PASS';if(!report.fullSuite&&!report.diagnosticPassed)process.exitCode||=report.availability?.status==='NOTRUN'?2:1;}
 report.finishedAt=new Date().toISOString();await mkdir(dirname(artifact),{recursive:true});await writeFile(artifact,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({phase:report.phase,passed:report.passed,failed:report.failed,notRun:report.groups.filter(group=>group.status==='NOTRUN').length,fullSuite:report.fullSuite,diagnosticPassed:report.diagnosticPassed??false,cleanup:report.cleanupFinal.status,fatal:report.fatal?.message??null,report:artifact}));
}

