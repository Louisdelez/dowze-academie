/** Local proof comparison only. Never serializes/replaces raw transport bytes.
 * JSON member ordering is not a source edit; row CAS remains exact elsewhere. */
import {parseManagedSourceJson,MAX_MANAGED_SOURCE_BYTES} from './managedNotebookProtocol.ts';
import {ManagedClientError} from './managedNotebookClient.ts';
export function managedLocalJsonEquals(local:unknown,remote:unknown):boolean {
 let encoded:string|undefined;try{encoded=JSON.stringify(local);}catch{return false;}
 if(encoded===undefined||new TextEncoder().encode(encoded).length>MAX_MANAGED_SOURCE_BYTES)return false;
 const left=parseManagedSourceJson(encoded);let nodes=0;
 const equal=(a:unknown,b:unknown,depth:number):boolean=>{if(++nodes>500_000||depth>256)throw new ManagedClientError('invalid-response','La comparaison de la source partagée dépasse son format borné.');if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,index)=>equal(value,b[index],depth+1));const x=a as Record<string,unknown>,y=b as Record<string,unknown>,keys=Object.keys(x);return keys.length===Object.keys(y).length&&keys.every(name=>Object.hasOwn(y,name)&&equal(x[name],y[name],depth+1));};
 return equal(left,remote,0);
}
