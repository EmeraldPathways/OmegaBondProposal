import test from "node:test";
import assert from "node:assert/strict";
import {weightedPublishedPortfolioReturn} from "../src/lib/reconciliation/portfolio-performance.ts";

const record=(values:{threeYear?:number|null;fiveYear?:number|null;tenYear?:number|null},
  overrides:Record<string,unknown>={})=>({
  reported_returns:values,
  evidence:{displayedReturnsSource:"uploaded_workbook",
    publishedPerformance:{source:"uploaded_workbook",importId:"workbook-1",
      returnConvention:"cumulative",asOf:null,feeBasis:"not_stated",...overrides}}
});
const portfolio={weights:{fundA:60,fundB:40}};

test("weights entire cumulative-fund return without mislabelling annualised data",()=>{
  const rows={fundA:record({threeYear:30,fiveYear:45,tenYear:80}),
    fundB:record({threeYear:-5,fiveYear:10,tenYear:40})};
  assert.deepEqual(weightedPublishedPortfolioReturn(portfolio,rows,"threeYear"),
    {status:"available",returnPct:16,covered:2,selected:2});
  assert.equal(weightedPublishedPortfolioReturn(portfolio,rows,"fiveYear").returnPct,31);
  assert.equal(weightedPublishedPortfolioReturn(portfolio,rows,"tenYear").returnPct,64);
});

test("does not renormalise missing fund returns or interpret zero as missing",()=>{
  const rows={fundA:record({fiveYear:0,threeYear:0,tenYear:null}),
    fundB:record({fiveYear:null,threeYear:-10,tenYear:30})};
  assert.deepEqual(weightedPublishedPortfolioReturn(portfolio,rows,"fiveYear"),
    {status:"insufficient",returnPct:null,covered:1,selected:2});
  assert.equal(weightedPublishedPortfolioReturn(portfolio,rows,"threeYear").returnPct,-4);
  assert.equal(weightedPublishedPortfolioReturn(portfolio,rows,"tenYear").status,"insufficient");
});

test("empty and partial allocations never return a portfolio percentage",()=>{
  assert.equal(weightedPublishedPortfolioReturn({weights:{}},{},"fiveYear").status,"empty");
  assert.equal(weightedPublishedPortfolioReturn({weights:{fundA:80}},
    {fundA:record({fiveYear:30})},"fiveYear").status,"incomplete");
  assert.equal(weightedPublishedPortfolioReturn({weights:{fundA:-10,fundB:110}},
    {fundA:record({fiveYear:30}),fundB:record({fiveYear:40})},"fiveYear").status,"incomplete");
});

test("requires authenticated workbook source and cumulative return convention",()=>{
  const rows={fundA:record({fiveYear:30},{returnConvention:"annualised"}),
    fundB:record({fiveYear:40})};
  assert.equal(weightedPublishedPortfolioReturn(portfolio,rows,"fiveYear").status,"insufficient");
  rows.fundA.evidence.displayedReturnsSource="provider_pdf";
  assert.equal(weightedPublishedPortfolioReturn(portfolio,rows,"fiveYear").status,"insufficient");
});

test("prevents merging different source imports or incompatible dates and fees",()=>{
  for(const override of [{importId:"workbook-2"},{asOf:"2026-10-31"},{feeBasis:"net_of_amc"},
    {asOfPrecision:"month"}]){
    const rows={fundA:record({fiveYear:20}),fundB:record({fiveYear:40},override)};
    assert.equal(weightedPublishedPortfolioReturn(portfolio,rows,"fiveYear").status,"incompatible");
  }
});

test("a missing or invalid return cannot produce a number",()=>{
  assert.equal(weightedPublishedPortfolioReturn(portfolio,
    {fundA:record({threeYear:20})},"threeYear").status,"insufficient");
  assert.equal(weightedPublishedPortfolioReturn(portfolio,
    {fundA:record({threeYear:Number.NaN}),fundB:record({threeYear:20})},"threeYear").status,"insufficient");
});
