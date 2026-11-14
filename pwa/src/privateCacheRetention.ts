import type {Draft,LocalBlob,Snapshot,Mutation} from './storage.ts';
/** A recovery journal and its bytes are durable user work, never expendable cache. */
export function privateCacheRetention(accountId:string,drafts:readonly Draft[],snapshots:readonly Snapshot[],blobs:readonly LocalBlob[],mutations:readonly Mutation[]){
 const candidates=blobs.filter(b=>b.accountId===accountId),retained=new Set<string>();
 const identifiers=new Map<string,string[]>();for(const b of candidates){for(const id of [b.id,b.serverId].filter((s):s is string=>!!s))identifiers.set(id,[...(identifiers.get(id)??[]),b.id]);}
 const inspect=(root:unknown)=>{const stack=[root],seen=new Set<object>();while(stack.length){const value=stack.pop();if(!value||typeof value!=='object'||value instanceof Blob||seen.has(value as object))continue;seen.add(value as object);
  for(const [field,child] of Object.entries(value)){if(typeof child==='string'&&['id','assetId','serverId','body_id'].includes(field)){for(const id of identifiers.get(child)??[])retained.add(id);}else if(Array.isArray(child)&&['chunkIds','blob_ids'].includes(field)){for(const key of child)if(typeof key==='string')for(const id of identifiers.get(key)??[])retained.add(id);}else if(child&&typeof child==='object')stack.push(child);}
 }};
 for(const d of drafts)if(d.accountId===accountId&&d.syncState!=='synced')inspect(d.content);
 for(const m of mutations)if(m.accountId===accountId)inspect(m.content);
 // All notebook history/migration/conflict/audio recovery stays intact across logout.
 const cacheSnapshots=snapshots.filter(s=>s.accountId===accountId&&(s.key.startsWith('course|')||s.key.startsWith('sync-cursor|')));
 for(const s of snapshots)if(s.accountId===accountId&&!cacheSnapshots.includes(s))inspect(s.value);
 return {snapshotKeys:cacheSnapshots.map(s=>s.key),blobIds:candidates.filter(b=>b.status==='uploaded'&&!retained.has(b.id)).map(b=>b.id)};
}
