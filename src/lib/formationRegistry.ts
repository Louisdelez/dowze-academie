import { EMPTY_SUBJECT_NOTES_STORE } from "./subjectNotes";
import {
  formationRegistryStorageFor,
  formationStorageFor,
  type WorkspaceStorageKeys
} from "./profileStorage";
import {
  BUILTIN_ENERGY_FORMATION,
  isInstalledFormation,
  type FormationImportPreview,
  type InstalledFormation
} from "./formations";
import {
  isStoredEvents,
  isStoredSubjects,
  isStoredTasks
} from "./workspaceValidation";

const REGISTRY_SCHEMA_VERSION = 1 as const;
const MAX_INSTALLED_FORMATIONS = 100;

interface PersistedFormationRegistry {
  schemaVersion: typeof REGISTRY_SCHEMA_VERSION;
  formations: InstalledFormation[];
}

interface FormationInstallJournal {
  schemaVersion: typeof REGISTRY_SCHEMA_VERSION;
  instanceId: string;
  createdAt: string;
  workspaceKeys: string[];
}

export interface FormationCatalogSnapshot {
  formations: InstalledFormation[];
  activeFormation: InstalledFormation;
  workspaceWarning?: string;
}

const CORE_WORKSPACE_VALIDATORS = {
  subjects: isStoredSubjects,
  events: isStoredEvents,
  tasks: isStoredTasks
} as const;

function formationCoreWorkspaceError(
  accountId: string,
  formation: InstalledFormation,
  storage: Storage
): string | null {
  if (formation.storageKind !== "formation-v1") return null;
  const workspace = formationStorageFor(accountId, formation);
  for (const record of Object.keys(CORE_WORKSPACE_VALIDATORS) as Array<keyof typeof CORE_WORKSPACE_VALIDATORS>) {
    const raw = storage.getItem(workspace[record]);
    if (raw === null) return `La donnée essentielle « ${record} » est absente.`;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!CORE_WORKSPACE_VALIDATORS[record](parsed as never)) {
        return `La donnée essentielle « ${record} » a un format invalide.`;
      }
    } catch {
      return `La donnée essentielle « ${record} » est illisible.`;
    }
  }
  return null;
}

function storageOrWindow(storage?: Storage): Storage {
  if (storage) return storage;
  if (typeof window === "undefined") {
    throw new Error("Le stockage local des formations est indisponible.");
  }
  return window.localStorage;
}

function verifiedSet(storage: Storage, key: string, value: string): void {
  storage.setItem(key, value);
  if (storage.getItem(key) !== value) {
    throw new Error("Le stockage local n’a pas confirmé l’écriture de la formation.");
  }
}

function verifiedRemove(storage: Storage, key: string): void {
  storage.removeItem(key);
  if (storage.getItem(key) !== null) {
    throw new Error("Le stockage local n’a pas confirmé le nettoyage de l’installation.");
  }
}

function exactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function parseRegistry(raw: string | null): PersistedFormationRegistry {
  if (raw === null) return { schemaVersion: REGISTRY_SCHEMA_VERSION, formations: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Le registre des formations est illisible.");
  }
  if (!exactObject(parsed, ["schemaVersion", "formations"])) {
    throw new Error("Le registre des formations a un format inconnu.");
  }
  if (parsed.schemaVersion !== REGISTRY_SCHEMA_VERSION || !Array.isArray(parsed.formations)) {
    throw new Error("La version du registre des formations n’est pas prise en charge.");
  }
  if (parsed.formations.length > MAX_INSTALLED_FORMATIONS) {
    throw new Error(`Le registre dépasse la limite de ${MAX_INSTALLED_FORMATIONS} formations.`);
  }
  if (!parsed.formations.every(isInstalledFormation)) {
    throw new Error("Le registre contient une formation invalide.");
  }
  const formations = parsed.formations as InstalledFormation[];
  if (formations.some((formation) => formation.storageKind !== "formation-v1")) {
    throw new Error("Le registre ne doit pas dupliquer la formation historique incluse.");
  }
  if (new Set(formations.map((formation) => formation.instanceId)).size !== formations.length) {
    throw new Error("Le registre contient plusieurs fois la même instance de formation.");
  }
  return { schemaVersion: REGISTRY_SCHEMA_VERSION, formations };
}

