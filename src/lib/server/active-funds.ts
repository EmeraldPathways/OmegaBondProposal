import "server-only";
import {APPROVED_FUNDS,type ApprovedFund} from "@/lib/approved-funds";
import {getNeonSql} from "@/lib/server/neon";
import {CURRENT_FUND_TOTAL} from "@/lib/reconciliation/workbook-source";

export async function ensureActiveFundNamesTable(){
  const sql=getNeonSql();
  await sql.query("CREATE TABLE IF NOT EXISTS fund_active_names ("+
    "fund_id text PRIMARY KEY,provider text NOT NULL,name text NOT NULL,"+
    "workbook_import_id uuid NOT NULL REFERENCES imports(id),"+
    "sort_order integer,updated_at timestamptz NOT NULL DEFAULT now())");
  await sql.query("ALTER TABLE fund_active_names ADD COLUMN IF NOT EXISTS sort_order integer");
}

/** The latest corrected workbook determines the fund universe and all names.
 * Legacy 115-fund entries remain visible only before the clean reset; after
 * the reset an empty catalogue means the user needs to import the new XLSX. */
export async function getActiveFunds():Promise<ApprovedFund[]>{
  const sql=getNeonSql();
  const table=await sql.query("SELECT to_regclass('public.fund_active_names') IS NOT NULL AS present");
  if(!table[0]?.present){
    const legacy=await sql.query(
      "SELECT id FROM imports WHERE storage_key LIKE 'funds/performance/%' LIMIT 1");
    return legacy.length?APPROVED_FUNDS:[];
  }
  const columns=await sql.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='public' "+
    "AND table_name='fund_active_names' AND column_name='sort_order'");
  const ordered=columns.length?
    " ORDER BY sort_order NULLS LAST,provider,name":
    " ORDER BY provider,name";
  const rows=await sql.query("SELECT fund_id,provider,name FROM fund_active_names"+ordered);
  if(!rows.length)return [];
  if(rows.length===APPROVED_FUNDS.length){
    // Backward compatibility for records imported before the clean reset.
    const legacy=new Map(rows.map(r=>[String(r.fund_id),r]));
    if(APPROVED_FUNDS.every(f=>legacy.has(f.id)))
      return APPROVED_FUNDS.map(f=>({...f,name:String(legacy.get(f.id)!.name)}));
  }
  if(rows.length!==CURRENT_FUND_TOTAL)
    throw new Error("Active fund catalogue is incomplete; re-import the corrected workbook.");
  return rows.map(row=>({
    id:String(row.fund_id),
    provider:String(row.provider) as ApprovedFund["provider"],
    name:String(row.name)
  }));
}
