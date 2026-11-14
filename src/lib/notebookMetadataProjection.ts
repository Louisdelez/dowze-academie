/** Read-only projection of the EXISTING metadata-v1 transport. The caller keeps
 * the raw source/UTF8 hash separately; this never renames or writes a note. */
import {noteMetadataTransportId} from './noteMetadataIdentity.ts';
import {notebookDocumentId} from './notebookIdentity.ts';

export interface NotebookMetadataProjectionIdentity {
 readonly accountId:string;readonly spaceId:string;readonly noteId:string;
 readonly canonicalDocumentId:string;readonly metadataDocumentId:string;
}
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
export function projectNotebookMetadata(identity:NotebookMetadataProjectionIdentity,source:unknown):Readonly<Record<string,unknown>>|null {
 if(!object(source))return null;
 if(source.notebookMetadataTransport===undefined)return source.id===identity.noteId?source:null;
 let wire:string;try{wire=noteMetadataTransportId(identity.noteId);}catch{return null;}
 if(wire===identity.noteId||wire!==identity.metadataDocumentId||identity.canonicalDocumentId!==notebookDocumentId(identity.noteId)||source.notebookMetadataTransport!==1||source.accountId!==identity.accountId||source.spaceId!==identity.spaceId||source.logicalId!==identity.noteId||source.documentId!==wire||source.graphId!==identity.canonicalDocumentId||!object(source.note)||source.note.id!==identity.noteId)return null;
 // A second top-level identity is ambiguous, even when the nested note is valid.
 if(source.id!==undefined&&source.id!==identity.noteId)return null;
 return source.note;
}
/** Alias IDs are a transport concern. A logical draft/outbox remains under its
 * original ID. Unrelated historical managed identities keep their old key. */
export function managedLocalMetadataId(identity:NotebookMetadataProjectionIdentity):string {
 try{return identity.metadataDocumentId!==identity.noteId&&identity.metadataDocumentId===noteMetadataTransportId(identity.noteId)?identity.noteId:identity.metadataDocumentId;}catch{return identity.metadataDocumentId;}
}
