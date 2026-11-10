import "server-only";
import { neon } from "@neondatabase/serverless";

/** Lazily creates a Neon SQL client; never instantiated in the browser or at build time. */
export function getNeonSql() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Neon is not configured: DATABASE_URL is missing.");
  return neon(connectionString);
}

/** Authenticated server routes may use this to verify the connection. */
export async function verifyNeonConnection(): Promise<boolean> {
  const sql = getNeonSql();
  const result = await sql`SELECT 1 AS connected`;
  return Number(result[0]?.connected) === 1;
}
