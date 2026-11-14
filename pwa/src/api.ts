import {createManagedNotebookFetchPort,readManagedApiReply,decodeManagedApiUtf8,type ManagedApiWireRequest,type ManagedApiWireReply} from './managedNotebookApiPort.ts';
import {ManagedClientError,parseManagedReply,type ManagedNotebookPort} from './managedNotebookClient.ts';
export type { SyncType as DocumentType } from '../../src/lib/serverSync';
import type { SyncType as DocumentType } from '../../src/lib/serverSync';

export interface Account { id: string; email: string; created_at: string }
export interface AnnualSpace { id: string; formation_id: string; academic_year: string; title: string; created_at: string }
export interface DocumentChange { sequence?: number; space_id: string; document_type: DocumentType; document_id: string; version: number; deleted: boolean; content: unknown; changed_at: string }
export interface ChangePage { items: DocumentChange[]; next_cursor: string; has_more: boolean }
export interface BlobInfo { id: string; space_id: string; media_type: string; size: number; sha256: string; created_at: string }
export interface CatalogEntry { formation_id: string; version: string; title: string; package_size: number; package_sha256: string }

export class ApiError extends Error {
  status:number;code?:string;currentVersion?:number;
  constructor(status:number,message:string,code?:string,currentVersion?:number){super(message);this.status=status;this.code=code;this.currentVersion=currentVersion;}
}

type Fetcher = typeof fetch;
type RequestSession = Readonly<{epoch:number;accountId:string|null}>;
export interface ApiClientTransportOptions {readonly managedRawFetch?:boolean}

export class ApiClient {
  private sessionEpoch=0;
  private accountId: string | null = null;
  private csrfToken: string | null = null;
  private csrfRestore: Promise<void> | null = null;
  private baseUrl:string;private fetcher:Fetcher;private managedRawFetch:boolean;
  readonly syncDocumentFilter?: (type:string,id:string)=>boolean;
  constructor(baseUrl='',fetcher:Fetcher=fetch,syncDocumentFilter?:(type:string,id:string)=>boolean,transport:ApiClientTransportOptions={}){this.baseUrl=baseUrl;this.fetcher=fetcher;this.syncDocumentFilter=syncDocumentFilter;this.managedRawFetch=transport.managedRawFetch??(fetcher===globalThis.fetch);}
  forgetSession(){this.sessionEpoch++;this.csrfToken=null;this.accountId=null;this.csrfRestore=null;}
  hasCsrf() { return this.csrfToken !== null; }
  /** Destination identity only; no credential or request is exposed. */
  privateBlobServerKey():string {
    const value=new URL(this.baseUrl||'/',globalThis.location?.href);
    if(!['https:','http:'].includes(value.protocol)||value.username||value.password||value.search||value.hash)throw new ApiError(409,'Destination privée incompatible.','private_blob_origin_changed');
    return value.href.replace(/\/$/,'');
  }
  /** Opaque authority captured before queued asynchronous work; no token escapes. */
  captureSessionAuthority(accountId:string):()=>boolean {
    this.bindAccount(accountId);const epoch=this.sessionEpoch;
    return ()=>this.sessionEpoch===epoch&&this.accountId===accountId;
  }
  bindAccount(accountId: string) {
    if (this.accountId && this.accountId !== accountId) throw new ApiError(409, 'La session appartient à un autre compte. Reconnectez-vous.', 'session_account_changed');
    this.accountId = accountId;
  }

