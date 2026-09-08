import type { SubjectNoteDocument, SubjectNotesStore } from "../types";

export interface LegacySubjectNoteDocumentV1 {
  id: string;
  subjectId: string;
  title: string;
  markdown: string;
  createdAt: string;
  updatedAt: string;
}

export interface LegacySubjectNotesStoreV1 {
  schemaVersion: 1;
  documents: LegacySubjectNoteDocumentV1[];
  activeDocumentBySubject: Record<string, string>;
}

export type PersistedSubjectNotesStore = LegacySubjectNotesStoreV1 | SubjectNotesStore;

export interface CreateSubjectNoteOptions {
  id?: string;
  now?: string;
  title?: string;
  markdown?: string;
  subjectIds?: string[];
  tags?: string[];
  /** Les nouvelles notes sont ouvertes et activées par défaut. */
  open?: boolean;
}

export const EMPTY_SUBJECT_NOTES_STORE: SubjectNotesStore = {
  schemaVersion: 2,
  documents: [],
  openDocumentIds: [],
  activeDocumentId: null
};

const MAX_DOCUMENT_ID_LENGTH = 200;
const MAX_SUBJECTS_PER_NOTE = 50;
const MAX_TAGS_PER_NOTE = 30;
const MAX_TAG_LENGTH = 64;
const MAX_TITLE_LENGTH = 500;

const V1_STORE_FIELDS = new Set(["schemaVersion", "documents", "activeDocumentBySubject"]);
const V1_DOCUMENT_FIELDS = new Set([
  "id", "subjectId", "title", "markdown", "createdAt", "updatedAt"
]);
const V2_STORE_FIELDS = new Set([
  "schemaVersion", "documents", "openDocumentIds", "activeDocumentId"
]);
const V2_DOCUMENT_FIELDS = new Set([
  "id", "title", "markdown", "subjectIds", "tags", "createdAt", "updatedAt"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyFields(value: Record<string, unknown>, fields: ReadonlySet<string>): boolean {
  return Object.keys(value).every((field) => fields.has(field));
}

function validText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function validIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isNormalizedSubjectIds(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length > MAX_SUBJECTS_PER_NOTE) return false;
  const seen = new Set<string>();
  return value.every((subjectId) => {
    if (
      !validText(subjectId, MAX_DOCUMENT_ID_LENGTH) ||
      subjectId !== subjectId.trim() ||
      seen.has(subjectId)
    ) return false;
    seen.add(subjectId);
    return true;
  });
}

function isNormalizedTags(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length > MAX_TAGS_PER_NOTE) return false;
  const seen = new Set<string>();
  return value.every((tag) => {
    if (!validText(tag, MAX_TAG_LENGTH) || tag !== tag.trim()) return false;
    const comparisonKey = tag.toLocaleLowerCase("fr");
    if (seen.has(comparisonKey)) return false;
    seen.add(comparisonKey);
    return true;
  });
}

function normalizeSubjectIds(value: unknown, fallbackSubjectId?: unknown): string[] {
  const source = Array.isArray(value)
    ? value
    : validText(fallbackSubjectId, MAX_DOCUMENT_ID_LENGTH)
      ? [fallbackSubjectId]
      : [];
  const seen = new Set<string>();
  const subjectIds: string[] = [];
  for (const candidate of source) {
    if (typeof candidate !== "string") continue;
    const subjectId = candidate.trim();
    if (!validText(subjectId, MAX_DOCUMENT_ID_LENGTH) || seen.has(subjectId)) continue;
    seen.add(subjectId);
    subjectIds.push(subjectId);
    if (subjectIds.length >= MAX_SUBJECTS_PER_NOTE) break;
  }
  return subjectIds;
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const candidate of value) {
    if (typeof candidate !== "string") continue;
    const tag = candidate.trim().slice(0, MAX_TAG_LENGTH).trim();
    const comparisonKey = tag.toLocaleLowerCase("fr");
    if (!tag || seen.has(comparisonKey)) continue;
    seen.add(comparisonKey);
    tags.push(tag);
    if (tags.length >= MAX_TAGS_PER_NOTE) break;
  }
  return tags;
}

