import { createHash, randomUUID } from "node:crypto";
import { put, del } from "@vercel/blob";
import { NextResponse } from "next/server";
import { auth, ADMIN_EMAIL, isLoginConfigured } from "@/auth";
import { getNeonSql } from "@/lib/server/neon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BYTES = 3_500_000; // Vercel Functions request-body limit is 4.5 MB.
const noStore = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

function validUpload(file: File, kind: string, bytes: Uint8Array): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (file.name.length > 220 || !/^[^/\\]+$/.test(file.name)) return "Invalid file name.";
  if (file.size < 6 || file.size > MAX_BYTES) return "File must be between 6 bytes and 3.5 MB.";
  if (kind === "factsheet") {
    if (ext !== "pdf" || String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-")
      return "Factsheets must be valid PDF files.";
  } else if (kind === "performance") {
    if (ext === "xlsx") {
      if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04)
        return "Excel workbooks must be valid .xlsx files.";
    } else if (ext === "csv") {
      const sample = bytes.slice(0, 500);
      if (sample.includes(0)) return "CSV files must be text, not binary.";
    } else return "Performance files must be .xlsx or .csv.";
  } else return "Unknown document type.";
  return null;
}

async function permitted() {
  if (!isLoginConfigured()) return false;
  const session = await auth();
  return session?.user?.email?.toLowerCase() === ADMIN_EMAIL;
}

export async function GET() {
  if (!await permitted()) return NextResponse.json({ error: "Unauthorised" }, { status: 401, headers: noStore });
  try {
    const sql = getNeonSql();
    const rows = await sql`SELECT id::text, filename, status, uploaded_at::text,
      CASE WHEN storage_key LIKE 'funds/factsheets/%' THEN 'factsheet' ELSE 'performance' END AS kind
      FROM imports
      WHERE storage_key LIKE 'funds/factsheets/%' OR storage_key LIKE 'funds/performance/%'
      ORDER BY uploaded_at DESC LIMIT 200`;
    return NextResponse.json({ documents: rows }, { headers: noStore });
  } catch {
    console.error("Fund import listing failed.");
    return NextResponse.json({ error: "Could not load stored documents." }, { status: 500, headers: noStore });
  }
}

export async function POST(request: Request) {
  if (!await permitted()) return NextResponse.json({ error: "Unauthorised" }, { status: 401, headers: noStore });
  // Reject cross-site requests, even when the browser sends the session cookie.
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers: noStore });
  }
  if (Number(request.headers.get("content-length") || 0) > MAX_BYTES + 50_000) {
    return NextResponse.json({ error: "File exceeds the 3.5 MB upload limit." }, { status: 413, headers: noStore });
  }

  let uploadedPath: string | null = null;
  try {
    const form = await request.formData();
    const file = form.get("file");
    const kind = form.get("kind");
    if (!(file instanceof File) || (kind !== "factsheet" && kind !== "performance")) {
      return NextResponse.json({ error: "Please select a PDF factsheet or Excel/CSV performance file." }, { status: 400, headers: noStore });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File exceeds the 3.5 MB upload limit." }, { status: 413, headers: noStore });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const issue = validUpload(file, kind, bytes);
    if (issue) return NextResponse.json({ error: issue }, { status: 400, headers: noStore });

    const digest = createHash("sha256").update(bytes).digest("hex");
    const sql = getNeonSql();
    const existing = await sql`SELECT id::text FROM imports WHERE sha256 = ${digest}
      AND storage_key LIKE ${kind === "factsheet" ? "funds/factsheets/%" : "funds/performance/%"} LIMIT 1`;
    if (existing.length) {
      return NextResponse.json({ error: "This exact file has already been uploaded.", duplicateId: existing[0].id }, { status: 409, headers: noStore });
    }
    const ext = file.name.split(".").pop()!.toLowerCase();
    const contentType = ext === "pdf" ? "application/pdf"
      : ext === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : "text/csv";
    const pathname = `funds/${kind === "factsheet" ? "factsheets" : "performance"}/${randomUUID()}.${ext}`;
    const stored = await put(pathname, Buffer.from(bytes), {
      access: "private", contentType, addRandomSuffix: false,
    });
    uploadedPath = stored.pathname;
    const created = await sql`INSERT INTO imports (filename, storage_key, sha256, status)
      VALUES (${file.name}, ${stored.pathname}, ${digest}, 'pending')
      RETURNING id::text, uploaded_at::text`;

    return NextResponse.json({
      document: { id: created[0].id, filename: file.name, uploaded_at: created[0].uploaded_at,
        kind, status: "pending" },
      message: "Stored privately. Awaiting review; not yet added to investment calculations.",
    }, { status: 201, headers: noStore });
  } catch {
    if (uploadedPath) {
      try { await del(uploadedPath); } catch { console.error("Orphaned fund upload requires cleanup."); }
    }
    console.error("Private fund document upload failed.");
    return NextResponse.json({ error: "The upload could not be saved. Please retry." }, { status: 500, headers: noStore });
  }
}
