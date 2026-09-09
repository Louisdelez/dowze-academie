import assert from "node:assert/strict";
import { chromium } from "playwright";
import { bootstrapAuthenticatedPage } from "./browser-auth-helpers.mjs";

const baseUrl = process.env.ETUDE_TEST_URL ?? "http://127.0.0.1:1420";
const screenshotPath = process.env.ETUDE_PROVIDER_SCREENSHOT ?? "/tmp/etude-services-history.png";
const menuScreenshotPath = process.env.ETUDE_PROVIDER_MENU_SCREENSHOT ?? "/tmp/etude-services-menu.png";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1480, height: 980 },
  permissions: ["clipboard-read", "clipboard-write"]
});
const page = await context.newPage();

async function selectProvider(current, next) {
  const trigger = page.getByRole("button", {
    name: `Service actuel : ${current}. Changer de service`
  });
  await trigger.click();
  const menu = page.getByRole("listbox", { name: "Choisir un service d’étude" });
  await menu.waitFor();
  await menu.getByRole("option", { name: next, exact: true }).click();
  await page.getByRole("button", {
    name: `Service actuel : ${next}. Changer de service`
  }).waitFor();
  await menu.waitFor({ state: "detached" });
}

async function associate(url) {
  await page.getByRole("button", { name: "Associer la conversation" }).click();
  await page.getByRole("heading", { name: "Associer une conversation" }).waitFor();
  await page.getByLabel("Lien à conserver").fill(url);
  await page.getByRole("button", { name: "Associer", exact: true }).click();
  await page.getByRole("heading", { name: "Associer une conversation" }).waitFor({ state: "detached" });
}

