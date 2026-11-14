import type {PaperDocument} from '../lib/notebookDocument';
import {describePaperMeasurementObject,type PaperMeasurementObjectDescription} from '../lib/paperMeasurementObject';

/** Standalone page-coordinate overlay: paths are already drawn by the ink reader. */
export function PaperMeasurementLabels({document,pageId,current}:{document:PaperDocument;pageId:string;current?:()=>boolean}){
 if(current&&!current())return null;
 const page=document.pages.find(page=>page.id===pageId);if(!page)return null;
 const labels=Object.freeze(document.objects.filter(object=>object.kind==='ink'&&object.pageId===pageId&&object.measurement!==undefined).map(object=>describePaperMeasurementObject(object,page)).filter((description):description is PaperMeasurementObjectDescription=>description!==null));
 if(!labels.length||current&&!current())return null;
 return <svg className="paper-measurement-labels" data-measurement-page={pageId} viewBox={`0 0 ${page.width} ${page.height}`} width="100%" height="100%" role="group" aria-label="Mesures de la page" focusable="false" style={{position:'absolute',inset:0,overflow:'visible',pointerEvents:'none',zIndex:205}}>
  {labels.map(label=><g key={label.objectId} data-measurement-object={label.objectId} data-measurement-status={label.status} role="img" aria-label={label.accessibleLabel}><title>{label.accessibleLabel}</title>{label.anchor&&<text x={label.anchor.x} y={label.anchor.y-(label.kind==='length'?14:0)} textAnchor="middle" dominantBaseline="central" fill={label.status==='invalid'?'#a32929':'#20343b'} stroke="white" strokeWidth="4" strokeLinejoin="round" paintOrder="stroke" fontFamily="system-ui, sans-serif" fontSize="14">{label.label}</text>}</g>)}
 </svg>;
}
