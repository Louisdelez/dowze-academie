import { appStorage } from "./appStorage";
export const WORKSPACE_STORAGE = {
  subjects: "etude.subjects.energy-year1.v2",
  events: "etude.events.energy-year1.v2",
  tasks: "etude.tasks.energy-year1.v2",
  conversations: "etude.conversations.energy-year1.v2",
  assessments: "etude.assessments.energy-year1.v1",
  provider: "etude.ai-provider.v1",
  aiVisible: "etude.ai-visible.v1",
  aiWidth: "etude.ai-width.v1",
  selectedSubject: "etude.selected-subject.energy-year1.v2",
  calendarView: "etude.calendar-view.v1",
  academicScheduleRevision: "etude.academic-schedule-revision.energy-year1.v1",
  subjectNotes: "etude.subject-notes.energy-year1.v1",
  freeChatConversations: "etude.free-chat.conversations.v1",
  freeChatActiveConversation: "etude.free-chat.active.v1",
  freeChatConfig: "etude.free-chat.config.v1",
  freeChatBackend: "etude.free-chat.backend.v1",
  notesHistoryOpen: "etude.notes-history-open",
  notesCoursesSidebarOpen: "etude.notes-courses-sidebar-open",
  resetJournal: "etude.reset-journal.v2"
} as const;

export type WorkspaceStorageKeys = {
  [Key in keyof typeof WORKSPACE_STORAGE]: string;
};

export const FORMATION_REGISTRY_STORAGE = {
  registry: "formations.registry.v1",
  active: "formations.active.v1",
  installJournal: "formations.install-journal.v1"
} as const;

export type FormationRegistryStorageKeys = {
  [Key in keyof typeof FORMATION_REGISTRY_STORAGE]: string;
};

export type FormationStorageIdentity = {
  instanceId: string;
  storageKind: "legacy-energy-year1" | "formation-v1";
};

export const PROFILE_RESET_RECORD_IDS = [
  "conversations",
  "freeChatConversations",
  "freeChatActiveConversation",
  "subjectNotes",
  "assessments",
  "subjects",
  "events",
  "tasks",
  "selectedSubject"
] as const satisfies ReadonlyArray<keyof typeof WORKSPACE_STORAGE>;

export type ProfileResetRecordId = typeof PROFILE_RESET_RECORD_IDS[number];
export type ProfileResetEntry = readonly [ProfileResetRecordId, unknown];

const PROFILE_STORAGE_PREFIX = "etude.profile.v1";
const FORMATION_DATA_STORAGE_PREFIX = "formations.data.v1";
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const LEGACY_WORKSPACE_KEYS = [
  ...Object.entries(WORKSPACE_STORAGE)
    .filter(([name]) => name !== "resetJournal")
    .map(([, key]) => key),
  "etude.subjects.v1",
  "etude.events.v1",
  "etude.tasks.v1",
  "etude.conversations.v1",
  "etude.selected-subject.v1"
] as const;

const LEGACY_WORKSPACE_PURGE_KEYS = [...new Set([
  ...LEGACY_WORKSPACE_KEYS,
  WORKSPACE_STORAGE.resetJournal,
  ...LEGACY_WORKSPACE_KEYS.map((key) => `${key}.recovery`),
  `${WORKSPACE_STORAGE.resetJournal}.recovery`
])];

export function isValidLocalAccountId(accountId: string): boolean {
  return /^[0-9a-f]{32}$/.test(accountId) ||
    UUID_V4_PATTERN.test(accountId);
}

export function profileStoragePrefix(accountId: string): string {
  if (!isValidLocalAccountId(accountId)) {
    throw new Error("Identifiant de compte local invalide.");
  }
  return `${PROFILE_STORAGE_PREFIX}.${accountId}.`;
}

export function profileStorageKey(accountId: string, baseKey: string): string {
  const suffix = baseKey.startsWith("etude.") ? baseKey.slice("etude.".length) : baseKey;
  return `${profileStoragePrefix(accountId)}${suffix}`;
}

export function workspaceStorageFor(accountId: string): WorkspaceStorageKeys {
  return Object.fromEntries(
    Object.entries(WORKSPACE_STORAGE).map(([name, key]) => [name, profileStorageKey(accountId, key)])
  ) as WorkspaceStorageKeys;
}

export function formationRegistryStorageFor(accountId: string): FormationRegistryStorageKeys {
  return Object.fromEntries(
    Object.entries(FORMATION_REGISTRY_STORAGE)
      .map(([name, suffix]) => [name, profileStorageKey(accountId, suffix)])
  ) as FormationRegistryStorageKeys;
}

function formationRecordSuffix(baseKey: string): string {
  const suffix = baseKey.startsWith("etude.") ? baseKey.slice("etude.".length) : baseKey;
  return suffix.replace(".energy-year1", "");
}

