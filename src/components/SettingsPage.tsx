import "./account-surfaces.css";
import { appStorage } from "../lib/appStorage";
import { AppUpdateSettings } from './AppUpdateSettings';
import { ServerSettings } from "./ServerSettings";
import type { ServerSyncController } from "../hooks/useServerSync";
import {
  AlertTriangle,
  BookOpenText,
  BrainCircuit,
  ChevronDown,
  Database,
  Download,
  ExternalLink,
  Gem,
  Globe2,
  GraduationCap,
  Info,
  Languages,
  LoaderCircle,
  LogOut,
  Monitor,
  MessagesSquare,
  MoonStar,
  Music2,
  PanelRight,
  Play,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wind
} from "lucide-react";
import { useEffect, useState } from "react";
import type { AiProvider, AssessmentRecord, CalendarEvent, Conversation, Subject, SubjectNotesStore, TaskItem } from "../types";
import type { StoredFreeChatConversation } from "../lib/freeChat";
import type { LocalAccount } from "../lib/localAuth";
import { slugifyFormationName, type InstalledFormation } from "../lib/formations";
import {
  getNativeCapabilities,
  openGoogleWebProfile,
  removeGoogleWebProfile,
  saveTextDocument
} from "../lib/tauri";
import { Modal } from "./Modal";

const PROVIDERS: Array<{ value: AiProvider; label: string }> = [
  { value: "chatgpt", label: "ChatGPT" },
  { value: "claude", label: "Claude" },
  { value: "gemini", label: "Gemini" },
  { value: "mistral", label: "Mistral" },
  { value: "kimi", label: "Kimi" },
  { value: "freechat", label: "Chat libre" },
  { value: "duolingo", label: "Duolingo" },
  { value: "khanacademy", label: "Khan Academy" },
  { value: "youtube", label: "YouTube" },
  { value: "tiktok", label: "TikTok" },
  { value: "notebooklm", label: "NotebookLM" }
];

function SettingsProviderIcon({ provider }: { provider: AiProvider }) {
  switch (provider) {
    case "chatgpt":
      return <Sparkles aria-hidden="true" />;
    case "claude":
      return <span>C</span>;
    case "gemini":
      return <Gem aria-hidden="true" />;
    case "mistral":
      return <Wind aria-hidden="true" />;
    case "deepseek":
      return <BrainCircuit aria-hidden="true" />;
    case "kimi":
      return <MoonStar aria-hidden="true" />;
    case "freechat":
      return <MessagesSquare aria-hidden="true" />;
    case "duolingo":
      return <Languages aria-hidden="true" />;
    case "khanacademy":
      return <GraduationCap aria-hidden="true" />;
    case "youtube":
      return <Play aria-hidden="true" />;
    case "tiktok":
      return <Music2 aria-hidden="true" />;
    case "notebooklm":
      return <BookOpenText aria-hidden="true" />;
  }
}

interface SettingsPageProps {
  serverSync: ServerSyncController;
  account: LocalAccount;
  formation: InstalledFormation;
  workspaceRecoveryKeys: readonly string[];
  provider: AiProvider;
  aiWidth: number;
  maxAiWidth: number;
  subjects: Subject[];
  events: CalendarEvent[];
  conversations: Conversation[];
  freeChatConversations: StoredFreeChatConversation[];
  subjectNotesStore: SubjectNotesStore;
  assessments: AssessmentRecord[];
  tasks: TaskItem[];
  onProviderChange: (provider: AiProvider) => void;
  onAiWidthChange: (width: number) => void;
  onOpenAi: () => void;
  onLogout: () => void;
  onGoogleWebProfileRemovalSettled?: () => void;
}

