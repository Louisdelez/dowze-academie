import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, relative, sep } from "node:path";
import {readFile,writeFile,readdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
/** The offline shell includes lazy workers and WASM codecs. API responses and private note/audio data are never cached here. */
export function notebookOfflineShell(entryFile="pwa/index.html"){let output='';return {name:'dowze-notebook-offline-shell',apply:'build' as const,configResolved(config:{build:{outDir:string}}){output=resolve(config.build.outDir);},async closeBundle(){
 await copyFile(resolve(output,entryFile),resolve(output,'index.html'));
 const paths:string[]=[];async function walk(directory:string){for(const entry of await readdir(directory,{withFileTypes:true})){const file=resolve(directory,entry.name);if(entry.isDirectory())await walk(file);else if(entry.name!=='sw.js')paths.push('/app/'+relative(output,file).split(sep).join('/'));}}await walk(output);paths.push('/app/');paths.sort();
 const digest=createHash('sha256');for(const path of paths){digest.update(path);if(path!=='/app/')digest.update(await readFile(resolve(output,path.slice(5))));}const cache='dowze-shell-notebook-'+digest.digest('hex').slice(0,16);
 const source=`const CACHE=${JSON.stringify(cache)},ASSETS=${JSON.stringify(paths)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('dowze-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith('/app/'))return;if(request.mode==='navigate')event.respondWith(fetch(request).catch(()=>caches.match('/app/index.html')));else if(ASSETS.includes(url.pathname))event.respondWith(caches.match(request,{ignoreVary:true}).then(cached=>cached||fetch(request)));});`;
 await writeFile(resolve(output,'sw.js'),source);
 }};}

export default defineConfig({ plugins: [react(),notebookOfflineShell()], base: "/app/", resolve: { dedupe: ["react", "react-dom"] }, build: { outDir: "pwa-dist", emptyOutDir: true, rollupOptions: { input: resolve(process.cwd(), "pwa/index.html") } } });
