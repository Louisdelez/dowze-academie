import type {PaperSearchHit} from './paperSearch';
import type {PaperDocument} from './notebookDocument';

/** Ephemeral navigation intent. Never persist callbacks or a search hit as note data. */
export interface PaperSearchOpenRequest {
 readonly query:string;
 readonly hit:PaperSearchHit;
}

/** The parent captures its owner/API lease before activating a note. A fresh
 * requestId distinguishes repeated navigation to the same occurrence. */
export interface PaperSearchNavigation extends PaperSearchOpenRequest {
 readonly requestId:string;
 readonly current:()=>boolean;
}

/** The mounted text/PDF layer also receives the canonical document it must
 * revalidate. This remains an ephemeral view request, never note metadata. */
export interface PaperSearchNavigationRequest {
 readonly document:PaperDocument;
 readonly hit:PaperSearchHit;
 readonly current:()=>boolean;
 readonly scroll?:boolean;
}

/** Writers may dispatch this after a durable canonical change. The library also
 * refreshes on focus/visibility so metadata arrays need not change first. */
export const PAPER_SEARCH_DOCUMENT_CHANGED_EVENT='dowze:paper-document-changed';
export interface PaperSearchDocumentChangedDetail {
 readonly accountId:string;
 readonly spaceId:string;
 readonly noteId?:string;
 readonly documentId?:string;
}
