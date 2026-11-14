import {serverDocumentsChangeSignature} from '../lib/serverDocumentProjection';
import {nativeServerClient} from '../lib/nativeServerClient';
import type {NotebookMediaScope} from '../components/NotebookEditor';
import {synchronizeSpace} from '../../pwa/src/sync';
import {listDrafts,listLocalBlobs} from '../../pwa/src/storage';
import {ownsNotebookMediaDocument,ownsPaperDocument} from '../lib/notebookDocument';
import {prepareNotebookMetadataPublication} from '../lib/notebookAnnualSync';
import {notebookMetadataSyncTransport} from '../lib/noteMetadataTransport';
import { appStorage } from "../lib/appStorage";
import { useCallback, useEffect, useRef, useState } from 'react';
import type { InstalledFormation } from '../lib/formations';
import { serverRequest, serverAccountTransition } from '../lib/server';
import { continuousSync } from '../lib/continuousSync';
import { listServerSpaces, defaultServerSpace, needsSpaceCreation, type SpacePage } from '../lib/serverSpaces';
import { canonical, emptySyncState, syncDocuments, type RemoteDocument, type SyncDocument, type SyncState } from '../lib/serverSync';
interface LinkedAccount { id: string; email: string }
export function useServerSync(accountId: string, formation: InstalledFormation, documents: SyncDocument[], apply: (document: RemoteDocument) => boolean, pristine?: (document: SyncDocument) => boolean, prepareNotebook?: (target:NotebookMediaScope,current:()=>boolean)=>Promise<unknown>, documentsSignature?: string) {
  const linkKey = `dowze.server.link.${accountId}`;
  const [linked, setLinked] = useState<LinkedAccount | null>(() => {
    try { const value = JSON.parse(appStorage.getItem(linkKey) ?? 'null'); return typeof value?.id === 'string' && typeof value.email === 'string' ? value : null; } catch { return null; }
  });
  const mappingKey = linked ? `dowze.server.space.${accountId}.${linked.id}.${formation.instanceId}` : '';
  const [remoteSpace, setRemoteSpace] = useState('');
  const [spaces, setSpaces] = useState<{ id: string; title: string; academic_year: string; formation_id: string }[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(true);const [notebookPending,setNotebookPending]=useState(false),[notebookConflicts,setNotebookConflicts]=useState(0);const preparing=useRef(false);
  const visibleConflicts=(values:SyncState['conflicts'])=>Object.fromEntries(Object.entries(values).filter(([key])=>!ownsNotebookMediaDocument(key.split('|')[0],key.split('|')[1]??'')));
  const [conflicts, setConflicts] = useState<SyncState['conflicts']>({});
  const latest = useRef({ documents, apply, pristine }); latest.current = { documents, apply, pristine };
  const epoch = useRef(0); const running = useRef(false);
  const verifiedSpace = useRef({ key: '', at: 0 });
  const stateKey = linked && remoteSpace ? `dowze.server.sync.${accountId}.${linked.id}.${formation.instanceId}.${remoteSpace}` : null;
  const read = useCallback((): SyncState => {
    if (!stateKey) throw new Error('Connectez votre compte serveur.');
    const raw = appStorage.getItem(stateKey); if (!raw) return emptySyncState();
    const state = JSON.parse(raw);
    if (state?.schema !== 1 || !state.base || !state.pending || !state.deletions || !state.conflicts || !Array.isArray(state.resolved)) throw new Error('Journal de synchronisation illisible ; il est conservé.');
    return state;
  }, [stateKey]);
  const save = useCallback(async (state: SyncState) => {
    if (!stateKey) throw new Error('Compte serveur absent.');
    const raw = JSON.stringify(state); appStorage.setItem(stateKey, raw);
    if (appStorage.getItem(stateKey) !== raw) throw new Error('La synchronisation ne peut pas être enregistrée localement.');
    await appStorage.flush();
    setConflicts(visibleConflicts(state.conflicts));
  }, [stateKey]);
  const synchronize = useCallback(async (propagateError = false) => {
    if (!linked || !remoteSpace || running.current || preparing.current || serverAccountTransition(accountId)||appStorage.getItem(mappingKey)!==remoteSpace) return;
    running.current = true; setBusy(true); const generation = epoch.current;
    const current = () => generation === epoch.current && !serverAccountTransition(accountId) && appStorage.getItem(linkKey) === JSON.stringify(linked)&&appStorage.getItem(mappingKey)===remoteSpace;
    try {
      const { manifest } = formation;
      const year = `${manifest.academicYear.startDate.slice(0, 4)}-${manifest.academicYear.endDate.slice(0, 4)}`;
      const checkKey = `${linked.id}|${remoteSpace}|${formation.packageId}|${year}`;
      if (verifiedSpace.current.key !== checkKey || Date.now() - verifiedSpace.current.at > 60000) {
      const available = await listServerSpaces(after => serverRequest<SpacePage>(accountId, 'GET', `/v1/spaces?limit=500${after ? `&after=${encodeURIComponent(after)}` : ''}`), current);
      if (!current()) return;
      const desired = { id: remoteSpace, formation_id: formation.packageId, academic_year: year, title: manifest.name };
      if (needsSpaceCreation(available, desired)) {
        await serverRequest(accountId, 'PUT', `/v1/spaces/${remoteSpace}`, { formation_id: desired.formation_id, academic_year: desired.academic_year, title: desired.title });
      }
      verifiedSpace.current = { key: checkKey, at: Date.now() };
      }
      if (!current()) return;
      await appStorage.flush();
      const notebookApi=nativeServerClient(accountId,linked.id);await synchronizeSpace(notebookApi,linked.id,remoteSpace,current);if(!current())return;
      const drafts=(await listDrafts(linked.id,remoteSpace)).filter(d=>ownsPaperDocument(d.type,d.documentId)),blobs=await listLocalBlobs(linked.id,remoteSpace);setNotebookPending(drafts.some(d=>!d.staged&&d.syncState!=='synced')||blobs.some(b=>!b.removedFromNote&&b.status==='pending'));setNotebookConflicts(drafts.filter(d=>d.syncState==='conflict').length);
      const state = read();
      await syncDocuments({ state, save: () => save(state), documents: () => latest.current.documents, pristine: document => latest.current.pristine?.(document) ?? false,
        prioritizeNotes:true,
        canPublish:document=>prepareNotebookMetadataPublication(notebookApi,{accountId:linked.id,spaceId:remoteSpace},document,current,()=>appStorage.flush()),
        apply: remote => {
          if (!current() || !latest.current.apply(remote)) return false;
          // Reflect the synchronous persistent setter before React's next render.
          const remaining = latest.current.documents.filter(item => item.type !== remote.document_type || item.id !== remote.document_id);
          if (!remote.deleted && remote.content) remaining.push({ type: remote.document_type, id: remote.document_id, content: remote.content });
          latest.current = { ...latest.current, documents: remaining }; return true;
        }, current, id: () => crypto.randomUUID(), transport: notebookMetadataSyncTransport({
          changes: cursor => serverRequest(accountId, 'GET', `/v1/spaces/${remoteSpace}/changes${cursor ? `?cursor=${cursor}&limit=500` : '?limit=500'}`),
          put: (document, version, mutationId) => serverRequest(accountId, 'PUT', `/v1/spaces/${remoteSpace}/documents/${document.type}/${document.id}`, { base_version: version, content: document.content }, mutationId),
          remove: (type, id, version, mutationId) => serverRequest(accountId, 'DELETE', `/v1/spaces/${remoteSpace}/documents/${type}/${id}?base_version=${version}`, undefined, mutationId),
        },{accountId:linked.id,spaceId:remoteSpace},current) });
      if (current()) { setDirty(latest.current.documents.some(item => !ownsNotebookMediaDocument(item.type,item.id)&&canonical(state.base[`${item.type}|${item.id}`]?.content) !== canonical(item.content)) || Object.keys(visibleConflicts(state.conflicts)).length > 0 || [...Object.keys(state.pending),...Object.keys(state.deletions)].some(key=>!ownsNotebookMediaDocument(key.split('|')[0],key.split('|')[1]??'')));
      setNotice(Object.keys(visibleConflicts(state.conflicts)).length||drafts.some(d=>d.syncState==='conflict') ? 'Des modifications concurrentes sont à départager. Les deux copies sont conservées.' : `Synchronisé à ${new Date().toLocaleTimeString('fr-CH')}.`); }
    } catch (error) { if (current()) setNotice(String(error)); if (propagateError) throw error; }
    finally { running.current = false; if (current()) setBusy(false); }
  }, [accountId, formation, linked, remoteSpace, read, save, linkKey,mappingKey]);
  const scheduler = useRef<ReturnType<typeof continuousSync> | null>(null);
  useEffect(() => {
    epoch.current++;
    const sync = continuousSync(() => synchronize(true), error => setNotice(String(error)));
    scheduler.current = sync;
    const resume = () => sync.request(true);
    const visible = () => { if (document.visibilityState === 'visible') resume(); };
    addEventListener('online', resume); addEventListener('focus', resume);
    document.addEventListener('visibilitychange', visible);
    resume();
    return () => {
      epoch.current++; sync.stop(); scheduler.current = null;
      removeEventListener('online', resume); removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [synchronize]);
  useEffect(() => { setDirty(true); scheduler.current?.request(); }, [serverDocumentsChangeSignature(documents,documentsSignature)]);
  const openSpace=useCallback(async(id:string,current:()=>boolean)=>{
    if(!linked||!current())return;preparing.current=true;setBusy(true);epoch.current++;
    try{if(prepareNotebook)await prepareNotebook({accountId:linked.id,spaceId:id,api:nativeServerClient(accountId,linked.id)},current);if(!current())return;appStorage.setItem(mappingKey,id);await appStorage.flush();if(current()){setRemoteSpace(id);setNotice('');}}
    finally{preparing.current=false;if(current())setBusy(false);}
  },[accountId,linked,mappingKey,prepareNotebook]);
  useEffect(() => {
    let cancelled=false;setSpaces([]);if(!linked)setRemoteSpace('');
    const current=()=>!cancelled&&!serverAccountTransition(accountId)&&appStorage.getItem(linkKey)===JSON.stringify(linked);
    if(linked){
      listServerSpaces(after=>serverRequest<SpacePage>(accountId,'GET',`/v1/spaces?limit=500${after?`&after=${encodeURIComponent(after)}`:''}`),current).then(async result=>{
        if(!current())return;const year=`${formation.manifest.academicYear.startDate.slice(0,4)}-${formation.manifest.academicYear.endDate.slice(0,4)}`;
        const compatible=result.filter(item=>item.formation_id===formation.packageId&&item.academic_year===year);setSpaces(compatible);
        let id=mappingKey?appStorage.getItem(mappingKey):null;
        if(!id){if(compatible.length>1){setNotice('Plusieurs exemplaires de cette année existent : choisissez celui à retrouver.');return;}id=compatible[0]?.id??await defaultServerSpace(linked.id,formation.packageId,year);}
        if(!current())return;const desired={id,formation_id:formation.packageId,academic_year:year,title:formation.manifest.name};
        if(needsSpaceCreation(result,desired))await serverRequest(accountId,'PUT',`/v1/spaces/${id}`,{formation_id:desired.formation_id,academic_year:desired.academic_year,title:desired.title});
        if(!current())return;
        // A confirmed newly created annual ID must also exist in the controlled
        // select's options. Existing server labels/identities remain exact.
        setSpaces(previous=>{
          if(!current()||previous.some(space=>space.id===desired.id))return previous;
          return [...previous,compatible.find(space=>space.id===desired.id)??desired];
        });
        await openSpace(id,current);
      }).catch(error=>{if(!cancelled)setNotice(String(error instanceof Error?error.message:error));});
    }
    return()=>{cancelled=true;};
  },[accountId,linked,mappingKey,formation,openSpace]);
  async function chooseSpace(id:string){
    if(!linked||!mappingKey||running.current||preparing.current||![formation.instanceId,...spaces.map(item=>item.id)].includes(id))return;
    const expected=JSON.stringify(linked),current=()=>!serverAccountTransition(accountId)&&appStorage.getItem(linkKey)===expected;
    try{const year=`${formation.manifest.academicYear.startDate.slice(0,4)}-${formation.manifest.academicYear.endDate.slice(0,4)}`;
      if(id===formation.instanceId)await serverRequest(accountId,'PUT',`/v1/spaces/${id}`,{formation_id:formation.packageId,academic_year:year,title:formation.manifest.name});await openSpace(id,current);
    }catch(error){if(current())setNotice(String(error instanceof Error?error.message:error));}
  }
  async function connect(email: string, password: string, register: boolean) {
    if (running.current||preparing.current) return; running.current = true; setBusy(true); const generation = epoch.current;
    try {
      const ownerKey = `dowze.server.owner.${accountId}`;
      const owner = JSON.parse(appStorage.getItem(ownerKey) ?? appStorage.getItem(linkKey) ?? 'null') as LinkedAccount | null;
      if (owner && owner.email.toLowerCase() !== email.trim().toLowerCase()) throw new Error('Ce profil appartient déjà à un autre compte synchronisé. Déconnectez le profil Desktop, puis connectez-vous avec votre autre compte pour ouvrir son espace séparé.');
      serverAccountTransition(accountId, true);
      if (register) await serverRequest(accountId, 'POST', '/v1/accounts', { email, password });
      await serverRequest(accountId, 'POST', '/v1/sessions', { email, password });
      const me = await serverRequest<LinkedAccount>(accountId, 'GET', '/v1/me');
      if (generation !== epoch.current) return;
      if (owner && owner.id !== me.id) throw new Error('L’identité du compte ne correspond pas à ce profil.');
      appStorage.setItem(ownerKey, JSON.stringify(me));
      appStorage.setItem(linkKey, JSON.stringify(me)); setLinked(me); window.dispatchEvent(new Event('dowze:server-account')); setNotice('Compte connecté. Synchronisation automatique de votre année.');
    } catch (error) { if (generation === epoch.current) setNotice(String(error)); }
    finally { serverAccountTransition(accountId, false); running.current = false; if (generation === epoch.current) setBusy(false); }
  }
  async function disconnect() {
    if (linked) appStorage.setItem(`dowze.server.owner.${accountId}`, JSON.stringify(linked));
    epoch.current++; appStorage.removeItem(linkKey); setLinked(null); setConflicts({}); setBusy(false);
    try { await serverRequest(accountId, 'DELETE', '/v1/sessions'); setNotice('Compte serveur déconnecté. Les données locales sont conservées.'); } catch (error) { setNotice(`Synchronisation arrêtée. Révocation serveur non confirmée : ${String(error)}`); }
  }
  async function resolve(key: string, choice: 'local' | 'server') {
    if (running.current) return;
    running.current = true; setBusy(true);
    try {
      const state = read(), conflict = state.conflicts[key]; if (!conflict) return;
      const local = latest.current.documents.find(item => `${item.type}|${item.id}` === key) ?? null;
      if (canonical(local) !== canonical(conflict.local)) { setNotice('La copie locale a changé ; relancez la synchronisation avant de choisir.'); return; }
      // Keep both versions before applying the user's explicit choice.
      state.resolved.push(conflict); await save(state);
      if (choice === 'server' && !latest.current.apply(conflict.remote)) throw new Error('La version serveur ne peut pas être enregistrée.');
      state.base[key] = { version: conflict.remote.version, content: conflict.remote.deleted ? null : conflict.remote.content };
      delete state.conflicts[key]; delete state.pending[key]; delete state.deletions[key]; await save(state);
      setNotice('Choix enregistré. Les versions précédentes restent dans le journal local.');
    } catch (error) { setNotice(String(error)); }
    finally { running.current = false; setBusy(false); scheduler.current?.request(); }
  }
  return { dirty:dirty||notebookPending, notebookPending,notebookConflicts,preparingNotes:preparing.current, linked, busy, notice, conflicts, connect, disconnect, synchronize, resolve, remoteSpace, spaces, chooseSpace, localSpace: formation.instanceId };
}
export type ServerSyncController = ReturnType<typeof useServerSync>;
