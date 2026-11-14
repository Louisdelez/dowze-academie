import {fromMarkdown} from 'mdast-util-from-markdown';
import {gfm} from 'micromark-extension-gfm';
import {gfmFromMarkdown} from 'mdast-util-gfm';
import {applyPaperCommand,blankPage,isPaperDocument,migratePaper,legacyPaperPhotoIdentities,notebookDocumentId,type PaperCommand,type PaperDocument,type PaperObject,type PaperAsset,type PaperPage} from './notebookDocument.ts';
import {noteBoardId,parsePhotoReference} from './notebook.ts';

/** This is an exact source observation, not an authorisation or a timestamp heuristic. */
export interface PaperLegacyObservation {markdown:string;board:unknown}
export interface PaperLegacyReconcileInput extends PaperLegacyObservation {
 baseline:PaperLegacyObservation;
 /** A committed receipt can be supplied separately from the original migration baseline. */
 observed?:PaperLegacyObservation;
 baselineKnown?:boolean;
 /** Only after comparing the complete reading order, including partitioned passages. */
 currentMarkdownEquivalent?:boolean;
 now?:string;newId?:()=>string;
}
export interface PaperLegacyReconcilePlan {
 document:PaperDocument;commands:PaperCommand[];changed:boolean;recovered:boolean;
 receipt:PaperLegacyObservation;notices:string[];
}
type Node={type:string;url?:string;identifier?:string;children?:Node[]};
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const canonical=(value:unknown):string=>JSON.stringify(value,(_key,item)=>record(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const same=(a:unknown,b:unknown)=>canonical(a)===canonical(b);

/** Parser semantics distinguish an actual image from a code example or escaped URI spelling. */
export function legacyInlinePhotoIds(markdown:string,boardIds?:ReadonlySet<string>):Set<string>{
 const tree=fromMarkdown(markdown,{extensions:[gfm()],mdastExtensions:[gfmFromMarkdown()]}) as unknown as Node;
 const definitions=new Map<string,string>();
 const walk=(node:Node,visit:(node:Node)=>void)=>{visit(node);node.children?.forEach(child=>walk(child,visit));};
 walk(tree,node=>{if(node.type==='definition'&&node.identifier&&node.url)definitions.set(node.identifier,node.url);});
 const result=new Set<string>();
 walk(tree,node=>{const url=node.type==='image'?node.url:node.type==='imageReference'&&node.identifier?definitions.get(node.identifier):undefined;const ref=url?parsePhotoReference(url):null;if(ref&&(!boardIds||boardIds.has(ref.documentId)))result.add(ref.id);});
 return result;
}
interface Edit {from:number;to:number;insert:string}
function singleEdit(before:string,after:string):Edit{
 let from=0,to=before.length,end=after.length;while(from<to&&from<end&&before[from]===after[from])from++;
 // Never place a splice boundary between the two UTF-16 units of one character.
 if(from>0&&/[\uD800-\uDBFF]/.test(before[from-1])&&/[\uDC00-\uDFFF]/.test(before[from]??''))from--;
 while(to>from&&end>from&&before[to-1]===after[end-1]){to--;end--;}
 if(to<before.length&&to>from&&/[\uDC00-\uDFFF]/.test(before[to])&&/[\uD800-\uDBFF]/.test(before[to-1])){to++;end++;}
 return {from,to,insert:after.slice(from,end)};
}
/** Conservative three-way merge: distinct changes are combined; overlap remains explicit. */
export function mergeLegacyMarkdown(base:string,current:string,incoming:string):string|null{
 if(incoming===base||incoming===current)return current;if(current===base)return incoming;
 const local=singleEdit(base,current),remote=singleEdit(base,incoming);
 const before=(a:Edit,b:Edit)=>a.to<b.from||a.to===b.from&&!(a.from===a.to&&b.from===b.to);
 if(!before(local,remote)&&!before(remote,local))return null;
 return [local,remote].sort((a,b)=>b.from-a.from).reduce((text,edit)=>text.slice(0,edit.from)+edit.insert+text.slice(edit.to),base);
}
interface LegacyInk {key:string;object:PaperObject}
function legacyInk(noteId:string,board:unknown,now:string):{rows:LegacyInk[];ambiguous:boolean}{
 const source=record(board)&&record(board.board)?board.board:{};
 const migrated=migratePaper(noteId,'',board,now),rows=migrated.objects.filter(object=>object.kind==='ink').map(object=>({key:object.id,object}));
 // The old editor used stroke IDs; a duplicated ID cannot identify a single user contribution.
 const sourceIds=Array.isArray(source.strokes)?source.strokes.map(stroke=>record(stroke)?stroke.id:undefined):[];
 return {rows,ambiguous:new Set(rows.map(row=>row.key)).size!==rows.length||Array.isArray(source.strokes)&&(source.strokes.length!==rows.length||source.strokes.some(stroke=>!record(stroke)||typeof stroke.id!=='string'||!stroke.id)||new Set(sourceIds).size!==sourceIds.length)};
}
function inkValue(object:PaperObject){return {points:object.points,color:object.color,strokeWidth:object.strokeWidth,pen:object.pen,x:object.x,y:object.y,width:object.width,height:object.height,z:object.z,rotation:object.rotation,locked:object.locked};}
function photos(noteId:string,board:unknown):PaperAsset[]{
 if(!record(board)||!Array.isArray(board.photos))return [];
 const result=new Map<string,PaperAsset>();
 for(const identity of legacyPaperPhotoIdentities(noteId,board)){const value=board.photos[identity.photoIndex];if(!record(value))continue;const next:PaperAsset={id:identity.assetId,name:typeof value.name==='string'?value.name:'Image',mediaType:typeof value.mediaType==='string'?value.mediaType:'image/png',size:typeof value.size==='number'&&Number.isFinite(value.size)&&value.size>=0?value.size:0,...(identity.serverId?{serverId:identity.serverId}:{})};const old=result.get(next.id);if(old&&old.serverId&&next.serverId&&old.serverId!==next.serverId)throw Error('Deux originaux utilisent la même identité de photo. Ils doivent être conservés séparément avant la réconciliation.');result.set(next.id,old??next);}
 return [...result.values()];
}

/**
 * Plan only. The caller commits source checks, the collaboration update, immutable
 * files and this exact observation receipt in one CAS transaction. Unmodified
 * migration provenance and every existing attachment remain in the document.
 */
export function planPaperLegacyReconcile(current:PaperDocument,input:PaperLegacyReconcileInput):PaperLegacyReconcilePlan{
 if(!isPaperDocument(current))throw Error('La note courante est incompatible. Son original est conservé.');
 const now=input.now??new Date().toISOString(),allocate=input.newId??(()=>crypto.randomUUID()),base=input.observed??input.baseline;
 const baselineKnown=!!input.observed||input.baselineKnown!==false;
 const usedIds=new Set([...current.pages,...current.objects,...current.assets,...current.audio].map(item=>item.id));
 const newId=()=>{for(let attempt=0;attempt<10;attempt++){const id=allocate();if(typeof id==='string'&&id.length>0&&id.length<=200&&!usedIds.has(id)){usedIds.add(id);return id;}}throw Error('La récupération nécessite une identité indépendante. La note courante est conservée.');};
 if(typeof input.markdown!=='string'||typeof base.markdown!=='string'||!Number.isFinite(Date.parse(now)))throw Error('L’observation de l’ancienne note est incompatible.');
 const receipt={markdown:input.markdown,board:structuredClone(input.board)},commands:PaperCommand[]=[],notices:string[]=[];
 if(baselineKnown&&input.markdown===base.markdown&&same(input.board,base.board))return {document:current,commands,changed:false,recovered:false,receipt,notices};
 const rootId=`text-${noteBoardId(current.noteId)}`,root=current.objects.find(object=>object.id===rootId&&object.kind==='text'),legacyPageId=`page-${noteBoardId(current.noteId)}`,legacyPage=current.pages.find(page=>page.id===legacyPageId);
 let recoveryPageId:string|undefined,recovery:PaperPage|undefined,recovered=false;
 const recoveryPage=(height=1123)=>{if(!recoveryPageId){recovery=blankPage(newId());recovery.height=Math.max(recovery.height,height);recoveryPageId=recovery.id;commands.push({type:'insert-page',page:recovery,afterId:current.pages.at(-1)!.id});}else if(recovery&&height>recovery.height){recovery={...recovery,height};commands.push({type:'update-page',page:recovery});}recovered=true;return recoveryPageId;};
 if(!input.currentMarkdownEquivalent&&(input.markdown!==base.markdown||!baselineKnown)){
  const merged=baselineKnown&&root&&!root.textPartition&&!root.locked?mergeLegacyMarkdown(base.markdown,root.markdown??'',input.markdown):null;
  if(merged!==null){if(merged!==root!.markdown)commands.push({type:'patch-object',id:root!.id,patch:{markdown:merged}});}
  else {const pageId=recoveryPage();commands.push({type:'upsert-object',object:{id:newId(),pageId,kind:'text',x:48,y:48,width:698,height:1027,rotation:0,z:0,locked:false,markdown:input.markdown,createdAt:Date.parse(now)}});notices.push('Le texte modifié dans l’ancienne application est conservé sur une page de récupération ; votre texte actuel reste intact.');}
 }
 const before=legacyInk(current.noteId,base.board,now),after=legacyInk(current.noteId,input.board,now),baseRows=new Map(before.rows.map(row=>[row.key,row.object])),afterRows=new Map(after.rows.map(row=>[row.key,row.object]));
 let inkConflict=!baselineKnown&&after.rows.length>0||before.ambiguous||after.ambiguous;
 const inkCommands:PaperCommand[]=[];
 if(!inkConflict)for(const key of new Set([...baseRows.keys(),...afterRows.keys()])){
  const old=baseRows.get(key),incoming=afterRows.get(key),present=current.objects.find(object=>object.id===key);
  if(old&&incoming&&same(inkValue(old),inkValue(incoming)))continue;
  if(!old&&incoming){if(present){if(present.kind!=='ink'||!same(inkValue(present),inkValue(incoming)))inkConflict=true;}else if(legacyPage)inkCommands.push({type:'upsert-object',object:{...incoming,id:key,pageId:legacyPage.id,width:legacyPage.width,height:Math.max(legacyPage.height,incoming.height)}});else inkConflict=true;}
  else if(old){if(present?.kind==='ink'&&same(inkValue(present),inkValue(old))){if(incoming)inkCommands.push({type:'upsert-object',object:{...present,...incoming,pageId:present.pageId,width:present.width,height:Math.max(present.height,incoming.height),createdAt:present.createdAt}});else inkCommands.push({type:'remove-objects',ids:[present.id]});}else if(present||incoming)inkConflict=true;}
 }
 if(inkConflict&&(!baselineKnown||!same(input.board,base.board))){
  const height=after.rows.reduce((height,row)=>Math.max(height,row.object.height),1123),pageId=recoveryPage(height);for(const row of after.rows)commands.push({type:'upsert-object',object:{...row.object,id:newId(),pageId}});notices.push('Le dessin de l’ancienne application est conservé séparément ; les traits actuels ne sont pas remplacés.');
 }else {if(legacyPage&&inkCommands.length){const height=after.rows.reduce((height,row)=>Math.max(height,row.object.height),legacyPage.height);if(height>legacyPage.height)commands.push({type:'update-page',page:{...legacyPage,height}});}for(const command of inkCommands)commands.push(command);}
 const inline=legacyInlinePhotoIds(input.markdown,new Set([noteBoardId(current.noteId),notebookDocumentId(current.noteId)]));
 const photoY=new Map<string,number>(),baselinePhotoIds=new Set(photos(current.noteId,base.board).map(asset=>asset.id));
 for(const asset of photos(current.noteId,input.board)){
  const existing=current.assets.find(value=>value.id===asset.id);
  if(existing){if(existing.serverId&&asset.serverId&&existing.serverId!==asset.serverId)throw Error('La photo reçue utilise l’identité d’un autre original. Préservez ses fichiers avant de continuer.');if(baselinePhotoIds.has(asset.id)||current.objects.some(object=>object.kind==='image'&&object.assetId===asset.id))continue;}
  else commands.push({type:'add-asset',asset});
  if(!inline.has(asset.id)){const pageId=recoveryPageId??legacyPage?.id??recoveryPage(),y=photoY.get(pageId)??current.objects.reduce((bottom,object)=>object.pageId===pageId&&object.kind==='image'?Math.max(bottom,object.y+object.height+24):bottom,100);photoY.set(pageId,y+264);const height=y+288;if(height>100000)throw Error('Ces images nécessitent des pages supplémentaires avant la réconciliation. Leurs originaux sont conservés.');if(pageId===recoveryPageId)recoveryPage(height);else if(legacyPage&&height>legacyPage.height)commands.push({type:'update-page',page:{...legacyPage,height}});commands.push({type:'upsert-object',object:{id:newId(),pageId,kind:'image',x:48,y,width:320,height:240,rotation:0,z:current.objects.length+commands.length,locked:false,assetId:asset.id,createdAt:Date.parse(now)}});}
 }
 const document=commands.length?applyPaperCommand(current,{type:'batch',commands},now):current;
 return {document,commands,changed:!!commands.length,recovered,receipt,notices};
}
