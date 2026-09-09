import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { AiProvider, StoredAssessmentPdf } from "../types";
import type { CalendarIcsEvent } from "./calendarIcs";
import type { FormationPackageFiles } from "./formations";

export interface AiBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AiNavigationPayload {
  url: string;
  provider: AiProvider;
}

export const AI_PROVIDER_OPTIONS: ReadonlyArray<{
  value: AiProvider;
  label: string;
  category: "assistant" | "custom" | "language" | "learning" | "video" | "notebook";
}> = [
  { value: "chatgpt", label: "ChatGPT", category: "assistant" },
  { value: "claude", label: "Claude", category: "assistant" },
  { value: "gemini", label: "Gemini", category: "assistant" },
  { value: "mistral", label: "Mistral", category: "assistant" },
  { value: "deepseek", label: "DeepSeek", category: "assistant" },
  { value: "kimi", label: "Kimi", category: "assistant" },
  { value: "freechat", label: "Chat libre", category: "custom" },
  { value: "duolingo", label: "Duolingo", category: "language" },
  { value: "khanacademy", label: "Khan Academy", category: "learning" },
  { value: "youtube", label: "YouTube", category: "video" },
  { value: "tiktok", label: "TikTok", category: "video" },
  { value: "notebooklm", label: "NotebookLM", category: "notebook" }
];

export type AssessmentPdfVariant = "blank" | "completed";

export interface AssessmentPdfImportSources {
  blank?: string;
  completed?: string;
}

export interface ImportedAssessmentPdfs {
  blank?: StoredAssessmentPdf;
  completed?: StoredAssessmentPdf;
}

type NativeAssessmentPdfMetadata = Omit<StoredAssessmentPdf, "importedAt">;

interface NativeImportedAssessmentPdfs {
  blank?: NativeAssessmentPdfMetadata;
  completed?: NativeAssessmentPdfMetadata;
}

export const isTauri = () => Boolean(window.__TAURI_INTERNALS__);

export const GOOGLE_CALENDAR_IMPORT_URL = "https://calendar.google.com/calendar/u/0/r/settings/export";
export const GOOGLE_WEB_PROFILE_URL = "https://accounts.google.com/";

export type GoogleWebProfileOpenTarget = "integrated-window" | "system-browser";

export interface GoogleWebProfileRemovalResult {
  removedRecords: number;
}

export interface NativeCapabilities {
  platform: "macos" | "windows" | "linux" | "other" | "browser";
  googleWebProfileRemoval: boolean;
  microphoneAccessRequest: boolean;
}

export type MicrophoneAccessStatus = "authorized" | "denied" | "restricted" | "unsupported";

export interface CalendarTransferPayload {
  events: CalendarIcsEvent[];
  content: string;
  calendarName: string;
  filename: string;
  timeZone?: string;
  uidNamespace?: string;
}

