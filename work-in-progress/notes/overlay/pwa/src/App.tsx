import {PAPER_TEXT_STYLE_DOCUMENT_CODEC} from '../../src/lib/notebookDocumentCodec';
import {createNotebookSharedCollection} from '../../src/lib/notebookSharedCollection';
import {createManagedLibraryTrashAction} from '../../src/lib/notebookManagedLibraryActions';
import {NotebookManagedControls} from '../../src/components/NotebookManagedControls';
import {createNotebookManagedApplication} from '../../src/lib/notebookManagedApplication';
import {openNotebookStateDatabase} from './storage';
import {PwaNotePane} from './PwaNotePane';
import type {PaperSearchNavigation,PaperSearchOpenRequest} from '../../src/lib/notebookSearchNavigation';
import {notebookDocumentId} from '../../src/lib/notebookDocument';
import {settleNotebookAccount,resumeNotebookAccount,disposeNotebookAccount,runNotebookOperation} from '../../src/lib/notebookSession';
import {capturePrivateNotebookResolution} from '../../src/lib/paperPrivateResolution';
import { Search, ChevronLeft, BookOpen, GraduationCap, NotebookPen, CheckSquare2 } from 'lucide-react';
import appMark from '../../src/assets/generated/etude-app-mark-v3.webp';
import { defaultServerSpace } from '../../src/lib/serverSpaces';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StudyProgress, StudyTasks } from './StudyProgress';
import { SharedFiles } from './SharedFiles';
import { StudyPlanning, StudyResults } from './StudyRecords';
import { CourseReader } from './CourseReader';
import { flushMutations, synchronizeSpace } from './sync';
import { sharedFormationManifest } from '../../src/lib/sharedFormation';
import { continuousSync } from '../../src/lib/continuousSync';
import { validateAndCompileFormationPackage, type FormationPackageFiles } from '../../src/lib/formations';
import { ApiClient, ApiError, type Account, type CatalogEntry, type AnnualSpace } from './api';
import { DraftChangedError, queueLocalDrafts, putEditedDraft, listSnapshots, putSnapshot, clearPrivateCache, forkConflictedDraft, resolveConflictedDocument, deleteDraft, saveDraftAndQueue, listDrafts, listLocalBlobs, listMutations, putDraft, putLocalBlob, type Draft, type LocalBlob } from './storage';

import {NotebookLibraryView} from '../../src/components/NotebookLibraryView';
import {useNotebookLibrary} from '../../src/hooks/useNotebookLibrary';
import {useNotebookSplitWorkspace} from '../../src/hooks/useNotebookSplitWorkspace';
import {PersistentWorkspacePanel} from '../../src/components/PersistentWorkspacePanel';
import {notebookIdentityDigest} from '../../src/lib/notebookIdentity';
import {NotebookSplitControls,NotebookSplitSeparator} from '../../src/components/NotebookSplitControls';
import type {CSSProperties} from 'react';
import { NotebookEditor,type NotebookMirrorExpectation } from '../../src/components/NotebookEditor';
import { LEGACY_NOTE_ID,hasLegacyDrawing } from '../../src/lib/notebook';

const api = new ApiClient(import.meta.env.VITE_API_BASE_URL ?? '',fetch,undefined,{documentCodec:PAPER_TEXT_STYLE_DOCUMENT_CODEC});

type Tab = 'notes' | 'drawing' | 'planning' | 'courses' | 'formations' | 'documents';
const TABS: readonly [Tab, string][] = [['notes', 'Notes'], ['planning', 'Planning'], ['courses', 'Cours'], ['formations', 'Catalogue'], ['documents','Documents']];
const TAB_HINTS: Record<Tab, string> = { notes: 'Vos idées, vos cours et vos révisions, au même endroit.', drawing: 'Un espace libre pour expliquer, dessiner et mémoriser.', planning: 'Organisez votre semaine et avancez à votre rythme.', courses: 'Retrouvez vos cours et suivez votre progression.', formations: 'Choisissez la formation qui accompagne votre année.', documents: 'Vos évaluations et vos documents de référence.' };
function SectionIcon({ tab }: { tab: Tab }) {
  const paths: Record<Tab, string> = { notes: 'M6 3h9l3 3v15H6z M9 10h6 M9 14h6 M9 18h4', drawing: 'M4 20l4-1L20 7l-3-3L5 16z M14 7l3 3', planning: 'M4 6h16v15H4z M8 3v6 M16 3v6 M4 11h16 M8 15h2 M14 15h2', courses: 'M12 6C8 3 4 4 3 5v15c4-2 7-1 9 1 2-2 5-3 9-1V5c-1-1-5-2-9 1z M12 6v15', formations: 'M3 8l9-5 9 5-9 5z M6 10v7c4 3 8 3 12 0v-7 M21 8v8', documents: 'M8 3h9l3 3v14H8z M4 7v16h12 M11 10h6 M11 14h6' };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[tab]} /></svg>;
}
const uid = () => crypto.randomUUID();

function Auth({ onReady }: { onReady: (account: Account) => void }) {
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setMessage('');
    try {
      if (register) { await api.register(email.trim(), password); setRegister(false); setMessage('Compte créé. Connectez-vous.'); return; }
      await api.login(email.trim(), password); onReady(await api.me());
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Connexion impossible. Réessayez.'); } finally { setBusy(false); }
  }
  return <main className="auth-shell"><section className="auth-card">
    <div className="brand"><img className="brand-mark" src={appMark} alt="" /><div><strong>Dowze Académie</strong><small>Votre espace d’étude</small></div></div>
    <p className="eyebrow">{register ? 'Nouveau compte serveur' : 'Bienvenue'}</p>
    <h1>{register ? 'Créer votre compte' : 'Prêt à reprendre ?'}</h1>
    <p className="muted">Vos cours, vos notes et votre planning vous accompagnent sur tous vos appareils.</p>
    <form onSubmit={submit} aria-busy={busy}>
      <label>Adresse e-mail<input type="email" name="email" inputMode="email" autoCapitalize="none" spellCheck={false} disabled={busy} autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      <label>Mot de passe<input type={showPassword ? "text" : "password"} name="password" disabled={busy} minLength={register ? 12 : undefined} autoComplete={register ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
      <button type="button" className="link password-toggle" disabled={busy} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}</button>
      {register && <small className="muted">Utilisez au moins 12 caractères.</small>}
      {message && <p role="status" className="notice">{message}</p>}
      <button className="primary" type="submit" disabled={busy}>{busy ? register ? "Création…" : "Connexion…" : register ? 'Créer le compte' : 'Se connecter'}</button>
    </form>
    <button type="button" className="link" disabled={busy} onClick={() => { setRegister(!register); setPassword(''); setShowPassword(false); setMessage(''); }}>{register ? 'J’ai déjà un compte' : 'Créer un compte'}</button>
  </section></main>;
}


