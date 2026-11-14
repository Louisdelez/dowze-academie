import { appStorage } from "../lib/appStorage";
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { isTauri, type ConversationScope } from '../lib/tauri';
import { continuousSync } from '../lib/continuousSync';
import { nativeServerClient } from '../lib/nativeServerClient';
import { serverAccountTransition } from '../lib/server';
import { loadFormationCatalog, assessmentDocumentRecordId } from '../lib/formationRegistry';
import { formationStorageFor } from '../lib/profileStorage';
import { isStoredAssessments } from '../lib/studyValidation';
import { isAssetManifest, isAssetDeletion, uploadAsset, downloadAsset, sha256, type SharedAsset, type AssetDeletion } from '../lib/assetTransfer';
import { synchronizeSpace } from '../../pwa/src/sync';
import { listDrafts } from '../../pwa/src/storage';

const encode = (bytes: Uint8Array) => { let s=''; for(let i=0;i<bytes.length;i+=16384) s+=String.fromCharCode(...bytes.subarray(i,i+16384)); return btoa(s); };
export function useNativeAssetSync(accountId: string) {
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let stopped=false;
    const imported = new Set<string>();
    const sync = continuousSync(async () => {
      if (!isTauri() || stopped || !navigator.onLine || serverAccountTransition(accountId)) return;
      const raw = appStorage.getItem(`dowze.server.link.${accountId}`); if(!raw) return;
      const linked = JSON.parse(raw) as { id:string };
      const current = () => !stopped && !serverAccountTransition(accountId) && appStorage.getItem(`dowze.server.link.${accountId}`) === raw;
      const api = nativeServerClient(accountId, linked.id);
      for(const formation of loadFormationCatalog(accountId).formations) {
        if(!current()) return;
        const space = appStorage.getItem(`dowze.server.space.${accountId}.${linked.id}.${formation.instanceId}`); if(!space) continue;
        const scopes = await invoke<ConversationScope[]>('native_archive_list', { accountId, formationId:formation.instanceId });
        if(!Array.isArray(scopes)) continue;
        const keys=formationStorageFor(accountId,formation);
        const assessments:unknown = JSON.parse(appStorage.getItem(keys.assessments) ?? '[]');
        if(!isStoredAssessments(assessments)) throw new Error('Évaluations locales illisibles.');
        await synchronizeSpace(api,linked.id,space,current);
        const drafts=await listDrafts(linked.id,space);
        const manifests=drafts.sort((a,b)=>b.updatedAt-a.updatedAt).map(d=>d.content).filter(isAssetManifest).filter(m=>m.asset.kind!=='memory');
        const deletions=drafts.map(d=>d.content).filter(isAssetDeletion);
        const stateKey=`dowze.native.assets.${accountId}.${linked.id}.${space}`;
        const known:Record<string,AssetDeletion>=JSON.parse(appStorage.getItem(stateKey) ?? '{}');
        if(!known || typeof known!=='object' || !Object.values(known).every(isAssetDeletion)) throw new Error('Journal des fichiers invalide ; fichiers conservés.');
        const assetKey=(asset:SharedAsset)=>asset.kind==='pdf'?`pdf|${asset.record}|${asset.variant}`:asset.kind==='archive'?`archive|${asset.provider}|${asset.conversationId}`:`memory|${asset.sourceId}`;
        const removed=(asset:SharedAsset,digest:string)=>deletions.some(d=>assetKey(d.asset)===assetKey(asset) && d.hashes.includes(digest));
        const save=()=>{const encoded=JSON.stringify(known);appStorage.setItem(stateKey,encoded);if(appStorage.getItem(stateKey)!==encoded)throw new Error('Journal des fichiers non enregistré.');};
        const remember=(asset:SharedAsset,digest:string)=>{const key=assetKey(asset);known[key]={kind:'nativeAssetDeletion',asset,hashes:[...new Set([...(known[key]?.hashes ?? []),digest])]};save();};
        const present=new Set<string>();
        const assets: { asset:SharedAsset; name:string }[] = scopes.map(scope=>({asset:{kind:'archive',provider:scope.provider,conversationId:scope.conversationId},name:`${scope.provider} · ${scope.conversationId}`}));
        for(const exam of assessments) for(const variant of ['blank','completed'] as const) {
          const pdf=variant==='blank'?exam.blankPdf:exam.completedPdf;
          if(pdf) assets.push({asset:{kind:'pdf',record:exam.id,variant},name:pdf.originalName});
        }
        const nativeAsset = (asset:SharedAsset) => {
          if(asset.kind==='archive')return{kind:'archive',scope:{accountId,formationId:formation.instanceId,provider:asset.provider,conversationId:asset.conversationId}};
          if(asset.kind==='pdf')return{...asset,record:assessmentDocumentRecordId(formation,asset.record)};
          throw new Error('Type de fichier natif invalide.');
        };
        for(const {asset,name} of assets) {
          if(!current()) return;
          const file=await invoke<{dataBase64:string;sha256:string;size:number}|null>('native_asset_read',{accountId,formationId:formation.instanceId,asset:nativeAsset(asset)});
          if(!file) continue;
          let bytes:Uint8Array<ArrayBuffer>=Uint8Array.from(atob(file.dataBase64),c=>c.charCodeAt(0));
          if(asset.kind==='archive') { const archive=JSON.parse(new TextDecoder().decode(bytes)); archive.scope.accountId=linked.id; archive.scope.formationId=space; bytes=new TextEncoder().encode(JSON.stringify(archive)); }
          const digest=await sha256(bytes);
          if(removed(asset,digest)) {
            if(!current()) return;
            await invoke('native_asset_delete',{accountId,formationId:formation.instanceId,asset:nativeAsset(asset),sha256:file.sha256});
            delete known[assetKey(asset)];save();continue;
          }
          present.add(assetKey(asset));
          if(manifests.some(m=>m.sha256===digest && assetKey(m.asset)===assetKey(asset))) { remember(asset,digest); continue; }
          const manifest=await uploadAsset(api,space,asset,name,bytes,current);
          const id=`asset-${await sha256(new TextEncoder().encode(JSON.stringify({asset,digest,name})))}`;
          if(!current()) return;
          await api.putDocument(space,'preferences',id,0,manifest,id);
          remember(asset,digest);
        }
        for(const [key,previous] of Object.entries(known)) {
          if(present.has(key)) continue;
          if(!current()) return;
          const deletion:AssetDeletion={...previous,hashes:[...new Set([...previous.hashes,...manifests.filter(m=>assetKey(m.asset)===key).map(m=>m.sha256)])]};
          const id=`asset-deleted-${await sha256(new TextEncoder().encode(JSON.stringify(deletion)))}`;
          await api.putDocument(space,'preferences',id,0,deletion,id);
          deletions.push(deletion);delete known[key];save();
        }
        for(const manifest of manifests) {
          if(!current()) return;
          if(removed(manifest.asset,manifest.sha256)) continue;
          if(manifest.asset.kind==='pdf' && !assets.some(item=>assetKey(item.asset)===assetKey(manifest.asset))) continue;
          const marker=`${space}|${manifest.sha256}|${JSON.stringify(manifest.asset)}`;
          if(imported.has(marker)) continue;
          const bytes=await downloadAsset(api,space,manifest,current);
          try {
            await invoke('native_asset_import',{accountId,formationId:formation.instanceId,asset:nativeAsset(manifest.asset),dataBase64:encode(bytes),sha256:manifest.sha256});
            imported.add(marker);
            remember(manifest.asset,manifest.sha256);
          } catch(error) {
            if (!String(error).includes('Un autre PDF existe')) throw error;
            imported.add(marker); setNotice(`Fichier conservé sur le serveur : ${String(error)}`);
          }
        }
      }
    }, error=>{if(!stopped)setNotice(`Synchronisation des fichiers en attente : ${String(error)}`);},{interval:15000});
    const resume=()=>sync.request(true); addEventListener('online',resume); addEventListener('dowze:server-account',resume);resume();
    return()=>{stopped=true;sync.stop();removeEventListener('online',resume);removeEventListener('dowze:server-account',resume);};
  },[accountId]);
  return notice;
}
