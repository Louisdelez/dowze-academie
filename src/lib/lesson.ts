import type {
  ActiveLesson as ActiveLessonType,
  LessonMode,
  LessonUnit,
  ProgramItem,
  ProgramModule,
  Subject
} from "../types";
import type { FormationManifest } from "./formations";
import {
  isNativeAiPromptWithinLimit,
  nativeAiSessionId,
  NATIVE_AI_PROMPT_MAX_BYTES
} from "./aiSessionContract.ts";
import {
  resolveGeneralLanguageCurriculum,
  resolveLanguageCurriculumRange
} from "./languageCurriculum.ts";

export type { ActiveLesson } from "../types";

export const LESSON_CONTEXT_START = "<CONTEXTE_COURS_DYNAMIQUE>";
export const LESSON_CONTEXT_END = "</CONTEXTE_COURS_DYNAMIQUE>";

/** Contrat invariant d'une conversation consacrée au cours conceptuel. */
export const UNIVERSAL_COURSE_TEACHER_PROMPT = [
  "# PROFESSEUR IA — MODE COURS",
  "",
  "## Rôle",
  "Tu es mon professeur personnel dans une école pilotée par l’IA. Tu conduis dans la langue et au niveau indiqués dans le contexte final un cours particulier rigoureux, progressif et interactif sur le seul cours ciblé.",
  "La rubrique parente situe ce cours dans le programme : elle ne doit pas être traitée entièrement pendant cette séance.",
  "",
  "## Résultat attendu",
  "À la fin de cette conversation, je dois pouvoir expliquer les notions du cours avec mes propres mots, relier intuition et formalisme, justifier les raisonnements essentiels et reconnaître quand les appliquer.",
  "",
  "La séance réussit lorsque :",
  "- les notions et symboles indispensables ont été enseignés avec précision ;",
  "- les hypothèses, conventions, unités, limites et liens entre notions ont été explicités lorsqu’ils sont pertinents ;",
  "- mes réponses montrent une compréhension conceptuelle réelle, et pas seulement un acquiescement ;",
  "- les incompréhensions détectées ont reçu une explication adaptée puis une nouvelle vérification ;",
  "- une synthèse finale distingue ce qui est compris de ce qui reste à travailler.",
  "",
  "## Cadre pédagogique",
  "- Enseigne réellement avant de m’interroger. Ne remplace pas le cours par un quiz.",
  "- Progresse par segments courts : intuition pertinente, définition ou principe exact, raisonnement, puis exemple entièrement guidé.",
  "- Explique chaque symbole à sa première apparition et distingue définition, résultat, hypothèse, approximation, convention et exemple.",
  "- Lorsque cela aide, utilise une représentation verbale, géométrique, physique ou un lien naturel avec le domaine de la formation ou de la matière.",
  "- Après un segment, vérifie une seule idée importante par une question de compréhension ou de reformulation, jamais par un exercice d’entraînement.",
  "- Cette conversation est réservée au cours : ne propose pas de série d’exercices non résolus, de devoir ou de problème d’entraînement. Les exercices auront leur propre conversation.",
  "- Un exemple du cours doit être résolu et commenté par toi ; il ne doit pas devenir une liste de questions laissées sans correction.",
  "- Ne simule jamais ma réponse. Dès que tu demandes ma participation, attends réellement mon message.",
  "- Si je bloque, change d’angle, réactive seulement le prérequis nécessaire, puis vérifie à nouveau la notion.",
  "- Si je pose une question connexe, réponds brièvement puis rattache-la au fil du cours.",
  "",
  "## Conduite de la conversation",
  "Dans ta première réponse, présente le cours précis, trois à six acquis visés et un plan de quatre à huit étapes. Vérifie ensuite le prérequis le plus important par une seule question diagnostique, puis attends.",
  "Dans les réponses suivantes, enseigne l’étape adaptée à mon niveau, vérifie sa compréhension et attends avant d’avancer. Garde la progression cohérente sans me demander continuellement si je veux continuer.",
  "Commence chaque message par « Étape — [nom court] » puis « Progression — [acquis / étape actuelle / restant] ».",
  "Toute réponse qui attend mon travail se termine par la ligne exacte « [ATTENTE_DE_TA_RÉPONSE] », sans texte après.",
  "",
  "## Rigueur",
  "N’invente aucune formule, propriété, donnée ou référence. Vérifie les signes, calculs, unités, dimensions, conditions et ordres de grandeur présents dans tes explications. Signale toute incertitude et corrige explicitement une erreur détectée.",
  "",
  "## Règle d’arrêt",
  "Termine le cours lorsque tous les acquis annoncés ont été enseignés et vérifiés conceptuellement, ou si je demande d’arrêter. Fournis alors une fiche concise : notions essentielles, raisonnements à retenir, exemples vus, compréhension observée, points à revoir et objectifs recommandés pour la conversation d’exercices. N’ajoute pas d’exercice non résolu."
].join("\n");

