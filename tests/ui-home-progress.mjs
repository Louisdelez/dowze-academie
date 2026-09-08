import assert from "node:assert/strict";
import { chromium } from "playwright";
import { bootstrapAuthenticatedPage } from "./browser-auth-helpers.mjs";

const baseUrl = process.env.ETUDE_TEST_URL ?? "http://127.0.0.1:1420";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1120, height: 760 } });
const page = await context.newPage();

try {
  await page.clock.install({ time: new Date("2026-09-07T07:06:00.000Z") });
  await bootstrapAuthenticatedPage(page, baseUrl);

  const ring = page.locator(".progress-ring");
  await ring.waitFor();

  const beforeScroll = await ring.evaluate((element) => {
    const ringRect = element.getBoundingClientRect();
    const labelRect = element.firstElementChild?.getBoundingClientRect();
    const pseudo = getComputedStyle(element, "::before");
    return {
      pseudoContent: pseudo.content,
      ringCenterX: ringRect.left + ringRect.width / 2,
      ringCenterY: ringRect.top + ringRect.height / 2,
      labelCenterX: labelRect ? labelRect.left + labelRect.width / 2 : null,
      labelCenterY: labelRect ? labelRect.top + labelRect.height / 2 : null
    };
  });

  assert.ok(
    beforeScroll.pseudoContent === "none" || beforeScroll.pseudoContent === "normal",
    "L’indicateur hebdomadaire ne doit générer aucun disque blanc décoratif."
  );
  assert.ok(beforeScroll.labelCenterX !== null && beforeScroll.labelCenterY !== null);
  assert.ok(Math.abs(beforeScroll.ringCenterX - beforeScroll.labelCenterX) < 1);
  assert.ok(Math.abs(beforeScroll.ringCenterY - beforeScroll.labelCenterY) < 1);

  await page.locator(".home-page").evaluate((element) => { element.scrollTop = 240; });

  const afterScroll = await ring.evaluate((element) => {
    const ringRect = element.getBoundingClientRect();
    const labelRect = element.firstElementChild?.getBoundingClientRect();
    return {
      ringCenterX: ringRect.left + ringRect.width / 2,
      ringCenterY: ringRect.top + ringRect.height / 2,
      labelCenterX: labelRect ? labelRect.left + labelRect.width / 2 : null,
      labelCenterY: labelRect ? labelRect.top + labelRect.height / 2 : null
    };
  });

  assert.ok(afterScroll.labelCenterX !== null && afterScroll.labelCenterY !== null);
  assert.ok(Math.abs(afterScroll.ringCenterX - afterScroll.labelCenterX) < 1);
  assert.ok(Math.abs(afterScroll.ringCenterY - afterScroll.labelCenterY) < 1);
  process.stdout.write("Accueil : indicateur hebdomadaire sans disque blanc parasite, avant et après défilement.\n");
} finally {
  await context.close();
  await browser.close();
}
