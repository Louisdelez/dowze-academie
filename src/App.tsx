import { CheckCircle2, Info, X } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AiPanel } from "./components/AiPanel";
import { AssessmentEditor, type AssessmentPdfSources } from "./components/AssessmentEditor";
import { CalendarExportModal } from "./components/CalendarExportModal";
import { HomePage } from "./components/HomePage";
import {
  ConfirmDialog,
  ConversationEditor,
  EventEditor,
  LinkConversationEditor,
  PaperAssessmentEditor,
  SubjectEditor,
  TaskEditor
} from "./components/Modal";
import { Sidebar } from "./components/Sidebar";
import {
  NoteLibraryDialog,
  NoteSubjectsDialog,
  WorkspaceNotePage
} from "./components/WorkspaceNotePage";
import { WorkspaceTabs } from "./components/WorkspaceTabs";
import {
  ACADEMIC_SCHEDULE_REVISION,
  defaultEvents,
  defaultSubjects,
  defaultTasks,
  hydratePersistedEvents,
  hydratePersistedSubjects
} from "./data/seed";
import {
  projectEnglishSubject,
  projectSubjectsForActiveCurricula
} from "./data/englishCurriculum";
import { consumePersistentRecoveries, usePersistentState } from "./hooks/usePersistentState";
import { createActivePaperAssessment } from "./lib/assessment";
import { createActiveAssessmentCorrection } from "./lib/assessmentCorrection";
import { createActiveLesson } from "./lib/lesson";
import {
  activateSubjectNote,
  activeNoteDocument,
  closeSubjectNote,
  createSubjectNote,
  deleteSubjectNote,
  EMPTY_SUBJECT_NOTES_STORE,
  isPersistedSubjectNotesStore,
  normalizeSubjectNotesStore,
  openSubjectNote,
  updateSubjectNote
} from "./lib/subjectNotes";
import type { PersistedSubjectNotesStore } from "./lib/subjectNotes";
import {
  type StoredFreeChatConversation
} from "./lib/freeChat";
import type { LocalAccount } from "./lib/localAuth";
import { workspaceStorageFor } from "./lib/profileStorage";
import {
  buildNotebookLmContext,
  buildVideoSearchQuery,
  isFreeChatProvider,
  isLanguagePracticeProvider,
  isNotebookProvider,
  isVideoProvider,
  supportsPromptInjection,
  videoSearchUrl
} from "./lib/learningProviders";
import { clampAiPanelWidth, maxAiPanelWidth } from "./lib/layout";
import { calendarDateFromKey, dateKeyAtTimeZone } from "./lib/zonedDate";
import {
  currentAiUrl,
  deleteAssessmentDocuments,
  importAssessmentPdfs,
  isConversationUrl,
  listenToAiNavigation,
  navigateAi,
  normalizeConversationUrl,
  openAssessmentPdf,
  pickAssessmentPdf,
  providerHome,
  secureAiPanelForAccountTransition,
  providerLabel,
  startAiLesson
} from "./lib/tauri";
import type {
  ActiveLesson,
  AiProvider,
  AiSessionMode,
  AppSection,
  AssessmentRecord,
  CalendarEvent,
  CalendarView,
  CefrLevel,
  Conversation,
  LessonMode,
  PaperAssessmentConfig,
  Subject,
  SubjectNoteDocument,
  TaskItem,
  ToastMessage
} from "./types";

const CalendarPage = lazy(() => import("./components/CalendarPage")
  .then((module) => ({ default: module.CalendarPage })));
const CoursesPage = lazy(() => import("./components/CoursesPage")
  .then((module) => ({ default: module.CoursesPage })));
const GradesPage = lazy(() => import("./components/GradesPage")
  .then((module) => ({ default: module.GradesPage })));
const SettingsPage = lazy(() => import("./components/SettingsPage")
  .then((module) => ({ default: module.SettingsPage })));
const TasksPage = lazy(() => import("./components/TasksPage")
  .then((module) => ({ default: module.TasksPage })));

type PendingCapture = {
  subjectId: string;
  curriculumScope?: string;
  provider: AiProvider;
  sawBlank: boolean;
  token: string;
  kind: "lesson" | "general";
  moduleId?: string;
  itemId?: string;
  lessonUnitId?: string;
  lessonTitle?: string;
  lessonMode?: AiSessionMode;
  assessment?: PaperAssessmentConfig;
};

function captureForLesson(
  lesson: ActiveLesson,
  provider: AiProvider,
  sawBlank = true
): PendingCapture {
  return {
    subjectId: lesson.subjectId,
    curriculumScope: lesson.curriculumScope,
    provider,
    sawBlank,
    token: crypto.randomUUID(),
    kind: "lesson",
    moduleId: lesson.moduleId,
    itemId: lesson.itemId,
    lessonUnitId: lesson.lessonUnitId,
    lessonTitle: lesson.title,
    lessonMode: lesson.lessonMode,
    assessment: lesson.assessment
  };
}

type ModalState =
  | { type: "calendar-export" }
  | { type: "event"; event?: CalendarEvent; date: Date }
  | { type: "paper-assessment"; event: CalendarEvent }
  | { type: "subject" }
  | { type: "conversation"; conversation: Conversation }
  | { type: "assessment"; assessment?: AssessmentRecord; initial?: Partial<AssessmentRecord> }
  | { type: "delete-assessment"; assessment: AssessmentRecord }
  | { type: "link"; initialUrl?: string; capture?: PendingCapture | null }
  | { type: "task"; task?: TaskItem }
  | { type: "delete-task"; task: TaskItem }
  | { type: "delete-conversation"; conversation: Conversation }
  | { type: "delete-subject-note"; note: SubjectNoteDocument }
  | { type: "note-library" }
  | { type: "note-subjects"; noteId: string }
  | null;

function lessonModeCopy(lessonMode: AiSessionMode) {
  if (lessonMode === "assessment-correction") {
    return {
      historyPrefix: "Correction",
      sessionLabel: "Correction IA",
      promptLabel: "Consigne de correction",
      subjectLabel: "La correction de la copie",
      resumedTitle: "Correction rouverte",
      readyTitle: "La consigne de correction est prête à être collée"
    };
  }
  if (lessonMode === "paper-assessment") {
    return {
      historyPrefix: "Évaluation PDF",
      sessionLabel: "Évaluation PDF",
      promptLabel: "Consigne de génération PDF",
      subjectLabel: "La génération de l’épreuve",
      resumedTitle: "Génération PDF rouverte",
      readyTitle: "La génération des PDF est prête à être collée"
    };
  }
  if (lessonMode === "exercises") {
    return {
      historyPrefix: "Exercices",
      sessionLabel: "Exercices IA",
      promptLabel: "Consigne des exercices",
      subjectLabel: "La séance d’exercices",
      resumedTitle: "Exercices repris",
      readyTitle: "Les exercices sont prêts à être collés"
    };
  }
  if (lessonMode === "chapter-test") {
    return {
      historyPrefix: "Mini-test",
      sessionLabel: "Mini-test PDF",
      promptLabel: "Consigne du mini-test PDF",
      subjectLabel: "La génération du mini-test",
      resumedTitle: "Génération PDF rouverte",
      readyTitle: "La génération du mini-test PDF est prête à être collée"
    };
  }
  return {
    historyPrefix: "Cours",
    sessionLabel: "Cours IA",
    promptLabel: "Consigne du cours",
    subjectLabel: "Le cours",
    resumedTitle: "Cours repris",
    readyTitle: "Le cours est prêt à être collé"
  };
}

function latestLessonConversation(
  conversations: readonly Conversation[],
  subjectId: string,
  moduleId: string | undefined,
  itemId: string | undefined,
  lessonUnitId: string | undefined,
  lessonMode: LessonMode,
  provider: AiProvider,
  curriculumScope?: string
): Conversation | undefined {
  return conversations
    .filter((conversation) => (
      conversation.kind !== "general" &&
      conversation.subjectId === subjectId &&
      conversation.moduleId === moduleId &&
      conversation.itemId === itemId &&
      conversation.lessonUnitId === lessonUnitId &&
      conversation.provider === provider &&
      conversation.curriculumScope === curriculumScope &&
      // Avant la séparation des modes, toutes les conversations pédagogiques
      // enregistrées étaient des conversations de cours.
      (conversation.lessonMode ?? "course") === lessonMode
    ))
    .sort((left, right) => {
      const leftTime = Date.parse(left.createdAt);
      const rightTime = Date.parse(right.createdAt);
      return (Number.isNaN(rightTime) ? 0 : rightTime) -
        (Number.isNaN(leftTime) ? 0 : leftTime);
    })[0];
}

function latestGeneralConversation(
  conversations: readonly Conversation[],
  subjectId: string,
  provider: AiProvider,
  curriculumScope?: string
): Conversation | undefined {
  return conversations
    .filter((conversation) => (
      (conversation.kind ?? "general") === "general" &&
      conversation.subjectId === subjectId &&
      conversation.provider === provider &&
      conversation.curriculumScope === curriculumScope
    ))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRecordArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every(isRecord);
}

function isOptionalString(value: unknown) {
  return value === undefined || typeof value === "string";
}