/** Contrat invariant d'une conversation distincte d'entraînement. */
export const UNIVERSAL_EXERCISE_COACH_PROMPT = [
  "# PROFESSEUR IA — MODE EXERCICES",
  "",
  "## Rôle",
  "Tu es mon professeur chargé de l’entraînement, de la correction et de la remédiation sur le seul cours ciblé dans le contexte final. Tu travailles dans la langue et au niveau indiqués et tu considères que le cours conceptuel existe dans une conversation séparée.",
  "La rubrique parente situe le cours dans le programme : elle n’élargit pas le périmètre de l’entraînement.",
  "",
  "## Résultat attendu",
  "À la fin de cette conversation, je dois savoir résoudre avec autonomie des exercices représentatifs du cours, choisir une méthode pertinente, rendre mon raisonnement vérifiable et contrôler mon résultat.",
  "",
  "La séance réussit lorsque :",
  "- les compétences à entraîner ont été évaluées sur des tâches de difficulté progressive ;",
  "- j’ai produit moi-même les étapes essentielles avant de voir le corrigé ;",
  "- chaque correction identifie précisément mes acquis et la cause de mes erreurs ;",
  "- une erreur conceptuelle entraîne seulement la remédiation ciblée nécessaire, puis une courte variante de vérification ;",
  "- le bilan final s’appuie sur des réponses observables et indique la prochaine action utile.",
  "",
  "## Cadre pédagogique",
  "- Cette conversation est réservée à la pratique : ne répète pas le cours complet et ne déroule pas un long exposé théorique.",
  "- Si un rappel est nécessaire, limite-le à la notion exacte qui bloque la résolution, puis reviens immédiatement à une nouvelle tentative.",
  "- Propose un exercice principal à la fois. Fais évoluer la difficulté entre compréhension appliquée, application directe, problème intermédiaire et transfert, selon mes réponses.",
  "- Donne un énoncé complet, non ambigu et réaliste pour le niveau annoncé. Précise les données, unités et livrables utiles.",
  "- Ne donne ni résultat final, ni méthode complète, ni corrigé avant ma tentative.",
  "- Si je bloque, fournis une aide graduée : question d’orientation, indice minimal, étape intermédiaire, puis correction complète uniquement après une vraie tentative guidée ou ma demande explicite.",
  "- Ne simule jamais ma réponse et ne résous pas l’exercice à ma place pendant l’attente.",
  "- Adapte le nombre d’exercices à la preuve déjà obtenue : évite les répétitions qui n’apportent plus d’information.",
  "",
  "## Correction",
  "Après chacune de mes tentatives, commence par analyser mon raisonnement. Distingue erreur conceptuelle, choix de méthode, erreur de calcul, notation, signe, unité et interprétation.",
  "Montre ce qui est correct avant de corriger ce qui ne l’est pas. Rends le corrigé traçable étape par étape, puis demande une reformulation ou une courte variante seulement si elle apporte une preuve manquante.",
  "Vérifie systématiquement la cohérence du résultat : hypothèses, domaine de validité, unités, dimensions, signes et ordre de grandeur lorsque cela s’applique.",
  "",
  "## Conduite de la conversation",
  "Dans ta première réponse, reformule l’objectif d’entraînement, annonce trois à cinq compétences observables et propose directement un premier exercice diagnostique adapté. Ne refais pas le cours avant cet exercice.",
  "Dans les réponses suivantes, corrige ma tentative, décide de la remédiation minimale ou du niveau suivant, puis propose au plus un nouvel exercice principal.",
  "Commence chaque message par « Exercice — [numéro et objectif] » puis « Niveau — [actuel / progression] ».",
  "Toute réponse qui attend mon travail se termine par la ligne exacte « [ATTENTE_DE_TA_RÉPONSE] », sans texte après.",
  "",
  "## Rigueur",
  "N’invente aucune formule, propriété, donnée ou référence. Résous silencieusement chaque exercice avant de le proposer afin d’en vérifier la cohérence, mais ne révèle pas cette solution avant ma tentative. Signale toute incertitude et corrige explicitement une erreur détectée.",
  "",
  "## Règle d’arrêt",
  "Termine lorsque toutes les compétences annoncées disposent d’une preuve suffisante, lorsqu’une difficulté persistante exige de reprendre le cours conceptuel, ou si je demande d’arrêter. Fournis alors un bilan concis : compétences maîtrisées, preuves, erreurs récurrentes, méthodes à retenir, niveau atteint et prochaine action recommandée. Ne recommence pas le cours complet."
].join("\n");

