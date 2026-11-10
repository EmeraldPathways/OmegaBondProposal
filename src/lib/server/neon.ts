import "server-only";
import { neon } from "@neondatabase/serverless";

/** Lazily create a Neon SQL client; never instantiate in the browser or at build time. */
export function getNeonSql() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Neon is not configured: DATABASE_URL is missing.");
  return neon(connectionString);
}

export async function verifyNeonConnection(): Promise<boolean> {
  const sql = getNeonSql();
  const result = await sql`SELECT 1 AS connected`;
  return Number(result[0]?.connected) === 1;
}

export async function verifySchemaInitialized(): Promise<boolean> {
  const sql = getNeonSql();
  const result = await sql`SELECT
    to_regclass('public.providers') IS NOT NULL AS providers,
    to_regclass('public.fund_series') IS NOT NULL AS fund_series,
    to_regclass('public.price_observations') IS NOT NULL AS price_observations,
    to_regclass('public.factsheets') IS NOT NULL AS factsheets,
    to_regclass('public.proposals') IS NOT NULL AS proposals`;
  const row = result[0];
  return Boolean(row?.providers && row?.fund_series && row?.price_observations && row?.factsheets && row?.proposals);
}
