import {get} from "@vercel/blob";
import {NextResponse} from "next/server";
import {auth,ADMIN_EMAIL,isLoginConfigured} from "@/auth";
import {getNeonSql} from "@/lib/server/neon";
import {getDocumentProxy,extractText} from "unpdf";
import {parsePdfPerformance} from "@/lib/reconciliation/pdf-performance";
import type {FactSheetData} from "@/lib/reconciliation/engine";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};

async function permitted(){
  return isLoginConfigured() &&
    (await auth())?.user?.email?.toLowerCase()===ADMIN_EMAIL;
}
async function progress(){
  const sql=getNeonSql();
  const [pdfs,reconciliations]=await Promise.all([
    sql.query([
      "SELECT COUNT(*)::int AS total,",
      "COUNT(*) FILTER(WHERE data->'performance' IS NOT NULL",
      "OR data->>'performanceExtractionError' IS NOT NULL)::int AS processed,",
      "COUNT(*) FILTER(WHERE data->'performance'->>'status'='extracted')::int AS extracted,",
      "COUNT(*) FILTER(WHERE data->>'performanceExtractionError' IS NOT NULL)::int AS failed,",
      "COUNT(*) FILTER(WHERE data->'performance'->>'status'='not_published')::int AS unavailable",
      "FROM fund_source_factsheets WHERE status='parsed'"
    ].join(" ")),
    sql.query([
      "SELECT COUNT(*) FILTER(WHERE evidence->>'displayedReturnsSource'='uploaded_workbook')::int AS published",
      "FROM fund_reconciliations"
    ].join(" "))
  ]);
  const pdf=pdfs[0]??{};
  return {total:Number(pdf.total??0),processed:Number(pdf.processed??0),
    extracted:Number(pdf.extracted??0),failed:Number(pdf.failed??0),
    unavailable:Number(pdf.unavailable??0),
    libraryFunds:Number(reconciliations[0]?.published??0)};
}
export async function GET(){
  if(!await permitted())return NextResponse.json({error:"Unauthorised"},{status:401,headers});
  try{return NextResponse.json(await progress(),{headers})}
  catch{return NextResponse.json({error:"PDF performance progress unavailable."},{status:500,headers})}
}
export async function POST(request:Request){
  if(!await permitted())return NextResponse.json({error:"Unauthorised"},{status:401,headers});
  const origin=request.headers.get("origin");
  if(!origin||origin!==new URL(request.url).origin)
    return NextResponse.json({error:"Invalid request origin."},{status:403,headers});
  let phase:string;
  try{const data=await request.json();phase=String(data?.phase??"")}
  catch{return NextResponse.json({error:"Invalid request."},{status:400,headers})}
  if(phase!=="extract")
    return NextResponse.json({error:"Invalid phase."},{status:400,headers});
  try{
    const sql=getNeonSql();
    if(phase==="extract"){
      const pending=await sql.query([
        "SELECT f.import_id::text,i.storage_key,f.data",
        "FROM fund_source_factsheets f JOIN imports i ON i.id=f.import_id",
        "WHERE f.status='parsed' AND f.data IS NOT NULL",
        "AND f.data->'performance' IS NULL",
        "AND f.data->>'performanceExtractionError' IS NULL",
        "ORDER BY f.import_id LIMIT 3"
      ].join(" "));
      let processed=0;
      for(const row of pending){
        const old=row.data as FactSheetData;
        try{
          const result=await get(String(row.storage_key),{access:"private"});
          if(!result||result.statusCode!==200)throw new Error("Private PDF unavailable.");
          const bytes=new Uint8Array(await new Response(result.stream).arrayBuffer());
          if(bytes.length<6||bytes.length>3_500_000)throw new Error("Unsupported PDF size.");
          const proxy=await getDocumentProxy(bytes);
          const extracted=await extractText(proxy);
          const pages=Array.isArray(extracted.text)?extracted.text:[extracted.text];
          const perf=parsePdfPerformance({provider:old.providerHint,title:old.title,pages});
          await sql.query(
            "UPDATE fund_source_factsheets SET data=$2::jsonb,processed_at=now() WHERE import_id=$1::uuid",
            [row.import_id,JSON.stringify({...old,performance:perf})]
          );
        }catch(error){
          const kind=error instanceof Error?error.name:"UnknownError";
          console.error("PDF performance source extraction failed",kind);
          await sql.query([
            "UPDATE fund_source_factsheets SET",
            "data=jsonb_set(data,'{performanceExtractionError}',to_jsonb($2::text),true),",
            "processed_at=now() WHERE import_id=$1::uuid"
          ].join(" "),[row.import_id,kind]);
        }
        processed++;
      }
      const current=await progress();
      return NextResponse.json({...current,phase,justProcessed:processed,
        hasMore:current.processed<current.total},{headers});
    }
    // The PDF archive may be exported for reference but can never publish old
    // PDF returns over the corrected performance workbook.
    return NextResponse.json({error:"PDF returns cannot replace workbook returns."},
      {status:409,headers});
  }catch(error){
    console.error("Official PDF performance stage failed",error instanceof Error?error.name:"Unknown");
    return NextResponse.json({error:"Unable to process original PDF performance. Inspect source documents and retry."},{status:500,headers});
  }
}
