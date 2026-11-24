/** Bounded one-off production repair of previously unreadable New Ireland PDFs.
 * Runs in the trusted deployment build where Neon and private Blob access exist.
 * Only updates factsheet metadata and matching reconciliation JSON.
 * It NEVER modifies fund names, workbook returns, approval or portfolio records. */
import {neon} from "@neondatabase/serverless";
import {get} from "@vercel/blob";
import {extractFundFactsheet} from "../src/lib/reconciliation/factsheet.ts";
import {workbookNameKey,pdfFilenameFundKey} from "../src/lib/reconciliation/workbook-source.ts";
import type {FactSheetData} from "../src/lib/reconciliation/engine.ts";

const REPAIR_VERSION=2;
const prefix="[Omega New Ireland OCR repair]";
if(process.env.VERCEL_ENV!=="production"){
  console.log(prefix,"Skipped outside production build.");
}else if(!process.env.DATABASE_URL){
  console.log(prefix,"Skipped: database connection is not available.");
}else{
  const sql=neon(process.env.DATABASE_URL);
  const errors:Record<string,number>={};
  let repaired=0,unreadable=0,skipped=0,selected=0;
  const extractionMethods:Record<string,number>={};
  try{
    await sql.query("ALTER TABLE fund_source_factsheets "+
      "ADD COLUMN IF NOT EXISTS ocr_repair_attempted_version integer NOT NULL DEFAULT 0");
    const [funds,files]=await Promise.all([
      sql.query("SELECT fund_id,provider,name FROM fund_active_names "+
        "WHERE provider='New Ireland'"),
      sql.query("SELECT i.id::text AS id,i.filename,i.storage_key "+
        "FROM imports i INNER JOIN fund_source_factsheets f ON f.import_id=i.id "+
        "WHERE i.storage_key LIKE 'funds/factsheets/%' "+
        "AND i.filename ILIKE 'New Ireland%.pdf' "+
        "AND f.status='needs_review' "+
        "AND COALESCE(f.data->>'description','')='' "+
        "AND COALESCE(f.data->>'objective','')='' "+
        "AND COALESCE(f.ocr_repair_attempted_version,0)<$1 "+
        "ORDER BY i.filename LIMIT 40",[REPAIR_VERSION])
    ]);
    const byName=new Map(funds.map(f=>[workbookNameKey(String(f.name)),f]));
    selected=files.length;
    console.log(prefix,"Eligible scanned documents:",selected);
    const repair=async(file:(typeof files)[number])=>{
      const id=String(file.id),filename=String(file.filename);
      const fund=byName.get(pdfFilenameFundKey(filename));
      if(!fund){skipped++;return}
      let parsed:FactSheetData|null=null;
      let issue:string|null=null;
      try{
        const blob=await get(String(file.storage_key),{access:"private"});
        if(!blob||blob.statusCode!==200)throw new Error("Blob source unavailable");
        const bytes=new Uint8Array(await new Response(blob.stream).arrayBuffer());
        if(bytes.length<100||bytes.length>3_500_000||
          Buffer.from(bytes.subarray(0,5)).toString("ascii")!=="%PDF-")
          throw new Error("PDF validation failed");
        parsed=await extractFundFactsheet({importId:id,filename,data:bytes,ocrFallback:true});
        const method=parsed.extractionMethod??"unknown";
        extractionMethods[method]=(extractionMethods[method]??0)+1;
        const lastOcrWarning=parsed.extractionWarnings.find(x=>x.startsWith("OCR failed:"));
        if(lastOcrWarning){
          const warning=lastOcrWarning.slice(0,180);
          errors[warning]=(errors[warning]??0)+1;
        }
        if(parsed.providerHint!=="New Ireland")
          issue="Provider could not be verified from PDF";
        else if(!parsed.description&&!parsed.objective)
          issue="Fund description still unreadable";
      }catch(err){
        issue=err instanceof Error?err.message.slice(0,140):"PDF read failed";
      }
      const valid=Boolean(parsed&&!issue);
      if(valid)repaired++;else unreadable++;
      // Preserve pre-existing source data when OCR is less complete.
      await sql.query(
        "UPDATE fund_source_factsheets SET "+
        "data=CASE WHEN $2::jsonb IS NULL THEN data "+
        "ELSE COALESCE(data,'{}'::jsonb) || jsonb_strip_nulls($2::jsonb) END,"+
        "status=$3,error_message=$4,ocr_repair_attempted_version=$5,"+
        "processed_at=now() WHERE import_id=$1::uuid",
        [id,parsed?JSON.stringify(parsed):null,valid?"parsed":"needs_review",
          issue,REPAIR_VERSION]
      );
      if(valid){
        // Source is linked only to the exact approved filename, not to a
        // similarity match from OCR text.
        await sql.query(
          "UPDATE fund_reconciliations SET extracted_factsheet=$1::jsonb,updated_at=now() "+
          "WHERE fund_id=$2 AND factsheet_import_id=$3::uuid",
          [JSON.stringify(parsed),String(fund!.fund_id),id]
        );
      }else errors[issue??"Unknown"]=(errors[issue??"Unknown"]??0)+1;
    };
    // Limit OCR memory to two native canvases and Tesseract workers.
    for(let i=0;i<files.length;i+=2)
      await Promise.all(files.slice(i,i+2).map(repair));
    const after=await sql.query("SELECT COUNT(*)::int AS n "+
      "FROM fund_source_factsheets f JOIN imports i ON i.id=f.import_id "+
      "WHERE i.filename ILIKE 'New Ireland%.pdf' AND f.status='needs_review'");
    console.log(prefix,JSON.stringify({
      selected,repaired,unreadable,skipped,remainingForReview:Number(after[0]?.n??0),
      extractionMethods,failureTypes:errors
    }));
  }catch(error){
    // Never block deployment or rewrite workbook returns because optional OCR
    // failed. Errors are reported by category, not with PDF content or secrets.
    console.error(prefix,"Nonfatal repair error:",error instanceof Error?error.message.slice(0,170):"unknown");
  }
}