function isIsoDate(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isStoredLessonMode(value: unknown) {
  return value === undefined || [
    "course", "exercises", "chapter-test", "paper-assessment", "assessment-correction"
  ].includes(value as string);
}

function isStoredPaperAssessment(value: unknown) {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return typeof value.eventId === "string" &&
    typeof value.kind === "string" &&
    typeof value.title === "string" &&
    isIsoDate(value.scheduledAt) &&
    typeof value.durationMinutes === "number" && Number.isFinite(value.durationMinutes) &&
    Array.isArray(value.chapterIds) && value.chapterIds.every((id) => typeof id === "string") &&
    typeof value.allowedMaterials === "string" &&
    isOptionalString(value.instructions);
}

function isStoredSubjects(value: unknown): value is Subject[] {
  return isRecordArray(value) && value.every((subject) =>
    typeof subject.id === "string" &&
    typeof subject.name === "string" &&
    typeof subject.shortName === "string" &&
    typeof subject.teacher === "string" &&
    typeof subject.room === "string" &&
    typeof subject.color === "string" &&
    typeof subject.accent === "string" &&
    typeof subject.icon === "string" && SUBJECT_ICONS.has(subject.icon) &&
    isOptionalString(subject.nextClass) &&
    isOptionalString(subject.domain) &&
    isOptionalString(subject.period) &&
    isOptionalString(subject.validation) &&
    (subject.chapterCount === undefined || (typeof subject.chapterCount === "number" && Number.isInteger(subject.chapterCount) && subject.chapterCount >= 0)) &&
    isOptionalString(subject.objective) &&
    (subject.cefrLevel === undefined || (typeof subject.cefrLevel === "string" && CEFR_LEVELS.has(subject.cefrLevel))) &&
    Array.isArray(subject.modules) &&
    subject.modules.every((courseModule) => isRecord(courseModule) &&
      typeof courseModule.id === "string" &&
      typeof courseModule.period === "string" &&
      typeof courseModule.title === "string" &&
      (courseModule.cefrLevel === undefined || (typeof courseModule.cefrLevel === "string" && CEFR_LEVELS.has(courseModule.cefrLevel))) &&
      Array.isArray(courseModule.items) &&
      courseModule.items.every((item) => isRecord(item) &&
        typeof item.id === "string" &&
        typeof item.title === "string" &&
        typeof item.completed === "boolean" &&
        isOptionalString(item.description) &&
        (item.lessons === undefined || (Array.isArray(item.lessons) && item.lessons.every((lesson) =>
          isRecord(lesson) &&
          typeof lesson.id === "string" &&
          typeof lesson.title === "string" &&
          typeof lesson.objective === "string" &&
          typeof lesson.completed === "boolean"
        )))
      )
    )
  );
}

function isStoredEvents(value: unknown): value is CalendarEvent[] {
  return isRecordArray(value) && value.every((event) => {
    const start = typeof event.start === "string" ? Date.parse(event.start) : Number.NaN;
    const end = typeof event.end === "string" ? Date.parse(event.end) : Number.NaN;
    const maximumDuration = 3_660 * 24 * 60 * 60_000;
    return typeof event.id === "string" &&
    typeof event.title === "string" &&
    isIsoDate(event.start) &&
    isIsoDate(event.end) &&
    end > start && end - start <= maximumDuration &&
    new Date(start).getUTCFullYear() >= 1900 && new Date(end).getUTCFullYear() <= 2101 &&
    ["course", "study", "exam", "personal", "milestone", "break"].includes(event.type as string) &&
    typeof event.color === "string" &&
    isOptionalString(event.subjectId) &&
    isOptionalString(event.location) &&
    isOptionalString(event.description) &&
    (event.allDay === undefined || typeof event.allDay === "boolean");
  });
}

function isStoredTasks(value: unknown): value is TaskItem[] {
  return isRecordArray(value) && value.every((task) =>
    typeof task.id === "string" &&
    typeof task.title === "string" &&
    isIsoDate(task.dueAt) &&
    typeof task.completed === "boolean" &&
    (task.completedAt === undefined || isIsoDate(task.completedAt)) &&
    ["low", "medium", "high"].includes(task.priority as string) &&
    isOptionalString(task.subjectId)
  );
}

function isStoredConversations(value: unknown): value is Conversation[] {
  return isRecordArray(value) && value.every((conversation) =>
    typeof conversation.id === "string" &&
    typeof conversation.subjectId === "string" &&
    typeof conversation.provider === "string" && HISTORY_PROVIDERS.has(conversation.provider as AiProvider) &&
    typeof conversation.url === "string" &&
    isIsoDate(conversation.createdAt) &&
    isOptionalString(conversation.moduleId) &&
    isOptionalString(conversation.curriculumScope) &&
    isOptionalString(conversation.itemId) &&
    isOptionalString(conversation.lessonUnitId) &&
    isStoredLessonMode(conversation.lessonMode) &&
    isOptionalString(conversation.lessonTitle) &&
    (conversation.kind === undefined || conversation.kind === "lesson" || conversation.kind === "general") &&
    isStoredPaperAssessment(conversation.assessment) &&
    isOptionalString(conversation.localConversationId) &&
    isOptionalString(conversation.name) &&
    isOptionalString(conversation.note)
  );
}

function isStoredFreeChatConversations(value: unknown): value is StoredFreeChatConversation[] {
  return isRecordArray(value) && value.every((conversation) =>
    typeof conversation.id === "string" &&
    typeof conversation.title === "string" &&
    typeof conversation.backend === "string" && FREE_CHAT_BACKENDS.has(conversation.backend) &&
    typeof conversation.model === "string" &&
    isOptionalString(conversation.endpoint) &&
    Array.isArray(conversation.messages) && conversation.messages.every((message) =>
      isRecord(message) &&
      typeof message.id === "string" &&
      ["system", "user", "assistant"].includes(message.role as string) &&
      typeof message.content === "string" &&
      isOptionalString(message.reasoningContent) &&
      isIsoDate(message.createdAt)
    ) &&
    isIsoDate(conversation.createdAt) &&
    isIsoDate(conversation.updatedAt) &&
    isOptionalString(conversation.name) &&
    isOptionalString(conversation.note) &&
    isOptionalString(conversation.contextKey) &&
    isOptionalString(conversation.contextTitle) &&
    isOptionalString(conversation.subjectId) &&
    isOptionalString(conversation.curriculumScope) &&
    isOptionalString(conversation.moduleId) &&
    isOptionalString(conversation.itemId) &&
    isOptionalString(conversation.lessonUnitId) &&
    isStoredLessonMode(conversation.lessonMode)
  );
}

function isStoredAssessments(value: unknown): value is AssessmentRecord[] {
  return isRecordArray(value) && value.every((assessment) =>
    typeof assessment.id === "string" &&
    typeof assessment.subjectId === "string" &&
    typeof assessment.title === "string" &&
    typeof assessment.kind === "string" && RECORDED_ASSESSMENT_KINDS.has(assessment.kind) &&
    isIsoDate(assessment.assessmentDate) &&
    typeof assessment.score === "number" && Number.isFinite(assessment.score) &&
    typeof assessment.maxScore === "number" && Number.isFinite(assessment.maxScore) && assessment.maxScore > 0 &&
    (assessment.coefficient === undefined || (typeof assessment.coefficient === "number" && Number.isFinite(assessment.coefficient) && assessment.coefficient >= 0.1 && assessment.coefficient <= 20)) &&
    typeof assessment.appreciation === "string" &&
    isOptionalString(assessment.personalNote) &&
    isOptionalString(assessment.conversationId) &&
    isOptionalString(assessment.conversationUrl) &&
    (assessment.provider === undefined || (typeof assessment.provider === "string" && HISTORY_PROVIDERS.has(assessment.provider as AiProvider))) &&
    isStoredAssessmentPdf(assessment.blankPdf) &&
    isStoredAssessmentPdf(assessment.completedPdf) &&
    isIsoDate(assessment.createdAt) &&
    isIsoDate(assessment.updatedAt)
  );
}

const AI_PROVIDERS = new Set<AiProvider>([
  "chatgpt", "claude", "gemini", "mistral", "deepseek", "kimi",
  "freechat", "duolingo", "youtube", "tiktok", "notebooklm"
]);
const HISTORY_PROVIDERS = new Set<AiProvider>([
  "chatgpt", "claude", "gemini", "mistral", "deepseek", "kimi",
  "freechat", "youtube", "tiktok", "notebooklm"
]);
const SUBJECT_ICONS = new Set([
  "function", "atom", "book", "languages", "leaf", "palette", "matrix",
  "code", "flask", "drafting", "ruler", "zap", "wrench"
]);
const CEFR_LEVELS = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);
function curriculumScopeForSubject(subject: Subject | undefined): string | undefined {
  return subject?.id === "anglais" && subject.cefrLevel
    ? `cefr:${subject.cefrLevel}`
    : undefined;
}

function cefrLevelFromScope(scope: string | undefined): CefrLevel | undefined {
  const level = scope?.startsWith("cefr:") ? scope.slice(5) : undefined;
  return level && CEFR_LEVELS.has(level) ? level as CefrLevel : undefined;
}

function subjectForCurriculumScope(
  subjects: readonly Subject[],
  subjectId: string | undefined,
  scope?: string
): Subject | undefined {
  const subject = subjects.find((candidate) => candidate.id === subjectId);
  if (!subject || subject.id !== "anglais") return subject;
  return projectEnglishSubject(subject, cefrLevelFromScope(scope));
}
const RECORDED_ASSESSMENT_KINDS = new Set([
  "mini-test", "test", "control", "midterm", "exam", "final-exam",
  "written-practical", "resit", "evaluation"
]);
const CALENDAR_VIEWS = new Set<CalendarView>(["year", "month", "week", "day"]);
const FREE_CHAT_BACKENDS = new Set(["openai", "mistral", "deepseek", "kimi", "compatible", "ollama"]);

function isStoredAssessmentPdf(value: unknown) {
  return value === undefined || (
    isRecord(value) &&
    typeof value.originalName === "string" &&
    typeof value.sizeBytes === "number" && Number.isFinite(value.sizeBytes) && value.sizeBytes >= 0 &&
    isIsoDate(value.importedAt)
  );
}

interface AppProps {
  account: LocalAccount;
  startupNotice?: Omit<ToastMessage, "id"> | null;
  onLogout: () => Promise<void>;
}

