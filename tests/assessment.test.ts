import assert from "node:assert/strict";
import test from "node:test";

import {
  ASSESSMENT_CONTEXT_END,
  ASSESSMENT_CONTEXT_START,
  buildPaperAssessmentContext,
  buildPaperAssessmentPrompt,
  candidateSubjectsForAssessment,
  createActivePaperAssessment,
  defaultChapterIdsForAssessment,
  defaultPaperAssessmentDuration,
  inferPaperAssessmentKind,
  paperAssessmentKindLabel,
  UNIVERSAL_PAPER_ASSESSMENT_PROMPT
} from "../src/lib/assessment.ts";
import type {
  CalendarEvent,
  LessonUnit,
  PaperAssessmentConfig,
  PaperAssessmentKind,
  ProgramItem,
  ProgramModule,
  Subject
} from "../src/types.ts";
import { SIX_POINT_FORMATION } from "./fixtures/formations/manifest.ts";

const languageLessons: LessonUnit[] = [
  {
    id: "analyse-s1-1-lesson-1",
    title: "Ensembles et opérations",
    objective: "Distinguer les ensembles numériques et effectuer leurs opérations.",
    completed: true
  },
  {
    id: "analyse-s1-1-lesson-2",
    title: "Intervalles de la droite réelle",
    objective: "Traduire des inégalités en intervalles et réciproquement.",
    completed: true
  },
  {
    id: "analyse-s1-1-lesson-3",
    title: "Logique et quantificateurs",
    objective: "Nier et interpréter correctement un énoncé quantifié.",
    completed: true
  }
];

const languageItem: ProgramItem = {
  id: "analyse-s1-1",
  title: "Langage mathématique",
  description: "Ensembles, intervalles, logique et quantificateurs.",
  completed: true,
  lessons: languageLessons
};

const functionsItem: ProgramItem = {
  id: "analyse-s1-2",
  title: "Fonctions réelles",
  description: "Domaine, image, composition et transformations.",
  completed: false,
  lessons: [
    {
      id: "analyse-s1-2-lesson-1",
      title: "Domaine et image",
      objective: "Déterminer le domaine et l’image d’une fonction.",
      completed: false
    }
  ]
};

const integrationItem: ProgramItem = {
  id: "analyse-s2-1",
  title: "Primitive et intégrale de Riemann",
  description: "Construire et interpréter une intégrale définie.",
  completed: false,
  lessons: [
    {
      id: "analyse-s2-1-lesson-1",
      title: "Primitives usuelles",
      objective: "Reconnaître et calculer des primitives usuelles.",
      completed: false
    }
  ]
};

const analysisS1: ProgramModule = {
  id: "analyse-s1",
  period: "Semestre 1",
  title: "Fondations et calcul différentiel",
  items: [languageItem, functionsItem]
};

const analysisS2: ProgramModule = {
  id: "analyse-s2",
  period: "Semestre 2",
  title: "Intégration et plusieurs variables",
  items: [integrationItem]
};

function subjectFixture(
  id: string,
  name: string,
  shortName: string,
  modules: ProgramModule[],
  period = "Annuel"
): Subject {
  return {
    id,
    name,
    shortName,
    teacher: "Tuteur IA",
    room: "Salle d’évaluation",
    color: "#123456",
    accent: "#eef0ff",
    icon: "book",
    domain: "Sciences et ingénierie",
    period,
    validation: "Contrôles, partiel et examen final.",
    objective: `Maîtriser les acquis fondamentaux de ${shortName}.`,
    modules
  };
}

const analysis = subjectFixture(
  "analyse",
  "Analyse I & II",
  "Analyse",
  [analysisS1, analysisS2]
);

