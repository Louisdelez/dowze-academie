import assert from "node:assert/strict";
import { chromium } from "playwright";
import { bootstrapAuthenticatedPage } from "./browser-auth-helpers.mjs";
import {
  assertDialogConfinedToWorkspace,
  assertWeekCalendarGeometry
} from "./browser-layout-helpers.mjs";

const baseUrl = process.env.ETUDE_TEST_URL ?? "http://127.0.0.1:1420";
const corruptTasksPayload = "{taches-json-incompletes";

const browser = await chromium.launch({ headless: true });

async function clearStorageAndReload(page) {
  return bootstrapAuthenticatedPage(page, baseUrl);
}

async function assertCompactCalendarEventIsReadable(event, label) {
  await event.scrollIntoViewIfNeeded();
  const geometry = await event.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const children = Array.from(element.children).map((child) => {
      const childBounds = child.getBoundingClientRect();
      return {
        top: childBounds.top,
        bottom: childBounds.bottom,
        fontSize: Number.parseFloat(getComputedStyle(child).fontSize)
      };
    });
    return {
      className: element.className,
      top: bounds.top,
      bottom: bounds.bottom,
      height: bounds.height,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      children
    };
  });

  assert.match(geometry.className, /(?:^|\s)time-event--compact(?:\s|$)/, `${label} doit utiliser le rendu compact.`);
  assert.ok(geometry.height >= 33.5 && geometry.height <= 34.5, `${label} doit conserver sa durée visuelle de 30 minutes.`);
  assert.ok(
    geometry.scrollHeight <= geometry.clientHeight + 1,
    `${label} ne doit plus masquer verticalement son contenu.`
  );
  assert.ok(
    geometry.children.every((child) => child.top >= geometry.top - 0.5 && child.bottom <= geometry.bottom + 0.5),
    `${label} doit afficher entièrement son titre et son horaire dans la carte.`
  );
  assert.ok(
    geometry.children.every((child) => child.fontSize >= 11),
    `${label} doit conserver des textes d’au moins 11 px.`
  );
}

async function assertNarrowCompactTimeIsReadable(event, start, end, label) {
  await assertCompactCalendarEventIsReadable(event, label);
  const geometry = await event.evaluate((element) => {
    const time = element.querySelector(".time-event-time");
    if (!time) return null;
    return {
      visibleText: time.innerText.trim(),
      clientWidth: time.clientWidth,
      scrollWidth: time.scrollWidth,
      ariaLabel: element.getAttribute("aria-label")
    };
  });

  assert.ok(geometry, `${label} doit afficher une ligne horaire.`);
  assert.equal(geometry.visibleText, start, `${label} doit garder son heure de début visible.`);
  assert.ok(
    geometry.scrollWidth <= geometry.clientWidth + 1,
    `${label} ne doit pas tronquer horizontalement son heure dans une colonne étroite.`
  );
  assert.ok(
    (geometry.ariaLabel ?? "").includes(`${start} à ${end}`),
    `${label} doit conserver la plage complète pour les technologies d’assistance.`
  );
}

