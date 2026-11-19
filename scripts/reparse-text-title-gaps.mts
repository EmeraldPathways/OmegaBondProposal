import {neon} from "@neondatabase/serverless";
import {get} from "@vercel/blob";
import {extractFundFactsheet} from "../src/lib/reconciliation/factsheet.ts";
if(process.env.VERCEL_ENV!=="production")process.exit(0);
const sql=neon(process.env.DATABASE_URL);
const rows=await sql.query(
  "SELECT f.import_id::text,i.filename,i.storage_key FROM fund_source_factsheets f "+
  "JOIN imports i ON i.id=f.import_id WHERE f.status='parsed' "+
  "AND (f.data->>'title' IS NULL OR f.data->>'title'='')"
);
let recovered=0,remaining=0;
for(const row of rows){
  const source=await get(String(row.storage_key),{access:"private"});
  if(!source||source.statusCode!==200){remaining++;continue;}
  const raw=new Uint8Array(await new Response(source.stream).arrayBuffer());
  try{
    const data=await extractFundFactsheet({importId:String(row.import_id),filename:String(row.filename),data:raw});
    if(!data.title || !data.providerHint){remaining++;continue;}
    await sql.query("UPDATE fund_source_factsheets SET data=$2::jsonb,processed_at=now() WHERE import_id=$1::uuid",
      [row.import_id,JSON.stringify(data)]);
    recovered++;
    console.log("OMEGA_TEXT_TITLE_RECOVERED",JSON.stringify({provider:data.providerHint,title:data.title}));
  }catch(error){remaining++;}
}
console.log("OMEGA_TEXT_TITLE_COMPLETE",JSON.stringify({inspected:rows.length,recovered,remaining}));
