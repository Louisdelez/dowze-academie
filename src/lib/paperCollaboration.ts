import * as Y from 'yjs';
import {isPaperDocument,type PaperDocument} from './notebookDocument.ts';
import {reviewStudyCard,type StudyCard} from './paperStudy.ts';
export interface PaperCollaboration {schema:1;lineage:string;state:string}
const lexical=(a:string,b:string)=>a<b?-1:a>b?1:0;
const MAX_STATE=8*1024*1024;
interface Cached{document:Y.Doc;state:string;lineage:string}
const cache=new Map<string,Cached>();
export function forgetPaperCollaboration(key:string){cache.get(key)?.document.destroy();cache.delete(key);}
const encode=(bytes:Uint8Array)=>{if(bytes.length>MAX_STATE)throw Error('L’historique collaboratif dépasse 8 Mo. Conservez une archive avant de poursuivre.');const chunks=[];for(let i=0;i<bytes.length;i+=32768)chunks.push(String.fromCharCode(...bytes.subarray(i,i+32768)));return btoa(chunks.join(''));};
const decode=(state:string)=>{if(state.length>MAX_STATE*4/3+8||state.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(state))throw Error('Historique collaboratif invalide.');const binary=atob(state),bytes=new Uint8Array(binary.length);for(let index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);return bytes;};
const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>lexical(a,b)).map(([k,v])=>[k,canonical(v)])):value;
const same=(a:unknown,b:unknown)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
/** UTF-16 splice preserves the identity of unchanged text on both sides of an edit. */
export function spliceCollaborativeText(text:Y.Text,next:string){
 const old=text.toString();if(old===next)return;let prefix=0;while(prefix<old.length&&prefix<next.length&&old[prefix]===next[prefix])prefix++;
 if(prefix&&/[\uD800-\uDBFF]/.test(old[prefix-1]))prefix--;
 let suffix=0;while(suffix<old.length-prefix&&suffix<next.length-prefix&&old[old.length-1-suffix]===next[next.length-1-suffix])suffix++;
 if(suffix&&/[\uDC00-\uDFFF]/.test(old[old.length-suffix]))suffix--;
 const remove=old.length-prefix-suffix;if(remove)text.delete(prefix,remove);const insert=next.slice(prefix,next.length-suffix);if(insert)text.insert(prefix,insert);
}
function writeFields(fields:Y.Map<unknown>,before:Record<string,unknown>,after:Record<string,unknown>){
 for(const key of Object.keys(before))if(!(key in after))fields.delete(key);
 for(const [key,value] of Object.entries(after)){
  if(value===undefined){fields.delete(key);continue;}if(same(before[key],value)&&fields.has(key))continue;
  if(['markdown','question','answer'].includes(key)&&typeof value==='string'){
   let text=fields.get(key);if(!(text instanceof Y.Text)){text=new Y.Text();fields.set(key,text);}spliceCollaborativeText(text as Y.Text,value);
  }else fields.set(key,structuredClone(value));
 }
}
function writeEntities(doc:Y.Doc,name:string,before:readonly {id:string}[],after:readonly {id:string}[]){
 // Keep the first match, exactly as find/findIndex did, including invalid
 // duplicate inputs which the unchanged full-snapshot validation rejects.
 const previous=new Map<string,{item:{id:string};index:number}>();
 for(let index=0;index<before.length;index++){const item=before[index];if(!previous.has(item.id))previous.set(item.id,{item,index});}
 const retained=new Set(after.map(item=>item.id)),collection=doc.getMap<Y.Map<unknown>>(name);
 for(const item of before)if(!retained.has(item.id))collection.delete(item.id);
 for(let i=0;i<after.length;i++){
  const item=after[i],found=previous.get(item.id),old=found?.item;let entity=collection.get(item.id);
  if(!entity){entity=new Y.Map();collection.set(item.id,entity);entity.set('fields',new Y.Map());entity.set('position',i);}
  if(!found||found.index!==i)entity.set('position',i);
  const fields=entity.get('fields');if(!(fields instanceof Y.Map))throw Error('Structure collaborative incompatible.');
  if(name==='cards'){
   const card=item as StudyCard,previous=old as StudyCard|undefined;const {reviews,schedule,...rest}=card;const {reviews:oldReviews=[],schedule:oldSchedule,...oldRest}=previous??{};
   writeFields(fields,oldRest,rest);
   let reviewMap=entity.get('reviews');if(!(reviewMap instanceof Y.Map)){reviewMap=new Y.Map();entity.set('reviews',reviewMap);entity.set('seedSchedule',schedule);entity.set('seedReviewIds',reviews.map(r=>r.id));}
   for(const r of oldReviews)if(!reviews.some(n=>n.id===r.id))(reviewMap as Y.Map<unknown>).delete(r.id);
   for(const r of reviews)if(!oldReviews.some(n=>n.id===r.id))(reviewMap as Y.Map<unknown>).set(r.id,r);
   // Explicit rollback/imported schedule changes reset the seed, not a normal review.
   if(previous&&!same(schedule,oldSchedule)&&reviews.length<=oldReviews.length){entity.set('seedSchedule',schedule);entity.set('seedReviewIds',reviews.map(r=>r.id));}
  }else writeFields(fields,(old??{}) as Record<string,unknown>,item as unknown as Record<string,unknown>);
 }
}
function applyDifference(doc:Y.Doc,before:PaperDocument|null,after:PaperDocument){
 doc.transact(()=>{
  const meta=doc.getMap('meta');meta.set('noteId',after.noteId);
  for(const name of ['pages','objects','assets','audio'] as const)writeEntities(doc,name,before?.[name]??[],after[name]);
  writeEntities(doc,'cards',before?.study?.cards??[],after.study?.cards??[]);
  if(after.study){if(before?.study?.language!==after.study.language)meta.set('language',after.study.language);meta.set('study',true);}else if(before?.study)meta.set('study',false);
 });
}
function entities(doc:Y.Doc,name:string):unknown[]{
 return [...doc.getMap<Y.Map<unknown>>(name).entries()].sort(([a,x],[b,y])=>Number(x.get('position'))-Number(y.get('position'))||lexical(a,b)).map(([,entity])=>{
  const fields=entity.get('fields');if(!(fields instanceof Y.Map))throw Error('Structure collaborative incompatible.');const object=fields.toJSON();
  if(name==='cards'){
   const reviews=entity.get('reviews');if(!(reviews instanceof Y.Map))throw Error('Historique de révision incompatible.');const seedIds=new Set(entity.get('seedReviewIds') as string[]??[]);
   const all=[...reviews.values()] as StudyCard['reviews'];all.sort((a,b)=>lexical(a.at,b.at)||lexical(a.id,b.id));let card={...object,schedule:entity.get('seedSchedule'),reviews:all.filter(r=>seedIds.has(r.id))} as StudyCard;
   for(const r of all.filter(r=>!seedIds.has(r.id)))card=reviewStudyCard(card,r.quality,r.id,r.at);return card;
  }return object;
 });
}
function materialize(template:PaperDocument,doc:Y.Doc):PaperDocument{
 if(doc.getMap('meta').get('noteId')!==template.noteId)throw Error('Cet historique appartient à une autre note.');
 const pages=entities(doc,'pages') as PaperDocument['pages'],objects=entities(doc,'objects') as PaperDocument['objects'],assets=entities(doc,'assets') as PaperDocument['assets'],audio=entities(doc,'audio') as PaperDocument['audio'],cards=entities(doc,'cards') as StudyCard[];
 const value={...template,pages,objects,assets,audio,study:doc.getMap('meta').get('study')||cards.length?{schema:1 as const,language:String(doc.getMap('meta').get('language')??'fr'),cards}:undefined};
 // Concurrent page deletion is surfaced as a recoverable conflict; never drop orphaned work.
 if(!isPaperDocument(value))throw Error('Les modifications simultanées demandent une résolution. Les deux versions restent conservées.');return value;
}
function compatibleSnapshot(a:PaperDocument,b:PaperDocument){return ['pages','objects','assets','audio','study'].every(key=>same(a[key as keyof PaperDocument],b[key as keyof PaperDocument]));}
export function hasPaperCollaboration(value:PaperDocument):value is PaperDocument&{collaboration:PaperCollaboration}{const c=value.collaboration;return !!c&&c.schema===1&&typeof c.lineage==='string'&&!!c.lineage&&c.lineage.length<=200&&typeof c.state==='string';}
function open(value:PaperDocument):Y.Doc{
 const doc=new Y.Doc();try{if(hasPaperCollaboration(value)){Y.applyUpdate(doc,decode(value.collaboration.state));if(!compatibleSnapshot(value,materialize(value,doc)))throw Error('L’historique et la note ne correspondent pas.');}else applyDifference(doc,null,value);return doc;}catch(error){doc.destroy();throw error;}
}
/** Keep the exact projection already materialized and validated by amendment.
 * It is private, operation-local, and never retained in the scoped Y.Doc cache. */
