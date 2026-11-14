import {notebookIdentityDigest} from './notebookIdentity.ts';

const PREFIX='note-meta-id2-';
/** Exact existing transport identity formula, extracted without storage imports. */
export function noteMetadataTransportId(logicalId:string):string{
 if(!logicalId||logicalId.length>200)throw Error('L’identité de cette note dépasse le format du carnet. Son original reste conservé.');
 return /^[A-Za-z0-9][A-Za-z0-9._-]{0,126}$/.test(logicalId)&&!logicalId.includes('..')&&!logicalId.startsWith(PREFIX)?logicalId:PREFIX+notebookIdentityDigest('Dowze/metadata-transport/id2\0'+logicalId);
}
