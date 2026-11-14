import type {InkPoint} from './notebookDocument.ts';
import type {PaperInkContext,PaperInkMatrix,PaperInkStroke} from './paperInkInput.ts';
import {isPaperMeasurementCalibration,type PaperMeasurementCalibration} from './paperMeasurement.ts';

export interface PaperDrawingGuideConfig {
 enabled:boolean;x:number;y:number;angle:number;space:'page'|'screen';
 /** A document calibration supplied by the user, never a screen DPI guess. */
 unit:'page'|'mm'|'in';pageUnitsPerMm?:number;snapDistancePx:number;
}
export interface PaperHoldCorrectionConfig {enabled:boolean;delayMs:number;movementTolerancePx:number;minLengthPx:number;recognizeShapes:boolean}
export interface PaperStrokeCorrectionOptions {guide:PaperDrawingGuideConfig;hold:PaperHoldCorrectionConfig}
export type PaperShapeKind='line'|'ellipse'|'polygon'|'arrow';
export interface PaperShapeCandidate {kind:PaperShapeKind;label:string;points:InkPoint[];vertices?:{x:number;y:number}[]}
export interface PaperStrokeCorrectionResult {
 points:InkPoint[];originalPoints:InkPoint[];correction:'none'|'guide'|'line'|'shape';
 held:boolean;cancelled:boolean;candidate:PaperShapeCandidate|null;
}
type XY={x:number;y:number};
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
const distance=(a:XY,b:XY)=>Math.hypot(a.x-b.x,a.y-b.y);
const copyPoints=(points:readonly InkPoint[])=>points.map(p=>({...p}));
const map=(matrix:PaperInkMatrix,p:XY):XY=>({x:matrix.a*p.x+matrix.c*p.y+matrix.e,y:matrix.b*p.x+matrix.d*p.y+matrix.f});
export const defaultPaperDrawingGuide=(width=794,height=1123):PaperDrawingGuideConfig=>({enabled:false,x:width/2,y:height/2,angle:0,space:'page',unit:'page',snapDistancePx:20});
export const defaultPaperHoldCorrection=():PaperHoldCorrectionConfig=>({enabled:false,delayMs:650,movementTolerancePx:3,minLengthPx:28,recognizeShapes:false});
export function normalizePaperDrawingGuide(value:Partial<PaperDrawingGuideConfig>,width=794,height=1123):PaperDrawingGuideConfig {
 const base=defaultPaperDrawingGuide(width,height),calibration=finite(value.pageUnitsPerMm)&&value.pageUnitsPerMm>0&&value.pageUnitsPerMm<=10000?value.pageUnitsPerMm:undefined;
 return {enabled:value.enabled===true,x:finite(value.x)?value.x:base.x,y:finite(value.y)?value.y:base.y,angle:finite(value.angle)?((value.angle%360)+360)%360:0,space:value.space==='screen'?'screen':'page',unit:calibration&&(value.unit==='mm'||value.unit==='in')?value.unit:'page',snapDistancePx:finite(value.snapDistancePx)?Math.max(2,Math.min(80,value.snapDistancePx)):20,...(calibration?{pageUnitsPerMm:calibration}:{})};
}
/** View units remain a preference when the current page has no calibration.
 * A legacy note ratio can survive in local history, but it is not a page scale. */
export function normalizePaperDrawingGuidePreference(value:Partial<PaperDrawingGuideConfig>,width=794,height=1123):PaperDrawingGuideConfig {
 return {...normalizePaperDrawingGuide(value,width,height),unit:value.unit==='mm'||value.unit==='in'?value.unit:'page'};
}
/** The current canonical page is the only physical scale used by this view.
 * Normalize geometry first, then inject the exact validated ratio, without the
 * legacy local preference limit or an automatic promotion of that old ratio. */
