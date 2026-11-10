import { NextResponse } from "next/server";
import { list } from "@vercel/blob";
import { verifyNeonConnection } from "@/lib/server/neon";

export const dynamic = "force-dynamic";

type ConnectionState = "ready" | "not_configured" | "connection_failed";

/**
 * Read-only diagnostics. Does not return database rows, blob names, credentials,
 * client information, or the underlying provider's error messages.
 * Use ?check=1 to initiate a real SELECT 1 and a Blob listing probe.
 */
export async function GET(request: Request) {
  const databaseConfigured = Boolean(process.env.DATABASE_URL);
  // Private Blob stores on Vercel normally use OIDC + BLOB_STORE_ID.
  const storageConfigured = Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
  const check = new URL(request.url).searchParams.get("check") === "1";

  const summary = {
    service: "omega-bond-proposal",
    status: "ok",
    mode: "demo" as const,
    databaseConfigured,
    storageConfigured,
    clientDataPersistence: false,
  };

  if (!check) return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });

  let neon: ConnectionState = databaseConfigured ? "connection_failed" : "not_configured";
  let blob: ConnectionState = storageConfigured ? "connection_failed" : "not_configured";

  if (databaseConfigured) {
    try {
      if (await verifyNeonConnection()) neon = "ready";
    } catch {
      // Deliberately suppress credentials and provider error details.
    }
  }

  if (storageConfigured) {
    try {
      // Tests private store authentication without accessing document content.
      await list({ limit: 1 });
      blob = "ready";
    } catch {
      // Deliberately suppress blob paths, tokens and provider error details.
    }
  }

  return NextResponse.json({
    ...summary,
    connections: { neon, blob },
    note: "Read-only checks. Database tables, private upload permissions and application authentication are not yet verified.",
  }, { headers: { "Cache-Control": "no-store" } });
}
