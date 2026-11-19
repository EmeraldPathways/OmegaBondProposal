import test from "node:test";
import assert from "node:assert/strict";
import {parsePdfPerformance} from "../src/lib/reconciliation/pdf-performance.ts";
const doc=(...lines:string[])=>[lines.join("\n")];

test("Aviva: published annualised table, fee basis and missing 10y",()=>{
 const pdf=parsePdfPerformance({provider:"Aviva",title:"Aviva European Equity ESG Passive Fund",
  pages:doc(
   "Fund Factsheet","Aviva European Equity ESG Passive Fund 09 Nov 2026",
   "FUND PERFORMANCE","Growth of €10,000 to 09 Nov 2026",
   "Annualised Return to 09 Nov 2026 – Aviva European Equity ESG Passive Fund",
   "1m 3m YTD 1y 3y 5y 10y",
   "Total Return 3.56% -1.43% 12.25% 17.58% 15.78% -- --",
   "Calendar Year Return – Aviva European Equity ESG Passive Fund",
   "2025 2024 2023 2022 2021",
   "Total Return 18.22% 8.4% -- -- --",
   "Source: Performance data quoted on a bid to bid basis i.e. the price investors sell units. Gross of AMC.")
 });
 assert.equal(pdf.status,"extracted");
 assert.equal(pdf.asOf,"09 Nov 2026");
 assert.equal(pdf.returns.oneYear,17.58);
 assert.equal(pdf.returns.threeYear,15.78);
 assert.equal(pdf.returns.tenYear,null);
 assert.equal(pdf.returns.sixMonth,null);
 assert.equal(pdf.feeBasis,"gross_of_amc");
 assert.equal(pdf.calendarYearReturns["2025"],18.22);
});
test("Aviva uses return title printed inside misnamed PDF",()=>{
 const pdf=parsePdfPerformance({provider:"Aviva",title:"L&G Multi-Index IV Fund Series B",
  pages:doc(
   "Annualised Return to 31 Aug 2026 – L&G Multi-Index IV Fund Series B",
   "1m 3m YTD 1y 3y 5y 10y",
   "Total Return 1.74% 1.52% 9.53% 13.41% 10.38% 4.58% --",
   "Calendar Year Return – L&G Multi-Index IV Fund Series B",
   "2025 2024 2023 2022 2021",
   "Total Return 6.67% 10.15% 8.71% -12.61% 11.72%","Net of AMC.")
 });
 assert.equal(pdf.titleInReturnTable,"L&G Multi-Index IV Fund Series B");
 assert.equal(pdf.returns.fiveYear,4.58);
 assert.equal(pdf.returns.tenYear,null);
 assert.equal(pdf.feeBasis,"net_of_amc");
});
test("Zurich annualised 3/5-year returns differ from cumulative 3/5-year",()=>{
 const pdf=parsePdfPerformance({provider:"Zurich",title:"Prisma 5 Fund",
  pages:doc(
   "Fund Performance","Cumulative Performance (to 30/09/2026)",
   "3 Months 6 Months 1 Year 3 Years 5 Years",
   "Prisma 5 Fund 0.9% 12.5% 17.1% 59.2% 57.8%",
   "Annualised Performance (to 30/09/2026)",
   "3 Years P.A. 5 Years P.A. 10 Years P.A. Since Launch P.A",
   "Prisma 5 Fund 16.8% 9.5% 10.7% 10.4%",
   "Notes: Annual management charges (AMC) apply. The fund performance shown is before the full AMC is applied on your policy."
  )
 });
 assert.equal(pdf.status,"extracted");
 assert.equal(pdf.returns.threeMonth,0.9);
 assert.equal(pdf.returns.sixMonth,12.5);
 assert.equal(pdf.returns.oneYear,17.1);
 assert.equal(pdf.cumulativeReturns.threeYear,59.2);
 assert.equal(pdf.returns.threeYear,16.8);
 assert.equal(pdf.returns.tenYear,10.7);
 assert.equal(pdf.returns.sinceLaunch,10.4);
 assert.equal(pdf.feeBasis,"before_full_policy_amc");
});
test("New Ireland annualised 3-year is not cumulative 3-year",()=>{
 const pdf=parsePdfPerformance({provider:"New Ireland",title:"PruFund Cautious",
  pages:doc(
   "Cumulative 1Mth 3Mth YTD 1Yr 3Yrs 5Yrs 10Yrs",
   "PruFund Cautious 0.4% 1.5% 4.8% 5.7% 22.4% - -",
   "Annualised 1Mth 3Mth YTD 1Yr 3Yrs (p.a.) 5Yrs (p.a.) 10Yrs (p.a.)",
   "PruFund Cautious 0.4% 1.5% 4.8% 5.7% 7.0% - -",
   "Calendar Year 2025 2024 2023 2022 2021 2020 2019",
   "PruFund Cautious 5.4% 9.9% 2.5% - - - -",
   "Fund Performance from 25-10-2022 to 09-11-2026 Source: Longboat Analytics"
  )
 });
 assert.equal(pdf.status,"extracted");
 assert.equal(pdf.returns.threeYear,7);
 assert.equal(pdf.cumulativeReturns.threeYear,22.4);
 assert.equal(pdf.returns.tenYear,null);
 assert.equal(pdf.asOf,"09-11-2026");
});
test("Standard Life percentage-free performance row and reporting month",()=>{
 const pdf=parsePdfPerformance({provider:"Standard Life",title:"Standard Life Ireland MyFolio Market IV",
  pages:doc(
   "Q3","2026","Standard Life Ireland MyFolio","Market IV Fund","September 2026",
   "Fund Performance *",
   "Performance is net of the fund’s Total Expense Ratio (annual management charge plus additional expenses).",
   "Calander Year","Year to","31/08/2026 (%)",
   "Standard Life Ireland MyFolio Market IV","Fund 17.9 8.3 14.6 4.4 -5.7",
   "Annualised Performance",
   "1 Month (%) 3 Months (%) YTD (%) 1 Year (%) 3 Years (% p.a) 5 Years (% p.a) S/L (% p.a)",
   "Standard Life Ireland MyFolio Market IV",
   "Fund 1.5 2.3 12.4 17.9 13.5 7.6 7.7",
   "Growth of €10,000 to 01/09/2026"
  )
 });
 assert.equal(pdf.status,"extracted");
 assert.equal(pdf.returns.oneMonth,1.5);
 assert.equal(pdf.returns.ytd,12.4);
 assert.equal(pdf.returns.threeYear,13.5);
 assert.equal(pdf.returns.tenYear,null);
 assert.equal(pdf.returns.sinceLaunch,7.7);
 assert.equal(pdf.asOf,"September 2026");
 assert.equal(pdf.asOfPrecision,"month");
 assert.equal(pdf.feeBasis,"net_of_ter");
});
test("Scanned PDFs without numerical text must never invent performance",()=>{
 const pdf=parsePdfPerformance({provider:"New Ireland",title:"World Index Unhedged (6)",pages:[" "]});
 assert.equal(pdf.status,"not_published");
 assert.ok(Object.values(pdf.returns).every(v=>v===null));
});
