import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");

test("server-generated PDF viewer is preserved for verified client proposals",()=>{
  const workspace = read("src/components/workspace.tsx");
  const viewer = read("src/components/proposal-pdf-viewer.tsx");
  const endpoint = read("src/app/api/proposal/pdf/route.ts");
  assert.doesNotMatch(workspace, /window\.print\s*\(/);
  assert.doesNotMatch(workspace, /<ProposalPdfViewer/);
  assert.match(workspace, /PDF template has not been removed/);
  assert.match(viewer, /URL\.createObjectURL\(blob\)/);
  assert.match(viewer, /anchor\.href = url/);
  assert.match(viewer, /<iframe/);
  assert.match(endpoint, /renderToBuffer/);
});

test("PDF is generated for authenticated sessions only, with private/no-store headers",()=>{
  const endpoint = read("src/app/api/proposal/pdf/route.ts");
  assert.match(endpoint, /await auth\(\)/);
  assert.match(endpoint, /Content-Type": "application\/pdf"/);
  assert.match(endpoint, /private, no-store/);
  assert.match(endpoint, /status: 401/);
});

test("Omega PDF uses the supplied logo and has no page numbering or browser metadata",()=>{
  const pdf = read("src/lib/pdf/omega-proposal.tsx");
  assert.match(pdf, /OMEGA_LOGO_PATHS/);
  assert.match(pdf, /size="A4"/);
  assert.doesNotMatch(pdf, /pageNumber|totalPages|window\.print|document\.title/);
  assert.match(pdf, /regulated by the Central Bank of Ireland/);
});

test("Vercel includes PDFKit built-in fonts in the PDF route bundle",()=>{
  const config = read("next.config.ts");
  assert.match(config, /outputFileTracingIncludes/);
  assert.match(config, /\/api\/proposal\/pdf/);
  assert.match(config, /pdfkit\/js\/standard-fonts/);
});
