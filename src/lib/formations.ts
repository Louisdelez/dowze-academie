import { parseFormationChoices, selectFormationChoices, type FormationChoices } from "./formationChoices";
import type {
  CalendarEvent,
  CefrLevel,
  PaperAssessmentKind,
  Subject,
  TaskItem
} from "../types";
import {
  addCalendarDays,
  dateAtTimeZone,
  dateFromTimeZoneInput,
  dateKeyAtTimeZone,
  weekdayFromDateKey
} from "./zonedDate";
import {
  aiPromptByteLength,
  NATIVE_AI_PROMPT_MAX_BYTES,
  utf8ByteLength
} from "./aiSessionContract";
import { buildLessonPrompt } from "./lesson";
import { buildPaperAssessmentPrompt } from "./assessment";
import {
  buildCalendarIcs,
  toCalendarIcsEvents,
  type CalendarIcsEvent
} from "./calendarIcs";

export const FORMATION_REQUIRED_FILES = [
  "formation.json",
  "matieres.json",
  "programme.json",
  "planning.json",
  "evaluations.json",
  "taches.json"
] as const;

export const FORMATION_PACKAGE_FILENAMES = FORMATION_REQUIRED_FILES;
export const FORMATION_COMPILED_STATE_MAX_BYTES = 4 * 1024 * 1024;
export const FORMATION_CALENDAR_ICS_MAX_BYTES = 4 * 1024 * 1024;
const IMPORTED_FORMATION_UID_NAMESPACE_SAMPLE = "00000000-0000-4000-8000-000000000000";

export type FormationRequiredFilename = (typeof FORMATION_REQUIRED_FILES)[number];
export type FormationPackageFilename = FormationRequiredFilename;

export interface FormationManifest {
  schemaVersion: "dowze-formation@1";
  packageVersion: string;
  id: string;
  name: string;
  shortName: string;
  yearLabel: string;
  description: string;
  locale: string;
  timeZone: string;
  academicYear: {
    startDate: string;
    endDate: string;
  };
  level: {
    label: string;
    framework?: string;
    targetAudience: string;
  };
  pedagogy: {
    teachingLanguage: string;
    instructionLevel: string;
    approach: string;
  };
  grading: {
    scaleMax: number;
    passMark: number;
  };
  theme: {
    color: string;
    accent: string;
    icon: string;
  };
  files: {
    subjects: "matieres.json";
    curriculum: "programme.json";
    schedule: "planning.json";
    assessments: "evaluations.json";
    tasks: "taches.json";
  };
  author?: string;
  license?: string;
  objectives?: string[];
  motto?: string;
  specialization?: string;
  choices?: FormationChoices;
  pathway?: {
    id: string;
    name: string;
    yearIndex: number;
    yearCount: number;
  };
}

export type FormationStorageKind = "legacy-energy-year1" | "formation-v1";

export interface InstalledFormation {
  instanceId: string;
  packageId: string;
  packageVersion: string;
  manifest: FormationManifest;
  installedAt: string;
  storageKind: FormationStorageKind;
}

export interface FormationPackageFiles {
  "formation.json": string;
  "matieres.json": string;
  "programme.json": string;
  "planning.json": string;
  "evaluations.json": string;
  "taches.json": string;
  /** Nom du dossier source, fourni par l’import natif quand il est disponible. */
  directoryName?: string;
}

export interface FormationImportIssue {
  file: FormationRequiredFilename | "package";
  path: string;
  code: string;
  message: string;
  severity: "error" | "warning";
}

export interface FormationImportPreview {
  valid: boolean;
  issues: FormationImportIssue[];
  manifest?: FormationManifest;
  subjects: Subject[];
  events: CalendarEvent[];
  tasks: TaskItem[];
  /** Présent uniquement lorsque le paquet est entièrement installable. */
  compiled?: {
    subjects: Subject[];
    events: CalendarEvent[];
    tasks: TaskItem[];
  };
  counts: {
    subjects: number;
    modules: number;
    chapters: number;
    lessons: number;
    events: number;
    tasks: number;
  };
}

export interface FormationValidationOptions {
  /** Permet de tester une limite plus basse. La limite absolue reste 5 000. */
  maxExpandedEvents?: number;
}

type JsonObject = Record<string, unknown>;
type EventType = CalendarEvent["type"];
type SubjectIcon = Subject["icon"];

interface RawSubject extends Omit<Subject, "modules"> {}

interface RawLesson {
  id: string;
  title: string;
  objective: string;
}

interface RawChapter {
  id: string;
  title: string;
  description?: string;
  lessons: RawLesson[];
}

interface RawModule {
  id: string;
  period: string;
  title: string;
  cefrLevel?: CefrLevel;
  items: RawChapter[];
}

interface RawProgram {
  subjectId: string;
  modules: RawModule[];
}

interface RawPeriod {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
}

interface RawClosure extends RawPeriod {
  description?: string;
}

interface RawWeeklySlot {
  id: string;
  periodIds: string[];
  weekdays: number[];
  startTime: string;
  durationMinutes: number;
  title: string;
  description?: string;
  subjectId?: string;
  type: EventType;
  color?: string;
  location?: string;
}

interface RawDirectEvent {
  id: string;
  title: string;
  startLocal: string;
  endLocal: string;
  description?: string;
  subjectId?: string;
  type: EventType;
  color?: string;
  location?: string;
}

interface RawSchedule {
  periods: RawPeriod[];
  closures: RawClosure[];
  weeklySlots: RawWeeklySlot[];
  events: RawDirectEvent[];
}

interface RawAssessment {
  id: string;
  title: string;
  subjectId: string;
  kind: PaperAssessmentKind;
  scheduledAt: string;
  durationMinutes: number;
  chapterIds: string[];
  allowedMaterials: string;
  instructions?: string;
  color?: string;
  location?: string;
}

interface RawTask {
  id: string;
  title: string;
  dueAt: string;
  priority: TaskItem["priority"];
  subjectId?: string;
}

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_PACKAGE_BYTES = 8 * 1024 * 1024;
const MAX_EXPANDED_EVENTS = 5_000;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const SEMVER_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

const SUBJECT_ICONS = new Set<SubjectIcon>([
  "function",
  "atom",
  "book",
  "languages",
  "leaf",
  "palette",
  "matrix",
  "code",
  "flask",
  "drafting",
  "ruler",
  "zap",
  "wrench"
]);

const EVENT_TYPES = new Set<EventType>([
  "course",
  "study",
  "exam",
  "personal",
  "milestone",
  "break"
]);

const ASSESSMENT_KINDS = new Set<PaperAssessmentKind>([
  "test",
  "control",
  "midterm",
  "exam",
  "final-exam",
  "written-practical",
  "resit",
  "evaluation"
]);

const CEFR_LEVELS = new Set<CefrLevel>(["A1", "A2", "B1", "B2", "C1", "C2"]);
const TASK_PRIORITIES = new Set<TaskItem["priority"]>(["low", "medium", "high"]);
export const FORMATION_IMPORT_MAX_REPORTED_ISSUES = 200;

class IssueCollector {
  readonly issues: FormationImportIssue[] = [];
  private truncated = false;

  private add(issue: FormationImportIssue) {
    if (this.truncated) return;
    if (this.issues.length < FORMATION_IMPORT_MAX_REPORTED_ISSUES) {
      this.issues.push(issue);
      return;
    }
    this.truncated = true;
    this.issues.push({
      file: "package",
      path: "$",
      code: "too-many-errors",
      message: `La validation a été arrêtée après ${FORMATION_IMPORT_MAX_REPORTED_ISSUES} problèmes détaillés. Corrigez-les avant de relancer l’import.`,
      severity: "error"
    });
  }

  error(
    file: FormationImportIssue["file"],
    path: string,
    code: string,
    message: string
  ) {
    this.add({ file, path, code, message, severity: "error" });
  }

  warning(
    file: FormationImportIssue["file"],
    path: string,
    code: string,
    message: string
  ) {
    this.add({ file, path, code, message, severity: "warning" });
  }

  isTruncated() {
    return this.truncated;
  }

  errorCount() {
    return this.issues.filter((issue) => issue.severity === "error").length;
  }
}

function isPlainObject(value: unknown): value is JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function strictObject(
  value: unknown,
  allowedKeys: readonly string[],
  collector: IssueCollector,
  file: FormationImportIssue["file"],
  path: string
): JsonObject | undefined {
  if (!isPlainObject(value)) {
    collector.error(file, path, "invalid-type", "Un objet JSON est attendu.");
    return undefined;
  }
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      collector.error(file, `${path}.${key}`, "unknown-field", `Le champ « ${key} » n’est pas autorisé.`);
      if (collector.isTruncated()) break;
    }
  }
  return value;
}

function requiredValue(
  object: JsonObject,
  key: string,
  collector: IssueCollector,
  file: FormationImportIssue["file"],
  path: string
) {
  if (!Object.hasOwn(object, key)) {
    collector.error(file, `${path}.${key}`, "missing-field", `Le champ « ${key} » est obligatoire.`);
    return undefined;
  }
  return object[key];
}

function textValue(
  value: unknown,
  collector: IssueCollector,
  file: FormationImportIssue["file"],
  path: string,
  options: { max?: number; optional?: boolean } = {}
): string | undefined {
  if (value === undefined && options.optional) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    collector.error(file, path, "invalid-type", "Une chaîne de caractères non vide est attendue.");
    return undefined;
  }
  if (hasUnpairedUtf16Surrogate(value)) {
    collector.error(
      file,
      path,
      "invalid-unicode",
      "La chaîne contient un substitut UTF-16 isolé, incompatible avec l’import natif."
    );
    return undefined;
  }
  if (hasForbiddenNativeControl(value)) {
    collector.error(
      file,
      path,
      "invalid-control-character",
      "La chaîne contient un caractère de contrôle interdit."
    );
    return undefined;
  }
  const max = options.max ?? 500;
  if ([...value].length > max) {
    collector.error(file, path, "limit-exceeded", `La chaîne dépasse la limite de ${max} caractères.`);
    return undefined;
  }
  return value;
}

function hasUnpairedUtf16Surrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function optionalText(
  object: JsonObject,
  key: string,
  collector: IssueCollector,
  file: FormationImportIssue["file"],
  path: string,
  max = 4_000
) {
  return textValue(object[key], collector, file, `${path}.${key}`, { optional: true, max });
}

function requiredText(
  object: JsonObject,
  key: string,
  collector: IssueCollector,
  file: FormationImportIssue["file"],
  path: string,
  max = 500
) {
  return textValue(requiredValue(object, key, collector, file, path), collector, file, `${path}.${key}`, {
    max
  });
}

