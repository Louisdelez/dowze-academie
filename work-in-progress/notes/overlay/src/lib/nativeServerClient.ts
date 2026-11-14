import {checkedNotebookDocumentCodec,PAPER_TEXT_STYLE_DOCUMENT_CODEC} from './notebookDocumentCodec';
import { appStorage } from "./appStorage";
import { invoke } from '@tauri-apps/api/core';
import { ApiClient } from '../../pwa/src/api';
import { serverRequest, serverAccountTransition, ServerError } from './server';
import {ownsPaperDocument} from './notebookDocument';

export function nativeServerClient(accountId: string, serverAccountId: string): ApiClient {
  const client = new ApiClient('https://academie.dowze.ch', async (input, init = {}) => {
    if (serverAccountTransition(accountId)) throw new Error('Changement de compte en cours.');
    const linked = JSON.parse(appStorage.getItem(`dowze.server.link.${accountId}`) ?? 'null');
    if (linked?.id !== serverAccountId) throw new Error('Le compte de synchronisation a changé.');
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'https://academie.dowze.ch');
    if (url.origin !== 'https://academie.dowze.ch') throw new Error('Destination refusée.');
    // CSRF stays inside the native vault. The shared client only needs a readiness marker.
    if (url.pathname === '/v1/csrf') return Response.json({ csrf_token: 'protected-by-native-vault' });
    const method = init.method ?? 'GET';
    const headers = new Headers(init.headers);
    const blob = /^\/v1\/spaces\/([A-Za-z0-9._-]+)\/blobs(?:\/([A-Za-z0-9._-]+))?$/.exec(url.pathname);
    if (blob) {
      let dataBase64: string | undefined;
      if (method === 'POST') {
        if (!(init.body instanceof Blob) || init.body.size > 16 * 1024 * 1024) throw new Error('Fichier invalide.');
        const bytes = new Uint8Array(await init.body.arrayBuffer());
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 16384) binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
        dataBase64 = btoa(binary);
      }
      const result = await invoke<{ status: number; data: { dataBase64?: string; mediaType?: string; [key: string]: unknown } }>('server_blob_request', {
        accountId, expectedAccountId: serverAccountId, spaceId: blob[1], method, blobId: blob[2], dataBase64,
        mediaType: headers.get('content-type') ?? undefined, idempotencyKey: headers.get('x-idempotency-key') ?? undefined,
      });
      if (result.status === 200 && typeof result.data.dataBase64 === 'string') {
        const bytes = Uint8Array.from(atob(result.data.dataBase64), character => character.charCodeAt(0));
        return new Response(bytes, { status: 200, headers: { 'content-type': result.data.mediaType ?? 'application/octet-stream' } });
      }
      return Response.json(result.data, { status: result.status });
    }
    try {
      const data = await serverRequest(accountId, method, url.pathname + url.search,
        typeof init.body === 'string' ? JSON.parse(init.body) : undefined, headers.get('x-idempotency-key') ?? undefined,checkedNotebookDocumentCodec(headers.get('x-dowze-document-codec')??undefined));
      return data === null ? new Response(null, { status: 204 }) : Response.json(data);
    } catch (error) {
      if (error instanceof ServerError) return Response.json({ message: error.message, code: error.code, current_version: error.currentVersion }, { status: error.status });
      throw error;
    }
  },ownsPaperDocument,{documentCodec:PAPER_TEXT_STYLE_DOCUMENT_CODEC});
  client.bindAccount(serverAccountId);
  return client;
}