export function effectivePaperDrawingGuide(guide:Partial<PaperDrawingGuideConfig>,pageCalibration?:PaperMeasurementCalibration):PaperDrawingGuideConfig {
 const {pageUnitsPerMm:_,...view}=normalizePaperDrawingGuidePreference(guide);
 return isPaperMeasurementCalibration(pageCalibration)?{...view,pageUnitsPerMm:pageCalibration.pageUnitsPerMm}:{...view,unit:'page'};
}
export function normalizePaperHoldCorrection(value:Partial<PaperHoldCorrectionConfig>):PaperHoldCorrectionConfig {
 return {enabled:value.enabled===true,delayMs:finite(value.delayMs)?Math.max(250,Math.min(3000,value.delayMs)):650,movementTolerancePx:finite(value.movementTolerancePx)?Math.max(.5,Math.min(12,value.movementTolerancePx)):3,minLengthPx:finite(value.minLengthPx)?Math.max(15,Math.min(200,value.minLengthPx)):28,recognizeShapes:value.recognizeShapes===true};
}
/** The inverse CTM is authoritative, including zoom, rotation and reflection. */
export function paperGuideClientToPage(context:PaperInkContext):PaperInkMatrix {
 if(context.clientToPage){const m=context.clientToPage;if(![m.a,m.b,m.c,m.d,m.e,m.f].every(finite)||Math.abs(m.a*m.d-m.b*m.c)<1e-12)throw Error('Le repère de la règle est invalide.');return {...m};}
 const r=context.clientRect;if(![r.left,r.top,r.width,r.height,context.pageWidth,context.pageHeight].every(finite)||r.width<=0||r.height<=0||context.pageWidth<=0||context.pageHeight<=0)throw Error('La géométrie de la règle est invalide.');
 return {a:context.pageWidth/r.width,b:0,c:0,d:context.pageHeight/r.height,e:-r.left*context.pageWidth/r.width,f:-r.top*context.pageHeight/r.height};
}
export function paperGuidePageToClient(context:PaperInkContext):PaperInkMatrix {
 const m=paperGuideClientToPage(context),det=m.a*m.d-m.b*m.c;
 return {a:m.d/det,b:-m.b/det,c:-m.c/det,d:m.a/det,e:(m.c*m.f-m.d*m.e)/det,f:(m.b*m.e-m.a*m.f)/det};
}
export function paperGuideClientPoint(context:PaperInkContext,point:XY):XY{return map(paperGuideClientToPage(context),point);}
export function paperGuidePagePoint(context:PaperInkContext,point:XY):XY{return map(paperGuidePageToClient(context),point);}
export function paperGuideDirection(guide:PaperDrawingGuideConfig,context:PaperInkContext):XY {
 const a=guide.angle*Math.PI/180,unit={x:Math.cos(a),y:Math.sin(a)};
 if(guide.space==='page')return unit;const m=paperGuideClientToPage(context),x=m.a*unit.x+m.c*unit.y,y=m.b*unit.x+m.d*unit.y,len=Math.hypot(x,y);return {x:x/len,y:y/len};
}
export function paperGuideMeasuredAngles(guide:PaperDrawingGuideConfig,context:PaperInkContext):{page:number;screen:number} {
 const d=paperGuideDirection(guide,context),m=paperGuidePageToClient(context),x=m.a*d.x+m.c*d.y,y=m.b*d.x+m.d*d.y;
 const angle=(x:number,y:number)=>(Math.atan2(y,x)*180/Math.PI+360)%360;return {page:angle(d.x,d.y),screen:angle(x,y)};
}
/** Position changes only: pressure/tilt/twist/time/nibAngle remain exact. */
export function projectPaperGuidePoint(point:InkPoint,guide:PaperDrawingGuideConfig,context:PaperInkContext):InkPoint {
 const d=paperGuideDirection(guide,context),anchor={x:guide.x,y:guide.y};
 if(guide.space==='page'){const t=(point.x-anchor.x)*d.x+(point.y-anchor.y)*d.y;return {...point,x:anchor.x+d.x*t,y:anchor.y+d.y*t};}
 const p=paperGuidePagePoint(context,point),a=paperGuidePagePoint(context,anchor),r=guide.angle*Math.PI/180,u={x:Math.cos(r),y:Math.sin(r)},t=(p.x-a.x)*u.x+(p.y-a.y)*u.y;
 return {...point,...paperGuideClientPoint(context,{x:a.x+u.x*t,y:a.y+u.y*t})};
}
export function paperGuideDistancePx(point:InkPoint,guide:PaperDrawingGuideConfig,context:PaperInkContext):number{return distance(paperGuidePagePoint(context,point),paperGuidePagePoint(context,projectPaperGuidePoint(point,guide,context)));}
export function paperGuideLength(points:readonly XY[],guide:PaperDrawingGuideConfig):{value:number;unit:'u. page'|'mm'|'in'} {
 let length=0;for(let i=1;i<points.length;i++)length+=distance(points[i-1],points[i]);const calibrated=finite(guide.pageUnitsPerMm)&&guide.pageUnitsPerMm>0;
 return calibrated&&guide.unit!=='page'?{value:length/guide.pageUnitsPerMm!/(guide.unit==='in'?25.4:1),unit:guide.unit}:{value:length,unit:'u. page'};
}
/** Visible segment, in page coordinates. The SVG edge receives no pointer events. */
export function paperGuideSegment(guide:PaperDrawingGuideConfig,context:PaperInkContext):{start:XY;end:XY;direction:XY}|null {
 const d=paperGuideDirection(guide,context),hits:number[]=[];
 if(Math.abs(d.x)>1e-12)for(const x of [0,context.pageWidth]){const t=(x-guide.x)/d.x,y=guide.y+t*d.y;if(y>=-1e-7&&y<=context.pageHeight+1e-7)hits.push(t);}
 if(Math.abs(d.y)>1e-12)for(const y of [0,context.pageHeight]){const t=(y-guide.y)/d.y,x=guide.x+t*d.x;if(x>=-1e-7&&x<=context.pageWidth+1e-7)hits.push(t);}
 if(hits.length<2)return null;const lo=Math.min(...hits),hi=Math.max(...hits);return {start:{x:guide.x+d.x*lo,y:guide.y+d.y*lo},end:{x:guide.x+d.x*hi,y:guide.y+d.y*hi},direction:d};
}
function projectedLine(points:readonly InkPoint[]):InkPoint[] {
 const a=points[0],b=points.at(-1)!,dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy;
 return points.map(p=>{const t=len2?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/len2)):0;return {...p,x:a.x+t*dx,y:a.y+t*dy};});
}
function pathLength(points:readonly XY[]):number {let n=0;for(let i=1;i<points.length;i++)n+=distance(points[i-1],points[i]);return n;}
function segmentDistance(p:XY,a:XY,b:XY):number {const dx=b.x-a.x,dy=b.y-a.y,n=dx*dx+dy*dy,t=n?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/n)):0;return distance(p,{x:a.x+t*dx,y:a.y+t*dy});}
/** Deliberately conservative: a letter, a bend or a retraced stroke is refused. */
export function recognizePaperStraightStroke(points:readonly InkPoint[],context:PaperInkContext,minLengthPx=28):PaperShapeCandidate|null {
 if(points.length<4)return null;const screen=points.map(p=>paperGuidePagePoint(context,p)),a=screen[0],b=screen.at(-1)!,chord=distance(a,b),length=pathLength(screen);
 if(chord<minLengthPx||length/chord>1.065||screen.some(p=>segmentDistance(p,a,b)>Math.max(2.2,chord*.025)))return null;
 const dx=b.x-a.x,dy=b.y-a.y;let progress=-Infinity;
 for(const p of screen){const t=((p.x-a.x)*dx+(p.y-a.y)*dy)/chord;if(t<progress-2.5)return null;progress=Math.max(progress,t);}
 return {kind:'line',label:'Trait droit',points:projectedLine(points)};
}
function simplify(points:readonly XY[],epsilon:number):number[] {
 const keep=new Set([0,points.length-1]),stack=[[0,points.length-1]];
 while(stack.length){const [a,b]=stack.pop()!;let far=epsilon,index=-1;for(let i=a+1;i<b;i++){const d=segmentDistance(points[i],points[a],points[b]);if(d>far){far=d;index=i;}}if(index>=0){keep.add(index);stack.push([a,index],[index,b]);}}
 return [...keep].sort((a,b)=>a-b);
}
function projectToPolyline(points:readonly InkPoint[],vertices:readonly XY[]):InkPoint[] {
 return points.map(p=>{let best:XY=p,d=Infinity;for(let i=1;i<vertices.length;i++){const a=vertices[i-1],b=vertices[i],dx=b.x-a.x,dy=b.y-a.y,n=dx*dx+dy*dy,t=n?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/n)):0,q={x:a.x+t*dx,y:a.y+t*dy},next=distance(p,q);if(next<d){d=next;best=q;}}return {...p,...best};});
}
/** Shape proposals require a separate explicit acceptance. An O and a circle
 * cannot be distinguished reliably by one stroke, so this never auto-applies. */
