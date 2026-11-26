import type {NeonQueryFunction} from "@neondatabase/serverless";
import type {PriceHistorySnapshot} from "@/lib/reconciliation/monthly-prices";

type Sql=NeonQueryFunction<false,false>;
export type PriceSnapshotSource={
  snapshotId:string;sourceFile:string;sourceSha256:string;
  workbookImportId?:string|null;
};
export async function ensureMonthlyPriceTables(sql:Sql){
  await sql.query("CREATE TABLE IF NOT EXISTS fund_price_snapshots ("+
    "snapshot_id text PRIMARY KEY,"+
    "workbook_import_id uuid REFERENCES imports(id),"+
    "source_filename text NOT NULL,source_sha256 text NOT NULL,"+
    "source_sheet text NOT NULL DEFAULT 'PRICES',"+
    "period_start date NOT NULL,period_end date NOT NULL,"+
    "period_count integer NOT NULL,fund_count integer NOT NULL,"+
    "observation_count integer NOT NULL,"+
    "imported_at timestamptz NOT NULL DEFAULT now())");
  await sql.query("CREATE TABLE IF NOT EXISTS fund_price_points ("+
    "snapshot_id text NOT NULL REFERENCES fund_price_snapshots(snapshot_id) ON DELETE CASCADE,"+
    "fund_id text NOT NULL,observation_date date NOT NULL,"+
    "source_label text NOT NULL,cumulative_return_pct numeric(16,4) NOT NULL,"+
    "PRIMARY KEY(snapshot_id,fund_id,observation_date))");
  await sql.query("CREATE INDEX IF NOT EXISTS fund_price_points_lookup "+
    "ON fund_price_points(fund_id,snapshot_id,observation_date)");
  await sql.query("CREATE TABLE IF NOT EXISTS fund_price_current ("+
    "only_one integer PRIMARY KEY CHECK (only_one=1),"+
    "snapshot_id text NOT NULL REFERENCES fund_price_snapshots(snapshot_id),"+
    "activated_at timestamptz NOT NULL DEFAULT now())");
}
export async function currentPriceSnapshot(sql:Sql){
  await ensureMonthlyPriceTables(sql);
  const rows=await sql.query("SELECT s.snapshot_id,s.source_filename,s.source_sha256,"+
    "period_start::text AS start,period_end::text AS end,period_count,fund_count,observation_count "+
    "FROM fund_price_snapshots s "+
    "JOIN fund_price_current c ON c.snapshot_id=s.snapshot_id AND c.only_one=1 LIMIT 1");
  return rows[0]??null;
}
export async function persistMonthlyPriceSnapshot(
  sql:Sql,source:PriceSnapshotSource,snapshot:PriceHistorySnapshot,activate:boolean
){
  await ensureMonthlyPriceTables(sql);
  if(!/^[a-f0-9]{64}$/.test(source.snapshotId)||
      source.snapshotId!==source.sourceSha256)
    throw new Error("Price import identity must be the original workbook SHA-256.");
  const existing=await sql.query("SELECT snapshot_id,source_sha256,observation_count "+
    "FROM fund_price_snapshots WHERE snapshot_id=$1",[source.snapshotId]);
  if(existing.length&&String(existing[0].source_sha256)!==source.sourceSha256)
    throw new Error("Price snapshot SHA mismatch.");
  await sql.query("INSERT INTO fund_price_snapshots "+
    "(snapshot_id,workbook_import_id,source_filename,source_sha256,period_start,period_end,"+
    "period_count,fund_count,observation_count) "+
    "VALUES ($1,$2::uuid,$3,$4,$5::date,$6::date,$7,$8,$9) "+
    "ON CONFLICT (snapshot_id) DO UPDATE SET "+
    "workbook_import_id=COALESCE(EXCLUDED.workbook_import_id,fund_price_snapshots.workbook_import_id),"+
    "source_filename=EXCLUDED.source_filename",
    [source.snapshotId,source.workbookImportId??null,source.sourceFile,
      source.sourceSha256,snapshot.start,snapshot.end,snapshot.periods.length,
      snapshot.fundCount,snapshot.pointCount]);
  const currentCount=await sql.query(
    "SELECT COUNT(*)::int AS n FROM fund_price_points WHERE snapshot_id=$1",[source.snapshotId]);
  if(Number(currentCount[0]?.n)!==snapshot.pointCount){
    await sql.query("DELETE FROM fund_price_points WHERE snapshot_id=$1",[source.snapshotId]);
    const records=snapshot.funds.flatMap(f=>f.points.map(point=>({
      fundId:f.fundId,date:point.date,label:point.label,value:point.returnPct
    })));
    for(let offset=0;offset<records.length;offset+=350){
      const batch=JSON.stringify(records.slice(offset,offset+350));
      await sql.query("INSERT INTO fund_price_points "+
        "(snapshot_id,fund_id,observation_date,source_label,cumulative_return_pct) "+
        "SELECT $1,p.\"fundId\",p.date::date,p.label,p.value "+
        "FROM jsonb_to_recordset($2::jsonb) "+
        "AS p(\"fundId\" text,date text,label text,value numeric)",
        [source.snapshotId,batch]);
    }
  }
  const verified=await sql.query("SELECT COUNT(*)::int AS n,"+
    "COUNT(DISTINCT fund_id)::int AS funds FROM fund_price_points WHERE snapshot_id=$1",
    [source.snapshotId]);
  if(Number(verified[0]?.n)!==snapshot.pointCount||
     Number(verified[0]?.funds)!==snapshot.fundCount)
    throw new Error("Price import database totals differ from the original PRICES worksheet.");
  if(activate)await activateMonthlyPriceSnapshot(sql,source.snapshotId);
  return {points:snapshot.pointCount,funds:snapshot.fundCount,
    missing:snapshot.missingCount,periods:snapshot.periods.length,
    start:snapshot.start,end:snapshot.end,activated:activate};
}
export async function activateMonthlyPriceSnapshot(sql:Sql,snapshotId:string){
  const result=await sql.query("SELECT snapshot_id FROM fund_price_snapshots WHERE snapshot_id=$1",
    [snapshotId]);
  if(!result.length)throw new Error("Cannot activate missing PRICES snapshot.");
  await sql.query("INSERT INTO fund_price_current(only_one,snapshot_id) "+
    "VALUES (1,$1) ON CONFLICT(only_one) DO UPDATE SET "+
    "snapshot_id=EXCLUDED.snapshot_id,activated_at=now()",[snapshotId]);
}
export async function readActiveFundPricePoints(sql:Sql,fundIds:readonly string[]){
  if(!fundIds.length)return [];
  await ensureMonthlyPriceTables(sql);
  const rows=await sql.query("SELECT p.fund_id,"+
    "p.observation_date::text AS date,p.source_label AS label,"+
    "p.cumulative_return_pct::float8 AS return_pct,"+
    "s.source_filename,s.period_start::text AS start,s.period_end::text AS end "+
    "FROM fund_price_points p "+
    "JOIN fund_price_current c ON c.snapshot_id=p.snapshot_id AND c.only_one=1 "+
    "JOIN fund_price_snapshots s ON s.snapshot_id=p.snapshot_id "+
    "WHERE p.fund_id=ANY($1::text[]) "+
    "ORDER BY p.fund_id,p.observation_date",[fundIds]);
  return rows.map(r=>({
    fundId:String(r.fund_id),date:String(r.date).slice(0,10),
    label:String(r.label),returnPct:Number(r.return_pct),
    sourceFile:String(r.source_filename),windowStart:String(r.start).slice(0,10),
    windowEnd:String(r.end).slice(0,10)
  }));
}

