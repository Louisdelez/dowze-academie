import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";
import type { FormationImportPreview, FormationManifest } from "../src/lib/formations.ts";
import {
  formationRegistryStorageFor,
  formationStorageFor,
  workspaceStorageFor
} from "../src/lib/profileStorage.ts";
import type { CalendarEvent, Subject, TaskItem } from "../src/types.ts";

const vite = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "custom"
});
let registryModule: typeof import("../src/lib/formationRegistry.ts");
let formationsModule: typeof import("../src/lib/formations.ts");
try {
  registryModule = await vite.ssrLoadModule("/src/lib/formationRegistry.ts") as typeof registryModule;
  formationsModule = await vite.ssrLoadModule("/src/lib/formations.ts") as typeof formationsModule;
} finally {
  await vite.close();
}
const {
  activateInstalledFormation,
  installFormationFromPreview,
  loadFormationCatalog
} = registryModule;
const { BUILTIN_ENERGY_FORMATION } = formationsModule;

type StorageOperation = {
  kind: "get" | "set" | "set-failed" | "remove" | "remove-ignored";
  key: string;
  value?: string;
};

class DeterministicStorage implements Storage {
  private readonly values = new Map<string, string>();
  readonly operations: StorageOperation[] = [];
  failOnSetKey: string | null = null;
  ignoreRemoveKey: string | null = null;

  get length() {
    return this.values.size;
  }

  clear() {
    for (const key of [...this.values.keys()]) this.removeItem(key);
  }

  getItem(key: string) {
    this.operations.push({ kind: "get", key });
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    if (key === this.ignoreRemoveKey) {
      this.operations.push({ kind: "remove-ignored", key });
      return;
    }
    this.operations.push({ kind: "remove", key });
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    const serialized = String(value);
    if (key === this.failOnSetKey) {
      this.operations.push({ kind: "set-failed", key, value: serialized });
      throw new DOMException("Quota simulé", "QuotaExceededError");
    }
    this.operations.push({ kind: "set", key, value: serialized });
    this.values.set(key, serialized);
  }

  resetOperations() {
    this.operations.length = 0;
  }
}

const accountA = "21f81232-3f1b-4f01-8d2e-873017145bb8";
const accountB = "49f32926-92fd-4263-a71a-020404b6fc5a";
const instanceA = "9f8e7967-d9da-4f60-97da-19b31cedfd2f";
const instanceB = "b030f24d-cf20-43f8-980e-9d740ee86562";
const installedAtA = "2026-09-09T10:00:00.000Z";
const installedAtB = "2026-09-09T10:01:00.000Z";

function validPreview(packageId = "lycee-seconde", title = "Lycée seconde"): FormationImportPreview {
  const manifest: FormationManifest = {
    ...structuredClone(BUILTIN_ENERGY_FORMATION.manifest),
    packageVersion: "1.0.0",
    id: packageId,
    name: title,
    shortName: title,
    yearLabel: "Année scolaire",
    description: `Formation de test ${title}`,
    academicYear: {
      startDate: "2026-09-01",
      endDate: "2027-06-30"
    },
    specialization: undefined
  };
  const subjects: Subject[] = [{
    id: "mathematiques",
    name: "Mathématiques",
    shortName: "Maths",
    teacher: "Équipe pédagogique",
    room: "Salle 1",
    color: "#3155a4",
    accent: "#e8edff",
    icon: "function",
    modules: []
  }];
  const events: CalendarEvent[] = [{
    id: "cours-mathematiques",
    title: "Mathématiques",
    subjectId: "mathematiques",
    start: "2026-09-01T06:00:00.000Z",
    end: "2026-09-01T07:00:00.000Z",
    type: "course",
    color: "#3155a4"
  }];
  const tasks: TaskItem[] = [{
    id: "exercice-mathematiques",
    title: "Exercice de mathématiques",
    subjectId: "mathematiques",
    dueAt: "2026-09-02T16:00:00.000Z",
    completed: false,
    priority: "medium"
  }];
  return {
    valid: true,
    issues: [],
    manifest,
    subjects,
    events,
    tasks,
    compiled: { subjects, events, tasks },
    counts: {
      subjects: 1,
      modules: 0,
      chapters: 0,
      lessons: 0,
      events: 1,
      tasks: 1
    }
  };
}

