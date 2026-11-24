import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("unnecessary overview navigation and informational warnings are absent",()=>{
  const workspace=read("src/components/workspace.tsx");
  assert.doesNotMatch(workspace,/key:\s*"overview"|view\s*===\s*"overview"/);
  assert.match(workspace,/useState<View>\("funds"\)/);
  assert.doesNotMatch(workspace,/Workbook-backed workflow/);
  assert.doesNotMatch(workspace,/Build up to three draft portfolios/);
  assert.doesNotMatch(workspace,/Drafts currently remain in your browser session/);
  assert.doesNotMatch(workspace,/The export is marked/);
  assert.doesNotMatch(workspace,/This PDF uses the workbook/);
  assert.doesNotMatch(workspace,/sidebar-help/);
  assert.doesNotMatch(workspace,/<FundSourceAudit\s*\/>/);
  assert.match(workspace,/Portfolio builder/);
  assert.match(workspace,/Client proposal/);
});
test("saved factsheet panel and redundant intake notice are removed without deleting the data API",()=>{
  const uploads=read("src/components/secure-fund-uploads.tsx");
  assert.doesNotMatch(uploads,/FundEnrichmentAudit/);
  assert.doesNotMatch(uploads,/Source intake only/);
  assert.match(uploads,/FundPerformanceReview/);
  assert.match(uploads,/FundSourceAudit/);
  const api=read("src/app/api/proposal/pdf/route.ts");
  assert.match(api,/source_data/);
  assert.match(api,/fund_source_factsheets/);
});
