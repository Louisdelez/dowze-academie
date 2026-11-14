import {createNotebookSharedCollection} from './lib/notebookSharedCollection';
import {createManagedLibraryTrashAction} from './lib/notebookManagedLibraryActions';
import {invoke} from '@tauri-apps/api/core';
import {NotebookManagedControls} from './components/NotebookManagedControls';
import {createNotebookManagedApplication} from './lib/notebookManagedApplication';
import {createDesktopManagedNotebookMetadataBridge} from './lib/desktopManagedNotebookMetadata';
import {PAPER_TEXT_STYLE_DOCUMENT_CODEC} from './lib/notebookDocumentCodec';
import {createNativeManagedNotebookPort} from './lib/nativeManagedNotebookPort';
import {openNotebookStateDatabase} from '../pwa/src/storage';
import {useNativeNotebookScope} from './hooks/useNativeNotebookScope';
import type {PaperSearchNavigation,PaperSearchOpenRequest} from './lib/notebookSearchNavigation';
import {settleNotebookAccount,resumeNotebookAccount,disposeNotebookAccount,runNotebookOperation} from './lib/notebookSession';
import {serverAccountTransition} from './lib/server';
import { WorkspaceSearch } from './components/WorkspaceSearch';
import { CloudSyncStatus } from "./components/CloudSyncStatus";
import { DowzyMascot } from './components/DowzyMascot';
import { useSlimeProgress } from './hooks/useSlimeProgress';
import { SLIME_PROGRESS_ID, isSlimeProgress, mergeSlimeProgress } from './lib/slimeProgress';
import { appStorage } from "./lib/appStorage";
import { AppUpdateNotice } from './components/AppUpdateNotice';
import { isRecord, isStoredConversations, isStoredFreeChatConversations, isStoredAssessments } from "./lib/studyValidation";
import { listen } from "@tauri-apps/api/event";
import { useAccountLibrary } from "./hooks/useAccountLibrary";
import { useNativeAssetSync } from "./hooks/useNativeAssetSync";
import { useServerSync } from "./hooks/useServerSync";
import { sharedFormationManifest } from "./lib/sharedFormation";
import { canonical, type RemoteDocument, type SyncDocument } from "./lib/serverSync";
import {projectServerDocumentGroup,joinServerDocumentGroups} from "./lib/serverDocumentProjection";
import { CheckCircle2, Info, X } from "lucide-react";
import { strToU8, zipSync } from "fflate";
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
import { NotesWorkspace } from "./components/NotesWorkspace";
import { LEGACY_NOTE_ID } from "./lib/notebook";
import { nativeServerClient } from "./lib/nativeServerClient";
import {useNotebookSplitWorkspace} from './hooks/useNotebookSplitWorkspace';
import {NotebookSplitControls,NotebookSplitSeparator} from './components/NotebookSplitControls';
import type {CSSProperties} from 'react';
import { WorkspaceTabs } from "./components/WorkspaceTabs";
import { PersistentWorkspacePanel } from "./components/PersistentWorkspacePanel";
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
import { formationRecoveryKeys, formationStorageFor } from "./lib/profileStorage";
import {
  activateInstalledFormation,
  assessmentDocumentRecordId,
  installFormationFromPreview,
  updateSharedFormationManifest,
  loadFormationCatalog
} from "./lib/formationRegistry";
import {
  slugifyFormationName,
  validateAndCompileFormationPackage
} from "./lib/formations";
import type { FormationImportPreview, FormationPackageFilename, FormationManifest, InstalledFormation } from "./lib/formations";
import {
  buildFormationKitFiles,
  buildFormationTemplateFiles,
  formationTemplatePackageId,
  type FormationTemplateInput
} from "./lib/formationPrompts";
import {
  isStoredEvents,
  isStoredSubjects,
  isStoredTasks
} from "./lib/workspaceValidation";
import {
  buildNotebookLmContext,
  buildVideoSearchQuery,
  isFreeChatProvider,
  isLanguagePracticeProvider,
  isNotebookProvider,
  isStandaloneLearningProvider,
  isVideoProvider,
  supportsPromptInjection,
  videoSearchUrl
} from "./lib/learningProviders";
import {
  languagePracticeName,
  resolveGeneralLanguageCurriculum,
  resolveLanguageCurriculumRange
} from "./lib/languageCurriculum.ts";
import { clampAiPanelWidth, maxAiPanelWidth } from "./lib/layout";
import { calendarDateFromKey, dateKeyAtTimeZone } from "./lib/zonedDate";
import {
  currentAiUrl,
  deleteAssessmentDocuments,
  importAssessmentPdfs,
  isConversationUrl,
  isTauri,
  listenToAiNavigation,
  navigateAi,
  normalizeConversationUrl,
  openAssessmentPdf,
  pickFormationPackage,
  pickAssessmentPdf,
  providerHome,
  secureAiPanelForAccountTransition,
  providerLabel,
  saveFormationKitArchive,
  saveTextDocument,
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
const FormationsPage = lazy(() => import("./components/FormationsPage")
  .then((module) => ({ default: module.FormationsPage })));

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

const AI_PROVIDERS = new Set<AiProvider>([
  "chatgpt", "claude", "gemini", "mistral", "kimi",
  "freechat", "duolingo", "khanacademy", "youtube", "tiktok", "notebooklm"
]);
const CEFR_LEVELS = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);
function curriculumScopeForSubject(
  subject: Subject | undefined,
  courseModule?: Subject["modules"][number]
): string | undefined {
  if (!subject) return undefined;
  if (courseModule) {
    return resolveLanguageCurriculumRange(subject, [courseModule])?.curriculumScope;
  }
  return resolveGeneralLanguageCurriculum(subject)?.curriculumScope;
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
  if (!subject || subject.curriculumKind !== "cefr-selectable") return subject;
  return projectEnglishSubject(subject, cefrLevelFromScope(scope));
}
const CALENDAR_VIEWS = new Set<CalendarView>(["year", "month", "week", "day"]);


interface AppProps {
  account: LocalAccount;
  startupNotice?: Omit<ToastMessage, "id"> | null;
  onLogout: () => Promise<void>;
}

interface FormationWorkspaceAppProps extends AppProps {
  activeFormation: InstalledFormation;
  formations: readonly InstalledFormation[];
  onSharedManifest: (manifest: FormationManifest) => void;
  onActivateFormation: (formation: InstalledFormation) => Promise<void>;
  onChooseFormationPackage: () => Promise<FormationImportPreview | null>;
  onInstallFormationPreview: (preview: FormationImportPreview) => Promise<void>;
  onDownloadFormationKit: (input: FormationTemplateInput) => Promise<boolean>;
  onDownloadFormationTemplate: (filename: FormationPackageFilename, input: FormationTemplateInput) => Promise<boolean>;
}

