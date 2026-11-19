import {neon} from "@neondatabase/serverless";
if(process.env.VERCEL_ENV!=="production")process.exit(0);
const sql=neon(process.env.DATABASE_URL);
const files=await sql.query("SELECT data->>'providerHint' AS provider, data->'performance' AS perf FROM fund_source_factsheets WHERE status='parsed'");
const recs=await sql.query("SELECT provider,evidence,reported_returns FROM fund_reconciliations");
const providers=["Aviva","Zurich","Standard Life","New Ireland"];
const summary=Object.fromEntries(providers.map(provider=>{
 const docs=files.filter(r=>r.provider===provider),runs=recs.filter(r=>r.provider===provider);
 return [provider,{
  sourcePdfs:docs.length,
  performanceTables:docs.filter(r=>r.perf?.status==="extracted").length,
  unsupportedOrUnreadable:docs.filter(r=>r.perf?.status==="not_published").length,
  needsReview:docs.filter(r=>r.perf?.status==="needs_review").length,
  fundsUsingPdf: runs.filter(r=>r.evidence?.displayedReturnsSource==="official_factsheet_pdf").length
 }];
}));
console.log("OMEGA_PDF_RETURNS_SUMMARY",JSON.stringify({
  sourcePdfs:files.length,funds:recs.length,
  usingPdf:recs.filter(r=>r.evidence?.displayedReturnsSource==="official_factsheet_pdf").length,
  usingWorkbook:recs.filter(r=>r.evidence?.displayedReturnsSource==="performance_workbook").length,
  providers:summary
}));
