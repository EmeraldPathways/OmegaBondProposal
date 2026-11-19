import { neon } from "@neondatabase/serverless";
import { get } from "@vercel/blob";
import { getDocumentProxy, extractText } from "unpdf";
if(process.env.VERCEL_ENV!=="production") process.exit(0);
const sql=neon(process.env.DATABASE_URL);
const rows=await sql.query("SELECT i.filename,i.storage_key,f.data FROM fund_source_factsheets f JOIN imports i ON i.id=f.import_id WHERE f.status='parsed' AND f.data->>'title' IS NOT NULL ORDER BY i.uploaded_at DESC");
const groups=["Aviva","Zurich","Standard Life","New Ireland"];
for(const provider of groups){
 const group=rows.filter(r=>r.data?.providerHint===provider);
 console.log("OMEGA_PDF_LAYOUT_GROUP",JSON.stringify({provider,count:group.length}));
 for(const item of group.slice(0,5)){
  try{
   const res=await get(String(item.storage_key),{access:"private"});
   if(!res||res.statusCode!==200)throw Error("Blob missing");
   const raw=new Uint8Array(await new Response(res.stream).arrayBuffer());
   const doc=await getDocumentProxy(raw);
   const value=await extractText(doc);
   const txt=(Array.isArray(value.text)?value.text.join("\n"):value.text)||"";
   const lines=txt.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
   let matches=lines.map((line,i)=>({line,i})).filter(o=>/annualis|total return|growth of|calendar year|cumulative|fund performance|performance %|performance table|performance to|performance figures|performance data|1 year|1y|10 year|10y|yr1|return %/i.test(o.line));
   let sampled=matches.slice(0,9).map(x=>({index:x.i,fragment:lines.slice(Math.max(0,x.i-2),Math.min(lines.length,x.i+5)).join(" / ").slice(0,390)}));
   console.log("OMEGA_PDF_LAYOUT_CASE",JSON.stringify({provider,title:item.data?.title,filename:item.filename,pageCount:doc.numPages,textLength:txt.length,first:lines.slice(0,14).join(" / ").slice(0,850),sampled}));
   await doc.destroy();
  }catch(e){console.log("OMEGA_PDF_LAYOUT_ERROR",JSON.stringify({provider,error:String(e?.message||e).slice(0,125)}))}
 }
}
