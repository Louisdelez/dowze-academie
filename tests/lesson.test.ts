import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLessonContextBlock,
  buildLessonPrompt,
  createActiveLesson,
  LESSON_CONTEXT_START,
  UNIVERSAL_AI_TEACHER_PROMPT,
  UNIVERSAL_CHAPTER_TEST_PROMPT,
  UNIVERSAL_COURSE_TEACHER_PROMPT,
  UNIVERSAL_EXERCISE_COACH_PROMPT
} from "../src/lib/lesson.ts";
import type {
  LessonUnit,
  ProgramItem,
  ProgramModule,
  Subject
} from "../src/types.ts";

const lessons: LessonUnit[] = [
  {
    id: "analyse-s1-1-lesson-1",
    title: "Les ensembles numériques",
    objective: "Identifier, représenter et comparer les principaux ensembles numériques.",
    completed: false
  },
  {
    id: "analyse-s1-1-lesson-2",
    title: "Les intervalles réels",
    objective: "Traduire une inégalité en intervalle et réciproquement.",
    completed: false
  },
  {
    id: "analyse-s1-1-lesson-3",
    title: "La valeur absolue",
    objective: "Interpréter une valeur absolue comme une distance et résoudre des inégalités.",
    completed: false
  }
];

const item: ProgramItem = {
  id: "analyse-s1-1",
  title:
    "Langage mathématique : ensembles, intervalles, valeur absolue, logique, quantificateurs",
  description: "Fondations du raisonnement mathématique.",
  completed: false,
  lessons
};

const secondItem: ProgramItem = {
  id: "analyse-s1-2",
  title: "Fonctions réelles",
  completed: false,
  lessons: [
    {
      id: "analyse-s1-2-lesson-1",
      title: "Domaine et image d’une fonction",
      objective: "Déterminer le domaine et l’image d’une fonction réelle.",
      completed: false
    }
  ]
};

const courseModule: ProgramModule = {
  id: "analyse-s1",
  period: "Semestre 1",
  title: "Fondations, fonctions et calcul différentiel",
  items: [item, secondItem]
};

const subject: Subject = {
  id: "analyse",
  name: "Analyse I & II",
  shortName: "Analyse",
  teacher: "Tuteur IA",
  room: "Espace Maths",
  color: "#000000",
  accent: "#ffffff",
  icon: "function",
  domain: "Mathématiques",
  period: "Annuel",
  validation: "Contrôles, partiel et examen.",
  objective: "Maîtriser le calcul différentiel et intégral.",
  modules: [courseModule]
};

const englishItem: ProgramItem = {
  id: "anglais-a1-s1-1",
  title: "Entrer en contact",
  description: "Saluer, se présenter et comprendre un échange très simple.",
  completed: false,
  lessons: [
    {
      id: "anglais-a1-s1-1-lesson-1",
      title: "Greetings and introductions",
      objective: "Saluer et se présenter dans un échange bref.",
      completed: false
    }
  ]
};

const englishA1Module: ProgramModule = {
  id: "anglais-a1-s1",
  period: "Semestre 1",
  title: "A1 — Premiers échanges",
  cefrLevel: "A1",
  items: [englishItem]
};

const englishSubject: Subject = {
  ...subject,
  id: "anglais",
  name: "Anglais",
  shortName: "Anglais",
  icon: "languages",
  domain: "Langues",
  cefrLevel: "B2",
  objective: "Communiquer en anglais selon les descripteurs du CECRL.",
  validation: "Mini-tests écrits et évaluations communicatives séparées.",
  modules: [englishA1Module]
};

function staticPart(prompt: string): string {
  const markerIndex = prompt.lastIndexOf("\n" + LESSON_CONTEXT_START);
  assert.notEqual(markerIndex, -1);
  const contextIndex = markerIndex + 1;
  return prompt.slice(0, contextIndex);
}

