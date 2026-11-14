/** One captured page-coordinate lasso. No view state, sensor data or writing. */
export interface PaperLassoPoint {readonly x:number;readonly y:number}
interface Bounds {minX:number;minY:number;maxX:number;maxY:number}
interface Edge extends Bounds {a:PaperLassoPoint;b:PaperLassoPoint;order:number}
interface Branch extends Bounds {left?:Branch;right?:Branch;edges?:readonly Edge[]}
export interface PreparedPaperLasso {
 readonly valid:boolean;
 /** Copied once so a reused gesture cannot observe a later mutable path. */
 readonly polygon:readonly PaperLassoPoint[];
 contains(point:PaperLassoPoint):boolean;
 intersects(from:PaperLassoPoint,to:PaperLassoPoint):boolean;
}
const finitePoint=(point:PaperLassoPoint|undefined|null):point is PaperLassoPoint=>!!point&&Number.isFinite(point.x)&&Number.isFinite(point.y);
const same=(a:PaperLassoPoint,b:PaperLassoPoint)=>a.x===b.x&&a.y===b.y;
const box=(a:PaperLassoPoint,b:PaperLassoPoint):Bounds=>({minX:Math.min(a.x,b.x),minY:Math.min(a.y,b.y),maxX:Math.max(a.x,b.x),maxY:Math.max(a.y,b.y)});
const overlaps=(a:Bounds,b:Bounds)=>a.minX<=b.maxX&&a.maxX>=b.minX&&a.minY<=b.maxY&&a.maxY>=b.minY;
const insideBounds=(point:PaperLassoPoint,bounds:Bounds)=>point.x>=bounds.minX&&point.x<=bounds.maxX&&point.y>=bounds.minY&&point.y<=bounds.maxY;
const binaryView=new DataView(new ArrayBuffer(8));
/** Exact integer/exponent form of one finite IEEE-754 double. BigInts are used
 * only when the fast determinant cannot prove its sign; their bit length is
 * bounded by the double format, not by the number of physical samples. */
function binary(value:number):{integer:bigint;exponent:number}{
 binaryView.setFloat64(0,value,false);const bits=binaryView.getBigUint64(0,false),encoded=Number((bits>>52n)&2047n),fraction=bits&((1n<<52n)-1n),integer=(encoded?(1n<<52n):0n)|fraction;
 return {integer:bits>>63n?-integer:integer,exponent:encoded?encoded-1075:-1074};
}
function exactOrientation(a:PaperLassoPoint,b:PaperLassoPoint,c:PaperLassoPoint):number {
 const values=[a.x,a.y,b.x,b.y,c.x,c.y].map(binary),exponent=Math.min(...values.map(value=>value.exponent)),[ax,ay,bx,by,cx,cy]=values.map(value=>value.integer<<BigInt(value.exponent-exponent)),cross=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
 return cross<0n?-1:cross>0n?1:0;
}
/** A conservative error bound selects the fast sign. Near-collinearity and
 * overflow/underflow fall back to an exact sign of the captured double values;
 * no epsilon or screen-pixel dilation turns a parallel gap into a contact. */
function orientation(a:PaperLassoPoint,b:PaperLassoPoint,c:PaperLassoPoint):number {
 if(a.x===b.x)return a.y===b.y||c.x===a.x?0:(b.y>a.y?-1:1)*(c.x>a.x?1:-1);
 if(a.y===b.y)return c.y===a.y?0:(b.x>a.x?1:-1)*(c.y>a.y?1:-1);
 const left=(b.x-a.x)*(c.y-a.y),right=(b.y-a.y)*(c.x-a.x),cross=left-right,magnitude=Math.abs(left)+Math.abs(right),error=8*Number.EPSILON*magnitude;
 return Number.isFinite(cross)&&magnitude>=2**-1022&&Math.abs(cross)>error?(cross<0?-1:1):exactOrientation(a,b,c);
}
const onSegment=(a:PaperLassoPoint,b:PaperLassoPoint,point:PaperLassoPoint)=>insideBounds(point,box(a,b))&&orientation(a,b,point)===0;
function intersects(a:PaperLassoPoint,b:PaperLassoPoint,edge:Edge):boolean {
 if(!overlaps(box(a,b),edge))return false;
 const ac=orientation(a,b,edge.a),ad=orientation(a,b,edge.b),ca=orientation(edge.a,edge.b,a),cb=orientation(edge.a,edge.b,b);
 return (ac!==0&&ad!==0&&ca!==0&&cb!==0&&ac!==ad&&ca!==cb)||(ac===0&&onSegment(a,b,edge.a))||(ad===0&&onSegment(a,b,edge.b))||(ca===0&&onSegment(edge.a,edge.b,a))||(cb===0&&onSegment(edge.a,edge.b,b));
}
/** Balanced immutable AABB tree: every edge is retained once in a leaf. The
 * index has linear storage and is reused for every object of this gesture.
 * Sorting the balanced partitions costs O(E log² E); a query can still inspect
 * all E edges in the worst case. There is no physical-point sampling or cap. */
