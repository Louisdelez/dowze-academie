import "./account-surfaces.css";
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Cloud, CloudOff, RefreshCw, AlertCircle, Check } from 'lucide-react';
import { appStorage } from '../lib/appStorage';
import type { ServerSyncController } from '../hooks/useServerSync';
export function CloudSyncStatus({ sync, onOpen }: { sync: ServerSyncController; onOpen: () => void }) {
  useSyncExternalStore(appStorage.subscribe, appStorage.snapshot);
  const cache = appStorage.status();
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => { const update = () => setOnline(navigator.onLine); addEventListener('online', update); addEventListener('offline', update); return () => { removeEventListener('online', update); removeEventListener('offline', update); }; }, []);
  const conflict = Object.keys(sync.conflicts).length > 0||sync.notebookConflicts>0;
  const failed = Boolean(cache.error || (sync.notice && !sync.notice.startsWith('Synchronisé à') && !sync.busy));
  const Icon = cache.error || conflict || failed ? AlertCircle : !online ? CloudOff : sync.busy || cache.pending ? RefreshCw : !sync.linked || sync.dirty ? Cloud : Check;
  const label = cache.error ? 'Enregistrement interrompu' : conflict ? 'Versions à départager' : !sync.linked ? 'Connecter mon compte' : !online ? 'Hors ligne · cache sur cet appareil' : sync.busy || cache.pending ? 'Synchronisation…' : failed ? 'Synchronisation en attente' : sync.dirty ? 'Changements à synchroniser' : 'Synchronisé';
  return <div className="cloud-sync-bar"><button type="button" aria-label={`${label}. Ouvrir les réglages de synchronisation`} className={`cloud-sync-pill ${sync.busy || cache.pending ? 'is-busy' : ''} ${cache.error || conflict || failed ? 'needs-attention' : ''}`} onClick={onOpen} title={cache.error || sync.notice || (sync.linked ? 'Compte relié à Dowze-01. Ouvrir les détails de synchronisation.' : 'Ce profil reste sur cet appareil. Connecter un compte pour synchroniser.')}><Icon size={14} aria-hidden="true"/><span role="status" aria-live="polite">{label}</span></button></div>;
}
