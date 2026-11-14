import "../planning-redesign.css";
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BookOpen, CalendarDays, Check, Download, LoaderCircle, Search } from 'lucide-react';
import { serverRequest } from '../lib/server';
import { FORMATION_REQUIRED_FILES, validateAndCompileFormationPackage, type FormationImportPreview, type FormationPackageFiles, type InstalledFormation } from '../lib/formations';
import { loadFormationCatalog } from '../lib/formationRegistry';
import { courseCollections, packageSizeLabel, type CatalogEntry, type CourseCollection } from '../lib/courseCollections';
import { loadDownloadedCollections, saveDownloadedCollection, type DownloadedCollection } from '../lib/downloadedCollections';
import { FormationChoicePicker } from './FormationChoicePicker';
import { CollectionCover } from './CollectionCover';
import { Modal } from './Modal';

export function ServerCatalog({ accountId, install, formations, activate, view }: {
  accountId: string; install: (preview: FormationImportPreview) => Promise<void>;
  formations: readonly InstalledFormation[]; activate: (formation: InstalledFormation) => Promise<void>; view: 'library' | 'store';
}) {
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [downloads, setDownloads] = useState<DownloadedCollection[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Toutes');
  const [opened, setOpened] = useState<DownloadedCollection>();
  const [pending, setPending] = useState<FormationImportPreview>();
  const alive = useRef(true);
  const scope = useRef(accountId); scope.current = accountId;
  const current = () => alive.current && scope.current === accountId;
  async function load() {
    setBusy('catalog');
    try {
      const result = await serverRequest<{ items: CatalogEntry[] }>(accountId, 'GET', '/v1/catalog');
      if (!Array.isArray(result.items) || result.items.some(entry => !entry || typeof entry.title !== 'string' || !/^[a-z0-9-]{1,64}$/.test(entry.formation_id) || !/^\d+\.\d+\.\d+$/.test(entry.version) || !Number.isFinite(entry.package_size) || entry.package_size < 0)) throw new Error('Catalogue invalide.');
      if (current()) { setEntries(result.items); setNotice(result.items.length ? '' : 'Aucune collection publiée pour le moment.'); }
    } catch { if (current()) setNotice('Le catalogue est indisponible. Vos années téléchargées restent accessibles dans Mes années.'); }
    finally { if (current()) setBusy(''); }
  }
  useEffect(() => {
    alive.current = true;
    void loadDownloadedCollections(accountId).then(records => { if (current()) setDownloads(records); }).catch(error => { if (current()) setNotice(String(error)); });
    return () => { alive.current = false; };
  }, [accountId]);
  useEffect(() => { if (view === 'store' && !entries.length && !busy) void load(); }, [view]);
  const collections = useMemo(() => courseCollections(entries), [entries]);
  const visible = collections.filter(c => (category === 'Toutes' || c.category === category) && `${c.title} ${c.entries.map(e => e.title).join(' ')}`.toLocaleLowerCase('fr').includes(query.toLocaleLowerCase('fr')));
  const remaining = downloads.filter(record => record.collection.entries.some(entry => !formations.some(f => f.packageId === entry.formation_id)));
  async function download(collection: CourseCollection) {
    if (busy) return;
    setBusy(collection.id); setNotice('');
    try {
      const packages: FormationPackageFiles[] = [];
      for (const entry of collection.entries) {
        if (!/^[a-z0-9-]{1,64}$/.test(entry.formation_id) || !/^\d+\.\d+\.\d+$/.test(entry.version)) throw new Error('Identité de collection invalide.');
        const result = await serverRequest<{ files: Record<string, string> }>(accountId, 'GET', `/v1/catalog/${entry.formation_id}/${entry.version}/content`);
        if (!current()) return;
        if (!result.files || Object.keys(result.files).length !== 6 || !FORMATION_REQUIRED_FILES.every(name => typeof result.files[name] === 'string')) throw new Error('Collection incomplète.');
        packages.push(result.files as unknown as FormationPackageFiles);
      }
      const record: DownloadedCollection = { accountId, collection, packages, downloadedAt: new Date().toISOString() };
      await saveDownloadedCollection(record);
      if (current()) { setDownloads(previous => [...previous.filter(r => r.collection.id !== collection.id), record]); setNotice(`« ${collection.title} » est téléchargée. Ouvrez-la pour préparer votre année.`); }
    } catch (error) { if (current()) setNotice(error instanceof Error ? error.message : 'Téléchargement interrompu. Réessayez.'); }
    finally { if (current()) setBusy(''); }
  }
  function selectPackage(record: DownloadedCollection, index: number) {
    try {
      const preview = validateAndCompileFormationPackage(record.packages[index]);
      const entry = record.collection.entries[index];
      if (!preview.valid || preview.manifest?.id !== entry.formation_id || preview.manifest.packageVersion !== entry.version) throw new Error('Cette collection doit être téléchargée à nouveau.');
      setPending(preview); setNotice('');
    } catch (error) { setNotice(String(error)); }
  }
  function open(record: DownloadedCollection) {
    setOpened(record); setPending(undefined);
    if (record.packages.length === 1) selectPackage(record, 0);
  }
  async function begin(preview: FormationImportPreview) {
    if (!current() || busy) return;
    setBusy('opening');
    try {
      let formation = loadFormationCatalog(accountId).formations.find(f => f.packageId === preview.manifest?.id);
      if (!formation) {
        await install(preview);
        if (!current()) return;
        formation = loadFormationCatalog(accountId).formations.find(f => f.packageId === preview.manifest?.id);
      }
      if (!formation) throw new Error('L’année n’a pas pu être préparée.');
      await activate(formation);
      if (current()) { setOpened(undefined); setPending(undefined); }
    } catch (error) {
      if (current()) setNotice(error instanceof Error ? error.message : 'L’année n’a pas pu être ouverte. Réessayez.');
    } finally { if (current()) setBusy(''); }
  }
  function renderCard(collection: CourseCollection, record?: DownloadedCollection) {
    const installed = formations.find(f => collection.entries.some(e => e.formation_id === f.packageId));
    const complete = collection.entries.every(e => formations.some(f => f.packageId === e.formation_id));
    return <article className="collection-card" key={collection.id} aria-label={collection.title}>
      <CollectionCover title={collection.title} category={collection.category} label={collection.label} />
      <div className="collection-card-body"><div className="collection-card-kicker">{record ? <><Check aria-hidden="true" /> Téléchargée</> : collection.category}{collection.entries.length > 1 && <span>{collection.entries.length} {collection.category === 'Langues' ? 'niveaux' : 'parcours'}</span>}</div>
        <h3>{collection.title}</h3><p>{collection.category === 'Langues' ? 'Choisissez votre niveau à l’ouverture et avancez dans votre parcours.' : 'Tronc commun et choix de parcours réunis dans votre année.'}</p>
        <div className="collection-card-includes"><span><BookOpen aria-hidden="true" />Cours</span>{collection.category !== 'Langues' && <><span><CalendarDays aria-hidden="true" />Planning</span><span>Évaluations</span></>}</div>
        <footer><small>{packageSizeLabel(collection.entries.reduce((sum, e) => sum + e.package_size, 0))}</small>
          {complete && installed ? <button className="secondary-button" disabled={!!busy} onClick={() => void activate(installed).catch(error => setNotice(String(error)))}>Ouvrir <ArrowRight aria-hidden="true" /></button> : record ? <button className="primary-button" disabled={!!busy} onClick={() => open(record)}>Préparer mon année <ArrowRight aria-hidden="true" /></button> : <button className="secondary-button" disabled={!!busy} onClick={() => void download(collection)}>{busy === collection.id ? <LoaderCircle aria-hidden="true" className="is-spinning" /> : <Download aria-hidden="true" />}{busy === collection.id ? 'Téléchargement…' : 'Télécharger'}</button>}
        </footer>
      </div>
    </article>;
  }
  return <>
    {view === 'store' ? <section className="collection-store" aria-label="Catalogue en ligne" aria-busy={busy === 'catalog'}>
      <div className="collection-store-intro"><div><p className="eyebrow">Une collection, toute une année</p><h2>Choisir une formation</h2><p>Téléchargez votre année. Choisissez ensuite vos langues et spécialités à la première ouverture.</p></div><button className="secondary-button" disabled={!!busy} onClick={() => void load()}>{busy === 'catalog' ? 'Chargement…' : 'Actualiser'}</button></div>
      <div className="collection-store-toolbar"><label className="collection-search"><Search aria-hidden="true" /><input type="search" name="collection-search" autoComplete="off" aria-label="Rechercher une collection" placeholder="Maturité, lycée, langue…" value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" aria-label="Effacer la recherche" onClick={() => setQuery('')}>×</button>}</label><div className="collection-filters" aria-label="Catégories">{['Toutes', 'Suisse', 'France', 'Langues'].map(item => <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div></div>
      <p className="collection-result-count" role="status" aria-live="polite">{visible.length} collection{visible.length === 1 ? '' : 's'}</p>
      {notice && <p className="collection-notice" role="status">{notice}</p>}
      <div className="collection-grid">{visible.map(collection => renderCard(collection, downloads.find(d => d.collection.id === collection.id)))}</div>
      {!visible.length && !busy && entries.length > 0 && <div className="collection-empty"><p>Aucune formation ne correspond à ces filtres.</p><button type="button" className="secondary-button" onClick={() => { setQuery(''); setCategory('Toutes'); }}>Réinitialiser les filtres</button></div>}
    </section> : remaining.length > 0 ? <section className="collection-downloads" aria-label="Années téléchargées à préparer"><header><p className="eyebrow">Prêtes sur cet appareil</p><h2>À préparer pour la rentrée</h2><p>Votre collection est téléchargée. Quelques choix suffisent pour commencer.</p></header>{notice && <p role="status" className="collection-notice">{notice}</p>}<div className="collection-grid">{remaining.map(record => renderCard(record.collection, record))}</div></section> : notice && <p role="status" className="collection-notice">{notice}</p>}
    {opened && <Modal title="Bienvenue dans votre année" subtitle="Votre programme, à votre rythme" size="lg" onClose={() => { if (!busy) { setOpened(undefined); setPending(undefined); } }}>
      {!pending ? <div className="annual-story"><p className="eyebrow">{opened.collection.title}</p><h3 className="annual-story-title">{opened.collection.category === 'Langues' ? 'Quel niveau souhaitez-vous travailler ?' : 'Quel domaine souhaitez-vous suivre ?'}</h3><div className="annual-story-options">{opened.collection.entries.map((entry, i) => <button className="annual-story-option" key={entry.formation_id} onClick={() => selectPackage(opened, i)}><strong>{entry.title.replace(/^Maturité spécialisée — /, '')}</strong><ArrowRight aria-hidden="true" /></button>)}</div></div> : pending.manifest?.choices && !pending.manifest.choices.selected && !formations.some(f => f.packageId === pending.manifest?.id) ? <FormationChoicePicker key={pending.manifest.id} preview={pending} onConfirm={begin} onCancel={() => { setOpened(undefined); setPending(undefined); }} /> : <div className="annual-story"><p className="eyebrow">Votre collection annuelle</p><h3 className="annual-story-title">{pending.manifest?.name}</h3><p>{pending.manifest?.description}</p><div className="annual-story-ready"><Check aria-hidden="true" /><p><strong>{pending.counts.subjects} matières · {pending.counts.lessons} cours</strong><span>Du {new Intl.DateTimeFormat('fr-CH', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${pending.manifest?.academicYear.startDate}T00:00:00Z`))} au {new Intl.DateTimeFormat('fr-CH', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${pending.manifest?.academicYear.endDate}T00:00:00Z`))}</span></p></div><button className="primary-button" disabled={!!busy} onClick={() => void begin(pending).catch(error => setNotice(String(error)))}>Ouvrir mon année <ArrowRight aria-hidden="true" /></button></div>}
      {notice && <p role="status" className="collection-notice">{notice}</p>}
    </Modal>}
  </>;
}
