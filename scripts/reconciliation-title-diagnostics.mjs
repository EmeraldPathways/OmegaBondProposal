import {neon} from "@neondatabase/serverless";
import {get} from "@vercel/blob";
import {getDocumentProxy,extractText} from "unpdf";
if(process.env.VERCEL_ENV!=="production")process.exit(0);
const sql=neon(process.env.DATABASE_URL);
const x=await sql.query("SELECT i.filename,i.storage_key,f.data FROM fund_source_factsheets f JOIN imports i ON i.id=f.import_id WHERE f.status='parsed'");
const byProvider={};
for(const r of x){const p=r.data?.providerHint??"Unknown";const v=byProvider[p]??={total:0,missing:[]};v.total++;if(!r.data?.title)v.missing.push(r);}
for(const [p,v] of Object.entries(byProvider)){
 console.log("OMEGA_TITLE_STATS",JSON.stringify({provider:p,total:v.total,missing:v.missing.length}));
 for(const f of v.missing.slice(0,12)){
  try{
   const response=await get(String(f.storage_key),{access:"private"});
   const doc=await getDocumentProxy(new Uint8Array(await new Response(response.stream).arrayBuffer()));
   const t=await extractText(doc);const text=Array.isArray(t.text)?String(t.text[0]):String(t.text);
   const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
   console.log("OMEGA_MISSING_TITLE",JSON.stringify({provider:p,file:f.filename,firstLines:lines.slice(0,15).map(s=>s.slice(0,110))}));
   await doc.destroy();
  }catch(e){console.log("OMEGA_MISSING_TITLE_ERROR",JSON.stringify({provider:p,file:f.filename,error:String(e?.message??e).slice(0,100)}));}
 }
}