const englishA2Item: ProgramItem = {
  id: "anglais-a2-s1-1",
  title: "Reprendre contact avec précision",
  description: "Comprendre un message bref et répondre de manière adaptée.",
  completed: false,
  lessons: [
    {
      id: "anglais-a2-s1-1-lesson-1",
      title: "Understanding short messages",
      objective: "Repérer les informations essentielles d’un message courant.",
      completed: false
    }
  ]
};
const englishA2Module: ProgramModule = {
  id: "anglais-a2-s1",
  period: "Semestre 1",
  title: "A2 — Communication du quotidien",
  cefrLevel: "A2",
  items: [englishA2Item]
};
const english: Subject = {
  ...subjectFixture("anglais", "Anglais", "Anglais", [englishA2Module]),
  curriculumKind: "cefr-selectable",
  icon: "languages",
  domain: "Langues",
  cefrLevel: "C1",
  objective: "Développer les compétences langagières selon le CECRL."
};

function oneItemModule(id: string, period: string, title: string): ProgramModule {
  return {
    id,
    period,
    title,
    items: [
      {
        id: `${id}-1`,
        title: `Chapitre de ${title}`,
        completed: false,
        lessons: [
          {
            id: `${id}-1-lesson-1`,
            title: `Cours de ${title}`,
            objective: `Appliquer les notions essentielles de ${title}.`,
            completed: false
          }
        ]
      }
    ]
  };
}

const algebra = subjectFixture(
  "algebre-lineaire",
  "Algèbre linéaire I & II",
  "Algèbre",
  [oneItemModule("algebre-s1", "Semestre 1", "l’algèbre")]
);
const programming = subjectFixture(
  "programmation-scientifique",
  "Programmation scientifique & calcul numérique",
  "Programmation",
  [oneItemModule("programmation-s1", "Semestre 1", "la programmation")]
);
const materials = subjectFixture(
  "chimie-materiaux",
  "Chimie & science des matériaux",
  "Matériaux",
  [oneItemModule("chimie-s1", "Semestre 1", "la chimie")]
);
const energy = subjectFixture(
  "systemes-energetiques",
  "Introduction aux systèmes énergétiques",
  "Énergie",
  [oneItemModule("energie-s1", "Semestre 1", "l’énergie")]
);
const metrology = subjectFixture(
  "tp-metrologie",
  "Travaux pratiques de physique & métrologie",
  "TP & métrologie",
  [oneItemModule("tp-annuel", "Annuel", "la métrologie")]
);

const subjects = [analysis, algebra, programming, materials, energy, metrology];

function eventFixture(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "academic-2026-10-02-controle-maths",
    title: "Contrôle 1 — Analyse + Algèbre linéaire",
    start: "2026-10-02T00:00:00.000Z",
    end: "2026-10-03T00:00:00.000Z",
    allDay: true,
    type: "exam",
    color: "#d05252",
    description: "Premier contrôle continu de mathématiques.",
    ...overrides
  };
}

function configFixture(overrides: Partial<PaperAssessmentConfig> = {}): PaperAssessmentConfig {
  return {
    eventId: "academic-2026-10-02-controle-maths",
    kind: "control",
    title: "Contrôle 1 — Analyse",
    scheduledAt: "2026-10-02T00:00:00.000Z",
    durationMinutes: 60,
    chapterIds: [languageItem.id],
    allowedMaterials: "Calculatrice scientifique non programmable",
    instructions: "Justifier les raisonnements et vérifier les résultats.",
    ...overrides
  };
}

function invariantPart(prompt: string): string {
  const contextIndex = prompt.lastIndexOf(`\n${ASSESSMENT_CONTEXT_START}`);
  assert.notEqual(contextIndex, -1);
  return prompt.slice(0, contextIndex + 1);
}

test("l’inférence distingue tous les types d’évaluation papier", () => {
  const cases: Array<[string, PaperAssessmentKind]> = [
    ["Rattrapages ciblés", "resit"],
    ["Partiels S1 — Analyse, Algèbre, Mécanique", "midterm"],
    ["Examens finaux — Analyse II + Thermodynamique", "final-exam"],
    ["Épreuve pratique intermédiaire — TP & métrologie", "written-practical"],
    ["Oral du projet", "written-practical"],
    ["Examens S1 — mathématiques", "exam"],
    ["Contrôle 2 — Programmation scientifique", "control"],
    ["Mini-test de cinématique", "test"],
    ["Validation des acquis", "evaluation"]
  ];

  for (const [title, expected] of cases) {
    assert.equal(inferPaperAssessmentKind(title), expected, title);
  }
});