function amendWithProjection(before:PaperDocument,after:PaperDocument,key?:string):{document:PaperDocument;projection:PaperDocument}{
 if(before.noteId!==after.noteId)throw Error('Modification collaborative hors de la note refusée.');
 const previous=key?cache.get(key):undefined,expected=hasPaperCollaboration(before)?before.collaboration.state:undefined;
 let doc=previous&&previous.state===expected&&previous.lineage===before.collaboration?.lineage?previous.document:open(before);
 if(previous&&doc!==previous.document)forgetPaperCollaboration(key!);
 try{
  applyDifference(doc,before,after);const collaboration={schema:1 as const,lineage:before.collaboration?.lineage??crypto.randomUUID(),state:encode(Y.encodeStateAsUpdate(doc))};
  const result={...after,collaboration},projection=materialize(result,doc);if(!compatibleSnapshot(result,projection))throw Error('La modification collaborative ne correspond pas à la note.');
  if(key){if(cache.size>=32&&!cache.has(key))forgetPaperCollaboration(cache.keys().next().value!);cache.set(key,{document:doc,state:collaboration.state,lineage:collaboration.lineage});}else doc.destroy();return {document:result,projection};
 }catch(error){doc.destroy();if(key)cache.delete(key);throw error;}
}
/** Updated fields and Y.Text deltas travel inside the same atomically saved note. */
export function amendPaperCollaboration(before:PaperDocument,after:PaperDocument,key?:string):PaperDocument{
 return amendWithProjection(before,after,key).document;
}
export function mergePaperCollaboration(local:PaperDocument,remote:PaperDocument):PaperDocument|null{
 if(!hasPaperCollaboration(local)||!hasPaperCollaboration(remote)||local.noteId!==remote.noteId||local.collaboration.lineage!==remote.collaboration.lineage)return null;
 // A page operation moves text into new editable regions. The old full-source Y.Text
 // must never merge into a truncated region with the retained identity: insertions
 // into the removed tail would otherwise land on an unrelated surviving page.
 // Independent partitions also remain separate recoverable versions, including
 // an undo returning to the pre-partition generation.
 // Index once, retaining find's FIRST match even for duplicate inputs. The
 // unchanged open/materialize validation below still rejects invalid snapshots.
 const remoteObjects=new Map<string,PaperDocument['objects'][number]>();
 for(const object of remote.objects)if(!remoteObjects.has(object.id))remoteObjects.set(object.id,object);
 if(local.objects.some(object=>{if(object.kind!=='text'&&object.kind!=='sticky')return false;const other=remoteObjects.get(object.id);return !!other&&object.textPartition!==other.textPartition;}))return null;
 const doc=open(local);try{
  const server=open(remote);server.destroy();Y.applyUpdate(doc,decode(remote.collaboration.state));const template={...local,revision:Math.max(local.revision,remote.revision)+1,updatedAt:new Date(Math.max(Date.parse(local.updatedAt),Date.parse(remote.updatedAt))).toISOString()};
  const merged=materialize(template,doc);return {...merged,collaboration:{schema:1,lineage:local.collaboration.lineage,state:encode(Y.encodeStateAsUpdate(doc))}};
 }finally{doc.destroy();}
}