function seedLegacyMarkers(storage: Storage, accountId: string, marker: string) {
  const entries = Object.entries(workspaceStorageFor(accountId)).map(([record, key]) => [
    key,
    `${marker}:${record}`
  ] as const);
  for (const [key, value] of entries) storage.setItem(key, value);
  return entries;
}

function assertMarkersIntact(storage: Storage, entries: ReadonlyArray<readonly [string, string]>) {
  for (const [key, value] of entries) assert.equal(storage.getItem(key), value, key);
}

test("la première ouverture ajoute uniquement les métadonnées et garde les 19 clés legacy intactes", () => {
  const storage = new DeterministicStorage();
  const legacyMarkers = seedLegacyMarkers(storage, accountA, "historique");
  storage.resetOperations();

  const snapshot = loadFormationCatalog(accountA, storage);

  assert.equal(legacyMarkers.length, 19);
  assert.deepEqual(snapshot.formations, [BUILTIN_ENERGY_FORMATION]);
  assert.deepEqual(snapshot.activeFormation, BUILTIN_ENERGY_FORMATION);
  assertMarkersIntact(storage, legacyMarkers);
  const registryKeys = formationRegistryStorageFor(accountA);
  assert.equal(storage.getItem(registryKeys.registry), JSON.stringify({ schemaVersion: 1, formations: [] }));
  assert.equal(storage.getItem(registryKeys.active), JSON.stringify(BUILTIN_ENERGY_FORMATION.instanceId));
  assert.equal(
    storage.operations.some((operation) =>
      operation.kind === "set" && legacyMarkers.some(([key]) => key === operation.key)
    ),
    false
  );
});

test("une installation valide initialise son espace UUID sans l’activer", () => {
  const storage = new DeterministicStorage();
  loadFormationCatalog(accountA, storage);
  const preview = validPreview();
  const installed = installFormationFromPreview(accountA, preview, storage, {
    instanceId: instanceA,
    installedAt: installedAtA
  });
  const workspace = formationStorageFor(accountA, installed);

  assert.equal(installed.instanceId, instanceA);
  assert.equal(storage.getItem(workspace.subjects), JSON.stringify(preview.compiled?.subjects));
  assert.equal(storage.getItem(workspace.events), JSON.stringify(preview.compiled?.events));
  assert.equal(storage.getItem(workspace.tasks), JSON.stringify(preview.compiled?.tasks));
  assert.equal(storage.getItem(workspace.conversations), "[]");
  assert.equal(storage.getItem(workspace.assessments), "[]");
  assert.equal(storage.getItem(workspace.provider), JSON.stringify("chatgpt"));
  assert.equal(storage.getItem(workspace.subjectNotes)?.includes('"schemaVersion":2'), true);
  assert.equal(storage.getItem(workspace.resetJournal), null);
  assert.equal(
    Object.values(workspace).filter((key) => storage.getItem(key) !== null).length,
    17,
    "Le journal de reset et la configuration Chat libre restent absents; les 17 états sûrs sont initialisés."
  );
  assert.equal(storage.getItem(formationRegistryStorageFor(accountA).installJournal), null);

  const snapshot = loadFormationCatalog(accountA, storage);
  assert.equal(snapshot.formations.length, 2);
  assert.equal(snapshot.activeFormation.instanceId, BUILTIN_ENERGY_FORMATION.instanceId);
  assert.equal(
    storage.getItem(formationRegistryStorageFor(accountA).active),
    JSON.stringify(BUILTIN_ENERGY_FORMATION.instanceId)
  );
});

