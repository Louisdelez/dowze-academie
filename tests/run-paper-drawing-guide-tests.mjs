import {build} from 'vite';
import react from '@vitejs/plugin-react';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://drawing-guide.test.invalid',pretendToBeVisual:true});
for(const name of ['window','document','HTMLElement','HTMLInputElement','HTMLSelectElement','Node','Event','MouseEvent','KeyboardEvent','CustomEvent','navigator'])Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true,writable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
// JSDOM does not implement pointer capture or visual layout. This checks event
// ownership and DOM controls only; physical screen size/device support is separate.
dom.window.SVGElement.prototype.setPointerCapture=function(id){this.__captured=id;};
dom.window.SVGElement.prototype.releasePointerCapture=function(id){if(this.__captured===id)delete this.__captured;};
const directory=await mkdtemp(join(process.cwd(),'tests/.drawing-guide-'));
try {await build({configFile:false,plugins:[react()],build:{ssr:'tests/paper-drawing-guide-interactions.tsx',outDir:directory,rollupOptions:{output:{entryFileNames:'checks.mjs'}}},logLevel:'warn'});process.env.NODE_ENV='test';await import(pathToFileURL(join(directory,'checks.mjs')).href);}
finally {await rm(directory,{recursive:true,force:true});dom.window.close();}
