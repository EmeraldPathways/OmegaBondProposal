/** Temporary, read-only export of source-backed description review candidates.
 * Log records contain only published fund factsheet copy, not account secrets.
 * Remove this one-off build step after the review document is created.
 */
import {neon} from "@neondatabase/serverless";
import {fundCardNarrative} from "../src/lib/pdf/fund-detail-layout.ts";
if(process.env.VERCEL_ENV!=="production"||!process.env.DATABASE_URL){
  console.log("OMEGA_REVIEW_EXPORT_UNAVAILABLE");
}else{
 const sql=neon(process.env.DATABASE_URL);
 const rows=await sql.query(
  "SELECT n.provider,n.name,i.filename,s.status AS source_status,s.data AS source_data "+
  "FROM fund_active_names n "+
  "LEFT JOIN fund_reconciliations r ON r.fund_id=n.fund_id "+
  "LEFT JOIN imports i ON i.id=r.factsheet_import_id "+
  "LEFT JOIN fund_source_factsheets s ON s.import_id=r.factsheet_import_id "+
  "ORDER BY n.provider,n.name"
 );
 console.log("OMEGA_REVIEW_EXPORT_START|"+rows.length);
 for(let index=0;index<rows.length;index++){
  const row=rows[index];
  const source=(row.source_status==="parsed"?(row.source_data??{}):{}) as Record<string,any>;
  const draft=fundCardNarrative(source).find(x=>x.label==="Fund description")?.text??"";
  const valid=!!draft&&draft!=="Information unavailable.";
  const objective=typeof source.objective==="string"?source.objective.trim():"";
  const description=typeof source.description==="string"?source.description.trim():"";
  const strategy=typeof source.strategy==="string"?source.strategy.trim():"";
  const data={
    number:index+1,provider:String(row.provider),name:String(row.name),
    sourceFilename:typeof row.filename==="string"?row.filename:"",
    sourceDate:typeof source.asOf==="string"?source.asOf:"",
    draft:valid?draft:"",
    sourceObjective:objective,
    sourceDescription:description!==objective?description:"",
    sourceStrategy:strategy,
    status:valid?"DRAFT — EDIT / APPROVE":"NEEDS REVIEW — NO COMPLETE SOURCE SENTENCE"
  };
  console.log("OMEGA_REVIEW_EXPORT|"+JSON.stringify(data));
 }
 console.log("OMEGA_REVIEW_EXPORT_END|"+rows.length);
}
