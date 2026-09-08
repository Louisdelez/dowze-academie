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
import { useState } from "react";
import type { AiProvider, AssessmentRecord, CalendarEvent, Conversation, Subject, SubjectNotesStore, TaskItem } from "../types";
import type { StoredFreeChatConversation } from "../lib/freeChat";
import type { LocalAccount } from "../lib/localAuth";
import { openGoogleWebProfile, removeGoogleWebProfile, saveTextDocument } from "../lib/tauri";
import { Modal } from "./Modal";

const PROVIDERS: Array<{ value: AiProvider; label: string }> = [
  { value: "chatgpt", label: "ChatGPT" },
  { value: "claude", label: "Claude" },
  { value: "gemini", label: "Gemini" },
  { value: "mistral", label: "Mistral" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "kimi", label: "Kimi" },
  { value: "freechat", label: "Chat libre" },
  { value: "duolingo", label: "Duolingo" },
  { value: "youtube", label: "YouTube" },
  { value: "tiktok", label: "TikTok" },
  { value: "notebooklm", label: "NotebookLM" }
];

function SettingsProviderIcon({ provider }: { provider: AiProvider }) {
  switch (provider) {
    case "chatgpt":
      return <Sparkles />;
    case "claude":
      return <span>C</span>;
    case "gemini":
      return <Gem />;
    case "mistral":
      return <Wind />;
    case "deepseek":
      return <BrainCircuit />;
    case "kimi":
      return <MoonStar />;
    case "freechat":
      return <MessagesSquare />;
    case "duolingo":
      return <Languages />;
    case "youtube":
      return <Play />;
    case "tiktok":
      return <Music2 />;
    case "notebooklm":
      return <BookOpenText />;
  }
}

interface SettingsPageProps {
  account: LocalAccount;
  profileStoragePrefix: string;
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
  account,
  profileStoragePrefix,
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
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [openingGoogleProfile, setOpeningGoogleProfile] = useState(false);
  const [googleRemovalOpen, setGoogleRemovalOpen] = useState(false);
  const [removingGoogleProfile, setRemovingGoogleProfile] = useState(false);
  const [googleProfileFeedback, setGoogleProfileFeedback] = useState<{
    tone: "info" | "success" | "error";
    text: string;
  } | null>(null);