test("un registre principal absent est restauré depuis la dernière copie valide", () => {
  const storage = new DeterministicStorage();
  loadFormationCatalog(accountA, storage);
  const installed = installFormationFromPreview(accountA, validPreview(), storage, {
    instanceId: instanceA,
    installedAt: installedAtA
  });
  const registryKeys = formationRegistryStorageFor(accountA);
  const backupKey = `${registryKeys.registry}.last-known-good.recovery`;
  const expectedRegistry = storage.getItem(registryKeys.registry);
  const workspace = formationStorageFor(accountA, installed);
  const expectedSubjects = storage.getItem(workspace.subjects);
  storage.removeItem(registryKeys.registry);

  const snapshot = loadFormationCatalog(accountA, storage);

  assert.equal(snapshot.formations.some((formation) => formation.instanceId === instanceA), true);
  assert.equal(storage.getItem(registryKeys.registry), expectedRegistry);
  assert.equal(storage.getItem(backupKey), expectedRegistry);
  assert.equal(storage.getItem(workspace.subjects), expectedSubjects);
});

test("un registre valide mais régressé ne peut pas effacer une formation du miroir", () => {
  const storage = new DeterministicStorage();
  loadFormationCatalog(accountA, storage);
  installFormationFromPreview(accountA, validPreview(), storage, {
    instanceId: instanceA,
    installedAt: installedAtA
  });
  const registryKeys = formationRegistryStorageFor(accountA);
  const expectedRegistry = storage.getItem(registryKeys.registry);
  storage.setItem(registryKeys.registry, JSON.stringify({ schemaVersion: 1, formations: [] }));

  const snapshot = loadFormationCatalog(accountA, storage);

  assert.equal(snapshot.formations.some((formation) => formation.instanceId === instanceA), true);
  assert.equal(storage.getItem(registryKeys.registry), expectedRegistry);
  assert.equal(
    Array.from({ length: storage.length }, (_, index) => storage.key(index))
      .filter((key): key is string => Boolean(key?.startsWith(`${registryKeys.registry}.`) && key.endsWith(".recovery")))
      .some((key) => storage.getItem(key) === JSON.stringify({ schemaVersion: 1, formations: [] })),
    true
  );
});

test("une réparation impossible interdit d’installer depuis un registre régressé", () => {
  const storage = new DeterministicStorage();
  loadFormationCatalog(accountA, storage);
  const formationA = installFormationFromPreview(accountA, validPreview(), storage, {
    instanceId: instanceA,
    installedAt: installedAtA
  });
  const registryKeys = formationRegistryStorageFor(accountA);
  const backupKey = `${registryKeys.registry}.last-known-good.recovery`;
  const backupBefore = storage.getItem(backupKey);
  const workspaceA = formationStorageFor(accountA, formationA);
  const workspaceB = formationStorageFor(accountA, {
    instanceId: instanceB,
    storageKind: "formation-v1"
  });
  storage.setItem(registryKeys.registry, JSON.stringify({ schemaVersion: 1, formations: [] }));
  storage.failOnSetKey = `${registryKeys.registry}.recovery`;

  assert.equal(loadFormationCatalog(accountA, storage).formations.some((item) => item.instanceId === instanceA), true);
  assert.throws(
    () => installFormationFromPreview(
      accountA,
      validPreview("lycee-premiere", "Lycée première"),
      storage,
      { instanceId: instanceB, installedAt: installedAtB }
    ),
    /n’étend pas/
  );

  assert.notEqual(storage.getItem(workspaceA.subjects), null);
  assert.ok(Object.values(workspaceB).every((key) => storage.getItem(key) === null));
  assert.equal(storage.getItem(backupKey), backupBefore);
  assert.equal(storage.getItem(registryKeys.registry), JSON.stringify({ schemaVersion: 1, formations: [] }));
});

