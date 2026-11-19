import {neon} from "@neondatabase/serverless";
import {get} from "@vercel/blob";
import {extractText,getDocumentProxy} from "unpdf";
const sql=neon(process.env.DATABASE_URL);
const wanted=[
 "Standard Life - Ireland MyFolio Active I.pdf",
 "Standard Life - Euro Global Liquidity.pdf",
 "Zurich - 5 Star 5 Americas.pdf",
 "Zurich - Cautiously Managed.pdf",
 "Zurich - Indexed Top Tech 100.pdf",
 "New Ireland - Alternative Energy Fund.Pdf",
 "New Ireland - Ethical Managed.pdf",
 "New Ireland - iFunds 4.pdf",
 "New Ireland - Goodbody Dividend Income 3.pdf"
];
const rows=await sql.query("SELECT filename,storage_key FROM imports WHERE storage_key LIKE 'funds/factsheets/%'");
for(const target of wanted){
 const f=rows.find(x=>String(x.filename).toLowerCase()===target.toLowerCase());
 if(!f){console.log("OMEGA_SAMPLE_NOT_FOUND",target);continue;}
 try{
  const response=await get(String(f.storage_key),{access:"private"});
  if(!response||response.statusCode!==200)throw new Error("Unavailable");
  const pdf=await getDocumentProxy(new Uint8Array(await new Response(response.stream).arrayBuffer()));
  const out=await extractText(pdf);
  const txt=(Array.isArray(out.text)?out.text[0]:out.text)||"";
  console.log("OMEGA_SAMPLE_TEXT",JSON.stringify({file:target,chars:txt.length,
    head:txt.slice(0,950).replace(/\s*\n\s*/g," | "),
    lines:txt.split(/\n/).slice(0,24).map(x=>x.trim()).filter(Boolean)}));
 }catch(e){console.log("OMEGA_SAMPLE_ERROR",JSON.stringify({file:target,error:String(e?.message||e).slice(0,100)}))}
}
