/** One-time read-only extraction of original provider risk indicators.
 * Read private uploaded PDF bytes inside authorised build; logs public fund
 * labels only, never URL, token or PDF bytes. Data is not persisted.
 */
import {neon} from "@neondatabase/serverless";
import {get} from "@vercel/blob";
import {createCanvas,DOMMatrix,ImageData,Path2D} from "@napi-rs/canvas";

if(process.env.VERCEL_ENV!=="production"||!process.env.DATABASE_URL||
  !process.env.BLOB_STORE_ID){console.log("OMEGA_RISK_SKIPPED");process.exit(0);}
globalThis.DOMMatrix=DOMMatrix;globalThis.ImageData=ImageData;globalThis.Path2D=Path2D;
const {getDocument}=await import("pdfjs-dist/legacy/build/pdf.mjs");
const sql=neon(process.env.DATABASE_URL);
const rows=await sql.query(
  "SELECT n.provider,n.name,i.filename,i.storage_key,f.data,f.status "+
  "FROM fund_active_names n "+
  "LEFT JOIN fund_reconciliations r ON r.fund_id=n.fund_id "+
  "LEFT JOIN imports i ON i.id=r.factsheet_import_id "+
  "LEFT JOIN fund_source_factsheets f ON f.import_id=r.factsheet_import_id "+
  "ORDER BY n.provider,n.name"
);
console.log("OMEGA_RISK_START|"+rows.length);
const ratingCategory=(r:number)=>["","Very Low","Low","Low to Medium",
 "Medium","Medium to High","High","Very High"][r]||"";
