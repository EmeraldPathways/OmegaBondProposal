/** One-time read-only export of provider factsheet fields for editorial review.
 * Payload contains public fund factsheet text only. It never writes to Neon.
 */
import {neon} from "@neondatabase/serverless";
if(process.env.VERCEL_ENV!=="production"||!process.env.DATABASE_URL){
 console.log("OMEGA_RICH_UNAVAILABLE");
}else{
 const sql=neon(process.env.DATABASE_URL);
 const rows=await sql.query(
  "SELECT n.fund_id,n.provider,n.name,i.filename,s.status AS source_status,s.data AS source_data "+
  "FROM fund_active_names n "+
  "LEFT JOIN fund_reconciliations r ON r.fund_id=n.fund_id "+
  "LEFT JOIN imports i ON i.id=r.factsheet_import_id "+
  "LEFT JOIN fund_source_factsheets s ON s.import_id=r.factsheet_import_id "+
  "ORDER BY n.provider,n.name"
 );
 console.log("OMEGA_RICH_START|"+rows.length);
 for(let idx=0;idx<rows.length;idx++){
   const row=rows[idx];
   const p=(row.source_status==="parsed"?(row.source_data??{}):{}) as Record<string,unknown>;
   const str=(key:string,max=1800)=>typeof p[key]==="string"?
     (p[key] as string).slice(0,max):"";
   const arr=(key:string)=>Array.isArray(p[key])?
     (p[key] as unknown[]).filter((x):x is string=>typeof x==="string").slice(0,15):[];
   const record={
     number:idx+1,id:String(row.fund_id),provider:String(row.provider),
     name:String(row.name),filename:String(row.filename??""),asOf:str("asOf",80),
     riskProfile:str("riskProfile",130),managedBy:str("managedBy",320),
     managementStyle:str("managementStyle",320),assetMix:str("assetMix",470),
     taxStatus:str("taxStatus",80),equityRange:str("equityRange",110),
     sfdrClass:str("sfdrClass",110),baseCurrency:str("baseCurrency",30),
     objective:str("objective"),description:str("description"),
     strategy:str("strategy"),riskFactors:arr("riskFactors"),
     riskDisclosure:str("riskDisclosure",1000),
     chargesDisclosure:str("chargesDisclosure",1000),
     warnings:arr("extractionWarnings"),
     rawSample:idx===8||idx===9?str("sourceText",700):""
   };
   const value=JSON.stringify(record);
   const length=800,parts=Math.ceil(value.length/length);
   for(let part=0;part<parts;part++)
     console.log("OMEGA_RICH|"+(idx+1)+"|"+(part+1)+"|"+parts+"|"+
       value.slice(part*length,(part+1)*length));
 }
 console.log("OMEGA_RICH_END|"+rows.length);
}
