import {neon} from "@neondatabase/serverless";
if(process.env.VERCEL_ENV!=="production")process.exit(0);
const sql=neon(process.env.DATABASE_URL);
const rows=await sql.query("SELECT provider,approved_name,status,confidence,selected_source_name,extracted_factsheet->>'title' AS pdf_title,evidence->'matchScores' AS scores,evidence->'candidateFactsheets' AS alternatives,evidence->'candidatePerformanceRows' AS perf_alternatives FROM fund_reconciliations ORDER BY provider,approved_name");
for(const provider of ["Aviva","Zurich","Standard Life","New Ireland"]){
  const cases=rows.filter(r=>r.provider===provider);
  console.log("OMEGA_AUDIT_PROVIDER",JSON.stringify({provider,count:cases.length,auto:cases.filter(r=>r.status==="auto_approved").length}));
  for(const x of cases){
    if(x.status==="auto_approved")continue;
    console.log("OMEGA_AUDIT_ROW",JSON.stringify({
      p:provider,f:x.approved_name,st:x.status,sc:Number(x.confidence),
      pdf:x.pdf_title??null,row:x.selected_source_name??null,
      c:x.scores??null,
      otherPdf:(Array.isArray(x.alternatives)?x.alternatives:[]).slice(0,2).map(v=>({t:v.title,sc:v.score})),
      otherRow:(Array.isArray(x.perf_alternatives)?x.perf_alternatives:[]).slice(0,2).map(v=>({n:v.name,sc:v.score}))
    }));
  }
}
