import type {
  ActiveLesson,
  CalendarEvent,
  PaperAssessmentConfig,
  PaperAssessmentKind,
  ProgramItem,
  Subject
} from "../types";
import type { FormationManifest } from "./formations";
import {
  isNativeAiPromptWithinLimit,
  nativeAiSessionId,
  NATIVE_AI_PROMPT_MAX_BYTES
} from "./aiSessionContract.ts";
import { dateKeyAtTimeZone } from "./zonedDate.ts";
import { resolveLanguageCurriculumRange } from "./languageCurriculum.ts";

export const ASSESSMENT_CONTEXT_START = "<CONTEXTE_EVALUATION_DYNAMIQUE>";
export const ASSESSMENT_CONTEXT_END = "</CONTEXTE_EVALUATION_DYNAMIQUE>";

export const PAPER_ASSESSMENT_KIND_OPTIONS: ReadonlyArray<{
  value: PaperAssessmentKind;
  label: string;
}> = [
  { value: "test", label: "Test écrit" },
  { value: "control", label: "Contrôle écrit" },
  { value: "midterm", label: "Partiel" },
  { value: "exam", label: "Examen de session" },
  { value: "final-exam", label: "Examen final" },
  { value: "written-practical", label: "Épreuve pratique sur papier" },
  { value: "resit", label: "Rattrapage" },
  { value: "evaluation", label: "Évaluation écrite" }
];

const KIND_DEFAULT_DURATION: Readonly<Record<PaperAssessmentKind, number>> = {
  test: 30,
  control: 60,
  midterm: 120,
  exam: 120,
  "final-exam": 180,
  "written-practical": 90,
  resit: 120,
  evaluation: 60
};

const KIND_BLUEPRINT: Readonly<Record<PaperAssessmentKind, string>> = {
  test: "Épreuve courte et ciblée : 5 à 8 questions, avec un équilibre entre restitution comprise et application directe.",
  control: "Épreuve intermédiaire : plusieurs questions ou problèmes progressifs vérifiant les acquis récents et leur mobilisation autonome.",
  midterm: "Épreuve intermédiaire substantielle : questions ou problèmes en plusieurs parties, couverture représentative de toute la portée et difficulté progressive.",
  exam: "Examen de session complet : problèmes indépendants ou structurés, synthèse des acquis et au moins une tâche de transfert.",
  "final-exam": "Examen final cumulatif : couverture équilibrée, tâches de synthèse et vérification des acquis essentiels explicitement attendus.",
  "written-practical": "Épreuve pratique entièrement écrite : étude de protocole, données, schémas, calculs, analyse d’incertitudes, décisions techniques ou diagnostic selon la matière.",
  resit: "Nouvelle épreuve autonome, de niveau et de couverture équivalents à l’épreuve principale, sans reprendre ses questions à l’identique.",
  evaluation: "Évaluation écrite adaptée à la durée et aux objectifs fournis, avec difficulté progressive et couverture vérifiable."
};