function App({ account, startupNotice, onLogout }: AppProps) {
  const storage = useMemo(() => workspaceStorageFor(account.id), [account.id]);
  const [section, setSection] = useState<AppSection>("home");
  const [subjects, setSubjects] = usePersistentState<Subject[]>(storage.subjects, defaultSubjects, isStoredSubjects);
  const activeSubjects = useMemo(
    () => projectSubjectsForActiveCurricula(subjects),
    [subjects]
  );
  const [events, setEvents] = usePersistentState<CalendarEvent[]>(storage.events, defaultEvents, isStoredEvents);
  const [tasks, setTasks] = usePersistentState<TaskItem[]>(storage.tasks, defaultTasks, isStoredTasks);
  const [conversations, setConversations] = usePersistentState<Conversation[]>(storage.conversations, [], isStoredConversations);
  const [freeChatConversations, setFreeChatConversations] = usePersistentState<StoredFreeChatConversation[]>(
    storage.freeChatConversations,
    [],
    isStoredFreeChatConversations
  );
  const [freeChatActiveId, setFreeChatActiveId] = usePersistentState<string | null>(
    storage.freeChatActiveConversation,
    null,
    undefined,
    { allowEphemeralOnError: true }
  );
  const [assessments, setAssessments] = usePersistentState<AssessmentRecord[]>(storage.assessments, [], isStoredAssessments);
  const [subjectNotesStore, setSubjectNotesStore] = usePersistentState<PersistedSubjectNotesStore>(
    storage.subjectNotes,
    EMPTY_SUBJECT_NOTES_STORE,
    isPersistedSubjectNotesStore
  );
  const [provider, setProvider] = usePersistentState<AiProvider>(
    storage.provider,
    "chatgpt",
    (value): value is AiProvider => typeof value === "string" && AI_PROVIDERS.has(value as AiProvider),
    { allowEphemeralOnError: true }
  );
  const [aiVisible, setAiVisible] = usePersistentState(
    storage.aiVisible,
    true,
    undefined,
    { allowEphemeralOnError: true }
  );
  const [aiWidth, setAiWidth] = usePersistentState(
    storage.aiWidth,
    440,
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 360 && value <= 680,
    { allowEphemeralOnError: true }
  );
  const [aiWidthLimit, setAiWidthLimit] = useState(() => maxAiPanelWidth(window.innerWidth));
  const [selectedSubjectId, setSelectedSubjectId] = usePersistentState<string | null>(
    storage.selectedSubject,
    defaultSubjects[0]?.id ?? null,
    undefined,
    { allowEphemeralOnError: true }
  );
  const [calendarView, setCalendarView] = usePersistentState<CalendarView>(
    storage.calendarView,
    "week",
    (value): value is CalendarView => typeof value === "string" && CALENDAR_VIEWS.has(value as CalendarView),
    { allowEphemeralOnError: true }
  );
  const [academicScheduleRevision, setAcademicScheduleRevision] = usePersistentState<number>(
    storage.academicScheduleRevision,
    0,
    (value): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0
  );
  const [calendarDate, setCalendarDate] = useState(() => {
    const now = new Date();
    const currentKey = dateKeyAtTimeZone(now, "Europe/Zurich");
    const selectedKey = currentKey >= "2026-09-07" && currentKey <= "2027-07-24"
      ? currentKey
      : "2026-09-07";
    return calendarDateFromKey(selectedKey, "Europe/Zurich");
  });
  const freeChatHistoryEntries = useMemo<Conversation[]>(() => freeChatConversations
    .filter((conversation) => Boolean(conversation.subjectId))
    .map((conversation) => ({
      id: `freechat:${conversation.id}`,
      localConversationId: conversation.id,
      subjectId: conversation.subjectId!,
      curriculumScope: conversation.curriculumScope,
      moduleId: conversation.moduleId,
      itemId: conversation.itemId,
      lessonUnitId: conversation.lessonUnitId,
      lessonMode: conversation.lessonMode,
      lessonTitle: conversation.contextTitle?.replace(/^[^·]+·\s*/, "") ?? conversation.title,
      kind: conversation.lessonMode ? "lesson" : "general",
      provider: "freechat",
      url: "",
      createdAt: conversation.createdAt,
      name: conversation.name ?? conversation.title,
      note: conversation.note
    })), [freeChatConversations]);
  const courseConversationHistory = useMemo(
    () => [...conversations, ...freeChatHistoryEntries],
    [conversations, freeChatHistoryEntries]
  );
  const safeSubjectNotesStore = useMemo(
    () => normalizeSubjectNotesStore(subjectNotesStore),
    [subjectNotesStore]
  );
  const activeWorkspaceNote = useMemo(
    () => activeNoteDocument(safeSubjectNotesStore),
    [safeSubjectNotesStore]
  );
  const [activeLesson, setActiveLesson] = useState<ActiveLesson | null>(null);
  const [pendingCapture, setPendingCapture] = useState<PendingCapture | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const pendingRef = useRef<PendingCapture | null>(null);
  const conversationsRef = useRef(conversations);
  const clipboardWriteRef = useRef<Promise<void>>(Promise.resolve());
  const delayedAiActionRef = useRef<number | null>(null);
  const pendingPdfOperationsRef = useRef(new Set<Promise<unknown>>());
  const resetInProgressRef = useRef(false);

  const activateWorkspacePage = useCallback(() => {
    setSubjectNotesStore((current) => ({
      ...normalizeSubjectNotesStore(current),
      activeDocumentId: null
    }));
  }, [setSubjectNotesStore]);

  const navigateToSection = useCallback((nextSection: AppSection) => {
    setSection(nextSection);
    activateWorkspacePage();
  }, [activateWorkspacePage]);

  const trackPdfOperation = useCallback(<Result,>(operation: Promise<Result>): Promise<Result> => {
    const tracked = operation.finally(() => {
      pendingPdfOperationsRef.current.delete(tracked);
    });
    pendingPdfOperationsRef.current.add(tracked);
    return tracked;
  }, []);

  const setResetSafeFreeChatConversations = useCallback<typeof setFreeChatConversations>((next) => {
    if (resetInProgressRef.current) return false;
    return setFreeChatConversations(next);
  }, [setFreeChatConversations]);

  const setResetSafeFreeChatActiveId = useCallback<typeof setFreeChatActiveId>((next) => {
    if (resetInProgressRef.current) return false;
    return setFreeChatActiveId(next);
  }, [setFreeChatActiveId]);

  const cancelScheduledAiAction = useCallback(() => {
    if (delayedAiActionRef.current === null) return;
    window.clearTimeout(delayedAiActionRef.current);
    delayedAiActionRef.current = null;
  }, []);
  const scheduleAiAction = useCallback((action: () => void, delay: number) => {
    cancelScheduledAiAction();
    delayedAiActionRef.current = window.setTimeout(() => {
      delayedAiActionRef.current = null;
      action();
    }, delay);
  }, [cancelScheduledAiAction]);

  useEffect(() => { pendingRef.current = pendingCapture; }, [pendingCapture]);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);
  useEffect(() => cancelScheduledAiAction, [cancelScheduledAiAction]);

  // Le format historique associait chaque note à une seule matière. La première
  // ouverture le convertit en espace global sans modifier le contenu Markdown.
  useEffect(() => {
    if (subjectNotesStore.schemaVersion === 2) return;
    setSubjectNotesStore(normalizeSubjectNotesStore(subjectNotesStore));
  }, [setSubjectNotesStore, subjectNotesStore]);

  useEffect(() => {
    const updateAiWidthLimit = () => {
      const limit = maxAiPanelWidth(window.innerWidth);
      setAiWidthLimit(limit);
      setAiWidth((current) => clampAiPanelWidth(current, window.innerWidth));
    };
    updateAiWidthLimit();
    window.addEventListener("resize", updateAiWidthLimit);
    return () => window.removeEventListener("resize", updateAiWidthLimit);
  }, [setAiWidth]);

  // Les installations créées avant le découpage en séances ne stockaient que
  // les chapitres. Réinjecter ici le référentiel canonique préserve leur
  // progression tout en leur donnant immédiatement accès aux 988 cours.
  useEffect(() => {
    setSubjects((current) => hydratePersistedSubjects(current));
  }, [setSubjects]);

  // Le planning v1 réserve désormais 08:30–09:00 à l’anglais. La migration
  // conserve les événements personnels et ne remplace que les anciens horaires
  // canoniques restés intacts. Le marqueur empêche de recréer ensuite un cours
  // que l’utilisateur aurait volontairement supprimé.
  useEffect(() => {
    if (academicScheduleRevision >= ACADEMIC_SCHEDULE_REVISION) return;
    const stored = setEvents((current) => hydratePersistedEvents(current));
    if (stored) setAcademicScheduleRevision(ACADEMIC_SCHEDULE_REVISION);
  }, [academicScheduleRevision, setAcademicScheduleRevision, setEvents]);

  const addToast = useCallback((message: Omit<ToastMessage, "id">) => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current, { ...message, id }]);
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 4200);
  }, []);

  useEffect(() => {
    if (!startupNotice) return;
    addToast(startupNotice);
  }, [addToast, startupNotice]);

  // Les premières versions stockaient les chemins PDF absolus. Importe d’abord
  // réellement ces fichiers dans AppData, puis seulement retire l’ancien chemin.
  // En cas d’échec, la référence historique reste intacte et la migration pourra
  // être retentée après reconnexion du disque ou restauration du fichier.
  useEffect(() => {
    const legacyPath = (pdf: AssessmentRecord["blankPdf"]): string | undefined => {
      if (!pdf || !("path" in pdf)) return undefined;
      const path = (pdf as AssessmentRecord["blankPdf"] & { path?: unknown }).path;
      return typeof path === "string" && path.trim() ? path : undefined;
    };
    const legacy = assessments.filter((assessment) =>
      legacyPath(assessment.blankPdf) || legacyPath(assessment.completedPdf)
    );
    if (!legacy.length) return;
    let disposed = false;
    const migration = (async () => {
      for (const assessment of legacy) {
        if (disposed || resetInProgressRef.current) return;
        const blank = legacyPath(assessment.blankPdf);
        const completed = legacyPath(assessment.completedPdf);
        try {
          const imported = await importAssessmentPdfs(account.id, assessment.id, { blank, completed });
          if (disposed || resetInProgressRef.current) return;
          setAssessments((current) => current.map((candidate) => candidate.id === assessment.id ? {
            ...candidate,
            blankPdf: imported.blank ?? candidate.blankPdf,
            completedPdf: imported.completed ?? candidate.completedPdf,
            updatedAt: new Date().toISOString()
          } : candidate));
        } catch (error) {
          if (!disposed) {
            addToast({
              title: "Ancien PDF à reconnecter",
              detail: `La copie de « ${assessment.title} » reste référencée, mais n’a pas pu être déplacée : ${String(error)}`,
              tone: "warning"
            });
          }
        }
      }
    })();
    void trackPdfOperation(migration);
    return () => { disposed = true; };
  }, [account.id, addToast, assessments, setAssessments, trackPdfOperation]);

  const handleCreateWorkspaceNote = useCallback(() => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    return setSubjectNotesStore((current) => createSubjectNote(
      normalizeSubjectNotesStore(current),
      { id, now }
    ).store);
  }, [setSubjectNotesStore]);

  const handleOpenWorkspaceNote = useCallback((noteId: string) => {
    return setSubjectNotesStore((current) => openSubjectNote(
      normalizeSubjectNotesStore(current),
      noteId
    ));
  }, [setSubjectNotesStore]);

  const handleActivateWorkspaceNote = useCallback((noteId: string) => {
    setSubjectNotesStore((current) => activateSubjectNote(
      normalizeSubjectNotesStore(current),
      noteId
    ));
  }, [setSubjectNotesStore]);

  const handleCloseWorkspaceNote = useCallback((noteId: string) => {
    setSubjectNotesStore((current) => closeSubjectNote(
      normalizeSubjectNotesStore(current),
      noteId
    ));
  }, [setSubjectNotesStore]);

  const handleUpdateWorkspaceNote = useCallback((
    noteId: string,
    patch: Partial<Pick<SubjectNoteDocument, "title" | "markdown" | "tags" | "subjectIds">>
  ) => {
    setSubjectNotesStore((current) => updateSubjectNote(
      normalizeSubjectNotesStore(current),
      noteId,
      patch
    ));
  }, [setSubjectNotesStore]);

  useEffect(() => {
    const reportPersistenceError = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string }>).detail;
      addToast({
        title: "Stockage local presque plein",
        detail: detail?.key === storage.freeChatConversations
          ? "La conversation n’a pas été ajoutée, car elle ne pouvait pas être enregistrée durablement. Exporte tes données puis supprime d’anciens historiques."
          : "La modification a été refusée pour éviter une perte au prochain redémarrage. Exporte tes données puis libère de l’espace local.",
        tone: "warning"
      });
    };
    window.addEventListener("etude:persistence-error", reportPersistenceError);
    return () => window.removeEventListener("etude:persistence-error", reportPersistenceError);
  }, [addToast, storage.freeChatConversations]);

  useEffect(() => {
    const reportRecovery = () => {
      const recoveredKeys = consumePersistentRecoveries();
      if (!recoveredKeys.length) return;
      addToast({
        title: "Données locales réparées",
        detail: `${recoveredKeys.length} valeur${recoveredKeys.length > 1 ? "s illisibles ont" : " illisible a"} été isolée${recoveredKeys.length > 1 ? "s" : ""} et remplacée${recoveredKeys.length > 1 ? "s" : ""} par une version sûre. Une copie de récupération reste conservée localement.`,
        tone: "warning"
      });
    };
    window.addEventListener("etude:persistence-recovery", reportRecovery);
    reportRecovery();
    return () => window.removeEventListener("etude:persistence-recovery", reportRecovery);
  }, [addToast]);

  const storeConversation = useCallback((
    subjectId: string,
    capturedProvider: AiProvider,
    rawUrl: string,
    capture?: PendingCapture | null
  ) => {
    if (resetInProgressRef.current) return false;
    const url = normalizeConversationUrl(rawUrl);
    if (!isConversationUrl(url, capturedProvider)) return false;
    const captureKind = capture?.kind ?? "general";
    const duplicate = conversationsRef.current.some((conversation) => (
      conversation.provider === capturedProvider &&
      conversation.subjectId === subjectId &&
      conversation.curriculumScope === capture?.curriculumScope &&
      normalizeConversationUrl(conversation.url) === url &&
      (conversation.kind ?? "general") === captureKind &&
      conversation.moduleId === capture?.moduleId &&
      conversation.itemId === capture?.itemId &&
      conversation.lessonUnitId === capture?.lessonUnitId &&
      (conversation.lessonMode ?? (captureKind === "lesson" ? "course" : undefined)) ===
        (capture?.lessonMode ?? (captureKind === "lesson" ? "course" : undefined))
    ));
    if (duplicate) {
      pendingRef.current = null;
      setPendingCapture(null);
      addToast({ title: "Élément déjà classé", detail: `Ce lien ${providerLabel(capturedProvider)} existe déjà pour cette séance.` });
      return true;
    }
    const subject = activeSubjects.find((item) => item.id === subjectId);
    const modeCopy = lessonModeCopy(capture?.lessonMode ?? "course");
    const lessonHistoryName = capture?.lessonTitle
      ? isVideoProvider(capturedProvider)
        ? `Recherche ${providerLabel(capturedProvider)} — ${capture.lessonTitle}`
        : isNotebookProvider(capturedProvider)
          ? `NotebookLM — ${capture.lessonTitle}`
          : capture.lessonMode === "chapter-test" && capture.lessonTitle.startsWith("Mini-test — ")
            ? capture.lessonTitle
            : `${modeCopy.historyPrefix} — ${capture.lessonTitle}`
      : subject && (isVideoProvider(capturedProvider) || isNotebookProvider(capturedProvider))
        ? `${providerLabel(capturedProvider)} — ${subject.name}`
        : undefined;
    const conversation: Conversation = {
      id: crypto.randomUUID(),
      subjectId,
      curriculumScope: capture?.curriculumScope,
      moduleId: capture?.moduleId,
      itemId: capture?.itemId,
      lessonUnitId: capture?.lessonUnitId,
      lessonTitle: capture?.lessonTitle,
      lessonMode: capture?.kind === "lesson" ? capture.lessonMode ?? "course" : undefined,
      assessment: capture?.kind === "lesson" ? capture.assessment : undefined,
      kind: capture?.kind ?? "general",
      provider: capturedProvider,
      url,
      createdAt: new Date().toISOString(),
      name: lessonHistoryName
    };
    let nextConversations: Conversation[] | null = null;
    const stored = setConversations((current) => {
      const next = [conversation, ...current];
      nextConversations = next;
      return next;
    });
    if (!stored || !nextConversations) return false;
    conversationsRef.current = nextConversations;
    pendingRef.current = null;
    setPendingCapture(null);
    addToast({
      title: `${providerLabel(capturedProvider)} enregistré`,
      detail: subject ? `Ajouté à l’historique de ${subject.name}.` : "Ajouté à l’historique du cours.",
      tone: "success"
    });
    return true;
  }, [activeSubjects, addToast, setConversations]);

  const observeAiUrl = useCallback((url: string, observedProvider: AiProvider) => {
    const pending = pendingRef.current;
    if (!pending || pending.provider !== observedProvider) return;
    if (!pending.sawBlank) {
      if (!isConversationUrl(url, pending.provider)) {
        const next = { ...pending, sawBlank: true };
        pendingRef.current = next;
        setPendingCapture(next);
      }
      return;
    }
    if (isConversationUrl(url, pending.provider)) {
      storeConversation(pending.subjectId, pending.provider, url, pending);
    }
  }, [storeConversation]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listenToAiNavigation((payload) => observeAiUrl(payload.url, payload.provider)).then((cleanup) => {
      if (disposed) cleanup();
      else unlisten = cleanup;
    }).catch((error) => {
      if (!disposed) {
        addToast({
          title: "Historique IA indisponible",
          detail: `La navigation ne peut pas être suivie automatiquement : ${String(error)}`,
          tone: "warning"
        });
      }
    });
    return () => { disposed = true; unlisten?.(); };
  }, [addToast, observeAiUrl]);

  useEffect(() => {
    if (!pendingCapture || !aiVisible) return;
    const interval = window.setInterval(async () => {
      const url = await currentAiUrl().catch(() => null);
      if (url) observeAiUrl(url, pendingCapture.provider);
    }, 1600);
    return () => window.clearInterval(interval);
  }, [aiVisible, observeAiUrl, pendingCapture]);

  const copyLessonPrompt = useCallback(async (
    lesson: ActiveLesson | null = activeLesson,
    notify = true,
    targetProvider: AiProvider = provider,
    subjectOverride?: Subject
  ) => {
    const subjectId = lesson?.subjectId ?? pendingRef.current?.subjectId ?? selectedSubjectId;
    const subject = subjectOverride ?? activeSubjects.find((candidate) => candidate.id === subjectId);
    if (isLanguagePracticeProvider(targetProvider)) return false;
    const content = isVideoProvider(targetProvider)
      ? subject ? buildVideoSearchQuery(targetProvider, subject, lesson) : ""
      : isNotebookProvider(targetProvider)
        ? subject ? buildNotebookLmContext(subject, lesson) : ""
        : lesson?.prompt ?? "";
    if (!content) return false;
    try {
      const write = clipboardWriteRef.current
        .catch(() => undefined)
        .then(() => navigator.clipboard.writeText(content));
      clipboardWriteRef.current = write;
      await write;
      if (notify) {
        if (isVideoProvider(targetProvider)) {
          addToast({
            title: `Recherche ${providerLabel(targetProvider)} copiée`,
            detail: "La requête optimisée pour cette matière et cette notion est prête.",
            tone: "success"
          });
        } else if (isNotebookProvider(targetProvider)) {
          addToast({
            title: "Contexte NotebookLM copié",
            detail: "Colle-le dans le notebook après avoir ajouté tes sources de cours.",
            tone: "success"
          });
        } else if (lesson) {
          const modeCopy = lessonModeCopy(lesson.lessonMode);
          addToast({
            title: `${modeCopy.promptLabel} copiée`,
            detail: `Tu peux la coller avec ⌘V si ${modeCopy.subjectLabel.toLocaleLowerCase("fr")} ne démarre pas automatiquement.`,
            tone: "success"
          });
        }
      }
      return true;
    } catch {
      if (notify) {
        addToast({
          title: "Copie impossible",
          detail: isVideoProvider(targetProvider)
            ? `La recherche reste ouverte directement dans ${providerLabel(targetProvider)}.`
            : isNotebookProvider(targetProvider)
              ? "Tu peux toujours utiliser le contexte affiché depuis la séance NotebookLM."
              : lesson
                ? `${lessonModeCopy(lesson.lessonMode).subjectLabel} peut toujours démarrer automatiquement dans le panneau IA.`
                : "Réessaie depuis une séance de cours.",
          tone: "warning"
        });
      }
      return false;
    }
  }, [activeLesson, activeSubjects, addToast, provider, selectedSubjectId]);

  const startAiSession = useCallback((subjectId: string, forcedProvider = provider) => {
    cancelScheduledAiAction();
    const subject = activeSubjects.find((candidate) => candidate.id === subjectId);
    if (!subject) {
      addToast({ title: "Matière introuvable", tone: "warning" });
      return;
    }
    if (subject.id === "anglais" && !subject.cefrLevel) {
      pendingRef.current = null;
      setPendingCapture(null);
      setActiveLesson(null);
      setSelectedSubjectId(subjectId);
      navigateToSection("courses");
      addToast({
        title: "Choisis ton niveau d’anglais",
        detail: "Ce choix ouvre le programme annuel adapté et ne sera plus redemandé.",
        tone: "success"
      });
      return;
    }

    setSelectedSubjectId(subjectId);
    setProvider(forcedProvider);
    setAiVisible(true);
    setActiveLesson(null);

    if (isFreeChatProvider(forcedProvider)) {
      pendingRef.current = null;
      setPendingCapture(null);
      setActiveLesson(createActiveLesson(subject));
      addToast({
        title: `Chat libre — ${subject.shortName}`,
        detail: "Choisis une API personnelle ou un modèle Ollama local, puis démarre une conversation.",
        tone: "success"
      });
      return;
    }

    if (isLanguagePracticeProvider(forcedProvider)) {
      pendingRef.current = null;
      setPendingCapture(null);
      addToast({
        title: "Duolingo ouvert",
        detail: "Ta pratique d’anglais est prête. Aucune consigne de cours n’est envoyée à Duolingo.",
        tone: "success"
      });
      scheduleAiAction(() => {
        void navigateAi(providerHome(forcedProvider)).catch((error) => {
          addToast({ title: "Impossible d’ouvrir Duolingo", detail: String(error), tone: "warning" });
        });
      }, 260);
      return;
    }

    if (isVideoProvider(forcedProvider)) {
      const capture: PendingCapture = {
        subjectId,
        curriculumScope: curriculumScopeForSubject(subject),
        provider: forcedProvider,
        sawBlank: true,
        token: crypto.randomUUID(),
        kind: "general"
      };
      const searchUrl = videoSearchUrl(forcedProvider, subject);
      pendingRef.current = null;
      setPendingCapture(null);
      void copyLessonPrompt(null, false, forcedProvider, subject);
      storeConversation(subjectId, forcedProvider, searchUrl, capture);
      scheduleAiAction(() => {
        void navigateAi(searchUrl).catch((error) => {
          addToast({ title: `Impossible d’ouvrir ${providerLabel(forcedProvider)}`, detail: String(error), tone: "warning" });
        });
      }, 260);
      return;
    }

    const nextPending: PendingCapture = {
      subjectId,
      curriculumScope: curriculumScopeForSubject(subject),
      provider: forcedProvider,
      sawBlank: false,
      token: crypto.randomUUID(),
      kind: "general"
    };
    pendingRef.current = nextPending;
    setPendingCapture(nextPending);

    if (isNotebookProvider(forcedProvider)) {
      void copyLessonPrompt(null, false, forcedProvider, subject);
      addToast({
        title: `Contexte NotebookLM — ${subject.shortName}`,
        detail: "Crée ou ouvre un notebook, ajoute tes sources, puis colle le contexte avec ⌘V.",
        tone: "success"
      });
    }

    scheduleAiAction(() => {
      if (pendingRef.current?.token !== nextPending.token) return;
      void navigateAi(providerHome(forcedProvider)).catch((error) => {
        addToast({ title: "Impossible d’ouvrir la nouvelle session", detail: String(error), tone: "warning" });
      });
    }, 260);
  }, [activeSubjects, addToast, cancelScheduledAiAction, copyLessonPrompt, provider, scheduleAiAction, setAiVisible, setProvider, setSelectedSubjectId, storeConversation]);

  const launchLesson = useCallback((lesson: ActiveLesson, forcedProvider = provider) => {
    cancelScheduledAiAction();
    const subject = subjectForCurriculumScope(subjects, lesson.subjectId, lesson.curriculumScope);
    if (!subject) {
      addToast({ title: "Matière introuvable", detail: "Recharge le cursus puis réessaie.", tone: "warning" });
      return;
    }
    const modeCopy = lessonModeCopy(lesson.lessonMode);
    setSelectedSubjectId(lesson.subjectId);
    setProvider(forcedProvider);
    setAiVisible(true);
    setActiveLesson(lesson);

    if (isFreeChatProvider(forcedProvider)) {
      pendingRef.current = null;
      setPendingCapture(null);
      addToast({
        title: `Chat libre — ${lesson.title}`,
        detail: "La dernière conversation de cette séance est reprise automatiquement, ou créée avec le contexte du cours.",
        tone: "success"
      });
      return;
    }

    if (isLanguagePracticeProvider(forcedProvider)) {
      pendingRef.current = null;
      setPendingCapture(null);
      addToast({
        title: "Duolingo ouvert",
        detail: "Cette pratique d’anglais reste indépendante de la séance Dowze Academie : aucune consigne n’est copiée ou envoyée.",
        tone: "success"
      });
      scheduleAiAction(() => {
        void navigateAi(providerHome(forcedProvider)).catch((error) => {
          addToast({ title: "Impossible d’ouvrir Duolingo", detail: String(error), tone: "warning" });
        });
      }, 260);
      return;
    }

    const nextPending: PendingCapture = {
      subjectId: lesson.subjectId,
      curriculumScope: lesson.curriculumScope,
      provider: forcedProvider,
      // start_ai_lesson always navigates to a blank provider session first.
      sawBlank: true,
      token: crypto.randomUUID(),
      kind: "lesson",
      moduleId: lesson.moduleId,
      itemId: lesson.itemId,
      lessonUnitId: lesson.lessonUnitId,
      lessonTitle: lesson.title,
      lessonMode: lesson.lessonMode ?? "course",
      assessment: lesson.assessment
    };

    if (isVideoProvider(forcedProvider)) {
      const searchUrl = videoSearchUrl(forcedProvider, subject, lesson);
      pendingRef.current = null;
      setPendingCapture(null);
      void copyLessonPrompt(lesson, false, forcedProvider, subject);
      storeConversation(lesson.subjectId, forcedProvider, searchUrl, nextPending);
      addToast({
        title: `Recherche ${providerLabel(forcedProvider)} — ${lesson.title}`,
        detail: "Une recherche ciblée sur la matière, le chapitre, le cours et le mode de travail vient de s’ouvrir.",
        tone: "success"
      });
      scheduleAiAction(() => {
        void navigateAi(searchUrl).catch((error) => {
          addToast({ title: `Impossible d’ouvrir ${providerLabel(forcedProvider)}`, detail: String(error), tone: "warning" });
        });
      }, 260);
      return;
    }

    nextPending.sawBlank = !isNotebookProvider(forcedProvider);
    pendingRef.current = nextPending;
    setPendingCapture(nextPending);

    // Le presse-papiers reste un secours durable si un service modifie son interface.
    void copyLessonPrompt(lesson, false, forcedProvider, subject);

    if (isNotebookProvider(forcedProvider)) {
      addToast({
        title: `NotebookLM — ${lesson.title}`,
        detail: "Crée ou ouvre le notebook de cette séance, ajoute les sources utiles, puis colle le contexte avec ⌘V.",
        tone: "success"
      });
      scheduleAiAction(() => {
        if (pendingRef.current?.token !== nextPending.token) return;
        void navigateAi(providerHome(forcedProvider)).catch((error) => {
          addToast({ title: "Impossible d’ouvrir NotebookLM", detail: String(error), tone: "warning" });
        });
      }, 260);
      return;
    }

    addToast({
      title: `${modeCopy.sessionLabel} — ${lesson.title}`,
      detail: `${modeCopy.subjectLabel} démarre dans ${providerLabel(forcedProvider)}. Le bouton « Consigne » reste disponible en secours.`,
      tone: "success"
    });

    scheduleAiAction(() => {
      if (pendingRef.current?.token !== nextPending.token) return;
      if (!supportsPromptInjection(forcedProvider)) return;
      void startAiLesson(account.id, forcedProvider, lesson.prompt, lesson.id).catch(async (error: unknown) => {
        await navigateAi(providerHome(forcedProvider)).catch(() => undefined);
        addToast({
          title: modeCopy.readyTitle,
          detail: `L’insertion automatique a échoué (${String(error)}). Utilise ⌘V dans le panneau IA.`,
          tone: "warning"
        });
      });
    }, 320);
  }, [account.id, addToast, cancelScheduledAiAction, copyLessonPrompt, provider, scheduleAiAction, setAiVisible, setProvider, setSelectedSubjectId, storeConversation, subjects]);

  const handleOpenConversation = (conversation: Conversation) => {
    cancelScheduledAiAction();
    if (conversation.provider === "freechat" && conversation.localConversationId) {
      const localConversation = freeChatConversations.find(
        (candidate) => candidate.id === conversation.localConversationId
      );
      if (!localConversation) {
        addToast({
          title: "Conversation locale introuvable",
          detail: "Elle a peut-être été supprimée du Chat libre.",
          tone: "warning"
        });
        return;
      }
      const subject = subjectForCurriculumScope(
        subjects,
        localConversation.subjectId,
        localConversation.curriculumScope
      );
      const courseModule = subject?.modules.find((candidate) => candidate.id === localConversation.moduleId);
      const item = courseModule?.items.find((candidate) => candidate.id === localConversation.itemId);
      const lessonUnit = item?.lessons?.find((candidate) => candidate.id === localConversation.lessonUnitId);
      let restoredLesson: ActiveLesson | null = null;
      if (
        subject &&
        localConversation.lessonMode &&
        ["course", "exercises", "chapter-test"].includes(localConversation.lessonMode)
      ) {
        try {
          restoredLesson = createActiveLesson(
            subject,
            courseModule,
            item,
            lessonUnit,
            {
              id: `freechat-open-${localConversation.id}-${Date.now()}`,
              startedAt: localConversation.createdAt,
              lessonMode: localConversation.lessonMode as LessonMode
            }
          );
        } catch {
          restoredLesson = null;
        }
      }
      pendingRef.current = null;
      setPendingCapture(null);
      if (localConversation.subjectId) setSelectedSubjectId(localConversation.subjectId);
      setProvider("freechat");
      setAiVisible(true);
      setFreeChatActiveId(localConversation.id);
      setActiveLesson(restoredLesson);
      return;
    }
    pendingRef.current = null;
    setPendingCapture(null);
    setSelectedSubjectId(conversation.subjectId);
    setProvider(conversation.provider);
    setAiVisible(true);
    const subject = subjectForCurriculumScope(
      subjects,
      conversation.subjectId,
      conversation.curriculumScope
    );
    const courseModule = subject?.modules.find((candidate) => candidate.id === conversation.moduleId);
    const item = courseModule?.items.find((candidate) => candidate.id === conversation.itemId);
    const lessonUnit = item?.lessons?.find((candidate) => candidate.id === conversation.lessonUnitId);
    if (
      conversation.kind !== "general" &&
      conversation.lessonMode === "paper-assessment" &&
      subject &&
      conversation.assessment
    ) {
      setActiveLesson(createActivePaperAssessment(subject, conversation.assessment, {
        id: conversation.id,
        startedAt: conversation.createdAt
      }));
    } else {
      const restorationOptions = {
        id: conversation.id,
        startedAt: conversation.createdAt,
        // Les conversations enregistrées avant la séparation des modes étaient
        // toutes des séances de cours.
        lessonMode: (conversation.lessonMode ?? "course") as LessonMode
      };
      setActiveLesson(
        conversation.kind !== "general" && subject &&
          conversation.lessonMode !== "paper-assessment" &&
          (!conversation.moduleId || courseModule) &&
          (!conversation.itemId || item) &&
          (!conversation.lessonUnitId || lessonUnit)
          ? createActiveLesson(
              subject,
              courseModule,
              item,
              lessonUnit,
              restorationOptions
            )
          : null
      );
    }
    scheduleAiAction(() => {
      void navigateAi(conversation.url).catch((error) => {
        addToast({ title: "Impossible de rouvrir la conversation", detail: String(error), tone: "warning" });
      });
    }, 250);
  };

  const handleStartLesson = (
    subjectId: string,
    moduleId: string,
    itemId: string,
    lessonUnitId?: string,
    lessonMode: LessonMode = "course"
  ) => {
    const subject = activeSubjects.find((candidate) => candidate.id === subjectId);
    const courseModule = subject?.modules.find((candidate) => candidate.id === moduleId);
    const item = courseModule?.items.find((candidate) => candidate.id === itemId);
    const lessonUnit = lessonUnitId
      ? item?.lessons?.find((candidate) => candidate.id === lessonUnitId)
      : undefined;
    if (!subject || !courseModule || !item) {
      addToast({
        title: "Chapitre introuvable",
        detail: "Recharge le cursus puis réessaie.",
        tone: "warning"
      });
      return;
    }
    if (lessonUnitId && !lessonUnit) {
      addToast({
        title: "Cours introuvable",
        detail: "La séance sélectionnée n’existe plus dans ce chapitre.",
        tone: "warning"
      });
      return;
    }

    const previousConversation = latestLessonConversation(
      conversationsRef.current,
      subjectId,
      moduleId,
      itemId,
      lessonUnitId,
      lessonMode,
      provider,
      curriculumScopeForSubject(subject)
    );
    if (previousConversation) {
      const modeCopy = lessonModeCopy(lessonMode);
      handleOpenConversation(previousConversation);
      addToast({
        title: modeCopy.resumedTitle,
        detail: `Réouverture de la dernière conversation dans ${providerLabel(previousConversation.provider)}.`,
        tone: "success"
      });
      return;
    }
    launchLesson(createActiveLesson(subject, courseModule, item, lessonUnit, { lessonMode }));
  };

  const handleStartChapterTest = (
    subjectId: string,
    moduleId: string,
    itemId: string
  ) => {
    const subject = activeSubjects.find((candidate) => candidate.id === subjectId);
    const courseModule = subject?.modules.find((candidate) => candidate.id === moduleId);
    const item = courseModule?.items.find((candidate) => candidate.id === itemId);
    if (!subject || !courseModule || !item) {
      addToast({
        title: "Chapitre introuvable",
        detail: "Recharge le cursus puis réessaie.",
        tone: "warning"
      });
      return;
    }

    const assessmentProvider = supportsPromptInjection(provider) ? provider : "chatgpt";
    if (assessmentProvider !== provider) {
      addToast({
        title: "ChatGPT sélectionné pour le mini-test",
        detail: `${providerLabel(provider)} reste disponible pour étudier, mais la génération du sujet PDF nécessite un assistant IA.`,
        tone: "success"
      });
    }

    const previousConversation = latestLessonConversation(
      conversationsRef.current,
      subjectId,
      moduleId,
      itemId,
      undefined,
      "chapter-test",
      assessmentProvider,
      curriculumScopeForSubject(subject)
    );
    if (previousConversation) {
      handleOpenConversation(previousConversation);
      addToast({
        title: "Génération PDF rouverte",
        detail: `Réouverture de la dernière conversation dans ${providerLabel(previousConversation.provider)}.`,
        tone: "success"
      });
      return;
    }

    launchLesson(createActiveLesson(
      subject,
      courseModule,
      item,
      undefined,
      { lessonMode: "chapter-test" }
    ), assessmentProvider);
  };

  const handleStartSubjectLesson = (subjectId: string) => {
    const subject = activeSubjects.find((candidate) => candidate.id === subjectId);
    if (!subject) {
      addToast({ title: "Matière introuvable", tone: "warning" });
      return;
    }
    const previousConversation = latestLessonConversation(
      conversationsRef.current,
      subjectId,
      undefined,
      undefined,
      undefined,
      "course",
      provider,
      curriculumScopeForSubject(subject)
    );
    if (previousConversation) {
      handleOpenConversation(previousConversation);
      addToast({
        title: "Séance de matière rouverte",
        detail: `Réouverture du dernier historique ${providerLabel(provider)} pour ${subject.name}.`,
        tone: "success"
      });
      return;
    }
    launchLesson(createActiveLesson(subject));
  };

  const handleGeneratePaperAssessment = (
    subject: Subject,
    config: PaperAssessmentConfig
  ) => {
    setModal(null);
    const assessmentProvider = supportsPromptInjection(provider) ? provider : "chatgpt";
    if (assessmentProvider !== provider) {
      addToast({
        title: "ChatGPT sélectionné pour l’évaluation",
        detail: `${providerLabel(provider)} reste disponible pour étudier, mais la création des PDF nécessite un assistant IA.`,
        tone: "success"
      });
    }
    launchLesson(createActivePaperAssessment(subject, config), assessmentProvider);
  };

  const handleCorrectAssessment = (conversation: Conversation) => {
    cancelScheduledAiAction();
    const subject = subjectForCurriculumScope(
      subjects,
      conversation.subjectId,
      conversation.curriculumScope
    );
    if (
      !subject ||
      conversation.kind !== "lesson" ||
      !supportsPromptInjection(conversation.provider) ||
      (conversation.lessonMode !== "paper-assessment" && conversation.lessonMode !== "chapter-test")
    ) {
      addToast({
        title: "Évaluation introuvable",
        detail: "La correction doit repartir de la conversation qui a créé le sujet et son barème.",
        tone: "warning"
      });
      return;
    }

    const correction = createActiveAssessmentCorrection(subject, conversation);
    pendingRef.current = null;
    setPendingCapture(null);
    setSelectedSubjectId(subject.id);
    setProvider(conversation.provider);
    setAiVisible(true);
    setActiveLesson(correction);
    void copyLessonPrompt(correction, false);
    scheduleAiAction(() => {
      void navigateAi(conversation.url).catch((error) => {
        addToast({ title: "Impossible d’ouvrir la correction", detail: String(error), tone: "warning" });
      });
    }, 250);
    addToast({
      title: "Conversation de correction ouverte",
      detail: "Joins toutes les pages de ta copie scannée, colle la consigne avec ⌘V, puis envoie le tout à l’IA.",
      tone: "success"
    });
  };

  const handleRecordAssessment = (conversation?: Conversation) => {
    if (!conversation) {
      setModal({ type: "assessment" });
      return;
    }
    const existing = assessments.find((assessment) => assessment.conversationId === conversation.id);
    if (existing) {
      setModal({ type: "assessment", assessment: existing });
      return;
    }
    setModal({
      type: "assessment",
      initial: {
        subjectId: conversation.subjectId,
        title: conversation.assessment?.title ?? conversation.lessonTitle ?? conversation.name ?? "Évaluation",
        kind: conversation.lessonMode === "chapter-test"
          ? "mini-test"
          : conversation.assessment?.kind ?? "evaluation",
        assessmentDate: dateKeyAtTimeZone(
          new Date(conversation.assessment?.scheduledAt ?? conversation.createdAt),
          "Europe/Zurich"
        ),
        conversationId: conversation.id,
        conversationUrl: conversation.url,
        provider: conversation.provider
      }
    });
  };

  const chooseAssessmentPdf = async () => {
    try {
      return await pickAssessmentPdf();
    } catch (error) {
      addToast({ title: "Impossible de choisir le PDF", detail: String(error), tone: "warning" });
      return null;
    }
  };

  const saveAssessment = (assessment: AssessmentRecord, sources: AssessmentPdfSources) => trackPdfOperation((async () => {
    try {
      const imported = sources.blank || sources.completed
        ? await importAssessmentPdfs(account.id, assessment.id, sources)
        : {};
      if (resetInProgressRef.current) return;
      const blankPdf = imported.blank ?? assessment.blankPdf;
      const completedPdf = imported.completed ?? assessment.completedPdf;
      const saved = { ...assessment, blankPdf, completedPdf };
      const nextAssessments = assessments.some((item) => item.id === saved.id)
        ? assessments.map((item) => item.id === saved.id ? saved : item)
        : [saved, ...assessments];

      // Confirme la persistance avant d'annoncer un succès : un stockage plein ne
      // doit jamais donner l'illusion qu'une note et ses références PDF sont sauvées.
      localStorage.setItem(storage.assessments, JSON.stringify(nextAssessments));
      setAssessments(nextAssessments);
      setModal(null);
      navigateToSection("grades");
      addToast({
        title: "Note enregistrée",
        detail: `${saved.score.toLocaleString("fr-CH")} / ${saved.maxScore} · ${saved.title}`,
        tone: "success"
      });
    } catch (error) {
      addToast({
        title: "Enregistrement incomplet",
        detail: `La fiche ou ses PDF n’ont pas pu être archivés durablement : ${String(error)}`,
        tone: "warning"
      });
    }
  })());

  const handleOpenAssessmentPdf = async (
    assessment: AssessmentRecord,
    variant: "blank" | "completed"
  ) => {
    try {
      await openAssessmentPdf(account.id, assessment.id, variant);
    } catch (error) {
      addToast({ title: "Impossible d’ouvrir le PDF", detail: String(error), tone: "warning" });
    }
  };

  const handleOpenAssessmentConversation = (conversationId: string) => {
    const conversation = conversations.find((candidate) => candidate.id === conversationId);
    if (!conversation) {
      const assessment = assessments.find((candidate) => candidate.conversationId === conversationId);
      if (
        assessment?.conversationUrl &&
        assessment.provider &&
        !isFreeChatProvider(assessment.provider) &&
        isConversationUrl(assessment.conversationUrl, assessment.provider)
      ) {
        setProvider(assessment.provider);
        setAiVisible(true);
        void navigateAi(assessment.conversationUrl).catch((error) => {
          addToast({ title: "Impossible d’ouvrir le lien archivé", detail: String(error), tone: "warning" });
        });
        addToast({
          title: "Lien archivé rouvert",
          detail: "La fiche d’historique a été supprimée, mais le lien conservé avec la note reste disponible.",
          tone: "success"
        });
        return;
      }
      addToast({ title: "Conversation introuvable", detail: "Son historique et son lien archivé ne sont plus disponibles.", tone: "warning" });
      return;
    }
    handleOpenConversation(conversation);
  };

  const handleSelectSubject = (id: string) => {
    navigateToSection("courses");
    const subject = activeSubjects.find((candidate) => candidate.id === id);
    if (subject?.id === "anglais" && !subject.cefrLevel) {
      cancelScheduledAiAction();
      pendingRef.current = null;
      setPendingCapture(null);
      setActiveLesson(null);
      setSelectedSubjectId(id);
    } else if (id !== selectedSubjectId) startAiSession(id);
    else setSelectedSubjectId(id);
  };

  const handleSelectEnglishLevel = async (level: CefrLevel) => {
    cancelScheduledAiAction();
    pendingRef.current = null;
    setPendingCapture(null);
    setActiveLesson(null);
    setFreeChatActiveId(null);
    const restorePanel = aiVisible;
    const restoreAiPanelIfNeeded = () => {
      if (restorePanel) window.setTimeout(() => setAiVisible(true), 0);
    };
    setAiVisible(false);
    const previousLevel = subjects.find((subject) => subject.id === "anglais")?.cefrLevel;
    try {
      await secureAiPanelForAccountTransition(provider);
    } catch (error) {
      restoreAiPanelIfNeeded();
      addToast({
        title: "Changement de niveau interrompu",
        detail: `La séance IA en cours n’a pas pu être fermée en sécurité. Le niveau ${previousLevel ?? "actuel"} reste sélectionné. ${String(error)}`,
        tone: "warning"
      });
      return;
    }
    const stored = setSubjects((current) => current.map((subject) => subject.id === "anglais"
      ? { ...subject, cefrLevel: level }
      : subject
    ));
    if (!stored) {
      restoreAiPanelIfNeeded();
      return;
    }
    setSelectedSubjectId("anglais");
    navigateToSection("courses");
    restoreAiPanelIfNeeded();
    addToast({
      title: previousLevel ? `Niveau d’anglais changé : ${level}` : `Parcours d’anglais ${level} activé`,
      detail: previousLevel
        ? `Ta progression ${previousLevel} reste enregistrée et pourra être retrouvée plus tard.`
        : "Ce niveau restera ouvert automatiquement lors de tes prochaines visites.",
      tone: "success"
    });
  };

  const handleOpenCalendarEvent = (event: CalendarEvent) => {
    const linkedSubject = event.subjectId
      ? activeSubjects.find((subject) => subject.id === event.subjectId)
      : undefined;
    if (linkedSubject) {
      setSelectedSubjectId(linkedSubject.id);
      navigateToSection("courses");
      return;
    }

    setCalendarDate(calendarDateFromKey(dateKeyAtTimeZone(new Date(event.start))));
    setCalendarView("day");
    navigateToSection("calendar");
  };

  const handleProviderChange = (next: AiProvider) => {
    if (next === provider) return;
    if (activeLesson?.lessonMode === "assessment-correction") {
      addToast({
        title: "Correction liée à sa conversation d’origine",
        detail: `Reste dans ${providerLabel(provider)} : le sujet et le barème se trouvent dans cette conversation.`,
        tone: "warning"
      });
      return false;
    }
    if (
      activeLesson &&
      ["chapter-test", "paper-assessment"].includes(activeLesson.lessonMode) &&
      (isVideoProvider(next) || isNotebookProvider(next) || isLanguagePracticeProvider(next))
    ) {
      addToast({
        title: "Choisis un assistant IA pour cette évaluation",
        detail: "Duolingo, YouTube, TikTok et NotebookLM servent à pratiquer ou consulter des ressources, pas à générer une épreuve papier.",
        tone: "warning"
      });
      return false;
    }
    if (isFreeChatProvider(next)) {
      if (
        activeLesson &&
        activeLesson.lessonMode !== "course" &&
        activeLesson.lessonMode !== "exercises"
      ) {
        addToast({
          title: "Cette évaluation reste dans un assistant web",
          detail: "Le Chat libre ne gère pas encore les pièces jointes ni la création de vrais PDF.",
          tone: "warning"
        });
        return false;
      }
      pendingRef.current = null;
      setPendingCapture(null);
      setProvider(next);
      setAiVisible(true);
      addToast({
        title: "Chat libre ouvert",
        detail: activeLesson
          ? "Le contexte et la dernière conversation de cette séance sont chargés automatiquement."
          : "Configure une clé API personnelle ou détecte Ollama depuis les réglages du chat.",
        tone: "success"
      });
      return;
    }
    if (isLanguagePracticeProvider(next)) {
      pendingRef.current = null;
      setPendingCapture(null);
      setProvider(next);
      setAiVisible(true);
      addToast({
        title: "Duolingo ouvert",
        detail: "Pratique l’anglais sur la page officielle, sans transmettre la consigne de ta séance Dowze Academie.",
        tone: "success"
      });
      scheduleAiAction(() => {
        void navigateAi(providerHome(next)).catch((error) => {
          addToast({ title: "Impossible d’ouvrir Duolingo", detail: String(error), tone: "warning" });
        });
      }, 220);
      return;
    }
    if (activeLesson) {
      if (
        activeLesson.lessonMode === "course" ||
        activeLesson.lessonMode === "exercises" ||
        activeLesson.lessonMode === "chapter-test"
      ) {
        const previousConversation = latestLessonConversation(
          conversationsRef.current,
          activeLesson.subjectId,
          activeLesson.moduleId,
          activeLesson.itemId,
          activeLesson.lessonUnitId,
          activeLesson.lessonMode,
          next,
          activeLesson.curriculumScope
        );
        if (previousConversation) {
          handleOpenConversation(previousConversation);
          addToast({
            title: `${providerLabel(next)} rouvert`,
            detail: "La dernière session de ce service pour cette séance a été restaurée.",
            tone: "success"
          });
          return;
        }
      }
      launchLesson(activeLesson, next);
      return;
    }
    if (selectedSubjectId) {
      const previousConversation = latestGeneralConversation(
        conversationsRef.current,
        selectedSubjectId,
        next,
        curriculumScopeForSubject(activeSubjects.find((candidate) => candidate.id === selectedSubjectId))
      );
      if (previousConversation) {
        handleOpenConversation(previousConversation);
        addToast({
          title: `${providerLabel(next)} rouvert`,
          detail: "La dernière session générale de cette matière a été restaurée.",
          tone: "success"
        });
      } else {
        startAiSession(selectedSubjectId, next);
      }
      return;
    }
    setProvider(next);
    if (aiVisible) {
      scheduleAiAction(() => {
        void navigateAi(providerHome(next)).catch((error) => {
          addToast({ title: `Impossible d’ouvrir ${providerLabel(next)}`, detail: String(error), tone: "warning" });
        });
      }, 220);
    }
  };

  const handleAssociateCurrent = (url?: string | null) => {
    const existingCapture = pendingCapture ?? (activeLesson ? captureForLesson(activeLesson, provider) : null);
    const subjectId = existingCapture?.subjectId ?? selectedSubjectId;
    const subject = activeSubjects.find((item) => item.id === subjectId);
    if (!subject) {
      addToast({ title: "Choisissez d’abord une matière", detail: "Le lien doit être rattaché à un cours.", tone: "warning" });
      return;
    }
    const curriculumScope = curriculumScopeForSubject(subject);
    const capture = existingCapture ?? (curriculumScope ? {
      subjectId: subject.id,
      curriculumScope,
      provider,
      sawBlank: true,
      token: crypto.randomUUID(),
      kind: "general" as const
    } : null);
    if (url && isConversationUrl(url, provider)) {
      storeConversation(subject.id, provider, url, capture);
      return;
    }
    setModal({ type: "link", initialUrl: url ?? undefined, capture });
  };

  const saveEvent = (nextEvent: CalendarEvent) => {
    const stored = setEvents((current) => {
      const exists = current.some((item) => item.id === nextEvent.id);
      return exists ? current.map((item) => item.id === nextEvent.id ? nextEvent : item) : [...current, nextEvent];
    });
    if (!stored) return;
    setModal(null);
    addToast({ title: "Planning mis à jour", detail: nextEvent.title, tone: "success" });
  };

  const deleteEvent = (id: string) => {
    if (!setEvents((current) => current.filter((event) => event.id !== id))) return;
    setModal(null);
    addToast({ title: "Événement supprimé" });
  };

  const toggleProgramItem = (subjectId: string, moduleId: string, itemId: string) => {
    setSubjects((current) => current.map((subject) => subject.id !== subjectId ? subject : {
      ...subject,
      modules: subject.modules.map((courseModule) => courseModule.id !== moduleId ? courseModule : {
        ...courseModule,
        items: courseModule.items.map((item) => {
          if (item.id !== itemId) return item;
          const currentlyCompleted = item.lessons?.length
            ? item.lessons.every((lesson) => lesson.completed)
            : item.completed;
          const completed = !currentlyCompleted;
          return {
            ...item,
            completed,
            lessons: item.lessons?.map((lesson) => ({ ...lesson, completed }))
          };
        })
      })
    }));
  };

  const toggleLessonUnit = (
    subjectId: string,
    moduleId: string,
    itemId: string,
    lessonUnitId: string
  ) => {
    setSubjects((current) => current.map((subject) => subject.id !== subjectId ? subject : {
      ...subject,
      modules: subject.modules.map((courseModule) => courseModule.id !== moduleId ? courseModule : {
        ...courseModule,
        items: courseModule.items.map((item) => {
          if (item.id !== itemId || !item.lessons) return item;
          const lessons = item.lessons.map((lesson) => lesson.id === lessonUnitId
            ? { ...lesson, completed: !lesson.completed }
            : lesson
          );
          return { ...item, lessons, completed: lessons.every((lesson) => lesson.completed) };
        })
      })
    }));
  };

  const activeSubject = activeSubjects.find((subject) => subject.id === (pendingCapture?.subjectId ?? selectedSubjectId));
  const noteForSubjectsDialog = modal?.type === "note-subjects"
    ? safeSubjectNotesStore.documents.find((note) => note.id === modal.noteId)
    : undefined;
  const renderedAiWidth = Math.min(aiWidth, aiWidthLimit);

  return (
    <div className={`app-shell ${aiVisible ? "has-ai" : ""}`}>
      <Sidebar
        section={section}
        pageActive={safeSubjectNotesStore.activeDocumentId === null}
        aiVisible={aiVisible}
        profileName={account.displayName}
        onSectionChange={navigateToSection}
        onToggleAi={() => setAiVisible((value) => !value)}
      />

      <div className="main-workspace">
        <WorkspaceTabs
          section={section}
          documents={safeSubjectNotesStore.documents}
          openDocumentIds={safeSubjectNotesStore.openDocumentIds}
          activeDocumentId={safeSubjectNotesStore.activeDocumentId}
          onActivatePage={activateWorkspacePage}
          onActivateNote={handleActivateWorkspaceNote}
          onCloseNote={handleCloseWorkspaceNote}
          onOpenLibrary={() => setModal({ type: "note-library" })}
        />
        <div className="workspace-active-panel">
          {activeWorkspaceNote ? (
            <WorkspaceNotePage
              note={activeWorkspaceNote}
              subjects={activeSubjects}
              storageKey={storage.subjectNotes}
              onUpdateNote={handleUpdateWorkspaceNote}
              onOpenSubjects={(note) => setModal({ type: "note-subjects", noteId: note.id })}
              onDeleteNote={(note) => setModal({ type: "delete-subject-note", note })}
            />
          ) : (
          <Suspense fallback={(
          <main className="page section-loading" aria-live="polite" aria-busy="true">
            <span className="section-loading-spinner" aria-hidden="true" />
            <p>Ouverture de l’espace…</p>
          </main>
        )}>
          {section === "home" && (
          <HomePage
            displayName={account.displayName}
            subjects={activeSubjects}
            events={events}
            tasks={tasks}
            onNavigate={navigateToSection}
            onSelectSubject={handleSelectSubject}
            onToggleTask={(id) => setTasks((current) => current.map((task) => task.id === id ? {
              ...task,
              completed: !task.completed,
              completedAt: task.completed ? undefined : new Date().toISOString()
            } : task))}
            onOpenAi={() => setAiVisible(true)}
            onOpenEvent={handleOpenCalendarEvent}
          />
          )}
          {section === "calendar" && (
          <CalendarPage
            currentDate={calendarDate}
            view={calendarView}
            events={events}
            subjects={activeSubjects}
            onDateChange={setCalendarDate}
            onViewChange={setCalendarView}
            onNewEvent={(date) => setModal({ type: "event", date: date ?? calendarDate })}
            onOpenEvent={handleOpenCalendarEvent}
            onEditEvent={(event) => setModal({ type: "event", date: new Date(event.start), event })}
            onExportCalendar={() => setModal({ type: "calendar-export" })}
          />
          )}
          {section === "courses" && (
          <CoursesPage
            subjects={activeSubjects}
            conversations={courseConversationHistory}
            notes={safeSubjectNotesStore.documents}
            sidebarStorageKey={storage.notesCoursesSidebarOpen}
            provider={provider}
            selectedSubjectId={selectedSubjectId}
            pendingSubjectId={pendingCapture?.subjectId ?? null}
            onSelectSubject={handleSelectSubject}
            onSelectEnglishLevel={handleSelectEnglishLevel}
            onAddSubject={() => setModal({ type: "subject" })}
            onToggleProgramItem={toggleProgramItem}
            onToggleLessonUnit={toggleLessonUnit}
            onStartAi={startAiSession}
            onStartSubjectLesson={handleStartSubjectLesson}
            onStartLesson={handleStartLesson}
            onStartChapterTest={handleStartChapterTest}
            onOpenConversation={handleOpenConversation}
            onOpenNote={handleOpenWorkspaceNote}
            onOpenNoteLibrary={() => setModal({ type: "note-library" })}
            onCorrectAssessment={handleCorrectAssessment}
            onRecordAssessment={handleRecordAssessment}
            onEditConversation={(conversation) => setModal({ type: "conversation", conversation })}
            onDeleteConversation={(conversation) => setModal({ type: "delete-conversation", conversation })}
          />
          )}
          {section === "grades" && (
          <GradesPage
            assessments={assessments}
            subjects={activeSubjects}
            onAddAssessment={() => handleRecordAssessment()}
            onEditAssessment={(assessment) => setModal({ type: "assessment", assessment })}
            onDeleteAssessment={(assessment) => setModal({ type: "delete-assessment", assessment })}
            onOpenPdf={(assessment, variant) => void handleOpenAssessmentPdf(assessment, variant)}
            onOpenConversation={handleOpenAssessmentConversation}
          />
          )}
          {section === "tasks" && (
          <TasksPage
            tasks={tasks}
            subjects={activeSubjects}
            onToggle={(id) => setTasks((current) => current.map((task) => task.id === id ? {
              ...task,
              completed: !task.completed,
              completedAt: task.completed ? undefined : new Date().toISOString()
            } : task))}
            onAdd={() => setModal({ type: "task" })}
            onEdit={(task) => setModal({ type: "task", task })}
            onDelete={(task) => setModal({ type: "delete-task", task })}
          />
          )}
          {section === "settings" && (
          <SettingsPage
            account={account}
            profileStoragePrefix={`etude.profile.v1.${account.id}.`}
            provider={provider}
            aiWidth={renderedAiWidth}
            maxAiWidth={aiWidthLimit}
            subjects={subjects}
            events={events}
            conversations={conversations}
            freeChatConversations={freeChatConversations}
            subjectNotesStore={safeSubjectNotesStore}
            assessments={assessments}
            tasks={tasks}
            onProviderChange={handleProviderChange}
            onAiWidthChange={(width) => setAiWidth(clampAiPanelWidth(width, window.innerWidth))}
            onOpenAi={() => setAiVisible(true)}
            onGoogleWebProfileRemovalSettled={() => {
              cancelScheduledAiAction();
              pendingRef.current = null;
              setPendingCapture(null);
              setActiveLesson(null);
              setFreeChatActiveId(null);
              const restorePanel = aiVisible;
              setAiVisible(false);
              if (restorePanel) {
                window.setTimeout(() => setAiVisible(true), 0);
              }
            }}
            onLogout={() => {
              resetInProgressRef.current = true;
              void onLogout().catch((error) => {
                resetInProgressRef.current = false;
                addToast({
                  title: "Déconnexion impossible",
                  detail: String(error),
                  tone: "warning"
                });
              });
            }}
          />
          )}
          </Suspense>
          )}
        </div>

        {modal?.type === "note-library" && (
          <NoteLibraryDialog
            documents={safeSubjectNotesStore.documents}
            subjects={activeSubjects}
            onCreate={handleCreateWorkspaceNote}
            onOpen={handleOpenWorkspaceNote}
            onClose={() => setModal(null)}
          />
        )}
        {modal?.type === "note-subjects" && noteForSubjectsDialog && (
          <NoteSubjectsDialog
            note={noteForSubjectsDialog}
            subjects={activeSubjects}
            onChangeSubjectIds={(subjectIds) => handleUpdateWorkspaceNote(
              noteForSubjectsDialog.id,
              { subjectIds }
            )}
            onClose={() => setModal(null)}
          />
        )}
        <div id="workspace-modal-root" className="workspace-modal-root" />
      </div>

      <AiPanel
        visible={aiVisible}
        width={renderedAiWidth}
        provider={provider}
        activeSubject={activeSubject}
        pendingCapture={Boolean(pendingCapture)}
        activeLesson={activeLesson}
        freeChatConversations={freeChatConversations}
        setFreeChatConversations={setResetSafeFreeChatConversations}
        freeChatActiveId={freeChatActiveId}
        setFreeChatActiveId={setResetSafeFreeChatActiveId}
        freeChatStorageKeys={{
          config: storage.freeChatConfig,
          backend: storage.freeChatBackend
        }}
        onWidthChange={(width) => setAiWidth(clampAiPanelWidth(width, window.innerWidth))}
        onProviderChange={handleProviderChange}
        onClose={() => setAiVisible(false)}
        onOpen={() => setAiVisible(true)}
        onNewConversation={() => selectedSubjectId ? startAiSession(selectedSubjectId) : setAiVisible(true)}
        onAssociateCurrent={handleAssociateCurrent}
        onCopyLessonPrompt={() => void copyLessonPrompt()}
      />

      {modal?.type === "calendar-export" && (
        <CalendarExportModal
          events={events}
          subjects={activeSubjects}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "event" && (
        <EventEditor
          event={modal.event}
          date={modal.date}
          subjects={activeSubjects}
          onSave={saveEvent}
          onDelete={deleteEvent}
          onGeneratePaper={(event) => {
            const stored = setEvents((current) => current.some((item) => item.id === event.id)
              ? current.map((item) => item.id === event.id ? event : item)
              : [...current, event]);
            if (!stored) return;
            setModal({ type: "paper-assessment", event });
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "paper-assessment" && (
        <PaperAssessmentEditor
          event={modal.event}
          subjects={activeSubjects}
          onGenerate={handleGeneratePaperAssessment}
          onEditEvent={() => setModal({
            type: "event",
            date: new Date(modal.event.start),
            event: modal.event
          })}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "subject" && (
        <SubjectEditor
          onClose={() => setModal(null)}
          onSave={(subject) => {
            if (!setSubjects((current) => [...current, subject])) return;
            setSelectedSubjectId(subject.id);
            setModal(null);
            navigateToSection("courses");
            addToast({ title: "Matière ajoutée", detail: subject.name, tone: "success" });
          }}
        />
      )}
      {modal?.type === "conversation" && (
        <ConversationEditor
          conversation={modal.conversation}
          onClose={() => setModal(null)}
          onSave={(conversation) => {
            const stored = conversation.provider === "freechat" && conversation.localConversationId
              ? setFreeChatConversations((current) => current.map((item) =>
                item.id === conversation.localConversationId
                  ? {
                      ...item,
                      name: conversation.name,
                      note: conversation.note,
                      updatedAt: new Date().toISOString()
                    }
                  : item
              ))
              : setConversations((current) => current.map((item) => item.id === conversation.id ? conversation : item));
            if (!stored) return;
            setModal(null);
            addToast({ title: "Conversation mise à jour", tone: "success" });
          }}
        />
      )}
      {modal?.type === "link" && activeSubject && (
        <LinkConversationEditor
          subject={activeSubject}
          provider={provider}
          initialUrl={modal.initialUrl}
          onClose={() => setModal(null)}
          onSave={(url) => {
            if (storeConversation(activeSubject.id, provider, url, modal.capture ?? pendingCapture)) setModal(null);
            else addToast({ title: "Lien non reconnu", detail: `Utilisez un lien officiel valide pour ${providerLabel(provider)}.`, tone: "warning" });
          }}
        />
      )}
      {modal?.type === "task" && (
        <TaskEditor task={modal.task} subjects={activeSubjects} onClose={() => setModal(null)} onSave={(task) => {
          const stored = setTasks((current) => current.some((item) => item.id === task.id)
            ? current.map((item) => item.id === task.id ? task : item)
            : [...current, task]);
          if (!stored) return;
          setModal(null);
          addToast({ title: modal.task ? "Tâche mise à jour" : "Tâche ajoutée", tone: "success" });
        }} />
      )}
      {modal?.type === "delete-task" && (
        <ConfirmDialog
          title="Supprimer cette tâche ?"
          detail={`« ${modal.task.title} » sera retirée de votre liste.`}
          onClose={() => setModal(null)}
          onConfirm={() => {
            if (!setTasks((current) => current.filter((task) => task.id !== modal.task.id))) return;
            setModal(null);
            addToast({ title: "Tâche supprimée" });
          }}
        />
      )}
      {modal?.type === "assessment" && (
        <AssessmentEditor
          assessment={modal.assessment}
          initial={modal.initial}
          subjects={activeSubjects}
          onChoosePdf={chooseAssessmentPdf}
          onSave={saveAssessment}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "delete-assessment" && (
        <ConfirmDialog
          title="Supprimer cette évaluation ?"
          detail="La note, l’appréciation et les copies archivées dans Dowze Academie seront supprimées. Vos fichiers PDF d’origine ne seront pas modifiés."
          onClose={() => setModal(null)}
          onConfirm={async () => {
            const assessment = modal.assessment;
            const remainingAssessments = assessments.filter((item) => item.id !== assessment.id);
            try {
              // Retire d'abord la fiche de façon durable, puis nettoie ses copies.
              // L'ordre inverse pouvait perdre les PDF tout en conservant la note.
              localStorage.setItem(storage.assessments, JSON.stringify(remainingAssessments));
              setAssessments(remainingAssessments);
              setModal(null);
              try {
                await deleteAssessmentDocuments(account.id, assessment.id);
                addToast({ title: "Évaluation supprimée", tone: "success" });
              } catch (cleanupError) {
                addToast({
                  title: "Évaluation supprimée, nettoyage incomplet",
                  detail: `Des copies archivées peuvent rester sur l’appareil : ${String(cleanupError)}`,
                  tone: "warning"
                });
              }
            } catch (error) {
              addToast({
                title: "Suppression interrompue",
                detail: `La fiche et ses PDF ont été conservés : ${String(error)}`,
                tone: "warning"
              });
            }
          }}
        />
      )}
      {modal?.type === "delete-conversation" && (
        <ConfirmDialog
          title="Supprimer cette conversation ?"
          detail={modal.conversation.provider === "freechat"
            ? "La conversation Chat libre, ses messages, son nom et sa note seront supprimés définitivement de cet appareil."
            : "Le lien, son nom et sa note seront retirés de Dowze Academie. La conversation restera disponible chez le fournisseur IA."}
          onClose={() => setModal(null)}
          onConfirm={() => {
            let stored: boolean;
            if (modal.conversation.provider === "freechat" && modal.conversation.localConversationId) {
              const localId = modal.conversation.localConversationId;
              stored = setFreeChatConversations((current) => current.filter((item) => item.id !== localId));
              if (stored) setFreeChatActiveId((current) => current === localId ? null : current);
            } else {
              stored = setConversations((current) => current.filter((item) => item.id !== modal.conversation.id));
            }
            if (!stored) return;
            setModal(null);
            addToast({
              title: modal.conversation.provider === "freechat"
                ? "Conversation locale supprimée"
                : "Lien retiré de l’historique"
            });
          }}
        />
      )}
      {modal?.type === "delete-subject-note" && (
        <ConfirmDialog
          title="Supprimer cette note Markdown ?"
          detail={`« ${modal.note.title.trim() || "Sans titre"} » et tout son contenu seront supprimés définitivement de cet appareil.`}
          onClose={() => setModal(null)}
          onConfirm={() => {
            if (!setSubjectNotesStore((current) => deleteSubjectNote(
              normalizeSubjectNotesStore(current),
              modal.note.id
            ))) return;
            setModal(null);
            addToast({ title: "Note Markdown supprimée" });
          }}
        />
      )}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div className={`toast toast--${toast.tone ?? "default"}`} key={toast.id}>
            <span>{toast.tone === "success" ? <CheckCircle2 /> : <Info />}</span>
            <div><strong>{toast.title}</strong>{toast.detail && <small>{toast.detail}</small>}</div>
            <button aria-label={`Fermer la notification « ${toast.title} »`} onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}><X /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
