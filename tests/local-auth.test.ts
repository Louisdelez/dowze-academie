import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import {
  activeLocalAccount,
  getLocalAuthStatus,
  listLocalAccounts,
  LOCAL_AUTH_STORAGE_KEYS,
  LocalAuthError,
  loginLocalAccount,
  logoutLocalAccount,
  normalizeLocalUsername,
  registerLocalAccount,
  validateLocalPassword,
  validateLocalUsername
} from "../src/lib/localAuth.ts";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  failOnSet: string | null = null;

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) {
    if (this.failOnSet === key) throw new DOMException("Quota simulé", "QuotaExceededError");
    this.values.set(key, String(value));
  }
}

let local: MemoryStorage;
let session: MemoryStorage;

function installBrowserStorage(localStorage: Storage, sessionStorage: Storage): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage, sessionStorage }
  });
}

function serializedStorage(storage: Storage): string {
  const entries = Array.from({ length: storage.length }, (_, index) => {
    const key = storage.key(index);
    return key === null ? null : [key, storage.getItem(key)];
  });
  return JSON.stringify(entries);
}

beforeEach(() => {
  local = new MemoryStorage();
  session = new MemoryStorage();
  installBrowserStorage(local, session);
});

test("normalise les identifiants et refuse les formats non pris en charge", () => {
  assert.equal(normalizeLocalUsername("  LoUis.ÉTUDE  "), "louis.étude");
  assert.equal(validateLocalUsername(" Louis_2026 "), "louis_2026");
  assert.throws(() => validateLocalUsername("ab"), (error: unknown) =>
    error instanceof LocalAuthError && error.code === "invalid-username");
  assert.throws(() => validateLocalUsername("louis test"), (error: unknown) =>
    error instanceof LocalAuthError && error.code === "invalid-username");
  assert.throws(() => validateLocalUsername("louis.étude"), (error: unknown) =>
    error instanceof LocalAuthError && error.code === "invalid-username");
  assert.throws(() => validateLocalPassword("court"), (error: unknown) =>
    error instanceof LocalAuthError && error.code === "invalid-password");
});

test("inscrit un compte sans jamais persister le mot de passe en clair", async () => {
  const password = "Mot-de-passe-local-2026!";
  const account = await registerLocalAccount({
    displayName: "  Louis   Étude  ",
    username: " Louis.Test ",
    password
  });

  assert.equal(account.displayName, "Louis   Étude");
  assert.equal(account.username, "louis.test");
  assert.deepEqual(activeLocalAccount(), account);
  assert.deepEqual(listLocalAccounts(), [account]);
  assert.deepEqual(await getLocalAuthStatus(), { accounts: [account], activeAccount: account });

  const rawRegistry = local.getItem(LOCAL_AUTH_STORAGE_KEYS.accounts);
  assert.ok(rawRegistry);
  assert.equal(rawRegistry.includes(password), false);
  const registry = JSON.parse(rawRegistry);
  assert.equal(registry.version, 1);
  assert.match(registry.accounts[0].passwordSalt, /^[0-9a-f]{32}$/);
  assert.match(registry.accounts[0].passwordVerifier, /^[0-9a-f]{64}$/);
  assert.ok(registry.accounts[0].passwordIterations >= 100_000);
  assert.equal("password" in registry.accounts[0], false);
  assert.equal(local.getItem(LOCAL_AUTH_STORAGE_KEYS.session), null);
  assert.equal(local.getItem(LOCAL_AUTH_STORAGE_KEYS.rememberedSession), null);
  assert.equal(JSON.parse(session.getItem(LOCAL_AUTH_STORAGE_KEYS.session) ?? "null").accountId, account.id);
  assert.equal(serializedStorage(local).includes(password), false);
  assert.equal(serializedStorage(session).includes(password), false);
});

test("mémorise la connexion entre deux sessions navigateur sans stocker le mot de passe", async () => {
  const password = "Mot-de-passe-mémorisé-2026!";
  const registered = await registerLocalAccount({
    displayName: "Louis",
    username: "louis.memoire",
    password
  });
  await logoutLocalAccount();

  const loggedIn = await loginLocalAccount("Louis.Memoire", password, true);
  assert.equal(loggedIn.id, registered.id);
  assert.equal(session.getItem(LOCAL_AUTH_STORAGE_KEYS.session), null);
  assert.deepEqual(
    JSON.parse(local.getItem(LOCAL_AUTH_STORAGE_KEYS.rememberedSession) ?? "null"),
    { version: 1, accountId: registered.id }
  );
  assert.equal(serializedStorage(local).includes(password), false);
  assert.equal(serializedStorage(session).includes(password), false);

  session = new MemoryStorage();
  installBrowserStorage(local, session);

  assert.equal(activeLocalAccount()?.id, registered.id);
  assert.equal((await getLocalAuthStatus()).activeAccount?.id, registered.id);
});