export function formationStorageFor(
  accountId: string,
  formation: FormationStorageIdentity
): WorkspaceStorageKeys {
  if (formation.storageKind === "legacy-energy-year1") {
    return workspaceStorageFor(accountId);
  }
  if (formation.storageKind !== "formation-v1") {
    throw new Error("Type de stockage de formation invalide.");
  }
  if (!UUID_V4_PATTERN.test(formation.instanceId)) {
    throw new Error("Identifiant d’instance de formation invalide.");
  }

  const prefix = `${profileStoragePrefix(accountId)}${FORMATION_DATA_STORAGE_PREFIX}.${formation.instanceId}.`;
  return Object.fromEntries(
    Object.entries(WORKSPACE_STORAGE)
      .map(([name, key]) => [name, `${prefix}${formationRecordSuffix(key)}`])
  ) as WorkspaceStorageKeys;
}

/**
 * Supprime définitivement l'ancien espace global avant la création du premier
 * compte. Les espaces de profils et les réglages d'authentification ne sont
 * jamais ciblés par cette liste fermée.
 */
export function clearLegacyWorkspaceData(storage: Storage = appStorage): number {
  let removed = 0;
  for (const key of LEGACY_WORKSPACE_PURGE_KEYS) {
    if (storage.getItem(key) === null) continue;
    storage.removeItem(key);
    if (storage.getItem(key) !== null) {
      throw new Error("La remise à zéro des anciennes données locales a échoué.");
    }
    removed += 1;
  }
  return removed;
}

export function profileRecoveryKeys(
  accountId: string,
  storage: Storage = appStorage
): string[] {
  const prefix = profileStoragePrefix(accountId);
  const keys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(prefix) && key.endsWith(".recovery")) keys.push(key);
    }
  } catch {
    return [];
  }
  return keys;
}

/**
 * Énumère uniquement les copies de récupération appartenant à l’année active.
 * Les autres formations et les métadonnées du registre restent hors de l’export.
 */
export function formationRecoveryKeys(
  accountId: string,
  formation: FormationStorageIdentity,
  storage: Storage = appStorage
): string[] {
  const workspaceKeys = Object.values(formationStorageFor(accountId, formation));
  const keys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key?.endsWith(".recovery")) continue;
      if (workspaceKeys.some((workspaceKey) =>
        key === `${workspaceKey}.recovery` || key.startsWith(`${workspaceKey}.`)
      )) {
        keys.push(key);
      }
    }
  } catch {
    return [];
  }
  return keys;
}

/**
 * Retire uniquement les copies de récupération de l’espace historique annuel.
 * Les registres et espaces UUID des autres formations du compte sont exclus.
 */
export function clearWorkspaceRecoveryData(
  accountId: string,
  storage: Storage = appStorage
): number {
  const recoveryKeys = Object.values(workspaceStorageFor(accountId))
    .map((key) => `${key}.recovery`);
  let removed = 0;
  for (const recoveryKey of recoveryKeys) {
    if (storage.getItem(recoveryKey) === null) continue;
    storage.removeItem(recoveryKey);
    if (storage.getItem(recoveryKey) !== null) {
      throw new Error("Une ancienne copie de récupération n’a pas pu être supprimée.");
    }
    removed += 1;
  }
  return removed;
}

interface ProfileResetIntent {
  version: 2;
  accountId: string;
  createdAt: string;
  applied: boolean;
  recordIds: ProfileResetRecordId[];
}

const PROFILE_RESET_RECORD_ID_SET = new Set<string>(PROFILE_RESET_RECORD_IDS);
const PROFILE_RESET_JOURNAL_MAX_LENGTH = 4_096;
const PROFILE_RESET_JOURNAL_FIELDS = new Set([
  "version", "accountId", "createdAt", "applied", "recordIds"
]);

function validateResetRecordIds(value: unknown): ProfileResetRecordId[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > PROFILE_RESET_RECORD_IDS.length ||
    value.some((recordId) => typeof recordId !== "string" || !PROFILE_RESET_RECORD_ID_SET.has(recordId)) ||
    new Set(value).size !== value.length
  ) {
    throw new Error("Les enregistrements du reset de profil sont invalides.");
  }
  return [...value] as ProfileResetRecordId[];
}

function parseResetIntent(accountId: string, raw: string): ProfileResetIntent {
  if (raw.length > PROFILE_RESET_JOURNAL_MAX_LENGTH) {
    throw new Error("Le journal de réinitialisation dépasse la taille autorisée.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Le journal de réinitialisation est illisible.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Le journal de réinitialisation est illisible.");
  }
  const journal = parsed as Partial<ProfileResetIntent>;
  if (
    Object.keys(journal).some((field) => !PROFILE_RESET_JOURNAL_FIELDS.has(field)) ||
    journal.version !== 2 ||
    journal.accountId !== accountId ||
    typeof journal.createdAt !== "string" ||
    journal.createdAt.length > 64 ||
    !Number.isFinite(Date.parse(journal.createdAt)) ||
    typeof journal.applied !== "boolean"
  ) {
    throw new Error("Le journal de réinitialisation ne correspond pas à ce profil.");
  }
  return {
    version: 2,
    accountId,
    createdAt: journal.createdAt,
    applied: journal.applied,
    recordIds: validateResetRecordIds(journal.recordIds)
  };
}

