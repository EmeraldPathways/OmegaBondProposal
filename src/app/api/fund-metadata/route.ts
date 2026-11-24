import {createHash} from "node:crypto";
import {get} from "@vercel/blob";
import {NextResponse} from "next/server";
import {auth,ADMIN_EMAIL,isLoginConfigured} from "@/auth";
import {getNeonSql} from "@/lib/server/neon";
import {extractFundFactsheet} from "@/lib/reconciliation/factsheet";
import {pdfFilenameFundKey,workbookNameKey} from "@/lib/reconciliation/workbook-source";
import type {FactSheetData} from "@/lib/reconciliation/engine";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const PARSER_VERSION=6;
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};

type StoredSource={
  fundId:string; provider:string; name:string;
  importId:string; filename:string; storageKey:string;
  current:FactSheetData|null;
  processedId:string|null; processedVersion:number|null;
  processedStatus:string|null; processedReason:string|null; method:string|null;
};
async function allowed(){
  return isLoginConfigured() &&
    (await auth())?.user?.email?.toLowerCase()===ADMIN_EMAIL;
}
async function schema(){
  const sql=getNeonSql();
  await sql.query("CREATE TABLE IF NOT EXISTS fund_metadata_checks ("+
    "fund_id text PRIMARY KEY,"+
    "factsheet_import_id uuid NOT NULL REFERENCES imports(id) ON DELETE CASCADE,"+
    "parser_version integer NOT NULL,status text NOT NULL,reason text,"+
    "method text,field_count integer NOT NULL DEFAULT 0,source_sha256 text,"+
    "checked_at timestamptz NOT NULL DEFAULT now())");
}
async function readSources():Promise<StoredSource[]>{
  const sql=getNeonSql();
  const rows=await sql.query(
    "SELECT r.fund_id,n.provider,n.name,r.factsheet_import_id::text AS import_id,"+
    "i.filename,i.storage_key,s.data,"+
    "c.factsheet_import_id::text AS checked_id,c.parser_version AS checked_version,"+
    "c.status AS checked_status,c.reason AS checked_reason,c.method "+
    "FROM fund_reconciliations r "+
    "JOIN fund_active_names n ON n.fund_id=r.fund_id "+
    "JOIN imports i ON i.id=r.factsheet_import_id "+
    "LEFT JOIN fund_source_factsheets s ON s.import_id=r.factsheet_import_id "+
    "LEFT JOIN fund_metadata_checks c ON c.fund_id=r.fund_id "+
    "WHERE r.factsheet_import_id IS NOT NULL "+
    "AND r.evidence->>'matchBasis'='unique_provider_qualified_filename' "+
    "AND r.evidence->>'displayedReturnsSource'='uploaded_workbook' "+
    "ORDER BY n.provider,n.name"
  );
  return rows.map(x=>({
    fundId:String(x.fund_id),provider:String(x.provider),name:String(x.name),
    importId:String(x.import_id),filename:String(x.filename),
    storageKey:String(x.storage_key),current:(x.data??null) as FactSheetData|null,
    processedId:x.checked_id===null?null:String(x.checked_id),
    processedVersion:x.checked_version===null?null:Number(x.checked_version),
    processedStatus:x.checked_status===null?null:String(x.checked_status),
    processedReason:x.checked_reason===null?null:String(x.checked_reason),
    method:x.method===null?null:String(x.method)
  }));
}
function descriptionPresent(data:FactSheetData|null){
  const obj=data?.objective;
  return typeof obj==="string" && obj.trim().length>=35 &&
    !/^information unavailable$/i.test(obj.trim()) &&
    !/^risk profile\s*:/i.test(obj.trim());
}
function currentCheck(row:StoredSource){
  return row.processedId===row.importId&&row.processedVersion===PARSER_VERSION;
}
function summary(rows:StoredSource[]){
  const checked=rows.filter(currentCheck).length;
  const complete=rows.filter(r=>currentCheck(r)&&r.processedStatus==="saved"&&
    descriptionPresent(r.current)).length;
  const exceptions=rows.filter(r=>currentCheck(r)&&
    (r.processedStatus!=="saved"||!descriptionPresent(r.current)))
    .map(r=>({
      fund:r.name,provider:r.provider,
      reason:r.processedReason??"Description was not recovered from the linked PDF"
    }));
  const byProvider:Record<string,{total:number;checked:number;saved:number}>={};
  for(const row of rows){
    const p=byProvider[row.provider]??{total:0,checked:0,saved:0};
    p.total++;
    if(currentCheck(row)){
      p.checked++;
      if(row.processedStatus==="saved"&&descriptionPresent(row.current))p.saved++;
    }
    byProvider[row.provider]=p;
  }
  return {total:rows.length,expected:107,checked,saved:complete,
    pending:rows.length-checked,needsReview:exceptions.length,
    hasMore:checked<rows.length,byProvider,exceptions};
}
async function record(row:StoredSource,status:string,reason:string|null,
  method:string|null,fields:number,hash:string|null){
  const sql=getNeonSql();
  await sql.query(
    "INSERT INTO fund_metadata_checks "+
    "(fund_id,factsheet_import_id,parser_version,status,reason,method,field_count,source_sha256) "+
    "VALUES($1,$2::uuid,$3,$4,$5,$6,$7,$8) "+
    "ON CONFLICT(fund_id) DO UPDATE SET "+
    "factsheet_import_id=EXCLUDED.factsheet_import_id,"+
    "parser_version=EXCLUDED.parser_version,status=EXCLUDED.status,"+
    "reason=EXCLUDED.reason,method=EXCLUDED.method,field_count=EXCLUDED.field_count,"+
    "source_sha256=EXCLUDED.source_sha256,checked_at=now()",
    [row.fundId,row.importId,PARSER_VERSION,status,reason,method,fields,hash]
  );
}
export async function GET(){
  if(!await allowed())
    return NextResponse.json({error:"Unauthorised"},{status:401,headers});
  try{
    await schema();
    return NextResponse.json(summary(await readSources()),{headers});
  }catch(error){
    console.error("Factsheet metadata audit failed:",error);
    return NextResponse.json({error:"Could not read the stored fund metadata audit."},
      {status:500,headers});
  }
}
export async function POST(request:Request){
  if(!await allowed())
    return NextResponse.json({error:"Unauthorised"},{status:401,headers});
  if(request.headers.get("origin")!==new URL(request.url).origin)
    return NextResponse.json({error:"Invalid request origin"},{status:403,headers});
  try{
    await schema();
    const body=await request.json().catch(()=>({}));
    if(body?.retryIssues===true){
      const sql=getNeonSql();
      await sql.query("DELETE FROM fund_metadata_checks WHERE parser_version=$1 "+
        "AND status<>'saved'",[PARSER_VERSION]);
      return NextResponse.json({...summary(await readSources()),completed:[]},{headers});
    }
    const current=await readSources();
    // One OCR job per request fits Vercel's 60-second function budget.
    const candidates=current.filter(x=>!currentCheck(x));
    if(candidates.length===0)
      return NextResponse.json({...summary(current),completed:[]},{headers});
    const row=candidates[0];
    const completed:{fund:string;provider:string;status:string;reason?:string}[]=[];
    let hash:string|null=null;
    try{
      if(pdfFilenameFundKey(row.filename)!==workbookNameKey(row.name))
        throw new Error("PDF filename and workbook fund name do not match");
      const blob=await get(row.storageKey,{access:"private"});
      if(!blob||blob.statusCode!==200)
        throw new Error("The linked private PDF is missing");
      const bytes=new Uint8Array(await new Response(blob.stream).arrayBuffer());
      if(bytes.byteLength<100||bytes.byteLength>3_500_000 ||
        Buffer.from(bytes.subarray(0,5)).toString("ascii")!=="%PDF-")
        throw new Error("The stored PDF is invalid or exceeds 3.5 MB");
      hash=createHash("sha256").update(bytes).digest("hex");
      const parsed=await extractFundFactsheet({
        importId:row.importId,filename:row.filename,
        data:bytes,ocrFallback:true
      });
      if(parsed.providerHint!==row.provider)
        throw new Error("The PDF provider does not match the linked fund");
      // Save the actual extracted source fields and first-page/full-text
      // evidence to the same cache used by proposal PDF generation.
      const sql=getNeonSql();
      await sql.query(
        "INSERT INTO fund_source_factsheets(import_id,status,data,error_message) "+
        "VALUES($1::uuid,'parsed',$2::jsonb,NULL) "+
        "ON CONFLICT(import_id) DO UPDATE SET "+
        "status='parsed',data=EXCLUDED.data,error_message=NULL,processed_at=now()",
        [row.importId,JSON.stringify(parsed)]
      );
      await sql.query(
        "UPDATE fund_reconciliations SET extracted_factsheet=$3::jsonb "+
        "WHERE fund_id=$1 AND factsheet_import_id=$2::uuid",
        [row.fundId,row.importId,JSON.stringify(parsed)]
      );
      const saved=descriptionPresent(parsed);
      const fields=[
        parsed.objective,parsed.strategy,parsed.asOf,parsed.riskProfile,
        parsed.riskRating,parsed.amcPct,parsed.civPct,parsed.expenseRatioPct,
        parsed.managedBy,parsed.managementStyle,parsed.assetMix,
        parsed.taxStatus,parsed.equityRange,parsed.baseCurrency,
        parsed.moneyMateId
      ].filter(x=>x!==null&&x!==undefined&&x!=="").length;
      const method=parsed.extractionMethod??"pdf_text";
      await record(row,saved?"saved":"needs_review",
        saved?null:"No usable fund description was extracted",method,fields,hash);
      completed.push({fund:row.name,provider:row.provider,
        status:saved?"saved":"needs_review"});
    }catch(error){
      const reason=error instanceof Error?error.message.slice(0,260):
        "Source extraction failed";
      // Do not overwrite previously stored source facts with an empty result.
      await record(row,"needs_review",reason,null,0,hash);
      completed.push({fund:row.name,provider:row.provider,
        status:"needs_review",reason});
    }
    return NextResponse.json({...summary(await readSources()),completed},{headers});
  }catch(error){
    console.error("Factsheet metadata processing failed:",error);
    return NextResponse.json({error:"Could not process the next stored factsheet."},
      {status:500,headers});
  }
}