test("un échec du miroir de registre annule l’installation avant le commit principal", () => {
  const storage = new DeterministicStorage();
  loadFormationCatalog(accountA, storage);
  const registryKeys = formationRegistryStorageFor(accountA);
  const registryBefore = storage.getItem(registryKeys.registry);
  const backupKey = `${registryKeys.registry}.last-known-good.recovery`;
  const backupBefore = storage.getItem(backupKey);
  const workspace = formationStorageFor(accountA, {
    instanceId: instanceA,
    storageKind: "formation-v1"
  });
  storage.failOnSetKey = backupKey;

  assert.throws(
    () => installFormationFromPreview(accountA, validPreview(), storage, {
      instanceId: instanceA,
      installedAt: installedAtA
    }),
    /Quota simulé/
  );

  assert.equal(storage.getItem(registryKeys.registry), registryBefore);
  assert.equal(storage.getItem(backupKey), backupBefore);
  assert.equal(storage.getItem(registryKeys.installJournal), null);
  assert.ok(Object.values(workspace).every((key) => storage.getItem(key) === null));
});

test("un rollback incomplet conserve son journal puis termine au chargement suivant", () => {
  const storage = new DeterministicStorage();
  loadFormationCatalog(accountA, storage);
  const registryKeys = formationRegistryStorageFor(accountA);
  const backupKey = `${registryKeys.registry}.last-known-good.recovery`;
  const workspace = formationStorageFor(accountA, {
    instanceId: instanceA,
    storageKind: "formation-v1"
  });
  storage.failOnSetKey = backupKey;
  storage.ignoreRemoveKey = workspace.subjects;

  assert.throws(
    () => installFormationFromPreview(accountA, validPreview(), storage, {
      instanceId: instanceA,
      installedAt: installedAtA
    }),
    /Quota simulé/
  );
  assert.notEqual(storage.getItem(workspace.subjects), null);
  assert.notEqual(storage.getItem(registryKeys.installJournal), null);

  storage.failOnSetKey = null;
  storage.ignoreRemoveKey = null;
  loadFormationCatalog(accountA, storage);
  assert.ok(Object.values(workspace).every((key) => storage.getItem(key) === null));
  assert.equal(storage.getItem(registryKeys.installJournal), null);
});

test("l’activation écrit le pointeur actif comme dernière mutation", () => {
  const storage = new DeterministicStorage();
  loadFormationCatalog(accountA, storage);
  const installed = installFormationFromPreview(accountA, validPreview(), storage, {
    instanceId: instanceA,
    installedAt: installedAtA
  });
  storage.resetOperations();

  activateInstalledFormation(accountA, installed, storage);

  const mutations = storage.operations.filter((operation) =>
    operation.kind === "set" || operation.kind === "remove"
  );
  assert.deepEqual(mutations.at(-1), {
    kind: "set",
    key: formationRegistryStorageFor(accountA).active,
    value: JSON.stringify(instanceA)
  });
  assert.equal(
    storage.getItem(formationRegistryStorageFor(accountA).active),
    JSON.stringify(instanceA)
  );
});

test("un aller-retour A vers B puis A retrouve les marqueurs de chaque espace", () => {
  const storage = new DeterministicStorage();
  loadFormationCatalog(accountA, storage);
  const formationA = installFormationFromPreview(accountA, validPreview("lycee-seconde"), storage, {
    instanceId: instanceA,
    installedAt: installedAtA
  });
  const formationB = installFormationFromPreview(accountA, validPreview("lycee-premiere", "Lycée première"), storage, {
    instanceId: instanceB,
    installedAt: installedAtB
  });
  const workspaceA = formationStorageFor(accountA, formationA);
  const workspaceB = formationStorageFor(accountA, formationB);
  const subjectsA = structuredClone(validPreview("lycee-seconde").subjects);
  const subjectsB = structuredClone(validPreview("lycee-premiere", "Lycée première").subjects);
  subjectsA[0].name = "marqueur-a";
  subjectsB[0].name = "marqueur-b";
  storage.setItem(workspaceA.subjects, JSON.stringify(subjectsA));
  storage.setItem(workspaceB.subjects, JSON.stringify(subjectsB));

  activateInstalledFormation(accountA, formationA, storage);
  assert.equal(storage.getItem(workspaceA.subjects), JSON.stringify(subjectsA));
  activateInstalledFormation(accountA, formationB, storage);
  assert.equal(storage.getItem(workspaceB.subjects), JSON.stringify(subjectsB));
  activateInstalledFormation(accountA, formationA, storage);

  assert.equal(storage.getItem(formationRegistryStorageFor(accountA).active), JSON.stringify(instanceA));
  assert.equal(storage.getItem(workspaceA.subjects), JSON.stringify(subjectsA));
  assert.equal(storage.getItem(workspaceB.subjects), JSON.stringify(subjectsB));
});