function idValue(
  value: unknown,
  collector: IssueCollector,
  file: FormationImportIssue["file"],
  path: string
): string | undefined {
  const id = textValue(value, collector, file, path, { max: 64 });
  if (id && !ID_PATTERN.test(id)) {
    collector.error(
      file,
      path,
      "invalid-id",
      "L’identifiant doit utiliser uniquement a-z, 0-9 et des tirets simples."
    );
    return undefined;
  }
  return id;
}

function requiredId(
  object: JsonObject,
  key: string,
  collector: IssueCollector,
  file: FormationImportIssue["file"],
  path: string
) {
  return idValue(requiredValue(object, key, collector, file, path), collector, file, `${path}.${key}`);
}

function finiteNumber(
  value: unknown,
  collector: IssueCollector,
  file: FormationImportIssue["file"],
  path: string,
  options: { integer?: boolean; min?: number; max?: number } = {}
): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    collector.error(file, path, "invalid-type", "Un nombre fini est attendu.");
    return undefined;
  }
  if (options.integer && !Number.isInteger(value)) {
    collector.error(file, path, "invalid-value", "Un nombre entier est attendu.");
    return undefined;
  }
  if (options.min !== undefined && value < options.min) {
    collector.error(file, path, "invalid-value", `La valeur minimale est ${options.min}.`);
    return undefined;
  }
  if (options.max !== undefined && value > options.max) {
    collector.error(file, path, "invalid-value", `La valeur maximale est ${options.max}.`);
    return undefined;
  }
  return value;
}

function requiredNumber(
  object: JsonObject,
  key: string,
  collector: IssueCollector,
  file: FormationImportIssue["file"],
  path: string,
  options: { integer?: boolean; min?: number; max?: number } = {}
) {
  return finiteNumber(requiredValue(object, key, collector, file, path), collector, file, `${path}.${key}`, options);
}

function arrayValue(
  value: unknown,
  collector: IssueCollector,
  file: FormationImportIssue["file"],
  path: string,
  options: { min?: number; max: number }
): unknown[] | undefined {
  if (!Array.isArray(value)) {
    collector.error(file, path, "invalid-type", "Un tableau JSON est attendu.");
    return undefined;
  }
  if (options.min !== undefined && value.length < options.min) {
    collector.error(file, path, "invalid-value", `Le tableau doit contenir au moins ${options.min} élément(s).`);
  }
  if (value.length > options.max) {
    collector.error(file, path, "limit-exceeded", `Le tableau dépasse la limite de ${options.max} éléments.`);
    return undefined;
  }
  return value;
}

function requiredArray(
  object: JsonObject,
  key: string,
  collector: IssueCollector,
  file: FormationImportIssue["file"],
  path: string,
  options: { min?: number; max: number }
) {
  return arrayValue(requiredValue(object, key, collector, file, path), collector, file, `${path}.${key}`, options);
}

function enumValue<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  collector: IssueCollector,
  file: FormationImportIssue["file"],
  path: string,
  optional = false
): T | undefined {
  if (value === undefined && optional) return undefined;
  if (typeof value !== "string" || !allowed.has(value as T)) {
    collector.error(file, path, "invalid-value", `Valeur non autorisée : ${JSON.stringify(value)}.`);
    return undefined;
  }
  return value as T;
}

function colorValue(
  value: unknown,
  collector: IssueCollector,
  file: FormationImportIssue["file"],
  path: string,
  optional = false
): string | undefined {
  if (value === undefined && optional) return undefined;
  if (typeof value !== "string" || !COLOR_PATTERN.test(value)) {
    collector.error(file, path, "invalid-color", "Une couleur hexadécimale #RRGGBB est attendue.");
    return undefined;
  }
  return value.toLowerCase();
}

function isValidDateKey(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

function dateValue(
  value: unknown,
  collector: IssueCollector,
  file: FormationImportIssue["file"],
  path: string
): string | undefined {
  if (typeof value !== "string" || !isValidDateKey(value)) {
    collector.error(file, path, "invalid-date", "Une date civile réelle au format YYYY-MM-DD est attendue.");
    return undefined;
  }
  return value;
}

function isDateWithin(date: string, startDate: string, endDate: string) {
  return date >= startDate && date <= endDate;
}

function validateCanonicalBcp47(
  value: string,
  collector: IssueCollector,
  file: FormationImportIssue["file"],
  path: string,
  label: string
) {
  try {
    const locale = new Intl.Locale(value);
    if (locale.toString() !== value) {
      collector.error(file, path, "invalid-locale", `${label} doit être une balise BCP 47 canonique.`);
      return false;
    }
    return true;
  } catch {
    collector.error(file, path, "invalid-locale", `${label} BCP 47 est invalide.`);
    return false;
  }
}

function validateLocale(value: string, collector: IssueCollector, path: string) {
  return validateCanonicalBcp47(value, collector, "formation.json", path, "La locale");
}

function validateTimeZone(value: string, collector: IssueCollector, path: string) {
  try {
    new Intl.DateTimeFormat("fr", { timeZone: value }).format(new Date(0));
    if (value === "UTC" || !value.includes("/")) {
      collector.error("formation.json", path, "invalid-time-zone", "Un identifiant de fuseau IANA régional est attendu.");
      return false;
    }
    return true;
  } catch {
    collector.error("formation.json", path, "invalid-time-zone", "Le fuseau IANA est inconnu.");
    return false;
  }
}

function daysInclusive(startDate: string, endDate: string) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  return Math.floor((end - start) / 86_400_000) + 1;
}

function parseManifest(value: unknown, collector: IssueCollector): FormationManifest | undefined {
  const file = "formation.json" as const;
  const before = collector.errorCount();
  const object = strictObject(
    value,
    [
      "schemaVersion",
      "packageVersion",
      "id",
      "name",
      "shortName",
      "yearLabel",
      "description",
      "locale",
      "timeZone",
      "academicYear",
      "level",
      "pedagogy",
      "grading",
      "theme",
      "files",
      "author",
      "license",
      "objectives",
      "motto",
      "specialization",
      "pathway",
      "choices"
    ],
    collector,
    file,
    "$"
  );
  if (!object) return undefined;

  const schemaVersion = requiredText(object, "schemaVersion", collector, file, "$", 40);
  if (schemaVersion && schemaVersion !== "dowze-formation@1") {
    collector.error(file, "$.schemaVersion", "unsupported-schema", "La version attendue est dowze-formation@1.");
  }
  const packageVersion = requiredText(object, "packageVersion", collector, file, "$", 100);
  if (packageVersion && !SEMVER_PATTERN.test(packageVersion)) {
    collector.error(file, "$.packageVersion", "invalid-version", "Une version sémantique valide est attendue.");
  }
  const id = requiredId(object, "id", collector, file, "$" );
  const name = requiredText(object, "name", collector, file, "$", 200);
  const shortName = requiredText(object, "shortName", collector, file, "$", 80);
  const yearLabel = requiredText(object, "yearLabel", collector, file, "$", 80);
  const description = requiredText(object, "description", collector, file, "$", 4_000);
  const locale = requiredText(object, "locale", collector, file, "$", 40);
  if (locale) validateLocale(locale, collector, "$.locale");
  const timeZone = requiredText(object, "timeZone", collector, file, "$", 80);
  if (timeZone) validateTimeZone(timeZone, collector, "$.timeZone");

  const academicObject = strictObject(
    requiredValue(object, "academicYear", collector, file, "$"),
    ["startDate", "endDate"],
    collector,
    file,
    "$.academicYear"
  );
  const startDate = academicObject
    ? dateValue(requiredValue(academicObject, "startDate", collector, file, "$.academicYear"), collector, file, "$.academicYear.startDate")
    : undefined;
  const endDate = academicObject
    ? dateValue(requiredValue(academicObject, "endDate", collector, file, "$.academicYear"), collector, file, "$.academicYear.endDate")
    : undefined;
  if (startDate && endDate) {
    if (startDate < "1900-01-01" || endDate > "2100-12-31") {
      collector.error(file, "$.academicYear", "unsupported-date-range", "L’année scolaire doit rester comprise entre 1900 et 2100 pour être éditable dans l’application.");
    } else if (endDate < startDate) {
      collector.error(file, "$.academicYear.endDate", "invalid-range", "La fin doit suivre le début de l’année scolaire.");
    } else if (daysInclusive(startDate, endDate) > 370) {
      collector.error(file, "$.academicYear", "year-too-long", "Un paquet représente une seule année scolaire (370 jours maximum)." );
    }
  }

  const levelObject = strictObject(
    requiredValue(object, "level", collector, file, "$"),
    ["label", "framework", "targetAudience"],
    collector,
    file,
    "$.level"
  );
  const levelLabel = levelObject ? requiredText(levelObject, "label", collector, file, "$.level", 200) : undefined;
  const framework = levelObject ? optionalText(levelObject, "framework", collector, file, "$.level", 200) : undefined;
  const targetAudience = levelObject
    ? requiredText(levelObject, "targetAudience", collector, file, "$.level", 500)
    : undefined;

  const pedagogyObject = strictObject(
    requiredValue(object, "pedagogy", collector, file, "$"),
    ["teachingLanguage", "instructionLevel", "approach"],
    collector,
    file,
    "$.pedagogy"
  );
  const teachingLanguage = pedagogyObject
    ? requiredText(pedagogyObject, "teachingLanguage", collector, file, "$.pedagogy", 40)
    : undefined;
  const instructionLevel = pedagogyObject
    ? requiredText(pedagogyObject, "instructionLevel", collector, file, "$.pedagogy", 500)
    : undefined;
  const approach = pedagogyObject
    ? requiredText(pedagogyObject, "approach", collector, file, "$.pedagogy", 2_000)
    : undefined;

  const gradingObject = strictObject(
    requiredValue(object, "grading", collector, file, "$"),
    ["scaleMax", "passMark"],
    collector,
    file,
    "$.grading"
  );
  const scaleMax = gradingObject
    ? requiredNumber(gradingObject, "scaleMax", collector, file, "$.grading", { min: 0.01, max: 10_000 })
    : undefined;
  const passMark = gradingObject
    ? requiredNumber(gradingObject, "passMark", collector, file, "$.grading", { min: 0, max: 10_000 })
    : undefined;
  if (scaleMax !== undefined && passMark !== undefined && passMark > scaleMax) {
    collector.error(file, "$.grading.passMark", "invalid-value", "Le seuil de réussite ne peut pas dépasser la note maximale.");
  }

  const themeObject = strictObject(
    requiredValue(object, "theme", collector, file, "$"),
    ["color", "accent", "icon"],
    collector,
    file,
    "$.theme"
  );
  const themeColor = themeObject
    ? colorValue(requiredValue(themeObject, "color", collector, file, "$.theme"), collector, file, "$.theme.color")
    : undefined;
  const themeAccent = themeObject
    ? colorValue(requiredValue(themeObject, "accent", collector, file, "$.theme"), collector, file, "$.theme.accent")
    : undefined;
  const themeIcon = themeObject ? requiredText(themeObject, "icon", collector, file, "$.theme", 64) : undefined;

  const filesObject = strictObject(
    requiredValue(object, "files", collector, file, "$"),
    ["subjects", "curriculum", "schedule", "assessments", "tasks"],
    collector,
    file,
    "$.files"
  );
  const expectedFiles = {
    subjects: "matieres.json",
    curriculum: "programme.json",
    schedule: "planning.json",
    assessments: "evaluations.json",
    tasks: "taches.json"
  } as const;
  if (filesObject) {
    for (const [key, expected] of Object.entries(expectedFiles)) {
      const actual = requiredText(filesObject, key, collector, file, "$.files", 40);
      if (actual && actual !== expected) {
        collector.error(file, `$.files.${key}`, "invalid-filename", `Le nom requis est exactement « ${expected} ».`);
      }
    }
  }

  const author = optionalText(object, "author", collector, file, "$", 200);
  const license = optionalText(object, "license", collector, file, "$", 200);
  const motto = optionalText(object, "motto", collector, file, "$", 500);
  const specialization = optionalText(object, "specialization", collector, file, "$", 500);
  let objectives: string[] | undefined;
  if (object.objectives !== undefined) {
    const values = arrayValue(object.objectives, collector, file, "$.objectives", { max: 100 });
    objectives = values
      ?.map((entry, index) => textValue(entry, collector, file, `$.objectives[${index}]`, { max: 1_000 }))
      .filter((entry): entry is string => Boolean(entry));
  }

  let choices: FormationChoices | undefined;
  if (object.choices !== undefined) {
    try { choices = parseFormationChoices(object.choices); }
    catch (error) { collector.error(file, "$.choices", "invalid-value", String(error)); }
  }
  let pathway: FormationManifest["pathway"];
  if (object.pathway !== undefined) {
    const pathwayObject = strictObject(
      object.pathway,
      ["id", "name", "yearIndex", "yearCount"],
      collector,
      file,
      "$.pathway"
    );
    if (pathwayObject) {
      const pathwayId = requiredId(pathwayObject, "id", collector, file, "$.pathway");
      const pathwayName = requiredText(pathwayObject, "name", collector, file, "$.pathway", 200);
      const yearIndex = requiredNumber(pathwayObject, "yearIndex", collector, file, "$.pathway", {
        integer: true,
        min: 1,
        max: 100
      });
      const yearCount = requiredNumber(pathwayObject, "yearCount", collector, file, "$.pathway", {
        integer: true,
        min: 1,
        max: 100
      });
      if (yearIndex !== undefined && yearCount !== undefined && yearIndex > yearCount) {
        collector.error(file, "$.pathway.yearIndex", "invalid-value", "L’index d’année ne peut pas dépasser le nombre total d’années.");
      }
      if (pathwayId && pathwayName && yearIndex !== undefined && yearCount !== undefined) {
        pathway = { id: pathwayId, name: pathwayName, yearIndex, yearCount };
      }
    }
  }

  if (
    collector.errorCount() !== before ||
    !id ||
    !name ||
    !shortName ||
    !yearLabel ||
    !description ||
    !locale ||
    !timeZone ||
    !startDate ||
    !endDate ||
    !levelLabel ||
    !targetAudience ||
    !teachingLanguage ||
    !instructionLevel ||
    !approach ||
    scaleMax === undefined ||
    passMark === undefined ||
    !themeColor ||
    !themeAccent ||
    !themeIcon ||
    !filesObject ||
    schemaVersion !== "dowze-formation@1" ||
    !packageVersion ||
    !SEMVER_PATTERN.test(packageVersion)
  ) {
    return undefined;
  }

  return {
    schemaVersion: "dowze-formation@1",
    packageVersion,
    id,
    name,
    shortName,
    yearLabel,
    description,
    locale,
    timeZone,
    academicYear: { startDate, endDate },
    level: { label: levelLabel, ...(framework ? { framework } : {}), targetAudience },
    pedagogy: { teachingLanguage, instructionLevel, approach },
    grading: { scaleMax, passMark },
    theme: { color: themeColor, accent: themeAccent, icon: themeIcon },
    files: expectedFiles,
    ...(author ? { author } : {}),
    ...(license ? { license } : {}),
    ...(objectives ? { objectives } : {}),
    ...(motto ? { motto } : {}),
    ...(specialization ? { specialization } : {}),
    ...(choices ? { choices } : {}),
    ...(pathway ? { pathway } : {})
  };
}

