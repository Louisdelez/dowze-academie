import {createElement,useLayoutEffect} from 'react';
import {usePaperToolPreferences} from '../src/hooks/usePaperToolPreferences';
import {PaperToolSettings} from '../src/components/PaperToolSettings';
export function ToolSettingsRecipe(props:{scope:{accountId:string;spaceId:string};noteId:string;report:(value:ReturnType<typeof usePaperToolPreferences>)=>void}){
 const preferences=usePaperToolPreferences(props.scope,props.noteId);
 useLayoutEffect(()=>{props.report(preferences);});
 return createElement('main',{'data-account':props.scope.accountId,'data-note':props.noteId},createElement(PaperToolSettings,{preferences}));
}
export {createElement,act} from 'react';
export {createRoot} from 'react-dom/client';
export {flushSync} from 'react-dom';
export {listSnapshots,getSnapshot} from '../pwa/src/storage';
export {loadPaperToolPreferences,commitPaperToolPreferences,applyPaperToolPreferenceCommand,defaultPaperToolPreferences} from '../src/lib/paperToolPreferences';
export {hasPendingNotebookWrites,resumeAllNotebookAccounts} from '../src/lib/notebookSession';
