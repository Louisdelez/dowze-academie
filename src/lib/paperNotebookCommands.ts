import {expandPaperGroups,orderedPaperObjects,rotatePaperSelection} from './paperTransforms.ts';
import {copyPaperSelection,hasPaperSelection} from './paperClipboard.ts';
import {applyPaperCommand,type PaperCommand,type PaperDocument,type PaperObject,type PaperPage} from './notebookDocument.ts';
import {copiedPageText} from './paperPageCopy.ts';
import {paperObjectsOnPage} from './paperTextFlow.ts';
import type {NotebookMediaScope} from '../components/NotebookEditor';

export interface PaperNotebookCommandContext {
 ownerKey:string;generation:number;document:PaperDocument;pageId:string;
 /** Canonical objects visible on this page, including a shared text-flow root. */
 objects:readonly PaperObject[];selected:readonly string[];readOnly:boolean;
 blocked?:boolean;tombstone?:boolean;mode?:string;
}
export interface PaperNotebookCommandTarget {
 ownerKey:string;generation:number;noteId:string;pageId:string;revision:number;
 page:PaperPage;objects:PaperObject[];selected:string[];assets:PaperDocument['assets'];audio:PaperDocument['audio'];
 pageObjects:string;lineage:string|null;readOnly:boolean;blocked:boolean;tombstone:boolean;mode:string|null;
}
export type PaperNotebookCommandId='move-left'|'move-right'|'move-up'|'move-down'|'copy'|'paste'|'duplicate'|'lock'|'unlock'|'rotate-right'|'rotate-left'|'group'|'ungroup'|'front'|'back'|'delete'|'audio';
export interface PaperNotebookCommandDefinition {id:PaperNotebookCommandId;label:string;shortcut?:string;changesDocument:boolean}
export const PAPER_NOTEBOOK_COMMANDS:readonly PaperNotebookCommandDefinition[]=[
 {id:'move-left',label:'Déplacer à gauche',shortcut:'← · Maj : 10 unités',changesDocument:true},
 {id:'move-right',label:'Déplacer à droite',shortcut:'→ · Maj : 10 unités',changesDocument:true},
 {id:'move-up',label:'Déplacer vers le haut',shortcut:'↑ · Maj : 10 unités',changesDocument:true},
 {id:'move-down',label:'Déplacer vers le bas',shortcut:'↓ · Maj : 10 unités',changesDocument:true},
 {id:'copy',label:'Copier la sélection',shortcut:'Ctrl/Cmd+C',changesDocument:false},
 {id:'paste',label:'Coller les objets copiés',shortcut:'Ctrl/Cmd+V',changesDocument:true},
 {id:'duplicate',label:'Dupliquer la sélection',changesDocument:true},
 {id:'lock',label:'Verrouiller la sélection',changesDocument:true},
 {id:'unlock',label:'Déverrouiller la sélection',changesDocument:true},
 {id:'rotate-right',label:'Tourner à droite de 15°',changesDocument:true},
 {id:'rotate-left',label:'Tourner à gauche de 15°',changesDocument:true},
 {id:'group',label:'Grouper la sélection',changesDocument:true},
 {id:'ungroup',label:'Dégrouper la sélection',changesDocument:true},
 {id:'front',label:'Mettre au premier plan',changesDocument:true},
 {id:'back',label:'Mettre à l’arrière-plan',changesDocument:true},
 {id:'delete',label:'Supprimer la sélection',shortcut:'Suppr',changesDocument:true},
 {id:'audio',label:'Écouter le passage audio',changesDocument:false}
];
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
/** Commit timestamps and encoded collaboration updates may change independently of the command's graph. */
function paperNotebookCommandGraph(document:PaperDocument):string {
 const {updatedAt,collaboration,...graph}=document;
 return JSON.stringify({...graph,collaboration:collaboration?{schema:collaboration.schema,lineage:collaboration.lineage}:undefined});
}
export function capturePaperNotebookCommandTarget(context:PaperNotebookCommandContext,ids:readonly string[]=context.selected):PaperNotebookCommandTarget {
 const page=context.document.pages.find(value=>value.id===context.pageId);
 if(!page||!Number.isSafeInteger(context.generation))throw Error('La page doit être retrouvée avant cette commande.');
 const selected=[...new Set(ids)],visible=new Set(context.objects.map(object=>object.id));
 if(selected.some(id=>!visible.has(id)||!context.document.objects.some(object=>object.id===id)))throw Error('La sélection a changé de page.');
 return structuredClone({ownerKey:context.ownerKey,generation:context.generation,noteId:context.document.noteId,pageId:context.pageId,revision:context.document.revision,page,objects:selected.map(id=>context.document.objects.find(object=>object.id===id)!),selected,assets:context.document.assets,audio:context.document.audio,pageObjects:JSON.stringify(context.objects),lineage:context.document.collaboration?.lineage??null,readOnly:context.readOnly,blocked:context.blocked===true,tombstone:context.tombstone===true,mode:context.mode??null});
}
export function samePaperNotebookCommandScope(target:PaperNotebookCommandTarget,context:PaperNotebookCommandContext|null|undefined):context is PaperNotebookCommandContext {
 return !!context&&target.ownerKey===context.ownerKey&&target.generation===context.generation&&target.noteId===context.document.noteId&&target.pageId===context.pageId&&target.mode===(context.mode??null)&&target.lineage===(context.document.collaboration?.lineage??null)&&target.readOnly===context.readOnly&&target.blocked===(context.blocked===true)&&target.tombstone===(context.tombstone===true)&&!context.tombstone;
}
export function paperNotebookCommandTargetCurrent(target:PaperNotebookCommandTarget,context:PaperNotebookCommandContext|null|undefined):boolean {
 if(!samePaperNotebookCommandScope(target,context)||target.revision!==context.document.revision||target.pageObjects!==JSON.stringify(context.objects)||!equal(target.page,context.document.pages.find(page=>page.id===target.pageId))||!equal(target.assets,context.document.assets)||!equal(target.audio,context.document.audio)||!equal(target.selected,[...new Set(context.selected)]))return false;
 return target.objects.every(expected=>context.objects.some(object=>object.id===expected.id)&&equal(expected,context.document.objects.find(object=>object.id===expected.id)));
}
export function paperNotebookObjectLabel(object:PaperObject,index:number):string {
 const kind=object.kind==='ink'?(object.pen==='highlighter'?'Surlignage':'Trait'):object.kind==='image'?'Image':object.kind==='shape'?'Forme':object.kind==='sticky'?'Post-it':'Texte';
 const excerpt=(object.markdown??'').replace(/\s+/g,' ').trim().slice(0,70);
 return `${kind} ${index+1}${excerpt?' · '+excerpt:''}${object.locked?' · verrouillé':''}${object.audioAnchor?' · passage audio':''}`;
}
export function paperNotebookCommandAvailability(id:PaperNotebookCommandId,context:PaperNotebookCommandContext,media:NotebookMediaScope):{enabled:boolean;reason?:string} {
 const chosen=context.objects.filter(object=>context.selected.includes(object.id)),editable=chosen.filter(object=>!object.locked),definition=PAPER_NOTEBOOK_COMMANDS.find(item=>item.id===id)!;
 if(context.tombstone)return {enabled:false,reason:'Cette note est supprimée.'};
 if(definition.changesDocument&&(context.readOnly||context.blocked))return {enabled:false,reason:context.blocked?'La note attend la résolution de ses versions.':'La note est en lecture seule.'};
 if(id==='paste')return hasPaperSelection(media)?{enabled:true}:{enabled:false,reason:'Copiez d’abord des objets dans cet espace.'};
 if(!chosen.length)return {enabled:false,reason:'Sélectionnez un objet dans la liste.'};
 if(id==='copy'||id==='duplicate')return {enabled:true};
 if(id==='audio')return chosen.length===1&&!!chosen[0].audioAnchor&&context.document.audio.some(track=>track.id===chosen[0].audioAnchor!.sessionId)?{enabled:true}:{enabled:false,reason:'Sélectionnez un objet lié à un passage audio.'};
 if(id==='lock')return chosen.some(object=>!object.locked)?{enabled:true}:{enabled:false,reason:'La sélection est déjà verrouillée.'};
 if(id==='unlock')return chosen.some(object=>object.locked)?{enabled:true}:{enabled:false,reason:'La sélection est déjà déverrouillée.'};
 if(!editable.length)return {enabled:false,reason:'Déverrouillez les objets pour les modifier.'};
 if(id==='group'&&editable.length<2)return {enabled:false,reason:'Sélectionnez au moins deux objets déverrouillés.'};
 if(id==='ungroup'&&!editable.some(object=>object.groupId))return {enabled:false,reason:'Ces objets ne sont pas groupés.'};
 return {enabled:true};
}
export function planPaperNotebookCommand(id:PaperNotebookCommandId,context:PaperNotebookCommandContext,step=1,newId:()=>string=()=>crypto.randomUUID()):{command:PaperCommand;selected?:string[]}|null {
 const chosen=context.objects.filter(object=>context.selected.includes(object.id)),editable=chosen.filter(object=>!object.locked),batch=(commands:PaperCommand[])=>commands.length?{command:{type:'batch' as const,commands}}:null;
 if(!Number.isFinite(step)||step<=0||step>1000)throw Error('Le déplacement demandé est invalide.');
 if(id.startsWith('move-')){const dx=id==='move-left'?-step:id==='move-right'?step:0,dy=id==='move-up'?-step:id==='move-down'?step:0;return batch(editable.map(object=>({type:'patch-object',id:object.id,patch:{x:object.x+dx,y:object.y+dy}})));}
 if(id==='lock'||id==='unlock')return batch(chosen.filter(object=>object.locked!==(id==='lock')).map(object=>({type:'patch-object',id:object.id,patch:{locked:id==='lock'}})));
 if(id==='rotate-right'||id==='rotate-left')return batch(rotatePaperSelection(chosen,id==='rotate-right'?15:-15).map(object=>({type:'upsert-object',object})));
 if(id==='front'||id==='back')return batch(orderedPaperObjects([...context.objects],[...context.selected],id).filter(object=>object.z!==context.objects.find(source=>source.id===object.id)?.z).map(object=>({type:'patch-object',id:object.id,patch:{z:object.z}})));
 if(id==='group'){let groupId='';for(let attempt=0;attempt<32;attempt++){const value=newId();if(!context.document.objects.some(object=>object.id===value||object.groupId===value)){groupId=value;break;}}if(!groupId)throw Error('Le groupe attend une nouvelle identité.');return batch(editable.map(object=>({type:'patch-object',id:object.id,patch:{groupId}})));}
 if(id==='ungroup')return batch(editable.filter(object=>object.groupId).map(object=>({type:'patch-object',id:object.id,patch:{groupId:undefined}})));
 if(id==='delete')return editable.length?{command:{type:'remove-objects',ids:editable.map(object=>object.id)},selected:chosen.filter(object=>object.locked).map(object=>object.id)}:null;
 if(id==='duplicate'){
  const occupied=new Set(context.document.objects.flatMap(object=>object.groupId?[object.id,object.groupId]:[object.id])),groups=new Map<string,string>(),ids:string[]=[],top=Math.max(0,...context.objects.map(object=>object.z));
  const allocate=()=>{for(let i=0;i<32;i++){const id=newId();if(!occupied.has(id)){occupied.add(id);return id;}}throw Error('La copie attend une nouvelle identité.');};
  for(const object of chosen)if(object.groupId&&!groups.has(object.groupId)){const id=allocate();groups.set(object.groupId,id);}
  const commands:PaperCommand[]=chosen.map((original,index)=>{const id=allocate();ids.push(id);const {textFlow,...object}=structuredClone(original);return {type:'upsert-object',object:{...object,id,pageId:context.pageId,x:object.x+20,y:object.y+20,z:top+index+1,locked:false,createdAt:Date.now(),...(original.kind==='text'?{markdown:copiedPageText(original,context.pageId)}:{}),...(object.groupId?{groupId:groups.get(object.groupId)}:{})}};});
  return commands.length?{command:{type:'batch',commands},selected:ids}:null;
 }
 return null;
}
export interface PaperNotebookCommandHost {
 getCurrent:()=>PaperNotebookCommandContext|null;media:NotebookMediaScope;
 /** Recheck target after flushing and before the real command/CAS. */
 onCommit:(command:PaperCommand,target:PaperNotebookCommandTarget)=>boolean|Promise<boolean>;
 onSelect:(ids:string[],target:PaperNotebookCommandTarget)=>void;
 /** Prepare and apply with paper.applyPrepared; no clipboard file is written beforehand. */
 onPaste:(target:PaperNotebookCommandTarget)=>Promise<boolean>;
 onAudio?:(anchor:{sessionId:string;time:number},target:PaperNotebookCommandTarget)=>void;
 onNotice?:(message:string)=>void;
}
export async function executePaperNotebookCommand(host:PaperNotebookCommandHost,id:PaperNotebookCommandId,target:PaperNotebookCommandTarget,step=1):Promise<boolean> {
 const current=()=>paperNotebookCommandTargetCurrent(target,host.getCurrent());if(!current())return false;
 const context=host.getCurrent()!,available=paperNotebookCommandAvailability(id,context,host.media);if(!available.enabled)return false;
 try{
  if(id==='copy'){const count=await copyPaperSelection(context.document,target.selected,host.media,current,target.pageId);if(!current())return false;host.onNotice?.(`${count} objet${count>1?'s':''} copié${count>1?'s':''}.`);return true;}
  if(id==='paste'){if(!current())return false;return await host.onPaste(target);}
  if(id==='audio'){const anchor=target.objects[0]?.audioAnchor;if(!anchor||!current()||!host.onAudio)return false;host.onAudio({...anchor},target);return true;}
  const plan=planPaperNotebookCommand(id,context,step);if(!plan||!current())return false;
  // Snapshot the exact expected mutation before awaiting the host. A later edit cannot inherit this selection.
  const expected=plan.selected?applyPaperCommand(context.document,plan.command,context.document.updatedAt):null;
  const expectedGraph=expected?paperNotebookCommandGraph(expected):null,expectedVisible=expected?JSON.stringify(paperObjectsOnPage(expected,target.pageId)):null;
  const accepted=await host.onCommit(plan.command,target);if(!accepted)return false;
  const latest=host.getCurrent();
  if(plan.selected&&samePaperNotebookCommandScope(target,latest)&&latest.document.revision===target.revision+1&&paperNotebookCommandGraph(latest.document)===expectedGraph&&JSON.stringify(latest.objects)===expectedVisible&&equal(target.selected,[...new Set(latest.selected)])&&plan.selected.every(value=>latest.objects.some(object=>object.id===value))){
   // Removed IDs may still be selected until React renders; recapture their surviving objects and the actual UI selection.
   const remaining=latest.selected.filter(value=>latest.objects.some(object=>object.id===value));
   const selectionTarget={...capturePaperNotebookCommandTarget(latest,remaining),selected:[...new Set(latest.selected)]};
   const selectionContext=host.getCurrent();
   if(selectionContext&&paperNotebookCommandTargetCurrent(selectionTarget,selectionContext)&&paperNotebookCommandGraph(selectionContext.document)===expectedGraph&&JSON.stringify(selectionContext.objects)===expectedVisible)host.onSelect(plan.selected,selectionTarget);
  }
  return true;
 }catch(error){if(current())host.onNotice?.(String(error instanceof Error?error.message:error));return false;}
}
export function paperNotebookSelectedGroup(context:PaperNotebookCommandContext,id:string,multi=false):string[]{
 const group=expandPaperGroups([...context.objects],[id]);return multi?context.selected.includes(id)?context.selected.filter(value=>!group.includes(value)):[...new Set([...context.selected,...group])]:group;
}
