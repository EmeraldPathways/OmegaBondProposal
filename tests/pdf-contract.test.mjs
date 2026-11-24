import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = p => readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("client proposal export uses the current workbook and linked PDF sources, not demo prices",()=>{
  const workspace=read("src/components/workspace.tsx");
  const endpoint=read("src/app/api/proposal/pdf/route.ts");
  assert.doesNotMatch(workspace,/window\.print\s*\(/);
  assert.match(workspace,/<ProposalPdfViewer/);
  assert.match(workspace,/readyForProposal&&<ProposalPdfViewer/);
  assert.match(read("src/components/proposal-pdf-viewer.tsx"),/Live A4 PDF preview/);
  assert.match(read("src/components/proposal-pdf-viewer.tsx"),/\/api\/proposal\/pdf/);
  assert.match(endpoint,/renderToBuffer/);
  assert.match(endpoint,/getActiveFunds/);
  assert.match(endpoint,/matchWorkbookReturn/);
  assert.match(endpoint,/fund_source_performance/);
  assert.match(endpoint,/fund_source_factsheets/);
  assert.match(endpoint,/unique_provider_qualified_filename/);
  assert.doesNotMatch(endpoint,/synthetic|session.price|buildProposalReport|price_observations/);
});
test("proposal PDF is authenticated and privately generated",()=>{
  const endpoint=read("src/app/api/proposal/pdf/route.ts");
  assert.match(endpoint,/await auth\(\)/);
  assert.match(endpoint,/Content-Type":"application\/pdf"/);
  assert.match(endpoint,/private, no-store/);
  assert.match(endpoint,/401/);
  assert.match(endpoint,/request\.headers\.g¶»§q«^