test("chaque nature possède une durée par défaut et un libellé", () => {
  const expectations: Array<[PaperAssessmentKind, number, string]> = [
    ["test", 30, "Test écrit"],
    ["control", 60, "Contrôle écrit"],
    ["midterm", 120, "Partiel"],
    ["exam", 120, "Examen de session"],
    ["final-exam", 180, "Examen final"],
    ["written-practical", 90, "Épreuve pratique sur papier"],
    ["resit", 120, "Rattrapage"],
    ["evaluation", 60, "Évaluation écrite"]
  ];

  for (const [kind, duration, label] of expectations) {
    assert.equal(defaultPaperAssessmentDuration(kind), duration);
    assert.equal(paperAssessmentKindLabel(kind), label);
  }
});

test("les suggestions détectent toutes les matières d’un événement multi-matières", () => {
  const maths = candidateSubjectsForAssessment(eventFixture(), subjects);
  assert.deepEqual(maths.map((subject) => subject.id), ["analyse", "algebre-lineaire"]);

  const sciences = candidateSubjectsForAssessment(eventFixture({
    id: "academic-2027-06-28-examens-sciences",
    title: "Examens finaux — programmation + matériaux + systèmes énergétiques",
    description: "Deuxième semaine de la session finale."
  }), subjects);
  assert.deepEqual(sciences.map((subject) => subject.id), [
    "programmation-scientifique",
    "chimie-materiaux",
    "systemes-energetiques"
  ]);
});

test("une matière explicitement associée prime sur les suggestions du titre", () => {
  const detected = candidateSubjectsForAssessment(eventFixture({
    subjectId: "tp-metrologie",
    title: "Épreuve pratique — thermo / métrologie"
  }), subjects);
  assert.deepEqual(detected.map((subject) => subject.id), ["tp-metrologie"]);
});

test("sans indice de matière, toutes les matières restent proposées", () => {
  const detected = candidateSubjectsForAssessment(eventFixture({
    title: "Rattrapages ciblés",
    description: "Modules non validés uniquement."
  }), subjects);
  assert.deepEqual(detected.map((subject) => subject.id), subjects.map((subject) => subject.id));
});

test("une formation importée ne réutilise pas les alias de matières historiques", () => {
  const anatomy: Subject = {
    ...analysis,
    id: "analyse",
    name: "Anatomie humaine",
    shortName: "Anatomie",
    domain: "Médecine"
  };
  const history: Subject = {
    ...analysis,
    id: "histoire",
    name: "Histoire contemporaine",
    shortName: "Histoire",
    domain: "Sciences humaines"
  };
  const event = eventFixture({ title: "Épreuve de mathématiques" });

  assert.deepEqual(
    candidateSubjectsForAssessment(event, [anatomy, history], SIX_POINT_FORMATION)
      .map((subject) => subject.id),
    ["analyse", "histoire"]
  );
});

test("un manifeste importé ne peut pas usurper les alias de la formation incluse", () => {
  const customAnalyse: Subject = {
    ...analysis,
    id: "analyse",
    name: "Anatomie humaine",
    shortName: "Anatomie"
  };
  const customHistory: Subject = {
    ...analysis,
    id: "histoire",
    name: "Histoire contemporaine",
    shortName: "Histoire"
  };
  const spoofedManifest = {
    ...SIX_POINT_FORMATION,
    id: "ingenierie-energie-annee-1",
    name: "Ingénierie de l’énergie et physique appliquée"
  };
  const event = eventFixture({ title: "Épreuve de mathématiques" });

  assert.deepEqual(
    candidateSubjectsForAssessment(
      event,
      [customAnalyse, customHistory],
      spoofedManifest,
      false
    ).map((subject) => subject.id),
    ["analyse", "histoire"]
  );
});

test("un contrôle présélectionne les chapitres déjà terminés", () => {
  assert.deepEqual(
    defaultChapterIdsForAssessment(eventFixture(), analysis),
    [languageItem.id]
  );
});

