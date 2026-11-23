import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = p => readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("client proposal export uses the current workbook and linked PDF sources, not demo prices",()=>{
  const workspace=read("src/components/workspace.tsx");
  const endpoint=read("src/app/api/proposal/pdf/route.ts");
  assert.doesNotMatch(workspace,/window\.print\s*\(|<ProposalPdfViewer/);
  assert.match(workspace,/Generate proposal PDF/);
  assert.match(workspace,/\/api\/proposal\/pdf/);
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
  assert.match(endpoint,/same-origin/);
});
test("new A4 Omega PDF displays original fund returns and linked PDF metadata with no invented historical chart",()=>{
  const pdf=read("src/lib/pdf/workbook-proposal.tsx");
  assert.match(pdf,/OMEGA_LOGO_PATHS/);
  assert.match(pdf,/size="A4"/);
  assert.match(pdf,/f\.returns\.threeYear/);
  assert.match(pdf,/f\.factsheet\.objective/);
  assert.match(pdf,/f\.factsheet\.riskRating/);
  assert.match(pdf,/f\.factsheet\.amcPct/);
  assert.match(pdf,/f\.factsheet\.chartPages/);
  assert.match(pdf,/DRAFT/);
  assert.doesNotMatch(pdf,/Math\.random|monthlyPrices|performanceSeries|sampleHistorical/);
});
test("Vercel bundles the PDF renderer's fonts",()=>{
  const config=read("next.config.ts");
  assert.match(config,/outputFileTracingIncludes/);
  assert.match(config,/\/api\/proposal\/pdf/);
  assert.match(config,/pdfkit\/js\/standard-fonts/);
});
