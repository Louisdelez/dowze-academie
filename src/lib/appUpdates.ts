/** One app-wide updater: changing accounts/years never duplicates downloads. */
export type UpdatePhase = 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'ready' | 'installing' | 'installed' | 'error';
export interface UpdateState { phase: UpdatePhase; version?: string; notes?: string; received: number; total?: number; error?: string; checkedAt?: number }
export interface UpdateArtifact {
  version: string; body?: string;
  download(progress: (event: { event: string; data?: { contentLength?: number; chunkLength?: number } }) => void, options: { timeout: number }): Promise<void>;
  install(): Promise<void>; close(): Promise<void>;
}
export interface UpdateDriver { check(): Promise<UpdateArtifact | null>; prepare(): Promise<void>; restart(): Promise<void>; recover?(): Promise<void> }
export class AppUpdates {
  private state: UpdateState = { phase: 'idle', received: 0 };
  private artifact: UpdateArtifact | null = null;
  private busy = false;
  private listeners = new Set<() => void>();
  private driver: UpdateDriver;
  constructor(driver: UpdateDriver) { this.driver = driver; }
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private set(patch: Partial<UpdateState>) { this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener(); }
  async check() {
    if (this.busy || ['ready', 'installed'].includes(this.state.phase)) return;
    this.busy = true;
    this.set({ phase: 'checking', error: undefined, version: undefined, notes: undefined });
    try {
      if (this.artifact) { await this.artifact.close(); this.artifact = null; }
      this.artifact = await this.driver.check();
      this.set({ phase: this.artifact ? 'available' : 'current', version: this.artifact?.version,
        notes: this.artifact?.body, received: 0, total: undefined, checkedAt: Date.now() });
    } catch { this.set({ phase: 'error', error: 'Vérification impossible. Vérifiez votre connexion puis réessayez.' }); }
    finally { this.busy = false; }
  }
  async download() {
    if (this.busy || !this.artifact || !['available', 'error'].includes(this.state.phase)) return;
    this.busy = true; this.set({ phase: 'downloading', received: 0, total: undefined, error: undefined });
    try {
      await this.artifact.download((event) => {
        if (event.event === 'Started') this.set({ total: event.data?.contentLength });
        if (event.event === 'Progress') this.set({ received: this.state.received + (event.data?.chunkLength ?? 0) });
        // Finished means transfer finished, not yet cryptographically verified.
      }, { timeout: 30 * 60 * 1000 });
      this.set({ phase: 'ready' });
    } catch { this.set({ phase: 'error', error: 'Téléchargement ou signature refusé. L’application actuelle est conservée ; réessayez.' }); }
    finally { this.busy = false; }
  }
  async install() {
    if (this.busy || !this.artifact || this.state.phase !== 'ready') return;
    this.busy = true; this.set({ phase: 'installing', error: undefined });
    try {
      await this.driver.prepare();
      await this.artifact.install();
      this.set({ phase: 'installed' });
    } catch { await this.driver.recover?.().catch(() => {}); this.set({ phase: 'ready', error: 'Installation interrompue. Vérifiez que vos travaux sont enregistrés et que le dossier de l’application est accessible, puis réessayez.' }); }
    finally { this.busy = false; }
    if (this.snapshot().phase === 'installed') await this.restart();
  }
  async restart() {
    if (this.busy || this.state.phase !== 'installed') return;
    this.busy = true;
    try { await this.driver.restart(); }
    catch { this.set({ error: 'Mise à jour installée. Fermez et rouvrez l’application pour terminer.' }); }
    finally { this.busy = false; }
  }
}
