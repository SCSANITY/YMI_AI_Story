
// Official MediaPipe contour topology; research regions, not ground truth.
const EYES = [[33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246], [263,249,390,373,374,380,381,382,362,398,384,385,386,387,388,466]]
const LIPS = [61,146,91,181,84,17,314,405,321,375,291,409,270,269,267,0,37,39,40,185]
const NOSE = [168,6,197,195,5,4,1,19,94,2,98,97,326,327,294,278,344,440,275,45,220,115,48,64]

export function polygonArea(poly) {
  return Math.abs(poly.reduce((sum,p,i) => { const q=poly[(i+1)%poly.length]; return sum+p.x*q.y-q.x*p.y },0))/2
}

export function convexHull(points) {
  const p=[...points].sort((a,b)=>a.x-b.x||a.y-b.y)
  const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)
  const lower=[],upper=[]
  for(const v of p){while(lower.length>1 && cross(lower.at(-2),lower.at(-1),v)<=0)lower.pop();lower.push(v)}
  for(const v of [...p].reverse()){while(upper.length>1 && cross(upper.at(-2),upper.at(-1),v)<=0)upper.pop();upper.push(v)}
  return [...lower.slice(0,-1),...upper.slice(0,-1)]
}

export function clipPolygon(poly, rect) {
  let out=poly
  for(const [axis,value,greater] of [['x',rect.left,true],['x',rect.right,false],['y',rect.top,true],['y',rect.bottom,false]]){
    const next=[]
    const inside=p=>greater?p[axis]>=value:p[axis]<=value
    for(let i=0;i<out.length;i++){
      const a=out[i],b=out[(i+1)%out.length],ai=inside(a),bi=inside(b)
      if(ai)next.push(a)
      if(ai!==bi){const t=(value-a[axis])/(b[axis]-a[axis]);next.push({x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y)})}
    }
    out=next
  }
  return out
}

function contains(poly,x,y){
  let yes=false
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[i],b=poly[j]
    if((a.y>y)!==(b.y>y) && x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)yes=!yes
  }
  return yes
}

export function featureRegions(landmarks) {
  if(landmarks.length!==478 || !landmarks.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)))throw new Error('Invalid landmark output')
  const make=indices=>convexHull(indices.map(i=>({x:landmarks[i].x*256,y:landmarks[i].y*256})))
  const eyes=EYES.map(make).sort((a,b)=>a.reduce((s,p)=>s+p.x,0)/a.length-b.reduce((s,p)=>s+p.x,0)/b.length)
  return [{key:'image-left-eye',polygon:eyes[0]}, {key:'image-right-eye',polygon:eyes[1]}, {key:'nose',polygon:make(NOSE)}, {key:'mouth',polygon:make(LIPS)}]
}

export function measureRegion(region,mask,plan) {
  if(mask.length!==256*256*4)throw new Error('Invalid visible-face mask')
  const p=region.polygon,area=polygonArea(p),r=plan.source,scale=256/r.width
  if(!Number.isFinite(area)||!Number.isFinite(r.width)||!Number.isFinite(r.height)||r.width<=0||Math.abs(r.width-r.height)>1e-8*Math.max(r.width,r.height)||p.some(p=>Math.abs(p.x)>4096||Math.abs(p.y)>4096))throw new Error('Invalid region geometry')
  const xs=p.map(p=>p.x),ys=p.map(p=>p.y),bounds={left:Math.min(...xs),right:Math.max(...xs),top:Math.min(...ys),bottom:Math.max(...ys)}
  const originalRect={left:-r.x*scale,top:-r.y*scale,right:(plan.original.width-r.x)*scale,bottom:(plan.original.height-r.y)*scale}
  const originalSupport=area?Math.min(1,polygonArea(clipPolygon(p,originalRect))/area):null
  const inputSupport=area?Math.min(1,polygonArea(clipPolygon(p,{left:0,top:0,right:256,bottom:256}))/area):null
  let samples=0,visible=0
  for(let y=Math.max(0,Math.floor(bounds.top));y<Math.min(256,Math.ceil(bounds.bottom));y++)for(let x=Math.max(0,Math.floor(bounds.left));x<Math.min(256,Math.ceil(bounds.right));x++){
    if(contains(p,x+.5,y+.5)){samples++;if(mask[(y*256+x)*4]===255)visible++}
  }
  const coverage=samples?visible/samples:null
  return {...region,areaMaskPixels:area,bounds,originalSupport,inputSupport,samples,visibleSamples:visible,visibleCoverage:coverage,
    evidence:!samples||!area?'no-measurable-region':originalSupport<1-1e-8?'original-region-outside-image':inputSupport<1-1e-8?'region-outside-model-input':'measurement-only',
    pattern:!samples?'unknown':visible===samples?'all-sampled-pixels-visible':visible===0?'no-sampled-pixels-visible':'mixed-visible-and-nonface',admission:'not-evaluated'}
}