function recoveryFingerprint(raw: string) {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(raw)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function preserveRawRecovery(storage: Storage, key: string, raw: string): boolean {
  try {
    const primaryRecoveryKey = `${key}.recovery`;
    const primaryRecovery = storage.getItem(primaryRecoveryKey);
    if (primaryRecovery === raw) return true;
    const fingerprint = recoveryFingerprint(raw);
    const candidates = primaryRecovery === null
      ? [primaryRecoveryKey]
      : Array.from({ length: 9 }, (_, index) =>
          `${key}.${fingerprint}${index === 0 ? "" : `-${index}`}.recovery`
        );
    for (const recoveryKey of candidates) {
      const existingRecovery = storage.getItem(recoveryKey);
      if (existingRecovery === raw) return true;
      if (existingRecovery !== null) continue;
      verifiedSet(storage, recoveryKey, raw);
      return storage.getItem(recoveryKey) === raw;
    }
    return false;
  } catch {
    // Le repli vers la formation incluse reste disponible même si le quota est plein.
    return false;
  }
}

function quarantineInstallJournalForRegistryRepair(storage: Storage, key: string): boolean {
  const raw = storage.getItem(key);
  if (raw === null) return true;
  if (!preserveRawRecovery(storage, key, raw)) return false;
  try {
    // L’absence d’une instance dans un registre corrompu ne prouve jamais que
    // son espace est orphelin. On isole donc le journal sans toucher aux données.
    verifiedRemove(storage, key);
    return true;
  } catch {
    return false;
  }
}

function syncRegistryBackup(
  storage: Storage,
  registryKey: string,
  registry: PersistedFormationRegistry
) {
  const key = `${registryKey}.last-known-good.recovery`;
  const serialized = JSON.stringify(registry);
  const currentRaw = storage.getItem(key);
  if (currentRaw === serialized) return;
  if (currentRaw !== null) {
    try {
      const current = parseRegistry(currentRaw);
      if (!registryExtendsBackup(registry, current)) {
        throw new Error("Le nouveau registre n’étend pas sa dernière copie valide.");
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("n’étend pas")) throw error;
      if (!preserveRawRecovery(storage, key, currentRaw)) throw error;
    }
  }
  verifiedSet(storage, key, serialized);
}

function registryFromBackup(storage: Storage, registryKey: string): {
  registry: PersistedFormationRegistry;
  state: "absent" | "valid" | "invalid-preserved";
} {
  const backupKey = `${registryKey}.last-known-good.recovery`;
  const raw = storage.getItem(backupKey);
  if (raw === null) {
    return {
      registry: { schemaVersion: REGISTRY_SCHEMA_VERSION, formations: [] },
      state: "absent"
    };
  }
  try {
    return { registry: parseRegistry(raw), state: "valid" };
  } catch {
    if (!preserveRawRecovery(storage, backupKey, raw)) {
      throw new Error("La copie connue du registre est illisible et ne peut pas être préservée.");
    }
    return {
      registry: { schemaVersion: REGISTRY_SCHEMA_VERSION, formations: [] },
      state: "invalid-preserved"
    };
  }
}

function registryExtendsBackup(
  registry: PersistedFormationRegistry,
  backup: PersistedFormationRegistry
) {
  const currentById = new Map(
    registry.formations.map((formation) => [formation.instanceId, JSON.stringify(formation)])
  );
  return backup.formations.every((formation) =>
    currentById.get(formation.instanceId) === JSON.stringify(formation)
  );
}

function parseInstallJournal(raw: string | null): FormationInstallJournal | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Le journal d’installation de formation est invalide.");
  }
  if (!exactObject(parsed, ["schemaVersion", "instanceId", "createdAt", "workspaceKeys"])) {
    throw new Error("Le journal d’installation de formation est invalide.");
  }
  let expectedKeyCount = -1;
  if (typeof parsed.instanceId === "string") {
    try {
      expectedKeyCount = Object.keys(formationStorageFor(
        "00000000000000000000000000000000",
        { instanceId: parsed.instanceId, storageKind: "formation-v1" }
      )).length;
    } catch {
      throw new Error("Le journal d’installation de formation est invalide.");
    }
  }
  if (
    parsed.schemaVersion !== REGISTRY_SCHEMA_VERSION ||
    typeof parsed.instanceId !== "string" ||
    typeof parsed.createdAt !== "string" ||
    !Number.isFinite(Date.parse(parsed.createdAt)) ||
    !Array.isArray(parsed.workspaceKeys) ||
    parsed.workspaceKeys.length !== expectedKeyCount ||
    parsed.workspaceKeys.some((key) => typeof key !== "string") ||
    new Set(parsed.workspaceKeys).size !== parsed.workspaceKeys.length
  ) {
    throw new Error("Le journal d’installation de formation est invalide.");
  }
  return {
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    instanceId: parsed.instanceId as string,
    createdAt: parsed.createdAt as string,
    workspaceKeys: [...parsed.workspaceKeys] as string[]
  };
}

