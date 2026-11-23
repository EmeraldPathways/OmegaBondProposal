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
  assert.match(endpoint,/request\.headers\.get\("origin"\)/);
});
test("new A4 Omega PDF displays actual workbook fund charts and PDF metadata with no invented historical time-series",()=>{
  const pdf=read("src/lib/pdf/workbook-proposal.tsx");
  assert.match(pdf,/OMEGA_LOGO_PATHS/);
  assert.match(pdf,/size="A4"/);
  assert.match(pdf,/f\.returns\.threeYear/);
  assert.match(pdf,/f\.factsheet\.objective/);
  assert.match(pdf,/f\.factsheet\.riskRating/);
  assert.match(pdf,/f\.factsheet\.amcPct/);
  assert.match(pdf,/f\.factsheet\.chartPages/);
  assert.match(pdf,/DRAFT/);
  assert.match(pdf,/PortfolioAllocationChart/);
  assert.match(pdf,/FundReturnChart/);
  assert.match(pdf,/3-year cumulative fund returns/);
  assert.match(pdf,/1-year cumulative fund returns/);
  assert.match(pdf,/No monthly history, implied portfolio growth/);
  assert.doesNotMatch(pdf,/Math\.random|monthlyPrices|performanceSeries|sampleHistorical/);
});
test("Vercel bundles the PDF renderer's fonts",()=>{
  const config=read("next.config.ts");
  assert.match(config,/outputFileTracingIncludes/);
  assert.match(config,/\/api\/proposal\/pdf/);
  assert.match(config,/pdfkit\/js\/standard-fonts/);
});

test("live preview and download share the identical authenticated PDF Blob",()=>{
  const viewer=read("src/components/proposal-pdf-viewer.tsx");
  assert.match(viewer,/iframe className="pdf-document-frame"/);
  assert.match(viewer,/URL\.createObjectURL\(blob\)/);
  assert.match(viewer,/anchor\.download|a\.download/);
  assert.match(viewer,/a\.href=url/);
  assert.match(viewer,/credentials:"same-origin"/);
  assert.doesNotMatch(viewer,/print\(/);
});
