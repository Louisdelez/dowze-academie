/** Event admission for one already accepted IME chain. This owns no PM state,
 * DOM, timer or persistence and never ends composition on the editor's behalf. */
export interface PaperEditorInputEvent {
 type:string;inputType?:string;data?:string|null;isComposing?:boolean;
 key?:string;keyCode?:number;ctrlKey?:boolean;metaKey?:boolean;altKey?:boolean;
}
export interface PaperEditorInputGate {
 admit:(event:PaperEditorInputEvent,target:object,writable:boolean)=>boolean;
 pending:()=>boolean;
 /** Only after the real compositionend and normal DOM observer confirmation. */
 confirmed:()=>void;
}
const compositionInput=new Set(['insertCompositionText','deleteCompositionText','insertFromComposition','deleteByComposition']);
const candidateKeys=new Set(['Enter','Escape','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
export function createPaperEditorInputGate():PaperEditorInputGate {
 let target:object|null=null,phase:'idle'|'active'|'finishing'='idle',finalData:string|null=null,finalInputSeen=false;
 const admit=(event:PaperEditorInputEvent,eventTarget:object,writable:boolean)=>{
  if(event.type==='compositionstart'){
   if(!writable||phase!=='idle')return false;
   target=eventTarget;phase='active';finalData=null;finalInputSeen=false;return true;
  }
  const own=target===eventTarget&&phase!=='idle';
  if(event.type==='compositionupdate')return own&&phase==='active';
  if(event.type==='compositionend'){
   if(!own||phase!=='active')return writable;
   phase='finishing';finalData=typeof event.data==='string'?event.data:null;return true;
  }
  if(writable)return true;
  if(!own)return false;
  if(event.type==='beforeinput'||event.type==='input'){
   if(compositionInput.has(event.inputType??''))return true;
   if(event.inputType==='insertText'&&phase==='active'&&event.isComposing===true)return true;
   // Some engines deliver the committed string after compositionend. Admit
   // only its exact final data once, before observer confirmation, never a new
   // free insertText while the old scope temporarily remains PM-editable.
   if(phase==='finishing'&&!finalInputSeen&&event.inputType==='insertText'&&finalData!==null&&finalData!==''&&event.data===finalData){
    if(event.type==='input')finalInputSeen=true;return true;
   }
   return false;
  }
  if(event.type==='keydown'||event.type==='keyup'||event.type==='keypress'){
   return phase==='active'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&
    (event.isComposing===true||event.keyCode===229||event.key==='Process'||candidateKeys.has(event.key??''));
  }
  return false;
 };
 return {admit,pending:()=>phase!=='idle',confirmed:()=>{if(phase==='finishing'){phase='idle';target=null;finalData=null;finalInputSeen=false;}}};
}
