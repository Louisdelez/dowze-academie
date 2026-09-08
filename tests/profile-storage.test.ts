import assert from "node:assert/strict";
import test from "node:test";
import { LOCAL_AUTH_STORAGE_KEYS } from "../src/lib/localAuth.ts";
import {
  applyPendingProfileReset,
  beginProfileReset,
  clearLegacyWorkspaceData,
  completeProfileReset,
  isValidLocalAccountId,
  pendingProfileReset,
  profileRecoveryKeys,
  profileStorageKey,
  profileStoragePrefix,
  WORKSPACE_STORAGE,
  workspaceStorageFor
} from "../src/lib/profileStorage.ts";

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

const profileA = "21f81232-3f1b-4f01-8d2e-873017145bb8";
const profileB = "49f32926-92fd-4263-a71a-020404b6fc5a";
const nativeProfile = "8be78cbcff8349e9884d4dfe5c9cc9a0";

test("valide strictement les identifiants de profil et refuse les traversées", () => {
  assert.equal(isValidLocalAccountId(profileA), true);
  assert.equal(isValidLocalAccountId(nativeProfile), true);
  assert.equal(
    workspaceStorageFor(nativeProfile).tasks,
    `${profileStoragePrefix(nativeProfile)}tasks.energy-year1.v2`
  );
  for (const invalid of ["", "../autre", "21f81232-3f1b-3f01-8d2e-873017145bb8", "not-a-uuid"]) {
    assert.equal(isValidLocalAccountId(invalid), false, invalid);
    assert.throws(() => profileStoragePrefix(invalid), /Identifiant de compte local invalide/);
  }
});

test("produit un espace complet, unique et sans identifiant utilisateur lisible", () => {
  const keysA = workspaceStorageFor(profileA);
  const keysB = workspaceStorageFor(profileB);
  const valuesA = Object.values(keysA);
  const valuesB = Object.values(keysB);

  assert.equal(valuesA.length, Object.keys(WORKSPACE_STORAGE).length);
  assert.equal(new Set(valuesA).size, valuesA.length);
  assert.ok(valuesA.every((key) => key.startsWith(profileStoragePrefix(profileA))));
  assert.ok(valuesB.every((key) => key.startsWith(profileStoragePrefix(profileB))));
  assert.ok(valuesA.every((key) => !valuesB.includes(key)));
  assert.equal(keysA.tasks, profileStorageKey(profileA, WORKSPACE_STORAGE.tasks));
  assert.equal(profileStorageKey(profileA, "custom-key"), `${profileStoragePrefix(profileA)}custom-key`);
});

test("efface définitivement l’ancien espace global sans toucher aux profils", () => {
  const storage = new MemoryStorage();
  const profileKey = workspaceStorageFor(profileA).subjects;
  storage.setItem(WORKSPACE_STORAGE.subjects, "sujets-de-test");
  storage.setItem("etude.tasks.v1", "taches-de-test");
  storage.setItem(`${WORKSPACE_STORAGE.freeChatConversations}.recovery`, "chat-recovery");
  storage.setItem(profileKey, "profil-isole");
  storage.setItem(LOCAL_AUTH_STORAGE_KEYS.accounts, "registre-auth");

  assert.equal(clearLegacyWorkspaceData(storage), 3);
  assert.equal(storage.getItem(WORKSPACE_STORAGE.subjects), null);
  assert.equal(storage.getItem("etude.tasks.v1"), null);
  assert.equal(storage.getItem(`${WORKSPACE_STORAGE.freeChatConversations}.recovery`), null);
  assert.equal(storage.getItem(profileKey), "profil-isole");
  assert.equal(storage.getItem(LOCAL_AUTH_STORAGE_KEYS.accounts), "registre-auth");
});

test("énumère uniquement les copies recovery du profil demandé", () => {
  const storage = new MemoryStorage();
  const keysA = workspaceStorageFor(profileA);
  const keysB = workspaceStorageFor(profileB);
  storage.setItem(`${keysA.tasks}.recovery`, "a-tasks");
  storage.setItem(`${keysA.subjects}.recovery`, "a-subjects");
  storage.setItem(`${keysB.tasks}.recovery`, "b-tasks");
  storage.setItem(keysA.events, "pas-une-recovery");

  assert.deepEqual(
    profileRecoveryKeys(profileA, storage).sort(),
    [`${keysA.subjects}.recovery`, `${keysA.tasks}.recovery`].sort()
  );
});

test("applique un reset par intention puis supprime le journal à la finalisation", () => {
  const storage = new MemoryStorage();
  const keysA = workspaceStorageFor(profileA);
  storage.setItem(keysA.subjects, JSON.stringify([{ id: "ancien-cursus" }]));

  beginProfileReset(profileA, ["subjects", "tasks"], storage);
  const journalBeforeRetry = storage.getItem(keysA.resetJournal);
  assert.equal(JSON.parse(journalBeforeRetry ?? "null").applied, false);
  beginProfileReset(profileA, ["subjects", "tasks"], storage);
  assert.equal(storage.getItem(keysA.resetJournal), journalBeforeRetry);
  assert.deepEqual(pendingProfileReset(profileA, storage), ["subjects", "tasks"]);
  assert.throws(
    () => completeProfileReset(profileA, storage),
    /entièrement appliqué avant sa finalisation/
  );

  applyPendingProfileReset(profileA, [
    ["subjects", [{ id: "nouveau-cursus" }]],
    ["tasks", []]
  ], storage);

  assert.equal(storage.getItem(keysA.subjects), JSON.stringify([{ id: "nouveau-cursus" }]));
  assert.equal(storage.getItem(keysA.tasks), "[]");
  assert.notEqual(storage.getItem(keysA.resetJournal), null, "Le journal reste jusqu’à la finalisation explicite.");
  assert.equal(JSON.parse(storage.getItem(keysA.resetJournal) ?? "null").applied, true);
  assert.equal(completeProfileReset(profileA, storage), true);
  assert.equal(storage.getItem(keysA.resetJournal), null);
  assert.equal(completeProfileReset(profileA, storage), false);
});