function branch(edges:readonly Edge[]):Branch {
 const bounds={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};for(const edge of edges){bounds.minX=Math.min(bounds.minX,edge.minX);bounds.minY=Math.min(bounds.minY,edge.minY);bounds.maxX=Math.max(bounds.maxX,edge.maxX);bounds.maxY=Math.max(bounds.maxY,edge.maxY);}
 if(edges.length<=8)return {...bounds,edges};
 const axis=bounds.maxX-bounds.minX>=bounds.maxY-bounds.minY?'X':'Y',sorted=[...edges].sort((a,b)=>{const ac=axis==='X'?a.minX/2+a.maxX/2:a.minY/2+a.maxY/2,bc=axis==='X'?b.minX/2+b.maxX/2:b.minY/2+b.maxY/2;return ac<bc?-1:ac>bc?1:a.order-b.order;}),middle=sorted.length>>>1;
 return {...bounds,left:branch(sorted.slice(0,middle)),right:branch(sorted.slice(middle))};
}
function visit(node:Branch,bounds:Bounds,test:(edge:Edge)=>boolean):boolean {
 if(!overlaps(node,bounds))return false;
 if(node.edges){for(const edge of node.edges)if(overlaps(edge,bounds)&&test(edge))return true;return false;}
 return visit(node.left!,bounds,test)||visit(node.right!,bounds,test);
}
const invalid=():PreparedPaperLasso=>Object.freeze({valid:false,polygon:Object.freeze([]),contains:()=>false,intersects:()=>false});
/** A closed even-odd ring, including its boundary for ink. Repeated adjacent
 * points and a final copy of the first point are harmless. An empty, nonfinite
 * or wholly aligned ring has no selectable region. Self-crossings keep the
 * existing even-odd lasso convention; these are not measurement polygons. */
export function preparePaperLasso(input:readonly PaperLassoPoint[]):PreparedPaperLasso {
 if(!Array.isArray(input))return invalid();const polygon:PaperLassoPoint[]=[];
 for(const point of input){const x=point?.x,y=point?.y;if(!Number.isFinite(x)||!Number.isFinite(y))return invalid();const copy=Object.freeze({x,y});if(!polygon.length||!same(polygon.at(-1)!,copy))polygon.push(copy);}
 if(polygon.length>1&&same(polygon[0],polygon.at(-1)!))polygon.pop();
 if(polygon.length<3||!polygon.some(point=>orientation(polygon[0],polygon[1],point)!==0))return invalid();
 const captured=Object.freeze(polygon),edges=captured.map((a,index)=>{const b=captured[(index+1)%captured.length];return {...box(a,b),a,b,order:index};}),tree=branch(edges);
 const contains=(point:PaperLassoPoint)=>{
  if(!finitePoint(point)||!insideBounds(point,tree))return false;
  if(visit(tree,box(point,point),edge=>onSegment(edge.a,edge.b,point)))return true;
  let inside=false;visit(tree,{minX:point.x,maxX:tree.maxX,minY:point.y,maxY:point.y},edge=>{const {a,b}=edge;if((a.y>point.y)!==(b.y>point.y)&&((orientation(a,b,point)>0)===(b.y>a.y)))inside=!inside;return false;});return inside;
 };
 return Object.freeze({valid:true,polygon:captured,contains,intersects:(from:PaperLassoPoint,to:PaperLassoPoint)=>finitePoint(from)&&finitePoint(to)&&overlaps(box(from,to),tree)&&(contains(from)||contains(to)||visit(tree,box(from,to),edge=>intersects(from,to,edge)))});
}