  const googleProfileBusy = openingGoogleProfile || removingGoogleProfile;

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
    if (googleProfileBusy) return;
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
    const recoveryCopies: Record<string, string> = {};
    try {
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (!key?.startsWith(profileStoragePrefix) || !key.endsWith(".recovery")) continue;
        const value = window.localStorage.getItem(key);
        if (value !== null) recoveryCopies[key] = value;
      }
    } catch {
      // L'export principal reste utilisable si WebKit refuse l'énumération du stockage.
    }
    const payload = JSON.stringify({
      version: 5,
      exportedAt: new Date().toISOString(),
      account: {
        id: account.id,
        displayName: account.displayName,
        username: account.username
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
        `dowze-academie-export-donnees-${new Date().toISOString().slice(0, 10)}.json`,
        "json"
      );
      setExportStatus(destination ? "Export enregistré." : null);
    } catch (error) {
      setExportStatus(`Échec de l’export : ${String(error)}`);
    }
  };

  return (
    <main className={`page settings-page ${googleRemovalOpen ? "settings-page--google-removal-open" : ""}`}>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Préférences</p>
          <h1>Réglages</h1>
          <p className="heading-subtitle">Personnalisez votre espace d’étude.</p>
        </div>
      </header>

      <div className="settings-grid">
        <section className="settings-section settings-account-section">
          <div className="settings-title"><span className="settings-account-avatar">{account.displayName.trim().charAt(0).toLocaleUpperCase("fr") || "D"}</span><div><h2>Compte local</h2><p>Profil et session Dowze Academie</p></div></div>
          <div className="local-account-card">
            <div><strong>{account.displayName}</strong><small>@{account.username} · données privées de ce profil</small></div>
            <button className="secondary-button" onClick={onLogout}><LogOut /> Se déconnecter</button>
          </div>
          <p className="local-account-disclaimer"><ShieldCheck /> Ce compte reste sur ce Mac. Les sessions des sites ChatGPT, Claude ou Google appartiennent à leur WebView et ne sont pas des comptes Dowze Academie.</p>
        </section>

        <section className="settings-section google-web-profile-section" aria-labelledby="google-web-profile-title">
          <div className="settings-title">
            <span><Globe2 /></span>
            <div>
              <h2 id="google-web-profile-title">Compte Google</h2>
              <p>Session du navigateur intégré sur ce Mac</p>
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
                {openingGoogleProfile ? <LoaderCircle className="is-spinning" /> : <ExternalLink />}
                {openingGoogleProfile ? "Ouverture…" : "Se connecter / gérer Google"}
              </button>
              <button
                type="button"
                className="secondary-button danger-button google-web-profile-button"
                onClick={() => setGoogleRemovalOpen(true)}
                disabled={googleProfileBusy}
                aria-describedby="google-web-profile-removal-hint"
              >
                <Trash2 /> Retirer Google de Dowze Academie…
              </button>
            </div>
          </div>
          <div id="google-web-profile-details" className="google-web-profile-details">
            <p><ShieldCheck /> Dowze Academie ne lit ni votre adresse e-mail, ni votre mot de passe, ni vos cookies.</p>
            <p><Info /> Chaque service garde sa propre connexion et peut demander de confirmer le compte Google choisi.</p>
            <p id="google-web-profile-removal-hint"><Trash2 /> Retirer efface uniquement les données Google conservées dans Dowze Academie, jamais le compte Google en ligne.</p>
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

        <section className="settings-section">
          <div className="settings-title"><span><Monitor /></span><div><h2>Services d’étude</h2><p>Assistants, langues, vidéos et carnet de sources</p></div></div>
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
            <button className="secondary-button" onClick={onOpenAi}><PanelRight /> Afficher</button>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-title"><span><Database /></span><div><h2>Données locales</h2><p>Vos programmes et liens de conversation</p></div></div>
          <div className="data-summary">
            <span><strong>{subjects.length}</strong> matières</span>
            <span><strong>{events.length}</strong> événements</span>
            <span><strong>{conversations.length + freeChatConversations.length}</strong> conversations</span>
            <span><strong>{subjectNotesStore.documents.length}</strong> notes Markdown</span>
            <span><strong>{assessments.length}</strong> évaluations</span>
          </div>
          <div className="setting-row">
            <div><strong>Exporter les données JSON</strong><small>Exporte les programmes, liens, notes et métadonnées. Les fichiers PDF archivés restent sur ce Mac.</small></div>
            <button className="secondary-button" onClick={() => void exportData()}><Download /> Exporter</button>
          </div>
          {exportStatus && <p className="settings-inline-status" role="status">{exportStatus}</p>}
        </section>

        <section className="settings-section settings-section--wide security-note">
          <div className="settings-title"><span><ShieldCheck /></span><div><h2>Confidentialité</h2><p>Conçu pour ne garder que le nécessaire</p></div></div>
          <div className="security-columns">
            <p><Monitor /> Pour les services web, Dowze Academie affiche la page officielle sans lire vos messages, recherches ou carnets.</p>
            <p><ShieldCheck /> Le Chat libre conserve ses conversations localement et les envoie uniquement à l’API ou au modèle Ollama que vous choisissez.</p>
            <p><ShieldCheck /> Les clés du Chat libre restent dans le trousseau macOS. Elles et les sessions web sont des réglages de cet appareil, partagés entre ses profils Dowze Academie.</p>
            <p><Info /> Les liens, notes, appréciations et copies PDF que vous choisissez sont classés uniquement dans les données locales de Dowze Academie.</p>
          </div>
          <a href="https://tauri.app/security/" target="_blank" rel="noreferrer">En savoir plus sur la sécurité Tauri <ExternalLink /></a>
        </section>
      </div>
      {googleRemovalOpen && (
        <Modal
          title="Retirer Google de Dowze Academie ?"
          subtitle="Suppression locale sur ce Mac"
          onClose={removingGoogleProfile ? () => undefined : () => setGoogleRemovalOpen(false)}
          size="sm"
        >
          <div className="confirm-content google-web-profile-confirmation">
            <span><AlertTriangle /></span>
            <p>
              Cette action supprime de l’application les cookies, caches et données locales Google
              pour tous les profils Dowze Academie de ce Mac. Google, Gemini, NotebookLM et YouTube seront
              déconnectés. Votre compte Google en ligne ne sera pas supprimé. Les sessions propres
              de ChatGPT, Claude et Duolingo resteront enregistrées.
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
              {removingGoogleProfile ? <LoaderCircle className="is-spinning" /> : <Trash2 />}
              {removingGoogleProfile ? "Suppression…" : "Retirer de l’application"}
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
