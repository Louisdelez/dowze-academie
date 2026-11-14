import type {PaperToolSlot} from './paperToolPreferences.ts';
const inkTools=new Set(['pen','pencil','calligraphy','highlighter']);
/** Return to the previous visible ink preset, preserving its stable slot ID and
 * all its stored style fields. A stylus eraser while the pen is selected needs
 * no toolbar switch. Cancellation never changes the selected tool. */
export function createPaperEraserReturn(){
 let previous:string|null=null,selected:string|null=null;
 return {
  select(slot:Pick<PaperToolSlot,'id'|'tool'>){selected=slot.id;if(inkTools.has(slot.tool))previous=slot.id;},
  seed(previousInkSlotId:string|null){previous=previousInkSlotId;},
  previous(){return previous;},
  afterStroke(input:{intent:string;cancelled:boolean;enabled:boolean;activeSlot:PaperToolSlot;toolbar:readonly PaperToolSlot[]}):string|null{
   if(!input.enabled||input.cancelled||input.intent!=='eraser'||input.activeSlot.tool!=='eraser'||input.activeSlot.id!==selected||!previous)return null;
   const prior=input.toolbar.find(slot=>slot.id===previous&&slot.visible&&inkTools.has(slot.tool));return prior?.id??null;
  },
  clear(){previous=null;selected=null;},
 };
}
