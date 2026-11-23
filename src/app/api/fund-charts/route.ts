import {get} from "@vercel/blob";
import {NextResponse} from "next/server";
import {auth,ADMIN_EMAIL,isLoginConfigured} from "@/auth";
import {getNeonSql} from "@/lib/server/neon";
import {digitizePdfGrowthChart} from "@/lib/reconciliation/chart-digitize";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};

async function authorised(){
  return isLoginConfigured() &&
    (await auth())?.user?.email?.toLowerCase()===ADMIN_EMAIL;
}
async function ensure(){
  const sql=getNeonSql();
  await sql.query("CREATE TABLE IF NOT EXISTS fund_chart_series ("+
    "fund_id text PRIMARY KEY, factsheet_import_id uuid NOT NULL REFERENCES imports(id) ON DELETE CASCADE,"+
    "status text NOT NULL, series jsonb, error_message text,"+
    "processed_at timestamptz NOT NULL DEFAULT now())");
}
async function progress(){
  const sql=getNeonSql();
  const rows=await sql.query([
    "SELECT",
    "(SELECT COUNT(*)::int FROM fund_reconciliations r",
    " JOIN fund_active_names n ON n.fund_id=r.fund_id",
    " WHERE r.factsheet_import_id IS NOT NULL",
    " AND r.evidence->>'matchBasis'='unique_provider_qualified_filename') AS total,",
    "(SELECT COUNT(*)::int FROM fund_chart_series s",
    " JOIN fund_reconciliations r ON r.fund_id=s.fund_id",
    " WHERE s.factsheet_import_id=r.factsheet_import_id) AS processed,",
    "(SELECT COUNT(*)::int FROM fund_chart_series s",
    " JOIN fund_reconciliations r ON r.fund_id=s.fund_id",
    " WHERE s.factsheet_import_id=r.factsheet_import_id AND s.status='digitized') AS ready,",
    "(SELECT COUNT(*)::int FROM fund_chart_series s",
    " JOIN fund_reconciliations r ON r.fund_id=s.fund_id",
    " WHERE s.factsheet_import_id=r.factsheet_import_id AND s.status='needs_review') AS needs_review"
  ].join(" "));
  const summary=rows[0];
  return {total:Number(summary.total),processed:Number(summary.processed),
    ready:Number(summary.ready),needsReview:Number(summary.needs_review)};
}
export async function GET(){
  if(!await authorised())return NextResponse.json({error:"Unauthorised"},{status:401,headers});
  try{
    await ensure();
    const sql=getNeonSql();
    const [counts,exceptions]=await Promise.all([
      progress(),
      sql.query("SELECT r.approved_name AS name,s.error_message AS reason "+
        "FROM fund_chart_series s JOIN fund_reconciliations r ON r.fund_id=s.fund_id "+
        "WHERE s.factsheet_import_id=r.factsheet_import_id AND s.status='needs_review' "+
        "ORDER BY r.approved_name LIMIT 30")
    ]);
    return NextResponse.json({...counts,exceptions,
      hasMore:counts.processed<counts.total,
      caveat:"Digitized curves are approximate reconstructions of plotted PDF graphs, not verified monthly unit prices. Exported source returns remain workbook-only."
    },{headers});
  }catch{
    return NextResponse.json({error:"Could not read the fund chart cache."},{status:500,headers});
  }
}
export async function POST(request:Request){
  if(!await authorised())return NextResponse.json({error:"Unauthorised"},{status:401,headers});
  if(request.headers.get("origin")!==new URL(request.url).origin)
    return NextResponse.json({error:"Invalid request origin"},{status:403,headers});
  try{
    await ensure();
    const sql=getNeonSql();
    const body=await request.json().catch(()=>({}));
    const preferred=Array.isArray(body.fundIds)?
      body.fundIds.filter((id:unknown)=>typeof id==="string"&&id.length<120).slice(0,30):[];
    const targets=await sql.query([
      "SELECT r.fund_id,r.approved_name AS name,r.factsheet_import_id::text AS pdf_id,",
      "i.storage_key FROM fund_reconciliations r",
      "JOIN fund_active_names n ON n.fund_id=r.fund_id",
      "JOIN imports i ON i.id=r.factsheet_import_id",
      "LEFT JOIN fund_chart_series c ON c.fund_id=r.fund_id",
      " AND c.factsheet_import_id=r.factsheet_import_id",
      "WHERE r.factsheet_import_id IS NOT NULL",
      "AND r.evidence->>'matchBasis'='unique_provider_qualified_filename'",
      "AND c.fund_id IS NULL",
      "ORDER BY CASE WHEN r.fund_id=ANY($1::text[]) THEN 0 ELSE 1 END,",
      "r.provider,r.approved_name LIMIT 2"
    ].join(" "),[preferred]);
    const completed:{name:string;status:string;reason:string}[]=[];
    for(const target of targets){
      let status="needs_review",reason="Chart could not be digitized from source";
      let series:null|object=null;
      try{
        const blob=await get(String(target.storage_key),{access:"private"});
        if(!blob||blob.statusCode!==200)throw new Error("Original private PDF is unavailable");
        const bytes=new Uint8Array(await new Response(blob.stream).arrayBuffer());
        const traced=await digitizePdfGrowthChart(bytes);
        series=traced.series;
        reason=traced.reason;
        if(series)status="digitized";
      }catch(error){
        reason=error instanceof Error?
          ("PDF chart extraction error: "+error.message).slice(0,250):
          "PDF chart extraction failed";
      }
      await sql.query(
        "INSERT INTO fund_chart_series(fund_id,factsheet_import_id,status,series,error_message) "+
        "VALUES($1,$2::uuid,$3,$4::jsonb,$5) "+
        "ON CONFLICT(fund_id) DO UPDATE SET "+
        "factsheet_import_id=EXCLUDED.factsheet_import_id,status=EXCLUDED.status,"+
        "series=EXCLUDED.series,error_message=EXCLUDED.error_message,processed_at=now()",
        [target.fund_id,target.pdf_id,status,series?JSON.stringify(series):null,
          status==="digitized"?null:reason]
      );
      completed.push({name:String(target.name),status,reason});
    }
    const counts=await progress();
    return NextResponse.json({...counts,completed,hasMore:counts.processed<counts.total},
      {headers});
  }catch{
    console.error("Omega stored graph extraction request failed.");
    return NextResponse.json({error:"Unable to process the next provider charts."},
      {status:500,headers});
  }
}
