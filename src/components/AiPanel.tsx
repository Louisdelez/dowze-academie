import "./studio-tools.css";
import {
  BookOpenText,
  Bot,
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  ExternalLink,
  Gem,
  GraduationCap,
  Link2,
  Languages,
  LoaderCircle,
  MessagesSquare,
  MessageSquarePlus,
  Mic,
  MicOff,
  MoonStar,
  Music2,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Wind
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { maxAiPanelWidth, clampAiPanelWidth } from "../lib/layout";
import {
  isLanguagePracticeProvider,
  isStandaloneLearningProvider,
  isVideoProvider
} from "../lib/learningProviders";
import { languagePracticeName } from "../lib/languageCurriculum.ts";
import {
  configureAiCapture,
  currentAiUrl,
  getNativeCapabilities,
  isTauri,
  openInBrowser,
  providerHome,
  providerLabel,
  reloadAi,
  requestMicrophoneAccess,
  syncAiPanel
} from "../lib/tauri";
import type { StoredFreeChatConversation } from "../lib/freeChat";
import type { ActiveLesson, AiProvider, Subject } from "../types";
import { FreeChatPanel } from "./FreeChatPanel";

const AI_PROVIDERS: AiProvider[] = [
  "chatgpt",
  "claude",
  "gemini",
  "mistral",
  "kimi",
  "freechat",
  "duolingo",
  "khanacademy",
  "youtube",
  "tiktok",
  "notebooklm"
];

const PROVIDER_DESCRIPTIONS: Readonly<Record<AiProvider, string>> = {
  chatgpt: "Assistant IA",
  claude: "Assistant IA",
  gemini: "Assistant IA",
  mistral: "Assistant IA",
  deepseek: "Assistant IA",
  kimi: "Assistant IA",
  freechat: "API personnelle ou IA locale",
  duolingo: "Pratique linguistique",
  khanacademy: "Cours et exercices",
  youtube: "Vidéos pédagogiques",
  tiktok: "Vidéos courtes pédagogiques",
  notebooklm: "Carnet de sources"
};

function ProviderIcon({ provider }: { provider: AiProvider }) {
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
    case "khanacademy":
      return <GraduationCap />;
    case "youtube":
      return <Play />;
    case "tiktok":
      return <Music2 />;
    case "notebooklm":
      return <BookOpenText />;
  }
}

function lessonModeLabel(activeLesson: ActiveLesson) {
  return activeLesson.lessonMode === "assessment-correction"
    ? "Correction de copie"
    : activeLesson.lessonMode === "paper-assessment"
      ? "Évaluation PDF"
      : activeLesson.lessonMode === "chapter-test"
        ? "Mini-test PDF"
        : activeLesson.lessonMode === "exercises"
          ? "Exercices"
          : "Cours";
}

interface AiPanelProps {
  captureAccountId: string;
  captureFormationId: string;
  visible: boolean;
  suspended?: boolean;
  resettingProfile?: boolean;
  width: number;
  provider: AiProvider;
  activeSubject?: Subject;
  activeLesson?: ActiveLesson | null;
  pendingCapture: boolean;
  freeChatConversations: StoredFreeChatConversation[];
  setFreeChatConversations: Dispatch<SetStateAction<StoredFreeChatConversation[]>>;
  freeChatActiveId: string | null;
  setFreeChatActiveId: Dispatch<SetStateAction<string | null>>;
  freeChatStorageKeys: {
    config: string;
    backend: string;
  };
  onWidthChange: (width: number) => void;
  onProviderChange: (provider: AiProvider) => boolean | void;
  onClose: () => void;
  onOpen: () => void;
  onNewConversation: () => void;
  onAssociateCurrent: (url?: string | null) => void;
  onCopyLessonPrompt: () => void;
}

