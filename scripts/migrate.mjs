#!/usr/bin/env node
// One-time schema bootstrap for a new Neon database.
// Run in a reviewed environment with DATABASE_URL configured.
// Never execute via a publicly accessible HTTP route.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Missing DATABASE_URL. Connect Neon to the project and use a secure local environment.");
  process.exit(1);
}

const path = resolve(dirname(fileURLToPath(import.meta.url)), "../src/lib/schema.sql");
const schema = readFileSync(path, "utf8");
const db = new pg.Client({ connectionString, connectionTimeoutMillis: 15000, query_timeout: 30000 });

try {
  await db.connect();
  const existing = await db.query("SELECT to_regclass('public.providers') AS existing");
  if (existing.rows[0]?.existing) {
    console.log("Schema already initialised. No changes applied; use versioned migrations for updates.");
    process.exitCode = 0;
  } else {
    await db.query("BEGIN");
    await db.query(schema);
    await db.query("COMMIT");
    console.log("Neon schema initialised successfully.");
  }
} catch (error) {
  try { await db.query("ROLLBACK"); } catch {}
  // Do not print a connection URL, credentials or sensitive provider diagnostics.
  console.error("Neon schema migration failed:", error instanceof Error ? error.message.split("\n")[0] : "unknown error");
  process.exitCode = 1;
} finally {
  await db.end().catch(() => {});
}
