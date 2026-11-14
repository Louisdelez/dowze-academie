export interface CatalogEntry { formation_id: string; version: string; title: string; package_size: number }
export interface CourseCollection { id: string; title: string; category: 'Suisse' | 'France' | 'Langues' | 'Autres'; label: string; entries: CatalogEntry[] }

/** Group alternative packages, never flatten their contents or academic years. */
export function courseCollections(entries: readonly CatalogEntry[]): CourseCollection[] {
  const result = new Map<string, CourseCollection>();
  const latest = new Map<string, CatalogEntry>();
  for (const entry of entries) {
    const previous = latest.get(entry.formation_id);
    const compare = (a: string, b: string) => {
      const left = a.split('.').map(Number); const right = b.split('.').map(Number);
      return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
    };
    if (!previous || compare(entry.version, previous.version) > 0) latest.set(entry.formation_id, entry);
  }
  for (const entry of latest.values()) {
    const language = entry.formation_id.match(/^dowze-(allemand|anglais|espagnol|italien)-[abc][12]-(\d{4})$/);
    const specialized = entry.formation_id.match(/^dowze-ms-.+-(\d{4})$/);
    const id = language ? `language-${language[1]}-${language[2]}` : specialized ? `specialized-${specialized[1]}` : entry.formation_id;
    const category = language ? 'Langues' : entry.formation_id.startsWith('dowze-fr-') ? 'France' : /^dowze-(maturite|ms|co|ecg|commerce)-/.test(entry.formation_id) ? 'Suisse' : 'Autres';
    const title = language ? language[1][0].toUpperCase() + language[1].slice(1) : specialized ? 'Maturité spécialisée' : entry.title;
    if (!result.has(id)) result.set(id, { id, title, category, label: language ? 'Parcours de langue' : 'Collection annuelle', entries: [] });
    result.get(id)!.entries.push(entry);
  }
  return [...result.values()].map(collection => ({ ...collection, entries: collection.entries.sort((a, b) => a.title.localeCompare(b.title, 'fr', { numeric: true })) }))
    .sort((a, b) => Number(a.category === 'Langues') - Number(b.category === 'Langues') || a.title.localeCompare(b.title, 'fr', { numeric: true }));
}

export function packageSizeLabel(bytes: number): string {
  return bytes < 1048576 ? `${Math.max(1, Math.ceil(bytes / 1024))} Ko` : `${(bytes / 1048576).toLocaleString('fr', { maximumFractionDigits: 1 })} Mo`;
}
