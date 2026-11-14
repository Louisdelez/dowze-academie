import type { SlimeColor } from './dowzy';
export type SlimeStage = 'baby' | 'teen' | 'adult' | 'sage';
export type XpKind = 'lesson' | 'course' | 'goal' | 'assessment' | 'active-minute';
export const XP_REWARDS: Record<XpKind, number> = { lesson: 50, course: 100, goal: 40, assessment: 150, 'active-minute': 1 };
export const SLIME_PROGRESS_ID = 'dowzy-xp-v1';
export const slimeProgressKey = (account: string) => `dowze.mascot.${account}.xp.v1`;
export type XpEvent = { id: string; color: SlimeColor; kind: XpKind; day: string; at: number };
export type SlimeProgress = { schema: 1; events: XpEvent[] };
export const emptySlimeProgress = (): SlimeProgress => ({ schema: 1, events: [] });
const colors = ['blue','yellow','red','green','white','black','orange','purple'];
export function isSlimeProgress(value: unknown): value is SlimeProgress {
  if (!value || typeof value !== 'object') return false;
  const v = value as SlimeProgress;
  return v.schema === 1 && Array.isArray(v.events) && v.events.length <= 200000 && v.events.every(e => e &&
    typeof e.id === 'string' && e.id.length > 0 && e.id.length <= 1024 && colors.includes(e.color) &&
    Object.hasOwn(XP_REWARDS, e.kind) && Number.isSafeInteger(e.at) && e.at >= 0 && typeof e.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.day));
}
/** Union by activity identity: toggling completion, replaying a sync, or changing colour cannot award it twice. */
export function mergeSlimeProgress(...ledgers: SlimeProgress[]): SlimeProgress {
  const events = new Map<string, XpEvent>();
  for (const ledger of ledgers) for (const event of ledger.events) {
    const old = events.get(event.id);
    // Deterministic tie-break also converges when two devices reward the same activity in different colours.
    if (!old || event.at < old.at || (event.at === old.at && JSON.stringify(event) < JSON.stringify(old))) events.set(event.id, event);
  }
  return { schema: 1, events: [...events.values()].sort((a,b) => a.at - b.at || a.id.localeCompare(b.id)) };
}
export function awardSlimeXp(ledger: SlimeProgress, candidates: XpEvent[]): SlimeProgress {
  const existing = new Set(ledger.events.map(e => e.id));
  return mergeSlimeProgress(ledger, { schema: 1, events: candidates.filter(e => !existing.has(e.id)) });
}
export function xpDay(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
export const DAILY_XP_CAP = 3000;
export const TEEN_LEVEL = 25;
export const ADULT_LEVEL = 60;
export const SAGE_LEVEL = 100;
export function slimeXp(ledger: SlimeProgress, color: SlimeColor): number {
  const dayXp = new Map<string, number>();
  let xp = 0;
  for (const event of mergeSlimeProgress(ledger).events) {
    const earned = dayXp.get(event.day) ?? 0;
    const reward = Math.min(XP_REWARDS[event.kind], Math.max(0, DAILY_XP_CAP - earned));
    dayXp.set(event.day, earned + reward);
    if (event.color === color) xp += reward;
  }
  return xp;
}
export function xpAtLevel(level: number): number { return 100 * level + 25 * level * (level - 1) / 2; }
export function slimeLevel(xp: number) {
  const safe = Math.max(0, Math.floor(Number.isFinite(xp) ? xp : 0));
  let level = Math.max(0, Math.floor((-175 + Math.sqrt(30625 + 200 * safe)) / 50));
  while (xpAtLevel(level + 1) <= safe) level++;
  while (xpAtLevel(level) > safe) level--;
  const stage: SlimeStage = level >= SAGE_LEVEL ? 'sage' : level >= ADULT_LEVEL ? 'adult' : level >= TEEN_LEVEL ? 'teen' : 'baby';
  return { level, stage, current: safe - xpAtLevel(level), required: 100 + 25 * level, total: safe, nextEvolution: stage === 'baby' ? TEEN_LEVEL : stage === 'teen' ? ADULT_LEVEL : stage === 'adult' ? SAGE_LEVEL : null };
}
export function activeMinuteEligible({ visible, focused, lastInteraction, now, lastSample }: { visible: boolean; focused: boolean; lastInteraction: number; now: number; lastSample: number }) {
  return visible && focused && now - lastInteraction >= 0 && now - lastInteraction < 120000 && now - lastSample >= 55000 && now - lastSample < 90000;
}