async function testZurichTimeZoneAndTaskCrud() {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 950 },
    timezoneId: "America/New_York"
  });
  const page = await context.newPage();

  try {
    // 07:00 à Zurich, mais 01:00 dans le fuseau simulé du navigateur.
    await page.clock.install({ time: new Date("2026-09-07T05:00:00.000Z") });
    const { storage } = await clearStorageAndReload(page);

    assert.equal(
      await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
      "America/New_York"
    );
    const homeEnglishEvent = page.locator(".next-event").filter({
      has: page.getByText("Anglais", { exact: true })
    }).first();
    assert.equal(
      await homeEnglishEvent.locator(".next-event-time strong").innerText(),
      "08:30",
      "L’accueil doit commencer par l’anglais à 08:30, heure de Zurich."
    );
    const homeAnalysisEvent = page.locator(".next-event").filter({
      has: page.getByText("Analyse I & II", { exact: true })
    }).first();
    assert.equal(
      await homeAnalysisEvent.locator(".next-event-time strong").innerText(),
      "09:00",
      "L’accueil doit afficher l’horaire réduit en heure de Zurich, pas l’heure de New York."
    );

    await page.getByLabel("Planning", { exact: true }).click();
    await page.getByText("Heure locale · Europe/Zurich", { exact: true }).waitFor();
    await assertWeekCalendarGeometry(page, "La vue Semaine à 1440 px");

    const mondayAnalysis = page.locator(".time-event").filter({
      has: page.getByText("Analyse I & II", { exact: true })
    }).first();
    await mondayAnalysis.waitFor();
    assert.match(
      await mondayAnalysis.innerText(),
      /09:00\s*[–-]\s*10:30/,
      "Le cours d’analyse du lundi doit être réduit à 09:00–10:30 à Zurich."
    );
    const mondayEnglish = page.locator(".time-event").filter({
      has: page.getByText("Anglais", { exact: true })
    }).first();
    assert.match(
      await mondayEnglish.innerText(),
      /08:30\s*[–-]\s*09:00/,
      "L’anglais doit occuper la première demi-heure du lundi."
    );
    await assertCompactCalendarEventIsReadable(mondayEnglish, "La carte Anglais 08:30–09:00");

    const mondayReview = page.locator(".time-event").filter({
      has: page.getByText("Révision active", { exact: true })
    }).first();
    await mondayReview.waitFor();
    assert.match(
      await mondayReview.innerText(),
      /17:15\s*[–-]\s*17:45/,
      "La révision du soir doit garder son horaire complet."
    );
    await assertCompactCalendarEventIsReadable(mondayReview, "La carte Révision active 17:15–17:45");

    const allDayStart = page.locator(".all-day-event").filter({
      hasText: "Rentrée — début des cours S1"
    });
    assert.equal(
      await allDayStart.count(),
      1,
      "L’événement de rentrée sur la journée ne doit apparaître qu’une fois."
    );

    await page.getByRole("button", { name: "Période suivante" }).click();
    const nextWeekEnglish = page.locator(".time-event").filter({
      has: page.getByText("Anglais", { exact: true })
    }).first();
    await nextWeekEnglish.waitFor();
    const nextWeekVisibility = await nextWeekEnglish.evaluate((element) => {
      const viewport = element.closest(".time-scroll")?.getBoundingClientRect();
      const bounds = element.getBoundingClientRect();
      return viewport
        ? { top: bounds.top, bottom: bounds.bottom, viewportTop: viewport.top, viewportBottom: viewport.bottom }
        : null;
    });
    assert.ok(nextWeekVisibility, "La grille horaire doit entourer la carte Anglais.");
    assert.ok(
      nextWeekVisibility.top >= nextWeekVisibility.viewportTop &&
        nextWeekVisibility.bottom <= nextWeekVisibility.viewportBottom,
      "Le défilement initial d’une autre semaine doit montrer entièrement l’anglais de 08:30."
    );

    await page.getByLabel("À faire", { exact: true }).click();
    await page.getByRole("button", { name: "Nouvelle tâche", exact: true }).click();

    let dialog = page.getByRole("dialog", { name: "Nouvelle tâche" });
    await assertDialogConfinedToWorkspace(page, dialog, "La fenêtre Nouvelle tâche");
    await dialog.getByLabel("Tâche", { exact: true }).fill("Vérifier la régression horaire");
    await dialog.getByLabel("Échéance", { exact: true }).fill("2026-09-08T09:15");
    await dialog.locator("label.form-field").filter({ hasText: "Matière" })
      .locator("select").selectOption({ label: "Analyse I & II" });
    await dialog.locator("label.form-field").filter({ hasText: "Priorité" })
      .locator("select").selectOption("high");
    await dialog.getByRole("button", { name: "Ajouter", exact: true }).click();

    await page.getByText("Vérifier la régression horaire", { exact: true }).waitFor();
    let storedTask = await page.evaluate(({ key, title }) => {
      const tasks = JSON.parse(localStorage.getItem(key) ?? "[]");
      return tasks.find((task) => task.title === title);
    }, { key: storage.tasks, title: "Vérifier la régression horaire" });
    assert.ok(storedTask, "La tâche créée doit être enregistrée dans le stockage local.");
    assert.equal(
      storedTask.dueAt,
      "2026-09-08T07:15:00.000Z",
      "09:15 saisi doit être interprété comme 09:15 Europe/Zurich."
    );
    assert.equal(storedTask.priority, "high");
    assert.equal(storedTask.subjectId, "analyse");

    await page.getByRole("button", {
      name: "Modifier « Vérifier la régression horaire »",
      exact: true
    }).click();
    dialog = page.getByRole("dialog", { name: "Modifier la tâche" });
    await assertDialogConfinedToWorkspace(page, dialog, "La fenêtre Modifier la tâche");
    await dialog.getByLabel("Tâche", { exact: true }).fill("Régression horaire validée");
    await dialog.getByLabel("Échéance", { exact: true }).fill("2026-09-08T09:45");
    await dialog.locator("label.form-field").filter({ hasText: "Priorité" })
      .locator("select").selectOption("low");
    await dialog.getByRole("button", { name: "Enregistrer", exact: true }).click();

    await page.getByText("Régression horaire validée", { exact: true }).waitFor();
    assert.equal(await page.getByText("Vérifier la régression horaire", { exact: true }).count(), 0);
    storedTask = await page.evaluate(({ key, id }) => {
      const tasks = JSON.parse(localStorage.getItem(key) ?? "[]");
      return tasks.find((task) => task.id === id);
    }, { key: storage.tasks, id: storedTask.id });
    assert.equal(storedTask.title, "Régression horaire validée");
    assert.equal(storedTask.dueAt, "2026-09-08T07:45:00.000Z");
    assert.equal(storedTask.priority, "low");

    await page.getByRole("button", {
      name: "Supprimer « Régression horaire validée »",
      exact: true
    }).click();
    dialog = page.getByRole("dialog", { name: "Supprimer cette tâche ?" });
    await assertDialogConfinedToWorkspace(page, dialog, "La confirmation de suppression de tâche");
    await dialog.getByRole("button", { name: "Supprimer", exact: true }).click();
    await page.getByText("Régression horaire validée", { exact: true }).waitFor({ state: "detached" });

    const taskStillStored = await page.evaluate(({ key, id }) => {
      const tasks = JSON.parse(localStorage.getItem(key) ?? "[]");
      return tasks.some((task) => task.id === id);
    }, { key: storage.tasks, id: storedTask.id });
    assert.equal(taskStillStored, false, "La suppression doit être persistée.");
  } finally {
    await context.close();
  }
}