export function AiPanel({
  captureAccountId,
  captureFormationId,
  visible,
  suspended = false,
  resettingProfile = false,
  width,
  provider,
  activeSubject,
  activeLesson,
  pendingCapture,
  freeChatConversations,
  setFreeChatConversations,
  freeChatActiveId,
  setFreeChatActiveId,
  freeChatStorageKeys,
  onWidthChange,
  onProviderChange,
  onClose,
  onOpen,
  onNewConversation,
  onAssociateCurrent,
  onCopyLessonPrompt
}: AiPanelProps) {
  const captureSetupRef = useRef<Promise<boolean>>(Promise.resolve(false));
  useEffect(() => {
    captureSetupRef.current = configureAiCapture({ accountId: captureAccountId, formationId: captureFormationId, provider, paused: true })
      .then(() => true).catch(() => false);
  }, [captureAccountId, captureFormationId, provider]);
  const providerIsFreeChat = provider === "freechat";
  const providerIsLanguagePractice = isLanguagePracticeProvider(provider);
  const providerIsStandaloneLearning = isStandaloneLearningProvider(provider);
  const providerIsVideo = isVideoProvider(provider);
  const slotRef = useRef<HTMLDivElement>(null);
  const providerPickerRef = useRef<HTMLDivElement>(null);
  const providerTriggerRef = useRef<HTMLButtonElement>(null);
  const providerOptionRefs = useRef<Partial<Record<AiProvider, HTMLButtonElement | null>>>({});
  const providerRef = useRef(provider);
  const desiredNativeVisibilityRef = useRef(visible && !suspended && !providerIsFreeChat);
  const nativeSyncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const dragWidthRef = useRef<number | null>(null);
  const [nativeError, setNativeError] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const [isProviderMenuOpening, setIsProviderMenuOpening] = useState(false);
  const [isProviderMenuOpen, setIsProviderMenuOpen] = useState(false);
  const [microphoneControlAvailable, setMicrophoneControlAvailable] = useState(false);
  const [isRequestingMicrophone, setIsRequestingMicrophone] = useState(false);
  const [microphoneNotice, setMicrophoneNotice] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  providerRef.current = provider;
  desiredNativeVisibilityRef.current =
    visible && !suspended && !providerIsFreeChat && !isProviderMenuOpening && !isProviderMenuOpen;

  useEffect(() => {
    let active = true;
    void getNativeCapabilities()
      .then((capabilities) => {
        if (active) setMicrophoneControlAvailable(capabilities.microphoneAccessRequest);
      })
      .catch(() => {
        if (active) setMicrophoneControlAvailable(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const syncBounds = useCallback(async (): Promise<boolean> => {
    const request = nativeSyncQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const slot = slotRef.current;
        if (!slot) return;
        if (!await captureSetupRef.current) {
          throw new Error("Le scope natif de capture n’est pas configuré.");
        }
        const rect = slot.getBoundingClientRect();
        await syncAiPanel(
          desiredNativeVisibilityRef.current,
          providerRef.current,
          {
            x: rect.x,
            y: rect.y,
            width: Math.max(1, rect.width),
            height: Math.max(1, rect.height)
          }
        );
      });
    nativeSyncQueueRef.current = request.catch(() => undefined);

    try {
      await request;
      setNativeError(null);
      return true;
    } catch (error) {
      setNativeError(error instanceof Error ? error.message : String(error));
      return false;
    }
  }, []);

  useEffect(() => {
    let frame = requestAnimationFrame(() => void syncBounds());
    const delayed = window.setTimeout(() => void syncBounds(), 240);
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => void syncBounds());
    });
    if (slotRef.current) observer.observe(slotRef.current);
    window.addEventListener("resize", syncBounds);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(delayed);
      observer.disconnect();
      window.removeEventListener("resize", syncBounds);
    };
  }, [isProviderMenuOpen, isProviderMenuOpening, provider, suspended, syncBounds, visible, width]);

  useEffect(() => () => {
    desiredNativeVisibilityRef.current = false;
    void syncAiPanel(false, providerRef.current, { x: 0, y: 0, width: 1, height: 1 });
  }, []);

  const closeProviderMenu = useCallback((restoreTriggerFocus = false) => {
    if (!isProviderMenuOpen && !isProviderMenuOpening) return;
    setIsProviderMenuOpen(false);
    setIsProviderMenuOpening(false);
    desiredNativeVisibilityRef.current = visible && !suspended && !providerIsFreeChat;
    window.requestAnimationFrame(() => {
      void syncBounds();
      if (restoreTriggerFocus) providerTriggerRef.current?.focus();
    });
  }, [isProviderMenuOpen, isProviderMenuOpening, providerIsFreeChat, suspended, syncBounds, visible]);

  const openProviderMenu = useCallback(async () => {
    if (isProviderMenuOpen || isProviderMenuOpening || !visible || suspended) return;
    desiredNativeVisibilityRef.current = false;
    setIsProviderMenuOpening(true);
    const nativePanelHidden = await syncBounds();
    if (!nativePanelHidden) {
      setIsProviderMenuOpening(false);
      desiredNativeVisibilityRef.current = visible && !suspended && !providerIsFreeChat;
      void syncBounds();
      return;
    }
    setIsProviderMenuOpen(true);
    setIsProviderMenuOpening(false);
  }, [isProviderMenuOpen, isProviderMenuOpening, providerIsFreeChat, suspended, syncBounds, visible]);

  useEffect(() => {
    if (!isProviderMenuOpen) return;
    const frame = window.requestAnimationFrame(() => {
      providerOptionRefs.current[provider]?.focus();
    });
    const onPointerDown = (event: PointerEvent) => {
      if (!providerPickerRef.current?.contains(event.target as Node)) {
        closeProviderMenu(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [closeProviderMenu, isProviderMenuOpen, provider]);

  useEffect(() => {
    if ((visible && !suspended) || (!isProviderMenuOpen && !isProviderMenuOpening)) return;
    setIsProviderMenuOpen(false);
    setIsProviderMenuOpening(false);
  }, [isProviderMenuOpen, isProviderMenuOpening, suspended, visible]);

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (event: PointerEvent) => {
      const nextWidth = clampAiPanelWidth(window.innerWidth - event.clientX, window.innerWidth);
      dragWidthRef.current = nextWidth;
      setDragWidth(nextWidth);
    };
    const onUp = () => {
      const committedWidth = dragWidthRef.current;
      setIsResizing(false);
      setDragWidth(null);
      dragWidthRef.current = null;
      if (committedWidth !== null) onWidthChange(committedWidth);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    document.body.classList.add("is-resizing-ai");
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.classList.remove("is-resizing-ai");
    };
  }, [isResizing, onWidthChange]);

  const handleProviderChange = (next: AiProvider) => {
    if (next === provider) return true;
    return onProviderChange(next) !== false;
  };

  const selectProvider = (next: AiProvider) => {
    setIsProviderMenuOpen(false);
    setIsProviderMenuOpening(false);
    providerRef.current = next;
    desiredNativeVisibilityRef.current = visible && !suspended && next !== "freechat";
    const accepted = handleProviderChange(next);
    if (!accepted) {
      providerRef.current = provider;
      desiredNativeVisibilityRef.current = visible && !suspended && !providerIsFreeChat;
    }
    window.requestAnimationFrame(() => void syncBounds());
  };

  const handleProviderMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const options = AI_PROVIDERS
      .map((item) => providerOptionRefs.current[item])
      .filter((option): option is HTMLButtonElement => Boolean(option));
    const focusedIndex = options.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex: number | null = null;

    if (event.key === "ArrowDown") {
      nextIndex = focusedIndex < 0 ? 0 : (focusedIndex + 1) % options.length;
    } else if (event.key === "ArrowUp") {
      nextIndex = focusedIndex < 0 ? options.length - 1 : (focusedIndex - 1 + options.length) % options.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = options.length - 1;
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeProviderMenu(true);
      return;
    } else if (event.key === "Tab") {
      closeProviderMenu(false);
      return;
    }

    if (nextIndex !== null) {
      event.preventDefault();
      options[nextIndex]?.focus();
    }
  };

  const handleOpenBrowser = async () => {
    if (providerIsFreeChat) return;
    try {
      const url = providerIsLanguagePractice
        ? providerHome(provider)
        : (await currentAiUrl().catch(() => null)) || providerHome(provider);
      await openInBrowser(url);
      setNativeError(null);
    } catch (error) {
      setNativeError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleReload = async () => {
    try {
      await reloadAi();
      setNativeError(null);
    } catch (error) {
      setNativeError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleRequestMicrophone = async () => {
    if (isRequestingMicrophone) return;
    setIsRequestingMicrophone(true);
    setMicrophoneNotice(null);
    try {
      const status = await requestMicrophoneAccess();
      if (status === "authorized") {
        await reloadAi();
        setNativeError(null);
        setMicrophoneNotice({
          kind: "success",
          message: "Microphone autorisé · page rechargée"
        });
      } else if (status === "denied") {
        setMicrophoneNotice({
          kind: "error",
          message: "Accès refusé · activez Dowze Academie dans Réglages Système → Confidentialité et sécurité → Microphone"
        });
      } else if (status === "restricted") {
        setMicrophoneNotice({
          kind: "error",
          message: "L’accès au microphone est bloqué par les restrictions de ce Mac"
        });
      } else {
        setMicrophoneNotice({
          kind: "error",
          message: "L’activation native du microphone n’est pas disponible sur ce système"
        });
      }
    } catch (error) {
      setMicrophoneNotice({
        kind: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setIsRequestingMicrophone(false);
    }
  };

  const handleAssociate = async () => {
    const url = await currentAiUrl().catch(() => null);
    onAssociateCurrent(url);
  };

  const freeChatContext = activeLesson ? {
    key: [
      activeLesson.subjectId,
      ...(activeLesson.curriculumScope ? [activeLesson.curriculumScope] : []),
      activeLesson.moduleId ?? "general",
      activeLesson.itemId ?? "general",
      activeLesson.lessonUnitId ?? "general",
      activeLesson.lessonMode
    ].join(":"),
    requestId: activeLesson.id,
    prompt: activeLesson.prompt,
    title: `${lessonModeLabel(activeLesson)} · ${activeLesson.title}`,
    subjectId: activeLesson.subjectId,
    curriculumScope: activeLesson.curriculumScope,
    moduleId: activeLesson.moduleId,
    itemId: activeLesson.itemId,
    lessonUnitId: activeLesson.lessonUnitId,
    lessonMode: activeLesson.lessonMode
  } : undefined;

  return (
    <>
      <aside
        id="study-assistant"
        className={`ai-pane studio-tools ${visible ? "is-visible" : ""}`}
        style={{ width: visible ? (dragWidth ?? width) : 0 }}
        aria-label="Assistant d’étude"
        aria-hidden={!visible}
        inert={!visible ? true : undefined}
      >
        {visible && (
          <button
            className="ai-resize-handle"
            role="separator"
            aria-orientation="vertical"
            aria-valuemin={360}
            aria-valuemax={maxAiPanelWidth(window.innerWidth)}
            aria-valuenow={dragWidth ?? width}
            aria-valuetext={`${Math.round(dragWidth ?? width)} pixels`}
            aria-controls="study-assistant"
            onPointerDown={(event) => {
              event.preventDefault();
              dragWidthRef.current = width;
              setDragWidth(width);
              setIsResizing(true);
            }}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === "Home" ? 0 : event.key === "End" ? window.innerWidth : width + (event.key === "ArrowLeft" ? 32 : -32);
              onWidthChange(clampAiPanelWidth(next, window.innerWidth));
            }}
            aria-label="Redimensionner le panneau latéral"
            aria-description="Flèche gauche pour agrandir, flèche droite pour réduire"
          >
            <span />
          </button>
        )}
        <header className="ai-toolbar">
          <div className="ai-provider-picker" ref={providerPickerRef}>
            <button
              ref={providerTriggerRef}
              type="button"
              className={`ai-provider-trigger ${isProviderMenuOpen ? "is-open" : ""}`}
              aria-label={`Service actuel : ${providerLabel(provider)}. Changer de service`}
              aria-haspopup="listbox"
              aria-expanded={isProviderMenuOpen}
              aria-controls="ai-provider-menu"
              aria-busy={isProviderMenuOpening}
              onClick={() => {
                if (isProviderMenuOpen) closeProviderMenu(false);
                else void openProviderMenu();
              }}
              onKeyDown={(event) => {
                if (!isProviderMenuOpen && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
                  event.preventDefault();
                  void openProviderMenu();
                }
              }}
            >
              <span className={`provider-glyph provider-glyph--${provider}`} aria-hidden="true">
                <ProviderIcon provider={provider} />
              </span>
              <span className="ai-provider-trigger-copy">
                <strong>{providerLabel(provider)}</strong>
                <small>{PROVIDER_DESCRIPTIONS[provider]}</small>
              </span>
              <ChevronDown className="ai-provider-chevron" aria-hidden="true" />
            </button>

            {isProviderMenuOpen && (
              <div
                id="ai-provider-menu"
                className="ai-provider-menu"
                role="listbox"
                aria-label="Choisir un service d’étude"
                onKeyDown={handleProviderMenuKeyDown}
              >
                <p>Services d’étude</p>
                {AI_PROVIDERS.map((item) => (
                  <button
                    key={item}
                    ref={(element) => {
                      providerOptionRefs.current[item] = element;
                    }}
                    type="button"
                    role="option"
                    aria-label={providerLabel(item)}
                    aria-selected={item === provider}
                    className={`ai-provider-option ${item === provider ? "is-selected" : ""} ${item === "duolingo" ? "starts-resources" : ""}`}
                    onClick={() => selectProvider(item)}
                  >
                    <span className={`provider-glyph provider-glyph--${item}`} aria-hidden="true">
                      <ProviderIcon provider={item} />
                    </span>
                    <span>
                      <strong>{providerLabel(item)}</strong>
                      <small>{PROVIDER_DESCRIPTIONS[item]}</small>
                    </span>
                    {item === provider ? <Check aria-hidden="true" /> : <span aria-hidden="true" />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="ai-toolbar-actions">
            {!providerIsFreeChat && (
              <>
                <button
                  onClick={onNewConversation}
                  aria-label={providerIsStandaloneLearning ? `Accueil ${providerLabel(provider)}` : providerIsVideo ? "Nouvelle recherche" : provider === "notebooklm" ? "Nouveau notebook" : "Nouvelle conversation"}
                  data-tooltip={providerIsStandaloneLearning ? `Retour à l’accueil ${providerLabel(provider)}` : providerIsVideo ? "Nouvelle recherche" : provider === "notebooklm" ? "Nouveau notebook" : "Nouvelle conversation"}
                >
                  {providerIsLanguagePractice ? <Languages /> : provider === "khanacademy" ? <GraduationCap /> : <MessageSquarePlus />}
                </button>
                {!providerIsStandaloneLearning && (
                  <button onClick={() => void handleAssociate()} aria-label="Associer la conversation" data-tooltip="Enregistrer le lien">
                    <Link2 />
                  </button>
                )}
                <button onClick={() => void handleReload()} aria-label="Recharger" data-tooltip="Recharger">
                  <RefreshCw />
                </button>
                {microphoneControlAvailable && (
                  <button
                    type="button"
                    className={microphoneNotice?.kind === "success" ? "is-microphone-authorized" : ""}
                    onClick={() => void handleRequestMicrophone()}
                    aria-label="Autoriser la dictée et les appels vocaux"
                    aria-busy={isRequestingMicrophone}
                    disabled={isRequestingMicrophone}
                    data-tooltip={microphoneNotice?.kind === "success" ? "Microphone autorisé" : "Autoriser la dictée et les appels"}
                  >
                    {isRequestingMicrophone ? <LoaderCircle className="is-spinning" /> : <Mic />}
                  </button>
                )}
                <button onClick={() => void handleOpenBrowser()} aria-label={providerIsStandaloneLearning ? `Ouvrir ${providerLabel(provider)} dans le navigateur` : "Ouvrir dans le navigateur"} data-tooltip={providerIsStandaloneLearning ? `Ouvrir ${providerLabel(provider)} dans le navigateur` : "Ouvrir dans le navigateur"}>
                  <ExternalLink />
                </button>
              </>
            )}
          </div>
        </header>

        {microphoneNotice && !providerIsFreeChat && (
          <div
            className={`ai-microphone-notice is-${microphoneNotice.kind}`}
            role="status"
            aria-live="polite"
          >
            {microphoneNotice.kind === "success" ? <Mic aria-hidden="true" /> : <MicOff aria-hidden="true" />}
            <span>{microphoneNotice.message}</span>
            <button
              type="button"
              onClick={() => setMicrophoneNotice(null)}
              aria-label="Fermer le message du microphone"
            >
              ×
            </button>
          </div>
        )}

        {isProviderMenuOpen && (
          <button
            type="button"
            className="ai-provider-menu-scrim"
            aria-label="Fermer le menu des services"
            onClick={() => closeProviderMenu(false)}
          />
        )}

        <div className="ai-context-bar">
          <span className={pendingCapture ? "is-capturing" : ""}>
            <i />
            {providerIsLanguagePractice
              ? `Pratique linguistique · ${languagePracticeName(activeSubject)}`
              : provider === "khanacademy"
              ? "Cours et exercices · Khan Academy"
              : providerIsFreeChat
              ? activeLesson
                ? `Chat libre · ${lessonModeLabel(activeLesson)} · ${activeLesson.title}`
                : "Chat libre général"
              : activeLesson
              ? `${providerIsVideo
                ? "Recherche vidéo"
                : provider === "notebooklm"
                  ? "Contexte NotebookLM"
                  : "Prof IA"} · ${lessonModeLabel(activeLesson)} · ${activeLesson.title}`
              : activeSubject
              ? pendingCapture
                ? `${providerIsVideo
                  ? "Préparation de la recherche vidéo"
                  : provider === "notebooklm"
                    ? "Préparation du contexte NotebookLM"
                    : "Classement automatique"} dans ${activeSubject.shortName}`
                : `${providerIsVideo
                  ? "Recherche vidéo"
                  : provider === "notebooklm"
                    ? "Contexte NotebookLM"
                    : "Contexte"} : ${activeSubject.shortName}`
              : providerIsVideo
                ? "Recherche vidéo générale"
                : provider === "notebooklm"
                  ? "Contexte NotebookLM général"
                  : "Assistant général"}
          </span>
          {!providerIsFreeChat && !providerIsStandaloneLearning && (activeLesson || ((providerIsVideo || provider === "notebooklm") && activeSubject)) ? (
            <button
              className="lesson-copy-button"
              onClick={onCopyLessonPrompt}
              data-tooltip={providerIsVideo
                ? "Copier la recherche vidéo optimisée"
                : provider === "notebooklm"
                  ? "Copier le contexte optimisé pour NotebookLM"
                  : activeLesson?.lessonMode === "assessment-correction"
                    ? "Copier la consigne de correction"
                    : activeLesson?.lessonMode === "paper-assessment"
                      ? "Copier la consigne de génération PDF"
                      : activeLesson?.lessonMode === "chapter-test"
                        ? "Copier la consigne du mini-test PDF"
                        : activeLesson?.lessonMode === "exercises"
                          ? "Copier la consigne des exercices"
                          : "Copier la consigne du cours"}
            >
              {providerIsVideo ? <Search /> : <ClipboardCopy />}
              {providerIsVideo
                ? "Recherche"
                : provider === "notebooklm"
                  ? "Contexte NotebookLM"
                  : "Consigne"}
            </button>
          ) : providerIsFreeChat ? (
            <span><ShieldCheck /> Conversations locales</span>
          ) : (
            <span><ShieldCheck /> Page officielle</span>
          )}
        </div>

        <div className="ai-webview-slot" ref={slotRef}>
          <FreeChatPanel
            isActive={providerIsFreeChat}
            resettingProfile={resettingProfile}
            storageKeys={freeChatStorageKeys}
            context={freeChatContext}
            conversations={freeChatConversations}
            setConversations={setFreeChatConversations}
            activeId={freeChatActiveId}
            setActiveId={setFreeChatActiveId}
          />
          {!isTauri() && !providerIsFreeChat && (
            <div className="browser-ai-preview">
              <span className={`large-provider-mark large-provider-mark--${provider}`}>
                <ProviderIcon provider={provider} />
              </span>
              <h3>{providerLabel(provider)}</h3>
              <p>
                Ouvrez ce service dans votre navigateur pour poursuivre votre étude. Dans l’application de bureau, sa page s’affiche directement dans ce panneau.
              </p>
              <button className="primary-button" onClick={() => void openInBrowser(providerHome(provider))}>
                <ExternalLink /> Ouvrir {providerLabel(provider)}
              </button>
              <span className="preview-security"><ShieldCheck /> Aucun mot de passe n’est enregistré par Dowze Academie.</span>
            </div>
          )}
          {!providerIsFreeChat && nativeError && (
            <div className="browser-ai-preview error-preview" role="alert">
              <Bot />
              <h3>La page n’a pas pu s’ouvrir</h3>
              <p>{nativeError}</p>
              <button className="secondary-button" onClick={() => void syncBounds()}>Réessayer</button>
            </div>
          )}
        </div>
      </aside>

      <button
        type="button"
        className="panel-edge-tab ai-edge-tab studio-tools"
        style={{ right: visible ? (dragWidth ?? width) : 0 }}
        onClick={visible ? onClose : onOpen}
        aria-label={`${visible ? "Masquer" : "Afficher"} le panneau IA`}
        aria-expanded={visible}
        aria-controls="study-assistant"
        title={`${visible ? "Masquer" : "Afficher"} le panneau IA`}
      >
        <Bot aria-hidden="true" />
        <span>IA</span>
        {visible ? <ChevronRight aria-hidden="true" /> : <ChevronLeft aria-hidden="true" />}
      </button>
    </>
  );
}