export function recognizePaperShape(points:readonly InkPoint[],context:PaperInkContext):PaperShapeCandidate|null {
 const line=recognizePaperStraightStroke(points,context);if(line)return line;if(points.length<12||points.length>20000)return null;
 const screen=points.map(p=>paperGuidePagePoint(context,p)),xs=screen.map(p=>p.x),ys=screen.map(p=>p.y),left=Math.min(...xs),top=Math.min(...ys),width=Math.max(...xs)-left,height=Math.max(...ys)-top,diagonal=Math.hypot(width,height),length=pathLength(screen),closed=distance(screen[0],screen.at(-1)!)<Math.min(12,diagonal*.1);
 if(Math.min(width,height)<24||length>diagonal*4.1||diagonal<42)return null;
 if(closed){
  const cx=left+width/2,cy=top+height/2,rx=width/2,ry=height/2,radii=screen.map(p=>Math.hypot((p.x-cx)/rx,(p.y-cy)/ry));let total=0,previous=Math.atan2(screen[0].y-cy,screen[0].x-cx),sign=0,turns=true;
  for(const p of screen.slice(1)){const angle=Math.atan2(p.y-cy,p.x-cx);let step=angle-previous;while(step>Math.PI)step-=Math.PI*2;while(step< -Math.PI)step+=Math.PI*2;if(Math.abs(step)>.03){if(sign&&Math.sign(step)!==sign)turns=false;sign=Math.sign(step);}total+=step;previous=angle;}
  if(turns&&Math.abs(total)>5.5&&Math.abs(total)<6.9&&radii.every(r=>Math.abs(r-1)<.12))return {kind:'ellipse',label:Math.abs(width-height)/Math.max(width,height)<.08?'Cercle proposé':'Ellipse proposée',points:points.map((p,i)=>{const s=screen[i],angle=Math.atan2((s.y-cy)/ry,(s.x-cx)/rx);return {...p,...paperGuideClientPoint(context,{x:cx+rx*Math.cos(angle),y:cy+ry*Math.sin(angle)})};})};
  const indices=simplify(screen,Math.max(2.5,diagonal*.025));if(indices.length>=4&&indices.length<=7){const vertices=indices.map(i=>screen[i]);vertices[vertices.length-1]={...vertices[0]};const sides=vertices.slice(1).map((p,i)=>distance(p,vertices[i]));let winding=0,convex=true;for(let i=0;i<vertices.length-1;i++){const a=vertices[(i+vertices.length-2)%(vertices.length-1)],b=vertices[i],c=vertices[(i+1)%(vertices.length-1)],cross=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);if(Math.abs(cross)<20){convex=false;break;}if(winding&&Math.sign(cross)!==winding)convex=false;winding=Math.sign(cross);}if(convex&&sides.every(n=>n>18)&&screen.every(p=>Math.min(...vertices.slice(1).map((v,i)=>segmentDistance(p,vertices[i],v)))<Math.max(3,diagonal*.035))){const page=vertices.map(p=>paperGuideClientPoint(context,p));return {kind:'polygon',label:`Polygone proposé (${page.length-1} côtés)`,vertices:page,points:projectToPolyline(points,page)};}}
 }
 // Single-stroke arrow: shaft -> tip -> one wing -> tip -> other wing.
 const indices=simplify(screen,Math.max(2.5,diagonal*.025));if(!closed&&indices.length===5){const [a,tip,wing,back,other]=indices.map(i=>screen[i]),shaft=distance(a,tip),w1=distance(tip,wing),w2=distance(tip,other),dx=(tip.x-a.x)/shaft,dy=(tip.y-a.y)/shaft,dot=(p:XY)=>(p.x-tip.x)*dx+(p.y-tip.y)*dy,cross=(p:XY)=>(p.x-tip.x)*dy-(p.y-tip.y)*dx;
  if(shaft>50&&distance(tip,back)<6&&w1>14&&w2>14&&w1<shaft*.5&&w2<shaft*.5&&Math.min(w1,w2)/Math.max(w1,w2)>.5&&dot(wing)<-w1*.35&&dot(other)<-w2*.35&&cross(wing)*cross(other)<0){const page=[a,tip,wing,tip,other].map(p=>paperGuideClientPoint(context,p));return {kind:'arrow',label:'Flèche proposée',vertices:page,points:projectToPolyline(points,page)};}
 }
 return null;
}
const signature=(options:PaperStrokeCorrectionOptions)=>JSON.stringify({guide:normalizePaperDrawingGuide(options.guide),hold:normalizePaperHoldCorrection(options.hold)});
export function samePaperGuideContext(a:PaperInkContext,b:PaperInkContext):boolean {
 return a.ownershipKey===b.ownershipKey&&a.generation===b.generation&&a.pageId===b.pageId&&a.intent===b.intent&&a.pageWidth===b.pageWidth&&a.pageHeight===b.pageHeight&&(a.pageRotation??0)===(b.pageRotation??0)
  &&(['left','top','width','height'] as const).every(k=>Math.abs(a.clientRect[k]-b.clientRect[k])<=.01)&&!!a.clientToPage===!!b.clientToPage&&(!a.clientToPage||(['a','b','c','d','e','f'] as const).every(k=>Math.abs(a.clientToPage![k]-b.clientToPage![k])<=1e-7));
}
/** A captured contact owns its originals. Hold timing uses the supplied monotonic
 * clock, never rewrites device timestamps, and is not triggered after release. */
