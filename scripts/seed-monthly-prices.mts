/** One-time source-backed PRICES import for the initial November 2026 dataset.
 * Never overwrites a more recent workbook import.
 * Later monthly workbooks are imported by the existing protected web UI action. */
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {brotliDecompressSync} from "node:zlib";
import {join} from "node:path";
import {neon} from "@neondatabase/serverless";
import {validatePriceMatrix} from "../src/lib/reconciliation/monthly-prices.ts";
import {currentPriceSnapshot,persistMonthlyPriceSnapshot}
  from "../src/lib/server/fund-prices.ts";

const tag="[Omega five-year prices]";
if(process.env.VERCEL_ENV!=="production"){
  console.info(tag,"Skipped outside production.");
}else{
  if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL missing for price import.");
  const sql=neon(process.env.DATABASE_URL);
  const seed=readFileSync(join(process.cwd(),
    "scripts/seeds/omega-prices-nov-2026.json.br"));
  if(createHash("sha256").update(seed).digest("hex")!==
      "db4968b63613702a2082c2177b04bd42793c30a64e67c5635765086fbb81dc6e")
    throw new Error("Stored November 2026 PRICES seed differs from the original.");
  const source=JSON.parse(brotliDecompressSync(seed).toString("utf8")) as {
    sourceFile:string;sourceSha256:string;sourceSheet:string;
    headers:string[];funds:[string,string,(number|null)[]][];
  };
  if(source.sourceSheet!=="PRICES"||
     source.sourceSha256!=="87bc789b03cca615e7eb56f4b507b57c61de49bb5729f2e0b63f8cce455cd6f1")
    throw Error("Initial PRICES source verification failed.");
  const rows=await sql.query("SELECT fund_id AS id,provider,name FROM fund_active_names");
  if(rows.length!==107)throw new Error("107 active fund names required before monthly-price seed.");
  const workbookFunds=rows.map(r=>({
    id:String(r.id),provider:String(r.provider),name:String(r.name)
  })) as Parameters<typeof validatePriceMatrix>[2];
  const parsed=validatePriceMatrix(source.headers,source.funds.map(f=>({
    provider:f[0],name:f[1],values:f[2]
  })),workbookFunds);
  if(parsed.fundCount!==107||parsed.periods.length!==61||
     parsed.pointCount!==6314||parsed.missingCount!==213)
    throw new Error("The initial seed does not match the uploaded 24-Nov-2026 PRICES data.");
  const active=await currentPriceSnapshot(sql);
  if(active && active.snapshot_id!==source.sourceSha256){
    console.info(tag,"Skipped original seed: newer monthly source is already active.",
      JSON.stringify({activeSource:active.source_filename,activePoints:active.observation_count}));
  }else{
    const imported=await persistMonthlyPriceSnapshot(sql,{
      snapshotId:source.sourceSha256,
      sourceSha256:source.sourceSha256,
      sourceFile:source.sourceFile,
      workbookImportId:null
    },parsed,true);
    console.info(tag,"Imported and verified",JSON.stringify(imported));
  }
  const activeAfter=await currentPriceSnapshot(sql);
  if(!activeAfter||Number(activeAfter.fund_count)!==107)
    throw Error("No active 107-fund monthly price history found after seeding.");
  console.info(tag,"ACTIVE",JSON.stringify(activeAfter));
}
