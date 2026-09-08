import assert from "node:assert/strict";
import { chromium } from "playwright";
import { bootstrapAuthenticatedPage } from "./browser-auth-helpers.mjs";

const baseUrl = process.env.ETUDE_TEST_URL ?? "http://127.0.0.1:1420";
const screenshotPath =
  process.env.ETUDE_GENERATED_IMAGES_SCREENSHOT ?? "/tmp/etude-generated-images.png";

const viewports = [
  { width: 1440, height: 950 },
  { width: 1120, height: 760 }
];

const browser = await chromium.launch({ headless: true });

async function assertDecorativeImage(page, imageSelector, cardSelector, label) {
  const image = page.locator(imageSelector);
  await image.waitFor({ state: "visible" });

  assert.equal(
    await image.getAttribute("alt"),
    "",
    `${label} doit avoir un texte alternatif vide, car elle est décorative.`
  );

  const state = await image.evaluate((element) => ({
    complete: element.complete,
    naturalWidth: element.naturalWidth,
    naturalHeight: element.naturalHeight
  }));
  assert.equal(state.complete, true, `${label} doit avoir fini de charger.`);
  assert.ok(state.naturalWidth > 0, `${label} doit exposer une largeur naturelle non nulle.`);
  assert.ok(state.naturalHeight > 0, `${label} doit exposer une hauteur naturelle non nulle.`);

  const geometry = await page.locator(cardSelector).evaluate((card, selector) => {
    const imageElement = document.querySelector(selector);
    if (!(imageElement instanceof HTMLImageElement)) return null;
    const imageRect = imageElement.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    return {
      image: {
        top: imageRect.top,
        right: imageRect.right,
        bottom: imageRect.bottom,
        left: imageRect.left
      },
      card: {
        top: cardRect.top,
        right: cardRect.right,
        bottom: cardRect.bottom,
        left: cardRect.left
      }
    };
  }, imageSelector);

  assert.ok(geometry, `${label} doit être présente dans sa carte.`);
  const tolerance = 1;
  assert.ok(
    geometry.image.left >= geometry.card.left - tolerance &&
      geometry.image.right <= geometry.card.right + tolerance &&
      geometry.image.top >= geometry.card.top - tolerance &&
      geometry.image.bottom <= geometry.card.bottom + tolerance,
    `${label} ne doit pas déborder de sa carte. ` +
      `Image=${JSON.stringify(geometry.image)}, carte=${JSON.stringify(geometry.card)}`
  );
}

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();

    await bootstrapAuthenticatedPage(page, baseUrl);

    await assertDecorativeImage(
      page,
      ".academic-banner-art",
      ".academic-banner",
      `L’illustration d’accueil à ${viewport.width}×${viewport.height}`
    );

    await page.getByRole("button", { name: "Cours", exact: true }).click();
    await page.getByText("Ton professeur IA", { exact: true }).waitFor();
    await assertDecorativeImage(
      page,
      ".ai-teacher-art img",
      ".ai-teacher-card",
      `L’illustration du professeur IA à ${viewport.width}×${viewport.height}`
    );

    await page.getByLabel("Planning", { exact: true }).click();
    await page.getByRole("button", { name: "Envoyer vers un agenda", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Envoyer le planning" });
    await dialog.waitFor();
    await assertDecorativeImage(
      page,
      ".calendar-export-summary-art img",
      ".calendar-export-summary",
      `L’illustration de synchronisation à ${viewport.width}×${viewport.height}`
    );

    if (viewport.width === viewports[0].width) {
      await page.screenshot({ path: screenshotPath });
    }

    await context.close();
  }

  process.stdout.write(
    `Illustrations générées validées à 1440×950 et 1120×760. Capture : ${screenshotPath}\n`
  );
} finally {
  await browser.close();
}
