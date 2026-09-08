import assert from "node:assert/strict";
import { chromium } from "playwright";
import {
  currentProfile,
  loginThroughUi,
  logoutThroughUi,
  registerThroughUi
} from "./browser-auth-helpers.mjs";

const baseUrl = process.env.ETUDE_TEST_URL ?? "http://127.0.0.1:1420";
const account = {
  displayName: "Louis Auth",
  username: "Louis.Auth",
  password: "Compte-Local-2026!"
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
let page = await context.newPage();

try {
  await page.goto(baseUrl);
  await page.evaluate(async () => {
    const { WORKSPACE_STORAGE } = await import("/src/lib/profileStorage.ts");
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(WORKSPACE_STORAGE.subjects, JSON.stringify([{ id: "progression-de-test" }]));
    localStorage.setItem("etude.tasks.v1", JSON.stringify([{ id: "tache-de-test" }]));
    localStorage.setItem(`${WORKSPACE_STORAGE.freeChatConversations}.recovery`, "conversation-de-test");
  });
  await page.reload();
  await page.getByRole("heading", { name: "Créer ton compte", exact: true }).waitFor();
  assert.equal(await page.getByText("Repartir de zéro aujourd’hui", { exact: true }).count(), 0);
  assert.equal(await page.getByText("Reprendre mes données actuelles", { exact: true }).count(), 0);
  assert.equal(await page.locator(".auth-story").count(), 0);
  assert.equal(
    await page.getByRole("checkbox", { name: "Se souvenir de moi", exact: true }).count(),
    0,
    "La mémorisation doit être proposée uniquement sur Login."
  );
  assert.deepEqual(
    await page.evaluate(async () => {
      const { WORKSPACE_STORAGE } = await import("/src/lib/profileStorage.ts");
      return [
        localStorage.getItem(WORKSPACE_STORAGE.subjects),
        localStorage.getItem("etude.tasks.v1"),
        localStorage.getItem(`${WORKSPACE_STORAGE.freeChatConversations}.recovery`)
      ];
    }),
    [null, null, null],
    "Les données de développement doivent être supprimées avant le Register."
  );
  await page.getByText("Local, sans cloud", { exact: true }).waitFor();
  await page.getByText(
    "Ce compte fonctionne uniquement sur cet appareil. Il ne synchronise aucune donnée en ligne.",
    { exact: true }
  ).waitFor();
  assert.equal(await page.locator(".app-shell").count(), 0, "L’espace d’étude ne doit pas être monté avant connexion.");
  assert.equal(
    await page.getByLabel(/^Identifiant/).evaluate((element) => element === document.activeElement),
    true,
    "Le premier champ utile doit recevoir le focus."
  );

  await page.getByLabel("Nom affiché", { exact: true }).fill(account.displayName);
  await page.getByLabel(/^Identifiant/).fill(account.username);
  await page.getByLabel("Mot de passe", { exact: true }).fill(account.password);
  await page.getByLabel("Confirmer le mot de passe", { exact: true }).fill("Compte-Local-different!");
  await page.getByRole("button", { name: "Créer le compte", exact: true }).click();
  await page.getByRole("alert").getByText(
    "Les deux mots de passe ne correspondent pas.",
    { exact: true }
  ).waitFor();
  assert.equal(await page.locator(".app-shell").count(), 0);

  const passwordInput = page.getByLabel("Mot de passe", { exact: true });
  assert.equal(await passwordInput.getAttribute("type"), "password");
  await page.getByRole("button", { name: "Afficher le mot de passe", exact: true }).click();
  assert.equal(await passwordInput.getAttribute("type"), "text");
  await page.getByRole("button", { name: "Masquer le mot de passe", exact: true }).click();

  const profile = await registerThroughUi(page, account);
  assert.equal(profile.account.displayName, account.displayName);
  assert.equal(profile.account.username, "louis.auth");
  await page.getByLabel(`Ouvrir le profil local de ${account.displayName}`, { exact: true }).waitFor();

  const persisted = await page.evaluate(async ({ expectedPassword }) => {
    const { LOCAL_AUTH_STORAGE_KEYS } = await import("/src/lib/localAuth.ts");
    const registryRaw = localStorage.getItem(LOCAL_AUTH_STORAGE_KEYS.accounts);
    return {
      registryRaw,
      registry: JSON.parse(registryRaw ?? "null"),
      localSession: localStorage.getItem(LOCAL_AUTH_STORAGE_KEYS.session),
      rememberedSession: localStorage.getItem(LOCAL_AUTH_STORAGE_KEYS.rememberedSession),
      tabSession: JSON.parse(sessionStorage.getItem(LOCAL_AUTH_STORAGE_KEYS.session) ?? "null"),
      passwordLeaked: [localStorage, sessionStorage].some((storage) =>
        [...Array(storage.length)].some((_, index) =>
          storage.getItem(storage.key(index) ?? "")?.includes(expectedPassword)
        )
      )
    };
  }, { expectedPassword: account.password });
  assert.equal(persisted.registry.version, 1);
  assert.equal(persisted.registry.accounts.length, 1);
  assert.equal(persisted.registry.accounts[0].username, "louis.auth");
  assert.match(persisted.registry.accounts[0].passwordSalt, /^[0-9a-f]{32}$/);
  assert.match(persisted.registry.accounts[0].passwordVerifier, /^[0-9a-f]{64}$/);
  assert.equal("password" in persisted.registry.accounts[0], false);
  assert.equal(persisted.registryRaw.includes(account.password), false);
  assert.equal(persisted.passwordLeaked, false);
  assert.equal(persisted.localSession, null, "La session ne doit pas devenir une connexion permanente en localStorage.");
  assert.equal(persisted.rememberedSession, null, "Register doit rester une session temporaire.");
  assert.equal(persisted.tabSession.accountId, profile.account.id);

  await page.reload();
  assert.equal((await currentProfile(page)).account.id, profile.account.id);
  await page.getByRole("heading", { name: /, Louis Auth$/ }).waitFor();

  await logoutThroughUi(page);
  assert.equal(await page.locator(".app-shell").count(), 0);
  assert.equal(
    await page.evaluate(async () => {
      const { LOCAL_AUTH_STORAGE_KEYS } = await import("/src/lib/localAuth.ts");
      return sessionStorage.getItem(LOCAL_AUTH_STORAGE_KEYS.session);
    }),
    null
  );

  const rememberCheckbox = page.getByRole("checkbox", {
    name: "Se souvenir de moi",
    exact: true
  });
  await rememberCheckbox.waitFor();
  assert.equal(await rememberCheckbox.isChecked(), false, "La case doit être décochée par défaut.");
  await page.getByText("Se souvenir de moi sur cet appareil", { exact: true }).waitFor();
  await page.getByText(
    "Prévisualisation : la session de test reste dans ce navigateur.",
    { exact: true }
  ).waitFor();
  await rememberCheckbox.focus();
  await rememberCheckbox.press("Space");
  assert.equal(await rememberCheckbox.isChecked(), true, "La case doit fonctionner au clavier.");

  await page.getByLabel(/^Identifiant/).fill("LOUIS.AUTH");
  await page.getByLabel("Mot de passe", { exact: true }).fill("mot-de-passe-incorrect");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.getByRole("alert").getByText(
    "Identifiant ou mot de passe incorrect.",
    { exact: true }
  ).waitFor();
  assert.equal(await page.locator(".app-shell").count(), 0);
  assert.equal(await rememberCheckbox.isChecked(), true, "Une erreur doit conserver le choix de la case.");
  assert.deepEqual(
    await page.evaluate(async () => {
      const { LOCAL_AUTH_STORAGE_KEYS } = await import("/src/lib/localAuth.ts");
      return [
        sessionStorage.getItem(LOCAL_AUTH_STORAGE_KEYS.session),
        localStorage.getItem(LOCAL_AUTH_STORAGE_KEYS.rememberedSession)
      ];
    }),
    [null, null],
    "Un mot de passe incorrect ne doit créer aucune session."
  );

  await loginThroughUi(page, { ...account, username: "  LOUIS.AUTH  " });
  const temporaryPage = await context.newPage();
  await temporaryPage.goto(baseUrl);
  await temporaryPage.getByRole("heading", { name: "Se connecter", exact: true }).waitFor();
  await temporaryPage.close();
  await logoutThroughUi(page);

  await loginThroughUi(page, account, { rememberMe: true });
  const remembered = await page.evaluate(async ({ expectedPassword }) => {
    const { LOCAL_AUTH_STORAGE_KEYS } = await import("/src/lib/localAuth.ts");
    const raw = localStorage.getItem(LOCAL_AUTH_STORAGE_KEYS.rememberedSession);
    return {
      session: sessionStorage.getItem(LOCAL_AUTH_STORAGE_KEYS.session),
      remembered: JSON.parse(raw ?? "null"),
      leaksPassword: raw?.includes(expectedPassword) ?? false
    };
  }, { expectedPassword: account.password });
  assert.equal(remembered.session, null);
  assert.equal(remembered.remembered.accountId, profile.account.id);
  assert.equal(remembered.leaksPassword, false, "Le navigateur ne doit jamais stocker le mot de passe.");

  await page.close();
  page = await context.newPage();
  await page.goto(baseUrl);
  assert.equal((await currentProfile(page)).account.id, profile.account.id);
  await logoutThroughUi(page);
  assert.deepEqual(
    await page.evaluate(async () => {
      const { LOCAL_AUTH_STORAGE_KEYS } = await import("/src/lib/localAuth.ts");
      return [
        sessionStorage.getItem(LOCAL_AUTH_STORAGE_KEYS.session),
        localStorage.getItem(LOCAL_AUTH_STORAGE_KEYS.rememberedSession)
      ];
    }),
    [null, null],
    "Se déconnecter doit révoquer toute reconnexion mémorisée."
  );
  await page.close();
  page = await context.newPage();
  await page.goto(baseUrl);
  await page.getByRole("heading", { name: "Se connecter", exact: true }).waitFor();

  await loginThroughUi(page, account);
  await logoutThroughUi(page);
  await page.getByRole("button", { name: "Créer un compte", exact: true }).click();
  await page.getByLabel("Nom affiché", { exact: true }).fill("Profil doublon");
  await page.getByLabel(/^Identifiant/).fill(" louis.auth ");
  await page.getByLabel("Mot de passe", { exact: true }).fill(account.password);
  await page.getByLabel("Confirmer le mot de passe", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Créer le compte", exact: true }).click();
  await page.getByRole("alert").getByText(
    "Cet identifiant local est déjà utilisé.",
    { exact: true }
  ).waitFor();
  assert.equal(
    await page.evaluate(async () => {
      const { getLocalAuthStatus } = await import("/src/lib/localAuth.ts");
      return (await getLocalAuthStatus()).accounts.length;
    }),
    1
  );

  process.stdout.write("Parcours Register/Login local validé : mémorisation, relance, logout et erreurs.\n");
} finally {
  await browser.close();
}
