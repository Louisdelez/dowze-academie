import {forwardRef,useImperativeHandle,useState} from 'react';
import {PaperInkVisual} from './PaperObjectVisual';
import type {PaperStrokeStyle} from '../lib/notebookDocument';
import type {PaperInkStroke} from '../lib/paperInkInput';
export interface PaperInkPreviewStyle {color:string;width:number;opacity:number;strokeStyle?:PaperStrokeStyle}
export interface PaperInkPreviewHandle {paint:(stroke:PaperInkStroke|null,style:PaperInkPreviewStyle)=>void}
/** Only this small SVG subtree renders on a preview frame, never the notebook/document. */
export const PaperInkPreview=forwardRef<PaperInkPreviewHandle>(function PaperInkPreview(_,ref){
 const [preview,setPreview]=useState<{stroke:PaperInkStroke|null;style:PaperInkPreviewStyle}|null>(null);
 useImperativeHandle(ref,()=>({paint:(stroke,style)=>setPreview({stroke,style})}),[]);
 const stroke=preview?.stroke,style=preview?.style;if(!stroke?.points.length||!style)return null;
 if(stroke.intent==='laser'){const last=stroke.points.at(-1)!;return <circle cx={last.x} cy={last.y} r={8} fill="#ef476f" opacity={0.7}/>;}
 if(stroke.intent==='lasso'||stroke.intent==='eraser')return <path d={`M${stroke.points.map(p=>`${p.x} ${p.y}`).join('L')}`} fill="none" stroke={stroke.intent==='eraser'?'#b6bdcc':'#4461dc'} strokeWidth={stroke.intent==='eraser'?style.width*6:1.5} opacity={.5} strokeDasharray={stroke.intent==='lasso'?'5 4':undefined}/>;
 if(!['pen','pencil','calligraphy','highlighter'].includes(stroke.intent))return null;
 return <PaperInkVisual object={{id:'live-stroke',pageId:stroke.context.pageId,kind:'ink',x:0,y:0,width:stroke.context.pageWidth,height:stroke.context.pageHeight,rotation:0,z:0,locked:false,createdAt:0,points:stroke.points,color:style.color,strokeWidth:style.width,opacity:style.opacity,strokeStyle:style.strokeStyle,pen:stroke.intent as 'pen'|'pencil'|'calligraphy'|'highlighter'}}/>;
});
