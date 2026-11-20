import "server-only";
import {APPROVED_FUNDS,type ApprovedFund} from "@/lib/approved-funds";
import {getNeonSql} from "@/lib/server/neon";

const namesTable="fund_active_names";
export async function ensureActiveFundNamesTable(){
  const sql=getNeonSql();
  await sql.query("CREATE TABLE IF NOT EXISTS "+namesTable+" ("+
    "fund_id text PRIMARY KEY,provider text NOT NULL,name text NOT NULL,"+
    "workbook_import_id uuid NOT NULL REFERENCES imports(id),"+
    "updated_at timestamptz NOT NULL DEFAULT now())");
}

/** The latest imported workbook is authoritative for names, while stable fund IDs
 * and provider counts stay fixed to the original 115-fund universe. */
export async function getActiveFunds():Promise<ApprovedFund[]>{
  const sql=getNeonSql();
  const exists=await sql.query("SELECT to_regclass('public.fund_active_names') IS NOT NULL AS present");
  if(!exists[0]?.present)return APPROVED_FUNDS;
  const names=await sql.query("SELECT fund_id,provider,name FROM fund_active_names");
  if(names.length!==APPROVED_FUNDS.length)return APPROVED_FUNDS;
  const indexed=new Map(names.map(r=>[String(r.fund_id),r]));
  if(APPROVED_FUNDS.some(f=>!indexed.has(f.id) ||
      indexed.get(f.id)!.provider!==f.provider))return APPROVED_FUNDS;
  return APPROVED_FUNDS.map(f=>({...f,name:String(indexed.get(f.id)!.name)}));
}