test("conserve le journal après un quota puis reprend le reset de façon idempotente", () => {
  const storage = new MemoryStorage();
  const keys = workspaceStorageFor(profileA);
  const previousSubjects = JSON.stringify([{ id: "cursus-avant-reset" }]);
  const previousTasks = JSON.stringify([{ id: "tache-avant-reset" }]);
  const previousEvents = JSON.stringify([{ id: "evenement-avant-reset" }]);
  storage.setItem(keys.subjects, previousSubjects);
  storage.setItem(keys.tasks, previousTasks);
  storage.setItem(keys.events, previousEvents);
  beginProfileReset(profileA, ["subjects", "tasks", "events"], storage);
  storage.failOnSet = keys.tasks;

  assert.throws(
    () => applyPendingProfileReset(profileA, [
      ["subjects", [{ id: "cursus-neuf" }]],
      ["tasks", []],
      ["events", []]
    ], storage),
    /Réinitialisation interrompue.*Quota simulé/
  );

  assert.equal(storage.getItem(keys.subjects), JSON.stringify([{ id: "cursus-neuf" }]));
  assert.equal(storage.getItem(keys.tasks), null, "La cible libère l’ancienne valeur avant l’écriture.");
  assert.equal(storage.getItem(keys.events), previousEvents);
  assert.deepEqual(pendingProfileReset(profileA, storage), ["subjects", "tasks", "events"]);
  assert.equal(JSON.parse(storage.getItem(keys.resetJournal) ?? "null").applied, false);
  assert.throws(
    () => completeProfileReset(profileA, storage),
    /entièrement appliqué avant sa finalisation/
  );
  assert.notEqual(storage.getItem(keys.resetJournal), null);

  storage.failOnSet = null;
  applyPendingProfileReset(profileA, [
    ["subjects", [{ id: "cursus-neuf" }]],
    ["tasks", []],
    ["events", []]
  ], storage);
  assert.equal(storage.getItem(keys.subjects), JSON.stringify([{ id: "cursus-neuf" }]));
  assert.equal(storage.getItem(keys.tasks), "[]");
  assert.equal(storage.getItem(keys.events), "[]");
  assert.deepEqual(pendingProfileReset(profileA, storage), ["subjects", "tasks", "events"]);
  assert.equal(completeProfileReset(profileA, storage), true);
  assert.equal(storage.getItem(keys.resetJournal), null);
});

test("refuse un journal malveillant contenant un identifiant arbitraire", () => {
  const storage = new MemoryStorage();
  const keysA = workspaceStorageFor(profileA);
  const keysB = workspaceStorageFor(profileB);
  const protectedValue = JSON.stringify([{ id: "donnee-beta" }]);
  storage.setItem(keysB.tasks, protectedValue);
  storage.setItem(keysA.resetJournal, JSON.stringify({
    version: 2,
    accountId: profileA,
    createdAt: "2026-09-07T10:00:00.000Z",
    applied: false,
    recordIds: ["subjects", "etude.auth.accounts.v1"]
  }));

  assert.throws(
    () => pendingProfileReset(profileA, storage),
    /enregistrements du reset de profil sont invalides/
  );
  assert.equal(storage.getItem(keysB.tasks), protectedValue);
  assert.notEqual(storage.getItem(keysA.resetJournal), null);
});

test("isole les intentions et les écritures de reset entre les profils A et B", () => {
  const storage = new MemoryStorage();
  const keysA = workspaceStorageFor(profileA);
  const keysB = workspaceStorageFor(profileB);
  const betaSubjects = JSON.stringify([{ id: "cursus-beta" }]);
  storage.setItem(keysA.subjects, JSON.stringify([{ id: "cursus-alpha" }]));
  storage.setItem(keysB.subjects, betaSubjects);

  beginProfileReset(profileA, ["subjects"], storage);
  assert.deepEqual(pendingProfileReset(profileA, storage), ["subjects"]);
  assert.equal(pendingProfileReset(profileB, storage), null);
  applyPendingProfileReset(profileA, [["subjects", []]], storage);

  assert.equal(storage.getItem(keysA.subjects), "[]");
  assert.equal(storage.getItem(keysB.subjects), betaSubjects);
  assert.notEqual(storage.getItem(keysA.resetJournal), null);
  assert.equal(storage.getItem(keysB.resetJournal), null);
  completeProfileReset(profileA, storage);
  assert.equal(storage.getItem(keysB.subjects), betaSubjects);
});
