import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';
import {LEGACY_NOTE_ID,noteBoardId} from './notebook.ts';

/** Historical lookup only. A stored paper's complete noteId must prove ownership. */
export const legacyNotebookDocumentId=(noteId:string)=>`paper-v3-${noteBoardId(noteId).slice(0,110)}`;

/** Hash the exact UTF-16 identity: UTF-8 would replace distinct lone surrogates. */
export function notebookIdentityDigest(noteId:string):string{
 const domain=new TextEncoder().encode('Dowze/notebook-document/id2\0'),bytes=new Uint8Array(domain.length+noteId.length*2);
 bytes.set(domain);for(let i=0;i<noteId.length;i++){const unit=noteId.charCodeAt(i);bytes[domain.length+i*2]=unit>>>8;bytes[domain.length+i*2+1]=unit&255;}
 return bytesToHex(sha256(bytes));
}

/** Short safe historical IDs remain stable. Ambiguous/truncated/path-unsafe IDs get a separate namespace. */
export function notebookDocumentId(noteId:string):string{
 if(noteId===LEGACY_NOTE_ID||/^[A-Za-z0-9][A-Za-z0-9._-]{0,104}$/.test(noteId)&&!noteId.includes('..')&&!/^[a-f0-9]{32}$/.test(noteId))return legacyNotebookDocumentId(noteId);
 return `paper-v3-id2-${notebookIdentityDigest(noteId)}`;
}
