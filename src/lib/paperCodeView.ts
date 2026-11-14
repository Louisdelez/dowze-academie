import type {MilkdownPlugin} from '@milkdown/kit/ctx';
import {createTimer} from '@milkdown/kit/ctx';
import {editorViewTimerCtx,nodeViewCtx} from '@milkdown/kit/core';
import type {NodeViewConstructor} from '@milkdown/kit/prose/view';

/** Code stays in the paginated document; maths retain their existing preview editor. */
export const paperCodeView:MilkdownPlugin=(ctx)=>{
 const ready=createTimer('PaperCodeViewReady');
 const preceding=[...ctx.get(editorViewTimerCtx)];
 ctx.record(ready);ctx.update(editorViewTimerCtx,timers=>[...timers,ready]);
 return async()=>{
  await Promise.all(preceding.map(timer=>ctx.wait(timer)));
  const views=ctx.get(nodeViewCtx),original=views.find(([name])=>name==='code_block')?.[1];
  const paperView:NodeViewConstructor=(node,view,getPos,decorations,inner)=>{
   if(String(node.attrs.language??'').toLowerCase()==='latex'&&original)return original(node,view,getPos,decorations,inner);
   const dom=document.createElement('pre'),contentDOM=document.createElement('code');
   dom.className='paper-code-block';dom.appendChild(contentDOM);
   const setLanguage=(language:unknown)=>{contentDOM.dataset.language=String(language??'');};setLanguage(node.attrs.language);
   return {dom,contentDOM,update(next){if(next.type!==node.type||String(next.attrs.language??'').toLowerCase()==='latex')return false;setLanguage(next.attrs.language);return true;}};
  };
  ctx.update(nodeViewCtx,values=>values.map(([name,constructor])=>[name,name==='code_block'?paperView:constructor]));
  ctx.done(ready);
  return()=>{ctx.update(editorViewTimerCtx,timers=>timers.filter(timer=>timer!==ready));ctx.clearTimer(ready);};
 };
};