export function App() {
  const [account, setAccount] = useState<Account | null>(null);
  const [checking, setChecking] = useState(true);
  const [loggingOut,setLoggingOut]=useState(false);
  const [syncGeneration,setSyncGeneration]=useState(0);
  const bootEpoch=useRef(0);
  const [spaceId, setSpaceId] = useState('');
  const [spaces, setSpaces] = useState<AnnualSpace[]>([]);
  const scopeRef = useRef('');
  scopeRef.current = account&&!loggingOut ? `${account.id}|${spaceId}` : '';
  const noteWriteOwner=JSON.stringify([account?.id??null,spaceId,loggingOut]);
  const noteWriteEpochRef=useRef({owner:noteWriteOwner,value:0});
  if(noteWriteEpochRef.current.owner!==noteWriteOwner)noteWriteEpochRef.current={owner:noteWriteOwner,value:noteWriteEpochRef.current.value+1};
  const noteWriteEpoch=noteWriteEpochRef.current.value,notesMounted=useRef(true);
  const managedSource=useMemo(()=>Object.freeze({epoch:noteWriteEpoch,accountId:account?.id??'',spaceId}),[noteWriteEpoch]);
  const managedViewCurrent=()=>notesMounted.current&&noteWriteEpochRef.current.value===managedSource.epoch&&scopeRef.current===`${managedSource.accountId}|${managedSource.spaceId}`;
  const createNotebookManaged=(componentCurrent:()=>boolean)=>{const current=()=>componentCurrent()&&managedViewCurrent();if(!current())throw Error('Le compte de cette note a changé.');return createNotebookManagedApplication({scope:{accountId:managedSource.accountId,spaceId:managedSource.spaceId},api,current,currentApi:()=>api,openDatabase:openNotebookStateDatabase,openPort:async checked=>({port:api.createManagedNotebookPort({current:checked,currentApi:()=>api}),dispose:async()=>{}})});};
  const notebookCollection={source:managedSource,current:managedViewCurrent,create:(view:'owned'|'outgoing'|'incoming',componentCurrent:()=>boolean)=>{const current=()=>componentCurrent()&&managedViewCurrent();return createNotebookSharedCollection({scope:{accountId:managedSource.accountId,spaceId:managedSource.spaceId},view,api,current,currentApi:()=>api,openPort:async(checked,signal)=>({port:api.createManagedNotebookPort({current:checked,currentApi:()=>api,signal}),dispose:async()=>{}})});}};
  const notebookManagedTrash=createManagedLibraryTrashAction({scope:{accountId:managedSource.accountId,spaceId:managedSource.spaceId},current:managedViewCurrent,create:createNotebookManaged});
  // Closing retires ordinary controls immediately. An already registered paper
  // participant keeps only its captured atomic mirror source until settlement.
  const mirrorOwnerKey=JSON.stringify([account?.id??null,spaceId]);
  const durableMirrorOwner=useRef({key:mirrorOwnerKey,accountId:account?.id??'',spaceId,api,epoch:0,retired:false,apiCurrent:null as (()=>boolean)|null,apiAdmitted:false});
  let mirrorLeaseLost=false;try{mirrorLeaseLost=durableMirrorOwner.current.apiAdmitted&&durableMirrorOwner.current.apiCurrent?.()!==true;}catch{mirrorLeaseLost=durableMirrorOwner.current.apiAdmitted;}
  if(durableMirrorOwner.current.key!==mirrorOwnerKey||durableMirrorOwner.current.api!==api||mirrorLeaseLost){durableMirrorOwner.current.retired=true;durableMirrorOwner.current={key:mirrorOwnerKey,accountId:account?.id??'',spaceId,api,epoch:durableMirrorOwner.current.epoch+1,retired:false,apiCurrent:null,apiAdmitted:false};}
  const capturedMirrorOwner=durableMirrorOwner.current;
  const metadataWriteTail=useRef(new Map<string,Promise<unknown>>());
  useEffect(()=>{notesMounted.current=true;return()=>{notesMounted.current=false;};},[]);
  useEffect(()=>{const source=capturedMirrorOwner;if(!source.accountId||!source.spaceId||source.retired||source.apiCurrent)return;try{source.apiCurrent=source.api.captureSessionAuthority(source.accountId);source.apiAdmitted=source.apiCurrent()===true;if(!source.apiAdmitted)source.retired=true;}catch{source.retired=true;}},[capturedMirrorOwner]);
  const [tab, setTab] = useState<Tab>('notes');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [noteSearch, setNoteSearch] = useState('');
  const [searchNavigation,setSearchNavigation]=useState<PaperSearchNavigation|null>(null);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [courseSelection, setCourseSelection] = useState<{ scope: string; entry: CatalogEntry } | null>(null);
  const selectedCourse = courseSelection?.scope === scopeRef.current ? courseSelection.entry : null;
  const setSelectedCourse = (entry: CatalogEntry | null) => setCourseSelection(entry ? { scope: scopeRef.current, entry } : null);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newYearOpen, setNewYearOpen] = useState(false);
  const [newYear, setNewYear] = useState('');
  const [newYearTitle, setNewYearTitle] = useState('');
  const [creatingYear, setCreatingYear] = useState(false);
  const [courseCache, setCourseCache] = useState<{ scope: string; entries: CatalogEntry[] }>({ scope: '', entries: [] });
  const cachedCourses = courseCache.scope === scopeRef.current ? courseCache.entries : [];
  const sharedCourses = drafts.filter(draft => draft.accountId === account?.id && draft.spaceId === spaceId && draft.type === 'formation').flatMap(draft => {
    const manifest = sharedFormationManifest(draft.content);
    return manifest ? [{ formation_id: manifest.id, version: manifest.packageVersion, title: manifest.name, package_size: 0, package_sha256: '' }] : [];
  });
  const downloadedCourses = [...sharedCourses, ...cachedCourses.filter(entry => !sharedCourses.some(shared => shared.formation_id === entry.formation_id && shared.version === entry.version))];
  const setDownloadedCourses = (entries: CatalogEntry[]) => setCourseCache({ scope: scopeRef.current, entries });

  useEffect(() => {
    setCourseSelection(old => old?.scope === scopeRef.current ? old : null); setDownloadedCourses([]);
    if (!account || !spaceId) return;
    let cancelled = false;
    listSnapshots(account.id, spaceId).then(snapshots => {
      const entries: CatalogEntry[] = [];
      for (const snapshot of snapshots) {
        if (!snapshot.key.startsWith(`course|${account.id}|${spaceId}|`)) continue;
        try {
          const files = snapshot.value as Record<string, string>;
          const manifest = JSON.parse(files['formation.json']);
          if (typeof manifest.id === 'string' && typeof manifest.packageVersion === 'string' && typeof manifest.name === 'string') entries.push({formation_id:manifest.id, version:manifest.packageVersion, title:manifest.name, package_size:Object.values(files).reduce((sum,text)=>sum+new TextEncoder().encode(text).length,0), package_sha256:''});
        } catch { /* Malformed cache is never used by the validated reader. */ }
      }
      if (!cancelled) setDownloadedCourses(entries);
    }).catch(() => { if (!cancelled) setNotice('Les cours téléchargés ne peuvent pas être lus sur cet appareil.'); });
    return () => { cancelled = true; };
  }, [account, spaceId]);
  const renderedScope = scopeRef.current;
  const courseDownloaded = (entry: CatalogEntry) => {
    if (scopeRef.current !== renderedScope) return;
    setCourseCache(old => {
      const entries = old.scope === renderedScope ? old.entries : [];
      return { scope: renderedScope, entries: entries.some(item => item.formation_id === entry.formation_id && item.version === entry.version) ? entries : [...entries, entry] };
    });
  };
  const scopedDrafts = drafts.filter(draft => draft.accountId === account?.id && draft.spaceId === spaceId);

  const active = scopedDrafts.find((draft) => draft.documentId === activeId && draft.type === 'notesMarkdown') ?? null;
  const splitNotes=useNotebookSplitWorkspace({accountId:account?.id??'signed-out',spaceId},active?.documentId,scopedDrafts.filter(draft=>draft.type==='notesMarkdown').map(draft=>draft.documentId));
  const splitActive=scopedDrafts.find(draft=>draft.type==='notesMarkdown'&&draft.documentId===splitNotes.secondaryId)??null;
  const paneOwner=JSON.stringify([account?.id??'',spaceId]);const [seenNotes,setSeenNotes]=useState<{owner:string;ids:string[]}>({owner:'',ids:[]});
  const openPaneIds=[...new Set([...(seenNotes.owner===paneOwner?seenNotes.ids:[]),...(active?[active.documentId]:[]),...(splitActive?[splitActive.documentId]:[])])];
  useEffect(()=>{if(!active)return;setSeenNotes(old=>({owner:paneOwner,ids:[...new Set([...(old.owner===paneOwner?old.ids:[]),active.documentId,...(splitActive?[splitActive.documentId]:[])])]}));},[paneOwner,active?.documentId,splitActive?.documentId]);
  const activateNote=(id:string,search?:PaperSearchOpenRequest)=>{
    if(!account||!spaceId||loggingOut||!notesMounted.current)return;
    const source={accountId:account.id,spaceId,epoch:noteWriteEpoch};
    const ownerCurrent=()=>notesMounted.current&&noteWriteEpochRef.current.value===source.epoch&&scopeRef.current===`${source.accountId}|${source.spaceId}`;
    if(!ownerCurrent()||search&&search.hit.binding?.noteId!==id)return;
    const apiCurrent=search?api.captureSessionAuthority(source.accountId):undefined,current=()=>ownerCurrent()&&(!apiCurrent||apiCurrent());
    if(!current()||!splitNotes.beforeActivate(id))return;
    setSearchNavigation(search?{...search,requestId:crypto.randomUUID(),current}:null);setActiveId(id);
  };
  const loadLocal = useCallback(async (accountId: string, year: string) => { const items = await listDrafts(accountId, year); if (scopeRef.current !== `${accountId}|${year}`) return; setDrafts(items); setActiveId(current => current !== null && items.some(item => item.documentId === current && item.type === 'notesMarkdown') ? current : null); }, []);
  useEffect(() => {
    const epoch=++bootEpoch.current;
    if(localStorage.getItem('dowze.local-signed-out')==='1'){setChecking(false);return;}
    api.me().then(async (me) => { await api.restoreCsrf(); if(epoch===bootEpoch.current)setAccount(me); })
      .catch(error => {
        if(epoch!==bootEpoch.current)return;
        // A connected network interface does not prove the server is reachable.
        // An explicit authentication rejection must still clear the cached profile.
        const rejected = error instanceof ApiError && [401, 403].includes(error.status);
        if (!rejected) {
          try {
            const saved = JSON.parse(localStorage.getItem('dowze.offline-account') ?? 'null');
            if (typeof saved?.id === 'string' && typeof saved?.email === 'string') {
              api.bindAccount(saved.id); setAccount(saved); setOnline(false);
              setNotice('Connexion au serveur indisponible. Votre travail reste accessible sur cet appareil.');
              return;
            }
          } catch { /* No valid previously authenticated local profile. */ }
        }
        localStorage.removeItem('dowze.offline-account'); setAccount(null);
      }).finally(() => {if(epoch===bootEpoch.current)setChecking(false);});
  }, []);
  useEffect(()=>{const id=account?.id;const changed=(event:StorageEvent)=>{if(event.key!=='dowze.offline-account'||event.newValue===JSON.stringify(account))return;let nextId:string|undefined;try{nextId=event.newValue?JSON.parse(event.newValue)?.id:undefined;}catch{}if(nextId===id&&id)return;bootEpoch.current++;setChecking(false);
      durableMirrorOwner.current.retired=true;scopeRef.current='';syncScheduler.current?.stop();notesUploadScheduler.current?.stop();setAccount(null);setDrafts([]);setSpaces([]);setSpaceId('');api.forgetSession();
      if(id)void settleNotebookAccount(id).then(()=>disposeNotebookAccount(id)).catch(()=>resumeNotebookAccount(id));
    };addEventListener('storage',changed);return()=>removeEventListener('storage',changed);},[account]);
  useEffect(() => { if (account) localStorage.setItem('dowze.offline-account', JSON.stringify(account)); }, [account]);
  useEffect(() => { if(account && spaceId && spaces.some(space=>space.id===spaceId))localStorage.setItem(`dowze.active-space.${account.id}`,spaceId); },[account,spaceId,spaces]);
  useEffect(() => { const on = () => setOnline(true); const off = () => setOnline(false); addEventListener('online', on); addEventListener('offline', off); return () => { removeEventListener('online', on); removeEventListener('offline', off); }; }, []);
  const syncScheduler = useRef<ReturnType<typeof continuousSync> | null>(null);
  const notesUploadScheduler = useRef<ReturnType<typeof continuousSync>|null>(null);
  // Upload durable edits independently: an initial history download must not hold new writing hostage.
  useEffect(()=>{
    if(!account||!spaceId)return;
    let cancelled=false;const scope=`${account.id}|${spaceId}`;
    const current=()=>!cancelled&&scopeRef.current===scope;
    const sync=continuousSync(async()=>{
      if(!current()||!navigator.onLine)return;
      await queueLocalDrafts(account.id,spaceId);
      if(!current())return;
      await flushMutations(api,account.id,spaceId,current);
      if(current())await loadLocal(account.id,spaceId);
    },()=>{if(current())setNotice('Envoi en attente. Votre note est conservée sur cet appareil.');});
    notesUploadScheduler.current=sync;
    const resume=()=>sync.request(true);addEventListener('online',resume);resume();
    return()=>{cancelled=true;sync.stop();notesUploadScheduler.current=null;removeEventListener('online',resume);};
  },[account,spaceId,loadLocal,syncGeneration]);
  useEffect(() => {
    if (!account || !spaceId) return;
    let cancelled = false;
    const scope = `${account.id}|${spaceId}`;
    const current = () => !cancelled && scopeRef.current === scope;
    void loadLocal(account.id, spaceId);
    const sync = continuousSync(async () => {
      if (!current() || !navigator.onLine) return;
      const session = await api.me();
      if (!current()) return;
      if (session.id !== account.id) throw new Error('Reconnectez le compte attendu pour synchroniser.');
      setOnline(true);
      if (!api.hasCsrf()) await api.restoreCsrf();
      if (!current()) return;
      await synchronizeSpace(api, account.id, spaceId, current);
      if (current()) await loadLocal(account.id, spaceId);
    }, error => { if (current()) setNotice('Connexion au serveur interrompue. Vos modifications restent enregistrées sur cet appareil.'); });
    syncScheduler.current = sync;
    const resume = () => sync.request(true);
    const visible = () => { if (document.visibilityState === 'visible') resume(); };
    addEventListener('online', resume); addEventListener('focus', resume);
    document.addEventListener('visibilitychange', visible);
    resume();
    return () => {
      cancelled = true; sync.stop(); syncScheduler.current = null;
      removeEventListener('online', resume); removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [account, spaceId, loadLocal,syncGeneration]);
  useEffect(() => {
    if (tab !== 'formations') return;
    let current = true;
    setCatalogLoading(true); setCatalogError(false);
    api.catalog().then(x => { if (current) setCatalog(x.items); }).catch(() => { if (current) { setCatalogError(true); setNotice('Le catalogue est indisponible. Vos cours téléchargés restent accessibles.'); } }).finally(() => { if (current) setCatalogLoading(false); });
    return () => { current = false; };
  }, [tab]);

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    const cacheKey = `dowze.spaces.${account.id}`;
    try { const cached = JSON.parse(localStorage.getItem(cacheKey) ?? '[]'); if (Array.isArray(cached)) { const selected=localStorage.getItem(`dowze.active-space.${account.id}`);setSpaces(cached); setSpaceId(cached.some(space=>space.id===selected)?selected!:cached[0]?.id ?? ''); } } catch { /* Invalid cached list is ignored. */ }
    const current = () => !cancelled && scopeRef.current.startsWith(`${account.id}|`);
    const sync = continuousSync(async () => {
      if (!current() || !navigator.onLine) return;
      const me = await api.me();
      if (!current() || me.id !== account.id) return;
      setOnline(true);
      const items = await api.spaces();
      if (!current()) return;
      localStorage.setItem(cacheKey, JSON.stringify(items));
      setSpaces(items); setSpaceId(current => items.some(s => s.id === current) ? current : items[0]?.id ?? '');
      for (const space of items) {
        if (!current()) return;
        if (scopeRef.current === `${account.id}|${space.id}`) continue;
        await synchronizeSpace(api, account.id, space.id, current);
      }
    }, error => { if (current()) setNotice('Vos années enregistrées restent accessibles. La connexion au serveur sera réessayée automatiquement.'); }, { interval: 15000 });
    const resume = () => sync.request(true);
    addEventListener('online', resume); resume();
    return () => { cancelled = true; sync.stop(); removeEventListener('online', resume); };
  }, [account]);

  async function createAnnualSpace(event: React.FormEvent) {
    event.preventDefault();
    if (!account || creatingYear) return;
    const year = newYear.trim(), title = newYearTitle.trim();
    if (!year || !title) return;
    setCreatingYear(true);
    const accountId = account.id;
    try {
      const space = await api.putSpace(uid(), uid(), year, title);
      if (!scopeRef.current.startsWith(`${accountId}|`)) return;
      setSpaces(old => { const items = [...old, space]; localStorage.setItem(`dowze.spaces.${accountId}`, JSON.stringify(items)); return items; }); setSpaceId(space.id); setNewYearOpen(false); setNewYear(''); setNewYearTitle('');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Création impossible. Réessayez.'); }
    finally { setCreatingYear(false); }
  }
  async function openCatalogueCourse(entry: CatalogEntry) {
    if (!account) return;
    const accountId = account.id;
    const current = () => scopeRef.current.startsWith(`${accountId}|`);
    try {
      const { files } = await api.courseContent(entry.formation_id, entry.version);
      const preview = validateAndCompileFormationPackage(files as unknown as FormationPackageFiles);
      const manifest = preview.manifest;
      if (!preview.valid || !manifest || manifest.id !== entry.formation_id || manifest.packageVersion !== entry.version) throw new Error('Formation invalide.');
      const year = `${manifest.academicYear.startDate.slice(0, 4)}-${manifest.academicYear.endDate.slice(0, 4)}`;
      const items = await api.spaces();
      if (!current()) return;
      const candidates = items.filter(item => item.formation_id === manifest.id && item.academic_year === year);
      let annual = candidates.find(item => item.id === spaceId) ?? (candidates.length === 1 ? candidates[0] : undefined);
      if (!annual && candidates.length > 1) throw new Error('Plusieurs exemplaires de cette année existent. Choisissez celui à ouvrir dans la liste des années.');
      if (!annual) annual = await api.putSpace(await defaultServerSpace(accountId,manifest.id,year), manifest.id, year, manifest.name);
      if (!current()) return;
      await putSnapshot({ key: `course|${accountId}|${annual.id}|${entry.formation_id}|${entry.version}`, accountId, spaceId: annual.id, value: files });
      // Receive existing choices/progress before the reader can create defaults.
      await synchronizeSpace(api, accountId, annual.id, current);
      if (!current()) return;
      const updated = items.some(item => item.id === annual.id) ? items : [...items, annual];
      localStorage.setItem(`dowze.spaces.${accountId}`, JSON.stringify(updated));
      setSpaces(updated); setDrafts(await listDrafts(accountId, annual.id));
      if (!current()) return;
      setSpaceId(annual.id); setCourseSelection({ scope: `${accountId}|${annual.id}`, entry }); setTab('courses');
    } catch (error) { if (current()) setNotice(String(error)); }
  }

  async function editDocument(type: Draft['type'], documentId: string, content: Record<string, unknown>) {
    if (!account || !spaceId) return;
    const scope = scopeRef.current;
    const existing = scopedDrafts.find(draft => draft.type === type && draft.documentId === documentId);
    if (existing?.syncState === 'conflict') throw new Error('Résolvez le conflit avant de modifier ce document.');
    const draft: Draft = { accountId: account.id, spaceId, type, documentId,
      title: String(content.title ?? content.name ?? type), content, baseVersion: existing?.baseVersion ?? 0,
      updatedAt: Date.now(), syncState: 'local' };
    await putDraft(draft);
    if (scopeRef.current !== scope) return;
    setDrafts(old => [...old.filter(item => item.type !== type || item.documentId !== documentId), draft]);
    syncScheduler.current?.request();
  }
  async function preserveBothVersions() {
    if (!account || !active || active.syncState !== 'conflict') return;
    const scope = scopeRef.current;
    try {
      let cursor: string | undefined, remote: import('./api').DocumentChange | undefined;
      do {
        const page = await api.changes(spaceId, cursor);
        if (scopeRef.current !== scope) return;
        for (const item of page.items) if (item.document_type === active.type && item.document_id === active.documentId && (!remote || item.version > remote.version)) remote = item;
        cursor = page.has_more ? page.next_cursor : undefined;
      } while (cursor);
      if (!remote) throw new Error('La version serveur est indisponible ; le brouillon est conservé.');
      const server = remote.deleted ? null : { ...active, title: (remote.content as {title?: string})?.title ?? active.title, content: remote.content, baseVersion: remote.version, syncState: 'synced' as const, conflict: undefined };
      const copy = await forkConflictedDraft(active, server, uid());
      if (scopeRef.current !== scope) return;
      await loadLocal(account.id, spaceId); setActiveId(copy.documentId);
      setNotice('Les deux versions sont conservées. Enregistrez cette copie pour la retrouver sur vos autres appareils.');
    } catch (error) { if (scopeRef.current === scope) setNotice(String(error)); }
  }
  async function resolveDocument(draft: Draft, choice: 'local' | 'server') {
    const source={accountId:draft.accountId,spaceId:draft.spaceId,epoch:noteWriteEpoch,api},viewCurrent=()=>notesMounted.current&&noteWriteEpochRef.current.value===source.epoch&&scopeRef.current===`${source.accountId}|${source.spaceId}`&&account?.id===source.accountId&&spaceId===source.spaceId;
    if(!viewCurrent())return;
    let authority:ReturnType<typeof capturePrivateNotebookResolution>|undefined;try {const captured=structuredClone(draft);const admitted=capturePrivateNotebookResolution({scope:captured,api:source.api,current:viewCurrent});authority=admitted;
      await admitted.check(captured.content);let cursor: string | undefined, remote: import('./api').DocumentChange | undefined;
      const seen = new Set<string>();
      do {
        await admitted.check(captured.content);const page = await source.api.changes(source.spaceId, cursor);await admitted.check(captured.content);
        for (const item of page.items) if (item.document_type === captured.type && item.document_id === captured.documentId && (!remote || item.version > remote.version)) remote = item;
        cursor = page.has_more ? page.next_cursor : undefined;
        if (cursor && seen.has(cursor)) throw new Error('Lecture du conflit interrompue.');
        if (cursor) seen.add(cursor);
      } while (cursor);
      if (!remote) throw new Error('Version serveur indisponible ; votre travail reste conservé.');
      await admitted.check(remote.content);const server = remote.deleted ? null : { ...captured, content: await admitted.decode(remote.content), baseVersion: remote.version, syncState: 'synced' as const, conflict: undefined };
      await admitted.check(captured.content);await resolveConflictedDocument(captured, server, remote.version, choice, uid(),admitted.current,captured.type==='whiteboard'||captured.type==='notesMarkdown');
      if (!admitted.current()) return;
      const items=await listDrafts(source.accountId,source.spaceId);if(!admitted.current())return;
      setDrafts(previous=>admitted.current()?items:previous);setActiveId(previous=>!admitted.current()?previous:previous!==null&&items.some(item=>item.documentId===previous&&item.type==='notesMarkdown')?previous:null);
      syncScheduler.current?.request(true);
      setNotice(previous=>admitted.current()?'Version choisie appliquée. Les deux versions restent conservées dans la sauvegarde locale du conflit.':previous);
    } catch (error) { if (viewCurrent()&&(!authority||authority.ownsSource())) setNotice(previous=>viewCurrent()&&(!authority||authority.ownsSource())?String(error):previous); }
  }
  async function save() {
    if (!notesMounted.current || !account || !active || loggingOut || active.syncState === 'conflict' || saving) return;
    const source = Object.freeze({ accountId: account.id, spaceId, api, epoch: noteWriteEpoch });
    const current = () => notesMounted.current && noteWriteEpochRef.current.value === source.epoch && scopeRef.current === `${source.accountId}|${source.spaceId}`;
    if (!current()) return;
    setSaving(true);
    try {
    const local = { ...active, content: { ...(active.content as object), title: active.title }, updatedAt: Date.now(), syncState: 'queued' as const };
    const mutation = { id: uid(), accountId: source.accountId, spaceId: source.spaceId, documentId: local.documentId, type: local.type, baseVersion: local.baseVersion, content: local.content, createdAt: Date.now(), status: 'pending' as const };
    await saveDraftAndQueue(local, mutation, undefined, current, { content: active.content, title: active.title, updatedAt: active.updatedAt }); if (!current()) return; setDrafts((old) => old.map((item) => item.documentId === local.documentId ? local : item)); setNotice('Brouillon enregistré sur cet appareil.');
    if (!online) return;
    try {
      await flushMutations(source.api, source.accountId, source.spaceId, current);
      if (!current()) return;
      const items = await listDrafts(source.accountId, source.spaceId);
      if (!current()) return;
      setDrafts(items);
      setActiveId(id => id !== null && items.some(item => item.documentId === id && item.type === 'notesMarkdown') ? id : null);
      const stored = items.find(item => item.type === local.type && item.documentId === local.documentId);
      setNotice(stored?.syncState === 'conflict' ? 'Conflit : votre copie locale est conservée.' : stored?.syncState === 'synced' ? 'Synchronisé' : 'En attente de synchronisation.');
    } catch {
      // The synchronizer owns conflict CAS. A transport/session refusal must not
      // replace a newer durable revision with this button's captured local copy.
      if (current()) setNotice('En attente de synchronisation : le serveur n’a pas confirmé l’envoi.');
    }
    } catch (error) { if (current()) setNotice(error instanceof DraftChangedError ? 'La note a changé pendant l’enregistrement. Votre dernière version est conservée. Réessayez.' : 'La note n’a pas pu être enregistrée. Gardez la page ouverte et copiez votre texte.'); }
    finally { if (notesMounted.current) setSaving(false); }
  }
  async function logout() {
    if(!account||loggingOut)return;const id=account.id;setLoggingOut(true);
    syncScheduler.current?.stop();notesUploadScheduler.current?.stop();
    try{await settleNotebookAccount(id);}catch(error){resumeNotebookAccount(id);setLoggingOut(false);setSyncGeneration(g=>g+1);setNotice(`Votre dernière modification n’a pas pu être enregistrée. La session reste ouverte. ${String(error instanceof Error?error.message:error)}`);return;}
    durableMirrorOwner.current.retired=true;scopeRef.current='';localStorage.setItem('dowze.local-signed-out','1');localStorage.removeItem('dowze.offline-account');
    try{await api.logout();}finally{try{await clearPrivateCache(id);}finally{disposeNotebookAccount(id);setAccount(null);setSpaceId('');setSpaces([]);setDrafts([]);setLoggingOut(false);}}
  }

  async function exportNotes(selectedIds:readonly string[]){
    if(!account||!spaceId||loggingOut||!notesMounted.current)throw Error('Ouvrez votre carnet avant cet export.');
    const source={accountId:account.id,spaceId,epoch:noteWriteEpoch};
    const viewCurrent=()=>notesMounted.current&&noteWriteEpochRef.current.value===source.epoch&&scopeRef.current===`${source.accountId}|${source.spaceId}`;
    if(!viewCurrent())throw Error('Le carnet a changé avant l’export.');
    const apiCurrent=api.captureSessionAuthority(source.accountId),current=()=>viewCurrent()&&apiCurrent();
    if(!current())throw Error('La connexion a changé avant l’export.');
    const ids=[...selectedIds];
    const {preparePaperNotebookBundle}=await import('../../src/lib/paperNotebookBundle');if(!current())throw Error('Le carnet a changé avant l’export.');
    const prepared=await preparePaperNotebookBundle({media:{api,accountId:source.accountId,spaceId:source.spaceId},selectedIds:ids,metadata:'indexeddb',current});
    const saved=await prepared.save();if(saved&&current())setNotice(`Téléchargement demandé : ${prepared.manifest.notes.length} notes enregistrées, dans une collection ZIP de fichiers .dowze.`);
  }

  async function publishDuplicate(id:string,resume:boolean,presentationCurrent:()=>boolean=()=>true,history?:import('../../src/lib/paperHistoryVersions').PaperHistorySelection){
    if(!account||!spaceId||loggingOut||!notesMounted.current)throw Error('Ouvrez votre carnet avant de copier une note.');
    const source={accountId:account.id,spaceId,epoch:noteWriteEpoch};
    const viewCurrent=()=>notesMounted.current&&noteWriteEpochRef.current.value===source.epoch&&scopeRef.current===`${source.accountId}|${source.spaceId}`&&(!history||presentationCurrent());
    if(!viewCurrent())throw Error('Le carnet a changé avant la copie.');
    const apiCurrent=api.captureSessionAuthority(source.accountId),current=()=>viewCurrent()&&apiCurrent();
    if(!current())throw Error('La connexion a changé avant la copie.');
    const m=await import('../../src/lib/notebookDuplicatePublication');if(!current())throw Error('Le carnet a changé avant la copie.');
    const media={api,accountId:source.accountId,spaceId:source.spaceId},metadata=m.indexedDBNotebookDuplicateMetadata(source);
    const note=await (resume?m.resumeNotebookDuplicatePublication(id,media,metadata,current):m.createNotebookDuplicate(id,media,metadata,current,history));
    if(!current())return;
    const storage=await import('./storage'),row=await storage.getDraft({...source,type:'notesMarkdown',documentId:note.id});
    if(!current())return;if(!row)throw Error('Les informations enregistrées de la copie doivent être retrouvées.');
    setDrafts(old=>[row,...old.filter(value=>value.type!=='notesMarkdown'||value.documentId!==row.documentId)]);
    if(!history&&presentationCurrent())setActiveId(note.id);
    notesUploadScheduler.current?.request();syncScheduler.current?.request();
  }
  const duplicateNote=(id:string,current?:()=>boolean)=>publishDuplicate(id,false,current);
  const resumeDuplicateNote=(id:string,current?:()=>boolean)=>publishDuplicate(id,true,current);
  async function importNotebookArchive(input:File|string){
    if(!account||!spaceId||loggingOut)throw Error('Ouvrez votre carnet avant l’importation.');const owner=account.id,year=spaceId,captured=`${owner}|${year}`,current=()=>scopeRef.current===captured;
    await runNotebookOperation(owner,async()=>{const media={api,accountId:owner,spaceId:year},m=await import('../../src/lib/importNotebookArchive'),id=typeof input==='string'?input:uid(),note=typeof input==='string'?(await m.readNotebookArchiveImport(input,media)).note:await m.stageNotebookArchive(input,id,media,current);if(!current())throw Error('Le carnet a changé pendant l’importation.');
      const identity={accountId:owner,spaceId:year,type:'notesMarkdown' as const,documentId:id};const old=await import('./storage').then(m=>m.getDraft(identity));if(!current())throw Error('Le carnet a changé pendant l’importation.');const metadata:Draft=old??{...identity,title:note.title,content:note,baseVersion:0,updatedAt:Date.now(),syncState:'local',paperDependency:notebookDocumentId(id)};if(!old)await putDraft(metadata);
      await m.confirmNotebookArchiveMetadata(id,media,current);await m.activateNotebookArchive(id,media,current);if(!current())return;setDrafts(ds=>[metadata,...ds.filter(d=>d.type!=='notesMarkdown'||d.documentId!==id)]);setActiveId(id);notesUploadScheduler.current?.request();syncScheduler.current?.request();
    });
  }
  function newNote() {
    if (!account || !spaceId || loggingOut) return;
    const owner = account.id, year = spaceId, capturedEpoch = noteWriteEpoch;
    const current = () => notesMounted.current && noteWriteEpochRef.current.value === capturedEpoch && scopeRef.current === `${owner}|${year}`;
    if (!current()) return;
    const noteId = uid(), now = new Date().toISOString();
    const draft: Draft = { accountId: owner, spaceId: year, documentId: noteId, type: 'notesMarkdown', title: 'Nouvelle note', content: { id: noteId, title: 'Nouvelle note', markdown: '', subjectIds: [], tags: [], createdAt: now, updatedAt: now }, baseVersion: 0, updatedAt: Date.now(), syncState: 'local' };
    // A creation already admitted belongs to its original notebook. Completing
    // that durable write must not reopen a tab in a later account/year session.
    return putDraft(draft).then(() => {
      if (!current()) return;
      setDrafts(old => [draft, ...old]);
      setActiveId(draft.documentId);
      notesUploadScheduler.current?.request(); syncScheduler.current?.request();
    }).catch(() => { if (current()) setNotice('La note n’a pas pu être créée. Réessayez.'); });
  }
  const updateNote = async (note:Draft,changes: Partial<Draft>,expected?:NotebookMirrorExpectation):Promise<boolean> => {
    const active=note,atomicMirror=typeof expected?.commitMetadata==='function';if(!account||note.accountId!==account.id||note.spaceId!==spaceId||note.type!=='notesMarkdown'||loggingOut&&!atomicMirror)return false;
    const scope=scopeRef.current,capturedEpoch=noteWriteEpoch;
    const ordinaryCurrent=()=>notesMounted.current&&noteWriteEpochRef.current.value===capturedEpoch&&scopeRef.current===scope&&scope===`${active.accountId}|${active.spaceId}`;
    const mirrorCurrent=()=>{const source=capturedMirrorOwner;if(!notesMounted.current||source.retired||durableMirrorOwner.current!==source||source.accountId!==active.accountId||source.spaceId!==active.spaceId||source.api!==api||!source.apiCurrent)return false;try{if(source.apiCurrent()!==true){source.retired=true;return false;}}catch{source.retired=true;return false;}return true;};
    const current=atomicMirror?mirrorCurrent:ordinaryCurrent;
    if(!current())return false;
    // Apply only the fields changed by this control to the latest durable note.
    // A title control rendered before a text mirror must never restore its old text.
    const oldContent=active.content as Record<string,unknown>,requestedContent=changes.content as Record<string,unknown>|undefined;
    const patch=requestedContent?Object.fromEntries(Object.entries(requestedContent).filter(([key,value])=>JSON.stringify(value)!==JSON.stringify(oldContent?.[key]))):{};
    const identity=JSON.stringify([active.accountId,active.spaceId,active.documentId]);
    const previous=metadataWriteTail.current.get(identity)??Promise.resolve();
    // commitMetadata belongs to the paper hook's already registered tail/pending
    // participant. Do not create a new generic admission during account settle.
    const perform=async()=>{
      try{
      await previous.catch(()=>undefined);if(expected&&!current())return false;
      // Plain metadata edits accepted before a view change finish only in their captured note.
      const commitCurrent=expected?current:()=>true;
      const storage=await import('./storage');
      for(let attempt=0;attempt<3;attempt++){
        const durable=await storage.getDraft(active);if(expected&&!current())return false;if(!durable||durable.syncState==='conflict')throw Error('La note enregistrée doit être retrouvée avant cette modification.');
        if(expected&&(durable.content as {markdown?:string})?.markdown!==expected.expectedMarkdown){setDrafts(old=>old.map(item=>item.accountId===durable.accountId&&item.spaceId===durable.spaceId&&item.documentId===durable.documentId&&item.type===durable.type?durable:item));return false;}
        const content={...(durable.content as Record<string,unknown>),...(expected?{markdown:requestedContent?.markdown}:patch),title:changes.title??durable.title,updatedAt:new Date().toISOString()};
        let updated:Draft={...durable,title:changes.title??durable.title,content,updatedAt:Date.now(),syncState:'local'};
        try{if(expected?.commitMetadata)updated=await expected.commitMetadata(updated,current);else await putEditedDraft(updated,durable.content,commitCurrent);}
        catch(error){if(!expected&&error instanceof storage.DraftChangedError&&commitCurrent()&&attempt<2)continue;throw error;}
        if(!current())return true;
        setDrafts(old=>old.map(item=>item.accountId===updated.accountId&&item.spaceId===updated.spaceId&&item.documentId===updated.documentId&&item.type===updated.type?updated:item));
        notesUploadScheduler.current?.request();syncScheduler.current?.request();return true;
      }
      return false;
    }catch(error){if(!expected)await putSnapshot({key:`notebook-metadata-recovery|${JSON.stringify([active.accountId,active.spaceId,active.documentId,crypto.randomUUID()])}`,accountId:active.accountId,spaceId:active.spaceId,value:{schema:1,noteId:active.documentId,title:changes.title,contentPatch:patch,baseline:active,reason:String(error),createdAt:Date.now()}}).catch(()=>{});if(current())setNotice('La note n’a pas pu être enregistrée sur cet appareil. Gardez cette page ouverte et copiez votre texte.');return false;}
    };
    const operation=(atomicMirror?perform():runNotebookOperation(active.accountId,perform)).catch(()=>{if(current())setNotice('La session se ferme. Reprenez cette modification après connexion.');return false;});
    metadataWriteTail.current.set(identity,operation);
    void operation.finally(()=>{if(metadataWriteTail.current.get(identity)===operation)metadataWriteTail.current.delete(identity);});
    return operation;
  };

  if (checking) return <main className="center"><p role="status">Connexion au compte…</p></main>;
  if (!account) return <Auth onReady={confirmed=>{bootEpoch.current++;localStorage.removeItem('dowze.local-signed-out');setAccount(confirmed);}} />;
  return <div className="app-shell"><a className="skip-link" href={`#panel-${tab}`}>Aller au contenu</a><header>
    <div className="brand"><img className="brand-mark" src={appMark} alt="" /><div><strong>Dowze Académie</strong><small>{account.email}</small></div></div>
    <div className="header-actions"><span role="status" className={`network ${online ? '' : 'offline'}`}>{online ? 'En ligne' : 'Hors ligne'}</span><button disabled={loggingOut} onClick={() => void logout().catch(() => setNotice("La déconnexion n’a pas été confirmée. Réessayez."))}>{loggingOut?'Enregistrement…':'Déconnexion'}</button></div>
  </header>
  <aside><label>Mon année<select aria-label="Mon année" value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>{!spaceId && <option value="">Choisir une année</option>}{spaces.map((space) => <option key={space.id} value={space.id}>{space.title} · {space.academic_year}</option>)}</select></label><button type="button" aria-expanded={newYearOpen} aria-controls="new-year-form" onClick={() => setNewYearOpen(value => !value)}>Nouvelle année</button>
    {newYearOpen && <form id="new-year-form" className="new-year-form" onSubmit={createAnnualSpace} aria-busy={creatingYear}>
      <label>Nom de la formation<input name="year-title" autoComplete="off" value={newYearTitle} onChange={event => setNewYearTitle(event.target.value)} placeholder="Ex. Maturité spécialisée" required disabled={creatingYear} /></label>
      <label>Année scolaire<input name="academic-year" autoComplete="off" value={newYear} onChange={event => setNewYear(event.target.value)} placeholder="Ex. 2026-2027" required disabled={creatingYear} /></label>
      <button className="primary" disabled={creatingYear}>{creatingYear ? "Création…" : "Créer mon année"}</button>
      <button type="button" disabled={creatingYear} onClick={() => setNewYearOpen(false)}>Annuler</button>
    </form>}
    <nav aria-label="Sections" role="tablist">{TABS.map(([id, label], index) => <button id={`tab-${id}`} role="tab" aria-controls={`panel-${id}`} aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} key={id} onClick={() => setTab(id)} onKeyDown={(event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
      const next = TABS[nextIndex][0]; setTab(next); document.getElementById(`tab-${next}`)?.focus();
    }}><SectionIcon tab={id} /><span>{label}</span></button>)}</nav>
  </aside>
  <main aria-busy={loggingOut} inert={loggingOut||undefined} className="workspace" id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={-1}><div className="workspace-heading"><div><p className="eyebrow">{spaces.find(space => space.id === spaceId)?.academic_year ?? "Votre année, votre rythme"}</p><p className="workspace-intro">{TAB_HINTS[tab]}</p></div><span className="workspace-device">Mon espace</span></div>{notice && <p role="status" aria-live="polite" className={notice.startsWith('Conflit') ? 'notice conflict' : 'notice'}>{notice}</p>}
    {scopedDrafts.filter(draft => draft.syncState === 'conflict' && draft.type !== 'notesMarkdown').map(draft => <section className="card conflict" key={`${draft.type}:${draft.documentId}`}>
      <h2>Modifications simultanées : {draft.title}</h2><p>Ce document a été modifié sur deux appareils. Choisissez la version à partager ; une copie des deux versions sera conservée sur cet appareil.</p>
      <button onClick={() => void resolveDocument(draft, 'local')}>Partager ma version locale</button>
      <button onClick={() => void resolveDocument(draft, 'server')}>Utiliser la version serveur</button>
    </section>)}
    {!spaceId && <p className="notice">Choisissez ou créez une année pour ouvrir vos notes.</p>}
    {spaceId && tab==='documents' && <><StudyResults drafts={scopedDrafts} onEdit={editDocument} onError={setNotice} /><SharedFiles api={api} accountId={account.id} spaceId={spaceId} drafts={scopedDrafts} /></>}
    {spaceId && tab === 'notes' && <div className={`notes-layout ${active ? "has-active-note" : ""}`}>
    {!active && <NotebookLibraryView collection={notebookCollection} onManagedTrash={notebookManagedTrash} syncControls={<NotebookManagedControls source={managedSource} current={managedViewCurrent} notes={scopedDrafts.filter(d=>d.type==='notesMarkdown').map(d=>({id:d.documentId,title:d.title}))} create={createNotebookManaged} onChanged={async()=>{const items=await listDrafts(managedSource.accountId,managedSource.spaceId);if(managedViewCurrent())setDrafts(items);}}/>} media={{api,accountId:account.id,spaceId}} notes={scopedDrafts.filter(d=>d.type==='notesMarkdown').map(d=>({id:d.documentId,title:d.title,markdown:(d.content as {markdown?:string}).markdown??'',updatedAt:new Date(d.updatedAt).toISOString(),tags:Array.isArray((d.content as {tags?:unknown}).tags)?(d.content as {tags:unknown[]}).tags.filter((tag):tag is string=>typeof tag==='string'):[]}))} onCreate={newNote} onDuplicate={duplicateNote} onResumeDuplicate={resumeDuplicateNote} onExport={exportNotes} onImport={importNotebookArchive} onResumeImport={importNotebookArchive} onOpen={activateNote}/>}
        {active&&<NotebookSplitControls notes={scopedDrafts.filter(d=>d.type==='notesMarkdown').map(d=>({id:d.documentId,title:d.title}))} controller={splitNotes} disabled={loggingOut} onChoose={id=>splitNotes.choose(id)} onSwap={()=>{if(splitNotes.secondaryId)activateNote(splitNotes.secondaryId);}}/>}
      <div className={`pwa-notebook-panes workspace-active-panel ${splitNotes.split?'workspace-split':''}`} ref={splitNotes.containerRef} data-split-orientation={splitNotes.axis} style={{'--notebook-split-ratio':`${splitNotes.ratio}%`} as CSSProperties}>
      {splitNotes.split&&<NotebookSplitSeparator controller={splitNotes}/>}
      {active?openPaneIds.flatMap(id=>{const note=scopedDrafts.find(draft=>draft.type==='notesMarkdown'&&draft.documentId===id);return note?[note]:[];}).map(note=><PersistentWorkspacePanel key={JSON.stringify([note.accountId,note.spaceId,note.documentId])} id={`pwa-note-pane-${notebookIdentityDigest(note.documentId)}`} labelledBy={`pwa-note-title-${notebookIdentityDigest(note.documentId)}`} active={note.documentId===active.documentId||note.documentId===splitNotes.secondaryId} splitSlot={note.documentId===active.documentId?'primary':note.documentId===splitNotes.secondaryId?'secondary':undefined}><PwaNotePane onRestoreVersion={(selection,current)=>publishDuplicate(note.documentId,false,current,selection)} note={note} searchNavigation={searchNavigation?.hit.binding?.noteId===note.documentId?searchNavigation:undefined} media={{api,accountId:account.id,spaceId}} primary={note.documentId===active.documentId} closingUI={loggingOut} readOnly={note.syncState==='conflict'} onUpdate={updateNote} onBack={()=>{splitNotes.close();setActiveId(null);}} footer={<><span>{note.syncState==='synced'?'Synchronisé':note.syncState==='conflict'?'Conflit visible':'Brouillon local'}</span>{note.documentId===active.documentId&&<><button className="primary" disabled={note.syncState==='conflict'||saving} onClick={save}>{saving?'Enregistrement…':'Enregistrer'}</button>{note.syncState==='conflict'&&<button onClick={()=>void preserveBothVersions()}>Conserver les deux versions</button>}</>}</>}/></PersistentWorkspacePanel>):<section className="editor"><div className="empty"><NotebookPen className="empty-symbol" aria-hidden="true"/><h2>Une idée à garder ?</h2><p>Gardez une idée, préparez un cours ou commencez une révision. Vos notes sont d’abord conservées sur cet appareil.</p><button className="primary" onClick={newNote}>Créer ma première note</button></div></section>}
      </div></div>}

    {spaceId && tab === 'planning' && <><StudyTasks drafts={scopedDrafts} onEdit={editDocument} onError={setNotice} /><StudyPlanning drafts={scopedDrafts} onEdit={editDocument} onError={setNotice} /></>}
    {spaceId && tab === 'courses' && selectedCourse && <><button className="back-button" onClick={() => setSelectedCourse(null)}>← Mes cours</button><CourseReader drafts={scopedDrafts} onEdit={editDocument} onDownloaded={courseDownloaded} key={`${account.id}|${spaceId}|${selectedCourse.formation_id}`} api={api} entry={selectedCourse} accountId={account.id} spaceId={spaceId} /></>}
    {spaceId && tab === 'courses' && !selectedCourse && <section className="courses-overview"><div className="section-title"><h1>Mes cours</h1><button onClick={() => setTab('formations')}>Explorer le catalogue</button></div><StudyProgress drafts={scopedDrafts} onEdit={editDocument} onError={setNotice} />{downloadedCourses.map(entry => <article className="card course-card" key={`${entry.formation_id}:${entry.version}`}><span className="course-symbol"><SectionIcon tab="courses" /></span><div className="course-copy"><span className="course-status">Dans votre espace</span><h2>{entry.title}</h2><p className="course-meta">Version {entry.version}</p></div><button className="primary" onClick={() => setSelectedCourse(entry)}>Ouvrir le cours →</button></article>)}{!downloadedCourses.length && <div className="empty warning"><BookOpen className="empty-symbol" aria-hidden="true" /><h2>Préparer mon parcours</h2><p>Votre prochain cours commence ici. Choisissez une formation pour préparer votre année.</p><button className="primary" onClick={() => setTab('formations')}>Découvrir les formations</button></div>}</section>}
    {tab === 'formations' && <section className="catalogue" aria-busy={catalogLoading}><h1>Explorer les formations</h1><label className="mobile-search"><Search aria-hidden="true" /><input type="search" aria-label="Rechercher une formation" placeholder="Nom de la formation…" value={catalogSearch} onChange={event => setCatalogSearch(event.target.value)} /></label><p className="muted">Téléchargez une formation pour retrouver ses cours dans votre espace d’étude.</p>{catalogLoading && <p role="status" className="notice">Chargement du catalogue…</p>}{catalogSearch && catalog.length > 0 && !catalog.some(item => item.title.toLocaleLowerCase('fr').includes(catalogSearch.trim().toLocaleLowerCase('fr'))) && <div className="empty" role="status"><h2>Aucune formation trouvée</h2><p>Essayez un autre nom ou effacez votre recherche.</p><button onClick={() => setCatalogSearch('')}>Voir toutes les formations</button></div>}{catalog.length ? catalog.filter(item => item.title.toLocaleLowerCase('fr').includes(catalogSearch.trim().toLocaleLowerCase('fr'))).map((item) => <article className="card course-card" key={`${item.formation_id}-${item.version}`}><span className="course-symbol"><SectionIcon tab="formations" /></span><div className="course-copy"><span className="course-status">Dans le catalogue</span><h2>{item.title}</h2><p className="course-meta">Version {item.version} · {(item.package_size / 1024 / 1024).toFixed(1)} Mio</p></div><button className="primary" onClick={() => void openCatalogueCourse(item)}>Télécharger et ouvrir</button></article>) : <div className="empty"><h2>{catalogLoading ? "Chargement…" : catalogError ? "Catalogue indisponible" : "Pas encore de formations"}</h2><p>{catalogLoading ? "Nous récupérons les formations disponibles." : catalogError ? "Vous pouvez continuer avec vos cours téléchargés." : "Les prochaines formations apparaîtront ici."}</p></div>}</section>}
  </main></div>;
}
