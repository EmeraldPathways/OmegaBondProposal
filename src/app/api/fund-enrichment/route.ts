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
  if(doc.prov¶»§q«^