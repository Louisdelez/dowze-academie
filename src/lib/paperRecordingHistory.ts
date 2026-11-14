import {applyPaperCommand,type PaperCommand,type PaperHistory} from './notebookDocument.ts';

/** A saved recording is independent of the user's text/drawing undo steps. */
export function retainRecordingHistory(history:PaperHistory,command:PaperCommand):PaperHistory {
 const valid=(item:PaperCommand):boolean=>item.type==='batch'?item.commands.every(valid):item.type==='add-asset'?item.asset.mediaType==='audio/wav'||item.asset.mediaType.startsWith('audio/'):item.type==='add-audio'||item.type==='patch-object'&&Object.keys(item.patch).length===1&&item.patch.audioAnchor!==undefined;
 if(!valid(command))throw Error('Seules les sauvegardes audio peuvent être conservées dans cet historique.');
 const retain=(document:PaperHistory['past'][number])=>{const next=applyPaperCommand(document,command,document.updatedAt);return {...next,revision:document.revision};};
 return {past:history.past.map(retain),future:history.future.map(retain)};
}
