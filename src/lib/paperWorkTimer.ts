export type PaperWorkTimerStatus = 'idle' | 'running' | 'paused' | 'complete';
export interface PaperWorkTimerForeground {visible:boolean;focused:boolean}
export interface PaperWorkTimerCheckpoint {
 schema:1;targetMinutes:number;activeMs:number;status:PaperWorkTimerStatus;
}
export interface PaperWorkTimerSnapshot {
 status:PaperWorkTimerStatus;targetMinutes:number;activeMs:number;remainingMs:number;counting:boolean;
}
export interface PaperWorkTimer {
 start:()=>PaperWorkTimerSnapshot;pause:()=>PaperWorkTimerSnapshot;resume:()=>PaperWorkTimerSnapshot;
 reset:(targetMinutes?:number)=>PaperWorkTimerSnapshot;sample:()=>PaperWorkTimerSnapshot;
 activity:()=>PaperWorkTimerSnapshot;setForeground:(foreground:PaperWorkTimerForeground)=>PaperWorkTimerSnapshot;
 snapshot:()=>PaperWorkTimerSnapshot;checkpoint:()=>PaperWorkTimerCheckpoint;
}
export const PAPER_WORK_TIMER_DEFAULT_MINUTES=25;
export const PAPER_WORK_TIMER_MAX_MINUTES=720;
// Match the inactivity and interrupted-sample bounds of slimeProgress.activeMinuteEligible.
// Short samples measure work in milliseconds; the XP minute cadence is deliberately not reused.
export const PAPER_WORK_TIMER_IDLE_MS=120000;
export const PAPER_WORK_TIMER_MAX_SAMPLE_GAP_MS=90000;
const targetValid=(value:unknown):value is number=>Number.isSafeInteger(value)&&Number(value)>=1&&Number(value)<=PAPER_WORK_TIMER_MAX_MINUTES;
const statusValid=(value:unknown):value is PaperWorkTimerStatus=>value==='idle'||value==='running'||value==='paused'||value==='complete';
/** Durations only: no previous activity, clock baseline or wall-clock timestamp can be restored. */
export function isPaperWorkTimerCheckpoint(value:unknown):value is PaperWorkTimerCheckpoint {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const item=value as PaperWorkTimerCheckpoint;
 if(Object.keys(value).some(key=>!['schema','targetMinutes','activeMs','status'].includes(key))||item.schema!==1||!targetValid(item.targetMinutes)||!statusValid(item.status)||!Number.isFinite(item.activeMs)||item.activeMs<0||item.activeMs>item.targetMinutes*60000)return false;
 return item.status==='complete'?item.activeMs===item.targetMinutes*60000:item.activeMs<item.targetMinutes*60000&&(item.status!=='idle'||item.activeMs===0);
}
const validClock=(value:number)=>Number.isFinite(value)&&value>=0&&value<=Number.MAX_SAFE_INTEGER;
/**
 * The host supplies a monotonic millisecond clock, actual Dowze activity and current
 * visibility/focus. Polling, saving, audio playback and network events are not activity.
 * Start/resume represent a deliberate timer action. Hidden/unfocused transitions drop
 * the unobserved interval and require new activity after returning to the foreground.
 * This engine grants no XP and runs no timers. A restored running timer is paused.
 */
export function createPaperWorkTimer(options:{clock:()=>number;targetMinutes?:number;foreground?:PaperWorkTimerForeground;restored?:PaperWorkTimerCheckpoint}):PaperWorkTimer {
 if(options.restored!==undefined&&!isPaperWorkTimerCheckpoint(options.restored))throw Error('Le minuteur conservé est incompatible.');
 let targetMinutes=options.targetMinutes??options.restored?.targetMinutes??PAPER_WORK_TIMER_DEFAULT_MINUTES;
 if(!targetValid(targetMinutes))throw Error('Choisissez un objectif entier de 1 à 720 minutes.');
 if(options.restored&&options.targetMinutes!==undefined&&options.targetMinutes!==options.restored.targetMinutes)throw Error('Réinitialisez le minuteur avant de changer son objectif conservé.');
 let activeMs=options.restored?.activeMs??0,status:PaperWorkTimerStatus=options.restored?.status??'idle';
 if(status==='running')status='paused';
 let foreground:PaperWorkTimerForeground={visible:options.foreground?.visible===true,focused:options.foreground?.focused===true};
 let lastSample:number|null=null,lastActivity:number|null=null,clockFloor:number|null=null;
 const foregroundActive=()=>foreground.visible&&foreground.focused;
 const clearObservation=()=>{lastSample=null;lastActivity=null;};
 const now=():number|null=>{
  const value=options.clock();
  if(!validClock(value)||clockFloor!==null&&value<clockFloor){clearObservation();return null;}
  clockFloor=value;return value;
 };
 const snapshot=():PaperWorkTimerSnapshot=>({status,targetMinutes,activeMs,remainingMs:Math.max(0,targetMinutes*60000-activeMs),counting:status==='running'&&foregroundActive()&&lastSample!==null&&lastActivity!==null&&lastSample-lastActivity<PAPER_WORK_TIMER_IDLE_MS});
 const observe=(value:number)=>{
  const previous=lastSample;lastSample=value;
  if(previous===null)return;
  const delta=value-previous;
  // A suspended page, sleeping device or jumped clock cannot reconstruct active work.
  if(delta>=PAPER_WORK_TIMER_MAX_SAMPLE_GAP_MS){lastActivity=null;return;}
  if(status!=='running'||!foregroundActive()||lastActivity===null)return;
  const untilIdle=Math.max(0,PAPER_WORK_TIMER_IDLE_MS-(previous-lastActivity));
  activeMs=Math.min(targetMinutes*60000,activeMs+Math.min(delta,untilIdle));
  if(activeMs===targetMinutes*60000){status='complete';clearObservation();}
 };
 const sample=()=>{const value=now();if(value!==null)observe(value);return snapshot();};
 const begin=()=>{
  const value=now();status='running';clearObservation();
  if(value!==null){lastSample=value;if(foregroundActive())lastActivity=value;}
  return snapshot();
 };
 return {
  start:()=>status==='idle'?begin():snapshot(),
  pause:()=>{if(status==='running'){sample();if(status==='running')status='paused';clearObservation();}return snapshot();},
  resume:()=>status==='paused'?begin():snapshot(),
  reset:(minutes=targetMinutes)=>{if(!targetValid(minutes))throw Error('Choisissez un objectif entier de 1 à 720 minutes.');targetMinutes=minutes;activeMs=0;status='idle';clearObservation();return snapshot();},
  sample,
  activity:()=>{const value=now();if(value!==null){observe(value);if(status==='running'&&foregroundActive())lastActivity=value;}return snapshot();},
  setForeground:(next)=>{
   const updated={visible:next.visible===true,focused:next.focused===true};
   if(updated.visible!==foreground.visible||updated.focused!==foreground.focused){foreground=updated;clearObservation();const value=now();if(value!==null)lastSample=value;}
   return snapshot();
  },
  snapshot,
  checkpoint:()=>({schema:1,targetMinutes,activeMs,status})
 };
}
