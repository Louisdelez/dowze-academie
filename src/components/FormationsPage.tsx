import "../planning-redesign.css";
import { CollectionCover } from './CollectionCover';
import { CurriculumWorkbench } from './CurriculumWorkbench';
import { FormationChoicePicker } from "./FormationChoicePicker";
import { ServerCatalog } from "./ServerCatalog";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCopy,
  Download,
  FileArchive,
  FileJson2,
  FolderInput,
  GraduationCap,
  LoaderCircle,
  PackageCheck,
  Plus,
  School,
  Sparkles
} from "lucide-react";
import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  FORMATION_PACKAGE_FILENAMES,
  formationDisplayYear,
  slugifyFormationName
} from "../lib/formations";
import type {
  FormationImportPreview,
  FormationPackageFilename,
  InstalledFormation
} from "../lib/formations";
import {
  FORMATION_FILE_GUIDES,
  buildFormationFilePrompt,
  formationTemplatePackageId,
  formationTemplateValidationError,
  type FormationTemplateInput
} from "../lib/formationPrompts";
import { Modal } from "./Modal";

export interface FormationsPageProps {
  accountId: string;
  formations: readonly InstalledFormation[];
  activeFormation: InstalledFormation;
  onActivate: (formation: InstalledFormation) => Promise<void>;
  onChoosePackage: () => Promise<FormationImportPreview | null>;
  onInstallPreview: (preview: FormationImportPreview) => Promise<void>;
  onDownloadKit: (input: FormationTemplateInput) => Promise<boolean>;
  onDownloadTemplate: (
    filename: FormationPackageFilename,
    input: FormationTemplateInput
  ) => Promise<boolean>;
}

type PageView = "library" | "store" | "add";
type BusyOperation =
  | "choose-package"
  | "install-package"
  | "download-kit"
  | `download-template:${FormationPackageFilename}`
  | null;

const dateFormatter = new Intl.DateTimeFormat("fr-CH", {
  day: "numeric",
  month: "short",
  year: "numeric"
});

function installedAtLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date inconnue" : dateFormatter.format(date);
}

