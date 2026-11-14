import {useId} from 'react';
import type {PaperPage} from '../lib/notebookDocument';
/** The same vector paper background is used by the editor, thumbnails and exports. */
export function PaperBackground({page:visualPage}:{page:PaperPage}){
 const rotation=((visualPage.rotation%360)+360)%360;const page=rotation===90||rotation===270?{...visualPage,width:visualPage.height,height:visualPage.width}:visualPage;
 const turn=rotation===90?`translate(${visualPage.width} 0) rotate(90)`:rotation===180?`translate(${visualPage.width} ${visualPage.height}) rotate(180)`:rotation===270?`translate(0 ${visualPage.height}) rotate(270)`:undefined;
 const id='paper-pattern-'+useId().replace(/[^\w-]/g,''),spacing=page.spacing??(page.pattern==='ruled'?28:page.pattern==='grid'?24:20),line='#91a3be',margin=48;
 const template=page.template??'standard';
 const weeks=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
 return <svg className="paper-background" viewBox={`0 0 ${visualPage.width} ${visualPage.height}`} preserveAspectRatio="none" aria-hidden="true"><g transform={turn}>
 <defs><pattern id={id} width={spacing} height={spacing} patternUnits="userSpaceOnUse">{page.pattern==='dots'?<circle cx={spacing/2} cy={spacing/2} r=".9" fill={line} opacity=".6"/>:page.pattern==='grid'?<path d={`M ${spacing} 0 H 0 V ${spacing}`} fill="none" stroke={line} strokeWidth=".65" opacity=".4"/>:page.pattern==='ruled'?<path d={`M 0 ${spacing-.5} H ${spacing}`} stroke={line} strokeWidth=".7" opacity=".4"/>:null}</pattern></defs>
 {template==='standard'&&page.pattern!=='plain'&&<rect width={page.width} height={page.height} fill={`url(#${id})`}/>}
 {template==='cornell'&&<><rect x={margin} y={margin+40} width={Math.max(0,page.width-2*margin)} height={Math.max(0,page.height-2*margin-160)} fill={`url(#${id})`}/><path d={`M ${margin} ${margin+40} H ${page.width-margin} M ${page.width*.27} ${margin+40} V ${page.height-margin-120} M ${margin} ${page.height-margin-120} H ${page.width-margin}`} fill="none" stroke={line} strokeWidth="1"/><g fill={line} fontSize="12"><text x={margin} y={margin+18}>Sujet · Date</text><text x={margin+8} y={margin+65}>Repères</text><text x={page.width*.27+12} y={margin+65}>Notes</text><text x={margin+8} y={page.height-margin-100}>Synthèse</text></g></>}
 {template==='music'&&Array.from({length:Math.max(0,Math.min(40,Math.floor((page.height-2*margin)/(spacing*8))))},(_,staff)=><g key={staff}>{Array.from({length:5},(_,i)=><path key={i} d={`M ${margin} ${margin+staff*spacing*8+i*spacing/2} H ${page.width-margin}`} stroke={line} strokeWidth=".9"/>)}</g>)}
 {template==='weekly'&&<><g fill={line} fontSize="16"><text x={margin} y={margin}>Ma semaine</text></g>{weeks.map((day,i)=>{const top=margin+30+i*(page.height-2*margin-30)/7;return <g key={day}><rect x={margin} y={top} width={page.width-2*margin} height={(page.height-2*margin-30)/7} fill="none" stroke={line} strokeWidth=".7"/><text x={margin+12} y={top+20} fontSize="12" fill={line}>{day}</text></g>;})}</>}
 </g></svg>;
}
