import type {PaperDocument,PaperObject} from './notebookDocument.ts';
export interface StudySource {noteId:string;pageId:string;objectId:string;revision:number;quote:string}
export interface CardSchedule {repetitions:number;intervalDays:number;ease:number;dueAt:string}
export interface StudyCard {id:string;kind:'basic'|'cloze';question:string;answer:string;source?:StudySource;schedule:CardSchedule;reviews:{id:string;at:string;quality:number}[];createdAt:string}
export interface PaperStudy {schema:1;language:string;cards:StudyCard[]}
export const emptyStudy=():PaperStudy=>({schema:1,language:'fr',cards:[]});
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const date=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v));
export function isPaperStudy(value:unknown):value is PaperStudy{
 if(!record(value)||value.schema!==1||typeof value.language!=='string'||!value.language.length||value.language.length>40||!Array.isArray(value.cards)||value.cards.length>10000)return false;
 try{new Intl.Locale(value.language);}catch{return false;}
 const ids=new Set<string>();return value.cards.every(c=>{
 if(!record(c)||typeof c.id!=='string'||!c.id.length||c.id.length>200||ids.has(c.id)||!['basic','cloze'].includes(String(c.kind))||typeof c.question!=='string'||!c.question.trim()||c.question.length>10000||typeof c.answer!=='string'||!c.answer.trim()||c.answer.length>10000||!date(c.createdAt)||!record(c.schedule)||!Array.isArray(c.reviews))return false;
 ids.add(c.id);const s=c.schedule;const reviewIds=new Set<string>();return Number.isInteger(s.repetitions)&&Number(s.repetitions)>=0&&Number.isInteger(s.intervalDays)&&Number(s.intervalDays)>=0&&typeof s.ease==='number'&&Number.isFinite(s.ease)&&s.ease>=1.3&&s.ease<=10&&date(s.dueAt)&&c.reviews.length<=1000&&c.reviews.every(r=>record(r)&&typeof r.id==='string'&&!!r.id&&!reviewIds.has(r.id)&&(reviewIds.add(r.id),true)&&date(r.at)&&Number.isInteger(r.quality)&&Number(r.quality)>=0&&Number(r.quality)<=5)&&(!c.source||(record(c.source)&&['noteId','pageId','objectId','quote'].every(k=>typeof (c.source as Record<string,unknown>)[k]==='string')&&Number.isInteger(c.source.revision)&&Number(c.source.revision)>=0&&typeof c.source.quote==='string'&&c.source.quote.length<=10000));
 });
}
export function initialSchedule(now=new Date().toISOString()):CardSchedule{return {repetitions:0,intervalDays:0,ease:2.5,dueAt:now};}
/** SM-2 intervals and ease update; same-day retry is handled by the review session queue. */
export function reviewStudyCard(card:StudyCard,quality:number,reviewId:string,now=new Date().toISOString()):StudyCard{
 if(card.reviews.some(r=>r.id===reviewId))return card;
 if(!Number.isInteger(quality)||quality<0||quality>5||!date(now))throw Error('Évaluation de la carte invalide.');
 const old=card.schedule;const intervalDays=quality<3?1:old.repetitions===0?1:old.repetitions===1?6:Math.ceil(old.intervalDays*old.ease);
 const ease=Math.max(1.3,Math.min(10,old.ease+0.1-(5-quality)*(0.08+(5-quality)*0.02)));
 const next:StudyCard={...card,schedule:{repetitions:quality<3?0:old.repetitions+1,intervalDays,ease,dueAt:new Date(Date.parse(now)+intervalDays*86400000).toISOString()},reviews:[...card.reviews.slice(-999),{id:reviewId,at:now,quality}]};
 if(!isPaperStudy({schema:1,language:'fr',cards:[next]}))throw Error('Progression de révision invalide.');return next;
}
function stableId(value:string){let hash=14695981039346656037n;for(const char of value){hash^=BigInt(char.codePointAt(0)!);hash=BigInt.asUintN(64,hash*1099511628211n);}return `card-${hash.toString(16)}`;}
export function studySource(document:PaperDocument,object:PaperObject,quote:string):StudySource{return {noteId:document.noteId,pageId:object.pageId,objectId:object.id,revision:document.revision,quote:quote.slice(0,10000)};}
export function suggestClozeCards(document:PaperDocument,objectIds?:readonly string[]):StudyCard[]{
 const cards:StudyCard[]=[];
 for(const object of document.objects.filter(o=>(!objectIds||objectIds.includes(o.id))&&o.markdown)){
 const paragraphs=object.markdown!.split(/\n\s*\n/).filter(p=>p.trim().length>30&&p.length<1000&&!p.includes('```')&&!p.includes('$')&&!p.includes('|')&&!p.startsWith('#'));
 for(const quote of paragraphs){const words=quote.match(/[\p{L}]{7,}/gu)??[];const answer=[...words].sort((a,b)=>b.length-a.length)[0];if(!answer)continue;
 const id=stableId(`${document.noteId}|${object.id}|${quote}|${answer}`),question=quote.replace(answer,'_____');if(cards.some(c=>c.id===id))continue;
 cards.push({id,kind:'cloze',question,answer,source:studySource(document,object,quote),schedule:initialSchedule(),reviews:[],createdAt:new Date().toISOString()});if(cards.length>=30)return cards;
 }
 }return cards;
}
export function summaryExcerpts(document:PaperDocument):{text:string;source:StudySource}[]{
 return document.pages.flatMap(page=>document.objects.filter(o=>o.pageId===page.id&&o.markdown).flatMap(object=>object.markdown!.split(/\n\s*\n/).filter(p=>p.trim()&&!p.startsWith('#')).slice(0,2).map(quote=>({text:quote.slice(0,700),source:studySource(document,object,quote)})))).slice(0,20);
}
export function sourceIsCurrent(document:PaperDocument,source:StudySource){const object=document.objects.find(o=>o.id===source.objectId&&o.pageId===source.pageId);return document.noteId===source.noteId&&!!object?.markdown?.includes(source.quote);}
/** RFC-style quoted rows; report invalid entries instead of inventing answers. */
export function importStudyRows(text:string):{cards:StudyCard[];rejected:number;format:string}{
 if(text.length>1024*1024)throw Error('Le fichier de cartes dépasse 1 Mo.');let inQuote=false;const counts=new Map<string,number>([['\t',0],[';',0],[',',0]]);for(let i=0;i<text.length;i++){if(text[i]==='\"'){if(inQuote&&text[i+1]==='\"')i++;else inQuote=!inQuote;}else if(!inQuote&&text[i]==='\n')break;else if(!inQuote&&counts.has(text[i]))counts.set(text[i],counts.get(text[i])!+1);}const separator=[...counts].sort((a,b)=>b[1]-a[1])[0][0];const rows:string[][]=[];let row:string[]=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===separator&&!quoted){row.push(field);field='';}else if(c==='\n'&&!quoted){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}else field+=c;}
 if(quoted)throw Error('Une citation du fichier CSV n’est pas fermée.');if(field||row.length){row.push(field.replace(/\r$/,''));rows.push(row);}const header=rows[0]?.map(s=>s.trim().toLowerCase());if(header&&['question','recto','front'].includes(header[0])&&['answer','réponse','reponse','verso','back'].includes(header[1]))rows.shift();
 let rejected=0;const cards:StudyCard[]=[];for(const fields of rows){if(fields.every(f=>!f.trim()))continue;const [question,answer]=fields.map(s=>s.trim());if(fields.length!==2||!question||!answer||question.length>10000||answer.length>10000){rejected++;continue;}cards.push({id:crypto.randomUUID(),kind:'basic',question,answer,schedule:initialSchedule(),reviews:[],createdAt:new Date().toISOString()});if(cards.length>10000)throw Error('Le fichier contient plus de 10000 cartes.');}return {cards,rejected,format:separator==='\t'?'TSV':'CSV'};
}