export function SettingsPage({
  serverSync,
  account,
  formation,
  workspaceRecoveryKeys,
  provider,
  aiWidth,
  maxAiWidth,
  subjects,
  events,
  conversations,
  freeChatConversations,
  subjectNotesStore,
  assessments,
  tasks,
  onProviderChange,
  onAiWidthChange,
  onOpenAi,
  onLogout,
  onGoogleWebProfileRemovalSettled
}: SettingsPageProps) {
  const [group, setGroup] = useState('account');
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [openingGoogleProfile, setOpeningGoogleProfile] = useState(false);
  const [googleRemovalOpen, setGoogleRemovalOpen] = useState(false);
  const [removingGoogleProfile, setRemovingGoogleProfile] = useState(false);
  const [googleRemovalSupported, setGoogleRemovalSupported] = useState(false);
  const [googleProfileFeedback, setGoogleProfileFeedback] = useState<{
    tone: "info" | "success" | "error";
    text: string;
  } | null>(null);

  const googleProfileBusy = openingGoogleProfile || removingGoogleProfile;

  useEffect(() => {
    let active = true;
    void getNativeCapabilities()
      .then((capabilities) => {
        if (active) setGoogleRemovalSupported(capabilities.googleWebProfileRemoval);
      })
      .catch(() => {
        if (active) setGoogleRemovalSupported(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleOpenGoogleProfile = async () => {
    if (googleProfileBusy) return;
    setOpeningGoogleProfile(true);
    setGoogleProfileFeedback(null);
    try {
      const target = await openGoogleWebProfile();
      setGoogleProfileFeedback({
        tone: "info",
        text: target === "integrated-window"
          ? "Fenêtre Google ouverte. Terminez ou vérifiez la connexion dans cette fenêtre, puis revenez dans Dowze Academie."
          : "Google a été ouvert dans votre navigateur. La session partagée du navigateur intégré se teste dans l’application Dowze Academie."
      });
    } catch (error) {
      setGoogleProfileFeedback({
        tone: "error",
        text: `Impossible d’ouvrir la fenêtre Google : ${String(error)}`
      });
    } finally {
      setOpeningGoogleProfile(false);
    }
  };

  const handleRemoveGoogleProfile = async () => {
    if (googleProfileBusy || !googleRemovalSupported) return;
    setRemovingGoogleProfile(true);
    setGoogleProfileFeedback(null);
    try {
      const result = await removeGoogleWebProfile();
      setGoogleRemovalOpen(false);
      setGoogleProfileFeedback({
        tone: "success",
        text: result.removedRecords > 0
          ? "Les données de connexion Google ont été retirées de Dowze Academie. Votre compte Google en ligne existe toujours."
          : "Aucune donnée de connexion Google n’était enregistrée dans Dowze Academie. Votre compte Google en ligne n’a pas été modifié."
      });
    } catch (error) {
      setGoogleProfileFeedback({
        tone: "error",
        text: `Impossible de retirer les données Google : ${String(error)}`
      });
    } finally {
      setRemovingGoogleProfile(false);
      // La commande native ferme les WebViews avant d'effacer le stockage et
      // peut encore échouer ensuite. L'appelant doit donc resynchroniser le
      // panneau après toute tentative terminée, succès comme erreur.
      onGoogleWebProfileRemovalSettled?.();
    }
  };

  const exportData = async () => {
    if (exporting) return;
    setExporting(true);
    setExportStatus(null);
    const recoveryCopies: Record<string, string> = {};
    try {
      for (let index = 0; index < appStorage.length; index += 1) {
        const key = appStorage.key(index);
        if (!key || !workspaceRecoveryKeys.includes(key)) continue;
        const value = appStorage.getItem(key);
        if (value !== null) recoveryCopies[key] = value;
      }
    } catch {
      // L'export principal reste utilisable si WebKit refuse l'énumération du stockage.
    }
    const payload = JSON.stringify({
      version: 6,
      exportedAt: new Date().toISOString(),
      account: {
        id: account.id,
        displayName: account.displayName,
        username: account.username
      },
      formation: {
        instanceId: formation.instanceId,
        packageId: formation.packageId,
        packageVersion: formation.packageVersion,
        manifest: formation.manifest
      },
      subjects,
      events,
      conversations,
      freeChatConversations,
      subjectNotes: subjectNotesStore,
      assessments,
      tasks,
      recoveryCopies
    }, null, 2);
    try {
      const destination = await saveTextDocument(
        payload,
        `dowze-academie-${slugifyFormationName(formation.manifest.shortName)}-${new Date().toISOString().slice(0, 10)}.json`,
        "json"
      );
      setExportStatus(destination ? "Export enregistré." : null);
    } catch (error) {
      setExportStatus(`Échec de l’export : ${String(error)}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <main className={`page settings-page ${googleRemovalOpen ? "settings-page--google-removal-open" : ""}`}>
      <header className="page-heading">
        <div>
          
          <h1>Réglages</h1>
          <p className="heading-subtitle">Personnalisez votre espace d’étude.</p>
        </div>
      </header>

      <div className="desk-settings-layout">
      <nav className="desk-settings-nav" aria-label="Rubriques des réglages">
        {([['account','Compte et synchronisation'],['services','Services d’étude'],['data','Sauvegardes'],['updates','Mises à jour'],['privacy','Confidentialité']] as const).map(([id,label]) => <button type="button" key={id} aria-pressed={group === id} onClick={() => setGroup(id)}>{label}<span aria-hidden="true">›</span></button>)}
      </nav>
      <div className="settings-grid" data-settings-group={group}>
        <AppUpdateSettings />
        <ServerSettings sync={serverSync} />
        <section id="settings-profile" className="settings-section settings-account-section">
          <div className="settings-title"><span className="settings-account-avatar">{account.displayName.trim().charAt(0).toLocaleUpperCase("fr") || "D"}</span><div><h2>Session sur cet appareil</h2><p>Profil et session Dowze Academie</p></div></div>
          <div className="local-account-card">
            <div><strong>{account.displayName}</strong><small>@{account.username} · données privées de ce profil</small></div>
            <button className="secondary-button" onClick={onLogout}><LogOut aria-hidden="true" /> Se déconnecter</button>
          </div>
          <p className="local-account-disclaimer"><ShieldCheck aria-hidden="true" /> Votre session locale permet de retrouver votre espace hors ligne. Votre compte serveur et vos données synchronisées restent sur Dowze-01. Les connexions ChatGPT, Claude et Google sont indépendantes.</p>
        </section>

        <section className="settings-section google-web-profile-section" aria-labelledby="google-web-profile-title">
          <div className="settings-title">
            <span><Globe2 aria-hidden="true" /></span>
            <div>
              <h2 id="google-web-profile-title">Compte Google</h2>
              <p>Session du navigateur intégré sur cet appareil</p>
            </div>
          </div>
          <div className="google-web-profile-content">
            <div className="google-web-profile-copy">
              <strong>Connexion partagée entre les services</strong>
              <p>
                Une fois connecté, « Continuer avec Google » peut réutiliser cette session dans les
                services ouverts par Dowze Academie.
              </p>
            </div>
            <div className="google-web-profile-actions">
              <button
                type="button"
                className="secondary-button google-web-profile-button"
                onClick={() => void handleOpenGoogleProfile()}
                disabled={googleProfileBusy}
                aria-describedby="google-web-profile-details"
              >
                {openingGoogleProfile ? <LoaderCircle aria-hidden="true" className="is-spinning" /> : <ExternalLink aria-hidden="true" />}
                {openingGoogleProfile ? "Ouverture…" : "Se connecter / gérer Google"}
              </button>
              <button
                type="button"
                className="secondary-button danger-button google-web-profile-button"
                onClick={() => setGoogleRemovalOpen(true)}
                disabled={googleProfileBusy || !googleRemovalSupported}
                aria-describedby="google-web-profile-removal-hint"
              >
                <Trash2 aria-hidden="true" /> Retirer Google de Dowze Academie…
              </button>
            </div>
          </div>
          <div id="google-web-profile-details" className="google-web-profile-details">
            <p><ShieldCheck aria-hidden="true" /> Dowze Academie ne lit ni votre adresse e-mail, ni votre mot de passe, ni vos cookies.</p>
            <p><Info aria-hidden="true" /> Chaque service garde sa propre connexion et peut demander de confirmer le compte Google choisi.</p>
            <p id="google-web-profile-removal-hint"><Trash2 aria-hidden="true" /> {googleRemovalSupported
              ? "Retirer efface uniquement les données Google conservées dans Dowze Academie, jamais le compte Google en ligne."
              : "La suppression ciblée des données Google intégrées est actuellement disponible sur macOS uniquement."}</p>
          </div>
          {googleProfileFeedback && (
            <p
              className={`settings-inline-status settings-inline-status--${googleProfileFeedback.tone}`}
              role={googleProfileFeedback.tone === "error" ? "alert" : "status"}
            >
              {googleProfileFeedback.text}
            </p>
          )}
        </section>

        <section id="settings-services" className="settings-section">
          <div className="settings-title"><span><Monitor aria-hidden="true" /></span><div><h2>Services d’étude</h2><p>Assistants, langues, cours, vidéos et carnet de sources</p></div></div>
          <div className="setting-row">
            <div><strong>Service préféré</strong><small>Ouvert par défaut dans le panneau latéral.</small></div>
            <div className={`settings-provider-select settings-provider-select--${provider}`}>
              <span className={`provider-glyph provider-glyph--${provider}`} aria-hidden="true">
                <SettingsProviderIcon provider={provider} />
              </span>
              <select
                value={provider}
                onChange={(event) => onProviderChange(event.target.value as AiProvider)}
                aria-label="Service préféré"
              >
                {PROVIDERS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
              <ChevronDown aria-hidden="true" />
            </div>
          </div>
          <div className="setting-row setting-row--slider">
            <div><strong>Largeur du panneau</strong><small>{aiWidth} pixels</small></div>
            <input
              type="range"
              min="360"
              max={maxAiWidth}
              step="10"
              value={aiWidth}
              onChange={(event) => onAiWidthChange(Number(event.target.value))}
              aria-label="Largeur du panneau IA"
              aria-valuetext={`${aiWidth} pixels`}
            />
          </div>
          <div className="setting-row">
            <div><strong>Prévisualiser le panneau</strong><small>Page officielle ou Chat libre intégré selon le service.</small></div>
            <button className="secondary-button" onClick={onOpenAi}><PanelRight aria-hidden="true" /> Afficher</button>
          </div>
        </section>

        <section id="settings-data" className="settings-section">
          <div className="settings-title"><span><Database aria-hidden="true" /></span><div><h2>Données et sauvegarde</h2><p>Formation active · {formation.manifest.name}</p></div></div>
          <div className="data-summary">
            <span><strong>{subjects.length}</strong> matières</span>
            <span><strong>{events.length}</strong> événements</span>
            <span><strong>{conversations.length + freeChatConversations.length}</strong> conversations</span>
            <span><strong>{subjectNotesStore.documents.length}</strong> notes Markdown</span>
            <span><strong>{assessments.length}</strong> évaluations</span>
          </div>
          <div className="setting-row">
            <div><strong>Exporter cette formation</strong><small>Exporte les programmes et vos données personnelles de l’année active uniquement. Ce fichier privé n’est pas un paquet de formation importable. Les PDF ne sont pas inclus dans cet export JSON.</small></div>
            <button className="secondary-button" disabled={exporting} onClick={() => void exportData()}>{exporting ? <LoaderCircle aria-hidden="true" className="is-spinning" /> : <Download aria-hidden="true" />} {exporting ? "Export…" : "Exporter"}</button>
          </div>
          {exportStatus && <p className="settings-inline-status" role="status">{exportStatus}</p>}
        </section>

        <section id="settings-privacy" className="settings-section settings-section--wide security-note">
          <div className="settings-title"><span><ShieldCheck aria-hidden="true" /></span><div><h2>Confidentialité</h2><p>Conçu pour ne garder que le nécessaire</p></div></div>
          <div className="security-columns">
            <p><Monitor aria-hidden="true" /> Pour les services web, Dowze Academie affiche la page officielle sans lire vos messages, recherches ou carnets.</p>
            <p><ShieldCheck aria-hidden="true" /> Le Chat libre conserve un cache sur cet appareil et synchronise ses conversations sur votre compte Dowze-01. Les demandes à l’assistant sont envoyées au fournisseur ou à Ollama que vous choisissez.</p>
            <p><ShieldCheck aria-hidden="true" /> Les clés du Chat libre restent dans le coffre sécurisé du système. Elles et les sessions web sont des réglages de cet appareil, partagés entre ses profils Dowze Academie.</p>
            <p><Info aria-hidden="true" /> Les notes, liens, appréciations et PDF sont conservés sur Dowze-01 lorsqu’ils sont synchronisés. Une copie locale permet de travailler hors ligne. Consultez l’état de synchronisation avant de changer d’appareil.</p>
          </div>
          <a href="https://tauri.app/security/" target="_blank" rel="noreferrer">En savoir plus sur la sécurité Tauri <ExternalLink aria-hidden="true" /></a>
        </section>
      </div>
      </div>
      {googleRemovalOpen && (
        <Modal
          title="Retirer Google de Dowze Academie ?"
          subtitle="Suppression locale sur cet appareil"
          onClose={removingGoogleProfile ? () => undefined : () => setGoogleRemovalOpen(false)}
          size="sm"
        >
          <div className="confirm-content google-web-profile-confirmation">
            <span><AlertTriangle aria-hidden="true" /></span>
            <p>
              Cette action supprime de l’application les cookies, caches et données locales Google
              pour tous les profils Dowze Academie de cet appareil. Google, Gemini, NotebookLM et YouTube seront
              déconnectés. Votre compte Google en ligne ne sera pas supprimé. Les sessions propres
              de ChatGPT, Claude, Duolingo et Khan Academy resteront enregistrées.
            </p>
          </div>
          <div className="modal-actions confirm-actions">
            <span />
            <button
              type="button"
              className="secondary-button"
              onClick={() => setGoogleRemovalOpen(false)}
              disabled={removingGoogleProfile}
            >
              Annuler
            </button>
            <button
              type="button"
              className="delete-button solid"
              onClick={() => void handleRemoveGoogleProfile()}
              disabled={removingGoogleProfile}
            >
              {removingGoogleProfile ? <LoaderCircle aria-hidden="true" className="is-spinning" /> : <Trash2 aria-hidden="true" />}
              {removingGoogleProfile ? "Suppression…" : "Retirer de l’application"}
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
