import type {
  CalendarEvent,
  PaperAssessmentConfig,
  Subject,
  TaskItem
} from "../types";

const SUBJECT_ICONS = new Set([
  "function", "atom", "book", "languages", "leaf", "palette", "matrix",
  "code", "flask", "drafting", "ruler", "zap", "wrench"
]);
const CEFR_LEVELS = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);
const PAPER_ASSESSMENT_KINDS = new Set([
  "test", "control", "midterm", "exam", "final-exam",
  "written-practical", "resit", "evaluation"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRecordArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every(isRecord);
}

function isOptionalString(value: unknown) {
  return value === undefined || typeof value === "string";
}

function isCanonicalBcp47(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 40) return false;
  try {
    return new Intl.Locale(value).toString() === value;
  } catch {
    return false;
  }
}

function isIsoDate(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isStoredPaperAssessment(value: unknown): value is PaperAssessmentConfig | undefined {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  const chapterIds = value.chapterIds;
  return typeof value.eventId === "string" && value.eventId.length > 0 &&
    typeof value.kind === "string" && PAPER_ASSESSMENT_KINDS.has(value.kind) &&
    typeof value.title === "string" && value.title.length > 0 &&
    isIsoDate(value.scheduledAt) &&
    typeof value.durationMinutes === "number" && Number.isInteger(value.durationMinutes) &&
    value.durationMinutes >= 10 && value.durationMinutes <= 360 &&
    Array.isArray(chapterIds) && chapterIds.length > 0 &&
    chapterIds.every((id) => typeof id === "string" && id.length > 0) &&
    new Set(chapterIds).size === chapterIds.length &&
    typeof value.allowedMaterials === "string" && value.allowedMaterials.length > 0 &&
    isOptionalString(value.instructions);
}

export function isStoredSubjects(value: unknown): value is Subject[] {
  return isRecordArray(value) && value.length > 0 && value.every((subject) => {
    const modulesAreValid = Array.isArray(subject.modules) &&
      subject.modules.every((courseModule) => isRecord(courseModule) &&
        typeof courseModule.id === "string" &&
        typeof courseModule.period === "string" &&
        typeof courseModule.title === "string" &&
        (courseModule.cefrLevel === undefined || (
          typeof courseModule.cefrLevel === "string" && CEFR_LEVELS.has(courseModule.cefrLevel)
        )) &&
        Array.isArray(courseModule.items) &&
        courseModule.items.every((item) => isRecord(item) &&
          typeof item.id === "string" &&
          typeof item.title === "string" &&
          typeof item.completed === "boolean" &&
          isOptionalString(item.description) &&
          (item.lessons === undefined || (
            Array.isArray(item.lessons) &&
            item.lessons.every((lesson) => isRecord(lesson) &&
              typeof lesson.id === "string" &&
              typeof lesson.title === "string" &&
              typeof lesson.objective === "string" &&
              typeof lesson.completed === "boolean"
            )
          ))
        )
      );
    const hasCefrLevel = subject.cefrLevel !== undefined || (
      Array.isArray(subject.modules) &&
      subject.modules.some((courseModule) => isRecord(courseModule) && courseModule.cefrLevel !== undefined)
    );
    const languageMetadataIsComplete =
      isCanonicalBcp47(subject.languageCode) &&
      typeof subject.languageName === "string" &&
      subject.languageName.trim().length > 0 &&
      subject.languageName.length <= 80;
    const hasNoLanguageMetadata = subject.languageCode === undefined && subject.languageName === undefined;

    return typeof subject.id === "string" &&
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
    (subject.chapterCount === undefined || (
      typeof subject.chapterCount === "number" &&
      Number.isInteger(subject.chapterCount) &&
      subject.chapterCount >= 0
    )) &&
    isOptionalString(subject.objective) &&
    (subject.curriculumKind === undefined ||
      subject.curriculumKind === "standard" ||
      subject.curriculumKind === "cefr-selectable") &&
    (subject.cefrLevel === undefined || (
      typeof subject.cefrLevel === "string" && CEFR_LEVELS.has(subject.cefrLevel)
    )) &&
    (hasNoLanguageMetadata || languageMetadataIsComplete) &&
    (subject.curriculumKind === "cefr-selectable" || !hasCefrLevel || languageMetadataIsComplete) &&
    modulesAreValid;
  });
}

export function isStoredEvents(value: unknown): value is CalendarEvent[] {
  return isRecordArray(value) && value.every((event) => {
    const start = typeof event.start === "string" ? Date.parse(event.start) : Number.NaN;
    const end = typeof event.end === "string" ? Date.parse(event.end) : Number.NaN;
    const assessment = event.assessment;
    const maximumDuration = 3_660 * 24 * 60 * 60_000;
    return typeof event.id === "string" &&
      typeof event.title === "string" &&
      isIsoDate(event.start) &&
      isIsoDate(event.end) &&
      end > start && end - start <= maximumDuration &&
      new Date(start).getUTCFullYear() >= 1900 &&
      new Date(end).getUTCFullYear() <= 2101 &&
      ["course", "study", "exam", "personal", "milestone", "break"].includes(event.type as string) &&
      typeof event.color === "string" &&
      isOptionalString(event.subjectId) &&
      isOptionalString(event.location) &&
      isOptionalString(event.description) &&
      isStoredPaperAssessment(assessment) &&
      (assessment === undefined || (
        event.type === "exam" &&
        assessment.eventId === event.id &&
        assessment.title === event.title &&
        assessment.scheduledAt === event.start &&
        (event.allDay === true || end - start === assessment.durationMinutes * 60_000)
      )) &&
      (event.allDay === undefined || typeof event.allDay === "boolean");
  });
}

export function isStoredTasks(value: unknown): value is TaskItem[] {
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
