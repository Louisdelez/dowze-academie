/** Device cache, not the server database. Sync waits for its commit barrier. */
export class DeviceCache implements Storage {
  private values = new Map<string, string>();
  private db?: IDBDatabase;
  private queue: Promise<void> = Promise.resolve();
  private failure: unknown;
  private frozen = false;
  private pending = 0;
  private listeners = new Set<() => void>();
  private revision = 0;
  private ordinaryRevision = 0;
  private clearEpoch = 0;
  private keyRevisions = new Map<string,number>();
  private channel?: BroadcastChannel;
  // Opaque per-key generations: unrelated cache writes keep a note lease,
  // while accepted attempts and every cache incarnation retire it permanently.
  private itemTokens = new Map<string,object>();
  itemSnapshot = (key:string):object => {
    key=String(key);let token=this.itemTokens.get(key);
    if(!token){token=Object.freeze({});this.itemTokens.set(key,token);}
    return token;
  };
  private retireItem(key:string) { this.itemTokens.delete(key); }
  private retireAllItems() { this.itemTokens.clear(); }
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  snapshot = () => this.revision;
  status = () => ({ pending: this.pending, error: this.failure ? String(this.failure) : '' });
  private notify() { this.revision++; for (const fn of this.listeners) fn(); }
  private async transaction(action: (store: IDBObjectStore) => void): Promise<void> {
    if (!this.db) throw new Error('Cache indisponible.');
    await new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction('records', 'readwrite', { durability: 'strict' });
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('Enregistrement local interrompu.'));
      tx.onerror = () => {};
      try { action(tx.objectStore('records')); } catch (error) { tx.abort(); reject(error); }
    });
  }
  async initialize(legacy?: Storage, factory: IDBFactory = indexedDB) {
    this.retireAllItems();
    try {
      this.db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = factory.open('dowze-academie-device-cache', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('records');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('Fermez les autres fenêtres pour mettre à jour le cache.'));
      });
      const tx = this.db.transaction('records', 'readonly');
      const records = tx.objectStore('records');
      const keys = records.getAllKeys(), values = records.getAll();
      await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); });
      keys.result.forEach((key, index) => this.values.set(String(key), String(values.result[index])));
      // Only the application's data is migrated. Other sites' sessions are separate.
      const entries: [string, string][] = [];
      for (let i = 0; legacy && i < legacy.length; i++) {
        const key = legacy.key(i);
        if (key && /^(etude\.|dowze\.|formations\.)/.test(key)) {
          const value = legacy.getItem(key);
          if (value !== null) entries.push([key, value]);
        }
      }
      if (legacy && entries.length) {
        await this.transaction(store => { for (const [key, value] of entries) if (!this.values.has(key)) store.put(value, key); });
        for (const [key, value] of entries) {
          if (!this.values.has(key)) this.values.set(key, value);
          // Migration is committed before releasing the small legacy storage.
          legacy.removeItem(key);
        }
      }
      if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
        this.channel = new BroadcastChannel('dowze-device-cache');
        this.channel.onmessage = () => window.dispatchEvent(new Event('dowze:cache-other-window'));
      }
      this.notify();
    } finally { this.retireAllItems(); }
  }
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  /** Read the durable value, including another window's committed changes. */
  async readCurrentItem(key:string):Promise<string|null>{
    key=String(key);await this.queue;if(this.failure)throw this.failure;
    const db=this.db;if(!db)throw new Error('Cache non initialisé.');
    const value=await new Promise<string|null>((resolve,reject)=>{
      const tx=db.transaction('records','readonly'),request=tx.objectStore('records').get(key);
      tx.oncomplete=()=>resolve(request.result??null);tx.onabort=()=>reject(tx.error??new Error('Lecture locale interrompue.'));tx.onerror=()=>{};
    });
    return value;
  }
  /** Atomic compare-and-set, so a second view cannot overwrite unseen work. */
  compareAndSetItem(key:string,expected:string|null,next:string):Promise<boolean>{
    key=String(key);next=String(next);
    if(this.frozen)return Promise.reject(new Error('Fermeture en cours : enregistrement terminé avant de quitter.'));
    if(this.failure)return Promise.reject(this.failure);
    const db=this.db;if(!db)return Promise.reject(new Error('Cache non initialisé.'));
    const admittedRevision=this.keyRevisions.get(key)??0,admittedClearEpoch=this.clearEpoch;
    // Even a mismatched admitted CAS retires a capture of this key.
    this.retireItem(key);
    this.pending++;this.notify();
    const operation=this.queue.then(async()=>{
      if(this.failure)throw this.failure;
      let matched=false,actual:string|null=null;
      await new Promise<void>((resolve,reject)=>{
        const tx=db.transaction('records','readwrite',{durability:'strict'}),store=tx.objectStore('records'),request=store.get(key);
        request.onsuccess=()=>{actual=request.result??null;matched=actual===expected;if(matched)store.put(next,key);};
        tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??new Error('Enregistrement local interrompu.'));tx.onerror=()=>{};
      });
      // A later ordinary write is already visible in the synchronous Storage
      // cache, although its durable operation is queued after this CAS. Keep
      // that accepted value, including A-B-A, remove and clear transitions.
      if(this.clearEpoch===admittedClearEpoch&&(this.keyRevisions.get(key)??0)===admittedRevision){
        if(matched)this.values.set(key,next);
        else if(actual===null)this.values.delete(key);else this.values.set(key,actual);
      }
      if(matched)this.channel?.postMessage('committed');
      return matched;
    });
    this.queue=operation.then(()=>{},error=>{this.retireAllItems();this.failure=error;if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('etude:persistence-error',{detail:{message:String(error)}}));}).finally(()=>{this.pending--;this.notify();});
    return operation;
  }
  private mutate(action: (store: IDBObjectStore) => void,itemKey?:string,clearItems=false) {
    if (this.frozen) throw new Error('Fermeture en cours : enregistrement terminé avant de quitter.');
    if (this.failure) throw this.failure;
    if (!this.db) throw new Error('Cache non initialisé.');
    if(clearItems)this.retireAllItems();else if(itemKey!==undefined)this.retireItem(itemKey);
    this.pending++; this.notify();
    this.queue = this.queue.then(async () => {
      try { if (this.failure) return; await this.transaction(action); this.channel?.postMessage('committed'); }
      catch (error) {
        this.retireAllItems();
        this.failure = error;
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('etude:persistence-error', { detail: { message: String(error) } }));
      } finally { this.pending--; this.notify(); }
    });
  }
  setItem(key: string, value: string) {
    key = String(key); value = String(value);
    if (this.getItem(key) === value) return;
    this.mutate(store => { store.put(value, key); },key); this.keyRevisions.set(key,++this.ordinaryRevision); this.values.set(key, value);
  }
  removeItem(key: string) {
    if (!this.values.has(key)) return;
    this.mutate(store => { store.delete(key); },key); this.keyRevisions.set(key,++this.ordinaryRevision); this.values.delete(key);
  }
  clear() { this.mutate(store => { store.clear(); },undefined,true); this.clearEpoch++; this.keyRevisions.clear(); this.values.clear(); }
  async flush() {
    // Include edits queued during a previous transaction, not just the first promise.
    let previous: Promise<void>;
    do { previous = this.queue; await previous; } while (previous !== this.queue);
    if (this.failure) throw this.failure;
  }
  freeze() { this.frozen = true; }
  unfreeze() { this.frozen = false; }
  close() { this.retireAllItems(); this.db?.close(); this.channel?.close(); }
}
export const appStorage = new DeviceCache();
