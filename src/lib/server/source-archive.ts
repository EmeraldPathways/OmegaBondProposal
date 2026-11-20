import "server-only";
import {APPROVED_FUNDS,type ApprovedFund} from "@/lib/approved-funds";
import {getNeonSql} from "@/lib/server/neon";

/** Files and manual decisions are versioned: an archived source can never
 * silently participate in a later workbook/PDF reconciliation. */
export async function ensureSourceArchiveSchema(){
  const sql=getNeonSql();
  await sql.query("CREATE TABLE IF NOT EXISTS fund_source_archives ("+
    "id uuid PRIMARY KEY DEFAULT gen_random_uuid(), archived_at timestamptz NOT NULL DEFAULT now(),"+
    "archived_by text NOT NULL, document_count integer NOT NULL DEFAULT 0)");
  await sql.query("CREATE TABLE IF NOT EXISTS fund_archived_imports ("+
    "import_id uuid PRIMARY KEY REFERENCES imports(id), archive_id uuid NOT NULL REFERENCES fund_source_archives(id),"+
    "archived_at timestamptz NOT NULL DEFAULT now())");
  await sql.query("CREATE TABLE IF NOT EXISTS fund_source_archive_history ("+
    "archive_id uuid NOT NULL REFERENCES fund_source_archives(id),"+
    "kind text NOT NULL, record_id text NOT NULL, payload jsonb NOT NULL,"+
    "PRIMARY KEY (archive_id,kind,record_id))");
  await sql.query("CREATE TABLE IF NOT EXISTS fund_source_fund_names ("+
    "fund_id text PRIMARY KEY,provider text NOT NULL,approved_name text NOT NULL,"+
    "workbook_import_id uuid NOT NULL REFERENCES imports(id),"+
    "updated_at timestamptz NOT NULL DEFAULT now())");
}

export async function activeFunds():Promise<ApprovedFund[]>{
  await ensureSourceArchiveSchema();
  const sql=getNeonSql();
  const rows=await sql.query([
    "SELECT n.fund_id,n.provider,n.approved_name FROM fund_source_fund_names n",
    "WHERE NOT EXISTS(SELECT 1 FROM fund_archived_imports a WHERE a.import_id=n.workbook_import_id)"
  ].join(" "));
  if(rows.length!==APPROVED_FUNDS.length)return APPROVED_FUNDS;
  const mapped=new Map(rows.map(row=>[String(row.fund_id),row]));
  if(APPROVED_FUNDS.some(f=>!mapped.has(f.id)))return APPROVED_FUNDS;
  return APPROVED_FUNDS.map(f=>({...f,name:String(mapped.get(f.id)!.approved_name)}));
}
export const activeSourceClause="NOT EXISTS(SELECT 1 FROM fund_archived_imports archived WHERE archived.import_id=i.id)";