/** Contrat commun à tous les contrôles, partiels, examens et rattrapages papier. */
export const UNIVERSAL_PAPER_ASSESSMENT_PROMPT = [
  "# PROFESSEUR IA — GÉNÉRATION D’UNE ÉVALUATION ÉCRITE EN PDF",
  "",
  "## Rôle",
  "Tu es mon professeur et concepteur d’épreuves. À partir du contexte final, crée immédiatement dans la langue et au niveau indiqués une évaluation exclusivement écrite, destinée à être imprimée et réalisée sur papier, ainsi que son corrigé officiel.",
  "",
  "## Résultat attendu — deux fichiers obligatoires",
  "Fournis dans cette réponse deux véritables fichiers PDF binaires distincts et téléchargeables : le sujet élève et le corrigé enseignant, avec exactement les noms de fichiers indiqués dans le contexte.",
  "Utilise les outils de création de fichiers disponibles. Une réponse en Markdown, un Canvas non exporté, du HTML, du LaTeX, du code source ou du texte simplement renommé en .pdf ne constitue pas un PDF livré. Si la création de vrais fichiers PDF est impossible dans cet environnement, indique clairement le blocage au lieu de prétendre les avoir produits.",
  "",
  "## Critères de réussite",
  "- Respecte strictement la nature, la durée, la matière, le matériel autorisé et le périmètre indiqués dans le contexte. N’évalue aucun chapitre absent du périmètre.",
  "- Construis silencieusement une matrice objectifs → questions avant de rédiger. Chaque chapitre et chaque cours atomique listés doivent être évalués ou mobilisés de manière identifiable ; place la matrice complète uniquement dans le corrigé.",
  "- Calibre le nombre de questions, leur longueur et leur difficulté pour qu’un étudiant préparé puisse terminer dans la durée prévue, y compris le temps de lecture et de vérification.",
  "- Évalue un mélange pertinent de compréhension, méthode, application, calcul, justification, interprétation et transfert. Évite les questions décoratives, ambiguës ou redondantes.",
  "- Le barème visible totalise exactement le maximum indiqué dans le contexte. La pondération reflète le temps et la difficulté, et le corrigé décompose les points en critères observables avec règles de crédit partiel.",
  "- Vérifie silencieusement que chaque question est résoluble avec les données du sujet et le matériel autorisé. N’invente aucune formule, propriété, constante, donnée ou référence.",
  "",
  "## PDF du sujet élève",
  "- Document A4 portrait, sobre, professionnel, à fort contraste et lisible en noir et blanc ; marges de 18 à 22 mm, corps de 10,5 à 12 pt et pagination « page X/Y ».",
  "- La première page comporte : cursus, matière, intitulé et nature de l’épreuve, date, durée, total selon le barème du contexte, matériel autorisé, consignes, puis champs Nom, Prénom et identifiant élève si pertinent.",
  "- Affiche les points de chaque question. Fournis après chaque question un espace de réponse réellement proportionné : lignes, cadres, tableaux, grilles, repères ou pages de calcul. Ajoute des pages plutôt que de comprimer la copie.",
  "- Inclue dans le sujet toutes les données, figures, annexes et formulaires explicitement autorisés qui sont nécessaires. Les figures, symboles, accents, unités et tableaux doivent rester nets à l’impression.",
  "- Le sujet ne contient aucune réponse, piste, méthode suggérée, correction, solution, critère de notation ou matrice de couverture. Ne place jamais le corrigé à la suite du sujet.",
  "",
  "## PDF du corrigé enseignant",
  "- Second PDF A4 distinct, marqué « Corrigé enseignant — ne pas distribuer avec le sujet ».",
  "- Reprends les questions dans le même ordre avec réponses attendues, raisonnements, calculs, unités, interprétations, barème détaillé et variantes acceptables.",
  "- Termine par : somme vérifiée du barème, matrice chapitres/cours → questions, erreurs typiques, compétences mesurées et seuils de maîtrise recommandés.",
  "",
  "## Contrôle qualité avant livraison",
  "Ouvre ou rends chaque page des deux PDF puis inspecte visuellement : format A4, pagination, lisibilité, espaces de réponse, glyphes, formules, figures, chevauchements, débordements, coupures, pages vides, absence de réponses dans le sujet, concordance sujet–corrigé, couverture du périmètre et total exact du barème indiqué dans le contexte. Corrige puis régénère tout fichier qui échoue à un contrôle.",
  "",
  "## Règle d’arrêt",
  "Ne me pose aucune question, ne lance aucune passation interactive et n’attends aucune réponse. Termine uniquement lorsque les deux PDF ont été créés et vérifiés. Ta réponse finale contient seulement les deux liens ou pièces jointes clairement identifiés, puis une ligne indiquant le nombre de questions, la durée, le total du barème, le nombre de pages de chaque fichier et la réussite des contrôles. Ne reproduis aucun énoncé ni corrigé dans la conversation."
].join("\n");