test("un partiel ou examen présélectionne le semestre concerné", () => {
  assert.deepEqual(
    defaultChapterIdsForAssessment(eventFixture({
      title: "Partiels S1 — Analyse",
      start: "2026-12-11T00:00:00.000Z"
    }), analysis),
    [languageItem.id, functionsItem.id]
  );
  assert.deepEqual(
    defaultChapterIdsForAssessment(eventFixture({
      title: "Examen final S2 — Analyse II",
      start: "2027-06-21T00:00:00.000Z"
    }), analysis),
    [integrationItem.id]
  );
});

test("la présélection semestrielle suit les bornes d’une année de l’hémisphère sud", () => {
  const southernYear = { startDate: "2027-02-01", endDate: "2027-12-15" };
  assert.deepEqual(
    defaultChapterIdsForAssessment(eventFixture({
      title: "Examen d’analyse",
      start: "2027-06-21T00:00:00.000Z"
    }), analysis, "Australia/Sydney", southernYear),
    [languageItem.id, functionsItem.id]
  );
  assert.deepEqual(
    defaultChapterIdsForAssessment(eventFixture({
      title: "Examen d’analyse",
      start: "2027-10-21T00:00:00.000Z"
    }), analysis, "Australia/Sydney", southernYear),
    [integrationItem.id]
  );
});

test("une matière annuelle sans modules semestriels conserve tout son programme", () => {
  assert.deepEqual(
    defaultChapterIdsForAssessment(eventFixture({
      title: "Épreuve pratique finale",
      start: "2027-07-05T00:00:00.000Z"
    }), metrology),
    ["tp-annuel-1"]
  );
});

test("le contrat du prompt est invariant quand la matière et l’épreuve changent", () => {
  const controlPrompt = buildPaperAssessmentPrompt(analysis, configFixture());
  const examPrompt = buildPaperAssessmentPrompt(algebra, configFixture({
    eventId: "academic-2027-01-11-examen-algebre",
    kind: "exam",
    title: "Examen S1 — Algèbre linéaire",
    scheduledAt: "2027-01-11T00:00:00.000Z",
    durationMinutes: 120,
    chapterIds: ["algebre-s1-1"]
  }));

  assert.notEqual(controlPrompt, examPrompt);
  assert.equal(invariantPart(controlPrompt), invariantPart(examPrompt));
  assert.equal(invariantPart(controlPrompt), `${UNIVERSAL_PAPER_ASSESSMENT_PROMPT}\n\n`);
});

test("le contexte contient exactement les chapitres choisis avec tous leurs cours et objectifs", () => {
  const context = buildPaperAssessmentContext(analysis, configFixture());
  assert.equal((context.match(/   - Cours /g) ?? []).length, languageLessons.length);
  assert.match(context, /Nombre de chapitres à couvrir : 1/);
  assert.match(context, /Fondations et calcul différentiel → Langage mathématique/);

  for (const lesson of languageLessons) {
    assert.ok(context.includes(lesson.title), lesson.title);
    assert.ok(context.includes(lesson.objective), lesson.objective);
  }

  assert.ok(!context.includes(functionsItem.title));
  assert.ok(!context.includes(functionsItem.lessons?.[0].title ?? "Domaine et image"));
  assert.ok(!context.includes(integrationItem.title));
  assert.equal((context.match(new RegExp(ASSESSMENT_CONTEXT_START, "g")) ?? []).length, 1);
  assert.equal((context.match(new RegExp(ASSESSMENT_CONTEXT_END, "g")) ?? []).length, 1);
});

