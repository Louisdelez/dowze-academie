import type {PaperDocument,PaperCommand} from './notebookDocument.ts';
/** Rotate the page coordinate system and every annotation, including locked objects. */
export function rotatePaperPage(document:PaperDocument,pageId:string,direction:1|-1):PaperCommand{
 const page=document.pages.find(p=>p.id===pageId);if(!page)throw Error('La page n’existe plus.');if(direction!==1&&direction!==-1)throw Error('Rotation invalide.');
 const flow=document.objects.find(o=>o.textFlow?.pageIds.includes(pageId));const targets=new Set(flow?.textFlow?.pageIds??[pageId]);
 const commands:PaperCommand[]=[];
 for(const page of document.pages.filter(p=>targets.has(p.id))){commands.push({type:'update-page',page:{...page,width:page.height,height:page.width,rotation:(page.rotation+direction*90+360)%360}});
 for(const o of document.objects.filter(o=>o.pageId===page.id)){const cx=o.x+o.width/2,cy=o.y+o.height/2,x=direction===1?page.height-cy:cy,y=direction===1?cx:page.width-cx;commands.push({type:'patch-object',id:o.id,patch:{x:x-o.width/2,y:y-o.height/2,rotation:(o.rotation+direction*90+360)%360}});}
 }
 return {type:'batch',commands};
}