  /** PWA-only closed raw port. Custom fetchers must explicitly attest this
   * byte-preserving Fetch contract; the existing native JSON bridge does not. */
  createManagedNotebookPort(options:{current:()=>boolean;currentApi?:()=>ApiClient}):ManagedNotebookPort {
    const view=options.current,getApi=options.currentApi??(()=>this),fetcher=this.fetcher,portEpoch=this.sessionEpoch;
    let retired=false;
    const viewCurrent=()=>{try{if(view()!==true||getApi()!==this||this.sessionEpoch!==portEpoch)retired=true;}catch{retired=true;}return !retired;};
    const requireView=()=>{if(!viewCurrent())throw new ManagedClientError('authority-changed','La source du carnet partagé a changé.');};
    requireView();
    if(!this.managedRawFetch)throw new ManagedClientError('unavailable','Le transport brut requis pour le carnet partagé n’est pas disponible dans ce client.');
    let destination:URL;
    try{destination=new URL(this.baseUrl||'/',globalThis.location?.href);}catch{throw new ManagedClientError('unavailable','L’origine du serveur partagé est indisponible.');}
    if(!['https:','http:'].includes(destination.protocol)||destination.username||destination.password||destination.search||destination.hash)throw new ManagedClientError('unavailable','L’origine du serveur partagé est incompatible.');
    const base=destination.href.replace(/\/$/,''),serverKey=base;
    return createManagedNotebookFetchPort({serverKey,capture:(actorAccountId)=>{
      requireView();const authority=this.captureSessionAuthority(actorAccountId),epoch=this.sessionEpoch;
      let sessionRetired=false,token=this.csrfToken,csrfTask:Promise<void>|undefined;
      const current=()=>{if(!viewCurrent()||this.sessionEpoch!==epoch||this.accountId!==actorAccountId||authority()!==true)sessionRetired=true;return !sessionRetired;};
      const check=()=>{if(!current())throw new ManagedClientError('authority-changed','La session du carnet partagé a changé.');};
      const receive=async(path:string,init:RequestInit,maximum:number):Promise<ManagedApiWireReply>=>{
        check();let response:Response|undefined;
        try{response=await fetcher(base+path,{...init,credentials:'include',cache:'no-store',redirect:'error'});check();if(response.redirected)throw new ManagedClientError('invalid-response','La réponse du serveur partagé est incompatible.');const reply=await readManagedApiReply(response,response.ok?maximum:Math.min(maximum,65_536),current);check();return reply;}catch(error){check();throw error;}
        finally{if(response?.body&&!response.body.locked&&!response.bodyUsed){try{await response.body.cancel();}finally{check();}}}
      };
      const restoreCsrf=async()=>{
        check();if(!csrfTask){const task=(async()=>{check();const reply=await receive('/v1/csrf',{method:'GET',headers:{'X-Dowze-Account':actorAccountId}},65_536);check();const payload=parseManagedReply(decodeManagedApiUtf8(reply.body),65_536);if(reply.status!==200)throw new ApiError(reply.status,'La session de synchronisation ne peut pas être préparée.',typeof payload.code==='string'?payload.code:undefined);if(typeof payload.csrf_token!=='string'||!payload.csrf_token||payload.csrf_token.length>4096||/[\u0000-\u001f\u007f]/.test(payload.csrf_token))throw new ManagedClientError('invalid-response','La réponse du serveur partagé est incompatible.');check();token=payload.csrf_token;this.csrfToken=token;})();csrfTask=task;void task.finally(()=>{if(csrfTask===task)csrfTask=undefined;}).catch(()=>{});}await csrfTask;check();
      };
      const rejectedCsrf=(reply:ManagedApiWireReply)=>{if(reply.status!==403)return false;try{return parseManagedReply(decodeManagedApiUtf8(reply.body),65_536).code==='csrf_rejected';}catch{return false;}};
      const send=async(request:ManagedApiWireRequest):Promise<ManagedApiWireReply>=>{
        check();const mutation=request.method!=='GET';
        const perform=async()=>{check();if(mutation&&!token)await restoreCsrf();check();const headers=new Headers(request.headers);headers.set('X-Dowze-Account',actorAccountId);if(mutation)headers.set('X-CSRF-Token',token!);const reply=await receive(request.path,{method:request.method,headers,body:request.body},request.maximum);check();return reply;};
        try{const first=await perform();check();if(mutation&&rejectedCsrf(first)){await restoreCsrf();check();const retry=await perform();check();return retry;}return first;}catch(error){check();throw error;}
      };
      check();return Object.freeze({actorAccountId,current,send});
    }});
  }

