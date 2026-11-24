/** One-time, idempotent source-backed backfill of all 107 official factsheets.
 * Runs only during the final production build. Never touches performance rows,
 * fund names, portfolio allocations, or the original private Blob objects. */
import {neon} from "@neondatabase/serverless";
import {get} from "@vercel/blob";
import {extractFundFactsheet} from "../src/lib/reconciliation/factsheet.ts";
import {CONTENT_METADATA_VERSION} from "../src/lib/reconciliation/factsheet-content.ts";
import {workbookNameKey,pdfFilenameFundKey} from "../src/lib/reconciliation/workbook-source.ts";
import type {FactSheetData} from "../src/lib/reconciliation/engine.ts";

const prefix="[Omega factsheet content backfill]";
if(process.env.VERCEL_ENV!=="production"){
  console.info(prefix,"Skipped: non-production build.");
}else{
  if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL missing for source backfill.");
  const sql=neon(process.env.DATABASE_URL);
  const version=CONTENT_METADATA_VERSION;
  await sql.query("ALTER TABLE fund_source_factsheets ADD COLUMN IF NOT EXISTS "+
    "content_attempted_version integer NOT NULL DEFAULT 0");
  const [funds,all]=await Promise.all([
    sql.query("SELECT fund_id,provider,name FROM fund_active_names"),
    sql.query("SELECT i.id::text AS id,i.filename,i.storage_key,"+
      "f.data AS old_data,f.status AS old_status,"+
      "COALESCE(f.content_attempted_version,0)::int AS attempted "+
      "FROM imports i LEFT JOIN fund_source_factsheets f ON f.import_id=i.id "+
      "WHERE i.storage_key LIKE 'funds/factsheets/%' "+
      "AND i.filename ILIKE '%.pdf' ORDER BY i.filename")
  ]);
  if(funds.length!==107||all.length!==107)
    throw new Error("Factsheet backfill requires exactly 107 registered funds and PDFs.");

  const names=new Map(funds.map(f=>[workbookNameKey(String(f.name)),f]));
  const toRefresh=all.filter(f=>{
    const old=(f.old_data??{}) as FactSheetData;
    return Number(f.attempted)<version||Number(old.metadataVersion??0)<version;
  });
  const providerTotals:Record<string,{checked:number;recovered:number;ocr:number;dates:number;risks:number;managers:number;assetMix:number}>={};
  const failures:string[]=[];
  console.info(prefix,"Source PDFs:",all.length,"pending revision:",toRefresh.length,
    "parser version:",version);

  async function processOne(file:(typeof all)[number]){
    const filename=String(file.filename),id=String(file.id);
    const fund=names.get(pdfFilenameFundKey(filename));
    let extracted:FactSheetData|null=null,problem:string|null=null;
    if(!fund)problem="No exact workbook fund for filename";
    try{
      if(!problem){
        const blob=await get(String(file.storage_key),{access:"private"});
        if(!blob||blob.statusCode!==200)throw new Error("Stored private PDF unavailable");
        const bytes=new Uint8Array(await new Response(blob.stream).arrayBuffer());
        if(bytes.byteLength<100||bytes.byteLength>3_500_000||
           Buffer.from(bytes.subarray(0,5)).toString("ascii")!=="%PDF-")
          throw new Error("Stored PDF is invalid or outside permitted size");
        extracted=await extractFundFactsheet({
          importId:id,filename,data:bytes,ocrFallback:true
        });
        const narrative=(extracted.description??extracted.objective??"").trim();
        if(extracted.providerHint!==String(fund?.provider))
          problem="Provider mismatch between document and exact workbook fund";
        else if(!narrative||narrative.length<18)
          problem="No sufficiently readable source description";
        else if(String(fund?.provider)==="New Ireland" &&
          /\b(?:Managed\s+By\s*:|Style\s*:|Asset\s+Mix\s*:|SFDR\s*\*?\s*Classification\s*:|Performance\s+as\s+at)\b/i.test(narrative))
          problem="Extracted narrative includes unrelated factsheet metadata";
      }
    }catch(error){
      problem=error instanceof Error?error.message.slice(0,170):"PDF processing failed";
    }
    const valid=Boolean(extracted&&!problem&&fund);
    const provider=String(fund?.provider??"Unmatched");
    const stat=providerTotals[provider]??{
      checked:0,recovered:0,ocr:0,dates:0,risks:0,managers:0,assetMix:0
    };
    providerTotals[provider]=stat;
    stat.checked++;
    if(valid&&extracted){
      stat.recovered++;
      if(extracted.extractionMethod==="ocr_first_page")stat.ocr++;
      if(extracted.asOf)stat.dates++;
      if(extracted.riskProfile||extracted.riskRating!=null||
          extracted.riskDisclosure||extracted.riskFactors?.length)stat.risks++;
      if(extracted.managedBy)stat.managers++;
      if(extracted.assetMix)stat.assetMix++;
    }else failures.push(filename+": "+(problem??"Unknown issue"));
    // Persist only source data, preserving previously verified values when new
    // OCR returns null. Mark genuine failures for review, never as complete.
    // Only persist newly parsed content after validation. Do not let a
    // transient OCR failure overwrite an existing verified JSON record.
    const newJson=valid&&extracted?JSON.stringify(extracted):null;
    await sql.query("INSERT INTO fund_source_factsheets "+
      "(import_id,status,data,error_message,content_attempted_version) "+
      "VALUES ($1::uuid,$2,$3::jsonb,$4,$5) "+
      "ON CONFLICT (import_id) DO UPDATE SET "+
      "data=CASE WHEN EXCLUDED.data IS NULL THEN fund_source_factsheets.data "+
      "WHEN fund_source_factsheets.data IS NULL THEN EXCLUDED.data "+
      "ELSE fund_source_factsheets.data || jsonb_strip_nulls(EXCLUDED.data) END,"+
      "status=EXCLUDED.status,error_message=EXCLUDED.error_message,"+
      "content_attempted_version=EXCLUDED.content_attempted_version,processed_at=now()",
      [id,valid?"parsed":(file.old_status==="parsed"?"parsed":"needs_review"),newJson,problem,version]);
    if(valid&&extracted&&fund){
      await sql.query("UPDATE fund_reconciliations SET "+
        "extracted_factsheet=COALESCE(extracted_factsheet,'{}'::jsonb) "+
        "|| jsonb_strip_nulls($1::jsonb),updated_at=now() "+
        "WHERE fund_id=$2 AND factsheet_import_id=$3::uuid",
        [newJson,String(fund.fund_id),id]);
    }
  }

  // Native PDF renderers and OCR workers have meaningful memory overhead.
  for(let i=0;i<toRefresh.length;i+=2)
    await Promise.all(toRefresh.slice(i,i+2).map(processOne));

  const checked=await sql.query("SELECT "+
    "COUNT(*)::int AS total,"+
    "COUNT(*) FILTER (WHERE f.status='parsed')::int AS parsed,"+
    "COUNT(*) FILTER (WHERE (f.data->>'metadataVersion')::int >= $1)::int AS current,"+
    "COUNT(*) FILTER (WHERE COALESCE(f.data->>'description',f.data->>'objective','')<>'')::int AS described "+
    "FROM fund_source_factsheets f "+
    "INNER JOIN imports i ON i.id=f.import_id "+
    "WHERE i.storage_key LIKE 'funds/factsheets/%' AND i.filename ILIKE '%.pdf'",
    [version]);
  console.info(prefix,JSON.stringify({
    checked:toRefresh.length,providerTotals,
    remainingForReview:failures.length,
    failures:failures.slice(0,30),
    database:checked[0]
  }));
  if(Number(checked[0]?.total)!==107)
    throw new Error("Fund database no longer contains exactly 107 source records.");
  if(Number(checked[0]?.current)!==107)
    console.warn(prefix,"Not all source PDFs reached the new extraction version; "+
      "exceptions remain flagged for review and will not appear as verified proposal content.");
}

