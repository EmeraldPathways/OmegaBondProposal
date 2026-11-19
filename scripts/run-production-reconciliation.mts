import ExcelJS from "exceljs";
import { get } from "@vercel/blob";
import { neon } from "@neondatabase/serverless";
import { APPROVED_FUNDS } from "../src/lib/approved-funds.ts";
import { HORIZONS, reconcileOne } from "../src/lib/reconciliation/engine.ts";
import { extractFundFactsheet } from "../src/lib/reconciliation/factsheet.ts";
import type {WorkbookEntry,ReportedReturns,FactSheetData,Review} from "../src/lib/reconciliation/engine.ts";

const report=(key:string,meta:object)=>console.log("OMEGA_RECONCILE_"+key,JSON.stringify(meta));
if(process.env.VERCEL_ENV!=="production"){
  report("SKIPPED",{reason:"Production build only"});
  process.exit(0);
}
if(!process.env.DATABASE_URL||!process.env.BLOB_STORE_ID)throw new Error("Missing private production source connections.");
const sql=neon(process.env.DATABASE_URL);
const providers:Record<string,string>={Aviva:"AVIVA",Zurich:"ZURICH","Standard Life":"STANDARD","New Ireland":"New Ireland"};
const cell=(v:ExcelJS.Cell):string=>typeof v.value==="string"?v.value.trim():typeof v.value==="number"?String(v.value):v.text?.trim()??"";
const pct=(v:ExcelJS.Cell):number|null=>{
  if(typeof v.value==="number")return Number.isFinite(v.value)?v.value:null;
  const raw=cell(v).replace(/[%€,]/g,"").trim();
  if(!raw||raw==="-"||raw==="—"||raw.toLowerCase()==="n/a")return null;
  const n=Number(raw);return Number.isFinite(n)?n:null;
};
async function readBlob(path:string):Promise<Buffer>{
  const response=await get(path,{access:"private"});
  if(!response||response.statusCode!==200)throw new Error("Private Blob could not be read.");
  const data=Buffer.from(await new Response(response.stream).arrayBuffer());
  if(data.length<6||data.length>3_500_000)throw new Error("File size outside supported range.");
  return data;
}
async function tables(){
  await sql.query("CREATE TABLE IF NOT EXISTS fund_source_performance (import_id uuid NOT NULL REFERENCES imports(id),provider text NOT NULL,row_number integer NOT NULL,source_name text NOT NULL,reported_returns jsonb NOT NULL,PRIMARY KEY(import_id,provider,row_number))");
  await sql.query("CREATE TABLE IF NOT EXISTS fund_source_factsheets (import_id uuid PRIMARY KEY REFERENCES imports(id),status text NOT NULL,data jsonb,error_message text,processed_at timestamptz NOT NULL DEFAULT now())");
  await sql.query("CREATE TABLE IF NOT EXISTS fund_reconciliations (fund_id text PRIMARY KEY,provider text NOT NULL,approved_name text NOT NULL,status text NOT NULL,confidence numeric(6,3) NOT NULL DEFAULT 0,performance_import_id uuid REFERENCES imports(id),factsheet_import_id uuid REFERENCES imports(id),selected_workbook_row integer,selected_source_name text,reported_returns jsonb,extracted_factsheet jsonb,evidence jsonb NOT NULL DEFAULT '{}'::jsonb,reason text,returns_approved boolean NOT NULL DEFAULT false,updated_at timestamptz NOT NULL DEFAULT now())");
}
function parseWorkbook(book:ExcelJS.Workbook):WorkbookEntry[]{
  const shortlist=book.getWorksheet("FUNDS");
  if(!shortlist)throw new Error("FUNDS worksheet missing.");
  const found=new Set<string>();
  for(let n=2;n<=shortlist.rowCount;n++){
    const row=shortlist.getRow(n);
    const provider=cell(row.getCell(1)),name=cell(row.getCell(2));
    if(provider&&name)found.add(provider+"|"+name);
  }
  const expected=new Set(APPROVED_FUNDS.map(f=>f.provider+"|"+f.name));
  if(found.size!==115||expected.size!==115||[...expected].some(id=>!found.has(id))){
    report("WORKBOOK_MISMATCH",{observed:found.size,expected:expected.size});
    throw new Error("Workbook shortlist differs from the 115 approved names.");
  }
  const result:WorkbookEntry[]=[];
  for(const [provider,sheetName] of Object.entries(providers)){
    const sheet=book.getWorksheet(sheetName);
    if(!sheet)throw new Error("Required performance sheet missing: "+sheetName);
    if(cell(sheet.getRow(1).getCell(1)).toLowerCase()!=="name"||
      cell(sheet.getRow(1).getCell(9)).toLowerCase()!=="10yrs")throw new Error("Unexpected return headers.");
    let count=0;
    for(let index=2;index<=sheet.rowCount;index++){
      const row=sheet.getRow(index),sourceName=cell(row.getCell(1));
      if(!sourceName)continue;
      const returns={} as ReportedReturns;
      for(let j=0;j<HORIZONS.length;j++)returns[HORIZONS[j]]=pct(row.getCell(j+2));
      result.push({provider,rowNumber:index,sourceName,returns});count++;
    }
    report("WORKBOOK_PROVIDER",{provider,count});
  }
  return result;
}
async function main(){
  const begin=Date.now();
  const uploads=await sql.query("SELECT id::text,filename,storage_key FROM imports WHERE storage_key LIKE 'funds/performance/%' OR storage_key LIKE 'funds/factsheets/%' ORDER BY uploaded_at DESC");
  const workbooks=uploads.filter(x=>String(x.storage_key).startsWith("funds/performance/") && /\.xlsx$/i.test(String(x.filename)));
  const named=workbooks.filter(x=>/omega.*fund.*performance/i.test(String(x.filename)));
  const selected=named[0]??(workbooks.length===1?workbooks[0]:null);
  if(!selected)throw new Error("Omega performance workbook could not be identified uniquely.");
  const pdfs=uploads.filter(x=>String(x.storage_key).startsWith("funds/factsheets/") && /\.pdf$/i.test(String(x.filename)));
  report("SOURCES",{uploadedRecords:uploads.length,pdfs:pdfs.length,workbooks:workbooks.length});
  const workbook=new ExcelJS.Workbook();
  await workbook.xlsx.load((await readBlob(String(selected.storage_key))) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const rows=parseWorkbook(workbook);
  report("WORKBOOK_VALID",{approvedNames:115,performanceSeries:rows.length});
  await tables();
  const insertRows=[
    "INSERT INTO fund_source_performance (import_id,provider,row_number,source_name,reported_returns)",
    'SELECT $1::uuid,v.provider,v."rowNumber",v."sourceName",v.returns',
    'FROM jsonb_to_recordset($2::jsonb) AS v(provider text,"rowNumber" integer,"sourceName" text,returns jsonb)',
    "ON CONFLICT (import_id,provider,row_number) DO UPDATE SET source_name=EXCLUDED.source_name,reported_returns=EXCLUDED.reported_returns"
  ].join(" ");
  await sql.query(insertRows,[selected.id,JSON.stringify(rows)]);
  report("WORKBOOK_STORED",{rows:rows.length});

  const existing=await sql.query("SELECT import_id::text,status,data FROM fund_source_factsheets");
  const known=new Map(existing.map(x=>[String(x.import_id),x]));
  const parsed:FactSheetData[]=[];
  let processed=0,reused=0,failed=0;
  const errorGroups:Record<string,number>={};
  for(const file of [...pdfs].reverse()){
    const id=String(file.id),prior=known.get(id);
    if(prior?.status==="parsed"&&prior.data){
      parsed.push(prior.data as FactSheetData);reused++;continue;
    }
    let data:FactSheetData|null=null,error:string|null=null;
    try{
      const bytes=await readBlob(String(file.storage_key));
      if(bytes.subarray(0,5).toString("ascii")!=="%PDF-")throw new Error("Invalid PDF");
      data=await extractFundFactsheet({importId:id,filename:String(file.filename),data:new Uint8Array(bytes)});
      parsed.push(data);
    }catch(e){
      error=e instanceof Error?e.message.slice(0,240):"Unknown PDF error";
      const kind=/pages/i.test(error)?"page_limit":/Blob|size/i.test(error)?"source_file":"pdf_parse";
      errorGroups[kind]=(errorGroups[kind]??0)+1;failed++;
    }
    await sql.query([
      "INSERT INTO fund_source_factsheets (import_id,status,data,error_message)",
      "VALUES ($1::uuid,$2,$3::jsonb,$4)",
      "ON CONFLICT (import_id) DO UPDATE SET status=EXCLUDED.status,data=EXCLUDED.data,error_message=EXCLUDED.error_message,processed_at=now()"
    ].join(" "),[id,data?"parsed":"needs_review",data?JSON.stringify(data):null,error]);
    processed++;
    if(processed%10===0)report("PDF_PROGRESS",{processed,of:pdfs.length,reused,failed});
  }
  report("PDF_COMPLETE",{total:pdfs.length,parsed:parsed.length,reused,failed,errorGroups});

  const reconciled=APPROVED_FUNDS.map(f=>reconcileOne(f,rows,parsed));
  const byPdf=new Map<string,string[]>(),byRow=new Map<string,string[]>();
  for(const item of reconciled){
    if(item.status!=="auto_matched"||!item.factsheet||!item.workbookRow)continue;
    const pdf=byPdf.get(item.factsheet.importId)??[];pdf.push(item.fundId);byPdf.set(item.factsheet.importId,pdf);
    const key=item.provider+"|"+item.workbookRow.rowNumber;
    const perf=byRow.get(key)??[];perf.push(item.fundId);byRow.set(key,perf);
  }
  const duplicates=new Set<string>();
  for(const map of [byPdf,byRow])for(const ids of map.values()){
    if(ids.length>1)ids.forEach(id=>duplicates.add(id));
  }
  for(const item of reconciled)if(duplicates.has(item.fundId)){
    item.status="needs_review";
    item.reason="The same source was assigned to more than one fund; manual share-class confirmation required.";
  }
  const staged=reconciled.map((r:Review)=>({
    fundId:r.fundId,provider:r.provider,name:r.name,status:r.status,score:r.score,
    performanceImportId:r.workbookRow?String(selected.id):null,
    sourceRow:r.workbookRow?.rowNumber??null,
    sourceName:r.workbookRow?.sourceName??null,
    returnData:r.workbookRow?.returns??null,
    factsheetId:r.factsheet?.importId??null,
    extracted:r.factsheet??null,reason:r.reason,
    evidence:{
      candidatePerformanceRows:r.alternativeRows.map(row=>({name:row.sourceName,row:row.rowNumber,returns:row.returns})),
      candidateFactsheets:r.alternativeFactsheets,
      identityOnly:true,performanceSourceBasis:"not_confirmed",workbookAsOf:"not_confirmed",
      manualConflict:duplicates.has(r.fundId)
    }
  }));
  const upsert=[
    "INSERT INTO fund_reconciliations (fund_id,provider,approved_name,status,confidence,performance_import_id,factsheet_import_id,selected_workbook_row,selected_source_name,reported_returns,extracted_factsheet,evidence,reason,returns_approved)",
    'SELECT x."fundId",x.provider,x.name,x.status,x.score,(x."performanceImportId")::uuid,(x."factsheetId")::uuid,x."sourceRow",x."sourceName",x."returnData",x.extracted,x.evidence,x.reason,false',
    'FROM jsonb_to_recordset($1::jsonb) AS x("fundId" text,provider text,name text,status text,score numeric,"performanceImportId" text,"factsheetId" text,"sourceRow" integer,"sourceName" text,"returnData" jsonb,extracted jsonb,evidence jsonb,reason text)',
    "ON CONFLICT (fund_id) DO UPDATE SET provider=EXCLUDED.provider,approved_name=EXCLUDED.approved_name,status=EXCLUDED.status,confidence=EXCLUDED.confidence,performance_import_id=EXCLUDED.performance_import_id,factsheet_import_id=EXCLUDED.factsheet_import_id,selected_workbook_row=EXCLUDED.selected_workbook_row,selected_source_name=EXCLUDED.selected_source_name,reported_returns=EXCLUDED.reported_returns,extracted_factsheet=EXCLUDED.extracted_factsheet,evidence=EXCLUDED.evidence,reason=EXCLUDED.reason,returns_approved=false,updated_at=now()"
  ].join(" ");
  for(let i=0;i<staged.length;i+=20)await sql.query(upsert,[JSON.stringify(staged.slice(i,i+20))]);

  const counts=Object.fromEntries(["auto_matched","needs_review","unmatched"].map(status=>[status,reconciled.filter(r=>r.status===status).length]));
  report("COMPLETE",{approvedFunds:reconciled.length,workbookRows:rows.length,
    pdfs:pdfs.length,pdfsParsed:parsed.length,withFactsheet:reconciled.filter(r=>!!r.factsheet).length,
    withPerformance:reconciled.filter(r=>!!r.workbookRow).length,duplicates:duplicates.size,
    ...counts,approvedReturns:0,elapsedSeconds:Math.round((Date.now()-begin)/1000)});
}
await main();