test("le même UUID de formation reste isolé entre deux comptes", () => {
  const storage = new DeterministicStorage();
  loadFormationCatalog(accountA, storage);
  loadFormationCatalog(accountB, storage);
  const formationA = installFormationFromPreview(accountA, validPreview(), storage, {
    instanceId: instanceA,
    installedAt: installedAtA
  });
  const formationB = installFormationFromPreview(accountB, validPreview(), storage, {
    instanceId: instanceA,
    installedAt: installedAtA
  });
  const workspaceA = formationStorageFor(accountA, formationA);
  const workspaceB = formationStorageFor(accountB, formationB);
  const tasksA = structuredClone(validPreview().tasks);
  const tasksB = structuredClone(validPreview().tasks);
  tasksA[0].title = "tache-a";
  tasksB[0].title = "tache-b";
  storage.setItem(workspaceA.tasks, JSON.stringify(tasksA));
  storage.setItem(workspaceB.tasks, JSON.stringify(tasksB));

  activateInstalledFormation(accountA, formationA, storage);

  assert.equal(storage.getItem(workspaceA.tasks), JSON.stringify(tasksA));
  assert.equal(storage.getItem(workspaceB.tasks), JSON.stringify(tasksB));
  assert.equal(storage.getItem(formationRegistryStorageFor(accountA).active), JSON.stringify(instanceA));
  assert.equal(
    storage.getItem(formationRegistryStorageFor(accountB).active),
    JSON.stringify(BUILTIN_ENERGY_FORMATION.instanceId)
  );
  assert.equal(Object.values(workspaceA).some((key) => Object.values(workspaceB).includes(key)), false);
});

test("un quota plein avant le commit restaure le registre et nettoie l’espace préparé", () => {
  const storage = new DeterministicStorage();
  const legacyMarkers = seedLegacyMarkers(storage, accountA, "avant-quota");
  loadFormationCatalog(accountA, storage);
  const registryKeys = formationRegistryStorageFor(accountA);
  const registryBefore = storage.getItem(registryKeys.registry);
  const orphanWorkspace = formationStorageFor(accountA, {
    instanceId: instanceA,
    storageKind: "formation-v1"
  });
  storage.failOnSetKey = registryKeys.registry;

  assert.throws(
    () => installFormationFromPreview(accountA, validPreview(), storage, {
      instanceId: instanceA,
      installedAt: installedAtA
    }),
    /Quota simulé/
  );

  assert.equal(storage.getItem(registryKeys.registry), registryBefore);
  assert.equal(storage.getItem(registryKeys.active), JSON.stringify(BUILTIN_ENERGY_FORMATION.instanceId));
  assert.equal(storage.getItem(registryKeys.installJournal), null);
  assert.ok(Object.values(orphanWorkspace).every((key) => storage.getItem(key) === null));
  assertMarkersIntact(storage, legacyMarkers);
});

test("une collision avec un espace orphelin est refusée sans écraser ses données", () => {
  const storage = new DeterministicStorage();
  loadFormationCatalog(accountA, storage);
  const orphanWorkspace = formationStorageFor(accountA, {
    instanceId: instanceA,
    storageKind: "formation-v1"
  });
  storage.setItem(orphanWorkspace.subjects, "donnees-a-preserver");

  assert.throws(
    () => installFormationFromPreview(accountA, validPreview(), storage, {
      instanceId: instanceA,
      installedAt: installedAtA
    }),
    /utilise déjà cet identifiant/
  );

  assert.equal(storage.getItem(orphanWorkspace.subjects), "donnees-a-preserver");
  assert.equal(storage.getItem(formationRegistryStorageFor(accountA).installJournal), null);
  assert.equal(loadFormationCatalog(accountA, storage).formations.length, 1);
});