export function slugifyFormationName(name: string) {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    // Réserve dix caractères à la convention annuelle « -YYYY-YYYY » utilisée
    // par le générateur de kit, tout en gardant l’id final sous 64 caractères.
    .slice(0, 54)
    .replace(/-+$/g, "");
  return slug || "formation";
}

export function formationDisplayYear(value: FormationManifest | InstalledFormation) {
  const manifest = "manifest" in value ? value.manifest : value;
  const startYear = manifest.academicYear.startDate.slice(0, 4);
  const endYear = manifest.academicYear.endDate.slice(0, 4);
  return startYear === endYear ? startYear : `${startYear}–${endYear}`;
}

export const BUILTIN_ENERGY_FORMATION: InstalledFormation = {
  instanceId: "ingenierie-energie-annee-1",
  packageId: "ingenierie-energie-annee-1",
  packageVersion: "1.0.0",
  installedAt: "2026-09-07T00:00:00.000Z",
  storageKind: "legacy-energy-year1",
  manifest: {
    schemaVersion: "dowze-formation@1",
    packageVersion: "1.0.0",
    id: "ingenierie-energie-annee-1",
    name: "Ingénierie de l’énergie et physique appliquée",
    shortName: "Ingénierie énergie",
    yearLabel: "Année 1",
    description: "Première année du cursus historique d’ingénierie énergétique de Dowze Académie.",
    locale: "fr-CH",
    timeZone: "Europe/Zurich",
    academicYear: {
      startDate: "2026-09-07",
      endDate: "2027-07-24"
    },
    level: {
      label: "Spécialisation — année 1",
      targetAudience: "Étudiants en ingénierie de l’énergie et physique appliquée"
    },
    pedagogy: {
      teachingLanguage: "fr",
      instructionLevel: "Enseignement supérieur",
      approach: "Cours atomiques, exercices, évaluations et accompagnement par tuteur IA."
    },
    grading: {
      scaleMax: 20,
      passMark: 10
    },
    theme: {
      color: "#5868de",
      accent: "#eef0ff",
      icon: "zap"
    },
    files: {
      subjects: "matieres.json",
      curriculum: "programme.json",
      schedule: "planning.json",
      assessments: "evaluations.json",
      tasks: "taches.json"
    },
    specialization: "Ingénierie énergétique"
  }
};

function optionalEnum<T extends string>(
  object: JsonObject,
  key: string,
  allowed: ReadonlySet<T>,
  collector: IssueCollector,
  file: FormationImportIssue["file"],
  path: string
) {
  return enumValue(object[key], allowed, collector, file, `${path}.${key}`, true);
}

function registerUniqueId(
  id: string | undefined,
  known: Set<string>,
  collector: IssueCollector,
  file: FormationImportIssue["file"],
  path: string
) {
  if (!id) return;
  if (known.has(id)) {
    collector.error(file, path, "duplicate-id", `L’identifiant « ${id} » est utilisé plusieurs fois.`);
  }
  known.add(id);
}

function parseSubjectsFile(value: unknown, collector: IssueCollector): RawSubject[] | undefined {
  const file = "matieres.json" as const;
  const before = collector.errorCount();
  const root = strictObject(value, ["schemaVersion", "subjects"], collector, file, "$" );
  if (!root) return undefined;
  const schemaVersion = requiredText(root, "schemaVersion", collector, file, "$", 40);
  if (schemaVersion && schemaVersion !== "dowze-subjects@1") {
    collector.error(file, "$.schemaVersion", "unsupported-schema", "La version attendue est dowze-subjects@1.");
  }
  const entries = requiredArray(root, "subjects", collector, file, "$", { min: 1, max: 100 });
  const ids = new Set<string>();
  const subjects: RawSubject[] = [];

  for (const [index, entry] of (entries ?? []).entries()) {
    const path = `$.subjects[${index}]`;
    const object = strictObject(
      entry,
      [
        "id",
        "name",
        "shortName",
        "teacher",
        "room",
        "color",
        "accent",
        "icon",
        "nextClass",
        "domain",
        "period",
        "validation",
        "chapterCount",
        "objective",
        "cefrLevel",
        "languageCode",
        "languageName"
      ],
      collector,
      file,
      path
    );
    if (!object) continue;
    const id = requiredId(object, "id", collector, file, path);
    registerUniqueId(id, ids, collector, file, `${path}.id`);
    const name = requiredText(object, "name", collector, file, path, 200);
    const shortName = requiredText(object, "shortName", collector, file, path, 80);
    const teacher = requiredText(object, "teacher", collector, file, path, 200);
    const room = requiredText(object, "room", collector, file, path, 200);
    const color = colorValue(requiredValue(object, "color", collector, file, path), collector, file, `${path}.color`);
    const accent = colorValue(requiredValue(object, "accent", collector, file, path), collector, file, `${path}.accent`);
    const icon = enumValue(
      requiredValue(object, "icon", collector, file, path),
      SUBJECT_ICONS,
      collector,
      file,
      `${path}.icon`
    );
    const nextClass = optionalText(object, "nextClass", collector, file, path, 200);
    const domain = optionalText(object, "domain", collector, file, path, 200);
    const period = optionalText(object, "period", collector, file, path, 200);
    const validation = optionalText(object, "validation", collector, file, path, 2_000);
    const objective = optionalText(object, "objective", collector, file, path, 2_000);
    const cefrLevel = optionalEnum(object, "cefrLevel", CEFR_LEVELS, collector, file, path);
    const languageCode = optionalText(object, "languageCode", collector, file, path, 40);
    if (languageCode) {
      validateCanonicalBcp47(
        languageCode,
        collector,
        file,
        `${path}.languageCode`,
        "Le code de langue"
      );
    }
    const languageName = optionalText(object, "languageName", collector, file, path, 80);
    const chapterCount = object.chapterCount === undefined
      ? undefined
      : finiteNumber(object.chapterCount, collector, file, `${path}.chapterCount`, {
        integer: true,
        min: 1,
        max: 10_000
      });

    if (id && name && shortName && teacher && room && color && accent && icon) {
      subjects.push({
        id,
        name,
        shortName,
        teacher,
        room,
        color,
        accent,
        icon,
        ...(nextClass ? { nextClass } : {}),
        ...(domain ? { domain } : {}),
        ...(period ? { period } : {}),
        ...(validation ? { validation } : {}),
        ...(chapterCount !== undefined ? { chapterCount } : {}),
        ...(objective ? { objective } : {}),
        ...(cefrLevel ? { cefrLevel } : {}),
        ...(languageCode ? { languageCode } : {}),
        ...(languageName ? { languageName } : {})
      });
    }
  }

  return collector.errorCount() === before && schemaVersion === "dowze-subjects@1"
    ? subjects
    : undefined;
}

