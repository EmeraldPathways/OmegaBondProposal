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
      "FROM imports i LEFT JOIN fund_source_factsheets f ON f.impor¶»§q«^