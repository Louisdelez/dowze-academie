import { appStorage } from './appStorage';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { relaunch } from '@tauri-apps/plugin-process';
import { AppUpdates, type UpdateArtifact } from './appUpdates';
import { automaticUpdateCycle } from './automaticUpdateCycle';
import { isTauri, secureAiPanelForAccountTransition } from './tauri';
interface NativeRelease { version: string; body?: string }
export const appUpdates = new AppUpdates({
  check: async () => {
    const release = await invoke<NativeRelease | null>('automatic_update_probe');
    if (!release) return null;
    return {
      version: release.version, body: release.body,
      download: async progress => {
        const unlisten = await listen<{ event: string; data?: { contentLength?: number; chunkLength?: number } }>('automatic-update-download', event => progress(event.payload));
        try { await invoke<number>('automatic_update_stage', { version: release.version }); progress({ event: 'Finished' }); }
        finally { unlisten(); }
      },
      install: async () => { await invoke('automatic_update_apply'); },
      close: async () => {},
    } satisfies UpdateArtifact;
  },
  prepare: async () => {
    await appStorage.flush();
    await secureAiPanelForAccountTransition('freechat');
  },
  restart: relaunch,
  recover: async () => {},
});
let started = false;
export function startUpdateChecks() {
  if (started || !isTauri()) return;
  started = true;
  const checkWhenDue = (force = false) => {
    if (!navigator.onLine) return;
    const state = appUpdates.snapshot();
    const due = force || !state.checkedAt || state.phase === 'error' || Date.now() - state.checkedAt >= 6 * 60 * 60 * 1000;
    void automaticUpdateCycle(appUpdates, due);
  };
  window.setTimeout(() => checkWhenDue(), 15000);
  window.setInterval(() => checkWhenDue(), 6 * 60 * 60 * 1000);
  window.addEventListener('online', () => checkWhenDue(true));
}
