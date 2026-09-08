import assert from "node:assert/strict";
import { chromium } from "playwright";
import { bootstrapAuthenticatedPage } from "./browser-auth-helpers.mjs";
import { assertDialogConfinedToWorkspace } from "./browser-layout-helpers.mjs";

const baseUrl = process.env.ETUDE_TEST_URL ?? "http://127.0.0.1:1420";
const expectedEventCount = 1115;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const page = await context.newPage();

function eventLabel(count) {
  return `${count} événement${count === 1 ? "" : "s"}`;
}

async function downloadedText(download) {
  const stream = await download.createReadStream();
  assert.ok(stream, "Le téléchargement .ics doit exposer son contenu.");
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

try {
  await bootstrapAuthenticatedPage(page, baseUrl);

  await page.getByLabel("Planning", { exact: true }).click();
  await page.getByRole("button", { name: "Envoyer vers un agenda", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "Envoyer le planning" });
  await assertDialogConfinedToWorkspace(page, dialog, "La fenêtre d’export du planning");
  await dialog.getByText(
    "Calendrier de l’appareil, Google Calendar ou fichier iCalendar universel",
    { exact: true }
  ).waitFor();

  const summary = dialog.getByLabel("Résumé de l’export", { exact: true });
  await summary.getByText(eventLabel(expectedEventCount), { exact: true }).waitFor();
  await summary.getByText("Europe/Zurich", { exact: true }).waitFor();

  const expectedGroups = [
    "Cours et travail",
    "Examens et jalons",
    "Vacances et personnel"
  ];
  const groupCards = dialog.locator(".calendar-export-groups label");
  assert.equal(await groupCards.count(), expectedGroups.length);

  let groupedEventCount = 0;
  for (const groupName of expectedGroups) {
    const checkbox = dialog.getByRole("checkbox", { name: new RegExp(`^${groupName}`) });
    assert.equal(await checkbox.isChecked(), true, `${groupName} doit être sélectionné par défaut.`);

    const card = groupCards.filter({ hasText: groupName });
    assert.equal(await card.count(), 1);
    const count = Number.parseInt(await card.locator("em").innerText(), 10);
    assert.ok(Number.isInteger(count) && count >= 0, `Compte invalide pour ${groupName}.`);
    groupedEventCount += count;
  }
  assert.equal(groupedEventCount, expectedEventCount);

  const learningCard = groupCards.filter({ hasText: expectedGroups[0] });
  const learningCount = Number.parseInt(await learningCard.locator("em").innerText(), 10);
  const learningCheckbox = dialog.getByRole("checkbox", {
    name: new RegExp(`^${expectedGroups[0]}`)
  });
  await learningCheckbox.uncheck();
  await summary.getByText(eventLabel(expectedEventCount - learningCount), { exact: true }).waitFor();
  await learningCheckbox.check();
  await summary.getByText(eventLabel(expectedEventCount), { exact: true }).waitFor();

  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Enregistrer le fichier .ics", exact: true }).click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), "Dowze-Academie-Planning-2026-2027.ics");

  const ics = await downloadedText(download);
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.match(ics, /\r\nMETHOD:PUBLISH\r\n/);
  assert.match(ics, /\r\nX-WR-TIMEZONE:Europe\/Zurich\r\n/);
  assert.match(ics, /\r\nDTSTART:20260907T063000Z\r\n/);
  assert.match(ics, /\r\nSUMMARY:Anglais\r\n/);
  assert.match(ics, /\r\nDTSTART;VALUE=DATE:20261002\r\n/);
  assert.match(ics, /\r\nSUMMARY:Contrôle 1 — Analyse \+ Algèbre linéaire\r\n/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, expectedEventCount);
  assert.ok(Buffer.byteLength(ics, "utf8") < 1_000_000, "Le fichier doit rester sous la limite Google de 1 Mo.");

  await dialog.getByRole("status").getByText(
    "Le fichier calendrier .ics a bien été enregistré.",
    { exact: true }
  ).waitFor();
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });

  process.stdout.write(
    `Parcours export calendrier validé : ${expectedEventCount} événements et fichier .ics conforme.\n`
  );
} finally {
  await browser.close();
}
