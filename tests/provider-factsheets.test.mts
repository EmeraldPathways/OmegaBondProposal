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
  assert.equal(f.metadataVersion,6);
  assert.match(f.description??"",/long-term capital growth/);
  assert.equal(f.sfdrClass,"Article 8");
  assert.match(f.objective??"",/long-term capital growth/);
  assert.equal(f.riskProfile,"Medium to High Risk");
  assert.match(f.managedBy??"",/State Street/);
  assert.equal(f.managementStyle,"Passively managed");
  assert.equal(f.assetMix,"Equities, Bonds, Property & Cash");
  assert.equal(f.taxStatus,"Gross");
  assert.equal(f.asOf,"09 November 2026");
  assert.equal(f.moneyMateId,null);
  assert.equal(f.amcPct,null);
});
test("Zurich: fund description excludes equity-range preamble and includes rated risk",()=>{
  const f=parse("Zurich International Equity.pdf",`Risk Rating
The Fund has a risk rating of 5. Please see the Fund Guide for details.
Fund Description
Indicative equity range: 80% - 100%
of the value of the fund
The International Equity Fund is an actively managed fund which aims to achieve growth through capital gains and income from international equities. This fund is managed by Zurich Life.
International Equity Fund
Sector Average
Yearly Investment Performance
Fund Performance
Cumulative Performance (to 30/09/2026)
SFDR Class Article 8
`);
  assert.equal(f.providerHint,"Zurich");
  assert.equal(f.riskRating,5);
  assert.equal(f.equityRange,"80% - 100%");
  assert.equal(f.managedBy,"Zurich Life");
  assert.match(f.objective??"",/^The International Equity Fund/);
  assert.equal(f.asOf,"30/09/2026");
  assert.equal(f.sfdrClass,"Article 8");
  assert.equal(f.amcPct,null);
});
test("Standard Life: volatility rating, fund manager, AMC and TER all have own labels",()=>{
  const f=parse("Standard Life Ireland MyFolio Active V.pdf",`Q4
2026
Standard Life Ireland MyFolio
Active V Fund
October 2026
The fund aims to provide a total return from a combination of income and capital appreciation over the longer term. The fund achieves a broad exposure to diversified investments.
The value of investments within the fund can fall as well as rise.
Base Currency EUR
Volatility Rating (1-7) 5
Fund Manager(s) abrdn: Justin Jones and Daniel Reynolds
SFDR Product Category 8
Annual Management Charge 1.15%
Total Expense Ratio 1.24%
Investment Style Active
`);
  assert.equal(f.providerHint,"Standard Life");
  assert.match(f.objective??"",/^The fund aims/);
  assert.equal(f.baseCurrency,"EUR");
  assert.equal(f.riskRating,5);
  assert.equal(f.amcPct,1.15);
  assert.equal(f.expenseRatioPct,1.24);
  assert.equal(f.managementStyle,"Active");
  assert.match(f.managedBy??"",/Justin Jones/);
  assert.equal(f.civPct,null);
});
test("Standard Life passive Market fund keeps a distinct volatility scale and TER",()=>{
  const f=parse("Standard Life Ireland MyFolio Market V.pdf",`Q3
2026
Standard Life Ireland MyFolio Market V Fund
September 2026
The Fund aims to provide a total return from income and capital appreciation.
The value of investments within the fund can fall as well as rise.
Base Currency EUR
Volatility Rating (1-7) 4
Fund Manager(s) Standard Life
SFDR Product Category 6
Annual Management Charge 0.95%
Total Expense Ratio 0.99%
Investment Style Passive
`);
  assert.equal(f.providerHint,"Standard Life");
  assert.equal(f.riskRating,4);
  assert.equal(f.managementStyle,"Passive");
  assert.equal(f.amcPct,0.95);
  assert.equal(f.expenseRatioPct,0.99);
  assert.equal(f.civPct,null);
});

test("New Ireland source data preserves labelled disclosures and page evidence",()=>{
  const f=parseFactsheetText({importId:"ni",filename:"New Ireland Balanced Fund.pdf",pages:[
    `New Ireland Balanced Fund
Performance Factsheet
Fund Description:
The Balanced Fund aims to achieve medium to long-term growth.
Managed By: New Ireland Investment Managers
Style: Actively managed
Asset Mix: Equities and bonds
SFDR* Classification: Article 8 Fund
Risk Profile: Medium Risk
Performance as at 09 November 2026`,
    `RISKS
Key Risks
Capital and returns are not guaranteed
Currency Risk
Liquidity Risk
CHARGES
Standard Charges
Charges may apply and may reduce the return on your investment.
ADDITIONAL INFORMATION`
  ]});
  assert.equal(f.metadataVersion,5);
  assert.equal(f.providerHint,"New Ireland");
  assert.equal(f.riskProfile,"Medium Risk");
  assert.equal(f.sfdrClass,"Article 8");
  assert.match(f.objective??"",/medium to long-term growth/);
  assert.ok(f.riskFactors?.includes("Currency Risk"));
  assert.ok(f.riskFactors?.includes("Liquidity Risk"));
  assert.match(f.chargesDisclosure??"",/Charges may apply/);
  assert.deepEqual(f.fieldPages?.chargesDisclosure,[2]);
});

test("image-only New Ireland PDF narrative with adjacent risk header remains a description",()=>{
  const f=parse("New Ireland KBI Alternate Energy.pdf",`KBI Alternative Energy Fund (6)
NEW IRELAND Performance Factsheet
Fund Description: Risk Profile:
Our fund invests in the KBI Global Energy Transition Fund. The fund provides access to
international companies supplying low carbon solutions through an actively managed
equity investment strategy. High Risk
Managed By: Underlying fund is managed by KBI Global Investors
Style: Actively managed
Asset Mix: Equities
Performance as at 18 November 2026`);
  assert.equal(f.providerHint,"New Ireland");
  assert.ok(f.description?.startsWith("Our fund invests in the KBI Global Energy Transition Fund"));
  assert.ok(f.objective?.startsWith("Our fund invests in the KBI Global Energy Transition Fund"));
  assert.equal(f.metadataVersion,6);
  assert.match(f.sourceText??"",/KBI Global Energy Transition Fund/);
  assert.equal(f.extractionMethod,"pdf_text");
});
