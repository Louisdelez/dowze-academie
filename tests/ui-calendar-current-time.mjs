import assert from "node:assert/strict";
import { chromium } from "playwright";
import { bootstrapAuthenticatedPage } from "./browser-auth-helpers.mjs";

const baseUrl = process.env.ETUDE_TEST_URL ?? "http://127.0.0.1:1420";
const screenshotPath = process.env.ETUDE_SCREENSHOT ?? "/tmp/etude-calendar-current-week.png";
const initialTime = new Date("2026-09-09T12:37:20.000Z");
const hourHeight = 68;
const firstVisibleHour = 0;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 950 },
  timezoneId: "Europe/Zurich"
});
const page = await context.newPage();

try {
  await page.clock.install({ time: initialTime });
  await bootstrapAuthenticatedPage(page, baseUrl);

  await page.getByLabel("Planning", { exact: true }).click();

  const indicator = page.locator(".now-line");
  await indicator.waitFor();
  assert.equal(await indicator.count(), 1);
  assert.equal(await indicator.locator("time").innerText(), "14:37");
  assert.equal(await indicator.locator("time").getAttribute("datetime"), "14:37");
  assert.equal(
    await indicator.locator("time").getAttribute("aria-label"),
    "Heure actuelle : 14:37"
  );
  assert.equal(await indicator.locator(".now-line-dot").count(), 1);

  const expectedInitialTop = (14 + 37 / 60 - firstVisibleHour) * hourHeight;
  const initialTop = await indicator.evaluate((element) =>
    Number.parseFloat(element.style.top)
  );
  assert.ok(
    Math.abs(initialTop - expectedInitialTop) < 0.1,
    `Position initiale incorrecte : attendu ${expectedInitialTop}, reçu ${initialTop}`
  );
  const initialScroll = await page.locator(".time-scroll").evaluate((element) => element.scrollTop);
  assert.ok(initialScroll > 500, `La grille ne s’est pas déplacée vers l’heure actuelle : ${initialScroll}`);

  const weeklyGeometry = await page.evaluate(() => {
    const grid = document.querySelector(".day-columns")?.getBoundingClientRect();
    const line = document.querySelector(".now-line")?.getBoundingClientRect();
    return {
      dayCount: document.querySelectorAll(".time-day-column").length,
      parentIsGrid: document.querySelector(".now-line")?.parentElement?.classList.contains("day-columns"),
      gridLeft: grid?.left,
      gridRight: grid?.right,
      lineLeft: line?.left,
      lineRight: line?.right
    };
  });
  assert.equal(weeklyGeometry.dayCount, 7);
  assert.equal(weeklyGeometry.parentIsGrid, true);
  assert.ok(Math.abs(weeklyGeometry.lineLeft - weeklyGeometry.gridLeft) < 1);
  assert.ok(Math.abs(weeklyGeometry.lineRight - weeklyGeometry.gridRight) < 1);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  // Le minuteur est aligné sur la prochaine minute : 14:37:20 + 45 s
  // doit rafraîchir l'indicateur à 14:38 sans interaction utilisateur.
  await page.clock.runFor(45_000);
  await page.waitForFunction(() =>
    document.querySelector(".now-line time")?.textContent?.trim() === "14:38"
  );
  const updatedTop = await indicator.evaluate((element) =>
    Number.parseFloat(element.style.top)
  );
  const expectedUpdatedTop = (14 + 38 / 60 - firstVisibleHour) * hourHeight;
  assert.ok(
    Math.abs(updatedTop - expectedUpdatedTop) < 0.1,
    `Position actualisée incorrecte : attendu ${expectedUpdatedTop}, reçu ${updatedTop}`
  );

  await page.getByRole("button", { name: "Période suivante" }).click();
  assert.equal(await indicator.count(), 0);
  await page.getByRole("button", { name: "Aujourd’hui", exact: true }).click();
  assert.equal(await indicator.count(), 1);

  await page.getByRole("button", { name: "Jour", exact: true }).click();
  assert.equal(await indicator.count(), 1);
  const dailyGeometry = await page.evaluate(() => {
    const grid = document.querySelector(".day-columns")?.getBoundingClientRect();
    const line = document.querySelector(".now-line")?.getBoundingClientRect();
    return {
      dayCount: document.querySelectorAll(".time-day-column").length,
      gridLeft: grid?.left,
      gridRight: grid?.right,
      lineLeft: line?.left,
      lineRight: line?.right
    };
  });
  assert.equal(dailyGeometry.dayCount, 1);
  assert.ok(Math.abs(dailyGeometry.lineLeft - dailyGeometry.gridLeft) < 1);
  assert.ok(Math.abs(dailyGeometry.lineRight - dailyGeometry.gridRight) < 1);

  await page.getByRole("button", { name: "Période suivante" }).click();
  assert.equal(await indicator.count(), 0);
  await page.getByRole("button", { name: "Aujourd’hui", exact: true }).click();
  assert.equal(await indicator.count(), 1);

  await page.getByRole("button", { name: "Mois", exact: true }).click();
  assert.equal(await indicator.count(), 0);
  await page.getByRole("button", { name: "Année", exact: true }).click();
  assert.equal(await indicator.count(), 0);

  process.stdout.write(`Indicateur de l’heure actuelle du calendrier validé. Capture : ${screenshotPath}\n`);
} finally {
  await browser.close();
}