function FormationWorkspaceApp({
  account,
  startupNotice,
  onLogout,
  activeFormation,
  formations,
  onActivateFormation,
  onSharedManifest,
  onChooseFormationPackage,
  onInstallFormationPreview,
  onDownloadFormationKit,
  onDownloadFormationTemplate
}: FormationWorkspaceAppProps) {
  const storage = useMemo(
    () => formationStorageFor(account.id, activeFormation),
    [account.id, activeFormation]
  );
  const notebookScope=useNativeNotebookScope(account.id,activeFormation.instanceId,storage.subjectNotes);
  const isLegacyFormation = activeFormation.storageKind === "legacy-energy-year1";
  const learningProviderContext = useMemo(() => ({
    legacyEnergyYear1: isLegacyFormation,
    teachingLanguage: activeFormation.manifest.pedagogy.teachingLanguage
  }), [activeFormation.manifest.pedagogy.teachingLanguage, isLegacyFormation]);
  const initialSubjects = isLegacyFormation ? defaultSubjects : [];
  const initialEvents = isLegacyFormation ? defaultEvents : [];
  const initialTasks = isLegacyFormation ? defaultTasks : [];
  const [section, setSection] = useState<AppSection>("home");
  const [loggingOut,setLoggingOut]=useState(false);
  const [subjects, setSubjects] = usePersistentState<Subject[]>(storage.subjects, initialSubjects, isStoredSubjects);
  const activeSubjects = useMemo(
    () => {
      if (isLegacyFormation) return projectSubjectsForActiveCurricula(subjects);
      const choices = activeFormation.manifest.choices;
      if (!choices?.selected) return subjects;
      const options = choices.groups.flatMap(group => group.options);
      const optional = new Set(options.flatMap(option => option.subjectIds));
      const selected = new Set(options.filter(option => choices.selected!.includes(option.id)).flatMap(option => option.subjectIds));
      return subjects.filter(subject => !optional.has(subject.id) || selected.has(subject.id));
    },
    [isLegacyFormation, subjects, activeFormation.manifest]
  );
  const [events, setEvents] = usePersistentState<CalendarEvent[]>(storage.events, initialEvents, isStoredEvents);
  const [tasks, setTasks] = usePersistentState<TaskItem[]>(storage.tasks, initialTasks, isStoredTasks);
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
  const [subjectNotesStore, setSubjectNotesStore, refreshSubjectNotesStore] = usePersistentState<PersistedSubjectNotesStore>(
    notebookScope.notesKey,
    EMPTY_SUBJECT_NOTES_STORE,
    isPersistedSubjectNotesStore,
    {readCurrentCacheForUpdates:true}
  );
  const [provider, setProvider] = usePersistentState<AiProvider>(
    storage.provider,
    "chatgpt",
    (value): value is AiProvider => typeof value === "string" && AI_PROVIDERS.has(value as AiProvider),
    { allowEphemeralOnError: true }
  );
  const [navigationCompact, setNavigationCompact] = usePersistentState(`${storage.aiWidth}.navigationCompact`, false);
  const [aiVisible, setAiVisible] = usePersistentState(
    storage.aiVisible,
    false,
    undefined,
    { allowEphemeralOnError: true }
  );
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const searchShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !event.altKey) {
        if (document.querySelector('[role="dialog"]')) return;
        event.preventDefault(); setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', searchShortcut);
    return () => window.removeEventListener('keydown', searchShortcut);
  }, []);
  const [formationSwitching, setFormationSwitching] = useState(false);
  const [aiWidth, setAiWidth] = usePersistentState(
    storage.aiWidth,
    440,
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 360 && value <= 680,
    { allowEphemeralOnError: true }
  );
  const [aiWidthLimit, setAiWidthLimit] = useState(() => maxAiPanelWidth(window.innerWidth));
  const [selectedSubjectId, setSelectedSubjectId] = usePersistentState<string | null>(
    storage.selectedSubject,
    initialSubjects[0]?.id ?? null,
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
    const { startDate, endDate } = activeFormation.manifest.academicYear;
    const timeZone = activeFormation.manifest.timeZone;
    const currentKey = dateKeyAtTimeZone(now, timeZone);
    const selectedKey = currentKey >= startDate && currentKey <= endDate
      ? currentKey
      : startDate;
    return calendarDateFromKey(selectedKey, timeZone);
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
  const [sharedDocuments, setSharedDocuments] = usePersistentState<SyncDocument[]>(
    `${storage.subjectNotes}.shared-documents.v1`, [],
    (value): value is SyncDocument[] => Array.isArray(value) && value.every(item => isRecord(item) &&
      ['whiteboard', 'formation', 'preferences'].includes(String(item.type)) && typeof item.id === 'string' && isRecord(item.content))
  );
  const [slimeProgress, setSlimeProgress] = useSlimeProgress(account.id, activeFormation.packageId, subjects, tasks, assessments);
  // Each group follows the same immutable React inputs as the former single
  // projection. A note title must not rewalk the unchanged formation/program.
  const sharedServerDocuments = useMemo(() => projectServerDocumentGroup(
    sharedDocuments.filter(item => !(item.type === 'preferences' && item.id === SLIME_PROGRESS_ID))
  ), [sharedDocuments]);
  const slimeServerDocuments = useMemo(() => projectServerDocumentGroup([
    { type: 'preferences' as const, id: SLIME_PROGRESS_ID, content: { ...slimeProgress } }
  ]), [slimeProgress]);
  const formationServerDocuments = useMemo(() => projectServerDocumentGroup(
    !sharedDocuments.some(item => item.type === 'formation' && item.id === activeFormation.packageId)
      ? [{ type: 'formation' as const, id: activeFormation.packageId, content: { schema: 1, manifest: activeFormation.manifest, subjectIds: subjects.map(subject => subject.id) } }] : []
  ), [activeFormation, sharedDocuments, subjects]);
  const taskServerDocuments = useMemo(() => projectServerDocumentGroup(
    tasks.map(task => ({ type: 'tasks' as const, id: task.id, content: { ...task } }))
  ), [tasks]);
  const conversationServerDocuments = useMemo(() => projectServerDocumentGroup([
    ...conversations.map(conversation => ({ type: 'conversations' as const, id: `web-${conversation.id}`, content: { kind: 'web', conversation } })),
    ...freeChatConversations.map(conversation => ({ type: 'conversations' as const, id: `chat-${conversation.id}`, content: { kind: 'chat', conversation } }))
  ]), [conversations, freeChatConversations]);
  const noteServerDocuments = useMemo(() => projectServerDocumentGroup(
    safeSubjectNotesStore.documents.map(note => ({ type: 'notesMarkdown' as const, id: note.id, content: { ...note } }))
  ), [safeSubjectNotesStore]);
  const planningServerDocuments = useMemo(() => projectServerDocumentGroup(
    events.map(event => ({ type: 'planning' as const, id: event.id, content: { ...event } }))
  ), [events]);
  const progressionServerDocuments = useMemo(() => projectServerDocumentGroup(
    subjects.map(subject => ({ type: 'progression' as const, id: subject.id, content: { ...subject } }))
  ), [subjects]);
  const assessmentServerDocuments = useMemo(() => projectServerDocumentGroup(
    assessments.map(assessment => ({ type: 'examens' as const, id: assessment.id, content: { ...assessment } }))
  ), [assessments]);
  const serverProjection = useMemo(() => joinServerDocumentGroups([
    sharedServerDocuments, slimeServerDocuments, formationServerDocuments,
    taskServerDocuments, conversationServerDocuments, noteServerDocuments,
    planningServerDocuments, progressionServerDocuments, assessmentServerDocuments
  ]), [sharedServerDocuments, slimeServerDocuments, formationServerDocuments,
    taskServerDocuments, conversationServerDocuments, noteServerDocuments,
    planningServerDocuments, progressionServerDocuments, assessmentServerDocuments]);
  const serverDocuments = serverProjection.documents;
  const applyServerDocument = useCallback((remote: RemoteDocument): boolean => {
    const id = remote.document_id, value = remote.content;
    if (remote.document_type === 'preferences' && id === SLIME_PROGRESS_ID) {
      if (remote.deleted || !isSlimeProgress(value)) return false;
      return setSlimeProgress(current => mergeSlimeProgress(current, value));
    }
    if (remote.document_type === 'tasks') {
      if (!remote.deleted && (!value || value.id !== id || !isStoredTasks([value]))) return false;
      return setTasks(current => remote.deleted ? current.filter(item => item.id !== id) : [...current.filter(item => item.id !== id), value as unknown as TaskItem]);
    }
    if (remote.document_type === 'conversations') {
      if (id.startsWith('web-')) {
        const originalId = id.slice(4);
        if (!remote.deleted && (!value || value.kind !== 'web' || !isStoredConversations([value.conversation]) || (value.conversation as Conversation).id !== originalId)) return false;
        return setConversations(current => remote.deleted ? current.filter(item => item.id !== originalId) : [...current.filter(item => item.id !== originalId), value!.conversation as Conversation]);
      }
      if (id.startsWith('chat-')) {
        const originalId = id.slice(5);
        if (!remote.deleted && (!value || value.kind !== 'chat' || !isStoredFreeChatConversations([value.conversation]) || (value.conversation as StoredFreeChatConversation).id !== originalId)) return false;
        return setFreeChatConversations(current => remote.deleted ? current.filter(item => item.id !== originalId) : [...current.filter(item => item.id !== originalId), value!.conversation as StoredFreeChatConversation]);
      }
      return false;
    }
    if (remote.document_type === 'formation' && !remote.deleted) {
      const manifest = sharedFormationManifest(value);
      if (!manifest || manifest.id !== id) return false;
      if (id === activeFormation.packageId && activeFormation.storageKind === 'formation-v1' && canonical(manifest) !== canonical(activeFormation.manifest)) {
        onSharedManifest(manifest);
      }
    }
    if (['whiteboard', 'formation', 'preferences'].includes(remote.document_type)) {
      if (!remote.deleted && !isRecord(value)) return false;
      return setSharedDocuments(current => {
        const remaining = current.filter(item => item.type !== remote.document_type || item.id !== id);
        return remote.deleted ? remaining : [...remaining, { type: remote.document_type, id, content: value! }];
      });
    }
    if (remote.document_type === 'notesMarkdown') {
      if (!remote.deleted && (!value || typeof value.markdown !== 'string' || typeof value.title !== 'string')) return false;
      let valid = true;
      const stored = setSubjectNotesStore(current => {
        const normalized = normalizeSubjectNotesStore(current);
        if (remote.deleted) return deleteSubjectNote(normalized, id);
        const old = normalized.documents.find(note => note.id === id);
        const now = new Date().toISOString();
        const note = { id, title: value!.title, markdown: value!.markdown,
          subjectIds: value!.subjectIds ?? old?.subjectIds ?? [], tags: value!.tags ?? old?.tags ?? [],
          createdAt: value!.createdAt ?? old?.createdAt ?? now, updatedAt: value!.updatedAt ?? now };
        const next = { ...normalized, documents: [...normalized.documents.filter(note => note.id !== id), note] };
        if (!isPersistedSubjectNotesStore(next)) { valid = false; return current; }
        return next;
      });
      return valid && stored;
    }
    if (remote.document_type === 'planning') {
      if (!remote.deleted && (!value || value.id !== id || !isStoredEvents([value]))) return false;
      return setEvents(current => remote.deleted ? current.filter(item => item.id !== id) : [...current.filter(item => item.id !== id), value as unknown as CalendarEvent]);
    }
    if (remote.document_type === 'progression') {
      if (!remote.deleted && (!value || value.id !== id || !isStoredSubjects([value]))) return false;
      return setSubjects(current => remote.deleted ? current.filter(item => item.id !== id) : [...current.filter(item => item.id !== id), value as unknown as Subject]);
    }
    if (remote.document_type === 'examens') {
      if (!remote.deleted && (!value || value.id !== id || !isStoredAssessments([value]))) return false;
      return setAssessments(current => remote.deleted ? current.filter(item => item.id !== id) : [...current.filter(item => item.id !== id), value as unknown as AssessmentRecord]);
    }
    return false;
  }, [activeFormation, onSharedManifest, setSlimeProgress, setSharedDocuments, setTasks, setConversations, setFreeChatConversations, setSubjectNotesStore, setEvents, setSubjects, setAssessments]);
  const pristineDocument = useCallback((document: SyncDocument) => {
    if (!isLegacyFormation) return false;
    const original = document.type === 'progression' ? defaultSubjects.find(item => item.id === document.id)
      : document.type === 'planning' ? defaultEvents.find(item => item.id === document.id)
      : document.type === 'tasks' ? defaultTasks.find(item => item.id === document.id) : undefined;
    return original !== undefined && canonical(original) === canonical(document.content);
  }, [isLegacyFormation]);
  const serverSync = useServerSync(account.id, activeFormation, serverDocuments, applyServerDocument, pristineDocument,notebookScope.prepareTarget,serverProjection.signature);
  const notebookApi = useMemo(() => serverSync.linked ? nativeServerClient(account.id,serverSync.linked.id) : undefined,[account.id,serverSync.linked?.id]);
  const notebookMedia = useMemo(() => ({api:serverSync.linked?.id===notebookScope.identity.accountId&&serverSync.remoteSpace===notebookScope.identity.spaceId?notebookApi:undefined,accountId:notebookScope.identity.accountId,spaceId:notebookScope.identity.spaceId}),[notebookApi,serverSync.remoteSpace,serverSync.linked?.id,notebookScope.identity.accountId,notebookScope.identity.spaceId]);
  const notebookOperationScope=useRef('');notebookOperationScope.current=`${notebookMedia.accountId}|${notebookMedia.spaceId}|${notebookScope.notesKey}`;
  const notebookWriteIdentity=JSON.stringify([notebookMedia.accountId,notebookMedia.spaceId,notebookScope.notesKey]);
  const notebookWriteEpochRef=useRef({identity:notebookWriteIdentity,value:0});
  if(notebookWriteEpochRef.current.identity!==notebookWriteIdentity)notebookWriteEpochRef.current={identity:notebookWriteIdentity,value:notebookWriteEpochRef.current.value+1};
  const notebookWriteEpoch=notebookWriteEpochRef.current.value;
  const notebookOperationAlive=useRef(true);useEffect(()=>{notebookOperationAlive.current=true;return()=>{notebookOperationAlive.current=false;};},[]);
  const notebookExportSourceRef=useRef({identity:notebookWriteIdentity,api:notebookMedia.api,profileId:account.id,ready:notebookScope.ready,closing:loggingOut});
  if(notebookExportSourceRef.current.identity!==notebookWriteIdentity||notebookExportSourceRef.current.api!==notebookMedia.api||notebookExportSourceRef.current.profileId!==account.id||notebookExportSourceRef.current.ready!==notebookScope.ready||notebookExportSourceRef.current.closing!==loggingOut)notebookExportSourceRef.current={identity:notebookWriteIdentity,api:notebookMedia.api,profileId:account.id,ready:notebookScope.ready,closing:loggingOut};
  const notebookExportSource=notebookExportSourceRef.current;
  const notebookManagedNotesRef=useRef(safeSubjectNotesStore.documents);notebookManagedNotesRef.current=safeSubjectNotesStore.documents;
  const notebookManagedCurrent=()=>notebookOperationAlive.current&&notebookExportSourceRef.current===notebookExportSource&&notebookExportSource.ready&&!notebookExportSource.closing&&!serverAccountTransition(notebookExportSource.profileId);
  const createNotebookManaged=(componentCurrent:()=>boolean)=>{
   const source=notebookExportSource,api=notebookMedia.api,current=()=>componentCurrent()&&notebookManagedCurrent();
   if(!current()||!api)throw Error('Connectez le compte de cette note avant sa synchronisation.');
   const metadata=createDesktopManagedNotebookMetadataBridge({scope:{accountId:notebookMedia.accountId,spaceId:notebookMedia.spaceId},notesKey:notebookScope.notesKey,sourceRef:source,currentSource:()=>notebookExportSourceRef.current,currentNote:id=>notebookManagedNotesRef.current.find(note=>note.id===id),openDatabase:openNotebookStateDatabase});
   return createNotebookManagedApplication({scope:{accountId:notebookMedia.accountId,spaceId:notebookMedia.spaceId},api,current,currentApi:()=>notebookExportSourceRef.current.api??api,openDatabase:openNotebookStateDatabase,captureDesktopMetadata:metadata.capture,prepareDesktopMetadata:metadata.preparePrivate,mirrorDesktopMetadata:metadata.mirror,disposeMetadata:metadata.dispose,openPort:checked=>createNativeManagedNotebookPort({documentCodec:PAPER_TEXT_STYLE_DOCUMENT_CODEC,enabled:import.meta.env.VITE_DOWZE_MANAGED_NATIVE_VALIDATED==='1',accountId:source.profileId,serverAccountId:notebookMedia.accountId,api,current:checked,currentApi:()=>notebookExportSourceRef.current.api??api,commands:{invoke:(command,args)=>invoke(command,args)}})});
  };
  const notebookCollection=notebookMedia.api?{source:notebookExportSource,current:notebookManagedCurrent,create:(view:'owned'|'outgoing'|'incoming',componentCurrent:()=>boolean)=>{const source=notebookExportSource,api=notebookMedia.api,current=()=>componentCurrent()&&notebookManagedCurrent();if(!current()||!api)throw Error('Connectez ce compte pour retrouver les notes partagées.');return createNotebookSharedCollection({scope:{accountId:notebookMedia.accountId,spaceId:notebookMedia.spaceId},view,api,current,currentApi:()=>notebookExportSourceRef.current.api??api,openPort:checked=>createNativeManagedNotebookPort({documentCodec:PAPER_TEXT_STYLE_DOCUMENT_CODEC,enabled:import.meta.env.VITE_DOWZE_MANAGED_NATIVE_VALIDATED==='1',accountId:source.profileId,serverAccountId:notebookMedia.accountId,api,current:checked,currentApi:()=>notebookExportSourceRef.current.api??api,commands:{invoke:(command,args)=>invoke(command,args)}})});}}:undefined;
  const notebookManagedTrash=notebookMedia.api?createManagedLibraryTrashAction({scope:{accountId:notebookMedia.accountId,spaceId:notebookMedia.spaceId},current:notebookManagedCurrent,create:createNotebookManaged}):undefined;
  const notebookManagedControls=notebookMedia.api?<NotebookManagedControls source={notebookExportSource} current={notebookManagedCurrent} notes={safeSubjectNotesStore.documents} create={createNotebookManaged} onChanged={async()=>{if(notebookManagedCurrent())await refreshSubjectNotesStore();}}/>:undefined;

  const [notebookSearchNavigation,setNotebookSearchNavigation]=useState<PaperSearchNavigation|null>(null);
  const activeWorkspaceNote = useMemo(
    () => notebookScope.ready?activeNoteDocument(safeSubjectNotesStore):undefined,
    [safeSubjectNotesStore,notebookScope.ready]
  );
  const splitNotes=useNotebookSplitWorkspace(notebookMedia,activeWorkspaceNote?.id,safeSubjectNotesStore.documents.map(note=>note.id),safeSubjectNotesStore.openDocumentIds);
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
    const captured = `${notebookMedia.accountId}|${notebookMedia.spaceId}|${notebookScope.notesKey}`;
    if (!notebookOperationAlive.current || notebookWriteEpochRef.current.value !== notebookWriteEpoch || notebookOperationScope.current !== captured || serverAccountTransition(account.id)) return;
    // An unopened workspace has no note to deactivate. Keep an absent cache
    // absent while the notebook scope captures its original metadata.
    if (appStorage.getItem(notebookScope.notesKey) === null) return;
    setSubjectNotesStore((current) => {
      const normalized = normalizeSubjectNotesStore(current);
      return normalized.activeDocumentId === null ? current : { ...normalized, activeDocumentId: null };
    });
  }, [account.id, notebookMedia.accountId, notebookMedia.spaceId, notebookScope.notesKey, notebookWriteEpoch, setSubjectNotesStore]);

  const navigateToSection = useCallback((nextSection: AppSection) => {
    setSection(nextSection === "drawing" ? "notes" : nextSection);
    activateWorkspacePage();
    window.requestAnimationFrame(() => document.getElementById("workspace-content")?.focus({ preventScroll: true }));
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

  const handleActivateFormation = useCallback(async (formation: InstalledFormation) => {
    if (formation.instanceId === activeFormation.instanceId) return;
    setFormationSwitching(true);
    cancelScheduledAiAction();
    pendingRef.current = null;
    setPendingCapture(null);
    setActiveLesson(null);
    setModal(null);
    try {
      await Promise.all([...pendingPdfOperationsRef.current]);
      await secureAiPanelForAccountTransition("chatgpt");
      await onActivateFormation(formation);
    } finally {
      setFormationSwitching(false);
    }
  }, [activeFormation.instanceId, cancelScheduledAiAction, onActivateFormation]);

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
    if (!isLegacyFormation) return;
    setSubjects((current) => hydratePersistedSubjects(current));
  }, [isLegacyFormation, setSubjects]);

  // Le planning v1 réserve désormais 08:30–09:00 à l’anglais. La migration
  // conserve les événements personnels et ne remplace que les anciens horaires
  // canoniques restés intacts. Le marqueur empêche de recréer ensuite un cours
  // que l’utilisateur aurait volontairement supprimé.
  useEffect(() => {
    if (!isLegacyFormation) return;
    if (academicScheduleRevision >= ACADEMIC_SCHEDULE_REVISION) return;
    const stored = setEvents((current) => hydratePersistedEvents(current));
    if (stored) setAcademicScheduleRevision(ACADEMIC_SCHEDULE_REVISION);
  }, [academicScheduleRevision, isLegacyFormation, setAcademicScheduleRevision, setEvents]);

  const addToast = useCallback((message: Omit<ToastMessage, "id">) => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current, { ...message, id }]);
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 4200);
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    const listening = listen<string>("capture-save-error", event => {
      if (!disposed) addToast({ title: "Fermeture suspendue", detail: event.payload, tone: "warning" });
    });
    return () => { disposed = true; void listening.then(unlisten => unlisten()); };
  }, [addToast]);

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
          const imported = await importAssessmentPdfs(
            account.id,
            assessmentDocumentRecordId(activeFormation, assessment.id),
            { blank, completed }
          );
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
    const source=notebookExportSource;
    const current=()=>notebookOperationAlive.current&&notebookExportSourceRef.current===source&&source.ready&&!source.closing&&!serverAccountTransition(source.profileId);
    if(!current())return false;
    const apiCurrent=notebookMedia.api?.captureSessionAuthority(notebookMedia.accountId);
    if(!current()||apiCurrent&&!apiCurrent())return false;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    return setSubjectNotesStore((current) => createSubjectNote(
      normalizeSubjectNotesStore(current),
      { id, now }
    ).store);
  }, [notebookExportSource,notebookMedia,setSubjectNotesStore]);

  const handleWorkspaceDuplicate=useCallback(async(id:string,resume:boolean,presentationCurrent:()=>boolean=()=>true,history?:import('./lib/paperHistoryVersions').PaperHistorySelection)=>{
    const source=notebookExportSource,key=notebookScope.notesKey;
    const viewCurrent=()=>notebookOperationAlive.current&&notebookExportSourceRef.current===source&&source.ready&&!source.closing&&!serverAccountTransition(source.profileId)&&(!history||presentationCurrent());
    if(!viewCurrent())throw Error('Ouvrez votre carnet avant de copier une note.');
    const apiCurrent=notebookMedia.api?.captureSessionAuthority(notebookMedia.accountId),current=()=>viewCurrent()&&(!apiCurrent||apiCurrent());
    if(!current())throw Error('La connexion a changé avant la copie.');
    const m=await import('./lib/notebookDuplicatePublication');if(!current())throw Error('Le carnet a changé avant la copie.');
    const metadata=m.desktopNotebookDuplicateMetadata(appStorage,key);
    const note=await (resume?m.resumeNotebookDuplicatePublication(id,notebookMedia,metadata,current):m.createNotebookDuplicate(id,notebookMedia,metadata,current,history));
    if(!current())return;
    if(!history&&presentationCurrent())await m.openDesktopNotebookDuplicate(appStorage,key,note.id,()=>current()&&presentationCurrent());
    if(!current())return;
    await refreshSubjectNotesStore();
  },[notebookExportSource,notebookScope.notesKey,notebookMedia,refreshSubjectNotesStore]);
  const handleDuplicateWorkspaceNote=useCallback((id:string,current?:()=>boolean,history?:import('./lib/paperHistoryVersions').PaperHistorySelection)=>handleWorkspaceDuplicate(id,false,current,history),[handleWorkspaceDuplicate]);
  const handleResumeWorkspaceDuplicate=useCallback((id:string,current?:()=>boolean)=>handleWorkspaceDuplicate(id,true,current),[handleWorkspaceDuplicate]);

  const handleExportWorkspaceNotes=useCallback(async(selectedIds:readonly string[])=>{
    const source=notebookExportSource,metadataKey=notebookScope.notesKey;
    const viewCurrent=()=>notebookOperationAlive.current&&notebookExportSourceRef.current===source&&source.ready&&!source.closing&&!serverAccountTransition(source.profileId);
    if(!viewCurrent())throw Error('Ouvrez votre carnet avant cet export.');
    const apiCurrent=notebookMedia.api?.captureSessionAuthority(notebookMedia.accountId);
    const current=()=>viewCurrent()&&(!apiCurrent||apiCurrent());
    if(!current())throw Error('La connexion a changé avant l’export.');
    const ids=[...selectedIds];
    const {preparePaperNotebookBundle}=await import('./lib/paperNotebookBundle');if(!current())throw Error('Le carnet a changé avant l’export.');
    const prepared=await preparePaperNotebookBundle({media:notebookMedia,selectedIds:ids,current,metadata:{current,read:async(id:string)=>{
      const raw=await appStorage.readCurrentItem(metadataKey);if(!current())throw Error('Le carnet a changé pendant l’export.');
      const value:unknown=raw===null?null:JSON.parse(raw);if(!isPersistedSubjectNotesStore(value))throw Error('Les métadonnées du carnet doivent être récupérées avant cet export.');
      return normalizeSubjectNotesStore(value).documents.find(note=>note.id===id);
    }}});
    const saved=await prepared.save();if(saved&&current())addToast({title:isTauri()?'Collection enregistrée':'Téléchargement demandé',detail:`${prepared.manifest.notes.length} notes enregistrées dans une collection ZIP. Chaque fichier .dowze peut être importé séparément.`,tone:'success'});
  },[notebookExportSource,notebookMedia,notebookScope.notesKey,addToast]);

  const handleArchiveWorkspaceNote=useCallback(async(input:File|string)=>runNotebookOperation(notebookMedia.accountId,async()=>{
    const captured=notebookOperationScope.current,current=()=>notebookOperationAlive.current&&notebookOperationScope.current===captured&&!serverAccountTransition(account.id),metadataKey=notebookScope.notesKey;
    const m=await import('./lib/importNotebookArchive');const id=typeof input==='string'?input:crypto.randomUUID();
    const note=typeof input==='string'?(await m.readNotebookArchiveImport(id,notebookMedia)).note:await m.stageNotebookArchive(input,id,notebookMedia,current);
    const merge=()=>{const raw=appStorage.getItem(metadataKey);const parsed=raw?JSON.parse(raw):EMPTY_SUBJECT_NOTES_STORE;if(!isPersistedSubjectNotesStore(parsed))throw Error('Votre carnet doit être récupéré avant de terminer l’importation.');const store=normalizeSubjectNotesStore(parsed);return {...store,documents:store.documents.some(n=>n.id===id)?store.documents:[note,...store.documents]};};
    let committed=false;for(let attempt=0;attempt<3;attempt++){if(!current())throw Error('Le carnet a changé pendant l’importation.');const prepared=JSON.stringify(merge());appStorage.setItem(metadataKey,prepared);await appStorage.flush();if(current()&&appStorage.getItem(metadataKey)===prepared){committed=true;break;}}
    if(!committed)throw Error('L’importation est conservée. Reprenez sa finalisation après votre modification.');
    await m.confirmNotebookArchiveMetadata(id,notebookMedia,current);await m.activateNotebookArchive(id,notebookMedia,current);if(!current())throw Error('L’importation a été conservée dans son carnet d’origine.');
    if(!setSubjectNotesStore(()=>openSubjectNote(merge(),id)))throw Error('Les onglets de l’importation attendent leur enregistrement.');await appStorage.flush();
  }),[account.id,notebookMedia,notebookScope.notesKey,setSubjectNotesStore]);
  const handleImportWorkspaceArchive=useCallback((file:File)=>handleArchiveWorkspaceNote(file),[handleArchiveWorkspaceNote]);
  const handleResumeWorkspaceArchive=useCallback((id:string)=>handleArchiveWorkspaceNote(id),[handleArchiveWorkspaceNote]);

  const handleOpenWorkspaceNote = useCallback((noteId: string,search?:PaperSearchOpenRequest) => {
    const source=notebookExportSource;
    const sourceCurrent=()=>notebookOperationAlive.current&&notebookExportSourceRef.current===source&&source.ready&&!source.closing&&!serverAccountTransition(source.profileId);
    if(!sourceCurrent())return false;
    const apiCurrent=search?notebookMedia.api?.captureSessionAuthority(notebookMedia.accountId):undefined;
    const current=()=>sourceCurrent()&&(!apiCurrent||apiCurrent());
    if(!current()||search&&search.hit.binding?.noteId!==noteId)return false;
    if(!splitNotes.beforeActivate(noteId))return false;
    const opened=setSubjectNotesStore((store) => openSubjectNote(
      normalizeSubjectNotesStore(store),
      noteId
    ));
    if(opened&&current())setNotebookSearchNavigation(search?{...search,requestId:crypto.randomUUID(),current}:null);
    return opened;
  }, [setSubjectNotesStore,splitNotes,notebookExportSource,notebookMedia]);

  const handleActivateWorkspaceNote = useCallback((noteId: string) => {
    if(!splitNotes.beforeActivate(noteId))return;
    setSubjectNotesStore((current) => activateSubjectNote(
      normalizeSubjectNotesStore(current),
      noteId
    ));
  }, [setSubjectNotesStore,splitNotes]);

  const handleCloseWorkspaceNote = useCallback((noteId: string) => {
    if(noteId===splitNotes.secondaryId)splitNotes.close();
    setSubjectNotesStore((current) => closeSubjectNote(
      normalizeSubjectNotesStore(current),
      noteId
    ));
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(".workspace-tab.is-active")?.focus();
    });
  }, [setSubjectNotesStore,splitNotes]);

  const handleUpdateWorkspaceNote = useCallback(async (
    noteId: string,
    patch: Partial<Pick<SubjectNoteDocument, "title" | "markdown" | "tags" | "subjectIds">>,
    expected?:{expectedMarkdown:string}
  ) => {
    const captured=`${notebookMedia.accountId}|${notebookMedia.spaceId}|${notebookScope.notesKey}`;
    const current=()=>notebookOperationAlive.current&&notebookWriteEpochRef.current.value===notebookWriteEpoch&&notebookOperationScope.current===captured&&!serverAccountTransition(account.id);
    if(!current())return false;
    let accepted=true;
    const stored=setSubjectNotesStore(value=>{
      const normalized=normalizeSubjectNotesStore(value),note=normalized.documents.find(item=>item.id===noteId);
      if(!note||expected&&note.markdown!==expected.expectedMarkdown){accepted=false;return value;}
      return updateSubjectNote(normalized,noteId,patch);
    });
    if(!stored||!accepted)return false;
    try{await appStorage.flush();return current();}catch{return false;}
  }, [account.id,notebookMedia,notebookScope.notesKey,notebookWriteEpoch,setSubjectNotesStore]);

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
    if (isStandaloneLearningProvider(targetProvider)) return false;
    const content = isVideoProvider(targetProvider)
      ? subject ? buildVideoSearchQuery(targetProvider, subject, lesson, learningProviderContext) : ""
      : isNotebookProvider(targetProvider)
        ? subject ? buildNotebookLmContext(subject, lesson, learningProviderContext) : ""
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
            detail: `Tu peux la coller avec Ctrl/⌘V si ${modeCopy.subjectLabel.toLocaleLowerCase("fr")} ne démarre pas automatiquement.`,
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
  }, [activeLesson, activeSubjects, addToast, learningProviderContext, provider, selectedSubjectId]);

  const startAiSession = useCallback((subjectId: string, forcedProvider = provider) => {
    cancelScheduledAiAction();
    const subject = activeSubjects.find((candidate) => candidate.id === subjectId);
    if (!subject) {
      addToast({ title: "Matière introuvable", tone: "warning" });
      return;
    }
    if (subject.curriculumKind === "cefr-selectable" && !subject.cefrLevel) {
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
      setActiveLesson(createActiveLesson(subject, undefined, undefined, {
        formation: activeFormation.manifest
      }));
      addToast({
        title: `Chat libre — ${subject.shortName}`,
        detail: "Choisis une API personnelle ou un modèle Ollama local, puis démarre une conversation.",
        tone: "success"
      });
      return;
    }

    if (isStandaloneLearningProvider(forcedProvider)) {
      pendingRef.current = null;
      setPendingCapture(null);
      addToast({
        title: `${providerLabel(forcedProvider)} ouvert`,
        detail: isLanguagePracticeProvider(forcedProvider)
          ? `Ta pratique de la langue « ${languagePracticeName(subject)} » est prête. Aucune consigne de cours n’est envoyée à Duolingo.`
          : "La plateforme pédagogique officielle est prête. Aucune consigne de cours n’est envoyée à Khan Academy.",
        tone: "success"
      });
      scheduleAiAction(() => {
        void navigateAi(providerHome(forcedProvider)).catch((error) => {
          addToast({ title: `Impossible d’ouvrir ${providerLabel(forcedProvider)}`, detail: String(error), tone: "warning" });
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
      const searchUrl = videoSearchUrl(forcedProvider, subject, undefined, learningProviderContext);
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
        detail: "Crée ou ouvre un notebook, ajoute tes sources, puis colle le contexte avec Ctrl/⌘V.",
        tone: "success"
      });
    }

    scheduleAiAction(() => {
      if (pendingRef.current?.token !== nextPending.token) return;
      void navigateAi(providerHome(forcedProvider)).catch((error) => {
        addToast({ title: "Impossible d’ouvrir la nouvelle session", detail: String(error), tone: "warning" });
      });
    }, 260);
  }, [activeSubjects, addToast, cancelScheduledAiAction, copyLessonPrompt, learningProviderContext, provider, scheduleAiAction, setAiVisible, setProvider, setSelectedSubjectId, storeConversation]);

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

    if (isStandaloneLearningProvider(forcedProvider)) {
      pendingRef.current = null;
      setPendingCapture(null);
      addToast({
        title: `${providerLabel(forcedProvider)} ouvert`,
        detail: isLanguagePracticeProvider(forcedProvider)
          ? `Cette pratique de la langue « ${languagePracticeName(subject)} » reste indépendante de la séance Dowze Academie : aucune consigne n’est copiée ou envoyée.`
          : "Khan Academy reste indépendant de la séance Dowze Academie : aucune consigne n’est copiée ou envoyée.",
        tone: "success"
      });
      scheduleAiAction(() => {
        void navigateAi(providerHome(forcedProvider)).catch((error) => {
          addToast({ title: `Impossible d’ouvrir ${providerLabel(forcedProvider)}`, detail: String(error), tone: "warning" });
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
      const searchUrl = videoSearchUrl(forcedProvider, subject, lesson, learningProviderContext);
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
        detail: "Crée ou ouvre le notebook de cette séance, ajoute les sources utiles, puis colle le contexte avec Ctrl/⌘V.",
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
          detail: `L’insertion automatique a échoué (${String(error)}). Utilise Ctrl/⌘V dans le panneau IA.`,
          tone: "warning"
        });
      });
    }, 320);
  }, [account.id, addToast, cancelScheduledAiAction, copyLessonPrompt, learningProviderContext, provider, scheduleAiAction, setAiVisible, setProvider, setSelectedSubjectId, storeConversation, subjects]);

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
              lessonMode: localConversation.lessonMode as LessonMode,
              formation: activeFormation.manifest
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
        startedAt: conversation.createdAt,
        formation: activeFormation.manifest
      }));
    } else {
      const restorationOptions = {
        id: conversation.id,
        startedAt: conversation.createdAt,
        // Les conversations enregistrées avant la séparation des modes étaient
        // toutes des séances de cours.
        lessonMode: (conversation.lessonMode ?? "course") as LessonMode,
        formation: activeFormation.manifest
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
      curriculumScopeForSubject(subject, courseModule)
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
    launchLesson(createActiveLesson(subject, courseModule, item, lessonUnit, {
      lessonMode,
      formation: activeFormation.manifest
    }));
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
      curriculumScopeForSubject(subject, courseModule)
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
      { lessonMode: "chapter-test", formation: activeFormation.manifest }
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
    launchLesson(createActiveLesson(subject, undefined, undefined, {
      formation: activeFormation.manifest
    }));
  };

  const handleGeneratePaperAssessment = (
    subject: Subject,
    config: PaperAssessmentConfig
  ) => {
    const scheduledEvent = events.find((event) => event.id === config.eventId);
    if (!scheduledEvent) {
      addToast({
        title: "Évaluation introuvable",
        detail: "Le planning a changé. Rouvre l’événement avant de préparer ses PDF.",
        tone: "warning"
      });
      return;
    }
    const normalizedConfig: PaperAssessmentConfig = {
      ...config,
      eventId: scheduledEvent.id,
      title: scheduledEvent.title,
      scheduledAt: scheduledEvent.start,
      chapterIds: [...config.chapterIds]
    };
    const synchronizedEnd = scheduledEvent.allDay
      ? scheduledEvent.end
      : new Date(
          new Date(scheduledEvent.start).getTime() + normalizedConfig.durationMinutes * 60_000
        ).toISOString();
    const stored = setEvents((current) => current.map((event) =>
      event.id === scheduledEvent.id
        ? { ...event, end: synchronizedEnd, type: "exam", assessment: normalizedConfig }
        : event
    ));
    if (!stored) return;
    setModal(null);
    const assessmentProvider = supportsPromptInjection(provider) ? provider : "chatgpt";
    if (assessmentProvider !== provider) {
      addToast({
        title: "ChatGPT sélectionné pour l’évaluation",
        detail: `${providerLabel(provider)} reste disponible pour étudier, mais la création des PDF nécessite un assistant IA.`,
        tone: "success"
      });
    }
    launchLesson(createActivePaperAssessment(subject, normalizedConfig, {
      formation: activeFormation.manifest
    }), assessmentProvider);
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

    const correction = createActiveAssessmentCorrection(subject, conversation, {
      formation: activeFormation.manifest
    });
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
      detail: "Joins toutes les pages de ta copie scannée, colle la consigne avec Ctrl/⌘V, puis envoie le tout à l’IA.",
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
          activeFormation.manifest.timeZone
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
        ? await importAssessmentPdfs(
            account.id,
            assessmentDocumentRecordId(activeFormation, assessment.id),
            sources
          )
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
      appStorage.setItem(storage.assessments, JSON.stringify(nextAssessments));
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
      await openAssessmentPdf(
        account.id,
        assessmentDocumentRecordId(activeFormation, assessment.id),
        variant
      );
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
    if (subject?.curriculumKind === "cefr-selectable" && !subject.cefrLevel) {
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
    const previousLevel = subjects.find((subject) => subject.curriculumKind === "cefr-selectable")?.cefrLevel;
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
    const stored = setSubjects((current) => current.map((subject) => subject.curriculumKind === "cefr-selectable"
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

    setCalendarDate(calendarDateFromKey(
      dateKeyAtTimeZone(new Date(event.start), activeFormation.manifest.timeZone),
      activeFormation.manifest.timeZone
    ));
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
      (isVideoProvider(next) || isNotebookProvider(next) || isStandaloneLearningProvider(next))
    ) {
      addToast({
        title: "Choisis un assistant IA pour cette évaluation",
        detail: "Duolingo, Khan Academy, YouTube, TikTok et NotebookLM servent à pratiquer ou consulter des ressources, pas à générer une épreuve papier.",
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
    if (isStandaloneLearningProvider(next)) {
      pendingRef.current = null;
      setPendingCapture(null);
      setProvider(next);
      setAiVisible(true);
      addToast({
        title: `${providerLabel(next)} ouvert`,
        detail: isLanguagePracticeProvider(next)
          ? `Pratique la langue « ${languagePracticeName(activeSubjects.find((candidate) => candidate.id === selectedSubjectId))} » sur la page officielle, sans transmettre la consigne de ta séance Dowze Academie.`
          : "Explore les cours et exercices de la page officielle, sans transmettre la consigne de ta séance Dowze Academie.",
        tone: "success"
      });
      scheduleAiAction(() => {
        void navigateAi(providerHome(next)).catch((error) => {
          addToast({ title: `Impossible d’ouvrir ${providerLabel(next)}`, detail: String(error), tone: "warning" });
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
  const selectSplitNote=(id:string|null)=>{if(!splitNotes.current())return;if(!id){splitNotes.close();return;}const opened=setSubjectNotesStore(current=>{const next=openSubjectNote(normalizeSubjectNotesStore(current),id);return {...next,activeDocumentId:activeWorkspaceNote?.id??null};});if(opened)splitNotes.choose(id);};
  const renderedAiWidth = Math.min(aiWidth, aiWidthLimit);
  const renderedAiVisible = aiVisible && !formationSwitching;

  return (
    <div aria-busy={loggingOut} inert={loggingOut||undefined} className={`app-shell ${renderedAiVisible ? "has-ai" : ""}`}>
      <a className="workspace-skip-link" href="#workspace-content">Aller au contenu</a>
      <DowzyMascot key={account.id} accountId={account.id} progress={slimeProgress} onOpenAssistant={() => setAiVisible(true)} />
      <Sidebar
        section={section}
        pageActive={safeSubjectNotesStore.activeDocumentId === null}
        profileName={account.displayName}
        onSectionChange={navigateToSection}
        onSearch={() => setSearchOpen(true)}
        compact={navigationCompact}
        onToggleNavigation={() => setNavigationCompact((value) => !value)}
      />

      <div className="main-workspace">
        <WorkspaceTabs
          section={section}
          documents={safeSubjectNotesStore.documents}
          openDocumentIds={safeSubjectNotesStore.openDocumentIds}
          activeDocumentId={safeSubjectNotesStore.activeDocumentId}
          secondaryDocumentId={splitNotes.secondaryId}
          onActivatePage={activateWorkspacePage}
          onActivateNote={handleActivateWorkspaceNote}
          onCloseNote={handleCloseWorkspaceNote}
          onCreateNote={handleCreateWorkspaceNote}
          creatingDisabled={!notebookScope.ready||serverSync.preparingNotes}
        />
        <AppUpdateNotice onOpen={() => navigateToSection("settings")} />
        <CloudSyncStatus sync={serverSync} onOpen={() => navigateToSection("settings")} />
        {activeWorkspaceNote&&<NotebookSplitControls notes={safeSubjectNotesStore.documents} controller={splitNotes} disabled={!notebookScope.ready||loggingOut} onChoose={selectSplitNote} onSwap={()=>{if(splitNotes.secondaryId)handleActivateWorkspaceNote(splitNotes.secondaryId);}}/>}
        <div className={`workspace-active-panel ${splitNotes.split?'workspace-split':''}`} ref={splitNotes.containerRef} data-split-orientation={splitNotes.axis} style={{'--notebook-split-ratio':`${splitNotes.ratio}%`} as CSSProperties} id="workspace-content" tabIndex={-1}>
          {splitNotes.split&&<NotebookSplitSeparator controller={splitNotes}/>}
          <PersistentWorkspacePanel key={`${activeFormation.instanceId}:page`} id="workspace-panel-page" labelledBy="workspace-tab-page" active={!activeWorkspaceNote}>
          {!notebookScope.ready&&safeSubjectNotesStore.activeDocumentId?<section className="paper-opening" role="status"><p>{notebookScope.error||"Préparation de votre carnet…"}</p>{notebookScope.error&&<button onClick={notebookScope.retry}>Réessayer</button>}</section>:section === "notes" || section === "drawing" ? (
            !notebookScope.ready?<section className="paper-opening" role="status"><p>{notebookScope.error||"Préparation de votre carnet…"}</p>{notebookScope.error&&<button onClick={notebookScope.retry}>Réessayer</button>}</section>:<NotesWorkspace collection={notebookCollection} onManagedTrash={notebookManagedTrash} syncControls={notebookManagedControls} documents={safeSubjectNotesStore.documents} activeNote={undefined} subjects={activeSubjects} storageKey={notebookScope.notesKey} media={notebookMedia} searchNavigation={notebookSearchNavigation??undefined} onCreate={handleCreateWorkspaceNote} onDuplicate={handleDuplicateWorkspaceNote} onResumeDuplicate={handleResumeWorkspaceDuplicate} onExport={handleExportWorkspaceNotes} onImport={handleImportWorkspaceArchive} onResumeImport={handleResumeWorkspaceArchive} onOpen={handleOpenWorkspaceNote} onBack={()=>navigateToSection("notes")} onOpenLegacy={()=>{
              setSubjectNotesStore(current=>{const store=normalizeSubjectNotesStore(current);return store.documents.some(note=>note.id===LEGACY_NOTE_ID)?openSubjectNote(store,LEGACY_NOTE_ID):createSubjectNote(store,{id:LEGACY_NOTE_ID,title:"Dessins et photos existants"}).store;});
            }} onUpdateNote={handleUpdateWorkspaceNote} onOpenSubjects={note=>setModal({type:"note-subjects",noteId:note.id})} onDeleteNote={note=>setModal({type:"delete-subject-note",note})}/>
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
            formation={activeFormation}
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
            onOpenEvent={handleOpenCalendarEvent}
          />
          )}
          {section === "calendar" && (
          <CalendarPage
            currentDate={calendarDate}
            view={calendarView}
            events={events}
            subjects={activeSubjects}
            timeZone={activeFormation.manifest.timeZone}
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
            academicYearLabel={`${activeFormation.manifest.yearLabel} · ${activeFormation.manifest.academicYear.startDate.slice(0, 4)}–${activeFormation.manifest.academicYear.endDate.slice(0, 4)}`}
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
          {section === "grades" && (<>
          <GradesPage
            assessments={assessments}
            subjects={activeSubjects}
            grading={activeFormation.manifest.grading}
            onAddAssessment={() => handleRecordAssessment()}
            onEditAssessment={(assessment) => setModal({ type: "assessment", assessment })}
            onDeleteAssessment={(assessment) => setModal({ type: "delete-assessment", assessment })}
            onOpenPdf={(assessment, variant) => void handleOpenAssessmentPdf(assessment, variant)}
            onOpenConversation={handleOpenAssessmentConversation}
          />

          </>)}
          {section === "tasks" && (
          <TasksPage
            tasks={tasks}
            subjects={activeSubjects}
            timeZone={activeFormation.manifest.timeZone}
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
          {section === "formations" && (
          <FormationsPage
            accountId={account.id}
            formations={formations}
            activeFormation={activeFormation}
            onActivate={handleActivateFormation}
            onChoosePackage={onChooseFormationPackage}
            onInstallPreview={onInstallFormationPreview}
            onDownloadKit={onDownloadFormationKit}
            onDownloadTemplate={onDownloadFormationTemplate}
          />
          )}
          {section === "settings" && (
          <SettingsPage
            serverSync={serverSync}
            account={account}
            formation={activeFormation}
            workspaceRecoveryKeys={formationRecoveryKeys(account.id, activeFormation)}
            provider={provider}
            aiWidth={renderedAiWidth}
            maxAiWidth={aiWidthLimit}
            onOpenAi={() => setAiVisible(true)}
            subjects={subjects}
            events={events}
            conversations={conversations}
            freeChatConversations={freeChatConversations}
            subjectNotesStore={safeSubjectNotesStore}
            assessments={assessments}
            tasks={tasks}
            onProviderChange={handleProviderChange}
            onAiWidthChange={(width) => setAiWidth(clampAiPanelWidth(width, window.innerWidth))}
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
              resetInProgressRef.current = true;setLoggingOut(true);
              serverAccountTransition(account.id,true);
              void (async()=>{await settleNotebookAccount(notebookMedia.accountId);await appStorage.flush();await onLogout();disposeNotebookAccount(notebookMedia.accountId);serverAccountTransition(account.id,false);})().catch((error) => {
                resumeNotebookAccount(notebookMedia.accountId);serverAccountTransition(account.id,false);setLoggingOut(false);
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
          </PersistentWorkspacePanel>
          {notebookScope.ready&&safeSubjectNotesStore.openDocumentIds.map(noteId => {
            const note = safeSubjectNotesStore.documents.find(item => item.id === noteId);
            if (!note) return null;
            return <PersistentWorkspacePanel key={`${activeFormation.instanceId}:${notebookMedia.accountId}:${notebookMedia.spaceId}:${note.id}`} id={`workspace-panel-${note.id}`} labelledBy={`workspace-tab-${note.id}`} active={activeWorkspaceNote?.id === note.id||splitNotes.secondaryId===note.id} splitSlot={activeWorkspaceNote?.id===note.id?'primary':splitNotes.secondaryId===note.id?'secondary':undefined}>
              <NotesWorkspace collection={notebookCollection} onManagedTrash={notebookManagedTrash} syncControls={notebookManagedControls} documents={safeSubjectNotesStore.documents} activeNote={note} subjects={activeSubjects} storageKey={notebookScope.notesKey} media={notebookMedia} searchNavigation={notebookSearchNavigation??undefined} onCreate={handleCreateWorkspaceNote} onDuplicate={handleDuplicateWorkspaceNote} onResumeDuplicate={handleResumeWorkspaceDuplicate} onExport={handleExportWorkspaceNotes} onImport={handleImportWorkspaceArchive} onResumeImport={handleResumeWorkspaceArchive} onOpen={handleOpenWorkspaceNote} onBack={()=>navigateToSection("notes")} onOpenLegacy={()=>{
              setSubjectNotesStore(current=>{const store=normalizeSubjectNotesStore(current);return store.documents.some(note=>note.id===LEGACY_NOTE_ID)?openSubjectNote(store,LEGACY_NOTE_ID):createSubjectNote(store,{id:LEGACY_NOTE_ID,title:"Dessins et photos existants"}).store;});
            }} onUpdateNote={handleUpdateWorkspaceNote} onOpenSubjects={note=>setModal({type:"note-subjects",noteId:note.id})} onDeleteNote={note=>setModal({type:"delete-subject-note",note})}/>
            </PersistentWorkspacePanel>;
          })}
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
        captureAccountId={account.id}
        captureFormationId={activeFormation.instanceId}
        visible={renderedAiVisible}
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

      {searchOpen && <WorkspaceSearch subjects={activeSubjects} notes={safeSubjectNotesStore.documents} tasks={tasks} events={events} onSubject={handleSelectSubject} onNote={handleOpenWorkspaceNote} onEvent={event => setModal({ type: 'event', event, date: new Date(event.start) })} onNavigate={navigateToSection} onClose={() => setSearchOpen(false)} />}
      {modal?.type === "calendar-export" && (
        <CalendarExportModal
          events={events}
          subjects={activeSubjects}
          calendarName={isLegacyFormation
            ? "Dowze Academie — Année 1"
            : `Dowze Academie — ${activeFormation.manifest.shortName} · ${activeFormation.manifest.yearLabel}`}
          filename={isLegacyFormation
            ? "Dowze-Academie-Planning-2026-2027.ics"
            : `Dowze-Academie-${slugifyFormationName(activeFormation.manifest.shortName)}-${activeFormation.manifest.academicYear.startDate.slice(0, 4)}-${activeFormation.manifest.academicYear.endDate.slice(0, 4)}.ics`}
          timeZone={activeFormation.manifest.timeZone}
          uidNamespace={isLegacyFormation ? undefined : activeFormation.instanceId}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "event" && (
        <EventEditor
          event={modal.event}
          date={modal.date}
          subjects={activeSubjects}
          timeZone={activeFormation.manifest.timeZone}
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
          timeZone={activeFormation.manifest.timeZone}
          formation={activeFormation.manifest}
          legacyEnergyYear1={isLegacyFormation}
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
        <TaskEditor
          task={modal.task}
          subjects={activeSubjects}
          timeZone={activeFormation.manifest.timeZone}
          onClose={() => setModal(null)}
          onSave={(task) => {
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
          grading={activeFormation.manifest.grading}
          timeZone={activeFormation.manifest.timeZone}
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
              appStorage.setItem(storage.assessments, JSON.stringify(remainingAssessments));
              setAssessments(remainingAssessments);
              setModal(null);
              try {
                await deleteAssessmentDocuments(
                  account.id,
                  assessmentDocumentRecordId(activeFormation, assessment.id)
                );
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
          title="Supprimer cette note ?"
          detail={`« ${modal.note.title.trim() || "Sans titre"} » sera retirée de votre carnet. Les copies de récupération des dessins et images sont conservées.`}
          onClose={() => setModal(null)}
          onConfirm={() => {
            if (!setSubjectNotesStore((current) => deleteSubjectNote(
              normalizeSubjectNotesStore(current),
              modal.note.id
            ))) return;
            setModal(null);
            addToast({ title: "Note supprimée" });
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

function App(props: AppProps) {
  const { account } = props;
  const [catalog, setCatalog] = useState(() => loadFormationCatalog(account.id));
  const [showStartupNotice, setShowStartupNotice] = useState(true);
  const activeFormation = catalog.formations.find(
    (formation) => formation.instanceId === catalog.activeFormation.instanceId
  ) ?? catalog.activeFormation;

  const refreshCatalog = useCallback(() => {
    const next = loadFormationCatalog(account.id);
    setCatalog(next);
    return next;
  }, [account.id]);

  const applySharedManifest = useCallback((manifest: FormationManifest) => {
    updateSharedFormationManifest(account.id, activeFormation.instanceId, manifest);
    refreshCatalog();
  }, [account.id, activeFormation.instanceId, refreshCatalog]);

  const libraryNotice = useAccountLibrary(account.id, refreshCatalog);
  const assetNotice = useNativeAssetSync(account.id);

  const chooseFormationPackage = useCallback(async () => {
    const files = await pickFormationPackage(account.id);
    return files ? validateAndCompileFormationPackage(files) : null;
  }, [account.id]);

  const installFormationPreview = useCallback(async (preview: FormationImportPreview) => {
    installFormationFromPreview(account.id, preview);
    refreshCatalog();
  }, [account.id, refreshCatalog]);

  const activateFormation = useCallback(async (formation: InstalledFormation) => {
    activateInstalledFormation(account.id, formation);
    setShowStartupNotice(false);
    refreshCatalog();
  }, [account.id, refreshCatalog]);

  const downloadFormationKit = useCallback(async (input: FormationTemplateInput) => {
    const directoryName = `dowze-formation-${formationTemplatePackageId(input)}`;
    const kitFiles = buildFormationKitFiles(input);
    const zippedFiles = Object.fromEntries(
      Object.entries(kitFiles).map(([path, content]) => [
        `${directoryName}/${path}`,
        strToU8(content)
      ])
    );
    const archive = zipSync(zippedFiles, { level: 6 });
    return Boolean(await saveFormationKitArchive(account.id, archive, `${directoryName}.zip`));
  }, [account.id]);

  const downloadFormationTemplate = useCallback(async (
    filename: FormationPackageFilename,
    input: FormationTemplateInput
  ) => {
    const templates = buildFormationTemplateFiles(input);
    return Boolean(await saveTextDocument(templates[filename], filename, "json"));
  }, []);

  return (
    <FormationWorkspaceApp
      key={`${account.id}:${activeFormation.instanceId}`}
      {...props}
      startupNotice={showStartupNotice
        ? catalog.workspaceWarning
          ? {
              title: "Formation non ouverte",
              detail: catalog.workspaceWarning,
              tone: "warning"
            }
          : assetNotice || libraryNotice ? { title: "Synchronisation du compte", detail: assetNotice || libraryNotice, tone: "default" } : props.startupNotice
        : null}
      activeFormation={activeFormation}
      formations={catalog.formations}
      onSharedManifest={applySharedManifest}
      onActivateFormation={activateFormation}
      onChooseFormationPackage={chooseFormationPackage}
      onInstallFormationPreview={installFormationPreview}
      onDownloadFormationKit={downloadFormationKit}
      onDownloadFormationTemplate={downloadFormationTemplate}
    />
  );
}

export default App;
