/** Actual toolbar, geometry command and API epoch. This entry does not replace
 * the notebook writer or claim persistence through its controlled callback. */
export {PaperSelectionTools} from '../src/components/PaperSelectionTools';
export {applyPaperCommand,migratePaper,blankPage,isPaperDocument,emptyPaperHistory,recordPaperHistory,travelPaperHistory} from '../src/lib/notebookDocument';
export {paperSelectionScaleBounds,preparePaperSelectionScale} from '../src/lib/paperTransforms';
export {ApiClient} from '../pwa/src/api';
export {createElement,act,StrictMode} from 'react';
export {createRoot} from 'react-dom/client';
export {flushSync} from 'react-dom';
