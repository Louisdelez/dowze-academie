import {commitNotebookTransfer,getSnapshot,notebookDeletionKey,readNotebookDeletionStatus,type Snapshot,type NotebookTransferCommit} from '../../pwa/src/storage.ts';
import {notebookDocumentId,notebookIdentityDigest} from './notebookIdentity.ts';
import type {PaperStrokeStyle} from './notebookDocument.ts';

/** Tool instances have stable identities: two pens can keep different presets. */
export const PAPER_TOOL_KINDS=['text','pen','pencil','calligraphy','highlighter','eraser','select','lasso','laser'] as const;
export type PaperToolKind=typeof PAPER_TOOL_KINDS[number];
export interface PaperToolPreset {color:string;width:number;opacity:number;wholeEraser:boolean;strokeStyle?:PaperStrokeStyle}
export interface PaperToolSlot {id:string;tool:PaperToolKind;visible:boolean;preset:PaperToolPreset;label?:string}
export interface PaperToolPreferences {schema:1;toolbar:PaperToolSlot[];palette:string[];activeSlotId:string;dominantHand:'right'|'left';fingerInk:boolean;returnToPen?:boolean;previousInkSlotId?:string}
export interface PaperToolPreferenceScope {accountId:string;spaceId:string}
export const PAPER_TOOL_LIMIT=64;
export const PAPER_PALETTE_LIMIT=32;
const defaultPalette=['#20343b','#2855ce','#dd4050','#16a08a','#f6c447','#965ac8'];
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const slotId=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,126}$/.test(value)&&!value.includes('..');
const strokeStyle=(value:unknown):value is PaperStrokeStyle=>value==='solid'||value==='dashed'||value==='dotted';
const inkKind=(tool:PaperToolKind)=>['pen','pencil','calligraphy','highlighter'].includes(tool);
const toolKind=(value:unknown):value is PaperToolKind=>typeof value==='string'&&PAPER_TOOL_KINDS.includes(value as PaperToolKind);
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const clone=<T>(value:T):T=>structuredClone(value);
const same=(first:unknown,second:unknown)=>JSON.stringify(first)===JSON.stringify(second);
const own=(value:object,key:string)=>Object.hasOwn(value,key);
const currentCheck=(current:()=>boolean)=>{if(!current())throw new PaperToolPreferenceChangedError('Le compte ou la note a changé. Les réglages précédents restent conservés.');};
function scopeOnly(scope:PaperToolPreferenceScope):PaperToolPreferenceScope{
 if(typeof scope.accountId!=='string'||!scope.accountId.length||scope.accountId.length>2048||typeof scope.spaceId!=='string'||!scope.spaceId.length||scope.spaceId.length>2048)throw Error('Le compte et l’année sont nécessaires pour les réglages du carnet.');
 return {accountId:scope.accountId,spaceId:scope.spaceId};
}
function noteIdentity(noteId:string|undefined){if(noteId!==undefined&&(typeof noteId!=='string'||!noteId.length||noteId.length>4096))throw Error('L’identité complète de la note est nécessaire.');return noteId;}
export function normalizePaperToolColor(value:unknown):string|undefined{
 if(typeof value!=='string')return;const color=value.trim().toLowerCase();
 if(/^#[0-9a-f]{6}$/.test(color))return color;
 if(/^#[0-9a-f]{3}$/.test(color))return '#'+[...color.slice(1)].map(char=>char+char).join('');
}
export function defaultPaperToolPreset(tool:PaperToolKind):PaperToolPreset{
 return {color:tool==='highlighter'?'#f6c447':'#20343b',width:tool==='highlighter'?14:tool==='pencil'?2:tool==='eraser'?3:3,opacity:tool==='highlighter'?0.35:1,wholeEraser:false};
}
export const PAPER_FALLBACK_TEXT_SLOT:Readonly<PaperToolSlot>=Object.freeze({id:'paper-tool-fallback-text',tool:'text',visible:true,preset:Object.freeze(defaultPaperToolPreset('text'))});
export function defaultPaperToolPreferences():PaperToolPreferences{
 return {schema:1,toolbar:PAPER_TOOL_KINDS.map(tool=>({id:`paper-tool-${tool}`,tool,visible:true,preset:defaultPaperToolPreset(tool)})),palette:[...defaultPalette],activeSlotId:'paper-tool-text',dominantHand:'right',fingerInk:false};
}
function validPreset(value:unknown):value is PaperToolPreset{
 return record(value)&&Object.keys(value).every(key=>['color','width','opacity','wholeEraser','strokeStyle'].includes(key))&&normalizePaperToolColor(value.color)===value.color&&finite(value.width)&&value.width>=0.1&&value.width<=64&&finite(value.opacity)&&value.opacity>=0&&value.opacity<=1&&typeof value.wholeEraser==='boolean'&&(value.strokeStyle===undefined||strokeStyle(value.strokeStyle));
}
function validSlot(value:unknown):value is PaperToolSlot{
 return record(value)&&Object.keys(value).every(key=>['id','tool','visible','preset','label'].includes(key))&&slotId(value.id)&&value.id!==PAPER_FALLBACK_TEXT_SLOT.id&&toolKind(value.tool)&&typeof value.visible==='boolean'&&validPreset(value.preset)&&(value.label===undefined||typeof value.label==='string'&&value.label.trim().length>0&&value.label.length<=80);
}
function validPalette(value:unknown):value is string[]{return Array.isArray(value)&&value.length<=PAPER_PALETTE_LIMIT&&value.every(color=>normalizePaperToolColor(color)===color)&&new Set(value).size===value.length;}
function validActive(value:unknown,toolbar:PaperToolSlot[]):value is string{return value===PAPER_FALLBACK_TEXT_SLOT.id||typeof value==='string'&&toolbar.some(slot=>slot.id===value&&slot.visible);}
export function isPaperToolPreferences(value:unknown):value is PaperToolPreferences{
 return record(value)&&Object.keys(value).every(key=>['schema','toolbar','palette','activeSlotId','dominantHand','fingerInk','returnToPen','previousInkSlotId'].includes(key))&&value.schema===1&&Array.isArray(value.toolbar)&&value.toolbar.length<=PAPER_TOOL_LIMIT&&value.toolbar.every(validSlot)&&new Set(value.toolbar.map(slot=>slot.id)).size===value.toolbar.length&&validPalette(value.palette)&&validActive(value.activeSlotId,value.toolbar)&&['right','left'].includes(String(value.dominantHand))&&typeof value.fingerInk==='boolean'&&(value.returnToPen===undefined||typeof value.returnToPen==='boolean')&&(value.previousInkSlotId===undefined||slotId(value.previousInkSlotId));
}
/** Loading an older/invalid value never writes over it. A later explicit edit
 * archives the exact original row together with its replacement. */
export function normalizePaperToolPreferences(value:unknown):PaperToolPreferences{
 const defaults=defaultPaperToolPreferences();if(!record(value))return defaults;
 const toolbar:PaperToolSlot[]=[],used=new Set<string>();
 if(Array.isArray(value.toolbar))for(const raw of value.toolbar){
  if(toolbar.length>=PAPER_TOOL_LIMIT)break;
  if(!record(raw)||!slotId(raw.id)||raw.id===PAPER_FALLBACK_TEXT_SLOT.id||used.has(raw.id)||!toolKind(raw.tool))continue;
  const base=defaultPaperToolPreset(raw.tool),preset=record(raw.preset)?raw.preset:{};
  used.add(raw.id);toolbar.push({id:raw.id,tool:raw.tool,visible:typeof raw.visible==='boolean'?raw.visible:true,preset:{color:normalizePaperToolColor(preset.color)??base.color,width:finite(preset.width)&&preset.width>=0.1&&preset.width<=64?preset.width:base.width,opacity:finite(preset.opacity)&&preset.opacity>=0&&preset.opacity<=1?preset.opacity:base.opacity,wholeEraser:typeof preset.wholeEraser==='boolean'?preset.wholeEraser:base.wholeEraser,...(strokeStyle(preset.strokeStyle)?{strokeStyle:preset.strokeStyle}:{})},...(typeof raw.label==='string'&&raw.label.trim()&&raw.label.length<=80?{label:raw.label}:{})});
 }
 const selectedToolbar=Array.isArray(value.toolbar)?toolbar:defaults.toolbar;
 const palette=Array.isArray(value.palette)?[...new Set(value.palette.map(normalizePaperToolColor).filter((color):color is string=>!!color))].slice(0,PAPER_PALETTE_LIMIT):defaults.palette;
 const activeSlotId=validActive(value.activeSlotId,selectedToolbar)?value.activeSlotId:selectedToolbar.find(slot=>slot.visible&&slot.tool==='text')?.id??selectedToolbar.find(slot=>slot.visible)?.id??PAPER_FALLBACK_TEXT_SLOT.id;
 return {schema:1,toolbar:selectedToolbar,palette,activeSlotId,dominantHand:value.dominantHand==='left'?'left':'right',fingerInk:value.fingerInk===true,...(typeof value.returnToPen==='boolean'?{returnToPen:value.returnToPen}:{}),...(slotId(value.previousInkSlotId)?{previousInkSlotId:value.previousInkSlotId}:{})};
}
export function activePaperToolSlot(preferences:PaperToolPreferences):PaperToolSlot{
 return clone(preferences.toolbar.find(slot=>slot.id===preferences.activeSlotId&&slot.visible)??PAPER_FALLBACK_TEXT_SLOT);
}
function settleActive(preferences:PaperToolPreferences):PaperToolPreferences{
 if(!validActive(preferences.activeSlotId,preferences.toolbar))preferences.activeSlotId=preferences.toolbar.find(slot=>slot.visible&&slot.tool==='text')?.id??preferences.toolbar.find(slot=>slot.visible)?.id??PAPER_FALLBACK_TEXT_SLOT.id;
 return preferences;
}
export type PaperToolPreferenceCommand=
 | {type:'select';id:string}
 | {type:'move';id:string;to:number}
 | {type:'reorder';ids:string[]}
 | {type:'hide'|'show'|'remove'|'duplicate';id:string}
 | {type:'add';tool:PaperToolKind;preset?:Partial<PaperToolPreset>;label?:string}
 | {type:'patch-preset';id:string;patch:Partial<PaperToolPreset>}
 | {type:'rename';id:string;label?:string}
 | {type:'set-input';dominantHand?:'right'|'left';fingerInk?:boolean;returnToPen?:boolean}
 | {type:'palette-add'|'palette-remove';color:string}
 | {type:'reset-tool';tool:PaperToolKind}
 | {type:'reset-toolbar'|'reset-palette'|'reset-all'};
/** Indices are logical storage order, independent of the left-hand UI mirror.
 * A keyboard move therefore preserves focus on the same stable slot identity. */
export function applyPaperToolPreferenceCommand(preferences:PaperToolPreferences,command:PaperToolPreferenceCommand,newId:()=>string=()=>crypto.randomUUID()):PaperToolPreferences{
 if(!isPaperToolPreferences(preferences))throw Error('Les réglages d’outils sont invalides. Leur original reste conservé.');
 let next=clone(preferences);
 const find=(id:string)=>{const slot=next.toolbar.find(candidate=>candidate.id===id);if(!slot)throw Error('Cet outil n’est plus dans la barre.');return slot;};
 const allocate=()=>{const id=newId();if(!slotId(id)||id===PAPER_FALLBACK_TEXT_SLOT.id||next.toolbar.some(slot=>slot.id===id))throw Error('Le nouvel outil doit avoir une identité distincte.');if(next.toolbar.length>=PAPER_TOOL_LIMIT)throw Error('La barre peut contenir au maximum 64 outils.');return id;};
 switch(command.type){
  case 'select':if(command.id!==PAPER_FALLBACK_TEXT_SLOT.id&&!find(command.id).visible)throw Error('Affichez cet outil avant de le sélectionner.');next.activeSlotId=command.id;if(command.id!==PAPER_FALLBACK_TEXT_SLOT.id&&inkKind(find(command.id).tool))next.previousInkSlotId=command.id;break;
  case 'move':{find(command.id);if(!Number.isInteger(command.to)||command.to<0||command.to>=next.toolbar.length)throw Error('La nouvelle position de l’outil est invalide.');const index=next.toolbar.findIndex(slot=>slot.id===command.id),[slot]=next.toolbar.splice(index,1);next.toolbar.splice(command.to,0,slot);break;}
  case 'reorder':if(command.ids.length!==next.toolbar.length||new Set(command.ids).size!==next.toolbar.length||command.ids.some(id=>!next.toolbar.some(slot=>slot.id===id)))throw Error('L’ordre doit contenir chaque outil exactement une fois.');next.toolbar=command.ids.map(id=>find(id));break;
  case 'hide':find(command.id).visible=false;break;
  case 'show':find(command.id).visible=true;break;
  case 'remove':find(command.id);next.toolbar=next.toolbar.filter(slot=>slot.id!==command.id);break;
  case 'duplicate':{const source=find(command.id),slot={...clone(source),id:allocate(),visible:true};const at=next.toolbar.findIndex(candidate=>candidate.id===source.id);next.toolbar.splice(at+1,0,slot);next.activeSlotId=slot.id;break;}
  case 'add':{if(!toolKind(command.tool))throw Error('Cet outil n’est pas disponible.');const preset={...defaultPaperToolPreset(command.tool),...command.preset};if(command.preset&&own(command.preset,'color')){const color=normalizePaperToolColor(command.preset.color);if(!color)throw Error('Choisissez une couleur HEX valide.');preset.color=color;}next.toolbar.push({id:allocate(),tool:command.tool,visible:true,preset,...(command.label!==undefined?{label:command.label}:{})});next.activeSlotId=next.toolbar.at(-1)!.id;break;}
  case 'patch-preset':{const slot=find(command.id);const color=own(command.patch,'color')?normalizePaperToolColor(command.patch.color):undefined;if(own(command.patch,'color')&&!color)throw Error('Choisissez une couleur HEX valide.');slot.preset={...slot.preset,...command.patch,...(color?{color}:{})};break;}
  case 'rename':{const slot=find(command.id);if(command.label===undefined)delete slot.label;else{if(typeof command.label!=='string'||!command.label.trim()||command.label.trim().length>80)throw Error('Le nom de ce préréglage doit contenir entre 1 et 80 caractères.');slot.label=command.label.trim();}break;}
  case 'set-input':if(command.dominantHand!==undefined)next.dominantHand=command.dominantHand;if(command.fingerInk!==undefined)next.fingerInk=command.fingerInk;if(command.returnToPen!==undefined)next.returnToPen=command.returnToPen;break;
  case 'palette-add':{const color=normalizePaperToolColor(command.color);if(!color)throw Error('Choisissez une couleur HEX valide.');if(!next.palette.includes(color)){if(next.palette.length>=PAPER_PALETTE_LIMIT)throw Error('La palette peut contenir au maximum 32 couleurs.');next.palette.push(color);}break;}
  case 'palette-remove':{const color=normalizePaperToolColor(command.color);if(!color)throw Error('Choisissez une couleur HEX valide.');next.palette=next.palette.filter(value=>value!==color);break;}
  case 'reset-tool':if(!toolKind(command.tool))throw Error('Cet outil n’est pas disponible.');next.toolbar=next.toolbar.map(slot=>slot.tool===command.tool?{...slot,preset:defaultPaperToolPreset(slot.tool)}:slot);break;
  case 'reset-toolbar':{const active=activePaperToolSlot(next).tool;next.toolbar=defaultPaperToolPreferences().toolbar.map(slot=>({...slot,preset:clone(next.toolbar.find(previous=>previous.tool===slot.tool)?.preset??slot.preset)}));next.activeSlotId=next.toolbar.find(slot=>slot.tool===active)!.id;break;}
  case 'reset-palette':next.palette=[...defaultPalette];break;
  case 'reset-all':next=defaultPaperToolPreferences();break;
  default:throw Error('Cette modification de la barre d’outils est inconnue.');
 }
 settleActive(next);if(['select','duplicate','add','reset-toolbar'].includes(command.type)){const active=activePaperToolSlot(next);if(inkKind(active.tool))next.previousInkSlotId=active.id;}if(!isPaperToolPreferences(next))throw Error('Cette modification produirait des réglages d’outils invalides.');return next;
}

/** Notes override only the fields they change. New global tools and unrelated
 * global presets continue to flow into a note with its own favourite pen. */
export interface PaperToolPreferenceOverride {
 schema:1;
 toolbar?:{order?:string[];added?:PaperToolSlot[];removed?:string[];visibility?:Record<string,boolean>};
 presets?:Record<string,Partial<PaperToolPreset>>;
 labels?:Record<string,string|null>;
 palette?:string[];activeSlotId?:string;dominantHand?:'right'|'left';fingerInk?:boolean;returnToPen?:boolean;previousInkSlotId?:string|null;
}
function validPresetPatch(value:unknown):value is Partial<PaperToolPreset>{
 return record(value)&&Object.keys(value).every(key=>['color','width','opacity','wholeEraser','strokeStyle'].includes(key))&&(!own(value,'color')||normalizePaperToolColor(value.color)===value.color)&&(!own(value,'width')||finite(value.width)&&value.width>=0.1&&value.width<=64)&&(!own(value,'opacity')||finite(value.opacity)&&value.opacity>=0&&value.opacity<=1)&&(!own(value,'wholeEraser')||typeof value.wholeEraser==='boolean')&&(!own(value,'strokeStyle')||strokeStyle(value.strokeStyle));
}
export function isPaperToolPreferenceOverride(value:unknown):value is PaperToolPreferenceOverride{
 if(!record(value)||value.schema!==1||Object.keys(value).some(key=>!['schema','toolbar','presets','labels','palette','activeSlotId','dominantHand','fingerInk','returnToPen','previousInkSlotId'].includes(key)))return false;
 if(value.toolbar!==undefined){if(!record(value.toolbar)||Object.keys(value.toolbar).some(key=>!['order','added','removed','visibility'].includes(key)))return false;
  for(const key of ['order','removed'])if(value.toolbar[key]!==undefined&&(!Array.isArray(value.toolbar[key])||value.toolbar[key].length>PAPER_TOOL_LIMIT||!value.toolbar[key].every(slotId)||new Set(value.toolbar[key]).size!==value.toolbar[key].length))return false;
  if(value.toolbar.added!==undefined&&(!Array.isArray(value.toolbar.added)||value.toolbar.added.length>PAPER_TOOL_LIMIT||!value.toolbar.added.every(validSlot)||new Set(value.toolbar.added.map(slot=>slot.id)).size!==value.toolbar.added.length))return false;
  if(value.toolbar.visibility!==undefined&&(!record(value.toolbar.visibility)||Object.keys(value.toolbar.visibility).length>PAPER_TOOL_LIMIT||!Object.entries(value.toolbar.visibility).every(([id,visible])=>slotId(id)&&typeof visible==='boolean')))return false;
 }
 return (value.presets===undefined||record(value.presets)&&Object.keys(value.presets).length<=PAPER_TOOL_LIMIT&&Object.entries(value.presets).every(([id,preset])=>slotId(id)&&validPresetPatch(preset)))&&(value.labels===undefined||record(value.labels)&&Object.keys(value.labels).length<=PAPER_TOOL_LIMIT&&Object.entries(value.labels).every(([id,label])=>slotId(id)&&(label===null||typeof label==='string'&&label.trim()===label&&label.length>0&&label.length<=80)))&&(value.palette===undefined||validPalette(value.palette))&&(value.activeSlotId===undefined||slotId(value.activeSlotId))&&(value.dominantHand===undefined||value.dominantHand==='right'||value.dominantHand==='left')&&(value.fingerInk===undefined||typeof value.fingerInk==='boolean')&&(value.returnToPen===undefined||typeof value.returnToPen==='boolean')&&(value.previousInkSlotId===undefined||value.previousInkSlotId===null||slotId(value.previousInkSlotId));
}
export function resolvePaperToolPreferences(global:PaperToolPreferences,override:PaperToolPreferenceOverride={schema:1}):PaperToolPreferences{
 if(!isPaperToolPreferences(global)||!isPaperToolPreferenceOverride(override))throw Error('Les réglages d’outils ne peuvent pas être réunis.');
 const next=clone(global),removed=new Set(override.toolbar?.removed??[]);next.toolbar=next.toolbar.filter(slot=>!removed.has(slot.id));
 for(const added of override.toolbar?.added??[]){const existing=next.toolbar.findIndex(slot=>slot.id===added.id);if(existing>=0){if(next.toolbar[existing].tool!==added.tool)throw Error('Un outil propre à la note partage l’identité d’un outil global différent. Les versions sont conservées.');next.toolbar[existing]=clone(added);}else next.toolbar.push(clone(added));}
 if(next.toolbar.length>PAPER_TOOL_LIMIT)throw Error('La barre réunie dépasse 64 outils. Réduisez les outils propres à cette note.');
 for(const slot of next.toolbar){if(own(override.toolbar?.visibility??{},slot.id))slot.visible=override.toolbar!.visibility![slot.id];if(own(override.presets??{},slot.id))slot.preset={...slot.preset,...override.presets![slot.id]};if(own(override.labels??{},slot.id)){const label=override.labels![slot.id];if(label===null)delete slot.label;else slot.label=label;}}
 if(override.toolbar?.order){const ordered=override.toolbar.order;next.toolbar.sort((first,second)=>{const a=ordered.indexOf(first.id),b=ordered.indexOf(second.id);return (a<0?ordered.length:a)-(b<0?ordered.length:b);});}
 if(override.palette!==undefined)next.palette=[...override.palette];if(override.activeSlotId!==undefined)next.activeSlotId=override.activeSlotId;if(override.dominantHand!==undefined)next.dominantHand=override.dominantHand;if(override.fingerInk!==undefined)next.fingerInk=override.fingerInk;if(override.returnToPen!==undefined)next.returnToPen=override.returnToPen;if(override.previousInkSlotId===null)delete next.previousInkSlotId;else if(override.previousInkSlotId!==undefined)next.previousInkSlotId=override.previousInkSlotId;
 settleActive(next);if(!isPaperToolPreferences(next))throw Error('La barre réunie contient des réglages invalides.');return next;
}
export function paperToolPreferenceOverride(global:PaperToolPreferences,effective:PaperToolPreferences):PaperToolPreferenceOverride{
 if(!isPaperToolPreferences(global)||!isPaperToolPreferences(effective))throw Error('Les réglages d’outils sont invalides.');
 const override:PaperToolPreferenceOverride={schema:1},toolbar:NonNullable<PaperToolPreferenceOverride['toolbar']>={},presets:NonNullable<PaperToolPreferenceOverride['presets']>={},labels:NonNullable<PaperToolPreferenceOverride['labels']>={};
 const globalById=new Map(global.toolbar.map(slot=>[slot.id,slot]));const ids=new Set(effective.toolbar.map(slot=>slot.id));
 const removed=global.toolbar.filter(slot=>!ids.has(slot.id)).map(slot=>slot.id);if(removed.length)toolbar.removed=removed;
 const added=effective.toolbar.filter(slot=>!globalById.has(slot.id));if(added.length)toolbar.added=clone(added);
 const normalOrder=[...global.toolbar.filter(slot=>ids.has(slot.id)).map(slot=>slot.id),...added.map(slot=>slot.id)];const desiredOrder=effective.toolbar.map(slot=>slot.id);if(!same(normalOrder,desiredOrder))toolbar.order=desiredOrder;
 const visibility:Record<string,boolean>={};
 for(const slot of effective.toolbar){const original=globalById.get(slot.id);if(!original)continue;if(original.tool!==slot.tool)throw Error('Une identité d’outil ne peut pas changer de type. Dupliquez cet outil.');if(original.label!==slot.label)labels[slot.id]=slot.label??null;if(original.visible!==slot.visible)visibility[slot.id]=slot.visible;
  const patch:Partial<PaperToolPreset>={};for(const key of ['color','width','opacity','wholeEraser','strokeStyle'] as const)if(original.preset[key]!==slot.preset[key])Object.assign(patch,{[key]:key==='strokeStyle'?(slot.preset.strokeStyle??'solid'):slot.preset[key]});if(Object.keys(patch).length)presets[slot.id]=patch;
 }
 if(Object.keys(visibility).length)toolbar.visibility=visibility;if(Object.keys(toolbar).length)override.toolbar=toolbar;if(Object.keys(presets).length)override.presets=presets;if(Object.keys(labels).length)override.labels=labels;
 if(!same(global.palette,effective.palette))override.palette=[...effective.palette];if(global.activeSlotId!==effective.activeSlotId)override.activeSlotId=effective.activeSlotId;if(global.dominantHand!==effective.dominantHand)override.dominantHand=effective.dominantHand;if(global.fingerInk!==effective.fingerInk)override.fingerInk=effective.fingerInk;if((global.returnToPen??false)!==(effective.returnToPen??false))override.returnToPen=effective.returnToPen??false;if(global.previousInkSlotId!==effective.previousInkSlotId)override.previousInkSlotId=effective.previousInkSlotId??null;
 return override;
}

export interface PaperToolPreferenceRecord {schema:1;kind:'paper-tool-preferences';level:'global'|'note';accountId:string;spaceId:string;noteId?:string;revision:number;updatedAt:string;preferences?:PaperToolPreferences;override?:PaperToolPreferenceOverride}
export interface LoadedPaperToolPreferences {
 scope:PaperToolPreferenceScope;noteId?:string;globalRow?:Snapshot;noteRow?:Snapshot;deletionRow?:Snapshot;
 global:PaperToolPreferences;override:PaperToolPreferenceOverride;effective:PaperToolPreferences;warnings:string[];
}
export function paperToolPreferenceKey(scope:PaperToolPreferenceScope,noteId?:string):string{
 const clean=scopeOnly(scope);noteIdentity(noteId);return `paper-tool-preferences|v1|${notebookIdentityDigest(JSON.stringify(['tools',clean.accountId,clean.spaceId,noteId??null]))}`;
}
export function paperToolPreferenceHistoryPrefix(scope:PaperToolPreferenceScope,noteId?:string):string{return `${paperToolPreferenceKey(scope,noteId)}|history|`;}
function inScope(row:Snapshot|undefined,scope:PaperToolPreferenceScope,key:string){if(row&&(row.key!==key||row.accountId!==scope.accountId||row.spaceId!==scope.spaceId))throw Error('Les réglages conservés appartiennent à un autre compte ou à une autre année. Aucun original n’est remplacé.');}
function assertRecordOwner(value:unknown,scope:PaperToolPreferenceScope,noteId?:string){
 if(record(value)&&(own(value,'accountId')&&value.accountId!==scope.accountId||own(value,'spaceId')&&value.spaceId!==scope.spaceId||own(value,'noteId')&&value.noteId!==noteId))throw Error('La provenance de ces réglages appartient à un autre compte, une autre année ou une autre note. Aucun original n’est remplacé.');
}
function validRecord(value:unknown,scope:PaperToolPreferenceScope,noteId?:string):value is PaperToolPreferenceRecord{
 return record(value)&&value.schema===1&&value.kind==='paper-tool-preferences'&&value.level===(noteId===undefined?'global':'note')&&value.accountId===scope.accountId&&value.spaceId===scope.spaceId&&value.noteId===noteId&&Number.isSafeInteger(value.revision)&&Number(value.revision)>=1&&typeof value.updatedAt==='string'&&Number.isFinite(Date.parse(value.updatedAt))&&(noteId===undefined?isPaperToolPreferences(value.preferences)&&value.override===undefined:isPaperToolPreferenceOverride(value.override)&&value.preferences===undefined);
}
function loadedFromRows(scope:PaperToolPreferenceScope,noteId:string|undefined,globalRow:Snapshot|undefined,noteRow:Snapshot|undefined,deletionRow?:Snapshot):LoadedPaperToolPreferences{
 inScope(globalRow,scope,paperToolPreferenceKey(scope));if(noteId!==undefined)inScope(noteRow,scope,paperToolPreferenceKey(scope,noteId));
 assertRecordOwner(globalRow?.value,scope);assertRecordOwner(noteRow?.value,scope,noteId);
 const warnings:string[]=[],globalRecord=validRecord(globalRow?.value,scope)?globalRow!.value:undefined,noteRecord=noteId!==undefined&&validRecord(noteRow?.value,scope,noteId)?noteRow!.value:undefined;
 const global=globalRecord?.preferences??normalizePaperToolPreferences(record(globalRow?.value)?globalRow.value.preferences??globalRow.value:undefined);
 if(globalRow&&!globalRecord)warnings.push('Les anciens réglages globaux sont conservés. Leur forme compatible est utilisée sans remplacer l’original.');
 let override=noteRecord?.override??{schema:1 as const};if(noteRow&&!noteRecord)warnings.push('Les réglages propres à cette note sont illisibles. Leur original est conservé ; la barre globale reste disponible.');
 let effective:PaperToolPreferences;try{effective=resolvePaperToolPreferences(global,override);}catch(error){warnings.push(error instanceof Error?error.message:String(error));override={schema:1};effective=clone(global);}
 return {scope:scopeOnly(scope),...(noteId!==undefined?{noteId}:{}),...(globalRow?{globalRow:clone(globalRow)}:{}),...(noteRow?{noteRow:clone(noteRow)}:{}),...(deletionRow?{deletionRow:clone(deletionRow)}:{}),global:clone(global),override:clone(override),effective,warnings};
}
export async function loadPaperToolPreferences(scope:PaperToolPreferenceScope,noteId?:string,current:()=>boolean=()=>true):Promise<LoadedPaperToolPreferences>{
 const clean=scopeOnly(scope);noteIdentity(noteId);currentCheck(current);
 const [globalRow,noteRow]=await Promise.all([getSnapshot(paperToolPreferenceKey(clean)),noteId===undefined?Promise.resolve(undefined):getSnapshot(paperToolPreferenceKey(clean,noteId))]);currentCheck(current);
 let deletionRow:Snapshot|undefined;
 if(noteId!==undefined){const deletion=await readNotebookDeletionStatus(noteId,clean,current);currentCheck(current);if(deletion)throw Error('Cette note a été supprimée. Ses réglages restent conservés.');deletionRow=await getSnapshot(notebookDeletionKey({...clean,type:'whiteboard',documentId:notebookDocumentId(noteId)}));currentCheck(current);if(deletionRow)throw Error('Le statut de cette note doit être réexaminé avant de modifier ses réglages.');}
 return loadedFromRows(clean,noteId,globalRow,noteRow,deletionRow);
}
export class PaperToolPreferenceChangedError extends Error {}
export interface CommitPaperToolPreferencesInput {loaded:LoadedPaperToolPreferences;target:'global'|'note';preferences:PaperToolPreferences;current:()=>boolean;now?:string}
export interface PreparedPaperToolPreferenceCommit {commit:NotebookTransferCommit;loaded:LoadedPaperToolPreferences;changed:boolean}
async function preparePreferenceWrite(input:Omit<CommitPaperToolPreferencesInput,'preferences'>&{preferences?:PaperToolPreferences;override?:PaperToolPreferenceOverride}):Promise<PreparedPaperToolPreferenceCommit>{
 const {loaded,target,current}=input,scope=scopeOnly(loaded.scope);noteIdentity(loaded.noteId);currentCheck(current);if(target==='note'&&loaded.noteId===undefined)throw Error('Choisissez une note pour ces réglages.');
 // Loaded view state may be passed around, but it never constitutes ownership.
 inScope(loaded.globalRow,scope,paperToolPreferenceKey(scope));if(loaded.noteId!==undefined)inScope(loaded.noteRow,scope,paperToolPreferenceKey(scope,loaded.noteId));
 assertRecordOwner(loaded.globalRow?.value,scope);assertRecordOwner(loaded.noteRow?.value,scope,loaded.noteId);
 if(!isPaperToolPreferences(loaded.global)||!isPaperToolPreferences(loaded.effective)||!isPaperToolPreferenceOverride(loaded.override))throw Error('Rechargez la barre d’outils avant de conserver ses réglages.');
 if(input.preferences!==undefined&&!isPaperToolPreferences(input.preferences))throw Error('Les nouveaux réglages d’outils sont invalides.');
 const before=target==='global'?loaded.globalRow:loaded.noteRow,noteId=target==='note'?loaded.noteId:undefined,key=paperToolPreferenceKey(scope,noteId);
 const override=target==='note'?(input.override??paperToolPreferenceOverride(loaded.global,input.preferences!)):undefined;if(override&&!isPaperToolPreferenceOverride(override))throw Error('Les réglages propres à cette note sont invalides.');
 const value=target==='global'?input.preferences:override;
 const oldValue=validRecord(before?.value,scope,noteId)?target==='global'?before!.value.preferences:before!.value.override:undefined;
 const unchanged=oldValue!==undefined&&same(oldValue,value)||!before&&target==='note'&&same(override,{schema:1});
 const commit:NotebookTransferCommit={target:scope,sources:[],drafts:[],blobs:[],snapshots:[],draftChecks:[],blobChecks:[],snapshotChecks:[{key:paperToolPreferenceKey(scope),expected:loaded.globalRow}]};
 if(loaded.noteId!==undefined){commit.snapshotChecks.push({key:paperToolPreferenceKey(scope,loaded.noteId),expected:loaded.noteRow},{key:notebookDeletionKey({...scope,type:'whiteboard',documentId:notebookDocumentId(loaded.noteId)}),expected:loaded.deletionRow});if(loaded.deletionRow)throw Error('Cette note a été supprimée. Ses réglages restent conservés.');}
 if(unchanged)return {commit,loaded:clone(loaded),changed:false};
 const now=input.now??new Date().toISOString();if(!Number.isFinite(Date.parse(now)))throw Error('La date des nouveaux réglages est invalide.');
 const revision=record(before?.value)&&Number.isSafeInteger(before.value.revision)&&Number(before.value.revision)>=0?Number(before.value.revision)+1:1;if(!Number.isSafeInteger(revision))throw Error('La révision des réglages doit être réexaminée.');
 const nextValue:PaperToolPreferenceRecord={schema:1,kind:'paper-tool-preferences',level:target,...scope,...(noteId!==undefined?{noteId}:{}),revision,updatedAt:now,...(target==='global'?{preferences:clone(input.preferences!)}:{override:clone(override!)})},nextRow:Snapshot={key,...scope,value:nextValue};
 if(before){const historyKey=paperToolPreferenceHistoryPrefix(scope,noteId)+notebookIdentityDigest(JSON.stringify(before.value)),history=await getSnapshot(historyKey);currentCheck(current);inScope(history,scope,historyKey);
  if(history&&!same(history.value,before.value))throw Error('Une version antérieure de ces réglages utilise une identité incompatible. Aucun original n’est remplacé.');
  commit.snapshotChecks.push({key:historyKey,expected:history});if(!history)commit.snapshots.push({key:historyKey,...scope,value:clone(before.value)});
 }
 commit.snapshots.push(nextRow);
 const result=loadedFromRows(scope,loaded.noteId,target==='global'?nextRow:loaded.globalRow,target==='note'?nextRow:loaded.noteRow,loaded.deletionRow);
 return {commit,loaded:result,changed:true};
}
export async function preparePaperToolPreferenceCommit(input:CommitPaperToolPreferencesInput):Promise<PreparedPaperToolPreferenceCommit>{return preparePreferenceWrite(input);}
export async function commitPaperToolPreferences(input:CommitPaperToolPreferencesInput):Promise<LoadedPaperToolPreferences>{
 const plan=await preparePaperToolPreferenceCommit(input);currentCheck(input.current);
 try{await commitNotebookTransfer(plan.commit,input.current);}catch(error){if(!input.current())currentCheck(input.current);throw new PaperToolPreferenceChangedError(error instanceof Error?error.message:'Les réglages ont changé pendant leur enregistrement.');}
 currentCheck(input.current);return plan.loaded;
}
/** Reset only this note's override. The user's global defaults and every old
 * version are preserved; no unrelated note or server document is changed. */
export async function clearPaperToolPreferenceOverride(input:{loaded:LoadedPaperToolPreferences;current:()=>boolean;now?:string}):Promise<LoadedPaperToolPreferences>{
 const plan=await preparePreferenceWrite({...input,target:'note',override:{schema:1}});currentCheck(input.current);
 try{await commitNotebookTransfer(plan.commit,input.current);}catch(error){if(!input.current())currentCheck(input.current);throw new PaperToolPreferenceChangedError(error instanceof Error?error.message:'Les réglages ont changé pendant leur réinitialisation.');}
 currentCheck(input.current);return plan.loaded;
}
export type PaperToolPreferenceResetSection=PaperToolKind|'toolbar'|'palette'|'input'|'all';
/** A targeted note reset removes the relevant differences rather than pinning
 * today's global value. Future global edits then remain inherited. */
export async function resetPaperToolPreferenceSection(input:{loaded:LoadedPaperToolPreferences;target:'global'|'note';section:PaperToolPreferenceResetSection;current:()=>boolean;now?:string}):Promise<LoadedPaperToolPreferences>{
 const {loaded,target,section}=input;
 if(target==='global'){
  const preferences=section==='all'?defaultPaperToolPreferences():section==='toolbar'?applyPaperToolPreferenceCommand(loaded.global,{type:'reset-toolbar'}):section==='palette'?applyPaperToolPreferenceCommand(loaded.global,{type:'reset-palette'}):section==='input'?applyPaperToolPreferenceCommand(loaded.global,{type:'set-input',dominantHand:'right',fingerInk:false,returnToPen:false}):applyPaperToolPreferenceCommand(loaded.global,{type:'reset-tool',tool:section});
  return commitPaperToolPreferences({...input,preferences});
 }
 if(section==='all')return clearPaperToolPreferenceOverride(input);
 const override=clone(loaded.override);
 if(section==='toolbar'){
  const added=new Set(override.toolbar?.added?.map(slot=>slot.id)??[]);delete override.toolbar;delete override.activeSlotId;delete override.labels;
  if(override.presets){for(const id of Object.keys(override.presets))if(added.has(id))delete override.presets[id];if(!Object.keys(override.presets).length)delete override.presets;}
 }else if(section==='palette')delete override.palette;
 else if(section==='input'){delete override.dominantHand;delete override.fingerInk;delete override.returnToPen;delete override.previousInkSlotId;}
 else {
  if(!toolKind(section))throw Error('Cet outil n’est pas disponible.');
  const source=[...loaded.global.toolbar,...(override.toolbar?.added??[])],ids=new Set(source.filter(slot=>slot.tool===section).map(slot=>slot.id));
  if(override.presets){for(const id of Object.keys(override.presets))if(ids.has(id))delete override.presets[id];if(!Object.keys(override.presets).length)delete override.presets;}
  if(override.toolbar?.added)override.toolbar.added=override.toolbar.added.map(slot=>slot.tool===section?{...slot,preset:clone(loaded.global.toolbar.find(globalSlot=>globalSlot.tool===section)?.preset??defaultPaperToolPreset(section))}:slot);
 }
 const plan=await preparePreferenceWrite({...input,override});currentCheck(input.current);
 try{await commitNotebookTransfer(plan.commit,input.current);}catch(error){if(!input.current())currentCheck(input.current);throw new PaperToolPreferenceChangedError(error instanceof Error?error.message:'Les réglages ont changé pendant leur réinitialisation.');}
 currentCheck(input.current);return plan.loaded;
}