function parseCurriculumFile(value: unknown, collector: IssueCollector): RawProgram[] | undefined {
  const file = "programme.json" as const;
  const before = collector.errorCount();
  const root = strictObject(value, ["schemaVersion", "programs"], collector, file, "$" );
  if (!root) return undefined;
  const schemaVersion = requiredText(root, "schemaVersion", collector, file, "$", 40);
  if (schemaVersion && schemaVersion !== "dowze-curriculum@1") {
    collector.error(file, "$.schemaVersion", "unsupported-schema", "La version attendue est dowze-curriculum@1.");
  }
  const programEntries = requiredArray(root, "programs", collector, file, "$", { min: 1, max: 100 });
  const subjectIds = new Set<string>();
  const moduleIds = new Set<string>();
  const chapterIds = new Set<string>();
  const lessonIds = new Set<string>();
  const programs: RawProgram[] = [];
  let moduleCount = 0;
  let chapterCount = 0;
  let lessonCount = 0;

  for (const [programIndex, entry] of (programEntries ?? []).entries()) {
    const path = `$.programs[${programIndex}]`;
    const object = strictObject(entry, ["subjectId", "modules"], collector, file, path);
    if (!object) continue;
    const subjectId = idValue(requiredValue(object, "subjectId", collector, file, path), collector, file, `${path}.subjectId`);
    registerUniqueId(subjectId, subjectIds, collector, file, `${path}.subjectId`);
    const moduleEntries = requiredArray(object, "modules", collector, file, path, { min: 1, max: 1_000 });
    moduleCount += moduleEntries?.length ?? 0;
    if (moduleCount > 1_000) {
      collector.error(file, `${path}.modules`, "limit-exceeded", "Le paquet dépasse 1 000 modules.");
      break;
    }
    const modules: RawModule[] = [];

    for (const [moduleIndex, moduleEntry] of (moduleEntries ?? []).entries()) {
      const modulePath = `${path}.modules[${moduleIndex}]`;
      const moduleObject = strictObject(
        moduleEntry,
        ["id", "period", "title", "cefrLevel", "items"],
        collector,
        file,
        modulePath
      );
      if (!moduleObject) continue;
      const moduleId = requiredId(moduleObject, "id", collector, file, modulePath);
      registerUniqueId(moduleId, moduleIds, collector, file, `${modulePath}.id`);
      const period = requiredText(moduleObject, "period", collector, file, modulePath, 200);
      const title = requiredText(moduleObject, "title", collector, file, modulePath, 500);
      const cefrLevel = optionalEnum(moduleObject, "cefrLevel", CEFR_LEVELS, collector, file, modulePath);
      const itemEntries = requiredArray(moduleObject, "items", collector, file, modulePath, {
        min: 1,
        max: 10_000
      });
      chapterCount += itemEntries?.length ?? 0;
      if (chapterCount > 10_000) {
        collector.error(file, `${modulePath}.items`, "limit-exceeded", "Le paquet dépasse 10 000 chapitres.");
        break;
      }
      const items: RawChapter[] = [];

      for (const [itemIndex, itemEntry] of (itemEntries ?? []).entries()) {
        const itemPath = `${modulePath}.items[${itemIndex}]`;
        const itemObject = strictObject(
          itemEntry,
          ["id", "title", "description", "lessons"],
          collector,
          file,
          itemPath
        );
        if (!itemObject) continue;
        const itemId = requiredId(itemObject, "id", collector, file, itemPath);
        registerUniqueId(itemId, chapterIds, collector, file, `${itemPath}.id`);
        const itemTitle = requiredText(itemObject, "title", collector, file, itemPath, 500);
        const itemDescription = optionalText(itemObject, "description", collector, file, itemPath, 4_000);
        const lessonEntries = requiredArray(itemObject, "lessons", collector, file, itemPath, {
          min: 1,
          max: 50_000
        });
        lessonCount += lessonEntries?.length ?? 0;
        if (lessonCount > 50_000) {
          collector.error(file, `${itemPath}.lessons`, "limit-exceeded", "Le paquet dépasse 50 000 cours atomiques.");
          break;
        }
        const lessons: RawLesson[] = [];

        for (const [lessonIndex, lessonEntry] of (lessonEntries ?? []).entries()) {
          const lessonPath = `${itemPath}.lessons[${lessonIndex}]`;
          const lessonObject = strictObject(
            lessonEntry,
            ["id", "title", "objective"],
            collector,
            file,
            lessonPath
          );
          if (!lessonObject) continue;
          const lessonId = requiredId(lessonObject, "id", collector, file, lessonPath);
          registerUniqueId(lessonId, lessonIds, collector, file, `${lessonPath}.id`);
          const lessonTitle = requiredText(lessonObject, "title", collector, file, lessonPath, 500);
          const objective = requiredText(lessonObject, "objective", collector, file, lessonPath, 2_000);
          if (lessonId && lessonTitle && objective) lessons.push({ id: lessonId, title: lessonTitle, objective });
        }

        if (itemId && itemTitle && lessons.length > 0) {
          items.push({
            id: itemId,
            title: itemTitle,
            ...(itemDescription ? { description: itemDescription } : {}),
            lessons
          });
        }
      }

      if (moduleId && period && title && items.length > 0) {
        modules.push({ id: moduleId, period, title, ...(cefrLevel ? { cefrLevel } : {}), items });
      }
    }

    if (subjectId && modules.length > 0) programs.push({ subjectId, modules });
  }

  return collector.errorCount() === before && schemaVersion === "dowze-curriculum@1"
    ? programs
    : undefined;
}

function parsePeriodLike(
  value: unknown,
  collector: IssueCollector,
  file: "planning.json",
  path: string,
  withDescription: boolean
): RawPeriod | RawClosure | undefined {
  const object = strictObject(
    value,
    withDescription ? ["id", "title", "startDate", "endDate", "description"] : ["id", "title", "startDate", "endDate"],
    collector,
    file,
    path
  );
  if (!object) return undefined;
  const id = requiredId(object, "id", collector, file, path);
  const title = requiredText(object, "title", collector, file, path, 500);
  const startDate = dateValue(requiredValue(object, "startDate", collector, file, path), collector, file, `${path}.startDate`);
  const endDate = dateValue(requiredValue(object, "endDate", collector, file, path), collector, file, `${path}.endDate`);
  if (startDate && endDate && endDate < startDate) {
    collector.error(file, `${path}.endDate`, "invalid-range", "La fin doit suivre le début de la période.");
  }
  const description = withDescription ? optionalText(object, "description", collector, file, path, 4_000) : undefined;
  if (!id || !title || !startDate || !endDate) return undefined;
  return { id, title, startDate, endDate, ...(description ? { description } : {}) };
}

function checkDateBounds(
  date: string,
  manifest: FormationManifest,
  collector: IssueCollector,
  file: FormationImportIssue["file"],
  path: string
) {
  if (!isDateWithin(date, manifest.academicYear.startDate, manifest.academicYear.endDate)) {
    collector.error(file, path, "date-out-of-range", "La date doit rester dans l’année scolaire du manifeste.");
    return false;
  }
  return true;
}

