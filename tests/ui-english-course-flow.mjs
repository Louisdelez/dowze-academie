import assert from "node:assert/strict";
import { chromium } from "playwright";
import { bootstrapAuthenticatedPage } from "./browser-auth-helpers.mjs";
import { assertDialogConfinedToWorkspace } from "./browser-layout-helpers.mjs";

const baseUrl = process.env.ETUDE_TEST_URL ?? "http://127.0.0.1:1420";
const wideScreenshot = "/tmp/etude-anglais-niveaux-1440.png";
const compactScreenshot = "/tmp/etude-anglais-niveaux-1120.png";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 950 },
  timezoneId: "Europe/Zurich",
  permissions: ["clipboard-read", "clipboard-write"]
});
const page = await context.newPage();

async function selectPanelProvider(current, next) {
  await page.getByRole("button", {
    name: `Service actuel : ${current}. Changer de service`
  }).click();
  await page.getByRole("listbox", { name: "Choisir un service d’étude" })
    .getByRole("option", { name: next, exact: true })
    .click();
  await page.getByRole("button", {
    name: `Service actuel : ${next}. Changer de service`
  }).waitFor();
}

async function changeEnglishLevel(level) {
  await page.getByRole("button", { name: "Niveau mal adapté ? Changer" }).click();
  const dialog = page.getByRole("dialog", { name: "Changer de niveau d’anglais" });
  await assertDialogConfinedToWorkspace(page, dialog, "La fenêtre de changement de niveau d’anglais");
  await dialog.getByRole("radio", { name: new RegExp(`^${level}\\b`) }).click();
  await dialog.getByRole("button", { name: "Confirmer le nouveau niveau" }).click();
  await dialog.waitFor({ state: "detached" });
}

