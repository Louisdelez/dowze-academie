import assert from "node:assert/strict";
import { chromium } from "playwright";
import { bootstrapAuthenticatedPage } from "./browser-auth-helpers.mjs";
import { assertDialogConfinedToWorkspace } from "./browser-layout-helpers.mjs";

const baseUrl = process.env.ETUDE_TEST_URL ?? "http://127.0.0.1:1420";
const screenshotPath = process.env.ETUDE_SCREENSHOT ?? "/tmp/etude-cours-atomiques.png";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 950 },
  permissions: ["clipboard-read", "clipboard-write"]
});
const page = await context.newPage();

async function selectPanelProvider(current, next) {
  await page.getByRole("button", {
    name: `Service actuel : ${current}. Changer de service`
  }).click();
  const menu = page.getByRole("listbox", { name: "Choisir un service d’étude" });
  await menu.getByRole("option", { name: next, exact: true }).click();
  await page.getByRole("button", {
    name: `Service actuel : ${next}. Changer de service`
  }).waitFor();
}

try {
  const { storage } = await bootstrapAuthenticatedPage(page, baseUrl);

  const curriculum = await page.evaluate(async () => {
    const { defaultSubjects, hydratePersistedSubjects } = await import("/src/data/seed.ts");
    const subjectTotals = defaultSubjects.map((subject) => ({
      id: subject.id,
      chapters: subject.modules.flatMap((courseModule) => courseModule.items).length,
      lessons: subject.modules
        .flatMap((courseModule) => courseModule.items)
        .flatMap((item) => item.lessons ?? []).length,
      minimum: Math.min(
        ...subject.modules
          .flatMap((courseModule) => courseModule.items)
          .map((item) => item.lessons?.length ?? 0)
      )
    }));

    const legacy = structuredClone(defaultSubjects);
    const legacyFirstItem = legacy[0].modules[0].items[0];
    legacyFirstItem.completed = true;
    delete legacyFirstItem.lessons;
    const migrated = hydratePersistedSubjects(legacy);
    return {
      subjectTotals,
      migratedFirstLessons: migrated[0].modules[0].items[0].lessons
    };
  });
  const engineeringCurriculum = curriculum.subjectTotals.filter((subject) => subject.id !== "anglais");
  const englishCatalog = curriculum.subjectTotals.find((subject) => subject.id === "anglais");
  assert.equal(engineeringCurriculum.reduce((sum, subject) => sum + subject.chapters, 0), 182);
  assert.equal(engineeringCurriculum.reduce((sum, subject) => sum + subject.lessons, 0), 988);
  assert.ok(engineeringCurriculum.every((subject) => subject.minimum >= 5));
  assert.deepEqual(
    { chapters: englishCatalog.chapters, lessons: englishCatalog.lessons, minimum: englishCatalog.minimum },
    { chapters: 72, lessons: 360, minimum: 5 }
  );
  assert.equal(curriculum.migratedFirstLessons.length, 6);
  assert.ok(curriculum.migratedFirstLessons.every((lesson) => lesson.completed));

  await page.getByRole("button", { name: "Cours", exact: true }).click();
  await page.getByText("18 chapitres · 97 cours", { exact: true }).waitFor();

  await page.locator(".courses-sidebar").getByLabel("Ajouter une matière", { exact: true }).click();
  const subjectDialog = page.getByRole("dialog", { name: "Ajouter une matière" });
  await assertDialogConfinedToWorkspace(page, subjectDialog, "La fenêtre Ajouter une matière");
  await subjectDialog.getByRole("button", { name: "Fermer « Ajouter une matière »" }).click();
  await subjectDialog.waitFor({ state: "detached" });

  const expectedLessons = [
    "Ensembles, appartenance et opérations",
    "Intervalles de la droite réelle",
    "Valeur absolue, distance et inéquations",
    "Logique propositionnelle et tables de vérité",
    "Quantificateurs et négation d’énoncés",
    "Implication, équivalence et méthodes de preuve"
  ];
  for (const title of expectedLessons) {
    await page.getByText(title, { exact: true }).waitFor();
  }

  await page.getByRole("button", {
    name: `Commencer le cours : ${expectedLessons[0]}`
  }).click();
  await page.getByText(`Prof IA · Cours · ${expectedLessons[0]}`, { exact: true }).waitFor();
  const coursePrompt = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(coursePrompt, /# PROFESSEUR IA — MODE COURS/);
  assert.match(coursePrompt, /Cours ciblé : Ensembles, appartenance et opérations/);
  assert.match(coursePrompt, /Rubrique parente : Langage mathématique/);
  assert.match(coursePrompt, /Cours suivant : Intervalles de la droite réelle/);
  assert.match(coursePrompt, /exemple entièrement guidé/);
  assert.match(coursePrompt, /Les exercices auront leur propre conversation/);

  await page.getByRole("button", {
    name: `Faire les exercices : ${expectedLessons[0]}`
  }).click();
  await page.getByText(`Prof IA · Exercices · ${expectedLessons[0]}`, { exact: true }).waitFor();
  const exercisePrompt = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(exercisePrompt, /# PROFESSEUR IA — MODE EXERCICES/);
  assert.match(exercisePrompt, /Cette conversation est réservée à la pratique/);
  assert.match(exercisePrompt, /ne répète pas le cours complet/);
  assert.match(exercisePrompt, /Cours ciblé : Ensembles, appartenance et opérations/);
  const contextMarker = "<CONTEXTE_COURS_DYNAMIQUE>";
  assert.notEqual(coursePrompt.split(contextMarker)[0], exercisePrompt.split(contextMarker)[0]);
  assert.equal(coursePrompt.split(contextMarker)[1], exercisePrompt.split(contextMarker)[1]);

  const chapterTitle = "Langage mathématique : ensembles, intervalles, valeur absolue, logique, quantificateurs";
  const correctionButton = page.getByRole("button", {
    name: `Corriger ma copie : ${chapterTitle}`
  });
  await correctionButton.waitFor();
  assert.equal(await correctionButton.isDisabled(), true);
  await page.getByRole("button", {
    name: `Générer le mini-test PDF : ${chapterTitle}`
  }).click();
  await page.getByText(`Prof IA · Mini-test PDF · ${chapterTitle}`, { exact: true }).waitFor();
  const chapterTestPrompt = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(chapterTestPrompt, /# PROFESSEUR IA — MINI-TEST PDF DE FIN DE CHAPITRE/);
  assert.match(chapterTestPrompt, /Nombre de cours du chapitre : 6/);
  for (const title of expectedLessons) {
    assert.match(chapterTestPrompt, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(chapterTestPrompt, /deux fichiers binaires PDF distincts et téléchargeables/);
  assert.match(chapterTestPrompt, /totalise exactement 20 points/);
  assert.match(chapterTestPrompt, /Le sujet élève ne contient aucune réponse/);

  await page.screenshot({ path: screenshotPath, fullPage: true });

  await page.evaluate(({ storageKey, lessonTitle, chapterTitle }) => {
    const shared = {
      subjectId: "analyse",
      moduleId: "analyse-s1",
      itemId: "analyse-s1-1",
      lessonUnitId: "analyse-s1-1-lesson-1",
      lessonTitle,
      kind: "lesson",
      provider: "chatgpt"
    };
    localStorage.setItem(storageKey, JSON.stringify([
      {
        ...shared,
        id: "conversation-course-older-ui-test",
        // Compatibilité : une ancienne session sans lessonMode reste un cours.
        url: "https://chatgpt.com/c/conversation-course-older-ui-test",
        createdAt: "2026-09-07T08:30:00.000Z",
        name: `Cours ancien — ${lessonTitle}`,
        note: "Définitions et exemples guidés."
      },
      {
        ...shared,
        id: "conversation-course-latest-ui-test",
        lessonMode: "course",
        provider: "claude",
        url: "https://claude.ai/chat/conversation-course-latest-ui-test",
        createdAt: "2026-09-08T10:00:00.000Z",
        name: `Cours récent — ${lessonTitle}`,
        note: "La conversation de cours la plus récente."
      },
      {
        ...shared,
        id: "conversation-exercises-ui-test",
        lessonMode: "exercises",
        url: "https://chatgpt.com/c/conversation-exercises-ui-test",
        createdAt: "2026-09-07T09:30:00.000Z",
        name: `Exercices — ${lessonTitle}`,
        note: "Revoir la différence entre appartenance et inclusion."
      },
      {
        ...shared,
        id: "conversation-chapter-test-ui-test",
        lessonUnitId: undefined,
        lessonTitle: chapterTitle,
        lessonMode: "chapter-test",
        url: "https://chatgpt.com/c/conversation-chapter-test-ui-test",
        createdAt: "2026-09-09T14:00:00.000Z",
        name: `Mini-test — ${chapterTitle}`,
        note: "Mini-test de fin de chapitre en cours."
      }
    ]));
  }, { storageKey: storage.conversations, lessonTitle: expectedLessons[0], chapterTitle });
  await page.reload();
  await page.getByRole("button", { name: "Cours", exact: true }).click();
  await page.getByRole("button", {
    name: `Reprendre le cours : ${expectedLessons[0]}`
  }).waitFor();
  await page.getByRole("button", {
    name: `Reprendre les exercices : ${expectedLessons[0]}`
  }).waitFor();
  await page.getByRole("button", {
    name: `Rouvrir la génération PDF : ${chapterTitle}`
  }).waitFor();
  const availableCorrectionButton = page.getByRole("button", {
    name: `Corriger ma copie : ${chapterTitle}`
  });
  assert.equal(await availableCorrectionButton.isEnabled(), true);

  await page.evaluate(() => navigator.clipboard.writeText("NE_PAS_REMPLACER_EN_REPRISE"));
  await page.getByRole("button", { name: `Reprendre le cours : ${expectedLessons[0]}` }).click();
  await page.getByText(`Prof IA · Cours · ${expectedLessons[0]}`, { exact: true }).waitFor();
  await page.getByText("Cours repris", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "NE_PAS_REMPLACER_EN_REPRISE");
  await page.getByRole("button", {
    name: "Service actuel : ChatGPT. Changer de service"
  }).waitFor();

  // L'historique est séparé par service : passer à Claude restaure la session
  // Claude du même cours, puis revenir à ChatGPT restaure celle de ChatGPT.
  await selectPanelProvider("ChatGPT", "Claude");
  await page.getByText("Claude rouvert", { exact: true }).waitFor();
  await page.getByRole("button", {
    name: "Service actuel : Claude. Changer de service"
  }).waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "NE_PAS_REMPLACER_EN_REPRISE");

  await selectPanelProvider("Claude", "ChatGPT");
  await page.getByText("ChatGPT rouvert", { exact: true }).waitFor();

  await page.getByRole("button", { name: `Reprendre les exercices : ${expectedLessons[0]}` }).click();
  await page.getByText(`Prof IA · Exercices · ${expectedLessons[0]}`, { exact: true }).waitFor();
  await page.getByText("Exercices repris", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "NE_PAS_REMPLACER_EN_REPRISE");

  await page.getByRole("button", { name: `Rouvrir la génération PDF : ${chapterTitle}` }).click();
  await page.getByText(`Prof IA · Mini-test PDF · ${chapterTitle}`, { exact: true }).waitFor();
  await page.getByText("Génération PDF rouverte", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "NE_PAS_REMPLACER_EN_REPRISE");

  await availableCorrectionButton.click();
  await page.getByText(`Prof IA · Correction de copie · Correction — ${chapterTitle}`, { exact: true }).waitFor();
  const correctionPrompt = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(correctionPrompt, /# PROFESSEUR IA — CORRECTION D’UNE ÉVALUATION SCANNÉE/);
  assert.match(correctionPrompt, /NOTE À ENREGISTRER : x \/ 20/);

  await page.getByRole("tab", { name: /Historique IA/ }).click();
  await page.getByText(`Cours récent — ${expectedLessons[0]}`, { exact: true }).waitFor();
  await page.getByText(`Cours ancien — ${expectedLessons[0]}`, { exact: true }).waitFor();
  await page.getByText(`Exercices — ${expectedLessons[0]}`, { exact: true }).waitFor();
  await page.getByText(`Mini-test — ${chapterTitle}`, { exact: true }).waitFor();
  assert.equal(await page.getByText("Cours IA", { exact: true }).count(), 2);
  assert.equal(await page.getByText("Exercices IA", { exact: true }).count(), 1);
  assert.equal(await page.getByText("Mini-test PDF", { exact: true }).count(), 1);
  await page.getByText("Revoir la différence entre appartenance et inclusion.", { exact: true }).waitFor();

  process.stdout.write(`Parcours UI validé. Capture : ${screenshotPath}\n`);
} finally {
  await browser.close();
}
