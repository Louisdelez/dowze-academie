import {objectPoint} from './paperGeometry.ts';
import {eraseInk,type InkPoint,type PaperCommand,type PaperObject,type PaperPage} from './notebookDocument.ts';
import {clipPaperStroke,type PaperStrokeEraseCut,type PaperStrokeErasePoint} from './paperStrokeErase.ts';

export interface PaperInkGestureEraseStats {projectedPoints:number;pathSegments:number;pairTests:number;indexNodeVisits:number;yields:number;generatedPoints:number}
export interface PaperInkGestureEraseOptions {
 /** Complete canonical object collection, so fragment IDs cannot borrow another page's ID. */
 objects:readonly PaperObject[];
 pages:readonly PaperPage[];
 pageId:string;
 path:readonly InkPoint[];
 radius:number;
 whole?:boolean;
 /** Must prove the exact captured document baseline, owner, page and mode. */
 current:()=>boolean;
 /** The default yields a browser task; a resolved promise alone cannot paint. */
 yieldNow?:()=>Promise<void>;
 sliceMs?:number;
 maxWorkPerSlice?:number;
 makeId?:()=>string;
 /** Refuses an oversized derived plan intact; never truncates physical input. */
 maxGeneratedPoints?:number;
}
export interface PaperInkGestureErasePlan {
 status:'ready'|'unchanged'|'cancelled'|'refused';
 commands:PaperCommand[];
 current:()=>boolean;
 stats:PaperInkGestureEraseStats;
 reason?:string;
 cuts:readonly (PaperStrokeEraseCut&{originalId:string})[];
}
type Box={left:number;top:number;right:number;bottom:number};
type Span={low:number;high:number;entry?:PaperStrokeErasePoint;exit?:PaperStrokeErasePoint;entrySources?:PaperStrokeEraseCut['renderPressureSources'];exitSources?:PaperStrokeEraseCut['renderPressureSources']};
type Source={object:PaperObject;index:number;points:InkPoint[];samples:InkPoint[];captured:PaperStrokeErasePoint[];world:Float64Array;box:Box;halfWidth:number;whole:boolean;fields:unknown[];anchor?:{sessionId:string;time:number};measurement?:{schema:number;kind:string;unit:string}};
type Prepared={source:Source;fragments:PaperStrokeErasePoint[][];cuts:PaperStrokeEraseCut[]};
type Node=Box&{first:number;last:number;a?:Node;b?:Node};
const pointFields=['x','y','time','pressure','renderPressure','tiltX','tiltY','twist','nibAngle'] as const;
const optionalPointFields=pointFields.slice(3);
const objectFields=['id','pageId','kind','x','y','width','height','rotation','z','locked','createdAt','strokeWidth','pen','color','opacity','strokeStyle','mirrorX','mirrorY','nibAngle','groupId'] as const;
const pageFields=['id','width','height','rotation','pattern','color','bookmark','template','spacing','flowRootId'] as const;
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const overlap=(a:Box,b:Box)=>a.left<=b.right&&a.right>=b.left&&a.top<=b.bottom&&a.bottom>=b.top;
const emptyBox=():Box=>({left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity});
const union=(a:Box,b:Box):Box=>({left:Math.min(a.left,b.left),top:Math.min(a.top,b.top),right:Math.max(a.right,b.right),bottom:Math.max(a.bottom,b.bottom)});
function bounds(ax:number,ay:number,bx:number,by:number,pad:number):Box {
 const box={left:Math.min(ax,bx)-pad,top:Math.min(ay,by)-pad,right:Math.max(ax,bx)+pad,bottom:Math.max(ay,by)+pad};
 if(!Object.values(box).every(finite))throw new Refusal('precision-range');return box;
}
class Refusal extends Error {}
class Cancellation extends Error {}
const browserTask=()=>new Promise<void>(resolve=>setTimeout(resolve,0));

