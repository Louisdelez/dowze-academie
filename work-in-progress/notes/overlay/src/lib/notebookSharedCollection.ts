/** Read-only shared discovery and source projection. No local store or private API. */
import type {ApiClient} from '../../pwa/src/api.ts';
import {createManagedNotebookClient,managedCurrent,assertManagedCurrent,freezeManaged,ManagedClientError,type ManagedNotebookPort,type ManagedCollectionQuery,type ManagedRole} from '../../pwa/src/managedNotebookClient.ts';
import {createManagedNotebookCollectionClient,type ManagedCollectionItem} from '../../pwa/src/managedNotebookCollection.ts';
import {parseManagedSourceJson} from '../../pwa/src/managedNotebookProtocol.ts';
import {isPaperDocument,type PaperDocument,type PaperAsset} from './notebookDocument.ts';
import {hasPaperCollaboration,verifyPaperCollaboration} from './paperCollaboration.ts';
import {decodePaperSync} from './paperSync.ts';
import {projectNotebookMetadata} from './notebookMetadataProjection.ts';
import {registerNotebookWriter} from './notebookSession.ts';
import type {NotebookMediaScope} from '../components/NotebookEditor.tsx';
export interface SharedCollectionOptions {readonly scope:{readonly accountId:string;readonly spaceId:string};readonly view:ManagedCollectionQuery['view'];readonly api:ApiClient;readonly current:()=>boolean;readonly currentApi:()=>ApiClient;readonly openPort:(current:()=>boolean,signal:AbortSignal)=>Promise<{readonly port:ManagedNotebookPort;dispose():Promise<void>}>}
export interface SharedNotebookRead {readonly document:PaperDocument;readonly title:string;readonly role:ManagedRole;readonly canonicalSHA256:string;readonly metadataSHA256:string;readonly media:NotebookMediaScope;current():boolean}
const invalid=()=>new ManagedClientError('invalid-response','La note reçue ne correspond pas à son accès partagé actuel.');
export function createNotebookSharedCollection(input:SharedCollectionOptions){
 const scope=Object.freeze({...input.scope}),api=input.api,view=input.view,abort=new AbortController(),apiCurrent=api.captureSessionAuthority(scope.accountId);
 let retired=false,binding:Awaited<ReturnType<SharedCollectionOptions['openPort']>>|undefined,client:ReturnType<typeof createManagedNotebookClient>|undefined,collection:ReturnType<typeof createManagedNotebookCollectionClient>|undefined,tail:Promise<unknown>=Promise.resolve(),disposeTask:Promise<void>|undefined,unregister=()=>{},readOwner:object|null=null;
 let epoch='',nextCursor:string|null=null,loaded=false;const rows=new Map<string,Readonly<ManagedCollectionItem>>(),readRetirementListeners=new Set<()=>void>();
 const current=managedCurrent(()=>!retired&&!abort.signal.aborted&&input.current()&&input.currentApi()===api&&apiCurrent()),check=()=>assertManagedCurrent(current);
 check();
 const dispose=()=>{if(!disposeTask){retired=true;readOwner=null;rows.clear();readRetirementListeners.clear();abort.abort();const held=binding,revoked=held?.dispose();disposeTask=(async()=>{const results=await Promise.allSettled([tail,revoked]);if(binding&&binding!==held)results.push(...await Promise.allSettled([binding.dispose()]));const failed=results.find(row=>row.status==='rejected');if(failed?.status==='rejected')throw failed.reason;unregister();})();void disposeTask.catch(()=>{});}return disposeTask;};
 // Profile close revokes this read lease and joins every original request. It
 // never advertises a pending writer or admits a new operation during closing.
 unregister=registerNotebookWriter(scope.accountId,{flush:()=>dispose(),settled:()=>disposeTask??Promise.resolve(),suspend:()=>{void dispose();},resume:()=>{},pending:()=>false,dispose:()=>{void dispose();}});
 async function ready(){check();if(client)return;const held=await input.openPort(current,abort.signal);binding=held;if(!current()){await held.dispose();throw invalid();}client=createManagedNotebookClient({port:held.port,actorAccountId:scope.accountId,current,currentPort:()=>binding!.port});collection=createManagedNotebookCollectionClient({port:held.port,actorAccountId:scope.accountId,current,currentPort:()=>binding!.port});check();}
 function queue<T>(work:()=>Promise<T>):Promise<T>{check();const original=tail.then(async()=>{check();try{return await work();}catch(error){const hadRead=readOwner!==null;readOwner=null;rows.clear();const notificationErrors:unknown[]=[];if(hadRead)for(const listener of [...readRetirementListeners])try{listener();}catch(failed){notificationErrors.push(failed);}if(notificationErrors.length)throw new AggregateError([error,...notificationErrors],'La lecture partagée a échoué et sa fermeture doit être vérifiée.');throw error;}});tail=original.catch(()=>{});return original;}
 const list=()=>Object.freeze([...rows.values()]);
 async function page(first:boolean){await ready();check();if(first?loaded:!loaded||nextCursor===null)throw invalid();const query:ManagedCollectionQuery={view,spaceId:scope.spaceId,ownerAccountId:null,cursor:first?'':nextCursor!,limit:20};
  const received=await collection!.page(query);check();if(!first&&received.epoch!==epoch)throw invalid();let previous=[...rows.keys()].at(-1)??'';for(const item of received.items){if(item.resource.id<=previous||rows.has(item.resource.id))throw invalid();previous=item.resource.id;}
  if(received.has_more&&received.next_cursor===nextCursor)throw invalid();if(rows.size+received.items.length>2000)throw invalid();for(const item of received.items)rows.set(item.resource.id,item);epoch=received.epoch;nextCursor=received.next_cursor;loaded=true;return Object.freeze({items:list(),hasMore:received.has_more});
 }
 // Renderer error callbacks intentionally ignore a retired source. Notify the
 // owning view directly after read retirement, before rejecting the same work.
 const subscribeReadRetirement=(listener:()=>void)=>{check();readRetirementListeners.add(listener);return()=>{readRetirementListeners.delete(listener);};};
 const closeRead=()=>{readOwner=null;};
 async function open(id:string):Promise<SharedNotebookRead>{await ready();check();const item=rows.get(id);if(!item)throw invalid();readOwner=null;const state=await client!.readState(item.resource);check();const ticket=state.resource,identity={accountId:ticket.owner_account_id,spaceId:ticket.space_id,noteId:ticket.note_id,canonicalDocumentId:ticket.canonical_document_id,metadataDocumentId:ticket.metadata_document_id,lineage:ticket.lineage};
  const raw=parseManagedSourceJson(state.canonical.source_json),metadata=projectNotebookMetadata(identity,parseManagedSourceJson(state.metadata.source_json));if(!metadata||typeof metadata.title!=='string'||typeof metadata.markdown!=='string')throw invalid();
  const graph=raw.notebookEnvelope===3?await decodePaperSync({downloadBlob:async(space,blobId)=>{check();if(space!==identity.spaceId||raw.body_id!==blobId)throw invalid();return client!.download(state,blobId);}},identity.spaceId,raw,current):raw;check();
  if(!isPaperDocument(graph)||graph.noteId!==identity.noteId||!hasPaperCollaboration(graph)||graph.collaboration!.lineage!==identity.lineage)throw invalid();verifyPaperCollaboration(graph);check();
  const owner={};readOwner=owner;const readCurrent=managedCurrent(()=>current()&&client!.current()&&readOwner===owner),requireRead=()=>assertManagedCurrent(readCurrent),document=freezeManaged(graph) as PaperDocument;
  const media:NotebookMediaScope=Object.freeze({accountId:scope.accountId,spaceId:scope.spaceId,managedRead:Object.freeze({current:readCurrent,read(asset:PaperAsset,source:PaperDocument){const selected={...asset};requireRead();if(source!==document||!document.assets.some(row=>JSON.stringify(row)===JSON.stringify(selected))||!selected.serverId)throw invalid();return queue(async()=>{requireRead();const proof=state.blobs.find(row=>row.id===selected.serverId);if(!proof||proof.size!==selected.size||proof.media_type!==selected.mediaType)throw invalid();const blob=await client!.download(state,selected.serverId!);requireRead();return blob;});}})});
  return Object.freeze({document,title:metadata.title||'Note sans titre',role:ticket.role,canonicalSHA256:state.canonical.sha256,metadataSHA256:state.metadata.sha256,media,current:readCurrent});
 }
 return Object.freeze({current,first:()=>queue(()=>page(true)),more:()=>queue(()=>page(false)),open:(id:string)=>queue(()=>open(id)),subscribeReadRetirement,closeRead,dispose});
}
export interface NotebookSharedCollectionConfiguration {readonly source:unknown;current():boolean;create(view:ManagedCollectionQuery['view'],current:()=>boolean):ReturnType<typeof createNotebookSharedCollection>}
