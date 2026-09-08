import {
  Bot,
  Check,
  ChevronDown,
  Cpu,
  KeyRound,
  List,
  LoaderCircle,
  MessageSquare,
  Plus,
  Send,
  Settings2,
  ShieldCheck,
  Trash2,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, FormEvent, KeyboardEvent, SetStateAction } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { usePersistentState } from "../hooks/usePersistentState";
import {
  deleteFreeChatApiKey,
  getFreeChatKeyStatus,
  listOllamaModels,
  saveFreeChatApiKey,
  sendFreeChatMessage,
  type FreeChatApiMessage,
  type FreeChatBackend,
  type FreeChatCourseContext,
  type StoredFreeChatConversation,
  type StoredFreeChatMessage
} from "../lib/freeChat";

type BackendConfig = {
  model: string;
  endpoint?: string;
};

type FreeChatConfig = Record<FreeChatBackend, BackendConfig>;

const BACKENDS: ReadonlyArray<{
  value: FreeChatBackend;
  label: string;
  detail: string;
}> = [
  { value: "openai", label: "OpenAI API", detail: "Responses API" },
  { value: "mistral", label: "Mistral API", detail: "Clé personnelle" },
  { value: "deepseek", label: "DeepSeek API", detail: "Clé personnelle" },
  { value: "kimi", label: "Kimi API", detail: "Moonshot AI" },
  { value: "compatible", label: "API compatible", detail: "Format OpenAI" },
  { value: "ollama", label: "Ollama local", detail: "Sur cet appareil" }
];

const DEFAULT_CONFIG: FreeChatConfig = {
  openai: { model: "gpt-5.4" },
  mistral: { model: "mistral-large-latest" },
  deepseek: { model: "deepseek-v4-flash" },
  kimi: { model: "kimi-k3" },
  compatible: {
    model: "model-name",
    endpoint: "https://example.com/v1/chat/completions"
  },
  ollama: {
    model: "",
    endpoint: "http://127.0.0.1:11434"
  }
};

const FREE_CHAT_BACKENDS = new Set<FreeChatBackend>(
  BACKENDS.map((item) => item.value)
);

function isStoredFreeChatConfig(value: unknown): value is FreeChatConfig {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<Record<FreeChatBackend, unknown>>;
  return Object.entries(candidate).every(([backend, entry]) => {
    if (!FREE_CHAT_BACKENDS.has(backend as FreeChatBackend)) return false;
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return false;
    const config = entry as Partial<BackendConfig>;
    return typeof config.model === "string" &&
      (config.endpoint === undefined || typeof config.endpoint === "string");
  });
}

export function freeChatConversationTitle(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) return "Nouvelle conversation";
  return normalized.length > 54 ? `${normalized.slice(0, 53).trimEnd()}…` : normalized;
}

function backendLabel(backend: FreeChatBackend) {
  return BACKENDS.find((item) => item.value === backend)?.label ?? backend;
}

function newStoredMessage(
  role: StoredFreeChatMessage["role"],
  content: string,
  createdAt = new Date().toISOString(),
  reasoningContent?: string
): StoredFreeChatMessage {
  return { id: crypto.randomUUID(), role, content, createdAt, reasoningContent };
}

interface FreeChatPanelProps {
  isActive: boolean;
  resettingProfile?: boolean;
  storageKeys: {
    config: string;
    backend: string;
  };
  context?: FreeChatCourseContext;
  conversations: StoredFreeChatConversation[];
  setConversations: Dispatch<SetStateAction<StoredFreeChatConversation[]>>;
  activeId: string | null;
  setActiveId: Dispatch<SetStateAction<string | null>>;
}