function riskContext(source:string){
 const t=source.replace(/\s+/g," ").trim();
 const m=[...t.matchAll(/Risk\s*Profile|Risk\s*Rating|Risk\s*Indicator|Volatility|SRI\b|SRRI\b|At\s+a\s+Glance/gi)].slice(0,8);
 return m.map(x=>t.slice(Math.max(0,x.index-70),Math.min(t.length,x.index+160))).slice(0,7);
}
function pickNewIrelandCategory(source:string){
 const t=source.replace(/\s+/g," ");
 const patterns=[
  /Risk\s*Profile\s*:\s*(Very Low Risk|Low to Medium Risk|Medium to High Risk|Low Risk|Medium Risk|High Risk|Very High Risk)/i,
  /\b(Very Low Risk|Low to Medium Risk|Medium to High Risk|Low Risk|Medium Risk|High Risk|Very High Risk)\s*(?:At\s*a?\s*Glance|Ata\s*Glance|Total\s*Fund\s*Size|Fund\s*Manager)/i,
  /\bNEW\s*IRELAND.S\s*RISK\s*RATING\s*[.:]?\s*(Very Low Risk|Low to Medium Risk|Medium to High Risk|Low Risk|Medium Risk|High Risk|Very High Risk)/i
 ];
 for(const p of patterns){const m=p.exec(t);if(m)return {label:m[1].replace(/\s+/g," "),evidence:m[0].slice(0,160)};}
 return null;
}
async function pdfVisualAviva(bytes:Uint8Array){
 let task=null;
 try{
  task=getDocument({data:bytes,useSystemFonts:true,disableFontFace:true});
  const doc=await task.promise;
  let result:any=null;
  for(let pageNumber=1;pageNumber<=Math.min(doc.numPages,3);pageNumber++){
   const page=await doc.getPage(pageNumber);
   const layer=await page.getTextContent();
   const labels=layer.items.filter((x:any)=>typeof x.str==="string"&&/Risk Rating as at/i.test(x.str));
   if(!labels.length)continue;
   const viewport=page.getViewport({scale:1.55});
   const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
   const ctx=canvas.getContext("2d");
   await page.render({canvasContext:ctx,viewport,canvas}).promise;
   const data=ctx.getImageData(0,0,canvas.width,canvas.height);
   const sample=(x:number,y:number)=>{
    const xx=Math.max(0,Math.min(canvas.width-1,Math.round(x))),yy=Math.max(0,Math.min(canvas.height-1,Math.round(y)));
    const o=(yy*canvas.width+xx)*4;return [data.data[o],data.data[o+1],data.data[o+2]];
   };
   for(const item of labels as any[]){
    const x0=Number(item.transform[4])-12;
    const top=page.view[3]-Number(item.transform[5])-Number(item.height??10);
    let winner:null|{n:number;score:number;offset:number;samples:number[][]}=null;
    for(let offset=21;offset<=51;offset+=2){
     const y=(top+offset)*1.55;
     const colors=Array.from({length:7},(_,i)=>sample((x0+(i+0.5)*45.8)*1.55,y));
     const dark=colors.map(c=>c[0]<65&&c[1]<140&&c[2]>100&&c[2]>c[0]+35);
     if(dark.filter(Boolean).length!==1)continue;
     const ix=dark.findIndex(Boolean);
     const meanLight=colors.filter((_,k)=>k!==ix).reduce((s,c)=>s+c[0],0)/6;
     const diff=meanLight-colors[ix][0];
     if(diff<55)continue;
     if(!winner||winner.score<diff)winner={n:ix+1,score:diff,offset,samples:colors};
    }
    if(winner&&(!result||winner.score>result.score))
      result={rating:winner.n,page:pageNumber,score:Math.round(winner.score),
        evidence:"Highlighted blue segment of 1–7 Risk Rating graphic",
        label:ratingCategory(winner.n)};
   }
  }
  return result;
 }catch(error){return {error:error instanceof Error?error.message.slice(0,120):"render failed"};}
 finally{try{await task?.destroy();}catch{}}
}
let avivaScanned=0,avivaFound=0,downloadErrors=0;
for(let i=0;i<rows.length;i++){
 const row=rows[i] as any,p=row.data??{};
 const provider=String(row.provider),name=String(row.name);
 if(provider!=="Aviva")continue;
 const source=String(p.sourceText??"");
 const risk=p.riskProfile&&String(p.riskProfile).trim()||"";
 const rating=Number.isInteger(p.riskRating)&&p.riskRating>=1&&p.riskRating<=7?p.riskRating:null;
 const qualitative=provider==="New Ireland"?pickNewIrelandCategory(source):null;
 let visual:any=null;
 if(provider==="Aviva"&&row.storage_key){
  avivaScanned++;
  try{
   const blob=await get(String(row.storage_key),{access:"private"});
   if(!blob||blob.statusCode!==200)throw Error("PDF source unavailable");
   const bytes=new Uint8Array(await new Response(blob.stream).arrayBuffer());
   if(bytes.length>4_000_000||bytes.length<2000)throw Error("PDF size outside limits");
   visual=await pdfVisualAviva(bytes);
   if(visual?.rating)avivaFound++;
  }catch(error){downloadErrors++;visual={error:error instanceof Error?error.message.slice(0,100):"download error"};}
 }
 const context=(provider==="New Ireland"||provider==="Zurich"||provider==="Standard Life")?
   riskContext(source).slice(0,5):riskContext(source).slice(0,2);
 const record={
  number:i+1,provider,name,filename:String(row.filename??""),
  parsedTitle:String(p.title??""),factsheetDate:String(p.asOf??""),
  parsedRiskProfile:risk,parsedRiskRating:rating,newIrelandCandidate:qualitative,
  avivaVisual:visual,riskContext:context,
  sourceStatus:String(row.status??""),warnings:Array.isArray(p.extractionWarnings)?p.extractionWarnings.slice(0,4):[]
 };
 const json=JSON.stringify(record),size=800,count=Math.ceil(json.length/size);
 for(let part=0;part<count;part++)
  console.log("OMEGA_RISK|"+(i+1)+"|"+(part+1)+"|"+count+"|"+
    json.slice(part*size,(part+1)*size));
}
console.log("OMEGA_RISK_END|"+JSON.stringify({rows:rows.length,avivaScanned,avivaFound,downloadErrors}));