test("le contrat du mode cours est strictement identique entre deux cours", () => {
  const ensemblesPrompt = buildLessonPrompt(
    subject,
    courseModule,
    item,
    lessons[0]
  );
  const intervallesPrompt = buildLessonPrompt(
    subject,
    courseModule,
    item,
    lessons[1]
  );

  assert.notEqual(ensemblesPrompt, intervallesPrompt);
  assert.equal(staticPart(ensemblesPrompt), staticPart(intervallesPrompt));
  assert.equal(
    staticPart(ensemblesPrompt),
    UNIVERSAL_COURSE_TEACHER_PROMPT + "\n\n"
  );
  assert.equal(
    ensemblesPrompt.slice(staticPart(ensemblesPrompt).length),
    buildLessonContextBlock(subject, courseModule, item, lessons[0])
  );
  assert.equal(
    intervallesPrompt.slice(staticPart(intervallesPrompt).length),
    buildLessonContextBlock(subject, courseModule, item, lessons[1])
  );
});

test("le contrat du mode exercices est strictement identique entre deux cours", () => {
  const ensemblesPrompt = buildLessonPrompt(
    subject,
    courseModule,
    item,
    lessons[0],
    "exercises"
  );
  const intervallesPrompt = buildLessonPrompt(
    subject,
    courseModule,
    item,
    lessons[1],
    "exercises"
  );

  assert.notEqual(ensemblesPrompt, intervallesPrompt);
  assert.equal(staticPart(ensemblesPrompt), staticPart(intervallesPrompt));
  assert.equal(
    staticPart(ensemblesPrompt),
    UNIVERSAL_EXERCISE_COACH_PROMPT + "\n\n"
  );
});

test("les deux modes ont des objectifs distincts et un contexte dynamique identique", () => {
  const coursePrompt = buildLessonPrompt(
    subject,
    courseModule,
    item,
    lessons[0],
    "course"
  );
  const exercisePrompt = buildLessonPrompt(
    subject,
    courseModule,
    item,
    lessons[0],
    "exercises"
  );
  const courseContext = coursePrompt.slice(
    coursePrompt.indexOf(LESSON_CONTEXT_START)
  );
  const exerciseContext = exercisePrompt.slice(
    exercisePrompt.indexOf(LESSON_CONTEXT_START)
  );

  assert.notEqual(staticPart(coursePrompt), staticPart(exercisePrompt));
  assert.equal(courseContext, exerciseContext);
  assert.match(
    UNIVERSAL_COURSE_TEACHER_PROMPT,
    /expliquer les notions du cours avec mes propres mots/
  );
  assert.match(
    UNIVERSAL_COURSE_TEACHER_PROMPT,
    /ne propose pas de série d’exercices non résolus/
  );
  assert.match(
    UNIVERSAL_EXERCISE_COACH_PROMPT,
    /résoudre avec autonomie des exercices représentatifs/
  );
  assert.match(
    UNIVERSAL_EXERCISE_COACH_PROMPT,
    /ne répète pas le cours complet/
  );
});

test("le contrat du mini-test est invariant entre deux chapitres", () => {
  const firstPrompt = buildLessonPrompt(
    subject,
    courseModule,
    item,
    undefined,
    "chapter-test"
  );
  const secondPrompt = buildLessonPrompt(
    subject,
    courseModule,
    secondItem,
    undefined,
    "chapter-test"
  );

  assert.notEqual(firstPrompt, secondPrompt);
  assert.equal(staticPart(firstPrompt), staticPart(secondPrompt));
  assert.equal(
    staticPart(firstPrompt),
    UNIVERSAL_CHAPTER_TEST_PROMPT + "\n\n"
  );
});

