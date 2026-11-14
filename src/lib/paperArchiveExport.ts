import {Zip,ZipPassThrough,ZipDeflate} from 'fflate';
import {getDraft,localBlobDigest} from '../../pwa/src/storage';
import {LIBRARY_DOCUMENT_ID,isNotebookLibrary} from './notebookLibrary';
import {paperArchiveMetadata} from './paperArchiveMetadata';
import {MAX_PAPER_ARCHIVE_BYTES,MAX_PAPER_ARCHIVE_MEMBER_BYTES} from './paperArchive';
import {readPaperAsset} from './paperAssets';
import type {SubjectNoteDocument} from '../types';
import type {PaperDocument} from './notebookDocument';
import type {NotebookMediaScope} from '../components/NotebookEditor';
/** Portable snapshot. ZIP/media stay in Blob pieces, not a second complete JS byte array. */
export async function buildPaperArchive(document:PaperDocument,media:NotebookMediaScope,note?:Partial<SubjectNoteDocument>,current:()=>boolean=()=>true,onProgress?:(completed:number,total:number)=>void):Promise<Blob>{
 const check=()=>{if(!current())throw Error('Le carnet a changé pendant l’export.');};check();
 const stored=await getDraft({...media,type:'preferences',documentId:LIBRARY_DOCUMENT_ID});check();
 if(stored&&!isNotebookLibrary(stored.content))throw Error('Le classement doit être récupéré avant l’export.');
 const metadata=paperArchiveMetadata(document,note,stored?.content as import('./notebookLibrary').NotebookLibrary|undefined);
 const files:Record<string,Blob>=Object.create(null);files['document.json']=new Blob([JSON.stringify(document)]);files['metadata.json']=new Blob([JSON.stringify(metadata)]);
 const assetPaths:Record<string,string>=Object.create(null);let total=Object.values(files).reduce((sum,file)=>sum+file.size,0);
 for(const asset of document.assets){check();const blob=await readPaperAsset(asset,media,{document,current});check();if(blob.size>MAX_PAPER_ARCHIVE_MEMBER_BYTES)throw Error(`La pièce jointe « ${asset.name} » dépasse 16 Mo.`);total+=blob.size;if(total>MAX_PAPER_ARCHIVE_BYTES)throw Error('Cette note dépasse 256 Mo. Vos fichiers restent intacts.');const path=`assets/${await localBlobDigest(new Blob([asset.id]))}`;if(Object.values(assetPaths).includes(path))throw Error('Deux pièces jointes possèdent une référence incompatible. Leurs originaux sont conservés.');assetPaths[asset.id]=path;files[path]=blob;}
 const integrity:{schema:1;files:Record<string,{size:number;sha256:string}>;assetPaths:Record<string,string>}={schema:1,files:Object.create(null),assetPaths};
 for(const [name,blob] of Object.entries(files)){check();if(blob.size>MAX_PAPER_ARCHIVE_MEMBER_BYTES)throw Error('Un élément de la note dépasse 16 Mo.');integrity.files[name]={size:blob.size,sha256:await localBlobDigest(blob)};check();}
 files['integrity.json']=new Blob([JSON.stringify(integrity)]);if(total+files['integrity.json'].size>MAX_PAPER_ARCHIVE_BYTES)throw Error('L’archive complète dépasse 256 Mo.');total+=files['integrity.json'].size;
 const pieces:Blob[]=[];let produced=0,processed=0,finished=false;
 const zip=new Zip((error,chunk,final)=>{check();if(error)throw error;produced+=chunk.length;if(produced>MAX_PAPER_ARCHIVE_BYTES)throw Error('L’archive complète dépasse 256 Mo.');if(chunk.length)pieces.push(new Blob([chunk as Uint8Array<ArrayBuffer>]));if(final)finished=true;});
 try{
  for(const [name,blob] of Object.entries(files)){
   check();const stream=name.startsWith('assets/')?new ZipPassThrough(name):new ZipDeflate(name,{level:3});zip.add(stream);
   if(!blob.size)stream.push(new Uint8Array(),true);
   for(let offset=0;offset<blob.size;offset+=65536){check();const end=Math.min(blob.size,offset+65536);stream.push(new Uint8Array(await blob.slice(offset,end).arrayBuffer()),end===blob.size);processed+=end-offset;onProgress?.(processed,total);if(offset%(1024*1024)===0)await new Promise<void>(resolve=>setTimeout(resolve,0));}
  }
  check();zip.end();if(!finished)throw Error('L’archive n’a pas pu être finalisée.');return new Blob(pieces,{type:'application/zip'});
 }finally{zip.terminate();}
}