async function testCorruptStorageRecovery() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();

  try {
    const { storage } = await clearStorageAndReload(page);
    await page.evaluate(({ key, payload }) => localStorage.setItem(key, payload), {
      key: storage.tasks,
      payload: corruptTasksPayload
    });
    await page.reload();
    await page.getByText("Données locales réparées", { exact: true }).waitFor();

    const repaired = await page.evaluate((key) => ({
      value: localStorage.getItem(key),
      recovery: localStorage.getItem(`${key}.recovery`)
    }), storage.tasks);

    assert.equal(
      repaired.recovery,
      corruptTasksPayload,
      "La valeur illisible originale doit rester disponible dans la copie .recovery."
    );
    const repairedTasks = JSON.parse(repaired.value ?? "null");
    assert.ok(Array.isArray(repairedTasks), "La clé principale doit être remplacée par une liste sûre.");
    assert.ok(repairedTasks.length > 0, "Le référentiel de tâches initial doit être restauré.");
    assert.ok(
      repairedTasks.every((task) => typeof task.id === "string" && typeof task.title === "string"),
      "Les tâches restaurées doivent avoir une structure exploitable."
    );
  } finally {
    await context.close();
  }
}

async function testFailedDurableWriteIsRejected() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();

  try {
    const { storage } = await clearStorageAndReload(page);
    await page.getByLabel("À faire", { exact: true }).click();
    await page.evaluate((key) => {
      const originalSetItem = Storage.prototype.setItem;
      window.__etudeOriginalSetItem = originalSetItem;
      Storage.prototype.setItem = function setItem(storageKey, value) {
        if (storageKey === key) throw new DOMException("Quota simulé", "QuotaExceededError");
        return originalSetItem.call(this, storageKey, value);
      };
    }, storage.tasks);

    await page.getByRole("button", { name: "Nouvelle tâche", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Nouvelle tâche" });
    await dialog.getByLabel("Tâche", { exact: true }).fill("Ne jamais perdre cette tâche");
    await dialog.getByLabel("Échéance", { exact: true }).fill("2026-09-08T09:15");
    await dialog.getByRole("button", { name: "Ajouter", exact: true }).click();

    await page.getByText("Stockage local presque plein", { exact: true }).waitFor();
    assert.equal(await dialog.isVisible(), true, "Le formulaire doit rester ouvert après l’échec durable.");
    assert.equal(
      await page.getByText("Tâche ajoutée", { exact: true }).count(),
      0,
      "Aucun faux message de succès ne doit être affiché."
    );
    const taskWasStored = await page.evaluate(({ key, title }) => {
      const tasks = JSON.parse(localStorage.getItem(key) ?? "[]");
      return tasks.some((task) => task.title === title);
    }, { key: storage.tasks, title: "Ne jamais perdre cette tâche" });
    assert.equal(taskWasStored, false, "La tâche non durable ne doit pas rester seulement en mémoire.");

    await page.evaluate(() => {
      Storage.prototype.setItem = window.__etudeOriginalSetItem;
      delete window.__etudeOriginalSetItem;
    });
  } finally {
    await context.close();
  }
}

async function testCompactAiPanelLayout() {
  const context = await browser.newContext({ viewport: { width: 1120, height: 760 } });
  const page = await context.newPage();

  try {
    await page.clock.install({ time: new Date("2026-09-07T05:00:00.000Z") });
    await clearStorageAndReload(page);
    const geometry = await page.evaluate(() => {
      const shell = document.querySelector(".app-shell");
      const rail = document.querySelector(".app-rail");
      const workspace = document.querySelector(".main-workspace");
      const aiPane = document.querySelector(".ai-pane.is-visible");
      const toolbar = document.querySelector(".ai-toolbar");
      if (!shell || !rail || !workspace || !aiPane || !toolbar) return null;
      const rect = (element) => {
        const value = element.getBoundingClientRect();
        return { left: value.left, right: value.right, width: value.width };
      };
      return {
        viewportWidth: window.innerWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        shell: rect(shell),
        rail: rect(rail),
        workspace: rect(workspace),
        aiPane: rect(aiPane),
        aiContentOverflows: aiPane.scrollWidth > aiPane.clientWidth + 1,
        toolbarContentOverflows: toolbar.scrollWidth > toolbar.clientWidth + 1
      };
    });

    assert.ok(geometry, "La structure principale et le panneau IA doivent être rendus.");
    assert.ok(
      geometry.aiPane.width >= 359.5 && geometry.aiPane.width <= 364.5,
      `Le panneau IA doit rester entre 360 et 364 px à 1120 px (reçu ${geometry.aiPane.width}).`
    );
    assert.ok(
      geometry.workspace.width >= 679.5,
      `Le contenu central doit conserver au moins 680 px (reçu ${geometry.workspace.width}).`
    );
    assert.ok(geometry.shell.left >= -0.5 && geometry.shell.right <= geometry.viewportWidth + 0.5);
    assert.ok(geometry.aiPane.right <= geometry.viewportWidth + 0.5);
    assert.ok(geometry.documentScrollWidth <= geometry.viewportWidth);
    assert.ok(geometry.bodyScrollWidth <= geometry.viewportWidth);
    assert.equal(geometry.aiContentOverflows, false, "Le contenu du panneau IA ne doit pas déborder horizontalement.");
    assert.equal(geometry.toolbarContentOverflows, false, "La barre du panneau IA doit tenir dans sa largeur.");

    await page.getByLabel("Planning", { exact: true }).click();
    await assertWeekCalendarGeometry(page, "La vue Semaine à 1120 px");
    const narrowEnglish = page.locator(".time-event").filter({
      has: page.getByText("Anglais", { exact: true })
    }).first();
    const narrowReview = page.locator(".time-event").filter({
      has: page.getByText("Révision active", { exact: true })
    }).first();
    await narrowEnglish.waitFor();
    await narrowReview.waitFor();
    await assertNarrowCompactTimeIsReadable(
      narrowEnglish,
      "08:30",
      "09:00",
      "La carte Anglais étroite"
    );
    await assertNarrowCompactTimeIsReadable(
      narrowReview,
      "17:15",
      "17:45",
      "La carte Révision active étroite"
    );
  } finally {
    await context.close();
  }
}

try {
  await testZurichTimeZoneAndTaskCrud();
  await testCorruptStorageRecovery();
  await testFailedDurableWriteIsRejected();
  await testCompactAiPanelLayout();
  process.stdout.write(
    "Régressions d’audit validées : fuseau Zurich, cycle de vie des tâches, récupération locale, refus des écritures non durables et layout IA compact.\n"
  );
} finally {
  await browser.close();
}