function workspaceKeysForFormation(accountId: string, formation: InstalledFormation): WorkspaceStorageKeys {
  return formationStorageFor(accountId, formation);
}

function recoverInterruptedInstall(
  accountId: string,
  registry: PersistedFormationRegistry,
  storage: Storage
): void {
  const keys = formationRegistryStorageFor(accountId);
  const journalRaw = storage.getItem(keys.installJournal);
  let journal: FormationInstallJournal | null;
  try {
    journal = parseInstallJournal(journalRaw);
  } catch (error) {
    if (
      journalRaw !== null &&
      preserveRawRecovery(storage, keys.installJournal, journalRaw)
    ) {
      verifiedRemove(storage, keys.installJournal);
      return;
    }
    throw error;
  }
  if (!journal) return;
  if (registry.formations.some((formation) => formation.instanceId === journal.instanceId)) {
    verifiedRemove(storage, keys.installJournal);
    return;
  }
  const identity = { instanceId: journal.instanceId, storageKind: "formation-v1" as const };
  const expectedKeys = Object.values(formationStorageFor(accountId, identity));
  if (
    expectedKeys.length !== journal.workspaceKeys.length ||
    expectedKeys.some((key, index) => journal.workspaceKeys[index] !== key)
  ) {
    if (
      journalRaw !== null &&
      preserveRawRecovery(storage, keys.installJournal, journalRaw)
    ) {
      verifiedRemove(storage, keys.installJournal);
      return;
    }
    throw new Error("Le journal d’installation ne correspond pas à un espace de formation sûr.");
  }
  for (const workspaceKey of journal.workspaceKeys) verifiedRemove(storage, workspaceKey);
  verifiedRemove(storage, keys.installJournal);
}

function parseActiveId(raw: string | null): string | null {
  if (raw === null) return null;
  const parsed: unknown = JSON.parse(raw);
  return typeof parsed === "string" ? parsed : null;
}

