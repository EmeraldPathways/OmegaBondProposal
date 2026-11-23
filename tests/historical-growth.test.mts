import test from "node:test";
import assert from "node:assert/strict";
import {reconstructPortfolioGrowth} from "../src/lib/pdf/historical-growth.ts";
import type {ChartedFund} from "../src/lib/pdf/historical-growth.ts";
import type {SourceGrowthSeries} from "../src/lib/reconciliation/chart-digitize.ts";

const months=Array.from({length:12},(_,i)=>({
  date:new Date(Date.UTC(2024,i,1)).toISOString().slice(0,10),
  value:10000+i*100
}));
function sample(id:string,weight:number,valueScale=1):ChartedFund{
  const growthChart:SourceGrowthSeries={
    source:"digitized_pdf_graph",sourcePage:1,
    sourceLabel:"Growth of €10,000",method:"raster_trace_with_axis_calibration",
    estimated:true,currency:"EUR",
    observations:months.map(m=>({...m,value:m.value*valueScale})),
    quality:{dateAxisR2:.99,valueAxisR2:.99,pixelCoverage:.89,sampledMonths:12,confidence:.87}
  };
  return {id,name:id,weight,growthChart};
}
test("same-date growth curves are rebased and combine initial fund weights to an indicative portfolio index",()=>{
  const data=reconstructPortfolioGrowth([sample("Aviva",33),sample("Zurich",67)]);
  assert.ok(data);
  assert.equal(data.allFundsCovered,true);
  assert.equal(data.dates.length,12);
  assert.equal(data.portfolioLine?.[0],100);
  assert.equal(data.fundLines[0].values[0],100);
  assert.equal(data.portfolioLine?.[11],111);
});
test("a missing fund growth chart cannot be silently replaced with a fabricated line",()=>{
  const data=reconstructPortfolioGrowth([
    sample("Aviva",50),{id:"zurich",name:"Zurich",weight:50}
  ]);
  assert.ok(data);
  assert.equal(data.allFundsCovered,false);
  assert.equal(data.portfolioLine,null);
  assert.deepEqual(data.missingFunds,["Zurich"]);
});
test("charts with non-overlapping months cannot be combined",()=>{
  const a=sample("a",50),b=sample("b",50);
  b.growthChart!.observations=b.growthChart!.observations.map(p=>({
    ...p,date:p.date.replace("2024","2026")
  }));
  assert.equal(reconstructPortfolioGrowth([a,b]),null);
});
test("non-EUR charts never enter a mixed-currency portfolio reconstruction",()=>{
  const a=sample("EUR",50),b=sample("GBP",50);
  b.growthChart!.currency="GBP";
  const data=reconstructPortfolioGrowth([a,b]);
  assert.ok(data);
  assert.equal(data.portfolioLine,null);
  assert.deepEqual(data.missingFunds,["GBP"]);
});
