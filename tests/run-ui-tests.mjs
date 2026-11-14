import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const directory = await mkdtemp(join(process.cwd(), 'tests/.markup-'));
try {
  await build({configFile:false,plugins:[react()],build:{ssr:'tests/ui-regression.tsx',outDir:directory,rollupOptions:{output:{entryFileNames:'checks.mjs'}}},logLevel:'warn'});
  await import(pathToFileURL(join(directory,'checks.mjs')).href);
} finally { await rm(directory,{recursive:true,force:true}); }
