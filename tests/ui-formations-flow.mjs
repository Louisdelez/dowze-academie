import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { bootstrapAuthenticatedPage } from "./browser-auth-helpers.mjs";

const baseUrl = process.env.ETUDE_TEST_URL ?? "http://127.0.0.1:1420";
const formationName = "Lycée Seconde";
const expectedFolderName = "dowze-formation-lycee-seconde-2026-2027";
const expectedPackageId = "lycee-seconde-2026-2027";
const legacyFormationName = "Ingénierie de l’énergie et physique appliquée";
const legacyInstanceId = "ingenierie-energie-annee-1";
const importedTaskTitle = "Préparer le matériel de la rentrée";
const importedTaskId = "preparer-rentree";
const legacyTaskTitle = "Finaliser le dossier pour la revue de conception";
const legacyTaskId = "task-revue-conception-s1";
const requiredFiles = [
  "formation.json",
  "matieres.json",
  "programme.json",
  "planning.json",
  "evaluations.json",
  "taches.json"
];

async function openFormations(page) {
  await page.getByRole("button", { name: "Formations", exact: true }).click();
  await page.getByRole("heading", { name: "Formations", exact: true, level: 1 }).waitFor();
}

async function openTasks(page) {
  await page.getByRole("button", { name: "À faire", exact: true }).click();
  await page.getByRole("heading", { name: "À faire", exact: true, level: 1 }).waitFor();
}

async function activateFormation(page, targetName) {
  await openFormations(page);
  await page.getByRole("button", {
    name: `Activer la formation « ${targetName} »`,
    exact: true
  }).click();
  const dialog = page.getByRole("dialog", {
    name: `Passer à « ${targetName} » ?`,
    exact: true
  });
  await dialog.getByText("Rien ne sera supprimé", { exact: false }).waitFor();
  await dialog.getByRole("button", { name: "Changer de formation", exact: true }).click();
  await dialog.waitFor({ state: "detached" });

  await openFormations(page);
  await page.locator(".formation-active-card").getByRole("heading", {
    name: targetName,
    exact: true
  }).waitFor();
}

async function toggleTaskCompleted(page, title) {
  const unchecked = page.getByRole("checkbox", {
    name: `Marquer comme terminée : ${title}`,
    exact: true
  });
  await unchecked.locator("..").click();
  const checked = page.getByRole("checkbox", {
    name: `Marquer comme non terminée : ${title}`,
    exact: true
  });
  await checked.waitFor();
  assert.equal(await checked.isChecked(), true, `La tâche « ${title} » doit être terminée.`);
}

async function persistedTask(page, accountId, formation, taskId) {
  return page.evaluate(async ({ accountId: id, formation: identity, taskId: searchedTaskId }) => {
    const { formationStorageFor } = await import("/src/lib/profileStorage.ts");
    const key = formationStorageFor(id, identity).tasks;
    const raw = localStorage.getItem(key);
    const tasks = raw ? JSON.parse(raw) : [];
    return {
      key,
      raw,
      task: tasks.find((candidate) => candidate.id === searchedTaskId) ?? null
    };
  }, { accountId, formation, taskId });
}

async function persistedAiVisibility(page, accountId, formation) {
  return page.evaluate(async ({ accountId: id, formation: identity }) => {
    const { formationStorageFor } = await import("/src/lib/profileStorage.ts");
    return localStorage.getItem(formationStorageFor(id, identity).aiVisible);
  }, { accountId, formation });
}

const temporaryRoot = await mkdtemp(join(tmpdir(), "dowze-ui-formations-"));
const packageDirectory = join(temporaryRoot, expectedFolderName);
let browser;

