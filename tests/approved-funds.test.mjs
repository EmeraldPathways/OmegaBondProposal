import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const text = p => readFileSync(new URL("../"+p, import.meta.url), "utf8");
function approved() {
  const source=text("src/lib/approved-funds.ts");
  const match=source.match(/APPROVED_FUND_GROUPS = (\{[\s\S]+?\}) as const;/);
  assert.ok(match,"Approved fund universe must be an explicit data object");
  return JSON.parse(match[1]);
}
test("approved shortlist contains exactly 115 funds from four selected providers",()=>{
  const groups=approved();
  assert.deepEqual(Object.fromEntries(Object.entries(groups).map(([provider,funds])=>[provider,funds.length])),
    {Aviva:30,Zurich:29,"Standard Life":14,"New Ireland":42});
  assert.equal(Object.values(groups).flat().length,115);
});
test("names are unique within each provider and are preserved verbatim",()=>{
  const groups=approved();
  for(const [provider,names] of Object.entries(groups)){
    assert.equal(new Set(names.map(x=>x.toLowerCase())).size,names.length,provider);
  }
  assert.ok(groups.Aviva.includes("Cantor Fitz MAF 70 Series B"));
  assert.ok(groups.Zurich.includes("Indexed European ExUK Property"));
  assert.ok(groups["Standard Life"].includes("Standard Life Vanguard US 500 Stock Index fund"));
  assert.ok(groups["New Ireland"].includes("Goodbody Dividend Income 6"));
});
test("visible fund library and portfolio builder use approved fund universe only",()=>{
  const workspace=text("src/components/workspace.tsx");
  assert.match(workspace,/APPROVED_FUNDS/);
  assert.doesNotMatch(workspace,/demoFunds|demoPortfolios|portfolioSeries|monthlyPrices/);
  assert.match(workspace,/<SecureFundUploads/);
});
test("published performance is not invented from monthly unit prices",()=>{
  const workspace=text("src/components/workspace.tsx");
  assert.doesNotMatch(workspace,/<LineChart|volatilityPct|synthetic price/);
  assert.match(workspace,/Workbook\\/PDF match pending/);
});
