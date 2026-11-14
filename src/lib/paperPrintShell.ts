/** Shared reference-counted shell privacy while preparing or previewing a PDF.
 * This does not call print or change the canonical notebook. */
const bodies=new WeakMap<Document,{count:number;alreadyActive:boolean}>();
export function ownPaperPrintShell(owner:Document){
 let entry=bodies.get(owner);
 if(!entry){entry={count:0,alreadyActive:owner.body.classList.contains('paper-print-preview-active')};bodies.set(owner,entry);}
 entry.count++;owner.body.classList.add('paper-print-preview-active');let released=false;
 return()=>{if(released)return;released=true;entry!.count--;if(!entry!.count){if(!entry!.alreadyActive)owner.body.classList.remove('paper-print-preview-active');bodies.delete(owner);}};
}
