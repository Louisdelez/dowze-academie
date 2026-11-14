/** Actual component and source extractor; speech delivery is an explicit fake
 * browser API. No real audio service, OS voice or native IME is claimed. */
export {PaperReadAloud} from '../src/components/PaperReadAloud';
export {preparePaperReadAloudText} from '../src/lib/paperReadAloudText';
export {migratePaper,blankPage} from '../src/lib/notebookDocument';
export {ApiClient} from '../pwa/src/api';
export {createElement,act} from 'react';
export {createRoot} from 'react-dom/client';
