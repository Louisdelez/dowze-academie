import assert from "node:assert/strict";
import { chromium } from "playwright";
import { bootstrapAuthenticatedPage } from "./browser-auth-helpers.mjs";
import { assertDialogConfinedToWorkspace } from "./browser-layout-helpers.mjs";

const baseUrl = process.env.ETUDE_TEST_URL ?? "http://127.0.0.1:1420";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1120, height: 760 } });
const page = await context.newPage();

try {
  await bootstrapAuthenticatedPage(page, baseUrl, {
    displayName: "Session Google",
    username: "session.google",
    password: "Session-Google-2026!"
  });
  await page.getByLabel("Réglages", { exact: true }).click();

  const section = page.getByRole("region", { name: "Compte Google" });
  await section.waitFor();
  await section.getByText("Session du navigateur intégré sur cet appareil", { exact: true }).waitFor();
  assert.equal(await section.getByText(/Dowze Academie ne lit ni votre adresse e-mail/).count(), 1);
  assert.equal(await section.getByText(/Chaque service garde sa propre connexion/).count(), 1);
  assert.equal(await section.getByText(/Connecté à Google/).count(), 0);

  await page.evaluate(() => {
    window.__etudeGoogleWindowOpenCalls = [];
    window.open = (...args) => {
      window.__etudeGoogleWindowOpenCalls.push(args);
      return null;
    };
  });
  await section.getByRole("button", { name: "Se connecter / gérer Google" }).click();

  assert.deepEqual(await page.evaluate(() => window.__etudeGoogleWindowOpenCalls), [[
    "https://accounts.google.com/",
    "_blank",
    "noopener,noreferrer"
  ]]);
  await section.getByText(
    "Google a été ouvert dans votre navigateur. La session partagée du navigateur intégré se teste dans l’application Dowze Academie.",
    { exact: true }
  ).waitFor();

  const removeButton = section.getByRole("button", { name: "Retirer Google de Dowze Academie…" });
  await section.getByText(
    "La suppression ciblée des données Google intégrées est actuellement disponible sur macOS uniquement.",
    { exact: true }
  ).waitFor();
  assert.equal(await removeButton.isDisabled(), true);

  await page.evaluate(() => {
    window.__etudeTauriInvokeCalls = [];
    window.__etudeGoogleRemovalOutcome = "failure";
    window.__TAURI_INTERNALS__ = {
      invoke: async (command, args) => {
        window.__etudeTauriInvokeCalls.push([command, args]);
        if (command === "native_capabilities") {
          return { platform: "macos", googleWebProfileRemoval: true };
        }
        if (command === "remove_google_web_profile") {
          if (window.__etudeGoogleRemovalOutcome === "failure") {
            throw new Error("Échec simulé après fermeture des fenêtres web.");
          }
          return { removedRecords: 7 };
        }
        return null;
      }
    };
  });
  await page.getByLabel("Accueil", { exact: true }).click();
  await page.getByLabel("Réglages", { exact: true }).click();
  await section.getByText(
    "Retirer efface uniquement les données Google conservées dans Dowze Academie, jamais le compte Google en ligne.",
    { exact: true }
  ).waitFor();
  assert.equal(await removeButton.isEnabled(), true);

  await removeButton.click();
  let removalDialog = page.getByRole("dialog", { name: "Retirer Google de Dowze Academie ?" });
  await assertDialogConfinedToWorkspace(page, removalDialog, "La confirmation de retrait Google");
  await removalDialog.getByText(/Cette action supprime de l’application les cookies, caches et données locales Google/).waitFor();
  await removalDialog.getByText(/pour tous les profils Dowze Academie de cet appareil/).waitFor();
  await removalDialog.getByText(/Google, Gemini, NotebookLM et YouTube seront déconnectés/).waitFor();
  await removalDialog.getByText(/Votre compte Google en ligne ne sera pas supprimé/).waitFor();
  await removalDialog.getByText(/Les sessions propres de ChatGPT, Claude, Duolingo et Khan Academy resteront enregistrées/).waitFor();
  await removalDialog.getByRole("button", { name: "Annuler" }).click();
  await removalDialog.waitFor({ state: "detached" });

  await removeButton.click();
  removalDialog = page.getByRole("dialog", { name: "Retirer Google de Dowze Academie ?" });
  await removalDialog.getByRole("button", { name: "Retirer de l’application" }).click();
  await page.getByRole("alert").filter({ hasText: "Échec simulé après fermeture des fenêtres web." }).waitFor();
  await page.waitForFunction(() => window.__etudeTauriInvokeCalls.some(
    ([command, args]) => command === "sync_ai_panel" && args?.visible === true
  ));
  let nativeCalls = await page.evaluate(() => window.__etudeTauriInvokeCalls);
  assert.equal(nativeCalls.filter(([command]) => command === "remove_google_web_profile").length, 1);
  assert.ok(nativeCalls.some(([command, args]) => command === "sync_ai_panel" && args?.visible === false));
  assert.ok(nativeCalls.some(([command, args]) => command === "sync_ai_panel" && args?.visible === true));
  await removalDialog.getByRole("button", { name: "Annuler" }).click();

  await page.evaluate(() => {
    window.__etudeTauriInvokeCalls = [];
    window.__etudeGoogleRemovalOutcome = "success";
  });
  await removeButton.click();
  removalDialog = page.getByRole("dialog", { name: "Retirer Google de Dowze Academie ?" });
  await removalDialog.getByRole("button", { name: "Retirer de l’application" }).click();
  await removalDialog.waitFor({ state: "detached" });
  await section.getByText(
    "Les données de connexion Google ont été retirées de Dowze Academie. Votre compte Google en ligne existe toujours.",
    { exact: true }
  ).waitFor();
  nativeCalls = await page.evaluate(() => window.__etudeTauriInvokeCalls);
  assert.deepEqual(nativeCalls.filter(([command]) => command === "remove_google_web_profile"), [[
    "remove_google_web_profile",
    {}
  ]]);

  process.stdout.write("Connexion, confirmation, annulation et retrait Google local validés sans faux statut.\n");
} finally {
  await browser.close();
}
