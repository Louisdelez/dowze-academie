import {useEffect,useId,useLayoutEffect,useMemo,useRef,useState,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import type {NotebookMediaScope} from './NotebookEditor';
import type {InkPoint,PaperCommand,PaperDocument,PaperObject,PaperPage} from '../lib/notebookDocument';
import {createPaperInkInput,type PaperInkContext} from '../lib/paperInkInput';
import {paperGuideClientToPage,samePaperGuideContext} from '../lib/paperDrawingGuide';
import {describePaperMeasurementObject} from '../lib/paperMeasurementObject';
import {createPaperMeasurementCalibration,paperMeasurementArea,paperMeasurementLength,type PaperMeasurementUnit,type PaperMeasurementValue,type PaperPhysicalMeasurementUnit} from '../lib/paperMeasurement';
import './paper-measurement-controls.css';

export interface PaperMeasurementControlsProps {
 media:NotebookMediaScope;ownerKey:string;generation:string|number;document:PaperDocument;page:PaperPage;
 current:()=>boolean;getCurrent:()=>PaperDocument|null;
 /** The caller must revalidate this guard after flushing its active editor. */
 onCommit:(command:PaperCommand,valid?:()=>boolean)=>boolean;onNotice:(message:string)=>void;
 surfaceRef?:RefObject<SVGSVGElement|null>;getContext:()=>PaperInkContext|null;disabled?:boolean;onClose?:()=>void;
}
type Mode='calibration'|'length'|'area';
interface Draft {id:number;epoch:number;mode:Mode;baseline:PaperDocument;context:PaperInkContext|null;points:InkPoint[];unit:PaperMeasurementUnit}
const MAX_POINTS=128,units:readonly PaperMeasurementUnit[]=['page','mm','cm','m','in','ft'];
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const calibrationKey=(page:PaperPage)=>JSON.stringify(page.calibration??null);
const format=(result:PaperMeasurementValue)=>`${result.value.toLocaleString('fr-CH',{maximumSignificantDigits:8})} ${result.unit==='page'?'u. page':result.unit}${result.power===2?'²':''}`;
const time=()=>{const value=performance.now();return finite(value)&&value>=0?value:0;};

/** Discrete page points, not a freehand sensor stream. No screen DPI or zoom is
 * stored, and every displayed result is recalculated from canonical geometry. */
export function PaperMeasurementControls(props:PaperMeasurementControlsProps){
 const {document:documentValue,page,disabled=false,onClose}=props,id=useId();
 const latest=useRef(props);latest.current=props;
 const authority=useRef({key:'',epoch:0,api:props.media.api,document:documentValue});
 const key=JSON.stringify([props.ownerKey,props.generation,props.media.accountId,props.media.spaceId,documentValue.noteId,documentValue.revision,page.id,page.width,page.height,page.rotation,calibrationKey(page),disabled]);
 if(authority.current.key!==key||authority.current.api!==props.media.api||authority.current.document!==documentValue)authority.current={key,epoch:authority.current.epoch+1,api:props.media.api,document:documentValue};
 const epoch=authority.current.epoch,mounted=useRef(false),draftRef=useRef<Draft|null>(null),sequence=useRef(0);
 const scope=JSON.stringify([props.ownerKey,props.media.accountId,props.media.spaceId,documentValue.noteId,page.id]),fieldScope=useRef(scope);
 const [draft,setDraft]=useState<Draft|null>(null),[unit,setUnit]=useState<PaperMeasurementUnit>('page'),[referenceLength,setReferenceLength]=useState(''),[referenceUnit,setReferenceUnit]=useState<PaperPhysicalMeasurementUnit>('mm'),[x,setX]=useState(''),[y,setY]=useState(''),[notice,setNotice]=useState(''),[surface,setSurface]=useState<SVGSVGElement|null>(null);
 const fields=useRef({referenceLength,referenceUnit,x,y});fields.current={referenceLength,referenceUnit,x,y};
 const input=useRef(createPaperInkInput()),held=useRef<{pointerId:number;pointerType:string;draftId:number;surface:SVGSVGElement;clientX:number;clientY:number}|null>(null),touches=useRef(new Set<number>()),lastPen=useRef(-Infinity);
 const captureRelease=()=>{const contact=held.current;held.current=null;input.current.cancel();if(contact)try{contact.surface.releasePointerCapture(contact.pointerId);}catch{}};
 const owned=(captured:number)=>mounted.current&&authority.current.epoch===captured;
 const readable=(captured:number):PaperDocument|null=>{
  const value=latest.current;if(!owned(captured)||value.disabled||!value.current()||authority.current.api!==value.media.api)return null;
  const doc=value.getCurrent();if(!doc||doc!==value.document||doc.noteId!==value.document.noteId||doc.revision!==value.document.revision)return null;
  const target=doc.pages.find(candidate=>candidate.id===value.page.id);
  return target&&target.width===value.page.width&&target.height===value.page.height&&target.rotation===value.page.rotation&&calibrationKey(target)===calibrationKey(value.page)?doc:null;
 };
 const context=():PaperInkContext|null=>{
  const value=latest.current,target=value.getContext();if(!target)return null;
  if(target.ownershipKey!==value.ownerKey||target.generation!==value.generation||target.pageId!==value.page.id||target.pageWidth!==value.page.width||target.pageHeight!==value.page.height||(target.pageRotation??0)!==value.page.rotation)throw Error('Le repère de la page a changé. Recommencez la mesure.');
  const matrix=paperGuideClientToPage(target),det=matrix.a*matrix.d-matrix.b*matrix.c;
  if(!finite(det)||Math.abs(det)<1e-12)throw Error('Le repère de la page ne permet pas cette mesure.');
  return {...target,clientRect:{...target.clientRect},...(target.clientToPage?{clientToPage:{...target.clientToPage}}:{})};
 };
 const valid=(captured:Draft)=>{
  if(draftRef.current?.id!==captured.id||readable(captured.epoch)!==captured.baseline)return false;
  try{const now=context();return !!now===!!captured.context&&(!now||!captured.context||samePaperGuideContext(captured.context,now));}catch{return false;}
 };
 const cancel=(message='')=>{captureRelease();draftRef.current=null;setDraft(null);setNotice(message);};
 const report=(message:string,captured=epoch)=>{if(!owned(captured))return;setNotice(message);latest.current.onNotice(message);};
 const revoke=()=>cancel('Mesure annulée : la page ou son repère a changé.');
 useLayoutEffect(()=>{mounted.current=true;return()=>{mounted.current=false;captureRelease();draftRef.current=null;touches.current.clear();};},[]);
 useLayoutEffect(()=>{if(draftRef.current&&draftRef.current.epoch!==epoch)revoke();},[epoch]);
 useLayoutEffect(()=>{if(fieldScope.current===scope)return;fieldScope.current=scope;setReferenceLength('');setReferenceUnit('mm');setX('');setY('');setUnit('page');setNotice('');},[scope]);
 useLayoutEffect(()=>{const next=props.surfaceRef?.current??null;if(next!==surface)setSurface(next);});
 useEffect(()=>{
  if(!draft)return;let frame=0,stopped=false;
  const check=()=>{if(stopped)return;const captured=draftRef.current;if(!captured||captured.id!==draft.id)return;if(!valid(captured)){revoke();return;}frame=requestAnimationFrame(check);};
  frame=requestAnimationFrame(check);return()=>{stopped=true;cancelAnimationFrame(frame);};
 },[draft?.id]);
 const begin=(mode:Mode)=>{
  const baseline=readable(epoch);if(!baseline)return;
  if(mode!=='calibration'&&unit!=='page'&&!page.calibration){report('Calibrez cette page avant de choisir une unité physique.');return;}
  try{const next:Draft={id:++sequence.current,epoch,mode,baseline,context:context(),points:[],unit};captureRelease();draftRef.current=next;setDraft(next);setNotice('');}catch(error){report(String(error instanceof Error?error.message:error));}
 };
 const append=(point:InkPoint)=>{
  const captured=draftRef.current;if(!captured)return;if(!valid(captured)){revoke();return;}
  if(![point.x,point.y,point.time].every(finite)||point.time<0||point.x<0||point.y<0||point.x>page.width||point.y>page.height){report('Choisissez un point fini à l’intérieur de la page.',captured.epoch);return;}
  const maximum=captured.mode==='calibration'?2:MAX_POINTS;if(captured.points.length>=maximum){report(`Cette mesure accepte au maximum ${maximum} points.`,captured.epoch);return;}
  const next={...captured,points:[...captured.points,{x:point.x,y:point.y,time:point.time}]};draftRef.current=next;setDraft(next);setNotice('');
 };
 const addKeyboard=()=>{
  if(!owned(epoch)||!draft||draftRef.current?.id!==draft.id)return;const values=fields.current;
  if(!values.x.trim()||!values.y.trim()||!finite(Number(values.x))||!finite(Number(values.y))){report('Indiquez X et Y en unités de page.');return;}
  append({x:Number(values.x),y:Number(values.y),time:time()});
 };
 const finish=()=>{
  const captured=draftRef.current;if(!owned(epoch)||!captured||captured.id!==draft?.id)return;if(!valid(captured)){revoke();return;}
  try{
   const currentPage=captured.baseline.pages.find(candidate=>candidate.id===page.id)!;let command:PaperCommand;
   if(captured.mode==='calibration'){
    if(captured.points.length!==2)throw Error('Choisissez les deux extrémités de la longueur connue.');
    const length=Number(fields.current.referenceLength);if(!fields.current.referenceLength.trim())throw Error('Indiquez la longueur connue.');
    const calibration=createPaperMeasurementCalibration(paperMeasurementLength(captured.points).value,length,fields.current.referenceUnit);command={type:'update-page',page:{...currentPage,calibration}};
   }else{
    if(captured.mode==='area')paperMeasurementArea(captured.points,currentPage.calibration,captured.unit);else paperMeasurementLength(captured.points,currentPage.calibration,captured.unit);
    const left=Math.min(...captured.points.map(point=>point.x)),top=Math.min(...captured.points.map(point=>point.y)),right=Math.max(...captured.points.map(point=>point.x)),bottom=Math.max(...captured.points.map(point=>point.y));
    const vertices=captured.mode==='area'&&captured.points[0].x===captured.points.at(-1)!.x&&captured.points[0].y===captured.points.at(-1)!.y?captured.points.slice(0,-1):captured.points;
    const canonical=captured.mode==='area'?[...vertices,{x:vertices[0].x,y:vertices[0].y,time:Math.max(time(),captured.points.at(-1)!.time)}]:vertices;
    const object:PaperObject={id:crypto.randomUUID(),pageId:page.id,kind:'ink',measurement:{schema:1,kind:captured.mode,unit:captured.unit},x:left,y:top,width:right-left,height:bottom-top,rotation:0,z:captured.baseline.objects.reduce((maximum,value)=>value.pageId===page.id?Math.max(maximum,value.z):maximum,0)+1,locked:false,createdAt:Date.now(),points:canonical.map(point=>({x:point.x-left,y:point.y-top,time:point.time})),color:'#2855ce',strokeWidth:2,pen:'pen'};
    command={type:'upsert-object',object};
   }
   if(!valid(captured)||!latest.current.onCommit(command,()=>valid(captured))){cancel('La mesure n’a pas été ajoutée : la note a changé.');return;}
   cancel(captured.mode==='calibration'?'Calibration appliquée à la page.':'Mesure ajoutée à la note.');
  }catch(error){report(String(error instanceof Error?error.message:error),captured.epoch);}
 };
 const resetCalibration=()=>{
  const baseline=readable(epoch);if(!baseline)return;const currentPage=baseline.pages.find(candidate=>candidate.id===page.id)!;if(!currentPage.calibration)return;
  captureRelease();draftRef.current=null;setDraft(null);const {calibration:_,...uncalibrated}=currentPage;
  if(latest.current.onCommit({type:'update-page',page:uncalibrated},()=>readable(epoch)===baseline)){setUnit('page');setNotice('Calibration retirée. Les tracés de mesure sont conservés.');}
 };
 const actions=useRef({down:(_event:globalThis.PointerEvent)=>{},move:(_event:globalThis.PointerEvent)=>{},up:(_event:globalThis.PointerEvent)=>{},cancel:(_event:globalThis.PointerEvent)=>{}});
 actions.current={
  down:event=>{
   if(event.pointerType==='pen'&&finite(event.timeStamp)&&event.timeStamp>=0)lastPen.current=Math.max(lastPen.current,event.timeStamp);
   if(event.pointerType==='touch')touches.current.add(event.pointerId);
   const captured=draftRef.current;if(!captured)return;if(!valid(captured)){revoke();return;}event.stopPropagation();
   if(event.pointerType==='touch'&&(touches.current.size>1||event.timeStamp-lastPen.current<800||event.width>28||event.height>28)){if(held.current?.pointerType==='touch')captureRelease();return;}
   let coordinates:PaperInkContext|null;try{coordinates=context();}catch{revoke();return;}if(!coordinates){revoke();return;}
   const result=input.current.begin(event,coordinates,{fingerInk:true,maxPoints:2});if(!result.accepted)return;
   const target=surface;if(!target){captureRelease();return;}event.preventDefault();event.stopPropagation();
   held.current={pointerId:event.pointerId,pointerType:event.pointerType,draftId:captured.id,surface:target,clientX:event.clientX,clientY:event.clientY};
   try{target.setPointerCapture(event.pointerId);}catch{captureRelease();}
  },
  move:event=>{
   const contact=held.current;if(!contact||contact.pointerId!==event.pointerId)return;const captured=draftRef.current;if(!captured||contact.draftId!==captured.id||!valid(captured)){revoke();return;}
   if(contact.pointerType==='touch'&&Math.hypot(event.clientX-contact.clientX,event.clientY-contact.clientY)>12){captureRelease();return;}event.stopPropagation();
  },
  up:event=>{
   touches.current.delete(event.pointerId);const contact=held.current;if(!contact||contact.pointerId!==event.pointerId)return;const captured=draftRef.current;
   event.preventDefault();event.stopPropagation();if(!captured||contact.draftId!==captured.id||!valid(captured)){revoke();return;}
   try{const coordinates=context();if(!coordinates){revoke();return;}const result=input.current.finish(event,coordinates),point=result.stroke?.points[0];captureRelease();if(result.accepted&&point)append(point);}catch{revoke();}
  },
  cancel:event=>{touches.current.delete(event.pointerId);if(held.current?.pointerId===event.pointerId)captureRelease();}
 };
 useLayoutEffect(()=>{
  if(!surface)return;let stopped=false;
  const down=(event:globalThis.PointerEvent)=>{if(!stopped)actions.current.down(event);},move=(event:globalThis.PointerEvent)=>{if(!stopped)actions.current.move(event);},up=(event:globalThis.PointerEvent)=>{if(!stopped)actions.current.up(event);},stop=(event:globalThis.PointerEvent)=>{if(!stopped)actions.current.cancel(event);};
  surface.addEventListener('pointerdown',down,true);surface.addEventListener('pointermove',move,true);surface.addEventListener('pointerup',up,true);surface.addEventListener('pointercancel',stop,true);surface.addEventListener('lostpointercapture',stop,true);
  const releaseTouch=(event:globalThis.PointerEvent)=>touches.current.delete(event.pointerId);window.addEventListener('pointerup',releaseTouch,true);window.addEventListener('pointercancel',releaseTouch,true);
  return()=>{stopped=true;captureRelease();touches.current.clear();surface.removeEventListener('pointerdown',down,true);surface.removeEventListener('pointermove',move,true);surface.removeEventListener('pointerup',up,true);surface.removeEventListener('pointercancel',stop,true);surface.removeEventListener('lostpointercapture',stop,true);window.removeEventListener('pointerup',releaseTouch,true);window.removeEventListener('pointercancel',releaseTouch,true);};
 },[surface]);
 let preview='';if(draft&&draft.mode!=='calibration'&&draft.points.length>=(draft.mode==='area'?3:2))try{preview=format(draft.mode==='area'?paperMeasurementArea(draft.points,page.calibration,draft.unit):paperMeasurementLength(draft.points,page.calibration,draft.unit));}catch(error){preview=String(error instanceof Error?error.message:error);}
 const saved=useMemo(()=>documentValue.objects.filter(object=>object.pageId===page.id&&object.measurement&&object.points).map(object=>{const description=describePaperMeasurementObject(object,page);return {id:object.id,label:object.measurement!.kind==='area'?'Surface':'Longueur',value:description?.label??'Mesure invalide'};}),[documentValue,page]);
 return <section className="paper-measurement-controls" aria-label="Mesures" onKeyDown={event=>{if(event.key==='Escape'&&owned(epoch)&&draftRef.current){event.preventDefault();event.stopPropagation();cancel();}}}>
  <header><strong>Mesures</strong>{onClose&&<button type="button" aria-label="Fermer les mesures" onClick={()=>{if(owned(epoch)){cancel();onClose();}}}>×</button>}</header>
  <p id={`${id}-help`}>Choisissez les points sur la page, puis terminez. Vous pouvez aussi saisir leurs coordonnées en unités de page. Une longueur réelle connue calibre cette page.</p>
  <fieldset disabled={disabled} aria-describedby={`${id}-help`}><legend>Choisir une mesure</legend>
   <div className="paper-measurement-actions"><button type="button" aria-pressed={draft?.mode==='calibration'} onClick={()=>begin('calibration')}>Calibrer la page</button><button type="button" aria-pressed={draft?.mode==='length'} onClick={()=>begin('length')}>Mesurer une longueur</button><button type="button" aria-pressed={draft?.mode==='area'} onClick={()=>begin('area')}>Mesurer une surface</button></div>
   <label>Unité de mesure<select aria-label="Unité de mesure" value={unit} onChange={event=>{if(!owned(epoch))return;const selected=event.target.value as PaperMeasurementUnit;if(!units.includes(selected))return;setUnit(selected);const captured=draftRef.current;if(captured&&captured.mode!=='calibration'){const next={...captured,unit:selected};draftRef.current=next;setDraft(next);}}}>{units.map(value=><option key={value} value={value} disabled={value!=='page'&&!page.calibration}>{value==='page'?'Unités de page':value}</option>)}</select></label>
   <div className="paper-measurement-reference"><label>Longueur connue<input type="number" aria-label="Longueur connue" min="0" step="any" value={referenceLength} onChange={event=>{if(owned(epoch))setReferenceLength(event.target.value);}}/></label><label>Unité de référence<select aria-label="Unité de référence" value={referenceUnit} onChange={event=>{if(owned(epoch)&&units.includes(event.target.value as PaperMeasurementUnit)&&event.target.value!=='page')setReferenceUnit(event.target.value as PaperPhysicalMeasurementUnit);}}>{units.filter(value=>value!=='page').map(value=><option key={value} value={value}>{value}</option>)}</select></label></div>
   <button type="button" disabled={!page.calibration} onClick={resetCalibration}>Réinitialiser la calibration</button>
   {draft&&<div className="paper-measurement-draft"><p role="status">{draft.mode==='calibration'?'Référence : deux extrémités':draft.mode==='area'?'Surface : au moins trois sommets':'Longueur : au moins deux points'} · {draft.points.length} / {draft.mode==='calibration'?2:MAX_POINTS} points</p><div className="paper-measurement-coordinates"><label>X<input type="number" aria-label="Coordonnée X du point" step="any" value={x} onChange={event=>{if(owned(epoch)&&draftRef.current?.id===draft.id)setX(event.target.value);}}/></label><label>Y<input type="number" aria-label="Coordonnée Y du point" step="any" value={y} onChange={event=>{if(owned(epoch)&&draftRef.current?.id===draft.id)setY(event.target.value);}}/></label><button type="button" onClick={addKeyboard}>Ajouter le point</button></div>{preview&&<output aria-label="Mesure provisoire">{preview}</output>}<div className="paper-measurement-actions"><button type="button" onClick={finish}>Terminer</button><button type="button" onClick={()=>{if(owned(epoch)&&draftRef.current?.id===draft.id)cancel();}}>Annuler</button></div></div>}
  </fieldset>
  {!page.calibration&&<p>Sans calibration, les mesures restent en unités de page.</p>}
  {saved.length>0&&<ul aria-label="Mesures de la page">{saved.map(value=><li key={value.id}><span>{value.label}</span><output>{value.value}</output></li>)}</ul>}
  <p className="paper-measurement-notice" role="status">{notice}</p>
  {surface&&draft&&createPortal(<g className="paper-measurement-preview" pointerEvents="none" aria-hidden="true">{draft.mode==='area'?<polygon points={draft.points.map(point=>`${point.x},${point.y}`).join(' ')}/>:<polyline points={draft.points.map(point=>`${point.x},${point.y}`).join(' ')}/>} {draft.points.map((point,index)=><circle key={index} cx={point.x} cy={point.y} r={4} vectorEffect="non-scaling-stroke"/>)}</g>,surface)}
 </section>;
}
