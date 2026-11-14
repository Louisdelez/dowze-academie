/** Event-driven speech ownership, independent of the browser and persistence.
 * One utterance is submitted at a time. All app readers share the engine key;
 * a reader never cancels another reader or an already-busy external engine. */
export interface PaperReadAloudVoice {readonly id:string;readonly name:string;readonly lang:string;readonly localService:boolean;readonly default:boolean}
export interface PaperReadAloudUtterance {dispose:()=>void}
export interface PaperReadAloudEngine {
 readonly identity:object;
 voices:()=>readonly PaperReadAloudVoice[];
 state:()=>{speaking:boolean;pending:boolean;paused:boolean};
 create:(text:string,options:{voiceId:string;lang:string;rate:number},events:{start:()=>void;end:()=>void;error:(code:string)=>void})=>PaperReadAloudUtterance;
 speak:(utterance:PaperReadAloudUtterance)=>void;cancel:()=>void;pause:()=>void;resume:()=>void;
 subscribeVoices?:(listener:()=>void)=>()=>void;
}
export type PaperReadAloudStatus='idle'|'starting'|'speaking'|'paused'|'completed'|'stopped'|'error';
export interface PaperReadAloudSnapshot {readonly status:PaperReadAloudStatus;readonly completedChunks:number;readonly totalChunks:number;readonly message:string}
export interface PaperReadAloudAdmission {readonly source:object;readonly current:()=>boolean;readonly chunks:readonly string[];readonly voiceId:string;readonly lang:string;readonly rate:number}
export const MAX_PAPER_READ_ALOUD_CHUNK=500,MAX_PAPER_READ_ALOUD_CHUNKS=256,MAX_PAPER_READ_ALOUD_TEXT=100_000;
interface Ticket {readonly owner:object;readonly current:()=>boolean;readonly source:object;readonly chunks:readonly string[];readonly voiceId:string;readonly lang:string;readonly rate:number;revoked:boolean;cursor:number;utterance:PaperReadAloudUtterance|null;paused:boolean}
const owners=new WeakMap<object,Ticket>();
const errors:Record<string,string>={network:'Le service vocal ne répond pas. Le texte de la note est conservé.','not-allowed':'Le navigateur a refusé la lecture vocale. Relance-la volontairement depuis ce bouton.','voice-unavailable':'Cette voix n’est plus disponible sur cet appareil.','language-unavailable':'Aucune voix ne peut lire cette langue.','audio-busy':'La sortie audio est occupée.','audio-hardware':'La sortie audio est indisponible.','synthesis-unavailable':'Le moteur vocal est indisponible.','synthesis-failed':'Le moteur vocal n’a pas pu terminer la lecture.','text-too-long':'Le moteur vocal refuse cette longueur de texte.',canceled:'La lecture a été annulée.',interrupted:'La lecture a été interrompue.'};
export function createPaperReadAloudController(engine:PaperReadAloudEngine|null,onState?:(state:PaperReadAloudSnapshot)=>void){
 const owner=Object.freeze({}),revokedSources=new WeakSet<object>();let disposed=false,active:Ticket|null=null,state:PaperReadAloudSnapshot=Object.freeze({status:'idle',completedChunks:0,totalChunks:0,message:''});
 const publish=(status:PaperReadAloudStatus,message='',ticket:Ticket|null=active)=>{state=Object.freeze({status,message,completedChunks:ticket?.cursor??0,totalChunks:ticket?.chunks.length??0});onState?.(state);};
 const retire=(ticket:Ticket,status:PaperReadAloudStatus,message:string)=>{
  if(ticket.revoked)return false;ticket.revoked=true;const owns=!!engine&&owners.get(engine.identity)===ticket;
  // Revoke before disposing/canceling: native cancellation can synchronously
  // dispatch end/error, and the UI callback may reenter another controller.
  ticket.utterance?.dispose();ticket.utterance=null;if(active===ticket)active=null;
  let failure=false;
  if(owns&&engine){try{engine.cancel();if(ticket.paused&&owners.get(engine.identity)===ticket)engine.resume();}catch{failure=true;}finally{if(owners.get(engine.identity)===ticket)owners.delete(engine.identity);}}
  if(!disposed)publish(failure?'error':status,failure?'Le moteur vocal n’a pas confirmé son arrêt. Le texte reste conservé.':message,ticket);return true;
 };
 const allowed=(ticket:Ticket)=>{
  if(disposed||ticket.revoked||active!==ticket||!engine||owners.get(engine.identity)!==ticket)return false;
  let valid=false;try{valid=ticket.current();}catch{}
  if(!valid){revokedSources.add(ticket.source);retire(ticket,'stopped','La source a changé ; la lecture est arrêtée.');return false;}return true;
 };
 const next=(ticket:Ticket)=>{
  if(!engine||!allowed(ticket))return;
  if(ticket.cursor===ticket.chunks.length){ticket.revoked=true;active=null;if(owners.get(engine.identity)===ticket)owners.delete(engine.identity);publish('completed','Lecture terminée.',ticket);return;}
  const cursor=ticket.cursor;let utterance:PaperReadAloudUtterance;
  try{
   utterance=engine.create(ticket.chunks[cursor],ticket,{
    start:()=>{if(allowed(ticket)&&ticket.cursor===cursor&&ticket.utterance===utterance&&!ticket.paused)publish('speaking','',ticket);},
    end:()=>{if(!allowed(ticket)||ticket.cursor!==cursor||ticket.utterance!==utterance)return;utterance.dispose();ticket.utterance=null;ticket.cursor++;publish(ticket.paused?'paused':'starting','',ticket);if(allowed(ticket)&&!ticket.paused)next(ticket);},
    error:code=>{if(allowed(ticket)&&ticket.cursor===cursor&&ticket.utterance===utterance)retire(ticket,'error',Object.hasOwn(errors,code)?errors[code]:'Le moteur vocal a interrompu la lecture. Le texte de la note est conservé.');}
   });
   if(!allowed(ticket)){utterance.dispose();return;}ticket.utterance=utterance;engine.speak(utterance);
  }catch{if(!ticket.revoked)retire(ticket,'error','Le moteur vocal n’a pas pu démarrer. Le texte de la note est conservé.');}
 };
 return {
  snapshot:()=>state,
  start:(input:PaperReadAloudAdmission)=>{
   // Authorization is checked before touching the global engine. In particular
   // an old callback cannot stop a new reader, enumerate voices or bind an API.
   if(disposed||!input.source||typeof input.source!=='object'||revokedSources.has(input.source))return false;let current=false;try{current=input.current();}catch{}if(!current){revokedSources.add(input.source);return false;}
   if(!engine){publish('error','Lecture vocale indisponible dans ce navigateur.');return false;}
   const chunks=Array.from(input.chunks);if(!chunks.length||chunks.length>MAX_PAPER_READ_ALOUD_CHUNKS||chunks.some(chunk=>typeof chunk!=='string'||!chunk.trim()||chunk.length>MAX_PAPER_READ_ALOUD_CHUNK)||chunks.reduce((sum,chunk)=>sum+chunk.length,0)>MAX_PAPER_READ_ALOUD_TEXT||!input.source||!input.voiceId||input.voiceId.length>2000||!input.lang||input.lang.length>80||!Number.isFinite(input.rate)||input.rate<.5||input.rate>2){publish('error','Ce texte ou ces réglages dépassent la lecture prise en charge.');return false;}
   try{if(!engine.voices().some(voice=>voice.id===input.voiceId&&voice.lang===input.lang)){publish('error','Choisis une voix disponible pour cette langue.');return false;}}catch{publish('error','Les voix de cet appareil ne sont pas disponibles.');return false;}
   if(active)retire(active,'stopped','');if(disposed)return false;
   try{if(owners.has(engine.identity)||engine.state().speaking||engine.state().pending||engine.state().paused){publish('error','Une autre lecture utilise déjà le moteur vocal. Arrête-la avant de lire cette page.');return false;}}catch{publish('error','Le moteur vocal est indisponible.');return false;}
   let stillCurrent=false;try{stillCurrent=input.current();}catch{}if(!stillCurrent){revokedSources.add(input.source);return false;}
   const ticket:Ticket={owner,source:input.source,current:input.current,chunks:Object.freeze(chunks),voiceId:input.voiceId,lang:input.lang,rate:input.rate,revoked:false,cursor:0,utterance:null,paused:false};active=ticket;owners.set(engine.identity,ticket);publish('starting','',ticket);if(allowed(ticket))next(ticket);return !ticket.revoked;
  },
  pause:()=>{const ticket=active;if(!ticket||!engine||!allowed(ticket)||ticket.paused)return false;ticket.paused=true;try{engine.pause();if(allowed(ticket))publish('paused','',ticket);return !ticket.revoked;}catch{retire(ticket,'error','Le moteur vocal n’a pas pu mettre la lecture en pause.');return false;}},
  resume:()=>{const ticket=active;if(!ticket||!engine||!allowed(ticket)||!ticket.paused)return false;ticket.paused=false;try{engine.resume();if(allowed(ticket)){publish('starting','',ticket);if(!ticket.utterance)next(ticket);}return !ticket.revoked;}catch{retire(ticket,'error','Le moteur vocal n’a pas pu reprendre la lecture.');return false;}},
  stop:(message='Lecture arrêtée.')=>active?retire(active,'stopped',message):false,
  verifyAuthority:()=>active?allowed(active):!disposed,
  dispose:()=>{if(disposed)return;disposed=true;const ticket=active;if(ticket)retire(ticket,'stopped','');}
 };
}

