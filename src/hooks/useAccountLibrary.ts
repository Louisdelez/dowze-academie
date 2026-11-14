import { appStorage } from "../lib/appStorage";
import { useEffect, useState } from 'react';
import { continuousSync } from '../lib/continuousSync';
import { serverRequest, serverAccountTransition } from '../lib/server';
import { listServerSpaces, defaultServerSpace, type SpacePage } from '../lib/serverSpaces';
import { loadFormationCatalog } from '../lib/formationRegistry';
import { restoreServerFormation } from '../lib/accountLibrary';
import { emptySyncState, syncDocuments, type SyncState, type RemoteDocument } from '../lib/serverSync';
import type { FormationPackageFiles } from '../lib/formations';
import { workspaceSyncStorage } from '../lib/workspaceSyncStorage';
import {notebookMetadataSyncTransport,receiveNoteMetadataTransport} from '../lib/noteMetadataTransport';
import {canPublishNotebookMetadata} from '../lib/paperMetadataPublication';
import {nativeServerClient} from '../lib/nativeServerClient';
import {synchronizeNotebookYearBeforeMetadata} from '../lib/notebookAnnualSync';

export function useAccountLibrary(accountId: string, refresh: () => unknown) {
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let stopped = false;
    const sync = continuousSync(async () => {
      if (stopped || !navigator.onLine || serverAccountTransition(accountId)) return;
      const raw = appStorage.getItem(`dowze.server.link.${accountId}`);
      if (!raw) return;
      const linked = JSON.parse(raw) as { id: string };
      const current = () => !stopped && !serverAccountTransition(accountId) && appStorage.getItem(`dowze.server.link.${accountId}`) === raw;
      const spaces = await listServerSpaces(after => serverRequest<SpacePage>(accountId, 'GET', `/v1/spaces?limit=500${after ? `&after=${after}` : ''}`), current);
      for (const space of spaces) {
        if (!current()) return;
        const catalog = loadFormationCatalog(accountId);
        if (catalog.formations.some(item => appStorage.getItem(`dowze.server.space.${accountId}.${linked.id}.${item.instanceId}`) === space.id ||
          (item.storageKind === 'legacy-energy-year1' && item.packageId === space.formation_id))) continue;
        const documents = new Map<string, RemoteDocument>();
        let cursor: string | undefined;
        const seen = new Set<string>();
        do {
          const page: { items: RemoteDocument[]; next_cursor: string; has_more: boolean } = await serverRequest(accountId, 'GET', `/v1/spaces/${space.id}/changes?limit=500${cursor ? `&cursor=${cursor}` : ''}`);
          if (!current()) return;
          for (const rawItem of page.items) { const item=await receiveNoteMetadataTransport(rawItem,{accountId:linked.id,spaceId:space.id},current);if(item)documents.set(`${item.document_type}|${item.document_id}`, item); }
          if (page.has_more && (!page.next_cursor || seen.has(page.next_cursor))) throw new Error('Pagination des données annuelles incohérente.');
          seen.add(page.next_cursor); cursor = page.has_more ? page.next_cursor : undefined;
        } while (cursor);
        if (await restoreServerFormation({ accountId, serverAccountId: linked.id, space, documents: [...documents.values()],
          current, storage: appStorage, id: () => crypto.randomUUID(),
          course: async (id, version) => (await serverRequest<{ files: FormationPackageFiles }>(accountId, 'GET', `/v1/catalog/${id}/${version}/content`)).files })) {
          if (current()) { refresh(); setNotice('Une année de votre compte a été retrouvée sur cet appareil.'); }
        }
      }
      for (const formation of loadFormationCatalog(accountId).formations) {
        if (!current()) return;
        const inactive = () => current() && loadFormationCatalog(accountId).activeFormation.instanceId !== formation.instanceId;
        if (!inactive()) continue;
        const mappingKey = `dowze.server.space.${accountId}.${linked.id}.${formation.instanceId}`;
        let spaceId = appStorage.getItem(mappingKey);
        if (!spaceId) {
          const year = `${formation.manifest.academicYear.startDate.slice(0, 4)}-${formation.manifest.academicYear.endDate.slice(0, 4)}`;
          const compatible = spaces.filter(space => space.formation_id === formation.packageId && space.academic_year === year);
          if (compatible.length > 1) continue;
          spaceId = compatible[0]?.id ?? await defaultServerSpace(linked.id,formation.packageId,year);
          if (!compatible.length) {
            await serverRequest(accountId, 'PUT', `/v1/spaces/${spaceId}`, { formation_id: formation.packageId, academic_year: year, title: formation.manifest.name });
            if (!inactive()) continue;
          }
          appStorage.setItem(mappingKey, spaceId);
        }
        const notebookScope={accountId:linked.id,spaceId};
        const inAnnualScope=()=>inactive()&&appStorage.getItem(mappingKey)===notebookScope.spaceId&&loadFormationCatalog(accountId).formations.some(item=>item.instanceId===formation.instanceId&&item.packageId===formation.packageId);
        if(!await synchronizeNotebookYearBeforeMetadata(nativeServerClient(accountId,linked.id),notebookScope,inAnnualScope,()=>appStorage.flush()))continue;
        const stateKey = `dowze.server.sync.${accountId}.${linked.id}.${formation.instanceId}.${spaceId}`;
        const rawState = appStorage.getItem(stateKey);
        const state: SyncState = rawState ? JSON.parse(rawState) : emptySyncState();
        if (state.schema !== 1 || !state.base || !state.pending || !state.deletions || !state.conflicts || !Array.isArray(state.resolved)) throw new Error('Journal annuel illisible, conservé sans modification.');
        const workspace = workspaceSyncStorage(accountId, formation, appStorage);
        await syncDocuments({ state, current: inAnnualScope, ...workspace, id: () => crypto.randomUUID(),
          canPublish:document=>canPublishNotebookMetadata(document,notebookScope,inAnnualScope),
          save: async () => {if(!inAnnualScope())throw Error('Le compte ou l’année a changé avant l’enregistrement de son journal.');const value = JSON.stringify(state); appStorage.setItem(stateKey, value); if (appStorage.getItem(stateKey) !== value) throw new Error('Journal annuel non enregistré.'); await appStorage.flush(); },
          transport: notebookMetadataSyncTransport({
            changes: cursor => serverRequest(accountId, 'GET', `/v1/spaces/${spaceId}/changes?limit=500${cursor ? `&cursor=${cursor}` : ''}`),
            put: (document, version, mutationId) => serverRequest(accountId, 'PUT', `/v1/spaces/${spaceId}/documents/${document.type}/${document.id}`, { base_version: version, content: document.content }, mutationId),
            remove: (type, id, version, mutationId) => serverRequest(accountId, 'DELETE', `/v1/spaces/${spaceId}/documents/${type}/${id}?base_version=${version}`, undefined, mutationId),
          },notebookScope,inAnnualScope) });
      }
    }, error => { if (!stopped) setNotice(`Récupération des formations en attente : ${String(error)}`); }, { interval: 15000 });
    const resume = () => sync.request(true);
    addEventListener('online', resume); addEventListener('dowze:server-account', resume);
    resume();
    return () => { stopped = true; sync.stop(); removeEventListener('online', resume); removeEventListener('dowze:server-account', resume); };
  }, [accountId, refresh]);
  return notice;
}