export function FreeChatPanel({
  isActive,
  resettingProfile = false,
  storageKeys,
  context,
  conversations,
  setConversations,
  activeId,
  setActiveId
}: FreeChatPanelProps) {
  const [config, setConfig] = usePersistentState<FreeChatConfig>(
    storageKeys.config,
    DEFAULT_CONFIG,
    isStoredFreeChatConfig
  );
  const [backend, setBackend] = usePersistentState<FreeChatBackend>(
    storageKeys.backend,
    "ollama",
    (value): value is FreeChatBackend => typeof value === "string" && FREE_CHAT_BACKENDS.has(value as FreeChatBackend)
  );
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [inFlightConversationId, setInFlightConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorConversationId, setErrorConversationId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [keyStatus, setKeyStatus] = useState<Partial<Record<FreeChatBackend, boolean>>>({});
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const handledContextRequestRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const responseEpochRef = useRef(0);

  useEffect(() => {
    if (!resettingProfile) return;
    responseEpochRef.current += 1;
    inFlightRef.current = false;
    setInFlightConversationId(null);
    setIsSending(false);
  }, [resettingProfile]);

  useEffect(() => () => {
    responseEpochRef.current += 1;
  }, []);

  const safeConfig = useMemo<FreeChatConfig>(() => ({
    ...DEFAULT_CONFIG,
    ...config,
    openai: { ...DEFAULT_CONFIG.openai, ...config.openai },
    mistral: { ...DEFAULT_CONFIG.mistral, ...config.mistral },
    deepseek: { ...DEFAULT_CONFIG.deepseek, ...config.deepseek },
    kimi: { ...DEFAULT_CONFIG.kimi, ...config.kimi },
    compatible: { ...DEFAULT_CONFIG.compatible, ...config.compatible },
    ollama: { ...DEFAULT_CONFIG.ollama, ...config.ollama }
  }), [config]);

  useEffect(() => {
    // Migration non destructive : les versions antérieures ne connaissaient
    // pas forcément DeepSeek/Kimi. Conserver leurs réglages et ajouter les
    // fournisseurs manquants avec les valeurs actuelles.
    if (BACKENDS.some(({ value }) => !Object.prototype.hasOwnProperty.call(config, value))) {
      setConfig(safeConfig);
    }
  }, [config, safeConfig, setConfig]);
  const activeConversation = conversations.find((item) => item.id === activeId) ?? null;
  const selectedConfig = activeConversation?.backend === backend
    ? { model: activeConversation.model, endpoint: activeConversation.endpoint }
    : safeConfig[backend];
  const sortedConversations = [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const contextKey = context?.key;
  const contextRequestId = context?.requestId;
  const contextPrompt = context?.prompt;
  const contextTitle = context?.title;

  useEffect(() => {
    if (!showHistory && !showSettings) return;
    const drawer = drawerRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusableSelector = "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])";
    const focusableElements = () => Array.from(
      drawer?.querySelectorAll<HTMLElement>(focusableSelector) ?? []
    ).filter((element) => element.getClientRects().length > 0);
    const frame = window.requestAnimationFrame(() => (focusableElements()[0] ?? drawer)?.focus());
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setShowHistory(false);
        setShowSettings(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = focusableElements();
      if (!focusable.length) {
        event.preventDefault();
        drawer?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === drawer)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [showHistory, showSettings]);

  useEffect(() => {
    if (!isActive) return;
    const endpoint = backend === "compatible" ? selectedConfig.endpoint : undefined;
    let cancelled = false;
    if (backend === "compatible") {
      setKeyStatus((current) => ({ ...current, compatible: false }));
    }
    const timer = window.setTimeout(() => {
      void getFreeChatKeyStatus(endpoint)
        .then((statuses) => {
          if (!cancelled) {
            setKeyStatus(Object.fromEntries(statuses.map((status) => [status.backend, status.configured])));
          }
        })
        .catch(() => undefined);
    }, backend === "compatible" ? 250 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [backend, isActive, selectedConfig.endpoint]);

  useEffect(() => {
    // Une clé collée ne doit jamais suivre silencieusement l'utilisateur vers
    // un autre fournisseur avant son enregistrement dans le coffre sécurisé.
    setApiKey("");
  }, [backend]);

  useEffect(() => {
    const element = messagesRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [activeConversation?.messages.length, isSending]);

  useEffect(() => {
    if (!error) setErrorConversationId(null);
  }, [error]);

  useEffect(() => {
    if (!isActive || (!showHistory && !showSettings)) return;
    const closeDrawer = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setShowHistory(false);
      setShowSettings(false);
      window.requestAnimationFrame(() => inputRef.current?.focus());
    };
    window.addEventListener("keydown", closeDrawer);
    return () => window.removeEventListener("keydown", closeDrawer);
  }, [isActive, showHistory, showSettings]);

  useEffect(() => {
    if (!isActive) return;
    if (inFlightRef.current) return;
    if (!context || !contextKey || !contextRequestId || !contextPrompt) return;
    if (handledContextRequestRef.current === contextRequestId) return;
    handledContextRequestRef.current = contextRequestId;

    const explicitlyOpened = conversations.find((conversation) => conversation.id === activeId);
    if (explicitlyOpened?.contextKey === contextKey) {
      setBackend(explicitlyOpened.backend);
      setShowHistory(false);
      setShowSettings(false);
      setError(null);
      return;
    }

    const previous = conversations
      .filter((conversation) => conversation.contextKey === contextKey && conversation.backend === backend)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    if (previous) {
      setBackend(previous.backend);
      setActiveId(previous.id);
      setShowHistory(false);
      setShowSettings(false);
      setError(null);
      return;
    }

    const now = new Date().toISOString();
    const conversation: StoredFreeChatConversation = {
      id: crypto.randomUUID(),
      title: contextTitle ?? "Cours dans le Chat libre",
      backend,
      model: selectedConfig.model,
      endpoint: selectedConfig.endpoint,
      contextKey,
      contextTitle,
      subjectId: context.subjectId,
      curriculumScope: context.curriculumScope,
      moduleId: context.moduleId,
      itemId: context.itemId,
      lessonUnitId: context.lessonUnitId,
      lessonMode: context.lessonMode,
      messages: [newStoredMessage("system", contextPrompt, now)],
      createdAt: now,
      updatedAt: now
    };
    setConversations((current) => [conversation, ...current]);
    setActiveId(conversation.id);
    setShowHistory(false);
    setShowSettings(false);
    setError(null);
  }, [activeId, backend, context, contextKey, contextPrompt, contextRequestId, contextTitle, conversations, isActive, isSending, selectedConfig.endpoint, selectedConfig.model, setActiveId, setBackend, setConversations]);

  useEffect(() => {
    if (!isActive || !activeConversation) return;
    if (backend !== activeConversation.backend) setBackend(activeConversation.backend);
  }, [activeConversation, backend, isActive, setBackend]);

  const updateBackendConfig = (patch: Partial<BackendConfig>) => {
    if (isSavingKey) return;
    if (
      backend === "compatible" &&
      patch.endpoint !== undefined &&
      patch.endpoint !== selectedConfig.endpoint
    ) {
      setApiKey("");
      setKeyStatus((current) => ({ ...current, compatible: false }));
    }
    if (activeConversation) setActiveId(null);
    setConfig((current) => ({
      ...DEFAULT_CONFIG,
      ...current,
      [backend]: { ...DEFAULT_CONFIG[backend], ...current[backend], ...patch }
    }));
  };

  const startBlankConversation = () => {
    if (inFlightRef.current) {
      setError("Attends la fin de la réponse avant d’ouvrir une autre conversation.");
      return;
    }
    setActiveId(null);
    setDraft("");
    setError(null);
    setShowHistory(false);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const startWithCourseContext = () => {
    if (inFlightRef.current) {
      setError("Attends la fin de la réponse avant de changer de conversation.");
      return;
    }
    if (!contextPrompt || !contextKey || !context) return;
    const previous = conversations
      .filter((conversation) => conversation.contextKey === contextKey && conversation.backend === backend)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    if (previous) {
      openConversation(previous);
      return;
    }
    const now = new Date().toISOString();
    const conversation: StoredFreeChatConversation = {
      id: crypto.randomUUID(),
      title: contextTitle ?? "Cours dans le Chat libre",
      backend,
      model: selectedConfig.model,
      endpoint: selectedConfig.endpoint,
      contextKey,
      contextTitle,
      subjectId: context.subjectId,
      curriculumScope: context.curriculumScope,
      moduleId: context.moduleId,
      itemId: context.itemId,
      lessonUnitId: context.lessonUnitId,
      lessonMode: context.lessonMode,
      messages: [newStoredMessage("system", contextPrompt, now)],
      createdAt: now,
      updatedAt: now
    };
    setConversations((current) => [conversation, ...current]);
    setActiveId(conversation.id);
    setError(null);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const openConversation = (conversation: StoredFreeChatConversation) => {
    if (inFlightRef.current && conversation.id !== activeId) {
      setError("Attends la fin de la réponse avant de changer de conversation.");
      return;
    }
    setBackend(conversation.backend);
    setActiveId(conversation.id);
    setShowHistory(false);
    setError(null);
  };

  const deleteConversation = (conversation: StoredFreeChatConversation) => {
    if (conversation.id === inFlightConversationId) {
      setError("Cette conversation reçoit encore une réponse et ne peut pas être supprimée.");
      return;
    }
    if (!window.confirm(`Supprimer « ${conversation.title} » ?`)) return;
    setConversations((current) => current.filter((item) => item.id !== conversation.id));
    if (activeId === conversation.id) setActiveId(null);
  };

  const selectBackend = (next: FreeChatBackend) => {
    if (next === backend || inFlightRef.current || isSavingKey) return;
    setBackend(next);
    setActiveId(null);
    setError(null);
    setOllamaModels([]);
  };

  const handleSend = async (event?: FormEvent) => {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || inFlightRef.current) return;
    if (!selectedConfig.model.trim()) {
      setError(backend === "ollama"
        ? "Choisis d’abord un modèle Ollama dans les réglages."
        : "Indique le nom du modèle dans les réglages.");
      setShowSettings(true);
      return;
    }
    const existingMessages = activeConversation?.messages ?? [];
    const projectedCharacters = existingMessages.reduce((sum, message) =>
      sum + message.content.length + (message.reasoningContent?.length ?? 0), 0
    ) + content.length;
    if (existingMessages.length >= 199 || projectedCharacters > 1_500_000) {
      setError("Cette conversation approche sa limite technique. Crée une nouvelle conversation pour continuer sans perdre de messages.");
      return;
    }

    const now = new Date().toISOString();
    const userMessage = newStoredMessage("user", content, now);
    const existing = activeConversation;
    const conversationId = existing?.id ?? crypto.randomUUID();
    const requestMessages = [...(existing?.messages ?? []), userMessage]
      .map(({ role, content, reasoningContent }) => ({ role, content, reasoningContent }));
    const nextConversation: StoredFreeChatConversation = existing
      ? {
          ...existing,
          backend,
          model: selectedConfig.model,
          endpoint: selectedConfig.endpoint,
          messages: [...existing.messages, userMessage],
          updatedAt: now
        }
      : {
          id: conversationId,
          title: freeChatConversationTitle(content),
          backend,
          model: selectedConfig.model,
          endpoint: selectedConfig.endpoint,
          messages: [userMessage],
          createdAt: now,
          updatedAt: now
        };

    setConversations((current) => existing
      ? current.map((item) => item.id === conversationId ? nextConversation : item)
      : [nextConversation, ...current]);
    setActiveId(conversationId);
    setDraft("");
    setError(null);
    inFlightRef.current = true;
    setInFlightConversationId(conversationId);
    setIsSending(true);
    const responseEpoch = responseEpochRef.current;

    try {
      const reply = await sendFreeChatMessage({
        backend,
        model: selectedConfig.model,
        messages: requestMessages,
        endpoint: selectedConfig.endpoint
      });
      if (responseEpochRef.current !== responseEpoch) return;
      const assistantMessage = newStoredMessage(
        "assistant",
        reply.content,
        new Date().toISOString(),
        reply.reasoningContent
      );
      setConversations((current) => current.map((item) => item.id !== conversationId ? item : {
        ...item,
        model: reply.model,
        messages: [...item.messages, assistantMessage],
        updatedAt: assistantMessage.createdAt
      }));
    } catch (caught) {
      if (responseEpochRef.current !== responseEpoch) return;
      // Un message non remis ne doit ni sembler envoyé, ni être retransmis
      // silencieusement lors de la tentative suivante.
      setConversations((current) => existing
        ? current.map((item) => item.id === conversationId ? {
            ...item,
            messages: item.messages.filter((message) => message.id !== userMessage.id),
            updatedAt: existing.updatedAt
          } : item)
        : current.filter((item) => item.id !== conversationId));
      if (!existing) setActiveId(null);
      setDraft(content);
      setErrorConversationId(conversationId);
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      if (responseEpochRef.current !== responseEpoch) return;
      inFlightRef.current = false;
      setInFlightConversationId(null);
      setIsSending(false);
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void handleSend();
    }
  };

  const saveKey = async () => {
    if (backend === "ollama" || !apiKey.trim()) return;
    setIsSavingKey(true);
    setError(null);
    try {
      await saveFreeChatApiKey(
        backend,
        apiKey,
        backend === "compatible" ? selectedConfig.endpoint : undefined
      );
      setKeyStatus((current) => ({ ...current, [backend]: true }));
      setApiKey("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsSavingKey(false);
    }
  };

  const deleteKey = async () => {
    if (backend === "ollama") return;
    setIsSavingKey(true);
    setError(null);
    try {
      await deleteFreeChatApiKey(
        backend,
        backend === "compatible" ? selectedConfig.endpoint : undefined
      );
      setKeyStatus((current) => ({ ...current, [backend]: false }));
      setApiKey("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsSavingKey(false);
    }
  };

  const loadModels = async () => {
    setIsLoadingModels(true);
    setError(null);
    try {
      const models = await listOllamaModels(selectedConfig.endpoint ?? DEFAULT_CONFIG.ollama.endpoint!);
      setOllamaModels(models);
      if (!selectedConfig.model && models[0]) updateBackendConfig({ model: models[0] });
      if (!models.length) setError("Ollama répond, mais aucun modèle n’est installé.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsLoadingModels(false);
    }
  };

  return (
    <section className="free-chat" aria-label="Chat libre" hidden={!isActive}>
      <header className="free-chat-toolbar">
        <div>
          <button onClick={() => setShowHistory(true)} aria-label="Afficher les conversations du Chat libre">
            <List />
          </button>
          <button onClick={startBlankConversation} aria-label="Nouvelle conversation libre">
            <Plus />
          </button>
        </div>
        <button className="free-chat-backend" onClick={() => setShowSettings(true)}>
          {backend === "ollama" ? <Cpu /> : <Bot />}
          <span><strong>{backendLabel(backend)}</strong><small>{selectedConfig.model || "Modèle à choisir"}</small></span>
          <ChevronDown />
        </button>
        <button onClick={() => setShowSettings(true)} aria-label="Réglages du Chat libre">
          <Settings2 />
        </button>
      </header>

      <div className="free-chat-messages" ref={messagesRef} aria-live="polite">
        {!activeConversation ? (
          <div className="free-chat-empty">
            <span><MessageSquare /></span>
            <h3>Une conversation vraiment libre</h3>
            <p>Choisis une API ou un modèle Ollama local. Les conversations restent enregistrées sur cet appareil.</p>
            {contextPrompt && contextKey && (
              <button onClick={startWithCourseContext}>
                <Plus /> Utiliser le contexte du cours
              </button>
            )}
            <small><ShieldCheck /> Les clés API restent dans le coffre sécurisé du système.</small>
          </div>
        ) : (
          activeConversation.messages.map((message) => message.role === "system" ? (
            <div key={message.id} className="free-chat-context-message">
              <ShieldCheck /> Contexte du cours activé
            </div>
          ) : (
            <article key={message.id} className={`free-chat-message is-${message.role}`}>
              <span>{message.role === "assistant" ? <Bot /> : "L"}</span>
              <div>
                {message.role === "assistant" ? (
                  <div className="free-chat-markdown">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        a: ({ children, ...props }) => (
                          <a {...props} target="_blank" rel="noopener noreferrer">{children}</a>
                        )
                      }}
                    >{message.content}</ReactMarkdown>
                  </div>
                ) : <p>{message.content}</p>}
                <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" })}</time>
              </div>
            </article>
          ))
        )}
        {isSending && inFlightConversationId === activeConversation?.id && (
          <article className="free-chat-message is-assistant is-loading" role="status">
            <span><Bot /></span><div><LoaderCircle /><p>Le modèle réfléchit…</p></div>
          </article>
        )}
      </div>

      {error && (!errorConversationId || errorConversationId === activeId) && !showHistory && !showSettings && <div className="free-chat-error" role="alert"><span>{error}</span><button onClick={() => setError(null)} aria-label="Fermer l’erreur"><X /></button></div>}

      <form className="free-chat-composer" onSubmit={(event) => void handleSend(event)}>
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder="Écris librement…"
          aria-label="Message du Chat libre"
          rows={1}
          disabled={isSending}
        />
        <button type="submit" disabled={!draft.trim() || isSending} aria-label="Envoyer le message">
          {isSending ? <LoaderCircle /> : <Send />}
        </button>
        <small>Entrée pour envoyer · Maj + Entrée pour une nouvelle ligne</small>
      </form>

      {showHistory && (
        <div ref={drawerRef} className="free-chat-drawer" role="dialog" aria-modal="true" aria-label="Conversations du Chat libre" tabIndex={-1}>
          <header><div><MessageSquare /><span><strong>Conversations</strong><small>{conversations.length} enregistrée{conversations.length > 1 ? "s" : ""}</small></span></div><button onClick={() => setShowHistory(false)} aria-label="Fermer l’historique"><X /></button></header>
          {error && (!errorConversationId || errorConversationId === activeId) && <div className="free-chat-error" role="alert"><span>{error}</span><button onClick={() => setError(null)} aria-label="Fermer l’erreur"><X /></button></div>}
          <button className="free-chat-new" onClick={startBlankConversation}><Plus /> Nouvelle conversation</button>
          <div className="free-chat-conversation-list">
            {sortedConversations.length ? sortedConversations.map((conversation) => (
              <article key={conversation.id} className={conversation.id === activeId ? "is-active" : ""}>
                <button onClick={() => openConversation(conversation)}>
                  <strong>{conversation.title}</strong>
                  <small>{backendLabel(conversation.backend)}{conversation.contextKey ? " · Cours lié" : ""} · {new Date(conversation.updatedAt).toLocaleDateString("fr-CH")}</small>
                </button>
                <button
                  onClick={() => deleteConversation(conversation)}
                  disabled={conversation.id === inFlightConversationId}
                  aria-label={`Supprimer ${conversation.title}`}
                ><Trash2 /></button>
              </article>
            )) : <p className="free-chat-drawer-empty">Aucune conversation pour le moment.</p>}
          </div>
        </div>
      )}

      {showSettings && (
        <div ref={drawerRef} className="free-chat-drawer" role="dialog" aria-modal="true" aria-label="Réglages du Chat libre" tabIndex={-1}>
          <header><div><Settings2 /><span><strong>Moteur du chat</strong><small>API distante ou Ollama local</small></span></div><button onClick={() => setShowSettings(false)} aria-label="Fermer les réglages"><X /></button></header>
          {error && (!errorConversationId || errorConversationId === activeId) && <div className="free-chat-error" role="alert"><span>{error}</span><button onClick={() => setError(null)} aria-label="Fermer l’erreur"><X /></button></div>}
          <div className="free-chat-settings">
            <label>Fournisseur
              <select value={backend} disabled={isSending || isSavingKey} onChange={(event) => selectBackend(event.target.value as FreeChatBackend)}>
                {BACKENDS.map((item) => <option key={item.value} value={item.value}>{item.label} — {item.detail}</option>)}
              </select>
            </label>
            <label>Modèle
              {backend === "ollama" && ollamaModels.length ? (
                <select value={selectedConfig.model} disabled={isSending || isSavingKey} onChange={(event) => updateBackendConfig({ model: event.target.value })}>
                  <option value="">Choisir un modèle</option>
                  {ollamaModels.map((model) => <option key={model} value={model}>{model}</option>)}
                </select>
              ) : (
                <input disabled={isSending || isSavingKey} value={selectedConfig.model} onChange={(event) => updateBackendConfig({ model: event.target.value })} placeholder={backend === "ollama" ? "Ex. qwen3:8b" : "Nom du modèle"} />
              )}
            </label>
            {(backend === "ollama" || backend === "compatible") && (
              <label>{backend === "ollama" ? "Adresse locale Ollama" : "Endpoint HTTPS compatible OpenAI"}
                <input disabled={isSending || isSavingKey} value={selectedConfig.endpoint ?? ""} onChange={(event) => updateBackendConfig({ endpoint: event.target.value })} spellCheck={false} />
              </label>
            )}
            {backend === "ollama" ? (
              <div className="free-chat-ollama-card">
                <span><Cpu /><span><strong>Exécution locale</strong><small>Aucune clé API nécessaire</small></span></span>
                <button onClick={() => void loadModels()} disabled={isLoadingModels}>{isLoadingModels ? <LoaderCircle /> : <Check />} Détecter Ollama</button>
              </div>
            ) : (
              <div className="free-chat-key-card">
                <span className={keyStatus[backend] ? "is-configured" : ""}><KeyRound /> {keyStatus[backend] ? "Clé enregistrée dans le coffre sécurisé" : "Aucune clé enregistrée"}</span>
                <input disabled={isSavingKey} type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Coller une nouvelle clé API" aria-label={`Nouvelle clé API ${backendLabel(backend)}`} autoComplete="off" />
                <div><button onClick={() => void saveKey()} disabled={!apiKey.trim() || isSavingKey}>{isSavingKey ? <LoaderCircle /> : <ShieldCheck />} Enregistrer</button>{keyStatus[backend] && <button className="is-danger" onClick={() => void deleteKey()} disabled={isSavingKey}><Trash2 /> Retirer</button>}</div>
                <small>La clé n’est jamais ajoutée aux conversations ni au stockage du navigateur.</small>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
