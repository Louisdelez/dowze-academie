import "./account-surfaces.css";
import { useState, useSyncExternalStore } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { appUpdates } from '../lib/nativeUpdates';
import { isTauri } from '../lib/tauri';
import { Modal } from './Modal';
import packageInfo from '../../package.json';

export function AppUpdateSettings() {
  const state = useSyncExternalStore(appUpdates.subscribe, appUpdates.snapshot);
  const [confirm, setConfirm] = useState(false);
  const busy = ['checking', 'downloading', 'installing'].includes(state.phase);
  return <section id="settings-updates" className="settings-section app-update-settings" aria-labelledby="app-update-title">
    <div className="settings-title"><RefreshCw aria-hidden="true" /><div><h2 id="app-update-title">Mises à jour</h2><p>Dowze Academie {packageInfo.version}</p></div></div>
    <p>Les mises à jour signées sont téléchargées automatiquement en arrière-plan et installées au prochain lancement. Vous pouvez continuer à travailler sans interruption.</p>
    {!isTauri() ? <p>Disponible dans l’application Desktop.</p> : <>
      <div className="update-state" role="status" aria-live="polite" aria-atomic="true">
        {state.phase === 'idle' && 'Vérifiez la disponibilité d’une nouvelle version.'}
        {state.phase === 'checking' && 'Recherche d’une mise à jour…'}
        {state.phase === 'current' && 'Votre application est à jour.'}
        {['available', 'ready', 'installed'].includes(state.phase) && <strong>Version {state.version} {state.phase === 'available' ? 'disponible' : state.phase === 'ready' ? 'prévue au prochain lancement' : 'installée'}</strong>}
        {state.phase === 'downloading' && <><p>Téléchargement : {(state.received / 1048576).toFixed(1)} Mo{state.total ? ` / ${(state.total / 1048576).toFixed(1)} Mo` : ''}</p><progress aria-label="Téléchargement de la mise à jour" value={state.total ? state.received : undefined} max={state.total || undefined} /></>}
        {state.phase === 'installing' && 'Installation de la mise à jour…'}
      </div>
      {state.notes && <details className="update-release-notes"><summary>Nouveautés de cette version</summary><p className="app-update-notes">{state.notes.slice(0, 5000)}</p></details>}
      {state.error && <p role="alert">{state.error}</p>}
      <div className="app-update-actions">
        {!['ready', 'installed'].includes(state.phase) && <button className="secondary-button" disabled={busy} onClick={() => void appUpdates.check()}><RefreshCw aria-hidden="true" /> Vérifier maintenant</button>}
        {['available', 'error'].includes(state.phase) && state.version && <button className="primary-button" disabled={busy} onClick={() => void appUpdates.download()}><Download aria-hidden="true" /> Télécharger la mise à jour</button>}
        {state.phase === 'ready' && <button className="primary-button" onClick={() => setConfirm(true)}>Installer et redémarrer</button>}
        {state.phase === 'installed' && <button className="primary-button" onClick={() => void appUpdates.restart()}>Redémarrer maintenant</button>}
      </div>
    </>}
    {confirm && <Modal title="Installer la mise à jour" onClose={() => setConfirm(false)}>
      <p>Terminez les réponses IA en cours et enregistrez vos brouillons. L’application va se fermer et redémarrer ; vos comptes, formations et données restent conservés.</p>
      <div className="modal-actions"><button className="secondary-button" onClick={() => setConfirm(false)}>Plus tard</button><button className="primary-button" onClick={() => { setConfirm(false); void appUpdates.install(); }}>Installer et redémarrer</button></div>
    </Modal>}
  </section>;
}