function downloadCalendarIcs(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/calendar;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function saveTextDocument(
  content: string,
  filename: string,
  kind: "json" | "markdown"
): Promise<string | null> {
  const extension = kind === "json" ? "json" : "md";
  if (!isTauri()) {
    const mime = kind === "json" ? "application/json" : "text/markdown";
    const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    return filename;
  }
  const selected = await save({
    title: kind === "json" ? "Exporter les données Dowze Academie" : "Exporter la note Markdown",
    defaultPath: filename,
    filters: [{
      name: kind === "json" ? "Données JSON" : "Document Markdown",
      extensions: [extension]
    }]
  });
  if (!selected) return null;
  const destinationPath = selected.toLocaleLowerCase().endsWith(`.${extension}`)
    ? selected
    : `${selected}.${extension}`;
  return invoke<string>("save_text_document", { content, destinationPath, kind });
}

const FORMATION_BROWSER_FILENAMES = {
  "formation.json": "formation.json",
  "matieres.json": "matieres.json",
  "programme.json": "programme.json",
  "planning.json": "planning.json",
  "evaluations.json": "evaluations.json",
  "taches.json": "taches.json"
} as const;

const MAX_FORMATION_BROWSER_FILE_SIZE = 2 * 1024 * 1024;
const MAX_FORMATION_BROWSER_PACKAGE_SIZE = 8 * 1024 * 1024;
const MAX_FORMATION_KIT_SIZE = 8 * 1024 * 1024;

type FormationBrowserFile = Pick<File, "name" | "size" | "webkitRelativePath" | "arrayBuffer">;

interface NativeFormationPackageFiles {
  directoryName: string;
  formation: string;
  subjects: string;
  curriculum: string;
  schedule: string;
  assessments: string;
  tasks: string;
}

export async function readFormationPackageBrowserFiles(
  selected: readonly FormationBrowserFile[]
): Promise<FormationPackageFiles> {
  if (!selected.length) {
    throw new Error("Le dossier de formation sélectionné est vide.");
  }

  const firstPath = selected[0]?.webkitRelativePath ?? "";
  const firstParts = firstPath.split("/").filter(Boolean);
  if (firstParts.length < 2) {
    throw new Error("Le navigateur n’a pas fourni un dossier de formation complet.");
  }
  const directoryName = firstParts[0];
  const values: Partial<FormationPackageFiles> = { directoryName };
  const seen = new Set<string>();
  let totalSize = 0;

  for (const file of selected) {
    const relative = file.webkitRelativePath;
    const parts = relative.split("/").filter(Boolean);
    if (parts.length < 2 || parts[0] !== directoryName || parts.at(-1) !== file.name) {
      throw new Error("Le navigateur a fourni un dossier de formation incohérent.");
    }
    if (parts.length !== 2 || !file.name.toLocaleLowerCase().endsWith(".json")) continue;

    const field = FORMATION_BROWSER_FILENAMES[
      file.name as keyof typeof FORMATION_BROWSER_FILENAMES
    ];
    if (!field) {
      throw new Error(`Le fichier JSON inattendu « ${file.name} » est interdit à la racine du dossier.`);
    }
    if (seen.has(file.name)) {
      throw new Error(`Le fichier « ${file.name} » apparaît plusieurs fois à la racine du dossier.`);
    }
    if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_FORMATION_BROWSER_FILE_SIZE) {
      throw new Error(`Le fichier « ${file.name} » dépasse la limite de 2 Mio.`);
    }

    const bytes = await file.arrayBuffer();
    if (bytes.byteLength > MAX_FORMATION_BROWSER_FILE_SIZE) {
      throw new Error(`Le fichier « ${file.name} » dépasse la limite de 2 Mio.`);
    }
    totalSize += bytes.byteLength;
    if (totalSize > MAX_FORMATION_BROWSER_PACKAGE_SIZE) {
      throw new Error("Le dossier de formation dépasse la limite totale de 8 Mio.");
    }

    let content: string;
    try {
      content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch {
      throw new Error(`Le fichier « ${file.name} » doit être encodé en UTF-8.`);
    }
    try {
      JSON.parse(content);
    } catch {
      throw new Error(`Le fichier « ${file.name} » contient un JSON invalide.`);
    }
    seen.add(file.name);
    values[field] = content;
  }

  const missing = Object.values(FORMATION_BROWSER_FILENAMES)
    .filter((field) => typeof values[field] !== "string");
  if (missing.length) {
    throw new Error("Le dossier sélectionné ne contient pas les six fichiers JSON obligatoires à sa racine.");
  }
  return values as FormationPackageFiles;
}

async function pickFormationPackageInBrowser(): Promise<FormationPackageFiles | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input") as HTMLInputElement & { webkitdirectory: boolean };
    input.type = "file";
    input.multiple = true;
    input.accept = ".json,application/json";
    input.webkitdirectory = true;
    input.style.display = "none";
    let settled = false;
    const cleanup = () => input.remove();
    const finish = (value: FormationPackageFiles | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    input.addEventListener("cancel", () => finish(null), { once: true });
    input.addEventListener("change", async () => {
      try {
        const selected = Array.from(input.files ?? []);
        if (!selected.length) {
          finish(null);
          return;
        }
        finish(await readFormationPackageBrowserFiles(selected));
      } catch (error) {
        fail(error);
      }
    }, { once: true });
    document.body.append(input);
    input.click();
  });
}

export async function pickFormationPackage(accountId: string): Promise<FormationPackageFiles | null> {
  if (!isTauri()) return pickFormationPackageInBrowser();
  const selected = await open({
    multiple: false,
    directory: true,
    title: "Choisir le dossier complet de la formation"
  });
  if (typeof selected !== "string") return null;
  const files = await invoke<NativeFormationPackageFiles>("read_formation_package", {
    accountId,
    directoryPath: selected
  });
  return {
    directoryName: files.directoryName,
    "formation.json": files.formation,
    "matieres.json": files.subjects,
    "programme.json": files.curriculum,
    "planning.json": files.schedule,
    "evaluations.json": files.assessments,
    "taches.json": files.tasks
  };
}

