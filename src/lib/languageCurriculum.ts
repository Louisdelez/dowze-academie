import type { CefrLevel, Subject } from "../types";

const CEFR_LEVEL_PATTERN = /(?:^|[^a-z0-9])(a1|a2|b1|b2|c1|c2)(?=$|[^a-z0-9])/i;
const CEFR_LEVEL_GLOBAL_PATTERN = /(?:^|[^a-z0-9])(a1|a2|b1|b2|c1|c2)(?=$|[^a-z0-9])/gi;
const CEFR_LEVEL_ORDER: readonly CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

export interface LanguageCurriculumSource {
  curriculumScope?: string;
  moduleId?: string;
  itemId?: string;
  lessonUnitId?: string;
}

export interface LanguageCurriculumContext {
  languageCode: string;
  languageName: string;
  displayLanguageName: string;
  cefrLevel?: CefrLevel;
  selectable: boolean;
}

export interface LanguageCurriculumRange extends LanguageCurriculumContext {
  cefrLevels: CefrLevel[];
  cefrLabel?: string;
  curriculumScope?: string;
}

function normalizedMetadata(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || undefined;
}

function cefrLevelFromValue(value: string | undefined): CefrLevel | undefined {
  return value?.match(CEFR_LEVEL_PATTERN)?.[1]?.toUpperCase() as CefrLevel | undefined;
}

function cefrLevelsFromValue(value: string | undefined): CefrLevel[] {
  if (!value) return [];
  return Array.from(value.matchAll(CEFR_LEVEL_GLOBAL_PATTERN), (match) =>
    match[1].toUpperCase() as CefrLevel
  );
}

function capitalizedLanguageName(value: string): string {
  const [first = "", ...rest] = Array.from(value);
  return `${first.toLocaleUpperCase("fr")}${rest.join("")}`;
}

/**
 * Résout le contexte d'une matière de langue sans déduire la langue de son nom.
 * Le fallback anglais est réservé au cursus historique explicitement marqué.
 */
export function resolveLanguageCurriculum(
  subject: Subject,
  courseModule?: Subject["modules"][number],
  source?: LanguageCurriculumSource | null
): LanguageCurriculumContext | undefined {
  const selectable = subject.curriculumKind === "cefr-selectable";
  const explicitCode = normalizedMetadata(subject.languageCode);
  const explicitName = normalizedMetadata(subject.languageName);

  if (!selectable && (!explicitCode || !explicitName)) return undefined;

  const languageCode = explicitCode ?? "en";
  const languageName = explicitName ?? "anglais";
  const scopedLevel = selectable
    ? cefrLevelFromValue(source?.curriculumScope) ??
      cefrLevelFromValue(source?.lessonUnitId) ??
      cefrLevelFromValue(source?.itemId) ??
      cefrLevelFromValue(source?.moduleId)
    : undefined;
  const cefrLevel = courseModule?.cefrLevel ?? scopedLevel ?? subject.cefrLevel;

  return {
    languageCode,
    languageName,
    displayLanguageName: capitalizedLanguageName(languageName),
    ...(cefrLevel ? { cefrLevel } : {}),
    selectable
  };
}

/** Résout tous les niveaux couverts, notamment pour une épreuve multi-modules. */
export function resolveLanguageCurriculumRange(
  subject: Subject,
  courseModules: readonly Subject["modules"][number][] = [],
  source?: LanguageCurriculumSource | null
): LanguageCurriculumRange | undefined {
  const language = resolveLanguageCurriculum(subject, courseModules[0], source);
  if (!language) return undefined;

  const moduleLevels = courseModules.flatMap((courseModule) =>
    courseModule.cefrLevel
      ? [courseModule.cefrLevel]
      : subject.cefrLevel
        ? [subject.cefrLevel]
        : []
  );
  const scopedLevels = [
    ...cefrLevelsFromValue(source?.curriculumScope),
    ...cefrLevelsFromValue(source?.lessonUnitId),
    ...cefrLevelsFromValue(source?.itemId),
    ...cefrLevelsFromValue(source?.moduleId)
  ];
  const candidates = moduleLevels.length
    ? moduleLevels
    : scopedLevels.length
      ? scopedLevels
      : language.cefrLevel
        ? [language.cefrLevel]
        : [];
  const levelSet = new Set(candidates);
  const cefrLevels = CEFR_LEVEL_ORDER.filter((level) => levelSet.has(level));
  const cefrLabel = cefrLevels.length ? cefrLevels.join("–") : undefined;
  const { cefrLevel: _singleLevel, ...languageWithoutLevel } = language;

  return {
    ...languageWithoutLevel,
    ...(cefrLevels.length === 1 ? { cefrLevel: cefrLevels[0] } : {}),
    cefrLevels,
    ...(cefrLabel ? { cefrLabel, curriculumScope: `cefr:${cefrLevels.join("+")}` } : {})
  };
}

/** Construit le périmètre général d’une matière sans exposer les niveaux inactifs du sélecteur historique. */
export function resolveGeneralLanguageCurriculum(
  subject: Subject,
  source?: LanguageCurriculumSource | null
): LanguageCurriculumRange | undefined {
  if (source?.curriculumScope || source?.moduleId || source?.itemId || source?.lessonUnitId) {
    return resolveLanguageCurriculumRange(subject, [], source);
  }
  const modules = subject.curriculumKind === "cefr-selectable" && subject.cefrLevel
    ? subject.modules.filter((courseModule) => courseModule.cefrLevel === subject.cefrLevel)
    : subject.modules;
  return resolveLanguageCurriculumRange(subject, modules, source);
}

export function languagePracticeName(subject: Subject | undefined): string {
  if (!subject) return "Langues";
  return resolveLanguageCurriculum(subject)?.displayLanguageName ?? "Langues";
}
