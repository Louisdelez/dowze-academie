import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const config=JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json',import.meta.url),'utf8'));
test('Le desktop livré reste une fenêtre native normale, redimensionnable',()=>{
 const main=config.app.windows.find((w: {label:string})=>w.label==='main');
 assert.equal(main.decorations,true);assert.equal(main.resizable,true);
 assert.ok(main.width>=main.minWidth && main.height>=main.minHeight);
 assert.ok(main.minWidth<=900 && main.minHeight<=600,'Reste utilisable sur le Dell à une taille raisonnable');
});
test('La fin du démarrage ne réinitialise pas une fenêtre déjà déplacée ou maximisée',()=>{
 const source=readFileSync(new URL('../src-tauri/src/startup_window.rs',import.meta.url),'utf8');
 assert.ok(!/window\.(?:set_size|center|unmaximize|minimize)\s*\(/.test(source));
});
test('Les composants interactifs ne déclenchent plus le déplacement natif',()=>{
 for(const name of ['WorkspaceTabs','Sidebar','AiPanel','AuthPage','StartupSplash']) {
  const source=readFileSync(new URL(`../src/components/${name}.tsx`,import.meta.url),'utf8');
  assert.ok(!source.includes('data-tauri-drag-region'),name);
 }
});
