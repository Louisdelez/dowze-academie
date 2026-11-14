export interface ServerSpace { id: string; title: string; academic_year: string; formation_id: string }
export interface SpacePage { items: ServerSpace[]; has_more: boolean; next_after: string | null }

/** Two devices opening the same previously unseen year converge on one workspace. */
export async function defaultServerSpace(accountId:string,formationId:string,year:string):Promise<string> {
  const bytes=new TextEncoder().encode(JSON.stringify([accountId,formationId,year]));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return 'annual-'+[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
}

export async function listServerSpaces(fetchPage: (after: string) => Promise<SpacePage>, current = () => true): Promise<ServerSpace[]> {
  const spaces: ServerSpace[] = [];
  const seen = new Set<string>();
  let after = '';
  while (current()) {
    const page = await fetchPage(after);
    if (!current()) return [];
    spaces.push(...page.items);
    if (!page.has_more) return spaces;
    if (!page.next_after || seen.has(page.next_after)) throw new Error('Pagination des années serveur incohérente.');
    after = page.next_after; seen.add(after);
  }
  return [];
}

export function needsSpaceCreation(spaces: ServerSpace[], desired: ServerSpace): boolean {
  const existing = spaces.find(space => space.id === desired.id);
  if (!existing) return true;
  if (existing.formation_id !== desired.formation_id || existing.academic_year !== desired.academic_year) {
    throw new Error('Cet espace serveur appartient à une autre formation ou année. Choisissez une année compatible.');
  }
  // Titles are presentation metadata, never the identity of an annual workspace.
  return false;
}
