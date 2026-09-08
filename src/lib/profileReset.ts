import { defaultEvents, defaultSubjects, defaultTasks } from "../data/seed";
import { EMPTY_SUBJECT_NOTES_STORE } from "./subjectNotes";
import {
  applyPendingProfileReset,
  beginProfileReset,
  completeProfileReset,
  pendingProfileReset,
  PROFILE_RESET_RECORD_IDS,
  profileStoragePrefix,
  type ProfileResetEntry,
  type ProfileResetRecordId,
  workspaceStorageFor
} from "./profileStorage";
import { deleteAccountAssessmentDocuments } from "./tauri";

const MAX_ASSESSMENT_RESET_RECORDS = 5_000;
const ASSESSMENT_RECORD_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function freshProfileEntries(): ProfileResetEntry[] {
  // Le journal fixe cet ordre : les contenus personnels potentiellement
  // volumineux sont effacés avant de réinstaller le référentiel académique.
  return [
    ["conversations", []],
    ["freeChatConversations", []],
    ["freeChatActiveConversation", null],
    ["subjectNotes", EMPTY_SUBJECT_NOTES_STORE],
    ["assessments", []],
    ["subjects", defaultSubjects],
    ["events", defaultEvents],
    ["tasks", defaultTasks],
    ["selectedSubject", defaultSubjects[0]?.id ?? null]
  ];
}

function safeAssessmentRecordIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const recordIds = new Set<string>();
  for (const candidate of value) {
    if (
      candidate &&
      typeof candidate === "object" &&
      !Array.isArray(candidate) &&
      "id" in candidate &&
      typeof candidate.id === "string" &&
      ASSESSMENT_RECORD_ID.test(candidate.id)
    ) {
      recordIds.add(candidate.id);
    }
  }
  return [...recordIds];
}

function persistedAssessmentRecordIds(accountId: string): string[] {
  const raw = window.localStorage.getItem(workspaceStorageFor(accountId).assessments);
  if (raw === null) return [];
  try {
    return safeAssessmentRecordIds(JSON.parse(raw));
  } catch {
    return [];
  }
}

function assertCompleteResetIntent(recordIds: readonly ProfileResetRecordId[]): void {
  if (
    recordIds.length !== PROFILE_RESET_RECORD_IDS.length ||
    recordIds.some((recordId, index) => recordId !== PROFILE_RESET_RECORD_IDS[index])
  ) {
    throw new Error("Le journal ne correspond pas à une réinitialisation complète du profil.");
  }
}

function ensureCompleteResetIntent(
  accountId: string,
  createWhenMissing: boolean
): readonly ProfileResetRecordId[] | null {
  const pendingRecordIds = pendingProfileReset(accountId);
  if (pendingRecordIds) assertCompleteResetIntent(pendingRecordIds);
  if (pendingRecordIds || !createWhenMissing) return pendingRecordIds;

  beginProfileReset(accountId, PROFILE_RESET_RECORD_IDS);
  const createdRecordIds = pendingProfileReset(accountId);
  if (!createdRecordIds) throw new Error("Le journal de réinitialisation est absent.");
  assertCompleteResetIntent(createdRecordIds);
  return createdRecordIds;
}

async function deleteManagedAssessmentDocuments(accountId: string, recordIds: string[]): Promise<void> {
  if (recordIds.length === 0) {
    await deleteAccountAssessmentDocuments(accountId, []);
    return;
  }
  for (let offset = 0; offset < recordIds.length; offset += MAX_ASSESSMENT_RESET_RECORDS) {
    await deleteAccountAssessmentDocuments(
      accountId,
      recordIds.slice(offset, offset + MAX_ASSESSMENT_RESET_RECORDS)
    );
  }
}

function deleteProfileRecoveries(accountId: string): void {
  const prefix = profileStoragePrefix(accountId);
  const recoveryKeys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(prefix) && key.endsWith(".recovery")) recoveryKeys.push(key);
  }
  for (const recoveryKey of recoveryKeys) {
    window.localStorage.removeItem(recoveryKey);
    if (window.localStorage.getItem(recoveryKey) !== null) {
      throw new Error("Une ancienne copie de récupération n’a pas pu être supprimée.");
    }
  }
}

/**
 * Termine un reset déjà journalisé, avant le montage des hooks du profil.
 */
export async function resumeInterruptedProfileReset(accountId: string): Promise<boolean> {
  const pendingRecordIds = ensureCompleteResetIntent(accountId, false);
  if (!pendingRecordIds) return false;
  // Le nettoyage natif précède toute suppression des évaluations locales :
  // après un crash, leurs IDs restent donc disponibles tant qu'ils sont utiles
  // à la migration/suppression des anciens PDF globaux.
  await deleteManagedAssessmentDocuments(accountId, persistedAssessmentRecordIds(accountId));
  applyPendingProfileReset(accountId, freshProfileEntries());
  deleteProfileRecoveries(accountId);
  completeProfileReset(accountId);
  return true;
}

/**
 * Journalise puis exécute l'ensemble du reset. Le marqueur reste en place si
 * le processus s'arrête ou si le nettoyage natif échoue, afin que la prochaine
 * connexion puisse reprendre la même opération de manière idempotente.
 */
export async function resetLocalProfile(
  accountId: string,
  assessmentRecordIds: string[],
  afterLocalReset?: () => void | Promise<void>
): Promise<void> {
  ensureCompleteResetIntent(accountId, true);
  await deleteManagedAssessmentDocuments(accountId, safeAssessmentRecordIds(
    assessmentRecordIds.map((id) => ({ id }))
  ));
  applyPendingProfileReset(accountId, freshProfileEntries());
  deleteProfileRecoveries(accountId);
  completeProfileReset(accountId);
  // L'interface ne redevient interactive qu'une fois le journal finalisé :
  // une reprise ne pourra donc jamais effacer du travail créé après le reset.
  await afterLocalReset?.();
}