function normalizeIdList(value: unknown, validIds: ReadonlySet<string>): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((id): id is string => {
    if (typeof id !== "string" || !validIds.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function isLegacyDocument(value: unknown): value is LegacySubjectNoteDocumentV1 {
  if (!isRecord(value) || !hasOnlyFields(value, V1_DOCUMENT_FIELDS)) return false;
  return validText(value.id, MAX_DOCUMENT_ID_LENGTH) &&
    validText(value.subjectId, MAX_DOCUMENT_ID_LENGTH) &&
    value.subjectId === value.subjectId.trim() &&
    typeof value.title === "string" && value.title.length <= MAX_TITLE_LENGTH &&
    typeof value.markdown === "string" &&
    validIsoDate(value.createdAt) &&
    validIsoDate(value.updatedAt);
}

function isV2Document(value: unknown): value is SubjectNoteDocument {
  if (!isRecord(value) || !hasOnlyFields(value, V2_DOCUMENT_FIELDS)) return false;
  return validText(value.id, MAX_DOCUMENT_ID_LENGTH) &&
    typeof value.title === "string" && value.title.length <= MAX_TITLE_LENGTH &&
    typeof value.markdown === "string" &&
    isNormalizedSubjectIds(value.subjectIds) &&
    isNormalizedTags(value.tags) &&
    validIsoDate(value.createdAt) &&
    validIsoDate(value.updatedAt);
}

export function isLegacySubjectNotesStore(value: unknown): value is LegacySubjectNotesStoreV1 {
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, V1_STORE_FIELDS) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.documents) ||
    !isRecord(value.activeDocumentBySubject)
  ) return false;

  const documentsById = new Map<string, LegacySubjectNoteDocumentV1>();
  for (const document of value.documents) {
    if (!isLegacyDocument(document) || documentsById.has(document.id)) return false;
    documentsById.set(document.id, document);
  }
  return Object.entries(value.activeDocumentBySubject).every(([subjectId, documentId]) => {
    if (!validText(subjectId, MAX_DOCUMENT_ID_LENGTH) || subjectId !== subjectId.trim()) return false;
    if (typeof documentId !== "string") return false;
    const document = documentsById.get(documentId);
    return document?.subjectId === subjectId;
  });
}

export function isSubjectNotesStore(value: unknown): value is SubjectNotesStore {
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, V2_STORE_FIELDS) ||
    value.schemaVersion !== 2 ||
    !Array.isArray(value.documents) ||
    !Array.isArray(value.openDocumentIds) ||
    !(value.activeDocumentId === null || typeof value.activeDocumentId === "string")
  ) return false;

  const documentIds = new Set<string>();
  for (const document of value.documents) {
    if (!isV2Document(document) || documentIds.has(document.id)) return false;
    documentIds.add(document.id);
  }
  const openIds = new Set<string>();
  for (const documentId of value.openDocumentIds) {
    if (typeof documentId !== "string" || !documentIds.has(documentId) || openIds.has(documentId)) {
      return false;
    }
    openIds.add(documentId);
  }
  // `null` sélectionne l’onglet de page permanent, même si des notes restent
  // ouvertes en arrière-plan comme dans un IDE.
  return value.activeDocumentId === null || openIds.has(value.activeDocumentId);
}

/** Accepte strictement les deux formats réellement persistés. */
export function isPersistedSubjectNotesStore(value: unknown): value is PersistedSubjectNotesStore {
  return isLegacySubjectNotesStore(value) || isSubjectNotesStore(value);
}

/** Alias explicite destiné au chargement résilient du stockage local. */
export const isRecoverableSubjectNotesStore = isPersistedSubjectNotesStore;

function normalizedDocument(value: unknown, schemaVersion: 1 | 2): SubjectNoteDocument | null {
  if (!isRecord(value)) return null;
  if (
    !validText(value.id, MAX_DOCUMENT_ID_LENGTH) ||
    typeof value.title !== "string" ||
    value.title.length > MAX_TITLE_LENGTH ||
    typeof value.markdown !== "string" ||
    !validIsoDate(value.createdAt) ||
    !validIsoDate(value.updatedAt)
  ) return null;
  if (schemaVersion === 1 && !validText(value.subjectId, MAX_DOCUMENT_ID_LENGTH)) return null;

  return {
    id: value.id,
    title: value.title,
    markdown: value.markdown,
    subjectIds: normalizeSubjectIds(value.subjectIds, schemaVersion === 1 ? value.subjectId : undefined),
    tags: schemaVersion === 2 ? normalizeTags(value.tags) : [],
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  };
}

/**
 * Migre le schéma v1 matière-par-matière vers le schéma v2 global, puis
 * rétablit tous les invariants. Le Markdown utilisateur n’est jamais transformé.
 */
