import { NextResponse } from "next/server";
import { list } from "@vercel/blob";
import { verifyNeonConnection, verifySchemaInitialized } from "@/lib/server/neon";
import { ADMIN_EMAIL, auth, isLoginConfigured } from "@/auth";

export const dynamic = "force-dynamic";

type ConnectionState = "ready" | "not_configured" | "connection_failed";

/** Read-only diagnostics. Detailed probes are available only to the logged-in adviser. */
export async function GET(request: Request) {
  const databaseConfigured = Boolean(process.env.DATABASE_URL);
  const storageConfigured = Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
  const check = new URL(request.url).searchParams.get("check") === "1";

  if (!check) {
    return NextResponse.json(
      { service: "omega-bond-proposal", status: "ok", mode: "demo" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!isLoginConfigured() || (await auth())?.user?.email?.toLowerCase() !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }

  let neon: ConnectionState = databaseConfigured ? "connection_failed" : "not_configured";
  let blob: ConnectionState = storageConfigured ? "connection_failed" : "not_configured";
  let schemaInitialized = false;

  if (databaseConfigured) {
    try {
      if (await verifyNeonConnection()) {
        neon = "ready";
        schemaInitialized = await verifySchemaInitialized();
      }
    } catch { /* Do not reveal provider details */ }
  }
  if (storageConfigured) {
    try { await list({ limit: 1 }); blob = "ready"; }
    catch { /* Do not reveal store details */ }
  }

  return NextResponse.json(
    { service: "omega-bond-proposal", status: "ok", mode: "demo",
      clientDataPersistence: false, connections: { neon, blob }, schemaInitialized,
      note: "Read-only checks. Private uploads and client-data persistence remain disabled." },
    { headers: { "Cache-Control": "no-store" } },
  );
}
