import { SLIME_PROGRESS_ID, emptySlimeProgress, isSlimeProgress, mergeSlimeProgress, slimeProgressKey } from './slimeProgress';
import type { InstalledFormation } from './formations';
import { formationStorageFor } from './profileStorage';
import { defaultSubjects, defaultEvents, defaultTasks } from '../data/seed';
import { isStoredSubjects, isStoredEvents, isStoredTasks } from './workspaceValidation';
import { isRecord, isStoredAssessments, isStoredConversations, isStoredFreeChatConversations } from './studyValidation';
import { EMPTY_SUBJECT_NOTES_STORE, isPersistedSubjectNotesStore, normalizeSubjectNotesStore, deleteSubjectNote } from './subjectNotes';
import { sharedFormationManifest } from './sharedFormation';
import { updateSharedFormationManifest } from './formationRegistry';
import { canonical, type RemoteDocument, type SyncDocument } from './serverSync';

/** Storage adapter for inactive years. Its caller must stop before that year becomes active. */
export function workspaceSyncStorage(accountId: string, formation: InstalledFormation, storage: Storage) {
  const keys = formationStorageFor(accountId, formation);
  const legacy = formation.storageKind === 'legacy-energy-year1';
  function read<T>(key: string, fallback: T, valid: (value: unknown) => value is T): T {
    const raw = storage.getItem(key);
    const value: unknown = raw === null ? fallback : JSON.parse(raw);
    if (!valid(value)) throw new Error('Une donnée annuelle locale est illisible ; elle est conservée.');
    return value;
  }
  function write(key: string, value: unknown) {
    const encoded = JSON.stringify(value); storage.setItem(key, encoded);
    if (storage.getItem(key) !== encoded) throw new Error('Écriture annuelle non confirmée.');
    return true;
  }
  const sharedKey = `${keys.subjectNotes}.shared-documents.v1`;
  const shared = () => read(sharedKey, [] as SyncDocument[], (value): value is SyncDocument[] => Array.isArray(value) && value.every(item => isRecord(item) && typeof item.id === 'string' && ['whiteboard', 'formation', 'preferences'].includes(String(item.type)) && isRecord(item.content)));
  const subjects = () => read(keys.subjects, legacy ? defaultSubjects : [], isStoredSubjects);
  const events = () => read(keys.events, legacy ? defaultEvents : [], isStoredEvents);
  const tasks = () => read(keys.tasks, legacy ? defaultTasks : [], isStoredTasks);
  const notes = () => normalizeSubjectNotesStore(read(keys.subjectNotes, EMPTY_SUBJECT_NOTES_STORE, isPersistedSubjectNotesStore));
  const conversations = () => read(keys.conversations, [], isStoredConversations);
  const chats = () => read(keys.freeChatConversations, [], isStoredFreeChatConversations);
  const assessments = () => read(keys.assessments, [], isStoredAssessments);
  function documents(): SyncDocument[] {
    const extra = shared();
    return [ ...extra.filter(item => !(item.type === 'preferences' && item.id === SLIME_PROGRESS_ID)),
      { type: 'preferences' as const, id: SLIME_PROGRESS_ID, content: { ...read(slimeProgressKey(accountId), emptySlimeProgress(), isSlimeProgress) } },
      ...(!extra.some(item => item.type === 'formation' && item.id === formation.packageId) ? [{ type: 'formation' as const, id: formation.packageId, content: { schema: 1, manifest: formation.manifest, subjectIds: subjects().map(subject => subject.id) } }] : []),
      ...subjects().map(item => ({ type: 'progression' as const, id: item.id, content: { ...item } })),
      ...events().map(item => ({ type: 'planning' as const, id: item.id, content: { ...item } })),
      ...tasks().map(item => ({ type: 'tasks' as const, id: item.id, content: { ...item } })),
      ...notes().documents.map(item => ({ type: 'notesMarkdown' as const, id: item.id, content: { ...item } })),
      ...assessments().map(item => ({ type: 'examens' as const, id: item.id, content: { ...item } })),
      ...conversations().map(item => ({ type: 'conversations' as const, id: `web-${item.id}`, content: { kind: 'web', conversation: item } })),
      ...chats().map(item => ({ type: 'conversations' as const, id: `chat-${item.id}`, content: { kind: 'chat', conversation: item } })) ];
  }
  function apply(remote: RemoteDocument): boolean {
    const { document_type: type, document_id: id, content, deleted } = remote;
    if (type === 'preferences' && id === SLIME_PROGRESS_ID) {
      if (deleted || !isSlimeProgress(content)) return false;
      return write(slimeProgressKey(accountId), mergeSlimeProgress(read(slimeProgressKey(accountId), emptySlimeProgress(), isSlimeProgress), content));
    }
    const update = <T extends { id: string }>(key: string, items: T[], value: unknown, valid: (value: unknown) => value is T[]) => {
      if (!deleted && (!valid([value]) || (value as T).id !== id)) return false;
      const next = items.filter(item => item.id !== id);
      if (!deleted) next.push(value as T);
      if (!valid(next)) return false;
      return write(key, next);
    };
    if (type === 'progression') return update(keys.subjects, subjects(), content, isStoredSubjects);
    if (type === 'planning') return update(keys.events, events(), content, isStoredEvents);
    if (type === 'tasks') return update(keys.tasks, tasks(), content, isStoredTasks);
    if (type === 'examens') return update(keys.assessments, assessments(), content, isStoredAssessments);
    if (type === 'notesMarkdown') {
      const current = notes();
      if (deleted) return write(keys.subjectNotes, deleteSubjectNote(current, id));
      if (!isRecord(content)) return false;
      const old = current.documents.find(note => note.id === id), now = new Date().toISOString();
      const note = { id, title: content.title, markdown: content.markdown, subjectIds: content.subjectIds ?? old?.subjectIds ?? [], tags: content.tags ?? old?.tags ?? [], createdAt: content.createdAt ?? old?.createdAt ?? now, updatedAt: content.updatedAt ?? now };
      const next = { ...current, documents: [...current.documents.filter(note => note.id !== id), note] };
      return isPersistedSubjectNotesStore(next) && write(keys.subjectNotes, next);
    }
    if (type === 'conversations') {
      const web = id.startsWith('web-'), chat = id.startsWith('chat-');
      if (!web && !chat) return false;
      const originalId = id.slice(web ? 4 : 5);
      const key = web ? keys.conversations : keys.freeChatConversations;
      const items = web ? conversations() : chats();
      if (!deleted && (!content || content.kind !== (web ? 'web' : 'chat') || !isRecord(content.conversation) || content.conversation.id !== originalId)) return false;
      const next = items.filter(item => item.id !== originalId);
      if (!deleted) next.push(content!.conversation as never);
      return (web ? isStoredConversations(next) : isStoredFreeChatConversations(next)) && write(key, next);
    }
    if (['whiteboard', 'formation', 'preferences'].includes(type)) {
      if (!deleted && !isRecord(content)) return false;
      if (type === 'formation' && !deleted) {
        const manifest = sharedFormationManifest(content);
        if (!manifest || manifest.id !== id) return false;
        if (id === formation.packageId && !legacy && canonical(manifest) !== canonical(formation.manifest)) updateSharedFormationManifest(accountId, formation.instanceId, manifest, storage);
      }
      const next = shared().filter(item => item.type !== type || item.id !== id);
      if (!deleted) next.push({ type, id, content: content! });
      return write(sharedKey, next);
    }
    return false;
  }
  return { documents, apply };
}