export function verifyPaperCollaboration(value:PaperDocument){const doc=open(value);doc.destroy();}

/** Apply a buffered editor change against the state the writer actually saw, then merge newer changes. */
export function mergePaperTextChange(current:PaperDocument,baseline:PaperDocument|undefined,objectId:string,markdown:string):{document:PaperDocument;editorBaseline:PaperDocument;objectId:string;pageId:string;recovered:boolean}{
 if(baseline&&baseline.noteId!==current.noteId)throw Error('Cette modification appartient à une autre note.');
 const previous=baseline?.objects.find(o=>o.id===objectId),present=current.objects.find(o=>o.id===objectId),source=previous??present;if(!source||!['text','sticky'].includes(source.kind))throw Error('La zone de texte d’origine est introuvable.');
 const partitionChanged=!!previous&&!!present&&previous.textPartition!==present.textPartition;
 let structuralMergeRejected=false;
 if(baseline&&!partitionChanged&&hasPaperCollaboration(baseline)&&hasPaperCollaboration(current)&&baseline.collaboration.lineage===current.collaboration.lineage&&present){
  const next={...baseline,objects:baseline.objects.map(o=>o.id===objectId?{...o,markdown}:o),revision:baseline.revision+1,updatedAt:new Date().toISOString()};
  const {document:local,projection}=amendWithProjection(baseline,next);
  // The current root may have a newer revision/date or root-only metadata even
  // when its collaborative state and every projected collection are identical.
  // Opening baseline above has validated those exact bytes; the amendment has
  // also validated its complete projection. Reuse it only for this one call.
  if(current.collaboration.state===baseline.collaboration.state&&isPaperDocument(current)&&compatibleSnapshot(current,baseline)){
   const document={...current,revision:Math.max(current.revision,local.revision)+1,updatedAt:new Date(Math.max(Date.parse(current.updatedAt),Date.parse(local.updatedAt))).toISOString(),pages:projection.pages,objects:projection.objects,assets:projection.assets,audio:projection.audio,study:projection.study,collaboration:local.collaboration};
   // Match materialize's final validation, including revision overflow and any
   // root/collection relationship. No invalid snapshot gets a cheaper admission.
   if(!isPaperDocument(document))throw Error('Les modifications simultanées demandent une résolution. Les deux versions restent conservées.');
   return {document,editorBaseline:local,objectId,pageId:source.pageId,recovered:false};
  }
  const merged=mergePaperCollaboration(current,local);if(merged)return {document:merged,editorBaseline:local,objectId,pageId:source.pageId,recovered:false};structuralMergeRejected=true;
 }
 if(baseline&&(partitionChanged||structuralMergeRejected||!present||hasPaperCollaboration(current)&&hasPaperCollaboration(baseline)&&current.collaboration.lineage!==baseline.collaboration.lineage)){
  const oldPage=baseline.pages.find(p=>p.id===source.pageId)??current.pages[0],page={...oldPage,id:crypto.randomUUID(),flowRootId:undefined},id=crypto.randomUUID();
  // The recovered complete text needs its own pagination and identity. Previous
  // flow pages belong to the original version and may have been removed already.
  const {audioAnchor,groupId,textFlow,textPartition,...object}=source;const next={...current,pages:[...current.pages,page],objects:[...current.objects,{...object,id,pageId:page.id,markdown,locked:false}],assets:[...current.assets,...baseline.assets.filter(a=>!current.assets.some(n=>n.id===a.id))],revision:current.revision+1,updatedAt:new Date().toISOString()};
  const saved=amendPaperCollaboration(current,next);return {document:saved,editorBaseline:saved,objectId:id,pageId:page.id,recovered:true};
 }
 const next={...current,objects:current.objects.map(o=>o.id===objectId?{...o,markdown}:o),revision:current.revision+1,updatedAt:new Date().toISOString()};
 const saved=amendPaperCollaboration(current,next);return {document:saved,editorBaseline:saved,objectId,pageId:source.pageId,recovered:false};
}