function parseLocalDateTime(
  value: unknown,
  manifest: FormationManifest,
  collector: IssueCollector,
  file: FormationImportIssue["file"],
  path: string
): { value: string; instant: Date } | undefined {
  if (typeof value !== "string" || !LOCAL_DATE_TIME_PATTERN.test(value)) {
    collector.error(file, path, "invalid-date-time", "Une date et heure locale au format YYYY-MM-DDTHH:mm est attendue.");
    return undefined;
  }
  if (!isValidDateKey(value.slice(0, 10))) {
    collector.error(file, path, "invalid-date-time", "La date locale n’existe pas.");
    return undefined;
  }
  if (!checkDateBounds(value.slice(0, 10), manifest, collector, file, path)) return undefined;
  try {
    return { value, instant: dateFromTimeZoneInput(value, manifest.timeZone) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Date et heure invalides.";
    collector.error(
      file,
      path,
      message.includes("n’existe pas") ? "nonexistent-local-time" : "invalid-date-time",
      message
    );
    return undefined;
  }
}

function parseScheduleFile(
  value: unknown,
  manifest: FormationManifest,
  collector: IssueCollector
): RawSchedule | undefined {
  const file = "planning.json" as const;
  const before = collector.errorCount();
  const root = strictObject(
    value,
    ["schemaVersion", "periods", "closures", "weeklySlots", "events"],
    collector,
    file,
    "$"
  );
  if (!root) return undefined;
  const schemaVersion = requiredText(root, "schemaVersion", collector, file, "$", 40);
  if (schemaVersion && schemaVersion !== "dowze-schedule@1") {
    collector.error(file, "$.schemaVersion", "unsupported-schema", "La version attendue est dowze-schedule@1.");
  }

  const periodEntries = requiredArray(root, "periods", collector, file, "$", { min: 1, max: 50 });
  const closureEntries = requiredArray(root, "closures", collector, file, "$", { max: 500 });
  const slotEntries = requiredArray(root, "weeklySlots", collector, file, "$", { max: 1_000 });
  const eventEntries = requiredArray(root, "events", collector, file, "$", { max: 5_000 });
  const periods: RawPeriod[] = [];
  const closures: RawClosure[] = [];
  const weeklySlots: RawWeeklySlot[] = [];
  const events: RawDirectEvent[] = [];
  const periodIds = new Set<string>();
  const closureIds = new Set<string>();
  const slotIds = new Set<string>();
  const eventIds = new Set<string>();

  for (const [index, entry] of (periodEntries ?? []).entries()) {
    const path = `$.periods[${index}]`;
    const period = parsePeriodLike(entry, collector, file, path, false) as RawPeriod | undefined;
    registerUniqueId(period?.id, periodIds, collector, file, `${path}.id`);
    if (period) {
      checkDateBounds(period.startDate, manifest, collector, file, `${path}.startDate`);
      checkDateBounds(period.endDate, manifest, collector, file, `${path}.endDate`);
      periods.push(period);
    }
  }

  const sortedPeriods = [...periods].sort((left, right) => left.startDate.localeCompare(right.startDate));
  for (let index = 1; index < sortedPeriods.length; index += 1) {
    if (sortedPeriods[index].startDate <= sortedPeriods[index - 1].endDate) {
      collector.error(
        file,
        "$.periods",
        "overlapping-periods",
        `Les périodes « ${sortedPeriods[index - 1].id} » et « ${sortedPeriods[index].id} » se chevauchent.`
      );
    }
  }

  for (const [index, entry] of (closureEntries ?? []).entries()) {
    const path = `$.closures[${index}]`;
    const closure = parsePeriodLike(entry, collector, file, path, true) as RawClosure | undefined;
    registerUniqueId(closure?.id, closureIds, collector, file, `${path}.id`);
    if (closure) {
      checkDateBounds(closure.startDate, manifest, collector, file, `${path}.startDate`);
      checkDateBounds(closure.endDate, manifest, collector, file, `${path}.endDate`);
      closures.push(closure);
    }
  }

  for (const [index, entry] of (slotEntries ?? []).entries()) {
    const path = `$.weeklySlots[${index}]`;
    const object = strictObject(
      entry,
      [
        "id",
        "periodIds",
        "weekdays",
        "startTime",
        "durationMinutes",
        "title",
        "description",
        "subjectId",
        "type",
        "color",
        "location"
      ],
      collector,
      file,
      path
    );
    if (!object) continue;
    const id = requiredId(object, "id", collector, file, path);
    registerUniqueId(id, slotIds, collector, file, `${path}.id`);
    const periodIdEntries = requiredArray(object, "periodIds", collector, file, path, { min: 1, max: 50 });
    const parsedPeriodIds = (periodIdEntries ?? [])
      .map((periodId, periodIndex) => idValue(periodId, collector, file, `${path}.periodIds[${periodIndex}]`))
      .filter((periodId): periodId is string => Boolean(periodId));
    if (new Set(parsedPeriodIds).size !== parsedPeriodIds.length) {
      collector.error(file, `${path}.periodIds`, "duplicate-id", "Une période ne peut être référencée deux fois par le même créneau.");
    }
    const weekdayEntries = requiredArray(object, "weekdays", collector, file, path, { min: 1, max: 7 });
    const weekdays = (weekdayEntries ?? [])
      .map((weekday, weekdayIndex) => finiteNumber(weekday, collector, file, `${path}.weekdays[${weekdayIndex}]`, {
        integer: true,
        min: 1,
        max: 7
      }))
      .filter((weekday): weekday is number => weekday !== undefined);
    if (new Set(weekdays).size !== weekdays.length) {
      collector.error(file, `${path}.weekdays`, "duplicate-value", "Chaque jour de semaine doit être unique.");
    }
    const startTime = requiredText(object, "startTime", collector, file, path, 5);
    if (startTime && !TIME_PATTERN.test(startTime)) {
      collector.error(file, `${path}.startTime`, "invalid-time", "Une heure HH:mm entre 00:00 et 23:59 est attendue.");
    }
    const durationMinutes = requiredNumber(object, "durationMinutes", collector, file, path, {
      integer: true,
      min: 1,
      max: 1_440
    });
    const title = requiredText(object, "title", collector, file, path, 500);
    const description = optionalText(object, "description", collector, file, path, 4_000);
    const subjectId = object.subjectId === undefined
      ? undefined
      : idValue(object.subjectId, collector, file, `${path}.subjectId`);
    const type = enumValue(requiredValue(object, "type", collector, file, path), EVENT_TYPES, collector, file, `${path}.type`);
    const color = colorValue(object.color, collector, file, `${path}.color`, true);
    const location = optionalText(object, "location", collector, file, path, 500);
    if (
      id &&
      parsedPeriodIds.length > 0 &&
      weekdays.length > 0 &&
      startTime &&
      TIME_PATTERN.test(startTime) &&
      durationMinutes !== undefined &&
      title &&
      type
    ) {
      weeklySlots.push({
        id,
        periodIds: parsedPeriodIds,
        weekdays,
        startTime,
        durationMinutes,
        title,
        type,
        ...(description ? { description } : {}),
        ...(subjectId ? { subjectId } : {}),
        ...(color ? { color } : {}),
        ...(location ? { location } : {})
      });
    }
  }

  for (const [index, entry] of (eventEntries ?? []).entries()) {
    const path = `$.events[${index}]`;
    const object = strictObject(
      entry,
      ["id", "title", "startLocal", "endLocal", "description", "subjectId", "type", "color", "location"],
      collector,
      file,
      path
    );
    if (!object) continue;
    const id = requiredId(object, "id", collector, file, path);
    registerUniqueId(id, eventIds, collector, file, `${path}.id`);
    const title = requiredText(object, "title", collector, file, path, 500);
    const start = parseLocalDateTime(requiredValue(object, "startLocal", collector, file, path), manifest, collector, file, `${path}.startLocal`);
    const end = parseLocalDateTime(requiredValue(object, "endLocal", collector, file, path), manifest, collector, file, `${path}.endLocal`);
    if (start && end && end.instant.getTime() <= start.instant.getTime()) {
      collector.error(file, `${path}.endLocal`, "invalid-range", "La fin de l’événement doit suivre son début.");
    }
    const description = optionalText(object, "description", collector, file, path, 4_000);
    const subjectId = object.subjectId === undefined
      ? undefined
      : idValue(object.subjectId, collector, file, `${path}.subjectId`);
    const type = enumValue(requiredValue(object, "type", collector, file, path), EVENT_TYPES, collector, file, `${path}.type`);
    const color = colorValue(object.color, collector, file, `${path}.color`, true);
    const location = optionalText(object, "location", collector, file, path, 500);
    if (id && title && start && end && end.instant > start.instant && type) {
      events.push({
        id,
        title,
        startLocal: start.value,
        endLocal: end.value,
        type,
        ...(description ? { description } : {}),
        ...(subjectId ? { subjectId } : {}),
        ...(color ? { color } : {}),
        ...(location ? { location } : {})
      });
    }
  }

  return collector.errorCount() === before && schemaVersion === "dowze-schedule@1"
    ? { periods, closures, weeklySlots, events }
    : undefined;
}

function parseAssessmentsFile(
  value: unknown,
  manifest: FormationManifest,
  collector: IssueCollector
): RawAssessment[] | undefined {
  const file = "evaluations.json" as const;
  const before = collector.errorCount();
  const root = strictObject(value, ["schemaVersion", "assessments"], collector, file, "$" );
  if (!root) return undefined;
  const schemaVersion = requiredText(root, "schemaVersion", collector, file, "$", 40);
  if (schemaVersion && schemaVersion !== "dowze-assessments@1") {
    collector.error(file, "$.schemaVersion", "unsupported-schema", "La version attendue est dowze-assessments@1.");
  }
  const entries = requiredArray(root, "assessments", collector, file, "$", { max: 5_000 });
  const ids = new Set<string>();
  const assessments: RawAssessment[] = [];

  for (const [index, entry] of (entries ?? []).entries()) {
    const path = `$.assessments[${index}]`;
    const object = strictObject(
      entry,
      [
        "id",
        "title",
        "subjectId",
        "kind",
        "scheduledAt",
        "durationMinutes",
        "chapterIds",
        "allowedMaterials",
        "instructions",
        "color",
        "location"
      ],
      collector,
      file,
      path
    );
    if (!object) continue;
    const id = requiredId(object, "id", collector, file, path);
    registerUniqueId(id, ids, collector, file, `${path}.id`);
    const title = requiredText(object, "title", collector, file, path, 500);
    const subjectId = idValue(
      requiredValue(object, "subjectId", collector, file, path),
      collector,
      file,
      `${path}.subjectId`
    );
    const kind = enumValue(
      requiredValue(object, "kind", collector, file, path),
      ASSESSMENT_KINDS,
      collector,
      file,
      `${path}.kind`
    );
    const scheduledAt = parseLocalDateTime(
      requiredValue(object, "scheduledAt", collector, file, path),
      manifest,
      collector,
      file,
      `${path}.scheduledAt`
    );
    const durationMinutes = requiredNumber(object, "durationMinutes", collector, file, path, {
      integer: true,
      min: 10,
      max: 360
    });
    if (scheduledAt && durationMinutes !== undefined) {
      const end = new Date(scheduledAt.instant.getTime() + durationMinutes * 60_000);
      if (!isDateWithin(dateKeyAtTimeZone(end, manifest.timeZone), manifest.academicYear.startDate, manifest.academicYear.endDate)) {
        collector.error(file, `${path}.durationMinutes`, "date-out-of-range", "L’évaluation doit se terminer dans l’année scolaire.");
      }
    }
    const chapterEntries = requiredArray(object, "chapterIds", collector, file, path, { min: 1, max: 10_000 });
    const chapterIds = (chapterEntries ?? [])
      .map((chapterId, chapterIndex) => idValue(chapterId, collector, file, `${path}.chapterIds[${chapterIndex}]`))
      .filter((chapterId): chapterId is string => Boolean(chapterId));
    if (new Set(chapterIds).size !== chapterIds.length) {
      collector.error(file, `${path}.chapterIds`, "duplicate-id", "Chaque chapitre doit être référencé au plus une fois.");
    }
    const allowedMaterials = requiredText(object, "allowedMaterials", collector, file, path, 2_000);
    const instructions = optionalText(object, "instructions", collector, file, path, 4_000);
    const color = colorValue(object.color, collector, file, `${path}.color`, true);
    const location = optionalText(object, "location", collector, file, path, 500);
    if (
      id &&
      title &&
      subjectId &&
      kind &&
      scheduledAt &&
      durationMinutes !== undefined &&
      allowedMaterials
    ) {
      assessments.push({
        id,
        title,
        subjectId,
        kind,
        scheduledAt: scheduledAt.value,
        durationMinutes,
        chapterIds,
        allowedMaterials,
        ...(instructions ? { instructions } : {}),
        ...(color ? { color } : {}),
        ...(location ? { location } : {})
      });
    }
  }

  return collector.errorCount() === before && schemaVersion === "dowze-assessments@1"
    ? assessments
    : undefined;
}

function parseTasksFile(
  value: unknown,
  manifest: FormationManifest,
  collector: IssueCollector
): RawTask[] | undefined {
  const file = "taches.json" as const;
  const before = collector.errorCount();
  const root = strictObject(value, ["schemaVersion", "tasks"], collector, file, "$" );
  if (!root) return undefined;
  const schemaVersion = requiredText(root, "schemaVersion", collector, file, "$", 40);
  if (schemaVersion && schemaVersion !== "dowze-tasks@1") {
    collector.error(file, "$.schemaVersion", "unsupported-schema", "La version attendue est dowze-tasks@1.");
  }
  const entries = requiredArray(root, "tasks", collector, file, "$", { max: 5_000 });
  const ids = new Set<string>();
  const tasks: RawTask[] = [];

  for (const [index, entry] of (entries ?? []).entries()) {
    const path = `$.tasks[${index}]`;
    const object = strictObject(
      entry,
      ["id", "title", "subjectId", "dueAt", "priority"],
      collector,
      file,
      path
    );
    if (!object) continue;
    const id = requiredId(object, "id", collector, file, path);
    registerUniqueId(id, ids, collector, file, `${path}.id`);
    const title = requiredText(object, "title", collector, file, path, 500);
    const subjectId = object.subjectId === undefined
      ? undefined
      : idValue(object.subjectId, collector, file, `${path}.subjectId`);
    const dueAt = parseLocalDateTime(
      requiredValue(object, "dueAt", collector, file, path),
      manifest,
      collector,
      file,
      `${path}.dueAt`
    );
    const priority = enumValue(
      requiredValue(object, "priority", collector, file, path),
      TASK_PRIORITIES,
      collector,
      file,
      `${path}.priority`
    );
    if (id && title && dueAt && priority) {
      tasks.push({
        id,
        title,
        dueAt: dueAt.instant.toISOString(),
        priority,
        ...(subjectId ? { subjectId } : {})
      });
    }
  }

  return collector.errorCount() === before && schemaVersion === "dowze-tasks@1"
    ? tasks
    : undefined;
}

function parsePackageJsonFiles(files: FormationPackageFiles, collector: IssueCollector) {
  const values: Partial<Record<FormationRequiredFilename, unknown>> = {};
  if (!isPlainObject(files)) {
    collector.error("package", "$", "invalid-type", "Le paquet doit fournir les six fichiers JSON requis.");
    return values;
  }
  const allowedPackageKeys = new Set<string>([...FORMATION_REQUIRED_FILES, "directoryName"]);
  for (const key of Object.keys(files)) {
    if (!allowedPackageKeys.has(key)) {
      collector.error("package", `$.${key}`, "unexpected-file", `Le fichier ou champ « ${key} » n’est pas autorisé.`);
      if (collector.isTruncated()) break;
    }
  }
  if (files.directoryName !== undefined && typeof files.directoryName !== "string") {
    collector.error("package", "$.directoryName", "invalid-type", "Le nom du dossier doit être une chaîne.");
  }
  const encodedSizes = new Map<FormationRequiredFilename, number>();
  let packageSize = 0;
  for (const filename of FORMATION_REQUIRED_FILES) {
    const content = files[filename];
    if (typeof content !== "string") continue;
    const size = new TextEncoder().encode(content).byteLength;
    encodedSizes.set(filename, size);
    packageSize += size;
  }
  if (packageSize > MAX_PACKAGE_BYTES) {
    collector.error(
      "package",
      "$",
      "package-too-large",
      `L’ensemble des six fichiers dépasse la limite de ${MAX_PACKAGE_BYTES} octets.`
    );
  }
  for (const filename of FORMATION_REQUIRED_FILES) {
    const content = files[filename];
    if (typeof content !== "string") {
      collector.error(filename, "$", "missing-file", `Le fichier obligatoire « ${filename} » est absent.`);
      continue;
    }
    if ((encodedSizes.get(filename) ?? 0) > MAX_FILE_BYTES) {
      collector.error(filename, "$", "file-too-large", `Le fichier dépasse la limite de ${MAX_FILE_BYTES} octets.`);
      continue;
    }
    try {
      values[filename] = JSON.parse(content) as unknown;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "JSON invalide";
      collector.error(filename, "$", "invalid-json", `JSON invalide : ${detail}`);
    }
  }
  return values;
}

function validateReferences(
  rawSubjects: RawSubject[],
  programs: RawProgram[],
  schedule: RawSchedule,
  assessments: RawAssessment[],
  tasks: RawTask[],
  collector: IssueCollector
) {
  const subjects = new Map(rawSubjects.map((subject) => [subject.id, subject]));
  const programsBySubject = new Map(programs.map((program) => [program.subjectId, program]));
  for (const [index, program] of programs.entries()) {
    if (!subjects.has(program.subjectId)) {
      collector.error(
        "programme.json",
        `$.programs[${index}].subjectId`,
        "unknown-reference",
        `La matière « ${program.subjectId} » n’existe pas dans matieres.json.`
      );
    }
  }
  for (const [index, subject] of rawSubjects.entries()) {
    const program = programsBySubject.get(subject.id);
    if (!program) {
      collector.error(
        "programme.json",
        "$.programs",
        "missing-reference",
        `Aucun programme n’est défini pour la matière « ${subject.id} » (matière ${index + 1}).`
      );
    }
    const languageMetadataIsComplete = Boolean(subject.languageCode && subject.languageName);
    if (Boolean(subject.languageCode) !== Boolean(subject.languageName)) {
      collector.error(
        "matieres.json",
        `$.subjects[${index}]`,
        "incomplete-language-metadata",
        "languageCode et languageName doivent toujours être fournis ensemble."
      );
    }
    const hasCefrLevel = Boolean(
      subject.cefrLevel || program?.modules.some((courseModule) => courseModule.cefrLevel)
    );
    if (hasCefrLevel && !languageMetadataIsComplete) {
      collector.error(
        "matieres.json",
        `$.subjects[${index}]`,
        "missing-language-metadata",
        "Une matière ou un module CECRL exige languageCode et languageName afin de ne jamais supposer l’anglais."
      );
    }
  }

  const chapterSubjects = new Map<string, string>();
  for (const program of programs) {
    for (const module of program.modules) {
      for (const chapter of module.items) chapterSubjects.set(chapter.id, program.subjectId);
    }
  }
  const periodIds = new Set(schedule.periods.map((period) => period.id));
  for (const [index, slot] of schedule.weeklySlots.entries()) {
    for (const [periodIndex, periodId] of slot.periodIds.entries()) {
      if (!periodIds.has(periodId)) {
        collector.error(
          "planning.json",
          `$.weeklySlots[${index}].periodIds[${periodIndex}]`,
          "unknown-reference",
          `La période « ${periodId} » n’existe pas.`
        );
      }
    }
    if (slot.subjectId && !subjects.has(slot.subjectId)) {
      collector.error(
        "planning.json",
        `$.weeklySlots[${index}].subjectId`,
        "unknown-reference",
        `La matière « ${slot.subjectId} » n’existe pas.`
      );
    }
  }
  for (const [index, event] of schedule.events.entries()) {
    if (event.subjectId && !subjects.has(event.subjectId)) {
      collector.error(
        "planning.json",
        `$.events[${index}].subjectId`,
        "unknown-reference",
        `La matière « ${event.subjectId} » n’existe pas.`
      );
    }
  }
  for (const [index, assessment] of assessments.entries()) {
    if (!subjects.has(assessment.subjectId)) {
      collector.error(
        "evaluations.json",
        `$.assessments[${index}].subjectId`,
        "unknown-reference",
        `La matière « ${assessment.subjectId} » n’existe pas.`
      );
    }
    for (const [chapterIndex, chapterId] of assessment.chapterIds.entries()) {
      const chapterSubject = chapterSubjects.get(chapterId);
      if (!chapterSubject) {
        collector.error(
          "evaluations.json",
          `$.assessments[${index}].chapterIds[${chapterIndex}]`,
          "unknown-reference",
          `Le chapitre « ${chapterId} » n’existe pas.`
        );
      } else if (chapterSubject !== assessment.subjectId) {
        collector.error(
          "evaluations.json",
          `$.assessments[${index}].chapterIds[${chapterIndex}]`,
          "reference-mismatch",
          `Le chapitre « ${chapterId} » appartient à une autre matière.`
        );
      }
    }
  }
  for (const [index, task] of tasks.entries()) {
    if (task.subjectId && !subjects.has(task.subjectId)) {
      collector.error(
        "taches.json",
        `$.tasks[${index}].subjectId`,
        "unknown-reference",
        `La matière « ${task.subjectId} » n’existe pas.`
      );
    }
  }

  for (const [index, subject] of rawSubjects.entries()) {
    const actualCount = programsBySubject
      .get(subject.id)
      ?.modules.reduce((total, module) => total + module.items.length, 0);
    if (subject.chapterCount !== undefined && actualCount !== undefined && subject.chapterCount !== actualCount) {
      collector.error(
        "matieres.json",
        `$.subjects[${index}].chapterCount`,
        "inconsistent-count",
        `chapterCount annonce ${subject.chapterCount}, mais programme.json contient ${actualCount} chapitre(s).`
      );
    }
  }
}

function compileSubjects(rawSubjects: RawSubject[], programs: RawProgram[]): Subject[] {
  const programsBySubject = new Map(programs.map((program) => [program.subjectId, program]));
  return rawSubjects.map((rawSubject) => {
    const program = programsBySubject.get(rawSubject.id)!;
    const modules = program.modules.map((rawModule) => ({
      id: rawModule.id,
      period: rawModule.period,
      title: rawModule.title,
      ...(rawModule.cefrLevel ? { cefrLevel: rawModule.cefrLevel } : {}),
      items: rawModule.items.map((rawItem) => ({
        id: rawItem.id,
        title: rawItem.title,
        ...(rawItem.description ? { description: rawItem.description } : {}),
        completed: false,
        lessons: rawItem.lessons.map((rawLesson) => ({
          id: rawLesson.id,
          title: rawLesson.title,
          objective: rawLesson.objective,
          completed: false
        }))
      }))
    }));
    const chapterCount = modules.reduce((total, module) => total + module.items.length, 0);
    return {
      ...rawSubject,
      chapterCount,
      modules
    };
  });
}

function compileEvents(
  manifest: FormationManifest,
  subjects: Subject[],
  schedule: RawSchedule,
  assessments: RawAssessment[],
  collector: IssueCollector,
  requestedLimit: number | undefined
) {
  const limit = Number.isInteger(requestedLimit) && (requestedLimit ?? 0) > 0
    ? Math.min(requestedLimit!, MAX_EXPANDED_EVENTS)
    : MAX_EXPANDED_EVENTS;
  const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
  const periodById = new Map(schedule.periods.map((period) => [period.id, period]));
  const closureDates = new Set<string>();
  for (const closure of schedule.closures) {
    for (let date = closure.startDate; date <= closure.endDate; date = addCalendarDays(date, 1)) {
      closureDates.add(date);
    }
  }

  const events: CalendarEvent[] = [];
  const ids = new Set<string>();
  let limitReported = false;
  const addEvent = (
    event: CalendarEvent,
    file: "planning.json" | "evaluations.json",
    path: string
  ) => {
    if (ids.has(event.id)) {
      collector.error(file, path, "duplicate-event-id", `L’identifiant d’événement compilé « ${event.id} » existe déjà.`);
      return;
    }
    ids.add(event.id);
    if (events.length >= limit) {
      if (!limitReported) {
        collector.error(
          file,
          path,
          "event-limit",
          `Le planning compilé dépasse la limite de ${limit.toLocaleString("fr-CH")} événements.`
        );
        limitReported = true;
      }
      return;
    }
    events.push(event);
  };

  for (const [index, closure] of schedule.closures.entries()) {
    let start: Date;
    let end: Date;
    try {
      start = dateAtTimeZone(closure.startDate, 0, 0, manifest.timeZone);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Date civile invalide.";
      collector.error(
        "planning.json",
        `$.closures[${index}].startDate`,
        "nonexistent-local-date",
        message
      );
      continue;
    }
    try {
      end = dateAtTimeZone(addCalendarDays(closure.endDate, 1), 0, 0, manifest.timeZone);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Date civile invalide.";
      collector.error(
        "planning.json",
        `$.closures[${index}].endDate`,
        "nonexistent-local-date",
        `La fin exclusive de cette fermeture est impossible : ${message}`
      );
      continue;
    }
    addEvent(
      {
        id: closure.id,
        title: closure.title,
        start: start.toISOString(),
        end: end.toISOString(),
        allDay: true,
        type: "break",
        color: manifest.theme.color,
        ...(closure.description ? { description: closure.description } : {})
      },
      "planning.json",
      `$.closures[${index}].id`
    );
  }

  for (const [slotIndex, slot] of schedule.weeklySlots.entries()) {
    for (const periodId of slot.periodIds) {
      const period = periodById.get(periodId);
      if (!period) continue;
      for (let date = period.startDate; date <= period.endDate; date = addCalendarDays(date, 1)) {
        const weekday = weekdayFromDateKey(date) || 7;
        if (!slot.weekdays.includes(weekday) || closureDates.has(date)) continue;
        const localStart = `${date}T${slot.startTime}`;
        let start: Date;
        try {
          start = dateFromTimeZoneInput(localStart, manifest.timeZone);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Date et heure invalides.";
          collector.error(
            "planning.json",
            `$.weeklySlots[${slotIndex}].startTime`,
            message.includes("n’existe pas") ? "nonexistent-local-time" : "invalid-date-time",
            `${message} (${localStart}, ${manifest.timeZone})`
          );
          continue;
        }
        const end = new Date(start.getTime() + slot.durationMinutes * 60_000);
        if (!isDateWithin(dateKeyAtTimeZone(end, manifest.timeZone), manifest.academicYear.startDate, manifest.academicYear.endDate)) {
          collector.error(
            "planning.json",
            `$.weeklySlots[${slotIndex}].durationMinutes`,
            "date-out-of-range",
            `Le créneau du ${date} se termine hors de l’année scolaire.`
          );
          continue;
        }
        addEvent(
          {
            id: `${slot.id}-${date}`,
            title: slot.title,
            start: start.toISOString(),
            end: end.toISOString(),
            type: slot.type,
            color: slot.color ?? (slot.subjectId ? subjectById.get(slot.subjectId)?.color : undefined) ?? manifest.theme.color,
            ...(slot.subjectId ? { subjectId: slot.subjectId } : {}),
            ...(slot.location ? { location: slot.location } : {}),
            ...(slot.description ? { description: slot.description } : {})
          },
          "planning.json",
          `$.weeklySlots[${slotIndex}].id`
        );
      }
    }
  }

  for (const [index, rawEvent] of schedule.events.entries()) {
    const start = dateFromTimeZoneInput(rawEvent.startLocal, manifest.timeZone);
    const end = dateFromTimeZoneInput(rawEvent.endLocal, manifest.timeZone);
    addEvent(
      {
        id: rawEvent.id,
        title: rawEvent.title,
        start: start.toISOString(),
        end: end.toISOString(),
        type: rawEvent.type,
        color:
          rawEvent.color ??
          (rawEvent.subjectId ? subjectById.get(rawEvent.subjectId)?.color : undefined) ??
          manifest.theme.color,
        ...(rawEvent.subjectId ? { subjectId: rawEvent.subjectId } : {}),
        ...(rawEvent.location ? { location: rawEvent.location } : {}),
        ...(rawEvent.description ? { description: rawEvent.description } : {})
      },
      "planning.json",
      `$.events[${index}].id`
    );
  }

  for (const [index, assessment] of assessments.entries()) {
    const start = dateFromTimeZoneInput(assessment.scheduledAt, manifest.timeZone);
    const end = new Date(start.getTime() + assessment.durationMinutes * 60_000);
    addEvent(
      {
        id: assessment.id,
        title: assessment.title,
        subjectId: assessment.subjectId,
        start: start.toISOString(),
        end: end.toISOString(),
        type: "exam",
        color: assessment.color ?? subjectById.get(assessment.subjectId)?.color ?? manifest.theme.color,
        ...(assessment.instructions ? { description: assessment.instructions } : {}),
        assessment: {
          eventId: assessment.id,
          kind: assessment.kind,
          title: assessment.title,
          scheduledAt: start.toISOString(),
          durationMinutes: assessment.durationMinutes,
          chapterIds: [...assessment.chapterIds],
          allowedMaterials: assessment.allowedMaterials,
          ...(assessment.instructions ? { instructions: assessment.instructions } : {})
        },
        ...(assessment.location ? { location: assessment.location } : {})
      },
      "evaluations.json",
      `$.assessments[${index}].id`
    );
  }

  return events.sort((left, right) => left.start.localeCompare(right.start) || left.id.localeCompare(right.id));
}

function validateAiPromptCompatibility(
  manifest: FormationManifest,
  subjects: Subject[],
  programs: RawProgram[],
  assessments: RawAssessment[],
  events: CalendarEvent[],
  collector: IssueCollector
) {
  const checkPrompt = (
    prompt: string,
    file: FormationImportIssue["file"],
    path: string,
    label: string
  ) => {
    const byteLength = aiPromptByteLength(prompt);
    if (byteLength <= NATIVE_AI_PROMPT_MAX_BYTES) return true;
    collector.error(
      file,
      path,
      "ai-prompt-too-large",
      `${label} produirait un prompt de ${byteLength} octets, au-delà de la limite native de ${NATIVE_AI_PROMPT_MAX_BYTES}. Réduis les textes ou découpe ce chapitre.`
    );
    return false;
  };

  for (const [subjectIndex, subject] of subjects.entries()) {
    if (!checkPrompt(
      buildLessonPrompt(subject, undefined, undefined, undefined, "course", manifest),
      "matieres.json",
      `$.subjects[${subjectIndex}]`,
      `La séance générale de « ${subject.shortName} »`
    )) return;

    const programIndex = programs.findIndex((program) => program.subjectId === subject.id);
    for (const [moduleIndex, courseModule] of subject.modules.entries()) {
      for (const [itemIndex, item] of courseModule.items.entries()) {
        const itemPath = `$.programs[${programIndex}].modules[${moduleIndex}].items[${itemIndex}]`;
        if (!checkPrompt(
          buildLessonPrompt(subject, courseModule, item, undefined, "chapter-test", manifest),
          "programme.json",
          `${itemPath}.lessons`,
          `Le mini-test du chapitre « ${item.title} »`
        )) return;

        for (const [lessonIndex, lesson] of (item.lessons ?? []).entries()) {
          for (const mode of ["course", "exercises"] as const) {
            if (!checkPrompt(
              buildLessonPrompt(subject, courseModule, item, lesson, mode, manifest),
              "programme.json",
              `${itemPath}.lessons[${lessonIndex}]`,
              `Le mode ${mode === "course" ? "cours" : "exercices"} de « ${lesson.title} »`
            )) return;
          }
        }
      }
    }
  }

  const eventById = new Map(events.map((event) => [event.id, event]));
  const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
  for (const [assessmentIndex, assessment] of assessments.entries()) {
    const event = eventById.get(assessment.id);
    const subject = subjectById.get(assessment.subjectId);
    if (!event?.assessment || !subject) continue;
    if (!checkPrompt(
      buildPaperAssessmentPrompt(subject, event.assessment, manifest),
      "evaluations.json",
      `$.assessments[${assessmentIndex}].chapterIds`,
      `L’évaluation « ${assessment.title} »`
    )) return;
  }
}

function hasForbiddenNativeControl(value: string) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return (
      codePoint === 0 ||
      ((codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) &&
        ![9, 10, 13].includes(codePoint))
    );
  });
}

