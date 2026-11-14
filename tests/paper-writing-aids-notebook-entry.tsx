export * from './paper-ink-workflows-entry';
export {paperWritingAidsKey} from '../src/hooks/usePaperWritingAids';
export {getSnapshot,notebookDeletionKey} from '../pwa/src/storage';
import {useLayoutEffect} from 'react';
import {usePaperWritingAids} from '../src/hooks/usePaperWritingAids';
export function WritingAidsSettingsRecipe(props:{scope:{accountId:string;spaceId:string;api?:unknown};noteId:string;disabled?:boolean;report:(value:ReturnType<typeof usePaperWritingAids>)=>void}){
 const result=usePaperWritingAids(props.scope,props.noteId,props.disabled??false);useLayoutEffect(()=>props.report(result));return null;
}
