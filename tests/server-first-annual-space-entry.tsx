import {createElement,useLayoutEffect} from 'react';
import {useServerSync} from '../src/hooks/useServerSync';
import {ServerSettings} from '../src/components/ServerSettings';
import type {InstalledFormation} from '../src/lib/formations';
export function AnnualSpaceRecipe({accountId,formation,report}:{accountId:string;formation:InstalledFormation;report:(value:ReturnType<typeof useServerSync>)=>void}){
 const sync=useServerSync(accountId,formation,[],()=>true);
 useLayoutEffect(()=>{report(sync);});
 return createElement(ServerSettings,{sync});
}
export {act,createElement} from 'react';
export {createRoot} from 'react-dom/client';
export {appStorage} from '../src/lib/appStorage';
