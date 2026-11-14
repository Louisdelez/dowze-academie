/** Actual canonical host/editor/parser/state. The runner declares its DOM/IDB seams. */
export {PaperCanonicalTextHost} from '../src/components/PaperCanonicalTextHost';
export {migratePaper,applyPaperCommand,notebookDocumentId} from '../src/lib/notebookDocument';
export {searchPaperDocument,resolvePaperSearchHit} from '../src/lib/paperSearch';
export {mapPaperEditorSearchRange} from '../src/lib/paperEditorSearch';
export {putDraft,getDraft,listDrafts,listMutations,putSnapshot,listSnapshots,putLocalBlob,listLocalBlobs} from '../pwa/src/storage';
export {ApiClient} from '../pwa/src/api';
export {editorViewCtx,parserCtx} from '@milkdown/kit/core';
export {headingIdGenerator} from '@milkdown/kit/preset/commonmark';
export {TextSelection} from '@milkdown/kit/prose/state';
export {undoDepth} from '@milkdown/kit/prose/history';
export {installRealPaperEditorProbe} from './paper-real-editor-probe';
export {createElement,createRef,act} from 'react';
export {createRoot} from 'react-dom/client';