test("transmet la mémorisation au backend Tauri sans écrire les identifiants dans la WebView", async () => {
  const password = "Mot-de-passe-trousseau-2026!";
  const nativeAccount = {
    id: "8be78cbcff8349e9884d4dfe5c9cc9a0",
    displayName: "Louis",
    username: "louis.native",
    createdAt: "2026-09-08T08:00:00.000Z"
  };
  const invocations: Array<{ command: string; args: unknown }> = [];
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: local,
      sessionStorage: session,
      __TAURI_INTERNALS__: {
        invoke: async (command: string, args: unknown) => {
          invocations.push({ command, args });
          return nativeAccount;
        }
      }
    }
  });

  assert.deepEqual(await loginLocalAccount("Louis.Native", password, true), nativeAccount);
  assert.deepEqual(invocations, [{
    command: "login_local_account",
    args: { username: "Louis.Native", password, rememberMe: true }
  }]);
  assert.equal(local.length, 0);
  assert.equal(session.length, 0);
});

test("garde une connexion temporaire uniquement pendant la session navigateur courante", async () => {
  const password = "Mot-de-passe-temporaire-2026!";
  const registered = await registerLocalAccount({
    displayName: "Louis",
    username: "louis.temporaire",
    password
  });
  await logoutLocalAccount();

  await loginLocalAccount(registered.username, password, false);
  assert.deepEqual(
    JSON.parse(session.getItem(LOCAL_AUTH_STORAGE_KEYS.session) ?? "null"),
    { version: 1, accountId: registered.id }
  );
  assert.equal(local.getItem(LOCAL_AUTH_STORAGE_KEYS.rememberedSession), null);

  session = new MemoryStorage();
  installBrowserStorage(local, session);

  assert.equal(activeLocalAccount(), null);
  assert.equal((await getLocalAuthStatus()).activeAccount, undefined);
  assert.deepEqual(listLocalAccounts(), [registered]);
});

test("la déconnexion supprime la session mémorisée et toute session temporaire résiduelle", async () => {
  const password = "Mot-de-passe-déconnexion-2026!";
  const registered = await registerLocalAccount({
    displayName: "Louis",
    username: "louis.logout",
    password
  });
  await logoutLocalAccount();
  await loginLocalAccount(registered.username, password, true);
  session.setItem(LOCAL_AUTH_STORAGE_KEYS.session, JSON.stringify({
    version: 1,
    accountId: registered.id
  }));

  await logoutLocalAccount();

  assert.equal(session.getItem(LOCAL_AUTH_STORAGE_KEYS.session), null);
  assert.equal(local.getItem(LOCAL_AUTH_STORAGE_KEYS.rememberedSession), null);
  assert.equal(activeLocalAccount(), null);
});

test("nettoie une session mémorisée corrompue ou ambiguë", async () => {
  const account = await registerLocalAccount({
    displayName: "Louis",
    username: "louis.corruption",
    password: "Mot-de-passe-corruption-2026!"
  });

  session.removeItem(LOCAL_AUTH_STORAGE_KEYS.session);
  local.setItem(LOCAL_AUTH_STORAGE_KEYS.rememberedSession, "{session-incomplète");
  assert.equal(activeLocalAccount(), null);
  assert.equal(local.getItem(LOCAL_AUTH_STORAGE_KEYS.rememberedSession), null);

  const validSession = JSON.stringify({ version: 1, accountId: account.id });
  session.setItem(LOCAL_AUTH_STORAGE_KEYS.session, validSession);
  local.setItem(LOCAL_AUTH_STORAGE_KEYS.rememberedSession, validSession);
  assert.equal(activeLocalAccount(), null);
  assert.equal(session.getItem(LOCAL_AUTH_STORAGE_KEYS.session), null);
  assert.equal(local.getItem(LOCAL_AUTH_STORAGE_KEYS.rememberedSession), null);
});

