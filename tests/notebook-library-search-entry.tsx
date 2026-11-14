export * from './notebook-library-classification-entry';
export {ApiClient} from '../pwa/src/api';
export {applyPaperCommand,blankPage} from '../src/lib/notebookDocument';
export {reflowPaperText,textFlowFingerprint} from '../src/lib/paperTextFlow';
export {searchPaperDocument,resolvePaperSearchHit} from '../src/lib/paperSearch';
export {PAPER_SEARCH_DOCUMENT_CHANGED_EVENT} from '../src/lib/notebookSearchNavigation';

import type {Root} from 'react-dom/client';
import {NotebookLibraryView} from '../src/components/NotebookLibraryView';
/** Read only the committed real index. No setter, command or search result is
 * replaced by the fixture; current-source readiness is also checked in the DOM. */
export function readLibrarySearch(root:Root){
 const first=(root as unknown as {_internalRoot?:{current?:any}})?._internalRoot?.current,pending=first?[first]:[];
 while(pending.length){const fiber=pending.pop();if(fiber.sibling)pending.push(fiber.sibling);if(fiber.child)pending.push(fiber.child);if(fiber.type!==NotebookLibraryView)continue;
  for(let item=fiber.memoizedState,remaining=100;item&&remaining--;item=item.next){const value=item.memoizedState;if(value&&typeof value==='object'&&'documents'in value&&'index'in value&&typeof value.ready==='boolean')return {props:fiber.memoizedProps,state:value};}
 }
 return null;
}
export function readLibraryNavigation(root:Root){
 const first=(root as unknown as {_internalRoot?:{current?:any}})?._internalRoot?.current,pending=first?[first]:[];
 while(pending.length){const fiber=pending.pop();if(fiber.sibling)pending.push(fiber.sibling);if(fiber.child)pending.push(fiber.child);if(fiber.type!==NotebookLibraryView)continue;
  for(let item=fiber.memoizedState,remaining=100;item&&remaining--;item=item.next){const value=item.memoizedState;if(value&&typeof value==='object'&&value.view&&typeof value.view.query==='string'&&'source'in value)return value;}
 }
 return null;
}
