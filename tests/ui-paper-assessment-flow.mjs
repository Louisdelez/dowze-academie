import assert from "node:assert/strict";
import { chromium } from "playwright";
import { bootstrapAuthenticatedPage } from "./browser-auth-helpers.mjs";
import { assertDialogConfinedToWorkspace } from "./browser-layout-helpers.mjs";

const baseUrl = process.env.ETUDE_TEST_URL ?? "http://127.0.0.1:1420";
const screenshotPath = process.env.ETUDE_ASSESSMENT_SCREENSHOT ?? "/tmp/etude-evaluation-pdf.png";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 950 },
  permissions: ["clipboard-read", "clipboard-write"]
});
const page = await context.newPage();

try {
  const profile = await bootstrapAuthenticatedPage(page, baseUrl);

  const maximumPromptBytes = await page.evaluate(async () => {
    const [{ defaultSubjects }, { buildPaperAssessmentPrompt }, { CEFR_LEVELS, createEnglishSubject }] = await Promise.all([
      import("/src/data/seed.ts"),
      import("/src/lib/assessment.ts"),
      import("/src/data/englishCurriculum.ts")
    ]);
    const activeCurricula = [
      ...defaultSubjects.filter((subject) => subject.id !== "anglais"),
      ...CEFR_LEVELS.map((level) => createEnglishSubject(level))
    ];
    return Math.max(...activeCurricula.map((subject) => {
      const prompt = buildPaperAssessmentPrompt(subject, {
        eventId: "taille-maximale",
        kind: "final-exam",
        title: `Examen final — ${subject.name}`,
        scheduledAt: "2027-06-21T08:00:00.000Z",
        durationMinutes: 180,
        chapterIds: subject.modules.flatMap((courseModule) => courseModule.items.map((item) => item.id)),
        allowedMaterials: "Calculatrice scientifique non programmable"
      });
      return new TextEncoder().encode(prompt).length;
    }));
  });
  assert.ok(maximumPromptBytes < 65_536, `Prompt trop volumineux : ${maximumPromptBytes} octets`);

  await page.getByLabel("Planning", { exact: true }).click();
  await page.getByRole("button", { name: "Mois", exact: true }).click();
  await page.getByRole("button", { name: "Période suivante" }).click();
  const assessmentEvent = page.getByRole("button", {
    name: /Contrôle 1 — Analyse \+ Algèbre linéaire/
  });
  await assessmentEvent.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Modifier", exact: true }).click();

  const eventDialog = page.getByRole("dialog", { name: "Modifier l’événement" });
  await assertDialogConfinedToWorkspace(page, eventDialog, "La fenêtre d’évaluation planifiée");
  await page.getByText("Épreuve écrite sur papier", { exact: true }).waitFor();
  await page.getByRole("checkbox", { name: "Toute la journée", exact: true }).uncheck();
  await page.getByLabel("Début", { exact: true }).fill("2026-10-02T09:00");
  await page.getByLabel("Fin", { exact: true }).fill("2026-10-02T10:00");
  await page.getByRole("button", { name: /Préparer les PDF/ }).click();
  const paperDialog = page.getByRole("dialog", { name: "Générer l’épreuve papier" });
  await assertDialogConfinedToWorkspace(page, paperDialog, "La fenêtre de génération d’épreuve papier");
  await page.getByText("Deux documents réellement imprimables", { exact: true }).waitFor();

  const subjectSelect = page.getByLabel("Matière");
  assert.equal(await subjectSelect.inputValue(), "analyse");
  assert.equal(await page.getByLabel("Nature de l’épreuve").inputValue(), "control");
  assert.equal(await page.getByLabel(/Durée réelle/).inputValue(), "60");
  await page.getByText(/^8 chapitres · \d+ cours$/).waitFor();
  await page.getByLabel(/Durée réelle/).fill("75");
  await page.getByLabel("Matériel autorisé", { exact: true }).fill("Calculatrice et règle");
  await page.getByLabel(/Consignes particulières/).fill("Présenter chaque raisonnement.");

  await page.screenshot({ path: screenshotPath, fullPage: true });
  await page.getByRole("button", { name: "Générer les deux PDF" }).click();
  await page.getByText("Prof IA · Évaluation PDF · Contrôle écrit — Analyse", { exact: true }).waitFor();

  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(prompt, /# PROFESSEUR IA — GÉNÉRATION D’UNE ÉVALUATION ÉCRITE EN PDF/);
  assert.match(prompt, /deux véritables fichiers PDF binaires distincts et téléchargeables/);
  assert.match(prompt, /Nature de l’épreuve : Contrôle écrit/);
  assert.match(prompt, /Matière : Analyse I &amp; II/);
  assert.match(prompt, /Durée : 75 minutes/);
  assert.match(prompt, /Matériel autorisé : Calculatrice et règle/);
  assert.match(prompt, /Consignes particulières : Présenter chaque raisonnement\./);
  assert.match(prompt, /Nombre de chapitres à couvrir : 8/);
  assert.match(prompt, /Langage mathématique : ensembles, intervalles/);
  assert.match(prompt, /Ensembles, appartenance et opérations/);
  assert.match(prompt, /Fichier PDF du sujet : sujet-controle-ecrit-analyse-2026-10-02\.pdf/);
  assert.match(prompt, /Fichier PDF du corrigé : corrige-controle-ecrit-analyse-2026-10-02\.pdf/);
  assert.match(prompt, /Le sujet ne contient aucune réponse/);
  assert.match(prompt, /totalise exactement le maximum indiqué dans le contexte/);
  assert.match(prompt, /Barème total obligatoire : 20 points/);
  assert.match(prompt, /Ne me pose aucune question, ne lance aucune passation interactive/);

  const persistedEvent = await page.evaluate(({ key, id }) => {
    const events = JSON.parse(localStorage.getItem(key) ?? "[]");
    return events.find((event) => event.id === id) ?? null;
  }, { key: profile.storage.events, id: "academic-2026-10-02-controle-maths" });
  assert.ok(persistedEvent?.assessment, "La préparation PDF doit être conservée dans le planning.");
  assert.equal(persistedEvent.assessment.durationMinutes, 75);
  assert.equal(persistedEvent.assessment.allowedMaterials, "Calculatrice et règle");
  assert.equal(persistedEvent.assessment.instructions, "Présenter chaque raisonnement.");
  assert.equal(
    Date.parse(persistedEvent.end) - Date.parse(persistedEvent.start),
    75 * 60_000,
    "La durée du rendez-vous et celle de l’épreuve doivent rester synchronisées."
  );

  await page.reload();
  await page.getByLabel("Planning", { exact: true }).click();
  await page.getByRole("button", { name: "Mois", exact: true }).click();
  await page.getByRole("button", { name: "Période suivante" }).click();
  await assessmentEvent.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Modifier", exact: true }).click();
  await page.getByRole("button", { name: /Préparer les PDF/ }).click();
  const reopenedPaperDialog = page.getByRole("dialog", { name: "Générer l’épreuve papier" });
  assert.equal(await reopenedPaperDialog.getByLabel(/Durée réelle/).inputValue(), "75");
  assert.equal(
    await reopenedPaperDialog.getByLabel("Matériel autorisé", { exact: true }).inputValue(),
    "Calculatrice et règle"
  );
  assert.equal(
    await reopenedPaperDialog.getByLabel(/Consignes particulières/).inputValue(),
    "Présenter chaque raisonnement."
  );
  await reopenedPaperDialog.getByRole("button", { name: "Annuler", exact: true }).click();

  process.stdout.write(`Parcours évaluation PDF validé. Capture : ${screenshotPath}\n`);
} finally {
  await browser.close();
}
