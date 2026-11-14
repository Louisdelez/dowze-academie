import {useEffect,useState} from 'react';
import {ListTree,X} from 'lucide-react';
import {readPaperAsset} from '../lib/paperAssets';
import {openPaperPdf} from '../lib/paperPdf';
import {pdfDestinationPage,safePdfUrl} from '../lib/paperPdfNavigation';
import type {PaperAsset} from '../lib/notebookDocument';
import type {NotebookMediaScope} from './NotebookEditor';
interface Item {title:string;depth:number;page?:number;url?:string}
export function PaperPdfOutline({asset,media,onPage,onClose}:{asset:PaperAsset;media:NotebookMediaScope;onPage:(page:number)=>void;onClose:()=>void}){
 const [items,setItems]=useState<Item[]>([]),[status,setStatus]=useState('Ouverture du sommaire…');
 useEffect(()=>{let stopped=false;setStatus('Ouverture du sommaire…');setItems([]);void(async()=>{const pdf=await openPaperPdf(await readPaperAsset(asset,media));try{const root=await pdf.getOutline(),result:Item[]=[];const visit=async(list:any[],depth=0)=>{for(const item of list??[]){if(stopped||result.length>=2000||depth>20)return;let page:number|undefined;try{page=await pdfDestinationPage(pdf,item.dest);}catch{}result.push({title:String(item.title??'Section').slice(0,500),depth,page,url:safePdfUrl(item.url)});await visit(item.items,depth+1);}};await visit(root);if(!stopped){setItems(result);setStatus(result.length?'':'Ce PDF ne contient pas de sommaire.');}}finally{await pdf.destroy();}})().catch(e=>{if(!stopped)setStatus(String(e instanceof Error?e.message:e));});return()=>{stopped=true;};},[asset.id,asset.serverId,media.accountId,media.spaceId,media.api]);
 return <aside className="paper-pdf-outline" aria-label="Sommaire du PDF"><header><ListTree/><strong>Sommaire</strong><button aria-label="Fermer le sommaire PDF" onClick={onClose}><X/></button></header><small>{asset.name}</small>{status&&<p role="status">{status}</p>}<nav aria-label="Sections du PDF">{items.map((item,i)=><div key={i} style={{paddingLeft:Math.min(item.depth,8)*12}}>{item.page?<button onClick={()=>onPage(item.page!)}>{item.title}<small>p. {item.page}</small></button>:item.url?<a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a>:<span>{item.title}</span>}</div>)}</nav></aside>;
}
