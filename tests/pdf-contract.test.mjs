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
  assert.match(pdf,/f\.factsheet\.riskProfile/);
  assert.match(pdf,/f\.factsheet\.expenseRatioPct/);
  assert.match(pdf,/f\.factsheet\.managedBy/);
  assert.doesNotMatch(pdf,/Charts in source PDF|Printed PDF title|data\.workbookFilename\}/);
  assert.doesNotMatch(pdf,/DRAFT|NOT APPROVED FOR CLIENT DISTRIBUTION/);
  assert.match(pdf,/CompactPortfolioAllocationAndBreakdown/);
  assert.match(pdf,/CumulativeReturnLineChart/);
  assert.match(pdf,/CUMULATIVE_PERIODS/);
  assert.match(pdf,/cumulativeReturnValues\(f.returns\)/);
  assert.match(pdf,/contiguousReturnSegments\(values\)/);
  assert.match(pdf,/Reported cumulative returns/);
  assert.doesNotMatch(pdf,/HistoricalPortfolioGrowthChart/);
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

test("client PDF omits internal upload provenance, validation notices and review blocks",()=>{
  const pdf=read("src/lib/pdf/workbook-proposal.tsx");
  for(const expression of [
    /DATA BASIS AND LIMITATIONS/,
    /ADVISER SOURCE CHECK/,
    /IMPORTANT — DRAFT/,
    /RECONSTRUCTION NOTICE/,
    /Source: \{data\.workbookFilename\}/,
    /Fund performance is reproduced from the current Omega uploaded workbook/,
    /PDF filenames provide document association/,
    /Please verify factsheet dates/,
    /not been independently verified/,
    /Original PDF graphics/,
    /PDF: \{f\.factsheet\.filename/,
  ])assert.doesNotMatch(pdf,expression);
  assert.match(pdf,/f\.factsheet\.objective/);
  assert.match(pdf,/f\.returns\.oneYear/);
  assert.match(pdf,/CompactPortfolioAllocationAndBreakdown/);
  assert.match(pdf,/Cumulative returns, not annualised/);
  const viewer=read("src/components/proposal-pdf-viewer.tsx");
  assert.match(viewer,/Omega-Investment-Bond-Proposal\.pdf/);
});

test("each portfolio combines line chart, compact donut, invested amounts and cumulative-return table on one A4 overview page",()=>{
  const pdf=read("src/lib/pdf/workbook-proposal.tsx");
  assert.match(pdf,/CompactPortfolioAllocationAndBreakdown/);
  assert.match(pdf,/CumulativeReturnLineChart funds=\{group\}/);
  assert.match(pdf,/FundAllocationReturnsTable funds=\{group\}/);
  assert.match(pdf,/INVESTMENT OVERVIEW/);
  assert.match(pdf,/totalInvestment=\{data\.investment\}/);
  assert.doesNotMatch(pdf,/p\.id\+"-visual"/);
  assert.doesNotMatch(pdf,/p\.id\+"-cumulative-"/);
  assert.doesNotMatch(pdf,/p\.id\+"-history"/);
  assert.match(pdf,/chartFundGroups\(p\.funds,8\)/);
});

test("cover contains compact horizontal investment details and allocation doughnut; portfolio intro is shortened",()=>{
  const pdf=read("src/lib/pdf/workbook-proposal.tsx");
  assert.match(pdf,/CoverPortfolioAllocation/);
  assert.match(pdf,/data\.portfolios\.map\(p=><CoverPortfolioAllocation/);
  assert.match(pdf,/marginTop:8,paddingHorizontal:12,paddingVertical:7/);
  assert.match(pdf,/flexDirection:"row",alignItems:"center",gap:13/);
  assert.doesNotMatch(pdf,/INVESTMENT BOND PROPOSAL\s*\n\s*<\/Text>\s*\n\s*<Text style=\{\[style\.heading/);
  assert.match(pdf,/marginTop:11,marginBottom:4/);
  assert.match(pdf,/FundAllocationReturnsTable/);
  assert.match(pdf,/CumulativeReturnLineChart/);
});

test("New Ireland, Zurich and Standard Life factsheets are refreshed once per parser version without reuploading",()=>{
  const route=read("src/app/api/proposal/pdf/route.ts");
  assert.match(route,/metadataVersion\?\?0/);
  for(const provider of ["New Ireland","Zurich","Standard Life"])
    assert.ok(route.includes('fund?.provider==="'+provider+'"'));
  assert.match(route,/extractFundFactsheet/);
  assert.match(route,/UPDATE fund_source_factsheets/);
  assert.doesNotMatch(route,/DELETE FROM fund_source_performance/);
  const pdf=read("src/lib/pdf/workbook-proposal.tsx");
  assert.match(pdf,/Volatility rating/);
  assert.match(pdf,/Total expense ratio/);
  assert.match(pdf,/Risk profile/);
  assert.doesNotMatch(pdf,/MoneyMate ID: \{f\.factsheet\.moneyMateId\?\?"Not stated"/);
});
