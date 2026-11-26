/** Read-only production integrity check for user-approved 1–7 fund risk register. */
import {neon} from "@neondatabase/serverless";
import {FUND_RISK_DATA,getFundRiskRating} from "../src/lib/fund-risk-ratings.ts";
if(process.env.VERCEL_ENV!=="production"||!process.env.DATABASE_URL){
  console.log("[Omega risk audit] skipped (no production DB)");
}else{
  const sql=neon(process.env.DATABASE_URL);
  const rows=await sql.query(
    "SELECT provider,name FROM fund_active_names ORDER BY provider,name"
  );
  const missing=rows.filter(row=>!getFundRiskRating({
    provider:String(row.provider),name:String(row.name)
  })).map(row=>String(row.provider)+": "+String(row.name));
  const invalid=FUND_RISK_DATA.filter(row=>row.rating!==null&&
    (!Number.isInteger(row.rating)||row.rating<1||row.rating>7));
  const exceptions=FUND_RISK_DATA.filter(row=>row.rating===null);
  const matched=rows.length-missing.length;
  console.log("[Omega risk audit] fundRows="+rows.length+
    " matched="+matched+" ratings="+(FUND_RISK_DATA.length-exceptions.length)+
    " unverified="+exceptions.length);
  if(missing.length)console.error("[Omega risk audit] unmatched active names="+missing.join(" | "));
  if(rows.length!==107||missing.length||invalid.length||exceptions.length!==1||
      exceptions[0]?.name!=="New Ireland Passive IRIS 2033")
    throw new Error("Fund risk register does not match all 107 active names.");
  console.log("[Omega risk audit] PASS. Source: adviser-provided 26 Nov 2026 register.");
}