/**
 * Lit et valide le petit journal d’intention d’un profil, sans toucher aux
 * données. Les identifiants sont une liste fermée, jamais des clés Storage.
 */
export function pendingProfileReset(
  accountId: string,
  storage: Storage = appStorage
): ProfileResetRecordId[] | null {
  const raw = storage.getItem(workspaceStorageFor(accountId).resetJournal);
  return raw === null ? null : parseResetIntent(accountId, raw).recordIds;
}

/**
 * Démarre un reset récupérable. Un appel répété avec la même intention est
 * idempotent ; une intention différente doit d’abord être terminée.
 */
export function beginProfileReset(
  accountId: string,
  recordIds: readonly ProfileResetRecordId[],
  storage: Storage = appStorage
): void {
  const validatedRecordIds = validateResetRecordIds(recordIds);
  const journalKey = workspaceStorageFor(accountId).resetJournal;
  const existingRaw = storage.getItem(journalKey);
  if (existingRaw !== null) {
    const existing = parseResetIntent(accountId, existingRaw);
    if (
      existing.recordIds.length === validatedRecordIds.length &&
      existing.recordIds.every((recordId, index) => recordId === validatedRecordIds[index])
    ) return;
    throw new Error("Un autre reset de ce profil est déjà en attente.");
  }

  const serializedJournal = JSON.stringify({
    version: 2,
    accountId,
    createdAt: new Date().toISOString(),
    applied: false,
    recordIds: validatedRecordIds
  } satisfies ProfileResetIntent);
  storage.setItem(journalKey, serializedJournal);
  if (storage.getItem(journalKey) !== serializedJournal) {
    throw new Error("Le journal d’intention du reset n’a pas pu être vérifié.");
  }
}

/**
 * Applique ou reprend l’intention enregistrée. Chaque ancienne valeur est
 * d’abord retirée afin de ne pas doubler l’espace requis, puis la nouvelle est
 * écrite et vérifiée. Le journal reste en place jusqu’à completeProfileReset.
 */
export function applyPendingProfileReset(
  accountId: string,
  entries: ReadonlyArray<ProfileResetEntry>,
  storage: Storage = appStorage
): void {
  const storageKeys = workspaceStorageFor(accountId);
  const rawJournal = storage.getItem(storageKeys.resetJournal);
  if (rawJournal === null) {
    throw new Error("Aucun reset de ce profil n’est en attente.");
  }
  const intent = parseResetIntent(accountId, rawJournal);
  const { recordIds } = intent;

  const serializedByRecordId = new Map<ProfileResetRecordId, string>();
  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length !== 2) {
      throw new Error("Le contenu du reset de profil est invalide.");
    }
    const [recordId, value] = entry;
    if (!PROFILE_RESET_RECORD_ID_SET.has(recordId) || serializedByRecordId.has(recordId)) {
      throw new Error("Le contenu du reset de profil est invalide.");
    }
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new Error(`La valeur de ${recordId} ne peut pas être enregistrée.`);
    }
    serializedByRecordId.set(recordId, serialized);
  }
  if (
    serializedByRecordId.size !== recordIds.length ||
    recordIds.some((recordId) => !serializedByRecordId.has(recordId))
  ) {
    throw new Error("Le contenu du reset ne correspond pas au journal d’intention.");
  }

  try {
    for (const recordId of recordIds) {
      const key = storageKeys[recordId];
      const serialized = serializedByRecordId.get(recordId)!;
      storage.removeItem(key);
      if (storage.getItem(key) !== null) {
        throw new Error(`La suppression de ${recordId} n’a pas pu être vérifiée.`);
      }
      storage.setItem(key, serialized);
      if (storage.getItem(key) !== serialized) {
        throw new Error(`L’écriture de ${recordId} n’a pas pu être vérifiée.`);
      }
    }
    const appliedJournal = JSON.stringify({ ...intent, applied: true } satisfies ProfileResetIntent);
    storage.setItem(storageKeys.resetJournal, appliedJournal);
    if (storage.getItem(storageKeys.resetJournal) !== appliedJournal) {
      throw new Error("La validation finale du journal d’intention a échoué.");
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Réinitialisation interrompue ; elle sera reprise au prochain login. ${detail}`);
  }
}

/** Finalise un reset appliqué en supprimant uniquement son journal d’intention. */
export function completeProfileReset(
  accountId: string,
  storage: Storage = appStorage
): boolean {
  const journalKey = workspaceStorageFor(accountId).resetJournal;
  const rawJournal = storage.getItem(journalKey);
  if (rawJournal === null) return false;
  const intent = parseResetIntent(accountId, rawJournal);
  if (!intent.applied) {
    throw new Error("Le reset de profil doit être entièrement appliqué avant sa finalisation.");
  }
  storage.removeItem(journalKey);
  if (storage.getItem(journalKey) !== null) {
    throw new Error("Le journal d’intention du reset n’a pas pu être finalisé.");
  }
  return true;
}
