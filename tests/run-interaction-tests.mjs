import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', {url:'https://desktop.test.invalid',pretendToBeVisual:true});
for (const name of ['window','document','HTMLElement','HTMLInputElement','HTMLTextAreaElement','Node','Event','MouseEvent','KeyboardEvent','CustomEvent','navigator']) Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true,writable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no layout engine. Focus visibility is stubbed only for keyboard tests;
// this suite makes no claim about visual size, placement, clipping or WebKit.
dom.window.HTMLElement.prototype.getClientRects = function () {return this.hidden ? [] : [{}];};
const directory = await mkdtemp(join(process.cwd(),'tests/.interactions-'));
try {
 await build({configFile:false,plugins:[react()],build:{ssr:'tests/ui-interactions.tsx',outDir:directory,rollupOptions:{output:{entryFileNames:'checks.mjs'}}},logLevel:'warn'});
 process.env.NODE_ENV = 'test';
 await import(pathToFileURL(join(directory,'checks.mjs')).href);
} finally {await rm(directory,{recursive:true,force:true});dom.window.close();}
