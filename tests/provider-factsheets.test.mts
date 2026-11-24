import test from "node:test";
import assert from "node:assert/strict";
import {parseFactsheetText} from "../src/lib/reconciliation/factsheet.ts";

function parse(filename:string,page:string,appendix=""){
  return parseFactsheetText({importId:"test",filename,pages:[page,appendix]});
}
test("New Ireland: fund description, written risk, manager, style, asset mix and tax are extracted",()=>{
  const f=parse("New Ireland PRIME 5.pdf",`PRIME 5
Performance Factsheet
Fund Description:
PRIME 5 aims to generate long-term capital growth with ESG characteristics.
Managed By: State Street Investment Management (previously known as State Street Global Advisors Europe Limited).
Style: Passively managed
Asset Mix: Equities, Bonds, Property & Cash
SFDR* Classification: Article 8 Fund
Tax: Gross
Risk Profile:
Medium to High Risk
Performance as at 09 November 2026
`,"New Ireland Assurance Company plc is regulated by the Central Bank of Ireland.");
  assert.equal(f.providerHint,"New Ireland");
  assert.equal(f.metadataVersion,7);
  assert.match(f.description??"",/long-term capital growth/);
  assert.equal(f.sfdrClass,"Article 8");
  assert.match(f.objective??"",/long-term capital growth/);
  assert.equal(f.riskProfile,"Medium to High Risk");
  assert.match(f.managedBy??"",/State Street/);
  assert.equal(f.managementStyle,"Passively managed");
  assert.equal(f.assetMix,"Equities, Bonds, Property & Cash");
  assert.equal(f.taxStatus,"Gross");
  assert.equal(f.asOf,"09 November 2026");
  assert.equ¶»§q«^