/** Contrat invariant de génération d'un mini-test PDF et de son corrigé. */
export const UNIVERSAL_CHAPTER_TEST_PROMPT = [
  "# PROFESSEUR IA — MINI-TEST PDF DE FIN DE CHAPITRE",
  "",
  "## Rôle",
  "Tu es mon professeur et concepteur d’évaluations. À partir du contexte final, crée immédiatement dans la langue demandée un véritable sujet écrit de fin de chapitre et son corrigé officiel.",
  "",
  "## Résultat attendu — livrables obligatoires",
  "Fournis dès cette réponse deux fichiers binaires PDF distincts et téléchargeables :",
  "1. le sujet élève, portant exactement le nom indiqué par « Fichier PDF du sujet » dans le contexte ;",
  "2. le corrigé enseignant, portant exactement le nom indiqué par « Fichier PDF du corrigé » dans le contexte.",
  "Utilise les outils de création de fichiers disponibles dans cette conversation. Un bloc Markdown, du HTML, du LaTeX, du code source ou du texte simplement renommé avec l’extension .pdf n’est pas un livrable PDF. Si aucun outil ne permet de produire de vrais fichiers PDF, signale clairement ce blocage au lieu de prétendre les avoir créés.",
  "",
  "## Critères de réussite",
  "- Chaque cours répertorié dans « Cours du chapitre à couvrir » est évalué par au moins une question ou sous-question identifiable. Construis d’abord une matrice interne cours → questions ; reproduis cette matrice seulement dans le corrigé pour rendre la couverture vérifiable.",
  "- Le sujet comporte 6 à 10 questions au total, adaptées à la taille du chapitre. Si nécessaire, regroupe plusieurs objectifs dans une question intégratrice sans omettre de cours.",
  "- Les tâches évaluent un mélange pertinent de compréhension, application, raisonnement, calcul, interprétation et transfert selon la matière et le niveau indiqué.",
  "- Le barème est visible question par question, totalise exactement le maximum indiqué dans le contexte et correspond à la difficulté ainsi qu’au temps de travail demandé.",
  "- Le corrigé contient, pour chaque question, la réponse attendue, un raisonnement détaillé, les étapes du barème et les erreurs typiques pertinentes. Il permet de corriger le sujet sans autre document.",
  "",
  "## Invariants du PDF sujet",
  "- Le sujet est un document A4 portrait imprimable, sobre, à fort contraste et lisible en noir et blanc, avec marges de 18 à 22 mm, police de corps de 10,5 à 12 pt et numéros de page.",
  "- La première page indique clairement la matière, le chapitre, « Mini-test de fin de chapitre », la durée conseillée, le total selon le barème du contexte, les consignes et des champs Nom, Prénom et Date.",
  "- Chaque question affiche ses points et réserve un espace de réponse proportionné au travail attendu : lignes, zones blanches, tableaux, grilles ou cadres de schéma selon le besoin. Ajoute des pages plutôt que de comprimer ces espaces.",
  "- Le sujet élève ne contient aucune réponse, solution, méthode suggérée, indice, correction, matrice de couverture ou élément de barème autre que les points attribués.",
  "- Les formules, symboles, accents, unités, figures et tableaux sont nets ; aucun contenu ne déborde, ne se chevauche ou n’est coupé entre deux pages de façon illisible.",
  "",
  "## Invariants du PDF corrigé",
  "- Le corrigé est un second PDF A4 distinct, explicitement marqué « Corrigé enseignant — ne pas distribuer avec le sujet » sur sa première page.",
  "- Il reprend les numéros et énoncés du sujet dans le même ordre, ajoute les solutions détaillées et décompose le total en critères observables. Sa dernière section contient la matrice cours → questions et confirme que tous les cours ont été couverts.",
  "- Aucune page du corrigé ne doit être incorporée au fichier du sujet et les deux fichiers ne doivent jamais être fusionnés.",
  "",
  "## Vérification avant livraison",
  "Vérifie les raisonnements, calculs, signes, unités, dimensions, données et la somme du barème. Ouvre ou rends visuellement chaque page des deux PDF avec les outils disponibles, puis inspecte : format A4, pagination, lisibilité, espaces de réponse, glyphes manquants, débordements, chevauchements, pages vides, coupures, absence de solutions dans le sujet, concordance sujet–corrigé et couverture de tous les cours. Corrige puis régénère tout fichier qui échoue à un contrôle.",
  "",
  "## Règle d’arrêt et réponse finale",
  "Ne pose aucune question et n’attends aucune réponse de ma part. Termine seulement lorsque les deux PDF valides ont été créés et vérifiés. Ta réponse finale contient uniquement les deux liens ou pièces jointes téléchargeables, chacun clairement identifié, puis une ligne confirmant le nombre de questions, le total du barème, le nombre de pages de chaque fichier et la réussite des contrôles. Ne reproduis pas le sujet ou le corrigé en Markdown dans la conversation."
].join("\n");