test("une évaluation d’anglais suit le niveau du module et un barème écrit adapté", () => {
  const config = configFixture({
    eventId: "english-a2-test",
    kind: "test",
    title: "Test A2 — Anglais",
    chapterIds: [englishA2Item.id]
  });
  const prompt = buildPaperAssessmentPrompt(english, config);

  assert.match(prompt, /Cursus : Anglais — parcours CECRL A2 sur une année/);
  assert.match(prompt, /Niveau attendu : CECRL A2/);
  assert.doesNotMatch(
    prompt.slice(prompt.indexOf(ASSESSMENT_CONTEXT_START)),
    /Ingénierie de l’énergie|scientifique et ingénierie/
  );
  assert.match(prompt, /supports, consignes et productions attendues principalement en anglais/);
  assert.match(prompt, /compréhension écrite, production écrite, médiation écrite/);
  assert.match(prompt, /grammaire, vocabulaire, cohésion, registre et pragmatique/);
  assert.match(prompt, /ne pas prétendre mesurer la compréhension orale/);
  assert.match(prompt, /protocole réel et média audio/);
  assert.match(prompt, /accomplissement et pertinence de la tâche/);
  assert.match(prompt, /aucun point de prononciation/);
});

test("une épreuve papier d’anglais conserve son scope CECRL historique", () => {
  const config = configFixture({
    eventId: "english-a2-exam",
    title: "Examen A2 — Anglais",
    chapterIds: [englishA2Item.id]
  });
  const active = createActivePaperAssessment(english, config, {
    startedAt: "2026-12-10T08:30:00.000Z"
  });

  assert.equal(active.curriculumScope, "cefr:A2");
  assert.doesNotMatch(active.prompt, /CECRL C1/);
});

test("une évaluation allemande importée applique son niveau CECRL sans fuite anglaise", () => {
  const importedModule = { ...englishA2Module, cefrLevel: undefined };
  const importedSubject: Subject = {
    ...english,
    id: "allemand-medical",
    name: "Allemand médical",
    shortName: "Allemand médical",
    curriculumKind: undefined,
    cefrLevel: "B1",
    languageCode: "de",
    languageName: "allemand",
    modules: [importedModule]
  };
  const config = configFixture({
    eventId: "english-medical-test",
    chapterIds: [englishA2Item.id]
  });
  const active = createActivePaperAssessment(importedSubject, config, {
    startedAt: "2026-12-10T08:30:00.000Z"
  });

  assert.equal(active.curriculumScope, "cefr:B1");
  assert.match(active.prompt, /Cursus : Allemand — parcours CECRL B1/);
  assert.match(active.prompt, /principalement en allemand/);
  assert.doesNotMatch(active.prompt, /principalement en anglais|Cursus : Anglais/);
});

test("une évaluation de langue couvrant plusieurs niveaux les conserve tous dans son scope", () => {
  const b1Item = {
    ...englishA2Item,
    id: "allemand-b1-chapitre",
    title: "Communication B1"
  };
  const b1Module = {
    ...englishA2Module,
    id: "allemand-b1-module",
    cefrLevel: "B1" as const,
    items: [b1Item]
  };
  const german: Subject = {
    ...english,
    id: "allemand",
    name: "Allemand",
    shortName: "Allemand",
    curriculumKind: undefined,
    cefrLevel: undefined,
    languageCode: "de",
    languageName: "allemand",
    modules: [englishA2Module, b1Module]
  };
  const config = configFixture({
    eventId: "allemand-a2-b1",
    chapterIds: [englishA2Item.id, b1Item.id]
  });
  const active = createActivePaperAssessment(german, config, {
    startedAt: "2026-12-10T08:30:00.000Z"
  });

  assert.equal(active.curriculumScope, "cefr:A2+B1");
  assert.match(active.prompt, /parcours CECRL A2–B1/);
  assert.doesNotMatch(active.prompt, /Cursus : Anglais/);
});

test("le prompt exige deux vrais PDF séparés avec des noms distincts", () => {
  const prompt = buildPaperAssessmentPrompt(analysis, configFixture());
  assert.match(prompt, /deux véritables fichiers PDF binaires distincts et téléchargeables/i);
  assert.match(prompt, /texte simplement renommé en \.pdf ne constitue pas un PDF/i);
  assert.match(prompt, /Ne place jamais le corrigé à la suite du sujet/i);

  const studentFile = prompt.match(/Fichier PDF du sujet : ([^\n]+\.pdf)/)?.[1];
  const correctionFile = prompt.match(/Fichier PDF du corrigé : ([^\n]+\.pdf)/)?.[1];
  assert.ok(studentFile);
  assert.ok(correctionFile);
  assert.notEqual(studentFile, correctionFile);
  assert.match(studentFile, /^sujet-/);
  assert.match(correctionFile, /^corrige-/);
});

