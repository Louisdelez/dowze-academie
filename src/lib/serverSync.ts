import { ownsNotebookMediaDocument } from './notebookDocument.ts';
export const SYNC_TYPES = ['notesMarkdown', 'whiteboard', 'planning', 'progression', 'examens', 'conversations', 'tasks', 'formation', 'preferences'] as const;
export type SyncType = typeof SYNC_TYPES[number];
export interface SyncDocument { type: SyncType; id: string; content: Record<string, unknown> }
export interface RemoteDocument { document_type: SyncType; document_id: string; version: number; content: Record<string, unknown> | null; deleted: boolean }
export interface Baseline { version: number; content: Record<string, unknown> | null }
export interface SyncConflict { local: SyncDocument | null; remote: RemoteDocument }
export interface SyncState { schema: 1; cursor?: string; base: Record<string, Baseline>; deletions: Record<string, { id: string; version: number }>; pending: Record<string, { id: string; document: SyncDocument; baseVersion: number }>; conflicts: Record<string, SyncConflict>; resolved: SyncConflict[] }
export const emptySyncState = (): SyncState => ({ schema: 1, base: {}, deletions: {}, pending: {}, conflicts: {}, resolved: [] });
export const documentKey = (document: { type: string; id: string }) => `${document.type}|${document.id}`;
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`;
}
export interface SyncTransport {
  changes(cursor?: string): Promise<{ items: RemoteDocument[]; has_more: boolean; next_cursor: string }>;
  remove(type: SyncType, id: string, version: number, mutationId: string): Promise<{ version: number }>;
  put(document: SyncDocument, version: number, mutationId: string): Promise<{ version: number }>;
}
/** Persist the idempotency key before any write; never replace concurrent local edits. */
export async function syncDocuments(options: {
  state: SyncState; save: () => void | Promise<void>; documents: () => SyncDocument[]; apply: (document: RemoteDocument) => boolean;
  transport: SyncTransport; current: () => boolean; id: () => string;
  pristine?: (document: SyncDocument) => boolean;
  /** Defer dependent writes without hiding documents from deletion detection. */
  canPublish?: (document:SyncDocument)=>boolean|Promise<boolean>;
  /** Re-read the complete inventory at durable boundaries; never run a second writer. */
  prioritizeNotes?: boolean;
}) {
  const { state, save, documents, apply, transport, current, id } = options;
  const all = new Map<string, RemoteDocument>(); let cursor: string | undefined = state.cursor;
  let nextCursor = cursor;
  const seen = new Set<string>();
  do {
    if (!current()) return;
    const page = await transport.changes(cursor);
    for (const item of page.items) {
      if (!SYNC_TYPES.includes(item.document_type) || ownsNotebookMediaDocument(item.document_type, item.document_id)) continue;
      const key = documentKey({ type: item.document_type, id: item.document_id });
      if ((all.get(key)?.version ?? 0) < item.version) all.set(key, item);
    }
    nextCursor = page.next_cursor || nextCursor;
    if (page.has_more && (!page.next_cursor || seen.has(page.next_cursor))) throw new Error('Pagination de synchronisation incohérente.');
    if (page.next_cursor) seen.add(page.next_cursor);
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  if (!current()) return;
  for (const [key, remote] of all) {
    const local = documents().find(item => documentKey(item) === key);
    const base = state.base[key];
    const content = remote.deleted ? null : remote.content;
    const pending = state.pending[key];
    const deletion = state.deletions[key];
    if (deletion && remote.deleted && remote.version === deletion.version + 1) {
      state.base[key] = { version: remote.version, content: null };
      delete state.deletions[key]; delete state.conflicts[key]; await save(); continue;
    }
    if (pending && canonical(pending.document.content) === canonical(content) && remote.version === pending.baseVersion + 1) {
      state.base[key] = { version: remote.version, content }; delete state.pending[key]; await save(); continue;
    }
    if (base?.version === remote.version && !state.conflicts[key]) continue;
    if (local && canonical(local.content) === canonical(content)) {
      state.base[key] = { version: remote.version, content }; delete state.conflicts[key]; await save(); continue;
    }
    if ((!local && !base && !remote.deleted) || (!base && local && options.pristine?.(local)) || (base && canonical(local?.content ?? null) === canonical(base.content))) {
      if (!apply(remote)) throw new Error('La modification serveur ne peut pas être enregistrée localement.');
      state.base[key] = { version: remote.version, content }; delete state.conflicts[key]; await save();
    } else if (!local && remote.deleted) {
      state.base[key] = { version: remote.version, content: null }; await save();
    } else {
      state.conflicts[key] = { local: local ?? null, remote }; await save();
    }
  }
  // Commit the cursor only after every received change has been durably handled.
  if (nextCursor && nextCursor !== state.cursor) { state.cursor = nextCursor; await save(); }
  for (const [key, base] of Object.entries(state.base)) {
    if (!current()) return;
    if (ownsNotebookMediaDocument(key.split('|')[0], key.split('|')[1]) || !base.content || state.conflicts[key] || documents().some(item => documentKey(item) === key)) continue;
    const deletion = state.deletions[key] ?? { id: id(), version: base.version };
    state.deletions[key] = deletion; await save();
    const separator=key.indexOf('|'),type=key.slice(0,separator),documentId=key.slice(separator+1);
    const response = await transport.remove(type as SyncType, documentId, deletion.version, deletion.id);
    if (!current()) return;
    state.base[key] = { version: response.version, content: null }; delete state.deletions[key]; await save();
  }
  function* publicationDocuments(): Generator<SyncDocument> {
    if (!options.prioritizeNotes) { yield* documents(); return; }
    const visited = new Set<string>(), attemptedNotes = new Set<string>();
    let noteTurn = true;
    while (current()) {
      let next: SyncDocument | undefined, note: SyncDocument | undefined, background: SyncDocument | undefined;
      const keys = new Set<string>();
      for (const candidate of documents()) {
        if (ownsNotebookMediaDocument(candidate.type, candidate.id)) continue;
        const key = documentKey(candidate);
        if (keys.has(key)) throw new Error('Identité de synchronisation dupliquée ; les copies locales sont conservées.');
        keys.add(key);
        if (!visited.has(key)) {
          next ??= candidate;
          if (candidate.type !== 'notesMarkdown') background ??= candidate;
        }
        if (!note && candidate.type === 'notesMarkdown' && !attemptedNotes.has(JSON.stringify([key,canonical(candidate.content)])) && !state.conflicts[key] &&
            canonical(state.base[key]?.content) !== canonical(candidate.content)) note = candidate;
      }
      const selected: SyncDocument | undefined = note && (noteTurn || !background) ? note : !noteTurn && background ? background : next;
      if (!selected) return;
      const key = documentKey(selected);
      visited.add(key);
      // A clean note may become dirty later in this same pass. A dirty note gets
      // one attempt per exact content; an edit after its ACK can publish at the
      // next durable boundary. The same deferred content cannot spin or revive
      // after A→B→A in this pass.
      if (selected.type === 'notesMarkdown' && (state.conflicts[key] ||
          canonical(state.base[key]?.content) !== canonical(selected.content))) attemptedNotes.add(JSON.stringify([key,canonical(selected.content)]));
      noteTurn = selected.type !== 'notesMarkdown';
      yield selected;
    }
  }
  for (const document of publicationDocuments()) {
    if (ownsNotebookMediaDocument(document.type, document.id)) continue;
    if (!current()) return;
    const key = documentKey(document);
    if (state.conflicts[key] && canonical(state.conflicts[key].local) !== canonical(document)) {
      state.conflicts[key] = { ...state.conflicts[key], local: document }; await save();
    }
    if (state.conflicts[key] || canonical(state.base[key]?.content) === canonical(document.content)) continue;
    const mutation = state.pending[key] ?? { id: id(), document, baseVersion: state.base[key]?.version ?? 0 };
    if(options.canPublish&&!await options.canPublish(mutation.document))continue;
    if(!current())return;
    state.pending[key] = mutation; await save();
    if (!current()) return;
    const response = await transport.put(mutation.document, mutation.baseVersion, mutation.id);
    if (!current()) return;
    state.base[key] = { version: response.version, content: mutation.document.content }; delete state.pending[key]; await save();
  }
}