export function createPaperStrokeCorrection() {
 let active:{stroke:PaperInkStroke;options:PaperStrokeCorrectionOptions;signature:string;anchor:XY;stableSince:number;now:number;guide:boolean;bypass:boolean;cancelled:boolean;held:boolean;accepted:boolean}|null=null;
 const result=():PaperStrokeCorrectionResult=>{if(!active)return {points:[],originalPoints:[],correction:'none',held:false,cancelled:false,candidate:null};const a=active,original=copyPoints(a.stroke.points);if(a.cancelled||a.bypass)return {points:copyPoints(original),originalPoints:original,correction:'none',held:false,cancelled:a.cancelled,candidate:null};
  const line=a.held?recognizePaperStraightStroke(original,a.stroke.context,a.options.hold.minLengthPx):null,candidate=a.held&&a.options.hold.recognizeShapes?recognizePaperShape(original,a.stroke.context):null;
  const correction=a.guide?'guide':line?'line':a.accepted&&candidate?'shape':'none',points=a.guide?original.map(p=>projectPaperGuidePoint(p,a.options.guide,a.stroke.context)):line?line.points:a.accepted&&candidate?candidate.points:copyPoints(original);
  return {points,originalPoints:original,correction,held:a.held,cancelled:false,candidate:a.guide?null:candidate};
 };
 const inspect=(context:PaperInkContext,options?:PaperStrokeCorrectionOptions)=>{if(!active)return;if(!samePaperGuideContext(active.stroke.context,context))active.cancelled=true;if(options&&signature(options)!==active.signature){active.bypass=true;active.held=false;active.accepted=false;}};
 const tick=(now:number,context:PaperInkContext,options?:PaperStrokeCorrectionOptions)=>{inspect(context,options);if(active&&finite(now)&&now>=active.now){active.now=now;active.held=!active.cancelled&&!active.bypass&&!active.guide&&active.options.hold.enabled&&now-active.stableSince>=active.options.hold.delayMs;}return result();};
 const update=(stroke:PaperInkStroke,now:number,context:PaperInkContext=stroke.context,options?:PaperStrokeCorrectionOptions):PaperStrokeCorrectionResult=>{
  if(!active)return result();inspect(context,options);if(stroke.pointerId!==active.stroke.pointerId||stroke.pointerType!==active.stroke.pointerType){active.cancelled=true;return result();}if(!samePaperGuideContext(active.stroke.context,stroke.context)){active.cancelled=true;return result();}
  if(!finite(now)||now<active.now||stroke.points.length<active.stroke.points.length)return result();
  // Inspect all new coalesced samples. Returning to the anchor cannot hide an excursion.
  let moved=false;for(const p of stroke.points.slice(active.stroke.points.length)){const screen=paperGuidePagePoint(context,p);if(distance(screen,active.anchor)>active.options.hold.movementTolerancePx){active.anchor=screen;moved=true;}}
  active.stroke.points=copyPoints(stroke.points);if(moved){active.stableSince=now;active.held=false;active.accepted=false;}return tick(now,context,options);
 };
 return {
  begin(stroke:PaperInkStroke,options:PaperStrokeCorrectionOptions,now:number):PaperStrokeCorrectionResult {
   if(!stroke.points.length||!finite(now))throw Error('Le contact de dessin est invalide.');const guide=normalizePaperDrawingGuide(options.guide,stroke.context.pageWidth,stroke.context.pageHeight),hold=normalizePaperHoldCorrection(options.hold),copy={...stroke,context:structuredClone(stroke.context),points:copyPoints(stroke.points)},eligible=['pen','pencil','calligraphy','highlighter'].includes(stroke.intent),last=paperGuidePagePoint(stroke.context,stroke.points.at(-1)!);
   active={stroke:copy,options:{guide,hold},signature:signature(options),anchor:last,stableSince:now,now,guide:eligible&&guide.enabled&&paperGuideDistancePx(stroke.points[0],guide,stroke.context)<=guide.snapDistancePx,bypass:!eligible,cancelled:false,held:false,accepted:false};return result();
  },
  update,tick,
  acceptShape(context:PaperInkContext,options?:PaperStrokeCorrectionOptions):PaperStrokeCorrectionResult {inspect(context,options);if(active&&active.held&&!active.bypass&&!active.cancelled)active.accepted=true;return result();},
  disable():PaperStrokeCorrectionResult {if(active){active.bypass=true;active.held=false;active.accepted=false;}return result();},
  snapshot:result,
  finish(stroke:PaperInkStroke,now:number,context:PaperInkContext=stroke.context,options?:PaperStrokeCorrectionOptions):PaperStrokeCorrectionResult {const held=active?.held===true;update(stroke,now,context,options);if(active&&!held){active.held=false;active.accepted=false;}const output=result();active=null;return output;},
  cancel():PaperStrokeCorrectionResult {if(active){active.cancelled=true;active.held=false;active.accepted=false;}const output=result();active=null;return output;},
 };
}
