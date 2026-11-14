import type { ApiClient } from '../../pwa/src/api';
export type SharedAsset = { kind: 'pdf'; record: string; variant: 'blank' | 'completed' } | { kind: 'archive'; provider: string; conversationId: string } | { kind:'memory';sourceType:string;sourceId:string;origin:string;version:number;deleted:boolean };
export interface AssetDeletion { kind:'nativeAssetDeletion'; asset:SharedAsset; hashes:string[] }
export interface AssetManifest {
  kind: 'nativeAsset'; schema: 1; asset: SharedAsset; name: string; sha256: string; size: number;
  chunks: { id: string; size: number; sha256: string }[]; blob_ids: string[];
}
const MAX = 64 * 1024 * 1024, CHUNK = 8 * 1024 * 1024;
const hash = /^[a-f0-9]{64}$/;
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}$/.test(value) && !value.includes('..');
export function isSharedAsset(value:unknown):value is SharedAsset {
  if(!value || typeof value!=='object') return false;
  const asset=value as SharedAsset;
  if(asset.kind==='memory') return ['notes','conversations','cours','progression','examens','planning','whiteboard','activitéweb'].includes(asset.sourceType) && typeof asset.sourceId==='string' && !!asset.sourceId && asset.sourceId.length<=512 && typeof asset.origin==='string' && !!asset.origin && asset.origin.length<=256 && Number.isSafeInteger(asset.version) && asset.version>0 && typeof asset.deleted==='boolean';
  return asset.kind==='pdf' ? identifier(asset.record) && ['blank','completed'].includes(asset.variant) : asset.kind==='archive' && ['chatgpt','claude','gemini','mistral','deepseek','kimi'].includes(asset.provider) && identifier(asset.conversationId);
}
export function isAssetDeletion(value:unknown):value is AssetDeletion {
  if(!value || typeof value!=='object') return false;
  const v=value as AssetDeletion;
  return v.kind==='nativeAssetDeletion' && isSharedAsset(v.asset) && Array.isArray(v.hashes) && v.hashes.length>0 && v.hashes.length<=10000 && v.hashes.every(h=>typeof h==='string' && hash.test(h));
}
export const sha256 = async (bytes: Uint8Array<ArrayBuffer>) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
export function isAssetManifest(value: unknown): value is AssetManifest {
  if (!value || typeof value !== 'object') return false;
  const v = value as AssetManifest;
  if (v.kind !== 'nativeAsset' || v.schema !== 1 || typeof v.name !== 'string' || v.name.length > 512 || !hash.test(v.sha256) || !Number.isSafeInteger(v.size) || v.size <= 0 || v.size > MAX || !v.asset) return false;
  if(!isSharedAsset(v.asset)) return false;
  return Array.isArray(v.chunks) && v.chunks.length > 0 && v.chunks.length <= 8 && v.chunks.every(c => identifier(c.id) && Number.isSafeInteger(c.size) && c.size > 0 && c.size <= CHUNK && hash.test(c.sha256)) && v.chunks.reduce((n,c) => n+c.size,0) === v.size && Array.isArray(v.blob_ids) && JSON.stringify(v.blob_ids) === JSON.stringify(v.chunks.map(c=>c.id));
}
export async function uploadAsset(api: ApiClient, space: string, asset: SharedAsset, name: string, bytes: Uint8Array<ArrayBuffer>, current: () => boolean): Promise<AssetManifest> {
  if (!bytes.length || bytes.length > MAX) throw new Error('Fichier trop volumineux.');
  const chunks: AssetManifest['chunks'] = [];
  for (let offset=0; offset<bytes.length; offset+=CHUNK) {
    if (!current()) throw new Error('Changement de compte ou d’année.');
    const part = bytes.slice(offset, offset+CHUNK), digest = await sha256(part);
    const mutation = `part-${await sha256(new TextEncoder().encode(JSON.stringify([space,digest])))}`;
    const uploaded = await api.uploadBlob(space, new Blob([part], { type:'application/octet-stream' }), digest, mutation);
    chunks.push({ id: uploaded.id, size: part.length, sha256: digest });
  }
  return { kind:'nativeAsset', schema:1, asset, name, size:bytes.length, sha256:await sha256(bytes), chunks, blob_ids:chunks.map(c=>c.id) };
}
export async function downloadAsset(api: ApiClient, space: string, manifest: AssetManifest, current: () => boolean): Promise<Uint8Array<ArrayBuffer>> {
  if (!isAssetManifest(manifest)) throw new Error('Description du fichier invalide.');
  const bytes = new Uint8Array(manifest.size); let offset=0;
  for (const part of manifest.chunks) {
    if (!current()) throw new Error('Changement de compte ou d’année.');
    const blob = await api.downloadBlob(space, part.id), data = new Uint8Array(await blob.arrayBuffer());
    if (data.length !== part.size || await sha256(data) !== part.sha256) throw new Error('Un fragment du fichier est endommagé.');
    bytes.set(data, offset); offset+=data.length;
  }
  if (await sha256(bytes) !== manifest.sha256) throw new Error('Empreinte du fichier invalide.');
  if (!current()) throw new Error('Changement de compte ou d’année.');
  return bytes;
}
