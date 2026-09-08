import assert from "node:assert/strict";
import { chromium } from "playwright";
import { bootstrapAuthenticatedPage } from "./browser-auth-helpers.mjs";
import { assertDialogConfinedToWorkspace } from "./browser-layout-helpers.mjs";

const baseUrl = process.env.ETUDE_TEST_URL ?? "http://127.0.0.1:1420";
const screenshotPath = process.env.ETUDE_FREE_CHAT_SCREENSHOT ?? "/tmp/etude-chat-libre.png";
let conversationStorageKey;
let activeStorageKey;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1480, height: 980 } });
const page = await context.newPage();

async function selectProvider(current, next) {
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

async function storedConversations() {
  return page.evaluate((storageKey) => {
    return JSON.parse(localStorage.getItem(storageKey) ?? "[]");
  }, conversationStorageKey);
}

async function waitForStoredConversation({ contextKey, backend, message }) {
  await page.waitForFunction(
    ({ storageKey, expectedContextKey, expectedBackend, expectedMessage }) => {
      const conversations = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
      return conversations.some((conversation) =>
        conversation.contextKey === expectedContextKey &&
        conversation.backend === expectedBackend &&
        (!expectedMessage || conversation.messages.some((item) => item.content === expectedMessage))
      );
    },
    {
      storageKey: conversationStorageKey,
      expectedContextKey: contextKey,
      expectedBackend: backend,
      expectedMessage: message
    }
  );
}

async function waitForActiveConversation(expectedId) {
  await page.waitForFunction(
    ({ storageKey, id }) => JSON.parse(localStorage.getItem(storageKey) ?? "null") === id,
    { storageKey: activeStorageKey, id: expectedId }
  );
}

async function openBackendSettings() {
  await page.locator(".free-chat-backend").click();
  const settings = page.getByRole("dialog", { name: "Réglages du Chat libre" });
  await settings.waitFor();
  return settings;
}

async function changeBackend(next) {
  const settings = await openBackendSettings();
  await settings.getByLabel("Fournisseur").selectOption(next);
  await settings.getByRole("button", { name: "Fermer les réglages" }).click();
  await page.getByRole("heading", { name: "Une conversation vraiment libre" }).waitFor();
  await page.getByRole("button", { name: "Utiliser le contexte du cours" }).click();
}

async function sendMessage(content) {
  const transcriptMessage = page.locator(".free-chat-message.is-user").filter({ hasText: content });
  await page.getByLabel("Message du Chat libre").fill(content);
  await page.getByRole("button", { name: "Envoyer le message" }).click();
  // Dans le navigateur de test, la requête native est volontairement refusée.
  // Un message non remis doit être retiré du transcript et restauré dans le brouillon.
  await page.getByText(
    "Le Chat libre utilise le moteur sécurisé de l’application macOS.",
    { exact: true }
  ).waitFor();
  assert.equal(await transcriptMessage.count(), 0);
  assert.equal(await page.getByLabel("Message du Chat libre").inputValue(), content);
  await page.getByLabel("Message du Chat libre").fill("");
}

try {
  const { storage } = await bootstrapAuthenticatedPage(page, baseUrl);
  conversationStorageKey = storage.freeChatConversations;
  activeStorageKey = storage.freeChatActiveConversation;
  await page.getByRole("button", { name: "Cours", exact: true }).click();
  await selectProvider("ChatGPT", "Chat libre");

  await page.getByRole("heading", { name: "Une conversation vraiment libre" }).waitFor();
  assert.equal(await page.locator(".free-chat").count(), 1);
  assert.equal(await page.locator(".browser-ai-preview").count(), 0);

  const initialSettings = await openBackendSettings();
  assert.equal(await initialSettings.getByLabel("Fournisseur").inputValue(), "ollama");
  assert.equal(
    await initialSettings.getByLabel("Adresse locale Ollama").inputValue(),
    "http://127.0.0.1:11434"
  );
  await initialSettings.getByLabel("Modèle").fill("qwen3:8b");

  // Une clé en brouillon ne doit jamais suivre un changement de fournisseur
  // ou d’origine compatible avant son enregistrement dans le trousseau.
  await initialSettings.getByLabel("Fournisseur").selectOption("openai");
  await initialSettings.getByPlaceholder("Coller une nouvelle clé API").fill("sk-openai-brouillon-test");
  await initialSettings.getByLabel("Fournisseur").selectOption("mistral");
  assert.equal(await initialSettings.getByPlaceholder("Coller une nouvelle clé API").inputValue(), "");
  await initialSettings.getByLabel("Fournisseur").selectOption("compatible");
  await initialSettings.getByLabel("Endpoint HTTPS compatible OpenAI")
    .fill("https://api.example.com/v1/chat/completions");
  await initialSettings.getByPlaceholder("Coller une nouvelle clé API").fill("cle-compatible-brouillon-test");
  await initialSettings.getByLabel("Endpoint HTTPS compatible OpenAI")
    .fill("https://autre.example.com/v1/chat/completions");
  assert.equal(await initialSettings.getByPlaceholder("Coller une nouvelle clé API").inputValue(), "");
  await initialSettings.getByLabel("Fournisseur").selectOption("ollama");
  await initialSettings.getByRole("button", { name: "Fermer les réglages" }).click();

  const lesson = "Ensembles, appartenance et opérations";
  const courseContextKey = "analyse:analyse-s1:analyse-s1-1:analyse-s1-1-lesson-1:course";
  const exerciseContextKey = "analyse:analyse-s1:analyse-s1-1:analyse-s1-1-lesson-1:exercises";
  const courseMessage = "Explique-moi simplement la différence entre appartenance et inclusion.";
  const exerciseMessage = "Propose-moi un exercice sur l’appartenance et l’inclusion.";
  const openAiMessage = "Reprenons ce cours avec le backend OpenAI sans perdre la séance Ollama.";

  await page.getByRole("button", { name: `Commencer le cours : ${lesson}` }).click();
  await page.getByText(`Chat libre · Cours · ${lesson}`, { exact: true }).waitFor();
  await page.getByText("Contexte du cours activé", { exact: true }).waitFor();
  await waitForStoredConversation({ contextKey: courseContextKey, backend: "ollama" });

  let conversations = await storedConversations();
  const ollamaCourse = conversations.find((item) =>
    item.contextKey === courseContextKey && item.backend === "ollama"
  );
  assert.ok(ollamaCourse, "la conversation de cours Ollama doit être créée");
  assert.equal(ollamaCourse.messages[0]?.role, "system");
  assert.match(ollamaCourse.messages[0]?.content ?? "", /# PROFESSEUR IA — MODE COURS/);

  await sendMessage(courseMessage);
  await waitForStoredConversation({ contextKey: courseContextKey, backend: "ollama" });

  // La conversation locale doit apparaître dans l’historique central de la matière.
  await page.getByRole("tab", { name: /Historique IA/ }).click();
  const centralHistory = page.locator(".history-view");
  const initialCourseCard = centralHistory.locator(".conversation-card")
    .filter({ hasText: `Cours · ${lesson}` });
  await initialCourseCard.waitFor();
  assert.equal(await initialCourseCard.count(), 1);
  assert.equal(
    await initialCourseCard.getByRole("button", { name: "Copier le lien" }).count(),
    0,
    "une conversation locale ne doit jamais proposer de copier un lien externe"
  );

  // Le même éditeur central doit pouvoir enrichir le Chat libre d’un nom et d’une note.
  const customName = "Cours — Ensembles fondamentaux";
  const customNote = "À reprendre : bien distinguer ∈ et ⊂ avant les exercices.";
  await initialCourseCard.getByRole("button", { name: "Modifier" }).click();
  const editor = page.getByRole("dialog", { name: "Détails de la conversation" });
  await assertDialogConfinedToWorkspace(page, editor, "La fenêtre Détails de la conversation");
  await editor.getByLabel(/Nom personnalisé/).fill(customName);
  await editor.getByLabel(/Note/).fill(customNote);
  assert.equal(
    await editor.getByText("Conversation enregistrée localement dans Dowze Academie, sans lien externe.").count(),
    1
  );
  assert.equal(await editor.getByLabel("Lien enregistré").count(), 0);
  await editor.getByRole("button", { name: "Enregistrer" }).click();

  const renamedCourseCard = centralHistory.locator(".conversation-card").filter({ hasText: customName });
  await renamedCourseCard.getByText(customNote, { exact: true }).waitFor();
  conversations = await storedConversations();
  const renamedOllamaCourse = conversations.find((item) => item.id === ollamaCourse.id);
  assert.equal(renamedOllamaCourse?.name, customName);
  assert.equal(renamedOllamaCourse?.note, customNote);
  assert.equal(await renamedCourseCard.getByRole("button", { name: "Copier le lien" }).count(), 0);

  await renamedCourseCard.getByRole("button", { name: "Supprimer", exact: true }).click();
  const deleteConversationDialog = page.getByRole("dialog", {
    name: "Supprimer cette conversation ?"
  });
  await assertDialogConfinedToWorkspace(
    page,
    deleteConversationDialog,
    "La confirmation de suppression de conversation"
  );
  await deleteConversationDialog.getByRole("button", { name: "Annuler", exact: true }).click();
  await deleteConversationDialog.waitFor({ state: "detached" });

  // Réouvrir depuis l’historique central doit viser l’ID local et restaurer le transcript.
  await renamedCourseCard.locator(".conversation-main").click();
  await waitForActiveConversation(ollamaCourse.id);
  await page.getByText(`Chat libre · Cours · ${lesson}`, { exact: true }).waitFor();
  assert.equal(await page.getByText(courseMessage, { exact: true }).count(), 0);

  // Le même cours doit avoir une conversation d’exercices totalement distincte.
  await page.getByRole("tab", { name: /Programme annuel/ }).click();
  await page.getByRole("button", { name: `Faire les exercices : ${lesson}` }).click();
  await page.getByText(`Chat libre · Exercices · ${lesson}`, { exact: true }).waitFor();
  await waitForStoredConversation({ contextKey: exerciseContextKey, backend: "ollama" });
  await sendMessage(exerciseMessage);
  await waitForStoredConversation({ contextKey: exerciseContextKey, backend: "ollama" });

  conversations = await storedConversations();
  const ollamaExercises = conversations.find((item) =>
    item.contextKey === exerciseContextKey && item.backend === "ollama"
  );
  assert.ok(ollamaExercises, "la conversation d’exercices Ollama doit être créée");
  assert.notEqual(ollamaExercises.id, ollamaCourse.id);
  assert.match(ollamaExercises.messages[0]?.content ?? "", /# PROFESSEUR IA — MODE EXERCICES/);
  assert.equal(
    ollamaExercises.messages.some((message) => message.content === courseMessage),
    false,
    "le transcript d’exercices ne doit pas absorber celui du cours"
  );

  await page.getByRole("button", { name: `Reprendre le cours : ${lesson}` }).click();
  await waitForActiveConversation(ollamaCourse.id);
  assert.equal(await page.getByText(courseMessage, { exact: true }).count(), 0);
  assert.equal(await page.getByText(exerciseMessage, { exact: true }).count(), 0);

  // Changer de backend crée une branche propre au même contexte sans écraser Ollama.
  await changeBackend("openai");
  await waitForStoredConversation({ contextKey: courseContextKey, backend: "openai" });
  conversations = await storedConversations();
  const openAiCourse = conversations.find((item) =>
    item.contextKey === courseContextKey && item.backend === "openai"
  );
  assert.ok(openAiCourse, "une branche OpenAI du cours doit être créée");
  assert.notEqual(openAiCourse.id, ollamaCourse.id);
  assert.equal(openAiCourse.model, "gpt-5.4");

  await sendMessage(openAiMessage);
  await waitForStoredConversation({ contextKey: courseContextKey, backend: "openai" });

  // Aller-retour entre les backends : chaque conversation et chaque message restent intacts.
  await changeBackend("ollama");
  await waitForActiveConversation(ollamaCourse.id);
  assert.equal(await page.getByText(courseMessage, { exact: true }).count(), 0);
  assert.equal(await page.getByText(openAiMessage, { exact: true }).count(), 0);

  await changeBackend("openai");
  await waitForActiveConversation(openAiCourse.id);
  assert.equal(await page.getByText(openAiMessage, { exact: true }).count(), 0);
  assert.equal(await page.getByText(courseMessage, { exact: true }).count(), 0);

  conversations = await storedConversations();
  assert.equal(conversations.length, 3, "cours Ollama, exercices Ollama et cours OpenAI doivent coexister");
  assert.equal(
    conversations.find((item) => item.id === ollamaCourse.id)?.messages.some((item) => item.content === courseMessage),
    false
  );
  assert.equal(
    conversations.find((item) => item.id === ollamaExercises.id)?.messages.some((item) => item.content === exerciseMessage),
    false
  );
  assert.equal(
    conversations.find((item) => item.id === openAiCourse.id)?.messages.some((item) => item.content === openAiMessage),
    false
  );

  // Les trois entrées doivent finalement être indexées dans l’historique central du cours.
  await page.getByRole("tab", { name: /Historique IA/ }).click();
  await page.waitForFunction(() => document.querySelectorAll(".history-view .conversation-card").length === 3);
  const finalCards = page.locator(".history-view .conversation-card");
  assert.equal(await finalCards.count(), 3);
  for (const card of await finalCards.all()) {
    assert.equal(await card.getByRole("button", { name: "Copier le lien" }).count(), 0);
  }
  await page.getByPlaceholder("Rechercher dans les noms et notes").fill("distinguer ∈");
  assert.equal(await page.locator(".history-view .conversation-card").count(), 1);
  await page.getByText(customName, { exact: true }).waitFor();

  await page.screenshot({ path: screenshotPath, fullPage: true });
  process.stdout.write(`Parcours Chat libre et historique central validés. Capture : ${screenshotPath}\n`);
} finally {
  await browser.close();
}
