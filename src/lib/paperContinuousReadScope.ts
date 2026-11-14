import type {PaperDocument,PaperPage,PaperAsset} from './notebookDocument.ts';
import type {NotebookMediaScope} from '../components/NotebookEditor';

export interface PaperContinuousReadSnapshot {
 readonly ownerKey:string;readonly document:PaperDocument;readonly media:NotebookMediaScope;readonly current:()=>boolean;
}
export interface PaperContinuousReadScope {
 readonly current:()=>boolean;readonly pageCurrent:(pageId:string)=>()=>boolean;readonly revoke:()=>void;
}
const pageStamp=(page:PaperPage)=>JSON.stringify([page.id,page.width,page.height,page.rotation,page.pattern,page.color,page.template??null,page.spacing??null,page.flowRootId??null,page.pdf?.assetId??null,page.pdf?.pageNumber??null,page.calibration?.schema??null,page.calibration?.pageUnitsPerMm??null]);
const assetStamp=(asset:PaperAsset)=>JSON.stringify([asset.id,asset.serverId??null,asset.mediaType,asset.size,asset.name]);
/** Sticky read authority. The caller replaces/revokes a scope on every source
 * render transition, so retained callbacks cannot revive through source A-B-A.
 * No writer, cache, browser listener or document mutation is owned here. */
export function createPaperContinuousReadScope(initial:PaperContinuousReadSnapshot,latest:()=>PaperContinuousReadSnapshot):PaperContinuousReadScope {
 const ownerKey=initial.ownerKey,document=initial.document,noteId=document.noteId,revision=document.revision,accountId=initial.media.accountId,spaceId=initial.media.spaceId,api=initial.media.api;
 const pages=new Map(document.pages.map(page=>[page.id,pageStamp(page)])),assets=document.assets.map(assetStamp),pageCallbacks=new Map<string,()=>boolean>();let revoked=false;
 const revoke=()=>{revoked=true;};
 const current=()=>{
  if(revoked)return false;let valid=false;
  try{const value=latest();valid=value.ownerKey===ownerKey&&value.document===document&&value.document.noteId===noteId&&value.document.revision===revision&&value.media.accountId===accountId&&value.media.spaceId===spaceId&&value.media.api===api&&value.document.assets.length===assets.length&&value.document.assets.every((asset,index)=>assetStamp(asset)===assets[index])&&value.current();}catch{}
  if(!valid)revoke();return valid;
 };
 const pageCurrent=(pageId:string)=>{
  const existing=pageCallbacks.get(pageId);if(existing)return existing;const stamp=pages.get(pageId);let pageRevoked=stamp===undefined;
  const callback=()=>{if(pageRevoked)return false;let valid=false;
   try{const value=latest(),page=value.document.pages.find(page=>page.id===pageId);valid=current()&&!!page&&pageStamp(page)===stamp;}catch{}
   if(!valid)pageRevoked=true;return valid;
  };pageCallbacks.set(pageId,callback);return callback;
 };
 return Object.freeze({current,pageCurrent,revoke});
}