function validateNativeCalendarText(
  value: string,
  maximumBytes: number,
  collector: IssueCollector,
  file: FormationImportIssue["file"],
  path: string,
  label: string
) {
  if (!value || value.trim() !== value || hasForbiddenNativeControl(value)) {
    collector.error(
      file,
      path,
      "calendar-field-invalid",
      `${label} est vide, comporte des espaces extérieurs ou contient un caractère de contrôle incompatible avec l’export calendrier.`
    );
    return false;
  }
  const bytes = utf8ByteLength(value);
  if (bytes > maximumBytes) {
    collector.error(
      file,
      path,
      "calendar-field-too-large",
      `${label} occupe ${bytes} octets, au-delà de la limite native de ${maximumBytes}.`
    );
    return false;
  }
  return true;
}

function validateCompiledEventStorageCompatibility(
  events: CalendarEvent[],
  assessmentIds: ReadonlySet<string>,
  collector: IssueCollector
) {
  for (const [index, event] of events.entries()) {
    const startYear = new Date(event.start).getUTCFullYear();
    const endYear = new Date(event.end).getUTCFullYear();
    if (startYear >= 1900 && endYear <= 2101) continue;
    collector.error(
      assessmentIds.has(event.id) ? "evaluations.json" : "planning.json",
      `$.compiledEvents[${index}]`,
      "compiled-date-out-of-range",
      `L’événement « ${event.title} » devient ${event.start} → ${event.end} en UTC, hors de la plage 1900–2101 lisible par l’application. Ajuste l’année ou le fuseau horaire.`
    );
    return;
  }
}