export function loadFormationCatalog(
  accountId: string,
  suppliedStorage?: Storage
): FormationCatalogSnapshot {
  const storage = storageOrWindow(suppliedStorage);
  const keys = formationRegistryStorageFor(accountId);
  const registryRaw = storage.getItem(keys.registry);
  let registry: PersistedFormationRegistry = {
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    formations: []
  };
  let registryIsTrusted = true;
  if (registryRaw === null) {
    try {
      const backup = registryFromBackup(storage, keys.registry);
      registry = backup.registry;
      if (
        backup.state !== "invalid-preserved" ||
        quarantineInstallJournalForRegistryRepair(storage, keys.installJournal)
      ) {
        verifiedSet(storage, keys.registry, JSON.stringify(registry));
      } else {
        registryIsTrusted = false;
      }
    } catch {
      registryIsTrusted = false;
    }
  } else {
    try {
      registry = parseRegistry(registryRaw);
      const backup = registryFromBackup(storage, keys.registry);
      if (
        backup.state === "valid" &&
        !registryExtendsBackup(registry, backup.registry)
      ) {
        registryIsTrusted = false;
        const currentPreserved = preserveRawRecovery(storage, keys.registry, registryRaw);
        if (
          currentPreserved &&
          quarantineInstallJournalForRegistryRepair(storage, keys.installJournal)
        ) {
          registry = backup.registry;
          verifiedSet(storage, keys.registry, JSON.stringify(registry));
          registryIsTrusted = true;
        } else {
          registry = backup.registry;
        }
      }
    } catch {
      registryIsTrusted = false;
      const registryRecoveryConfirmed = preserveRawRecovery(storage, keys.registry, registryRaw);
      if (
        registryRecoveryConfirmed &&
        quarantineInstallJournalForRegistryRepair(storage, keys.installJournal)
      ) {
        try {
          registry = registryFromBackup(storage, keys.registry).registry;
          verifiedSet(storage, keys.registry, JSON.stringify(registry));
          registryIsTrusted = true;
        } catch {
          // Les données récupérées restent exportables et le repli legacy lisible.
        }
      }
    }
  }
  if (registryIsTrusted) recoverInterruptedInstall(accountId, registry, storage);

  const formations = [BUILTIN_ENERGY_FORMATION, ...registry.formations];
  const activeId = (() => {
    try {
      return parseActiveId(storage.getItem(keys.active));
    } catch {
      return null;
    }
  })();
  const requestedFormation = formations.find((formation) => formation.instanceId === activeId);
  const workspaceError = requestedFormation
    ? formationCoreWorkspaceError(accountId, requestedFormation, storage)
    : null;
  const activeFormation = requestedFormation && !workspaceError
    ? requestedFormation
    : BUILTIN_ENERGY_FORMATION;
  const workspaceWarning = requestedFormation && workspaceError
    ? `« ${requestedFormation.manifest.name} » n’a pas été ouverte : ${workspaceError} Les données brutes ont été conservées sans modification.`
    : undefined;

  // Migration zéro-copie : seules les petites métadonnées sont ajoutées.
  try {
    if (registryIsTrusted) syncRegistryBackup(storage, keys.registry, registry);
  } catch {
    // Le registre principal reste l’autorité validée si le miroir est indisponible.
  }
  try {
    if (activeId !== activeFormation.instanceId) {
      verifiedSet(storage, keys.active, JSON.stringify(activeFormation.instanceId));
    }
  } catch {
    // Les données historiques restent lisibles même si le pointeur ne peut pas être réparé.
  }
  return { formations, activeFormation, ...(workspaceWarning ? { workspaceWarning } : {}) };
}

function initialWorkspaceValues(preview: FormationImportPreview, keys: WorkspaceStorageKeys) {
  if (!preview.compiled || !preview.manifest) {
    throw new Error("Le dossier validé ne contient pas de formation compilée.");
  }
  return new Map<string, unknown>([
    [keys.subjects, preview.compiled.subjects],
    [keys.events, preview.compiled.events],
    [keys.tasks, preview.compiled.tasks],
    [keys.conversations, []],
    [keys.assessments, []],
    [keys.provider, "chatgpt"],
    [keys.aiVisible, true],
    [keys.aiWidth, 440],
    [keys.selectedSubject, preview.compiled.subjects[0]?.id ?? null],
    [keys.calendarView, "week"],
    [keys.academicScheduleRevision, 0],
    [keys.subjectNotes, EMPTY_SUBJECT_NOTES_STORE],
    [keys.freeChatConversations, []],
    [keys.freeChatActiveConversation, null],
    [keys.freeChatBackend, "ollama"],
    [keys.notesHistoryOpen, false],
    [keys.notesCoursesSidebarOpen, true]
  ]);
}

