/** View-only tool ordering. Persistence remains the existing scoped preference
 * writer's responsibility; this module never reads storage or edits a note. */
export type PaperToolReorderTarget='global'|'note';
export const MAX_PAPER_TOOL_REORDER_ITEMS=64;
export interface PaperToolReorderView {source:object;target:PaperToolReorderTarget;ids:readonly string[];disabled?:boolean}
export interface PaperToolReorderSession {
 readonly source:object;readonly target:PaperToolReorderTarget;readonly id:string;readonly original:readonly string[];
 order:()=>readonly string[];index:()=>number;current:()=>boolean;pending:()=>boolean;
 preview:(index:number)=>readonly string[]|null;cancel:()=>void;commit:()=>Promise<boolean>;
}
const same=(left:readonly string[],right:readonly string[])=>left.length===right.length&&left.every((id,index)=>id===right[index]);
function copyIds(ids:readonly string[]):readonly string[]{
 if(!Array.isArray(ids)||ids.length>MAX_PAPER_TOOL_REORDER_ITEMS||ids.some(id=>typeof id!=='string'||!id.length||id.length>127)||new Set(ids).size!==ids.length)throw Error('Chaque outil doit conserver une identité unique.');
 return Object.freeze([...ids]);
}
/** Each gesture captures exact source, target and original IDs. Once a source,
 * order or permission is retired, this gesture can never reactivate on ABA.
 * A publisher already admitted is still awaited; cancel never aborts its write. */
export function createPaperToolReorderSession(input:{source:object;target:PaperToolReorderTarget;ids:readonly string[];id:string;view:()=>PaperToolReorderView;current:()=>boolean;onReorder:(ids:readonly string[],target:PaperToolReorderTarget)=>Promise<boolean>}):PaperToolReorderSession{
 const {source,target,id,current:ownerCurrent,view,onReorder}=input,original=copyIds(input.ids);
 if(!original.includes(id)||target!=='global'&&target!=='note')throw Error('Choisissez un outil et la portée de son réglage.');
 let order=original,retired=false,started=false,settled=false,work:Promise<boolean>|null=null;
 const current=()=>{
  if(retired)return false;
  try{const latest=view();if(latest.source!==source||latest.target!==target||ownerCurrent()!==true||!started&&(latest.disabled||!same(original,latest.ids)))retired=true;}catch{retired=true;}
  return !retired;
 };
 const cancel=()=>{retired=true;};
 const preview=(index:number)=>{
  if(started||!current()||!Number.isSafeInteger(index)||index<0||index>=original.length)return null;
  const next=[...order],from=next.indexOf(id);next.splice(from,1);next.splice(index,0,id);order=Object.freeze(next);return order;
 };
 const commit=()=>{
  if(work)return work;
  if(!current())return Promise.resolve(false);
  if(same(order,original)){retired=true;return Promise.resolve(true);}
  // Install the single Promise BEFORE calling the publisher: even a reentrant
  // click/commit cannot admit a second preference command.
  let resolve!:(value:boolean)=>void,reject!:(error:unknown)=>void;
  work=new Promise<boolean>((yes,no)=>{resolve=yes;reject=no;});started=true;
  try{Promise.resolve(onReorder(order,target)).then(value=>{settled=true;resolve(value===true);},error=>{settled=true;reject(error);});}
  catch(error){settled=true;reject(error);}
  return work;
 };
 return {source,target,id,original,order:()=>order,index:()=>order.indexOf(id),current,pending:()=>started&&!settled,preview,cancel,commit};
}
export interface PaperToolReorderRow {id:string;top:number;bottom:number}
/** Exact ordered row geometry only; invalid or overlapping measurements refuse. */
export function paperToolReorderIndex(ids:readonly string[],rows:readonly PaperToolReorderRow[],clientY:number):number|null{
 if(!ids.length||ids.length>MAX_PAPER_TOOL_REORDER_ITEMS||rows.length!==ids.length||!Number.isFinite(clientY))return null;
 for(let index=0;index<rows.length;index++){const row=rows[index];if(row.id!==ids[index]||!Number.isFinite(row.top)||!Number.isFinite(row.bottom)||row.bottom<=row.top||index>0&&row.top<rows[index-1].bottom-.5)return null;}
 for(let index=0;index<rows.length;index++)if(clientY<(rows[index].top+rows[index].bottom)/2)return index;
 return rows.length-1;
}
