/**
 * Trace a provider's "Growth of €1,000/€10,000" performance plot from its
 * actual PDF pixels, calibrated against its printed date and euro-value axes.
 *
 * This is GRAPH DIGITISATION, not a provider-supplied NAV series. Estimates
 * must be labelled, and an undigitisable PDF must never receive made-up data.
 */
export type ChartPoint={date:string;value:number};
export type SourceGrowthSeries={
  source:"digitized_pdf_graph";
  sourcePage:number;
  sourceLabel:string;
  method:"raster_trace_with_axis_calibration";
  estimated:true;
  currency:"EUR"|"GBP"|"USD";
  observations:ChartPoint[];
  quality:{dateAxisR2:number;valueAxisR2:number;pixelCoverage:number;
    sampledMonths:number;confidence:number};
};
export type GrowthResult={series:SourceGrowthSeries|null;reason:string};

type TextAnchor={label:string;x:number;y:number;width:number};
type Tick={x:number;y:number;value:number};
type Fit={slope:number;intercept:number;r2:number};
type Colour={r:number;g:number;b:number;count:number;coverage:number};

function lineFit(points:{x:number;y:number}[]):Fit|null{
  if(points.length<2)return null;
  const ax=points.reduce((s,p)=>s+p.x,0)/points.length;
  const ay=points.reduce((s,p)=>s+p.y,0)/points.length;
  const xx=points.reduce((s,p)=>s+(p.x-ax)**2,0);
  if(xx<1e-10)return null;
  const slope=points.reduce((s,p)=>s+(p.x-ax)*(p.y-ay),0)/xx;
  const intercept=ay-slope*ax;
  const residual=points.reduce((s,p)=>s+(p.y-intercept-slope*p.x)**2,0);
  const yy=points.reduce((s,p)=>s+(p.y-ay)**2,0);
  return {slope,intercept,r2:yy>0?1-residual/yy:0};
}
const monthNums:Record<string,number>={
  jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11
};
function dateTick(s:string):number|null{
  const tidy=s.trim().replace(/[’]/g,"'").replace(/\s+/g," ");
  const month=/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[ .,'/-]*(\d{2,4})\b/i.exec(tidy);
  if(month){
    let year=Number(month[2]);
    if(year<100)year+=year>=70?1900:2000;
    if(year>=1980&&year<=2035)
      return Date.UTC(year,monthNums[month[1].slice(0,3).toLowerCase()],1);
  }
  const numeric=/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2}|\d{2})\b/.exec(tidy);
  if(numeric){
    let year=Number(numeric[3]);
    if(year<100)year+=2000;
    const first=Number(numeric[1]),second=Number(numeric[2]);
    if(first>=1&&first<=31&&second>=1&&second<=12&&year>=1980&&year<=2035)
      return Date.UTC(year,second-1,1);
  }
  const standalone=/^\s*((?:19[89]|20)\d{2})\s*$/.exec(tidy);
  if(standalone)return Date.UTC(Number(standalone[1]),0,1);
  return null;
}
function euroTick(s:string):{value:number;currency:"EUR"|"GBP"|"USD"}|null{
  const m=/^\s*([€£$])\s*(-?\d[\d,]*(?:\.\d+)?)\s*$/.exec(s);
  if(!m)return null;
  const value=Number(m[2].replace(/,/g,""));
  if(!Number.isFinite(value)||Math.abs(value)>1e7)return null;
  return {value,currency:m[1]==="€"?"EUR":m[1]==="£"?"GBP":"USD"};
}
/** A printed axis label such as "Jul '22" is often split into several
 * adjacent PDF text operators. Rejoin nearby same-baseline elements only for
 * the purpose of calibrating numeric/chart axes. */
export function expandAxisAnchors(items:TextAnchor[]):TextAnchor[]{
  const expanded=[...items];
  const lines=[...items].sort((a,b)=>a.y-b.y||a.x-b.x);
  for(let i=0;i<lines.length;i++){
    const a=lines[i];
    let end=a.x+a.width;
    let label=a.label;
    for(let j=i+1;j<Math.min(lines.length,i+5);j++){
      const b=lines[j];
      if(Math.abs(b.y-a.y)>3.8)break;
      if(b.x<end-3||b.x-end>30)break;
      label+=" "+b.label;
      end=Math.max(end,b.x+b.width);
      if(label.length>38)break;
      expanded.push({label,x:a.x,y:a.y,width:end-a.x});
    }
  }
  return expanded;
}
/** Several PDF plot libraries draw the entire axis as one text string.
 * Recover each dated tick's approximate horizontal position from character
 * offsets instead of incorrectly treating the whole string as one tick.
 * Only useful for calibrated date axes; not official fund price observations. */
