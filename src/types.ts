export type AppSection = "home" | "calendar" | "courses" | "grades" | "tasks" | "formations" | "settings" | "notes" | "drawing";
export type CalendarView = "year" | "month" | "week" | "day";
export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type AiProvider =
  | "chatgpt"
  | "claude"
  | "gemini"
  | "mistral"
  | "deepseek"
  | "kimi"
  | "freechat"
  | "duolingo"
  | "khanacademy"
  | "youtube"
  | "tiktok"
  | "notebooklm";
export type LessonMode = "course" | "exercises" | "chapter-test";
export type AiSessionMode = LessonMode | "paper-assessment" | "assessment-correction";

export type PaperAssessmentKind =
  | "test"
  | "control"
  | "midterm"
  | "exam"
  | "final-exam"
  | "written-practical"
  | "resit"
  | "evaluation";

export interface PaperAssessmentConfig {
  eventId: string;
  kind: PaperAssessmentKind;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  chapterIds: string[];
  allowedMaterials: string;
  instructions?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  subjectId?: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
  allDay?: boolean;
  type: "course" | "study" | "exam" | "personal" | "milestone" | "break";
  color: string;
  /** Configuration initiale d’une épreuve planifiée par un paquet de formation. */
  assessment?: PaperAssessmentConfig;
}

export interface LessonUnit {
  id: string;
  title: string;
  objective: string;
  completed: boolean;
}

export interface ProgramItem {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  /**
   * Séances atomiques du bloc de programme. Optionnel pour que les données
   * enregistrées avant l'ajout de cette granularité restent lisibles.
   */
  lessons?: LessonUnit[];
}

export interface ProgramModule {
  id: string;
  period: string;
  title: string;
  /** Niveau CECRL lorsque plusieurs années de langue partagent la matière. */
  cefrLevel?: CefrLevel;
  items: ProgramItem[];
}

export interface Subject {
  id: string;
  name: string;
  shortName: string;
  teacher: string;
  room: string;
  color: string;
  accent: string;
  icon:
    | "function"
    | "atom"
    | "book"
    | "languages"
    | "leaf"
    | "palette"
    | "matrix"
    | "code"
    | "flask"
    | "drafting"
    | "ruler"
    | "zap"
    | "wrench";
  nextClass?: string;
  domain?: string;
  period?: "Annuel" | "Semestre 1" | "Semestre 2" | string;
  validation?: string;
  chapterCount?: number;
  objective?: string;
  /** Active le sélecteur de parcours CECRL fourni par le cursus historique. */
  curriculumKind?: "standard" | "cefr-selectable";
  /** Niveau CECRL explicite d’une matière de langue, y compris importée. */
  cefrLevel?: CefrLevel;
  /** Balise BCP 47 canonique de la langue cible, par exemple `de` ou `fr-CH`. */
  languageCode?: string;
  /** Nom lisible de la langue cible utilisé dans les interfaces et les prompts. */
  languageName?: string;
  modules: ProgramModule[];
}

export interface SubjectNoteDocument {
  id: string;
  /** Une note peut être reliée à zéro, une ou plusieurs matières. */
  subjectIds: string[];
  /** Étiquettes libres, normalisées et dédupliquées à la sauvegarde. */
  tags: string[];
  title: string;
  /** Source Markdown portable. Aucun HTML ou état interne d’éditeur n’est stocké. */
  markdown: string;
  createdAt: string;
  updatedAt: string;
}

export interface SubjectNotesStore {
  schemaVersion: 2;
  documents: SubjectNoteDocument[];
  /** Onglets de notes ouverts, dans leur ordre visuel. */
  openDocumentIds: string[];
  /** Onglet de note actif; `null` sélectionne la page permanente. */
  activeDocumentId: string | null;
}

export interface ActiveLesson {
  id: string;
  subjectId: string;
  /** Périmètre stable d'un cursus sélectionnable, par exemple `cefr:A1`. */
  curriculumScope?: string;
  moduleId?: string;
  itemId?: string;
  lessonUnitId?: string;
  lessonMode: AiSessionMode;
  title: string;
  moduleTitle?: string;
  prompt: string;
  startedAt: string;
  assessment?: PaperAssessmentConfig;
}

export interface Conversation {
  id: string;
  subjectId: string;
  /** Empêche de mélanger les historiques généraux de deux niveaux de langue. */
  curriculumScope?: string;
  moduleId?: string;
  itemId?: string;
  lessonUnitId?: string;
  lessonMode?: AiSessionMode;
  lessonTitle?: string;
  kind?: "lesson" | "general";
  assessment?: PaperAssessmentConfig;
  provider: AiProvider;
  url: string;
  /** Identifiant interne lorsque la conversation appartient au Chat libre. */
  localConversationId?: string;
  createdAt: string;
  name?: string;
  note?: string;
}

export type RecordedAssessmentKind = "mini-test" | PaperAssessmentKind;

export interface StoredAssessmentPdf {
  originalName: string;
  sizeBytes: number;
  importedAt: string;
}

export interface AssessmentRecord {
  id: string;
  subjectId: string;
  title: string;
  kind: RecordedAssessmentKind;
  assessmentDate: string;
  score: number;
  maxScore: number;
  /** Poids de l'épreuve dans la moyenne de sa matière. */
  coefficient?: number;
  appreciation: string;
  personalNote?: string;
  conversationId?: string;
  conversationUrl?: string;
  provider?: AiProvider;
  blankPdf?: StoredAssessmentPdf;
  completedPdf?: StoredAssessmentPdf;
  createdAt: string;
  updatedAt: string;
}

export interface TaskItem {
  id: string;
  title: string;
  subjectId?: string;
  dueAt: string;
  completed: boolean;
  completedAt?: string;
  priority: "low" | "medium" | "high";
}

export interface ToastMessage {
  id: string;
  title: string;
  detail?: string;
  tone?: "default" | "success" | "warning";
}
