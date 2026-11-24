import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
test("all linked workbook funds have a resumable source-metadata persistence API",()=>{
  const src=read("src/app/api/fund-metadata/route.ts");
  assert.match(src,/fund_metadata_checks/);
  assert.match(src,/fund_source_factsheets/);
  assert.match(src,/INSERT INTO fund_source_factsheets/);
  assert.match(src,/UPDATE fund_reconciliations SET extracted_factsheet/);
  assert.match(src,/fund_active_names/);
  assert.match(src,/unique_provider_qualified_filename/);
  assert.match(src,/uploaded_workbook/);
  assert.match(src,/pdfFilenameFundKey/);
  assert.match(src,/workbookNameKey/);
  assert.match(src,/ocrFallback:true/);
  assert.match(src,/PARSER_VERSION=6/);
  assert.match(src,/source_sha256/);
  assert.match(src,/GET\(\)/);
  assert.match(src,/POST\(request:Request\)/);
});
test("the import screen resumes extraction and shows provider-level completion",()=>{
  const component=read("src/components/fund-metadata-audit.tsx");
  assert.match(component,/Saved descriptions/);
  assert.match(component,/data\.byProvider/);
  assert.match(component,/data\.hasMore/);
  assert.match(component,/void run\(\)/);
  const uploads=read("src/components/secure-fund-uploads.tsx");
  assert.match(uploads,/FundMetadataAudit/);
});
test("saved actual source text and extraction method are linked to each source PDF",()=>{
  const parser=read("src/lib/reconciliation/factsheet.ts");
  const types=read("src/lib/reconciliation/engine.ts");
  assert.match(parser,/sourceText:text\.slice/);
  assert.match(parser,/extractionMethod=ocrUsed/);
  assert.match(types,/sourceText\?/);
  assert.match(types,/extractionMethod\?/);
});
test("workbook-only cumulative returns remain intact after enrichment",()=>{
  const pdf=read("src/app/api/proposal/pdf/route.ts");
  assert.match(pdf,/matchWorkbookReturn\(fund,entries\)/);
  assert.match(pdf,/returns:safeReturns\(row\.returns\)/);
  assert.match(pdf,/fund_source_factsheets/);
  const endpoint=read("src/app/api/fund-metadata/route.ts");
  assert.doesNotMatch(endpoint,/UPDATE fund_source_performance/);
  assert.doesNotMatch(endpoint,/UPDATE fund_active_names/);
  assert.doesNotMatch(endpoint,/DELETE FROM imports/);
});
