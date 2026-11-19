import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { auth, ADMIN_EMAIL, isLoginConfigured } from "@/auth";
import { getNeonSql } from "@/lib/server/neon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isLoginConfigured() || (await auth())?.user?.email?.toLowerCase() !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const sql = getNeonSql();
    const records = await sql`SELECT filename, storage_key FROM imports WHERE id = ${id}::uuid
      AND (storage_key LIKE 'funds/factsheets/%' OR storage_key LIKE 'funds/performance/%') LIMIT 1`;
    if (!records.length) return new Response("Not found", { status: 404 });
    const result = await get(String(records[0].storage_key), { access: "private" });
    if (!result || result.statusCode !== 200) return new Response("Not found", { status: 404 });
    const filename = String(records[0].filename).replace(/["\\\r\n]/g, "_").slice(0, 180);
    return new Response(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    console.error("Private fund document download failed.");
    return NextResponse.json({ error: "Document unavailable." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
