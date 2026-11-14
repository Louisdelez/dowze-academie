import {forwardRef,useImperativeHandle,useRef,useState,createElement,StrictMode,act,createRef} from 'react';
import {createRoot} from 'react-dom/client';
import {usePaperPageInkController,type PaperPageInkController,type PaperPageInkControllerOptions} from '../src/hooks/usePaperPageInkController';
import type {PaperInkPreviewHandle,PaperInkPreviewStyle} from '../src/components/PaperInkPreview';
import type {PaperInkStroke} from '../src/lib/paperInkInput';

/** Preview delivery seam only; no raster, PaperInkVisual or physical-device claim. */
const PreviewProbe=forwardRef<PaperInkPreviewHandle>(function PreviewProbe(_,ref){
 const [value,setValue]=useState<{stroke:PaperInkStroke|null;style:PaperInkPreviewStyle}|null>(null);
 useImperativeHandle(ref,()=>({paint:(stroke,style)=>setValue({stroke,style})}),[]);
 return <g data-preview={value?.stroke?'stroke':'empty'} data-preview-color={value?.style.color??''} data-preview-width={value?.style.width??''} data-preview-points={value?.stroke?.points.length??0}/>;
});
const PageProbe=forwardRef<PaperPageInkController,PaperPageInkControllerOptions&{toolbarPage:string}>(function PageProbe({toolbarPage,...options},ref){
 const [toolbar,setToolbar]=useState(toolbarPage),accepted=useRef(options.onAccepted);accepted.current=options.onAccepted;
 const controller=usePaperPageInkController({...options,onAccepted:(submission,event)=>{accepted.current?.(submission,event);setToolbar(submission.pageId);}});
 useImperativeHandle(ref,()=>controller,[controller]);
 return <div data-page-controller-recipe="true"><output data-toolbar-page={toolbar}>{toolbar}</output><svg ref={controller.svgRef} {...controller.handlers} viewBox={`0 0 ${options.page?.width??800} ${options.page?.height??1100}`} data-controller-page={options.pageId} style={{touchAction:options.intent===null?'pan-x pan-y pinch-zoom':'none'}}><PreviewProbe ref={controller.previewRef}/></svg></div>;
});
export function PaperPageInkControllerRecipe({controllerRef,instanceKey='first',...options}:{controllerRef:ReturnType<typeof createRef<PaperPageInkController>>;instanceKey?:string;toolbarPage:string}&PaperPageInkControllerOptions){return <PageProbe key={instanceKey} ref={controllerRef} {...options}/>;}
export {act,createElement,StrictMode,createRoot,createRef};
