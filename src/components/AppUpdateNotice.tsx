import "./account-surfaces.css";
import { useSyncExternalStore } from 'react';
import { appUpdates } from '../lib/nativeUpdates';
export function AppUpdateNotice({ onOpen }: { onOpen: () => void }) {
  const state = useSyncExternalStore(appUpdates.subscribe, appUpdates.snapshot);
  if (!['available', 'ready', 'installed'].includes(state.phase)) return null;
  return <div className="app-update-notice" role="status" aria-atomic="true"><span>Dowze Academie {state.version} : {state.phase === 'available' ? 'mise à jour disponible' : state.phase === 'ready' ? 'sera installée au prochain lancement' : 'redémarrage nécessaire'}.</span><button type="button" className="text-button" onClick={onOpen}>Détails de la mise à jour</button></div>;
}
