import ExcelJS from "exceljs";
import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { auth, ADMIN_EMAIL, isLoginConfigured } from "@/auth";
import { getNeonSql } from "@/lib/server/neon";
import { APPROVED_FUNDS } from "@/lib/approved-funds";
import { getActiveFunds,ensureActiveFundNamesTable } from "@/lib/server/active-funds";
import { workbookFundNames,workbookReturnRows,matchWorkbookReturn } from "@/lib/reconciliation/workbook-source";
import { similarity } from "@/lib/reconciliation/engine";
import { extractFundFactsheet } from "@/lib/reconciliation/factsheet";
import { HORIZONS, downgradeDuplicateApprovals } from "@/lib/reconciliation/engine";
import { reconcilePdfOnly } from "@/lib/reconciliation/pdf-only";
import type { WorkbookEntry,FactSheetData,ReportedReturns,Review } from "@/lib/reconciliation/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
async function authorised(){
  if(!isLoginConfigured())return false;
  return (await auth())?.user?.email?.toLowerCase()===ADMIN_EMAIL;
}
async function schema(){
  const sql=getNeonSql();
  await sql.query("CREATE TABLE IF NOT EXISTS fund_source_performance (import_id uuid NOT NULL REFERENCES imports(id), provider text NOT NULL, row_number integer NOT NULL, source_name text NOT NULL, reported_returns jsonb NOT NULL, PRIMARY KEY(import_id,provider,row_number))");
  await sql.query("CREATE TABLE IF NOT EXISTS fund_source_factsheets (import_id uuid PRIMARY KEY REFERENCES imports(id), status text NOT NULL, data jsonb, error_message text, processed_at timestamptz NOT NULL DEFAULT now())");
  await sql.query("CREATE TABLE IF NOT EXISTS fund_reconciliations (fund_id text PRIMARY KEY, provider text NOT NULL, approved_name text NOT NULL, status text NOT NULL, confidence numeric(6,3) NOT NULL DEFAULT 0, performance_import_id uuid REFERENCES imports(id), factsheet_import_id uuid REFERENCES imports(id), selected_workbook_row integer, selected_source_name text, reported_returns jsonb, extracted_factsheet jsonb, evidence jsonb NOT NULL DEFAULT '{}'::jsonb, reason text, returns_approved boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now())");
}
async function privateBytes(path:string){
  const result=await get(path,{access:"private"});
  if(!result||result.statusCode!==200)throw new Error("Private document cannot be read.");
  const b=Buffer.from(await new Response(result.stream).arrayBuffer());
  if(b.length<6||b.length>3_500_000)throw new Error("File exceeds the supported extraction size.");
  return b;
}
async function latestWorkbook(){
  const sql=getNeonSql();
  const rows=await sql.query([
    "SELECT id::text,filename,storage_key FROM imports",
    "WHERE storage_key LIKE 'funds/performance/%' AND filename ILIKE '%.xlsx'",
    "ORDER BY uploaded_at DESC,id DESC LIMIT 1"
  ].join(" "));
  return rows[0] as {id:string;filename:string;storage_key:string}|undefined;
}
async function workbook(){
  const stored=await latestWorkbook();
  if(!stored)throw new Error("Upload the corrected 115-fund XLSX workbook first.");
  const bytes=await privateBytes(stored.storage_key);
  const book=new ExcelJS.Workbook();
  await book.xlsx.load(bytes as unknown as Parameters<typeof book.xlsx.load>[0]);
  const names=workbookFundNames(book);
  const rows=workbookReturnRows(book);
  await ensureActiveFundNamesTable();
  const sql=getNeonSql();
  const namesPayload=JSON.stringify(names.map(f=>({
    id:f.id,provider:f.provider,name:f.name
  })));
  const rowsPayload=JSON.stringify(rows.map(r=>({
    provider:r.provider,row:r.rowNumber,name:r.sourceName,returns:r.returns
  })));
  await sql.query("DELETE FROM fund_active_names");
  await sql.query([
    "INSERT INTO fund_active_names(fund_id,provider,name,workbook_import_id)",
    "SELECT n.id,n.provider,n.name,$1::uuid",
    "FROM jsonb_to_recordset($2::jsonb) AS n(id text,provider text,name text)"
  ].join(" "),[stored.id,namesPayload]);
  await sql.query("DELETE FROM fund_source_performance WHERE import_id=$1::uuid",[stored.id]);
  await sql.query([
    "INSERT INTO fund_source_performance(import_id,provider,row_number,source_name,reported_returns)",
    "SELECT $1::uuid,r.provider,r.row,r.name,r.returns",
    "FROM jsonb_to_recordset($2::jsonb) AS r(provider text,row integer,name text,returns jsonb)"
  ].join(" "),[stored.id,rowsPayload]);
  return {phase:"workbook",funds:names.length,rows:rows.length,
    sourceFile:stored.filename,sourceImportId:stored.id,
    message:"The corrected workbook now defines all 115 fund names and performance returns."};
}
async function factsheets(){
  const sql=getNeonSql();
  const files=await sql.query("SELECT i.id::text,i.filename,i.storage_key FROM imports i LEFT JOIN fund_source_factsheets e ON e.import_id=i.id WHERE i.storage_key LIKE 'funds/factsheets/%' AND e.import_id IS NULL ORDER BY i.uploaded_at LIMIT 2");
  const summaries:{filename:string;status:string;title:string|null;warnings:string[]}[]=[];
  for(const file of files){
    const item=file as {id:string;filename:string;storage_key:string};
    let data:FactSheetData|null=null,err:string|null=null;
    try{
      const raw=await privateBytes(item.storage_key);
      if(raw.subarray(0,5).toString("ascii")!=="%PDF-")throw new Error("Document is not a PDF.");
      data=await extractFundFactsheet({importId:item.id,filename:item.filename,data:new Uint8Array(raw)});
    }catch(error){
      err=error instanceof Error?error.message.slice(0,350):"Could not extract PDF text.";
    }
    await sql.query("INSERT INTO fund_source_factsheets (import_id,status,data,error_message) VALUES ($1::uuid,$2,$3::jsonb,$4) ON CONFLICT (import_id) DO UPDATE SET status=EXCLUDED.status,data=EXCLUDED.data,error_message=EXCLUDED.error_message,processed_at=now()",[
      item.id,data?"parsed":"needs_review",data?JSON.stringify(data):null,err
    ]);
    summaries.push({filename:item.filename,status:data?"parsed":"needs_review",title:data?.title??null,warnings:data?.extractionWarnings??[err??"Unknown issue"]});
  }
  const totals=await sql.query("SELECT (SELECT COUNT(*)::int FROM imports WHERE storage_key LIKE 'funds/factsheets/%') AS total, (SELECT COUNT(*)::int FROM fund_source_factsheets) AS processed");
  return {phase:"factsheets",summaries,total:Number(totals[0].total),processed:Number(totals[0].processed),hasMore:Number(totals[0].processed)<Number(totals[0].total)};
}
async function reconcile(){
  const sql=getNeonSql();
  const [facts,funds,stored]=await Promise.all([
    sql.query("SELECT data FROM fund_source_factsheets WHERE status='parsed' AND data IS NOT NULL"),
    getActiveFunds(),latestWorkbook()
  ]);
  if(!stored)throw new Error("Upload the new workbook before matching PDFs.");
  const current=await sql.query(
    "SELECT provider,row_number,source_name,reported_returns FROM fund_source_performance WHERE import_id=$1::uuid",
    [stored.id]
  );
  if(!current.length)throw new Error("Import the updated workbook before running automatic matching.");
  const rows:WorkbookEntry[]=current.map(row=>({
    provider:String(row.provider),rowNumber:Number(row.row_number),
    sourceName:String(row.source_name),returns:row.reported_returns as ReportedReturns
  }));
  const extracted=facts.map(row=>row.data as FactSheetData);
  const table=await sql.query("SELECT to_regclass('public.fund_identity_reviews') IS NOT NULL AS present");
  const confirmed=table[0]?.present
    ?await sql.query("SELECT fund_id,factsheet_import_id::text,performance_import_id::text,performance_row FROM fund_identity_reviews WHERE decision='confirmed'")
    :[];
  const results=downgradeDuplicateApprovals(
    funds.map(f=>reconcilePdfOnly(f,extracted)),
    confirmed.map(x=>({fundId:String(x.fund_id),
      factsheetImportId:x.factsheet_import_id?String(x.factsheet_import_id):null,
      performanceImportId:x.performance_import_id?String(x.performance_import_id):null,
      rowNumber:x.performance_row==null?null:Number(x.performance_row)}))
  );
  const fundMap=new Map(funds.map(f=>[f.id,f]));
  const payload=JSON.stringify(results.map((r:Review)=>{
    const fund=fundMap.get(r.fundId)!;
    const exact=matchWorkbookReturn(fund,rows);
    const approved=Boolean(r.factsheetIdentityApproved&&exact);
    const candidates=rows.filter(v=>v.provider===r.provider).map(v=>({
      name:v.sourceName,row:v.rowNumber,returns:v.returns,
      score:similarity(fund.name,v.sourceName)
    })).filter(v=>v.score>=0.4).sort((a,b)=>b.score-a.score).slice(0,5);
    return {
      fundId:r.fundId,provider:r.provider,name:r.name,
      status:r.status,score:r.score,
      performanceImportId:exact?stored.id:null,
      sourceRow:exact?.rowNumber??null,
      sourceName:exact?.sourceName??null,
      returnData:approved?exact!.returns:null,
      factsheetId:r.factsheet?.importId??null,
      extracted:r.factsheet??null,
      reason:approved?
        "PDF identity matched automatically and exact current-workbook return series linked. Fee/date validation is still required for client use.":
        exact?
          r.reason+" Workbook returns remain withheld until PDF identity is confirmed.":
          r.reason+" No unique exact return series in the updated workbook.",
      evidence:{
        displayedReturnsSource:approved?"uploaded_workbook":null,
        workbookReturnsUsed:approved,
        publishedPerformance:approved?{
          source:"uploaded_workbook",importId:stored.id,row:exact!.rowNumber,
          asOf:null,feeBasis:"not_stated"
        }:null,
        candidatePerformanceRows:candidates,
        candidateFactsheets:r.alternativeFactsheets,
        matchScores:{factsheet:r.factsheetScore,workbook:exact?1:0,combined:r.score},
        factsheetIdentityApproved:r.factsheetIdentityApproved,
        seriesIdentityApproved:approved,
        identityOnly:!r.factsheetIdentityApproved,
        performanceSourceBasis:approved?"workbook_returns_fee_basis_not_confirmed":"not_confirmed",
        workbookAsOf:null
      }
    };
  }));
  await sql.query([
    "INSERT INTO fund_reconciliations",
    "(fund_id,provider,approved_name,status,confidence,performance_import_id,factsheet_import_id,",
    "selected_workbook_row,selected_source_name,reported_returns,extracted_factsheet,evidence,reason,returns_approved)",
    "SELECT x.\"fundId\",x.provider,x.name,x.status,x.score,x.\"performanceImportId\"::uuid,",
    "x.\"factsheetId\"::uuid,x.\"sourceRow\",x.\"sourceName\",x.\"returnData\",x.extracted,x.evidence,x.reason,false",
    "FROM jsonb_to_recordset($1::jsonb) AS x",
    "(\"fundId\" text,provider text,name text,status text,score numeric,",
    "\"performanceImportId\" text,\"factsheetId\" text,\"sourceRow\" integer,\"sourceName\" text,",
    "\"returnData\" jsonb,extracted jsonb,evidence jsonb,reason text)",
    "ON CONFLICT(fund_id) DO UPDATE SET provider=EXCLUDED.provider,approved_name=EXCLUDED.approved_name,",
    "status=EXCLUDED.status,confidence=EXCLUDED.confidence,",
    "performance_import_id=EXCLUDED.performance_import_id,factsheet_import_id=EXCLUDED.factsheet_import_id,",
    "selected_workbook_row=EXCLUDED.selected_workbook_row,selected_source_name=EXCLUDED.selected_source_name,",
    "reported_returns=EXCLUDED.reported_returns,extracted_factsheet=EXCLUDED.extracted_factsheet,",
    "evidence=EXCLUDED.evidence,reason=EXCLUDED.reason,returns_approved=false,updated_at=now()"
  ].join(" "),[payload]);
  const counts=results.reduce((acc,r)=>{acc[r.status]=(acc[r.status]||0)+1;return acc},{} as Record<string,number>);
  return {phase:"reconcile",total:results.length,counts,returnsApproved:0,
    workbookFundNames:true,workbookSource:stored.filename};
}
export async function GET(){
  if(!await authorised())return NextResponse.json({error:"Unauthorised"},{status:401,headers});
  try{
    const sql=getNeonSql();
    const status=await sql.query("SELECT to_regclass('public.fund_reconciliations') AS reconciliations, "+
      "to_regclass('public.fund_source_factsheets') AS factsheets, "+
      "to_regclass('public.fund_source_performance') AS performance, "+
      "to_regclass('public.fund_identity_reviews') AS manual");
    const tables=status[0];
    const files=await sql.query("SELECT COUNT(*)::int AS count FROM imports WHERE storage_key LIKE 'funds/factsheets/%'");
    if(!tables?.reconciliations || !tables?.factsheets)
      return NextResponse.json({initialized:false,approvedUniverse:115,totalFactsheets:Number(files[0].count),processedFactsheets:0,workbookRows:0,reviews:[]},{headers});
    const [details,processed,performance,manualReviews]=await Promise.all([
      sql.query("SELECT fund_id,provider,approved_name,status,confidence,selected_source_name,reported_returns,extracted_factsheet,evidence,reason,returns_approved,factsheet_import_id::text FROM fund_reconciliations ORDER BY provider,approved_name"),
      sql.query("SELECT COUNT(*)::int AS count FROM fund_source_factsheets"),
      tables.performance?sql.query("SELECT COUNT(*)::int AS count FROM fund_source_performance"):Promise.resolve([{count:0}]),
      tables.manual?sql.query(
        "SELECT m.fund_id,m.decision,m.note AS manual_note,m.reviewed_at::text AS reviewed_at,"+
        "m.score_at_review::float AS reviewed_score,m.factsheet_import_id::text AS manual_factsheet_id,"+
        "p.source_name AS manual_source_name,p.reported_returns AS manual_returns,"+
        "f.data AS manual_factsheet "+
        "FROM fund_identity_reviews m "+
        "LEFT JOIN fund_source_performance p ON p.import_id=m.performance_import_id AND p.row_number=m.performance_row "+
        "LEFT JOIN fund_source_factsheets f ON f.import_id=m.factsheet_import_id"
      ):Promise.resolve([])
    ]);
    const manualMap=new Map(manualReviews.map(m=>[String(m.fund_id),m]));
    const approved=new Set(APPROVED_FUNDS.map(f=>f.id));
    const reviews=details.filter(x=>approved.has(String(x.fund_id))).map(record=>{
      const m=manualMap.get(String(record.fund_id));
      const originalStatus=record.status;
      const originalScore=Number(record.confidence??0);
      if(!m)return {...record,auto_status:originalStatus,auto_score:originalScore,manual_decision:null};
      const base={...record,auto_status:originalStatus,auto_score:originalScore,
        manual_decision:m.decision,manual_note:m.manual_note,reviewed_at:m.reviewed_at};
      if(m.decision==="confirmed"){
        const doc=m.manual_factsheet as FactSheetData|null;
        const pdfPerf=doc?.performance;
        const officialPdf=pdfPerf?.status==="extracted"&&Boolean(pdfPerf.asOf);
        const originalEvidence=(record.evidence??{}) as Record<string,unknown>;
        return {...base,status:"manually_confirmed",confidence:m.reviewed_score??record.confidence,
          selected_source_name:doc?.title??null,
          reported_returns:officialPdf?pdfPerf!.returns:null,
          extracted_factsheet:doc??null,
          factsheet_import_id:m.manual_factsheet_id??null,
          evidence:{...originalEvidence,
            factsheetIdentityApproved:true,
            displayedReturnsSource:officialPdf?"official_factsheet_pdf":null,
            workbookReturnsUsed:false,
            publishedPerformance:pdfPerf?{source:"official_factsheet_pdf",
              asOf:pdfPerf.asOf,feeBasis:pdfPerf.feeBasis,page:pdfPerf.page}:null},
          reason:"Manually confirmed PDF fund identity. Returns are taken only from the official PDF, not a workbook.",
          returns_approved:false};
      }
      return {...base,status:"manual_rejected",reported_returns:null,
        selected_source_name:null,extracted_factsheet:null,factsheet_import_id:null,
        reason:"Automatic proposal rejected during manual identity review; select different sources or reset the review.",
        returns_approved:false};
    });
    return NextResponse.json({initialized:true,approvedUniverse:115,
      totalFactsheets:Number(files[0].count),processedFactsheets:Number(processed[0].count),
      workbookRows:Number(performance[0].count),reviews},{headers});
  }catch{
    console.error("Reconciliation review query failed.");
    return NextResponse.json({error:"Unable to read reconciliation progress."},{status:500,headers});
  }
}
export async function POST(request:Request){
  if(!await authorised())return NextResponse.json({error:"Unauthorised"},{status:401,headers});
  const origin=request.headers.get("origin");
  if(!origin||origin!==new URL(request.url).origin)return NextResponse.json({error:"Invalid request origin."},{status:403,headers});
  try{
    const data=await request.json() as {phase?:unknown};
    if(!["workbook","factsheets","reconcile"].includes(String(data.phase))){
      return NextResponse.json({error:"Invalid reconciliation stage."},{status:400,headers});
    }
    await schema();
    const result=data.phase==="workbook"?await workbook():data.phase==="factsheets"?await factsheets():await reconcile();
    return NextResponse.json(result,{headers});
  }catch(err){
    const known=err instanceof Error?err.message:"Unknown error";
    console.error("Omega reconciliation phase failed:",known.slice(0,250));
    // Do not return storage path, database details or extracted content in errors.
    const safe=/^Uploaded workbook|^Omega performance workbook|^Missing provider sheet|^Invalid historical-period|^Workbook has not/.test(known);
    return NextResponse.json({error:safe?known:"Reconciliation stage failed; please check the source files and retry."},{status:safe?422:500,headers});
  }
}
