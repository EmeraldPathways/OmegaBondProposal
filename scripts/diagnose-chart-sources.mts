/**
 * Read-only production build probe: sample one uploaded factsheet per provider
 * and verify the chart digitizer can identify the dated graph. Never writes.
 */
import {neon} from "@neondatabase/serverless";
import {get} from "@vercel/blob";
import {digitizePdfGrowthChart} from "../src/lib/reconciliation/chart-digitize.ts";
if(process.env.VERCEL_ENV!=="production"){
  console.log("[Omega graph probe] skipped outside production.");
  process.exit(0);
}
if(!process.env.DATABASE_URL||!process.env.BLOB_STORE_ID){
  console.log("[Omega graph probe] unavailable: database or private blob environment missing.");
  process.exit(0);
}
try{
  const sql=neon(process.env.DATABASE_URL);
  const rows=await sql.query(
    "SELECT DISTINCT ON (r.provider) r.provider,r.approved_name,i.storage_key "+
    "FROM fund_reconciliations r JOIN imports i ON i.id=r.factsheet_import_id "+
    "WHERE r.evidence->>'matchBasis'='unique_provider_qualified_filename' "+
    "ORDER BY r.provider,CASE WHEN r.approved_name ILIKE '%ESG 60%' THEN 0 ELSE 1 END,r.approved_name"
  );
  for(const row of rows){
    try{
      const result=await get(String(row.storage_key),{access:"private"});
      if(!result||result.statusCode!==200)throw Error("Private blob fetch failed");
      const bytes=new Uint8Array(await new Response(result.stream).arrayBuffer());
      const outcome=await digitizePdfGrowthChart(bytes);
      console.log("[Omega graph probe] "+row.provider+" "+row.approved_name+
        ": "+(outcome.series?
          "GRAPH FOUND "+outcome.series.observations.length+" monthly samples, quality="+
          outcome.series.quality.confidence+" page="+outcome.series.sourcePage:
          "REVIEW "+outcome.reason));
    }catch(e){
      console.log("[Omega graph probe] "+row.provider+": sample check failed ("+
        (e instanceof Error?e.name:"error")+")");
    }
  }
}catch(e){
  console.log("[Omega graph probe] sample audit unavailable ("+
    (e instanceof Error?e.name:"error")+")");
}
