import {canonical,type SyncDocument} from './serverSync.ts';

/** One App useMemo result. No hidden cache or document/protocol mutation. */
export interface ServerDocumentGroup {
  documents: SyncDocument[];
  /** Exactly canonical(documents), including its existing undefined semantics. */
  signature: string;
}

export function projectServerDocumentGroup(documents: readonly SyncDocument[]): ServerDocumentGroup {
  // The former App array spread also turns sparse source slots into undefined.
  const projected = [...documents];
  return {documents: projected, signature: canonical(projected)};
}

/** Concatenate the already-canonical array interiors in the original App order. */
export function joinServerDocumentGroups(groups: readonly ServerDocumentGroup[]): ServerDocumentGroup {
  const documents: SyncDocument[] = [], interiors: string[] = [];
  for (const group of groups) {
    for (const document of group.documents) documents.push(document);
    if (group.documents.length) interiors.push(group.signature.slice(1, -1));
  }
  return {documents, signature: `[${interiors.join(',')}]`};
}

/** App supplies the exact sibling projection's signature. Other callers retain
 * the original eager canonical walk, even for an unchanged array identity. */
export function serverDocumentsChangeSignature(documents: SyncDocument[], signature?: string): string {
  return signature ?? canonical(documents);
}
