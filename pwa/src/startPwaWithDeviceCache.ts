import {appStorage,type DeviceCache} from '../../src/lib/appStorage.ts';

/** Shared notebook controls read this cache on their first mount. */
export async function startPwaWithDeviceCache(render:()=>void,cache:Pick<DeviceCache,'initialize'>=appStorage):Promise<void>{
 try{
  // PWA account/session/preferences still use localStorage. Open the durable
  // cache without the desktop legacy migration, which would remove those keys.
  await cache.initialize();
 }catch{
  // Keep the workspace available. A failed timer read remains disabled and
  // displays its recovery warning; an unavailable cache is never an empty one.
 }
 render();
}
