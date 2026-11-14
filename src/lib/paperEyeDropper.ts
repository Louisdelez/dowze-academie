/** Browser API contract: https://wicg.github.io/eyedropper-api/ . Keep open()
 * synchronous with its user's click: no import, storage read or await first. */
export interface PaperEyeDropper {open(options?:{signal?:AbortSignal}):Promise<{sRGBHex:string}>}
interface EyeDropperHost {isSecureContext?:boolean;EyeDropper?:new()=>PaperEyeDropper}
export type PaperEyeDropperResult={status:'picked';color:string}|{status:'cancelled'|'unavailable'|'failed'};
const browser=():EyeDropperHost|undefined=>typeof window==='undefined'?undefined:window as unknown as EyeDropperHost;
export const paperEyeDropperAvailable=(host:EyeDropperHost|undefined=browser()):boolean=>host?.isSecureContext===true&&typeof host.EyeDropper==='function';
/** Returns a draft color only. Persistence is always a separate explicit action.
 * A revoked owner refuses before constructing or opening any browser UI. */
export async function pickPaperEyeDropperColor(current:()=>boolean,signal:AbortSignal,host:EyeDropperHost|undefined=browser()):Promise<PaperEyeDropperResult>{
 const admitted=()=>{try{return !signal.aborted&&current()===true;}catch{return false;}};
 try{
  if(!admitted())return {status:'cancelled'};
  if(!paperEyeDropperAvailable(host))return {status:'unavailable'};
  const Constructor=host!.EyeDropper!,picker=new Constructor();
  if(!admitted())return {status:'cancelled'};
  const result=await picker.open({signal});
  if(!admitted())return {status:'cancelled'};
  if(!result||typeof result.sRGBHex!=='string'||!/^#[0-9a-f]{6}$/i.test(result.sRGBHex))return {status:'failed'};
  return {status:'picked',color:result.sRGBHex.toLowerCase()};
 }catch(error){
  if(!admitted()||error&&typeof error==='object'&&'name'in error&&error.name==='AbortError')return {status:'cancelled'};
  return {status:'failed'};
 }
}
