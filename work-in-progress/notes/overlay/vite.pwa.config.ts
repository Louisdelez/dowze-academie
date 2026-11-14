import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, relative, sep } from "node:path";
import {readFile,writeFile,readdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
/** Full offline shell, including lazy workers/codecs. Private API/note/audio responses are never cached. */
export function notebookOfflineShell(entryFile="pwa/index.html"):Plugin{
 let output='';const bootChunks=new Set<string>();
 return {name:'dowze-notebook-offline-shell',apply:'build',
  configResolved(config){output=resolve(config.build.outDir);},
  generateBundle(_options,bundle){
   bootChunks.clear();const pending=Object.values(bundle).filter(chunk=>chunk.type==='chunk'&&chunk.isEntry).map(chunk=>chunk.fileName);
   while(pending.length){const name=pending.pop()!;if(bootChunks.has(name))continue;const chunk=bundle[name];if(chunk?.type!=='chunk')throw Error('The offline boot graph is incomplete.');bootChunks.add(name);pending.push(...chunk.imports);}
  },
  async closeBundle(){
   await copyFile(resolve(output,entryFile),resolve(output,'index.html'));
   const paths:string[]=[],sizes=new Map<string,number>();
   async function walk(directory:string){for(const entry of await readdir(directory,{withFileTypes:true})){const file=resolve(directory,entry.name);if(entry.isDirectory())await walk(file);else if(entry.name!=='sw.js')paths.push('/app/'+relative(output,file).split(sep).join('/'));}}
   await walk(output);paths.push('/app/');paths.sort();
   const digest=createHash('sha256');for(const path of paths){digest.update(path);if(path!=='/app/'){const bytes=await readFile(resolve(output,path.slice(5)));sizes.set(path,bytes.byteLength);digest.update(bytes);}}
   // Follow actual Rollup static imports, not a guessed emitted main filename.
   // Complete boot code/CSS precedes auxiliaries; large optional codecs are last.
   const priority=(path:string)=>path==='/app/'||path.endsWith('.html')?0:bootChunks.has(path.slice(5))||path.endsWith('.css')?1:(sizes.get(path)??0)>=1024*1024||path.endsWith('.wasm')?3:2;
   const installOrder=[...paths].sort((a,b)=>priority(a)-priority(b)||(sizes.get(a)??0)-(sizes.get(b)??0)||(a<b?-1:a>b?1:0));
   const body=`const INSTALL_ORDER=${JSON.stringify(installOrder)};
async function complete(cache){const keys=await cache.keys();if(keys.length!==ASSETS.length)return false;const expected=new Set(ASSETS);for(const request of keys){const url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin||url.search||!expected.delete(url.pathname))return false;}if(expected.size)return false;for(const path of ASSETS){const response=await cache.match(path);if(!response?.ok||response.status===206||response.headers.get('vary')?.split(',').some(value=>value.trim()==='*'))return false;}return true;}
async function install(){let owned=false;try{if(await caches.has(CACHE)){const existing=await caches.open(CACHE);if(await complete(existing))return;await caches.delete(CACHE);}const cache=await caches.open(CACHE);owned=true;for(const path of INSTALL_ORDER){await cache.add(new Request(new URL(path,self.location.origin),{priority:'low'}));await new Promise(resolve=>setTimeout(resolve,0));}if(!await complete(cache))throw Error('The complete offline shell is required.');}catch(error){if(owned){try{await caches.delete(CACHE);if(await caches.has(CACHE))throw Error('The incomplete offline cache could not be removed.');}catch(cleanup){throw new AggregateError([error,cleanup],'Offline installation and cache rollback failed.');}}throw error;}}
self.addEventListener('install',event=>event.waitUntil(install()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);if(!await complete(cache))throw Error('An incomplete shell cannot activate.');const keys=await caches.keys();await Promise.all(keys.filter(key=>key.startsWith('dowze-shell-notebook-')&&key!==CACHE).map(key=>caches.delete(key)));await self.clients.claim();})()));
self.addEventListener('fetch',event=>{const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith('/app/'))return;if(request.mode==='navigate')event.respondWith(fetch(request).catch(()=>caches.open(CACHE).then(cache=>cache.match('/app/index.html'))));else if(ASSETS.includes(url.pathname))event.respondWith(caches.open(CACHE).then(cache=>cache.match(request,{ignoreVary:true})).then(cached=>cached||fetch(request)));});`;
   // A changed scheduling/validation/fetch policy gets a distinct generation even
   // when emitted assets are identical. A failed new install cannot erase old cache.
   digest.update(body);const cache='dowze-shell-notebook-v2-'+digest.digest('hex').slice(0,16);
   await writeFile(resolve(output,'sw.js'),`const CACHE=${JSON.stringify(cache)},ASSETS=${JSON.stringify(paths)};
${body}`);
  }
 };
}

export default defineConfig({ plugins: [react(),notebookOfflineShell()], base: "/app/", resolve: { dedupe: ["react", "react-dom"] }, build: { outDir: "pwa-dist", emptyOutDir: true, rollupOptions: { input: resolve(process.cwd(), "pwa/index.html") } } });