  private async request<T>(path: string, init: RequestInit = {}, retryCsrf = true,session:RequestSession=Object.freeze({epoch:this.sessionEpoch,accountId:this.accountId}),sourceCheck?:()=>Promise<void>): Promise<T> {
    const requireSession=()=>{if(session.epoch!==this.sessionEpoch||session.accountId!==this.accountId)throw new ApiError(409,'La session a changé pendant la requête.','session_account_changed');};
    requireSession();
    try{
    if(sourceCheck){await sourceCheck();requireSession();}
    const protectedMutation = !!init.method && init.method !== 'GET' && !(init.method === 'POST' && ['/v1/accounts', '/v1/sessions'].includes(path));
    if (protectedMutation && (!this.csrfToken || this.csrfRestore)) await this.restoreCsrf();
    requireSession();
    const headers = new Headers(init.headers);
    if (this.accountId && path.startsWith('/v1/spaces')) headers.set('X-Dowze-Account', this.accountId);
    if (init.body && !(init.body instanceof Blob) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (this.csrfToken && init.method && init.method !== 'GET') headers.set('X-CSRF-Token', this.csrfToken);
    if(sourceCheck){await sourceCheck();requireSession();}
    const fetcher = this.fetcher;
    const response = await fetcher(`${this.baseUrl}${path}`, { ...init, headers, credentials: 'include', cache: 'no-store' });
    requireSession();
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    requireSession();
    if (protectedMutation && retryCsrf && response.status === 403 && payload?.code === 'csrf_rejected') {
      if(sourceCheck){await sourceCheck();requireSession();}
      await this.restoreCsrf();
      requireSession();
      return await this.request<T>(path, init, false,session,sourceCheck);
    }
    if (!response.ok) throw new ApiError(response.status, payload?.message ?? `Erreur HTTP ${response.status}`, payload?.code, payload?.current_version);
    return payload as T;
    }catch(error){requireSession();throw error;}
  }

  async register(email: string, password: string) { return this.request<Account>('/v1/accounts', { method: 'POST', body: JSON.stringify({ email, password }) }); }
  async login(email: string, password: string) {
    this.forgetSession();const epoch=this.sessionEpoch;
    const session = await this.request<{ expires_at: string; csrf_token: string }>('/v1/sessions', { method: 'POST', body: JSON.stringify({ email, password }) });
    if(epoch!==this.sessionEpoch)throw new ApiError(409,'La session a changé pendant la connexion.','session_account_changed');
    this.csrfToken = session.csrf_token;
    return session;
  }
  async me() {
    const epoch=this.sessionEpoch;const account = await this.request<Account>('/v1/me');
    if(epoch!==this.sessionEpoch)throw new ApiError(409,'La session a changé.','session_account_changed');
    this.bindAccount(account.id);
    return account;
  }
  async restoreCsrf() {
    if(!this.csrfRestore){const epoch=this.sessionEpoch;const task=this.request<{csrf_token:string}>('/v1/csrf').then(value=>{if(epoch!==this.sessionEpoch)throw new ApiError(409,'La session a changé.','session_account_changed');this.csrfToken=value.csrf_token;}).finally(()=>{if(this.csrfRestore===task)this.csrfRestore=null;});this.csrfRestore=task;}
    await this.csrfRestore;
  }
  async logout() {const epoch=this.sessionEpoch;try{await this.request<null>('/v1/sessions',{method:'DELETE'});}finally{if(epoch===this.sessionEpoch)this.forgetSession();}}

  async putSpace(spaceId: string, formationId: string, academicYear: string, title: string) {
    return this.request<AnnualSpace>(`/v1/spaces/${encodeURIComponent(spaceId)}`, { method: 'PUT', body: JSON.stringify({ formation_id: formationId, academic_year: academicYear, title }) });
  }
  async spaces() {
    const items: AnnualSpace[] = []; let after = '';
    do {
      const page = await this.request<{items: AnnualSpace[]; has_more: boolean; next_after: string | null}>(`/v1/spaces?limit=500&after=${encodeURIComponent(after)}`);
      items.push(...page.items); after = page.has_more ? page.next_after ?? '' : '';
    } while (after);
    return items;
  }
  async changes(spaceId: string, cursor?: string) {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}&limit=500` : '?limit=500';
    return this.request<ChangePage>(`/v1/spaces/${encodeURIComponent(spaceId)}/changes${query}`);
  }
  async courseContent(formationId: string, version: string) {
    return this.request<{ files: Record<string, string> }>(`/v1/catalog/${encodeURIComponent(formationId)}/${encodeURIComponent(version)}/content`);
  }
  async catalog() { return this.request<{ items: CatalogEntry[] }>('/v1/catalog'); }
  async putDocument(spaceId: string, type: DocumentType, documentId: string, baseVersion: number, content: unknown, idempotencyKey: string,sourceCheck?:()=>Promise<void>) {
    return this.request<DocumentChange>(`/v1/spaces/${encodeURIComponent(spaceId)}/documents/${type}/${encodeURIComponent(documentId)}`, { method: 'PUT', headers: { 'X-Idempotency-Key': idempotencyKey }, body: JSON.stringify({ base_version: baseVersion, content }) },true,undefined,sourceCheck);
  }
  async uploadBlob(spaceId: string, blob: Blob, sha256: string, idempotencyKey: string,sourceCheck?:()=>Promise<void>) {
    return this.request<BlobInfo>(`/v1/spaces/${encodeURIComponent(spaceId)}/blobs`, { method: 'POST', headers: { 'Content-Type': blob.type, 'X-Content-SHA256': sha256, 'X-Idempotency-Key': idempotencyKey }, body: blob },true,undefined,sourceCheck);
  }
  async downloadBlob(spaceId: string, blobId: string) {
    const fetcher = this.fetcher, epoch = this.sessionEpoch, accountId = this.accountId;
    const requireSession = () => {
      if (epoch !== this.sessionEpoch || accountId !== this.accountId) throw new ApiError(409, 'La session a changé pendant la réception du fichier. Réessayez dans le compte courant.', 'session_account_changed');
    };
    let response: Response;
    try { response = await fetcher(this.blobUrl(spaceId, blobId), { credentials: 'include', cache: 'no-store', headers: accountId ? { 'X-Dowze-Account': accountId } : {} }); }
    catch (error) { requireSession(); throw error; }
    requireSession();
    if (!response.ok) throw new ApiError(response.status, 'Photo indisponible');
    const maximum = 16 * 1024 * 1024;
    if (Number(response.headers.get('content-length')) > maximum) throw new Error('Photo trop volumineuse');
    const reader = response.body?.getReader(); if (!reader) throw new Error('Photo indisponible');
    const expectedHash = response.headers.get('X-Content-SHA256');
    const chunks: Uint8Array<ArrayBuffer>[] = []; let size = 0;
    try {
      if (expectedHash !== null && !/^[a-fA-F0-9]{64}$/.test(expectedHash)) throw new Error('L’empreinte du fichier reçu est invalide.');
      while (true) {
        requireSession();
        const { done, value } = await reader.read(); requireSession(); if (done) break;
        size += value.byteLength; if (size > maximum) throw new Error('Photo trop volumineuse');
        chunks.push(new Uint8Array(value));
      }
      const blob = new Blob(chunks, { type: response.headers.get('content-type') ?? 'application/octet-stream' });
      if (expectedHash !== null) {
        const bytes = await blob.arrayBuffer(); requireSession();
        const digest = await crypto.subtle.digest('SHA-256', bytes); requireSession();
        const actualHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
        if (actualHash !== expectedHash.toLowerCase()) throw new Error('L’intégrité du fichier reçu est invalide. Réessayez son téléchargement.');
      }
      requireSession();
      return blob;
    } catch (error) { requireSession(); throw error; }
    finally { await reader.cancel().catch(() => {}); requireSession(); }
  }
  blobUrl(spaceId: string, blobId: string) { return `${this.baseUrl}/v1/spaces/${encodeURIComponent(spaceId)}/blobs/${encodeURIComponent(blobId)}`; }
}