export async function saveFormationKitArchive(
  accountId: string,
  archiveBytes: Uint8Array,
  filename: string
): Promise<string | null> {
  if (archiveBytes.byteLength > MAX_FORMATION_KIT_SIZE) {
    throw new Error("Le kit dépasse la limite de 8 Mio.");
  }
  if (
    archiveBytes.byteLength < 4 ||
    archiveBytes[0] !== 0x50 ||
    archiveBytes[1] !== 0x4b ||
    archiveBytes[2] !== 0x03 ||
    archiveBytes[3] !== 0x04
  ) {
    throw new Error("Le kit généré ne possède pas une signature ZIP reconnue.");
  }
  const safeFilename = filename.toLocaleLowerCase().endsWith(".zip") ? filename : `${filename}.zip`;
  if (!isTauri()) {
    const bytes = new Uint8Array(archiveBytes);
    const url = URL.createObjectURL(new Blob([bytes.buffer], { type: "application/zip" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = safeFilename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    return safeFilename;
  }
  const selected = await save({
    title: "Enregistrer le kit de formation Dowze",
    defaultPath: safeFilename,
    filters: [{ name: "Archive ZIP", extensions: ["zip"] }]
  });
  if (!selected) return null;
  const destinationPath = selected.toLocaleLowerCase().endsWith(".zip") ? selected : `${selected}.zip`;
  return invoke<string>("save_formation_kit", {
    accountId,
    archiveBytes: Array.from(archiveBytes),
    destinationPath
  });
}

export async function openCalendarInSystem(payload: CalendarTransferPayload): Promise<string> {
  if (!isTauri()) {
    downloadCalendarIcs(payload.content, payload.filename);
    return payload.filename;
  }
  return invoke<string>("open_calendar_in_apple", {
    events: payload.events,
    calendarName: payload.calendarName,
    filename: payload.filename,
    timeZone: payload.timeZone ?? "Europe/Zurich",
    uidNamespace: payload.uidNamespace ?? null
  });
}

export async function saveCalendarIcs(payload: CalendarTransferPayload): Promise<string | null> {
  if (!isTauri()) {
    downloadCalendarIcs(payload.content, payload.filename);
    return payload.filename;
  }
  const selected = await save({
    title: "Enregistrer le calendrier Dowze Academie",
    defaultPath: payload.filename,
    filters: [{ name: "Calendrier iCalendar", extensions: ["ics"] }]
  });
  if (!selected) return null;
  const destinationPath = selected.toLocaleLowerCase().endsWith(".ics") ? selected : `${selected}.ics`;
  await invoke("save_calendar_ics", {
    events: payload.events,
    calendarName: payload.calendarName,
    destinationPath,
    timeZone: payload.timeZone ?? "Europe/Zurich",
    uidNamespace: payload.uidNamespace ?? null
  });
  return destinationPath;
}

export async function openGoogleCalendarImport(): Promise<void> {
  if (!isTauri()) {
    window.open(GOOGLE_CALENDAR_IMPORT_URL, "_blank", "noopener,noreferrer");
    return;
  }
  await invoke("open_google_calendar_import");
}

export async function openGoogleWebProfile(): Promise<GoogleWebProfileOpenTarget> {
  if (!isTauri()) {
    window.open(GOOGLE_WEB_PROFILE_URL, "_blank", "noopener,noreferrer");
    return "system-browser";
  }
  await invoke("open_google_web_profile");
  return "integrated-window";
}

export async function getNativeCapabilities(): Promise<NativeCapabilities> {
  if (!isTauri()) {
    return {
      platform: "browser",
      googleWebProfileRemoval: false,
      microphoneAccessRequest: false
    };
  }
  return invoke<NativeCapabilities>("native_capabilities");
}

export async function requestMicrophoneAccess(): Promise<MicrophoneAccessStatus> {
  if (!isTauri()) return "unsupported";
  return invoke<MicrophoneAccessStatus>("request_microphone_access");
}

export async function removeGoogleWebProfile(): Promise<GoogleWebProfileRemovalResult> {
  if (!isTauri()) {
    throw new Error("La suppression de la session Google est disponible dans l’application Dowze Academie sur macOS.");
  }
  return invoke<GoogleWebProfileRemovalResult>("remove_google_web_profile");
}

export async function pickAssessmentPdf(): Promise<string | null> {
  if (!isTauri()) return null;
  const selected = await open({
    multiple: false,
    directory: false,
    title: "Choisir un document PDF",
    filters: [{ name: "Document PDF", extensions: ["pdf"] }]
  });
  return typeof selected === "string" ? selected : null;
}

export async function importAssessmentPdfs(
  accountId: string,
  recordId: string,
  sources: AssessmentPdfImportSources
): Promise<ImportedAssessmentPdfs> {
  if (!isTauri()) {
    throw new Error("L’import sécurisé de PDF est disponible dans l’application Dowze Academie.");
  }
  const stored = await invoke<NativeImportedAssessmentPdfs>("import_assessment_pdfs", {
    accountId,
    recordId,
    blankSourcePath: sources.blank ?? null,
    completedSourcePath: sources.completed ?? null
  });
  const importedAt = new Date().toISOString();
  return {
    ...(stored.blank ? { blank: { ...stored.blank, importedAt } } : {}),
    ...(stored.completed ? { completed: { ...stored.completed, importedAt } } : {})
  };
}

export async function openAssessmentPdf(
  accountId: string,
  recordId: string,
  variant: AssessmentPdfVariant
): Promise<void> {
  if (!isTauri()) return;
  await invoke("open_assessment_pdf", { accountId, recordId, variant });
}

export async function deleteAssessmentDocuments(
  accountId: string,
  recordId: string
): Promise<boolean> {
  if (!isTauri()) return false;
  return invoke<boolean>("delete_assessment_documents", { accountId, recordId });
}

export async function deleteAccountAssessmentDocuments(
  accountId: string,
  recordIds: string[]
): Promise<boolean> {
  if (!isTauri()) return false;
  return invoke<boolean>("delete_account_assessment_documents", { accountId, recordIds });
}

export async function syncAiPanel(
  visible: boolean,
  provider: AiProvider,
  bounds: AiBounds
) {
  if (!isTauri()) return;
  await invoke("sync_ai_panel", { visible, provider, bounds });
}

export async function navigateAi(url: string) {
  if (!isTauri()) return;
  await invoke("navigate_ai", { url });
}

export async function secureAiPanelForAccountTransition(provider: AiProvider): Promise<void> {
  if (!isTauri()) return;
  await invoke("secure_ai_panel_for_account_transition", { provider });
}

export async function startAiLesson(
  accountId: string,
  provider: AiProvider,
  prompt: string,
  lessonId: string
): Promise<void> {
  if (!isTauri()) return;

  // Best-effort durable fallback: write before navigation, but never make the
  // native composer injection depend on clipboard permissions.
  try {
    await navigator.clipboard.writeText(prompt);
  } catch {
    // App.tsx exposes the same prompt through the “Consigne” fallback button.
  }

  await invoke("start_ai_lesson", { accountId, provider, prompt, lessonId });
}

export async function currentAiUrl(): Promise<string | null> {
  if (!isTauri()) return null;
  return invoke<string | null>("current_ai_url");
}

export async function reloadAi() {
  if (!isTauri()) return;
  await invoke("reload_ai");
}

export async function openInBrowser(url: string) {
  if (!isTauri()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  await invoke("open_in_browser", { url });
}

export async function listenToAiNavigation(
  handler: (payload: AiNavigationPayload) => void
): Promise<UnlistenFn> {
  if (!isTauri()) return () => undefined;
  return listen<AiNavigationPayload>("ai-navigation", (event) => handler(event.payload));
}

export function providerHome(provider: AiProvider) {
  switch (provider) {
    case "chatgpt": return "https://chatgpt.com/";
    case "claude": return "https://claude.ai/new";
    case "gemini": return "https://gemini.google.com/app";
    case "mistral": return "https://chat.mistral.ai/chat";
    case "deepseek": return "https://chat.deepseek.com/";
    case "kimi": return "https://www.kimi.com/";
    case "freechat": throw new Error("Le Chat libre est intégré à Dowze Academie et n'a pas de page web.");
    case "duolingo": return "https://www.duolingo.com/learn";
    case "khanacademy": return "https://fr.khanacademy.org/";
    case "youtube": return "https://www.youtube.com/";
    case "tiktok": return "https://www.tiktok.com/";
    case "notebooklm": return "https://notebook.google.com/";
  }
}

export function providerLabel(provider: AiProvider) {
  return AI_PROVIDER_OPTIONS.find((option) => option.value === provider)?.label ?? provider;
}

function isDomainOrSubdomain(hostname: string, domain: string) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function isConversationUrl(url: string, provider: AiProvider) {
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      (parsed.port !== "" && parsed.port !== "443")
    ) return false;
    switch (provider) {
      case "chatgpt":
        return isDomainOrSubdomain(parsed.hostname, "chatgpt.com") &&
          (/^\/c\/[a-zA-Z0-9-]+\/?$/.test(parsed.pathname) || /^\/share\/[a-zA-Z0-9-]+\/?$/.test(parsed.pathname));
      case "claude":
        return isDomainOrSubdomain(parsed.hostname, "claude.ai") &&
          /^\/chat\/[a-zA-Z0-9-]+\/?$/.test(parsed.pathname);
      case "gemini":
        return parsed.hostname === "gemini.google.com" &&
          /^\/app\/[a-zA-Z0-9_-]+\/?$/.test(parsed.pathname);
      case "mistral":
        return parsed.hostname === "chat.mistral.ai" &&
          /^\/chat\/[a-zA-Z0-9_-]+\/?$/.test(parsed.pathname);
      case "deepseek":
        return parsed.hostname === "chat.deepseek.com" &&
          /^\/a\/chat\/s\/[a-zA-Z0-9_-]+\/?$/.test(parsed.pathname);
      case "kimi":
        return (parsed.hostname === "www.kimi.com" || parsed.hostname === "kimi.com") &&
          /^\/chat\/[a-zA-Z0-9_-]+\/?$/.test(parsed.pathname);
      case "freechat":
      case "duolingo":
      case "khanacademy":
        return false;
      case "notebooklm":
        return (
          isDomainOrSubdomain(parsed.hostname, "notebook.google.com") ||
          isDomainOrSubdomain(parsed.hostname, "notebooklm.google.com")
        ) &&
          /^\/notebook\/[a-zA-Z0-9_-]+\/?$/.test(parsed.pathname);
      case "youtube":
        if (parsed.hostname === "youtu.be") {
          return /^\/[a-zA-Z0-9_-]+\/?$/.test(parsed.pathname);
        }
        if (!isDomainOrSubdomain(parsed.hostname, "youtube.com")) return false;
        return (
          (parsed.pathname === "/results" && Boolean(parsed.searchParams.get("search_query"))) ||
          (parsed.pathname === "/watch" && Boolean(parsed.searchParams.get("v"))) ||
          /^\/shorts\/[a-zA-Z0-9_-]+\/?$/.test(parsed.pathname) ||
          (parsed.pathname === "/playlist" && Boolean(parsed.searchParams.get("list")))
        );
      case "tiktok":
        if (!isDomainOrSubdomain(parsed.hostname, "tiktok.com")) return false;
        return (
          (parsed.pathname === "/search" && Boolean(parsed.searchParams.get("q"))) ||
          /^\/@[a-zA-Z0-9._-]+\/video\/[0-9]+\/?$/.test(parsed.pathname) ||
          (/^(vm|vt)\.tiktok\.com$/.test(parsed.hostname) && /^\/[a-zA-Z0-9]+\/?$/.test(parsed.pathname))
        );
    }
  } catch {
    return false;
  }
}

export function normalizeConversationUrl(url: string) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    // Google a renommé NotebookLM en Gemini Notebook et redirige désormais
    // l'ancien domaine. Une seule forme canonique évite de classer deux fois
    // le même notebook après la migration.
    if (parsed.hostname === "notebooklm.google.com") {
      parsed.hostname = "notebook.google.com";
    }
    if (parsed.hostname === "kimi.com") {
      parsed.hostname = "www.kimi.com";
    }
    if (parsed.hostname === "youtu.be") {
      const shortVideo = parsed.pathname.match(/^\/([a-zA-Z0-9_-]+)\/?$/);
      if (shortVideo) {
        const playlist = parsed.searchParams.get("list");
        parsed.hostname = "www.youtube.com";
        parsed.pathname = "/watch";
        parsed.search = "";
        parsed.searchParams.set("v", shortVideo[1]);
        if (playlist) parsed.searchParams.set("list", playlist);
      }
    }
    if (isDomainOrSubdomain(parsed.hostname, "youtube.com")) {
      const allowed = parsed.pathname === "/results"
        ? ["search_query", "sp"]
        : parsed.pathname === "/watch"
          ? ["v", "list"]
          : parsed.pathname === "/playlist"
            ? ["list"]
            : [];
      [...parsed.searchParams.keys()].forEach((key) => {
        if (!allowed.includes(key)) parsed.searchParams.delete(key);
      });
    } else if (isDomainOrSubdomain(parsed.hostname, "tiktok.com")) {
      const allowed = parsed.pathname === "/search" ? ["q"] : [];
      [...parsed.searchParams.keys()].forEach((key) => {
        if (!allowed.includes(key)) parsed.searchParams.delete(key);
      });
    } else {
      parsed.search = "";
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url.trim();
  }
}
