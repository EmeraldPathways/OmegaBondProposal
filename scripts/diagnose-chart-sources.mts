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
      if(row.provider==="Aviva"&&!outcome.series){
        const cv=await import("@napi-rs/canvas");
        Object.assign(globalThis,{DOMMatrix:cv.DOMMatrix,ImageData:cv.ImageData,Path2D:cv.Path2D});
        const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
        const task=pdfjs.getDocument({data:new Uint8Array(bytes),disableFontFace:true,useSystemFonts:true});
        try{
          const doc=await task.promise;
          const page=await doc.getPage(1);
          const raw=await page.getTextContent();
          const height=page.getViewport({scale:1}).height;
          const values=raw.items.flatMap(i=>{
            if(!("str" in i)||!i.transform)return[];
            const label=i.str.trim();
            if(!/(?:Jan|Jul|202[0-9]|20[0-9]{2}|['’][0-9]{2}|€)/i.test(label))return[];
            return [{str:label.slice(0,32),x:Math.round(i.transform[4]),
              y:Math.round(height-i.transform[5]),w:Math.round(i.width??0)}];
          });
          console.log("[Omega graph probe] AVIVA_SOURCE_TEXT "+
            JSON.stringify(values.filter(i=>i.x>180&&i.y>270&&i.y<590).slice(0,65)));
        }finally{await task.destroy()}
      }
    }catch(e){
      console.log("[Omega graph probe] "+row.provider+": sample check failed ("+
        (e instanceof Error?e.name:"error")+")");
    }
  }
}catch(e){
  console.log("[Omega graph probe] sample audit unavailable ("+
    (e instanceof Error?e.name:"error")+")");
}
