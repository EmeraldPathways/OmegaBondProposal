import { NextResponse } from "next/server";
import { z } from "zod";
import { auth, ADMIN_EMAIL, isLoginConfigured } from "@/auth";
import { getNeonSql } from "@/lib/server/neon";
import { APPROVED_FUNDS } from "@/lib/approved-funds";
import { similarity, matchScore } from "@/lib/reconciliation/engine";
import type { FactSheetData, ReportedReturns } from "@/lib/reconciliation/engine";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const noStore={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const input=z.discriminatedUnion("decision",[
  z.object({
    decision:z.literal("confirmed"),
    factsheetImportId:z.string().regex(uuid),
    performanceImportId:z.string().regex(uuid).nullable().optional(),
    performanceRow:z.number().int().positive().max(10000).nullable().optional(),
    note:z.string().trim().max(800).default("")
  }),
  z.object({decision:z.literal("rejected"),note:z.string().trim().min(3).max(800)}),
  z.object({decision:z.literal("reset")})
]);

async function permitted(){
  return isLoginConfigured() && (await auth())?.user?.email?.toLowerCase()===ADMIN_EMAIL;
}
async function ensureTable(){
  const sql=getNeonSql();
  await sql.query("CREATE TABLE IF NOT EXISTS fund_identity_reviews ("+
    "fund_id text PRIMARY KEY,"+
    "decision text NOT NULL CHECK (decision IN ('confirmed','rejected')),"+
    "factsheet_import_id uuid REFERENCES imports(id),"+
    "performance_import_id uuid REFERENCES imports(id),"+
    "performance_row integer,"+
    "score_at_review numeric(6,3),"+
    "reviewer_email text NOT NULL,"+
    "note text NOT NULL DEFAULT '',"+
    "reviewed_at timestamptz NOT NULL DEFAULT now())");
}

export async function GET(_request:Request,{params}:{params:Promise<{fundId:string}>}){
  if(!await permitted())return NextResponse.json({error:"Unauthorised"},{status:401,headers:noStore});
  const {fundId}=await params;
  const fund=APPROVED_FUNDS.find(f=>f.id===fundId);
  if(!fund)return NextResponse.json({error:"Fund not found."},{status:404,headers:noStore});
  try{
    const sql=getNeonSql();
    const [reconciled,source,manualTable]=await Promise.all([
      sql.query("SELECT factsheet_import_id::text,performance_import_id::text,selected_workbook_row FROM fund_reconciliations WHERE fund_id=$1 LIMIT 1",[fundId]),
      sql.query("SELECT import_id::text FROM fund_source_performance WHERE provider=$1 ORDER BY import_id DESC LIMIT 1",[fund.provider]),
      sql.query("SELECT to_regclass('public.fund_identity_reviews') IS NOT NULL AS exists")
    ]);
    const selectedImport=String(reconciled[0]?.performance_import_id??source[0]?.import_id??"");
    const [rows,pdfs,manual]=await Promise.all([
      selectedImport?sql.query(
        "SELECT import_id::text,row_number,source_name,reported_returns FROM fund_source_performance WHERE provider=$1 AND import_id=$2::uuid ORDER BY row_number",
        [fund.provider,selectedImport]):Promise.resolve([]),
      sql.query("SELECT import_id::text,data FROM fund_source_factsheets WHERE status='parsed' AND data->>'providerHint'=$1 AND nullif(data->>'title','') IS NOT NULL",[fund.provider]),
      manualTable[0]?.exists?sql.query(
        "SELECT decision,factsheet_import_id::text,performance_import_id::text,performance_row,score_at_review::float, note, reviewed_at::text FROM fund_identity_reviews WHERE fund_id=$1",
        [fundId]):Promise.resolve([])
    ]);
    const pdfOptions=pdfs.map(item=>{
      const data=item.data as FactSheetData;
      return {
        id:String(item.import_id),title:String(data.title),filename:String(data.filename),
        moneyMateId:data.moneyMateId??null,
        performance:data.performance??null,
        score:Math.round(similarity(fund.name,String(data.title))*100)
      };
    }).sort((a,b)=>b.score-a.score || a.title.localeCompare(b.title));
    const topPdf=pdfOptions[0];
    const rowOptions=rows.map(item=>{
      const name=String(item.source_name);
      return {
        importId:String(item.import_id),row:Number(item.row_number),name,
        returns:item.reported_returns as ReportedReturns,
        score:Math.round(similarity(topPdf?.title??fund.name,name)*100)
      };
    }).sort((a,b)=>b.score-a.score || a.name.localeCompare(b.name));
    return NextResponse.json({
      fund:{id:fund.id,provider:fund.provider,name:fund.name},
      automatic:{factsheetImportId:reconciled[0]?.factsheet_import_id??null,
        performanceImportId:reconciled[0]?.performance_import_id??null,
        performanceRow:reconciled[0]?.selected_workbook_row??null},
      manual:manual[0]??null,pdfs:pdfOptions,rows:rowOptions,
      note:"Match scores measure name/evidence similarity, not a probability of accuracy. Confirming identity does not approve returns for a client document."
    },{headers:noStore});
  }catch{
    console.error("Omega fund review options failed.");
    return NextResponse.json({error:"Unable to load the source choices."},{status:500,headers:noStore});
  }
}

export async function POST(request:Request,{params}:{params:Promise<{fundId:string}>}){
  if(!await permitted())return NextResponse.json({error:"Unauthorised"},{status:401,headers:noStore});
  const origin=request.headers.get("origin");
  if(!origin || origin!==new URL(request.url).origin)
    return NextResponse.json({error:"Invalid request origin."},{status:403,headers:noStore});
  const {fundId}=await params;
  const fund=APPROVED_FUNDS.find(f=>f.id===fundId);
  if(!fund)return NextResponse.json({error:"Fund not found."},{status:404,headers:noStore});
  try{
    const raw=await request.text();
    if(raw.length>4000)return NextResponse.json({error:"Review input is too long."},{status:413,headers:noStore});
    const data=input.parse(JSON.parse(raw));
    await ensureTable();
    const sql=getNeonSql();
    if(data.decision==="reset"){
      await sql.query("DELETE FROM fund_identity_reviews WHERE fund_id=$1",[fundId]);
      return NextResponse.json({decision:"pending",returnsApproved:false},{headers:noStore});
    }
    if(data.decision==="rejected"){
      await sql.query(
        "INSERT INTO fund_identity_reviews (fund_id,decision,reviewer_email,note,reviewed_at) "+
        "VALUES ($1,'rejected',$2,$3,now()) "+
        "ON CONFLICT (fund_id) DO UPDATE SET decision='rejected',"+
        "factsheet_import_id=NULL,performance_import_id=NULL,performance_row=NULL,"+
        "score_at_review=NULL,reviewer_email=EXCLUDED.reviewer_email,note=EXCLUDED.note,reviewed_at=now()",
        [fundId,ADMIN_EMAIL,data.note]);
      return NextResponse.json({decision:"rejected",returnsApproved:false},{headers:noStore});
    }
    const hasWorkbook=Boolean(data.performanceImportId&&data.performanceRow!=null);
    if(Boolean(data.performanceImportId)!==Boolean(data.performanceRow!=null))
      return NextResponse.json({error:"Choose both a workbook and row, or neither."},
        {status:400,headers:noStore});
    const [factRows,perfRows]=await Promise.all([
      sql.query("SELECT data FROM fund_source_factsheets "+
        "WHERE import_id=$1::uuid AND status='parsed' AND data->>'providerHint'=$2 "+
        "AND nullif(data->>'title','') IS NOT NULL LIMIT 1",
        [data.factsheetImportId,fund.provider]),
      hasWorkbook?sql.query("SELECT source_name,reported_returns FROM fund_source_performance "+
        "WHERE import_id=$1::uuid AND row_number=$2 AND provider=$3 LIMIT 1",
        [data.performanceImportId,data.performanceRow,fund.provider]):Promise.resolve([])
    ]);
    if(!factRows.length || (hasWorkbook&&!perfRows.length))
      return NextResponse.json({error:"The selected PDF or optional workbook reference is unavailable."},
        {status:422,headers:noStore});
    const title=(factRows[0].data as FactSheetData).title!;
    const workbookName=hasWorkbook?String(perfRows[0].source_name):null;
    const scores=workbookName?matchScore(fund.name,title,workbookName):
      {score:similarity(fund.name,title),classConsistent:true};
    if((scores.score<0.60 || !scores.classConsistent) && data.note.trim().length<8)
      return NextResponse.json({
        error:"Explain the discrepancy in your review note before confirming a low-score or share-class-conflicting match."
      },{status:422,headers:noStore});

    // A reviewer may override heuristic similarity; preserve scores and their
    // explicit decision. Prevent accidental assignments to two distinct funds.
    const sameSeries=hasWorkbook?await sql.query(
      "SELECT fund_id FROM fund_identity_reviews WHERE fund_id<>$1 AND decision='confirmed' "+
      "AND performance_import_id=$2::uuid AND performance_row=$3 LIMIT 1",
      [fundId,data.performanceImportId,data.performanceRow]):[];
    if(sameSeries.length)return NextResponse.json({
      error:"This published performance series is already confirmed for another shortlisted fund. Resolve that assignment first."
    },{status:409,headers:noStore});
    const sharedPdf=await sql.query(
      "SELECT fund_id FROM fund_identity_reviews WHERE fund_id<>$1 AND decision='confirmed' "+
      "AND factsheet_import_id=$2::uuid LIMIT 1",
      [fundId,data.factsheetImportId]);
    // Distinct instrument share classes can use the same umbrella factsheet,
    // but a reviewer must document why two approved funds share the PDF.
    if(sharedPdf.length && data.note.trim().length<20)return NextResponse.json({
      error:"Another fund uses this factsheet. Explain why it also applies to this distinct share class (at least 20 characters)."
    },{status:422,headers:noStore});

    await sql.query(
      "INSERT INTO fund_identity_reviews("+
      "fund_id,decision,factsheet_import_id,performance_import_id,performance_row,"+
      "score_at_review,reviewer_email,note,reviewed_at) "+
      "VALUES ($1,'confirmed',$2::uuid,$3::uuid,$4,$5,$6,$7,now()) "+
      "ON CONFLICT(fund_id) DO UPDATE SET decision='confirmed',"+
      "factsheet_import_id=EXCLUDED.factsheet_import_id,"+
      "performance_import_id=EXCLUDED.performance_import_id,"+
      "performance_row=EXCLUDED.performance_row,"+
      "score_at_review=EXCLUDED.score_at_review,"+
      "reviewer_email=EXCLUDED.reviewer_email,note=EXCLUDED.note,reviewed_at=now()",
      [fundId,data.factsheetImportId,data.performanceImportId??null,data.performanceRow??null,
        scores.score,ADMIN_EMAIL,data.note]);
    return NextResponse.json({
      decision:"confirmed",matchScore:Math.round(scores.score*100),
      returnsApproved:false,
      message:"Official PDF fund identity confirmed. Any published PDF returns are used as the primary source; client-report fee/date validation remains separate."
    },{headers:noStore});
  }catch(error){
    if(error instanceof z.ZodError || error instanceof SyntaxError)
      return NextResponse.json({error:"Invalid review details."},{status:400,headers:noStore});
    console.error("Omega manual fund review save failed.");
    return NextResponse.json({error:"The review could not be saved."},{status:500,headers:noStore});
  }
}
