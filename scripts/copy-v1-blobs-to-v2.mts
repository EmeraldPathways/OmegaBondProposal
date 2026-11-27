import { createHash } from "node:crypto";
import { get, put } from "@vercel/blob";
import { neon } from "@neondatabase/serverless";

/**
 * ONE-TIME V2-only migration. Reads from V1 using a temporary token;
 * writes exclusively to V2 using the destination store credentials.
 * Does not delete, overwrite or modify V1 files or database rows.
 * Idempotent: existing destination blobs must match the database SHA-256.
 */
const V2_PROJECT_ID = "prj_T1UBJImSQCF9K4OMppOOKBoSvTeO";
const V2_DB_COMPUTE = "ep-royal-flower-b9y4wcvp";
const V1_STORE_ID = "nbjKB3WqyIkPPifx";

function storeId(value: string) {
  return value.startsWith("store_") ? value.slice(6) : value;
}
function tokenStoreId(token: string) {
  return token.split("_")[3] ?? "";
}
function sha256(data: Buffer) {
  return createHash("sha256").update(data).digest("hex");
}
function requireValue(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("[v2-blob-copy] Required configuration is missing: " + name);
  return value;
}
function decodeToken(value: string) {
  return value.replace(/^["']|["']$/g, "");
}
type ImportRow = { storage_key: string; sha256: string };
async function readPrivate(pathname: string, opts: { token?: string; storeId?: string }) {
  const response = await get(pathname, { access: "private", ...opts });
  if (!response || response.statusCode !== 200) return null;
  return { bytes: Buffer.from(await new Response(response.stream).arrayBuffer()), contentType: response.blob.contentType };
}

async function main() {
  // Preview and local builds must never initiate a copy.
  if (process.env.VERCEL_ENV !== "production") {
    console.log("[v2-blob-copy] Skipped outside V2 production.");
    return;
  }
  if (process.env.VERCEL_PROJECT_ID !== V2_PROJECT_ID) {
    throw new Error("[v2-blob-copy] Vercel project identity could not be verified.");
  }
  const databaseUrl = requireValue("DATABASE_URL");
  const host = new URL(databaseUrl).hostname;
  if (!host.startsWith(V2_DB_COMPUTE + ".") && !host.startsWith(V2_DB_COMPUTE + "-pooler.")) {
    throw new Error("[v2-blob-copy] DATABASE_URL is not the isolated V2 database branch.");
  }
  const fromToken = decodeToken(requireValue("V1_BLOB_READ_WRITE_TOKEN"));
  const fromId = tokenStoreId(fromToken);
  if (fromId !== V1_STORE_ID) throw new Error("[v2-blob-copy] Source token is not for the V1 Blob store.");

  const toStoreId = storeId(requireValue("BLOB_STORE_ID"));
  if (toStoreId === V1_STORE_ID) throw new Error("[v2-blob-copy] Destination store points at V1. Aborting.");
  const toToken = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (toToken && tokenStoreId(decodeToken(toToken)) !== toStoreId) {
    throw new Error("[v2-blob-copy] Destination Blob token and store ID are inconsistent.");
  }
  const destinationOptions = toToken ? { token: decodeToken(toToken) } : { storeId: toStoreId };
  const sql = neon(databaseUrl);
  const rows = (await sql`SELECT storage_key, sha256 FROM public.imports
    WHERE storage_key LIKE 'funds/factsheets/%' OR storage_key LIKE 'funds/performance/%'
    ORDER BY storage_key`) as ImportRow[];
  if (rows.length === 0 || rows.length > 2000) throw new Error("[v2-blob-copy] Unexpected number of files to copy.");
  if (new Set(rows.map(r => r.storage_key)).size !== rows.length) throw new Error("[v2-blob-copy] Duplicate destination paths.");
  for (const row of rows) {
    if (!/^funds\/(factsheets|performance)\/[a-zA-Z0-9._/-]+$/.test(row.storage_key) ||
        !/^[0-9a-f]{64}$/i.test(row.sha256)) {
      throw new Error("[v2-blob-copy] Unsafe pathname or invalid checksum.");
    }
  }
  console.log("[v2-blob-copy] Verified isolated V2 database and different stores. File count:", rows.length);
  let copied = 0, matched = 0;
  for (let i = 0; i < rows.length; i += 4) {
    const group = rows.slice(i, i + 4);
    await Promise.all(group.map(async row => {
      const current = await readPrivate(row.storage_key, destinationOptions);
      if (current) {
        if (sha256(current.bytes) !== row.sha256.toLowerCase()) {
          throw new Error("[v2-blob-copy] Existing destination file checksum mismatch.");
        }
        matched++;
        return;
      }
      const source = await readPrivate(row.storage_key, { token: fromToken });
      if (!source) throw new Error("[v2-blob-copy] Source file missing. No data removed.");
      if (sha256(source.bytes) !== row.sha256.toLowerCase()) {
        throw new Error("[v2-blob-copy] Source checksum did not match the copied V2 database.");
      }
      await put(row.storage_key, source.bytes, {
        access: "private",
        ...destinationOptions,
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: source.contentType || "application/octet-stream",
      });
      const confirmed = await readPrivate(row.storage_key, destinationOptions);
      if (!confirmed || sha256(confirmed.bytes) !== row.sha256.toLowerCase()) {
        throw new Error("[v2-blob-copy] Destination verification failed.");
      }
      copied++;
    }));
    console.log("[v2-blob-copy] Verified", Math.min(i + 4, rows.length), "of", rows.length);
  }
  console.log("[v2-blob-copy] SUCCESS: verified", rows.length, "files; newly copied", copied, "already matched", matched);
}

main().catch(error => {
  // Never log tokens, database URLs, paths, or exception objects.
  console.error(error instanceof Error ? error.message : "[v2-blob-copy] Migration failed.");
  process.exitCode = 1;
});
