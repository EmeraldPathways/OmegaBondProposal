import {neon} from "@neondatabase/serverless";
if(process.env.VERCEL_ENV!=="production"||!process.env.DATABASE_URL){
  console.log("OMEGA_APPROVAL_SUMMARY_SKIP nonproduction");process.exit(0);
}
const sql=neon(process.env.DATABASE_URL);
const rows=await sql.query([
"SELECT provider,status,",
"COALESCE((evidence->>'factsheetIdentityApproved')::boolean,false) AS pdf_auto,",
"COALESCE((evidence->>'seriesIdentityApproved')::boolean,false) AS series_auto",
"FROM fund_reconciliations"
].join(" "));
const providers=["Aviva","Zurich","Standard Life","New Ireland"];
const summary={
  total:rows.length,autoApprovedFactsheets:rows.filter(r=>r.pdf_auto).length,
  autoApprovedCompleteIdentities:rows.filter(r=>r.status==="auto_approved").length,
  manualQueue:rows.filter(r=>r.status!=="auto_approved").length,
  providers:Object.fromEntries(providers.map(p=>{
    const xs=rows.filter(r=>r.provider===p);
    return [p,{funds:xs.length,autoFactsheets:xs.filter(r=>r.pdf_auto).length,
      autoComplete:xs.filter(r=>r.status==="auto_approved").length,
      needSeriesReview:xs.filter(r=>r.pdf_auto && r.status!=="auto_approved").length}];
  }))
};
console.log("OMEGA_APPROVAL_SUMMARY",JSON.stringify(summary));
