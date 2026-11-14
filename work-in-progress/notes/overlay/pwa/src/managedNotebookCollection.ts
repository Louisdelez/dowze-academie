/** Discovery is a live server page, never an access grant or a private draft. */
import {ManagedClientError,managedCurrent,assertManagedCurrent,managedUuid,validManagedTicket,freezeManaged,parseManagedReply,type ManagedCollectionQuery,type ManagedTicket,type ManagedNotebookPort} from './managedNotebookClient.ts';
export const MANAGED_COLLECTION_PROTOCOL='dowze-managed-notebook-collection@1';
export const MAX_MANAGED_COLLECTION_REPLY=131_072;
export interface ManagedCollectionItem {readonly resource:ManagedTicket;readonly title:string;readonly title_status:'current'|'untitled'|'unavailable';readonly title_truncated:boolean;readonly updated_at:string;readonly direction:'owned'|'outgoing'|'incoming'}
export interface ManagedCollectionPage {readonly protocol:typeof MANAGED_COLLECTION_PROTOCOL;readonly actor_account_id:string;readonly scope:{readonly view:ManagedCollectionQuery['view'];readonly space_id:string;readonly owner_account_id:string|null};readonly epoch:string;readonly items:readonly ManagedCollectionItem[];readonly has_more:boolean;readonly next_cursor:string|null}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const fields=(v:unknown,names:readonly string[]):v is Record<string,unknown>=>record(v)&&Object.keys(v).length===names.length&&names.every(name=>Object.hasOwn(v,name));
const cursor=(v:unknown):v is string=>typeof v==='string'&&(v===''||/^[A-Za-z0-9_-]{1,768}\.[a-f0-9]{64}$/.test(v));
export function validManagedCollectionQuery(v:unknown):v is ManagedCollectionQuery {return fields(v,['view','spaceId','ownerAccountId','cursor','limit'])&&['owned','outgoing','incoming'].includes(String(v.view))&&typeof v.spaceId==='string'&&/^[A-Za-z0-9._-]{1,128}$/.test(v.spaceId)&&(v.ownerAccountId===null||managedUuid(v.ownerAccountId))&&cursor(v.cursor)&&Number.isSafeInteger(v.limit)&&Number(v.limit)>=1&&Number(v.limit)<=20;}
const invalid=()=>new ManagedClientError('invalid-response','La liste partagée reçue ne correspond pas à ce compte et à cette année.');
const ticketFields=['protocol','id','incarnation','owner_account_id','space_id','note_id','canonical_document_id','metadata_document_id','lineage','state','resource_version','acl_version','access_version','writer_version','role','capabilities'];
export function parseManagedCollectionPage(raw:string,actor:string,q:ManagedCollectionQuery):Readonly<ManagedCollectionPage>{
 if(!managedUuid(actor)||!validManagedCollectionQuery(q)||q.view!=='incoming'&&q.ownerAccountId!==null&&q.ownerAccountId!==actor)throw invalid();
 const value=parseManagedReply(raw,MAX_MANAGED_COLLECTION_REPLY);
 if(!fields(value,['protocol','actor_account_id','scope','epoch','items','has_more','next_cursor'])||value.protocol!==MANAGED_COLLECTION_PROTOCOL||value.actor_account_id!==actor||!fields(value.scope,['view','space_id','owner_account_id'])||value.scope.view!==q.view||value.scope.space_id!==q.spaceId||value.scope.owner_account_id!==q.ownerAccountId||typeof value.epoch!=='string'||!/^[a-f0-9]{64}$/.test(value.epoch)||!Array.isArray(value.items)||value.items.length>q.limit||typeof value.has_more!=='boolean'||(value.has_more?value.items.length!==q.limit||!cursor(value.next_cursor)||value.next_cursor==='':value.next_cursor!==null))throw invalid();
 let previous='';for(const item of value.items){
  if(!fields(item,['resource','title','title_status','title_truncated','updated_at','direction'])||!fields(item.resource,ticketFields)||!validManagedTicket(item.resource)||!fields(item.resource.capabilities,['read_documents','write_documents','read_blobs','manage_acl']))throw invalid();
  const t=item.resource;if(t.space_id!==q.spaceId||q.ownerAccountId!==null&&t.owner_account_id!==q.ownerAccountId||t.id<=previous||typeof item.title!=='string'||!item.title||item.title.length>200||/[\u0000-\u001f\u007f-\u009f]/.test(item.title)||!['current','untitled','unavailable'].includes(String(item.title_status))||typeof item.title_truncated!=='boolean'||typeof item.updated_at!=='string'||!Number.isFinite(Date.parse(item.updated_at)))throw invalid();
  const own=t.owner_account_id===actor;if(own!==(t.role==='owner')||t.capabilities.manage_acl!==own)throw invalid();
  if(q.view==='incoming'?(own||item.direction!=='incoming'):(!own||!['owned','outgoing'].includes(String(item.direction))||q.view==='outgoing'&&item.direction!=='outgoing'))throw invalid();
  if(item.title_status!=='current'&&(item.title!=='Note sans titre'||item.title_truncated))throw invalid();previous=t.id;
 }
 return freezeManaged(value as unknown as ManagedCollectionPage);
}
export function createManagedNotebookCollectionClient(input:{port:ManagedNotebookPort;actorAccountId:string;current:()=>boolean;currentPort:()=>ManagedNotebookPort}){
 const port=input.port,actor=input.actorAccountId,session=port.capture(actor),checkCurrent=managedCurrent(()=>input.current()&&input.currentPort()===port&&session.actorAccountId===actor&&session.current());
 return Object.freeze({current:checkCurrent,async page(query:ManagedCollectionQuery){const q=structuredClone(query);assertManagedCurrent(checkCurrent);if(!validManagedCollectionQuery(q))throw invalid();const reply=await session.json(freezeManaged({kind:'collection' as const,query:q,maximum:MAX_MANAGED_COLLECTION_REPLY}));assertManagedCurrent(checkCurrent);if(reply.status!==200)throw new ManagedClientError(reply.status===409?'source-changed':'http',reply.status===409?'La liste a changé. Rechargez-la depuis le début.':'La liste partagée ne peut pas être vérifiée. Reconnectez-vous ou réessayez.',reply.status);return parseManagedCollectionPage(reply.body,actor,q);}});
}