export function installFormationFromPreview(
  accountId: string,
  preview: FormationImportPreview,
  suppliedStorage?: Storage,
  options: { instanceId?: string; installedAt?: string } = {}
): InstalledFormation {
  if (!preview.valid || !preview.manifest || !preview.compiled) {
    throw new Error("Seul un dossier entièrement validé peut être installé.");
  }
  const storage = storageOrWindow(suppliedStorage);
  const registryKeys = formationRegistryStorageFor(accountId);
  loadFormationCatalog(accountId, storage);
  const registry = parseRegistry(storage.getItem(registryKeys.registry));
  recoverInterruptedInstall(accountId, registry, storage);
  if (registry.formations.length >= MAX_INSTALLED_FORMATIONS) {
    throw new Error(`La limite de ${MAX_INSTALLED_FORMATIONS} formations installées est atteinte.`);
  }
  const instanceId = options.instanceId ?? crypto.randomUUID();
  const installedAt = options.installedAt ?? new Date().toISOString();
  const formation: InstalledFormation = {
    instanceId,
    packageId: preview.manifest.id,
    packageVersion: preview.manifest.packageVersion,
    manifest: structuredClone(preview.manifest),
    installedAt,
    storageKind: "formation-v1"
  };
  if (!isInstalledFormation(formation)) {
    throw new Error("L’identité locale de la formation est invalide.");
  }
  if (registry.formations.some((entry) => entry.instanceId === instanceId)) {
    throw new Error("Cette instance de formation existe déjà.");
  }

  const workspaceKeys = workspaceKeysForFormation(accountId, formation);
  if (Object.values(workspaceKeys).some((key) => storage.getItem(key) !== null)) {
    throw new Error("Un espace local non répertorié utilise déjà cet identifiant de formation.");
  }
  const values = initialWorkspaceValues(preview, workspaceKeys);
  const journal: FormationInstallJournal = {
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    instanceId,
    createdAt: installedAt,
    workspaceKeys: Object.values(workspaceKeys)
  };
  verifiedSet(storage, registryKeys.installJournal, JSON.stringify(journal));
  let registryCommitted = false;
  let backupPrepared = false;
  const backupKey = `${registryKeys.registry}.last-known-good.recovery`;
  const previousBackup = storage.getItem(backupKey);
  try {
    for (const [key, value] of values) {
      const serialized = JSON.stringify(value);
      if (serialized === undefined) throw new Error("Une valeur de formation ne peut pas être sérialisée.");
      verifiedSet(storage, key, serialized);
    }
    const nextRegistry: PersistedFormationRegistry = {
      schemaVersion: REGISTRY_SCHEMA_VERSION,
      formations: [...registry.formations, formation]
    };
    syncRegistryBackup(storage, registryKeys.registry, nextRegistry);
    backupPrepared = true;
    verifiedSet(storage, registryKeys.registry, JSON.stringify(nextRegistry));
    registryCommitted = true;
    try {
      verifiedRemove(storage, registryKeys.installJournal);
    } catch {
      // Le registre et l’espace sont déjà confirmés. Le prochain chargement
      // reconnaîtra l’instance et retirera ce journal devenu sans danger.
    }
    return formation;
  } catch (error) {
    if (!registryCommitted) {
      let backupReadyForCleanup = !backupPrepared;
      if (backupPrepared) {
        try {
          if (previousBackup === null) verifiedRemove(storage, backupKey);
          else verifiedSet(storage, backupKey, previousBackup);
          backupReadyForCleanup = true;
        } catch {
          // Garder journal et espace permet au prochain chargement de décider
          // depuis le registre principal, puis de resynchroniser le miroir.
        }
      }
      if (!backupReadyForCleanup) throw error;
      let workspaceCleanupConfirmed = true;
      for (const key of Object.values(workspaceKeys)) {
        try {
          verifiedRemove(storage, key);
        } catch {
          workspaceCleanupConfirmed = false;
        }
      }
      if (workspaceCleanupConfirmed) {
        try {
          verifiedRemove(storage, registryKeys.installJournal);
        } catch {
          // Le prochain chargement répétera un nettoyage borné aux mêmes clés.
        }
      }
    }
    throw error;
  }
}

export function activateInstalledFormation(
  accountId: string,
  formation: InstalledFormation,
  suppliedStorage?: Storage
): void {
  const storage = storageOrWindow(suppliedStorage);
  const snapshot = loadFormationCatalog(accountId, storage);
  const installed = snapshot.formations.find((candidate) => candidate.instanceId === formation.instanceId);
  if (!installed) throw new Error("Cette formation n’est pas installée sur ce profil.");
  const workspaceError = formationCoreWorkspaceError(accountId, installed, storage);
  if (workspaceError) {
    throw new Error(`L’espace de cette formation ne peut pas être activé. ${workspaceError} Les données brutes ont été conservées.`);
  }
  const activeKey = formationRegistryStorageFor(accountId).active;
  verifiedSet(storage, activeKey, JSON.stringify(installed.instanceId));
}

export function assessmentDocumentRecordId(
  formation: Pick<InstalledFormation, "instanceId" | "storageKind">,
  recordId: string
): string {
  return formation.storageKind === "legacy-energy-year1"
    ? recordId
    : `${formation.instanceId}--${recordId}`;
}
