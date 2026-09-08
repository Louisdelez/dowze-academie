import assert from "node:assert/strict";
import { chromium } from "playwright";
import { bootstrapAuthenticatedPage } from "./browser-auth-helpers.mjs";
import { assertDialogConfinedToWorkspace } from "./browser-layout-helpers.mjs";

const baseUrl = process.env.ETUDE_TEST_URL ?? "http://127.0.0.1:1420";
const screenshotPath =
  process.env.ETUDE_GRADES_SCREENSHOT ?? "/tmp/etude-notes-evaluations.png";
const seededTitle = "Mini-test — Langage mathématique";
const seededAppreciation =
  "Très bonne maîtrise des ensembles et des quantificateurs ; veillez à détailler davantage les négations logiques.";
const addedTitle = "Contrôle manuel — Fonctions réelles";
const addedAppreciation =
  "Les méthodes essentielles sont acquises ; consolidez la justification des domaines de définition.";
const seededConversationName = "Mini-test PDF — Langage mathématique";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 950 },
  permissions: ["clipboard-read", "clipboard-write"]
});
const page = await context.newPage();

try {
  const { storage } = await bootstrapAuthenticatedPage(page, baseUrl);
  const assessmentsStorageKey = storage.assessments;
  const conversationsStorageKey = storage.conversations;
  await page.evaluate(({
    assessmentsKey,
    conversationsKey,
    title,
    appreciation,
    conversationName
  }) => {
    localStorage.setItem(assessmentsKey, JSON.stringify([
      {
        id: "assessment-ui-seeded",
        subjectId: "analyse",
        title,
        kind: "mini-test",
        assessmentDate: "2026-09-30",
        score: 16.5,
        maxScore: 20,
        appreciation,
        personalNote: "Revoir une dernière fois les équivalences logiques.",
        blankPdf: {
          originalName: "sujet-mini-test-analyse-s1-1.pdf",
          sizeBytes: 24_000,
          importedAt: "2026-09-30T15:00:00.000Z"
        },
        completedPdf: {
          originalName: "copie-mini-test-analyse-s1-1.pdf",
          sizeBytes: 38_000,
          importedAt: "2026-09-30T15:05:00.000Z"
        },
        createdAt: "2026-09-30T15:10:00.000Z",
        updatedAt: "2026-09-30T15:10:00.000Z"
      }
    ]));
    localStorage.setItem(conversationsKey, JSON.stringify([
      {
        id: "conversation-mini-test-grades-ui",
        subjectId: "analyse",
        moduleId: "analyse-s1",
        itemId: "analyse-s1-1",
        lessonMode: "chapter-test",
        lessonTitle: "Langage mathématique : ensembles, intervalles, valeur absolue, logique, quantificateurs",
        kind: "lesson",
        provider: "chatgpt",
        url: "https://chatgpt.com/c/conversation-mini-test-grades-ui",
        createdAt: "2026-09-29T14:00:00.000Z",
        name: conversationName,
        note: "Sujet et corrigé PDF générés dans cette conversation."
      }
    ]));
  }, {
    assessmentsKey: assessmentsStorageKey,
    conversationsKey: conversationsStorageKey,
    title: seededTitle,
    appreciation: seededAppreciation,
    conversationName: seededConversationName
  });
  await page.reload();

  await page.getByRole("button", { name: "Cours", exact: true }).click();
  await page.getByRole("tab", { name: /Historique IA/ }).click();
  await page.getByText(seededConversationName, { exact: true }).waitFor();
  await page.getByRole("button", { name: "Corriger ma copie", exact: true }).click();
  await page.getByText(/Prof IA · Correction de copie ·/).waitFor();
  await page.getByText("Conversation de correction ouverte", { exact: true }).waitFor();

  const correctionPrompt = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(correctionPrompt, /# PROFESSEUR IA — CORRECTION D’UNE ÉVALUATION SCANNÉE/);
  assert.match(correctionPrompt, /sujet, le corrigé officiel et le barème détaillé/);
  assert.match(correctionPrompt, /Si le scan complet est déjà joint au message/);
  assert.match(correctionPrompt, /Ne devine jamais une lettre, un chiffre, un signe/);
  assert.match(correctionPrompt, /Type d’évaluation : Mini-test de fin de chapitre/);
  assert.match(correctionPrompt, /NOTE À ENREGISTRER : x \/ 20/);
  assert.match(correctionPrompt, /APPRÉCIATION À ENREGISTRER : \.\.\./);

  await page.getByLabel("Notes & évaluations", { exact: true }).click();
  await page.getByRole("heading", { name: "Notes", exact: true }).waitFor();
  await page.getByText("1 évaluation enregistrée.", { exact: true }).waitFor();

  const overview = page.getByLabel("Synthèse des résultats", { exact: true });
  assert.equal(
    (await overview.locator(".grade-summary-card--average strong").innerText())
      .replace(/\s+/g, ""),
    "16,5/20"
  );
  assert.equal(
    (await overview.locator(".grade-summary-card").nth(1).locator("strong").innerText()).trim(),
    "1"
  );

  const seededRecord = page.locator(".grade-record").filter({ hasText: seededTitle });
  await seededRecord.waitFor();
  await seededRecord.getByText(seededAppreciation, { exact: true }).waitFor();
  await seededRecord.getByLabel("Note : 16,5 sur 20", { exact: true }).waitFor();

  const blankButton = seededRecord.getByRole("button", {
    name: `Ouvrir le sujet vierge : ${seededTitle}`
  });
  const completedButton = seededRecord.getByRole("button", {
    name: `Ouvrir la copie remplie : ${seededTitle}`
  });
  assert.equal(await blankButton.isEnabled(), true);
  assert.equal(await completedButton.isEnabled(), true);
  await blankButton.click();
  await completedButton.click();

  await seededRecord.getByRole("button", {
    name: `Modifier la note : ${seededTitle}`
  }).click();
  const editDialog = page.getByRole("dialog", { name: "Modifier l’évaluation" });
  await assertDialogConfinedToWorkspace(page, editDialog, "La fenêtre Modifier l’évaluation");
  await editDialog.getByRole("button", { name: "Fermer « Modifier l’évaluation »" }).click();
  await editDialog.waitFor({ state: "detached" });

  await seededRecord.getByRole("button", {
    name: `Supprimer la note : ${seededTitle}`
  }).click();
  const deleteDialog = page.getByRole("dialog", { name: "Supprimer cette évaluation ?" });
  await assertDialogConfinedToWorkspace(page, deleteDialog, "La confirmation de suppression d’évaluation");
  await deleteDialog.getByRole("button", { name: "Annuler", exact: true }).click();
  await deleteDialog.waitFor({ state: "detached" });

  await page.getByRole("button", { name: "Ajouter une note", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Enregistrer une note" });
  await assertDialogConfinedToWorkspace(page, dialog, "La fenêtre Enregistrer une note");

  const titleInput = dialog.getByLabel("Intitulé", { exact: true });
  const dateInput = dialog.getByLabel("Date de l’épreuve", { exact: true });
  const scoreInput = dialog.getByLabel("Note sur 20", { exact: true });
  const appreciationInput = dialog.getByLabel(
    "Appréciation du professeur IA",
    { exact: true }
  );
  for (const field of [titleInput, dateInput, scoreInput, appreciationInput]) {
    assert.equal(await field.evaluate((element) => element.required), true);
  }

  assert.equal(
    await dialog.getByRole("button", { name: /Sujet vierge/ }).isEnabled(),
    true
  );
  assert.equal(
    await dialog.getByRole("button", { name: /Copie remplie scannée/ }).isEnabled(),
    true
  );

  const formSelects = dialog.locator("select");
  assert.equal(await formSelects.nth(0).inputValue(), "analyse");
  await formSelects.nth(1).selectOption("control");
  await titleInput.fill(addedTitle);
  await dateInput.fill("2026-10-15");
  await scoreInput.fill("12,5");
  await appreciationInput.fill(addedAppreciation);

  // Les deux sélecteurs PDF restent volontairement intacts : les documents
  // sont facultatifs lors d'un ajout manuel.
  await dialog.getByRole("button", { name: "Enregistrer dans les notes" }).click();
  await page.getByText("Note enregistrée", { exact: true }).waitFor();
  await dialog.waitFor({ state: "detached" });

  await page.getByText("2 évaluations enregistrées.", { exact: true }).waitFor();
  assert.equal(
    (await overview.locator(".grade-summary-card--average strong").innerText())
      .replace(/\s+/g, ""),
    "13,83/20"
  );

  const addedRecord = page.locator(".grade-record").filter({ hasText: addedTitle });
  await addedRecord.waitFor();
  await addedRecord.getByText(addedAppreciation, { exact: true }).waitFor();
  await addedRecord.getByLabel("Note : 12,5 sur 20", { exact: true }).waitFor();
  assert.equal(
    await addedRecord.getByRole("button", {
      name: `Ouvrir le sujet vierge : ${addedTitle}`
    }).isDisabled(),
    true
  );
  assert.equal(
    await addedRecord.getByRole("button", {
      name: `Ouvrir la copie remplie : ${addedTitle}`
    }).isDisabled(),
    true
  );

  await page.waitForFunction(({ storageKey, title }) => {
    const records = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return records.length === 2 && records.some((record) => record.title === title);
  }, { storageKey: assessmentsStorageKey, title: addedTitle });
  const storedAssessments = await page.evaluate((storageKey) =>
    JSON.parse(localStorage.getItem(storageKey) ?? "[]"),
  assessmentsStorageKey);
  const storedAdded = storedAssessments.find((assessment) => assessment.title === addedTitle);
  assert.ok(storedAdded);
  assert.equal(storedAdded.score, 12.5);
  assert.equal(storedAdded.maxScore, 20);
  assert.equal(storedAdded.coefficient, 2);
  assert.equal(storedAdded.appreciation, addedAppreciation);
  assert.equal(storedAdded.blankPdf, undefined);
  assert.equal(storedAdded.completedPdf, undefined);

  await page.screenshot({ path: screenshotPath, fullPage: true });
  process.stdout.write(
    `Parcours Notes & évaluations validé. Capture : ${screenshotPath}\n`
  );
} finally {
  await browser.close();
}