test("un journal interrompu nettoie uniquement l’instance orpheline", () => {
  const storage = new DeterministicStorage();
  const legacyMarkers = seedLegacyMarkers(storage, accountA, "legacy-conserve");
  loadFormationCatalog(accountA, storage);
  const installed = installFormationFromPreview(
    accountA,
    validPreview("lycee-premiere", "Lycée première"),
    storage,
    { instanceId: instanceB, installedAt: installedAtB }
  );
  const installedWorkspace = formationStorageFor(accountA, installed);
  storage.setItem(installedWorkspace.subjects, "formation-installee");
  const otherAccountWorkspace = formationStorageFor(accountB, {
    instanceId: instanceA,
    storageKind: "formation-v1"
  });
  storage.setItem(otherAccountWorkspace.subjects, "autre-compte");

  const orphanWorkspace = formationStorageFor(accountA, {
    instanceId: instanceA,
    storageKind: "formation-v1"
  });
  for (const [record, key] of Object.entries(orphanWorkspace)) {
    storage.setItem(key, `orphelin:${record}`);
  }
  const registryKeys = formationRegistryStorageFor(accountA);
  storage.setItem(registryKeys.installJournal, JSON.stringify({
    schemaVersion: 1,
    instanceId: instanceA,
    createdAt: installedAtA,
    workspaceKeys: Object.values(orphanWorkspace)
  }));

  const snapshot = loadFormationCatalog(accountA, storage);

  assert.deepEqual(snapshot.formations.map((formation) => formation.instanceId), [
    BUILTIN_ENERGY_FORMATION.instanceId,
    instanceB
  ]);
  assert.ok(Object.values(orphanWorkspace).every((key) => storage.getItem(key) === null));
  assert.equal(storage.getItem(registryKeys.installJournal), null);
  assert.equal(storage.getItem(installedWorkspace.subjects), "formation-installee");
  assert.equal(storage.getItem(otherAccountWorkspace.subjects), "autre-compte");
  assertMarkersIntact(storage, legacyMarkers);
});

test("un registre corrompu est sauvegardé, réparé et n’empêche plus une installation", () => {
  const storage = new DeterministicStorage();
  const legacyMarkers = seedLegacyMarkers(storage, accountA, "legacy-apres-corruption");
  const registryKeys = formationRegistryStorageFor(accountA);
  const corruptedRegistry = "{registre-invalide";
  storage.setItem(registryKeys.registry, corruptedRegistry);
  storage.setItem(registryKeys.active, JSON.stringify(instanceA));

  const snapshot = loadFormationCatalog(accountA, storage);

  assert.deepEqual(snapshot.formations, [BUILTIN_ENERGY_FORMATION]);
  assert.deepEqual(snapshot.activeFormation, BUILTIN_ENERGY_FORMATION);
  assert.equal(storage.getItem(registryKeys.registry), JSON.stringify({ schemaVersion: 1, formations: [] }));
  assert.equal(storage.getItem(`${registryKeys.registry}.recovery`), corruptedRegistry);
  assert.equal(storage.getItem(registryKeys.active), JSON.stringify(BUILTIN_ENERGY_FORMATION.instanceId));
  assertMarkersIntact(storage, legacyMarkers);

  const installed = installFormationFromPreview(accountA, validPreview(), storage, {
    instanceId: instanceA,
    installedAt: installedAtA
  });
  assert.equal(installed.instanceId, instanceA);
  assert.equal(loadFormationCatalog(accountA, storage).formations.length, 2);
});