try {
  await mkdir(packageDirectory);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();
  const profile = await bootstrapAuthenticatedPage(page, baseUrl);
  const accountId = profile.account.id;

  await openFormations(page);
  await page.locator(".formation-active-card").getByRole("heading", {
    name: legacyFormationName,
    exact: true
  }).waitFor();
  await page.getByRole("button", { name: "Ajouter une formation", exact: true }).click();
  await page.getByRole("heading", { name: "Ajouter une formation", exact: true, level: 1 }).waitFor();

  await page.getByLabel("Nom de la formation", { exact: true }).fill(formationName);
  await page.getByLabel("Début de l’année scolaire", { exact: true }).fill("2026-09-01");
  await page.getByLabel("Fin de l’année scolaire", { exact: true }).fill("2027-06-30");
  await page.locator("#formation-folder-preview code").getByText(
    `${expectedFolderName}/`,
    { exact: true }
  ).waitFor();
  const generatedPrompt = await page.getByLabel(
    "Prompt généré pour formation.json",
    { exact: true }
  ).textContent();
  assert.ok(
    generatedPrompt?.includes(JSON.stringify(formationName)),
    "Le prompt doit injecter le nom saisi comme chaîne JSON."
  );

  const templates = await page.evaluate(async (input) => {
    const { buildFormationTemplateFiles } = await import("/src/lib/formationPrompts.ts");
    return buildFormationTemplateFiles(input);
  }, {
    name: formationName,
    startDate: "2026-09-01",
    endDate: "2027-06-30"
  });
  assert.deepEqual(Object.keys(templates).sort(), [...requiredFiles].sort());
  await Promise.all(requiredFiles.map(async (filename) => {
    const content = templates[filename];
    assert.equal(typeof content, "string", `${filename} doit être généré.`);
    await writeFile(join(packageDirectory, filename), content, "utf8");
  }));

  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Importer un dossier", exact: true }).click();
  const chooser = await chooserPromise;
  assert.equal(chooser.isMultiple(), true);
  await chooser.setFiles(packageDirectory);

  await page.getByRole("heading", {
    name: "Dossier prêt à être installé",
    exact: true
  }).waitFor();
  await page.locator(".formation-import-preview").getByText(formationName, { exact: true }).waitFor();
  await page.getByRole("button", { name: "Installer la formation", exact: true }).click();
  await page.getByRole("heading", { name: "Formations", exact: true, level: 1 }).waitFor();
  await page.getByRole("status").getByText(
    `« ${formationName} » a été ajoutée à vos formations.`,
    { exact: true }
  ).waitFor();
  await page.locator(".formation-active-card").getByRole("heading", {
    name: legacyFormationName,
    exact: true
  }).waitFor();

  const installedState = await page.evaluate(async ({ id, packageId }) => {
    const { formationRegistryStorageFor } = await import("/src/lib/profileStorage.ts");
    const keys = formationRegistryStorageFor(id);
    const registry = JSON.parse(localStorage.getItem(keys.registry) ?? "null");
    const activeId = JSON.parse(localStorage.getItem(keys.active) ?? "null");
    const installed = registry?.formations?.find((formation) => formation.packageId === packageId) ?? null;
    return { activeId, installed, installedCount: registry?.formations?.length ?? 0 };
  }, { id: accountId, packageId: expectedPackageId });
  assert.equal(installedState.installedCount, 1);
  assert.ok(installedState.installed, "La formation importée doit être inscrite au registre.");
  assert.equal(installedState.activeId, legacyInstanceId, "L’installation ne doit pas activer la formation.");
  const importedFormation = {
    instanceId: installedState.installed.instanceId,
    storageKind: "formation-v1"
  };
  const legacyFormation = {
    instanceId: legacyInstanceId,
    storageKind: "legacy-energy-year1"
  };
  const legacyAiVisibilityBeforeSwitch = await persistedAiVisibility(
    page,
    accountId,
    legacyFormation
  );

  await activateFormation(page, formationName);
  await openTasks(page);
  await toggleTaskCompleted(page, importedTaskTitle);
  const importedMarkerBeforeSwitch = await persistedTask(
    page,
    accountId,
    importedFormation,
    importedTaskId
  );
  assert.equal(importedMarkerBeforeSwitch.task?.completed, true);
  assert.equal(typeof importedMarkerBeforeSwitch.task?.completedAt, "string");

  await activateFormation(page, legacyFormationName);
  assert.equal(
    await persistedAiVisibility(page, accountId, importedFormation),
    "true",
    "Quitter une formation ne doit pas fermer durablement son panneau IA."
  );
  await openTasks(page);
  assert.equal(await page.getByText(importedTaskTitle, { exact: true }).count(), 0);
  await toggleTaskCompleted(page, legacyTaskTitle);
  const legacyMarker = await persistedTask(page, accountId, legacyFormation, legacyTaskId);
  const importedMarkerWhileLegacyIsActive = await persistedTask(
    page,
    accountId,
    importedFormation,
    importedTaskId
  );
  assert.equal(legacyMarker.task?.completed, true);
  assert.equal(importedMarkerWhileLegacyIsActive.task?.completed, true);
  assert.notEqual(legacyMarker.key, importedMarkerWhileLegacyIsActive.key);

  await activateFormation(page, formationName);
  assert.equal(
    await persistedAiVisibility(page, accountId, legacyFormation),
    legacyAiVisibilityBeforeSwitch,
    "Le changement de formation ne doit pas modifier la préférence IA historique."
  );
  await openTasks(page);
  const restoredImportedTask = page.getByRole("checkbox", {
    name: `Marquer comme non terminée : ${importedTaskTitle}`,
    exact: true
  });
  await restoredImportedTask.waitFor();
  assert.equal(await restoredImportedTask.isChecked(), true);
  assert.equal(await page.getByText(legacyTaskTitle, { exact: true }).count(), 0);

  const importedMarkerAfterRoundTrip = await persistedTask(
    page,
    accountId,
    importedFormation,
    importedTaskId
  );
  const legacyMarkerAfterRoundTrip = await persistedTask(
    page,
    accountId,
    legacyFormation,
    legacyTaskId
  );
  assert.deepEqual(importedMarkerAfterRoundTrip.task, importedMarkerBeforeSwitch.task);
  assert.equal(legacyMarkerAfterRoundTrip.task?.completed, true);

  process.stdout.write(
    "Parcours Formations validé : dossier généré/importé, installation inactive et isolation A→B restaurée.\n"
  );
} finally {
  await browser?.close();
  await rm(temporaryRoot, { recursive: true, force: true });
}
