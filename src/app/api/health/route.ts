import { NextResponse } from "next/server";
import { list } from "@vercel/blob";
import { verifyNeonConnection, verifySchemaInitialized } from "@/lib/server/neon";

export const dynamic = "force-dynamic";

type ConnectionState = "ready" | "not_configured" | "connection_failed";

/** Read-only diagnostics; never return credentials, blob names or database records. */
export async function GET(request: Request) {
  const databaseConfigured = Boolean(process.env.DATABASE_URL);
  const storageConfigured = Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
  const check = new URL(request.url).searchParams.get("check") === "1";

  const summary = { service: "omega-bond-proposal", status: "ok", mode: "demo" as const,
    databaseConfigured, storageConfigured, clientDataPersistence: false };

  if (!check) return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });

  let neon: ConnectionState = databaseConfigured ? "connection_failed" : "not_configured";
  let blob: ConnectionState = storageConfigured ? "connection_failed" : "not_configured";
  let schemaInitialized = false;

  if (databaseConfigured) {
    try {
      if (await verifyNeonConnection()) {
        neon = "ready";
        schemaInitialized = await verifySchemaInitialized();
      }
    } catch { /* Suppress provider errors */ }
  }
  if (storageConfigured) {
    try {
      await list({ limit: 1 });
      blob = "ready";
    } catch { /* Suppress private storage errors */ }
  }
  return NextResponse.json({ ...summary, connections: { neon, blob }, schemaInitialized,
    note: "Read-only checks. Private uploads and staff authentication remain unverified." },
    { headers: { "Cache-Control": "no-store" } });
}
