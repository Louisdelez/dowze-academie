import "./account-surfaces.css";
import { useEffect, useState, useSyncExternalStore } from 'react';
import { appStorage } from '../lib/appStorage';
import { SlimeSprite } from './DowzyMascot';
import { appUpdates } from '../lib/nativeUpdates';
import { savedSlimeColor } from '../lib/dowzy';
export function StartupSplash({ label = 'Ouverture de ton espace…', installing = false }: { label?: string; installing?: boolean }) {
  useSyncExternalStore(appStorage.subscribe, appStorage.snapshot);
  const rememberedStage = appStorage.getItem('dowze.mascot.launch-stage');
  const stage = rememberedStage === 'teen' || rememberedStage === 'adult' || rememberedStage === 'sage' ? rememberedStage : 'baby';
  const [update, setUpdate] = useState(() => appUpdates.snapshot());
  useEffect(() => appUpdates.subscribe(() => setUpdate(appUpdates.snapshot())), []);
  const downloading = update.phase === 'downloading';
  const percent = downloading && update.total && update.total > 0 ? Math.max(0, Math.min(100, update.received / update.total * 100)) : undefined;
  const text = installing ? 'Installation de la mise à jour…' : downloading ? 'Téléchargement de la mise à jour…' : update.phase === 'checking' ? 'Recherche de mise à jour…' : label;
  return <main className="dowzy-startup" aria-label="Démarrage de Dowze Académie">
    <div className="startup-identity"><strong>Dowze Academie</strong><span>Votre espace d’étude</span></div>
    <SlimeSprite color={savedSlimeColor()} stage={stage} animation={downloading || installing ? 'working' : 'idle'} size={stage === 'sage' ? 176 : 144} />
    <div className={`dowzy-progress ${percent === undefined ? 'is-indeterminate' : ''}`} role="progressbar" aria-label={text} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent === undefined ? undefined : Math.round(percent)} aria-valuetext={percent === undefined ? text : `${Math.round(percent)} %`}><span style={percent === undefined ? undefined : { width: `${percent}%` }} /></div>
    <span className="dowzy-startup-label" role="status" aria-atomic="true">{text}</span>
    {percent !== undefined && <small className="startup-percent" aria-hidden="true">{Math.round(percent)} %</small>}
  </main>;
}