test("le mini-test reçoit tous les cours et objectifs du chapitre", () => {
  const prompt = buildLessonPrompt(
    subject,
    courseModule,
    item,
    undefined,
    "chapter-test"
  );
  const context = prompt.slice(prompt.indexOf(LESSON_CONTEXT_START));

  assert.match(context, /Nombre de cours du chapitre : 3/);
  assert.match(context, /Fichier PDF du sujet : mini-test-analyse-s1-1\.pdf/);
  assert.match(
    context,
    /Fichier PDF du corrigé : corrige-mini-test-analyse-s1-1\.pdf/
  );
  for (const [index, lesson] of lessons.entries()) {
    assert.match(context, new RegExp(`${index + 1}\\. ${lesson.title}`));
    assert.match(context, new RegExp(lesson.objective.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.equal(
    (context.match(/ — Objectif : /g) ?? []).length,
    lessons.length
  );
});

test("la liste complète du chapitre n’élargit pas les contextes cours et exercices", () => {
  const courseContext = buildLessonPrompt(
    subject,
    courseModule,
    item,
    lessons[0],
    "course"
  ).slice(buildLessonPrompt(subject, courseModule, item, lessons[0], "course").indexOf(LESSON_CONTEXT_START));
  const exercisePrompt = buildLessonPrompt(
    subject,
    courseModule,
    item,
    lessons[0],
    "exercises"
  );
  const exerciseContext = exercisePrompt.slice(
    exercisePrompt.indexOf(LESSON_CONTEXT_START)
  );

  assert.equal(courseContext, exerciseContext);
  assert.doesNotMatch(courseContext, /Cours du chapitre à couvrir/);
  assert.doesNotMatch(exerciseContext, /Nombre de cours du chapitre/);
});

test("le contrat invariant ne contient aucune donnée propre aux fixtures", () => {
  for (const invariantPrompt of [
    UNIVERSAL_COURSE_TEACHER_PROMPT,
    UNIVERSAL_EXERCISE_COACH_PROMPT,
    UNIVERSAL_CHAPTER_TEST_PROMPT
  ]) {
    assert.doesNotMatch(invariantPrompt, /Analyse I & II/);
    assert.doesNotMatch(invariantPrompt, /Les ensembles numériques/);
    assert.doesNotMatch(invariantPrompt, /Les intervalles réels/);
    assert.doesNotMatch(
      invariantPrompt,
      /Fondations, fonctions et calcul différentiel/
    );
  }
  assert.equal(UNIVERSAL_AI_TEACHER_PROMPT, UNIVERSAL_COURSE_TEACHER_PROMPT);
});

test("le contexte distingue rubrique parente et cours atomique", () => {
  const context = buildLessonContextBlock(
    subject,
    courseModule,
    item,
    lessons[1]
  );

  assert.match(context, /Rubrique parente : Langage mathématique/);
  assert.match(context, /Cours ciblé : Les intervalles réels/);
  assert.match(
    context,
    /Objectif spécifique du cours : Traduire une inégalité en intervalle/
  );
  assert.match(context, /Cours précédent : Les ensembles numériques/);
  assert.match(context, /Cours suivant : La valeur absolue/);
  assert.match(
    context,
    /Prérequis curriculaires : acquis pertinents du cours précédent « Les ensembles numériques »/
  );
});

test("le cours d’anglais utilise le niveau historique du module et toute la pédagogie langagière", () => {
  const prompt = buildLessonPrompt(
    englishSubject,
    englishA1Module,
    englishItem,
    englishItem.lessons?.[0],
    "course"
  );
  const context = prompt.slice(prompt.indexOf(LESSON_CONTEXT_START));

  assert.match(context, /Cursus : Anglais — parcours CECRL A1 sur une année/);
  assert.match(context, /Niveau attendu : CECRL A1/);
  assert.doesNotMatch(context, /Ingénierie de l’énergie|scientifique et ingénierie/);
  assert.match(context, /réception\/compréhension, la production, l’interaction et la médiation/);
  assert.match(context, /grammaire, vocabulaire, prononciation et intelligibilité, registre/);
  assert.match(context, /pragmatique/);
  assert.match(context, /soutien ciblé en français/);
  assert.match(context, /principalement en anglais/);
  assert.match(context, /document ou échange contextualisé/);
});

test("les niveaux B1 à C2 privilégient l’anglais et gardent le français comme secours bref", () => {
  const b1Module = { ...englishA1Module, id: "anglais-b1-s1", cefrLevel: "B1" as const };
  const b1Subject = { ...englishSubject, cefrLevel: "B1" as const, modules: [b1Module] };
  const context = buildLessonContextBlock(
    b1Subject,
    b1Module,
    englishItem,
    englishItem.lessons?.[0]
  );

  assert.match(context, /Niveau attendu : CECRL B1/);
  assert.match(context, /enseigner et interagir principalement en anglais/);
  assert.match(context, /français à une clarification brève/);
  assert.doesNotMatch(context, /soutien ciblé en français pour débloquer/);
});

test("le mini-test PDF d’anglais limite honnêtement ses mesures et adapte son barème écrit", () => {
  const prompt = buildLessonPrompt(
    englishSubject,
    englishA1Module,
    englishItem,
    undefined,
    "chapter-test"
  );

  assert.match(prompt, /mesure uniquement la compréhension écrite, la production écrite, la médiation écrite/);
  assert.match(prompt, /ne mesure ni l’écoute, ni l’oral, ni la prononciation/);
  assert.match(prompt, /protocole séparé et média audio/);
  assert.match(prompt, /accomplissement et pertinence/);
  assert.match(prompt, /organisation\/cohésion/);
  assert.match(prompt, /registre\/pragmatique/);
  assert.match(prompt, /ne jamais attribuer de points de prononciation/);
});

test("createActiveLesson mémorise le scope CECRL du module anglais", () => {
  const active = createActiveLesson(
    englishSubject,
    englishA1Module,
    englishItem,
    englishItem.lessons?.[0],
    { startedAt: "2026-09-07T08:30:00.000Z" }
  );

  assert.equal(active.curriculumScope, "cefr:A1");
  assert.doesNotMatch(active.prompt, /CECRL B2/);
  assert.equal(
    createActiveLesson(subject, courseModule, item, lessons[0], {
      startedAt: "2026-09-07T08:30:00.000Z"
    }).curriculumScope,
    undefined
  );
});

test("le mode cours impose un enseignement interactif sans feuille d’exercices", () => {
  const prompt = buildLessonPrompt(subject, courseModule, item, lessons[0]);

  assert.match(prompt, /cours particulier rigoureux, progressif et interactif/);
  assert.match(prompt, /Ne simule jamais ma réponse/);
  assert.match(prompt, /Enseigne réellement avant de m’interroger/);
  assert.match(prompt, /exemple.*résolu et commenté/s);
  assert.match(prompt, /ne propose pas de série d’exercices non résolus/);
  assert.match(prompt, /question diagnostique/);
  assert.match(prompt, /\[ATTENTE_DE_TA_RÉPONSE\]/);
  assert.match(prompt, /Termine le cours lorsque tous les acquis annoncés/);
});

test("le mode exercices impose tentative, correction et remédiation ciblée", () => {
  const prompt = buildLessonPrompt(
    subject,
    courseModule,
    item,
    lessons[0],
    "exercises"
  );

  assert.match(prompt, /réservée à la pratique/);
  assert.match(prompt, /ne répète pas le cours complet/);
  assert.match(prompt, /un exercice principal à la fois/);
  assert.match(prompt, /Ne donne ni résultat final.*avant ma tentative/s);
  assert.match(prompt, /remédiation minimale/);
  assert.match(prompt, /preuve suffisante/);
  assert.match(prompt, /\[ATTENTE_DE_TA_RÉPONSE\]/);
});

test("le mini-test exige deux véritables PDF séparés et non une passation interactive", () => {
  const prompt = buildLessonPrompt(
    subject,
    courseModule,
    item,
    undefined,
    "chapter-test"
  );

  assert.match(prompt, /deux fichiers binaires PDF distincts et téléchargeables/);
  assert.match(prompt, /texte simplement renommé avec l’extension \.pdf n’est pas un livrable PDF/);
  assert.match(prompt, /le sujet élève.*le corrigé enseignant/s);
  assert.match(prompt, /6 à 10 questions au total/);
  assert.match(prompt, /totalise exactement 20 points/);
  assert.match(prompt, /espace de réponse proportionné/);
  assert.match(prompt, /Le sujet élève ne contient aucune réponse/);
  assert.match(prompt, /second PDF A4 distinct/);
  assert.match(prompt, /les deux fichiers ne doivent jamais être fusionnés/);
  assert.doesNotMatch(prompt, /\[ATTENTE_DE_TA_RÉPONSE\]/);
  assert.doesNotMatch(prompt, /Réponse enregistrée/);
  assert.doesNotMatch(prompt, /\[ASSISTÉE\]/);
});

test("le mini-test impose une mise en page A4 et une vérification du rendu", () => {
  const prompt = buildLessonPrompt(
    subject,
    courseModule,
    item,
    undefined,
    "chapter-test"
  );

  assert.match(prompt, /A4 portrait/);
  assert.match(prompt, /marges de 18 à 22 mm/);
  assert.match(prompt, /police de corps de 10,5 à 12 pt/);
  assert.match(prompt, /Nom, Prénom et Date/);
  assert.match(prompt, /Ouvre ou rends visuellement chaque page des deux PDF/);
  assert.match(prompt, /glyphes manquants, débordements, chevauchements/);
  assert.match(prompt, /absence de solutions dans le sujet/);
  assert.match(prompt, /nombre de pages de chaque fichier/);
  assert.match(prompt, /Ne pose aucune question et n’attends aucune réponse/);
});

test("les valeurs dynamiques sont normalisées et ne ferment pas le délimiteur", () => {
  const unusualUnit: LessonUnit = {
    id: "analyse-s1-1-lesson-special",
    title: "Cours <spécial>\n  & vérification",
    objective: "Comprendre\n   sans casser le contexte.",
    completed: false
  };
  const legacyItem: ProgramItem = {
    ...item,
    lessons: undefined
  };

  const context = buildLessonContextBlock(
    subject,
    courseModule,
    legacyItem,
    unusualUnit
  );

  assert.match(context, /Cours ciblé : Cours &lt;spécial&gt; &amp; vérification/);
  assert.match(context, /Objectif spécifique du cours : Comprendre sans casser/);
  assert.equal(context.match(/<\/CONTEXTE_COURS_DYNAMIQUE>/g)?.length, 1);
});

test("createActiveLesson conserve l’unité atomique et reste déterministe", () => {
  const activeLesson = createActiveLesson(
    subject,
    courseModule,
    item,
    lessons[2],
    { startedAt: "2026-09-07T08:30:00.000Z" }
  );

  assert.equal(activeLesson.subjectId, subject.id);
  assert.equal(activeLesson.moduleId, courseModule.id);
  assert.equal(activeLesson.itemId, item.id);
  assert.equal(activeLesson.lessonUnitId, lessons[2].id);
  assert.equal(activeLesson.lessonMode, "course");
  assert.equal(activeLesson.title, "La valeur absolue");
  assert.match(activeLesson.id, /analyse-s1-1-lesson-3/);
  assert.match(activeLesson.prompt, /Cours ciblé : La valeur absolue/);
  assert.equal(activeLesson.startedAt, "2026-09-07T08:30:00.000Z");
});

test("createActiveLesson sépare les modes dans le prompt, l’état et l’identifiant", () => {
  const options = { startedAt: "2026-09-07T08:30:00.000Z" } as const;
  const courseLesson = createActiveLesson(
    subject,
    courseModule,
    item,
    lessons[0],
    { ...options, lessonMode: "course" }
  );
  const exerciseLesson = createActiveLesson(
    subject,
    courseModule,
    item,
    lessons[0],
    { ...options, lessonMode: "exercises" }
  );

  assert.equal(courseLesson.lessonMode, "course");
  assert.equal(exerciseLesson.lessonMode, "exercises");
  assert.notEqual(courseLesson.id, exerciseLesson.id);
  assert.match(courseLesson.id, /^lesson-course-/);
  assert.match(exerciseLesson.id, /^lesson-exercises-/);
  assert.match(courseLesson.prompt, /MODE COURS/);
  assert.match(exerciseLesson.prompt, /MODE EXERCICES/);
  assert.equal(
    courseLesson.prompt.slice(courseLesson.prompt.indexOf(LESSON_CONTEXT_START)),
    exerciseLesson.prompt.slice(
      exerciseLesson.prompt.indexOf(LESSON_CONTEXT_START)
    )
  );
});

test("createActiveLesson crée un mini-test de chapitre sans unité atomique", () => {
  const activeTest = createActiveLesson(
    subject,
    courseModule,
    item,
    undefined,
    {
      startedAt: "2026-09-07T08:30:00.000Z",
      lessonMode: "chapter-test"
    }
  );

  assert.equal(activeTest.lessonMode, "chapter-test");
  assert.equal(activeTest.lessonUnitId, undefined);
  assert.equal(activeTest.title, item.title);
  assert.match(activeTest.id, /^lesson-chapter-test-/);
  assert.match(activeTest.id, /analyse-s1-1/);
  assert.match(activeTest.prompt, /MINI-TEST PDF DE FIN DE CHAPITRE/);
  assert.match(activeTest.prompt, /Cours du chapitre à couvrir/);
  assert.match(activeTest.prompt, /mini-test-analyse-s1-1\.pdf/);
  assert.match(activeTest.prompt, /corrige-mini-test-analyse-s1-1\.pdf/);
});

test("un mini-test refuse un chapitre sans cours atomiques", () => {
  assert.throws(
    () =>
      createActiveLesson(subject, courseModule, {
        ...item,
        lessons: undefined
      }, undefined, { lessonMode: "chapter-test" }),
    /exige au moins un cours atomique/
  );
});

test("createActiveLesson rejette un cours appartenant à une autre rubrique", () => {
  assert.throws(
    () =>
      createActiveLesson(subject, courseModule, item, secondItem.lessons?.[0]),
    /n’appartient pas à cette rubrique/
  );
});

test("une séance générale reste possible sans cours atomique", () => {
  const activeLesson = createActiveLesson(subject, undefined, undefined, undefined, {
    id: "general-analyse",
    startedAt: new Date("2026-09-07T07:00:00.000Z")
  });

  assert.equal(activeLesson.id, "general-analyse");
  assert.equal(activeLesson.title, subject.name);
  assert.equal(activeLesson.lessonUnitId, undefined);
  assert.equal(activeLesson.lessonMode, "course");
  assert.match(activeLesson.prompt, /Cours ciblé : Analyse I &amp; II/);
  assert.match(activeLesson.prompt, /Rubrique parente : Aucune/);
});

test("l’ancienne signature avec options en quatrième argument reste compatible", () => {
  const restoredLesson = createActiveLesson(subject, courseModule, item, {
    id: "restored-legacy-lesson",
    startedAt: "2026-10-01T12:00:00.000Z"
  });

  assert.equal(restoredLesson.id, "restored-legacy-lesson");
  assert.equal(restoredLesson.lessonUnitId, undefined);
  assert.equal(restoredLesson.lessonMode, "course");
  assert.equal(restoredLesson.startedAt, "2026-10-01T12:00:00.000Z");
});