test("déconnecte puis reconnecte le bon profil avec une erreur générique sinon", async () => {
  const input = {
    displayName: "Louis",
    username: "louis.test",
    password: "Mot-de-passe-local-2026!"
  };
  const registered = await registerLocalAccount(input);
  await logoutLocalAccount();
  assert.equal(activeLocalAccount(), null);

  await assert.rejects(
    loginLocalAccount("LOUIS.TEST", "mot-de-passe-incorrect"),
    (error: unknown) => error instanceof LocalAuthError &&
      error.code === "invalid-credentials" &&
      error.message === "Identifiant ou mot de passe incorrect."
  );
  assert.equal(activeLocalAccount(), null);

  const loggedIn = await loginLocalAccount("  LOUIS.TEST ", input.password);
  assert.equal(loggedIn.id, registered.id);
  assert.equal(loggedIn.username, "louis.test");
  assert.equal(activeLocalAccount()?.id, registered.id);
});

test("refuse un identifiant déjà utilisé après normalisation et sale différemment deux comptes", async () => {
  const password = "Même-mot-de-passe-2026!";
  await registerLocalAccount({ displayName: "Profil A", username: "Louis.Test", password });
  await logoutLocalAccount();
  await assert.rejects(
    registerLocalAccount({ displayName: "Doublon", username: " louis.test ", password }),
    (error: unknown) => error instanceof LocalAuthError && error.code === "username-taken"
  );
  await registerLocalAccount({ displayName: "Profil B", username: "louis.autre", password });

  const registry = JSON.parse(local.getItem(LOCAL_AUTH_STORAGE_KEYS.accounts) ?? "null");
  assert.equal(registry.accounts.length, 2);
  assert.notEqual(registry.accounts[0].passwordSalt, registry.accounts[1].passwordSalt);
  assert.notEqual(registry.accounts[0].passwordVerifier, registry.accounts[1].passwordVerifier);
});

test("annule l’inscription si la session ne peut pas être persistée", async () => {
  session.failOnSet = LOCAL_AUTH_STORAGE_KEYS.session;
  await assert.rejects(
    registerLocalAccount({
      displayName: "Louis",
      username: "louis.test",
      password: "Mot-de-passe-local-2026!"
    }),
    (error: unknown) => error instanceof LocalAuthError && error.code === "storage-unavailable"
  );
  assert.deepEqual(listLocalAccounts(), []);
  assert.deepEqual(JSON.parse(local.getItem(LOCAL_AUTH_STORAGE_KEYS.accounts) ?? "null"), {
    version: 1,
    accounts: []
  });
});

test("isole un registre corrompu dans une copie recovery et invalide sa session", () => {
  const corrupt = "{registre-incomplet";
  local.setItem(LOCAL_AUTH_STORAGE_KEYS.accounts, corrupt);
  session.setItem(LOCAL_AUTH_STORAGE_KEYS.session, JSON.stringify({
    version: 1,
    accountId: "21f81232-3f1b-4f01-8d2e-873017145bb8"
  }));

  assert.deepEqual(listLocalAccounts(), []);
  assert.equal(local.getItem(`${LOCAL_AUTH_STORAGE_KEYS.accounts}.recovery`), corrupt);
  assert.equal(activeLocalAccount(), null);
  assert.equal(session.getItem(LOCAL_AUTH_STORAGE_KEYS.session), null);
});

test("refuse un registre où deux comptes partagent le même identifiant interne", async () => {
  await registerLocalAccount({
    displayName: "Profil Alpha",
    username: "profil.alpha",
    password: "Profil-Alpha-2026!"
  });
  await logoutLocalAccount();
  await registerLocalAccount({
    displayName: "Profil Bêta",
    username: "profil.beta",
    password: "Profil-Beta-2026!"
  });

  const registry = JSON.parse(local.getItem(LOCAL_AUTH_STORAGE_KEYS.accounts) ?? "null");
  registry.accounts[1].id = registry.accounts[0].id;
  const duplicateIdsRegistry = JSON.stringify(registry);
  local.setItem(LOCAL_AUTH_STORAGE_KEYS.accounts, duplicateIdsRegistry);

  assert.deepEqual(listLocalAccounts(), []);
  assert.equal(
    local.getItem(`${LOCAL_AUTH_STORAGE_KEYS.accounts}.recovery`),
    duplicateIdsRegistry
  );
  assert.equal(activeLocalAccount(), null);
  assert.equal(session.getItem(LOCAL_AUTH_STORAGE_KEYS.session), null);
});