/**
 * Plan one complete physical eraser gesture without writing any document.
 * Far strokes cost one projection pass plus one path pass, never N × M clips.
 * Close cases use a temporal-range BVH, cached world positions and exact
 * capsule clips of candidate pairs. All loops and the merge sort cooperate
 * with the scheduler. Candidate/output complexity can still be large; this
 * is not a universal timing guarantee or filled brush-contour clipping.
 */
export async function planPaperInkGestureErase(options:PaperInkGestureEraseOptions):Promise<PaperInkGestureErasePlan> {
 const stats:PaperInkGestureEraseStats={projectedPoints:0,pathSegments:0,pairTests:0,indexNodeVisits:0,yields:0,generatedPoints:0},commands:PaperCommand[]=[],publishedCuts:(PaperStrokeEraseCut&{originalId:string})[]=[];
 const objects=options.objects,pages=options.pages,pathSource=options.path,pageId=options.pageId,radius=options.radius,wholeErase=options.whole,parentCurrent=options.current,makeId=options.makeId;
 let live=true;const current=()=>{if(!live)return false;try{if(options.objects===objects&&options.pages===pages&&options.path===pathSource&&options.pageId===pageId&&options.radius===radius&&options.whole===wholeErase&&options.current===parentCurrent&&parentCurrent())return true;}catch{}live=false;return false;};
 const check=()=>{if(!current())throw new Cancellation('source-changed');};
 const result=(status:PaperInkGestureErasePlan['status'],reason?:string):PaperInkGestureErasePlan=>{if(status!=='ready'){commands.length=0;publishedCuts.length=0;}return {status,commands:status==='ready'?commands:[],current,stats,cuts:status==='ready'?publishedCuts:[],...(reason?{reason}:{})};};
 const sliceMs=options.sliceMs??8,maxWork=options.maxWorkPerSlice??1024,maxGenerated=options.maxGeneratedPoints??1_000_000,yieldNow=options.yieldNow??browserTask;
 let work=0,sliceStart=performance.now();
 const checkpoint=async()=>{check();if(++work<maxWork&&performance.now()-sliceStart<sliceMs)return;stats.yields++;await yieldNow();check();work=0;sliceStart=performance.now();};
 try{
  check();if(!finite(sliceMs)||sliceMs<=0||sliceMs>16||!Number.isSafeInteger(maxWork)||maxWork<1||maxWork>4096||!Number.isSafeInteger(maxGenerated)||maxGenerated<0)throw new Refusal('invalid-scheduling-budget');
  if(!finite(radius)||radius<0)throw new Refusal('invalid-eraser');
  const page=pages.find(value=>value.id===pageId);if(!page||![page.width,page.height,page.rotation].every(finite))throw new Refusal('missing-page');
  const pageValues=pageFields.map(field=>page[field]),calibration=page.calibration?{...page.calibration}:undefined,pdf=page.pdf?{...page.pdf}:undefined,objectsLength=objects.length,pagesLength=pages.length,pathLength=pathSource.length;
  const pageCurrent=()=>pages.length===pagesLength&&pages.find(value=>value.id===pageId)===page&&pageFields.every((field,index)=>page[field]===pageValues[index])&&page.calibration?.schema===calibration?.schema&&page.calibration?.pageUnitsPerMm===calibration?.pageUnitsPerMm&&page.pdf?.assetId===pdf?.assetId&&page.pdf?.pageNumber===pdf?.pageNumber&&page.pdf?.text===pdf?.text&&objects.length===objectsLength&&pathSource.length===pathLength;
  const sources:Source[]=[],occupied=new Set<string>();
  for(let index=0;index<objects.length;index++){
   await checkpoint();const object=objects[index];if(typeof object.id!=='string'||!object.id||object.id.length>200||occupied.has(object.id))throw new Refusal('invalid-object-identity');occupied.add(object.id);
   if(object.pageId!==pageId||object.kind!=='ink'||object.locked||!object.points?.length)continue;
   if(![object.x,object.y,object.width,object.height,object.rotation].every(finite)||object.width<0||object.height<0||(object.mirrorX!==undefined&&typeof object.mirrorX!=='boolean')||(object.mirrorY!==undefined&&typeof object.mirrorY!=='boolean'))throw new Refusal('invalid-source-transform');
   const width=object.strokeWidth??3;if(!finite(width)||width<0||!finite(radius+width/2))throw new Refusal('invalid-brush-width');
   const points=object.points,whole=wholeErase===true||object.measurement!==undefined||points.length===1,captured:PaperStrokeErasePoint[]=[],samples:InkPoint[]=[],world=new Float64Array(points.length*2);let box=emptyBox(),time=-Infinity;
   const fields=objectFields.map(field=>object[field]),anchor=object.audioAnchor?{...object.audioAnchor}:undefined,measurement=object.measurement?{...object.measurement}:undefined;
   for(let i=0;i<points.length;i++){
    await checkpoint();const sample=points[i];if(!sample||![sample.x,sample.y,sample.time].every(finite)||optionalPointFields.some(field=>sample[field]!==undefined&&!finite(sample[field]))||(sample.pressure!==undefined&&(sample.pressure<0||sample.pressure>1))||(sample.renderPressure!==undefined&&(sample.renderPressure<0||sample.renderPressure>1)))throw new Refusal('invalid-source-sample');
    if(!whole&&sample.time<time)throw new Refusal('non-monotone-time');time=sample.time;
    const copy={...sample},position=objectPoint(object,copy);if(![position.x,position.y].every(finite))throw new Refusal('precision-range');
    if(i&&(!finite(position.x-world[(i-1)*2])||!finite(position.y-world[(i-1)*2+1])))throw new Refusal('precision-range');
    samples.push(sample);captured.push(copy);world[i*2]=position.x;world[i*2+1]=position.y;stats.projectedPoints++;box=union(box,bounds(position.x,position.y,position.x,position.y,width/2));
   }
   sources.push({object,index,points,samples,captured,world,box,halfWidth:width/2,whole,fields,anchor,measurement});
  }
  const validateSources=async()=>{
   check();if(!pageCurrent())throw new Cancellation('baseline-changed');
   for(const source of sources){
    await checkpoint();const object=source.object;
    if(objects[source.index]!==object||object.points!==source.points||object.points.length!==source.samples.length||objectFields.some((field,index)=>object[field]!==source.fields[index])||object.audioAnchor?.sessionId!==source.anchor?.sessionId||object.audioAnchor?.time!==source.anchor?.time||object.measurement?.schema!==source.measurement?.schema||object.measurement?.kind!==source.measurement?.kind||object.measurement?.unit!==source.measurement?.unit)throw new Cancellation('baseline-changed');
    for(let i=0;i<source.samples.length;i++){await checkpoint();const sample=source.points[i];if(sample!==source.samples[i]||pointFields.some(field=>sample[field]!==source.captured[i][field]))throw new Cancellation('baseline-changed');}
   }
  };
  if(!sources.length||!pathLength){await validateSources();return result('unchanged');}
  const path=new Float64Array(pathLength*2),pathSamples:InkPoint[]=[];let pathBox=emptyBox();
  for(let i=0;i<pathLength;i++){
   await checkpoint();const sample=pathSource[i];if(!sample||![sample.x,sample.y].every(finite))throw new Refusal('invalid-eraser-path');pathSamples.push(sample);path[i*2]=sample.x;path[i*2+1]=sample.y;
   const first=Math.max(0,i-1);if(!finite(sample.x-path[first*2])||!finite(sample.y-path[first*2+1]))throw new Refusal('precision-range');
   pathBox=union(pathBox,bounds(path[first*2],path[first*2+1],sample.x,sample.y,radius));stats.pathSegments++;
  }
  const validatePath=async()=>{check();if(!pageCurrent())throw new Cancellation('baseline-changed');for(let i=0;i<pathLength;i++){await checkpoint();if(pathSource[i]!==pathSamples[i]||pathSource[i].x!==path[i*2]||pathSource[i].y!==path[i*2+1])throw new Cancellation('eraser-path-changed');}};
  const nearby:Source[]=[];for(const source of sources){await checkpoint();if(overlap(source.box,pathBox))nearby.push(source);}
  if(!nearby.length){await validateSources();await validatePath();return result('unchanged');}
  // Leaves follow the physical path order, avoiding a blocking global sort.
  let level:Node[]=[];
  for(let first=0;first<pathLength;first+=32){let box=emptyBox();const last=Math.min(pathLength,first+32);for(let i=first;i<last;i++){await checkpoint();const previous=Math.max(0,i-1);box=union(box,bounds(path[previous*2],path[previous*2+1],path[i*2],path[i*2+1],radius));}level.push({...box,first,last});}
  while(level.length>1){const next:Node[]=[];for(let i=0;i<level.length;i+=2){await checkpoint();const a=level[i],b=level[i+1];next.push(b?{...union(a,b),first:a.first,last:b.last,a,b}:a);}level=next;}const tree=level[0];
  const sortedUnion=async(input:Span[]):Promise<Span[]>=>{
   if(input.length<2)return input;let sorted=input,temporary=new Array<Span>(input.length);
   for(let width=1;width<input.length;width*=2){for(let first=0;first<input.length;first+=width*2){let a=first,b=Math.min(input.length,first+width),endA=b,endB=Math.min(input.length,first+width*2);for(let i=first;i<endB;i++){await checkpoint();temporary[i]=a<endA&&(b>=endB||sorted[a].low<=sorted[b].low)?sorted[a++]:sorted[b++];}}[sorted,temporary]=[temporary,sorted];}
   const merged:Span[]=[];for(const span of sorted){await checkpoint();const previous=merged.at(-1);if(!previous||span.low>previous.high)merged.push({...span});else if(span.high>previous.high){previous.high=span.high;previous.exit=span.exit;previous.exitSources=span.exitSources;}}return merged;
  };
  const prepared:Prepared[]=[];
  for(const source of nearby){
   const fragments:PaperStrokeErasePoint[][]=[],cuts:PaperStrokeEraseCut[]=[];let run:PaperStrokeErasePoint[]|undefined,runCuts:Omit<PaperStrokeEraseCut,'fragmentIndex'>[]=[],lastSample=-1,changed=false,eraseWhole=false;
   const begin=()=>{if(!run){run=[];runCuts=[];lastSample=-1;}return run;};
   const sample=(index:number)=>{const target=begin();if(lastSample!==index){target.push(source.samples[index]);lastSample=index;}};
   const boundary=(segment:number,fraction:number,point:PaperStrokeErasePoint|undefined,pressureSources:PaperStrokeEraseCut['renderPressureSources']|undefined)=>{
    if(fraction===0){sample(segment);return;}if(fraction===1){sample(segment+1);return;}
    if(!point||!pressureSources)throw new Refusal('invalid-cut-provenance');if(stats.generatedPoints>=maxGenerated)throw new Refusal('derived-plan-capacity');stats.generatedPoints++;
    const target=begin();target.push(point);lastSample=-1;runCuts.push({schema:1,kind:'eraser-boundary',pointIndex:target.length-1,sourceSegment:segment,fraction,renderPressureSources:pressureSources});
   };
   const finish=()=>{if(run?.length){const fragmentIndex=fragments.length;fragments.push(run);for(const cut of runCuts)cuts.push({...cut,fragmentIndex});}run=undefined;runCuts=[];lastSample=-1;};
   for(let segment=0;segment<Math.max(1,source.samples.length-1);segment++){
    await checkpoint();const a=segment,b=Math.min(segment+1,source.samples.length-1),worldA={x:source.world[a*2],y:source.world[a*2+1]},worldB={x:source.world[b*2],y:source.world[b*2+1]},box=bounds(worldA.x,worldA.y,worldB.x,worldB.y,source.halfWidth),stack=[tree],spans:Span[]=[];let covered=false;
    while(stack.length&&!covered&&!eraseWhole){
     await checkpoint();const node=stack.pop()!;stats.indexNodeVisits++;if(!overlap(box,node))continue;if(node.a){stack.push(node.a);if(node.b)stack.push(node.b);continue;}
     for(let i=node.first;i<node.last&&!covered&&!eraseWhole;i++){
      await checkpoint();const previous=Math.max(0,i-1),from={x:path[previous*2],y:path[previous*2+1]},to={x:path[i*2],y:path[i*2+1]};if(!overlap(box,bounds(from.x,from.y,to.x,to.y,radius)))continue;stats.pairTests++;
      if(source.whole){
       const probes=[{...worldA,time:0},{...worldB,time:0}],geometric=clipPaperStroke(probes,from,to,radius+source.halfWidth);if(geometric.reason)throw new Refusal(geometric.reason);
       const probe:PaperObject={id:'gesture-geometry-probe',pageId:pageId,kind:'ink',x:0,y:0,width:0,height:0,rotation:0,z:0,locked:false,createdAt:0,strokeWidth:0,points:probes};
       if(geometric.changed||eraseInk(probe,from,to,radius+source.halfWidth,true).length===0){eraseWhole=true;changed=true;}continue;
      }
      const originals=[source.captured[a],source.captured[b]],clip=clipPaperStroke(originals,from,to,radius+source.halfWidth,(_,index)=>index?worldB:worldA);if(clip.reason)throw new Refusal(clip.reason);if(!clip.changed)continue;
      const first=clip.fragments[0],last=clip.fragments.at(-1),entry=first?.[0]===originals[0]?clip.cuts.find(cut=>cut.fragmentIndex===0):undefined,exit=last?.at(-1)===originals[1]?clip.cuts.find(cut=>cut.fragmentIndex===clip.fragments.length-1):undefined;
      const span:Span={low:entry?.fraction??0,high:exit?.fraction??1,...(entry?{entry:first!.at(-1),entrySources:entry.renderPressureSources}:{}),...(exit?{exit:last![0],exitSources:exit.renderPressureSources}:{})};
      if(span.low===0&&span.high===1){spans.length=0;spans.push(span);covered=true;}else spans.push(span);
     }
    }
    if(eraseWhole)break;
    const erased=await sortedUnion(spans);if(!erased.length){sample(a);sample(b);continue;}changed=true;let cursor=0,exitPoint:PaperStrokeErasePoint|undefined,exitSources:PaperStrokeEraseCut['renderPressureSources']|undefined;
    for(const span of erased){await checkpoint();if(span.low>cursor){if(cursor===0)sample(a);else boundary(segment,cursor,exitPoint,exitSources);boundary(segment,span.low,span.entry,span.entrySources);}finish();cursor=span.high;exitPoint=span.exit;exitSources=span.exitSources;}
    if(cursor<1){boundary(segment,cursor,exitPoint,exitSources);sample(b);}
   }
   if(eraseWhole){fragments.length=0;cuts.length=0;}else finish();if(changed)prepared.push({source,fragments,cuts});
  }
  await validateSources();await validatePath();check();
  // UUIDs and commands are materialized only after all geometry has settled.
  for(const item of prepared){await checkpoint();commands.push({type:'remove-objects',ids:[item.source.object.id]});for(const fragment of item.fragments){await checkpoint();let id:string|undefined;for(let attempt=0;attempt<32;attempt++){check();const candidate=makeId?.()??`ink-fragment-${crypto.randomUUID()}`;if(typeof candidate==='string'&&candidate.length>0&&candidate.length<=200&&!occupied.has(candidate)){id=candidate;occupied.add(candidate);break;}}if(!id)throw new Refusal('fragment-identity-collision');commands.push({type:'upsert-object',object:{...item.source.object,id,points:fragment}});}for(const cut of item.cuts){await checkpoint();publishedCuts.push({...cut,originalId:item.source.object.id});}}
  await validateSources();await validatePath();check();return result(commands.length?'ready':'unchanged');
 }catch(error){live=false;if(error instanceof Cancellation)return result('cancelled',error.message);return result('refused',error instanceof Refusal?error.message:error instanceof RangeError?'plan-allocation':error instanceof Error?error.message:'planning-failed');}
}
