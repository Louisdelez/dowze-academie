import assert from "node:assert/strict";
import { chromium } from "playwright";
import {
  DEFAULT_TEST_ACCOUNT,
  bootstrapAuthenticatedPage,
  loginThroughUi,
  logoutThroughUi,
  registerThroughUi
} from "./browser-auth-helpers.mjs";
import { assertDialogConfinedToWorkspace } from "./browser-layout-helpers.mjs";

const baseUrl = process.env.ETUDE_TEST_URL ?? "http://127.0.0.1:1420";
const screenshotPath = process.env.ETUDE_SCREENSHOT ?? "/tmp/etude-global-notes.png";
const courseScreenshotPath = process.env.ETUDE_COURSE_NOTES_SCREENSHOT ?? "/tmp/etude-course-linked-notes.png";
const legacyTimestamp = "2026-09-10T15:42:00.000Z";
const secondAccount = {
  displayName: "Profil Notes Bêta",
  username: "profil.notes.beta",
  password: "Profil-Notes-Beta-2026!"
};
const legacyNote = {
  id: "analyse-note-rich-ui",
  title: "Fiche énergie mécanique",
  markdown: [
    "# Énergie mécanique",
    "",
    "Une équation inline $E_c = \\frac{1}{2}mv^2$.",
    "",
    "$$",
    "\\eta = \\frac{E_{\\mathrm{utile}}}{E_{\\mathrm{reçue}}}",
    "$$",
    "",
    "- [x] Définition apprise",
    "- [ ] Exemple à revoir",
    "",
    "| Grandeur | Unité |",
    "| --- | --- |",
    "| Énergie | J |",
    "",
    "> La modélisation relie le cours à l'expérience.",
    "",
    "```python",
    "energie = 0.5 * masse * vitesse ** 2",
    "```"
  ].join("\n")
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const page = await context.newPage();
page.on("pageerror", (error) => process.stderr.write(`[pageerror] ${error.stack ?? error.message}\n`));
page.on("console", (message) => {
  if (message.type() === "error") process.stderr.write(`[console] ${message.text()}\n`);
});

function workspaceTabs() {
  return page.getByRole("tablist", { name: "Pages ouvertes", exact: true });
}

async function expectPageTab(label) {
  const tabs = workspaceTabs();
  await tabs.waitFor();
  const pageTab = tabs.locator(".workspace-tab-frame--page [role='tab']");
  await pageTab.waitFor();
  assert.equal(await pageTab.getAttribute("aria-selected"), "true");
  assert.match((await pageTab.innerText()).trim(), label);
}

async function readNotesStore(storageKey) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), storageKey);
}

