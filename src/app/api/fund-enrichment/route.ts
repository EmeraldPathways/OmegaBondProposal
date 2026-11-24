import {NextResponse} from "next/server";
import {get} from "@vercel/blob";
import {auth,ADMIN_EMAIL,isLoginConfigured} from "@/auth";
import {getNeonSql} from "@/lib/server/neon";
import {getActiveFunds} from "@/lib/server/active-funds";
import {extractFundFactsheet} from "@/lib/reconciliation/factsheet";
import {CONTENT_METADATA_VERSION} from "@/lib/reconciliation/factsheet-content";
import {pdfFilenameFundKey,workbookNameKey} from "@/lib/reconciliation/workbook-source";
import type {FactSheetData} from "@/lib/reconciliation/engine";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
type PdfRow={id:string;filename:string;storage_key:string;
  status:string|null;data:FactSheetData|null;error_message:string|null;attempted_version:number|null};
type AuditRow={fund:string;provider:string;filename:string|null;status:string;
  missing:string[];notStated:string[];identityIssue:string|null;warnings:string[]};

async function permitted(){
  return isLoginConfigured() &&
    (await auth())?.user?.email?.toLowerCase()===ADMIN_EMAIL;
}
async function ensureVersionColumn(){
  const sql=getNeonSql();
  await sql.query("ALTER TABLE fund_source_factsheets ADD COLUMN IF NOT EXISTS content_attempted_version integer NOT NULL DEFAULT 0");
}
function nameIssue(fund:string,provider:string,doc:FactSheetData|null):string|null{
  if(!doc)return null;
  if(doc.providerHint&&doc.providerHint!==provider)
    return "PDF issuer is "+doc.providerHint+"; the workbook fund is "+provider+".";
  // The user-approved exact PDF filename establishes the fund identity.
  // Printed titles may be abbreviated or missing in OCR-only documents.
  return null;
}
/** Source completeness does not imply every provider publishes every field. */
function contentHealth(doc:FactSheetData|null,provider:string){
  const missing:string[]=[],notStated:string[]=[];
  if(!doc){
    missing.push("description/objective","risk information","factsheet date");
    if(provider!=="Zurich")missing.push("strategy / investment style");
    if(provider==="Aviva"||provider==="Standard Life")missing.push("charges");
    else notStated.push("charges not separately located in the extracted factsheet");
    return {missing,notStated};
  }
  if(!doc.description&&!doc.objective)missing.push("description/objective");
  if(/\b(?:Managed\s+By\s*:|Style\s*:|Asset\s+Mix\s*:|SFDR\s*\*?\s*Classification\s*:|Performance\s+as\s+at)\b/i
      .test(doc.description??doc.objective??""))
    missing.push("description includes unrelated PDF metadata");

  if(!doc.strategy&&!doc.managementStyle){
    if(provider==="Zurich"&&doc.objective)
      notStated.push("strategy included in fund description");
    else if(provider!=="Zurich")missing.push("strategy / investment style");
  }
  if(doc.riskRating==null&&!doc.riskProfile&&!doc.riskFactors?.length&&!doc.riskDisclosure)
    missing.push("risk information");
  if(doc.amcPct==null&&doc.civPct==null&&doc.expenseRatioPct==null&&!doc.chargesDisclosure){
    if(provider==="Zurich"||provider==="New Ireland")
      notStated.push("charges not separately located in the extracted factsheet");
    else missing.push("charges");
  }
  if(!doc.asOf)missing.push("factsheet date");
  return {missing,notStated};
}
async function pdfs():Promise<PdfRow[]>{
  const sql=getNeonSql();
  const rows=await sql.query(
    "SELECT i.id::text AS id,i.filename,i.storage_key,e.status,e.data,e.error_message,"+
    "e.content_attempted_version AS attempted_version FROM imports i "+
    "LEFT JOIN fund_source_factsheets e ON e.import_id=i.id "+
    "WHERE i.storage_key LIKE 'funds/factsheets/%' AND i.filename ILIKE '%.pdf' "+
    "ORDER BY i.uploaded_at,i.id"
  );
  return rows.map(r=>({
    id:String(r.id),filename:String(r.filename),storage_key:String(r.storage_key),
    status:r.status==null?null:String(r.status),
    data:r.data as FactSheetData|null,
    error_message:r.error_message==null?null:String(r.error_message),
    attempted_version:Number(r.attempted_version??0)
  }));
}
export async function GET(){
  if(!await permitted())return NextResponse.json({error:"Unauthorised"},{status:401,headers});
  try{
    await ensureVersionColumn();
    const [funds,files]=await Promise.all([getActiveFunds(),pdfs()]);
    const byKey=new Map<string,PdfRow[]>();
    for(const file of files){
      const key=pdfFilenameFundKey(file.filename);
      byKey.set(key,[...(byKey.get(key)??[]),file]);
    }
    const records:AuditRow[]=funds.map(fund=>{
      const matched=byKey.get(workbookNameKey(fund.name))??[];
      const file=matched.length===1?matched[0]:null;
      const doc=file?.data??null;
      const issue=matched.length===0?"No PDF filename matches this fund":
        matched.length>1?"More than one PDF matches this fund":
        nameIssue(fund.name,fund.provider,doc);
      const stale=!file||(file?.attempted_version??0)<CONTENT_METADATA_VERSION ||
        (doc?.metadataVersion??0)<CONTENT_METADATA_VERSION;
      const fields=contentHealth(doc,fund.provider);
      return {fund:fund.name,provider:fund.provider,filename:file?.filename??null,
        status:!file?"missing_pdf":stale?
          ((file?.attempted_version??0)>=CONTENT_METADATA_VERSION?"needs_review":"pending"):
          file.status==="parsed"&&!issue&&(doc?.description||doc?.objective)?
            "extracted":"needs_review",
        missing:fields.missing,notStated:fields.notStated,identityIssue:issue,
        warnings:[...(doc?.extractionWarnings??[]),
          ...(file?.error_message?[file.error_message]:[])]};
    });
    const byProvider=Object.fromEntries(
      ["Aviva","Zurich","New Ireland","Standard Life"].map(provider=>{
        const values=records.filter(r=>r.provider===provider);
        return [provider,{total:values.length,
          extracted:values.filter(r=>r.status==="extracted").length,
          needsReview:values.filter(r=>r.status==="needs_review").length,
          pending:values.filter(r=>r.status==="pending").length}];
      })
    );
    const pendingFiles=files.filter(f=>(f.attempted_version??0)<CONTENT_METADATA_VERSION).length;
    const issues=records.filter(r=>r.status!=="extracted"||
      r.missing.length>0||r.identityIssue);
    return NextResponse.json({
      expected:funds.length,uploaded:files.length,attempted:files.length-pendingFiles,
      pending:pendingFiles,extracted:records.filter(r=>r.status==="extracted").length,
      review:records.filter(r=>r.status==="needs_review").length,
      identityConflicts:records.filter(r=>Boolean(r.identityIssue)).length,
      incompleteFields:records.filter(r=>r.missing.length>0).length,
      notStatedFields:records.reduce((count,r)=>count+r.notStated.length,0),
      byProvider,issues,complete:pendingFiles===0&&files.length===funds.length,
      contentVersion:CONTENT_METADATA_VERSION,
      note:"Missing means source content could not be reliably extracted. Not stated means the separate field was not found in the uploaded PDF; charges are never inferred. Workbook returns are unaffected."
    },{headers});
  }catch{
    console.error("Fund enrichment audit failed.");
    return NextResponse.json({error:"Could not audit stored fund content."},{status:500,headers});
  }
}
export async function POST(request:Request){
  if(!await permitted())return NextResponse.json({error:"Unauthorised"},{status:401,headers});
  if(request.headers.get("origin")!==new URL(request.url).origin)
    return NextResponse.json({error:"Invalid request origin."},{status:403,headers});
  try{
    await ensureVersionColumn();
    const sql=getNeonSql();
    const funds=await getActiveFunds();
    const byName=new Map(funds.map(f=>[workbookNameKey(f.name),f]));
    const files=await sql.query(
      "SELECT i.id::text AS id,i.filename,i.storage_key FROM imports i "+
      "LEFT JOIN fund_source_factsheets f ON f.import_id=i.id "+
      "WHERE i.storage_key LIKE 'funds/factsheets/%' AND i.filename ILIKE '%.pdf' "+
      "AND COALESCE(f.content_attempted_version,0)<$1 "+
      "ORDER BY i.uploaded_at,i.id LIMIT 1",[CONTENT_METADATA_VERSION]
    );
    const results:{filename:string;status:string;message:string|null}[]=[];
    for(const file of files){
      const id=String(file.id),filename=String(file.filename);
      const fund=byName.get(pdfFilenameFundKey(filename));
      let data:FactSheetData|null=null;
      let error:string|null=null;
      try{
        const blob=await get(String(file.storage_key),{access:"private"});
        if(!blob||blob.statusCode!==200)throw new Error("Private PDF unavailable.");
        const bytes=new Uint8Array(await new Response(blob.stream).arrayBuffer());
        if(bytes.byteLength<100||bytes.byteLength>3_500_000||
          Buffer.from(bytes.subarray(0,5)).toString("ascii")!=="%PDF-")
          throw new Error("Invalid or oversized PDF.");
        data=await extractFundFactsheet({importId:id,filename,data:bytes,ocrFallback:true});
        error=fund?nameIssue(fund.name,fund.provider,data):"No unique fund was found for this filename.";
        if(!data.description&&!data.objective)
          error=error??"Fund description was not recovered from this PDF.";
      }catch(e){
        error=e instanceof Error?e.message.slice(0,220):"Extraction failed.";
      }
      const status=data&&!error?"parsed":"needs_review";
      // Save the attempt even when OCR failed; do not loop indefinitely on corrupt PDFs.
      // Never overwrite an existing successful result with a null payload.
      await sql.query(
        "INSERT INTO fund_source_factsheets "+
        "(import_id,status,data,error_message,content_attempted_version) "+
        "VALUES ($1::uuid,$2,$3::jsonb,$4,$5) ON CONFLICT(import_id) DO UPDATE SET "+
        "status=EXCLUDED.status,"+
        "data=CASE WHEN EXCLUDED.data IS NULL THEN fund_source_factsheets.data "+
        "WHEN fund_source_factsheets.data IS NULL THEN EXCLUDED.data "+
        "ELSE fund_source_factsheets.data || jsonb_strip_nulls(EXCLUDED.data) END,"+
        "error_message=EXCLUDED.error_message,"+
        "content_attempted_version=EXCLUDED.content_attempted_version,processed_at=now()",
        [id,status,data&&status==="parsed"?JSON.stringify(data):null,error,CONTENT_METADATA_VERSION]
      );
      // Update only matching linked fund content; never modify workbook return rows.
      if(status==="parsed"&&data&&fund&&data.providerHint===fund.provider)
        await sql.query(
          "UPDATE fund_reconciliations SET extracted_factsheet=$1::jsonb,updated_at=now() "+
          "WHERE fund_id=$2 AND factsheet_import_id=$3::uuid",
          [JSON.stringify(data),fund.id,id]
        );
      results.push({filename,status,message:error});
    }
    const left=await sql.query(
      "SELECT COUNT(*)::int AS n FROM imports i LEFT JOIN fund_source_factsheets f "+
      "ON f.import_id=i.id WHERE i.storage_key LIKE 'funds/factsheets/%' "+
      "AND i.filename ILIKE '%.pdf' AND COALESCE(f.content_attempted_version,0)<$1",
      [CONTENT_METADATA_VERSION]
    );
    console.info("Fund enrichment progress: batch="+results.length+
      " remaining="+Number(left[0].n)+" review="+results.filter(r=>r.status==="needs_review").length);
    return NextResponse.json({processed:results.length,remaining:Number(left[0].n),
      results,done:Number(left[0].n)===0},{headers});
  }catch(error){
    const message=error instanceof Error?error.message:"Unknown enrichment failure";
    console.error("Fund enrichment batch failed:",message.slice(0,200));
    return NextResponse.json({error:"Unable to process this PDF batch. Check the audit, then retry."},
      {status:500,headers});
  }
}