export function dateAnchorsFromPdfText(items:TextAnchor[]):Tick[]{
  const out:Tick[]=[];
  const pattern=/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[ .,'’/-]*\d{2,4}\b|\b(?:19[89]|20)\d{2}\b/gi;
  for(const t of expandAxisAnchors(items)){
    const occurrences=[...t.label.matchAll(pattern)];
    if(occurrences.length>=2 && t.width>16){
      for(const m of occurrences){
        const value=dateTick(m[0]);
        if(value===null)continue;
        const midpoint=(m.index??0)+m[0].length/2;
        out.push({x:t.x+(midpoint/t.label.length)*t.width,y:t.y,value});
      }
    }else{
      const value=dateTick(t.label);
      if(value!==null)out.push({x:t.x+t.width/2,y:t.y,value});
    }
  }
  return out;
}
function groupDates(items:TextAnchor[]):{ticks:Tick[];y:number}|null{
  const dateItems=dateAnchorsFromPdfText(items);
  let best:Tick[]=[];
  for(const tick of dateItems){
    const nearby=dateItems.filter(x=>Math.abs(x.y-tick.y)<=10 &&
      Math.abs(x.x-tick.x)<=500);
    const unique=[...new Map(nearby.map(x=>[x.value,x])).values()];
    const span=Math.max(...unique.map(x=>x.x))-Math.min(...unique.map(x=>x.x));
    if(unique.length>=3 && span>95 && unique.length>best.length)best=unique;
  }
  if(best.length<3)return null;
  best.sort((a,b)=>a.x-b.x);
  return {ticks:best,y:best.reduce((s,x)=>s+x.y,0)/best.length};
}
function groupValueTicks(items:TextAnchor[],axisY:number,firstDateX:number){
  const all=expandAxisAnchors(items).flatMap(t=>{
    const result=euroTick(t.label);
    if(!result)return[];
    if(t.y>axisY-5||t.y<axisY-190||t.x>=firstDateX-2)return[];
    return [{x:t.x+t.width,y:t.y,value:result.value,currency:result.currency}];
  });
  let best:typeof all=[];
  for(const tick of all){
    const group=all.filter(x=>(x.currency===tick.currency&&
      Math.abs(x.x-tick.x)<21 && Math.abs(x.y-tick.y)>0.3) || x===tick);
    const unique=[...new Map(group.map(x=>[x.value,x])).values()];
    if(unique.length>best.length)best=unique;
  }
  return best.sort((a,b)=>a.y-b.y);
}
function chooseStrokePixels(
  data:Uint8ClampedArray,width:number,height:number,
  bounds:{x0:number;x1:number;y0:number;y1:number}
):{samples:{x:number;y:number}[];coverage:number}|null{
  const {x0,x1,y0,y1}=bounds;
  const counts=new Map<string,{r:number;g:number;b:number;n:number;bins:Set<number>}>();
  // Quantize distinctive coloured line pixels. White plots, grid lines and
  // monochrome axis ticks cannot be used as assumed performance data.
  for(let x=x0;x<x1;x+=2){
    for(let y=y0;y<y1;y+=2){
      const p=(y*width+x)*4,r=data[p],g=data[p+1],b=data[p+2];
      const max=Math.max(r,g,b),min=Math.min(r,g,b);
      if(max-min<48 || max<122||min<20||max>247)continue;
      const k=[r>>4,g>>4,b>>4].join(",");
      let v=counts.get(k);
      if(!v){v={r:0,g:0,b:0,n:0,bins:new Set()};counts.set(k,v);}
      v.n++;v.r+=r;v.g+=g;v.b+=b;v.bins.add(Math.floor((x-x0)/16));
    }
  }
  const binCount=Math.ceil((x1-x0)/16);
  const candidates:Colour[]=[...counts.values()]
    .filter(v=>v.n>=25&&v.bins.size>binCount*.24)
    .map(v=>({
      r:v.r/v.n,g:v.g/v.n,b:v.b/v.n,
      count:v.n,coverage:v.bins.size/binCount
    })).sort((a,b)=>b.coverage-a.coverage || b.count-a.count);
  if(!candidates.length)return null;
  const target=candidates[0];
  const raw:{x:number;y:number}[]=[];
  for(let x=x0;x<x1;x+=2){
    const found:number[]=[];
    for(let y=y0;y<y1;y++){
      const p=(y*width+x)*4,r=data[p],g=data[p+1],b=data[p+2];
      const dist=Math.hypot(r-target.r,g-target.g,b-target.b);
      if(dist<47 && Math.max(r,g,b)-Math.min(r,g,b)>38)found.push(y);
    }
    if(found.length>=1&&found.length<=12)
      raw.push({x,y:found[Math.floor(found.length/2)]});
  }
  const coverage=raw.length/Math.max(1,Math.ceil((x1-x0)/2));
  if(coverage<.58||raw.length<45)return null;
  return {samples:raw,coverage};
}
function interpolateCurve(samples:{x:number;y:number}[],x:number):number|null{
  let lo=0,hi=samples.length-1;
  if(x<samples[0].x||x>samples[hi].x)return null;
  while(lo<hi){
    const mid=(lo+hi)>>1;
    if(samples[mid].x<x)lo=mid+1;else hi=mid;
  }
  if(lo===0)return samples[0].y;
  const p=samples[lo-1],q=samples[lo];
  if(q.x-p.x>36)return null;
  return p.y+(q.y-p.y)*(x-p.x)/(q.x-p.x);
}

async function scanPage(page:import("pdfjs-dist/types/src/display/api").PDFPageProxy,
  pageIndex:number):Promise<GrowthResult>{
  const text=await page.getTextContent();
  const pageHeight=page.getViewport({scale:1}).height;
  const anchors:TextAnchor[]=text.items.flatMap(item=>{
    if(!("str" in item)||!item.str.trim()||!item.transform)return[];
    return [{label:item.str.trim(),x:item.transform[4],
      y:pageHeight-item.transform[5],width:item.width??0}];
  });
  const dates=groupDates(anchors);
  if(!dates)return {series:null,reason:"No readable dated x-axis with at least three ticks"};
  const yTicks=groupValueTicks(anchors,dates.y,dates.ticks[0].x);
  if(yTicks.length<3)return {series:null,reason:"No readable euro-value y-axis"};
  const dateFit=lineFit(dates.ticks.map(t=>({x:t.x,y:t.value/86400000})));
  const valueFit=lineFit(yTicks.map(t=>({x:t.y,y:t.value})));
  if(!dateFit||!valueFit||dateFit.slope<=0 ||
    dateFit.r2<.98||valueFit.r2<.98||valueFit.slope>=0)
    return {series:null,reason:"Date/value axes cannot be calibrated reliably"};

  const plotLeft=Math.max(...yTicks.map(t=>t.x))+6;
  const delta=(dates.ticks.at(-1)!.x-dates.ticks[0].x)/(dates.ticks.length-1);
  const plotRight=Math.min(page.getViewport({scale:1}).width-18,
    dates.ticks.at(-1)!.x+Math.max(14,Math.min(30,delta*.65)));
  const top=Math.max(0,Math.min(...yTicks.map(t=>t.y))-4);
  const bottom=Math.min(pageHeight,Math.max(...yTicks.map(t=>t.y))+3);
  if(plotRight-plotLeft<110||bottom-top<48)
    return {series:null,reason:"Growth plot region is too small for digitisation"};

  // Native PDF.js rendering with a Canvas polyfill already used by Omega's OCR
  // scripts. No provider image or original chart is copied into the proposal.
  const {createCanvas}=await import("@napi-rs/canvas");
  const scale=2.15,viewport=page.getViewport({scale});
  const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
  const ctx=canvas.getContext("2d");
  await page.render({
    canvasContext:ctx as unknown as CanvasRenderingContext2D,
    viewport,canvas:canvas as unknown as HTMLCanvasElement
  }).promise;
  const image=ctx.getImageData(0,0,canvas.width,canvas.height);
  const sampled=chooseStrokePixels(image.data,canvas.width,canvas.height,{
    x0:Math.round(plotLeft*scale),x1:Math.round(plotRight*scale),
    y0:Math.round(top*scale),y1:Math.round(bottom*scale)
  });
  if(!sampled)return {series:null,reason:"Source chart line could not be traced unambiguously"};

  const sampleStart=sampled.samples[0].x/scale;
  const sampleEnd=sampled.samples.at(-1)!.x/scale;
  const startDay=(dateFit.intercept+dateFit.slope*sampleStart);
  const endDay=(dateFit.intercept+dateFit.slope*sampleEnd);
  if(endDay-startDay<200||endDay-startDay>365*35)
    return {series:null,reason:"Chart date coverage is outside the supported range"};
  const minDate=new Date(Math.ceil(startDay)*86400000);
  const maxDate=new Date(Math.floor(endDay)*86400000);
  const firstMonth=Date.UTC(minDate.getUTCFullYear(),minDate.getUTCMonth()+1,1);
  const observations:ChartPoint[]=[];
  for(let ms=firstMonth;ms<=maxDate.getTime();){
    const x=((ms/86400000)-dateFit.intercept)/dateFit.slope;
    const py=interpolateCurve(sampled.samples,x*scale);
    if(py!==null){
      const value=valueFit.intercept+valueFit.slope*(py/scale);
      if(Number.isFinite(value)&&value>0&&value<1e8){
        const dt=new Date(ms);
        observations.push({date:dt.toISOString().slice(0,10),value:Math.round(value*100)/100});
      }
    }
    const dt=new Date(ms);
    ms=Date.UTC(dt.getUTCFullYear(),dt.getUTCMonth()+1,1);
  }
  if(observations.length<9)return {series:null,reason:"Insufficient monthly observations could be reconstructed"};
  const first=observations[0].value,last=observations.at(-1)!.value;
  if(first<=0||last<=0||Math.max(...observations.map(v=>v.value))/
      Math.min(...observations.map(v=>v.value))>100)
    return {series:null,reason:"The traced line produces implausible relative values"};
  const confidence=Math.min(0.92,
    .27*dateFit.r2+.27*valueFit.r2+.33*sampled.coverage+.13);
  if(confidence<.73)return {series:null,reason:"Digitisation confidence is insufficient"};
  const sourceLabel=anchors.find(x=>/growth of\s*[€£$]/i.test(x.label))?.label||
    "Historical growth plot from provider PDF";
  return {series:{
    source:"digitized_pdf_graph",sourcePage:pageIndex+1,
    sourceLabel,method:"raster_trace_with_axis_calibration",estimated:true,
    currency:yTicks[0].currency,observations,
    quality:{dateAxisR2:Number(dateFit.r2.toFixed(4)),
      valueAxisR2:Number(valueFit.r2.toFixed(4)),
      pixelCoverage:Number(sampled.coverage.toFixed(3)),
      sampledMonths:observations.length,confidence:Number(confidence.toFixed(3))}
  },reason:"Reconstructed approximate monthly readings from the actual source graph"};
}
export async function digitizePdfGrowthChart(bytes:Uint8Array):Promise<GrowthResult>{
  if(bytes.byteLength<100||bytes.byteLength>3_500_000)
    return {series:null,reason:"PDF exceeds supported source limits"};
  const canvas=await import("@napi-rs/canvas");
  Object.assign(globalThis,{DOMMatrix:canvas.DOMMatrix,ImageData:canvas.ImageData,Path2D:canvas.Path2D});
  const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task=pdfjs.getDocument({
    data:new Uint8Array(bytes),useSystemFonts:true,disableFontFace:true,
    maxImageSize:16_777_216
  });
  try{
    const document=await task.promise;
    let last="No digitizable chart found";
    for(let pageNumber=1;pageNumber<=Math.min(12,document.numPages);pageNumber++){
      const page=await document.getPage(pageNumber);
      try{
        const result=await scanPage(page,pageNumber-1);
        if(result.series)return result;
        last=result.reason;
      }finally{page.cleanup();}
    }
    return {series:null,reason:last};
  }finally{await task.destroy();}
}