async function openNoteLibrary() {
  await page.getByRole("button", { name: "Nouvel onglet de note", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Ouvrir un onglet de note", exact: true });
  await dialog.waitFor();
  return dialog;
}

try {
  const profileA = await bootstrapAuthenticatedPage(page, baseUrl);
  const storageKey = profileA.storage.subjectNotes;

  // Une note de l'ancien carnet par matière doit migrer sans perdre son Markdown.
  await page.evaluate(({ key, timestamp, note }) => {
    localStorage.setItem(key, JSON.stringify({
      schemaVersion: 1,
      documents: [{
        id: note.id,
        subjectId: "analyse",
        title: note.title,
        markdown: note.markdown,
        createdAt: timestamp,
        updatedAt: timestamp
      }],
      activeDocumentBySubject: { analyse: note.id }
    }));
  }, { key: storageKey, timestamp: legacyTimestamp, note: legacyNote });
  await page.reload();

  const titleInput = page.getByRole("textbox", { name: "Titre de la note", exact: true });
  await titleInput.waitFor();
  assert.equal(await titleInput.inputValue(), legacyNote.title);
  await page.waitForFunction(({ key, noteId }) => {
    const value = JSON.parse(localStorage.getItem(key) ?? "null");
    const note = value?.documents?.find((entry) => entry.id === noteId);
    return value?.schemaVersion === 2 &&
      value?.activeDocumentId === noteId &&
      value?.openDocumentIds?.filter((id) => id === noteId).length === 1 &&
      note?.subjectIds?.length === 1 &&
      note.subjectIds[0] === "analyse" &&
      Array.isArray(note.tags) && note.tags.length === 0;
  }, { key: storageKey, noteId: legacyNote.id });

  const tabs = workspaceTabs();
  await tabs.waitFor();
  assert.equal(
    await tabs.getByRole("tab", { name: legacyNote.title, exact: true }).getAttribute("aria-selected"),
    "true"
  );
  assert.equal(await tabs.locator("[role='tab']").count(), 2);

  // La barre reste globale et chaque navigation réactive la page Dowze Academie permanente.
  await tabs.locator(".workspace-tab-frame--page [role='tab']").click();
  await expectPageTab(/^Accueil$/u);
  const destinations = [
    { nav: "Planning", tab: /^Planning$/u },
    { nav: "Cours", tab: /^(Cours|Analyse)$/u },
    { nav: "Notes & évaluations", tab: /^Notes & évaluations$/u },
    { nav: "À faire", tab: /^À faire$/u },
    { nav: "Réglages", tab: /^Réglages$/u },
    { nav: "Accueil", tab: /^Accueil$/u }
  ];
  for (const destination of destinations) {
    await page.getByLabel(destination.nav, { exact: true }).click();
    await expectPageTab(destination.tab);
    assert.equal(
      await workspaceTabs().getByRole("tab", { name: legacyNote.title, exact: true }).count(),
      1,
      `L'onglet de note doit rester ouvert depuis ${destination.nav}.`
    );
  }

  // La matière expose uniquement un index vers les notes globales, jamais un éditeur imbriqué.
  await page.getByLabel("Cours", { exact: true }).click();
  await page.locator(".course-tabs").waitFor();
  assert.equal(
    await page.locator(".course-tabs").getByRole("tab", { name: /^Notes\b/u }).count(),
    0,
    "Une matière ne doit plus exposer d'onglet Notes."
  );
  assert.equal(await page.locator(".subject-notes-view, .subject-notes-sidebar").count(), 0);
  const analysisNotes = page.getByRole("region", {
    name: "Notes associées à Analyse I & II",
    exact: true
  });
  await analysisNotes.waitFor();
  await analysisNotes.getByText("1 note liée à cette matière", { exact: true }).waitFor();
  await analysisNotes.getByRole("button", {
    name: `Ouvrir la note « ${legacyNote.title} »`,
    exact: true
  }).click();

  // Un clic depuis la rubrique du cours réactive l'onglet global et son éditeur riche.
  assert.equal(
    await workspaceTabs().getByRole("tab", { name: legacyNote.title, exact: true }).getAttribute("aria-selected"),
    "true"
  );
  const editor = page.locator(".markdown-editor-root .ProseMirror.editor[contenteditable='true']");
  await editor.waitFor();
  await page.locator(".markdown-editor-root .katex").first().waitFor();
  assert.equal(await page.locator(".workspace-note-page textarea").count(), 0);
  assert.equal(await editor.count(), 1);
  assert.equal(await page.locator(".markdown-editor-root .milkdown-top-bar").count(), 1);
  assert.ok(await page.locator(".markdown-editor-root .katex").count() >= 1);
  assert.ok(await page.locator(".markdown-editor-root table").count() >= 1);
  assert.ok(await page.locator(".markdown-editor-root .milkdown-list-item-block").count() >= 2);
  assert.equal(await page.locator(".markdown-editor-root .label-wrapper .checked").count(), 1);
  assert.equal(await page.locator(".markdown-editor-root .label-wrapper .unchecked").count(), 1);
  assert.ok(await page.locator(".markdown-editor-root .milkdown-code-block").count() >= 1);
  assert.equal((await editor.innerText()).includes("# Énergie mécanique"), false);
  await page.getByRole("heading", { name: "Énergie mécanique", exact: true }).waitFor();

  await titleInput.fill("Mécanique — fiche complète");
  await editor.press("Control+End");
  await editor.press("Enter");
  await editor.press("Enter");
  await editor.type("Résumé personnel sauvegardé automatiquement.");

  const tagInput = page.getByRole("textbox", { name: "Ajouter un tag", exact: true });
  await tagInput.fill("Examen");
  await tagInput.press("Enter");
  await tagInput.fill("Formules");
  await tagInput.press("Enter");
  await page.getByRole("button", { name: "Retirer le tag « Examen »", exact: true }).waitFor();
  await page.getByRole("button", { name: "Retirer le tag « Formules »", exact: true }).waitFor();

  await page.getByRole("button", { name: /^Modifier les matières de la note,/u }).click();
  const subjectsDialog = page.getByRole("dialog", { name: "Matières associées", exact: true });
  await subjectsDialog.waitFor();
  await assertDialogConfinedToWorkspace(page, subjectsDialog, "Matières associées");
  const analysisOption = subjectsDialog.locator(".global-note-subject-option", {
    hasText: "Analyse I & II"
  });
  const algebraOption = subjectsDialog.locator(".global-note-subject-option", {
    hasText: "Algèbre linéaire I & II"
  });
  const analysisCheckbox = analysisOption.getByRole("checkbox");
  const algebraCheckbox = algebraOption.getByRole("checkbox");
  assert.equal(await analysisCheckbox.isChecked(), true, "La matière historique doit être conservée.");
  assert.equal(await algebraCheckbox.isChecked(), false);
  await algebraOption.click();
  await subjectsDialog.getByText("Chaque choix est enregistré automatiquement.", { exact: true }).waitFor();
  await subjectsDialog.getByRole("button", { name: "Terminé", exact: true }).click();

  await page.waitForFunction(({ key, noteId }) => {
    const value = JSON.parse(localStorage.getItem(key) ?? "null");
    const note = value?.documents?.find((entry) => entry.id === noteId);
    return note?.title === "Mécanique — fiche complète" &&
      note?.markdown?.includes("Résumé personnel sauvegardé automatiquement.") &&
      JSON.stringify(note?.tags) === JSON.stringify(["Examen", "Formules"]) &&
      JSON.stringify(note?.subjectIds) === JSON.stringify(["analyse", "algebre-lineaire"]);
  }, { key: storageKey, noteId: legacyNote.id });
  await page.locator(".workspace-note-save-status", {
    hasText: "Enregistrée automatiquement"
  }).waitFor();

  // Un rechargement restaure le document actif, ses métadonnées et son contenu.
  await page.reload();
  await page.getByRole("textbox", { name: "Titre de la note", exact: true }).waitFor();
  assert.equal(
    await page.getByRole("textbox", { name: "Titre de la note", exact: true }).inputValue(),
    "Mécanique — fiche complète"
  );
  await page.getByRole("button", { name: "Retirer le tag « Examen »", exact: true }).waitFor();
  await page.getByText("Analyse", { exact: true }).waitFor();
  await page.getByText("Algèbre", { exact: true }).waitFor();
  const restoredEditor = page.locator(
    `.markdown-editor-root[data-note-id='${legacyNote.id}'] .ProseMirror.editor[contenteditable='true']`
  );
  await restoredEditor.waitFor();
  await page.waitForFunction((noteId) => document
    .querySelector(`.markdown-editor-root[data-note-id='${noteId}'] .ProseMirror.editor[contenteditable='true']`)
    ?.textContent?.includes("Résumé personnel sauvegardé automatiquement."), legacyNote.id);

  // Une note multi-matières apparaît dans chaque cours associé et ouvre toujours le même onglet global.
  await page.getByLabel("Cours", { exact: true }).click();
  await page.locator(".subject-list").getByRole("button", { name: /^Algèbre linéaire I & II/u }).click();
  const algebraNotes = page.getByRole("region", {
    name: "Notes associées à Algèbre linéaire I & II",
    exact: true
  });
  await algebraNotes.waitFor();
  await algebraNotes.getByText("1 note liée à cette matière", { exact: true }).waitFor();
  await page.screenshot({ path: courseScreenshotPath, fullPage: true });
  await algebraNotes.getByRole("button", {
    name: "Ouvrir la note « Mécanique — fiche complète »",
    exact: true
  }).click();
  assert.equal(
    await workspaceTabs().getByRole("tab", { name: "Mécanique — fiche complète", exact: true }).count(),
    1
  );

  // Une matière sans association affiche néanmoins sa rubrique et un état vide explicite.
  await page.getByLabel("Cours", { exact: true }).click();
  await page.locator(".subject-list").getByRole("button", { name: /^Physique générale I — Mécanique/u }).click();
  const mechanicsNotes = page.getByRole("region", {
    name: "Notes associées à Physique générale I — Mécanique",
    exact: true
  });
  await mechanicsNotes.waitFor();
  await mechanicsNotes.getByText("Aucune note associée.", { exact: true }).waitFor();

  // Ouvrir une note déjà ouverte ne crée jamais de doublon d'onglet.
  let library = await openNoteLibrary();
  await assertDialogConfinedToWorkspace(page, library, "Ouvrir un onglet de note");
  await library.getByRole("button", {
    name: "Ouvrir la note « Mécanique — fiche complète »",
    exact: true
  }).click();
  await library.waitFor({ state: "detached" });
  assert.equal(
    await workspaceTabs().getByRole("tab", { name: "Mécanique — fiche complète", exact: true }).count(),
    1
  );

  // Le bouton + sait aussi créer une page vierge indépendante de toute matière.
  library = await openNoteLibrary();
  await library.getByRole("button", { name: /^Nouvelle note\b/u }).click();
  await library.waitFor({ state: "detached" });
  const newTitleInput = page.getByRole("textbox", { name: "Titre de la note", exact: true });
  await newTitleInput.waitFor();
  assert.equal(await newTitleInput.inputValue(), "Sans titre");
  await newTitleInput.fill("Questions pour le professeur IA");
  const secondEditor = page.locator(".markdown-editor-root .ProseMirror.editor[contenteditable='true']");
  await secondEditor.waitFor();
  await secondEditor.fill("Pourquoi l'énergie se conserve-t-elle ?");
  await newTitleInput.focus();
  await page.waitForFunction(({ key }) => {
    const value = JSON.parse(localStorage.getItem(key) ?? "null");
    const note = value?.documents?.find((entry) => entry.title === "Questions pour le professeur IA");
    return note?.markdown?.includes("Pourquoi l'énergie se conserve-t-elle ?") &&
      note?.subjectIds?.length === 0 && note?.tags?.length === 0;
  }, { key: storageKey });

  let store = await readNotesStore(storageKey);
  const secondNote = store.documents.find((note) => note.title === "Questions pour le professeur IA");
  assert.ok(secondNote, "La nouvelle note doit être persistée.");
  assert.equal(store.openDocumentIds.length, 2);
  assert.equal(store.activeDocumentId, secondNote.id);

  // Revenir à la page n'efface pas les onglets de notes.
  await workspaceTabs().locator(".workspace-tab-frame--page [role='tab']").click();
  assert.equal(await workspaceTabs().locator("[role='tab']").count(), 3);
  assert.equal((await readNotesStore(storageKey)).activeDocumentId, null);

  // Fermer un onglet ne supprime jamais son document; la bibliothèque peut le rouvrir.
  await workspaceTabs().getByRole("tab", {
    name: "Questions pour le professeur IA",
    exact: true
  }).click();
  await page.getByRole("button", {
    name: "Fermer la note « Questions pour le professeur IA »",
    exact: true
  }).click();
  await page.waitForFunction(({ key, noteId }) => {
    const value = JSON.parse(localStorage.getItem(key) ?? "null");
    return value?.documents?.some((note) => note.id === noteId) &&
      !value?.openDocumentIds?.includes(noteId);
  }, { key: storageKey, noteId: secondNote.id });
  assert.equal(
    await workspaceTabs().getByRole("tab", { name: "Questions pour le professeur IA", exact: true }).count(),
    0
  );

  library = await openNoteLibrary();
  await library.getByRole("button", {
    name: "Ouvrir la note « Questions pour le professeur IA »",
    exact: true
  }).click();
  await library.waitFor({ state: "detached" });
  assert.equal(
    await workspaceTabs().getByRole("tab", { name: "Questions pour le professeur IA", exact: true }).count(),
    1
  );
  await page.getByRole("textbox", { name: "Titre de la note", exact: true }).waitFor();

  // La confirmation de suppression respecte elle aussi les limites de la zone centrale.
  await page.getByRole("button", { name: /Supprimer la note/u }).click();
  const deleteDialog = page.getByRole("dialog", { name: "Supprimer cette note Markdown ?", exact: true });
  await deleteDialog.waitFor();
  await assertDialogConfinedToWorkspace(page, deleteDialog, "Supprimer cette note Markdown ?");
  await deleteDialog.getByRole("button", { name: "Annuler", exact: true }).click();
  await deleteDialog.waitFor({ state: "detached" });

  // Les onglets restent contenus dans la zone centrale à la largeur minimale supportée.
  await page.setViewportSize({ width: 1120, height: 760 });
  const compactLibrary = await openNoteLibrary();
  await assertDialogConfinedToWorkspace(page, compactLibrary, "Ouvrir un onglet de note");
  await compactLibrary.getByRole("button", {
    name: "Fermer « Ouvrir un onglet de note »",
    exact: true
  }).click();
  await compactLibrary.waitFor({ state: "detached" });
  const geometry = await page.evaluate(() => {
    const shell = document.querySelector(".workspace-tabs-shell")?.getBoundingClientRect();
    const workspace = document.querySelector(".main-workspace")?.getBoundingClientRect();
    return {
      shell: shell ? { left: shell.left, right: shell.right, width: shell.width } : null,
      workspace: workspace ? { left: workspace.left, right: workspace.right, width: workspace.width } : null,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth
    };
  });
  assert.ok(geometry.shell && geometry.workspace);
  assert.ok(geometry.shell.left >= geometry.workspace.left - 1);
  assert.ok(geometry.shell.right <= geometry.workspace.right + 1);
  assert.ok(geometry.documentWidth <= geometry.viewportWidth);
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.screenshot({ path: screenshotPath, fullPage: true });

  // Une autre identité locale ne voit aucune des notes du premier profil.
  await logoutThroughUi(page);
  const profileB = await registerThroughUi(page, secondAccount);
  assert.notEqual(profileA.storage.subjectNotes, profileB.storage.subjectNotes);
  assert.equal(await workspaceTabs().locator(".workspace-tab-frame--note").count(), 0);
  library = await openNoteLibrary();
  await library.getByText("0 notes enregistrées", { exact: true }).waitFor();
  assert.equal(
    await library.getByRole("button", { name: /Mécanique — fiche complète/u }).count(),
    0
  );
  await library.getByRole("button", { name: "Fermer « Ouvrir un onglet de note »", exact: true }).click();

  await logoutThroughUi(page);
  await loginThroughUi(page, DEFAULT_TEST_ACCOUNT);
  library = await openNoteLibrary();
  await library.getByRole("button", {
    name: "Ouvrir la note « Mécanique — fiche complète »",
    exact: true
  }).waitFor();
  await library.getByRole("button", {
    name: "Ouvrir la note « Questions pour le professeur IA »",
    exact: true
  }).waitFor();

  store = await readNotesStore(profileA.storage.subjectNotes);
  assert.equal(store.schemaVersion, 2);
  assert.equal(store.documents.length, 2);

  process.stdout.write(
    `Notes globales validées : migration, onglets, autosauvegarde, classement, réouverture et profils isolés. Captures : ${screenshotPath}, ${courseScreenshotPath}\n`
  );
} finally {
  await browser.close();
}
