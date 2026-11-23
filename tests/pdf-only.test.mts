import test from "node:test";
import assert from "node:assert/strict";
import { APPROVED_FUNDS } from "../src/lib/approved-funds.ts";
import { reconcilePdfOnly } from "../src/lib/reconciliation/pdf-only.ts";
import { downgradeDuplicateApprovals, type FactSheetData } from "../src/lib/reconciliation/engine.ts";

const pdf = (id: string, title: string, provider = "Aviva", filename = "unrelated-archive-name.pdf"): FactSheetData =>
  ({ importId:id, filename, providerHint:provider, title,
    performance:null }) as FactSheetData;
const fund = (name: string) => {
  const match=APPROVED_FUNDS.find(f=>f.provider==="Aviva" && f.name===name);
  assert.ok(match, "Fund must exist in approved shortlist");
  return match;
};

test("PDF identity can be auto-approved without any workbook row", () => {
  const result=reconcilePdfOnly(fund("Aviva Fixed ESG 60 Ser 1"), [
    pdf("one","Aviva Fixed ESG 60 Series 1","Aviva","Aviva Fixed ESG 60 Ser 1.pdf"),
    pdf("two","Aviva Fixed ESG 80 Series 1")
  ]);
  assert.equal(result.status,"auto_approved");
  assert.equal(result.factsheet?.importId,"one");
  assert.equal(result.workbookRow,null);
  assert.equal(result.factsheetIdentityApproved,true);
});

test("Unsupported PDF filename is not linked to another share class", () => {
  const result=reconcilePdfOnly(fund("L&G Multi-Index IV"), [
    pdf("lg","L&G Multi-Index IV Fund Series B")
  ]);
  assert.notEqual(result.status,"auto_approved");
  assert.equal(result.factsheetIdentityApproved,false);
});

test("Duplicate filenames are never silently auto-linked", () => {
  const result=reconcilePdfOnly(fund("Aviva Fixed ESG 60 Ser 1"), [
    pdf("a","Aviva Fixed ESG 60 Series 1","Aviva","Aviva Fixed ESG 60 Ser 1.pdf"),
    pdf("b","Aviva Fixed ESG 60 Series 1","Aviva","Aviva Fixed ESG 60 Ser 1.PDF")
  ]);
  assert.notEqual(result.status,"auto_approved");
});

test("A PDF already assigned to two shortlist funds is downgraded", () => {
  const original=reconcilePdfOnly(fund("Aviva Fixed ESG 60 Ser 1"), [
    pdf("shared","Aviva Fixed ESG 60 Series 1","Aviva","Aviva Fixed ESG 60 Ser 1.pdf")
  ]);
  const conflict={...original,fundId:"another-fund",name:"Another fund"};
  const resolved=downgradeDuplicateApprovals([original,conflict]);
  assert.equal(resolved[0].factsheetIdentityApproved,false);
  assert.equal(resolved[1].factsheetIdentityApproved,false);
});
