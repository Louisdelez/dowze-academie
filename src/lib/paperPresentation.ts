export interface PaperPresentationSize {width:number;height:number}
export interface PaperPresentationFit extends PaperPresentationSize {scale:number}

/** Fit the complete canonical page into a view without changing page geometry. */
export function paperPresentationFit(page:Readonly<PaperPresentationSize>,viewport:Readonly<PaperPresentationSize>):PaperPresentationFit {
 const dimensions=[page.width,page.height,viewport.width,viewport.height];
 if(dimensions.some(value=>!Number.isFinite(value)||value<=0))throw new RangeError('Les dimensions de la page et de la projection doivent être finies et positives.');
 const scale=Math.min(viewport.width/page.width,viewport.height/page.height),width=page.width*scale,height=page.height*scale;
 if([scale,width,height].some(value=>!Number.isFinite(value)||value<=0))throw new RangeError('Les dimensions de cette projection ne peuvent pas être représentées.');
 return {scale,width,height};
}