try {
  await page.clock.install({ time: new Date("2026-09-07T07:00:00.000Z") });
  const profile = await bootstrapAuthenticatedPage(page, baseUrl, {
    displayName: "Parcours Anglais",
    username: "parcours.anglais",
    password: "Parcours-Anglais-2026!"
  });
  await page.evaluate(() => navigator.clipboard.writeText("AUCUNE_SESSION_AUTOMATIQUE"));

  await page.getByLabel("Planning", { exact: true }).click();
  const englishEvent = page.locator(".time-event").filter({ hasText: "Anglais" }).first();
  await englishEvent.waitFor();
  await englishEvent.click();

  await page.getByRole("heading", { name: "Anglais", exact: true }).waitFor();
  await page.getByRole("heading", {
    name: "Quel niveau d’anglais veux-tu travailler ?"
  }).waitFor();
  assert.deepEqual(
    await page.locator(".english-level-code").allTextContents(),
    ["A1", "A2", "B1", "B2", "C1", "C2"]
  );
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "AUCUNE_SESSION_AUTOMATIQUE");
  assert.equal(await page.getByRole("button", { name: "Cours général IA" }).count(), 0);
  await page.screenshot({ path: wideScreenshot, fullPage: true });
  await page.setViewportSize({ width: 1120, height: 760 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.screenshot({ path: compactScreenshot, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 950 });

  await page.getByRole("button", { name: "Choisir le niveau A1" }).click();
  await page.getByRole("heading", { name: "Anglais · A1", exact: true }).waitFor();
  await page.getByText("12 chapitres · 60 cours", { exact: true }).waitFor();
  assert.equal(await page.getByRole("heading", {
    name: "Quel niveau d’anglais veux-tu travailler ?"
  }).count(), 0);

  const firstLesson = "Saluer et prendre congé";
  const progressCheckbox = page.locator(".lesson-unit-row")
    .filter({ hasText: firstLesson })
    .locator("input[type='checkbox']");
  await progressCheckbox.evaluate((element) => element.click());
  assert.equal(await progressCheckbox.isChecked(), true);

  await page.getByRole("button", { name: `Commencer le cours : ${firstLesson}` }).click();
  await page.getByText(`Prof IA · Cours · ${firstLesson}`, { exact: true }).waitFor();
  const coursePrompt = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(coursePrompt, /Anglais — parcours CECRL A1/);
  assert.match(coursePrompt, /réception\/compréhension, la production, l’interaction et la médiation/i);

  await selectPanelProvider("ChatGPT", "YouTube");
  const youtubeQuery = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(youtubeQuery, /anglais/i);
  assert.match(youtubeQuery, /English/);
  assert.match(youtubeQuery, /A1/);
  assert.doesNotMatch(youtubeQuery, /ingenieur/i);
  assert.ok(youtubeQuery.length <= 120);

  await selectPanelProvider("YouTube", "TikTok");
  const tiktokQuery = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(tiktokQuery, /anglais/i);
  assert.match(tiktokQuery, /A1/);
  assert.doesNotMatch(tiktokQuery, /ingenieur/i);
  assert.ok(tiktokQuery.length <= 80);

  await page.evaluate(() => {
    window.__etudeTauriInvokeCalls = [];
    window.__resolveEnglishLevelTeardown = null;
    window.__TAURI_INTERNALS__ = {
      invoke: async (command, args) => {
        window.__etudeTauriInvokeCalls.push([command, args]);
        if (command === "secure_ai_panel_for_account_transition") {
          return new Promise((resolve) => {
            window.__resolveEnglishLevelTeardown = resolve;
          });
        }
        return null;
      }
    };
  });
  await changeEnglishLevel("B1");
  await page.waitForFunction(() => typeof window.__resolveEnglishLevelTeardown === "function");
  await page.getByRole("heading", { name: "Anglais · A1", exact: true }).waitFor();
  assert.deepEqual(
    (await page.evaluate(() => window.__etudeTauriInvokeCalls))
      .filter(([command]) => command === "secure_ai_panel_for_account_transition"),
    [["secure_ai_panel_for_account_transition", { provider: "tiktok" }]]
  );
  await page.evaluate(() => window.__resolveEnglishLevelTeardown());
  await page.getByRole("heading", { name: "Anglais · B1", exact: true }).waitFor();
  await page.getByText("12 chapitres · 60 cours", { exact: true }).waitFor();

  await page.evaluate(() => {
    window.__etudeTauriInvokeCalls = [];
    window.__TAURI_INTERNALS__.invoke = async (command, args) => {
      window.__etudeTauriInvokeCalls.push([command, args]);
      if (command === "secure_ai_panel_for_account_transition") {
        throw new Error("Fermeture native simulée impossible");
      }
      return null;
    };
  });
  await changeEnglishLevel("C1");
  await page.getByText("Changement de niveau interrompu", { exact: true }).waitFor();
  await page.getByText(/Le niveau B1 reste sélectionné/).waitFor();
  await page.getByRole("heading", { name: "Anglais · B1", exact: true }).waitFor();
  await page.getByRole("button", { name: "Masquer le panneau" }).waitFor();

  await page.reload();
  await page.getByLabel("Cours", { exact: true }).click();
  await page.getByRole("heading", { name: "Anglais · B1", exact: true }).waitFor();
  assert.equal(await page.getByRole("heading", {
    name: "Quel niveau d’anglais veux-tu travailler ?"
  }).count(), 0);

  await changeEnglishLevel("A1");
  await page.getByRole("heading", { name: "Anglais · A1", exact: true }).waitFor();
  assert.equal(await page.locator(".lesson-unit-row")
    .filter({ hasText: firstLesson })
    .locator("input[type='checkbox']")
    .isChecked(), true);

  const manualTikTokUrl = "https://www.tiktok.com/@english/video/1234567890123456789";
  await page.getByRole("button", { name: "Associer la conversation" }).click();
  const linkDialog = page.getByRole("dialog", { name: "Associer une conversation" });
  await assertDialogConfinedToWorkspace(page, linkDialog, "La fenêtre d’association de conversation");
  await linkDialog.locator("input[type='url']").fill(manualTikTokUrl);
  await linkDialog.getByRole("button", { name: "Associer", exact: true }).click();
  await linkDialog.waitFor({ state: "detached" });
  const storedEnglishHistory = await page.evaluate(({ storageKey, url }) => {
    const conversations = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return {
      manual: conversations.find((conversation) => conversation.url === url) ?? null,
      activeLevelCount: conversations.filter((conversation) =>
        conversation.subjectId === "anglais" && conversation.curriculumScope === "cefr:A1"
      ).length
    };
  }, { storageKey: profile.storage.conversations, url: manualTikTokUrl });
  assert.ok(storedEnglishHistory.manual, "L’association manuelle doit être persistée.");
  assert.equal(storedEnglishHistory.manual.curriculumScope, "cefr:A1");
  await page.getByRole("tab", { name: /Historique IA/ }).click();
  await page.locator(".conversation-card").first().waitFor();
  assert.equal(
    await page.locator(".conversation-card").count(),
    storedEnglishHistory.activeLevelCount,
    "Toutes les associations du niveau A1, dont le lien manuel, doivent rester visibles dans son historique."
  );

  process.stdout.write(
    `Parcours anglais validé : Planning, choix persistant A1-C2, fermeture native sûre, historique CECRL et progression conservée. Captures : ${wideScreenshot} · ${compactScreenshot}\n`
  );
} finally {
  await context.close();
  await browser.close();
}