function validateCalendarExportCompatibility(
  manifest: FormationManifest,
  subjects: Subject[],
  events: CalendarEvent[],
  assessmentIds: ReadonlySet<string>,
  collector: IssueCollector
) {
  const calendarName = `Dowze Academie — ${manifest.shortName} · ${manifest.yearLabel}`;
  const calendarNameValid = validateNativeCalendarText(
    calendarName,
    200,
    collector,
    "formation.json",
    "$.shortName",
    "Le nom de calendrier généré"
  );
  for (const [index, subject] of subjects.entries()) {
    validateNativeCalendarText(
      subject.shortName || subject.name,
      300,
      collector,
      "matieres.json",
      `$.subjects[${index}].shortName`,
      "Le libellé calendrier de la matière"
    );
  }
  if (!events.length) {
    return;
  }

  const { exportedEvents, skippedEventIds } = toCalendarIcsEvents(
    events,
    subjects,
    manifest.timeZone
  );
  if (skippedEventIds.length) {
    collector.error(
      "planning.json",
      "$.compiledEvents",
      "calendar-event-invalid",
      `L’export calendrier ignorerait ${skippedEventIds.length} événement(s) invalide(s) : ${skippedEventIds.slice(0, 3).join(", ")}.`
    );
  }

  const fields: ReadonlyArray<{
    key: keyof Pick<CalendarIcsEvent, "id" | "title" | "category" | "location" | "description" | "subject">;
    maximumBytes: number;
    label: string;
  }> = [
    { key: "id", maximumBytes: 160, label: "L’identifiant de l’événement" },
    { key: "title", maximumBytes: 500, label: "Le titre de l’événement" },
    { key: "category", maximumBytes: 120, label: "La catégorie de l’événement" },
    { key: "location", maximumBytes: 1_000, label: "Le lieu de l’événement" },
    { key: "description", maximumBytes: 12_000, label: "La description de l’événement" },
    { key: "subject", maximumBytes: 300, label: "La matière de l’événement" }
  ];
  for (const [index, event] of exportedEvents.entries()) {
    const sourceFile = assessmentIds.has(event.id) ? "evaluations.json" : "planning.json";
    for (const field of fields) {
      const value = event[field.key];
      if (value === undefined) continue;
      validateNativeCalendarText(
        value,
        field.maximumBytes,
        collector,
        sourceFile,
        `$.compiledEvents[${index}].${field.key}`,
        field.label
      );
    }
  }
  if (!calendarNameValid || collector.errorCount() > 0) return;

  try {
    const calendarBytes = buildCalendarIcs(events, subjects, {
      calendarName,
      timeZone: manifest.timeZone,
      generatedAt: new Date("2000-01-01T00:00:00.000Z"),
      // Une formation importée reçoit un UUIDv4 à l’installation. Employer ici
      // sa longueur réelle évite qu’un aperçu sous-estime la taille exportée.
      uidNamespace: IMPORTED_FORMATION_UID_NAMESPACE_SAMPLE
    }).byteLength;
    if (calendarBytes > FORMATION_CALENDAR_ICS_MAX_BYTES) {
      collector.error(
        "planning.json",
        "$",
        "calendar-too-large",
        `Le calendrier complet occupe ${calendarBytes} octets, au-delà de la limite d’export de ${FORMATION_CALENDAR_ICS_MAX_BYTES}. Réduis les descriptions ou les occurrences.`
      );
    }
  } catch (error) {
    collector.error(
      "planning.json",
      "$",
      "calendar-build-failed",
      `Le calendrier ne peut pas être préparé : ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function emptyPreview(issues: FormationImportIssue[], manifest?: FormationManifest): FormationImportPreview {
  return {
    valid: false,
    issues,
    ...(manifest ? { manifest } : {}),
    subjects: [],
    events: [],
    tasks: [],
    counts: {
      subjects: 0,
      modules: 0,
      chapters: 0,
      lessons: 0,
      events: 0,
      tasks: 0
    }
  };
}

/**
 * Valide et compile un paquet sans écrire dans le stockage. Une entrée invalide
 * retourne toujours un aperçu et des erreurs localisées, jamais un état partiel.
 */
export function validateAndCompileFormationPackage(
  files: FormationPackageFiles,
  options: FormationValidationOptions = {}
): FormationImportPreview {
  const collector = new IssueCollector();
  const parsed = parsePackageJsonFiles(files, collector);
  const manifest = parsed["formation.json"] !== undefined
    ? parseManifest(parsed["formation.json"], collector)
    : undefined;

  if (manifest && files.directoryName !== undefined) {
    const expectedDirectoryName = `dowze-formation-${manifest.id}`;
    if (files.directoryName !== expectedDirectoryName) {
      collector.error(
        "package",
        "$.directoryName",
        "invalid-directory-name",
        `Le dossier doit s’appeler exactement « ${expectedDirectoryName} ».`
      );
    }
  }

  const rawSubjects = parsed["matieres.json"] !== undefined
    ? parseSubjectsFile(parsed["matieres.json"], collector)
    : undefined;
  const programs = parsed["programme.json"] !== undefined
    ? parseCurriculumFile(parsed["programme.json"], collector)
    : undefined;
  const schedule = manifest && parsed["planning.json"] !== undefined
    ? parseScheduleFile(parsed["planning.json"], manifest, collector)
    : undefined;
  const assessments = manifest && parsed["evaluations.json"] !== undefined
    ? parseAssessmentsFile(parsed["evaluations.json"], manifest, collector)
    : undefined;
  const rawTasks = manifest && parsed["taches.json"] !== undefined
    ? parseTasksFile(parsed["taches.json"], manifest, collector)
    : undefined;

  if (!manifest || !rawSubjects || !programs || !schedule || !assessments || !rawTasks) {
    return emptyPreview(collector.issues, manifest);
  }

  if (manifest.choices) {
    const ids = new Set(rawSubjects.map(s => s.id));
    for (const option of manifest.choices.groups.flatMap(g => g.options)) {
      if (option.subjectIds.some(id => !ids.has(id))) collector.error("formation.json", "$.choices", "invalid-value", "Une option référence une matière absente.");
    }
  }
  validateReferences(rawSubjects, programs, schedule, assessments, rawTasks, collector);
  if (collector.errorCount() > 0) return emptyPreview(collector.issues, manifest);

  const subjects = compileSubjects(rawSubjects, programs);
  const events = compileEvents(
    manifest,
    subjects,
    schedule,
    assessments,
    collector,
    options.maxExpandedEvents
  );
  if (collector.errorCount() > 0) return emptyPreview(collector.issues, manifest);

  const assessmentIds = new Set(assessments.map((assessment) => assessment.id));
  validateCompiledEventStorageCompatibility(events, assessmentIds, collector);
  if (collector.errorCount() > 0) return emptyPreview(collector.issues, manifest);

  validateAiPromptCompatibility(manifest, subjects, programs, assessments, events, collector);
  if (collector.errorCount() > 0) return emptyPreview(collector.issues, manifest);

  const tasks: TaskItem[] = rawTasks
    .map((task) => ({ ...task, completed: false }))
    .sort((left, right) => left.dueAt.localeCompare(right.dueAt) || left.id.localeCompare(right.id));
  const compiledStateBytes = utf8ByteLength(JSON.stringify({ subjects, events, tasks }));
  if (compiledStateBytes > FORMATION_COMPILED_STATE_MAX_BYTES) {
    collector.error(
      "package",
      "$.compiledState",
      "compiled-data-too-large",
      `La formation compilée occupe ${compiledStateBytes} octets, au-delà de la limite locale de ${FORMATION_COMPILED_STATE_MAX_BYTES}. Réduis les textes ou le nombre d’occurrences du planning.`
    );
  }
  validateCalendarExportCompatibility(manifest, subjects, events, assessmentIds, collector);
  if (collector.errorCount() > 0) return emptyPreview(collector.issues, manifest);
  const modules = subjects.reduce((total, subject) => total + subject.modules.length, 0);
  const chapters = subjects.reduce(
    (total, subject) => total + subject.modules.reduce((subtotal, module) => subtotal + module.items.length, 0),
    0
  );
  const lessons = subjects.reduce(
    (total, subject) =>
      total +
      subject.modules.reduce(
        (moduleTotal, module) =>
          moduleTotal + module.items.reduce((itemTotal, item) => itemTotal + (item.lessons?.length ?? 0), 0),
        0
      ),
    0
  );

  const preview: FormationImportPreview = {
    valid: true,
    issues: collector.issues,
    manifest,
    compiled: { subjects, events, tasks },
    subjects,
    events,
    tasks,
    counts: {
      subjects: subjects.length,
      modules,
      chapters,
      lessons,
      events: events.length,
      tasks: tasks.length
    }
  };
  if (manifest.choices?.selected) {
    const selected = manifest.choices.selected;
    return selectFormationChoices({ ...preview, manifest: { ...manifest, choices: { groups: manifest.choices.groups } } }, selected);
  }
  return preview;
}

export function isInstalledFormation(value: unknown): value is InstalledFormation {
  if (!isPlainObject(value)) return false;
  const keys = ["instanceId", "packageId", "packageVersion", "manifest", "installedAt", "storageKind"];
  if (Object.keys(value).some((key) => !keys.includes(key)) || keys.some((key) => !Object.hasOwn(value, key))) {
    return false;
  }
  if (typeof value.instanceId !== "string" || !ID_PATTERN.test(value.instanceId) || value.instanceId.length > 64) {
    return false;
  }
  if (typeof value.packageId !== "string" || !ID_PATTERN.test(value.packageId) || value.packageId.length > 64) {
    return false;
  }
  if (typeof value.packageVersion !== "string" || !SEMVER_PATTERN.test(value.packageVersion)) return false;
  if (value.storageKind !== "legacy-energy-year1" && value.storageKind !== "formation-v1") return false;
  if (value.storageKind === "formation-v1" && !UUID_V4_PATTERN.test(value.instanceId)) return false;
  if (typeof value.installedAt !== "string") return false;
  const installedAt = new Date(value.installedAt);
  if (Number.isNaN(installedAt.getTime()) || installedAt.toISOString() !== value.installedAt) return false;
  const collector = new IssueCollector();
  const manifest = parseManifest(value.manifest, collector);
  return Boolean(
    manifest &&
    collector.errorCount() === 0 &&
    value.packageId === manifest.id &&
    value.packageVersion === manifest.packageVersion
  );
}
