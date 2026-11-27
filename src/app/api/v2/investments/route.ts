import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { auth, ADMIN_EMAIL, isLoginConfigured } from "@/auth";
import { getNeonSql } from "@/lib/server/neon";
import { investmentRecordSchema, v2DatabaseGuard } from "@/lib/v2-investment-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
function reply(message: string, status = 400) {
  return NextResponse.json({error:message}, {status, headers});
}
async function authorised() {
  if (!isLoginConfigured()) return false;
  return (await auth())?.user?.email?.toLowerCase() === ADMIN_EMAIL;
}
export async function GET() {
  if (!await authorised()) return reply("Unauthorised",401);
  if (!v2DatabaseGuard()) return reply("V2's separate database connection is not verified. Saving is disabled.",503);
  try {
    const sql = getNeonSql();
    const rows = await sql.query("SELECT id::text, version, payload, updated_at::text AS updated_at FROM public.v2_investment_cases ORDER BY updated_at DESC LIMIT 100");
    return NextResponse.json({records:rows.map(row => ({...row.payload as object, id:String(row.id), version:Number(row.version), updatedAt:String(row.updated_at)}))},{headers});
  } catch {
    console.error("[v2-investments] Could not load records.");
    return reply("Could not load V2 policy records.",500);
  }
}
export async function POST(request: Request) {
  if (!await authorised()) return reply("Unauthorised",401);
  if (!v2DatabaseGuard()) return reply("V2's separate database connection is not verified. Saving is disabled.",503);
  if (request.headers.get("origin") !== new URL(request.url).origin) return reply("Invalid request origin.",403);
  if (Number(request.headers.get("content-length") || 0) > 250_000) return reply("Request too large.",413);
  let input;
  try {
    const text = await request.text();
    if (text.length > 250_000) return reply("Request too large.",413);
    input = investmentRecordSchema.parse(JSON.parse(text));
  } catch {
    return reply("Correct the policy, valuation or transaction fields before saving.");
  }
  if (!input.clientName || !input.policyName) return reply("Client and policy names are required to save.");
  const {id, version, ...data} = input;
  try {
    const sql = getNeonSql();
    const payload = JSON.stringify(data);
    let rows;
    if (id) {
      if (!version) return reply("Record version required when updating.",409);
      rows = await sql.query(
        "UPDATE public.v2_investment_cases SET client_name=$1, policy_name=$2, payload=$3::jsonb, version=version+1, updated_at=now() WHERE id=$4::uuid AND version=$5 RETURNING id::text, version, updated_at::text",
        [data.clientName, data.policyName, payload, id, version]
      );
      if (!rows.length) return reply("Record has changed since it was opened. Reload it before saving.",409);
    } else {
      rows = await sql.query(
        "INSERT INTO public.v2_investment_cases(id,client_name,policy_name,payload) VALUES ($1::uuid,$2,$3,$4::jsonb) RETURNING id::text, version, updated_at::text",
        [randomUUID(), data.clientName, data.policyName, payload]
      );
    }
    const row = rows[0];
    return NextResponse.json({record:{...data,id:String(row.id),version:Number(row.version),updatedAt:String(row.updated_at)}},{headers});
  } catch {
    console.error("[v2-investments] Could not save record.");
    return reply("Could not save this policy record.",500);
  }
}
