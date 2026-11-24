import test from "node:test";
import assert from "node:assert/strict";
import {parseFactsheetText,cleanSourceDescription} from "../src/lib/reconciliation/factsheet.ts";
test("actual KBI Alternate Energy scanned PDF text yields a fund description",()=>{
  const text=`KBI Alternative Energy Fund (6)
NEW IRELAND Performance Factsheet
Fund Description: Risk Profile:
Our fund invests in the KBI Global Energy Transition Fund. This fund aims to generate returns by investing
primarily in equities of international companies involved in providing low carbon solutions to the world's
accelerating demand for energy. Our fund is classified as an Article 8 Fund. High Risk
SFDR Classification:
Managed By: Underlying fund is managed by KBI Global Investors
Style: Actively managed
Asset Mix: Equities
Performance as at 18 November 2026`;
  const item=parseFactsheetText({importId:"kbi",filename:"New Ireland KBI Alternate Energy.pdf",pages:[text]});
  assert.equal(item.providerHint,"New Ireland");
  assert.equal(item.metadataVersion,5);
  assert.ok(item.objective?.includes("KBI Global Energy Transition Fund"));
  assert.ok(item.objective?.includes("low carbon solutions"));
  assert.ok(!item.objective?.startsWith("Risk Profile:"));
  assert.ok(item.managedBy?.includes("KBI Global Investors"));
  assert.equal(item.managementStyle,"Actively managed");
  assert.equal(item.riskProfile,"High Risk");
});
test("a missing or too-short source description cannot be fabricated",()=>{
  assert.equal(cleanSourceDescription(null,"New Ireland"),null);
  assert.equal(cleanSourceDescription("Risk Profile:","New Ireland"),null);
});
