import {checkedNotebookDocumentCodec,isPrivatePaperWrite,type NotebookDocumentCodec} from './notebookDocumentCodec';
import { appStorage } from "./appStorage";
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './tauri';
export class ServerError extends Error { constructor(public status: number, message: string, public code?: string, public currentVersion?: number) { super(message); } }
const transitions = new Set<string>();
export function serverAccountTransition(accountId: string, active?: boolean) {
  if (active === true) transitions.add(accountId);
  if (active === false) transitions.delete(accountId);
  return transitions.has(accountId);
}
export async function serverRequest<T>(accountId: string, method: string, path: string, body?: unknown, idempotencyKey?: string, documentCodec?:NotebookDocumentCodec): Promise<T> {
  const codec=checkedNotebookDocumentCodec(documentCodec);if(codec&&!isPrivatePaperWrite(method,path))throw new TypeError('Déclaration de document refusée sur cette route.');
  if (!isTauri()) throw new Error('La connexion serveur est disponible dans l’application Desktop.');
  let expectedAccountId: string | undefined;
  if (path.startsWith('/v1/spaces')) {
    if (serverAccountTransition(accountId)) throw new Error('Changement de compte en cours.');
    const linked = JSON.parse(appStorage.getItem(`dowze.server.link.${accountId}`) ?? 'null');
    if (typeof linked?.id === 'string') expectedAccountId = linked.id;
  }
  const result = await invoke<{ status: number; data: T & { message?: string; code?: string; current_version?: number } }>('server_request', { accountId, method, path, body, idempotencyKey, expectedAccountId,...(codec?{documentCodec:codec}:{}) });
  if (result.status < 200 || result.status >= 300) throw new ServerError(result.status, result.data?.message ?? `Erreur serveur ${result.status}`, result.data?.code, result.data?.current_version);
  return result.data;
}
