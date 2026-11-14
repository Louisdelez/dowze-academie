/** Coucou's actual Linux/Windows FSM, with the Dowze host lifecycle adapter. */
import { IslandStateMachine, type FsmState } from './coucou/fsm.ts';
import { islandSize, botPosition, type IslandViewName } from './coucou/layout.ts';

/** Dowze keeps the pet visible in a short top-edge bar, including when idle. */
export const COMPACT_COMPANION = { w: 64, h: 32, diameter: 26 } as const;
export function companionSize(expanded: boolean, view: IslandViewName) {
  return expanded ? islandSize('expanded', view) : { w: COMPACT_COMPANION.w, h: COMPACT_COMPANION.h };
}
export function companionPosition(expanded: boolean, view: IslandViewName, height: number) {
  return expanded ? botPosition('expanded', view, height) : { cx: COMPACT_COMPANION.w / 2, cy: COMPACT_COMPANION.h / 2, diameter: COMPACT_COMPANION.diameter, opacity: 1 };
}
export type IslandMode = FsmState;
export class CompanionIsland extends IslandStateMachine {
  onChange: (mode: IslandMode) => void = () => {};
  private greeting?: ReturnType<typeof setTimeout>;
  get mode() { return this.state; }
  get held() { return this.pinned; }
  set held(value: boolean) { this.pinned = value; if(value) this.cancelTimers(); }
  constructor() { super(); this.state='petit'; this.onTransition = (_from,to) => this.onChange(to); }
  override launch() { clearTimeout(this.greeting); this.onTransition = (_from,to) => this.onChange(to); super.launch(); this.greeting=setTimeout(()=>this.greetComplete(),4600); }
  // Keep upstream greeting/open/close behavior, but never schedule the PC hide timer.
  override mouseLeft() { if(this.state==='petit') this.cancelTimers(); else super.mouseLeft(); }
  override forceHidden() { this.forcePetit(); }
  enter() { this.mouseEntered(); }
  leave() { if(!this.pinned) this.mouseLeft(); }
  override click() { if(this.state==='hidden') this.mouseEntered(); super.click(); }
  collapse() { clearTimeout(this.greeting);this.forcePetit();this.mouseLeft(); }
  alert() { this.forceHome(); }
  dispose() { clearTimeout(this.greeting);this.cancelTimers();this.onTransition=null; }
}
