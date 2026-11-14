import {updateAudioRecordingLease,type AudioRecordingScope,type AudioRecordingLease} from '../../pwa/src/storage';

export interface RecordingLeaseHandle {token:AudioRecordingLease;current:()=>boolean;release:()=>Promise<void>}
export async function acquireRecordingLease(scope:AudioRecordingScope,onLost:()=>void):Promise<RecordingLeaseHandle|null>{
 const token=await updateAudioRecordingLease(scope,crypto.randomUUID(),'claim');if(!token)return null;
 let valid=true,released=false,tail=Promise.resolve();
 const lost=()=>{if(!valid)return;valid=false;clearInterval(timer);onLost();};
 const timer=setInterval(()=>{tail=tail.then(async()=>{if(released)return;const next=await updateAudioRecordingLease(scope,token.owner,'renew');if(!next){lost();return;}token.expiresAt=next.expiresAt;}).catch(lost);},10000);
 return {token,current:()=>valid&&!released&&token.expiresAt>Date.now(),release:async()=>{if(released)return;released=true;valid=false;clearInterval(timer);await tail;await updateAudioRecordingLease(scope,token.owner,'release');}};
}
