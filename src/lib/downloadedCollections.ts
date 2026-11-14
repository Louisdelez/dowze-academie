import type { CourseCollection } from './courseCollections';
import { validateAndCompileFormationPackage, type FormationPackageFiles } from './formations';

export interface DownloadedCollection {
  accountId: string;
  collection: CourseCollection;
  packages: FormationPackageFiles[];
  downloadedAt: string;
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open('dowze-annual-collections-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('collections', { keyPath: ['accountId', 'collection.id'] });
    request.onsuccess = () => { if (blocked) request.result.close(); else resolve(request.result); };
    request.onerror = () => reject(new Error('La bibliothèque téléchargée est indisponible.'));
    request.onblocked = () => { blocked = true; reject(new Error('Fermez les autres fenêtres puis réessayez.')); };
  });
}

export async function loadDownloadedCollections(accountId: string): Promise<DownloadedCollection[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('collections', 'readonly');
    const request = tx.objectStore('collections').getAll(IDBKeyRange.bound([accountId, ''], [accountId, '\uffff']));
    tx.oncomplete = () => {
      db.close();
      const records = request.result as DownloadedCollection[];
      // Keep damaged records untouched and report them instead of silently losing a download.
      if (records.some(record => !record || record.accountId !== accountId || !record.collection || typeof record.collection.id !== 'string' || typeof record.collection.title !== 'string' || !['Suisse', 'France', 'Langues', 'Autres'].includes(record.collection.category) || typeof record.collection.label !== 'string' || !Array.isArray(record.collection.entries) || !Array.isArray(record.packages) || record.packages.length !== record.collection.entries.length || record.collection.entries.some(entry => !entry || typeof entry.title !== 'string' || typeof entry.formation_id !== 'string' || typeof entry.version !== 'string' || !Number.isFinite(entry.package_size)))) {
        reject(new Error('Une collection téléchargée est illisible. Les fichiers sont conservés ; téléchargez-la à nouveau depuis le catalogue.'));
      } else resolve(records);
    };
    tx.onabort = tx.onerror = () => { db.close(); reject(new Error('Impossible de relire les collections téléchargées.')); };
  });
}

export async function saveDownloadedCollection(record: DownloadedCollection): Promise<void> {
  if (record.packages.length !== record.collection.entries.length || !record.packages.length) throw new Error('Collection incomplète.');
  for (let index = 0; index < record.packages.length; index++) {
    const preview = validateAndCompileFormationPackage(record.packages[index]);
    const entry = record.collection.entries[index];
    if (!preview.valid || preview.manifest?.id !== entry.formation_id || preview.manifest.packageVersion !== entry.version) throw new Error('Le contenu de la collection est invalide.');
  }
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('collections', 'readwrite');
    // A download remains available across restarts, including unfinished setup.
    tx.objectStore('collections').put(record);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = tx.onerror = () => { db.close(); reject(new Error('Téléchargement non enregistré. Vérifiez l’espace disponible puis réessayez.')); };
  });
}
