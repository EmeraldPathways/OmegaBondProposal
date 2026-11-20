import {del} from "@vercel/blob";
import {NextResponse} from "next/server";
import {auth,ADMIN_EMAIL,isLoginConfigured} from "@/auth";
import {getNeonSql} from "@/lib/server/neon";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
const pathFilter="(storage_key LIKE 'funds/factsheets/%' OR storage_key LIKE 'funds/performance/%')";

async function allowed(){
  return isLoginConfigured()&&(await auth())?.user?.email?.toLowerCase()===ADMIN_EMAIL;
}
async function cleanupBatch(){
  const sql=getNeonSql();
  const pending=await sql.query("SELECT storage_key FROM fund_source_purge ORDER BY created_at LIMIT 25");
  let removed=0;
  for(const row of pending){
    const path=String(row.storage_key);
    try{
      await del(path);
      await sql.query("DELETE FROM fund_source_purge WHERE storage_key=$1",[path]);
      removed++;
    }catch(error){
      console.error("Private source Blob deletion pending",error instanceof Error?error.name:"Unknown");
    }
  }
  const remaining=await sql.query("SELECT COUNT(*)::int AS count FROM fund_source_purge");
  return {removed,pending:Number(remaining[0]?.count??0)};
}

export async function POST(request:Request){
  if(!await allowed())return NextResponse.json({error:"Unauthorised"},{status:401,headers});
  if(request.headers.get("origin")!==new URL(request.url).origin)
    return NextResponse.json({error:"Invalid origin"},{status:403,headers});
  const payload=await request.json().catch(()=>null);
  if(!payload||!["start","continue"].includes(payload.phase))
    return NextResponse.json({error:"Invalid reset phase"},{status:400,headers});
  if(payload.phase==="start"&&payload.confirm!=="DELETE_OLD_FUND_SOURCES")
    return NextResponse.json({error:"Explicit deletion confirmation required"},{status:422,headers});
  try{
    const sql=getNeonSql();
    await sql.query("CREATE TABLE IF NOT EXISTS fund_source_purge ("+
      "storage_key text PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT now())");
    if(payload.phase==="start"){
      // This single database statement is atomic: no partial source metadata
      // deletion if a foreign-key constraint or old schema prevents the reset.
      // Original blobs are queued, then deleted in short retryable batches.
      const reset=`
        DO $reset$
        BEGIN
          CREATE TABLE IF NOT EXISTS fund_review_history (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            reset_at timestamptz NOT NULL DEFAULT now(),
            original_fund_id text NOT NULL,
            previous_review jsonb NOT NULL
          );
          INSERT INTO fund_source_purge(storage_key)
            SELECT storage_key FROM imports WHERE ${pathFilter}
            ON CONFLICT(storage_key) DO NOTHING;
          IF to_regclass('public.fund_identity_reviews') IS NOT NULL THEN
            INSERT INTO fund_review_history(original_fund_id,previous_review)
              SELECT fund_id,to_jsonb(m) FROM fund_identity_reviews m;
            DELETE FROM fund_identity_reviews;
          END IF;
          IF to_regclass('public.approved_fund_review') IS NOT NULL THEN
            DELETE FROM approved_fund_review;
          END IF;
          IF to_regclass('public.fund_reconciliations') IS NOT NULL THEN
            DELETE FROM fund_reconciliations;
          END IF;
          IF to_regclass('public.fund_active_names') IS NOT NULL THEN
            DELETE FROM fund_active_names;
          END IF;
          IF to_regclass('public.fund_source_performance') IS NOT NULL THEN
            DELETE FROM fund_source_performance;
          END IF;
          IF to_regclass('public.fund_source_factsheets') IS NOT NULL THEN
            DELETE FROM fund_source_factsheets;
          END IF;
          IF to_regclass('public.factsheets') IS NOT NULL THEN
            DELETE FROM factsheets WHERE import_id IN
              (SELECT id FROM imports WHERE ${pathFilter});
          END IF;
          IF to_regclass('public.price_observations') IS NOT NULL THEN
            DELETE FROM price_observations WHERE import_id IN
              (SELECT id FROM imports WHERE ${pathFilter});
          END IF;
          DELETE FROM imports WHERE ${pathFilter};
        END
        $reset$;
      `;
      await sql.query(reset);
    }
    const batch=await cleanupBatch();
    return NextResponse.json({reset:true,...batch,hasMore:batch.pending>0,
      message:batch.pending?
        "Old source records reset. Private Blob deletion continues.":
        "Old source files removed. Upload the corrected workbook and replacement PDFs."},{headers});
  }catch(error){
    console.error("Fund source reset failed",error instanceof Error?error.name:"Unknown");
    return NextResponse.json({error:"The reset could not be completed. No new sources were activated. Contact support if it persists."},
      {status:500,headers});
  }
}