test("la réparation d’un registre met le journal résiduel en quarantaine sans effacer son espace", () => {
  const storage = new DeterministicStorage();
  loadFormationCatalog(accountA, storage);
  const installed = installFormationFromPreview(accountA, validPreview(), storage, {
    instanceId: instanceA,
    installedAt: installedAtA
  });
  const workspace = formationStorageFor(accountA, installed);
  const workspaceBefore = Object.fromEntries(
    Object.values(workspace).map((key) => [key, storage.getItem(key)])
  );
  const registryKeys = formationRegistryStorageFor(accountA);
  const registryBeforeCorruption = storage.getItem(registryKeys.registry);
  const residualJournal = JSON.stringify({
    schemaVersion: 1,
    instanceId: instanceA,
    createdAt: installedAtA,
    workspaceKeys: Object.values(workspace)
  });
  storage.setItem(registryKeys.installJournal, residualJournal);
  const corruptedRegistry = "{registre-committe-devenu-invalide";
  storage.setItem(registryKeys.registry, corruptedRegistry);

  loadFormationCatalog(accountA, storage);
  loadFormationCatalog(accountA, storage);

  assert.equal(storage.getItem(`${registryKeys.registry}.recovery`), corruptedRegistry);
  assert.equal(storage.getItem(`${registryKeys.installJournal}.recovery`), residualJournal);
  assert.equal(storage.getItem(registryKeys.installJournal), null);
  assert.equal(storage.getItem(registryKeys.registry), registryBeforeCorruption);
  assert.equal(loadFormationCatalog(accountA, storage).formations.some((item) => item.instanceId === instanceA), true);
  for (const [key, value] of Object.entries(workspaceBefore)) {
    assert.equal(storage.getItem(key), value, key);
  }
});

test("plusieurs corruptions distinctes gardent chacune une copie récupérable", () => {
  const storage = new DeterministicStorage();
  const registryKeys = formationRegistryStorageFor(accountA);
  const corruptions = ["{premiere-corruption", "{seconde-corruption"];

  for (const corruption of corruptions) {
    storage.setItem(registryKeys.registry, corruption);
    loadFormationCatalog(accountA, storage);
    assert.equal(storage.getItem(registryKeys.registry), JSON.stringify({ schemaVersion: 1, formations: [] }));
  }

  const recoveredValues = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key): key is string => Boolean(key?.endsWith(".recovery")))
    .map((key) => storage.getItem(key));
  assert.ok(recoveredValues.includes(corruptions[0]));
  assert.ok(recoveredValues.includes(corruptions[1]));
});

test("un quota empêchant la copie de récupération laisse le registre corrompu intact", () => {
  const storage = new DeterministicStorage();
  const registryKeys = formationRegistryStorageFor(accountA);
  const corruptedRegistry = "{registre-a-ne-pas-perdre";
  storage.setItem(registryKeys.registry, corruptedRegistry);
  storage.failOnSetKey = `${registryKeys.registry}.recovery`;

  const snapshot = loadFormationCatalog(accountA, storage);

  assert.deepEqual(snapshot.formations, [BUILTIN_ENERGY_FORMATION]);
  assert.equal(storage.getItem(registryKeys.registry), corruptedRegistry);
  assert.equal(storage.getItem(`${registryKeys.registry}.recovery`), null);
  assert.throws(
    () => installFormationFromPreview(accountA, validPreview(), storage, {
      instanceId: instanceA,
      installedAt: installedAtA
    }),
    /registre/
  );
});

test("un journal malveillant est isolé sans masquer le registre ni toucher aux données", () => {
  const storage = new DeterministicStorage();
  loadFormationCatalog(accountA, storage);
  const installed = installFormationFromPreview(accountA, validPreview(), storage, {
    instanceId: instanceA,
    installedAt: installedAtA
  });
  const registryKeys = formationRegistryStorageFor(accountA);
  const registryBefore = storage.getItem(registryKeys.registry);
  storage.setItem(registryKeys.installJournal, JSON.stringify({
    schemaVersion: 1,
    instanceId: "../../autre-profil",
    createdAt: installedAtB,
    workspaceKeys: Object.values(formationStorageFor(accountA, installed))
  }));

  const snapshot = loadFormationCatalog(accountA, storage);
  assert.equal(snapshot.formations.some((formation) => formation.instanceId === instanceA), true);
  assert.equal(storage.getItem(registryKeys.registry), registryBefore);
  assert.equal(storage.getItem(registryKeys.installJournal), null);
  assert.notEqual(storage.getItem(`${registryKeys.installJournal}.recovery`), null);
  assert.equal(storage.getItem(formationStorageFor(accountA, installed).subjects), JSON.stringify(validPreview().subjects));
});

