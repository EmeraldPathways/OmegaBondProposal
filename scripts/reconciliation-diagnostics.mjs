import { neon } from "@neondatabase/serverless";
const sql=neon(process.env.DATABASE_URL);
const [files,rows]=await Promise.all([
 sql.query("SELECT data FROM fund_source_factsheets WHERE status='parsed' AND data IS NOT NULL"),
 sql.query("SELECT provider,approved_name,status,confidence,selected_source_name,extracted_factsheet,reason FROM fund_reconciliations ORDER BY provider,approved_name")
]);
const samples=files.map(r=>r.data);
const providers=["Aviva","Zurich","New Ireland","Standard Life"];
for(const provider of providers){
 const fp=samples.filter(r=>r.providerHint===provider);
 const rs=rows.filter(r=>r.provider===provider);
 const counts=Object.fromEntries(["auto_matched","needs_review","unmatched"].map(s=>[s,rs.filter(r=>r.status===s).length]));
 console.log("OMEGA_DIAG_PROVIDER",JSON.stringify({provider,
  factsheets:fp.length,withTitle:fp.filter(r=>r.title).length,
  withMoneyMate:fp.filter(r=>r.moneyMateId).length,
  withObjectives:fp.filter(r=>r.objective).length,
  withCharts:fp.filter(r=>r.chartReferences?.length).length,
  reviews:rs.length,withMatchedFactsheet:rs.filter(r=>r.extracted_factsheet).length,
  withWorkbookRow:rs.filter(r=>r.selected_source_name).length,...counts
 }));
 console.log("OMEGA_DIAG_SAMPLE",JSON.stringify({provider,rows:rs.slice(0,12).map(r=>({
  approved:r.approved_name,workbook:r.selected_source_name,pdf:r.extracted_factsheet?.title??null,
  confidence:r.confidence,status:r.status
 }))}));
 console.log("OMEGA_DIAG_DOCUMENTS",JSON.stringify({provider,examples:fp.slice(0,4).map(x=>({
  title:x.title??null,filename:x.filename,topWarnings:x.extractionWarnings?.slice(0,2)??[]
 }))}));
}
console.log("OMEGA_DIAG_UNMATCHED",JSON.stringify(rows.filter(r=>r.status==="unmatched").map(r=>({provider:r.provider,name:r.approved_name}))));