try {
  const { storage } = await bootstrapAuthenticatedPage(page, baseUrl);
  const conversationsStorageKey = storage.conversations;
  await page.getByRole("button", { name: "Cours", exact: true }).click();

  const lessonOne = "Ensembles, appartenance et opérations";
  const lessonTwo = "Intervalles de la droite réelle";

  await page.setViewportSize({ width: 1120, height: 760 });
  const providerTrigger = page.getByRole("button", {
    name: "Service actuel : ChatGPT. Changer de service"
  });
  await providerTrigger.click();
  const providerMenu = page.getByRole("listbox", { name: "Choisir un service d’étude" });
  const providerOptions = providerMenu.getByRole("option");
  const providerLabels = await providerOptions.evaluateAll((options) =>
    options.map((option) => option.getAttribute("aria-label"))
  );
  for (const expected of [
    "ChatGPT", "Claude", "Gemini", "Mistral", "DeepSeek", "Kimi", "Chat libre",
    "Duolingo", "Khan Academy", "YouTube", "TikTok", "NotebookLM"
  ]) {
    assert.ok(providerLabels.includes(expected), `${expected} absent du menu`);
  }
  assert.equal(providerLabels.length, 12);
  const triggerBox = await providerTrigger.boundingBox();
  const menuBox = await providerMenu.boundingBox();
  const notebookOptionBox = await providerMenu.getByRole("option", { name: "NotebookLM", exact: true }).boundingBox();
  assert.ok(triggerBox && menuBox);
  assert.ok(notebookOptionBox);
  assert.ok(menuBox.y >= triggerBox.y + triggerBox.height - 1, `${menuBox.y} < ${triggerBox.y + triggerBox.height}`);
  assert.ok(
    notebookOptionBox.y + notebookOptionBox.height <= 760,
    "Les douze services, dont Khan Academy et NotebookLM, doivent rester visibles sans déborder à la hauteur minimale."
  );
  await page.screenshot({ path: menuScreenshotPath, fullPage: true });
  await page.keyboard.press("Escape");
  await providerMenu.waitFor({ state: "detached" });
  assert.equal(await providerTrigger.getAttribute("aria-expanded"), "false");
  assert.equal(await providerTrigger.evaluate((element) => element === document.activeElement), true);
  await page.setViewportSize({ width: 1480, height: 980 });

  await selectProvider("ChatGPT", "YouTube");

  const generalYoutubeQuery = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(generalYoutubeQuery, "Analyse cours mathematiques L1");
  assert.doesNotMatch(generalYoutubeQuery, /PROFESSEUR IA/);
  assert.match(generalYoutubeQuery, /^[A-Za-z0-9 ]+$/);

  await page.getByRole("button", { name: `Commencer le cours : ${lessonOne}` }).click();
  await page.getByText(`Recherche vidéo · Cours · ${lessonOne}`, { exact: true }).waitFor();
  const lessonKeywords = "Ensembles appartenance et operations";
  await page.waitForFunction(async (keywords) => (
    await navigator.clipboard.readText()
  ).startsWith(keywords), lessonKeywords);
  const youtubeQuery = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(youtubeQuery.startsWith(lessonKeywords), youtubeQuery);
  assert.equal(youtubeQuery, `${lessonKeywords} cours mathematiques L1`);
  assert.doesNotMatch(youtubeQuery, /Fondations, fonctions et calcul différentiel/);
  assert.doesNotMatch(youtubeQuery, /\bmodule\b|\bchapitre\b|\|/);

  // Une vidéo choisie après la recherche reste rattachée au même cours, pas
  // seulement à la matière générale.
  await associate("https://www.youtube.com/watch?v=video-history-ui-test&t=90s");

  const youtubeEntries = await page.evaluate((storageKey) => {
    const entries = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return entries.filter((entry) => entry.provider === "youtube");
  }, conversationsStorageKey);
  assert.equal(youtubeEntries.length, 3);
  assert.ok(youtubeEntries.some((entry) => entry.kind === "general"));
  assert.ok(youtubeEntries.some((entry) => (
    entry.lessonUnitId === "analyse-s1-1-lesson-1" &&
    entry.url.startsWith("https://www.youtube.com/results?search_query=") &&
    entry.url.includes("sp=EgIQAQ%3D%3D")
  )));
  assert.ok(youtubeEntries.some((entry) => (
    entry.lessonUnitId === "analyse-s1-1-lesson-1" &&
    entry.url === "https://www.youtube.com/watch?v=video-history-ui-test"
  )));

  await selectProvider("YouTube", "TikTok");
  const tiktokQuery = "Ensembles appartenance et operations cours explique maths";
  await page.waitForFunction(async (expected) => (
    await navigator.clipboard.readText()
  ) === expected, tiktokQuery);
  assert.match(tiktokQuery, /^[A-Za-z0-9 ]+$/);
  await associate("https://www.tiktok.com/@science/video/1234567890123456789?_r=1&_t=tracking");

  const tiktokEntries = await page.evaluate((storageKey) => {
    const entries = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return entries.filter((entry) => entry.provider === "tiktok");
  }, conversationsStorageKey);
  assert.equal(tiktokEntries.length, 2);
  assert.ok(tiktokEntries.some((entry) => (
    entry.lessonUnitId === "analyse-s1-1-lesson-1" &&
    entry.url === `https://www.tiktok.com/search?q=${encodeURIComponent(tiktokQuery).replaceAll("%20", "+")}`
  )));
  assert.ok(tiktokEntries.some((entry) => (
    entry.lessonUnitId === "analyse-s1-1-lesson-1" &&
    entry.url === "https://www.tiktok.com/@science/video/1234567890123456789"
  )));

  await page.evaluate(() => navigator.clipboard.writeText("NE_PAS_REMPLACER_DUOLINGO"));
  await selectProvider("TikTok", "Duolingo");
  await page.getByText("Pratique linguistique · Langues", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Accueil Duolingo" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Associer la conversation" }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Consigne" }).count(), 0);
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "NE_PAS_REMPLACER_DUOLINGO");
  assert.equal(await page.evaluate((storageKey) => localStorage.getItem(storageKey), storage.provider), '"duolingo"');
  assert.equal(await page.evaluate((storageKey) => {
    const entries = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return entries.filter((entry) => entry.provider === "duolingo").length;
  }, conversationsStorageKey), 0);

  await selectProvider("Duolingo", "Khan Academy");
  await page.getByText("Cours et exercices · Khan Academy", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Accueil Khan Academy" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Associer la conversation" }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Consigne" }).count(), 0);
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "NE_PAS_REMPLACER_DUOLINGO");
  assert.equal(await page.evaluate((storageKey) => localStorage.getItem(storageKey), storage.provider), '"khanacademy"');
  assert.equal(await page.evaluate((storageKey) => {
    const entries = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return entries.filter((entry) => entry.provider === "khanacademy").length;
  }, conversationsStorageKey), 0);

  await selectProvider("Khan Academy", "NotebookLM");
  await page.getByText(`Contexte NotebookLM · Cours · ${lessonOne}`, { exact: true }).waitFor();
  const notebookContext = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(notebookContext, /# CADRE DE TRAVAIL — NOTEBOOKLM/);
  assert.match(notebookContext, /Fonde toute affirmation de fond exclusivement sur les sources/);
  assert.match(notebookContext, /\[LACUNE\]/);
  assert.match(notebookContext, /Cours ciblé : Ensembles, appartenance et opérations/);

  const sharedNotebookUrl = "https://notebook.google.com/notebook/notebook-history-ui-test";
  await associate(sharedNotebookUrl);

  await page.getByRole("button", { name: `Commencer le cours : ${lessonTwo}` }).click();
  await page.getByText(`Contexte NotebookLM · Cours · ${lessonTwo}`, { exact: true }).waitFor();
  await associate(sharedNotebookUrl);

  const notebookEntries = await page.evaluate((storageKey) => {
    const entries = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return entries.filter((entry) => entry.provider === "notebooklm");
  }, conversationsStorageKey);
  assert.equal(notebookEntries.length, 2);
  assert.deepEqual(
    notebookEntries.map((entry) => entry.lessonUnitId).sort(),
    ["analyse-s1-1-lesson-1", "analyse-s1-1-lesson-2"]
  );
  assert.ok(notebookEntries.every((entry) => entry.url === sharedNotebookUrl));

  await page.evaluate(() => navigator.clipboard.writeText("NE_PAS_REMPLACER_NOTEBOOK"));
  await page.getByRole("button", { name: `Reprendre le cours : ${lessonOne}` }).click();
  await page.getByText(`Contexte NotebookLM · Cours · ${lessonOne}`, { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "NE_PAS_REMPLACER_NOTEBOOK");

  await selectProvider("NotebookLM", "Gemini");
  const geminiPrompt = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(geminiPrompt, /# PROFESSEUR IA — MODE COURS/);
  await associate("https://gemini.google.com/app/gemini-history-ui-test");

  await selectProvider("Gemini", "Mistral");
  const mistralPrompt = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(mistralPrompt, /# PROFESSEUR IA — MODE COURS/);
  await associate("https://chat.mistral.ai/chat/mistral-history-ui-test");

  await selectProvider("Mistral", "DeepSeek");
  const deepSeekPrompt = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(deepSeekPrompt, /# PROFESSEUR IA — MODE COURS/);
  await associate("https://chat.deepseek.com/a/chat/s/deepseek-history-ui-test");

  await selectProvider("DeepSeek", "Kimi");
  const kimiPrompt = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(kimiPrompt, /# PROFESSEUR IA — MODE COURS/);
  await associate("https://kimi.com/chat/kimi-history-ui-test?from=course#answer");

  await page.evaluate(() => navigator.clipboard.writeText("NE_PAS_REMPLACER_DEEPSEEK"));
  await selectProvider("Kimi", "DeepSeek");
  await page.getByText("DeepSeek rouvert", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "NE_PAS_REMPLACER_DEEPSEEK");

  await page.evaluate(() => navigator.clipboard.writeText("NE_PAS_REMPLACER_GEMINI"));
  await selectProvider("DeepSeek", "Gemini");
  await page.getByText("Gemini rouvert", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "NE_PAS_REMPLACER_GEMINI");

  await selectProvider("Gemini", "YouTube");
  await page.getByText("YouTube rouvert", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "NE_PAS_REMPLACER_GEMINI");

  await selectProvider("YouTube", "TikTok");
  await page.getByText("TikTok rouvert", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "NE_PAS_REMPLACER_GEMINI");

  await page.getByRole("tab", { name: /Historique IA/ }).click();
  const history = page.locator(".conversation-list");
  assert.equal(await history.getByText(`Recherche YouTube — ${lessonOne}`, { exact: true }).count(), 2);
  assert.equal(await history.getByText(`Recherche TikTok — ${lessonOne}`, { exact: true }).count(), 2);
  await history.getByText(`NotebookLM — ${lessonOne}`, { exact: true }).waitFor();
  await history.getByText(`NotebookLM — ${lessonTwo}`, { exact: true }).waitFor();

  const historySearch = page.getByPlaceholder("Rechercher dans les noms et notes");
  await historySearch.fill("Mistral");
  assert.equal(await page.locator(".conversation-card").count(), 1);
  await historySearch.fill("NotebookLM");
  assert.equal(await page.locator(".conversation-card").count(), 2);

  await historySearch.fill("");
  await page.waitForTimeout(4500);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  // Les évaluations papier restent confiées à un assistant capable de produire
  // les PDF, même si un service vidéo est actuellement sélectionné.
  await page.getByRole("tab", { name: /Programme annuel/ }).click();
  const chapterTitle = "Langage mathématique : ensembles, intervalles, valeur absolue, logique, quantificateurs";
  await page.getByRole("button", { name: `Générer le mini-test PDF : ${chapterTitle}` }).click();
  await page.getByRole("button", {
    name: "Service actuel : ChatGPT. Changer de service"
  }).waitFor();
  assert.match(
    await page.evaluate(() => navigator.clipboard.readText()),
    /# PROFESSEUR IA — MINI-TEST PDF DE FIN DE CHAPITRE/
  );
  process.stdout.write(`Services et historiques validés. Captures : ${menuScreenshotPath} · ${screenshotPath}\n`);
} finally {
  await browser.close();
}