export function normalizeSubjectNotesStore(value: unknown): SubjectNotesStore {
  if (!isRecord(value) || (value.schemaVersion !== 1 && value.schemaVersion !== 2)) {
    return { ...EMPTY_SUBJECT_NOTES_STORE };
  }
  const schemaVersion = value.schemaVersion;
  const seenIds = new Set<string>();
  const documents = (Array.isArray(value.documents) ? value.documents : [])
    .map((document) => normalizedDocument(document, schemaVersion))
    .filter((document): document is SubjectNoteDocument => {
      if (!document || seenIds.has(document.id)) return false;
      seenIds.add(document.id);
      return true;
    });
  const validIds = new Set(documents.map((document) => document.id));

  let openDocumentIds: string[];
  let requestedActiveDocumentId: unknown;
  if (schemaVersion === 1) {
    const activeBySubject = isRecord(value.activeDocumentBySubject)
      ? value.activeDocumentBySubject
      : {};
    const validLegacyActiveIds = Object.entries(activeBySubject)
      .filter(([subjectId, documentId]) => typeof documentId === "string" && documents.some((document) =>
        document.id === documentId && document.subjectIds.includes(subjectId)
      ))
      .map(([, documentId]) => documentId);
    openDocumentIds = normalizeIdList(validLegacyActiveIds, validIds);
    requestedActiveDocumentId = openDocumentIds
      .map((id) => documents.find((document) => document.id === id))
      .filter((document): document is SubjectNoteDocument => Boolean(document))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]?.id;
  } else {
    openDocumentIds = normalizeIdList(value.openDocumentIds, validIds);
    requestedActiveDocumentId = value.activeDocumentId;
  }

  const activeDocumentId = requestedActiveDocumentId === null
    ? null
    : typeof requestedActiveDocumentId === "string" && openDocumentIds.includes(requestedActiveDocumentId)
      ? requestedActiveDocumentId
      : openDocumentIds[0] ?? null;

  return {
    schemaVersion: 2,
    documents,
    openDocumentIds,
    activeDocumentId
  };
}

export function activeNoteDocument(store: SubjectNotesStore): SubjectNoteDocument | undefined {
  const normalized = normalizeSubjectNotesStore(store);
  return normalized.documents.find((document) => document.id === normalized.activeDocumentId);
}

export function openNoteDocuments(store: SubjectNotesStore): SubjectNoteDocument[] {
  const normalized = normalizeSubjectNotesStore(store);
  const byId = new Map(normalized.documents.map((document) => [document.id, document]));
  return normalized.openDocumentIds
    .map((id) => byId.get(id))
    .filter((document): document is SubjectNoteDocument => Boolean(document));
}

/** Compatibilité : retrouve la note active liée à une matière, ou la plus récente. */
export function activeSubjectNote(
  store: SubjectNotesStore,
  subjectId: string
): SubjectNoteDocument | undefined {
  const normalized = normalizeSubjectNotesStore(store);
  const active = normalized.documents.find((document) =>
    document.id === normalized.activeDocumentId && document.subjectIds.includes(subjectId)
  );
  if (active) return active;
  return normalized.documents
    .filter((document) => document.subjectIds.includes(subjectId))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
}

export function createSubjectNote(
  store: SubjectNotesStore,
  subjectId: string,
  options?: CreateSubjectNoteOptions
): { store: SubjectNotesStore; document: SubjectNoteDocument };
export function createSubjectNote(
  store: SubjectNotesStore,
  options?: CreateSubjectNoteOptions
): { store: SubjectNotesStore; document: SubjectNoteDocument };
export function createSubjectNote(
  store: SubjectNotesStore,
  subjectOrOptions: string | CreateSubjectNoteOptions = {},
  legacyOptions: CreateSubjectNoteOptions = {}
): { store: SubjectNotesStore; document: SubjectNoteDocument } {
  const legacySubjectId = typeof subjectOrOptions === "string" ? subjectOrOptions : undefined;
  const options = typeof subjectOrOptions === "string"
    ? { ...legacyOptions, subjectIds: legacyOptions.subjectIds ?? [subjectOrOptions] }
    : subjectOrOptions;
  const normalized = normalizeSubjectNotesStore(store);
  const id = options.id ?? crypto.randomUUID();
  if (!validText(id, MAX_DOCUMENT_ID_LENGTH) || normalized.documents.some((document) => document.id === id)) {
    throw new Error("L’identifiant de la note est invalide ou déjà utilisé.");
  }
  const now = options.now ?? new Date().toISOString();
  if (!validIsoDate(now)) throw new Error("La date de la note est invalide.");
  const subjectIds = normalizeSubjectIds(options.subjectIds);
  if (legacySubjectId !== undefined && subjectIds.length === 0) {
    throw new Error("La matière de la note est invalide.");
  }
  const document: SubjectNoteDocument = {
    id,
    title: options.title?.trim().slice(0, MAX_TITLE_LENGTH) || "Sans titre",
    markdown: typeof options.markdown === "string" ? options.markdown : "",
    subjectIds,
    tags: normalizeTags(options.tags),
    createdAt: now,
    updatedAt: now
  };
  const shouldOpen = options.open !== false;
  return {
    document,
    store: {
      schemaVersion: 2,
      documents: [document, ...normalized.documents],
      openDocumentIds: shouldOpen
        ? [...normalized.openDocumentIds, id]
        : normalized.openDocumentIds,
      activeDocumentId: shouldOpen ? id : normalized.activeDocumentId
    }
  };
}