function normalized(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slug(value: string): string {
  return normalized(value).replace(/\s+/g, "-") || "evaluation";
}

function assessmentDateKey(value: string, timeZone = "Europe/Zurich"): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError("La date prévue de l’évaluation est invalide.");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function contextValue(value: string | undefined, fallback: string): string {
  const clean = value?.replace(/\s+/g, " ").trim() || fallback;
  return clean
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function paperAssessmentKindLabel(kind: PaperAssessmentKind): string {
  return PAPER_ASSESSMENT_KIND_OPTIONS.find((option) => option.value === kind)?.label ?? "Évaluation écrite";
}

export function defaultPaperAssessmentDuration(kind: PaperAssessmentKind): number {
  return KIND_DEFAULT_DURATION[kind];
}

export function inferPaperAssessmentKind(title: string): PaperAssessmentKind {
  const value = normalized(title);
  if (value.includes("rattrapage")) return "resit";
  if (value.includes("partiel")) return "midterm";
  if (value.includes("examen final") || value.includes("examens finaux")) return "final-exam";
  if (value.includes("epreuve pratique") || value.includes("tp") || value.includes("oral")) return "written-practical";
  if (value.includes("examen")) return "exam";
  if (value.includes("controle")) return "control";
  if (value.includes("test")) return "test";
  return "evaluation";
}

const SUBJECT_ALIASES: Readonly<Record<string, readonly string[]>> = {
  analyse: ["analyse", "maths", "mathematique"],
  "algebre-lineaire": ["algebre", "maths", "mathematique"],
  mecanique: ["mecanique"],
  thermodynamique: ["thermodynamique", "thermo"],
  "programmation-scientifique": ["programmation", "calcul numerique", "sciences"],
  "chimie-materiaux": ["chimie", "materiaux", "sciences"],
  "conception-cao": ["conception", "cao", "projet"],
  "tp-metrologie": ["metrologie", "laboratoire", "tp", "pratique"],
  "systemes-energetiques": ["energie", "energetique", "sciences"],
  "projet-ingenierie": ["projet", "soutenance", "oral"],
  anglais: ["anglais", "english", "langue"]
};

/** Suggestions uniquement : la sélection finale reste visible et modifiable. */
export function candidateSubjectsForAssessment(
  event: CalendarEvent,
  subjects: readonly Subject[],
  formation?: FormationManifest,
  legacyEnergyYear1?: boolean
): Subject[] {
  if (event.subjectId) {
    const explicit = subjects.find((subject) => subject.id === event.subjectId);
    if (explicit) return [explicit];
  }

  const haystack = normalized(`${event.title} ${event.description ?? ""}`);
  // L’identité d’un manifeste est contrôlée par son auteur. Seul le type
  // d’espace local, fourni par l’application, prouve qu’il s’agit du cursus
  // historique. L’absence d’options conserve l’API de tests antérieure.
  const useLegacyAliases = legacyEnergyYear1 ?? formation === undefined;
  const detected = subjects.filter((subject) => {
    const names = [
      subject.name,
      subject.shortName,
      ...(useLegacyAliases ? SUBJECT_ALIASES[subject.id] ?? [] : [])
    ]
      .map(normalized)
      .filter((name) => name.length >= 2);
    return names.some((name) => haystack.includes(name));
  });
  return detected.length ? detected : [...subjects];
}

function semesterForEvent(
  event: CalendarEvent,
  timeZone = "Europe/Zurich",
  academicYear?: FormationManifest["academicYear"]
): "Semestre 1" | "Semestre 2" | undefined {
  const title = normalized(event.title);
  if (title.includes("s1") || title.includes(" i ") || title.endsWith(" i")) return "Semestre 1";
  if (title.includes("s2") || title.includes(" ii ") || title.endsWith(" ii")) return "Semestre 2";
  const eventDateKey = dateKeyAtTimeZone(new Date(event.start), timeZone);
  if (academicYear) {
    const start = Date.parse(`${academicYear.startDate}T00:00:00.000Z`);
    const end = Date.parse(`${academicYear.endDate}T00:00:00.000Z`);
    const eventDate = Date.parse(`${eventDateKey}T00:00:00.000Z`);
    if ([start, end, eventDate].every(Number.isFinite) && end > start) {
      return eventDate <= start + (end - start) / 2 ? "Semestre 1" : "Semestre 2";
    }
  }
  const month = Number(eventDateKey.slice(5, 7)) - 1;
  return month >= 7 || month <= 0 ? "Semestre 1" : "Semestre 2";
}

/** Pré-sélection prudente ; l’élève valide toujours la liste dans la fenêtre. */
export function defaultChapterIdsForAssessment(
  event: CalendarEvent,
  subject: Subject,
  timeZone = "Europe/Zurich",
  academicYear?: FormationManifest["academicYear"]
): string[] {
  const completed = subject.modules.flatMap((module) => module.items).filter((item) => item.completed);
  const semester = semesterForEvent(event, timeZone, academicYear);
  const semesterItems = subject.modules
    .filter((module) => module.period === semester || subject.period === semester)
    .flatMap((module) => module.items);

  if (completed.length && ["control", "test", "evaluation"].includes(inferPaperAssessmentKind(event.title))) {
    return completed.map((item) => item.id);
  }
  if (semesterItems.length) return semesterItems.map((item) => item.id);
  return subject.modules.flatMap((module) => module.items.map((item) => item.id));
}

function selectedChapters(subject: Subject, chapterIds: readonly string[]): Array<{
  moduleTitle: string;
  modulePeriod: string;
  moduleCefrLevel?: Subject["cefrLevel"];
  item: ProgramItem;
}> {
  const selected = new Set(chapterIds);
  return subject.modules.flatMap((module) => module.items
    .filter((item) => selected.has(item.id))
    .map((item) => ({
      moduleTitle: module.title,
      modulePeriod: module.period,
      moduleCefrLevel: module.cefrLevel,
      item
    }))
  );
}

function languageWrittenAssessmentGuidance(
  level: string,
  languageName: string,
  displayLanguageName: string,
  teachingLanguage: string
): string[] {
  const beginner = level === "A1" || level === "A2" || level === "non sélectionné";
  return [
    `Cursus : ${displayLanguageName} — parcours CECRL ${level} sur une année`,
    `Niveau attendu : CECRL ${level} — parcours pédagogique aligné, non certification officielle`,
    beginner
      ? `Instruction prioritaire pour cette matière de langue : rédiger les supports, consignes et productions attendues principalement en ${languageName}, avec un soutien ciblé en ${teachingLanguage} seulement lorsque le niveau débutant le justifie.`
      : `Instruction prioritaire pour cette matière de langue : rédiger le sujet et les productions attendues principalement en ${languageName} ; réserver ${teachingLanguage} à une clarification brève réellement nécessaire.`,
    "Périmètre mesurable sur papier : compréhension écrite, production écrite, médiation écrite et usage contextualisé de la langue (grammaire, vocabulaire, cohésion, registre et pragmatique).",
    "Limite de validité : ne pas prétendre mesurer la compréhension orale, la production ou l’interaction orales, ni la prononciation sans épreuve séparée, protocole réel et média audio.",
    `Barème écrit de ${languageName} : répartir les points entre compréhension, accomplissement et pertinence de la tâche, organisation/cohésion, étendue et correction grammaticales et lexicales, registre/pragmatique et médiation selon les tâches ; aucun point de prononciation sur une copie papier.`
  ];
}

function assessmentLanguageContext(
  subject: Subject,
  chapterIds: readonly string[]
): ReturnType<typeof resolveLanguageCurriculumRange> {
  const selected = new Set(chapterIds);
  const courseModules = subject.modules.filter((candidate) =>
    candidate.items.some((item) => selected.has(item.id))
  );
  return resolveLanguageCurriculumRange(subject, courseModules);
}

export function buildPaperAssessmentContext(
  subject: Subject,
  config: PaperAssessmentConfig,
  formation?: FormationManifest
): string {
  const chapters = selectedChapters(subject, config.chapterIds);
  if (!chapters.length) throw new TypeError("Une évaluation papier exige au moins un chapitre valide.");

  const scheduledDate = assessmentDateKey(config.scheduledAt, formation?.timeZone);
  const fileStem = `${slug(paperAssessmentKindLabel(config.kind))}-${slug(subject.shortName)}-${scheduledDate}`;
  const language = assessmentLanguageContext(subject, config.chapterIds);
  const cefrLabel = language?.cefrLabel;
  const isCefrLanguage = Boolean(language && (language.selectable || cefrLabel));
  const lines = [
    ASSESSMENT_CONTEXT_START,
    ...(isCefrLanguage
      ? languageWrittenAssessmentGuidance(
          cefrLabel ?? "non sélectionné",
          contextValue(language?.languageName, "langue cible"),
          contextValue(language?.displayLanguageName, "Langue cible"),
          contextValue(formation?.pedagogy.teachingLanguage, "français")
        )
      : formation
        ? [
            `Cursus : ${contextValue(`${formation.yearLabel} — ${formation.name}`, "Formation non précisée")}`,
            `Niveau attendu : ${contextValue(`${formation.level.label} — ${formation.pedagogy.instructionLevel}`, "Niveau non précisé")}`,
            `Langue d’enseignement : ${contextValue(formation.pedagogy.teachingLanguage, "Non précisée")}`,
            `Approche pédagogique : ${contextValue(formation.pedagogy.approach, "Non précisée")}`
          ]
        : [
          "Cursus : Année 1 — Ingénierie de l’énergie & physique appliquée",
          "Niveau attendu : universitaire, scientifique et ingénierie"
          ]),
    `Nature de l’épreuve : ${paperAssessmentKindLabel(config.kind)}`,
    `Intitulé calendrier : ${contextValue(config.title, "Évaluation écrite")}`,
    `Matière : ${contextValue(subject.name, "Matière non précisée")}`,
    `Domaine : ${contextValue(subject.domain, "Non précisé")}`,
    `Objectif global : ${contextValue(subject.objective, "Évaluer une maîtrise autonome.")}`,
    `Barème total obligatoire : ${formation?.grading.scaleMax ?? 20} points`,
    `Seuil de réussite de référence : ${formation?.grading.passMark ?? 10} points`,
    `Date prévue : ${scheduledDate}`,
    `Durée : ${config.durationMinutes} minutes`,
    `Matériel autorisé : ${contextValue(config.allowedMaterials, "Aucun matériel")}`,
    `Consignes particulières : ${contextValue(config.instructions, "Aucune")}`,
    `Architecture attendue : ${KIND_BLUEPRINT[config.kind]}`,
    `Fichier PDF du sujet : sujet-${fileStem}.pdf`,
    `Fichier PDF du corrigé : corrige-${fileStem}.pdf`,
    `Nombre de chapitres à couvrir : ${chapters.length}`,
    "Périmètre exclusif :"
  ];

  chapters.forEach(({ moduleTitle, modulePeriod, item }, chapterIndex) => {
    lines.push(`${chapterIndex + 1}. [${contextValue(modulePeriod, "Période non précisée")}] ${contextValue(moduleTitle, "Module")} → ${contextValue(item.title, "Chapitre")}`);
    if (item.description) lines.push(`   Description : ${contextValue(item.description, "Non fournie")}`);
    const lessons = item.lessons ?? [];
    if (!lessons.length) {
      lines.push("   - Cours : chapitre non découpé ; évaluer son intitulé et sa description.");
    } else {
      lessons.forEach((lesson, lessonIndex) => {
        lines.push(`   - Cours ${lessonIndex + 1} : ${contextValue(lesson.title, "Cours")} — Objectif : ${contextValue(lesson.objective, "Non précisé")}`);
      });
    }
  });
  lines.push(ASSESSMENT_CONTEXT_END);
  return lines.join("\n");
}

export function buildPaperAssessmentPrompt(
  subject: Subject,
  config: PaperAssessmentConfig,
  formation?: FormationManifest
): string {
  if (!subject.id.trim() || !subject.name.trim()) throw new TypeError("La matière de l’évaluation est invalide.");
  if (!Number.isInteger(config.durationMinutes) || config.durationMinutes < 10 || config.durationMinutes > 360) {
    throw new TypeError("La durée de l’évaluation doit être comprise entre 10 et 360 minutes.");
  }
  return `${UNIVERSAL_PAPER_ASSESSMENT_PROMPT}\n\n${buildPaperAssessmentContext(subject, config, formation)}`;
}

export function createActivePaperAssessment(
  subject: Subject,
  config: PaperAssessmentConfig,
  options: { id?: string; startedAt?: string | Date; formation?: FormationManifest } = {}
): ActiveLesson {
  const started = options.startedAt ? new Date(options.startedAt) : new Date();
  if (Number.isNaN(started.getTime())) throw new TypeError("La date de génération est invalide.");
  const startedAt = started.toISOString();
  const curriculumScope = assessmentLanguageContext(subject, config.chapterIds)?.curriculumScope;
  const prompt = buildPaperAssessmentPrompt(subject, config, options.formation);
  if (!isNativeAiPromptWithinLimit(prompt)) {
    throw new RangeError(`Le contexte IA dépasse la limite native de ${NATIVE_AI_PROMPT_MAX_BYTES} octets.`);
  }
  return {
    id: nativeAiSessionId(
      options.id ?? `paper-assessment-${slug(config.eventId)}-${slug(subject.id)}-${started.getTime()}`,
      "paper-assessment"
    ),
    subjectId: subject.id,
    lessonMode: "paper-assessment",
    title: `${paperAssessmentKindLabel(config.kind)} — ${subject.shortName}`,
    curriculumScope,
    prompt,
    startedAt,
    assessment: { ...config, chapterIds: [...config.chapterIds] }
  };
}
