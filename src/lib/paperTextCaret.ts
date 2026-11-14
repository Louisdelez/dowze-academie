/** Recover a caret's source ordinate from transformed visual centres. */
export function paperTextCaretY(source:{x:number;y:number;height:number},caret:{x:number;y:number},rotation:number,scale:number){
 if(![source.x,source.y,source.height,caret.x,caret.y,rotation,scale].every(Number.isFinite)||scale<=0)throw Error('Position du curseur indisponible.');
 const angle=rotation*Math.PI/180,dx=caret.x-source.x,dy=caret.y-source.y;
 return source.height/2+(-Math.sin(angle)*dx+Math.cos(angle)*dy)/scale;
}
