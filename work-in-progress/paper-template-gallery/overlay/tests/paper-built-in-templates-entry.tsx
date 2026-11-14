export {createElement,act} from 'react';
export {createRoot} from 'react-dom/client';
export {renderToStaticMarkup} from 'react-dom/server';
export {PaperBuiltInTemplates} from '../src/components/PaperBuiltInTemplates';
export {PaperPageSettings} from '../src/components/PaperPageSettings';
export {migratePaper,applyPaperCommand,emptyPaperHistory,recordPaperHistory,travelPaperHistory,isPaperDocument} from '../src/lib/notebookDocument';
