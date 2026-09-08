import assert from "node:assert/strict";

export const DEFAULT_TEST_ACCOUNT = Object.freeze({
  displayName: "Louis Test",
  username: "louis.test",
  password: "Etude-Test-2026!"
});

export async function clearBrowserStorage(page, baseUrl) {
  await page.goto(baseUrl);
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
  await page.getByRole("heading", { name: "Créer ton compte", exact: true }).waitFor();
}

export async function registerThroughUi(page, account = DEFAULT_TEST_ACCOUNT) {
  const registerSwitch = page.getByRole("button", { name: "Créer un compte", exact: true });
  if (await registerSwitch.isVisible().catch(() => false)) await registerSwitch.click();

  await page.getByLabel("Nom affiché", { exact: true }).fill(account.displayName);
  await page.getByLabel(/^Identifiant/).fill(account.username);
  await page.getByLabel("Mot de passe", { exact: true }).fill(account.password);
  await page.getByLabel("Confirmer le mot de passe", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Créer le compte", exact: true }).click();
  await page.getByRole("heading", {
    name: new RegExp(`^(Bonjour|Bon après-midi|Bonsoir), ${escapeRegExp(account.displayName)}$`)
  }).waitFor();

  return currentProfile(page);
}

export async function bootstrapAuthenticatedPage(
  page,
  baseUrl,
  account = DEFAULT_TEST_ACCOUNT
) {
  await clearBrowserStorage(page, baseUrl);
  return registerThroughUi(page, account);
}

export async function loginThroughUi(
  page,
  account = DEFAULT_TEST_ACCOUNT,
  { rememberMe = false } = {}
) {
  await page.getByRole("heading", { name: "Se connecter", exact: true }).waitFor();
  await page.getByLabel(/^Identifiant/).fill(account.username);
  await page.getByLabel("Mot de passe", { exact: true }).fill(account.password);
  await page.getByRole("checkbox", { name: "Se souvenir de moi", exact: true })
    .setChecked(rememberMe);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.getByRole("heading", {
    name: new RegExp(`^(Bonjour|Bon après-midi|Bonsoir), ${escapeRegExp(account.displayName)}$`)
  }).waitFor();
  return currentProfile(page);
}

export async function logoutThroughUi(page) {
  await page.getByLabel("Réglages", { exact: true }).click();
  await page.getByRole("button", { name: "Se déconnecter", exact: true }).click();
  await page.getByRole("heading", { name: "Se connecter", exact: true }).waitFor();
}

export async function currentProfile(page) {
  const profile = await page.evaluate(async () => {
    const [{ getLocalAuthStatus }, { workspaceStorageFor }] = await Promise.all([
      import("/src/lib/localAuth.ts"),
      import("/src/lib/profileStorage.ts")
    ]);
    const account = (await getLocalAuthStatus()).activeAccount ?? null;
    return account ? { account, storage: workspaceStorageFor(account.id) } : null;
  });
  assert.ok(profile, "Un profil local authentifié doit être actif.");
  return profile;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