export function openSubjectNote(store: SubjectNotesStore, documentId: string): SubjectNotesStore {
  const normalized = normalizeSubjectNotesStore(store);
  if (!normalized.documents.some((document) => document.id === documentId)) return normalized;
  return {
    ...normalized,
    openDocumentIds: normalized.openDocumentIds.includes(documentId)
      ? normalized.openDocumentIds
      : [...normalized.openDocumentIds, documentId],
    activeDocumentId: documentId
  };
}

export function activateSubjectNote(store: SubjectNotesStore, documentId: string): SubjectNotesStore {
  const normalized = normalizeSubjectNotesStore(store);
  if (!normalized.openDocumentIds.includes(documentId)) return normalized;
  return { ...normalized, activeDocumentId: documentId };
}

export const setActiveSubjectNote = activateSubjectNote;

export function closeSubjectNote(store: SubjectNotesStore, documentId: string): SubjectNotesStore {
  const normalized = normalizeSubjectNotesStore(store);
  const closingIndex = normalized.openDocumentIds.indexOf(documentId);
  if (closingIndex < 0) return normalized;
  const openDocumentIds = normalized.openDocumentIds.filter((id) => id !== documentId);
  const activeDocumentId = normalized.activeDocumentId === documentId
    ? openDocumentIds[Math.min(closingIndex, openDocumentIds.length - 1)] ?? null
    : normalized.activeDocumentId;
  return { ...normalized, openDocumentIds, activeDocumentId };
}

/** Compatibilité : ouvre une note seulement si elle est liée à la matière donnée. */
export function selectSubjectNote(
  store: SubjectNotesStore,
  subjectId: string,
  documentId: string
): SubjectNotesStore {
  const normalized = normalizeSubjectNotesStore(store);
  if (!normalized.documents.some((document) =>
    document.id === documentId && document.subjectIds.includes(subjectId)
  )) return normalized;
  return openSubjectNote(normalized, documentId);
}

export function updateSubjectNote(
  store: SubjectNotesStore,
  documentId: string,
  patch: Partial<Pick<SubjectNoteDocument, "title" | "markdown" | "subjectIds" | "tags">>,
  now = new Date().toISOString()
): SubjectNotesStore {
  const normalized = normalizeSubjectNotesStore(store);
  if (!validIsoDate(now) || !normalized.documents.some((document) => document.id === documentId)) {
    return normalized;
  }
  return {
    ...normalized,
    documents: normalized.documents.map((document) => document.id !== documentId
      ? document
      : {
          ...document,
          title: typeof patch.title === "string"
            ? patch.title.slice(0, MAX_TITLE_LENGTH)
            : document.title,
          markdown: typeof patch.markdown === "string" ? patch.markdown : document.markdown,
          subjectIds: patch.subjectIds === undefined
            ? document.subjectIds
            : normalizeSubjectIds(patch.subjectIds),
          tags: patch.tags === undefined ? document.tags : normalizeTags(patch.tags),
          updatedAt: now
        })
  };
}

export function deleteSubjectNote(store: SubjectNotesStore, documentId: string): SubjectNotesStore {
  const normalized = normalizeSubjectNotesStore(store);
  if (!normalized.documents.some((document) => document.id === documentId)) return normalized;
  const closed = closeSubjectNote(normalized, documentId);
  return {
    ...closed,
    documents: closed.documents.filter((document) => document.id !== documentId)
  };
}
