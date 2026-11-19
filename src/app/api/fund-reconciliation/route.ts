import ExcelJS from "exceljs";
import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { auth, ADMIN_EMAIL, isLoginConfigured } from "@/auth";
import { getNeonSql } from "@/lib/server/neon";
import { APPROVED_FUNDS } from "@/lib/approved-funds";
import { extractFundFactsheet } from "@/lib/reconciliation/factsheet";
import { HORIZONS, reconcileOne } from "@/lib/reconciliation/engine";
import type { WorkbookEntry,FactSheetData,ReportedReturns,Review } from "@/lib/reconciliation/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
const sheets:Record<string,string>={"Aviva":"AVIVA","Zurich":"ZURICH","New Ireland":"New Ireland","Standard Life":"STANDARD"};

async function authorised(){
  if(!isLoginConfigured())return false;
  return (await auth())?.user?.email?.toLowerCase()===ADMIN_EMAIL;
}
function text(cell:ExcelJS.Cell){
  if(typeof cell.value==="number")return String(cell.value);
  if(typeof cell.value==="string")return cell.value.trim();
  return cell.text.trim();
}
function pct(cell:ExcelJS.Cell):number|null{
  const raw=cell.value;
  if(typeof raw==="number")return Number.isFinite(raw)?raw:null;
  const s=text(cell).replace(/[%€,]/g,"").trim();
  if(!s||s==="-"||s==="—"||s.toLowerCase()==="n/a")return null;
  const n=Number(s);
  return Number.isFinite(n)?n:null;
}
function workbookRows(workbook:ExcelJS.Workbook):WorkbookEntry[]{
  const list=workbook.getWorksheet("FUNDS");
  if(!list)throw new Error("Uploaded workbook has no FUNDS sheet.");
  const approved=new Set(APPROVED_FUNDS.map(f=>f.provider+"|"+f.name));
  const seen=new Set<string>();
  for(let i=2;i<=list.rowCount;i++){
    const row=list.getRow(i),provider=text(row.getCell(1)),name=text(row.getCell(2));
    if(provider&&name)seen.add(provider+"|"+name);
  }
  if(seen.size!==115||[...approved].some(name=>!seen.has(name)))
    throw new Error("Uploaded FUNDS sheet does not match the approved Omega 115-fund shortlist.");
  const rows:WorkbookEntry[]=[];
  for(const [provider,sheetName] of Object.entries(sheets)){
    const sheet=workbook.getWorksheet(sheetName);
    if(!sheet)throw new Error("Missing provider sheet: "+sheetName);
    const header=sheet.getRow(1);
    if(text(header.getCell(1)).toLowerCase()!=="name"||text(header.getCell(9)).toLowerCase()!=="10yrs")
      throw new Error("Invalid historical-period heading in "+sheetName);
    for(let rowNumber=2;rowNumber<=sheet.rowCount;rowNumber++){
      const row=sheet.getRow(rowNumber),sourceName=text(row.getCell(1));
      if(!sourceName)continue;
      const returns={} as ReportedReturns;
      for(let j=0;j<HORIZONS.length;j++)returns[HORIZONS[j]]=pct(row.getCell(j+2));
      rows.push({provider,sourceName,rowNumber,returns});
    }
  }
  return rows;
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
  const r=await sql.query("SELECT id::text,filename,storage_key FROM imports WHERE storage_key LIKE 'funds/performance/%' AND filename ILIKE '%Omega%Fund%Performance%' AND filename ILIKE '%.xlsx' ORDER BY uploaded_at DESC LIMIT 1");
  return r[0] as {id:string;filename:string;storage_key:string}|undefined;
}
async function workbook(){
  const stored=await latestWorkbook();
  if(!stored)throw new Error("Omega performance workbook has not been uploaded.");
  const sql=getNeonSql();
  const existing=await sql.query("SELECT COUNT(*)::int AS count FROM fund_source_performance WHERE import_id=$1::uuid",[stored.id]);
  if(Number(existing[0]?.count)>0)return {phase:"workbook",rows:Number(existing[0].count),alreadyProcessed:true};
  const bytes=await privateBytes(stored.storage_key);
  const book=new ExcelJS.Workbook();
  await book.xlsx.load(bytes as unknown as Parameters<typeof book.xlsx.load>[0]);
  const rows=workbookRows(book);
  const payload=JSON.stringify(rows);
  await sql.query("INSERT INTO fund_source_performance (import_id,provider,row_number,source_name,reported_returns) SELECT $1::uuid, v.provider, v.rowNumber, v.sourceName, v.returns FROM jsonb_to_recordset($2::jsonb) AS v(provider text,\"rowNumber\" integer,\"sourceName\" text,returns jsonb) ON CONFLICT (import_id,provider,row_number) DO UPDATE SET source_name=EXCLUDED.source_name,reported_returns=EXCLUDED.reported_returns",[stored.id,payload]);
  return {phase:"workbook",rows:rows.length,sourceFile:stored.filename,alreadyProcessed:false};
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
  const book=await latestWorkbook();
  if(!book)throw new Error("Omega performance workbook unavailable.");
  const entries=await sql.query("SELECT provider,source_name,row_number,reported_returns FROM fund_source_performance WHERE import_id=$1::uuid",[book.id]);
  if(!entries.length)throw new Error("Workbook has not been extracted. Run its scan first.");
  const workbookEntries:WorkbookEntry[]=entries.map(r=>({
    provider:String(r.provider),sourceName:String(r.source_name),
    rowNumber:Number(r.row_number),returns:r.reported_returns as ReportedReturns
  }));
  const facts=await sql.query("SELECT data FROM fund_source_factsheets WHERE status='parsed' AND data IS NOT NULL");
  const extracted=facts.map(row=>row.data as FactSheetData);
  const results=APPROVED_FUNDS.map(f=>reconcileOne(f,workbookEntries,extracted));
  const payload=JSON.stringify(results.map((r:Review)=>({
    fundId:r.fundId,provider:r.provider,name:r.name,status:r.status,score:r.score,
    performanceImportId:r.workbookRow?book.id:null,
    sourceRow:r.workbookRow?.rowNumber??null,
    sourceName:r.workbookRow?.sourceName??null,
    returnData:r.workbookRow?.returns??null,
    factsheetId:r.factsheet?.importId??null,
    extracted:r.factsheet??null,
    reason:r.reason,
    evidence:{
      candidatePerformanceRows:r.alternativeRows.map(row=>({name:row.sourceName,row:row.rowNumber,returns:row.returns})),
      candidateFactsheets:r.alternativeFactsheets,
      identityOnly:true,
      performanceSourceBasis:"not_confirmed",
      workbookAsOf:"not_confirmed"
    }
  })));
  await sql.query("INSERT INTO fund_reconciliations (fund_id,provider,approved_name,status,confidence,performance_import_id,factsheet_import_id,selected_workbook_row,selected_source_name,reported_returns,extracted_factsheet,evidence,reason,returns_approved) SELECT x.\"fundId\",x.provider,x.name,x.status,x.score,(x.\"performanceImportId\")::uuid,(x.\"factsheetId\")::uuid,x.\"sourceRow\",x.\"sourceName\",x.\"returnData\",x.extracted,x.evidence,x.reason,false FROM jsonb_to_recordset($1::jsonb) AS x(\"fundId\" text,provider text,name text,status text,score numeric,\"performanceImportId\" text,\"factsheetId\" text,\"sourceRow\" integer,\"sourceName\" text,\"returnData\" jsonb,extracted jsonb,evidence jsonb,reason text) ON CONFLICT (fund_id) DO UPDATE SET provider=EXCLUDED.provider,approved_name=EXCLUDED.approved_name,status=EXCLUDED.status,confidence=EXCLUDED.confidence,performance_import_id=EXCLUDED.performance_import_id,factsheet_import_id=EXCLUDED.factsheet_import_id,selected_workbook_row=EXCLUDED.selected_workbook_row,selected_source_name=EXCLUDED.selected_source_name,reported_returns=EXCLUDED.reported_returns,extracted_factsheet=EXCLUDED.extracted_factsheet,evidence=EXCLUDED.evidence,reason=EXCLUDED.reason,returns_approved=false,updated_at=now()",[payload]);
  const counts=results.reduce((acc,r)=>{acc[r.status]=(acc[r.status]||0)+1;return acc;},{} as Record<string,number>);
  return {phase:"reconcile",total:results.length,counts,returnsApproved:0};
}
export async function GET(){
  if(!await authorised())return NextResponse.json({error:"Unauthorised"},{status:401,headers});
  try{
    const sql=getNeonSql();
    const status=await sql.query("SELECT to_regclass('public.fund_reconciliations') AS reconciliations, to_regclass('public.fund_source_factsheets') AS factsheets, to_regclass('public.fund_source_performance') AS performance");
    const tables=status[0];
    const files=await sql.query("SELECT COUNT(*)::int AS count FROM imports WHERE storage_key LIKE 'funds/factsheets/%'");
    if(!tables?.reconciliations || !tables?.factsheets || !tables?.performance)
      return NextResponse.json({initialized:false,approvedUniverse:115,totalFactsheets:Number(files[0].count),processedFactsheets:0,workbookRows:0,reviews:[]},{headers});
    const [details,processed,performance]=await Promise.all([
      sql.query("SELECT fund_id,provider,approved_name,status,confidence,selected_source_name,reported_returns,extracted_factsheet,evidence,reason,returns_approved, factsheet_import_id::text FROM fund_reconciliations ORDER BY provider,approved_name"),
      sql.query("SELECT COUNT(*)::int AS count FROM fund_source_factsheets"),
      sql.query("SELECT COUNT(*)::int AS count FROM fund_source_performance")
    ]);
    const approved=new Set(APPROVED_FUNDS.map(f=>f.id));
    return NextResponse.json({initialized:true,approvedUniverse:115,totalFactsheets:Number(files[0].count),processedFactsheets:Number(processed[0].count),workbookRows:Number(performance[0].count),reviews:details.filter(x=>approved.has(String(x.fund_id)))},{headers});
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
