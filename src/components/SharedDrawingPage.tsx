import "./studio-tools.css";
import { useEffect, useMemo, useState } from 'react';
import { Drawing } from '../../pwa/src/Drawing';
import { listDrafts, type Draft } from '../../pwa/src/storage';
import { SharedFiles } from '../../pwa/src/SharedFiles';
import { synchronizeSpace } from '../../pwa/src/sync';
import { nativeServerClient } from '../lib/nativeServerClient';
import { continuousSync } from '../lib/continuousSync';

export function SharedDrawingPage({ accountId, serverAccountId, spaceId }: { accountId: string; serverAccountId: string; spaceId: string }) {
  const api = useMemo(() => nativeServerClient(accountId, serverAccountId), [accountId, serverAccountId]);
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState('');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  useEffect(() => {
    let stopped = false;
    const sync = continuousSync(async () => {
      await synchronizeSpace(api, serverAccountId, spaceId, () => !stopped);
      const items = await listDrafts(serverAccountId, spaceId);
      if (!stopped) setDrafts(items);
      const draft = items.find(item => item.type === 'whiteboard' && item.documentId === 'whiteboard-main');
      if (!stopped) setVersion(draft?.baseVersion ?? 0);
    }, error => { if (!stopped) setNotice(String(error)); });
    const resume = () => sync.request(true);
    addEventListener('online', resume); resume();
    return () => { stopped = true; sync.stop(); removeEventListener('online', resume); };
  }, [api, serverAccountId, spaceId]);
  return <section className="shared-drawing-page studio-tools" aria-label="Notes dessinées et photos"><header className="studio-drawing-header"><div><span className="studio-eyebrow">MON CARNET · DESSIN</span><h2>Expliquez vos idées en dessin</h2><p>Un schéma, une formule ou une photo pour donner forme à votre cours.</p></div><span className="studio-drawing-badge">Sauvegarde locale automatique</span></header>
    {notice && <p className="studio-drawing-notice" role="status">{notice}</p>}
    <Drawing key={`${serverAccountId}:${spaceId}`} api={api} accountId={serverAccountId} spaceId={spaceId} syncedVersion={version} onNotice={setNotice} />
    <SharedFiles api={api} accountId={serverAccountId} spaceId={spaceId} drafts={drafts} />
  </section>;
}