test("un journal à UUID valide mais aux clés étrangères est aussi mis en quarantaine", () => {
  const storage = new DeterministicStorage();
  loadFormationCatalog(accountA, storage);
  const registryKeys = formationRegistryStorageFor(accountA);
  const foreignWorkspace = formationStorageFor(accountB, {
    instanceId: instanceA,
    storageKind: "formation-v1"
  });
  for (const key of Object.values(foreignWorkspace)) storage.setItem(key, "autre-compte");
  const maliciousJournal = JSON.stringify({
    schemaVersion: 1,
    instanceId: instanceA,
    createdAt: installedAtA,
    workspaceKeys: Object.values(foreignWorkspace)
  });
  storage.setItem(registryKeys.installJournal, maliciousJournal);

  assert.doesNotThrow(() => loadFormationCatalog(accountA, storage));
  assert.equal(storage.getItem(registryKeys.installJournal), null);
  assert.equal(storage.getItem(`${registryKeys.installJournal}.recovery`), maliciousJournal);
  assert.ok(Object.values(foreignWorkspace).every((key) => storage.getItem(key) === "autre-compte"));
});

test("une formation active au cœur absent ou corrompu replie sans réécrire ses données", () => {
  const cases = [
    { record: "subjects" as const, raw: null },
    { record: "subjects" as const, raw: "[]" },
    { record: "events" as const, raw: "{calendrier-corrompu" },
    { record: "tasks" as const, raw: JSON.stringify({ surprise: true }) }
  ];

  for (const current of cases) {
    const storage = new DeterministicStorage();
    loadFormationCatalog(accountA, storage);
    const installed = installFormationFromPreview(accountA, validPreview(), storage, {
      instanceId: instanceA,
      installedAt: installedAtA
    });
    activateInstalledFormation(accountA, installed, storage);
    const workspace = formationStorageFor(accountA, installed);
    if (current.raw === null) storage.removeItem(workspace[current.record]);
    else storage.setItem(workspace[current.record], current.raw);

    const snapshot = loadFormationCatalog(accountA, storage);

    assert.equal(snapshot.activeFormation.instanceId, BUILTIN_ENERGY_FORMATION.instanceId);
    assert.match(snapshot.workspaceWarning ?? "", /données brutes ont été conservées/i);
    assert.equal(storage.getItem(workspace[current.record]), current.raw);
    assert.equal(
      storage.getItem(formationRegistryStorageFor(accountA).active),
      JSON.stringify(BUILTIN_ENERGY_FORMATION.instanceId)
    );
  }
});

test("l’activation refuse un cœur invalide sans remplacer le contenu brut", () => {
  const storage = new DeterministicStorage();
  loadFormationCatalog(accountA, storage);
  const installed = installFormationFromPreview(accountA, validPreview(), storage, {
    instanceId: instanceA,
    installedAt: installedAtA
  });
  const workspace = formationStorageFor(accountA, installed);
  const corrupted = "{matieres-incompletes";
  storage.setItem(workspace.subjects, corrupted);

  assert.throws(
    () => activateInstalledFormation(accountA, installed, storage),
    /ne peut pas être activé.*conservées/s
  );
  assert.equal(storage.getItem(workspace.subjects), corrupted);
  assert.equal(
    storage.getItem(formationRegistryStorageFor(accountA).active),
    JSON.stringify(BUILTIN_ENERGY_FORMATION.instanceId)
  );
});
