import { installFormationFromPreview, loadFormationCatalog } from './formationRegistry';
import { formationStorageFor } from './profileStorage';
import { sharedFormationManifest } from './sharedFormation';
import { emptySyncState, type RemoteDocument } from './serverSync';
import { isStoredEvents, isStoredSubjects, isStoredTasks } from './workspaceValidation';
import { validateAndCompileFormationPackage, type FormationImportPreview, type FormationPackageFiles } from './formations';
import type { Subject } from '../types';
import type { ServerSpace } from './serverSpaces';
import { workspaceSyncStorage } from './workspaceSyncStorage';

/** Restore only a missing annual workspace, never replace an existing local one. */
export async function restoreServerFormation(options: {
  accountId: string; serverAccountId: string; space: ServerSpace; documents: RemoteDocument[];
  course: (id: string, version: string) => Promise<FormationPackageFiles>;
  current: () => boolean; storage: Storage; id: () => string;
}): Promise<boolean> {
  const { accountId, serverAccountId, space, documents, current, storage } = options;
  if (!current()) return false;
  const catalog = loadFormationCatalog(accountId, storage);
  const journalKey = `dowze.server.restore.${accountId}.${serverAccountId}.${space.id}`;
  const pendingInstance = storage.getItem(journalKey);
  const mapping = (instanceId: string) => `dowze.server.space.${accountId}.${serverAccountId}.${instanceId}`;
  if (catalog.formations.some(item => storage.getItem(mapping(item.instanceId)) === space.id)) return false;
  // The built-in workspace is already present and is associated by the active sync controller.
  if (catalog.formations.some(item => item.storageKind === 'legacy-energy-year1' && item.packageId === space.formation_id)) return false;
  const descriptions = documents.filter(item => item.document_type === 'formation' && !item.deleted);
  const description = descriptions.find(item => item.document_id === space.formation_id) ?? (descriptions.length === 1 ? descriptions[0] : undefined);
  const manifest = sharedFormationManifest(description?.content);
  if (!manifest || !description) return false;
  const year = `${manifest.academicYear.startDate.slice(0, 4)}-${manifest.academicYear.endDate.slice(0, 4)}`;
  if (year !== space.academic_year) throw new Error('Le cursus serveur ne correspond pas à son année.');
  if (catalog.formations.some(item => item.packageId === manifest.id && item.packageVersion === manifest.packageVersion &&
    !storage.getItem(mapping(item.instanceId)) && item.instanceId !== pendingInstance)) return false;
  const subjects = documents.filter(item => item.document_type === 'progression' && !item.deleted).map(item => item.content);
  const events = documents.filter(item => item.document_type === 'planning' && !item.deleted).map(item => item.content);
  const tasks = documents.filter(item => item.document_type === 'tasks' && !item.deleted).map(item => item.content);
  let preview: FormationImportPreview;
  let fromDocuments = false;
  const expected = description.content?.subjectIds;
  if (Array.isArray(expected)) {
    if (!expected.length || !expected.every(id => typeof id === 'string')) throw new Error('Liste des matières serveur invalide.');
    if (!expected.every(id => subjects.some(subject => subject?.id === id))) return false; // Initial upload is still in flight.
    if (!isStoredSubjects(subjects) || !isStoredEvents(events) || !isStoredTasks(tasks)) throw new Error('Les données de cette année sont invalides ; aucune installation effectuée.');
    const validatedSubjects: Subject[] = subjects;
    preview = { valid: true, issues: [], manifest, subjects, events, tasks, compiled: { subjects, events, tasks },
      counts: { subjects: subjects.length, modules: validatedSubjects.reduce((n, s) => n + s.modules.length, 0),
        chapters: validatedSubjects.reduce((n, s) => n + s.modules.reduce((m, module) => m + module.items.length, 0), 0),
        lessons: validatedSubjects.reduce((n, s) => n + s.modules.reduce((m, module) => m + module.items.reduce((l, chapter) => l + (chapter.lessons?.length ?? 0), 0), 0), 0), events: events.length, tasks: tasks.length } };
    fromDocuments = true;
  } else {
    const files = await options.course(manifest.id, manifest.packageVersion);
    if (!current()) return false;
    const original = validateAndCompileFormationPackage(files);
    if (!original.valid || original.manifest?.id !== manifest.id || original.manifest.packageVersion !== manifest.packageVersion) throw new Error('Le paquet reçu ne correspond pas au cursus demandé.');
    preview = validateAndCompileFormationPackage({ ...files, 'formation.json': JSON.stringify(manifest) });
    if (!preview.valid) throw new Error('Le cursus partagé ne peut pas être restauré.');
  }
  if (!current()) return false;
  const instanceId = storage.getItem(journalKey) ?? options.id();
  storage.setItem(journalKey, instanceId);
  const existing = catalog.formations.find(item => item.instanceId === instanceId);
  const formation = existing ?? installFormationFromPreview(accountId, preview, storage, { instanceId });
  const stateKey = `dowze.server.sync.${accountId}.${serverAccountId}.${instanceId}.${space.id}`;
  if (!storage.getItem(stateKey)) {
    const state = emptySyncState();
    const restoredStorage = workspaceSyncStorage(accountId, formation, storage);
    for (const document of documents) {
      if (!['progression', 'planning', 'tasks'].includes(document.document_type)) continue;
      // A catalogue package supplies defaults, not the learner's latest work.
      // Apply that work before recording its baseline or associating the year.
      if (!fromDocuments && !restoredStorage.apply(document)) throw new Error('La progression serveur est invalide ; restauration suspendue.');
      state.base[`${document.document_type}|${document.document_id}`] = { version: document.version, content: document.deleted ? null : document.content };
    }
    const keys = formationStorageFor(accountId, formation);
    if (!storage.getItem(`${keys.subjectNotes}.shared-documents.v1`)) storage.setItem(`${keys.subjectNotes}.shared-documents.v1`, JSON.stringify([{ type: 'formation', id: description.document_id, content: description.content }]));
    state.base[`formation|${description.document_id}`] = { version: description.version, content: description.content };
    storage.setItem(stateKey, JSON.stringify(state));
  }
  storage.setItem(mapping(instanceId), space.id);
  storage.removeItem(journalKey);
  return true;
}
