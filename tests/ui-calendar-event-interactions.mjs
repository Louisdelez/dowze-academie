import assert from "node:assert/strict";
import { chromium } from "playwright";
import { bootstrapAuthenticatedPage } from "./browser-auth-helpers.mjs";
import {
  assertDialogConfinedToWorkspace,
  assertFloatingElementConfinedToWorkspace
} from "./browser-layout-helpers.mjs";

const baseUrl = process.env.ETUDE_TEST_URL ?? "http://127.0.0.1:1420";
const eventTitle = "Cours test — Analyse";
const testEvent = {
  id: "event-interaction-analyse",
  title: eventTitle,
  subjectId: "analyse",
  start: "2026-09-07T08:30:00.000Z",
  end: "2026-09-07T09:30:00.000Z",
  location: "Salle Interaction",
  type: "course",
  color: "#5c6ce5"
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 950 },
  timezoneId: "Europe/Zurich"
});
const page = await context.newPage();

const editor = page.getByRole("dialog", { name: "Modifier l’événement" });

async function assertAnalyseOpenedWithoutEditor() {
  await page.getByRole("heading", { name: "Mes cours", exact: true }).waitFor();
  const selectedSubject = page.locator(".subject-list button[aria-current='true']");
  await selectedSubject.waitFor();
  assert.match(await selectedSubject.innerText(), /Analyse I & II/);
  assert.equal(await editor.count(), 0, "Un clic normal ne doit jamais ouvrir l’éditeur.");
}

async function calendarEventButton() {
  await page.getByLabel("Planning", { exact: true }).click();
  const eventButton = page.locator(".time-event").filter({ hasText: eventTitle });
  await eventButton.waitFor();
  assert.equal(await eventButton.count(), 1);
  return eventButton;
}

async function openEventMenu(eventButton) {
  await eventButton.scrollIntoViewIfNeeded();
  await eventButton.click({ button: "right" });
  const menu = page.getByRole("menu", { name: `Actions pour « ${eventTitle} »` });
  await menu.waitFor();
  await assertFloatingElementConfinedToWorkspace(page, menu, "Le menu contextuel du calendrier");
  assert.equal(await eventButton.getAttribute("aria-expanded"), "true");
  await menu.getByRole("menuitem", { name: "Modifier", exact: true }).waitFor();
  return menu;
}

try {
  await page.clock.install({ time: new Date("2026-09-07T07:00:00.000Z") });
  const profile = await bootstrapAuthenticatedPage(page, baseUrl);
  await page.evaluate(({ storage, calendarEvent }) => {
    localStorage.setItem(storage.events, JSON.stringify([calendarEvent]));
    localStorage.setItem(storage.calendarView, JSON.stringify("week"));
  }, { storage: profile.storage, calendarEvent: testEvent });
  await page.reload();

  // Depuis l’accueil, le clic principal ouvre la matière associée, sans détour
  // par le planning et surtout sans afficher le formulaire d’édition.
  const upcomingEvent = page.locator(".next-event").filter({ hasText: eventTitle });
  await upcomingEvent.waitFor();
  await upcomingEvent.click();
  await assertAnalyseOpenedWithoutEditor();

  // Le même contrat vaut depuis la grille du planning.
  let eventButton = await calendarEventButton();
  await page.getByRole("button", { name: "Événement", exact: true }).click();
  const newEventEditor = page.getByRole("dialog", { name: "Nouvel événement" });
  await assertDialogConfinedToWorkspace(page, newEventEditor, "La fenêtre Nouvel événement");
  await newEventEditor.getByRole("button", { name: "Fermer « Nouvel événement »" }).click();
  await newEventEditor.waitFor({ state: "detached" });
  await eventButton.click();
  await assertAnalyseOpenedWithoutEditor();

  // Échap ferme le menu et rend le focus au bloc événement déclencheur.
  eventButton = await calendarEventButton();
  let menu = await openEventMenu(eventButton);
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "detached" });
  assert.equal(await eventButton.evaluate((element) => element === document.activeElement), true);

  // Un clic extérieur ferme aussi le menu sans ouvrir d’éditeur.
  menu = await openEventMenu(eventButton);
  await page.locator(".calendar-meta-row .timezone-label").click();
  await menu.waitFor({ state: "detached" });
  assert.equal(await editor.count(), 0);

  // Tout scroll du calendrier ferme le menu flottant.
  menu = await openEventMenu(eventButton);
  await page.locator(".time-scroll").evaluate((element) => {
    element.scrollTop += 80;
  });
  await menu.waitFor({ state: "detached" });

  // L’édition reste disponible exclusivement via le menu contextuel.
  menu = await openEventMenu(eventButton);
  await menu.getByRole("menuitem", { name: "Modifier", exact: true }).click();
  await assertDialogConfinedToWorkspace(page, editor, "La fenêtre Modifier l’événement");
  assert.equal(await editor.getByLabel("Titre", { exact: true }).inputValue(), eventTitle);
  assert.equal(await page.getByRole("menu", { name: `Actions pour « ${eventTitle} »` }).count(), 0);

  process.stdout.write(
    "Événements Accueil/Planning validés : clic principal, menu contextuel, édition et fermetures.\n"
  );
} finally {
  await context.close();
  await browser.close();
}