/** Optional browser adapter; constructing it never speaks or changes a queue.
 * A voice's localService is reported as supplied by the browser, not an offline
 * availability guarantee. Native voices are captured again at voluntary start. */
export function createBrowserPaperReadAloudEngine():PaperReadAloudEngine|null{
 if(typeof window==='undefined'||!window.speechSynthesis||typeof window.SpeechSynthesisUtterance!=='function')return null;
 const native=window.speechSynthesis,utterances=new WeakMap<PaperReadAloudUtterance,SpeechSynthesisUtterance>();
 const voices=()=>native.getVoices().slice(0,256).map((voice,index)=>({native:voice,value:Object.freeze({id:JSON.stringify([voice.voiceURI,voice.name,voice.lang,voice.localService,index]),name:voice.name,lang:voice.lang,localService:voice.localService,default:voice.default})}));
 return {identity:native,voices:()=>voices().map(voice=>voice.value),state:()=>({speaking:native.speaking,pending:native.pending,paused:native.paused}),
  create:(text,options,events)=>{const voice=voices().find(voice=>voice.value.id===options.voiceId&&voice.value.lang===options.lang);if(!voice)throw Error('Voice changed');const nativeUtterance=new window.SpeechSynthesisUtterance(text);nativeUtterance.voice=voice.native;nativeUtterance.lang=options.lang;nativeUtterance.rate=options.rate;nativeUtterance.onstart=events.start;nativeUtterance.onend=events.end;nativeUtterance.onerror=event=>events.error(event.error);const utterance={dispose:()=>{nativeUtterance.onstart=null;nativeUtterance.onend=null;nativeUtterance.onerror=null;}};utterances.set(utterance,nativeUtterance);return utterance;},
  speak:utterance=>{const value=utterances.get(utterance);if(!value)throw Error('Unknown utterance');native.speak(value);},cancel:()=>native.cancel(),pause:()=>native.pause(),resume:()=>native.resume(),subscribeVoices:listener=>{native.addEventListener('voiceschanged',listener);return ()=>native.removeEventListener('voiceschanged',listener);}
 };
}