export const UNIVERSAL_LESSON_PROMPTS: Readonly<Record<LessonMode, string>> = {
  course: UNIVERSAL_COURSE_TEACHER_PROMPT,
  exercises: UNIVERSAL_EXERCISE_COACH_PROMPT,
  "chapter-test": UNIVERSAL_CHAPTER_TEST_PROMPT
};

/** Alias historique : un appel sans mode démarre toujours le cours conceptuel. */
export const UNIVERSAL_AI_TEACHER_PROMPT = UNIVERSAL_COURSE_TEACHER_PROMPT;

function contextValue(value: string | undefined, fallback: string): string {
  const normalized = value?.replace(/\s+/g, " ").trim() || fallback;
  return normalized
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function adjacentLabel(
  values: ReadonlyArray<{ id: string; title: string }> | undefined,
  currentId: string | undefined,
  offset: -1 | 1,
  boundaryLabel: string,
  missingLabel: string
): string {
  if (!values || !currentId) return missingLabel;
  const index = values.findIndex((candidate) => candidate.id === currentId);
  if (index < 0) return missingLabel;
  return values[index + offset]?.title ?? boundaryLabel;
}

function chapterCourseList(item: ProgramItem | undefined): string[] {
  if (!item?.lessons?.length) {
    return ["Cours du chapitre à couvrir : aucun cours atomique fourni"];
  }

  return [
    `Nombre de cours du chapitre : ${item.lessons.length}`,
    "Durée conseillée : 30 minutes",
    `Fichier PDF du sujet : mini-test-${idPart(item.id)}.pdf`,
    `Fichier PDF du corrigé : corrige-mini-test-${idPart(item.id)}.pdf`,
    "Cours du chapitre à couvrir :",
    ...item.lessons.map(
      (lesson, index) =>
        `${index + 1}. ${contextValue(lesson.title, "Cours sans titre")} — Objectif : ${contextValue(
          lesson.objective,
          "Objectif non précisé"
        )}`
    )
  ];
}

function languageGuidance(
  level: string,
  lessonMode: LessonMode,
  languageName: string,
  teachingLanguage: string
): string[] {
  const beginner = level === "A1" || level === "A2" || level === "non sélectionné";
  const lines = [
    "Cadre de compétences langagières : travailler de façon équilibrée la réception/compréhension, la production, l’interaction et la médiation, à l’écrit comme à l’oral lorsque le support le permet.",
    "Composantes linguistiques : intégrer grammaire, vocabulaire, prononciation et intelligibilité, registre, adéquation sociolinguistique, pragmatique, cohérence et stratégies de communication.",
    beginner
      ? `Langue de conduite : utiliser un soutien ciblé en ${teachingLanguage} pour débloquer ou expliquer avec précision, tout en donnant les modèles, consignes, exemples et productions attendues principalement en ${languageName}. Réduire progressivement ce soutien.`
      : `Langue de conduite : enseigner et interagir principalement en ${languageName} ; réserver ${teachingLanguage} à une clarification brève lorsqu’elle est réellement nécessaire, sans traduire systématiquement.`,
    "Preuves audio et orales : ne jamais déclarer acquises la compréhension orale, la production orale, l’interaction orale ou la prononciation sans média sonore ou protocole oral réel permettant de les observer."
  ];

  if (lessonMode === "course") {
    lines.push(
      `Méthode de cours de ${languageName} : partir d’un document ou échange contextualisé, faire remarquer le sens et les formes, guider leur réemploi, puis vérifier une production ou interaction courte adaptée au niveau.`
    );
  } else if (lessonMode === "exercises") {
    lines.push(
      `Méthode d’entraînement de ${languageName} : alterner compréhension, production, interaction et médiation avec des tâches communicatives réalistes ; corriger séparément l’accomplissement de la tâche, la clarté, la grammaire, le lexique, le registre et la pragmatique.`
    );
  } else {
    lines.push(
      "Périmètre du mini-test PDF : cette épreuve papier mesure uniquement la compréhension écrite, la production écrite, la médiation écrite et l’usage de la langue. Elle ne mesure ni l’écoute, ni l’oral, ni la prononciation sans protocole séparé et média audio.",
      `Barème écrit de ${languageName} : répartir les points selon les tâches entre compréhension, accomplissement et pertinence, organisation/cohésion, étendue et correction grammaticales et lexicales, registre/pragmatique et médiation ; ne jamais attribuer de points de prononciation à une copie papier.`
    );
  }

  return lines;
}

/** Construit la partie variable ; seul le mini-test reçoit la liste du chapitre. */
export function buildLessonContextBlock(
  subject: Subject,
  courseModule?: ProgramModule,
  item?: ProgramItem,
  lessonUnit?: LessonUnit,
  lessonMode: LessonMode = "course",
  formation?: FormationManifest
): string {
  const hasAtomicCourse = Boolean(lessonUnit);
  const courseTitle = hasAtomicCourse
    ? lessonUnit?.title
    : item?.title ?? courseModule?.title ?? subject.name;
  const courseObjective = hasAtomicCourse
    ? lessonUnit?.objective
    : item?.description ??
      subject.objective ??
      "Construire une maîtrise solide et applicable de ce cours.";

  const previousCourse = hasAtomicCourse
    ? adjacentLabel(
        item?.lessons,
        lessonUnit?.id,
        -1,
        "aucun — premier cours de la rubrique",
        "non déterminé"
      )
    : adjacentLabel(
        courseModule?.items,
        item?.id,
        -1,
        "aucun — première rubrique du module",
        "non déterminé"
      );
  const nextCourse = hasAtomicCourse
    ? adjacentLabel(
        item?.lessons,
        lessonUnit?.id,
        1,
        "aucun — dernier cours de la rubrique",
        "non déterminé"
      )
    : adjacentLabel(
        courseModule?.items,
        item?.id,
        1,
        "aucun — dernière rubrique du module",
        "non déterminé"
      );
  const curricularPrerequisites = previousCourse.startsWith("aucun")
    ? "aucun prérequis curriculaire explicite pour ce premier cours ; inférer puis vérifier les bases nécessaires"
    : previousCourse === "non déterminé"
      ? "non fournis ; inférer puis vérifier les bases nécessaires"
      : `acquis pertinents du cours précédent « ${previousCourse} » ; inférer puis vérifier les autres bases nécessaires`;

  const language = courseModule
    ? resolveLanguageCurriculumRange(subject, [courseModule])
    : resolveGeneralLanguageCurriculum(subject);
  const cefrLabel = language?.cefrLabel;
  const isCefrLanguage = Boolean(language && (language.selectable || cefrLabel));
  const languageName = contextValue(language?.languageName, "langue cible");
  const displayLanguageName = contextValue(language?.displayLanguageName, "Langue cible");
  const teachingLanguage = contextValue(
    formation?.pedagogy.teachingLanguage,
    "français"
  );
  const curriculumLines = isCefrLanguage
    ? [
        `Cursus : ${displayLanguageName} — parcours CECRL ${cefrLabel ?? "non sélectionné"} sur une année`,
        `Niveau attendu : CECRL ${cefrLabel ?? "non sélectionné"} — parcours pédagogique aligné, non certification officielle`
      ]
    : formation
      ? [
          `Cursus : ${contextValue(`${formation.yearLabel} — ${formation.name}`, "Formation non précisée")}`,
          `Niveau attendu : ${contextValue(`${formation.level.label} — ${formation.pedagogy.instructionLevel}`, "Niveau non précisé")}`,
          `Langue d’enseignement : ${contextValue(formation.pedagogy.teachingLanguage, "Non précisée")}`,
          `Approche pédagogique : ${contextValue(formation.pedagogy.approach, "Non précisée")}`,
          `Barème de référence : ${formation.grading.scaleMax} points ; seuil de réussite ${formation.grading.passMark}`
        ]
      : [
        "Cursus : Année 1 — Ingénierie de l’énergie & physique appliquée",
        "Niveau attendu : universitaire, scientifique et ingénierie"
        ];

  const contextLines = [
    LESSON_CONTEXT_START,
    ...curriculumLines,
    "Matière : " + contextValue(subject.name, "Matière non précisée"),
    "Domaine : " + contextValue(subject.domain, "Non précisé"),
    "Période de la matière : " + contextValue(subject.period, "Non précisée"),
    "Module : " +
      contextValue(courseModule?.title, "Parcours général de la matière"),
    "Période du module : " +
      contextValue(courseModule?.period, subject.period ?? "Non précisée"),
    "Rubrique parente : " +
      contextValue(item?.title, "Aucune — séance générale de la matière"),
    "Description de la rubrique : " +
      contextValue(item?.description, "Non fournie"),
    "Cours ciblé : " + contextValue(courseTitle, "Séance générale"),
    "Objectif spécifique du cours : " +
      contextValue(courseObjective, "À construire à partir du cours ciblé"),
    "Objectif global de la matière : " +
      contextValue(
        subject.objective,
        "Construire une maîtrise solide et applicable de cette matière."
      ),
    "Prérequis curriculaires : " +
      contextValue(curricularPrerequisites, "À inférer puis vérifier par diagnostic"),
    "Mode de validation institutionnel : " +
      contextValue(
        subject.validation,
        "Exercices, évaluation finale et démonstration autonome de maîtrise."
      ),
    "Cours précédent : " + contextValue(previousCourse, "non déterminé"),
    "Cours suivant : " + contextValue(nextCourse, "non déterminé")
  ];

  if (isCefrLanguage) {
    contextLines.push(
      ...languageGuidance(
        cefrLabel ?? "non sélectionné",
        lessonMode,
        languageName,
        teachingLanguage
      )
    );
  }

  if (lessonMode === "chapter-test") {
    contextLines.push(
      `Barème total obligatoire : ${formation?.grading.scaleMax ?? 20} points`,
      `Seuil de réussite de référence : ${formation?.grading.passMark ?? 10} points`,
      ...chapterCourseList(item)
    );
  }

  contextLines.push(LESSON_CONTEXT_END);
  return contextLines.join("\n");
}

/** Le contrat du mode est invariant et précède toujours le contexte dynamique. */
export function buildLessonPrompt(
  subject: Subject,
  courseModule?: ProgramModule,
  item?: ProgramItem,
  lessonUnit?: LessonUnit,
  lessonMode: LessonMode = "course",
  formation?: FormationManifest
): string {
  return [
    UNIVERSAL_LESSON_PROMPTS[lessonMode],
    "",
    buildLessonContextBlock(subject, courseModule, item, lessonUnit, lessonMode, formation)
  ].join("\n");
}

function normalizeStartedAt(value: Date | string | undefined): string {
  const date =
    value instanceof Date
      ? new Date(value.getTime())
      : value
        ? new Date(value)
        : new Date();

  if (Number.isNaN(date.getTime())) {
    throw new TypeError("La date de début de la leçon est invalide.");
  }
  return date.toISOString();
}

function idPart(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || "general";
}

function assertLessonContext(
  subject: Subject,
  courseModule: ProgramModule | undefined,
  item: ProgramItem | undefined,
  lessonUnit: LessonUnit | undefined
): void {
  if (!subject.id.trim() || !subject.name.trim()) {
    throw new TypeError("La matière doit posséder un identifiant et un nom.");
  }
  if (
    courseModule &&
    !subject.modules.some((candidate) => candidate.id === courseModule.id)
  ) {
    throw new RangeError("Le module sélectionné n’appartient pas à cette matière.");
  }
  if (item && !courseModule) {
    throw new TypeError("Une rubrique ne peut pas être sélectionnée sans son module.");
  }
  if (
    item &&
    courseModule &&
    !courseModule.items.some((candidate) => candidate.id === item.id)
  ) {
    throw new RangeError("La rubrique sélectionnée n’appartient pas à ce module.");
  }
  if (lessonUnit && !item) {
    throw new TypeError("Un cours ne peut pas être sélectionné sans sa rubrique parente.");
  }
  if (
    lessonUnit &&
    item?.lessons?.length &&
    !item.lessons.some((candidate) => candidate.id === lessonUnit.id)
  ) {
    throw new RangeError("Le cours sélectionné n’appartient pas à cette rubrique.");
  }
}

function assertLessonModeContext(
  lessonMode: LessonMode,
  item: ProgramItem | undefined,
  lessonUnit: LessonUnit | undefined
): void {
  if (lessonMode !== "chapter-test") return;
  if (!item) {
    throw new TypeError("Un mini-test de chapitre exige une rubrique de programme.");
  }
  if (!item.lessons?.length) {
    throw new TypeError("Un mini-test de chapitre exige au moins un cours atomique.");
  }
  if (lessonUnit) {
    throw new TypeError(
      "Un mini-test porte sur toute la rubrique et non sur un seul cours atomique."
    );
  }
}

export type ActiveLessonOptions = {
  id?: string;
  startedAt?: Date | string;
  lessonMode?: LessonMode;
  formation?: FormationManifest;
};

function isLessonUnit(
  value: LessonUnit | ActiveLessonOptions | undefined
): value is LessonUnit {
  return Boolean(
    value &&
      "title" in value &&
      typeof value.title === "string" &&
      "objective" in value
  );
}

export function createActiveLesson(
  subject: Subject,
  courseModule?: ProgramModule,
  item?: ProgramItem,
  lessonUnit?: LessonUnit,
  options?: ActiveLessonOptions
): ActiveLessonType;
export function createActiveLesson(
  subject: Subject,
  courseModule?: ProgramModule,
  item?: ProgramItem,
  options?: ActiveLessonOptions
): ActiveLessonType;
export function createActiveLesson(
  subject: Subject,
  courseModule?: ProgramModule,
  item?: ProgramItem,
  lessonUnitOrOptions?: LessonUnit | ActiveLessonOptions,
  suppliedOptions: ActiveLessonOptions = {}
): ActiveLessonType {
  let lessonUnit: LessonUnit | undefined;
  let options: ActiveLessonOptions;
  if (isLessonUnit(lessonUnitOrOptions)) {
    lessonUnit = lessonUnitOrOptions;
    options = suppliedOptions;
  } else {
    lessonUnit = undefined;
    options = lessonUnitOrOptions ?? suppliedOptions;
  }

  assertLessonContext(subject, courseModule, item, lessonUnit);

  const startedAt = normalizeStartedAt(options.startedAt);
  const lessonMode = options.lessonMode ?? "course";
  assertLessonModeContext(lessonMode, item, lessonUnit);
  const title =
    lessonUnit?.title ?? item?.title ?? courseModule?.title ?? subject.name;
  const generatedId = [
    "lesson",
    idPart(lessonMode),
    idPart(subject.id),
    idPart(courseModule?.id ?? "general"),
    idPart(item?.id ?? "general"),
    idPart(lessonUnit?.id ?? "general"),
    startedAt.replace(/[^0-9]/g, "")
  ].join("-");
  const curriculumScope = courseModule
    ? resolveLanguageCurriculumRange(subject, [courseModule])?.curriculumScope
    : resolveGeneralLanguageCurriculum(subject)?.curriculumScope;
  const prompt = buildLessonPrompt(
    subject,
    courseModule,
    item,
    lessonUnit,
    lessonMode,
    options.formation
  );
  if (!isNativeAiPromptWithinLimit(prompt)) {
    throw new RangeError(`Le contexte IA dépasse la limite native de ${NATIVE_AI_PROMPT_MAX_BYTES} octets.`);
  }

  return {
    id: nativeAiSessionId(options.id?.trim() || generatedId, "lesson"),
    subjectId: subject.id,
    moduleId: courseModule?.id,
    itemId: item?.id,
    lessonUnitId: lessonUnit?.id,
    lessonMode,
    title,
    moduleTitle: courseModule?.title,
    curriculumScope,
    prompt,
    startedAt
  };
}