function academicDateLabel(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

function defaultAcademicYearDates(now = new Date()) {
  const year = now.getFullYear();
  const startYear = now.getMonth() >= 6 ? year : year - 1;
  return {
    startDate: `${startYear}-09-01`,
    endDate: `${startYear + 1}-06-30`
  };
}

function formationStyle(formation: InstalledFormation): CSSProperties {
  return {
    "--formation-color": formation.manifest.theme.color,
    "--formation-accent": formation.manifest.theme.accent
  } as CSSProperties;
}

function formationOriginLabel(formation: InstalledFormation) {
  return formation.storageKind === "legacy-energy-year1" ? "Incluse" : "Importée";
}

function FormationIdentity({ formation, compact = false }: {
  formation: InstalledFormation;
  compact?: boolean;
}) {
  return (
    <div
      className={`formation-identity ${compact ? "is-compact" : ""}`}
      style={formationStyle(formation)}
    >
      <span className="formation-identity-icon" aria-hidden="true"><School /></span>
      <span className="formation-identity-copy">
        <strong>{formation.manifest.name}</strong>
        <small>
          {formation.manifest.level.label}
          <span aria-hidden="true"> · </span>
          {formationDisplayYear(formation)}
        </small>
      </span>
    </div>
  );
}

function FormationSwitchDialog({
  current,
  target,
  onConfirm,
  onClose
}: {
  current: InstalledFormation;
  target: InstalledFormation;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (activationError) {
      setError(
        activationError instanceof Error
          ? activationError.message
          : "Le changement de formation a échoué."
      );
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Passer à « ${target.manifest.name} » ?`}
      subtitle="Changement d’année scolaire active"
      size="sm"
      onClose={busy ? () => undefined : onClose}
    >
      <div className="formation-switch-dialog">
        <div className="formation-switch-route" aria-label={`${current.manifest.name} vers ${target.manifest.name}`}>
          <FormationIdentity formation={current} compact />
          <ArrowRight aria-hidden="true" />
          <FormationIdentity formation={target} compact />
        </div>
        <div className="formation-switch-preservation">
          <PackageCheck aria-hidden="true" />
          <p>
            Le planning, les cours, les tâches, les notes, les évaluations et les
            contenus de cette formation seront affichés. <strong>Rien ne sera
            supprimé de « {current.manifest.name} ».</strong>
          </p>
        </div>
        {error && <p className="formation-operation-error" role="alert">{error}</p>}
        <div className="modal-actions formation-switch-actions">
          <span />
          <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button type="button" className="primary-button" onClick={() => void confirm()} disabled={busy}>
            {busy ? <LoaderCircle className="is-spinning" /> : <ArrowRightLeft />}
            {busy ? "Changement…" : "Changer de formation"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function FormationsPage({
  accountId,
  formations,
  activeFormation,
  onActivate,
  onChoosePackage,
  onInstallPreview,
  onDownloadKit,
  onDownloadTemplate
}: FormationsPageProps) {
  const [workbenchOpen, setWorkbenchOpen] = useState(false);
  const [view, setView] = useState<PageView>("library");
  const [formationName, setFormationName] = useState("");
  const [academicDates, setAcademicDates] = useState(defaultAcademicYearDates);
  const [preview, setPreview] = useState<FormationImportPreview | null>(null);
  const [pendingActivation, setPendingActivation] = useState<InstalledFormation | null>(null);
  const [busyOperation, setBusyOperation] = useState<BusyOperation>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [operationStatus, setOperationStatus] = useState<string | null>(null);
  const [copiedFilename, setCopiedFilename] = useState<FormationPackageFilename | null>(null);
  const previewSummaryRef = useRef<HTMLElement>(null);
  const copyTimerRef = useRef<number | null>(null);

  const normalizedName = formationName.trim();
  const formationSlug = normalizedName ? slugifyFormationName(normalizedName) : "";
  const templateInput: FormationTemplateInput = {
    name: normalizedName,
    ...academicDates
  };
  const dateError = formationTemplateValidationError({ name: "Formation", ...academicDates });
  const canGenerateTemplates = Boolean(normalizedName && formationSlug && !dateError);
  const folderName = canGenerateTemplates
    ? `dowze-formation-${formationTemplatePackageId(templateInput)}/`
    : "dowze-formation-<identifiant>/";

  const guidesByFilename = useMemo(
    () => new Map(FORMATION_FILE_GUIDES.map((guide) => [guide.filename, guide])),
    []
  );
  const orderedFormations = useMemo(
    () => [...formations].sort((left, right) => {
      if (left.instanceId === activeFormation.instanceId) return -1;
      if (right.instanceId === activeFormation.instanceId) return 1;
      return left.manifest.name.localeCompare(right.manifest.name, "fr");
    }),
    [activeFormation.instanceId, formations]
  );
  const previewErrors = preview?.issues.filter((issue) => issue.severity === "error") ?? [];
  const previewWarnings = preview?.issues.filter((issue) => issue.severity === "warning") ?? [];

  useEffect(() => () => {
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
  }, []);

  useEffect(() => {
    if (pendingActivation?.instanceId === activeFormation.instanceId) {
      setPendingActivation(null);
    }
  }, [activeFormation.instanceId, pendingActivation?.instanceId]);

  useEffect(() => {
    if (!preview) return;
    const frameId = window.requestAnimationFrame(() => previewSummaryRef.current?.focus());
    return () => window.cancelAnimationFrame(frameId);
  }, [preview]);

  const resetFeedback = () => {
    setOperationError(null);
    setOperationStatus(null);
  };

  const openAddView = () => {
    resetFeedback();
    setView("add");
  };

  const returnToLibrary = () => {
    if (busyOperation) return;
    resetFeedback();
    setPreview(null);
    setView("library");
  };

  const downloadKit = async () => {
    if (!canGenerateTemplates || busyOperation) return;
    resetFeedback();
    setBusyOperation("download-kit");
    try {
      const saved = await onDownloadKit(templateInput);
      if (saved) setOperationStatus(`Kit modèle préparé pour « ${normalizedName} ».`);
    } catch (downloadError) {
      setOperationError(downloadError instanceof Error
        ? downloadError.message
        : "Le kit modèle n’a pas pu être téléchargé.");
    } finally {
      setBusyOperation(null);
    }
  };

  const downloadTemplate = async (filename: FormationPackageFilename) => {
    if (!canGenerateTemplates || busyOperation) return;
    resetFeedback();
    setBusyOperation(`download-template:${filename}`);
    try {
      const saved = await onDownloadTemplate(filename, templateInput);
      if (saved) setOperationStatus(`Modèle ${filename} préparé.`);
    } catch (downloadError) {
      setOperationError(downloadError instanceof Error
        ? downloadError.message
        : `Le modèle ${filename} n’a pas pu être téléchargé.`);
    } finally {
      setBusyOperation(null);
    }
  };

  const copyPrompt = async (filename: FormationPackageFilename) => {
    if (!canGenerateTemplates) return;
    resetFeedback();
    try {
      await navigator.clipboard.writeText(buildFormationFilePrompt(filename, templateInput));
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      setCopiedFilename(filename);
      setOperationStatus(`Prompt pour ${filename} copié.`);
      copyTimerRef.current = window.setTimeout(() => setCopiedFilename(null), 2400);
    } catch {
      setOperationError("Le prompt n’a pas pu être copié. Vérifiez l’autorisation du presse-papiers.");
    }
  };

  const choosePackage = async () => {
    if (busyOperation) return;
    resetFeedback();
    setBusyOperation("choose-package");
    try {
      const nextPreview = await onChoosePackage();
      if (!nextPreview) return;
      setPreview(nextPreview);
    } catch (chooseError) {
      setOperationError(chooseError instanceof Error
        ? chooseError.message
        : "Le dossier n’a pas pu être analysé.");
    } finally {
      setBusyOperation(null);
    }
  };

  const installPreview = async () => {
    if (!preview?.valid || busyOperation) return;
    resetFeedback();
    setBusyOperation("install-package");
    try {
      await onInstallPreview(preview);
      const installedName = preview.manifest?.name ?? "La formation";
      setPreview(null);
      setView("library");
      setOperationStatus(`« ${installedName} » a été ajoutée à vos formations.`);
    } catch (installError) {
      setOperationError(installError instanceof Error
        ? installError.message
        : "La formation n’a pas pu être installée.");
    } finally {
      setBusyOperation(null);
    }
  };

  return (
    <main
      className="page formations-page"
      aria-labelledby="formations-page-title"
      aria-busy={Boolean(busyOperation)}
    >
      {view !== "add" ? (
        <>
          <header className="page-heading formations-heading">
            <div>
              <p className="eyebrow">Votre école, année après année</p>
              <h1 id="formations-page-title">Mes formations</h1>
              <p className="heading-subtitle">Une formation correspond à une année scolaire complète.</p>
            </div>
            <button type="button" className="primary-button" onClick={openAddView}>
              <Plus /> Importer une formation
            </button>
          </header>

          <nav className="formation-library-tabs" aria-label="Bibliothèque et catalogue">
            <button type="button" aria-pressed={view === 'library'} onClick={() => setView('library')}>Mes années <span>{formations.length}</span></button>
            <button type="button" aria-pressed={view === 'store'} onClick={() => setView('store')}>Catalogue</button>
          </nav>
          <ServerCatalog key={accountId} accountId={accountId} install={onInstallPreview} formations={formations} activate={onActivate} view={view} />
          {view === 'library' && <>

          {(operationError || operationStatus) && (
            <div
              className={`formation-page-feedback ${operationError ? "is-error" : "is-success"}`}
              role={operationError ? "alert" : "status"}
            >
              {operationError ? <AlertTriangle aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
              <span>{operationError ?? operationStatus}</span>
            </div>
          )}

          <section
            className="formation-active-card"
            style={formationStyle(activeFormation)}
            aria-labelledby="active-formation-title"
          >
            <div className="formation-active-icon" aria-hidden="true"><GraduationCap /></div>
            <div className="formation-active-copy">
              <p className="eyebrow">Formation active</p>
              <h2 id="active-formation-title">{activeFormation.manifest.name}</h2>
              <p>{activeFormation.manifest.description}</p>
              <div className="formation-active-meta">
                <span>{activeFormation.manifest.level.label}</span>
                <span>{formationDisplayYear(activeFormation)}</span>
                <span>
                  {academicDateLabel(activeFormation.manifest.academicYear.startDate)}
                  {" → "}
                  {academicDateLabel(activeFormation.manifest.academicYear.endDate)}
                </span>
              </div>
            </div>
            <span className="formation-active-badge"><Check /> Active</span>
          </section>

          <section className="formations-library" aria-labelledby="formations-library-title">
            <header>
              <div>
                <p className="eyebrow">Disponibles sur ce profil</p>
                <h2 id="formations-library-title">Mes années</h2>
              </div>
              <span>{formations.length} formation{formations.length === 1 ? "" : "s"}</span>
            </header>
            <ul className="formation-card-grid">
              {orderedFormations.map((formation) => {
                const isActive = formation.instanceId === activeFormation.instanceId;
                return (
                  <li key={formation.instanceId}>
                    <article
                      className={`formation-card ${isActive ? "is-active" : ""}`}
                      style={formationStyle(formation)}
                    >
                      <CollectionCover title={formation.manifest.name} category={formation.packageId.startsWith('dowze-fr-') ? 'France' : 'Suisse'} label={formationDisplayYear(formation)} />
                      <div className="formation-card-topline">
                        <span>{formationOriginLabel(formation)}</span>
                        {isActive && <strong><Check /> Active</strong>}
                      </div>
                      <FormationIdentity formation={formation} />
                      <p>{formation.manifest.description}</p>
                      <dl className="formation-card-details">
                        <div><dt>Année</dt><dd>{formationDisplayYear(formation)}</dd></div>
                        <div><dt>Ajoutée</dt><dd>{installedAtLabel(formation.installedAt)}</dd></div>
                      </dl>
                      <button
                        type="button"
                        className={isActive ? "formation-current-button" : "secondary-button"}
                        disabled={isActive}
                        onClick={() => setPendingActivation(formation)}
                        aria-label={isActive
                          ? `${formation.manifest.name}, formation active`
                          : `Activer la formation « ${formation.manifest.name} »`}
                      >
                        {isActive ? <Check /> : <ArrowRightLeft />}
                        {isActive ? "Formation active" : "Activer"}
                      </button>
                    </article>
                  </li>
                );
              })}
            </ul>
          </section>
          </>}
        </>
      ) : (
        <>
          <header className="page-heading formations-heading formations-builder-heading">
            <div>
              <button type="button" className="formation-back-button" onClick={returnToLibrary} disabled={Boolean(busyOperation)}>
                <ArrowLeft /> Toutes les formations
              </button>
              <p className="eyebrow">Modèle annuel strict</p>
              <h1 id="formations-page-title">Ajouter une formation</h1>
              <p className="heading-subtitle">Préparez les fichiers à la main ou avec l’IA de votre choix, puis importez le dossier complet.</p>
            </div>
          </header>

          <nav className="formation-builder-map" aria-label="Étapes d’import"><a href="#formation-name-title">1. Définir mon année</a><a href="#formation-prompts-title">2. Préparer les fichiers</a><a href="#formation-import-title">3. Vérifier et importer</a></nav>
          <section className="formation-builder-intro" aria-labelledby="formation-name-title">
            <div className="formation-builder-step"><span>1</span><p><strong id="formation-name-title">Nommer la formation</strong><small>Ce nom sera ajouté automatiquement dans chaque prompt et modèle.</small></p></div>
            <label className="formation-name-field">
              <span>Nom de la formation</span>
              <input
                autoFocus
                value={formationName}
                maxLength={120}
                onChange={(event) => {
                  setFormationName(event.target.value);
                  resetFeedback();
                }}
                placeholder="Ex. Lycée — Seconde"
                aria-describedby="formation-folder-preview formation-name-help"
              />
            </label>
            <div className="formation-period-fields">
              <label className="formation-name-field">
                <span>Début de l’année scolaire</span>
                <input
                  type="date"
                  min="1900-01-01"
                  max="2100-12-31"
                  value={academicDates.startDate}
                  onChange={(event) => {
                    setAcademicDates((current) => ({ ...current, startDate: event.target.value }));
                    resetFeedback();
                  }}
                />
              </label>
              <label className="formation-name-field">
                <span>Fin de l’année scolaire</span>
                <input
                  type="date"
                  min="1900-01-01"
                  max="2100-12-31"
                  value={academicDates.endDate}
                  onChange={(event) => {
                    setAcademicDates((current) => ({ ...current, endDate: event.target.value }));
                    resetFeedback();
                  }}
                />
              </label>
            </div>
            {dateError && <p className="formation-date-error" role="alert">{dateError}</p>}
            <p id="formation-name-help" className="formation-name-help">
              Utilisez un intitulé d’une seule année scolaire. L’identifiant technique restera stable même si le nom visible évolue.
            </p>
            <div id="formation-folder-preview" className="formation-folder-preview">
              <FolderInput aria-hidden="true" />
              <span>Dossier attendu</span>
              <code>{folderName}</code>
            </div>
          </section>

          <section className="formation-kit-card" aria-labelledby="formation-kit-title">
            <div className="formation-kit-icon" aria-hidden="true"><FileArchive /></div>
            <div>
              <p className="eyebrow">Kit complet</p>
              <h2 id="formation-kit-title">Télécharger tous les modèles</h2>
              <p>Le kit contient les six JSON, leurs schémas et prompts, ainsi qu’un dossier éditorial, six missions d’agents et des modèles de sources et compétences.</p>
            </div>
            <button
              type="button"
              className="primary-button"
              onClick={() => void downloadKit()}
              disabled={!canGenerateTemplates || Boolean(busyOperation)}
            >
              {busyOperation === "download-kit" ? <LoaderCircle className="is-spinning" /> : <Download />}
              {busyOperation === "download-kit" ? "Préparation…" : "Télécharger le kit"}
            </button>
          </section>

          <details className="formation-editorial-disclosure" onToggle={(event) => setWorkbenchOpen(event.currentTarget.open)}><summary>Atelier de conception pédagogique (avancé)</summary>{workbenchOpen && <CurriculumWorkbench key={`${accountId}:${activeFormation.instanceId}`} accountId={accountId} annualInstanceId={activeFormation.instanceId} />}</details>

          <section className="formation-prompts-section" aria-labelledby="formation-prompts-title">
            <header>
              <div className="formation-builder-step"><span>2</span><p><strong id="formation-prompts-title">Remplir les six fichiers</strong><small>Suivez l’ordre pour conserver des identifiants cohérents entre les fichiers.</small></p></div>
              <span className="formation-local-only-note"><Sparkles /> Aucune IA n’est contactée par Dowze Academie</span>
            </header>
            <ol className="formation-file-list">
              {FORMATION_PACKAGE_FILENAMES.map((filename, index) => {
                const guide = guidesByFilename.get(filename);
                if (!guide) return null;
                const prompt = canGenerateTemplates
                  ? buildFormationFilePrompt(filename, templateInput)
                  : "Saisissez un nom et une période annuelle valides pour générer ce prompt.";
                const templateBusy = busyOperation === `download-template:${filename}`;
                return (
                  <li className="formation-file-card" key={filename}>
                    <div className="formation-file-heading">
                      <span className="formation-file-index">{index + 1}</span>
                      <span className="formation-file-icon" aria-hidden="true"><FileJson2 /></span>
                      <div>
                        <code>{filename}</code>
                        <strong>{guide.label}</strong>
                        <p>{guide.description}</p>
                      </div>
                    </div>
                    <div className="formation-file-dependencies">
                      <span>Dépendances</span>
                      <p>{guide.dependsOn.length
                        ? <>Joindre aussi {guide.dependsOn.map((dependency) => <code key={dependency}>{dependency}</code>)}</>
                        : "Aucun fichier préalable : commencez par celui-ci."}</p>
                    </div>
                    <div className="formation-file-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => void downloadTemplate(filename)}
                        disabled={!canGenerateTemplates || Boolean(busyOperation)}
                        aria-label={`Télécharger le modèle ${filename}`}
                      >
                        {templateBusy ? <LoaderCircle className="is-spinning" /> : <Download />}
                        {templateBusy ? "Préparation…" : "Télécharger le modèle"}
                      </button>
                      <button
                        type="button"
                        className={`secondary-button formation-copy-button ${copiedFilename === filename ? "is-copied" : ""}`}
                        onClick={() => void copyPrompt(filename)}
                        disabled={!canGenerateTemplates}
                        aria-label={`Copier le prompt pour ${filename}`}
                      >
                        {copiedFilename === filename ? <Check /> : <ClipboardCopy />}
                        {copiedFilename === filename ? "Copié" : "Copier le prompt"}
                      </button>
                    </div>
                    <details className="formation-prompt-details">
                      <summary><ChevronDown aria-hidden="true" /> Aperçu du prompt</summary>
                      <pre tabIndex={0} aria-label={`Prompt généré pour ${filename}`}><code>{prompt}</code></pre>
                    </details>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="formation-import-section" aria-labelledby="formation-import-title">
            <header>
              <div className="formation-builder-step"><span>3</span><p><strong id="formation-import-title">Importer le dossier terminé</strong><small>Les fichiers sont analysés localement et aucun script n’est exécuté.</small></p></div>
              <button
                type="button"
                className="primary-button"
                onClick={() => void choosePackage()}
                disabled={Boolean(busyOperation)}
              >
                {busyOperation === "choose-package" ? <LoaderCircle className="is-spinning" /> : <FolderInput />}
                {busyOperation === "choose-package" ? "Analyse…" : preview ? "Choisir un autre dossier" : "Importer un dossier"}
              </button>
            </header>

            {preview ? (
              <article
                ref={previewSummaryRef}
                tabIndex={-1}
                className={`formation-import-preview ${preview.valid ? "is-valid" : "is-invalid"}`}
                aria-labelledby="formation-import-result-title"
              >
                <div className="formation-import-result-heading">
                  <span aria-hidden="true">{preview.valid ? <CheckCircle2 /> : <AlertTriangle />}</span>
                  <div>
                    <h3 id="formation-import-result-title">
                      {preview.valid ? "Dossier prêt à être installé" : "Dossier à corriger"}
                    </h3>
                    <p>{preview.manifest?.name ?? "Le manifeste n’a pas pu être lu."}</p>
                  </div>
                </div>
                <dl className="formation-import-counts" aria-label="Contenu détecté">
                  <div><dt>Matières</dt><dd>{preview.counts.subjects}</dd></div>
                  <div><dt>Modules</dt><dd>{preview.counts.modules}</dd></div>
                  <div><dt>Chapitres</dt><dd>{preview.counts.chapters}</dd></div>
                  <div><dt>Cours</dt><dd>{preview.counts.lessons}</dd></div>
                  <div><dt>Événements</dt><dd>{preview.counts.events}</dd></div>
                  <div><dt>Tâches</dt><dd>{preview.counts.tasks}</dd></div>
                </dl>
                {preview.valid && preview.manifest?.choices && !preview.manifest.choices.selected && <FormationChoicePicker key={preview.manifest.id} preview={preview} onConfirm={async chosen => { setPreview(chosen); }} />}
                {previewErrors.length > 0 && (
                  <section className="formation-issue-group is-error" aria-labelledby="formation-errors-title">
                    <h4 id="formation-errors-title">{previewErrors.length} erreur{previewErrors.length === 1 ? "" : "s"} bloquante{previewErrors.length === 1 ? "" : "s"}</h4>
                    <ul>{previewErrors.map((issue, index) => (
                      <li key={`${issue.file}:${issue.path}:${issue.code}:${index}`}>
                        <code>{issue.file}{issue.path ? ` · ${issue.path}` : ""}</code>
                        <span>{issue.message}</span>
                      </li>
                    ))}</ul>
                  </section>
                )}
                {previewWarnings.length > 0 && (
                  <section className="formation-issue-group is-warning" aria-labelledby="formation-warnings-title">
                    <h4 id="formation-warnings-title">{previewWarnings.length} avertissement{previewWarnings.length === 1 ? "" : "s"}</h4>
                    <ul>{previewWarnings.map((issue, index) => (
                      <li key={`${issue.file}:${issue.path}:${issue.code}:${index}`}>
                        <code>{issue.file}{issue.path ? ` · ${issue.path}` : ""}</code>
                        <span>{issue.message}</span>
                      </li>
                    ))}</ul>
                  </section>
                )}
                <div className="formation-import-actions">
                  <p>{preview.valid
                    ? "L’installation crée un nouvel espace annuel privé sans modifier vos autres formations."
                    : "Corrigez toutes les erreurs, puis sélectionnez à nouveau le dossier."}</p>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => void installPreview()}
                    disabled={!preview.valid || Boolean(busyOperation) || Boolean(preview.manifest?.choices && !preview.manifest.choices.selected)}
                  >
                    {busyOperation === "install-package" ? <LoaderCircle className="is-spinning" /> : <PackageCheck />}
                    {busyOperation === "install-package" ? "Installation…" : "Installer la formation"}
                  </button>
                </div>
              </article>
            ) : (
              <div className="formation-import-empty">
                <FolderInput aria-hidden="true" />
                <p><strong>Aucun dossier sélectionné</strong><span>Les six fichiers obligatoires seront validés ensemble avant toute installation.</span></p>
              </div>
            )}
          </section>

          {(operationError || operationStatus) && (
            <div
              className={`formation-page-feedback formation-page-feedback--builder ${operationError ? "is-error" : "is-success"}`}
              role={operationError ? "alert" : "status"}
              aria-live="polite"
            >
              {operationError ? <AlertTriangle aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
              <span>{operationError ?? operationStatus}</span>
            </div>
          )}
        </>
      )}

      {pendingActivation && pendingActivation.instanceId !== activeFormation.instanceId && (
        <FormationSwitchDialog
          current={activeFormation}
          target={pendingActivation}
          onClose={() => setPendingActivation(null)}
          onConfirm={async () => {
            await onActivate(pendingActivation);
            setOperationStatus(`Formation active : « ${pendingActivation.manifest.name} ».`);
            setPendingActivation(null);
          }}
        />
      )}
    </main>
  );
}