test("le contrat impose A4, barème contextualisé et génération sans interaction", () => {
  const prompt = buildPaperAssessmentPrompt(analysis, configFixture());
  assert.match(prompt, /Document A4 portrait/);
  assert.match(prompt, /marges de 18 à 22 mm/);
  assert.match(prompt, /pagination « page X\/Y »/);
  assert.match(prompt, /barème visible totalise exactement le maximum indiqué dans le contexte/);
  assert.match(prompt, /Barème total obligatoire : 20 points/);
  assert.match(prompt, /somme vérifiée du barème/);
  assert.match(prompt, /total exact du barème indiqué dans le contexte/);
  assert.match(prompt, /Le sujet ne contient aucune réponse/);
  assert.match(prompt, /Ne me pose aucune question/);
  assert.match(prompt, /ne lance aucune passation interactive/);
  assert.ok(!prompt.includes("[ATTENTE_DE_TA_RÉPONSE]"));
});

test("une formation sur 6 produit une épreuve et un contexte cohérents sur 6", () => {
  const prompt = buildPaperAssessmentPrompt(
    analysis,
    configFixture(),
    SIX_POINT_FORMATION
  );

  assert.match(prompt, /Cursus : Année préparatoire — Maturité fédérale/);
  assert.match(prompt, /Langue d’enseignement : fr/);
  assert.match(prompt, /Barème total obligatoire : 6 points/);
  assert.match(prompt, /Seuil de réussite de référence : 4 points/);
  assert.doesNotMatch(prompt, /Barème total obligatoire : 20 points/);
});

test("la durée doit être un nombre entier compris entre 10 et 360 minutes", () => {
  for (const durationMinutes of [9, 361, 30.5, Number.NaN]) {
    assert.throws(
      () => buildPaperAssessmentPrompt(analysis, configFixture({ durationMinutes })),
      /durée de l’évaluation doit être comprise entre 10 et 360 minutes/
    );
  }
  for (const durationMinutes of [10, 60, 360]) {
    assert.doesNotThrow(
      () => buildPaperAssessmentPrompt(analysis, configFixture({ durationMinutes }))
    );
  }
});

test("au moins un chapitre valide est obligatoire", () => {
  assert.throws(
    () => buildPaperAssessmentPrompt(analysis, configFixture({ chapterIds: [] })),
    /au moins un chapitre valide/
  );
  assert.throws(
    () => buildPaperAssessmentPrompt(analysis, configFixture({ chapterIds: ["chapitre-inconnu"] })),
    /au moins un chapitre valide/
  );
});

test("createActivePaperAssessment produit une session déterministe et autonome", () => {
  const config = configFixture();
  const active = createActivePaperAssessment(analysis, config, {
    id: "paper-session-1",
    startedAt: "2026-09-30T08:15:00.000Z"
  });

  assert.equal(active.id, "paper-session-1");
  assert.equal(active.subjectId, analysis.id);
  assert.equal(active.lessonMode, "paper-assessment");
  assert.equal(active.title, "Contrôle écrit — Analyse");
  assert.equal(active.startedAt, "2026-09-30T08:15:00.000Z");
  assert.equal(active.prompt, buildPaperAssessmentPrompt(analysis, config));
  assert.deepEqual(active.assessment, config);
  assert.notEqual(active.assessment, config);
  assert.notEqual(active.assessment?.chapterIds, config.chapterIds);

  config.chapterIds.push(functionsItem.id);
  assert.deepEqual(active.assessment?.chapterIds, [languageItem.id]);
});

test("createActivePaperAssessment rejette une date de génération invalide", () => {
  assert.throws(
    () => createActivePaperAssessment(analysis, configFixture(), { startedAt: "date-invalide" }),
    /date de génération est invalide/
  );
});
