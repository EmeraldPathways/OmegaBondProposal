import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
test("secure fund upload is authenticated and saves originals as private, pending files",()=>{
  const route = read("src/app/api/fund-uploads/route.ts");
  assert.match(route, /await auth\(\)/);
  assert.match(route, /access: "private"/);
  assert.match(route, /'pending'/);
  assert.match(route, /createHash\("sha256"\)/);
});
test("fund uploads accept XLSX source workbooks, never synthetic price generation",()=>{
  const ui=read("src/components/secure-fund-uploads.tsx");
  const work=read("src/components/workspace.tsx");
  assert.match(ui,/\.xlsx/);
  assert.match(ui,/Fund factsheets/);
  assert.match(work,/<SecureFundUploads/);
  assert.doesNotMatch(work,/monthlyPrices\(/);
});
test("source performance schema stores only published report periods",()=>{
  const schema=read("sql/migrations/2026-11-19-reported-performance.sql");
  assert.match(schema,/ten_year_pct/);
  assert.match(schema,/since_launch_pct/);
  assert.match(schema,/return_basis text NOT NULL DEFAULT 'unverified'/);
  assert.doesNotMatch(schema,/unit_price|price_date|volatility/);
});
