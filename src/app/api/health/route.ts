import { NextResponse } from "next/server";
export function GET() {
  return NextResponse.json({ service: "omega-bond-proposal", status: "ok", mode: "demo", databaseConfigured: Boolean(process.env.DATABASE_URL), storageConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN), clientDataPersistence: false });
}
